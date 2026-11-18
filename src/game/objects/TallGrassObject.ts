import * as Engine from '@/game/engine';

import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d, type FireLight3D } from '@/game/render3d/World3D';
import { TallGrassField, type Tuft } from '@/game/render3d/world/TallGrassField';
import type { WorldProp } from './WorldProp';

// O MATO ALTO (refeito do zero a pedido do autor, 2026-11-17): bloqueia o tile dele enquanto está em pé; a foice o
// corta rente (os tocos ficam, e o tile abre), e o fogo o queima até o mesmo toco, carbonizado. A colisão mora aqui
// (`blocking`), como nos outros props.
//
// O DESENHO não mora mais aqui. O mato era um billboard com quatro quadros de vento, o mesmo desenho em todo tile; agora
// cada tufo são uns doze FIOS sorteados de uma biblioteca de pixel art na paleta do tileset (render3d/tallGrassArt e
// tallGrassTuft), desenhados todos numa malha só pelo programa da decoração em pé (render3d/world/TallGrassField): a
// mesma brisa do vale, fio a fio, a mesma esteira de quem passa, a mesma rampa do bioma. Este objeto só diz ao campo em
// que estado o tufo dele está.

const BURN_MS = 1700; // as chamas sobem pelo fio, o tufo murcha e acinzenta, e assenta no toco carbonizado
const FIRE_FRAME_MS = 110;
const FIRE_KEYS = ['tiny-fire-0', 'tiny-fire-1', 'tiny-fire-2'] as const;

// O mato QUEIMA — ele não vira o desenho de um fogo. Os fios continuam fios e acinzentam, e as CHAMAS são os foguinhos
// separados, a mesma arte da fogueira e da tocha. Pega embaixo, no pé seco, e SOBE pelos fios (`climb`), enquanto o tufo
// MURCHA (afunda no chão) — três chamas em alturas e fases diferentes, para tremular em vez de pulsar.
const FIRE_SPOTS = [
  { ox: -0.2, elev: 0.06, scale: 0.4, phase: 0, climb: 0.34 },
  { ox: 0.18, elev: 0.12, scale: 0.34, phase: 1, climb: 0.46 },
  { ox: -0.02, elev: 0.02, scale: 0.5, phase: 2, climb: 0.6 },
] as const;
const WILT_FRAC = 0.48; // o tufo em chamas afunda até mais ou menos a metade antes de ceder

// Mato queimando É luz — a mesma luz de fogueira, mais baixa e mais breve.
const BURN_LIGHT_SCALE = 0.42;
const grassLightCurve = (p: number): number =>
  (p < 15 ? p / 15 : p < 70 ? 1 : Math.max(0, (100 - p) / 30));

/**
 * OS TOCOS SOMEM (pedido do autor, 2026-11-17: "fica como se fosse o pé do mato ali ainda [...] 2 segundos depois ele
 * já desaparece, para deixar o chão limpo, para que os objetos que eu coloque não fiquem impedidos"): o toco fica o
 * bastante para se ver o corte, e afunda na terra. O queimado fica (carvão é marca do fogo).
 */
const STUB_LINGER_MS = 2000;
const STUB_SINK_MS = 450;
/** O mato voltando sobe de um degrau para o outro neste tempo (objects/CampGrass, runtime/campRegrowth). */
const GROW_STEP_MS = 1100;

/** `growing`: o mato que volta, entre o broto e o quase (passa-se por ele; não bloqueia). */
type GrassState = 'tall' | 'burning' | 'cut' | 'growing';

export class TallGrassObject implements WorldProp {
  public readonly worldX: number;
  public readonly worldY: number;

  private readonly scene: Engine.Scene;
  private readonly field: TallGrassField;
  private readonly tuft: Tuft;
  private fires: Billboard3D[] = [];
  private fireLight?: FireLight3D;
  private fireFrame = 0;
  private state: GrassState = 'tall';
  private actionTimer?: Engine.Time.TimerEvent;
  private vanishTimer?: Engine.Time.TimerEvent;
  private readonly anim = { t: 0 };
  /** O degrau do mato que volta (0 = chão limpo; ver runtime/campRegrowth). */
  private level = 0;
  /** Quem quer saber do corte da foice (o mato do acampamento: objects/CampGrass anota o tile e a hora). */
  public onCut?: () => void;

  /**
   * O MATO VERDE DO ACAMPAMENTO (pedido do autor, 2026-11-17; runtime/homeGrid.CAMP_ZONE): úmido da beira do laguinho,
   * ele não pega fogo nem conduz fogo — só a foice da Morte o corta, e é cortando que o jogador abre espaço para o lar.
   */
  public readonly green: boolean;

  public constructor(scene: Engine.Scene, worldX: number, worldY: number, green = false) {
    this.scene = scene;
    this.worldX = worldX;
    this.worldY = worldY;
    this.green = green;
    this.field = TallGrassField.for(world3d().scene);
    this.tuft = this.field.add(worldX, worldY);
  }

  public get blocking(): boolean {
    return this.state === 'tall' || this.state === 'burning';
  }

  public get isTall(): boolean {
    return this.state === 'tall';
  }

  /** Voltando a crescer (o broto, até o joelho, quase): à vista, mas ainda se passa por ele. */
  public get isGrowing(): boolean {
    return this.state === 'growing';
  }

  /** Quanto o mato está crescido: 1 em pé, o degrau dele voltando, 0 cortado ou queimando. */
  public get growthLevel(): number {
    return this.state === 'tall' ? 1 : this.state === 'growing' ? this.level : 0;
  }

  /** Ardendo AGORA — enquanto durar, este tile e uma fonte de calor (ver GameScene.fireHeatAt). */
  public get isBurning(): boolean {
    return this.state === 'burning';
  }

  /** Os fios em pé, no mundo (de onde o corte os atira: scenes/game/MowFx). Vazio depois do corte. */
  public get blades(): ReturnType<TallGrassField['bladesOf']> {
    return this.state === 'tall' ? this.field.bladesOf(this.tuft) : [];
  }

  /**
   * A FOICE: o tufo cai inteiro de uma vez — a lâmina passa rente ao pé, e o que estava em pé vira os tocos do mesmo
   * tufo; dois segundos depois eles afundam na terra e o chão fica limpo. O voo das pontas cortadas é de quem corta
   * (MowFx), no mesmo instante. O tile abre já.
   */
  public cut(): boolean {
    if (this.state !== 'tall') return false;
    this.toCut(false);
    this.onCut?.();
    this.vanishTimer = this.scene.time.delayedCall(STUB_LINGER_MS, () => this.sinkAway(STUB_SINK_MS));
    return true;
  }

  /**
   * O MATO QUE VOLTA (objects/CampGrass): sobe até o degrau `level` (0 = chão limpo; entre 0 e 1 o broto, o joelho, o
   * quase — à vista e de passagem). É o tufo inteiro afundado na terra, e subindo dela: pixel inteiro, sem esticar.
   */
  public growTo(level: number, instant = false): void {
    if (this.state === 'burning' || this.state === 'tall') return;
    if (level <= 0) {
      if (this.state === 'growing') this.sinkAway(instant ? 0 : STUB_SINK_MS);
      return;
    }
    this.vanishTimer?.destroy();
    this.vanishTimer = undefined;
    const from = this.state === 'growing' ? 1 - this.level : 1;
    this.state = 'growing';
    this.level = Math.min(0.999, level);
    this.field.setChar(this.tuft, 0);
    this.field.setState(this.tuft, 'tall');
    this.riseTo(from, 1 - this.level, instant);
  }

  /** Em pé de novo: o tufo inteiro, que volta a bloquear o tile (quem chama já viu que ninguém fica preso). */
  public regrow(instant = false): void {
    if (this.state === 'burning' || this.state === 'tall') return;
    this.vanishTimer?.destroy();
    this.vanishTimer = undefined;
    const from = this.state === 'growing' ? 1 - this.level : 1;
    this.state = 'tall';
    this.level = 0;
    this.field.setChar(this.tuft, 0);
    this.field.setState(this.tuft, 'tall');
    this.riseTo(from, 0, instant);
  }

  /** O tufo sobe da terra de `from` a `to` (o quanto ainda está afundado, 1 = todo). */
  private riseTo(from: number, to: number, instant: boolean): void {
    this.scene.tweens.killTweensOf(this.anim);
    if (instant) {
      this.field.setSink(this.tuft, to);
      return;
    }
    this.anim.t = from;
    this.field.setSink(this.tuft, from);
    this.scene.tweens.add({
      targets: this.anim, t: to, duration: GROW_STEP_MS, ease: 'Cubic.easeOut',
      onUpdate: () => this.field.setSink(this.tuft, this.anim.t),
    });
  }

  /** O que está à vista (os tocos, o broto) afunda na terra e some: o chão fica limpo. */
  private sinkAway(ms: number): void {
    this.vanishTimer = undefined;
    this.scene.tweens.killTweensOf(this.anim);
    const done = (): void => {
      this.state = 'cut';
      this.level = 0;
      this.field.setState(this.tuft, 'gone');
      this.field.setSink(this.tuft, 0);
    };
    if (ms <= 0) { done(); return; }
    this.anim.t = this.state === 'growing' ? 1 - this.level : 0;
    this.scene.tweens.add({
      targets: this.anim, t: 1, duration: ms, ease: 'Quad.easeIn',
      onUpdate: () => this.field.setSink(this.tuft, this.anim.t),
      onComplete: done,
    });
  }

  /** O fogo (um item em chamas, um vizinho aceso): pega embaixo, sobe, murcha e carboniza. */
  public ignite(): boolean {
    if (this.state !== 'tall' || this.green) return false;
    this.state = 'burning';

    this.actionTimer?.destroy();
    for (let i = 0; i < FIRE_SPOTS.length; i += 1) {
      const spot = FIRE_SPOTS[i];
      const fire = world3d()
        .objects.addBillboard(FIRE_KEYS[i % FIRE_KEYS.length], 0, { emissive: true })
        .setPosition(this.worldX + spot.ox, this.worldY)
        .setElevation(spot.elev)
        .setDisplaySize(spot.scale, spot.scale * 1.25);
      this.fires.push(fire);
    }
    this.actionTimer = this.scene.time.addEvent({
      delay: FIRE_FRAME_MS,
      callback: this.advanceFire,
      callbackScope: this,
      loop: true,
    });

    // Luz de fogo de verdade enquanto arde — emprestada do pool, nunca uma luz THREE nova (ver World3D.FIRE_LIGHT_SLOTS).
    this.fireLight = world3d().lights.addFireLight(this.worldX, this.worldY, true);
    this.fireLight.setIntensityScale(0);

    // Um relógio só: os fios acinzentam, as chamas SOBEM do pé para a ponta, o tufo murcha e a luz segue a mesma curva.
    this.scene.tweens.killTweensOf(this.anim);
    this.scene.tweens.addCounter({
      from: 0,
      to: 100,
      duration: BURN_MS,
      onUpdate: (tween) => {
        const progress = tween.getValue() ?? 0;
        this.field.setChar(this.tuft, progress / 100);
        this.field.setSink(this.tuft, WILT_FRAC * (progress / 100));
        for (let i = 0; i < this.fires.length; i += 1) {
          this.fires[i].setElevation(FIRE_SPOTS[i].elev + FIRE_SPOTS[i].climb * (progress / 100));
        }
        this.fireLight?.setIntensityScale(BURN_LIGHT_SCALE * grassLightCurve(progress));
      },
      onComplete: () => this.toCut(true),
    });

    return true;
  }

  private advanceFire(): void {
    this.fireFrame += 1;
    this.fires.forEach((fire, i) => {
      fire.setTexture(FIRE_KEYS[(this.fireFrame + FIRE_SPOTS[i].phase) % FIRE_KEYS.length]);
    });
  }

  /** O broto que sobe da terra (o canteiro regado, ver PlantSpotObject): o tufo nasce de dentro do chão. */
  public sproutIn(): void {
    if (this.state !== 'tall') return;
    this.field.setSink(this.tuft, 1);
    this.anim.t = 1;
    this.scene.tweens.add({
      targets: this.anim,
      t: 0,
      duration: 700,
      ease: 'Cubic.easeOut',
      onUpdate: () => this.field.setSink(this.tuft, this.anim.t),
    });
  }

  /** Um esbarrão sem a foice: os fios do tile sacodem e voltam — o tufo continua sólido. */
  public shake(): void {
    if (this.state !== 'tall') return;
    world3d().objects.shakeGrass(this.worldX, this.worldY);
  }

  /** Já nasce cortado — o chão limpo: o mato do acampamento que o jogador cortou numa sessão de antes (o save lembra). */
  public settle(): void {
    if (this.state !== 'tall') return;
    this.toCut(false);
    this.sinkAway(0);
  }

  /** O tufo caiu: ficam os tocos do mesmo tufo — carbonizados, se foi o fogo. */
  private toCut(charred: boolean): void {
    this.state = 'cut';
    this.actionTimer?.destroy();
    this.actionTimer = undefined;
    this.fires.forEach((fire) => fire.destroy());
    this.fires = [];
    this.fireLight?.destroy(); // a curva já a apagou — só devolve o slot ao pool
    this.fireLight = undefined;
    this.scene.tweens.killTweensOf(this.anim);
    this.field.setState(this.tuft, 'stub');
    this.field.setSink(this.tuft, 0);
    this.field.setChar(this.tuft, charred ? 1 : 0);
  }

  public destroy(): void {
    this.actionTimer?.destroy();
    this.vanishTimer?.destroy();
    this.fires.forEach((fire) => fire.destroy());
    this.fires = [];
    this.fireLight?.destroy();
    this.fireLight = undefined;
    this.scene.tweens.killTweensOf(this.anim);
    this.field.remove(this.tuft);
  }
}

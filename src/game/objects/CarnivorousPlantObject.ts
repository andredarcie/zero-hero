import type Phaser from 'phaser';

import { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d, type FireLight3D } from '@/game/render3d/World3D';
import type { WorldProp } from './WorldProp';

// A PLANTA CARNÍVORA — a barreira de defesa que se PLANTA.
//
// Ela nasce do ciclo da fazenda (semente carnívora → canteiro → água) e diz a frase que
// nenhuma outra peça diz: **o corpo do inimigo vira recurso do terreno**. Todo bicho que
// ENCOSTA nela (para num dos 4 tiles vizinhos — quem decide e dispara é
// GameScene.updateCarnivorousPlants) é COMIDO: a bocarra abre, o corpo some goela adentro e
// a planta passa um tempo mastigando — a janela em que ela é só uma cerca. Ela não paga
// moeda nem deixa ossada: quem ficou com o corpo foi ela, e uma cova vizinha viraria uma
// fábrica de moedas AFK se o gole pagasse.
//
// O herói ela NÃO morde: é uma peça do jogador (a defesa cultivada) — para ele, ela é
// exatamente um mato alto que retribui: bloqueia o tile, conduz fogo (planta é combustível,
// a lei do mato), cai para a foice. As três saídas de quem plantou errado.
//
// A animação é a folha de 6 frames (carnivorous-plant.png, ver o .mjs): fechada → ABERTA
// (o bote) → engolida (a cabeça incha) → mastiga A/B (o bojo se debate) → e a murcha, o
// estado morto da foice/fogo. Cada tempo é a MESMA cabeça — a lição da flor-da-lua.

const SHEET = 'carnivorous-plant';
const FRAMES = { idle: 0, open: 1, gulped: 2, chewA: 3, chewB: 4, husk: 5 } as const;

const BODY_W = 0.98; // preenche o tile, nunca vaza dele (a regra fundamental do sprite)
const BODY_H = 0.98;

// O compasso do gole em TRÊS tempos: a bocarra ABRE e arma (o bote precisa ser visto — a lei
// do telegrafo, aplicada ao predador do jogador), a mordida PRENDE e o corpo é ARRASTADO
// pelo ar até a goela (DRAG_MS — a boca fica aberta o arrasto inteiro, recolhendo a presa),
// e ela só FECHA quando ele chega dentro. A mastigação é a recarga: uma planta que engolisse
// em cadência de metralhadora seria uma torreta, não uma armadilha.
const SNAP_MS = 170;
const GULP_POP_MS = 140;
const CHEW_MS = 2600;
const CHEW_FRAME_MS = 320;
const CUT_COLLAPSE_MS = 210; // a mesma queda do mato sob a foice

// Queima como o mato (é planta): chamas separadas que sobem, o corpo charreando, luz
// emprestada do pool — nunca uma luz nova (a lei mais cara da casa).
const BURN_MS = 2200; // mais carnuda que o mato (1700): arde um fôlego a mais
const FIRE_FRAME_MS = 110;
const FIRE_KEYS = ['tiny-fire-0', 'tiny-fire-1', 'tiny-fire-2'] as const;
const FIRE_SPOTS = [
  { ox: -0.18, elev: 0.08, scale: 0.42, phase: 0, climb: 0.4 },
  { ox: 0.16, elev: 0.16, scale: 0.36, phase: 1, climb: 0.5 },
] as const;
const BURN_LIGHT_SCALE = 0.5; // entre o mato (0.42) e o arbusto (0.55): tem corpo pra arder
const CHARRED_TINT = 0x585450;

type PlantState = 'ready' | 'snapping' | 'chewing' | 'burning' | 'dead';

export class CarnivorousPlantObject implements WorldProp {
  public readonly worldX: number;
  public readonly worldY: number;

  private readonly scene: Phaser.Scene;
  private readonly sprite: Billboard3D;
  private state: PlantState = 'ready';
  private fires: Billboard3D[] = [];
  private fireLight?: FireLight3D;
  private fireFrame = 0;
  private fireTimer?: Phaser.Time.TimerEvent;
  private chewTimer?: Phaser.Time.TimerEvent;
  private readonly eatTimers: Phaser.Time.TimerEvent[] = [];

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number) {
    this.scene = scene;
    this.worldX = worldX;
    this.worldY = worldY;
    // Em pé como o mato: um corpo que ocupa o tile e projeta sombra — ela É um obstáculo.
    this.sprite = world3d()
      .addBillboard(SHEET, FRAMES.idle, { groundShadow: { alpha: 0.4 } })
      .setPosition(worldX, worldY)
      .setDisplaySize(BODY_W, BODY_H);
    this.breathe();
  }

  public get blocking(): boolean {
    return this.state !== 'dead';
  }

  /** Pronta para o bote: só um corpo por vez — mastigar é a recarga (e a janela de furá-la). */
  public get readyToEat(): boolean {
    return this.state === 'ready';
  }

  /** Ardendo AGORA — enquanto durar, este tile é uma fonte de calor (ver fireHeatAt). */
  public get isBurning(): boolean {
    return this.state === 'burning';
  }

  /** Quanto dura o ARRASTO da presa até a boca — a cena passa isto ao EnemyBase.consume,
   *  então o corpo chegando e a bocarra fechando são o MESMO relógio (uma fonte só). */
  public static readonly DRAG_MS = 300;

  /**
   * O BOTE, em três tempos. `dirX` é de onde o corpo vem (só o eixo X inclina a cabeça — um
   * bote pro norte ou pro sul lê pela abertura, não pelo tombo).
   *
   *   1. ABRE e arma (SNAP_MS): a bocarra escancara inclinada pro corpo.
   *   2. `onBite` — a mordida PRENDE: é aqui que a cena inicia o arrasto do corpo
   *      (EnemyBase.consume, com DRAG_MS). A boca fica ABERTA enquanto recolhe a presa,
   *      endireitando o pescoço conforme puxa.
   *   3. `onGulp` — o corpo CHEGOU: a bocarra fecha em cima dele (o frame engolido), espreme
   *      fino-e-alto e assenta gorda. Daí a mastigação, e de volta à espreita.
   */
  public eat(dirX: number, onBite: () => void, onGulp?: () => void): boolean {
    if (this.state !== 'ready') return false;
    this.state = 'snapping';
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite
      .setTexture(SHEET, FRAMES.open)
      .setAngle(12 * Math.sign(dirX))
      .setDisplaySize(BODY_W * 1.06, BODY_H * 1.04); // a cabeça se ARMA — cresce um fio no bote
    this.eatTimers.push(this.scene.time.delayedCall(SNAP_MS, () => {
      onBite(); // a mordida prendeu: o arrasto do corpo começa AGORA, boca aberta
      this.scene.tweens.add({
        targets: this.sprite,
        angle: 0,
        duration: CarnivorousPlantObject.DRAG_MS,
        ease: 'Sine.easeOut', // o pescoço endireita conforme RECOLHE a presa
      });
    }));
    this.eatTimers.push(this.scene.time.delayedCall(SNAP_MS + CarnivorousPlantObject.DRAG_MS, () => {
      onGulp?.(); // o baque da bocarra fechando — a cena põe o som e o tremor aqui
      this.sprite
        .setTexture(SHEET, FRAMES.gulped)
        .setAngle(0)
        .setDisplaySize(BODY_W * 0.88, BODY_H * 1.12); // engole: espreme fino e alto...
      this.scene.tweens.add({
        targets: this.sprite,
        displayWidth: BODY_W,
        displayHeight: BODY_H,
        duration: GULP_POP_MS,
        ease: 'Back.easeOut', // ...e assenta gorda — o peso do corpo chegando ao bucho
      });
      this.startChewing();
    }));
    return true;
  }

  private startChewing(): void {
    this.state = 'chewing';
    let side = false;
    this.chewTimer = this.scene.time.addEvent({
      delay: CHEW_FRAME_MS,
      callback: () => {
        // O bojo se DEBATE de um lado pro outro — a mesma cabeça, o mesmo bojo, deslocado
        // (micro-variação, nunca silhueta nova). O ângulo acompanha: mastigar tem esforço.
        side = !side;
        if (this.state !== 'chewing') return;
        this.sprite
          .setTexture(SHEET, side ? FRAMES.chewA : FRAMES.chewB)
          .setAngle(side ? -4 : 4);
      },
      loop: true,
    });
    this.eatTimers.push(this.scene.time.delayedCall(CHEW_MS, () => {
      if (this.state !== 'chewing') return;
      this.chewTimer?.destroy();
      this.chewTimer = undefined;
      this.state = 'ready';
      this.sprite.setTexture(SHEET, FRAMES.idle).setAngle(0);
      this.breathe();
    }));
  }

  /** Fogo (a lei do mato: planta é combustível): arde, charreia e cai na murcha queimada. */
  public ignite(): boolean {
    if (this.state === 'burning' || this.state === 'dead') return false;
    this.haltMeal();
    this.state = 'burning';
    for (let i = 0; i < FIRE_SPOTS.length; i += 1) {
      const spot = FIRE_SPOTS[i];
      this.fires.push(world3d()
        .addBillboard(FIRE_KEYS[i % FIRE_KEYS.length], 0, { emissive: true })
        .setPosition(this.worldX + spot.ox, this.worldY)
        .setElevation(spot.elev)
        .setDisplaySize(spot.scale, spot.scale * 1.25));
    }
    this.fireTimer = this.scene.time.addEvent({
      delay: FIRE_FRAME_MS,
      callback: () => {
        this.fireFrame += 1;
        this.fires.forEach((fire, i) => {
          fire.setTexture(FIRE_KEYS[(this.fireFrame + FIRE_SPOTS[i].phase) % FIRE_KEYS.length]);
        });
      },
      loop: true,
    });
    this.fireLight = world3d().addFireLight(this.worldX, this.worldY, true);
    this.fireLight.setIntensityScale(0);
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.addCounter({
      from: 0,
      to: 100,
      duration: BURN_MS,
      onUpdate: (tween) => {
        const p = (tween.getValue() ?? 0) / 100;
        const shade = Math.round(255 - (255 - 88) * p); // branco → cinza-brasa, como o mato
        this.sprite.setTint((shade << 16) | (shade << 8) | shade);
        for (let i = 0; i < this.fires.length; i += 1) {
          this.fires[i].setElevation(FIRE_SPOTS[i].elev + FIRE_SPOTS[i].climb * p);
        }
        this.fireLight?.setIntensityScale(BURN_LIGHT_SCALE * (p < 0.2 ? p / 0.2 : p < 0.7 ? 1 : (1 - p) / 0.3));
      },
      onComplete: () => this.toDead(true),
    });
    return true;
  }

  /** A foice: o predador cai como o mato cai — colapsa e vira a murcha (sem colheita). */
  public cut(): boolean {
    if (this.state === 'burning' || this.state === 'dead') return false;
    this.haltMeal();
    this.state = 'snapping'; // trava novos botes durante a queda
    this.sprite.setDepthLayer('ground'); // o tile abre JÁ — a mesma regra do corte do mato
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.add({
      targets: this.sprite,
      displayHeight: BODY_H * 0.2,
      angle: 10,
      duration: CUT_COLLAPSE_MS,
      ease: 'Quad.easeIn',
      onComplete: () => this.toDead(false),
    });
    return true;
  }

  /** Brotando do monte regado — o mesmo overshoot vegetal do mato plantado. */
  public sproutIn(): void {
    if (this.state !== 'ready') return;
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setDisplaySize(BODY_W * 0.15, BODY_H * 0.15);
    this.scene.tweens.add({
      targets: this.sprite,
      displayWidth: BODY_W,
      displayHeight: BODY_H,
      duration: 700,
      ease: 'Back.easeOut',
      onComplete: () => this.breathe(),
    });
  }

  /** Esbarrão/golpe que não é foice nem fogo: ela se retesa — sólida, viva, de mau humor. */
  public shake(): void {
    if (this.state !== 'ready') return;
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.add({
      targets: this.sprite,
      angle: { from: -6, to: 6 },
      duration: 55,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.easeInOut',
      onComplete: () => { this.sprite.setAngle(0); this.breathe(); },
    });
  }

  // A respiração de espreita: um vaivém lento de altura, o corpo dizendo "viva" sem gastar
  // frame de sheet. Morre em todo killTweensOf e cada volta ao repouso a re-arma.
  private breathe(): void {
    this.scene.tweens.add({
      targets: this.sprite,
      displayHeight: BODY_H * 0.96,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private haltMeal(): void {
    for (const timer of this.eatTimers) timer.remove();
    this.eatTimers.length = 0;
    this.chewTimer?.destroy();
    this.chewTimer = undefined;
  }

  private toDead(charred: boolean): void {
    this.state = 'dead';
    this.fireTimer?.destroy();
    this.fireTimer = undefined;
    this.fires.forEach((fire) => fire.destroy());
    this.fires = [];
    this.fireLight?.destroy();
    this.fireLight = undefined;
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite
      .setTexture(SHEET, FRAMES.husk)
      .setDisplaySize(BODY_W, BODY_H)
      .setAngle(0)
      .setDepthLayer('ground');
    if (charred) this.sprite.setTint(CHARRED_TINT).setAlpha(0.85);
  }

  public destroy(): void {
    this.haltMeal();
    this.fireTimer?.destroy();
    this.fires.forEach((fire) => fire.destroy());
    this.fires = [];
    this.fireLight?.destroy();
    this.fireLight = undefined;
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
  }
}

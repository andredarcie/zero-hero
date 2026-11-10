import * as Engine from '@/game/engine';

import { ASSET_KEYS, ITEM_FRAMES, SCENE_DEPTHS } from '@/game/constants';
import { SwordChop, SLASH_BLADE_FACTOR, TRAIL_ALPHAS, swingLitTint, CHOP_REAR_MS, CHOP_HANG_MS, CHOP_DRIVE_MS, CHOP_RECOIL_MS, CHOP_FADE_MS } from './SwordChop';
export { AXE_STUCK_MS } from './SwordChop';

const SLASH_DURATION    = 155;
const SLASH_SWEEP_DEG   = 155;   // wide dramatic arc
const SLASH_FADE_DURATION = 65;

/**
 * O RAIO DO GOLPE: a que distância do herói o PUNHO orbita durante o giro da lâmina.
 *
 * É o único jeito honesto de cobrir mais chão — o braço estende, a espada continua sendo a espada.
 * Aumentar o sprite (`SLASH_BLADE_FACTOR`) para alcançar mais longe foi tentado e desfeito: uma
 * espada que cresce ao ser sacada não é uma espada, e o olho pega isso na hora. Mesma razão pela
 * qual não há crescente desenhado atrás dela: qualquer forma que não seja a arte da arma lê como
 * efeito colado por cima.
 *
 * Ele é o CONTRATO VISUAL do alcance (`SWING_ARC_NEAR` + `SWING_ARC_FAR`, na GameScene): punho a
 * 0,62 tile + lâmina de 1,08 põe a ponta a ~1,7 tiles do herói, que é dentro da segunda fileira.
 * Mexer no acerto sem mexer aqui reabre a queixa que a foice de 155° criou quando o acerto valia
 * um tile só — ver o comentário do SWING_ARC.
 */
const SLASH_ORBIT_FACTOR = 0.62;

// ── O RASTRO ─────────────────────────────────────────────────────────────────
//
// Cópias do PRÓPRIO sprite da espada, abertas atrás do gume ao longo do arco — motion blur de
// desenho animado, e nada além da arte da arma. Eram quatro fantasmas juntinhos e sumiam contra o
// mato; agora são oito espalhados pelo arco inteiro, e é essa fila que mostra por onde a lâmina
// passou (e, portanto, o que ela pegou).
const TRAIL_COUNT  = 8;
const TRAIL_DEPTH  = SCENE_DEPTHS.player; // behind main sprite

// ── O GIRO ───────────────────────────────────────────────────────────────────
//
// A lamina rodopiante (`A Link to the Past`, 1991): segure o botao, o gume junta forca e, solto,
// o heroi gira 360° cortando TUDO em volta. E a resposta a uma coisa que o golpe direcional nao
// responde — estar cercado —, e por isso ela nao e "a espada, so que mais forte": e a decisao de
// gastar meio segundo parado no meio de uma matilha para atingir os oito vizinhos de uma vez.
//
// O arco passa de uma volta inteira de proposito. Uma volta exata comeca e termina no mesmo
// angulo, e o olho le "a espada tremeu"; a volta e meia le como rodopio.
const SPIN_SWEEP_DEG = 540;
const SPIN_MS = 330;
const SPIN_FADE_MS = 90;
/** Espacamento dos fantasmas ao longo do giro. Bem maior que o do golpe: aqui a lamina voa. */
const SPIN_TRAIL_DEG = 26;

/** When the head lands, counted from the swing starting: the blow belongs on this frame. */
export const CHOP_IMPACT_MS = CHOP_REAR_MS + CHOP_HANG_MS + CHOP_DRIVE_MS;
/** When the head starts falling — where the whoosh belongs, not at the sleepy wind-up. */
export const CHOP_DRIVE_AT_MS = CHOP_REAR_MS + CHOP_HANG_MS;
/** The whole strike, wind-up to fade: how long the pick is out of the hero's hands. */
export const CHOP_TOTAL_MS = CHOP_IMPACT_MS + CHOP_RECOIL_MS + CHOP_FADE_MS;

export class SwordSlash {
  public readonly scene: Engine.Scene;
  public readonly sprite: Engine.GameObjects.Sprite;
  public readonly trails: Engine.GameObjects.Sprite[];
  private onFire = false;
  /** Light where the swing happens, 0..1 — see SWING_DARK. Set by the caller before each swing. */
  public lightLevel = 1;
  /** A cor com que a lâmina foi pintada neste gesto — para onde `flashHit` a devolve. */
  public bladeTint = 0xffffff;

  // kept across onUpdate so we don't recalculate each frame
  private slashHandleX = 0;
  private slashHandleY = 0;
  private slashSize    = 0;
  private trailStep    = 0;

  // The chop's pose, tweened as plain numbers and written onto the sprite each frame (see above).
  // `trail` is how far the motion blur has faded in (0 on the wind-up, 1 through the drive).
  public readonly chop$ = { angle: 0, handX: 0, handY: 0, size: 0, trail: 0, spin: 1 };
  /** O golpe de machado (ver SwordChop). */
  private readonly chopper = new SwordChop(this);

  public constructor(scene: Engine.Scene) {
    this.scene = scene;

    const makeSprite = (depth: number) =>
      scene.add
        .sprite(0, 0, ASSET_KEYS.swordItem, ITEM_FRAMES.swordIdle)
        // pivot at bottom-centre = pommel/handle, blade extends upward
        .setOrigin(0.5, 1.0)
        .setDepth(depth)
        .setAlpha(0)
        .setVisible(false);

    this.sprite = makeSprite(SCENE_DEPTHS.player + 1);
    this.trails = Array.from({ length: TRAIL_COUNT }, () => makeSprite(TRAIL_DEPTH));
  }

  public setOnFire(value: boolean): void {
    this.onFire = value;
  }

  /** O golpe de machado (ver SwordChop.chop). */
  public chop(...args: Parameters<SwordChop['chop']>): void {
    this.chopper.chop(...args);
  }

  /** How lit the tile the hero swings from is (World3D.lightLevelAt), 0..1. */
  public setLightLevel(level: number): void {
    this.lightLevel = level;
  }

  /**
   * dx/dy: cardinal attack direction (-1, 0, or 1). Pass `item` to swing a different sprite
   * (e.g. the key on a door, a tool) with the exact same arc — its own texture/frame, and
   * only burning if the item says so (e.g. the flaming wood club).
   */
  public slash(
    playerScreenX: number,
    playerScreenY: number,
    dx: number,
    dy: number,
    tileSize: number,
    item?: { texture: string; frame: number; onFire?: boolean; flipX?: boolean; flipY?: boolean },
  ): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.killTweensOf(this.chop$); // a chop still in the air would fight for the sprite
    this.trails.forEach(t => this.scene.tweens.killTweensOf(t));

    // blade points "up" in sprite-space → +90° rotates it to face attack direction
    // Normalize to [-180, 180] so startAngle stays in that range — the engine's angle
    // getter wraps to [-180, 180], so if startAngle > 180 the tween reads a wrapped
    // value and rotates the long way around (full spin bug on left-facing attacks).
    let attackAngleDeg = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    if (attackAngleDeg > 180) attackAngleDeg -= 360;
    const startAngle     = attackAngleDeg - SLASH_SWEEP_DEG / 2;
    const endAngle       = attackAngleDeg + SLASH_SWEEP_DEG / 2;

    // O punho orbita LONGE do corpo (ver SLASH_ORBIT_FACTOR): é assim que o golpe cobre mais chão
    // sem que a arte da espada mude de tamanho.
    const handleDist = tileSize * SLASH_ORBIT_FACTOR;
    const size       = Math.max(12, Math.floor(tileSize * SLASH_BLADE_FACTOR));

    // handle stays fixed — only the angle changes
    this.slashHandleX = playerScreenX + dx * handleDist;
    this.slashHandleY = playerScreenY + dy * handleDist;
    this.slashSize    = size;
    // Os fantasmas se abrem pelo arco INTEIRO (e não amontoados atrás do gume): é a fila deles que
    // diz por onde a lâmina passou.
    this.trailStep    = SLASH_SWEEP_DEG / (TRAIL_COUNT + 1);

    // A custom item burns only when it says so (flaming wood); the bare sword uses the
    // slash animator's own onFire state.
    const onFire = item ? (item.onFire ?? false) : this.onFire;
    const texture = item ? item.texture : (onFire ? ASSET_KEYS.swordOnFire : ASSET_KEYS.swordItem);
    const frame = item ? item.frame : ITEM_FRAMES.swordIdle;

    // Single-edged tools (the axe) need mirroring so the cutting edge leads the swing instead
    // of raking with the back of the blade.
    const flipX = item?.flipX ?? false;
    // A arte que tem a parte que TRABALHA embaixo (a pá: o cabo em T em cima, o metal embaixo) vira de ponta-cabeça:
    // o golpe leva o alto do desenho para a frente, e sem isto quem cavava era o cabo (o autor viu).
    const flipY = item?.flipY ?? false;

    // A BURNING item keeps its own warm tint at full strength: it is a light source, not a lit
    // surface, so the night must not dim it. Everything else stands in the world's light.
    const litTint = swingLitTint(this.lightLevel);
    // hide trails until first onUpdate (they mirror the main sprite's texture/frame)
    const trailTint = onFire ? 0xff5500 : litTint;
    this.trails.forEach(t => t.setTexture(texture, frame).setFlip(flipX, flipY).setAlpha(0).setVisible(false).setTint(trailTint));

    this.bladeTint = onFire ? 0xffaa44 : litTint;
    this.sprite
      .setTexture(texture, frame)
      .setFlip(flipX, flipY)
      .setTint(this.bladeTint)
      .setPosition(this.slashHandleX, this.slashHandleY)
      .setDisplaySize(size * 1.20, size * 1.20) // starts 20% bigger for impact pop
      .setAngle(startAngle)
      .setAlpha(1)
      .setVisible(true);

    const targetScale = this.sprite.scaleX / 1.20;

    this.scene.tweens.add({
      targets: this.sprite,
      angle:  endAngle,
      scaleX: targetScale,
      scaleY: targetScale,
      duration: SLASH_DURATION,
      ease: 'Power3.easeOut', // fast launch, decelerates into the hit
      onUpdate: () => { this.updateTrails(); },
      onComplete: () => {
        // fade main + trails together
        this.scene.tweens.add({
          targets: [this.sprite, ...this.trails],
          alpha: 0,
          duration: SLASH_FADE_DURATION,
          onComplete: () => {
            this.sprite.setVisible(false);
            this.trails.forEach(t => t.setVisible(false));
          },
        });
      },
    });
  }

  private updateTrails(): void {
    const currentAngle = this.sprite.angle;
    this.trails.forEach((t, i) => {
      t.setPosition(this.slashHandleX, this.slashHandleY)
        .setDisplaySize(this.slashSize, this.slashSize)
        .setAngle(currentAngle - this.trailStep * (i + 1))
        .setAlpha(TRAIL_ALPHAS[i])
        .setVisible(true);
    });
  }

  /**
   * A LAMINA RODOPIANTE (ver as notas em `SPIN_SWEEP_DEG`): uma volta e meia em torno do heroi,
   * com o punho no centro dele e os fantasmas abertos atras do gume.
   *
   * O angulo e tweenado num objeto de rascunho, e nao no `angle` do sprite, pela mesma armadilha
   * que o `chop` documenta: o getter do motor embrulha em [-180, 180], entao um tween que passa
   * de 180 le um valor embrulhado no frame seguinte e volta girando pelo caminho longo.
   */
  public spin(playerScreenX: number, playerScreenY: number, tileSize: number): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.killTweensOf(this.chop$);
    this.trails.forEach(t => this.scene.tweens.killTweensOf(t));

    const size = Math.max(12, Math.floor(tileSize * SLASH_BLADE_FACTOR));
    const s = this.chop$;
    s.spin = 1;
    s.angle = -90;                 // comeca apontando pro leste e roda no sentido horario
    s.handX = playerScreenX;
    s.handY = playerScreenY;
    s.size = size;
    s.trail = 1;                   // o rastro existe do primeiro frame: o giro nao tem wind-up

    const litTint = swingLitTint(this.lightLevel);
    const texture = this.onFire ? ASSET_KEYS.swordOnFire : ASSET_KEYS.swordItem;
    this.bladeTint = this.onFire ? 0xffaa44 : litTint;
    this.sprite
      .setTexture(texture, ITEM_FRAMES.swordIdle)
      .setFlip(false, false)
      .setTint(this.bladeTint)
      .setAlpha(1)
      .setVisible(true);
    this.trails.forEach(t => t
      .setTexture(texture, ITEM_FRAMES.swordIdle)
      .setFlip(false, false)
      .setTint(this.onFire ? 0xff5500 : litTint));
    this.applySpin();

    this.scene.tweens.add({
      targets: s,
      angle: s.angle + SPIN_SWEEP_DEG,
      duration: SPIN_MS,
      ease: 'Sine.easeOut', // sai estourado e assenta: a forca ja estava carregada, ela so escapa
      onUpdate: () => this.applySpin(),
      onComplete: () => {
        this.scene.tweens.add({
          targets: [this.sprite, ...this.trails],
          alpha: 0,
          duration: SPIN_FADE_MS,
          onComplete: () => {
            this.sprite.setVisible(false);
            this.trails.forEach(t => t.setVisible(false));
          },
        });
      },
    });
  }

  /** Escreve a pose do giro na lamina e nos fantasmas abertos atras dela. */
  private applySpin(): void {
    const s = this.chop$;
    this.sprite
      .setPosition(s.handX, s.handY)
      .setDisplaySize(s.size, s.size)
      .setAngle(s.angle);
    this.trails.forEach((t, i) => {
      t.setPosition(s.handX, s.handY)
        .setDisplaySize(s.size, s.size)
        .setAngle(s.angle - SPIN_TRAIL_DEG * (i + 1))
        .setAlpha(TRAIL_ALPHAS[i])
        .setVisible(true);
    });
  }

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.scene.tweens.killTweensOf(this.chop$);
    this.trails.forEach(t => {
      this.scene.tweens.killTweensOf(t);
      t.destroy();
    });
    this.sprite.destroy();
  }
}

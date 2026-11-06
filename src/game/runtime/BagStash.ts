import Phaser from 'phaser';

import { SCENE_DEPTHS } from '@/game/constants';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

/**
 * GUARDAR NA BOLSA DE COURO (pedido do autor): colhido o cogumelo, o herói mostra a bolsa do lado direito e
 * o cogumelo na mão do lado esquerdo, e passa um para dentro do outro. O cogumelo dá um impulso, voa em arco
 * por cima da cabeça girando, a bolsa engole com um tranco (achata e estica), solta uma poeirinha de couro,
 * fecha a aba com o fecho dourado, balança e some. É o lugar onde o jogador VÊ que a colheita foi guardada —
 * por isso substituiu o balão de pensamento com a cesta.
 *
 * Como o balão de pensamento, mora no Phaser e se ancora no corpo DESENHADO do herói (`visualWorld`): a
 * cena chama `render` a cada quadro com essa âncora. O relógio é dos tweens; `render` só posiciona.
 * Os sons vêm por callback, para esta classe não conhecer o áudio.
 */

const BAG_OPEN = 'bag-stash-open';
const BAG_SHUT = 'bag-stash-shut';
const DUST = 'bag-stash-dust';
const ART = 16;

const INK = '#2a1a12';
const LEATHER = ['#c48a52', '#9a6538', '#6e4426', '#4a2c1a'] as const;
const STRAP = '#5a3820';
const BRASS = ['#f2d27a', '#c99a3e'] as const;

const paintBag = (ctx: CanvasRenderingContext2D, open: boolean): void => {
  const rect = (c: string, x: number, y: number, w: number, h: number): void => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  // A alça, um arco por cima.
  rect(INK, 4, 0, 8, 1);
  rect(INK, 3, 1, 1, 4);
  rect(INK, 12, 1, 1, 4);
  rect(STRAP, 4, 1, 8, 1);
  rect(STRAP, 4, 2, 1, 3);
  rect(STRAP, 11, 2, 1, 3);
  // O corpo: um saco redondo embaixo, a luz vindo da esquerda.
  rect(INK, 2, 5, 12, 10);
  rect(INK, 1, 7, 14, 7);
  rect(INK, 3, 15, 10, 1);
  rect(LEATHER[1], 2, 6, 12, 9);
  rect(LEATHER[0], 3, 7, 3, 6);
  rect(LEATHER[0], 2, 8, 1, 4);
  rect(LEATHER[2], 11, 7, 2, 7);
  rect(LEATHER[2], 4, 14, 8, 1);
  rect(LEATHER[3], 13, 8, 1, 5);
  // A costura da frente.
  for (let x = 4; x <= 11; x += 2) rect(LEATHER[3], x, 13, 1, 1);
  if (open) {
    // Aberta: a boca escura e a aba jogada para trás, por cima da alça.
    rect(INK, 3, 4, 10, 3);
    rect(LEATHER[3], 4, 5, 8, 1);
    rect('#24140c', 4, 6, 8, 1);
    rect(INK, 4, 2, 8, 2);
    rect(LEATHER[2], 5, 2, 6, 1);
  } else {
    // Fechada: a aba desce sobre a frente, com o fecho de latão no meio.
    rect(INK, 2, 5, 12, 6);
    rect(LEATHER[0], 3, 5, 10, 1);
    rect(LEATHER[1], 3, 6, 10, 3);
    rect(LEATHER[2], 3, 9, 10, 1);
    rect(INK, 6, 9, 4, 3);
    rect(BRASS[0], 7, 10, 2, 1);
    rect(BRASS[1], 8, 10, 1, 1);
  }
};

const ensureArt = (scene: Phaser.Scene): void => {
  for (const [key, open] of [[BAG_OPEN, true], [BAG_SHUT, false]] as const) {
    if (scene.textures.exists(key)) continue;
    const canvas = document.createElement('canvas');
    canvas.width = ART;
    canvas.height = ART;
    const ctx = canvas.getContext('2d');
    if (ctx) paintBag(ctx, open);
    scene.textures.addCanvas(key, canvas);
  }
  if (!scene.textures.exists(DUST)) {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;
    const ctx = canvas.getContext('2d');
    if (ctx) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 2, 2); }
    scene.textures.addCanvas(DUST, canvas);
  }
};

/** Onde cada coisa fica, em frações de tile a partir do pé do herói (x para a direita, y para cima). */
const BAG_AT = { x: 0.62, y: 0.3 };
const HAND_AT = { x: -0.62, y: 0.62 };
/** O topo do arco por cima da cabeça. */
const ARC_TOP = 1.45;
/** Tamanhos em frações de tile. */
const BAG_SIZE = 0.62;
const ITEM_SIZE = 0.5;

const POP_MS = 220;
const HOLD_MS = 260;
const WIND_MS = 120;
const FLY_MS = 480;
const GULP_MS = 160;
const SHUT_DELAY_MS = 140;
const WOBBLE_MS = 420;
const FADE_MS = 260;

export interface BagStashSounds {
  /** A bolsa aparece e se abre. */
  open: () => void;
  /** O cogumelo sai da mão (o impulso). */
  toss: () => void;
  /** Entrou: o baque surdo no couro. */
  land: () => void;
  /** A aba fecha e o fecho estala. */
  clasp: () => void;
}

interface Mote { img: Phaser.GameObjects.Image; x: number; y: number; vx: number; vy: number; age: number; life: number }

export class BagStash {
  private readonly bag: Phaser.GameObjects.Image;
  private readonly item: Phaser.GameObjects.Image;
  private readonly motes: Mote[] = [];
  /** Posições em frações de tile, relativas ao pé do herói. A cena projeta a cada quadro. */
  private readonly itemPos = { x: HAND_AT.x, y: HAND_AT.y };
  private readonly bagScale = { x: 0, y: 0 };
  private itemScale = 0;
  private itemSpin = 0;
  private bagTilt = 0;
  private alpha = 1;
  private done = false;
  private readonly timers: Phaser.Time.TimerEvent[] = [];

  public constructor(
    private readonly scene: Phaser.Scene,
    itemTexture: string,
    itemFrame: number,
    private readonly sounds: BagStashSounds,
    private readonly onDone: () => void,
  ) {
    ensureArt(scene);
    const depth = SCENE_DEPTHS.player + 2;
    this.bag = scene.add.image(-9999, -9999, BAG_OPEN).setOrigin(0.5, 1).setDepth(depth);
    this.item = scene.add.image(-9999, -9999, itemTexture, itemFrame).setOrigin(0.5).setDepth(depth + 1);
    this.play();
  }

  /** Ainda está na tela? A janela do playtest sobre esta peça. */
  public get active(): boolean {
    return !this.done;
  }

  private after(ms: number, fn: () => void): void {
    this.timers.push(this.scene.time.delayedCall(ms, fn));
  }

  private play(): void {
    const tw = this.scene.tweens;
    // 1. A bolsa e o cogumelo aparecem, cada um de um lado (o pop passa do tamanho e assenta).
    this.sounds.open();
    tw.add({ targets: this.bagScale, x: 1, y: 1, duration: POP_MS, ease: 'Back.easeOut' });
    tw.add({ targets: this, itemScale: 1, duration: POP_MS, delay: 60, ease: 'Back.easeOut' });
    // 2. O impulso: o cogumelo afunda na mão (antecipação) e é lançado.
    let t = POP_MS + HOLD_MS;
    this.after(t, () => {
      tw.add({ targets: this.itemPos, y: HAND_AT.y - 0.08, duration: WIND_MS, yoyo: false, ease: 'Sine.easeIn' });
    });
    t += WIND_MS;
    // 3. O voo: um arco por cima da cabeça, girando uma volta e encolhendo para caber na boca da bolsa.
    this.after(t, () => {
      this.sounds.toss();
      const from = { x: this.itemPos.x, y: this.itemPos.y };
      const to = { x: BAG_AT.x, y: BAG_AT.y + BAG_SIZE * 0.45 };
      const arc = { k: 0 };
      tw.add({
        targets: arc,
        k: 1,
        duration: FLY_MS,
        ease: 'Sine.easeInOut',
        onUpdate: () => {
          const k = arc.k;
          this.itemPos.x = from.x + (to.x - from.x) * k;
          // A parábola: sobe até ARC_TOP no meio e desce na boca da bolsa.
          this.itemPos.y = from.y + (to.y - from.y) * k + 4 * (ARC_TOP - Math.max(from.y, to.y)) * k * (1 - k);
          this.itemSpin = k * Math.PI * 2;
          this.itemScale = 1 - 0.45 * k;
        },
      });
    });
    t += FLY_MS;
    // 4. Engoliu: o cogumelo some dentro, a bolsa achata e estica, a poeirinha de couro sobe.
    this.after(t, () => {
      this.item.setVisible(false);
      this.sounds.land();
      this.puff();
      tw.add({ targets: this.bagScale, x: 1.28, y: 0.74, duration: GULP_MS * 0.4, ease: 'Quad.easeOut', yoyo: true });
      this.after(GULP_MS * 0.8, () => {
        tw.add({ targets: this.bagScale, x: 0.9, y: 1.12, duration: GULP_MS * 0.5, ease: 'Sine.easeOut', yoyo: true });
      });
    });
    t += GULP_MS + SHUT_DELAY_MS;
    // 5. A aba fecha com o fecho de latão, e a bolsa balança de contente.
    this.after(t, () => {
      this.bag.setTexture(BAG_SHUT);
      this.sounds.clasp();
      this.sparkle();
      tw.add({
        targets: this,
        bagTilt: { from: -0.22, to: 0.22 },
        duration: WOBBLE_MS / 4,
        yoyo: true,
        repeat: 1,
        ease: 'Sine.easeInOut',
        onComplete: () => { this.bagTilt = 0; },
      });
    });
    t += WOBBLE_MS + 180;
    // 6. Some (nunca corta).
    this.after(t, () => {
      tw.add({ targets: this, alpha: 0, duration: FADE_MS, onComplete: () => this.finish() });
      tw.add({ targets: this.bagScale, x: 0.7, y: 0.7, duration: FADE_MS, ease: 'Sine.easeIn' });
    });
  }

  /** A poeirinha de couro: grãos marrons pulando da boca da bolsa. */
  private puff(): void {
    const colors = [0xb07a46, 0x8a5a34, 0xd8b98a, 0x6e4426];
    for (let i = 0; i < 9; i += 1) {
      const a = -Math.PI / 2 + (i - 4) * 0.32;
      const speed = 1.4 + (i % 3) * 0.35;
      const img = this.scene.add.image(-9999, -9999, DUST).setDepth(SCENE_DEPTHS.player + 3).setTint(colors[i % colors.length]);
      this.motes.push({ img, x: BAG_AT.x, y: BAG_AT.y + BAG_SIZE * 0.5, vx: Math.cos(a) * speed * 0.6, vy: -Math.sin(a) * speed, age: 0, life: 0.45 + (i % 4) * 0.06 });
    }
  }

  /** O estalo do fecho: três faíscas claras que sobem e somem. */
  private sparkle(): void {
    for (let i = 0; i < 4; i += 1) {
      const img = this.scene.add.image(-9999, -9999, DUST).setDepth(SCENE_DEPTHS.player + 3).setTint(i % 2 ? 0xfff3c4 : 0xf2d27a);
      const a = Math.PI / 2 + (i - 1.5) * 0.7;
      this.motes.push({ img, x: BAG_AT.x, y: BAG_AT.y + BAG_SIZE * 0.35, vx: Math.cos(a) * 1.1, vy: Math.sin(a) * 1.3, age: 0, life: 0.38 });
    }
  }

  /**
   * Projeta tudo. `anchor` é a posição VISUAL do herói, em tiles; `dt` em ms anda os grãos de poeira (o
   * resto é dos tweens).
   */
  public render(tileSize: number, camera: WorldCamera, anchor: { readonly x: number; readonly y: number }, dt: number): void {
    if (this.done) return;
    const foot = camera.tileToScreen(anchor.x, anchor.y, tileSize);
    // O pé do herói fica na base do tile; a tela projeta o centro.
    const baseY = foot.y + tileSize * 0.45;
    const at = (p: { x: number; y: number }): { x: number; y: number } => ({ x: foot.x + p.x * tileSize, y: baseY - p.y * tileSize });
    const px = Math.max(1, Math.round((tileSize * BAG_SIZE) / ART));
    const bagAt = at(BAG_AT);
    this.bag.setPosition(Math.round(bagAt.x), Math.round(bagAt.y))
      .setDisplaySize(ART * px * this.bagScale.x, ART * px * this.bagScale.y)
      .setRotation(this.bagTilt)
      .setAlpha(this.alpha);
    if (this.item.visible) {
      const side = tileSize * ITEM_SIZE * this.itemScale;
      const fit = side / Math.max(1, Math.max(this.item.frame.realWidth, this.item.frame.realHeight));
      const itemAt = at(this.itemPos);
      this.item.setPosition(Math.round(itemAt.x), Math.round(itemAt.y))
        .setDisplaySize(this.item.frame.realWidth * fit, this.item.frame.realHeight * fit)
        .setRotation(this.itemSpin)
        .setAlpha(this.alpha);
    }
    const s = dt / 1000;
    for (let i = this.motes.length - 1; i >= 0; i -= 1) {
      const m = this.motes[i];
      m.age += s;
      m.vy -= 5 * s;
      m.x += m.vx * s;
      m.y += m.vy * s;
      if (m.age >= m.life) { m.img.destroy(); this.motes.splice(i, 1); continue; }
      const p = at(m);
      m.img.setPosition(Math.round(p.x), Math.round(p.y)).setDisplaySize(px * 1.5, px * 1.5)
        .setAlpha(this.alpha * (1 - m.age / m.life));
    }
  }

  private finish(): void {
    if (this.done) return;
    this.destroy();
    this.onDone();
  }

  public destroy(): void {
    this.done = true;
    for (const t of this.timers) t.remove();
    this.timers.length = 0;
    this.scene.tweens?.killTweensOf([this, this.bagScale, this.itemPos]);
    this.bag.destroy();
    this.item.destroy();
    for (const m of this.motes) m.img.destroy();
    this.motes.length = 0;
  }
}

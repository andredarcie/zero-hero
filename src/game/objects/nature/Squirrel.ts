import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import { bosqueTrees } from '@/game/objects/BigTrees';
import { isLifeHome } from '@/game/world/biomeLife';

import { PROP_TINT, TILESET as P, hash, sprite, type NatureFrame, type NatureSystem } from './kit';

/**
 * O ESQUILO (sugestão 1). Mora num carvalho velho do bosque (objects/BigTrees). Como esquilo de verdade:
 *   · DESCE o tronco de cabeça para baixo, aos trancos (para, olha, desce mais um pouco);
 *   · no chão, CATA: pulinhos curtos em volta da árvore, senta nas patas de trás com a noz nas mãos e rói, abana
 *     a cauda;
 *   · ao herói chegar perto, CORRE para o tronco e SOBE rápido, de cabeça para cima, e some na copa;
 *   · de noite dorme na copa (não aparece), e na chuva forte também.
 * Mora no carvalho mais perto do herói (até 9 tiles); longe de todos, não existe.
 */

const C = { r: P.rust, R: P.rustDk, o: P.amber, b: P.bone, k: P.ink, n: P.fur, d: P.barkDeep };
const FRAMES = {
  stand: sprite('squirrel-stand', [
    '..oor.....r.',
    '.orrRr...rrr',
    '.orRRr..rrkr',
    '..rRRr.rrrrb',
    '...rRrrrrbb.',
    '....rrrrrbb.',
    '....rRrrRbb.',
    '....RR..RR..',
  ], C),
  sit: sprite('squirrel-sit', [
    '..oor...r...',
    '.orrRr.rrr..',
    '.orRRr.rkrr.',
    '..rRRr.rrrb.',
    '...rRr.rrbn.',
    '...rRrrrrbd.',
    '....rRrrRb..',
    '....RR.RR...',
  ], C),
  gnaw: sprite('squirrel-gnaw', [
    '..oor.......',
    '.orrRr..r...',
    '.orRRr.rrr..',
    '..rRRr.rkrn.',
    '...rRr.rrbd.',
    '...rRrrrrbb.',
    '....rRrrRb..',
    '....RR.RR...',
  ], C),
  hop: sprite('squirrel-hop', [
    '..........r.',
    '.........rrr',
    'ooorr..rrrkr',
    '.orrRrrrrrrb',
    '..rRRrrrrbb.',
    '....RrrrRb..',
    '...RR....RR.',
    '............',
  ], C),
  // No tronco: de cabeça para baixo, descendo (a cauda em cima).
  down: sprite('squirrel-down', [
    '..o.....',
    '.oro....',
    '.orRo...',
    '..rRr...',
    '..rRrR..',
    '.RrrrrR.',
    '..rrrb..',
    '..rrrb..',
    '.RrrbbR.',
    '..rrrb..',
    '..rkrr..',
    '...rr...',
  ], C),
  // Subindo: a cabeça em cima, a cauda embaixo.
  up: sprite('squirrel-up', [
    '...rr...',
    '..rkrr..',
    '..rrrb..',
    '.RrrbbR.',
    '..rrrb..',
    '..rrrb..',
    '.RrrrrR.',
    '..rRrR..',
    '..rRr...',
    '.orRo...',
    '.oro....',
    '..o.....',
  ], C),
} as const;

type Mode = 'hidden' | 'down' | 'ground' | 'home' | 'up';

/** A altura (tiles) da borda de baixo da copa do carvalho (BigTrees): dali para cima o esquilo some nas folhas. */
const CROWN = 0.8;
const SCARE = 2.8;

export class Squirrel implements NatureSystem {
  private bb: Billboard3D | null = null;
  private tree: { x: number; y: number } | null = null;
  private mode: Mode = 'hidden';
  private timer = 3;
  private x = 0;
  private y = 0;
  private z = CROWN;
  private tx = 0;
  private ty = 0;
  private hopT = 0;
  private facing = 1;
  private pose: keyof typeof FRAMES = 'stand';
  private seed = 3;
  /** Quantas vezes fugiu do herói (a janela do playtest). */
  public flees = 0;

  private rand(): number {
    this.seed += 1;
    return hash(this.seed, 5, 401);
  }

  /** Playtest: some na copa e desce agora, no carvalho mais perto do herói. */
  public wake(): void {
    this.bb?.setVisible(false);
    this.mode = 'hidden';
    this.tree = null;
    this.timer = 0;
  }

  public get state(): { mode: Mode; x: number; y: number; z: number; tree: { x: number; y: number } | null } {
    return { mode: this.mode, x: this.x, y: this.y, z: this.z, tree: this.tree };
  }

  private nearestOak(hero: { x: number; y: number }): { x: number; y: number } | null {
    let best: { x: number; y: number } | null = null;
    let bd = 9;
    for (const t of bosqueTrees()) {
      if (t.kind !== 'oak' || !isLifeHome('squirrel', t.x, t.y)) continue;
      const d = Math.hypot(t.x - hero.x, t.y - hero.y);
      if (d < bd) { bd = d; best = { x: t.x, y: t.y }; }
    }
    return best;
  }

  public update(f: NatureFrame): void {
    const awake = f.phase > 0.27 && f.phase < 0.72 && f.rain < 0.35 && f.season !== 'winter';
    const oak = this.nearestOak(f.hero);
    // O carvalho onde ele mora: o mais perto do herói. Só se muda escondido (nunca no meio do chão).
    const moved = !oak || !this.tree || oak.x !== this.tree.x || oak.y !== this.tree.y;
    if (moved && (this.mode === 'hidden' || !oak)) { this.tree = oak; this.reset(); }
    if (!this.tree) { this.hide(); return; }
    const t = this.tree;
    const heroD = Math.hypot(f.hero.x - this.x, f.hero.y - this.y);
    const scared = !f.host.busy() && heroD < SCARE;
    this.timer -= f.dt;

    switch (this.mode) {
      case 'hidden':
        this.hide();
        // Desce quando o herói não está em cima da árvore, de dia.
        if (awake && this.timer <= 0 && Math.hypot(f.hero.x - t.x, f.hero.y - t.y) > SCARE + 0.5) {
          this.mode = 'down';
          this.x = t.x + 0.06;
          this.y = t.y + 0.04;
          this.z = CROWN;
          this.timer = 0;
        }
        break;
      case 'down': {
        // Aos trancos: desce um pedaço, para e olha, desce mais.
        if (scared) { this.flee(); break; }
        const moving = Math.floor(f.clock / 450 + this.seed) % 3 !== 0;
        if (moving) this.z = Math.max(0, this.z - f.dt * 0.9);
        this.pose = 'down';
        if (this.z <= 0) { this.mode = 'ground'; this.timer = 6 + this.rand() * 5; this.pickSpot(f); }
        break;
      }
      case 'ground': {
        if (scared) { this.flee(); break; }
        // Hora de voltar (ou o herói foi para longe da árvore dele): para a copa.
        if (!awake || this.timer <= 0 || Math.hypot(f.hero.x - t.x, f.hero.y - t.y) > 9) { this.goHome(); break; }
        this.walk(f, 0.9, () => {
          // Chegou: senta e rói a noz um tempo, depois pula para outro canto.
          this.hopT = -(1.2 + this.rand() * 1.8);
        });
        if (this.hopT < 0) {
          this.hopT += f.dt;
          this.pose = Math.floor(f.clock / 160) % 2 ? 'gnaw' : 'sit';
          if (this.hopT >= 0) this.pickSpot(f);
        }
        break;
      }
      case 'home':
        // Volta ao tronco correndo (fugindo ou de volta para a copa).
        this.walk(f, scared ? 3.4 : 1.6, () => { this.mode = 'up'; });
        break;
      case 'up':
        this.z += f.dt * (this.flees > 0 && scared ? 2.6 : 1.4);
        this.pose = 'up';
        if (this.z >= CROWN + 0.2) { this.mode = 'hidden'; this.timer = 8 + this.rand() * 9; }
        break;
      default:
        break;
    }
    if (this.mode !== 'hidden') this.show();
  }

  private flee(): void {
    if (!this.tree) return;
    this.flees += 1;
    if (this.mode === 'down') { this.mode = 'up'; return; }
    this.goHome();
  }

  /** Corre de volta ao pé do tronco (para subir). Larga a noz: sentado roendo, ele não andaria. */
  private goHome(): void {
    if (!this.tree) return;
    this.mode = 'home';
    this.hopT = 0;
    this.tx = this.tree.x + 0.06;
    this.ty = this.tree.y + 0.04;
  }

  /** Um canto do chão em volta do tronco, livre, para catar. */
  private pickSpot(f: NatureFrame): void {
    if (!this.tree) return;
    for (let i = 0; i < 12; i += 1) {
      const a = this.rand() * Math.PI * 2;
      const r = 0.7 + this.rand() * 1.1;
      const x = this.tree.x + Math.cos(a) * r;
      const y = this.tree.y + 0.3 + Math.abs(Math.sin(a)) * r * 0.8;
      if (f.host.isFree(Math.round(x), Math.round(y))) { this.tx = x; this.ty = y; this.hopT = 0; return; }
    }
    this.tx = this.tree.x + 0.5;
    this.ty = this.tree.y + 0.6;
  }

  /** Anda até (tx, ty) aos pulinhos; `arrive` quando chega. */
  private walk(f: NatureFrame, speed: number, arrive: () => void): void {
    if (this.hopT < 0) return;
    const dx = this.tx - this.x;
    const dy = this.ty - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.05) { this.z = 0; arrive(); return; }
    const step = Math.min(d, speed * f.dt);
    this.x += (dx / d) * step;
    this.y += (dy / d) * step;
    if (Math.abs(dx) > 0.02) this.facing = dx > 0 ? 1 : -1;
    // O pulinho: o corpo sobe e desce num arco a cada ~0,22 tile.
    const k = (f.clock / 1000 * speed * 4.5) % 1;
    this.z = Math.sin(k * Math.PI) * 0.12;
    this.pose = k < 0.5 ? 'hop' : 'stand';
  }

  private reset(): void {
    this.mode = 'hidden';
    this.timer = 2 + this.rand() * 3;
    this.z = CROWN;
  }

  private show(): void {
    if (!this.bb) {
      this.bb = world3d().objects.addBillboard(FRAMES.stand, 0, { depthLayer: 'overlay', groundShadow: { rx: 0.18, rz: 0.08, alpha: 0.3 } }).setTint(PROP_TINT);
    }
    const vertical = this.pose === 'down' || this.pose === 'up';
    this.bb.setTexture(FRAMES[this.pose])
      .setDisplaySize(vertical ? 8 / 16 : 12 / 16, vertical ? 12 / 16 : 8 / 16)
      .setFlipX(!vertical && this.facing < 0)
      .setPosition(this.x, this.y)
      .setElevation(this.z)
      .setVisible(true);
  }

  private hide(): void {
    this.bb?.setVisible(false);
  }

  public destroy(): void {
    this.bb?.destroy();
    this.bb = null;
  }
}

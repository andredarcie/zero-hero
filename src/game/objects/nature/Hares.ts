import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';

import { PROP_TINT, TILESET as P, hash, sprite, type NatureFrame, type NatureSystem } from './kit';

/**
 * A LEBRE (sugestão 4). Aparece na BORDA DO DIA — de manhãzinha e no fim da tarde, que é quando lebre come —, perto
 * das árvores. Como lebre de verdade:
 *   · PASTA de cabeça baixa, as orelhas deitadas, dá um pulinho para o lado e volta a comer;
 *   · quando o herói chega perto, SENTA DE ORELHAS EM PÉ (alerta) por um instante;
 *   · e se ele chega mais, FOGE EM ZIGUE-ZAGUE, em saltos longos, e some.
 * Uma por janela do dia: espantada, só volta na próxima manhã ou tarde.
 */

const C = { f: P.fur, F: P.furDk, b: P.boneDk, w: P.bone, k: P.ink, e: P.night, p: P.sand };
const FRAMES = {
  graze: sprite('hare-graze', [
    '............',
    '........FF..',
    '.......FfffF',
    '..ffff.fffkf',
    '.fffFfffffff',
    'wfffFFfffffb',
    '.ffFFffffbb.',
    '..ff...ff...',
    '.FF...FF....',
  ], C),
  chew: sprite('hare-chew', [
    '............',
    '........FF..',
    '.......FfffF',
    '..ffff.fffkf',
    '.fffFfffffff',
    'wfffFFffffb.',
    '.ffFFffffbb.',
    '..ff...ff...',
    '.FF...FF....',
  ], C),
  // Alerta: sentada, o corpo em pé, as orelhas para cima com as pontas pretas.
  alert: sprite('hare-alert', [
    '.......ek.ek',
    '.......fF.fF',
    '.......fF.fF',
    '.......ffffF',
    '......ffffkf',
    '..fff.fffffb',
    '.ffFffffffb.',
    'wfFFfffffbb.',
    '.FF..FFFF...',
  ], C),
  // Os dois tempos do salto: esticada no ar e encolhida no pouso.
  run1: sprite('hare-run1', [
    '........ek..',
    '........fF..',
    '.......ffffk',
    'w.ffffffffff',
    'ffffFFfffffb',
    'FF..FFfffbb.',
    '..........FF',
    '............',
    '............',
  ], C),
  run2: sprite('hare-run2', [
    '............',
    '.......ek...',
    '.......fFff.',
    '..ffff.ffffk',
    '.fffFffffff.',
    'wfFFFfffffb.',
    '.ffFFFffbb..',
    '..FFFFFF....',
    '............',
  ], C),
} as const;

type Mode = 'graze' | 'alert' | 'flee';

// MENOS ARISCA (pedido do autor, 2026-11-11: os bichos só correm com o herói a dois tiles ou menos; fora isso, ficam
// de boa). Ela senta de orelhas em pé um pouco antes, e foge a 2 (o `ALERT - 0,4` do alerta também dá 2).
const ALERT = 2.4;
const FLEE = 2.0;

export class Hares implements NatureSystem {
  private bb: Billboard3D | null = null;
  private mode: Mode = 'graze';
  private x = 0;
  private y = 0;
  private z = 0;
  private vx = 0;
  private vy = 0;
  private timer = 0;
  private hop = 0;
  private zig = 1;
  private facing = 1;
  /** A janela do dia em que ela já apareceu (só uma por manhã/tarde). */
  private window = '';
  private seed = 13;
  public flees = 0;

  private rand(): number {
    this.seed += 1;
    return hash(this.seed, 11, 404);
  }

  public get state(): { mode: Mode; x: number; y: number } | null {
    return this.bb ? { mode: this.mode, x: this.x, y: this.y } : null;
  }

  public update(f: NatureFrame): void {
    const dawn = f.phase > 0.255 && f.phase < 0.34;
    const dusk = f.phase > 0.66 && f.phase < 0.745;
    const win = dawn ? `${f.day}-m` : dusk ? `${f.day}-t` : '';
    if (!this.bb && win && win !== this.window && f.rain < 0.3 && !f.host.busy()) this.spawn(f, win);
    if (!this.bb) return;
    const heroD = Math.hypot(f.hero.x - this.x, f.hero.y - this.y);
    if (!win && this.mode !== 'flee') this.startFlee();
    switch (this.mode) {
      case 'graze':
        this.timer -= f.dt;
        if (heroD < ALERT) { this.mode = 'alert'; this.timer = 0.5 + this.rand() * 0.4; break; }
        this.bb.setTexture(Math.floor(f.clock / 260) % 3 === 0 ? FRAMES.chew : FRAMES.graze);
        if (this.timer <= 0) {
          // Um pulinho curto para o lado, para outra moita de capim.
          this.timer = 1.5 + this.rand() * 3;
          const nx = this.x + (this.rand() - 0.5) * 0.8;
          if (f.host.isFree(Math.round(nx), Math.round(this.y))) { this.facing = nx > this.x ? 1 : -1; this.x = nx; }
        }
        break;
      case 'alert':
        this.timer -= f.dt;
        this.bb.setTexture(FRAMES.alert);
        this.facing = f.hero.x > this.x ? 1 : -1;
        if (heroD < FLEE || (this.timer <= 0 && heroD < ALERT - 0.4)) this.startFlee();
        else if (heroD > ALERT + 1) this.mode = 'graze';
        break;
      case 'flee': {
        // Saltos longos em zigue-zague: a cada salto, o rumo vira para o outro lado da fuga.
        this.hop += f.dt / 0.26;
        if (this.hop >= 1) {
          this.hop -= 1;
          this.zig = -this.zig;
          const away = Math.atan2(this.y - f.hero.y, this.x - f.hero.x) + this.zig * 0.6;
          this.vx = Math.cos(away) * 3.4;
          this.vy = Math.sin(away) * 2.4;
          this.facing = this.vx > 0 ? 1 : -1;
        }
        this.x += this.vx * f.dt;
        this.y += this.vy * f.dt;
        this.z = Math.sin(this.hop * Math.PI) * 0.3;
        this.bb.setTexture(this.hop < 0.55 ? FRAMES.run1 : FRAMES.run2);
        if (heroD > 11) { this.bb.destroy(); this.bb = null; }
        break;
      }
      default:
        break;
    }
    this.bb?.setFlipX(this.facing < 0).setPosition(this.x, this.y).setElevation(this.z);
  }

  private startFlee(): void {
    this.mode = 'flee';
    this.flees += 1;
    this.hop = 1;
  }

  /** Nasce perto de árvores, longe o bastante para ser vista antes de fugir. */
  private spawn(f: NatureFrame, win: string): void {
    const trees = f.host.treesNear(f.hero.x, f.hero.y, 8);
    for (let i = 0; i < 40; i += 1) {
      const base = trees.length > 0 && this.rand() < 0.7 ? trees[Math.floor(this.rand() * trees.length)] : f.hero;
      const x = Math.round(base.x + (this.rand() - 0.5) * 3);
      const y = Math.round(base.y + 1 + this.rand() * 1.5);
      const d = Math.hypot(x - f.hero.x, y - f.hero.y);
      if (d < 4.6 || d > 6.4 || Math.abs(x - f.hero.x) > 6 || !f.host.isFree(x, y)) continue;
      this.window = win;
      this.x = x;
      this.y = y;
      this.z = 0;
      this.mode = 'graze';
      this.timer = 1 + this.rand() * 2;
      this.facing = this.rand() < 0.5 ? -1 : 1;
      this.bb = world3d().objects.addBillboard(FRAMES.graze, 0, { groundShadow: { rx: 0.3, rz: 0.1, alpha: 0.3 } }).setDisplaySize(12 / 16, 9 / 16).setTint(PROP_TINT);
      return;
    }
  }

  /** Playtest: aparece agora (ignora a janela já usada). */
  public summon(f: NatureFrame): void {
    this.bb?.destroy();
    this.bb = null;
    this.window = '';
    this.spawn(f, 'debug');
  }

  public destroy(): void {
    this.bb?.destroy();
    this.bb = null;
  }
}

import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import { terrainHeightAt } from '@/game/world/relief';

import { MIST, OVER_WATER, WISPS, WISP_H, WISP_W } from './springArt';

/**
 * O VAPOR DA FONTE (objects/spring/HotSpring). A primeira versão eram borrões redondos e grandes, que de dia viravam
 * uma neblina amarela por cima de tudo. Agora são duas coisas, como numa fonte de verdade:
 *
 *   · OS FIOS: muitos, finos e altos, de espinha torta (o desenho é de fiapos, springArt.paintWisp). Nascem na água,
 *     sobem devagar, balançam de um lado para o outro e inclinam com o vento, engordam e somem. Cada um no seu tempo.
 *   · A NÉVOA: lençóis macios deitados a um palmo da água, que giram e derivam devagar. É ela que deixa a superfície
 *     leitosa de longe.
 *
 * O ar frio engrossa os dois (`density`, de HotSpring.steamAt). De noite o vapor é azul de lua, e o que nasce perto da
 * lanterna pega o dourado dela.
 */

const WISP_COUNT = 16;
const WISP_ALPHA = 0.5;
const SHEETS = 3;
const SHEET_ALPHA = 0.12;
/**
 * O tom do vapor de dia: cinza-azulado. Branco puro, a luz dourada do vale o deixava bege e aceso (lia como luz, não
 * como vapor); este é o que sobra branco depois do ouro. De noite, o azul da lua; perto da lanterna, o dourado.
 */
const DAY = 0x9aa8b8;
const NIGHT = 0x8a9cc0;
const WARM = 0xe0a060;

const mix = (a: number, b: number, k: number): number => {
  const ch = (s: number): number => Math.round(((a >> s) & 0xff) * (1 - k) + ((b >> s) & 0xff) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

interface Wisp { bb: Billboard3D; x: number; y: number; age: number; life: number; rise: number; size: number; seed: number; warm: number }
interface Sheet { bb: Billboard3D; phase: number; size: number }

export class SpringSteam {
  private readonly wisps: Wisp[] = [];
  private readonly sheets: Sheet[] = [];
  private clock = 0;
  private tintKey = '';
  /** O tom do vapor agora, sem o dourado da lanterna (o sopro do pé da cascata usa o mesmo). */
  public tint = DAY;

  public constructor(
    /** O meio da água e as meias medidas dela (tiles). */
    private readonly pool: { x: number; y: number; hw: number; hh: number },
    /** A altura da água (o nível do chão dela): o vapor que o vento leva por cima do paredão não sobe com o morro. */
    private readonly level: number,
    private readonly lamp: { x: number; y: number },
  ) {
    const objects = world3d().objects;
    for (let i = 0; i < SHEETS; i += 1) {
      const bb = objects.addBillboard(MIST, 0, {
        flat: true, flatY: level + 0.12 + i * 0.05, depthWrite: false, alphaTest: 0.01, renderOrder: OVER_WATER,
      }).setAlpha(0);
      this.sheets.push({ bb, phase: i * 2.1, size: 2.6 + i * 0.5 });
    }
    for (let i = 0; i < WISP_COUNT; i += 1) {
      const bb = objects.addBillboard(WISPS[i % WISPS.length], 0, {
        centered: true, depthWrite: false, alphaTest: 0.01, renderOrder: OVER_WATER,
      }).setAlpha(0);
      const wisp: Wisp = { bb, x: pool.x, y: pool.y, age: 0, life: 1, rise: 0, size: 1, seed: 0, warm: 0 };
      this.respawn(wisp);
      // nascem desencontrados: a fonte já está fumegando quando o herói chega
      wisp.age = (i / WISP_COUNT) * wisp.life;
      this.wisps.push(wisp);
    }
  }

  private respawn(w: Wisp): void {
    w.age = 0;
    w.life = 5 + Math.random() * 3.5;
    // dentro da poça (um superelipse: os cantos do retângulo são pedra)
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 0.82;
    w.x = this.pool.x + Math.cos(a) * r * this.pool.hw;
    w.y = this.pool.y + Math.sin(a) * r * this.pool.hh;
    w.rise = 0.1 + Math.random() * 0.1;
    w.size = 0.7 + Math.random() * 0.5;
    w.seed = Math.random() * 10;
    w.warm = Math.max(0, 1 - Math.hypot(w.x - this.lamp.x, w.y - this.lamp.y) / 2.6);
    this.tintKey = '';
  }

  /** `density`: quanto vapor sai (0..1). `wind`: tiles/ms para o leste. `night`: 0..1. */
  public update(dt: number, density: number, wind: number, daylight: number, night: number): void {
    this.clock += dt;
    const t = this.clock;
    this.syncTint(daylight, night);
    const windX = wind * 1000 * 0.3;
    for (const w of this.wisps) {
      w.age += dt;
      if (w.age >= w.life) this.respawn(w);
      const k = w.age / w.life;
      const sway = Math.sin(t * 0.6 + w.seed) * 0.1 * (0.4 + k);
      const x = w.x + windX * w.age * (0.3 + k) + sway;
      const width = w.size * (0.75 + 0.55 * k);
      const height = width * (WISP_H / WISP_W) * (0.9 + 0.3 * k);
      const env = Math.sin(Math.PI * Math.min(1, k * 1.08));
      // o pé do fio fica sempre acima da água: abaixo dela, o chão o cortava numa reta
      w.bb.setPosition(x, w.y)
        .setElevation(this.level - terrainHeightAt(x, w.y) + height / 2 + 0.02 + w.rise * w.age)
        .setDisplaySize(width, height)
        .setAngle(Math.sin(t * 0.45 + w.seed * 1.7) * 7 + windX * 30 * k)
        .setAlpha(WISP_ALPHA * density * env * env);
    }
    for (const s of this.sheets) {
      const a = t * 0.11 + s.phase;
      s.bb.setPosition(this.pool.x + Math.cos(a) * this.pool.hw * 0.42, this.pool.y + Math.sin(a * 1.3) * this.pool.hh * 0.3)
        .setDisplaySize(s.size, s.size * 0.62)
        .setAlpha(SHEET_ALPHA * density * (0.75 + 0.25 * Math.sin(t * 0.37 + s.phase)));
    }
  }

  /** O tom, em degraus (a hora anda devagar: quase nunca reescreve; um fio que renasce pede a conta de novo). */
  private syncTint(daylight: number, night: number): void {
    const key = `${Math.round(daylight * 16)}|${Math.round(night * 8)}`;
    if (key === this.tintKey) return;
    this.tintKey = key;
    const base = mix(NIGHT, DAY, Math.min(1, Math.max(0, daylight)));
    this.tint = base;
    for (const w of this.wisps) w.bb.setTint(mix(base, WARM, w.warm * night * 0.75));
    for (const s of this.sheets) s.bb.setTint(base);
  }

  public setVisible(on: boolean): void {
    for (const w of this.wisps) w.bb.setVisible(on);
    for (const s of this.sheets) s.bb.setVisible(on);
  }

  public destroy(): void {
    for (const w of this.wisps) w.bb.destroy();
    for (const s of this.sheets) s.bb.destroy();
    this.wisps.length = 0;
    this.sheets.length = 0;
  }
}

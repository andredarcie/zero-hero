// AS PEGADAS E O FÔLEGO: a pegada que o herói deixa no chão e some aos poucos, e o herói que respira quando para.

import { getSoundManager } from '@/game/audio/SoundManager';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { textureImage } from '@/game/render3d/textures3d';
import { world3d } from '@/game/render3d/World3D';
import { hash, texture } from '@/game/objects/nature/kit';
import { leftSide, stepDir, stepPrint, type PrintSurface } from '@/game/objects/stepPrints';
import type { GameScene } from '../GameScene';
import type * as Engine from '@/game/engine';

/**
 * AS PEGADAS NO CHÃO (pedido do autor, 2026-11-19: "melhore drasticamente o visual das pegadas do herói").
 *
 * Eram uma elipse marrom de 2D, desenhada POR CIMA do mundo 3D (sem perspectiva, sem luz, por cima do capim que devia
 * cobri-la), uma por tile, sempre no mesmo lugar, que piscava e sumia em 0,7 s. Agora são pegadas de verdade, deitadas
 * no chão do mundo (`stepPrints`: a sola afundada, a sombra da parede, o beiço de terra empurrada): o chão as encurta
 * na perspectiva, a luz da hora e o fogo as acendem, a névoa e a lente as levam como levam o resto, e o capim em pé as
 * cobre. Dois passos por tile, pé esquerdo e pé direito de cada lado do corpo, com o bico para onde ele anda, e o pixel
 * da pegada na mesma grade do pixel do chão.
 *
 * Cada chão guarda o passo do seu jeito: na TERRA a pegada fica uns segundos inteira e some devagar (olhar para trás e
 * ver o rastro na trilha); na CHUVA a terra vira LAMA, a pegada sai funda e com água no fundo e dura o dobro; no CAPIM
 * as folhas deitam e se levantam logo; na pedra e na madeira não fica nada. A AREIA é da praia (objects/beach/
 * BeachSteps, que sabe da onda). Na terra seca o passo levanta um pouco de poeira; na lama, respinga.
 */
const STRIDE = 0.5;
/** Meia distância entre os pés (tiles): o herói tem os pés nas beiras do corpo, uns três pixels do meio. */
const FEET = 0.19;
/** Um pé pousa um pouco à frente do meio do corpo (tiles para o sul: onde a sola encosta, debaixo do desenho). */
const FOOT_Y = 0.06;
const MAX_PRINTS = 48;
const MAX_DUST = 24;
/** Quanto a pegada fica inteira e quanto leva para sumir (s), por chão. */
const LIFE: Record<'dirt' | 'mud' | 'grass', { hold: number; fade: number }> = {
  dirt: { hold: 6, fade: 4 },
  mud: { hold: 14, fade: 7 },
  grass: { hold: 1.2, fade: 2.2 },
};
/** A partir de quanta chuva a terra é lama. */
const RAIN_MUD = 0.25;
const DOT = texture('step-dot', 1, 1, (put) => put(0, 0, '#ffffff'));
const DUST_TINT = 0xa39d90;
const MUD_TINT = 0x4a3b2c;

interface Print { bb: Billboard3D; t: number; hold: number; fade: number }
interface Mote { bb: Billboard3D; x: number; y: number; z: number; vx: number; vy: number; vz: number; t: number; life: number; fall: number }

/** O que Footprints usa de GameScene. */
export type FootprintsHost = Pick<GameScene, 'hero' | 'query' | 'time' | 'tweens' | 'valley' | 'verbs'>;

export class Footprints {
  private readonly prints: Print[] = [];
  private readonly motes: Mote[] = [];
  private last: { x: number; y: number } | null = null;
  private walked = 0;
  private right = false;
  private lastTick = 0;
  private seed = 11;
  /** Quantas pegadas já foram deixadas (o playtest lê). */
  public stepped = 0;
  // Breathing idle
  public breathingTween?: Engine.Tweens.Tween;

  public constructor(private readonly host: FootprintsHost) {}

  /** As pegadas e a poeira deste quadro (do render3D: roda todo quadro, inclusive com o update parado num diálogo). */
  public tick(): void {
    const now = this.host.time.now;
    const dt = Math.min(0.1, Math.max(0, (now - this.lastTick) / 1000));
    this.lastTick = now;
    this.fade(dt);
    this.drift(dt);
    this.track();
  }

  /** O som do passo, a cada tile que ele entra (o desenho da pegada sai do corpo andando, em `track`). */
  public onStep(fromWorldX: number, fromWorldY: number): void {
    getSoundManager().work.playStep(this.host.query.surfaceAt(fromWorldX, fromWorldY));
  }

  /** Segue o corpo (a posição DESENHADA, fracionária): um pé a cada meio tile andado. */
  private track(): void {
    const at = this.host.verbs.heroVisualTile();
    if (!this.last) { this.last = { x: at.x, y: at.y }; return; }
    const dx = at.x - this.last.x;
    const dy = at.y - this.last.y;
    const moved = Math.hypot(dx, dy);
    // um teleporte (ou a volta de um sonho) não deixa rastro
    if (moved > 2) { this.last = { x: at.x, y: at.y }; this.walked = 0; return; }
    if (moved < 1e-4) return;
    this.last.x = at.x;
    this.last.y = at.y;
    this.walked += moved;
    if (this.walked < STRIDE) return;
    this.walked %= STRIDE;
    this.right = !this.right;
    this.plant(at.x, at.y, stepDir(dx, dy));
  }

  private plant(x: number, y: number, dir: ReturnType<typeof stepDir>): void {
    const [sx, sy] = leftSide(dir);
    const side = this.right ? -FEET : FEET;
    const px = x + sx * side;
    const py = y + sy * side + FOOT_Y;
    const tx = Math.round(px);
    const ty = Math.round(py);
    if (this.host.query.isSandAt(tx, ty)) return; // a praia cuida da areia (BeachSteps)
    const ground = this.host.query.surfaceAt(tx, ty);
    if (ground === 'stone' || ground === 'wood') return;
    const rain = this.host.valley.weather?.rain ?? 0;
    const kind: PrintSurface & keyof typeof LIFE = ground === 'dirt' ? (rain > RAIN_MUD ? 'mud' : 'dirt') : 'grass';
    const art = stepPrint(kind, dir, this.right);
    if (!textureImage(art.key)) return;
    if (this.prints.length >= MAX_PRINTS) this.prints.shift()?.bb.destroy();
    // o pixel da pegada na grade do pixel do chão (o canto do tile é meio-inteiro, e 0,5 = 8/16)
    const w = art.w / 16;
    const h = art.h / 16;
    const cx = Math.round((px - w / 2) * 16) / 16 + w / 2;
    const cy = Math.round((py - h / 2) * 16) / 16 + h / 2;
    const bb = world3d().objects.addBillboard(art.key, 0, { flat: true, flatY: 0.022, depthWrite: false, alphaTest: 0.01, depthLayer: 'ground' })
      .setDisplaySize(w, h).setPosition(cx, cy);
    this.prints.push({ bb, t: 0, ...LIFE[kind] });
    this.stepped += 1;
    if (kind === 'dirt') this.puff(px, py, dir, DUST_TINT, 2, 0.45);
    else if (kind === 'mud') this.puff(px, py, dir, MUD_TINT, 2, 0.3);
  }

  /** Some em quatro degraus de transparência (pixel art não esmaece liso), depois do tempo inteira. */
  private fade(dt: number): void {
    for (let i = this.prints.length - 1; i >= 0; i -= 1) {
      const p = this.prints[i];
      p.t += dt;
      const k = (p.t - p.hold) / p.fade;
      if (k >= 1) { p.bb.destroy(); this.prints.splice(i, 1); continue; }
      if (k > 0) p.bb.setAlpha(1 - Math.ceil(k * 4) / 5);
    }
  }

  private rand(): number {
    this.seed += 1;
    return hash(this.seed, 17, 811);
  }

  /** A poeira da terra seca (sobe pouco e assenta) ou os respingos da lama (pulam e caem), para trás do passo. */
  private puff(x: number, y: number, dir: ReturnType<typeof stepDir>, tint: number, n: number, life: number): void {
    const [bx, by] = { n: [0, 1], s: [0, -1], e: [-1, 0], w: [1, 0] }[dir];
    const mud = tint === MUD_TINT;
    for (let i = 0; i < n && this.motes.length < MAX_DUST; i += 1) {
      const bb = world3d().objects.addBillboard(DOT, 0, { centered: true, alphaTest: 0.01 })
        .setDisplaySize(1 / 16, 1 / 16).setTint(tint).setPosition(x, y).setAlpha(mud ? 1 : 0.7);
      this.motes.push({
        bb, x, y, z: 0.03,
        vx: bx * 0.35 + (this.rand() - 0.5) * 0.5,
        vy: by * 0.35 + (this.rand() - 0.5) * 0.3,
        vz: mud ? 1.1 + this.rand() * 0.5 : 0.35 + this.rand() * 0.3,
        t: 0, life: life * (0.7 + this.rand() * 0.5), fall: mud ? 7 : 0.6,
      });
    }
  }

  private drift(dt: number): void {
    for (let i = this.motes.length - 1; i >= 0; i -= 1) {
      const m = this.motes[i];
      m.t += dt;
      m.vz -= m.fall * dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.z += m.vz * dt;
      if (m.t >= m.life || m.z <= 0) { m.bb.destroy(); this.motes.splice(i, 1); continue; }
      m.bb.setPosition(m.x, m.y).setElevation(m.z);
    }
  }

  public startBreathing(): void {
    if (this.breathingTween?.isPlaying()) return;
    this.breathingTween?.destroy();
    // The billboard stands on its feet, so stretching it only grows it upward — no origin
    // pivot needed (the old 2D sprite had to flip its origin and offset y to fake this).
    this.breathingTween = this.host.tweens.add({
      targets: this.host.hero,
      scaleY: 1.045,
      scaleX: 0.972,
      duration: 1100,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1,
    });
  }

  public stopBreathing(): void {
    if (!this.breathingTween) return;
    this.breathingTween.stop();
    this.breathingTween.destroy();
    this.breathingTween = undefined;
    // Back to rest: no squash. (O `sizePx` NAO se escreve aqui — ele sai da projecao da camera
    // uma vez por frame, no render3D. Era esta linha que "consertava" o tamanho do heroi no
    // primeiro passo, escondendo que ele nascia errado.)
    this.host.hero.scaleX = 1;
    this.host.hero.scaleY = 1;
  }

  /** O fim da cena: tudo some (o World3D vai junto logo depois). */
  public destroy(): void {
    for (const p of this.prints) p.bb.destroy();
    for (const m of this.motes) m.bb.destroy();
    this.prints.length = 0;
    this.motes.length = 0;
    this.last = null;
  }
}

import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { WATER_DEPTH_TILES, world3d } from '@/game/render3d/World3D';
import { getSoundManager } from '@/game/audio/SoundManager';

import { PROP_TINT, TILESET as P, hash, sprite, texture, type NatureFrame, type NatureSystem } from './kit';

/**
 * O PEIXE QUE PULA (sugestão 5). De vez em quando, num lago perto do herói, um peixe salta: sai da água de cabeça
 * para cima, vira no alto do arco e mergulha de cabeça — um anel e umas gotas onde sai, outro onde entra, e o
 * "ploc" da entrada. Pula mais no fim da tarde (é quando os insetos descem para a água).
 */

const C = { s: P.pale, S: P.grey, d: P.skyDk, k: P.ink, f: P.greyDk };
// Os três tempos do salto: subindo (a cabeça para cima), no alto (deitado) e descendo (a cabeça para baixo).
const RISE = sprite('fish-rise', [
  '......sk',
  '....sSs.',
  '..sSds..',
  '.fSd....',
  'ff......',
], C);
const TOP = sprite('fish-top', [
  '........',
  'f..sss..',
  'ffSSSdsk',
  'f.dddd..',
  '........',
], C);
const DIVE = sprite('fish-dive', [
  'ff......',
  '.fSd....',
  '..sSds..',
  '....sSs.',
  '......sk',
], C);
const RING = texture('fish-ring', 12, 12, (put) => {
  for (let i = 0; i < 40; i += 1) {
    const a = (i / 40) * Math.PI * 2;
    put(5.5 + Math.cos(a) * 5.3, 5.5 + Math.sin(a) * 5.3, P.ice, 0.8);
  }
});
const DROP = texture('fish-drop', 1, 1, (put) => put(0, 0, P.ice, 0.9));
const SURFACE = -WATER_DEPTH_TILES + 0.03;
const JUMP_S = 0.75;

interface Ring { bb: Billboard3D; t: number }
interface Drop { bb: Billboard3D; x: number; y: number; z: number; vx: number; vy: number; vz: number }

export class FishJumps implements NatureSystem {
  private fish: Billboard3D | null = null;
  private jump: { x: number; y: number; dir: number; t: number } | null = null;
  private readonly rings: Ring[] = [];
  private readonly drops: Drop[] = [];
  private next = 4;
  private seed = 17;
  public jumps = 0;

  private rand(): number {
    this.seed += 1;
    return hash(this.seed, 13, 405);
  }

  public get state(): { jumping: boolean; x: number; y: number } | null {
    return this.jump ? { jumping: true, x: this.jump.x, y: this.jump.y } : null;
  }

  /** Playtest: pula agora (num ponto dado, se vier). */
  public force(x?: number, y?: number): void {
    this.next = 0;
    this.at = x !== undefined && y !== undefined ? { x, y } : null;
  }
  private at: { x: number; y: number } | null = null;

  /** Água ABERTA (com água dos quatro lados): peixe não pula rente à margem. */
  private openWater(f: NatureFrame): { x: number; y: number } | null {
    for (let i = 0; i < 40; i += 1) {
      const x = Math.round(f.hero.x + (this.rand() - 0.5) * 12);
      const y = Math.round(f.hero.y + (this.rand() - 0.5) * 8);
      if ([[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => f.host.isWater(x + dx, y + dy))) {
        return { x: x + (this.rand() - 0.5) * 0.5, y: y + (this.rand() - 0.5) * 0.5 };
      }
    }
    return null;
  }

  public update(f: NatureFrame): void {
    this.next -= f.dt;
    if (!this.jump && this.next <= 0 && f.season !== 'winter') {
      const dusk = f.phase > 0.62 && f.phase < 0.78;
      this.next = (dusk ? 4 : 8) + this.rand() * (dusk ? 5 : 10);
      const at = this.at ?? this.openWater(f);
      this.at = null;
      if (at) {
        this.jump = { ...at, dir: this.rand() < 0.5 ? -1 : 1, t: 0 };
        this.jumps += 1;
        this.splash(at.x, at.y, 4);
      }
    }
    if (this.jump) {
      const j = this.jump;
      j.t += f.dt / JUMP_S;
      const k = Math.min(1, j.t);
      if (!this.fish) this.fish = world3d().objects.addBillboard(RISE, 0, { centered: true }).setDisplaySize(8 / 16, 5 / 16).setTint(PROP_TINT);
      this.fish
        .setTexture(k < 0.38 ? RISE : k < 0.62 ? TOP : DIVE)
        .setFlipX(j.dir < 0)
        .setPosition(j.x + j.dir * 0.8 * k, j.y)
        .setElevation(SURFACE + Math.sin(k * Math.PI) * 0.6)
        .setVisible(true);
      if (k >= 1) {
        this.splash(j.x + j.dir * 0.8, j.y, 6);
        getSoundManager().nature.playFishSplash();
        this.fish.setVisible(false);
        this.jump = null;
      }
    }
    this.updateSplash(f);
  }

  private splash(x: number, y: number, n: number): void {
    const w3 = world3d();
    this.rings.push({ bb: w3.objects.addBillboard(RING, 0, { flat: true, flatY: SURFACE, depthWrite: false, alphaTest: 0.01 }).setPosition(x, y), t: 0 });
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + this.rand();
      this.drops.push({
        bb: w3.objects.addBillboard(DROP, 0, { centered: true, depthWrite: false, alphaTest: 0.01 }).setDisplaySize(1 / 16, 1 / 16),
        x, y, z: SURFACE + 0.02, vx: Math.cos(a) * 0.6, vy: Math.sin(a) * 0.35, vz: 1.3 + this.rand() * 0.7,
      });
    }
  }

  private updateSplash(f: NatureFrame): void {
    for (let i = this.rings.length - 1; i >= 0; i -= 1) {
      const r = this.rings[i];
      r.t += f.dt / 1.1;
      const s = 0.25 + r.t * 0.9;
      r.bb.setDisplaySize(s, s).setAlpha(0.75 * (1 - r.t));
      if (r.t >= 1) { r.bb.destroy(); this.rings.splice(i, 1); }
    }
    for (let i = this.drops.length - 1; i >= 0; i -= 1) {
      const d = this.drops[i];
      d.x += d.vx * f.dt; d.y += d.vy * f.dt; d.z += d.vz * f.dt; d.vz -= 6 * f.dt;
      d.bb.setPosition(d.x, d.y).setElevation(d.z);
      if (d.z < SURFACE) { d.bb.destroy(); this.drops.splice(i, 1); }
    }
  }

  public destroy(): void {
    this.fish?.destroy();
    this.fish = null;
    for (const r of this.rings) r.bb.destroy();
    for (const d of this.drops) d.bb.destroy();
    this.rings.length = 0;
    this.drops.length = 0;
  }
}

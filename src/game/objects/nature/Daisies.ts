import * as THREE from 'three';

import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import { biomeWashAt } from '@/game/world/biomes';

import { TILESET as P, hash, sprite, window01, type NatureFrame, type NatureSystem } from './kit';

/**
 * AS MARGARIDAS QUE DORMEM (sugestão 8). A margarida de verdade fecha as pétalas brancas por cima do miolo amarelo ao
 * anoitecer e quando chove, e abre de novo com o sol — o nome inglês dela, daisy, vem de "day's eye", o olho do dia.
 *   · touceiras de 3 a 5 pelos campos, em tiles livres, sempre nos mesmos lugares;
 *   · ABREM devagar de manhã, FECHAM no fim da tarde, cada uma um pouco no seu tempo; e fecham na chuva;
 *   · balançam com o vento. No inverno não há.
 * É o contrário da flor-da-lua do jogo (objects/Moonflower), que abre de noite.
 */

const C = { w: P.bone, W: P.boneDk, y: P.yellow, g: P.olive, G: P.oliveDk };
/** Quanto do tom do chão a margarida veste: a pétala branca fica abaixo do bloom ao sol (ver o `stream`). */
const DAISY_TONE = 0.5;
// Do jeito das florzinhas do tileset: uma cruz de pétalas em volta de um olho amarelo de 1 px, num caule.
const FRAMES = [
  // 0: fechada — o botão verde com a pontinha branca das pétalas dobradas por cima do olho.
  sprite('daisy-0', [
    '.....',
    '..W..',
    '.ggg.',
    '..g..',
    '.Gg..',
  ], C),
  // 1: abrindo — as pétalas em pé, o olho aparecendo entre elas.
  sprite('daisy-1', [
    '.....',
    '.w.w.',
    '.wyw.',
    '..g..',
    '.Gg..',
  ], C),
  // 2: aberta — a cruz de pétalas brancas em volta do olho.
  sprite('daisy-2', [
    '..w..',
    '.wyw.',
    '..w..',
    '..g..',
    '.Gg..',
  ], C),
] as const;

interface Daisy { bb: Billboard3D; lag: number; sway: number }

/** Quantos tiles em volta do herói têm touceira (a conta é fixa por tile: elas não mudam de lugar). */
const RX = 9;
const RY = 6;

export class Daisies implements NatureSystem {
  private readonly clumps = new Map<string, Daisy[]>();
  private lastHero = '';
  /** Quão abertas estão agora, de 0 a 1 (a janela do playtest). */
  public openness = 0;

  /** Onde estão as touceiras (a janela do playtest). */
  public get spots(): Array<{ x: number; y: number }> {
    return [...this.clumps.values()].filter((c) => c.length > 0).map((c) => ({ x: c[0].bb.x, y: c[0].bb.y }));
  }

  public get count(): number {
    let n = 0;
    for (const c of this.clumps.values()) n += c.length;
    return n;
  }

  public update(f: NatureFrame): void {
    if (f.season === 'winter') { this.clear(); return; }
    const heroKey = `${Math.round(f.hero.x)},${Math.round(f.hero.y)}`;
    if (heroKey !== this.lastHero) { this.lastHero = heroKey; this.stream(f); }
    // Abertas de dia; fechadas de noite e na chuva.
    const sun = window01(f.phase, 0.27, 0.36, 0.64, 0.73);
    this.openness = sun * (1 - Math.min(1, f.rain * 2.5));
    for (const clump of this.clumps.values()) {
      for (const d of clump) {
        // Cada flor um pouco no seu tempo (umas abrem antes, outras depois).
        const o = Math.max(0, Math.min(1, this.openness * 1.25 - d.lag));
        const lean = Math.sin(f.clock * 0.0021 + d.sway) * f.gust * 6;
        d.bb.setTexture(FRAMES[Math.min(2, Math.floor(o * 2.99))]).setAngle(lean);
      }
    }
  }

  /** As touceiras dos tiles em volta do herói: cria as que entram, apaga as que saem. */
  private stream(f: NatureFrame): void {
    const cx = Math.round(f.hero.x);
    const cy = Math.round(f.hero.y);
    const keep = new Set<string>();
    for (let y = cy - RY; y <= cy + RY; y += 1) {
      for (let x = cx - RX; x <= cx + RX; x += 1) {
        if (hash(x, y, 81) > 0.075) continue;
        const key = `${x},${y}`;
        keep.add(key);
        if (this.clumps.has(key)) continue;
        if (!f.host.isFree(x, y)) { this.clumps.set(key, []); continue; }
        const n = 3 + Math.floor(hash(x, y, 82) * 3);
        const clump: Daisy[] = [];
        for (let i = 0; i < n; i += 1) {
          const bb = world3d().objects.addBillboard(FRAMES[0], 0, { depthLayer: 'ground' })
            .setDisplaySize(5 / 16, 5 / 16)
            .setPosition(x + (hash(x, i, 83) - 0.5) * 0.7, y + (hash(i, y, 84) - 0.5) * 0.6);
          // O tom do chão do bioma, como as florzinhas do tileset (é a mesma família): sem ele, um branco solto. E a
          // pétala abaixo do bloom (2026-11-11): com 0,8 a margarida ao sol passava do limiar e cada touceira virava um
          // punhado de bolinhas acesas, purpurina pelo prado; com 0,5 o sol ainda a pinta branca e ela não acende.
          const [r, g, b] = biomeWashAt(x, y);
          (bb.mesh.material as THREE.MeshLambertMaterial).color.setRGB(r * DAISY_TONE, g * DAISY_TONE, b * DAISY_TONE);
          clump.push({ bb, lag: hash(x + i, y, 85) * 0.25, sway: hash(i, x, 86) * 6 });
        }
        this.clumps.set(key, clump);
      }
    }
    for (const [key, clump] of this.clumps) {
      if (keep.has(key)) continue;
      for (const d of clump) d.bb.destroy();
      this.clumps.delete(key);
    }
  }

  private clear(): void {
    for (const clump of this.clumps.values()) for (const d of clump) d.bb.destroy();
    this.clumps.clear();
    this.lastHero = '';
  }

  public destroy(): void {
    this.clear();
  }
}

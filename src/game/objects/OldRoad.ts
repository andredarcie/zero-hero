import * as THREE from 'three';

import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { registerTexture3D } from '@/game/render3d/textures3d';
import { world3d } from '@/game/render3d/World3D';
import { getGardenGates, getPlayerStart } from '@/game/world/WorldData';

/**
 * A ESTRADA ANTIGA (pedido do autor): da espada fincada, reto para o norte, até a escada do jardim do fim. Ela diz,
 * desde o primeiro passo, "ali é importante" — mas meio escondida, frágil, antiga: uma trilha só de terra
 * batida, a beira comida, buracos onde o capim atravessa, e quase apagada perto da
 * espada, firmando conforme chega ao jardim.
 *
 * Não muda o chão do mundo: é UMA película deitada sobre a grama (como o terreiro das casas), pintada pixel a pixel
 * na densidade do chão, 16 por tile. Fica abaixo dos tufos de enfeite, e os que `scripts/estrada-antiga.mjs`
 * deixou na linha atravessam a estrada. O script abre a linha no mundo; isto aqui só desenha.
 */

const TEXTURE = 'old-road';
const PX = 16;
/** Quantos tiles de mato entre a espada e o começo da estrada (o mesmo do script). */
export const ROAD_GRASS_GAP = 3;
/** Os passos que a abertura dá até fincar a espada (GameScene.INTRO_WALK_TILES). */
const INTRO_WALK_TILES = 3;
/** A largura da película, em tiles: um pouco mais que um tile, para a beira se desfazer no capim. */
const WIDTH_TILES = 1.25;
/** Um nada acima do chão e abaixo dos tufos (a decoração deita a 0,02). */
const ROAD_Y = 0.012;

const DIRT = ['#8f7a57', '#7c6849', '#6b593e', '#584930'] as const;
const PEBBLE = ['#a89a7c', '#4c4231'] as const;

const noise = (x: number, y: number, seed: number): number => {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
};
const blotch = (x: number, y: number, seed: number, cell: number): number => {
  const fx = x / cell; const fy = y / cell;
  const ix = Math.floor(fx); const iy = Math.floor(fy);
  const sx = (fx - ix) * (fx - ix) * (3 - 2 * (fx - ix));
  const sy = (fy - iy) * (fy - iy) * (3 - 2 * (fy - iy));
  const top = noise(ix, iy, seed) * (1 - sx) + noise(ix + 1, iy, seed) * sx;
  const bottom = noise(ix, iy + 1, seed) * (1 - sx) + noise(ix + 1, iy + 1, seed) * sx;
  return top * (1 - sy) + bottom * sy;
};

/**
 * A estrada pixel a pixel. `v` vai de 0 (a ponta da espada, ao sul) a 1 (o pé do portão). Em cada pixel: a que
 * distância ele está do meio da trilha (que serpenteia um nada), e quanta estrada sobra ali (`worn`, fraca no
 * começo). Terra onde a trilha cobre e o ruído deixa; capim (transparente) no resto. UMA trilha só, de pé: as duas
 * trilhas de roda chegaram a existir e saíram a pedido do autor ("faça apenas uma linha").
 */
const paintRoad = (w: number, h: number): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const mid = w / 2;
  for (let y = 0; y < h; y += 1) {
    // a ponta sul do canvas é a de baixo (y alto) — o lado da espada
    const v = 1 - y / (h - 1);
    // Rala (pedido do autor: "um pouco mais rala, um pouco mais fraca"): mesmo perto do jardim sobra capim no meio.
    const worn = 0.26 + 0.36 * Math.min(1, v * 1.25);
    const sway = (blotch(0, y, 7, 22) - 0.5) * 2.2;
    const half = 2.8 + (blotch(3, y, 11, 30) - 0.5) * 1.2;
    for (let x = 0; x < w; x += 1) {
      const rut = Math.abs(x + 0.5 - (mid + sway));
      // a trilha: inteira no meio, rasgando na beira
      const edge = half + (blotch(x, y, 3, 4) - 0.5) * 1.8;
      const cover = rut < edge ? 1 : rut < edge + 1.6 ? 0.45 : 0;
      // o capim atravessando: buracos que crescem onde a estrada é mais velha
      const gap = blotch(x, y, 5, 3) * 0.6 + noise(x, y, 9) * 0.4;
      if (cover <= 0 || gap > worn * cover + 0.08) continue;
      const tone = blotch(x, y, 13, 6) + (noise(x, y, 17) - 0.5) * 0.3;
      let color: string = DIRT[tone < 0.32 ? 0 : tone < 0.55 ? 1 : tone < 0.78 ? 2 : 3];
      if (noise(x, y, 23) > 0.985) color = noise(x, y, 29) > 0.5 ? PEBBLE[0] : PEBBLE[1];
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.62;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return canvas;
};

export class OldRoad {
  private body?: Billboard3D;

  public constructor() {
    const gate = getGardenGates()[0];
    const start = getPlayerStart();
    if (!gate || gate.worldX !== start.worldX) return;
    const sword = start.worldY - INTRO_WALK_TILES + 1;
    const from = sword - ROAD_GRASS_GAP; // a ponta sul, alguns passos à frente da espada
    const to = gate.worldY; // o tile do portão, que encosta no pé da escada
    const tiles = from - to + 1;
    const w = Math.round(WIDTH_TILES * PX);
    const h = tiles * PX;
    const tex = new THREE.CanvasTexture(paintRoad(w, h));
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    registerTexture3D(TEXTURE, tex);
    // Pintura no chão, por BAIXO das sombras: sem gravar profundidade e desenhada antes delas. Gravando, a
    // estrada brigava com a sombra do portão (0,02 contra 0,012) e piscava em listras no pé da escada.
    this.body = world3d().addBillboard(TEXTURE, 0, { flat: true, flatY: ROAD_Y, depthWrite: false, renderOrder: 1 })
      .setPosition(gate.worldX, (from + to) / 2)
      .setDisplaySize(WIDTH_TILES, tiles);
  }

  public destroy(): void {
    this.body?.destroy();
    this.body = undefined;
  }
}

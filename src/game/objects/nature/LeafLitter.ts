import * as THREE from 'three';

import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import { bosqueTrees } from '@/game/objects/BigTrees';
import type { Season } from '@/game/runtime/seasons';
import { isLifeHome } from '@/game/world/biomeLife';
import { biomeWashAt } from '@/game/world/biomes';

import { TILESET as P, hash, texture, type NatureFrame, type NatureSystem } from './kit';

/**
 * AS FOLHAS NO CHÃO (sugestão 6), debaixo das árvores do bosque. Folha caída é o chão de toda mata:
 *   · a QUANTIDADE acompanha o ano: pouca na primavera, um tanto no verão, MUITA no outono (e mais no segundo dia
 *     dele, que as folhas vão se juntando), e no inverno ficam as velhas, escuras;
 *   · a COR também: verdes no verão, ocre, âmbar e ferrugem no outono, marrom apodrecido no inverno;
 *   · mais folhas perto do tronco, rareando para a borda da copa; uns gravetos; e bolotas debaixo dos carvalhos
 *     no outono.
 * Cada folha é um pixel ou dois, no traço do tileset, e a peça leva a cor do bioma, como as copas.
 */

// Cores de folha CAÍDA: já secas, mais apagadas que as da copa (laranja vivo no chão lia como brasa).
const PALETTES: Record<Season, readonly string[]> = {
  spring: [P.leaf, P.leafDk],
  summer: [P.leafDk, P.leaf, P.barkDk],
  autumn: [P.ochre, P.fur, P.furDk, P.barkDk, P.sand],
  winter: [P.barkDk, P.stoneDk, P.furDk],
};
const DENSITY: Record<Season, readonly [number, number]> = {
  spring: [0.05, 0.06],
  summer: [0.08, 0.1],
  autumn: [0.24, 0.34],
  winter: [0.2, 0.2],
};

/** O desenho de um chão de folhas: elipse `w`×`h`, mais denso no meio. */
const litter = (key: string, w: number, h: number, season: Season, density: number, oak: boolean): string =>
  texture(key, w, h, (put) => {
    const pal = PALETTES[season];
    // A semente sai do nome inteiro: dois chãos de nome do mesmo tamanho não saem iguais.
    const seed = [...key].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 9973, 7);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const nx = (x + 0.5 - w / 2) / (w / 2);
        const ny = (y + 0.5 - h / 2) / (h / 2);
        const r = Math.hypot(nx, ny);
        if (r > 1) continue;
        // Mais folhas perto do tronco, rareando para a borda da copa.
        const p = density * (1.15 - r * 0.85);
        if (hash(x, y, seed) > p) continue;
        const c = pal[Math.floor(hash(y, x, seed + 1) * pal.length)];
        put(x, y, c);
        // Metade das folhas tem 2 px (deitada ou em pé), como as folhinhas do tileset.
        const k = hash(x, y, seed + 2);
        if (k < 0.3) put(x + 1, y, c); else if (k < 0.5) put(x, y + 1, c);
      }
    }
    // Uns gravetos.
    for (let i = 0; i < Math.round(w / 12); i += 1) {
      const gx = Math.round(w * (0.2 + hash(i, 1, seed) * 0.6));
      const gy = Math.round(h * (0.2 + hash(i, 2, seed) * 0.6));
      for (let k = 0; k < 3; k += 1) put(gx + k, gy + (k === 2 ? 1 : 0), P.barkDk);
    }
    // As bolotas, debaixo dos carvalhos, no outono.
    if (oak && season === 'autumn') {
      for (let i = 0; i < 5; i += 1) {
        const ax = Math.round(w * (0.25 + hash(i, 3, seed) * 0.5));
        const ay = Math.round(h * (0.25 + hash(i, 4, seed) * 0.5));
        put(ax, ay, P.barkDeep);
        put(ax, ay + 1, P.rust);
      }
    }
  });

interface Patch { bb: Billboard3D; oak: boolean }

export class LeafLitter implements NatureSystem {
  private readonly patches: Patch[] = [];
  private shownKey = '';

  public constructor() {
    const w3 = world3d();
    for (const t of bosqueTrees()) {
      // Só no bosque de outono (world/biomeLife).
      if (t.kind === 'log' || !isLifeHome('litter', t.x, t.y)) continue;
      const oak = t.kind === 'oak';
      const bb = w3.objects.addBillboard(litter('litter-init', 4, 4, 'summer', 0, false), 0, { flat: true, flatY: 0.014, depthWrite: false, alphaTest: 0.5, depthLayer: 'ground' })
        .setDisplaySize(oak ? 3.4 : 1.6, oak ? 2.4 : 1.1)
        // Um pouco ao sul do tronco: a parte do chão que a copa cobre e a câmera vê.
        .setPosition(t.x, t.y + (oak ? 0.35 : 0.2));
      // O tom do CHÃO do bioma (folha caída é chão), como o enfeite rasteiro do mapa.
      const [r, g, b] = biomeWashAt(t.x, t.y);
      (bb.mesh.material as THREE.MeshLambertMaterial).color.setRGB(r, g, b);
      this.patches.push({ bb, oak });
    }
  }

  /** A estação e quanto dela já passou (o 1º ou 2º dia). */
  public update(f: NatureFrame): void {
    const second = f.day % 2;
    const key = `${f.season}-${second}`;
    if (key === this.shownKey) return;
    this.shownKey = key;
    const density = DENSITY[f.season][second];
    this.patches.forEach((p, i) => {
      const k = `litter-${f.season}-${second}-${p.oak ? 'oak' : 'small'}-${i % 3}`;
      p.bb.setTexture(p.oak ? litter(k, 54, 38, f.season, density, true) : litter(k, 26, 18, f.season, density, false));
    });
  }

  public get season(): string {
    return this.shownKey;
  }

  public destroy(): void {
    for (const p of this.patches) p.bb.destroy();
    this.patches.length = 0;
  }
}

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { ANCIENT_GROVE, BIOME_DECOR } from '@/game/world/biomes';
import { bladeSwing, grownHeight } from './grassBlades';
import {
  buildStandingDecorGeometry, collapsePiece, isFlexibleDecor, pieceHeight, SWING_MARGIN, type BladePiece, type ShadowDot,
  type StandingPiece,
} from './standingDecor';
import { tilesetFrameUv } from './textures3d';

// A DECORAÇÃO EM PÉ: é a decoração do mapa, toda ela, de pé. Estas são as promessas: a planta balança e o que é
// rígido fica parado; o quad em pé tem o pé onde a fileira de baixo da arte estava no chão; e deitado de volta ele
// cobre o mesmo chão que o adesivo antigo.

/** A peça do tile (10, 20), com 2 fileiras vazias embaixo do desenho. */
const piece = (over: Partial<StandingPiece> = {}): StandingPiece => {
  const pad = 2 / 16;
  return {
    x: 10, footZ: 20 + 0.5 - pad, y: 0.02, rootX: 10, rootZ: 20, frame: 7, pad, r: 1, g: 1, b: 1, ...over,
  };
};
/** O que o shader faz com o vértice no knob `stand` = 0 (decorSway.ts): o topo volta ao chão, para o norte. */
const laid = (y: number, z: number, h: number): [number, number] => [y - h, z - h];
const flexOf = (geo: THREE.BufferGeometry, quad: number): number => (geo.attributes.aFlex as THREE.BufferAttribute).getX(quad * 4);

describe('o que balança e o que fica parado', () => {
  it('mato, folhagem, arbusto florido e as flores são planta', () => {
    const plants = [0, 1, 7, 8, 19, 20, BIOME_DECOR.fern, BIOME_DECOR.mossBloom, BIOME_DECOR.wheat, BIOME_DECOR.daisies,
      BIOME_DECOR.poppies, BIOME_DECOR.bluebells, BIOME_DECOR.clover, ANCIENT_GROVE.bush, ANCIENT_GROVE.grass];
    for (const f of plants) expect(isFlexibleDecor(f)).toBe(true);
  });

  it('cogumelo, graveto, seixo, pedregulho, osso, cristal, brasa e folha caída ficam em pé e PARADOS', () => {
    const rigid = [2, 9, 10, 11, 12, 13, 27, 28, BIOME_DECOR.crystals, BIOME_DECOR.cinders, BIOME_DECOR.leaves];
    for (const f of rigid) expect(isFlexibleDecor(f)).toBe(false);
    const geo = buildStandingDecorGeometry([piece({ frame: 13 }), piece({ frame: 7, x: 11, rootX: 11 })]);
    expect(flexOf(geo, 0)).toBe(0);
    expect(flexOf(geo, 1)).toBe(1);
  });
});

describe('a malha da decoração em pé', () => {
  it('um quad em pé do tile mais a margem de balanço, com o pé na linha da fileira de baixo e a altura do desenho', () => {
    const p = piece();
    const geo = buildStandingDecorGeometry([p]);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const stand = geo.attributes.aStand as THREE.BufferAttribute;
    expect(pos.count).toBe(4);
    expect(pos.getX(0)).toBeCloseTo(9.5 - SWING_MARGIN);
    expect(pos.getX(1)).toBeCloseTo(10.5 + SWING_MARGIN);
    for (let v = 0; v < 4; v++) expect(pos.getZ(v)).toBeCloseTo(p.footZ);
    expect(pos.getY(2) - pos.getY(1)).toBeCloseTo(pieceHeight(p.pad));
    expect([stand.getZ(0), stand.getZ(1)]).toEqual([0, 0]);
    expect(stand.getZ(2)).toBeCloseTo(pieceHeight(p.pad));
    expect([stand.getX(2), stand.getY(2)]).toEqual([10, 20]); // a brisa e o abrir medem do centro do tile
  });

  it('a arte é a do próprio quadro do tileset, no lugar dela, sem as fileiras vazias de baixo', () => {
    const p = piece();
    const f = tilesetFrameUv(p.frame);
    const geo = buildStandingDecorGeometry([p]);
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    expect(uv.getY(0)).toBeCloseTo(f.v0 + p.pad * (f.v1 - f.v0));
    expect(uv.getY(2)).toBeCloseTo(f.v1);
    // 16 pixels de arte por tile, sem escala: a beira do quadro cai na beira do tile (a margem fica fora dele)
    const uAt = (x: number): number => uv.getX(0) + ((x - pos.getX(0)) / (pos.getX(1) - pos.getX(0))) * (uv.getX(1) - uv.getX(0));
    expect(uAt(9.5)).toBeCloseTo(f.u0);
    expect(uAt(10.5)).toBeCloseTo(f.u1);
  });

  it('deitada de volta, cobre o mesmo chão que o adesivo antigo: do norte do tile até a fileira de baixo da arte', () => {
    const p = piece();
    const pos = buildStandingDecorGeometry([p]).attributes.position as THREE.BufferAttribute;
    const h = pieceHeight(p.pad);
    // o topo esquerdo deita na linha norte do tile; o pé fica onde estava
    const [y, z] = laid(pos.getY(3), pos.getZ(3), h);
    expect(y).toBeCloseTo(p.y);
    expect(z).toBeCloseTo(p.rootZ - 0.5);
    expect(pos.getZ(0)).toBeCloseTo(p.rootZ + 0.5 - p.pad);
  });

  it('o quad em pé olha para a câmera (+z)', () => {
    const geo = buildStandingDecorGeometry([piece()]);
    const at = (k: number): THREE.Vector3 =>
      new THREE.Vector3().fromBufferAttribute(geo.attributes.position as THREE.BufferAttribute, geo.getIndex()!.getX(k));
    expect(new THREE.Triangle(at(0), at(1), at(2)).getNormal(new THREE.Vector3()).z).toBeCloseTo(1);
  });

  it('apagar dobra os quatro cantos no pé e tira a altura (sem farpa); o vizinho não muda', () => {
    const geo = buildStandingDecorGeometry([piece(), piece({ x: 11, rootX: 11 })]);
    collapsePiece(geo, 0);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const stand = geo.attributes.aStand as THREE.BufferAttribute;
    for (let v = 0; v < 4; v++) {
      expect([pos.getX(v), pos.getY(v), pos.getZ(v)]).toEqual([pos.getX(0), pos.getY(0), pos.getZ(0)]);
      expect(stand.getZ(v)).toBe(0);
    }
    expect(stand.getZ(6)).toBeGreaterThan(0);
  });

  it('a peça PARADA (o capim do meio da mata) é grama mas não balança, e o quad é só o desenho, sem margem', () => {
    const p = piece({ frame: 19, still: true });
    const f = tilesetFrameUv(p.frame);
    const geo = buildStandingDecorGeometry([p]);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    expect(isFlexibleDecor(19)).toBe(true);
    expect(flexOf(geo, 0)).toBe(0);
    expect([pos.getX(0), pos.getX(1)]).toEqual([9.5, 10.5]);
    expect(uv.getX(0)).toBeCloseTo(f.u0);
    expect(uv.getX(1)).toBeCloseTo(f.u1);
  });

  it('uma peça de tile não é fio: aBlade zerado, e a fase do tremular é a de sempre (0)', () => {
    const geo = buildStandingDecorGeometry([piece()]);
    const blade = geo.attributes.aBlade as THREE.BufferAttribute;
    const stand = geo.attributes.aStand as THREE.BufferAttribute;
    for (let v = 0; v < 4; v++) {
      expect([blade.getX(v), blade.getY(v), blade.getZ(v)]).toEqual([0, 0, 0]);
      expect(stand.getW(v)).toBe(0);
    }
  });
});

/**
 * Um fio do quadro 0 (coluna 4, fileiras 5 e 6: a ponta e o pé de ardósia), no tile (10, 20): o pé fica na borda de
 * baixo da fileira 6. A sombra de contato (fileira 7) é chão, e vem à parte (`dot`). Em pé, a haste cresce 3 vezes.
 */
const bladePiece = (over: Partial<BladePiece> = {}): BladePiece => ({
  blade: true, x: 9.5 + 4.5 / 16, rootX: 9.5 + 4.5 / 16, footZ: 19.5 + 7 / 16, y: 0.02, frame: 0,
  col: 4, top: 5, bottom: 6, base: 0, height: 2, footRows: 1, grow: 3, phase: 1.25, r: 1, g: 1, b: 1, ...over,
});

describe('um fio de grama em pé (grassBlades.ts)', () => {
  it('fica em pé no ponto do pé dele, de frente para a câmera; a malha guarda a altura da ARTE (quem cresce é o shader)', () => {
    const p = bladePiece();
    const geo = buildStandingDecorGeometry([p]);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    // um pixel de largura mais a margem por onde a ponta balança, centrado na coluna; a margem cabe na altura em pé
    const m = bladeSwing(grownHeight(p, p.grow));
    expect(m).toBe(3); // 1 de pé + 1 × 3 de haste = 4 pixels em pé: a ponta anda até 3
    expect(pos.getX(0)).toBeCloseTo(p.x - (0.5 + m) / 16);
    expect(pos.getX(1)).toBeCloseTo(p.x + (0.5 + m) / 16);
    for (let v = 0; v < 4; v++) expect(pos.getZ(v)).toBeCloseTo(p.footZ);
    expect(pos.getY(0)).toBeCloseTo(p.y);
    expect(pos.getY(2)).toBeCloseTo(p.y + 2 / 16);
  });

  it('lê só a coluna dele do atlas: a janela da arte é aquela coluna, e o vizinho do desenho nunca entra', () => {
    const p = bladePiece();
    const f = tilesetFrameUv(p.frame);
    const tu = (f.u1 - f.u0) / 16;
    const tv = (f.v1 - f.v0) / 16;
    const geo = buildStandingDecorGeometry([p]);
    const bounds = geo.attributes.aUvBounds as THREE.BufferAttribute;
    expect(bounds.getX(0)).toBeCloseTo(f.u0 + 4.5 * tu);
    expect(bounds.getZ(0)).toBeCloseTo(bounds.getX(0)); // uma coluna só
    expect(bounds.getY(0)).toBeCloseTo(f.v1 - 6.5 * tv); // o centro do pixel de baixo (fileira 6)
    expect(bounds.getW(0)).toBeCloseTo(f.v1 - 5.5 * tv); // o centro do de cima (fileira 5)
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    expect(uv.getY(0)).toBeCloseTo(f.v1 - 7 * tv);
    expect(uv.getY(2)).toBeCloseTo(f.v1 - 5 * tv);
  });

  it('diz ao shader que é fio, onde o pedaço fica nele, o tamanho do pé, a altura e o crescimento, e mede a brisa do pé', () => {
    const p = bladePiece({ base: 2, top: 1, bottom: 3, height: 7, footRows: 2, grow: 2 });
    const geo = buildStandingDecorGeometry([p]);
    const blade = geo.attributes.aBlade as THREE.BufferAttribute;
    const stand = geo.attributes.aStand as THREE.BufferAttribute;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    // (pixels abaixo do pedaço + 1, pixels do pé, altura, crescimento)
    expect([blade.getX(0), blade.getY(0), blade.getZ(0), blade.getW(0)]).toEqual([3, 2, 7, 2]);
    expect([stand.getX(0), stand.getY(0)]).toEqual([p.rootX, p.footZ]);
    expect(stand.getW(0)).toBeCloseTo(1.25);
    // um pedaço de cima começa onde o de baixo acaba: 2 pixels acima do pé, e sobe 3
    expect(stand.getZ(0)).toBeCloseTo(2 / 16);
    expect(stand.getZ(2)).toBeCloseTo(5 / 16);
    expect(pos.getY(0)).toBeCloseTo(p.y + 2 / 16);
  });

  it('deitado de volta, cada pixel cai na fileira em que estava no desenho', () => {
    const p = bladePiece();
    const pos = buildStandingDecorGeometry([p]).attributes.position as THREE.BufferAttribute;
    const stand = buildStandingDecorGeometry([p]).attributes.aStand as THREE.BufferAttribute;
    const north = 20 - 0.5;
    // o topo (borda de cima da fileira 5) e o pé (borda de baixo da fileira 6)
    expect(laid(pos.getY(3), pos.getZ(3), stand.getZ(3))[1]).toBeCloseTo(north + 5 / 16);
    expect(laid(pos.getY(0), pos.getZ(0), stand.getZ(0))[1]).toBeCloseTo(north + 7 / 16);
  });
});

describe('a sombra de contato do fio', () => {
  const dot: ShadowDot = {
    dot: true, x: 9.5 + 4.5 / 16, z: 19.5 + 7 / 16, footZ: 19.5 + 8 / 16, y: 0.02, frame: 0, col: 4, row: 7, r: 1, g: 1, b: 1,
  };

  it('fica DEITADA no chão, na frente do pé, olhando para cima, do tamanho de um pixel', () => {
    const geo = buildStandingDecorGeometry([dot]);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let v = 0; v < 4; v++) expect(pos.getY(v)).toBeCloseTo(dot.y);
    expect(Math.abs(pos.getX(1) - pos.getX(0))).toBeCloseTo(1 / 16);
    expect(pos.getZ(0)).toBeCloseTo(dot.z + 1 / 16); // a borda sul
    expect(pos.getZ(3)).toBeCloseTo(dot.z); // a borda norte, encostada no pé do fio
    const at = (k: number): THREE.Vector3 => new THREE.Vector3().fromBufferAttribute(pos, geo.getIndex()!.getX(k));
    expect(new THREE.Triangle(at(0), at(1), at(2)).getNormal(new THREE.Vector3()).y).toBeCloseTo(1);
  });

  it('é chão: não balança, não cresce e não é fio', () => {
    const geo = buildStandingDecorGeometry([dot]);
    const flex = geo.attributes.aFlex as THREE.BufferAttribute;
    const blade = geo.attributes.aBlade as THREE.BufferAttribute;
    const stand = geo.attributes.aStand as THREE.BufferAttribute;
    for (let v = 0; v < 4; v++) {
      expect(flex.getX(v)).toBe(0);
      expect(blade.getX(v)).toBe(0);
      expect(stand.getZ(v)).toBe(0);
    }
  });
});

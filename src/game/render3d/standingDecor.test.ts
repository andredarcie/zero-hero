import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { ANCIENT_GROVE, BIOME_DECOR } from '@/game/world/biomes';
import { buildStandingDecorGeometry, collapsePiece, isFlexibleDecor, pieceHeight, setPieceRustle, SWING_MARGIN, type StandingPiece } from './standingDecor';
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

  it('apagar dobra os quatro cantos no pé e tira a altura e o pisão (sem farpa); o vizinho não muda', () => {
    const geo = buildStandingDecorGeometry([piece(), piece({ x: 11, rootX: 11 })]);
    setPieceRustle(geo, 0, 3);
    collapsePiece(geo, 0);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const stand = geo.attributes.aStand as THREE.BufferAttribute;
    for (let v = 0; v < 4; v++) {
      expect([pos.getX(v), pos.getY(v), pos.getZ(v)]).toEqual([pos.getX(0), pos.getY(0), pos.getZ(0)]);
      expect([stand.getZ(v), stand.getW(v)]).toEqual([0, 0]);
    }
    expect(stand.getZ(6)).toBeGreaterThan(0);
  });

  it('o pisão vai para o shader nos quatro cantos do quad (a curva o leva da ponta ao pé), e só no dele', () => {
    const geo = buildStandingDecorGeometry([piece(), piece({ x: 11, rootX: 11 })]);
    const stand = geo.attributes.aStand as THREE.BufferAttribute;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const before = Array.from(pos.array as Float32Array);
    setPieceRustle(geo, 0, 3);
    expect([0, 1, 2, 3].map((v) => stand.getW(v))).toEqual([3, 3, 3, 3]);
    expect([4, 5, 6, 7].map((v) => stand.getW(v))).toEqual([0, 0, 0, 0]);
    expect(Array.from(pos.array as Float32Array)).toEqual(before); // a geometria não se mexe: quem curva é o shader
    setPieceRustle(geo, 0, 0);
    expect(stand.getW(0)).toBe(0);
  });
});

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { makeFireGlowMaterial, setFireGlow } from '../glowMaterials';
import { GlowField } from './GlowField';

/** Uma poça solta, como WorldLights.acquireGlow a faz: a malha guarda o lugar, o tamanho e a força. */
const pool = (x: number, z: number, size: number, opacity: number): THREE.Mesh => {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), makeFireGlowMaterial());
  setFireGlow(mesh, x, z, size, opacity);
  return mesh;
};

// Sem ponto flutuante (o caminho por pixel): a escolha das poças e o quadro no chão são os mesmos dos dois caminhos.
const field = (): GlowField => new GlowField(new THREE.Scene(), false);
const renderer = null as unknown as THREE.WebGLRenderer;
const view = { minX: 0, maxX: 40, minZ: 0, maxZ: 30 };

describe('o campo das poças de luz (GlowField: todas as poças num desenho só)', () => {
  it('soma só as poças acesas e à vista, e deita o quadro sobre a união delas', () => {
    const f = field();
    const a = pool(10, 10, 4, 0.5);
    const b = pool(14, 12, 2, 0.3);
    const off = pool(20, 20, 4, 0); // apagada (força zero)
    const hidden = pool(22, 20, 4, 0.5);
    hidden.visible = false; // devolvida ao pool
    const far = pool(100, 100, 4, 0.5); // fora da vista
    f.update([a, b, off, hidden, far], view, renderer);
    expect(f.size).toBe(2);
    expect(f.mesh.visible).toBe(true);
    // a união dos quadrados das duas: x 8..15, z 8..13
    expect(f.mesh.position.x).toBeCloseTo(11.5, 6);
    expect(f.mesh.position.z).toBeCloseTo(10.5, 6);
    expect(f.mesh.scale.x).toBeCloseTo(7, 6);
    expect(f.mesh.scale.z).toBeCloseTo(5, 6);
  });

  it('a união é recortada pela área visível', () => {
    const f = field();
    f.update([pool(1, 1, 10, 0.5)], view, renderer);
    expect(f.mesh.position.x - f.mesh.scale.x / 2).toBeCloseTo(0, 6);
    expect(f.mesh.position.z - f.mesh.scale.z / 2).toBeCloseTo(0, 6);
    expect(f.mesh.position.x + f.mesh.scale.x / 2).toBeCloseTo(6, 6);
  });

  it('sem poça à vista o quadro some', () => {
    const f = field();
    f.update([pool(10, 10, 4, 0.5)], view, renderer);
    expect(f.mesh.visible).toBe(true);
    f.update([], view, renderer);
    expect(f.size).toBe(0);
    expect(f.mesh.visible).toBe(false);
  });
});

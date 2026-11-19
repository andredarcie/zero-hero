import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { GroundLightMap } from './GroundLightMap';
import { groundLightReachUniform, lightWobbleUniform } from './pixelArtLight';

// Sem EXT_color_buffer_float o mapa não desenha nada — mas o alcance das luzes é medido igual (o shader o usa sozinho).
const renderer = { extensions: { has: () => false } } as unknown as THREE.WebGLRenderer;
const camera = (): THREE.PerspectiveCamera => {
  const c = new THREE.PerspectiveCamera(30, 1.6, 0.1, 120);
  c.position.set(10, 14, 20);
  c.lookAt(10, 0, 5);
  c.updateMatrixWorld();
  return c;
};

describe('o alcance das luzes pontuais (GroundLightMap → groundLightReachUniform)', () => {
  it('é a caixa das esferas de corte das luzes ACESAS, com a folga do tremor', () => {
    const scene = new THREE.Scene();
    const lit = new THREE.PointLight(0xffaa66, 1.5, 4, 1);
    lit.position.set(10, 1.1, 5);
    const dark = new THREE.PointLight(0xffaa66, 0, 32, 1);
    dark.position.set(100, 1.1, 100);
    scene.add(lit, dark);
    const map = new GroundLightMap(renderer, () => [lit, dark]);
    map.update(renderer, camera());
    const slack = Math.abs(lightWobbleUniform.value as number) * 0.75 + 0.25;
    const r = groundLightReachUniform.value;
    expect(r.x).toBeCloseTo(10 - 4 - slack, 5);
    expect(r.y).toBeCloseTo(5 - 4 - slack, 5);
    expect(r.z).toBeCloseTo(10 + 4 + slack, 5);
    expect(r.w).toBeCloseTo(5 + 4 + slack, 5);
    map.dispose();
  });

  it('sem luz acesa a caixa sai do avesso (todo ponto é "longe"), e sem corte a luz alcança o mundo inteiro', () => {
    const scene = new THREE.Scene();
    const dark = new THREE.PointLight(0xffaa66, 0, 32, 1);
    scene.add(dark);
    const map = new GroundLightMap(renderer, () => [dark]);
    map.update(renderer, camera());
    const r = groundLightReachUniform.value;
    expect(r.x).toBeGreaterThan(r.z);
    expect(r.y).toBeGreaterThan(r.w);
    const endless = new THREE.PointLight(0xffffff, 1, 0, 2); // distance 0 = sem corte
    scene.add(endless);
    const map2 = new GroundLightMap(renderer, () => [endless]);
    map2.update(renderer, camera());
    expect(r.x).toBeLessThanOrEqual(-1e9);
    expect(r.z).toBeGreaterThanOrEqual(1e9);
    map.dispose();
    map2.dispose();
  });
});

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WorldLights, type WorldLightsHost } from './WorldLights';

const makeLights = (): { lights: WorldLights; scene: THREE.Scene } => {
  const scene = new THREE.Scene();
  const host = {
    scene, hero: {}, params: {}, probe: { fireCastLists: new Map() }, shadowLight: new THREE.PointLight(),
  } as unknown as WorldLightsHost;
  return { lights: new WorldLights(host), scene };
};

describe('a luz da janela no terreiro (addStillGlow)', () => {
  it('é só o desenho no chão: nasce apagada, no lugar e no tamanho pedidos, e não é fogo nem luz', () => {
    const { lights, scene } = makeLights();
    const pool = lights.addStillGlow(5, 7, 4, 0.3);
    expect(scene.children).toHaveLength(1);
    const mesh = scene.children[0] as THREE.Mesh;
    expect(mesh.visible).toBe(false);
    expect(mesh.position.x).toBe(5);
    expect(mesh.position.z).toBe(7);
    expect(mesh.scale.x).toBe(4);
    expect((mesh.material as THREE.MeshBasicMaterial).opacity).toBeCloseTo(0.3, 6);
    // Quem conta fogos (a sombra projetada, as sondas dos playtests) não pode ver uma janela.
    expect(lights.fires).toHaveLength(0);
    expect(scene.children.some((c) => (c as THREE.Light).isLight)).toBe(false);
    pool.setVisible(true);
    expect(mesh.visible).toBe(true);
  });

  it('devolve a malha ao pool quando a casa some, e o próximo fogo a reaproveita', () => {
    const { lights, scene } = makeLights();
    const pool = lights.addStillGlow(5, 7, 4, 0.3);
    pool.setVisible(true);
    pool.destroy();
    expect(scene.children[0].visible).toBe(false);
    expect(lights.freeGlows).toHaveLength(1);
    lights.addFireLight(1, 1, true);
    expect(scene.children).toHaveLength(1);
    expect(lights.freeGlows).toHaveLength(0);
    expect(lights.fires).toHaveLength(1);
  });
});

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { cullFarChildren } from '@/game/render3d/sceneCull';

const VIEW = { minX: 0, maxX: 20, minZ: 0, maxZ: 12 };
const PAD = 8;

const quad = (x: number, z: number, size = 1): THREE.Mesh => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial());
  m.position.set(x, 0, z);
  return m;
};

describe('cullFarChildren', () => {
  it('o pequeno longe sai, o pequeno perto fica, e a lista da cena volta inteira', () => {
    const scene = new THREE.Scene();
    const near = quad(10, 6);
    const edge = quad(-PAD + 0.5, 6); // fora da tela, mas dentro do alcance de uma sombra
    const far = quad(60, 6);
    scene.add(near, edge, far);
    const kept: THREE.Object3D[] = [];
    const all = cullFarChildren(scene, VIEW, kept, PAD);
    expect(scene.children).toEqual([near, edge]);
    expect(all).toEqual([near, edge, far]);
    scene.children = all;
    expect(near.parent).toBe(scene);
    expect(far.parent).toBe(scene);
  });

  it('o grande, o instanciado e quem desligou o culling ficam sempre; o invisível sai, menos a luz', () => {
    const scene = new THREE.Scene();
    const big = quad(200, 200, 40);
    const instanced = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial(), 4);
    instanced.position.set(300, 0, 300);
    const unculled = quad(500, 500);
    unculled.frustumCulled = false;
    const hidden = quad(10, 6);
    hidden.visible = false;
    const light = new THREE.PointLight();
    light.visible = false;
    scene.add(big, instanced, unculled, hidden, light);
    cullFarChildren(scene, VIEW, [], PAD);
    expect(scene.children).toEqual([big, instanced, unculled, light]);
  });

  it('a escala conta, e trocar a geometria reclassifica', () => {
    const scene = new THREE.Scene();
    const m = quad(60, 6);
    scene.add(m);
    const kept: THREE.Object3D[] = [];
    cullFarChildren(scene, VIEW, kept, PAD);
    expect(scene.children).toEqual([]);
    scene.children = [m];
    // Esticado para 5 tiles de raio ele deixa de ser "pequeno": fica, mesmo longe.
    m.scale.set(10, 10, 10);
    cullFarChildren(scene, VIEW, kept, PAD);
    expect(scene.children).toEqual([m]);
    scene.children = [m];
    m.scale.set(1, 1, 1);
    m.geometry = new THREE.PlaneGeometry(12, 12);
    cullFarChildren(scene, VIEW, kept, PAD);
    expect(scene.children).toEqual([m]);
  });
});

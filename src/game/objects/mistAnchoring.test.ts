import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import { AmbientParticles } from '@/game/render3d/AmbientParticles';
import { MorningMist } from './nature/MorningMist';
import type { NatureFrame } from './nature/kit';

class FogSprite {
  public readonly mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  public setTint(): this { return this; }
  public setDisplaySize(): this { return this; }
  public setElevation(): this { return this; }
  public setPosition(x: number, z: number): this { this.mesh.position.set(x, 0, z); return this; }
  public setAlpha(value: number): this { this.mesh.material.opacity = value; return this; }
  public destroy(): void { this.mesh.removeFromParent(); }
}

vi.mock('@/game/world/WorldData', () => ({
  getWorldBounds: () => ({ minTileX: 0, minTileY: 0, maxTileX: 30, maxTileY: 12 }),
}));

vi.mock('@/game/render3d/World3D', () => ({
  world3d: () => ({ objects: { addBillboard: () => new FogSprite() }, params: { daylight: 0.7 } }),
}));

describe('névoa ancorada no cenário', () => {
  it('conserva os bancos do amanhecer ao sair da geada e voltar no mesmo instante', () => {
    const mist = new MorningMist();
    const hero = { x: 4, y: 4 };
    const frame: NatureFrame = {
      hero, phase: 0.27, clock: 4000, dt: 0, day: 4, season: 'autumn', heroMoving: false,
      rain: 0, sinceRain: 1, wind: 0.001, gust: 0, windyDay: false,
      host: {
        hero: () => hero, home: (x) => Number(x < 12), isWater: () => false, isFree: () => true,
        treesNear: () => [], rain: () => 0, busy: () => false,
      },
    };
    const state = () => mist['puffs'].map(({ bb }) => bb.mesh.position.toArray());
    mist.update(frame);
    const original = state();
    hero.x = 23;
    mist.update(frame);
    hero.x = 4;
    mist.update(frame);
    expect({ positions: state(), seeded: original.length > 0 }).toEqual({ positions: original, seeded: true });
  });

  it('mostra as mesmas partículas ao voltar à mesma câmera e ao mesmo instante', () => {
    const camp = { worldX: 4, worldY: 4 };
    const farCamp = { worldX: 27, worldY: 10 };
    const particles = new AmbientParticles(new THREE.Scene(), new THREE.Texture(), { greenTiles: [], litFires: [camp, farCamp] });
    const knobs = { daylight: 0.4, mist: 1, fireflies: 0 };
    const view = { x: 4, z: 4 };
    const state = () => [...particles['mist'].pos, ...particles['mist'].col];
    particles.update(0, 5, view, camp, knobs);
    const original = state();
    particles.update(0, 5, { x: 27, z: 10 }, farCamp, knobs);
    particles.update(0, 5, view, camp, knobs);
    expect(state()).toEqual(original);
  });
});

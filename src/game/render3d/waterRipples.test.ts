import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { rippleSpot, WATER_RIPPLE_SLOTS, waterRipplesUniform, WaterRipples } from './waterRipples';

// Um rio de um tile de largura na fileira z = 20, de x = 0 a 9.
const river = (x: number, z: number): boolean => z === 20 && x >= 0 && x <= 9;

describe('onde o passo cai na água', () => {
  it('no vau o anel nasce debaixo do corpo', () => {
    expect(rippleSpot(4.2, 20.1, river)).toEqual({ x: 4.2, z: 20.1 });
  });

  it('na beira ele nasce na água mais perto, um pouco para dentro do tile', () => {
    const spot = rippleSpot(4, 19, river);
    expect(spot).not.toBeNull();
    expect(spot!.x).toBeCloseTo(4);
    expect(spot!.z).toBeCloseTo(19.6);
  });

  it('longe da água, nenhum anel', () => {
    expect(rippleSpot(4, 17, river)).toBeNull();
    expect(rippleSpot(15, 19, river)).toBeNull();
  });
});

describe('os passos de quem anda na beira', () => {
  const setup = (): { body: THREE.Object3D; clock: { t: number }; ripples: WaterRipples; live: () => THREE.Vector4[] } => {
    const scene = new THREE.Scene();
    const body = new THREE.Object3D();
    scene.add(body);
    const clock = { t: 5 };
    for (const s of waterRipplesUniform.value) s.set(0, 0, -100, 0);
    const ripples = new WaterRipples({ actors: () => [body], isWater: river, now: () => clock.t });
    return { body, clock, ripples, live: () => waterRipplesUniform.value.filter((s) => s.w > 0) };
  };

  it('cada passo na beira larga um anel com a hora dele; o primeiro quadro só conhece o corpo', () => {
    const { body, clock, ripples, live } = setup();
    body.position.set(2, 0, 19);
    ripples.update();
    expect(live()).toHaveLength(0);
    clock.t = 6;
    body.position.set(2.5, 0, 19);
    ripples.update();
    expect(live()).toHaveLength(1);
    expect(live()[0].z).toBe(6);
  });

  it('andar longe da água ou saltar (teleporte) não deixa anel', () => {
    const { body, ripples, live } = setup();
    body.position.set(2, 0, 15);
    ripples.update();
    body.position.set(3, 0, 15);
    ripples.update();
    body.position.set(3, 0, 19.5);
    ripples.update(); // 4,5 tiles de uma vez: salto
    expect(live()).toHaveLength(0);
  });

  it('os anéis são um anel de slots: o novo toma o lugar do mais velho', () => {
    const { body, clock, ripples, live } = setup();
    body.position.set(0, 0, 19);
    ripples.update();
    for (let i = 1; i <= WATER_RIPPLE_SLOTS + 1; i++) {
      clock.t = i;
      body.position.set(i * 0.5, 0, 19);
      ripples.update();
    }
    expect(live()).toHaveLength(WATER_RIPPLE_SLOTS);
    expect(Math.min(...live().map((s) => s.z))).toBe(2);
  });
});

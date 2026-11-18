import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { defaultWorld3DParams } from '@/game/render3d/worldParams';
import { fitFrame, MEDITATION_MARGINS, meditationShot, type FrameLens } from './meditationFrame';

// O QUADRO DA MEDITAÇÃO cabe a cerejeira e o herói JUSTOS em toda tela: dentro das margens, e sem sobra de vale.

/** O FOV que o jogo usa para esta proporção (WorldScreen.effectiveFov: a tela em pé abre o FOV até ver largura). */
const fovFor = (aspect: number): number => {
  const need = THREE.MathUtils.radToDeg(2 * Math.atan(0.2646 / aspect));
  return Math.min(Math.max(30, 74), Math.max(30, need));
};

const SCREENS: ReadonlyArray<readonly [string, number, number]> = [
  ['celular em pé', 390, 844],
  ['celular deitado', 844, 390],
  ['tablet em pé', 820, 1180],
  ['tablet deitado', 1180, 820],
  ['monitor 16:9', 1920, 1080],
  ['notebook 125%', 1536, 730],
];

// Os números do vale: a pedra (MeditationSpot), a pilha, e onde o desenho da cerejeira pousa (SakuraTree).
const SHOT = meditationShot({ x: 44, y: 39 }, { x: 46, y: 39 }, { x: 45, y: 38.35 });
const flat = (): number => 0;

describe('o quadro da meditação', () => {
  for (const [name, w, h] of SCREENS) {
    it(`${name} (${w}×${h}): tudo dentro das margens, e o conjunto enche a tela`, () => {
      const p = defaultWorld3DParams();
      const lens: FrameLens = { fov: fovFor(w / h), aspect: w / h, height: p.camHeight, back: p.camBack, zoom: 1, ground: 0 };
      const frame = fitFrame(SHOT, lens, flat, MEDITATION_MARGINS);
      const cam = new THREE.PerspectiveCamera(lens.fov, lens.aspect, 0.1, 1000);
      cam.position.set(frame.look.x, p.camHeight * frame.dolly, frame.look.y + p.camBack * frame.dolly);
      cam.lookAt(frame.look.x, 0.4, frame.look.y);
      cam.updateMatrixWorld();
      const pts = SHOT.map(([x, y, e]) => new THREE.Vector3(x, e, y).project(cam));
      const xs = pts.map((v) => v.x);
      const ys = pts.map((v) => v.y);
      const m = MEDITATION_MARGINS;
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(-(1 - m.side) - 1e-6);
      expect(Math.max(...xs)).toBeLessThanOrEqual(1 - m.side + 1e-6);
      expect(Math.max(...ys)).toBeLessThanOrEqual(1 - m.top + 1e-6);
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(-(1 - m.bottom) - 1e-6);
      // Justo: na largura ou na altura, o conjunto ocupa quase todo o espaço entre as margens.
      const fillX = (Math.max(...xs) - Math.min(...xs)) / (2 * (1 - m.side));
      const fillY = (Math.max(...ys) - Math.min(...ys)) / (2 - m.top - m.bottom);
      expect(Math.max(fillX, fillY)).toBeGreaterThan(0.95);
    });
  }

  it('o zoom do jogador não muda o quadro: o dolly compensa', () => {
    const p = defaultWorld3DParams();
    const lens: FrameLens = { fov: 30, aspect: 16 / 9, height: p.camHeight, back: p.camBack, zoom: 1, ground: 0 };
    const a = fitFrame(SHOT, lens, flat, MEDITATION_MARGINS);
    const b = fitFrame(SHOT, { ...lens, zoom: 1.25 }, flat, MEDITATION_MARGINS);
    expect(b.dolly / 1.25).toBeCloseTo(a.dolly, 1);
  });
});

import { describe, expect, it } from 'vitest';

import { DialogCamera, type DialogCameraHost } from './DialogCamera';

// O OLHAR DA CÂMERA PARA UM PONTO (a cadeira do lago, a meditação, a luneta): ele chega deslizando e, chegado, fica.
// O defeito era o blend descer um passo e subir no seguinte com o olhar inteiro: a câmera tremia a cada dois quadros.

const host = (look: { x: number; y: number; drift?: number } | undefined): DialogCameraHost =>
  ({ cameraLook: look, cameraLookBlend: 0, time: { now: 0 } }) as unknown as DialogCameraHost;

describe('o olhar da câmera para um ponto', () => {
  it('chega e fica parado: nenhum quadro treme depois de chegar', () => {
    const h = host({ x: 10, y: 5, drift: 0 });
    const cam = new DialogCamera(h);
    const offsets = Array.from({ length: 90 }, () => cam.cameraLookOffset(33, 0, 0));
    expect(h.cameraLookBlend).toBe(1);
    for (const o of offsets.slice(-40)) expect(o).toEqual({ x: 10, y: 5 });
  });

  it('sem olhar, volta ao herói e para em zero', () => {
    const h = host({ x: 10, y: 5, drift: 0 });
    const cam = new DialogCamera(h);
    for (let i = 0; i < 60; i += 1) cam.cameraLookOffset(33, 0, 0);
    (h as { cameraLook?: unknown }).cameraLook = undefined;
    for (let i = 0; i < 60; i += 1) cam.cameraLookOffset(33, 0, 0);
    expect(h.cameraLookBlend).toBe(0);
    expect(cam.cameraLookOffset(33, 0, 0)).toEqual({ x: 0, y: 0 });
  });
});

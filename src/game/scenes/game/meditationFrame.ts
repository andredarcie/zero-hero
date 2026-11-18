// O ENQUADRAMENTO DA MEDITAÇÃO (pedido do autor, 2026-11-16): a câmera sobe até caber o herói na pedra e a cerejeira
// inteira, JUSTOS, com uma margem e sem sobra de vale em volta, em qualquer tela (celular em pé, tablet, monitor). Um
// fator fixo de afastamento não serve: o celular em pé vê pouco de largura, o monitor vê pouco de altura. Então o
// quadro é CALCULADO: a câmera de sempre (a mesma altura e recuo, o mesmo FOV que a tela usa) é levada de mais perto
// para mais longe até todos os pontos caberem, com o alvo ajustado para o conjunto ficar no meio da tela.

import * as THREE from 'three';

import { SAKURA_H, SAKURA_W } from '@/game/render3d/sakuraArt';

/** Um ponto que tem de caber no quadro: o tile (x, y) e a altura acima do chão dali, em tiles. */
export type FramePoint = readonly [x: number, y: number, elevation: number];

/** Quanto a câmera passeia de um lado para o outro lá em cima (tiles): pouco, para o quadro justo não cortar a árvore. */
export const MEDITATION_DRIFT = 0.12;
/** As margens do quadro da meditação: embaixo, mais (os botões do toque e a legenda moram lá). */
export const MEDITATION_MARGINS: FrameMargins = { side: 0.06, top: 0.1, bottom: 0.18 };

/**
 * O QUE O QUADRO DA MEDITAÇÃO TEM DE MOSTRAR: a copa inteira (as quinas dela, alargadas pelo passeio da câmera), o
 * herói sentado na pedra com um palmo de chão embaixo, e a pilha de pedras. `tree` é onde o desenho da cerejeira
 * pousa (SakuraTree: o tronco em x, o desenho em y).
 */
export const meditationShot = (
  seat: { x: number; y: number }, cairn: { x: number; y: number }, tree: { x: number; y: number },
): FramePoint[] => {
  const half = SAKURA_W / 32 + MEDITATION_DRIFT;
  const top = SAKURA_H / 16;
  return [
    [tree.x - half, tree.y, top], [tree.x + half, tree.y, top],
    [tree.x - half, tree.y, 1.5], [tree.x + half, tree.y, 1.5],
    [seat.x, seat.y + 0.7, 0], [cairn.x, cairn.y + 0.6, 0],
  ];
};

/** A câmera do quadro (ver CameraRig.render): ela fica em alvo + (0, altura, recuo) × dolly ÷ zoom, olhando o alvo. */
export interface FrameLens {
  /** FOV vertical (graus) e a proporção da tela: os da câmera do jogo agora (WorldScreen.effectiveFov). */
  fov: number;
  aspect: number;
  /** Altura e recuo no dolly 1 (worldParams, ou o `dollyBase` do Cinema). */
  height: number;
  back: number;
  /** O zoom do jogador (graphicsSettings), que divide a distância: o quadro sai o mesmo com qualquer zoom. */
  zoom: number;
  /** A altura do chão sob o herói: é ela que a câmera usa como alvo (CameraRig.follow). */
  ground: number;
}

/** As margens, em fração da meia-tela (0,1 = 5% da tela de cada lado). */
export interface FrameMargins {
  side: number;
  top: number;
  bottom: number;
}

export interface Frame {
  /** O fator do dolly (Cinema.dollyTo): menor que 1 aproxima. */
  dolly: number;
  /** O ponto do chão para onde a câmera olha (o `cameraLook`). */
  look: { x: number; y: number };
}

const DOLLY_MIN = 0.6;
const DOLLY_MAX = 2.2;
const DOLLY_STEP = 0.01;

/**
 * O menor dolly em que todos os `points` cabem dentro das margens, com o conjunto no meio da tela (na horizontal, o
 * meio dos pontos; na vertical, o alvo que centra o que se vê). Se nem o mais longe cabe, devolve o mais longe.
 */
export const fitFrame = (
  points: readonly FramePoint[],
  lens: FrameLens,
  groundAt: (x: number, y: number) => number,
  margins: FrameMargins,
): Frame => {
  const cam = new THREE.PerspectiveCamera(lens.fov, lens.aspect, 0.1, 1000);
  const v = new THREE.Vector3();
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const lx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const world = points.map(([x, y, e]) => [x, groundAt(x, y) + e, y] as const);
  const bounds = (f: number, lz: number): { left: number; right: number; top: number; bottom: number } => {
    const d = f / Math.max(0.05, lens.zoom);
    cam.position.set(lx, lens.ground + lens.height * d, lz + lens.back * d);
    cam.lookAt(lx, lens.ground + 0.4, lz);
    cam.updateMatrixWorld();
    let left = Infinity;
    let right = -Infinity;
    let top = -Infinity;
    let bottom = Infinity;
    for (const [x, y, z] of world) {
      v.set(x, y, z).project(cam);
      left = Math.min(left, v.x);
      right = Math.max(right, v.x);
      top = Math.max(top, v.y);
      bottom = Math.min(bottom, v.y);
    }
    return { left, right, top, bottom };
  };
  const maxTop = 1 - margins.top;
  const minBottom = -(1 - margins.bottom);
  const middle = (maxTop + minBottom) / 2;
  let frame: Frame = { dolly: DOLLY_MAX, look: { x: lx, y: (Math.min(...ys) + Math.max(...ys)) / 2 } };
  for (let f = DOLLY_MIN; f <= DOLLY_MAX + 1e-9; f += DOLLY_STEP) {
    // O alvo que centra o conjunto na vertical: olhar mais ao sul sobe tudo na tela.
    let lo = Math.min(...ys) - 10;
    let hi = Math.max(...ys) + 10;
    for (let i = 0; i < 32; i += 1) {
      const mid = (lo + hi) / 2;
      const b = bounds(f, mid);
      if ((b.top + b.bottom) / 2 > middle) hi = mid; else lo = mid;
    }
    const lz = (lo + hi) / 2;
    const b = bounds(f, lz);
    frame = { dolly: f, look: { x: lx, y: lz } };
    if (b.left >= -(1 - margins.side) && b.right <= 1 - margins.side && b.top <= maxTop && b.bottom >= minBottom) return frame;
  }
  return frame;
};

// O QUE MAIS DE UMA PEÇA DO EDITOR USA: o tamanho do tile no tabuleiro, a folga da câmera e os limites do zoom. Cada
// peça (scenes/editor/) importa daqui em vez de uma da outra.



export const WORLD_TILE = 16; // px per tile in editor world-space (native tileset frame size)

export const CAMERA_PAD = WORLD_TILE * 10;

export const MIN_ZOOM = 0.3;

export const MAX_ZOOM = 8;

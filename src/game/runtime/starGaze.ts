// A PRIMEIRA NOITE NO ACAMPAMENTO, em segundos (pedido do autor): deitado, o escuro chega de vez e a câmera sobe
// devagar até o céu, fica olhando as estrelas, passa uma estrela cadente bem rápida, e ela volta para o chão — e só
// então a Morte aparece. Esta é a regra pura (o quanto a câmera está no céu e onde está a estrela cadente a cada
// instante); quem desenha é entities/StarGaze.

/** A subida: devagar, do herói deitado até o céu. */
export const GAZE_UP_S = 7.5;
/** Olhando as estrelas, antes e depois da estrela cadente. */
export const GAZE_HOLD_S = 10;
/** A volta para o chão. */
export const GAZE_DOWN_S = 5.5;
/** A estrela cadente passa depois de um tempo olhando (4,5 s parado lá em cima), e bem rápido. */
export const METEOR_AT_S = GAZE_UP_S + 4.5;
export const METEOR_S = 0.8;
export const GAZE_TOTAL_S = GAZE_UP_S + GAZE_HOLD_S + GAZE_DOWN_S;

export interface GazeFrame {
  /** 0 = a câmera de sempre, 1 = olhando o céu (CameraLens.blend). */
  blend: number;
  /** Onde está a cabeça da estrela cadente (0..1), ou -1 sem ela. */
  meteor: number;
}

/** Sobe e desce sem tranco: a velocidade começa e termina em zero. */
const ease = (x: number): number => {
  const k = Math.min(1, Math.max(0, x));
  return 0.5 - 0.5 * Math.cos(k * Math.PI);
};

export const gazeFrame = (t: number): GazeFrame => {
  let blend: number;
  if (t < GAZE_UP_S) blend = ease(t / GAZE_UP_S);
  else if (t < GAZE_UP_S + GAZE_HOLD_S) blend = 1;
  else blend = 1 - ease((t - GAZE_UP_S - GAZE_HOLD_S) / GAZE_DOWN_S);
  const m = (t - METEOR_AT_S) / METEOR_S;
  return { blend, meteor: m >= 0 && m <= 1 ? m : -1 };
};

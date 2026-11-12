import { TILESET as P, sprite, texture } from '@/game/objects/nature/kit';

/**
 * A PEDRA QUE QUICA NA ÁGUA (pedido do autor, 2026-11-11; o gesto mora em scenes/game/StoneSkipping). Diante de água
 * aberta, o Z pega um seixo chato da beira e o herói mira: na mão, o seixo balança entre deitado e de pé, e BRILHA
 * quando passa deitado. O segundo Z joga. Como na vida: a pedra que bate deitada na água quica (o ângulo certo, medido
 * em laboratório, é perto de 20 graus de inclinação no ar); a que bate de quina afunda. Cada quique é mais curto que o
 * anterior, até ela afundar, ou chegar à outra margem.
 *
 * Aqui só a conta (o ângulo, quantos quiques, os pulos) e a arte; o seixo é da beira, não a pedra da mochila: jogar
 * pedra no lago não gasta as pedras de que a travessia da lava precisa.
 */

/**
 * O balanço do seixo na mão: o ângulo (graus) vai de -TILT_MAX a TILT_MAX, e 0 é deitado. O seno vai AO CUBO para ele
 * DEMORAR deitado: com o seno puro a passagem pelo ponto certo durava menos que o tempo de reação de uma pessoa, e
 * o brilho chegava sempre atrasado. Assim, a janela boa fica perto de 0,3 s a cada passagem.
 */
export const TILT_MAX = 40;
export const TILT_PERIOD_S = 1.6;
export const tiltAt = (t: number): number => Math.sin((t / TILT_PERIOD_S) * Math.PI * 2) ** 3 * TILT_MAX;

/** Quão bem a pedra sai (0..1): deitada é 1, de quina é 0. */
export const qualityOf = (tilt: number): number => 1 - Math.min(1, Math.abs(tilt) / TILT_MAX);

/** Quantos quiques, pela qualidade da jogada e um pouco de sorte (`roll`, 0..1). */
export const skipsFor = (quality: number, roll: number): number => {
  const r = Math.min(0.999, Math.max(0, roll));
  if (quality >= 0.85) return 6 + Math.floor(r * 4);
  if (quality >= 0.6) return 3 + Math.floor(r * 3);
  if (quality >= 0.3) return 1 + Math.floor(r * 2);
  return 0;
};

/** Os voos da pedra (tiles): o primeiro, da mão até a água, e um depois de cada quique, cada um mais curto. */
export const hopLengths = (skips: number, quality: number): number[] => {
  const out: number[] = [];
  let len = 1 + quality * 0.7;
  for (let i = 0; i <= skips; i += 1) {
    out.push(len);
    len *= 0.78;
  }
  return out;
};

// O SEIXO de lado, em três inclinações: deitado (uma lasca fina, com o brilho), meio e quase de pé.
const C = { k: P.ink, s: P.stone, S: P.stoneDk, h: P.pale };
export const PEBBLE_FRAMES = [
  sprite('pebble-flat', ['.......', '.......', '.kkkkk.', 'khssssk', '.kkkkk.'], C),
  sprite('pebble-mid', ['.......', '....kk.', '..kkhsk', '.ksssk.', '..kkk..'], C),
  sprite('pebble-steep', ['....kk.', '...khk.', '..kssk.', '.kSsk..', '.kkk...'], C),
] as const;
export const PEBBLE_W = 7 / 16;
export const PEBBLE_H = 5 / 16;

/** O quadro do seixo para um ângulo. */
export const pebbleFrame = (tilt: number): string => {
  const a = Math.abs(tilt);
  return PEBBLE_FRAMES[a < 10 ? 0 : a < 24 ? 1 : 2];
};

/** O anel e a gota de cada quique (os mesmos do peixe que pula, em desenho próprio). */
export const SKIP_RING = texture('skip-ring', 12, 12, (put) => {
  for (let i = 0; i < 40; i += 1) {
    const a = (i / 40) * Math.PI * 2;
    put(5.5 + Math.cos(a) * 5.3, 5.5 + Math.sin(a) * 5.3, P.ice, 0.8);
  }
});
export const SKIP_DROP = texture('skip-drop', 1, 1, (put) => put(0, 0, P.ice, 0.9));

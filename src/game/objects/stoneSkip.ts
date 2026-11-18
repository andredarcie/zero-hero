import { TILESET as P, hash, sprite, texture, type Put } from '@/game/objects/nature/kit';

/**
 * A PEDRA QUE QUICA NA ÁGUA (pedido do autor, 2026-11-11; o gesto mora em scenes/game/StoneSkipping). Num LEITO DE
 * SEIXOS da beira do lago, de frente para a água, o Z pega um seixo chato e o herói mira: na mão, o seixo balança
 * entre deitado e de pé, e BRILHA quando passa deitado. O segundo Z joga. Como na vida: a pedra que bate deitada na
 * água quica (o ângulo certo, medido em laboratório, é perto de 20 graus de inclinação no ar); a que bate de quina
 * afunda. Cada quique é mais curto que o anterior, até ela afundar, ou chegar à outra margem.
 *
 * Aqui só a conta (o ângulo, quantos quiques, os pulos), os leitos e a arte; o seixo é da beira, não a pedra da
 * mochila: jogar pedra no lago não gasta as pedras de que a travessia da lava precisa.
 */

/** De que lado do leito fica a água. */
export type WaterSide = 'n' | 'e' | 's' | 'w';
/** Um leito de seixos: os tiles de chão da beira em que o herói pisa para pegar o seixo, e o lado da água. */
export interface SkipBed {
  tiles: ReadonlyArray<readonly [number, number]>;
  water: WaterSide;
}

/**
 * OS LEITOS DE SEIXOS (pedido do autor, 2026-11-16: "não faça ser algo totalmente livre em qualquer lugar"): antes,
 * qualquer água à frente, até um riacho de um tile, virava "Quicar pedra". Agora só se quica onde há seixos chatos no
 * chão, à vista, em poucos lugares da margem do lago do sul, o único grande e aberto do vale (o laguinho do norte tem
 * 3 × 3, o da cachoeira tem vitória-régia, o resto é riacho). O stoneSkip.test confere no world.json que cada tile é
 * chão livre com água aberta à frente.
 */
export const SKIP_BEDS: readonly SkipBed[] = [
  // A margem sul: joga-se para o norte, e a pedra corre o lago inteiro (cinco tiles) à vista da câmera.
  { tiles: [[41, 57], [42, 57], [43, 57]], water: 'n' },
  // A margem oeste: joga-se para o leste, de lado, por sete tiles de água.
  { tiles: [[38, 54], [38, 55]], water: 'e' },
];

/** O leito em que este tile está, ou null. */
export const skipBedAt = (x: number, y: number): SkipBed | null =>
  SKIP_BEDS.find((bed) => bed.tiles.some(([tx, ty]) => tx === x && ty === y)) ?? null;

/** Quanto o leito passa das pontas (px), para não terminar reto na borda do tile. */
const BED_SPILL = 3;
/** O fundo do leito, da água para a terra (px): um tile. */
const BED_DEPTH = 16;

/** O tamanho do desenho de um leito (px): ao longo da margem e o fundo, na orientação do mundo. */
export const pebbleBedSize = (bed: SkipBed): { w: number; h: number } => {
  const along = bed.tiles.length * 16 + 2 * BED_SPILL;
  return bed.water === 'n' || bed.water === 's' ? { w: along, h: BED_DEPTH } : { w: BED_DEPTH, h: along };
};

// Os seixos vistos de cima: chatos e claros (o seixo de rio, lavado), a luz do alto e da esquerda, e a sombra em
// ardósia só no canto de baixo à direita (nunca preto; a faixa inteira embaixo lia como um risco escuro). O molhado,
// rente à água, é um tom abaixo.
const STAMPS: ReadonlyArray<readonly string[]> = [
  ['.hh.', 'hssS', '..Sd'],
  ['hs.', 'sSS', '..d'],
  ['hs', 'Sd'],
  ['hss', '.Sd'],
  ['h', 'S'],
];
const DRY = { h: P.bone, s: P.pale, S: P.grey, d: P.slate } as const;
const WET = { h: P.pale, s: P.grey, S: P.greyDk, d: P.slate } as const;

/**
 * O DESENHO de um leito (puro: o teste o lê). Os seixos espalhados ao longo da margem, mais juntos rente à água e
 * rareando para a terra e para as pontas, sem um encostar no outro.
 */
export const drawPebbleBed = (put: Put, bed: SkipBed): void => {
  const { w, h } = pebbleBedSize(bed);
  const along = Math.max(w, h);
  // (ao longo, a partir da água) → (x, y) do desenho.
  const toXY = (a: number, c: number): [number, number] => {
    if (bed.water === 'n') return [a, c];
    if (bed.water === 's') return [a, BED_DEPTH - 1 - c];
    if (bed.water === 'e') return [BED_DEPTH - 1 - c, a];
    return [c, a];
  };
  const used = new Set<string>();
  for (let a = 1; a < along - 1; a += 2.6) {
    for (let c = 0.5; c < BED_DEPTH - 1; c += 2.2) {
      const ja = a + (hash(a, c, 61) - 0.5) * 2.2;
      const jc = c + (hash(c, a, 62) - 0.5) * 1.4;
      const nearWater = 1 - jc / BED_DEPTH;
      const ends = Math.min(1, Math.min(ja, along - ja) / 6);
      if (hash(ja, jc, 63) > (0.06 + 0.78 * nearWater ** 2.2) * ends) continue;
      const stamp = STAMPS[Math.floor(hash(jc, ja, 64) * STAMPS.length)];
      const tone = jc < 3.5 ? WET : DRY;
      const [x0, y0] = toXY(ja, jc).map(Math.round);
      const px: Array<[number, number, string]> = [];
      stamp.forEach((row, dy) => {
        for (let dx = 0; dx < row.length; dx += 1) {
          const k = row[dx] as keyof typeof DRY | '.';
          if (k !== '.') px.push([x0 + dx, y0 + dy, tone[k]]);
        }
      });
      // Um seixo não monta no outro, nem sai do desenho.
      if (px.some(([x, y]) => x < 0 || y < 0 || x >= w || y >= h || used.has(`${x},${y}`))) continue;
      for (const [x, y, color] of px) {
        used.add(`${x},${y}`);
        put(x, y, color);
      }
    }
  }
};

/** A textura de um leito (registrada pelo kit; quem a usa chama `flushTextures` antes). */
export const pebbleBedTexture = (bed: SkipBed): string => {
  const { w, h } = pebbleBedSize(bed);
  return texture(`pebble-bed-${bed.tiles.length}-${bed.water}`, w, h, (put) => drawPebbleBed(put, bed));
};

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

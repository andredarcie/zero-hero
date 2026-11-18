// UM TUFO DE MATO ALTO, montado da biblioteca de fios (render3d/tallGrassArt). Nenhum tufo é desenho: cada um sorteia,
// pela posição dele no mundo, quantos fios tem, quais, onde cada um pisa no tile, em que profundidade, com que tom e em
// que fase do tremular. É o que tira o "plantação" do campo (pedido do autor, 2026-11-17):
//   · os fios nascem de UMA ou DUAS touceiras dentro do tile, espalhados em volta delas (nunca no centro exato), e se
//     abrem PARA FORA da touceira, como capim de verdade — então o tufo não tem um eixo, e o vizinho não o repete;
//   · os fios do fundo (ao norte) são mais altos e mais escuros, os da frente mais baixos e mais claros: o tufo tem
//     volume, e o de trás aparece por cima do da frente;
//   · um em cada três tufos leva uma espiga, um em cada quatro um fio seco — a cor de palha salpicada no verde;
//   · cada fio tem um tom ±6% e a sua fase de tremular.
// Puro e determinístico: a mesma posição dá o mesmo tufo (o save recarregado vê o mesmo mato).

import type { BladeArt, TallGrassAtlas } from './tallGrassArt';
import { seededRandom } from './tallGrassArt';

/** Um fio posto no tile: o pé (x em pixels de arte a partir do centro do tile, z em tiles a partir do centro). */
export interface PlacedBlade {
  art: BladeArt;
  /** O pé, em pixels de arte, a partir do centro do tile (negativo = oeste). Pixel inteiro. */
  dxPx: number;
  /** A linha do pé, em tiles, a partir do centro do tile (negativo = norte, o fundo). */
  dz: number;
  /** O tom do fio (multiplica a cor do bioma): o fundo mais escuro. */
  tone: number;
  /** A fase do tremular, em radianos. */
  phase: number;
}

export interface TuftLayout {
  tall: PlacedBlade[];
  stubs: PlacedBlade[];
}

/** Até onde um pé vai do centro do tile, em pixels de arte (o tile tem 16: a folha balança dentro da margem dele). */
const FOOT_REACH = 6;
/** A faixa de profundidade dos pés, em tiles: o tufo ocupa o miolo do tile, nunca a beira. */
const DEPTH = 0.34;

const hashTile = (x: number, y: number, salt: number): number => {
  let h = (x * 73856093) ^ (y * 19349663) ^ (salt * 83492791);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return (h ^ (h >>> 15)) >>> 0;
};

/** Um número com cara de normal (a soma de três sorteios), de -1 a 1. */
const bell = (rand: () => number): number => (rand() + rand() + rand()) / 1.5 - 1;

const pickBy = (rand: () => number, pool: readonly BladeArt[], want: (b: BladeArt) => boolean): BladeArt => {
  const fit = pool.filter(want);
  const from = fit.length > 0 && rand() < 0.75 ? fit : pool;
  return from[Math.floor(rand() * from.length)];
};

/** O tufo do tile (x, y). */
export const composeTuft = (x: number, y: number, atlas: Pick<TallGrassAtlas, 'green' | 'straw' | 'stubs'>): TuftLayout => {
  const rand = seededRandom(hashTile(x, y, 0x7466));
  const clumps = rand() < 0.45 ? 2 : 1;
  const centres = Array.from({ length: clumps }, () => Math.round(bell(rand) * 3));
  const count = 9 + Math.floor(rand() * 5); // 9..13 fios verdes
  const tall: PlacedBlade[] = [];
  const place = (pool: readonly BladeArt[], extraTone: number): void => {
    const c = centres[Math.floor(rand() * centres.length)];
    const dxPx = Math.max(-FOOT_REACH, Math.min(FOOT_REACH, Math.round(c + bell(rand) * 3.2)));
    // a folha se abre PARA FORA da touceira: o pé à esquerda dela pega um fio que tomba para a esquerda
    const side = Math.sign(dxPx - c);
    const art = pickBy(rand, pool, (b) => (side === 0 ? Math.abs(b.lean) < 1.5 : Math.sign(b.lean) === side));
    const d = rand() * 2 - 1; // -1 = o fundo, 1 = a frente
    // o fundo mais alto: um fio comprido sorteado para a frente troca de lugar com o de trás
    const back = art.height >= 13 && d > 0.3 && rand() < 0.6 ? -d : d;
    tall.push({
      art,
      dxPx,
      dz: Math.round(back * DEPTH * 16) / 16,
      tone: (0.8 + 0.12 * (back + 1) / 2 + (rand() - 0.5) * 0.12) * extraTone,
      phase: rand() * Math.PI * 2,
    });
  };
  for (let i = 0; i < count; i += 1) place(atlas.green, 1);
  const seeds = atlas.straw.filter((b) => b.kind === 'seed');
  const dry = atlas.straw.filter((b) => b.kind === 'dry');
  if (rand() < 0.36) place(seeds, 1);
  if (rand() < 0.14) place(seeds, 1);
  if (rand() < 0.26) place(dry, 0.96);
  // OS TOCOS: o que a foice deixa — os mesmos pontos de pé, cortados rente.
  const stubs: PlacedBlade[] = tall
    .filter(() => rand() < 0.7)
    .map((b) => ({ ...b, art: atlas.stubs[Math.floor(rand() * atlas.stubs.length)] }));
  return { tall, stubs };
};

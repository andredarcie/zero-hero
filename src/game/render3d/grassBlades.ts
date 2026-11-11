// OS FIOS DA GRAMA (pedido do autor, 2026-11-10): "pegasse esse sprite de cada fio de graminha e quebrasse ele em
// pedaços menores [...] cada fio fosse de fato um fio 3D subindo [...] hoje parece apenas um papel com todas as gramas
// em pé, flutuando esse papelzão, tudo colado".
//
// O QUE ESTAVA ERRADO. A decoração em pé (standingDecor.ts) levanta o QUADRO inteiro, girando em volta da fileira mais
// baixa do desenho. Mas a grama do autor é um mapa de fios: cada risco é um fio, e onde ele está no quadro diz onde ele
// nasce no chão. Em pé como um cartão, o tufo desenhado mais acima no quadro ficava 4 pixels no ar, em cima do tufo de
// baixo, e todos os fios balançavam juntos, como uma folha de papel.
//
// O QUE ESTE MÓDULO FAZ: lê a arte e acha os FIOS. Cada fio fica em pé no ponto do chão onde o pé dele está no desenho,
// com a altura do próprio risco, e se curva a partir do próprio pé (o resto mora no standingDecor e no decorSway).
//
// COMO ACHA. A grama do autor (quadros 0, 7, 8, 19, 20) é feita de riscos verticais: a ponta em oliva, o pé em ardósia
// e, embaixo dele, um pixel preto a 39% — a sombra de contato. Então:
//   · a SOMBRA DE CONTATO sai do fio: ela é chão, e fica deitada no chão, na frente do pé (`contactShadows`);
//   · cada COLUNA é cortada em corridas de pixels; a corrida termina na sombra (o quadro 20 tem dois fios empilhados
//     na mesma coluna, e a sombra do de cima encosta na ponta do de baixo) e onde um pé escuro tem um pixel claro logo
//     abaixo (outro fio começando);
//   · a corrida cujo pixel de baixo é ESCURO (o pé de ardósia) é um fio com pé próprio;
//   · a que termina num pixel claro é um pedaço de risco torto ou de espiga (o capim antigo, o trigo): ela se prende à
//     corrida da coluna vizinha que encosta nela e desce mais, e o fio fica com as duas, no mesmo plano.
//
// MAIS ALTO SEM ESTICAR O PIXEL (pedido do autor: "faça ser mais alto, pois não parece que está desgrudado do chão").
// O pé escuro do fio fica com os pixels que o autor desenhou; só a HASTE (o que vem acima do pé) cresce, cada pixel
// dela repetido um número INTEIRO de vezes (`bladeGrowth`). Pixel inteiro, a mesma cor, a grade de pixel intacta: o fio
// fica mais comprido, não borrado nem achatado. Cada fio sorteia a altura dele, como numa touceira de verdade.

import { ANCIENT_GROVE, BIOME_DECOR } from '@/game/world/biomes';
import { STAND_BLADE_SWING } from './decorSway';

/** A grama: o capim do autor (0, 7, 8 e o mato alto 19, 20), o capim antigo do jardim e o trigo. */
export const BLADE_FRAMES: ReadonlySet<number> = new Set([0, 7, 8, 19, 20, ANCIENT_GROVE.grass, BIOME_DECOR.wheat]);

/** O que conta como pixel do desenho: o mesmo corte de alfa do material da decoração (0,35). */
const OPAQUE_ALPHA = 90;
/** Abaixo disto o pixel é ESCURO (o pé de ardósia, a folha na sombra, a sombra de contato): ele é um pé. */
const FOOT_LUMA = 82;

/** Uma corrida de pixels de uma coluna do quadro (fileira 0 = o topo do quadro). */
export interface BladeRun {
  col: number;
  top: number;
  bottom: number;
  /** Quantos pixels do fio ficam abaixo desta corrida (0 = ela é o pé). */
  base: number;
}

/**
 * Um fio: o pé (a coluna e a fileira do pixel mais baixo), a altura em pixels, quantos pixels escuros formam o pé (eles
 * não crescem) e as corridas que o desenham.
 */
export interface Blade {
  footCol: number;
  footRow: number;
  height: number;
  footRows: number;
  runs: BladeRun[];
}

/** O que conta como sombra de contato: um pixel do desenho que não é opaco (o preto a 39% do autor). */
const isShadow = (p: readonly [number, number, number, number]): boolean => p[3] >= OPAQUE_ALPHA && p[3] < 255;

/** Lê um pixel do quadro (0..15, 0..15): [r, g, b, a] de 0 a 255. */
export type FramePixel = (x: number, y: number) => readonly [number, number, number, number];

const luma = (p: readonly [number, number, number, number]): number => p[0] * 0.299 + p[1] * 0.587 + p[2] * 0.114;

/**
 * As corridas de cada coluna, sem a sombra de contato (ela é chão), cortadas nela e onde um pé escuro tem um fio claro
 * logo abaixo.
 */
const columnRuns = (px: FramePixel): Array<{ col: number; top: number; bottom: number }> => {
  const runs: Array<{ col: number; top: number; bottom: number }> = [];
  for (let col = 0; col < 16; col++) {
    let top = -1;
    for (let row = 0; row < 16; row++) {
      const p = px(col, row);
      const on = p[3] >= OPAQUE_ALPHA && !isShadow(p);
      if (on && top < 0) top = row;
      if (!on) {
        if (top >= 0) runs.push({ col, top, bottom: row - 1 });
        top = -1;
        continue;
      }
      const below = row < 15 ? px(col, row + 1) : null;
      const footOverLight = luma(p) < FOOT_LUMA && below !== null && below[3] >= OPAQUE_ALPHA && !isShadow(below)
        && luma(below) >= FOOT_LUMA;
      if (footOverLight || row === 15) {
        runs.push({ col, top, bottom: row });
        top = -1;
      }
    }
  }
  return runs;
};

/** As sombras de contato do quadro: elas ficam DEITADAS no chão, cada uma onde está no desenho. */
export const contactShadows = (px: FramePixel): Array<{ col: number; row: number }> => {
  const out: Array<{ col: number; row: number }> = [];
  for (let row = 0; row < 16; row++) {
    for (let col = 0; col < 16; col++) if (isShadow(px(col, row))) out.push({ col, row });
  }
  return out;
};

/**
 * Os fios do quadro. Determinístico (a ordem é a das colunas), e um fio nunca perde pixel: toda corrida do desenho
 * cai em exatamente um fio.
 */
export const traceBlades = (px: FramePixel): Blade[] => {
  const runs = columnRuns(px);
  const footOf = (r: { col: number; bottom: number }): boolean => luma(px(r.col, r.bottom)) < FOOT_LUMA;
  // Quem segura cada corrida sem pé: a da coluna vizinha que encosta nela (uma fileira de folga) e desce mais.
  const parent = runs.map((r) => {
    if (footOf(r)) return -1;
    let best = -1;
    runs.forEach((o, j) => {
      if (Math.abs(o.col - r.col) !== 1 || o.bottom <= r.bottom) return;
      if (o.top > r.bottom + 1 || o.bottom < r.top - 1) return;
      if (best < 0 || o.bottom > runs[best].bottom) best = j;
    });
    return best;
  });
  const rootOf = (i: number): number => {
    let k = i;
    for (let guard = 0; parent[k] >= 0 && guard < runs.length; guard++) k = parent[k];
    return k;
  };
  const blades = new Map<number, Blade>();
  runs.forEach((r, i) => {
    const root = runs[rootOf(i)];
    const key = rootOf(i);
    let b = blades.get(key);
    if (!b) {
      // o pé: os pixels escuros seguidos, do pé para cima, na corrida dele
      let footRows = 0;
      while (footRows < root.bottom - root.top + 1 && luma(px(root.col, root.bottom - footRows)) < FOOT_LUMA) footRows++;
      b = { footCol: root.col, footRow: root.bottom, height: 0, footRows, runs: [] };
      blades.set(key, b);
    }
    b.runs.push({ col: r.col, top: r.top, bottom: r.bottom, base: root.bottom - r.bottom });
  });
  for (const b of blades.values()) {
    b.height = b.footRow - Math.min(...b.runs.map((r) => r.top)) + 1;
    b.footRows = Math.min(b.footRows, b.height);
    b.runs.sort((a, c) => a.base - c.base || a.col - c.col);
  }
  return [...blades.keys()].sort((a, c) => a - c).map((k) => blades.get(k) as Blade);
};

/**
 * A altura que cada fio sorteia, em pixels, por família: o capim do autor de 4 a 7, o mato alto de 6 a 10. O capim
 * antigo e o trigo já foram desenhados compridos e ficam como estão.
 */
const GROWN_HEIGHT: Readonly<Record<number, readonly [number, number]>> = {
  0: [4, 7], 7: [4, 7], 8: [4, 7], 19: [6, 10], 20: [6, 10],
};

/**
 * Quantas vezes cada pixel da HASTE se repete (inteiro, nunca menos de 1), para o fio chegar perto da altura sorteada
 * (`r` de 0 a 1). O pé escuro não cresce. A altura que sai é `pé + (altura - pé) × crescimento` (`grownHeight`).
 */
export const bladeGrowth = (frame: number, blade: Pick<Blade, 'height' | 'footRows'>, r: number): number => {
  const range = GROWN_HEIGHT[frame];
  const shaft = blade.height - blade.footRows;
  if (!range || shaft <= 0) return 1;
  const want = range[0] + Math.floor(r * (range[1] - range[0] + 1 - 1e-9));
  return Math.max(1, Math.round((want - blade.footRows) / shaft));
};

/** A altura de um fio em pé, em pixels, com a haste crescida. */
export const grownHeight = (blade: Pick<Blade, 'height' | 'footRows'>, growth: number): number =>
  blade.footRows + (blade.height - blade.footRows) * growth;

/** O máximo que a ponta de qualquer fio anda para o lado, em pixels de arte (o capim antigo e o trigo, compridos). */
export const BLADE_SWING = STAND_BLADE_SWING;

/**
 * Quanto a ponta de UM fio pode andar para o lado, em pixels de arte, e portanto a margem do quad dele: seis décimos
 * da altura em pé (um fio de 5 pixels anda até 3), entre 2 e o máximo. O quad de um fio é quase todo margem, então ela
 * é o custo dele na placa; o shader nunca curva um fio além dela (decorSway.ts — a mesma conta).
 */
export const bladeSwing = (grownPx: number): number => Math.min(STAND_BLADE_SWING, Math.max(2, Math.ceil(grownPx * 0.6)));

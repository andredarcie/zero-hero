// A BEIRA DO PLANALTO (pedido do autor, 2026-11-11: o planalto de grama visto de trás ou de lado sumia).
//
// O topo do planalto e o chão de baixo são o mesmo capim, e a câmera olha sempre do sul. Pela frente a parede de
// pedra mostra o degrau; por trás e pelos lados não há parede à vista, e o topo emendava no chão de longe sem risco
// nenhum. Sobravam duas pistas, e as duas erradas:
//
//   · OS DENTES: a beira curva sai do campo em pixels de arte, e uma diagonal vira escada — a face sul do degrau e a
//     face de lado. Numa beira que olha para o NORTE, a face de lado é um pedaço de parede que de verdade está de
//     costas para a câmera: ela só aparece de quina, uma lasca bege de um pixel com um tile de altura. Enfileiradas,
//     liam como espinhos espetados no capim. A face de lado fica só onde a parede de verdade olha para a câmera
//     (`stepFacesAway`, pela direção em que o chão baixo está em volta dela).
//   · A SOMBRA SEM DONO: a sombra do planalto caía no chão e nada mostrava de onde ela vinha.
//
// A BEIRADA é o que os jogos de cima sempre desenharam no topo de um degrau: o pixel da beira escuro (o contorno, o
// mesmo vocabulário da margem da água) e o de dentro aceso (o capim pegando luz na quina). O aceso sai em TUFOS,
// nunca numa régua: a fileira inteira em verde-claro já desenhou uma régua neon na trepadeira (ver vineTexture).
// Os dois só mexem na cor do vértice do próprio topo — nenhuma peça nova, nenhum pixel fora do lugar. Na beira da
// FRENTE (a sul, onde a parede aparece) não há contorno: o pixel da beira é o beiço aceso e o capim cai por cima da
// pedra (cliffRock, a franja); um risco escuro ali separava o topo da própria franja.

/** O que a beirada faz com a cor do topo, por classe: 0 nada, 1 o contorno (o pixel da beira), 2 o beiço aceso. */
export const RIM_SHADE: readonly [number, number, number] = [1, 0.62, 1.2];
/** Quanto do beiço aceso fica (em tufos de dois pixels). */
export const RIM_LIP_KEEP = 0.72;
/**
 * A partir de quanto a parede de verdade olha para o norte, a face de lado do degrau sai. A câmera fica ao sul e uns
 * 9 tiles para trás: uma parede virada 20° para o norte só fica de frente para ela a uns 3 tiles para o lado, e ali a
 * face de lado ainda é uma lasca de quina. Com 30° (0,5) sobrava um dente em cada quina norte.
 */
export const FACE_AWAY = 0.35;

/** O nível de uma célula de arte (i, j) do tile, contada a partir do canto noroeste dele; fora do tile também vale. */
export type CellLevel = (i: number, j: number) => number;
export type CellTest = (i: number, j: number) => boolean;

const SIDES: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const hash = (x: number, z: number): number => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** O beiço aceso desta célula do mundo fica? Tufos de dois pixels, a mesma resposta em todo boot. */
export const lipTuft = (gx: number, gz: number): boolean => hash(Math.floor(gx / 2) + 0.5, Math.floor(gz / 2) + 0.5) < RIM_LIP_KEEP;

/** Desta célula, no nível `c`, o chão cai para o lado (dx, dz) — e é chão de verdade, não escada, água nem cubo. */
const dropsTo = (lv: CellLevel, open: CellTest, i: number, j: number, c: number, dx: number, dz: number): boolean =>
  lv(i + dx, j + dz) < c && open(i + dx, j + dz);
/** A beira SEM parede à vista: o chão cai para o norte, o leste ou o oeste, e não para o sul. */
const backEdge = (lv: CellLevel, open: CellTest, i: number, j: number, c: number): boolean =>
  !dropsTo(lv, open, i, j, c, 0, 1) && SIDES.some(([dx, dz]) => dz !== 1 && dropsTo(lv, open, i, j, c, dx, dz));

/**
 * A classe da célula do topo: 1 se ela é a beira sem parede à vista (o contorno), 2 se ela é o beiço aceso — a beira
 * da FRENTE (a parede aparece embaixo dela, e o capim cai por cima: contorno ali separaria o topo da própria franja)
 * ou a fileira de dentro do contorno —, sempre em tufos; 0 no resto e em todo chão de baixo.
 */
export const rimClass = (lv: CellLevel, open: CellTest, keepLip: CellTest, i: number, j: number): 0 | 1 | 2 => {
  const c = lv(i, j);
  if (c <= 0) return 0;
  if (dropsTo(lv, open, i, j, c, 0, 1)) return keepLip(i, j) ? 2 : 0;
  if (backEdge(lv, open, i, j, c)) return 1;
  if (!keepLip(i, j)) return 0;
  return SIDES.some(([dx, dz]) => lv(i + dx, j + dz) === c && backEdge(lv, open, i + dx, j + dz, c)) ? 2 : 0;
};

/**
 * A FACE DE LADO DE UM DEGRAU ESTÁ DE COSTAS? A face fica em `edgeX` (em células: a célula i ocupa [i, i+1)) e cobre
 * as linhas j0..j1 de um topo de nível `c`. A direção para fora da parede de verdade é para onde está o chão baixo em
 * volta dela, numa janela de `reach` células para cada lado: numa beira que olha para o norte o chão baixo fica ao
 * norte, e a face de lado da escada é um pedaço de uma parede que a câmera, do sul, não vê.
 */
export const stepFacesAway = (lv: CellLevel, c: number, edgeX: number, j0: number, j1: number, reach: number): boolean => {
  const zm = (j0 + j1 + 1) / 2;
  let vx = 0;
  let vz = 0;
  for (let b = Math.floor(zm - reach); b < Math.ceil(zm + reach); b++) {
    for (let a = Math.floor(edgeX - reach); a < Math.ceil(edgeX + reach); a++) {
      if (lv(a, b) >= c) continue;
      vx += a + 0.5 - edgeX;
      vz += b + 0.5 - zm;
    }
  }
  const len = Math.hypot(vx, vz);
  return len > 0 && vz / len < -FACE_AWAY;
};

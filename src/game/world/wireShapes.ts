// A geometria dos cabos de energia — compartilhada entre o runtime (WireObject/GameScene) e o
// editor (EditorScene mostra no tabuleiro a MESMA forma que o jogo vai resolver). A arte mora
// na Sprite Factory (spritefactory/sprites/wire.mjs, folha `wire`): 7 formas apagadas nos
// frames 0..6 e os 7 filetes gold do banco aceso em 7..13 — o runtime deita o filete por cima
// da base em aditivo quando a rede esta viva.

export type WireShape = 'v' | 'h' | 'ne' | 'nw' | 'se' | 'sw' | 'x';

/** A ordem dos frames na folha da fabrica — nunca reordenar (indices sao posicionais). */
export const WIRE_SHAPES: readonly WireShape[] = ['v', 'h', 'ne', 'nw', 'se', 'sw', 'x'];

const ON_BANK = WIRE_SHAPES.length;

/** O frame da folha `wire` para uma forma, apagada (base) ou acesa (filete aditivo). */
export const wireShapeFrame = (shape: WireShape, on: boolean): number =>
  WIRE_SHAPES.indexOf(shape) + (on ? ON_BANK : 0);

export type WireSide = 'n' | 'e' | 's' | 'w';

const STUB_SIDES: readonly WireSide[] = ['n', 'e', 's', 'w'];
const STUB_BASE = ON_BANK * 2; // os plugues moram depois dos dois bancos de formas (frame 14)

/**
 * O frame do PLUGUE — o toco que mora no tile da MAQUINA, correndo da borda `side` (por onde
 * o cabo entra) ate o pe dela, com o flange de tomada na ponta. E o que faz o cabo conectar
 * VISUALMENTE na caldeira/braco em vez de morrer na divisa dos tiles.
 */
export const wireStubFrame = (side: WireSide, on: boolean): number =>
  STUB_BASE + STUB_SIDES.indexOf(side) + (on ? STUB_SIDES.length : 0);

/**
 * A forma que um cabo assume dado o que existe nos quatro vizinhos (cabo ou maquina). Dois
 * lados viram reta ou curva; um lado so estica ate ele; tres ou mais (ou nenhum) viram a
 * juncao — o nó que deixa uma rede BIFURCAR. O autor nunca escolhe: pintar o caminho e a
 * autoria inteira (a mesma regra que da ao braco o frame da direcao).
 */
export const wireShapeFromMask = (n: boolean, e: boolean, s: boolean, w: boolean): WireShape => {
  const count = Number(n) + Number(e) + Number(s) + Number(w);
  if (count >= 3 || count === 0) return 'x';
  if (n && s) return 'v';
  if (e && w) return 'h';
  if (n && e) return 'ne';
  if (n && w) return 'nw';
  if (s && e) return 'se';
  if (s && w) return 'sw';
  // Um vizinho so: o cabo aponta para ele.
  if (n || s) return 'v';
  return 'h';
};

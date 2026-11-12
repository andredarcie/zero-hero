import { INK, type Paint } from '@/game/render3d/pixelForms';

// A PEDRA DE MEDITAR NO ALTO DA COLINA (scenes/game/Meditation): a laje de pedra com a almofada redonda de pano (o
// zafu) em cima, e ao lado a pilha de pedras equilibradas. Pixel a pixel, 16 px por tile, luz de cima e da esquerda,
// nas cores do tileset (a pedra clara e o musgo do forest_tile_set; o pano no azul do céu dele). A primeira versão
// tinha a almofada de palha: marrom em cima de pedra parda, ela lia de longe como um chapéu.

type Tone = { hi: string; base: string; dk: string };
// O cinza puxado para o frio: a luz do vale é quente, e um cinza neutro saía pardo, cor de terra.
const STONE: Tone = { hi: '#d3d8d8', base: '#a4aaab', dk: '#6d7374' };
const STONE_WARM: Tone = { hi: '#d8d4ca', base: '#b0aca1', dk: '#7c786e' };
const FACE = ['#8b9192', '#787e7f', '#5d6263'] as const;
const CLOTH: Tone = { hi: '#7b9cb8', base: '#557998', dk: '#3a5470' };
const MOSS = ['#8a8d49', '#626439'] as const;

/** As linhas de uma elipse de pixel (meia-largura arredondada por linha). */
const rows = (cx: number, cy: number, rx: number, ry: number): Array<{ y: number; x0: number; x1: number }> => {
  const out: Array<{ y: number; x0: number; x1: number }> = [];
  for (let y = Math.ceil(cy - ry); y <= Math.floor(cy + ry); y += 1) {
    const k = (y - cy) / ry;
    const half = rx * Math.sqrt(Math.max(0, 1 - k * k));
    out.push({ y, x0: Math.round(cx - half), x1: Math.round(cx + half) });
  }
  return out;
};

/**
 * Uma pedra (ou a almofada): o contorno de tinta um pixel maior, o miolo na cor, a primeira linha clara do lado da
 * luz e a última escura (a pedra assentada tem a barriga na sombra).
 */
const blob = (rect: Paint, cx: number, cy: number, rx: number, ry: number, tone: Tone): void => {
  for (const r of rows(cx, cy, rx + 1, ry + 1)) rect(INK, r.x0, r.y, r.x1 - r.x0 + 1, 1);
  const inner = rows(cx, cy, rx, ry);
  inner.forEach((r, i) => {
    const color = i === 0 ? tone.hi : i === inner.length - 1 ? tone.dk : tone.base;
    rect(color, r.x0, r.y, r.x1 - r.x0 + 1, 1);
    // A luz só pega a metade esquerda de cima; a direita da linha de cima já é cor de corpo.
    if (i === 0) rect(tone.base, Math.ceil((r.x0 + r.x1) / 2) + 1, r.y, Math.max(0, r.x1 - Math.ceil((r.x0 + r.x1) / 2)), 1);
  });
};

/**
 * A PEDRA DE SENTAR: um bloco de pedra baixo e GROSSO, com a face da frente à mostra (a primeira, uma laje fina,
 * lia como a aba de um chapéu), um pouco de musgo no pé, e o zafu de pano azul em cima, com o botão no meio.
 */
export const paintMeditationSeat = (rect: Paint): void => {
  // A face da frente: um degrau mais estreita que o tampo, escurecendo para baixo, com uma rachadura.
  rect(INK, 1, 10, 14, 6);
  rect(FACE[0], 2, 11, 12, 1);
  rect(FACE[1], 2, 12, 12, 2);
  rect(FACE[2], 2, 14, 12, 1);
  rect(FACE[2], 9, 12, 1, 2);
  rect(FACE[2], 8, 11, 1, 1);
  // O musgo no pé da pedra.
  rect(MOSS[0], 2, 14, 3, 1);
  rect(MOSS[1], 5, 14, 1, 1);
  rect(MOSS[0], 12, 14, 2, 1);
  // O tampo, visto um pouco de cima.
  blob(rect, 7.5, 9.6, 6.2, 1.5, STONE);
  // O zafu: redondo e alto, mais estreito que o tampo, para a pedra aparecer em volta.
  blob(rect, 7.5, 7.2, 3.6, 1.9, CLOTH);
  // O botão costurado no meio, e as pregas do pano descendo do botão.
  rect(CLOTH.dk, 7, 7, 2, 1);
  rect(CLOTH.dk, 5, 8, 1, 1);
  rect(CLOTH.dk, 10, 8, 1, 1);
};

/** A PILHA DE PEDRAS EQUILIBRADAS: quatro pedras, cada uma menor que a de baixo, nenhuma reta em cima da outra. */
export const paintCairn = (rect: Paint): void => {
  blob(rect, 7.5, 13.2, 4.4, 1.3, STONE);
  rect(MOSS[0], 4, 14, 2, 1);
  blob(rect, 8, 10.3, 3.2, 1.1, STONE_WARM);
  blob(rect, 7.2, 7.7, 2.3, 0.9, STONE);
  blob(rect, 7.8, 5.4, 1.4, 0.7, STONE_WARM);
};

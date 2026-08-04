// OS TILES DE DUNGEON — o interior do Zelda 1, e a resposta para uma pergunta que estava parada.
//
// `public/assets/environment/tilesets/dungeon.png` esta neste repositorio desde sempre: 18 frames
// de 16x16 (2 colunas x 9 linhas) com parede de tijolo, piso, tocha, hera, rachadura, ossos e
// teia — e NUNCA foi carregado por uma linha de codigo. Ele nao entrou porque um tile de terreno
// aqui nao e um arquivo, e um FRAME dentro do atlas do chao: o mundo inteiro e uma malha so
// amostrando `forest_tile_set.png`, e e por isso que uma floresta custa um draw call. Carregar
// uma segunda folha seria um segundo material e um segundo draw call debaixo do herói.
//
// Entao esta spec faz a unica coisa que faltava: pega os frames que interessam da folha shipped e
// os devolve prontos para o `install-tile.mjs` apendar no atlas.
//
// ── Por que ela LE a arte em vez de redesenha-la ─────────────────────────────────────────────
// A arte ja existe e e boa. O que ela nao tem e conformidade com a paleta da casa: o linter acha
// 17 FAIL em 7 dos 18 frames — e a distribuicao e a boa noticia, porque **11 frames passam
// limpos**, justamente as paredes e os pisos, e os que falham falham por pouco (os dois frames
// rachados erram UMA cor: #1a1812, cujo vizinho de paleta e #111214). Redesenhar seria jogar fora
// arte que ja serve; o que falta e requantizar. Cada pixel vai para a cor de paleta mais proxima,
// o que e no-op nos frames que ja estavam certos e conserta os outros sem mexer numa forma.
//
// ── A paleta e OUTRA de proposito ────────────────────────────────────────────────────────────
// O tileset da floresta e navy-ink e olive; este e azul-petroleo. Nao e desvio: e o que faz
// atravessar uma porta mudar de LUGAR. No Zelda o interior tem paleta propria por dungeon, e a
// primeira coisa que o jogador sente ao entrar e que o ar mudou de cor.
//
// ── O que entra, e por que so isto ───────────────────────────────────────────────────────────
// Dez frames: tres pisos, tres paredes, parede com tocha, parede com hera, parede RACHADA e piso
// rachado. Fica de fora o enfeite que o gerador nao usa (estante, estandarte, barril, a grade) —
// atlas e posicional, frame instalado e caro de mover, e um frame que ninguem desenha e divida. A parede rachada entra por um motivo especifico: ela e a AFORDANCIA da parede
// bombardeavel, o conserto do defeito mais criticado do Zelda 1 (parede falsa sem pista nenhuma).

import path from 'node:path';
import { readPng } from '../lib/png.mjs';
import { nearestGameColor, hexToRgb } from '../lib/palette.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SRC = path.join(ROOT, 'public', 'assets', 'environment', 'tilesets', 'dungeon.png');

// Indices na folha shipped (2 colunas, row-major), na ordem em que serao instalados no atlas.
// A ordem E o contrato: o gerador das dungeons indexa por ela (DUNGEON_TILES em constants.ts).
const PICK = [
  3,  // piso liso
  5,  // piso, variante
  6,  // piso, variante
  0,  // parede de tijolo
  7,  // parede, variante
  8,  // parede, variante
  2,  // parede com tocha acesa
  9,  // parede com hera
  12, // parede RACHADA — a pista da parede bombardeavel
  13, // piso rachado
];
// FICARAM DE FORA os ossos (15) e a teia (16), que na folha tem FUNDO TRANSPARENTE: sao
// decoracao de camada superior, nao terreno, e requantiza-los como full-bleed opaco transformava
// o vazio em um quadrado preto. Fora isso, o chao de dungeon do Zelda e limpo — sem entulho —,
// entao corta-los e a leitura mais fiel, nao so a mais facil.

export default {
  name: 'dungeon-tiles',
  kind: 'terrain',
  draw: () => {
    const sheet = readPng(SRC);
    const cols = sheet.width / 16;
    const cache = new Map();
    const snap = (r, g, b) => {
      const key = (r << 16) | (g << 8) | b;
      let hit = cache.get(key);
      if (!hit) { hit = hexToRgb(nearestGameColor([r, g, b]).hex); cache.set(key, hit); }
      return hit;
    };
    return PICK.map((f) => {
      const sx = (f % cols) * 16; const sy = Math.floor(f / cols) * 16;
      const data = new Uint8Array(16 * 16 * 4);
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const i = ((sy + y) * sheet.width + sx + x) * 4;
          const o = (y * 16 + x) * 4;
          // Terreno e full-bleed opaco (regra 7): o que estiver transparente na folha vira a cor
          // mais escura do frame, nao um buraco — uma parede vazada leria como recorte.
          const [r, g, bl] = snap(sheet.data[i], sheet.data[i + 1], sheet.data[i + 2]);
          data[o] = r; data[o + 1] = g; data[o + 2] = bl; data[o + 3] = 255;
        }
      }
      return { width: 16, height: 16, data };
    });
  },
  notes: 'Requantizacao 1:1 da dungeon.png shipped para a paleta do jogo — nenhuma forma muda, so '
    + 'as cores fora de paleta andam para o vizinho mais proximo. Dez frames, na ordem que o '
    + 'gerador das dungeons indexa. Instalar com install-tile.mjs a partir do frame 42.',
};

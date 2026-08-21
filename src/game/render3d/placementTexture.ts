import * as THREE from 'three';
import Phaser from 'phaser';

import { registerTexture3D } from '@/game/render3d/textures3d';

/**
 * A MARCA DE POSICIONAMENTO — o quadrado branco que diz "a peça cai AQUI".
 *
 * Ela existe porque a instalação era o único gesto do jogo que agia num tile que o jogador não
 * conseguia ver. Todo o resto tem alvo visível: o machado bate na árvore que está ali, o balde
 * coleta a água que está ali. Uma estação, não — ela nasce num chão vazio, e chão vazio é
 * igual em todo lugar. Sem a marca, "o tile à frente" é uma regra que só existe na cabeça de quem
 * escreveu o código.
 *
 * É um QUADRO, não um bloco cheio: cantos grossos e lados finos, com o miolo vazado. Um bloco
 * branco chapado esconderia o chão (e portanto o que já está no tile, que é justamente o que
 * decide se a peça cabe); um quadro mostra o lugar sem cobrir a informação. A leitura é a mesma
 * de uma mira, e é a mesma linguagem do anel de telegrafo dos bichos: o jogo já ensina que "um
 * contorno no chão marca um tile que importa".
 *
 * `placement-ok` e branco, cheio de luz: aperte e a estacao cai aqui.
 */

const OK = '#ffffff';

// 16×16 para casar com o tile: um QUADRADO fechado de 1px, engrossado nos cantos.
//
// A primeira versão eram só os quatro cantos, como uma mira — e o jogo real desmentiu a ideia na
// primeira captura: as BANDEJAS da bancada já são cantos vazados no chão, e as duas marcas
// ficaram indistinguíveis a dois tiles de distância. Uma linguagem visual só pode significar uma
// coisa. O quadrado fechado é o que sobrou de livre, e é também o que foi pedido: um bloco.
const FRAME = [
  'CCCCCCCCCCCCCCCC',
  'CCC..........CCC',
  'CC............CC',
  'C..............C',
  'C..............C',
  'C..............C',
  'C..............C',
  'C..............C',
  'C..............C',
  'C..............C',
  'C..............C',
  'C..............C',
  'CC............CC',
  'CCC..........CCC',
  'CCCCCCCCCCCCCCCC',
  'CCCCCCCCCCCCCCCC',
] as const;

const makeCanvas = (hex: string): HTMLCanvasElement => {
  const h = FRAME.length;
  const w = FRAME[0].length;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const on = FRAME[y][x] === 'C';
      const idx = (y * w + x) * 4;
      img.data[idx] = r;
      img.data[idx + 1] = g;
      img.data[idx + 2] = b;
      img.data[idx + 3] = on ? 255 : 0;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
};

export const PLACEMENT_OK_TEXTURE = 'placement-ok';

// ─────────────────────────────────────────────────────────────────────────────────────────────
// O KEYCAP DA TECLA DE AÇÃO — "aperte ISTO aqui".
//
// Ele nasceu duas vezes no jogo: sobre a cabeça do NPC (anunciando a conversa) e sobre a marca de
// posicionamento (anunciando a instalação). Agora nasce uma terceira, sobre a BANCADA, e é por
// isso que ele mudou de casa: um desenho que diz a mesma frase em três lugares tem de ser um
// desenho só, ou o dia em que o jogo trocar a tecla de ação vai deixar dois deles mentindo.
//
// A tecla mostrada é a de AÇÃO (Z no teclado, A nos círculos do toque) porque as três coisas que
// ele anuncia são o mesmo botão.
const KEYCAP_BG = '#241d0f';
const KEYCAP_BORDER = '#ffe066';
const KEYCAP_GLYPH_COLOR = '#f5efdc';
const GLYPHS: Record<'Z' | 'A' | 'X' | 'B', readonly string[]> = {
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
};

export const PLACEMENT_KEY_TEXTURE = 'action-key';
/** O keycap do OUTRO botao — o que APANHA (X no teclado, B nos circulos de toque). */
export const TAKE_KEY_TEXTURE = 'take-key';

/**
 * Publica o keycap como textura do Phaser (ele é overlay 2D projetado, nunca um corpo no mundo —
 * a mesma técnica do "!" do NPC). Idempotente: a segunda chamada não faz nada.
 */
export const ensurePlacementKeyTexture = (scene: Phaser.Scene, touch: boolean): void => {
  ensureKeycapTexture(scene, PLACEMENT_KEY_TEXTURE, touch ? 'A' : 'Z');
};

/** O keycap do botao de APANHAR. Mesmo desenho, outra letra — ver `ensurePlacementKeyTexture`. */
export const ensureTakeKeyTexture = (scene: Phaser.Scene, touch: boolean): void => {
  ensureKeycapTexture(scene, TAKE_KEY_TEXTURE, touch ? 'B' : 'X');
};

const ensureKeycapTexture = (
  scene: Phaser.Scene, key: string, letter: keyof typeof GLYPHS,
): void => {
  if (scene.textures.exists(key)) return;
  const glyph = GLYPHS[letter];
  const gRows = glyph.length;
  const gCols = glyph[0].length;
  const w = gCols + 6;
  const h = gRows + 6;
  const canvas = scene.textures.createCanvas(key, w, h);
  if (!canvas) return;
  const ctx = canvas.getContext();
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const border = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      // Cantos vazados: é o que faz o retângulo ler como TECLA e não como etiqueta.
      if ((x === 0 || x === w - 1) && (y === 0 || y === h - 1)) continue;
      ctx.fillStyle = border ? KEYCAP_BORDER : KEYCAP_BG;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.fillStyle = KEYCAP_GLYPH_COLOR;
  for (let y = 0; y < gRows; y += 1) {
    for (let x = 0; x < gCols; x += 1) {
      if (glyph[y][x] === '#') ctx.fillRect(x + 3, y + 3, 1, 1);
    }
  }
  canvas.refresh();
  canvas.setFilter(Phaser.Textures.FilterMode.NEAREST);
};

// O registro THREE e um mapa de modulo que sobrevive ao restart da cena: registrar uma vez so.
let threeRegistered = false;

/** Publica a marca nas duas pipelines. Idempotente, como o balde e o carvao. */
export const registerPlacementTextures = (scene: Phaser.Scene): void => {
  const pairs: ReadonlyArray<readonly [string, string]> = [
    [PLACEMENT_OK_TEXTURE, OK],
  ];
  for (const [key, hex] of pairs) {
    const needThree = !threeRegistered;
    const needPhaser = !scene.textures.exists(key);
    if (!needThree && !needPhaser) continue;
    const canvas = makeCanvas(hex);
    if (needThree) {
      const tex = new THREE.CanvasTexture(canvas);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      registerTexture3D(key, tex);
    }
    if (needPhaser) scene.textures.addCanvas(key, canvas);
  }
  threeRegistered = true;
};

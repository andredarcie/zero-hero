#!/usr/bin/env node
// O POSTER DO ARSENAL — a imagem de marketing com todos os itens do jogo.
//
// Composto pixel a pixel com a ARTE REAL do jogo (os mesmos PNGs que o jogo carrega) e a paleta
// do jogo, com a fonte pixel da casa (lib/pixelfont.mjs). Nada de mockup: se um sprite mudar em
// public/assets, o poster muda junto — basta rodar de novo.
//
// A ordem das celulas conta a tese do jogo, nao o inventario: ARMAS/CHAVES, FERRAMENTAS, o que
// elas PRODUZEM, e a agua/fogo. "Itens PRODUZEM, nao so deletam" e a regra do design (CLAUDE.md);
// o poster mostra isso lendo cada linha.
//
// Uso: node spritefactory/poster.mjs   → out/poster-itens.png
//
// Caixa alta e sem acento de proposito: e a voz do proprio jogo nos rotulos do mundo
// ("VOCE PEGOU A ESPADA!"), e o texto foi escrito para nao precisar de acento nenhum.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readPng, writePng } from './lib/png.mjs';
import { drawText, textWidth, GLYPH_H } from './lib/pixelfont.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const asset = (p) => path.join(ROOT, 'public', 'assets', p);
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out', 'poster-itens.png');

// ── A paleta do jogo (lib/palette.mjs: ink, gold, bone) ──────────────────────
const C = {
  bg: [0x14, 0x1d, 0x38], // ink, o fundo da noite
  band: [0x1d, 0x2b, 0x53], // ink base — a faixa do titulo e o fundo dos cards
  line: [0x32, 0x44, 0x76], // ink lit — bordas
  gold: [0xf1, 0xcc, 0x36],
  goldLight: [0xf8, 0xe3, 0x94],
  goldDark: [0xc9, 0xc8, 0x1b],
  bone: [0xcd, 0xcd, 0xcd],
  boneDim: [0x85, 0x85, 0x85],
  // O indigo do contorno dos pickups (ItemPickup.OUTLINE_COLOR). Metade da arte deste jogo e
  // navy — a espada, a chave, a bomba — e navy sobre a noite navy simplesmente NAO EXISTE: no
  // primeiro corte deste poster a chave sumiu inteira dentro do card. O jogo ja resolveu isso
  // ha muito: todo item no chao usa este halo roxo pra "pular" do mundo escuro. O poster fala
  // a mesma lingua — e de brinde a folha inteira fica com a cara de "isto e coletavel".
  rim: [0x9d, 0x7b, 0xff],
};

// ── O balde e arte PROCEDURAL (src/game/render3d/bucketTexture.ts) ───────────
// Nao existe PNG dele em disco: o jogo o pinta no boot. A grade e a paleta abaixo sao as
// mesmas de la — se aquele arquivo mudar, este trecho tem de acompanhar.
const BUCKET_PAL = {
  '.': null,
  k: [0x24, 0x1a, 0x10], w: [0x6b, 0x4a, 0x2c], l: [0x9a, 0x70, 0x47],
  m: [0x9a, 0xa0, 0xa8], a: [0x4f, 0x74, 0xa8], b: [0xa9, 0xc2, 0xe6],
};
const BUCKET_EMPTY = [
  '....mmmmmm....', '...m......m...', '..m........m..', '..m........m..',
  '.kkkkkkkkkkkk.', '.kllllllllllk.', '.kwlwlwlwlwlk.', '.kmmmmmmmmmmk.',
  '.kwlwlwlwlwlk.', '.kwlwlwlwlwlk.', '..kwlwlwlwlk..', '..kmmmmmmmmk..',
  '..kwlwlwlwlk..', '..kwwwwwwwwk..', '...kkkkkkkk...',
];
const BUCKET_FULL = BUCKET_EMPTY.map((row, i) =>
  (i === 5 ? '.kbbbbbbbbbbk.' : i === 6 ? '.kaaaaaaaaaak.' : row));

// ── Os itens, na ordem que conta a tese ──────────────────────────────────────
const ITEMS = [
  // Armas e chaves: os que abrem o caminho por VOCE.
  { name: 'ESPADA', desc: 'MATA COM UM GOLPE', png: 'items/equipment/sword.png', frame: 0 },
  { name: 'CHAVE', desc: 'ABRE PORTAS', png: 'items/collectibles/key.png', frame: 0 },
  { name: 'BOTAS', desc: 'PISA LAVA E AGUA', png: 'ui/icons/lava_boots_icon.png' },
  // As ferramentas: cada uma FABRICA o insumo do passo seguinte.
  { name: 'MACHADO', desc: 'ARVORE > GRAVETO', png: 'ui/icons/axe_icon.png' },
  { name: 'PICARETA', desc: 'ROCHA > PEDRA', png: 'ui/icons/pickaxe_icon.png' },
  { name: 'FOICE', desc: 'MATO > SEMENTES', png: 'ui/icons/scythe_icon.png' },
  // O que elas produzem.
  { name: 'GRAVETO', desc: 'ACENDE: VIRA TOCHA', png: 'ui/icons/wood_icon.png' },
  { name: 'PEDRA', desc: 'VAU NO RIO', png: 'environment/props/rock.png' },
  { name: 'SEMENTES', desc: 'PLANTE E REGUE', png: 'items/collectibles/seeds.png' },
  // A agua e o fogo.
  { name: 'BALDE', desc: 'ENCHA NO RIO', grid: BUCKET_EMPTY },
  { name: 'BALDE CHEIO', desc: 'APAGA FOGO E REGA', grid: BUCKET_FULL },
  { name: 'BOMBA', desc: 'ABRE TUDO EM VOLTA', png: 'items/equipment/bomb.png', frame: 0 },
];

// Os outros dois que o chao entrega — nao se carregam (a mao e uma so), se consomem na hora.
const COLLECTIBLES = [
  // O frame do MAPA (o de baixo): o de cima e navy liso e sumiria na noite — o proprio jogo usa
  // este aqui no chao (HEART_FRAMES.pickup).
  { name: 'CORACAO', desc: 'RECUPERA VIDA', png: 'items/collectibles/heart.png', frame: 1 },
  { name: 'MOEDA', desc: 'COMPRA MELHORIAS', png: 'items/collectibles/coin.png' },
];

// ── Layout (px nativos; o poster inteiro sobe de escala no fim) ──────────────
const PAD = 14;
const COLS = 3;
const ROWS = 4;
const CELL_W = 150;
const CELL_H = 80;
const ICON = 16; // o tile do jogo
const ICON_SCALE = 2;
const GRID_Y = 64;
const STRIP_H = 44; // a faixa dos coletaveis, embaixo
// As 8 direcoes do halo, como no ItemPickup: 1 pixel de ARTE (= ICON_SCALE aqui) em volta.
const RIM_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
const W = COLS * CELL_W + PAD * 2;
const STRIP_Y = GRID_Y + ROWS * CELL_H + 20;
const H = STRIP_Y + STRIP_H + 34;
const UPSCALE = 4; // o PNG final: pixel art nunca interpola, so multiplica

class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h * 4);
  }

  set(x, y, rgb) {
    if (!rgb || x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = rgb[0]; this.data[i + 1] = rgb[1]; this.data[i + 2] = rgb[2]; this.data[i + 3] = 255;
  }

  /** rgb do pixel, ou null se transparente (alpha binario, como todo sprite do jogo). */
  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    const i = (y * this.w + x) * 4;
    return this.data[i + 3] < 128 ? null : [this.data[i], this.data[i + 1], this.data[i + 2]];
  }

  fillRect(x, y, w, h, rgb) {
    for (let yy = y; yy < y + h; yy += 1) for (let xx = x; xx < x + w; xx += 1) this.set(xx, yy, rgb);
  }

  strokeRect(x, y, w, h, rgb) {
    for (let xx = x; xx < x + w; xx += 1) { this.set(xx, y, rgb); this.set(xx, y + h - 1, rgb); }
    for (let yy = y; yy < y + h; yy += 1) { this.set(x, yy, rgb); this.set(x + w - 1, yy, rgb); }
  }

  /** Um frame de um sheet do jogo, ampliado por `scale`. Alpha < 128 nao pinta (alpha binario). */
  blitPng(png, dx, dy, { frame = 0, fw = png.width, fh = fw, scale = 1 } = {}) {
    const sx = 0;
    const sy = frame * fh;
    for (let y = 0; y < fh; y += 1) {
      for (let x = 0; x < fw; x += 1) {
        const i = ((sy + y) * png.width + sx + x) * 4;
        if (png.data[i + 3] < 128) continue;
        const rgb = [png.data[i], png.data[i + 1], png.data[i + 2]];
        for (let s = 0; s < scale * scale; s += 1) {
          this.set(dx + x * scale + (s % scale), dy + y * scale + Math.floor(s / scale), rgb);
        }
      }
    }
  }

  blitGrid(rows, pal, dx, dy, scale = 1) {
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x += 1) {
        const rgb = pal[row[x]];
        if (!rgb) continue;
        for (let s = 0; s < scale * scale; s += 1) {
          this.set(dx + x * scale + (s % scale), dy + y * scale + Math.floor(s / scale), rgb);
        }
      }
    });
  }

  text(str, x, y, rgb, scale = 1) {
    drawText(str, x, y, scale, (px, py) => this.set(px, py, rgb));
  }

  textCentered(str, cx, y, rgb, scale = 1) {
    this.text(str, Math.round(cx - textWidth(str, scale) / 2), y, rgb, scale);
  }

  /**
   * Carimba um icone JA rasterizado com o halo do jogo: a silhueta em `rim` nas 8 direcoes,
   * a arte real por cima (ItemPickup faz exatamente isto, com 8 copias tingidas do sprite).
   */
  stampWithRim(icon, dx, dy, rim, step) {
    for (const [ox, oy] of RIM_DIRS) {
      for (let y = 0; y < icon.h; y += 1) {
        for (let x = 0; x < icon.w; x += 1) {
          if (icon.get(x, y)) this.set(dx + x + ox * step, dy + y + oy * step, rim);
        }
      }
    }
    for (let y = 0; y < icon.h; y += 1) {
      for (let x = 0; x < icon.w; x += 1) this.set(dx + x, dy + y, icon.get(x, y));
    }
  }

  /** O shape que o encodePng espera (lib/png.mjs) — igual ao Pix.toImage(). */
  toImage() { return { width: this.w, height: this.h, data: this.data }; }

  upscale(n) {
    const out = new Canvas(this.w * n, this.h * n);
    for (let y = 0; y < this.h; y += 1) {
      for (let x = 0; x < this.w; x += 1) {
        const i = (y * this.w + x) * 4;
        const rgb = [this.data[i], this.data[i + 1], this.data[i + 2]];
        out.fillRect(x * n, y * n, n, n, rgb);
      }
    }
    return out;
  }
}

const c = new Canvas(W, H);

// Fundo: a noite do jogo, com a faixa do titulo mais clara e um fio de ouro separando.
c.fillRect(0, 0, W, H, C.bg);
c.fillRect(0, 0, W, 56, C.band);
c.fillRect(0, 56, W, 1, C.goldDark);

// O titulo, com sombra dura (sem AA, como todo pixel deste jogo).
const TITLE = 'ZERO THE HERO';
c.textCentered(TITLE, W / 2 + 2, 12 + 2, [0x14, 0x1d, 0x38], 3);
c.textCentered(TITLE, W / 2, 12, C.gold, 3);
c.textCentered('O ARSENAL COMPLETO - UM ITEM POR VEZ', W / 2, 40, C.boneDim, 1);

// As chamas que ladeiam o titulo: a arte de fogo do proprio jogo (o coracao do jogo e o fogo).
const fire = readPng(asset('effects/fire/sprite_tiny_fire0.png'));
const titleW = textWidth(TITLE, 3);
c.blitPng(fire, Math.round(W / 2 - titleW / 2) - 40, 12, { fw: 16, scale: 2 });
c.blitPng(fire, Math.round(W / 2 + titleW / 2) + 8, 12, { fw: 16, scale: 2 });

// Os cards.
ITEMS.forEach((item, i) => {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const x = PAD + col * CELL_W;
  const y = GRID_Y + row * CELL_H;
  const bx = x + 4;
  const by = y + 2;
  const bw = CELL_W - 8;
  const bh = CELL_H - 6;

  c.fillRect(bx, by, bw, bh, C.band);
  c.strokeRect(bx, by, bw, bh, C.line);

  // O icone e rasterizado num quadro proprio de 32x32 e so entao carimbado com o halo — assim
  // o halo cerca a SILHUETA do item, nunca a caixa.
  const box = ICON * ICON_SCALE;
  const icon = new Canvas(box, box);
  if (item.grid) {
    // O balde: 14x15, centrado no mesmo quadro de 32x32 dos outros.
    const gw = item.grid[0].length * ICON_SCALE;
    const gh = item.grid.length * ICON_SCALE;
    icon.blitGrid(item.grid, BUCKET_PAL, Math.round((box - gw) / 2), Math.round((box - gh) / 2), ICON_SCALE);
  } else {
    icon.blitPng(readPng(asset(item.png)), 0, 0, { frame: item.frame ?? 0, fw: ICON, scale: ICON_SCALE });
  }
  const iconY = by + 6;
  c.stampWithRim(icon, Math.round(bx + bw / 2 - box / 2), iconY, C.rim, ICON_SCALE);

  c.textCentered(item.name, bx + bw / 2, iconY + box + 6, C.goldLight, 2);
  c.textCentered(item.desc, bx + bw / 2, iconY + box + 6 + GLYPH_H * 2 + 5, C.boneDim, 1);
});

// A faixa dos coletaveis: dois cards largos, icone a esquerda (o inverso do grid — a leitura
// muda de "ficha de item" pra "nota de rodape", que e o peso certo deles).
c.textCentered('TAMBEM NO CHAO', W / 2, STRIP_Y - 12, C.goldDark, 1);
COLLECTIBLES.forEach((item, i) => {
  const bw = Math.floor((W - PAD * 2 - 8) / 2);
  const bx = PAD + i * (bw + 8);
  const by = STRIP_Y;
  c.fillRect(bx, by, bw, STRIP_H, C.band);
  c.strokeRect(bx, by, bw, STRIP_H, C.line);

  const box = ICON * ICON_SCALE;
  const icon = new Canvas(box, box);
  icon.blitPng(readPng(asset(item.png)), 0, 0, { frame: item.frame ?? 0, fw: ICON, scale: ICON_SCALE });
  c.stampWithRim(icon, bx + 12, by + Math.round((STRIP_H - box) / 2), C.rim, ICON_SCALE);

  c.text(item.name, bx + 54, by + 10, C.goldLight, 2);
  c.text(item.desc, bx + 54, by + 28, C.boneDim, 1);
});

// O rodape: a regra que rege o design inteiro (a fala do gato do level).
c.textCentered('CADA FERRAMENTA FAZ ALGUMA COISA', W / 2, H - 20, C.bone, 1);
c.strokeRect(0, 0, W, H, C.line);

writePng(OUT, c.upscale(UPSCALE).toImage());
console.log(`poster: ${OUT} (${W * UPSCALE}x${H * UPSCALE}, ${ITEMS.length} itens + ${COLLECTIBLES.length} coletaveis)`);

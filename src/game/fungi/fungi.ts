import * as THREE from 'three';
import type Phaser from 'phaser';

import { registerTexture3D } from '@/game/render3d/textures3d';

/**
 * OS SEIS FUNGOS DO VALE — e a faca que os colhe.
 *
 * Cada espécie é REAL e foi escolhida para ensinar uma coisa diferente sobre fungos, não para
 * encher uma lista: a amanita (lamelas, véu, volva, veneno), o cantarelo (falsas lamelas),
 * o porcini (poros no lugar de lamelas), o coprino (o chapéu que se digere em tinta), o morel
 * (um ascomiceto: esporos em saquinhos, não em lamelas) e a bufa-de-lobo (os esporos amadurecem
 * DENTRO da bola). Forma, cor e nome seguem a espécie de verdade; o texto mora no locale
 * (`fungi.species.<kind>`), como todo texto do jogo.
 *
 * A ARTE É DESENHADA POR CÓDIGO, e por um motivo só: a mesma receita sai em 16px (o chão, a
 * bolsa, o pensamento do herói) e em 48px (o close dos mini-games). Duas artes à mão para cada
 * espécie seriam duas espécies diferentes na primeira vez que alguém retocasse uma delas.
 */

/** A ordem é a do caminho a partir da Hollis — e é a ordem das dicas dela (NpcQuests.hints). */
export const MUSHROOM_KINDS = ['puffball', 'inkCap', 'morel', 'chanterelle', 'flyAgaric', 'porcini'] as const;
export type MushroomKind = (typeof MUSHROOM_KINDS)[number];

export const isMushroomKind = (kind: string | null | undefined): kind is MushroomKind =>
  kind !== null && kind !== undefined && (MUSHROOM_KINDS as readonly string[]).includes(kind);

/** Comestível; comestível SÓ cozido; venenoso. A fogueira do fim só aceita os dois primeiros. */
export type Edibility = 'edible' | 'cooked' | 'poison';

/** A sujeira que cada espécie traz do chão em que nasce (o mini-game da escova). */
export type DirtKind = 'soil' | 'needle' | 'leaf' | 'grass' | 'sand' | 'moss';

interface FungusSpec {
  edibility: Edibility;
  /**
   * A FAIXA DO CORTE no close, em frações da altura da arte (0 = topo, 1 = pé). Quase todas
   * pedem o corte rente ao chão; a amanita pede ABAIXO da linha do solo, porque a volva (o copo
   * na base) é o que separa uma amanita de quase tudo — e quem a corta acima a perde.
   */
  cut: { from: number; to: number };
  dirt: readonly DirtKind[];
}

export const FUNGUS_SPECS: Readonly<Record<MushroomKind, FungusSpec>> = {
  puffball: { edibility: 'edible', cut: { from: 0.76, to: 0.9 }, dirt: ['grass', 'soil', 'soil'] },
  inkCap: { edibility: 'edible', cut: { from: 0.76, to: 0.9 }, dirt: ['grass', 'soil', 'sand'] },
  morel: { edibility: 'cooked', cut: { from: 0.76, to: 0.9 }, dirt: ['sand', 'soil', 'leaf'] },
  chanterelle: { edibility: 'edible', cut: { from: 0.76, to: 0.9 }, dirt: ['moss', 'needle', 'soil'] },
  flyAgaric: { edibility: 'poison', cut: { from: 0.9, to: 1.04 }, dirt: ['needle', 'leaf', 'soil'] },
  porcini: { edibility: 'edible', cut: { from: 0.76, to: 0.9 }, dirt: ['needle', 'soil', 'moss'] },
};

/** O que vai no espeto, na ordem em que o herói escolheria (o melhor primeiro). */
export const ROASTABLE_ORDER: readonly MushroomKind[] = ['porcini', 'chanterelle', 'morel', 'puffball', 'inkCap'];

export const fungusTextureKey = (kind: MushroomKind): string => `fungus-${kind}`;
export const KNIFE_TEXTURE_KEY = 'mushroom-knife';

/** A linha do solo no close: abaixo dela a arte fica coberta de terra até o corte a soltar. */
export const SOIL_LINE = 0.9;

// ── o pintor ─────────────────────────────────────────────────────────────────────────────────

/** O contorno de toda a arte do jogo: o navy de tinta do herói, do espeto e dos NPCs. */
const OUTLINE = 0x1b1d33;

interface PaintOpts {
  /** O "material" que o pixel pintado passa a ter — é o que as sombras miram depois. */
  mat?: number;
  /** Só pinta por cima destes materiais (a sombra do chapéu não vaza para o talo). */
  over?: number | readonly number[];
  /** Recorte vertical em frações (o chapéu é meia elipse, não uma bola). */
  maxY?: number;
  minY?: number;
}

/**
 * Uma grade de pixels com formas em coordenadas NORMALIZADAS (0..1). A forma é testada no
 * centro de cada pixel, então a mesma chamada rende 16px ou 48px — e o detalhe que some em 16px
 * (uma verruga, um poro) ainda ganha UM pixel, porque perder a verruga é perder a amanita.
 */
class Raster {
  public readonly color: Int32Array;
  public readonly mat: Uint8Array;

  public constructor(public readonly n: number) {
    this.color = new Int32Array(n * n).fill(-1);
    this.mat = new Uint8Array(n * n);
  }

  private allowed(i: number, o: PaintOpts): boolean {
    if (o.over === undefined) return true;
    if (this.color[i] < 0) return false;
    const m = this.mat[i];
    return typeof o.over === 'number' ? m === o.over : o.over.includes(m);
  }

  private fill(
    inside: (x: number, y: number) => boolean, rgb: number, o: PaintOpts, seed?: [number, number],
  ): void {
    const { n } = this;
    let hit = false;
    for (let py = 0; py < n; py += 1) {
      const y = (py + 0.5) / n;
      if (o.maxY !== undefined && y > o.maxY) continue;
      if (o.minY !== undefined && y < o.minY) continue;
      for (let px = 0; px < n; px += 1) {
        const x = (px + 0.5) / n;
        if (!inside(x, y)) continue;
        const i = py * n + px;
        if (!this.allowed(i, o)) continue;
        this.color[i] = rgb;
        if (o.mat !== undefined) this.mat[i] = o.mat;
        hit = true;
      }
    }
    // O detalhe pequeno demais para pegar o centro de algum pixel ganha o pixel mais próximo.
    if (!hit && seed) {
      const px = Math.min(n - 1, Math.max(0, Math.floor(seed[0] * n)));
      const py = Math.min(n - 1, Math.max(0, Math.floor(seed[1] * n)));
      const i = py * n + px;
      if (this.allowed(i, o)) {
        this.color[i] = rgb;
        if (o.mat !== undefined) this.mat[i] = o.mat;
      }
    }
  }

  public ellipse(cx: number, cy: number, rx: number, ry: number, rgb: number, o: PaintOpts = {}): this {
    this.fill((x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1, rgb, o, [cx, cy]);
    return this;
  }

  public rect(x0: number, y0: number, x1: number, y1: number, rgb: number, o: PaintOpts = {}): this {
    this.fill((x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1, rgb, o, [(x0 + x1) / 2, (y0 + y1) / 2]);
    return this;
  }

  public poly(pts: ReadonlyArray<readonly [number, number]>, rgb: number, o: PaintOpts = {}): this {
    const inside = (x: number, y: number): boolean => {
      let c = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
      }
      return c;
    };
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    this.fill(inside, rgb, o, [cx, cy]);
    return this;
  }

  /** Um traço com espessura — nunca mais fino que um pixel, senão some em 16px. */
  public line(x0: number, y0: number, x1: number, y1: number, w: number, rgb: number, o: PaintOpts = {}): this {
    const half = Math.max(w, 1 / this.n) / 2;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy || 1e-9;
    this.fill((x, y) => {
      const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / len2));
      return Math.hypot(x - (x0 + t * dx), y - (y0 + t * dy)) <= half;
    }, rgb, o, [(x0 + x1) / 2, (y0 + y1) / 2]);
    return this;
  }

  /** O contorno escuro de toda arte do jogo, um pixel por fora do que foi pintado. */
  public outline(): this {
    const { n } = this;
    const solid = this.color.map((c) => (c >= 0 ? 1 : 0));
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        const i = y * n + x;
        if (solid[i]) continue;
        const near = (x > 0 && solid[i - 1]) || (x < n - 1 && solid[i + 1])
          || (y > 0 && solid[i - n]) || (y < n - 1 && solid[i + n]);
        if (near) { this.color[i] = OUTLINE; this.mat[i] = 0; }
      }
    }
    return this;
  }

  public toCanvas(): HTMLCanvasElement {
    const { n } = this;
    const canvas = document.createElement('canvas');
    canvas.width = n;
    canvas.height = n;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    const img = ctx.createImageData(n, n);
    for (let i = 0; i < n * n; i += 1) {
      const c = this.color[i];
      if (c < 0) continue;
      img.data[i * 4] = (c >> 16) & 0xff;
      img.data[i * 4 + 1] = (c >> 8) & 0xff;
      img.data[i * 4 + 2] = c & 0xff;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }
}

// ── as seis receitas ─────────────────────────────────────────────────────────────────────────
// Materiais: 1 talo, 2 base/volva, 3 lamelas/poros, 4 chapéu. As sombras miram neles com `over`.

const STEM = 1;
const BASE = 2;
const UNDER = 3;
const CAP = 4;

/**
 * AMANITA MUSCARIA. Chapéu vermelho com verrugas brancas (restos do véu universal que envolvia o
 * cogumelo jovem), lamelas brancas livres, anel em saia e o bulbo com a volva em anéis na base.
 */
const paintFlyAgaric = (r: Raster): void => {
  r.ellipse(0.5, 0.88, 0.14, 0.075, 0xe4ddca, { mat: BASE });
  r.ellipse(0.5, 0.845, 0.135, 0.022, 0xc2b89f, { over: BASE });
  r.ellipse(0.5, 0.88, 0.14, 0.02, 0xc2b89f, { over: BASE, minY: 0.875 });
  r.rect(0.43, 0.44, 0.57, 0.85, 0xefe9dc, { mat: STEM });
  r.rect(0.535, 0.44, 0.57, 0.85, 0xccc3ae, { over: STEM });
  // O anel: a saia que era o véu parcial, presa no alto do talo.
  r.poly([[0.4, 0.52], [0.6, 0.52], [0.64, 0.585], [0.36, 0.585]], 0xf2ecdf, { mat: STEM });
  r.line(0.36, 0.585, 0.64, 0.585, 0.02, 0xc7bea8, { over: STEM });
  r.ellipse(0.5, 0.445, 0.36, 0.06, 0xf3eddd, { mat: UNDER });
  for (let i = -8; i <= 8; i += 1) {
    r.line(0.5 + i * 0.04, 0.425, 0.5 + i * 0.044, 0.47, 0.01, 0xcbc1a8, { over: UNDER });
  }
  r.ellipse(0.5, 0.44, 0.39, 0.26, 0xd5332a, { mat: CAP, maxY: 0.445 });
  r.ellipse(0.5, 0.49, 0.42, 0.13, 0x9c1f1b, { over: CAP });
  r.ellipse(0.37, 0.27, 0.11, 0.05, 0xf06a4b, { over: CAP });
  const warts: ReadonlyArray<readonly [number, number]> = [
    [0.3, 0.33], [0.43, 0.24], [0.57, 0.26], [0.69, 0.34], [0.37, 0.4],
    [0.51, 0.35], [0.64, 0.41], [0.22, 0.41], [0.5, 0.2], [0.78, 0.42],
  ];
  for (const [x, y] of warts) r.ellipse(x, y, 0.028, 0.022, 0xfbf6ea, { over: CAP });
};

/**
 * CANTHARELLUS CIBARIUS. Funil amarelo-gema de borda ondulada; por baixo NÃO há lamelas, e sim
 * dobras rombudas e bifurcadas que descem pelo talo (as falsas lamelas).
 */
const paintChanterelle = (r: Raster): void => {
  r.poly([[0.44, 0.9], [0.56, 0.9], [0.71, 0.47], [0.29, 0.47]], 0xe9a62a, { mat: STEM });
  r.poly([[0.52, 0.9], [0.56, 0.9], [0.71, 0.47], [0.61, 0.47]], 0xc78318, { over: STEM });
  for (let k = 0; k <= 6; k += 1) {
    const top = 0.31 + (0.38 * k) / 6;
    const bottom = 0.465 + (0.07 * k) / 6;
    r.line(top, 0.48, bottom, 0.86, 0.012, 0xa9670f, { over: STEM });
    // A bifurcação: a dobra se divide perto da borda — o desenho que diz "não é lamela".
    if (k % 2 === 0) r.line(top, 0.49, top + 0.035, 0.56, 0.01, 0xa9670f, { over: STEM });
  }
  r.rect(0.44, 0.85, 0.56, 0.9, 0xc78318, { over: STEM });
  r.ellipse(0.5, 0.45, 0.35, 0.095, 0xf6c556, { mat: CAP });
  for (const [x, y, rx] of [[0.17, 0.46, 0.05], [0.83, 0.455, 0.05], [0.3, 0.385, 0.06], [0.7, 0.39, 0.055]] as const) {
    r.ellipse(x, y, rx, 0.035, 0xf6c556, { mat: CAP });
  }
  r.ellipse(0.5, 0.46, 0.27, 0.06, 0xd28d1d, { over: CAP });
  r.ellipse(0.53, 0.475, 0.17, 0.032, 0xb87512, { over: CAP });
};

/**
 * BOLETUS EDULIS. Chapéu castanho em forma de pão; por baixo, uma ESPONJA de poros (nada de
 * lamelas); talo grosso em clava com uma rede branca fina no alto.
 */
const paintPorcini = (r: Raster): void => {
  r.ellipse(0.5, 0.7, 0.19, 0.22, 0xe8dcbf, { mat: STEM });
  r.ellipse(0.6, 0.75, 0.12, 0.19, 0xc6b48f, { over: STEM });
  for (let i = 0; i < 6; i += 1) {
    r.line(0.36 + i * 0.05, 0.5, 0.4 + i * 0.05, 0.66, 0.01, 0xf8f1df, { over: STEM });
    r.line(0.42 + i * 0.05, 0.5, 0.38 + i * 0.05, 0.66, 0.01, 0xf8f1df, { over: STEM });
  }
  r.ellipse(0.5, 0.49, 0.37, 0.055, 0xe6d79a, { mat: UNDER });
  for (let x = 0.19; x <= 0.81; x += 0.055) r.ellipse(x, 0.495, 0.012, 0.01, 0xbfac63, { over: UNDER });
  r.ellipse(0.5, 0.43, 0.41, 0.27, 0x86532a, { mat: CAP, maxY: 0.48 });
  r.ellipse(0.5, 0.475, 0.4, 0.03, 0xbf935d, { over: CAP });
  r.ellipse(0.64, 0.42, 0.25, 0.12, 0x62391b, { over: CAP, minY: 0.36 });
  r.ellipse(0.36, 0.27, 0.14, 0.065, 0xb07c45, { over: CAP });
};

/**
 * COPRINUS COMATUS. Um cilindro branco alto, felpudo de escamas, com o alto castanho — e a borda
 * já virando tinta preta: ele se autodigere para soltar os esporos (deliquescência).
 */
const paintInkCap = (r: Raster): void => {
  r.rect(0.46, 0.6, 0.54, 0.91, 0xf0ece2, { mat: STEM });
  r.rect(0.51, 0.6, 0.54, 0.91, 0xcfc8b8, { over: STEM });
  r.ellipse(0.5, 0.75, 0.065, 0.016, 0xc4bcaa, { mat: STEM });
  r.ellipse(0.5, 0.24, 0.15, 0.12, 0xf1ede3, { mat: CAP });
  r.poly([[0.355, 0.24], [0.645, 0.24], [0.675, 0.64], [0.325, 0.64]], 0xf1ede3, { mat: CAP });
  r.poly([[0.58, 0.2], [0.66, 0.26], [0.68, 0.64], [0.6, 0.64]], 0xd2cbbb, { over: CAP });
  for (let row = 0; row < 5; row += 1) {
    const y = 0.28 + row * 0.07;
    for (let col = 0; col < 4; col += 1) {
      const x = 0.37 + col * 0.075 + (row % 2) * 0.035;
      r.line(x, y, x + 0.03, y + 0.035, 0.014, 0xb6a386, { over: CAP });
    }
  }
  r.ellipse(0.5, 0.15, 0.08, 0.05, 0xa98760, { over: CAP });
  r.rect(0.32, 0.6, 0.68, 0.655, 0x2a2330, { over: CAP });
  for (const [x, y] of [[0.36, 0.69], [0.46, 0.705], [0.6, 0.68], [0.66, 0.72]] as const) {
    r.ellipse(x, y, 0.016, 0.032, 0x2a2330, { mat: BASE });
  }
  r.line(0.34, 0.625, 0.66, 0.625, 0.01, 0x4b3f54, { over: CAP });
};

/**
 * MORCHELLA ESCULENTA. Chapéu em favo de mel, de alvéolos fundos e costelas claras, oco da ponta
 * ao pé; talo granuloso creme. Um ascomiceto — os esporos se formam em saquinhos nos alvéolos.
 */
const paintMorel = (r: Raster): void => {
  r.poly([[0.4, 0.6], [0.6, 0.6], [0.63, 0.9], [0.37, 0.9]], 0xe9dfc6, { mat: STEM });
  r.poly([[0.54, 0.6], [0.6, 0.6], [0.63, 0.9], [0.56, 0.9]], 0xc9bc9d, { over: STEM });
  for (const [x, y] of [[0.43, 0.7], [0.48, 0.8], [0.45, 0.86], [0.52, 0.74]] as const) {
    r.ellipse(x, y, 0.012, 0.01, 0xcdbf9f, { over: STEM });
  }
  r.ellipse(0.5, 0.38, 0.19, 0.28, 0xd8b26a, { mat: CAP });
  r.ellipse(0.6, 0.42, 0.09, 0.24, 0xb88f4c, { over: CAP });
  for (let row = 0; row < 7; row += 1) {
    const y = 0.15 + row * 0.072;
    for (let col = 0; col < 4; col += 1) {
      const x = 0.355 + col * 0.095 + (row % 2) * 0.047;
      r.ellipse(x, y, 0.032, 0.027, 0x6e4b27, { over: CAP });
    }
  }
};

/**
 * LYCOPERDON PERLATUM. Uma bola branca em forma de pera, coberta de espinhos cônicos miúdos;
 * sem chapéu e sem lamelas — os esporos amadurecem lá dentro.
 */
const paintPuffball = (r: Raster): void => {
  r.poly([[0.37, 0.72], [0.63, 0.72], [0.57, 0.91], [0.43, 0.91]], 0xddd2b9, { mat: STEM });
  r.line(0.47, 0.78, 0.45, 0.9, 0.012, 0xbcb093, { over: STEM });
  r.line(0.55, 0.78, 0.55, 0.9, 0.012, 0xbcb093, { over: STEM });
  r.ellipse(0.5, 0.58, 0.28, 0.26, 0xeee8d8, { mat: CAP });
  r.ellipse(0.59, 0.67, 0.22, 0.17, 0xcbc1a9, { over: CAP });
  r.ellipse(0.4, 0.46, 0.09, 0.055, 0xffffff, { over: CAP });
  const spines: ReadonlyArray<readonly [number, number]> = [
    [0.36, 0.5], [0.46, 0.42], [0.57, 0.43], [0.66, 0.52], [0.31, 0.62], [0.42, 0.57],
    [0.53, 0.53], [0.63, 0.63], [0.71, 0.6], [0.39, 0.7], [0.5, 0.66], [0.58, 0.74],
  ];
  for (const [x, y] of spines) r.ellipse(x, y, 0.02, 0.018, 0xa89b7d, { over: CAP });
};

/**
 * A FACA DE COGUMELO: lâmina curta e curva, cabo de madeira e, na ponta do cabo, uma ESCOVA de
 * cerdas — é assim que as facas de coleta de verdade são, e é a escova que limpa no segundo
 * mini-game.
 */
const paintKnife = (r: Raster): void => {
  r.ellipse(0.2, 0.81, 0.11, 0.08, 0x3b2a1c);
  r.line(0.12, 0.86, 0.17, 0.92, 0.02, 0x5a4330);
  r.line(0.21, 0.88, 0.25, 0.93, 0.02, 0x5a4330);
  r.line(0.26, 0.76, 0.52, 0.5, 0.15, 0x8a5a32, { mat: 1 });
  r.line(0.3, 0.8, 0.55, 0.55, 0.05, 0x5e3b1e, { over: 1 });
  r.line(0.5, 0.52, 0.57, 0.45, 0.15, 0xc9a24a);
  r.poly([[0.56, 0.47], [0.84, 0.13], [0.92, 0.17], [0.88, 0.27], [0.63, 0.53]], 0xb5bcc1, { mat: 2 });
  r.line(0.58, 0.45, 0.85, 0.15, 0.03, 0xf0f4f4, { over: 2 });
};

const PAINTERS: Readonly<Record<MushroomKind, (r: Raster) => void>> = {
  flyAgaric: paintFlyAgaric,
  chanterelle: paintChanterelle,
  porcini: paintPorcini,
  inkCap: paintInkCap,
  morel: paintMorel,
  puffball: paintPuffball,
};

/**
 * O CLOSE dos mini-games: 32px, com a máscara (onde há cogumelo) para semear a sujeira. 32 e não
 * mais porque o close fica EM CIMA dos tiles de 16px do mundo: o pixel do cogumelo tem de ter o
 * tamanho do pixel do chão, senão ele parece colado de outro jogo.
 */
export const CLOSE_SIZE = 32;

export interface FungusCloseUp {
  canvas: HTMLCanvasElement;
  /** A mesma arte SEM o contorno: a colheita mostra o cogumelo nu, sozinho no meio da tela. */
  bare: HTMLCanvasElement;
  /** 1 onde a arte é cogumelo (talo ou chapéu, sem o contorno). */
  mask: Uint8Array;
}

const closeCache = new Map<MushroomKind, FungusCloseUp>();

export const fungusCloseUp = (kind: MushroomKind): FungusCloseUp => {
  const cached = closeCache.get(kind);
  if (cached) return cached;
  const r = new Raster(CLOSE_SIZE);
  PAINTERS[kind](r);
  const mask = new Uint8Array(CLOSE_SIZE * CLOSE_SIZE);
  for (let i = 0; i < mask.length; i += 1) mask[i] = r.color[i] >= 0 && r.mat[i] !== BASE ? 1 : 0;
  const bare = r.toCanvas();
  r.outline();
  const made = { canvas: r.toCanvas(), bare, mask };
  closeCache.set(kind, made);
  return made;
};

const ICON_SIZE = 16;

const iconCanvas = (paint: (r: Raster) => void): HTMLCanvasElement => {
  const r = new Raster(ICON_SIZE);
  paint(r);
  return r.outline().toCanvas();
};

// O registro THREE e um mapa de modulo que sobrevive ao restart da cena: registrar uma vez so.
let threeRegistered = false;

const publish = (scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement, three: boolean): void => {
  if (three) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    registerTexture3D(key, tex);
  }
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, canvas);
};

/**
 * Publica as seis espécies e a faca nas DUAS pipelines (THREE: o chão e o pensamento do herói;
 * Phaser: a bolsa, a subtela, o item-get). O mesmo contrato do carvão: no boot da cena, depois do
 * loader 3D, idempotente por pipeline.
 */
export const registerFungiTextures = (scene: Phaser.Scene): void => {
  const three = !threeRegistered;
  for (const kind of MUSHROOM_KINDS) {
    const key = fungusTextureKey(kind);
    if (!three && scene.textures.exists(key)) continue;
    publish(scene, key, iconCanvas(PAINTERS[kind]), three);
  }
  if (three || !scene.textures.exists(KNIFE_TEXTURE_KEY)) {
    publish(scene, KNIFE_TEXTURE_KEY, iconCanvas(paintKnife), three);
  }
  threeRegistered = true;
};

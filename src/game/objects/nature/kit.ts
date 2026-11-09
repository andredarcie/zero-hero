import * as THREE from 'three';

import type { Season } from '@/game/runtime/seasons';
import { registerTexture3D, type PixelCanvas } from '@/game/render3d/textures3d';
import { createCanvas } from '@/game/platform/platform';

/**
 * O KIT DA NATUREZA: o que os bichos, as plantas e o tempo de objects/nature/ dividem.
 *
 * A ARTE SEGUE O TILESET (forest_tile_set.png) — o autor reprovou peça com paleta própria. Toda cor daqui existe lá;
 * o traço é o dele: pixel duro, 16 px por tile, sem degradê suave (só a névoa e o arco-íris, que são ar, são macios).
 */
export const TILESET = {
  black: '#000000',
  ink: '#111214',
  night: '#191817',
  navy: '#1d2b53',
  deepWater: '#1d3b45',
  water: '#265160',
  waterHi: '#27a9af',
  sky: '#557998',
  skyDk: '#405e7a',
  ice: '#bbf2f4',
  moss: '#8a8d49',
  leaf: '#626439',
  leafDk: '#4d4f2c',
  slate: '#3a3f3f',
  slateDk: '#272b2d',
  olive: '#4a5e3a',
  oliveDk: '#39571c',
  frog: '#64b964',
  frogDk: '#008751',
  lime: '#c8e775',
  lime2: '#e1f7a6',
  bark: '#815938',
  barkDk: '#63452c',
  barkDeep: '#674325',
  fur: '#886644',
  furDk: '#6b4f34',
  sand: '#b7916a',
  ochre: '#826841',
  rust: '#875717',
  rustDk: '#733e11',
  amber: '#dd9118',
  orange: '#e8964a',
  red: '#c83e3e',
  redHi: '#e83b3b',
  redDk: '#a53030',
  yellow: '#f1cc36',
  yellowHi: '#f2d36b',
  bone: '#e3dad1',
  boneDk: '#d4c2b1',
  pale: '#cdcdcd',
  grey: '#8a8a8a',
  greyDk: '#6f6f6f',
  stone: '#8e897d',
  stoneDk: '#7b776d',
  teal: '#0b8a8f',
  violet: '#a884f3',
} as const;

/**
 * O tom das peças do mundo: a luz do vale estoura os claros (o mesmo das peças do acampamento e da cachoeira).
 * Todo bicho e planta da natureza leva ele; sem ele margarida e cogumelo viravam lâmpadas.
 */
export const PROP_TINT = 0xb4b0aa;
// O QUE SE PISA (folhas no chão, poças, a sombra da copa) vai na camada `ground` do Billboard3D: deitado no chão sem
// ela, briga pela profundidade com o pé do herói (o quad dele é inclinado para trás) e o herói sai listrado.

export const hash = (a: number, b: number, seed: number): number => {
  const s = Math.sin(a * 127.1 + b * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

export type Put = (x: number, y: number, color: string, alpha?: number) => void;

/** Um desenho pixel a pixel: `put` pinta um pixel (arredonda, ignora fora do quadro). */
export const paint = (w: number, h: number, draw: (put: Put) => void): HTMLCanvasElement => {
  const c = createCanvas();
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const img = ctx.createImageData(w, h);
  const put: Put = (x, y, color, alpha = 1) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    img.data[i] = parseInt(color.slice(1, 3), 16);
    img.data[i + 1] = parseInt(color.slice(3, 5), 16);
    img.data[i + 2] = parseInt(color.slice(5, 7), 16);
    img.data[i + 3] = Math.round(alpha * 255);
  };
  draw(put);
  ctx.putImageData(img, 0, 0);
  // Os pixels vão junto (textures3d.PixelCanvas): a sombra mede a margem do desenho sem ler o canvas de volta da GPU.
  (c as PixelCanvas).zhPixels = img;
  return c;
};

/**
 * Desenha uma vez e registra como textura 3D (`smooth` só para o que é ar: névoa, arco-íris). Os desenhos declarados
 * no topo dos módulos ficam ESPERANDO até `flushTextures` (o NatureLife chama ao nascer): o registro de texturas só
 * pode ser escrito depois que o World3D carregou as dele (textures3d.registerTexture3D), e importar um módulo
 * acontece antes disso. Depois do flush, um desenho novo registra na hora.
 */
const registered = new Set<string>();
const pending = new Map<string, () => void>();
let flushed = false;
export const texture = (key: string, w: number, h: number, draw: (put: Put) => void, smooth = false): string => {
  if (registered.has(key) || pending.has(key)) return key;
  const make = (): void => {
    const tex = new THREE.CanvasTexture(paint(w, h, draw));
    tex.magFilter = smooth ? THREE.LinearFilter : THREE.NearestFilter;
    tex.minFilter = smooth ? THREE.LinearFilter : THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    registerTexture3D(key, tex);
    registered.add(key);
  };
  if (flushed) make(); else pending.set(key, make);
  return key;
};

/** Registra os desenhos que estavam esperando (uma vez; as chamadas seguintes não fazem nada). */
export const flushTextures = (): void => {
  flushed = true;
  for (const make of pending.values()) make();
  pending.clear();
};

/**
 * Desenha um mapa de caracteres: cada letra é uma cor da `legend`, '.' é vazio. A arte miúda fica legível no código.
 * Uma cor pode levar transparência: '#bbf2f4@0.55' (a asa da libélula).
 */
export const sprite = (key: string, rows: readonly string[], legend: Readonly<Record<string, string>>): string =>
  texture(key, rows[0].length, rows.length, (put) => {
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x += 1) {
        const c = legend[row[x]];
        if (!c) continue;
        const [color, alpha] = c.split('@');
        put(x, y, color, alpha ? Number(alpha) : 1);
      }
    });
  });

/** Uma árvore perto do herói: as do mapa (tile) e as do bosque (objects/BigTrees). */
export interface TreeSpot {
  x: number;
  y: number;
  /** Carvalho velho do bosque (copa larga, 2,5 tiles de altura). */
  big: boolean;
  /** Raio da copa no chão e altura dela (tiles). */
  crown: number;
  height: number;
}

/** O que a natureza pergunta ao mundo (o GameScene responde). */
export interface NatureHost {
  /** Onde o herói está agora (posição visual, entre tiles quando anda). */
  hero(): { x: number; y: number };
  /** Água aberta (rio, lago). */
  isWater(x: number, y: number): boolean;
  /** Chão livre: sem parede, sem água, sem item nem objeto no tile. */
  isFree(x: number, y: number): boolean;
  /** As árvores num raio (tiles) em volta de um ponto. */
  treesNear(x: number, y: number, r: number): readonly TreeSpot[];
  /** Quanta chuva cai agora (0..1). */
  rain(): number;
  /** Uma cena está tomando a tela (diálogo de corte, filme): os bichos não se assustam nem nascem. */
  busy(): boolean;
  /**
   * Quanto deste ponto é LAR deste sistema (0..1, world/biomeLife). Cada sistema recebe o seu host: `isFree`,
   * `isWater` e `treesNear` já respondem só dentro do lar dele; quem segue o herói (sementes, névoa, arco-íris)
   * multiplica a força por isto.
   */
  home(x: number, y: number): number;
}

/** Um quadro da natureza: o tempo e o lugar, iguais para todos os sistemas. */
export interface NatureFrame {
  /** Segundos desde o quadro anterior (com teto: uma aba voltando do fundo não teletransporta ninguém). */
  dt: number;
  /** Relógio interno, em ms. */
  clock: number;
  hero: { x: number; y: number };
  /** O herói está andando (ou acabou de andar). */
  heroMoving: boolean;
  /** O mostrador do dia (0 meia-noite, 0,25 amanhecer, 0,5 meio-dia, 0,75 pôr do sol). */
  phase: number;
  day: number;
  season: Season;
  rain: number;
  /** Dias de mostrador desde que a última chuva parou (0 chovendo; Infinity, seco há dias). */
  sinceRain: number;
  /** Vento agora (tiles/ms para o leste) e a rajada (0..1). */
  wind: number;
  gust: number;
  windyDay: boolean;
  host: NatureHost;
}

export interface NatureSystem {
  update(f: NatureFrame): void;
  destroy(): void;
}

/** Sobe suave de 0 a 1 entre e0 e e1. */
export const smooth = (e0: number, e1: number, x: number): number => {
  const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return k * k * (3 - 2 * k);
};

/** Uma janela do dia: 0 fora, sobe até 1 entre `a`..`b`, fica, e desce entre `c`..`d`. */
export const window01 = (x: number, a: number, b: number, c: number, d: number): number => smooth(a, b, x) * (1 - smooth(c, d, x));

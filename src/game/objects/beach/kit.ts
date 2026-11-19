import { world3d } from '@/game/render3d/World3D';

/**
 * O KIT DA PRAIA: o que os bichos, a câmera do mirante e o som da arrebentação dividem. A arte segue o tileset, como a
 * da natureza do vale (objects/nature/kit, de onde vêm a paleta, o `sprite` e o tom das peças).
 */

/** O que a praia pergunta ao mundo (o GameScene responde). */
export interface BeachWorld {
  /** Onde o herói está agora (posição visual, entre tiles quando anda). */
  hero(): { x: number; y: number };
  /** Chão livre: sem parede, sem água, sem item nem objeto no tile. */
  isFree(x: number, y: number): boolean;
  /** O chão deste tile é areia. */
  isSand(x: number, y: number): boolean;
  /** Quanta chuva cai agora (0..1). */
  rain(): number;
  /** Uma cena está tomando a tela (diálogo de corte, filme): os bichos não se assustam, a câmera não se mexe. */
  busy(): boolean;
}

/** Um quadro da praia: o tempo e o lugar, iguais para todos os sistemas. */
export interface BeachFrame {
  /** Segundos desde o quadro anterior (com teto). */
  dt: number;
  /** O relógio da praia, em ms. */
  clock: number;
  /** O relógio da ÁGUA, em segundos (World3D.elapsed): é por ele que a onda do shader anda (render3d/surf.swashAt). */
  time: number;
  hero: { x: number; y: number };
  /** A distância do herói à linha média da água, em tiles (negativa na areia; -99 longe da praia). */
  coast: number;
  /** O mostrador do dia (0 meia-noite, 0,25 amanhecer, 0,5 meio-dia, 0,75 pôr do sol). */
  phase: number;
  rain: number;
  /** Vento agora (tiles/ms para o leste) e a rajada (0..1). */
  wind: number;
  gust: number;
  world: BeachWorld;
}

export interface BeachSystem {
  update(f: BeachFrame): void;
  destroy(): void;
}

/** Longe da praia: o valor de `coastAt` onde não há costa medida. */
export const NO_COAST = -99;

/**
 * A distância até a linha média da água num ponto do mundo, em tiles: negativa na areia, positiva mar adentro
 * (render3d/surf.buildCoastField, guardado pelo assado em `tiles.coast`). NO_COAST fora do retângulo da praia.
 */
export const coastAt = (x: number, y: number): number => {
  const coast = world3d().tiles.coast;
  if (!coast) return NO_COAST;
  if (x < coast.x0 - 0.5 || x > coast.x1 + 0.5 || y < coast.z0 - 0.5 || y > coast.z1 + 0.5) return NO_COAST;
  // os cantos de tile são meio-inteiros: o canto (i − 0,5) guarda o índice i
  const gx = x + 0.5;
  const gy = y + 0.5;
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const u = gx - ix;
  const v = gy - iy;
  const f = coast.field;
  return (f(ix, iy) * (1 - u) + f(ix + 1, iy) * u) * (1 - v) + (f(ix, iy + 1) * (1 - u) + f(ix + 1, iy + 1) * u) * v;
};

export const smooth = (e0: number, e1: number, x: number): number => {
  const k = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return k * k * (3 - 2 * k);
};

import { texture, TILESET as P } from '@/game/objects/nature/kit';

/**
 * A ARTE DAS PEGADAS (pedido do autor, 2026-11-19: "melhore drasticamente o visual das pegadas do herói").
 *
 * Uma pegada é um BURACO no chão, e é assim que ela é desenhada: a sola de uma bota (bico, planta, a cintura que não
 * encosta no chão, o salto), afundada — o miolo escuro, mais fundo onde o peso cai (a planta e o salto) — com a parede
 * do lado da luz fazendo sombra dentro dela, e em volta o BEIÇO de chão que o pé empurrou: claro do lado da luz e na
 * frente, onde o passo jogou a terra. A luz desta arte vem sempre da esquerda (a regra da casa), então quem faz sombra
 * dentro do buraco é a parede de oeste.
 *
 * Pé esquerdo e pé direito são espelhos (o arco de dentro de um olha para o outro), e cada um vem nas quatro direções
 * do passo: a sombra e o beiço são calculados DEPOIS de girar a sola, então a luz continua vindo da esquerda e a terra
 * empurrada continua na frente do bico.
 *
 * Cada chão tem a sua: na TERRA o buraco e o beiço; na LAMA (terra na chuva) mais fundo, quase preto, com água parada
 * na planta; no CAPIM não há beiço, o pé só deita as folhas (mais claras, do lado que pega luz); na AREIA o beiço de
 * creme; na AREIA MOLHADA funda e escura, com a água brilhando no fundo. Tudo com transparência: a pegada escurece o chão
 * que já está ali (a cor do bioma, a hora), em vez de pintar um chão próprio por cima.
 */

export type PrintSurface = 'dirt' | 'mud' | 'grass' | 'sand' | 'wetSand';
export type PrintDir = 'n' | 'e' | 's' | 'w';

/**
 * A sola do pé ESQUERDO andando para o norte (o bico em cima; o lado de dentro, o do arco, é o leste). O número é a
 * profundidade: 2 = onde o peso cai (a planta e o salto), 1 = raso (o bico e a cintura). `G` marca onde a água junta.
 */
const SOLE = [
  '.12',
  '222',
  '21.',
  '.1.',
  '22.',
] as const;
const WATER_AT = { x: 1, y: 1 };

type Tone = readonly [string, number];
/**
 * deep = a sombra da parede de oeste e onde o peso afunda; mid = o resto do fundo; lit = a parede de leste, que a luz
 * da esquerda acende (é o par escuro-claro que faz um buraco ler como buraco, como letra cavada em pedra); lipHi = a
 * terra empurrada na frente do bico; lip = o beiço do lado da luz. Fracos de propósito: a primeira versão tinha o beiço
 * forte, a luz dourada do vale o deixava laranja, e a pegada lia como um elo de corrente.
 */
interface Palette { deep: Tone; mid: Tone; lit: Tone; lipHi?: Tone; lip?: Tone; water?: Tone }

const PALETTES: Record<PrintSurface, Palette> = {
  // (o claro da terra é OCRE, nunca creme: a luz do vale é dourada e acende o chão até 1,55 — creme saía amarelo-vivo)
  dirt: { deep: [P.slateDk, 0.6], mid: [P.barkDk, 0.42], lit: [P.ochre, 0.24], lipHi: [P.ochre, 0.34], lip: [P.ochre, 0.14] },
  mud: { deep: [P.night, 0.76], mid: [P.slate, 0.56], lit: [P.barkDk, 0.24], lipHi: [P.barkDk, 0.42], lip: [P.barkDk, 0.22], water: [P.sky, 0.74] },
  // o capim não afunda: as folhas deitam e brilham (o claro), e a borda que fica de pé faz a sombra
  grass: { deep: [P.oliveDk, 0.5], mid: [P.moss, 0.3], lit: [P.lime, 0.12] },
  // (a areia é desenhada com os mesmos cinzas: a pegada tem de ser MAIS escura que o grão mais escuro dela, senão some)
  sand: { deep: [P.slateDk, 0.86], mid: [P.slate, 0.74], lit: ['#7b776d', 0.62], lipHi: ['#ccbd99', 0.8], lip: ['#ccbd99', 0.4] },
  wetSand: { deep: [P.night, 0.86], mid: [P.slateDk, 0.8], lit: [P.slate, 0.6], lipHi: ['#a2895b', 0.5], lip: ['#a2895b', 0.24], water: [P.sky, 0.6] },
};

/** A sola girada para o rumo do passo (o bico para onde ele anda), e espelhada para o pé direito. */
const turned = (dir: PrintDir, right: boolean): { w: number; h: number; at: (x: number, y: number) => string } => {
  const W = 3;
  const H = SOLE.length;
  const base = (x: number, y: number): string => (x < 0 || y < 0 || x >= W || y >= H ? '.' : SOLE[y][right ? W - 1 - x : x]);
  const water = (x: number, y: number): boolean => x === (right ? W - 1 - WATER_AT.x : WATER_AT.x) && y === WATER_AT.y;
  // cada rumo leva a coordenada girada de volta para a da sola do norte
  const back: Record<PrintDir, (x: number, y: number) => [number, number]> = {
    n: (x, y) => [x, y],
    e: (x, y) => [y, H - 1 - x],
    s: (x, y) => [W - 1 - x, H - 1 - y],
    w: (x, y) => [W - 1 - y, x],
  };
  const vertical = dir === 'n' || dir === 's';
  return {
    w: vertical ? W : H,
    h: vertical ? H : W,
    at: (x, y) => {
      const [bx, by] = back[dir](x, y);
      const v = base(bx, by);
      return v !== '.' && water(bx, by) ? `${v}G` : v;
    },
  };
};

/** O rumo do bico, em pixels de arte (y cresce para o sul). */
const FRONT: Record<PrintDir, readonly [number, number]> = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

const draw = (surface: PrintSurface, dir: PrintDir, right: boolean): { key: string; w: number; h: number } => {
  const sole = turned(dir, right);
  const pal = PALETTES[surface];
  const W = sole.w + 2;
  const H = sole.h + 2;
  const inside = (x: number, y: number): boolean => sole.at(x - 1, y - 1) !== '.';
  const [fx, fy] = FRONT[dir];
  const key = `step-print-${surface}-${dir}-${right ? 'r' : 'l'}`;
  texture(key, W, H, (put) => {
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const v = sole.at(x - 1, y - 1);
        if (v !== '.') {
          // a parede de oeste faz sombra dentro do buraco (o pixel colado nela é fundo, ainda que a sola ali seja rasa);
          // a de leste pega a luz
          const shaded = !inside(x - 1, y);
          const litWall = !shaded && !inside(x + 1, y);
          const tone = v.endsWith('G') && pal.water ? pal.water
            : shaded ? pal.deep
              : litWall ? pal.lit
                : v.startsWith('2') ? pal.deep : pal.mid;
          put(x, y, tone[0], tone[1]);
          continue;
        }
        // o beiço: a terra que o bico empurrou para a frente, e um fio do lado da luz; atrás e do lado da sombra, nada
        if (!pal.lip || !pal.lipHi) continue;
        if (inside(x - fx, y - fy)) put(x, y, pal.lipHi[0], pal.lipHi[1]);
        else if (inside(x + 1, y)) put(x, y, pal.lip[0], pal.lip[1]);
      }
    }
  });
  return { key, w: W, h: H };
};

const ALL = new Map<string, { key: string; w: number; h: number }>();
for (const surface of Object.keys(PALETTES) as PrintSurface[]) {
  for (const dir of ['n', 'e', 's', 'w'] as const) {
    for (const right of [false, true]) ALL.set(`${surface}|${dir}|${right ? 1 : 0}`, draw(surface, dir, right));
  }
}

/** A pegada de um pé neste chão, com o bico para `dir`: a chave da textura e o tamanho em pixels de arte. */
export const stepPrint = (surface: PrintSurface, dir: PrintDir, right: boolean): { key: string; w: number; h: number } =>
  ALL.get(`${surface}|${dir}|${right ? 1 : 0}`)!;

/** O rumo de um passo pelo deslocamento (o maior dos dois eixos manda; y cresce para o sul). */
export const stepDir = (dx: number, dy: number): PrintDir =>
  (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : dy > 0 ? 's' : 'n');

/** Para que lado fica o pé ESQUERDO de quem anda neste rumo (em tiles: x leste, y sul). */
export const leftSide = (dir: PrintDir): readonly [number, number] =>
  ({ n: [-1, 0], s: [1, 0], e: [0, -1], w: [0, 1] } as const)[dir];

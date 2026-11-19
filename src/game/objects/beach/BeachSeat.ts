import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';

import { hash, texture, TILESET as P } from '@/game/objects/nature/kit';

/**
 * O GUARDA-SOL DE OLHAR O MAR (pedido do autor, 2026-11-19: "coloque um guarda-sol em que o herói poderá sentar e
 * observar a passagem do tempo olhando para o mar, para as nuvens, para o céu, para a lua, assim como é quando ele senta
 * e fica olhando o lago, só que seria olhando o mar").
 *
 * Um guarda-sol de listras fincado na areia e, ao lado dele, uma cadeira de praia de costas para a câmera, virada para
 * o mar. O Z diante da cadeira senta nela (scenes/game/SeaWatch): o tempo corre como no banco do lago, e a câmera desce
 * para trás do herói e levanta os olhos até o horizonte — o céu da hora, as nuvens, o sol nascendo no mar, a lua
 * (objects/beach/SeaVista, a câmera do horizonte). Qualquer tecla levanta.
 *
 * O LUGAR: ficava no extremo oeste, colado no pontal; sentado, o quadro pegava a serra de pedra e a mata da esquerda. O
 * autor pediu "mais para a direita, focado no mar, aparecendo os coqueiros, um clima bem de praia, evitando mostrar as
 * serras de pedra". Escolhido por conta, no quadro da câmera do horizonte (olho 6,2 atrás e 3,2 acima, ~38° para cada
 * lado): nenhum tile de serra, mata ou pontal; coqueiros dos dois lados do quadro (onze); nenhum na frente da câmera.
 */

/** A cadeira (onde se senta) e o guarda-sol, a oeste dela. Areia seca, a quatro tiles do mar, no meio da enseada. */
export const BEACH_CHAIR = { x: 41, y: -15 } as const;
export const BEACH_UMBRELLA = { x: 40, y: -15 } as const;
/** Para onde quem senta olha: o mar, reto ao norte. */
export const BEACH_VIEW = { x: BEACH_CHAIR.x, y: BEACH_CHAIR.y - 8 } as const;
/** A altura do assento da cadeira (tiles): o corpo sobe junto com o passo e desce ao levantar. */
export const BEACH_SEAT_LIFT = 0.1;

/** O guarda-sol: 24 × 30. Seis gomos, vermelho e osso, a sombra do lado direito (a luz da casa vem da esquerda). */
const UMBRELLA_W = 24;
const UMBRELLA_H = 30;
const UMBRELLA = texture('beach-umbrella', UMBRELLA_W, UMBRELLA_H, (put) => {
  const cx = 11.5;
  // a copa: uma cúpula rasa de y = 2 a y = 9, com a barra recortada em gomos (os bicos) nas linhas 9 e 10
  for (let y = 1; y <= 10; y += 1) {
    const t = (y - 1) / 8.5;
    const half = 11.6 * Math.sqrt(Math.min(1, t * (2 - t)) * 0.92 + 0.08);
    for (let x = 0; x < UMBRELLA_W; x += 1) {
      const dx = x + 0.5 - cx;
      if (Math.abs(dx) > half) continue;
      // os bicos da barra: a última linha só nos meios dos gomos
      const panel = Math.floor(((dx / half) + 1) * 3);
      const inPanel = ((dx / half) + 1) * 3 - panel;
      if (y === 10 && (inPanel < 0.3 || inPanel > 0.7)) continue;
      const red = panel % 2 === 0;
      const shade = dx > 2.5 || y >= 9;
      let color: string = red ? (shade ? P.redDk : P.red) : (shade ? P.boneDk : P.bone);
      // a costura entre dois gomos, um fio mais escuro
      if (inPanel < 0.08 && Math.abs(dx) > 1) color = red ? P.rustDk : P.greyDk;
      put(x, y, color);
    }
  }
  // a ponteira e o mastro (de madeira, dois pixels: o lado aceso e o da sombra), até a areia
  put(11, 0, P.barkDk);
  put(12, 0, P.barkDk);
  for (let y = 11; y < UMBRELLA_H; y += 1) {
    put(11, y, P.bark);
    put(12, y, P.barkDk);
  }
  // a sombra da copa no mastro, logo abaixo dela
  put(11, 11, P.barkDeep);
  // a areia amontoada no pé do mastro, onde ele foi fincado
  for (const [x, y, c] of [[9, 29, '#8e897d'], [10, 28, '#ccbd99'], [10, 29, '#8e897d'], [13, 28, '#7b776d'], [13, 29, '#7b776d'], [14, 29, '#5e5a56']] as const) {
    put(x, y, c);
  }
});

/** A cadeira de praia, 16 × 16, vista de COSTAS (ela olha o mar): o encosto de lona listrada no quadro de madeira. */
const CHAIR = texture('beach-chair', 16, 16, (put) => {
  // o quadro: dois montantes que sobem inclinados para trás (o encosto deitado) e as pernas
  for (let y = 2; y <= 15; y += 1) {
    const lean = y < 11 ? Math.round((11 - y) * 0.18) : 0;
    put(2 + lean, y, P.bark);
    put(13 - lean, y, P.barkDk);
  }
  // a travessa de cima e a do assento
  for (let x = 3; x <= 12; x += 1) {
    put(x, 2, P.bark);
    put(x, 11, P.barkDk);
  }
  // a lona: listras verticais, azul do mar e osso, com a sombra do peso no meio
  for (let y = 3; y <= 10; y += 1) {
    const lean = Math.round((11 - y) * 0.18);
    for (let x = 3 + lean; x <= 12 - lean; x += 1) {
      const stripe = Math.floor((x - 3) / 2) % 2 === 0;
      let color: string = stripe ? P.teal : P.bone;
      if (x >= 10) color = stripe ? P.deepWater : P.boneDk;
      if (y >= 9 && x > 4 && x < 11) color = stripe ? P.deepWater : P.boneDk;
      if (hash(x, y, 431) < 0.04) color = stripe ? P.waterHi : P.pale;
      put(x, y, color);
    }
  }
  // as pernas de trás, abertas, cravadas na areia
  for (const [x, y] of [[3, 14], [3, 15], [12, 14], [12, 15]] as const) put(x, y, P.barkDk);
});

/** O tom das peças da praia: a luz do vale estoura os claros (nature/kit PROP_TINT, um nada mais quente). */
const TINT = 0xc8c2b8;

export class BeachSeat {
  private readonly bodies: Billboard3D[] = [];

  public constructor() {
    this.bodies.push(world3d().objects.addBillboard(UMBRELLA, 0, { groundShadow: { rx: 0.7, rz: 0.3, alpha: 0.24 } })
      .setTint(TINT)
      .setDisplaySize(UMBRELLA_W / 16, UMBRELLA_H / 16)
      .setPosition(BEACH_UMBRELLA.x + 0.3, BEACH_UMBRELLA.y));
    this.bodies.push(world3d().objects.addBillboard(CHAIR, 0, { groundShadow: { rx: 0.42, rz: 0.2, alpha: 0.24 } })
      .setTint(TINT)
      .setDisplaySize(1, 1)
      .setPosition(BEACH_CHAIR.x, BEACH_CHAIR.y - 0.05));
  }

  /** O guarda-sol e a cadeira barram o passo (de cima da cadeira se sai: é só andar). */
  public at(x: number, y: number): boolean {
    return (x === BEACH_CHAIR.x && y === BEACH_CHAIR.y) || (x === BEACH_UMBRELLA.x && y === BEACH_UMBRELLA.y);
  }

  /** A cadeira, onde se senta. */
  public isChair(x: number, y: number): boolean {
    return x === BEACH_CHAIR.x && y === BEACH_CHAIR.y;
  }

  public destroy(): void {
    for (const bb of this.bodies) bb.destroy();
    this.bodies.length = 0;
  }
}

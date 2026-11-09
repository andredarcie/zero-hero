/**
 * O CAMINHO DE QUEM VEM SENTAR: o vizinho que sai de casa até a fogueira do herói, a Thea que corre até a bigorna,
 * quem acende o fogo dele ao anoitecer. É chão e nada mais, por isso mora aqui, sem cena: quem chama diz o que é
 * passável (`canMove`) e o resto é conta.
 */

export type VisitTile = readonly [number, number];

/** Até onde um vizinho atende o convite da fogueira (em tiles, em linha reta até o fogo). */
export const VISIT_RADIUS = 12;

/**
 * Pode ir de (fx, fy) para o vizinho (tx, ty)? Quem chama junta aqui o sólido (parede, árvore, NPC, prop) e o
 * degrau do relevo.
 */
export type VisitStep = (fx: number, fy: number, tx: number, ty: number) => boolean;

/**
 * Os lugares em volta do fogo, o do lado OPOSTO ao herói primeiro: é ali que alguém senta para conversar sem dizer
 * nada. Fora o próprio fogo e o tile do herói, e tudo o que `isFree` recusar.
 */
export const fireSeats = (
  fire: VisitTile,
  hero: VisitTile,
  isFree: (x: number, y: number) => boolean,
): Array<[number, number]> => {
  const [fx, fy] = fire;
  const [hx, hy] = hero;
  const seats: Array<[number, number]> = [];
  for (let oy = -1; oy <= 1; oy += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      const x = fx + ox;
      const y = fy + oy;
      if ((ox === 0 && oy === 0) || (x === hx && y === hy)) continue;
      if (!isFree(x, y)) continue;
      seats.push([x, y]);
    }
  }
  seats.sort((a, b) => Math.hypot(b[0] - hx, b[1] - hy) - Math.hypot(a[0] - hx, a[1] - hy));
  return seats;
};

/**
 * O caminho do vizinho até o lugar livre mais desejado que ele alcança (`seats` vem em ordem de desejo): BFS em 4
 * direções pelo chão livre, presa a uma caixa em volta do fogo (nunca o mapa inteiro). A casa dele conta como
 * livre (é ele mesmo que a ocupa), o tile do herói nunca. O caminho começa na casa; null = nenhum lugar alcançável.
 */
export const findVisitPath = (
  home: VisitTile,
  seats: ReadonlyArray<VisitTile>,
  hero: VisitTile,
  fire: VisitTile,
  canMove: VisitStep,
): Array<[number, number]> | null => {
  const box = VISIT_RADIUS + 3;
  const keyOf = (x: number, y: number): string => `${x},${y}`;
  const seatRank = new Map(seats.map(([x, y], i) => [keyOf(x, y), i]));
  const cameFrom = new Map<string, string | null>([[keyOf(home[0], home[1]), null]]);
  const queue: Array<[number, number]> = [[home[0], home[1]]];
  let best: string | null = null;
  let bestRank = Infinity;
  for (let head = 0; head < queue.length; head += 1) {
    const [x, y] = queue[head];
    const rank = seatRank.get(keyOf(x, y));
    if (rank !== undefined && rank < bestRank) { best = keyOf(x, y); bestRank = rank; if (rank === 0) break; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      const k = keyOf(nx, ny);
      if (cameFrom.has(k)) continue;
      if (Math.abs(nx - fire[0]) > box || Math.abs(ny - fire[1]) > box) continue;
      if ((nx === hero[0] && ny === hero[1]) || !canMove(x, y, nx, ny)) continue;
      cameFrom.set(k, keyOf(x, y));
      queue.push([nx, ny]);
    }
  }
  if (!best) return null;
  const path: Array<[number, number]> = [];
  for (let k: string | null = best; k; k = cameFrom.get(k) ?? null) {
    const [x, y] = k.split(',').map(Number);
    path.unshift([x, y]);
  }
  return path;
};

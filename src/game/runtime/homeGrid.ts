/**
 * A GRADE DO ACAMPAMENTO (pedido do autor, 2026-11-17): na bancada, o jogo para e o chão do acampamento vira uma grade
 * de tiles — VERDE onde dá para pôr uma peça, VERMELHO onde não dá (o mato alto que só a foice da Morte corta, e o tile
 * que fecharia o caminho). A regra é pura: quem pergunta ao mundo é a cena (scenes/game/BuildMode).
 *
 * A zona é o retângulo em volta da clareira; o mato verde dela (o que não pega fogo, objects/TallGrassObject) também é
 * medido por aqui.
 */

export const CAMP_ZONE = { x0: 48, y0: 44, x1: 59, y1: 52 } as const;

export const inCampZone = (x: number, y: number): boolean =>
  x >= CAMP_ZONE.x0 && x <= CAMP_ZONE.x1 && y >= CAMP_ZONE.y0 && y <= CAMP_ZONE.y1;

/**
 * As PASSAGENS: chão da zona que nunca recebe peça, porque é por ele que se sai do acampamento — o pé da escada do
 * morrinho ao norte (51,45) e a passagem do sul (54,51)-(54,52), as mesmas que scripts/mato-do-acampamento.mjs deixa
 * sem mato. A regra do caminho (`pathStaysOpen`) só pede UMA saída; estas garantem as duas. E a FRENTE DA BANCADA
 * (55,46), onde o herói a usa de frente (scripts/acampamento.mjs): peça nenhuma a tapa.
 */
export const CAMP_PASSAGES: ReadonlySet<string> = new Set(['51,45', '54,51', '54,52', '55,46']);

/**
 * O que um tile da zona É, para a grade: `void` não é chão do acampamento (água, serra, árvore, pedra, o fora do mapa)
 * e nem aparece; `grass` é o mato alto em pé; `fixed` é o que veio com o acampamento (o colchão, o fogo, o caderno, a
 * bancada); `piece` é o que o jogador pôs; `item` é uma coisa solta no chão; `open` é chão livre.
 */
export type GridCellKind = 'void' | 'grass' | 'fixed' | 'piece' | 'item' | 'open';

/** O que a grade mostra: `free` (verde), `grass`/`blocked` (vermelho), e as peças (a do jogador se muda de lugar). */
export type GridCellState = 'free' | 'grass' | 'blocked' | 'piece' | 'fixed';

export interface GridCell {
  x: number;
  y: number;
  state: GridCellState;
}

export interface GridWorld {
  /** O que é cada tile da zona. */
  kind(x: number, y: number): GridCellKind;
  /** O herói passa por este tile (o mundo inteiro, dentro e fora da zona)? */
  walkable(x: number, y: number): boolean;
  /** O passo de um tile ao vizinho (a serra só se vence pela escada). */
  canStep(x0: number, y0: number, x1: number, y1: number): boolean;
  /** Onde o herói está: é dele que se mede o caminho, e o tile dele nunca recebe peça. */
  hero: { x: number; y: number };
  /** O que tem de continuar ao alcance (um vizinho livre de cada): o colchão, o caderno, a bancada, as peças de usar. */
  keep: ReadonlyArray<{ x: number; y: number }>;
}

const DIRS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** Quanto a busca de caminho anda além da zona: o bastante para achar a saída do acampamento. */
const MARGIN = 4;

/**
 * O CAMINHO CONTINUA ABERTO com `extra` virando sólido? Do herói, pelo chão, tem de dar para chegar ao lado de cada
 * coisa de `keep` e SAIR da zona (ninguém se tranca dentro do próprio acampamento).
 */
export const pathStaysOpen = (world: GridWorld, extra: { x: number; y: number } | null, free: { x: number; y: number } | null = null): boolean => {
  const key = (x: number, y: number): number => (y + 64) * 256 + (x + 64);
  const blocked = (x: number, y: number): boolean => {
    if (extra && extra.x === x && extra.y === y) return true;
    if (free && free.x === x && free.y === y) return false;
    return !world.walkable(x, y);
  };
  const bounds = {
    x0: CAMP_ZONE.x0 - MARGIN, x1: CAMP_ZONE.x1 + MARGIN, y0: CAMP_ZONE.y0 - MARGIN, y1: CAMP_ZONE.y1 + MARGIN,
  };
  const seen = new Set<number>([key(world.hero.x, world.hero.y)]);
  const queue: Array<[number, number]> = [[world.hero.x, world.hero.y]];
  let left = false;
  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    if (!inCampZone(x, y)) left = true;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < bounds.x0 || nx > bounds.x1 || ny < bounds.y0 || ny > bounds.y1) continue;
      const k = key(nx, ny);
      if (seen.has(k) || blocked(nx, ny) || !world.canStep(x, y, nx, ny)) continue;
      seen.add(k);
      queue.push([nx, ny]);
    }
  }
  if (!left) return false;
  return world.keep.every((t) => DIRS.some(([dx, dy]) => seen.has(key(t.x + dx, t.y + dy))));
};

/**
 * A GRADE: cada tile da zona que é chão do acampamento, com a cor dele. `lifted` é a peça que o jogador levantou para
 * mudar de lugar: o tile dela conta como livre enquanto ela está na mão.
 */
export const gridCells = (world: GridWorld, lifted: { x: number; y: number } | null = null): GridCell[] => {
  const cells: GridCell[] = [];
  for (let y = CAMP_ZONE.y0; y <= CAMP_ZONE.y1; y += 1) {
    for (let x = CAMP_ZONE.x0; x <= CAMP_ZONE.x1; x += 1) {
      const isLifted = lifted?.x === x && lifted.y === y;
      const kind = isLifted ? 'open' : world.kind(x, y);
      if (kind === 'void') continue;
      if (kind === 'grass') cells.push({ x, y, state: 'grass' });
      else if (kind === 'fixed') cells.push({ x, y, state: 'fixed' });
      else if (kind === 'piece') cells.push({ x, y, state: 'piece' });
      else if (kind === 'item' || (world.hero.x === x && world.hero.y === y)) cells.push({ x, y, state: 'blocked' });
      else cells.push({ x, y, state: pathStaysOpen(world, { x, y }, lifted) ? 'free' : 'blocked' });
    }
  }
  return cells;
};

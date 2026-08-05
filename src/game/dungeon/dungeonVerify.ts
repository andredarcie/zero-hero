import { CHUNK_COLUMNS, CHUNK_ROWS, SEA_TILE_FRAME } from '@/game/constants';
import type { WorldData } from '@/game/world/worldSchema';
import type { DungeonPlan, Tile } from './dungeonBuild';
import { ROOM_H, ROOM_W } from './dungeonRooms';

/**
 * O JUIZ — o único no gerador que pode dizer NÃO.
 *
 * Toda a parte anterior constrói com boa intenção; esta joga a dungeon antes do jogador e recusa a
 * que não se sustenta. É a mesma lei que o repositório já tinha para props que bloqueiam ("só
 * entra com prova de BFS"), levada ao mapa inteiro — e é o que separa "gerador procedural" de
 * "gerador que a gente pode publicar".
 *
 * ── O BFS TEM ESTADO, E É POR ISSO QUE ELE ENXERGA FECHADURA ────────────────────────────────
 * Alcance simples responde "dá para andar até lá?" e mente na primeira porta trancada: ou ela é
 * parede (e o tesouro é inalcançável no papel), ou é chão (e a fechadura não existe). O juiz roda
 * um PONTO FIXO monótono:
 *
 *     alcance → o que dá para pegar/abrir daqui → alcance de novo → ... até não mudar nada
 *
 * Monótono porque nada neste jogo se desfaz: a chave não se gasta (`GameScene`: "The key is NOT
 * consumed"), o caixote fica na placa para sempre, o portão que subiu não desce. Sem essa
 * propriedade o ponto fixo não convergiria e a verificação viraria busca em grafo de estados.
 *
 * ── E O CICLO É COBRADO COMO CICLO ──────────────────────────────────────────────────────────
 * A missão promete dois caminhos independentes até o objetivo. A planta pode ter engolido um
 * deles (uma sala que virou beco, uma porta que a forma selou), e um ciclo que só existe no grafo
 * não é sentido por ninguém. Então o juiz FECHA uma porta de cada arco, uma de cada vez, e exige
 * que o objetivo continue alcançável pelo outro. É a definição operacional de "tem volta".
 */

export type DungeonVerdict = {
  ok: boolean;
  reasons: string[];
  metrics: {
    rooms: number;
    cycle: string;
    /** Distância em tiles, andando, da escada até o tesouro. */
    criticalPath: number;
    /** Quantos % do chão da dungeon o herói alcança com tudo aberto. */
    reachablePercent: number;
    locks: number;
  };
};

type Grid = {
  w: number;
  h: number;
  walkable: boolean[][];
};

const key = (x: number, y: number): string => `${x},${y}`;

const terrainGrid = (world: WorldData): Grid => {
  const w = world.meta.worldChunksX * CHUNK_COLUMNS;
  const h = world.meta.worldChunksY * CHUNK_ROWS;
  const walkable = Array.from({ length: h }, () => new Array<boolean>(w).fill(false));
  for (const chunk of world.chunks) {
    for (let ly = 0; ly < CHUNK_ROWS; ly++) {
      for (let lx = 0; lx < CHUNK_COLUMNS; lx++) {
        const x = chunk.cx * CHUNK_COLUMNS + lx;
        const y = chunk.cy * CHUNK_ROWS + ly;
        if (x >= w || y >= h) continue;
        walkable[y][x] = chunk.upper[ly][lx] === null
          && chunk.ground[ly][lx] !== SEA_TILE_FRAME
          && !chunk.collisions[ly][lx];
      }
    }
  }
  return { w, h, walkable };
};

const flood = (grid: Grid, start: Tile, blocked: Set<string>): Set<string> => {
  const seen = new Set<string>();
  if (!grid.walkable[start.y]?.[start.x]) return seen;
  seen.add(key(start.x, start.y));
  const queue: Tile[] = [start];
  for (let head = 0; head < queue.length; head++) {
    const { x, y } = queue[head];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      const k = key(nx, ny);
      if (seen.has(k) || blocked.has(k)) continue;
      if (!grid.walkable[ny]?.[nx]) continue;
      seen.add(k);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
};

/** Distância andando entre dois tiles, com um conjunto de bloqueios. -1 = não chega. */
const walkDistance = (grid: Grid, from: Tile, to: Tile, blocked: Set<string>): number => {
  const dist = new Map<string, number>([[key(from.x, from.y), 0]]);
  const queue: Tile[] = [from];
  for (let head = 0; head < queue.length; head++) {
    const { x, y } = queue[head];
    const d = dist.get(key(x, y))!;
    if (x === to.x && y === to.y) return d;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      const k = key(nx, ny);
      if (dist.has(k) || blocked.has(k) || !grid.walkable[ny]?.[nx]) continue;
      dist.set(k, d + 1);
      queue.push({ x: nx, y: ny });
    }
  }
  return -1;
};

/**
 * O ponto fixo: alcance com as fechaduras que já se sabe abrir. Devolve o alcance final e quais
 * fechaduras ficaram fechadas.
 */
const solve = (grid: Grid, plan: DungeonPlan, extraBlocked: Set<string>): { reach: Set<string>; stuck: number } => {
  const closed = new Map<number, Set<string>>();
  plan.locks.forEach((lock, i) => closed.set(i, new Set(lock.gateTiles.map((t) => key(t.x, t.y)))));
  // O caixote é um corpo sólido: ele bloqueia o tile dele até ser empurrado.
  const crates = new Set<string>();
  for (const lock of plan.locks) if (lock.crateTile) crates.add(key(lock.crateTile.x, lock.crateTile.y));

  let reach = new Set<string>();
  for (let round = 0; round < plan.locks.length + 2; round++) {
    const blocked = new Set<string>(extraBlocked);
    for (const tiles of closed.values()) for (const t of tiles) blocked.add(t);
    for (const c of crates) blocked.add(c);
    reach = flood(grid, plan.start, blocked);

    let opened = false;
    plan.locks.forEach((lock, i) => {
      if (!closed.has(i)) return;
      if (lock.kind === 'key') {
        if (lock.keyTile && reach.has(key(lock.keyTile.x, lock.keyTile.y))) {
          closed.delete(i);
          opened = true;
        }
        return;
      }
      // A PLACA: o herói precisa alcançar o tile ATRÁS do caixote (é de lá que ele empurra) e a
      // faixa de empurrão precisa estar limpa até a placa. É o mesmo teste que o `handlePlayerBump`
      // faz na mão — `isTileOccupied` no tile seguinte —, só que para os dois empurrões de uma vez.
      const { crateTile, pushLane } = lock;
      if (!crateTile || !pushLane || pushLane.length === 0) return;
      const dir = { x: pushLane[0].x - crateTile.x, y: pushLane[0].y - crateTile.y };
      const behind = { x: crateTile.x - dir.x, y: crateTile.y - dir.y };
      const laneClear = pushLane.every((t) => grid.walkable[t.y]?.[t.x] && !extraBlocked.has(key(t.x, t.y)));
      if (laneClear && reach.has(key(behind.x, behind.y))) {
        crates.delete(key(crateTile.x, crateTile.y));
        closed.delete(i);
        opened = true;
      }
    });
    if (!opened) break;
  }
  return { reach, stuck: closed.size };
};

export const verifyDungeon = (world: WorldData, plan: DungeonPlan): DungeonVerdict => {
  const grid = terrainGrid(world);
  const reasons: string[] = [];
  const none = new Set<string>();
  const { reach, stuck } = solve(grid, plan, none);
  const has = (t: Tile): boolean => reach.has(key(t.x, t.y));

  if (stuck > 0) reasons.push('fechadura-sem-solucao');

  // O tesouro, que é a razão de a dungeon existir.
  for (const t of plan.treasure) if (!has(t)) reasons.push('tesouro-inalcancavel');
  const expected = plan.brief.treasure.reduce((n, [, count]) => n + count, 0);
  if (plan.treasure.length !== expected) reasons.push('tesouro-incompleto');

  // Toda sala tem de ser visitável: uma sala fechada é conteúdo que ninguém vê e área que o mapa
  // promete sem cumprir.
  for (const room of plan.rooms) {
    let touched = false;
    for (let y = 1; y < ROOM_H - 1 && !touched; y++) {
      for (let x = 1; x < ROOM_W - 1; x++) {
        if (reach.has(key(room.originX + x, room.originY + y))) { touched = true; break; }
      }
    }
    if (!touched) { reasons.push('sala-ilhada'); break; }
  }

  // Conteúdo preso: cova, coração ou chave atrás de parede é o mesmo bug com três nomes.
  for (const chunk of world.chunks) {
    for (const e of chunk.enemies) if (!has({ x: e.worldX, y: e.worldY })) { reasons.push('cova-inalcancavel'); break; }
    for (const p of chunk.pickups) if (!has({ x: p.worldX, y: p.worldY })) { reasons.push('item-inalcancavel'); break; }
  }

  // Os primeiros passos são leitura, não briga.
  const entrance = plan.rooms.find((r) => r.id === plan.entranceRoom);
  for (const chunk of world.chunks) {
    for (const e of chunk.enemies) {
      if (Math.hypot(e.worldX - plan.portal.x, e.worldY - plan.portal.y) <= 6) {
        reasons.push('cova-colada-na-escada');
        break;
      }
      if (entrance
        && e.worldX >= entrance.originX && e.worldX < entrance.originX + ROOM_W
        && e.worldY >= entrance.originY && e.worldY < entrance.originY + ROOM_H) {
        reasons.push('cova-na-sala-de-entrada');
        break;
      }
    }
  }

  // UMA ESPÉCIE POR SALA — a lei do bestiário, cobrada no mapa e não na intenção.
  for (const room of plan.rooms) {
    const kinds = new Set<string>();
    for (const chunk of world.chunks) {
      for (const e of chunk.enemies) {
        if (e.worldX >= room.originX && e.worldX < room.originX + ROOM_W
          && e.worldY >= room.originY && e.worldY < room.originY + ROOM_H) kinds.add(e.type);
      }
    }
    if (kinds.size > 1) { reasons.push('duas-especies-numa-sala'); break; }
  }

  // ── O CICLO É REAL? ────────────────────────────────────────────────────────
  if (!plan.linear) {
    for (const arc of ['a', 'b'] as const) {
      const edge = plan.edges.find((e) => e.loop === arc);
      if (!edge) { reasons.push(`arco-${arc}-ausente`); continue; }
      const blocked = new Set(edge.tiles.map((t) => key(t.x, t.y)));
      const alternative = solve(grid, plan, blocked);
      const stillThere = plan.treasure.every((t) => alternative.reach.has(key(t.x, t.y)));
      if (!stillThere) reasons.push(`ciclo-falso-${arc}`);
    }
  }

  const floorTiles = grid.walkable.flat().filter(Boolean).length;
  const criticalPath = plan.treasure[0] ? walkDistance(grid, plan.start, plan.treasure[0], none) : -1;

  return {
    ok: reasons.length === 0,
    reasons: [...new Set(reasons)],
    metrics: {
      rooms: plan.rooms.length,
      cycle: plan.cycle,
      criticalPath,
      reachablePercent: floorTiles > 0 ? Math.round((reach.size / floorTiles) * 1000) / 10 : 0,
      locks: plan.locks.length,
    },
  };
};

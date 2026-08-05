import type { DungeonBrief } from './dungeonBriefs';
import type { Mission } from './dungeonMission';
import type { Rng } from './dungeonRandom';

/**
 * O ESPAÇO — pendurar o grafo da missão numa grade de salas.
 *
 * A regra é uma só: **toda aresta da missão vira duas salas VIZINHAS**. Não há corredor curvo, não
 * há ligação a distância, não há sala-corredor inventada no meio. Aresta = parede compartilhada
 * com uma porta nela. Isso é o que faz o mapa contar a mesma história que o grafo — se uma aresta
 * pudesse virar um corredor de cinco tiles, o ciclo continuaria existindo no papel e sumiria da
 * mão.
 *
 * O algoritmo é busca com retrocesso, e ela é barata porque o problema é pequeno (≤ 20 nós, ≤ 30
 * células): coloca os nós em ordem de largura a partir da entrada, e cada nó só pode ir para uma
 * célula vizinha de TODOS os vizinhos dele que já estão colocados. É a mesma ideia do Edgar
 * (layout dirigido por grafo, com ciclos), sem o recozimento simulado — numa grade discreta deste
 * tamanho, retroceder resolve.
 *
 * A entrada nasce na fileira MAIS AO SUL, sempre. No Zelda entra-se por baixo, e o jogo já ensinou
 * isso com nove dungeons; além disso a escada de volta fica no tile da entrada, e uma escada no
 * meio do mapa é uma saída que se acha por acidente.
 */

export type Cell = { gx: number; gy: number };
export type Placement = Map<number, Cell>;

const NEIGHBOURS: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];

const key = (gx: number, gy: number): string => `${gx},${gy}`;

/**
 * Embute a missão na grade. Devolve `null` quando não coube — o chamador re-sorteia a missão
 * inteira, que é mais barato e mais honesto do que deformar o grafo até caber.
 */
export const embedMission = (mission: Mission, brief: DungeonBrief, rng: Rng): Placement | null => {
  // ── A ORDEM DE COLOCAÇÃO É O ALGORITMO ─────────────────────────────────────────────────────
  //
  // O CICLO PRIMEIRO, sempre. A primeira versão colocava em largura a partir da entrada, e isso
  // reprovava 1 em cada 4 sementes da dungeon 9: os becos são colocados junto com os arcos, ocupam
  // as células em volta, e quando o anel finalmente vai fechar não sobrou vizinhança para a
  // antessala. O anel é a peça rígida (ele tem de voltar ao ponto de partida) e os becos são os
  // frouxos (qualquer célula livre serve) — então o rígido escolhe primeiro e o frouxo se acomoda.
  //
  // Medido: com esta ordem, a emergência linear deixou de acontecer nas nove.
  const arcPath = (arc: 'a' | 'b'): number[] => {
    const path: number[] = [];
    let current = mission.entrance;
    const walked = new Set<number>([current]);
    for (;;) {
      const edge = mission.edges.find((e) => e.loop === arc
        && ((e.a === current && !walked.has(e.b)) || (e.b === current && !walked.has(e.a))));
      if (!edge) break;
      current = edge.a === current ? edge.b : edge.a;
      walked.add(current);
      if (current === mission.antechamber) break;
      path.push(current);
    }
    return path;
  };

  const order: number[] = [mission.entrance, ...arcPath('a'), mission.antechamber, ...arcPath('b'), mission.goal];
  const seen = new Set<number>(order);
  const queue = [...order];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const edge of mission.edges) {
      const next = edge.a === id ? edge.b : (edge.b === id ? edge.a : -1);
      if (next < 0 || seen.has(next)) continue;
      seen.add(next);
      order.push(next);
      queue.push(next);
    }
  }
  if (order.length !== mission.nodes.length) return null; // grafo desconexo: bug de missão, não de layout

  const adjacency = new Map<number, number[]>();
  for (const edge of mission.edges) {
    adjacency.set(edge.a, [...(adjacency.get(edge.a) ?? []), edge.b]);
    adjacency.set(edge.b, [...(adjacency.get(edge.b) ?? []), edge.a]);
  }

  const placement: Placement = new Map();
  const taken = new Set<string>();
  let steps = 0;

  const fits = (id: number, gx: number, gy: number): boolean => {
    if (gx < 0 || gy < 0 || gx >= brief.gridW || gy >= brief.gridH) return false;
    if (taken.has(key(gx, gy))) return false;
    for (const other of adjacency.get(id) ?? []) {
      const at = placement.get(other);
      if (!at) continue;
      if (Math.abs(at.gx - gx) + Math.abs(at.gy - gy) !== 1) return false;
    }
    // Vizinhança ACIDENTAL (duas salas coladas sem aresta entre elas) é PERMITIDA, e essa decisão
    // custou uma reescrita: proibi-la mata o ciclo mais natural que existe. O anel de 6 salas
    // embute num retângulo 2×3, e nele as duas salas do meio se encostam sem serem vizinhas no
    // grafo — proibir isso obriga todo loop a ser gordo, e loop gordo é caminhada. E não há mentira
    // nenhuma em aceitar: cada sala tem o seu próprio anel de parede, então uma parede sem porta
    // são DOIS tiles de alvenaria maciça — exatamente o que o jogador lê como "não passa".
    return true;
  };

  const place = (index: number): boolean => {
    if (index >= order.length) return true;
    if (steps++ > 20000) return false; // teto de busca: re-sortear é mais barato que insistir
    const id = order[index];

    let candidates: Cell[] = [];
    if (index === 0) {
      // A entrada, na fileira mais ao sul.
      for (let gx = 0; gx < brief.gridW; gx++) candidates.push({ gx, gy: brief.gridH - 1 });
    } else {
      let anchor: Cell | undefined;
      for (const other of adjacency.get(id) ?? []) {
        const at = placement.get(other);
        if (at) { anchor = at; break; }
      }
      if (!anchor) return false;
      candidates = NEIGHBOURS.map(([dx, dy]) => ({ gx: anchor.gx + dx, gy: anchor.gy + dy }));
    }

    for (const cell of rng.shuffled(candidates)) {
      if (!fits(id, cell.gx, cell.gy)) continue;
      placement.set(id, cell);
      taken.add(key(cell.gx, cell.gy));
      if (place(index + 1)) return true;
      placement.delete(id);
      taken.delete(key(cell.gx, cell.gy));
    }
    return false;
  };

  // Reinícios: a busca é gulosa no prefixo, e um prefixo azarado esgota o orçamento sem que o
  // problema fosse insolúvel. Recomeçar com outra ordem de tentativa é mais barato do que aumentar
  // o teto de passos — e muito mais barato do que jogar a missão inteira fora.
  for (let restart = 0; restart < 6; restart++) {
    placement.clear();
    taken.clear();
    steps = 0;
    if (place(0)) return placement;
  }
  return null;
};

/**
 * De que lado fica `to` visto de `from`. Devolve o índice do lado (0=N 1=L 2=S 3=O) — a mesma
 * ordem de `PropDir` e a mesma dos frames direcionais, para nada aqui precisar de tradução.
 */
export const sideBetween = (from: Cell, to: Cell): 0 | 1 | 2 | 3 => {
  if (to.gy < from.gy) return 0;
  if (to.gx > from.gx) return 1;
  if (to.gy > from.gy) return 2;
  return 3;
};

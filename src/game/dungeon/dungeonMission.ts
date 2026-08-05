import type { DungeonBrief, DungeonLock } from './dungeonBriefs';
import type { Rng } from './dungeonRandom';

/**
 * A MISSÃO — o grafo, e ele vem ANTES do mapa.
 *
 * A ordem é o achado inteiro (Dormans, e depois o Unexplored): primeiro se decide o que o jogador
 * FAZ e em que ordem — o que tranca o quê, onde está a chave, por onde se volta —, e só depois
 * onde isso mora. Inverter é o que o jogo tem hoje: nove plantas bonitas em que a única pergunta é
 * "já andei por aqui?".
 *
 * ── O ESQUELETO É UM CICLO, NUNCA UMA ÁRVORE ────────────────────────────────────────────────
 * Toda missão daqui tem a mesma espinha:
 *
 *        entrada ──(arco A)──┐
 *           │                ├── antessala ──[fechadura]── objetivo
 *           └──(arco B)──────┘
 *
 * Dois caminhos independentes da entrada até a antessala, e o objetivo atrás de uma fechadura. É
 * isso que faz caber level design onde só cabia labirinto: a chave pode morar num arco e a porta
 * no outro, dá para voltar por onde não se veio, e uma sala pode ser revisitada por um lado que
 * ela ainda não tinha mostrado. Numa árvore, "voltar" é sempre desandar o mesmo corredor.
 *
 * As bifurcações (`reward`, `rest`) penduram-se nos arcos até a dungeon ter o número de salas que
 * o brief pede. Elas são becos de propósito: um beco com recompensa é uma decisão ("vale o
 * desvio?"), e um mapa só de caminho crítico não tem nenhuma.
 *
 * ── O QUE NÃO ESTÁ AQUI ─────────────────────────────────────────────────────────────────────
 * Nada de geometria. A missão não sabe o tamanho de uma sala, quantos tiles tem um corredor nem
 * para que lado fica o norte — quem embute isso na grade é o `dungeonLayout`, e quem desenha é o
 * `dungeonRooms`. Este arquivo é o único do gerador que se poderia ler em voz alta.
 */

export type MissionRole =
  | 'entrance'
  | 'goal'
  | 'antechamber'
  | 'key'
  | 'arena'
  | 'reward'
  | 'rest'
  | 'plain';

export type MissionNode = {
  id: number;
  role: MissionRole;
  /** Em que arco do ciclo ele nasceu — 'core' é entrada, antessala e objetivo. */
  arc: 'a' | 'b' | 'core';
};

export type MissionEdge = {
  a: number;
  b: number;
  /** A fechadura NA PASSAGEM (nunca na sala): é o corredor que fecha, e é lá que o prop nasce. */
  gate?: DungeonLock;
  /** Marca as arestas que formam o ciclo — o verificador usa isto para provar que ele é real. */
  loop?: 'a' | 'b';
};

export type Mission = {
  /** O nome do ciclo escolhido, para o relatório e para a auditoria. */
  cycle: string;
  nodes: MissionNode[];
  edges: MissionEdge[];
  entrance: number;
  antechamber: number;
  goal: number;
  gate: DungeonLock | null;
};

type CycleKind = {
  id: string;
  /** Que fechadura fecha o objetivo. `null` = o objetivo é aberto e o ciclo é a única estrutura. */
  gate: DungeonLock | null;
  /** Uma das salas do arco curto vira arena (o dobro de covas). */
  arena: boolean;
  /** A chave mora num BECO (mais interessante) ou no próprio arco. */
  keyInBranch: boolean;
};

/**
 * O CATÁLOGO. Cinco ciclos, e cada um é uma frase diferente sobre a mesma planta.
 *
 * O catálogo é autorado e curto de propósito. O Unexplored tem ~5.000 regras porque tinha o
 * Ludoscope para editá-las; sem ferramenta, um catálogo que cabe numa tela é a versão honesta do
 * mesmo princípio — e cresce uma linha por vez, sempre que alguém tiver uma frase nova.
 *
 * Duas fechaduras que o jogo TEM e que não estão aqui, e o motivo medido de cada uma:
 *
 * • **o portão de bater (`swingGate`) como atalho de mão única** — não existe. Quem decide "o lado
 *   de lá" é o SENTIDO DO ESBARRÃO (`GameScene.handlePlayerBump`: `isTileOccupied(wx+dx, wy+dy)`),
 *   então bloquear o tile de trás para proibir um dos lados bloqueia junto o tile em que o herói
 *   precisaria estar para abrir pelo outro. Ele é uma fechadura de MUNDO (queime o mato do outro
 *   lado, mande o braço), não de direção.
 * • **o fogo que abre** — dentro de uma dungeon não há fonte de fogo, e não pode haver: fogueira
 *   acesa é parede para todo monstro, e uma delas aqui reescreveria o encontro inteiro. Sem fonte,
 *   a tocha do herói é combustível que ele pode ter deixado lá fora — e uma fechadura que depende
 *   do que o jogador trouxe é uma fechadura que tranca a dungeon.
 */
const CYCLES: readonly CycleKind[] = [
  { id: 'duas-rotas', gate: null, arena: false, keyInBranch: false },
  { id: 'a-guarda', gate: null, arena: true, keyInBranch: false },
  { id: 'chave-e-porta', gate: 'key', arena: false, keyInBranch: true },
  { id: 'chave-guardada', gate: 'key', arena: true, keyInBranch: false },
  { id: 'a-placa', gate: 'plate', arena: false, keyInBranch: false },
];

export const buildMission = (brief: DungeonBrief, rng: Rng): Mission => {
  const allowed = CYCLES.filter((c) => c.gate === null || brief.locks.includes(c.gate));
  const cycle = rng.pick(allowed);

  const nodes: MissionNode[] = [];
  const edges: MissionEdge[] = [];
  const add = (role: MissionRole, arc: MissionNode['arc']): number => {
    const id = nodes.length;
    nodes.push({ id, role, arc });
    return id;
  };

  const entrance = add('entrance', 'core');
  const antechamber = add('antechamber', 'core');

  // Os dois arcos, e o comprimento deles CRESCE com a dungeon. Com arco fixo em 2-3 salas, a nona
  // dungeon media os mesmos ~50 tiles de caminho crítico que a primeira: ela era larga (vinte
  // salas) e rasa (o tesouro a cinco portas da escada), porque tudo o que o brief pedia a mais
  // virava beco opcional. A descida tem de ficar mais funda, não só mais cheia.
  //
  // Mesmo assim o arco continua curto em termos absolutos: o ciclo precisa ser andável de uma
  // sentada, senão ele deixa de ser um loop percebido e vira "o mapa é grande".
  const extra = Math.floor((brief.rooms - 10) / 4);
  const lenA = rng.range(2 + extra, 3 + extra);
  // ⚠️ **OS DOIS ARCOS TÊM DE TER A MESMA PARIDADE.** Não é estética: o ciclo vai ser embutido numa
  // GRADE, e todo ciclo de uma grade tem comprimento par (ela é um grafo bipartido — cada passo
  // troca a cor da casa, e voltar ao começo exige um número par de passos). O anel mede
  // `2 + lenA + lenB`, então arcos de paridades diferentes pedem um anel ímpar, que não existe.
  //
  // Sem esta linha metade das missões era IMPOSSÍVEL, e o layout gastava seis reinícios provando
  // isso: medido, 1.744 recusas em 1.800 sementes e uma cauda de 499ms na dungeon 9. A diferença
  // continua existindo — ela só anda de dois em dois, o que dá arcos bem assimétricos (2 contra 4,
  // 3 contra 5) sem pedir o impossível.
  const lenB = Math.max(2, lenA + 2 * rng.pick([-1, 0, 0, 1]));
  const arcLen = { a: lenA, b: lenB };
  const arcs: Record<'a' | 'b', number[]> = { a: [], b: [] };
  for (const arc of ['a', 'b'] as const) {
    let prev = entrance;
    for (let i = 0; i < arcLen[arc]; i++) {
      const id = add('plain', arc);
      arcs[arc].push(id);
      edges.push({ a: prev, b: id, loop: arc });
      prev = id;
    }
    edges.push({ a: prev, b: antechamber, loop: arc });
  }

  // O objetivo fica atrás da fechadura, e ela mora na PASSAGEM antessala → objetivo.
  const goal = add('goal', 'core');
  edges.push({ a: antechamber, b: goal, gate: cycle.gate ?? undefined });

  // As bifurcações, até bater o número de salas do brief. Cada uma pendura num nó de arco (nunca
  // na entrada, nunca no objetivo): beco com recompensa é uma decisão, e o caminho crítico sozinho
  // não tem nenhuma.
  // As bifurcações penduram nos nós de arco e, quando estes se esgotam, umas nas outras — um beco
  // de duas salas ainda é um beco. Os tetos (2 por sala de arco, 1 por sala de beco) existem
  // porque uma sala com quatro portas deixa de ser um lugar e vira um cruzamento: o embutimento
  // na grade tem quatro lados e gastá-los todos em becos não sobra passagem para o ciclo.
  // ⚠️ O TETO DE BECOS É UMA CONTA DE GRAU, NÃO UM GOSTO. Uma célula da grade tem QUATRO lados, e
  // um nó com cinco arestas não se embute em grade nenhuma — a missão fica linda no papel e o
  // layout reprova toda semente. A antessala já nasce com três arestas (arco A, arco B, objetivo),
  // então ela aceita UM beco; um nó de arco tem duas e aceita dois; um beco tem uma e aceita um.
  // Foi assim que a dungeon 9 caía na emergência em 1 de cada 4 sementes.
  const branches: number[] = [];
  const used = new Map<number, number>();
  const limitOf = (id: number): number => {
    if (id === antechamber) return 1;
    return branches.includes(id) ? 1 : 2;
  };
  let guard = 0;
  while (nodes.length < brief.rooms && guard++ < 400) {
    const all = [...arcs.a, ...arcs.b, antechamber, ...branches]
      .filter((id) => (used.get(id) ?? 0) < limitOf(id));
    // Espalhar antes de acumular: um segundo beco na mesma sala só quando não há sala virgem.
    // Grau 4 é o limite do que uma grade aceita, e chegar nele em toda sala é o que trava a busca.
    const virgin = all.filter((id) => (used.get(id) ?? 0) === 0);
    const hosts = virgin.length > 0 ? virgin : all;
    if (hosts.length === 0) break;
    const host = rng.pick(hosts);
    used.set(host, (used.get(host) ?? 0) + 1);
    const id = add(rng.chance(0.65) ? 'reward' : 'rest', nodes[host].arc);
    branches.push(id);
    edges.push({ a: host, b: id });
  }

  // A CHAVE. Ela mora no arco (ou num beco dele) OPOSTO ao que o jogador tende a pegar primeiro —
  // e como não há "primeiro" num ciclo, o que se garante é só que ela nunca fica atrás da própria
  // porta. Como os dois arcos chegam à antessala sem tranca nenhuma, qualquer nó serve; a escolha
  // é por sabor.
  if (cycle.gate === 'key') {
    const inBranch = cycle.keyInBranch && branches.length > 0;
    const pool = inBranch ? branches : [...arcs.a, ...arcs.b];
    const chosen = rng.pick(pool);
    nodes[chosen].role = 'key';
  }

  if (cycle.arena) {
    const pool = [...arcs.a, ...arcs.b].filter((id) => nodes[id].role === 'plain');
    if (pool.length > 0) nodes[rng.pick(pool)].role = 'arena';
  }

  return { cycle: cycle.id, nodes, edges, entrance, antechamber, goal, gate: cycle.gate };
};

/** Vizinhos de um nó no grafo da missão. */
export const missionNeighbours = (mission: Mission, id: number): number[] => {
  const out: number[] = [];
  for (const edge of mission.edges) {
    if (edge.a === id) out.push(edge.b);
    else if (edge.b === id) out.push(edge.a);
  }
  return out;
};

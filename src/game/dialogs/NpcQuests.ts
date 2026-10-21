import type { HeldItemKind } from '@/game/entities/ItemPickup';

/**
 * AS MISSÕES DOS NPCs — a estrutura, não uma tela.
 *
 * Um NPC PEDE alguma coisa; cumprido o pedido, ele passa a falar OUTRO roteiro. É só isso, e é
 * de propósito: **este sistema não tem interface**. Não há diário de missões, não há marcador de
 * objetivo, não há barra de progresso — o jogo continua ensinando pelo mundo, e o único sinal de
 * que a missão fechou é o NPC dizendo outra coisa (mais o "!" que ele já ganha por ter fala nova,
 * que é a máquina de sempre e não um enfeite de missão). Uma tarefa que precise de legenda para
 * ser entendida é uma tarefa mal escrita, exatamente como uma trava que precise de legenda.
 *
 * A IDENTIDADE DE UMA MISSÃO É O ROTEIRO, não a espécie (`world.dialogs[id]`, ver
 * WorldNpcSpawn.dialog): o mesmo gato mora em três cartas ensinando três coisas, e uma missão por
 * ESPÉCIE faria os três gatos pedirem — e receberem — a mesma coisa.
 *
 * O contador de cada tarefa mora no SAVE (`adventureState().questProgress`), então:
 *   • missão é da AVENTURA. Level e explorador nunca hidratam o save, e deixá-los escrever nele
 *     sujaria a aventura de quem só foi jogar um puzzle.
 *   • progresso NUNCA volta: o contador só sobe, e "cumprida" é lido dele (não há um segundo
 *     booleano de "fechou" para discordar da soma).
 *
 * As falas alternativas moram no `public/world.json`, como toda fala de NPC — `<id>Done`,
 * escritas por `node scripts/add-npc-quests.mjs`. Sem a entrada lá, o NPC simplesmente continua
 * no roteiro de sempre: uma missão sem fala nova não quebra nada, só não aparece.
 */

/**
 * O QUE UM NPC PODE PEDIR. Cada tipo tem UM lugar no jogo que o alimenta (ver
 * `GameScene.questEvent`) — um tipo novo é uma linha aqui e uma linha lá, nunca um sistema novo.
 *
 *   deliver — ENTREGAR a este NPC. O único que consome da mochila, e ele cobra na hora de FALAR:
 *             conversar com quem pediu É o gesto de entregar. É TUDO OU NADA: o NPC leva os seis
 *             minérios de uma vez, ou não encosta nos quatro que o herói trouxe. Entrega parcial
 *             seria confisco silencioso — num sistema sem diário, o jogador não teria onde ver
 *             que quatro minérios viraram progresso, e a mochila esvaziaria sozinha ao passar
 *             por perto de quem pediu. Levar o que ele pede é o gesto; levar metade não é gesto
 *             nenhum.
 *   gather  — APANHAR N unidades ao longo da partida. Não consome: contar é o pedido.
 *   craft   — FABRICAR N numa estação (bancada ou forno).
 *   grow    — fazer BROTAR N canteiros: semente na terra, água no monte, e esperar.
 *   light   — ACENDER N fogueiras do overworld.
 *   fell    — DERRUBAR N pinheiros VIVOS (o tile, e portanto só com o machado de aço; a árvore
 *             morta é prop e cai no `gather` do graveto que ela larga).
 *   explore — PISAR em N telas diferentes (o mesmo fog of war do mapa).
 */
export type QuestTask =
  | { kind: 'deliver'; item: HeldItemKind; count: number }
  | { kind: 'gather'; item: HeldItemKind; count: number }
  | { kind: 'craft'; item: HeldItemKind; count: number }
  | { kind: 'grow'; count: number }
  | { kind: 'light'; count: number }
  | { kind: 'fell'; count: number }
  | { kind: 'explore'; count: number };

export type NpcQuest = {
  /** A chave do roteiro que PEDE (world.dialogs) — e a identidade da missão. */
  dialog: string;
  /** O roteiro alternativo, falado a partir do instante em que a última tarefa cai. */
  doneDialog: string;
  /** O conjunto de tarefas. Todas, sem ordem: a missão fecha quando a última fecha. */
  tasks: QuestTask[];
  /**
   * O que o NPC PÕE NA MÃO do herói na primeira conversa — a ferramenta do próprio pedido. Um
   * pedido que exige um machado que o jogador não sabe onde achar não é um pedido, é um enigma.
   */
  gift?: Array<{ item: HeldItemKind; count: number }>;
};

/**
 * A CHAVE DE UMA TAREFA dentro da missão dela. Ela vem do CONTEÚDO da tarefa e não do índice,
 * senão reordenar a lista mexeria no progresso de quem já está jogando. Duas tarefas com a mesma
 * chave na mesma missão são um erro de autoria (são uma tarefa só, com o número maior).
 */
export const taskKey = (task: QuestTask): string => {
  switch (task.kind) {
    case 'deliver':
    case 'gather':
    case 'craft':
      return `${task.kind}:${task.item}`;
    default:
      return task.kind;
  }
};

/**
 * O BARALHO DE PEDIDOS: UMA missão por vizinho, e cada uma é uma tarefa PEQUENA DE PROPÓSITO.
 *
 * O cavaleiro já lutou o que tinha para lutar — a espada ficou fincada na entrada do vale, e o
 * mago deixou a pergunta que sobra: e agora? A resposta do jogo é a gente do lugar, cada uma com
 * um afazer de todo dia. Nada aqui é urgente, nada se perde, e nenhum pedido tem prazo.
 *
 *   a coletora (radiationSuit) — um cesto de cogumelos do bosque
 *   a pintora  (painter)       — um canteiro que brote, para ela ter verde para pintar
 *   o lenhador (businessMan)   — lenha para a noite, cortada das árvores secas
 *   a astrônoma (astronaut)    — uma barra de ferro para o marco onde o céu é mais limpo
 *
 * A BARRA DE FERRO É O PEDIDO INTEIRO DA VEGA, e o único que atravessa a cadeia toda: o mundo não tem ferro no
 * chão, então ela só existe fabricada — minério da picareta, forno (pedra+pedra) na bancada,
 * carvão (lenha+lenha) e esponja (minério+carvão) no forno, e as marteladas que fazem dela barra.
 * A picareta que a Vega dá é a chave: a pedra do forno e o minério saem dela.
 *
 * Quando o último pedido fecha, o portão do jardim no centro do vale ABRE (ver
 * GameScene.openGardenGate) — e lá dentro está a fogueira do fim.
 *
 * DUAS REGRAS DE AUTORIA, e as duas são consequência de o sistema não ter tela:
 *
 * 1. **O pedido tem de estar na FALA do NPC** (locale `npc.<id>`). Sem diário, a fala é o único
 *    lugar onde o objetivo existe.
 * 2. **O pedido tem de ser cumprível com o mundo de HOJE e com o presente que o próprio NPC dá**
 *    (`gift`): o machado do lenhador, a picareta da astrônoma, as sementes e o balde da pintora.
 */
export const NPC_QUESTS: Readonly<Record<string, NpcQuest>> = {
  radiationSuit: {
    dialog: 'radiationSuit',
    doneDialog: 'radiationSuitDone',
    tasks: [{ kind: 'deliver', item: 'mushroom', count: 5 }],
  },
  painter: {
    dialog: 'painter',
    doneDialog: 'painterDone',
    tasks: [{ kind: 'grow', count: 2 }],
    gift: [{ item: 'seeds', count: 2 }, { item: 'bucket', count: 1 }],
  },
  businessMan: {
    dialog: 'businessMan',
    doneDialog: 'businessManDone',
    tasks: [{ kind: 'deliver', item: 'wood', count: 4 }],
    gift: [{ item: 'axe', count: 1 }],
  },
  astronaut: {
    dialog: 'astronaut',
    doneDialog: 'astronautDone',
    tasks: [{ kind: 'deliver', item: 'iron', count: 1 }],
    gift: [{ item: 'pickaxe', count: 1 }],
  },
};

/** A missão daquele roteiro, se ele pede alguma coisa. */
export const questFor = (dialogId: string): NpcQuest | undefined => NPC_QUESTS[dialogId];

/** Quantas missões o jogo tem hoje. */
export const QUEST_COUNT = Object.keys(NPC_QUESTS).length;

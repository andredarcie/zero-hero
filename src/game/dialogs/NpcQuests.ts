import { PYRE_LOGS_REQUIRED } from '@/game/constants';
import type { HeldItemKind } from '@/game/entities/ItemPickup';
import type { EnemyKind } from '@/game/world/ScreenContent';

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
 *   slay    — MATAR N de uma espécie. Vale qualquer morte, como a moeda (ver setDeathToll).
 *   light   — ACENDER N fogueiras do overworld.
 *   fell    — DERRUBAR N pinheiros VIVOS (o tile, e portanto só com o machado de aço; a árvore
 *             morta é prop e cai no `gather` do graveto que ela larga).
 *   explore — PISAR em N telas diferentes (o mesmo fog of war do mapa).
 */
export type QuestTask =
  | { kind: 'deliver'; item: HeldItemKind; count: number }
  | { kind: 'gather'; item: HeldItemKind; count: number }
  | { kind: 'craft'; item: HeldItemKind; count: number }
  | { kind: 'slay'; enemy: EnemyKind; count: number }
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
    case 'slay':
      return `slay:${task.enemy}`;
    default:
      return task.kind;
  }
};

/**
 * O BARALHO DE PEDIDOS: UMA missão por NPC, e cada uma é um CAPÍTULO DA MESMA HISTÓRIA.
 *
 * A lore está toda na boca do mago (locale `wizard.*`) e é curta: o escuro tomou o mundo, a
 * fogueira dele é a ÚLTIMA CHAMA, e espalhadas pela terra estão as lareiras frias DOS QUE VIERAM
 * ANTES — mortos que ainda andam pelas estradas. Zero é o último herdeiro de uma cruzada
 * esquecida, e ainda não é cavaleiro. Enquanto a chama VIAJA, o mundo pode renascer.
 *
 * Então nenhum pedido aqui é um recado avulso: cada NPC cobra a parte da história que ELE
 * enxerga do lugar onde está.
 *
 *   o gato        — a LINHA de luz que os mortos não cruzam (acender lareiras)
 *   o poeta       — onde a árvore cai, a LUZ entra (derrubar pinheiros vivos)
 *   o artista     — verde é TEIMOSIA num mundo que o escuro comeu (semear e ceifar)
 *   o lenhador    — o único mercado que sobrou é o COMBUSTÍVEL do renascimento (gravetos)
 *   o vendedor    — ele vende a pedra que segura o fogo e a água que o mata, e não toma partido
 *   o operário    — o METAL DOS ANTIGOS, afundado onde o chão brilha (uma barra)
 *   o astronauta  — o forasteiro cuja nave é uma casca: o ferro preso na rocha da cratera
 *   a Morte       — ela foi mandada FECHAR este lugar e fica contando as fogueiras que você acende
 *   o mago        — a cruzada esquecida: os mortos da estrada, e os campos que a moeda decide
 *
 * DUAS REGRAS DE AUTORIA, e as duas são consequência de o sistema não ter tela:
 *
 * 1. **O pedido tem de estar na FALA do NPC.** Sem diário, a fala é o único lugar onde o
 *    objetivo existe. Um pedido que ele não diz é uma tarefa de planilha sem onde ser lida.
 * 2. **O pedido tem de ser cumprível com o mundo de HOJE e com a ferramenta que o PRÓPRIO NPC
 *    dá de presente** — 8 veios de minério que nunca secam, 40 árvores mortas, 846 pinheiros
 *    vivos, 30 rochas, 39 moitas, 21 fogueiras (uma acesa), 25 telas, 12 barras no chão e covas
 *    de caveira. Foi essa pergunta que matou o pedido mais bonito do lote: a Morte mandando o
 *    herói descer até "o que os antigos enterraram sob os portais" (fala literal do mago). O
 *    `world.json` de hoje tem ZERO `levelPortal` — a missão seria impossível, contada com toda
 *    a confiança do mundo.
 *
 * QUEM NÃO ESTÁ AQUI, e por quê: o `mimic` não tem roteiro no `world.json`; os dez roteiros de
 * carta do gato (`catAxe`…`catFarm`) são falas ÓRFÃS — `scripts/unique-npcs.mjs` tira o corpo
 * repetido e deixa a fala, então hoje nenhum personagem as diz. O mago tem missão mas ainda não
 * tem corpo plantado no mapa: a dele fica de pé, esperando alguém o colocar.
 */
export const NPC_QUESTS: Readonly<Record<string, NpcQuest>> = {
  // "Light draws a line the dead will not cross. I sleep better behind lines." Ele não pede
  // lenha nem favor: pede a LINHA. Três lareiras é a linha ficando maior.
  blackCat: {
    dialog: 'blackCat',
    doneDialog: 'blackCatDone',
    tasks: [{ kind: 'light', count: 3 }],
  },
  // "Open a clearing in my grove... Listen how the song changes where LIGHT falls." Pinheiro
  // VIVO, que é o que o machado de aço — o presente dele — derruba.
  poet: {
    dialog: 'poet',
    doneDialog: 'poetDone',
    tasks: [{ kind: 'fell', count: 4 }],
  },
  // "Green is a colour you GROW. Paint me a meadow." O pacote que ele dá tem cinco sementes: a
  // sexta só existe se o campo tiver crescido e sido ceifado. O pedido é o ciclo inteiro.
  painter: {
    dialog: 'painter',
    doneDialog: 'painterDone',
    tasks: [{ kind: 'gather', item: 'seeds', count: 6 }],
  },
  // "My dry ranks stand in rows. Clear them, and the sticks are pure profit." Ele acha que
  // vende madeira; o que ele vende é o que faz a chama viajar.
  businessMan: {
    dialog: 'businessMan',
    doneDialog: 'businessManDone',
    tasks: [{ kind: 'deliver', item: 'wood', count: 6 }],
  },
  // "Nada em estoque" é o problema dele desde sempre. Pedra segura o fogo, graveto o carrega:
  // ele quer os dois na prateleira e não toma partido.
  salesman: {
    dialog: 'salesman',
    doneDialog: 'salesmanDone',
    tasks: [
      { kind: 'deliver', item: 'stone', count: 4 },
      { kind: 'deliver', item: 'wood', count: 4 },
    ],
  },
  // "Something metal sank by the little island... Cross back carrying whatever you find." Uma
  // barra só — porque é UMA barra, a de alguém que trabalhou aqui antes do escuro.
  radiationSuit: {
    dialog: 'radiationSuit',
    doneDialog: 'radiationSuitDone',
    tasks: [{ kind: 'deliver', item: 'iron', count: 1 }],
  },
  // "Bring me a bar and the ship gets one step closer to flying." A nave dele é uma casca, e o
  // minério é o começo da cadeia inteira que ele acabou de explicar. Seis é o primeiro
  // carregamento — e o pedido do usuário que originou este sistema.
  astronaut: {
    dialog: 'astronaut',
    doneDialog: 'astronautDone',
    tasks: [{ kind: 'deliver', item: 'ore', count: 6 }],
  },
  // "I watched your furnace smoke cross three of them" + "Go back and light something. I will
  // wait." As duas falas dela, as duas tarefas — a personagem mandada FECHAR o mundo pedindo
  // fogo e fumaça é a melhor piada que a lore tem.
  death: {
    dialog: 'death',
    doneDialog: 'deathDone',
    tasks: [
      { kind: 'light', count: 5 },
      { kind: 'craft', item: 'charcoal', count: 3 },
    ],
  },
  // "The dead on unfinished roads still carry coin" + "Spend what you earn, and decide what
  // exists next": os mortos da cruzada anterior, e os campos que a moeda traz à existência.
  //
  // Ele é o único NPC cuja fala alternativa DISPUTA espaço com uma história (intro/protect/
  // prophecy): ver `GameScene.openWizardDialog`, onde ela entra só no lugar do beat opcional.
  wizard: {
    dialog: 'wizard',
    doneDialog: 'wizardDone',
    tasks: [
      { kind: 'slay', enemy: 'undead', count: 8 },
      { kind: 'explore', count: 6 },
    ],
  },
};

/** A missão daquele roteiro, se ele pede alguma coisa. */
export const questFor = (dialogId: string): NpcQuest | undefined => NPC_QUESTS[dialogId];

/** Quantas missões o jogo tem hoje. */
export const QUEST_COUNT = Object.keys(NPC_QUESTS).length;

/**
 * QUANTAS TORAS UMA MISSÃO MANDA PARA A PIRA — e por que este número não é escolhido.
 *
 * A pira central é o FIM DO JOGO: fechá-la e acendê-la é zerar. Toda missão empurra a torre, e
 * a regra que o jogo promete é **metade do baralho basta** — cumpra as que você quiser, cinco
 * das nove, e a torre fecha sem que você carregue um único graveto. É daí que vem a liberdade:
 * nenhuma missão é obrigatória, nenhuma ordem é imposta, e quem preferir não falar com ninguém
 * ainda pode fechar a torre na mão (quinze gravetos), ou misturar as duas estradas.
 *
 * Por isso ele é DERIVADO e não cravado: uma missão nova entra no baralho e a promessa continua
 * de pé sozinha. Um número cravado mudaria em silêncio a dificuldade do fim do jogo no dia em
 * que alguém acrescentasse o décimo NPC.
 *
 * Hoje: 15 toras ÷ ⌈9/2⌉ = 3 por missão, e 5 missões fecham a torre exatamente.
 */
export const QUEST_PYRE_LOGS = Math.ceil(PYRE_LOGS_REQUIRED / Math.ceil(QUEST_COUNT / 2));

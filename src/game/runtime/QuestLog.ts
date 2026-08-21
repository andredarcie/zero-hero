import type { HeldItemKind } from '@/game/entities/ItemPickup';
import type { EnemyKind } from '@/game/world/ScreenContent';
import {
  NPC_QUESTS, questFor, taskKey, type NpcQuest, type QuestTask,
} from '@/game/dialogs/NpcQuests';
import { adventureState } from '@/game/runtime/adventureState';

/**
 * O CADERNO DE MISSÕES — os contadores, e nada mais.
 *
 * Ele é o par de `NpcQuests.ts` (que é dado puro): aqui mora o estado, que é um número por
 * tarefa dentro do save da aventura. O caderno **não fala com o mundo**: ele não conhece a
 * mochila, o inimigo nem a fogueira. Quem viu a coisa acontecer chama `recordQuestEvent`, e é o
 * único caminho de entrada — um segundo lugar somando contador seria a segunda verdade que
 * desmente a primeira.
 *
 * A chave de um contador é `<roteiro>/<tarefa>`, plana e derivada do conteúdo: reordenar as
 * tarefas de uma missão não mexe no progresso de quem já está jogando.
 *
 * "Cumprida" é DERIVADA da soma, nunca um segundo booleano salvo — e os contadores só sobem,
 * então a resposta é estável.
 */

/**
 * O que o mundo tem a contar. Um tipo aqui é um `case` no `gain()` e uma chamada em
 * `GameScene.questEvent` — nada mais.
 *
 * `deliver` traz o ROTEIRO junto porque entregar é para ALGUÉM: dois NPCs pedindo minério são
 * dois pedidos, e um saco de minério entregue a um não pode fechar o do outro. Todo o resto é
 * do mundo e vale para quem quer que esteja pedindo — matar uma caveira conta para os dois
 * NPCs que pediram caveira, e isso é a leitura certa: o herói matou a caveira.
 */
export type QuestEvent =
  | { type: 'deliver'; dialog: string; item: HeldItemKind; units: number }
  | { type: 'gather'; item: HeldItemKind; units: number }
  | { type: 'craft'; item: HeldItemKind; units: number }
  | { type: 'slay'; enemy: EnemyKind }
  | { type: 'light' }
  | { type: 'fell' }
  | { type: 'explore' };

const progressKey = (dialogId: string, task: QuestTask): string => `${dialogId}/${taskKey(task)}`;

/** Quanto desta tarefa já foi feito (teto no alvo: o contador nunca passa do que foi pedido). */
export const taskProgress = (quest: NpcQuest, task: QuestTask): number => Math.min(
  task.count,
  adventureState().questProgress.get(progressKey(quest.dialog, task)) ?? 0,
);

export const isTaskDone = (quest: NpcQuest, task: QuestTask): boolean =>
  taskProgress(quest, task) >= task.count;

/** A missão fecha quando a ÚLTIMA tarefa fecha — não há ordem entre elas. */
export const isQuestDone = (quest: NpcQuest): boolean => quest.tasks.every((t) => isTaskDone(quest, t));

/**
 * O ROTEIRO QUE ESTE NPC FALA AGORA: o alternativo se ele já recebeu o que pediu, o de sempre
 * caso contrário. É a única saída deste módulo para o diálogo — quem escolhe fala não olha
 * contador nenhum.
 */
export const questDialogFor = (dialogId: string): string => {
  const quest = questFor(dialogId);
  return quest && isQuestDone(quest) ? quest.doneDialog : dialogId;
};

/**
 * O QUE ESTE NPC AINDA ESPERA RECEBER, item a item — e `missing` é a CARGA INTEIRA da tarefa,
 * porque entrega é tudo ou nada (ver NpcQuests). A cena usa isto para tirar da mochila na hora
 * de falar; a lista vem vazia para quem não pede entrega, ou já recebeu tudo.
 *
 * Como o contador de uma entrega só conhece dois valores — zero e a carga inteira —, `missing`
 * é sempre `task.count`. Ele é devolvido mesmo assim: no dia em que a entrega parcial voltar,
 * quem chama já está lendo o número certo.
 */
export const questDeliveriesDue = (dialogId: string): Array<{ item: HeldItemKind; missing: number }> => {
  const quest = questFor(dialogId);
  if (!quest || isQuestDone(quest)) return [];
  const due: Array<{ item: HeldItemKind; missing: number }> = [];
  for (const task of quest.tasks) {
    if (task.kind !== 'deliver' || isTaskDone(quest, task)) continue;
    due.push({ item: task.item, missing: task.count - taskProgress(quest, task) });
  }
  return due;
};

/** Quanto este evento vale para esta tarefa. Zero = não é com ela. */
const gain = (task: QuestTask, event: QuestEvent, dialogId: string): number => {
  switch (event.type) {
    case 'deliver':
      return task.kind === 'deliver' && event.dialog === dialogId && task.item === event.item
        ? event.units : 0;
    case 'gather':
      return task.kind === 'gather' && task.item === event.item ? event.units : 0;
    case 'craft':
      return task.kind === 'craft' && task.item === event.item ? event.units : 0;
    case 'slay':
      return task.kind === 'slay' && task.enemy === event.enemy ? 1 : 0;
    case 'light':
      return task.kind === 'light' ? 1 : 0;
    case 'fell':
      return task.kind === 'fell' ? 1 : 0;
    case 'explore':
      return task.kind === 'explore' ? 1 : 0;
    default:
      return 0;
  }
};

/** O que o mundo mudou num evento: se algum contador andou, e quais missões FECHARAM com ele. */
export type QuestEventResult = {
  moved: boolean;
  /** Os roteiros cujas missões passaram de aberta para cumprida NESTE evento. */
  closed: string[];
};

/**
 * O FUNIL: uma coisa aconteceu no mundo, e as tarefas que a esperavam andam.
 *
 * Devolve o que MUDOU: `moved` diz a quem chamou que vale a pena gravar o save, e `closed` é a
 * lista de missões que fecharam agora — a borda de subida, e a única vez em que cada uma pode
 * pagar as toras dela para a pira (`GameScene.questEvent`). Pagar por estado ("está cumprida")
 * em vez de por borda ("acabou de cumprir") mandaria toras a cada evento pelo resto da partida.
 *
 * Missão já cumprida não conta mais nada: o contador dela está no teto e ficar somando seria
 * trabalho para ninguém — e é o que garante que a borda aconteça uma vez só.
 */
export const recordQuestEvent = (event: QuestEvent): QuestEventResult => {
  const progress = adventureState().questProgress;
  const result: QuestEventResult = { moved: false, closed: [] };
  for (const quest of Object.values(NPC_QUESTS)) {
    if (isQuestDone(quest)) continue; // já cumprida: a borda dela já aconteceu
    let touched = false;
    for (const task of quest.tasks) {
      const units = gain(task, event, quest.dialog);
      if (units <= 0) continue;
      const key = progressKey(quest.dialog, task);
      const now = progress.get(key) ?? 0;
      if (now >= task.count) continue;
      progress.set(key, Math.min(task.count, now + units));
      touched = true;
    }
    if (!touched) continue;
    result.moved = true;
    if (isQuestDone(quest)) result.closed.push(quest.dialog);
  }
  return result;
};

/**
 * A FOTO DO CADERNO — para o `gameDebug` e para o playtest, que são os únicos olhos que este
 * sistema tem. Um sistema sem interface que também não pudesse ser LIDO seria um sistema que
 * ninguém consegue provar que funciona.
 */
export const questSnapshot = (): Array<{
  dialog: string;
  done: boolean;
  speaks: string;
  tasks: Array<{ task: string; have: number; need: number; done: boolean }>;
}> => Object.values(NPC_QUESTS).map((quest) => ({
  dialog: quest.dialog,
  done: isQuestDone(quest),
  speaks: questDialogFor(quest.dialog),
  tasks: quest.tasks.map((task) => ({
    task: taskKey(task),
    have: taskProgress(quest, task),
    need: task.count,
    done: isTaskDone(quest, task),
  })),
}));

import { beforeEach, describe, expect, it } from 'vitest';

import { NPC_QUESTS } from '@/game/dialogs/NpcQuests';
import { resetAdventure } from './adventureState';
import { allQuestsDone, forceQuestDone, isQuestComplete, isQuestDone, questDialogFor, recordQuestEvent } from './QuestLog';

// O CADERNO DE MISSÕES: o funil do jogo (recordQuestEvent) fecha um pedido pela borda; o atalho do painel de testes
// (forceQuestDone) fecha pelo mesmo contador, devolve a borda uma vez só, e o resto do jogo lê o mesmo "cumprido".

describe('o caderno de missões', () => {
  beforeEach(() => { resetAdventure(); });

  it('o funil fecha o pedido da Sisi quando o quadro termina, e só uma vez', () => {
    expect(isQuestDone(NPC_QUESTS.painter)).toBe(false);
    expect(recordQuestEvent({ type: 'paint' }).closed).toEqual(['painter']);
    expect(recordQuestEvent({ type: 'paint' }).closed).toEqual([]);
    expect(questDialogFor('painter')).toBe('painterDone');
  });

  it('o atalho de teste fecha qualquer pedido de uma vez, com as opcionais, e devolve a borda uma vez só', () => {
    expect(forceQuestDone('radiationSuit')).toBe(true);
    expect(isQuestDone(NPC_QUESTS.radiationSuit)).toBe(true);
    expect(isQuestComplete(NPC_QUESTS.radiationSuit)).toBe(true);
    expect(forceQuestDone('radiationSuit')).toBe(false);
    expect(forceQuestDone('ninguem')).toBe(false);
  });

  it('fechados todos, o jardim abre (a mesma pergunta que dá a chave)', () => {
    for (const q of Object.values(NPC_QUESTS)) forceQuestDone(q.dialog);
    expect(allQuestsDone()).toBe(true);
  });
});

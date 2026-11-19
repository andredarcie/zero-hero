import { describe, expect, it } from 'vitest';

import { TALK_LOG_MAX, addTalk, cleanTalks, talkEntry, talkPeople, type TalkEntry } from './talkLog';

// O CADERNO DAS CONVERSAS: cada conversa com alguém entra como foi lida (o texto pronto, na ordem), a narração solta
// não entra, a conversa sem nada de novo não vira página, e o save conferido não deixa entrar lixo.

const shui = { npcName: 'Shui', npcColorHex: '#7fb069', npcAssetKey: 'npc-radiationSuit' };
const line = (text: string, speaker: 'npc' | 'narrator' = 'npc') => ({ speaker, text });

describe('o caderno das conversas', () => {
  it('a conversa guarda quem falou, a cor, o retrato, o dia e as falas lidas', () => {
    const e = talkEntry({ ...shui, npcFrame: 3 }, [line('Oi,\nvizinho.'), line('Ela sorri.', 'narrator')], 2);
    expect(e).toEqual({
      who: 'Shui', color: '#7fb069', asset: 'npc-radiationSuit', frame: 3, day: 2,
      lines: [{ speaker: 'npc', text: 'Oi,\nvizinho.' }, { speaker: 'narrator', text: 'Ela sorri.' }],
    });
    expect('frame' in talkEntry(shui, [line('a')], 0)).toBe(false);
  });

  it('narração solta (sem nome) e conversa fechada antes da primeira fala não entram', () => {
    const log: TalkEntry[] = [];
    expect(addTalk(log, talkEntry({ ...shui, npcName: '' }, [line('A placa diz...')], 0))).toBe(false);
    expect(addTalk(log, talkEntry(shui, [], 0))).toBe(false);
    expect(log).toHaveLength(0);
  });

  it('o que essa pessoa já disse não vira página nova; fala nova, sim (e a de outra pessoa é dela)', () => {
    const log: TalkEntry[] = [];
    expect(addTalk(log, talkEntry(shui, [line('pedido'), line('dica')], 0))).toBe(true);
    // a mesma conversa de novo, e só a dica repetida
    expect(addTalk(log, talkEntry(shui, [line('pedido'), line('dica')], 1))).toBe(false);
    expect(addTalk(log, talkEntry(shui, [line('dica')], 1))).toBe(false);
    // o obrigado é novo
    expect(addTalk(log, talkEntry(shui, [line('dica'), line('obrigada')], 1))).toBe(true);
    // a mesma frase dita por outra pessoa é outra conversa
    expect(addTalk(log, talkEntry({ ...shui, npcName: 'Sisi' }, [line('dica')], 1))).toBe(true);
    expect(log.map((e) => `${e.who}:${e.day}`)).toEqual(['Shui:0', 'Shui:1', 'Sisi:1']);
    expect(talkPeople(log)).toEqual([{ who: 'Shui', color: '#7fb069' }, { who: 'Sisi', color: '#7fb069' }]);
  });

  it('guarda as últimas TALK_LOG_MAX: a mais antiga sai primeiro', () => {
    const log: TalkEntry[] = [];
    for (let i = 0; i < TALK_LOG_MAX + 5; i += 1) addTalk(log, talkEntry(shui, [line(`fala ${i}`)], 0));
    expect(log).toHaveLength(TALK_LOG_MAX);
    expect(log[0].lines[0].text).toBe('fala 5');
  });

  it('o save conferido: só conversa inteira e válida, falas válidas, dia inteiro', () => {
    const clean = cleanTalks([
      { who: 'Shui', color: '#fff', asset: 'a', day: 3, frame: 1, lines: [{ speaker: 'npc', text: 'oi' }, { speaker: 'x', text: 'y' }, 7] },
      { who: '', color: '#fff', asset: 'a', day: 0, lines: [{ speaker: 'npc', text: 'oi' }] },
      { who: 'Marco', color: '#fff', asset: 'a', day: -2, lines: [{ speaker: 'narrator', text: 'chove' }] },
      { who: 'Thea', color: '#fff', asset: 'a', day: 1, lines: [] },
      null,
      'lixo',
    ]);
    expect(clean).toEqual([
      { who: 'Shui', color: '#fff', asset: 'a', day: 3, frame: 1, lines: [{ speaker: 'npc', text: 'oi' }] },
      { who: 'Marco', color: '#fff', asset: 'a', day: 0, lines: [{ speaker: 'narrator', text: 'chove' }] },
    ]);
    expect(cleanTalks(undefined)).toEqual([]);
    expect(cleanTalks({})).toEqual([]);
  });
});

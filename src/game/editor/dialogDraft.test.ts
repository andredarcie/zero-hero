import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { checkBox, type VerseRule } from '@/game/i18n/verseCheck';
import {
  addBox, bodyOf, formatDialogJson, isNarrated, matchesFala, moveBox, readCharacters, removeBox, withNarration, writeFalas,
  type DialogFiles,
} from './dialogDraft';

// O RASCUNHO DAS FALAS: os dois arquivos viram personagens com falas (português e inglês lado a lado) e voltam para
// o mesmo lugar sem mexer em mais nada; a forma de cada fala (lista, caixa única, nome) é respeitada; e a conferência
// do verso concorda com o versos.test em todas as falas do jogo.

const DIR = path.resolve(__dirname, '../i18n/dialogos');
const raw = (lang: string): string => fs.readFileSync(path.join(DIR, `${lang}.json`), 'utf8');
const files = (): DialogFiles => ({ 'pt-br': JSON.parse(raw('pt-br')), en: JSON.parse(raw('en')) });

describe('o rascunho das falas', () => {
  it('salvar sem mudar nada escreve os dois arquivos byte a byte iguais', () => {
    const f = files();
    const back = writeFalas(f, readCharacters(f));
    expect(formatDialogJson(back['pt-br'])).toBe(raw('pt-br'));
    expect(formatDialogJson(back.en)).toBe(raw('en'));
  });

  it('cada personagem com as falas dele; a forma de cada fala vem do arquivo', () => {
    const chars = readCharacters(files());
    const mago = chars.find((c) => c.id === 'mago')!;
    expect(mago).toMatchObject({ name: 'Sati', school: 'Budismo' });
    const intro = mago.falas.find((f) => f.path.join('.') === 'wizard.intro')!;
    expect(intro.kind).toBe('boxes');
    expect(intro.en).toHaveLength(intro.pt.length);
    expect(mago.falas.find((f) => f.path.join('.') === 'npc.wizard.name')).toMatchObject({ kind: 'name', pt: ['Sati'] });
    const marco = chars.find((c) => c.id === 'marco')!;
    expect(marco.falas.find((f) => f.path.join('.') === 'npc.businessManNight.split.clean')?.kind).toBe('box');
    expect(chars.some((c) => c.id.startsWith('_'))).toBe(false);
  });

  it('a mudança volta para o mesmo caminho, nas duas línguas, e a caixa única continua texto', () => {
    const f = files();
    const chars = readCharacters(f);
    const intro = chars.find((c) => c.id === 'mago')!.falas.find((x) => x.path.join('.') === 'wizard.intro')!;
    intro.pt[1] = 'A espada ficou pra trás;\nagora, viva em paz.';
    intro.en[1] = 'The sword is done, so set it down;\nnow live in peace around.';
    const single = chars.find((c) => c.id === 'marco')!.falas.find((x) => x.path.join('.') === 'npc.businessManNight.split.clean')!;
    single.pt[0] = 'Rachou certinho.\nBoa mão.';
    const out = writeFalas(f, chars);
    const ptFalas = (out['pt-br'].mago as { falas: { wizard: { intro: string[] } } }).falas;
    expect(ptFalas.wizard.intro[1]).toBe('A espada ficou pra trás;\nagora, viva em paz.');
    expect((out.en.mago as { falas: { wizard: { intro: string[] } } }).falas.wizard.intro[1]).toContain('live in peace');
    const night = (out['pt-br'].marco as { falas: Record<string, { split: { clean: unknown } }> }).falas['npc.businessManNight'];
    expect(night.split.clean).toBe('Rachou certinho.\nBoa mão.');
    // o resto do arquivo não muda: a filosofia continua lá
    expect((out['pt-br'].mago as { filosofia: { escola: string } }).filosofia.escola).toBe('Budismo');
  });

  it('caixas: adicionar, tirar e mover andam juntas nas duas línguas; a caixa única e o nome não mudam de tamanho', () => {
    const f = { section: 's', path: ['a'], kind: 'boxes' as const, pt: ['um', 'dois'], en: ['one', 'two'] };
    addBox(f, 0);
    expect([f.pt, f.en]).toEqual([['um', '', 'dois'], ['one', '', 'two']]);
    moveBox(f, 2, -1);
    expect(f.pt).toEqual(['um', 'dois', '']);
    removeBox(f, 2);
    removeBox(f, 1);
    removeBox(f, 0);
    expect([f.pt, f.en]).toEqual([['um'], ['one']]);
    const single = { section: 's', path: ['b'], kind: 'box' as const, pt: ['x'], en: ['y'] };
    addBox(single, 0);
    removeBox(single, 0);
    expect(single.pt).toEqual(['x']);
  });

  it('a narração é a marca da língua no começo da caixa', () => {
    expect(isNarrated('[narrador] Chove.')).toBe(true);
    expect(bodyOf('[narrator] It rains.')).toBe('It rains.');
    expect(withNarration('Chove.', 'pt-br', true)).toBe('[narrador] Chove.');
    expect(withNarration('[narrator] It rains.', 'en', false)).toBe('It rains.');
  });

  it('a busca acha pelo texto (sem acento) e pelo caminho', () => {
    const f = { section: 's', path: ['npc', 'painterStep'], kind: 'boxes' as const, pt: ['Pegue o BALDE e regue.'], en: ['Take the bucket.'] };
    expect(matchesFala(f, 'balde')).toBe(true);
    expect(matchesFala(f, 'BUCKET')).toBe(true);
    expect(matchesFala(f, 'painterstep')).toBe(true);
    expect(matchesFala(f, 'machado')).toBe(false);
    expect(matchesFala(f, '  ')).toBe(false);
  });

  it('a conferência do verso aceita toda fala do jogo (a mesma regra do versos.test)', () => {
    const f = files();
    const rule = (f['pt-br']._verso as VerseRule);
    const problems = readCharacters(f)
      .filter((c) => c.id !== 'fora_do_jogo')
      .flatMap((c) => c.falas.filter((x) => x.kind !== 'name').flatMap((x) => x.pt.map((box) => [x, box] as const)))
      .flatMap(([x, box]) => checkBox(box, rule).problems.map((p) => `${x.path.join('.')}: ${p}`));
    expect(problems).toEqual([]);
    expect(checkBox('Uma linha só', rule).problems.join()).toContain('tem 1 verso:');
    const off = checkBox('Eu vim aqui pra conversar,\nmas o gato quer dormir.', rule);
    expect(off.problems.join()).toContain('não rimam');
    expect(off.rhymes).toEqual([{ rows: [0, 1], words: ['conversar', 'dormir'], ok: false }]);
    const good = checkBox('A espada serviu na guerra;\nagora, deixe na terra.', rule);
    expect(good.rhymes[0]).toMatchObject({ words: ['guerra', 'terra'], ok: true });
  });
});

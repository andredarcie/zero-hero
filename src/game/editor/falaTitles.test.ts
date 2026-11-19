import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { readCharacters, type DialogFiles } from './dialogDraft';
import { falaTitle } from './falaTitles';

// O QUE CADA FALA É, para quem escreve: toda fala do arquivo tem título e "quando" (fala nova no código que ninguém
// descreveu reprova aqui: ganha uma linha em editor/falaTitles), e a que o jogo de hoje não mostra vem marcada.

const DIR = path.resolve(__dirname, '../i18n/dialogos');
const files = (): DialogFiles => ({
  'pt-br': JSON.parse(fs.readFileSync(path.join(DIR, 'pt-br.json'), 'utf8')),
  en: JSON.parse(fs.readFileSync(path.join(DIR, 'en.json'), 'utf8')),
});

describe('o que cada fala é', () => {
  it('toda fala do jogo tem título e quando aparece', () => {
    const missing = readCharacters(files()).flatMap((c) => c.falas)
      .map((f) => f.path.join('.'))
      .filter((key) => { const t = falaTitle(key); return !t.title || !t.when; });
    expect(missing).toEqual([]);
  });

  it('o título fala a língua de quem escreve, e o código fica de fora', () => {
    expect(falaTitle('wizard.intro').title).toBe('Sati na chegada ao vale');
    expect(falaTitle('npc.radiationSuitHint.porcini')).toMatchObject({ title: 'Dica: porcini' });
    expect(falaTitle('cat.talk.7').title).toBe('Lição do gato nº 7');
    expect(falaTitle('npc.painter.name').when).toContain('da Sisi');
  });

  it('a fala que o jogo de hoje não mostra vem marcada', () => {
    expect(falaTitle('npc.poet.lines').unused).toBe(true);
    expect(falaTitle('npc.poet.name').unused).toBe(true);
    expect(falaTitle('npc.astronautDone.lines').unused).toBe(true);
    expect(falaTitle('death.visit').unused).toBeUndefined();
  });
});

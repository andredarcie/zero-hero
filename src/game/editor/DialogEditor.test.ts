// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DialogEditor, type DialogPort } from './DialogEditor';
import type { DialogFiles, DialogLang, DraftSnapshot } from './dialogDraft';

// O EDITOR DE FALAS, para quem escreve: os personagens à esquerda; as conversas com título e "quando" no meio, cada
// caixa com quem fala (o personagem ou a narração), o português e o inglês, a margem das sílabas e a rima; à direita a
// prévia da caixa como no jogo. O Ctrl+S grava os DOIS arquivos no lugar certo; a lista de caixas se desfaz; o
// rascunho se guarda sozinho e volta, oferecido; o Esc pergunta antes de jogar fora o que não foi salvo.

const files = (): DialogFiles => ({
  'pt-br': {
    _leia: 'as falas',
    _verso: { metro: { min: 6, max: 9 }, estrofe: 4, rimam: [2, 4] },
    mago: {
      nome: 'Sati',
      filosofia: { escola: 'Budismo', ideia: 'Tudo passa', voz: 'Poucas palavras' },
      falas: {
        wizard: { intro: ['[narrador] A guerra enfim acabou;\nsó a estrada sobrou.', 'A espada serviu na guerra;\nagora, deixe na terra.'] },
        'npc.wizard': { name: 'Sati', lines: ['Não tem mais com quem lutar;\na guerra, pode largar.'] },
      },
    },
    marco: {
      nome: 'Marco',
      filosofia: { escola: 'Estoicismo', voz: 'Firme' },
      falas: { 'npc.businessManNight': { split: { clean: 'Rachou bonito, sem errar;\na lenha seca vai queimar.' } } },
    },
  },
  en: {
    _leia: 'the lines',
    _verso: { nota: 'common meter' },
    mago: {
      falas: {
        wizard: { intro: ['[narrator] The war is over, done at last;\nthe road is all that holds the past.', 'The sword was for the war, my friend;\nso set it down, the fighting ends.'] },
        'npc.wizard': { name: 'Sati', lines: ['No one is left to fight, so rest;\nput down the war, and do your best.'] },
      },
    },
    marco: { falas: { 'npc.businessManNight': { split: { clean: 'I lost the trade, I lost the wood;\nmy hand still shakes, as hands would.' } } } },
  },
});

const tick = (ms = 0): Promise<void> => new Promise((r) => { setTimeout(r, ms); });
const INTRO = '.zh-fala[data-fala="wizard.intro"]';

describe('DialogEditor', () => {
  const open: DialogEditor[] = [];
  beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); });
  afterEach(() => { for (const e of open.splice(0)) e.destroy(); });

  const make = async (draft?: DraftSnapshot | null) => {
    const saved: Array<Record<DialogLang, string>> = [];
    const drafts: DraftSnapshot[] = [];
    let stored = draft ?? null;
    const port: DialogPort = {
      load: vi.fn(async () => files()),
      save: vi.fn(async (t) => { saved.push(t); }),
      draft: { read: () => stored, write: (d) => { drafts.push(d); stored = d; }, clear: vi.fn(() => { stored = null; }) },
    };
    const modalRoot = document.createElement('div');
    document.body.appendChild(modalRoot);
    const host = { modalRoot, icon: () => 'data:retrato', toast: vi.fn(), colorOf: () => '#7fb069' };
    const editor = new DialogEditor(host, port);
    open.push(editor);
    await tick();
    const q = <T extends Element>(sel: string): T => modalRoot.querySelector<T>(sel)!;
    const all = <T extends Element>(sel: string): T[] => [...modalRoot.querySelectorAll<T>(sel)];
    const type = (area: HTMLTextAreaElement | HTMLInputElement, value: string): void => {
      area.value = value;
      area.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const button = (text: string): HTMLButtonElement => all<HTMLButtonElement>('button').find((b) => b.textContent === text)!;
    return { editor, port, saved, drafts, host, q, all, type, button };
  };

  it('abre com os personagens e as conversas do primeiro: título, quando, quem fala, português e inglês', async () => {
    const { editor, all, q } = await make();
    expect(all<HTMLButtonElement>('.zh-falas-list .zh-btn').map((b) => b.dataset.section)).toEqual(['mago', 'marco']);
    expect(editor.state).toMatchObject({ selected: 'mago', dirty: false, warnings: 0 });
    expect(all('.zh-fala-code').map((c) => c.textContent)).toEqual(['wizard.intro', 'npc.wizard.name', 'npc.wizard.lines']);
    expect(q(`${INTRO} .zh-fala-text h4`).textContent).not.toBe('');
    const areas = all<HTMLTextAreaElement>(`${INTRO} textarea`);
    expect(areas.map((a) => a.dataset.lang)).toEqual(['pt-br', 'en', 'pt-br', 'en']);
    // a narração: o campo mostra o texto sem a marca, e o seletor de quem fala está em "Narração"
    expect(areas[0].value).toBe('A guerra enfim acabou;\nsó a estrada sobrou.');
    const speakers = all<HTMLButtonElement>(`${INTRO} .zh-box[data-box="0"] .zh-speaker-btn`);
    expect(speakers.map((b) => [b.textContent, b.classList.contains('is-on')])).toEqual([['Sati', false], ['Narração', true]]);
    // a ficha do personagem, para quem escreve
    expect(q('.zh-ficha').textContent).toContain('Budismo');
    expect(q('.zh-ficha').textContent).toContain('Tudo passa');
  });

  it('cada verso tem a margem com as sílabas e a bolinha da rima; embaixo, as palavras da rima', async () => {
    const { all, q } = await make();
    const gutter = all(`${INTRO} .zh-box[data-box="1"] .zh-gutter .zh-g`);
    expect(gutter).toHaveLength(2);
    expect(gutter.every((g) => /\d/.test(g.textContent ?? '') && g.querySelector('.rh.ok'))).toBe(true);
    expect(q(`${INTRO} .zh-box[data-box="1"] .zh-rhyme`).textContent).toContain('guerra · terra ✓');
  });

  it('escrever atualiza a prévia (a caixa como no jogo) e o aviso diz o que fazer; Ctrl+S grava os dois arquivos', async () => {
    const { editor, all, type, saved, port } = await make();
    const pt = all<HTMLTextAreaElement>(`${INTRO} textarea[data-lang="pt-br"]`)[1];
    type(pt, 'A espada ficou na guerra;\nagora, deixe na TERRA.');
    expect(editor.state.dirty).toBe(true);
    expect(editor.preview).toMatchObject({ fala: 'wizard.intro', index: 1, lang: 'pt-br' });
    expect(editor.preview.text).toContain('Sati');
    expect(editor.preview.text).toContain('A espada ficou na guerra;');
    type(pt, 'A espada ficou na guerra;\nagora, deixe na terra.\num verso a mais');
    expect(all(`${INTRO} .zh-box.has-warn .zh-box-warn li`).map((li) => li.textContent).join()).toContain('use 4 (quadra) ou 2 (dístico)');
    type(pt, 'A espada ficou na guerra;\nagora, deixe na terra.');
    const game = vi.fn();
    window.addEventListener('keydown', game);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }));
    window.removeEventListener('keydown', game);
    await tick();
    expect(game).not.toHaveBeenCalled();
    expect(port.save).toHaveBeenCalledTimes(1);
    const written = JSON.parse(saved[0]['pt-br']) as { mago: { falas: { wizard: { intro: string[] } } } };
    expect(written.mago.falas.wizard.intro[1]).toBe('A espada ficou na guerra;\nagora, deixe na terra.');
    expect(saved[0]['pt-br']).toContain('"metro": { "min": 6, "max": 9 }');
    expect(JSON.parse(saved[0].en)).toEqual(files().en);
    expect(editor.state.dirty).toBe(false);
  });

  it('quem fala: "Narração" põe a marca nas duas línguas; tirar uma caixa se desfaz (botão e Ctrl+Z fora do texto)', async () => {
    const { editor, all, saved, button } = await make();
    all<HTMLButtonElement>(`${INTRO} .zh-box[data-box="1"] .zh-speaker-btn`)[1].click();
    all<HTMLButtonElement>(`${INTRO} .zh-fala-add`)[0].click();
    expect(all(`${INTRO} .zh-box`)).toHaveLength(3);
    all<HTMLButtonElement>(`${INTRO} .zh-box[data-box="2"] .zh-box-actions .zh-btn`).find((b) => b.textContent === '✕')!.click();
    all<HTMLButtonElement>(`${INTRO} .zh-box[data-box="0"] .zh-box-actions .zh-btn`).find((b) => b.textContent === '✕')!.click();
    expect(all(`${INTRO} .zh-box`)).toHaveLength(1);
    button('↶ Desfazer').click();
    expect(all(`${INTRO} .zh-box`)).toHaveLength(2);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(all(`${INTRO} .zh-box`)).toHaveLength(3);
    expect(editor.state.undo).toBe(1);
    button('↶ Desfazer').click();
    await editor.save();
    const pt = JSON.parse(saved[0]['pt-br']) as { mago: { falas: { wizard: { intro: string[] } } } };
    const en = JSON.parse(saved[0].en) as { mago: { falas: { wizard: { intro: string[] } } } };
    expect(pt.mago.falas.wizard.intro).toHaveLength(2);
    expect(pt.mago.falas.wizard.intro[1].startsWith('[narrador] ')).toBe(true);
    expect(en.mago.falas.wizard.intro[1].startsWith('[narrator] ')).toBe(true);
  });

  it('"Mostrar inglês" desligado esconde o inglês; "Só caixas com aviso" mostra só o que falta arrumar', async () => {
    const { all, type, q } = await make();
    const english = all<HTMLLabelElement>('.zh-falas-toggle').find((l) => l.textContent === 'Mostrar inglês')!.querySelector('input')!;
    english.click();
    expect(all('textarea[data-lang="en"]')).toHaveLength(0);
    english.click();
    type(all<HTMLTextAreaElement>(`${INTRO} textarea[data-lang="pt-br"]`)[0], 'Uma linha só');
    all<HTMLLabelElement>('.zh-falas-toggle').find((l) => l.textContent === 'Só caixas com aviso')!.querySelector('input')!.click();
    expect(all('.zh-fala-code').map((c) => c.textContent)).toEqual(['wizard.intro']);
    expect(q('.zh-falas-list .badge')?.textContent).toBe('1');
  });

  it('a caixa única não ganha botão de caixa; o nome é uma linha; a busca acha em todos', async () => {
    const { editor, all, q, type } = await make();
    editor.select('marco');
    expect(all('.zh-fala[data-fala="npc.businessManNight.split.clean"] .zh-fala-add')).toHaveLength(0);
    expect(all('.zh-fala[data-fala="npc.businessManNight.split.clean"] .zh-box-actions .zh-btn')).toHaveLength(0);
    editor.select('mago');
    expect(q('.zh-fala[data-fala="npc.wizard.name"] input[type=text]')).not.toBeNull();
    type(q<HTMLInputElement>('input[type=search]'), 'lenha');
    expect(all('.zh-falas-group').map((h) => h.textContent)).toEqual(['Marco']);
    type(q<HTMLInputElement>('input[type=search]'), 'nada disso');
    expect(q('.zh-falas-empty')?.textContent).toContain('nada disso');
  });

  it('o rascunho se guarda sozinho e, reaberto, é oferecido de volta (nunca posto sem perguntar)', async () => {
    const first = await make();
    first.type(first.all<HTMLTextAreaElement>(`${INTRO} textarea[data-lang="pt-br"]`)[1], 'Outra espada, outra guerra;\nagora, deixe na terra.');
    await tick(800);
    expect(first.drafts.at(-1)?.falas.map((f) => f.id)).toEqual(['mago:wizard.intro']);
    const draft = first.drafts.at(-1)!;
    first.editor.destroy();
    const again = await make(draft);
    expect(again.q('.zh-falas-banner').textContent).toContain('rascunho não salvo');
    expect(again.all<HTMLTextAreaElement>(`${INTRO} textarea[data-lang="pt-br"]`)[1].value).toBe('A espada serviu na guerra;\nagora, deixe na terra.');
    again.button('Recuperar o rascunho').click();
    expect(again.all<HTMLTextAreaElement>(`${INTRO} textarea[data-lang="pt-br"]`)[1].value).toBe('Outra espada, outra guerra;\nagora, deixe na terra.');
    expect(again.editor.state.dirty).toBe(true);
  });

  it('o Esc com falas não salvas pergunta antes; fechar sem salvar não grava nada', async () => {
    const { all, q, type, port, host, button } = await make();
    type(all<HTMLTextAreaElement>('textarea')[0], 'Outra coisa;\noutra loisa.');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(q('.zh-falas-banner').classList.contains('on')).toBe(true);
    expect(host.modalRoot.childElementCount).toBe(1);
    button('Fechar sem salvar').click();
    expect(host.modalRoot.childElementCount).toBe(0);
    expect(port.save).not.toHaveBeenCalled();
  });
});

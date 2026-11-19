// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { TalkEntry } from './talkLog';
import { TalkLogOverlay } from './TalkLogOverlay';

// AS CONVERSAS NO MENU: cada conversa com o nome de quem falou (e o retrato), separadas pelo dia, os versos como na
// caixa (os que rimam recuados, o nome da coisa destacado, a narração à parte), o filtro por pessoa (toque e ←→), e o
// Esc/X/Voltar devolvendo o menu. Nada do que se aperta aqui chega ao jogo.

const entry = (who: string, day: number, texts: string[], narrator = false): TalkEntry => ({
  who, color: '#7fb069', asset: `npc-${who}`, day, lines: texts.map((text) => ({ speaker: narrator ? 'narrator' : 'npc', text })),
});

const LOG: TalkEntry[] = [
  entry('Shui', 0, ['Traga a FACA,\no bosque espera;\ncogumelo bom\nnão desespera.']),
  entry('Sisi', 0, ['Uma cor só?\nQuero mais.']),
  entry('Shui', 1, ['Obrigada.']),
  entry('Shui', 1, ['Ela guarda a cesta.'], true),
];

describe('TalkLogOverlay', () => {
  const opened: TalkLogOverlay[] = [];
  beforeEach(() => { document.body.innerHTML = ''; });
  afterEach(() => { for (const o of opened.splice(0)) o.destroy(); });
  const open = (entries: TalkEntry[] = LOG) => {
    const cb = { portrait: vi.fn((asset: string) => `data:${asset}`), onClose: vi.fn() };
    const overlay = new TalkLogOverlay(entries, cb);
    opened.push(overlay);
    return { overlay, cb, root: overlay.element };
  };
  const press = (code: string): void => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }));
  };

  it('todas as conversas, em ordem, com o dia por cima e o nome (e o retrato) de quem falou', () => {
    const { root, overlay, cb } = open();
    expect(overlay.state).toEqual({ filter: null, shown: 4 });
    expect([...root.querySelectorAll('.zh-talk-day')].map((d) => d.textContent)).toEqual(['Dia 1', 'Dia 2']);
    expect([...root.querySelectorAll('.zh-talk-who')].map((w) => w.textContent)).toEqual(['Shui', 'Sisi', 'Shui', 'Shui']);
    expect(root.querySelector<HTMLImageElement>('.zh-talk-who img')?.src).toContain('npc-Shui');
    // um retrato por pessoa, não por conversa
    expect(cb.portrait).toHaveBeenCalledTimes(2);
  });

  it('os versos como na caixa: a quadra recua os que rimam, o nome da coisa em destaque, a narração à parte', () => {
    const { root } = open();
    const quatrain = root.querySelector('.zh-talk-line');
    expect([...quatrain!.querySelectorAll('.zh-talk-verse')].map((v) => v.classList.contains('zh-rhyme'))).toEqual([false, true, false, true]);
    expect(quatrain!.querySelector('.zh-talk-em')?.textContent).toBe('FACA,');
    expect(root.querySelectorAll('.zh-talk-line.zh-narr')).toHaveLength(1);
  });

  it('o filtro: tocar num nome mostra só as conversas dele; ←→ andam entre Todos e cada pessoa', () => {
    const { root, overlay } = open();
    const chips = [...root.querySelectorAll<HTMLButtonElement>('.zh-talk-chip')];
    expect(chips.map((c) => c.textContent)).toEqual(['Todos', 'Shui', 'Sisi']);
    chips[2].click();
    expect(overlay.state).toEqual({ filter: 'Sisi', shown: 1 });
    press('ArrowRight');
    expect(overlay.state.filter).toBeNull();
    press('ArrowLeft');
    expect(overlay.state).toEqual({ filter: 'Sisi', shown: 1 });
    press('ArrowLeft');
    expect(overlay.state).toEqual({ filter: 'Shui', shown: 3 });
  });

  it('sem conversa nenhuma, diz como começar (e o filtro nem aparece)', () => {
    const { root } = open([]);
    expect(root.querySelector('.zh-talk-empty')?.textContent).toContain('Nenhuma conversa');
    expect(root.querySelector<HTMLElement>('.zh-talk-chips')!.style.display).toBe('none');
  });

  it('Esc (ou X, ou o Voltar) devolve o menu, e nenhuma tecla chega ao jogo', () => {
    const { root, cb } = open();
    const game = vi.fn();
    document.addEventListener('keydown', game);
    press('ArrowDown');
    press('KeyX');
    document.removeEventListener('keydown', game);
    expect(game).not.toHaveBeenCalled();
    expect(cb.onClose).toHaveBeenCalledTimes(1);
    expect(document.body.contains(root)).toBe(false);
    const again = open();
    again.root.querySelector<HTMLButtonElement>('.zh-talk-back')!.click();
    expect(again.cb.onClose).toHaveBeenCalledTimes(1);
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DevPanel } from './DevPanel';
import { DEV_TABS, type DevPanelApi } from './devPanelViews';

// O PAINEL DE TESTES: a tecla à esquerda do 1 abre e fecha (pela POSIÇÃO, qualquer teclado), o jogo para enquanto ele
// está aberto e volta ao fechar (se foi ele quem parou), digitando ela não abre, os números trocam de aba, cada aba
// desenha, e nenhuma tecla chega ao jogo.

const press = (code: string, key: string, target: EventTarget = window): KeyboardEvent => {
  const e = new KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
};

const fakeApi = (): DevPanelApi & { calls: string[] } => {
  const calls: string[] = [];
  const said = (name: string) => (...args: unknown[]): string => { calls.push(`${name}(${args.join(',')})`); return `${name} ok`; };
  return {
    calls,
    quests: () => [{ dialog: 'painter', name: 'Sisi — o quadro', done: false, progress: '0/1 tarefas' }],
    finishQuest: said('finishQuest'), finishAllQuests: said('finishAllQuests'),
    items: () => [{ kind: 'wood', name: 'Graveto', icon: '', tool: false, owned: false }, { kind: 'axe', name: 'Machado', icon: '', tool: true, owned: true }],
    held: () => 'Mãos vazias.', giveItem: said('giveItem'), giveAllTools: said('giveAllTools'), clearHand: said('clearHand'), markAllSeen: said('markAllSeen'),
    stock: () => [{ id: 'wood', name: 'Graveto', icon: '', count: 3 }],
    addStock: said('addStock'), fillStock: said('fillStock'), clearStock: said('clearStock'), unlockBuilds: said('unlockBuilds'),
    mowCamp: said('mowCamp'), regrowCamp: said('regrowCamp'), clearPieces: said('clearPieces'), skipDeathNights: said('skipDeathNights'),
    clock: () => 'Dia 0 · 12:00', setTime: said('setTime'), nextDay: said('nextDay'),
    places: () => [{ id: 'camp', name: 'Acampamento' }], teleport: said('teleport'),
    saveNow: said('saveNow'), resetSave: () => { calls.push('resetSave'); },
  };
};

describe('o painel de testes do localhost', () => {
  const made: DevPanel[] = [];
  afterEach(() => {
    for (const p of made.splice(0)) p.destroy();
    document.body.innerHTML = '';
  });
  const setup = (alreadyPaused = false) => {
    const api = fakeApi();
    const hooks = { pause: vi.fn(() => !alreadyPaused), resume: vi.fn() };
    const panel = new DevPanel(api, hooks);
    made.push(panel);
    return { api, hooks, panel };
  };

  it('a tecla à esquerda do 1 abre, para o jogo, e fecha devolvendo o jogo', () => {
    const { hooks, panel } = setup();
    const e = press('Backquote', "'");
    expect(e.defaultPrevented).toBe(true);
    expect(panel.isOpen).toBe(true);
    expect(hooks.pause).toHaveBeenCalledTimes(1);
    press('Backquote', 'Dead');
    expect(panel.isOpen).toBe(false);
    expect(hooks.resume).toHaveBeenCalledTimes(1);
  });

  it('o Esc também fecha; se o jogo já estava parado (a bancada por baixo), continua parado', () => {
    const { hooks, panel } = setup(true);
    panel.open();
    press('Escape', 'Escape');
    expect(panel.isOpen).toBe(false);
    expect(hooks.resume).not.toHaveBeenCalled();
  });

  it('digitando num campo, a tecla escreve e não abre', () => {
    const { panel } = setup();
    const input = document.createElement('input');
    document.body.appendChild(input);
    press('Backquote', "'", input);
    expect(panel.isOpen).toBe(false);
  });

  it('aberto, nenhuma tecla chega ao jogo, e os números trocam de aba', () => {
    const { panel } = setup();
    panel.open();
    const game = vi.fn();
    window.addEventListener('keydown', game);
    press('KeyZ', 'z');
    press('Digit2', '2');
    window.removeEventListener('keydown', game);
    expect(game).not.toHaveBeenCalled();
    expect(document.querySelector('#zh-dev nav button.zh-on')?.textContent).toContain('Itens');
  });

  it('cada aba desenha, e os botões chamam o jogo e escrevem o resultado no rodapé', () => {
    const { api, panel } = setup();
    panel.open();
    for (let i = 1; i <= DEV_TABS.length; i += 1) {
      press(`Digit${i}`, String(i));
      expect(document.querySelectorAll('#zh-dev main section').length).toBeGreaterThan(0);
    }
    press('Digit1', '1');
    const finish = [...document.querySelectorAll<HTMLButtonElement>('#zh-dev main button')].find((b) => b.textContent === 'Concluir todos os pedidos');
    finish?.click();
    expect(api.calls).toContain('finishAllQuests()');
    expect(document.querySelector('#zh-dev footer')?.textContent).toBe('finishAllQuests ok');
    press('Digit2', '2');
    const five = [...document.querySelectorAll<HTMLButtonElement>('#zh-dev main button')].find((b) => b.textContent === '5');
    five?.click();
    document.querySelector<HTMLButtonElement>('#zh-dev .zh-dev-item')?.click();
    expect(api.calls).toContain('giveItem(wood,5)');
  });

  it('apagar o save pede confirmação', () => {
    const { api, panel } = setup();
    panel.open();
    press('Digit5', '5');
    const danger = (): HTMLButtonElement | undefined => [...document.querySelectorAll<HTMLButtonElement>('#zh-dev main button')].find((b) => /save/u.test(b.textContent ?? '') && /Apagar|Confirmar/u.test(b.textContent ?? ''));
    danger()?.click();
    expect(api.calls).not.toContain('resetSave');
    danger()?.click();
    expect(api.calls).toContain('resetSave');
  });
});

// @vitest-environment jsdom
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  REPEAT_DELAY_MS, REPEAT_EVERY_MS, getPadFamily, installGamepad, isPadEvent, padButtonMap, padFamilyOf, padGlyph,
  readPad, stickDirection, usingPad,
} from './gamepad';
import { getKeyLetter, withKeyNames } from './accessibility';

// O CONTROLE: cada botão vira a tecla que o jogo já escuta. Aqui: de que família é cada controle, os botões de cada
// uma (o Switch troca o A e o B de lugar), o analógico que não treme na diagonal, e o caminho inteiro — o botão
// apertado vira keydown no elemento em foco, a seta segurada repete, e os textos passam a mostrar os botões.

const ids = {
  xbox: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
  xinput: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)',
  dualsense: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',
  ds4: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)',
  pro: 'Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)',
  joycons: 'Joy-Con L+R (STANDARD GAMEPAD Vendor: 057e Product: 200e)',
  generic: 'Logitech Dual Action (STANDARD GAMEPAD Vendor: 046d Product: c216)',
};

describe('a família do controle', () => {
  it('sai do nome que o navegador dá (o fabricante vem nele)', () => {
    expect(padFamilyOf(ids.xbox)).toBe('xbox');
    expect(padFamilyOf(ids.xinput)).toBe('xbox');
    expect(padFamilyOf(ids.dualsense)).toBe('playstation');
    expect(padFamilyOf(ids.ds4)).toBe('playstation');
    expect(padFamilyOf(ids.pro)).toBe('nintendo');
    expect(padFamilyOf(ids.joycons)).toBe('nintendo');
    // Os outros seguem o desenho do Xbox, que é o do mapa "standard".
    expect(padFamilyOf(ids.generic)).toBe('xbox');
  });

  it('o confirmar é o botão de baixo no Xbox e no PlayStation, e o da direita (o A) no Switch', () => {
    expect(padButtonMap('xbox')[0]).toBe('hand');
    expect(padButtonMap('xbox')[1]).toBe('use');
    expect(padButtonMap('playstation')[0]).toBe('hand');
    expect(padButtonMap('nintendo')[1]).toBe('hand');
    expect(padButtonMap('nintendo')[0]).toBe('use');
    for (const family of ['xbox', 'playstation', 'nintendo'] as const) {
      const map = padButtonMap(family);
      expect([map[12], map[13], map[14], map[15]]).toEqual(['up', 'down', 'left', 'right']);
      expect(map[9]).toBe('pause');
      expect(map[2]).toBe('extra');
      expect(map[3]).toBe('finish');
    }
  });

  it('cada família mostra o botão como está impresso nela', () => {
    expect([padGlyph('hand', 'xbox'), padGlyph('use', 'xbox')]).toEqual(['A', 'B']);
    expect([padGlyph('hand', 'playstation'), padGlyph('use', 'playstation')]).toEqual(['✕', '○']);
    expect([padGlyph('hand', 'nintendo'), padGlyph('use', 'nintendo'), padGlyph('pause', 'nintendo')]).toEqual(['A', 'B', '+']);
  });
});

describe('o analógico', () => {
  it('vira UMA seta, só passando da zona morta', () => {
    expect(stickDirection(0.3, 0.1, null)).toBeNull();
    expect(stickDirection(0.7, 0.1, null)).toBe('right');
    expect(stickDirection(-0.1, -0.8, null)).toBe('up');
    expect(stickDirection(0.2, 0.9, null)).toBe('down');
  });

  it('solta mais tarde do que pega (sem piscar no limite)', () => {
    expect(stickDirection(0.42, 0, null)).toBeNull();
    expect(stickDirection(0.42, 0, 'right')).toBe('right');
    expect(stickDirection(0.3, 0, 'right')).toBeNull();
  });

  it('na diagonal segura a seta que já estava, até a outra passar dela com folga', () => {
    expect(stickDirection(0.62, 0.66, 'right')).toBe('right');
    expect(stickDirection(0.3, 0.9, 'right')).toBe('down');
    // Virar para o lado oposto é imediato.
    expect(stickDirection(-0.8, 0, 'right')).toBe('left');
  });
});

type FakePad = { id: string; index: number; connected: boolean; mapping: string; axes: number[]; buttons: { pressed: boolean; value: number }[] };
const fakePad = (id: string): FakePad => ({
  id, index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
});
const asPad = (pad: FakePad): Gamepad => pad as unknown as Gamepad;

describe('a leitura de um controle', () => {
  it('junta os botões e o analógico', () => {
    const pad = fakePad(ids.pro);
    pad.buttons[1] = { pressed: true, value: 1 };
    pad.axes[0] = -0.9;
    const read = readPad(asPad(pad), null);
    expect([...read.actions].sort()).toEqual(['hand', 'left']);
    expect(read.stick).toBe('left');
    expect(read.active).toBe(true);
  });

  it('o gatilho conta pela força, mesmo sem o "pressed"', () => {
    const pad = fakePad(ids.xbox);
    pad.buttons[7] = { pressed: false, value: 0.8 };
    expect(readPad(asPad(pad), null).actions.has('next')).toBe(true);
  });
});

describe('o controle de ponta a ponta', () => {
  const pad = fakePad(ids.xbox);
  const seen: Array<{ type: string; code: string; keyCode: number; repeat: boolean; pad: boolean; target: EventTarget | null }> = [];
  const listen = (event: Event): void => {
    const e = event as KeyboardEvent;
    seen.push({ type: e.type, code: e.code, keyCode: e.keyCode, repeat: e.repeat, pad: isPadEvent(e), target: e.target });
  };

  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'performance'] });
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
    window.addEventListener('keydown', listen, true);
    window.addEventListener('keyup', listen, true);
    installGamepad();
    window.dispatchEvent(new Event('gamepadconnected'));
  });
  afterAll(() => {
    window.removeEventListener('keydown', listen, true);
    window.removeEventListener('keyup', listen, true);
    vi.useRealTimers();
  });
  const frames = (ms: number): void => { vi.advanceTimersByTime(ms); };

  it('o A aperta e solta o Z, no elemento em foco, marcado como do controle', () => {
    pad.buttons[0] = { pressed: true, value: 1 };
    frames(20);
    expect(seen.at(-1)).toMatchObject({ type: 'keydown', code: 'KeyZ', keyCode: 90, repeat: false, pad: true, target: document.body });
    expect(usingPad()).toBe(true);
    pad.buttons[0] = { pressed: false, value: 0 };
    frames(20);
    expect(seen.at(-1)).toMatchObject({ type: 'keyup', code: 'KeyZ' });
  });

  it('o Start abre a pausa (Esc) e o B volta (X)', () => {
    seen.length = 0;
    pad.buttons[9] = { pressed: true, value: 1 };
    pad.buttons[1] = { pressed: true, value: 1 };
    frames(20);
    expect(seen.filter((e) => e.type === 'keydown').map((e) => e.code).sort()).toEqual(['Escape', 'KeyX']);
    pad.buttons[9] = { pressed: false, value: 0 };
    pad.buttons[1] = { pressed: false, value: 0 };
    frames(20);
  });

  it('a seta segurada repete como a do teclado, e o botão segurado não', () => {
    seen.length = 0;
    pad.buttons[13] = { pressed: true, value: 1 };
    pad.buttons[0] = { pressed: true, value: 1 };
    frames(REPEAT_DELAY_MS + REPEAT_EVERY_MS * 3 + 20);
    const downs = seen.filter((e) => e.type === 'keydown' && e.code === 'ArrowDown');
    expect(downs[0].repeat).toBe(false);
    expect(downs.length).toBeGreaterThanOrEqual(4);
    expect(downs.slice(1).every((e) => e.repeat)).toBe(true);
    expect(seen.filter((e) => e.type === 'keydown' && e.code === 'KeyZ')).toHaveLength(1);
    pad.buttons[13] = { pressed: false, value: 0 };
    pad.buttons[0] = { pressed: false, value: 0 };
    frames(20);
  });

  it('os textos de ajuda e o balão mostram os botões do controle', () => {
    expect(getKeyLetter('hand')).toBe('A');
    expect(withKeyNames('Setas  ·  Z constrói  ·  X fecha')).toBe('Direcional  ·  A constrói  ·  B fecha');
    expect(withKeyNames('Segure {Z} enquanto o anel cresce  ·  {Esc} levanta')).toBe('Segure {A} enquanto o anel cresce  ·  {Menu} levanta');
    expect(withKeyNames('Mudando de lugar  ·  setas e Z  ·  Delete desmonta  ·  X devolve'))
      .toBe('Mudando de lugar  ·  direcional e A  ·  X desmonta  ·  B devolve');
    // Numa fala (sem o "·" nem chaves de tecla), "Enter" é só uma palavra.
    expect(withKeyNames('Enter the garden when the gate opens.')).toBe('Enter the garden when the gate opens.');
  });

  it('um controle de PlayStation troca os nomes pelos símbolos dele', () => {
    pad.id = ids.dualsense;
    pad.buttons[0] = { pressed: true, value: 1 };
    frames(20);
    pad.buttons[0] = { pressed: false, value: 0 };
    frames(20);
    expect(getPadFamily()).toBe('playstation');
    expect(withKeyNames('Z fala e pega · X usa')).toBe('✕ fala e pega · ○ usa');
  });

  it('o controle que sai solta o que estava apertado', () => {
    seen.length = 0;
    pad.buttons[14] = { pressed: true, value: 1 };
    frames(20);
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] });
    frames(20);
    expect(seen.at(-1)).toMatchObject({ type: 'keyup', code: 'ArrowLeft' });
  });
});

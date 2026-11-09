import { localStore } from '@/game/platform/platform';
/**
 * AS OPÇÕES DE ACESSIBILIDADE, todas num lugar só: quem desenha ou reage pergunta aqui.
 *
 * A ordem vem das Game Accessibility Guidelines: primeiro o que ajuda mais gente e custa menos. Nada aqui
 * muda a história nem o que se ganha; só como o jogo se apresenta e quanta pressa ele cobra.
 */

export type BoundAction = 'hand' | 'use';

const KEYS = {
  textScale: 'zh.a11y.textScale',
  reduceMotion: 'zh.a11y.reduceMotion',
  instantText: 'zh.a11y.instantText',
  calmGames: 'zh.a11y.calmGames',
  hand: 'zh.a11y.keyHand',
  use: 'zh.a11y.keyUse',
} as const;

/** A tecla que o jogo inteiro escuta para cada gesto. Trocar é traduzir para ela, ver `installKeyRemap`. */
const GAME_CODE: Readonly<Record<BoundAction, string>> = { hand: 'KeyZ', use: 'KeyX' };
const GAME_KEYCODE: Readonly<Record<BoundAction, number>> = { hand: 90, use: 88 };

const read = (key: string): string | null => {
  try { return localStore().getItem(key); } catch { return null; }
};
const write = (key: string, value: string): void => {
  // Sem armazenamento a opção vale até fechar a página.
  try { localStore().setItem(key, value); } catch { /* ignore */ }
};

const systemAsksLessMotion = (): boolean => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

export const TEXT_SCALES: readonly number[] = [1, 1.25, 1.5];

const applyRootScale = (scale: number): void => {
  // As telas medidas em rem (o catálogo da bancada) crescem por aqui.
  document.documentElement.style.fontSize = `${scale * 100}%`;
};

let textScale = TEXT_SCALES.includes(Number(read(KEYS.textScale))) ? Number(read(KEYS.textScale)) : 1;
// Sem escolha salva, vale o que o sistema já pede.
const storedMotion = read(KEYS.reduceMotion);
let reduceMotion = storedMotion === null ? systemAsksLessMotion() : storedMotion === '1';
let instantText = read(KEYS.instantText) === '1';
let calmGames = read(KEYS.calmGames) === '1';

export const getTextScale = (): number => textScale;
export const setTextScale = (value: number): void => {
  textScale = value;
  write(KEYS.textScale, String(value));
  applyRootScale(value);
};

/** Sem tremor de tela, sem clarão e sem balanço de interface. */
export const isReducedMotion = (): boolean => reduceMotion;
export const setReducedMotion = (on: boolean): void => {
  reduceMotion = on;
  write(KEYS.reduceMotion, on ? '1' : '0');
};

export const isInstantText = (): boolean => instantText;
export const setInstantText = (on: boolean): void => {
  instantText = on;
  write(KEYS.instantText, on ? '1' : '0');
};

export const isCalmGames = (): boolean => calmGames;
export const setCalmGames = (on: boolean): void => {
  calmGames = on;
  write(KEYS.calmGames, on ? '1' : '0');
};
/** O relógio dos minijogos de tempo: com a opção ligada, tudo o que corre contra o jogador vai à metade. */
export const calmDt = (dt: number): number => (calmGames ? dt * 0.5 : dt);

// ── as teclas ──

const bindable = (code: string | null): code is string => (
  code !== null && /^(Key[A-Z]|Digit[0-9])$/u.test(code) && !['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(code)
);
const stored = (action: BoundAction): string => {
  const code = read(KEYS[action]);
  return bindable(code) ? code : GAME_CODE[action];
};
const bindings: Record<BoundAction, string> = { hand: stored('hand'), use: stored('use') };
if (bindings.hand === bindings.use) {
  bindings.hand = GAME_CODE.hand;
  bindings.use = GAME_CODE.use;
}

/** Letras e números, menos os de andar: setas, Enter e Esc têm dono fixo. */
export const isBindableKey = (code: string): boolean => bindable(code);
export const getKeyCode = (action: BoundAction): string => bindings[action];
/** A letra que aparece nas teclas desenhadas e nos textos. */
export const getKeyLetter = (action: BoundAction): string => bindings[action].replace(/^(Key|Digit)/u, '');

/** Trocar para uma tecla que o outro gesto já usa inverte as duas, para nenhum gesto ficar sem tecla. */
export const setKeyCode = (action: BoundAction, code: string): void => {
  if (!bindable(code)) return;
  const other: BoundAction = action === 'hand' ? 'use' : 'hand';
  if (bindings[other] === code) {
    bindings[other] = bindings[action];
    write(KEYS[other], bindings[other]);
  }
  bindings[action] = code;
  write(KEYS[action], code);
};

/**
 * O texto do jogo diz "Z" e "X" como letra solta: é o nome das teclas, e ele acompanha a troca. No toque os
 * textos são outros e nada muda.
 */
export const withKeyNames = (text: string): string => {
  if (bindings.hand === GAME_CODE.hand && bindings.use === GAME_CODE.use) return text;
  return text.replace(/(^|[^\p{L}])([ZX])(?![\p{L}])/gu, (_, before: string, letter: string) => (
    before + getKeyLetter(letter === 'Z' ? 'hand' : 'use')
  ));
};

let capturing = false;
/** Enquanto o menu espera a tecla nova, a tradução para: ele precisa da tecla crua. */
export const setKeyCapture = (on: boolean): void => { capturing = on; };

/**
 * TROCAR TECLA POR TRADUÇÃO: a tecla escolhida vira, antes de qualquer outro ouvinte, o evento da tecla que
 * o jogo escuta. Assim mundo, conversa, catálogo, minijogos e menu seguem a troca sem conhecê-la.
 */
export const installKeyRemap = (): void => {
  const translate = (event: KeyboardEvent): void => {
    if (!event.isTrusted || capturing) return;
    const action = (['hand', 'use'] as const).find((a) => bindings[a] === event.code);
    if (!action || bindings[action] === GAME_CODE[action]) return;
    event.stopImmediatePropagation();
    event.preventDefault();
    const code = GAME_CODE[action];
    window.dispatchEvent(new KeyboardEvent(event.type, {
      code, key: code.slice(3).toLowerCase(), keyCode: GAME_KEYCODE[action], which: GAME_KEYCODE[action], repeat: event.repeat, bubbles: true, cancelable: true,
    } as KeyboardEventInit));
  };
  window.addEventListener('keydown', translate, true);
  window.addEventListener('keyup', translate, true);
  applyRootScale(textScale);
};

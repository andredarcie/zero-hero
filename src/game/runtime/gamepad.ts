import { localStore } from '@/game/platform/platform';

/**
 * O CONTROLE (pedido do autor, 2026-11-20: "suporte total a controle de videogame, tipo Xbox, PlayStation e Switch").
 *
 * Ele não tem tela própria nem regra própria: cada botão vira a TECLA que o jogo já escuta (as setas, o Z, o X, o Esc…),
 * disparada como evento de teclado no elemento em foco — o mesmo caminho de uma tecla de verdade, passando pelos mesmos
 * ouvintes na mesma ordem (o da janela em captura antes, o do motor no fim). Por isso o mundo, as conversas, o menu, a
 * bancada, a tina e os minijogos funcionam com ele sem conhecê-lo: é o mesmo truque da troca de teclas
 * (accessibility.installKeyRemap). Tela nova que anda com Z, X, Esc e setas já anda com o controle.
 *
 * OS BOTÕES, pela POSIÇÃO no controle (o mapa "standard" da Gamepad API é posicional), e a função de cada um:
 *
 *   embaixo/direita  Xbox A · PlayStation ✕ · Switch A (à direita)   → Z      a mão: falar, pegar, confirmar
 *   direita/embaixo  Xbox B · PlayStation ○ · Switch B (embaixo)     → X      usar o item; nas telas, voltar e fechar
 *   esquerda         Xbox X · PlayStation □ · Switch Y               → Delete desmontar a peça (a bancada), apagar letra
 *   em cima          Xbox Y · PlayStation △ · Switch X               → Enter  terminar (a pintura, o nome da placa)
 *   Start / Select   Menu, View · Options, Create · +, −             → Esc    a pausa (e, nas telas, sair)
 *   ombros, gatilhos LB RB LT RT · L1 R1 L2 R2 · L R ZL ZR           → PageUp/PageDown: folhear, trocar a tinta
 *   direcional e analógico esquerdo                                   → as setas
 *
 * No Switch o confirmar é o A, que fica à DIREITA (no Xbox e no PlayStation fica embaixo): o controle da Nintendo troca
 * os dois de lugar, para a mão de quem joga no Switch achar o A onde sempre achou.
 */

export type PadFamily = 'xbox' | 'playstation' | 'nintendo';
export type PadAction = 'up' | 'down' | 'left' | 'right' | 'hand' | 'use' | 'extra' | 'finish' | 'pause' | 'prev' | 'next';
type Dir = 'up' | 'down' | 'left' | 'right';

interface KeySpec { readonly code: string; readonly key: string; readonly keyCode: number }

/** A tecla que cada gesto do controle aperta. */
export const PAD_KEYS: Readonly<Record<PadAction, KeySpec>> = {
  up: { code: 'ArrowUp', key: 'ArrowUp', keyCode: 38 },
  down: { code: 'ArrowDown', key: 'ArrowDown', keyCode: 40 },
  left: { code: 'ArrowLeft', key: 'ArrowLeft', keyCode: 37 },
  right: { code: 'ArrowRight', key: 'ArrowRight', keyCode: 39 },
  hand: { code: 'KeyZ', key: 'z', keyCode: 90 },
  use: { code: 'KeyX', key: 'x', keyCode: 88 },
  extra: { code: 'Delete', key: 'Delete', keyCode: 46 },
  finish: { code: 'Enter', key: 'Enter', keyCode: 13 },
  pause: { code: 'Escape', key: 'Escape', keyCode: 27 },
  prev: { code: 'PageUp', key: 'PageUp', keyCode: 33 },
  next: { code: 'PageDown', key: 'PageDown', keyCode: 34 },
};

/** De que família é o controle, pelo nome que o navegador dá (o fabricante vem nele: 054c Sony, 057e Nintendo). */
export const padFamilyOf = (id: string): PadFamily => {
  const s = id.toLowerCase();
  if (/054c|playstation|dualshock|dualsense/u.test(s)) return 'playstation';
  if (/057e|nintendo|pro controller|joy-?con/u.test(s)) return 'nintendo';
  return 'xbox';
};

/** Os botões do mapa "standard" (índice → gesto) de cada família. Os quatro de face mudam; o resto é igual. */
export const padButtonMap = (family: PadFamily): Readonly<Record<number, PadAction>> => ({
  ...(family === 'nintendo'
    ? { 1: 'hand', 0: 'use', 2: 'extra', 3: 'finish' }
    : { 0: 'hand', 1: 'use', 2: 'extra', 3: 'finish' }),
  4: 'prev', 5: 'next', 6: 'prev', 7: 'next', 8: 'pause', 9: 'pause', 12: 'up', 13: 'down', 14: 'left', 15: 'right',
} as Record<number, PadAction>);

/** O ANALÓGICO vira UMA seta (o herói anda em quatro direções, preso à grade). */
const STICK_ON = 0.5;
const STICK_OFF = 0.35;
/** Na diagonal, a seta que já está apertada segura até a outra passar dela com esta folga: senão ela tremeria entre duas. */
const STICK_SWITCH = 0.2;

export const stickDirection = (x: number, y: number, prev: Dir | null): Dir | null => {
  if (Math.hypot(x, y) < (prev ? STICK_OFF : STICK_ON)) return null;
  const horiz = Math.abs(x) >= Math.abs(y);
  const dir: Dir = horiz ? (x < 0 ? 'left' : 'right') : (y < 0 ? 'up' : 'down');
  if (!prev || dir === prev) return dir;
  const held = prev === 'left' ? -x : prev === 'right' ? x : prev === 'up' ? -y : y;
  const fresh = horiz ? Math.abs(x) : Math.abs(y);
  return held > STICK_OFF && fresh < held + STICK_SWITCH ? prev : dir;
};

/** A seta segurada repete como a do teclado (andar pela lista do menu segurando é bom), só que mais calma. */
export const REPEAT_DELAY_MS = 380;
export const REPEAT_EVERY_MS = 90;
const DIRS: readonly PadAction[] = ['up', 'down', 'left', 'right'];

/** O que os botões e o analógico de UM controle pedem agora. */
export const readPad = (pad: Gamepad, prevStick: Dir | null): { actions: Set<PadAction>; stick: Dir | null; active: boolean } => {
  const map = padButtonMap(padFamilyOf(pad.id));
  const actions = new Set<PadAction>();
  let active = false;
  pad.buttons.forEach((b, i) => {
    const on = b.pressed || b.value > 0.5;
    if (!on) return;
    active = true;
    const action = map[i];
    if (action) actions.add(action);
  });
  const stick = stickDirection(pad.axes[0] ?? 0, pad.axes[1] ?? 0, prevStick);
  if (stick) { actions.add(stick); active = true; }
  // Fora do mapa "standard" muitos controles dão o direcional nos eixos 6 e 7 (o "hat").
  if (pad.mapping !== 'standard' && pad.axes.length >= 8) {
    const hx = pad.axes[6] ?? 0;
    const hy = pad.axes[7] ?? 0;
    if (hx < -0.5) actions.add('left'); else if (hx > 0.5) actions.add('right');
    if (hy < -0.5) actions.add('up'); else if (hy > 0.5) actions.add('down');
    if (Math.abs(hx) > 0.5 || Math.abs(hy) > 0.5) active = true;
  }
  return { actions, stick, active };
};

// ── o estado: quem joga com o controle agora, e de que família ──

let family: PadFamily = 'xbox';
let padMode = false;
const listeners = new Set<(pad: boolean) => void>();
const padEvents = new WeakSet<Event>();

/** O jogador está no controle (a última coisa que mexeu foi ele): os textos e os balões mostram os botões dele. */
export const usingPad = (): boolean => padMode;
export const getPadFamily = (): PadFamily => family;
/** Este evento de teclado veio do controle (e não de uma tecla): a placa do nome, que digita, precisa saber. */
export const isPadEvent = (event: Event): boolean => padEvents.has(event);
/** Avisa quando o jogador passa do teclado (ou do toque) para o controle e de volta. Devolve o "desligar". */
export const onPadModeChange = (cb: (pad: boolean) => void): (() => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const setPadMode = (on: boolean, nextFamily = family): void => {
  if (on === padMode && nextFamily === family) return;
  family = nextFamily;
  padMode = on;
  for (const cb of [...listeners]) cb(on);
};

/** O NOME DE CADA BOTÃO como está impresso no controle de cada família: é o que os textos e os balões mostram. */
const GLYPHS: Readonly<Record<PadFamily, Readonly<Record<Exclude<PadAction, Dir>, string>>>> = {
  xbox: { hand: 'A', use: 'B', extra: 'X', finish: 'Y', pause: 'Menu', prev: 'LB', next: 'RB' },
  playstation: { hand: '✕', use: '○', extra: '□', finish: '△', pause: 'Options', prev: 'L1', next: 'R1' },
  nintendo: { hand: 'A', use: 'B', extra: 'Y', finish: 'X', pause: '+', prev: 'L', next: 'R' },
};
export const padGlyph = (action: Exclude<PadAction, Dir>, of: PadFamily = family): string => GLYPHS[of][action];

// ── a vibração ──

const RUMBLE_KEY = 'zh.padRumble';
let rumbleOn = ((): boolean => { try { return localStore().getItem(RUMBLE_KEY) !== '0'; } catch { return true; } })();
export const hasPadRumble = (): boolean => rumbleOn;
export const setPadRumble = (on: boolean): void => {
  rumbleOn = on;
  try { localStore().setItem(RUMBLE_KEY, on ? '1' : '0'); } catch { /* sem armazenamento: vale até fechar */ }
};

type Rumbler = { playEffect?: (type: string, params: Record<string, number>) => Promise<unknown> };
const pads = (): Gamepad[] => {
  try { return [...(navigator.getGamepads?.() ?? [])].filter((p): p is Gamepad => Boolean(p && p.connected)); } catch { return []; }
};
/** Há um controle conectado agora (o menu só mostra a linha da vibração com um). */
export const padConnected = (): boolean => pads().length > 0;

/** Um tranco no controle (0..1, em ms). Só com o jogador no controle e a vibração ligada (pausa → opções). */
export const padRumble = (strength: number, ms: number): void => {
  if (!padMode || !rumbleOn || strength <= 0) return;
  for (const pad of pads()) {
    const actuator = (pad as Gamepad & { vibrationActuator?: Rumbler }).vibrationActuator;
    actuator?.playEffect?.('dual-rumble', {
      duration: ms, startDelay: 0, strongMagnitude: Math.min(1, strength), weakMagnitude: Math.min(1, strength * 1.3),
    })?.catch(() => undefined);
  }
};

// ── a leitura, quadro a quadro ──

/** Aperta (ou solta) a tecla de um gesto no elemento em foco, como uma tecla de verdade. */
const press = (action: PadAction, type: 'keydown' | 'keyup', repeat = false): void => {
  const spec = PAD_KEYS[action];
  const event = new KeyboardEvent(type, { code: spec.code, key: spec.key, repeat, bubbles: true, cancelable: true });
  // O motor lê o `keyCode` (o mapa das teclas dele é por número), e o construtor do evento o ignora.
  Object.defineProperty(event, 'keyCode', { get: () => spec.keyCode });
  Object.defineProperty(event, 'which', { get: () => spec.keyCode });
  padEvents.add(event);
  const target = document.activeElement instanceof HTMLElement ? document.activeElement : document.body;
  (target ?? window).dispatchEvent(event);
};

class PadReader {
  private readonly held = new Set<PadAction>();
  private readonly repeatAt = new Map<PadAction, number>();
  private readonly sticks = new Map<number, Dir | null>();
  private raf = 0;

  public start(): void {
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  }

  /** Solta tudo o que está apertado (a janela perdeu o foco, o controle saiu): nenhuma seta fica presa. */
  public releaseAll(): void {
    for (const action of this.held) press(action, 'keyup');
    this.held.clear();
    this.repeatAt.clear();
    this.sticks.clear();
  }

  private readonly tick = (now: number): void => {
    this.raf = 0;
    const list = pads();
    if (list.length === 0) { this.releaseAll(); return; }
    const want = new Set<PadAction>();
    let activeFamily: PadFamily | undefined;
    for (const pad of list) {
      const read = readPad(pad, this.sticks.get(pad.index) ?? null);
      this.sticks.set(pad.index, read.stick);
      for (const action of read.actions) want.add(action);
      if (read.active) activeFamily = padFamilyOf(pad.id);
    }
    if (activeFamily) setPadMode(true, activeFamily);
    for (const action of this.held) {
      if (!want.has(action)) { this.held.delete(action); this.repeatAt.delete(action); press(action, 'keyup'); }
    }
    for (const action of want) {
      if (!this.held.has(action)) {
        this.held.add(action);
        if (DIRS.includes(action)) this.repeatAt.set(action, now + REPEAT_DELAY_MS);
        press(action, 'keydown');
      } else {
        const at = this.repeatAt.get(action);
        if (at !== undefined && now >= at) {
          this.repeatAt.set(action, at + REPEAT_EVERY_MS);
          press(action, 'keydown', true);
        }
      }
    }
    this.raf = requestAnimationFrame(this.tick);
  };
}

let installed = false;

/**
 * Liga o controle (uma vez, no boot da página). Sem controle conectado nada roda: a leitura só começa quando o navegador
 * anuncia um (ele só anuncia depois do primeiro botão apertado) e para sozinha quando o último sai.
 */
export const installGamepad = (): void => {
  if (installed || typeof window === 'undefined' || !('getGamepads' in navigator)) return;
  installed = true;
  const reader = new PadReader();
  window.addEventListener('gamepadconnected', () => reader.start());
  window.addEventListener('gamepaddisconnected', () => { if (pads().length === 0) setPadMode(false); });
  window.addEventListener('blur', () => reader.releaseAll());
  // Uma tecla de verdade ou um toque devolvem os textos ao teclado (ou ao dedo).
  const back = (event: Event): void => { if (event.isTrusted) setPadMode(false); };
  window.addEventListener('keydown', back, true);
  window.addEventListener('pointerdown', back, true);
  if (pads().length > 0) reader.start();
};

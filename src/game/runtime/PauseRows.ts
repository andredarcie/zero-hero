// AS LINHAS DO MENU DE PAUSA: cada tipo de linha (escolha, nível, tecla) montado do mesmo jeito, madeira e papel (ver
// uiStyle). Quem decide o que cada linha muda é o PauseMenu.

import { t } from '@/game/i18n/i18n';
import { getKeyLetter, setKeyCapture, setKeyCode, type BoundAction } from '@/game/runtime/accessibility';
import type { PauseMenu } from './PauseMenu';

const SLIDER_STEPS = 10;
/** Uma escolha entre valores com nome, ou um nível de 0 a 1. É tudo o que uma opção pode ser. */
export type OptionDef =
  | { kind: 'choice'; label: string; values: { text: () => string; apply: () => void; active: () => boolean }[] }
  | { kind: 'level'; label: string; read: () => number; write: (v: number) => void; release?: () => void }
  | { kind: 'key'; label: string; action: BoundAction };
/** Uma linha viva da lista de opções: quem a move (teclado, mouse ou dedo) chama a mesma coisa. */
export type OptionRow = {
  el: HTMLElement;
  /** Seta para a esquerda (-1) ou para a direita (+1). */
  step: (direction: number) => void;
  /** Enter/Z: a escolha gira; o nível não faz nada (é setas ou arrasto). */
  activate: () => void;
  refresh: () => void;
};

/** O que PauseRows usa de PauseMenu. */
export type PauseRowsHost = Pick<PauseMenu,
  'rows' | 'waitingKey'
>;

export class PauseRows {
  public constructor(private readonly host: PauseRowsHost) {}

  public rowEl(label: string): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'zh-pause-row';
    const name = document.createElement('span');
    name.textContent = t(label);
    el.appendChild(name);
    return el;
  }

  public choiceRow(def: Extract<OptionDef, { kind: 'choice' }>): OptionRow {
    const el = this.rowEl(def.label);
    const value = document.createElement('span');
    value.className = 'zh-pause-value';
    const text = document.createElement('b');
    const arrow = (glyph: string, direction: number): HTMLButtonElement => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'zh-pause-arrow';
      btn.textContent = glyph;
      btn.setAttribute('aria-label', glyph === '<' ? t('pause.previous') : t('pause.next'));
      btn.addEventListener('click', (event) => { event.stopPropagation(); row.step(direction); });
      return btn;
    };
    const current = (): number => Math.max(0, def.values.findIndex((v) => v.active()));
    const row: OptionRow = {
      el,
      step: (direction) => {
        const n = def.values.length;
        def.values[(current() + direction + n) % n].apply();
        row.refresh();
      },
      activate: () => row.step(1),
      refresh: () => { text.textContent = def.values[current()].text(); },
    };
    value.append(arrow('<', -1), text, arrow('>', 1));
    el.appendChild(value);
    // A linha inteira é alvo: o dedo não precisa acertar a seta.
    el.addEventListener('click', () => row.step(1));
    el.style.cursor = 'pointer';
    return row;
  }

  public levelRow(def: Extract<OptionDef, { kind: 'level' }>): OptionRow {
    const el = this.rowEl(def.label);
    const bar = document.createElement('div');
    bar.className = 'zh-pause-blocks';
    bar.setAttribute('role', 'slider');
    bar.setAttribute('aria-label', t(def.label));
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    const blocks = Array.from({ length: SLIDER_STEPS }, () => bar.appendChild(document.createElement('i')));
    el.appendChild(bar);
    const refresh = (): void => {
      const level = Math.round(def.read() * SLIDER_STEPS);
      blocks.forEach((block, i) => block.classList.toggle('zh-full', i < level));
      bar.setAttribute('aria-valuenow', String(level * SLIDER_STEPS));
    };
    const setLevel = (level: number): void => {
      def.write(Math.max(0, Math.min(SLIDER_STEPS, level)) / SLIDER_STEPS);
      refresh();
    };
    const fromPointer = (event: PointerEvent): void => {
      const rect = bar.getBoundingClientRect();
      setLevel(Math.round(((event.clientX - rect.left) / rect.width) * SLIDER_STEPS));
    };
    bar.addEventListener('pointerdown', (event) => {
      bar.setPointerCapture(event.pointerId);
      fromPointer(event);
    });
    bar.addEventListener('pointermove', (event) => { if (bar.hasPointerCapture(event.pointerId)) fromPointer(event); });
    bar.addEventListener('pointerup', () => def.release?.());
    return {
      el,
      step: (direction) => {
        setLevel(Math.round(def.read() * SLIDER_STEPS) + direction);
        def.release?.();
      },
      activate: () => { /* nível não gira */ },
      refresh,
    };
  }

  public keyRow(def: Extract<OptionDef, { kind: 'key' }>): OptionRow {
    const el = this.rowEl(def.label);
    const value = document.createElement('b');
    value.className = 'zh-pause-value';
    el.appendChild(value);
    const row: OptionRow = {
      el,
      step: () => { /* a tecla não tem anterior nem próxima */ },
      activate: () => {
        value.textContent = t('pause.pressKey');
        setKeyCapture(true);
        this.host.waitingKey = (code) => {
          this.host.waitingKey = undefined;
          setKeyCapture(false);
          if (code) setKeyCode(def.action, code);
          // Trocar pode inverter com a outra tecla, então todas as linhas se redesenham.
          this.host.rows.forEach((r) => r.refresh());
        };
      },
      refresh: () => { value.textContent = getKeyLetter(def.action); },
    };
    el.addEventListener('click', () => row.activate());
    el.style.cursor = 'pointer';
    return row;
  }
}

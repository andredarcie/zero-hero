import { getSoundManager } from '@/game/audio/SoundManager';
import { t, tLines } from '@/game/i18n/i18n';
import { BOOK_FONT, HAND_FONT } from '@/game/runtime/uiStyle';

/** Quanto os nomes levam para atravessar a tela, de baixo até sumir em cima. */
export const CREDITS_SCROLL_MS = 26000;
/** "The End" assenta depois do escuro, e a música do menu volta junto. */
const THE_END_AT_MS = 2600;
/** Os nomes começam a subir (e só daqui em diante uma tecla pula). */
const ROLL_AT_MS = 7200;
/** A tela some antes de o título voltar. */
const FADE_OUT_MS = 1200;

/**
 * OS CRÉDITOS. Uma tela DOM por cima de tudo (o texto em serifa nítida, como o diálogo): o quadro escurece, "The End"
 * assenta, os nomes sobem devagar, e no fim `onDone` roda (a cena volta ao título). Uma tecla, depois que os nomes
 * começam a subir, pula para o fim.
 */
export class CreditsRoll {
  private readonly root: HTMLDivElement;
  private went = false;
  private skippable = false;
  private readonly timers: number[] = [];
  private readonly onKey = (event: KeyboardEvent): void => {
    if (!this.skippable) return;
    event.preventDefault();
    this.finish();
  };

  public constructor(private readonly onDone: () => void) {
    const root = document.createElement('div');
    root.className = 'zh-credits';
    root.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:60', 'background:#000', 'opacity:0',
      'transition:opacity 2.4s ease', 'display:flex', 'flex-direction:column', 'align-items:center',
      'overflow:hidden', `font-family:${BOOK_FONT}`, 'color:#e7dcc4',
    ].join(';');
    const end = document.createElement('div');
    end.textContent = t('ending.theEnd');
    // "The End" é escrito a pena, como a última linha do caderno do herói (ver uiStyle).
    end.style.cssText = `position:absolute;top:40%;width:100%;text-align:center;font-family:${HAND_FONT};`
      + 'font-size:clamp(26px,5.4vw,58px);line-height:1.6;opacity:0;transition:opacity 2.2s ease;';
    const roll = document.createElement('div');
    roll.style.cssText = 'position:absolute;top:100%;width:100%;text-align:center;line-height:1.9;'
      + 'font-size:clamp(14px,2.4vw,22px);';
    for (const line of tLines('ending.credits')) {
      const p = document.createElement('div');
      p.textContent = line.text;
      if (line.speaker === 'narrator') p.style.cssText = 'color:#a89c7e;font-size:0.8em;margin-top:1.4em;font-variant:small-caps;letter-spacing:0.05em;';
      else p.style.cssText = 'color:#e7dcc4;';
      roll.appendChild(p);
    }
    root.append(end, roll);
    document.body.appendChild(root);
    this.root = root;
    requestAnimationFrame(() => { root.style.opacity = '1'; });

    window.addEventListener('keydown', this.onKey, true);
    this.later(THE_END_AT_MS, () => { end.style.opacity = '1'; getSoundManager().startMusic('menu', 3000); });
    this.later(ROLL_AT_MS, () => {
      end.style.opacity = '0';
      this.skippable = true;
      roll.style.transition = `top ${CREDITS_SCROLL_MS}ms linear`;
      roll.style.top = '-120%';
    });
    this.later(ROLL_AT_MS + CREDITS_SCROLL_MS + 1500, () => this.finish());
  }

  /** A tela inteira, para quem precisa olhar (o teste, o depurador). */
  public get element(): HTMLDivElement {
    return this.root;
  }

  /** Tira a tela na hora, sem fade e sem `onDone` (a cena saiu por outro caminho). */
  public remove(): void {
    this.went = true;
    this.stop();
    this.root.remove();
  }

  private finish(): void {
    if (this.went) return;
    this.went = true;
    window.removeEventListener('keydown', this.onKey, true);
    this.root.style.opacity = '0';
    getSoundManager().stopMusic();
    getSoundManager().stopAmbience();
    this.later(FADE_OUT_MS, () => {
      this.root.remove();
      this.onDone();
    });
  }

  private later(ms: number, fn: () => void): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private stop(): void {
    window.removeEventListener('keydown', this.onKey, true);
    for (const id of this.timers) window.clearTimeout(id);
    this.timers.length = 0;
  }
}

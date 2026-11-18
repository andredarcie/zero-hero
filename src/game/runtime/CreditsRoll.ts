import { getSoundManager } from '@/game/audio/SoundManager';
import { t, tLines } from '@/game/i18n/i18n';
import { ENDING_SCREEN, splitEpigraph } from '@/game/runtime/endingScreen';
import { BOOK_FONT, HAND_FONT } from '@/game/runtime/uiStyle';

/** Quanto os nomes levam para atravessar a tela, de baixo até sumir em cima. */
export const CREDITS_SCROLL_MS = 26000;
/** A tela some antes de `onDone`. */
const FADE_OUT_MS = 1200;
/** A tinta das pequenas coisas: o ouro do fogo, sobre o creme do resto da frase. */
const SMALL_THINGS_INK = '#f2c46d';

/**
 * OS CRÉDITOS. Uma tela DOM por cima de tudo: o quadro escurece; a frase das pequenas coisas aparece, o resto dela
 * apaga devagar e só elas ficam, até apagarem também; "The End" assenta; os nomes sobem devagar; e no fim `onDone`
 * roda. A ordem e os tempos são os de `ENDING_SCREEN`. Uma tecla, depois que os nomes começam a subir, pula para o fim.
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
    const epigraph = this.buildEpigraph();
    const end = document.createElement('div');
    end.className = 'zh-credits-end';
    end.textContent = t('ending.theEnd');
    // "The End" é escrito a pena, como a última linha do caderno do herói (ver uiStyle).
    end.style.cssText = `position:absolute;top:40%;width:100%;text-align:center;font-family:${HAND_FONT};`
      + `font-size:clamp(26px,5.4vw,58px);line-height:1.6;opacity:0;transition:opacity ${ENDING_SCREEN.theEndMs}ms ease;`;
    const roll = this.buildRoll();
    root.append(epigraph, end, roll);
    document.body.appendChild(root);
    this.root = root;
    requestAnimationFrame(() => { root.style.opacity = '1'; });

    window.addEventListener('keydown', this.onKey, true);
    const plain = Array.from(epigraph.querySelectorAll<HTMLElement>('span:not([data-strong])'));
    this.later(ENDING_SCREEN.phraseIn, () => { epigraph.style.opacity = '1'; });
    // O resto da frase apaga devagar; as pequenas coisas ficam onde estavam, sozinhas.
    this.later(ENDING_SCREEN.restOut, () => { for (const span of plain) span.style.opacity = '0'; });
    this.later(ENDING_SCREEN.smallOut, () => {
      epigraph.style.transition = `opacity ${ENDING_SCREEN.smallOutMs}ms ease`;
      epigraph.style.opacity = '0';
    });
    this.later(ENDING_SCREEN.theEnd, () => { end.style.opacity = '1'; getSoundManager().music.startMusic('menu', 3000); });
    this.later(ENDING_SCREEN.roll, () => {
      end.style.opacity = '0';
      this.skippable = true;
      // Sobe a tela inteira mais a lista inteira: com qualquer número de nomes, o último passa todo antes do fim.
      const travel = root.clientHeight + roll.offsetHeight;
      roll.style.transition = `transform ${CREDITS_SCROLL_MS}ms linear`;
      roll.style.transform = `translateY(${-travel}px)`;
    });
    this.later(ENDING_SCREEN.roll + CREDITS_SCROLL_MS + 1500, () => this.finish());
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

  /** A frase das pequenas coisas, escrita a pena como o "Fim": o destaque em negrito e no ouro do fogo. */
  private buildEpigraph(): HTMLDivElement {
    const epigraph = document.createElement('div');
    epigraph.className = 'zh-credits-epigraph';
    epigraph.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:min(880px,86vw);'
      + `text-align:center;font-family:${HAND_FONT};font-weight:400;font-size:clamp(22px,4.2vw,46px);line-height:1.35;`
      + `color:#d9ccb0;opacity:0;transition:opacity ${ENDING_SCREEN.phraseInMs}ms ease;`;
    for (const part of splitEpigraph(t('ending.epigraph'))) {
      const span = document.createElement('span');
      span.textContent = part.text;
      if (part.strong) {
        span.dataset.strong = '';
        span.style.cssText = `font-weight:700;color:${SMALL_THINGS_INK};`;
      } else {
        span.style.cssText = `transition:opacity ${ENDING_SCREEN.restOutMs}ms ease;`;
      }
      epigraph.appendChild(span);
    }
    return epigraph;
  }

  /** Os nomes, de pé embaixo da tela até a hora de subir: os títulos de seção em versalete, os nomes em creme. */
  private buildRoll(): HTMLDivElement {
    const roll = document.createElement('div');
    roll.className = 'zh-credits-roll';
    roll.style.cssText = 'position:absolute;top:100%;width:100%;text-align:center;line-height:1.9;'
      + 'font-size:clamp(14px,2.4vw,22px);';
    for (const line of tLines('ending.credits')) {
      const p = document.createElement('div');
      p.textContent = line.text;
      if (line.speaker === 'narrator') p.style.cssText = 'color:#a89c7e;font-size:0.8em;margin-top:1.4em;font-variant:small-caps;letter-spacing:0.05em;';
      else p.style.cssText = 'color:#e7dcc4;';
      roll.appendChild(p);
    }
    return roll;
  }

  private finish(): void {
    if (this.went) return;
    this.went = true;
    window.removeEventListener('keydown', this.onKey, true);
    this.root.style.opacity = '0';
    getSoundManager().music.stopMusic();
    getSoundManager().ambience.stopAmbience();
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

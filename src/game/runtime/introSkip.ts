/**
 * O PEDIDO DE PULAR A ABERTURA. O primeiro toque só mostra a tarja ("aperte de novo para pular"); o segundo, dentro da
 * janela da tarja e depois de um respiro (um toque duplo sem querer não pula nada), pula. Passada a janela, o próximo
 * toque é de novo o primeiro.
 */

/** Quanto a tarja fica na tela, esperando o segundo toque. */
export const INTRO_SKIP_WINDOW_MS = 3500;
/** O respiro entre os dois toques. */
export const INTRO_SKIP_GAP_MS = 350;
/** As teclas que pedem para pular (no toque, qualquer toque na tela). */
export const INTRO_SKIP_CODES: readonly string[] = ['KeyZ', 'KeyJ', 'Space', 'Enter', 'Escape'];

export type IntroSkipVerdict = 'hint' | 'skip' | 'wait';

export class IntroSkipGate {
  private shownAt = -Infinity;

  public constructor(private readonly now: () => number) {}

  /** Um toque: 'hint' = mostrar a tarja, 'skip' = pular, 'wait' = cedo demais depois da tarja (nada). */
  public press(): IntroSkipVerdict {
    const now = this.now();
    const since = now - this.shownAt;
    if (since >= INTRO_SKIP_WINDOW_MS) {
      this.shownAt = now;
      return 'hint';
    }
    return since >= INTRO_SKIP_GAP_MS ? 'skip' : 'wait';
  }
}

/**
 * O FPS FIXO NA TELA — pequeno, no canto, sempre ligado.
 *
 * Não é o profiler (esse é o F3, e só mede quando aberto). Este é o termômetro de bolso: ele conta
 * quadros e guarda o PIOR intervalo da janela, e é isso que o separa de um contador comum — a
 * média de 60 fps esconde um tranco de 200ms, e o tranco é o que o jogador sente. Quando um quadro
 * passa de 25ms na janela, o número ganha um "▼" com o pior tempo ao lado.
 *
 * Barato por construção: dois números por quadro (o relógio e o máximo) e um `textContent`
 * reescrito duas vezes por segundo, só quando o texto muda. Nada de canvas, nada de alocação.
 */

const ROOT_ID = 'zh-fps';
const WINDOW_MS = 500;
/** Um quadro mais lento que isto é um tranco perceptível (um quadro e meio perdido a 60Hz). */
const HITCH_MS = 25;

const STYLE = `
#${ROOT_ID} {
  position: fixed;
  top: calc(6px + env(safe-area-inset-top, 0px));
  left: calc(8px + env(safe-area-inset-left, 0px));
  z-index: 40; pointer-events: none; user-select: none;
  font: 10px/1 ui-monospace, Consolas, monospace; letter-spacing: 0.02em;
  color: rgba(216, 209, 192, 0.55); text-shadow: 0 1px 1px rgba(0, 0, 0, 0.7);
}
#${ROOT_ID}.zh-fps-warn { color: rgba(255, 190, 90, 0.85); }
#${ROOT_ID}.zh-fps-bad { color: rgba(255, 110, 100, 0.9); }
`;

export class FpsCounter {
  private readonly el: HTMLDivElement;
  private readonly style: HTMLStyleElement;
  private windowStart = 0;
  private frames = 0;
  private last = 0;
  private worstMs = 0;
  private shown = '';

  /**
   * Quem vê o contador: o build de desenvolvimento sempre; o publicado só com `?fps` (ou `?prof`,
   * o profiler) na URL. Para o jogador ele era um número de depuração no canto da tela — e quem
   * precisa medir a máquina dele ainda tem o caminho, sem que todo mundo carregue o número.
   */
  public static wanted(): boolean {
    if (import.meta.env.DEV) return true;
    try {
      const q = new URLSearchParams(window.location.search);
      return q.has('fps') || q.has('prof');
    } catch {
      return false;
    }
  }

  public constructor() {
    this.style = document.createElement('style');
    this.style.textContent = STYLE;
    document.head.appendChild(this.style);
    this.el = document.createElement('div');
    this.el.id = ROOT_ID;
    this.el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.el);
  }

  /** Um quadro foi desenhado. `now` em ms (performance.now). */
  public tick(now: number): void {
    if (this.last > 0) {
      const dt = now - this.last;
      if (dt > this.worstMs) this.worstMs = dt;
    }
    this.last = now;
    if (this.windowStart === 0) {
      this.windowStart = now;
      return;
    }
    this.frames += 1;
    const span = now - this.windowStart;
    if (span < WINDOW_MS) return;

    const fps = Math.round((this.frames * 1000) / span);
    const hitch = this.worstMs > HITCH_MS;
    const text = hitch ? `${fps} fps ▼${Math.round(this.worstMs)}ms` : `${fps} fps`;
    if (text !== this.shown) {
      this.el.textContent = text;
      this.shown = text;
    }
    const cls = fps < 30 || this.worstMs > 100 ? 'zh-fps-bad' : fps < 55 || hitch ? 'zh-fps-warn' : '';
    if (this.el.className !== cls) this.el.className = cls;
    this.windowStart = now;
    this.frames = 0;
    this.worstMs = 0;
  }

  /**
   * O jogo parou de desenhar de propósito (pausa, aba escondida): o primeiro quadro depois disso
   * não é um tranco, é a volta. Sem isto, todo despausar acenderia um "▼4000ms" mentiroso.
   */
  public resync(): void {
    this.last = 0;
    this.windowStart = 0;
    this.frames = 0;
    this.worstMs = 0;
  }

  public destroy(): void {
    this.el.remove();
    this.style.remove();
  }
}

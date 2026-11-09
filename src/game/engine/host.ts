/**
 * O LUGAR ONDE O MOTOR RODA. O motor não toca no navegador direto: tudo o que ele precisa de fora — o relógio, o
 * próximo quadro, um canvas, uma imagem, um arquivo, o desenho na GPU e a página (teclado, mouse, foco, tamanho) — ele
 * pede a este anfitrião, que chega pela config (`new Game({ host })`). Sem `host`, vale o do navegador
 * (`browserHost.ts`), que faz exatamente as chamadas que o motor sempre fez.
 *
 * Um anfitrião sem `page` roda sem página (nada é ouvido do teclado nem mostrado), e um `createRenderer` que devolve
 * `null` roda sem GPU (o quadro anda inteiro, só não desenha). É assim que os testes sobem o motor no Node.
 */
import type { Game } from './game';
import type { Renderer } from './renderer';

/** O retângulo de um elemento na página, em pixels CSS (o `getBoundingClientRect`). */
export interface PageRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Quem é avisado quando a aba esconde/aparece e a janela perde/ganha o foco. */
export interface VisibilityHandlers {
  hidden(): void;
  visible(): void;
  blur(): void;
  focus(): void;
}

/** A página onde o jogo mora: o DOM em volta do canvas. */
export interface EnginePage {
  /** A tela é de toque. */
  readonly touch: boolean;
  /** É um Mac (ctrl + clique vira o botão direito). */
  readonly mac: boolean;
  /** É Android (o carregador baixa menos arquivos de uma vez). */
  readonly android: boolean;
  /** Chama `boot` quando a página está pronta (na hora, se já estiver). */
  whenReady(boot: () => void): void;
  /** Põe o canvas do jogo no pai pedido (ou no corpo da página), sem suavização em pixel art. */
  mountCanvas(canvas: HTMLCanvasElement, parent: string | HTMLElement | undefined, pixelated: boolean): void;
  /** O elemento-pai do jogo, para medir (o corpo da página se o pedido não existir). */
  resolveParent(parent: string | HTMLElement | undefined): HTMLElement | null;
  /** O retângulo de um elemento (ou do canvas) na página. */
  rect(element: HTMLElement | HTMLCanvasElement): PageRect & { readonly x: number; readonly y: number };
  /** Quanto a página está rolada (`x`, `y`) e a borda do documento (`clientLeft`, `clientTop`). */
  scrollOffset(): { x: number; y: number; clientLeft: number; clientTop: number };
  /** Ouve o `resize` e o `orientationchange` da janela; devolve quem desliga. */
  onResize(resize: () => void, orientation: () => void): () => void;
  watchVisibility(handlers: VisibilityHandlers): void;
  /** Dá o foco à janela do jogo. */
  focus(): void;
  /** Onde o teclado é ouvido (a janela). */
  readonly keyboardTarget: EventTarget;
  /** Onde o mouse e o toque são ouvidos: o próprio canvas. */
  pointerTarget(canvas: HTMLCanvasElement): EventTarget;
  /** Ouve na janela de cima (o jogo pode estar num iframe, como no itch); sem acesso a ela, na própria. */
  addTopListener(type: string, listener: (event: Event) => void, options: AddEventListenerOptions): void;
  /** O elemento sob um ponto da tela (o toque que sai do canvas). */
  elementFromPoint(x: number, y: number): unknown;
  /** O cursor do mouse sobre o canvas. */
  setCursor(canvas: HTMLCanvasElement, cursor: string): void;
}

export interface EngineHost {
  /** O relógio monotônico, em milissegundos. */
  now(): number;
  /** O relógio de parede, em milissegundos (o das animações, que andam por ele e não pelo quadro). */
  wallNow(): number;
  /** Pede o próximo quadro; devolve o id que o cancela. */
  requestFrame(step: (time: number) => void): number;
  cancelFrame(id: number): void;
  /** Um canvas 2D novo, já com o tamanho. */
  createCanvas(width: number, height: number): HTMLCanvasElement;
  /** Carrega uma imagem (URL ou data URL) e chama um dos dois. */
  loadImage(src: string, onLoad: (image: HTMLImageElement) => void, onError: () => void): void;
  /** O texto de um arquivo (o JSON do carregador); rejeita se a resposta não for OK. */
  fetchText(url: string): Promise<string>;
  /** O desenho 2D na GPU, ou `null` para rodar sem desenhar. */
  createRenderer(game: Game): Renderer | null;
  /** A página; ausente = sem página. */
  readonly page?: EnginePage;
}

/** É um canvas (e não uma imagem): só o canvas tem `getContext`. */
export const isCanvasSource = (source: unknown): source is HTMLCanvasElement =>
  typeof (source as { getContext?: unknown } | null)?.getContext === 'function';

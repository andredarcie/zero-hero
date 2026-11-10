import { t } from '@/game/i18n/i18n';
import { getCameraZoom, setCameraZoom, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP } from '@/game/runtime/graphicsSettings';
import { KEY_BORDER, KEY_GLYPH, PIXEL_FONT, pixelFrame } from '@/game/runtime/uiStyle';

/**
 * A RÉGUA DE ZOOM (pedido do autor: "um slider para aumentar ou diminuir o zoom do jogo"; depois, que ela não
 * ficasse na HUD e sim nas opções, por cima do jogo parado — ver ZoomSetup).
 *
 * Mora na borda direita, no meio da altura. É do material de PIXEL (a tecla do mundo, ver uiStyle): o "+" em cima
 * aproxima, o "−" embaixo afasta, e o pomo corre entre os dois — em cima é perto. Embaixo, o NÚMERO de referência:
 * o zoom em porcentagem, 100% sendo o enquadramento de fábrica; para ele cair sempre redondo, os botões andam de 10
 * em 10% e o arrasto encaixa de 5 em 5%. Por último, o OK, que devolve as opções.
 *
 * `data-zh-ui`: tocar na régua não pode virar arrasto de andar (ver TouchSteer). O valor mora em graphicsSettings
 * (sobrevive à partida); cada mudança avisa `onChange`, e quem abriu a régua redesenha o quadro.
 */

const STYLE_ID = 'zh-zoom-style';
const ROOT_ID = 'zh-zoom';
/** Metade do pomo, em pixels de tela: o centro dele anda entre as duas pontas do trilho, sem sair. */
const KNOB_HALF = 10;

/** O "+" e o "−" em pixel art (8×8), como a mão do botão A. */
const glyph = (rects: string): string => `<svg viewBox="0 0 8 8" width="16" height="16" shape-rendering="crispEdges" aria-hidden="true" fill="currentColor">${rects}</svg>`;
const PLUS_SVG = glyph('<rect x="3" y="1" width="2" height="6"/><rect x="1" y="3" width="6" height="2"/>');
const MINUS_SVG = glyph('<rect x="1" y="3" width="6" height="2"/>');

const CSS = `
#${ROOT_ID} {
  position: fixed; top: 50%; transform: translateY(-50%);
  right: calc(14px + env(safe-area-inset-right, 0px));
  z-index: 61;
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  user-select: none; -webkit-user-select: none; touch-action: none;
}
#${ROOT_ID} button {
  /* 32 = 8 pixels de arte × 4: a tecla de pixel só fica nítida em múltiplo inteiro da grade. */
  width: 32px; height: 32px; padding: 0; border: 0; border-radius: 0; cursor: pointer;
  display: flex; align-items: center; justify-content: center; color: ${KEY_GLYPH};
  background: ${pixelFrame(8, 'rgba(36, 29, 15, 0.8)', KEY_BORDER, 1)} center / 100% 100% no-repeat;
  image-rendering: pixelated; -webkit-tap-highlight-color: transparent; touch-action: manipulation;
}
#${ROOT_ID} button:active { transform: translateY(2px); filter: brightness(1.3); }
#${ROOT_ID} button:disabled { opacity: 0.4; cursor: default; transform: none; filter: none; }
#${ROOT_ID} .zh-zoom-track { position: relative; width: 32px; height: 160px; cursor: pointer; }
/* O trilho: a mesma paleta da tecla (fundo escuro, borda amarela), em canto reto. */
#${ROOT_ID} .zh-zoom-track::before {
  content: ''; position: absolute; left: 13px; top: 0; bottom: 0; width: 6px;
  background: rgba(36, 29, 15, 0.8); box-shadow: 0 0 0 2px ${KEY_BORDER};
}
#${ROOT_ID} .zh-zoom-knob {
  position: absolute; left: 6px; width: ${KNOB_HALF * 2}px; height: ${KNOB_HALF * 2}px;
  top: calc(${KNOB_HALF}px + (1 - var(--f, 0.333)) * (100% - ${KNOB_HALF * 2}px)); margin-top: -${KNOB_HALF}px;
  background: ${pixelFrame(10, KEY_GLYPH, KEY_BORDER, 1)} center / 100% 100% no-repeat;
  image-rendering: pixelated; pointer-events: none;
}
/* O número e o OK: a letra de pixel da tecla (8 px é a grade da fonte). */
#${ROOT_ID} .zh-zoom-value {
  min-width: 40px; margin-top: 4px; padding: 4px 4px 3px; text-align: center;
  font-family: ${PIXEL_FONT}; font-size: 8px; line-height: 1; letter-spacing: 0; color: ${KEY_GLYPH};
  background: rgba(36, 29, 15, 0.8); box-shadow: 0 0 0 2px ${KEY_BORDER};
}
#${ROOT_ID} button.zh-zoom-ok {
  width: 48px; height: 48px; margin-top: 10px;
  font-family: ${PIXEL_FONT}; font-size: 10px; line-height: 1; color: ${KEY_BORDER};
  background: ${pixelFrame(12, 'rgba(36, 29, 15, 0.9)', KEY_BORDER, 2)} center / 100% 100% no-repeat;
}
`;

const ensureStyle = (): void => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
};

/** Onde o zoom cai na régua: 0 = o mais longe (embaixo), 1 = o mais perto (em cima). */
const toFraction = (zoom: number): number => (zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN);

/** O zoom como o jogador lê: em porcentagem, 100% sendo o enquadramento de fábrica. */
export const zoomLabel = (zoom: number): string => `${Math.round(zoom * 100)}%`;

/** O passo dos botões cai sempre no próximo múltiplo do passo (de 117% o "+" vai a 120%, não a 127%). */
export const stepZoom = (zoom: number, dir: 1 | -1): number => {
  const grid = Math.round(1 / ZOOM_STEP);
  const at = zoom * grid;
  const from = dir > 0 ? Math.floor(at + 1e-6) : Math.ceil(at - 1e-6);
  return (from + dir) / grid;
};

/** O arrasto encaixa de 5 em 5%. */
const DRAG_GRID = 20;

export interface ZoomSliderCallbacks {
  /** O zoom mudou (já guardado): redesenhar o quadro. */
  onChange?: (zoom: number) => void;
  /** O OK: sem ele, a régua não tem botão de sair. */
  onDone?: () => void;
}

export class ZoomSlider {
  public readonly root: HTMLDivElement;
  public readonly track: HTMLDivElement;
  public readonly zoomIn: HTMLButtonElement;
  public readonly zoomOut: HTMLButtonElement;
  public readonly readout: HTMLDivElement;
  public readonly ok?: HTMLButtonElement;
  private dragging = false;

  public constructor(private readonly cb: ZoomSliderCallbacks = {}) {
    ensureStyle();
    this.root = document.createElement('div');
    this.root.id = ROOT_ID;
    this.root.setAttribute('data-zh-ui', '');
    this.zoomIn = this.makeButton(PLUS_SVG, t('hud.zoomIn'), () => this.step(1));
    this.zoomOut = this.makeButton(MINUS_SVG, t('hud.zoomOut'), () => this.step(-1));
    this.readout = document.createElement('div');
    this.readout.className = 'zh-zoom-value';
    // Quem lê a tela já ouve o valor pela régua (aria-valuetext): o número é para o olho.
    this.readout.setAttribute('aria-hidden', 'true');

    this.track = document.createElement('div');
    this.track.className = 'zh-zoom-track';
    this.track.setAttribute('role', 'slider');
    this.track.setAttribute('aria-orientation', 'vertical');
    this.track.setAttribute('aria-label', t('hud.zoom'));
    this.track.setAttribute('aria-valuemin', String(ZOOM_MIN));
    this.track.setAttribute('aria-valuemax', String(ZOOM_MAX));
    const knob = document.createElement('div');
    knob.className = 'zh-zoom-knob';
    this.track.appendChild(knob);
    this.track.addEventListener('pointerdown', this.onPointerDown);
    this.track.addEventListener('pointermove', this.onPointerMove);
    this.track.addEventListener('pointerup', this.onPointerUp);
    this.track.addEventListener('pointercancel', this.onPointerUp);

    this.root.append(this.zoomIn, this.track, this.zoomOut, this.readout);
    if (cb.onDone) {
      const done = cb.onDone;
      this.ok = this.makeButton('', t('hud.zoomDone'), done);
      this.ok.className = 'zh-zoom-ok';
      this.ok.textContent = t('hud.zoomDone');
      this.root.appendChild(this.ok);
    }
    document.body.appendChild(this.root);
    this.render(getCameraZoom());
  }

  /** Um passo do "+" (1) ou do "−" (-1) — os botões, e as setas de quem abriu a régua. */
  public step(dir: 1 | -1): void {
    this.apply(stepZoom(getCameraZoom(), dir));
  }

  public destroy(): void {
    this.track.removeEventListener('pointerdown', this.onPointerDown);
    this.track.removeEventListener('pointermove', this.onPointerMove);
    this.track.removeEventListener('pointerup', this.onPointerUp);
    this.track.removeEventListener('pointercancel', this.onPointerUp);
    this.root.remove();
  }

  private makeButton(svg: string, label: string, onPress: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.tabIndex = -1;
    button.innerHTML = svg;
    button.setAttribute('aria-label', label);
    // Sem o `mousedown` que viria daqui, o botão nunca ganha foco: as teclas ficam com quem abriu a régua.
    button.addEventListener('pointerdown', (e) => e.preventDefault());
    button.addEventListener('click', onPress);
    return button;
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    e.preventDefault();
    this.dragging = true;
    // O dedo pode sair da régua no meio do arrasto: a captura segura o gesto até ele soltar.
    if (e.pointerId !== undefined) this.track.setPointerCapture?.(e.pointerId);
    this.seek(e.clientY);
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (this.dragging) this.seek(e.clientY);
  };

  private readonly onPointerUp = (): void => {
    this.dragging = false;
  };

  /** O ponto da régua sob o dedo vira zoom: em cima, o mais perto. */
  private seek(clientY: number): void {
    const box = this.track.getBoundingClientRect();
    const span = Math.max(1, box.height - KNOB_HALF * 2);
    const fraction = Math.max(0, Math.min(1, 1 - (clientY - box.top - KNOB_HALF) / span));
    this.apply(Math.round((ZOOM_MIN + fraction * (ZOOM_MAX - ZOOM_MIN)) * DRAG_GRID) / DRAG_GRID);
  }

  private apply(zoom: number): void {
    const before = getCameraZoom();
    const now = setCameraZoom(zoom);
    this.render(now);
    if (now !== before) this.cb.onChange?.(now);
  }

  private render(zoom: number): void {
    this.track.style.setProperty('--f', toFraction(zoom).toFixed(3));
    this.track.setAttribute('aria-valuenow', zoom.toFixed(2));
    this.track.setAttribute('aria-valuetext', zoomLabel(zoom));
    this.readout.textContent = zoomLabel(zoom);
    this.zoomIn.disabled = zoom >= ZOOM_MAX;
    this.zoomOut.disabled = zoom <= ZOOM_MIN;
  }
}

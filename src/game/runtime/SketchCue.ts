import { KEY_BG, KEY_BORDER, KEY_GLYPH, PIXEL_FONT, pixelFrame } from '@/game/runtime/uiStyle';

/**
 * A ETIQUETA DO CADERNO DE DESENHO (pedido do autor, 2026-11-11): perto de um bicho que falta no caderno, aparece
 * embaixo da tela "Desenhar [Z]", e ela some quando ele vai embora. Só isso: um aviso que salta com festa ("Bora!
 * agora você pode desenhar") foi feito e saiu a pedido do autor, porque parecia uma notificação chata.
 *
 * É do MUNDO e da mão, então é PIXEL (uiStyle): a placa escura de borda amarela e canto vazado do keycap, a letra de
 * pixel. Quando o Z está ocupado com outra coisa na frente do herói, ela fica apagada (o Z faria a outra coisa).
 */

const ROOT_ID = 'zh-sketch-cue';

/** O caderninho com o lápis, em pixel (9×9). */
const ICON = [
  '......kk.',
  '.....kyyk',
  'kkkkkyyk.',
  'kwwkyykk.',
  'kwwkyk.k.',
  'kwwkk..k.',
  'kwwwwwwk.',
  'kwwwwwwk.',
  'kkkkkkkk.',
];
const ICON_PAL: Readonly<Record<string, string>> = { k: KEY_BG, w: '#e3d1a4', y: KEY_BORDER };
const iconSvg = (): string => {
  const rects = ICON.flatMap((row, y) => [...row].map((c, x) => (ICON_PAL[c] ? `<rect x="${x}" y="${y}" width="1" height="1" fill="${ICON_PAL[c]}"/>` : '')));
  return `<svg viewBox="0 0 9 9" shape-rendering="crispEdges" aria-hidden="true">${rects.join('')}</svg>`;
};

/* A placa do keycap em borda de verdade, com o canto vazado em degrau (a moldura de pixel esticada engorda a borda
   numa placa comprida). Embaixo, no meio; no celular, acima dos botões A e B. */
const CSS = `
#${ROOT_ID} {
  position: fixed; left: 50%; bottom: calc(64px + env(safe-area-inset-bottom, 0px)); z-index: 44;
  display: flex; align-items: center; gap: 8px; padding: 6px 10px 6px 8px; box-sizing: border-box;
  transform: translate(-50%, 12px); opacity: 0; pointer-events: none;
  background: rgba(36, 29, 15, 0.9); border: 3px solid ${KEY_BORDER}; box-shadow: inset 0 0 0 2px ${KEY_BG};
  clip-path: polygon(3px 0, calc(100% - 3px) 0, 100% 3px, 100% calc(100% - 3px), calc(100% - 3px) 100%, 3px 100%, 0 calc(100% - 3px), 0 3px);
  font-family: ${PIXEL_FONT}; font-size: clamp(11px, 1.4vw, 14px); line-height: 1; color: ${KEY_GLYPH};
  text-shadow: 1px 1px 0 #000; white-space: nowrap;
  transition: transform 180ms ease, opacity 180ms ease, filter 180ms ease;
}
#${ROOT_ID}.zh-on { transform: translate(-50%, 0); opacity: 1; }
#${ROOT_ID}.zh-busy { filter: saturate(0.3) brightness(0.65); opacity: 0.55; }
#${ROOT_ID} .zh-cue-icon { width: 24px; height: 24px; flex: none; }
#${ROOT_ID} .zh-cue-icon svg { display: block; width: 100%; height: 100%; }
#${ROOT_ID} .zh-cue-key {
  display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; flex: none;
  background: ${pixelFrame(11, KEY_BG, KEY_BORDER)} center / 100% 100% no-repeat; color: ${KEY_GLYPH};
}
@media (max-width: 640px) { #${ROOT_ID} { bottom: calc(112px + env(safe-area-inset-bottom, 0px)); } }
`;

export class SketchCue {
  private readonly root: HTMLDivElement;
  private on = false;

  public constructor(private readonly label: string, keyLetter: string) {
    if (!document.getElementById(`${ROOT_ID}-style`)) {
      const style = document.createElement('style');
      style.id = `${ROOT_ID}-style`;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    document.getElementById(ROOT_ID)?.remove();
    this.root = document.createElement('div');
    this.root.id = ROOT_ID;
    this.root.setAttribute('role', 'status');
    const icon = document.createElement('span');
    icon.className = 'zh-cue-icon';
    icon.innerHTML = iconSvg();
    const text = document.createElement('span');
    text.textContent = label;
    const key = document.createElement('span');
    key.className = 'zh-cue-key';
    key.textContent = keyLetter;
    this.root.append(icon, text, key);
    document.body.appendChild(this.root);
  }

  /** Está na tela (a janela dos playtests): o texto que mostra, ou null. */
  public get showing(): string | null {
    return this.on ? this.label : null;
  }

  public show(): void {
    this.on = true;
    this.root.classList.add('zh-on');
  }

  /** O Z está ocupado com outra coisa na frente: a etiqueta fica apagada. */
  public busy(on: boolean): void {
    this.root.classList.toggle('zh-busy', on);
  }

  public hide(): void {
    this.on = false;
    this.root.classList.remove('zh-on', 'zh-busy');
  }

  public destroy(): void {
    this.root.remove();
  }
}

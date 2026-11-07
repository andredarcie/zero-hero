import { t } from '@/game/i18n/i18n';
import { isTouchDevice } from '@/game/runtime/PauseMenu';
import { KEY_BG, KEY_BORDER, KEY_GLYPH, PIXEL_FONT, WOOD_PANEL } from '@/game/runtime/uiStyle';

/**
 * A LEGENDA DOS MINIGAMES (pedido do autor): em todo minigame, no rodapé, uma frase curta diz o que fazer e com
 * que tecla — no computador, a tecla ou o mouse; no celular, o toque. O texto mora no locale, em
 * `minigame.<id>.keys` e `minigame.<id>.touch`; uma tecla no texto vai entre chaves (`{Z}`) e vira a plaquinha de
 * tecla do jogo. Cada minigame troca o `id` conforme a etapa (cortar, limpar, ler a ficha…), ou some com `null`.
 *
 * Mora no `body`, por cima do minigame: o papel da ficha rola, e a legenda não pode rolar junto.
 */

const STYLE_ID = 'zh-mg-caption-style';
const CSS = `
.zh-mg-caption {
  position: fixed; left: 0; right: 0; margin: 0 auto; width: fit-content;
  bottom: max(12px, env(safe-area-inset-bottom));
  z-index: 100000; max-width: min(92vw, 760px); box-sizing: border-box;
  padding: 8px 16px 9px; text-align: center; pointer-events: none;
  ${WOOD_PANEL}
  font-family: ${PIXEL_FONT}; font-size: clamp(13px, 1.9vw, 18px); line-height: 1.45;
}
.zh-mg-caption .zh-mg-key {
  display: inline-block; min-width: 1.4em; padding: 0 0.35em; margin: 0 0.1em;
  background: ${KEY_BG}; border: 2px solid ${KEY_BORDER}; border-radius: 3px; color: ${KEY_GLYPH};
  line-height: 1.25; text-align: center;
}
`;

export class MinigameCaption {
  private readonly el: HTMLDivElement;
  private current: string | null = null;

  public constructor() {
    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    this.el = document.createElement('div');
    this.el.className = 'zh-mg-caption';
    this.el.setAttribute('data-zh-ui', '');
    this.el.style.display = 'none';
    document.body.appendChild(this.el);
  }

  /** A frase da etapa (`minigame.<id>`), ou nenhuma. Chamar de novo com o mesmo id não faz nada. */
  public show(id: string | null): void {
    if (id === this.current) return;
    this.current = id;
    if (!id) {
      this.el.style.display = 'none';
      return;
    }
    const text = t(`minigame.${id}.${isTouchDevice() ? 'touch' : 'keys'}`);
    this.el.replaceChildren(...text.split(/(\{[^}]+\})/u).filter(Boolean).map((part) => {
      const key = /^\{([^}]+)\}$/u.exec(part);
      if (!key) return document.createTextNode(part);
      const chip = document.createElement('span');
      chip.className = 'zh-mg-key';
      chip.textContent = key[1];
      return chip;
    }));
    this.el.style.display = '';
  }

  /** A frase que está na tela agora (a janela do playtest). */
  public get text(): string {
    return this.el.style.display === 'none' ? '' : this.el.textContent ?? '';
  }

  public destroy(): void {
    this.el.remove();
  }
}

import { t } from '@/game/i18n/i18n';

/**
 * A BOLSA — a mochila aberta COM O JOGO RODANDO.
 *
 * A subtela do ESC (`SubScreen`) congela o mundo: ela e o Zelda, e continua sendo o lugar dos
 * numeros (coracoes, mapa, contagem). Isto aqui e a outra metade, e ela nasce de uma pergunta
 * diferente: *trocar de item no meio de uma luta*. Congelar o jogo para isso e a saida barata —
 * o preco da troca vira zero, e escolher a ferramenta certa deixa de ser uma decisao com custo.
 *
 * Entao a bolsa NAO pausa nada. O fogo continua andando, a caveira continua vindo, e o heroi
 * fica com os PES PRESOS enquanto folheia (as setas sao da bolsa agora, e os dois botoes
 * desligam junto). E se ele apanhar, a bolsa FECHA na hora — a pancada arranca a mao de dentro
 * dela. E o mesmo contrato de The Last of Us: a mochila e um lugar perigoso de se estar.
 *
 * Tres leis de desenho, e as tres saem disso:
 *
 *   - **Nada de painel — mas NO MEIO DO QUADRO.** Ela ocupa o centro da tela e e grande: a bolsa
 *     e a coisa que voce esta fazendo agora, e uma fileirinha encolhida no rodape lia como HUD.
 *     O que ela NAO tem e moldura: nem caixa, nem titulo, nem borda opaca — so os icones sobre o
 *     mundo e uma FAIXA de sombra que some para cima e para baixo, o suficiente para a pixel art
 *     ler sobre areia clara e nem um pixel a mais. Escurecer a tela inteira diria "o jogo parou",
 *     que e a unica coisa que este modo nao pode dizer; a faixa deixa ver o que se aproxima.
 *   - **Apontar e EQUIPAR sao dois gestos.** O cursor anda para os lados (so para os lados — nao
 *     ha grade, nao ha segunda fileira, nao ha para onde se perder) e a acao confirma. Trocar de
 *     item sem querer, com um bicho em cima, seria pior do que nao trocar.
 *   - **O que esta na mao AGORA tem marca propria** (o ponto ambar). Sem ela, "onde o cursor
 *     esta" e "o que o B usa" viram a mesma coisa na leitura — e sao justamente as duas coisas
 *     que este desenho separou.
 *
 * A fileira desliza sob um cursor quase-parado (uma bobina, nao uma grade que cresce): com
 * quinze itens a mochila continua sendo uma fileira, e o polegar continua tendo dois destinos.
 */

const STYLE_ID = 'zh-bag-style';
const ROOT_ID = 'zh-bag-root';
const BTN_ID = 'zh-bag-btn';
const SERIF = "Georgia, 'Times New Roman', 'Book Antiqua', serif";

/**
 * As medidas da fileira, EM UM LUGAR SO: a CSS as recebe daqui por interpolacao e a conta do
 * deslize (`slide`) usa exatamente as mesmas. Sao a mesma bobina vista de dois lados — um slot com
 * largura diferente da que a aritmetica supoe descentra o cursor, e o erro se acumula slot a slot.
 *
 * A folga da janela (`PAD`) nao e estetica: o `overflow: hidden` que faz a bobina correr corta em
 * silencio o cursor AMPLIADO (`CURSOR_SCALE`) e o ponto de brasa, que mora ABAIXO do slot.
 */
const SLOT_PX = 76;
const GAP_PX = 10;
const CURSOR_SCALE = 1.2;
/** Metade do que o cursor ampliado transborda para cada lado, arredondado para cima. */
const PAD_X = Math.ceil((SLOT_PX * (CURSOR_SCALE - 1)) / 2) + 2;
const PAD_Y = PAD_X + 8; // o transbordo do cursor MAIS o ponto de brasa por baixo

const CSS = `
#${ROOT_ID} {
  position: fixed; inset: 0; z-index: 46; pointer-events: none;
  font-family: ${SERIF};
  opacity: 0; transition: opacity 130ms ease;
}
#${ROOT_ID}.zh-in { opacity: 1; }
/* A FAIXA de sombra, e ela e uma faixa e nao uma tela inteira: a bolsa mora no meio do quadro
   agora, e escurecer a tela toda diria "o jogo parou" — que e a unica coisa que este modo nao pode
   dizer. Ela existe porque a arte e pixel art de 2 a 8 cores e o mundo por baixo pode ser areia
   clara; some para cima e para baixo, entao o que se aproxima do heroi continua visivel. */
#${ROOT_ID} .zh-bag-veil {
  position: absolute; left: 0; right: 0; top: 50%; height: 360px;
  transform: translateY(-50%);
  background: linear-gradient(to bottom,
    rgba(6, 5, 4, 0) 0%, rgba(6, 5, 4, 0.82) 26%,
    rgba(6, 5, 4, 0.82) 74%, rgba(6, 5, 4, 0) 100%);
}
/* NO CENTRO DO QUADRO, nos dois eixos. A entrada sobe 14px e assenta — a bolsa abre macio e fecha
   seco (fechar tambem e o que a pancada faz, e uma pancada nao desvanece). */
#${ROOT_ID} .zh-bag-strip {
  position: absolute; left: 50%; top: 50%;
  transform: translate(-50%, calc(-50% + 14px));
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  max-width: calc(100vw - 1.5em);
  transition: transform 130ms ease;
}
#${ROOT_ID}.zh-in .zh-bag-strip { transform: translate(-50%, -50%); }
#${ROOT_ID} .zh-bag-name {
  color: #e7dcc4; font-size: 23px; letter-spacing: 0.06em; white-space: nowrap;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.95);
  min-height: 1.25em;
}
#${ROOT_ID} .zh-bag-row { display: flex; align-items: center; gap: 6px; }
#${ROOT_ID} .zh-bag-nav {
  width: 40px; height: ${SLOT_PX}px; padding: 0;
  display: flex; align-items: center; justify-content: center;
  background: none; border: 0; color: rgba(216, 209, 192, 0.55);
  font: inherit; font-size: 32px; line-height: 1;
  cursor: pointer; pointer-events: auto; user-select: none;
  -webkit-tap-highlight-color: transparent; touch-action: manipulation;
  transition: color 90ms ease, opacity 110ms ease;
}
#${ROOT_ID} .zh-bag-nav:hover { color: #e7dcc4; }
#${ROOT_ID} .zh-bag-nav.zh-off { opacity: 0.12; pointer-events: none; }
/* A JANELA e a BOBINA: a janela nao cresce, a fileira e que corre por dentro dela. */
#${ROOT_ID} .zh-bag-window {
  overflow: hidden; max-width: min(84vw, 760px);
  padding: ${PAD_Y}px ${PAD_X}px; /* ver PAD_X/PAD_Y: o overflow corta cursor e brasa em silencio */
}
#${ROOT_ID} .zh-bag-track {
  display: flex; align-items: center; gap: ${GAP_PX}px;
  transition: transform 150ms ease;
}
#${ROOT_ID} .zh-bag-slot {
  position: relative; flex: 0 0 auto; width: ${SLOT_PX}px; height: ${SLOT_PX}px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid rgba(216, 209, 192, 0.16); background: rgba(10, 8, 6, 0.5);
  cursor: pointer; pointer-events: auto; user-select: none;
  -webkit-tap-highlight-color: transparent; touch-action: manipulation;
  opacity: 0.5;
  transition: transform 110ms ease, opacity 110ms ease,
              border-color 110ms ease, background 110ms ease;
}
#${ROOT_ID} .zh-bag-slot img {
  width: 78%; height: 78%; object-fit: contain; image-rendering: pixelated;
  pointer-events: none;
}
#${ROOT_ID} .zh-bag-slot.zh-at {
  opacity: 1; transform: scale(${CURSOR_SCALE});
  border-color: #d4c8a4; background: rgba(42, 33, 21, 0.86);
  box-shadow: inset 0 0 0 1px rgba(212, 200, 164, 0.3), 0 6px 22px rgba(0, 0, 0, 0.7);
}
#${ROOT_ID} .zh-bag-count {
  position: absolute; right: 4px; bottom: 2px;
  font-size: 14px; line-height: 1; color: #e7dcc4;
  text-shadow: 0 1px 0 #000, 1px 0 0 #000, -1px 0 0 #000, 0 -1px 0 #000;
  pointer-events: none;
}
/* O QUE ESTA NA MAO: um ponto de brasa sob o slot. Ver o cabecalho — cursor e equipado sao
   duas perguntas, e um desenho so para as duas apagaria a unica coisa que este modo separou. */
#${ROOT_ID} .zh-bag-eq {
  position: absolute; left: 50%; bottom: -9px; transform: translateX(-50%);
  width: 6px; height: 6px; border-radius: 50%;
  background: #e5b558; box-shadow: 0 0 7px rgba(229, 181, 88, 0.9);
  pointer-events: none;
}
#${ROOT_ID} .zh-bag-keys {
  color: rgba(216, 209, 192, 0.42); font-size: 13px; letter-spacing: 0.1em;
  white-space: nowrap;
}
/* O CONFIRMA do dedo. So no toque: no teclado quem confirma e a tecla, e dois desenhos dizendo
   a mesma coisa e mobilia. Ele fecha a fileira pela direita — nunca solto num canto, onde numa
   tela estreita colidiria com os proprios itens. */
#${ROOT_ID} .zh-bag-set {
  width: 68px; height: 68px; margin-left: 10px; padding: 0;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%; border: 1px solid rgba(212, 200, 164, 0.5);
  background: rgba(42, 33, 21, 0.7); color: #e7dcc4;
  cursor: pointer; pointer-events: auto;
  -webkit-tap-highlight-color: transparent; touch-action: manipulation;
  transition: background 90ms ease, color 90ms ease, transform 90ms ease, opacity 110ms ease;
}
#${ROOT_ID} .zh-bag-set:active {
  background: rgba(212, 200, 164, 0.9); color: #241d12; transform: scale(0.93);
}
#${ROOT_ID} .zh-bag-set.zh-off { opacity: 0.15; pointer-events: none; }
/* O botao de bolsa (toque): logo acima do par A/B, no alcance do mesmo polegar. */
#${BTN_ID} {
  position: fixed; z-index: 45;
  right: calc(14px + env(safe-area-inset-right, 0px));
  bottom: calc(98px + env(safe-area-inset-bottom, 0px));
  width: 48px; height: 48px; padding: 0;
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%; cursor: pointer;
  background: rgba(10, 8, 6, 0.34); border: 1px solid rgba(216, 209, 192, 0.32);
  color: rgba(216, 209, 192, 0.72);
  -webkit-tap-highlight-color: transparent; touch-action: manipulation;
  transition: background 90ms ease, color 90ms ease, border-color 90ms ease;
}
#${BTN_ID}.zh-on {
  color: #e5b558; border-color: rgba(229, 181, 88, 0.8); background: rgba(56, 38, 10, 0.6);
}
`;

const ensureStyle = (): void => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
};

export interface QuickBagItem {
  kind: string;
  /** data URL da arte DO JOGO (ver SubScreen.spriteDataUrl) — a bolsa nao tem desenho proprio. */
  icon: string;
  count: number;
  label: string;
}

export interface QuickBagView {
  items: QuickBagItem[];
  /** O item que o B usa AGORA — o ponto de brasa, e nao o cursor. */
  equipped: string;
  emptyLabel: string;
}

export interface QuickBagCallbacks {
  /** Lida a cada desenho, nunca um retrato tirado ao abrir (a mesma lei da subtela). */
  read: () => QuickBagView;
  /** Confirmar: este passa a ser o item do B. So aqui — andar com o cursor nao equipa nada. */
  onSet: (kind: string) => void;
  /**
   * O botao de bolsa foi tocado. Ele NAO chama `toggle()` direto de proposito: quem decide se a
   * bolsa pode abrir agora e a cena (nenhuma tela que ja congelou o mundo pode ganhar uma segunda
   * por cima), e o dedo tem de passar pela mesma porta que o `I` — senao tocar no botao durante um
   * dialogo abriria uma bolsa que a tecla recusaria.
   */
  onToggleRequest: () => void;
  /** A cena precisa saber para prender os pes, calar os dois botoes e sumir com o par A/B. */
  onOpenChange?: (open: boolean) => void;
}

/**
 * A bolsa NAO ESCUTA TECLA NENHUMA, e isso e deliberado: a cena esta VIVA por baixo dela, entao
 * todo teclado continua chegando ao Phaser. Um segundo ouvinte aqui faria cada tecla acontecer
 * DUAS vezes — o X confirmaria o item e, meio milissegundo depois, o mesmo X ja com a bolsa
 * fechada USARIA o item recem-equipado. Quem roteia I / setas / X / ESC e a `GameScene`, num
 * lugar so, antes de decidir o que o heroi faz (ver `GameScene.installActionInput`).
 */
export class QuickBag {
  private readonly root: HTMLDivElement;
  private readonly name: HTMLDivElement;
  private readonly prev: HTMLButtonElement;
  private readonly next: HTMLButtonElement;
  private readonly viewport: HTMLDivElement;
  private readonly track: HTMLDivElement;
  private readonly keys: HTMLDivElement;
  private readonly setBtn: HTMLButtonElement;
  private readonly toggleBtn?: HTMLButtonElement;

  private open = false;
  private destroyed = false;
  /** O kind sob o cursor. Vazio = mochila vazia. */
  private cursor = '';
  /** O indice do cursor no ultimo desenho — a rede para o item que sumiu debaixo dele. */
  private cursorAt = 0;

  public constructor(private readonly cb: QuickBagCallbacks, touch: boolean) {
    ensureStyle();

    this.root = document.createElement('div');
    this.root.id = ROOT_ID;
    // Ver ActionButtons: o andar por toque escuta `touchstart` na JANELA, entao sem esta marca
    // tocar num slot tambem plantaria a ancora do arrasto.
    this.root.setAttribute('data-zh-ui', '');
    this.root.style.display = 'none';

    const veil = document.createElement('div');
    veil.className = 'zh-bag-veil';

    const strip = document.createElement('div');
    strip.className = 'zh-bag-strip';

    this.name = document.createElement('div');
    this.name.className = 'zh-bag-name';

    const row = document.createElement('div');
    row.className = 'zh-bag-row';

    this.prev = this.navButton('‹', -1);
    this.next = this.navButton('›', 1);

    this.viewport = document.createElement('div');
    this.viewport.className = 'zh-bag-window';
    this.track = document.createElement('div');
    this.track.className = 'zh-bag-track';
    this.viewport.appendChild(this.track);

    this.setBtn = document.createElement('button');
    this.setBtn.type = 'button';
    this.setBtn.className = 'zh-bag-set';
    this.setBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">'
      + '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.4"'
      + ' stroke-linecap="round" stroke-linejoin="round"/></svg>';
    this.setBtn.addEventListener('click', () => this.commit());
    if (!touch) this.setBtn.style.display = 'none';

    row.append(this.prev, this.viewport, this.next);
    if (touch) row.appendChild(this.setBtn);

    this.keys = document.createElement('div');
    this.keys.className = 'zh-bag-keys';
    if (touch) this.keys.style.display = 'none';

    strip.append(this.name, row, this.keys);
    this.root.append(veil, strip);
    document.body.appendChild(this.root);

    if (touch) {
      this.toggleBtn = document.createElement('button');
      this.toggleBtn.id = BTN_ID;
      this.toggleBtn.type = 'button';
      this.toggleBtn.setAttribute('data-zh-ui', '');
      this.toggleBtn.title = t('bag.open');
      this.toggleBtn.innerHTML =
        '<svg viewBox="0 0 24 24" width="23" height="23" aria-hidden="true">'
        + '<path d="M9 5.6V5a3 3 0 0 1 6 0v.6" fill="none" stroke="currentColor" stroke-width="1.7"'
        + ' stroke-linecap="round"/>'
        + '<rect x="4.5" y="5.6" width="15" height="13.9" rx="3.4" fill="none"'
        + ' stroke="currentColor" stroke-width="1.7"/>'
        + '<path d="M9 19.5v-3.7a3 3 0 0 1 6 0v3.7" fill="none" stroke="currentColor"'
        + ' stroke-width="1.7"/></svg>';
      this.toggleBtn.addEventListener('click', () => this.cb.onToggleRequest());
      document.body.appendChild(this.toggleBtn);
    }
  }

  public get isOpen(): boolean {
    return this.open;
  }

  public openBag(): void {
    if (this.open || this.destroyed) return;
    // O cursor SEMPRE comeca no que esta na mao: folhear e sair de onde voce esta, e um cursor
    // que renasce no primeiro slot faria a mochila mentir sobre o que o heroi carrega.
    //
    // A leitura vem ANTES de `open = true` de proposito: se ela explodir (a cena e quem monta a
    // view), a bolsa fica FECHADA em vez de ficar "aberta" com o painel invisivel — um estado que
    // trava o I, o B e os pes do heroi de uma vez so, sem nada na tela dizendo por que.
    this.cursor = this.cb.read().equipped;
    this.open = true;
    this.root.style.display = '';
    this.render();
    this.toggleBtn?.classList.add('zh-on');
    requestAnimationFrame(() => { if (this.open) this.root.classList.add('zh-in'); });
    this.cb.onOpenChange?.(true);
  }

  public close(): void {
    if (!this.open) return;
    this.open = false;
    this.root.classList.remove('zh-in');
    this.root.style.display = 'none';
    this.toggleBtn?.classList.remove('zh-on');
    this.cb.onOpenChange?.(false);
  }

  /** Andar com o cursor: -1 esquerda, +1 direita, SEM dar a volta (ver Inventory.step). */
  public step(delta: number): void {
    if (!this.open) return;
    const items = this.cb.read().items;
    if (items.length === 0) return;
    const at = Math.max(0, Math.min(items.length - 1, this.resolveIndex(items) + delta));
    this.cursor = items[at].kind;
    this.render();
  }

  /** CONFIRMAR: o item sob o cursor passa a ser o do B, e a bolsa fecha. */
  public commit(): void {
    if (!this.open) return;
    if (this.cursor) this.cb.onSet(this.cursor);
    this.close();
  }

  /** Some com o botao enquanto outra tela manda (a pausa, o dialogo, a loja). */
  public setButtonVisible(visible: boolean): void {
    if (this.toggleBtn) this.toggleBtn.style.display = visible ? 'flex' : 'none';
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.open = false;
    this.root.remove();
    this.toggleBtn?.remove();
  }

  // ── desenho ────────────────────────────────────────────────────────────────

  /**
   * Onde o cursor esta na lista de AGORA. A lista pode ter encolhido debaixo dele (o mundo nao
   * parou), entao um kind que sumiu cai no indice que ele ocupava — o mesmo criterio da mochila
   * quando o ultimo item de um tipo acaba: o polegar estava naquela POSICAO.
   */
  private resolveIndex(items: QuickBagItem[]): number {
    const byKind = items.findIndex((it) => it.kind === this.cursor);
    if (byKind >= 0) return byKind;
    return Math.max(0, Math.min(items.length - 1, this.cursorAt));
  }

  private render(): void {
    const view = this.cb.read();
    const { items } = view;

    if (items.length === 0) {
      this.cursor = '';
      this.cursorAt = 0;
      this.track.replaceChildren();
      this.name.textContent = view.emptyLabel;
      this.keys.textContent = t('bag.keysEmpty');
      this.prev.classList.add('zh-off');
      this.next.classList.add('zh-off');
      this.setBtn.classList.add('zh-off');
      return;
    }

    const at = this.resolveIndex(items);
    this.cursorAt = at;
    this.cursor = items[at].kind;

    this.track.replaceChildren();
    items.forEach((item, i) => {
      const slot = document.createElement('div');
      slot.className = i === at ? 'zh-bag-slot zh-at' : 'zh-bag-slot';
      slot.title = item.label;
      slot.setAttribute('data-kind', item.kind);
      const img = document.createElement('img');
      img.src = item.icon;
      img.alt = item.label;
      slot.appendChild(img);
      if (item.count > 1) {
        const count = document.createElement('span');
        count.className = 'zh-bag-count';
        count.textContent = String(item.count);
        slot.appendChild(count);
      }
      if (item.kind === view.equipped) {
        const dot = document.createElement('span');
        dot.className = 'zh-bag-eq';
        slot.appendChild(dot);
      }
      // No dedo, o primeiro toque APONTA e o segundo EQUIPA: manipulacao direta continua sendo
      // dois gestos, como as setas e o confirma — tocar num icone nunca troca o item de uma vez.
      slot.addEventListener('click', () => {
        if (item.kind === this.cursor) { this.commit(); return; }
        this.cursor = item.kind;
        this.render();
      });
      this.track.appendChild(slot);
    });

    this.name.textContent = items[at].label;
    this.keys.textContent = t('bag.keys');
    this.prev.classList.toggle('zh-off', at === 0);
    this.next.classList.toggle('zh-off', at === items.length - 1);
    this.setBtn.classList.remove('zh-off');

    this.slide(at, items.length);
  }

  /**
   * A BOBINA. A janela e fixa e a fileira corre por dentro, com o cursor puxado para o centro e
   * as pontas grudadas nas bordas (`clamp`): sem o clamp, os primeiros itens da mochila viveriam
   * num vazio de meia tela, e o jogador leria isso como "a bolsa esta quebrada".
   *
   * A conta e ARITMETICA e nao medida do DOM: todo slot tem a mesma largura, e medir depois do
   * desenho custaria um reflow sincrono por passo do cursor.
   */
  private slide(at: number, total: number): void {
    const winW = this.viewport.clientWidth - 2 * PAD_X; // `clientWidth` inclui a folga; a fileira nao
    const trackW = total * SLOT_PX + (total - 1) * GAP_PX;
    const centre = at * (SLOT_PX + GAP_PX) + SLOT_PX / 2;
    const tx = trackW <= winW
      ? (winW - trackW) / 2
      : Math.max(Math.min(winW / 2 - centre, 0), winW - trackW);
    this.track.style.transform = `translateX(${Math.round(tx)}px)`;
  }

  private navButton(glyph: string, delta: number): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'zh-bag-nav';
    btn.textContent = glyph;
    btn.addEventListener('click', () => this.step(delta));
    return btn;
  }
}

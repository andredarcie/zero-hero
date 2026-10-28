import { t } from '@/game/i18n/i18n';
import {
  BOOK_FONT, HAND_FONT, INK, PAPER_SURFACE, SOFT_BLUR, WOOD_PANEL, WOOD_TITLE, paperTexture,
} from '@/game/runtime/uiStyle';

/**
 * O CATALOGO DE FABRICACAO — a tela em que o jogador escolhe O QUE QUER, e a estacao passa a
 * responder DO QUE ELE PRECISA.
 *
 * ── Por que ela existe ────────────────────────────────────────────────────────────────────────
 * A caixa de ferramentas era experimento-primeiro: junte dois itens e veja. Esse modelo tem um
 * pre-requisito que este jogo nao tem — um milhao de jogadores contando um ao outro na internet.
 * Sem ele, a caixa e um cadeado de combinacao secreta. Todo jogo de crafting legivel resolveu
 * isso invertendo a direcao (o Recipe Book do Minecraft 1.12, o menu do Stardew, os blueprints do
 * Subnautica): o catalogo mostra TUDO, sempre, e o que voce ainda nao pode fazer aparece apagado
 * com os insumos a vista. **O catalogo E a lista de ambicoes** — e e por isso que ele nunca
 * esconde uma receita por falta de material, que e o erro do Terraria.
 *
 * ── Tres decisoes de desenho ──────────────────────────────────────────────────────────────────
 *   - **A arte e a do jogo.** Cada entrada e o proprio sprite do item (spriteDataUrl), como a
 *     bolsa e a subtela ja fazem. Um catalogo com icones proprios seria uma segunda gramatica
 *     para os mesmos objetos.
 *   - **A divulgacao progressiva guarda o NOME, nunca a FORMA.** Um item que o jogador nunca viu
 *     aparece com a arte apagada e o nome em "?" — a ideia do Recipe Book do Minecraft, mas so
 *     ate onde ela ajuda. Chapar a arte em vulto preto foi tentado e MEDIDO numa tela: onze
 *     cartas de vulto identico, em que achar um item era adivinhar. Numa grade, silhueta e
 *     ruido; o premio por construir e aprender o nome, nao poder enxergar a coisa.
 *   - **Escolher e CONSTRUIR.** Confirmar gasta os insumos da mochila; a estacao manual faz o
 *     produto e o entrega no chao.
 *
 * A tela CONGELA o mundo (a cena para de correr enquanto ela existe, como o dialogo e as cartas
 * de chunk). A bolsa e a unica tela deste jogo que roda com o mundo vivo, e ela e assim porque
 * trocar de item no meio de uma luta precisa custar alguma coisa. Escolher uma receita
 * na frente de uma bancada nao e um gesto de combate.
 */

const STYLE_ID = 'zh-order-style';

const CSS = `
.zh-order-backdrop {
  position: fixed; inset: 0; z-index: 60;
  display: flex; align-items: center; justify-content: center;
  /* A bancada nao para o mundo: ele fica ali, fora de foco (o mesmo embacado da colheita). */
  ${SOFT_BLUR}
  font-family: ${BOOK_FONT};
  opacity: 0; transition: opacity 200ms ease;
  overflow-y: auto; padding: 1.2rem;
}
.zh-order-backdrop.zh-in { opacity: 1; }
.zh-order-panel {
  /* O painel ENCOLHE com o conteúdo. Ele tinha largura fixa de 760px porque a lista era sempre
     grande; com a escada mostrando uma ou duas cartas, a largura fixa virava uma moldura enorme em
     volta de um cartão só — e uma tela com 80% de vazio parece quebrada, não minimalista. */
  width: fit-content;
  min-width: min(320px, 92vw);
  max-width: min(760px, 96vw);
  ${WOOD_PANEL}
  padding: 1.1rem 1.1rem 0.9rem;
  transform: translateY(14px) scale(0.98);
  transition: transform 260ms cubic-bezier(0.2, 0.9, 0.3, 1.15);
}
.zh-order-backdrop.zh-in .zh-order-panel { transform: none; }
.zh-order-title {
  margin: 0 0 1rem; text-align: center;
  ${WOOD_TITLE}
  font-size: 1.3rem;
}
.zh-order-family {
  margin: 0 0 0.5rem; padding-top: 0.2rem;
  ${WOOD_TITLE}
  font-size: 0.95rem; color: #a89c7e;
}
.zh-order-grid {
  /* auto-FIT e nao auto-FILL: com uma carta so, "auto-fill" reserva as colunas vazias e a carta
     fica encolhida num canto de uma grade fantasma. (E crase nao entra aqui: este CSS mora dentro
     de um template literal, e uma delas fecha a string no meio do arquivo.) */
  display: grid; grid-template-columns: repeat(auto-fit, minmax(104px, 116px));
  justify-content: center; gap: 12px 10px; margin: 0 0 1rem;
}
/* A CARTA E UM PEDACO DE PAPEL pregado na tabua (ver uiStyle): o papel da colheita, a pena no
   nome. Sem borda rasgada aqui — o clip-path cortaria a sombra e o contorno de selecao, que sao o
   que a carta precisa mostrar. Cada uma pregada um tico torta. */
.zh-order-card {
  position: relative; display: flex; flex-direction: column; align-items: center; gap: 5px;
  padding: 10px 5px 8px;
  border: 0; border-radius: 1px;
  ${PAPER_SURFACE}
  box-shadow: 0 1px 1px rgba(0, 0, 0, 0.45), 0 4px 10px rgba(0, 0, 0, 0.45);
  cursor: pointer; user-select: none;
  -webkit-tap-highlight-color: transparent; touch-action: manipulation;
  transform: rotate(var(--tilt, 0deg));
  transition: transform 160ms cubic-bezier(0.2, 0.9, 0.3, 1.3), box-shadow 160ms ease, outline-color 120ms ease;
  outline: 2px solid transparent; outline-offset: 3px;
}
.zh-order-card:hover { transform: rotate(var(--tilt, 0deg)) translateY(-2px); }
/* Sob a mao: a carta levanta da tabua, endireita, e ganha o contorno de pergaminho do selecionado. */
.zh-order-card.zh-at {
  outline-color: #d4c8a4; transform: translateY(-4px) rotate(0deg) scale(1.04);
  box-shadow: 0 2px 2px rgba(0, 0, 0, 0.4), 0 12px 22px rgba(0, 0, 0, 0.55);
}
/* PRONTO: os dois insumos estao na mochila agora. Uma brasa em volta do papel — a mesma cor do
   item equipado na bolsa —, nunca um rotulo "craftable". */
.zh-order-card.zh-ready {
  box-shadow: 0 0 0 2px rgba(229, 181, 88, 0.85), 0 0 14px rgba(229, 181, 88, 0.45), 0 4px 10px rgba(0, 0, 0, 0.45);
}
.zh-order-card.zh-ready.zh-at {
  box-shadow: 0 0 0 2px rgba(229, 181, 88, 0.85), 0 0 16px rgba(229, 181, 88, 0.5), 0 12px 22px rgba(0, 0, 0, 0.55);
}
/* RECUSA: faltou material. A carta treme e o painel FICA aberto — a mesma gramatica de recusa
   fisica do resto do jogo, e ficar aberto e o que deixa escolher outra coisa sem reabrir.
   O tranco e MAIOR do que era (3px passavam por "nada aconteceu" numa grade de onze cartas). */
.zh-order-card.zh-deny { animation: zh-order-deny 260ms ease; }
@keyframes zh-order-deny {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-6px); }
  55% { transform: translateX(6px); }
  80% { transform: translateX(-3px); }
}
/* E a recusa APONTA: o insumo que falta acende e incha. Tremer diz "nao da"; so isto diz **o que**
   falta, e diz desenhando — a lei da casa e que uma trava responde com fisica, nunca com legenda.
   Nao usa a brasa de proposito: nesta tela a brasa quer dizer "isto voce tem / a bancada faz", e
   um sinal que se contradiz em duas cartas nao ensina nenhuma. O branco quente e so ATENCAO. */
.zh-order-need.zh-point { animation: zh-order-point 520ms ease; }
.zh-order-need.zh-point img { animation: zh-order-point-art 520ms ease; }
@keyframes zh-order-point {
  0%, 100% { transform: scale(1); }
  35% { transform: scale(1.35); }
}
@keyframes zh-order-point-art {
  0%, 100% { opacity: 0.34; filter: none; }
  35% { opacity: 1; filter: brightness(1.6); }
}
@media (prefers-reduced-motion: reduce) {
  .zh-order-card.zh-deny, .zh-order-need.zh-point, .zh-order-need.zh-point img { animation: none; }
}
.zh-order-art { width: 46px; height: 46px; object-fit: contain; image-rendering: pixelated; }
/* A DIVULGACAO PROGRESSIVA guarda o NOME, nunca a FORMA. A versao anterior chapava a arte em preto
   (brightness zero) e o resultado media-se numa tela: onze cartas identicas de vulto cinza, em que
   achar um item era adivinhar. Numa grade, silhueta e ruido. Agora a arte fica so mais apagada
   — o item continua reconhecivel — e o que espera a primeira fabricacao e o nome.
   O que o jogador ganha por construir e saber COMO SE CHAMA, e nao enxergar o objeto. */
.zh-order-card.zh-unknown .zh-order-art { filter: saturate(0.35) brightness(0.72); opacity: 0.8; }
/* O DEGRAU NOVO. A mesa mostra o que ja foi feito mais UMA coisa — e essa uma tem de se anunciar,
   senao a carta nova se perde no meio das velhas justamente quando ela e a unica novidade. Um
   contorno claro e uma respiracao lenta: nada de texto, e nada que compita com a brasa do
   "zh-ready" (que fala de MOCHILA, nao de progresso) — dentro do CSS nao entra crase. */
.zh-order-card.zh-next::after {
  content: ''; position: absolute; inset: -5px; border: 1px solid #f4e7c8; border-radius: 2px;
  opacity: 0.5; animation: zh-order-step 1.9s ease-in-out infinite; pointer-events: none;
}
@keyframes zh-order-step {
  0%, 100% { opacity: 0.18; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(1.03); }
}
.zh-order-name {
  font-family: ${HAND_FONT}; font-weight: 700; font-size: 1.1rem; color: ${INK}; text-align: center; line-height: 1.1;
  min-height: 1.6em;
}
.zh-order-card.zh-unknown .zh-order-name { opacity: 0.35; }
/* OS INSUMOS, na propria carta: a resposta a "do que eu preciso" aparece aqui. */
.zh-order-needs { display: flex; align-items: center; justify-content: center; gap: 5px; }
.zh-order-need { position: relative; width: 22px; height: 22px; }
.zh-order-need img {
  width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated;
}
/* DOIS EIXOS INDEPENDENTES, e e por isso que os tres estados se leem sem decorar nada:
     · a MOLDURA tracejada responde "eu tenho?" — contorno vazio = ainda nao esta aqui;
     · a COR DA MOLDURA responde "onde se consegue?" — neutra e materia-prima (procure no MUNDO),
       BRASA e coisa que a PROPRIA bancada faz (e aqui mesmo).
   Uma primeira versao separava os tres so por opacidade, e ai "tenho" e "a bancada faz" ficavam
   a um degrau de brilho um do outro — indistinguiveis num cartao cujo insumo custa UM, onde nao
   ha contador para desempatar. Dois eixos, uma pergunta cada. */
.zh-order-need.zh-lack { outline: 1px dashed rgba(60, 38, 18, 0.55); outline-offset: 2px; }
.zh-order-need.zh-lack img { opacity: 0.34; }
/* O SEGUNDO EIXO MORA NA MOLDURA, NAO NA ARTE — e isso foi aprendido derrubando a versao
   anterior. Ali, "a bancada faz" guardava a COR do sprite enquanto "procure no mundo" ia a cinza:
   pode falhar quando um item ja tem uma paleta cinza: o grayscale vira o mesmo pixel. Um sinal
   que depende da paleta da arte quebra quando a
   arte muda. A BRASA na moldura nao depende de nada: e a cor que este jogo ja usa para "isto e
   seu, esta aqui" (o item na mao, o plano pregado). */
.zh-order-need.zh-lack.zh-makeable { outline-color: rgba(196, 128, 30, 0.95); }
.zh-order-need.zh-lack.zh-makeable img { opacity: 0.6; }
/* O CONTADOR so aparece quando ha o que contar (a receita pede mais de um), e entao ele diz
   SEMPRE a mesma coisa: quanto voce tem sobre quanto custa. Um "x2" solto responde "quanto custa"
   e cala sobre a unica pergunta que o jogador faz de verdade — "quanto falta". */
.zh-order-need-n {
  position: absolute; right: -3px; bottom: -4px;
  font-family: ${BOOK_FONT}; font-weight: 700; font-size: 13px; line-height: 1; color: ${INK};
  text-shadow: 0 0 2px rgba(240, 228, 196, 0.9);
}
.zh-order-need.zh-lack .zh-order-need-n { color: rgba(122, 28, 14, 0.9); }
.zh-order-foot {
  margin: 0; padding-top: 0.5rem;
  background: linear-gradient(#0a0705 0 1px, rgba(255, 226, 180, 0.08) 1px 2px) top / 100% 2px no-repeat;
  text-align: center; color: rgba(216, 209, 192, 0.75); font-size: 0.95rem;
}
`;

const ensureStyle = (): void => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
};

export interface OrderNeed {
  kind: string;
  icon: string;
  label: string;
  /** Quantas a receita pede (o `iron+iron` pede duas). */
  need: number;
  /** Quantas o heroi tem agora. */
  have: number;
  /**
   * Este insumo tambem tem uma receita manual? A moldura o distingue do que so vem do mundo.
   */
  craftable: boolean;
}

export interface OrderCatalogEntry {
  kind: string;
  icon: string;
  label: string;
  family: 'tool' | 'machine' | 'material';
  /**
   * Legivel? Hoje SEMPRE — a mesa so mostra o que o jogador ja fez mais um degrau novo, e a carta
   * nova e justamente a que ele precisa enxergar. O campo fica porque a silhueta pode voltar a ter
   * uso (uma receita achada num level, por exemplo), e nao porque alguem a usa agora.
   */
  known: boolean;
  /** A CARTA NOVA: o degrau que a escada esta oferecendo agora (ver catalogSteps). */
  next: boolean;
  /** Os dois insumos ja estao na mochila. */
  ready: boolean;
  needs: OrderNeed[];
}

export interface OrderCatalogView {
  entries: OrderCatalogEntry[];
  /**
   * O TITULO da tela, que vem de fora porque a tela e a mesma para DUAS maquinas: a bancada
   * pergunta o que voce quer construir, o forno pergunta o que voce quer FUNDIR. Um titulo fixo
   * faria o forno prometer montagem, e "construir" e a palavra errada para reducao de oxido.
   */
  title: string;
  /** O rodape de teclas, e o do dedo. Mesma razao do titulo: o verbo e da maquina. */
  foot: string;
  footTouch: string;
}

export interface OrderOverlayCallbacks {
  /** Lida a cada desenho, nunca um retrato tirado ao abrir (a mesma lei da bolsa e da subtela). */
  read: () => OrderCatalogView;
  /**
   * CONSTRUIR. Devolve `true` se saiu — a mesa nao tem estoque nem fila: ou os insumos estao na
   * mochila agora, ou o gesto e recusado. O overlay so fecha quando saiu alguma coisa.
   */
  onCraft: (kind: string) => boolean;
  /** A recusa soou. O som mora fora do overlay porque quem conhece o mixer do jogo e a cena. */
  onRefuse?: () => void;
  onClose: () => void;
}

export class ToolboxOrderOverlay {
  private readonly root: HTMLDivElement;
  private readonly grids: HTMLDivElement[] = [];
  private readonly cards: HTMLButtonElement[] = [];
  private cursor = 0;
  private closed = false;

  public constructor(private readonly cb: OrderOverlayCallbacks, private readonly touch: boolean) {
    ensureStyle();
    this.root = document.createElement('div');
    this.root.className = 'zh-order-backdrop';
    // Ver ActionButtons: o andar por toque escuta `touchstart` na JANELA, entao sem esta marca
    // tocar numa carta tambem plantaria a ancora do arrasto no mundo por baixo.
    this.root.setAttribute('data-zh-ui', '');

    const panel = document.createElement('section');
    panel.className = 'zh-order-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');

    const title = document.createElement('h2');
    title.className = 'zh-order-title';
    panel.appendChild(title);

    const view = this.cb.read();
    title.textContent = view.title;
    // UMA GRADE SÓ, na ordem da ESCADA (ver catalogSteps) — e a carta nova é sempre a última.
    //
    // Ela era agrupada por família, com um cabeçalho "FERRAMENTAS" e outro "MÁQUINAS". Isso fazia
    // sentido para uma lista de onze cartas: os títulos eram o índice de um catálogo. Numa lista
    // de duas ou três — que é o que a mesa mostra desde que a escada existe — o cabeçalho é maior
    // que o conteúdo que ele organiza, e a família de cada peça já está escrita nos insumos dela
    // (graveto + pedra e ferramenta; pedra + pedra e estacao).
    //
    // E a ordem passou a IMPORTAR: ler de cima para baixo é ler a ordem em que as coisas foram
    // aprendidas, terminando no próximo passo. Agrupar por família embaralharia exatamente isso.
    const grid = document.createElement('div');
    grid.className = 'zh-order-grid';
    for (const entry of view.entries) grid.appendChild(this.card(entry));
    this.grids.push(grid);
    panel.appendChild(grid);

    const foot = document.createElement('p');
    foot.className = 'zh-order-foot';
    // O rodape tambem e da estacao: "Z constroi" numa tela de fundicao seria a mesma mentira que o
    // titulo fixo era. Ele nao le `t()` aqui por isso — quem sabe qual maquina abriu e a cena.
    foot.textContent = touch ? view.footTouch : view.foot;
    panel.appendChild(foot);

    this.root.appendChild(panel);
    // Clicar FORA fecha — o mesmo gesto do dedo em qualquer folha deste jogo. Cliques dentro do
    // painel nao sobem ate aqui porque o alvo e o proprio backdrop.
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) this.close(); });
    document.body.appendChild(this.root);
    window.addEventListener('keydown', this.handleKey, true);

    // O cursor comeca na primeira coisa que da pra construir AGORA — a unica sugestao honesta que
    // o catalogo pode dar sem esconder nada.
    this.cursor = Math.max(0, view.entries.findIndex((e) => e.ready));
    this.render();
    requestAnimationFrame(() => { if (!this.closed) this.root.classList.add('zh-in'); });
  }

  private card(entry: OrderCatalogEntry): HTMLButtonElement {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'zh-order-card';
    card.dataset.kind = entry.kind;
    const index = this.cards.length;
    // O papel da carta (a textura e gerada uma vez) e a inclinacao de quem a pregou na tabua.
    const paper = paperTexture();
    if (paper) card.style.backgroundImage = `url(${paper})`;
    card.style.setProperty('--tilt', `${[-1.6, 1.1, -0.7, 1.5, -1.2, 0.8][index % 6]}deg`);

    const art = document.createElement('img');
    art.className = 'zh-order-art';
    art.src = entry.icon;
    art.alt = entry.label;
    const name = document.createElement('span');
    name.className = 'zh-order-name';
    const needs = document.createElement('span');
    needs.className = 'zh-order-needs';
    for (const need of entry.needs) {
      const slot = document.createElement('span');
      slot.className = 'zh-order-need';
      const img = document.createElement('img');
      img.src = need.icon;
      img.alt = need.label;
      slot.appendChild(img);
      if (need.need > 1) {
        const n = document.createElement('span');
        n.className = 'zh-order-need-n';
        n.textContent = `${Math.min(need.have, need.need)}/${need.need}`;
        slot.appendChild(n);
      }
      needs.appendChild(slot);
    }
    card.append(art, name, needs);

    // No dedo o primeiro toque APONTA e o segundo PREGA — a mesma regra de dois gestos da bolsa.
    // No mouse um clique ja prega: quem tem cursor ja apontou ao chegar ali.
    card.addEventListener('click', () => {
      if (this.touch && this.cursor !== index) { this.cursor = index; this.render(); return; }
      this.cursor = index;
      this.craft();
    });
    this.cards.push(card);
    return card;
  }

  private render(): void {
    const view = this.cb.read();
    // Casado por KIND e nunca por índice. As cartas nascem uma vez, na abertura, e o `read` roda a
    // cada desenho: no dia em que as duas listas saírem em ordens diferentes (foi o que aconteceu
    // quando a grade era agrupada por família e a escada passou a ordenar por progresso), casar
    // por posição pinta a carta errada com o estado da vizinha, em silêncio.
    const cardOf = new Map(this.cards.map((card) => [card.dataset.kind, card]));
    view.entries.forEach((entry) => {
      const card = cardOf.get(entry.kind);
      if (!card) return;
      const i = this.cards.indexOf(card);
      card.classList.toggle('zh-at', i === this.cursor);
      card.classList.toggle('zh-unknown', !entry.known);
      card.classList.toggle('zh-next', entry.next);
      // A BRASA DE "DA PRA FAZER AGORA" NAO ESPERA APRESENTACAO. Ela era `ready && known`, e o
      // efeito colateral aparecia numa tela: um jogador com os dois insumos na mochila via a carta
      // sem moldura nenhuma so porque ainda nao tinha visto o produto — o painel calava justamente
      // o unico fato que ele podia agir AGORA. Poder construir e um fato sobre a mochila, e nao
      // sobre familiaridade.
      card.classList.toggle('zh-ready', entry.ready);
      const name = card.querySelector('.zh-order-name');
      if (name) name.textContent = entry.known ? entry.label : t('toolbox.unknown');
      entry.needs.forEach((need, n) => {
        const slot = card.querySelectorAll('.zh-order-need')[n];
        if (!slot) return;
        const short = need.have < need.need;
        slot.classList.toggle('zh-lack', short);
        slot.classList.toggle('zh-makeable', short && need.craftable);
        const badge = slot.querySelector('.zh-order-need-n');
        if (badge) badge.textContent = `${Math.min(need.have, need.need)}/${need.need}`;
      });
    });
    this.cards[this.cursor]?.focus({ preventScroll: true });
  }

  /**
   * CONSTRUIR o item sob o cursor.
   *
   * Se os insumos estao na mochila, a receita manual comeca e o painel fecha.
   *
   * Faltando material, a carta TREME e o painel fica aberto. A recusa e fisica, como toda recusa
   * deste jogo, e ficar aberto e o que permite escolher outra coisa sem reabrir tudo.
   */
  private craft(): void {
    const card = this.cards[this.cursor];
    const kind = card?.dataset.kind;
    if (!kind || !card) return;
    if (this.cb.onCraft(kind)) { this.close(); return; }
    // A recusa e o resto do gesto, e ela tem de CHEGAR. Um relato de jogo real ("apertei Z e nada
    // aconteceu") mediu o preco de ela ser discreta: um tranco de 3px, sem som, numa grade de onze
    // cartas iguais le como botao quebrado. Agora sao tres coisas juntas — o tranco, o SOM de
    // recusa que todo o resto do jogo ja usa, e o dedo apontado no insumo que falta.
    const lacking = card.querySelectorAll('.zh-order-need.zh-lack');
    for (const slot of Array.from(lacking)) {
      slot.classList.remove('zh-point');
      void (slot as HTMLElement).offsetWidth;
      slot.classList.add('zh-point');
    }
    card.classList.remove('zh-deny');
    // O reflow force o navegador a reiniciar a animacao: sem ele, negar duas vezes seguidas so
    // treme uma vez, e a segunda recusa nao teria resposta nenhuma.
    void card.offsetWidth;
    card.classList.add('zh-deny');
    this.cb.onRefuse?.();
  }

  /**
   * As setas andam na grade INTEIRA, atravessando as duas familias como se fossem uma lista so.
   * Cima/baixo pulam uma linha da grade em que o cursor esta — e a contagem de colunas vem do
   * layout de verdade (`offsetTop`), nunca de um numero fixo: a grade e `auto-fill` e o numero de
   * colunas muda com a largura da janela.
   */
  private readonly handleKey = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    if (key === 'escape' || key === 'x' || key === 'k' || key === 'i') {
      event.preventDefault(); event.stopPropagation(); this.close(); return;
    }
    if (key === 'enter' || key === 'z' || key === 'j' || key === ' ') {
      event.preventDefault(); event.stopPropagation(); this.craft(); return;
    }
    const step = (delta: number): void => {
      event.preventDefault(); event.stopPropagation();
      this.cursor = Math.max(0, Math.min(this.cards.length - 1, this.cursor + delta));
      this.render();
    };
    if (key === 'arrowleft' || key === 'a') { step(-1); return; }
    if (key === 'arrowright' || key === 'd') { step(1); return; }
    if (key === 'arrowup' || key === 'w') { step(-this.columns()); return; }
    if (key === 'arrowdown' || key === 's') { step(this.columns()); return; }
  };

  private columns(): number {
    const grid = this.grids[0];
    if (!grid || grid.children.length === 0) return 1;
    const top = (grid.children[0] as HTMLElement).offsetTop;
    let cols = 0;
    for (const child of Array.from(grid.children)) {
      if ((child as HTMLElement).offsetTop !== top) break;
      cols += 1;
    }
    return Math.max(1, cols);
  }

  public close(): void {
    if (this.closed) return;
    this.closed = true;
    window.removeEventListener('keydown', this.handleKey, true);
    this.root.remove();
    this.cb.onClose();
  }

  /** Fecha SEM avisar a cena — a saida de emergencia do shutdown, que ja esta desmontando tudo. */
  public destroy(): void {
    this.closed = true;
    window.removeEventListener('keydown', this.handleKey, true);
    this.root.remove();
  }
}

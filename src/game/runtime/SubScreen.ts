import type Phaser from 'phaser';

/**
 * A SUBTELA — o inventario do Zelda, e a unica tela do jogo que mostra numeros do heroi.
 *
 * Ela NAO e HUD, e a diferenca nao e semantica: HUD e o que fica na cara do jogador sem ele
 * pedir. A subtela so existe enquanto esta aberta, congela o jogo enquanto isso (ela mora
 * dentro do menu de pausa, que ja faz `scene.pause()`) e some. Foi essa licenca que o
 * PauseMenu ja usava; a lei "o mundo ensina, o HUD nao" continua de pe.
 *
 * Duas regras de desenho, e as duas vem do plano:
 *   - **Nada de numero onde um desenho serve.** Vida e uma fileira de coracoes desenhados, e
 *     nao "3/16". A contagem so aparece onde ela e mesmo uma quantidade (tres gravetos), e
 *     mesmo ai como uma etiqueta pequena em cima do icone, nunca como uma linha de texto.
 *   - **A arte e a mesma do jogo.** Os icones sao os proprios frames do Phaser desenhados num
 *     canvas e virados em data URL (`spriteDataUrl`), com NEAREST e sem suavizacao — um
 *     inventario com arte propria seria uma segunda gramatica para os mesmos objetos.
 */

const STYLE_ID = 'zh-subscreen-style';

const CSS = `
.zh-sub {
  margin: 0 0 1.1em;
  border: 1px solid #3d342a; background: #0f0c09;
  padding: 0.9em 0.9em 1em;
}
.zh-sub h2 {
  margin: 0 0 0.7em; text-align: center;
  font-size: 0.85em; font-weight: 700; letter-spacing: 0.34em; text-indent: 0.34em;
  color: #b9ae94;
}
.zh-sub-hearts {
  display: flex; flex-wrap: wrap; justify-content: center; gap: 3px;
  margin: 0 0 0.9em;
}
.zh-sub-heart {
  width: 22px; height: 22px;
  background-repeat: no-repeat; background-size: contain; background-position: center;
  image-rendering: pixelated;
}
.zh-sub-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(46px, 1fr));
  gap: 6px;
}
.zh-sub-slot {
  position: relative; aspect-ratio: 1;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid #2e2820; background: #171310;
  cursor: pointer; user-select: none;
  transition: border-color 90ms ease, background 90ms ease;
}
.zh-sub-slot:hover { border-color: #6b5c46; background: #221b14; }
.zh-sub-slot.zh-on {
  border-color: #d4c8a4; background: #2a2115;
  box-shadow: inset 0 0 0 1px rgba(212, 200, 164, 0.35);
}
.zh-sub-slot img {
  width: 76%; height: 76%; object-fit: contain; image-rendering: pixelated;
  pointer-events: none;
}
.zh-sub-count {
  position: absolute; right: 2px; bottom: 1px;
  font-size: 10px; line-height: 1; color: #e7dcc4;
  text-shadow: 0 1px 0 #000, 1px 0 0 #000, -1px 0 0 #000, 0 -1px 0 #000;
  pointer-events: none;
}
.zh-sub-empty { text-align: center; color: #7d7666; font-size: 0.88em; padding: 0.6em 0; }
/* OS CONTADORES da materia-prima, logo abaixo da grade: icone + numero, sem slot e sem cursor.
   A mesma leitura da bolsa (ver QuickBag) — quem nao tem gesto nao ganha moldura de item. */
.zh-sub-mats {
  display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 14px;
  padding: 0.1em 0 0.2em; color: #a49c8b; font-size: 0.84em;
}
.zh-sub-mat { display: flex; align-items: center; gap: 4px; }
.zh-sub-mat img { width: 20px; height: 20px; image-rendering: pixelated; object-fit: contain; }
.zh-sub-name {
  margin: 0.7em 0 0; text-align: center; min-height: 1.2em;
  color: #cfc9ba; font-size: 0.88em;
}
.zh-sub-map-title {
  margin: 1.0em 0 0.5em; text-align: center;
  font-size: 0.72em; font-weight: 700; letter-spacing: 0.34em; text-indent: 0.34em;
  color: #8d8672;
}
.zh-sub-map {
  display: grid; gap: 1px; justify-content: center;
  padding: 4px; background: #060504; border: 1px solid #2e2820;
}
.zh-sub-map-cell { position: relative; width: 13px; height: 13px; background: #0b0908; }
.zh-sub-map-cell.zh-seen { background: #262019; }
.zh-sub-map-cell .zh-dot {
  position: absolute; inset: 3px; border-radius: 50%;
}
.zh-dot-hero { background: #e7dcc4; box-shadow: 0 0 4px #fff2c8; }
.zh-dot-fireLit { background: #ffb454; box-shadow: 0 0 3px #ff8c1a; }
.zh-dot-fireDead { background: #55432f; }
.zh-dot-portal { background: #9d7bd8; }
/* ── A PAGINA DE PLANOS ────────────────────────────────────────────────────────────────────────
   O mesmo catalogo da bancada, aqui em versao de LEITURA: nada se prega daqui (nao ha bancada
   por perto), e a razao de ele existir e poder PLANEJAR longe dela — o jogador olha o que falta
   antes de andar meia tela ate o veio de ferro. Uma linha por receita, o produto a esquerda e os
   insumos a direita, e a mesma silhueta do catalogo para o que ele ainda nao conhece. */
.zh-sub-plans { display: grid; gap: 4px; }
.zh-sub-plan {
  display: flex; align-items: center; gap: 7px;
  padding: 4px 6px; border: 1px solid #241f19; background: #131009;
}
.zh-sub-plan.zh-ready { border-color: rgba(229, 181, 88, 0.5); }
.zh-sub-plan img { image-rendering: pixelated; object-fit: contain; }
.zh-sub-plan-out { width: 26px; height: 26px; }
.zh-sub-plan.zh-unknown .zh-sub-plan-out { filter: brightness(0) invert(0.4); opacity: 0.72; }
.zh-sub-plan-name { flex: 1; color: #cfc9ba; font-size: 0.8em; }
.zh-sub-plan.zh-unknown .zh-sub-plan-name { color: #4f4a40; }
.zh-sub-plan-needs { display: flex; align-items: center; gap: 5px; }
.zh-sub-plan-need { position: relative; width: 20px; height: 20px; }
.zh-sub-plan-need img { width: 100%; height: 100%; }
/* Os mesmos dois eixos do catalogo (ver ToolboxOrderOverlay): a MOLDURA tracejada diz "ainda nao
   tenho", a COR diz onde se consegue (cinza = no mundo, colorido = nesta bancada). */
.zh-sub-plan-need.zh-lack { outline: 1px dashed rgba(216, 209, 192, 0.3); outline-offset: 1px; }
.zh-sub-plan-need.zh-lack img { opacity: 0.34; }
/* Moldura em BRASA = a bancada faz este insumo. Ver ToolboxOrderOverlay: o sinal nao pode morar
   na cor da ARTE, senao um sprite redesenhado em cinza o apaga. */
.zh-sub-plan-need.zh-lack.zh-makeable { outline-color: rgba(229, 181, 88, 0.8); }
.zh-sub-plan-need.zh-lack.zh-makeable img { opacity: 0.6; }
.zh-sub-plan-need span {
  position: absolute; right: -3px; bottom: -4px;
  font-size: 9px; line-height: 1; color: #e7dcc4;
  text-shadow: 0 1px 0 #000, 1px 0 0 #000, -1px 0 0 #000, 0 -1px 0 #000;
}
`;

const ensureStyle = (): void => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
};

// Um frame ja desenhado vira data URL uma vez e fica. A arte e estatica e a chave e
// (textura, frame, escala), entao o cache atravessa aberturas da subtela e ate restarts —
// abrir a mochila nao pode custar um redesenho de canvas por icone.
const urlCache = new Map<string, string>();

/**
 * Um frame do Phaser como data URL, ampliado com NEAREST (o jeito pixel-art). Serve para
 * qualquer textura carregada OU gerada em runtime (o balde e o carvao sao desenhados no boot),
 * porque as duas terminam como imagem/canvas dentro do TextureManager.
 */
export const spriteDataUrl = (
  scene: Phaser.Scene,
  key: string,
  frame: number,
  scale = 4,
): string => {
  const id = `${key}:${frame}:${scale}`;
  const cached = urlCache.get(id);
  if (cached) return cached;

  const texture = scene.textures.get(key);
  const f = texture.get(frame);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, f.cutWidth * scale);
  canvas.height = Math.max(1, f.cutHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    f.source.image as CanvasImageSource,
    f.cutX, f.cutY, f.cutWidth, f.cutHeight,
    0, 0, canvas.width, canvas.height,
  );
  const url = canvas.toDataURL();
  urlCache.set(id, url);
  return url;
};

export interface SubScreenItem {
  kind: string;
  /** data URL do icone (spriteDataUrl) */
  icon: string;
  count: number;
  label: string;
}

export interface SubScreenMapMark {
  cx: number;
  cy: number;
  kind: 'hero' | 'fireLit' | 'fireDead' | 'portal';
}

/**
 * O MAPA DO MUNDO, em telas: um quadrado por chunk (o chunk E a tela que o jogador experimenta).
 * So mostra o que foi PISADO — fog of war vindo do save — e marca apenas o que o heroi ja viu:
 * fogueiras (acesa quente, morta apagada), portais e ele mesmo. Sem legenda: as cores sao as do
 * proprio mundo (a brasa, o fogo, o violeta do portal).
 */
export interface SubScreenMap {
  title: string;
  chunksX: number;
  chunksY: number;
  /** "cx,cy" de cada chunk ja visitado. */
  visited: ReadonlyArray<string>;
  marks: SubScreenMapMark[];
}

/**
 * Uma linha da pagina de planos: o produto, e os insumos com quanto se tem de cada. E o MESMO
 * modelo que o catalogo da bancada monta (`OrderCatalogEntry`), de proposito — duas telas que
 * mostram a mesma receita nao podem ter duas ideias diferentes sobre o que ela pede.
 */
export interface SubScreenPlan {
  kind: string;
  icon: string;
  label: string;
  known: boolean;
  ready: boolean;
  needs: Array<{
    kind: string; icon: string; label: string; need: number; have: number; craftable: boolean;
  }>;
}

export interface SubScreenView {
  title: string;
  emptyLabel: string;
  /** `icon` e o coracao CHEIO, `emptyIcon` o vazio — dois desenhos, nunca um com opacidade. */
  hearts: { max: number; filled: number; icon: string; emptyIcon: string };
  items: SubScreenItem[];
  /** A materia-prima: contadores, nunca slots (ver MATERIAL_ITEM_KINDS e QuickBagView.materials). */
  materials: SubScreenItem[];
  selected: string;
  /** So na aventura (overworld): a subtela de level/explorador/dungeon nao tem mapa. */
  map?: SubScreenMap;
  /** A pagina de PLANOS (o catalogo da bancada, em leitura). Ausente = a secao nem existe. */
  plans?: { title: string; rows: SubScreenPlan[] };
}

/**
 * O painel do inventario, embutido no topo do menu de pausa. Ele nao guarda estado: le a
 * `view` de volta da cena a cada desenho, entao escolher um item e um caminho so (a cena troca
 * o item do B, o painel pergunta como ficou).
 */
export class SubScreenPanel {
  public readonly el: HTMLDivElement;
  private readonly heartsRow: HTMLDivElement;
  private readonly grid: HTMLDivElement;
  private readonly mats: HTMLDivElement;
  private readonly name: HTMLParagraphElement;
  private readonly title: HTMLHeadingElement;
  private readonly mapTitle: HTMLHeadingElement;
  private readonly map: HTMLDivElement;
  private readonly plansTitle: HTMLHeadingElement;
  private readonly plans: HTMLDivElement;

  public constructor(
    private readonly read: () => SubScreenView,
    private readonly onSelect: (kind: string) => void,
  ) {
    ensureStyle();
    this.el = document.createElement('div');
    this.el.className = 'zh-sub';

    this.title = document.createElement('h2');
    this.heartsRow = document.createElement('div');
    this.heartsRow.className = 'zh-sub-hearts';
    this.grid = document.createElement('div');
    this.grid.className = 'zh-sub-grid';
    this.mats = document.createElement('div');
    this.mats.className = 'zh-sub-mats';
    this.name = document.createElement('p');
    this.name.className = 'zh-sub-name';
    this.mapTitle = document.createElement('h3');
    this.mapTitle.className = 'zh-sub-map-title';
    this.map = document.createElement('div');
    this.map.className = 'zh-sub-map';
    this.plansTitle = document.createElement('h3');
    this.plansTitle.className = 'zh-sub-map-title'; // o mesmo cabecalho do mapa: uma so voz
    this.plans = document.createElement('div');
    this.plans.className = 'zh-sub-plans';

    // Os PLANOS ficam entre a mochila e o mapa de proposito: eles falam do que esta na mochila
    // (o que falta para cada receita), e o mapa fala do mundo. A ordem e a de zoom crescente.
    this.el.append(
      this.title, this.heartsRow, this.grid, this.mats, this.name,
      this.plansTitle, this.plans, this.mapTitle, this.map,
    );
    this.render();
  }

  /** Setas esquerda/direita andam na grade — o polegar do NES escolhendo o item do B. */
  public step(delta: number): void {
    const view = this.read();
    if (view.items.length === 0) return;
    const at = view.items.findIndex((it) => it.kind === view.selected);
    const next = Math.max(0, Math.min(view.items.length - 1, at + delta));
    this.onSelect(view.items[next].kind);
    this.render();
  }

  public render(): void {
    const view = this.read();
    this.title.textContent = view.title;

    // A vida em coracoes DESENHADOS: o gasto fica no lugar, VAZIO. Sao dois frames da mesma arte
    // (ui/hearts.png), e nao o mesmo coracao com opacidade — o pixel art ja sabe dizer "vazio",
    // e um coracao cheio a 30% de opacidade num painel escuro nao diz nada.
    this.heartsRow.replaceChildren();
    for (let i = 0; i < view.hearts.max; i += 1) {
      const heart = document.createElement('div');
      heart.className = 'zh-sub-heart';
      heart.style.backgroundImage = `url(${i < view.hearts.filled ? view.hearts.icon : view.hearts.emptyIcon})`;
      this.heartsRow.appendChild(heart);
    }

    // Os PLANOS vem ANTES da porta de mochila vazia logo abaixo (que devolve cedo): saber o que
    // uma receita pede e util justamente para quem ainda nao tem nada.
    this.renderPlans(view.plans);

    // Antes da porta de mochila vazia: uma bolsa sem ferramenta nenhuma e um bolso com minerio
    // continua tendo o que mostrar.
    this.renderMaterials(view.materials);

    this.grid.replaceChildren();
    if (view.items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'zh-sub-empty';
      empty.textContent = view.emptyLabel;
      this.grid.appendChild(empty);
      this.name.textContent = '';
      return;
    }

    for (const item of view.items) {
      const slot = document.createElement('div');
      slot.className = item.kind === view.selected ? 'zh-sub-slot zh-on' : 'zh-sub-slot';
      slot.title = item.label;
      const img = document.createElement('img');
      img.src = item.icon;
      img.alt = item.label;
      slot.appendChild(img);
      if (item.count > 1) {
        const count = document.createElement('span');
        count.className = 'zh-sub-count';
        count.textContent = String(item.count);
        slot.appendChild(count);
      }
      slot.addEventListener('click', () => {
        this.onSelect(item.kind);
        this.render();
      });
      this.grid.appendChild(slot);
    }

    const chosen = view.items.find((it) => it.kind === view.selected);
    this.name.textContent = chosen ? chosen.label : '';

    this.renderMap(view.map);
  }

  /**
   * A PAGINA DE PLANOS: o catalogo da bancada em versao de leitura, para planejar longe dela.
   *
   * Nao ha nada a clicar aqui de proposito — pregar um plano e um gesto que acontece NA bancada,
   * e um botao aqui prometeria uma acao que so faz sentido a meia tela de distancia. O que esta
   * pagina responde e a outra pergunta, a que se faz com a mochila na mao: "o que falta".
   */
  /** Icone + numero por material. Leitura pura: nada aqui e clicavel, e nada aqui se equipa. */
  private renderMaterials(materials: SubScreenItem[]): void {
    this.mats.replaceChildren();
    this.mats.style.display = materials.length ? 'flex' : 'none';
    for (const mat of materials) {
      const cell = document.createElement('div');
      cell.className = 'zh-sub-mat';
      cell.title = mat.label;
      const img = document.createElement('img');
      img.src = mat.icon;
      img.alt = mat.label;
      const num = document.createElement('span');
      num.textContent = String(mat.count);
      cell.append(img, num);
      this.mats.appendChild(cell);
    }
  }

  private renderPlans(plans: SubScreenView['plans']): void {
    this.plansTitle.replaceChildren();
    this.plans.replaceChildren();
    const hide = !plans || plans.rows.length === 0;
    this.plansTitle.style.display = hide ? 'none' : '';
    this.plans.style.display = hide ? 'none' : '';
    if (!plans || hide) return;

    this.plansTitle.textContent = plans.title;
    for (const row of plans.rows) {
      const line = document.createElement('div');
      line.className = 'zh-sub-plan';
      if (!row.known) line.classList.add('zh-unknown');
      if (row.ready && row.known) line.classList.add('zh-ready');

      const out = document.createElement('img');
      out.className = 'zh-sub-plan-out';
      out.src = row.icon;
      out.alt = row.label;
      const name = document.createElement('span');
      name.className = 'zh-sub-plan-name';
      name.textContent = row.known ? row.label : '?';
      const needs = document.createElement('span');
      needs.className = 'zh-sub-plan-needs';
      for (const need of row.needs) {
        const short = need.have < need.need;
        const slot = document.createElement('span');
        slot.className = `zh-sub-plan-need${short ? ' zh-lack' : ''}${short && need.craftable ? ' zh-makeable' : ''}`;
        const img = document.createElement('img');
        img.src = need.icon;
        img.alt = need.label;
        slot.appendChild(img);
        if (need.need > 1) {
          const n = document.createElement('span');
          n.textContent = `${Math.min(need.have, need.need)}/${need.need}`;
          slot.appendChild(n);
        }
        needs.appendChild(slot);
      }
      line.append(out, name, needs);
      this.plans.appendChild(line);
    }
  }

  /** O mapa em telas (ver SubScreenMap). Fora da aventura o painel simplesmente nao existe. */
  private renderMap(map: SubScreenMap | undefined): void {
    this.mapTitle.replaceChildren();
    this.map.replaceChildren();
    const hide = !map;
    this.mapTitle.style.display = hide ? 'none' : '';
    this.map.style.display = hide ? 'none' : '';
    if (!map) return;

    this.mapTitle.textContent = map.title;
    this.map.style.gridTemplateColumns = `repeat(${map.chunksX}, 13px)`;
    const visited = new Set(map.visited);
    const markAt = new Map<string, SubScreenMapMark['kind']>();
    // O heroi por ultimo: numa tela com fogueira E heroi, e o heroi que o jogador procura.
    for (const m of map.marks) markAt.set(`${m.cx},${m.cy}`, m.kind);
    for (const m of map.marks) if (m.kind === 'hero') markAt.set(`${m.cx},${m.cy}`, 'hero');

    for (let cy = 0; cy < map.chunksY; cy += 1) {
      for (let cx = 0; cx < map.chunksX; cx += 1) {
        const key = `${cx},${cy}`;
        const cell = document.createElement('div');
        cell.className = visited.has(key) ? 'zh-sub-map-cell zh-seen' : 'zh-sub-map-cell';
        const mark = markAt.get(key);
        if (mark) {
          const dot = document.createElement('div');
          dot.className = `zh-dot zh-dot-${mark}`;
          cell.appendChild(dot);
        }
        this.map.appendChild(cell);
      }
    }
  }
}

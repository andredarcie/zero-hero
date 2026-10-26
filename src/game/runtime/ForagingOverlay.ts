import {
  CLOSE_SIZE, FUNGUS_SPECS, SOIL_LINE, fungusCloseUp,
  type DirtKind, type MushroomKind,
} from '@/game/fungi/fungi';
import { t, tWords } from '@/game/i18n/i18n';

/**
 * A COLHEITA DE UM COGUMELO — três gestos e uma ficha, numa tela que congela o mundo (como o
 * catálogo da bancada: colher não é um gesto de pressa).
 *
 *   1. MIRAR. A lâmina sobe e desce rente ao talo; o jogador corta quando ela passa entre as
 *      marcas. Alto demais desperdiça o pé (e, na amanita, perde a volva, que é como ela se
 *      identifica); fundo demais rasga o micélio. Errar não custa nada: a lâmina segue andando.
 *   2. SERRAR. Vai-e-vem — setas alternadas, ou o dedo de um lado para o outro — até o talo soltar.
 *      O cogumelo sobe, o toco fica, e a terra mostra os fios brancos do micélio: o fungo de
 *      verdade, que continua ali e frutifica de novo.
 *   3. ESCOVAR, em cima da cesta. A escova do cabo da faca tira terra, agulha e folha. Escova, não
 *      água: cogumelo encharca como esponja.
 *   4. A FICHA. Nome popular, nome científico, se se come, e o que aquele fungo ensina.
 *
 * NADA SE PERDE AQUI (a lei do jogo): não há falha, não há tempo, e sair antes do corte deixa o
 * cogumelo no chão. Depois do corte não há saída — o cogumelo já está na mão.
 *
 * O CLOSE É O PRÓPRIO MUNDO, ampliado: o chão e a decoração em volta do cogumelo saem do tileset do
 * jogo (`ForagingScenery`, montado pela cena a partir do tile dele), e o cogumelo tem o mesmo
 * tamanho de pixel dos tiles. A moldura é a da caixa de diálogo. Uma tela com arte e moldura
 * próprias leria como um minigame colado de outro jogo.
 */

const STYLE_ID = 'zh-forage-style';
const SERIF = "Georgia, 'Times New Roman', 'Book Antiqua', serif";

const CSS = `
.zh-forage {
  position: fixed; inset: 0; z-index: 60;
  display: flex; align-items: center; justify-content: center;
  /* Sem cortina preta: o vale continua visivel em volta, como no dialogo. */
  background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0.22) 75%);
  font-family: ${SERIF};
  opacity: 0; transition: opacity 160ms ease;
  overflow-y: auto; padding: 1rem;
  touch-action: none; user-select: none; -webkit-user-select: none;
}
.zh-forage.zh-in { opacity: 1; }
.zh-forage * { box-sizing: border-box; }
/* A MOLDURA DO DIALOGO: madeira escura, filete dourado e o fio escuro por dentro. */
.zh-forage-panel {
  position: relative; width: min(400px, 94vw);
  padding: 0.8em 0.9em 0.85em;
  background: rgba(16, 12, 9, 0.96); color: #f3ecdc;
  border: 3px solid #8a7556; border-radius: 4px;
  box-shadow: inset 0 0 0 2px #2a2118, 0 8px 26px rgba(0, 0, 0, 0.6);
  text-shadow: 0 1px 0 #000;
  display: flex; flex-direction: column; align-items: center; gap: 0.5em;
  transform: translateY(10px); transition: transform 160ms ease;
}
.zh-forage.zh-in .zh-forage-panel { transform: none; }
.zh-forage-title {
  margin: 0; align-self: flex-start;
  font-weight: 700; letter-spacing: 0.04em; font-variant: small-caps; font-size: 1em;
  color: #f3ecdc;
}
/* O quadro do close: o mesmo filete do retrato do dialogo, em volta do pedaco do mundo. */
.zh-forage-frame {
  border: 2px solid #d4c8a4; box-shadow: 0 0 0 2px #2a2118; line-height: 0;
}
.zh-forage-canvas {
  width: min(320px, 82vw, 50vh); aspect-ratio: 1; height: auto; display: block;
  image-rendering: pixelated; image-rendering: crisp-edges;
  background: #2f3b22; cursor: crosshair; touch-action: none;
}
.zh-forage-hint { margin: 0; color: #f3ecdc; font-size: 1em; text-align: center; min-height: 1.3em; }
.zh-forage-msg {
  margin: 0; color: #e5b558; font-size: 0.92em; text-align: center; min-height: 1.25em;
  transition: opacity 200ms ease;
}
.zh-forage-tip {
  margin: 0; color: #c9d2e3; font-size: 0.88em; line-height: 1.4; text-align: center;
  font-style: italic; max-width: 34em;
}
.zh-forage-leave {
  position: absolute; top: 4px; right: 6px; width: 32px; height: 32px; padding: 0;
  border: 0; background: none; color: #d4c8a4;
  font: inherit; font-size: 22px; line-height: 1; cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.zh-forage-leave:hover { color: #f3ecdc; }
.zh-forage-card { display: none; flex-direction: column; align-items: center; gap: 0.45em; width: 100%; }
.zh-forage-card.zh-on { display: flex; }
.zh-forage-card .zh-forage-frame { background: #2f3b22; }
.zh-forage-card img {
  width: 112px; height: 112px; display: block;
  image-rendering: pixelated; image-rendering: crisp-edges;
}
.zh-forage-name { margin: 0.2em 0 0; color: #f3ecdc; font-size: 1.3em; text-align: center; font-variant: small-caps; }
.zh-forage-latin { margin: -0.3em 0 0; color: #d4c8a4; font-style: italic; font-size: 0.98em; }
.zh-forage-edible {
  padding: 1px 9px; border: 2px solid; border-radius: 2px;
  font-size: 0.76em; letter-spacing: 0.1em; text-transform: uppercase;
}
.zh-forage-edible.zh-edible { color: #a9cf86; border-color: #5d7a35; }
.zh-forage-edible.zh-cooked { color: #e5b558; border-color: #8a7556; }
.zh-forage-edible.zh-poison { color: #ef7a62; border-color: #8e3326; }
.zh-forage-notes {
  margin: 0.15em 0 0; padding: 0 0 0 1.1em; color: #e3dccb; font-size: 0.9em; line-height: 1.45;
  align-self: stretch;
}
.zh-forage-notes li { margin: 0 0 0.3em; }
/* O botao e a OPCAO SELECIONADA do dialogo: o pergaminho claro com letra escura. */
.zh-forage-go {
  margin-top: 0.3em; padding: 0.45em 1.3em; min-height: 44px;
  border: 0; border-radius: 2px; background: #d4c8a4; color: #241d12;
  font: inherit; font-size: 1em; cursor: pointer; text-shadow: none;
  box-shadow: 0 0 0 2px #2a2118;
  -webkit-tap-highlight-color: transparent; touch-action: manipulation;
}
.zh-forage-go:active { transform: translateY(1px); }
`;

const ensureStyle = (): void => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
};

export interface ForagingCallbacks {
  /** Uma passada da serra mordeu o talo. */
  onStroke: () => void;
  /** O corte saiu fora da faixa (a lâmina segue andando). */
  onMiss: () => void;
  /** O talo soltou: o cogumelo está na mão. */
  onDetach: () => void;
  /** Um grão de sujeira caiu. */
  onSpeck: () => void;
  /** Limpo. */
  onClean: () => void;
  /** A ficha fechou: o cogumelo vai para a cesta. */
  onDone: () => void;
  /** Saiu antes do corte: o cogumelo continua no chão. */
  onCancel: () => void;
}

/**
 * O PEDAÇO DO MUNDO em volta do cogumelo: 5×5 tiles (dx/dy de -2 a 2), com o frame do chão já
 * resolvido (`groundFrameAt`) e a decoração de cima. A cena monta; o close só desenha.
 */
export interface ForagingScenery {
  tileset: CanvasImageSource;
  /** Quantos frames de 16px o tileset tem por linha. */
  columns: number;
  tiles: ReadonlyArray<{ dx: number; dy: number; ground: number; upper: number | null; water: boolean }>;
}

type Stage = 'aim' | 'saw' | 'lift' | 'clean' | 'card';

/** A grade lógica: 64×64 pixels, quatro tiles de 16 de lado — a mesma escala do mundo. */
const W = 64;
const TILE = 16;
/** O tile do cogumelo: centro em (32, 48) — ele fica embaixo, a mata em cima. */
const TILE_CX = 32;
const TILE_CY = 48;
const OX = TILE_CX - CLOSE_SIZE / 2;
/** A arte assenta o pé (a linha do solo) um pouco abaixo do centro do tile. */
const SOIL_Y = TILE_CY + 3;
const OY = Math.round(SOIL_Y - SOIL_LINE * CLOSE_SIZE);
/** Onde a lâmina vira: do pé do chapéu até fundo na terra. */
const AIM_TOP = OY + 0.46 * CLOSE_SIZE;
const AIM_BOTTOM = SOIL_Y + 5;
/** Uma ida e volta inteira da lâmina, em segundos: devagar o bastante para o polegar. */
const AIM_PERIOD = 3.2;
const SAW_STROKES = 5;
/** Quanto o dedo precisa correr (em pixels lógicos) para valer como uma passada. */
const SAW_SWIPE = 3;
const LIFT_PX = 9;
const BRUSH_R = 4;
/** Quanto de "esfregar" (pixels lógicos de escova passando) cada grão aguenta. */
const SPECK_HP = 7;
const BRUSH_SPEED = 28;
const SPECK_COUNT = 7;
/** O montinho de terra revolvida no pé do cogumelo. */
const MOUND_RX = 12;
const MOUND_RY = 5;

const ACTION_CODES = new Set(['KeyZ', 'KeyJ', 'Space', 'KeyX', 'KeyK', 'Enter', 'NumpadEnter']);

/** A paleta do chão de cada tipo de sujeira — tirada dos tiles do jogo, não inventada. */
const DIRT_COLORS: Readonly<Record<DirtKind, readonly [string, string]>> = {
  soil: ['#3b2a1e', '#5a4330'],
  needle: ['#6b5a32', '#8a7442'],
  leaf: ['#a8642c', '#7d4a22'],
  grass: ['#4d6b2e', '#6f8f3c'],
  sand: ['#c9b48a', '#a8956a'],
  moss: ['#4f6a2c', '#7f9a44'],
};

/** O vime da cesta: os mesmos tons do vime de cozyTextures. */
const WICKER = { dark: '#5e4126', base: '#8a6238', light: '#b0844e' };

interface Speck {
  x: number;
  y: number;
  kind: DirtKind;
  hp: number;
  /** Caindo: a velocidade e o quanto já desceu. */
  fall?: { vy: number; dy: number; alpha: number };
}

interface Fiber { x: number; y: number; vx: number; vy: number; life: number }

/** Um pseudo-aleatório com semente: a mesma terra sempre que a mesma espécie é colhida. */
const rng = (seed: number): (() => number) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
};

export class ForagingOverlay {
  private readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly frameEl: HTMLDivElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly title: HTMLHeadingElement;
  private readonly hint: HTMLParagraphElement;
  private readonly msg: HTMLParagraphElement;
  private readonly tip: HTMLParagraphElement;
  private readonly leave: HTMLButtonElement;
  private readonly card: HTMLDivElement;

  private readonly art: HTMLCanvasElement;
  private readonly mask: Uint8Array;
  private readonly spec: (typeof FUNGUS_SPECS)[MushroomKind];
  private readonly zoneTop: number;
  private readonly zoneBottom: number;
  /** O pedaço do mundo pré-desenhado em dois planos: atrás do cogumelo e na frente dele. */
  private readonly sceneBack: HTMLCanvasElement;
  private readonly sceneFront: HTMLCanvasElement;
  private readonly basket: HTMLCanvasElement;
  private readonly moundDots: Array<{ x: number; y: number; c: string }> = [];
  private readonly mycelium: Array<{ x: number; y: number }> = [];

  private stage: Stage = 'aim';
  private clock = 0;
  private stageClock = 0;
  private knifeY = AIM_TOP;
  private cutY = 0;
  private strokes = 0;
  private lastStroke = 0;
  private sawX = 0;
  private sawTarget = 0;
  private shake = 0;
  private lift = 0;
  private readonly fibers: Fiber[] = [];
  private specks: Speck[] = [];
  private brush = { x: W / 2, y: W / 2 };
  private brushVisible = false;
  private readonly held = new Set<string>();
  private pointer: { id: number; x: number; y: number; acc: number } | null = null;
  private msgTimer = 0;
  private cleaned = false;

  private raf = 0;
  private lastNow = 0;
  private closed = false;

  public constructor(
    private readonly kind: MushroomKind,
    private readonly cb: ForagingCallbacks,
    private readonly touch: boolean,
    scenery?: ForagingScenery,
  ) {
    ensureStyle();
    this.spec = FUNGUS_SPECS[kind];
    const close = fungusCloseUp(kind);
    this.art = close.canvas;
    this.mask = close.mask;
    this.zoneTop = OY + this.spec.cut.from * CLOSE_SIZE;
    this.zoneBottom = OY + this.spec.cut.to * CLOSE_SIZE;
    [this.sceneBack, this.sceneFront] = this.paintScenery(scenery);
    this.basket = this.paintBasket();
    this.seedGround();

    this.root = document.createElement('div');
    this.root.className = 'zh-forage';
    // O andar por toque escuta a JANELA; sem esta marca, serrar com o dedo plantaria a ancora.
    this.root.setAttribute('data-zh-ui', '');
    const panel = document.createElement('div');
    panel.className = 'zh-forage-panel';

    this.title = document.createElement('h2');
    this.title.className = 'zh-forage-title';
    this.frameEl = document.createElement('div');
    this.frameEl.className = 'zh-forage-frame';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'zh-forage-canvas';
    this.canvas.width = W;
    this.canvas.height = W;
    this.frameEl.appendChild(this.canvas);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('ForagingOverlay: no 2d context');
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
    this.hint = document.createElement('p');
    this.hint.className = 'zh-forage-hint';
    this.msg = document.createElement('p');
    this.msg.className = 'zh-forage-msg';
    this.tip = document.createElement('p');
    this.tip.className = 'zh-forage-tip';

    this.leave = document.createElement('button');
    this.leave.type = 'button';
    this.leave.className = 'zh-forage-leave';
    this.leave.textContent = '×';
    this.leave.title = t('fungi.leave');
    this.leave.setAttribute('aria-label', t('fungi.leave'));
    this.leave.addEventListener('click', () => this.cancel());

    this.card = this.buildCard(close.canvas);

    panel.append(this.leave, this.title, this.frameEl, this.hint, this.msg, this.tip, this.card);
    this.root.appendChild(panel);
    document.body.appendChild(this.root);

    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerUp);
    this.canvas.addEventListener('pointerleave', this.onPointerLeave);
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('keyup', this.onKeyUp, true);

    this.enterStage('aim');
    requestAnimationFrame(() => { if (!this.closed) this.root.classList.add('zh-in'); });
    this.lastNow = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  public destroy(): void {
    if (this.closed) return;
    this.closed = true;
    window.cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('keyup', this.onKeyUp, true);
    this.root.remove();
  }

  // ── estágios ───────────────────────────────────────────────────────────────

  private enterStage(stage: Stage): void {
    this.stage = stage;
    this.stageClock = 0;
    const species = `fungi.species.${this.kind}`;
    this.leave.style.display = stage === 'aim' || stage === 'saw' ? '' : 'none';
    switch (stage) {
      case 'aim':
        this.title.textContent = t('fungi.cut.title');
        this.hint.textContent = t(this.touch ? 'fungi.cut.aimTouch' : 'fungi.cut.aimKeys');
        this.tip.textContent = t(`${species}.cut`);
        break;
      case 'saw':
        this.hint.textContent = t(this.touch ? 'fungi.cut.sawTouch' : 'fungi.cut.sawKeys');
        break;
      case 'lift':
        this.hint.textContent = '';
        this.tip.textContent = t('fungi.cut.mycelium');
        break;
      case 'clean':
        this.title.textContent = t('fungi.clean.title');
        this.hint.textContent = t(this.touch ? 'fungi.clean.touch' : 'fungi.clean.keys');
        this.tip.textContent = `${t(`${species}.clean`)} ${t('fungi.clean.why')}`;
        // O que foi colhido vai para o MEIO da cesta: `lift` passa a ser o deslocamento que
        // centraliza a parte acima do corte (o toco ficou na terra).
        this.lift = OY - Math.round((W - (this.cutY - OY)) / 2);
        this.seedSpecks();
        this.brush = { x: W / 2, y: W / 2 };
        this.brushVisible = !this.touch;
        this.canvas.style.cursor = 'none';
        break;
      case 'card':
        this.title.textContent = t('fungi.card.title');
        this.frameEl.style.display = 'none';
        this.hint.style.display = 'none';
        this.msg.style.display = 'none';
        this.tip.style.display = 'none';
        this.card.classList.add('zh-on');
        break;
    }
  }

  private cancel(): void {
    if (this.stage !== 'aim' && this.stage !== 'saw') return;
    this.destroy();
    this.cb.onCancel();
  }

  private finish(): void {
    if (this.stage !== 'card') return;
    this.destroy();
    this.cb.onDone();
  }

  private say(text: string): void {
    this.msg.textContent = text;
    this.msg.style.opacity = '1';
    this.msgTimer = 1.8;
  }

  /** O gesto do botão: cada estágio o lê de um jeito. */
  private act(): void {
    switch (this.stage) {
      case 'aim': this.tryCut(); break;
      case 'saw': this.stroke(0); break;
      case 'lift': if (this.stageClock > 0.6) this.enterStage('clean'); break;
      case 'clean': this.flick(); break;
      // Uma trava curta: o Z que estava petelecando a sujeira nao pode pular a ficha sem le-la.
      case 'card': if (this.stageClock > 0.8) this.finish(); break;
    }
  }

  private tryCut(): void {
    const y = this.knifeY;
    if (y < this.zoneTop) {
      this.say(t(this.kind === 'flyAgaric' ? 'fungi.cut.tooHighVolva' : 'fungi.cut.tooHigh'));
      this.shake = 0.25;
      this.cb.onMiss();
      return;
    }
    if (y > this.zoneBottom) {
      this.say(t('fungi.cut.tooDeep'));
      this.shake = 0.25;
      this.cb.onMiss();
      return;
    }
    this.cutY = Math.round(y);
    this.knifeY = this.cutY;
    this.strokes = 0;
    this.lastStroke = 0;
    this.msg.textContent = '';
    this.enterStage('saw');
  }

  /**
   * UMA PASSADA. `dir` -1/+1 vem das setas e do dedo, e a serra só morde no VAI-E-VEM: a mesma
   * direção duas vezes não corta. `0` é o botão de ação, que vale como uma passada qualquer —
   * quem joga com um botão só também serra.
   */
  private stroke(dir: number): void {
    if (this.stage !== 'saw') return;
    if (dir !== 0 && dir === this.lastStroke) return;
    const d = dir === 0 ? (this.lastStroke === 1 ? -1 : 1) : dir;
    this.lastStroke = d;
    this.strokes += 1;
    this.sawTarget = d * 2;
    this.cb.onStroke();
    const span = this.stemSpan(this.cutY);
    const at = span.left + ((span.right - span.left) * this.strokes) / SAW_STROKES;
    for (let i = 0; i < 3; i += 1) {
      this.fibers.push({
        x: at, y: this.cutY, vx: (Math.random() - 0.5) * 16 + d * 8, vy: -Math.random() * 14 - 4, life: 0.5,
      });
    }
    if (this.strokes >= SAW_STROKES) {
      this.cb.onDetach();
      this.enterStage('lift');
    }
  }

  /** O botão na limpeza: um peteleco onde a escova está — tira meio grão de uma vez. */
  private flick(): void {
    this.brushAt(this.brush.x, this.brush.y, SPECK_HP / 2);
  }

  // ── entrada ────────────────────────────────────────────────────────────────

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (this.closed) return;
    const code = event.code;
    let handled = true;
    if (code === 'Escape') {
      this.cancel();
    } else if (ACTION_CODES.has(code)) {
      if (!event.repeat) this.act();
    } else if (code === 'ArrowLeft' || code === 'KeyA' || code === 'ArrowRight' || code === 'KeyD') {
      const dir = code === 'ArrowLeft' || code === 'KeyA' ? -1 : 1;
      if (this.stage === 'saw' && !event.repeat) this.stroke(dir);
      this.held.add(dir < 0 ? 'left' : 'right');
    } else if (code === 'ArrowUp' || code === 'KeyW') {
      this.held.add('up');
    } else if (code === 'ArrowDown' || code === 'KeyS') {
      this.held.add('down');
    } else {
      handled = false;
    }
    if (handled) {
      // So o KEYDOWN e engolido. O keyup segue para o Phaser: uma seta que estava apertada
      // quando a tela abriu (o heroi encostado no cogumelo) precisa soltar la tambem, senao ele
      // sai andando sozinho quando a tela fecha.
      event.preventDefault();
      event.stopPropagation();
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    const code = event.code;
    if (code === 'ArrowLeft' || code === 'KeyA') this.held.delete('left');
    else if (code === 'ArrowRight' || code === 'KeyD') this.held.delete('right');
    else if (code === 'ArrowUp' || code === 'KeyW') this.held.delete('up');
    else if (code === 'ArrowDown' || code === 'KeyS') this.held.delete('down');
  };

  private toLogical(event: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - r.left) / Math.max(1, r.width)) * W,
      y: ((event.clientY - r.top) / Math.max(1, r.height)) * W,
    };
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    const p = this.toLogical(event);
    this.pointer = { id: event.pointerId, x: p.x, y: p.y, acc: 0 };
    try { this.canvas.setPointerCapture(event.pointerId); } catch { /* sem captura, segue igual */ }
    if (this.stage === 'aim' || this.stage === 'lift') this.act();
    if (this.stage === 'clean') {
      this.brush = { x: p.x, y: p.y };
      this.brushVisible = true;
    }
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const p = this.toLogical(event);
    if (this.stage === 'clean' && event.pointerType === 'mouse' && !this.pointer) {
      // O mouse mostra a escova sem apertar (mira); esfregar e arrastar com o botao.
      this.brush = { x: p.x, y: p.y };
      this.brushVisible = true;
      return;
    }
    const ptr = this.pointer;
    if (!ptr || ptr.id !== event.pointerId) return;
    const dx = p.x - ptr.x;
    const dy = p.y - ptr.y;
    if (this.stage === 'saw') {
      // O vai-e-vem do dedo: acumula na direcao atual e conta uma passada quando ela vira.
      if (Math.sign(dx) !== Math.sign(ptr.acc) && ptr.acc !== 0) ptr.acc = 0;
      ptr.acc += dx;
      if (Math.abs(ptr.acc) >= SAW_SWIPE) {
        this.stroke(Math.sign(ptr.acc));
        ptr.acc = 0;
      }
    } else if (this.stage === 'clean') {
      this.brush = { x: p.x, y: p.y };
      this.brushAt(p.x, p.y, Math.hypot(dx, dy));
    }
    ptr.x = p.x;
    ptr.y = p.y;
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (this.pointer?.id === event.pointerId) this.pointer = null;
    if (this.touch && this.stage === 'clean') this.brushVisible = false;
  };

  private readonly onPointerLeave = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse' && !this.pointer) this.brushVisible = false;
  };

  // ── o mundo do close ───────────────────────────────────────────────────────

  /**
   * O pedaço do mundo, pré-desenhado UMA vez: o chão e a decoração das fileiras de trás num
   * plano, a decoração das fileiras da frente em outro (ela passa na frente do cogumelo, como
   * no mundo). Sem cenário, um chão de musgo liso no tom do tile de grama.
   */
  private paintScenery(scenery?: ForagingScenery): [HTMLCanvasElement, HTMLCanvasElement] {
    const back = document.createElement('canvas');
    const front = document.createElement('canvas');
    back.width = W;
    back.height = W;
    front.width = W;
    front.height = W;
    const b = back.getContext('2d');
    const f = front.getContext('2d');
    if (!b || !f) return [back, front];
    b.imageSmoothingEnabled = false;
    f.imageSmoothingEnabled = false;
    b.fillStyle = '#3f4f2a';
    b.fillRect(0, 0, W, W);
    if (!scenery) return [back, front];
    const at = (dx: number, dy: number): [number, number] => [
      TILE_CX - TILE / 2 + dx * TILE, TILE_CY - TILE / 2 + dy * TILE,
    ];
    const blit = (ctx: CanvasRenderingContext2D, frame: number, x: number, y: number): void => {
      const sx = (frame % scenery.columns) * TILE;
      const sy = Math.floor(frame / scenery.columns) * TILE;
      ctx.drawImage(scenery.tileset, sx, sy, TILE, TILE, x, y, TILE, TILE);
    };
    for (const tile of scenery.tiles) {
      const [x, y] = at(tile.dx, tile.dy);
      if (tile.water) {
        b.fillStyle = '#1f4552';
        b.fillRect(x, y, TILE, TILE);
        b.fillStyle = '#2e6070';
        for (let i = 0; i < 4; i += 1) b.fillRect(x + ((i * 5 + tile.dx * 3) & 15), y + i * 4 + 1, 3, 1);
      } else {
        blit(b, tile.ground, x, y);
      }
    }
    // A decoracao em ordem de fileira: a de tras primeiro. O tile do proprio cogumelo nunca tem
    // (o mundo limpa o `upper` de quem guarda um item).
    const ordered = [...scenery.tiles].sort((p, q) => p.dy - q.dy);
    for (const tile of ordered) {
      if (tile.upper === null || (tile.dx === 0 && tile.dy === 0)) continue;
      const [x, y] = at(tile.dx, tile.dy);
      blit(tile.dy > 0 ? f : b, tile.upper, x, y);
    }
    return [back, front];
  }

  /** O fundo da limpeza: o vime da cesta, trançado em fileiras desencontradas. */
  private paintBasket(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = W;
    const ctx = c.getContext('2d');
    if (!ctx) return c;
    ctx.fillStyle = WICKER.dark;
    ctx.fillRect(0, 0, W, W);
    for (let row = 0; row < W / 4; row += 1) {
      const y = row * 4;
      const shift = row % 2 === 0 ? 0 : 4;
      for (let x = -4 + shift; x < W; x += 8) {
        ctx.fillStyle = WICKER.base;
        ctx.fillRect(x, y, 7, 3);
        ctx.fillStyle = WICKER.light;
        ctx.fillRect(x + 1, y, 5, 1);
      }
    }
    return c;
  }

  private seedGround(): void {
    const rand = rng(this.kind.length * 7919 + this.kind.charCodeAt(0));
    const [c0, c1] = DIRT_COLORS.soil;
    for (let i = 0; i < 18; i += 1) {
      const a = rand() * Math.PI;
      const r = Math.sqrt(rand());
      this.moundDots.push({
        x: Math.round(TILE_CX + Math.cos(a) * (MOUND_RX - 1) * r),
        y: Math.round(SOIL_Y + 1 + Math.sin(a) * (MOUND_RY - 2) * r),
        c: rand() < 0.5 ? c0 : c1,
      });
    }
    // O micelio: fios brancos que se ramificam a partir do pe, por dentro da terra revolvida.
    for (let b = 0; b < 6; b += 1) {
      let x = TILE_CX + (rand() - 0.5) * 3;
      let y = SOIL_Y + 1 + rand() * 1.5;
      const dir = rand() < 0.5 ? -1 : 1;
      const len = 5 + Math.floor(rand() * 7);
      for (let s = 0; s < len; s += 1) {
        x += dir * (0.6 + rand() * 0.7);
        y += (rand() - 0.4) * 0.9;
        const nx = (x - TILE_CX) / MOUND_RX;
        const ny = (y - SOIL_Y) / MOUND_RY;
        if (y < SOIL_Y || nx * nx + ny * ny > 1) break;
        this.mycelium.push({ x: Math.round(x), y: Math.round(y) });
      }
    }
  }

  /** A largura do talo naquela linha do close — onde a serra começa e termina. */
  private stemSpan(y: number): { left: number; right: number } {
    const row = Math.round(y - OY);
    if (row >= 0 && row < CLOSE_SIZE) {
      let left = -1;
      let right = -1;
      // A linha do corte pode cair na volva (que nao entra na mascara de sujeira): a arte
      // inteira serve aqui, entao le-se o canvas, e nao a mascara.
      const ctx = this.art.getContext('2d');
      const data = ctx?.getImageData(0, row, CLOSE_SIZE, 1).data;
      if (data) {
        for (let x = 0; x < CLOSE_SIZE; x += 1) {
          if (data[x * 4 + 3] === 0) continue;
          if (left < 0) left = x;
          right = x;
        }
      }
      if (left >= 0) return { left: OX + left, right: OX + right + 1 };
    }
    return { left: TILE_CX - 2, right: TILE_CX + 2 };
  }

  /** A sujeira nasce em cima do que foi colhido (acima do corte), nunca no contorno. */
  private seedSpecks(): void {
    const rand = rng(Date.now() & 0xffff);
    const spots: Array<{ x: number; y: number }> = [];
    const cutRow = this.cutY - OY;
    for (let y = 1; y < Math.min(CLOSE_SIZE - 1, cutRow - 1); y += 1) {
      for (let x = 1; x < CLOSE_SIZE - 1; x += 1) {
        if (this.mask[y * CLOSE_SIZE + x]) spots.push({ x, y });
      }
    }
    this.specks = [];
    for (let i = 0; i < SPECK_COUNT && spots.length > 0; i += 1) {
      const pick = spots.splice(Math.floor(rand() * spots.length), 1)[0];
      this.specks.push({
        x: OX + pick.x,
        y: OY + pick.y - this.lift,
        kind: this.spec.dirt[i % this.spec.dirt.length],
        hp: SPECK_HP,
      });
    }
  }

  private brushAt(x: number, y: number, amount: number): void {
    if (this.stage !== 'clean' || amount <= 0) return;
    for (const s of this.specks) {
      if (s.fall || Math.hypot(s.x - x, s.y - y) > BRUSH_R + 1) continue;
      s.hp -= amount;
      if (s.hp <= 0) {
        s.fall = { vy: 6 + Math.random() * 6, dy: 0, alpha: 1 };
        this.cb.onSpeck();
      }
    }
  }

  // ── o quadro ───────────────────────────────────────────────────────────────

  private readonly frame = (now: number): void => {
    if (this.closed) return;
    const dt = Math.min(0.05, (now - this.lastNow) / 1000);
    this.lastNow = now;
    this.clock += dt;
    this.stageClock += dt;
    this.update(dt);
    this.draw();
    this.raf = requestAnimationFrame(this.frame);
  };

  private update(dt: number): void {
    if (this.msgTimer > 0) {
      this.msgTimer -= dt;
      if (this.msgTimer <= 0) this.msg.style.opacity = '0';
    }
    this.shake = Math.max(0, this.shake - dt);
    if (this.stage === 'aim') {
      // A lamina em vai-e-vem triangular: velocidade constante, nada de freada que engane o olho.
      const phase = (this.clock % AIM_PERIOD) / AIM_PERIOD;
      const tri = phase < 0.5 ? phase * 2 : 2 - phase * 2;
      this.knifeY = AIM_TOP + (AIM_BOTTOM - AIM_TOP) * tri;
    }
    this.sawX += (this.sawTarget - this.sawX) * Math.min(1, dt * 18);
    if (Math.abs(this.sawX - this.sawTarget) < 0.3) this.sawTarget = 0;
    for (let i = this.fibers.length - 1; i >= 0; i -= 1) {
      const f = this.fibers[i];
      f.life -= dt;
      f.vy += 60 * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.life <= 0) this.fibers.splice(i, 1);
    }
    if (this.stage === 'lift') {
      const k = Math.min(1, this.stageClock / 0.7);
      this.lift = LIFT_PX * (1 - (1 - k) * (1 - k));
      if (this.stageClock > 2.8) this.enterStage('clean');
    }
    if (this.stage === 'clean') {
      const vx = (this.held.has('right') ? 1 : 0) - (this.held.has('left') ? 1 : 0);
      const vy = (this.held.has('down') ? 1 : 0) - (this.held.has('up') ? 1 : 0);
      if (vx || vy) {
        const len = Math.hypot(vx, vy);
        const step = (BRUSH_SPEED * dt) / len;
        this.brush.x = Math.max(0, Math.min(W, this.brush.x + vx * step));
        this.brush.y = Math.max(0, Math.min(W, this.brush.y + vy * step));
        this.brushVisible = true;
        this.brushAt(this.brush.x, this.brush.y, BRUSH_SPEED * dt);
      }
      for (const s of this.specks) {
        if (!s.fall) continue;
        s.fall.vy += 80 * dt;
        s.fall.dy += s.fall.vy * dt;
        s.fall.alpha = Math.max(0, s.fall.alpha - dt * 1.6);
      }
      const left = this.specks.filter((s) => !s.fall || s.fall.alpha > 0).length;
      const dirty = this.specks.filter((s) => !s.fall).length;
      if (!this.cleaned && dirty === 0) {
        this.cleaned = true;
        this.say(t('fungi.clean.done'));
        this.cb.onClean();
      }
      if (this.cleaned && left === 0 && this.stageClock > 0.3) {
        this.stageClock = 0;
        this.enterStage('card');
      }
    }
  }

  private px(x: number, y: number, w: number, h: number, c: string): void {
    this.ctx.fillStyle = c;
    this.ctx.fillRect(Math.round(x), Math.round(y), w, h);
  }

  private draw(): void {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    if (this.stage === 'card') return;
    const sx = this.shake > 0 ? Math.round(Math.sin(this.clock * 70)) : 0;
    ctx.translate(sx, 0);
    if (this.stage === 'clean') this.drawBasket();
    else this.drawForestFloor();
  }

  /** O lugar onde ele nasceu: o chão do mundo, o cogumelo, o montinho de terra no pé. */
  private drawForestFloor(): void {
    const ctx = this.ctx;
    ctx.drawImage(this.sceneBack, 0, 0);
    // A sombra de contato do mundo (groundShadow): uma elipse escura sob o pé.
    ctx.globalAlpha = 0.35;
    this.ellipse(TILE_CX, SOIL_Y + 1, MOUND_RX + 2, MOUND_RY, '#10140a');
    ctx.globalAlpha = 1;

    const lifted = this.stage === 'lift';
    if (lifted) {
      // O toco fica: so o que esta acima do corte sobe.
      this.clipped(OY, this.cutY, W);
      this.clipped(OY - this.lift, 0, this.cutY - this.lift);
    } else {
      ctx.drawImage(this.art, OX, OY);
    }

    this.drawMound(lifted);

    if (this.stage === 'aim' || this.stage === 'saw') {
      // As marcas da faixa certa, na borda do talo: o jogo mostra onde se corta, a dica diz por que.
      const mx = OX + 2;
      ctx.globalAlpha = 0.9;
      this.px(mx, this.zoneTop, 3, 1, '#e5b558');
      this.px(mx, this.zoneBottom, 3, 1, '#e5b558');
      this.px(mx, this.zoneTop, 1, this.zoneBottom - this.zoneTop + 1, '#e5b558');
      ctx.globalAlpha = 1;
    }
    if (this.stage === 'saw') {
      const span = this.stemSpan(this.cutY);
      const done = Math.min(1, this.strokes / SAW_STROKES);
      this.px(span.left, this.cutY, Math.max(1, Math.round((span.right - span.left) * done)), 1, '#1b1d33');
    }
    ctx.drawImage(this.sceneFront, 0, 0);
    if (this.stage === 'aim' || this.stage === 'saw') this.drawKnife(this.knifeY, this.sawX);
    for (const f of this.fibers) this.px(f.x, f.y, 1, 1, '#f3ecda');
  }

  /** Desenha a arte do cogumelo em `y`, recortada entre as linhas `top` e `bottom` da tela. */
  private clipped(y: number, top: number, bottom: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, top, W, Math.max(0, bottom - top));
    ctx.clip();
    ctx.drawImage(this.art, OX, y);
    ctx.restore();
  }

  private ellipse(cx: number, cy: number, rx: number, ry: number, c: string): void {
    for (let y = Math.ceil(cy - ry); y <= cy + ry; y += 1) {
      const k = 1 - ((y - cy) / ry) ** 2;
      if (k <= 0) continue;
      const half = Math.round(rx * Math.sqrt(k));
      this.px(cx - half, y, half * 2, 1, c);
    }
  }

  /**
   * A TERRA REVOLVIDA: meia elipse da linha do solo para baixo, cobrindo o pé (e a volva, na
   * amanita). Solto o cogumelo, ela mostra os fios brancos do micélio por dentro.
   */
  private drawMound(lifted: boolean): void {
    const ctx = this.ctx;
    for (let y = SOIL_Y; y <= SOIL_Y + MOUND_RY; y += 1) {
      const k = 1 - ((y - SOIL_Y) / MOUND_RY) ** 2;
      const half = Math.round(MOUND_RX * Math.sqrt(Math.max(0, k)));
      this.px(TILE_CX - half, y, half * 2, 1, y === SOIL_Y ? '#5a4330' : '#3b2a1e');
    }
    for (const d of this.moundDots) this.px(d.x, d.y, 1, 1, d.c);
    // O contorno navy do jogo nas pontas do monte, como em toda arte que fica de pe no mundo.
    this.px(TILE_CX - MOUND_RX, SOIL_Y, 1, 2, '#1b1d33');
    this.px(TILE_CX + MOUND_RX - 1, SOIL_Y, 1, 2, '#1b1d33');
    if (lifted) {
      ctx.globalAlpha = Math.min(1, this.stageClock / 0.9);
      for (const m of this.mycelium) this.px(m.x, m.y, 1, 1, '#efe9da');
      ctx.globalAlpha = 1;
    }
  }

  /** A faca deitada, na arte da faca da mochila: lâmina clara, virola de latão, cabo e escova. */
  private drawKnife(y: number, dx: number): void {
    const x0 = TILE_CX - 13 + dx;
    const x1 = TILE_CX + 8 + dx;
    this.px(x0 - 1, y - 2, x1 - x0 + 2, 4, '#1b1d33');
    this.px(x0, y - 1, x1 - x0, 1, '#eef2f2');
    this.px(x0, y, x1 - x0, 1, '#9aa3a8');
    this.px(x1, y - 2, 2, 4, '#c9a24a');
    this.px(x1 + 2, y - 2, 8, 4, '#8a5a32');
    this.px(x1 + 2, y + 1, 8, 1, '#5e3b1e');
    this.px(x1 + 10, y - 3, 3, 6, '#3b2a1c');
  }

  /** A limpeza acontece EM CIMA DA CESTA: o cogumelo na mão, o vime embaixo, a escova. */
  private drawBasket(): void {
    const ctx = this.ctx;
    ctx.drawImage(this.basket, 0, 0);
    this.clipped(OY - this.lift, 0, this.cutY - this.lift);
    for (const s of this.specks) this.drawSpeck(s);
    if (this.brushVisible && !this.cleaned) {
      const { x, y } = this.brush;
      for (let a = 0; a < 14; a += 1) {
        const ang = (a / 14) * Math.PI * 2;
        this.px(x + Math.cos(ang) * BRUSH_R, y + Math.sin(ang) * BRUSH_R, 1, 1, '#f3ecdc');
      }
      this.px(x - 1, y - 1, 3, 3, '#1b1d33');
      this.px(x, y, 1, 1, '#3b2a1c');
    }
  }

  private drawSpeck(s: Speck): void {
    const ctx = this.ctx;
    const fall = s.fall;
    if (fall && fall.alpha <= 0) return;
    ctx.globalAlpha = fall ? fall.alpha : 1;
    const x = s.x;
    const y = s.y + (fall?.dy ?? 0);
    const [c0, c1] = DIRT_COLORS[s.kind];
    switch (s.kind) {
      case 'soil':
        this.px(x, y, 2, 2, c0);
        this.px(x + 1, y, 1, 1, c1);
        break;
      case 'needle':
        for (let i = 0; i < 3; i += 1) this.px(x + i, y + i * 0.5, 1, 1, i % 2 ? c1 : c0);
        break;
      case 'leaf':
        this.px(x, y, 2, 2, c0);
        this.px(x + 1, y + 1, 1, 1, c1);
        break;
      case 'grass':
        this.px(x, y, 1, 3, c0);
        this.px(x, y, 1, 1, c1);
        break;
      case 'sand':
        this.px(x, y, 1, 1, c0);
        this.px(x + 2, y + 1, 1, 1, c1);
        this.px(x + 1, y + 2, 1, 1, c0);
        break;
      case 'moss':
        this.px(x, y, 2, 2, c0);
        this.px(x, y, 1, 1, c1);
        break;
    }
    ctx.globalAlpha = 1;
  }

  // ── a ficha ────────────────────────────────────────────────────────────────

  private buildCard(art: HTMLCanvasElement): HTMLDivElement {
    const species = `fungi.species.${this.kind}`;
    const card = document.createElement('div');
    card.className = 'zh-forage-card';
    const frame = document.createElement('div');
    frame.className = 'zh-forage-frame';
    const img = document.createElement('img');
    img.src = art.toDataURL();
    img.alt = t(`items.name.${this.kind}`);
    frame.appendChild(img);
    const name = document.createElement('p');
    name.className = 'zh-forage-name';
    name.textContent = t(`items.name.${this.kind}`);
    const latin = document.createElement('p');
    latin.className = 'zh-forage-latin';
    latin.textContent = t(`${species}.latin`);
    const edible = document.createElement('span');
    edible.className = `zh-forage-edible zh-${this.spec.edibility}`;
    edible.textContent = t(`fungi.edibility.${this.spec.edibility}`);
    const notes = document.createElement('ul');
    notes.className = 'zh-forage-notes';
    for (const line of tWords(`${species}.notes`)) {
      const li = document.createElement('li');
      li.textContent = line;
      notes.appendChild(li);
    }
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'zh-forage-go';
    go.textContent = t('fungi.card.basket');
    go.addEventListener('click', () => this.finish());
    card.append(frame, name, latin, edible, notes, go);
    return card;
  }
}

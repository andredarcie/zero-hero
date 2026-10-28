import { FONT_FAMILY } from '@/game/constants';

/**
 * A DIREÇÃO DE ARTE DA INTERFACE — três materiais, cada um com a sua voz, e nada fora deles.
 * A regra do autor: a interface não pode PARECER interface de jogo; ela é feita de coisas.
 *
 *   MADEIRA  (o livro)  diálogo, pausa, subtela, bancada, bolsa. A caixa do diálogo é o modelo:
 *                       tábua escura, filete dourado, fio escuro por dentro. Letra de livro antigo.
 *   PAPEL    (a pena)   o que o herói ESCREVE ou GUARDA: o item ganho, a ficha do cogumelo, as
 *                       notas de campo, as cartas do catálogo. Papel velho e letra à mão.
 *   PIXEL    (a tecla)  o que é do MUNDO e da mão: os keycaps sobre as coisas, os botões de toque,
 *                       o joystick, o título. Pixel quadrado, canto vazado, a paleta do keycap.
 *
 * Nada de fonte do sistema (Georgia não existe no Android), nada de pílula e círculo vetorial
 * liso, nada de painel preto chapado com filete de 1px.
 */

/** O pixel: o título e as letras das teclas. */
export const PIXEL_FONT = FONT_FAMILY;
/** O livro: tudo o que mora em madeira. */
export const BOOK_FONT = "'Alegreya', 'Iowan Old Style', Georgia, serif";
/** A pena: tudo o que mora em papel. */
export const HAND_FONT = "'Caveat', 'Segoe Print', 'Bradley Hand', cursive";

/** A tinta da pena, e a tinta vermelha (o venenoso). */
export const INK = 'rgba(40, 24, 13, 0.93)';
export const INK_RED = 'rgba(122, 28, 14, 0.95)';

/** A paleta do keycap do mundo (placementTexture / NpcManager): o pixel da interface é este. */
export const KEY_BG = '#241d0f';
export const KEY_BORDER = '#ffe066';
export const KEY_GLYPH = '#f5efdc';

// ── madeira ──────────────────────────────────────────────────────────────────────────────────

/** O veio da tábua: listras finas, quase invisíveis, que tiram o "preto chapado" do painel. */
const WOOD_GRAIN = [
  'repeating-linear-gradient(91deg, rgba(255, 226, 180, 0.028) 0 2px, transparent 2px 9px)',
  'repeating-linear-gradient(89deg, rgba(0, 0, 0, 0.16) 0 1px, transparent 1px 13px)',
  'linear-gradient(180deg, rgba(255, 220, 170, 0.04), rgba(0, 0, 0, 0.18))',
].join(', ');

/** O PAINEL DE MADEIRA (declarações CSS): a moldura da caixa de diálogo, a mesma em toda tela. */
export const WOOD_PANEL = `
  background-color: rgba(19, 14, 10, 0.97); background-image: ${WOOD_GRAIN};
  color: #f3ecdc; font-family: ${BOOK_FONT};
  border: 3px solid #8a7556; border-radius: 3px;
  box-shadow: inset 0 0 0 2px #2a2118, inset 0 0 22px rgba(0, 0, 0, 0.5), 0 8px 26px rgba(0, 0, 0, 0.6);
  text-shadow: 0 1px 0 #000;
`;

/** O REBAIXO na tábua: onde ficam as coisas (os slots, as seções da subtela, o mapa). */
export const WOOD_WELL = `
  background: rgba(7, 5, 3, 0.55);
  border: 2px solid #2a2118; border-radius: 2px;
  box-shadow: inset 0 2px 7px rgba(0, 0, 0, 0.65), 0 1px 0 rgba(255, 226, 180, 0.06);
`;

/** O título gravado na madeira: versalete de livro, sem o espaçamento de menu de jogo. */
export const WOOD_TITLE = `
  font-family: ${BOOK_FONT}; font-weight: 400; font-variant: small-caps;
  letter-spacing: 0.06em; color: #e7dcc4;
`;

/** O selecionado: o pergaminho claro com letra escura (a opção do diálogo). */
export const PARCHMENT_ON = 'background: #d4c8a4; color: #241d12; text-shadow: none;';

/** O embaçado de "o mundo continua ali, fora de foco" (colheita, bancada). */
export const SOFT_BLUR = `
  background: rgba(8, 10, 14, 0.18);
  -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
`;

// ── papel ────────────────────────────────────────────────────────────────────────────────────

/** Um pseudo-aleatório com semente. */
export const seededRandom = (seed: number): (() => number) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = s;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
};

const clamp01 = (k: number): number => Math.max(0, Math.min(1, k));

/**
 * A TEXTURA DO PAPEL, pintada uma vez por canvas: um relevo de ruído com VINCOS de verdade (as
 * dobras de quem amassou e desamassou), iluminado de cima à esquerda; fibras, grão, manchas de
 * idade (as pintas de "foxing") e a beirada encardida. Um gradiente CSS não chega nisso — e é
 * justamente o papel que tem de convencer de que não é interface.
 */
let paperCanvas: HTMLCanvasElement | null = null;
let paperUrl: string | null = null;
export const paperTextureCanvas = (): HTMLCanvasElement | null => {
  if (paperCanvas) return paperCanvas;
  const W = 440;
  const H = 520;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const rand = seededRandom(20261027);

  // O relevo: ruído de valor em três oitavas...
  const octave = (cells: number): ((x: number, y: number) => number) => {
    const gw = cells + 1;
    const gh = Math.ceil((cells * H) / W) + 1;
    const g = Array.from({ length: gw * gh }, () => rand());
    return (x, y) => {
      const fx = (x / W) * cells;
      const fy = (y / W) * cells;
      const ix = Math.min(gw - 2, Math.floor(fx));
      const iy = Math.min(gh - 2, Math.floor(fy));
      const tx = fx - ix;
      const ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const a = g[iy * gw + ix];
      const b = g[iy * gw + ix + 1];
      const cc = g[(iy + 1) * gw + ix];
      const d = g[(iy + 1) * gw + ix + 1];
      return (a + (b - a) * sx) + ((cc + (d - cc) * sx) - (a + (b - a) * sx)) * sy;
    };
  };
  const o1 = octave(4);
  const o2 = octave(9);
  const o3 = octave(22);
  const tone = octave(3);
  // ...e os vincos: retas que atravessam a folha, cada uma um sulco em V (dobra é aresta, não onda).
  const creases = Array.from({ length: 9 }, () => {
    const a = rand() * Math.PI;
    return {
      nx: Math.cos(a), ny: Math.sin(a),
      d: (rand() - 0.5) * W * 0.9 + (rand() < 0.5 ? 0 : W * 0.05),
      w: 6 + rand() * 14, k: 0.35 + rand() * 0.5,
    };
  });
  const height = new Float32Array(W * H);
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      let h = o1(x, y) * 0.55 + o2(x, y) * 0.3 + o3(x, y) * 0.15;
      for (const cr of creases) {
        const dist = Math.abs((x - W / 2) * cr.nx + (y - H / 2) * cr.ny - cr.d);
        if (dist < cr.w) h -= cr.k * (1 - dist / cr.w) * 0.12;
      }
      height[y * W + x] = h;
    }
  }
  const img = ctx.createImageData(W, H);
  const lx = -0.55;
  const ly = -0.7;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const i = y * W + x;
      const hx = height[i + (x < W - 1 ? 1 : 0)] - height[i - (x > 0 ? 1 : 0)];
      const hy = height[i + (y < H - 1 ? W : 0)] - height[i - (y > 0 ? W : 0)];
      // Luz CONTIDA: com o ganho alto os vincos viravam faixas brilhantes de plastico cruzando a
      // letra (visto no Chrome). Papel amassado e relevo de leve, nao celofane.
      const light = Math.max(0.88, Math.min(1.08, 1 + (hx * lx + hy * ly) * 5));
      const warm = tone(x, y);
      // A base: entre o creme e o palha, em manchas largas.
      let r = 231 - warm * 16;
      let g = 214 - warm * 22;
      let b = 170 - warm * 30;
      // A beirada encardida: escurece e esquenta perto da borda, com o ruído roendo a linha.
      const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
      const age = clamp01(1 - (edge - o2(x, y) * 26) / 46);
      r -= age * 48;
      g -= age * 64;
      b -= age * 78;
      const grain = (rand() - 0.5) * 10;
      img.data[i * 4] = Math.max(0, Math.min(255, r * light + grain));
      img.data[i * 4 + 1] = Math.max(0, Math.min(255, g * light + grain));
      img.data[i * 4 + 2] = Math.max(0, Math.min(255, b * light + grain * 0.8));
      img.data[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // As fibras do papel: risquinhos curvos, claros e escuros, quase invisíveis.
  for (let f = 0; f < 520; f += 1) {
    const x = rand() * W;
    const y = rand() * H;
    const a = rand() * Math.PI;
    const len = 3 + rand() * 9;
    ctx.strokeStyle = rand() < 0.5 ? 'rgba(120, 88, 48, 0.12)' : 'rgba(255, 250, 235, 0.16)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a + 0.6) * len * 0.5, y + Math.sin(a + 0.6) * len * 0.5,
      x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  // O foxing: pintas de ferrugem que o papel velho ganha, mais densas num canto.
  for (let s = 0; s < 34; s += 1) {
    const corner = rand() < 0.55;
    const x = corner ? W * (0.7 + rand() * 0.3) : rand() * W;
    const y = corner ? H * (0.65 + rand() * 0.35) : rand() * H;
    const r = 0.8 + rand() * (corner ? 4 : 2.2);
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(128, 74, 30, ${0.18 + rand() * 0.22})`);
    grad.addColorStop(1, 'rgba(128, 74, 30, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Uma marca d'água de copo, meio apagada: alguém apoiou a caneca em cima.
  ctx.strokeStyle = 'rgba(122, 82, 40, 0.09)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(W * 0.82, H * 0.2, 44, 42, 0.3, 0.4, Math.PI * 1.75);
  ctx.stroke();
  paperCanvas = c;
  return c;
};

/**
 * Pinta o papel ANTES de alguém precisar dele, num momento ocioso: a primeira pintura custa dezenas
 * de ms, e sem isto ela cairia no meio da animação de abertura da colheita ou do item ganho.
 */
export const warmPaper = (): void => {
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
  const run = (): void => { paperTexture(); };
  if (idle) idle(run);
  else window.setTimeout(run, 1500);
};

/** A textura do papel como URL (CSS `background-image`). */
export const paperTexture = (): string => {
  if (paperUrl) return paperUrl;
  const c = paperTextureCanvas();
  paperUrl = c ? c.toDataURL('image/jpeg', 0.9) : '';
  return paperUrl;
};

/** O papel em CSS: a textura, esticada na folha inteira, sobre o tom de palha. */
export const PAPER_SURFACE = `
  /* A folha em TAMANHO NATURAL (um pedaco dela), nunca espremida: espremida, os vincos de uma
     folha inteira cabiam num bilhete e viravam um emaranhado de riscos. */
  background-color: #e3d1a4; background-size: max(100%, 440px) auto; background-position: center;
  background-repeat: no-repeat;
  color: ${INK}; font-family: ${HAND_FONT}; font-weight: 600;
  text-shadow: 0 0 0.5px rgba(40, 24, 13, 0.5);
`;

/** Põe a textura num elemento (ela é gerada em runtime, então não mora no CSS estático). */
export const applyPaper = (el: HTMLElement, seed: number, amp = 1): void => {
  const url = paperTexture();
  if (url) el.style.backgroundImage = `url(${url})`;
  el.style.clipPath = tornEdge(seed, amp);
};

/**
 * A borda rasgada (`clip-path`): muitos pontos com a beirada tremida e, de vez em quando, um
 * rasgo mais fundo — papel rasgado à mão nunca é serrilhado regular. `amp` em % da folha.
 */
export const tornEdge = (seed: number, amp = 1): string => {
  const rand = seededRandom(seed);
  const pts: string[] = [];
  const n = 30;
  const j = (a: number): number => {
    const nick = rand() < 0.1 ? rand() * a * 1.8 : 0;
    return +(rand() * a + nick).toFixed(2);
  };
  const f = (v: number): string => v.toFixed(2);
  const ay = 1.1 * amp;
  const ax = 1.4 * amp;
  for (let i = 0; i <= n; i += 1) pts.push(`${f((i / n) * 100)}% ${j(ay)}%`);
  for (let i = 1; i <= n; i += 1) pts.push(`${f(100 - j(ax))}% ${f((i / n) * 100)}%`);
  for (let i = n - 1; i >= 0; i -= 1) pts.push(`${f((i / n) * 100)}% ${f(100 - j(ay))}%`);
  for (let i = n - 1; i >= 1; i -= 1) pts.push(`${j(ax)}% ${f((i / n) * 100)}%`);
  return `polygon(${pts.join(', ')})`;
};

/** Uma semente estável a partir de um texto (a mesma folha para a mesma coisa). */
export const seedOf = (text: string): number => {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
};

// ── pixel ────────────────────────────────────────────────────────────────────────────────────

/**
 * A MOLDURA DE TECLA em pixel art, como imagem (CSS `background-image`, `image-rendering:
 * pixelated`): fundo, borda de 1 pixel e os quatro cantos VAZADOS — o mesmo desenho do keycap
 * que o jogo põe sobre as coisas do mundo. `n` é a grade (pixels de arte por lado).
 */
const frameCache = new Map<string, string>();
export const pixelFrame = (n: number, bg: string, border: string, notch = 1): string => {
  const key = `${n}|${bg}|${border}|${notch}`;
  const hit = frameCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = n;
  c.height = n;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      const dx = Math.min(x, n - 1 - x);
      const dy = Math.min(y, n - 1 - y);
      if (dx + dy < notch) continue;                 // o canto vazado (escada de `notch` pixels)
      const edge = dx === 0 || dy === 0 || dx + dy === notch;
      ctx.fillStyle = edge ? border : bg;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const url = `url(${c.toDataURL()})`;
  frameCache.set(key, url);
  return url;
};

/**
 * O ANEL de pixel (o joystick): um círculo rasterizado na grade, contorno de 1 pixel e o miolo
 * translúcido — círculo de verdade, mas de pixel quadrado, como tudo no mundo.
 */
export const pixelDisc = (n: number, fill: string, border: string): string => {
  const key = `disc|${n}|${fill}|${border}`;
  const hit = frameCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = n;
  c.height = n;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  const r = n / 2;
  const inside = (x: number, y: number): boolean => (x + 0.5 - r) ** 2 + (y + 0.5 - r) ** 2 <= (r - 0.2) ** 2;
  for (let y = 0; y < n; y += 1) {
    for (let x = 0; x < n; x += 1) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      ctx.fillStyle = edge ? border : fill;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const url = `url(${c.toDataURL()})`;
  frameCache.set(key, url);
  return url;
};

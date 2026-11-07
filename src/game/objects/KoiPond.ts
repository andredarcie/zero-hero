import Phaser from 'phaser';
import * as THREE from 'three';

import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { registerTexture3D } from '@/game/render3d/textures3d';
import { WATER_DEPTH_TILES, world3d } from '@/game/render3d/World3D';

/**
 * O LAGO DAS CARPAS (pedido do autor: "a parte de baixo faça um lago com carpas", e depois "lago maior"). O pé da
 * cachoeira (objects/Waterfall.ts) e o laguinho do acampamento viraram UM lago só, o retângulo de 5×3 tiles
 * (52..56, 56..58). O mapa é de scripts/cachoeira.mjs, com as MESMAS coordenadas.
 *
 * Como carpas de verdade num lago de jardim:
 *   · RAÇAS de verdade: kohaku (branca com manchas vermelhas), ogon (dourada inteira), showa (preta com vermelho e
 *     branco) e uma laranja de cabeça branca. Corpo comprido e gordo no meio, barbatana da cauda que balança.
 *   · NADAM DEVAGAR, em curvas: escolhem um ponto, viram aos poucos (nunca giram no lugar) e desaceleram ao chegar.
 *     Fogem da fervura do pé da queda.
 *   · Vêm à BEIRA quando alguém para perto (carpa de jardim aprendeu que gente traz comida) e sobem para beliscar a
 *     superfície, deixando um anel.
 *   · VITÓRIAS-RÉGIAS boiando, uma com flor.
 * Pixel a pixel, em 16 direções pré-desenhadas (rodar um sprite de pixel o borraria) × 2 quadros de cauda.
 */
export const KOI_POND = { x0: 52, y0: 56, x1: 56, y1: 58 } as const;
/** Quantas carpas: as raças se repetem, cada uma com o seu nado. */
const KOI_COUNT = 7;
/** A distância mínima entre duas carpas (o meio corpo de cada uma). */
const KOI_SPACE = 0.42;

const POOL_SURFACE = -WATER_DEPTH_TILES + 0.02;
const DIRS = 16;
const KOI_PX = 14;
/** O mesmo tom das peças do acampamento: a luz do mundo estoura os claros. */
const TINT = 0xbcb8b0;

const hash = (a: number, b: number, seed: number): number => {
  const s = Math.sin(a * 127.1 + b * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

type Put = (x: number, y: number, color: string, alpha?: number) => void;
const canvas = (w: number, h: number, paint: (put: Put) => void): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const img = ctx.createImageData(w, h);
  const put: Put = (x, y, color, alpha = 1) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4;
    img.data[i] = parseInt(color.slice(1, 3), 16);
    img.data[i + 1] = parseInt(color.slice(3, 5), 16);
    img.data[i + 2] = parseInt(color.slice(5, 7), 16);
    img.data[i + 3] = Math.round(alpha * 255);
  };
  paint(put);
  ctx.putImageData(img, 0, 0);
  return c;
};

/**
 * Uma raça: a cor de cada ponto do corpo, de `u` (-2,7 na cauda a 3,7 no focinho) e `v` (o lado), e a cor das
 * barbatanas. As manchas são por faixas de `u` com uma borda irregular, como as de verdade.
 */
interface Breed { body: (u: number, v: number) => string; fin: string }
const WHITE = '#f3efe6';
const RED = '#d9472b';
const BLACK = '#2a2624';
const BREEDS: Breed[] = [
  // Kohaku: branca, com uma mancha vermelha na cabeça e outra no meio das costas.
  { body: (u, v) => ((u > 1.6 && u < 3.3) || (u > -1.4 && u < 0.6 + v * 0.4) ? RED : WHITE), fin: '#efe9df' },
  // Ogon: dourada inteira, o dorso mais claro.
  { body: (_u, v) => (Math.abs(v) < 0.6 ? '#ffd35a' : '#eaa62a'), fin: '#f2c25a' },
  // Showa: preta, com vermelho e branco em faixas.
  { body: (u, v) => (u > 2.4 ? RED : u > 0.8 + v * 0.5 ? WHITE : u > -1.2 ? (v > 0.3 ? RED : BLACK) : BLACK), fin: '#3a3432' },
  // Laranja de cabeça branca.
  { body: (u) => (u > 2.2 ? WHITE : '#ee7d2c'), fin: '#f4a768' },
  // Bekko: branca, com pintas pretas pelas costas.
  { body: (u, v) => (u < 2.4 && u > -2 && Math.abs(v) < 0.9 && hash(Math.round(u * 1.5), Math.round(v * 1.5), 53) < 0.16 ? BLACK : WHITE), fin: '#ece6dc' },
  // Asagi: as costas azul-acinzentadas em escamas e a barriga vermelha.
  { body: (u, v) => (Math.abs(v) > 1 ? RED : (Math.round(u) + Math.round(v)) % 2 ? '#8ea4b8' : '#6f879e'), fin: '#e2866a' },
];

/**
 * Uma carpa rumo à direção `d` (de 16; 0 = leste, girando para o sul), quadro de cauda `f`. Cada pixel é levado ao
 * eixo do peixe (u ao longo, v de lado); a cauda e o fim do corpo se dobram para um lado ou para o outro.
 */
const paintKoi = (breed: Breed, d: number, f: number): HTMLCanvasElement => canvas(KOI_PX, KOI_PX, (put) => {
  const a = (d / DIRS) * Math.PI * 2;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const wig = f === 0 ? 0.9 : -0.9;
  for (let py = 0; py < KOI_PX; py += 1) {
    for (let px = 0; px < KOI_PX; px += 1) {
      const dx = px + 0.5 - KOI_PX / 2;
      const dy = py + 0.5 - KOI_PX / 2;
      const u = dx * ca + dy * sa;
      let v = -dx * sa + dy * ca;
      // A dobra: nada na cabeça, crescendo até a ponta da cauda.
      if (u < 0) v -= wig * (u / 4) ** 2;
      // O corpo: gordo no meio, afinando para a cauda.
      const t = (u - 0.5) / 3.2;
      const w = 1.65 * Math.sqrt(Math.max(0, 1 - t * t)) * (u < 0 ? 0.85 : 1);
      if (Math.abs(v) < w) {
        let c = breed.body(u, v);
        // A sombra da barriga do lado de baixo (sul) e o brilho do dorso.
        if (Math.abs(v) > w - 0.6 && v * Math.sign(sa || 1) > 0) c = shade(c);
        put(px, py, c);
        continue;
      }
      // A barbatana da cauda: um leque que abre atrás do corpo.
      if (u < -2.2 && u > -5 && Math.abs(v) < 0.35 + (-2.2 - u) * 0.6) { put(px, py, breed.fin, 0.75); continue; }
      // As barbatanas do peito, dos dois lados, logo atrás da cabeça.
      if (u > 1.1 && u < 2.1 && Math.abs(v) < w + 1.2) put(px, py, breed.fin, 0.5);
    }
  }
});

/** Um tom mais escuro da mesma cor (a barriga, a sombra). */
const shade = (hex: string): string => {
  const ch = (i: number): string => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.78).toString(16).padStart(2, '0');
  return `#${ch(1)}${ch(3)}${ch(5)}`;
};

/** Uma vitória-régia: disco verde com o corte em cunha, a borda escura e (se `flower`) uma flor rosa. */
const paintPad = (flower: boolean, seed: number): HTMLCanvasElement => canvas(10, 10, (put) => {
  const cut = hash(seed, 0, 50) * Math.PI * 2;
  for (let y = 0; y < 10; y += 1) {
    for (let x = 0; x < 10; x += 1) {
      const dx = x + 0.5 - 5;
      const dy = y + 0.5 - 5;
      const r = Math.hypot(dx, dy);
      if (r > 4.4) continue;
      let ang = Math.atan2(dy, dx) - cut;
      ang = Math.atan2(Math.sin(ang), Math.cos(ang));
      if (Math.abs(ang) < 0.32 && r > 0.6) continue;
      const light = (-dx - dy) / 6;
      put(x, y, r > 3.6 ? '#2f5a2a' : light > 0.25 ? '#7fb04e' : light > -0.25 ? '#5f9440' : '#4a7a36');
    }
  }
  if (flower) {
    for (const [x, y, c] of [[4, 3, '#f6c6d8'], [5, 3, '#f9dbe6'], [3, 4, '#e98bb0'], [6, 4, '#e98bb0'], [4, 4, '#ffe27a'], [5, 4, '#f6c6d8'], [4, 5, '#e98bb0'], [5, 5, '#d8709a']] as const) put(x, y, c);
  }
});

/** O anel da beliscada: abre e some (a escala e o alfa vêm de fora). */
const paintRing = (): HTMLCanvasElement => canvas(12, 12, (put) => {
  for (let i = 0; i < 48; i += 1) {
    const t = (i / 48) * Math.PI * 2;
    put(5.5 + Math.cos(t) * 4.6, 5.5 + Math.sin(t) * 4.6, '#d6eaee', 0.8);
  }
});

/**
 * Uma touceira de TABOA (a planta de beira de lago): folhas compridas e finas, umas dobradas, e três espigas marrons.
 * O quadro `f` é o vento: a ponta de cada folha pende um pixel para um lado ou para o outro.
 */
const REED_W = 14;
const REED_H = 15;
const paintReed = (f: number, seed: number): HTMLCanvasElement => canvas(REED_W, REED_H, (put) => {
  const leaves = ['#6f9a45', '#557d36', '#3f6129'];
  // Uma touceira CHEIA: as folhas abrem em leque a partir do pé, umas curtas e tortas, outras altas.
  for (let i = 0; i < 11; i += 1) {
    const x0 = 4 + i * 0.6 + hash(i, seed, 70) * 1.2;
    const h = 6 + hash(i, seed, 71) * 8;
    const lean = (i - 5) * 0.55 + (hash(i, seed, 72) - 0.5) * 2 + (f ? 0.8 : -0.2);
    for (let y = 0; y < h; y += 1) {
      const t = y / h;
      put(x0 + lean * t * t, REED_H - 1 - y, leaves[(i + (t > 0.7 ? 1 : 0)) % 3]);
    }
  }
  // As espigas: um cilindro marrom no alto de três hastes, com a pontinha clara.
  for (let i = 0; i < 3; i += 1) {
    const x = 5 + i * 1.8 + (f && i === 1 ? 1 : 0);
    const top = 1 + Math.round(hash(i, seed, 73) * 3);
    put(x, top - 1, '#c9b48a');
    for (let y = top; y < top + 3; y += 1) put(x, y, y === top ? '#8a5a32' : '#6b4226');
    for (let y = top + 3; y < REED_H - 3; y += 1) put(x, y, '#557d36');
  }
});

const koiKey = (b: number, d: number, f: number): string => `koi-${b}-${d}-${f}`;
const RING = 'koi-ring';

let registered = false;
const register = (): void => {
  if (registered) return;
  const add = (k: string, c: HTMLCanvasElement): void => {
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    registerTexture3D(k, tex);
  };
  BREEDS.forEach((breed, b) => {
    for (let d = 0; d < DIRS; d += 1) for (let f = 0; f < 2; f += 1) add(koiKey(b, d, f), paintKoi(breed, d, f));
  });
  for (let i = 0; i < 3; i += 1) add(`koi-pad-${i}`, paintPad(i === 1, i));
  add(RING, paintRing());
  for (let i = 0; i < REEDS.length; i += 1) for (let f = 0; f < 2; f += 1) add(`koi-reed-${i}-${f}`, paintReed(f, i));
  registered = true;
};

interface Koi {
  bb: Billboard3D;
  breed: number;
  x: number;
  y: number;
  heading: number;
  speed: number;
  tx: number;
  ty: number;
  wait: number;
  tail: number;
  nibble: number;
}

/**
 * As touceiras de taboa, dentro d'água rente à beira, em cantos DIFERENTES: as três em fila na margem leste liam,
 * de longe, como um poste só.
 */
const REEDS: ReadonlyArray<readonly [number, number]> = [[56.2, 56.15], [52.05, 56.2], [56.15, 57.7]];
/**
 * ORDEM DE DESENHO na água: nenhuma destas peças escreve profundidade, então quem desenha por cima é decidido aqui.
 * As carpas nadam POR BAIXO da espuma, das folhas e do anel (sem isto, uma carpa passava por cima da vitória-régia).
 */
export const WATER_LAYER = { koi: 1, foam: 2, pad: 3, ring: 4 } as const;
/**
 * Onde uma carpa pode ir: o laguinho (os tiles vão de x0-0,5 a x1+0,5) com uma folga de 0,3 tile, o meio corpo dela,
 * para nenhuma passar por cima da margem; menos a fervura do pé da queda (53,56).
 */
const MARGIN = 0.3;
/** Do lado sul a margem de terra fica entre a câmera e a água afundada e esconde mais: folga maior. */
const SOUTH_MARGIN = 0.62;
const swimmable = (x: number, y: number): boolean => {
  if (x < KOI_POND.x0 - 0.5 + MARGIN || x > KOI_POND.x1 + 0.5 - MARGIN || y < KOI_POND.y0 - 0.5 + MARGIN || y > KOI_POND.y1 + 0.5 - SOUTH_MARGIN) return false;
  // A fervura do pé da queda: só em volta dela (o resto da faixa norte do lago grande é água calma).
  if (x > 52.35 && x < 53.75 && y < 56.85) return false;
  // As touceiras de taboa da margem leste.
  return !REEDS.some(([rx, ry]) => Math.hypot(x - rx, y - ry) < 0.38);
};

/** O herói está na beira (até 1,6 tile da água): as carpas vêm até ele. */
const heroBeside = (hero: { x: number; y: number }): boolean => {
  const dx = Math.max(KOI_POND.x0 - 0.5 - hero.x, 0, hero.x - KOI_POND.x1 - 0.5);
  const dy = Math.max(KOI_POND.y0 - 0.5 - hero.y, 0, hero.y - KOI_POND.y1 - 0.5);
  return Math.hypot(dx, dy) < 1.6;
};

export class KoiPond {
  private readonly koi: Koi[] = [];
  private readonly pads: Billboard3D[] = [];
  private readonly ring: Billboard3D;
  private readonly reeds: Billboard3D[] = [];
  private reedFrame = -1;
  private clock = 0;
  private ringT = 1;
  private heroWasNear = false;
  private seed = 3;

  public constructor(private readonly scene: Phaser.Scene, private readonly heroAt: () => { x: number; y: number }) {
    register();
    const w3 = world3d();
    // As vitórias-régias, boiando longe da fervura, em ilhas de duas ou três como num lago de verdade.
    for (const [i, x, y, size] of [
      [0, 52.22, 57.15, 0.6], [2, 52.55, 57.4, 0.42],
      [1, 54.4, 57.7, 0.62], [0, 54.9, 57.5, 0.5], [2, 55.5, 56.3, 0.55],
      [0, 55.55, 57.55, 0.46],
    ] as const) {
      this.pads.push(w3.addBillboard(`koi-pad-${i}`, 0, { flat: true, flatY: POOL_SURFACE + 0.02, depthWrite: false, renderOrder: WATER_LAYER.pad })
        .setDisplaySize(size, size)
        .setTint(TINT)
        .setPosition(x, y));
    }
    REEDS.forEach(([x, y], i) => {
      this.reeds.push(w3.addBillboard(`koi-reed-${i}-0`, 0, {})
        .setDisplaySize(REED_W / 16, REED_H / 16)
        .setTint(TINT)
        .setPosition(x, y)
        .setElevation(POOL_SURFACE));
    });
    this.ring = w3.addBillboard(RING, 0, { flat: true, flatY: POOL_SURFACE + 0.018, depthWrite: false, alphaTest: 0.01, renderOrder: WATER_LAYER.ring })
      .setTint(TINT)
      .setAlpha(0);
    for (let i = 0; i < KOI_COUNT; i += 1) {
      const b = i % BREEDS.length;
      let x = 54;
      let y = 57.5;
      for (let t = 0; t < 20; t += 1) {
        const tx = KOI_POND.x0 + hash(i, t, 51) * (KOI_POND.x1 - KOI_POND.x0);
        const ty = KOI_POND.y0 + hash(i, t, 54) * (KOI_POND.y1 - KOI_POND.y0);
        if (swimmable(tx, ty)) { x = tx; y = ty; break; }
      }
      const k: Koi = {
        bb: w3.addBillboard(koiKey(b, 0, 0), 0, { flat: true, flatY: POOL_SURFACE + 0.008, depthWrite: false, alphaTest: 0.2, renderOrder: WATER_LAYER.koi })
          .setDisplaySize(KOI_PX / 16, KOI_PX / 16)
          .setTint(TINT)
          .setAlpha(0.92),
        breed: b, x, y, heading: hash(i, 3, 51) * Math.PI * 2, speed: 0, tx: x, ty: y, wait: hash(i, 4, 51) * 2, tail: 0, nibble: 0,
      };
      this.koi.push(k);
    }
    this.tick(0);
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.onFrame, this);
  }

  /** Onde estão as carpas (a janela do playtest). */
  public get fish(): Array<{ x: number; y: number }> {
    return this.koi.map((k) => ({ x: k.x, y: k.y }));
  }

  private onFrame(): void {
    this.tick(this.scene.game.loop.delta);
  }

  private rand(): number {
    this.seed += 1;
    return hash(this.seed, 9, 52);
  }

  /**
   * Um ponto novo: na beira do lado do herói, se ele está perto (`eager`: quase sempre, quando ele acabou de chegar);
   * senão, qualquer canto do lago. O ponto perto dele é TRAZIDO para dentro da água nadável, não jogado fora: perto
   * de uma quina, quase todo sorteio caía fora da folga e as carpas desistiam de vir.
   */
  private pickTarget(k: Koi, eager = false): void {
    const hero = this.heroAt();
    const near = heroBeside(hero);
    const lo = { x: KOI_POND.x0 - 0.5 + MARGIN, y: KOI_POND.y0 - 0.5 + MARGIN };
    const hi = { x: KOI_POND.x1 + 0.5 - MARGIN, y: KOI_POND.y1 + 0.5 - SOUTH_MARGIN };
    for (let tries = 0; tries < 24; tries += 1) {
      let x = lo.x + this.rand() * (hi.x - lo.x);
      let y = lo.y + this.rand() * (hi.y - lo.y);
      if (near && this.rand() < (eager ? 0.95 : 0.75)) {
        // Para a beira mais perto dele, com um espalhado para não se empilharem.
        x = Math.min(hi.x, Math.max(lo.x, hero.x + (this.rand() - 0.5) * 1.2));
        y = Math.min(hi.y, Math.max(lo.y, hero.y + (this.rand() - 0.5) * 1.2));
      }
      if (swimmable(x, y)) {
        k.tx = x;
        k.ty = y;
        k.wait = 2 + this.rand() * 4;
        return;
      }
    }
  }

  private tick(deltaMs: number): void {
    const dt = Math.min(0.05, deltaMs / 1000);
    // O vento nas taboas: cada touceira balança no seu tempo.
    this.clock += deltaMs;
    const rf = Math.floor(this.clock / 700);
    if (rf !== this.reedFrame) {
      this.reedFrame = rf;
      this.reeds.forEach((r, i) => r.setTexture(`koi-reed-${i}-${(rf + i) % 2}`));
    }
    const hero = this.heroAt();
    const heroNear = heroBeside(hero);
    // O herói ACABOU de chegar à beira: todas percebem na hora e vêm (carpa de jardim corre para quem chega).
    if (heroNear && !this.heroWasNear) for (const k of this.koi) this.pickTarget(k, true);
    this.heroWasNear = heroNear;
    for (const k of this.koi) {
      const dist = Math.hypot(k.tx - k.x, k.ty - k.y);
      k.wait -= dt;
      if (dist < 0.12 || k.wait < 0) {
        // Chegou: às vezes fica um pouco parada, e perto do herói sobe para beliscar a superfície.
        if (heroNear && this.ringT >= 1 && this.rand() < 0.3 && Math.hypot(hero.x - k.x, hero.y - k.y) < 1.6) {
          this.ringT = 0;
          this.ring.setPosition(k.x + Math.cos(k.heading) * 0.2, k.y + Math.sin(k.heading) * 0.2);
          k.nibble = 0.6;
        }
        this.pickTarget(k);
      }
      // Vira aos poucos para o alvo (nunca no lugar) e desacelera ao chegar.
      const want = Math.atan2(k.ty - k.y, k.tx - k.x);
      let turn = want - k.heading;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      k.heading += Math.max(-1.4 * dt, Math.min(1.4 * dt, turn));
      const cruise = (heroNear ? 0.42 : 0.28) * Math.min(1, dist / 0.5) * (Math.abs(turn) > 1.2 ? 0.5 : 1);
      k.speed += (cruise - k.speed) * Math.min(1, dt * 2);
      const nx = k.x + Math.cos(k.heading) * k.speed * dt;
      const ny = k.y + Math.sin(k.heading) * k.speed * dt;
      if (swimmable(nx, ny)) { k.x = nx; k.y = ny; } else { k.speed *= 0.5; this.pickTarget(k); }
      // A cauda bate mais rápido quanto mais ela nada; parada, ainda abana devagar.
      k.tail += dt * (2.2 + k.speed * 14);
      k.nibble = Math.max(0, k.nibble - dt);
      const d = ((Math.round((k.heading / (Math.PI * 2)) * DIRS) % DIRS) + DIRS) % DIRS;
      k.bb.setTexture(koiKey(k.breed, d, Math.floor(k.tail) % 2))
        .setPosition(k.x, k.y)
        // Beliscando, ela sobe e fica mais nítida; nadando no fundo, um pouco apagada pela água.
        .setAlpha(k.nibble > 0 ? 1 : 0.86);
    }
    // Uma dá espaço à outra: duas carpas nunca ocupam o mesmo lugar (perto do herói elas se juntam na mesma quina
    // e, sem isto, ficavam empilhadas num peixe só).
    for (let i = 0; i < this.koi.length; i += 1) {
      for (let j = i + 1; j < this.koi.length; j += 1) {
        const a = this.koi[i];
        const b = this.koi[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= KOI_SPACE) continue;
        const ux = d > 1e-4 ? dx / d : Math.cos(i + j);
        const uy = d > 1e-4 ? dy / d : Math.sin(i + j);
        const push = Math.min(KOI_SPACE - d, dt * 0.8) / 2;
        if (swimmable(a.x - ux * push, a.y - uy * push)) { a.x -= ux * push; a.y -= uy * push; }
        if (swimmable(b.x + ux * push, b.y + uy * push)) { b.x += ux * push; b.y += uy * push; }
      }
    }
    for (const k of this.koi) k.bb.setPosition(k.x, k.y);
    if (this.ringT < 1) {
      this.ringT = Math.min(1, this.ringT + dt / 0.9);
      const s = 0.25 + this.ringT * 0.55;
      this.ring.setDisplaySize(s, s).setAlpha(0.7 * (1 - this.ringT));
    }
  }

  public destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.onFrame, this);
    for (const b of [this.ring, ...this.pads, ...this.reeds, ...this.koi.map((k) => k.bb)]) b.destroy();
    this.koi.length = 0;
    this.pads.length = 0;
    this.reeds.length = 0;
  }
}

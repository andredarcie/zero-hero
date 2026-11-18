import * as Engine from '@/game/engine';

import { FONT_FAMILY, SCENE_DEPTHS } from '@/game/constants';
import { isReducedMotion } from '@/game/runtime/accessibility';
import { THOUGHT_CATCH, type MeditationSession, type Thought, type ThoughtKind } from '@/game/runtime/meditation';
import { KEY_BG, KEY_BORDER, KEY_GLYPH } from '@/game/runtime/uiStyle';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

/**
 * O QUE SE VÊ MEDITANDO (a regra é runtime/meditation): tudo desenhado no canvas do jogo, preso ao herói sentado, em
 * pixel do tamanho do pixel do mundo (16 por tile), como o balão de ação.
 *
 *   · O GUIA: um anel pontilhado e pálido que cresce enquanto é hora de inspirar e encolhe na expiração.
 *   · O FÔLEGO do jogador: um anel cheio que cresce enquanto ele segura e encolhe quando solta. Junto do guia ele
 *     esquenta, do azul frio para o dourado, e os dois viram um anel só, mais grosso.
 *   · A MENTE LONGE: quando um pensamento alcança o herói, o guia quase some e o fôlego esmaece.
 *   · OS PENSAMENTOS: nuvenzinhas com uma coisa da vida do herói dentro, que chegam de cima e dos lados. Percebida, a
 *     nuvem ganha o nome dela numa plaquinha de tecla e se desfaz em pontinhos.
 *   · A PROFUNDIDADE: pontinhos de luz que se juntam em volta dele, mais quanto mais fundo; na quietude, um halo largo
 *     e uma onda que sai dele de tempos em tempos.
 */

export type ThoughtIcon = { texture: string; frame: number };
/** O pincel do quadro: um retângulo de `size`×`tall` pixels do mundo, na grade dele (ver `render`). */
type Dot = (c: number, a: number, x: number, y: number, size?: number, tall?: number) => void;

const ICE = 0xd6eef4;
const COOL = [0x9c, 0xc9, 0xdd] as const;
const WARM = [0xff, 0xe3, 0x9a] as const;
const MOTE = 0xfff3c4;
const CLOUD_FILL = 0xeef3f6;
const CLOUD_LINE = 0x2c3040;
/** O anel vai deste raio (vazio) até este (cheio), em pixels do mundo: sempre fora do corpo do herói. */
const R_MIN = 10;
const R_MAX = 20;
/** O meio do anel em relação ao tile do herói (tiles para cima): a altura do peito, sentado. */
const CHEST = 0.42;
/** Quantos pensamentos cabem na tela de uma vez (a regra nunca passa de dois vivos e um se desfazendo). */
const POOL = 4;
/** Na quietude, uma onda sai do herói a cada tantos segundos. */
const QUIET_WAVE_S = 3.2;

const color = (hex: string): number => Engine.Display.Color.HexStringToColor(hex).color;
const mix = (k: number): number => {
  const c = COOL.map((v, i) => Math.round(v + (WARM[i] - v) * k));
  return (c[0] << 16) | (c[1] << 8) | c[2];
};

/** Os pixels de um anel de raio `r` (inteiro), calculados uma vez. */
const ringCache = new Map<number, ReadonlyArray<readonly [number, number]>>();
const ring = (r: number): ReadonlyArray<readonly [number, number]> => {
  const hit = ringCache.get(r);
  if (hit) return hit;
  const out: Array<readonly [number, number]> = [];
  for (let y = -r - 1; y <= r + 1; y += 1) {
    for (let x = -r - 1; x <= r + 1; x += 1) if (Math.abs(Math.hypot(x, y) - r) < 0.5) out.push([x, y]);
  }
  // Em volta: a ordem do ângulo deixa pontilhar sem buracos tortos.
  out.sort((a, b) => Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]));
  ringCache.set(r, out);
  return out;
};

/**
 * A nuvem: três bolhas de fundo achatado numa grade de 32×23, com o contorno de um pixel, do tamanho que cabe a coisa
 * de 16 px INTEIRA dentro. Guardada em tiras por linha (o miolo e o contorno), já em volta do meio (16, 11), que é
 * inteiro: a nuvem cai na grade do pixel do mundo. A primeira, de 18×11, só cabia a coisa encolhida para 9 px, e o
 * pixel art encolhido numa escala quebrada perdia traço (a foice virava um risco desbotado).
 */
type Strip = { x: number; y: number; w: number };
const CLOUD = (() => {
  const blobs = [[8.4, 14.2, 7.4], [16, 11, 10.2], [23.6, 13.9, 7.6]];
  const inside = (x: number, y: number): boolean => y <= 20 && blobs.some(([cx, cy, r]) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r);
  const fill: Strip[] = [];
  const line: Strip[] = [];
  for (let y = 0; y < 23; y += 1) {
    let run: { edge: boolean; x0: number } | null = null;
    for (let x = 0; x <= 32; x += 1) {
      const on = x < 32 && inside(x, y);
      const edge = on && (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1));
      if (run && (!on || edge !== run.edge)) {
        (run.edge ? line : fill).push({ x: run.x0 - 16, y: y - 11, w: x - run.x0 });
        run = null;
      }
      if (on && !run) run = { edge, x0: x };
    }
  }
  return { fill, line };
})();
/** Metade de cima e de baixo da nuvem (pixels do mundo a partir do meio): onde ela pousa e onde vai a plaquinha. */
const CLOUD_TOP = 10;
const CLOUD_BOTTOM = 9;
/** A coisa dentro da nuvem: 16 px do mundo, um texel por pixel (nunca numa escala quebrada). */
const THOUGHT_ART = 16;
/**
 * A nuvem que se desfaz SOME PIXEL A PIXEL, e nunca fica semitransparente: meio alfa por cima do capim granulado lia
 * como um fantasma borrado (pedido do autor, 2026-11-16). Cada pixel tem a sua vez, sorteada e puxada pela distância
 * do meio: a borda vai primeiro, o miolo por último, e a nuvem evapora (a trama de Bayer, regular, virava peneira).
 */
const shows = (x: number, y: number, fade: number, seed: number): boolean => {
  if (fade >= 1) return true;
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  const edge = Math.min(1, Math.hypot(x / 16, y / 11.5));
  return 0.5 * (n - Math.floor(n)) + 0.5 * edge < fade;
};

/** O contorno de tinta da coisa (os pixels vazios encostados nos cheios), lido da textura uma vez por quadro dela. */
type IconFrame = Engine.GameObjects.Image['frame'];
const outlineCache = new Map<string, ReadonlyArray<readonly [number, number]>>();
const outlineOf = (frame: IconFrame): ReadonlyArray<readonly [number, number]> => {
  const key = `${frame.texture.key}#${frame.name}`;
  const hit = outlineCache.get(key);
  if (hit) return hit;
  const out: Array<readonly [number, number]> = [];
  try {
    const w = frame.cutWidth;
    const h = frame.cutHeight;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const cx = c.getContext('2d', { willReadFrequently: true });
    if (cx) {
      cx.drawImage(frame.source.image as CanvasImageSource, frame.cutX, frame.cutY, w, h, 0, 0, w, h);
      const data = cx.getImageData(0, 0, w, h).data;
      const solid = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && data[(y * w + x) * 4 + 3] > 64;
      for (let y = -1; y <= h; y += 1) {
        for (let x = -1; x <= w; x += 1) {
          if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) out.push([x, y]);
        }
      }
    }
  } catch { /* textura sem pixels legíveis: a coisa vai sem contorno */ }
  outlineCache.set(key, out);
  return out;
};

export class MeditationView {
  private readonly g: Engine.GameObjects.Graphics;
  private readonly icons: Engine.GameObjects.Image[] = [];
  private readonly labels: Engine.GameObjects.Text[] = [];
  private readonly root: Engine.GameObjects.Container;
  /** A cor e o alfa do pincel agora (-1: nenhum neste quadro). */
  private styleColor = -1;
  private styleAlpha = -1;

  public constructor(
    scene: Engine.Scene,
    private readonly iconFor: (thought: Thought) => ThoughtIcon,
    private readonly labelFor: (kind: ThoughtKind) => string,
  ) {
    this.g = scene.add.graphics();
    const first = iconFor({ id: 0, kind: 'memory', pick: 0, angle: 0, dist: 0, state: 'drifting', age: 0 });
    for (let i = 0; i < POOL; i += 1) {
      // Presa pelo canto: a coisa começa num pixel inteiro do mundo (pelo meio, a de largura ímpar ficava meio pixel fora).
      this.icons.push(scene.add.image(0, 0, first.texture, first.frame).setOrigin(0, 0).setVisible(false));
      this.labels.push(scene.add.text(0, 0, '', { fontFamily: FONT_FAMILY, color: KEY_GLYPH })
        .setOrigin(0.5, 0.5)
        .setResolution(Math.max(1, Math.ceil(window.devicePixelRatio || 1)))
        .setVisible(false));
    }
    this.root = scene.add.container(0, 0, [this.g, ...this.icons, ...this.labels]).setDepth(SCENE_DEPTHS.player + 1);
  }

  /** Desenha o quadro: `anchor` é o tile em que o herói está sentado, e `lift` a altura dele ali (em cima da pedra). */
  public render(
    s: MeditationSession, camera: WorldCamera, tileSize: number, uiTile: number, timeMs: number, anchor: { x: number; y: number }, lift = 0,
  ): void {
    // O peito é projetado como ponto do mundo (a altura junto): com a câmera subindo para mostrar a cerejeira, o herói
    // fica menor na tela, e um peito somado em pixels fixos deixava os pensamentos boiando acima da cabeça.
    const at = camera.tileToScreen(anchor.x, anchor.y, tileSize, lift + CHEST);
    // O PIXEL do desenho em pixels INTEIROS da tela (o do balão de ação, tileSize/16, arredondado): 2,9 px fazia cada
    // linha da nuvem sair com 2 ou 3 (e na tela de 125% o navegador ainda dobra uma coluna em quatro), e o desenho
    // tremia e borrava andando. Medir o pixel do vale 3D na tela não serve: lá ele tem 6 a 8 px, e a nuvem cobria a
    // árvore.
    const px = Math.max(1, Math.round(tileSize / 16));
    this.root.setPosition(Math.round(at.x), Math.round(at.y));
    const g = this.g.clear();
    this.styleColor = -1;
    // UM fillStyle POR PIXEL era uma cor CSS nova por pixel (o motor desenha no canvas 2D e monta "rgba(...)" a cada
    // troca): ~560 por quadro na quietude, com alfas sempre diferentes, e a meditação custava um terço do quadro
    // (165 → 116 fps). A cor só troca quando muda, e o alfa anda em degraus de 1/32 (o navegador reaproveita a cor).
    // Cada pixel do mundo vai de round(x·px) a round((x+1)·px): com o tile em tamanho quebrado, o retângulo de
    // tamanho fixo (ceil de px) passava por cima do vizinho, e onde dois se cobriam o semitransparente dobrava: a nuvem
    // saía quadriculada.
    const dot = (c: number, a: number, x: number, y: number, size = 1, tall = size): void => {
      const alpha = Math.round(Math.min(1, a) * 32) / 32;
      if (alpha <= 0) return;
      this.style(c, alpha);
      const x0 = Math.round(x * px);
      const y0 = Math.round(y * px);
      g.fillRect(x0, y0, Math.max(1, Math.round((x + size) * px) - x0), Math.max(1, Math.round((y + tall) * px) - y0));
    };
    const t = timeMs / 1000;
    const still = isReducedMotion();
    this.drawMotes(s, t, still, dot);
    const focus = s.focused ? 1 : 0.18;
    const guideR = Math.round(R_MIN + (R_MAX - R_MIN) * s.guide.level);
    const breathR = Math.round(R_MIN + (R_MAX - R_MIN) * s.breath);
    const sync = s.sync;
    // O guia, pontilhado: um pixel sim, um não, dando a volta.
    ring(guideR).forEach(([x, y], i) => { if (i % 2 === 0) dot(ICE, 0.55 * focus, x, y); });
    // O fôlego: o miolo de leve, o anel inteiro, e o anel duplo quando os dois coincidem.
    const tone = mix(sync);
    for (const [x, y] of ring(breathR)) dot(tone, (s.focused ? 0.9 : 0.35), x, y);
    if (s.focused && sync > 0.85) for (const [x, y] of ring(breathR + 1)) dot(tone, 0.45 * (sync - 0.85) / 0.15, x, y);
    // A QUIETUDE: um halo largo que respira devagar e, a cada QUIET_WAVE_S, uma onda que sai dele e se desfaz, como o
    // som do sino. Precisa ler de dia, contra o capim claro: é o prêmio da sessão.
    if (s.quiet) {
      const pulse = still ? 0.5 : 0.5 + 0.5 * Math.sin(t * 1.3);
      ring(R_MAX + 6).forEach(([x, y], i) => { if (i % 2 === 0) dot(MOTE, 0.4 + 0.25 * pulse, x, y); });
      if (!still) {
        const k = (t % QUIET_WAVE_S) / QUIET_WAVE_S;
        ring(Math.round(R_MAX + 8 + k * 16)).forEach(([x, y], i) => { if (i % 2 === 0) dot(MOTE, 0.5 * (1 - k), x, y); });
      }
    }
    this.drawThoughts(s, px, uiTile, t, still, dot);
  }

  /**
   * Os pontinhos de luz: um a cada pedaço de profundidade, subindo devagar em volta e piscando, como vaga-lumes. Todos
   * de 2×2, e um em cada quatro com um halo: de um pixel, piscando fundo e apagando a subida inteira, eles sumiam
   * contra o capim claro do dia (de 13, viam-se três). Agora piscam de leve e só apagam no fim da subida.
   */
  private drawMotes(s: MeditationSession, t: number, still: boolean, dot: Dot): void {
    const n = Math.round(s.depth * 18);
    for (let i = 0; i < n; i += 1) {
      const a = i * 2.39996 + (still ? 0 : t * 0.12 * (1 + (i % 3) * 0.25));
      const r = R_MAX + 3 + ((i * 7) % 9);
      const rise = still ? 3 : ((t * 2.2 + i * 5.3) % 14);
      const flicker = still ? 0.95 : 0.85 + 0.15 * Math.sin(t * 2.7 + i);
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r * 0.6 - rise;
      // Acende no primeiro pixel da subida e apaga nos últimos quatro (sem pipocar nem sumir no meio).
      const fade = Math.min(1, rise / 1.5, (14 - rise) / 4);
      if (i % 4 === 0) dot(MOTE, 0.3 * flicker * fade, x - 1, y - 1, 4);
      dot(MOTE, flicker * fade, x, y, 2);
    }
  }

  private drawThoughts(s: MeditationSession, px: number, uiTile: number, t: number, still: boolean, dot: Dot): void {
    const textPx = Math.max(1, Math.round(uiTile / 32));
    this.icons.forEach((icon) => icon.setVisible(false));
    this.labels.forEach((label) => label.setVisible(false));
    s.thoughts.slice(0, POOL).forEach((thought, i) => {
      // Chegando: no caminho dele. Pegou: em cima da cabeça, balançando. Percebido ou lapso: se desfaz ONDE ESTAVA (o
      // percebido ainda no caminho fica no caminho; só o que já tinha pegado o herói está em cima da cabeça). O meio
      // da nuvem cai sempre num pixel inteiro do mundo: nuvem, contorno e coisa ficam na mesma grade, sem borrão.
      const onPath = thought.dist > THOUGHT_CATCH + 1e-6;
      const bob = still ? 0 : Math.sin(t * 2 + thought.id) * 0.6;
      // Percebido: a nuvem sobe um pouco enquanto se desfaz (crescer numa escala quebrada borrava o desenho).
      const rise = thought.state === 'noticed' ? thought.age * 6 : 0;
      const cx = Math.round(onPath ? Math.cos(thought.angle) * thought.dist * 16 : 0);
      // Em cima da cabeça, o fundo da nuvem fica onde ficava o da nuvem pequena (um pixel abaixo do alcance dela).
      const cy = Math.round((onPath ? Math.sin(thought.angle) * thought.dist * 16 * 0.7 : -THOUGHT_CATCH * 16 + 1 - CLOUD_BOTTOM) + bob - rise);
      // Percebido ou lapso: a nuvem se desfaz em 1,2 s, pixel a pixel (ver `shows`). O percebido ainda estoura e ganha
      // o nome; o lapso só vai embora.
      const fade = thought.state === 'noticed' || thought.state === 'lapsed' ? Math.max(0, 1 - thought.age / 1.2) : 1;
      if (fade <= 0.03) return;
      const strip = (c: number, r: Strip): void => {
        if (fade >= 1) { dot(c, 1, cx + r.x, cy + r.y, r.w, 1); return; }
        for (let k = 0; k < r.w; k += 1) if (shows(r.x + k, r.y, fade, thought.id)) dot(c, 1, cx + r.x + k, cy + r.y);
      };
      for (const r of CLOUD.fill) strip(CLOUD_FILL, r);
      for (const r of CLOUD.line) strip(CLOUD_LINE, r);
      // Percebido: a nuvem estoura em pontinhos que se espalham.
      if (thought.state === 'noticed') {
        for (let k = 0; k < 8; k += 1) {
          const a = k * (Math.PI / 4) + thought.id;
          const r = 12 + thought.age * 16;
          dot(MOTE, fade, Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.7), 2);
        }
      }
      const art = this.iconFor(thought);
      const icon = this.icons[i];
      icon.setTexture(art.texture, art.frame);
      // Um texel por pixel do mundo (só a arte maior que a nuvem encolhe, e então pela metade, um quarto...).
      const w = icon.frame.realWidth;
      const h = icon.frame.realHeight;
      const shrink = Math.max(1, Math.ceil(Math.max(w, h) / THOUGHT_ART));
      const left = cx - Math.floor(w / shrink / 2);
      const top = cy - Math.floor(h / shrink / 2);
      // O contorno de tinta em volta da coisa: a parte clara dela (a lâmina, o vidro) lia contra o branco da nuvem.
      if (shrink === 1) {
        for (const [x, y] of outlineOf(icon.frame)) if (shows(left - cx + x, top - cy + y, fade, thought.id)) dot(CLOUD_LINE, 1, left + x, top + y);
      }
      // A coisa vai inteira, opaca, até a nuvem passar da metade do desfazer; aí some de uma vez (meio alfa borrava).
      icon.setDisplaySize(Math.round((left + w / shrink) * px) - Math.round(left * px), Math.round((top + h / shrink) * px) - Math.round(top * px))
        .setPosition(Math.round(left * px), Math.round(top * px))
        .setAlpha(1)
        .setVisible(fade > 0.5);
      if (thought.state === 'noticed') this.drawLabel(i, this.labelFor(thought.kind), cx * px, (cy - CLOUD_TOP - 5) * px, textPx, fade);
    });
  }

  /** O nome do pensamento, numa plaquinha de tecla (o pixel do mundo) logo acima da nuvem. */
  private drawLabel(i: number, text: string, x: number, y: number, textPx: number, alpha: number): void {
    const label = this.labels[i].setText(text).setFontSize(8 * textPx).setPosition(Math.round(x), Math.round(y)).setAlpha(alpha).setVisible(true);
    const w = label.width + 8 * textPx;
    const h = label.height + 4 * textPx;
    const g = this.g;
    this.style(color(KEY_BORDER), alpha);
    g.fillRect(Math.round(x - w / 2), Math.round(y - h / 2), Math.round(w), Math.round(h));
    this.style(color(KEY_BG), alpha);
    g.fillRect(Math.round(x - w / 2 + textPx), Math.round(y - h / 2 + textPx), Math.round(w - 2 * textPx), Math.round(h - 2 * textPx));
  }

  /** Troca a cor do pincel só quando ela muda (ver `render`: cada troca é uma cor CSS lida pelo navegador). */
  private style(c: number, a: number): void {
    if (c === this.styleColor && a === this.styleAlpha) return;
    this.styleColor = c;
    this.styleAlpha = a;
    this.g.fillStyle(c, a);
  }

  /** A sessão acabou (a nota do caderno está na tela): o anel, os vaga-lumes e os pensamentos saem. */
  public hide(): void {
    this.root.setVisible(false);
  }

  public destroy(): void {
    this.root.destroy();
  }
}

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

/** A nuvem: três círculos juntos numa grade de 18×11, com o contorno de um pixel. */
const CLOUD = (() => {
  const inside = (x: number, y: number): boolean => [[5, 6.2, 4.2], [9.5, 4.8, 4.6], [13.4, 6.4, 3.8]]
    .some(([cx, cy, r]) => Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r);
  const fill: Array<[number, number]> = [];
  const line: Array<[number, number]> = [];
  for (let y = 0; y < 11; y += 1) {
    for (let x = 0; x < 18; x += 1) {
      if (!inside(x, y)) continue;
      const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      (edge ? line : fill).push([x - 9, y - 5.5]);
    }
  }
  return { fill, line };
})();

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
      this.icons.push(scene.add.image(0, 0, first.texture, first.frame).setVisible(false));
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
    const px = tileSize / 16;
    const at = camera.tileToScreen(anchor.x, anchor.y, tileSize, lift);
    this.root.setPosition(Math.round(at.x), Math.round(at.y - CHEST * tileSize));
    const g = this.g.clear();
    this.styleColor = -1;
    // UM fillStyle POR PIXEL era uma cor CSS nova por pixel (o motor desenha no canvas 2D e monta "rgba(...)" a cada
    // troca): ~560 por quadro na quietude, com alfas sempre diferentes, e a meditação custava um terço do quadro
    // (165 → 116 fps). A cor só troca quando muda, e o alfa anda em degraus de 1/32 (o navegador reaproveita a cor).
    const dot = (c: number, a: number, x: number, y: number, size = 1): void => {
      const alpha = Math.round(Math.min(1, a) * 32) / 32;
      if (alpha <= 0) return;
      this.style(c, alpha);
      g.fillRect(Math.round(x * px), Math.round(y * px), Math.ceil(size * px), Math.ceil(size * px));
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
    this.drawThoughts(s, tileSize, uiTile, t, still, dot);
  }

  /**
   * Os pontinhos de luz: um a cada pedaço de profundidade, subindo devagar em volta e piscando, como vaga-lumes. Todos
   * de 2×2, e um em cada quatro com um halo: de um pixel, piscando fundo e apagando a subida inteira, eles sumiam
   * contra o capim claro do dia (de 13, viam-se três). Agora piscam de leve e só apagam no fim da subida.
   */
  private drawMotes(s: MeditationSession, t: number, still: boolean, dot: (c: number, a: number, x: number, y: number, size?: number) => void): void {
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

  private drawThoughts(
    s: MeditationSession, tileSize: number, uiTile: number, t: number, still: boolean,
    dot: (c: number, a: number, x: number, y: number, size?: number) => void,
  ): void {
    const px = tileSize / 16;
    const textPx = Math.max(1, Math.round(uiTile / 32));
    this.icons.forEach((icon) => icon.setVisible(false));
    this.labels.forEach((label) => label.setVisible(false));
    s.thoughts.slice(0, POOL).forEach((thought, i) => {
      // Chegando: no caminho dele. Pegou: em cima da cabeça, balançando. Percebido ou lapso: se desfaz ONDE ESTAVA (o
      // percebido ainda no caminho fica no caminho; só o que já tinha pegado o herói está em cima da cabeça).
      const onPath = thought.dist > THOUGHT_CATCH + 1e-6;
      const bob = still ? 0 : Math.sin(t * 2 + thought.id) * 0.6;
      const cx = onPath ? Math.cos(thought.angle) * thought.dist * 16 : 0;
      const cy = (onPath ? Math.sin(thought.angle) * thought.dist * 16 * 0.7 : -THOUGHT_CATCH * 16 - 4) + bob;
      const fade = thought.state === 'noticed' || thought.state === 'lapsed' ? Math.max(0, 1 - thought.age / 1.2) : 1;
      const swell = thought.state === 'noticed' ? 1 + thought.age * 0.5 : 1;
      const alpha = fade * (thought.state === 'lapsed' ? 0.5 : 1);
      if (alpha <= 0.01) return;
      for (const [x, y] of CLOUD.fill) dot(CLOUD_FILL, 0.85 * alpha, cx + x * swell, cy + y * swell);
      for (const [x, y] of CLOUD.line) dot(CLOUD_LINE, 0.7 * alpha, cx + x * swell, cy + y * swell);
      // Percebido: a nuvem estoura em pontinhos que se espalham.
      if (thought.state === 'noticed') {
        for (let k = 0; k < 8; k += 1) {
          const a = k * (Math.PI / 4) + thought.id;
          const r = 6 + thought.age * 14;
          dot(MOTE, fade, cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.7);
        }
      }
      const art = this.iconFor(thought);
      const icon = this.icons[i];
      icon.setTexture(art.texture, art.frame);
      const fit = (9 * px * swell) / Math.max(icon.frame.realWidth, icon.frame.realHeight);
      icon.setDisplaySize(icon.frame.realWidth * fit, icon.frame.realHeight * fit)
        .setPosition(Math.round(cx * px), Math.round(cy * px))
        .setAlpha(alpha)
        .setVisible(true);
      if (thought.state === 'noticed') this.drawLabel(i, this.labelFor(thought.kind), cx * px, (cy - 9) * px, textPx, fade);
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

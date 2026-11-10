import { profiler } from '@/game/debug/Profiler';
import * as Engine from '@/game/engine';
import * as THREE from 'three';

import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { registerTexture3D } from '@/game/render3d/textures3d';
import { world3d } from '@/game/render3d/World3D';
import { createCanvas } from '@/game/platform/platform';

/**
 * A NÉVOA DO JARDIM ALTO (pedido do autor: a mata mais antiga do vale guarda um mistério, com a neblina das
 * florestas antigas). Ela cobre o jardim inteiro até o herói pisar no cume pela primeira vez; então um vento
 * passa e a leva embora (GameScene.playMistClearing), e o save lembra (`mistCleared`).
 *
 * Duas camadas: NUVENS em pé (billboards macios espalhados pelo jardim e pela sebe, em alturas diferentes, que
 * derivam devagar e respiram) e LENÇÓIS deitados rente ao chão do planalto. Não é luz: a névoa é um véu
 * translúcido que a hora do dia escurece como tudo o mais.
 */

const CLOUD = 'garden-mist-cloud';
const SHEET = 'garden-mist-sheet';
/**
 * Fria e clara: a neblina da mata antiga, não o brilho do sol. Mais azul do que parece de propósito (2026-11-10): ela é
 * iluminada, e o sol dourado do dia mais o split-tone quente a puxavam para um amarelo-esverdeado de fumaça. Este azul
 * é o que sobra branco depois do ouro.
 */
const TINT = 0x9cb3d2;
/**
 * QUANTO DESSE TOM SOBRA AO MEIO-DIA. A névoa é iluminada, e a luz do dia subiu (skyPreset, "A TERCEIRA VERSÃO":
 * o teto foi de 2 a 3): com o tom inteiro ela passava do branco, acendia o bloom e virava uma parede leitosa por cima
 * do jardim — o herói sumia dentro dela. De noite o tom é o de sempre; de dia ele desce na proporção em que a luz
 * subiu, e o véu volta a ser o cinza frio que deixa ver as silhuetas.
 */
const DAY_TINT_SCALE = 0.76;
/**
 * O VÉU, não a parede: a névoa deixa ver as silhuetas atrás dela — é isso que guarda o mistério (2026-11-10). Ela era
 * quase opaca (0,82 a 1) e escondia o jardim inteiro por igual.
 */
const CLOUD_ALPHA = 0.5;
const SHEET_ALPHA = 0.46;
/** A moldura do jardim, em tiles a partir da fogueira (o interior e a sebe; ao sul, até a sebe do portão). */
const REACH = { x0: -6, x1: 5, y0: -6, y1: 4 };
/** O raio em que a névoa começa a rarear: a borda dela some aos poucos, sem contorno de bloco. */
const FADE_FROM = 4.8;
const FADE_TO = 7.2;
const CLOUD_STEP = 1.15;
const SHEET_STEP = 2.2;
/**
 * Desenhada por cima do jardim, sem teste de profundidade: o chão, a parede do cume e o tronco das árvores
 * cortavam cada nuvem numa linha reta no pé dela (pedido do autor). Por cima, a nuvem só rareia.
 */
const MIST_RENDER_ORDER = 40;

const noise = (x: number, y: number, seed: number): number => {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Uma nuvem macia: a borda some aos poucos, e o miolo tem grumos, para não ler como um disco. */
const paintCloud = (w: number, h: number, seed: number): HTMLCanvasElement => {
  const canvas = createCanvas();
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const nx = (x + 0.5) / w * 2 - 1;
      const ny = (y + 0.5) / h * 2 - 1;
      const r = Math.sqrt(nx * nx + ny * ny);
      // A borda torta: o raio varia com o ângulo, para a nuvem não ler como um disco.
      const wobble = 1 + 0.18 * Math.sin(Math.atan2(ny, nx) * 3 + seed) + 0.1 * Math.sin(Math.atan2(ny, nx) * 7 + seed * 2);
      const edge = Math.max(0, 1 - r / wobble);
      const soft = edge * edge * (3 - 2 * edge);
      // O PÉ SE DESMANCHA: a metade de baixo rareia até sumir, sem nenhuma linha.
      const foot = Math.min(1, Math.max(0, (1 - (y + 0.5) / h) / 0.55));
      const footSoft = foot * foot * (3 - 2 * foot);
      const lumps = 0.6 + 0.4 * (noise(Math.floor(x / 6), Math.floor(y / 6), seed) * 0.6 + noise(Math.floor(x / 3), Math.floor(y / 3), seed + 9) * 0.4);
      const a = Math.round(255 * soft * lumps * footSoft);
      const i = (y * w + x) * 4;
      img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255; img.data[i + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
};

let registered = false;
const ensureTextures = (): void => {
  if (registered) return;
  for (const [key, w, h, seed] of [[CLOUD, 64, 40, 3], [SHEET, 64, 64, 11]] as const) {
    const tex = new THREE.CanvasTexture(paintCloud(w, h, seed));
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    registerTexture3D(key, tex);
  }
  registered = true;
};

/** O tom da névoa para uma luz do dia de 0 (a noite: o tom inteiro) a 1 (o meio-dia: DAY_TINT_SCALE dele). */
export const mistTint = (daylight: number): number => {
  const k = 1 - (1 - DAY_TINT_SCALE) * Math.min(1, Math.max(0, daylight));
  const ch = (shift: number): number => Math.round(((TINT >> shift) & 0xff) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

const fadeAt = (d: number): number => {
  const t = Math.min(1, Math.max(0, (FADE_TO - d) / (FADE_TO - FADE_FROM)));
  return t * t * (3 - 2 * t);
};

/** Tira o teste de profundidade da peça: ela não é cortada pelo que atravessa (ver MIST_RENDER_ORDER). */
const overlay = (bb: Billboard3D): Billboard3D => {
  const mat = bb.mesh.material as THREE.Material;
  mat.depthTest = false;
  bb.mesh.renderOrder = MIST_RENDER_ORDER;
  return bb;
};

interface Puff {
  bb: Billboard3D;
  x: number;
  y: number;
  lift: number;
  alpha: number;
  phase: number;
  /** O sopro: quanto o vento já levou (0..1) e para onde. */
  gone: number;
}

export class GardenMist {
  private readonly puffs: Puff[] = [];
  private clock = 0;
  private blowing = false;
  /** O degrau de luz do dia com que o tom foi escrito por último (ver DAY_TINT_SCALE): só reescreve quando muda. */
  private tintStep = -1;

  public constructor(private readonly scene: Engine.Scene, center: { x: number; y: number }) {
    ensureTextures();
    const w3 = world3d();
    let n = 0;
    // As nuvens em pé, numa grade torta pelo jardim e pela sebe.
    for (let y = center.y + REACH.y0; y <= center.y + REACH.y1; y += CLOUD_STEP) {
      for (let x = center.x + REACH.x0; x <= center.x + REACH.x1; x += CLOUD_STEP) {
        n += 1;
        const px = x + (noise(x, y, 1) - 0.5) * 1.1;
        // A altura e o pé que rareia sobem a nuvem na tela: ela nasce um tile e meio ao sul para cobrir o jardim.
        const py = y + 1.5 + (noise(x, y, 2) - 0.5) * 1.1;
        const width = 3.4 + noise(x, y, 3) * 1.8;
        const fade = fadeAt(Math.hypot(px - center.x, py - 1.5 - center.y));
        if (fade <= 0.02) continue;
        const alpha = Math.min(1, (CLOUD_ALPHA + noise(x, y, 4) * 0.16) * fade);
        const bb = overlay(w3.objects.addBillboard(CLOUD, 0, { centered: true, depthWrite: false, alphaTest: 0.01 })
          .setTint(TINT)
          .setDisplaySize(width, width * 0.6));
        this.puffs.push({ bb, x: px, y: py, lift: 0.35 + noise(x, y, 5) * 1.1, alpha, phase: n * 1.7, gone: 0 });
      }
    }
    // Os lençóis rente ao chão.
    for (let y = center.y + REACH.y0 + 1; y <= center.y + REACH.y1; y += SHEET_STEP) {
      for (let x = center.x + REACH.x0 + 1; x <= center.x + REACH.x1; x += SHEET_STEP) {
        n += 1;
        const fade = fadeAt(Math.hypot(x - center.x, y - center.y));
        if (fade <= 0.02) continue;
        const bb = overlay(w3.objects.addBillboard(SHEET, 0, { flat: true, flatY: 0.18, depthWrite: false, alphaTest: 0.01 })
          .setTint(TINT)
          .setDisplaySize(4.6, 4.6));
        this.puffs.push({ bb, x, y, lift: 0, alpha: SHEET_ALPHA * fade, phase: n * 2.3, gone: 0 });
      }
    }
    this.tick(0);
    // No fim de cada quadro, e não no update da cena: numa cena (a do vento, inclusive) o update para.
    scene.events.on(Engine.Scenes.Events.POST_UPDATE, this.onFrame, this);
  }

  /** O quadro, medido (debug/Profiler: seção `life.gardenMist`; desligado, não custa nada). */
  private onFrame(): void {
    profiler.begin('life.gardenMist');
    this.frameTick();
    profiler.end('life.gardenMist');
  }

  private frameTick(): void {
    this.tick(this.scene.game.loop.delta);
  }

  /** Quantas peças de névoa estão no jardim (a janela do playtest). */
  public get count(): number {
    return this.puffs.length;
  }

  /** A deriva e a respiração. */
  private tick(deltaMs: number): void {
    this.clock += deltaMs / 1000;
    const t = this.clock;
    this.syncTint();
    for (const p of this.puffs) {
      // CAMADAS EM RITMOS DIFERENTES (2026-11-10): a nuvem mais alta anda mais e mais depressa que o lençol rente ao
      // chão, como num vale de verdade — é o desencontro entre as camadas que dá profundidade ao véu.
      const layer = Math.min(1, p.lift / 1.45);
      const drift = 0.25 + 0.45 * layer;
      const pace = 0.14 + 0.16 * layer;
      const x = p.x + Math.sin(t * pace + p.phase) * drift + p.gone * (7 + (p.phase % 3));
      const y = p.y + Math.cos(t * pace * 0.8 + p.phase * 0.7) * drift * 0.6 - p.gone * 1.5;
      p.bb.setPosition(x, y);
      if (p.lift > 0) p.bb.setElevation(p.lift + p.gone * 0.8 + Math.sin(t * 0.3 + p.phase) * 0.08);
      const breathe = 0.85 + 0.15 * Math.sin(t * 0.4 + p.phase);
      p.bb.setAlpha(p.alpha * breathe * (1 - p.gone));
    }
  }

  /** O tom da névoa acompanha a luz do dia, em vinte degraus (a troca de hora é lenta: quase nunca reescreve). */
  private syncTint(): void {
    const step = Math.round(Math.min(1, Math.max(0, world3d().params.daylight)) * 20);
    if (step === this.tintStep) return;
    this.tintStep = step;
    const tint = mistTint(step / 20);
    for (const p of this.puffs) p.bb.setTint(tint);
  }

  /**
   * O VENTO A LEVA: cada nuvem corre para o leste e some, numa onda do oeste para o leste (o vento entra por
   * um lado do jardim). Resolve quando a última some; então a névoa se desfaz de vez.
   */
  public blowAway(): Promise<void> {
    if (this.blowing) return Promise.resolve();
    this.blowing = true;
    const xs = this.puffs.map((p) => p.x);
    const west = Math.min(...xs);
    const span = Math.max(1, Math.max(...xs) - west);
    let last = 0;
    for (const p of this.puffs) {
      const delay = ((p.x - west) / span) * 1400 + noise(p.x, p.y, 7) * 300;
      const duration = 1900 + noise(p.x, p.y, 8) * 900;
      last = Math.max(last, delay + duration);
      this.scene.tweens.add({ targets: p, gone: 1, delay, duration, ease: 'Sine.easeIn' });
    }
    return new Promise((resolve) => {
      this.scene.time.delayedCall(last + 60, () => {
        this.destroy();
        resolve();
      });
    });
  }

  public destroy(): void {
    this.scene.events?.off(Engine.Scenes.Events.POST_UPDATE, this.onFrame, this);
    for (const p of this.puffs) {
      this.scene.tweens?.killTweensOf(p);
      p.bb.destroy();
    }
    this.puffs.length = 0;
  }
}

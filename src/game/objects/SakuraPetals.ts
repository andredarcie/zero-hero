import * as THREE from 'three';

import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { RAMPS } from '@/game/render3d/pixelForms';
import { SAKURA_SCALE, SAKURA_TINT } from '@/game/render3d/sakuraArt';
import { registerTexture3D } from '@/game/render3d/textures3d';
import { world3d } from '@/game/render3d/World3D';
import { TILESET as P, hash, paint, type Put } from '@/game/objects/nature/kit';

/**
 * AS PÉTALAS DA CEREJEIRA (objects/SakuraTree): de vez em quando uma se solta da copa, desce rodando e dançando no
 * vento, e pousa na clareira, onde fica um pouco e some. Embaixo da árvore o chão já é um tapete delas. Meditando, o
 * herói vê mais: a árvore solta pétalas com mais frequência, e às vezes um sopro leva várias de uma vez.
 *
 * Cada pétala é um ou dois pixels do mundo (o traço do tileset), na rampa rosa da copa, e vira de lado enquanto cai
 * (três desenhos: de frente, deitada e de pé). Longe do herói nenhuma nasce: o vale inteiro não paga por elas.
 */

const [PINK, PINK_MID, PINK_DK] = RAMPS.pink;
const PETAL = P.bone;

const registered = new Set<string>();
/** Desenha pixel a pixel e registra já (a natureza registra depois, no NatureLife; a cerejeira nasce antes). */
export const registerPixelTexture = (key: string, w: number, h: number, draw: (put: Put) => void): string => {
  if (registered.has(key)) return key;
  const tex = new THREE.CanvasTexture(paint(w, h, draw));
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  registerTexture3D(key, tex);
  registered.add(key);
  return key;
};

/** A pétala virando: de frente (2×2), deitada (2×1), de pé (1×2), deitada de novo. */
const PETAL_FRAMES: ReadonlyArray<{ key: string; w: number; h: number }> = [
  { key: 'sakura-petal-face', w: 2, h: 2 },
  { key: 'sakura-petal-flat', w: 2, h: 1 },
  { key: 'sakura-petal-edge', w: 1, h: 2 },
  { key: 'sakura-petal-flat', w: 2, h: 1 },
];
const registerPetals = (): void => {
  registerPixelTexture('sakura-petal-face', 2, 2, (put) => { put(0, 0, PETAL); put(1, 0, PINK); put(0, 1, PINK); put(1, 1, PINK_MID); });
  registerPixelTexture('sakura-petal-flat', 2, 1, (put) => { put(0, 0, PINK); put(1, 0, PINK_MID); });
  registerPixelTexture('sakura-petal-edge', 1, 2, (put) => { put(0, 0, PINK); put(0, 1, PINK_DK); });
};

/**
 * O TAPETE: pétalas no chão debaixo da copa, mais juntas perto do tronco, rareando para a borda. Da largura da copa e
 * metade dela de fundo, ralo: a primeira versão, larga e cheia, virava confete em volta da pedra.
 */
const CARPET_W = Math.round(112 * SAKURA_SCALE);
const CARPET_H = Math.round(56 * SAKURA_SCALE);
const carpetTexture = (): string => registerPixelTexture('sakura-carpet', CARPET_W, CARPET_H, (put) => {
  for (let y = 0; y < CARPET_H; y += 1) {
    for (let x = 0; x < CARPET_W; x += 1) {
      const nx = (x + 0.5 - CARPET_W / 2) / (CARPET_W / 2);
      const ny = (y + 0.5 - CARPET_H * 0.4) / (CARPET_H * 0.6);
      const r = Math.hypot(nx, ny);
      if (r > 1) continue;
      const p = 0.006 + 0.075 * (1 - r) ** 1.6;
      if (hash(x, y, 71) > p) continue;
      const k = hash(y, x, 72);
      const c = k < 0.45 ? PINK : k < 0.72 ? PETAL : k < 0.94 ? PINK_MID : PINK_DK;
      put(x, y, c);
      // Algumas pétalas têm 2 px (deitada ou de pé), como as folhinhas do chão.
      const two = hash(x, y, 73);
      if (two < 0.25) put(x + 1, y, k < 0.5 ? PETAL : PINK); else if (two < 0.37) put(x, y + 1, PINK_MID);
    }
  }
});

interface Petal { bb: Billboard3D; x: number; y: number; e: number; vx: number; vy: number; ve: number; phase: number; t: number; rest: number }

/** No ar ao mesmo tempo, no máximo (pousadas contam). */
const MAX_PETALS = 36;
/** Raio (tiles) em volta do tronco dentro do qual o herói faz a árvore soltar pétalas. */
const NEAR = 16;
/** A copa vai desta altura até esta (tiles acima do chão), e tem esta meia-largura embaixo (tiles): a da prancha. */
const CROWN_LOW = 2.7 * SAKURA_SCALE;
const CROWN_HIGH = 5.8 * SAKURA_SCALE;
const CROWN_HALF = 3.2 * SAKURA_SCALE;

export class SakuraPetals {
  private readonly carpet: Billboard3D;
  private readonly petals: Petal[] = [];
  private nextIn = 1.5;
  private stillness = 0;
  private seq = 0;

  public constructor(private readonly at: { x: number; y: number }, private readonly hero: () => { x: number; y: number }) {
    registerPetals();
    this.carpet = world3d().objects.addBillboard(carpetTexture(), 0, { flat: true, flatY: 0.012, depthWrite: false, alphaTest: 0.5, depthLayer: 'ground' })
      .setDisplaySize(CARPET_W / 16, CARPET_H / 16)
      .setPosition(at.x, at.y + 0.55 * SAKURA_SCALE);
    (this.carpet.mesh.material as THREE.MeshLambertMaterial).color.setRGB(...SAKURA_TINT);
  }

  public setStillness(level: number): void {
    this.stillness = Math.min(1, Math.max(0, level));
  }

  public get count(): { air: number; ground: number } {
    const ground = this.petals.filter((p) => p.e <= 0).length;
    return { air: this.petals.length - ground, ground };
  }

  /** O sorteio daqui é determinístico pela ordem (hash do contador): o mesmo vale, as mesmas pétalas. */
  private rand(): number {
    this.seq += 1;
    return hash(this.seq, 3, 91);
  }

  private spawn(): void {
    if (this.petals.length >= MAX_PETALS) return;
    const e = CROWN_LOW + this.rand() * (CROWN_HIGH - CROWN_LOW);
    // A copa estreita para cima: no alto ela sai mais do meio.
    const half = CROWN_HALF * (1 - ((e - CROWN_LOW) / (CROWN_HIGH - CROWN_LOW)) * 0.45);
    const x = this.at.x + (this.rand() * 2 - 1) * half;
    const y = this.at.y + 0.12 + this.rand() * 0.3;
    const bb = world3d().objects.addBillboard(PETAL_FRAMES[0].key, 0, { alphaTest: 0.02, depthWrite: false })
      .setDisplaySize(2 / 16, 2 / 16)
      .setPosition(x, y)
      .setElevation(e);
    (bb.mesh.material as THREE.MeshLambertMaterial).color.setRGB(...SAKURA_TINT);
    this.petals.push({
      bb, x, y, e,
      // O vento do vale sopra para o leste, devagar; cada pétala com o seu tanto.
      vx: 0.1 + (this.rand() - 0.5) * 0.12,
      // Para o sul só um pouco: caem debaixo da copa e na clareira da pedra, não no vale inteiro.
      vy: 0.04 + this.rand() * 0.1,
      ve: 0.3 + this.rand() * 0.22,
      phase: this.rand() * 6.28,
      t: 0,
      rest: 5 + this.rand() * 5,
    });
  }

  public tick(dt: number): void {
    const h = this.hero();
    const near = Math.abs(h.x - this.at.x) + Math.abs(h.y - this.at.y) < NEAR;
    if (near) {
      this.nextIn -= dt;
      if (this.nextIn <= 0) {
        // Um sopro de vez em quando solta várias juntas; meditando, mais vezes.
        const gust = this.rand() < 0.06 + 0.1 * this.stillness;
        const n = gust ? 3 + Math.floor(this.rand() * 4) : 1;
        for (let i = 0; i < n; i += 1) this.spawn();
        const every = 3 - 1.9 * this.stillness;
        this.nextIn = every * (0.5 + this.rand());
      }
    }
    for (let i = this.petals.length - 1; i >= 0; i -= 1) {
      const p = this.petals[i];
      p.t += dt;
      if (p.e > 0) {
        // Desce dançando: o vai-e-vem de lado, a queda que hesita, e a pétala virando entre os três desenhos.
        p.x += (p.vx + Math.sin(p.t * 1.9 + p.phase) * 0.35) * dt;
        p.y += p.vy * dt;
        p.e = Math.max(0, p.e - p.ve * dt * (0.7 + 0.3 * Math.sin(p.t * 2.6 + p.phase)));
        const fr = PETAL_FRAMES[Math.floor(p.t * 5 + p.phase) % PETAL_FRAMES.length];
        if (p.bb.texKey !== fr.key) p.bb.setTexture(fr.key).setDisplaySize(fr.w / 16, fr.h / 16);
        if (p.e === 0) p.bb.setTexture(PETAL_FRAMES[1].key).setDisplaySize(2 / 16, 1 / 16);
        p.bb.setPosition(p.x, p.y).setElevation(p.e);
        continue;
      }
      // Pousada: fica um pouco na clareira e some devagar.
      p.rest -= dt;
      p.bb.setAlpha(Math.min(1, p.rest / 2));
      if (p.rest <= 0) {
        p.bb.destroy();
        this.petals.splice(i, 1);
      }
    }
  }

  public destroy(): void {
    for (const p of this.petals) p.bb.destroy();
    this.petals.length = 0;
    this.carpet.destroy();
  }
}

import type * as Engine from '@/game/engine';
import * as THREE from 'three';

import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { BED_SIZE, BED_Y } from '@/game/entities/FireBed';
import {
  CLEARING_H, CLEARING_W, paintChart, paintClearing, paintEasel, paintLog, paintRack, paintRing, paintWoodpile,
} from '@/game/render3d/campArt';
import { WHITE_SAFE_TINT } from '@/game/render3d/pixelForms';
import { BED_TEXTURE } from '@/game/render3d/skyTextures';
import { paintedCanvas } from '@/game/render3d/homeTextures';
import type { Paint } from '@/game/render3d/pixelForms';
import { registerTexture3D } from '@/game/render3d/textures3d';
import { world3d } from '@/game/render3d/World3D';
import { createCanvas } from '@/game/platform/platform';

/**
 * O ACAMPAMENTO DO HERÓI (pedido do autor: um lugar que é dele, "uma cabana improvisada tipo acampamento").
 *
 * Fica bem à direita do laguinho, a nordeste dele, no chão plano antes do outro lago. Sem barraca (pedido do autor): o
 * COLCHÃO fica no chão, ao lado das PEDRAS de um fogo frio com o tripé e a panela (a fogueira acesa é dos vizinhos —
 * lei do CLAUDE.md), o TRONCO de sentar e a CLAREIRA de terra batida embaixo de tudo; e quatro lugares vazios que se
 * enchem sozinhos: cada pedido fechado deixa ali uma LEMBRANÇA de quem pediu — o varal de cogumelos da Shui, o
 * quadro da Sisi, a lenha do Marco e o mapa de estrelas da Thea. O mago manda o herói dormir aqui, e a primeira noite
 * no colchão é a da primeira visita da Morte (GameScene.sleepAtCamp).
 *
 *          x52              x53              x54        x55
 *   y47   mapa da Thea       .                .        quadro da Sisi
 *   y48   varal da Shui   COLCHÃO         (o Z daqui) lenha do Marco
 *   y49   tronco            pedras            .        (a entrada vem do sudeste, pelo 55,50)
 *
 * O chão do acampamento fica limpo no world.json (scripts/acampamento.mjs, com a mesma tabela de tiles), e as peças
 * são sólidas aqui, como os achados do vale.
 */

export type CampPieceKind = 'bed' | 'ring' | 'log' | 'rack' | 'easel' | 'woodpile' | 'chart';

/** Quem deixa cada lembrança: o id do pedido em dialogs/NpcQuests. */
export const CAMP_MEMENTOS: ReadonlyArray<{ kind: CampPieceKind; quest: string; x: number; y: number }> = [
  { kind: 'rack', quest: 'radiationSuit', x: 52, y: 48 },
  { kind: 'easel', quest: 'painter', x: 55, y: 47 },
  { kind: 'woodpile', quest: 'businessMan', x: 55, y: 48 },
  { kind: 'chart', quest: 'astronaut', x: 52, y: 47 },
];
/** O COLCHÃO fixo, ao lado das pedras (pedido do autor: sem barraca; o colchão fica, e ele dorme ali). */
export const CAMP_BED = { x: 53, y: 48 } as const;
export const CAMP_RING = { x: 53, y: 49 } as const;
/** O tronco de sentar, ao lado do fogo: o herói senta nele e olha as pedras. */
export const CAMP_LOG = { x: 52, y: 49 } as const;
/** A clareira de terra batida: o centro e o tamanho, em tiles. */
const CLEARING = { x: 53.8, y: 48.5, w: CLEARING_W / 16, h: CLEARING_H / 16 };

const PAINTERS: Readonly<Record<Exclude<CampPieceKind, 'bed'>, { paint: (rect: Paint) => void; w: number; h: number }>> = {
  ring: { paint: paintRing, w: 16, h: 16 },
  log: { paint: paintLog, w: 16, h: 16 },
  rack: { paint: paintRack, w: 16, h: 16 },
  easel: { paint: paintEasel, w: 16, h: 16 },
  woodpile: { paint: paintWoodpile, w: 16, h: 16 },
  chart: { paint: paintChart, w: 16, h: 16 },
};
const texture = (kind: CampPieceKind): string => `hero-camp-${kind}`;
const CLEARING_TEXTURE = 'hero-camp-clearing';
/** O tom das casas e dos achados: a luz do mundo estoura os claros. */
const CAMP_TINT = 0xa8a4a0;
const SHADOW = { rx: 0.42, rz: 0.2, alpha: 0.3 };

let registered = false;
const registerTextures = (): void => {
  if (registered) return;
  for (const [kind, { paint, w, h }] of Object.entries(PAINTERS)) {
    const tex = new THREE.CanvasTexture(paintedCanvas(paint, w, h));
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    registerTexture3D(texture(kind as CampPieceKind), tex);
  }
  const ground = createCanvas();
  ground.width = CLEARING_W;
  ground.height = CLEARING_H;
  const ctx = ground.getContext('2d');
  if (ctx) paintClearing(ctx);
  const tex = new THREE.CanvasTexture(ground);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  registerTexture3D(CLEARING_TEXTURE, tex);
  registered = true;
};

export class HeroCamp {
  private readonly bodies: Billboard3D[] = [];
  private readonly mementos = new Map<string, Billboard3D>();

  public constructor(private readonly scene: Engine.Scene, private readonly questDone: (quest: string) => boolean) {
    registerTextures();
    const w3 = world3d();
    // A clareira de terra batida: pintura no chão, por baixo das sombras (como a estrada antiga).
    this.bodies.push(w3.addBillboard(CLEARING_TEXTURE, 0, { flat: true, flatY: 0.011, depthWrite: false, renderOrder: 1 })
      .setDisplaySize(CLEARING.w, CLEARING.h)
      .setTint(0xd6d2ca)
      .setPosition(CLEARING.x, CLEARING.y));
    // O colchão: o mesmo que o herói joga no chão nas fogueiras dos vizinhos, aqui deitado para ficar.
    this.bodies.push(w3.addBillboard(BED_TEXTURE, 0, { flat: true, flatY: BED_Y })
      .setTint(WHITE_SAFE_TINT)
      .setDisplaySize(BED_SIZE, BED_SIZE)
      .setPosition(CAMP_BED.x, CAMP_BED.y));
    // O fogo com o tripé e a panela: deitado no colchão, o herói fica um pouco atrás da panela, e isso é de
    // propósito (pedido do autor: dá a imersão de estar dormindo ao pé do fogo).
    this.bodies.push(w3.addBillboard(texture('ring'), 0, {})
      .setDisplaySize(1, 1)
      .setTint(CAMP_TINT)
      .setPosition(CAMP_RING.x, CAMP_RING.y));
    // O tronco: um nada atrás do tile, como os bancos — quem senta fica na frente dele.
    this.bodies.push(w3.addBillboard(texture('log'), 0, { groundShadow: { rx: 0.42, rz: 0.16, alpha: 0.28 } })
      .setDisplaySize(1, 1)
      .setTint(CAMP_TINT)
      .setPosition(CAMP_LOG.x, CAMP_LOG.y - 0.05));
    this.refresh(false);
  }

  /** Põe no acampamento a lembrança de cada pedido já fechado. Com `animate`, a nova cai no lugar devagar. */
  public refresh(animate: boolean): void {
    for (const m of CAMP_MEMENTOS) {
      if (this.mementos.has(m.quest) || !this.questDone(m.quest)) continue;
      const body = world3d().addBillboard(texture(m.kind), 0, { groundShadow: SHADOW })
        .setDisplaySize(1, 1)
        .setTint(CAMP_TINT)
        .setPosition(m.x, m.y);
      this.mementos.set(m.quest, body);
      if (animate) {
        body.setAlpha(0).setElevation(0.7);
        this.scene.tweens.add({ targets: body, alpha: 1, elevation: 0, duration: 700, ease: 'Bounce.easeOut' });
      }
    }
  }

  /** A peça do acampamento neste tile (a cabana ocupa dois), ou nada. As lembranças só existem depois do pedido. */
  public at(x: number, y: number): CampPieceKind | null {
    if (CAMP_BED.x === x && CAMP_BED.y === y) return 'bed';
    if (CAMP_RING.x === x && CAMP_RING.y === y) return 'ring';
    if (CAMP_LOG.x === x && CAMP_LOG.y === y) return 'log';
    const m = CAMP_MEMENTOS.find((p) => p.x === x && p.y === y);
    return m && this.mementos.has(m.quest) ? m.kind : null;
  }

  /** Quantas lembranças estão no acampamento (a janela do playtest). */
  public get mementoCount(): number {
    return this.mementos.size;
  }

  public destroy(): void {
    for (const b of this.bodies) b.destroy();
    for (const b of this.mementos.values()) {
      this.scene.tweens?.killTweensOf(b);
      b.destroy();
    }
    this.bodies.length = 0;
    this.mementos.clear();
  }
}

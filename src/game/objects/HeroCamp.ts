import * as THREE from 'three';

import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { BED_SIZE, BED_Y } from '@/game/entities/FireBed';
import {
  CLEARING_H, CLEARING_W, paintChart, paintClearing, paintEasel, paintLog, paintNotebook, paintRack, paintRing,
  paintWoodpile,
} from '@/game/render3d/campArt';
import { WHITE_SAFE_TINT } from '@/game/render3d/pixelForms';
import { BED_TEXTURE } from '@/game/render3d/skyTextures';
import { blanketTexture, registerHomeArt } from '@/game/render3d/homeArt';
import { paintedCanvas } from '@/game/render3d/homeTextures';
import type { Paint } from '@/game/render3d/pixelForms';
import { registerTexture3D } from '@/game/render3d/textures3d';
import { world3d } from '@/game/render3d/World3D';
import { createCanvas } from '@/game/platform/platform';
import { adventureState } from '@/game/runtime/adventureState';
import type { ClothDye } from '@/game/runtime/homeState';

/**
 * O ACAMPAMENTO DO HERÓI (pedido do autor: um lugar que é dele, "uma cabana improvisada tipo acampamento").
 *
 * Fica bem à direita do laguinho, a nordeste dele, no chão plano antes do outro lago. Sem barraca (pedido do autor): o
 * COLCHÃO fica no chão, ao lado das PEDRAS de um fogo frio com o tripé e a panela (a fogueira acesa é dos vizinhos —
 * lei do CLAUDE.md), com o CADERNO DE CAMPO em cima do colchão (a coleção de tudo que o herói já pegou,
 * scenes/game/CampNotebook) e a CLAREIRA de terra batida embaixo de tudo. O mago manda o herói dormir aqui, e a
 * primeira noite no colchão é a da primeira visita da Morte (GameScene.sleepAtCamp).
 *
 * É SÓ ISSO que vem de início (pedido do autor, 2026-11-17): o tronco de sentar, a tina, a placa, os enfeites e as
 * lembranças dos pedidos o jogador põe com a mão dele, no modo de construção da bancada (objects/CampPieces,
 * scenes/game/BuildMode). A bancada é o prop `toolbox` do world.json no canto nordeste (55,45).
 *
 *          x52      x53       x54
 *   y47             caderno   (o Z daqui)
 *   y48             COLCHÃO   (o Z daqui)
 *   y49             pedras
 *
 * O chão do acampamento fica limpo no world.json (scripts/acampamento.mjs, com a mesma tabela de tiles), e em volta
 * dele fica o mato alto verde que só a foice da Morte corta (scripts/mato-do-acampamento.mjs).
 */

export type CampFixedKind = 'bed' | 'ring' | 'notebook';
/** As peças desenhadas no traço do acampamento (render3d/campArt) que o jogador põe (objects/CampPieces). */
export type CampArtPiece = 'log' | 'rack' | 'easel' | 'woodpile' | 'chart';

/** O COLCHÃO fixo, ao lado das pedras (pedido do autor: sem barraca; o colchão fica, e ele dorme ali). */
export const CAMP_BED = { x: 53, y: 48 } as const;
export const CAMP_RING = { x: 53, y: 49 } as const;
/** O caderno de campo, em cima do colchão (pedido do autor): lê-se de (54,47) ou de (53,46). */
export const CAMP_NOTEBOOK = { x: 53, y: 47 } as const;
/**
 * A bancada (prop `toolbox` do world.json, scripts/acampamento.mjs), no canto nordeste, e o tile de FRENTE para ela: ela
 * olha para o sul, e o carvalhinho que tapava essa frente saiu (2026-11-17). De lado (54,45) também se usa.
 */
export const CAMP_BENCH = { x: 55, y: 45 } as const;
export const CAMP_BENCH_FRONT = { x: 55, y: 46 } as const;
/** O meio do acampamento: é dele que se mede "chegar em casa". */
export const CAMP_CENTER = { x: 53.5, y: 48 } as const;
/** A clareira de terra batida: o centro e o tamanho, em tiles. */
const CLEARING = { x: 53.8, y: 48.5, w: CLEARING_W / 16, h: CLEARING_H / 16 };

const PAINTERS: Readonly<Record<'ring' | 'notebook' | CampArtPiece, (rect: Paint) => void>> = {
  ring: paintRing,
  notebook: paintNotebook,
  log: paintLog,
  rack: paintRack,
  easel: paintEasel,
  woodpile: paintWoodpile,
  chart: paintChart,
};
/** A textura 3D de uma peça desenhada no traço do acampamento. */
export const campTexture = (kind: 'ring' | 'notebook' | CampArtPiece): string => `hero-camp-${kind}`;
/** O pintor dela (o ícone do modo de construção sai do mesmo desenho). */
export const campPainter = (kind: CampArtPiece): ((rect: Paint) => void) => PAINTERS[kind];
const CLEARING_TEXTURE = 'hero-camp-clearing';
/** O tom das casas e dos achados: a luz do mundo estoura os claros. */
export const CAMP_TINT = 0xa8a4a0;

let registered = false;
/** As texturas do acampamento (o fogo, o caderno, o tronco, as lembranças e a clareira), uma vez só. */
export const registerCampArt = (): void => {
  if (registered) return;
  for (const [kind, paint] of Object.entries(PAINTERS)) {
    const tex = new THREE.CanvasTexture(paintedCanvas(paint, 16, 16));
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    registerTexture3D(campTexture(kind as CampArtPiece), tex);
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
  private readonly bed: Billboard3D;

  public constructor() {
    registerCampArt();
    registerHomeArt();
    const w3 = world3d();
    // A clareira de terra batida: pintura no chão, por baixo das sombras (como a estrada antiga).
    this.bodies.push(w3.objects.addBillboard(CLEARING_TEXTURE, 0, { flat: true, flatY: 0.011, depthWrite: false, renderOrder: 1 })
      .setDisplaySize(CLEARING.w, CLEARING.h)
      .setTint(0xd6d2ca)
      .setPosition(CLEARING.x, CLEARING.y));
    // O colchão: o mesmo que o herói joga no chão nas fogueiras dos vizinhos, aqui deitado para ficar — com a manta
    // da cor que ele tingiu (a natural é o colchão de sempre).
    this.bed = w3.objects.addBillboard(this.bedTexture(adventureState().home.blanket), 0, { flat: true, flatY: BED_Y })
      .setTint(WHITE_SAFE_TINT)
      .setDisplaySize(BED_SIZE, BED_SIZE)
      .setPosition(CAMP_BED.x, CAMP_BED.y);
    this.bodies.push(this.bed);
    // O fogo com o tripé e a panela: deitado no colchão, o herói fica um pouco atrás da panela, e isso é de
    // propósito (pedido do autor: dá a imersão de estar dormindo ao pé do fogo).
    this.bodies.push(w3.objects.addBillboard(campTexture('ring'), 0, {})
      .setDisplaySize(1, 1)
      .setTint(CAMP_TINT)
      .setPosition(CAMP_RING.x, CAMP_RING.y));
    // O caderno aberto no chão: um nada atrás do tile, como os bancos.
    this.bodies.push(w3.objects.addBillboard(campTexture('notebook'), 0, { groundShadow: { rx: 0.4, rz: 0.12, alpha: 0.24 } })
      .setDisplaySize(1, 1)
      .setTint(CAMP_TINT)
      .setPosition(CAMP_NOTEBOOK.x, CAMP_NOTEBOOK.y - 0.05));
  }

  /** A manta do colchão nesta cor. */
  public setBlanket(dye: ClothDye): void {
    this.bed.setTexture(this.bedTexture(dye), 0);
  }

  private bedTexture(dye: ClothDye): string {
    return dye === 'natural' ? BED_TEXTURE : blanketTexture(dye);
  }

  /** A peça fixa do acampamento neste tile, ou nada. */
  public at(x: number, y: number): CampFixedKind | null {
    if (CAMP_BED.x === x && CAMP_BED.y === y) return 'bed';
    if (CAMP_RING.x === x && CAMP_RING.y === y) return 'ring';
    if (CAMP_NOTEBOOK.x === x && CAMP_NOTEBOOK.y === y) return 'notebook';
    return null;
  }

  public destroy(): void {
    for (const b of this.bodies) b.destroy();
    this.bodies.length = 0;
  }
}

import { profiler } from '@/game/debug/Profiler';
import * as Engine from '@/game/engine';

import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import type { PropKind } from '@/game/world/worldSchema';
import { getCrashProps } from '@/game/world/WorldData';

import { PROP_TINT, TILESET as P, flushTextures, hash, smooth, texture, type Put } from './nature/kit';

/**
 * A CRATERA DA NAVE DA THEA (pedido do autor: "no lugar exato onde era a casa dele, faça uma cratera com algumas peças
 * quebradas da nave… para mostrar exatamente o lugar que a nave caiu"). A história contada pelo cenário: ninguém
 * precisa dizer que ela caiu do céu — o chão diz.
 *
 *   · `crashCrater`   o BURACO: a terra jogada para fora em anel, o fundo escuro e queimado, riscos de fuligem
 *                     saindo em raio, cacos de metal brilhando no fundo (um decalque deitado; o centro é sólido);
 *   · `shipHull`      uma CHAPA DO CASCO, torta e meio enterrada: branca, rebites, a faixa laranja da nave;
 *   · `shipThruster`  o PROPULSOR caído de lado, a boca preta virada para cá — e ainda saindo um fio de fumaça;
 *   · `shipFin`       a ALETA cravada no chão em diagonal, com a vigia azul e a ponta laranja.
 *
 * As cores são as da casa-nave que ela tinha (casco branco, faixa laranja, vigia azul). Arte do tileset: 16 px por
 * tile, sem contorno, a sombra preta de contato no pé. Props do world.json (o editor põe e apaga);
 * scripts/cratera-da-nave.mjs monta o lugar. Bloqueia pelo próprio prop (`at`).
 */
export const CRASH_KINDS: ReadonlySet<PropKind> = new Set<PropKind>(['crashCrater', 'shipHull', 'shipThruster', 'shipFin']);
type CrashKind = 'crashCrater' | 'shipHull' | 'shipThruster' | 'shipFin';

const SIZES: Readonly<Record<Exclude<CrashKind, 'crashCrater'>, { w: number; h: number }>> = {
  shipHull: { w: 16, h: 12 },
  shipThruster: { w: 16, h: 13 },
  shipFin: { w: 16, h: 19 },
};

/** O monte de terra no pé de cada peça (ela entrou no chão). */
const mound = (put: Put, y: number, x0: number, x1: number): void => {
  for (let x = x0; x <= x1; x += 1) {
    put(x, y - 1, hash(x, y, 91) < 0.5 ? P.ochre : P.bark);
    put(x, y, x % 3 === 0 ? P.barkDk : P.bark);
  }
  for (let x = x0 - 1; x <= x1 + 1; x += 1) put(x, y + 1, P.ink, x < x0 || x > x1 ? 0.5 : 1);
};

const paintHull = (put: Put): void => {
  // Uma chapa curva (mais alta na esquerda, dobrada na direita), a borda rasgada.
  for (let x = 1; x <= 14; x += 1) {
    const top = 2 + Math.round(Math.abs(x - 5) * 0.35) + (x > 11 ? x - 11 : 0);
    for (let y = top; y <= 9; y += 1) {
      const edge = y === top;
      const stripe = y === top + 3 || y === top + 4;
      const scorch = hash(x, y, 92) < (x > 9 ? 0.45 : 0.08);
      put(x, y, edge ? P.bone : stripe ? (y === top + 3 ? P.orange : P.amber) : scorch ? P.slate : x < 4 ? P.bone : x > 10 ? P.grey : P.pale);
    }
    // A borda rasgada de baixo, em dentes.
    if (x % 3 === 1) put(x, 9, P.slateDk);
  }
  // Rebites.
  for (const x of [3, 7, 11]) put(x, 7, P.greyDk);
  mound(put, 10, 2, 13);
};

const paintThruster = (put: Put): void => {
  // O cone do propulsor, de lado: largo na boca (esquerda), estreito atrás (direita).
  for (let x = 4; x <= 14; x += 1) {
    const half = Math.round(4 - (x - 4) * 0.28);
    for (let dy = -half; dy <= half; dy += 1) {
      const y = 6 + dy;
      const ring = x % 3 === 0;
      put(x, y, dy === -half ? P.pale : dy === half ? P.greyDk : ring ? P.greyDk : dy < 0 ? P.grey : P.stoneDk);
    }
  }
  // A boca preta, de frente para a câmera (um oval), e a borda dela queimada.
  for (let dy = -4; dy <= 4; dy += 1) {
    for (let dx = -2; dx <= 1; dx += 1) {
      const d = Math.hypot(dx / 2.2, dy / 4.4);
      if (d > 1) continue;
      put(3 + dx, 6 + dy, d > 0.75 ? P.rustDk : d > 0.5 ? P.slateDk : P.ink);
    }
  }
  put(14, 5, P.orange); put(14, 6, P.orange); put(14, 7, P.amber); // a faixa laranja do fim do cone
  mound(put, 11, 2, 13);
};

const paintFin = (put: Put): void => {
  // Uma aleta triangular cravada em diagonal: a raiz enterrada embaixo à esquerda, a ponta em cima à direita.
  for (let y = 1; y <= 15; y += 1) {
    const x0 = 2 + Math.floor((15 - y) * 0.45);
    const x1 = Math.min(13, x0 + Math.floor(y * 0.55) + 1);
    for (let x = x0; x <= x1; x += 1) {
      const edge = x === x0;
      const tip = y < 5;
      put(x, y, tip ? (y < 3 ? P.orange : P.amber) : edge ? P.bone : x === x1 ? P.grey : P.pale);
    }
  }
  // A vigia azul, rachada.
  for (const [x, y, c] of [[7, 8, P.navy], [8, 8, P.sky], [7, 9, P.sky], [8, 9, P.navy], [9, 9, P.navy], [8, 10, P.navy], [8, 7, P.greyDk], [6, 9, P.greyDk], [9, 8, P.ice]] as const) put(x, y, c);
  put(10, 12, P.slate); put(11, 12, P.slate); put(10, 13, P.slateDk); // fuligem
  mound(put, 16, 2, 13);
};

/** O BURACO, deitado: 64×52 px = 4 × 3,25 tiles. */
const CRATER_W = 64;
const CRATER_H = 52;
const paintCrater = (put: Put): void => {
  const cx = CRATER_W / 2;
  const cy = CRATER_H / 2;
  for (let y = 0; y < CRATER_H; y += 1) {
    for (let x = 0; x < CRATER_W; x += 1) {
      // A distância "torta" ao centro: o buraco não é um círculo de compasso.
      const a = Math.atan2(y - cy, x - cx);
      const wobble = 1 + Math.sin(a * 5 + 1.3) * 0.06 + Math.sin(a * 3) * 0.05;
      const d = Math.hypot((x - cx) / (CRATER_W * 0.3), (y - cy) / (CRATER_H * 0.3)) / wobble;
      const r = hash(x, y, 93);
      // Os riscos de fuligem que saem em raio, além da borda.
      const ray = Math.abs(Math.sin(a * 7 + 0.4)) > 0.93 && d < 1.65 && d > 0.95;
      if (d > 1.65) continue;
      if (d > 1.18) {
        if (ray && r < 0.7) put(x, y, r < 0.35 ? P.slateDk : P.slate, 0.85 * (1 - smooth(1.3, 1.65, d)));
        else if (r < 0.12 * (1.65 - d) / 0.47) put(x, y, r < 0.05 ? P.ochre : P.bark, 0.8); // torrões jogados longe
        continue;
      }
      if (d > 0.88) { put(x, y, r < 0.18 ? P.sand : r < 0.55 ? P.ochre : P.bark); continue; } // o anel de terra
      if (d > 0.7) { put(x, y, r < 0.3 ? P.barkDk : P.barkDeep); continue; } // a parede de dentro, na sombra
      if (d > 0.4) { put(x, y, r < 0.25 ? P.slate : r < 0.5 ? P.barkDeep : P.slateDk); continue; }
      put(x, y, r < 0.06 ? P.pale : r < 0.1 ? P.grey : r < 0.6 ? P.night : P.slateDk); // o fundo queimado, com cacos
    }
  }
};

const PUFF_SIZE = 10;
const paintPuff = (put: Put): void => {
  for (let y = 0; y < PUFF_SIZE; y += 1) {
    for (let x = 0; x < PUFF_SIZE; x += 1) {
      const d = Math.hypot(x - 4.5, y - 4.5) / 4.6;
      if (d > 1) continue;
      put(x, y, P.pale, 0.9 * (1 - d * d));
    }
  }
};

const key = (kind: CrashKind): string => `crash-${kind}`;
export const crashIconKey = (kind: PropKind): string => key(kind as CrashKind);
const PUFF = 'crash-puff';

let registered = false;
/** Desenha e registra os quadros da cratera (o jogo e o editor). */
export const registerCrashTextures = (): void => {
  if (registered) return;
  flushTextures();
  texture(key('crashCrater'), CRATER_W, CRATER_H, paintCrater);
  texture(key('shipHull'), SIZES.shipHull.w, SIZES.shipHull.h, paintHull);
  texture(key('shipThruster'), SIZES.shipThruster.w, SIZES.shipThruster.h, paintThruster);
  texture(key('shipFin'), SIZES.shipFin.w, SIZES.shipFin.h, paintFin);
  texture(PUFF, PUFF_SIZE, PUFF_SIZE, paintPuff, true);
  registered = true;
};

/** O fio de fumaça do propulsor: poucas baforadas, devagar (a queda já faz tempo). */
const PUFFS = 3;
const PUFF_LIFE = 4200;

export class CrashSite {
  private readonly tiles = new Set<string>();
  private readonly bodies: Billboard3D[] = [];
  private readonly puffs: Array<{ bb: Billboard3D; x: number; y: number; phase: number }> = [];
  private clock = 0;

  public constructor(private readonly scene: Engine.Scene) {
    registerCrashTextures();
    const w3 = world3d();
    for (const p of getCrashProps()) {
      const kind = p.type as CrashKind;
      const { worldX: x, worldY: y } = p;
      this.tiles.add(`${x},${y}`);
      if (kind === 'crashCrater') {
        this.bodies.push(
          w3.objects.addBillboard(key(kind), 0, { flat: true, flatY: 0.011, depthWrite: false, alphaTest: 0.05, depthLayer: 'ground' })
            .setDisplaySize(CRATER_W / 16, CRATER_H / 16)
            .setPosition(x, y + 0.1)
            .setTint(PROP_TINT),
        );
        continue;
      }
      const { w, h } = SIZES[kind];
      this.bodies.push(
        w3.objects.addBillboard(key(kind), 0, { groundShadow: { rx: 0.42, rz: 0.15, alpha: 0.3 } })
          .setDisplaySize(w / 16, h / 16)
          .setPosition(x, y)
          .setFlipX(kind === 'shipThruster' && x > 37)
          .setTint(PROP_TINT),
      );
      if (kind === 'shipThruster') {
        // A fumaça sai da boca do propulsor (o lado da boca depende do espelho).
        const mouthX = x + (x > 37 ? 0.3 : -0.3);
        for (let i = 0; i < PUFFS; i += 1) {
          const bb = w3.objects.addBillboard(PUFF, 0, { centered: true, depthWrite: false, alphaTest: 0.01, fog: false }).setAlpha(0);
          this.puffs.push({ bb, x: mouthX, y: y + 0.05, phase: (i / PUFFS) * PUFF_LIFE });
        }
      }
    }
    if (this.puffs.length) scene.events.on(Engine.Scenes.Events.POST_UPDATE, this.onFrame, this);
  }

  /** O quadro, medido (debug/Profiler: seção `life.crash`; desligado, não custa nada). */
  private onFrame(): void {
    profiler.begin('life.crash');
    this.frameTick();
    profiler.end('life.crash');
  }

  private frameTick(): void {
    this.clock += Math.min(100, this.scene.game.loop.delta);
    for (const p of this.puffs) {
      const t = ((this.clock + p.phase) % PUFF_LIFE) / PUFF_LIFE;
      const size = 0.28 + t * 0.7;
      p.bb.setPosition(p.x + t * 0.35 + Math.sin(t * 6 + p.phase) * 0.05, p.y)
        .setElevation(0.35 + t * 1.3)
        .setDisplaySize(size, size)
        .setAlpha(0.32 * smooth(0, 0.15, t) * (1 - smooth(0.55, 1, t)));
    }
  }

  /** Há uma peça da queda neste tile (o fundo da cratera, ou um pedaço da nave): ele bloqueia a passagem. */
  public at(x: number, y: number): boolean {
    return this.tiles.has(`${x},${y}`);
  }

  public destroy(): void {
    this.scene.events.off(Engine.Scenes.Events.POST_UPDATE, this.onFrame, this);
    for (const b of [...this.bodies, ...this.puffs.map((p) => p.bb)]) b.destroy();
    this.bodies.length = 0;
    this.puffs.length = 0;
  }
}

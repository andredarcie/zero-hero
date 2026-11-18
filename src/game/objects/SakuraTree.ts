import { profiler } from '@/game/debug/Profiler';
import * as Engine from '@/game/engine';
import * as THREE from 'three';

import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { drawSakura, SAKURA_H, SAKURA_TINT, SAKURA_W } from '@/game/render3d/sakuraArt';
import { world3d } from '@/game/render3d/World3D';
import { registerPixelTexture, SakuraPetals } from './SakuraPetals';

/**
 * A CEREJEIRA DA MEDITAÇÃO (pedido do autor, 2026-11-16): logo acima da pedra de meditar, com um respiro, uma
 * cerejeira rosa, a MAIOR ÁRVORE do vale (e depois, a pedido, menor: ver render3d/sakuraArt), que solta pétalas de vez
 * em quando. A sakura é a beleza do que
 * passa: a flor que cai é a mesma lição da meditação, o pensamento que vem e vai. O desenho mora em
 * render3d/sakuraArt (o traço das árvores do bosque); as pétalas, em SakuraPetals.
 *
 * O TRONCO fica em (45,37), no vão entre dois pinheiros da mata, acima do vão entre a pedra e a pilha; a linha 38 fica
 * livre, o respiro. A copa se abre por cima da mata. scripts/meditacao.mjs confere o tile do tronco (mesma tabela).
 */
export const SAKURA_TRUNK = { x: 45, y: 37 } as const;
/**
 * O desenho fica ao sul do tile do tronco: as árvores da mata (render3d/forest) saem do centro do tile, e as das
 * linhas 37 e 38 passavam na frente do pé dele. Assim a árvore fica na frente da mata, e a pedra (39) na frente dela.
 */
export const SAKURA_DRAW_Y = SAKURA_TRUNK.y + 1.35;
/** Antes da silhueta do herói, como as árvores do bosque (BigTrees.TREE_RENDER_ORDER). */
const TREE_RENDER_ORDER = -2;
/** Quanto tempo cada quadro de vento fica (ms): a copa grande balança mais devagar que a do carvalho (1300). */
const WIND_FRAME_MS = 1900;

const sakuraKey = (f: number): string => `sakura-tree-${f}`;

export class SakuraTree {
  private readonly bb: Billboard3D;
  private readonly petals: SakuraPetals;
  private clock = 0;
  private frame = -1;

  public constructor(private readonly scene: Engine.Scene, hero: () => { x: number; y: number }) {
    for (const f of [0, 1]) registerPixelTexture(sakuraKey(f), SAKURA_W, SAKURA_H, (put) => drawSakura(put, f));
    this.bb = world3d().objects.addBillboard(sakuraKey(0), 0, { renderOrder: TREE_RENDER_ORDER })
      .setDisplaySize(SAKURA_W / 16, SAKURA_H / 16)
      .setPosition(SAKURA_TRUNK.x, SAKURA_DRAW_Y);
    (this.bb.mesh.material as THREE.MeshLambertMaterial).color.setRGB(...SAKURA_TINT);
    this.petals = new SakuraPetals({ x: SAKURA_TRUNK.x, y: SAKURA_DRAW_Y }, hero);
    scene.events.on(Engine.Scenes.Events.POST_UPDATE, this.onFrame, this);
  }

  /** O tronco bloqueia: o tile dele, e só ele (a copa é ar). */
  public at(x: number, y: number): boolean {
    return x === SAKURA_TRUNK.x && y === SAKURA_TRUNK.y;
  }

  /** Mais pétalas no ar enquanto o herói medita embaixo dela (0 normal, 1 meditando). */
  public setStillness(level: number): void {
    this.petals.setStillness(level);
  }

  /** As pétalas no ar e no chão (a janela do playtest). */
  public get petalCount(): { air: number; ground: number } {
    return this.petals.count;
  }

  private onFrame(): void {
    profiler.begin('life.sakura');
    const dt = Math.min(100, this.scene.game.loop.delta);
    this.clock += dt;
    const f = Math.floor(this.clock / WIND_FRAME_MS) % 2;
    if (f !== this.frame) {
      this.frame = f;
      this.bb.setTexture(sakuraKey(f));
    }
    this.petals.tick(dt / 1000);
    profiler.end('life.sakura');
  }

  public destroy(): void {
    this.scene.events.off(Engine.Scenes.Events.POST_UPDATE, this.onFrame, this);
    this.petals.destroy();
    this.bb.destroy();
  }
}

import type Phaser from 'phaser';

import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import { wireShapeFrame, type WireShape } from '@/game/world/wireShapes';
import type { WorldProp } from './WorldProp';

// O CABO DE ENERGIA no chao: o fio fisico por onde a rede passa. Ate ele existir, energia era
// um nome de variavel — um barramento sem corpo. O cabo transforma a rede em GEOGRAFIA: o
// autor deita o caminho, tile a tile, da fonte (caldeira, roda, placa) ate a maquina que
// consome, e a corrente e um flood-fill por adjacencia ortogonal (GameScene.updateWireEnergy).
// Um vao de um tile e um circuito aberto — que e exatamente o que faz dele peca de puzzle.
// A arte e a folha `wire` da Sprite Factory (7 formas + 7 filetes; ver wireShapes.ts).
//
// O cabo NAO bloqueia (e um fio rente ao chao — o heroi pisa por cima) e NAO conduz fogo: capa
// de borracha nao entra no grafo de combustivel. Sao dois quads flat: a base escura sempre
// visivel e o nucleo amarelo em aditivo, que so aparece com a rede viva — apagado ele e um
// fio morto no chao, aceso ele e a propria linha da energia, respirando.

const BASE_Y = 0.012; // acima do chao, abaixo de buracos de plantio (0.018) — nunca coplanar
const GLOW_Y = 0.022;
const WIRE_SIZE = 1; // o cabo cobre o tile inteiro: e ele que liga borda com borda

export class WireObject implements WorldProp {
  private readonly base: Billboard3D;
  private readonly glow: Billboard3D;
  private shape: WireShape = 'x';
  private live = false;
  private pulse?: Phaser.Tweens.Tween;

  public constructor(
    private readonly scene: Phaser.Scene,
    public readonly worldX: number,
    public readonly worldY: number,
  ) {
    this.base = world3d()
      .addBillboard('wire', wireShapeFrame('x', false), { flat: true, flatY: BASE_Y })
      .setPosition(worldX, worldY)
      .setDisplaySize(WIRE_SIZE, WIRE_SIZE);
    this.glow = world3d()
      .addBillboard('wire', wireShapeFrame('x', true), {
        flat: true, flatY: GLOW_Y, additive: true, fog: false, depthWrite: false,
      })
      .setPosition(worldX, worldY)
      .setDisplaySize(WIRE_SIZE, WIRE_SIZE)
      .setVisible(false);
  }

  /** A forma nasce dos vizinhos e e fixada UMA vez no boot (cabos e maquinas nao andam). */
  public setShape(shape: WireShape): void {
    this.shape = shape;
    this.base.setTexture('wire', wireShapeFrame(shape, false));
    this.glow.setTexture('wire', wireShapeFrame(shape, true));
  }

  public get wireShape(): WireShape { return this.shape; }
  public get isLive(): boolean { return this.live; }

  /** A rede escreve aqui todo frame; so as BORDAS (acender/apagar) custam alguma coisa. */
  public setLive(live: boolean): void {
    if (live === this.live) return;
    this.live = live;
    this.glow.setVisible(live);
    if (live) {
      // O nucleo respira — corrente e uma coisa viva, nao uma pintura (a gramatica do bombSpot).
      this.glow.setAlpha(1);
      this.pulse = this.scene.tweens.add({
        targets: this.glow,
        alpha: 0.66,
        duration: 620,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    } else {
      this.pulse?.stop();
      this.pulse = undefined;
    }
  }

  public destroy(): void {
    this.pulse?.stop();
    this.pulse = undefined;
    this.base.destroy();
    this.glow.destroy();
  }
}

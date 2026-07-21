import type Phaser from 'phaser';

import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import { wireShapeFrame, wireStubFrame, type WireShape, type WireSide } from '@/game/world/wireShapes';
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
  // Os PLUGUES: quads que moram no tile da MAQUINA vizinha, da borda compartilhada ate o pe
  // dela — sem eles o cabo morre na divisa e a maquina flutua com um vao de chao no meio.
  // Nenhum sprite vaza do proprio tile, entao a continuacao e um segundo quad no tile vizinho
  // (o truque da garra do braco). Pertencem a ESTE cabo: acendem e apagam com ele.
  private readonly plugs: Array<{ base: Billboard3D; glow: Billboard3D }> = [];
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

  /**
   * Quais vizinhos deste cabo precisam de plugue CENTRAL (caldeira/placa/braco/portao): nasce um
   * plugue no tile da maquina, entrando pela borda compartilhada. O flatY ganha um degrau
   * por lado — dois cabos plugando na MESMA maquina poem dois quads no mesmo tile, e sem o
   * degrau eles seriam coplanares onde se cruzam (a regra dos flat quads: separam por flatY).
   * A roda d'agua e a excecao: seu dinamo termina na borda do sprite, entao o proprio cabo do
   * tile vizinho encosta na tomada sem este prolongamento atravessar o rotor.
   */
  public setMachineSides(sides: Record<WireSide, boolean>): void {
    for (const plug of this.plugs) { plug.base.destroy(); plug.glow.destroy(); }
    this.plugs.length = 0;
    const DIRS: ReadonlyArray<readonly [WireSide, number, number, WireSide]> = [
      ['n', 0, -1, 's'], ['e', 1, 0, 'w'], ['s', 0, 1, 'n'], ['w', -1, 0, 'e'],
    ];
    for (const [side, dx, dy, entry] of DIRS) {
      if (!sides[side]) continue;
      const lift = 0.001 * (1 + DIRS.findIndex(([d]) => d === entry));
      const base = world3d()
        .addBillboard('wire', wireStubFrame(entry, false), { flat: true, flatY: BASE_Y + lift })
        .setPosition(this.worldX + dx, this.worldY + dy)
        .setDisplaySize(WIRE_SIZE, WIRE_SIZE);
      const glow = world3d()
        .addBillboard('wire', wireStubFrame(entry, true), {
          flat: true, flatY: GLOW_Y + lift, additive: true, fog: false, depthWrite: false,
        })
        .setPosition(this.worldX + dx, this.worldY + dy)
        .setDisplaySize(WIRE_SIZE, WIRE_SIZE)
        .setVisible(false);
      this.plugs.push({ base, glow });
    }
  }

  public get wireShape(): WireShape { return this.shape; }
  public get isLive(): boolean { return this.live; }

  /** A rede escreve aqui todo frame; so as BORDAS (acender/apagar) custam alguma coisa. */
  public setLive(live: boolean): void {
    if (live === this.live) return;
    this.live = live;
    const glows = [this.glow, ...this.plugs.map((p) => p.glow)];
    glows.forEach((g) => g.setVisible(live));
    if (live) {
      // O nucleo respira — corrente e uma coisa viva, nao uma pintura (a gramatica do bombSpot).
      // Os plugues respiram JUNTO: cabo e tomada sao um so fio.
      glows.forEach((g) => g.setAlpha(1));
      this.pulse = this.scene.tweens.add({
        targets: glows,
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
    for (const plug of this.plugs) { plug.base.destroy(); plug.glow.destroy(); }
    this.plugs.length = 0;
  }
}

import type Phaser from 'phaser';

import { ASSET_KEYS } from '@/game/constants';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';

/**
 * O QUE FICA DEPOIS — a caveira que o morto-vivo deixa no chao ao cair.
 *
 * Ate aqui matar uma caveira nao deixava marca nenhuma: o corpo se esfarelava e o tile voltava a
 * ser o mesmo tile de antes. Num mundo em que o cerco devolve corpo pela mesma cova
 * (ENEMY_RESPAWN_MS), isso apaga o unico registro de que o jogador ESTEVE ali e ganhou — e num
 * jogo sem HUD e sem contador de mortes, o chao e o unico lugar onde esse registro cabe. A ossada
 * e a memoria da briga.
 *
 * Tres decisoes, e as tres sao de renderer:
 *
 * - **A arte JA EXISTIA no tileset** (frame 27, "Caveira e Ossos" — o mesmo que o editor espalha
 *   pelo cemiterio). Nada de sprite novo: o cemiterio ja tinha desenhado o que sobra de alguem, e
 *   reusar aquele frame amarra os dois lugares na mesma leitura em vez de inventar uma segunda.
 * - **Quad DEITADO, no formato que o `prewarmShaders` ja segura** (`flat` + `alphaTest` baixo, a
 *   mesma forma da poca de gosma). Toda combinacao nova de opcoes e um programa novo, e compilar
 *   shader no frame em que um bicho morre e o pior engasgo que este renderer tem.
 * - **Ossada nao e uma luz e nao e um obstaculo**: e chao pintado. O heroi pisa por cima, o
 *   monstro anda por cima, e o fogo passa por cima — osso nao e combustivel.
 *
 * O TETO EXISTE POR CAUSA DO EXPLORADOR. Cada ossada e um billboard, e billboard e draw call; num
 * mundo infinito, uma expedicao longa deixaria centenas delas penduradas atras do herói para
 * sempre. Passou de MAX_CORPSES, a mais antiga se desfaz — o campo de batalha recente fica, o
 * antigo o escuro reclama de volta.
 */

/** "Caveira e Ossos" no `forest_tile_set` — a arte de cemiterio que o mundo ja usava. */
const BONES_FRAME = 27;
/** Em tiles. Menor que um tile inteiro: e o que sobra de alguem, nao alguem. */
const BONES_SIZE = 0.85;
/** Quantas ossadas coexistem. Ver o teto acima — e uma conta de draw call, nao de gosto. */
const MAX_CORPSES = 24;
/** A ossada nao aparece estalando: ela ASSENTA enquanto o corpo acaba de se desfazer por cima. */
const SETTLE_MS = 280;

type Corpse = { worldX: number; worldY: number; sprite: Billboard3D };

export class CorpseDecals {
  private readonly corpses: Corpse[] = [];

  public constructor(private readonly scene: Phaser.Scene) {}

  /** Quantas ossadas estao no chao agora (debug/playtest). */
  public get count(): number {
    return this.corpses.length;
  }

  public drop(worldX: number, worldY: number): void {
    // Uma cova devolve corpo no MESMO tile a cada ENEMY_RESPAWN_MS, entao matar duas vezes ali
    // empilharia duas ossadas coplanares — que e z-fighting garantido, e le como um borrao.
    if (this.corpses.some((c) => c.worldX === worldX && c.worldY === worldY)) return;
    while (this.corpses.length >= MAX_CORPSES) this.kill(0);

    const sprite = world3d()
      .addBillboard(ASSET_KEYS.forestTileset, BONES_FRAME, {
        flat: true, flatY: 0.02, alphaTest: 0.02,
      })
      .setPosition(worldX, worldY)
      // Espelhar sai de graca e quebra a repeticao: duas ossadas vizinhas nao podem ser a mesma
      // foto. Vem da PARIDADE do tile e nao de um sorteio — a mesma cova sempre deixa a mesma
      // ossada, o que importa porque ela e a marca daquele lugar.
      .setFlipX((worldX + worldY) % 2 === 0)
      .setDisplaySize(BONES_SIZE, BONES_SIZE)
      .setAlpha(0);
    this.corpses.push({ worldX, worldY, sprite });

    this.scene.tweens.add({
      targets: sprite,
      alpha: 1,
      duration: SETTLE_MS,
      ease: 'Sine.easeOut',
    });
  }

  public clear(): void {
    while (this.corpses.length > 0) this.kill(0);
  }

  public destroy(): void {
    this.clear();
  }

  private kill(index: number): void {
    const [corpse] = this.corpses.splice(index, 1);
    if (this.scene.tweens) this.scene.tweens.killTweensOf(corpse.sprite);
    corpse.sprite.destroy();
  }
}

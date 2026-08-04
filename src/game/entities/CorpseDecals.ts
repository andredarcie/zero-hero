import type Phaser from 'phaser';

import { ASSET_KEYS } from '@/game/constants';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { FX_PUFF_TEXTURE, world3d } from '@/game/render3d/World3D';

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

/**
 * O QUE CADA ESPÉCIE DEIXA.
 *
 * A ossada era só da caveira, e o resto do bestiário sumia sem recibo — o que importava pouco
 * quando tudo morria de um golpe e importa muito agora que matar custa dois ou três. O gesto de
 * ganhar precisa terminar em alguma coisa.
 *
 * A gosma já resolvia a dela sozinha (a poça que seca, em SlimeEnemy) e continua fora daqui: ela
 * é ARTE PRÓPRIA, e trocá-la por uma mancha genérica seria perder desenho para ganhar
 * uniformidade. As outras cinco ganham uma MANCHA — a mesma forma suave, escura, deitada no chão,
 * tingida com a cor de quem morreu. Não é preguiça de arte: uma marca abstrata é honesta sobre o
 * que ela é (aconteceu algo aqui), enquanto uma ossada de morcego seria uma arte errada afirmando
 * uma coisa falsa.
 */
/**
 * A OSSADA — a arte autorada do jogo ("Caveira e Ossos", a frame 27 do `forest_tile_set`), e a
 * mesma de sempre: nem um pixel diferente.
 *
 * O QUE MUDOU FOI O FILTRO, e a história vale porque o defeito não estava onde parecia. Ela saía
 * BORRADA, e a leitura óbvia era culpar a arte (16 pixels ampliados três vezes). Não era: o
 * `forest-tileset` é a **única** textura do jogo carregada em `LinearFilter`, e isso é deliberado —
 * a malha do terreno busca o centro de cada texel por conta própria (`zhTexelUv`) e deixa o filtro
 * agir só na costura entre dois tiles, que é exatamente onde ele conserta a escadinha da
 * perspectiva de graça.
 *
 * Um BILLBOARD não faz essa conta. Ele amostra o atlas direto — então a ossada, o único sprite do
 * jogo desenhado a partir do tileset, era também o único desenhado borrado, e ninguém tinha por que
 * suspeitar disso olhando para o PNG.
 *
 * O conserto é a arte recortada para uma textura PRÓPRIA (`ASSET_KEYS.bones`), que carrega em
 * NEAREST como todo o resto. Mesma arte, mesmo tamanho, mesma posição — e nítida.
 */
const BONES_TEXTURE = ASSET_KEYS.bones;
/** A cor da mancha de cada corpo que não tem arte própria de morte. */
const STAIN_TINT: Partial<Record<string, number>> = {
  spider: 0x2e2438,
  bat: 0x2a2130,
  mage: 0x3a2340,
  turret: 0x3b3630,
  zora: 0x1e3a44,
};
/** A mancha é menor que a ossada: é o que escorreu, não o que sobrou. */
const STAIN_SIZE = 0.62;
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

  /**
   * Deixa a marca. `kind` decide QUAL: a caveira deixa a ossada do tileset, e quem não tem arte
   * própria de morte deixa a mancha da sua cor (ver STAIN_TINT). Quem tem — a gosma, com a poça
   * que seca — nunca chega aqui.
   */
  public drop(worldX: number, worldY: number, kind = 'undead'): void {
    // Uma cova devolve corpo no MESMO tile a cada ENEMY_RESPAWN_MS, entao matar duas vezes ali
    // empilharia duas ossadas coplanares — que e z-fighting garantido, e le como um borrao.
    if (this.corpses.some((c) => c.worldX === worldX && c.worldY === worldY)) return;
    while (this.corpses.length >= MAX_CORPSES) this.kill(0);

    const stain = STAIN_TINT[kind];
    const size = stain === undefined ? BONES_SIZE : STAIN_SIZE;
    const sprite = world3d()
      // A MESMA forma de quad deitado nos dois casos (`flat` + `alphaTest` baixo): toda combinação
      // nova de opções é um programa de shader novo, e compilar shader no frame em que um bicho
      // morre é o pior engasgo que este renderer tem. A mancha reusa a arte da poeira de impacto.
      .addBillboard(
        stain === undefined ? BONES_TEXTURE : FX_PUFF_TEXTURE,
        0,
        { flat: true, flatY: 0.02, alphaTest: 0.02 },
      )
      .setPosition(worldX, worldY)
      // Espelhar sai de graca e quebra a repeticao: duas ossadas vizinhas nao podem ser a mesma
      // foto. Vem da PARIDADE do tile e nao de um sorteio — a mesma cova sempre deixa a mesma
      // ossada, o que importa porque ela e a marca daquele lugar.
      .setFlipX((worldX + worldY) % 2 === 0)
      .setDisplaySize(size, size)
      .setAlpha(0);
    if (stain !== undefined) sprite.setTint(stain);
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

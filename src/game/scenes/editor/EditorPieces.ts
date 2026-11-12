// AS PEÇAS NO TABULEIRO DO EDITOR: cada entidade com o seu desenho (NPC, item, peça), a seta de direção de quem tem,
// e as peças que o jogo monta por código (EditorFixtures), para o mapa ser o mesmo que o jogo mostra.

import * as Engine from '@/game/engine';
import { ASSET_KEYS, HERO_FRAMES, KEY_FRAMES, MOONFLOWER_FRAMES, NPC_VISUALS, TOOLBOX_FRAMES } from '@/game/constants';
import { hasDirectionFrames, isDirectionalProp } from '@/game/editor/EditorDomUi';
import type { PlacedEntity } from '@/game/editor/EditorStore';
import { fungusTextureKey } from '@/game/fungi/fungi';
import type { PickupKind } from '@/game/world/ScreenContent';
import type { PropDir, PropKind } from '@/game/world/worldSchema';
import { setWorldData } from '@/game/world/WorldData';
import { ensureFixtureTexture, recordFixtures } from '@/game/editor/EditorFixtures';
import { bosqueIconKey } from '@/game/objects/BigTrees';
import { fenceIconKey } from '@/game/objects/WoodFence';
import { yardIconKey } from '@/game/objects/LumberYard';
import { forgeIconKey } from '@/game/objects/OldForge';
import { crashIconKey } from '@/game/objects/CrashSite';
import type { EditorScene } from '../EditorScene';
import { WORLD_TILE } from './editorDefs';

const PICKUP_VISUAL: Record<PickupKind, { key: string; frame?: number }> = {
  sword: { key: ASSET_KEYS.swordItem, frame: 0 },
  key: { key: ASSET_KEYS.keyItem, frame: KEY_FRAMES.pickup },
  axe: { key: ASSET_KEYS.axeIcon },
  pickaxe: { key: ASSET_KEYS.pickaxeIcon },
  scythe: { key: ASSET_KEYS.scytheIcon },
  shovel: { key: ASSET_KEYS.shovelIcon },
  wood: { key: ASSET_KEYS.woodIcon },
  stone: { key: ASSET_KEYS.rock },
  iron: { key: ASSET_KEYS.ironItem },
  bucket: { key: 'bucket-icon' }, // generated at boot (registerBucketTextures, called in create)
  // A CADEIA DO FERRO como item de chao. Faltavam as tres, e a falta NAO era inofensiva: um
  // level que autora minerio no chao (as aulas do gato) derrubava o editor inteiro no boot —
  // `entityVisual` lia `.key` de undefined, `renderEntities` morria, e a paleta nunca chegava
  // a ser construida. O sintoma era 'clico no mapa e nada acontece'.
  ore: { key: ASSET_KEYS.oreItem },
  bloom: { key: ASSET_KEYS.bloomItem },
  charcoal: { key: 'charcoal-item' },
  puffball: { key: fungusTextureKey('puffball') },
  inkCap: { key: fungusTextureKey('inkCap') },
  morel: { key: fungusTextureKey('morel') },
  chanterelle: { key: fungusTextureKey('chanterelle') },
  flyAgaric: { key: fungusTextureKey('flyAgaric') },
  porcini: { key: fungusTextureKey('porcini') },
  oyster: { key: fungusTextureKey('oyster') },
  jackOLantern: { key: fungusTextureKey('jackOLantern') },
};
const PROP_VISUAL: Record<PropKind, { key: string; frame?: number }> = {
  campfire: { key: ASSET_KEYS.campfireFrame1 },
  dryBush: { key: ASSET_KEYS.dryBush },
  lockedDoor: { key: ASSET_KEYS.lookedDoorObject },
  swingGate: { key: ASSET_KEYS.swingGateObject },
  dryTree: { key: ASSET_KEYS.dryTree, frame: 0 },
  dryShrub: { key: ASSET_KEYS.dryShrub },
  rock: { key: ASSET_KEYS.rock },
  ironRock: { key: ASSET_KEYS.ironRock, frame: 0 },
  coalRock: { key: ASSET_KEYS.coalRock, frame: 0 },
  tallGrass: { key: ASSET_KEYS.tallGrassUp, frame: 0 },
  water: { key: ASSET_KEYS.water },
  lava: { key: ASSET_KEYS.lavaFloor },
  bridgeSpot: { key: ASSET_KEYS.bridge },
  // A pose ABERTA: e a que diz o que a peca faz (uma ponte de petalas). Ver MOONFLOWER_FRAMES.
  moonflower: { key: ASSET_KEYS.moonflower, frame: MOONFLOWER_FRAMES.lying[3] },
  plantSpot: { key: ASSET_KEYS.plantHole, frame: 0 },
  toolbox: { key: ASSET_KEYS.toolbox, frame: TOOLBOX_FRAMES.closed },
  furnace: { key: ASSET_KEYS.furnace, frame: 0 },
  altar: { key: ASSET_KEYS.altar, frame: 0 },
  hearth: { key: ASSET_KEYS.campfireFrame1 },
  gardenGate: { key: ASSET_KEYS.lookedDoorObject },
  // O bosque: o ícone é o desenho da própria árvore (registerBosqueTextures, no create).
  oakTree: { key: bosqueIconKey('oak') },
  birchTree: { key: bosqueIconKey('birch') },
  youngOak: { key: bosqueIconKey('sapling') },
  fallenLog: { key: bosqueIconKey('log') },
  woodFence: { key: fenceIconKey },
  woodpile: { key: yardIconKey('woodpile') },
  sawhorse: { key: yardIconKey('sawhorse') },
  stump: { key: yardIconKey('stump') },
  axeStump: { key: yardIconKey('axeStump') },
  wheelbarrow: { key: yardIconKey('wheelbarrow') },
  yardSign: { key: yardIconKey('yardSign') },
  forgeRubble: { key: forgeIconKey('forgeRubble') },
  forgeRack: { key: forgeIconKey('forgeRack') },
  crashCrater: { key: crashIconKey('crashCrater') },
  shipHull: { key: crashIconKey('shipHull') },
  shipThruster: { key: crashIconKey('shipThruster') },
  shipFin: { key: crashIconKey('shipFin') },
};
const CHIP_COLOR: Record<PlacedEntity['list'], number> = {
  npcs: 0x4488ff,
  pickups: 0x33cc77,
  props: 0xffaa33,
};
// N, L, S, O — a mesma tabela do mundo (worldY cresce pra baixo), usada so pela marca de proa.
const DIR_STEP: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const SPAWN_COLOR = 0x00e0ff;

export class EditorPieces {
  public constructor(private readonly host: EditorScene) {}

  private entityVisual(entity: PlacedEntity): { key: string; frame?: number } {
    if (entity.list === 'npcs') return NPC_VISUALS[entity.type];
    // O `??` e uma REDE, nao preguica: um kind de item que o editor nao conhece nao pode
    // derrubar o tabuleiro inteiro. Sem ele, um unico item desconhecido num canto do mundo
    // apagava a paleta e o editor virava uma tela que nao responde a clique nenhum.
    if (entity.list === 'pickups') return PICKUP_VISUAL[entity.type] ?? { key: ASSET_KEYS.rock };
    // Um prop com direcao desenha o frame da SUA direcao — e assim que se olha um mapa cheio de
    // bracos e se ve, sem clicar em nada, pra que lado cada um empurra. So vale para quem tem a
    // arte dividida por direcao: a caixa de ferramentas gira, mas seus frames sao poses da tampa
    // (ela recebe a marca de proa em renderEntities).
    if (entity.dir !== undefined && hasDirectionFrames(entity.type)) {
      return { key: PROP_VISUAL[entity.type].key, frame: entity.dir };
    }
    return PROP_VISUAL[entity.type];
  }

  /**
   * AS PEÇAS DO JOGO, desenhadas como o jogo as monta (EditorFixtures): o que está deitado no chão (a clareira do
   * acampamento, a estrada, o riacho, a espuma, as vitórias-régias) fica embaixo; o que está em pé (árvores, a queda,
   * o barril, as casas) vai por cima, com o PÉ no tile dele e os de mais ao sul na frente — a mesma ordem do jogo.
   */
  public renderFixtures(): void {
    const container = this.host.fixtureContainer;
    if (!container) return;
    container.removeAll(true);
    if (!this.host.fixtures) {
      // Algumas peças leem o mapa (a estrada velha procura os portões do jardim): o mesmo retrato que o Testar usa.
      if (this.host.store) setWorldData(this.host.store.snapshotWorld());
      this.host.fixtures = recordFixtures(this.host);
    }
    const T = WORLD_TILE;
    const ordered = [...this.host.fixtures].sort((a, b) => Number(b.flat) - Number(a.flat) || a.y - b.y);
    for (const f of ordered) {
      if (!ensureFixtureTexture(this.host, f.key)) continue;
      const sprite = this.host.add.image((f.x + 0.5) * T, (f.y + 0.5) * T - f.elevation * T, f.key)
        .setDisplaySize(f.w * T, f.h * T)
        .setOrigin(0.5, f.flat || f.centered ? 0.5 : 1)
        .setFlipX(f.flipX)
        .setAngle(f.angle)
        .setAlpha(f.alpha);
      if (f.additive) sprite.setBlendMode(Engine.BlendModes.ADD);
      // A cor do bioma que o jogo põe nas árvores, na mesma conta dos tiles do editor (biomeTint).
      if (f.color) {
        const [r, g, b] = f.color;
        const k = 1 / Math.max(r, g, b, 1);
        sprite.setTint((Math.round(r * k * 255) << 16) | (Math.round(g * k * 255) << 8) | Math.round(b * k * 255));
      }
      container.add(sprite);
    }
  }

  public renderEntities(): void {
    const store = this.host.store;
    const container = this.host.entityContainer;
    if (!store || !container) return;
    container.removeAll(true);

    const place = (
      worldX: number,
      worldY: number,
      color: number,
      visual: { key: string; frame?: number },
      dir?: PropDir,
    ): void => {
      const cx = (worldX + 0.5) * WORLD_TILE;
      const cy = (worldY + 0.5) * WORLD_TILE;
      const chip = this.host.add.rectangle(cx, cy, WORLD_TILE * 0.86, WORLD_TILE * 0.86, color, 0.32).setStrokeStyle(1, color, 1);
      const sprite = this.host.add.sprite(cx, cy, visual.key, visual.frame ?? 0).setDisplaySize(WORLD_TILE * 0.74, WORLD_TILE * 0.74);
      container.add([chip, sprite]);
      // A marca de PROA: um pino colado na borda do chip do lado pra onde a peca aponta. Existe
      // so pra quem gira sem ter arte por direcao — sem ela, o autor nao ve a frente da peca.
      if (dir === undefined) return;
      const [dx, dy] = DIR_STEP[dir];
      container.add(this.host.add.rectangle(
        cx + dx * WORLD_TILE * 0.4,
        cy + dy * WORLD_TILE * 0.4,
        WORLD_TILE * (dx === 0 ? 0.44 : 0.16),
        WORLD_TILE * (dy === 0 ? 0.44 : 0.16),
        color,
        1,
      ));
    };

    store.entities.allEntities().forEach((entity) => place(
      entity.worldX,
      entity.worldY,
      CHIP_COLOR[entity.list],
      this.entityVisual(entity),
      entity.list === 'props' && isDirectionalProp(entity.type) && !hasDirectionFrames(entity.type)
        ? entity.dir ?? 1
        : undefined,
    ));
    const spawn = store.spawn;
    place(spawn.worldX, spawn.worldY, SPAWN_COLOR, { key: ASSET_KEYS.hero, frame: HERO_FRAMES.idleDown });
    const startLabel = this.host.add.text(
      (spawn.worldX + 0.5) * WORLD_TILE,
      spawn.worldY * WORLD_TILE - 1,
      'INICIO',
      {
        fontFamily: '"Press Start 2P", monospace',
        fontSize: '4px',
        color: '#66d9ef',
        stroke: '#061014',
        strokeThickness: 2,
      },
    ).setOrigin(0.5, 1);
    container.add(startLabel);
  }
}

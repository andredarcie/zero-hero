// O MAPA visto pelo playtest: o que é sólido, água, árvore, o tile pintado, o relevo da serra, o bioma, onde mora
// cada vizinho e o texto de uma chave de tradução. Tudo pergunta ao jogo as mesmas coisas que ele mesmo pergunta.

import { SOLID_GROUND_FRAMES, SOLID_UPPER_FRAMES } from '@/game/constants';
import { WATERFALL_SPRING } from '@/game/objects/Waterfall';
import { biomeAt } from '@/game/world/biomes';
import { tLines } from '@/game/i18n/i18n';
import { reliefAt, reliefLevelAt, stairBase, stairUp } from '@/game/world/relief';
import { getNpcHome, getTileRelief } from '@/game/world/WorldData';
import type { NpcKind } from '@/game/world/ScreenContent';
import type { GameScene } from '@/game/scenes/GameScene';

/** O lado do vale em tiles (o mapa é quadrado). */
const WORLD = 60;

export const worldProbe = (s: GameScene) => ({
  /** Carrega agora os chunks em volta do herói (o streaming normal só roda quando ele anda). */
  stream: (): void => s.streamChunks(true),

  /** Sólido para quem anda (`hazardsPassable`: água e lava contam como chão, como para quem voa). */
  solid: (x: number, y: number, hazardsPassable = false): boolean => s.query.isSolidForEntities(x, y, hazardsPassable),
  /** O mapa de sólidos, uma string por linha: '#' sólido, '.' livre. */
  solidRows: (n = WORLD): string[] =>
    Array.from({ length: n }, (_, y) => Array.from({ length: n }, (__, x) => (s.query.isSolidForEntities(x, y) ? '#' : '.')).join('')),
  /** O tile livre mais perto de (x, y), a até `r` tiles, ou null. */
  nearestFree: (x: number, y: number, r = 6): { x: number; y: number } | null => {
    for (let d = 0; d <= r; d += 1) {
      for (let dy = -d; dy <= d; dy += 1) for (let dx = -d; dx <= d; dx += 1) {
        if (!s.query.isSolidForEntities(x + dx, y + dy)) return { x: x + dx, y: y + dy };
      }
    }
    return null;
  },
  openWater: (x: number, y: number): boolean => s.query.isOpenWaterAt(x, y),
  tree: (x: number, y: number): boolean => s.query.isTreeTileAt(x, y),
  occupied: (x: number, y: number): boolean => s.query.isTileOccupied(x, y),
  /** O tile pintado: chão, camada de cima e colisão pintada. */
  tile: (x: number, y: number) => s.chunkManager?.getTile(x, y) ?? null,
  biome: (x: number, y: number): string => biomeAt(x, y),

  /** O código de relevo (chão, planalto, escada) e o nível (0 chão, 1 planalto...). */
  relief: (x: number, y: number): number => reliefAt(x, y),
  reliefLevel: (x: number, y: number): number => reliefLevelAt(x, y),
  reliefGrid: (n = WORLD): number[][] => Array.from({ length: n }, (_, y) => Array.from({ length: n }, (__, x) => getTileRelief(x, y))),
  /** Este tile é o pé de uma escada que sobe? */
  stairFoot: (x: number, y: number): boolean => {
    const code = reliefAt(x, y);
    return Boolean(stairUp(code)) && stairBase(code) === 1;
  },

  /**
   * POR QUE (x, y) BARRA O HERÓI: a peça que está ali ('prop:rocks', 'npc', 'valley:lumberYard', 'quest:lumber'...),
   * 'terrain:art' quando é o mapa e a arte do tile mostra o sólido (árvore, montanha, mar), 'terrain:painted' quando só
   * a colisão pintada barra (a parede invisível), ou null se o tile é livre. Segue as mesmas fontes do
   * `WorldQuery.isSolidForEntities`, na mesma ordem; uma fonte nova que falte aqui aparece como 'unknown' — e o
   * `sem-parede` aponta.
   */
  solidReason: (x: number, y: number): string | null => {
    if (!s.query.isSolidForEntities(x, y)) return null;
    const lists = Object.entries(s.props).filter(([, v]) => Array.isArray(v) && v.length && 'worldX' in v[0]) as Array<[string, Array<{ worldX: number; worldY: number; blocking?: boolean }>]>;
    for (const [name, list] of lists) if (list.some((p) => p.worldX === x && p.worldY === y && p.blocking)) return `prop:${name}`;
    if (s.npcManager?.hasNpcAt(x, y)) return 'npc';
    if (s.swordPlanting.plantedSwordTile?.x === x && s.swordPlanting.plantedSwordTile.y === y) return 'sword';
    if (s.marks.isQuestMarkAt(x, y)) return 'questMark';
    if (s.questSetup.painterQuest?.isSolidAt(x, y)) return 'quest:painter';
    if (s.questSetup.lumberQuest?.isSolidAt(x, y)) return 'quest:lumber';
    if (s.questSetup.astronomerQuest?.isSolidAt(x, y)) return 'quest:astronomer';
    if (s.valley.npcHomes?.isSolidAt(x, y)) return 'valley:npcHomes';
    if (s.valley.valleyFinds?.at(x, y)) return 'valley:valleyFinds';
    if (s.valley.heroCamp?.at(x, y)) return 'valley:heroCamp';
    if (s.camp.catCare.isBarrelAt(x, y)) return 'valley:catBarrel';
    if (s.valley.bigTrees?.at(x, y)) return 'valley:bigTrees';
    if (s.valley.woodFence?.at(x, y)) return 'valley:woodFence';
    if (s.valley.lumberYard?.at(x, y)) return 'valley:lumberYard';
    if (s.valley.oldForge?.at(x, y)) return 'valley:oldForge';
    if (s.valley.crashSite?.at(x, y)) return 'valley:crashSite';
    // A cachoeira barra pela colisão pintada (scripts/cachoeira.mjs), e quem a mostra é o objeto dela: a nascente e o
    // riacho do alto, o quadrado logo acima e à esquerda da nascente.
    if (s.valley.waterfall && x >= WATERFALL_SPRING.x - 1 && x <= WATERFALL_SPRING.x && y >= WATERFALL_SPRING.y - 1 && y <= WATERFALL_SPRING.y) return 'valley:waterfall';
    if (s.itemManager?.kindAt(x, y)) return 'item';
    if (!s.chunkManager?.isCellBlocked(x, y)) return 'unknown';
    // O mapa pintado: a arte do tile já é o motivo (árvore, montanha, mar — a mesma regra do ChunkManager), ou é só a
    // colisão pintada, que ninguém vê.
    const t = s.chunkManager.getTile(x, y);
    const art = SOLID_GROUND_FRAMES.has(t.ground) || (t.upper !== null && SOLID_UPPER_FRAMES.has(t.upper));
    return art ? 'terrain:art' : 'terrain:painted';
  },

  npcHome: (kind: NpcKind): { x: number; y: number } | null => {
    const home = getNpcHome(kind);
    return home ? { x: home.worldX, y: home.worldY } : null;
  },
  /** As falas de uma chave de tradução, na língua do jogo. */
  lines: (key: string): string[] => tLines(key).map((l) => l.text),
});

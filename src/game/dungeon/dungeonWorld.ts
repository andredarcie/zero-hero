import type { WorldData } from '@/game/world/worldSchema';
import { adventureRunSeed, adventureState, saveAdventure } from '@/game/runtime/adventureState';
import { buildDungeon } from './dungeonBuild';
import { dungeonSeedFor } from './dungeonRandom';
import { snapshotDungeon, worldFromSnapshot } from './dungeonSnapshot';
import { loadTemplateLibrary } from './dungeonTemplates';

/**
 * A FACHADA — o único lugar do jogo que decide se uma dungeon é lembrada ou inventada.
 *
 * A ordem de leitura é a promessa inteira, e ela tem uma direção só:
 *
 *     retrato salvo?  → hidrata (é o que o jogador viu; manda sempre, inclusive sobre a semente)
 *     senão           → gera da semente da partida E GRAVA O RETRATO NA HORA
 *
 * Gravar na ENTRADA, e não só na saída, é o que faz a primeira aba fechada não apagar a dungeon
 * que acabou de nascer. E o retrato mandar sobre a semente é o que faz um deploy novo do gerador
 * não remontar o mundo em volta de quem está no meio da descida — a semente só decide o que ainda
 * não existe.
 *
 * O mundo montado fica guardado aqui por referência porque o runtime EDITA os arrays de chunk no
 * lugar. Fotografá-lo de novo na saída é, portanto, fotografar as edições — sem que nada precise
 * avisar ninguém de que houve edição.
 */

const scopeOf = (level: number): string => `dungeon-${level}`;

let active: { level: number; seed: number; world: WorldData } | null = null;

/**
 * A dungeon `level` desta partida, hidratada ou gerada. `baseUrl` é o `import.meta.env.BASE_URL` —
 * a fachada não o adivinha porque quem conhece o empacotamento é a cena.
 */
export const dungeonWorldFor = async (level: number, baseUrl: string): Promise<WorldData> => {
  const state = adventureState();
  const saved = state.dungeons.get(scopeOf(level));
  if (saved) {
    const world = worldFromSnapshot(saved);
    active = { level, seed: saved.seed, world };
    return world;
  }

  const seed = dungeonSeedFor(adventureRunSeed(), level);
  const library = await loadTemplateLibrary(baseUrl);
  const built = buildDungeon(level, seed, library);
  active = { level, seed, world: built.world };
  state.dungeons.set(scopeOf(level), snapshotDungeon(built.world, level, seed));
  saveAdventure();
  return built.world;
};

/** Fecha o retrato da dungeon aberta (saída pela escada, ou morte lá dentro). */
export const persistActiveDungeon = (): void => {
  if (!active) return;
  const state = adventureState();
  state.dungeons.set(scopeOf(active.level), snapshotDungeon(active.world, active.level, active.seed));
  saveAdventure();
};

export const clearActiveDungeon = (): void => { active = null; };

/** Só para teste e depuração: qual dungeon está aberta e com que semente. */
export const activeDungeonInfo = (): { level: number; seed: number } | null =>
  (active ? { level: active.level, seed: active.seed } : null);

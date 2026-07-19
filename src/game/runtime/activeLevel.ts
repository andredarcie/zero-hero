// Which puzzle level is being played right now (its 1-based number), or null for the main
// adventure. It drives the level-aware pause menu — "reiniciar level" and "voltar aos levels"
// only make sense when a level is active. Module-level state, like WorldData: it persists across
// scene.restart() (which is how "restart level" works) within a single game instance.

let current: number | null = null;

export const setActiveLevel = (level: number | null): void => {
  current = level;
};

export const getActiveLevel = (): number | null => current;

// The static asset path for a level number (works in dev and the published build alike).
export const levelFilePath = (level: number): string => `${import.meta.env.BASE_URL}levels/level-${level}.json`;

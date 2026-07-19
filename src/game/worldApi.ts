import type { WorldData } from '@/game/world/worldSchema';

// Editor-side client for the dev-server world API (see vite.config.ts). Loads the current
// world file and persists edits back to it. Dev-only, which is exactly where the
// editor runs. `world` is the real overworld (public/world.json); `level-N` is a puzzle
// level (public/levels/level-N.json) edited via /lab (the puzzle laboratory).

export type WorldFileId = 'world' | `level-${number}`;

const buildApiUrl = (path: string): string => `${import.meta.env.BASE_URL}${path.replace(/^\/+/u, '')}`;

export const loadWorld = async (file: WorldFileId = 'world'): Promise<WorldData> => {
  const response = await window.fetch(buildApiUrl(`api/world?file=${file}`));
  if (!response.ok) {
    throw new Error(`Falha ao carregar ${file}.json`);
  }
  return response.json() as Promise<WorldData>;
};

export const saveWorld = async (world: WorldData, file: WorldFileId = 'world'): Promise<void> => {
  const response = await window.fetch(buildApiUrl(`api/world?file=${file}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(world),
  });
  if (!response.ok) {
    throw new Error(`Falha ao salvar ${file}.json`);
  }
};

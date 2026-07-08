import type { WorldData } from '@/game/world/worldSchema';

// Editor-side client for the dev-server world API (see vite.config.ts). Loads the current
// public/world.json and persists edits back to it. Dev-only, which is exactly where the
// editor runs.

const buildApiUrl = (path: string): string => `${import.meta.env.BASE_URL}${path.replace(/^\/+/u, '')}`;

export const loadWorld = async (): Promise<WorldData> => {
  const response = await window.fetch(buildApiUrl('api/world'));
  if (!response.ok) {
    throw new Error('Falha ao carregar world.json');
  }
  return response.json() as Promise<WorldData>;
};

export const saveWorld = async (world: WorldData): Promise<void> => {
  const response = await window.fetch(buildApiUrl('api/world'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(world),
  });
  if (!response.ok) {
    throw new Error('Falha ao salvar world.json');
  }
};

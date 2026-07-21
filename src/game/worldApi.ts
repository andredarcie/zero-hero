import type { WorldData } from '@/game/world/worldSchema';

// Editor-side client for the dev-server world API (see vite.config.ts). Loads the current
// world file and persists edits back to it. Dev-only, which is exactly where the
// editor runs. `world` is the real overworld (public/world.json); `level-N` is a puzzle
// level (public/levels/level-N.json) edited via /lab (the puzzle laboratory).

export type WorldFileId = 'world' | `level-${number}`;

export type LabLevelSummary = {
  id: string;
  file: string;
  level: number;
  name: string;
  blurb: string;
  updatedAt: string;
  playerStart: { worldX: number; worldY: number } | null;
};

export type DeleteLabLevelResult = {
  deleted: number;
  levels: LabLevelSummary[];
};

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

const throwApiError = async (response: Response, fallback: string): Promise<never> => {
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  throw new Error(payload?.error || fallback);
};

export const listLabLevels = async (): Promise<LabLevelSummary[]> => {
  const response = await window.fetch(buildApiUrl('api/lab-levels'), { cache: 'no-store' });
  if (!response.ok) return throwApiError(response, 'Falha ao listar levels');
  return response.json() as Promise<LabLevelSummary[]>;
};

export const createLabLevel = async (name: string): Promise<LabLevelSummary> => {
  const response = await window.fetch(buildApiUrl('api/lab-levels'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) return throwApiError(response, 'Falha ao criar level');
  return response.json() as Promise<LabLevelSummary>;
};

export const renameLabLevel = async (level: number, name: string): Promise<LabLevelSummary> => {
  const response = await window.fetch(buildApiUrl(`api/lab-levels/${level}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) return throwApiError(response, 'Falha ao renomear level');
  return response.json() as Promise<LabLevelSummary>;
};

export const deleteLabLevel = async (level: number): Promise<DeleteLabLevelResult> => {
  const response = await window.fetch(buildApiUrl(`api/lab-levels/${level}`), { method: 'DELETE' });
  if (!response.ok) return throwApiError(response, 'Falha ao apagar level');
  return response.json() as Promise<DeleteLabLevelResult>;
};

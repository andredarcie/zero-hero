import type { WorldData } from '@/game/world/worldSchema';

// Editor-side client for the dev-server world API (see vite.config.ts). Loads the current
// world file and persists edits back to it. Dev-only, which is exactly where the
// editor runs. `world` is the real overworld (public/world.json); `level-N` is a puzzle
// level (public/levels/*.json), editado via /lab (the puzzle laboratory), e `underworld` e o
// ESPELHO do overworld — o andar de baixo, mesmo tamanho e mesmas coordenadas
// (public/underworld.json), editado via /lab?under.

export type WorldFileId = 'world' | 'underworld' | `level-${number}`;

/**
 * OS DOIS ANDARES DO MUNDO DE VERDADE, com os nomes que o resto do projeto já usa: `overworld` é
 * a superfície (`world.json`, e `scripts/enrich-overworld-props.mjs`) e `underworld` é o espelho
 * de baixo (`underworld.json`, `runtime/underworld.ts`). Um level do lab NÃO é um andar — ele é
 * uma tela solta, e é por isso que este tipo não o inclui.
 *
 * O nome do arquivo da superfície continua sendo `world` por compatibilidade com tudo que já
 * grava nele; a tradução mora em `worldFileForFloor`, num lugar só.
 */
export type WorldFloor = 'overworld' | 'underworld';

export const worldFileForFloor = (floor: WorldFloor): WorldFileId =>
  (floor === 'underworld' ? 'underworld' : 'world');

/**
 * ONDE cada arquivo mora, num lugar só. Os três estão em pastas diferentes e é fácil errar: o
 * subterrâneo NÃO está em `levels/` (o toast do Salvar anunciou `public/levels/underworld.json`,
 * que nunca existiu, até alguém abrir o subterrâneo pelo /editor e ler a mentira).
 */
export const worldFilePath = (file: WorldFileId): string => {
  if (file === 'world') return 'public/world.json';
  if (file === 'underworld') return 'public/underworld.json';
  return `public/levels/${file}.json`;
};

export type LabLevelSummary = {
  id: string;
  file: string;
  level: number;
  /** `level` = fase criável/apagável do lab. */
  kind: 'level';
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

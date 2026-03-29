import { cloneLevelExport, createEmptyLevelState, type LevelExport } from '@/game/levelEditor';

export type LevelListEntry = {
  fileName: string;
  levelName: string;
};

const ensureLevelShape = (input: unknown): LevelExport => {
  const base = createEmptyLevelState();

  if (!input || typeof input !== 'object') {
    return base;
  }

  const candidate = input as Partial<LevelExport>;

  return {
    meta: {
      ...base.meta,
      ...(candidate.meta ?? {}),
    },
    layers: {
      ground: candidate.layers?.ground?.map((row) => [...row]) ?? base.layers.ground.map((row) => [...row]),
      upper: candidate.layers?.upper?.map((row) => [...row]) ?? base.layers.upper.map((row) => [...row]),
    },
    collisions: {
      ground: candidate.collisions?.ground?.map((row) => [...row]) ?? base.collisions.ground.map((row) => [...row]),
      upper: candidate.collisions?.upper?.map((row) => [...row]) ?? base.collisions.upper.map((row) => [...row]),
    },
  };
};

export const listLevels = async (): Promise<LevelListEntry[]> => {
  const response = await window.fetch('/api/levels');

  if (!response.ok) {
    throw new Error('Falha ao listar levels');
  }

  return response.json() as Promise<LevelListEntry[]>;
};

export const loadLevelByFileName = async (fileName: string): Promise<LevelExport> => {
  const response = await window.fetch(`/api/levels/${encodeURIComponent(fileName)}`);

  if (!response.ok) {
    throw new Error(`Falha ao carregar ${fileName}`);
  }

  return ensureLevelShape(await response.json());
};

export const saveLevelByFileName = async (fileName: string, level: LevelExport): Promise<LevelExport> => {
  const response = await window.fetch(`/api/levels/${encodeURIComponent(fileName)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(level),
  });

  if (!response.ok) {
    throw new Error(`Falha ao salvar ${fileName}`);
  }

  return ensureLevelShape(await response.json());
};

export const cloneLoadedLevel = (level: LevelExport): LevelExport => cloneLevelExport(ensureLevelShape(level));

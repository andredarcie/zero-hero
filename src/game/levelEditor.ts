import { GRID_COLUMNS, GRID_ROWS } from '@/game/constants';

export type EditorLayer = 'ground' | 'upper';

export type EditorCellCollision = {
  ground: boolean;
  upper: boolean;
};

export type LevelItemType = 'key';

export type LevelItemExport = {
  type: LevelItemType;
  column: number;
  row: number;
};

export type LevelExport = {
  meta: {
    name: string;
    columns: number;
    rows: number;
    tileSize: number;
    tilesetKey: string;
    exportedAt: string;
  };
  layers: {
    ground: number[][];
    upper: Array<Array<number | null>>;
  };
  collisions: {
    ground: boolean[][];
    upper: boolean[][];
  };
  items: LevelItemExport[];
};

export const DEFAULT_GROUND_TILE = 5;
export const EMPTY_UPPER_TILE: number | null = null;

export const createFilledNumberGrid = (fillValue: number): number[][] => Array.from(
  { length: GRID_ROWS },
  () => Array.from({ length: GRID_COLUMNS }, () => fillValue),
);

export const createFilledNullableGrid = (fillValue: number | null): Array<Array<number | null>> => Array.from(
  { length: GRID_ROWS },
  () => Array.from({ length: GRID_COLUMNS }, () => fillValue),
);

export const createFilledBooleanGrid = (fillValue: boolean): boolean[][] => Array.from(
  { length: GRID_ROWS },
  () => Array.from({ length: GRID_COLUMNS }, () => fillValue),
);

export const createEmptyLevelState = (): LevelExport => ({
  meta: {
    name: 'forest_level',
    columns: GRID_COLUMNS,
    rows: GRID_ROWS,
    tileSize: 8,
    tilesetKey: 'forest_tile_set',
    exportedAt: '',
  },
  layers: {
    ground: createFilledNumberGrid(DEFAULT_GROUND_TILE),
    upper: createFilledNullableGrid(EMPTY_UPPER_TILE),
  },
  collisions: {
    ground: createFilledBooleanGrid(false),
    upper: createFilledBooleanGrid(false),
  },
  items: [],
});

export const cloneLevelExport = (level: LevelExport): LevelExport => ({
  meta: { ...level.meta },
  layers: {
    ground: level.layers.ground.map((row) => [...row]),
    upper: level.layers.upper.map((row) => [...row]),
  },
  collisions: {
    ground: level.collisions.ground.map((row) => [...row]),
    upper: level.collisions.upper.map((row) => [...row]),
  },
  items: level.items.map((item) => ({ ...item })),
});

export const buildLevelExportJson = (level: LevelExport): string => JSON.stringify(
  {
    ...level,
    meta: {
      ...level.meta,
      exportedAt: new Date().toISOString(),
    },
  },
  null,
  2,
);

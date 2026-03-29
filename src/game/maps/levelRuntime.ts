import type { GridCell } from '@/game/shared/grid';
import { GRID_COLUMNS, GRID_ROWS } from '@/game/constants';
import { createEmptyLevelState, type LevelExport } from '@/game/levelEditor';

export const normalizeLevel = (level: LevelExport): LevelExport => {
  const base = createEmptyLevelState();

  return {
    meta: {
      ...base.meta,
      ...level.meta,
      columns: level.meta.columns || GRID_COLUMNS,
      rows: level.meta.rows || GRID_ROWS,
    },
    layers: {
      ground: level.layers.ground.map((row) => [...row]),
      upper: level.layers.upper.map((row) => [...row]),
    },
    collisions: {
      ground: level.collisions.ground.map((row) => [...row]),
      upper: level.collisions.upper.map((row) => [...row]),
    },
  };
};

export const isBlockedLevelCell = (level: LevelExport, column: number, row: number): boolean => Boolean(
  level.collisions.ground[row]?.[column]
  || level.collisions.upper[row]?.[column],
);

export const resolveSpawnCell = (level: LevelExport): GridCell => {
  const center = {
    column: Math.floor(level.meta.columns / 2),
    row: Math.floor(level.meta.rows / 2),
  };

  if (!isBlockedLevelCell(level, center.column, center.row)) {
    return center;
  }

  for (let row = 0; row < level.meta.rows; row += 1) {
    for (let column = 0; column < level.meta.columns; column += 1) {
      if (!isBlockedLevelCell(level, column, row)) {
        return { column, row };
      }
    }
  }

  return { column: 0, row: 0 };
};

export const listBlockedCells = (level: LevelExport): GridCell[] => level.layers.upper.flatMap((tiles, row) => tiles
  .map((_tile, column) => (isBlockedLevelCell(level, column, row) ? { column, row } : null))
  .filter((cell): cell is GridCell => cell !== null));

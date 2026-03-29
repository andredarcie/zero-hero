import { CHARACTER_SIZE, GRID_COLUMNS, GRID_ROWS, MAX_CHARACTER_SIZE, TILE_SIZE } from '@/game/constants';

export type GridCell = {
  column: number;
  row: number;
};

export type BoardMetrics = {
  columns: number;
  rows: number;
  tileSize: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  characterSize: number;
};

export const createBoardMetrics = (
  width: number,
  height: number,
  options?: {
    columns?: number;
    rows?: number;
    minTileSize?: number;
    characterScale?: number;
    maxCharacterSize?: number;
    reservedTopRows?: number;
  },
): BoardMetrics => {
  const columns = options?.columns ?? GRID_COLUMNS;
  const rows = options?.rows ?? GRID_ROWS;
  const minTileSize = options?.minTileSize ?? TILE_SIZE * 3;
  const characterScale = options?.characterScale ?? (CHARACTER_SIZE / (TILE_SIZE * 4));
  const maxCharacterSize = options?.maxCharacterSize ?? MAX_CHARACTER_SIZE;
  const reservedTopRows = options?.reservedTopRows ?? 0;
  const tileSize = Math.max(minTileSize, Math.floor(Math.min(width / columns, height / (rows + reservedTopRows))));
  const boardWidth = tileSize * columns;
  const boardHeight = tileSize * rows;
  const reservedTopHeight = tileSize * reservedTopRows;

  return {
    columns,
    rows,
    tileSize,
    offsetX: Math.floor((width - boardWidth) / 2),
    offsetY: reservedTopHeight + Math.floor((height - reservedTopHeight - boardHeight) / 2),
    width: boardWidth,
    height: boardHeight,
    characterSize: Math.min(maxCharacterSize, Math.floor(tileSize * characterScale)),
  };
};

export const clampCell = (cell: GridCell, metrics: BoardMetrics): GridCell => ({
  column: Math.max(0, Math.min(cell.column, metrics.columns - 1)),
  row: Math.max(0, Math.min(cell.row, metrics.rows - 1)),
});

export const toCellKey = (column: number, row: number): string => `${column},${row}`;

export const toIndex = (column: number, row: number, columns = GRID_COLUMNS): number => (row * columns) + column;

export const gridToWorld = (column: number, row: number, metrics: BoardMetrics): { x: number; y: number } => ({
  x: metrics.offsetX + ((column + 0.5) * metrics.tileSize),
  y: metrics.offsetY + ((row + 0.5) * metrics.tileSize),
});

export const resolveBoardCell = (
  worldX: number,
  worldY: number,
  metrics: Pick<BoardMetrics, 'offsetX' | 'offsetY' | 'width' | 'height' | 'tileSize'>,
): GridCell | null => {
  const insideX = worldX >= metrics.offsetX && worldX < metrics.offsetX + metrics.width;
  const insideY = worldY >= metrics.offsetY && worldY < metrics.offsetY + metrics.height;

  if (!insideX || !insideY) {
    return null;
  }

  return {
    column: Math.floor((worldX - metrics.offsetX) / metrics.tileSize),
    row: Math.floor((worldY - metrics.offsetY) / metrics.tileSize),
  };
};

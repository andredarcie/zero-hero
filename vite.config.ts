import fs from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

import { defineConfig, type Plugin } from 'vite';

const levelsDir = fileURLToPath(new URL('./levels', import.meta.url));
const worldJsonPath = fileURLToPath(new URL('./public/world.json', import.meta.url));
const levelJsonDir = fileURLToPath(new URL('./public/levels', import.meta.url));
const levelIndexPath = path.join(levelJsonDir, 'index.json');

type LabLevelSummary = {
  id: string;
  file: string;
  level: number;
  name: string;
  blurb: string;
  updatedAt: string;
  playerStart: { worldX: number; worldY: number } | null;
};

type StoredLevelIndexEntry = {
  id?: string;
  file?: string;
  name?: string;
  blurb?: string;
};

const readStoredLevelIndex = async (): Promise<StoredLevelIndexEntry[]> => {
  try {
    return JSON.parse(await fs.readFile(levelIndexPath, 'utf8')) as StoredLevelIndexEntry[];
  } catch {
    return [];
  }
};

/** The actual level files are authoritative; index.json is their static/runtime projection. */
const listLabLevels = async (): Promise<LabLevelSummary[]> => {
  const [entries, storedIndex] = await Promise.all([
    fs.readdir(levelJsonDir, { withFileTypes: true }),
    readStoredLevelIndex(),
  ]);
  const storedByFile = new Map(storedIndex.map((entry) => [entry.file, entry]));
  const summaries = await Promise.all(entries.flatMap((entry) => {
    const match = entry.isFile() ? /^level-(\d+)\.json$/u.exec(entry.name) : null;
    if (!match) return [];
    const level = Number(match[1]);
    return [fs.readFile(path.join(levelJsonDir, entry.name), 'utf8').then((content) => {
      const parsed = JSON.parse(content) as {
        meta?: {
          name?: string;
          exportedAt?: string;
          playerStart?: { worldX?: unknown; worldY?: unknown };
        };
      };
      const stored = storedByFile.get(entry.name);
      const start = parsed.meta?.playerStart;
      const playerStart = start && Number.isInteger(start.worldX) && Number.isInteger(start.worldY)
        ? { worldX: Number(start.worldX), worldY: Number(start.worldY) }
        : null;
      return {
        id: `level-${level}`,
        file: entry.name,
        level,
        name: parsed.meta?.name?.trim() || stored?.name?.trim() || `Level ${level}`,
        blurb: stored?.blurb?.trim() ?? '',
        updatedAt: parsed.meta?.exportedAt ?? '',
        playerStart,
      } satisfies LabLevelSummary;
    })];
  }));
  return summaries.sort((a, b) => a.level - b.level);
};

const syncLabLevelIndex = async (): Promise<LabLevelSummary[]> => {
  const levels = await listLabLevels();
  const staticIndex = levels.map(({ id, file, name, blurb }) => ({ id, file, name, blurb }));
  await fs.writeFile(levelIndexPath, `${JSON.stringify(staticIndex, null, 2)}\n`, 'utf8');
  return levels;
};

const makeBlankPuzzleLevel = (name: string): object => {
  const columns = 12;
  const rows = 12;
  return {
    meta: {
      name,
      schemaVersion: 1,
      worldChunksX: 1,
      worldChunksY: 1,
      chunkColumns: columns,
      chunkRows: rows,
      tileSize: 8,
      tilesetKey: 'forest-tileset',
      playerStart: { worldX: 6, worldY: 6 },
      puzzle: true,
      exportedAt: new Date().toISOString(),
    },
    chunks: [{
      cx: 0,
      cy: 0,
      ground: Array.from({ length: rows }, () => Array.from({ length: columns }, () => 5)),
      upper: Array.from({ length: rows }, () => Array.from({ length: columns }, () => null)),
      collisions: Array.from({ length: rows }, () => Array.from({ length: columns }, () => false)),
      enemies: [],
      pickups: [],
      npcs: [],
    }],
    props: [],
    dialogs: {},
    globalVariables: {},
  };
};

// The world API serves the real overworld (`world`) and the puzzle levels (`level-N`, edited
// via /lab). Everything else in ?file= is rejected — the resolver returns null.
const resolveWorldFile = (fileId: string): string | null => {
  if (fileId === 'world') return worldJsonPath;
  const level = /^level-(\d+)$/u.exec(fileId);
  return level ? path.join(levelJsonDir, `level-${level[1]}.json`) : null;
};

const sanitizeFileName = (fileName: string): string | null => {
  if (!/^[A-Za-z0-9._-]+\.json$/u.test(fileName)) {
    return null;
  }

  return fileName;
};

const readRequestBody = async (request: IncomingMessage): Promise<string> => new Promise((resolve, reject) => {
  let body = '';

  request.setEncoding('utf8');
  request.on('data', (chunk) => {
    body += chunk;
  });
  request.on('end', () => {
    resolve(body);
  });
  request.on('error', reject);
});

const levelsApiPlugin = (): Plugin => ({
  name: 'levels-api',
  configureServer(server) {
    server.middlewares.use('/api/levels', async (req, res) => {
      const method = req.method ?? 'GET';
      const url = req.url ?? '/';
      const pathName = url.split('?')[0] ?? '/';
      const rawFileName = pathName.replace(/^\/+/u, '');

      try {
        if (method === 'GET' && rawFileName === '') {
          const entries = await fs.readdir(levelsDir, { withFileTypes: true });
          const levelFiles = await Promise.all(entries
            .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
            .map(async (entry) => {
              const filePath = path.join(levelsDir, entry.name);
              const content = await fs.readFile(filePath, 'utf8');
              const parsed = JSON.parse(content) as { meta?: { name?: string } };

              return {
                fileName: entry.name,
                levelName: parsed.meta?.name ?? entry.name.replace(/\.json$/u, ''),
              };
            }));

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(levelFiles));
          return;
        }

        const fileName = sanitizeFileName(decodeURIComponent(rawFileName ?? ''));

        if (!fileName) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Nome de arquivo invalido' }));
          return;
        }

        const filePath = path.join(levelsDir, fileName);

        if (method === 'GET') {
          const content = await fs.readFile(filePath, 'utf8');
          res.setHeader('Content-Type', 'application/json');
          res.end(content);
          return;
        }

        if (method === 'PUT') {
          const body = await readRequestBody(req);
          const parsed = JSON.parse(body) as object;
          await fs.writeFile(filePath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(parsed));
          return;
        }

        res.statusCode = 405;
        res.end(JSON.stringify({ error: 'Metodo nao suportado' }));
      } catch (error) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          error: error instanceof Error ? error.message : 'Erro inesperado',
        }));
      }
    });
  },
});

// CRUD used by the puzzle laboratory. Unlike the legacy /api/levels endpoint above, this works
// on the same public/levels files the game actually plays and refreshes index.json after every
// mutation, so the title's level list and portal progression cannot drift from the editor.
const labLevelsApiPlugin = (): Plugin => ({
  name: 'lab-levels-api',
  configureServer(server) {
    server.middlewares.use('/api/lab-levels', async (req, res) => {
      const method = req.method ?? 'GET';
      const pathName = (req.url ?? '/').split('?')[0] ?? '/';
      const rawLevel = pathName.replace(/^\/+|\/+$/gu, '');
      const parsedLevel = /^\d+$/u.test(rawLevel) ? Number(rawLevel) : null;
      res.setHeader('Content-Type', 'application/json');

      try {
        if (method === 'GET' && rawLevel === '') {
          res.end(JSON.stringify(await listLabLevels()));
          return;
        }

        if (method === 'POST' && rawLevel === '') {
          const body = JSON.parse(await readRequestBody(req)) as { name?: string };
          const name = body.name?.trim() ?? '';
          if (!name || name.length > 80) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Use um nome entre 1 e 80 caracteres' }));
            return;
          }
          const existing = await listLabLevels();
          const level = Math.max(0, ...existing.map((entry) => entry.level)) + 1;
          const file = `level-${level}.json`;
          await fs.writeFile(
            path.join(levelJsonDir, file),
            `${JSON.stringify(makeBlankPuzzleLevel(name), null, 2)}\n`,
            { encoding: 'utf8', flag: 'wx' },
          );
          const levels = await syncLabLevelIndex();
          res.statusCode = 201;
          res.end(JSON.stringify(levels.find((entry) => entry.level === level)));
          return;
        }

        if (parsedLevel === null) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: 'Numero de level invalido' }));
          return;
        }

        const filePath = path.join(levelJsonDir, `level-${parsedLevel}.json`);
        if (method === 'PATCH') {
          const body = JSON.parse(await readRequestBody(req)) as { name?: string };
          const name = body.name?.trim() ?? '';
          if (!name || name.length > 80) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Use um nome entre 1 e 80 caracteres' }));
            return;
          }
          const parsed = JSON.parse(await fs.readFile(filePath, 'utf8')) as {
            meta?: { name?: string; exportedAt?: string };
          };
          if (!parsed.meta) throw new Error('Level invalido: meta ausente');
          parsed.meta.name = name;
          parsed.meta.exportedAt = new Date().toISOString();
          await fs.writeFile(filePath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
          const levels = await syncLabLevelIndex();
          res.end(JSON.stringify(levels.find((entry) => entry.level === parsedLevel)));
          return;
        }

        if (method === 'DELETE') {
          // /lab without a query defaults to level 1. Keeping that base file guarantees the
          // laboratory always has a valid landing page; every level created by the manager is
          // still freely removable.
          if (parsedLevel === 1) {
            res.statusCode = 409;
            res.end(JSON.stringify({ error: 'O Level 1 base nao pode ser apagado' }));
            return;
          }
          await fs.unlink(filePath);
          const levels = await syncLabLevelIndex();
          res.end(JSON.stringify({ deleted: parsedLevel, levels }));
          return;
        }

        res.statusCode = 405;
        res.end(JSON.stringify({ error: 'Metodo nao suportado' }));
      } catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
        res.statusCode = code === 'ENOENT' ? 404 : code === 'EEXIST' ? 409 : 500;
        res.end(JSON.stringify({
          error: error instanceof Error ? error.message : 'Erro inesperado',
        }));
      }
    });
  },
});

// Read/write the authored world files. The world editor (/editor) loads public/world.json;
// the puzzle lab (/lab) loads public/levels/level-N.json — selected via ?file=level-N. GET
// loads, PUT persists; the game reads the same files as static assets. Dev-only.
const worldApiPlugin = (): Plugin => ({
  name: 'world-api',
  configureServer(server) {
    server.middlewares.use('/api/world', async (req, res) => {
      const method = req.method ?? 'GET';
      const fileId = new URL(req.url ?? '/', 'http://localhost').searchParams.get('file') ?? 'world';
      const targetPath = resolveWorldFile(fileId);

      try {
        if (!targetPath) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Arquivo de mundo invalido' }));
          return;
        }

        if (method === 'GET') {
          const content = await fs.readFile(targetPath, 'utf8');
          res.setHeader('Content-Type', 'application/json');
          res.end(content);
          return;
        }

        if (method === 'PUT') {
          const body = await readRequestBody(req);
          const parsed = JSON.parse(body) as object;
          await fs.writeFile(targetPath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
          if (fileId !== 'world') await syncLabLevelIndex();

          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true }));
          return;
        }

        res.statusCode = 405;
        res.end(JSON.stringify({ error: 'Metodo nao suportado' }));
      } catch (error) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          error: error instanceof Error ? error.message : 'Erro inesperado',
        }));
      }
    });
  },
});

const spaFallbackPlugin = (): Plugin => ({
  name: 'spa-fallback',
  apply: 'build',
  async closeBundle() {
    const distDir = fileURLToPath(new URL('./dist', import.meta.url));
    const indexPath = path.join(distDir, 'index.html');
    const fallbackPath = path.join(distDir, '404.html');
    const indexHtml = await fs.readFile(indexPath, 'utf8');

    await fs.writeFile(fallbackPath, indexHtml, 'utf8');
  },
});

const resolveBasePath = (): string => {
  if (!process.env.GITHUB_ACTIONS) {
    return '/';
  }

  const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1];

  return repositoryName ? `/${repositoryName}/` : '/';
};

export default defineConfig({
  base: resolveBasePath(),
  plugins: [levelsApiPlugin(), labLevelsApiPlugin(), worldApiPlugin(), spaFallbackPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});

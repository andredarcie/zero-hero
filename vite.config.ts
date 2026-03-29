import fs from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

import { defineConfig, type Plugin } from 'vite';

const levelsDir = fileURLToPath(new URL('./levels', import.meta.url));

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
  plugins: [levelsApiPlugin(), spaFallbackPlugin()],
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

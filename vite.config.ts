import fs from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

import { defineConfig, type Plugin } from 'vite';

const worldJsonPath = fileURLToPath(new URL('./public/world.json', import.meta.url));
// O ESPELHO: o andar de baixo do mundo, mesmo tamanho e mesmas coordenadas.
const underworldJsonPath = fileURLToPath(new URL('./public/underworld.json', import.meta.url));

// The world API serves the two FLOORS of the one open world: `world` (a superfície,
// public/world.json) e `underworld` (o espelho de baixo, public/underworld.json). Os dois se
// escolhem no /editor — a chave Overworld/Underworld do painel, que é o `?under` da URL.
// Everything else in ?file= is rejected.
const resolveWorldFile = (fileId: string): string | null => {
  if (fileId === 'world') return worldJsonPath;
  if (fileId === 'underworld') return underworldJsonPath;
  return null;
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
  plugins: [worldApiPlugin(), spaFallbackPlugin()],
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

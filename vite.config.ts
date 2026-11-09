/// <reference types="vitest/config" />
import fs from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

import { defineConfig, type Plugin } from 'vite';

const worldJsonPath = fileURLToPath(new URL('./public/world.json', import.meta.url));
// The world API serves the one open world (public/world.json) — the game is the surface only.
// Everything else in ?file= is rejected.
const resolveWorldFile = (fileId: string): string | null => (fileId === 'world' ? worldJsonPath : null);

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
  // Os testes de unidade (`npm test`): a lógica que não precisa de tela, em Node. O jogo jogado é com o playtest/.
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // A plataforma dos testes (src/test-support/testPlatform.ts) entra antes de cada arquivo.
    setupFiles: ['src/test-support/setup.ts'],
    // O jsdom carrega imagem (de data URL) e desenha nos canvas pelo pacote `canvas`.
    environmentOptions: { jsdom: { resources: 'usable', pretendToBeVisual: true } },
    // A cobertura (`npm run test:coverage`) mede TODO o src — inclusive o arquivo que nenhum teste carrega, que entra
    // com 0% — para a porcentagem dizer quanto do jogo de verdade os testes passam. Relatório em coverage/index.html.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/__tests__/**', 'src/**/*.d.ts', 'src/test-support/**'],
      reporter: ['text-summary', 'html', 'json-summary', 'json'],
      reportsDirectory: 'coverage',
      // O piso pedido pelo autor (2026-11-08): o relatório falha se a cobertura cair abaixo dele.
      thresholds: { statements: 60, lines: 60 },
    },
  },
});

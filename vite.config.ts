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

// AS FALAS (o editor de falas do /editor, src/game/editor/DialogEditor): os dois arquivos de src/game/i18n/dialogos.
// GET devolve os dois; PUT recebe o TEXTO de cada um (o editor formata como o arquivo é escrito à mão) e só grava se
// os dois forem JSON de verdade — nunca um sem o outro. O jogo aberto pega o texto novo pelo HMR (i18n.ts).
const DIALOG_LANGS = ['pt-br', 'en'] as const;
const dialogPath = (lang: string): string => fileURLToPath(new URL(`./src/game/i18n/dialogos/${lang}.json`, import.meta.url));

const dialogApiPlugin = (): Plugin => ({
  name: 'dialog-api',
  configureServer(server) {
    server.middlewares.use('/api/dialogos', async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      try {
        if (req.method === 'GET') {
          const out: Record<string, unknown> = {};
          for (const lang of DIALOG_LANGS) out[lang] = JSON.parse(await fs.readFile(dialogPath(lang), 'utf8'));
          res.end(JSON.stringify(out));
          return;
        }
        if (req.method === 'PUT') {
          const texts = JSON.parse(await readRequestBody(req)) as Record<string, unknown>;
          for (const lang of DIALOG_LANGS) {
            const text = texts[lang];
            const parsed = typeof text === 'string' ? JSON.parse(text) as unknown : null;
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`dialogos/${lang}.json invalido`);
          }
          for (const lang of DIALOG_LANGS) {
            const text = texts[lang] as string;
            await fs.writeFile(dialogPath(lang), text.endsWith('\n') ? text : `${text}\n`, 'utf8');
          }
          res.end(JSON.stringify({ ok: true }));
          return;
        }
        res.statusCode = 405;
        res.end(JSON.stringify({ error: 'Metodo nao suportado' }));
      } catch (error) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Erro inesperado' }));
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
  plugins: [worldApiPlugin(), dialogApiPlugin(), spaFallbackPlugin()],
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
    // 20 s e não os 5 s de fábrica: o PRIMEIRO canvas desenhado num arquivo de teste (o pacote `canvas` subindo) leva
    // segundos com a máquina ocupada, e três testes diferentes já caíram por tempo assim, um de cada vez e nunca o mesmo
    // (NameCard, DyeCard, homeArt). Um teste vermelho por pressa do relógio trava o deploy sem ter achado defeito.
    testTimeout: 20000,
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

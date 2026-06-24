// Boots (and tears down) the Vite dev server the browser will point at.
//
// If a server is already listening at config.baseUrl we reuse it and leave it running —
// so you can `npm run dev` in one terminal and `npm run playtest` in another for a fast loop.
import { spawn } from 'node:child_process';
import http from 'node:http';

import { config } from '../config.mjs';
import { log } from './report.mjs';

const ping = (url) =>
  new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const waitForServer = async (url, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await ping(url)) return true;
    await sleep(400);
  }
  return false;
};

const killTree = (child) =>
  new Promise((resolve) => {
    if (!child || child.exitCode !== null) {
      resolve();
      return;
    }
    if (process.platform === 'win32') {
      // npm spawns vite as a grandchild; /T kills the whole tree.
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }).on(
        'close',
        () => resolve(),
      );
    } else {
      child.kill('SIGTERM');
      resolve();
    }
  });

/**
 * @returns {Promise<{ reused: boolean, stop: () => Promise<void> }>}
 */
export const startDevServer = async () => {
  if (!config.autoStartServer) {
    log(`Using external server at ${config.baseUrl} (PLAYTEST_BASE_URL set).`);
    const ok = await waitForServer(config.baseUrl, config.serverReadyTimeoutMs);
    if (!ok) throw new Error(`No server reachable at ${config.baseUrl}`);
    return { reused: true, stop: async () => {} };
  }

  if (await ping(config.baseUrl)) {
    log(`Reusing dev server already listening at ${config.baseUrl}.`);
    return { reused: true, stop: async () => {} };
  }

  log(`Starting Vite dev server on port ${config.port}...`);
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(
    npm,
    ['run', 'dev', '--', '--port', String(config.port), '--strictPort'],
    {
      cwd: config.paths.projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    },
  );

  child.stdout.on('data', (chunk) => {
    const line = String(chunk).trim();
    if (line) log(`[vite] ${line}`, { quiet: true });
  });
  child.stderr.on('data', (chunk) => {
    const line = String(chunk).trim();
    if (line) log(`[vite:err] ${line}`, { quiet: true });
  });

  const ok = await waitForServer(config.baseUrl, config.serverReadyTimeoutMs);
  if (!ok) {
    await killTree(child);
    throw new Error('Vite dev server did not become ready in time.');
  }
  log(`Dev server ready at ${config.baseUrl}.`);

  return {
    reused: false,
    stop: async () => {
      log('Stopping Vite dev server...');
      await killTree(child);
    },
  };
};

// Central configuration for the playtest harness.
//
// Design notes:
// - headless is ALWAYS false. The game renders through WebGL and headless Chromium
//   produces a black canvas (documented in progress.md). A real, visible window is the
//   whole point of this harness — see playtest/README.md.
// - deviceScaleFactor 2 makes the pixel-art UI screenshot crisply (retina capture).
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const playtestDir = here;
const projectRoot = path.resolve(here, '..');

const port = Number(process.env.PLAYTEST_PORT ?? 5173);
// If PLAYTEST_BASE_URL is set we attach to that server; otherwise we boot our own Vite.
const externalBaseUrl = process.env.PLAYTEST_BASE_URL;

export const config = {
  // Never headless. This is intentional and non-negotiable for this project.
  headless: false,

  // A little slow-mo keeps the run watchable and lets frames settle before screenshots.
  slowMoMs: Number(process.env.PLAYTEST_SLOWMO ?? 50),

  // PLAYTEST_UNTHROTTLED=1 unlocks vsync, so a frame costs what it costs instead of whatever
  // the refresh rate says. Required for ANY performance measurement — see UNTHROTTLED_ARGS.
  unthrottled: process.env.PLAYTEST_UNTHROTTLED === '1',

  port,
  baseUrl: externalBaseUrl ?? `http://localhost:${port}`,
  autoStartServer: !externalBaseUrl,

  // Big enough that the board renders at its max tile size; black margins frame the canvas.
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,

  // Boot = Vite up + first Phaser scene alive.
  serverReadyTimeoutMs: 40000,
  bootTimeoutMs: 30000,
  // How long to wait for the GameScene to become active after skipping the intro.
  gameReadyTimeoutMs: 20000,

  // Per-tile cadence when walking. moveDurationMs is 140; we add headroom so each
  // discrete step fully completes before the next key press.
  stepIntervalMs: 230,

  paths: {
    projectRoot,
    playtestDir,
    resultsDir: path.join(playtestDir, 'results'),
  },

  // Keep the window open this long after the run finishes (ms). Handy for eyeballing.
  keepOpenMs: Number(process.env.PLAYTEST_KEEP_OPEN ?? 0),
};

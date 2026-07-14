#!/usr/bin/env node
// Playtest orchestrator.
//
//   npm run playtest                 # default sequence (smoke, explore, dialog, shop)
//   npm run playtest -- dialog shop  # only the named scenarios
//   npm run playtest -- all          # every registered scenario
//   npm run playtest -- text         # alias for the text-legibility scenario
//
// Always opens a REAL, visible Chromium window (never headless) and writes screenshots +
// a Markdown/JSON report into playtest/results/<run>/ (gitignored).
import fs from 'node:fs/promises';
import path from 'node:path';

import { config } from './config.mjs';
import { GameDriver } from './lib/GameDriver.mjs';
import { Report, log } from './lib/report.mjs';
import { startDevServer } from './lib/devServer.mjs';
import { scenarios, DEFAULT_SEQUENCE } from './scenarios/index.mjs';

const ALIASES = { text: 'text-legibility', legibility: 'text-legibility' };

const resolveSelection = (argv) => {
  const args = argv.filter((a) => !a.startsWith('-'));
  if (args.length === 0) return DEFAULT_SEQUENCE;
  if (args.includes('all')) return Object.keys(scenarios);
  return args.map((a) => ALIASES[a] ?? a);
};

const runIdFromNow = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

const main = async () => {
  const selection = resolveSelection(process.argv.slice(2));
  const unknown = selection.filter((name) => !scenarios[name]);
  if (unknown.length) {
    console.error(`Unknown scenario(s): ${unknown.join(', ')}`);
    console.error(`Available: ${Object.keys(scenarios).join(', ')}`);
    process.exit(2);
  }

  const runId = `run-${runIdFromNow()}`;
  const runDir = path.join(config.paths.resultsDir, runId);
  const shotsDir = path.join(runDir, 'screenshots');
  await fs.mkdir(shotsDir, { recursive: true });

  const report = new Report(runDir, { baseUrl: config.baseUrl, scenarios: selection });
  log(`Playtest run: ${runId}`);
  log(`Scenarios: ${selection.join(', ')}`);

  const server = await startDevServer();
  const driver = await GameDriver.launch();

  try {
    for (const name of selection) {
      const scenario = scenarios[name];
      log(`\n=== Scenario: ${name} — ${scenario.description} ===`);

      // Build the per-scenario context handed to run().
      let shotIndex = 0;
      const shot = async (shotName, opts = {}) => {
        const { region, selector, note, state } = opts;
        const file = path.join(
          shotsDir,
          `${name}__${String(shotIndex).padStart(2, '0')}_${shotName}.png`,
        );
        shotIndex += 1;
        let clip;
        const sel = selector;
        if (region) clip = await driver.canvasRegion(region);
        // Default: the whole viewport. The game renders across TWO stacked canvases now
        // (the 3D world under the transparent Phaser UI layer), so shooting a single
        // canvas element would capture only half the frame.
        await driver.screenshot(file, { clip, selector: sel });
        const snapshot = state ?? (await driver.getState());
        report.addStep({ scenario: name, name: shotName, note, screenshot: file, state: snapshot });
        log(`  shot: ${path.basename(file)}`);
        return file;
      };
      const assert = (label, condition, detail) =>
        report.addAssert({ scenario: name, label, ok: condition, detail });

      try {
        // `?play` boots straight into the GameScene (dev only), skipping the language
        // pick, the title and the wizard intro — keying past them was flaky. A scenario
        // may override the entry route (e.g. the puzzle lab enters via /lab?play).
        await driver.open(scenario.route ?? (scenario.needsGame ? '/?play' : '/'));
        if (scenario.needsGame) await driver.startGame();
        await scenario.run({ driver, shot, assert, log });
      } catch (err) {
        report.addAssert({
          scenario: name,
          label: 'Scenario completed without throwing',
          ok: false,
          detail: err instanceof Error ? err.message : String(err),
        });
        // Best-effort failure screenshot.
        try {
          const file = path.join(shotsDir, `${name}__ERROR.png`);
          await driver.screenshot(file, {});
          report.addStep({ scenario: name, name: 'ERROR', note: 'state at failure', screenshot: file });
        } catch {
          /* ignore */
        }
      }
    }

    // Uncaught JS errors in the page are real game breakage.
    report.addAssert({
      scenario: 'page',
      label: 'No uncaught page errors',
      ok: driver.consoleErrors.filter((e) => e.startsWith('pageerror:')).length === 0,
      detail: driver.consoleErrors.filter((e) => e.startsWith('pageerror:')).join(' | '),
    });

    if (config.keepOpenMs > 0) {
      log(`Keeping the window open for ${config.keepOpenMs}ms...`);
      await driver.settle(config.keepOpenMs);
    }
  } finally {
    await report.write({ consoleErrors: driver.consoleErrors });
    await driver.close();
    await server.stop();
  }

  const failures = report.failures;
  log('');
  log(`Report: ${path.join(runDir, 'report.md')}`);
  log(`Screenshots: ${shotsDir}`);
  if (failures.length) {
    log(`RESULT: ${failures.length} assertion(s) FAILED.`);
    process.exit(1);
  }
  log('RESULT: all assertions passed.');
};

main().catch((err) => {
  console.error('Fatal playtest error:', err);
  process.exit(1);
});

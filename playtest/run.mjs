#!/usr/bin/env node
// Playtest orchestrator.
//
//   npm run playtest                       # default sequence (smoke, explore, dialog)
//   npm run playtest -- dialog shop        # only the named scenarios
//   npm run playtest -- all                # every registered scenario
//   npm run playtest -- text               # alias for the text-legibility scenario
//   npm run playtest -- a b c --budget=8   # não começa cenário novo depois de 8 min (o resto fica pendente)
//   npm run playtest -- --resume           # continua a última rodada: só o que não terminou
//   npm run playtest -- --resume=run-...   # continua uma rodada específica
//   npm run playtest:clean                 # encerra navegador/servidor que uma rodada morta deixou para trás
//
// Always opens a REAL, visible Chromium window (never headless) and writes screenshots +
// a Markdown/JSON report into playtest/results/<run>/ (gitignored).
//
// A MEMÓRIA (lib/memoryGuard.mjs, lib/processes.mjs): cada cenário roda num navegador NOVO, fechado no fim, então o
// que um cenário alocou volta ao sistema antes do próximo (com um navegador só para a rodada inteira, cada recarga
// do jogo deixava um pouco, e uma suíte longa acabava com a memória da máquina). Um cenário só começa com memória
// livre acima do piso, e é abortado (navegador fechado na hora) se a livre cai abaixo do piso de aborto. O relatório é
// gravado a cada cenário: uma rodada interrompida perde no máximo o cenário em curso, e `--resume` continua dela.
import fs from 'node:fs/promises';
import path from 'node:path';

import { config } from './config.mjs';
import { GameDriver } from './lib/GameDriver.mjs';
import { freeMB, memoryFloors, MemoryWatch, totalMB, waitForFreeMemory } from './lib/memoryGuard.mjs';
import { cleanLeftovers, installExitCleanup, killOwnBrowsers } from './lib/processes.mjs';
import { Report, log } from './lib/report.mjs';
import { startDevServer } from './lib/devServer.mjs';
import { scenarios, DEFAULT_SEQUENCE } from './scenarios/index.mjs';

const ALIASES = { text: 'text-legibility', legibility: 'text-legibility' };

const argv = process.argv.slice(2);
/** `--nome` → true, `--nome=valor` → 'valor', ausente → undefined. */
const flag = (name) => {
  const a = argv.find((x) => x === `--${name}` || x.startsWith(`--${name}=`));
  if (!a) return undefined;
  const i = a.indexOf('=');
  return i < 0 ? true : a.slice(i + 1);
};

const resolveSelection = (fallback) => {
  const args = argv.filter((a) => !a.startsWith('-'));
  if (args.length === 0) return fallback;
  if (args.includes('all')) return Object.keys(scenarios);
  return args.map((a) => ALIASES[a] ?? a);
};

const runIdFromNow = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

const latestRunId = async () => {
  const runs = (await fs.readdir(config.paths.resultsDir)).filter((d) => d.startsWith('run-')).sort();
  for (const id of runs.reverse()) {
    try {
      await fs.access(path.join(config.paths.resultsDir, id, 'report.json'));
      return id;
    } catch { /* rodada sem relatório: segue */ }
  }
  throw new Error('Nenhuma rodada anterior com report.json para continuar.');
};

/** A rodada: nova, ou a anterior que `--resume` continua (só com o que ela não terminou). */
const openRun = async () => {
  const resume = flag('resume');
  if (resume) {
    const runId = resume === true ? await latestRunId() : resume;
    const runDir = path.join(config.paths.resultsDir, runId);
    const report = await Report.load(runDir);
    const selection = resolveSelection(report.meta.scenarios ?? []).filter((n) => !report.completed.has(n));
    report.meta.scenarios = [...new Set([...(report.meta.scenarios ?? []), ...selection])];
    // O "nenhum erro de página" é recalculado no fim, com tudo o que a rodada viu.
    report.asserts = report.asserts.filter((a) => a.scenario !== 'page');
    return { runId, runDir, report, selection, resumed: true };
  }
  const selection = resolveSelection(DEFAULT_SEQUENCE);
  const runId = `run-${runIdFromNow()}`;
  const runDir = path.join(config.paths.resultsDir, runId);
  const report = new Report(runDir, { baseUrl: config.baseUrl, scenarios: selection });
  return { runId, runDir, report, selection, resumed: false };
};

/** Um cenário inteiro: navegador novo, vigia de memória, a execução, e o navegador fechado no fim. */
const runScenario = async (name, { report, shotsDir, floors, server }) => {
  const scenario = scenarios[name];
  log(`\n=== Scenario: ${name} — ${scenario.description} ===`);
  report.resetScenario(name);
  const freeStartMB = freeMB();
  const driver = await GameDriver.launch();
  let critical = null;
  const watch = new MemoryWatch({
    abortMB: floors.abortMB,
    extraRoots: () => (server.pid ? [server.pid] : []),
    onCritical: (mb) => {
      critical = mb;
      log(`MEMÓRIA CRÍTICA: ${mb} MB livres (piso ${floors.abortMB}) — fechando o navegador e abortando "${name}".`);
      void driver.close();
    },
  }).start();

  // Build the per-scenario context handed to run().
  let shotIndex = 0;
  const shot = async (shotName, opts = {}) => {
    // `region` is one of the named crops (canvasRegion); `clip` is an explicit rect in CSS
    // pixels, for a scenario that measures one PATCH of the frame — the water A/B in
    // `montanha` compares a water-only crop against a ground-only one, and a full-frame shot
    // would let a firefly drifting past decide the result.
    const { region, clip: rawClip, selector, note, state } = opts;
    const file = path.join(shotsDir, `${name}__${String(shotIndex).padStart(2, '0')}_${shotName}.png`);
    shotIndex += 1;
    let clip = rawClip;
    if (region) clip = await driver.canvasRegion(region);
    // Default: the whole viewport. The game renders across TWO stacked canvases now
    // (the 3D world under the transparent 2D UI layer), so shooting a single
    // canvas element would capture only half the frame.
    await driver.screenshot(file, { clip, selector });
    const snapshot = state ?? (await driver.getState());
    report.addStep({ scenario: name, name: shotName, note, screenshot: file, state: snapshot });
    log(`  shot: ${path.basename(file)}`);
    return file;
  };
  const assert = (label, condition, detail) => report.addAssert({ scenario: name, label, ok: condition, detail });

  try {
    // `?play` boots straight into the GameScene (dev only), skipping the language
    // pick, the title and the wizard intro — keying past them was flaky. A scenario
    // may override the entry route (e.g. a fixture scenario enters via /editor).
    await driver.open(scenario.route ?? (scenario.needsGame ? '/?play' : '/'));
    if (scenario.needsGame) await driver.startGame();
    await scenario.run({ driver, shot, assert, log });
  } catch (err) {
    if (critical === null) {
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

  if (critical !== null) {
    report.addAssert({ scenario: name, label: 'Cenário abortado pela guarda de memória', ok: false, detail: `${critical} MB livres no sistema` });
  }
  const mem = await watch.stop();
  report.consoleErrors.push(...driver.consoleErrors.map((e) => `[${name}] ${e}`));
  if (config.keepOpenMs > 0) {
    log(`Keeping the window open for ${config.keepOpenMs}ms...`);
    await driver.settle(config.keepOpenMs).catch(() => {});
  }
  await driver.close();
  const strays = await killOwnBrowsers();
  if (strays) log(`  (${strays} processo(s) do navegador não fecharam sozinhos e foram encerrados)`);
  report.addMemory({ scenario: name, freeStartMB, minFreeMB: mem.minFreeMB, peakTreeMB: mem.peakTreeMB, aborted: critical !== null });
  if (critical === null) report.completed.add(name);
  log(`  memória: ${freeStartMB} MB livres no início, mínimo ${mem.minFreeMB} MB, pico navegador+servidor ${mem.peakTreeMB} MB`);
};

const main = async () => {
  installExitCleanup();
  const leftovers = await cleanLeftovers();
  const { runId, runDir, report, selection, resumed } = await openRun();
  const unknown = selection.filter((name) => !scenarios[name]);
  if (unknown.length) {
    console.error(`Unknown scenario(s): ${unknown.join(', ')}`);
    console.error(`Available: ${Object.keys(scenarios).join(', ')}`);
    process.exit(2);
  }
  const shotsDir = path.join(runDir, 'screenshots');
  await fs.mkdir(shotsDir, { recursive: true });

  log(`Playtest run: ${runId}${resumed ? ' (continuando)' : ''}`);
  log(`Scenarios: ${selection.join(', ') || '(nada a rodar)'}`);
  if (leftovers.killed) log(`Limpeza: ${leftovers.killed} processo(s) de rodadas interrompidas encerrados (~${leftovers.mb} MB).`);
  const floors = memoryFloors();
  const budgetMin = Number(flag('budget') ?? process.env.PLAYTEST_BUDGET_MIN ?? 0);
  log(`Memória: ${freeMB()} MB livres de ${totalMB()} MB; um cenário começa com ≥ ${floors.startMB} MB e é abortado abaixo de ${floors.abortMB} MB.${budgetMin > 0 ? ` Orçamento: ${budgetMin} min.` : ''}`);

  const server = await startDevServer();
  const t0 = Date.now();
  try {
    for (const name of selection) {
      if (budgetMin > 0 && Date.now() - t0 > budgetMin * 60000) {
        report.stopReason = `orçamento de ${budgetMin} min esgotado`;
        break;
      }
      const free = await waitForFreeMemory(floors.startMB);
      if (free < floors.startMB) {
        report.stopReason = `memória: ${free} MB livres, abaixo do piso de partida (${floors.startMB} MB)`;
        log(`PARANDO: ${report.stopReason}.`);
        break;
      }
      await runScenario(name, { report, shotsDir, floors, server });
      await report.write();
    }
  } finally {
    report.pending = (report.meta.scenarios ?? selection).filter((n) => !report.completed.has(n));
    if (!report.pending.length) {
      // Uncaught JS errors in the page are real game breakage.
      const pageErrors = report.consoleErrors.filter((e) => e.includes('pageerror:'));
      report.addAssert({ scenario: 'page', label: 'No uncaught page errors', ok: pageErrors.length === 0, detail: pageErrors.join(' | ') });
    }
    await report.write();
    await server.stop();
  }

  const failures = report.failures;
  log('');
  log(`Report: ${path.join(runDir, 'report.md')}`);
  log(`Screenshots: ${shotsDir}`);
  if (report.pending.length) {
    log(`INCOMPLETA (${report.stopReason ?? 'interrompida'}): faltam ${report.pending.join(', ')}`);
    log(`Para continuar: npm run playtest -- --resume=${runId}`);
  }
  if (failures.length) {
    log(`RESULT: ${failures.length} assertion(s) FAILED.`);
    process.exit(1);
  }
  if (report.pending.length) process.exit(3);
  log('RESULT: all assertions passed.');
};

main().catch((err) => {
  console.error('Fatal playtest error:', err);
  process.exit(1);
});

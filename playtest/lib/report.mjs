// Tiny logging + report builder. No deps — just writes Markdown/JSON/log into the run dir.
import fs from 'node:fs/promises';
import path from 'node:path';

const logBuffer = [];

export const log = (message, { quiet = false } = {}) => {
  const stamp = new Date().toISOString().slice(11, 19);
  const line = `${stamp}  ${message}`;
  logBuffer.push(line);
  if (!quiet) console.log(line);
};

export const getLogBuffer = () => logBuffer;

export class Report {
  constructor(runDir, meta = {}) {
    this.runDir = runDir;
    this.meta = meta;
    this.startedAt = new Date();
    this.steps = [];
    this.asserts = [];
    /** A memória de cada cenário (ver lib/memoryGuard.mjs). */
    this.memory = [];
    /** Os cenários que terminaram (passando ou falhando); o que falta é o que `--resume` roda. */
    this.completed = new Set();
    this.pending = [];
    this.stopReason = null;
    /** Os erros de console de todos os cenários, cada um com o nome do cenário na frente. */
    this.consoleErrors = [];
  }

  /** O relatório de uma rodada anterior, para continuar dela (`--resume`). */
  static async load(runDir) {
    const raw = JSON.parse(await fs.readFile(path.join(runDir, 'report.json'), 'utf8'));
    const r = new Report(runDir, raw.meta);
    r.startedAt = new Date(raw.startedAt);
    r.steps = raw.steps ?? [];
    r.asserts = raw.asserts ?? [];
    r.memory = raw.memory ?? [];
    r.completed = new Set(raw.completed ?? []);
    r.consoleErrors = raw.consoleErrors ?? [];
    try { logBuffer.push(...(await fs.readFile(path.join(runDir, 'run.log'), 'utf8')).split('\n')); } catch { /* sem log */ }
    return r;
  }

  /** Um cenário que vai rodar de novo (abortado ou interrompido) começa sem o que a tentativa anterior anotou. */
  resetScenario(scenario) {
    this.steps = this.steps.filter((s) => s.scenario !== scenario);
    this.asserts = this.asserts.filter((a) => a.scenario !== scenario);
    this.memory = this.memory.filter((m) => m.scenario !== scenario);
    this.consoleErrors = this.consoleErrors.filter((e) => !e.startsWith(`[${scenario}] `));
  }

  addMemory(entry) {
    this.memory.push(entry);
  }

  /** A captured moment: screenshot + (optional) live game state. */
  addStep({ scenario, name, note, screenshot, state }) {
    this.steps.push({
      scenario,
      name,
      note: note ?? '',
      screenshot: screenshot ? path.relative(this.runDir, screenshot).split(path.sep).join('/') : null,
      state: state ?? null,
      at: new Date().toISOString().slice(11, 19),
    });
  }

  /** A pass/fail check. Failures make the whole run exit non-zero, but never abort capture. */
  addAssert({ scenario, label, ok, detail }) {
    this.asserts.push({ scenario, label, ok: Boolean(ok), detail: detail ?? '' });
    log(`${ok ? 'PASS' : 'FAIL'}  [${scenario}] ${label}${detail ? ` — ${detail}` : ''}`);
  }

  get failures() {
    return this.asserts.filter((a) => !a.ok);
  }

  async write({ consoleErrors = this.consoleErrors } = {}) {
    const md = [];
    md.push(`# Playtest report`);
    md.push('');
    md.push(`- Run: \`${path.basename(this.runDir)}\``);
    md.push(`- Started: ${this.startedAt.toISOString()}`);
    md.push(`- Base URL: ${this.meta.baseUrl ?? ''}`);
    md.push(`- Scenarios: ${this.meta.scenarios?.join(', ') ?? ''}`);
    md.push(`- Steps captured: ${this.steps.length}`);
    md.push(
      `- Assertions: ${this.asserts.length - this.failures.length}/${this.asserts.length} passed`,
    );
    md.push(`- Console errors: ${consoleErrors.length}`);
    if (this.pending.length) {
      md.push(`- **Incompleta** (${this.stopReason ?? 'interrompida'}): faltam ${this.pending.join(', ')}`);
      md.push(`  — continuar com \`npm run playtest -- --resume=${path.basename(this.runDir)}\``);
    }
    md.push('');

    if (this.memory.length) {
      md.push('## Memória');
      md.push('');
      md.push('| Cenário | Livre no início (MB) | Menor livre (MB) | Pico navegador+servidor (MB) | |');
      md.push('| --- | --- | --- | --- | --- |');
      for (const m of this.memory) {
        md.push(`| ${m.scenario} | ${m.freeStartMB} | ${m.minFreeMB} | ${m.peakTreeMB} | ${m.aborted ? 'abortado pela guarda' : ''} |`);
      }
      md.push('');
    }

    if (this.asserts.length) {
      md.push(`## Assertions`);
      md.push('');
      md.push('| Result | Scenario | Check | Detail |');
      md.push('| --- | --- | --- | --- |');
      for (const a of this.asserts) {
        md.push(`| ${a.ok ? '✅' : '❌'} | ${a.scenario} | ${a.label} | ${a.detail} |`);
      }
      md.push('');
    }

    md.push(`## Steps`);
    md.push('');
    let currentScenario = null;
    for (const s of this.steps) {
      if (s.scenario !== currentScenario) {
        currentScenario = s.scenario;
        md.push(`### ${s.scenario}`);
        md.push('');
      }
      md.push(`**${s.at} — ${s.name}**${s.note ? ` — ${s.note}` : ''}`);
      md.push('');
      if (s.screenshot) {
        md.push(`![${s.name}](${s.screenshot})`);
        md.push('');
      }
      if (s.state) {
        md.push('```json');
        md.push(JSON.stringify(s.state, null, 2));
        md.push('```');
        md.push('');
      }
    }

    if (consoleErrors.length) {
      md.push(`## Console errors`);
      md.push('');
      md.push('```');
      for (const e of consoleErrors) md.push(e);
      md.push('```');
      md.push('');
    }

    await fs.writeFile(path.join(this.runDir, 'report.md'), md.join('\n'), 'utf8');
    await fs.writeFile(
      path.join(this.runDir, 'report.json'),
      JSON.stringify(
        {
          meta: this.meta,
          startedAt: this.startedAt.toISOString(),
          completed: [...this.completed],
          pending: this.pending,
          stopReason: this.stopReason,
          memory: this.memory,
          steps: this.steps,
          asserts: this.asserts,
          consoleErrors,
        },
        null,
        2,
      ),
      'utf8',
    );
    await fs.writeFile(path.join(this.runDir, 'run.log'), logBuffer.join('\n'), 'utf8');
  }
}

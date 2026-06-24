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

  async write({ consoleErrors = [] } = {}) {
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
    md.push('');

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

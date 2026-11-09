// OS PROCESSOS DO HARNESS: quem são, quanto ocupam, e como matar o que sobrou.
//
// Todo navegador que o harness abre leva na linha de comando `--zh-playtest-owner=<pid do node que o abriu>` (o
// Chromium ignora a chave), e o Vite que ele sobe fica anotado em `results/.processes.json` com o mesmo dono. Com isso:
//   - a memória de uma rodada é a ÁRVORE desses processos (navegador + GPU + renderizador + servidor);
//   - um processo cujo dono morreu é sobra de uma rodada interrompida (morta pelo sistema, Ctrl+C, travou) e pode
//     ser encerrado sem medo — e só ele: o navegador de outra rodada viva, ou de outro projeto, nunca é tocado.
import { execFile, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { config } from '../config.mjs';

export const OWNER_FLAG = '--zh-playtest-owner=';
/** A chave que marca um navegador como desta rodada. */
export const ownerArg = () => `${OWNER_FLAG}${process.pid}`;

const REGISTRY = path.join(config.paths.resultsDir, '.processes.json');
const MB = 1024 * 1024;

/** Todos os processos da máquina: pid, pai, memória (bytes de working set) e linha de comando. */
export const listProcesses = () => new Promise((resolve) => {
  if (process.platform === 'win32') {
    const script = 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,WorkingSetSize,CommandLine | ConvertTo-Json -Compress';
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { maxBuffer: 128 * MB, windowsHide: true }, (err, out) => {
      if (err) { resolve([]); return; }
      try {
        const raw = JSON.parse(out);
        resolve((Array.isArray(raw) ? raw : [raw]).map((p) => ({
          pid: p.ProcessId, ppid: p.ParentProcessId, bytes: Number(p.WorkingSetSize) || 0, cmd: p.CommandLine ?? '',
        })));
      } catch { resolve([]); }
    });
    return;
  }
  execFile('ps', ['-axo', 'pid=,ppid=,rss=,args='], { maxBuffer: 64 * MB }, (err, out) => {
    if (err) { resolve([]); return; }
    resolve(out.split('\n').filter(Boolean).map((line) => {
      const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/u);
      return m ? { pid: +m[1], ppid: +m[2], bytes: +m[3] * 1024, cmd: m[4] } : null;
    }).filter(Boolean));
  });
});

/** Os pids da árvore de cada raiz (as raízes inclusive). */
export const descendants = (list, roots) => {
  const kids = new Map();
  for (const p of list) {
    if (!kids.has(p.ppid)) kids.set(p.ppid, []);
    kids.get(p.ppid).push(p.pid);
  }
  const out = new Set();
  const stack = roots.filter((r) => list.some((p) => p.pid === r));
  while (stack.length) {
    const pid = stack.pop();
    if (out.has(pid)) continue;
    out.add(pid);
    for (const k of kids.get(pid) ?? []) stack.push(k);
  }
  return out;
};

/** Os navegadores marcados por um dono (o próprio processo, se nenhum for dado). */
export const markedBy = (list, owner = process.pid) => list.filter((p) => p.cmd.includes(`${OWNER_FLAG}${owner} `) || p.cmd.endsWith(`${OWNER_FLAG}${owner}`)).map((p) => p.pid);

/** Megabytes ocupados pela árvore das raízes. */
export const treeMB = (list, roots) => {
  const pids = descendants(list, roots);
  let bytes = 0;
  for (const p of list) if (pids.has(p.pid)) bytes += p.bytes;
  return Math.round(bytes / MB);
};

export const isAlive = (pid) => {
  try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; }
};

/** Mata um processo e todos os filhos dele, já (síncrono: funciona até dentro do `exit`). */
export const killTreeSync = (pid) => {
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    else process.kill(pid, 'SIGKILL');
  } catch { /* já tinha morrido */ }
};

// ── o registro dos servidores (o navegador não precisa: ele carrega a marca na própria linha de comando) ──
const readRegistry = () => {
  try { return JSON.parse(fs.readFileSync(REGISTRY, 'utf8')); } catch { return []; }
};
const writeRegistry = (entries) => {
  try {
    fs.mkdirSync(path.dirname(REGISTRY), { recursive: true });
    fs.writeFileSync(REGISTRY, JSON.stringify(entries, null, 1), 'utf8');
  } catch { /* sem registro, a limpeza pela marca ainda vale para os navegadores */ }
};
export const registerChild = (pid, kind) => writeRegistry([...readRegistry().filter((e) => e.pid !== pid), { pid, kind, owner: process.pid }]);
export const unregisterChild = (pid) => writeRegistry(readRegistry().filter((e) => e.pid !== pid));

/**
 * As SOBRAS de rodadas interrompidas: navegadores marcados e servidores registrados cujo dono não existe mais.
 * Devolve quantos foram encerrados e quanto ocupavam.
 */
export const cleanLeftovers = async () => {
  const list = await listProcesses();
  const roots = new Set();
  for (const p of list) {
    const m = p.cmd.match(/--zh-playtest-owner=(\d+)/u);
    if (m && Number(m[1]) !== process.pid && !isAlive(Number(m[1]))) roots.add(p.pid);
  }
  const keep = [];
  for (const e of readRegistry()) {
    const alive = list.find((p) => p.pid === e.pid);
    if (e.owner === process.pid || isAlive(e.owner)) keep.push(e);
    else if (alive && /vite/iu.test(alive.cmd)) roots.add(e.pid);
  }
  writeRegistry(keep);
  // Só as raízes: matar a árvore de um navegador leva GPU e renderizadores junto.
  const top = [...roots].filter((pid) => !roots.has(list.find((p) => p.pid === pid)?.ppid));
  const mb = treeMB(list, top);
  for (const pid of top) killTreeSync(pid);
  return { killed: top.length, mb };
};

/** Navegadores DESTA rodada que continuam vivos (um `close()` que não fechou): encerrados à força. */
export const killOwnBrowsers = async () => {
  const list = await listProcesses();
  const own = markedBy(list);
  for (const pid of own) killTreeSync(pid);
  return own.length;
};

/**
 * Na saída do node (normal, erro, Ctrl+C), o que esta rodada abriu fecha junto. Uma morte sem aviso (o sistema
 * matando o processo) não passa por aqui — é para isso que a próxima rodada chama `cleanLeftovers`.
 */
export const installExitCleanup = () => {
  const cleanup = () => {
    for (const e of readRegistry()) if (e.owner === process.pid) killTreeSync(e.pid);
    writeRegistry(readRegistry().filter((e) => e.owner !== process.pid));
    // Os navegadores marcados por este processo (síncrono: o `exit` não espera promessa).
    if (process.platform === 'win32') {
      const script = `Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*${OWNER_FLAG}${process.pid}*' } | ForEach-Object { taskkill /PID $_.ProcessId /T /F | Out-Null }`;
      try { execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { stdio: 'ignore', windowsHide: true }); } catch { /* nada a matar */ }
    }
  };
  process.on('exit', cleanup);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK', 'SIGHUP']) {
    try { process.on(sig, () => process.exit(130)); } catch { /* sinal inexistente nesta plataforma */ }
  }
};

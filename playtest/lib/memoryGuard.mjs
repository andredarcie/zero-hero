// A GUARDA DE MEMÓRIA DO HARNESS.
//
// O jogo no Chromium (WebGL, tela 2×, a cadeia de pós) e o Vite juntos ocupam alguns GB, e o sistema, quando a
// memória acaba, mata a rodada inteira sem aviso — e com ela o relatório. A guarda põe o harness no controle:
//   - um cenário só COMEÇA com memória livre acima do piso de partida (espera um pouco a memória do cenário anterior
//     voltar; se não voltar, a rodada para limpa, com o que falta marcado como pendente);
//   - durante o cenário, a memória livre é lida a cada segundo, e abaixo do piso de aborto o navegador fecha NA HORA
//     (o cenário fica marcado como abortado pela memória, e `--resume` o roda de novo);
//   - cada cenário anota no relatório quanto havia livre, o mínimo a que chegou e o pico da árvore navegador+servidor,
//     para se saber qual cenário pesa.
// Os pisos se ajustam por ambiente: PLAYTEST_MIN_FREE_MB (partida) e PLAYTEST_ABORT_FREE_MB (aborto).
import os from 'node:os';

import { listProcesses, markedBy, treeMB } from './processes.mjs';

const MB = 1024 * 1024;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const freeMB = () => Math.round(os.freemem() / MB);
export const totalMB = () => Math.round(os.totalmem() / MB);

/** Os dois pisos, em MB livres no sistema. Padrão: proporcional à máquina, com um mínimo absoluto. */
export const memoryFloors = () => {
  const total = totalMB();
  const startMB = Number(process.env.PLAYTEST_MIN_FREE_MB ?? Math.max(2500, Math.round(total * 0.18)));
  const abortMB = Number(process.env.PLAYTEST_ABORT_FREE_MB ?? Math.max(1500, Math.round(total * 0.1)));
  // O aborto fica abaixo da partida (senão todo cenário nasceria abortado) — a não ser que alguém o peça explicitamente.
  return { startMB, abortMB: process.env.PLAYTEST_ABORT_FREE_MB ? abortMB : Math.min(abortMB, startMB - 500) };
};

/** Espera a memória livre passar do piso (a do cenário anterior leva alguns segundos para voltar). Devolve a livre. */
export const waitForFreeMemory = async (floorMB, timeoutMs = 30000) => {
  const until = Date.now() + timeoutMs;
  let free = freeMB();
  while (free < floorMB && Date.now() < until) {
    await sleep(1000);
    free = freeMB();
  }
  return free;
};

/**
 * O vigia de um cenário: lê a memória livre a cada segundo (barato) e a árvore de processos da rodada a cada
 * `sampleEveryMs` (uma consulta ao sistema, ~1 s de CPU). `onCritical` é chamado UMA vez, quando a livre cai abaixo
 * do piso de aborto.
 */
export class MemoryWatch {
  constructor({ abortMB, onCritical, extraRoots = () => [], sampleEveryMs = 10000 }) {
    this.abortMB = abortMB;
    this.onCritical = onCritical;
    this.extraRoots = extraRoots;
    this.sampleEveryMs = sampleEveryMs;
    this.minFreeMB = freeMB();
    this.peakTreeMB = 0;
    this.fired = false;
    this.sampling = null;
    this.lastSample = 0;
  }

  start() {
    this.timer = setInterval(() => this.tick(), 1000);
    this.timer.unref?.();
    return this;
  }

  tick() {
    const free = freeMB();
    this.minFreeMB = Math.min(this.minFreeMB, free);
    if (!this.fired && free < this.abortMB) {
      this.fired = true;
      this.onCritical(free);
    }
    if (!this.sampling && Date.now() - this.lastSample >= this.sampleEveryMs) this.sampling = this.sample();
  }

  async sample() {
    try {
      const list = await listProcesses();
      const mb = treeMB(list, [...markedBy(list), ...this.extraRoots()]);
      this.peakTreeMB = Math.max(this.peakTreeMB, mb);
    } finally {
      this.lastSample = Date.now();
      this.sampling = null;
    }
  }

  /** Para o vigia (com uma última amostra) e devolve o que ele viu. */
  async stop() {
    clearInterval(this.timer);
    if (this.sampling) await this.sampling;
    await this.sample();
    this.minFreeMB = Math.min(this.minFreeMB, freeMB());
    return { minFreeMB: this.minFreeMB, peakTreeMB: this.peakTreeMB, aborted: this.fired };
  }
}

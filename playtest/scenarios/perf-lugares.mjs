// O PERFIL POR LUGAR (pedido do autor, 2026-11-19: "faça uma melhoria geral na performance"). O `perf-profile` mede o
// começo do jogo; o mapa cresceu (a praia do norte, a fonte termal) e cada lugar tem o seu custo. Este cenário leva o
// herói a cada lugar que importa, espera o mundo assentar e grava duas janelas parado:
//
//   1. o QUADRO DE VERDADE, com vsync e sem profiler: os intervalos do requestAnimationFrame (quantos quadros, p50,
//      p90). É o número que vale — num monitor de 165 Hz o quadro sai em múltiplos de ~6 ms, então "12 ms" quer dizer
//      "perdeu um vsync". (Sem vsync, PLAYTEST_UNTHROTTLED=1, esta máquina alterna de regime e mostra travadas de
//      90–180 ms que não existem no jogo: não medir assim.)
//   2. o profiler (`__prof`): a divisão cpu/gpu, os draws, os triângulos e as seções que mais gastam. Ele infla o tempo
//      de cpu (as marcas custam) e o timer de gpu mede o intervalo de envio, não só a gpu: serve para comparar seções.
//
// Relata, não reprova (só o piso de 30 fps): o número só serve contra outro número — rode antes e depois de cada mudança.
//
//   node playtest/run.mjs perf-lugares
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Os lugares: o tile, a hora, e se o herói senta ali (o Z: a cadeira do guarda-sol, a água da fonte). */
const PLACES = [
  { name: 'acampamento-dia', x: 54, y: 50, hour: 0.45 },
  { name: 'acampamento-noite', x: 54, y: 50, hour: 0.92 },
  { name: 'lava', x: 9, y: 10, hour: 0.45 },
  { name: 'thea', x: 43, y: 6, hour: 0.45 },
  { name: 'praia', x: 30, y: -12, hour: 0.45 },
  { name: 'praia-guarda-sol', x: 41, y: -14, hour: 0.45, sit: true },
  { name: 'fonte', x: 5, y: -1, hour: 0.45 },
  { name: 'fonte-dentro', x: 5, y: -1, hour: 0.45, sit: true },
  { name: 'fonte-noite', x: 5, y: -1, hour: 0.92 },
];
/** Só estes lugares (PERF_LUGARES=praia,fonte — o começo do nome basta). */
const ONLY = (process.env.PERF_LUGARES ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const WINDOW_MS = 3500;
const RAF_MS = 3000;

/** Os intervalos do rAF durante `ms`: quantos quadros, p50 e p90 (roda na página). */
const RAF = `async (ms) => {
  const out = [];
  let last = performance.now();
  const t0 = last;
  await new Promise((done) => {
    const tick = (now) => { out.push(now - last); last = now; if (now - t0 < ms) requestAnimationFrame(tick); else done(); };
    requestAnimationFrame(tick);
  });
  const sorted = [...out].sort((a, b) => a - b);
  const pct = (p) => +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))].toFixed(1);
  return { n: out.length, p50: pct(0.5), p90: pct(0.9), max: +sorted[sorted.length - 1].toFixed(1) };
}`;

export default {
  name: 'perf-lugares',
  description: 'Perfil do quadro em cada lugar do mapa (acampamento, Thea, praia, fonte): fps, cpu/gpu, draws, seções.',
  needsGame: false,
  async run({ driver, assert, log }) {
    const { page } = driver;
    const g = (fn, arg) => page.evaluate(fn, arg);
    await page.addInitScript(() => {
      if (sessionStorage.getItem('perf-lugares')) return;
      sessionStorage.setItem('perf-lugares', '1');
      localStorage.setItem('zh.cozy.v1', JSON.stringify({
        started: true, introSeen: true, day: 2, clock: 0.45, respawn: { worldX: 54, worldY: 50 }, mistCleared: true,
      }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await sleep(2500);
    const rows = [];
    for (const p of PLACES) {
      if (ONLY.length > 0 && !ONLY.some((o) => p.name.startsWith(o))) continue;
      await g(([x, y]) => window.gameDebug.hero.teleport(x, y, 0, -1), [p.x, p.y]);
      await g((h) => window.gameTime.set(h), p.hour);
      if (p.sit) {
        await page.keyboard.press('z');
        await sleep(3500);
        // sentado, o tempo corre: a hora volta para o meio-dia
        await g((h) => window.gameTime.set(h), p.hour);
      }
      await sleep(2200);
      const raf = await page.evaluate(`(${RAF})(${RAF_MS})`);
      const r = await g(async (ms) => {
        window.__prof.spikeMs = 24;
        window.__prof.start();
        await new Promise((res) => setTimeout(res, ms));
        window.__prof.stop();
        const rep = window.__prof.report();
        const gauges = Object.fromEntries(rep.gauges.map((x) => [x.gauge, x.avg]));
        return {
          fps: rep.fps, dt: rep.dt, cpu: rep.cpu, gpu: rep.gpu, bound: rep.bound,
          draws: gauges.drawCalls, tris: gauges.triangles, programs: rep.programs,
          sections: rep.sections.slice(0, 8).map((s) => [s.section, s.avgMs, s.p99Ms]),
          spikes: rep.spikes.length,
        };
      }, WINDOW_MS);
      if (p.sit) {
        await page.keyboard.press('ArrowDown');
        await sleep(1500);
      }
      rows.push({ place: p.name, raf, ...r });
      log(`  ── ${p.name} ──`);
      log(`  quadro (vsync): ${raf.n} quadros em ${RAF_MS / 1000}s · p50 ${raf.p50}ms · p90 ${raf.p90}ms · pior ${raf.max}ms`);
      log(`  profiler: cpu p50 ${r.cpu.p50}ms · gpu ${r.gpu ? `p50 ${r.gpu.p50}ms p99 ${r.gpu.p99}ms` : 'n/a'} · ${String(r.bound).toUpperCase()}`);
      log(`  draws ${r.draws} · tris ${r.tris} · spikes ${r.spikes}`);
      log(`  ${r.sections.map(([s, a, p99]) => `${s} ${a}/${p99}`).join(' · ')}`);
    }
    log(`PERF_JSON ${JSON.stringify(rows)}`);
    for (const r of rows) assert(`${r.place}: acima de 30 fps`, r.raf.p50 <= 34, `quadro p50 ${r.raf.p50}ms`);
  },
};

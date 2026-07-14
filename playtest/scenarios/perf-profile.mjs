// A profile of the game at rest and of the game being PLAYED — the two are not the same, and
// tuning against an idle frame is how you end up optimising something nobody waits on.
//
// It reports rather than asserts (bar a floor on fps): the point is the section table and the
// cpu/gpu split, which say which half of the frame is the bottleneck and where the time in it
// actually goes. Run it before and after any change — a number with nothing to compare it to
// proves nothing.
//
//   npx vite --port 5180 --strictPort
//   PLAYTEST_BASE_URL=http://localhost:5180 npm run playtest -- perf-profile

/** Record a window of `ms` while holding a direction, turning at walls. Returns the report. */
const PROFILE = `async (ms, walk) => {
  const s = window.__scene;
  const wait = (t) => new Promise((r) => setTimeout(r, t));
  const DIRS = [['ArrowRight', 39, 1, 0], ['ArrowDown', 40, 0, 1], ['ArrowLeft', 37, -1, 0], ['ArrowUp', 38, 0, -1]];
  const key = (type, name, code) => {
    const e = new KeyboardEvent(type, { key: name, code: name, bubbles: true });
    Object.defineProperty(e, 'keyCode', { get: () => code });
    window.dispatchEvent(e);
  };

  window.__prof.spikeMs = 24;
  window.__prof.start();

  let held = null;
  const stop = () => { if (held) { key('keyup', held[0], held[1]); held = null; } };
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    if (walk) {
      // Steer: keep walking, and turn whenever the tile ahead is solid. Real traversal, so the
      // chunk streamer, the enemy AI, the shadow casters and the fire pool all do real work.
      const blocked = held
        && s.isSolidForEntities(s.playerWorld.worldX + held[2], s.playerWorld.worldY + held[3], false);
      if (!held || blocked) {
        stop();
        const open = DIRS.filter((d) => !s.isSolidForEntities(
          s.playerWorld.worldX + d[2], s.playerWorld.worldY + d[3], false,
        ));
        if (open.length) {
          held = open[Math.floor(performance.now() / 137) % open.length];
          key('keydown', held[0], held[1]);
        }
      }
    }
    await wait(60);
  }
  stop();
  window.__prof.stop();

  const r = window.__prof.report();
  return {
    fps: r.fps,
    bound: r.bound,
    dt: r.dt,
    cpu: r.cpu,
    gpu: r.gpu,
    frames: r.frames,
    sections: r.sections,
    gauges: r.gauges,
    memory: r.memory,
    programs: r.programs,
    spikes: r.spikes.map((sp) => ({ frame: sp.frame, dt: sp.dt, cause: sp.cause, worst: sp.worst })),
    enemies: s.enemyManager?.aliveCount ?? 0,
  };
}`;

const show = (log, label, r) => {
  log(`  ── ${label} ────────────────────────────────────────────`);
  log(`  ${r.fps.toFixed(1)} fps · frame p50 ${r.dt.p50}ms / p99 ${r.dt.p99}ms / max ${r.dt.max}ms`);
  log(`  ${r.bound.toUpperCase()}-BOUND · cpu p50 ${r.cpu.p50}ms p99 ${r.cpu.p99}ms · `
    + `gpu ${r.gpu ? `p50 ${r.gpu.p50}ms p99 ${r.gpu.p99}ms` : 'n/a'}`);
  const g = Object.fromEntries(r.gauges.map((x) => [x.gauge, x]));
  const n = (k) => (g[k] ? `${g[k].avg}` : '—');
  log(`  draws ${n('drawCalls')} · tris ${n('triangles')} · geoms ${n('geometries')} · `
    + `textures ${n('textures')} · shadows ${n('castShadows')} · enemies ${r.enemies}`);
  log(`  heap ${r.memory.heapEndMb}MB (${r.memory.heapGrowthMb >= 0 ? '+' : ''}${r.memory.heapGrowthMb}MB over the run)`);
  log('  CPU by section (avg / p99 / share):');
  for (const s of r.sections.slice(0, 12)) {
    log(`    ${s.section.padEnd(16)} ${String(s.avgMs).padStart(7)}ms  p99 ${String(s.p99Ms).padStart(7)}ms  ${String(s.shareOfCpu).padStart(5)}%`);
  }
  if (r.spikes.length) {
    log(`  ${r.spikes.length} spike(s):`);
    for (const sp of r.spikes.slice(0, 8)) log(`    f${sp.frame} ${sp.dt}ms — ${sp.cause}`);
  }
};

export default {
  name: 'perf-profile',
  description: 'Profile the frame: cpu/gpu split, per-section cost, draw calls, spikes.',
  needsGame: true,
  async run({ driver, assert, log }) {
    const { page } = driver;
    const profile = (ms, walk) => page.evaluate(`(${PROFILE})(${ms}, ${walk})`);

    await driver.settle(1200); // let the world stream in and the fires settle

    const idle = await profile(3000, false);
    show(log, 'IDLE (standing still)', idle);

    const walking = await profile(6000, true);
    show(log, 'PLAYING (walking the world)', walking);

    assert(
      'No shader compiles mid-play',
      walking.programs.compiledDuringRun === 0,
      `${walking.programs.compiledDuringRun} compiled — a mid-run compile always hitches`,
    );
    // A floor, not a target: this is the bar that must not regress.
    assert(
      'Playing holds 60fps at the median',
      walking.dt.p50 <= 17.5,
      `frame p50 ${walking.dt.p50}ms (${walking.fps.toFixed(1)} fps avg)`,
    );
    assert(
      'No pathological frame while playing',
      walking.dt.p99 <= 24,
      `frame p99 ${walking.dt.p99}ms, max ${walking.dt.max}ms`,
    );
  },
};

// Dump the raw cache key of every program compiled mid-play, beside the closest one the prewarm
// already built. Reading the two side by side beats guessing at three's field order.
export default {
  name: '_light-probe',
  description: 'temp: raw cache keys of mid-play shader compiles',
  needsGame: true,
  async run({ driver, log }) {
    const { page } = driver;
    await driver.settle(1500);

    const out = await page.evaluate(async () => {
      const s = window.__scene;
      const w3 = s.world3d;
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      const keys = () => w3.renderer.info.programs.map((p) => p.cacheKey);

      const bootKeys = keys();
      const seen = new Set(bootKeys);
      const found = [];
      let lastLog = window.__shaderCompiles.length;

      const DIRS = [['ArrowRight', 39, 1, 0], ['ArrowDown', 40, 0, 1], ['ArrowLeft', 37, -1, 0], ['ArrowUp', 38, 0, -1]];
      const key = (type, d) => {
        const e = new KeyboardEvent(type, { key: d[0], code: d[0], bubbles: true });
        Object.defineProperty(e, 'keyCode', { get: () => d[1] });
        window.dispatchEvent(e);
      };
      let held = null;
      const t0 = performance.now();

      while (performance.now() - t0 < 11000) {
        await frame();
        for (const k of keys()) {
          if (seen.has(k)) continue;
          seen.add(k);
          const by = window.__shaderCompiles.slice(lastLog).map((c) => c.createdBy).pop() ?? '?';
          found.push({ at: Math.round(performance.now() - t0), k, by });
        }
        lastLog = window.__shaderCompiles.length;

        const blocked = held && s.isSolidForEntities(s.playerWorld.worldX + held[2], s.playerWorld.worldY + held[3], false);
        if (!held || blocked) {
          if (held) key('keyup', held);
          const open = DIRS.filter((d) => !s.isSolidForEntities(s.playerWorld.worldX + d[2], s.playerWorld.worldY + d[3], false));
          held = open.length ? open[Math.floor(performance.now() / 211) % open.length] : null;
          if (held) key('keydown', held);
        }
      }
      if (held) key('keyup', held);
      return { found, bootKeys };
    });

    for (const f of out.found) {
      const mine = f.k.split(',');
      let best = null;
      let score = -1;
      for (const bk of out.bootKeys) {
        const o = bk.split(',');
        if (o[0] !== mine[0]) continue;
        const sc = o.filter((v, i) => v === mine[i]).length;
        if (sc > score) { score = sc; best = o; }
      }
      log(`  +${f.at}ms  ${f.by.replace(/http:\/\/localhost:5180\/src\/game\//g, '').replace(/\?t=\d+/g, '')}`);
      log(`     NEW : ${f.k}`);
      if (best) {
        log(`     NEAR: ${best.join(',')}`);
        const n = Math.max(mine.length, best.length);
        const diffs = [];
        for (let i = 0; i < n; i += 1) if (mine[i] !== best[i]) diffs.push(`[${i}] "${best[i]}" -> "${mine[i]}"`);
        log(`     DIFF: ${diffs.join('   ')}`);
      }
    }
  },
};

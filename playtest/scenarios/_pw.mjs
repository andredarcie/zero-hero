export default {
  name: '_pw', description: 'temp', needsGame: true,
  async run({ driver, log }) {
    const { page } = driver;
    await driver.settle(2500);
    const out = await page.evaluate(() => {
      const w3 = window.__scene.world3d;
      const now = w3.renderer.info.programs.map((p) => p.cacheKey);
      const short = (k) => {
        const f = k.split(',');
        const custom = f[f.length - 1];
        return `${f[0].padEnd(10)} ${custom.startsWith('pixelArt') || custom.length < 30 ? custom : '(three built-in)'}`;
      };
      return { after: now.map(short), warm: window.__prewarmKeys?.map(short) ?? [] };
    });
    const warm = new Set(out.warm);
    log(`  ${out.warm.length} compiled by prewarm · ${out.after.length} live after 2.5s`);
    log('  MISSED by prewarm (compiled later, each one a potential freeze):');
    const counted = new Map();
    for (const k of out.after) if (!warm.has(k)) counted.set(k, (counted.get(k) ?? 0) + 1);
    for (const [k, n] of counted) log(`    ${n}x ${k}`);
  },
};

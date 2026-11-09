// Pixel-exact reference shots, for proving that a performance change changed NOTHING on screen.
//
// The world is full of noise on purpose — every flame's flicker is a random walk, the dust drifts,
// the shadows breathe — so two ordinary runs never produce the same frame and a diff of them says
// nothing. So pin all of it:
//
//   · Math.random is replaced (before any game code runs) with a seeded generator, so every flame
//     draws the same "random" numbers in the same order.
//   · The engine's own loop is stopped and the game is stepped by hand at a fixed delta, so `elapsed`
//     — which drives every sine in the fire dance — lands on the same value on both sides.
//
// Two runs then agree bit for bit, and any difference in the output is a real difference in the
// render. Usage:
//
//   git stash && npm run playtest -- visual-ref   # writes playtest/results/visual/<shot>.png
//   mv playtest/results/visual playtest/results/visual-main
//   git stash pop && npm run playtest -- visual-ref
//   node playtest/compare-visual.mjs playtest/results/visual-main playtest/results/visual
import fs from 'node:fs';
import path from 'node:path';

const SEED_SCRIPT = `
  let __s = 123456789;
  window.__reseed = () => { __s = 123456789; };
  Math.random = () => {
    // xorshift32 — the exact sequence matters far more than its quality here.
    __s ^= __s << 13; __s ^= __s >>> 17; __s ^= __s << 5; __s |= 0;
    return ((__s >>> 0) % 100000) / 100000;
  };
`;

/**
 * Put the world in a canonical pose and step it by hand, so the same code twice produces the same
 * pixels — the control that makes any diff downstream mean something. The pose itself (the clock,
 * every flame's random walk, the embers, the seeded fields, the valley's life, all rewound before
 * reseeding) lives in the game, typed against the real classes: `gameDebug.reference` (see
 * src/game/debug/probes/referenceProbe.ts).
 *
 * VISUAL_HD3D='{"castWaterClamp":0,…}' pins hd3d knobs for the shots — how a change that is part
 * refactor, part deliberate visual feature proves the refactor half alone is pixel-identical (knobs
 * off), and then shows the feature half isolated (knobs on). VISUAL_ISOLATE=shadows strips the frame
 * back to the ground and the cast shadows, with no post chain to smear a local difference.
 */
const SETTLE = `async (tileX, tileY, steps) => {
  const ref = window.gameDebug.reference;
  ref.pose(tileX, tileY, window.__hd3dOverrides);
  ref.pinAmbient();
  if (window.__isolateShadows) ref.isolate('shadows');
  await ref.step(steps);
  return ref.state();
}`;

export default {
  name: 'visual-ref',
  description: 'Deterministic reference shots — the proof that a perf change is invisible.',
  needsGame: true,
  async run({ driver, assert, log }) {
    const { page } = driver;
    // Must be installed BEFORE the page's own scripts, or the world is already seeded from the
    // real Math.random by the time we get here.
    await page.addInitScript(SEED_SCRIPT);
    if (process.env.VISUAL_ISOLATE === 'shadows') {
      await page.addInitScript('window.__isolateShadows = true;');
    }
    if (process.env.VISUAL_HD3D) {
      await page.addInitScript(`window.__hd3dOverrides = ${process.env.VISUAL_HD3D};`);
    }
    await driver.open('/?play');
    await driver.settle(1200);

    const outDir = path.join('playtest', 'results', 'visual');
    fs.mkdirSync(outDir, { recursive: true });

    // The home clearing: lit campfires, trees and rocks throwing firelight shadows, water and a
    // bridge spot. Everything this change touched is on screen at once.
    const home = await page.evaluate(() => { const at = window.gameDebug.hero.at(); return { worldX: at.x, worldY: at.y }; });
    const spots = [
      { name: 'home', x: home.worldX, y: home.worldY },
      { name: 'east', x: home.worldX + 3, y: home.worldY },
      { name: 'south', x: home.worldX, y: home.worldY + 3 },
      // Os lugares feitos depois (2026-11): cada um com as suas peças desenhadas em código e o que anima nelas.
      // O herói na margem NORTE do lago das carpas: o reflexo dele cai na água (WaterMirror).
      { name: 'koi-reflexo', x: 54, y: 55 },
      { name: 'cachoeira', x: 51, y: 57 },
      { name: 'bosque', x: 47, y: 56 },
      { name: 'lenhador', x: 53, y: 8 },
      { name: 'forja', x: 44, y: 9 },
      { name: 'cratera', x: 37, y: 11 },
    ];

    for (const spot of spots) {
      const state = await page.evaluate(`(${SETTLE})(${spot.x}, ${spot.y}, 90)`);
      await page.screenshot({ path: path.join(outDir, `${spot.name}.png`) });
      log(`  ${spot.name}: elapsed ${state.elapsed.toFixed(4)}s · ${state.draws} draws`);
      log(`    state: ${state.state}`);
      // Deterministic means deterministic: the same seed and the same steps must land on the same
      // clock, or the diff downstream is measuring drift rather than the change under test.
      assert(
        `${spot.name}: the stepped clock is deterministic`,
        Math.abs(state.elapsed - 1.5) < 0.001,
        `elapsed=${state.elapsed}s (90 steps x 16.6667ms should be 1.5s)`,
      );
    }
    log(`  shots written to ${outDir}`);
  },
};

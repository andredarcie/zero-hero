// Pixel-exact reference shots, for proving that a performance change changed NOTHING on screen.
//
// The world is full of noise on purpose — every flame's flicker is a random walk, the dust drifts,
// the shadows breathe — so two ordinary runs never produce the same frame and a diff of them says
// nothing. So pin all of it:
//
//   · Math.random is replaced (before any game code runs) with a seeded generator, so every flame
//     draws the same "random" numbers in the same order.
//   · Phaser's own loop is stopped and the game is stepped by hand at a fixed delta, so `elapsed`
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
 * pixels — the control that makes any diff downstream mean something.
 *
 * Seeding Math.random is not enough on its own: the game free-runs for a moment while it boots,
 * and every frame of that drains the generator and winds the flames' accumulators forward by an
 * amount nobody counted. So rewind ALL of it — the clock, each flame's random walk and flare
 * schedule, the embers' lives, the seeded fields — and only then reseed and start stepping.
 */
const SETTLE = `async (tileX, tileY, steps) => {
  const s = window.__scene;
  const g = window.__game;
  const w3 = s.world3d;
  g.loop.stop();

  s.enemyManager?.despawnAll();          // enemies wander; they are not what we are comparing
  s.playerWorld = { worldX: tileX, worldY: tileY };
  s.movementController.syncPlayerToWorld(tileX, tileY, s.tileSize);

  w3.elapsed = 0;
  w3.shakeMs = 0;
  // Pin each flame's SEED too, not just its accumulators.
  //
  // The seed is drawn from Math.random() when the fire is built — and so is every three.js object's
  // UUID. So a change that merely allocates a different NUMBER of objects at boot (say, one
  // instanced mesh where there used to be thirty-six) shifts the generator by a few draws, every
  // flame gets a different seed, and the fires flicker to a different rhythm. That reaches the
  // picture: a shadow's LENGTH is driven by its flame's instantaneous brightness. Two identical
  // renderers would then "fail" the diff for a reason that has nothing to do with rendering.
  w3.fires.forEach((f, i) => {
    f.seed = i * 1.7;
    f.noise = 0; f.flare = 0; f.flareTarget = 0; f.flareTimer = 0.9; f.flicker = 0; f.level = 1;
  });
  for (const p of w3.emberState) { p.life = 0; p.maxLife = 1.2; p.vx = 0; p.vy = 0; p.vz = 0; }
  w3.embers.pos.fill(0);
  w3.dustSeeded = false;        // re-scatter the motes from the reseeded generator
  w3.atmosphereSeeded = false;
  // The dust's phase and height are drawn at construction and never re-seeded, so they carry the
  // same boot-time generator drift the flames did. Pin them off the index instead.
  for (let i = 0; i < w3.dustSeed.length; i++) {
    w3.dustSeed[i] = (i * 0.37) % 6.2831853;
    w3.dust.pos[i * 3 + 1] = 0.2 + ((i * 0.137) % 1) * 2.4;
  }

  // The hero's idle breathing is a Phaser tween, and its PHASE is set by the wall-clock moment it
  // happened to start during boot — so the two runs caught him mid-breath a pixel apart. Drop it;
  // the stepped clock will start it again at the same step on both sides.
  s.stopBreathing();
  s.hero.scaleX = 1;
  s.hero.scaleY = 1;
  s.lastStepTime = 0;

  // SHADOWS-ONLY mode (VISUAL_ISOLATE=shadows): strip the frame back to the ground and the solid
  // cast shadows, with no post chain to smear a local difference across the whole image. This is
  // what tells you whether a change to the shadows changed the SHADOWS, rather than something the
  // bloom then spread over half the frame.
  if (window.__isolateShadows) {
    const field = w3.solidCastField ? w3.solidCastField.mesh : null;
    const moonField = w3.moonCastField ? w3.moonCastField.mesh : null;
    const pool = w3.solidCastPool ?? [];
    const keep = new Set([field, moonField, ...pool].filter(Boolean));
    w3.scene.traverse((o) => {
      if (!o.isMesh && !o.isPoints) return;
      if (keep.has(o)) return;
      const isGround = o.geometry?.type === 'BufferGeometry' && o.material?.type === 'MeshLambertMaterial';
      if (!isGround) o.layers.set(31);
    });
    w3.composer.passes = [w3.composer.passes[0]];
    w3.composer.passes[0].renderToScreen = true;
  }

  // The flame billboards flip through their frames on a Phaser timer whose phase was set during
  // boot — the same class of drift. Freeze them on frame 0; the fire's LIGHT (which is what a
  // renderer change could plausibly move) is pinned above and still very much live.
  for (const cf of (s.campfires ?? [])) {
    cf.animTimer?.remove(false);
    cf.animTimer = undefined;
  }

  // And the drifting motes come out of the reference altogether.
  //
  // Fireflies, dust, mist and embers each carry per-mote state that is drawn from Math.random() at
  // construction and never re-seeded — so they inherit the same boot-time generator drift, and no
  // amount of pinning short of rewriting the particle system gets two builds to agree on where a
  // single speck of dust is. They also cannot be moved by anything a RENDERER change does: they are
  // gameplay-side Points, driven by their own integrator. Leaving them in would bury a real
  // regression under a blizzard of specks; taking them out is the difference between a diff that
  // means something and a diff that reads 5% every time.
  w3.scene.traverse((o) => { if (o.isPoints) o.layers.set(31); });

  window.__reseed();            // last, so the sequence the steps consume is identical

  // A fixed 60Hz step, run long enough for the fire dance and the shadows to settle into a pose.
  let t = 0;
  for (let i = 0; i < steps; i++) {
    t += 16.6667;
    g.step(t, 16.6667);
    await new Promise((r) => requestAnimationFrame(r));
  }
  const hb = s.heroBillboard;
  return {
    elapsed: w3.elapsed,
    draws: w3.rendererInfo.render.calls,
    // Anything here that differs between two runs of the SAME code is a leak in the determinism,
    // and it would masquerade as a rendering regression in the diff.
    state: [
      hb.x.toFixed(6), hb.y.toFixed(6), hb.elevation.toFixed(6),
      s.hero.scaleX.toFixed(6), s.hero.scaleY.toFixed(6), String(s.hero.frame),
      s.camera.camX.toFixed(6), s.camera.camY.toFixed(6), s.tileSize.toFixed(6),
      w3.camera.position.x.toFixed(6), w3.camera.position.y.toFixed(6), w3.camera.position.z.toFixed(6),
      w3.stats().litFires, w3.stats().fireLightsUsed, w3.stats().castPool,
    ].join(' '),
  };
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
    await driver.open('/?play');
    await driver.settle(1200);

    const outDir = path.join('playtest', 'results', 'visual');
    fs.mkdirSync(outDir, { recursive: true });

    // The home clearing: lit campfires, trees and rocks throwing firelight shadows, water and a
    // bridge spot. Everything this change touched is on screen at once.
    const home = await page.evaluate(() => ({ ...window.__scene.playerWorld }));
    const spots = [
      { name: 'home', x: home.worldX, y: home.worldY },
      { name: 'east', x: home.worldX + 3, y: home.worldY },
      { name: 'south', x: home.worldX, y: home.worldY + 3 },
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

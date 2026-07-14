// How jagged are the tiles, really? Measured against a supersampled ground truth.
//
// "The diff moved 40% of the pixels" proves a change happened, not that it helped — and any
// home-made jaggedness score can be won by simply BLURRING the picture, which is a worse game than
// the one we set out to fix. So compare against the one image that cannot be argued with: the same
// frame rendered at 4x and box-filtered back down (SSAA). That is what the frame WOULD look like if
// we had paid for the samples, and it is the target both aliasing and blur miss — the staircase
// lands far from it, and so does mush. Distance to that image is therefore an honest score.
//
//   node playtest/run.mjs aa-truth              # writes playtest/results/aa/{native,truth}.png + a score
//
// The measurement runs entirely from the page — it resizes the renderer and re-renders the SAME
// frozen scene — so it needs nothing compiled in, and an older build measures on identical terms:
//
//   git checkout HEAD~1 -- src && npm run playtest -- aa-truth   # score the build before the change
//   git checkout HEAD -- src
import fs from 'node:fs';
import path from 'node:path';

const SEED_SCRIPT = `
  let __s = 123456789;
  window.__reseed = () => { __s = 123456789; };
  Math.random = () => {
    __s ^= __s << 13; __s ^= __s >>> 17; __s ^= __s << 5; __s |= 0;
    return ((__s >>> 0) % 100000) / 100000;
  };
`;

/** Supersampling factor for the ground truth. 4 = 16 samples per pixel. */
const SS = 4;

/**
 * Freeze the world on one frame, strip it to the TILES, then render that one frame twice — once at
 * the resolution the game ships, once at SS times it — and score the first against the second.
 *
 * Every part of this is about making the two renders differ in RESOLUTION AND NOTHING ELSE:
 *
 * · The post chain comes off. Bloom smears a local difference across half the image and the grain
 *   is per-pixel noise; both would drown the signal, and neither is what we changed.
 * · Only the merged tile meshes stay (BufferGeometry + a mapped Lambert material — the ground, the
 *   riverbed, the decor and the standing solids). Sprites are NEAREST in both builds and would only
 *   add the same error to both scores. This selector reads the same on either build: it leans on
 *   nothing the change introduced.
 * · The clock does NOT advance between the two renders. We call composer.render() again rather than
 *   stepping the game, so the fires, the shadows and the camera are bit-for-bit the same scene —
 *   only the framebuffer changes size. (Step it instead and the flames flicker on to a new level
 *   between the shots, and the ground is lit differently in the two images.)
 */
const MEASURE = `async (tileX, tileY, steps, ss) => {
  const s = window.__scene;
  const g = window.__game;
  const w3 = s.world3d;
  g.loop.stop();

  s.enemyManager?.despawnAll();
  s.playerWorld = { worldX: tileX, worldY: tileY };
  s.movementController.syncPlayerToWorld(tileX, tileY, s.tileSize);

  w3.elapsed = 0;
  w3.shakeMs = 0;
  w3.fires.forEach((f, i) => {
    f.seed = i * 1.7;
    f.noise = 0; f.flare = 0; f.flareTarget = 0; f.flareTimer = 0.9; f.flicker = 0; f.level = 1;
  });
  s.stopBreathing();
  s.hero.scaleX = 1; s.hero.scaleY = 1; s.lastStepTime = 0;
  for (const cf of (s.campfires ?? [])) { cf.animTimer?.remove(false); cf.animTimer = undefined; }

  // Tiles only, and no post chain. A tile mesh is a merged BufferGeometry with a mapped Lambert
  // material: billboards are PlaneGeometry, the bridge is BoxGeometry, the shadow field is an
  // InstancedMesh with a Basic material, and the river banks carry a colour and no map.
  const isTile = (o) => o.isMesh && !o.isInstancedMesh
    && o.geometry?.type === 'BufferGeometry'
    && o.material?.type === 'MeshLambertMaterial' && !!o.material.map;
  w3.scene.traverse((o) => {
    if ((o.isMesh || o.isPoints) && !isTile(o)) o.layers.set(31);
  });
  w3.composer.passes = [w3.composer.passes[0]];
  w3.composer.passes[0].renderToScreen = true;

  window.__reseed();

  let t = 0;
  for (let i = 0; i < steps; i++) {
    t += 16.6667;
    g.step(t, 16.6667);
    await new Promise((r) => requestAnimationFrame(r));
  }

  // ── the two renders ────────────────────────────────────────────────────────
  const gl = w3.renderer.getContext();
  const W = w3.renderer.domElement.width;
  const H = w3.renderer.domElement.height;

  // readPixels straight after the draw, in the same task: the default framebuffer still holds the
  // frame (it is only discarded once we hand control back to the compositor), so this needs no
  // preserveDrawingBuffer — which would have meant a source edit, and the old build hasn't got one.
  const shoot = (w, h) => {
    w3.renderer.setSize(w, h, false);
    w3.composer.render();
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return buf;
  };

  const native = shoot(W, H);
  const big = shoot(W * ss, H * ss);
  w3.renderer.setSize(W, H, false);

  // Box-filter the supersampled frame back down. The average is taken on the values as they leave
  // the framebuffer (already tone-mapped and sRGB-encoded), which is exactly where the hardware
  // resolves an MSAA buffer — so this is the picture real AA would have produced.
  const truth = new Uint8Array(W * H * 4);
  const n = ss * ss;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let r = 0, gg = 0, b = 0;
      for (let dy = 0; dy < ss; dy++) {
        const row = (y * ss + dy) * W * ss;
        for (let dx = 0; dx < ss; dx++) {
          const i = (row + x * ss + dx) * 4;
          r += big[i]; gg += big[i + 1]; b += big[i + 2];
        }
      }
      const o = (y * W + x) * 4;
      truth[o] = Math.round(r / n);
      truth[o + 1] = Math.round(gg / n);
      truth[o + 2] = Math.round(b / n);
      truth[o + 3] = 255;
    }
  }

  // ── the score ──────────────────────────────────────────────────────────────
  // How far the shipped frame sits from the frame we would have got for 16x the fragments.
  let sum = 0, sq = 0, worst = 0;
  for (let p = 0; p < W * H; p++) {
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(native[p * 4 + c] - truth[p * 4 + c]);
      sum += d; sq += d * d;
      if (d > worst) worst = d;
    }
  }
  const px = W * H * 3;

  // The same error, but only where there is an EDGE to get wrong.
  //
  // Most of this frame is flat ground, and a flat region is sampled correctly by any filter — so a
  // whole-frame average buries the effect under a large majority of pixels that were never in
  // question. Aliasing lives exactly where the truth has a gradient, so score there: the pixels
  // whose neighbourhood in the SUPERSAMPLED image actually moves. (Picking them off the truth and
  // not off either render keeps the set of judged pixels honest — neither build gets to choose the
  // pixels it is marked on.)
  let edgeSum = 0, edgeN = 0;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = (y * W + x) * 4;
      let grad = 0;
      for (let c = 0; c < 3; c++) {
        grad += Math.abs(truth[i + c] - truth[i + 4 + c])
              + Math.abs(truth[i + c] - truth[i + W * 4 + c]);
      }
      if (grad < 24) continue;            // flat: nothing to alias
      for (let c = 0; c < 3; c++) edgeSum += Math.abs(native[i + c] - truth[i + c]);
      edgeN += 3;
    }
  }

  // The blur control. Aliasing shows up as steps that are HARDER than the truth's (a texel edge
  // crossed in one jump); blur shows up as steps that are SOFTER. So a score that improved by
  // smearing the art would show its contrast collapsing below the truth's — and this is the number
  // that would catch it.
  const contrast = (img) => {
    let acc = 0;
    for (let y = 0; y < H - 1; y++) {
      for (let x = 0; x < W - 1; x++) {
        const i = (y * W + x) * 4;
        const rx = (y * W + x + 1) * 4;
        const ry = ((y + 1) * W + x) * 4;
        for (let c = 0; c < 3; c++) {
          acc += Math.abs(img[i + c] - img[rx + c]) + Math.abs(img[i + c] - img[ry + c]);
        }
      }
    }
    return acc / ((H - 1) * (W - 1) * 6);
  };

  const png = (img) => {
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    const id = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) {           // readPixels is bottom-up; PNG is top-down
      for (let x = 0; x < W; x++) {
        const src = ((H - 1 - y) * W + x) * 4;
        const dst = (y * W + x) * 4;
        id.data[dst] = img[src]; id.data[dst + 1] = img[src + 1];
        id.data[dst + 2] = img[src + 2]; id.data[dst + 3] = 255;
      }
    }
    ctx.putImageData(id, 0, 0);
    return cv.toDataURL('image/png');
  };

  return {
    w: W, h: H, ss,
    mae: sum / px,
    rmse: Math.sqrt(sq / px),
    worst,
    edgeMae: edgeN ? edgeSum / edgeN : 0,
    edgeShare: edgeN / px,
    contrastNative: contrast(native),
    contrastTruth: contrast(truth),
    nativePng: png(native),
    truthPng: png(truth),
  };
}`;

export default {
  name: 'aa-truth',
  description: "Score the tiles' jaggedness against a supersampled ground truth (SSAA).",
  needsGame: true,
  async run({ driver, assert, log }) {
    const { page } = driver;
    await page.addInitScript(SEED_SCRIPT);
    await driver.open('/?play');
    await driver.settle(1200);

    const outDir = path.join('playtest', 'results', 'aa');
    fs.mkdirSync(outDir, { recursive: true });

    const home = await page.evaluate(() => ({ ...window.__scene.playerWorld }));
    const r = await page.evaluate(
      `(${MEASURE})(${home.worldX}, ${home.worldY}, 90, ${SS})`,
    );

    const write = (name, dataUrl) => {
      fs.writeFileSync(
        path.join(outDir, name),
        Buffer.from(dataUrl.split(',')[1], 'base64'),
      );
    };
    write('native.png', r.nativePng);
    write('truth.png', r.truthPng);

    log(`  ${r.w}x${r.h}, ground truth at ${r.ss}x (${r.ss * r.ss} samples/px)`);
    log(`  distance from truth:  MAE ${r.mae.toFixed(2)}  RMSE ${r.rmse.toFixed(2)}  worst ${r.worst}`);
    log(`  …on EDGE pixels only: MAE ${r.edgeMae.toFixed(2)}  (${(r.edgeShare * 100).toFixed(1)}% of the frame)`);
    log(`  local contrast:       shipped ${r.contrastNative.toFixed(2)}  truth ${r.contrastTruth.toFixed(2)}`);
    log(`  shots written to ${outDir}`);

    // Not a threshold on quality — just the guarantee that the two renders showed the same world.
    // If the tiles vanished, or the isolate hid everything, the "truth" is a flat clear colour and
    // every number above is meaningless rather than good.
    assert(
      'The measured frame actually has tiles in it',
      r.contrastTruth > 1,
      `truth local contrast ${r.contrastTruth.toFixed(2)} — a flat frame means the isolate hid the world`,
    );
  },
};

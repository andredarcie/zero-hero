// The shadow pass's QUALITY CONTRACT, as executable asserts (plano.md P5/P6/P8).
//
// Everything here is state-based — no bump timing, no keypresses — so it cannot flake:
// it reads the shadow model (groundCastAt, the cast fields, the spatial plumbing)
// through the playtest probe (gameDebug.shadows) and asserts the invariants the overhaul introduced:
//
//   · handoff CONTINUITY: walking out of a fire pool, the silhouette's darkness and
//     heading must change smoothly into the moon's — never a jump (the alpha pulse and
//     the angle snap are the two bugs the handoff exists to prevent);
//   · the on-fire-tile rule: standing ON a lit flame there is no stable "away from the
//     fire", so the directional cast must fall back to the moon heading;
//   · heading HYSTERESIS: midway between two lit fires the nearest one flips with the
//     flames' breathing — a caster with memory must NOT flip until the challenger is
//     clearly (castHysteresis x) closer;
//   · the WATER CLAMP: a silhouette that would cross a sunken channel (river/lava/sea
//     bed) is clamped at the bank instead of floating in mid-air;
//   · ELEVATION: a lifted caster's silhouette slides away from the light — the arm's
//     projection generalized to every caster;
//   · the BUDGET: the solid field stays under its pool cap. (The "no batched actor fields"
//     assert went away with the Survivors mode: the per-sheet instanced fields existed only
//     for that horde, so the machinery — and its opt-in — left the renderer with it. Every
//     actor is one individually-sorted mesh again, which is what the adventure always used.)
export default {
  name: 'sombras',
  description: 'Shadow contract: handoff continuity, hysteresis, water clamp, elevation, budget.',
  needsGame: true,
  async run({ driver, assert, log }) {
    const { page } = driver;
    await driver.open('/?play');
    await driver.settle(1200);

    // The audit itself lives in the game, typed against the shadow classes (gameDebug.shadows.audit,
    // src/game/debug/probes/shadowProbe.ts); this scenario only states the thresholds.
    const r = await page.evaluate(() => window.gameDebug.shadows.audit());

    log(`  handoff: maxAlphaJump ${r.maxAlphaJump?.toFixed(4)} · maxAngleJump ${r.maxAngleJump?.toFixed(4)}rad · endAlpha ${r.endAlpha?.toFixed(3)}`);
    log(`  waterClamp len ${r.waterClampLen} · elevationShift ${r.elevationShift?.toFixed(3)} · castPool ${r.castPool} · actorFields ${r.actorFields}`);
    log(`  sombra mínima ${r.shortestCast?.toFixed(2)} tiles · árvores com menos sombra que o luar: ${r.starved}${r.worstStarved ? ` (pior ${JSON.stringify(r.worstStarved)})` : ''}`);
    log(`  pool ${r.castPool}/${r.poolCap} · tiles indexados ${r.tilesIndexed} (de ${r.solidTiles} sólidos; expostos ${r.castableExposed})`);

    assert('A lit home fire exists to measure against', r.hasFire === true, JSON.stringify(r));
    // 0.2-tile samples: a smooth handoff moves alpha a few hundredths per step; the alpha
    // PULSE this guards against was ~0.1+ in one step, and an angle SNAP is ~a radian.
    assert('Handoff: darkness never jumps between neighbouring samples', r.maxAlphaJump < 0.08, `maxAlphaJump=${r.maxAlphaJump}`);
    assert('Handoff: heading never snaps between neighbouring samples', r.maxAngleJump < 0.45, `maxAngleJump=${r.maxAngleJump}`);
    assert('Past the pool the cast settles on the moon\'s darkness', Math.abs(r.endAlpha - r.moonAlpha) < 1e-6, `endAlpha=${r.endAlpha} moon=${r.moonAlpha}`);
    assert('ON a lit flame the cast falls back to the moon heading', r.onFireIsMoon === true, JSON.stringify(r));
    assert('Hysteresis: the incumbent flame keeps a remembered caster past the midline', r.hysteresis === true, JSON.stringify(r));
    assert('The world has sunken tiles for the clamp to find', r.sunkenCount > 0, `sunken=${r.sunkenCount}`);
    assert('A cast aimed at the channel is clamped at the bank', r.waterClamp === true, `len=${r.waterClampLen}`);
    assert('Elevation slides the silhouette off the caster\'s feet', r.elevationShift > 0.2, `shift=${r.elevationShift}`);
    assert(
      'NO tree ends up with less shadow than moonlight alone would give it',
      r.starved === 0,
      `${r.starved} tiles starved — worst ${JSON.stringify(r.worstStarved)}`,
    );
    assert(
      'No stub-length casts (a smudge under the trunk reads as a MISSING shadow)',
      r.shortestCast === null || r.shortestCast >= 0.9,
      `shortest=${r.shortestCast}`,
    );
    assert(
      'The solid cast pool is not saturated (at the cap, visible trees lose their shadow)',
      r.castPool < r.poolCap,
      `pool=${r.castPool}/${r.poolCap}`,
    );
    assert(
      'The fire cast indexes EVERY standing tile, not just the exposed ones',
      r.tilesIndexed === r.solidTiles && r.solidTiles > r.castableExposed,
      `indexed=${r.tilesIndexed} solids=${r.solidTiles} exposed=${r.castableExposed}`,
    );
  },
};

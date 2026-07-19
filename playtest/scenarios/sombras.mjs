// The shadow pass's QUALITY CONTRACT, as executable asserts (plano.md P5/P6/P8).
//
// Everything here is state-based — no bump timing, no keypresses — so it cannot flake:
// it reads the shadow model (groundCastAt, the cast fields, the spatial plumbing)
// directly through the dev handles and asserts the invariants the overhaul introduced:
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
//   · the BUDGET: the solid field stays under its pool cap, and the adventure runs with
//     NO batched actor fields (batching is a Survivors opt-in; the adventure must keep
//     its exact draw order).
export default {
  name: 'sombras',
  description: 'Shadow contract: handoff continuity, hysteresis, water clamp, elevation, budget.',
  needsGame: true,
  async run({ driver, assert, log }) {
    const { page } = driver;
    await driver.open('/?play');
    await driver.settle(1200);

    const r = await page.evaluate(async () => {
      const s = window.__scene;
      const w3 = s.world3d;
      const frame = () => new Promise((res) => requestAnimationFrame(res));
      const out = {};

      // A lit fire to measure against (the home campfire is born lit).
      const fire = w3.fires.find((f) => f.lit && f.scale > 0.5);
      out.hasFire = Boolean(fire);
      if (!fire) return out;

      // ── 1) handoff continuity: sample the projector along a ray out of the pool ──
      const radius = w3.params.castShadowRadius;
      let prevA = null;
      let prevDir = null;
      let maxAlphaJump = 0;
      let maxAngleJump = 0;
      let lastAlpha = 0;
      for (let d = 0.9; d <= radius + 2.5; d += 0.2) {
        const c = w3.groundCastAt(fire.worldX + d, fire.worldY);
        if (!c) { lastAlpha = 0; continue; }
        if (prevA !== null) {
          maxAlphaJump = Math.max(maxAlphaJump, Math.abs(c.alpha - prevA));
          const dot = c.dirX * prevDir.x + c.dirZ * prevDir.z;
          maxAngleJump = Math.max(maxAngleJump, Math.acos(Math.max(-1, Math.min(1, dot))));
        }
        prevA = c.alpha;
        prevDir = { x: c.dirX, z: c.dirZ };
        lastAlpha = c.alpha;
      }
      out.maxAlphaJump = maxAlphaJump;
      out.maxAngleJump = maxAngleJump;
      out.moonAlpha = w3.params.moonShadowAlpha;
      out.endAlpha = lastAlpha; // past the pool: must have settled on the moon's darkness

      // ── 2) ON a lit flame there is no stable heading — the cast falls to the moon ──
      const onFire = w3.groundCastAt(fire.worldX, fire.worldY);
      const moonDir = { x: -Math.sin(w3.moonCastRotY), z: -Math.cos(w3.moonCastRotY) };
      out.onFireIsMoon = Boolean(onFire)
        && Math.abs(onFire.dirX - moonDir.x) < 1e-6
        && Math.abs(onFire.dirZ - moonDir.z) < 1e-6
        && Math.abs(onFire.alpha - w3.params.moonShadowAlpha) < 1e-6;

      // ── 3) hysteresis: a second fire, and a caster with memory on the midline ──
      const second = w3.fires.find((f) => f !== fire);
      out.hasSecond = Boolean(second);
      if (second) {
        const wasLit = second.lit;
        const wasAt = { x: second.worldX, y: second.worldY };
        // Park the second flame 6 tiles east of the first: the midline must sit inside
        // BOTH pools (castShadowRadius 7.5) or every probe below just reads the moon.
        // Only the shadow MODEL reads worldX/worldY — restored right after.
        second.worldX = fire.worldX + 6;
        second.worldY = fire.worldY;
        second.lit = true;
        await frame(); // render() refills litFires from the lit set
        const mx = (fire.worldX + second.worldX) / 2;
        const my = (fire.worldY + second.worldY) / 2;
        // Step toward the second fire by 2% past the midpoint: without memory the
        // "nearest" contest flips there; with the incumbent's hysteresis it must not.
        const dx = (second.worldX - fire.worldX) * 0.02;
        const dy = (second.worldY - fire.worldY) * 0.02;
        const mem = { lastFire: null };
        const before = w3.groundCastAt(mx - dx, my - dy, mem); // firmly fire-side
        const across = w3.groundCastAt(mx + dx, my + dy, mem); // hair past the midpoint
        const fresh = w3.groundCastAt(mx + dx, my + dy);       // no memory: flips
        out.hysteresis = Boolean(before && across && fresh)
          && Math.abs(across.dirX - before.dirX) < 0.15   // memory held the incumbent
          && Math.abs(across.dirX - fresh.dirX) > 0.001;  // a memory-less probe flipped
        second.lit = wasLit;
        second.worldX = wasAt.x;
        second.worldY = wasAt.y;
        await frame();
      }

      // ── 4) water clamp: a cast aimed square at a sunken channel stops at the bank ──
      out.sunkenCount = w3.sunkenTiles.size;
      if (w3.sunkenTiles.size > 0) {
        const key = w3.sunkenTiles.values().next().value;
        const sx = Math.floor(key / 16384) - 4096;
        const sz = (key % 16384) - 4096;
        // Stand one tile north of the sunken tile, cast pointing south (rotY = PI:
        // heading -Z rotated half a turn = +z). 3 tiles long would cross the channel.
        const clamped = w3.clampCastAtSunken(sx, sz - 1, Math.PI, 3);
        out.waterClamp = clamped < 2;
        out.waterClampLen = clamped;
      }

      // ── 5) elevation: lift a caster and its silhouette slides off its feet ──
      // NOT the hero: his elevation is re-synced from bobLift every frame (updateHeroSync
      // would overwrite the probe before the render saw it). Any other caster keeps what
      // it is given.
      const caster = w3.castCasters.find((c) => c.bb !== s.heroBillboard && c.bb.visible && c.mesh.visible);
      out.hasElevCaster = Boolean(caster);
      if (caster) {
        await frame();
        const flat = { x: caster.mesh.position.x, z: caster.mesh.position.z };
        const wasElev = caster.bb.elevation;
        caster.bb.setElevation(wasElev + 0.6);
        await frame();
        const lifted = { x: caster.mesh.position.x, z: caster.mesh.position.z };
        caster.bb.setElevation(wasElev);
        await frame();
        out.elevationShift = Math.hypot(lifted.x - flat.x, lifted.z - flat.z);
      }

      // ── 6) NO TREE LOSES ITS SHADOW ─────────────────────────────────────────
      // The invariant the statics' handoff exists under: a tile's fire cast DISPLACES its
      // moon cast, never merely scales it down. The first version dimmed the moon by the
      // ratio (fireAlpha / moonAlpha), so a faint fire cast deleted a third of the moon
      // shadow and paid back a third as much darkness pointing elsewhere — trees at a
      // pool's edge, and any tree whose cast the water clamp had shortened, read as having
      // NO shadow (user report). So: total presence >= moonAlpha, for every tile, and no
      // stub-length casts.
      await frame();
      const moonAttr = w3.moonCastField.mesh.geometry.getAttribute('aCastAlpha');
      const fireAttr = w3.solidCastField.mesh.geometry.getAttribute('aCastAlpha');
      const im = w3.solidCastField.mesh.instanceMatrix.array;
      const fireByTile = new Map();
      let shortest = Infinity;
      for (let i = 0; i < w3.solidCastField.mesh.count; i++) {
        const o = i * 16;
        const len = Math.hypot(im[o + 8], im[o + 9], im[o + 10]);
        if (len < shortest) shortest = len;
        fireByTile.set(`${Math.round(im[o + 12])},${Math.round(im[o + 14])}`, fireAttr.getX(i));
      }
      out.shortestCast = shortest === Infinity ? null : shortest;
      let starved = 0;
      let worst = null;
      for (const t of w3.castableSolids) {
        if (t.moonSlot === undefined) continue;
        const moon = moonAttr.getX(t.moonSlot);
        const fire = fireByTile.get(`${t.x},${t.z}`) ?? 0;
        // The two shadows point different ways, so presence is the SUM of what is there.
        const presence = moon + fire;
        if (presence < w3.params.moonShadowAlpha - 0.01) {
          starved++;
          if (!worst || presence < worst.presence) {
            worst = { x: t.x, z: t.z, moon: +moon.toFixed(3), fire: +fire.toFixed(3), presence: +presence.toFixed(3) };
          }
        }
      }
      out.starved = starved;
      out.worstStarved = worst;

      // ── 7) the budget: pool not SATURATED, and NO batched fields in the adventure ──
      // Saturation is the failure that matters: at the cap the pass stops emitting, and
      // whatever it had not reached yet — often the trees at the hero's feet, since
      // candidates arrive in fire order — silently loses its shadow.
      out.castPool = w3.solidCastField.mesh.count;
      out.poolCap = w3.solidCastField.mesh.instanceMatrix.count;
      out.actorFields = w3.actorCastFields.size;

      // ── 8) EVERY standing tile can cast, not just the exposed ones ──────────
      // The exposed-only rule (<= 4 solid neighbours) belongs to the contact blobs and the
      // baked moon field; it must NOT gate the fire cast, or a mobile torch walks up to the
      // forest wall, lights it brightly, and none of those trees have a shadow (reported).
      let indexed = 0;
      for (const bucket of w3.solidBuckets.values()) indexed += bucket.length;
      out.tilesIndexed = indexed;
      out.solidTiles = w3.solidTiles.length;
      out.castableExposed = w3.castableSolids.length;

      return out;
    });

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
    assert('The adventure runs with ZERO batched actor fields (Survivors opt-in only)', r.actorFields === 0, `fields=${r.actorFields}`);
  },
};

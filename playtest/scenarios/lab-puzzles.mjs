// Puzzle lab (/lab): SOLVE both authored puzzles end-to-end with real inputs.
//
// The lab world is deliberately tiny (2x1 chunks): walking is not a puzzle, so every
// waypoint below is a handful of tiles.
//
// Puzzle 1 "O Lenhador": the west river has no bridge and no bridgeSpot — the only way
// across is the TIMBER mechanic (fell a dry tree TOWARD the water). Tree A teaches it
// (aligned with the river on the approach); tree B tests it (the key sits on an island
// whose water ring leaves exactly ONE valid felling direction). The key then opens the
// hub's treasure room.
//
// Puzzle 2 "Fogo Emprestado": a dead campfire ringed by lava, the only gap plugged by a
// dry bush. Fire carried from the hub dies en route (TORCH_BURN_MS) — the insight is to
// use the moat's own lava as the lighter: ignite the stick there, burn the bush, walk
// the gap, deliver the flame.
//
// Movement is one verified tile at a time (press → poll position) because long blind
// walks drift.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'lab-puzzles',
  description: 'Solve both Laboratorio de Puzzles rooms end-to-end (timber bridge + lava-lit torch).',
  needsGame: true,
  route: '/lab?play',
  async run({ driver, shot, assert, log }) {
    const state = () => driver.getState();
    const pos = async () => (await state()).player;

    // First-time pickups play the ItemGet ceremony (auto-closes in ~3.2s, any key skips).
    const dismissItemGet = async () => {
      for (let i = 0; i < 12; i += 1) {
        const s = await state();
        if (!s?.itemGetOpen) return;
        await driver.press('Space', { count: 1, delay: 400 });
      }
    };

    // One verified step: press, then poll until the hero lands on the expected tile.
    const step = async (dir, expected) => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await driver.press({ up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }[dir], { count: 1 });
        for (let i = 0; i < 6; i += 1) {
          const p = await pos();
          if (p.worldX === expected.x && p.worldY === expected.y) return true;
          await sleep(120);
        }
        await dismissItemGet();
      }
      const p = await pos();
      throw new Error(`step ${dir} -> (${expected.x},${expected.y}) failed; hero at (${p.worldX},${p.worldY})`);
    };

    // Walk axis-by-axis (x, then y) through explicit waypoints — each leg is a straight,
    // clear line in the authored layout.
    const goTo = async (x, y) => {
      let p = await pos();
      while (p.worldX !== x) {
        await step(p.worldX < x ? 'right' : 'left', { x: p.worldX + Math.sign(x - p.worldX), y: p.worldY });
        p = await pos();
      }
      while (p.worldY !== y) {
        await step(p.worldY < y ? 'down' : 'up', { x: p.worldX, y: p.worldY + Math.sign(y - p.worldY) });
        p = await pos();
      }
    };

    // Bump into a blocked neighbour (chop / ignite / unlock / light) without moving.
    const bump = async (dir, times = 1, delay = 420) => {
      const key = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }[dir];
      await driver.press(key, { count: times, delay });
    };

    await driver.settle(1200);

    const boot = await state();
    assert('Lab world booted at its own spawn', boot.player.worldX === 13 && boot.player.worldY === 6,
      `spawn (${boot.player.worldX},${boot.player.worldY})`);
    assert('Home fire is the only lit fire at boot', boot.litFires === 1, `litFires=${boot.litFires}`);
    await shot('lab-hub-spawn', { note: 'Hub: home fire, cat guide, both puzzles in sight' });

    // ── Puzzle 1, stage A: teach TIMBER ─────────────────────────────────────
    log('P1-A: fetch the axe, fell tree A westward across the river');
    await goTo(8, 8); // walks onto the axe pickup
    await dismissItemGet();
    assert('Axe picked up', (await state()).heldItem === 'axe', `held=${(await state()).heldItem}`);

    await goTo(7, 8);
    await shot('p1-before-timber', { note: 'Tree A on the bank, river beyond, dead end without a bridge' });
    await bump('left', 5); // five chops; the felling chop topples the trunk west onto the water
    await sleep(2400); // timber spectacle + bridge tiles snapping in

    await goTo(3, 8); // only possible over the new log bridge
    assert('Crossed the river on the felled trunk', (await pos()).worldX === 3, `x=${(await pos()).worldX}`);
    await shot('p1-timber-crossed', { note: 'Tree A became the bridge (TIMBER)' });

    // ── Puzzle 1, stage B: test TIMBER (aim the fall) ───────────────────────
    log('P1-B: fell tree B northward — the only direction that bridges the island ring');
    await goTo(1, 6);
    await bump('up', 5);
    await sleep(2400);
    await goTo(1, 3); // stump -> log -> island; walks onto the key
    await dismissItemGet();
    assert('Island key picked up (axe swapped onto the island)', (await state()).heldItem === 'key',
      `held=${(await state()).heldItem}`);
    await shot('p1-island-key', { note: 'Key island reached by aiming the second fall' });

    // ── Back to the hub: the key opens the treasure room ────────────────────
    log('P1: return and open the treasure room');
    await goTo(1, 6);
    await goTo(3, 8);
    await goTo(7, 8); // back across the log bridge
    await goTo(16, 8);
    await goTo(16, 3);
    await bump('up', 1); // key swing unlocks the door (key is not consumed)
    await sleep(700);
    await goTo(16, 1); // through the doorway onto the sword
    await dismissItemGet();
    assert('Treasure room opened, sword claimed', (await state()).heldItem === 'sword',
      `held=${(await state()).heldItem}`);
    await shot('p1-treasure-room', { note: 'Key -> door -> sword: the lab loop closes' });

    // ── Puzzle 2: borrowed fire ─────────────────────────────────────────────
    log('P2: swap sword for the stick, light it at the moat, burn the gap bush, deliver');
    await goTo(16, 3);
    await goTo(18, 3);
    await goTo(18, 8); // walks onto the wood stick
    await dismissItemGet();
    assert('Graveto in hand', (await state()).heldItem === 'wood', `held=${(await state()).heldItem}`);
    await shot('p2-moat-approach', { note: 'Dead fire inside the lava moat; the bush is the only gap' });

    await goTo(20, 8); // lava tile (20,7) is straight up from here
    let lit = false;
    for (let attempt = 0; attempt < 4 && !lit; attempt += 1) {
      if (!(await state()).heldOnFire) {
        await bump('up', 1); // bump the moat lava: the stick catches fire
        await sleep(600);
        if (!(await state()).heldOnFire) continue;
        if (attempt === 0) await shot('p2-torch-lit', { note: 'The moat lava doubles as the lighter' });
      }
      await goTo(21, 8);
      await bump('up', 1); // vs the bush: ignite it; vs the opened gap: walk straight in
      await sleep(400);
      if ((await pos()).worldY === 8) {
        await sleep(2300); // bush chars to ash (2.2s) — the gap opens
        try {
          await step('up', { x: 21, y: 7 });
        } catch { /* bush not ash yet or the torch died — fall through and retry */ }
      }
      if ((await pos()).worldY === 7) {
        await bump('up', 1); // deliver the flame into the dead campfire
        // The FIRST player-lit fire plays a one-time cutscene (input frozen, the ignition
        // lands mid-scene) — poll patiently instead of declaring failure and retrying
        // into frozen controls.
        for (let i = 0; i < 20 && !lit; i += 1) {
          await sleep(500);
          lit = (await state()).litFires >= 2;
        }
      }
      if (!lit) {
        // Back out of the gap the way a live player would: south first, THEN west —
        // walking x-first from (21,7) would try to cut across the moat lava.
        await goTo(21, 8);
        await goTo(20, 8);
      }
    }

    assert('Moat campfire brought to life', lit, `litFires=${(await state()).litFires}`);
    await sleep(2500); // let the cutscene tail and the new firelight settle
    await shot('p2-fire-delivered', { note: 'Fire delivered through the gap — puzzle 2 solved' });

    const end = await state();
    assert('Run ended alive (puzzles, not combat)', end.isDead === false, `health=${end.health}`);
  },
};

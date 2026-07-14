// Puzzle lab (/lab): SOLVE both authored puzzles end-to-end with real inputs.
//
// The lab is ONE 12x12 chunk — the whole thing fits on a single screen, and no leg of the
// solution is more than a few tiles. Walking is not a puzzle.
//
// The two puzzles chain — puzzle 1's prize is puzzle 2's tool — and each is built on a rule
// the player already carries but has never been forced to *think* with:
//
// P1 "O Lenhador": the river has no bridgeSpot, so the only crossing is TIMBER (a tree felled
// TOWARD water becomes the bridge). Tree A teaches it; tree B corrects the model — the key
// island has exactly one water face, so exactly one felling direction works, and the player
// must realise it is their own POSITION that aims the trunk. The key opens the door: LAVA BOOTS.
//
// P2 "A Travessia Impossivel": a dead campfire on an island ringed by unbroken lava. Crossing
// lava requires HOLDING the boots; lighting a dead fire requires HOLDING a lit stick; the hero
// holds ONE item. The way out is the swap: a graveto lies on the island, so stepping on it
// drops the boots right there, and the lava that trapped you lights the stick.
//
// The scenario asserts both that the intended chain works AND that the easy road is shut
// (bare-handed, the lava must refuse the hero) — a puzzle is only a puzzle if it is closed.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'lab-puzzles',
  description: 'Solve both Laboratorio de Puzzles rooms (timber bridge -> boots; the impossible lava crossing).',
  needsGame: true,
  route: '/lab?play',
  async run({ driver, shot, assert, log }) {
    const state = () => driver.getState();
    const pos = async () => (await state()).player;

    const dismissItemGet = async () => {
      for (let i = 0; i < 12; i += 1) {
        if (!(await state())?.itemGetOpen) return;
        await driver.press('Space', { count: 1, delay: 400 });
      }
    };

    const step = async (dir, expected) => {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await driver.press({ up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }[dir], { count: 1 });
        for (let i = 0; i < 6; i += 1) {
          const p = await pos();
          if (p.worldX === expected.x && p.worldY === expected.y) return;
          await sleep(120);
        }
        await dismissItemGet();
      }
      const p = await pos();
      throw new Error(`step ${dir} -> (${expected.x},${expected.y}) failed; hero at (${p.worldX},${p.worldY})`);
    };

    // Walk x-then-y through explicit waypoints — every leg below is a straight, clear line.
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

    // Bump a blocked neighbour (chop / unlock / ignite / light) without moving off the tile.
    const bump = async (dir, times = 1, delay = 420) => {
      await driver.press({ up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }[dir], { count: times, delay });
    };

    await driver.settle(1200);

    const boot = await state();
    assert('Lab booted at its own spawn', boot.player.worldX === 6 && boot.player.worldY === 6,
      `spawn (${boot.player.worldX},${boot.player.worldY})`);
    assert('Only the home fire is lit at boot', boot.litFires === 1, `litFires=${boot.litFires}`);
    await shot('lab-hub', { note: 'The entire lab on one screen: both puzzles, the door and the prize' });

    // ── The lock, before the key: prove P2 really is shut ────────────────────
    // Bare-handed, the lava ring must refuse the hero — otherwise the boots (and the whole
    // swap insight) would be optional and P2 would collapse into "walk in, use item".
    log('P2 (lock): with no boots, the lava ring must be impassable');
    await goTo(7, 8);
    await bump('right', 2); // walk straight at the ring lava at (8,8)
    await sleep(400);
    const barred = await pos();
    assert('Lava bars the island without the boots',
      barred.worldX === 7 && barred.worldY === 8,
      `hero reached (${barred.worldX},${barred.worldY}) — the ring has a hole`);

    // ── P1-A: TIMBER teaches ────────────────────────────────────────────────
    log('P1-A: axe, then fell tree A westward across the river');
    await goTo(5, 7); // the axe sits right where the hero must stand to chop tree A
    await dismissItemGet();
    assert('Axe picked up', (await state()).heldItem === 'axe', `held=${(await state()).heldItem}`);
    await shot('p1-before-timber', { note: 'Tree A on the bank; no bridgeSpot anywhere — the river is a wall' });

    await bump('left', 5); // the felling chop topples the trunk west, onto the water
    await sleep(2400);

    await goTo(1, 7);
    assert('Crossed on the felled trunk', (await pos()).worldX === 1, `x=${(await pos()).worldX}`);
    await shot('p1-timber-crossed', { note: 'The trunk IS the bridge' });

    // ── P1-B: TIMBER tested (the fall must be aimed) ─────────────────────────
    log('P1-B: fell tree B north — the only direction that reaches the key island');
    await goTo(0, 6);
    await bump('up', 5);
    await sleep(2400);
    await goTo(0, 3); // over the new log, onto the key
    await dismissItemGet();
    assert('Island key taken', (await state()).heldItem === 'key', `held=${(await state()).heldItem}`);
    await shot('p1-island-key', { note: 'Reached by aiming the second fall — position is the puzzle' });

    // ── P1 payoff: the door hides puzzle 2's tool ───────────────────────────
    log('P1: unlock the door — the prize is the LAVA BOOTS');
    await goTo(0, 7);
    await goTo(4, 7); // back over the log bridge
    await goTo(6, 8);
    await bump('down', 1); // the key opens the door (and is not consumed)
    await sleep(700);
    await goTo(6, 10); // through the doorway, onto the boots
    await dismissItemGet();
    assert('Lava boots claimed', (await state()).heldItem === 'lavaBoots', `held=${(await state()).heldItem}`);
    await shot('p1-boots', { note: "Puzzle 1's prize is puzzle 2's tool" });

    // ── P2: the impossible crossing ─────────────────────────────────────────
    // Boots to cross, a lit stick to light the fire, ONE hand. The swap is the way out.
    log('P2: cross the lava — the boots drop when the island graveto is picked up');
    await goTo(6, 8);
    await goTo(7, 8);
    await shot('p2-impossible', { note: 'Dead fire + a stick, ringed by unbroken lava. Boots in hand: no free hand for fire.' });

    await goTo(9, 8); // over the lava (only the boots allow this) and onto the graveto
    await dismissItemGet();
    const swapped = await state();
    assert('On the island the boots swapped for the graveto',
      swapped.heldItem === 'wood' && swapped.player.worldX === 9 && swapped.player.worldY === 8,
      `held=${swapped.heldItem} pos=(${swapped.player.worldX},${swapped.player.worldY})`);
    assert('The boots are lying on the island, waiting',
      swapped.groundItems.some((it) => it.kind === 'lavaBoots' && it.worldX === 9 && it.worldY === 8),
      JSON.stringify(swapped.groundItems));
    await shot('p2-swap', { note: 'Stepping on the stick DROPPED the boots — the hand is free again' });

    // The lava that trapped the hero is the lighter.
    await bump('left', 1); // the ring lava at (8,8)
    await sleep(700);
    assert('The ring lava lit the stick', (await state()).heldOnFire === true,
      `heldOnFire=${(await state()).heldOnFire}`);
    await shot('p2-lava-lights', { note: 'The obstacle IS the tool' });

    await goTo(9, 7);
    await bump('right', 1); // deliver the flame into the dead campfire at (10,7)
    let lit = false;
    for (let i = 0; i < 20 && !lit; i += 1) { // the first player-lit fire plays a cutscene
      await sleep(500);
      lit = (await state()).litFires >= 2;
    }
    assert('The island campfire is alive', lit, `litFires=${(await state()).litFires}`);
    await sleep(2500);
    await shot('p2-fire-lit', { note: 'Impossible crossing solved: boots in, swap, borrow the lava' });

    // And the exit exists: step off, step back on, swap back to the boots, walk out.
    log('P2: swap back to the boots and walk out — nothing is consumed, so nothing soft-locks');
    await goTo(9, 8); // back onto the boots (armed now that the hero stepped off)
    await dismissItemGet();
    assert('Boots back in hand', (await state()).heldItem === 'lavaBoots', `held=${(await state()).heldItem}`);
    await goTo(7, 8); // back out across the lava
    assert('Walked back out over the lava', (await pos()).worldX === 7, `x=${(await pos()).worldX}`);

    const end = await state();
    assert('Finished alive (a puzzle run, not a fight)', end.isDead === false, `health=${end.health}`);
    await shot('p2-exit', { note: 'The island can be left — no soft-lock' });
  },
};

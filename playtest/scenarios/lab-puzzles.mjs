// Puzzle lab (/lab): solve both authored puzzles with real inputs, on one 12x12 screen.
//
// "O PAVIO" is the reason the fire-spread core exists. Every other obstacle in this game is a
// lock with exactly one key (axe->tree, pickaxe->rock, key->door), and the hint balloon even
// shows you which key is missing — so no puzzle can ask you to think, only to fetch. The
// sealed campfire at (11,2) HAS NO KEY: water on two sides, the world edge east, and its only
// walkable neighbour is TALL GRASS, which blocks the hero. No item in the lab opens it.
//
// So the question stops being "which item?" and becomes "how does the FIRE get there?". The
// grass corridor carries fire to the campfire, but the river at (7,2) breaks it — and fire
// does not cross water. Felling the tree at (7,3) NORTHWARD drops the trunk across it (TIMBER),
// and a bridge is wood: it burns, and passes the flame on. You build a bridge not to walk on,
// but for the fire to walk on.
//
// The scenario asserts the two facts that make it a puzzle instead of a fetch quest:
//   1. the campfire is unreachable — the hero can never stand beside it;
//   2. it is lit WITHOUT the hero ever being adjacent to it.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'lab-puzzles',
  description: 'Solve the lab: light a sealed campfire with a fire-fuse, then the impossible lava island.',
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

    const bump = async (dir, times = 1, delay = 420) => {
      await driver.press({ up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }[dir], { count: times, delay });
    };

    // Can the hero stand on ANY tile touching the sealed campfire? Asked of the real
    // collision system, not of the layout on paper.
    // `lavaPassable` is the 3rd arg — pass FALSE (bare-handed). Passing anything truthy would
    // ask "is it solid for someone wearing the boots?", which is a different question.
    const campfireIsSealed = () => driver.page.evaluate(() => {
      const s = window.__scene;
      const around = [[10, 2], [11, 1], [11, 3]]; // its 3 in-world neighbours (east is the edge)
      return around.every(([x, y]) => s.isSolidForEntities(x, y, false));
    });

    await driver.settle(1200);

    const boot = await state();
    assert('Lab booted at its own spawn', boot.player.worldX === 5 && boot.player.worldY === 6,
      `spawn (${boot.player.worldX},${boot.player.worldY})`);
    assert('Only the home fire is lit at boot', boot.litFires === 1, `litFires=${boot.litFires}`);
    await shot('lab', { note: 'The whole lab on one screen: the fuse corridor north, the lava island southeast' });

    // ── The premise: the sealed campfire has no key ──────────────────────────
    // Every neighbouring tile must be impassable — water, water, and TALL GRASS. If any of
    // them ever opened, the puzzle would collapse back into "walk over and use an item".
    assert('The sealed campfire cannot be reached on foot (it has no key)',
      await campfireIsSealed(),
      'a tile touching the campfire is walkable — the seal is broken');

    // ── O PAVIO ─────────────────────────────────────────────────────────────
    log('PAVIO: fell the tree at (7,3) NORTH — the trunk lands across the river as a fire bridge');
    await goTo(6, 6);
    await dismissItemGet();
    assert('Axe picked up', (await state()).heldItem === 'axe', `held=${(await state()).heldItem}`);

    await goTo(7, 4);
    await shot('pavio-before', { note: 'The grass corridor is broken by the river — fire will not cross it' });
    await bump('up', 5); // fell it north: TIMBER drops the trunk onto the water at (7,2)
    await sleep(2600);

    const bridged = await driver.page.evaluate(() =>
      window.__scene.waterTiles.some((w) => w.worldX === 7 && w.worldY === 2 && w.isBridge));
    assert('The felled trunk bridged the river (a wooden fuse, not a floor)', bridged,
      'no bridge at (7,2) — the fall was aimed wrong');
    await shot('pavio-bridge', { note: 'A bridge built for the FIRE to walk on' });

    // The felling chop turns the tree into a passable stump, so the last press walks the hero
    // forward onto the new bridge. Step back off it before routing anywhere — (6,2) is tall
    // grass, and the corridor is a wall to him.
    await goTo(7, 4);

    // Now the match: an axe makes firewood; the home fire lights it.
    log('PAVIO: chop the second tree for a graveto, light it at the home fire, touch the fuse');
    await goTo(3, 7);
    await bump('down', 5); // fell the tree at (3,8) — no water beyond, so it drops a graveto
    await sleep(2400);
    await goTo(3, 8); // onto the graveto (the axe drops in its place)
    await dismissItemGet();
    assert('Graveto in hand', (await state()).heldItem === 'wood', `held=${(await state()).heldItem}`);

    await goTo(5, 6);
    await bump('up', 1); // light it at the home fire at (5,5)
    await sleep(700);
    assert('Torch lit at the home fire', (await state()).heldOnFire === true,
      `heldOnFire=${(await state()).heldOnFire}`);

    await goTo(4, 2); // the near end of the corridor
    await bump('right', 1); // touch the flame to the grass at (5,2) — and let go
    await shot('pavio-lit', { note: 'The fuse is lit. From here on the hero does nothing.' });

    // The hero now just watches. The fire walks the grass, crosses the burning bridge, and
    // lights a campfire he could never have touched.
    let lit = false;
    for (let i = 0; i < 40 && !lit; i += 1) {
      await sleep(500);
      lit = (await state()).litFires >= 2;
    }
    assert('The fire walked the fuse and lit the sealed campfire', lit,
      `litFires=${(await state()).litFires} — the fuse never made it across`);

    // The proof that this is not a fetch quest: the hero was never beside the fire he lit.
    const heroWhenLit = await pos();
    const adjacent = Math.abs(heroWhenLit.worldX - 11) + Math.abs(heroWhenLit.worldY - 2) <= 1;
    assert('The hero was never next to the campfire he lit', !adjacent,
      `hero at (${heroWhenLit.worldX},${heroWhenLit.worldY}) — that is adjacent to (11,2)`);
    await shot('pavio-solved', { note: 'Lit by the fire, not by the hero' });

    // ── A ILHA SEM FOGO ─────────────────────────────────────────────────────
    // The burnt corridor is now walkable stubble, and the hero drifted onto it with the last
    // queued press — so settle and re-read before routing anywhere.
    await driver.settle(800);
    log('ILHA: boots in, drop them for the axe, make firewood, borrow the lava');
    await goTo(4, 2);
    await goTo(4, 9); // down the clear west column
    await goTo(6, 10); // the lava boots
    await dismissItemGet();
    assert('Lava boots claimed', (await state()).heldItem === 'lavaBoots', `held=${(await state()).heldItem}`);

    await goTo(7, 8);
    await bump('right', 2); // bare lava: with the boots ON, the hero walks; this is the entry
    await sleep(400);
    await goTo(9, 8); // across the lava at (8,8), onto the island

    // Dead end #1: boots in hand, no free hand for fire.
    await bump('up', 2); // the dead campfire is at (10,7) — reachable from (9,7)
    await goTo(9, 7);
    await bump('right', 2);
    await sleep(500);
    const noHand = await state();
    assert('Boots in hand cannot light the island fire (no free hand)',
      noHand.litFires === 2 && noHand.heldItem === 'lavaBoots',
      `litFires=${noHand.litFires} held=${noHand.heldItem}`);
    await shot('ilha-dead-end', { note: 'No free hand. The only item here is an AXE.' });

    // Taking the axe means dropping the boots on purpose, on a lava-ringed island.
    await goTo(9, 8);
    await goTo(10, 8);
    await dismissItemGet();
    assert('The hero chose the axe and dropped the boots',
      (await state()).heldItem === 'axe'
        && (await state()).groundItems.some((it) => it.kind === 'lavaBoots' && it.worldX === 10 && it.worldY === 8),
      `held=${(await state()).heldItem}`);

    // Dead end #2 — the real one. An axe cannot light a fire... but it makes firewood.
    await bump('down', 5); // fell the island's dry tree at (10,9)
    await sleep(2200);
    await goTo(10, 9); // onto the graveto (the axe drops in its place)
    await dismissItemGet();
    assert('The axe manufactured the fire tool', (await state()).heldItem === 'wood',
      `held=${(await state()).heldItem}`);

    await bump('down', 1); // the ring lava at (10,10) — the obstacle IS the lighter
    await sleep(700);
    assert('The ring lava lit the stick', (await state()).heldOnFire === true,
      `heldOnFire=${(await state()).heldOnFire}`);

    await goTo(9, 9);
    await goTo(9, 7);
    await bump('right', 1); // deliver the flame into the island campfire at (10,7)
    let islandLit = false;
    for (let i = 0; i < 20 && !islandLit; i += 1) {
      await sleep(500);
      islandLit = (await state()).litFires >= 3;
    }
    assert('The island campfire is alive', islandLit, `litFires=${(await state()).litFires}`);
    await sleep(2000);
    await shot('ilha-solved', { note: 'Both puzzles solved — three fires burning' });

    const end = await state();
    assert('Finished alive (a puzzle run, not a fight)', end.isDead === false, `health=${end.health}`);
  },
};

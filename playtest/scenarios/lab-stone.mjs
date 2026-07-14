// The pickaxe, remade: it PRODUCES instead of DELETES.
//
// Smashing a rock used to leave nothing behind — the only thing the pickaxe ever produced was
// passage, which makes it a password, not a tool. Now the shattered rock drops a STONE, and the
// stone is the wood stick's opposite. Both span the river; only one of them is fuel:
//
//   wood  -> a plank deck. Walkable AND flammable: fire crosses it (and eats it). A FUSE.
//   stone -> a ford. Walkable and permanent. Fire dies on it. A FLOOR.
//
// So this scenario does not merely check that a stone drops. It proves the stone is a DECISION,
// by running the same fuse twice over the same tile and showing the fire behaves differently:
//   1. ford the river in stone   -> light the fuse -> the fire STOPS at the water. Fire: no.
//   2. the hero walks the ford himself, torch in hand, and lights the far grass. Hero: yes.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'lab-stone',
  description: 'The pickaxe produces a stone; a stone fords the river; the fire cannot cross it.',
  needsGame: true,
  route: '/lab?play',
  async run({ driver, shot, assert, log }) {
    const state = () => driver.getState();
    const pos = async () => (await state()).player;
    const KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

    const dismissItemGet = async () => {
      for (let i = 0; i < 12; i += 1) {
        if (!(await state())?.itemGetOpen) return;
        await driver.press('Space', { count: 1, delay: 400 });
      }
    };
    const step = async (dir, ex, ey) => {
      for (let a = 0; a < 4; a += 1) {
        await driver.press(KEY[dir], { count: 1 });
        for (let i = 0; i < 6; i += 1) {
          const p = await pos();
          if (p.worldX === ex && p.worldY === ey) return;
          await sleep(120);
        }
        await dismissItemGet();
      }
      throw new Error(`step ${dir} -> (${ex},${ey}); hero at ${JSON.stringify(await pos())}`);
    };
    const goTo = async (x, y) => {
      let p = await pos();
      while (p.worldX !== x) { const d = Math.sign(x - p.worldX); await step(d > 0 ? 'right' : 'left', p.worldX + d, p.worldY); p = await pos(); }
      while (p.worldY !== y) { const d = Math.sign(y - p.worldY); await step(d > 0 ? 'down' : 'up', p.worldX, p.worldY + d); p = await pos(); }
    };
    const bump = async (dir, n = 1) => driver.press(KEY[dir], { count: n, delay: 420 });
    const riverAt72 = () => driver.page.evaluate(() => {
      const w = window.__scene.waterTiles.find((t) => t.worldX === 7 && t.worldY === 2);
      return w ? { blocking: w.blocking, isBridge: w.isBridge, isFord: w.isFord } : null;
    });

    await driver.settle(1200);

    // ── The pickaxe produces matter ─────────────────────────────────────────
    log('PICARETA: smash the rock — it must leave a STONE behind, not just a hole');
    await goTo(1, 5); // the pickaxe
    await dismissItemGet();
    assert('Pickaxe picked up', (await state()).heldItem === 'pickaxe', `held=${(await state()).heldItem}`);

    await goTo(1, 4); // stand under the rock at (1,3)
    await bump('up', 2); // crack, then shatter
    await sleep(900);
    const smashed = await state();
    assert('The shattered rock left a stone on its tile',
      smashed.groundItems.some((it) => it.kind === 'stone' && it.worldX === 1 && it.worldY === 3),
      JSON.stringify(smashed.groundItems));
    await shot('stone-dropped', { note: 'The pickaxe no longer deletes — it produces' });

    await goTo(1, 3); // onto the stone (the pickaxe drops in its place)
    // The stone is a FIRST-TIME pickup, so the ItemGet ceremony opens a beat after the step
    // lands and freezes input. Dismiss it, settle, and dismiss again — otherwise the next
    // walk's keypresses queue up behind the overlay and all flush at once when it closes.
    await dismissItemGet();
    await driver.settle(700);
    await dismissItemGet();
    assert('Stone in hand', (await state()).heldItem === 'stone', `held=${(await state()).heldItem}`);

    // ── The stone fords the river ───────────────────────────────────────────
    // Approach the gap from the NORTH: the tile south of it holds the dry tree, and chopping
    // that tree would timber a WOODEN bridge into the very tile we want to fill with stone.
    log('PEDRA: ford the river gap from the north — one stone, no carpentry');
    await goTo(4, 1);
    await goTo(7, 1);
    await bump('down', 1);
    await sleep(900);
    const river = await riverAt72();
    assert('One stone forded the river (walkable, and NOT a bridge)',
      river && river.isFord === true && river.isBridge === false && river.blocking === false,
      JSON.stringify(river));
    await shot('stone-ford', { note: 'A floor, not a fuse' });

    // The ford is instantly walkable, so the press that placed it also carried the hero onto
    // it. Step back north before routing: the grass either side of the ford is a wall.
    await goTo(7, 1);

    // ── The proof: fire cannot cross a stone ford ───────────────────────────
    log('FOGO: light the fuse — it must DIE at the ford. Stone is not fuel.');
    // The stone went into the river, so the hero is empty-handed: fetch the axe to make a
    // graveto. Route down the west column — the grass corridor at y=2 is a wall.
    await goTo(4, 1);
    await goTo(4, 6);
    await goTo(6, 6); // the axe
    await dismissItemGet();
    await goTo(3, 6);
    await goTo(3, 7);
    await bump('down', 5); // fell the tree at (3,8) for a graveto
    await sleep(2400);
    await goTo(3, 8);
    await dismissItemGet();
    assert('Graveto in hand', (await state()).heldItem === 'wood', `held=${(await state()).heldItem}`);

    await goTo(5, 6);
    await bump('up', 1); // light it at the home fire
    await sleep(700);
    assert('Torch lit', (await state()).heldOnFire === true, `heldOnFire=${(await state()).heldOnFire}`);

    await goTo(4, 2);
    await bump('right', 1); // set the near grass alight
    await sleep(600);
    await shot('fuse-lit', { note: 'The fuse runs — straight at a stone ford' });

    // Give the fire far longer than it needs to cross, then check it never did.
    await sleep(9000);
    const stalled = await state();
    assert('The fire DIED at the stone ford (the sealed campfire is still dark)',
      stalled.litFires === 1,
      `litFires=${stalled.litFires} — fire crossed stone, which it must never do`);
    await shot('fire-stopped', { note: 'Stone is not fuel: the fuse ends at the water' });

    // ── ...but the HERO can walk it ─────────────────────────────────────────
    // The choice costs elegance, not the run: the ford is walkable, so carry the flame over
    // yourself and light the far half by hand.
    log('SAIDA: the ford is a FLOOR — walk it, torch in hand, and light the far grass');
    await goTo(4, 2);
    await goTo(4, 6); // down the west column — the home fire itself blocks the x=5 column
    await goTo(5, 6);
    await bump('up', 1); // relight (the first torch burned out during the fire)
    await sleep(700);
    await goTo(4, 6);
    await goTo(4, 2);
    await goTo(7, 2); // over the burnt stubble at (5,2)/(6,2) and onto the stone ford
    assert('The hero can stand on the stone ford', (await pos()).worldX === 7, `pos=${JSON.stringify(await pos())}`);
    await bump('right', 1); // torch the far grass at (8,2)
    let lit = false;
    for (let i = 0; i < 40 && !lit; i += 1) {
      await sleep(500);
      lit = (await state()).litFires >= 2;
    }
    assert('Carrying the flame across the ford lights the sealed campfire', lit,
      `litFires=${(await state()).litFires}`);
    await shot('stone-solved', { note: 'Stone crosses the hero, wood crosses the fire — that is the choice' });
  },
};

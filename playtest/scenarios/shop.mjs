// Shop: the game is walk-only — the shop is the Souls bonfire, opened by BUMPING a lit campfire
// (no E key, no button). This proves the real way in, then the debug-API toggle for the overlay.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'shop',
  description: 'Open the shop by bumping the lit home campfire, capture it, then close it.',
  needsGame: true,
  async run({ driver, shot, assert }) {
    const state = () => driver.getState();

    // Adventure spawn (54,92); the lit home fire is at (51,89). The lane up x=54 and west along
    // y=89 is prop- and pickup-free (verified against world.json), so the hero arrives bare-handed.
    await driver.settle(800);
    for (let i = 0; i < 3; i += 1) { await driver.press('ArrowUp', { count: 1 }); await sleep(350); }
    for (let i = 0; i < 2; i += 1) { await driver.press('ArrowLeft', { count: 1 }); await sleep(350); }
    const p = (await state()).player;
    assert('Hero stands beside the home fire', p.worldX === 52 && p.worldY === 89,
      `hero at (${p.worldX},${p.worldY})`);
    assert('The level-mode floating buttons do NOT exist in the adventure',
      await driver.page.evaluate(() => !document.getElementById('zh-level-btns')),
      'level buttons leaked into the adventure');

    await driver.press('ArrowLeft', { count: 1 }); // bump the lit fire: resting at it = the shop
    let open = null;
    for (let i = 0; i < 10; i += 1) {
      open = await state();
      if (open?.shopOpen) break;
      await sleep(300);
    }
    await shot('shop-bonfire', { note: 'Bumping the lit campfire opens the shop — walk-only, no E key', state: open });
    assert('Shop opened by bumping the bonfire', open?.shopOpen === true, `shopOpen=${open?.shopOpen}`);

    await driver.closeShop();
    assert('Shop closed', (await state())?.shopOpen === false, `shopOpen=${(await state())?.shopOpen}`);

    // The debug-API path still works (used by other tooling).
    await driver.openShop();
    await driver.settle(300);
    assert('Shop opened via debug API', (await state())?.shopOpen === true, `shopOpen=${(await state())?.shopOpen}`);
    await driver.closeShop();
    assert('Shop closed again', (await state())?.shopOpen === false, `shopOpen=${(await state())?.shopOpen}`);
  },
};

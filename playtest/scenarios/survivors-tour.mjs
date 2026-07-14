// Survivors tour: photograph the Vampire-Survivors mode a few beats in — enemies,
// weapon FX, XP gems, HUD. Investigation tool, not a regression test.
export default {
  name: 'survivors-tour',
  description: 'Photograph the survivors mode (spawns, FX, HUD) for visual review.',
  needsGame: false,
  async run({ driver, shot }) {
    const { page } = driver;
    await driver.open('/?survivors');
    await page.waitForTimeout(4000);
    await shot('survivors-early');
    // Hold a direction so the run is alive (kiting, spawns following).
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(5000);
    await page.keyboard.up('ArrowRight');
    await shot('survivors-mid');
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(6000);
    await page.keyboard.up('ArrowDown');
    await shot('survivors-late');
  },
};

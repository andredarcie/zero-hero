// Sword-get: fire the "you got the sword" presentation and capture the highlight beat.
export default {
  name: 'sword-get',
  description: 'Trigger the item-get presentation (hero centered, sword raised) and capture it.',
  needsGame: true,
  async run({ driver, shot, assert }) {
    await driver.page.evaluate(() => window.gameDebug?.triggerSwordGet());
    await driver.page.waitForFunction(() => window.gameDebug?.getState()?.itemGetOpen === true, null, { timeout: 4000 });

    await driver.settle(950); // just past the apex burst (flash / rays / sparkles)
    const mid = await driver.getState();
    await shot('sword-get-apex', { note: 'Sword raised above the hero — burst', state: mid });

    await driver.settle(550);
    await shot('sword-get-hold', { note: 'Highlight hold (rays + glint + label)' });

    assert('Item-get presentation is showing', mid?.itemGetOpen === true, `itemGetOpen=${mid?.itemGetOpen}`);
    assert('Sword was equipped', mid?.swordEquipped === true, `swordEquipped=${mid?.swordEquipped}`);

    await driver.page.waitForFunction(() => window.gameDebug?.getState()?.itemGetOpen === false, null, { timeout: 6000 });
    const after = await driver.getState();
    await shot('sword-get-resumed', { note: 'Back to gameplay', state: after });
    assert('Presentation closed and gameplay resumed', after?.itemGetOpen === false, `itemGetOpen=${after?.itemGetOpen}`);
  },
};

// Shop: open the upgrade overlay and confirm it toggles cleanly.
export default {
  name: 'shop',
  description: 'Open the shop overlay, capture it, then close it.',
  needsGame: true,
  async run({ driver, shot, assert }) {
    await driver.openShop();
    await driver.settle(400);
    const open = await driver.getState();
    await shot('shop-open', { note: 'Shop overlay', state: open });
    assert('Shop opened', open?.shopOpen === true, `shopOpen=${open?.shopOpen}`);

    await driver.closeShop();
    const closed = await driver.getState();
    assert('Shop closed', closed?.shopOpen === false, `shopOpen=${closed?.shopOpen}`);
  },
};

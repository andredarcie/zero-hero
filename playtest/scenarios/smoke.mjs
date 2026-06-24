// Smoke test: the game boots, the intro shows, and the GameScene becomes playable.
export default {
  name: 'smoke',
  description: 'Boot -> intro -> game, capturing each stage.',
  needsGame: false,
  async run({ driver, shot, assert }) {
    await driver.settle(2200); // let Preload finish and the intro type some text
    await shot('intro', { note: 'Intro screen' });

    const state = await driver.startGame();
    await driver.settle(400);
    await shot('game-boot', { note: 'GameScene first frame', state });

    assert('GameScene is active', state?.scene === 'game', `scene=${state?.scene}`);
    assert('Player starts with health', (state?.health ?? 0) > 0, `health=${state?.health}`);
    assert('HUD max health is set', (state?.maxHealth ?? 0) > 0, `maxHealth=${state?.maxHealth}`);
  },
};

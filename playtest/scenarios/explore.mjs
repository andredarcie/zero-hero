// Explore: actually drive the hero around the start screen with the keyboard.
const samePos = (a, b) => a?.player.worldX === b?.player.worldX && a?.player.worldY === b?.player.worldY;

export default {
  name: 'explore',
  description: 'Walk the hero in all four directions and confirm movement registers.',
  needsGame: true,
  async run({ driver, shot, assert }) {
    const start = await driver.getState();
    await shot('explore-start', { note: 'Before walking', state: start });

    let anyMovement = false;
    for (const dir of ['right', 'up', 'left', 'down']) {
      const before = await driver.getState();
      await driver.walk(dir, 3);
      const after = await driver.getState();
      if (!samePos(before, after)) anyMovement = true;
      await shot(`explore-${dir}`, { state: after });
    }

    const end = await driver.getState();
    // The start tile is open on at least one side, so walking should move the hero at
    // least once (a fully walled-in spawn would be a real bug).
    assert('Hero moved at least one tile', anyMovement, 'tracked across 4 directions');
    assert('Still in GameScene after walking', end?.scene === 'game', `scene=${end?.scene}`);
    assert('Survived the walk', (end?.health ?? 0) > 0, `health=${end?.health}`);
  },
};

// Text legibility: focused captures of every place text appears (intro, HUD, dialog).
//
// This is the verification scenario for the "make text 100% sharp" task. The crops it
// produces (hud, dialog) are meant to be opened and eyeballed at full resolution.
export default {
  name: 'text-legibility',
  description: 'Capture intro text, HUD close-up, and a dialog close-up for sharpness review.',
  needsGame: false,
  async run({ driver, shot, assert }) {
    // Intro — fully revealed text + the "press any key" prompt.
    await driver.settle(2600);
    await shot('text-intro', { note: 'Intro voice lines' });

    const state = await driver.startGame();
    await driver.settle(500);

    // HUD bar — counters, B/A slots, -LIFE-, MAP label.
    await shot('text-hud-crop', { region: 'hud', note: 'HUD text close-up' });
    await shot('text-game-full', { note: 'Full game frame' });

    // Dialog — speaker name + body copy with word wrap.
    const opened = await driver.openDialog('blackCat');
    assert('Dialog opened for capture', opened);
    await driver.advanceDialog(1); // reveal the whole first line
    await driver.settle(400);
    await shot('text-dialog-crop', { region: 'dialog', note: 'Dialog text close-up' });
    await shot('text-dialog-full', { note: 'Dialog over the scene' });
    await driver.closeDialog();

    assert('Reached GameScene for text capture', state?.scene === 'game', `scene=${state?.scene}`);
  },
};

// Dialog: open an NPC conversation and walk through its lines.
// Uses a long-text NPC (blackCat) so word-wrap and the typewriter are exercised.
export default {
  name: 'dialog',
  description: 'Open an NPC dialog, advance through lines, then close it.',
  needsGame: true,
  async run({ driver, shot, assert }) {
    const opened = await driver.openDialog('blackCat');
    assert('Dialog opened', opened, 'via gameDebug.openDialog("blackCat")');

    await driver.settle(700); // fade-in + first characters typing
    await shot('dialog-typing', { region: 'dialog', note: 'Mid-typewriter' });

    await driver.advanceDialog(1); // SPACE: complete the current line
    await driver.settle(300);
    await shot('dialog-line-full', { region: 'dialog', note: 'Full first line' });

    await driver.advanceDialog(1); // SPACE: next line
    await driver.settle(500);
    const mid = await driver.getState();
    await shot('dialog-next-line', { note: 'Second line', state: mid });
    assert('Dialog still open while reading', mid?.dialogOpen === true, `dialogOpen=${mid?.dialogOpen}`);

    await driver.closeDialog();
    const after = await driver.getState();
    assert('Dialog closed', after?.dialogOpen === false, `dialogOpen=${after?.dialogOpen}`);
  },
};

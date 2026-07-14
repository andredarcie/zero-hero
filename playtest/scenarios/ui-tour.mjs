// UI tour: photograph the player-facing screens AROUND the game — boot/language pick,
// title, intro. An investigation tool like tour.mjs, not a regression test: keying
// through these screens is known-flaky, so every step shoots whatever is on screen
// and no step asserts.
export default {
  name: 'ui-tour',
  description: 'Photograph the language pick, title and intro screens for visual review.',
  needsGame: false,
  async run({ driver, shot }) {
    const { page } = driver;
    await page.waitForTimeout(2500);
    await shot('ui-boot');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2500);
    await shot('ui-after-enter-1');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2500);
    await shot('ui-after-enter-2');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3500);
    await shot('ui-after-enter-3');
  },
};

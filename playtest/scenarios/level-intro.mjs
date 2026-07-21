// LEVEL INTRO: the authored name gets a centered, game-font entrance card. Gameplay remains
// frozen while it is visible, then resumes normally after the card fades away.
export default {
  name: 'level-intro',
  description: 'Mostra o nome autoral do level no centro, desaparece e libera o movimento.',
  needsGame: false,
  route: '/?level=1',
  async run({ driver, shot, assert }) {
    await driver.page.waitForFunction(
      () => window.gameDebug?.getState()?.scene === 'game',
      null,
      { timeout: 20000 },
    );

    const entered = await driver.getState();
    assert('a apresentacao abre junto com o level', entered.levelIntroOpen === true,
      JSON.stringify(entered));
    assert('o nome vem do meta.name do level', entered.levelName === 'A Espada na Pedra',
      `levelName=${entered.levelName}`);

    const start = { ...entered.player };
    await driver.press('ArrowRight', { count: 1, delay: 150, holdMs: 80 });
    const frozen = await driver.getState();
    assert('o heroi nao anda por baixo do letreiro', frozen.player.worldX === start.worldX
      && frozen.player.worldY === start.worldY, JSON.stringify({ start, now: frozen.player }));

    await driver.settle(500);
    await shot('nome-do-level-centralizado', { note: 'Pico legivel da animacao de entrada.' });

    await driver.page.waitForFunction(
      () => window.gameDebug?.getState()?.levelIntroOpen === false,
      null,
      { timeout: 5000 },
    );
    await shot('level-liberado', { note: 'O letreiro desapareceu por completo.' });

    await driver.walk('up', 1);
    const resumed = await driver.getState();
    assert('o movimento volta ao final da apresentacao', resumed.player.worldX === start.worldX
      && resumed.player.worldY === start.worldY - 1, JSON.stringify(resumed.player));
  },
};

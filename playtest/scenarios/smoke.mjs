// Smoke test: the game boots, the title shows, and the GameScene becomes playable.
//
// E, desde 2026-08-04, o tamanho do heroi ao NASCER — que e a hora exata em que ele errava. O
// `sizePx` tinha dois escritores (a formula 2D do handleResize e o stopBreathing, que o primeiro
// passo chama), entao o heroi aparecia com um tamanho e trocava pra outro ao andar. Por isso a
// medida e tirada DUAS vezes, antes e depois de um passo: so a segunda leitura prova que a
// primeira nao estava sendo consertada pelo movimento.
const heroMetrics = (driver) => driver.page.evaluate(() => {
  const s = window.__scene;
  return { sizePx: s?.hero?.sizePx ?? null, tileSize: s?.tileSize ?? null };
});

export default {
  name: 'smoke',
  description: 'Boot -> title -> game; o heroi nasce medindo exatamente um tile.',
  needsGame: false,
  async run({ driver, shot, assert }) {
    await driver.settle(2200); // let Preload finish and the title fade in
    await shot('title', { note: 'Title screen' });

    const state = await driver.startGame();
    await driver.settle(400);
    await shot('game-boot', { note: 'GameScene first frame', state });

    assert('GameScene is active', state?.scene === 'game', `scene=${state?.scene}`);
    assert('Player starts with health', (state?.health ?? 0) > 0, `health=${state?.health}`);
    assert('HUD max health is set', (state?.maxHealth ?? 0) > 0, `maxHealth=${state?.maxHealth}`);

    // ── O heroi mede um tile desde o primeiro frame ──────────────────────────
    const born = await heroMetrics(driver);
    assert('O heroi nasce medindo exatamente um tile (sizePx == tileSize)',
      born.sizePx !== null && Math.abs(born.sizePx - born.tileSize) < 0.5,
      JSON.stringify(born));

    await driver.walk('right', 1);
    await driver.settle(300);
    const walked = await heroMetrics(driver);
    assert('Andar nao muda o tamanho do heroi',
      Math.abs(walked.sizePx - born.sizePx) < 0.5,
      JSON.stringify({ born, walked }));
  },
};

export default {
  name: 'neblina',
  description: 'A névoa continua no cenário quando o herói se desloca.',
  needsGame: false,
  async run({ driver, shot, assert }) {
    const { page } = driver;
    await page.addInitScript(() => {
      localStorage.setItem('zh.cozy.v1', JSON.stringify({ started: true, introSeen: true, day: 4, clock: 0.27 }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game');
    const place = (x, y) => page.evaluate(([x, y]) => {
      window.gameDebug.hero.teleport(x, y);
      window.gameDebug.verbs.hidePrompt();
    }, [x, y]);
    await place(36, 11);
    await page.evaluate(() => {
      window.gameTime.set(0.26);
      window.gameTime.scale(0);
      window.gameDebug.valley.freezeNature(true);
    });
    await driver.settle(900);
    const air = await page.evaluate(() => window.gameDebug.render.measureAirMotion(36, 11));
    const [stationary, , east] = air;
    assert('A bruma distante permanece estável em pontos fixos ao deslocar só a câmera',
      stationary.count >= 36 && stationary.change < 0.001 && east.base > 0.02 && east.change / east.base < 0.2,
      JSON.stringify({ stationary, east }));
    const mist = () => page.evaluate(() => window.gameDebug.valley.morningMistBodies());
    const before = await mist();
    await shot('geada-parado');
    await driver.walk('right', 2);
    const walked = await page.evaluate(() => window.gameDebug.hero.at());
    assert('O herói atravessou a geada a pé', walked.x === 38 && walked.y === 11, JSON.stringify(walked));
    await shot('geada-depois-da-caminhada');
    // Sair da região e voltar ao mesmo ponto e instante não deve recriar a névoa em outros lugares.
    await place(12, 19);
    await driver.settle(300);
    await place(36, 11);
    await page.evaluate(() => window.gameTime.set(0.26));
    await driver.settle(250);
    const after = await mist();
    const positions = (bodies) => bodies.map(({ x, z }) => [x, z]);
    assert('Ao rever a geada, os mesmos bancos continuam nos mesmos pontos', before.length > 0
      && JSON.stringify(positions(before)) === JSON.stringify(positions(after)), `${before.length} → ${after.length} bancos`);

    const garden = await page.evaluate(() => {
      const { hero, valley } = window.gameDebug;
      hero.teleport(30, 36);
      const before = valley.gardenMistOpacity();
      hero.teleport(30, 32);
      const after = valley.gardenMistOpacity();
      return { count: before.length, change: Math.max(...before.map((alpha, i) => Math.abs(alpha - after[i]))) };
    });
    assert('A opacidade da névoa do jardim é a mesma com o herói em outro ponto', garden.count > 0
      && garden.change < 0.00001, JSON.stringify(garden));
    await place(30, 36);
    await driver.settle(700);
    await shot('jardim');
  },
};

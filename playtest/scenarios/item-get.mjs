// ITEM-GET — so a cerimonia de ganhar um item, isolada: ela abre, mostra a frase do locale num
// cartao, NAO escurece o mundo ate o preto, fecha sozinha e devolve o jogo.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'item-get',
  description: 'A cerimonia cozy de ganhar um item: abre, mostra a frase, fecha sozinha.',
  needsGame: false,
  async run({ driver, shot, assert }) {
    const { page } = driver;
    await page.addInitScript(() => {
      localStorage.setItem('zh.cozy.v1', JSON.stringify({ started: true, introSeen: true }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await sleep(800);
    await page.evaluate(() => { window.__itemGetDone = false; window.__scene.showItemGet('axe', () => { window.__itemGetDone = true; }); });
    assert('A cerimonia abre', (await driver.getState()).itemGetOpen, '');
    for (const ms of [250, 700, 1400, 2400]) {
      await sleep(ms === 250 ? 250 : ms - [250, 700, 1400, 2400][[250, 700, 1400, 2400].indexOf(ms) - 1]);
      await shot(`axe-${ms}ms`, { note: `${ms}ms` });
    }
    const card = await page.evaluate(() => window.__scene.itemGetOverlay?.objs
      .filter((o) => o.type === 'Text').map((o) => o.text) ?? []);
    assert('A frase vem do locale (sem caixa alta gritando)', card.some((t) => t.startsWith('An axe.')), JSON.stringify(card));
    const dim = await page.evaluate(() => window.__scene.itemGetOverlay?.objs.find((o) => o.type === 'Rectangle')?.fillAlpha ?? 1);
    assert('O mundo continua visivel por baixo (nada de tela preta)', dim < 0.5, `fillAlpha=${dim}`);
    await page.waitForFunction(() => window.__itemGetDone === true, null, { timeout: 6000 });
    assert('Fecha sozinha e devolve o jogo', !(await driver.getState()).itemGetOpen, '');
  },
};

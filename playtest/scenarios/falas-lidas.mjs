// FALAS-LIDAS — qualidade de vida (pedido do autor, runtime/readLines.ts): uma fala que o jogador já leu inteira
// aparece inteira de uma vez da próxima vez; a fala nova continua sendo datilografada. E o save lembra.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'falas-lidas',
  description: 'Fala já lida aparece de uma vez; fala nova é datilografada; o save lembra o que foi lido.',
  needsGame: false,
  async run({ driver, assert, log }) {
    const { page } = driver;
    const state = () => page.evaluate(() => window.gameDebug?.getState() ?? null);
    /** A linha na caixa agora: o texto, se ainda está sendo datilografada, e quantas letras já apareceram. */
    const line = () => page.evaluate(() => {
      const box = window.gameDebug.dialog.box();
      return box ? { text: box.text, typing: box.typing, shown: box.shown, total: box.total } : null;
    });
    const closeAll = async () => {
      for (let i = 0; i < 40; i += 1) {
        const st = await state();
        if (!st.dialogOpen && !st.itemGetOpen && !st.cutsceneActive) return;
        if (st.dialogOpen || st.itemGetOpen) await page.keyboard.press('z');
        await sleep(350);
      }
    };

    await page.addInitScript(() => {
      localStorage.setItem('zh.cozy.v1', JSON.stringify({ started: true, introSeen: true }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await sleep(1200);

    const talk = async () => {
      await page.evaluate(() => {
        const g = window.gameDebug; window.gameTime.set(0.45);
        g.hero.teleport(5, 41, 0, -1);
      });
      await sleep(500);
      await page.keyboard.press('z');
      await sleep(180);
    };

    // A primeira conversa com a Shui: tudo novo, então a primeira fala vem letra por letra.
    await talk();
    const first = await line();
    log(`  1ª conversa, logo ao abrir: ${JSON.stringify(first)}`);
    assert('Fala nova é datilografada (ainda escrevendo logo depois de abrir)', first && first.typing && first.shown < first.total, JSON.stringify(first));
    await closeAll();
    await sleep(600);
    const saved = await page.evaluate(() => (JSON.parse(localStorage.getItem('zh.cozy.v1') || '{}').readLines ?? []).length);
    assert('O save lembra as falas lidas', saved >= 3, String(saved));

    // A segunda: ela repete a dica do porcini, que o jogador já leu — aparece inteira de uma vez.
    await talk();
    const again = await line();
    log(`  2ª conversa, logo ao abrir: ${JSON.stringify(again)}`);
    assert('Fala já lida aparece inteira de uma vez', again && !again.typing && again.shown === again.total, JSON.stringify(again));
    await closeAll();
  },
};

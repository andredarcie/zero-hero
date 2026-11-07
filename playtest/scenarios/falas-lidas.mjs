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
      const o = window.__scene.dialogOverlay;
      if (!o) return null;
      const letters = o.letters.filter(Boolean);
      return { text: o.currentText, typing: o.isTyping, shown: letters.filter((l) => l.classList.contains('zh-on')).length, total: letters.length };
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
        const s = window.__scene; window.gameTime.set(0.45);
        s.playerWorld.worldX = 5; s.playerWorld.worldY = 41;
        s.movementController.interruptMovement(5, 41); s.movementController.faceTo(0, -1); s.streamChunks(true);
      });
      await sleep(500);
      await page.keyboard.press('z');
      await sleep(180);
    };

    // A primeira conversa com a Hollis: tudo novo, então a primeira fala vem letra por letra.
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

// O GATO CÍNICO — pedido do autor: o gato fala, e é Diógenes. O Z de carinho (com nada mais na frente) faz os
// corações e o miado, e ele responde com uma passagem das Vidas de Diógenes Laércio (livro VI), em ordem.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'gato-cinico',
  description: 'O carinho no gato tem resposta: as lições de Diógenes, uma por vez, em ordem, lembradas no save.',
  needsGame: false,
  async run({ driver, shot, assert, log }) {
    const { page } = driver;
    const state = () => page.evaluate(() => window.gameDebug?.getState() ?? null);
    await page.addInitScript(() => {
      if (sessionStorage.getItem('gato')) return;
      sessionStorage.setItem('gato', '1');
      localStorage.setItem('zh.cozy.v1', JSON.stringify({ started: true, introSeen: true }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await sleep(1200);
    // O gato chega com o primeiro favor feito; aqui ele é chamado direto, e o herói fica num chão aberto,
    // olhando para um tile livre (o Z não tem outra coisa a fazer).
    const setup = await page.evaluate(() => {
      const g = window.gameDebug;
      for (let y = 40; y < 58; y += 1) {
        for (let x = 20; x < 40; x += 1) {
          if ([[0, 0], [0, 1], [1, 0], [-1, 0], [0, -1]].every(([dx, dy]) => !g.world.solid(x + dx, y + dy))
            && !g.items.hasAt(x, y + 1) && !g.verbs.hand(x, y + 1)) {
            g.hero.teleport(x, y, 0, 1);
            g.camp.ensureCat(false);
            return { x, y };
          }
        }
      }
      return null;
    });
    assert('Há chão aberto e o gato está ao lado', !!setup, JSON.stringify(setup));
    await sleep(1500);

    const pet = async (n) => {
      await page.keyboard.press('z');
      await sleep(900);
      const st = await state();
      const said = await page.evaluate((k) => window.gameDebug.dialog.heard(k), `cat/talk/${n}`);
      const text = await page.evaluate((k) => window.gameDebug.world.lines(k).join(' / '), `cat.talk.${n}`);
      log(`  carinho ${n}: ${text}`);
      assert(`Carinho ${n}: o gato fala a lição ${n}`, st.dialogOpen && said && text.length > 0, JSON.stringify({ dialog: st.dialogOpen, said }));
      await sleep(1200);
      await shot(`gato-${n}`, { note: `A lição ${n} do gato` });
      for (let i = 0; i < 10 && (await state()).dialogOpen; i += 1) { await page.keyboard.press('z'); await sleep(450); }
      await sleep(600);
    };
    await pet(1);
    await pet(2);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('zh.cozy.v1')).seenDialogKeys.filter((k) => k.startsWith('cat/')));
    assert('O save lembra o que o gato já disse', saved.includes('cat/talk/1') && saved.includes('cat/talk/2'), JSON.stringify(saved));
  },
};

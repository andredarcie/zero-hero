// O PAINEL DE TESTES DO LOCALHOST (pedido do autor, 2026-11-17; debug/DevPanel + scenes/game/DevTools): a tecla à
// esquerda do 1 abre o painel e para o jogo; por ele se concluem os pedidos (e a chave do jardim vem), põe-se material
// e ferramentas na mão, enche-se a bancada, pulam-se as noites da Morte, troca-se a hora, vai-se a um lugar; o Esc
// fecha e o jogo volta. Com a bancada aberta por baixo, encher o estoque a atualiza na hora.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'painel-testes',
  description: 'O painel de testes do localhost: abre na tecla do console e cada aba muda o jogo de verdade.',
  needsGame: false,
  async run({ driver, shot, assert, log }) {
    const { page } = driver;
    const g = (fn, arg) => page.evaluate(fn, arg);
    const panelOpen = () => g(() => Boolean(document.getElementById('zh-dev')));
    const clickText = async (text) => {
      await page.locator('#zh-dev button', { hasText: text }).first().click();
      await sleep(250);
    };
    const tab = async (n) => { await page.keyboard.press(`Digit${n}`); await sleep(200); };
    const drain = async () => {
      for (let i = 0; i < 30; i += 1) {
        const st = await g(() => window.gameDebug.getState());
        if (!st?.dialogOpen && !st?.itemGetOpen && !st?.cutsceneActive) return;
        if (st.dialogOpen || st.itemGetOpen) await page.keyboard.press('z');
        await sleep(300);
      }
    };

    await page.addInitScript(() => {
      if (sessionStorage.getItem('painel')) return;
      sessionStorage.setItem('painel', '1');
      localStorage.setItem('zh.cozy.v1', JSON.stringify({ started: true, introSeen: true, day: 0, clock: 0.45, respawn: { worldX: 54, worldY: 51 } }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await sleep(1500);

    // ── A TECLA DO CONSOLE ABRE, E O JOGO PARA ────────────────────────────────────────────────────────────────────
    await page.keyboard.press('Backquote');
    await sleep(300);
    const paused = await g(() => window.gameDebug.camp.build().paused);
    assert('A tecla à esquerda do 1 abre o painel e o jogo para', (await panelOpen()) && paused, JSON.stringify({ paused }));
    const fonts = await g(() => {
      const px = (sel) => Math.min(...[...document.querySelectorAll(sel)].map((e) => parseFloat(getComputedStyle(e).fontSize)));
      const h = (sel) => Math.min(...[...document.querySelectorAll(sel)].map((e) => e.getBoundingClientRect().height));
      return { text: px('#zh-dev main p, #zh-dev main strong, #zh-dev main span'), button: px('#zh-dev button'), buttonH: h('#zh-dev main button') };
    });
    assert('O painel é legível: texto ≥ 15px, botões ≥ 17px e com 44px de alvo', fonts.text >= 15 && fonts.button >= 17 && fonts.buttonH >= 44, JSON.stringify(fonts));
    await shot('00-missoes', { note: 'O painel de testes: os pedidos dos vizinhos' });

    // ── CONCLUIR TODOS OS PEDIDOS ─────────────────────────────────────────────────────────────────────────────────
    await clickText('Concluir todos os pedidos');
    const quests = await g(() => window.gameDebug.quests());
    assert('Concluir todos os pedidos fecha os quatro', quests.every((q) => q.done), JSON.stringify(quests.map((q) => [q.dialog, q.done])));
    await shot('01-missoes-concluidas', { note: 'Todos os pedidos concluídos' });

    // ── ITENS ─────────────────────────────────────────────────────────────────────────────────────────────────────
    await tab(2);
    await clickText('Esvaziar as costas');
    await clickText('10');
    await page.locator('#zh-dev .zh-dev-item', { hasText: 'Graveto' }).first().click();
    await sleep(250);
    const wood = await g(() => window.gameDebug.items.count('wood'));
    assert('Itens: 10 gravetos nas costas', wood === 10, String(wood));
    await clickText('Todas as ferramentas');
    const tools = await g(() => ['axe', 'pickaxe', 'scythe', 'knife', 'shovel', 'bucket'].filter((k) => window.gameDebug.items.owns(k)));
    assert('Itens: todas as ferramentas ficam com o herói', tools.length === 6, JSON.stringify(tools));
    await shot('02-itens', { note: 'O painel de testes: pôr itens na mão' });

    // ── ACAMPAMENTO ───────────────────────────────────────────────────────────────────────────────────────────────
    await tab(3);
    await clickText('Encher a bancada');
    await clickText('Liberar todas as construções');
    await clickText('Cortar todo o mato do acampamento');
    const home = await g(() => window.gameDebug.camp.home());
    assert('Acampamento: a bancada cheia (99 de cada), a escada liberada, o mato cortado',
      Object.values(home.stock).every((n) => n === 99) && home.built.length >= 8 && home.grassStanding === 0,
      JSON.stringify({ stock: home.stock, built: home.built.length, grass: home.grassStanding }));
    await clickText('Pular as três noites');
    assert('Acampamento: pular as noites deixa a foice e as visitas ouvidas',
      await g(() => window.gameDebug.items.owns('scythe') && ['death/visit', 'death/visit2', 'death/visit3'].every((k) => window.gameDebug.dialog.heard(k))), '');
    await shot('03-acampamento', { note: 'O painel de testes: o acampamento' });

    // ── MUNDO ─────────────────────────────────────────────────────────────────────────────────────────────────────
    await tab(4);
    await clickText('Noite 21h');
    const night = await g(() => window.gameTime.get().clock);
    await clickText('Bancada (frente)');
    const at = await g(() => window.gameDebug.hero.at());
    assert('Mundo: a hora vai para as 21h e o herói vai para a frente da bancada', night === '21:00' && at.x === 54 && at.y === 45, JSON.stringify({ night, at }));
    await shot('04-mundo', { note: 'O painel de testes: a hora e o teleporte' });

    // ── FECHAR: O JOGO VOLTA, E A CHAVE DO JARDIM CHEGA ───────────────────────────────────────────────────────────
    await page.keyboard.press('Escape');
    await sleep(900);
    const back = await g(() => window.gameDebug.camp.build().paused);
    assert('O Esc fecha o painel e o jogo volta', !(await panelOpen()) && !back, '');
    await drain();
    await sleep(800);
    await drain();
    const key = await g(() => window.gameDebug.items.owns('key'));
    assert('Com os pedidos concluídos, a chave do jardim chega (como no jogo)', key, '');

    // ── POR CIMA DA BANCADA: O ESTOQUE ATUALIZA NA HORA, E A BANCADA CONTINUA PARADA ──────────────────────────────
    await g(() => { window.gameTime.set(0.45); window.gameDebug.items.clear(); window.gameDebug.hero.teleport(54, 45, 1, 0); });
    await sleep(500);
    await page.keyboard.press('z');
    await page.waitForFunction(() => window.gameDebug.camp.build().open, null, { timeout: 8000 });
    await sleep(500);
    await page.keyboard.press('Backquote');
    await sleep(300);
    await tab(3);
    await clickText('Zerar');
    const zero = await g(() => document.querySelector('#zh-build .zh-build-stock')?.textContent ?? '');
    await page.keyboard.press('Escape');
    await sleep(400);
    const still = await g(() => window.gameDebug.camp.build());
    assert('Por cima da bancada: zerar o estoque atualiza a tábua na hora, e fechar o painel deixa a bancada parada',
      /^[^1-9]*$/u.test(zero) && still.open && still.paused, JSON.stringify({ zero, open: still.open, paused: still.paused }));
    await page.keyboard.press('Escape');
    await sleep(600);

    // ── NO CELULAR: O PAINEL OCUPA A TELA E NADA SAI DELA ─────────────────────────────────────────────────────────
    await page.setViewportSize({ width: 390, height: 844 });
    await sleep(600);
    await page.keyboard.press('Backquote');
    await sleep(300);
    await tab(2);
    const fit = await g(() => {
      const r = document.querySelector('#zh-dev .zh-dev-panel').getBoundingClientRect();
      const wide = [...document.querySelectorAll('#zh-dev main *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).length;
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, wide };
    });
    assert('No celular, o painel cabe na tela e nada passa da beira', fit.left >= 0 && fit.right <= 391 && fit.top >= 0 && fit.bottom <= 845 && fit.wide === 0, JSON.stringify(fit));
    await shot('05-celular', { note: 'O painel de testes no celular' });
    await page.keyboard.press('Escape');
    await sleep(300);
    await page.setViewportSize({ width: 1440, height: 900 });
    await sleep(400);
    log(`  fontes: ${JSON.stringify(fonts)}`);
  },
};

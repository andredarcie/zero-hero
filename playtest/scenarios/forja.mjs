// A THEA SEM CASA E A FORJA VELHA (objects/OldForge.ts, scripts/forja-velha.mjs): a casa da astronauta saiu (ela caiu
// do céu; a busca dela é voltar para casa), e o forno e a bigorna viraram o que sobrou da oficina de um ferreiro que
// foi embora. Confere e fotografa.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'forja',
  description: 'A Thea sem casa, e a forja velha do ferreiro em volta do forno e da bigorna.',
  needsGame: false,
  async run({ driver, shot, assert }) {
    const { page } = driver;
    await page.addInitScript(() => {
      localStorage.setItem('zh.cozy.v1', JSON.stringify({ started: true, introSeen: true }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await sleep(1200);
    const put = (x, y, fx = 0, fy = -1) => page.evaluate(([px, py, dx, dy]) => {
      const s = window.__scene;
      s.playerWorld.worldX = px; s.playerWorld.worldY = py; s.movementController.interruptMovement(px, py); s.movementController.faceTo(dx, dy); s.streamChunks(true);
    }, [x, y, fx, fy]);
    await page.evaluate(() => { window.gameTime.setDay(2); window.gameTime.set(0.45); });

    const st = await page.evaluate(() => {
      const s = window.__scene;
      return {
        // Onde era a casa (36..38 × 7..8) e o banco (39,8): só o fundo da cratera (37,8) é sólido, o resto é chão.
        noHouse: [[36, 7], [37, 7], [38, 7], [36, 8], [38, 8], [39, 8]].every(([x, y]) => !s.isSolidForEntities(x, y)),
        crash: [[37, 8], [37, 6], [36, 9], [39, 7]].every(([x, y]) => s.isSolidForEntities(x, y)),
        ruins: [[46, 5], [45, 8], [45, 3]].every(([x, y]) => s.isSolidForEntities(x, y)),
        free: [[44, 5], [45, 6], [44, 7], [43, 6], [42, 7], [43, 8]].every(([x, y]) => !s.isSolidForEntities(x, y)),
        action: s.actionAt ? null : undefined,
      };
    });
    assert('Thea: não há mais casa, porta nem banco dela', st.noHouse, JSON.stringify(st));
    assert('Cratera: o fundo e os pedaços da nave barram o passo', st.crash, JSON.stringify(st));
    assert('Forja velha: os restos barram o passo', st.ruins, JSON.stringify(st));
    assert('Forja velha: o forno e a bigorna continuam livres dos quatro lados', st.free, JSON.stringify(st));

    // A PRIMEIRA FALA DA THEA: quem ela é e por que está aqui.
    await put(41, 6, 0, -1);
    await sleep(1500);
    await page.keyboard.press('z');
    await sleep(1500);
    const hello = await page.evaluate(() => document.body.innerText);
    await shot('00-thea-ola', { note: 'A primeira fala da Thea' });
    assert('Thea: a primeira fala conta que a nave caiu', /nave caiu/i.test(hello) || /ship crashed/i.test(hello), hello.slice(0, 200));
    // Até a conversa (e a entrega da picareta) acabar de vez.
    for (let i = 0; i < 80; i += 1) {
      const busy = await page.evaluate(() => window.__scene.dialogOpen || window.__scene.cutsceneActive);
      if (!busy && i > 3) break;
      await page.keyboard.press('z');
      await sleep(300);
    }
    // O "ganhou a picareta" fecha sozinho (ou com Z): espera ele sair da tela.
    await sleep(4000);
    for (let i = 0; i < 30 && await page.evaluate(() => window.__scene.dialogOpen || window.__scene.cutsceneActive); i += 1) {
      await page.keyboard.press('z');
      await sleep(300);
    }

    await put(37, 11, 0, -1);
    await sleep(2500);
    await shot('01-cratera', { note: 'A cratera onde a nave caiu, com os pedaços em volta, onde era a casa' });
    await put(40, 9, 0, -1);
    await sleep(2000);
    await shot('01b-acampamento-da-thea', { note: 'O acampamento da Thea, a cratera e a forja velha ao lado' });
    await put(44, 9, 0, -1);
    await sleep(2000);
    await shot('02-forja-velha', { note: 'O forno e a bigorna no piso de lajes, a chaminé caída, as ferramentas velhas' });
    await put(45, 4, 0, -1);
    await sleep(2000);
    await page.keyboard.press('z');
    await sleep(1200);
    const reading = await page.evaluate(() => !!window.__scene.dialogOpen);
    await shot('03-placa-da-forja', { note: 'Lendo a parede da forja: "A forja velha."' });
    assert('Forja velha: a parede se lê (Z abre a fala)', reading, String(reading));
  },
};

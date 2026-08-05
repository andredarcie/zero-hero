// O SAVE DA AVENTURA, e o contrato novo da morte: morrer NAO apaga mais nada — a mochila, as
// moedas e o mundo atravessam o restart, e o titulo passa a oferecer Continue.
//
// O cenario guarda os tres lados do contrato:
//   1. a mochila sobrevive a morte (o antigo `inventory.clear()` do create era o bug);
//   2. o retrato dorme no localStorage (`zh.adventure.v1`) — fechar o browser nao zera;
//   3. o titulo com save vira DUAS portas: Continue + Start over (e sem save continua UMA).
//
// Ele NAO afirma nada de fogueira/historia — isso pede um solve longo e flakea; o que este
// cenario custa sao ~20s e ele morre de proposito no primeiro minuto do jogo.

export default {
  name: 'salvamento',
  description: 'Morrer mantem a mochila; o save dorme no localStorage; o titulo ganha Continue.',
  needsGame: false,
  route: '/?play',
  async run({ driver, shot, assert, log }) {
    await driver.page.waitForFunction(
      () => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 14000 },
    );
    await driver.settle(800);

    // ── Um item na mochila, pela porta de autoria de sempre ──────────────────
    await driver.page.evaluate(() => { window.__scene.heldItem = 'pickaxe'; });
    await driver.walk('right', 1); // um passo: o chunk pisado entra no save
    await driver.settle(300);

    // ── A morte ──────────────────────────────────────────────────────────────
    log('Morrendo de proposito: a elegia roda e o restart hidrata do save');
    await driver.page.evaluate(() => {
      const s = window.__scene;
      s.playerHealth = 1;
      s.triggerDeath();
    });
    await driver.settle(5200); // fade (1500) + epitafio; >4800ms arma o skip por tecla
    await shot('morte', { note: 'A elegia da morte' });
    await driver.press('Enter', { count: 1, delay: 300, holdMs: 80 });
    await driver.page.waitForFunction(
      () => window.gameDebug?.getState()?.scene === 'game' && !window.__scene?.isDead,
      null, { timeout: 16000 },
    );
    await driver.settle(900);

    const after = await driver.page.evaluate(() => ({
      health: window.gameDebug?.getState()?.health ?? 0,
      hasPickaxe: window.__scene?.inventory?.has('pickaxe') ?? false,
      save: window.localStorage.getItem('zh.adventure.v1'),
    }));
    assert('O heroi acorda inteiro', after.health > 0, `health=${after.health}`);
    assert('A picareta SOBREVIVEU a morte (a mochila nao zera mais)',
      after.hasPickaxe, JSON.stringify(after));
    assert('O retrato dorme no localStorage (zh.adventure.v1)',
      typeof after.save === 'string' && after.save.includes('pickaxe'),
      String(after.save).slice(0, 120));
    await shot('acordou', { note: 'Acordou na fogueira com a mochila intacta' });

    // ── O titulo com save: DUAS portas ───────────────────────────────────────
    log('/ → o titulo agora oferece Continue + Start over');
    await driver.open('/');
    await driver.page.waitForFunction(
      () => (window.__game?.scene?.getScenes(true) ?? []).some((s) => s.scene.key === 'title'),
      null, { timeout: 14000 },
    );
    await driver.settle(900);
    const titleTexts = await driver.page.evaluate(
      () => (window.__game?.scene?.getScene('title')?.children?.list ?? [])
        .filter((o) => o.type === 'Text').map((o) => o.text),
    );
    assert('Com save, o titulo oferece Continue',
      titleTexts.includes('Continue'), JSON.stringify(titleTexts));
    assert('...e a porta discreta de recomecar',
      titleTexts.includes('Start over'), JSON.stringify(titleTexts));
    await shot('titulo-continue', { note: 'O titulo lembrando da aventura' });

    // ── Start over (tecla 2) apaga o retrato de verdade ──────────────────────
    log('Tecla 2 = Start over → o save some e o proximo titulo e uma porta so');
    await driver.press('2', { count: 1, delay: 300, holdMs: 80 });
    await driver.page.waitForFunction(
      () => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 16000 },
    );
    await driver.settle(600);
    await driver.open('/');
    await driver.page.waitForFunction(
      () => (window.__game?.scene?.getScenes(true) ?? []).some((s) => s.scene.key === 'title'),
      null, { timeout: 14000 },
    );
    await driver.settle(900);
    const cleanTexts = await driver.page.evaluate(
      () => (window.__game?.scene?.getScene('title')?.children?.list ?? [])
        .filter((o) => o.type === 'Text').map((o) => o.text),
    );
    assert('Sem save, o titulo volta a UMA porta',
      cleanTexts.includes('Play adventure') && !cleanTexts.includes('Continue'),
      JSON.stringify(cleanTexts));
  },
};

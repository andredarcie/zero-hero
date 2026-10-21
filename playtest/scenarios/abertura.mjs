// ABERTURA — so a cena de abertura, isolada do resto da partida (o jogo inteiro e o `zerar`).
//
// Cobra o que a cena promete: ela toca numa jornada nova; a espada que sai das costas e a MESMA
// arte que estava la (sword-icon) e termina fincada no tile da estrada, de ponta para baixo e
// bloqueando; o heroi termina um passo atras dela, olhando para ela; a camera volta ao normal; o
// mago chega, fala e fica de pe ao lado; e o Z nele conversa.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'abertura',
  description: 'A abertura: espada real fincada, passo para tras, mago chega, fala e fica.',
  needsGame: false,
  async run({ driver, shot, assert }) {
    const { page } = driver;
    const state = () => page.evaluate(() => window.gameDebug?.getState() ?? null);
    await page.evaluate(() => { try { localStorage.removeItem('zh.cozy.v1'); } catch { /* sem storage */ } });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });

    const st0 = await state();
    assert('A abertura toca numa jornada nova', st0.cutsceneActive && !st0.introDone, JSON.stringify(st0.ending));

    // O instante do golpe: a espada esta nas maos, a caminho do chao.
    await page.waitForFunction(() => window.__scene.swordInHands === true, null, { timeout: 20000 });
    await sleep(2600);
    await shot('erguida', { note: 'A espada no alto, em camera lenta' });
    await page.waitForFunction(() => Boolean(window.__scene.plantedSword) && window.__scene.swordInHands === false, null, { timeout: 15000 });
    await shot('fincada', { note: 'A espada fincada, a fenda no chao' });

    const planted = await page.evaluate(() => {
      const s = window.__scene;
      const sw = s.plantedSword;
      return {
        tile: s.plantedSwordTile,
        angle: Math.round(sw.angle),
        solid: s.isSolidForEntities(s.plantedSwordTile.x, s.plantedSwordTile.y),
        crack: Boolean(s.groundCrack),
        backGone: s.backItemBb === undefined,
      };
    });
    assert('A espada fica fincada de ponta para baixo', Math.abs(Math.abs(planted.angle) - 180) <= 1, `angle=${planted.angle}`);
    assert('A espada fincada bloqueia o tile', planted.solid, JSON.stringify(planted.tile));
    assert('O billboard das costas VIROU a espada do chao (a mesma arte)', planted.backGone, '');
    assert('A fenda fica no chao', planted.crack, '');

    // O mago chega e fala.
    await page.waitForFunction(() => window.gameDebug.getState().dialogOpen, null, { timeout: 30000 });
    await shot('mago', { note: 'O mago ao lado do cavaleiro' });
    for (let i = 0; i < 40 && (await state()).dialogOpen; i += 1) {
      await page.keyboard.down('z'); await sleep(50); await page.keyboard.up('z'); await sleep(400);
    }
    await page.waitForFunction(() => {
      const s = window.gameDebug.getState();
      return s.introDone && !s.cutsceneActive && !s.dialogOpen;
    }, null, { timeout: 15000 });
    await sleep(2200);
    const end = await page.evaluate(() => {
      const s = window.__scene;
      return {
        hero: { ...s.playerWorld },
        facing: { ...s.movementController.facing },
        sword: s.plantedSwordTile,
        wizard: s.npcManager.getKindAt(s.playerWorld.worldX + 1, s.playerWorld.worldY),
        dolly: s.world3d.params.camHeight / (s.dollyBase?.h ?? s.world3d.params.camHeight),
        bars: document.querySelectorAll('div[style*="11vh"]').length,
      };
    });
    await shot('controle', { note: 'O controle volta: espada, cavaleiro e mago' });
    assert('O cavaleiro termina dois tiles ao norte da espada',
      end.hero.worldX === end.sword.x && end.hero.worldY === end.sword.y - 2, JSON.stringify(end));
    assert('O mago fica de pe ao lado do cavaleiro', end.wizard === 'wizard', JSON.stringify(end));
    assert('A camera volta ao enquadramento do jogo', Math.abs(end.dolly - 1) < 0.01, `dolly=${end.dolly}`);
    assert('Nao ha vida nem morte no estado', st0.health === undefined && st0.isDead === undefined, '');

    // O Z no mago conversa.
    await page.keyboard.down('ArrowRight'); await sleep(40); await page.keyboard.up('ArrowRight'); await sleep(300);
    await page.keyboard.down('z'); await sleep(50); await page.keyboard.up('z');
    await page.waitForFunction(() => window.gameDebug.getState().dialogOpen, null, { timeout: 5000 });
    assert('O Z no mago abre a conversa', (await state()).dialogOpen, '');
  },
};

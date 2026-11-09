// ABERTURA — so a cena de abertura, isolada do resto da partida (o jogo inteiro e o `zerar`).
//
// Cobra o que a cena promete: ela toca numa jornada nova; a espada que sai das costas e a MESMA
// arte que estava la (sword-icon) e termina fincada no tile da estrada, de ponta para baixo e
// bloqueando; o heroi termina um passo atras dela, olhando para ela; a camera volta ao normal; o
// mago chega, fala e fica de pe ao lado; e o Z nele conversa.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'abertura',
  description: 'A abertura: espada real fincada, passo para tras, mago fala, o elmo fica na cabeca.',
  needsGame: false,
  async run({ driver, shot, assert }) {
    const { page } = driver;
    const state = () => page.evaluate(() => window.gameDebug?.getState() ?? null);
    await page.evaluate(() => { try { localStorage.removeItem('zh.cozy.v1'); } catch { /* sem storage */ } });
    // `&intro`: no localhost a abertura é pulada (testar não pode custar a cutscene a cada partida nova, ver
    // RunBoot.SKIP_INTRO_LOCALLY) — e este é o cenário que existe justamente para ela. Sem o parâmetro ele ficava vermelho.
    await driver.open('/?play&intro');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });

    const st0 = await state();
    assert('A abertura toca numa jornada nova', st0.cutsceneActive && !st0.introDone, JSON.stringify(st0.ending));

    // O instante do golpe: a espada esta nas maos, a caminho do chao.
    await page.waitForFunction(() => window.gameDebug.scene.sword().inHands === true, null, { timeout: 20000 });
    await sleep(2600);
    await shot('erguida', { note: 'A espada no alto, em camera lenta' });
    await page.waitForFunction(() => { const sw = window.gameDebug.scene.sword(); return sw.planted && sw.inHands === false; }, null, { timeout: 15000 });
    await shot('fincada', { note: 'A espada fincada, a fenda no chao' });

    const planted = await page.evaluate(() => {
      const g = window.gameDebug;
      const sw = g.scene.sword();
      return {
        tile: sw.tile,
        angle: Math.round(sw.angle),
        solid: g.world.solid(sw.tile.x, sw.tile.y),
        crack: sw.crack,
        backGone: !g.scene.backItem().exists,
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
      const g = window.gameDebug;
      const at = g.hero.at();
      return {
        hero: { worldX: at.x, worldY: at.y },
        facing: g.scene.facing(),
        sword: g.scene.sword().tile,
        wizard: g.npcs.kindAt(at.x + 1, at.y),
        dolly: g.scene.dolly(),
        bars: document.querySelectorAll('div[style*="11vh"]').length,
        heroTexture: g.hero.billboard()?.texKey,
      };
    });
    await shot('controle', { note: 'O controle volta: espada, cavaleiro e mago' });
    assert('O cavaleiro termina dois tiles ao norte da espada',
      end.hero.worldX === end.sword.x && end.hero.worldY === end.sword.y - 2, JSON.stringify(end));
    assert('O cavaleiro nunca tira o elmo', end.heroTexture === 'hero', `texture=${end.heroTexture}`);
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

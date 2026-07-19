// The menu flow, end to end: Language → the new Title (two buttons, no reveal effect) → the
// level list → play a level → the level-aware pause menu.
//
// The old title assembled itself one word per water drop and keying past it was flaky; the new
// one shows the title and the credit straight away and offers two buttons. This scenario drives
// the whole chain with real keypresses and asserts each screen is what it should be — including
// that picking a level boots THAT level, and that pausing inside a level offers "back to levels",
// "restart" and "quit to menu".

const activeScenes = (driver) => driver.page.evaluate(
  () => (window.__game?.scene?.getScenes(true) ?? []).map((s) => s.scene.key),
);

const sceneTexts = (driver, key) => driver.page.evaluate(
  (k) => {
    const s = window.__game?.scene?.getScene(k);
    return (s?.children?.list ?? []).filter((o) => o.type === 'Text').map((o) => o.text);
  },
  key,
);

const waitScene = (driver, key, timeout = 9000) => driver.page.waitForFunction(
  (k) => (window.__game?.scene?.getScenes(true) ?? []).some((s) => s.scene.key === k),
  key,
  { timeout },
);

const pauseButtons = (driver) => driver.page.evaluate(() => {
  const root = document.getElementById('zh-pause-root');
  return root ? Array.from(root.querySelectorAll('.zh-pause-btn'), (b) => b.textContent) : null;
});

export default {
  name: 'menu-flow',
  description: 'Language → new title (two buttons) → level list → play a level → level-aware pause.',
  needsGame: false,
  route: '/',
  async run({ driver, shot, assert, log }) {
    // ── Language comes first now (so the title's buttons are localized) ──────
    await waitScene(driver, 'language');
    await driver.settle(800); // fade-in + the input-arm delay
    assert('Language is the first screen', (await activeScenes(driver)).includes('language'),
      JSON.stringify(await activeScenes(driver)));
    await shot('language', { state: {} });

    log('Pick PT-BR (key 1) → the new title');
    await driver.press('1', { count: 1, delay: 400, holdMs: 80 });
    await waitScene(driver, 'title');
    await driver.settle(900); // title fade-in 500 + arm 300

    const titleTexts = await sceneTexts(driver, 'title');
    assert('The title shows both buttons, no reveal effect',
      titleTexts.includes('Jogar aventura') && titleTexts.includes('Jogar levels'),
      JSON.stringify(titleTexts));
    assert('The title and credit are shown straight away',
      titleTexts.some((t) => t.includes('ZERO')) && titleTexts.some((t) => t.includes('ANDRÉ')),
      JSON.stringify(titleTexts));
    await shot('title', { state: {} });

    log('Press 2 → Jogar levels → the level list');
    await driver.press('2', { count: 1, delay: 400, holdMs: 80 });
    await waitScene(driver, 'levelselect');
    await driver.settle(900);

    const listTexts = await sceneTexts(driver, 'levelselect');
    assert('The list shows the level from the manifest',
      listTexts.some((t) => t.includes('A Espada na Pedra')),
      JSON.stringify(listTexts));
    await shot('level-list', { state: {} });

    log('Enter → play the first level (level-1)');
    await driver.press('Enter', { count: 1, delay: 400, holdMs: 80 });
    await driver.page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 14000 });
    await driver.settle(1000);
    const st = await driver.getState();
    assert('Picking a level boots the GameScene into THAT level',
      st.scene === 'game' && st.player.worldX === 6 && st.player.worldY === 7 && st.litFires === 2,
      JSON.stringify({ scene: st.scene, player: st.player, litFires: st.litFires }));
    await shot('level-playing', { note: 'Level 1 launched from the list' });

    // ── The pause menu is level-aware ────────────────────────────────────────
    log('ESC → the level-aware pause menu');
    await driver.press('Escape', { count: 1, delay: 300, holdMs: 80 });
    await driver.settle(500);
    const pause = await pauseButtons(driver);
    assert('Pause is open', pause !== null, 'no pause root in the DOM');
    assert('Pause offers back-to-levels, restart and quit-to-menu',
      pause.includes('Voltar aos levels') && pause.includes('Reiniciar') && pause.includes('Sair para o título'),
      JSON.stringify(pause));
    await shot('pause-level', { note: 'Level pause: voltar aos levels / reiniciar / sair', state: {} });

    log('“Voltar aos levels” returns to the list');
    await driver.page.evaluate(() => {
      const root = document.getElementById('zh-pause-root');
      const btn = Array.from(root.querySelectorAll('.zh-pause-btn')).find((b) => b.textContent === 'Voltar aos levels');
      btn?.click();
    });
    await waitScene(driver, 'levelselect');
    assert('Back at the level list', (await activeScenes(driver)).includes('levelselect'),
      JSON.stringify(await activeScenes(driver)));
    await shot('back-to-list', { state: {} });
  },
};

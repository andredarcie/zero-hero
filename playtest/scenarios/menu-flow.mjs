// O menu inteiro, que hoje e uma tela so: Title → o mundo. Sem tela de idioma (o jogo e so em
// ingles) e sem intro (a aventura comeca andando).
//
// Este cenario existe pra guardar exatamente o que foi CORTADO, e nao so o que ficou: cada corte
// aqui e uma cena que ainda esta no historico do repo e que um refactor distraido reintroduz.
// Entao ele afirma que 'language' e 'intro' nao existem NEM COMO CENA REGISTRADA — checar so a
// tela que aparece deixaria passar um `scene.start('intro')` esquecido em qualquer botao.
//
// A segunda metade guarda o menu de pausa: um level ainda tem a porta de volta pra lista (que o
// titulo nao tem mais), e a pausa NAO tem mais seletor de idioma.

const activeScenes = (driver) => driver.page.evaluate(
  () => (window.__game?.scene?.getScenes(true) ?? []).map((s) => s.scene.key),
);

const registeredScenes = (driver) => driver.page.evaluate(
  () => (window.__game?.scene?.scenes ?? []).map((s) => s.scene.key),
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
  description: 'Title (uma porta so) → o mundo na hora; sem idioma, sem intro, pausa sem idioma.',
  needsGame: false,
  route: '/',
  async run({ driver, shot, assert, log }) {
    // ── O titulo e a PRIMEIRA tela ───────────────────────────────────────────
    await waitScene(driver, 'title');
    await driver.settle(900); // fade-in 500 + o delay que arma o input

    const registered = await registeredScenes(driver);
    assert('A tela de idioma nao existe mais (nem registrada)',
      !registered.includes('language'), JSON.stringify(registered));
    assert('A intro nao existe mais (nem registrada)',
      !registered.includes('intro'), JSON.stringify(registered));

    const titleTexts = await sceneTexts(driver, 'title');
    // UMA PORTA SO, e o que se conta e a QUANTIDADE de texto na tela: titulo, credito e o rotulo
    // do unico botao. O assert antigo procurava a string "Play adventure", que morreu quando a
    // porta passou a abrir o CONSTRUTOR DE MUNDO ("Build a world") — um teste que fixa o rotulo
    // guarda a traducao, e a lei aqui e a arquitetura do menu: sem atalho para levels nem para o
    // explorador, e nenhuma segunda porta.
    assert('O titulo mostra UMA porta so, em ingles',
      titleTexts.length === 3
      && !titleTexts.some((t) => /levels|explorer|aventura/i.test(t)),
      JSON.stringify(titleTexts));
    assert('Titulo e credito aparecem de cara',
      titleTexts.some((t) => t.includes('ZERO')) && titleTexts.some((t) => t.includes('ANDRÉ')),
      JSON.stringify(titleTexts));
    await shot('title', { state: {} });

    log('Enter → o mundo, direto (a intro nao entra no meio)');
    await driver.press('Enter', { count: 1, delay: 400, holdMs: 80 });
    await driver.page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 14000 });
    await driver.settle(600);
    const scenes = await activeScenes(driver);
    assert('A aventura cai na GameScene sem passar por outra tela',
      scenes.includes('game') && !scenes.includes('title'), JSON.stringify(scenes));
    await shot('adventure', { note: 'A aventura, um Enter depois do titulo' });

    // ── A pausa nao tem mais idioma ──────────────────────────────────────────
    log('ESC → a pausa da aventura');
    await driver.press('Escape', { count: 1, delay: 300, holdMs: 80 });
    await driver.settle(500);
    const pause = await pauseButtons(driver);
    assert('A pausa abriu', pause !== null, 'nao ha zh-pause-root no DOM');
    const langBtns = await driver.page.evaluate(
      () => document.querySelectorAll('#zh-pause-root .zh-pause-lang').length,
    );
    assert('A pausa nao oferece idioma', langBtns === 0, `${langBtns} botoes de idioma`);
    assert('A pausa esta em ingles', pause.includes('Resume') && pause.includes('Restart'),
      JSON.stringify(pause));
    await shot('pause-adventure', { note: 'Pausa da aventura: sem seletor de idioma', state: {} });

    // ── Os levels perderam a porta do titulo, nao a existencia ───────────────
    log('/?level=1 ainda boota um level, e a pausa dele volta pra lista');
    await driver.open('/?level=1');
    await driver.page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 14000 });
    // O CARTAO DE ABERTURA DO LEVEL segura a pausa: `openPauseMenu` recusa enquanto ele esta na
    // tela (nenhuma tela modal pode nascer por cima de outra). Um `settle` fixo era uma aposta na
    // duracao da animacao — a espera certa e pelo proprio estado.
    await driver.page.waitForFunction(
      () => window.gameDebug?.getState()?.levelIntroOpen === false, null, { timeout: 14000 },
    );
    await driver.settle(400);
    await driver.press('Escape', { count: 1, delay: 300, holdMs: 80 });
    await driver.settle(500);
    const levelPause = await pauseButtons(driver);
    assert('A pausa de um level oferece a volta pra lista',
      Array.isArray(levelPause) && levelPause.includes('Back to levels'),
      JSON.stringify(levelPause));
    await shot('pause-level', { note: 'Pausa de level: a lista ainda tem porta aqui', state: {} });
  },
};

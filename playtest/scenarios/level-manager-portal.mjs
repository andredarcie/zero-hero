// /LAB LEVEL MANAGER + PORTAL: exercises the whole authored-file lifecycle without leaving
// fixtures behind. Two temporary levels are created through the visible modal, one is renamed,
// the first is edited/saved with a purple pixel-art billboard portal, and stepping through it
// loads the second.
// Both files are then deleted through the same UI (the finally block is only a crash-safe broom).

const editorReady = (page) => page.waitForFunction(() => {
  try {
    return JSON.parse(window.render_game_to_text?.() ?? '{}').mode === 'editor'
      && Boolean(window.__scene?.store);
  } catch {
    return false;
  }
}, null, { timeout: 15000 });

const currentLevel = (page) => Number(new URL(page.url()).searchParams.get('level'));

const openManager = async (page) => {
  await page.locator('#zh-level-manager-open').click();
  await page.locator('#zh-level-list .zh-level-row').first().waitFor({ timeout: 8000 });
};

const createLevel = async (page, name) => {
  await openManager(page);
  await page.locator('#zh-level-create-name').fill(name);
  await page.locator('#zh-level-create').click();
  await page.waitForURL(/\/lab\?level=\d+$/u, { timeout: 15000 });
  await editorReady(page);
  return currentLevel(page);
};

const removeThroughUi = async (page, level) => {
  await openManager(page);
  const row = page.locator(`.zh-level-row[data-level="${level}"]`);
  await row.locator('[data-action="delete"]').click();
  await page.locator(`.zh-level-row[data-level="${level}"] [data-action="delete"]`).click();
  await page.waitForFunction((deleted) => {
    const n = Number(new URL(window.location.href).searchParams.get('level'));
    return n !== deleted && Boolean(window.__scene?.store);
  }, level, { timeout: 15000 });
};

export default {
  name: 'level-manager-portal',
  description: 'Lab cria/lista/renomeia/abre/apaga levels; portal roxo avanca pelo manifesto.',
  needsGame: false,
  route: '/lab?level=1',
  async run({ driver, shot, assert, log }) {
    const created = [];
    try {
      await editorReady(driver.page);
      const initialLevels = await driver.page.evaluate(() => fetch('/api/lab-levels', {
        cache: 'no-store',
      }).then((r) => r.json()));
      const expectedReturnLevel = Math.max(...initialLevels.map((entry) => entry.level));

      log('LAB: cria dois levels vazios pelo modal visivel');
      const first = await createLevel(driver.page, 'QA Portal Origem');
      created.push(first);
      const second = await createLevel(driver.page, 'QA Portal Destino');
      created.push(second);
      assert('a criacao usa numeros sequenciais distintos', second > first,
        JSON.stringify({ first, second }));
      const createdSummaries = await driver.page.evaluate(() => fetch('/api/lab-levels', { cache: 'no-store' }).then((r) => r.json()));
      const createdStarts = createdSummaries
        .filter((entry) => [first, second].includes(entry.level))
        .map((entry) => ({ level: entry.level, playerStart: entry.playerStart }));
      assert('todo level novo ja nasce com um Ponto Inicial colocado no centro',
        createdStarts.length === 2 && createdStarts.every((entry) => entry.playerStart?.worldX === 6
          && entry.playerStart?.worldY === 6), JSON.stringify(createdStarts));
      assert('o editor expoe a ferramenta Ponto Inicial para reposicionar o inicio',
        await driver.page.getByRole('button', { name: /Ponto Inicial/u }).count() === 1);

      log('LAB: lista todos, renomeia o destino e abre novamente a origem');
      await openManager(driver.page);
      const listed = await driver.page.locator('#zh-level-list .zh-level-row').evaluateAll((rows) => rows.map((row) => ({
        level: Number(row.dataset.level),
        text: row.textContent,
      })));
      assert('a lista mostra o level base e todos os levels criados',
        listed.some((entry) => entry.level === 1)
          && listed.some((entry) => entry.level === first)
          && listed.some((entry) => entry.level === second),
        JSON.stringify(listed));
      await shot('gerenciador-lista-levels');

      await driver.page.locator(`.zh-level-row[data-level="${second}"] [data-action="rename"]`).click();
      await driver.page.locator(`#zh-level-rename-${second}`).fill('QA Destino Renomeado');
      await driver.page.locator(`.zh-level-row[data-level="${second}"] [data-action="rename"]`).click();
      await driver.page.waitForFunction((name) => window.__scene?.store?.world?.meta?.name === name,
        'QA Destino Renomeado', { timeout: 15000 });
      assert('renomear atualiza o nome persistido do level',
        await driver.page.evaluate(() => window.__scene.store.world.meta.name === 'QA Destino Renomeado'));

      await openManager(driver.page);
      await driver.page.locator(`.zh-level-row[data-level="${first}"] [data-action="open"]`).click();
      await driver.page.waitForFunction((level) => Number(new URL(window.location.href).searchParams.get('level')) === level
        && Boolean(window.__scene?.store), first, { timeout: 15000 });
      assert('Abrir troca o arquivo editado no /lab', currentLevel(driver.page) === first,
        driver.page.url());

      log('EDITOR: modifica e salva a origem com spawn e Portal de Saida');
      const authored = await driver.page.evaluate(() => {
        const store = window.__scene.store;
        store.setSpawn(5, 6);
        store.eraseEntitiesAt(6, 6);
        store.setCell('upper', 6, 6, null);
        store.setCell('collision', 6, 6, false);
        store.placeEntity({ list: 'props', type: 'levelPortal', worldX: 6, worldY: 6 });
        return store.allEntities().find((entity) => entity.type === 'levelPortal');
      });
      assert('o editor persiste o novo prop sem bloquear o tile', authored?.type === 'levelPortal',
        JSON.stringify(authored));
      assert('o Ponto Inicial movido continua valido antes de salvar',
        await driver.page.evaluate(() => window.__scene.store.startPointErrors().length === 0));
      const blockedStartErrors = await driver.page.evaluate(() => {
        const store = window.__scene.store;
        const start = store.spawn;
        store.setCell('collision', start.worldX, start.worldY, true);
        const errors = store.startPointErrors();
        store.setCell('collision', start.worldX, start.worldY, false);
        return errors;
      });
      assert('um Ponto Inicial sobre colisao e rejeitado pela validacao obrigatoria',
        blockedStartErrors.some((message) => message.includes('sem colisao')), JSON.stringify(blockedStartErrors));
      await driver.page.getByRole('button', { name: /Ponto Inicial/u }).click();
      await shot('editor-ponto-inicial-e-portal');
      await driver.page.getByRole('button', { name: 'Salvar', exact: true }).click();
      await driver.page.waitForFunction(() => window.__scene?.store?.world?.props?.some(
        (prop) => prop.type === 'levelPortal' && prop.worldX === 6 && prop.worldY === 6,
      ) && window.__scene.store.dirty === false, null, { timeout: 15000 });

      log('JOGO: abre a origem salva e inspeciona o portal 2D pixel-art em billboard');
      await driver.press('p');
      await driver.page.waitForFunction(() => window.gameDebug?.getState()?.activeLevel !== null, null, {
        timeout: 15000,
      });
      let state = await driver.getState();
      const portal = state.levelPortals.find((item) => item.worldX === 6 && item.worldY === 6);
      assert('o portal nasce no runtime, caminhavel e ainda nao ativado',
        portal?.activated === false && state.activeLevel === first,
        JSON.stringify(state));
      // A apresentacao autoral do level bloqueia input por design. Espere o ciclo inteiro antes
      // de fotografar a arte e atravessar o portal, ou o teste mede o overlay em vez do prop.
      await driver.page.waitForFunction(() => window.gameDebug?.getState()?.levelIntroOpen === false,
        null, { timeout: 15000 });
      await driver.settle(250);
      const firstAnimatedState = await driver.getState();
      const firstAnimatedPortal = firstAnimatedState.levelPortals[0];
      await shot('portal-roxo-billboard');
      await driver.settle(220);
      const secondAnimatedState = await driver.getState();
      const secondAnimatedPortal = secondAnimatedState.levelPortals[0];
      assert('o vortice troca de frame e mantem particulas pixeladas visiveis',
        firstAnimatedPortal?.frame !== secondAnimatedPortal?.frame
          && firstAnimatedPortal?.visibleParticles > 0
          && secondAnimatedPortal?.visibleParticles > 0,
        JSON.stringify({ first: firstAnimatedPortal, second: secondAnimatedPortal }));
      await shot('portal-roxo-frame-seguinte');

      log('JOGO: um passo para dentro do portal carrega o proximo level do manifesto');
      await driver.walk('right', 1);
      await driver.page.waitForFunction((next) => {
        const snapshot = window.gameDebug?.getState();
        return snapshot?.activeLevel === next && snapshot.levelTransitioning === false;
      }, second, { timeout: 15000 });
      state = await driver.getState();
      assert('entrar no portal avanca para o proximo level, mesmo com nomes livres',
        state.activeLevel === second && state.levelPortals.length === 0,
        JSON.stringify(state));
      await shot('portal-carregou-proximo-level');

      log('LAB: apaga destino e origem pelo modal com confirmacao em dois cliques');
      await driver.open(`/lab?level=${second}`);
      await editorReady(driver.page);
      await removeThroughUi(driver.page, second);
      assert('apagar o atual abre o level anterior disponivel', currentLevel(driver.page) === first,
        driver.page.url());
      await removeThroughUi(driver.page, first);
      assert('apos apagar os temporarios o lab volta ao ultimo level que ja existia',
        currentLevel(driver.page) === expectedReturnLevel, driver.page.url());
      const remaining = await driver.page.evaluate(() => fetch('/api/lab-levels', { cache: 'no-store' }).then((r) => r.json()));
      assert('os arquivos apagados somem da lista e do manifesto',
        !remaining.some((entry) => created.includes(entry.level)), JSON.stringify(remaining));

      log('OK: CRUD real, lista sincronizada, autoria do prop e progressao ponta a ponta.');
    } finally {
      // Crash-safe cleanup: a falha de uma assercao nunca deixa levels QA no workspace do usuario.
      const origin = new URL(driver.page.url()).origin;
      for (const level of [...created].reverse()) {
        await driver.page.request.delete(`${origin}/api/lab-levels/${level}`).catch(() => undefined);
      }
    }
  },
};

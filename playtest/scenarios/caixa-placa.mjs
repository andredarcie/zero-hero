// Caixa + placa + variavel global, percorrendo a autoria no editor e o circuito no runtime.
// O corredor controlado fica assim: heroi(5) -> caixa(6) -> placa(7) -> livre(8) -> rocha(9).
// Nao existe tecla de uso: cada transicao abaixo e exclusivamente uma tentativa de andar.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default {
  name: 'caixa-placa',
  description: 'Caixote empurravel e placa de pressao vinculada a variavel global.',
  needsGame: false,
  route: '/lab',
  async run({ driver, shot, assert, log }) {
    await driver.settle(2500);

    log('EDITOR: cria a variavel global pela interface');
    await driver.page.getByRole('button', { name: /Variaveis/ }).click();
    await driver.page.getByPlaceholder('ex.: porta_norte_aberta').fill('circuito_teste');
    await driver.page.getByRole('button', { name: '+ Criar' }).click();
    await driver.page.getByRole('button', { name: 'Aplicar', exact: true }).click();

    log('EDITOR: seleciona a placa e vincula circuito_teste no seletor contextual');
    await driver.page.evaluate(() => {
      const scene = window.__scene;
      scene.uiState.tab = 'props';
      scene.uiState.tool = 'entity';
      scene.uiState.entity = { list: 'props', type: 'pressurePlate' };
      scene.ui.syncFromState();
    });
    const variableSelect = driver.page.locator('.zh-field').filter({ hasText: 'Variavel global' }).locator('select');
    await variableSelect.selectOption('circuito_teste');

    log('EDITOR: limpa um corredor, coloca placa/caixa/rocha e usa o pincel real para a placa');
    const authored = await driver.page.evaluate(() => {
      const scene = window.__scene;
      const store = scene.store;
      store.beginStroke();
      for (let y = 5; y <= 7; y += 1) {
        for (let x = 4; x <= 10; x += 1) {
          store.eraseEntitiesAt(x, y);
          store.setCell('upper', x, y, null);
          store.setCell('collision', x, y, false);
        }
      }
      store.commitStroke();
      store.setSpawn(5, 6);
      scene.placeSelectedEntity(7, 6);
      store.placeEntity({ list: 'props', type: 'woodenCrate', worldX: 6, worldY: 6 });
      store.placeEntity({ list: 'props', type: 'rock', worldX: 9, worldY: 6 });
      const plate = store.allEntities().find((e) => e.list === 'props' && e.type === 'pressurePlate' && e.worldX === 7 && e.worldY === 6);
      return { variables: store.globalVariables, plate };
    });
    assert('a variavel global foi criada no editor', authored.variables.circuito_teste === false, JSON.stringify(authored.variables));
    assert('a placa salva seu vinculo no prop', authored.plate?.variable === 'circuito_teste', JSON.stringify(authored.plate));
    await shot('editor-vinculo');

    log('LAB: joga o mundo editado em memoria');
    await driver.press('p');
    await driver.page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 15000 });
    await driver.settle(1800);

    let state = await driver.getState();
    assert('caixote e placa existem no runtime', state.crates.length === 1 && state.pressurePlates.some((p) => p.worldX === 7 && p.worldY === 6));
    assert('circuito com placa livre inicia falso', state.globalVariables.circuito_teste === false, JSON.stringify(state.globalVariables));

    log('CAIXA: andar contra ela empurra para cima da placa');
    await driver.walk('right');
    state = await driver.getState();
    assert('a caixa foi empurrada de (6,6) para (7,6)', state.crates[0]?.worldX === 7 && state.crates[0]?.worldY === 6, JSON.stringify(state.crates));
    assert('caixa pressiona a placa e liga a variavel', state.pressurePlates[0]?.pressed === true && state.globalVariables.circuito_teste === true, JSON.stringify(state));
    assert('mantendo a direcao, o heroi ocupa o tile que a caixa liberou', state.player.worldX === 6 && state.player.worldY === 6, JSON.stringify(state.player));
    await shot('caixa-na-placa');

    log('CAIXA: entra no espaco liberado e empurra a caixa para fora da placa');
    await driver.walk('right', 2);
    state = await driver.getState();
    assert('a caixa avancou para (8,6)', state.crates[0]?.worldX === 8 && state.crates[0]?.worldY === 6, JSON.stringify(state.crates));
    assert('a caixa saiu, mas o heroi que a seguiu mantem a placa ligada', state.player.worldX === 7 && state.globalVariables.circuito_teste === true && state.pressurePlates[0]?.pressed === true, JSON.stringify(state));

    await driver.walk('left');
    state = await driver.getState();
    assert('sem caixa nem heroi, a placa desliga a variavel', state.player.worldX === 6 && state.globalVariables.circuito_teste === false, JSON.stringify(state));

    log('HEROI: pisa na placa e tenta empurrar a caixa contra a rocha');
    await driver.walk('right');
    state = await driver.getState();
    assert('heroi em cima da placa liga o circuito', state.player.worldX === 7 && state.globalVariables.circuito_teste === true, JSON.stringify(state));
    await driver.walk('right');
    state = await driver.getState();
    assert('caixa bloqueada pela rocha nao atravessa nem sobrepoe', state.crates[0]?.worldX === 8 && state.player.worldX === 7, JSON.stringify(state));
    await driver.walk('left');
    state = await driver.getState();
    assert('heroi saiu: circuito volta a falso', state.player.worldX === 6 && state.globalVariables.circuito_teste === false, JSON.stringify(state));

    log('INIMIGO: um morto-vivo nasce sobre a placa');
    await driver.page.evaluate(() => window.__scene.enemyManager.spawnUndead(7, 6));
    await sleep(250);
    state = await driver.getState();
    assert('inimigo tambem pressiona e liga a mesma variavel', state.pressurePlates[0]?.pressed === true && state.globalVariables.circuito_teste === true, JSON.stringify(state));
    await shot('inimigo-na-placa');

  },
};

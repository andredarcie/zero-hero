// Roda d'agua: autoria -> corrente -> inercia -> energia -> consumidor -> drenagem.
//
// Layout controlado:
//   roda-no-rio (6,6)       item (8,6) -> braco (9,6) -> saida (10,6)
//   agua          (6,7)
//
// A roda e 3D, solida e ocupa o proprio tile de agua. Ela so gera com esse tile cheio e o rio
// continuando ortogonalmente. O braco usa a mesma variavel, provando um consumidor real.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default {
  name: 'roda-agua',
  description: "Roda d'agua acelera, energiza um braco e desacelera quando o rio drena.",
  needsGame: false,
  route: '/lab',
  async run({ driver, shot, assert, log }) {
    await driver.settle(2500);

    log('EDITOR: cria o circuito energia_moinho');
    await driver.page.getByRole('button', { name: /Variaveis/ }).click();
    await driver.page.getByPlaceholder('ex.: porta_norte_aberta').fill('energia_moinho');
    await driver.page.getByRole('button', { name: '+ Criar' }).click();
    await driver.page.getByRole('button', { name: 'Aplicar', exact: true }).click();

    log("EDITOR: seleciona a roda d'agua e vincula sua saida de energia");
    await driver.page.evaluate(() => {
      const scene = window.__scene;
      scene.uiState.tab = 'props';
      scene.uiState.tool = 'entity';
      scene.uiState.entity = { list: 'props', type: 'waterWheel' };
      scene.ui.syncFromState();
    });
    await driver.page.locator('.zh-field').filter({ hasText: 'Saida de energia' })
      .locator('select').selectOption('energia_moinho');

    log('EDITOR: limpa a oficina, coloca rio, roda, braco alimentado e uma pedra na entrada');
    const authored = await driver.page.evaluate(() => {
      const scene = window.__scene;
      const store = scene.store;
      store.beginStroke();
      for (let y = 4; y <= 8; y += 1) {
        for (let x = 4; x <= 11; x += 1) {
          store.eraseEntitiesAt(x, y);
          store.setCell('upper', x, y, null);
          store.setCell('collision', x, y, false);
        }
      }
      store.commitStroke();
      store.setSpawn(5, 7);

      // O pincel recusa terreno seco. Depois criamos o rio e usamos o mesmo pincel real para
      // provar que a roda substitui a agua no proprio tile sem perder a semantica hidraulica.
      scene.placeSelectedEntity(5, 5);
      const rejectedDryWheel = !store.entitiesAt(5, 5)
        .some((entity) => entity.list === 'props' && entity.type === 'waterWheel');
      store.placeEntity({ list: 'props', type: 'water', worldX: 6, worldY: 6 });
      store.placeEntity({ list: 'props', type: 'water', worldX: 6, worldY: 7 });
      scene.placeSelectedEntity(6, 6);

      // O mesmo propVariable agora alimenta o consumidor. O braco aponta leste: tira de (8,6)
      // e entrega em (10,6), atravessando o proprio corpo solido em (9,6).
      scene.uiState.entity = { list: 'props', type: 'inserter' };
      scene.uiState.propDir = 1;
      scene.placeSelectedEntity(9, 6);
      store.placeEntity({ list: 'pickups', type: 'stone', worldX: 8, worldY: 6 });

      const props = store.allEntities().filter((e) => e.list === 'props');
      return {
        wheel: props.find((e) => e.type === 'waterWheel' && e.worldX === 6 && e.worldY === 6),
        arm: props.find((e) => e.type === 'inserter' && e.worldX === 9 && e.worldY === 6),
        rejectedDryWheel,
        wheelReplacedWater: !props.some((e) => e.type === 'water' && e.worldX === 6 && e.worldY === 6),
        warnings: store.validate(),
      };
    });
    assert('o editor recusa roda em terreno seco', authored.rejectedDryWheel === true, JSON.stringify(authored));
    assert('a roda grava a saida energia_moinho', authored.wheel?.variable === 'energia_moinho', JSON.stringify(authored));
    assert('o braco grava a alimentacao energia_moinho', authored.arm?.variable === 'energia_moinho', JSON.stringify(authored));
    assert('a roda substitui a agua no proprio tile', authored.wheelReplacedWater === true, JSON.stringify(authored));
    assert("a roda tem continuidade e passa a validacao hidraulica", !authored.warnings.some((w) => w.includes("roda(s) d'agua sem continuidade")), authored.warnings.join(' | '));
    await shot('roda-editor');

    log('LAB: inicia a oficina; o rotor deve partir parado e ganhar velocidade, nao ligar instantaneamente');
    await driver.press('p');
    await driver.page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 15000 });

    let state = await driver.getState();
    const wheelAtBoot = state.waterWheels.find((wheel) => wheel.worldX === 6 && wheel.worldY === 6);
    const armAtBoot = state.inserters.find((arm) => arm.worldX === 9 && arm.worldY === 6);
    assert('roda e braco existem no runtime', Boolean(wheelAtBoot && armAtBoot), JSON.stringify(state));
    assert('o rio foi detectado como corrente', wheelAtBoot?.hasFlow === true, JSON.stringify(wheelAtBoot));
    assert('o dinamo nasce abaixo do limiar, sem energia instantanea', wheelAtBoot?.generating === false && state.globalVariables.energia_moinho === false, JSON.stringify(wheelAtBoot));
    assert('o braco vinculado nasce desligado', armAtBoot?.powered === false, JSON.stringify(armAtBoot));

    await sleep(260);
    state = await driver.getState();
    const starting = state.waterWheels.find((wheel) => wheel.worldX === 6 && wheel.worldY === 6);
    assert('a roda esta acelerando gradualmente', starting?.speed > 0.05 && starting.speed < 0.65, JSON.stringify(starting));
    assert('o rotor 3D mudou de angulo continuamente', Math.abs(starting?.rotation ?? 0) > 0.01, JSON.stringify(starting));
    await shot('roda-partida');

    await driver.page.waitForFunction(() => {
      const stateNow = window.gameDebug?.getState();
      return stateNow?.waterWheels?.some((wheel) => wheel.worldX === 6 && wheel.generating)
        && stateNow?.globalVariables?.energia_moinho === true;
    }, null, { timeout: 5000 });
    state = await driver.getState();
    const powered = state.waterWheels.find((wheel) => wheel.worldX === 6 && wheel.worldY === 6);
    const poweredArm = state.inserters.find((arm) => arm.worldX === 9 && arm.worldY === 6);
    assert('o rotor entrou no banco de frames energizados', powered?.frame >= 8 && powered.frame < 16, JSON.stringify(powered));
    assert('o circuito verde alimenta o braco no mesmo frame', poweredArm?.powered === true, JSON.stringify(state));
    await shot('roda-energizada');

    log('JOGO: espera o braco usar a energia hidraulica para transportar a pedra');
    await driver.page.waitForFunction(() => {
      const items = window.gameDebug?.getState()?.groundItems ?? [];
      return items.some((item) => item.kind === 'stone' && item.worldX === 10 && item.worldY === 6);
    }, null, { timeout: 7000 });
    state = await driver.getState();
    assert('a pedra chegou na saida do braco energizado', state.groundItems.some((item) => item.kind === 'stone' && item.worldX === 10 && item.worldY === 6), JSON.stringify(state.groundItems));
    await shot('roda-alimentou-braco');

    log('JOGO: drena o rio; a roda deve conservar momento antes de perder tensao');
    const drained = await driver.page.evaluate(() => {
      const water = window.__scene.waterTiles.find((tile) => tile.worldX === 6 && tile.worldY === 6);
      return water?.drain(0) ?? false;
    });
    assert('a agua sob a propria roda aceitou a drenagem', drained === true);
    await sleep(320);
    state = await driver.getState();
    const coasting = state.waterWheels.find((wheel) => wheel.worldX === 6 && wheel.worldY === 6);
    assert('sem corrente, a roda ainda gira por inercia', coasting?.hasFlow === false && coasting.speed > 0.45, JSON.stringify(coasting));
    assert('o dinamo ainda entrega energia no inicio do coast', coasting?.generating === true && state.globalVariables.energia_moinho === true, JSON.stringify(state));
    await shot('roda-desacelerando');

    await driver.page.waitForFunction(() => {
      const stateNow = window.gameDebug?.getState();
      const wheel = stateNow?.waterWheels?.find((item) => item.worldX === 6 && item.worldY === 6);
      return wheel && wheel.speed === 0 && !wheel.generating && stateNow.globalVariables.energia_moinho === false;
    }, null, { timeout: 5000 });
    state = await driver.getState();
    const stopped = state.waterWheels.find((wheel) => wheel.worldX === 6 && wheel.worldY === 6);
    const stoppedArm = state.inserters.find((arm) => arm.worldX === 9 && arm.worldY === 6);
    assert('a roda para no banco apagado, preservando uma orientacao valida', stopped?.frame >= 0 && stopped.frame < 8, JSON.stringify(stopped));
    assert('sem geracao, circuito e braco desligam', stoppedArm?.powered === false && state.globalVariables.energia_moinho === false, JSON.stringify(state));

    // Libera a saida, poe nova carga na entrada e prova que a falta de energia e comportamento,
    // nao apenas uma lampada apagada.
    await driver.page.evaluate(() => {
      const items = window.__scene.itemManager;
      items.takeAt(10, 6);
      items.drop('wood', 8, 6);
    });
    await sleep(2600);
    state = await driver.getState();
    assert('o braco sem energia nao move a nova carga', state.groundItems.some((item) => item.kind === 'wood' && item.worldX === 8 && item.worldY === 6), JSON.stringify(state.groundItems));
    await shot('roda-parada-braco-sem-energia');

    log('OK: corrente, inercia, geracao, consumo e desligamento validados ponta a ponta.');
  },
};

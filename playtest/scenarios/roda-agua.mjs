// Roda d'agua: autoria -> corrente -> inercia -> CABO -> consumidor -> drenagem.
//
// Layout controlado (sem variavel global):
//   roda-no-rio (6,6) -> fio (7,6) -> fio+item (8,6) -> braco (9,6) -> saida (10,6)
//   agua          (6,7)
//
// A roda e um modelo 3D low-poly, solida e ocupa o proprio tile de agua. Ela so gera com esse tile
// cheio e o rio continuando ortogonalmente. O braco nao tem variavel: so o cabo vivo o move.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default {
  name: 'roda-agua',
  description: "Roda d'agua 3D acelera, energiza fios e desacelera quando o rio drena.",
  needsGame: false,
  route: '/lab',
  async run({ driver, shot, assert, log }) {
    await driver.settle(2500);

    log("EDITOR: seleciona a roda d'agua; a saida fisica sera um cabo, sem variavel global");
    await driver.page.evaluate(() => {
      const scene = window.__scene;
      scene.uiState.tab = 'props';
      scene.uiState.tool = 'entity';
      scene.uiState.entity = { list: 'props', type: 'waterWheel' };
      scene.uiState.propVariable = '';
      scene.ui.syncFromState();
    });

    log('EDITOR: limpa a oficina, coloca rio, roda, dois fios, braco cabeado e pedra na entrada');
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

      // A roda encosta no primeiro cabo; o segundo ocupa a entrada do braco. O item pode repousar
      // sobre o fio rente ao chao, e o braco aponta leste para entrega-lo em (10,6).
      store.placeEntity({ list: 'props', type: 'wire', worldX: 7, worldY: 6 });
      store.placeEntity({ list: 'props', type: 'wire', worldX: 8, worldY: 6 });
      scene.uiState.entity = { list: 'props', type: 'inserter' };
      scene.uiState.propDir = 1;
      scene.uiState.propVariable = '';
      scene.placeSelectedEntity(9, 6);
      store.placeEntity({ list: 'pickups', type: 'stone', worldX: 8, worldY: 6 });

      const props = store.allEntities().filter((e) => e.list === 'props');
      return {
        wheel: props.find((e) => e.type === 'waterWheel' && e.worldX === 6 && e.worldY === 6),
        arm: props.find((e) => e.type === 'inserter' && e.worldX === 9 && e.worldY === 6),
        wires: props.filter((e) => e.type === 'wire' && e.worldY === 6),
        rejectedDryWheel,
        wheelReplacedWater: !props.some((e) => e.type === 'water' && e.worldX === 6 && e.worldY === 6),
        warnings: store.validate(),
      };
    });
    assert('o editor recusa roda em terreno seco', authored.rejectedDryWheel === true, JSON.stringify(authored));
    assert('a roda nao exige variavel global para gerar nos fios', authored.wheel && !authored.wheel.variable, JSON.stringify(authored));
    assert('o braco cabeado nao usa alimentacao sem fio', authored.arm && !authored.arm.variable, JSON.stringify(authored));
    assert('dois fios formam o caminho fisico entre roda e braco', authored.wires.length === 2, JSON.stringify(authored));
    assert('a roda substitui a agua no proprio tile', authored.wheelReplacedWater === true, JSON.stringify(authored));
    assert("a roda tem continuidade e passa a validacao hidraulica", !authored.warnings.some((w) => w.includes("roda(s) d'agua sem continuidade")), authored.warnings.join(' | '));
    assert('a roda cabeada nao recebe aviso de saida ausente', !authored.warnings.some((w) => w.includes("roda(s) d'agua sem cabo")), authored.warnings.join(' | '));
    await shot('roda-editor');

    log('LAB: inicia a oficina; o rotor deve estar acelerando e a rede acompanhar seu limiar');
    await driver.press('p');
    await driver.page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 15000 });

    let state = await driver.getState();
    const wheelAtBoot = state.waterWheels.find((wheel) => wheel.worldX === 6 && wheel.worldY === 6);
    const armAtBoot = state.inserters.find((arm) => arm.worldX === 9 && arm.worldY === 6);
    assert('roda e braco existem no runtime', Boolean(wheelAtBoot && armAtBoot), JSON.stringify(state));
    assert('o runtime reconhece a roda fisicamente cabeada', wheelAtBoot?.wired === true, JSON.stringify(wheelAtBoot));
    assert('o rio foi detectado como corrente', wheelAtBoot?.hasFlow === true, JSON.stringify(wheelAtBoot));
    assert('a roda ainda esta acelerando no boot', (wheelAtBoot?.speed ?? 0) > 0 && (wheelAtBoot?.speed ?? 1) < 1, JSON.stringify(wheelAtBoot));
    assert('fios e braco acompanham o limiar do dinamo', wheelAtBoot?.generating
      ? state.wires.every((wire) => wire.live) && armAtBoot?.powered === true
      : state.wires.every((wire) => !wire.live) && armAtBoot?.powered === false, JSON.stringify(state));

    await sleep(460);
    state = await driver.getState();
    const starting = state.waterWheels.find((wheel) => wheel.worldX === 6 && wheel.worldY === 6);
    assert('a roda ganhou velocidade gradualmente', (starting?.speed ?? 0) > (wheelAtBoot?.speed ?? 0) && (starting?.speed ?? 2) <= 1, JSON.stringify({ wheelAtBoot, starting }));
    assert('o rotor 3D mudou de angulo continuamente', Math.abs((starting?.rotation ?? 0) - (wheelAtBoot?.rotation ?? 0)) > 0.01, JSON.stringify({ wheelAtBoot, starting }));
    await shot('roda-partida');

    await driver.page.waitForFunction(() => {
      const stateNow = window.gameDebug?.getState();
      return stateNow?.waterWheels?.some((wheel) => wheel.worldX === 6 && wheel.generating)
        && stateNow?.wires?.every((wire) => wire.live);
    }, null, { timeout: 5000 });
    state = await driver.getState();
    const powered = state.waterWheels.find((wheel) => wheel.worldX === 6 && wheel.worldY === 6);
    const poweredArm = state.inserters.find((arm) => arm.worldX === 9 && arm.worldY === 6);
    assert('o rotor entrou no banco de frames energizados', powered?.frame >= 8 && powered.frame < 16, JSON.stringify(powered));
    assert('a roda acende todos os fios conectados', state.wires.length === 2 && state.wires.every((wire) => wire.live), JSON.stringify(state.wires));
    assert('os fios vivos alimentam o braco sem variavel', poweredArm?.powered === true && !poweredArm.variable, JSON.stringify(state));
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
    assert('o dinamo ainda entrega energia aos fios no inicio do coast', coasting?.generating === true && state.wires.every((wire) => wire.live), JSON.stringify(state));
    await shot('roda-desacelerando');

    await driver.page.waitForFunction(() => {
      const stateNow = window.gameDebug?.getState();
      const wheel = stateNow?.waterWheels?.find((item) => item.worldX === 6 && item.worldY === 6);
      return wheel && wheel.speed === 0 && !wheel.generating
        && stateNow.wires.every((wire) => !wire.live);
    }, null, { timeout: 5000 });
    state = await driver.getState();
    const stopped = state.waterWheels.find((wheel) => wheel.worldX === 6 && wheel.worldY === 6);
    const stoppedArm = state.inserters.find((arm) => arm.worldX === 9 && arm.worldY === 6);
    assert('a roda para no banco apagado, preservando uma orientacao valida', stopped?.frame >= 0 && stopped.frame < 8, JSON.stringify(stopped));
    assert('sem geracao, fios e braco desligam', stoppedArm?.powered === false && state.wires.every((wire) => !wire.live), JSON.stringify(state));

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

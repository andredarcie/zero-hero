// PORTAO ELETRONICO: consumidor fail-safe da rede fisica.
//
//      crate(4,5)
//          v
//   plate(4,6) -- wire(5,6) -- wire(6,6) -- gate(7,6, leste)
//                                             rock(7,5)/(7,7) formam a parede
//
// A caixa e empurrada por script para cima/fora da placa porque este cenario testa o portao,
// nao a rota do heroi ate o interruptor (caixa+placa ja tem cobertura propria). O teste prova:
// autoria do prop 2D, fechado/solido sem energia, abertura em poses graduais, passagem somente
// quando a grade saiu, fechamento AUTOMATICO ao fio apagar e reabertura sem estado travado.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (read, predicate, timeoutMs = 5000) => {
  const deadline = Date.now() + timeoutMs;
  let value = null;
  while (Date.now() < deadline) {
    value = await read();
    if (predicate(value)) return value;
    await sleep(70);
  }
  return value;
};

export default {
  name: 'portao-eletronico',
  description: 'Portao cabeado abre sob energia e fecha sozinho no instante em que a rede morre.',
  needsGame: false,
  route: '/lab',
  async run({ driver, shot, assert, log }) {
    await driver.settle(2600);

    log('EDITOR: monta placa, cabo, parede e portao 2D pela rota real de autoria');
    const authored = await driver.page.evaluate(() => {
      const store = window.__scene?.store;
      if (!store) return null;
      for (let x = 3; x <= 9; x += 1) {
        for (let y = 4; y <= 8; y += 1) {
          store.eraseEntitiesAt(x, y);
          store.setCell('upper', x, y, null);
          store.setCell('collision', x, y, false);
        }
      }
      store.setSpawn(3, 6);
      store.placeEntity({ list: 'props', type: 'pressurePlate', worldX: 4, worldY: 6 });
      store.placeEntity({ list: 'props', type: 'woodenCrate', worldX: 4, worldY: 5 });
      store.placeEntity({ list: 'props', type: 'wire', worldX: 5, worldY: 6 });
      store.placeEntity({ list: 'props', type: 'wire', worldX: 6, worldY: 6 });
      store.placeEntity({ list: 'props', type: 'electronicGate', worldX: 7, worldY: 6 });
      store.placeEntity({ list: 'props', type: 'rock', worldX: 7, worldY: 5 });
      store.placeEntity({ list: 'props', type: 'rock', worldX: 7, worldY: 7 });
      const gate = store.allEntities().find((entity) => entity.list === 'props'
        && entity.type === 'electronicGate' && entity.worldX === 7 && entity.worldY === 6);
      return { gate, warnings: store.validate() };
    });
    assert('o editor persiste o prop 2D sem campo direcional desnecessario',
      authored?.gate?.type === 'electronicGate' && authored?.gate?.dir === undefined,
      JSON.stringify(authored));
    assert('portao com cabo adjacente nao gera aviso de instalacao',
      !authored?.warnings?.some((warning) => warning.includes('portao')),
      JSON.stringify(authored?.warnings));
    await shot('editor-portao-2d');

    await driver.press('p');
    await driver.page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, {
      timeout: 15000,
    });
    await driver.settle(1200);

    const gateState = () => driver.page.evaluate(() => {
      const gate = window.gameDebug.getState().electronicGates.find((item) => item.worldX === 7);
      return {
        ...gate,
        solid: window.__scene.isSolidForEntities(7, 6, false),
        wiresLive: window.gameDebug.getState().wires.map((wire) => wire.live),
      };
    });

    log('JOGO: rede morta — grade no chao, lampada apagada, passagem solida');
    const closed = await gateState();
    assert('sem eletricidade o portao nasce fechado e solido',
      closed.powered === false && closed.open === false && closed.blocking === true
        && closed.solid === true && closed.openness === 0,
      JSON.stringify(closed));
    assert('os cabos sem fonte permanecem apagados', closed.wiresLive.every((live) => live === false),
      JSON.stringify(closed));
    await shot('portao-fechado-sem-energia');

    log('JOGO: caixa pressiona a placa — o cabo acende e o motor ergue a grade');
    await driver.page.evaluate(() => window.__scene.woodenCrates[0].push(0, 1));
    const opening = await waitFor(gateState, (state) => state?.powered && (state.frame === 5 || state.frame === 6));
    assert('a abertura usa poses pixel-art intermediarias, nao teleporte',
      opening?.powered === true && opening?.moving === true && (opening?.frame === 5 || opening?.frame === 6),
      JSON.stringify(opening));
    await shot('portao-subindo-energizado');

    const open = await waitFor(gateState, (state) => state?.open && !state.blocking, 4500);
    assert('com fio vivo a grade chega ao alto e a passagem libera',
      open?.powered === true && open?.open === true && open?.blocking === false && open?.solid === false,
      JSON.stringify(open));
    assert('a corrente percorre todo o caminho ate o portao', open?.wiresLive.every((live) => live === true),
      JSON.stringify(open));
    await shot('portao-aberto-energizado');

    log('JOGO: caixa sai da placa — no mesmo circuito o fio morre e a grade desce sozinha');
    await driver.page.evaluate(() => window.__scene.woodenCrates[0].push(0, 1));
    const closing = await waitFor(gateState, (state) => state?.powered === false
      && (state.frame === 1 || state.frame === 2));
    assert('perder energia inicia fechamento automatico',
      closing?.powered === false && closing?.moving === true && closing?.open === false
        && (closing?.frame === 1 || closing?.frame === 2),
      JSON.stringify(closing));
    await shot('portao-descendo-sem-energia');

    const shutAgain = await waitFor(gateState, (state) => state?.openness === 0 && state.blocking, 4500);
    assert('sem energia o portao volta ao chao e bloqueia novamente',
      shutAgain?.powered === false && shutAgain?.blocking === true && shutAgain?.solid === true,
      JSON.stringify(shutAgain));
    await shot('portao-fechado-novamente');

    log('JOGO: restaura a placa — o ciclo reabre sem memoria ou travamento');
    await driver.page.evaluate(() => window.__scene.woodenCrates[0].push(0, -1));
    const reopened = await waitFor(gateState, (state) => state?.open && state?.solid === false, 4500);
    assert('restaurar corrente reabre o portao e devolve a passagem',
      reopened?.powered === true && reopened?.open === true && reopened?.solid === false,
      JSON.stringify(reopened));

    log('OK: consumidor cabeado, abertura mecanica, colisao pelo vao e fechamento fail-safe.');
  },
};

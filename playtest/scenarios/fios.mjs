// O CABO DE ENERGIA: a corrente vira GEOGRAFIA — para a energia ir de uma maquina a outra, o
// autor deita cabos tile a tile, da fonte ate o consumidor. Um vao de um tile e um circuito
// aberto; um cabo encostado converte a maquina ao modo cabeado (nada de energia sem fio).
//
// Autoria pelo EditorStore, como braco/roda/caldeira. O layout dobra de proposito, para provar
// as formas resolvidas dos vizinhos:
//
//        arm(8,4) <- se(7,4)          entrada do braco: (8,3)  saida: (8,5)
//                     v (7,5)
//   campfire(4,6) boiler(5,6) h(6,6) nw(7,6)      + um cabo ISOLADO em (9,6)
//
// O que ele prova, nesta ordem:
//   1. FORMAS: h, nw, v, se nascem sozinhas dos vizinhos (o autor so pintou o caminho).
//   2. CABEADO E FRIO: braco SEM variavel encostado em cabo NAO e mais autoalimentado — sem
//      corrente ele congela (o contrato novo), e todos os cabos estao apagados.
//   3. A CORRENTE ACENDE O CAMINHO: fogueira -> caldeira gera -> os 4 cabos do caminho acendem
//      AMARELO (live), o isolado continua apagado (flood-fill respeita conexao), e o braco
//      cabeado trabalha.
//   4. O CABO E CHAO: nao bloqueia ninguem.
//   5. APAGAR DESLIGA: sem chama a pressao drena, os cabos apagam e o braco para.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CYCLE_TIMEOUT_MS = 6000;

export default {
  name: 'fios',
  description: 'Cabos de energia: formas nascem dos vizinhos e a corrente so anda por caminho continuo.',
  needsGame: false, // entra no editor; a GameScene nasce no P (mesma razao do braco/caldeira)
  route: '/lab',
  async run({ driver, shot, assert, log }) {
    await driver.settle(3000);

    log('EDITOR: limpa a faixa e deita fogueira | caldeira | cabos com curva | braco');
    const authored = await driver.page.evaluate(() => {
      const store = window.__scene?.store;
      if (!store) return 'sem store no editor';
      for (let x = 4; x <= 10; x += 1) {
        for (let y = 3; y <= 7; y += 1) {
          store.eraseEntitiesAt(x, y);
          store.setCell('upper', x, y, null);
          store.setCell('collision', x, y, false);
        }
      }
      store.placeEntity({ list: 'props', type: 'campfire', worldX: 4, worldY: 6 });
      store.placeEntity({ list: 'props', type: 'boiler', worldX: 5, worldY: 6 }); // SEM variavel
      for (const [x, y] of [[6, 6], [7, 6], [7, 5], [7, 4], [9, 6]]) {
        store.placeEntity({ list: 'props', type: 'wire', worldX: x, worldY: y });
      }
      store.placeEntity({ list: 'props', type: 'inserter', worldX: 8, worldY: 4, dir: 2 }); // SEM variavel
      return store.allEntities().filter((e) => e.list === 'props' && e.type === 'wire').length;
    });
    assert('o store guarda os 5 cabos', authored === 5, `veio ${authored}`);

    log('LAB: P joga o mundo editado');
    await driver.press('p', { count: 1 });
    await driver.settle(2500);

    // A regra da fogueira-casa pode ter acendido a NOSSA — apaga antes de medir o estado frio.
    await driver.page.evaluate(() => {
      const cf = window.__scene.campfires.find((c) => c.worldX === 4 && c.worldY === 6);
      if (cf.isLit) cf.extinguish();
    });
    // ...e espera qualquer pressao de boot drenar.
    await driver.page.evaluate(async () => {});
    let boot = null;
    const bootDeadline = Date.now() + 9000;
    while (Date.now() < bootDeadline) {
      boot = await driver.page.evaluate(() => window.gameDebug.getState().boilers[0]);
      if (!boot.heated && !boot.generating) break;
      await sleep(300);
    }
    assert('a caldeira nasceu/esfriou apagada', boot.generating === false, JSON.stringify(boot));

    // ── 1. As formas nascem dos vizinhos ─────────────────────────────────────
    const shapes = await driver.page.evaluate(() => {
      const wires = window.gameDebug.getState().wires;
      return Object.fromEntries(wires.map((w) => [`${w.worldX},${w.worldY}`, w.shape]));
    });
    assert('reta horizontal entre caldeira e curva: (6,6)=h', shapes['6,6'] === 'h', JSON.stringify(shapes));
    assert('curva norte-oeste no canto: (7,6)=nw', shapes['7,6'] === 'nw', JSON.stringify(shapes));
    assert('reta vertical na subida: (7,5)=v', shapes['7,5'] === 'v', JSON.stringify(shapes));
    assert('curva sul-leste entrando no braco: (7,4)=se', shapes['7,4'] === 'se', JSON.stringify(shapes));

    // ── 2. Cabeado e frio: nada anda, tudo apagado ───────────────────────────
    log('JOGO: rede fria — braco cabeado (sem variavel!) congela em vez de se autoalimentar');
    await driver.page.evaluate(() => window.__scene.itemManager.drop('stone', 8, 3));
    await sleep(2600);
    const cold = await driver.page.evaluate(() => {
      const s = window.gameDebug.getState();
      return {
        anyLive: s.wires.some((w) => w.live),
        powered: s.inserters.find((a) => a.worldX === 8 && a.worldY === 4)?.powered ?? null,
        input: window.__scene.itemManager.snapshot().find((i) => i.worldX === 8 && i.worldY === 3)?.kind ?? null,
      };
    });
    assert('todos os cabos apagados e o braco cabeado DESPOWERED (a pedra parada)',
      cold.anyLive === false && cold.powered === false && cold.input === 'stone', JSON.stringify(cold));
    await shot('fios-apagados');

    // ── 3. A corrente acende o caminho — e so o caminho ──────────────────────
    log('JOGO: fogueira acesa -> caldeira gera -> o caminho ACENDE amarelo e o braco trabalha');
    await driver.page.evaluate(() => {
      window.__scene.campfires.find((c) => c.worldX === 4 && c.worldY === 6).light();
    });
    let flow = null;
    const flowDeadline = Date.now() + 5000;
    while (Date.now() < flowDeadline) {
      flow = await driver.page.evaluate(() => {
        const s = window.gameDebug.getState();
        const at = (x, y) => s.wires.find((w) => w.worldX === x && w.worldY === y)?.live ?? null;
        return {
          path: [at(6, 6), at(7, 6), at(7, 5), at(7, 4)],
          isolated: at(9, 6),
          powered: s.inserters.find((a) => a.worldX === 8 && a.worldY === 4)?.powered ?? null,
        };
      });
      if (flow.powered) break;
      await sleep(150);
    }
    assert('os 4 cabos do caminho estao VIVOS (amarelo aceso)',
      flow.path.every((v) => v === true), JSON.stringify(flow));
    assert('o cabo ISOLADO continua apagado — corrente nao pula vao',
      flow.isolated === false, JSON.stringify(flow));
    assert('o braco cabeado esta POWERED', flow.powered === true, JSON.stringify(flow));
    await shot('fios-acesos');

    let moved = false;
    const moveDeadline = Date.now() + CYCLE_TIMEOUT_MS;
    while (Date.now() < moveDeadline) {
      const out = await driver.page.evaluate(() => window.__scene.itemManager.snapshot()
        .find((i) => i.worldX === 8 && i.worldY === 5)?.kind ?? null);
      if (out === 'stone') { moved = true; break; }
      await sleep(200);
    }
    assert('energia pelo cabo: o braco levou a pedra ate a saida (8,5)', moved);
    await shot('fios-fabrica-cabeada');

    // ── 4. O cabo e chao ─────────────────────────────────────────────────────
    const walkable = await driver.page.evaluate(() => window.__scene.isSolidForEntities(6, 6, false));
    assert('um cabo no chao NAO bloqueia ninguem', walkable === false);

    // ── 5. Apagar a fonte apaga a linha ──────────────────────────────────────
    log('JOGO: fogueira apagada — a pressao drena, a linha apaga, o braco para');
    await driver.page.evaluate(() => {
      window.__scene.campfires.find((c) => c.worldX === 4 && c.worldY === 6).extinguish();
    });
    let dark = null;
    const darkDeadline = Date.now() + 9000;
    while (Date.now() < darkDeadline) {
      dark = await driver.page.evaluate(() => {
        const s = window.gameDebug.getState();
        return {
          anyLive: s.wires.some((w) => w.live),
          powered: s.inserters.find((a) => a.worldX === 8 && a.worldY === 4)?.powered ?? null,
        };
      });
      if (!dark.anyLive && dark.powered === false) break;
      await sleep(300);
    }
    assert('sem fonte, os cabos apagam e o braco cabeado para',
      dark.anyLive === false && dark.powered === false, JSON.stringify(dark));

    log('OK: formas dos vizinhos, corrente so por caminho continuo, amarelo so com energia.');
  },
};

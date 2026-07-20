// A BATERIA: o vaso portatil da eletricidade — o graveto carrega fogo, o balde carrega agua,
// a bateria carrega CORRENTE. Ela e a unica forma de energia atravessar onde cabo nao deita
// (um rio, um muro): carrega numa rede viva, viaja na mao (ou na garra do braco), e pousada
// junto a cabos vira SEMENTE do flood-fill — drenando so enquanto alimenta.
//
// Autoria pelo EditorStore, como fios/caldeira. DUAS redes deliberadamente separadas:
//
//   rede A (fonte):  campfire(4,6) boiler(5,6) h(6,6) h(7,6)        — viva pela caldeira
//   rede B (ilhada): wire(9,4) wire(10,4) braco(11,4, dir sul)      — sem fonte nenhuma
//
// O que ele prova, nesta ordem:
//   1. CARREGAR: pisar num cabo VIVO segurando a bateria vazia a enche; num cabo MORTO, nao.
//   2. TRANSPORTAR + DESCARREGAR: pisar na rede B com a bateria cheia ENCAIXA a carga sem
//      depender de botao de largar; a bateria pousada acende a rede ilhada
//      e energiza o braco — energia virou carga e cruzou o vao onde nenhum cabo existe.
//   3. O RELOGIO: a carga drena enquanto alimenta; esgotada, o item vira a CASCA VAZIA no
//      mesmo tile (nada evapora) e a rede B apaga de volta.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'bateria',
  description: 'A bateria: carrega num cabo vivo, cruza o vao na mao e alimenta uma rede ilhada ate esgotar.',
  needsGame: false, // entra no editor; a GameScene nasce no P (mesma razao de fios/caldeira)
  route: '/lab',
  async run({ driver, shot, assert, log }) {
    await driver.settle(3000);

    log('EDITOR: rede A (fogueira|caldeira|cabos) + rede B ilhada (cabos|braco)');
    const authored = await driver.page.evaluate(() => {
      const store = window.__scene?.store;
      if (!store) return 'sem store no editor';
      for (let x = 4; x <= 11; x += 1) {
        for (let y = 3; y <= 7; y += 1) {
          store.eraseEntitiesAt(x, y);
          store.setCell('upper', x, y, null);
          store.setCell('collision', x, y, false);
        }
      }
      store.placeEntity({ list: 'props', type: 'campfire', worldX: 4, worldY: 6 });
      store.placeEntity({ list: 'props', type: 'boiler', worldX: 5, worldY: 6 });
      for (const [x, y] of [[6, 6], [7, 6], [9, 4], [10, 4]]) {
        store.placeEntity({ list: 'props', type: 'wire', worldX: x, worldY: y });
      }
      store.placeEntity({ list: 'props', type: 'inserter', worldX: 11, worldY: 4, dir: 2 });
      store.placeEntity({ list: 'pickups', type: 'battery', worldX: 4, worldY: 3 });
      const entities = store.allEntities();
      return {
        wires: entities.filter((e) => e.list === 'props' && e.type === 'wire').length,
        batteries: entities.filter((e) => e.list === 'pickups' && e.type === 'battery').length,
      };
    });
    assert('o store guarda os 4 cabos das duas redes', authored.wires === 4, JSON.stringify(authored));
    assert('a bateria vazia existe na paleta/autoria do editor', authored.batteries === 1, JSON.stringify(authored));

    log('LAB: P joga o mundo editado; a rede A liga (agua + fogueira acesa)');
    await driver.press('p', { count: 1 });
    await driver.settle(2500);
    await driver.page.evaluate(() => {
      const s = window.__scene;
      const cf = s.campfires.find((c) => c.worldX === 4 && c.worldY === 6);
      if (!cf.isLit) cf.light();
      s.boilers[0].fillWater();
    });
    let netA = null;
    const netADeadline = Date.now() + 6000;
    while (Date.now() < netADeadline) {
      netA = await driver.page.evaluate(() => {
        const s = window.gameDebug.getState();
        const at = (x, y) => s.wires.find((w) => w.worldX === x && w.worldY === y)?.live ?? null;
        return { a1: at(6, 6), a2: at(7, 6), b1: at(9, 4), b2: at(10, 4) };
      });
      if (netA.a1 && netA.a2) break;
      await sleep(200);
    }
    assert('a rede A esta VIVA e a rede B ilhada esta apagada',
      netA.a1 === true && netA.a2 === true && netA.b1 === false && netA.b2 === false,
      JSON.stringify(netA));

    // ── 1. Carregar: cabo vivo enche, cabo morto nao ─────────────────────────
    log('JOGO: pisar no cabo MORTO nao carrega; pisar no cabo VIVO carrega');
    const deadStep = await driver.page.evaluate(() => {
      const s = window.__scene;
      s.heldItem = 'battery';
      s.handleTileEntered(9, 4); // cabo da rede B: morto
      return s.heldItem;
    });
    assert('cabo morto NAO enche bateria', deadStep === 'battery', deadStep);

    const liveStep = await driver.page.evaluate(() => {
      const s = window.__scene;
      s.handleTileEntered(7, 6); // cabo da rede A: vivo
      return s.heldItem;
    });
    assert('cabo VIVO carrega a bateria na mao', liveStep === 'batteryFull', liveStep);
    await shot('bateria-carregada');

    // ── 2. Transportar + descarregar: a rede ilhada acende ───────────────────
    log('JOGO: pisar no cabo morto encaixa a bateria — a ilha acende e o braco trabalha');
    const docked = await driver.page.evaluate(() => {
      const s = window.__scene;
      s.handleTileEntered(9, 4); // bateriaFull veio do passo anterior; este e o gesto walk-only
      s.itemManager.drop('stone', 11, 3); // e uma carga na ENTRADA do braco (11,3)
      return {
        held: s.heldItem,
        docked: s.itemManager.snapshot().find((i) => i.worldX === 9 && i.worldY === 4)?.kind ?? null,
      };
    });
    assert('cabo morto ENCAIXA a bateria cheia e esvazia a mao',
      docked.held === 'none' && docked.docked === 'batteryFull', JSON.stringify(docked));
    let island = null;
    const islandDeadline = Date.now() + 4000;
    while (Date.now() < islandDeadline) {
      island = await driver.page.evaluate(() => {
        const s = window.gameDebug.getState();
        const at = (x, y) => s.wires.find((w) => w.worldX === x && w.worldY === y)?.live ?? null;
        return {
          b1: at(9, 4),
          b2: at(10, 4),
          powered: s.inserters.find((a) => a.worldX === 11 && a.worldY === 4)?.powered ?? null,
        };
      });
      if (island.powered) break;
      await sleep(150);
    }
    assert('a rede B ACENDE com a bateria pousada (sem fonte, sem conexao com A)',
      island.b1 === true && island.b2 === true, JSON.stringify(island));
    assert('o braco da ilha esta POWERED — energia cruzou o vao como carga',
      island.powered === true, JSON.stringify(island));

    let moved = false;
    const moveDeadline = Date.now() + 6000;
    while (Date.now() < moveDeadline) {
      const out = await driver.page.evaluate(() => window.__scene.itemManager.snapshot()
        .find((i) => i.worldX === 11 && i.worldY === 5)?.kind ?? null);
      if (out === 'stone') { moved = true; break; }
      await sleep(200);
    }
    assert('o braco alimentado por bateria transportou a pedra ate a saida (11,5)', moved);
    await shot('bateria-alimentando-ilha');

    // ── 2b. A carga VIAJA com o item: pegar e re-encaixar NUNCA recarrega ────
    // O exploit que este assert trava: se a carga fosse binaria, recolher a bateria
    // meio-drenada e pousar de volta a devolveria CHEIA — energia infinita por ciclagem.
    log('JOGO: recolher a bateria meio-drenada e re-encaixar mantem a carga parcial');
    await driver.page.evaluate(() => {
      const s = window.__scene;
      const it = s.itemManager.items
        .find((i) => i.kind === 'batteryFull' && i.tileX === 9 && i.tileY === 4);
      it.chargeMs = 6000; // meio tanque, para a diferenca ser legivel
      s.playerWorld.worldX = 9; // o heroi pisa na bateria: coleta normal do update
      s.playerWorld.worldY = 4;
      s.movementController.interruptMovement(9, 4);
    });
    await sleep(500);
    const held = await driver.page.evaluate(() => ({
      held: window.__scene.heldItem,
      charge: window.__scene.heldBatteryChargeMs,
    }));
    assert('a bateria sobe pra mao com a carga PARCIAL (nao cheia)',
      held.held === 'batteryFull' && held.charge > 0 && held.charge <= 6000, JSON.stringify(held));

    const redock = await driver.page.evaluate(() => {
      const s = window.__scene;
      s.handleTileEntered(9, 4); // o cabo esta morto de novo (a bateria saiu da rede): encaixa
      const it = s.itemManager.items
        .find((i) => i.kind === 'batteryFull' && i.tileX === 9 && i.tileY === 4);
      return { held: s.heldItem, charge: it?.chargeMs ?? null };
    });
    assert('re-encaixada, pousa com a MESMA carga parcial — ciclagem nao recarrega',
      redock.held === 'none' && redock.charge !== null && redock.charge <= 6000,
      JSON.stringify(redock));

    // ── 3. O relogio: esgota alimentando, e vira a casca vazia no lugar ──────
    log('JOGO: a carga drena enquanto alimenta — esgotada, sobra a casca vazia e a ilha apaga');
    await driver.page.evaluate(() => {
      const it = window.__scene.itemManager.items
        .find((i) => i.kind === 'batteryFull' && i.tileX === 9 && i.tileY === 4);
      it.chargeMs = 900; // encurta o relogio: o contrato e a morte, nao os 20s
    });
    let spent = null;
    const spentDeadline = Date.now() + 6000;
    while (Date.now() < spentDeadline) {
      spent = await driver.page.evaluate(() => {
        const s = window.gameDebug.getState();
        return {
          shell: s.groundItems.find((i) => i.worldX === 9 && i.worldY === 4)?.kind ?? null,
          b1: s.wires.find((w) => w.worldX === 9 && w.worldY === 4)?.live ?? null,
          powered: s.inserters.find((a) => a.worldX === 11 && a.worldY === 4)?.powered ?? null,
        };
      });
      if (spent.shell === 'battery' && !spent.b1) break;
      await sleep(200);
    }
    assert('esgotada, o item no chao e a CASCA VAZIA (nada evaporou)',
      spent.shell === 'battery', JSON.stringify(spent));
    assert('e a ilha apagou de volta, com o braco parado',
      spent.b1 === false && spent.powered === false, JSON.stringify(spent));
    await shot('bateria-esgotada');

    log('OK: carrega no cabo vivo, cruza o vao como carga, alimenta a ilha e morre em casca.');
  },
};

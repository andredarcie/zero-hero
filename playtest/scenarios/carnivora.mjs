// A PLANTA CARNÍVORA — a barreira de defesa que se PLANTA, e que COME quem encosta.
//
// A frase que nenhuma outra peça diz: o corpo do inimigo vira recurso do terreno. Todo bicho
// que para num dos 4 vizinhos de uma planta pronta é engolido — a bocarra abre, o corpo some
// goela adentro (EnemyBase.consume), a planta mastiga (a recarga, e a janela de passar por
// ela) e volta à espreita.
//
// O que este cenário guarda:
//
//   1. o inimigo que ENCOSTA é COMIDO — sem moeda e sem ossada (quem ficou com o corpo foi a
//      planta; uma cova vizinha pagando moeda seria uma fábrica AFK);
//   2. a planta brota da SEMENTE CARNÍVORA pelo MESMO ciclo da fazenda (A planta no buraco,
//      balde na água de terreno, rega) — o canteiro lembra o que recebeu (sownKind) e brota
//      a armadilha em vez do mato;
//   3. o HERÓI ela não morde: ficar colado nela custa zero coração — é a peça DELE.
//
// A cova é autorada COLADA na planta (com um corredor de colisão que impede o desvio): a
// caveira nasce já encostada — invulnerável enquanto nasce (a lei do nascimento, que a planta
// respeita) e engolida no primeiro fôlego de vida. Determinístico, sem perseguição.

const HERO = { x: 5, y: 6 };
const SEA = { x: 4, y: 6 }; // água de terreno — o balde enche aqui (a lei das procedências)
const SPOT = { x: 7, y: 6 }; // o canteiro onde a semente carnívora vai brotar
const PLANT = { x: 9, y: 6 }; // a planta AUTORADA — o bote testado sem esperar fazenda
const DEN = { x: 10, y: 6 }; // a cova, colada na planta: nascer aqui é nascer no prato

export default {
  name: 'carnivora',
  description: 'A planta carnívora come o inimigo encostado; brota da semente; não morde o herói.',
  needsGame: false, // entra pelo editor; a GameScene nasce no P (mesma razão do combate)
  route: '/lab?level=1',
  async run({ driver, shot, assert, log }) {
    await driver.settle(3000);
    const page = driver.page;

    log('EDITOR: quintal de terra, mar a oeste, planta autorada com a cova no prato');
    await page.evaluate(({ hero, sea, plant, den, spot }) => {
      const store = window.__scene?.store;
      if (!store) throw new Error('sem store no editor');
      for (let x = 2; x <= 11; x += 1) {
        for (let y = 2; y <= 10; y += 1) {
          store.eraseEntitiesAt(x, y);
          store.setCell('upper', x, y, null);
          store.setCell('collision', x, y, false);
          store.setCell('ground', x, y, 5); // Terra
        }
      }
      store.setCell('ground', sea.x, sea.y, 33); // Mar — água pintada, prop nenhum
      // O corredor: paredes de colisão acima e abaixo da fileira da cova, para a caveira não
      // ter desvio — o único mundo dela é o tile onde nasceu, colado na bocarra.
      for (let x = 8; x <= 11; x += 1) {
        store.setCell('collision', x, 5, true);
        store.setCell('collision', x, 7, true);
      }
      store.placeEntity({ list: 'props', type: 'carnivorousPlant', worldX: plant.x, worldY: plant.y });
      store.placeEntity({ list: 'props', type: 'plantSpot', worldX: spot.x, worldY: spot.y });
      store.placeEntity({ list: 'enemies', type: 'undead', worldX: den.x, worldY: den.y });
      store.setSpawn(hero.x, hero.y);
    }, { hero: HERO, sea: SEA, plant: PLANT, den: DEN, spot: SPOT });

    log('LAB: P joga o mundo editado');
    await driver.press('p', { count: 1 });
    await driver.settle(2200);
    await page.waitForFunction(() => window.gameDebug?.getState()?.levelIntroOpen === false,
      null, { timeout: 15000 });

    // ── 1. O INIMIGO QUE ENCOSTA É COMIDO ───────────────────────────────────
    // A caveira nasce da cova colada na planta: o nascimento é invulnerável (a planta espera),
    // e o primeiro fôlego de vida dela termina goela adentro. Espera-se o FIM (a lição do
    // gelo): corpo nenhum vivo, e NENHUMA ossada — engolido não deixa marca no chão.
    log('BOTE: a bocarra sai da espreita — o flagra do gesto (aberta, arrastando, ou mastigando)');
    await page.waitForFunction(() => {
      const p = window.__scene?.carnivorousPlants?.[0];
      return p && p.state !== 'ready';
    }, null, { timeout: 20000 });
    await shot('carnivora-bote');

    log('...e espera-se o desfecho, não o meio (a lição do gelo)');
    await page.waitForFunction(() => {
      const state = window.gameDebug?.getState();
      return state && state.undead.length === 0 && state.enemySpawners.length > 0;
    }, null, { timeout: 20000 });
    const eaten = await page.evaluate((at) => {
      const s = window.__scene;
      const state = window.gameDebug.getState();
      return {
        bodies: state.undead.length,
        corpses: state.corpses,
        coins: state.coins ?? 0,
        plantThere: s.carnivorousPlants.some((p) => p.worldX === at.x && p.worldY === at.y),
      };
    }, PLANT);
    assert('a caveira foi COMIDA: nenhum corpo vivo, nenhuma ossada (o gole não deixa marca)',
      eaten.bodies === 0 && eaten.corpses === 0, JSON.stringify(eaten));
    assert('e o gole não pagou moeda — a planta ficou com o corpo, não com o recibo',
      eaten.coins === 0 && eaten.plantThere, JSON.stringify(eaten));
    await shot('carnivora-comeu');

    // ── 2. A SEMENTE CARNÍVORA BROTA A ARMADILHA PELO CICLO DA FAZENDA ──────
    log('FAZENDA: o A planta a semente carnívora no canteiro autorado');
    await page.evaluate(() => {
      const s = window.__scene;
      s.inventory.clear();
      s.inventory.add('carnivoreSeeds', 5);
      s.inventory.add('bucket');
      s.inventory.select('carnivoreSeeds');
      s.seenItems.add('carnivoreSeeds');
      s.seenItems.add('bucket');
    });
    await driver.settle(300);

    await driver.press('ArrowRight', { count: 1 }); // (5,6) → (6,6), encarando o canteiro
    await driver.settle(500);
    await driver.press('x', { count: 1 }); // o X planta a semente carnívora (a tabela de itens mudou de botão)
    await driver.settle(600);
    const sown = await page.evaluate((at) => {
      const s = window.__scene;
      const spot = s.plantSpots.find((p) => p.worldX === at.x && p.worldY === at.y);
      return {
        planted: (spot?.isSown ?? false) || (spot?.isMound ?? false),
        sownKind: spot?.sownKind ?? null,
        seedsLeft: s.inventory.count('carnivoreSeeds'),
      };
    }, SPOT);
    assert('a semente carnívora entrou na terra e o canteiro LEMBRA o que recebeu (sownKind)',
      sown.planted && sown.sownKind === 'carnivoreSeeds' && sown.seedsLeft === 4,
      JSON.stringify(sown));

    log('REGA: o balde enche no mar pintado e a terra bebe');
    await page.evaluate(() => { window.__scene.inventory.select('bucket'); });
    await driver.press('ArrowLeft', { count: 1 }); // (6,6) → (5,6), encarando o mar
    await driver.settle(500);
    await driver.press('x', { count: 1 }); // enche
    await driver.settle(500);
    await driver.press('ArrowRight', { count: 1 }); // de volta, encarando o monte
    await driver.settle(500);
    await driver.press('x', { count: 1 }); // rega
    log('...e a armadilha brota (PLANT_GROW_MS + o brotar que espera o tile livre)');
    await page.waitForFunction((at) => {
      const s = window.__scene;
      return s.carnivorousPlants.some((p) => p.worldX === at.x && p.worldY === at.y && p.blocking);
    }, SPOT, { timeout: 15000 });
    const grown = await page.evaluate((at) => {
      const s = window.__scene;
      return {
        sprouted: s.carnivorousPlants.some((p) => p.worldX === at.x && p.worldY === at.y),
        totalPlants: s.carnivorousPlants.length,
      };
    }, SPOT);
    assert('a semente carnívora brotou a PLANTA CARNÍVORA (não mato) no canteiro regado',
      grown.sprouted && grown.totalPlants === 2, JSON.stringify(grown));
    await shot('carnivora-brotou');

    // ── 3. O HERÓI ELA NÃO MORDE ────────────────────────────────────────────
    // O herói passou a cena inteira COLADO nas plantas (a rega é feita do tile vizinho, e o
    // broto aconteceu com ele parado ao lado). Se a bocarra mordesse o dono, este número
    // não estaria inteiro.
    const safe = await driver.getState();
    assert('o herói ficou colado na planta o tempo todo e não perdeu um coração — é a peça DELE',
      safe.health === safe.maxHealth, JSON.stringify({ health: safe.health, max: safe.maxHealth }));
  },
};

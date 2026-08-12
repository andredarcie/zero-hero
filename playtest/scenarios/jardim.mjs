// O JARDIM — o baralho comprável deixou de ser chão pelado, e o vaga-lume mudou de dono.
//
// O que este cenário prova, e por que cada assert existe:
//
//   1. TODA CARTA TEM MATO. As 14 cartas nasceram desenhando só a ideia de cada uma (o lago, a
//      pedreira) e o resto era terra lisa — cinco delas tinham MENOS DE DEZ tiles de decoração.
//      O piso é medido por carta, e as cartas de flor (bosque, canteiros, campina) têm de ter
//      flor de verdade, não só capim: é a diferença entre "tem textura" e "é um jardim".
//   2. A COSTURA ABRE O QUE BLOQUEIA, E SÓ. As quatro faixas de estrada somam 64 dos 144 tiles;
//      quando elas RASPAVAM o tile (o comportamento antigo), plantar era inútil no miolo da carta
//      — o assentamento apagava. O assert é direto: um tile de mato na costura continua sendo mato
//      depois de a carta assentar, e um tile SÓLIDO na costura vira passagem.
//   3. NADA FICOU SELADO. A prova de BFS mora no script de plantio, mas ela mede o arquivo; aqui
//      se mede o JOGO: a carta comprada tem de deixar o herói entrar e sair pelo outro lado.
//   4. O VAGA-LUME MORA NO MATO. Ele acendia só dentro do halo de uma fogueira ACESA, e no
//      construtor toda fogueira de carta nasce apagada — ou seja, ele não existia. Agora o enxame
//      pousa em tile de vegetação. Três coisas: existe mato indexado, os bichos estão POUSADOS
//      nele (perto de um tile verde, e no ar), e eles VOAM (a posição muda entre duas leituras).
//      Sem o teste de movimento, um enxame congelado passaria.
//   5. NENHUMA LUZ NOVA. Vaga-lume é Point aditivo, nunca uma luz THREE: a contagem de luzes está
//      selada e uma luz nascendo recompilaria o mundo inteiro. Conta-se antes e depois.

export default {
  name: 'jardim',
  description: 'Cartas plantadas (mato, flor, árvore), costura que não rapa e o enxame de vaga-lumes sobre o verde.',
  needsGame: false,
  route: '/',
  async run({ driver, shot, assert, log }) {
    const page = driver.page;
    const evaluate = (fn, arg) => page.evaluate(fn, arg);
    const teleport = (x, y) => page.evaluate(([px, py]) => {
      const scene = window.__scene;
      scene.playerWorld.worldX = px;
      scene.playerWorld.worldY = py;
      scene.movementController.interruptMovement(px, py);
    }, [x, y]);

    await page.waitForFunction(() => window.__game?.scene.isActive('title'), null, { timeout: 30000 });
    await driver.settle(500);
    await driver.press('Enter');
    await page.waitForFunction(() => window.gameDebug?.getState()?.explorer?.builder != null, null, { timeout: 30000 });
    await driver.settle(1200);

    // ── 1. o baralho ────────────────────────────────────────────────────────────────────────
    log('BARALHO: toda carta comprável tem mato, e as cartas de flor têm flor');
    const FLOWERS = [1, 10, 11];   // arbusto florido, cogumelo vermelho, cogumelo roxo
    const SOLID = [3, 4, 14, 15, 16, 17, 18, 21, 22, 25, 39, 40];
    // A BIBLIOTECA INTEIRA, e nao o baralho: plantar e uma propriedade das cartas AUTORADAS, e
    // hoje sete delas estao desligadas no editor (so o astronauta entre os moradores). Medir
    // `source.catalog()` faria o teste encolher junto com o baralho e parar de guardar as cartas
    // que o autor pode religar a qualquer momento.
    const deck = await evaluate(async ([flowers, solid]) => {
      const file = await (await fetch(`${document.baseURI}world.json`)).json();
      return file.chunks.filter((chunk) => chunk.catalog).map((chunk) => {
        const cells = chunk.upper.flat().filter((frame) => frame !== null);
        return {
          id: chunk.catalog.id,
          decor: cells.filter((frame) => !solid.includes(frame)).length,
          flowers: cells.filter((frame) => flowers.includes(frame)).length,
          trees: cells.filter((frame) => solid.includes(frame)).length,
        };
      });
    }, [FLOWERS, SOLID]);

    const bare = deck.filter((card) => card.decor < 20);
    assert('Nenhuma carta do baralho é chão pelado (>= 20 tiles de decoração)',
      bare.length === 0, JSON.stringify(bare.length ? bare : deck.map((c) => `${c.id}:${c.decor}`)));

    const garden = ['blooming-grove', 'painted-beds', 'silent-meadow'];
    const gardenCards = deck.filter((card) => garden.includes(card.id));
    assert('As três cartas de jardim florescem de verdade (>= 25 flores cada)',
      gardenCards.length === 3 && gardenCards.every((card) => card.flowers >= 25),
      JSON.stringify(gardenCards));

    assert('O baralho inteiro somado tem árvore em pé de sobra',
      deck.reduce((sum, card) => sum + card.trees, 0) >= 300,
      String(deck.reduce((sum, card) => sum + card.trees, 0)));

    // ── 2 e 3. a costura ────────────────────────────────────────────────────────────────────
    log('COSTURA: a estrada abre o que bloqueia e deixa o mato viver');
    await evaluate(() => window.__scene.explorerDebugSetCoins(99));
    // A Caverna das Aranhas é a carta certa para medir a costura: ela tem PAREDE nas faixas de
    // estrada (o anel de rocha) e mato dentro delas, então os dois ramos da regra são exercidos
    // pela mesma compra. Numa carta aberta o assert de "abriu o que bloqueia" seria vazio.
    await evaluate(() => window.__scene.explorerDebugSetNextOffers(['spider-hollow']));
    await teleport(10, 8);
    await driver.settle(300);
    await driver.useItem();
    await page.waitForSelector('.zh-build-backdrop', { state: 'visible', timeout: 5000 });
    await driver.settle(600);
    await driver.press('Enter');
    await driver.settle(2000);
    await evaluate(() => window.__scene.enemyManager?.despawnAll());

    // As faixas de costura, em coordenadas locais da carta (ver openSeams, explorerWorld.ts).
    const seam = await evaluate(() => {
      const source = window.__scene.explorer.source;
      const template = source.templates.find((entry) => entry.catalog.id === 'spider-hollow');
      const placed = source.chunk(1, 0);
      const inSeam = (x, y) => (
        (x >= 5 && x <= 7 && (y <= 3 || y >= 8)) || (y >= 5 && y <= 9 && (x <= 3 || x >= 8))
      );
      const SOLID = [3, 4, 14, 15, 16, 17, 18, 21, 22, 25, 39, 40];
      let decorKept = 0; let decorLost = 0; let solidLeft = 0; let solidOpened = 0;
      for (let y = 0; y < 12; y += 1) {
        for (let x = 0; x < 12; x += 1) {
          if (!inSeam(x, y)) continue;
          const before = template.upper[y][x];
          const after = placed.upper[y][x];
          if (before === null) continue;
          if (SOLID.includes(before)) {
            if (after === null) solidOpened += 1; else solidLeft += 1;
          } else if (after === before) decorKept += 1; else decorLost += 1;
        }
      }
      return { decorKept, decorLost, solidLeft, solidOpened };
    });
    assert('O mato plantado na faixa de estrada SOBREVIVE ao assentamento',
      seam.decorKept > 0 && seam.decorLost === 0, JSON.stringify(seam));
    assert('O que BLOQUEIA na faixa de estrada é aberto',
      seam.solidOpened > 0 && seam.solidLeft === 0, JSON.stringify(seam));

    // ── 3, 4 e 5: a segunda compra, ao norte ────────────────────────────────────────────────
    // O Bosque Florido é a carta mais verde do baralho: é nele que a travessia mede uma carta
    // PLANTADA (e não a caverna, que é feita de parede por desenho) e é nele que um enxame que
    // depende de vegetação tem de aparecer.
    await evaluate(() => window.__scene.explorerDebugSetNextOffers(['blooming-grove']));
    await teleport(6, 1);
    await driver.settle(300);
    await driver.useItem();
    await page.waitForSelector('.zh-build-backdrop', { state: 'visible', timeout: 5000 });
    await driver.settle(600);
    await driver.press('Enter');
    await driver.settle(2000);
    await evaluate(() => window.__scene.enemyManager?.despawnAll());

    log('TRAVESSIA: nem o mato nem os pinheiros novos selaram o caminho');
    await teleport(6, -1);
    await driver.walk('up', 10);
    const crossed = await driver.getState();
    assert('O herói atravessa a carta plantada de ponta a ponta',
      (crossed?.player?.worldY ?? 0) <= -11,
      JSON.stringify(crossed?.player));

    log('VAGA-LUMES: o enxame mora no mato, voa, e não acende luz nenhuma');
    await teleport(6, -6);
    await driver.settle(1400);

    const lightsBefore = await evaluate(
      () => window.__scene.world3d.scene.children.filter((o) => o.isLight).length,
    );
    const sample = () => evaluate(() => {
      const w3 = window.__scene.world3d;
      const pos = Array.from(w3.fireflies.pos);
      const col = Array.from(w3.fireflies.col);
      const green = [];
      for (let i = 0; i < w3.greenTiles.length; i += 2) green.push([w3.greenTiles[i], w3.greenTiles[i + 1]]);
      return { pos, col, greenCount: green.length, green: green.slice(0, 4000) };
    });

    const a = await sample();
    assert('O renderer indexou os tiles de vegetação da janela', a.greenCount > 40, String(a.greenCount));

    const count = a.pos.length / 3;
    const airborne = [];
    for (let i = 0; i < count; i += 1) {
      const y = a.pos[i * 3 + 1];
      if (y > 0) airborne.push(i);
    }
    assert('A maioria do enxame está no ar (e não estacionada sob o chão)',
      airborne.length >= count * 0.5, `${airborne.length}/${count}`);

    const overGrass = airborne.filter((i) => a.green.some(
      ([gx, gz]) => Math.abs(gx - a.pos[i * 3]) <= 2.5 && Math.abs(gz - a.pos[i * 3 + 2]) <= 2.5,
    ));
    assert('Todo vaga-lume aceso está pousado sobre vegetação',
      overGrass.length === airborne.length, `${overGrass.length}/${airborne.length}`);

    // 0,6 fica ACIMA do resto de brasa que todo vaga-lume carrega (o piso de 0,12 do pisca) e
    // abaixo do pico: contar acima de zero aprovaria um enxame permanentemente apagado.
    const lit = airborne.filter((i) => a.col[i * 3 + 1] > 0.6);
    assert('Há vaga-lume ACESO na tela (o enxame não é invisível)', lit.length >= 3, String(lit.length));

    await driver.settle(420);
    const b = await sample();
    const moved = airborne.filter((i) => (
      Math.hypot(b.pos[i * 3] - a.pos[i * 3], b.pos[i * 3 + 2] - a.pos[i * 3 + 2]) > 0.02
    ));
    assert('O enxame VOA (a posição muda entre duas leituras)',
      moved.length >= airborne.length * 0.5, `${moved.length}/${airborne.length}`);

    const blinked = airborne.filter((i) => Math.abs(b.col[i * 3 + 1] - a.col[i * 3 + 1]) > 0.02);
    assert('E cada um pisca no próprio ritmo', blinked.length >= airborne.length * 0.5,
      `${blinked.length}/${airborne.length}`);

    const lightsAfter = await evaluate(
      () => window.__scene.world3d.scene.children.filter((o) => o.isLight).length,
    );
    assert('Nenhuma luz THREE nasceu com o enxame', lightsAfter === lightsBefore,
      `${lightsBefore} -> ${lightsAfter}`);

    await shot('jardim-comprado', {
      note: 'A carta comprada com mato, flor e o enxame de vaga-lumes por cima dela.',
      state: { deck: deck.map((c) => `${c.id}:${c.decor}/${c.flowers}`), seam, fireflies: { count, lit: lit.length } },
    });
  },
};

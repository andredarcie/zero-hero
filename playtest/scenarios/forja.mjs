// A CADEIA DO FERRO — a quimica de verdade virando linha de producao.
//
// Ate aqui o veio cuspia `iron` pronto, e isso era uma mentira barata: minerio de ferro e OXIDO
// preso em rocha (hematita, magnetita) — quimicamente, ferrugem. Nao se forja, nao se martela.
// Para virar metal ele precisa de carvao, e nao pelo motivo que todo mundo supoe: o carvao nao da
// calor, ele ROUBA O OXIGENIO (Fe2O3 + 3CO -> 2Fe + 3CO2). E o que sai do forno nao e barra: e
// uma esponja encharcada de escoria, que so vira ferro depois de APANHAR.
//
// A cadeia inteira, e cada bloco abaixo prova um elo:
//
//   1. MINERIO      — o veio e o extrator entregam `ore`, nunca `iron`.
//   2. O FORNO      — minerio + carvao viram ESPONJA; minerio sozinho nao vira nada.
//   3. A MAO        — tres marteladas no botao A transformam a esponja em ferro, no mesmo tile.
//   4. O MARTINETE  — ligado na rede, ele da as mesmas tres pancadas sozinho.
//   5. A ESCADA     — o ferro que saiu dali alimenta a bancada: ferro+ferro = engrenagem.
//
// Autoria pelo EditorStore + P, o padrao da casa: o cenario AUTORA a fixture de que precisa.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const waitFor = async (driver, read, ok, timeoutMs = 12000, arg = undefined) => {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  for (;;) {
    last = await driver.page.evaluate(read, arg);
    if (ok(last)) return last;
    if (Date.now() >= deadline) return last;
    await sleep(140);
  }
};

export default {
  name: 'forja',
  description: 'A cadeia do ferro: minerio + carvao no forno viram esponja, e a esponja vira ferro na martelada (mao e martinete).',
  needsGame: false,
  route: '/lab',
  async run({ driver, shot, assert, log }) {
    await driver.settle(3000);

    // ── FIXTURE ────────────────────────────────────────────────────────────────
    // Uma faixa limpa com: um veio, um forno olhando pro leste, um martinete e a usina que o
    // move (fogueira + caldeira + um cabo encostado no martinete).
    log('EDITOR: veio, forno, martinete e a usina que o alimenta');
    const authored = await driver.page.evaluate(() => {
      const store = window.__scene?.store;
      if (!store) return 'sem store no editor';
      for (let x = 1; x <= 11; x += 1) {
        for (let y = 1; y <= 10; y += 1) {
          store.eraseEntitiesAt(x, y);
          store.setCell('upper', x, y, null);
          store.setCell('collision', x, y, false);
        }
      }
      // O forno olha pro LESTE: bandejas em (2,3) e (3,3), saida em (5,3).
      store.placeEntity({ list: 'props', type: 'furnace', worldX: 4, worldY: 3, dir: 1 });
      // O martinete tambem pro leste: ele malha o tile (5,7).
      store.placeEntity({ list: 'props', type: 'tripHammer', worldX: 4, worldY: 7, dir: 1 });
      // A usina: fogueira acesa + caldeira, e um cabo encostado no martinete.
      store.placeEntity({ list: 'props', type: 'campfire', worldX: 1, worldY: 9 });
      store.placeEntity({ list: 'props', type: 'boiler', worldX: 2, worldY: 9 });
      for (let x = 3; x <= 4; x += 1) store.placeEntity({ list: 'props', type: 'wire', worldX: x, worldY: 9 });
      store.placeEntity({ list: 'props', type: 'wire', worldX: 4, worldY: 8 });
      store.placeEntity({ list: 'props', type: 'ironRock', worldX: 9, worldY: 2 });
      return store.allEntities().filter((e) => e.list === 'props' && (e.type === 'furnace' || e.type === 'tripHammer')).length;
    });
    assert('o store guarda forno e martinete', authored === 2, `veio ${authored}`);

    log('LAB: P joga o mundo editado');
    await driver.press('p', { count: 1 });
    await driver.settle(2500);

    // A fogueira e acesa AQUI, e nao no editor: o `lit` do schema e so um override de autoria, e
    // quem o runtime acende sozinho e a fogueira mais proxima do playerStart (ver worldSchema).
    // Sem chama nao ha vapor, sem vapor nao ha watt, e o martinete fica parado por um motivo que
    // nada nesta cadeia tem a ver com ferro.
    await driver.page.evaluate(() => {
      const s = window.__scene;
      s.campfires.find((c) => c.worldX === 1 && c.worldY === 9)?.light();
      // A caldeira pede DOIS elementos: fogo e agua. Dar so o fogo deixa o martinete parado por
      // um motivo que nada tem a ver com esta cadeia (ver o cenario `caldeira`).
      s.boilers.find((b) => b.worldX === 2 && b.worldY === 9)?.fillWater();
    });
    await driver.settle(1200);

    const st = () => driver.page.evaluate(() => window.gameDebug.getState());
    const kindAt = (x, y) => driver.page.evaluate(
      (p) => window.__scene.itemManager.kindAt(p[0], p[1]), [x, y],
    );

    // ── 1. O VEIO ENTREGA MINERIO, NAO FERRO ──────────────────────────────────
    // E a linha que muda tudo: enquanto a pedra dava metal pronto, o forno nao tinha razao de
    // existir. Provamos pelo caminho do EXTRATOR, que e o que roda sozinho.
    log('MINERIO: a rocha de veio entrega `ore`');
    const veio = await driver.page.evaluate(() => {
      const s = window.__scene;
      const rock = s.rocks.find((r) => r.ore);
      if (!rock) return null;
      s.dropProduct('ore', rock.worldX + 1, rock.worldY);
      return { x: rock.worldX + 1, y: rock.worldY };
    });
    assert('o mundo tem um veio', veio !== null, 'nenhum ironRock');
    assert('e o que sai dele e MINERIO', await kindAt(veio.x, veio.y) === 'ore', 'nao veio ore');

    // ── 2. O FORNO: minerio + carvao = ESPONJA ────────────────────────────────
    const furnace = (await st()).furnaces[0];
    assert('o forno expoe as duas bandejas', furnace.slots?.length === 2, JSON.stringify(furnace.slots));
    const [sA, sB] = furnace.slots;
    const out = furnace.output;

    // Primeiro a RECUSA silenciosa: minerio sozinho nao e uma fornada. Sem carvao nao ha CO, e
    // sem CO o minerio continua sendo pedra — o forno simplesmente nao acende.
    log('FORNO: minerio SOZINHO nao vira nada (falta o reagente)');
    await driver.page.evaluate((s) => window.__scene.itemManager.drop('ore', s[0], s[1]), sA);
    await sleep(1800);
    const semCarvao = await st();
    assert('sem carvao o forno nem comeca', semCarvao.furnaces[0].smelted === 0
      && semCarvao.furnaces[0].busy === false, JSON.stringify(semCarvao.furnaces[0]));
    assert('e o minerio continua na bandeja', await kindAt(sA[0], sA[1]) === 'ore', 'o minerio sumiu');

    // ── 2b. AS BANDEJAS NAO PEDEM MAIS NADA ───────────────────────────────────
    // O forno pregava dois itens translucidos nas bandejas ("minerio aqui, carvao ali"), de quando
    // ele sabia UMA receita e nao tinha menu. Com o catalogo — que ja sabe duas e vai saber mais —
    // um pedido permanente de uma delas MENTE sobre a maquina: quem chega com duas madeiras via o
    // forno pedindo minerio. Quem pede agora e o catalogo (bloco 7); a bandeja e a boca das
    // MAQUINAS, e maquina nao le fantasma.
    log('FORNO: as bandejas nao anunciam mais receita nenhuma');
    const pedido = await driver.page.evaluate(() => ({
      fantasmas: window.__scene.furnaces[0].needsGhosts ?? null,
      // O que sobrou desenhado no chao: a marca da bandeja, que e onde a esteira entrega.
      bandejas: window.__scene.furnaces[0].slotTiles.length,
    }));
    assert('o pedido em fantasma foi ARRANCADO da maquina',
      pedido.fantasmas === null, JSON.stringify(pedido));
    assert('...e as duas bandejas continuam existindo (a boca das maquinas)',
      pedido.bandejas === 2, JSON.stringify(pedido));

    // A captura: o herói ao lado, uma bandeja servida e a outra vazia, sem legenda nenhuma.
    await driver.page.evaluate((f) => {
      const s = window.__scene;
      s.playerWorld = { worldX: f[0], worldY: f[1] + 2 };
      s.movementController.syncPlayerToWorld(f[0], f[1] + 2, s.tileSize);
    }, [4, 3]);
    await sleep(500);
    await shot('forja-forno-pedindo');

    log('FORNO: minerio + CARVAO viram ESPONJA');
    // O heroi vai para perto ANTES da fornada: a captura desta etapa e a unica prova visual de
    // que a boca acende e a fumaca sai, e a camera segue o heroi.
    await driver.page.evaluate((o) => {
      const s = window.__scene;
      s.playerWorld = { worldX: o[0] + 1, worldY: o[1] + 1 };
      s.movementController.syncPlayerToWorld(o[0] + 1, o[1] + 1, s.tileSize);
    }, out);
    await sleep(400);
    await driver.page.evaluate((s) => window.__scene.itemManager.drop('charcoal', s[0], s[1]), sB);
    await sleep(1600);
    await shot('forja-forno-aceso');
    const esponja = await waitFor(
      driver,
      (o) => window.__scene.itemManager.kindAt(o[0], o[1]),
      (k) => k !== null,
      15000,
      out,
    );
    assert('o forno entregou a ESPONJA', esponja === 'bloom', `veio ${esponja}`);
    assert('e ele comeu os dois insumos', await kindAt(sA[0], sA[1]) === null
      && await kindAt(sB[0], sB[1]) === null, 'sobrou insumo na bandeja');
    await shot('forja-esponja');

    // ── 3. A MAO: tres marteladas viram ferro, NO MESMO TILE ──────────────────
    // Uma bigorna nao carrega nada: a esponja vira barra onde estava. E isso e o que permite uma
    // esteira passar por ali sem junta nenhuma.
    log('MAO: tres marteladas com o A transformam a esponja em FERRO');
    await driver.page.evaluate((o) => {
      const s = window.__scene;
      s.inventory.clear();
      s.inventory.add('pickaxe', 1);
      s.inventory.select('pickaxe');
      // DOIS tiles a leste da esponja: um item nao bloqueia, entao andar contra ele poe o heroi
      // EM CIMA. Um passo o deixa colado e encarando — que e como um jogador chega de verdade.
      s.playerWorld = { worldX: o[0] + 2, worldY: o[1] };
      s.movementController.syncPlayerToWorld(o[0] + 2, o[1], s.tileSize);
    }, out);
    await sleep(300);
    await driver.press('ArrowLeft', { count: 1 }); // um passo: agora encara a esponja
    await sleep(300);
    // MARTELAR E O X: bater na esponja e uma linha da tabela de itens, e a tabela inteira mudou de
    // botao (o Z ficou so com a espada — e ninguem malha ferro quente com o fio de uma lamina).
    // A cadencia e real (USE_COOLDOWN_MS + a raiz do golpe): apertar rapido demais faz o pedido
    // cair no buffer e a contagem sair menor do que o numero de teclas apertadas.
    for (let i = 0; i < 2; i += 1) { await driver.press('x', { count: 1 }); await sleep(750); }
    assert('duas pancadas ainda NAO bastam', await kindAt(out[0], out[1]) === 'bloom',
      'virou ferro cedo demais');
    await driver.press('x', { count: 1 });
    await sleep(750);
    assert('a TERCEIRA vira ferro, no mesmo tile', await kindAt(out[0], out[1]) === 'iron',
      `ficou ${await kindAt(out[0], out[1])}`);
    await shot('forja-martelada');

    // ── 4. O MARTINETE: a peca entra NELE, e sai saltando ─────────────────────
    // A bigorna virou a BASE da maquina. Antes ela era o tile a frente — chao comum —, e isso teve
    // dois custos medidos: a peca nascia virada para onde o heroi olhava (a bigorna caia dois tiles
    // adiante de quem instalava) e uma esteira passando por baixo roubava a esponja antes do
    // primeiro golpe. Agora ha UM lugar, ele e dentro do corpo, e ninguem passa por dentro dele.
    log('MARTINETE: a esponja entra na bigorna dele e o ferro SALTA para fora');
    const hammer = (await st()).tripHammers[0];
    assert('o martinete esta na rede', hammer.power > 0, JSON.stringify(hammer));
    const carregou = await driver.page.evaluate(() => {
      const s = window.__scene;
      // O heroi sai de perto: o que esta sendo provado e a maquina trabalhando SOZINHA.
      s.playerWorld = { worldX: 9, worldY: 9 };
      s.movementController.syncPlayerToWorld(9, 9, s.tileSize);
      const h = s.tripHammers[0];
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) s.itemManager.takeAt(h.worldX + dx, h.worldY + dy);
      }
      return { aceitou: h.accept('bloom'), ferrosAntes: s.itemManager.snapshot().filter((i) => i.kind === 'iron').length };
    });
    assert('a esponja entrou na bigorna', carregou.aceitou === true, `accept=${carregou.aceitou}`);
    // A CALDEIRA E CONSUMIVEL: um balde banca 45s de fervura (WATER_BOIL_MS), e este cenario leva
    // bem mais que isso para chegar ate aqui (extrator, forno, tres marteladas a mao). Sem este
    // recarregamento o martinete fica parado por FALTA DE AGUA — um motivo que nada tem a ver com
    // a cadeia do ferro, e que faz o bloco inteiro falhar dizendo a coisa errada.
    await driver.page.evaluate(() => window.__scene.boilers.forEach((b) => b.fillWater()));
    // ESPERAR PELO FERRO NOVO, e nao por "existe ferro": a martelada A MAO (passo 3) ja deixou um
    // lingote no chao, entao a condicao antiga era verdadeira no primeiro frame — o cenario lia a
    // bigorna antes de a maquina ter dado a primeira pancada e acusava um martinete parado que so
    // estava comecando.
    const saltou = await waitFor(
      driver,
      () => window.__scene.itemManager.snapshot().filter((i) => i.kind === 'iron').length,
      (n) => n > carregou.ferrosAntes,
      15000,
    );
    assert('as tres pancadas viram FERRO', saltou > carregou.ferrosAntes,
      `ferros=${saltou} antes=${carregou.ferrosAntes}`);
    const ondeCaiu = await driver.page.evaluate(() => {
      const s = window.__scene;
      const h = s.tripHammers[0];
      const ferro = s.itemManager.snapshot().filter((i) => i.kind === 'iron');
      return {
        naBigorna: h.carrying,
        vizinho: ferro.some((i) => Math.abs(i.worldX - h.worldX) <= 1
          && Math.abs(i.worldY - h.worldY) <= 1),
        emCima: ferro.some((i) => i.worldX === h.worldX && i.worldY === h.worldY),
      };
    });
    assert('e o ferro SALTOU para um tile livre em volta',
      ondeCaiu.vizinho === true && ondeCaiu.emCima === false, JSON.stringify(ondeCaiu));
    assert('a bigorna ficou vazia para a proxima peca', ondeCaiu.naBigorna === null,
      JSON.stringify(ondeCaiu));
    await shot('forja-martinete');

    // ── 4b. A BIGORNA ACEITA TUDO, E TRABALHA UMA COISA SO ────────────────────
    // Ela aceita qualquer carga de proposito — o braco robotico precisa poder largar sem saber o
    // que ela quer, senao um braco que decide errado perde a carga em silencio. O que ela nao faz e
    // MARTELAR o que nao sabe trabalhar: com uma pedra dentro fica parada, e o B devolve a pedra.
    log('BIGORNA: ela aceita uma pedra, nao martela, e devolve');
    const pedra = await driver.page.evaluate(() => {
      const h = window.__scene.tripHammers[0];
      return { entrou: h.accept('stone'), carga: h.carrying };
    });
    assert('a bigorna aceitou a pedra', pedra.entrou === true && pedra.carga === 'stone',
      JSON.stringify(pedra));
    await sleep(2600);
    const parada = await driver.page.evaluate(() => {
      const h = window.__scene.tripHammers[0];
      return {
        carga: h.carrying,
        golpes: h.blowsLanded,
        rodando: h.isRunning,
        virouFerro: window.__scene.itemManager.snapshot().filter((i) => i.kind === 'iron').length,
      };
    });
    assert('com pedra dentro ele NAO martela', parada.golpes === 0 && parada.rodando === false,
      JSON.stringify(parada));
    assert('e a pedra continua sendo pedra', parada.carga === 'stone', JSON.stringify(parada));
    const devolveu = await driver.page.evaluate(() => window.__scene.tripHammers[0].release());
    assert('e o gesto simetrico devolve a carga', devolveu === 'stone', `veio ${devolveu}`);

    // ── 5. A ESCADA CONTINUA: o ferro alimenta a bancada ──────────────────────
    // A cadeia so vale se ela DESEMBOCA no que ja existia: ferro + ferro = engrenagem. Sem este
    // bloco, a reforma teria criado dois itens novos e um beco sem saida.
    log('ESCADA: o ferro forjado ainda e o insumo da engrenagem');
    const receita = await driver.page.evaluate(() => {
      const r = window.__scene.constructor;
      return typeof r === 'function';
    });
    assert('a cena esta viva para a checagem final', receita === true, 'cena morta');
    const daBancada = await driver.page.evaluate(async () => {
      const { toolboxResult } = await import('/src/game/objects/toolboxRecipes.ts');
      return {
        gear: toolboxResult('iron', 'iron'),
        hammer: toolboxResult('gear', 'bloom'),
        furnace: toolboxResult('stone', 'stone'),
        oreNada: toolboxResult('ore', 'ore'),
      };
    });
    assert('ferro + ferro continua dando ENGRENAGEM', daBancada.gear === 'gear', JSON.stringify(daBancada));
    assert('engrenagem + esponja da o MARTINETE', daBancada.hammer === 'tripHammer', JSON.stringify(daBancada));
    assert('pedra + pedra da o FORNO (a unica maquina sem metal)', daBancada.furnace === 'furnace',
      JSON.stringify(daBancada));
    assert('e MINERIO nao e insumo de bancada nenhuma', daBancada.oreNada === null,
      JSON.stringify(daBancada));

    // ── 6. PISAR APANHA — TUDO ────────────────────────────────────────────────
    // A lei da casa era "nada entra por pisada, pegar e o B", com minerio e cabo de excecao. As
    // duas cairam juntas: o X virou "usar o item selecionado" e o gesto de LARGAR deixou de
    // existir, e sem largar nao ha mao a ser roubada — apanhar sem querer parou de poder custar
    // alguma coisa. O que este passo guarda hoje e o que sobrou de perigoso: guardar NAO troca o
    // item selecionado (`Inventory.stash`), e materia-prima nao ocupa slot da bolsa.
    log('PISADA: tudo entra andando — minerio, cabo E ferramenta');
    const pisada = await driver.page.evaluate(async () => {
      const s = window.__scene;
      s.inventory.clear();
      const y = 5;
      for (let x = 1; x <= 6; x += 1) {
        s.itemManager.takeAt(x, y);
        s.collisions?.delete?.(`${x},${y}`);
      }
      s.playerWorld.worldX = 1; s.playerWorld.worldY = y;
      s.itemManager.drop('ore', 2, y);
      s.itemManager.drop('wire', 3, y, undefined, undefined, 5);
      s.itemManager.drop('pickaxe', 4, y);
      return [2, 3, 4].map((x) => s.itemManager.kindAt(x, y));
    });
    assert('a fixture da pisada esta posta', JSON.stringify(pisada) === '["ore","wire","pickaxe"]',
      JSON.stringify(pisada));
    // UM PASSO POR VEZ, esperando a cerimonia. Pisar num tipo INEDITO abre o "ITEM GET", que
    // prende os pes ate fechar — e a tecla seguinte vira "pular a cerimonia" em vez de andar.
    // Tres setas em rajada deixavam o heroi parado no segundo tile, e o assert media isso.
    for (let i = 0; i < 3; i += 1) {
      await driver.walk('right', 1);
      await driver.settle(400);
      await driver.page.waitForFunction(() => window.gameDebug?.getState()?.itemGetOpen === false,
        null, { timeout: 8000 });
      await driver.settle(200);
    }
    const colhido = await driver.page.evaluate(() => ({
      mochila: window.__scene.inventory.list(),
      chao: [2, 3, 4].map((x) => window.__scene.itemManager.kindAt(x, 5)),
    }));
    const temMochila = (k) => colhido.mochila.some((i) => i.kind === k);
    assert('o MINERIO entrou so de passar por cima', temMochila('ore'), JSON.stringify(colhido));
    assert('o CABO entrou so de passar por cima', temMochila('wire'), JSON.stringify(colhido));
    // A PICARETA TAMBEM ENTRA ANDANDO, e isto e o oposto do que este assert cobrava: a lista de
    // excecoes morreu junto com o gesto de LARGAR (sem largar, apanhar sem querer nao custa nada —
    // ver GameScene.collectUnderfoot). O que continua valendo, e e o que importa, e que apanhar
    // NAO troca o item da mao: a selecao e do jogador.
    assert('a PICARETA tambem sobe — e sem roubar a mao', temMochila('pickaxe'),
      JSON.stringify(colhido));

    // O CARVAO tambem entra andando — e ele e a materia mais consumivel das tres, porque cada
    // fornada come um. A regra ANTIGA continua ganhando: com a tocha ACESA, pisar nele o QUEIMA em
    // vez de guarda-lo. As duas convivem porque a pergunta e a mesma (passar por cima faz algo) e
    // qual das duas depende de uma coisa que o jogador escolheu e esta vendo na mao.
    log('CARVAO: entra andando; mas com a tocha ACESA ele e COMIDO');
    await driver.page.evaluate(() => {
      const s = window.__scene;
      s.inventory.clear();
      for (let x = 1; x <= 6; x += 1) s.itemManager.takeAt(x, 5);
      s.playerWorld.worldX = 1; s.playerWorld.worldY = 5;
      s.movementController.syncPlayerToWorld(1, 5, s.tileSize);
      s.itemManager.drop('charcoal', 2, 5);
    });
    await driver.walk('right', 1);
    await driver.settle(500);
    const semTocha = await driver.page.evaluate(() => window.__scene.inventory.count('charcoal'));
    assert('sem tocha, o carvao entra andando', semTocha === 1, `count=${semTocha}`);
    const comTocha = await driver.page.evaluate(async () => {
      const s = window.__scene;
      s.inventory.clear();
      s.inventory.add('wood', 1);
      // `isTorchLit` e DERIVADO (mao === graveto && heldOnFire) — nao ha booleano proprio para
      // ligar. Um teste que tentasse `s.isTorchLit = true` mediria o proprio engano.
      s.heldOnFire = true;
      s.torchFuelMs = 900;
      s.itemManager.drop('charcoal', 4, 5);
      return { antes: Math.round(s.torchFuelMs) };
    });
    await driver.walk('right', 2);
    await driver.settle(500);
    const queimou = await driver.page.evaluate(() => ({
      carvao: window.__scene.inventory.count('charcoal'),
      fuel: Math.round(window.__scene.torchFuelMs),
    }));
    assert('com a tocha acesa o carvao NAO entra na mochila', queimou.carvao === 0,
      JSON.stringify(queimou));
    assert('ele reabastece a chama', queimou.fuel > comTocha.antes, JSON.stringify(queimou));

    // ── 7. O FORNO FUNCIONA IGUAL A BANCADA ───────────────────────────────────
    // O A nele abria os fantasmas das bandejas e balancava; agora abre a MESMA tela da mesa, com o
    // que ele sabe fazer. Eram duas gramaticas para o mesmo botao contra o mesmo tipo de maquina.
    log('FORNO: o A abre o catalogo DELE, e confirmar funde da mochila para o chao');
    await driver.page.evaluate(() => {
      const s = window.__scene;
      const f = s.furnaces[0];
      s.inventory.clear();
      s.heldOnFire = false;
      for (const [k, n] of [['ore', 2], ['charcoal', 2]]) { s.inventory.add(k, n); s.seenItems.add(k); }
      // limpa o entorno: a esponja precisa de chao livre, e as bandejas com carga fariam a maquina
      // comecar uma fornada de bandeja no meio do teste do gesto de MAO.
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) s.itemManager.takeAt(f.worldX + dx, f.worldY + dy);
      }
      s.playerWorld.worldX = f.worldX; s.playerWorld.worldY = f.worldY + 1;
      s.movementController.syncPlayerToWorld(f.worldX, f.worldY + 1, s.tileSize);
    });
    await driver.settle(400);
    await driver.walk('up', 1);   // a alvenaria do forno e solida: o passo so VIRA o heroi
    await driver.settle(400);
    await driver.press('z', { count: 1 });
    await driver.settle(600);
    const painel = await driver.page.evaluate(() => ({
      titulo: document.querySelector('.zh-order-title')?.textContent ?? null,
      familias: [...document.querySelectorAll('.zh-order-family')].map((h) => h.textContent),
      cartas: [...document.querySelectorAll('[data-kind]')].map((c) => c.dataset.kind),
      rodape: document.querySelector('.zh-order-foot')?.textContent ?? '',
      arteOk: [...document.querySelectorAll('.zh-order-art')].every((i) => i.naturalWidth > 0),
    }));
    assert('o A no forno abre o catalogo', painel.cartas.length > 0, JSON.stringify(painel));
    // O FORNO SABE DUAS COISAS, e a ordem entre elas e a da propria quimica: primeiro a CARVOARIA
    // (lenha cozida sem oxigenio), e e com o carvao dela que o minerio vira esponja. Elas aparecem
    // na escada, uma de cada vez (ver catalogSteps) — aqui o jogador ja fez carvao, entao a mesa
    // mostra as duas. E nenhuma das duas e do livro da BANCADA: a estacao continua separando.
    assert('e ele lista SO as receitas dele (nao o livro da bancada)',
      painel.cartas.every((k) => ['charcoal', 'bloom'].includes(k)) && painel.cartas.includes('bloom'),
      JSON.stringify(painel));
    assert('a tela fala de FUNDIR, nao de construir',
      /SMELT/i.test(painel.titulo ?? '') && /smelt/i.test(painel.rodape), JSON.stringify(painel));
    // O cabecalho de FAMILIA morreu com a escada: a mesa mostra uma ou duas cartas, e um titulo
    // "FUNDICAO" em cima de uma carta so e maior que o conteudo que ele organiza.
    assert('e nao ha mais cabecalho de familia nenhum',
      painel.familias.length === 0, JSON.stringify(painel));
    await shot('forja-forno-catalogo');
    await driver.press('z', { count: 1 });
    await driver.settle(500);
    // A FORNADA E UM PROCESSO. Confirmar fecha o painel e ACENDE a maquina: os insumos ja sairam da
    // mochila, mas a peca ainda esta LA DENTRO — ela so pula pela boca quando a fornada termina
    // (ver FurnaceObject.startHandSmelt). Antes disso o item aparecia no chao no mesmo frame do
    // aperto, com a maquina ainda apagada.
    const trabalhando = await driver.page.evaluate(() => {
      const s = window.__scene;
      return {
        aberto: !!document.querySelector('.zh-order-card'),
        fase: s.furnaces[0].currentPhase,
        ore: s.inventory.count('ore'),
        charcoal: s.inventory.count('charcoal'),
        esponjas: s.itemManager.snapshot().filter((i) => i.kind === 'bloom').length,
      };
    });
    assert('confirmar FECHA o painel e poe o forno pra trabalhar',
      trabalhando.aberto === false && trabalhando.fase === 'smelting', JSON.stringify(trabalhando));
    assert('...gastando os insumos JA, mas sem a esponja no chao ainda',
      trabalhando.ore === 1 && trabalhando.charcoal === 1 && trabalhando.esponjas === 0,
      JSON.stringify(trabalhando));
    await shot('forja-forno-fundindo');
    // ...e no fim ela SALTA da boca. O tempo aqui e o ciclo de mao (1,6s) mais o voo (0,42s).
    await driver.page.waitForFunction(
      () => window.__scene.itemManager.snapshot().some((i) => i.kind === 'bloom'),
      null, { timeout: 8000 },
    );
    await driver.settle(200);
    const fundiu = await driver.page.evaluate(() => {
      const s = window.__scene;
      const f = s.furnaces[0];
      const esponjas = s.itemManager.snapshot().filter((i) => i.kind === 'bloom');
      return {
        aberto: !!document.querySelector('.zh-order-card'),
        ore: s.inventory.count('ore'),
        charcoal: s.inventory.count('charcoal'),
        naMochila: s.inventory.count('bloom'),
        naBoca: esponjas.some((i) => i.worldX === f.outputTile[0] && i.worldY === f.outputTile[1]),
        sobOsPes: esponjas.some((i) => i.worldX === s.playerWorld.worldX
          && i.worldY === s.playerWorld.worldY),
        fase: f.currentPhase,
        fornadas: f.smeltCount,
      };
    });
    assert('a fornada gastou UM minerio e UM carvao da mochila',
      fundiu.ore === 1 && fundiu.charcoal === 1, JSON.stringify(fundiu));
    // A ESPONJA SAI PELA BOCA — o tile da frente, o mesmo de onde uma esteira a tiraria. Antes ela
    // caia num vizinho qualquer escolhido pela distancia ate o heroi.
    assert('a esponja saiu pela BOCA do forno, e nao na mochila',
      fundiu.naBoca === true && fundiu.naMochila === 0, JSON.stringify(fundiu));
    assert('nem debaixo do heroi', fundiu.sobOsPes === false, JSON.stringify(fundiu));
    assert('e o forno voltou a esfriar, com a fornada contada',
      fundiu.fase === 'idle' && fundiu.fornadas >= 1, JSON.stringify(fundiu));
    assert('e o painel fechou', fundiu.aberto === false, JSON.stringify(fundiu));
  },
};

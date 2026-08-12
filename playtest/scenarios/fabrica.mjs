// A FABRICA — a reforma que transformou o circuito num sistema de producao.
//
// Ate aqui, "maquina" era prop AUTORADO: cabo, caldeira e braco so nasciam de um `world.json`
// escrito no /editor, e energia era um BOOLEANO. As duas coisas juntas faziam do circuito um
// puzzle (o autor desenha a fabrica, o jogador a percorre) e nunca uma fabrica — porque ligar o
// decimo braco na mesma roda custava o mesmo que ligar o primeiro, e porque o jogador nunca
// ligava nada.
//
// Este cenario guarda as CINCO pecas dessa reforma, e cada bloco abaixo prova uma:
//
//   1. RECEITA      — ferro+ferro = engrenagem (o bem intermediario), engrenagem+X = maquina.
//   2. INSTALAR     — o botao A poe a maquina no tile a frente, virada pra onde o heroi olha;
//                     o B de mao vazia a recolhe. E so a do JOGADOR se recolhe.
//   3. ESTEIRA+BAU  — a carga anda sozinha tile a tile e ACUMULA no bau (o fim de linha).
//   4. EXTRATOR     — o veio de ferro minerado sem as maos do heroi.
//   5. GARGALO      — a peca central: demanda acima da oferta NAO para nada, faz TUDO arrastar
//                     na proporcao exata (satisfaction < 1), e a conta se le no proprio cabo.
//
// Autoria pelo EditorStore + P, o padrao de braco/roda/caldeira/fios: o cenario AUTORA a fixture
// de que precisa em vez de depender do conteudo de um level.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Espera uma condicao sobre o gameDebug, devolvendo a ultima leitura (para a mensagem do assert). */
const waitFor = async (driver, read, ok, timeoutMs = 8000, arg = undefined) => {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  for (;;) {
    // `arg` ATRAVESSA: sem ele um `read` escrito como `(o) => ...` recebe `undefined` dentro da
    // pagina e estoura num TypeError que se parece com um defeito do jogo.
    last = await driver.page.evaluate(read, arg);
    if (ok(last)) return last;
    if (Date.now() >= deadline) return last;
    await sleep(150);
  }
};

export default {
  name: 'fabrica',
  description: 'A fabrica: receita com engrenagem, instalar/recolher com A e B, esteira, bau, extrator e o GARGALO.',
  needsGame: false, // entra no editor; a GameScene nasce no P (a razao de sempre: fixture autorada)
  route: '/lab',
  async run({ driver, shot, assert, log }) {
    await driver.settle(3000);

    // ── FIXTURE ────────────────────────────────────────────────────────────────
    // Uma faixa limpa, uma bancada com as duas bandejas, um veio de ferro, e uma
    // fogueira+caldeira que serao a unica fonte de energia do teste do gargalo.
    log('EDITOR: faixa limpa + bancada + veio de ferro + fogueira/caldeira');
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
      // A bancada olha pro LESTE: as duas bandejas ficam a oeste dela, a saida a leste.
      store.placeEntity({ list: 'props', type: 'toolbox', worldX: 4, worldY: 3, dir: 1 });
      // O veio: a rocha que NUNCA quebra, e o unico alimento do extrator.
      store.placeEntity({ list: 'props', type: 'ironRock', worldX: 9, worldY: 7 });
      // A usina do teste do gargalo.
      store.placeEntity({ list: 'props', type: 'campfire', worldX: 1, worldY: 9 });
      store.placeEntity({ list: 'props', type: 'boiler', worldX: 2, worldY: 9 });
      return store.allEntities().filter((e) => e.list === 'props').length;
    });
    assert('o store guarda a fixture', authored === 4, `veio ${authored}`);

    log('LAB: P joga o mundo editado');
    await driver.press('p', { count: 1 });
    await driver.settle(2500);

    // A bancada olhando pro leste tem as bandejas em (3,2) e (3,4) — leia do jogo, nunca chute.
    const slots = await driver.page.evaluate(
      () => window.gameDebug.getState().toolboxes[0].slots,
    );
    assert('a bancada expoe as duas bandejas', Array.isArray(slots) && slots.length === 2,
      JSON.stringify(slots));

    // ── 1. A RECEITA: ferro + ferro = ENGRENAGEM ──────────────────────────────
    // E a unica receita do jogo cujos dois insumos sao a MESMA coisa, e e assim que a familia
    // nova se anuncia: quem entendeu graveto+pedra=machado entende engrenagem+X=maquina.
    log('RECEITA: ferro + ferro -> engrenagem (o bem INTERMEDIARIO)');
    await driver.page.evaluate((s) => {
      window.__scene.itemManager.drop('iron', s[0][0], s[0][1]);
      window.__scene.itemManager.drop('iron', s[1][0], s[1][1]);
    }, slots);
    const out = await driver.page.evaluate(() => window.gameDebug.getState().toolboxes[0].output);
    const gear = await waitFor(
      driver,
      (o) => window.__scene.itemManager.snapshot()
        .filter((i) => i.worldX === o[0] && i.worldY === o[1])
        .map((i) => ({ kind: i.kind, units: i.units })),
      (made) => made.length > 0,
      12000,
      out,
    );
    assert('a bancada forjou a ENGRENAGEM', gear[0]?.kind === 'gear', JSON.stringify(gear));
    assert('e ela sai UMA por forja', gear[0]?.units === 1, JSON.stringify(gear));
    await shot('fabrica-engrenagem');

    // O PACOTE DE CABO: a unica receita que sai em QUATRO, e a unica linha desta reforma que o
    // jogo real desmentiu — o `put` da bancada no GameScene ignorava o `units` que o contrato do
    // port pedia e que o `drop` sabia receber, entao a forja entregava UM cabo. O argumento novo
    // se perdeu exatamente no ponto do meio, que e onde argumento novo sempre se perde. Este
    // assert existe para esse defeito nao voltar em silencio: quem le "4" na receita tem de
    // encontrar "4" no chao.
    log('RECEITA: ferro + pedra -> PACOTE de 4 cabos');
    await driver.page.evaluate((o) => window.__scene.itemManager.takeAt(o[0], o[1]), out);
    await driver.page.evaluate((s) => {
      window.__scene.itemManager.drop('iron', s[0][0], s[0][1]);
      window.__scene.itemManager.drop('stone', s[1][0], s[1][1]);
    }, slots);
    const pack = await waitFor(
      driver,
      (o) => window.__scene.itemManager.snapshot()
        .filter((i) => i.worldX === o[0] && i.worldY === o[1])
        .map((i) => ({ kind: i.kind, units: i.units })),
      (made) => made.length > 0,
      12000,
      out,
    );
    assert('a bancada forjou CABO', pack[0]?.kind === 'wire', JSON.stringify(pack));
    assert('e ele vem em pacote de QUATRO', pack[0]?.units === 4, JSON.stringify(pack));
    await driver.page.evaluate((o) => window.__scene.itemManager.takeAt(o[0], o[1]), out);

    // ── 2. INSTALAR com o A, RECOLHER com o B ─────────────────────────────────
    // A direcao nasce de para onde o heroi OLHA — nunca de um menu. Por isso o teste vira o
    // heroi antes de instalar e depois confere o `dir` da peca.
    log('INSTALAR: o A poe a esteira no tile a frente, virada pra onde o heroi olha');
    // Mao cheia de esteiras. O heroi fica ONDE nasceu — a faixa foi limpa em volta, e o teste
    // le a posicao dele em vez de assumir uma: `playerStart` e do mundo, nao deste cenario.
    await driver.page.evaluate(() => window.__scene.inventory.add('belt', 3));
    const hero = await driver.page.evaluate(() => window.gameDebug.getState().player);
    await driver.face('right');
    await driver.attack(1);
    await driver.settle(400);
    const built = await driver.page.evaluate(() => window.gameDebug.getState().belts);
    assert('o A INSTALOU uma esteira', built.length === 1, JSON.stringify(built));
    assert('ela nasceu no tile A FRENTE do heroi',
      built[0]?.worldX === hero.worldX + 1 && built[0]?.worldY === hero.worldY,
      `${JSON.stringify(built[0])} vs heroi ${JSON.stringify(hero)}`);
    assert('virada para onde o heroi olhava (leste = 1)', built[0]?.dir === 1,
      JSON.stringify(built[0]));
    assert('marcada como construida pelo JOGADOR (so ela se recolhe)',
      built[0]?.playerBuilt === true, JSON.stringify(built[0]));
    const afterBuild = await driver.page.evaluate(
      () => window.gameDebug.getState().inventory.find((i) => i.kind === 'belt')?.count ?? 0,
    );
    assert('a peca saiu da mochila ao ser instalada', afterBuild === 2, `restaram ${afterBuild}`);

    // A ESTEIRA E CHAO: o heroi pisa nela. Uma linha longa que fosse solida viraria um muro, e o
    // jogador passaria o jogo contornando a propria fabrica.
    const walkable = await driver.page.evaluate(
      (b) => window.__scene.isSolidForEntities(b.worldX, b.worldY, false),
      built[0],
    );
    assert('a esteira NAO bloqueia — ela e chao', walkable === false);

    log('RECOLHER: o B de MAO VAZIA devolve a peca do jogador a mochila');
    await driver.page.evaluate(() => window.__scene.inventory.select('none'));
    await driver.useItem(1);
    await driver.settle(400);
    const afterPick = await driver.page.evaluate(() => ({
      belts: window.gameDebug.getState().belts.length,
      held: window.gameDebug.getState().inventory.find((i) => i.kind === 'belt')?.count ?? 0,
    }));
    assert('o B recolheu a esteira de volta', afterPick.belts === 0 && afterPick.held === 3,
      JSON.stringify(afterPick));

    // ── 3. A ESTEIRA que anda + o BAU que acumula ─────────────────────────────
    // Duas esteiras em fila apontando pro bau: a carga tem de ATRAVESSAR as duas sozinha e
    // terminar DENTRO do bau. Sem o bau, a linha entope no segundo item — que era exatamente o
    // estado do jogo antes desta reforma.
    log('LINHA: cabo -> caldeira -> duas esteiras -> bau; a carga anda sozinha e ACUMULA');
    await driver.page.evaluate(() => {
      const s = window.__scene;
      // A rede: a caldeira em (2,9) alimenta o cabo em (3,9), que toca as duas esteiras.
      s.buildTestMachine('wire', 3, 9);
      s.buildTestMachine('belt', 4, 9, 1);
      s.buildTestMachine('belt', 5, 9, 1);
      s.buildTestMachine('chest', 6, 9);
      s.boilers[0].fillWater();
      s.campfires[0].light();
      s.itemManager.drop('stone', 4, 9);
    });
    const delivered = await waitFor(
      driver,
      () => {
        const st = window.gameDebug.getState();
        return { chest: st.chests[0] ?? null, belts: st.belts.map((b) => b.power) };
      },
      (r) => r.chest?.count > 0,
      12000,
    );
    assert('as esteiras receberam energia da caldeira',
      delivered.belts.every((p) => p > 0), JSON.stringify(delivered.belts));
    assert('a carga atravessou as duas esteiras e entrou no BAU',
      delivered.chest?.kind === 'stone' && delivered.chest?.count === 1,
      JSON.stringify(delivered.chest));
    await shot('fabrica-linha');

    // ── 4. O EXTRATOR: o veio minerado sem as maos do heroi ───────────────────
    // Ele morde o tile de TRAS e poe no da FRENTE — a MESMA geometria do braco robotico, porque
    // duas maquinas com `dir` significando coisas diferentes seria a armadilha mais cara
    // possivel. Aqui ele fica a oeste do veio, entregando pro oeste.
    log('EXTRATOR: instalado de costas pro veio, ele produz ferro sozinho');
    await driver.page.evaluate(() => {
      const s = window.__scene;
      // Cabo da caldeira ate o extrator, subindo a coluna 3.
      for (let y = 8; y >= 7; y -= 1) s.buildTestMachine('wire', 3, y);
      for (let x = 4; x <= 8; x += 1) s.buildTestMachine('wire', x, 7);
      // O extrator fica ao NORTE do veio, olhando pro norte: assim ele MORDE o tile de tras —
      // (9,7), o veio — e ENTREGA no da frente, (9,5), que esta livre. E a geometria do braco,
      // e e por isso que ela nao precisa ser explicada duas vezes.
      s.buildTestMachine('wire', 8, 6); // o cabo sobe de (8,7) e encosta no extrator
      s.buildTestMachine('extractor', 9, 6, 0);
    });
    const mined = await waitFor(
      driver,
      () => {
        const st = window.gameDebug.getState();
        return {
          extractor: st.extractors[0] ?? null,
          ore: window.__scene.itemManager.snapshot()
            // MINERIO, e nao ferro: desde a cadeia do ferro o que sai de uma pedra e pedra com
            // oxido dentro, e o metal so nasce no forno (ver o cenario `forja`).
            .filter((i) => i.kind === 'ore' && i.worldX === 9 && i.worldY === 5),
        };
      },
      (r) => r.ore.length > 0,
      14000,
    );
    assert('o extrator morde o VEIO que esta atras dele',
      mined.extractor?.input?.[0] === 9 && mined.extractor?.input?.[1] === 7,
      JSON.stringify(mined.extractor));
    assert('ele esta RODANDO (tem energia e tem veio)', mined.extractor?.running === true,
      JSON.stringify(mined.extractor));
    assert('ele produziu ferro no tile da FRENTE, sem ninguem bater na pedra',
      mined.ore.length === 1, JSON.stringify(mined.ore));
    await shot('fabrica-extrator');

    // O veio NAO se gasta: e a rocha que nunca quebra, e um extrator que consumisse o proprio
    // suporte transformaria a automacao numa conta regressiva.
    const veinAlive = await driver.page.evaluate(
      () => window.__scene.isSolidForEntities(9, 7, false),
    );
    assert('o veio continua de pe depois de produzir', veinAlive === true);

    // ── 5. O GARGALO — a peca central da reforma ──────────────────────────────
    // A caldeira da 10 watts. Um extrator (4) + duas esteiras (2) cabem folgados: satisfacao 1.
    // Empilhando esteiras a demanda passa de 10, e o que acontece NAO e uma maquina parando: e
    // a fabrica inteira desacelerando na proporcao exata — e todas juntas, nunca umas sim e
    // outras nao, porque um gargalo que para so a ultima peca da fila nao se le de relance.
    log('GARGALO: demanda acima da oferta faz TUDO arrastar junto — nada para');
    const folgada = await driver.page.evaluate(() => {
      const st = window.gameDebug.getState();
      return { belts: st.belts.map((b) => b.power), ex: st.extractors[0]?.power ?? null };
    });
    assert('rede folgada: todo mundo a plena vazao',
      folgada.ex === 1 && folgada.belts.every((p) => p === 1), JSON.stringify(folgada));

    await driver.page.evaluate(() => {
      // Mais oito esteiras na MESMA rede: 8 + 2 + 4 = 14 watts pedidos contra 10 oferecidos.
      const s = window.__scene;
      for (let x = 4; x <= 7; x += 1) {
        s.buildTestMachine('belt', x, 6, 1);
        s.buildTestMachine('belt', x, 8, 1);
      }
    });
    await driver.settle(600);
    const apertada = await driver.page.evaluate(() => {
      const st = window.gameDebug.getState();
      return {
        belts: st.belts.map((b) => b.power),
        ex: st.extractors[0]?.power ?? null,
        wiresLive: st.wires.filter((w) => w.live).length,
      };
    });
    const unico = new Set(apertada.belts.concat(apertada.ex));
    assert('a rede apertada NAO desligou ninguem — todos continuam recebendo',
      apertada.ex > 0 && apertada.belts.every((p) => p > 0), JSON.stringify(apertada));
    assert('…mas todos arrastam: a satisfacao caiu abaixo de 1',
      apertada.ex < 1 && apertada.belts.every((p) => p < 1), JSON.stringify(apertada));
    assert('…e TODOS na MESMA proporcao (um numero so na rede inteira)',
      unico.size === 1, JSON.stringify([...unico]));
    assert('os cabos continuam VIVOS (a conta se le no brilho, nao num apagao)',
      apertada.wiresLive > 0, JSON.stringify(apertada));
    await shot('fabrica-gargalo');

    // E a resposta ao gargalo, que e a razao de a caldeira ser fabricavel: mais uma fonte.
    log('A RESPOSTA: construir uma segunda fonte devolve a fabrica a plena vazao');
    await driver.page.evaluate(() => {
      const s = window.__scene;
      s.buildTestMachine('boiler', 2, 7);
      s.boilers[s.boilers.length - 1].fillWater();
      s.campfires[0].light();
      // A segunda caldeira precisa de fogo ENCOSTADO nela, como a primeira.
      s.itemManager.drop('wood', 2, 6, { fuelMs: 60000 });
    });
    const recuperada = await waitFor(
      driver,
      () => {
        const st = window.gameDebug.getState();
        return { ex: st.extractors[0]?.power ?? null, belts: st.belts.map((b) => b.power) };
      },
      (r) => r.ex === 1,
      12000,
    );
    assert('com a segunda caldeira a rede voltou a bancar tudo',
      recuperada.ex === 1 && recuperada.belts.every((p) => p === 1),
      JSON.stringify(recuperada));
    await shot('fabrica-resolvida');

    // ── 6. A TRAVA DE QUANTIDADE, no level de verdade ─────────────────────────
    // Este bloco existe porque a primeira versao do level-3 FALHOU em jogo, e falhou pelo motivo
    // mais instrutivo possivel: a fechadura era energia, o jogador ligou um cabo, a porta abriu, e
    // a fabrica inteira ficou sendo cenario opcional. Uma fechadura de CHAVE se abre uma vez; uma
    // de QUANTIDADE so se abre com trabalho — e trabalho e a unica coisa que faz alguem preferir
    // a maquina a propria mao. Guardar isto e guardar a razao de a fabrica existir.
    log('LEVEL 3: a porta nao quer chave, quer VINTE minerios');
    await driver.open('/?play&level=3');
    await driver.settle(2500);

    const shape = await driver.page.evaluate(() => {
      const s = window.__scene;
      const st = window.gameDebug.getState();
      return {
        chest: st.chests[0] ?? null,
        gateSolid: s.isSolidForEntities(9, 9, false),
        // O portal tem de estar SELADO atras do portao: e isso que torna a trava real.
        portalReachableTiles: [[8, 9], [10, 8], [9, 8], [8, 10]]
          .map(([x, y]) => `${x},${y}:${s.isSolidForEntities(x, y, false)}`),
      };
    });
    assert('a arca do level cobra uma ENCOMENDA', shape.chest?.count === 0, JSON.stringify(shape.chest));
    assert('e o portao nasce FECHADO — sem entrega, e parede', shape.gateSolid === true,
      JSON.stringify(shape));

    // A rede sozinha NAO basta: energia liga a porta, mas quem a ergue e a entrega.
    await driver.page.evaluate(() => {
      const s = window.__scene;
      s.boilers[0].fillWater();
      for (const [x, y] of [[3, 9], [4, 9], [5, 9], [6, 9], [7, 9], [8, 9]]) {
        s.buildTestMachine('wire', x, y);
      }
    });
    const soPower = await waitFor(
      driver,
      () => {
        const g = window.__scene.electronicGates[0];
        return { pow: g.isPowered, open: Number(g.openness.toFixed(2)),
          solid: window.__scene.isSolidForEntities(9, 9, false) };
      },
      (r) => r.pow === true,
      12000,
    );
    assert('a rede energiza a porta…', soPower.pow === true, JSON.stringify(soPower));
    assert('…e MESMO ASSIM ela continua parede: cabo nao e a chave',
      soPower.solid === true && soPower.open === 0, JSON.stringify(soPower));
    await shot('fabrica-porta-energizada-e-fechada');

    // A grade e a BARRA DE PROGRESSO, feita de fisica: sobe um degrau por punhado entregue, e o
    // ULTIMO punhado e o que abre (ver GameScene.gateCeiling — o percurso incompleto e comprimido
    // abaixo do limiar de passagem, senao a porta abriria com 18 de 20).
    const atCount = async (n) => {
      await driver.page.evaluate((k) => {
        const c = window.__scene.chests[0];
        while (!c.isEmpty) c.withdraw(9);
        if (k > 0) c.store('ore', k);
      }, n);
      await driver.settle(1700);
      return driver.page.evaluate(() => {
        const g = window.__scene.electronicGates[0];
        return { open: Number(g.openness.toFixed(2)),
          solid: window.__scene.isSolidForEntities(9, 9, false) };
      });
    };
    const meio = await atCount(10);
    assert('metade entregue: a grade subiu VISIVELMENTE…', meio.open > 0.3 && meio.open < 0.6,
      JSON.stringify(meio));
    assert('…e ainda barra o herói', meio.solid === true, JSON.stringify(meio));
    const quase = await atCount(19);
    assert('19 de 20 NAO abre — a porta cobra o numero que anuncia',
      quase.solid === true, JSON.stringify(quase));
    const cheia = await atCount(20);
    assert('a VIGESIMA entrega abre a porta', cheia.solid === false && cheia.open === 1,
      JSON.stringify(cheia));
    await shot('fabrica-encomenda-completa');

    // E ela NAO e um latch: tirar a carga fecha de novo. A porta segue a entrega, sempre.
    const desfeita = await atCount(0);
    assert('esvaziar a arca fecha a porta — a trava segue a entrega, nao um gatilho',
      desfeita.solid === true, JSON.stringify(desfeita));

    // A arca-fechadura recusa o que nao e a encomenda, desde o PRIMEIRO item.
    const recusa = await driver.page.evaluate(
      () => window.__scene.chests[0].accepts('stone'),
    );
    assert('a arca da encomenda so aceita o que cobra', recusa === false);

    // ── 7. A MIRA DO EXTRATOR ─────────────────────────────────────────────────
    // A regra geral de instalacao ("nasce a frente, virado pra onde voce olha") NAO consegue
    // aimar esta peca, e a descoberta custou uma pergunta do usuario: a entrada do extrator e
    // sempre um veio, veio e rocha, e para escolher aquela direcao com o corpo o heroi teria de
    // estar PISANDO na rocha. A peca era literalmente inaimavel a mao. Agora a broca procura a
    // pedra sozinha — e este assert existe porque um `dir` que volta a sair do olhar do heroi
    // deixaria o extrator inutilizavel sem quebrar nenhum outro teste.
    const mira = await driver.page.evaluate(() => {
      const s = window.__scene;
      return {
        // (7,8) no level: veio a OESTE, arca a LESTE -> de costas pro veio = LESTE (1).
        noLevel: s.extractorAim(7, 8),
        // (8,2): veio a LESTE -> OESTE (3).
        juntoAoVeioNorte: s.extractorAim(8, 2),
        // Sem veio por perto: `null`, e ai a regra geral volta a valer.
        semVeio: s.extractorAim(5, 4),
      };
    });
    assert('junto ao veio, o extrator vira de COSTAS pra ele (a broca acha a pedra)',
      mira.noLevel === 1 && mira.juntoAoVeioNorte === 3, JSON.stringify(mira));
    assert('…e longe de qualquer veio ele devolve o olhar do heroi',
      mira.semVeio === null, JSON.stringify(mira));

    // E a prova final: com a mira certa, ele entrega DENTRO da arca da encomenda.
    await driver.page.evaluate(() => {
      const s = window.__scene;
      s.buildTestMachine('extractor', 7, 8, s.extractorAim(7, 8));
    });
    const produzindo = await waitFor(
      driver,
      () => window.gameDebug.getState().chests.find((c) => c.worldX === 8 && c.worldY === 8),
      (c) => (c?.count ?? 0) > 0,
      20000,
    );
    assert('o extrator alimenta a encomenda sozinho',
      produzindo?.kind === 'ore' && produzindo.count > 0, JSON.stringify(produzindo));
    await shot('fabrica-extrator-alimentando');

    // ── 8. AS MARCAS, OS PACOTES E A REMOCAO UNIVERSAL ────────────────────────
    // Instalar era o unico gesto do jogo cujo ALVO era invisivel: todo o resto mira numa coisa que
    // ja esta la, e uma maquina nasce num chao vazio. As marcas sao o conserto, e este bloco
    // guarda a unica coisa que pode dar errado nelas — a marca e o botao discordarem. As duas
    // leem `canBuildMachineAt`; se alguem duplicar essa pergunta, um quadrado branco vai prometer
    // um gesto que o botao recusa, e isso e pior do que nao ter marca nenhuma.
    log('MARCAS: o quadrado no chao e o keycap dizem onde a peca cai');
    const marca = await driver.page.evaluate(() => {
      const s = window.__scene;
      s.inventory.add('belt', 5);
      s.movementController.facing.dx = 1; s.movementController.facing.dy = 0;
      s.syncPlacementHints();
      const h = s.placementHints;
      const p0 = window.gameDebug.getState().player;
      return {
        alvo: h.primary, marcas: h.used, keycap: h.keycap.visible,
        naFrente: { x: p0.worldX + 1, y: p0.worldY },
        // A prova de que marca e botao leem a MESMA pergunta.
        botaoConcorda: s.canBuildMachineAt('belt', p0.worldX + 1, p0.worldY),
      };
    });
    assert('com peca na mao, o tile A FRENTE ganha a marca branca',
      marca.alvo?.x === marca.naFrente.x && marca.alvo?.y === marca.naFrente.y,
      JSON.stringify(marca));
    assert('e o keycap aparece por cima dela', marca.keycap === true, JSON.stringify(marca));
    assert('a marca e o botao leem a MESMA pergunta', marca.botaoConcorda === true,
      JSON.stringify(marca));
    await shot('fabrica-marca-de-posicionamento');

    // O EXTRATOR e a razao de as marcas terem DUAS cores: ele so mora encostado num veio, e sem
    // ver os lugares validos o jogador descobriria isso por tentativa e recusa.
    const frios = await driver.page.evaluate(() => {
      const s = window.__scene;
      s.inventory.add('extractor', 1);
      s.syncPlacementHints();
      const spots = s.extractorSpots();
      return {
        lugares: spots.length,
        todosJuntoAVeio: spots.every((t) => s.extractorAim(t.x, t.y) !== null),
        // Longe de qualquer veio o gesto e RECUSADO — e a recusa aparece como AUSENCIA de marca
        // branca, nunca como uma marca vermelha (o jogo nao tem vocabulario de erro colorido).
        noMeioDoCampo: s.canBuildMachineAt('extractor', 4, 4),
      };
    });
    assert('o extrator acende os lugares validos em volta dos veios',
      frios.lugares > 0 && frios.todosJuntoAVeio, JSON.stringify(frios));
    assert('…e recusa qualquer tile longe de um veio', frios.noMeioDoCampo === false,
      JSON.stringify(frios));

    // PACOTES DE CINCO: cabo e esteira sao as duas pecas que se deitam em LINHA, e uma linha nao
    // se faz de uma peca. Pegar uma unidade por vez viraria coleta, nao construcao.
    const pacotes = await driver.page.evaluate(() => window.__scene.itemManager.snapshot()
      .filter((z) => ['wire', 'belt'].includes(z.kind))
      .map((z) => ({ kind: z.kind, units: z.units })));
    assert('cabo e esteira nascem no chao em punhados de CINCO',
      pacotes.length > 0 && pacotes.every((z) => z.units === 5), JSON.stringify(pacotes));

    // REMOCAO UNIVERSAL: tudo que se instala se recolhe, inclusive o que o mapa autorou — a
    // vitrine tem de poder ser DESMONTADA, que e a forma mais direta de descobrir do que ela e
    // feita. A unica blindada e a arca da encomenda, que nao e deposito e sim a fechadura.
    const desmonte = await driver.page.evaluate(() => {
      const s = window.__scene;
      s.inventory.select('none');
      const antes = window.gameDebug.getState().belts.length;
      const pegou = s.pickUpMachineAt(3, 7); // esteira AUTORADA da vitrine
      s.inventory.select('none');
      const arca = s.pickUpMachineAt(8, 8); // a arca da encomenda
      return { antes, depois: window.gameDebug.getState().belts.length, pegou,
        arcaRecolhida: arca, arcaAindaLa: !!s.getChestAt(8, 8) };
    });
    assert('uma peca AUTORADA tambem se recolhe com o B',
      desmonte.pegou === true && desmonte.depois === desmonte.antes - 1, JSON.stringify(desmonte));
    assert('…menos a arca da ENCOMENDA, que e a trava do level',
      desmonte.arcaRecolhida === false && desmonte.arcaAindaLa === true, JSON.stringify(desmonte));

    log('OK: engrenagem, instalar/recolher, esteira, bau, extrator, gargalo, trava de QUANTIDADE e as MARCAS.');
  },
};

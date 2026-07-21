// A CAIXA DE FERRAMENTAS: a primeira coisa do jogo que faz um item A PARTIR DE OUTROS.
//
//     (item A) (item B) [CAIXA] (resultado)
//
// O cenario entra pelo LAB, e nao por um level pronto, pelo mesmo motivo que o do braco robotico:
// a caixa e uma peca de AUTORIA, e o que se pede dela e "coloquei no editor, girei, funcionou".
// Testar sobre um arquivo ja gravado pularia justamente a parte fragil — a direcao sobrevivendo
// ao place/undo do editor, que e o que decide QUAIS tres tiles em volta ela usa.
//
// O que ele prova, nesta ordem:
//   1. GIRO: as 4 direcoes derivam as duas bandejas e a saida certas.
//   2. A TRAVA: o corpo e SOLIDO — o heroi contorna a maquina.
//   3. O GESTO: pisar numa bandeja com um item na mao DEPOSITA (o jogo nao tem botao de largar,
//      e as duas bandejas comecam vazias — sem isso a bancada seria inalimentavel).
//   4. A RECEITA: graveto + pedra viram um MACHADO no tile da frente, sozinhos.
//   5. O CONSUMO: as duas bandejas ficam vazias — os insumos foram gastos, nao copiados.
//   6. A RECUSA: um par que nao e receita nao produz nada e a caixa RECLAMA (refusalCount sobe).
//   7. A SAIDA PRESA: com o tile da frente ocupado, o produto FICA visivel dentro da caixa e sai
//      sozinho quando o lugar vaga — nunca dois itens empilhados num tile.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Um ciclo completo (abrir 240 + engolir 460 + forjar 900 + entregar 420 + fechar 260) da ~2.3s.
// O teste faz polling com folga em vez de dormir um numero magico: maquina lenta nao reprova.
const CRAFT_TIMEOUT_MS = 9000;

export default {
  name: 'caixa-ferramentas',
  description: 'A caixa de ferramentas: graveto + pedra viram um machado, e um par errado e recusado.',
  // needsGame: false de proposito — o cenario entra no EDITOR, e o startGame do harness procura
  // uma GameScene. A GameScene nasce mais tarde, quando o P levanta o mundo em memoria.
  needsGame: false,
  route: '/lab',
  async run({ driver, shot, assert, log }) {
    await driver.settle(3000);

    // Uma caixa por direcao, espalhadas o bastante para os quatro tiles de uma nao encostarem
    // nos da outra (cada caixa usa 2 tiles atras + o corpo + 1 na frente = uma linha de 4).
    const PLACED = [
      { worldX: 4, worldY: 2, dir: 0 }, // norte
      { worldX: 6, worldY: 6, dir: 1 }, // leste — a que o resto do cenario usa
      { worldX: 4, worldY: 9, dir: 2 }, // sul
      { worldX: 9, worldY: 3, dir: 3 }, // oeste
    ];

    // O lab abre sobre o level-1, um puzzle DENSO: os onze itens estao no chao e quase todo tile
    // tem lava, agua, rocha ou mato. Sem limpar, a bandeja nasce dentro de uma pedra e a maquina,
    // corretamente, nao trabalha — e o teste acusaria um defeito que nao existe.
    log('EDITOR: limpa o terreno em volta de cada caixa (o level-1 e denso demais)');
    await driver.page.evaluate((list) => {
      const store = window.__scene.store;
      const clear = (x, y) => {
        store.eraseEntitiesAt(x, y); // itens autorais, props (lava, agua, rocha, mato...)
        store.setCell('upper', x, y, null); // arvores do tileset
        store.setCell('collision', x, y, false); // colisao pintada a mao
      };
      for (const p of list) {
        for (let dx = -3; dx <= 3; dx += 1) {
          for (let dy = -3; dy <= 3; dy += 1) clear(p.worldX + dx, p.worldY + dy);
        }
      }
    }, PLACED);

    log('EDITOR: coloca uma caixa em cada uma das 4 direcoes pelo EditorStore');
    const placedOk = await driver.page.evaluate((list) => {
      const store = window.__scene?.store;
      if (!store) return 'sem store no editor';
      for (const p of list) {
        store.placeEntity({ list: 'props', type: 'toolbox', worldX: p.worldX, worldY: p.worldY, dir: p.dir });
      }
      // Le de volta o que o mundo REALMENTE guardou — e aqui que um `dir` perdido apareceria.
      // Filtra pelos tiles QUE ESTE TESTE colocou: o level-1 e um arquivo de autoria e quem
      // estiver desenhando puzzles pode ter salvo caixas proprias nele.
      const mine = new Set(list.map((q) => `${q.worldX},${q.worldY}`));
      return store.allEntities()
        .filter((e) => e.list === 'props' && e.type === 'toolbox' && mine.has(`${e.worldX},${e.worldY}`))
        .map((e) => `${e.worldX},${e.worldY},${e.dir}`)
        .sort()
        .join(' | ');
    }, PLACED);

    const expectPlaced = PLACED.map((p) => `${p.worldX},${p.worldY},${p.dir}`).sort().join(' | ');
    assert('o store guarda as 4 caixas COM a direcao', placedOk === expectPlaced, placedOk);

    // Girar no proprio tile TEM de mudar o mundo — foi o bug que o `sameEntity` do store escondia
    // quando o braco robotico ganhou direcao, e ele valeria igual aqui.
    log('EDITOR: girar uma caixa no proprio tile precisa ser uma mudanca de verdade');
    const rotatedInPlace = await driver.page.evaluate(() => {
      const store = window.__scene.store;
      store.placeEntity({ list: 'props', type: 'toolbox', worldX: 6, worldY: 6, dir: 3 });
      const box = store.allEntities().find((e) => e.list === 'props' && e.type === 'toolbox' && e.worldX === 6 && e.worldY === 6);
      return box?.dir;
    });
    assert('girar no proprio tile muda a direcao (nao e no-op)', rotatedInPlace === 3, `veio ${rotatedInPlace}`);
    await driver.page.evaluate(() => {
      window.__scene.store.placeEntity({ list: 'props', type: 'toolbox', worldX: 6, worldY: 6, dir: 1 });
    });

    // O atalho G, que e como o humano gira.
    log('EDITOR: a tecla G cicla a direcao da proxima caixa');
    await driver.page.evaluate(() => {
      window.__scene.uiState.tab = 'props';
      window.__scene.uiState.entity = { list: 'props', type: 'toolbox' };
    });
    const dirBefore = await driver.page.evaluate(() => window.__scene.uiState.propDir);
    await driver.press('g', { count: 1 });
    await sleep(200);
    const dirAfter = await driver.page.evaluate(() => window.__scene.uiState.propDir);
    assert('a tecla G cicla a direcao', dirAfter === (dirBefore + 1) % 4, `${dirBefore} -> ${dirAfter}`);

    await shot('caixa-editor');

    // ── Jogar o mundo em memoria ────────────────────────────────────────────
    log('LAB: P joga o mundo editado (nada e salvo)');
    await driver.press('p', { count: 1 });
    await driver.settle(2500);

    const boxes = await driver.page.evaluate((list) => {
      const mine = new Set(list.map((q) => `${q.worldX},${q.worldY}`));
      return (window.__scene.toolboxes ?? [])
        .filter((b) => mine.has(`${b.worldX},${b.worldY}`))
        .map((b) => ({ x: b.worldX, y: b.worldY, dir: b.dir, slots: b.slotTiles, out: b.outputTile }));
    }, PLACED);
    assert('as 4 caixas colocadas existem no jogo', boxes.length === 4, `achei ${boxes.length}`);

    // (A) (B) [caixa] (saida). Y cresce pra BAIXO, entao norte e -1: uma caixa virada pro norte
    // tem as bandejas ao SUL dela, a de tras primeiro.
    const EXPECT = {
      '4,2': { slots: [[4, 4], [4, 3]], out: [4, 1] },
      '6,6': { slots: [[4, 6], [5, 6]], out: [7, 6] },
      '4,9': { slots: [[4, 7], [4, 8]], out: [4, 10] },
      '9,3': { slots: [[11, 3], [10, 3]], out: [8, 3] },
    };
    for (const box of boxes) {
      const want = EXPECT[`${box.x},${box.y}`];
      assert(`caixa (${box.x},${box.y}) e uma das colocadas`, want !== undefined);
      assert(
        `caixa (${box.x},${box.y}) dir ${box.dir}: bandejas em ${JSON.stringify(want?.slots)} e saida em ${want?.out}`,
        JSON.stringify(box.slots) === JSON.stringify(want?.slots)
        && box.out[0] === want?.out[0] && box.out[1] === want?.out[1],
        `veio bandejas ${JSON.stringify(box.slots)}, saida ${JSON.stringify(box.out)}`,
      );
    }

    // ── A maquina e solida ──────────────────────────────────────────────────
    const solid = await driver.page.evaluate(() => window.__scene.isSolidForEntities(6, 6, false));
    assert('o corpo da caixa BLOQUEIA (e o que a torna peca de puzzle)', solid === true);

    const itemAt = (x, y) => driver.page.evaluate(([px, py]) => {
      const it = window.__scene.itemManager.snapshot().find((i) => i.worldX === px && i.worldY === py);
      return it ? it.kind : null;
    }, [x, y]);
    const boxState = () => driver.page.evaluate(
      () => {
        const b = window.__scene.toolboxes.find((t) => t.worldX === 6 && t.worldY === 6);
        return { phase: b.currentPhase, frame: b.currentFrame, holding: b.heldProduct, refusals: b.refusalCount };
      },
    );

    // ── O GESTO: pisar na bandeja deposita ──────────────────────────────────
    // O jogo nao tem botao de largar item, e as duas bandejas comecam vazias: sem esta regra a
    // bancada nao teria como ser alimentada por maos humanas.
    log('JOGO: o heroi pisa nas duas bandejas segurando os insumos da receita');
    const fed = await driver.page.evaluate(() => {
      const s = window.__scene;
      s.heldItem = 'wood';
      s.handleTileEntered(4, 6); // a bandeja de tras
      const afterA = s.heldItem;
      s.heldItem = 'stone';
      s.handleTileEntered(5, 6); // a bandeja colada na maquina
      return {
        afterA,
        held: s.heldItem,
        a: s.itemManager.snapshot().find((i) => i.worldX === 4 && i.worldY === 6)?.kind ?? null,
        b: s.itemManager.snapshot().find((i) => i.worldX === 5 && i.worldY === 6)?.kind ?? null,
      };
    });
    assert('o graveto ficou na bandeja de tras (4,6)', fed.a === 'wood', JSON.stringify(fed));
    assert('a pedra ficou na bandeja da frente (5,6)', fed.b === 'stone', JSON.stringify(fed));
    assert('e as duas vezes a mao do heroi esvaziou', fed.afterA === 'none' && fed.held === 'none', JSON.stringify(fed));

    // ── A RECEITA ───────────────────────────────────────────────────────────
    // A partir daqui ninguem mais encosta em nada: se o machado aparecer em (7,6), a caixa fez
    // um item que nao existia no mundo — que e a coisa inteira que ela veio fazer.
    log('JOGO: graveto + pedra, e ninguem mais toca em nada — tem de sair um machado em (7,6)');

    // Espiao de audio: "nao ouvi" tem duas causas bem diferentes (nao disparou / disparou baixo
    // demais) e so uma e bug de fiacao. A trilha e o vento tocam por buffer, entao um oscilador
    // novo daqui pra frente so pode ter vindo dos sons da caixa.
    await driver.page.evaluate(() => {
      window.__oscCount = 0;
      const proto = (window.AudioContext || window.webkitAudioContext).prototype;
      const orig = proto.createOscillator;
      proto.createOscillator = function patched() {
        window.__oscCount += 1;
        return orig.call(this);
      };
    });

    // A FORJA tem de ser vista acontecendo: a caixa passa pelas fases, e o frame 3 (aberta e
    // quente) e o unico instante em que o jogador entende que ali dentro esta se fazendo algo.
    // Sem este assert, um teleporte de itens com 2s de espera passaria igual.
    let sawForging = false;
    const seenPhases = new Set();
    const forgeDeadline = Date.now() + CRAFT_TIMEOUT_MS;
    while (Date.now() < forgeDeadline) {
      const st = await boxState();
      seenPhases.add(st.phase);
      // O retrato NO MEIO da forja — o unico instante em que da pra ver se a caixa realmente
      // fabrica alguma coisa ou se o item so teleportou de dois tiles pra um.
      if (st.frame === 3 && !sawForging) { sawForging = true; await shot('caixa-forjando'); }
      if (st.phase === 'close' || (await itemAt(7, 6)) === 'axe') break;
      await sleep(70);
    }
    assert('a caixa passou por abrir/engolir/forjar/entregar', seenPhases.size >= 3, [...seenPhases].join(','));
    assert('a caixa FORJOU a vista (frame quente com a tampa aberta)', sawForging, [...seenPhases].join(','));

    let crafted = false;
    const craftDeadline = Date.now() + CRAFT_TIMEOUT_MS;
    while (Date.now() < craftDeadline) {
      if ((await itemAt(7, 6)) === 'axe') { crafted = true; break; }
      await sleep(150);
    }
    assert('graveto + pedra = MACHADO, sozinho, no tile da frente (7,6)', crafted);
    assert('a bandeja de tras esvaziou (o insumo foi CONSUMIDO)', (await itemAt(4, 6)) === null);
    assert('a bandeja da frente esvaziou tambem', (await itemAt(5, 6)) === null);

    const oscs = await driver.page.evaluate(() => window.__oscCount);
    assert('a caixa TOCOU (abrir/martelar/entregar dispararam)', oscs > 0, `${oscs} osciladores`);
    await shot('caixa-fabricou-o-machado');

    // ── A RECUSA: um par que nao e receita ──────────────────────────────────
    // A resposta e FISICA — a tampa pula e bate de volta —, nunca uma legenda dizendo o que
    // falta. O que se mede e que ela reclamou E que nao produziu nada.
    log('JOGO: dois itens que nao combinam — a caixa reclama e nao produz nada');
    await driver.page.evaluate(() => {
      const s = window.__scene;
      s.itemManager.takeAt(7, 6); // libera a saida
      s.itemManager.drop('key', 4, 6);
      s.itemManager.drop('bucket', 5, 6);
    });
    const refusalsBefore = (await boxState()).refusals;
    await sleep(3200); // mais que um intervalo de recusa (2.5s) e que um ciclo inteiro (2.3s)
    const afterBad = await boxState();
    assert('a caixa RECUSOU o par (o baque da tampa aconteceu)',
      afterBad.refusals > refusalsBefore, `${refusalsBefore} -> ${afterBad.refusals}`);
    assert('e nao produziu nada na saida', (await itemAt(7, 6)) === null);
    assert('os dois itens errados continuam nas bandejas',
      (await itemAt(4, 6)) === 'key' && (await itemAt(5, 6)) === 'bucket');
    await shot('caixa-recusando-o-par-errado');

    // ── A SAIDA PRESA ───────────────────────────────────────────────────────
    // A checagem de saida livre mora no inicio do ciclo, e o ciclo leva ~2.3s: qualquer coisa
    // pode ocupar a saida nesse meio tempo. Cuspir por cima empilharia dois itens num tile — o
    // sumico silencioso que o braco robotico ja aprendeu a evitar —, entao o produto tem de
    // FICAR dentro da caixa, a vista, ate o lugar vagar.
    log('JOGO: a saida e ocupada NO MEIO da forja — o machado tem de esperar dentro da caixa');
    await driver.page.evaluate(() => {
      const s = window.__scene;
      s.itemManager.takeAt(4, 6);
      s.itemManager.takeAt(5, 6);
      s.itemManager.drop('wood', 4, 6);
      s.itemManager.drop('stone', 5, 6);
    });
    // espera a forja comecar, e so entao entope a saida
    const startDeadline = Date.now() + CRAFT_TIMEOUT_MS;
    let started = false;
    while (Date.now() < startDeadline) {
      const st = await boxState();
      if (st.phase === 'forge' || st.phase === 'swallow') { started = true; break; }
      await sleep(60);
    }
    assert('a segunda fabricacao comecou', started);
    await driver.page.evaluate(() => window.__scene.itemManager.drop('seeds', 7, 6));

    await sleep(2600); // tempo de sobra pro ciclo alcancar a entrega e travar nela
    const stuck = await boxState();
    assert('com a saida presa, o machado FICA dentro da caixa a vista',
      stuck.holding === 'axe', JSON.stringify(stuck));
    assert('e a saida continua com um item so', (await itemAt(7, 6)) === 'seeds');
    await shot('caixa-segurando-o-produto');

    // Saida livre de novo: a entrega suspensa acontece sozinha.
    await driver.page.evaluate(() => window.__scene.itemManager.takeAt(7, 6));
    let delivered = false;
    const freeDeadline = Date.now() + CRAFT_TIMEOUT_MS;
    while (Date.now() < freeDeadline) {
      if ((await itemAt(7, 6)) === 'axe') { delivered = true; break; }
      await sleep(150);
    }
    assert('saida livre: o machado preso e entregue', delivered);

    log('OK: gira nas 4 direcoes, e alimentada a passos, fabrica o machado, recusa o par errado.');
  },
};

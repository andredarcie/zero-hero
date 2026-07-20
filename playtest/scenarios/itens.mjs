// ROBUSTEZ DOS ITENS — os contratos que a auditoria dos 13 itens encontrou furados.
//
// Cada secao e um contrato de ESTADO, dirigido direto nos objetos (sem bump-timing), no espirito
// do `sombras`: o que se prova aqui nao e a solucao de um puzzle, e a invariante que impede um
// item de sumir, duplicar ou ser enterrado. Todos os quatro furos foram achados por leitura de
// codigo e confirmados nos fontes; este cenario existe para ve-los falhar ANTES do fix (TDD) e
// nunca mais regredir depois.
//
//   1. PONTE: burn() durante o colapso (950ms) aceitava um SEGUNDO burn — o reset dobrado
//      destruia caixas ja destruidas e vazava o deck-fantasma reconstruido.
//   2. MONTE: raiseMound() so olhava a posicao do HEROI — um item (ou inimigo) parado no tile
//      semeado era engolido pelo domo que bloqueia, irrecuperavel.
//   3. PRODUCAO: dropSeeds/dropStone/dropTreeStick com o tile ocupado viravam no-op — o produto
//      da foice/picareta/machado evaporava sem feedback. Agora cai no vizinho livre.
//   4. BOMBA: explosao ANTECIPADA (fogo alcancando o fusivel) destruia o sprite mas deixava o
//      tween do pisca-pisca rodando ate o fim do fusivel — setTint num material ja disposed.
//   5. CARVAO: o arbusto queimado as vezes larga carvao (o fogo PRODUZINDO), e pisar nele com
//      a tocha ACESA consome e reabastece — nunca vira a troca de itens comum.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BOMB_FUSE_MS = 1600; // espelha constants.ts — o assert procura o tween POR esta duracao

export default {
  name: 'itens',
  description: 'Contratos de robustez dos itens: ponte nao queima duas vezes, monte nao engole item, producao nao some, bomba nao deixa fusivel fantasma.',
  needsGame: true,
  route: '/?play&level=1',
  async run({ driver, shot, assert, log }) {
    await driver.settle(1500);
    const evaluate = (fn, arg) => driver.page.evaluate(fn, arg);

    // Teleporte utilitario (o cenario e sobre contratos, nao sobre caminhar).
    const teleport = (x, y) => evaluate(([px, py]) => {
      const s = window.__scene;
      s.playerWorld.worldX = px;
      s.playerWorld.worldY = py;
      s.movementController.interruptMovement(px, py);
    }, [x, y]);

    // ── 1. A ponte em chamas recusa um segundo burn ──────────────────────────
    // Numa ponte de 2+ tiles o fogo espalha de A pra B e ~150ms depois B tenta reacender A —
    // que ainda esta em colapso (o reset so vem em 950ms). O segundo burn() tem de ser recusado,
    // como TallGrass e DryBush ja recusam; sem isso o reset dobrado corrompe o deck-fantasma.
    log('PONTE: burn() em colapso recusa reentrada');
    const burnTwice = await evaluate(() => {
      const s = window.__scene;
      const w = (s.waterTiles ?? []).find((t) => t.blocking);
      if (!w) return null;
      w.buildBridgeNow(); // o caminho do TIMBER — vale em qualquer tile de rio
      return { x: w.worldX, y: w.worldY, first: w.burn(), second: w.burn() };
    });
    assert('ha um tile de rio no level pra testar', burnTwice !== null);
    assert('o primeiro burn() acende a ponte', burnTwice.first === true, JSON.stringify(burnTwice));
    assert('o segundo burn() e RECUSADO (ponte ja em colapso)', burnTwice.second === false,
      JSON.stringify(burnTwice));

    // Depois do reset (~950ms) o tile volta a agua bloqueante, pronto pra reconstruir — uma vez.
    await sleep(1300);
    const afterCollapse = await evaluate(([x, y]) => {
      const w = window.__scene.waterTiles.find((t) => t.worldX === x && t.worldY === y);
      return { blocking: w.blocking, isBridge: w.isBridge, deposited: w.deposited };
    }, [burnTwice.x, burnTwice.y]);
    assert('apos o colapso o tile bloqueia de novo (a ponte se foi)',
      afterCollapse.blocking === true && afterCollapse.isBridge === false
      && afterCollapse.deposited === 0, JSON.stringify(afterCollapse));

    // ── 2. O monte nao engole o que estiver no tile ──────────────────────────
    // A regra sempre foi "um domo nunca nasce sob os pes do heroi" — mas so o heroi era
    // checado. Um item largado no tile semeado (ex.: por um braco robotico) era enterrado
    // pelo monte que bloqueia: producao irrecuperavel.
    log('MONTE: com um item no tile semeado, o domo espera');
    const spotInfo = await evaluate(() => {
      const s = window.__scene;
      const spot = (s.plantSpots ?? [])[0];
      return spot ? { x: spot.worldX, y: spot.worldY } : null;
    });
    assert('o level tem um canteiro (plantSpot)', spotInfo !== null);
    // O heroi sai de perto (a regra antiga ja segurava o monte sob ele — o furo e o ITEM).
    await teleport(1, 1);
    await evaluate(([x, y]) => {
      const s = window.__scene;
      const spot = s.plantSpots.find((p) => p.worldX === x && p.worldY === y);
      spot.plant(); // semeia direto (o contrato aqui e o do monte, nao o do passo)
      s.itemManager.drop('wood', x, y); // um graveto parado no tile semeado
    }, [spotInfo.x, spotInfo.y]);
    await sleep(400); // updatePlantSpots roda por frame — tempo de sobra pra decidir

    const withItem = await evaluate(([x, y]) => {
      const s = window.__scene;
      const spot = s.plantSpots.find((p) => p.worldX === x && p.worldY === y);
      return { isMound: spot.isMound, itemStillThere: s.itemManager.hasItemAt(x, y) };
    }, [spotInfo.x, spotInfo.y]);
    assert('o monte NAO se ergue por cima do graveto', withItem.isMound === false,
      JSON.stringify(withItem));
    assert('e o graveto continua no chao, recuperavel', withItem.itemStillThere === true,
      JSON.stringify(withItem));

    // Tirando o item, o monte sobe no proximo tick — a espera era pelo tile, nao um travamento.
    await evaluate(([x, y]) => { window.__scene.itemManager.takeAt(x, y); }, [spotInfo.x, spotInfo.y]);
    await sleep(400);
    const afterClear = await evaluate(([x, y]) => {
      const spot = window.__scene.plantSpots.find((p) => p.worldX === x && p.worldY === y);
      return spot.isMound;
    }, [spotInfo.x, spotInfo.y]);
    assert('tile livre: o monte se ergue', afterClear === true, `isMound=${afterClear}`);

    await shot('itens-monte');

    // ── 3. Producao nunca evapora: o drop cai no vizinho livre ───────────────
    // dropSeeds/dropStone/dropTreeStick recusavam empilhar (certo) devolvendo NADA (errado):
    // o produto da ferramenta sumia em silencio. Com o tile ocupado, o produto agora procura
    // o primeiro vizinho cardeal livre.
    log('PRODUCAO: tile ocupado -> o produto cai ao lado, nao evapora');
    const prodSpot = await evaluate(() => {
      const s = window.__scene;
      for (let y = 1; y < 11; y += 1) {
        for (let x = 1; x < 11; x += 1) {
          if (s.isSolidForEntities(x, y) || s.itemManager.hasItemAt(x, y)) continue;
          if (x === s.playerWorld.worldX && y === s.playerWorld.worldY) continue;
          const free = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) =>
            !s.isSolidForEntities(x + dx, y + dy) && !s.itemManager.hasItemAt(x + dx, y + dy));
          if (free.length > 0) return { x, y };
        }
      }
      return null;
    });
    assert('achei um tile livre com vizinho livre', prodSpot !== null);
    const prodResult = await evaluate(([x, y]) => {
      const s = window.__scene;
      s.itemManager.drop('stone', x, y); // o tile ja esta ocupado...
      s.dropSeeds(x, y); // ...quando a producao chega
      const items = s.itemManager.snapshot();
      const at = (px, py) => items.filter((i) => i.worldX === px && i.worldY === py).map((i) => i.kind);
      return {
        onTile: at(x, y),
        neighbours: [[1, 0], [-1, 0], [0, 1], [0, -1]].flatMap(([dx, dy]) => at(x + dx, y + dy)),
      };
    }, [prodSpot.x, prodSpot.y]);
    assert('a pedra que ocupava o tile segue la, sozinha',
      prodResult.onTile.length === 1 && prodResult.onTile[0] === 'stone', JSON.stringify(prodResult));
    assert('as sementes cairam num vizinho livre (nao evaporaram)',
      prodResult.neighbours.includes('seeds'), JSON.stringify(prodResult));

    // ── 4. Explosao antecipada nao deixa fusivel fantasma ────────────────────
    // O fogo alcancando a bomba explode ANTES do fim do fusivel. O tween do pisca continuava
    // rodando sobre o sprite destruido (setTint em material disposed) ate completar o fusivel.
    log('BOMBA: explodir antes do fusivel para o tween do pisca');
    const bombInfo = await evaluate(() => {
      const s = window.__scene;
      const spot = (s.bombSpots ?? []).find((b) => !b.isSpent);
      return spot ? { x: spot.worldX, y: spot.worldY } : null;
    });
    assert('o level tem um bombSpot virgem', bombInfo !== null);
    const bombResult = await evaluate(([x, y, fuseMs]) => {
      const s = window.__scene;
      s.heldItem = 'bomb';
      s.handleTileEntered(x, y); // pisar na marca planta a bomba (o caminho real)
      const planted = s.activeBombs.length;
      if (planted !== 1) return { planted, exploded: false, ghostFuses: -1 };
      s.explodeBomb(s.activeBombs[0]); // o fogo chegou primeiro
      const ghostFuses = s.tweens.getTweens().filter((t) => {
        const d = Math.round(t.duration ?? 0);
        const d0 = Math.round((t.data && t.data[0] && t.data[0].duration) ?? 0);
        return d === fuseMs || d0 === fuseMs;
      }).length;
      return { planted, exploded: s.activeBombs.length === 0, ghostFuses };
    }, [bombInfo.x, bombInfo.y, BOMB_FUSE_MS]);
    assert('a bomba plantou ao pisar na marca', bombResult.planted === 1, JSON.stringify(bombResult));
    assert('a explosao antecipada consumiu a bomba', bombResult.exploded === true,
      JSON.stringify(bombResult));
    assert('nenhum tween de fusivel sobreviveu a explosao', bombResult.ghostFuses === 0,
      JSON.stringify(bombResult));

    // ── 5. CARVAO: o fogo produz, e a tocha come ─────────────────────────────
    // Um arbusto seco que TERMINA de arder as vezes deixa carvao (CHARCOAL_DROP_CHANCE) — o
    // Math.random e pinado em 0 pra provar o ENCANAMENTO (ignite → toAsh → onBurnedOut →
    // dropProduct), nao a moeda. E pisar no carvao com a tocha ACESA o consome e enche o
    // combustivel: e reabastecimento, nunca uma troca — a mao segue com o graveto em chamas.
    log('CARVAO: arbusto queimado larga carvao; a tocha acesa o come ao pisar');
    const bushInfo = await evaluate(() => {
      const s = window.__scene;
      const bush = (s.dryBushes ?? []).find((b) => b.blocking);
      return bush ? { x: bush.worldX, y: bush.worldY } : null;
    });
    assert('o level tem um arbusto seco intacto', bushInfo !== null);
    await evaluate(() => {
      window.__realRandom = Math.random;
      Math.random = () => 0; // a moeda sempre paga: o teste e do encanamento, nao da sorte
      const s = window.__scene;
      s.dryBushes.find((b) => b.blocking).ignite();
    });
    // BURN_MS do arbusto e 2200; o drop acontece no assentar da cinza.
    let coal = null;
    const coalDeadline = Date.now() + 5000;
    while (Date.now() < coalDeadline) {
      coal = await evaluate(([x, y]) => {
        const items = window.__scene.itemManager.snapshot();
        return items.find((i) => i.kind === 'charcoal'
          && Math.abs(i.worldX - x) + Math.abs(i.worldY - y) <= 1) ?? null;
      }, [bushInfo.x, bushInfo.y]);
      if (coal) break;
      await sleep(250);
    }
    await evaluate(() => { Math.random = window.__realRandom; });
    assert('a cinza do arbusto deixou um CARVAO no chao', coal !== null, JSON.stringify(coal));

    // A tocha acesa com pouco combustivel pisa no carvao: consome e reabastece.
    await evaluate(([x, y]) => {
      const s = window.__scene;
      s.heldItem = 'wood';
      s.heldOnFire = true;
      s.torchFuelMs = 800; // quase apagando
      s.playerWorld.worldX = x;
      s.playerWorld.worldY = y;
      s.movementController.interruptMovement(x, y);
    }, [coal.worldX, coal.worldY]);
    await sleep(600); // o consumo roda no update, por frame
    const afterRefuel = await evaluate(([x, y]) => {
      const s = window.__scene;
      const still = s.itemManager.snapshot().find((i) => i.worldX === x && i.worldY === y);
      return {
        held: s.heldItem,
        onFire: s.heldOnFire,
        fuel: s.torchFuelMs,
        coalOnGround: still ? still.kind : null,
      };
    }, [coal.worldX, coal.worldY]);
    assert('o carvao foi CONSUMIDO (nao trocado)', afterRefuel.coalOnGround === null,
      JSON.stringify(afterRefuel));
    assert('a mao segue com o graveto ACESO', afterRefuel.held === 'wood' && afterRefuel.onFire === true,
      JSON.stringify(afterRefuel));
    assert('e o combustivel encheu de volta (era 800, TORCH_BURN_MS e 5000)',
      afterRefuel.fuel > 3500, JSON.stringify(afterRefuel));

    await shot('itens-final');
    log('OK: ponte, monte, producao, bomba e carvao mantem seus contratos.');
  },
};

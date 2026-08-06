// A PÁ — o botão de AÇÃO usa o item segurado, e usar a pá é batê-la no chão.
//
// A foice dá a semente, mas o buraco de plantio (plantSpot) só existia autorado: mato novo em
// lugar novo era privilégio do editor. A pá fecha o loop pelo lado do jogador — e ela mora no
// botão A: a bolsa escolhe o que está na mão, o A o USA (a espada corta; a pá cava). O golpe
// da pá em cima de um tile de TERRA nu (DIGGABLE_GROUND_FRAMES) cava um canteiro DE VERDADE,
// o mesmo objeto que semente, balde e reabertura já conhecem.
//
// O que este cenário guarda, e por que cada um é uma lei e não um detalhe:
//
//   1. o A com a pá selecionada CAVA a terra vazia à frente — e o que nasce é um canteiro
//      real. E o tile cavado fica SÓ com o buraco: a grama baixa assada no terreno (decor da
//      camada upper) e a ossada de inimigo morto SOMEM sob a terra virada;
//   2. cavar NÃO gasta a pá (ferramenta, não consumível) e não pousa nada no chão;
//   3. onde NÃO há terra (pátio de pedra) o arco do A sai no vazio — nenhum canteiro, e a pá
//      segue na mão: a fechadura é o FRAME do chão, não "qualquer tile andável";
//   4. o B NUNCA usa: com a pá ele a POUSA mesmo sobre terra cavável, e com a SEMENTE ele a
//      pousa até em cima do buraco aberto — item no chão, plantio nenhum. Usar é ação (A);
//      pegar, falar e pousar são o B — o contrato inteiro dos dois botões;
//   5. o A com a SEMENTE, mirando o buraco, PLANTA — a mesma gramática da pá;
//   6. a semente vem em PACOTE de 5 (SEEDS_PER_PACK): pegar o punhado do chão soma CINCO, a
//      bolsa mostra o número no slot, plantar gasta UMA e as outras seguem na mão — e o
//      pacote VIAJA (pousar põe o punhado inteiro; pegar devolve a mesma contagem);
//   7. o balde ENCHE na água de TERRENO (a outra procedência — todo rio/lago/mar do overworld
//      é tile, não prop; era o gesto mudo que trancava a fazenda fora dos levels) e rega o
//      monte: o ciclo cavar → plantar → encher → regar fecha inteiro numa tela;
//   8. nada disso escreve no save da AVENTURA — level e lab zeram por desenho (a lei do
//      adventureState).
//
// Ele monta a própria fixture no /lab (a lei da casa: um cenário nunca depende do que um level
// autorado por outra pessoa contém hoje).

const HERO = { x: 5, y: 6 };
const DIG = { x: 7, y: 6 }; // um passo a leste do herói, depois o tile à frente
const STONE = { x: 6, y: 8 }; // pátio de pedra (frame 23) — a terra que não é terra
const DROP = { x: 4, y: 7 }; // terra vazia onde o B vai POUSAR a pá (provando que não cava)
const SEA = { x: 4, y: 6 }; // água de TERRENO (frame 33) — a procedência que enchia balde nenhum

export default {
  name: 'pa',
  description: 'O ciclo da fazenda numa tela: A cava e planta, o balde enche na água de terreno e rega.',
  needsGame: false, // entra pelo editor; a GameScene nasce no P (mesma razão do combate)
  route: '/lab?level=1',
  async run({ driver, shot, assert, log }) {
    await driver.settle(3000);
    const page = driver.page;

    log('EDITOR: um quintal de TERRA limpa, com um remendo de pedra ao sul');
    await page.evaluate(({ hero, stone, dig, sea }) => {
      const store = window.__scene?.store;
      if (!store) throw new Error('sem store no editor');
      for (let x = 2; x <= 11; x += 1) {
        for (let y = 2; y <= 10; y += 1) {
          store.eraseEntitiesAt(x, y);
          store.setCell('upper', x, y, null);
          store.setCell('collision', x, y, false);
          store.setCell('ground', x, y, 5); // Terra — o frame que a pá morde
        }
      }
      store.setCell('ground', stone.x, stone.y, 23); // Chao de Pedra — o que ela recusa
      store.setCell('ground', sea.x, sea.y, 33); // Mar — água pintada no TERRENO, sem prop
      // A grama baixa POR CIMA da terra alvo: decor não bloqueia nem impede a cavada — mas
      // tem de SUMIR com ela (o buraco fica sozinho no tile).
      store.setCell('upper', dig.x, dig.y, 0); // Folhagem
      store.setSpawn(hero.x, hero.y);
    }, { hero: HERO, stone: STONE, dig: DIG, sea: SEA });

    log('LAB: P joga o mundo editado');
    await driver.press('p', { count: 1 });
    await driver.settle(2200);
    await page.waitForFunction(() => window.gameDebug?.getState()?.levelIntroOpen === false,
      null, { timeout: 15000 });
    await driver.settle(400);

    log('MOCHILA: pá e balde na bolsa; as sementes vêm do CHÃO, num pacote fresco');
    await page.evaluate(() => {
      const s = window.__scene;
      s.inventory.clear();
      s.inventory.add('shovel');
      s.inventory.add('bucket');
      // O teste pega/pousa/re-pega itens; sem isto o primeiro pegar dispararia a cerimônia
      // de item-get (que congela o jogo) no meio da coreografia.
      s.seenItems.add('shovel');
      s.seenItems.add('seeds');
      s.seenItems.add('bucket');
      // O pacote fresco, pelo caminho REAL (ItemManager.drop sem `units` — o mesmo do produto
      // da foice): a regra "semente vem em pacote de 5" mora no drop, nunca no teste.
      s.itemManager.drop('seeds', s.playerWorld.worldX, s.playerWorld.worldY);
    });
    await driver.settle(300);

    // ── 6. O PACOTE DE 5, E O NÚMERO VISÍVEL NA BOLSA ───────────────────────
    log('PACOTE: o B pega o punhado debaixo dos pés — CINCO sementes entram de uma vez');
    await driver.press('x', { count: 1 });
    await driver.settle(300);
    const pack = await page.evaluate(() => ({
      seeds: window.__scene.inventory.count('seeds'),
      heldItem: window.gameDebug.getState().heldItem,
    }));
    assert('o pacote vale 5 sementes na mochila (SEEDS_PER_PACK), e ficou selecionado',
      pack.seeds === 5 && pack.heldItem === 'seeds', JSON.stringify(pack));

    log('BOLSA: o slot da semente carrega o número do pacote');
    await driver.press('i', { count: 1 });
    await driver.settle(400);
    const badge = await page.evaluate(() => document
      .querySelector('#zh-bag-root .zh-bag-slot[data-kind="seeds"] .zh-bag-count')?.textContent ?? null);
    assert('a bolsa mostra "5" no slot da semente — o pacote é visível, não um segredo',
      badge === '5', JSON.stringify({ badge }));
    await shot('pa-pacote-na-bolsa');
    await driver.press('i', { count: 1 }); // fecha sem equipar (o I abre e fecha)
    await driver.settle(300);
    await page.evaluate(() => { window.__scene.inventory.select('shovel'); });

    // A foto do save ANTES de qualquer gesto de mundo: a lei diz que nada daqui pode tocá-lo.
    const saveBefore = await page.evaluate(() => localStorage.getItem('zh.adventure.v1'));
    // A linha de base dos itens no chão: o level-1 do lab tem itens AUTORADOS fora do quintal
    // limpo, então "nada foi pousado" se mede por "a contagem não mudou", nunca por zero.
    const groundBase = (await driver.getState()).groundItems.length;

    log('OSSADA: um resto de inimigo deitado na terra alvo — a cavada tem de engoli-lo');
    await page.evaluate((at) => {
      // O mesmo caminho que uma caveira morta percorre (EnemyManager → CorpseDecals.drop) —
      // não um sprite plantado à mão, que provaria só que sprites existem.
      window.__scene.enemyManager.corpses.drop(at.x, at.y, 'undead');
    }, DIG);
    await driver.settle(400); // o assentar da ossada (SETTLE_MS) termina antes do golpe

    // ── 1. O A COM A PÁ CAVA A TERRA VAZIA ──────────────────────────────────
    log('CAVAR: um passo a leste (vira o corpo), e o A bate a pá no tile da frente');
    await driver.press('ArrowRight', { count: 1 });
    await driver.settle(500);
    const posed = await driver.getState();
    assert('o herói deu o passo e encara o leste — o tile da frente é a terra alvo',
      posed.player.worldX === HERO.x + 1 && posed.player.worldY === HERO.y,
      JSON.stringify(posed.player));

    await driver.press('z', { count: 1 });
    await driver.settle(700); // o golpe desenha, o impacto (150ms) cava, o fade (300ms) assenta
    const dug = await page.evaluate((at) => {
      const s = window.__scene;
      const spot = s.plantSpots.find((p) => p.worldX === at.x && p.worldY === at.y);
      return {
        exists: spot !== undefined,
        isHole: spot?.isHole ?? false,
        heldItem: window.gameDebug.getState().heldItem,
        groundItems: window.gameDebug.getState().groundItems.length,
        // O tile tem de ficar SÓ com o buraco: o decor sai do DADO do chunk (a malha 3D
        // colapsa o quad no mesmo gesto — removeDecorTile) e a ossada sai do CorpseDecals.
        upperGone: s.chunkManager.getTile(at.x, at.y).upper === null,
        corpses: s.enemyManager.corpses.count,
        // A cavada é AOS POUCOS (quatro frames do sheet, ver animateDigIn) — esperado o
        // suficiente, o recorte tem de ter ASSENTADO no frame 0, o buraco dos autorados.
        // Espera-se pelo estado final, nunca se amostra o meio (a lição do gelo).
        finalFrame: spot?.hole?.frameCur ?? -1,
      };
    }, DIG);
    assert('o golpe do A abriu um canteiro (plantSpot) no tile de terra à frente',
      dug.exists && dug.isHole, JSON.stringify(dug));
    assert('e o tile ficou SÓ com o buraco: a folhagem assada sumiu e a ossada foi engolida',
      dug.upperGone && dug.corpses === 0, JSON.stringify(dug));
    assert('e a cavada em quatro tempos terminou no buraco de sempre (frame 0 do sheet)',
      dug.finalFrame === 0, JSON.stringify(dug));
    // ── 2. CAVAR NÃO GASTA A PÁ ─────────────────────────────────────────────
    assert('e a pá continua na mão — ferramenta não se gasta, e nada foi pousado',
      dug.heldItem === 'shovel' && dug.groundItems === groundBase, JSON.stringify({ ...dug, groundBase }));
    await shot('pa-canteiro-cavado');

    // ── 4/5. O B POUSA ATÉ SOBRE O BURACO; O A PLANTA ───────────────────────
    log('SEMENTE: o B pousa a semente SOBRE o buraco — item no chão, plantio nenhum');
    await page.evaluate(() => { window.__scene.inventory.select('seeds'); });
    await driver.press('x', { count: 1 });
    await driver.settle(400);
    const rested = await page.evaluate((at) => {
      const s = window.__scene;
      const spot = s.plantSpots.find((p) => p.worldX === at.x && p.worldY === at.y);
      const ground = window.gameDebug.getState().groundItems.find(
        (i) => i.kind === 'seeds' && i.worldX === at.x && i.worldY === at.y,
      );
      return {
        stillHole: spot?.isHole ?? false,
        seedOnGround: ground !== undefined,
        // O punhado INTEIRO pousou como UM item — o pacote viaja com a contagem dele.
        packUnits: ground?.units ?? 0,
        bagLeft: s.inventory.count('seeds'),
      };
    }, DIG);
    assert('o B com a semente NÃO plantou: pousou o item, e o buraco segue aberto por baixo',
      rested.stillHole && rested.seedOnGround, JSON.stringify(rested));
    assert('e pousou o PACOTE inteiro (5 num item só, a bolsa zerada) — nada se imprime no chão',
      rested.packUnits === 5 && rested.bagLeft === 0, JSON.stringify(rested));

    log('...o segundo B pega a semente de volta (o gesto reversível), e o A PLANTA');
    await driver.press('x', { count: 1 }); // pickUpItemAt: o tile à frente primeiro
    await driver.settle(300);
    await driver.press('z', { count: 1 }); // o botão de ação usa o item segurado
    await driver.settle(500);
    const sown = await page.evaluate((at) => {
      const s = window.__scene;
      const spot = s.plantSpots.find((p) => p.worldX === at.x && p.worldY === at.y);
      return {
        // O herói plantou de FORA do tile, então o monte pode já ter subido no frame seguinte
        // (updatePlantSpots ergue assim que o tile está livre) — os dois estados provam o mesmo.
        planted: (spot?.isSown ?? false) || (spot?.isMound ?? false),
        seedsLeft: s.inventory.count('seeds'),
        heldItem: window.gameDebug.getState().heldItem,
      };
    }, DIG);
    assert('o A plantou UMA semente do pacote — e as outras QUATRO seguem na mão, selecionadas',
      sown.planted && sown.seedsLeft === 4 && sown.heldItem === 'seeds', JSON.stringify(sown));

    // ── 7. O BALDE ENCHE NA ÁGUA DE TERRENO, E REGA — O CICLO FECHA ─────────
    // A água do overworld inteira é TILE (frame do mar), não prop — e o balde só enchia no
    // rio-prop: o gesto era MUDO e a fazenda nascia trancada fora dos levels. A guarda enche
    // na água pintada e rega com ela, fechando cavar → plantar → encher → regar numa tela.
    log('BALDE: encher na água PINTADA (tile de mar, prop nenhum) — a outra procedência');
    await page.evaluate(() => { window.__scene.inventory.select('bucket'); });
    await driver.press('ArrowLeft', { count: 1 }); // (6,6) → (5,6), encarando o oeste: o mar
    await driver.settle(500);
    await driver.press('z', { count: 1 }); // o A bate com o balde na água — usar é ação
    await driver.settle(500);
    const filled = await driver.getState();
    assert('o balde encheu na água de TERRENO — onde antes o gesto era mudo',
      filled.heldItem === 'bucketFull', JSON.stringify({ held: filled.heldItem }));

    log('REGAR: de volta ao canteiro, o A joga a água no monte');
    await driver.press('ArrowRight', { count: 1 }); // (5,6) → (6,6), encarando o leste: o monte
    await driver.settle(500);
    await driver.press('z', { count: 1 });
    await driver.settle(900); // o arremesso viaja em arco; a terra bebe ao pousar
    const watered = await page.evaluate((at) => {
      const s = window.__scene;
      const spot = s.plantSpots.find((p) => p.worldX === at.x && p.worldY === at.y);
      return {
        isWatered: spot?.isWatered ?? false,
        heldItem: window.gameDebug.getState().heldItem,
      };
    }, DIG);
    assert('a água regou o monte, e o balde voltou vazio pra mão — o ciclo inteiro fechou',
      watered.isWatered && watered.heldItem === 'bucket', JSON.stringify(watered));

    // ── 3. ONDE NÃO HÁ TERRA, O ARCO SAI NO VAZIO ───────────────────────────
    log('PEDRA: o A no pátio não cava — e não pousa nada (o A nunca pousa)');
    await page.evaluate(() => { window.__scene.inventory.select('shovel'); });
    await driver.press('ArrowDown', { count: 1 });
    await driver.settle(500);
    await driver.press('z', { count: 1 });
    await driver.settle(600);
    const refused = await page.evaluate((stone) => {
      const s = window.__scene;
      const state = window.gameDebug.getState();
      return {
        spotOnStone: s.plantSpots.some((p) => p.worldX === stone.x && p.worldY === stone.y),
        groundItems: state.groundItems.length,
        heldItem: state.heldItem,
      };
    }, STONE);
    assert('a pedra não virou canteiro — a fechadura é o frame de TERRA, não "chão andável"',
      refused.spotOnStone === false, JSON.stringify(refused));
    assert('e a pá segue na mão, sem pouso nenhum: o arco do A sai no vazio, nunca pousa',
      refused.heldItem === 'shovel' && refused.groundItems === groundBase,
      JSON.stringify({ ...refused, groundBase }));

    // ── 4. O B NUNCA CAVA: ELE POUSA — MESMO EM TERRA CAVÁVEL ───────────────
    log('POUSAR: o B em cima de terra nua pousa a pá em vez de cavar');
    await driver.press('ArrowLeft', { count: 1 });
    await driver.settle(500);
    await driver.press('x', { count: 1 });
    await driver.settle(600);
    const placed = await page.evaluate((drop) => {
      const s = window.__scene;
      const state = window.gameDebug.getState();
      return {
        spotOnDrop: s.plantSpots.some((p) => p.worldX === drop.x && p.worldY === drop.y),
        shovelOnGround: state.groundItems.some(
          (i) => i.kind === 'shovel' && i.worldX === drop.x && i.worldY === drop.y,
        ),
        heldItem: state.heldItem,
      };
    }, DROP);
    assert('o B não cavou a terra à frente — cavar é ação (A); o B pega, fala e pousa',
      placed.spotOnDrop === false, JSON.stringify(placed));
    assert('e a pá foi POUSADA na terra como qualquer item — o contrato dos dois botões',
      placed.shovelOnGround && placed.heldItem !== 'shovel', JSON.stringify(placed));
    await shot('pa-pousada-na-terra');

    // ── 8. NADA VAZA PRO SAVE DA AVENTURA ───────────────────────────────────
    const saveAfter = await page.evaluate(() => localStorage.getItem('zh.adventure.v1'));
    assert('cavar num level não escreveu um byte no save da aventura (a lei do adventureState)',
      saveAfter === saveBefore, JSON.stringify({ before: !!saveBefore, after: !!saveAfter }));
  },
};

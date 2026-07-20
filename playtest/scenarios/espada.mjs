// "A Espada na Pedra" — o level unico: todos os onze itens carregaveis, uma tela 12x12, uma mao.
//
// O cenario prova as duas metades do que faz o level um puzzle:
//   1. As TRAVAS: de maos vazias, cada porta recusa o heroi (cerca-viva, corredor de capim,
//      quarteirao de lava, arbusto, plug, fosso, comporta, rocha da soleira, flores fechadas).
//   2. A SOLUCAO INTEIRA, na ordem da corrente de producao: foice→SEMENTES, machado→TIMBER,
//      semente+buraco+balde→o mato BROTA nos dois elos do pavio, graveto→tocha→arbusto,
//      pavio (o fogo corre o mato plantado, cruza e COME a propria ponte, expoe a chave),
//      pedra→basalto→botas, botas→bomba→cela→picareta, pedra→vau,
//      chave→comporta→drenagem, balde→guardia apagada→flores abrem→ESPADA.
//
// O roteiro anda por waypoints explicitos: cada perna fica em pistas comprovadamente abertas,
// porque o goTo x-depois-y cegamente atravessaria capim/agua e emperraria.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'espada',
  description: 'A Espada na Pedra: as travas seguram de maos vazias e a corrente inteira resolve.',
  needsGame: true,
  route: '/?play&level=1',
  async run({ driver, shot, assert, log }) {
    const state = () => driver.getState();
    const pos = async () => (await state()).player;
    const KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

    const solidAt = (x, y) => driver.page.evaluate(([px, py]) => window.__scene.isSolidForEntities(px, py, false), [x, y]);
    const campfireLit = (x, y) => driver.page.evaluate(([px, py]) => {
      const cf = window.__scene.campfires.find((c) => c.worldX === px && c.worldY === py);
      return cf ? cf.isLit : null;
    }, [x, y]);
    const flowerAt = (x, y) => driver.page.evaluate(([px, py]) => {
      const m = window.__scene.moonflowers.find((f) => f.worldX === px && f.worldY === py);
      return m ? { blocking: m.blocking, isOpen: m.isOpen } : null;
    }, [x, y]);
    const grassAt = (x, y) => driver.page.evaluate(([px, py]) => {
      const g = window.__scene.tallGrasses.find((t) => t.worldX === px && t.worldY === py);
      return g ? { isTall: g.isTall, blocking: g.blocking } : null;
    }, [x, y]);
    const plantSpotAt = (x, y) => driver.page.evaluate(([px, py]) => {
      const s = window.__scene.plantSpots.find((b) => b.worldX === px && b.worldY === py);
      return s ? { hole: s.isHole, sown: s.isSown, mound: s.isMound, watered: s.isWatered, grown: Boolean(s.grownGrass) } : null;
    }, [x, y]);
    const bombSpotAt = (x, y) => driver.page.evaluate(([px, py]) => {
      const s = window.__scene.bombSpots.find((b) => b.worldX === px && b.worldY === py);
      return s ? { spent: s.isSpent } : null;
    }, [x, y]);
    const groundItem = async (kind, x, y) =>
      (await state()).groundItems.some((i) => i.kind === kind && i.worldX === x && i.worldY === y);

    const dismissItemGet = async () => {
      for (let i = 0; i < 12; i += 1) {
        if (!(await state())?.itemGetOpen) return;
        await driver.press('Space', { count: 1, delay: 400 });
      }
    };
    // Um passo. Se o heroi CHEGOU, otimo; se ele SE MOVEU mas nao esta no alvo (input
    // bufferizado empurrou alem — o runaway: re-apertar com ele em voo enfileira passos e o
    // poll nunca o ve no tile exato), devolve — o goTo rele a posicao e re-mira, entao um
    // overshoot se corrige sozinho em vez de virar timeout.
    const step = async (dir, ex, ey) => {
      for (let a = 0; a < 4; a += 1) {
        const before = await pos();
        await driver.press(KEY[dir], { count: 1 });
        for (let i = 0; i < 6; i += 1) {
          const p = await pos();
          if (p.worldX === ex && p.worldY === ey) return;
          if (p.worldX !== before.worldX || p.worldY !== before.worldY) return; // moveu: goTo re-mira
          await sleep(120);
        }
        await dismissItemGet();
      }
      throw new Error(`step ${dir} -> (${ex},${ey}); hero at ${JSON.stringify(await pos())}`);
    };
    const goTo = async (x, y) => {
      let p = await pos();
      while (p.worldX !== x) { const d = Math.sign(x - p.worldX); await step(d > 0 ? 'right' : 'left', p.worldX + d, p.worldY); p = await pos(); }
      while (p.worldY !== y) { const d = Math.sign(y - p.worldY); await step(d > 0 ? 'down' : 'up', p.worldX, p.worldY + d); p = await pos(); }
    };
    // Anda uma corrente de waypoints — cada perna e uma pista aberta comprovada no desenho.
    const path = async (...points) => { for (const [x, y] of points) await goTo(x, y); };
    const bump = async (dir, n = 1) => driver.press(KEY[dir], { count: n, delay: 420 });
    const until = async (name, fn, tries = 40, ms = 400) => {
      for (let i = 0; i < tries; i += 1) { if (await fn()) return true; await sleep(ms); }
      throw new Error(`timeout waiting: ${name}`);
    };
    // Um bump unico pode ser engolido (GC, foco, timing do keypress) — repete ate a condicao.
    const bumpUntil = async (dir, name, cond, rounds = 6) => {
      for (let i = 0; i < rounds; i += 1) {
        await bump(dir, 1);
        for (let j = 0; j < 4; j += 1) { await sleep(350); if (await cond()) return; }
      }
      throw new Error(`bumpUntil ${name}: never satisfied`);
    };

    await driver.settle(1200);

    // ═══ BOOT: as travas seguram de maos vazias ═══════════════════════════════
    const boot = await state();
    assert('Spawn ao lado da fogueira-lar', boot.player.worldX === 6 && boot.player.worldY === 7,
      `spawn (${boot.player.worldX},${boot.player.worldY})`);
    assert('Duas fogueiras acesas no boot (lar + guardia)', boot.litFires === 2, `litFires=${boot.litFires}`);
    assert('A fogueira selada (11,0) nasce morta', (await campfireLit(11, 0)) === false, `lit=${await campfireLit(11, 0)}`);
    await shot('espada-boot', { note: 'Uma tela, onze itens: a espada espera no canto SE atras das flores' });

    log('TRAVAS: cada porta recusa o heroi de maos vazias');
    assert('Cerca-viva (2,6) fecha a sala das ferramentas', await solidAt(2, 6), 'hedge open?!');
    assert('Corredor de capim (9,0) esconde a chave', await solidAt(9, 0), 'corridor open?!');
    assert('Rio (5,2) bloqueia', await solidAt(5, 2), 'river open?!');
    assert('Muro de lava (1,8) fecha o Quarteirao em Chamas', await solidAt(1, 8), 'lava wall open?!');
    assert('Arbusto seco (4,9) fecha o nicho da pedra', await solidAt(4, 9), 'bush open?!');
    assert('Plug de lava (5,10) sela as botas', await solidAt(5, 10), 'plug open?!');
    assert('Fosso (9,9) cerca o santuario', await solidAt(9, 9), 'moat open?!');
    assert('Comporta (9,10) trancada', await solidAt(9, 10), 'door open?!');
    assert('Rocha da soleira (8,10) fecha o unico tile de alcancar a porta', await solidAt(8, 10), 'rock open?!');
    assert('Flor A (10,11) e um botao fechado sob a guardia', (await flowerAt(10, 11))?.blocking === true, JSON.stringify(await flowerAt(10, 11)));
    assert('Flor B (11,10) tambem', (await flowerAt(11, 10))?.blocking === true, JSON.stringify(await flowerAt(11, 10)));
    assert('A marca de bomba (1,9) existe e espera', (await bombSpotAt(1, 9))?.spent === false, JSON.stringify(await bombSpotAt(1, 9)));
    assert('Os buracos de plantio (8,4)/(8,3) existem, abertos',
      (await plantSpotAt(8, 4))?.hole === true && (await plantSpotAt(8, 3))?.hole === true,
      JSON.stringify([await plantSpotAt(8, 4), await plantSpotAt(8, 3)]));
    const levelBtns = await driver.page.evaluate(() => {
      const root = document.getElementById('zh-level-btns');
      return root ? {
        buttons: root.querySelectorAll('button.zh-level-btn').length,
        hint: document.getElementById('zh-level-hint')?.textContent ?? null,
      } : null;
    });
    assert('Botoes flutuantes do level (reiniciar + pausa) no topo-direito', levelBtns?.buttons === 2,
      JSON.stringify(levelBtns));
    assert('O level AVISA que reiniciar pode ser preciso (balao "Travou?")',
      Boolean(levelBtns?.hint && levelBtns.hint.length > 0), JSON.stringify(levelBtns));

    // ═══ ATO 1: foice → cerca-viva → SEMENTES ═════════════════════════════════
    log('ATO 1: a foice colhe a porta — e cada corte rende SEMENTES');
    await goTo(6, 8); await dismissItemGet(); // foice
    assert('Foice na mao', (await state()).heldItem === 'scythe', `held=${(await state()).heldItem}`);
    await path([5, 8], [4, 8], [3, 8], [3, 7], [3, 6]);
    await bump('left', 1); await sleep(600); // corta (2,6)
    await goTo(3, 5);
    await bump('left', 1); await sleep(600); // corta (2,5)
    await until('cerca aberta', async () => !(await solidAt(2, 6)) && !(await solidAt(2, 5)));
    assert('Cada corte rendeu SEMENTES', (await groundItem('seeds', 2, 6)) && (await groundItem('seeds', 2, 5)),
      'seeds missing');

    // ═══ ATO 2: machado → TIMBER! (ANTES de plantar: o monte bloquearia o tile do corte) ═
    log('ATO 2: o machado derruba a arvore SOBRE o rio — a ponte de tronco');
    await goTo(3, 6); await goTo(2, 6); await dismissItemGet(); // sementes#1 na mao (foice fica)
    await goTo(1, 6); await dismissItemGet(); // balde na mao (sementes#1 param em 1,6)
    await path([1, 5], [0, 5]); await dismissItemGet(); // machado na mao (balde para em 0,5)
    assert('Machado na mao', (await state()).heldItem === 'axe', `held=${(await state()).heldItem}`);
    // A porta (2,5) guarda as sementes#2: cruza (swap), sai, volta (re-swap), sai — a danca
    // do item dropado, que arma quando se sai de cima e volta para a mao na segunda passada.
    await path([1, 5], [2, 5]); await dismissItemGet(); // machado <-> sementes#2
    await goTo(3, 5); await goTo(2, 5); await dismissItemGet(); // sementes#2 <-> machado
    await goTo(3, 5);
    assert('Saiu da sala com o machado (danca do swap na porta)', (await state()).heldItem === 'axe',
      `held=${(await state()).heldItem}`);
    await path([3, 4], [7, 4], [8, 4]);
    for (let i = 0; i < 8; i += 1) {
      if (!(await solidAt(8, 3))) break;
      await bump('up', 1); await sleep(600);
    }
    const p3 = await pos();
    if (p3.worldX === 8 && p3.worldY === 3) await step('down', 8, 4); // um passo a mais? volta
    await until('tronco vira ponte dupla', async () => !(await solidAt(8, 2)) && !(await solidAt(8, 1)));
    await shot('espada-timber', { note: 'TIMBER: o tronco cruzou (8,1)-(8,2) — madeira, ou seja, COMBUSTIVEL' });

    // ═══ ATO 3: plantio #1 — pisar no buraco (8,4) semeia; sair ergue o monte ═
    log('ATO 3: planta no buraco (8,4) — pisar semeia, sair de cima ergue o monte');
    await path([7, 4], [3, 4], [3, 5], [2, 5]); await dismissItemGet(); // machado <-> sementes#2
    await path([3, 5], [3, 4], [7, 4], [8, 4]);
    await sleep(300);
    assert('Pisar no buraco SEMEOU (mao vazia, sem tecla nenhuma)', (await state()).heldItem === 'none',
      `held=${(await state()).heldItem}`);
    await step('left', 7, 4); // sai de cima: o monte se ergue atras
    await until('o monte se ergueu em (8,4) e bloqueia', async () => solidAt(8, 4));
    assert('Canteiro (8,4) em MONTE, esperando agua', (await plantSpotAt(8, 4))?.mound === true,
      JSON.stringify(await plantSpotAt(8, 4)));

    // ═══ ATO 4: rega #1 — balde no rio, agua no monte, o mato BROTA ═══════════
    log('ATO 4: agua no monte — e o mato brota de verdade, com animacao');
    // (2,5) devolve o machado no caminho (mao vazia = coleta seca); troca-o pelo balde em (0,5).
    await path([3, 4], [3, 5], [2, 5], [1, 5], [0, 5]); await dismissItemGet();
    assert('Balde na mao (machado parou em 0,5)', (await state()).heldItem === 'bucket',
      `held=${(await state()).heldItem}`);
    await path([1, 5], [2, 5], [3, 5], [3, 4], [7, 4], [7, 3]);
    await bumpUntil('up', 'balde cheio no rio (7,2)', async () => (await state()).heldItem === 'bucketFull');
    await goTo(7, 4);
    await bumpUntil('right', 'monte (8,4) regado', async () => {
      const s = await plantSpotAt(8, 4);
      return Boolean(s && (s.watered || s.grown));
    });
    await until('o mato BROTOU em (8,4)', async () => (await grassAt(8, 4))?.isTall === true, 30, 400);
    await shot('espada-brotou', { note: 'Semente + buraco + agua = mato DE VERDADE brotando no pavio' });

    // ═══ ATO 5: plantio + rega #2 — o toco (8,3) vira o segundo elo ═══════════
    log('ATO 5: o segundo canteiro, no toco do TIMBER (via leste, o monte #1 mura o caminho oeste)');
    await path([7, 4], [3, 4], [3, 5], [2, 5], [1, 5], [1, 6]); await dismissItemGet(); // balde <-> sementes#1
    await path([1, 5], [2, 5], [3, 5], [3, 4], [3, 3], [7, 3], [8, 3]);
    await sleep(300);
    await step('left', 7, 3); // semeou; sai de cima
    await until('monte #2 de pe em (8,3)', async () => solidAt(8, 3));
    await path([6, 3], [3, 3], [3, 4], [3, 5], [2, 5], [1, 5], [1, 6]); await dismissItemGet(); // balde de volta
    await path([1, 5], [2, 5], [3, 5], [3, 4], [3, 3], [7, 3]);
    await bumpUntil('up', 'balde cheio de novo (7,2)', async () => (await state()).heldItem === 'bucketFull');
    await bumpUntil('right', 'monte (8,3) regado', async () => {
      const s = await plantSpotAt(8, 3);
      return Boolean(s && (s.watered || s.grown));
    });
    await until('o mato BROTOU em (8,3): estopim..mato..mato..tronco..tronco..capim',
      async () => (await grassAt(8, 3))?.isTall === true, 30, 400);

    // ═══ ATO 6: graveto → tocha; a tocha queima o arbusto ═════════════════════
    log('ATO 6: fogo na mao — o arbusto guarda a primeira pedra');
    await path([7, 4], [7, 5], [7, 6], [4, 6], [4, 7]); await dismissItemGet(); // balde <-> graveto
    await bump('right', 1); // acende no lar (5,7)
    await until('tocha acesa', async () => (await state()).heldOnFire === true, 20, 300);
    await path([4, 8], [5, 8], [5, 9]);
    await bump('left', 1); // incendeia o arbusto (4,9)
    await until('arbusto virou cinza', async () => !(await solidAt(4, 9)));

    // ═══ ATO 7: o PAVIO — o fogo corre o mato PLANTADO, cruza o rio e come a ponte ═
    log('ATO 7: acende o estopim e ASSISTE: o fogo corre o mato plantado, cruza e expoe a chave');
    await goTo(5, 8);
    await bump('up', 1); await sleep(500); // reabastece a tocha no lar
    await path([6, 8], [7, 8], [8, 8], [8, 7], [8, 6]);
    await bump('up', 1); // acende o capim-estopim (8,5)
    await until('a fogueira selada (11,0) acendeu pelo pavio', async () => (await campfireLit(11, 0)) === true, 80, 500);
    assert('O fogo COMEU a ponte de tronco (8,2 bloqueia de novo)', await solidAt(8, 2), 'bridge survived?!');
    await until('corredor de capim consumido', async () => !(await solidAt(9, 0)));
    assert('A chave esta exposta em (9,0)', await groundItem('key', 9, 0), 'key gone?!');
    assert('Tres fogos acesos (lar + guardia + a selada)', (await state()).litFires === 3, `litFires=${(await state()).litFires}`);
    // O ciclo e renovavel: consumido o mato plantado, cada canteiro REABRE seu buraco.
    await until('os canteiros reabriram apos o fogo (replantaveis)', async () =>
      (await plantSpotAt(8, 4))?.hole === true && (await plantSpotAt(8, 3))?.hole === true, 30, 400);
    await shot('espada-pavio', { note: 'A ponte do fogo nao e a ponte do heroi: ela ardeu cruzando' });

    // ═══ ATO 8: pedra → basalto → botas ═══════════════════════════════════════
    log('ATO 8: a primeira pedra e dada; ela apaga o plug e abre as botas');
    await path([8, 7], [8, 8], [5, 8], [5, 9], [4, 9], [4, 10]); await dismissItemGet(); // pedra (larga a tocha)
    assert('Pedra na mao', (await state()).heldItem === 'stone', `held=${(await state()).heldItem}`);
    await bumpUntil('right', 'plug virou basalto', async () => !(await solidAt(5, 10))); // pedra na lava (5,10)
    await path([5, 10], [5, 11]); await dismissItemGet(); // botas
    assert('Botas de lava na mao', (await state()).heldItem === 'lavaBoots', `held=${(await state()).heldItem}`);

    // ═══ ATO 9: o Quarteirao em Chamas — bomba, cela, e a saida minerada ══════
    log('ATO 9: entra por cima da lava; a bomba abre a cela; a pedra da cela MINERA a saida');
    await path([5, 10], [5, 9], [5, 8], [4, 8], [3, 8], [3, 9], [2, 9]); // vadeia (3,9)
    await goTo(2, 10); await dismissItemGet(); // troca botas -> bomba
    assert('Bomba na mao (botas ficaram no chao do quarteirao)', (await state()).heldItem === 'bomb', `held=${(await state()).heldItem}`);
    // Sem botao: PISAR na marca (1,9) segurando a bomba a planta sozinha (o jogo e so andar).
    await path([2, 9]);
    await shot('espada-marca', { note: 'A marca: a bomba-fantasma respira em (1,9), a um passo — pise nela com a bomba' });
    await path([1, 9]);
    await until('a marca engoliu a bomba', async () => (await bombSpotAt(1, 9))?.spent === true, 10, 300);
    assert('A bomba saiu da mao ao pisar na marca', (await state()).heldItem === 'none', `held=${(await state()).heldItem}`);
    await sleep(2600);
    await until('a explosao abriu a cela', async () =>
      !(await solidAt(0, 9)) && !(await solidAt(1, 10)) && !(await solidAt(1, 11)));
    assert('A explosao PRODUZIU pedras', (await groundItem('stone', 0, 9)) || (await groundItem('stone', 1, 10)), 'no stones');
    await shot('espada-quarteirao', { note: 'A cela aberta: a bomba fabricou as pedras da saida' });

    await goTo(1, 10); await dismissItemGet(); // pedra da cela na mao
    await path([1, 9], [2, 9]);
    await bump('right', 1); // pedra no muro leste (3,9)
    await until('a saida foi minerada (basalto em 3,9)', async () => !(await solidAt(3, 9)));
    await path([1, 9], [0, 9]); await dismissItemGet(); // pedra #2
    await path([0, 10], [0, 11]); await dismissItemGet(); // troca pedra #2 -> picareta
    assert('Picareta na mao', (await state()).heldItem === 'pickaxe', `held=${(await state()).heldItem}`);
    await path([0, 10], [1, 10], [1, 9], [2, 9], [3, 9], [4, 9], [4, 8]); // sai pela basalto, COM carga

    // ═══ ATO 10: picareta → rocha da soleira → pedra → vau ════════════════════
    log('ATO 10: a picareta abre a soleira da comporta e fabrica a pedra do vau');
    await path([5, 8], [6, 8], [6, 9], [7, 9], [8, 9]);
    await bump('down', 2); await sleep(900);
    await until('rocha da soleira quebrada', async () => !(await solidAt(8, 10)));
    await goTo(8, 10); await dismissItemGet(); // troca picareta -> pedra #3
    assert('Pedra da soleira na mao', (await state()).heldItem === 'stone', `held=${(await state()).heldItem}`);
    await path([8, 9], [8, 8], [8, 7], [8, 6], [8, 5], [8, 4], [8, 3], [3, 3]);
    await bumpUntil('up', 'o VAU esta posto (fogo nunca cruzara aqui)', async () => !(await solidAt(3, 2))); // pedra no bridgeSpot (3,2)
    // O input bufferizado pode ter carregado o heroi vau adentro assim que a pedra assentou;
    // reancora em terra firme antes da proxima perna-x (que anda na LINHA DO RIO se y=2).
    await goTo(3, 3);

    // ═══ ATO 11: a chave (e o vau provando por que existe) ════════════════════
    // A picareta ficou largada em (8,10) — a soleira da comporta. Busca-a antes, senao a volta
    // com a chave trocaria chave por picareta bem na porta. Ela estaciona no tile da chave.
    log('ATO 11: recolhe a picareta da soleira e a troca pela chave do outro lado do vau');
    await path([8, 3], [8, 4], [8, 5], [8, 6], [8, 7], [8, 8], [8, 9], [8, 10]); await dismissItemGet(); // picareta de volta
    await path([8, 9], [8, 8], [8, 7], [8, 6], [8, 5], [8, 4], [8, 3], [3, 3], [3, 2], [3, 1], [3, 0], [9, 0]);
    await dismissItemGet(); // CHAVE (a picareta estaciona em 9,0)
    assert('Chave na mao', (await state()).heldItem === 'key', `held=${(await state()).heldItem}`);
    await shot('espada-chave', { note: 'A chave so volta para casa pelo vau — de botas nao se carrega nada' });

    // ═══ ATO 12: comporta → o fosso drena ═════════════════════════════════════
    log('ATO 12: a comporta drena o fosso — o leito vira chao e corta-fogo');
    await path([3, 0], [3, 1], [3, 2], [3, 3], [8, 3], [8, 4], [8, 5], [8, 6], [8, 7], [8, 8], [8, 9], [8, 10]);
    await bumpUntil('right', 'comporta aberta', async () => !(await solidAt(9, 10))); // chave na comporta (9,10)
    await until('fosso drenado', async () => !(await solidAt(9, 9)));
    assert('Com a guardia ainda acesa, as flores seguem fechadas', (await flowerAt(10, 11))?.blocking === true,
      JSON.stringify(await flowerAt(10, 11)));

    // ═══ ATO 13: balde → a guardia se apaga → as flores abrem → A ESPADA ══════
    log('ATO 13: o balde apaga a guardia; o escuro abre as duas flores; a espada');
    // O balde ficou parado na lenha (4,7) desde a troca pela tocha, no ATO 6.
    await path([8, 9], [8, 8], [7, 8], [6, 8], [5, 8], [4, 8], [4, 7]);
    await dismissItemGet(); // troca chave -> balde
    assert('Balde vazio na mao', (await state()).heldItem === 'bucket', `held=${(await state()).heldItem}`);
    await path([4, 8], [5, 8], [5, 9], [6, 9], [6, 10]);
    await bumpUntil('down', 'balde cheio na lagoa (6,11)', async () => (await state()).heldItem === 'bucketFull');
    assert('Balde CHEIO', (await state()).heldItem === 'bucketFull', `held=${(await state()).heldItem}`);
    await path([6, 9], [7, 9], [8, 9], [8, 10], [9, 10], [10, 10]);
    await bumpUntil('up', 'guardia apagada (sobram lar + selada)', async () => (await state()).litFires === 2); // agua na guardia (10,9)
    await until('as duas flores ABRIRAM no escuro', async () =>
      (await flowerAt(10, 11))?.blocking === false && (await flowerAt(11, 10))?.blocking === false, 30, 400);
    await shot('espada-flores', { note: 'Guardia apagada: as flores-da-lua viraram ponte de petalas' });

    await path([10, 11], [11, 11]); await dismissItemGet(); // A ESPADA
    assert('A ESPADA NA MAO', (await state()).heldItem === 'sword', `held=${(await state()).heldItem}`);
    await shot('espada-vitoria', { note: 'A Espada na Pedra: cada item fabricou o passo seguinte' });

    // O leito drenado e andavel: busca o coracao pelo fundo do fosso.
    await path([10, 11], [10, 10], [9, 10], [9, 9], [9, 8], [10, 8], [11, 8], [11, 9]);
    const fim = await pos();
    assert('Leito do fosso andavel ate o coracao (11,9)', fim.worldX === 11 && fim.worldY === 9,
      `hero at (${fim.worldX},${fim.worldY})`);
    assert('Terminou vivo', (await state()).isDead === false, `health=${(await state()).health}`);

    // ═══ ATO 14: os botoes flutuantes — pausa abre o menu; reiniciar recomeça tudo ═
    log('ATO 14: botao de pausa abre o menu; botao de reiniciar (2 toques) reinicia o level');
    await driver.page.evaluate(() => document.getElementById('zh-level-pause').click());
    await sleep(400);
    assert('O botao de pausa abriu o menu', await driver.page.evaluate(() => Boolean(document.getElementById('zh-pause-root'))),
      'no pause root');
    await driver.page.evaluate(() => document.querySelector('#zh-pause-root .zh-pause-scrim').click());
    await sleep(400);

    await driver.page.evaluate(() => document.getElementById('zh-level-restart').click()); // arma
    assert('Primeiro toque ARMA o reiniciar (confirmacao, nao acidente)',
      await driver.page.evaluate(() => document.getElementById('zh-level-restart').classList.contains('zh-armed')),
      'restart fired on a single tap?!');
    await sleep(250);
    await driver.page.evaluate(() => document.getElementById('zh-level-restart').click()); // confirma
    await until('o level renasceu do zero', async () => {
      try {
        const s = await state();
        return Boolean(s && s.player && s.player.worldX === 6 && s.player.worldY === 7
          && s.litFires === 2 && s.heldItem === 'none');
      } catch { return false; }
    }, 40, 400);
    assert('O mundo foi reconstruido (o corredor de capim voltou)', await solidAt(9, 0), 'corridor still burnt?!');
    await shot('espada-reinicio', { note: 'O botao ↻ devolveu o level intacto: a espada espera de novo' });
  },
};

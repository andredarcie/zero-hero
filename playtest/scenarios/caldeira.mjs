// A CALDEIRA: o terceiro produtor de circuito — o que liga o FOGO a rede de energia.
//
// Como o braco e a roda, ela e uma peca de AUTORIA, entao o cenario percorre o caminho real:
// coloca pelo EditorStore (caldeira + braco consumidor + fogueira combustivel, variavel 'vapor'
// declarada), aperta P e joga o mundo em memoria.
//
// O que ele prova, nesta ordem:
//   1. FRIA, NADA ANDA: sem chama nao ha pressao, a variavel fica false e o braco vinculado
//      nao trabalha — um gerador sem fogo deve nascer apagado, nunca true por um frame.
//   2. ACENDER LIGA A FABRICA: fogueira acesa ao lado -> pressao sobe contra a inercia ->
//      o vapor fecha o circuito -> o braco vinculado transporta a carga sozinho.
//   3. COAST: apagar a fogueira NAO desliga na hora — o vapor acumulado segura o circuito por
//      segundos (a histerese que deixa um pavio pulsado alimentar a fornalha) e so entao cai.
//   4. A TOCHA POUSADA AQUECE: um graveto ACESO largado no vizinho e fonte de calor — a ponte
//      com o braco-que-carrega-fogo — e quando a chama do graveto morre, o calor morre junto.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CYCLE_TIMEOUT_MS = 6000;

export default {
  name: 'caldeira',
  description: 'A caldeira a vapor: fogo vizinho vira pressao, pressao vira circuito, circuito move o braco.',
  needsGame: false, // entra no editor; a GameScene nasce no P (mesma razao do cenario do braco)
  route: '/lab',
  async run({ driver, shot, assert, log }) {
    await driver.settle(3000);

    // ── 1. Autoria: caldeira + braco consumidor + fogueira, tudo pelo store ──
    // Layout numa linha: fogueira (5,6) | caldeira (6,6) | entrada (7,6) | braco (8,6) | saida
    // (9,6). A faixa inteira e limpa antes: o level-1 e denso, e um mato do puzzle encostado na
    // caldeira viraria uma fonte de calor que este teste nao colocou.
    log('EDITOR: limpa a faixa, declara a variavel e coloca fogueira | caldeira | braco');
    const authored = await driver.page.evaluate(() => {
      const store = window.__scene?.store;
      if (!store) return 'sem store no editor';
      for (let x = 4; x <= 10; x += 1) {
        for (let y = 5; y <= 7; y += 1) {
          store.eraseEntitiesAt(x, y);
          store.setCell('upper', x, y, null);
          store.setCell('collision', x, y, false);
        }
      }
      store.replaceGlobalVariables({ ...store.globalVariables, vapor: false });
      store.placeEntity({ list: 'props', type: 'campfire', worldX: 5, worldY: 6 });
      store.placeEntity({ list: 'props', type: 'boiler', worldX: 6, worldY: 6, variable: 'vapor' });
      store.placeEntity({ list: 'props', type: 'inserter', worldX: 8, worldY: 6, dir: 1, variable: 'vapor' });
      const mine = store.allEntities()
        .filter((e) => e.list === 'props' && e.worldY === 6 && e.worldX >= 5 && e.worldX <= 8)
        .map((e) => `${e.type}@${e.worldX}:${e.variable ?? '-'}`)
        .sort()
        .join(' | ');
      return mine;
    });
    assert('o store guarda caldeira e braco COM a variavel',
      authored === 'boiler@6:vapor | campfire@5:- | inserter@8:vapor', authored);

    log('LAB: P joga o mundo editado');
    await driver.press('p', { count: 1 });
    await driver.settle(2500);

    // O level tem fogueiras proprias e a regra da "fogueira-casa" acende a mais proxima do
    // spawn — se a DESTE teste nascer acesa, apaga-se antes de medir o estado frio.
    await driver.page.evaluate(() => {
      const cf = window.__scene.campfires.find((c) => c.worldX === 5 && c.worldY === 6);
      if (cf.isLit) cf.extinguish();
    });

    const boilerState = () => driver.page.evaluate(() => {
      const s = window.gameDebug.getState();
      return { ...s.boilers[0], vapor: s.globalVariables.vapor ?? null };
    });

    // Espera qualquer pressao de boot drenar (nasceu acesa -> apagada acima -> esfria).
    let cold = null;
    const coldDeadline = Date.now() + 9000;
    while (Date.now() < coldDeadline) {
      cold = await boilerState();
      if (!cold.heated && !cold.generating) break;
      await sleep(300);
    }
    assert('a caldeira existe no jogo, vinculada ao vapor', cold !== null && cold.variable === 'vapor',
      JSON.stringify(cold));
    assert('FRIA: sem chama nao ha geracao nem variavel', cold.heated === false
      && cold.generating === false && cold.vapor === false, JSON.stringify(cold));

    // Com a rede morta, o braco vinculado nao pode nem comecar um ciclo.
    log('JOGO: maquina fria — a carga fica parada na entrada do braco');
    await driver.page.evaluate(() => window.__scene.itemManager.drop('stone', 7, 6));
    await sleep(2600);
    const frozen = await driver.page.evaluate(() => {
      const it = window.__scene.itemManager.snapshot().find((i) => i.worldX === 7 && i.worldY === 6);
      return { input: it?.kind ?? null, powered: window.gameDebug.getState().inserters
        .find((a) => a.worldX === 8 && a.worldY === 6)?.powered ?? null };
    });
    assert('sem vapor o braco esta despowered e a pedra nao se move',
      frozen.input === 'stone' && frozen.powered === false, JSON.stringify(frozen));
    await shot('caldeira-fria');

    // ── 2a. SECA, o fogo ferve um tanque VAZIO: nada de pressao ──────────────
    // A regra dos DOIS elementos: fogo sem agua nao gera. O visor vazio e o pedido visual.
    log('JOGO: fogueira acesa mas tanque SECO — aquece e NAO gera');
    await driver.page.evaluate(() => {
      window.__scene.campfires.find((c) => c.worldX === 5 && c.worldY === 6).light();
    });
    await sleep(2500);
    const dry = await boilerState();
    assert('aquecida porem SECA: fogo sobre tanque vazio nao fecha circuito',
      dry.heated === true && dry.generating === false && dry.water === 0, JSON.stringify(dry));
    await shot('caldeira-seca-pedindo-agua');

    // ── 2b. O balde CHEIO entorna no tanque — agora sim a fabrica liga ──────
    // O caminho real do jogador: bump com bucketFull. O arremesso ESVAZIA o balde (a mesma
    // regra do douse) e a agua enche o visor quando pousa.
    log('JOGO: bump com o balde cheio -> tanque cheio -> pressao sobe -> o braco transporta');
    await driver.page.evaluate(() => {
      const s = window.__scene;
      s.heldItem = 'bucketFull';
      s.handlePlayerBump(6, 6);
    });
    await sleep(700); // swing (120ms) + voo do arremesso (~220ms) + assentar
    const bucketAfter = await driver.page.evaluate(() => window.__scene.heldItem);
    assert('o arremesso ESVAZIOU o balde (bucketFull -> bucket)', bucketAfter === 'bucket', bucketAfter);

    let hot = null;
    const hotDeadline = Date.now() + 5000;
    while (Date.now() < hotDeadline) {
      hot = await boilerState();
      if (hot.generating) break;
      await sleep(150);
    }
    assert('com chama E agua a caldeira aquece', hot.heated === true && hot.water > 0, JSON.stringify(hot));
    assert('a pressao fechou o circuito (generating + vapor=true)',
      hot.generating === true && hot.vapor === true && hot.pressure >= 0.4, JSON.stringify(hot));
    await shot('caldeira-gerando');

    let moved = false;
    const moveDeadline = Date.now() + CYCLE_TIMEOUT_MS;
    while (Date.now() < moveDeadline) {
      const out = await driver.page.evaluate(() => window.__scene.itemManager.snapshot()
        .find((i) => i.worldX === 9 && i.worldY === 6)?.kind ?? null);
      if (out === 'stone') { moved = true; break; }
      await sleep(200);
    }
    assert('energizado, o braco levou a pedra ate a saida (9,6)', moved);
    await shot('caldeira-fabrica-viva');

    // ── 3. Apagar a chama NAO desliga na hora: o vapor acumulado segura ──────
    log('JOGO: fogueira apagada — o coast segura o circuito e so depois solta');
    await driver.page.evaluate(() => {
      window.__scene.campfires.find((c) => c.worldX === 5 && c.worldY === 6).extinguish();
    });
    await sleep(800);
    const coasting = await boilerState();
    assert('sem chama mas AINDA gerando (vapor acumulado)', coasting.heated === false
      && coasting.generating === true, JSON.stringify(coasting));

    let off = null;
    const offDeadline = Date.now() + 9000;
    while (Date.now() < offDeadline) {
      off = await boilerState();
      if (!off.generating) break;
      await sleep(300);
    }
    assert('a pressao drenou e o circuito abriu (vapor=false)',
      off.generating === false && off.vapor === false, JSON.stringify(off));

    // ── 4. Um graveto ACESO pousado no vizinho tambem e fornalha ─────────────
    // A ponte com o braco-que-carrega-fogo: a chama entregue por uma maquina pode acender a
    // fornalha de outra. E quando o combustivel do graveto acaba, o calor morre junto.
    log('JOGO: tocha acesa largada ao lado aquece; a chama morre e o calor vai junto');
    await driver.page.evaluate(() => {
      window.__scene.itemManager.drop('wood', 6, 5, { fuelMs: 1600 });
    });
    let torchHeat = null;
    const torchDeadline = Date.now() + 2000;
    while (Date.now() < torchDeadline) {
      torchHeat = await boilerState();
      if (torchHeat.heated) break;
      await sleep(120);
    }
    assert('o graveto aceso no chao AQUECE a caldeira', torchHeat.heated === true,
      JSON.stringify(torchHeat));

    let torchOut = null;
    const torchOutDeadline = Date.now() + 4000;
    while (Date.now() < torchOutDeadline) {
      torchOut = await boilerState();
      if (!torchOut.heated) break;
      await sleep(200);
    }
    assert('a chama do graveto morreu e o calor morreu junto', torchOut.heated === false,
      JSON.stringify(torchOut));

    // ── 5. ESTOCAR: o bump com a tocha acesa acende a fornalha por dentro ────
    // A gramatica de fogo da casa (fogueira morta, arbusto, mato: tudo acende por bump com o
    // item em chamas) vale para a fornalha — mas com RELOGIO: a estocada compra uns segundos
    // de queima interna e apaga sozinha. De maos vazias, nada acontece (e o balao pede fogo).
    log('JOGO: bump de maos vazias nao acende; bump com a tocha ACESA estoca a fornalha');
    // Primeiro drena qualquer geracao que sobrou do estagio anterior.
    let calm = null;
    const calmDeadline = Date.now() + 9000;
    while (Date.now() < calmDeadline) {
      calm = await boilerState();
      if (!calm.heated && !calm.generating) break;
      await sleep(300);
    }
    assert('a caldeira drenou antes do teste de estocada', calm.generating === false, JSON.stringify(calm));

    await driver.page.evaluate(() => {
      const s = window.__scene;
      s.heldItem = 'none';
      s.heldOnFire = false;
      s.handlePlayerBump(6, 6); // esbarra na fornalha de maos vazias
    });
    await sleep(500);
    const bareBump = await boilerState();
    assert('de maos vazias a fornalha segue fria', bareBump.heated === false, JSON.stringify(bareBump));

    await driver.page.evaluate(() => {
      const s = window.__scene;
      s.boilers[0].fillWater(); // a fervura dos estagios anteriores consumiu agua: repoe
      s.heldItem = 'wood';
      s.heldOnFire = true;
      s.torchFuelMs = 5000;
      s.handlePlayerBump(6, 6); // a tocha acesa entra na boca da fornalha
    });
    let stoked = null;
    const stokeDeadline = Date.now() + 4000;
    while (Date.now() < stokeDeadline) {
      stoked = await boilerState();
      if (stoked.generating) break;
      await sleep(150);
    }
    assert('a estocada ACENDE a fornalha por dentro (sem nenhuma chama vizinha)',
      stoked.heated === true, JSON.stringify(stoked));
    assert('e a queima interna fecha o circuito', stoked.generating === true, JSON.stringify(stoked));
    const torchAfter = await driver.page.evaluate(() => ({
      held: window.__scene.heldItem, onFire: window.__scene.heldOnFire,
    }));
    assert('a tocha SOBREVIVE a transferencia (como ao acender fogueira)',
      torchAfter.held === 'wood' && torchAfter.onFire === true, JSON.stringify(torchAfter));
    await shot('caldeira-estocada');

    // A estocada e um relogio LONGO (~16s — 4x a primeira versao): aos 5s ela TEM de seguir
    // acesa (a versao curta ja estaria morta aqui), e ainda assim expira sozinha no fim.
    await sleep(5000);
    const midStoke = await boilerState();
    assert('aos 5s a fornalha SEGUE acesa (a estocada dura 4x mais)',
      midStoke.heated === true && midStoke.generating === true, JSON.stringify(midStoke));

    let stokeOut = null;
    const stokeOutDeadline = Date.now() + 15000;
    while (Date.now() < stokeOutDeadline) {
      stokeOut = await boilerState();
      if (!stokeOut.heated) break;
      await sleep(400);
    }
    assert('a queima da estocada expira sozinha (relogio, nao interruptor)',
      stokeOut.heated === false, JSON.stringify(stokeOut));

    log('OK: fogo vizinho vira pressao, a tocha estoca por dentro, e tudo coasta e apaga.');
  },
};

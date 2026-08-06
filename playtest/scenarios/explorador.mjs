// O MODO EXPLORADOR — mundo infinito, e uma aposta com duas saidas.
//
// O modo inteiro se resume a uma pergunta: "vale a pena mais um chunk?". Ela so e uma pergunta
// se as tres pecas abaixo forem verdade ao mesmo tempo, e este cenario existe para provar as
// tres — nao a beleza do mato, que e sorteado e nao se pode afirmar nada sobre.
//
//   1. O MUNDO NAO ACABA. Andar para fora do acampamento nunca encontra a borda de mar da
//      aventura; o chao continua sendo gerado, as coordenadas ficam negativas, e o renderer
//      re-assa a sua janela de chunks a cada travessia — com custo LIMITADO, que e a unica
//      razao pela qual isto pode existir num jogo que funde a floresta inteira em meia duzia
//      de meshes.
//   2. LONGE PAGA MAIS. A mesma caveira larga mais moeda a 100 tiles do que a 20. Sem isso,
//      andar fundo seria burrice e o modo nao teria decisao nenhuma dentro.
//   3. AS DUAS SAIDAS COBRAM. Portal = 50% e voce vive. Morte = 5%. A aposta e a distancia
//      entre esses dois numeros.
//
// A semente e PRESA (`?explorerSeed`) porque um mundo sorteado nao pode ser afirmado — mas
// repare que nenhuma asserção aqui depende de ONDE o gerador pos as coisas: elas medem regras
// (a moeda escalou? a janela re-assou? o banco recebeu a metade?), nunca mobilia.

const SEED = 20260728;
// O acampamento fica na origem; estes sao os numeros de explorerWorld (CAMP_X/Y e o spawn).
const CAMP = { x: 6, y: 6 };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default {
  name: 'explorador',
  description: 'Mundo infinito, acampamento, moeda que escala com a distancia, portal 50% e morte 5%.',
  needsGame: true,
  route: `/?play&explorer&explorerSeed=${SEED}`,
  async run({ driver, shot, assert, log }) {
    await driver.settle(1600);
    const page = driver.page;
    const evaluate = (fn, arg) => page.evaluate(fn, arg);
    const state = () => driver.getState();

    // O explorador comeca sempre com o banco que a aba ja tinha. Zera para que "ganhou 50%"
    // seja uma conta e nao uma comparacao com o que uma sessao anterior deixou.
    await evaluate(() => {
      localStorage.removeItem('zh.explorer.v1');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await driver.settle(1200);

    const teleport = (x, y) => evaluate(([px, py]) => {
      const s = window.__scene;
      s.playerWorld.worldX = px;
      s.playerWorld.worldY = py;
      s.movementController.interruptMovement(px, py);
    }, [x, y]);

    const give = (kind) => evaluate((k) => { window.__scene.heldItem = k; }, kind);

    const solidAt = (x, y) => evaluate(([px, py]) => window.__scene.isSolidForEntities(px, py), [x, y]);

    // ── 1. O ACAMPAMENTO ────────────────────────────────────────────────────
    log('ACAMPAMENTO: o heroi nasce em casa, seguro, com fogo aceso e o kit no chao');
    const boot = await state();
    await shot('camp', { note: 'O acampamento: fogueira acesa, moradores e as tres ferramentas', state: boot });

    assert('Modo explorador ativo', boot?.explorer != null, `explorer=${JSON.stringify(boot?.explorer)}`);
    assert('A semente e a que foi pedida', boot?.explorer?.seed === SEED, `seed=${boot?.explorer?.seed}`);
    assert('Nasce dentro da luz da fogueira (seguro)', boot?.safety?.safe === true, `safe=${boot?.safety?.safe}`);
    assert('Ha uma fogueira acesa no acampamento', (boot?.litFires ?? 0) >= 1, `litFires=${boot?.litFires}`);
    assert('A bolsa comeca vazia', boot?.explorer?.carried === 0, `carried=${boot?.explorer?.carried}`);
    assert('O banco comeca zerado', boot?.explorer?.banked === 0, `banked=${boot?.explorer?.banked}`);

    // O kit: tres ferramentas no chao, e o heroi so tem uma mao. Sao elas que fazem a primeira
    // decisao do modo existir.
    const kit = (boot?.groundItems ?? []).map((i) => i.kind ?? i.type).sort();
    assert('O kit de casa esta no chao (espada, machado, picareta)',
      ['axe', 'pickaxe', 'sword'].every((k) => kit.includes(k)), `kit=${JSON.stringify(kit)}`);

    // Os quatro portoes: sair andando em linha reta tem de funcionar, ou o acampamento seria
    // uma prisao com vista.
    const northGateOpen = await solidAt(boot.player.worldX, boot.player.worldY - 1);
    assert('O portao norte esta aberto a partir do nascimento', northGateOpen === false, `solido=${northGateOpen}`);

    // ── 2. O MUNDO NAO ACABA ────────────────────────────────────────────────
    log('INFINITO: andar para o norte atravessa chunks, entra em coordenada negativa e nunca acha mar');
    // Antes de sair: quantos programas de shader existem. Re-assar o terreno e a coisa mais
    // perigosa que este modo faz — a lei do projeto e que NENHUM material pode nascer em runtime,
    // porque three assa a contagem de luzes na chave de cache e um material novo custa uma
    // recompilacao de ~550ms no meio da caminhada. Os materiais do terreno sao criados uma vez e
    // reaproveitados a cada re-assado justamente por isso (ver World3D.terrainMats).
    const programsBefore = await evaluate(() => window.__scene.world3d.rendererInfo.programs.length);
    const lightsBefore = await evaluate(() => window.__scene.world3d.rendererInfo.render.calls >= 0
      && window.__scene.world3d.scene.children.filter((o) => o.isLight).length);

    await driver.walk('up', 30);
    await driver.settle(500);
    const out = await state();
    await shot('wilderness', { note: 'Fora do acampamento, no mundo gerado', state: out });

    assert('O heroi realmente saiu do acampamento', (out?.explorer?.depth ?? 0) > 12, `depth=${out?.explorer?.depth}`);
    assert('A janela do terreno se moveu com ele', (out?.explorer?.rebuilds ?? 0) >= 1,
      `rebuilds=${out?.explorer?.rebuilds}`);

    // O custo do re-assado e a razao de o modo poder existir. Um numero solto nao prova nada, e
    // por isso o limite e explicito: acima disto a travessia de chunk vira engasgo visivel e o
    // mundo infinito deixa de valer o preco.
    assert('Re-assar a janela custa menos de 30ms',
      (out?.explorer?.lastRebuildMs ?? 999) < 30, `lastRebuildMs=${out?.explorer?.lastRebuildMs}`);

    const programsAfter = await evaluate(() => window.__scene.world3d.rendererInfo.programs.length);
    const lightsAfter = await evaluate(
      () => window.__scene.world3d.scene.children.filter((o) => o.isLight).length,
    );
    assert('Re-assar o terreno NAO compila shader nenhum', programsAfter === programsBefore,
      `${programsBefore} → ${programsAfter} programas`);
    assert('Re-assar o terreno nao cria nem destroi uma luz', lightsAfter === lightsBefore,
      `${lightsBefore} → ${lightsAfter} luzes`);

    // Longe MESMO: coordenada negativa nos dois eixos, isto e, o outro lado da origem. O mundo
    // autorado nao tem tile nenhum ali; se houvesse borda, aqui e onde ela apareceria.
    const FAR = { x: -160, y: -140 };
    await teleport(FAR.x, FAR.y);
    await driver.settle(700);
    const far = await state();
    await shot('far', { note: 'A 200+ tiles de casa, em coordenada negativa', state: far });

    const farGround = await evaluate(([x, y]) => {
      // Um anel de tiles em volta: se o mundo acabasse, seriam todos mar (frame 33) e solidos.
      const cm = window.__scene.chunkManager;
      let walkable = 0;
      let sea = 0;
      for (let dy = -6; dy <= 6; dy += 1) {
        for (let dx = -6; dx <= 6; dx += 1) {
          const t = cm.getTile(x + dx, y + dy);
          if (t.ground === 33) sea += 1;
          if (!cm.isCellBlocked(x + dx, y + dy)) walkable += 1;
        }
      }
      return { walkable, sea, total: 169 };
    }, [FAR.x, FAR.y]);

    assert('Ha chao de verdade a 200 tiles da origem (nao e o vazio de mar da aventura)',
      farGround.walkable > 60, JSON.stringify(farGround));
    assert('A distancia percorrida foi registrada', (far?.explorer?.depth ?? 0) > 150, `depth=${far?.explorer?.depth}`);

    // ── 2b. A MATA NAO TRANCA O CAMINHO ─────────────────────────────────────
    //
    // A regra: uma arvore e paisagem, nunca uma parede. No explorador o heroi carrega o machado
    // COMUM, que so morde madeira morta — pinheiro e permanente para ele —, entao um bosque
    // fechado nao e "dificil", e o fim do mundo. E o mesmo vale para o lago, que nenhum item do
    // jogo remove.
    //
    // Isto se garante por PERCOLACAO e nao por sorte (ver FOREST_FILL_PERCENT): a fracao aberta
    // dentro de um bosque fica acima do limiar critico da grade quadrada, entao o chao aberto e
    // um unico campo e os bolsoes fechados sao pequenos e finitos. O teste abaixo mede
    // exatamente isso no mundo VIVO, com o mesmo `isCellBlocked` que barra o heroi.
    log('MATA: o chao aberto tem de ser UM campo — arvore e paisagem, nao parede');
    const web = await evaluate(([ox, oy]) => {
      const cm = window.__scene.chunkManager;
      const R = 46;
      const open = new Set();
      for (let y = oy - R; y <= oy + R; y++) {
        for (let x = ox - R; x <= ox + R; x++) {
          if (!cm.isCellBlocked(x, y)) open.add(`${x},${y}`);
        }
      }
      // O maior componente conectado, a partir do tile aberto mais proximo do centro.
      let seedTile = null;
      for (let r = 0; r < R && !seedTile; r++) {
        for (let dy = -r; dy <= r && !seedTile; dy++) {
          for (let dx = -r; dx <= r && !seedTile; dx++) {
            if (open.has(`${ox + dx},${oy + dy}`)) seedTile = [ox + dx, oy + dy];
          }
        }
      }
      const seen = new Set([`${seedTile[0]},${seedTile[1]}`]);
      const q = [seedTile];
      for (let h = 0; h < q.length; h++) {
        const [x, y] = q[h];
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx; const ny = y + dy;
          if (Math.abs(nx - ox) > R || Math.abs(ny - oy) > R) continue;
          const k = `${nx},${ny}`;
          if (seen.has(k) || !open.has(k)) continue;
          seen.add(k); q.push([nx, ny]);
        }
      }
      return { open: open.size, main: seen.size, pct: +(100 * seen.size / open.size).toFixed(2) };
    }, [FAR.x, FAR.y]);

    log(`  ${web.main}/${web.open} tiles abertos num campo so (${web.pct}%)`);
    assert('O chao aberto e um campo so — a mata nao parte o mundo em ilhas',
      web.pct > 95, JSON.stringify(web));

    // E o que a mata NAO pode fazer é fechar a porta de casa: os quatro portoes do acampamento
    // saem para o mundo, e nao para um pátio murado.
    const gates = await evaluate(([cx, cy]) => {
      const cm = window.__scene.chunkManager;
      const out = {};
      for (const [name, dx, dy] of [['norte', 0, -1], ['sul', 0, 1], ['leste', 1, 0], ['oeste', -1, 0]]) {
        // Anda 40 tiles em linha reta a partir da fogueira contornando o que barrar: aqui basta
        // contar quantos dos 40 tiles do corredor estao livres.
        let free = 0;
        for (let i = 1; i <= 40; i++) if (!cm.isCellBlocked(cx + dx * i, cy + dy * i)) free++;
        out[name] = free;
      }
      return out;
    }, [CAMP.x, CAMP.y]);
    log(`  corredores livres em 40 tiles: ${JSON.stringify(gates)}`);
    assert('Os quatro rumos saindo do acampamento sao majoritariamente andaveis',
      Object.values(gates).every((free) => free >= 24), JSON.stringify(gates));

    // ── 3. LONGE PAGA MAIS ──────────────────────────────────────────────────
    log('RISCO x RECOMPENSA: a mesma caveira paga mais longe de casa');

    // Uma caveira nasce colada no heroi e ele bate nela com a espada (um golpe mata). O que
    // interessa e quantas moedas caem — nao o combate, que os outros cenarios ja cobrem.
    //
    // As moedas NAO voam sozinhas para a mao: o heroi tem de passar por cima delas (o ima da
    // loja e que muda isso). Isso e a regra do jogo, e nao um detalhe do teste — catar o
    // espolio custa tempo NO ESCURO, que e o preco certo num modo sobre demorar demais. Aqui a
    // catada e feita por teleporte, tile a tile, para medir o valor e nao a caminhada.
    const killNear = async (hx, hy) => {
      // A caveira precisa de um tile livre ao lado; num mundo gerado o vizinho pode ser pinheiro.
      const spot = await evaluate(([x, y]) => {
        const s = window.__scene;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (!s.isSolidForEntities(x + dx, y + dy)) return { x: x + dx, y: y + dy, dx, dy };
        }
        return null;
      }, [hx, hy]);
      if (!spot) return { gain: 0, killed: false, reason: 'sem tile livre ao lado do heroi' };

      await teleport(hx, hy);
      await give('sword');
      await driver.settle(250);
      const start = await state();
      const before = start?.explorer?.carried ?? 0;
      // O placar de mortes, e nao "sobrou caveira viva?": no fundo do escuro o cerco repoe a
      // horda em segundos, entao contar cabecas mediria a taxa de spawn e nao o golpe.
      const killsBefore = start?.explorer?.kills ?? 0;
      // A espada na mochila: este cenario mede MOEDA por distancia, e nao combate. Com o botao
      // A a espada mata de um golpe, entao a caveira cai antes que o dano de contato dela vire
      // uma segunda variavel no meio da medicao.
      await evaluate(([x, y]) => {
        window.__scene.heldItem = 'sword';
        window.__scene.enemyManager.spawnUndead(x, y);
      }, [spot.x, spot.y]);

      // O nascimento tem telegrafo (o chao rachando) + a animacao de sair da terra; bater antes
      // disso acerta uma coisa que ainda nao esta la.
      await page.waitForFunction(
        () => (window.gameDebug?.getState()?.undead ?? []).some((u) => !u.spawning),
        null,
        { timeout: 12000 },
      );

      const key = spot.dx === 1 ? 'ArrowRight' : spot.dx === -1 ? 'ArrowLeft'
        : spot.dy === 1 ? 'ArrowDown' : 'ArrowUp';
      let killed = false;
      // O teto e generoso de proposito: a caveira custa tres espadadas (ver ENEMY_BLOWS) e um
      // golpe que caia dentro dos 450ms de i-frames RESVALA sem tirar vida, entao o pior caso
      // honesto e o dobro de tentativas. Este laco nao esta medindo dano — ele so precisa de um
      // corpo morto pra que haja moeda no chao, e apertar o teto so o faz flakear.
      for (let i = 0; i < 16 && !killed; i += 1) {
        // ENCARA (a seta contra a caveira so vira o heroi) e golpeia com o A: encostar nela
        // deixou de bater e passou a custar vida — ver o cenario `combate`.
        await driver.press(key, { count: 1 });
        await driver.attack();
        killed = ((await state())?.explorer?.kills ?? 0) > killsBefore;
        if (!killed) await teleport(hx, hy); // o golpe empurra; volta para o lugar de bater
      }

      // Cata o que caiu, passando por cima de cada moeda.
      //
      // Esperar as moedas ASSENTAREM antes de sair atras delas nao e paciencia: uma moeda recem
      // largada esta no meio do proprio espalhar (um tween que a leva do corpo para um tile
      // vizinho) e so fica colecionavel quando pousa. Perseguir a posicao de uma moeda em voo e
      // correr atras de um alvo que se move — foi assim que a caveira de perto pagou zero.
      await page.waitForFunction(
        () => {
          const cm = window.__scene.coinManager;
          return cm.coins.every((c) => c.isCollected || c.isCollectable);
        },
        null,
        { timeout: 8000 },
      ).catch(() => {});

      for (let pass = 0; pass < 12; pass += 1) {
        const coins = await evaluate(() => window.__scene.coinManager.getActiveWorldPositions());
        if (!coins.length) break;
        await teleport(coins[0].worldX, coins[0].worldY);
        await driver.settle(260);
      }
      await driver.settle(400);
      const after = (await state())?.explorer?.carried ?? 0;
      return { gain: after - before, killed };
    };

    // Perto: dentro do primeiro degrau do multiplicador.
    const near = await killNear(CAMP.x + 4, CAMP.y - 14);
    const nearState = await state();
    log(`  perto (dist ~${nearState?.explorer?.depth}): +${near.gain} moedas (morreu=${near.killed})`);

    // Longe: varios degraus acima.
    const far2 = await killNear(CAMP.x + 4, CAMP.y - 120);
    const farState = await state();
    log(`  longe (dist ~${farState?.explorer?.depth}): +${far2.gain} moedas (morreu=${far2.killed})`);
    await shot('reward', { note: 'A bolsa depois das duas caveiras', state: farState });

    assert('A caveira perto de casa caiu', near.killed, JSON.stringify(near));
    assert('A caveira longe de casa caiu', far2.killed, JSON.stringify(far2));
    assert('Matar perto de casa paga alguma coisa', near.gain > 0, `nearGain=${near.gain}`);
    assert('Matar longe paga MAIS do que perto', far2.gain > near.gain,
      `perto=${near.gain} longe=${far2.gain}`);
    assert('O multiplicador do HUD subiu com a distancia',
      (farState?.explorer?.multiplier ?? 0) > (nearState?.explorer?.multiplier ?? 0),
      `perto=x${nearState?.explorer?.multiplier} longe=x${farState?.explorer?.multiplier}`);

    // ── 4. O PORTAL PERGUNTA, E O NAO NAO COBRA NADA ────────────────────────
    log('PORTAL: pisar nele PERGUNTA; recusar mantem a expedicao e nao pergunta de novo no mesmo tile');

    // Um portal do proprio mundo gerado, o mais perto do heroi. Ele existe porque o gerador o
    // planta; o cenario nao autora nada — so procura.
    const portal = await evaluate(() => {
      const s = window.__scene;
      const list = s.levelPortals.map((p) => ({ x: p.worldX, y: p.worldY }));
      if (!list.length) return null;
      const px = s.playerWorld.worldX;
      const py = s.playerWorld.worldY;
      list.sort((a, b) => (Math.hypot(a.x - px, a.y - py) - Math.hypot(b.x - px, b.y - py)));
      return list[0];
    });
    assert('O mundo gerado tem portais de volta', portal !== null, `portal=${JSON.stringify(portal)}`);

    if (portal) {
      // Chega ANDANDO no portal (pisar e o gatilho — um teleporte para cima dele nao dispara
      // handleTileEntered, que e exatamente a regra que se quer testar).
      await teleport(portal.x, portal.y + 1);
      await driver.settle(400);
      await driver.press('ArrowUp', { count: 1 });
      await driver.settle(700);

      const asked = await state();
      await shot('prompt', { note: 'A pergunta: voltar levando metade?', state: asked });
      assert('Pisar no portal abre a pergunta', asked?.explorer?.promptOpen === true,
        `promptOpen=${asked?.explorer?.promptOpen}`);

      const carriedAtPrompt = asked?.explorer?.carried ?? 0;

      // NAO: a tecla de reflexo (Escape) e a resposta segura, e ela nao pode custar nada.
      await page.keyboard.press('Escape');
      await driver.settle(500);
      const declined = await state();
      assert('Recusar fecha a pergunta', declined?.explorer?.promptOpen === false,
        `promptOpen=${declined?.explorer?.promptOpen}`);
      assert('Recusar nao cobra moeda nenhuma', declined?.explorer?.carried === carriedAtPrompt,
        `antes=${carriedAtPrompt} depois=${declined?.explorer?.carried}`);
      assert('Recusar nao manda ninguem para casa', (declined?.explorer?.depth ?? 0) > 20,
        `depth=${declined?.explorer?.depth}`);

      // …e o portal recusado nao volta a perguntar enquanto o heroi nao sair dali: andar por
      // cima de um portal nao pode virar interrogatorio.
      await driver.press('ArrowDown', { count: 1 });
      await driver.press('ArrowUp', { count: 1 });
      await driver.settle(600);
      const reasked = await state();
      assert('O portal recusado nao pergunta de novo no mesmo tile',
        reasked?.explorer?.promptOpen === false, `promptOpen=${reasked?.explorer?.promptOpen}`);
    }

    // ── 5. SIM: 50% VIRA BANCO E O HEROI VOLTA VIVO ─────────────────────────
    log('EXTRACAO: dizer sim guarda metade e devolve o heroi ao acampamento');

    // Uma bolsa redonda, posta a mao: a conta de 50% tem de ser lida sem ambiguidade, e catar
    // moeda de caveira ate um numero exato seria um teste sobre combate.
    await evaluate(() => { window.__scene.explorerDebugSetCoins(120); });
    const loaded = await state();
    assert('A bolsa de teste entrou', loaded?.explorer?.carried === 120, `carried=${loaded?.explorer?.carried}`);

    await evaluate(() => { window.__scene.explorerDebugExtract(); });
    // Succao + vazio + tunel + restart + queda: a viagem inteira do portal.
    await page.waitForFunction(
      () => (window.gameDebug?.getState()?.explorer?.banked ?? 0) > 0,
      null,
      { timeout: 25000 },
    );
    await driver.settle(2500);
    const home = await state();
    await shot('extracted', { note: 'De volta ao acampamento, com metade guardada', state: home });

    assert('Guardou exatamente 50% da bolsa', home?.explorer?.banked === 60, `banked=${home?.explorer?.banked}`);
    assert('A bolsa da expedicao zerou', home?.explorer?.carried === 0, `carried=${home?.explorer?.carried}`);
    assert('O heroi voltou ao acampamento', (home?.explorer?.depth ?? 99) < 8, `depth=${home?.explorer?.depth}`);
    assert('Voltar vivo conta como extracao', (home?.explorer?.stats?.extractions ?? 0) === 1,
      `extractions=${home?.explorer?.stats?.extractions}`);
    // O mundo la fora e outro: decorar onde ficam os portais mataria a aposta. (`?explorerSeed`
    // prende so a PRIMEIRA expedicao — ver pinExplorerSeed —, exatamente para isto poder ser
    // testado sem abrir mao do terreno deterministico ate aqui.)
    assert('A expedicao seguinte tem um mundo novo', home?.explorer?.seed !== SEED,
      `seed=${home?.explorer?.seed}`);
    assert('A expedicao seguinte foi contada', (home?.explorer?.stats?.runs ?? 0) === 2,
      `runs=${home?.explorer?.stats?.runs}`);

    // ── 6. MORRER: 5%, E O ACAMPAMENTO DE VOLTA ─────────────────────────────
    log('MORTE: o escuro cobra 95% — mas nao tudo, e a expedicao ruim nao vira tempo jogado fora');

    await evaluate(() => { window.__scene.explorerDebugSetCoins(200); });
    const beforeDeath = await state();
    assert('A segunda bolsa de teste entrou', beforeDeath?.explorer?.carried === 200,
      `carried=${beforeDeath?.explorer?.carried}`);
    const bankBeforeDeath = beforeDeath?.explorer?.banked ?? 0;

    await evaluate(() => { window.__scene.explorerDebugKill(); });
    await shot('death', { note: 'A elegia da morte — a expedicao acabou' });
    // A cinematica de morte (comprimida: ~5s ate o auto-restart) termina num restart, e e o
    // restart que fecha a conta.
    await page.waitForFunction(
      (before) => (window.gameDebug?.getState()?.explorer?.banked ?? 0) > before,
      bankBeforeDeath,
      { timeout: 40000 },
    );
    await driver.settle(2500);
    const afterDeath = await state();
    await shot('after-death', { note: 'De volta ao acampamento com 5%', state: afterDeath });

    assert('Morrer guarda 5% (10 de 200)', afterDeath?.explorer?.banked === bankBeforeDeath + 10,
      `banked=${afterDeath?.explorer?.banked} (antes ${bankBeforeDeath})`);
    assert('Morrer NAO zera o banco ja conquistado', (afterDeath?.explorer?.banked ?? 0) >= bankBeforeDeath,
      `banked=${afterDeath?.explorer?.banked}`);
    assert('O heroi acorda no acampamento', (afterDeath?.explorer?.depth ?? 99) < 8,
      `depth=${afterDeath?.explorer?.depth}`);
    assert('A vida volta cheia', (afterDeath?.health ?? 0) === afterDeath?.maxHealth,
      `health=${afterDeath?.health}/${afterDeath?.maxHealth}`);
    assert('A morte foi contada', (afterDeath?.explorer?.stats?.deaths ?? 0) === 1,
      `deaths=${afterDeath?.explorer?.stats?.deaths}`);

    void sleep;
  },
};

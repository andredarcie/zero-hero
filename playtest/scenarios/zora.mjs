// O ZORA — o bicho do rio, com a mecanica do Zola do Zelda 1.
//
// A peca inteira e uma JANELA: submerso ele nao e um alvo, erguido ele e. Um cenario que so
// medisse "ele atira" aprovaria um zora quebrado das duas maneiras que importam — um que nunca
// pode ser morto, e um que pode ser morto sempre. Entao as duas metades sao cobradas no MESMO
// corpo, com o mesmo golpe: 999 de dano embaixo d'agua nao faz nada; 999 de dano com ele erguido
// mata.
//
// A fixture e um rio reto, um lago PINTADO e um heroi na margem:
//
//        x=0 1 2 3 4 5 6 7 8 9 10 11
//     y=0  F         ~                 F  fogueira-lar (0,0), longe
//     y=2            ~        ≈        ~  rio: props de agua (x=5, y=2..10)
//     y=3            ~        P        ≈  lago: TILE de terreno pintado (x=10, y=2..4)
//     y=6      H     Z                 H  heroi (2,6)   Z  cova do zora no rio-prop (5,6)
//     y=9                  D           P  cova do zora no lago PINTADO (10,3)
//     y=10           ~                 D  cova do zora em TERRA (9,9): tem de ser denunciada
//
// As tres covas cobram tres coisas diferentes, e a do meio nasceu de um bug REAL: a agua deste jogo
// tem duas procedencias — o prop `water` (como um level autora um rio) e o TILE de terreno (como o
// gerador do overworld escreve rio, lago e oceano, ver SEA_TILE_FRAMES) — e a primeira versao do
// zora so enxergava a primeira. Cinco covas autoradas em cima de um lago do mundo grande ficaram
// mudas, com o editor jurando que estavam em terra.
//
// A cova seca cobra a inversao: para toda outra especie, agua e o tile que MATA a cova; para esta,
// agua e o unico tile que a faz viver. Um editor que contasse o zora no aviso de "tile bloqueado"
// estaria denunciando exatamente a colocacao correta dele.

const HERO = { x: 2, y: 6 };
const FIRE = { x: 0, y: 0 };
const RIVER_X = 5;
const RIVER_Y = [2, 3, 4, 5, 6, 7, 8, 9, 10];
const DEN_WET = { x: RIVER_X, y: 6 };
// O lago PINTADO fica longe do rio de proposito: a mais de ROAM_RADIUS (4) dele, para os dois
// zoras nunca dividirem tile e o resto do cenario poder falar de um corpo so. Ele tambem esta a 11
// de Manhattan do heroi (> SURFACE_RANGE 8), entao o bicho de la NASCE e fica submerso o teste
// inteiro — que e exatamente o que este pedaco quer medir: a cova abriu em agua PINTADA.
const LAKE_X = 10;
const LAKE_Y = [2, 3, 4];
const DEN_LAKE = { x: LAKE_X, y: 3 };
const SEA_TILE_FRAME = 33; // o frame de agua do terreno (ver SEA_TILE_FRAMES em constants)
const DEN_DRY = { x: 9, y: 9 };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const spawnerAt = (state, tile) => (state.enemySpawners ?? []).find(
  (s) => s.worldX === tile.x && s.worldY === tile.y,
);

export default {
  name: 'zora',
  description: 'O zora do rio: so nasce em agua aberta, e intocavel submerso, cospe mirado com aviso — e tapar ou drenar o rio o expulsa.',
  needsGame: false,
  route: '/lab?level=1',
  async run({ driver, shot, assert, log }) {
    await driver.settle(3000);
    const page = driver.page;

    // ── 1. A INVERSAO, NO EDITOR ──────────────────────────────────────────────
    log('EDITOR: autora o rio-prop, o lago pintado, e as tres covas');
    const authored = await page.evaluate(({
      hero, fire, riverX, riverY, lakeX, lakeY, seaFrame, wet, lake, dry,
    }) => {
      const store = window.__scene?.store;
      if (!store) return { error: 'sem store no editor' };

      store.beginStroke();
      for (let x = 0; x <= 11; x += 1) {
        for (let y = 0; y <= 11; y += 1) {
          store.eraseEntitiesAt(x, y);
          store.setCell('ground', x, y, 5);
          store.setCell('upper', x, y, null);
          store.setCell('collision', x, y, false);
        }
      }
      store.commitStroke();

      store.setSpawn(hero.x, hero.y);
      store.placeEntity({ list: 'props', type: 'campfire', worldX: fire.x, worldY: fire.y });
      // O rio e PROP (o jeito de um level autorar agua)...
      riverY.forEach((y) => store.placeEntity({ list: 'props', type: 'water', worldX: riverX, worldY: y }));
      // ...e o lago e TILE pintado (o jeito do overworld). As duas aguas sao agua, e e essa a
      // afirmacao que este cenario passou a guardar.
      store.beginStroke();
      lakeY.forEach((y) => store.setCell('ground', lakeX, y, seaFrame));
      store.commitStroke();
      store.placeEntity({ list: 'enemies', type: 'zora', worldX: wet.x, worldY: wet.y });
      store.placeEntity({ list: 'enemies', type: 'zora', worldX: lake.x, worldY: lake.y });
      store.placeEntity({ list: 'enemies', type: 'zora', worldX: dry.x, worldY: dry.y });

      return {
        spawns: store.allEntities().filter((e) => e.list === 'enemies'),
        warnings: store.validate(),
      };
    }, {
      hero: HERO,
      fire: FIRE,
      riverX: RIVER_X,
      riverY: RIVER_Y,
      lakeX: LAKE_X,
      lakeY: LAKE_Y,
      seaFrame: SEA_TILE_FRAME,
      wet: DEN_WET,
      lake: DEN_LAKE,
      dry: DEN_DRY,
    });

    assert('o zora e autoravel pela aba Inimigos',
      authored.spawns?.length === 3 && authored.spawns.every((s) => s.type === 'zora'),
      JSON.stringify(authored.spawns));
    const dryWarn = (authored.warnings ?? []).find((w) => /zora fora da agua/.test(w));
    assert('o Salvar denuncia a cova de zora em TERRA', dryWarn !== undefined,
      JSON.stringify(authored.warnings));
    // UMA, e nao duas: a cova do lago PINTADO tambem esta na agua. Enquanto o editor perguntava so
    // pelo prop `water`, ele acusava esta aqui — e mandava o autor mover a unica cova que estava
    // certa. Um aviso que mente e pior que aviso nenhum.
    assert('...e denuncia SO ela: agua pintada tambem e agua', /^1 ponto/.test(dryWarn ?? ''),
      String(dryWarn));
    // A metade que inverte a regra da casa: a cova dentro do rio NAO pode aparecer no aviso de tile
    // bloqueado, que e o aviso que qualquer outra especie levaria no mesmo tile.
    assert('a cova dentro do rio nao e tratada como tile bloqueado',
      !(authored.warnings ?? []).some((w) => /spawn de inimigo em tile bloqueado/.test(w)),
      JSON.stringify(authored.warnings));

    log('LAB: P joga o mundo editado');
    await driver.press('p', { count: 1 });
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 15000 });
    await page.waitForFunction(() => window.gameDebug?.getState()?.levelIntroOpen === false, null, { timeout: 15000 });
    await driver.settle(300);

    // O cuspe fere de verdade, e as assercoes de dano abaixo comparam antes/depois — vida alta
    // impede que o cenario morra no meio da medicao (o que ele mediria era a tela de morte).
    await page.evaluate(() => { window.__scene.playerHealth = 20; });

    const zoras = () => page.evaluate(() => window.__scene.enemyManager.getAliveEnemies()
      .filter((e) => e.kind === 'zora')
      .map((e) => ({ worldX: e.worldX, worldY: e.worldY, phase: e.zoraPhase, spawning: e.isSpawning })));

    log('COVA: as duas aguas abrem (prop e tile); a de terra fica calada');
    await page.waitForFunction(() => window.__scene.enemyManager.getAliveEnemies()
      .filter((e) => e.kind === 'zora').length >= 2, null, { timeout: 15000 });
    let state = await driver.getState();
    assert('a cova no rio-PROP fez o corpo', spawnerAt(state, DEN_WET)?.occupied === true,
      JSON.stringify(state.enemySpawners));
    // A regressao em uma linha: agua pintada e agua. Sem esta assercao, o zora volta a ficar mudo em
    // todo lago do overworld — que e onde a agua deste jogo de fato mora.
    assert('a cova no lago PINTADO tambem fez o corpo (tile de terreno e agua)',
      spawnerAt(state, DEN_LAKE)?.occupied === true, JSON.stringify(state.enemySpawners));
    assert('a cova em terra seca nunca abriu', spawnerAt(state, DEN_DRY)?.occupied === false,
      JSON.stringify(state.enemySpawners));
    assert('ha um zora por cova de agua, e nenhum a mais', (await zoras()).length === 2,
      JSON.stringify(await zoras()));

    // ── 2. O CICLO INTEIRO ────────────────────────────────────────────────────
    // submerso → emergindo → erguido → cuspindo. Amostra por 12s (o ciclo fecha em ~4,3s) e cobra
    // que TODAS as fases aconteceram: um zora preso em qualquer uma delas seria um bicho quebrado
    // que ainda passa num teste de "ele existe".
    // Daqui pra baixo o assunto e UM corpo: o do rio-prop. O do lago fica submerso o teste inteiro
    // (o heroi esta a 11 tiles dele, alem do SURFACE_RANGE), entao ele nunca sai de (10,3) — e a
    // coluna do rio e o que separa um do outro sem ambiguidade.
    const riverZora = async () => (await zoras()).find((z) => z.worldX === RIVER_X);

    log('CICLO: amostra as fases e as posicoes de emersao');
    const seenPhases = new Set();
    const surfacedAt = new Set();
    let sawSubmergedInvulnerable = false;
    let sawUpVulnerable = false;
    for (let i = 0; i < 60; i += 1) {
      await sleep(200);
      const z = await riverZora();
      if (!z) continue;
      seenPhases.add(z.phase);
      if (z.phase === 'submerged' && z.spawning === true) sawSubmergedInvulnerable = true;
      if (z.phase === 'up' && z.spawning === false) sawUpVulnerable = true;
      if (z.phase === 'up' || z.phase === 'spitting') surfacedAt.add(`${z.worldX},${z.worldY}`);
    }
    assert('ele passa por todas as fases do ciclo',
      ['submerged', 'rising', 'up', 'spitting'].every((p) => seenPhases.has(p)),
      JSON.stringify([...seenPhases]));
    assert('submerso ele NAO e um alvo (o jogo o trata como invulneravel)',
      sawSubmergedInvulnerable === true, JSON.stringify([...seenPhases]));
    assert('erguido ele E um alvo', sawUpVulnerable === true, JSON.stringify([...seenPhases]));
    // "Some aqui, aparece ali" e a assinatura do bicho: com o heroi PARADO, ele ainda tem de trocar
    // de tile. A primeira versao pegava o tile mais proximo do heroi e ficava preso num buraco so.
    assert('ele emergiu em mais de um tile do rio, com o heroi parado', surfacedAt.size >= 2,
      JSON.stringify([...surfacedAt]));
    assert('e todo tile em que emergiu era rio',
      [...surfacedAt].every((k) => k.split(',')[0] === String(RIVER_X)), JSON.stringify([...surfacedAt]));
    // A foto espera a fase ERGUIDO. Sem isso ela cai onde o relogio estiver — e o ciclo passa 3/4 do
    // tempo submerso, entao a "foto do zora" virava foto de uma agua vazia. Um screenshot que nao
    // mostra a peca nao serve pra julgar a arte dela, que e pra isso que ele existe.
    await page.waitForFunction((rx) => window.__scene.enemyManager.getAliveEnemies()
      .some((e) => e.kind === 'zora' && e.worldX === rx && (e.zoraPhase === 'up' || e.zoraPhase === 'spitting')),
    RIVER_X, { timeout: 20000 });
    await shot('zora-erguido-no-rio');

    // ── 3. O CUSPE FERE ───────────────────────────────────────────────────────
    log('CUSPE: o tiro mirado sai e o heroi na margem perde vida');
    const healthBefore = (await driver.getState()).health;
    let sawSpit = false;
    for (let i = 0; i < 40; i += 1) {
      await sleep(200);
      if (((await driver.getState()).shots ?? []).some((s) => s.kind === 'spit')) sawSpit = true;
      if (sawSpit && (await driver.getState()).health < healthBefore) break;
    }
    const healthAfter = (await driver.getState()).health;
    assert('houve cuspe no ar', sawSpit === true, 'nenhum projetil "spit" amostrado em 8s');
    assert('e ele feriu o heroi na margem', healthAfter < healthBefore,
      JSON.stringify({ healthBefore, healthAfter }));

    // ── 4. A JANELA, COBRADA NOS DOIS SENTIDOS ────────────────────────────────
    // O mesmo golpe, no mesmo corpo, em dois momentos. Sem a primeira metade, um zora sempre
    // vulneravel passa; sem a segunda, um zora imortal passa.
    log('JANELA: 999 de dano submerso NAO mata');
    await page.waitForFunction((rx) => window.__scene.enemyManager.getAliveEnemies()
      .some((e) => e.kind === 'zora' && e.worldX === rx && e.zoraPhase === 'submerged'),
    RIVER_X, { timeout: 20000 });
    const underwater = await page.evaluate((rx) => {
      const z = window.__scene.enemyManager.getAliveEnemies()
        .find((e) => e.kind === 'zora' && e.worldX === rx);
      const killed = z.takeDamage(999);
      return { killed, stillAlive: z.isAlive, phase: z.zoraPhase };
    }, RIVER_X);
    assert('submerso, o golpe RESVALA e ele continua vivo',
      underwater.killed === false && underwater.stillAlive === true, JSON.stringify(underwater));

    log('JANELA: o mesmo golpe com ele ERGUIDO mata');
    await page.waitForFunction((rx) => window.__scene.enemyManager.getAliveEnemies()
      .some((e) => e.kind === 'zora' && e.worldX === rx && !e.isSpawning),
    RIVER_X, { timeout: 20000 });
    const surfaced = await page.evaluate((rx) => {
      const z = window.__scene.enemyManager.getAliveEnemies()
        .find((e) => e.kind === 'zora' && e.worldX === rx);
      const killed = z.takeDamage(999);
      return { killed, stillAlive: z.isAlive, phase: z.zoraPhase };
    }, RIVER_X);
    assert('erguido, o mesmo golpe mata', surfaced.killed === true && surfaced.stillAlive === false,
      JSON.stringify(surfaced));

    // ── 5. A CONTRA-JOGADA QUE O ZELDA NAO TEM ────────────────────────────────
    // No original nao ha resposta pro Zola: voce sai da margem. Aqui o rio pode deixar de ser rio —
    // ponte, vau de pedra ou comporta —, e sem agua aberta ele nao tem onde nascer. E a soma de duas
    // pecas que ja existiam, e e o unico jeito de o jogador ENCERRAR o assunto.
    log('CONTRA-JOGADA: drena o rio inteiro e o bicho perde a casa');
    await page.evaluate(() => {
      window.__scene.enemySpawners.respawnMs = 1200; // encurta a espera da cova
      window.__scene.waterTiles.forEach((w) => w.drain());
    });
    await driver.settle(1500);
    const drained = await page.evaluate(() => ({
      openWater: window.__scene.waterTiles.filter((w) => w.blocking).length,
      zoras: window.__scene.enemyManager.getAliveEnemies().filter((e) => e.kind === 'zora').length,
    }));
    assert('o rio virou leito seco (nenhuma agua aberta sobrou)', drained.openWater === 0,
      JSON.stringify(drained));

    // O relogio da cova ja passou; sem agua, ela nao pode fazer outro — e essa e a diferenca entre
    // "matei um" e "resolvi o problema". (O zora do lago pintado continua vivo do outro lado do
    // mapa, e isso e correto: ninguem drenou o lago dele. E tambem a prova de que o que calou a cova
    // do rio foi a agua ter sumido, e nao o cenario ter parado de fazer zoras.)
    await sleep(4000);
    const afterDrain = await zoras();
    state = await driver.getState();
    assert('sem rio, a cova do rio nao faz outro zora',
      afterDrain.every((z) => z.worldX !== RIVER_X), JSON.stringify(afterDrain));
    assert('e a cova do rio fica registrada como vazia',
      spawnerAt(state, DEN_WET)?.occupied === false, JSON.stringify(state.enemySpawners));
    assert('enquanto o zora do lago intacto continua de pe',
      afterDrain.some((z) => z.worldX === LAKE_X), JSON.stringify(afterDrain));
    await shot('rio-drenado-sem-zora');

    // ── 6. O CUSPE SOBRE AGUA PINTADA ─────────────────────────────────────────
    // O bug que passou por este cenario inteiro sem ser visto: o tiro consultava o mesmo "solido"
    // que um CORPO consulta, e o frame do mar esta em SOLID_GROUND_FRAMES. Sobre rio-PROP o tiro
    // voava (prop de hazard e perdoado), sobre agua PINTADA ele morria no tile do proprio bicho —
    // o zora de todo lago do overworld nascia, emergia, abria a boca e nao fazia nada. A metade
    // anterior deste cenario media so o rio-prop, entao aprovava um jogo quebrado no mundo grande.
    log('AGUA PINTADA: o zora do lago tem de cuspir e ACERTAR igual ao do rio');
    await page.evaluate(({ x, y }) => {
      // Poe o heroi na margem do lago: o zora so emerge com ele dentro do SURFACE_RANGE.
      window.__scene.playerWorld.worldX = x;
      window.__scene.playerWorld.worldY = y;
      window.__scene.playerHealth = 20;
    }, { x: LAKE_X - 1, y: LAKE_Y[LAKE_Y.length - 1] + 2 });
    await driver.settle(400);

    const lakeBefore = (await driver.getState()).health;
    let sawLakeSpit = false;
    for (let i = 0; i < 60; i += 1) {
      await sleep(200);
      if (((await driver.getState()).shots ?? []).some((s) => s.kind === 'spit')) sawLakeSpit = true;
      if (sawLakeSpit && (await driver.getState()).health < lakeBefore) break;
    }
    const lakeAfter = (await driver.getState()).health;
    assert('o zora do lago PINTADO cospe (a bala nao morre na agua de terreno)',
      sawLakeSpit === true, 'nenhum projetil "spit" saiu do lago em 12s');
    assert('e o cuspe dele fere o heroi na margem', lakeAfter < lakeBefore,
      JSON.stringify({ lakeBefore, lakeAfter }));
    await shot('cuspe-sobre-agua-pintada');
  },
};

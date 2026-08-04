// O PONTO DE SPAWN AUTORADO — a aba Inimigos do editor, e o inimigo que VOLTA.
//
// O jogo tinha uma fonte de caveira so: o cerco (UndeadSpawnDirector), que invoca num anel em
// volta do HEROI enquanto ele demora no escuro. Isso e pressao ambiente e nao serve pra autorar
// nada — nao existe "a caveira daquele corredor" —, e ele fica DESLIGADO no lab e nos levels.
// Que e exatamente a propriedade que faz este cenario valer: rodando em /lab, o cerco nao existe,
// entao TODA caveira que aparecer aqui saiu de uma cova autorada. Nao ha outra leitura possivel.
//
// A fixture sao tres covas, e cada uma responde uma pergunta diferente:
//
//     (2,6) HEROI        (10,6) COVA A — a que funciona: nasce, morre, VOLTA
//     (1,1) COVA B ao lado da fogueira ACESA — tem de ficar calada (e abrir quando ela apagar)
//     (8,10) COVA C debaixo de uma PEDRA — tile bloqueado, nada nasce nunca
//
// A fogueira vai pro canto (0,0) porque ela tem dois efeitos que atropelariam o teste de perto:
// dentro de CAMPFIRE_SAFE_RADIUS (5) o heroi fica "safe" e a caveira se desfaz sozinha em 2-5s
// (sunset), e dentro de LIGHT_RADIUS (4.5) ela nem entra. A 6,3 tiles do heroi, nenhum dos dois.
//
// O respawn de verdade e 25s (ENEMY_RESPAWN_MS). O cenario ENCURTA o relogio em campo, porque um
// teste que espera 25s por assercao vira minutos — e cobra, antes de encurtar, que o valor de boot
// seja o do jogo: sem isso, encurtar poderia estar escondendo um default errado.

const HERO = { x: 2, y: 6 };
const COVA_A = { x: 10, y: 6 };
const COVA_B = { x: 1, y: 1 };
const COVA_C = { x: 8, y: 10 };
const FIRE = { x: 0, y: 0 };
const RESPAWN_MS = 25000; // ENEMY_RESPAWN_MS
const SHORT_RESPAWN_MS = 1500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const spawnerAt = (state, tile) => (state.enemySpawners ?? []).find(
  (s) => s.worldX === tile.x && s.worldY === tile.y,
);

export default {
  name: 'inimigos',
  description: 'A aba Inimigos autora pontos de spawn: a caveira nasce no tile escolhido, volta depois de morta, uma por cova — e a luz de fogueira cala a cova.',
  needsGame: false, // entra pelo editor e nasce a GameScene no P (mesma razao do braco/placa-undead)
  route: '/lab?level=1',
  async run({ driver, shot, assert, log }) {
    await driver.settle(3000);
    const page = driver.page;

    log('EDITOR: autora as tres covas pelo EditorStore de verdade (o caminho de quem autora)');
    const authored = await page.evaluate(({ hero, a, b, c, fire }) => {
      const store = window.__scene?.store;
      if (!store) return { error: 'sem store no editor' };

      // O level 1 e um puzzle cheio: limpa o mapa inteiro, senao o teste mede a mobilia dele.
      store.beginStroke();
      for (let x = 0; x <= 11; x += 1) {
        for (let y = 0; y <= 11; y += 1) {
          store.eraseEntitiesAt(x, y);
          store.setCell('upper', x, y, null);
          store.setCell('collision', x, y, false);
        }
      }
      store.commitStroke();

      store.setSpawn(hero.x, hero.y);
      store.placeEntity({ list: 'props', type: 'campfire', worldX: fire.x, worldY: fire.y });
      store.placeEntity({ list: 'props', type: 'rock', worldX: c.x, worldY: c.y });
      store.placeEntity({ list: 'enemies', type: 'undead', worldX: a.x, worldY: a.y });
      store.placeEntity({ list: 'enemies', type: 'undead', worldX: b.x, worldY: b.y });
      store.placeEntity({ list: 'enemies', type: 'undead', worldX: c.x, worldY: c.y });

      return {
        spawns: store.allEntities().filter((e) => e.list === 'enemies'),
        stats: store.stats(),
        warnings: store.validate(),
        // A cova em (8,10) divide o tile com a pedra: listas diferentes convivem no mesmo tile,
        // e se placeEntity tivesse comido uma das duas o resto do teste mediria outra coisa.
        onRock: store.entitiesAt(c.x, c.y).map((e) => e.list).sort(),
      };
    }, { hero: HERO, a: COVA_A, b: COVA_B, c: COVA_C, fire: FIRE });

    assert('as tres covas entraram no mundo pela aba Inimigos',
      authored.spawns?.length === 3 && authored.spawns.every((s) => s.type === 'undead'),
      JSON.stringify(authored));
    assert('o contador do modal Mundo conta inimigos', authored.stats?.enemies === 3,
      JSON.stringify(authored.stats));
    assert('a cova e a pedra dividem o tile (listas diferentes nao se comem)',
      JSON.stringify(authored.onRock) === JSON.stringify(['enemies', 'props']),
      JSON.stringify(authored.onRock));
    // As duas covas nascidas mortas tem de ser DENUNCIADAS no Salvar: em jogo elas sao silenciosas,
    // e um tile que nunca faz nada, sem aviso nenhum, e o pior defeito que um editor pode ter.
    assert('o editor avisa da cova em tile bloqueado',
      (authored.warnings ?? []).some((w) => /spawn de inimigo em tile bloqueado/.test(w)),
      JSON.stringify(authored.warnings));
    assert('o editor avisa da cova dentro da luz da fogueira acesa',
      (authored.warnings ?? []).some((w) => /dentro da luz de uma fogueira acesa/.test(w)),
      JSON.stringify(authored.warnings));

    log('LAB: P joga o mundo editado');
    await driver.press('p', { count: 1 });
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 15000 });
    await page.waitForFunction(() => window.gameDebug?.getState()?.levelIntroOpen === false, null, { timeout: 15000 });
    await driver.settle(300);

    let state = await driver.getState();
    assert('as tres covas chegaram no runtime', (state.enemySpawners ?? []).length === 3,
      JSON.stringify(state.enemySpawners));
    assert('o heroi nasceu onde a fixture pediu, longe da fogueira',
      state.player.worldX === HERO.x && state.player.worldY === HERO.y && state.safety.safe === false,
      JSON.stringify({ player: state.player, safety: state.safety }));

    const bootRespawn = await page.evaluate(() => window.__scene.enemySpawners.respawnMs);
    assert('o jogo boota com o respawn de verdade (o teste encurta DEPOIS de cobrar isto)',
      bootRespawn === RESPAWN_MS, String(bootRespawn));

    // ── 1. A COVA FAZ O CORPO ─────────────────────────────────────────────────
    log('COVA A: o heroi esta a 8 tiles, dentro do raio de visao — ela abre sozinha');
    await page.waitForFunction(
      ({ x, y }) => (window.gameDebug?.getState()?.undead ?? []).some((u) => u.worldX === x && u.worldY === y),
      COVA_A, { timeout: 15000 },
    );
    state = await driver.getState();
    assert('a caveira nasceu EM CIMA da cova A, e ela e a unica no mundo',
      state.undead.length === 1
      && state.undead[0].worldX === COVA_A.x && state.undead[0].worldY === COVA_A.y,
      JSON.stringify(state.undead));
    assert('a cova A esta marcada como ocupada, sem relogio correndo',
      spawnerAt(state, COVA_A)?.occupied === true && spawnerAt(state, COVA_A)?.cooldownMs === 0,
      JSON.stringify(state.enemySpawners));
    // As duas covas mortas, cobradas no MESMO frame em que a boa acabou de funcionar: assim
    // "ficaram caladas" nao pode ser confundido com "o sistema todo estava parado".
    assert('a cova na luz da fogueira ficou calada', spawnerAt(state, COVA_B)?.occupied === false,
      JSON.stringify(state.enemySpawners));
    assert('a cova debaixo da pedra ficou calada', spawnerAt(state, COVA_C)?.occupied === false,
      JSON.stringify(state.enemySpawners));
    await shot('cova-fez-a-caveira');

    // ── 2. MORREU, E VOLTA ────────────────────────────────────────────────────
    // Invulneravel enquanto sai do chao (telegrafo 3s + animacao ~0.8s): esperar o ESTADO, nunca
    // um relogio. Sem isto o takeDamage abaixo baterira numa caveira imune e nada morreria.
    await page.waitForFunction(
      () => (window.gameDebug?.getState()?.undead ?? []).some((u) => u.spawning === false),
      null, { timeout: 15000 },
    );
    log('MORTE: encurta o relogio da cova e mata o corpo dela');
    await page.evaluate((ms) => { window.__scene.enemySpawners.respawnMs = ms; }, SHORT_RESPAWN_MS);
    await page.evaluate(({ x, y }) => window.__scene.enemyManager.getEnemyAt(x, y).takeDamage(999), COVA_A);
    // A morte tem tween (~310ms) antes de o gerenciador varrer o corpo; o que importa aqui e que
    // a cova ja soltou o ocupante e comecou a contar.
    await driver.settle(200);
    state = await driver.getState();
    assert('caiu o corpo, a cova solta o ocupante e o relogio comeca a correr',
      spawnerAt(state, COVA_A)?.occupied === false && spawnerAt(state, COVA_A)?.cooldownMs > 0,
      JSON.stringify(state.enemySpawners));

    log('RESPAWN: passado o relogio, a mesma cova faz outro corpo');
    await page.waitForFunction(
      ({ x, y }) => (window.gameDebug?.getState()?.undead ?? []).some((u) => u.worldX === x && u.worldY === y),
      COVA_A, { timeout: 15000 },
    );
    state = await driver.getState();
    assert('a cova A voltou a ficar ocupada, no mesmo tile',
      spawnerAt(state, COVA_A)?.occupied === true
      && state.undead.some((u) => u.worldX === COVA_A.x && u.worldY === COVA_A.y),
      JSON.stringify({ spawners: state.enemySpawners, undead: state.undead }));
    await shot('cova-devolveu-a-caveira');

    // ── 3. UMA POR COVA, MESMO COM O CORPO LONGE ──────────────────────────────
    // A caveira nascida sai andando atras do heroi. A cova continua responsavel por ela: se o
    // criterio fosse "tem alguem no meu tile?", ela faria outra a cada passo que o corpo dela da,
    // e uma cova autorada viraria um cerco. Espera ela SAIR do tile e cobra que nao veio a segunda.
    log('UMA POR COVA: o corpo anda pra longe e a cova NAO faz outro');
    await page.waitForFunction(
      ({ x, y }) => {
        const undead = window.gameDebug?.getState()?.undead ?? [];
        return undead.length > 0 && !undead.some((u) => u.worldX === x && u.worldY === y);
      },
      COVA_A, { timeout: 20000 },
    );
    await sleep(2000);
    state = await driver.getState();
    assert('com o corpo dela longe do tile, a cova segue ocupada e sem fazer outro',
      state.undead.length === 1 && spawnerAt(state, COVA_A)?.occupied === true
      && spawnerAt(state, COVA_A)?.cooldownMs === 0,
      JSON.stringify({ spawners: state.enemySpawners, undead: state.undead }));

    // ── 4. A LUZ E A ALAVANCA ─────────────────────────────────────────────────
    // A cova B esta calada desde o boot por causa da luz — e "calada" so vale alguma coisa se
    // apagar o fogo a ABRIR. Sem esta metade, uma cova simplesmente quebrada passaria no teste.
    log('LUZ: apagar a fogueira ABRE a cova que ela estava calando');
    await page.evaluate(() => window.__scene.campfires.find((cf) => cf.isLit).extinguish());
    await driver.settle(200);
    state = await driver.getState();
    assert('a fogueira apagou', state.litFires === 0, JSON.stringify(state.litFires));
    await page.waitForFunction(
      ({ x, y }) => (window.gameDebug?.getState()?.undead ?? []).some((u) => u.worldX === x && u.worldY === y),
      COVA_B, { timeout: 15000 },
    );
    state = await driver.getState();
    assert('sem a luz, a cova que estava calada faz o corpo dela',
      spawnerAt(state, COVA_B)?.occupied === true, JSON.stringify(state.enemySpawners));
    // E a de baixo da pedra continua calada: o que a destravava era luz, e ela nunca teve luz —
    // o que ela tem e um tile solido, que apagar fogueira nenhuma resolve.
    assert('a cova debaixo da pedra segue calada (tile bloqueado nao e luz)',
      spawnerAt(state, COVA_C)?.occupied === false, JSON.stringify(state.enemySpawners));
    await shot('apagar-o-fogo-abriu-a-cova');
  },
};

// A TOCHA VIVA — fogo que alcanca um corpo o ACENDE, e o monstro em chamas vira uma peca do
// unico sistema que o jogador conduz: uma fogueira em panico que corre DO heroi acendendo o que
// toca (mato, fogueira morta e OUTRO CORPO, tudo pelo mesmo igniteFlammableAt), que os outros
// monstros temem como temem a luz, e que o fogo termina de comer sozinho (~2,6s), deixando marca.
//
// O que este cenario prova, na ordem:
//   1. fogo chegando no TILE de um corpo o acende (igniteFlammableAt -> igniteBody);
//   2. a ignicao NAO cria luz THREE nenhuma — a luz vem emprestada do pool fixo (a lei mais
//      cara do render: contagem de luzes muda = mundo inteiro recompila);
//   3. o corpo em chamas FOGE do heroi (a posicao anda para longe, nao para perto);
//   4. o fogo PULA de corpo em corpo: a segunda caveira, no caminho da fuga, acende sozinha;
//   5. o rastro acende o mato alto autorado no caminho;
//   6. os dois corpos morrem pelo fogo sem levar um unico golpe, com marca no chao (die de
//      verdade, nao despawn), e a luz emprestada volta pro pool.
//
// Geometria (corredor na linha 6, fogueira-lar no canto oposto — mesma razao do placa-undead:
// perto dela o heroi fica "safe" e caveira se desfaz sozinha):
//
//   (0,0) FOGUEIRA   (3,6) HEROI   (6,6) CAVEIRA A   (9,6) CAVEIRA B   (10,6)+(10,5) MATO ALTO
//
// A caveira A acende via fogo-no-tile; ela foge para LESTE (o heroi esta a oeste), a B — que
// vinha cacando o heroi pela mesma linha — nao consegue chegar a menos de 2 tiles dela (o halo
// de medo no EnemyManager), a A alcanca a B fugindo e o emberTouch de um passo acende a B.

const HERO = { x: 3, y: 6 };
const SKULL_A = { x: 6, y: 6 };
const SKULL_B = { x: 9, y: 6 };
const FIRE = { x: 0, y: 0 };
const GRASS = [{ x: 10, y: 6 }, { x: 10, y: 5 }];

export default {
  name: 'tocha-viva',
  description: 'Fogo que alcanca um corpo o acende: panico, rastro, medo da matilha, fogo pulando de corpo em corpo — e nenhuma luz THREE nova.',
  needsGame: false, // entra pelo editor e nasce a GameScene no P (mesma razao do placa-undead)
  route: '/lab?level=1',
  async run({ driver, shot, assert, log }) {
    await driver.settle(3000);
    const page = driver.page;

    log('EDITOR: limpa o mapa, poe a fogueira no canto, o spawn e o mato do rastro');
    const authored = await page.evaluate(({ hero, fire, grass }) => {
      const store = window.__scene?.store;
      if (!store) return { error: 'sem store no editor' };
      store.beginStroke();
      for (let x = 0; x <= 11; x += 1) {
        for (let y = 0; y <= 11; y += 1) {
          store.eraseEntitiesAt(x, y);
          store.setCell('upper', x, y, null);
          store.setCell('collision', x, y, false);
        }
      }
      store.commitStroke();
      store.placeEntity({ list: 'props', type: 'campfire', worldX: fire.x, worldY: fire.y });
      store.setSpawn(hero.x, hero.y);
      for (const g of grass) {
        store.placeEntity({ list: 'props', type: 'tallGrass', worldX: g.x, worldY: g.y });
      }
      return {
        campfires: store.allEntities().filter((e) => e.type === 'campfire').length,
        grasses: store.allEntities().filter((e) => e.type === 'tallGrass').length,
      };
    }, { hero: HERO, fire: FIRE, grass: GRASS });
    assert('fixture: uma fogueira no canto e o mato do rastro autorado',
      authored.campfires === 1 && authored.grasses === GRASS.length, JSON.stringify(authored));

    log('LAB: P joga o mundo editado');
    await driver.press('p', { count: 1 });
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 15000 });
    await page.waitForFunction(() => window.gameDebug?.getState()?.levelIntroOpen === false, null, { timeout: 15000 });
    await driver.settle(300);

    let state = await driver.getState();
    assert('o heroi nasceu fora do raio seguro (senao caveira nem vive aqui)',
      state.safety.safe === false, JSON.stringify(state.safety));

    // ── 1. DUAS CAVEIRAS, E O FOGO CHEGA NO TILE DA PRIMEIRA ──────────────────
    log('CAVEIRAS: A entre o heroi e a B; as duas terminam de nascer');
    await page.evaluate(({ a, b }) => {
      window.__scene.enemyManager.spawnUndead(a.x, a.y);
      window.__scene.enemyManager.spawnUndead(b.x, b.y);
    }, { a: SKULL_A, b: SKULL_B });
    await page.waitForFunction(
      () => {
        const u = window.gameDebug?.getState()?.undead ?? [];
        return u.length === 2 && u.every((e) => e.spawning === false);
      },
      null, { timeout: 20000 },
    );

    // A contagem de luzes THREE ANTES da ignicao — a lei diz que ela nunca muda em runtime.
    const lightsBefore = await page.evaluate(() => window.__scene.world3d.stats().pointLights);
    const firesBefore = await page.evaluate(() => window.__scene.world3d.stats().fires);

    log('IGNICAO: fogo chega no tile da caveira A (o mesmo buraco do espalhamento)');
    // A leitura dos fogos sai do MESMO evaluate da ignicao: um round-trip depois, o primeiro
    // passo de panico (190ms) ja pode ter acendido mato — e a contagem mediria outra coisa.
    const ignited = await page.evaluate(() => {
      const a = window.__scene.enemyManager.getAliveEnemies()[0];
      const at = { x: a.worldX, y: a.worldY };
      window.__scene.igniteFlammableAt(a.worldX, a.worldY);
      const stats = window.__scene.world3d.stats();
      return { at, burning: a.isBurning, lights: stats.pointLights, fires: stats.fires };
    });
    assert('fogo que chega no tile de um corpo o acende', ignited.burning === true,
      JSON.stringify(ignited));
    state = await driver.getState();
    assert('o snapshot enxerga a tocha viva', state.undead.filter((u) => u.burning).length === 1,
      JSON.stringify(state.undead));
    await shot('caveira-acesa');

    // ── 2. NENHUMA LUZ NOVA: a claridade dela vem EMPRESTADA do pool fixo ─────
    assert('a tocha viva NAO criou luz THREE nenhuma (a lei do pool)',
      ignited.lights === lightsBefore, JSON.stringify({ lightsBefore, ignited }));
    assert('...mas registrou um fogo a mais no pool (a entrada que anda)',
      ignited.fires === firesBefore + 1, JSON.stringify({ firesBefore, ignited }));

    // ── 3. O PANICO FOGE DO HEROI, E 4. O FOGO PULA PRA CAVEIRA B ─────────────
    log('PANICO: A corre pra LESTE (o heroi esta a oeste) e alcanca a B');
    await page.waitForFunction(
      ({ start }) => {
        const u = (window.gameDebug?.getState()?.undead ?? []).filter((e) => e.burning);
        return u.length > 0 && u[0].worldX > start;
      },
      { start: ignited.at.x }, { timeout: 5000 },
    );
    await page.waitForFunction(
      () => (window.gameDebug?.getState()?.undead ?? []).filter((e) => e.burning).length === 2,
      null, { timeout: 8000 },
    );
    state = await driver.getState();
    assert('o fogo pulou de corpo em corpo: as duas ardem',
      state.undead.length === 2 && state.undead.every((u) => u.burning),
      JSON.stringify(state.undead));
    await shot('fogo-pulou-de-corpo-em-corpo');

    // ── 5. O RASTRO ACENDE O MATO DO CAMINHO ──────────────────────────────────
    log('RASTRO: a fuga passa pelo mato alto e ele pega');
    await page.waitForFunction(
      () => window.__scene.tallGrasses.some((g) => g.isBurning),
      null, { timeout: 8000 },
    );
    await shot('rastro-acendeu-o-mato');

    // ── 6. O FOGO TERMINA DE COMER OS DOIS, COM MARCA ─────────────────────────
    log('FIM: os dois corpos caem sem ter levado um unico golpe');
    await page.waitForFunction(
      () => (window.gameDebug?.getState()?.undead ?? []).length === 0,
      null, { timeout: 10000 },
    );
    const wake = await page.evaluate(() => ({
      corpses: window.__scene.enemyManager.corpseCount,
      lights: window.__scene.world3d.stats().pointLights,
    }));
    assert('morreram DE VERDADE (die, nao despawn): duas marcas no chao',
      wake.corpses === 2, JSON.stringify(wake));
    // So a LEI aqui (contagem de luz THREE imutavel) — a contagem de `fires` fica de fora de
    // proposito: o mato do rastro ainda pode estar queimando, e o numero mediria o incendio.
    assert('a contagem de luzes THREE segue exatamente a mesma',
      wake.lights === lightsBefore, JSON.stringify({ wake, lightsBefore }));
    await shot('so-ficou-a-marca-e-o-fogo-no-mato');
  },
};

// O CALOR DA FOGUEIRA — a UNICA coisa que uma fogueira faz a um monstro.
//
// A luz ja foi uma PAREDE (monstro nenhum pisava nela, sem que nada na tela dissesse por que), e
// essa parede caiu. Sobrou uma regra so, fisica: a DOIS TILES da lenha o corpo pega fogo e perde
// uma espadada de vida a cada mordida (SCORCH_BITE_MS, 1,6s); a tres, a fogueira e uma luz bonita
// e mais nada. Isto entrou no lugar do DESMANCHE POR SEGURANCA: a caveira se desfazia sozinha 2-5s
// depois de o heroi pisar no anel de uma fogueira, e a matilha inteira evaporava sem causa.
//
// O que este cenario prova, na ordem:
//   1. o corpo que CHEGA no heroi na fogueira pega fogo sozinho (scorching), sem ninguem acender;
//   2. ...e NAO gasta o pool de fogo: zero luz THREE nova e zero entrada de fogo a mais (a tocha
//      viva pede uma; o calor nao, porque a fogueira ao lado ja ilumina a cena);
//   3. ele CONTINUA VIVO enquanto arde, perdendo vida por mordida (o pedido em uma frase);
//   4. e morre pelo fogo sem levar um unico golpe, com marca no chao — die de verdade, nao despawn;
//   5. NINGUEM MAIS SOME SOZINHO: com o heroi sentado no fogo por 9s (o dobro do antigo sunset
//      maximo, 4,8s), a caveira presa longe dali continua de pe;
//   6. sair do calor APAGA e a cicatriz fica: apagada a fogueira, a aranha para de arder, segue
//      viva e NAO recupera a vida que o fogo comeu.
//
// Geometria (fogueira em (2,6), heroi COLADO nela — dentro do anel seguro):
//
//   (2,6) FOGUEIRA   (3,6) HEROI   (6,6) A CAVEIRA QUE VEM   (9,9) A CAVEIRA PRESA (cercada)
//
// A caveira nasce a 4 tiles e CACA o heroi: ela anda para oeste ate ficar colada nele, em (4,6) —
// que esta a DOIS tiles da lenha, dentro do calor. Ou seja, o teste nao empurra ninguem para o
// fogo: ele deixa o bicho fazer o que ele sempre faz e mede o preco disso. E o que a queda da
// parede mudou — antes ele parava a 3,16 e assava sem nunca chegar.

const FIRE = { x: 2, y: 6 };
const HERO = { x: 3, y: 6 };
const SPAWN = { x: 6, y: 6 }; // de onde ela vem: longe do fogo, e 100% segura ali
const OVEN = { x: 4, y: 6 }; // onde ela para (colada no heroi) — dois tiles da lenha: o calor
const CAGED = { x: 9, y: 9 }; // longe de tudo, e cercado de pedra: nao anda, nao assa, nao some

export default {
  name: 'brasa',
  description: 'O calor da fogueira: quem se encosta na luz pega fogo e perde vida ate cair — e ninguem mais se desmancha sozinho quando o heroi chega no fogo.',
  needsGame: false, // entra pelo editor e nasce a GameScene no P (mesma razao do tocha-viva)
  route: '/lab?level=1',
  async run({ driver, shot, assert, log }) {
    await driver.settle(3000);
    const page = driver.page;

    log('EDITOR: limpa o mapa, poe a fogueira, o spawn do heroi e a jaula de pedra');
    const authored = await page.evaluate(({ hero, fire, caged }) => {
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
      // A JAULA: os quatro vizinhos do tile da caveira presa viram parede. Sem ela a caveira
      // andaria ate a fogueira (o heroi esta la) e morreria assada — provando o contrario do que
      // este passo quer provar, que e que ela NAO some sozinha.
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        store.setCell('collision', caged.x + ox, caged.y + oy, true);
      }
      store.commitStroke();
      store.placeEntity({ list: 'props', type: 'campfire', worldX: fire.x, worldY: fire.y });
      store.setSpawn(hero.x, hero.y);
      return {
        campfires: store.allEntities().filter((e) => e.type === 'campfire').length,
      };
    }, { hero: HERO, fire: FIRE, caged: CAGED });
    assert('fixture: uma fogueira e a jaula de pedra autoradas',
      authored.campfires === 1, JSON.stringify(authored));

    log('LAB: P joga o mundo editado');
    await driver.press('p', { count: 1 });
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 15000 });
    await page.waitForFunction(() => window.gameDebug?.getState()?.levelIntroOpen === false, null, { timeout: 15000 });
    await driver.settle(300);

    let state = await driver.getState();
    assert('o heroi nasceu DENTRO do anel seguro da fogueira (o descanso — e o antigo gatilho do sunset)',
      state.safety.safe === true, JSON.stringify(state.safety));

    // ── OS DOIS CORPOS ────────────────────────────────────────────────────────
    log('CAVEIRAS: uma que VEM ate o heroi na fogueira, outra presa na jaula longe dali');
    const lightsBefore = await page.evaluate(() => window.__scene.world3d.stats().pointLights);
    const firesBefore = await page.evaluate(() => window.__scene.world3d.stats().fires);
    await page.evaluate(({ spawn, caged }) => {
      window.__scene.enemyManager.spawnUndead(spawn.x, spawn.y);
      window.__scene.enemyManager.spawnUndead(caged.x, caged.y);
    }, { spawn: SPAWN, caged: CAGED });
    // Nascendo o corpo e invulneravel e inerte — e o calor respeita isso como o fogo respeita.
    await page.waitForFunction(
      () => {
        const u = window.gameDebug?.getState()?.undead ?? [];
        return u.length === 2 && u.every((e) => e.spawning === false);
      },
      null, { timeout: 20000 },
    );
    const bornAt = Date.now();

    // ── 1 e 2. ELA PEGA FOGO SOZINHA, E DE GRACA ──────────────────────────────
    log('CALOR: ela anda ate o heroi e, a dois tiles da lenha, comeca a arder sozinha');
    const scorched = await page.waitForFunction(
      ({ oven }) => {
        const e = (window.gameDebug?.getState()?.undead ?? [])
          .find((u) => u.worldX === oven.x && u.worldY === oven.y);
        if (!e?.scorching) return null;
        const stats = window.__scene.world3d.stats();
        return { health: e.health, maxHealth: e.maxHealth, burning: e.burning, ...stats };
      },
      { oven: OVEN }, { timeout: 15000 },
    ).then((h) => h.jsonValue());
    assert('o corpo encostado na fogueira ARDE por conta do calor',
      scorched.health === scorched.maxHealth, JSON.stringify(scorched));
    assert('...e NAO e a tocha viva (aquela corre em panico e espalha fogo; esta continua a especie)',
      scorched.burning === false, JSON.stringify(scorched));
    assert('a brasa NAO cria luz THREE nenhuma (a lei do pool)',
      scorched.pointLights === lightsBefore, JSON.stringify({ lightsBefore, scorched }));
    assert('...nem gasta uma entrada do pool de fogo — quem ilumina ali e a fogueira ao lado',
      scorched.fires === firesBefore, JSON.stringify({ firesBefore, scorched }));
    await shot('corpo-assando-na-beira-da-luz');

    // ── 3. VIVO, PERDENDO VIDA ────────────────────────────────────────────────
    log('MORDIDA: a vida cai enquanto ele ARDE — e ele continua de pe');
    const bitten = await page.waitForFunction(
      ({ oven }) => {
        const e = (window.gameDebug?.getState()?.undead ?? [])
          .find((u) => u.worldX === oven.x && u.worldY === oven.y);
        if (!e || e.health >= e.maxHealth) return null;
        return { health: e.health, maxHealth: e.maxHealth, scorching: e.scorching };
      },
      { oven: OVEN }, { timeout: 9000 },
    ).then((h) => h.jsonValue());
    assert('o fogo tirou vida do corpo — que segue VIVO e ardendo',
      bitten.health > 0 && bitten.health < bitten.maxHealth && bitten.scorching === true,
      JSON.stringify(bitten));

    // ── 4. O CALOR MATA, E A MORTE E DE VERDADE ───────────────────────────────
    log('FIM: o corpo cai queimado sem ter levado um unico golpe');
    await page.waitForFunction(
      ({ oven }) => !(window.gameDebug?.getState()?.undead ?? [])
        .some((u) => u.worldX === oven.x && u.worldY === oven.y),
      { oven: OVEN }, { timeout: 20000 },
    );
    // A MARCA e agendada, nao instantanea: a ossada so cai quando o desmanche termina e o
    // EnemyManager remove o corpo (o mesmo cuidado do tocha-viva).
    await page.waitForFunction(
      () => window.__scene.enemyManager.corpseCount === 1,
      null, { timeout: 5000 },
    );
    const burned = await page.evaluate(() => ({
      corpses: window.__scene.enemyManager.corpseCount,
      lights: window.__scene.world3d.stats().pointLights,
      fires: window.__scene.world3d.stats().fires,
    }));
    assert('morreu DE VERDADE (die, nao despawn): uma marca no chao',
      burned.corpses === 1, JSON.stringify(burned));
    assert('a contagem de luzes THREE segue exatamente a mesma, e o pool de fogo voltou ao que era',
      burned.lights === lightsBefore && burned.fires === firesBefore,
      JSON.stringify({ burned, lightsBefore, firesBefore }));
    await shot('so-ficou-a-marca-do-que-queimou');

    // ── 5. NINGUEM MAIS SOME SOZINHO ──────────────────────────────────────────
    log('SUNSET REMOVIDO: 9s de heroi sentado no fogo, e a caveira presa continua de pe');
    const elapsed = Date.now() - bornAt;
    if (elapsed < 9000) await driver.settle(9000 - elapsed);
    state = await driver.getState();
    const caged = state.undead.find((u) => u.worldX === CAGED.x && u.worldY === CAGED.y);
    assert('a caveira longe do fogo NAO se desmanchou com o heroi em seguranca (o sunset morreu)',
      caged !== undefined && caged.health === caged.maxHealth && caged.scorching === false,
      JSON.stringify(state.undead));
    assert('...e o heroi passou esse tempo todo dentro do anel seguro (o gatilho do antigo sunset)',
      state.safety.safe === true, JSON.stringify(state.safety));
    await shot('a-matilha-nao-evapora-mais');

    // ── 6. APAGOU A FOGUEIRA, PAROU O CALOR — E A CICATRIZ FICA ───────────────
    log('ESFRIOU: uma aranha assa no anel, a fogueira apaga e ela para de arder VIVA');
    // Aranha e nao caveira: 5 degraus de vida (10) contra 3 (6), entao ela aguenta o forno tempo
    // suficiente para a fogueira ser apagada no meio — e de quebra prova que o calor e lei do
    // MUNDO sobre qualquer corpo, nao uma regra da caveira.
    await page.evaluate(({ oven }) => {
      window.__scene.enemyManager.spawn('spider', oven.x, oven.y);
    }, { oven: OVEN });
    await page.waitForFunction(
      ({ oven }) => {
        const e = (window.gameDebug?.getState()?.undead ?? [])
          .find((u) => u.kind === 'spider' && u.worldX === oven.x && u.worldY === oven.y);
        return e !== undefined && e.scorching === true && e.health < e.maxHealth;
      },
      { oven: OVEN }, { timeout: 15000 },
    );
    const cooled = await page.evaluate(() => {
      // A mesma porta que o balde de agua usa (GameScene.douseCampfire -> CampfireObject).
      for (const cf of window.__scene.campfires) cf.extinguish();
      const spider = window.__scene.enemyManager.getAliveEnemies().find((e) => e.kind === 'spider');
      return { health: spider?.healthNow, maxHealth: spider?.healthMax };
    });
    await driver.settle(400);
    state = await driver.getState();
    const spider = state.undead.find((u) => u.kind === 'spider');
    assert('apagada a fogueira o corpo PARA de arder — e continua vivo',
      spider !== undefined && spider.scorching === false, JSON.stringify(state.undead));
    assert('...e a vida que o fogo comeu NAO volta (a cicatriz e o preco de ter chegado perto)',
      spider !== undefined && spider.health === cooled.health && spider.health < spider.maxHealth,
      JSON.stringify({ spider, cooled }));
    await shot('fogueira-apagada-corpo-vivo-e-marcado');
  },
};

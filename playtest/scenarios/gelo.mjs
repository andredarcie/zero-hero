// O CONGELAMENTO — a bola do zora nao fere: TRAVA (FreezeManager). Qualquer coisa congela e vira
// estatua por um tempo — bicho, heroi, item, arvore, arbusto — e a espada, no momento certo,
// DEVOLVE a bola: ela volta pelo caminho que veio e congela o bicho que tocar.
//
// O que este cenario prova, na ordem:
//   1. um corpo congelado e uma ESTATUA: nao anda enquanto o gelo dura, e VOLTA a andar depois;
//   2. a bola de gelo no heroi trava os pes e os botoes SEM tirar uma gota de vida;
//   3. a espada devolve a bola (o snapshot ve `reflected` e a velocidade invertida), e a bola
//      devolvida congela o bicho que estava no caminho;
//   4. fogo derrete gelo: o pulso de fogo num arbusto congelado gasta-se no degelo (nada acende),
//      e so o pulso SEGUINTE queima; fogueira ACESA nem congela.
//
// Geometria (corredor na linha 6; fogueira-lar no canto, longe o bastante para nada ser "safe"):
//
//   (0,0) FOGUEIRA   (3,6) HEROI   ...   corredor aberto ate x=11   (8,2) ARBUSTO (caso 4)

const HERO = { x: 3, y: 6 };
const FIRE = { x: 0, y: 0 };
const BUSH = { x: 8, y: 2 };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default {
  name: 'gelo',
  description: 'A bola do zora congela em vez de ferir: estatuas que voltam, heroi travado sem dano, a espada devolvendo a bola, e fogo derretendo gelo.',
  needsGame: false, // entra pelo editor e nasce a GameScene no P (mesma razao do placa-undead)
  route: '/lab?level=1',
  async run({ driver, shot, assert, log }) {
    await driver.settle(3000);
    const page = driver.page;

    log('EDITOR: limpa o mapa, fogueira no canto, spawn e o arbusto do caso 4');
    const authored = await page.evaluate(({ hero, fire, bush }) => {
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
      store.placeEntity({ list: 'props', type: 'dryBush', worldX: bush.x, worldY: bush.y });
      store.setSpawn(hero.x, hero.y);
      return { campfires: store.allEntities().filter((e) => e.type === 'campfire').length };
    }, { hero: HERO, fire: FIRE, bush: BUSH });
    assert('fixture montada com uma fogueira so', authored.campfires === 1, JSON.stringify(authored));

    log('LAB: P joga o mundo editado');
    await driver.press('p', { count: 1 });
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 15000 });
    await page.waitForFunction(() => window.gameDebug?.getState()?.levelIntroOpen === false, null, { timeout: 15000 });
    await driver.settle(300);

    // ── 1. UM CORPO CONGELADO E UMA ESTATUA, E ELA VOLTA ──────────────────────
    log('ESTATUA: congela a caveira e ela para de caçar');
    await page.evaluate(({ x, y }) => window.__scene.enemyManager.spawnUndead(x, y), { x: 6, y: 6 });
    await page.waitForFunction(
      () => (window.gameDebug?.getState()?.undead ?? []).some((u) => u.spawning === false),
      null, { timeout: 15000 },
    );
    const frozenAt = await page.evaluate(() => {
      const u = window.__scene.enemyManager.getAliveEnemies()[0];
      window.__scene.freezeAtTile(u.worldX, u.worldY);
      return { x: u.worldX, y: u.worldY, frozen: u.isFrozen };
    });
    assert('o congelamento pegou o corpo', frozenAt.frozen === true, JSON.stringify(frozenAt));
    let state = await driver.getState();
    assert('o snapshot enxerga a estatua', state.undead[0]?.frozen === true, JSON.stringify(state.undead));
    await shot('caveira-estatua');

    // Rigida: uma caveira a 3 tiles do heroi SEMPRE marcha — parada, so o gelo explica.
    await sleep(1100);
    state = await driver.getState();
    assert('a estatua nao deu um passo',
      state.undead[0]?.worldX === frozenAt.x && state.undead[0]?.worldY === frozenAt.y,
      JSON.stringify({ frozenAt, now: state.undead[0] }));

    log('DEGELO: o gelo quebra sozinho e a caveira VOLTA');
    await page.waitForFunction(
      () => (window.gameDebug?.getState()?.undead ?? [])[0]?.frozen === false,
      null, { timeout: 5000 },
    );
    await page.waitForFunction(
      ({ x, y }) => {
        const u = (window.gameDebug?.getState()?.undead ?? [])[0];
        return u !== undefined && !(u.worldX === x && u.worldY === y);
      },
      { x: frozenAt.x, y: frozenAt.y }, { timeout: 6000 },
    );

    // Campo limpo para os casos seguintes (o mesmo fura-i-frames do cenario `zora`).
    await page.evaluate(() => {
      const u = window.__scene.enemyManager.getAliveEnemies()[0];
      u.tickHurtInvuln(9999);
      u.takeDamage(999);
    });

    // ── 2. A BOLA NO HEROI: TRAVA SEM FERIR ───────────────────────────────────
    log('HEROI: a bola de gelo trava pes e botoes, e nao tira vida');
    const before = await driver.getState();
    await page.evaluate(({ x, y }) => {
      // A bola nasce 4 tiles a LESTE voando para o heroi (que olha para BAIXO: o escudo so
      // apara o que ele encara, entao esta bola entra).
      window.__scene.enemyManager.shots.fire('spit', x + 4, y, -1, 0, 5);
    }, { x: before.player.worldX, y: before.player.worldY });
    await page.waitForFunction(() => window.gameDebug?.getState()?.heroFrozen === true,
      null, { timeout: 4000 });
    state = await driver.getState();
    assert('a bola nao tirou uma gota de vida', state.health === before.health,
      JSON.stringify({ before: before.health, after: state.health }));
    await shot('heroi-estatua');

    await driver.press('ArrowRight', { count: 3 });
    state = await driver.getState();
    assert('congelado, o heroi nao sai do lugar',
      state.player.worldX === before.player.worldX && state.player.worldY === before.player.worldY,
      JSON.stringify(state.player));

    await page.waitForFunction(() => window.gameDebug?.getState()?.heroFrozen === false,
      null, { timeout: 5000 });
    await driver.press('ArrowRight', { count: 2 });
    await driver.settle(400);
    state = await driver.getState();
    assert('degelado, os pes voltam (e o passo saiu)',
      state.player.worldX > before.player.worldX, JSON.stringify(state.player));

    // ── 3. A ESPADA DEVOLVE A BOLA, E ELA CONGELA O BICHO ─────────────────────
    log('REBATIDA: a bola volta pelo caminho e congela a caveira que vinha atras');
    const hero2 = (await driver.getState()).player;
    await page.evaluate(() => window.__scene.inventory.add('sword'));
    // +5 e +6, nunca mais fundo: o heroi esta em ~x=5 e o mundo acaba em x=11 — uma bola nascida
    // fora da borda morreria no mar (a moldura do mundo) no primeiro passo de voo.
    await page.evaluate(({ x, y }) => window.__scene.enemyManager.spawnUndead(x + 5, y),
      { x: hero2.worldX, y: hero2.worldY });
    await page.waitForFunction(
      () => (window.gameDebug?.getState()?.undead ?? []).some((u) => u.spawning === false),
      null, { timeout: 15000 },
    );
    // A bola nasce ALEM da caveira e passa por cima dela (bola do bicho nao colide com bicho):
    // a colisao com corpo e um privilegio da bola DEVOLVIDA.
    await page.evaluate(({ x, y }) => {
      window.__scene.enemyManager.shots.fire('spit', x + 6, y, -1, 0, 4);
    }, { x: hero2.worldX, y: hero2.worldY });

    // O momento certo: a bola dentro do arco (o heroi olha LESTE — os passos do caso 2 o
    // viraram). Espera ela chegar a 2,3 tiles e balanca a espada.
    await page.waitForFunction(
      ({ hx }) => {
        const s = (window.gameDebug?.getState()?.shots ?? []).find((sh) => sh.kind === 'spit');
        return s !== undefined && s.x - hx <= 2.3;
      },
      { hx: hero2.worldX }, { timeout: 6000 },
    );
    await driver.press('z', { count: 1 });
    await driver.settle(200);
    state = await driver.getState();
    const returned = (state.shots ?? []).find((s) => s.kind === 'spit');
    assert('a bola foi DEVOLVIDA: reflected e a velocidade apontando de volta (leste)',
      returned !== undefined && returned.reflected === true && returned.vx > 0,
      JSON.stringify(state.shots));
    await page.waitForFunction(
      () => (window.gameDebug?.getState()?.undead ?? []).some((u) => u.frozen === true),
      null, { timeout: 6000 },
    );
    await shot('bola-devolvida-congelou-a-caveira');

    // ── 4. FOGO DERRETE GELO ──────────────────────────────────────────────────
    log('FOGO×GELO: o pulso de fogo num arbusto congelado derrete e se gasta; o seguinte queima');
    const meltStory = await page.evaluate(({ x, y }) => {
      const scene = window.__scene;
      scene.freezeAtTile(x, y);
      const frozenBefore = scene.freezeManager.frozenAt(x, y);
      const firstPulse = scene.igniteFlammableAt(x, y);
      const afterMelt = {
        frozen: scene.freezeManager.frozenAt(x, y),
        burning: scene.getDryBushAt(x, y)?.isBurning ?? false,
      };
      const secondPulse = scene.igniteFlammableAt(x, y);
      const afterSecond = { burning: scene.getDryBushAt(x, y)?.isBurning ?? false };
      const litFireRefuses = scene.freezeAtTile(0, 0);
      return { frozenBefore, firstPulse, afterMelt, secondPulse, afterSecond, litFireRefuses };
    }, BUSH);
    assert('o arbusto congelou', meltStory.frozenBefore === true, JSON.stringify(meltStory));
    assert('o primeiro pulso DERRETEU (nada acendeu, gelo sumiu)',
      meltStory.afterMelt.frozen === false && meltStory.afterMelt.burning === false,
      JSON.stringify(meltStory));
    assert('o segundo pulso QUEIMA (o degelo custou exatamente um pulso)',
      meltStory.afterSecond.burning === true, JSON.stringify(meltStory));
    assert('fogueira ACESA recusa o congelamento', meltStory.litFireRefuses === false,
      JSON.stringify(meltStory));
    await shot('fogo-derreteu-o-gelo');
  },
};

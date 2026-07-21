// A CAVEIRA GOSTA DE PLACA DE PRESSAO — o unico inimigo do jogo que quer outra coisa alem do heroi.
//
// Uma placa de pressao precisa de um CORPO em cima dela. Ate aqui os corpos disponiveis eram o
// heroi (que so tem um par de pes e precisa deles em outro lugar) e o caixote (que so anda para
// onde da pra empurrar). O morto-vivo e o terceiro, e o unico que CAMINHA sozinho: se enxerga uma
// placa no seu raio de visao, um balao de pensamento com a placa acesa aparece sobre a cabeca dele
// e ele marcha ate la ignorando o heroi por completo — nao persegue, nao foge da tocha, nao ataca
// nem de tile colado. Vira um interruptor que o jogador liga LEVANDO um monstro, e a unica alavanca
// que o heroi tem sobre isso e bater: um golpe quebra a fixacao.
//
// A geometria abaixo existe para provar exatamente "ignorou o heroi". A caveira nasce ENTRE os dois,
// com o heroi de um lado e a placa do outro:
//
//     (3,6) HEROI  ...  (6,6) CAVEIRA nasce  ...  (10,6) PLACA
//                   <-- 3 tiles              4 tiles -->
//
// A 3 tiles o heroi esta muito dentro do raio de deteccao (14), entao o comportamento normal seria
// andar para OESTE. Se ela anda para LESTE e para em cima da placa, nao ha outra leitura possivel.
//
// A fogueira do canto e o resto da fixture: o cerco de undead nao existe no lab, mas a SEGURANCA
// existe — perto de fogo aceso a caveira se desfaz em ~2-5s (sunset) e a luz da fogueira e tile
// intransponivel pra ela. Por isso a unica fogueira do mundo vai para (0,0), longe do corredor.
//
// O que este cenario NAO cobre de proposito: heroi e caixote pressionando a placa, que e o
// `caixa-placa` inteiro. Aqui so o corpo novo.

const HERO = { x: 3, y: 6 };
const SKULL = { x: 6, y: 6 };
const PLATE = { x: 10, y: 6 };
const FIRE = { x: 0, y: 0 };
const VAR = 'circuito_undead';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default {
  name: 'placa-undead',
  description: 'O morto-vivo fixa numa placa de pressao, marcha ate ela ignorando o heroi, e um golpe quebra a fixacao.',
  needsGame: false, // entra pelo editor e nasce a GameScene no P (mesma razao do braco/fios)
  route: '/lab?level=1',
  async run({ driver, shot, assert, log }) {
    await driver.settle(3000);
    const page = driver.page;

    log('EDITOR: cria a variavel do circuito');
    await page.getByRole('button', { name: /Variaveis/ }).click();
    await page.getByPlaceholder('ex.: porta_norte_aberta').fill(VAR);
    await page.getByRole('button', { name: '+ Criar' }).click();
    await page.getByRole('button', { name: 'Aplicar', exact: true }).click();

    log('EDITOR: monta o corredor, a placa e manda a unica fogueira para o canto');
    const authored = await page.evaluate(({ hero, plate, fire, varName }) => {
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

      // UMA fogueira, no canto oposto. Ela precisa existir (o runtime acende a mais proxima do
      // spawn e o mundo sem fogo nenhum e um caso que nada mais no jogo exercita), mas precisa
      // ficar longe: dentro de CAMPFIRE_SAFE_RADIUS (5) o heroi fica "safe" e a caveira se
      // desfaz sozinha antes de chegar na placa, e dentro de LIGHT_RADIUS (4.5) ela nem entra.
      store.placeEntity({ list: 'props', type: 'campfire', worldX: fire.x, worldY: fire.y });
      store.setSpawn(hero.x, hero.y);
      store.placeEntity({ list: 'props', type: 'pressurePlate', worldX: plate.x, worldY: plate.y, variable: varName });

      const placed = store.allEntities().find((e) => e.type === 'pressurePlate');
      return {
        plate: placed,
        campfires: store.allEntities().filter((e) => e.type === 'campfire').length,
        variables: store.globalVariables,
      };
    }, { hero: HERO, plate: PLATE, fire: FIRE, varName: VAR });
    assert('a placa foi autorada e vinculada ao circuito',
      authored.plate?.worldX === PLATE.x && authored.plate?.worldY === PLATE.y
      && authored.plate?.variable === VAR, JSON.stringify(authored));
    assert('sobrou exatamente uma fogueira, no canto', authored.campfires === 1, JSON.stringify(authored));

    log('LAB: P joga o mundo editado');
    await driver.press('p', { count: 1 });
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 15000 });
    await page.waitForFunction(() => window.gameDebug?.getState()?.levelIntroOpen === false, null, { timeout: 15000 });
    await driver.settle(300);

    let state = await driver.getState();
    assert('a placa existe no runtime e nasce solta',
      state.pressurePlates.length === 1 && state.pressurePlates[0].pressed === false
      && state.globalVariables[VAR] === false, JSON.stringify(state.pressurePlates));
    assert('o heroi nao esta no raio seguro da fogueira (senao a caveira se desfaz sozinha)',
      state.safety.safe === false, JSON.stringify(state.safety));
    // A geometria INTEIRA deste teste depende de o heroi estar a oeste da caveira: se ele nascer
    // em outro tile, "ela ignorou o heroi" mais adiante estaria medindo outra coisa. Cobra o
    // spawn aqui, onde um erro de fixture ainda se parece com um erro de fixture.
    assert('o heroi nasceu onde a fixture pediu, a oeste de tudo',
      state.player.worldX === HERO.x && state.player.worldY === HERO.y, JSON.stringify(state.player));

    // ── 1. A FIXACAO ──────────────────────────────────────────────────────────
    log('CAVEIRA: nasce entre o heroi e a placa');
    await page.evaluate(({ x, y }) => window.__scene.enemyManager.spawnUndead(x, y), SKULL);

    // Ela e invulneravel e inerte enquanto sai do chao (telegrafo 3s + animacao ~0.8s): so
    // DEPOIS disso o gerenciador entrega uma placa. Esperar o estado, nunca um relogio.
    await page.waitForFunction(
      () => (window.gameDebug?.getState()?.undead ?? []).some((u) => u.spawning === false),
      null, { timeout: 15000 },
    );
    // A entrega da placa acontece no COMECO do update do gerenciador, antes de a propria caveira
    // virar `spawning: false` la no fim dele — entao o frame em que o wait acima acorda e sempre
    // um frame cedo demais. Alguns frames de folga, e a assercao continua sendo "ela fixa na
    // hora", nao "ela fixa em algum momento".
    await driver.settle(200);
    state = await driver.getState();
    assert('assim que termina de nascer, ela ja fixou NA PLACA',
      state.undead.length === 1
      && state.undead[0].plateTarget?.x === PLATE.x && state.undead[0].plateTarget?.y === PLATE.y,
      JSON.stringify(state.undead));

    // O balao nao e so um campo no estado: tem que existir como objeto na tela. Procura o
    // container cujo primeiro filho usa a textura do balao de pensamento.
    // O balao nao e so um campo no estado: tem que estar DESENHADO, dentro da tela e acima da
    // caveira. Contar containers so provaria que o objeto foi criado — ele pode existir parado
    // em (-9999,-9999) por um erro de projecao e o teste nao veria diferenca.
    const balloon = await page.evaluate(() => {
      const scene = window.__scene;
      const box = scene.children.list.find(
        (o) => o.type === 'Container' && o.list?.[0]?.texture?.key === 'thought-plate',
      );
      const skull = scene.enemyManager.getAliveEnemies()[0];
      const feet = scene.camera.tileToScreen(skull.worldX, skull.worldY, scene.tileSize);
      return {
        textureLoaded: scene.textures.exists('thought-plate'),
        found: box !== undefined,
        x: box?.x, y: box?.y, scale: box?.scaleX, alpha: box?.alpha, visible: box?.visible,
        size: box?.list?.[0]?.displayWidth,
        feetY: feet.y,
        view: { w: scene.scale.width, h: scene.scale.height },
      };
    });
    assert('o balao de pensamento esta desenhado, dentro da tela e acima da caveira',
      balloon.textureLoaded === true && balloon.found === true && balloon.visible === true
      && balloon.alpha > 0.9 && balloon.scale > 0.9 && balloon.size > 4
      && balloon.x > 0 && balloon.x < balloon.view.w
      && balloon.y > 0 && balloon.y < balloon.feetY,
      JSON.stringify(balloon));
    await shot('caveira-fixou-na-placa');

    // ── 2. A MARCHA, IGNORANDO O HEROI ────────────────────────────────────────
    log('MARCHA: ela anda para LESTE (a placa), com o heroi a 3 tiles a OESTE');
    await page.waitForFunction(
      ({ x, y }) => (window.gameDebug?.getState()?.undead ?? []).some((u) => u.worldX === x && u.worldY === y),
      PLATE, { timeout: 20000 },
    );
    await driver.settle(200);
    state = await driver.getState();
    assert('a caveira esta EM CIMA da placa',
      state.undead[0]?.worldX === PLATE.x && state.undead[0]?.worldY === PLATE.y,
      JSON.stringify(state.undead));
    assert('o corpo dela pressiona a placa e liga o circuito',
      state.pressurePlates[0].pressed === true && state.globalVariables[VAR] === true,
      JSON.stringify({ plates: state.pressurePlates, vars: state.globalVariables }));
    assert('ela ignorou o heroi: ele nao saiu do lugar nem levou dano',
      state.player.worldX === HERO.x && state.player.worldY === HERO.y,
      JSON.stringify(state.player));
    await shot('caveira-na-placa');

    // Chegou = ela PARA. Um passo a mais soltaria a placa e o circuito piscaria.
    await sleep(1800);
    state = await driver.getState();
    assert('chegando, ela FICA — o circuito nao pisca',
      state.undead[0]?.worldX === PLATE.x && state.globalVariables[VAR] === true,
      JSON.stringify(state.undead));

    // ── 3. O GOLPE QUEBRA A FIXACAO ───────────────────────────────────────────
    log('GOLPE: bater nela e a unica coisa que devolve a atencao dela para o heroi');
    await page.evaluate(() => window.__scene.enemyManager.getAliveEnemies()[0].takeDamage(1));
    await driver.settle(150);
    state = await driver.getState();
    assert('o golpe apaga a fixacao na hora',
      state.undead[0]?.plateTarget === null, JSON.stringify(state.undead));
    // O balao nao some por corte: ele encolhe e some (160ms). Esperar isso e o teste, nao um
    // atraso de conveniencia — um balao que sumisse no frame do golpe pareceria bug de render.
    await driver.settle(400);
    const gone = await page.evaluate(() => window.__scene.children.list.filter(
      (o) => o.type === 'Container' && o.list?.[0]?.texture?.key === 'thought-plate',
    ).length);
    assert('e o balao some junto', gone === 0, String(gone));

    log('VOLTA: sem fixacao ela desce da placa atras do heroi, e o circuito abre');
    await page.waitForFunction(
      ({ x, y }) => {
        const u = (window.gameDebug?.getState()?.undead ?? [])[0];
        return u !== undefined && !(u.worldX === x && u.worldY === y);
      },
      PLATE, { timeout: 15000 },
    );
    state = await driver.getState();
    assert('ela saiu da placa em direcao ao heroi', state.undead[0].worldX < PLATE.x,
      JSON.stringify(state.undead));
    assert('sem corpo em cima, a placa desliga o circuito',
      state.pressurePlates[0].pressed === false && state.globalVariables[VAR] === false,
      JSON.stringify({ plates: state.pressurePlates, vars: state.globalVariables }));
    await shot('golpe-quebrou-a-fixacao');
  },
};

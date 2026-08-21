// O PROJETIL — a primeira coisa do jogo que fere o heroi sem estar do lado dele.
//
// Todo dano de contato mora na grade: o bicho esta no tile vizinho, telegrafa e bate. A torreta e o
// mago pedem outra pergunta, e a resposta e a unica coisa do jogo que anda em coordenada CONTINUA
// de tile (ver EnemyProjectile). Isso e um sistema novo, e um sistema novo tem tres promessas que
// so um teste segura:
//
//   1. **A parede mata a bala.** O que protege nao e a distancia, e a pedra. Sem isso, uma torreta
//      numa sala fechada e uma sala sem solucao.
//   2. **A luz nao mata.** Luz de fogueira e a lei sobre onde uma CRIATURA existe; se ela parasse
//      balas, o fogo viraria escudo antibalas e todo level teria a mesma resposta.
//   3. **O tiro avisa.** 350ms de carga na torreta, 420ms de conjuracao no mago. Um tiro sem aviso
//      e um dano que o jogador nao tinha como evitar.
//   4. **Fora do quadro, muda.** O alcance dos atiradores (8-9 tiles) passa da tela (~4,5 pros
//      lados), entao sem a lei do quadro eles zumbiam e atiravam de fora da vista — som e bala
//      de bicho invisivel. Em alcance mas fora da tela: nenhum tiro, e nenhuma trilha de perigo.
//
// A FIXTURE (12x12) e uma parede de pedra atravessada no meio:
//
//        x=0 . . . . 5 . . . . 11
//     y=0  F                        F  fogueira-lar (0,0)
//     y=3    T(3,3) M(5,3)          T  cova da TORRETA   M  cova do MAGO
//     y=6      # # # # #            #  pedras (3..7, y=6): a cobertura
//     y=9            H              H  heroi (5,9)
//
// O MAGO fica na COLUNA DO HEROI, atras da parede — e isso e o cenario, nao decoracao. A primeira
// versao o pos em x=9, fora da ponta da parede (que vai de 3 a 7): dali o tiro dele contornava a
// pedra por fora, com toda a razao, e o teste acusava a lei do tiro de estar quebrada quando quem
// estava errada era a fixture. Um teste de cobertura tem de ter cobertura de verdade: o mago rodeia
// no maximo um ou dois tiles em x, e a parede foi dimensionada pra cobrir essa faixa inteira.
//
// Roda em /lab pelo mesmo motivo do `inimigos`: no lab nao existe cerco, entao tudo que aparece
// aqui foi autorado ou pedido por este teste.

const HERO = { x: 5, y: 9 };
const FIRE = { x: 0, y: 0 };
const TURRET_DEN = { x: 3, y: 3 };
const MAGE_DEN = { x: 5, y: 3 };
const WALL_Y = 6;
// A parede atravessa o mapa INTEIRO, e as duas tentativas anteriores explicam por que: com ela indo
// so de 3 a 7, primeiro o tiro contornava a ponta (o mago nascia em x=9, fora da cobertura) e
// depois o proprio MAGO contornava — ele e um kiter, anda atras da distancia que quer, e deu a
// volta pela ponta esquerda ate ficar do mesmo lado do heroi. Nos dois casos o cenario acusava a
// lei do tiro de estar quebrada quando quem estava errada era a fixture. Cobertura de verdade nao
// tem ponta: o mago fica ao norte, o heroi ao sul, e todo tiro TEM de cruzar a pedra.
const WALL_X = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default {
  name: 'projeteis',
  description: 'A torreta e o mago: o leque radial, a conjuracao avisada, e a lei do tiro — parede mata a bala, luz de fogueira nao.',
  needsGame: false,
  route: '/lab?level=1',
  async run({ driver, shot, assert, log }) {
    await driver.settle(3000);
    const page = driver.page;

    log('EDITOR: autora a parede de pedra e as duas covas que atiram');
    const authored = await page.evaluate(({ hero, fire, turret, mage, wallY, wallX }) => {
      const store = window.__scene?.store;
      if (!store) return { error: 'sem store no editor' };

      // Limpa tambem o CHAO (frame 5, o default do editor): a lei sob teste e "parede mata a bala",
      // e um tile de mar herdado do level-1 seria uma segunda parede que o teste nao autorou.
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
      wallX.forEach((x) => store.placeEntity({ list: 'props', type: 'rock', worldX: x, worldY: wallY }));
      store.placeEntity({ list: 'enemies', type: 'turret', worldX: turret.x, worldY: turret.y });
      store.placeEntity({ list: 'enemies', type: 'mage', worldX: mage.x, worldY: mage.y });

      return {
        spawns: store.allEntities().filter((e) => e.list === 'enemies'),
        warnings: store.validate(),
      };
    }, { hero: HERO, fire: FIRE, turret: TURRET_DEN, mage: MAGE_DEN, wallY: WALL_Y, wallX: WALL_X });

    assert('as duas covas que atiram sao autoraveis pela aba Inimigos',
      authored.spawns?.length === 2
      && authored.spawns.some((s) => s.type === 'turret')
      && authored.spawns.some((s) => s.type === 'mage'),
      JSON.stringify(authored.spawns));
    assert('nenhuma delas nasceu bloqueada ou na luz (a fixture nao esta se sabotando)',
      !(authored.warnings ?? []).some((w) => /spawn de inimigo/.test(w)),
      JSON.stringify(authored.warnings));

    log('LAB: P joga o mundo editado');
    await driver.press('p', { count: 1 });
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 15000 });
    await page.waitForFunction(() => window.gameDebug?.getState()?.levelIntroOpen === false, null, { timeout: 15000 });
    await driver.settle(300);

    const clearField = async () => {
      await page.evaluate(() => {
        window.__scene.enemySpawners.respawnMs = 9999999;
        window.__scene.enemyManager.despawnAll();
      });
      await driver.settle(200);
    };
    const spawnBody = (kind, x, y) => page.evaluate(
      ({ k, wx, wy }) => { window.__scene.enemyManager.spawn(k, wx, wy); },
      { k: kind, wx: x, wy: y },
    );
    const bodies = () => page.evaluate(() => window.__scene.enemyManager.getAliveEnemies().map((e) => ({
      kind: e.kind, worldX: e.worldX, worldY: e.worldY, spawning: e.isSpawning, casting: e.isCasting ?? null,
    })));

    // Vida alta: as duas pecas deste cenario existem para acertar o heroi, e com 3 coracoes o teste
    // morreria no meio da propria medicao — o que ele mediria era a tela de morte. As assercoes de
    // dano abaixo comparam a vida ANTES e DEPOIS, entao o valor absoluto nao importa.
    await page.evaluate(() => { window.__scene.playerHealth = 99; });

    let state = await driver.getState();
    assert('as duas covas chegaram no runtime', (state.enemySpawners ?? []).length === 2,
      JSON.stringify(state.enemySpawners));

    // ── 1. A TORRETA NAO ANDA, E ATIRA EM LEQUE ───────────────────────────────
    log('TORRETA: campo limpo, uma torreta a 6 tiles do heroi');
    await clearField();
    await spawnBody('turret', TURRET_DEN.x, TURRET_DEN.y);
    await page.waitForFunction(
      () => window.__scene.enemyManager.getAliveEnemies().some((e) => e.kind === 'turret' && !e.isSpawning),
      null, { timeout: 15000 },
    );

    // Coleta o ar por 9s: e mais que dois ciclos de leque (3,6s), entao ver ZERO tiro aqui e
    // falha de verdade e nao azar de amostragem.
    let maxSimultaneous = 0;
    let sawOpposite = false;
    let onlyBullets = true;
    let sawAnyShot = false;
    for (let i = 0; i < 45; i += 1) {
      await sleep(200);
      const shots = (await driver.getState()).shots ?? [];
      if (shots.length > 0) sawAnyShot = true;
      if (shots.length > maxSimultaneous) maxSimultaneous = shots.length;
      if (shots.some((s) => s.kind !== 'bullet')) onlyBullets = false;
      // Um LEQUE tem direcoes opostas — e o que o diferencia de uma mira. Se todas as balas
      // fossem pro mesmo lado, "atirou" seria verdade e "em leque" seria mentira.
      if (shots.some((s) => s.vx > 0.2) && shots.some((s) => s.vx < -0.2)) sawOpposite = true;
    }
    const turretBody = (await bodies()).find((b) => b.kind === 'turret');
    assert('a torreta atirou', sawAnyShot === true, 'nenhum tiro em 9s');
    assert('o leque sai inteiro de uma vez (6 balas no ar ao mesmo tempo)', maxSimultaneous >= 6,
      String(maxSimultaneous));
    assert('e ele e RADIAL: balas em direcoes opostas no mesmo instante', sawOpposite === true,
      String(maxSimultaneous));
    assert('so bala saiu dela (nada de feitico)', onlyBullets === true, 'kind inesperado no ar');
    assert('a torreta NAO andou um tile em 9s de tiro',
      turretBody?.worldX === TURRET_DEN.x && turretBody?.worldY === TURRET_DEN.y,
      JSON.stringify(turretBody));
    await shot('o-leque-da-torreta');

    // A tocha e a alavanca do jogador contra o que teme fogo. A maquina nao ve chama: acender na
    // frente dela nao pode calar o leque, senao a peca deixa de fazer a pergunta que ela faz.
    log('TORRETA: a tocha acesa nao a cala — maquina nao ve chama');
    const torchOn = await page.evaluate(() => {
      const s = window.__scene;
      s.heldItem = 'wood';
      s.heldOnFire = true;
      s.torchFuelMs = 9999999;
      return s.isTorchLit;
    });
    assert('a tocha esta acesa', torchOn === true, String(torchOn));
    let shotsWithTorch = 0;
    for (let i = 0; i < 30; i += 1) {
      await sleep(200);
      shotsWithTorch = Math.max(shotsWithTorch, ((await driver.getState()).shots ?? []).length);
    }
    assert('com a tocha na mao do heroi, a torreta continuou soltando o leque', shotsWithTorch >= 6,
      String(shotsWithTorch));
    await page.evaluate(() => { window.__scene.heldOnFire = false; });

    // ── 2. A PAREDE MATA A BALA ───────────────────────────────────────────────
    // Medido com o MAGO porque o tiro dele e MIRADO: um leque radial acertaria a parede por sorte,
    // um tiro mirado no heroi atravessa a linha da pedra ou morre nela. Nao ha meio termo.
    log('PAREDE: o mago conjura mirado no heroi, com a pedra no caminho');
    await clearField();
    await spawnBody('mage', MAGE_DEN.x, MAGE_DEN.y);
    const healthBefore = (await driver.getState()).health;
    let sawMagic = false;
    let sawCasting = false;
    let maxShotY = 0;
    for (let i = 0; i < 60; i += 1) {
      await sleep(200);
      state = await driver.getState();
      const shots = state.shots ?? [];
      if (shots.some((s) => s.kind === 'magic')) sawMagic = true;
      shots.forEach((s) => { maxShotY = Math.max(maxShotY, s.y); });
      if ((await bodies()).some((b) => b.kind === 'mage' && b.casting)) sawCasting = true;
    }
    const healthAfter = (await driver.getState()).health;
    assert('o mago conjurou (houve bola magica no ar)', sawMagic === true, 'nenhum feitico em 12s');
    assert('a conjuracao AVISA antes de sair (pose de casting vista)', sawCasting === true,
      'nenhum frame de conjuracao amostrado');
    assert('nenhuma bola passou da parede de pedra', maxShotY < WALL_Y - 0.4, String(maxShotY));
    assert('e o heroi atras da pedra nao levou um arranhao', healthAfter === healthBefore,
      JSON.stringify({ healthBefore, healthAfter }));
    await shot('a-pedra-come-o-feitico');

    // ── 3. NO ABERTO, O MESMO FEITICO DOI ─────────────────────────────────────
    // Sem esta metade, "a pedra protegeu" nao provaria nada: um mago simplesmente incapaz de ferir
    // passaria no teste acima com louvor.
    log('ABERTO: o mesmo mago, do mesmo lado da parede que o heroi');
    await clearField();
    await spawnBody('mage', 1, HERO.y);
    const openBefore = (await driver.getState()).health;
    await page.waitForFunction((hp) => (window.gameDebug?.getState()?.health ?? hp) < hp,
      openBefore, { timeout: 25000 });
    const openAfter = (await driver.getState()).health;
    assert('sem pedra no caminho, a bola magica FERE', openAfter < openBefore,
      JSON.stringify({ openBefore, openAfter }));

    // ...e ele nunca se deixou alcancar: o kiter mantem a distancia enquanto o heroi anda pra cima.
    log('KITER: o heroi avanca e o mago recua — a espada nao alcanca de graca');
    await driver.walk('left', 3);
    await sleep(2500);
    state = await driver.getState();
    const mage = (await bodies()).find((b) => b.kind === 'mage');
    const dist = mage
      ? Math.abs(mage.worldX - state.player.worldX) + Math.abs(mage.worldY - state.player.worldY)
      : -1;
    assert('o mago se manteve fora do alcance de um golpe (3+ tiles)', dist >= 3,
      JSON.stringify({ mage, player: state.player, dist }));
    await shot('o-mago-recua-do-heroi');

    // ── 4. A LEI DO QUADRO: EM ALCANCE, FORA DA TELA — MUDA ───────────────────
    // O heroi terminou a secao 3 em (2,9). Uma torreta em (9,9) esta a 7 tiles (dentro do alcance
    // de 9) mas fora do quadro (~4,5 tiles pro lado): ela nao pode carregar, nao pode atirar, e a
    // trilha de perigo nao pode ligar por causa dela. Enquadra-la e o que a acorda.
    log('QUADRO: torreta em alcance mas fora da tela — nem tiro, nem musica');
    await clearField();
    await spawnBody('turret', 9, 9);
    await page.waitForFunction(
      () => window.__scene.enemyManager.getAliveEnemies().some((e) => e.kind === 'turret' && !e.isSpawning),
      null, { timeout: 15000 },
    );
    // Um respiro para a torreta assentar depois de nascer. (Aqui havia uma espera de 4,6s para
    // drenar a trilha de COMBATE da secao anterior; ela nao existe mais — a musica do jogo e uma
    // so e nao responde a inimigo.)
    await sleep(800);

    let framedWhileFar = false;
    let shotWhileFar = false;
    const musicSeen = new Set();
    // 8s > dois ciclos de leque (3,6s): zero tiro aqui e lei funcionando, nao azar de amostragem.
    for (let i = 0; i < 40; i += 1) {
      await sleep(200);
      state = await driver.getState();
      if ((state.shots ?? []).length > 0) shotWhileFar = true;
      musicSeen.add(state.music ?? null);
      if (state.undead.some((u) => u.kind === 'turret' && u.framed)) framedWhileFar = true;
    }
    assert('a 7 tiles ela esta mesmo FORA do quadro (o predicado ve o que a tela ve)',
      framedWhileFar === false, JSON.stringify(state.undead));
    assert('fora do quadro, em alcance: NENHUM tiro em 8s', shotWhileFar === false, 'houve tiro');
    assert('e a trilha NAO muda por causa de corpo em campo (a musica e uma so)',
      musicSeen.size === 1, [...musicSeen].join(','));

    log('QUADRO: quatro passos pro leste a enquadram — e ela acorda');
    await driver.walk('right', 4);
    await page.waitForFunction(
      () => (window.gameDebug?.getState()?.shots ?? []).length > 0,
      null, { timeout: 15000 },
    );
    state = await driver.getState();
    assert('enquadrada, a mesma torreta volta a atirar',
      state.undead.some((u) => u.kind === 'turret' && u.framed), JSON.stringify(state.undead));
    assert('e com o corpo NA tela a trilha continua exatamente a mesma',
      musicSeen.has(state.music ?? null) && musicSeen.size === 1, String(state.music));
    await shot('fora-do-quadro-muda-dentro-atira');
  },
};

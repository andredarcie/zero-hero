// O BESTIARIO QUE ANDA — a aba Inimigos deixou de ter uma linha so.
//
// O jogo tinha um inimigo: a caveira. Hoje a aba oferece sete especies, e cada uma existe por uma
// FRASE, nao por uma tabela de numeros. Este cenario cobra as frases dos que andam (o morcego, a
// aranha, as duas gosmas) e o caminho de dados dos sete; os dois que atiram tem cenario proprio
// (`projeteis`), porque projetil e um sistema novo e nao um bicho.
//
// Roda em /lab de proposito, pelo mesmo motivo do `inimigos`: no lab o CERCO nao existe
// (UndeadSpawnDirector fica desligado em mundo-puzzle), entao todo corpo que aparecer aqui saiu de
// uma cova autorada ou de uma chamada explicita deste teste. Nao ha outra leitura possivel.
//
// A FIXTURE (12x12, o rio partindo o mundo em dois):
//
//        x=0 . . . . 6 . . . . 11
//     y=0  F         ~
//          .         ~            F  fogueira-lar (0,0), longe do heroi
//          .         ~ <- (6,3) cova de MORCEGO em cima da agua
//     y=6  H . . . . ~ . . . B    H  heroi (2,6)
//          .         ~            ~  rio (props de agua, coluna x=6 inteira)
//          .         ~ <- (6,9) cova de SLIME em cima da agua
//     y=10 .         ~       G
//
// As duas covas dentro do rio sao o teste do voo em uma linha: a de morcego TEM de abrir (asa
// atravessa agua) e a de slime NAO (pe nao), e o editor tem de avisar de uma e nao da outra. Uma
// unica lista manda nos tres lugares (FLYING_ENEMY_KINDS) — este cenario existe pra cobrar que os
// tres continuam de acordo.

const HERO = { x: 2, y: 6 };
const FIRE = { x: 0, y: 0 };
const RIVER_X = 6;

// As covas autoradas, uma por especie (mais as duas de dentro do rio). Nenhuma a menos de
// LIGHT_RADIUS_TILES (3,15) da fogueira: monstro nao nasce na luz, e uma cova calada por engano
// mediria outra coisa.
const DENS = [
  { type: 'undead', x: 1, y: 9 },
  { type: 'spider', x: 3, y: 10 },
  { type: 'turret', x: 5, y: 5 },
  { type: 'mage', x: 5, y: 8 },
  { type: 'slime', x: 9, y: 3 },
  { type: 'bigslime', x: 9, y: 10 },
  { type: 'bat', x: 9, y: 6 },
  { type: 'bat', x: RIVER_X, y: 3 }, // em cima da agua: TEM de abrir
  { type: 'slime', x: RIVER_X, y: 9 }, // em cima da agua: nunca abre
];
const BAT_IN_RIVER = { x: RIVER_X, y: 3 };
const SLIME_IN_RIVER = { x: RIVER_X, y: 9 };
const KINDS = ['undead', 'bat', 'spider', 'slime', 'bigslime', 'turret', 'mage'];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const spawnerAt = (state, tile) => (state.enemySpawners ?? []).find(
  (s) => s.worldX === tile.x && s.worldY === tile.y,
);

export default {
  name: 'fauna',
  description: 'O bestiario da aba Inimigos: o morcego cruza o rio que segura a gosma, a gosma ignora a tocha que espanta a aranha, a aranha da o bote e o slime grande racha em dois.',
  needsGame: false, // entra pelo editor e nasce a GameScene no P (mesma razao do braco/inimigos)
  route: '/lab?level=1',
  async run({ driver, shot, assert, log }) {
    await driver.settle(3000);
    const page = driver.page;

    // ── 1. O CAMINHO DE DADOS: as sete especies entram pelo EditorStore ───────
    log('EDITOR: autora o rio e as nove covas (sete especies) pelo EditorStore de verdade');
    const authored = await page.evaluate(({ hero, fire, riverX, dens }) => {
      const store = window.__scene?.store;
      if (!store) return { error: 'sem store no editor' };

      // O level 1 e um puzzle cheio: limpa tudo, senao o teste mede a mobilia dele. O CHAO tambem e
      // reescrito (frame 5, o default do editor) e nao apenas as camadas de cima: um tile de mar ou
      // de lava herdado do level bloquearia uma cova, e o teste contaria como defeito do bestiario
      // uma mobilia que ele nao colocou.
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
      for (let y = 0; y <= 11; y += 1) {
        store.placeEntity({ list: 'props', type: 'water', worldX: riverX, worldY: y });
      }
      dens.forEach((den) => {
        store.placeEntity({ list: 'enemies', type: den.type, worldX: den.x, worldY: den.y });
      });

      const spawns = store.allEntities().filter((e) => e.list === 'enemies');
      return {
        spawns,
        kinds: [...new Set(spawns.map((s) => s.type))].sort(),
        stats: store.stats(),
        warnings: store.validate(),
      };
    }, { hero: HERO, fire: FIRE, riverX: RIVER_X, dens: DENS });

    assert('as nove covas entraram no mundo pela aba Inimigos',
      authored.spawns?.length === DENS.length, JSON.stringify(authored.spawns));
    assert('as SETE especies do bestiario sao autoraveis',
      JSON.stringify(authored.kinds) === JSON.stringify([...KINDS].sort()),
      JSON.stringify(authored.kinds));
    assert('o contador do modal Mundo conta todas', authored.stats?.enemies === DENS.length,
      JSON.stringify(authored.stats));

    // O aviso do Salvar tem de saber quem voa: a cova de slime dentro do rio nasce morta (e um
    // defeito silencioso, o pior que um editor pode ter), a de morcego nao. Se o aviso contasse as
    // duas, o autor aprenderia a ignorar o aviso — que e o unico jeito de um aviso morrer.
    const blocked = (authored.warnings ?? []).find((w) => /spawn de inimigo em tile bloqueado/.test(w));
    assert('o Salvar denuncia a cova de PE dentro do rio', blocked !== undefined,
      JSON.stringify(authored.warnings));
    assert('...e denuncia SO ela: a cova de quem VOA em cima da agua nao e defeito',
      /^1 ponto/.test(blocked ?? ''), String(blocked));
    assert('nenhuma cova caiu na luz da fogueira (a fixture nao esta se sabotando)',
      !(authored.warnings ?? []).some((w) => /dentro da luz/.test(w)),
      JSON.stringify(authored.warnings));

    // ── 2. AS SETE NASCEM DE VERDADE ──────────────────────────────────────────
    log('LAB: P joga o mundo editado');
    await driver.press('p', { count: 1 });
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 15000 });
    await page.waitForFunction(() => window.gameDebug?.getState()?.levelIntroOpen === false, null, { timeout: 15000 });
    await driver.settle(300);

    // A torreta e o mago desta fixture atiram no heroi enquanto o teste espera as sete especies
    // aparecerem. Vida alta e a unica alternativa a esperar de olhos fechados: com 3 coracoes o
    // cenario morreria no meio da propria assercao, e o que ele mediria era a tela de morte.
    await page.evaluate(() => { window.__scene.playerHealth = 99; });

    let state = await driver.getState();
    assert('as nove covas chegaram no runtime', (state.enemySpawners ?? []).length === DENS.length,
      JSON.stringify(state.enemySpawners));
    assert('o heroi nasceu onde a fixture pediu, fora da seguranca do fogo',
      state.player.worldX === HERO.x && state.player.worldY === HERO.y && state.safety.safe === false,
      JSON.stringify({ player: state.player, safety: state.safety }));

    log('COVAS: espera as sete especies estarem no mundo ao mesmo tempo');
    await page.waitForFunction((kinds) => {
      const alive = window.gameDebug?.getState()?.undead ?? [];
      const seen = new Set(alive.map((u) => u.kind));
      return kinds.every((k) => seen.has(k));
    }, KINDS, { timeout: 25000 });

    state = await driver.getState();
    const seen = [...new Set(state.undead.map((u) => u.kind))].sort();
    assert('cada cova fez o corpo da SUA especie',
      JSON.stringify(seen) === JSON.stringify([...KINDS].sort()), JSON.stringify(seen));
    assert('a cova de MORCEGO dentro do rio abriu (asa atravessa agua)',
      spawnerAt(state, BAT_IN_RIVER)?.occupied === true, JSON.stringify(state.enemySpawners));
    assert('a cova de SLIME dentro do rio ficou calada (pe nao atravessa agua)',
      spawnerAt(state, SLIME_IN_RIVER)?.occupied === false, JSON.stringify(state.enemySpawners));
    await shot('bestiario-inteiro-no-mundo');

    // ── 3. O CAMPO LIMPO ──────────────────────────────────────────────────────
    // A partir daqui cada frase e medida com UM corpo em campo. As covas param antes (relogio
    // gigante) porque uma cova reabrindo no meio de uma medicao poe um segundo bicho na conta.
    const clearField = async () => {
      await page.evaluate(() => {
        window.__scene.enemySpawners.respawnMs = 9999999;
        window.__scene.enemyManager.despawnAll();
      });
      await driver.settle(200);
    };
    const bodies = () => page.evaluate(() => window.__scene.enemyManager.getAliveEnemies().map((e) => ({
      kind: e.kind,
      worldX: e.worldX,
      worldY: e.worldY,
      spawning: e.isSpawning,
      pouncing: e.isPouncing ?? null,
    })));
    const spawnBody = (kind, x, y) => page.evaluate(
      ({ k, wx, wy }) => { window.__scene.enemyManager.spawn(k, wx, wy); },
      { k: kind, wx: x, wy: y },
    );
    const setTorch = (lit) => page.evaluate((on) => {
      const s = window.__scene;
      if (on) {
        s.heldItem = 'wood';
        s.heldOnFire = true;
        s.torchFuelMs = 9999999;
      } else {
        s.heldOnFire = false;
      }
      return s.isTorchLit;
    }, lit);

    // ── 4. O MORCEGO ATRAVESSA O RIO ──────────────────────────────────────────
    // A frase inteira dele. Todo perigo do jogo, antes, era negociavel com terreno: ponha a agua
    // entre voce e o problema e o problema fica la. O morcego e a resposta a isso.
    log('MORCEGO: nasce do lado de la do rio e chega no heroi — sem ponte');
    await clearField();
    await spawnBody('bat', 9, 6);
    await page.waitForFunction((riverX) => (window.gameDebug?.getState()?.undead ?? [])
      .some((u) => u.kind === 'bat' && u.worldX < riverX), RIVER_X, { timeout: 25000 });
    let field = await bodies();
    assert('o morcego cruzou o rio (esta do lado do heroi)',
      field.some((b) => b.kind === 'bat' && b.worldX < RIVER_X), JSON.stringify(field));
    await shot('morcego-cruzou-o-rio');

    // ...e o contrario, no MESMO rio: a gosma para na beira. Sem esta metade, "o morcego
    // atravessou" nao provaria nada — o rio poderia simplesmente nao estar bloqueando ninguem.
    log('SLIME: mesma margem, mesmo rio — e ele nao passa');
    await clearField();
    await spawnBody('slime', 9, 6);
    let crossed = false;
    let slime = null;
    for (let i = 0; i < 16; i += 1) {
      await sleep(500);
      field = await bodies();
      slime = field.find((b) => b.kind === 'slime') ?? slime;
      if (slime && slime.worldX < RIVER_X) crossed = true;
    }
    assert('a gosma andou ate a beira e ficou la (o rio e parede pra quem tem pe)',
      crossed === false && slime !== null && slime.worldX === RIVER_X + 1,
      JSON.stringify({ crossed, slime }));

    // ── 5. A TOCHA: O QUE ELA MANDA E O QUE ELA NAO MANDA ─────────────────────
    // O jogador aprendeu que chama na mao afasta o que quer mata-lo. As duas criaturas abaixo estao
    // a MESMA distancia, na MESMA coluna, sob a MESMA tocha, e fazem o oposto uma da outra: e assim
    // que o jogo diz "a luz protege do morto e do bicho, nao de tudo" sem uma linha de texto.
    // Os dois nascem FORA da luz da fogueira, e isso nao e detalhe de arrumacao: luz de fogueira e
    // parede pra monstro, e um corpo posto dentro dela fica sem nenhum tile pra onde ir — congela no
    // lugar e o teste le "nao recuou" quando o que houve foi "nao pode andar". A fixture tambem
    // mede DISTANCIA em vez de coordenada: fugir pode ser pra qualquer eixo, e cobrar um `worldY`
    // especifico e cobrar o caminho em vez do comportamento.
    log('TOCHA: a aranha recua, a gosma continua vindo — mesma chama, mesmo instante');
    await clearField();
    const torchOn = await setTorch(true);
    assert('a tocha esta acesa na mao do heroi', torchOn === true, String(torchOn));
    await spawnBody('spider', 5, 2);
    await spawnBody('slime', 5, 10);
    const heroNow = (await driver.getState()).player;
    const distTo = (b) => Math.abs(b.worldX - heroNow.worldX) + Math.abs(b.worldY - heroNow.worldY);
    const startField = await bodies();
    const spiderStart = distTo(startField.find((b) => b.kind === 'spider'));
    const slimeStart = distTo(startField.find((b) => b.kind === 'slime'));
    await sleep(6000);
    field = await bodies();
    const spider = field.find((b) => b.kind === 'spider');
    const slimeTorch = field.find((b) => b.kind === 'slime');
    assert('a ARANHA recuou da chama (ficou mais LONGE do que comecou)',
      spider !== undefined && distTo(spider) > spiderStart,
      JSON.stringify({ spider, spiderStart, agora: spider && distTo(spider) }));
    assert('a GOSMA nao se importou e continuou vindo (ficou mais PERTO)',
      slimeTorch !== undefined && distTo(slimeTorch) < slimeStart,
      JSON.stringify({ slimeTorch, slimeStart, agora: slimeTorch && distTo(slimeTorch) }));
    await shot('a-tocha-espanta-uma-e-nao-a-outra');

    // ── 6. O BOTE DA ARANHA ───────────────────────────────────────────────────
    // Rastejo lento (700ms/passo) e, de repente, tres passos em 120ms. E o que quebra a conta que a
    // caveira ensinou: com ela, distancia era tempo; com a aranha, nao e.
    log('ARANHA: apaga a tocha e mede o BOTE — 3 passos no tempo de meio passo');
    await clearField();
    await setTorch(false);
    await spawnBody('spider', 5, 2); // fora da luz da fogueira, pelo mesmo motivo de cima
    await page.waitForFunction(
      () => window.__scene.enemyManager.getAliveEnemies().some((e) => e.kind === 'spider' && e.isPouncing),
      null, { timeout: 20000 },
    );
    const before = await bodies();
    const spiderBefore = before.find((b) => b.kind === 'spider');
    const heroTile = (await driver.getState()).player;
    const distOf = (b) => Math.abs(b.worldX - heroTile.worldX) + Math.abs(b.worldY - heroTile.worldY);
    await sleep(520);
    const after = await bodies();
    const spiderAfter = after.find((b) => b.kind === 'spider');
    const closed = spiderBefore && spiderAfter ? distOf(spiderBefore) - distOf(spiderAfter) : 0;
    assert('o bote fechou 2+ tiles em meio segundo (ou colou no heroi)',
      spiderAfter !== undefined && (closed >= 2 || distOf(spiderAfter) === 1),
      JSON.stringify({ spiderBefore, spiderAfter, closed }));

    // ── 7. O SLIME GRANDE RACHA ───────────────────────────────────────────────
    // A espada mata qualquer coisa de um golpe, e por isso o grande e a unica peca do bestiario que
    // responde ao golpe perfeito com MAIS TRABALHO: matar um vira matar tres.
    log('SLIME GRANDE: um golpe fatal e dois filhotes no lugar dele');
    await clearField();
    await spawnBody('bigslime', 4, 6);
    await page.waitForFunction(
      () => window.__scene.enemyManager.getAliveEnemies()
        .some((e) => e.kind === 'bigslime' && !e.isSpawning),
      null, { timeout: 15000 },
    );
    const killed = await page.evaluate(() => {
      const big = window.__scene.enemyManager.getAliveEnemies().find((e) => e.kind === 'bigslime');
      const at = { x: big.worldX, y: big.worldY };
      big.tickHurtInvuln(9999); // fura os i-frames: aqui a morte e o instrumento, nao o assunto
      big.takeDamage(999);
      return at;
    });
    await driver.settle(400);
    field = await bodies();
    const children = field.filter((b) => b.kind === 'slime');
    assert('o grande estourou em DOIS filhotes', children.length === 2,
      JSON.stringify({ killed, field }));
    assert('e os dois nasceram encostados nele, nunca em cima de outra coisa',
      children.every((c) => Math.abs(c.worldX - killed.x) + Math.abs(c.worldY - killed.y) === 1),
      JSON.stringify({ killed, children }));
    assert('o grande nao ficou vivo junto', field.some((b) => b.kind === 'bigslime') === false,
      JSON.stringify(field));
    await shot('o-grande-rachou-em-dois');
  },
};

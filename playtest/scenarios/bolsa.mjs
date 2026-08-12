// A BOLSA — a mochila aberta COM O JOGO RODANDO.
//
// A subtela do ESC congela o mundo e continua existindo (ela e o lugar dos coracoes e do mapa).
// A bolsa e a outra metade, e ela nasce de uma pergunta que congelar o jogo responde errado:
// *trocar de item no meio de uma luta*. Com o mundo parado a troca nao custa nada, e escolher a
// ferramenta certa deixa de ser uma decisao.
//
//   I (ou o botao de bolsa, no dedo)  →  abre e fecha. O jogo NAO pausa.
//   ← →                               →  andam com o CURSOR (so para os lados)
//   X                                 →  EQUIPA o que esta sob o cursor, e fecha
//
// O que este cenario guarda, e por que cada um deles e uma lei e nao um detalhe:
//
//   1. o jogo CONTINUA com a bolsa aberta (o relogio da cena anda) — e o preco disso e que o
//      heroi fica de PES PRESOS e sem os dois botoes;
//   2. apontar e EQUIPAR sao dois gestos: andar com o cursor NAO troca o item do B;
//   3. o X equipa e fecha — e NAO usa o item recem-equipado no mesmo aperto (o bug que existe
//      se a bolsa tiver um ouvinte de teclado proprio: ver GameScene.pressUse);
//   4. APANHAR FECHA A BOLSA — a unica tela do jogo que o mundo pode fechar;
//   5. o I e recusado onde a pausa e recusada (aqui: o cartao de abertura do level).
//
// Ele monta a propria fixture no /lab (a lei da casa: um cenario nunca depende do que um level
// autorado por outra pessoa contem hoje).

const HERO = { x: 5, y: 6 };
// A ESPADA SAIU DA MOCHILA (ela e do heroi agora — ver GameScene.swordEquipped), entao o pacote e
// so de itens COM GESTO. O `iron` entra de proposito e NAO conta como slot: ele e materia-prima
// (MATERIAL_ITEM_KINDS) e vive na fileira de contadores debaixo da bolsa, sem cursor.
const PACK = ['pickaxe', 'axe', 'wood', 'bomb', 'key'];
const MATERIAL = 'iron';

export default {
  name: 'bolsa',
  description: 'A bolsa que nao pausa o jogo: I abre, setas apontam, X equipa, apanhar fecha.',
  needsGame: false, // entra pelo editor; a GameScene nasce no P (mesma razao do combate)
  route: '/lab?level=1',
  async run({ driver, shot, assert, log }) {
    await driver.settle(3000);
    const page = driver.page;

    log('EDITOR: um quintal limpo e vazio — a bolsa nao depende de nada no chao');
    await page.evaluate(({ hero }) => {
      const store = window.__scene?.store;
      if (!store) throw new Error('sem store no editor');
      for (let x = 2; x <= 11; x += 1) {
        for (let y = 2; y <= 10; y += 1) {
          store.eraseEntitiesAt(x, y);
          store.setCell('upper', x, y, null);
          store.setCell('collision', x, y, false);
        }
      }
      store.setSpawn(hero.x, hero.y);
    }, { hero: HERO });

    log('LAB: P joga o mundo editado');
    await driver.press('p', { count: 1 });
    await driver.settle(2200);

    // ── 5. O I E RECUSADO ONDE A PAUSA E RECUSADA ───────────────────────────
    // Antes de esperar o cartao do level sair: uma tela que ja congelou o mundo nao pode ganhar
    // uma segunda por cima. A bolsa recusa exatamente onde o menu de pausa recusa.
    log('RECUSA: com o cartao do level na tela, o I nao abre nada');
    const introUp = await page.evaluate(() => window.gameDebug?.getState()?.levelIntroOpen === true);
    if (introUp) {
      await driver.press('i', { count: 1 });
      await driver.settle(300);
      const refused = await driver.getState();
      assert('o I nao abre a bolsa por cima do cartao do level',
        refused.bagOpen === false, JSON.stringify({ bagOpen: refused.bagOpen }));
    } else {
      log('(o cartao ja tinha saido — recusa nao observavel nesta rodada)');
    }

    await page.waitForFunction(() => window.gameDebug?.getState()?.levelIntroOpen === false,
      null, { timeout: 15000 });
    await driver.settle(400);

    log('MOCHILA: cinco itens com gesto, quatro barras de ferro no contador, e o X na picareta');
    await page.evaluate((pack) => {
      const s = window.__scene;
      s.inventory.clear();
      for (const kind of pack.slots) s.inventory.add(kind);
      s.inventory.stash(pack.material, 4);
      s.inventory.select(pack.slots[0]);
      s.playerHealth = s.playerMaxHealth;
    }, { slots: PACK, material: MATERIAL });
    await driver.settle(200);

    // ── 1. O JOGO CONTINUA ──────────────────────────────────────────────────
    log('BOLSA: o I abre, e o relogio da cena NAO para');
    await driver.press('i', { count: 1 });
    await driver.settle(400);
    const opened = await page.evaluate(() => ({
      bagOpen: window.gameDebug.getState().bagOpen,
      // A prova de "o jogo continua" e o relogio da PROPRIA cena: `scene.pause()` o congela, e e
      // exatamente isso que a bolsa nao faz. Ler `performance.now()` provaria so que o navegador
      // continua vivo, que e verdade ate com o jogo pausado.
      sceneNow: window.__scene.time.now,
      slots: document.querySelectorAll('#zh-bag-root .zh-bag-slot').length,
      cursor: document.querySelector('#zh-bag-root .zh-bag-slot.zh-at')?.getAttribute('data-kind') ?? null,
      // O ponto de brasa: o que o B carrega AGORA, que e uma pergunta diferente de onde o cursor esta.
      equipped: document.querySelector('#zh-bag-root .zh-bag-eq')?.parentElement
        ?.getAttribute('data-kind') ?? null,
      // A MATERIA-PRIMA nao e slot: ela e uma linha de contadores, sem cursor e sem selecao.
      mats: document.querySelectorAll('#zh-bag-root .zh-bag-mat').length,
      matText: document.querySelector('#zh-bag-root .zh-bag-mat span')?.textContent ?? null,
    }));
    assert('o I abre a bolsa com os itens de GESTO desenhados',
      opened.bagOpen === true && opened.slots === PACK.length, JSON.stringify(opened));
    assert('o cursor comeca no item que esta na mao — a bolsa nunca mente sobre o que ele carrega',
      opened.cursor === PACK[0] && opened.equipped === PACK[0], JSON.stringify(opened));
    assert('e a materia-prima aparece EMBAIXO, como contador — nunca como slot',
      opened.mats === 1 && opened.matText === '4', JSON.stringify(opened));
    await shot('bolsa-aberta');

    await driver.settle(700);
    const ticking = await page.evaluate((was) => ({
      sceneNow: window.__scene.time.now,
      advanced: window.__scene.time.now - was,
      bagOpen: window.gameDebug.getState().bagOpen,
    }), opened.sceneNow);
    assert('O JOGO CONTINUA: o relogio da cena andou com a bolsa aberta',
      ticking.bagOpen === true && ticking.advanced > 300, JSON.stringify(ticking));

    // ── 1b. O PRECO: PES PRESOS E BOTOES CALADOS ────────────────────────────
    // Sem isto a bolsa seria uma pausa que finge nao ser: folhear com o mundo correndo tem de
    // custar a mesma coisa que atacar custa — compromisso.
    log('PRECO: as setas sao do CURSOR, entao o heroi nao anda e nao golpeia');
    const before = await driver.getState();
    await driver.press('ArrowRight', { count: 2 });
    await driver.settle(500);
    const browsing = await page.evaluate(() => ({
      pos: { ...window.__scene.playerWorld },
      cursor: document.querySelector('#zh-bag-root .zh-bag-slot.zh-at')?.getAttribute('data-kind') ?? null,
      heldItem: window.gameDebug.getState().heldItem,
      rooted: window.__scene.movementController.isRooted,
    }));
    assert('o heroi NAO andou com a bolsa aberta',
      browsing.pos.worldX === before.player.worldX && browsing.pos.worldY === before.player.worldY,
      JSON.stringify({ before: before.player, now: browsing.pos }));
    assert('e os pes estao presos (o escudo baixa junto: as duas maos estao na mochila)',
      browsing.rooted === true, JSON.stringify(browsing));

    // ── 2. APONTAR NAO E EQUIPAR ────────────────────────────────────────────
    assert('a seta andou com o CURSOR',
      browsing.cursor === PACK[2], JSON.stringify(browsing));
    assert('mas o item do B NAO mudou — apontar e equipar sao dois gestos',
      browsing.heldItem === PACK[0], JSON.stringify(browsing));
    await shot('bolsa-cursor-andou');

    // ── 3. O X EQUIPA, FECHA — E NAO USA ────────────────────────────────────
    // A metade perigosa: o X e o botao B, e a bolsa esta na frente dele. Se ela tivesse ouvinte
    // proprio, o MESMO aperto confirmaria o item e, com a bolsa ja fechada, o usaria no tile da
    // frente. A prova de que isso nao acontece e o chao continuar vazio.
    log('X: equipa o item sob o cursor, fecha a bolsa — e nao o usa no mesmo aperto');
    const groundBefore = (await driver.getState()).groundItems.length;
    await driver.press('x', { count: 1 });
    await driver.settle(600);
    const equipped = await driver.getState();
    assert('o X equipou o item que estava sob o cursor',
      equipped.heldItem === PACK[2], JSON.stringify({ held: equipped.heldItem }));
    assert('e fechou a bolsa', equipped.bagOpen === false,
      JSON.stringify({ bagOpen: equipped.bagOpen }));
    assert('o MESMO aperto nao usou nem pousou o item recem-equipado',
      equipped.groundItems.length === groundBefore
      && equipped.inventory.some((i) => i.kind === PACK[2]),
      JSON.stringify({ ground: equipped.groundItems, inv: equipped.inventory }));
    const walked = await page.evaluate(() => {
      const s = window.__scene;
      return { rooted: s.movementController.isRooted };
    });
    assert('e os pes se soltaram junto com o fechar',
      walked.rooted === false, JSON.stringify(walked));

    // ── 4. APANHAR FECHA A BOLSA ────────────────────────────────────────────
    // A bolsa e a unica tela do jogo que fica aberta com o mundo correndo — e por isso e a unica
    // que o mundo pode fechar. Um heroi apanhando enquanto folheia calmamente uma fileira de
    // icones desmente, num quadro, a promessa inteira do modo.
    log('PANCADA: levar dano arranca a mao de dentro da bolsa');
    await page.evaluate(() => {
      const s = window.__scene;
      s.playerHealth = s.playerMaxHealth;
      s.playerInvincible = false;
      s.invincibleTimer = 0;
    });
    await driver.press('i', { count: 1 });
    await driver.settle(400);
    const reopened = await driver.getState();
    assert('a bolsa reabriu', reopened.bagOpen === true, JSON.stringify(reopened.bagOpen));

    await page.evaluate(() => {
      const s = window.__scene;
      // O mesmo caminho que uma clava percorre — nao um `close()` chamado a mao, que provaria
      // apenas que o metodo existe.
      s.handleEnemyAttackPlayer({
        fromX: s.playerWorld.worldX + 1,
        fromY: s.playerWorld.worldY,
        ranged: false,
        bump: false,
      });
    });
    await driver.settle(500);
    const hit = await driver.getState();
    assert('APANHAR FECHA A BOLSA', hit.bagOpen === false, JSON.stringify({ bagOpen: hit.bagOpen }));
    assert('e o golpe custou um coracao de verdade (a bolsa nao comprou invencibilidade)',
      hit.health < hit.maxHealth, JSON.stringify({ health: hit.health, max: hit.maxHealth }));
    await shot('bolsa-fechada-pela-pancada');
  },
};

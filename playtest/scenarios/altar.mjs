// O ALTAR — a bigorna que nao e maquina.
//
// A cadeia do ferro tinha dois lugares para malhar a esponja: o MARTINETE (que cobra roda d'agua,
// engrenagem e uma rede eletrica antes de existir) e o CHAO, onde a peca cai e o jogador bate onde
// ela parou. O chao funciona e nao ensina nada — nada no mundo diz "trabalhe aqui". O altar e a
// mesa que faltava: uma laje de pedra em que se POE uma coisa e se bate nela.
//
// O que este cenario prova, na ordem:
//   1. o Z de frente para a laje VAZIA poe nela o item SELECIONADO (o "secundario", o do X), e o
//      item sai da mochila no mesmo gesto;
//   2. com a laje cheia o Z volta a ser a ESPADA — e a espada descendo nela e uma PANCADA;
//   3. sao BLOOM_BLOWS (3) pancadas, as mesmas do martinete e as mesmas da martelada no chao;
//   4. na ultima a esponja vira FERRO, e ele fica EM CIMA da laje (uma mesa nao move a peca);
//   5. o X tira de volta o que a pancada nao trabalha (o ferro pronto, uma pedra) — nada fica
//      preso na mesa;
//   6. da pra por QUALQUER coisa e bater: a pedra aceita a laje e as pancadas, e nao vira nada
//      (pedido explicito do usuario — a mesa e uma mesa, nao uma fechadura de uma chave so).
//
// Geometria: a laje em (5,5) e o heroi um tile ao sul dela. A laje e SOLIDA, entao o passo para o
// norte so VIRA o heroi — que e como um jogador chega de verdade.

const ALTAR = { x: 5, y: 5 };
const HERO = { x: 5, y: 6 };

export default {
  name: 'altar',
  description: 'A laje de pedra: o Z poe a peca, a pancada malha, tres golpes viram ferro e o X tira de volta.',
  needsGame: false, // entra pelo editor e nasce a GameScene no P (mesma razao do tocha-viva)
  route: '/lab?level=1',
  async run({ driver, shot, assert, log }) {
    await driver.settle(3000);
    const page = driver.page;

    log('EDITOR: limpa o mapa e planta a laje na frente do spawn');
    const authored = await page.evaluate(({ altar, hero }) => {
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
      store.placeEntity({ list: 'props', type: 'altar', worldX: altar.x, worldY: altar.y });
      store.setSpawn(hero.x, hero.y);
      return { altars: store.allEntities().filter((e) => e.type === 'altar').length };
    }, { altar: ALTAR, hero: HERO });
    assert('fixture: o altar foi autorado no editor', authored.altars === 1, JSON.stringify(authored));

    log('LAB: P joga o mundo editado');
    await driver.press('p', { count: 1 });
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 15000 });
    await page.waitForFunction(() => window.gameDebug?.getState()?.levelIntroOpen === false, null, { timeout: 15000 });
    await driver.settle(300);

    const altarState = async () => (await driver.getState())?.altars?.[0] ?? null;
    const bagOf = (kind) => page.evaluate((k) => window.__scene.inventory.count(k), kind);

    let st = await altarState();
    assert('a laje existe no mundo, e nasce VAZIA',
      st !== null && st.holding === null, JSON.stringify(st));

    // ── 1. O Z POE O ITEM SELECIONADO ─────────────────────────────────────────
    log('POR: com a esponja selecionada, o Z de frente para a laje a poe em cima dela');
    await page.evaluate(() => {
      const s = window.__scene;
      s.inventory.clear();
      s.inventory.add('bloom', 1);
      s.inventory.select('bloom');
      s.seenItems.add('bloom');
      s.seenItems.add('iron'); // sem cerimonia de item novo no meio do teste
    });
    await driver.settle(300);
    await driver.press('ArrowUp'); // a laje e solida: o passo so VIRA o heroi
    await driver.settle(350);
    await driver.press('z', { count: 1 });
    await driver.settle(400);
    st = await altarState();
    assert('a esponja esta EM CIMA da laje', st?.holding === 'bloom', JSON.stringify(st));
    assert('...e saiu da mochila no mesmo gesto', (await bagOf('bloom')) === 0, 'a esponja ficou na bolsa');
    await shot('altar-com-a-esponja');

    // ── 2 e 3. A ESPADA MALHA, E SAO TRES ─────────────────────────────────────
    log('MALHAR: com a laje cheia o Z volta a ser a espada — e a espada e a pancada');
    // A cadencia e real (ATTACK_COOLDOWN_MS + a raiz do golpe): apertar rapido demais faz o pedido
    // cair no buffer e a contagem sair menor do que o numero de teclas apertadas.
    for (let i = 0; i < 2; i += 1) { await driver.press('z', { count: 1 }); await driver.settle(650); }
    st = await altarState();
    assert('duas pancadas ainda NAO bastam — e a laje contou as duas',
      st?.holding === 'bloom' && st?.blows === 2, JSON.stringify(st));
    await shot('altar-malhando');

    await driver.press('z', { count: 1 });
    await driver.settle(650);
    st = await altarState();
    assert('a TERCEIRA vira FERRO, e ele fica em cima da laje (uma mesa nao move a peca)',
      st?.holding === 'iron' && st?.forged === 1, JSON.stringify(st));
    assert('e a contagem zerou com a peca pronta', st?.blows === 0, JSON.stringify(st));
    await shot('altar-virou-ferro');

    // ── 5. O X TIRA DE VOLTA ──────────────────────────────────────────────────
    log('TIRAR: o X devolve o que a pancada nao trabalha — o ferro pronto');
    await driver.press('x', { count: 1 });
    await driver.settle(400);
    st = await altarState();
    assert('a laje ficou vazia', st?.holding === null, JSON.stringify(st));
    assert('...e o ferro entrou na mochila', (await bagOf('iron')) === 1, 'o ferro sumiu');

    // ── 6. QUALQUER COISA SOBE, E BATER NELA NAO FAZ NADA ─────────────────────
    log('OUTRA COISA: uma pedra tambem sobe na laje, e apanhar nao a transforma');
    await page.evaluate(() => {
      const s = window.__scene;
      s.inventory.add('stone', 1);
      s.inventory.select('stone');
      s.seenItems.add('stone');
    });
    await driver.settle(250);
    await driver.press('z', { count: 1 });
    await driver.settle(400);
    st = await altarState();
    assert('a pedra tambem fica na laje (a mesa nao e uma fechadura de uma chave so)',
      st?.holding === 'stone', JSON.stringify(st));
    await driver.press('z', { count: 1 });
    await driver.settle(650);
    st = await altarState();
    assert('bater nela nao conta pancada nem transforma nada',
      st?.holding === 'stone' && st?.blows === 0 && st?.forged === 1, JSON.stringify(st));
    await driver.press('x', { count: 1 });
    await driver.settle(400);
    st = await altarState();
    assert('e o X devolve a pedra: nada fica preso na mesa',
      st?.holding === null && (await bagOf('stone')) === 1, JSON.stringify(st));
    await shot('altar-vazio-de-novo');
  },
};

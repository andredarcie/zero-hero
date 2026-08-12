// A BANCADA — a mesa onde o jogador CONSTRÓI, e o menu que substituiu as duas bandejas.
//
// A peça nasceu experimento-primeiro (junte dois itens numa bandeja e veja o que sai), e esse
// modelo tem um pré-requisito que este jogo não tem: um milhão de jogadores contando um ao outro
// na internet. A primeira reforma deu a ela um CATÁLOGO — o jogador escolhe o que quer e a máquina
// responde do que ele precisa. Esta segunda tirou o resto do atrito: escolher agora CONSTRÓI,
// direto da mochila, sem largar nada em bandeja nenhuma.
//
// O que este cenário guarda, e cada bloco prova um contrato:
//
//   1. O MENU     — o A na frente da bancada abre a tela, e ela CONGELA o mundo.
//   2. CONSTRUIR  — com os insumos na mochila, confirmar gasta o material e entrega a peça NA
//                   MOCHILA, no mesmo gesto. Nada passa pelo chão.
//   3. RECUSAR    — sem material, confirmar não faz nada e o painel FICA aberto.
//   4. OS CHIPS   — o insumo responde "eu tenho?" (moldura) e "onde consigo?" (cor).
//   5. A SILHUETA — divulgação progressiva: o que o jogador nunca viu sai como vulto.
//   6. A BANDEJA  — ela NÃO morreu: um braço robótico não abre menu, então carga largada nos
//                   tiles de trás continua virando peça sozinha.
//   7. OS PLANOS  — a mesma lista, em leitura, na subtela do ESC.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const waitFor = async (driver, read, ok, timeoutMs = 9000, arg = undefined) => {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  for (;;) {
    last = await driver.page.evaluate(read, arg);
    if (ok(last)) return last;
    if (Date.now() >= deadline) return last;
    await sleep(120);
  }
};

export default {
  name: 'encomenda',
  description: 'A bancada: o A abre o menu, escolher CONSTRÓI direto da mochila, e a bandeja continua servindo às máquinas.',
  needsGame: false,
  route: '/lab',
  async run({ driver, shot, assert, log }) {
    await driver.settle(3000);

    log('EDITOR: faixa limpa + uma bancada olhando pro LESTE');
    const authored = await driver.page.evaluate(() => {
      const store = window.__scene?.store;
      if (!store) return 'sem store no editor';
      for (let x = 1; x <= 11; x += 1) {
        for (let y = 1; y <= 10; y += 1) {
          store.eraseEntitiesAt(x, y);
          store.setCell('upper', x, y, null);
          store.setCell('collision', x, y, false);
        }
      }
      store.placeEntity({ list: 'props', type: 'toolbox', worldX: 5, worldY: 5, dir: 1 });
      return store.allEntities().filter((e) => e.list === 'props' && e.type === 'toolbox').length;
    });
    assert('o store guarda a bancada', authored === 1, `veio ${authored}`);

    log('LAB: P joga o mundo editado');
    await driver.press('p', { count: 1 });
    await driver.settle(2500);

    const uiState = () => driver.page.evaluate(() => {
      const s = window.gameDebug.getState();
      return { orderOpen: s.orderOpen, player: s.player };
    });
    const bag = () => driver.page.evaluate(() => {
      const out = {};
      for (const it of window.__scene.inventory.list()) out[it.kind] = it.count;
      return out;
    });
    const clickCard = (kind, times = 1) => driver.page.evaluate((arg) => {
      const c = document.querySelector(`[data-kind="${arg.kind}"]`);
      if (!c) return false;
      for (let i = 0; i < arg.times; i += 1) c.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return true;
    }, { kind, times });

    const geometry = await driver.page.evaluate(() => window.gameDebug.getState().toolboxes[0]);
    assert('a bancada expoe as duas bandejas', geometry.slots?.length === 2, JSON.stringify(geometry.slots));
    const slots = geometry.slots;
    const out = geometry.output;

    // ── 1. O MENU ABRE COM O A, E CONGELA O MUNDO ─────────────────────────────
    log('MENU: encarar a bancada e apertar A');
    await driver.page.evaluate(() => {
      const s = window.__scene;
      s.playerWorld = { worldX: 6, worldY: 5 };
      s.movementController.syncPlayerToWorld(6, 5, s.tileSize);
    });
    await sleep(300);
    await driver.press('ArrowLeft', { count: 1 });
    await sleep(260);
    await driver.press('z', { count: 1 });
    await sleep(400);
    assert('o A na frente da bancada ABRE o menu', (await uiState()).orderOpen === true, 'nao abriu');
    await shot('bancada-menu');

    const before = (await uiState()).player;
    await driver.press('ArrowUp', { count: 3 });
    await sleep(400);
    const after = (await uiState()).player;
    assert('o menu CONGELA o mundo (o heroi nao anda)',
      before.worldX === after.worldX && before.worldY === after.worldY,
      `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
    await driver.press('x', { count: 1 });
    await sleep(300);
    assert('o X fecha o menu', (await uiState()).orderOpen === false, 'ficou aberto');

    // ── 2. CONSTRUIR: a mesa ENTREGA no chão ──────────────────────────────────
    // O contrato inteiro cabe aqui: dois ferros saem da mochila e uma engrenagem CAI NO CHÃO ao
    // lado da mesa — não na mochila. A conta tem de fechar dos dois lados (o insumo sumiu E o
    // produto apareceu), porque metade dessa frase sozinha é um item perdido em silêncio.
    //
    // A entrega no chão é o pedido do jogador, e a razão dele é boa: com o produto indo direto
    // para a mochila, a mesa martelava para ninguém — o gesto não tinha nenhuma parte visível.
    log('CONSTRUIR: dois ferros viram uma ENGRENAGEM, e ela CAI NO CHÃO ao lado da mesa');
    await driver.page.evaluate(() => {
      const s = window.__scene;
      s.inventory.clear();
      s.inventory.add('iron', 2);
      s.seenItems.add('iron');
      // A ESCADA (catalogSteps): a mesa so mostra os degraus ja cumpridos mais um novo, entao a
      // engrenagem so esta na mesa depois do forno e do machado. O cenario declara em que degrau
      // o jogador esta, que e exatamente o que uma fixture existe para fazer.
      s.seenItems.add('furnace');
      s.seenItems.add('axe');
    });
    await sleep(200);
    await driver.press('z', { count: 1 });
    await sleep(500);
    assert('a engrenagem esta no menu', await clickCard('gear', 2) === true, 'carta nao encontrada');
    await sleep(600);
    const depois = await bag();
    assert('a engrenagem NAO foi para a mochila', (depois.gear ?? 0) === 0, JSON.stringify(depois));
    assert('e os dois ferros foram gastos', (depois.iron ?? 0) === 0, JSON.stringify(depois));
    // ONDE ela caiu importa: num vizinho da mesa, e NUNCA debaixo do herói — o corpo dele esconde
    // o tile em que está, e um voo que termina escondido nao mostra nada.
    const entrega = await driver.page.evaluate(() => {
      const s = window.__scene;
      const b = s.toolboxes[0];
      const hit = s.itemManager.snapshot().filter((i) => i.kind === 'gear');
      return {
        n: hit.length,
        vizinha: hit.some((i) => Math.abs(i.worldX - b.worldX) <= 1 && Math.abs(i.worldY - b.worldY) <= 1),
        sobOsPes: hit.some((i) => i.worldX === s.playerWorld.worldX && i.worldY === s.playerWorld.worldY),
      };
    });
    assert('saiu UMA engrenagem, e ela esta no chao ao lado da mesa',
      entrega.n === 1 && entrega.vizinha === true, JSON.stringify(entrega));
    assert('e ela nao pousou debaixo do heroi', entrega.sobOsPes === false, JSON.stringify(entrega));
    assert('e o menu fechou sozinho', (await uiState()).orderOpen === false, 'ficou aberto');
    // E RECOLHER É O GESTO DE SEMPRE: a peca cai AO LADO do heroi (ele esta de cara para a mesa),
    // entao o jogador anda um passo ate ela e aperta o B. Nenhuma excecao nova — e e por isso que
    // este bloco existe: uma entrega que exigisse um gesto proprio seria uma segunda gramatica.
    const rumo = await driver.page.evaluate(() => {
      const s = window.__scene;
      const g = s.itemManager.snapshot().find((i) => i.kind === 'gear');
      return g ? [g.worldX - s.playerWorld.worldX, g.worldY - s.playerWorld.worldY] : null;
    });
    const tecla = rumo && (rumo[0] < 0 ? 'ArrowLeft' : rumo[0] > 0 ? 'ArrowRight'
      : rumo[1] < 0 ? 'ArrowUp' : 'ArrowDown');
    await driver.walk({ ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[tecla], 1);
    await sleep(400);
    await driver.press('x', { count: 1 });
    await sleep(500);
    const recolhida = await bag();
    assert('um passo ate a peca e o B a recolhe para a mochila', recolhida.gear === 1,
      `rumo ${JSON.stringify(rumo)} -> ${JSON.stringify(recolhida)}`);
    // E VOLTA para a frente da mesa: os blocos seguintes contam com o heroi encarando ela. O
    // segundo passo e para o lado da bancada, que e solida — ele so VIRA o corpo (ver a lei da
    // parede que vira o heroi), e e assim que a cara dele volta a apontar para o movel.
    const volta = { ArrowLeft: 'right', ArrowRight: 'left', ArrowUp: 'down', ArrowDown: 'up' }[tecla];
    await driver.walk(volta, 1);
    await sleep(300);
    const paraMesa = await driver.page.evaluate(() => {
      const s = window.__scene;
      const b = s.toolboxes[0];
      const dx = b.worldX - s.playerWorld.worldX;
      const dy = b.worldY - s.playerWorld.worldY;
      return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
    });
    await driver.walk(paraMesa, 1);
    await sleep(300);
    await shot('bancada-construiu');

    // ── 3. A RECUSA: sem material, o gesto nao acontece ───────────────────────
    // E o painel FICA ABERTO, que é o oposto do que fechar significaria: fechar diria "pronto", e
    // não aconteceu nada.
    log('RECUSA: sem material, confirmar nao constroi e o painel fica aberto');
    await driver.page.evaluate(() => { window.__scene.inventory.clear(); });
    await driver.press('z', { count: 1 });
    await sleep(400);
    const antesRecusa = await bag();
    await clickCard('extractor', 2);
    await sleep(500);
    assert('sem insumo nada e construido',
      JSON.stringify(await bag()) === JSON.stringify(antesRecusa), JSON.stringify(await bag()));
    assert('e o painel continua aberto para outra escolha',
      (await uiState()).orderOpen === true, 'fechou');

    // ── 4 e 5. A ESCADA E OS CHIPS ────────────────────────────────────────────
    // A mesa listava as ONZE receitas de uma vez, e as que ninguem tinha visto ficavam em
    // silhueta. Onze cartas na primeira abertura nao sao ambicao, sao uma parede — o relato do
    // jogador foi exatamente esse. Hoje ela mostra o MINIMO para continuar: o que ele ja fez, e
    // UMA coisa nova (ver catalogSteps). Este bloco mede as duas metades disso.
    log('ESCADA: o que ja foi feito, mais UM degrau novo — e os chips do que falta');
    await driver.page.evaluate(() => {
      const s = window.__scene;
      // O jogador esta no degrau do MARTINETE: forno, machado e engrenagem ja passaram pelas maos
      // dele; o proximo da escada e o martinete, e nada depois dele pode aparecer.
      s.seenItems.clear();
      ['wood', 'stone', 'furnace', 'axe', 'gear'].forEach((k) => s.seenItems.add(k));
      s.inventory.clear();
      s.inventory.add('iron', 1);
    });
    // O painel so redesenha quando o cursor anda (ele le a view a cada desenho, nao guarda foto).
    // Mexer na mochila por fora nao o avisa — uma seta faz o redesenho acontecer.
    await driver.press('ArrowRight', { count: 1 });
    await sleep(400);
    const cards = await driver.page.evaluate(() => {
      const all = [...document.querySelectorAll('.zh-order-card')];
      const chip = (kind, n) => {
        const el = document.querySelector(`[data-kind="${kind}"]`)?.querySelectorAll('.zh-order-need')[n];
        return el ? {
          lack: el.classList.contains('zh-lack'),
          makeable: el.classList.contains('zh-makeable'),
          n: el.querySelector('.zh-order-need-n')?.textContent ?? null,
        } : null;
      };
      return {
        kinds: all.map((c) => c.dataset.kind),
        next: all.filter((c) => c.classList.contains('zh-next')).map((c) => c.dataset.kind),
        dimmed: all.filter((c) => c.classList.contains('zh-unknown')).length,
        axeWood: chip('axe', 0),
        hammerGear: chip('tripHammer', 0),
        gearIron: chip('gear', 0),
      };
    });
    assert('a mesa mostra so os degraus cumpridos e o proximo',
      JSON.stringify(cards.kinds) === JSON.stringify(['furnace', 'axe', 'gear', 'tripHammer']),
      JSON.stringify(cards.kinds));
    assert('e o degrau NOVO e o ultimo, anunciado como novo',
      JSON.stringify(cards.next) === JSON.stringify(['tripHammer']), JSON.stringify(cards));
    assert('nada do que esta na mesa fica em silhueta (a carta nova e a que ele precisa VER)',
      cards.dimmed === 0, JSON.stringify(cards));
    assert('insumo de MUNDO que falta sai apagado, e so',
      cards.axeWood?.lack === true && cards.axeWood?.makeable === false, JSON.stringify(cards));
    assert('insumo que a BANCADA faz falta de outro jeito (moldura em brasa)',
      cards.hammerGear?.lack === true && cards.hammerGear?.makeable === true, JSON.stringify(cards));
    assert('e o contador diz quanto FALTA, nao so quanto custa',
      cards.gearIron?.n === '1/2', JSON.stringify(cards));

    // NENHUM ICONE QUEBRADO. Este assert nasceu de um defeito real que ficou escondido por semanas:
    // o forno e o martinete entraram no `textures3d` (o lado 3D) e nao no `assetManifest` (o lado
    // Phaser), e a UI 2D pede um data URL do frame pelo Phaser — as duas cartas eram <img> com
    // src vazio. A silhueta preta do catalogo chapava tudo em cinza, e uma imagem quebrada chapada
    // de preto e indistinguivel de um vulto. `naturalWidth` e a unica pergunta que nao mente.
    const artes = await driver.page.evaluate(() => [...document.querySelectorAll('.zh-order-card')]
      .filter((c) => (c.querySelector('.zh-order-art')?.naturalWidth ?? 0) === 0)
      .map((c) => c.dataset.kind));
    assert('as 11 cartas desenham arte de verdade (nenhuma <img> quebrada)',
      artes.length === 0, `quebradas: ${artes.join(',') || 'nenhuma'}`);

    // A RECUSA CHEGA, e ela APONTA. Um relato de jogo real ("apertei Z e nada aconteceu") mediu o
    // preco de ela ser discreta. O cursor esta na engrenagem, que pede DOIS ferros e tem um.
    const recusa = await driver.page.evaluate(async () => {
      const gear = document.querySelector('[data-kind="gear"]');
      gear.click();
      await new Promise((r) => requestAnimationFrame(r));
      return {
        treme: gear.classList.contains('zh-deny'),
        aponta: gear.querySelectorAll('.zh-order-need.zh-point').length,
        aberto: !!document.querySelector('.zh-order-card'),
        mochila: window.__scene.inventory.list(),
      };
    });
    assert('faltando material a carta TREME', recusa.treme === true, JSON.stringify(recusa));
    assert('e o insumo que falta e APONTADO (o desenho diz o QUE falta)',
      recusa.aponta === 1, JSON.stringify(recusa));
    assert('o painel fica aberto e a mochila nao perde nada',
      recusa.aberto === true && recusa.mochila.length === 1, JSON.stringify(recusa));
    await shot('bancada-chips');
    await driver.press('x', { count: 1 });
    await sleep(300);

    // ── 6. A BANDEJA NAO MORREU ───────────────────────────────────────────────
    // Ela deixou de ser o caminho do JOGADOR e continua sendo o das MÁQUINAS: um braço robótico
    // não abre menu. Sem este bloco, uma reforma de UI teria matado em silêncio a única parte do
    // jogo que produz sozinha enquanto o herói está longe.
    log('BANDEJA: carga largada nos tiles de tras continua virando peca sozinha');
    // O HEROI SAI DE CIMA DA SAIDA. Encarar a bancada pelo leste é ficar exatamente no tile em que
    // ela cospe, e uma bancada com a saída ocupada RECUSA — comportamento certo dela, fixture
    // errada minha. Sem isto o bloco acusa um defeito que não existe.
    await driver.page.evaluate(() => {
      const s = window.__scene;
      s.playerWorld = { worldX: 9, worldY: 9 };
      s.movementController.syncPlayerToWorld(9, 9, s.tileSize);
    });
    await sleep(300);
    await driver.page.evaluate((s) => {
      window.__scene.itemManager.drop('wood', s[0][0], s[0][1]);
      window.__scene.itemManager.drop('stone', s[1][0], s[1][1]);
    }, slots);
    const forjado = await waitFor(
      driver,
      (o) => window.__scene.itemManager.kindAt(o[0], o[1]),
      (k) => k !== null,
      12000,
      out,
    );
    assert('a bancada forjou o MACHADO pelo canal das maquinas', forjado === 'axe', `veio ${forjado}`);
    await shot('bancada-maquina');

    // ── 7. A PAGINA DE PLANOS ─────────────────────────────────────────────────
    log('SUBTELA: a mesma lista, em leitura, dentro do menu de pausa');
    await driver.page.evaluate(() => window.__scene.openPauseMenu());
    await sleep(700);
    const plans = await driver.page.evaluate(() => ({
      rows: document.querySelectorAll('.zh-sub-plan').length,
      title: [...document.querySelectorAll('.zh-sub-map-title')].map((h) => h.textContent).join('|'),
    }));
    // A pagina de planos e a MESMA lista da bancada, em leitura — entao ela anda na mesma escada.
    // Um livro que mostrasse as onze receitas enquanto a mesa mostra quatro seria uma segunda voz
    // dizendo o oposto, e a que fala mais alto (a que promete mais) e a que confunde.
    assert('a subtela desenha uma linha por plano CONHECIDO, como a bancada',
      plans.rows === 4, JSON.stringify(plans));
    assert('sob o cabecalho PLANS', plans.title.includes('PLANS'), JSON.stringify(plans));
    await shot('bancada-planos');
  },
};

// O VEIO DE FERRO, O KEYCAP "Z" E O BALCÃO QUE DERRUBA MOEDAS — minerar é uma atividade.
//
// A rocha de minério é um POÇO: nunca quebra, e a cada TRÊS picaretadas cospe um bloco que
// ESPALHA COMO MOEDA (a exceção deliberada ao "nada entra por pisada"): você passa por cima,
// ele entra na mochila e a MÃO continua com o que estava — a picareta não é roubada por cada
// bloco que cai. Falar com o NPC é o botão de AÇÃO (Z) de frente pra ele, anunciado por um
// keycap pixel-art na cabeça de quem responde. O menu do diálogo navega por setas/WASD e
// confirma com Enter/Espaço/Z. E a venda NÃO credita carteira: o astronauta DERRUBA as moedas
// em volta de si, como um inimigo derrubaria — pegar continua sendo andar até elas.

export default {
  name: 'ferro',
  description: 'Veio infinito com loot por pisada, Z para conversar, menu por setas e venda que derruba moedas.',
  needsGame: true,
  async run({ driver, shot, assert, log }) {
    await driver.settle(1500);
    const page = driver.page;
    const evaluate = (fn, arg) => page.evaluate(fn, arg);
    // O mundo-biblioteca não é puzzle, então o cerco de undead RODA — e uma caveira chegando
    // no meio da mineração empurraria o herói pra fora do palco. O cenário autora o silêncio.
    await evaluate(() => window.__scene.enemyManager?.despawnAll?.());

    // ── 1. O palco: um veio de ferro com um tile pisável ao lado ────────────
    const spot = await evaluate(() => {
      const s = window.__scene;
      for (const r of s.rocks) {
        if (!r.ore) continue;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nx = r.worldX + dx;
          const ny = r.worldY + dy;
          if (!s.isSolidForEntities(nx, ny) && !s.itemManager.hasItemAt(nx, ny)) {
            return { rx: r.worldX, ry: r.worldY, hx: nx, hy: ny };
          }
        }
      }
      return null;
    });
    assert('o mundo tem um veio de ferro alcançável', spot !== null, 'nenhum ironRock com vizinho livre');

    const dir = spot.rx > spot.hx ? 'right' : spot.rx < spot.hx ? 'left' : spot.ry > spot.hy ? 'down' : 'up';
    const teleport = (x, y) => evaluate(([px, py]) => {
      const s = window.__scene;
      s.playerWorld.worldX = px;
      s.playerWorld.worldY = py;
      s.movementController.interruptMovement(px, py);
    }, [x, y]);
    await teleport(spot.hx, spot.hy);
    await evaluate(() => {
      const s = window.__scene;
      s.heldItem = 'pickaxe';
      // A cerimônia de primeiro-item é do jogo, não deste contrato.
      s.seenItems.add('iron');
    });
    await driver.settle(400);
    await driver.face(dir);
    await driver.settle(200);

    const vein = () => evaluate(([rx, ry]) => {
      const s = window.__scene;
      const r = s.rocks.find((rock) => rock.worldX === rx && rock.worldY === ry);
      return {
        blocking: r?.blocking ?? null,
        frame: r?.sprite?.frame ?? null,
        loot: s.coinManager.getActiveLootPositions(),
        iron: s.inventory.count('iron'),
        held: s.heldItem,
      };
    }, [spot.rx, spot.ry]);

    // ── 2. O ciclo de três: racha, segura, PRODUZ — e a rocha continua lá ───
    log('VEIO: 1ª picaretada racha (frame 1), 3ª solta o bloco que espalha como moeda');
    await driver.attack(1);
    await driver.settle(700);
    const afterOne = await vein();
    assert('a 1ª picaretada racha o veio (o placar visível)', afterOne.frame === 1, JSON.stringify(afterOne));
    assert('e o veio rachado segue bloqueando', afterOne.blocking === true, JSON.stringify(afterOne));
    await shot('veio-rachado');

    await driver.attack(1);
    await driver.settle(700);
    const afterTwo = await vein();
    assert('a 2ª picaretada não produz ainda (a rachadura segura o placar)',
      afterTwo.frame === 1 && afterTwo.loot.length === 0, JSON.stringify(afterTwo));

    await driver.attack(1);
    await driver.settle(1100); // o bloco salta, quica e assenta num tile vizinho
    const afterThree = await vein();
    assert('a 3ª picaretada solta UM bloco de ferro espalhado como moeda',
      afterThree.loot.length === 1, JSON.stringify(afterThree));
    assert('o veio NUNCA quebra: continua de pé e bloqueando', afterThree.blocking === true, JSON.stringify(afterThree));
    assert('e a arte volta a INTEIRA — o desenho de "recarregado"', afterThree.frame === 0, JSON.stringify(afterThree));
    await shot('veio-produziu');

    // ── 3. Pegar é PISAR — e a mão do herói não muda ────────────────────────
    await teleport(afterThree.loot[0].worldX, afterThree.loot[0].worldY);
    await driver.settle(900);
    const picked = await vein();
    assert('pisar no bloco o guarda na mochila', picked.iron === 1 && picked.loot.length === 0,
      JSON.stringify(picked));
    assert('e a MÃO continua com a picareta (stash nunca seleciona)', picked.held === 'pickaxe',
      JSON.stringify(picked));

    log('CICLO 2: o veio rearma e a mochila acumula');
    await teleport(spot.hx, spot.hy);
    await driver.settle(300);
    await driver.face(dir);
    await driver.settle(200);
    await driver.attack(3);
    await driver.settle(1300);
    const second = await vein();
    assert('o segundo ciclo produz o segundo bloco', second.loot.length === 1, JSON.stringify(second));
    await teleport(second.loot[0].worldX, second.loot[0].worldY);
    await driver.settle(900);
    const stocked = await vein();
    assert('a mochila conta 2 ferros', stocked.iron === 2, JSON.stringify(stocked));

    // ── 4. O keycap "Z" e a conversa pelo botão de ação ─────────────────────
    log('CONVERSA: encarar o NPC mostra o keycap, e o Z abre o diálogo');
    const npc = await evaluate(() => {
      const s = window.__scene;
      const positions = s.npcManager.getActiveWorldPositions();
      const astronauts = positions.filter((p) => s.npcManager.getKindAt(p.worldX, p.worldY) === 'astronaut');
      return astronauts[0] ?? null;
    });
    assert('o astronauta está no mundo', npc !== null, 'sem astronauta na janela ativa');
    await teleport(npc.worldX - 1, npc.worldY);
    await driver.settle(300);
    await driver.face('right');
    await driver.settle(400);
    const promptShown = await evaluate(() => ({
      texture: window.__scene.textures.exists('npc-talk-key'),
      visible: window.__scene.npcManager.all().some((n) => n.talkKey.visible),
    }));
    assert('o keycap da tecla de ação flutua sobre o NPC encarado',
      promptShown.texture && promptShown.visible, JSON.stringify(promptShown));
    await shot('keycap-conversa');

    await driver.attack(1); // o Z: de frente pra alguém, o botão de ação CONVERSA
    await page.waitForFunction(() => window.gameDebug?.getState()?.dialogOpen === true, null, { timeout: 5000 });
    await page.waitForSelector('[data-opt="talk"]', { timeout: 8000 });
    const firstMenu = await page.locator('.zh-dlg-opt').evaluateAll(
      (nodes) => nodes.map((node) => node.dataset.opt),
    );
    assert('depois da PRIMEIRA fala o menu oferece exatamente conversar e vender',
      JSON.stringify(firstMenu) === JSON.stringify(['talk', 'sell']), JSON.stringify(firstMenu));

    // ── 5. Setas navegam, Enter confirma — e o caixa pergunta a quantidade ──
    await page.keyboard.press('ArrowDown'); // a seleção desce para "Sell iron"
    const selectedOpt = await evaluate(() =>
      document.querySelector('.zh-dlg-opt.is-selected')?.dataset.opt ?? null);
    assert('a seta move a seleção destacada para vender', selectedOpt === 'sell', `selected=${selectedOpt}`);
    await page.keyboard.press('Enter');
    await page.waitForSelector('[data-opt="confirm"]', { timeout: 8000 });
    const qtyFull = await page.locator('.zh-dlg-qty').getAttribute('data-qty');
    assert('o caixa abre oferecendo TUDO que o herói carrega', qtyFull === '2', `qty=${qtyFull}`);
    await page.locator('[data-opt="minus"]').click();
    const qtyDown = await page.locator('.zh-dlg-qty').getAttribute('data-qty');
    assert('o − lapida a quantidade', qtyDown === '1', `qty=${qtyDown}`);
    await page.locator('[data-opt="plus"]').click();
    const qtyUp = await page.locator('.zh-dlg-qty').getAttribute('data-qty');
    assert('o + devolve até o teto da mochila', qtyUp === '2', `qty=${qtyUp}`);
    await shot('balcao-caixa');

    // ── 6. A venda DERRUBA moedas em volta do NPC — a carteira espera o passo ─
    const coinsBefore = (await driver.getState())?.coins ?? 0;
    await page.keyboard.press('Enter'); // confirmar é a opção selecionada do caixa
    await page.waitForSelector('[data-opt="sell"]', { timeout: 10000 }); // o balcão reabre após o recibo
    const sold = await evaluate(() => ({
      iron: window.__scene.inventory.count('iron'),
      coins: window.gameDebug.getState().coins,
      ground: window.__scene.coinManager.getActiveWorldPositions().length,
      receipt: [...document.querySelectorAll('.zh-dlg-body')].some(
        (node) => /Sold 2 iron for 6 coins/u.test(node.textContent ?? ''),
      ),
    }));
    assert('a mochila esvaziou na hora', sold.iron === 0, JSON.stringify(sold));
    assert('mas a carteira NÃO: o NPC derrubou 6 moedas no mundo',
      sold.coins === coinsBefore && sold.ground === 6, JSON.stringify(sold));
    assert('o recibo com o número exato entra no LOG da conversa', sold.receipt === true, JSON.stringify(sold));
    await shot('balcao-vendido');

    // ── 7. Mochila vazia: a recusa é uma FALA, e o diálogo segue de pé ──────
    await page.locator('[data-opt="sell"]').click();
    await page.waitForFunction(() => [...document.querySelectorAll('.zh-dlg-body')].some(
      (node) => /no iron/u.test(node.textContent ?? ''),
    ), null, { timeout: 8000 });
    await page.waitForSelector('[data-opt="sell"]', { timeout: 8000 });

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.gameDebug?.getState()?.dialogOpen === false, null, { timeout: 5000 });

    // ── 8. Pegar o pagamento é ANDAR até ele ────────────────────────────────
    log('PAGAMENTO: as moedas do NPC se pegam passando por cima, como qualquer moeda');
    const coinTiles = await evaluate(() => {
      const seen = new Set();
      return window.__scene.coinManager.getActiveWorldPositions().filter((p) => {
        const key = `${p.worldX},${p.worldY}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });
    for (const tile of coinTiles) {
      await teleport(tile.worldX, tile.worldY);
      await driver.settle(500);
    }
    await page.waitForFunction(
      () => window.__scene.coinManager.getActiveWorldPositions().length === 0,
      null, { timeout: 8000 },
    );
    await driver.settle(600); // o voo até o contador do HUD termina de creditar
    const paid = (await driver.getState())?.coins ?? 0;
    assert('as 6 moedas apanhadas entram na carteira de verdade', paid === coinsBefore + 6,
      `antes=${coinsBefore} depois=${paid}`);
    await shot('pagamento-recolhido');
  },
};

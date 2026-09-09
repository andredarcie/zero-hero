// O VEIO DE MINERIO E O KEYCAP "Z" — minerar é uma atividade.
//
// A rocha de minério é um POÇO: nunca quebra, e a cada TRÊS picaretadas cospe um bloco de MINÉRIO
// (pedra com óxido — o ferro só nasce no forno) que SALTA E ESPALHA (a exceção deliberada ao
// "nada entra por pisada"): você passa por cima, ele entra na mochila e a MÃO continua com o que
// estava — a picareta não é roubada por cada bloco que cai. Falar com o NPC é o botão de AÇÃO (Z)
// de frente pra ele, anunciado por um keycap pixel-art na cabeça de quem responde.
//
// O BALCÃO SAIU DAQUI junto com a MOEDA: o astronauta comprava minério e derrubava moedas em
// volta de si, e o jogo não tem mais dinheiro nenhum. As seções 5 a 8 (o caixa − n +, a venda, o
// recibo e o pagamento recolhido do chão) foram removidas com ele — e com elas foi embora a
// ÚNICA conversa do jogo que abria um menu de várias opções. Por isso a seção 5 de hoje cobra o
// contrário do que a antiga cobrava: que a conversa saia pelo ▼ e por mais nada.

export default {
  name: 'ferro',
  description: 'Veio infinito com loot por pisada, Z para conversar e a conversa que sai só pelo ▼.',
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
      s.seenItems.add('ore');
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
        loot: s.lootManager.getActiveLootPositions(),
        iron: s.inventory.count('ore'),
        held: s.heldItem,
      };
    }, [spot.rx, spot.ry]);

    // ── 2. O ciclo de três: racha, segura, PRODUZ — e a rocha continua lá ───
    log('VEIO: 1ª picaretada racha (frame 1), 3ª solta o bloco que salta e espalha');
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
    assert('a 3ª picaretada solta UM bloco de ferro que salta e pousa ao lado',
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
    await shot('conversa-aberta', { region: 'dialog' });

    // ── 5. A saída é o ▼, e NÃO um menu de opções ──────────────────────────
    // Enquanto havia balcão, a fala do astronauta abria uma janela com "continuar" e "vender".
    // Sem moeda não há o que vender, e a conversa voltou a ter uma saída só.
    await page.waitForSelector('.zh-dlg-next', { state: 'visible', timeout: 10000 });
    const exit = await evaluate(() => ({
      next: document.querySelector('.zh-dlg-next')?.dataset.opt ?? null,
      options: document.querySelectorAll('.zh-dlg-opt').length,
      window: document.querySelector('.zh-dlg-choices')?.classList.contains('zh-on') ?? false,
    }));
    assert('a única fala do astronauta sai pelo ▼ de FECHAR',
      exit.next === 'close', JSON.stringify(exit));
    assert('e nenhuma janela de escolha abre — o balcão saiu com a moeda',
      exit.options === 0 && exit.window === false, JSON.stringify(exit));

    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.gameDebug?.getState()?.dialogOpen === false, null, { timeout: 5000 });
  },
};

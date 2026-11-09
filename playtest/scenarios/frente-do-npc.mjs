// FRENTE-DO-NPC — a regra (pedido do autor, world/npcFront.ts): o tile exatamente de frente para um NPC nunca guarda
// item no chão, para não misturar a conversa com o pegar. O que ia cair ali vai para a DIREITA do NPC, depois a
// ESQUERDA, depois para TRÁS — e, sem nenhum dos três, para qualquer lugar que não seja a frente.
//
// Confere: o mapa autorado; a troca de verdade (conversar de mão cheia com a Shui e ganhar a faca); os lados
// ocupados um a um; o herói tentando pousar ali; o save antigo com item ali; e o caminho das quests (dropAt).
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'frente-do-npc',
  description: 'Nenhum item fica no tile de frente para um NPC: o que cairia ali vai para o lado dele.',
  needsGame: false,
  async run({ driver, shot, assert, log }) {
    const { page } = driver;
    const state = () => page.evaluate(() => window.gameDebug?.getState() ?? null);
    const drain = async () => {
      for (let i = 0; i < 30; i += 1) {
        const st = await state();
        if (!st.dialogOpen && !st.cutsceneActive && !st.itemGetOpen) return;
        if (st.dialogOpen || st.itemGetOpen) await page.keyboard.press('z');
        await sleep(400);
      }
    };

    await page.addInitScript(() => {
      localStorage.setItem('zh.cozy.v1', JSON.stringify({ started: true, introSeen: true }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await sleep(1200);

    /** Os itens do chão nas frentes de NPC, e onde estão os de um tipo. */
    const ground = () => page.evaluate(() => {
      const s = window.__scene;
      const fronts = new Set(s.npcTiles().map((n) => `${n.worldX},${n.worldY + 1}`));
      const items = s.itemManager.snapshot();
      return {
        inFront: items.filter((i) => fronts.has(`${i.worldX},${i.worldY}`)).map((i) => `${i.kind}@${i.worldX},${i.worldY}`),
        items: items.map((i) => ({ kind: i.kind, x: i.worldX, y: i.worldY })),
      };
    });
    const at = (g, kind) => g.items.filter((i) => i.kind === kind).map((i) => `${i.x},${i.y}`);

    // ── 1. O MAPA ─────────────────────────────────────────────────────────────────────────────
    const start = await ground();
    assert('O mapa não tem item na frente de nenhum NPC', start.inFront.length === 0, JSON.stringify(start.inFront));

    // A Shui está em (5,40): a frente é (5,41); direita (6,40), esquerda (4,40), atrás (5,39).
    const H = { x: 5, y: 40 };
    const FRONT = `${H.x},${H.y + 1}`;
    const RIGHT = `${H.x + 1},${H.y}`;
    const LEFT = `${H.x - 1},${H.y}`;
    const BACK = `${H.x},${H.y - 1}`;
    const standInFront = () => page.evaluate(([x, y]) => {
      const s = window.__scene; window.gameTime.set(0.45);
      s.playerWorld.worldX = x; s.playerWorld.worldY = y + 1;
      s.movementController.interruptMovement(x, y + 1); s.movementController.faceTo(0, -1); s.streamChunks(true);
    }, [H.x, H.y]);

    // ── 2. A TROCA DE VERDADE: conversar com a pedra na mão e ganhar a faca ─────────────────────
    await standInFront();
    await page.evaluate(() => window.__scene.takeIntoHand('stone'));
    await sleep(600);
    await page.keyboard.press('z');
    await sleep(500);
    await drain();
    await sleep(600);
    const swap = await ground();
    const held = await page.evaluate(() => window.__scene.heldItem);
    log(`  troca: na mão ${held}, pedra em ${at(swap, 'stone')}`);
    assert('A Shui deu a faca', held === 'knife', held);
    assert('A pedra que estava na mão caiu à DIREITA da Shui, e não na frente dela', at(swap, 'stone').includes(RIGHT) && swap.inFront.length === 0, JSON.stringify({ stone: at(swap, 'stone'), inFront: swap.inFront }));
    await shot('00-troca', { note: 'A pedra à direita da Shui; a frente dela, livre' });

    // ── 3. OS LADOS OCUPADOS, UM A UM ─────────────────────────────────────────────────────────
    // Direita ocupada (a pedra de agora): a próxima troca cai à esquerda.
    await standInFront();
    await page.evaluate(() => window.__scene.takeIntoHand('wood'));
    const left = await ground();
    assert('Com a direita ocupada, o que cai vai para a ESQUERDA do NPC', at(left, 'knife').includes(LEFT) && left.inFront.length === 0, JSON.stringify({ knife: at(left, 'knife'), inFront: left.inFront }));
    // Direita e esquerda ocupadas: vai para trás.
    await page.evaluate(() => window.__scene.takeIntoHand('bucket'));
    const back = await ground();
    assert('Com os dois lados ocupados, vai para TRÁS do NPC', at(back, 'wood').includes(BACK) && back.inFront.length === 0, JSON.stringify({ wood: at(back, 'wood'), inFront: back.inFront }));
    // Os três ocupados: qualquer lugar, menos a frente.
    await page.evaluate(() => window.__scene.takeIntoHand('shovel'));
    const any = await ground();
    assert('Com direita, esquerda e trás ocupados, cai em outro lugar — nunca na frente', at(any, 'bucket').length === 1 && !at(any, 'bucket').includes(FRONT) && any.inFront.length === 0, JSON.stringify({ bucket: at(any, 'bucket'), inFront: any.inFront }));

    // ── 4. O HERÓI TENTANDO POUSAR NA FRENTE ──────────────────────────────────────────────────
    const placed = await page.evaluate(([x, y]) => {
      const s = window.__scene;
      s.playerWorld.worldX = x; s.playerWorld.worldY = y + 2;
      s.movementController.interruptMovement(x, y + 2); s.movementController.faceTo(0, -1);
      return s.placeItemAt(x, y + 1);
    }, [H.x, H.y]);
    const afterPlace = await ground();
    assert('O herói não consegue pousar um item na frente do NPC', placed === false && afterPlace.inFront.length === 0, JSON.stringify({ placed, inFront: afterPlace.inFront }));

    // ── 5. O SAVE ANTIGO, COM ITEM NA FRENTE ──────────────────────────────────────────────────
    const moved = await page.evaluate(([x, y]) => {
      const s = window.__scene;
      s.itemManager.drop('stool', x, y + 1); // direto no gerente, como um save de antes da regra
      return s.enforceNpcFrontRule();
    }, [H.x, H.y]);
    const afterLoad = await ground();
    assert('Um item que estava na frente (save antigo) é tirado de lá ao carregar', moved === 1 && afterLoad.inFront.length === 0 && at(afterLoad, 'stool').length === 1, JSON.stringify({ moved, stool: at(afterLoad, 'stool'), inFront: afterLoad.inFront }));

    // ── 6. O CAMINHO DAS QUESTS E DA BANCADA (o ponto único de drop) ──────────────────────────
    const dropped = await page.evaluate(([x, y]) => window.__scene.dropItem('lantern', x, y + 1), [H.x, H.y]);
    const afterDrop = await ground();
    assert('Pedir para largar na frente do NPC larga em outro lugar', dropped && `${dropped[0]},${dropped[1]}` !== FRONT && afterDrop.inFront.length === 0, JSON.stringify({ dropped, inFront: afterDrop.inFront }));

    // Todos os NPCs: nada em nenhuma frente, no fim de tudo.
    const end = await ground();
    assert('No fim, nenhuma frente de NPC tem item', end.inFront.length === 0, JSON.stringify(end.inFront));
  },
};

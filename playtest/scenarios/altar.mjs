// A BIGORNA DA THEA (pedido do autor) — fixa ao lado do forno, e o ÚNICO lugar onde a esponja vira barra.
//
// O que este cenário prova, na ordem:
//   1. o mapa tem UMA bigorna, ao lado do forno, e nenhuma mesa de ferramentas;
//   2. a esponja no CHÃO não se malha mais;
//   3. com a esponja na mão, o Z diante da bigorna a PÕE em cima;
//   4. a primeira pancada tira o martelinho do toco (ele vai para a mão do herói);
//   5. três pancadas viram a esponja em BARRA, em cima da bigorna (a Thea não está esperando: a barra fica);
//   6. dar um passo para longe devolve o martelinho ao toco — ele é da bigorna, não da bolsa;
//   7. o Z tira a barra pronta para a mão; uma pedra posta por engano volta para a mão do mesmo jeito;
//   8. a bigorna não se recolhe.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'altar',
  description: 'A bigorna fixa da Thea: pôr a esponja, pegar o martelinho, três pancadas, barra; o chão não malha.',
  needsGame: false,
  async run({ driver, shot, assert, log }) {
    const { page } = driver;
    const press = async (key, after = 650) => { await page.keyboard.down(key); await sleep(70); await page.keyboard.up(key); await sleep(after); };

    await page.addInitScript(() => {
      localStorage.setItem('zh.cozy.v1', JSON.stringify({ started: true, introSeen: true }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await sleep(1200);

    // ── 1. O MAPA ─────────────────────────────────────────────────────────────────────────────
    const map = await page.evaluate(() => {
      const s = window.__scene;
      const f = s.furnaces[0];
      return {
        anvils: s.altars.map((a) => [a.worldX, a.worldY, a.playerBuilt]),
        furnace: f ? [f.worldX, f.worldY] : null,
        toolboxes: s.toolboxes.length,
      };
    });
    log(`  mapa: ${JSON.stringify(map)}`);
    const [ax, ay] = map.anvils[0] ?? [0, 0];
    assert('Há UMA bigorna, fixa, ao lado do forno', map.anvils.length === 1 && map.anvils[0][2] === false && map.furnace
      && Math.abs(ax - map.furnace[0]) <= 1 && Math.abs(ay - map.furnace[1]) <= 1, JSON.stringify(map));
    assert('A mesa de ferramentas saiu do mapa', map.toolboxes === 0, String(map.toolboxes));

    const anvil = () => page.evaluate(() => {
      const a = window.__scene.altars[0];
      return { carrying: a.carrying, forging: Boolean(window.__scene.forging), held: window.__scene.heldItem };
    });
    const standAt = (x, y, fx, fy) => page.evaluate(([px, py, a, b]) => {
      const s = window.__scene; window.gameTime.set(0.45);
      s.playerWorld.worldX = px; s.playerWorld.worldY = py;
      s.movementController.interruptMovement(px, py); s.movementController.faceTo(a, b); s.streamChunks(true);
    }, [x, y, fx, fy]);

    // ── 2. A ESPONJA NO CHÃO NÃO SE MALHA ─────────────────────────────────────────────────────
    const ground = { x: ax, y: ay + 3 };
    await standAt(ground.x, ground.y + 1, 0, -1);
    await page.evaluate(([x, y]) => window.__scene.itemManager.drop('bloom', x, y), [ground.x, ground.y]);
    await sleep(400);
    await page.evaluate(() => window.__scene.takeIntoHand('pickaxe'));
    for (let i = 0; i < 4; i += 1) await press('x', 400);
    const stillBloom = await page.evaluate(([x, y]) => window.__scene.itemManager.kindAt(x, y), [ground.x, ground.y]);
    assert('A esponja no chão não vira barra (só na bigorna)', stillBloom === 'bloom', String(stillBloom));
    await page.evaluate(([x, y]) => window.__scene.itemManager.takeAt(x, y), [ground.x, ground.y]);

    // ── 3. PÔR NA BIGORNA ─────────────────────────────────────────────────────────────────────
    await standAt(ax, ay + 1, 0, -1);
    await page.evaluate(() => { window.__scene.clearHeldItem(); window.__scene.takeIntoHand('bloom'); });
    await sleep(500);
    await press('z');
    let st = await anvil();
    assert('O Z põe a esponja em cima da bigorna (e ela sai da mão)', st.carrying === 'bloom' && st.held !== 'bloom', JSON.stringify(st));

    // ── 4/5. O MARTELINHO E AS TRÊS PANCADAS ──────────────────────────────────────────────────
    await press('x', 450);
    st = await anvil();
    assert('A primeira pancada tira o martelinho do toco', st.forging === true, JSON.stringify(st));
    await shot('00-malhando', { note: 'O herói malhando a esponja na bigorna' });
    for (let i = 0; i < 6 && (await anvil()).carrying === 'bloom'; i += 1) await press('x');
    st = await anvil();
    assert('Três pancadas viram a esponja em barra, em cima da bigorna', st.carrying === 'iron', JSON.stringify(st));

    // ── 6. SAIR DE PERTO DEVOLVE O MARTELINHO ─────────────────────────────────────────────────
    await page.keyboard.down('ArrowDown'); await sleep(200); await page.keyboard.up('ArrowDown');
    await sleep(900);
    st = await anvil();
    assert('Saindo de perto, o martelinho volta para o toco', st.forging === false, JSON.stringify(st));

    // ── 7. TIRAR A BARRA; A PEDRA POSTA POR ENGANO ────────────────────────────────────────────
    await standAt(ax, ay + 1, 0, -1);
    await sleep(300);
    await page.evaluate(() => window.__scene.clearHeldItem());
    await press('z');
    st = await anvil();
    assert('O Z tira a barra pronta para a mão', st.carrying === null && st.held === 'iron', JSON.stringify(st));
    await page.evaluate(() => { window.__scene.clearHeldItem(); window.__scene.takeIntoHand('stone'); });
    await press('z');
    st = await anvil();
    assert('Uma pedra também se põe na bigorna', st.carrying === 'stone', JSON.stringify(st));
    await press('z');
    st = await anvil();
    assert('E volta para a mão no Z (a pedra não se malha)', st.carrying === null && st.held === 'stone', JSON.stringify(st));

    // ── 8. A BIGORNA NÃO SE RECOLHE ───────────────────────────────────────────────────────────
    await page.evaluate(() => window.__scene.clearHeldItem());
    await press('x');
    const still = await page.evaluate(() => window.__scene.altars.length);
    assert('A bigorna não se recolhe', still === 1, String(still));
  },
};

// ZERAR — joga a aventura inteira, do titulo aos creditos, com o TECLADO de verdade.
//
// Nada aqui escreve estado no jogo: o cenario so LE o mundo (onde esta cada NPC, cada cogumelo,
// cada canteiro — e o que e solido, para achar caminho) e aperta as teclas que um jogador
// apertaria. Setas andam um tile por vez, Z fala e cuida, X usa o item, I abre a bolsa. Se um
// pedido, o portao, a fogueira ou os creditos quebrarem, e aqui que a partida para.
//
//   abertura → coletora (5 cogumelos) → pintora (2 canteiros regados) → lenhador (4 gravetos)
//   → astronoma (3 pedras) → o portao abre → graveto e cogumelo do jardim → acender → assar
//   → creditos → titulo
const ARROW = { '1,0': 'ArrowRight', '-1,0': 'ArrowLeft', '0,1': 'ArrowDown', '0,-1': 'ArrowUp' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'zerar',
  description: 'Joga do titulo ao fim: abertura, os quatro pedidos, o portao, a fogueira e os creditos.',
  needsGame: false,
  async run({ driver, shot, assert }) {
    const { page } = driver;
    const state = () => page.evaluate(() => window.gameDebug?.getState() ?? null);
    const press = async (key, hold = 70, after = 140) => {
      await page.keyboard.down(key);
      await sleep(hold);
      await page.keyboard.up(key);
      await sleep(after);
    };
    const waitFor = async (pred, label, timeout = 30000) => {
      const t0 = Date.now();
      for (;;) {
        const st = await state();
        if (st && pred(st)) return st;
        if (Date.now() - t0 > timeout) throw new Error(`timeout esperando: ${label}`);
        await sleep(120);
      }
    };
    const free = async () => waitFor((s) => !s.dialogOpen && !s.itemGetOpen && !s.cutsceneActive && !s.bagOpen, 'jogo livre', 60000);

    // Avanca qualquer dialogo e cerimonia de item que estiver na tela, ate o jogo voltar.
    const drain = async (label) => {
      for (let i = 0; i < 80; i += 1) {
        const st = await state();
        if (!st) return;
        if (!st.dialogOpen && !st.itemGetOpen && !st.cutsceneActive) return;
        if (st.dialogOpen || st.itemGetOpen) await press('z', 60, 380);
        else await sleep(250);
      }
      throw new Error(`dialogo/cena nao terminou: ${label}`);
    };

    // O MAPA DE SOLIDOS, lido do jogo (a mesma pergunta que o andar faz).
    const solidGrid = () => page.evaluate(() => {
      const s = window.__scene;
      const rows = [];
      for (let y = 0; y < 60; y += 1) {
        let row = '';
        for (let x = 0; x < 60; x += 1) row += s.isSolidForEntities(x, y) ? '#' : '.';
        rows.push(row);
      }
      return rows;
    });
    const bfs = (grid, from, goals) => {
      const key = (x, y) => `${x},${y}`;
      const goalSet = new Set(goals.map((g) => key(g.x, g.y)));
      const prev = new Map([[key(from.x, from.y), null]]);
      const q = [from];
      while (q.length) {
        const c = q.shift();
        if (goalSet.has(key(c.x, c.y))) {
          const path = [];
          let k = key(c.x, c.y);
          while (k) { const [x, y] = k.split(',').map(Number); path.unshift({ x, y }); k = prev.get(k); }
          return path;
        }
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = c.x + dx; const ny = c.y + dy;
          if (nx < 0 || ny < 0 || nx >= 60 || ny >= 60) continue;
          const k = key(nx, ny);
          if (prev.has(k) || grid[ny][nx] === '#') continue;
          prev.set(k, key(c.x, c.y));
          q.push({ x: nx, y: ny });
        }
      }
      return null;
    };

    const dryTreeTiles = () => page.evaluate(() => window.__scene.dryTrees
      .filter((t) => t.blocking).map((t) => `${t.worldX},${t.worldY}`));

    /**
     * Anda ate um dos tiles `goals`, uma seta por tile, conferindo a posicao a cada passo. Se o
     * caminho estiver fechado por ARVORE SECA (elas rebrotam), e com o machado na mochila, ele
     * abre caminho do jeito que um jogador abriria: encara a arvore e corta.
     */
    const walkTo = async (goals, label) => {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await free();
        const st = await state();
        const from = { x: st.player.worldX, y: st.player.worldY };
        if (goals.some((g) => g.x === from.x && g.y === from.y)) return from;
        const grid = await solidGrid();
        let path = bfs(grid, from, goals);
        let trees = new Set();
        if (!path && st.inventory.some((i) => i.kind === 'axe')) {
          trees = new Set(await dryTreeTiles());
          const open = grid.map((row, y) => [...row].map((c, x) => (trees.has(`${x},${y}`) ? '.' : c)).join(''));
          path = bfs(open, from, goals);
        }
        if (!path) throw new Error(`sem caminho ate ${label}`);
        let ok = true;
        for (let i = 1; i < path.length; i += 1) {
          const a = path[i - 1]; const b = path[i];
          if (trees.has(`${b.x},${b.y}`)) {
            await face(b);
            for (let hit = 0; hit < 8; hit += 1) {
              const still = await page.evaluate(([x, y]) => window.__scene.dryTrees.some((t) => t.worldX === x && t.worldY === y && t.blocking), [b.x, b.y]);
              if (!still) break;
              await press('x', 60, 420);
            }
            ok = false; // re-planeja: o toco abriu e talvez tenha caido um graveto no caminho
            break;
          }
          await press(ARROW[`${b.x - a.x},${b.y - a.y}`], 60, 150);
          const now = await state();
          if (now.itemGetOpen || now.dialogOpen) await drain(`${label} (no caminho)`);
          const after = await state();
          if (after.player.worldX !== b.x || after.player.worldY !== b.y) { ok = false; break; }
        }
        if (ok) return path[path.length - 1];
        await sleep(300);
      }
      throw new Error(`nao consegui chegar em ${label}`);
    };

    /** Vira para um tile vizinho sem andar (a parede/NPC vira o heroi). */
    const face = async (target) => {
      const st = await state();
      const dx = target.x - st.player.worldX; const dy = target.y - st.player.worldY;
      if (Math.abs(dx) + Math.abs(dy) !== 1) throw new Error(`face: ${JSON.stringify(target)} nao e vizinho`);
      if (st.facing.dx === dx && st.facing.dy === dy) return;
      await press(ARROW[`${dx},${dy}`], 40, 200);
      const now = await state();
      if (now.player.worldX !== st.player.worldX || now.player.worldY !== st.player.worldY) {
        throw new Error('face: o heroi andou em vez de virar');
      }
    };

    /**
     * Vai para o lado de um tile alvo e o encara. Contra um tile SOLIDO a seta so vira o heroi;
     * contra um tile LIVRE (o buraco do canteiro) ela anda — entao ali ele chega andando NA
     * direcao do alvo, e o ultimo passo ja o deixa de frente.
     */
    const approach = async (target, label, solid = false) => {
      const grid = await solidGrid();
      const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      // Um NPC fora da janela de streaming nao aparece no mapa de solidos: quem chama sabe.
      if (solid || grid[target.y][target.x] === '#') {
        const sides = dirs.map(([dx, dy]) => ({ x: target.x + dx, y: target.y + dy }))
          .filter((p) => grid[p.y]?.[p.x] === '.');
        await walkTo(sides, label);
        await face(target);
        return;
      }
      const runs = dirs.map(([dx, dy]) => ({
        side: { x: target.x - dx, y: target.y - dy },
        back: { x: target.x - 2 * dx, y: target.y - 2 * dy },
        key: ARROW[`${dx},${dy}`],
      })).filter((r) => grid[r.side.y]?.[r.side.x] === '.' && grid[r.back.y]?.[r.back.x] === '.');
      const at = await walkTo(runs.map((r) => r.back), label);
      const run = runs.find((r) => r.back.x === at.x && r.back.y === at.y);
      await press(run.key, 60, 260);
      const now = await state();
      if (now.player.worldX !== run.side.x || now.player.worldY !== run.side.y) {
        throw new Error(`approach: nao cheguei de frente em ${label}`);
      }
    };

    const NPC = {};

    const talk = async (kind, label) => {
      await approach(NPC[kind], label, true);
      await press('z', 60, 400);
      await waitFor((s) => s.dialogOpen, `dialogo de ${label}`, 8000);
      await drain(label);
    };
    const quest = async (id) => (await page.evaluate((d) => window.gameDebug.quests().find((q) => q.dialog === d), id));
    const count = async (kind) => ((await state()).inventory.find((i) => i.kind === kind)?.count ?? 0);
    const ground = async (kind) => (await state()).groundItems.filter((g) => g.kind === kind);

    /** Escolhe um item na BOLSA: I abre, setas andam, X confirma. */
    const pick = async (kind) => {
      const st = await state();
      if (st.heldItem === kind) return;
      await press('i', 60, 250);
      await waitFor((s) => s.bagOpen, 'bolsa aberta', 4000);
      for (let i = 0; i < 12; i += 1) {
        const order = (await state()).inventory.map((it) => it.kind).filter((k) => !['ore', 'iron', 'charcoal', 'mushroom'].includes(k));
        const want = order.indexOf(kind);
        const cursor = await page.evaluate(() => window.__scene.quickBag.cursor);
        const at = order.indexOf(cursor);
        if (want < 0) throw new Error(`a bolsa nao tem ${kind}`);
        if (at === want) break;
        await press(want > at ? 'ArrowRight' : 'ArrowLeft', 50, 160);
      }
      await press('x', 60, 300);
      const after = await waitFor((s) => !s.bagOpen, 'bolsa fechada', 4000);
      assert(`Bolsa equipa ${kind}`, after.heldItem === kind, `heldItem=${after.heldItem}`);
    };

    // ── 0. TITULO → JOGO ───────────────────────────────────────────────────────────────────
    await page.evaluate(() => { localStorage.removeItem('zh.cozy.v1'); });
    await driver.open('/');
    await sleep(2600);
    await shot('titulo', { note: 'A tela de titulo' });
    await press('Enter', 80, 600);
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    // Ler o mundo e so ler: o mapa de NPCs vem do mesmo arquivo que o jogo carregou.
    await page.evaluate(async () => { window.__worldData = await (await fetch('/world.json')).json(); });
    Object.assign(NPC, await page.evaluate(() => {
      const out = {};
      for (const c of window.__worldData.chunks) for (const n of c.npcs) out[n.type] = { x: n.worldX, y: n.worldY };
      return out;
    }));

    // ── 1. A ABERTURA ──────────────────────────────────────────────────────────────────────
    const born = await state();
    assert('A abertura toca ao comecar uma jornada', born.cutsceneActive && !born.introDone, JSON.stringify({ cut: born.cutsceneActive, intro: born.introDone }));
    assert('Nao ha vida, nem morte, no estado do jogo', born.health === undefined && born.isDead === undefined, '');
    await sleep(6000);
    await shot('abertura-espada', { note: 'A espada fincada na estrada' });
    await waitFor((s) => s.dialogOpen, 'o mago falar', 30000);
    await sleep(1200);
    await shot('abertura-mago', { note: 'O mago chega e fala' });
    await drain('abertura');
    const afterIntro = await free();
    assert('A abertura termina com o controle de volta', afterIntro.introDone === true, '');
    await shot('abertura-fim', { note: 'O controle volta, o mago fica na estrada' });

    // ── 2. A COLETORA: cinco cogumelos ─────────────────────────────────────────────────────
    await talk('radiationSuit', 'a coletora');
    for (let n = 0; n < 6 && (await count('mushroom')) < 5; n += 1) {
      const st = await state();
      const shrooms = (await ground('mushroom'))
        // o do jardim fica para o fim (e o portao ainda esta fechado)
        .filter((m) => !(Math.abs(m.worldX - 30) <= 5 && Math.abs(m.worldY - 30) <= 5))
        .sort((a, b) => Math.hypot(a.worldX - st.player.worldX, a.worldY - st.player.worldY)
          - Math.hypot(b.worldX - st.player.worldX, b.worldY - st.player.worldY));
      if (!shrooms.length) break;
      await walkTo([{ x: shrooms[0].worldX, y: shrooms[0].worldY }], 'um cogumelo');
      await sleep(250);
      await drain('cerimonia do cogumelo');
    }
    assert('Cinco cogumelos na mochila', (await count('mushroom')) >= 5, `mushroom=${await count('mushroom')}`);
    await talk('radiationSuit', 'a coletora (entrega)');
    assert('O pedido da coletora fechou', (await quest('radiationSuit')).done, JSON.stringify(await quest('radiationSuit')));
    await shot('coletora-ok', { note: 'A coletora agradece' });

    // ── 3. A PINTORA: dois canteiros que brotam ────────────────────────────────────────────
    await talk('painter', 'a pintora');
    assert('A pintora deu sementes e balde', (await count('seeds')) >= 2 && (await count('bucket')) >= 1, JSON.stringify((await state()).inventory));
    const holes = (await state()).plantSpots.filter((p) => p.state === 'hole').slice(0, 2);
    for (const hole of holes) {
      await pick('seeds');
      await approach({ x: hole.worldX, y: hole.worldY }, 'um buraco');
      await press('x', 60, 500);
    }
    // sai de cima/da frente para o monte se erguer, e rega cada um com agua do lago
    const findWater = () => page.evaluate(() => {
      const s = window.__scene; const out = [];
      for (let y = 0; y < 60; y += 1) for (let x = 0; x < 60; x += 1) if (s.isOpenWaterAt(x, y)) out.push({ x, y });
      return out;
    });
    const water = await findWater();
    for (const hole of holes) {
      await pick('bucket');
      const st = await state();
      const grid = await solidGrid();
      // o lado seco de alguma agua, o mais perto
      const shores = [];
      for (const w of water) {
        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
          const p = { x: w.x + dx, y: w.y + dy };
          if (grid[p.y]?.[p.x] === '.') shores.push({ ...p, w });
        }
      }
      shores.sort((a, b) => Math.hypot(a.x - st.player.worldX, a.y - st.player.worldY) - Math.hypot(b.x - st.player.worldX, b.y - st.player.worldY));
      const shore = await walkTo(shores.slice(0, 40), 'a beira da agua');
      const w = shores.find((s) => s.x === shore.x && s.y === shore.y).w;
      await face(w);
      await press('x', 60, 600);
      assert('O balde encheu', (await state()).heldItem === 'bucketFull', `held=${(await state()).heldItem}`);
      await waitFor((s) => s.plantSpots.some((p) => p.worldX === hole.worldX && p.worldY === hole.worldY && p.state === 'mound'), 'o monte subir', 10000);
      await approach({ x: hole.worldX, y: hole.worldY }, 'o monte');
      await press('x', 60, 900);
    }
    await waitFor((s) => s.plantSpots.filter((p) => p.state === 'grown').length >= 2, 'os canteiros brotarem', 20000);
    await shot('pintora-canteiros', { note: 'Os dois canteiros brotaram' });
    await drain('brotou');
    await talk('painter', 'a pintora (obrigado)');
    assert('O pedido da pintora fechou', (await quest('painter')).done, JSON.stringify(await quest('painter')));

    // ── 4. O LENHADOR: quatro gravetos ─────────────────────────────────────────────────────
    await talk('businessMan', 'o lenhador');
    assert('O lenhador deu o machado', (await count('axe')) >= 1, '');
    const dryTrees = () => page.evaluate(() => window.__scene.dryTrees
      .filter((t) => t.blocking).map((t) => ({ x: t.worldX, y: t.worldY })));
    for (let n = 0; n < 8 && (await count('wood')) < 4; n += 1) {
      const st = await state();
      // gravetos ja caidos primeiro
      const sticks = (await ground('wood')).filter((w) => Math.hypot(w.worldX - st.player.worldX, w.worldY - st.player.worldY) < 14
        && !(Math.abs(w.worldX - 30) <= 5 && Math.abs(w.worldY - 30) <= 5));
      if (sticks.length) {
        sticks.sort((a, b) => Math.hypot(a.worldX - st.player.worldX, a.worldY - st.player.worldY) - Math.hypot(b.worldX - st.player.worldX, b.worldY - st.player.worldY));
        await walkTo([{ x: sticks[0].worldX, y: sticks[0].worldY }], 'um graveto');
        await drain('graveto');
        continue;
      }
      const trees = (await dryTrees()).sort((a, b) => Math.hypot(a.x - st.player.worldX, a.y - st.player.worldY) - Math.hypot(b.x - st.player.worldX, b.y - st.player.worldY));
      await approach(trees[0], 'uma arvore seca');
      for (let hit = 0; hit < 8; hit += 1) {
        const still = await page.evaluate(([x, y]) => window.__scene.dryTrees.some((t) => t.worldX === x && t.worldY === y && t.blocking), [trees[0].x, trees[0].y]);
        if (!still) break;
        await press('x', 60, 420);
      }
      await sleep(600);
    }
    assert('Quatro gravetos na mochila', (await count('wood')) >= 4, `wood=${await count('wood')}`);
    await talk('businessMan', 'o lenhador (entrega)');
    assert('O pedido do lenhador fechou', (await quest('businessMan')).done, JSON.stringify(await quest('businessMan')));

    // ── 5. A ASTRONOMA: tres pedras ────────────────────────────────────────────────────────
    await talk('astronaut', 'a astronoma');
    assert('A astronoma deu a picareta', (await count('pickaxe')) >= 1, '');
    const rocks = () => page.evaluate(() => window.__scene.rocks
      .filter((r) => r.blocking && !r.ore).map((r) => ({ x: r.worldX, y: r.worldY })));
    for (let n = 0; n < 10 && (await count('stone')) < 3; n += 1) {
      const st = await state();
      const stones = (await ground('stone')).filter((w) => Math.hypot(w.worldX - st.player.worldX, w.worldY - st.player.worldY) < 14);
      if (stones.length) {
        await walkTo([{ x: stones[0].worldX, y: stones[0].worldY }], 'uma pedra');
        await drain('pedra');
        continue;
      }
      const list = (await rocks()).sort((a, b) => Math.hypot(a.x - st.player.worldX, a.y - st.player.worldY) - Math.hypot(b.x - st.player.worldX, b.y - st.player.worldY));
      await approach(list[0], 'uma rocha');
      for (let hit = 0; hit < 6; hit += 1) {
        const still = await page.evaluate(([x, y]) => window.__scene.rocks.some((r) => r.worldX === x && r.worldY === y && r.blocking), [list[0].x, list[0].y]);
        if (!still) break;
        await press('x', 60, 650);
      }
      await sleep(600);
    }
    assert('Tres pedras na mochila', (await count('stone')) >= 3, `stone=${await count('stone')}`);
    await talk('astronaut', 'a astronoma (entrega)');
    await sleep(1200);
    await drain('o portao');
    const gate = await state();
    assert('O ultimo pedido abriu o portao do jardim', gate.ending.gateOpen === true, JSON.stringify(gate.ending));
    assert('Todos os pedidos fecharam', (await page.evaluate(() => window.gameDebug.quests().every((q) => q.done))), '');

    // ── 6. O JARDIM ────────────────────────────────────────────────────────────────────────
    const garden = await page.evaluate(() => ({
      hearth: window.__worldData.props.find((p) => p.type === 'hearth'),
    }));
    const hearth = { x: garden.hearth.worldX, y: garden.hearth.worldY };
    for (const kind of ['wood', 'mushroom']) {
      const inside = (await ground(kind)).filter((g) => Math.abs(g.worldX - hearth.x) <= 4 && Math.abs(g.worldY - hearth.y) <= 4);
      if (inside.length) {
        await walkTo([{ x: inside[0].worldX, y: inside[0].worldY }], `o ${kind} do jardim`);
        await drain(kind);
      }
    }
    await approach(hearth, 'a fogueira do fim');
    await shot('jardim', { note: 'Diante da fogueira apagada, dentro do jardim' });
    await press('z', 60, 300);
    await waitFor((s) => s.ending.hearthLit && !s.cutsceneActive, 'a fogueira acender', 15000);
    await shot('fogueira-acesa', { note: 'A fogueira do fim acesa' });
    await press('z', 60, 300);
    await waitFor((s) => s.ending.roasted, 'comecar a assar', 8000);
    await sleep(6500);
    await shot('assando', { note: 'O cogumelo no espeto, sobre a chama' });
    await waitFor((s) => s.dialogOpen, 'a ultima fala', 30000);
    // A cena do fim nao "termina": ela emenda nos creditos. Avanca so a fala.
    for (let i = 0; i < 20 && (await state())?.dialogOpen; i += 1) await press('z', 60, 450);
    await page.waitForFunction(() => Boolean(document.querySelector('.zh-credits')), null, { timeout: 20000 });
    await sleep(4200);
    await shot('the-end', { note: 'The End' });
    await sleep(9000);
    await shot('creditos', { note: 'Os creditos subindo' });
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene !== 'game' && !document.querySelector('.zh-credits'), null, { timeout: 60000 });
    await sleep(1500);
    await shot('titulo-depois', { note: 'De volta ao titulo' });
    assert('Os creditos terminam no titulo', !(await page.evaluate(() => Boolean(window.gameDebug))), '');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('zh.cozy.v1') ?? '{}'));
    assert('O fim fica no save', saved.endingSeen === true, JSON.stringify({ endingSeen: saved.endingSeen }));
  },
};

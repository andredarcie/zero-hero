// TELESCOPIO — joga a quest inteira da Thea, de um jogo novo até o obrigado, com as teclas de um
// jogador (setas, Z, X) e o mouse no polimento. Só LÊ o jogo para achar caminho e saber o que está na
// mão. Nada é teleportado nem dado de graça: ferro, vidro e noite saem do jeito que o jogador faz.
// O tempo de cada etapa fica em playtest/results/telescopio-marcas.json.
//
//   PLAYTEST_BASE_URL=http://localhost:5180 PLAYTEST_SLOWMO=0 npm run playtest -- telescopio
import fs from 'node:fs';
import path from 'node:path';
import { canStepCodes } from '../../scripts/relevo.mjs';

const ARROW = { '1,0': 'ArrowRight', '-1,0': 'ArrowLeft', '0,1': 'ArrowDown', '0,-1': 'ArrowUp' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];

const THEA = { x: 41, y: 5 };
// O forno da Thea é FIXO, ao lado da bancada (scripts/forno-da-vega.mjs), e é ele que guia a quest.
const FURNACE = { x: 44, y: 6 };
const SPOT = { x: 32, y: 20 };
// O carvão e o minério moram na margem do lago de lava, a oeste (scripts/pedras-na-lava.mjs): o veio PRETO
// dá carvão, o vermelho dá minério. Nada da Thea depende de outro vizinho (nem do machado do Marco).
const COAL = { x: 10, y: 6 };
const VEIN = { x: 11, y: 7 };

/**
 * A QUEST DA THEA INTEIRA, jogada: o `telescopio` a joga numa partida nova, e o `zerar` no meio da partida dele
 * (`skipOpening`: o herói já está livre no mundo, onde estiver).
 */
export const playThea = async ({ driver, shot, assert, skipOpening = false }) => {
  const { page } = driver;
  const T0 = Date.now();
  const marks = [];
  const mark = (name) => { marks.push({ name, s: (Date.now() - T0) / 1000 }); console.log(`[telescopio ${((Date.now() - T0) / 1000).toFixed(1)}s] ${name}`); };
  const state = () => page.evaluate(() => window.gameDebug?.getState() ?? null);
  const stage = () => page.evaluate(() => window.__scene.questSetup.astronomerQuest?.save.stage);

  const gridStep = (key) => page.evaluate(([name, code]) => new Promise((resolve) => {
    const s = window.__scene;
    const fire = (type) => {
      const e = new KeyboardEvent(type, { key: name, code: name, bubbles: true });
      Object.defineProperty(e, 'keyCode', { get: () => code });
      window.dispatchEvent(e);
    };
    const fromX = s.playerWorld.worldX; const fromY = s.playerWorld.worldY;
    const t0 = performance.now();
    fire('keydown');
    const settle = () => {
      const v = s.verbs.heroVisualTile();
      if ((Math.abs(v.x - s.playerWorld.worldX) < 0.02 && Math.abs(v.y - s.playerWorld.worldY) < 0.02) || performance.now() - t0 > 1500) resolve();
      else requestAnimationFrame(settle);
    };
    const tick = () => {
      const moved = s.playerWorld.worldX !== fromX || s.playerWorld.worldY !== fromY;
      if (moved || performance.now() - t0 > 220) { fire('keyup'); settle(); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }), [key, { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39 }[key]]);
  const press = async (key, hold = 70, after = 140) => {
    if (key.startsWith('Arrow')) { await gridStep(key); await sleep(after); return; }
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
  const pageWait = async (fn, arg, label, timeout = 30000) => {
    const t0 = Date.now();
    for (;;) {
      if (await page.evaluate(fn, arg)) return;
      if (Date.now() - t0 > timeout) throw new Error(`timeout esperando: ${label}`);
      await sleep(120);
    }
  };
  const free = () => waitFor((s) => !s.dialogOpen && !s.itemGetOpen && !s.cutsceneActive, 'jogo livre', 60000);
  const drain = async (label) => {
    for (let i = 0; i < 120; i += 1) {
      const st = await state();
      if (!st) return;
      if (!st.dialogOpen && !st.itemGetOpen && !st.cutsceneActive) return;
      if (st.dialogOpen || st.itemGetOpen) await press('z', 60, 380);
      else await sleep(250);
    }
    throw new Error(`dialogo/cena nao terminou: ${label}`);
  };

  const solidGrid = () => page.evaluate(() => {
    const s = window.__scene;
    const rows = [];
    for (let y = 0; y < 60; y += 1) {
      let row = '';
      for (let x = 0; x < 60; x += 1) row += s.query.isSolidForEntities(x, y) ? '#' : '.';
      rows.push(row);
    }
    return rows;
  });
  let reliefGrid = null;
  // A regra de passo do jogo (scripts/relevo.mjs, a mesma de world/relief.ts), com o cume e as escadas dele.
  const canStep = (fx, fy, tx, ty) => (reliefGrid ? canStepCodes(reliefGrid[fy][fx], reliefGrid[ty][tx], tx - fx, ty - fy) : true);

  const bfs = (grid, from, goals, avoid = new Set()) => {
    const key = (x, y) => `${x},${y}`;
    const goalSet = new Set(goals.map((g) => key(g.x, g.y)));
    const prev = new Map([[key(from.x, from.y), null]]);
    const q = [from];
    while (q.length) {
      const c = q.shift();
      if (goalSet.has(key(c.x, c.y))) {
        const out = [];
        let k = key(c.x, c.y);
        while (k) { const [x, y] = k.split(',').map(Number); out.unshift({ x, y }); k = prev.get(k); }
        return out;
      }
      for (const [dx, dy] of DIRS) {
        const nx = c.x + dx; const ny = c.y + dy;
        if (nx < 0 || ny < 0 || nx >= 60 || ny >= 60) continue;
        const k = key(nx, ny);
        if (prev.has(k) || grid[ny][nx] === '#' || !canStep(c.x, c.y, nx, ny)) continue;
        if (avoid.has(k) && !goalSet.has(k)) continue;
        prev.set(k, key(c.x, c.y));
        q.push({ x: nx, y: ny });
      }
    }
    return null;
  };

  const walkTo = async (goals, label) => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await free();
      const st = await state();
      const from = { x: st.player.worldX, y: st.player.worldY };
      if (goals.some((g) => g.x === from.x && g.y === from.y)) return from;
      const grid = await solidGrid();
      const avoid = st.heldItem === 'none' ? new Set(st.groundItems.map((g) => `${g.worldX},${g.worldY}`)) : new Set();
      const way = bfs(grid, from, goals, avoid) ?? bfs(grid, from, goals);
      if (!way) throw new Error(`sem caminho ate ${label} (de ${from.x},${from.y})`);
      let ok = true;
      for (let i = 1; i < way.length; i += 1) {
        const a = way[i - 1]; const b = way[i];
        await press(ARROW[`${b.x - a.x},${b.y - a.y}`], 60, 40);
        const now = await state();
        if (now.itemGetOpen || now.dialogOpen) await drain(`${label} (no caminho)`);
        const after = await state();
        if (after.player.worldX !== b.x || after.player.worldY !== b.y) { ok = false; console.log(`[telescopio] passo recusado: de ${a.x},${a.y} para ${b.x},${b.y}, parei em ${after.player.worldX},${after.player.worldY}, tentativa ${attempt}`); break; }
      }
      if (ok) return way[way.length - 1];
      await sleep(250);
    }
    throw new Error(`nao consegui chegar em ${label} (parei em ${JSON.stringify((await state()).player)}, faltava ${JSON.stringify(goals)})`);
  };

  const face = async (target) => {
    const st = await state();
    const dx = target.x - st.player.worldX; const dy = target.y - st.player.worldY;
    if (Math.abs(dx) + Math.abs(dy) !== 1) throw new Error(`face: ${JSON.stringify(target)} nao e vizinho de ${st.player.worldX},${st.player.worldY}`);
    if (st.facing.dx === dx && st.facing.dy === dy) return;
    await press(ARROW[`${dx},${dy}`], 40, 170);
  };

  const approachSolid = async (target, label) => {
    const grid = await solidGrid();
    const sides = DIRS.map(([dx, dy]) => ({ x: target.x + dx, y: target.y + dy }))
      .filter((p) => grid[p.y]?.[p.x] === '.' && canStep(p.x, p.y, target.x, target.y));
    if (!sides.length) throw new Error(`${label}: nenhum lado livre`);
    await walkTo(sides, label);
    await face(target);
  };

  /** Chega de frente num tile LIVRE: anda na direção dele e para um antes. */
  const approachFree = async (target, label) => {
    const grid = await solidGrid();
    const runs = DIRS.map(([dx, dy]) => ({
      side: { x: target.x - dx, y: target.y - dy },
      back: { x: target.x - 2 * dx, y: target.y - 2 * dy },
      key: ARROW[`${dx},${dy}`],
    })).filter((r) => grid[r.side.y]?.[r.side.x] === '.' && grid[r.back.y]?.[r.back.x] === '.');
    if (!runs.length) throw new Error(`${label}: sem corredor para chegar de frente`);
    const at = await walkTo(runs.map((r) => r.back), label);
    const run = runs.find((r) => r.back.x === at.x && r.back.y === at.y);
    await press(run.key, 60, 200);
  };

  const groundTile = async (kind) => {
    const st = await state();
    const it = st.groundItems.find((i) => i.kind === kind);
    return it ? { x: it.worldX, y: it.worldY } : null;
  };

  /** A coisa do tile vai para a mão: com a mão cheia o Z TROCA; vazia, o Z pega o que está debaixo. */
  const take = async (kind, label) => {
    const target = await groundTile(kind);
    if (!target) throw new Error(`nao ha ${kind} no chao`);
    const st = await state();
    if (st.heldItem === 'none') { await walkTo([target], label); await press('z', 60, 300); }
    else {
      // De frente, se houver corredor; senão, pisa em cima: o Z troca o que está debaixo do herói.
      try { await approachFree(target, label); } catch { await walkTo([target], `${label} (por cima)`); }
      await press('z', 60, 300);
    }
    await drain(`${label} (cerimonia)`);
    const now = await free();
    assert(`Na mao: ${kind}`, now.heldItem === kind, `heldItem=${now.heldItem}`);
  };


  const talk = async (who, label) => {
    await approachSolid(who, label);
    await press('z', 60, 400);
    await waitFor((s) => s.dialogOpen, `dialogo: ${label}`, 8000);
    await drain(label);
    await free();
  };


  const waitGround = async (kind, label, timeout = 30000) => {
    const t0 = Date.now();
    for (;;) {
      const tile = await groundTile(kind);
      if (tile) return tile;
      if (Date.now() - t0 > timeout) throw new Error(`timeout: ${label}`);
      await sleep(200);
    }
  };


  if (!skipOpening) {
  // ── TÍTULO → ABERTURA ──────────────────────────────────────────────────────────────────
  await page.evaluate(() => { localStorage.removeItem('zh.cozy.v1'); });
  await driver.open('/');
  await sleep(2600);
  await press('Enter', 80, 600);
  await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
  await waitFor((s) => s.dialogOpen || (s.introDone && !s.cutsceneActive), 'a abertura acabar', 90000);
  await drain('abertura');
  await free();
  mark('abertura terminou');
  }
  reliefGrid = await page.evaluate(async () => {
    // A URL que o jogo carregou: outra (sem o ?t= do vite) daria uma segunda cópia do módulo, com o mundo vazio.
    const url = performance.getEntriesByType('resource').map((e) => e.name).find((u) => u.includes('/world/WorldData.ts'));
    const { getTileRelief } = await import(url);
    return Array.from({ length: 60 }, (_, y) => Array.from({ length: 60 }, (__, x) => getTileRelief(x, y)));
  });

  // ── 1. O PEDIDO ────────────────────────────────────────────────────────────────────────
  await walkTo([{ x: THEA.x, y: THEA.y + 2 }], 'perto da Thea');
  mark('chegou na Thea');
  await shot('01-thea-antes', { note: 'A Thea, sem nada em volta' });
  await talk(THEA, 'o pedido');
  let st = await free();
  assert('A Thea deu a picareta', st.heldItem === 'pickaxe', `heldItem=${st.heldItem}`);
  assert('Etapa: ferro', (await stage()) === 'iron', await stage());
  mark('pedido feito');

  // O FORNO GUIA: com o que ele pede na mão, o Z entrega; ele nunca abre catálogo.
  const ovenAsks = () => page.evaluate(() => window.__scene.questSetup.astronomerQuest?.furnaceNeed() ?? null);
  const feed = async (kind, label) => {
    await approachSolid(FURNACE, `o forno (${label})`);
    await sleep(300);
    const icon = await page.evaluate(() => window.__scene.forge.furnaceAsk?.visibleIcon ?? null);
    assert(`O forno pede ${kind} no balão`, icon !== null, `icone=${icon}`);
    await press('z', 60, 500);
    await sleep(500);
    const s2 = await free();
    assert(`Entregou ${label} ao forno`, s2.heldItem === 'none', `heldItem=${s2.heldItem}`);
  };

  // ── 2. O FORNO PEDE CARVÃO: com a picareta na mão ele recusa ───────────────────────────
  const loose = (await state()).groundItems.filter((g) => g.kind === 'wood' || g.kind === 'stone');
  assert('Nenhum graveto nem pedra solto no vale', loose.length === 0, JSON.stringify(loose));
  assert('O forno pede carvão primeiro', (await ovenAsks()) === 'charcoal', String(await ovenAsks()));
  await approachSolid(FURNACE, 'o forno com a picareta');
  await shot('02-forno', { note: 'O forno fixo da Thea pedindo carvão' });
  await press('z', 60, 500);
  st = await free();
  assert('O forno recusa o que ele não pediu', st.heldItem === 'pickaxe', `heldItem=${st.heldItem}`);
  const furnaceCatalog = await page.evaluate(() => Boolean(window.__scene.orders.orderOverlay));
  assert('O forno não abre catálogo', !furnaceCatalog, String(furnaceCatalog));

  // ── 3. O CARVÃO, NO LAGO DE LAVA: o veio preto, a picareta ──────────────────────────────
  const coalKind = await page.evaluate(([x, y]) => window.__scene.query.getRockAt(x, y)?.product ?? null, [COAL.x, COAL.y]);
  assert('A pedra de veio preto dá carvão', coalKind === 'charcoal', String(coalKind));
  await approachSolid(COAL, 'o veio de carvão');
  await shot('03-veio-de-carvao', { note: 'A pedra de carvão na margem do lago de lava' });
  for (let i = 0; i < 12 && !(await groundTile('charcoal')); i += 1) await press('x', 60, 620);
  await sleep(900);
  await take('charcoal', 'o carvão');
  await feed('charcoal', 'o carvão');
  await sleep(2500);
  assert('Com o carvão aceso, ele pede o minério', (await ovenAsks()) === 'ore', String(await ovenAsks()));
  assert('O forno fica em brasa esperando', await page.evaluate(() => window.__scene.props.furnaces[0]?.kindled === true), '');
  await shot('04-carvao', { note: 'O carvao aceso dentro do forno' });
  mark('carvao');

  // ── 4. O MINÉRIO, NO MESMO LAGO ─────────────────────────────────────────────────────────
  await take('pickaxe', 'a picareta');
  await approachSolid(VEIN, 'o veio');
  for (let i = 0; i < 12 && !(await groundTile('ore')); i += 1) await press('x', 60, 620);
  await sleep(900);
  await take('ore', 'o minerio');
  mark('minerio');
  await feed('ore', 'o minério');
  const bloomAt = await waitGround('bloom', 'a esponja sair', 30000);
  await shot('05-esponja', { note: 'A esponja de ferro saiu pela boca do forno' });
  await drain('a esponja');
  void bloomAt;
  // A BIGORNA (pedido do autor): a esponja só vira barra na bigorna fixa ao lado do forno — no chão, não.
  await take('bloom', 'a esponja');
  const ANVIL = await page.evaluate(() => ({ x: window.__scene.props.altars[0].worldX, y: window.__scene.props.altars[0].worldY }));
  await approachSolid(ANVIL, 'a bigorna');
  await press('z', 60, 500);
  const onAnvil = () => page.evaluate(() => window.__scene.props.altars[0].carrying);
  assert('A esponja está em cima da bigorna', (await onAnvil()) === 'bloom', String(await onAnvil()));
  await shot('05b-bigorna', { note: 'A esponja em cima da bigorna, ao lado do forno' });
  for (let i = 0; i < 8 && (await onAnvil()) === 'bloom'; i += 1) await press('x', 60, 700);
  assert('Malhada na bigorna, a esponja virou barra', (await onAnvil()) === 'iron' || (await stage()) === 'glass', String(await onAnvil()));
  mark('barra de ferro');
  // A Thea vem buscar a barra na bigorna, diz que vai fazer o tripé e volta.
  for (let i = 0; i < 60 && (await stage()) !== 'glass'; i += 1) {
    const st = await state();
    if (st.dialogOpen) await press('z', 60, 300);
    else await sleep(300);
  }
  await drain('a Thea buscando a barra');
  for (let i = 0; i < 40 && (await state()).cutsceneActive; i += 1) await sleep(300);
  assert('A Thea buscou a barra na bigorna (etapa: vidro)', (await stage()) === 'glass', await stage());
  assert('A bigorna ficou vazia e o martelinho voltou para o toco', (await onAnvil()) === null && !(await page.evaluate(() => Boolean(window.__scene.forge.forging))), String(await onAnvil()));
  await shot('06-tripe', { note: 'O tripe e a cinza ao lado da Thea' });
  mark('tripe');

  // ── 5. O VIDRO: areia só no lago grande do sul, cinza ao lado dela ─────────────────────
  const camp = await page.evaluate(() => {
    const q = window.__scene.questSetup.astronomerQuest;
    return { sand: q.sandTile, ash: q.ashTile };
  });
  assert('A areia está na beira do lago grande do sul', camp.sand && camp.sand.y >= 48, JSON.stringify(camp.sand));
  assert('O forno pede areia', (await ovenAsks()) === 'sand', String(await ovenAsks()));
  await approachSolid(camp.sand, 'a areia');
  await shot('07-areia', { note: 'O monte de areia na beira do lago grande' });
  await press('z', 60, 400);
  await drain('a areia');
  st = await free();
  assert('Areia na mao', st.heldItem === 'sand', `heldItem=${st.heldItem}`);
  mark('areia');
  await feed('sand', 'a areia');
  assert('Depois da areia, ele pede a cinza', (await ovenAsks()) === 'ash', String(await ovenAsks()));
  await approachSolid(camp.ash, 'a cinza');
  await press('z', 60, 400);
  await drain('a cinza');
  st = await free();
  assert('Cinza na mao', st.heldItem === 'ash', `heldItem=${st.heldItem}`);
  await feed('ash', 'a cinza');
  await waitGround('glass', 'o vidro sair', 30000);
  await shot('08-vidro', { note: 'O vidro saiu do forno' });
  await take('glass', 'o vidro');
  mark('vidro');

  // ── 6. A LENTE: o mouse esfrega de verdade ─────────────────────────────────────────────
  await approachSolid(THEA, 'o vidro para a Thea');
  await press('z', 60, 400);
  await waitFor((s) => s.dialogOpen, 'a Thea falar do vidro', 8000);
  // Fechada a fala, o polimento abre com o mundo congelado: aqui o Z não pode mais ir para o jogo.
  for (let i = 0; i < 40 && (await state()).dialogOpen; i += 1) await press('z', 60, 380);
  await pageWait(() => Boolean(window.__scene.questSetup.astronomerQuest?.overlay), null, 'o polimento abrir', 6000);
  mark('polimento abriu');
  await sleep(500);
  await shot('09-lente-bruta', { note: 'O vidro bruto' });
  const box = await page.evaluate(() => {
    const r = window.__scene.questSetup.astronomerQuest.overlay.canvas.getBoundingClientRect();
    return { x: r.left, y: r.top, s: r.width / 200 };
  });
  const lens = (px, py) => ({ x: box.x + px * box.s, y: box.y + py * box.s });
  const start = lens(100, 72);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  let shotFine = false;
  for (let i = 0; i < 2400; i += 1) {
    const live = await page.evaluate(() => {
      const o = window.__scene.questSetup.astronomerQuest?.overlay;
      return o ? { phase: o.phase, left: o.remaining } : null;
    });
    if (!live || live.phase === 'shine') break;
    if (live.phase === 'fine' && !shotFine) { shotFine = true; await shot('10-lente-fina', { note: 'Pedra fina: a nevoa' }); }
    const radius = 8 + ((i * 0.9) % 46);
    const at = lens(100 + Math.cos(i * 0.5) * radius, 72 + Math.sin(i * 0.5) * radius);
    await page.mouse.move(at.x, at.y);
    await sleep(8);
  }
  await page.mouse.up();
  await sleep(400);
  await shot('11-lente-pronta', { note: 'A lente nitida' });
  await pageWait(() => !window.__scene.questSetup.astronomerQuest?.overlay, null, 'o polimento acabar', 6000);
  await drain('o telescopio');
  st = await free();
  assert('O telescopio nas costas', st.heldItem === 'telescope', `heldItem=${st.heldItem}`);
  assert('Etapa: levar', (await stage()) === 'carry', await stage());
  await shot('12-telescopio', { note: 'O telescopio nas costas' });
  mark('lente pronta');

  // ── 7. O PLANALTO ──────────────────────────────────────────────────────────────────────
  await approachSolid(SPOT, 'o marco no planalto');
  await shot('13-marco', { note: 'O marco no planalto' });
  await press('z', 60, 700);
  assert('Etapa: noite', (await stage()) === 'night', await stage());
  await shot('14-telescopio-de-pe', { note: 'O telescopio de pe' });
  mark('telescopio no planalto');

  // ── 8. A NOITE: o Z de dia senta o herói, e o tempo corre ──────────────────────────────
  st = await free();
  console.log(`[telescopio] hora ao chegar: ${st.timeOfDay.clock} (${st.timeOfDay.phase})`);
  await press('z', 60, 3600);
  await shot('15-esperando', { note: 'Sentado com a caneca, e a Thea ao lado' });
  await pageWait(() => window.__scene.questSetup.astronomerQuest?.overlay?.aim !== undefined, null, 'a ocular abrir de noite', 240000);
  mark('ocular abriu');
  await sleep(1500);
  await shot('16-ocular', { note: 'A ocular, antes de achar nada' });

  // ── 9. OS QUATRO ALVOS, nas setas ──────────────────────────────────────────────────────
  const POS = { moon: { x: 92, y: 212 }, pleiades: { x: 342, y: 236 }, jupiter: { x: 372, y: 66 }, saturn: { x: 66, y: 54 } };
  const hold = async (key, done) => {
    await page.keyboard.down(key);
    for (let i = 0; i < 400 && !(await done()); i += 1) await sleep(16);
    await page.keyboard.up(key);
  };
  const aim = () => page.evaluate(() => {
    const o = window.__scene.questSetup.astronomerQuest.overlay;
    return { x: o.aim.x, y: o.aim.y };
  });
  for (const target of ['saturn', 'moon', 'pleiades', 'jupiter']) {
    const pos = POS[target];
    let a = await aim();
    if (Math.abs(a.x - pos.x) > 5) await hold(a.x < pos.x ? 'ArrowRight' : 'ArrowLeft', async () => Math.abs((await aim()).x - pos.x) <= 5);
    a = await aim();
    if (Math.abs(a.y - pos.y) > 5) await hold(a.y < pos.y ? 'ArrowDown' : 'ArrowUp', async () => Math.abs((await aim()).y - pos.y) <= 5);
    await sleep(350);
    await shot(`17-foco-${target}`, { note: `Focando: ${target}` });
    await pageWait((id) => window.__scene.questSetup.astronomerQuest?.overlay?.reading === id, target, `a ficha: ${target}`, 6000);
    await sleep(4500);
    await shot(`18-ficha-${target}`, { note: `A ficha: ${target}` });
    mark(`achou ${target}`);
    await press('z', 60, 500);
  }

  // ── 10. A THEA SOBE ────────────────────────────────────────────────────────────────────
  await waitFor((s) => s.dialogOpen, 'a Thea falar', 60000);
  await shot('19-thea-subiu', { note: 'A Thea subiu e sentou' });
  mark('thea subiu');
  await drain('a despedida');
  await pageWait(() => window.__scene.questSetup.astronomerQuest?.isDone === true, null, 'a quest fechar', 15000);
  st = await free();
  const quest = await page.evaluate(() => window.gameDebug.quests().find((q) => q.dialog === 'astronaut'));
  assert('A quest da Thea fechou', quest.done === true, JSON.stringify(quest));
  await sleep(1200);
  await shot('20-fim', { note: 'O telescopio fica no planalto' });
  mark('quest fechada');

  // Thea foi embora: a casa dela fica vazia, e o tile, livre.
  assert('A Thea nao esta mais em casa', !(await page.evaluate(([x, y]) => window.__scene.query.isSolidForEntities(x, y), [THEA.x, THEA.y])), 'o tile dela continua ocupado');
  mark('obrigado');

  return { marks, state, press, free };
};

export default {
  name: 'telescopio',
  description: 'A quest da Thea completa, do título ao obrigado, com polimento e observação jogados.',
  needsGame: false,
  async run({ driver, shot, assert }) {
    const { page } = driver;
    const { marks, press, free } = await playThea({ driver, shot, assert });
    // ── VOLTANDO DO SAVE: tudo continua lá ─────────────────────────────────────────────────
    await page.evaluate(() => window.__scene.save.persistAdventure());
    await driver.open('/');
    await sleep(2600);
    await press('Enter', 80, 1200);
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await free();
    const after = await page.evaluate(([x, y]) => ({
      stage: window.__scene.questSetup.astronomerQuest?.save.stage,
      solid: window.__scene.query.isSolidForEntities(x, y),
    }), [SPOT.x, SPOT.y]);
    assert('O save lembra a quest fechada', after.stage === 'done', JSON.stringify(after));
    assert('O telescopio continua no planalto', after.solid === true, JSON.stringify(after));
    assert('O save lembra que ela foi embora', await page.evaluate(() => window.__scene.questSetup.astronomerQuest?.save.departed === true), 'departed falso');

    fs.writeFileSync(path.resolve('playtest/results/telescopio-marcas.json'), JSON.stringify(marks, null, 2));
    assert('Sem erro no console', driver.consoleErrors.length === 0, driver.consoleErrors.slice(0, 3).join(' | '));
  },
};

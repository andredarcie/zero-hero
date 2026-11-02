// TELESCOPIO — joga a quest inteira da Vega, de um jogo novo até o obrigado, com as teclas de um
// jogador (setas, Z, X) e o mouse no polimento. Só LÊ o jogo para achar caminho e saber o que está na
// mão. Nada é teleportado nem dado de graça: ferro, vidro e noite saem do jeito que o jogador faz.
// O tempo de cada etapa fica em playtest/results/telescopio-marcas.json.
//
//   PLAYTEST_BASE_URL=http://localhost:5180 PLAYTEST_SLOWMO=0 npm run playtest -- telescopio
import fs from 'node:fs';
import path from 'node:path';

const ARROW = { '1,0': 'ArrowRight', '-1,0': 'ArrowLeft', '0,1': 'ArrowDown', '0,-1': 'ArrowUp' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];

const VEGA = { x: 41, y: 5 };
const BENCH = { x: 43, y: 7 };
const FURNACE = { x: 46, y: 6 };
const STICKS = [{ x: 44, y: 9 }, { x: 45, y: 9 }];
const SPOT = { x: 32, y: 20 };
const ROCKS = [{ x: 40, y: 3 }, { x: 38, y: 2 }];
const VEIN = { x: 44, y: 2 };
// Os tiles em que o herói pousa o que leva para as máquinas: os dois ficam nos oito vizinhos delas.
const BESIDE_BENCH = { x: 44, y: 8 };
const BESIDE_FURNACE = [{ x: 47, y: 7 }, { x: 45, y: 7 }];

export default {
  name: 'telescopio',
  description: 'A quest da Vega completa, do título ao obrigado, com polimento e observação jogados.',
  needsGame: false,
  async run({ driver, shot, assert }) {
    const { page } = driver;
    const T0 = Date.now();
    const marks = [];
    const mark = (name) => { marks.push({ name, s: (Date.now() - T0) / 1000 }); console.log(`[telescopio ${((Date.now() - T0) / 1000).toFixed(1)}s] ${name}`); };
    const state = () => page.evaluate(() => window.gameDebug?.getState() ?? null);
    const stage = () => page.evaluate(() => window.__scene.astronomerQuest?.save.stage);

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
        const v = s.heroVisualTile();
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
        for (let x = 0; x < 60; x += 1) row += s.isSolidForEntities(x, y) ? '#' : '.';
        rows.push(row);
      }
      return rows;
    });
    let reliefGrid = null;
    const STAIR = { 2: [0, -1], 3: [1, 0], 4: [0, 1], 5: [-1, 0] };
    const canStep = (fx, fy, tx, ty) => {
      if (!reliefGrid) return true;
      const a = reliefGrid[fy][fx]; const b = reliefGrid[ty][tx];
      if (a === b && !STAIR[a]) return true;
      const dx = tx - fx; const dy = ty - fy;
      const ua = STAIR[a];
      if (ua) {
        if (dx === ua[0] && dy === ua[1]) return b === 1;
        if (dx === -ua[0] && dy === -ua[1]) return b === 0;
        return false;
      }
      const ub = STAIR[b];
      if (ub) {
        if (dx === ub[0] && dy === ub[1]) return a === 0;
        if (dx === -ub[0] && dy === -ub[1]) return a === 1;
      }
      return false;
    };
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
      else { await approachFree(target, label); await press('z', 60, 300); }
      await drain(`${label} (cerimonia)`);
      const now = await free();
      assert(`Na mao: ${kind}`, now.heldItem === kind, `heldItem=${now.heldItem}`);
    };

    const drop = async (tile, label) => {
      await approachFree(tile, label);
      await press('z', 60, 240);
      const now = await free();
      assert(`Pousou ${label}`, now.heldItem === 'none', `heldItem=${now.heldItem}`);
    };

    const talk = async (who, label) => {
      await approachSolid(who, label);
      await press('z', 60, 400);
      await waitFor((s) => s.dialogOpen, `dialogo: ${label}`, 8000);
      await drain(label);
      await free();
    };

    /** Abre a máquina, confirma a carta que acende, e fecha. */
    const craft = async (machine, label) => {
      await approachSolid(machine, label);
      await press('z', 60, 500);
      await pageWait(() => Boolean(window.__scene.orderOverlay), null, `catalogo: ${label}`, 5000);
      await shot(`catalogo-${label}`, { note: `Catalogo: ${label}` });
      await press('z', 60, 500);
      if (await page.evaluate(() => Boolean(window.__scene.orderOverlay))) await press('Escape', 60, 400);
      await pageWait(() => !window.__scene.orderOverlay, null, `fechar catalogo: ${label}`, 5000);
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

    /** Bate até o tile abrir. */
    const breakUntilFree = async (target, label, swings = 12) => {
      await approachSolid(target, label);
      for (let i = 0; i < swings; i += 1) {
        if (!(await page.evaluate(([x, y]) => window.__scene.isSolidForEntities(x, y), [target.x, target.y]))) break;
        await press('x', 60, 620);
      }
      await sleep(900);
    };

    // ── TÍTULO → ABERTURA ──────────────────────────────────────────────────────────────────
    await page.evaluate(() => { localStorage.removeItem('zh.cozy.v1'); });
    await driver.open('/');
    await sleep(2600);
    await press('Enter', 80, 600);
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await waitFor((s) => s.dialogOpen || (s.introDone && !s.cutsceneActive), 'a abertura acabar', 90000);
    await drain('abertura');
    await free();
    reliefGrid = await page.evaluate(async () => {
      // A URL que o jogo carregou: outra (sem o ?t= do vite) daria uma segunda cópia do módulo, com o mundo vazio.
      const url = performance.getEntriesByType('resource').map((e) => e.name).find((u) => u.includes('/world/WorldData.ts'));
      const { getTileRelief } = await import(url);
      return Array.from({ length: 60 }, (_, y) => Array.from({ length: 60 }, (__, x) => getTileRelief(x, y)));
    });
    mark('abertura terminou');

    // ── 1. O PEDIDO ────────────────────────────────────────────────────────────────────────
    await walkTo([{ x: VEGA.x, y: VEGA.y + 2 }], 'perto da Vega');
    mark('chegou na Vega');
    await shot('01-vega-antes', { note: 'A Vega, sem nada em volta' });
    await talk(VEGA, 'o pedido');
    let st = await free();
    assert('A Vega deu a picareta', st.heldItem === 'pickaxe', `heldItem=${st.heldItem}`);
    assert('Etapa: ferro', (await stage()) === 'iron', await stage());
    mark('pedido feito');

    // ── 2. O FORNO: duas pedras, na bancada ────────────────────────────────────────────────
    await breakUntilFree(ROCKS[0], 'a 1a rocha');
    await take('stone', 'a 1a pedra');
    await drop(BESIDE_BENCH, 'a pedra ao lado da bancada');
    await take('pickaxe', 'a picareta');
    await breakUntilFree(ROCKS[1], 'a 2a rocha');
    await take('stone', 'a 2a pedra');
    await craft(BENCH, 'forno');
    await drain('o forno');
    await take('furnace', 'o forno');
    await approachFree(FURNACE, 'o lugar do forno');
    await press('x', 60, 500);
    await pageWait(([x, y]) => window.__scene.isSolidForEntities(x, y), [FURNACE.x, FURNACE.y], 'o forno de pe', 4000);
    await shot('02-forno', { note: 'O forno instalado' });
    mark('forno instalado');

    // ── 3. O CARVÃO: os dois gravetos que ela deixou perto da bancada ──────────────────────
    await walkTo([STICKS[0]], 'o 1o graveto');
    await press('z', 60, 300);
    await drain('o 1o graveto');
    st = await free();
    assert('O 1o graveto na mao', st.heldItem === 'wood', `heldItem=${st.heldItem}`);
    await shot('03-galho-no-colo', { note: 'O graveto no colo' });
    await drop(BESIDE_FURNACE[0], 'o graveto ao lado do forno');
    await walkTo([STICKS[1]], 'o 2o graveto');
    await press('z', 60, 300);
    await drain('o 2o graveto');
    st = await free();
    assert('O 2o graveto na mao', st.heldItem === 'wood', `heldItem=${st.heldItem}`);
    await craft(FURNACE, 'carvao');
    await waitGround('charcoal', 'o carvao sair', 30000);
    await shot('04-carvao', { note: 'O carvao saiu do forno' });
    mark('carvao');

    // ── 4. O FERRO ─────────────────────────────────────────────────────────────────────────
    await take('pickaxe', 'a picareta');
    await approachSolid(VEIN, 'o veio');
    for (let i = 0; i < 12 && !(await groundTile('ore')); i += 1) await press('x', 60, 620);
    await sleep(900);
    await take('ore', 'o minerio');
    await craft(FURNACE, 'esponja');
    const bloomAt = await waitGround('bloom', 'a esponja sair', 30000);
    await shot('05-esponja', { note: 'A esponja de ferro' });
    await drain('a esponja');
    await approachFree(bloomAt, 'a esponja');
    for (let i = 0; i < 6 && !(await groundTile('iron')); i += 1) await press('x', 60, 520);
    assert('A esponja virou barra', (await groundTile('iron')) !== null, 'sem ferro no chao');
    await take('iron', 'a barra');
    mark('barra de ferro');
    await talk(VEGA, 'o ferro');
    assert('Etapa: vidro', (await stage()) === 'glass', await stage());
    await shot('06-tripe', { note: 'O tripe e a cinza ao lado da Vega' });
    mark('tripe');

    // ── 5. O VIDRO ─────────────────────────────────────────────────────────────────────────
    const camp = await page.evaluate(() => {
      const q = window.__scene.astronomerQuest;
      return { sand: q.sandTile, ash: q.ashTile };
    });
    await approachSolid(camp.sand, 'a areia');
    await shot('07-areia', { note: 'O monte de areia no acampamento' });
    await press('z', 60, 400);
    await drain('a areia');
    st = await free();
    assert('Areia na mao', st.heldItem === 'sand', `heldItem=${st.heldItem}`);
    await drop(BESIDE_FURNACE[1], 'a areia ao lado do forno');
    await approachSolid(camp.ash, 'a cinza');
    await press('z', 60, 400);
    await drain('a cinza');
    st = await free();
    assert('Cinza na mao', st.heldItem === 'ash', `heldItem=${st.heldItem}`);
    await craft(FURNACE, 'vidro');
    await waitGround('glass', 'o vidro sair', 30000);
    await shot('08-vidro', { note: 'O vidro saiu do forno' });
    await take('glass', 'o vidro');
    mark('vidro');

    // ── 6. A LENTE: o mouse esfrega de verdade ─────────────────────────────────────────────
    await approachSolid(VEGA, 'o vidro para a Vega');
    await press('z', 60, 400);
    await waitFor((s) => s.dialogOpen, 'a Vega falar do vidro', 8000);
    // Fechada a fala, o polimento abre com o mundo congelado: aqui o Z não pode mais ir para o jogo.
    for (let i = 0; i < 40 && (await state()).dialogOpen; i += 1) await press('z', 60, 380);
    await pageWait(() => Boolean(window.__scene.astronomerQuest?.overlay), null, 'o polimento abrir', 6000);
    mark('polimento abriu');
    await sleep(500);
    await shot('09-lente-bruta', { note: 'O vidro bruto' });
    const box = await page.evaluate(() => {
      const r = window.__scene.astronomerQuest.overlay.canvas.getBoundingClientRect();
      return { x: r.left, y: r.top, s: r.width / 200 };
    });
    const lens = (px, py) => ({ x: box.x + px * box.s, y: box.y + py * box.s });
    const start = lens(100, 72);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    let shotFine = false;
    for (let i = 0; i < 2400; i += 1) {
      const live = await page.evaluate(() => {
        const o = window.__scene.astronomerQuest?.overlay;
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
    await pageWait(() => !window.__scene.astronomerQuest?.overlay, null, 'o polimento acabar', 6000);
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
    await shot('15-esperando', { note: 'Sentado com a caneca, e a Vega ao lado' });
    await pageWait(() => window.__scene.astronomerQuest?.overlay?.aim !== undefined, null, 'a ocular abrir de noite', 240000);
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
      const o = window.__scene.astronomerQuest.overlay;
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
      await pageWait((id) => window.__scene.astronomerQuest?.overlay?.reading === id, target, `a ficha: ${target}`, 6000);
      await sleep(4500);
      await shot(`18-ficha-${target}`, { note: `A ficha: ${target}` });
      mark(`achou ${target}`);
      await press('z', 60, 500);
    }

    // ── 10. A VEGA SOBE ────────────────────────────────────────────────────────────────────
    await waitFor((s) => s.dialogOpen, 'a Vega falar', 60000);
    await shot('19-vega-subiu', { note: 'A Vega subiu e sentou' });
    mark('vega subiu');
    await drain('a despedida');
    await pageWait(() => window.__scene.astronomerQuest?.isDone === true, null, 'a quest fechar', 15000);
    st = await free();
    const quest = await page.evaluate(() => window.gameDebug.quests().find((q) => q.dialog === 'astronaut'));
    assert('A quest da Vega fechou', quest.done === true, JSON.stringify(quest));
    await sleep(1200);
    await shot('20-fim', { note: 'O telescopio fica no planalto' });
    mark('quest fechada');

    // Vega foi embora: a casa dela fica vazia, e o tile, livre.
    assert('A Vega nao esta mais em casa', !(await page.evaluate(([x, y]) => window.__scene.isSolidForEntities(x, y), [VEGA.x, VEGA.y])), 'o tile dela continua ocupado');
    mark('obrigado');

    // ── VOLTANDO DO SAVE: tudo continua lá ─────────────────────────────────────────────────
    await page.evaluate(() => window.__scene.persistAdventure());
    await driver.open('/');
    await sleep(2600);
    await press('Enter', 80, 1200);
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await free();
    const after = await page.evaluate(([x, y]) => ({
      stage: window.__scene.astronomerQuest?.save.stage,
      solid: window.__scene.isSolidForEntities(x, y),
    }), [SPOT.x, SPOT.y]);
    assert('O save lembra a quest fechada', after.stage === 'done', JSON.stringify(after));
    assert('O telescopio continua no planalto', after.solid === true, JSON.stringify(after));
    assert('O save lembra que ela foi embora', await page.evaluate(() => window.__scene.astronomerQuest?.save.departed === true), 'departed falso');

    fs.writeFileSync(path.resolve('playtest/results/telescopio-marcas.json'), JSON.stringify(marks, null, 2));
    assert('Sem erro no console', driver.consoleErrors.length === 0, driver.consoleErrors.slice(0, 3).join(' | '));
  },
};

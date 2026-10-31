// COGUMELOS — joga a quest inteira da Hollis, de um jogo novo até a última entrega, com as teclas
// de um jogador (setas, Z, X) e o mouse no mini-game da bucha. Só LÊ o jogo para achar caminho e
// saber o que está na mão. Cronometra cada cogumelo em tempo de partida: da faca na mão até a
// entrega, e também até a colheita.
//
//   PLAYTEST_BASE_URL=http://localhost:5180 npm run playtest -- cogumelos
import fs from 'node:fs';
import path from 'node:path';

const ARROW = { '1,0': 'ArrowRight', '-1,0': 'ArrowLeft', '0,1': 'ArrowDown', '0,-1': 'ArrowUp' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];

const SHROOM = {
  porcini: { x: 1, y: 36 },
  morel: { x: 2, y: 30 },
  puffball: { x: 12, y: 21 },
  inkCap: { x: 11, y: 10 },
  chanterelle: { x: 11, y: 2 },
  flyAgaric: { x: 1, y: 1 },
};

export default {
  name: 'cogumelos',
  description: 'A quest da Hollis completa: os seis cogumelos, cada um com o seu gesto, cronometrados.',
  needsGame: false,
  async run({ driver, shot, assert }) {
    const { page } = driver;
    const state = () => page.evaluate(() => window.gameDebug?.getState() ?? null);
    const say = (msg) => console.log(`[cogumelos ${((Date.now() - T0) / 1000).toFixed(1)}s] ${msg}`);
    const T0 = Date.now();
    // UM TILE POR TOQUE (o herói anda preso ao grid): a seta fica apertada até o passo COMEÇAR — a
    // posição lógica já é o destino — e solta, senão o controlador engata o passo seguinte. Contra
    // uma parede o passo nunca começa e o toque só vira o herói.
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
      for (let i = 0; i < 80; i += 1) {
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
    // A SERRA: entre chão e planalto só se passa pela escada (a mesma conta de world/relief.ts).
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

    /** Anda até um dos `goals`. De mão vazia desvia dos itens do chão: pisar neles os apanharia. */
    const walkTo = async (goals, label) => {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await free();
        const st = await state();
        const from = { x: st.player.worldX, y: st.player.worldY };
        if (goals.some((g) => g.x === from.x && g.y === from.y)) return from;
        const grid = await solidGrid();
        const avoid = st.heldItem === 'none'
          ? new Set(st.groundItems.map((g) => `${g.worldX},${g.worldY}`)) : new Set();
        const way = bfs(grid, from, goals, avoid) ?? bfs(grid, from, goals);
        if (!way) throw new Error(`sem caminho ate ${label} (de ${from.x},${from.y})`);
        let ok = true;
        for (let i = 1; i < way.length; i += 1) {
          const a = way[i - 1]; const b = way[i];
          await press(ARROW[`${b.x - a.x},${b.y - a.y}`], 60, 110);
          const now = await state();
          if (now.itemGetOpen || now.dialogOpen) await drain(`${label} (no caminho)`);
          const after = await state();
          if (after.player.worldX !== b.x || after.player.worldY !== b.y) { ok = false; break; }
        }
        if (ok) return way[way.length - 1];
        await sleep(250);
      }
      throw new Error(`nao consegui chegar em ${label}`);
    };

    /** Vira para um vizinho sólido sem andar (a parede vira o herói). */
    const face = async (target) => {
      const st = await state();
      const dx = target.x - st.player.worldX; const dy = target.y - st.player.worldY;
      if (Math.abs(dx) + Math.abs(dy) !== 1) throw new Error(`face: ${JSON.stringify(target)} nao e vizinho de ${st.player.worldX},${st.player.worldY}`);
      if (st.facing.dx === dx && st.facing.dy === dy) return;
      await press(ARROW[`${dx},${dy}`], 40, 170);
      const now = await state();
      if (now.player.worldX !== st.player.worldX || now.player.worldY !== st.player.worldY) {
        throw new Error('face: o heroi andou em vez de virar');
      }
    };

    /** Encosta num tile sólido e o encara. */
    const approachSolid = async (target, label) => {
      const grid = await solidGrid();
      const sides = DIRS.map(([dx, dy]) => ({ x: target.x + dx, y: target.y + dy }))
        .filter((p) => grid[p.y]?.[p.x] === '.');
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
      const now = await state();
      if (now.player.worldX !== run.side.x || now.player.worldY !== run.side.y) {
        throw new Error(`approachFree: nao cheguei de frente em ${label}`);
      }
    };

    /** A coisa do tile vai para a mão: com a mão cheia o Z TROCA; vazia, pisar apanha. */
    const takeItem = async (target, want, label) => {
      const st = await state();
      if (st.heldItem === 'none') await walkTo([target], label);
      else { await approachFree(target, label); await press('z', 60, 300); }
      await drain(`${label} (cerimonia)`);
      const now = await free();
      assert(`Na mao: ${want}`, now.heldItem === want, `heldItem=${now.heldItem}`);
    };

    const talkHollis = async (label) => {
      await approachSolid(NPC, label);
      await press('z', 60, 400);
      await waitFor((s) => s.dialogOpen, `dialogo: ${label}`, 8000);
      await drain(label);
      await free();
    };

    /** O mini-game inteiro: corta na faixa certa, esfrega a terra com o mouse, fecha a ficha. */
    const playForaging = async (kind) => {
      await pageWait(() => window.__scene.foraging?.stage === 'aim', null, 'faca em posicao', 8000);
      const misses = await page.evaluate(() => new Promise((resolve) => {
        const o = window.__scene.foraging;
        const fire = (type) => window.dispatchEvent(new KeyboardEvent(type, { code: 'KeyZ', key: 'z', bubbles: true }));
        const mid = (o.zoneTop + o.zoneBottom) / 2;
        const tick = () => {
          if (o.stage !== 'aim') { resolve(0); return; }
          if (Math.abs(o.knifeY - mid) < (o.zoneBottom - o.zoneTop) * 0.3) { fire('keydown'); fire('keyup'); }
          requestAnimationFrame(tick);
        };
        tick();
      }));
      await pageWait(() => window.__scene.foraging?.stage === 'clean', null, 'estagio da bucha', 6000);
      await sleep(300);
      const toScreen = (x, y) => page.evaluate(([ax, ay]) => {
        const o = window.__scene.foraging;
        const dpr = o.canvas.width / Math.max(1, o.root.clientWidth);
        const p = o.origin();
        return { x: (p.x + ax * o.scale) / dpr, y: (p.y + ay * o.scale) / dpr };
      }, [x, y]);
      const nextDirt = () => page.evaluate(() => {
        const o = window.__scene.foraging;
        if (!o || o.stage !== 'clean') return null;
        const i = o.dirt.findIndex((c) => c);
        const cs = Math.sqrt(o.dirt.length);
        return i < 0 ? null : { x: i % cs, y: Math.floor(i / cs) };
      });
      let first = await nextDirt();
      if (first) {
        const start = await toScreen(first.x, first.y);
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        for (let i = 0; i < 400 && first; i += 1) {
          const at = await toScreen(first.x + 0.5, first.y + 0.5);
          await page.mouse.move(at.x, at.y, { steps: 2 });
          first = await nextDirt();
        }
        await page.mouse.up();
      }
      await pageWait(() => window.__scene.foraging?.stage === 'note', null, 'a ficha', 10000);
      await shot(`ficha-${kind}`, { note: `A ficha do ${kind}` });
      for (let i = 0; i < 30; i += 1) {
        if (await page.evaluate(() => !window.__scene.foraging)) break;
        await press('z', 50, 500);
      }
      await pageWait(() => !window.__scene.foraging, null, 'a colheita fechar', 8000);
      await drain('depois da ficha');
      return misses;
    };

    const harvest = async (kind) => {
      const t = SHROOM[kind];
      await approachSolid(t, `o ${kind}`);
      const st = await state();
      assert(`Faca na mao diante do ${kind}`, st.heldItem === 'knife', `heldItem=${st.heldItem}`);
      await shot(`antes-${kind}`, { note: `Diante do ${kind}` });
      await press('x', 60, 300);
      await playForaging(kind);
      const now = await free();
      assert(`O ${kind} foi as costas`, now.heldItem === kind, `heldItem=${now.heldItem}`);
    };

    const NPC = { x: 5, y: 40 };
    const log = [];
    const lap = async (kind, gesture, fn) => {
      const t0 = Date.now();
      const clock0 = (await state()).timeOfDay.clock;
      say(`── ${kind}: ${gesture}`);
      const marks = await fn();
      const harvested = Date.now();
      await talkHollis(`entregar ${kind}`);
      const st = await free();
      const q = await page.evaluate(() => window.gameDebug.quests().find((x) => x.dialog === 'radiationSuit'));
      assert(`A Hollis recebeu o ${kind}`, st.heldItem === 'knife' || q.done, `heldItem=${st.heldItem} quest=${JSON.stringify(q)}`);
      const done = Date.now();
      const row = {
        kind, gesture, ok: true,
        harvestMs: harvested - t0, totalMs: done - t0,
        clockFrom: clock0, clockTo: st.timeOfDay.clock, ...marks,
      };
      log.push(row);
      say(`   ${kind}: colhido em ${(row.harvestMs / 60000).toFixed(2)} min, entregue em ${(row.totalMs / 60000).toFixed(2)} min`);
      await shot(`entregue-${kind}`, { note: `${kind} entregue` });
    };

    // ── TÍTULO → ABERTURA → A HOLLIS ───────────────────────────────────────────────────────
    await page.evaluate(() => { localStorage.removeItem('zh.cozy.v1'); });
    await driver.open('/');
    await sleep(2600);
    await press('Enter', 80, 600);
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await waitFor((s) => s.dialogOpen || (s.introDone && !s.cutsceneActive), 'a abertura acabar', 90000);
    await drain('abertura');
    await free();
    say('abertura terminou');
    reliefGrid = await page.evaluate(async () => {
      const { getTileRelief } = await import('/src/game/world/WorldData.ts');
      return Array.from({ length: 60 }, (_, y) => Array.from({ length: 60 }, (__, x) => getTileRelief(x, y)));
    });

    // O MUNDO NOVO, medido antes de qualquer ferramenta: só o porcini se alcança de mãos vazias.
    {
      const grid = await solidGrid();
      const st = await state();
      const from = { x: st.player.worldX, y: st.player.worldY };
      for (const [kind, t] of Object.entries(SHROOM)) {
        const sides = DIRS.map(([dx, dy]) => ({ x: t.x + dx, y: t.y + dy })).filter((p) => grid[p.y]?.[p.x] === '.');
        const way = sides.length ? bfs(grid, from, sides) : null;
        assert(`${kind}: ${kind === 'porcini' ? 'alcancavel' : 'trancado'} sem ferramenta`, kind === 'porcini' ? !!way : !way, `caminho=${way ? way.length : 'nenhum'}`);
      }
    }

    await talkHollis('a Hollis (a faca)');
    const st0 = await free();
    assert('A Hollis deu a faca', st0.heldItem === 'knife', `heldItem=${st0.heldItem}`);
    const questStart = Date.now();

    // ── 1. PORCINI: só chegar ──────────────────────────────────────────────────────────────
    await lap('porcini', 'so chegar e colher', async () => {
      await harvest('porcini');
      return {};
    });

    // ── 2. MOREL: dois gravetos, uma ponte ─────────────────────────────────────────────────
    await lap('morel', 'ponte de dois gravetos', async () => {
      const spot = { x: 2, y: 31 };
      await takeItem({ x: 4, y: 32 }, 'wood', 'o 1o graveto');
      await approachSolid(spot, 'a beira do lago');
      await shot('morel-lago', { note: 'A ilha do morel' });
      await press('x', 60, 900);
      await takeItem({ x: 4, y: 33 }, 'wood', 'o 2o graveto');
      await approachSolid(spot, 'a beira do lago');
      await press('x', 60, 900);
      await pageWait(([x, y]) => !window.__scene.isSolidForEntities(x, y), [spot.x, spot.y], 'a ponte ficar pronta', 8000);
      await shot('morel-ponte', { note: 'A ponte de gravetos' });
      await takeItem({ x: 4, y: 32 }, 'knife', 'a faca');
      await harvest('morel');
      return {};
    });

    // ── 3. PUFFBALL: a foice abre o mato ───────────────────────────────────────────────────
    await lap('puffball', 'foice no mato alto', async () => {
      const scythe = { x: 13, y: 18 };
      await takeItem(scythe, 'scythe', 'a foice');
      await shot('puffball-mato', { note: 'O puffball no mato alto' });
      for (const g of [{ x: 12, y: 19 }, { x: 12, y: 20 }]) {
        await approachSolid(g, 'o mato');
        await press('x', 60, 450);
        await pageWait(([x, y]) => !window.__scene.isSolidForEntities(x, y), [g.x, g.y], 'o mato cair', 4000);
      }
      await shot('puffball-cortado', { note: 'O mato cortado' });
      await takeItem(scythe, 'knife', 'a faca');
      await harvest('puffball');
      return {};
    });

    // ── 4. INKCAP: graveto aceso na lava, fogo nos arbustos ────────────────────────────────
    await lap('inkCap', 'graveto aceso nos arbustos secos', async () => {
      const wood = { x: 13, y: 5 };
      await takeItem(wood, 'wood', 'o graveto');
      await approachSolid({ x: 12, y: 4 }, 'a lava');
      await press('x', 60, 350);
      const lit = await waitFor((s) => s.heldOnFire, 'o graveto acender', 3000);
      assert('O graveto acendeu na lava', lit.heldOnFire, '');
      await shot('inkcap-tocha', { note: 'O graveto aceso' });
      await approachSolid({ x: 11, y: 8 }, 'os arbustos');
      await press('x', 60, 300);
      await shot('inkcap-fogo', { note: 'Os arbustos em chamas' });
      await pageWait(() => {
        const s = window.__scene;
        return [[11, 8], [11, 9], [10, 9], [10, 10]].every(([x, y]) => !s.isSolidForEntities(x, y));
      }, null, 'os arbustos queimarem', 30000);
      await shot('inkcap-cinza', { note: 'O fogo abriu o caminho' });
      await takeItem(wood, 'knife', 'a faca');
      await harvest('inkCap');
      return {};
    });

    // ── 5. CHANTERELLE: picareta, pedra nas costas, lava ───────────────────────────────────
    await lap('chanterelle', 'pedra da picareta afunda na lava', async () => {
      const pick = { x: 14, y: 6 };
      const rock = { x: 15, y: 6 };
      const ford = { x: 11, y: 3 };
      await takeItem(pick, 'pickaxe', 'a picareta');
      await approachSolid(rock, 'a rocha');
      for (let i = 0; i < 8; i += 1) {
        if (!(await page.evaluate(([x, y]) => window.__scene.isSolidForEntities(x, y), [rock.x, rock.y]))) break;
        await press('x', 60, 520);
      }
      await sleep(400);
      await press('z', 60, 350);
      await drain('a pedra');
      const held = await free();
      assert('A pedra nas costas', held.heldItem === 'stone', `heldItem=${held.heldItem}`);
      await shot('chanterelle-pedra', { note: 'A pedra nas costas' });
      await approachSolid(ford, 'a lava');
      await shot('chanterelle-lava', { note: 'O chanterelle cercado de lava' });
      await press('x', 60, 300);
      await sleep(700);
      await shot('chanterelle-afundando', { note: 'A pedra afundando' });
      await pageWait(([x, y]) => !window.__scene.isSolidForEntities(x, y), [ford.x, ford.y], 'a pedra assentar', 6000);
      await takeItem(pick, 'knife', 'a faca');
      await walkTo([ford], 'a pedra na lava');
      await shot('chanterelle-travessia', { note: 'De pe na pedra' });
      await harvest('chanterelle');
      return {};
    });

    // ── 6. FLY AGARIC: o machado abre o mato morto ─────────────────────────────────────────
    await lap('flyAgaric', 'machado no mato morto', async () => {
      const axe = { x: 12, y: 6 };
      await takeItem(axe, 'axe', 'o machado');
      for (const s of [{ x: 10, y: 4 }, { x: 10, y: 3 }, { x: 2, y: 1 }]) {
        await approachSolid(s, 'o mato morto');
        await press('x', 60, 450);
        await pageWait(([x, y]) => !window.__scene.isSolidForEntities(x, y), [s.x, s.y], 'o mato morto cair', 4000);
      }
      await shot('flyagaric-aberto', { note: 'O caminho aberto' });
      await takeItem(axe, 'knife', 'a faca');
      await harvest('flyAgaric');
      return {};
    });

    // ── O FIM ──────────────────────────────────────────────────────────────────────────────
    const q = await page.evaluate(() => window.gameDebug.quests().find((x) => x.dialog === 'radiationSuit'));
    assert('A quest da Hollis fechou', q.done === true, JSON.stringify(q));
    const totalMs = Date.now() - questStart;
    await shot('fim', { note: 'A Hollis fala o roteiro do fim' });
    const summary = { totalMs, rows: log, consoleErrors: driver.consoleErrors };
    const out = path.resolve('playtest/results/cogumelos-tempos.json');
    fs.writeFileSync(out, JSON.stringify(summary, null, 2));
    say(`quest completa em ${(totalMs / 60000).toFixed(2)} min`);
    for (const r of log) say(`${r.kind.padEnd(12)} colhido ${(r.harvestMs / 60000).toFixed(2)} min | entregue ${(r.totalMs / 60000).toFixed(2)} min | relogio ${r.clockFrom}-${r.clockTo}`);
    assert('Sem erro no console', driver.consoleErrors.length === 0, driver.consoleErrors.slice(0, 3).join(' | '));
  },
};

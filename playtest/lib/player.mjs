// O JOGADOR DOS PLAYTESTS: as mãos (setas, Z, X, mouse) e os olhos (o que o jogo diz que tem em cada tile)
// de quem joga de verdade. Nada aqui escreve estado no jogo: só lê o mundo para achar caminho e aperta as
// teclas que um jogador apertaria. Os cenários longos (zerar) montam um com `makePlayer`.
import { canStepCodes } from '../../scripts/relevo.mjs';

export const ARROW = { '1,0': 'ArrowRight', '-1,0': 'ArrowLeft', '0,1': 'ArrowDown', '0,-1': 'ArrowUp' };
export const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WORLD = 60;

export const makePlayer = ({ page, log = console.log }) => {
  const state = () => page.evaluate(() => window.gameDebug?.getState() ?? null);

  // UM TILE POR TOQUE (o herói anda preso ao grid): a seta fica apertada até o passo COMEÇAR e solta, senão
  // o controlador engata o passo seguinte. Contra uma parede o passo nunca começa e o toque só vira o herói.
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
  const free = () => waitFor((s) => !s.dialogOpen && !s.itemGetOpen && !s.cutsceneActive, 'jogo livre', 90000);

  /** Avança diálogo e cerimônia de item até o jogo voltar. */
  const drain = async (label, max = 120) => {
    for (let i = 0; i < max; i += 1) {
      const st = await state();
      if (!st) return;
      if (!st.dialogOpen && !st.itemGetOpen && !st.cutsceneActive) return;
      if (st.dialogOpen || st.itemGetOpen) await press('z', 60, 380);
      else await sleep(250);
    }
    throw new Error(`dialogo/cena nao terminou: ${label}`);
  };

  const solidGrid = () => page.evaluate((n) => {
    const s = window.__scene;
    const rows = [];
    for (let y = 0; y < n; y += 1) {
      let row = '';
      for (let x = 0; x < n; x += 1) row += s.query.isSolidForEntities(x, y) ? '#' : '.';
      rows.push(row);
    }
    return rows;
  }, WORLD);

  // A SERRA: entre chão e planalto só se passa pela escada (a mesma conta de world/relief.ts).
  let reliefGrid = null;
  const loadRelief = async () => {
    reliefGrid = await page.evaluate(async (n) => {
      const url = performance.getEntriesByType('resource').map((e) => e.name).find((u) => u.includes('/world/WorldData.ts'));
      const { getTileRelief } = await import(url);
      return Array.from({ length: n }, (_, y) => Array.from({ length: n }, (__, x) => getTileRelief(x, y)));
    }, WORLD);
  };
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
        if (nx < 0 || ny < 0 || nx >= WORLD || ny >= WORLD) continue;
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
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await free();
      const st = await state();
      const from = { x: st.player.worldX, y: st.player.worldY };
      if (goals.some((g) => g.x === from.x && g.y === from.y)) return from;
      const grid = await solidGrid();
      const avoid = new Set(st.groundItems.map((g) => `${g.worldX},${g.worldY}`));
      const way = bfs(grid, from, goals, avoid) ?? bfs(grid, from, goals);
      if (!way) throw new Error(`sem caminho ate ${label} (de ${from.x},${from.y})`);
      let ok = true;
      for (let i = 1; i < way.length; i += 1) {
        const a = way[i - 1]; const b = way[i];
        await press(ARROW[`${b.x - a.x},${b.y - a.y}`], 60, 90);
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

  /** Vira para um vizinho sem andar: contra sólido o toque só vira. */
  const face = async (target) => {
    const st = await state();
    const dx = target.x - st.player.worldX; const dy = target.y - st.player.worldY;
    if (Math.abs(dx) + Math.abs(dy) !== 1) throw new Error(`face: ${JSON.stringify(target)} nao e vizinho de ${st.player.worldX},${st.player.worldY}`);
    if (st.facing && st.facing.dx === dx && st.facing.dy === dy) return;
    await press(ARROW[`${dx},${dy}`], 40, 170);
    const now = await state();
    if (now.player.worldX !== st.player.worldX || now.player.worldY !== st.player.worldY) throw new Error(`face: o heroi andou em vez de virar (alvo ${target.x},${target.y})`);
  };

  /** Encosta num tile sólido e o encara. `prefer` ordena os lados (ex.: o sul de um NPC). */
  const approachSolid = async (target, label, prefer = null) => {
    const grid = await solidGrid();
    let sides = DIRS.map(([dx, dy]) => ({ x: target.x + dx, y: target.y + dy }))
      .filter((p) => grid[p.y]?.[p.x] === '.' && canStep(p.x, p.y, target.x, target.y));
    if (prefer) sides = sides.filter((p) => prefer.some((q) => q.x === p.x && q.y === p.y)).concat(sides);
    if (!sides.length) throw new Error(`${label}: nenhum lado livre em volta de ${target.x},${target.y}`);
    await walkTo(sides, label);
    await face(target);
  };

  /** Chega de frente num tile LIVRE: anda na direção dele e para um antes (pisar pegaria o item). */
  const approachFree = async (target, label) => {
    const grid = await solidGrid();
    const st = await state();
    const items = new Set(st.groundItems.map((g) => `${g.worldX},${g.worldY}`));
    const runs = DIRS.map(([dx, dy]) => ({
      side: { x: target.x - dx, y: target.y - dy },
      key: ARROW[`${dx},${dy}`],
    })).filter((r) => grid[r.side.y]?.[r.side.x] === '.' && !items.has(`${r.side.x},${r.side.y}`) && canStep(r.side.x, r.side.y, target.x, target.y));
    if (!runs.length) throw new Error(`${label}: sem lado livre para encarar ${target.x},${target.y}`);
    const at = await walkTo(runs.map((r) => r.side), label);
    const run = runs.find((r) => r.side.x === at.x && r.side.y === at.y);
    // virar sem andar num tile livre: o toque curto contra o livre anda, então encara pelo estado
    const now = await state();
    const dx = target.x - now.player.worldX; const dy = target.y - now.player.worldY;
    if (!(now.facing && now.facing.dx === dx && now.facing.dy === dy)) {
      await page.evaluate(([fx, fy]) => window.__scene.movementController.faceTo(fx, fy), [dx, dy]);
      await sleep(120);
    }
    return run;
  };

  const npcAt = (kind) => page.evaluate((k) => window.__scene.npcManager.getActiveWorldPositions().find((n) => n.kind === k) ?? null, kind);
  const quest = (dialog) => page.evaluate((d) => window.gameDebug.quests().find((q) => q.dialog === d) ?? null, dialog);

  /** Vai até o NPC (pelo sul, o lado de conversa, se der), aperta Z e lê a conversa até o fim. */
  const homeOf = (kind) => page.evaluate(async (k) => {
    const url = performance.getEntriesByType('resource').map((e) => e.name).find((u) => u.includes('/world/WorldData.ts'));
    const { getNpcHome } = await import(url);
    const h = getNpcHome(k);
    return h ? { x: h.worldX, y: h.worldY } : null;
  }, kind);

  /** O NPC só existe com o chunk carregado: sem ele à vista, o herói anda até perto da casa dele. */
  const findNpc = async (kind) => {
    let n = await npcAt(kind);
    if (n) return n;
    const home = await homeOf(kind);
    if (!home) throw new Error(`${kind}: sem casa`);
    const grid = await solidGrid();
    const near = [];
    for (let r = 1; r <= 4 && !near.length; r += 1) {
      for (let dy = -r; dy <= r; dy += 1) for (let dx = -r; dx <= r; dx += 1) if (grid[home.y + dy]?.[home.x + dx] === '.') near.push({ x: home.x + dx, y: home.y + dy });
    }
    await walkTo(near, `a casa de ${kind}`);
    await stream();
    await sleep(400);
    n = await npcAt(kind);
    if (!n) throw new Error(`talk: ${kind} nao apareceu perto da casa (${home.x},${home.y})`);
    return n;
  };

  const talk = async (kind, label = kind) => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const n = await findNpc(kind);
      await approachSolid({ x: n.worldX, y: n.worldY }, label, [{ x: n.worldX, y: n.worldY + 1 }]);
      const again = await npcAt(kind);
      const st = await state();
      if (Math.abs(again.worldX - st.player.worldX) + Math.abs(again.worldY - st.player.worldY) !== 1) continue; // ele andou
      await face({ x: again.worldX, y: again.worldY });
      await press('z', 60, 400);
      try { await waitFor((s) => s.dialogOpen || s.cutsceneActive || s.itemGetOpen, `dialogo: ${label}`, 5000); } catch { continue; }
      await drain(label);
      return free();
    }
    throw new Error(`talk: nao consegui falar com ${kind}`);
  };

  const stream = () => page.evaluate(() => window.__scene.streamChunks(true));

  /**
   * OS TILES ONDE UM BOTÃO FAZ `verb` AGORA, perguntados ao jogo (`useVerbAt` para o X, `handVerbAt` para o Z:
   * as mesmas perguntas que o balão de ação faz), do mais perto ao mais longe de `near` (o herói, se faltar).
   */
  const verbTiles = async (button, verb, { near = null, radius = 60 } = {}) => {
    const st = await state();
    const c = near ?? { x: st.player.worldX, y: st.player.worldY };
    return page.evaluate(([b, v, cx, cy, r, n]) => {
      const s = window.__scene;
      const ask = b === 'x' ? (x, y) => s.verbs.useVerbAt(x, y) : (x, y) => s.verbs.handVerbAt(x, y);
      const out = [];
      for (let y = Math.max(0, cy - r); y <= Math.min(n - 1, cy + r); y += 1) {
        for (let x = Math.max(0, cx - r); x <= Math.min(n - 1, cx + r); x += 1) if (ask(x, y) === v) out.push({ x, y, d: Math.abs(x - cx) + Math.abs(y - cy) });
      }
      return out.sort((a, bb) => a.d - bb.d);
    }, [button, verb, c.x, c.y, radius, WORLD]);
  };

  /** Chega diante de `target` (sólido ou livre) e o encara. */
  const reach = async (target, label) => {
    const solid = await page.evaluate(([x, y]) => window.__scene.query.isSolidForEntities(x, y), [target.x, target.y]);
    if (solid) await approachSolid(target, label);
    else await approachFree(target, label);
  };

  /** Faz `verb` com o botão no tile mais perto que aceite (tenta os próximos se um não tiver caminho). */
  const doVerb = async (button, verb, label = verb, opts = {}) => {
    let tiles = await verbTiles(button, verb, opts);
    if (opts.only) { const ok = new Set(opts.only.map((t) => `${t.x},${t.y}`)); tiles = tiles.filter((t) => ok.has(`${t.x},${t.y}`)); }
    tiles = tiles.slice(0, opts.tries ?? 24);
    if (!tiles.length) throw new Error(`nenhum tile aceita ${button}:${verb} (${label})`);
    for (const t of tiles) {
      try { await reach(t, `${label} @${t.x},${t.y}`); } catch (e) { log(`  (${label}: ${t.x},${t.y} sem caminho: ${e.message})`); continue; }
      const now = await page.evaluate(([b, x, y]) => (b === 'x' ? window.__scene.verbs.useVerbAt(x, y) : window.__scene.verbs.handVerbAt(x, y)), [button, t.x, t.y]);
      if (now !== verb) { log(`  (${label}: ${t.x},${t.y} agora diz ${now})`); continue; }
      await press(button, 60, 350);
      // `repeat`: bate de novo enquanto o tile ainda aceita o gesto (a árvore seca cai em etapas, a rocha racha antes).
      for (let i = 0; opts.repeat && i < 12; i += 1) {
        await sleep(250);
        const again = await page.evaluate(([b, x, y]) => (b === 'x' ? window.__scene.verbs.useVerbAt(x, y) : window.__scene.verbs.handVerbAt(x, y)), [button, t.x, t.y]);
        if (again !== verb) break;
        await press(button, 60, 350);
      }
      return t;
    }
    throw new Error(`nao consegui ${button}:${verb} (${label})`);
  };

  return {
    state, press, waitFor, pageWait, free, drain, solidGrid, loadRelief, canStep, bfs,
    walkTo, face, approachSolid, approachFree, npcAt, homeOf, findNpc, quest, talk, stream, log, verbTiles, reach, doVerb,
  };
};

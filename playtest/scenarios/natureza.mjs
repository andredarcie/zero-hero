// A NATUREZA DO VALE — pedido do autor: "adicione exatamente todas as suas sugestões" (objects/nature/, e os
// passarinhos refeitos em objects/BirdLife.ts). Cada uma é montada na hora e no lugar dela (o dia, a estação, a
// chuva), conferida de verdade (o bicho apareceu, fugiu, a poça espirrou...) e fotografada.
//
// Os dias: 1 = primavera, chove das 15h às 17h24; 2 = verão (o dia seguinte à chuva); 3 = verão de vento;
// 4 = outono de vento; 5 = outono (2º dia: mais folhas no chão).
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'natureza',
  description: 'Os 15 detalhes de natureza e os passarinhos refeitos, cada um na sua hora, conferidos e fotografados.',
  needsGame: false,
  async run({ driver, shot, assert, log }) {
    const { page } = driver;
    await page.addInitScript(() => {
      localStorage.setItem('zh.cozy.v1', JSON.stringify({ started: true, introSeen: true }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await sleep(1200);
    const put = (x, y, fx = 0, fy = -1) => page.evaluate(([px, py, dx, dy]) => {
      const g = window.gameDebug;
      g.hero.teleport(px, py, dx, dy);
    }, [x, y, fx, fy]);
    const when = (day, phase) => page.evaluate(([d, p]) => { window.gameTime.setDay(d); window.gameTime.set(p); }, [day, phase]);
    // O tile livre mais perto de um ponto: cada coisa da natureza mora num bioma (world/biomeLife), e o herói vai lá.
    const putNear = async (x, y, fx = 0, fy = -1) => {
      const t = await page.evaluate(([bx, by]) => {
        const g = window.gameDebug;
        for (let r = 0; r < 8; r += 1) {
          for (let dy = -r; dy <= r; dy += 1) {
            for (let dx = -r; dx <= r; dx += 1) {
              if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
              if (!g.world.solid(bx + dx, by + dy) && !g.world.openWater(bx + dx, by + dy)) return { x: bx + dx, y: by + dy };
            }
          }
        }
        return { x: bx, y: by };
      }, [x, y]);
      await put(t.x, t.y, fx, fy);
      return t;
    };
    const MEADOW = [14, 22];
    const MEADOW_POND = [7, 19];
    const MOSS_POND = [8, 29];
    const MOSS = [10, 42];
    const WOODS = [52, 20];
    const STARS = [36, 10];
    const GARDEN = [30, 29];
    const n = (expr) => page.evaluate(expr);
    const waitFor = (fn, ms = 15000) => page.waitForFunction(fn, null, { timeout: ms }).then(() => true).catch(() => false);
    const where = async (label, expr) => log(`  ${label}: ${JSON.stringify(await page.evaluate(expr))}`);
    // O instante congelado: a foto leva ~2 s para sair; sem isto o salto do peixe (0,75 s) já tinha acabado.
    const freeze = (on) => page.evaluate((v) => { window.gameDebug.valley.freezeNature(v); }, on);
    const frozenShot = async (name, note) => { await freeze(true); await shot(name, { note }); await freeze(false); };
    // O FOCO de cada foto (o bicho, a poça, a teia), em pixels da imagem salva: o relatório recorta em volta dele.
    const focus = async (name, x, y, z = 0) => {
      const px = await page.evaluate(([wx, wy, wz]) => {
        const p = window.gameDebug.render.project(wx, wy, wz);
        return { x: Math.round(p.x * window.devicePixelRatio), y: Math.round(p.y * window.devicePixelRatio) };
      }, [x, y, z]);
      log(`  FOCO ${name} ${px.x} ${px.y}`);
    };

    // ── 11. As manchas de sol (verão, meio-dia), debaixo do carvalho de (58,53) — o bosque de outono ──
    await when(2, 0.45);
    await put(57, 54, 1, 0);
    await sleep(2500);
    const dapples = await n(() => window.gameDebug.valley.nature().dapples);
    assert('11 · Manchas de sol: com sol, debaixo da copa', dapples > 0.9, String(dapples));
    await focus('11-manchas-de-sol', 58, 53.9);
    await shot('11-manchas-de-sol', { note: 'A sombra salpicada de sol debaixo do carvalho' });

    // ── 8. As margaridas abertas (meio-dia), no prado ─────────────────────────────────────────
    const md = await putNear(...MEADOW);
    await sleep(2500);
    const open = await n(() => ({ n: window.gameDebug.valley.nature().daisies.count, o: window.gameDebug.valley.nature().daisies.openness }));
    assert('8 · Margaridas: há touceiras, e ao meio-dia estão abertas', open.n > 0 && open.o > 0.9, JSON.stringify(open));
    { const d = (await n(() => window.gameDebug.valley.nature().daisies.spots)).sort((a, b) => Math.hypot(a.x - md.x, a.y - md.y - 0.5) - Math.hypot(b.x - md.x, b.y - md.y - 0.5))[0]; if (d) await focus('08a-margaridas-abertas', d.x, d.y, 0.15); }
    await shot('08a-margaridas-abertas', { note: 'As margaridas abertas ao meio-dia' });

    // ── 3. As libélulas, no lago do prado ─────────────────────────────────────────────────────
    await putNear(...MEADOW_POND);
    const flies = await waitFor(() => window.gameDebug.valley.nature().dragonflies.length >= 1, 8000);
    await sleep(1500);
    await where('libélulas', () => window.gameDebug.valley.nature().dragonflies);
    assert('3 · Libélulas: de dia, sobre a água', flies, '');
    { const l = (await n(() => window.gameDebug.valley.nature().dragonflies))[0]; if (l) await focus('03-libelulas', l.x, l.y, l.z); }
    await shot('03-libelulas', { note: 'As libélulas paradas no ar sobre o lago do prado' });
    // ── 5. O peixe pulando, no lago do bosque de outono ───────────────────────────────────────
    await put(42, 51);
    await sleep(800);
    // O salto sem engasgo: o pior quadro do jogo enquanto o peixe pula, medido sem foto nenhuma no meio (a foto
    // trava a página e o contador de fps da foto seguinte mostra essa trava, não o jogo).
    const worst = await page.evaluate(() => new Promise((resolve) => {
      window.gameDebug.valley.forceFishJump(42.6, 53.4);
      let last = performance.now();
      let max = 0;
      const t0 = last;
      const tick = (now) => {
        max = Math.max(max, now - last);
        last = now;
        if (now - t0 < 1400) requestAnimationFrame(tick); else resolve(Math.round(max));
      };
      requestAnimationFrame(tick);
    }));
    log(`  pior quadro durante o salto: ${worst} ms`);
    assert('5 · Peixe: o salto não engasga o jogo (nenhum shader compilado na hora)', worst < 120, `${worst} ms`);
    await page.evaluate(() => window.gameDebug.valley.forceFishJump(42.6, 53.4));
    const jumped = await waitFor(() => window.gameDebug.valley.nature().fish !== null, 4000);
    await sleep(330);
    await where('peixe', () => window.gameDebug.valley.nature().fish);
    assert('5 · Peixe: salta da água aberta', jumped, '');
    await freeze(true);
    await where('peixe (billboard)', () => { const b = window.gameDebug.valley.fishBody(); return b ? { vis: b.visible, p: [b.x, b.y, b.z], s: [b.scaleX, b.scaleY], tex: b.textured } : null; });
    await freeze(false);
    { const fj = await n(() => { const b = window.gameDebug.valley.fishBody(); return b ? { x: b.x, y: b.z, z: b.y } : null; }); if (fj) await focus('05-peixe-pulando', fj.x, fj.y, fj.z); }
    await frozenShot('05-peixe-pulando', 'O peixe no alto do salto, o anel de onde saiu');

    // ── 2. Os sapos na margem do laguinho do musgo, e o salto na água quando o herói chega ──────
    await putNear(...MOSS_POND);
    const frogs = await waitFor(() => window.gameDebug.valley.nature().frogs.list.some((f) => f.mode === 'sit'), 40000);
    await where('sapos', () => window.gameDebug.valley.nature().frogs.list);
    assert('2 · Sapos: sentados na margem', frogs, '');
    // O herói a ~2,8 tiles do sapo (fora do susto), para o sapo ficar no quadro.
    { const fr = (await n(() => window.gameDebug.valley.nature().frogs.list))[0]; if (fr) await put(Math.round(fr.x) + 2, Math.round(fr.y) - 2, -1, 1); }
    await sleep(1200);
    { const fr = (await n(() => window.gameDebug.valley.nature().frogs.list))[0]; if (fr) await focus('02a-sapo-na-margem', fr.x, fr.y, 0.1); }
    await shot('02a-sapo-na-margem', { note: 'O sapo na margem, virado para a água' });
    const frog = await n(() => window.gameDebug.valley.nature().frogs.list.find((f) => f.mode === 'sit'));
    const divesBefore = await n(() => window.gameDebug.valley.nature().frogs.dives);
    await put(Math.round(frog.x), Math.round(frog.y) - 2, 0, 1);
    await sleep(170);
    await focus('02b-sapo-saltando', frog.x, frog.y + 0.4, 0.1);
    await frozenShot('02b-sapo-saltando', 'O sapo saltando na água');
    await sleep(900);
    const dives = await n(() => window.gameDebug.valley.nature().frogs.dives);
    assert('2 · Sapos: com o herói perto, salta na água', dives > divesBefore, `${divesBefore} → ${dives}`);

    // ── 1. O esquilo do carvalho de (58,53) ───────────────────────────────────────────────────
    await put(54, 59);
    await sleep(800);
    await sleep(600);
    await page.evaluate(() => window.gameDebug.valley.wakeSquirrel());
    const down = await waitFor(() => window.gameDebug.valley.nature().squirrel.mode === 'ground', 15000);
    await sleep(1200);
    await where('esquilo', () => window.gameDebug.valley.nature().squirrel);
    assert('1 · Esquilo: desce do carvalho e cata no chão', down, '');
    // O herói a ~3,2 tiles (fora do susto), ao sul do esquilo: ele no meio do quadro.
    { const q = await n(() => window.gameDebug.valley.nature().squirrel); await put(Math.round(q.x), Math.round(q.y + 3.2), 0, -1); }
    await sleep(1000);
    { const q = await n(() => window.gameDebug.valley.nature().squirrel); await focus('01a-esquilo-no-chao', q.x, q.y, q.z + 0.2); }
    await shot('01a-esquilo-no-chao', { note: 'O esquilo catando no pé do carvalho' });
    const sq = await n(() => window.gameDebug.valley.nature().squirrel);
    await put(Math.round(sq.x), Math.round(sq.y) + 2);
    await sleep(450);
    { const q = await n(() => window.gameDebug.valley.nature().squirrel); await focus('01b-esquilo-fugindo', q.x, q.y, q.z + 0.2); }
    await frozenShot('01b-esquilo-fugindo', 'O esquilo correndo para o tronco');
    const fled = await waitFor(() => ['up', 'hidden'].includes(window.gameDebug.valley.nature().squirrel.mode), 6000);
    assert('1 · Esquilo: com o herói perto, sobe de volta', fled, '');

    // ── 16. Os passarinhos refeitos, no chão da mata ──────────────────────────────────────────
    await putNear(...WOODS);
    await page.evaluate(() => window.gameDebug.valley.clearBirds());
    const birds = await waitFor(() => window.gameDebug.valley.birds().list.filter((b) => b.mode === 'ground').length >= 3, 15000);
    await sleep(1500);
    await where('passarinhos', () => window.gameDebug.valley.birds().list.map((b) => [b.mode, +b.x.toFixed(1), +b.y.toFixed(1)]));
    assert('16 · Passarinhos: um bandinho cisca no chão', birds, JSON.stringify(await n(() => { const b = window.gameDebug.valley.birds(); return { list: b.list, next: b.nextLanding, clock: b.clock, awake: b.awake, hero: b.heroAt, t: window.gameTime.get() }; })));
    // O herói a 3 tiles do bando (fora do espanto), para o bando ficar no meio do quadro.
    const flock = await n(() => window.gameDebug.valley.birds().list.find((b) => b.mode === 'ground'));
    if (flock) await put(Math.round(flock.x) - 2, Math.round(flock.y) + 2, 1, -1);
    await sleep(1200);
    { const b = (await n(() => window.gameDebug.valley.birds().list)).find((q) => q.mode === 'ground'); if (b) await focus('16-passarinhos', b.x, b.y, 0.2); }
    await shot('16-passarinhos', { note: 'Os passarinhos ciscando' });

    // ── 12. As sementes no vento (verão, dia de vento) ───────────────────────────────────────
    await when(3, 0.45);
    const sd = await putNear(...MEADOW);
    const seeds = await waitFor(() => window.gameDebug.valley.nature().seeds >= 10, 12000);
    await sleep(1000);
    assert('12 · Sementes: num dia de vento atravessam o vale', seeds, String(await n(() => window.gameDebug.valley.nature().seeds)));
    await focus('12-sementes-no-vento', sd.x, sd.y, 0.6);
    await frozenShot('12-sementes-no-vento', 'As penugens de dente-de-leão no vento');

    // ── 8. As margaridas fechando no fim da tarde ─────────────────────────────────────────────
    await when(2, 0.745);
    const mc = await putNear(...MEADOW);
    await sleep(2000);
    const closed = await n(() => window.gameDebug.valley.nature().daisies.openness);
    assert('8 · Margaridas: no fim da tarde estão fechadas', closed < 0.05, String(closed));
    { const d = (await n(() => window.gameDebug.valley.nature().daisies.spots)).sort((a, b) => Math.hypot(a.x - mc.x, a.y - mc.y - 0.5) - Math.hypot(b.x - mc.x, b.y - mc.y - 0.5))[0]; if (d) await focus('08b-margaridas-fechadas', d.x, d.y, 0.15); }
    await shot('08b-margaridas-fechadas', { note: 'As margaridas fechadas no fim da tarde' });

    // ── 10. A neblina (na geada) e 4. a lebre (no prado), ao amanhecer (outono) ────────────────
    await when(4, 0.27);
    const st = await putNear(...STARS);
    await sleep(3000);
    const mist = await n(() => window.gameDebug.valley.nature().mist);
    assert('10 · Neblina: ao amanhecer', mist > 0.5, String(mist));
    await focus('10-neblina-do-amanhecer', st.x, st.y + 1.5, 0);
    await shot('10-neblina-do-amanhecer', { note: 'A neblina do amanhecer na geada' });
    await putNear(...MEADOW);
    await sleep(800);
    await page.evaluate(() => window.gameDebug.valley.summonHare());
    await sleep(1500);
    const hare = await n(() => window.gameDebug.valley.nature().hares.state);
    log(`  lebre: ${JSON.stringify(hare)}`);
    assert('4 · Lebre: aparece de manhãzinha, pastando', hare && hare.mode === 'graze', JSON.stringify(hare));
    // O herói a 5 tiles, ao lado (fora do alerta), com a lebre no meio da faixa nítida do quadro.
    await put(Math.round(hare.x) + 4, Math.round(hare.y) + 2, -1, -1);
    await sleep(1800);
    { const h = await n(() => window.gameDebug.valley.nature().hares.state); if (h) await focus('04a-lebre-pastando', h.x, h.y, 0.25); }
    await frozenShot('04a-lebre-pastando', 'A lebre pastando');
    await put(Math.round(hare.x) + 2, Math.round(hare.y), -1, 0);
    await sleep(450);
    { const h = await n(() => window.gameDebug.valley.nature().hares.state); if (h) await focus('04b-lebre-fugindo', h.x, h.y, 0.25); }
    await frozenShot('04b-lebre-fugindo', 'A lebre fugindo em zigue-zague');
    const flee = await n(() => window.gameDebug.valley.nature().hares.flees);
    assert('4 · Lebre: com o herói perto, foge', flee > 0, String(flee));

    // ── 6. As folhas no chão (outono, 2º dia) ─────────────────────────────────────────────────
    await when(5, 0.45);
    await put(46, 59);
    await sleep(2000);
    assert('6 · Folhas: no outono o chão debaixo das árvores fica coberto', (await n(() => window.gameDebug.valley.nature().litter)) === 'autumn-1', '');
    await focus('06-folhas-no-chao', 47, 57.4, 0);
    await shot('06-folhas-no-chao', { note: 'O chão de folhas do outono debaixo do carvalho' });

    // ── 14. As poças: enchendo na chuva (com os anéis dos pingos), no jardim ──────────────────
    await when(1, 0.665);
    const gd = await putNear(...GARDEN);
    await sleep(22000);
    const wet = await n(() => ({ w: window.gameDebug.valley.nature().puddles.wetness, n: window.gameDebug.valley.nature().puddles.list.length }));
    assert('14 · Poças: enchem na chuva', wet.n > 0 && wet.w > 0.2, JSON.stringify(wet));
    { const pq = (await n(() => window.gameDebug.valley.nature().puddles.list)).sort((a, b) => Math.hypot(a.x - gd.x, a.y - gd.y) - Math.hypot(b.x - gd.x, b.y - gd.y))[0]; if (pq) await focus('14a-pocas-na-chuva', pq.x, pq.y, 0); }
    await shot('14a-pocas-na-chuva', { note: 'As poças na chuva, com os anéis dos pingos' });

    // ── 13. O arco-íris, 15. as gotas das folhas e 14. a poça que espirra, logo depois da chuva ──
    await when(1, 0.733);
    // 15. As gotas: na mata.
    const wd = await putNear(...WOODS);
    await sleep(4000);
    const drip = await n(() => ({ drip: window.gameDebug.valley.nature().drips.level, fallen: window.gameDebug.valley.nature().drips.fallen }));
    log(`  depois da chuva, na mata: ${JSON.stringify(drip)}`);
    assert('15 · Gotas: as folhas pingam depois da chuva', drip.drip > 0.5 && drip.fallen > 3, JSON.stringify(drip));
    await focus('15-gotas-das-folhas', wd.x, wd.y - 1, 0.9);
    await frozenShot('15-gotas-das-folhas', 'As gotas pingando das árvores da mata');
    // 13. O arco-íris e 14. a poça que espirra: no jardim.
    await when(1, 0.733);
    const ga = await putNear(...GARDEN);
    await sleep(4000);
    const rb = await n(() => window.gameDebug.valley.nature().rainbow);
    assert('13 · Arco-íris: logo depois da chuva', rb > 0.5, String(rb));
    await focus('13-arco-iris', ga.x + 0.6, ga.y - 3.5, 1.2);
    await shot('13-arco-iris', { note: 'O arco-íris depois da chuva, sobre o jardim' });
    const pud = await n(() => window.gameDebug.valley.nature().puddles.list);
    const target = pud.sort((a, b) => Math.hypot(a.x - ga.x, a.y - ga.y) - Math.hypot(b.x - ga.x, b.y - ga.y))[0];
    if (target) {
      await put(target.x, target.y - 1);
      await sleep(600);
      const before = await n(() => window.gameDebug.valley.nature().puddles.splashes);
      await put(target.x, target.y);
      await sleep(110);
      await focus('14b-poca-espirrando', target.x, target.y, 0.2);
      await frozenShot('14b-poca-espirrando', 'O pé na poça: o espirro');
      const sp = await n(() => window.gameDebug.valley.nature().puddles.splashes);
      assert('14 · Poças: o herói pisa e espirra', sp > before, `${before} → ${sp}`);
    } else assert('14 · Poças: há poça perto para pisar', false, JSON.stringify(pud));

    // ── 7. Os cogumelos, no dia seguinte à chuva ──────────────────────────────────────────────
    await when(2, 0.36);
    const ms = await putNear(...MOSS);
    await sleep(2500);
    const shrooms = await n(() => window.gameDebug.valley.nature().mushrooms.count);
    assert('7 · Cogumelos: no dia seguinte à chuva, no pé das árvores', shrooms > 2, String(shrooms));
    { const m = (await n(() => window.gameDebug.valley.nature().mushrooms.spots)).sort((a, b) => Math.hypot(a.x - ms.x, a.y - ms.y) - Math.hypot(b.x - ms.x, b.y - ms.y))[0]; if (m) await focus('07-cogumelos-depois-da-chuva', m.x, m.y, 0.15); }
    await shot('07-cogumelos-depois-da-chuva', { note: 'Os cogumelos no pé das árvores do musgo' });

    // ── A ASSINATURA DE CADA LUGAR: no bosque de outono, nada do prado nem do musgo ─────────────
    await when(2, 0.45);
    await put(46, 54);
    await sleep(2500);
    const camp = await n(() => { const nl = window.gameDebug.valley.nature(); return { daisies: nl.daisies.count, frogs: nl.frogs.list.length, flies: nl.dragonflies.length, seeds: nl.seeds, birds: window.gameDebug.valley.birds().list.filter((b) => b.mode === 'ground' && Math.hypot(b.x - 46, b.y - 54) < 12).length }; });
    assert('Biomas: no bosque de outono não há margarida, sapo, libélula, semente nem passarinho no chão', Object.values(camp).every((v) => v === 0), JSON.stringify(camp));
  },
};

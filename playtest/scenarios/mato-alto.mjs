// O MATO ALTO REFEITO (pedido do autor, 2026-11-17; render3d/tallGrassArt, tallGrassTuft, world/TallGrassField,
// scenes/game/MowFx, runtime/SwordMow, audio/MowSounds, render3d/campGridArt): fio a fio, na paleta do tileset, um tufo
// diferente do outro, na brisa do vale; a foice numa roçada de verdade, com as pontas voando, pousando e sumindo, a onda
// no capim e o tranquinho do golpe; os tocos; a grade desenhada no chão do mundo. Tira as fotos de perto.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'mato-alto',
  description: 'O mato alto fio a fio: o vento, a roçada da foice com as pontas voando, os tocos, a grade no chão.',
  needsGame: false,
  async run({ driver, shot, assert, log }) {
    const { page } = driver;
    const g = (fn, arg) => page.evaluate(fn, arg);
    const teleport = async (x, y, dx, dy) => { await g(([a, b, c, d]) => window.gameDebug.hero.teleport(a, b, c, d), [x, y, dx, dy]); await sleep(250); };
    const grass = (x, y) => g(([a, b]) => window.gameDebug.valley.tallGrass(a, b), [x, y]);
    const drain = async () => {
      for (let i = 0; i < 12; i += 1) {
        const st = await g(() => window.gameDebug.getState());
        if (!st?.dialogOpen && !st?.itemGetOpen) return;
        await page.keyboard.press('z');
        await sleep(260);
      }
    };

    await page.addInitScript(() => {
      if (sessionStorage.getItem('mato')) return;
      sessionStorage.setItem('mato', '1');
      localStorage.setItem('zh.cozy.v1', JSON.stringify({ started: true, introSeen: true, day: 0, clock: 0.4, respawn: { worldX: 54, worldY: 51 } }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await sleep(1500);
    await g(() => { window.gameTime.set(0.4); });

    // ── O MATO EM PÉ ──────────────────────────────────────────────────────────────────────────────────────────────
    const field = await grass(56, 48);
    log(`  campo: ${field.quads} pedaços de fio, ${field.standing} tufos em pé; o tufo (56,48) tem ${field.blades} fios (${field.kinds.join(', ')})`);
    assert('O mato alto é fio a fio: o campo desenha milhares de pedaços de fio, e cada tufo tem uns dez fios', field.quads > 2000 && field.blades >= 9, JSON.stringify(field));
    await teleport(55, 48, 1, 0);
    await g(() => window.gameDebug.verbs.hidePrompt());
    await g(() => window.gameDebug.scene.dollyTo(0.78, 10));
    await sleep(900);
    await shot('00-mato-de-perto', { note: 'O mato alto de perto, de dia: fio a fio, um tufo diferente do outro' });
    // o vento mexe: duas fotos da mesma região, meio segundo uma da outra, não são iguais
    const crop = { x: 760, y: 200, width: 360, height: 300 };
    const a = await page.screenshot({ clip: crop });
    await sleep(550);
    const b = await page.screenshot({ clip: crop });
    assert('A brisa mexe os fios (a mesma região, meio segundo depois, mudou)', !a.equals(b), '');

    // ── A ROÇADA ──────────────────────────────────────────────────────────────────────────────────────────────────
    await g(() => window.gameDebug.items.take('scythe'));
    await drain();
    await teleport(55, 48, 1, 0);
    await g(() => window.gameDebug.verbs.hidePrompt());
    // o meio da varrida: congela a cena logo depois do contato e fotografa as pontas no ar
    await page.keyboard.press('x');
    await sleep(390);
    await g(() => window.gameDebug.scene.pauseScene());
    await shot('01-corte-no-ar', { note: 'O golpe: as pontas cortadas voando, a palha no ar, a foice no fim da varrida' });
    await g(() => window.gameDebug.scene.resumeScene());
    const cut = await grass(56, 48);
    assert('A foice cortou o tufo (os fios de pé sumiram, ficaram os tocos)', cut.blades === 0, JSON.stringify(cut));
    await sleep(450);
    await shot('02-pontas-no-chao', { note: 'As pontas pousadas no chão e os tocos, antes de sumir' });
    // OS TOCOS SOMEM (pedido do autor): dois segundos e eles afundam na terra — o chão fica limpo
    await sleep(2300);
    const clean = await g(() => window.gameDebug.camp.grassAt(56, 48));
    assert('Dois segundos depois do corte os tocos somem: o chão fica limpo', clean.drawn === 'gone' && clean.quads === 0 && !clean.blocking, JSON.stringify(clean));
    await shot('03-chao-limpo', { note: 'Os tocos afundaram: o chão limpo' });

    // uma sequência de golpes (o som sobe de tom; o tile abre a cada um)
    for (const [hx, hy, dx, dy] of [[56, 48, 1, 0], [56, 48, 0, -1], [56, 48, 0, 1]]) {
      await teleport(hx, hy, dx, dy);
      await page.keyboard.press('x');
      await sleep(520);
    }
    const after = await grass(57, 48);
    assert('Em sequência, cada golpe corta um tufo', after.blades === 0, JSON.stringify(after));
    await sleep(1600);
    await teleport(55, 48, 1, 0);
    await g(() => window.gameDebug.verbs.hidePrompt());
    await sleep(400);
    await shot('04-clareira-aberta', { note: 'A clareira aberta pela foice' });

    // ── DE NOITE ──────────────────────────────────────────────────────────────────────────────────────────────────
    await g(() => { window.gameTime.set(0.9); });
    await sleep(1600);
    await shot('05-mato-noite', { note: 'O mato alto à noite' });
    await g(() => { window.gameTime.set(0.4); });
    await g(() => window.gameDebug.scene.dollyTo(1, 10));
    await sleep(800);

    // ── A GRADE NO CHÃO ───────────────────────────────────────────────────────────────────────────────────────────
    await g(() => window.gameDebug.items.clear());
    for (let i = 0; i < 2; i += 1) {
      await g(() => window.gameDebug.items.take('wood'));
      await drain();
      await teleport(54, 45, 1, 0);
      await page.keyboard.press('x');
      await sleep(400);
    }
    await teleport(54, 45, 1, 0);
    await sleep(300);
    await page.keyboard.press('z');
    await page.waitForFunction(() => window.gameDebug.camp.build().open, null, { timeout: 8000 });
    await sleep(400);
    await page.click('.zh-build-card[data-kind="log"]');
    await sleep(200);
    const px = await g(() => window.gameDebug.camp.buildTilePx(56, 48));
    await page.mouse.move(px.x, px.y);
    await sleep(500);
    const build = await g(() => window.gameDebug.camp.build());
    assert('A grade abre com o jogo parado e o tile aberto pela foice está verde', build.paused && build.cells.some((c) => c.x === 56 && c.y === 48 && c.state === 'free'), JSON.stringify({ paused: build.paused }));
    const meshes = await g(() => window.gameDebug.camp.gridInWorld());
    assert('A grade está NO MUNDO: um quadradinho deitado por tile', meshes >= build.cells.filter((c) => c.state !== 'fixed').length, String(meshes));
    await shot('06-grade-no-chao', { note: 'A grade desenhada no chão, com a peça na mão sobre um tile verde' });
    await page.keyboard.press('Escape');
    await sleep(300);
    await page.keyboard.press('Escape');
    await sleep(600);
  },
};

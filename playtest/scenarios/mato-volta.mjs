// O MATO QUE VOLTA (pedido do autor, 2026-11-17; objects/CampGrass, runtime/campRegrowth, objects/TallGrassObject):
// cortado, o tufo deixa os tocos à vista e dois segundos depois eles somem (chão limpo, para a peça posta não ficar no
// meio do mato). O espaço cortado e SEM USO, com o tempo do jogo, brota, cresce e fica em pé de novo — e bloqueia, e a
// grade o pinta de vermelho. O que tem peça em cima continua limpo.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A hora do corte, e as horas de depois (o dia e a fração do dia), em que o tile estará no degrau dito. */
const CUT = { day: 0, phase: 0.4 };
const STEPS = [
  { day: 1, phase: 0.45, level: 0.25, name: 'broto', shotName: '03-broto' },
  { day: 1, phase: 0.9, level: 0.5, name: 'até o joelho', shotName: null },
  { day: 2, phase: 0.27, level: 0.75, name: 'quase', shotName: '04-quase' },
  { day: 2, phase: 0.45, level: 1, name: 'em pé', shotName: '05-em-pe' },
];
const FREE = [56, 48];
const BUILT = [56, 47];

export default {
  name: 'mato-volta',
  description: 'Os tocos somem em dois segundos; o mato cortado sem uso volta com o tempo; o que tem peça fica limpo.',
  needsGame: false,
  async run({ driver, shot, assert, log }) {
    const { page } = driver;
    const g = (fn, arg) => page.evaluate(fn, arg);
    const at = (x, y) => g(([a, b]) => window.gameDebug.camp.grassAt(a, b), [x, y]);
    const teleport = async (x, y, dx, dy) => { await g(([a, b, c, d]) => window.gameDebug.hero.teleport(a, b, c, d), [x, y, dx, dy]); await sleep(250); };
    const drain = async () => {
      for (let i = 0; i < 12; i += 1) {
        const st = await g(() => window.gameDebug.getState());
        if (!st?.dialogOpen && !st?.itemGetOpen) return;
        await page.keyboard.press('z');
        await sleep(260);
      }
    };
    const setClock = async (day, phase) => {
      await g(([d, p]) => { window.gameTime.setDay(d); window.gameTime.set(p); }, [day, phase]);
      await sleep(1700); // o relógio do mato olha a cada meio segundo, e o degrau sobe em pouco mais de um
    };

    await page.addInitScript(() => {
      if (sessionStorage.getItem('volta')) return;
      sessionStorage.setItem('volta', '1');
      localStorage.setItem('zh.cozy.v1', JSON.stringify({ started: true, introSeen: true, day: 0, clock: 0.4, respawn: { worldX: 54, worldY: 51 } }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await sleep(1500);
    await g(([d, p]) => { window.gameTime.setDay(d); window.gameTime.set(p); }, [CUT.day, CUT.phase]);

    // ── O CORTE: OS TOCOS À VISTA, E DOIS SEGUNDOS DEPOIS O CHÃO LIMPO ────────────────────────────────────────────
    await g(() => window.gameDebug.items.take('scythe'));
    await drain();
    await teleport(55, 48, 1, 0);
    await page.keyboard.press('x');
    await sleep(900);
    const stub = await at(...FREE);
    assert('Logo depois do corte, os tocos ficam à vista (o corte se vê)', stub.drawn === 'stub' && stub.quads > 0 && !stub.blocking, JSON.stringify(stub));
    await g(() => window.gameDebug.verbs.hidePrompt());
    await shot('00-tocos', { note: 'Logo depois do corte: os tocos à vista' });
    await sleep(2200);
    const clean = await at(...FREE);
    assert('Dois segundos depois, os tocos afundaram: chão limpo', clean.drawn === 'gone' && clean.quads === 0, JSON.stringify(clean));
    await shot('01-chao-limpo', { note: 'Dois segundos depois: o chão limpo' });

    // o segundo tile: cortado e USADO (uma peça em cima)
    await teleport(56, 48, 0, -1);
    await page.keyboard.press('x');
    await sleep(2800);
    await page.keyboard.press('Backquote');
    await sleep(300);
    await page.keyboard.press('Digit3');
    await sleep(200);
    await page.locator('#zh-dev button', { hasText: 'Encher a bancada' }).first().click();
    await sleep(200);
    await page.keyboard.press('Escape');
    await sleep(400);
    await g(() => window.gameDebug.items.clear());
    await teleport(54, 45, 1, 0);
    await page.keyboard.press('z');
    await page.waitForFunction(() => window.gameDebug.camp.build().open, null, { timeout: 8000 });
    await sleep(400);
    await page.click('.zh-build-card[data-kind="log"]');
    await sleep(200);
    const px = await g(([x, y]) => window.gameDebug.camp.buildTilePx(x, y), BUILT);
    await page.mouse.click(px.x, px.y);
    await sleep(300);
    await page.keyboard.press('Escape');
    await sleep(700);
    assert('Uma peça foi posta no segundo tile cortado', (await g(([x, y]) => window.gameDebug.valley.campAt(x, y), BUILT)) === 'log', '');
    // o herói longe dos dois tiles (o tile que ele pisa conta como uso)
    await teleport(53, 51, 0, -1);
    await g(() => window.gameDebug.verbs.hidePrompt());
    await shot('02-cortado-e-usado', { note: 'Dois tiles cortados: um livre, um com o tronco' });

    // ── O TEMPO PASSA: O LIVRE BROTA E CRESCE; O DA PEÇA NÃO ──────────────────────────────────────────────────────
    for (const step of STEPS) {
      await setClock(step.day, step.phase);
      const free = await at(...FREE);
      const built = await at(...BUILT);
      log(`  dia ${step.day} ${step.phase}: livre ${JSON.stringify(free)} · com peça ${JSON.stringify(built)}`);
      assert(`Dia ${step.day}, ${Math.round(step.phase * 24)}h: o mato do tile livre está ${step.name}`, free.level === step.level, JSON.stringify(free));
      assert(`Dia ${step.day}, ${Math.round(step.phase * 24)}h: o tile com a peça continua limpo`, built.level === 0 && !built.blocking, JSON.stringify(built));
      if (step.shotName) {
        await sleep(400);
        await shot(step.shotName, { note: `O mato que volta: ${step.name}` });
      }
    }
    const back = await at(...FREE);
    assert('Em pé de novo, o mato bloqueia o tile e sai do save', back.tall && back.blocking
      && !(await g(() => window.gameDebug.camp.home().cleared)).includes(`${FREE[0]},${FREE[1]}`), JSON.stringify(back));

    // ── NA GRADE: VERMELHO DE NOVO ────────────────────────────────────────────────────────────────────────────────
    await teleport(54, 45, 1, 0);
    await page.keyboard.press('z');
    await page.waitForFunction(() => window.gameDebug.camp.build().open, null, { timeout: 8000 });
    await sleep(500);
    const cell = (await g(() => window.gameDebug.camp.build())).cells.find((c) => c.x === FREE[0] && c.y === FREE[1]);
    assert('Na grade, o tile em que o mato voltou está vermelho de novo', cell?.state === 'grass', JSON.stringify(cell));
    await shot('06-grade', { note: 'Na grade: o mato que voltou, vermelho de novo' });
    await page.keyboard.press('Escape');
    await sleep(500);
  },
};

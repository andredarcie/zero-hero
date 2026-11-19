// A MATA VIVA (pedido do autor, 2026-11-18: "faça 1 e 4 com alta qualidade"):
//   1. A MATA ANTIGA DO JARDIM FORA DA GRADE: a sebe deixa de ser as mesmas duas anciãs em fileiras — sete formas, a
//      alta de dois tiles, espelhadas, o pé fora do centro;
//   4. LUZ E MOVIMENTO: as copas seguem as rajadas do vale juntas, folhas se soltam das copas e caem no vento, e de dia
//      raios de sol entram entre as copas.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'mata-viva',
  description: 'A sebe do jardim alto fora da grade; as copas nas rajadas, as folhas caindo e os raios de sol.',
  needsGame: false,
  async run({ driver, shot, assert, log }) {
    const { page } = driver;
    const g = (fn, arg) => page.evaluate(fn, arg);
    const teleport = async (x, y, dx, dy) => { await g(([a, b, c, d]) => window.gameDebug.hero.teleport(a, b, c, d), [x, y, dx, dy]); await sleep(600); };
    await page.addInitScript(() => {
      if (sessionStorage.getItem('mata-viva')) return;
      sessionStorage.setItem('mata-viva', '1');
      localStorage.setItem('zh.cozy.v1', JSON.stringify({
        started: true, introSeen: true, day: 2, clock: 0.4, respawn: { worldX: 30, worldY: 38 }, mistCleared: true,
      }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await sleep(1500);
    const hide = () => g(() => window.gameDebug.verbs.hidePrompt());

    // ── 1. A SEBE DO JARDIM, FORA DA GRADE ────────────────────────────────────────────────────────────────────────
    await teleport(30, 38, 0, -1);
    await hide();
    await g(() => window.gameDebug.scene.dollyTo(2.1, 10));
    await sleep(1500);
    await shot('00-jardim-de-longe', { note: 'O jardim alto de longe: a sebe de anciãs fora da grade' });
    await g(() => window.gameDebug.scene.dollyTo(1, 10));
    await teleport(26, 31, 0, -1);
    await hide();
    await sleep(900);
    await shot('01-sebe-de-perto', { note: 'A sebe de perto, do planalto do jardim' });
    await teleport(33, 33, 0, -1);
    await hide();
    await sleep(900);
    await shot('02-sebe-leste', { note: 'O lado leste da sebe' });
    log('  (os quadros acima são para o olho: formas, alturas e lados misturados)');

    // ── 4. OS RAIOS DE SOL ENTRE AS COPAS ─────────────────────────────────────────────────────────────────────────
    const nature = () => g(() => window.gameDebug.valley.nature());
    await g(() => window.gameTime.set(0.34));
    await teleport(27, 29, 0, -1);
    await hide();
    await sleep(3500);
    let n = await nature();
    log(`  manhã: raios ${JSON.stringify(n.shafts)}`);
    assert('De manhã, entre as copas da sebe, há raios de sol', n.shafts.level > 0.5 && n.shafts.count > 0, JSON.stringify(n.shafts));
    await shot('03-raios-de-manha', { note: 'Os raios de sol da manhã entrando entre as copas' });
    await g(() => window.gameTime.set(0.66));
    await sleep(2500);
    await shot('04-raios-de-tarde', { note: 'De tarde, os raios pendem para o outro lado' });
    await g(() => window.gameTime.set(0.9));
    await sleep(2500);
    n = await nature();
    assert('De noite não há raio de sol', n.shafts.level < 0.01 && n.shafts.count === 0, JSON.stringify(n.shafts));
    await g(() => window.gameTime.set(0.42));

    // ── 4. AS FOLHAS QUE CAEM ─────────────────────────────────────────────────────────────────────────────────────
    await teleport(26, 31, 0, -1);
    await hide();
    await g(() => window.gameDebug.scene.dollyTo(0.7, 10));
    await sleep(5000);
    n = await nature();
    log(`  folhas: ${JSON.stringify(n.leaves)}`);
    assert('Folhas se soltam das copas e caem', n.leaves.count > 0 || n.leaves.dropped > 0, JSON.stringify(n.leaves));
    await g(() => window.gameDebug.valley.freezeNature(true));
    await shot('05-folhas-caindo', { note: 'Folhas soltas das copas, caindo' });
    await g(() => window.gameDebug.valley.freezeNature(false));
    await g(() => window.gameDebug.scene.dollyTo(1, 10));

    // ── 4. A RAJADA: as copas juntas, e um punhado de folhas ─────────────────────────────────────────────────────
    let gust = 0;
    for (let i = 0; i < 240 && gust < 0.66; i += 1) { gust = (await nature()).gust; if (gust < 0.66) await sleep(500); }
    log(`  rajada: ${gust.toFixed(2)}`);
    assert('A rajada do vale chega', gust >= 0.66, String(gust));
    await sleep(600);
    n = await nature();
    log(`  na rajada: folhas ${JSON.stringify(n.leaves)}`);
    await shot('06-rajada', { note: 'Na rajada: as copas inclinadas para leste, juntas, e folhas no ar' });
  },
};

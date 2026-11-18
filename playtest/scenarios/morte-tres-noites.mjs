// AS TRÊS NOITES DA MORTE — pedido do autor: ela vem nas três primeiras noites dormidas no colchão do acampamento,
// uma por noite, no caminho de Nietzsche (o diagnóstico, a travessia, a afirmação), e na quarta não vem mais.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KEYS = ['death/visit', 'death/visit2', 'death/visit3'];

export default {
  name: 'morte-tres-noites',
  description: 'A Morte vem nas três primeiras noites no acampamento, uma por noite e em ordem; na quarta, não.',
  needsGame: false,
  async run({ driver, shot, assert, log }) {
    const { page } = driver;
    const state = () => page.evaluate(() => window.gameDebug?.getState() ?? null);
    await page.addInitScript(() => {
      if (sessionStorage.getItem('morte3')) return;
      sessionStorage.setItem('morte3', '1');
      localStorage.setItem('zh.cozy.v1', JSON.stringify({ started: true, introSeen: true }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await sleep(1200);

    const night = async (n) => {
      // Ao lado do colchão, de frente para ele: o Z deita.
      await page.evaluate(() => {
        const g = window.gameDebug; window.gameTime.set(0.6);
        g.hero.teleport(54, 48, -1, 0);
      });
      await sleep(600);
      await page.keyboard.press('z');
      await sleep(1500);
      const lying = await page.evaluate(() => window.gameDebug.camp.rest().sleeping && window.gameDebug.camp.rest().atCamp);
      assert(`Noite ${n}: deitado no colchão`, lying, '');
      const before = await page.evaluate((keys) => keys.filter((k) => window.gameDebug.dialog.heard(k)), KEYS);
      // A noite passa: a hora de dormir, e depois a manhã.
      await page.evaluate(() => window.gameTime.set(0.95));
      await sleep(800);
      await page.evaluate(() => window.gameTime.set(0.235));
      let first = null;
      const gifts = [];
      for (let i = 0; i < 50; i += 1) {
        const st = await state();
        if (st.dialogOpen) {
          // Cada caixa escrita até o fim antes do Z: a primeira e a do PRESENTE (o aviso da noite 1, a foice da 3) viram foto.
          for (let w = 0; w < 30 && (await page.evaluate(() => window.gameDebug.dialog.box()?.typing ?? false)); w += 1) await sleep(200);
          await sleep(250);
          const text = await page.evaluate(() => window.gameDebug.dialog.box()?.text ?? '');
          if (first === null) {
            first = text;
            await shot(`noite-${n}`, { note: `A Morte, noite ${n}` });
          } else if (/presente|foice/u.test(text) && !gifts.includes(text)) {
            gifts.push(text);
            await shot(`noite-${n}-presente`, { note: `A Morte, noite ${n}: o presente` });
          }
          await page.keyboard.press('z');
        }
        await sleep(300);
      }
      const after = await page.evaluate((keys) => keys.filter((k) => window.gameDebug.dialog.heard(k)), KEYS);
      log(`  noite ${n}: ${JSON.stringify(before)} → ${JSON.stringify(after)} | ${JSON.stringify(first)} | presente: ${JSON.stringify(gifts)}`);
      // Levanta e se afasta do colchão.
      for (let i = 0; i < 10 && (await state()).resting; i += 1) { await page.keyboard.press('ArrowUp'); await sleep(400); }
      await sleep(600);
      return { before, after, came: first !== null, gifts };
    };

    const scythes = () => page.evaluate(() => window.gameDebug.items.ground().filter((i) => i.kind === 'scythe').length);
    for (let n = 1; n <= 3; n += 1) {
      const r = await night(n);
      assert(`Noite ${n}: a Morte veio`, r.came, JSON.stringify(r));
      assert(`Noite ${n}: só a visita ${n}, em ordem`, r.after.length === n && r.after[n - 1] === KEYS[n - 1] && r.before.length === n - 1, JSON.stringify(r));
      // A foice é o presente do FIM da terceira noite (pedido do autor, 2026-11-17): antes dela, nenhuma.
      if (n < 3) assert(`Noite ${n}: ainda sem foice (ela só avisa e volta)`, (await scythes()) === 0, String(await scythes()));
      // Na primeira ela promete o presente; na terceira o entrega: a foice. Na segunda, nenhuma palavra sobre ele.
      if (n === 1) assert('Noite 1: ela avisa que volta e que no fim deixa um presente', r.gifts.length === 1 && /presente/u.test(r.gifts[0]), JSON.stringify(r.gifts));
      if (n === 3) assert('Noite 3: o presente é a foice', r.gifts.some((t) => /foice/u.test(t)), JSON.stringify(r.gifts));
    }
    const r4 = await night(4);
    assert('Noite 4: ela não vem mais', !r4.came && r4.after.length === 3, JSON.stringify(r4));
    assert('Só uma foice no mundo (a do fim da terceira noite)', (await scythes()) === 1, String(await scythes()));
  },
};

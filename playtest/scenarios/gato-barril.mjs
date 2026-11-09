// O BARRIL DO GATO — pedido do autor: às vezes o gato segue o herói, às vezes não; quando não segue, está em casa,
// num barril, como Diógenes. O cenário encurta os relógios dele (quanto segue, quanto descansa) e confere o ciclo:
// barril vazio → o gato segue → cansa e vai dormir no barril → o Z no barril é carinho e lição → o herói passando
// colado, já descansado, o acorda, e ele volta a seguir.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BARREL = { x: 28, y: 47 };

export default {
  name: 'gato-barril',
  description: 'O gato segue por um tempo, volta para o barril dele e dorme; o herói passando o acorda.',
  needsGame: false,
  async run({ driver, shot, assert, log }) {
    const { page } = driver;
    const state = () => page.evaluate(() => window.gameDebug?.getState() ?? null);
    const closeDialog = async () => { for (let i = 0; i < 10 && (await state()).dialogOpen; i += 1) { await page.keyboard.press('z'); await sleep(450); } await sleep(500); };
    await page.addInitScript(() => {
      if (sessionStorage.getItem('barril')) return;
      sessionStorage.setItem('barril', '1');
      localStorage.setItem('zh.cozy.v1', JSON.stringify({ started: true, introSeen: true }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await sleep(1200);
    const put = (x, y, fx, fy) => page.evaluate(([px, py, dx, dy]) => {
      const g = window.gameDebug;
      g.hero.teleport(px, py, dx, dy);
    }, [x, y, fx, fy]);

    // 1. O barril existe antes do gato, sólido, e vazio ele é uma linha do narrador.
    await put(BARREL.x, BARREL.y + 1, 0, -1);
    await sleep(800);
    const empty = await page.evaluate(([x, y]) => ({ solid: window.gameDebug.world.solid(x, y), verb: window.gameDebug.verbs.hand(x, y) }), [BARREL.x, BARREL.y]);
    assert('O barril está no mapa, sólido, e o Z nele é "olhar"', empty.solid && empty.verb === 'look', JSON.stringify(empty));
    await page.keyboard.press('z');
    await sleep(900);
    assert('Vazio, o barril é uma linha do narrador', (await state()).dialogOpen, '');
    await shot('barril-vazio', { note: 'O barril, vazio' });
    await closeDialog();

    // 2. O gato chega e segue; o relógio dele é encurtado, e ele cansa e vai para casa.
    await put(30, 50, 0, 1);
    await sleep(600);
    await page.evaluate(() => { const g = window.gameDebug; g.camp.ensureCat(false); g.camp.setCatFollowMs(1500); });
    await sleep(800);
    assert('Ao chegar, ele segue o herói', !(await page.evaluate(() => window.gameDebug.camp.cat().atHome)), '');
    await page.waitForFunction(() => window.gameDebug.camp.cat().atHome, null, { timeout: 15000 });
    const home = await page.evaluate(() => window.gameDebug.camp.cat().position);
    log(`  em casa: ${JSON.stringify(home)}`);
    assert('Cansado, ele está dormindo no barril', Math.abs(home.x - BARREL.x) < 0.1 && Math.abs(home.y - BARREL.y) < 0.3, JSON.stringify(home));

    // 3. O Z no barril com ele dentro: carinho e lição.
    await put(BARREL.x, BARREL.y + 1, 0, -1);
    await sleep(900);
    const verb = await page.evaluate(([x, y]) => window.gameDebug.verbs.hand(x, y), [BARREL.x, BARREL.y]);
    assert('Com o gato em casa, o Z no barril é carinho', verb === 'pet', String(verb));
    await page.keyboard.press('z');
    await sleep(1400);
    const talked = await page.evaluate(() => window.gameDebug.dialog.heard('cat/talk/1'));
    assert('O carinho no barril tem a lição', (await state()).dialogOpen && talked, '');
    await shot('gato-no-barril', { note: 'O gato dormindo no barril, e a lição' });
    await closeDialog();
    assert('Antes de descansar, ele fica em casa mesmo com o herói do lado', await page.evaluate(() => window.gameDebug.camp.cat().atHome), '');

    // 4. Descansado (relógio encurtado), o herói colado no barril o acorda, e ele volta a seguir.
    await page.evaluate(() => { window.gameDebug.camp.setCatHomeMs(1e9); });
    await sleep(600);
    assert('Descansado, o herói passando o acorda e ele volta a seguir', !(await page.evaluate(() => window.gameDebug.camp.cat().atHome)), '');
    await put(BARREL.x + 2, BARREL.y + 2, 0, 1);
    await sleep(1500);
    const near = await page.evaluate(() => { const g = window.gameDebug; const c = g.camp.cat().position; return Math.hypot(c.x - g.hero.at().x, c.y - g.hero.at().y); });
    assert('E anda atrás do herói de novo', near < 3, String(near));
  },
};

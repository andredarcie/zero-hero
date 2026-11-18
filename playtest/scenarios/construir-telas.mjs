// O MODO DE CONSTRUÇÃO EM TODA TELA (pedido do autor, 2026-11-17: "tome cuidado com o tamanho das fontes [...]
// acessibilidade [...] grandes e legíveis, seja em telas grandes, em telas médias de tablet, em telas pequenas de
// celular; todas as experiências têm que ser bem responsivas e funcionais"). Abre a bancada e, em cinco telas (o
// computador, o tablet em pé e deitado, o celular em pé e deitado), MEDE a letra de verdade (o tamanho computado de
// cada texto), o alvo de toque dos botões, se nada sai da tela, e se dá para escolher uma carta e pôr a peça num tile.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SCREENS = [
  { name: 'computador', width: 1440, height: 900 },
  { name: 'tablet-em-pe', width: 820, height: 1180 },
  { name: 'tablet-deitado', width: 1180, height: 820 },
  { name: 'celular-em-pe', width: 390, height: 844 },
  { name: 'celular-deitado', width: 844, height: 390 },
];
/** O piso da letra, em pixels CSS: texto 18, botão 20, título 22. */
const FLOOR = { text: 18, button: 20, title: 22 };

export default {
  name: 'construir-telas',
  description: 'O modo de construção legível e funcional no computador, no tablet e no celular (em pé e deitado).',
  needsGame: false,
  async run({ driver, shot, assert, log }) {
    const { page } = driver;
    const g = (fn, arg) => page.evaluate(fn, arg);
    const drain = async () => {
      for (let i = 0; i < 12; i += 1) {
        const st = await g(() => window.gameDebug.getState());
        if (!st?.dialogOpen && !st?.itemGetOpen) return;
        await page.keyboard.press('z');
        await sleep(260);
      }
    };
    await page.addInitScript(() => {
      if (sessionStorage.getItem('telas')) return;
      sessionStorage.setItem('telas', '1');
      localStorage.setItem('zh.cozy.v1', JSON.stringify({
        started: true, introSeen: true, day: 0, clock: 0.42, respawn: { worldX: 54, worldY: 51 },
        home: { stock: { wood: 3, stone: 1, charcoal: 0, ore: 0 }, built: ['log', 'sign'] },
      }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await sleep(1400);
    await g(() => { window.gameTime.set(0.42); window.gameDebug.quest.event({ type: 'paint' }); });
    await sleep(500);
    await drain();
    await sleep(1500);
    /** Abre a bancada como o jogador abriria nesta tela (a tábua e a câmera se arrumam ao abrir). */
    const openBuild = async () => {
      await g(() => window.gameDebug.hero.teleport(54, 45, 1, 0));
      await sleep(400);
      await page.keyboard.press('z');
      await page.waitForFunction(() => window.gameDebug.camp.build().open, null, { timeout: 8000 });
      await sleep(600);
    };
    // UM Esc fecha, mesmo com o mouse parado em cima da grade (ele aponta um tile só de passar).
    const closeBuild = async () => {
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !window.gameDebug.camp.build().open, null, { timeout: 8000 });
      await sleep(900);
    };

    for (const s of SCREENS) {
      await page.setViewportSize({ width: s.width, height: s.height });
      await sleep(600);
      await openBuild();
      const m = await g(() => {
        const px = (el) => (el ? parseFloat(getComputedStyle(el).fontSize) : 0);
        const root = document.getElementById('zh-build');
        const q = (sel) => root.querySelector(sel);
        const all = (sel) => [...root.querySelectorAll(sel)];
        const rect = (el) => el.getBoundingClientRect();
        const off = (el) => {
          const r = rect(el);
          return r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1;
        };
        const cards = all('.zh-build-card');
        return {
          title: px(q('.zh-build-title')),
          stock: px(q('.zh-build-stock')),
          name: Math.min(...all('.zh-build-card .name').map(px)),
          needs: Math.min(...all('.zh-build-card .needs').map(px)),
          hint: px(q('.zh-build-hint')),
          button: Math.min(...all('.zh-build-foot button').filter((b) => b.style.visibility !== 'hidden').map(px)),
          buttonH: Math.min(...all('.zh-build-foot button').filter((b) => b.style.visibility !== 'hidden').map((b) => rect(b).height)),
          cardH: Math.min(...cards.map((c) => rect(c).height)),
          offscreen: [q('.zh-build-top'), q('.zh-build-bottom')].some(off),
          // a tábua (embaixo, ou a coluna da direita no celular deitado) deixa a maior parte da tela para o acampamento
          panel: (rect(q('.zh-build-bottom')).width * rect(q('.zh-build-bottom')).height) / (innerWidth * innerHeight),
          side: rect(q('.zh-build-bottom')).left > innerWidth / 2,
          // TODO tile verde do acampamento fica à vista: nem debaixo da tábua, nem do papel do título, nem fora da tela
          hidden: window.gameDebug.camp.build().cells.filter((c) => c.state === 'free').filter((c) => {
            const p = window.gameDebug.camp.buildTilePx(c.x, c.y);
            if (!p || p.x < 0 || p.y < 0 || p.x > innerWidth || p.y > innerHeight) return true;
            return [q('.zh-build-top'), q('.zh-build-bottom')].some((el) => {
              const r = rect(el);
              return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
            });
          }).map((c) => `${c.x},${c.y}`),
          // nenhuma etiqueta do jogo congelada por cima da grade (o "Desenhar" do bicho perto)
          cueHidden: (() => {
            const cue = document.getElementById('zh-sketch-cue');
            return !cue || getComputedStyle(cue).display === 'none';
          })(),
          // o tamanho de um tile na tela (o alvo do toque): a distância entre dois centros vizinhos
          tilePx: (() => {
            const a = window.gameDebug.camp.buildTilePx(53, 48);
            const b = window.gameDebug.camp.buildTilePx(54, 48);
            return a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
          })(),
        };
      });
      log(`  ${s.name} ${s.width}×${s.height}: título ${m.title}px, nomes ${m.name}px, preços ${m.needs}px, dica ${m.hint}px, botões ${m.button}px (${Math.round(m.buttonH)}px de alto), tábua ${m.side ? 'à direita' : 'embaixo'} (${(m.panel * 100).toFixed(0)}% da tela), tile ${Math.round(m.tilePx)}px, verdes escondidos: ${m.hidden.length}`);
      assert(`${s.name}: a letra é grande (texto ≥ ${FLOOR.text}px, botão ≥ ${FLOOR.button}px, título ≥ ${FLOOR.title}px)`,
        m.title >= FLOOR.title && m.stock >= FLOOR.text && m.name >= FLOOR.text && m.needs >= FLOOR.text && m.hint >= FLOOR.text && m.button >= FLOOR.button,
        JSON.stringify(m));
      assert(`${s.name}: botões e cartas com alvo de toque de pelo menos 44px`, m.buttonH >= 44 && m.cardH >= 44, JSON.stringify(m));
      assert(`${s.name}: nada sai da tela, e a tábua deixa a maior parte dela para o acampamento`, !m.offscreen && m.panel <= 0.45, JSON.stringify(m));
      assert(`${s.name}: todo tile verde fica à vista e tocável (nenhum debaixo da tábua; tile ≥ 40px)`, m.hidden.length === 0 && m.tilePx >= 40, JSON.stringify({ hidden: m.hidden, tile: m.tilePx }));
      assert(`${s.name}: nenhuma etiqueta do jogo congelada por cima da grade`, m.cueHidden, '');
      await shot(`grade-${s.name}`, { note: `O modo de construção: ${s.name} (${s.width}×${s.height})` });
      await closeBuild();
    }

    // FUNCIONA no celular em pé e deitado: toca a carta, toca um tile verde, a peça cai lá
    await page.setViewportSize({ width: 844, height: 390 });
    await sleep(600);
    await openBuild();
    await page.click('.zh-build-card[data-kind="log"]');
    await sleep(250);
    const freeSide = (await g(() => window.gameDebug.camp.build())).cells.find((c) => c.state === 'free');
    const pxSide = await g(([x, y]) => window.gameDebug.camp.buildTilePx(x, y), [freeSide.x, freeSide.y]);
    await page.mouse.click(pxSide.x, pxSide.y);
    await sleep(400);
    const atSide = await g(([x, y]) => window.gameDebug.valley.campAt(x, y), [freeSide.x, freeSide.y]);
    assert('No celular deitado, tocar a carta e o tile verde põe a peça', atSide === 'log', JSON.stringify({ atSide, freeSide }));
    await closeBuild();
    await page.setViewportSize({ width: 390, height: 844 });
    await sleep(600);
    await openBuild();
    await page.click('.zh-build-card[data-kind="easel"]');
    await sleep(250);
    const free = (await g(() => window.gameDebug.camp.build())).cells.find((c) => c.state === 'free');
    const px = await g(([x, y]) => window.gameDebug.camp.buildTilePx(x, y), [free.x, free.y]);
    await page.mouse.click(px.x, px.y);
    await sleep(400);
    const at = await g(([x, y]) => window.gameDebug.valley.campAt(x, y), [free.x, free.y]);
    assert('No celular em pé, tocar a carta e o tile verde põe a peça', at === 'easel', JSON.stringify({ at, free }));
    await page.keyboard.press('Escape');
    await sleep(500);
    await page.setViewportSize({ width: 1440, height: 900 });
    await sleep(400);
  },
};

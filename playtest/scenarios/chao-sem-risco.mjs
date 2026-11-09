// CHÃO SEM RISCO — o chão não muda de cor numa linha reta de um tile para o outro (pedido do autor). Mede na
// própria geometria do mundo, o mapa inteiro:
//
//  1. Onde dois pedaços de chão se encostam (o chão comum, o beiço da serra, a margem dos lagos, a borda do
//     calçamento), o mesmo ponto tem a MESMA cor — bioma × sombra de canto. Só se aceita a diferença entre o topo
//     de pedra de uma montanha e o topo de grama de um planalto, que são dois materiais.
//  2. Nenhum tile de grama ou de terra ilhado (um quadrado de quatro bordas retas no meio do outro tipo).
//  3. Nenhum quadro de chão inteiro (grama, terra) posto como enfeite na camada de decoração.
//
// Tira fotos dos lugares onde o defeito aparecia, para o olho conferir.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'chao-sem-risco',
  description: 'O chão não muda de cor numa linha reta: emendas, tiles ilhados e enfeites de tile inteiro.',
  needsGame: false,
  async run({ driver, shot, assert, log }) {
    const { page } = driver;
    await page.addInitScript(() => {
      localStorage.setItem('zh.cozy.v1', JSON.stringify({ started: true, introSeen: true }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await sleep(1500);

    // As emendas da malha de chão, vértice a vértice (ver gameDebug.render.groundSeams).
    const seams = await page.evaluate(() => window.gameDebug.render.groundSeams());
    // A pedra de cima de uma montanha encostada na grama de um planalto: dois materiais, não um risco.
    const material = await page.evaluate((list) => list.map((p) => window.gameDebug.render.solidFrameNear(p.x, p.z, [39, 40])), seams);
    const real = seams.filter((_, i) => !material[i]);
    log(`  emendas: ${seams.length} pontos com cor diferente, ${seams.length - real.length} são pedra encostada em grama`);
    assert('1. Onde o chão se encosta, a cor é a mesma (nenhum risco reto de cor ou de sombra)', real.length === 0, JSON.stringify(real.slice(0, 8)));

    const tiles = await page.evaluate(async () => {
      const earth = (x, y) => window.gameDebug.render.groundFrame(5, x, y) !== 5;
      const isolated = [];
      for (let y = 1; y < 59; y += 1) {
        for (let x = 1; x < 59; x += 1) {
          const me = earth(x, y);
          const same = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => earth(x + dx, y + dy) === me).length;
          if (same === 0) isolated.push([x, y]);
        }
      }
      const world = await (await fetch('/world.json', { cache: 'no-store' })).json();
      const GROUND_ART = new Set([5, 6, 52, 53, 54, 55, 56]);
      const decorGround = [];
      for (const c of world.chunks) {
        c.upper.forEach((row, ly) => row.forEach((f, lx) => {
          if (GROUND_ART.has(f)) decorGround.push([c.cx * world.meta.chunkColumns + lx, c.cy * world.meta.chunkRows + ly, f]);
        }));
      }
      return { isolated, decorGround };
    });
    assert('2. Nenhum tile de grama ou terra ilhado no meio do outro tipo', tiles.isolated.length === 0, JSON.stringify(tiles.isolated.slice(0, 10)));
    assert('3. Nenhum tile de chão inteiro posto como enfeite', tiles.decorGround.length === 0, JSON.stringify(tiles.decorGround));

    // As fotos: o lago de lava (os selos verdes), a borda de um planalto com escada e o jardim do fim.
    for (const [name, x, y] of [['lago-de-lava', 6, 6], ['planalto-e-escada', 6, 46], ['jardim-alto', 30, 33]]) {
      await page.evaluate(([px, py]) => {
        const g = window.gameDebug; window.gameTime.set(0.5);
        g.hero.teleport(px, py);
        g.verbs.hidePrompt();
        g.scene.dollyTo(1.5, 100);
      }, [x, y]);
      await sleep(1800);
      await shot(name, { note: `o chão em volta de (${x}, ${y})` });
    }
  },
};

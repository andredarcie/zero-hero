// A CERCA DO LENHADOR (scripts/cerca-do-lenhador.mjs, objects/WoodFence.ts): o quintal do Marco cercado de madeira,
// com o portão no sul. Confere que a cerca barra o passo e o portão deixa passar, e fotografa de fora e de dentro.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'cerca',
  description: 'O quintal do lenhador cercado de madeira: a cerca barra, o portão abre caminho, e as fotos.',
  needsGame: false,
  async run({ driver, shot, assert }) {
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
    await page.evaluate(() => { window.gameTime.setDay(2); window.gameTime.set(0.45); });

    const solid = await page.evaluate(() => {
      const g = window.gameDebug;
      const fence = [[48, 5], [52, 11], [55, 11], [59, 8], [50, 1]];
      return { fence: fence.every(([x, y]) => g.world.solid(x, y)), gate: !g.world.solid(53, 11) && !g.world.solid(54, 11) };
    });
    assert('Cerca: os tiles da cerca barram o passo', solid.fence, JSON.stringify(solid));
    assert('Cerca: o portão (53-54, 11) deixa passar', solid.gate, JSON.stringify(solid));

    await put(53, 14, 0, -1);
    await sleep(2500);
    await shot('01-portao', { note: 'O portão do quintal do lenhador, de fora' });
    await put(53, 9, 0, -1);
    await sleep(2000);
    await shot('02-quintal', { note: 'Dentro do quintal: a cerca em volta' });
    await put(50, 4, -1, 0);
    await sleep(2000);
    await shot('03-canto', { note: 'O canto noroeste da cerca' });

    // ── O QUINTAL (objects/LumberYard): as peças e a quest do Marco, que ainda acha onde pôr o cepo e a fogueira ──
    const yard = await page.evaluate(() => {
      const g = window.gameDebug;
      const q = g.quest.lumber();
      return { solid: [[49, 2], [54, 2], [58, 9], [58, 6], [52, 12]].every(([x, y]) => g.world.solid(x, y)), block: q?.blockTile ?? null, pit: q?.pitTile ?? null };
    });
    assert('Quintal: as peças barram o passo', yard.solid, JSON.stringify(yard));
    assert('Quintal: a quest do lenhador ainda acha o cepo e a fogueira', !!yard.block && !!yard.pit, JSON.stringify(yard));
    await put(52, 4, 1, 0);
    await sleep(2000);
    await shot('04-lenha-e-cavalete', { note: 'A pilha de lenha e o cavalete com a serra, encostados na cerca do norte' });
    await put(56, 10, 1, -1);
    await sleep(2000);
    await shot('05-carrinho-e-machado', { note: 'O carrinho de mão e o toco com o machado cravado' });
    await put(53, 14, 0, -1);
    await sleep(2000);
    await shot('06-placa', { note: 'A placa do lenhador ao lado do portão' });
  },
};

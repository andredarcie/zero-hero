// BIOMAS — uma foto de cada região do vale ao meio-dia (world/biomes.ts), para o olho conferir que
// cada lugar se reconhece de cara: o herói vai ao tile andável mais perto do coração de cada bioma.
// Não afirma estética (isso é do olho); afirma só que o lugar escolhido é mesmo daquele bioma.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SPOTS = [
  { biome: 'ash', x: 12, y: 8, label: 'cinzas-noroeste' },
  { biome: 'ash', x: 6, y: 10, label: 'lago-de-lava' },
  { biome: 'stars', x: 42, y: 7, label: 'area-da-vega' },
  { biome: 'meadow', x: 20, y: 22, label: 'prado-da-iris' },
  { biome: 'stars', x: 39, y: 11, label: 'planalto-da-vega' },
  { biome: 'woods', x: 52, y: 12, label: 'mata-do-bram' },
  { biome: 'moss', x: 9, y: 44, label: 'bosque-da-hollis' },
  { biome: 'garden', x: 30, y: 27, label: 'jardim-do-centro' },
  { biome: 'fields', x: 30, y: 47, label: 'campos-do-sul' },
  // as FRONTEIRAS (BIOMAS=fronteira): o olho confere que a passagem é um degradê, não uma emenda
  { biome: 'fronteira', x: 14, y: 12, label: 'fronteira-cinzas-prado' },
  { biome: 'fronteira', x: 24, y: 28, label: 'fronteira-prado-jardim' },
  { biome: 'fronteira', x: 46, y: 18, label: 'fronteira-planalto-mata' },
];

export default {
  name: 'biomas',
  description: 'Uma foto de cada bioma do vale ao meio-dia.',
  needsGame: false,
  async run({ driver, shot, assert, log }) {
    const { page } = driver;
    await page.addInitScript(() => {
      localStorage.setItem('zh.cozy.v1', JSON.stringify({ started: true, introSeen: true }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    const only = (process.env.BIOMAS || '').split(',').filter(Boolean);
    const hour = Number(process.env.BIOMAS_HORA ?? 0.5);
    for (const spot of SPOTS.filter((s) => (only.length ? only.includes(s.biome) : s.biome !== 'fronteira'))) {
      const at = await page.evaluate(([sx, sy, h]) => {
        const s = window.__scene;
        let best = null;
        for (let r = 0; r <= 6 && !best; r += 1) {
          for (let dy = -r; dy <= r && !best; dy += 1) for (let dx = -r; dx <= r; dx += 1) {
            if (!s.isSolidForEntities(sx + dx, sy + dy)) { best = { x: sx + dx, y: sy + dy }; break; }
          }
        }
        best ??= { x: sx, y: sy };
        s.playerWorld.worldX = best.x; s.playerWorld.worldY = best.y;
        s.movementController.interruptMovement(best.x, best.y);
        s.streamChunks(true);
        window.gameTime.set(h);
        return best;
      }, [spot.x, spot.y, hour]);
      await sleep(2500);
      const biome = await page.evaluate(async ([x, y]) => (await import('/src/game/world/biomes.ts')).biomeAt(x, y), [at.x, at.y]);
      log(`  ${spot.label}: herói em (${at.x}, ${at.y}), bioma ${biome}`);
      if (spot.biome === 'fronteira') { await shot(spot.label, { note: `fronteira em (${at.x}, ${at.y}), bioma ${biome}` }); continue; }
      assert(`${spot.label} fica no bioma ${spot.biome}`, biome === spot.biome, `bioma=${biome}`);
      await shot(spot.label, { note: `${spot.biome} em (${at.x}, ${at.y})` });
    }
    // O EDITOR (BIOMAS_EDITOR=1): o tabuleiro e o minimapa mostram os mesmos biomas que o jogo
    if (process.env.BIOMAS_EDITOR) {
      await driver.open('/editor');
      await sleep(8000);
      await shot('editor', { note: 'o editor com os biomas no tabuleiro e no minimapa' });
    }
  },
};

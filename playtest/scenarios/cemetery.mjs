// Cemetery: paint a graveyard out of the tileset's cemetery frames and prove it works.
//
// The art was always in forest_tile_set.png (bottom rows) — what was missing is that the tomb and
// the spiked head were not in SOLID_UPPER_FRAMES, so they lay FLAT on the floor and the hero walked
// straight through them. This scenario paints a real graveyard, photographs it, and asserts the
// three behaviours that separate an object from a sticker:
//
//   1. a tomb BLOCKS (it is in SOLID_UPPER_FRAMES, so ChunkManager.isCellBlocked says so);
//   2. bones DON'T block — they are ground litter and must stay walk-through;
//   3. the hero cannot walk into a tomb (the block is real, not just a flag).
//
// The world is swapped by intercepting the world.json fetch, so this exercises the true boot path
// (PreloadScene -> setWorldData -> World3D.buildTerrain) and never touches public/world.json.

const CEM = {
  stone: 23, stoneMoss: 24, tomb: 25, spikedHead: 22,
  skull: 27, bones: 28, cracked: 29, cracked2: 30, grave: 31, slabMoss: 32,
};
const DEAD_TREE = 21;

// Chunk (4,7) spans tiles x 48..59, y 84..95 — the hero starts at (54,92), inside it.
const CX = 4, CY = 7, ORIGIN_X = 48, ORIGIN_Y = 84;
const HERO = { x: 54, y: 94 };

// Tomb rows with walkable aisles between them. Local (col,row) inside the chunk.
const TOMBS = [];
for (const row of [2, 5, 8]) for (const col of [1, 3, 5, 7, 9]) TOMBS.push([col, row]);
const BONES = [[2, 3], [6, 6], [10, 9], [4, 9], [8, 3]];
const SKULLS = [[8, 6], [2, 6], [10, 3]];

const toWorld = ([col, row]) => ({ x: ORIGIN_X + col, y: ORIGIN_Y + row });

export default {
  name: 'cemetery',
  description: 'Paint a graveyard from the cemetery tiles; assert tombs block and bones do not.',
  needsGame: true,
  async run({ driver, shot, assert }) {
    const { page } = driver;

    // Serve a cemetery-painted world.json, then reboot the game onto it.
    await page.route('**/world.json', async (route) => {
      const res = await route.fetch();
      const world = await res.json();
      const chunk = world.chunks.find((c) => c.cx === CX && c.cy === CY);
      if (!chunk) throw new Error(`chunk ${CX},${CY} not found`);

      for (let row = 0; row < 12; row += 1) {
        for (let col = 0; col < 12; col += 1) {
          // Consecrated ground: stone paving, weathered with moss and cracks.
          const n = (col * 7 + row * 5) % 11;
          chunk.ground[row][col] = n === 0 ? CEM.cracked
            : n === 1 ? CEM.cracked2
              : n === 2 ? CEM.slabMoss
                : n < 5 ? CEM.stoneMoss
                  : CEM.stone;
          // Clear the forest out of the plot — and every painted collision with it, so that
          // anything that blocks here blocks BECAUSE of SOLID_UPPER_FRAMES and nothing else.
          chunk.upper[row][col] = null;
          chunk.collisions[row][col] = false;
        }
      }
      chunk.ground[7][6] = CEM.grave;              // one open grave, waiting
      for (const [col, row] of TOMBS) chunk.upper[row][col] = CEM.tomb;
      for (const [col, row] of BONES) chunk.upper[row][col] = CEM.bones;
      for (const [col, row] of SKULLS) chunk.upper[row][col] = CEM.skull;
      chunk.upper[11][5] = CEM.spikedHead;         // a warning at the south gate
      chunk.upper[11][6] = CEM.spikedHead;
      chunk.upper[0][0] = DEAD_TREE;               // dead trees at the corners
      chunk.upper[0][11] = DEAD_TREE;

      await route.fulfill({ response: res, json: world });
    });

    await driver.open('/?play');
    await driver.startGame();
    await page.waitForTimeout(1200);

    // Stand the hero in the middle aisle, looking up the rows.
    await page.evaluate(([x, y]) => {
      const s = window.__scene;
      s.enemyManager?.despawnAll();
      s.playerWorld = { worldX: x, worldY: y };
      s.movementController.syncPlayerToWorld(x, y, s.tileSize);
    }, [HERO.x, HERO.y]);
    await driver.walk('down', 1);
    await driver.walk('up', 1);
    await page.waitForTimeout(1500);
    await shot('cemetery-night');

    // Same frame with the lights up — the night lighting is beautiful and hides geometry.
    await page.evaluate(() => { window.hd3d.ambient = 0.85; window.hd3d.moon = 0.9; });
    await page.waitForTimeout(600);
    await shot('cemetery-lit');
    await page.evaluate(() => { window.hd3d.ambient = 0.22; window.hd3d.moon = 0.35; });

    // ── the assertions ──────────────────────────────────────────────────────────
    const blocking = await page.evaluate(([tombs, bones, skulls, ox, oy]) => {
      const cm = window.__scene.chunkManager;
      const at = ([col, row]) => cm.isCellBlocked(ox + col, oy + row);
      return {
        tombs: tombs.map(at),
        bones: bones.map(at),
        skulls: skulls.map(at),
      };
    }, [TOMBS, BONES, SKULLS, ORIGIN_X, ORIGIN_Y]);

    assert('Every tomb blocks', blocking.tombs.every(Boolean), JSON.stringify(blocking.tombs));
    assert('Bones stay walk-through', blocking.bones.every((b) => !b), JSON.stringify(blocking.bones));
    assert('Skulls stay walk-through', blocking.skulls.every((b) => !b), JSON.stringify(blocking.skulls));

    // And the block is real: park the hero under a tomb and try to walk into it.
    const tomb = toWorld(TOMBS[0]);
    await page.evaluate(([x, y]) => {
      const s = window.__scene;
      s.playerWorld = { worldX: x, worldY: y };
      s.movementController.syncPlayerToWorld(x, y, s.tileSize);
    }, [tomb.x, tomb.y + 1]);
    await page.waitForTimeout(400);
    await driver.walk('up', 1);
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({ ...window.__scene.playerWorld }));
    assert(
      'Hero cannot walk into a tomb',
      after.worldY === tomb.y + 1,
      `tomb at (${tomb.x},${tomb.y}); hero stayed at y=${after.worldY}, wanted ${tomb.y + 1}`,
    );
    await shot('cemetery-tomb-blocks');
  },
};

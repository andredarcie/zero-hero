// Tour: teleport the hero to the world's visual landmarks and photograph each one.
// An investigation tool, not a regression test — the shots feed visual design decisions.
const SPOTS = [
  { name: 'bridge', x: 46, y: 92 },   // the river runs along x=44; bridgeSpot at 44,92
  { name: 'river-north', x: 46, y: 78 },
  { name: 'lava', x: 57, y: 62 },     // lava field 55-58,56-59 sits up-screen from here
  { name: 'lava-close', x: 57, y: 60 }, // right at the field's lip
  { name: 'north-camp', x: 52, y: 67 }, // unlit campfire 52,64 + locked door
  { name: 'west-camp', x: 38, y: 92 }, // unlit campfire 36,91
  { name: 'forest-wall', x: 54, y: 94 }, // deep in the packed southern tree rows
  { name: 'world-edge', x: 5, y: 48 },  // the void margin past the last real chunk
];

export default {
  name: 'tour',
  description: 'Photograph the world landmarks (river, lava, unlit camps) for visual review.',
  needsGame: true,
  async run({ driver, shot }) {
    const { page } = driver;
    for (const spot of SPOTS) {
      await page.evaluate(([x, y]) => {
        const s = window.__scene;
        s.enemyManager?.despawnAll();
        s.playerWorld = { worldX: x, worldY: y };
        s.movementController.syncPlayerToWorld(x, y, s.tileSize);
      }, [spot.x, spot.y]);
      // A step in place makes the streamer notice the new chunk; then let props settle in.
      await driver.walk('down', 1);
      await driver.walk('up', 1);
      await page.waitForTimeout(1500);
      await shot(`tour-${spot.name}`);
    }
  },
};

import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 4 });
await page.goto('http://localhost:5178/?play', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
await page.waitForTimeout(1000);

const at = await page.evaluate(() => {
  const s = window.__scene;
  // Kill the baked AO (vertex colours) on the ground: does the checkerboard survive?
  s.world3d.scene.traverse((o) => {
    if (o.material && o.material.vertexColors) {
      o.material.vertexColors = false;
      o.material.needsUpdate = true;
    }
  });
  const cf = s.campfires.find((c) => c.isLit);
  return s.world3d.projectTile(cf.worldX, cf.worldY, 0);
});
await page.waitForTimeout(400);
await page.evaluate(() => window.__scene.scene.pause());
await page.screenshot({
  path: 'playtest/_check.png',
  clip: { x: Math.max(0, at.x - 60), y: Math.max(0, at.y - 30), width: 240, height: 170 },
});
await browser.close();

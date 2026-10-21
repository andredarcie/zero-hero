// SEM PAREDE INVISIVEL — todo tile que barra o heroi tem de ter um MOTIVO DESENHADO: arvore ou
// rocha de pe, mar, uma peca que bloqueia (arbusto, rocha, agua, fogueira, portao...), um NPC ou
// a espada fincada. Colisao pintada em chao vazio e a recusa que o jogador nao consegue ler.
const SOLID_UPPER = [3, 4, 14, 15, 16, 17, 18, 21, 22, 25, 36, 37, 39, 40];
const PROP_LISTS = ['campfires', 'hearths', 'gardenGates', 'dryBushes', 'lockedDoors', 'swingGates',
  'dryTrees', 'dryShrubs', 'rocks', 'tallGrasses', 'moonflowers', 'plantSpots', 'toolboxes', 'furnaces',
  'altars', 'waterTiles'];

export default {
  name: 'sem-parede',
  description: 'Nenhum tile bloqueia o heroi sem algo visivel nele.',
  needsGame: false,
  async run({ driver, assert }) {
    const { page } = driver;
    await page.addInitScript(() => {
      localStorage.setItem('zh.cozy.v1', JSON.stringify({ started: true, introSeen: true }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await page.waitForTimeout(800);
    const odd = await page.evaluate(([solidUpper, lists]) => {
      const s = window.__scene;
      const out = [];
      for (let y = 0; y < 60; y += 1) {
        for (let x = 0; x < 60; x += 1) {
          if (!s.isSolidForEntities(x, y)) continue;
          const t = s.chunkManager.getTile(x, y);
          if (t.upper !== null && solidUpper.includes(t.upper)) continue;
          if (t.ground === 33) continue;
          if (s.plantedSwordTile?.x === x && s.plantedSwordTile?.y === y) continue;
          if (s.npcManager.hasNpcAt(x, y)) continue;
          if (lists.some((n) => s[n].some((o) => o.worldX === x && o.worldY === y && o.blocking))) continue;
          out.push(`${x},${y}${t.collision ? ' (colisao pintada)' : ''}`);
        }
      }
      return out;
    }, [SOLID_UPPER, PROP_LISTS]);
    assert('Nenhuma parede invisivel no mundo', odd.length === 0, odd.slice(0, 20).join(' '));
  },
};

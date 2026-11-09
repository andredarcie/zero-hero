// MARCAS — o vale MUDA quando um pedido fecha: o marco de pedras da Thea e o cesto da Shui (ver
// scenes/game/QuestMarks). Sem pedidos fechados nenhuma marca aparece; com eles, as duas; e ao vivo,
// o pedido da Shui fechando faz o cesto surgir na hora. E os NPCs tem vida: cumprimentam e respiram.
//
// (A versao anterior cobrava quatro marcas — o cavalete da Sisi e a lenha do Marco com a fogueira
// acesa de dia — e a Thea recebendo pedras. Esse desenho dos pedidos mudou: hoje a Thea pede o
// telescopio, e so os dois pedidos acima deixam marca.)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SHUI_THREE = {
  'radiationSuit/deliver:porcini': 1, 'radiationSuit/deliver:morel': 1, 'radiationSuit/deliver:puffball': 1,
};
const ALL_DONE = { ...SHUI_THREE, 'radiationSuit/deliver:inkCap': 1, 'astronaut/sky': 1 };
const TEXTURE = { astronaut: 'quest-cairn', radiationSuit: 'quest-basket' };

const boot = async (driver, save) => {
  const { page } = driver;
  // O save e gravado FORA do jogo (numa pagina do mesmo servidor sem ele): com a partida aberta, ela grava o
  // proprio save ao sair e apaga o que o cenario escreveu — era por isso que o "tudo feito" nascia vazio.
  await page.goto(new URL('/world.json', page.url()).href);
  await page.evaluate((s) => localStorage.setItem('zh.cozy.v1', JSON.stringify(s)), save);
  await driver.open('/?play');
  await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
  await sleep(700);
  return page.evaluate(() => window.gameDebug.quest.marks());
};

export default {
  name: 'marcas',
  description: 'O vale responde aos pedidos (o marco da Thea, o cesto da Shui) e os NPCs tem vida.',
  needsGame: false,
  async run({ driver, shot, assert }) {
    const { page } = driver;
    await driver.open('/');
    const fresh = await boot(driver, { started: true, introSeen: true, questProgress: {} });
    assert('Antes dos pedidos nenhuma marca aparece', fresh.length === 2 && fresh.every((m) => !m.done && m.texture === null), JSON.stringify(fresh));
    assert('Toda marca achou um tile', fresh.every((m) => m.tile), JSON.stringify(fresh));

    const all = await boot(driver, { started: true, introSeen: true, questProgress: ALL_DONE });
    assert('Com os pedidos fechados, as duas marcas aparecem',
      all.length === 2 && all.every((m) => m.done && m.texture === TEXTURE[m.dialog]), JSON.stringify(all));
    for (const m of all) {
      await page.evaluate(([x, y]) => window.gameDebug.hero.teleport(x, y + 2), [m.tile.x, m.tile.y]);
      await sleep(900);
      await shot(`marca-${m.dialog}`, { note: m.dialog });
    }

    // Ao vivo: a Shui com tres cogumelos de quatro; o quarto chega e o cesto surge ali.
    await boot(driver, { started: true, introSeen: true, questProgress: SHUI_THREE });
    const thea = await page.evaluate(() => window.gameDebug.world.npcHome('astronaut'));
    await page.evaluate(([x, y]) => window.gameDebug.hero.teleport(x, y + 1), [thea.x, thea.y]);
    await sleep(500);
    const greeted = await page.evaluate(([x, y]) => window.gameDebug.npcs.greeted(x, y), [thea.x, thea.y]);
    assert('Chegar perto faz a Thea dar oi (pulinho)', greeted, '');
    const breath = await page.evaluate(async () => {
      const sizes = [];
      for (let i = 0; i < 6; i += 1) {
        sizes.push(window.gameDebug.npcs.bodyHeight('astronaut'));
        await new Promise((r) => setTimeout(r, 300));
      }
      return sizes;
    });
    assert('Os NPCs respiram', Math.max(...breath) - Math.min(...breath) > 0.01, JSON.stringify(breath.map((v) => v?.toFixed(3))));

    const before = await page.evaluate(() => window.gameDebug.quest.marks().find((m) => m.dialog === 'radiationSuit'));
    await page.evaluate(() => window.gameDebug.quest.event({ type: 'deliver', dialog: 'radiationSuit', item: 'inkCap', units: 1 }));
    await sleep(1200);
    const after = await page.evaluate(() => window.gameDebug.quest.marks().find((m) => m.dialog === 'radiationSuit'));
    assert('Fechado o pedido da Shui, o cesto surge na hora', !before.done && after.done && after.texture === TEXTURE.radiationSuit, JSON.stringify({ before, after }));
    await page.evaluate(([x, y]) => window.gameDebug.hero.teleport(x, y + 2), [after.tile.x, after.tile.y]);
    await sleep(900);
    await shot('cesto-surgindo', { note: 'O cesto da Shui, que acabou de aparecer' });
  },
};

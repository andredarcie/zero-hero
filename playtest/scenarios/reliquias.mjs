// AS RELÍQUIAS ENTERRADAS E A TORRE DO CUME (pedido do autor, 2026-11-18): trincas espalhadas pelo vale guardam coisas
// que marcaram a vida de quem fez o jogo. De pé em cima da trinca, o X cava no pé (a pá fincada reto no chão); a coisa
// pula do buraco, gira no ar, cai na mão do Zero, e a cerimônia diz o que é; a trinca vira terra revirada e o caderno
// ganha a página. Na ponta do cume do jardim alto, a torre de telefonia, com a luz vermelha piscando.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A fita de 2001, perto da astronauta. */
const RELIC = 'odyssey2001';

export default {
  name: 'reliquias',
  description: 'A pá cava a trinca no pé, a relíquia pula para a mão e vai para o caderno; a torre do cume pisca.',
  needsGame: false,
  async run({ driver, shot, assert, log }) {
    const { page } = driver;
    const g = (fn, arg) => page.evaluate(fn, arg);
    const teleport = async (x, y, dx, dy) => { await g(([a, b, c, d]) => window.gameDebug.hero.teleport(a, b, c, d), [x, y, dx, dy]); await sleep(500); };
    await page.addInitScript(() => {
      if (sessionStorage.getItem('reliquias')) return;
      sessionStorage.setItem('reliquias', '1');
      localStorage.setItem('zh.cozy.v1', JSON.stringify({
        started: true, introSeen: true, day: 2, clock: 0.42, respawn: { worldX: 41, worldY: 15 }, mistCleared: true,
      }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await sleep(1500);

    // ── AS TRINCAS ────────────────────────────────────────────────────────────────────────────────────────────────
    const list = await g(() => window.gameDebug.relics.list());
    assert('Onze relíquias enterradas, nenhuma achada ainda', list.length === 11 && list.every((r) => !r.found), JSON.stringify(list));
    const spot = list.find((r) => r.kind === RELIC);
    await g(() => { window.gameDebug.items.markSeen('shovel'); window.gameDebug.items.take('shovel'); });
    await teleport(spot.x, spot.y + 1, 0, -1);
    await g(() => window.gameDebug.verbs.hidePrompt());
    await g(() => window.gameDebug.scene.dollyTo(0.62, 10));
    await sleep(900);
    await shot('00-trinca', { note: 'A trinca no chão, à frente do Zero: ali tem relíquia' });

    // ── A CAVADA NO PÉ ────────────────────────────────────────────────────────────────────────────────────────────
    await teleport(spot.x, spot.y, 0, 1);
    await sleep(400);
    const prompt = await g(([x, y]) => window.gameDebug.verbs.prompt(x, y), [spot.x, spot.y]);
    assert('De pé em cima da trinca, o balão diz Cavar', prompt.some((l) => /Cavar|Dig/u.test(l)), JSON.stringify(prompt));
    const here = await g(([x, y]) => window.gameDebug.relics.at(x, y), [spot.x, spot.y]);
    assert('A pá cava ali, no pé', here.buried === RELIC && here.underfoot, JSON.stringify(here));
    await shot('01-cavar-no-pe', { note: 'Em cima da trinca: "Cavar"' });
    await page.keyboard.press('x');
    await sleep(170);
    await shot('02-pa-no-alto', { note: 'A pá sobe na frente do corpo' });
    await sleep(140);
    await shot('03-pa-fincada', { note: 'A pá fincada reto no chão, no pé dele' });
    await sleep(700);
    await shot('04-reliquia-pulando', { note: 'A coisa pula do buraco, girando' });
    await page.waitForFunction(() => window.gameDebug.relics.ceremony(), null, { timeout: 8000 });
    await sleep(1700);
    await shot('05-voce-encontrou', { note: 'A cerimônia: "Uma relíquia: 2001!"' });
    await page.waitForFunction(() => !window.gameDebug.relics.ceremony() && !window.gameDebug.getState().cutsceneActive, null, { timeout: 12000 });
    const after = await g(([x, y]) => ({ list: window.gameDebug.relics.list(), at: window.gameDebug.relics.at(x, y) }), [spot.x, spot.y]);
    assert('Achada: a relíquia saiu da terra e a trinca não cava mais', after.list.find((r) => r.kind === RELIC).found && !after.at.buried && !after.at.underfoot, JSON.stringify(after.at));
    await teleport(spot.x, spot.y + 1, 0, -1);
    await g(() => window.gameDebug.verbs.hidePrompt());
    await sleep(500);
    await shot('06-terra-revirada', { note: 'No lugar da trinca, a terra revirada' });
    await g(() => window.gameDebug.scene.dollyTo(1, 10));

    // ── O CADERNO ─────────────────────────────────────────────────────────────────────────────────────────────────
    await g((kind) => window.gameDebug.camp.openNotebook(kind), RELIC);
    await sleep(700);
    const book = await g(() => window.gameDebug.camp.notebook());
    const kinds = list.map((r) => r.kind);
    const relics = book.pages.filter((p) => kinds.includes(p.kind));
    assert('O caderno tem as onze relíquias, e a de 2001 já é conhecida', relics.length === 11 && relics.find((p) => p.kind === RELIC).known && relics.filter((p) => p.known).length === 1, JSON.stringify(relics));
    await shot('07-caderno-reliquia', { note: 'A página da relíquia no caderno de campo' });
    await g(() => window.gameDebug.camp.openNotebook('journey'));
    await sleep(500);
    await shot('08-caderno-vulto', { note: 'Uma relíquia ainda enterrada: só o vulto' });
    await g(() => window.gameDebug.camp.closeNotebook());
    await sleep(500);

    // ── O DISQUETE DO TINY RPG STUDIO, DE FRENTE ──────────────────────────────────────────────────────────────────
    const disk = list.find((r) => r.kind === 'tinyRpgStudio');
    await teleport(disk.x - 1, disk.y, 1, 0);
    await sleep(400);
    await g(() => window.gameDebug.verbs.hidePrompt());
    await shot('08b-trinca-do-disquete', { note: 'A trinca do disquete, à frente do Zero' });
    await page.keyboard.press('x');
    await page.waitForFunction(() => window.gameDebug.relics.ceremony(), null, { timeout: 8000 });
    await sleep(1700);
    await shot('08c-disquete-encontrado', { note: 'Você encontrou Tiny RPG Studio!' });
    await page.waitForFunction(() => !window.gameDebug.relics.ceremony() && !window.gameDebug.getState().cutsceneActive, null, { timeout: 12000 });
    const diskDone = await g(() => window.gameDebug.relics.list().find((r) => r.kind === 'tinyRpgStudio').found);
    assert('De frente, o golpe da pá tira o disquete da terra', diskDone, '');
    await g((kind) => window.gameDebug.camp.openNotebook(kind), 'tinyRpgStudio');
    await sleep(600);
    await shot('08d-caderno-disquete', { note: 'A página do Tiny RPG Studio no caderno' });
    await g(() => window.gameDebug.camp.closeNotebook());
    await sleep(500);

    // ── A TORRE DO CUME ───────────────────────────────────────────────────────────────────────────────────────────
    const tower = await g(() => window.gameDebug.relics.tower());
    assert('A torre está na ponta do cume e barra o corpo', tower && tower.solid, JSON.stringify(tower));
    // de longe, a torre inteira
    await teleport(tower.x - 2, tower.y + 6, 0, -1);
    await g(() => window.gameDebug.verbs.hidePrompt());
    await g(() => window.gameDebug.scene.dollyTo(2.1, 10));
    await sleep(1400);
    await shot('09-torre-inteira-de-dia', { note: 'A torre de telefonia na ponta do cume, de dia, vista de longe' });
    const plumb = async (where) => {
      const t = await g(() => window.gameDebug.relics.tower());
      log(`  torre ${where}: fora do prumo ${t.lean.toFixed(2)} px (deitada para trás ${t.back.toFixed(2)}°, paralela à tela)`);
      assert(`A torre fica em pé na tela (${where}): o topo em cima do pé`, Math.abs(t.lean) < 1.5, JSON.stringify(t));
      return t;
    };
    await plumb('de longe');
    // como o jogador vê: no zoom de sempre, ao lado dela e da frente da fogueira
    await g(() => window.gameDebug.scene.dollyTo(1, 10));
    await teleport(tower.x - 1, tower.y + 1, 0, -1);
    await g(() => window.gameDebug.verbs.hidePrompt());
    await g(() => window.gameTime.set(0.93));
    await sleep(1500);
    await page.waitForFunction(() => window.gameDebug.relics.tower().lit > 0.95, null, { timeout: 6000 });
    await shot('10-torre-de-noite-acesa', { note: 'De noite, ao lado da torre: as luzes vermelhas acesas' });
    const beside = await plumb('ao lado dela');
    // "fixa e não torta e nunca se mexer ao mover o herói" (o autor, 2026-11-19): andar de um lado para o outro não gira
    // a torre — ela só tem a inclinação da câmera, e a câmera que segue o herói só anda
    for (const dx of [-3, 2]) {
      await teleport(tower.x + dx, tower.y + 2, 0, -1);
      await g(() => window.gameDebug.verbs.hidePrompt());
      await sleep(400);
      const t = await plumb(`com o herói em ${tower.x + dx},${tower.y + 2}`);
      assert('Andando, a torre não se mexe: a mesma inclinação de antes', Math.abs(t.back - beside.back) < 0.01, `${beside.back} → ${t.back}`);
    }
    await teleport(tower.x - 1, tower.y + 1, 0, -1);
    await g(() => window.gameDebug.verbs.hidePrompt());
    await sleep(400);
    await page.waitForFunction(() => window.gameDebug.relics.tower().lit < 0.03, null, { timeout: 6000 });
    await shot('11-torre-de-noite-apagada', { note: 'De noite: as luzes apagadas, no intervalo do piscar' });
    await teleport(tower.x - 2, tower.y + 4, 0, -1);
    await g(() => window.gameDebug.verbs.hidePrompt());
    await page.waitForFunction(() => window.gameDebug.relics.tower().lit > 0.95, null, { timeout: 6000 });
    await shot('12-torre-da-fogueira', { note: 'De noite, da frente da fogueira do fim, no zoom de sempre' });
    await plumb('da fogueira');
    await g(() => window.gameDebug.scene.dollyTo(2.1, 10));
    await sleep(600);
    await page.waitForFunction(() => window.gameDebug.relics.tower().lit > 0.95, null, { timeout: 6000 });
    await shot('13-torre-inteira-de-noite', { note: 'De noite, de longe: a torre inteira com as três luzes' });
    const blink = await g(async () => {
      const seen = [];
      for (let i = 0; i < 40; i += 1) { seen.push(window.gameDebug.relics.tower().lit); await new Promise((r) => setTimeout(r, 75)); }
      return { min: Math.min(...seen), max: Math.max(...seen) };
    });
    log(`  luz da torre em 3 s: ${JSON.stringify(blink)}`);
    assert('A luz da torre pisca (acende e apaga)', blink.max > 0.9 && blink.min < 0.1, JSON.stringify(blink));
    await g(() => window.gameTime.set(0.42));
    await g(() => window.gameDebug.scene.dollyTo(1, 10));
  },
};

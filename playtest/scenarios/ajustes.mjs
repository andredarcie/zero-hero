// AJUSTES — a lista do autor jogando, item por item (ver progress.md, "os ajustes jogando"). Cada bloco prova
// um pedido no jogo de verdade e tira a foto que o olho confere:
//
//  1. a cadeira de madeira na beira do lago, sem mato na frente     8. guardar o cogumelo na bolsa de couro
//  2. a 2ª conversa do mago sem tarefa nem nome de vizinho           9. a Shui diz o nome e a curiosidade
//  3. a espada fincada se descreve num pensamento                   10. nada de graveto nem pedra soltos
//  4. sem os portões e a pedra perto do mago                         11. sem o banco do morro que dava zoom
//  5. sem o balanço                                                  12. (pedra solta: junto do 10)
//  6. a Shui acena para quem aparece na borda da serra             13. a Thea independente: carvão no lago de lava
//  7. a luz de ganhar item sem borda quadrada                        14. o lago de lava sem estourar
//                                                                    15. a tela de título só com a mata
//
// O herói é posto no lugar pela cena (como em `biomas`): o que se prova é o que acontece ali, não o caminho.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'ajustes',
  description: 'Os ajustes do autor jogando: cadeira do lago, mago, espada, portões, balanço, aceno da Shui, luz do item, bolsa de couro, nomes dos cogumelos, sem soltos, carvão da Thea, lava, título.',
  needsGame: false,
  async run({ driver, shot, assert, log }) {
    const { page } = driver;
    const state = () => page.evaluate(() => window.gameDebug?.getState() ?? null);
    const put = (x, y, dx, dy) => page.evaluate(([px, py, fx, fy]) => {
      const g = window.gameDebug;
      g.hero.teleport(px, py, fx, fy);
    }, [x, y, dx, dy]);
    const press = async (key, hold = 70, after = 200) => {
      await page.keyboard.down(key);
      await sleep(hold);
      await page.keyboard.up(key);
      await sleep(after);
    };
    const dialogLines = () => page.evaluate(() => (window.gameDebug.dialog.lines() ?? null));
    const closeDialog = async () => {
      for (let i = 0; i < 40; i += 1) {
        const st = await state();
        if (!st?.dialogOpen && !st?.itemGetOpen && !st?.cutsceneActive) return;
        if (st.dialogOpen || st.itemGetOpen) await press('z', 60, 300);
        else await sleep(250);
      }
    };

    await page.addInitScript(() => {
      localStorage.setItem('zh.cozy.v1', JSON.stringify({ started: true, introSeen: true }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await sleep(1200);
    await page.evaluate(() => window.gameTime.set(0.5));

    // ── 10/12/4/1/13. O MUNDO NO DISCO ────────────────────────────────────────────────────────
    const world = await page.evaluate(async () => (await fetch('/world.json', { cache: 'no-store' })).json());
    const pickups = world.chunks.flatMap((c) => c.pickups ?? []);
    const at = (x, y) => world.props.filter((p) => p.worldX === x && p.worldY === y).map((p) => p.type);
    const loose = pickups.filter((p) => p.type === 'wood' || p.type === 'stone');
    assert('10. Nenhum graveto nem pedra solto no mapa', loose.length === 0, JSON.stringify(loose));
    assert('4. Os dois portões de metal saíram', !world.props.some((p) => p.type === 'swingGate'), '');
    assert('4. A pedra ao lado dos portões saiu', !at(21, 49).includes('rock'), at(21, 49).join());
    const pocketTrees = await page.evaluate(() => [[20, 49], [21, 49], [20, 50], [22, 50]].every(([x, y]) => window.gameDebug.world.solid(x, y)));
    assert('4. No lugar deles, árvores', pocketTrees, '');
    assert('1. Nada de mato alto na frente da cadeira do lago', !at(42, 51).includes('tallGrass'), at(42, 51).join());
    assert('13. Os veios de carvão estão na margem do lago de lava', at(10, 6).includes('coalRock') && at(4, 9).includes('coalRock'), `${at(10, 6)} ${at(4, 9)}`);
    const live = await state();
    assert('10. Nenhum graveto nem pedra solto no jogo', !live.groundItems.some((g) => g.kind === 'wood' || g.kind === 'stone'), JSON.stringify(live.groundItems));

    // ── 1/5/11. OS ACHADOS: a cadeira, sem balanço e sem o banco do morro ────────────────────
    const finds = await page.evaluate(() => {
      const v = window.gameDebug.valley;
      return { lake: v.findAt(41, 50), hill: v.findAt(36, 43), swing: v.findAt(4, 50) };
    });
    assert('1. Na beira do lago há uma cadeira', finds.lake === 'chair', String(finds.lake));
    assert('5. O balanço saiu', finds.swing === null, String(finds.swing));
    assert('11. O banco do alto do morro (o zoom torto) saiu', finds.hill === null, String(finds.hill));
    await put(41, 51, 0, -1);
    await sleep(1500);
    const lakeVerb = await page.evaluate(() => window.gameDebug.verbs.prompt(41, 51));
    assert('1. Diante da cadeira o balão oferece sentar, e nada de foice', lakeVerb.length > 0 && !lakeVerb.some((l) => /cortar|foice|cut/i.test(l)), JSON.stringify(lakeVerb));
    await shot('01-cadeira-do-lago', { note: 'A cadeira de madeira na beira do lago, sem mato na frente' });
    await press('z', 60, 2600);
    await shot('01b-sentado-na-cadeira', { note: 'Sentado na cadeira, olhando o lago' });
    await press('ArrowDown', 80, 900);

    // ── 2. A 2ª CONVERSA DO MAGO ──────────────────────────────────────────────────────────────
    const wizard = world.chunks.flatMap((c) => c.npcs).find((n) => n.type === 'wizard');
    await put(wizard.worldX, wizard.worldY + 1, 0, -1);
    await sleep(800);
    await press('z', 60, 600);
    const wizardSays = (await dialogLines()) ?? [];
    log(`  mago: ${wizardSays.join(' / ')}`);
    assert('2. O mago fala da 2ª vez', wizardSays.length > 0, '');
    assert('2. Sem nome de vizinho nem lista de tarefa', !wizardSays.some((l) => /Shui|Sisi|Marco|Thea|vizinhos/.test(l)), wizardSays.join(' / '));
    assert('2. Ele fala de encontrar um sentido', wizardSays.some((l) => /sentido|meaning/i.test(l)), wizardSays.join(' / '));
    await shot('02-mago', { note: 'A 2ª conversa do mago' });
    await closeDialog();

    // ── 3. A ESPADA ───────────────────────────────────────────────────────────────────────────
    const sword = await page.evaluate(() => window.gameDebug.scene.sword().tile);
    assert('3. A espada está fincada', sword !== null, '');
    await put(sword.x, sword.y + 1, 0, -1);
    await sleep(800);
    await press('z', 60, 900);
    const swordSays = (await dialogLines()) ?? [];
    log(`  espada: ${swordSays.join(' / ')}`);
    assert('3. Tocar a espada mostra a descrição dela', swordSays.some((l) => /escuridão|darkness/i.test(l)) && swordSays.some((l) => /luz|light/i.test(l)), swordSays.join(' / '));
    await shot('03-espada', { note: 'A descrição poética da espada' });
    await closeDialog();

    // ── 7. A LUZ DE GANHAR ITEM ───────────────────────────────────────────────────────────────
    await page.evaluate(() => window.gameDebug.items.showItemGet('axe'));
    await sleep(1500);
    const blends = await page.evaluate(() => window.gameDebug.items.itemGetCard().imageBlends);
    assert('7. Nenhuma luz da cerimônia usa ADD (era o que desenhava o quadrado)', blends.length > 0 && blends.every((b) => b !== 1), JSON.stringify(blends));
    await shot('07-luz-do-item', { note: 'O halo some redondo, sem borda reta' });
    await page.waitForFunction(() => window.gameDebug.items.itemGetClosed(), null, { timeout: 8000 });

    // ── 8. A BOLSA DE COURO ───────────────────────────────────────────────────────────────────
    await put(30, 40, 0, 1);
    await sleep(800);
    await page.evaluate(() => window.gameDebug.forage.basket('porcini', 30, 41));
    await sleep(120);
    const bag = await page.evaluate(() => ({ active: window.gameDebug.forage.bagStashActive(), thought: window.gameDebug.forage.thought().icon }));
    assert('8. Colhido, o cogumelo vai para a bolsa de couro', bag.active, '');
    assert('8. Sem o balão de pensamento da cesta', bag.thought === null, String(bag.thought));
    await sleep(250);
    await shot('08a-bolsa-aparece', { note: 'A bolsa à direita, o cogumelo na mão esquerda' });
    await sleep(500);
    await shot('08b-cogumelo-voando', { note: 'O cogumelo em arco, por cima da cabeça' });
    await sleep(500);
    await shot('08c-bolsa-fecha', { note: 'A bolsa engole, fecha o fecho e balança' });
    await page.waitForFunction(() => !window.gameDebug.forage.bagStashOpen(), null, { timeout: 5000 });
    assert('8. A animação termina sozinha', true, '');

    // ── 9. A SHUI DIZ O NOME E A CURIOSIDADE ────────────────────────────────────────────────
    // A Shui mora em (5, 40) (world.json); o NPC só existe na cena quando o pedaço do mapa dela está carregado.
    const shui = world.chunks.flatMap((c) => c.npcs).find((n) => n.type === 'radiationSuit');
    await put(shui.worldX, shui.worldY + 1, 0, -1);
    await sleep(800);
    await press('z', 60, 900); // a 1ª conversa: o pedido e a faca
    await closeDialog();
    await page.evaluate(() => window.gameDebug.forage.addToBasket('morel'));
    await press('z', 60, 300);
    await page.waitForFunction(() => window.gameDebug?.getState()?.dialogOpen === true, null, { timeout: 8000 }).catch(() => {});
    const shuiSays = (await dialogLines()) ?? [];
    log(`  Shui: ${shuiSays.join(' / ')}`);
    const named = shuiSays.findIndex((l) => /Ah, uma? (porcini|morchela)|Ah, an? (porcini|yellow morel)/i.test(l));
    assert('9. Ela diz o nome do cogumelo', named >= 0, shuiSays.join(' / '));
    assert('9. E logo depois a curiosidade dele', named >= 0 && shuiSays[named + 1] && !/^Ah,/.test(shuiSays[named + 1]), shuiSays.join(' / '));
    await shot('09-shui-nomeia', { note: 'A Shui dizendo o nome do cogumelo' });
    await closeDialog();

    // ── 6. O TCHAU DA SHUI, DA BORDA DA SERRA ───────────────────────────────────────────────
    await page.evaluate(() => window.gameDebug.forage.resetShuiWave());
    await put(4, 44, 0, -1);
    await sleep(600);
    const wave = await page.evaluate(() => window.gameDebug.forage.shuiWaving());
    const where = await page.evaluate(() => ({ hero: window.gameDebug.world.relief(4, 44), front: window.gameDebug.world.relief(4, 43) }));
    log(`  serra: herói no nível ${where.hero}, à frente ${where.front}`);
    assert('6. Na borda da serra, olhando para ela, a Shui acena', wave, JSON.stringify(where));
    await sleep(150);
    await shot('06-shui-acena', { note: 'A Shui acenando lá de baixo' });
    const waveFrame = await page.evaluate(() => window.gameDebug.npcs.bodyFrame(5, 40) ?? null);
    assert('6. O aceno é o próprio sprite dela, com o braço erguido (nada colado por cima)', waveFrame === 'shui-wave', String(waveFrame));
    await page.waitForFunction(() => !window.gameDebug.forage.shuiWaveOpen(), null, { timeout: 5000 });
    const restFrame = await page.evaluate(() => window.gameDebug.npcs.bodyFrame(5, 40) ?? null);
    assert('6. Depois do aceno ela volta ao quadro de sempre', restFrame === 'npcs', String(restFrame));
    await sleep(600);
    const again = await page.evaluate(() => window.gameDebug.forage.shuiWaveOpen());
    assert('6. Uma vez por subida (não fica acenando sem parar)', !again, '');
    await put(5, 47, 0, 1);
    await sleep(500);
    const fromBelow = await page.evaluate(() => window.gameDebug.forage.shuiWaveOpen());
    assert('6. Sem subir a serra, ela não acena', !fromBelow, '');

    // ── 14. O LAGO DE LAVA ────────────────────────────────────────────────────────────────────
    const lava = await page.evaluate(() => {
      const tiles = window.gameDebug.props.lavaLight();
      const scales = tiles.map((t) => t.scale);
      const lake = tiles.filter((t) => t.x <= 10 && t.y <= 9).map((t) => t.scale);
      const single = Math.max(...scales);
      return { lakeTotal: lake.reduce((a, b) => a + b, 0), before: lake.length * single, single };
    });
    log(`  lava: luz somada do lago ${lava.lakeTotal.toFixed(2)} (antes, um tile = uma poça: ${lava.before.toFixed(2)})`);
    assert('14. O lago de lava acende bem menos que a soma de dezenas de poças (era o que estourava)', lava.lakeTotal <= lava.before * 0.45, `${lava.lakeTotal.toFixed(2)} de ${lava.before.toFixed(2)}`);
    await put(6, 10, 0, -1);
    await sleep(2200);
    await shot('14-lago-de-lava', { note: 'O lago de lava com a crosta e as fendas, sem estourar' });
    await put(10, 8, 0, -1);
    await sleep(1500);
    await shot('13-veios-carvao-e-minerio', { note: 'O veio preto (carvão) e o vermelho (minério) na margem' });

    // ── 15. A TELA DE TÍTULO ──────────────────────────────────────────────────────────────────
    await driver.open('/');
    await page.waitForFunction(() => window.appDebug?.isActive('title'), null, { timeout: 30000 }).catch(() => {});
    await sleep(4500);
    const title = await page.evaluate(() => {
      const st = window.appDebug.sceneStats('title', 'title-ember');
      return { fire: st.texture, fireflies: st.objects };
    });
    assert('15. A tela de título não tem mais a fogueira', !title.fire, '');
    await shot('15-titulo', { note: 'A tela de título: só a mata, com vaga-lumes, névoa e folhas' });
  },
};

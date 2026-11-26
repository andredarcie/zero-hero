// A PRAIA DO NORTE (pedido do autor, 2026-11-19): o mapa cresce para o norte, depois da serra. Ao lado da fogueira da
// Thea, uma trilha LIVRE sobe ao mirante e desce na duna; lá embaixo, a areia de fora a fora, os coqueiros, os bichos
// e o mar com as ondas. Andando, a câmera é sempre a de sempre. Os montinhos de areia que o balde recolhe (a única areia
// do jogo), o cartão de 2024 escondido na areia, e o guarda-sol do oeste, de sentar e olhar o mar com o céu e as nuvens.
// E a areia e a água respondem a quem pisa nelas.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'praia',
  description: 'A praia do norte: a trilha do mato, o mirante, a areia, os coqueiros, os bichos, as ondas, o céu do mar e as pegadas.',
  needsGame: false,
  async run({ driver, shot, assert, log }) {
    const { page } = driver;
    const g = (fn, arg) => page.evaluate(fn, arg);
    const teleport = async (x, y, dx = 0, dy = -1) => { await g(([a, b, c, d]) => window.gameDebug.hero.teleport(a, b, c, d), [x, y, dx, dy]); await sleep(700); };
    await page.addInitScript(() => {
      if (sessionStorage.getItem('praia')) return;
      sessionStorage.setItem('praia', '1');
      localStorage.setItem('zh.cozy.v1', JSON.stringify({
        started: true, introSeen: true, day: 2, clock: 0.45, respawn: { worldX: 43, worldY: 5 },
      }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await sleep(1500);
    const hide = () => g(() => window.gameDebug.verbs.hidePrompt());
    const at = (x, y) => g(([a, b]) => window.gameDebug.beach.at(a, b), [x, y]);
    const vista = () => g(() => window.gameDebug.beach.vista());
    const hold = (v) => g((value) => window.gameDebug.beach.holdVista(value), v);
    await g(() => window.gameTime.set(0.45));

    // ── 1. O MAPA CRESCEU PARA O NORTE, e nada do que existia mudou de lugar ──────────────────────────────────────
    const bounds = await g(() => window.gameDebug.beach.bounds());
    assert('O mapa tem duas linhas de chunk novas ao norte', bounds.minTileY === -24 && bounds.minCy === -2 && bounds.maxTileY === 59, JSON.stringify(bounds));

    // ── 2. A TRILHA: livre, a qualquer hora do jogo (o autor, 2026-11-19) ────────────────────────────────────────────
    await teleport(42, 4);
    await hide();
    await sleep(600);
    const TRAIL = [[42, 3], [42, 2], [42, 1], [41, -3], [43, -5], [44, -5], [45, -7], [45, -9]];
    const open = [];
    for (const [x, y] of TRAIL) open.push(await at(x, y));
    assert('A trilha não tem mato nenhum: os tiles que a foice abria estão livres', open.every((t) => t.grass === null && !t.solid), JSON.stringify(open.map((t) => [t.grass, t.solid])));
    await shot('00-cabeca-da-trilha', { note: 'A cabeça da trilha, ao norte da fogueira da Thea: o caminho livre' });
    // sem ferramenta nenhuma, as setas sobem: três passos para o norte
    await page.keyboard.down('ArrowUp');
    await sleep(900);
    await page.keyboard.up('ArrowUp');
    await sleep(300);
    const climbed = await g(() => window.gameDebug.hero.at());
    assert('Sem ferramenta, o herói sobe pela cabeça da trilha', climbed.y <= 2, JSON.stringify(climbed));
    await hide();
    await shot('01-subindo', { note: 'Subindo a trilha, sem cortar nada' });

    // ── 3. A SUBIDA: as escadas e o mirante ───────────────────────────────────────────────────────────────────────
    const relief = [];
    for (const [x, y] of [[42, -1], [42, -2], [41, -4], [41, -5], [45, -6], [45, -7], [45, -8]]) relief.push((await at(x, y)).relief);
    assert('A trilha sobe em dois lances e desce em dois (escadas 2, 9, 11 e 4)', JSON.stringify(relief) === JSON.stringify([2, 1, 9, 8, 11, 1, 4]), JSON.stringify(relief));
    await teleport(42, 0);
    await driver.walk('up', 2);
    await hide();
    await sleep(900);
    await shot('02-terraco', { note: 'O terraço, no alto da primeira escada' });
    await driver.walk('up');
    await driver.walk('left');
    await driver.walk('up', 2);
    const atLookout = await g(() => ({
      hero: window.gameDebug.hero.at(),
      cutscene: window.gameDebug.getState().cutsceneActive,
      mist: window.gameDebug.valley.gardenMist()?.count ?? 0,
    }));
    assert('Subir ao mirante da praia mantém a névoa no jardim e não dispara cena',
      atLookout.hero.x === 41 && atLookout.hero.y === -5 && !atLookout.cutscene && atLookout.mist > 0, JSON.stringify(atLookout));
    if (atLookout.cutscene) return;
    await hide();
    // a câmera não baixa mais sozinha (o autor, 2026-11-19: "a câmera fica como é padrão mesmo, fixa")
    let v = await vista();
    assert('No mirante a câmera continua a de sempre', v.blend < 0.05 && !v.lens && v.fovExtra === 0, JSON.stringify(v));
    await shot('03-mirante', { note: 'O mirante, com a câmera de sempre' });
    await driver.walk('right', 4);
    await driver.walk('up', 6);
    await hide();
    const atDune = await g(() => ({
      hero: window.gameDebug.hero.at(), cutscene: window.gameDebug.getState().cutsceneActive,
    }));
    assert('O herói chega a pé à duna sem perder o controle', atDune.hero.x === 45 && atDune.hero.y === -11
      && !atDune.cutscene, JSON.stringify(atDune));
    v = await vista();
    assert('Na duna a câmera volta a ser a de sempre', v.blend < 0.05 && !v.lens && v.fovExtra === 0, JSON.stringify(v));
    await shot('04-pe-da-descida', { note: 'O pé da descida, na duna' });

    // ── 4. A AREIA E OS COQUEIROS ─────────────────────────────────────────────────────────────────────────────────
    const palms = await g(() => window.gameDebug.beach.palms());
    const palm = palms[0];
    assert('Há coqueiros de vários portes, e o pé de cada um barra', palms.length >= 40 && new Set(palms.map((p) => p.kind)).size >= 3
      && (await at(palm.x, palm.y)).solid, `${palms.length} coqueiros`);
    const palmPlanes = await g(() => window.gameDebug.beach.palmPlanes());
    const overlappingPlanes = palmPlanes.flatMap((a, index) => palmPlanes.slice(index + 1)
      .filter((b) => a.depth === b.depth && a.left < b.right && b.left < a.right));
    assert('Coqueiros vizinhos que se sobrepõem têm profundidades distintas',
      palmPlanes.length === palms.length && overlappingPlanes.length === 0,
      `${overlappingPlanes.length} pares coplanares em ${palmPlanes.length} coqueiros`);
    await teleport(30, -12);
    await hide();
    await sleep(900);
    await shot('05-areia', { note: 'O meio da praia, na areia alta' });
    await g(() => window.gameDebug.scene.dollyTo(2.2, 10));
    await teleport(30, -14);
    await hide();
    await sleep(1600);
    await shot('06-de-longe', { note: 'A praia de longe' });
    await g(() => window.gameDebug.scene.dollyTo(1, 10));

    // ── 5. O MAR: as ondas vistas de cima, e a câmera na beira ────────────────────────────────────────────────────
    await hold(0);
    await teleport(30, -17);
    await hide();
    await sleep(1200);
    const sea = await at(30, -19);
    assert('O mar barra, e a areia da beira se pisa', sea.sea && sea.solid && sea.coast > 0 && (await at(30, -17)).sand, JSON.stringify(sea));
    const w0 = await g(() => window.gameDebug.beach.swash(30));
    await shot('07-ondas-de-cima', { note: 'As ondas vistas de cima: a quebra, o espraio e a faixa molhada' });
    await sleep(2400);
    const w1 = await g(() => window.gameDebug.beach.swash(30));
    assert('A lâmina d\'água anda: a beira dela muda de lugar com o tempo', Math.abs(w1.edge - w0.edge) > 0.05 || w1.n !== w0.n, `${w0.edge.toFixed(2)} → ${w1.edge.toFixed(2)}`);
    await shot('08-ondas-de-cima-2', { note: 'A mesma beira, dois segundos e meio depois' });
    await hold(null);
    await sleep(3200);
    v = await vista();
    assert('Na beira do mar a câmera continua a de sempre', v.blend < 0.05 && !v.lens && v.fovExtra === 0, JSON.stringify(v));
    await shot('09-beira-dia', { note: 'A beira do mar, de dia' });

    // ── 6. A VIDA ─────────────────────────────────────────────────────────────────────────────────────────────────
    await hold(0);
    await teleport(24, -16);
    await hide();
    await sleep(7000);
    let life = await g(() => window.gameDebug.beach.life());
    log(`  vida: ${life.crabs.length} caranguejos, ${life.gulls.ground.length} gaivotas no chão e ${life.gulls.gliding} no ar, ${life.pipers.birds.length} maçaricos`);
    assert('Na praia há caranguejos, gaivotas e maçaricos', life.crabs.length > 0 && life.gulls.gliding > 0 && life.pipers.birds.length > 0, JSON.stringify({ c: life.crabs.length, g: life.gulls, p: life.pipers.birds.length }));
    assert('Os maçaricos ficam a um palmo da espuma', life.pipers.flying || life.pipers.birds.every((b) => b.gap > 0.1 && b.gap < 0.6), JSON.stringify(life.pipers.birds));
    await shot('10-bichos', { note: 'Os bichos da praia' });
    // o susto: um caranguejo a um tile do herói dispara de lado e se enterra
    const scaresBefore = life.scares;
    await g(() => { const h = window.gameDebug.hero.at(); window.gameDebug.beach.summonCrab(h.x + 1, h.y); });
    await sleep(1800);
    life = await g(() => window.gameDebug.beach.life());
    assert('O caranguejo foge de quem chega perto', life.scares > scaresBefore, `${scaresBefore} → ${life.scares}`);
    assert('A onda soa quando chega', life.washes > 0, String(life.washes));

    // ── 7. A AREIA E A ÁGUA RESPONDEM A QUEM PISA ─────────────────────────────────────────────────────────────────
    await teleport(7, -16, 1, 0);
    await hide();
    await page.keyboard.down('ArrowRight');
    await sleep(1100);
    await page.keyboard.up('ArrowRight');
    await sleep(300);
    let steps = await g(() => window.gameDebug.beach.steps());
    assert('Andar na areia deixa pegadas', steps.stepped >= 3 && steps.prints >= 3, JSON.stringify(steps));
    await hide();
    await g(() => window.gameDebug.scene.dollyTo(0.62, 10));
    await sleep(700);
    await shot('11-pegadas', { note: 'As pegadas na areia seca, de perto' });
    await g(() => window.gameDebug.scene.dollyTo(1, 10));
    await teleport(31, -17, 1, 0);
    await hide();
    await page.keyboard.down('ArrowLeft');
    await sleep(3000);
    await page.keyboard.up('ArrowLeft');
    await sleep(300);
    steps = await g(() => window.gameDebug.beach.steps());
    log(`  passos: ${JSON.stringify(steps)}`);
    assert('Na lâmina d\'água o passo respinga, ou a onda apaga a pegada da areia molhada', steps.splashes > 0 || steps.washed > 0, JSON.stringify(steps));
    await hide();
    await shot('12-beira-andada', { note: 'Depois de andar na beira: as pegadas que a onda ainda não apagou' });
    // parado na beira: espera a lâmina subir até os pés
    await teleport(30, -17);
    await hide();
    let covered = false;
    for (let i = 0; i < 60 && !covered; i += 1) {
      const [sw, c] = await g(() => [window.gameDebug.beach.swash(30), window.gameDebug.beach.at(30, -17).coast]);
      covered = c - sw.edge > 0.4 && sw.u < 0.5;
      if (!covered) await sleep(120);
    }
    await sleep(200);
    steps = await g(() => window.gameDebug.beach.steps());
    const bodies = await g(() => window.gameDebug.beach.bodies());
    assert('A lâmina d\'água chega aos pés de quem está na beira', covered && steps.inWater, JSON.stringify(steps));
    assert('A água sabe onde o herói está (é em volta dele que ela abre)', bodies[0][3] === 1 && Math.abs(bodies[0][0] - 30) < 0.6 && Math.abs(bodies[0][1] + 17) < 0.8, JSON.stringify(bodies));
    await g(() => window.gameDebug.scene.dollyTo(0.62, 10));
    await sleep(500);
    await shot('13-agua-nos-pes', { note: 'A água do espraio contornando os pés: o colar de espuma e a esteira' });
    await g(() => window.gameDebug.scene.dollyTo(1, 10));
    await hold(null);

    // ── 8. AS HORAS na beira do mar, com a câmera de sempre: a manhã, a hora dourada, a noite ───────────────────────
    await teleport(30, -15);
    await hide();
    await g(() => window.gameTime.set(0.29));
    await sleep(3200);
    await shot('14-manha', { note: 'A manhã na beira do mar' });
    await g(() => window.gameTime.set(0.74));
    await sleep(3200);
    await shot('15-hora-dourada', { note: 'A hora dourada na beira do mar' });
    await g(() => window.gameTime.set(0.2));
    await sleep(3600);
    await shot('16-noite', { note: 'A noite na beira do mar' });
    await g(() => window.gameTime.set(0.45));
    await sleep(800);

    // ── 9. OS MONTINHOS DE AREIA: só o balde vazio os recolhe, e eles se desfazem ──────────────────────────────────
    await g(() => window.gameDebug.items.clear());
    let mounds = await g(() => window.gameDebug.beach.mounds());
    assert('Há cinco montinhos de areia em pé na praia, e cada um barra o passo', mounds.list.length === 5 && mounds.list.every((m) => m.standing)
      && (await at(mounds.list[1].x, mounds.list[1].y)).solid, JSON.stringify(mounds));
    const M = mounds.list[1];
    // de lado (a oeste dele, olhando o leste): de frente pelo sul, o corpo do herói tapava o montinho na foto
    await teleport(M.x - 1, M.y, 1, 0);
    await hide();
    await sleep(500);
    await g(() => window.gameDebug.scene.dollyTo(0.62, 10));
    await sleep(500);
    await shot('17-montinho', { note: 'Um montinho de areia na praia' });
    await page.keyboard.press('x');
    await sleep(700);
    assert('Sem o balde, o montinho fica', (await g(() => window.gameDebug.beach.mounds())).taken === 0, '');
    await g(() => window.gameDebug.items.take('bucket'));
    await sleep(400);
    const prompt = await g(([x, y]) => window.gameDebug.verbs.prompt(x, y), [M.x - 1, M.y]);
    log(`  balão com o balde: ${JSON.stringify(prompt)}`);
    await page.keyboard.press('x');
    await sleep(900);
    mounds = await g(() => window.gameDebug.beach.mounds());
    const held = await g(() => window.gameDebug.getState().heldItem);
    assert('Com o balde vazio, o X enche o balde de areia e o montinho se desfaz', mounds.taken === 1 && held === 'bucketSand'
      && !mounds.list.find((m) => m.x === M.x && m.y === M.y).standing, JSON.stringify({ taken: mounds.taken, held }));
    await hide();
    await shot('18-balde-de-areia', { note: 'O balde cheio de areia, e o montinho desfeito' });
    await g(() => window.gameDebug.scene.dollyTo(1, 10));

    // ── 10. O CARTÃO DE 2024, escondido na areia atrás de um coqueiro ─────────────────────────────────────────────
    const card = (await g(() => window.gameDebug.relics.list())).find((r) => r.kind === 'nomadPostcard');
    assert('O cartão de 2024 está enterrado na areia da praia', card && card.y < 0 && (await at(card.x, card.y)).sand && !card.found, JSON.stringify(card));
    await teleport(card.x, card.y - 1, 0, 1);
    await hide();
    await g(() => window.gameDebug.scene.dollyTo(0.55, 10));
    await sleep(600);
    await shot('19-cartao-escondido', { note: 'A pontinha do cartão-postal aparecendo na areia' });
    await g(() => window.gameDebug.scene.dollyTo(1, 10));

    // ── 11. O GUARDA-SOL: sentar e olhar o mar, o tempo passando (no meio da enseada: só mar e coqueiros no quadro) ──
    await g(() => window.gameDebug.items.clear());
    await g(() => window.gameTime.set(0.29));
    await teleport(41, -14, 0, -1);
    await hide();
    await sleep(600);
    await shot('20-guarda-sol', { note: 'O guarda-sol e a cadeira, no meio da enseada' });
    assert('A cadeira e o guarda-sol barram o passo', (await at(41, -15)).solid && (await at(40, -15)).solid, '');
    await page.keyboard.press('z');
    await sleep(3200);
    let watch = await g(() => ({ watching: window.gameDebug.beach.watching(), vista: window.gameDebug.beach.vista() }));
    assert('O Z na cadeira senta e a câmera desce até o horizonte, olhando o mar', watch.watching && watch.vista.blend > 0.8 && watch.vista.lens, JSON.stringify(watch));
    // sentado o tempo corre (24×): a hora é posta logo antes de cada foto, senão a dourada já virou noite no clique
    for (const [hour, name, note] of [
      [0.265, '21-olhando-o-mar-manha', 'Sentado no guarda-sol: o sol nascendo no mar'],
      [0.42, '22-olhando-o-mar-dia', 'As nuvens de dia sobre o mar'],
      [0.715, '23-olhando-o-mar-dourada', 'A hora dourada'],
      // (a lua desce sobre o mar na madrugada; perto da meia-noite ela está alta, fora do quadro)
      [0.2, '24-olhando-o-mar-noite', 'A madrugada, com a lua descendo no mar'],
    ]) {
      await g((h) => window.gameTime.set(h), hour);
      await sleep(450);
      await shot(name, { note });
    }
    await page.keyboard.press('ArrowDown');
    await sleep(2400);
    watch = await g(() => ({ watching: window.gameDebug.beach.watching(), vista: window.gameDebug.beach.vista() }));
    assert('Levantar devolve a câmera de sempre', !watch.watching && watch.vista.blend < 0.05 && !watch.vista.lens, JSON.stringify(watch));
    await g(() => window.gameTime.set(0.45));
  },
};

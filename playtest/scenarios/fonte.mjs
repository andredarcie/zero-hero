// A FONTE TERMAL (pedido do autor, 2026-11-19: "depois do lago de lava... atravessa uma trilha e chega nessa fonte
// termal... é apenas um lugar aleatório do mapa para descanso"; e depois: "zero contato com a praia, zero visão da
// praia... se compara mais com a experiência de sentar e ver o lago... um ambiente único e especial"). Uma gruta no pé
// da serra, atrás do corredor das minas: paredões de mata alta, a água leitosa, as pedras, a lanterna de pedra e os
// vaga-lumes. O Z diante da água leva o herói para dentro: ele afunda até os ombros, vira de frente, e a câmera vai até
// a água como no banco do lago. Qualquer tecla o tira de lá. As fotos dos cantos da gruta são a prova de que a praia
// não aparece.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'fonte',
  description: 'A fonte termal na gruta atrás da lava: o lugar sem praia à vista, entrar na água, o vapor, a lanterna e os vaga-lumes.',
  needsGame: false,
  async run({ driver, shot, assert, log }) {
    const { page } = driver;
    const g = (fn, arg) => page.evaluate(fn, arg);
    const teleport = async (x, y, dx = 0, dy = -1) => { await g(([a, b, c, d]) => window.gameDebug.hero.teleport(a, b, c, d), [x, y, dx, dy]); await sleep(700); };
    await page.addInitScript(() => {
      if (sessionStorage.getItem('fonte')) return;
      sessionStorage.setItem('fonte', '1');
      localStorage.setItem('zh.cozy.v1', JSON.stringify({
        started: true, introSeen: true, day: 2, clock: 0.45, respawn: { worldX: 43, worldY: 5 }, mistCleared: true,
      }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await sleep(1500);
    const hide = () => g(() => window.gameDebug.verbs.hidePrompt());
    const at = (x, y) => g(([a, b]) => window.gameDebug.beach.at(a, b), [x, y]);
    const spring = () => g(() => window.gameDebug.beach.spring());
    const hero = () => g(() => window.gameDebug.hero.at());
    await g(() => window.gameTime.set(0.45));

    // ── 1. O LUGAR: a água barra, o chão da gruta é o de baixo, e o paredão em volta é mata alta ─────────────────────
    const pool = [];
    for (let y = -3; y <= -2; y += 1) for (let x = 3; x <= 6; x += 1) pool.push(await at(x, y));
    assert('A água da fonte (4 × 2, na gruta) barra o passo, no chão de baixo', pool.every((t) => t.solid && t.relief === 0), JSON.stringify(pool.map((t) => [t.solid, t.relief])));
    const wall = [];
    for (const [x, y] of [[4, -4], [4, -5], [4, -6], [9, -4], [16, -5]]) wall.push((await at(x, y)).relief);
    assert('Entre a gruta e a praia, o paredão é mata alta de dois andares', wall.every((r) => r === 7), JSON.stringify(wall));

    // ── 2. A CHEGADA: do corredor das minas (do outro lado da lava), por entre as pedras de minério ──────────────────
    // (em 4,0 há uma pedra de minério: as passagens do corredor para a gruta são 3, 5 e 7)
    await teleport(5, 1, 0, -1);
    await hide();
    await sleep(500);
    await shot('00-do-corredor', { note: 'Do corredor das minas, atrás da lava: a gruta da fonte entre as pedras' });
    await page.keyboard.down('ArrowUp');
    await sleep(700);
    await page.keyboard.up('ArrowUp');
    await sleep(500);
    const edge = await hero();
    assert('Andando para o norte, ele entra na gruta e para na beira da água', edge.x === 5 && edge.y === -1, JSON.stringify(edge));
    const verb = (await spring()).verb;
    assert('Diante da água, o Z é "entrar na fonte"', verb === 'soak', String(verb));

    // ── 3. NENHUMA PRAIA À VISTA: os cantos da gruta de onde a câmera chegaria mais perto dela ───────────────────────
    for (const [x, y, name] of [[1, -1, '01-canto-oeste'], [2, -3, '02-canto-noroeste'], [9, -3, '03-canto-nordeste'], [10, -1, '04-canto-leste']]) {
      await teleport(x, y, 0, -1);
      await hide();
      await sleep(900);
      await shot(name, { note: `De ${x},${y}: só a gruta, a mata e o corredor — nada de areia, coqueiro ou mar` });
    }

    // ── 4. DENTRO DA ÁGUA: até os ombros, de frente, a câmera vai até a fonte (o banco do lago) ──────────────────────
    await teleport(5, -1, 0, -1);
    await hide();
    await g(() => window.gameTime.set(0.215));
    await page.keyboard.press('z');
    await sleep(3200);
    let s = await spring();
    const lens = await g(() => window.gameDebug.beach.vista());
    log(`  dentro: ${JSON.stringify({ s, lens })}`);
    assert('O Z o leva para dentro da água, afundado até os ombros', s.soaking && s.at?.x === 5 && s.at?.y === -2 && s.lift < -0.35, JSON.stringify(s));
    assert('A câmera vai até a água (como no banco do lago), e não desce para o horizonte', s.look && Math.abs(s.look.x - 4.5) < 0.6 && !lens.lens && lens.blend < 0.01, JSON.stringify({ look: s.look, lens }));
    const hours = [
      [0.215, '05-madrugada', 'De madrugada: o vapor cheio, a lanterna ainda acesa'],
      [0.46, '06-dia', 'De dia: o vapor ralo'],
      [0.715, '07-hora-dourada', 'A hora dourada na gruta'],
      [0.06, '08-noite', 'A noite: a lanterna, a luz morna na água, os vaga-lumes'],
    ];
    const steam = {};
    const night = {};
    // (a câmera já chegou: o olhar leva ~1,1 s e a aproximação 1,8 s)
    for (const [hour, name, note] of hours) {
      await g((h) => window.gameTime.set(h), hour);
      await sleep(450);
      const now = await spring();
      steam[name] = +now.steam.toFixed(2);
      night[name] = +now.night.toFixed(2);
      await shot(name, { note });
    }
    log(`  vapor: ${JSON.stringify(steam)}  noite: ${JSON.stringify(night)}`);
    assert('O vapor é mais cheio de madrugada que de tarde', steam['05-madrugada'] > steam['07-hora-dourada'] + 0.3, JSON.stringify(steam));
    assert('A lanterna acende de noite e apaga de dia', night['08-noite'] > 0.9 && night['06-dia'] < 0.05, JSON.stringify(night));

    // ── 5. SAIR: qualquer tecla o tira da água, de volta à beira, e a câmera volta ao herói ──────────────────────────
    await page.keyboard.press('ArrowDown');
    await sleep(2200);
    s = await spring();
    const back = await hero();
    assert('Levantar o tira da água, de volta à beira de onde entrou', !s.soaking && back.x === 5 && back.y === -1 && Math.abs(s.lift) < 0.02 && !s.look, JSON.stringify({ s, back }));

    // ── 6. A GRUTA NA CÂMERA DE SEMPRE: de noite e na chuva ───────────────────────────────────────────────────────
    await g(() => window.gameTime.set(0.92));
    await sleep(2400);
    await hide();
    await shot('09-gruta-de-noite', { note: 'A gruta de noite, de pé na beira' });
    await g(() => { window.gameTime.setDay(1); window.gameTime.set(0.675); });
    await sleep(4000);
    await shot('10-gruta-na-chuva', { note: 'A chuva na água quente: anéis e vapor mais cheio' });
    await g(() => { window.gameTime.setDay(2); window.gameTime.set(0.45); });
  },
};

// LAR — o acampamento que é do jogador (pedido do autor, 2026-11-17; scenes/game/BuildMode, CampHome, objects/CampPieces):
// ele começa só com o colchão, o fogo e o caderno, cercado de mato alto verde. O X guarda graveto, pedra, carvão e
// minério na bancada; o Z nela PARA O JOGO (até a música) e o chão vira uma grade — verde onde dá para pôr, vermelho no
// mato e onde a peça fecharia o caminho; escolhe-se a carta e o tile com o mouse. A lembrança de um pedido fechado
// espera na bancada, de graça. O mato não pega fogo: só a foice da Morte o corta, e o espaço aberto fica verde e fica
// aberto (o save lembra). A tina tinge a capa, a placa guarda o nome, a lanterna acende à noite, e tudo volta igual
// depois de recarregar a página.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A frente da bancada (55,45): o herói olha para o leste dali. */
const FRONT = [54, 45];
/** O material que a escada inteira pede (homeBuilds): 9 gravetos, 6 pedras, 3 carvões, 1 minério. */
const STOCK = [['wood', 9], ['stone', 6], ['charcoal', 3], ['ore', 1]];
/** Onde cada peça vai, na ordem da escada (com a vez de outro tile verde se este estiver vermelho). */
// A coluna 54 é a espinha do acampamento (da passagem do sul à frente da bancada) e a 52 é a viela do tronco: a grade
// não deixa fechar nenhuma das duas. O que não couber onde se quer vai para o tile verde mais perto do meio. O quadro da
// Sisi (o presente) entra no miolo também; o sino, o último degrau, vai para o chão que a foice abrir.
const LAYOUT = [
  ['log', [52, 49]], ['easel', [55, 49]], ['sign', [55, 50]], ['tub', [55, 47]], ['sundial', [53, 45]],
  ['cairn', [52, 45]], ['lantern', [53, 50]], ['flowerPot', [52, 50]], ['windChime', [56, 48]],
];
/**
 * Onde o herói fica e o tufo de mato que ele corta. O mato do acampamento é RALO (2026-11-19, scripts/mato-do-acampamento:
 * um tile de chão entre dois tufos): o (56,48) da frente do acampamento, e o (57,47), de quina com ele.
 */
const MOW = [[55, 48, 56, 48], [57, 48, 57, 47]];

export default {
  name: 'lar',
  description: 'O lar: a bancada guarda o material, a grade com o jogo parado, as peças postas, a foice abre espaço.',
  needsGame: false,
  async run({ driver, shot, assert, log }) {
    const { page } = driver;
    const g = (fn, arg) => page.evaluate(fn, arg);
    const state = () => g(() => window.gameDebug?.getState() ?? null);
    const drain = async () => {
      for (let i = 0; i < 16; i += 1) {
        const st = await state();
        if (!st?.dialogOpen && !st?.itemGetOpen) return;
        await page.keyboard.press('z');
        await sleep(260);
      }
    };
    const press = async (key, wait = 320) => { await page.keyboard.press(key); await sleep(wait); };
    const teleport = async (x, y, dx, dy) => { await g(([a, b, c, d]) => window.gameDebug.hero.teleport(a, b, c, d), [x, y, dx, dy]); await sleep(200); };
    const home = () => g(() => window.gameDebug.camp.home());
    const build = () => g(() => window.gameDebug.camp.build());
    const promptAt = (x, y) => g(([a, b]) => window.gameDebug.verbs.prompt(a, b), [x, y]);
    /** Espera o balão de ação aparecer (sem fala, cerimônia ou pensamento na frente). */
    const ready = async (x, y) => {
      for (let i = 0; i < 20; i += 1) { if ((await promptAt(x, y)).length > 0) return; await sleep(150); }
    };
    const openBuild = async () => {
      await teleport(FRONT[0], FRONT[1], 1, 0);
      await ready(FRONT[0], FRONT[1]);
      await press('z', 200);
      await page.waitForFunction(() => window.gameDebug.camp.build().open, null, { timeout: 8000 });
      await sleep(300);
    };
    const clickTile = async (x, y) => {
      const px = await g(([a, b]) => window.gameDebug.camp.buildTilePx(a, b), [x, y]);
      await page.mouse.move(px.x, px.y);
      await sleep(80);
      await page.mouse.click(px.x, px.y);
      await sleep(260);
    };
    const freeAt = async (x, y) => (await build()).cells.some((c) => c.x === x && c.y === y && c.state === 'free');
    /** O tile verde mais perto do meio do acampamento (fora o 55,48, a entrada da foice). */
    const nearestFree = async () => (await build()).cells
      .filter((c) => c.state === 'free' && !(c.x === 55 && c.y === 48))
      .sort((a, b) => Math.hypot(a.x - 53.5, a.y - 48) - Math.hypot(b.x - 53.5, b.y - 48))[0];

    // A primeira carga: o save do começo. A recarga do fim mantém o save (o sessionStorage diz que já carregou uma vez).
    await page.addInitScript(() => {
      if (sessionStorage.getItem('lar')) return;
      sessionStorage.setItem('lar', '1');
      localStorage.setItem('zh.cozy.v1', JSON.stringify({ started: true, introSeen: true, day: 0, clock: 0.45, respawn: { worldX: 54, worldY: 51 } }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await sleep(1500);
    await g(() => { window.gameTime.set(0.45); });

    // ── O COMEÇO: SÓ O COLCHÃO, O FOGO E O CADERNO, NO MEIO DO MATO ───────────────────────────────────────────────
    const start = await g(() => ({
      pieces: window.gameDebug.valley.pieces(),
      fixed: [window.gameDebug.valley.campAt(53, 48), window.gameDebug.valley.campAt(53, 49), window.gameDebug.valley.campAt(53, 47)],
      grass: window.gameDebug.camp.home().grassStanding,
    }));
    assert('O acampamento começa com o colchão, o fogo e o caderno, e nada mais', start.pieces.length === 0 && start.fixed.join() === 'bed,ring,notebook', JSON.stringify(start));
    assert('Em volta dele, mato alto espalhado (ralo: um tile de chão entre dois tufos)', start.grass >= 15, String(start.grass));
    await teleport(54, 50, 0, -1);
    await g(() => window.gameDebug.verbs.hidePrompt());
    await shot('00-comeco', { note: 'O começo: o colchão, o fogo e o caderno, cercados de mato alto' });

    // ── O MATO VERDE NÃO PEGA FOGO ────────────────────────────────────────────────────────────────────────────────
    await g(() => { window.gameDebug.items.take('wood'); window.gameDebug.fire.setOnFire(); });
    await teleport(55, 48, 1, 0);
    const burn = await g(() => window.gameDebug.verbs.use(56, 48));
    await press('x', 900);
    const stillTall = (await home()).grassStanding === start.grass;
    assert('Com o graveto aceso, o mato do acampamento não pega fogo', burn === null && stillTall, JSON.stringify({ burn, stillTall }));
    await g(() => { window.gameDebug.fire.douse(); window.gameDebug.items.clear(); });

    // ── O X GUARDA O MATERIAL NA BANCADA ──────────────────────────────────────────────────────────────────────────
    let first = true;
    for (const [kind, n] of STOCK) {
      for (let i = 0; i < n; i += 1) {
        await g((k) => window.gameDebug.items.take(k), kind);
        await drain();
        await teleport(FRONT[0], FRONT[1], 1, 0);
        if (first) {
          await ready(FRONT[0], FRONT[1]);
          const label = await promptAt(FRONT[0], FRONT[1]);
          assert('Diante da bancada, com material na mão, o balão diz Construir (Z) e Guardar (X)', label.some((l) => /Guardar|Store/u.test(l)) && label.some((l) => /Construir|Build/u.test(l)), JSON.stringify(label));
          first = false;
        }
        await press('x', 380);
      }
    }
    const stock = (await home()).stock;
    assert('A bancada guardou tudo', stock.wood === 9 && stock.stone === 6 && stock.charcoal === 3 && stock.ore === 1, JSON.stringify(stock));

    // ── O PEDIDO DA SISI FECHA: O QUADRO DELA ESPERA NA BANCADA ───────────────────────────────────────────────────
    await g(() => { window.gameDebug.quest.event({ type: 'paint' }); });
    await sleep(600);
    await drain();
    await sleep(1600);

    // ── O Z NA BANCADA: O JOGO PARA E A GRADE APARECE ─────────────────────────────────────────────────────────────
    await openBuild();
    const opened = await build();
    log(`  grade: ${opened.free} verdes, ${opened.grass} de mato, ${opened.blocked} fechariam o caminho; cartas ${JSON.stringify(opened.cards)}`);
    assert('O Z na bancada para o jogo e mostra a grade: verde e vermelho', opened.open && opened.paused && opened.free >= 8 && opened.grass >= 15, JSON.stringify({ paused: opened.paused, free: opened.free, grass: opened.grass }));
    assert('As cartas: a primeira construção da escada, e o quadro da Sisi de presente', opened.cards.map((c) => c.kind).join() === 'log,easel', JSON.stringify(opened.cards));
    await shot('01-grade', { note: 'O jogo parado: a grade do acampamento, verde e vermelha' });

    // ── PÔR AS PEÇAS, COM O MOUSE: o miolo do acampamento enche ───────────────────────────────────────────────────
    /** Escolhe a carta e clica no tile (o desejado, ou o verde mais perto do meio); devolve onde pôs. */
    const placeCard = async (kind, want, preview = false) => {
      await page.click(`.zh-build-card[data-kind="${kind}"]`);
      await sleep(200);
      let target = want;
      if (!(await freeAt(...want))) {
        const free = await nearestFree();
        if (!free) return null;
        target = [free.x, free.y];
        log(`  ${kind}: ${want.join(',')} não está verde; vai em ${target.join(',')}`);
      }
      if (preview) {
        const px = await g(([a, b]) => window.gameDebug.camp.buildTilePx(a, b), target);
        await page.mouse.move(px.x, px.y);
        await sleep(200);
        await shot('02-grade-pondo', { note: 'A peça na mão, sobre um lugar verde' });
      }
      await clickTile(...target);
      const at = await g(([a, b]) => window.gameDebug.valley.campAt(a, b), target);
      assert(`${kind} posto pela grade, onde o jogador clicou`, at === kind, JSON.stringify({ at, target }));
      return target;
    };
    const FIRST = LAYOUT.slice(0, 8);
    for (const [i, [kind, want]] of FIRST.entries()) await placeCard(kind, want, i === 0);
    const full = await build();
    log(`  miolo cheio: ${full.free} verdes`);
    // (com o mato ralo sobra chão verde entre os tufos: as peças só tiram o lugar que ocupam)
    assert('As peças ocupam o chão verde que tomaram', full.free < opened.free, `${opened.free} → ${full.free}`);
    await press('Escape', 600);
    const closed = await build();
    assert('O Esc fecha a bancada e o jogo volta (sem pausa)', !closed.open && !closed.paused, JSON.stringify({ open: closed.open, paused: closed.paused }));

    // ── A FOICE ABRE ESPAÇO ───────────────────────────────────────────────────────────────────────────────────────
    await g(() => window.gameDebug.items.take('scythe'));
    await drain();
    for (const [hx, hy, gx, gy] of MOW) {
      await teleport(hx, hy, Math.sign(gx - hx), Math.sign(gy - hy));
      await ready(hx, hy);
      await press('x', 700);
    }
    await sleep(900);
    const mowed = await home();
    assert('A foice corta o mato do acampamento, e o save anota cada tile aberto', mowed.cleared.length === MOW.length && mowed.grassStanding === start.grass - MOW.length, JSON.stringify({ cleared: mowed.cleared, standing: mowed.grassStanding }));
    await teleport(55, 48, 1, 0);
    await g(() => window.gameDebug.verbs.hidePrompt());
    await sleep(400);
    await shot('03-foice', { note: 'A foice da Morte abriu espaço no mato do leste' });

    // ── A GRADE MAIOR: O SINO E O QUADRO DA SISI NO CHÃO NOVO ─────────────────────────────────────────────────────
    await openBuild();
    const wider = await build();
    assert('Na grade, o mato cortado virou chão verde', wider.free >= full.free + 1 && wider.cells.some((c) => c.x === 57 && c.y === 47 && c.state === 'free'), JSON.stringify({ free: wider.free, before: full.free }));
    await shot('04-grade-expandida', { note: 'Depois da foice: mais chão verde para construir' });
    await placeCard('windChime', [57, 47]);
    const after = await home();
    assert('A construção gastou o material certo, e o presente não custou nada', after.stock.wood === 0 && after.stock.stone === 0 && after.stock.charcoal === 0 && after.stock.ore === 0, JSON.stringify(after.stock));

    // ── MUDAR UMA PEÇA DE LUGAR: CLICAR NELA, CLICAR NO NOVO TILE ─────────────────────────────────────────────────
    const tub = (await g(() => window.gameDebug.valley.pieces())).find((p) => p.kind === 'tub');
    await clickTile(tub.x, tub.y);
    const lifted = await build();
    const dest = lifted.cells.find((c) => c.state === 'free' && !(c.x === tub.x && c.y === tub.y));
    await clickTile(dest.x, dest.y);
    const moved = await g(([a, b, c, d]) => [window.gameDebug.valley.campAt(a, b), window.gameDebug.valley.campAt(c, d)], [tub.x, tub.y, dest.x, dest.y]);
    assert('Clicar numa peça posta a levanta, e o novo clique a muda de lugar (sem custo)', lifted.screen?.mode === 'place' && moved[0] === null && moved[1] === 'tub', JSON.stringify({ moved, screen: lifted.screen }));
    // Devolve a tina para perto da manta (o lugar bom para a foto).
    await clickTile(dest.x, dest.y);
    await clickTile(tub.x, tub.y);
    await press('Escape', 600);
    await teleport(54, 51, 0, -1);
    await g(() => window.gameDebug.verbs.hidePrompt());
    await sleep(500);
    await shot('05-acampamento-montado', { note: 'O acampamento montado pelo jogador' });

    // ── A TINA E A PLACA ──────────────────────────────────────────────────────────────────────────────────────────
    /** O herói de pé num vizinho livre da peça, de frente para ela. */
    const standBeside = async (kind) => {
      const piece = (await g(() => window.gameDebug.valley.pieces())).find((p) => p.kind === kind);
      const spot = await g(([x, y]) => [[-1, 0], [1, 0], [0, 1], [0, -1]].map(([dx, dy]) => [x + dx, y + dy])
        .find(([a, b]) => !window.gameDebug.world.solid(a, b)), [piece.x, piece.y]);
      await teleport(spot[0], spot[1], Math.sign(piece.x - spot[0]), Math.sign(piece.y - spot[1]));
      await ready(spot[0], spot[1]);
    };
    await g(() => window.gameDebug.items.markSeen('dyeBundle'));
    await standBeside('tub');
    await press('z', 700);
    for (let i = 0; i < 4; i += 1) await press('ArrowRight', 160);
    await press('z', 500);
    await press('ArrowDown', 160);
    await press('ArrowRight', 160);
    await press('ArrowRight', 160);
    await press('z', 500);
    await press('x', 500);
    const dyed = await home();
    assert('A tina posta tinge a capa (garança) e a manta (anil)', dyed.cape === 'garanca' && dyed.blanket === 'anil' && !dyed.dyeOpen, JSON.stringify({ cape: dyed.cape, blanket: dyed.blanket }));
    await standBeside('sign');
    await press('z', 700);
    await page.keyboard.type('Recanto do Lago', { delay: 30 });
    await press('Enter', 600);
    assert('A placa posta guarda o nome', (await home()).name === 'Recanto do Lago', '');

    // ── DE NOITE, A LANTERNA ──────────────────────────────────────────────────────────────────────────────────────
    await sleep(3800);
    await g(() => { window.gameTime.set(0.88); });
    await teleport(54, 50, 0, -1);
    await g(() => window.gameDebug.verbs.hidePrompt());
    await sleep(1400);
    await shot('06-noite', { note: 'À noite: a lanterna acesa no acampamento montado' });

    // ── RECARREGAR A PÁGINA: TUDO VOLTA IGUAL ─────────────────────────────────────────────────────────────────────
    const savedPieces = (await g(() => window.gameDebug.valley.pieces())).length;
    const savedCleared = (await home()).cleared;
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await sleep(1500);
    const back = await g(() => ({ pieces: window.gameDebug.valley.pieces().length, home: window.gameDebug.camp.home() }));
    assert('Recarregada a página, as peças continuam no lugar', back.pieces === savedPieces && savedPieces >= 9, JSON.stringify({ back: back.pieces, savedPieces }));
    assert('E o mato cortado continua cortado (o resto do mato do vale, não)', back.home.grassStanding === start.grass - savedCleared.length && back.home.name === 'Recanto do Lago' && back.home.cape === 'garanca', JSON.stringify({ standing: back.home.grassStanding, cleared: savedCleared.length }));
  },
};

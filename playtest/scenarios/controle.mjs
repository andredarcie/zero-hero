// CONTROLE — o jogo inteiro jogado com um controle de videogame (pedido do autor, 2026-11-20: "suporte total a controle
// de videogame, tipo Xbox, PlayStation e Switch"; runtime/gamepad). Nenhuma tecla é apertada aqui: um controle de Xbox
// de mentira (a Gamepad API do navegador devolve ele) aperta os botões, e o jogo tem de responder como a um controle de
// verdade — do título à pausa, a conversa, a pintura com o pincel e o nome da placa no teclado de letras. No fim ele vira
// um de PlayStation, e os botões mostrados trocam de nome.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const XBOX = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)';
const DUALSENSE = 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)';
/** Os botões do mapa "standard" (posicionais). */
const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

export default {
  name: 'controle',
  description: 'O jogo com um controle: título, andar, pausa, conversa, pintura, a placa, e os nomes dos botões.',
  needsGame: false,
  async run({ driver, shot, assert, log }) {
    const { page } = driver;
    const g = (fn, arg) => page.evaluate(fn, arg);
    const state = () => g(() => window.gameDebug?.getState() ?? null);
    const button = (i, on) => g(([i, on]) => {
      window.__pad.buttons[i] = { pressed: on, touched: on, value: on ? 1 : 0 };
      window.__pad.timestamp += 1;
    }, [i, on]);
    const tap = async (i, after = 280) => { await button(i, true); await sleep(110); await button(i, false); await sleep(after); };
    const stick = (x, y) => g(([x, y]) => { window.__pad.axes[0] = x; window.__pad.axes[1] = y; window.__pad.timestamp += 1; }, [x, y]);
    const hero = async () => (await state()).player;
    const pauseOpen = () => g(() => Boolean(document.getElementById('zh-pause-root')?.isConnected
      && getComputedStyle(document.getElementById('zh-pause-root')).display !== 'none'));
    const pauseSelected = () => g(() => [...document.querySelectorAll('#zh-pause-root .is-selected')].map((e) => e.textContent?.trim()).join('|'));

    await page.addInitScript(([id]) => {
      localStorage.setItem('zh.cozy.v1', JSON.stringify({ started: true, introSeen: true, clock: 0.45, respawn: { worldX: 17, worldY: 21 } }));
      localStorage.setItem('zh.a11y.keyHand', 'KeyL');
      window.__pad = {
        id, index: 0, connected: true, mapping: 'standard', timestamp: 1, axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
      };
      Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [window.__pad] });
    }, [XBOX]);

    // ── 1. O TÍTULO: o A entra no jogo ────────────────────────────────────────────────────────
    await driver.open('/');
    await page.waitForFunction(() => window.appDebug?.isActive('title'), null, { timeout: 60000 });
    await sleep(1500);
    await shot('01-titulo', { note: 'O título, esperando o A do controle' });
    let entered = false;
    for (let i = 0; i < 4 && !entered; i += 1) {
      await tap(B.A, 600);
      entered = await g(() => window.gameDebug?.getState()?.scene === 'game');
    }
    if (!entered) {
      await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 }).catch(() => undefined);
      entered = await g(() => window.gameDebug?.getState()?.scene === 'game');
    }
    assert('No título, o A do controle entra no jogo', entered, '');
    if (!entered) return;
    await sleep(2000);
    const pad = await g(() => window.gameDebug.pad.state());
    assert('O jogo sabe que o jogador está num controle de Xbox, e mostra A e B', pad.using && pad.family === 'xbox' && pad.hand === 'A' && pad.use === 'B', JSON.stringify(pad));

    // ── 2. ANDAR: o analógico e o direcional ──────────────────────────────────────────────────
    await g(() => { window.gameTime.set(0.45); window.gameDebug.hero.teleport(17, 21, 0, 1); window.gameDebug.verbs.hidePrompt(); });
    await sleep(600);
    const start = await hero();
    await stick(1, 0);
    await sleep(700);
    await stick(0, 0);
    await sleep(500);
    const afterStick = await hero();
    assert('O analógico para a direita anda para a direita', afterStick.worldX > start.worldX && afterStick.worldY === start.worldY, JSON.stringify({ start, afterStick }));
    await button(B.DOWN, true);
    await sleep(600);
    await button(B.DOWN, false);
    await sleep(500);
    const afterPad = await hero();
    assert('O direcional para baixo anda para baixo', afterPad.worldY > afterStick.worldY, JSON.stringify({ afterStick, afterPad }));
    // Na diagonal o analógico não trava nem treme: o herói segue numa direção só.
    await stick(0.7, 0.68);
    await sleep(500);
    await stick(0, 0);
    await sleep(500);
    const afterDiag = await hero();
    assert('Na diagonal o herói anda numa direção só (a grade)', (afterDiag.worldX !== afterPad.worldX) !== (afterDiag.worldY !== afterPad.worldY), JSON.stringify({ afterPad, afterDiag }));

    // ── 3. A PAUSA: Start abre, o direcional anda, o B fecha ─────────────────────────────────
    await tap(B.START, 500);
    assert('O Start abre a pausa', await pauseOpen(), '');
    const sel0 = await pauseSelected();
    await tap(B.DOWN, 300);
    const sel1 = await pauseSelected();
    assert('Na pausa, o direcional anda pela lista', sel0 !== sel1 && sel1 !== '', JSON.stringify({ sel0, sel1 }));
    await shot('02-pausa', { note: 'A pausa aberta pelo Start' });
    await tap(B.B, 600);
    assert('O B fecha a pausa', !(await pauseOpen()), '');

    // ── 4. A CONVERSA: o A fala com o vizinho e passa as falas ───────────────────────────────
    // A Shui mora em (5,40) (ver frente-do-npc); sem ela, o primeiro vizinho da lista.
    const shui = await g(() => {
      const list = window.gameDebug.npcs.list();
      return list.find((n) => n.worldX === 5 && n.worldY === 40) ?? list[0] ?? null;
    });
    if (shui) {
      await g(([x, y]) => { window.gameDebug.hero.teleport(x, y + 1, 0, -1); }, [shui.worldX, shui.worldY]);
      await sleep(700);
      await tap(B.A, 900);
      const talking = (await state()).dialogOpen;
      assert('O A fala com o vizinho da frente', talking, JSON.stringify(shui));
      await shot('03-conversa', { note: 'A conversa aberta pelo A' });
      for (let i = 0; i < 30 && (await state()).dialogOpen; i += 1) await tap(B.A, 350);
      for (let i = 0; i < 20 && ((await state()).itemGetOpen || (await state()).cutsceneActive); i += 1) await tap(B.A, 450);
      assert('O A passa as falas até o fim da conversa', !(await state()).dialogOpen, '');
    } else {
      assert('Há um vizinho para conversar', false, 'a Shui não foi achada');
    }

    // ── 5. A PINTURA: o pincel anda no direcional, o A pinta, o RB troca a tinta ─────────────
    await sleep(500);
    const heroBeforePaint = await hero();
    await g(() => window.gameDebug.minigames.open('paint'));
    await sleep(500);
    const caption = await g(() => document.querySelector('.zh-mg-caption')?.textContent ?? '');
    assert('A legenda da pintura fala do direcional e dos botões do Xbox', /direcional|d-pad/u.test(caption) && caption.includes('LB') && caption.includes('Y'), caption);
    const potBefore = await g(() => document.querySelector('#zh-paint-root .zh-paint-pot.is-on')?.getAttribute('data-color'));
    await button(B.A, true);
    await stick(1, 0);
    await sleep(600);
    await stick(0, 1);
    await sleep(400);
    await stick(0, 0);
    await button(B.A, false);
    await sleep(200);
    const painted = await g(() => {
      const c = document.querySelector('#zh-paint-root canvas');
      const d = c?.getContext('2d')?.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      if (d) for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n += 1;
      return n;
    });
    assert('Segurando o A e mexendo o analógico, o pincel pinta um traço', painted > 60, `${painted} pixels`);
    await tap(B.RB, 300);
    const potAfter = await g(() => document.querySelector('#zh-paint-root .zh-paint-pot.is-on')?.getAttribute('data-color'));
    assert('O RB troca a tinta', potAfter && potAfter !== potBefore, `${potBefore} → ${potAfter}`);
    await shot('04-pintura', { note: 'O traço pintado com o controle' });
    const heroAfterPaint = await hero();
    assert('Pintando, o herói fica parado (o controle é do quadro)', heroAfterPaint.worldX === heroBeforePaint.worldX && heroAfterPaint.worldY === heroBeforePaint.worldY, JSON.stringify({ heroBeforePaint, heroAfterPaint }));
    await g(() => window.gameDebug.minigames.close());
    await sleep(300);

    // ── 6. A PLACA: o nome escrito no teclado de letras ──────────────────────────────────────
    await g(() => window.gameDebug.camp.openSign());
    await sleep(600);
    const keyboard = await g(() => Boolean(document.querySelector('#zh-name-card .zh-padkb')));
    assert('Com o controle, a placa abre com o teclado de letras', keyboard, '');
    // "Lar": baixo (K), direita (L), A; cima (B), esquerda (A), A; baixo (K), sete à direita (R), A; e o Y escreve.
    for (const step of [B.DOWN, B.RIGHT, B.A, B.UP, B.LEFT, B.A, B.DOWN, ...Array(7).fill(B.RIGHT), B.A]) await tap(step, 140);
    await shot('05-placa', { note: 'O nome escrito no teclado de letras da placa' });
    const typed = await g(() => document.querySelector('#zh-name-card input')?.value ?? null);
    await tap(B.Y, 600);
    const home = await g(() => window.gameDebug.camp.home());
    assert('O direcional e o A escrevem "Lar", e o Y põe o nome na placa', typed === 'Lar' && home.name === 'Lar' && !home.nameOpen, JSON.stringify({ typed, name: home.name, open: home.nameOpen }));

    // ── 7. O PLAYSTATION: os botões trocam de nome ───────────────────────────────────────────
    await g(([id]) => { window.__pad.id = id; }, [DUALSENSE]);
    await tap(B.LB, 300);
    const ps = await g(() => window.gameDebug.pad.state());
    const hint = await g(() => window.gameDebug.pad.keyNames('Setas  ·  Z constrói  ·  X fecha'));
    assert('Com um controle de PlayStation o jogo mostra ✕ e ○', ps.family === 'playstation' && ps.hand === '✕' && ps.use === '○', JSON.stringify(ps));
    assert('E os textos de ajuda dizem os botões dele', hint === 'Direcional  ·  ✕ constrói  ·  ○ fecha', hint);
    await g(() => window.gameDebug.minigames.open('paint'));
    const paintCaption = () => g(() => document.querySelector('.zh-mg-caption')?.textContent ?? '');
    await page.keyboard.press('l');
    await sleep(250);
    const keyboardCaption = await paintCaption();
    const keyboardState = await g(() => window.gameDebug.pad.state());
    assert('A tecla remapeada devolve as dicas ao teclado', !keyboardState.using && keyboardState.hand === 'L', JSON.stringify(keyboardState));
    assert('A legenda aberta passa a mostrar o mouse e a tecla configurada', /mouse/u.test(keyboardCaption) && keyboardCaption.includes('L'), keyboardCaption);
    await tap(B.LB);
    const padCaption = await paintCaption();
    assert('A mesma legenda atualiza ao voltar ao controle', !/mouse/u.test(padCaption) && padCaption.includes('✕') && padCaption.includes('L1'), padCaption);
    await shot('06-legenda-atualizada', { note: 'A pintura troca as dicas sem fechar' });
    log(`  controle: ${JSON.stringify(ps)}`);
  },
};

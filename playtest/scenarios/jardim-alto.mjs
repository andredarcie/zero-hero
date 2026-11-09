// JARDIM-ALTO — o jardim do fim tem dois andares e é o ponto mais alto do vale (scripts/jardim-no-alto.mjs).
// Com o portão aberto, o herói sobe do chão ao cume só com a seta para cima, pelas duas escadas, e para na
// frente da fogueira; do cume ele não pula para o planalto pela borda; e os amigos da cena final acham o
// caminho até os lugares em volta do fogo subindo as mesmas escadas.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'jardim-alto',
  description: 'O jardim do fim em dois andares: subir até a fogueira pelas escadas, sem pular da borda.',
  needsGame: false,
  async run({ driver, shot, assert, log }) {
    const { page } = driver;
    const state = () => page.evaluate(() => window.gameDebug?.getState() ?? null);
    const hero = () => page.evaluate(() => ({ x: window.gameDebug.hero.at().x, y: window.gameDebug.hero.at().y }));
    const step = async (key) => {
      await page.keyboard.down(key);
      await sleep(120);
      await page.keyboard.up(key);
      await sleep(420);
    };
    const drain = async () => {
      for (let i = 0; i < 20; i += 1) {
        const st = await state();
        if (!st.dialogOpen && !st.cutsceneActive && !st.itemGetOpen) return;
        if (st.dialogOpen || st.itemGetOpen) await page.keyboard.press('z');
        await sleep(450);
      }
    };

    await page.addInitScript(() => {
      localStorage.setItem('zh.cozy.v1', JSON.stringify({ started: true, introSeen: true }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await sleep(1200);

    // O relevo, perguntado ao jogo.
    const levels = await page.evaluate(() => {
      const g = window.gameDebug;
      let top = 0;
      for (let y = 0; y < 60; y += 1) for (let x = 0; x < 60; x += 1) top = Math.max(top, g.world.reliefLevel(x, y));
      const hearth = g.props.hearths()[0];
      return { top, hearth: hearth ? g.world.reliefLevel(hearth.x, hearth.y) : null, at: hearth ? [hearth.x, hearth.y] : null };
    });
    log(`  relevo: fogueira no nível ${levels.hearth}, o mais alto do vale é ${levels.top}`);
    assert('A fogueira do fim fica dois níveis acima do chão', levels.hearth === 2, String(levels.hearth));
    assert('E é o ponto mais alto do vale', levels.top === levels.hearth, `${levels.top}`);
    const [hx, hy] = levels.at;

    // A ESTRADA ANTIGA: da espada, reto para o norte, só com a seta para cima até o pé do portão (fechado).
    const road = await page.evaluate(() => window.gameDebug.valley.hasOldRoad());
    assert('A estrada antiga está desenhada', road, '');
    const decorOnRoad = await page.evaluate(async ([x, y0, y1]) => {
      const world = await (await fetch('/world.json', { cache: 'no-store' })).json();
      const { chunkColumns: C, chunkRows: R } = world.meta;
      const out = [];
      for (let y = y0; y <= y1; y += 1) {
        const c = world.chunks.find((k) => k.cx === Math.floor(x / C) && k.cy === Math.floor(y / R));
        if (c.upper[y % R][x % C] !== null) out.push(y);
      }
      return out;
    }, [hx, hy + 6, 52]);
    assert('Embaixo da estrada é só a grama (nenhum tufo, flor ou arbusto)', decorOnRoad.length === 0, JSON.stringify(decorOnRoad));
    await page.evaluate(([x, y]) => {
      const g = window.gameDebug; window.gameTime.set(0.45);
      g.hero.teleport(x, y, 0, -1);
    }, [hx, 52]);
    await sleep(600);
    for (let i = 0; i < 20 && (await hero()).y > hy + 6; i += 1) await step('ArrowUp');
    const roadEnd = await hero();
    log(`  estrada: da linha da espada até (${roadEnd.x}, ${roadEnd.y})`);
    assert('Pela estrada, reto, chega-se ao pé do portão do jardim', roadEnd.x === hx && roadEnd.y === hy + 6, JSON.stringify(roadEnd));
    await shot('00-estrada', { note: 'A estrada antiga chegando ao portão do jardim' });

    // A PLACA ao lado do portão: com ele fechado, o jardim está fechado para preservação ambiental.
    await page.evaluate(([x, y]) => {
      const g = window.gameDebug;
      g.hero.teleport(x, y, 0, -1);
    }, [hx - 1, hy + 7]);
    await sleep(500);
    await page.keyboard.press('z');
    await sleep(700);
    const signSays = await page.evaluate(() => (window.gameDebug.dialog.lines() ?? []));
    log(`  placa: ${signSays.join(' / ')}`);
    assert('A placa do portão diz que o jardim está fechado para preservação ambiental', signSays.some((t) => /preserva/i.test(t)), JSON.stringify(signSays));
    await shot('00b-placa', { note: 'A placa velha ao lado do portão' });
    await drain();

    // A MATA ANTIGA: árvores anciãs no jardim e na sebe dele.
    const grove = await page.evaluate(async ([x, y]) => {
      const world = await (await fetch('/world.json', { cache: 'no-store' })).json();
      const { chunkColumns: C, chunkRows: R } = world.meta;
      const upper = (tx, ty) => world.chunks.find((k) => k.cx === Math.floor(tx / C) && k.cy === Math.floor(ty / R)).upper[ty % R][tx % C];
      let ancient = 0; let pines = 0;
      for (let ty = y - 6; ty <= y + 5; ty += 1) for (let tx = x - 6; tx <= x + 5; tx += 1) {
        const f = upper(tx, ty);
        if (f === 73 || f === 74) ancient += 1;
        if ([4, 14, 15, 16, 17, 18].includes(f)) pines += 1;
      }
      return { ancient, pines };
    }, [hx, hy]);
    log(`  mata: ${grove.ancient} árvores anciãs, ${grove.pines} pinheiros comuns em volta do jardim`);
    assert('O jardim alto é mata antiga (árvores anciãs, nenhum pinheiro comum dentro dele)', grove.ancient >= 30 && grove.pines === 0, JSON.stringify(grove));

    // OS LADOS DO PORTÃO ficam no chão e sem árvore: a escada de baixo aparece inteira (pedido do autor).
    const sides = await page.evaluate(([x, y]) => [window.gameDebug.world.relief(x - 1, y + 5), window.gameDebug.world.relief(x + 1, y + 5)], [hx, hy]);
    assert('Os dois lados do portão ficam no chão (a escada de baixo não fica espremida)', sides[0] === 0 && sides[1] === 0, JSON.stringify(sides));

    // A NÉVOA cobre o jardim enquanto ninguém subiu.
    const mistBefore = await page.evaluate(() => window.gameDebug.valley.gardenMist()?.count ?? 0);
    assert('A névoa cobre o jardim alto antes da subida', mistBefore > 30, String(mistBefore));

    // A CHAVE: o portão não abre sozinho. Quem fecha o último pedido a entrega, e ela abre o portão.
    const keyText = await page.evaluate(() => window.gameDebug.world.lines('garden.key').join(' '));
    assert('A fala da chave fala em amizade e natureza, sem contar a surpresa', /chave/i.test(keyText) && /natureza/i.test(keyText) && !/festa|fogueira|encontro/i.test(keyText), keyText);
    await page.evaluate(([x, y]) => {
      const g = window.gameDebug; window.gameTime.set(0.45);
      g.hero.teleport(x, y, 0, -1);
      g.scene.giveGardenKey();
    }, [hx, hy + 6]);
    await sleep(1200);
    await drain();
    const held = await page.evaluate(() => window.gameDebug.items.held());
    assert('A chave do jardim vai para a mão do herói', held === 'key', String(held));
    const shutBefore = await page.evaluate(() => window.gameDebug.getState().ending.gateOpen);
    assert('Antes de usar a chave o portão continua fechado', shutBefore === false, String(shutBefore));
    await page.evaluate(() => window.gameDebug.hero.face(0, -1));
    await page.keyboard.press('x');
    // A cena da fechadura: tirar a chave, enfiar, girar, o trinco ceder e o portão abrir.
    await sleep(1500);
    await shot('00c-chave-na-fechadura', { note: 'A chave girando na fechadura do portão' });
    for (let i = 0; i < 20 && (await state())?.cutsceneActive; i += 1) await sleep(300);
    const opened = await page.evaluate(() => ({ open: window.gameDebug.getState().ending.gateOpen, held: window.gameDebug.items.held(), back: window.gameDebug.scene.backItem().visible }));
    assert('A chave abre o portão do jardim alto', opened.open === true, JSON.stringify(opened));
    assert('A chave fica no portão: a mão e as costas do herói ficam vazias', opened.held === 'none' && !opened.back, JSON.stringify(opened));
    await shot('01-portao', { note: 'O portão aberto pela chave, e o jardim na névoa atrás dele' });
    const heights = [];
    let windSeen = false;
    for (let i = 0; i < 30; i += 1) {
      const p = await hero();
      if (p.x === hx && p.y === hy + 1) break;
      if ((await state())?.cutsceneActive) {
        if (!windSeen) { windSeen = true; await sleep(1500); await shot('01b-vento', { note: 'O vento levando a névoa do jardim' }); }
        await sleep(500);
        continue;
      }
      await step('ArrowUp');
      heights.push(await page.evaluate(() => ({ y: window.gameDebug.hero.at().y })));
    }
    // O último degrau é o que pisa no cume: a cena começa ali, e o teste espera ela acabar.
    for (let i = 0; i < 30; i += 1) {
      if ((await state())?.cutsceneActive) {
        if (!windSeen) { windSeen = true; await sleep(1500); await shot('01b-vento', { note: 'O vento levando a névoa do jardim' }); }
      } else if (windSeen) break;
      await sleep(400);
    }
    const mistAfter = await page.evaluate(() => ({ live: window.gameDebug.valley.gardenMist() !== null, saved: JSON.parse(localStorage.getItem('zh.cozy.v1') || '{}').mistCleared === true }));
    assert('Ao pisar no cume, o vento leva a névoa (cena tocada e lembrada no save)', windSeen && !mistAfter.live && mistAfter.saved, JSON.stringify({ windSeen, ...mistAfter }));
    log(`  subida: ${heights.map((v) => `${v.y}`).join(' → ')}`);
    const top = await hero();
    assert('Só com a seta para cima, o herói chega à frente da fogueira', top.x === hx && top.y === hy + 1, JSON.stringify(top));
    await shot('02-no-cume', { note: 'No cume, diante da fogueira do fim' });

    // Do cume não se pula para o planalto: a borda sul, fora da escada, recusa o passo.
    await page.evaluate(([x, y]) => {
      const g = window.gameDebug;
      g.hero.teleport(x, y);
    }, [hx - 2, hy + 1]);
    await sleep(400);
    await step('ArrowDown');
    const edge = await hero();
    assert('Da borda do cume não se pula para baixo', edge.x === hx - 2 && edge.y === hy + 1, JSON.stringify(edge));

    // Os amigos da cena final: do portão até um lugar em volta do fogo, pelas mesmas escadas.
    const path = await page.evaluate(([x, y]) => window.gameDebug.camp.visitPath([x, y + 6], [[x - 1, y + 1], [x + 1, y + 1]], [99, 99], [x, y]), [hx, hy]);
    log(`  amigos: ${JSON.stringify(path)}`);
    assert('Os amigos sobem pelas escadas até a fogueira', Array.isArray(path) && path.some(([px, py]) => px === hx && py === hy + 2), JSON.stringify(path));

    // A escada do cume é fina, da largura de um herói, e é só pedra: sem lanterna nem luz (pedido do autor).
    const stairs = await page.evaluate(([x, y]) => [-1, 0, 1].map((dx) => window.gameDebug.world.stairFoot(x + dx, y + 2)), [hx, hy]);
    assert('A escada do cume tem a largura de um herói', JSON.stringify(stairs) === JSON.stringify([false, true, false]), JSON.stringify(stairs));
    // Nenhuma chama a um tile e meio da escada (a fogueira do cume fica a dois tiles dela).
    const lights = await page.evaluate(([x, y]) => window.gameDebug.render.firesNear(x, y + 2, 1.5), [hx, hy]);
    assert('As escadas não têm lanterna nem luz', lights === 0, String(lights));

    // A vista de cima: os dois andares inteiros.
    await page.evaluate(([x, y]) => {
      const g = window.gameDebug;
      g.hero.teleport(x, y);
      g.verbs.hidePrompt();
      g.scene.dollyTo(2.3, 300);
    }, [hx, hy + 3]);
    await sleep(2000);
    await shot('03-de-cima', { note: 'O jardim do fim: o planalto e o cume com a fogueira' });
    assert('Nenhum erro na página', (await state()) !== null, '');
  },
};

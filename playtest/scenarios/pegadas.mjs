// AS PEGADAS DO HERÓI (pedido do autor, 2026-11-19: "melhore drasticamente o visual das pegadas do herói").
// Anda na terra para os quatro lados, no capim e na terra na chuva (a lama), e fotografa cada rastro de perto.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'pegadas',
  description: 'As pegadas do herói: na terra para os quatro lados, no capim, e na lama da chuva — de perto.',
  needsGame: false,
  async run({ driver, shot, assert, log }) {
    const { page } = driver;
    const g = (fn, arg) => page.evaluate(fn, arg);
    await page.addInitScript(() => {
      if (sessionStorage.getItem('pegadas')) return;
      sessionStorage.setItem('pegadas', '1');
      localStorage.setItem('zh.cozy.v1', JSON.stringify({
        started: true, introSeen: true, day: 2, clock: 0.42, respawn: { worldX: 30, worldY: 55 }, mistCleared: true,
      }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await sleep(1500);
    const hide = () => g(() => window.gameDebug.verbs.hidePrompt());

    // Uma fileira de seis tiles de TERRA (ground 6) em que se anda, no rumo pedido.
    const dirtRun = (dx, dy) => g(([ax, ay]) => {
      const d = window.gameDebug;
      for (let y = 2; y < 58; y += 1) {
        for (let x = 2; x < 58; x += 1) {
          let ok = true;
          for (let i = 0; i < 6 && ok; i += 1) {
            const t = d.world.tile(x + ax * i, y + ay * i);
            ok = t?.ground === 6 && (i === 0 || !d.hero.stepBlocked(x + ax * (i - 1), y + ay * (i - 1), ax, ay));
          }
          if (ok) return { x, y };
        }
      }
      return null;
    }, [dx, dy]);

    const walk = async (key, ms) => {
      await page.keyboard.down(key);
      await sleep(ms);
      await page.keyboard.up(key);
      await sleep(250);
    };
    const stepped = () => g(() => window.gameDebug.hero.steps().stepped);
    const closeUp = async (name, note) => {
      await hide();
      await g(() => window.gameDebug.scene.dollyTo(0.55, 10));
      await sleep(700);
      await shot(name, { note });
      await g(() => window.gameDebug.scene.dollyTo(1, 10));
      await sleep(300);
    };

    // ── a terra, para o leste e para o norte ──────────────────────────────────────────────────────────────────────
    await g(() => window.gameTime.set(0.42));
    const east = await dirtRun(1, 0);
    log(`  terra para o leste: ${JSON.stringify(east)}`);
    assert('Há uma trilha de terra no vale para andar', east !== null, JSON.stringify(east));
    if (east) {
      await g(([x, y]) => window.gameDebug.hero.teleport(x, y, 1, 0), [east.x, east.y]);
      await sleep(5000); // a placa do lugar some
      let before = await stepped();
      await walk('ArrowRight', 1500);
      let after = await stepped();
      assert('Na terra, cada meio tile andado deixa uma pegada', after - before >= 4, `${before} → ${after}`);
      await closeUp('00-terra-leste', 'Andando para o leste na terra: pé esquerdo e direito, com o bico para a frente');
      await walk('ArrowLeft', 1500);
      await closeUp('01-terra-volta', 'E de volta para o oeste');
      before = await stepped();
      after = before;
    }
    const north = await dirtRun(0, -1);
    log(`  terra para o norte: ${JSON.stringify(north)}`);
    if (north) {
      await g(([x, y]) => window.gameDebug.hero.teleport(x, y, 0, -1), [north.x, north.y]);
      await sleep(5000);
      await walk('ArrowUp', 1500);
      await closeUp('02-terra-norte', 'Andando para o norte na terra');
      await walk('ArrowDown', 1000);
      await closeUp('03-terra-sul', 'E voltando para o sul por cima do rastro');
    }

    // ── o capim ───────────────────────────────────────────────────────────────────────────────────────────────────
    await g(() => window.gameDebug.hero.teleport(30, 55, 1, 0));
    await sleep(5000);
    const before = await stepped();
    await walk('ArrowRight', 1200);
    const after = await stepped();
    assert('No capim também fica pegada (as folhas deitadas)', after - before >= 3, `${before} → ${after}`);
    await closeUp('04-capim', 'No capim: as folhas deitam e se levantam logo');

    // ── a lama: a terra na chuva ──────────────────────────────────────────────────────────────────────────────────
    if (east) {
      await g(() => { window.gameTime.setDay(1); window.gameTime.set(0.675); });
      await sleep(4000);
      const rain = await g(() => window.gameDebug.valley.weather()?.rain ?? 0);
      log(`  chuva: ${rain.toFixed(2)}`);
      await g(([x, y]) => window.gameDebug.hero.teleport(x, y, 1, 0), [east.x, east.y]);
      await sleep(5000);
      await walk('ArrowRight', 1500);
      await closeUp('05-lama', 'Na chuva a terra é lama: a pegada sai funda, com água no fundo');
    }
  },
};

// O MACHADO, A ARVORE VERDE E O MAR.
//
// O machado so morde madeira MORTA (dryTree, dryShrub). A arvore VERDE e um tile assado na malha
// estatica do terreno e NUNCA sai do lugar — o machado de aco, que derrubava qualquer arvore, foi
// removido do jogo, e e essa garantia que deixa a floresta ser escrita uma vez so na GPU.
//
// O que este cenario prova:
//   1. A BORDA E MAR e ninguem passa — nem voadores, que ignoram hazards autorados.
//   2. O machado encostado na fronteira nao abre nada.
//   3. O machado nao derruba arvore verde: ela segue de pe e segue bloqueando.
//   4. O machado derruba a arvore SECA.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DIR_KEY = { '1,0': 'right', '-1,0': 'left', '0,1': 'down', '0,-1': 'up' };

export default {
  name: 'machado',
  description: 'Machado derruba arvore seca, nunca a verde; e o mar fecha a fronteira.',
  // Aventura de verdade (`/?play`), nao um level: os pinheiros-tile e a fronteira do mundo so
  // existem no mundo autorado. Um level e um chunk 12x12 solto, sem borda para testar.
  needsGame: true,
  async run({ driver, shot, assert, log }) {
    await driver.settle(1500);

    const evaluate = (fn, arg) => driver.page.evaluate(fn, arg);
    const state = () => driver.getState();

    // Teleporte: o cenario e sobre CORTAR, nao sobre caminhar. Andar do spawn ate uma arvore
    // especifica atravessaria meio mundo procedural e reprovaria por um obstaculo no caminho.
    const teleport = (x, y) => evaluate(([px, py]) => {
      const s = window.__scene;
      s.playerWorld.worldX = px;
      s.playerWorld.worldY = py;
      s.movementController.interruptMovement(px, py);
    }, [x, y]);

    const give = (kind) => evaluate((k) => { window.__scene.heldItem = k; }, kind);

    const solidAt = (x, y, hazardsPassable = false) => evaluate(
      ([px, py, pass]) => window.__scene.isSolidForEntities(px, py, pass), [x, y, hazardsPassable],
    );

    const tileAt = (x, y) => evaluate(([px, py]) => {
      const t = window.__scene.chunkManager.getTile(px, py);
      return { ground: t.ground, upper: t.upper, collision: t.collision };
    }, [x, y]);

    // ── 1. A fronteira e mar, e o mar bloqueia ate quem ignora hazards ───────
    log('MAR: a borda do mundo tem de ser agua intransponivel');
    // O mundo autorado comeca em (0,0), entao o tile logo fora dele e sempre (-1, y) —
    // vale para qualquer tamanho de mundo, sem depender de metadado nenhum.
    const outside = await tileAt(-1, 5);
    assert('fora do mundo o chao e MAR (frame 33)', outside.ground === 33, JSON.stringify(outside));
    assert('e o mar nao tem camada upper (nada de muralha de pinheiro)', outside.upper === null,
      JSON.stringify(outside));
    assert('o mar bloqueia', (await solidAt(-1, 5)) === true);
    // A trava que importa: voadores ignoram rio e lava autorados. Se ignorassem o mar de terreno,
    // a fronteira teria uma saida.
    assert('o mar bloqueia MESMO quem ignora hazards', (await solidAt(-1, 5, true)) === true);

    // ── 2. O mar nao e madeira: o machado nao abre a fronteira ───────────────
    log('MAR: o machado encostado na fronteira nao pode abrir nada');
    await teleport(0, 5);
    await give('axe');
    await driver.settle(200);
    // Encara a fronteira e USA o machado nela tres vezes (o jogo tem botao agora: andar contra
    // uma coisa nao usa mais item nenhum — ver o cenario `combate`).
    await driver.faceAndUse('left', 3);
    await driver.settle(600);
    const seaAfter = await tileAt(-1, 5);
    assert('depois de machadadas, a fronteira continua mar',
      seaAfter.ground === 33 && seaAfter.upper === null, JSON.stringify(seaAfter));
    assert('e continua bloqueando', (await solidAt(-1, 5)) === true);
    const posAfterSea = (await state()).player;
    assert('o heroi NAO saiu do mundo', posAfterSea.worldX >= 0, JSON.stringify(posAfterSea));

    await shot('machado-fronteira-mar');

    // Achar uma arvore VERDE com um vizinho aberto.
    // Procura no mundo autorado um pinheiro cujo vizinho seja pisavel — e dali que o
    // heroi vai bater. Feito no jogo (e nao com coordenadas fixas) porque o mundo e autorado:
    // uma constante escrita a mao envelheceria no primeiro save do editor.
    const target = await evaluate(() => {
      const s = window.__scene;
      const TREES = new Set([4, 14, 15, 16, 17, 18]);
      const start = s.playerWorld;
      let best = null;
      for (let y = 1; y < 95; y++) {
        for (let x = 1; x < 95; x++) {
          const t = s.chunkManager.getTile(x, y);
          if (t.upper === null || !TREES.has(t.upper)) continue;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx;
            const ny = y + dy;
            if (s.isSolidForEntities(nx, ny, false)) continue;
            const d = Math.abs(nx - start.worldX) + Math.abs(ny - start.worldY);
            if (!best || d < best.d) best = { x, y, nx, ny, dx: -dx, dy: -dy, frame: t.upper, d };
          }
        }
      }
      return best;
    });
    assert('achei uma arvore-tile com vizinho livre', target !== null, JSON.stringify(target));
    log(`ARVORE: tile (${target.x},${target.y}) frame ${target.frame}, batendo de (${target.nx},${target.ny})`);

    const treeKey = DIR_KEY[`${target.dx},${target.dy}`];

    const bumpTree = async (times = 1) => {
      await teleport(target.nx, target.ny);
      await driver.settle(250);
      for (let i = 0; i < times; i += 1) {
        // Encara a arvore (a seta contra uma trava so VIRA o heroi) e golpeia com o B.
        await driver.faceAndUse(treeKey);
        await driver.settle(700);
      }
    };

    // ── 3. O machado nao derruba arvore verde ────────────────────────────────
    log('MACHADO: bate no pinheiro e NAO derruba (arvore verde nunca sai do lugar)');
    await give('axe');
    await bumpTree(4);
    const afterPlain = await tileAt(target.x, target.y);
    assert('o pinheiro segue de pe depois do machado', afterPlain.upper === target.frame,
      JSON.stringify(afterPlain));
    assert('e segue bloqueando', (await solidAt(target.x, target.y)) === true);

    await shot('machado-comum-recusado');

    // ── 4. O machado derruba a arvore SECA ───────────────────────────────────
    log('MACHADO: derruba arvore seca');
    const dry = await evaluate(() => {
      const s = window.__scene;
      const t = (s.dryTrees ?? []).find((d) => d.blocking);
      if (!t) return null;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!s.isSolidForEntities(t.worldX + dx, t.worldY + dy, false)) {
          return { x: t.worldX, y: t.worldY, nx: t.worldX + dx, ny: t.worldY + dy, dx: -dx, dy: -dy };
        }
      }
      return null;
    });
    if (dry === null) {
      log('  (nenhuma arvore seca acessivel neste mundo — pulado)');
    } else {
      await give('axe');
      await teleport(dry.nx, dry.ny);
      await driver.settle(250);
      // A arvore seca cai por ESTAGIOS (6 frames): golpeia ate ela deixar de bloquear.
      await driver.faceAndUse(DIR_KEY[`${dry.dx},${dry.dy}`], 8);
      await driver.settle(900);
      const stillBlocking = await evaluate(([x, y]) => {
        const t = window.__scene.dryTrees.find((d) => d.worldX === x && d.worldY === y);
        return t ? t.blocking : null;
      }, [dry.x, dry.y]);
      assert('o machado derrubou a arvore seca', stillBlocking === false,
        `blocking=${stillBlocking}`);
    }

    await shot('machado-final');
    await sleep(200);
  },
};

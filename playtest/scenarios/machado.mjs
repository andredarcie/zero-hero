// OS DOIS MACHADOS E O MAR — as tres coisas sao um problema so.
//
// O machado de aco derruba QUALQUER arvore. Quase toda arvore deste mundo nao e um prop: e um
// tile da camada upper, assado numa malha estatica unica (846 deles em world.json). Entao o
// item novo e o unico do jogo que edita o TERRENO — e no instante em que ele passou a existir,
// a fronteira do mundo virou um bug de design: ela era literalmente uma muralha de pinheiros
// (VOID_WALL_FRAME = 4), ou seja, feita da mesma coisa que o item existe para destruir. Dava
// para abrir uma porta a machadadas e sair do mapa. Por isso a borda agora e MAR.
//
// O que este cenario prova, e por que cada assert existe:
//   1. A BORDA E MAR e ninguem passa — nem com as botas de lava, que vadeiam todo o resto.
//   2. E o mar NAO E MADEIRA: o machado de aco encostado na fronteira nao abre nada. Este e o
//      assert que da sentido aos outros dois — e a trava, nao a solucao (regra do projeto:
//      "a puzzle is only a puzzle if the easy road is shut").
//   3. O machado COMUM nao derruba pinheiro. Sem isto, os dois itens seriam um item so.
//   4. O machado DE ACO derruba, o tile abre de verdade (colisao vai junto) e deixa um GRAVETO
//      — porque um item cujo unico produto e passagem e uma senha, nao uma ferramenta.
//   5. O machado de aco tambem corta madeira MORTA (dryTree), o que faz dele um superconjunto
//      do machado comum e nao um item paralelo: nenhum puzzle antigo quebra por causa dele.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DIR_KEY = { '1,0': 'right', '-1,0': 'left', '0,1': 'down', '0,-1': 'up' };

export default {
  name: 'machado',
  description: 'Machado de aco derruba arvore-tile; machado comum nao; e o mar fecha a fronteira.',
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

    const solidAt = (x, y, boots = false) => evaluate(
      ([px, py, b]) => window.__scene.isSolidForEntities(px, py, b), [x, y, boots],
    );

    const tileAt = (x, y) => evaluate(([px, py]) => {
      const t = window.__scene.chunkManager.getTile(px, py);
      return { ground: t.ground, upper: t.upper, collision: t.collision };
    }, [x, y]);

    // ── 1. A fronteira e mar, e o mar bloqueia ate as botas ──────────────────
    log('MAR: a borda do mundo tem de ser agua intransponivel');
    // O mundo autorado comeca em (0,0), entao o tile logo fora dele e sempre (-1, y) —
    // vale para qualquer tamanho de mundo, sem depender de metadado nenhum.
    const outside = await tileAt(-1, 5);
    assert('fora do mundo o chao e MAR (frame 33)', outside.ground === 33, JSON.stringify(outside));
    assert('e o mar nao tem camada upper (nada de muralha de pinheiro)', outside.upper === null,
      JSON.stringify(outside));
    assert('o mar bloqueia', (await solidAt(-1, 5)) === true);
    // A trava que importa: as botas de lava atravessam lava E rio. Se atravessassem o mar,
    // a fronteira teria uma chave — e o mundo, uma saida.
    assert('o mar bloqueia MESMO com as botas de lava', (await solidAt(-1, 5, true)) === true);

    // ── 2. O mar nao e madeira: o machado de aco nao abre a fronteira ────────
    log('MAR: o machado de aco encostado na fronteira nao pode abrir nada');
    await teleport(0, 5);
    await give('greatAxe');
    await driver.settle(200);
    await driver.walk('left', 3); // bate na fronteira, repetidamente
    await driver.settle(600);
    const seaAfter = await tileAt(-1, 5);
    assert('depois de machadadas, a fronteira continua mar',
      seaAfter.ground === 33 && seaAfter.upper === null, JSON.stringify(seaAfter));
    assert('e continua bloqueando', (await solidAt(-1, 5)) === true);
    const posAfterSea = (await state()).player;
    assert('o heroi NAO saiu do mundo', posAfterSea.worldX >= 0, JSON.stringify(posAfterSea));

    await shot('machado-fronteira-mar');

    // ── 3. Achar uma arvore-TILE com um vizinho aberto ───────────────────────
    // Procura no mundo autorado um tile cortavel cujo vizinho seja pisavel — e dali que o
    // heroi vai bater. Feito no jogo (e nao com coordenadas fixas) porque o mundo e autorado:
    // uma constante escrita a mao envelheceria no primeiro save do editor.
    const target = await evaluate(() => {
      const s = window.__scene;
      const CHOPPABLE = new Set([3, 4, 14, 15, 16, 17, 18, 21]);
      const start = s.playerWorld;
      let best = null;
      for (let y = 1; y < 95; y++) {
        for (let x = 1; x < 95; x++) {
          const t = s.chunkManager.getTile(x, y);
          if (t.upper === null || !CHOPPABLE.has(t.upper)) continue;
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

    const bumpTree = async () => {
      await teleport(target.nx, target.ny);
      await driver.settle(250);
      const key = DIR_KEY[`${target.dx},${target.dy}`];
      await driver.walk(key, 2);
      await driver.settle(700); // o corte cai em CHOP_IMPACT_MS depois do swing
    };

    // ── 4. O machado COMUM nao derruba pinheiro ──────────────────────────────
    log('MACHADO COMUM: bate no pinheiro e NAO derruba (senao os dois itens seriam um so)');
    await give('axe');
    await bumpTree();
    const afterPlain = await tileAt(target.x, target.y);
    assert('o pinheiro segue de pe depois do machado comum', afterPlain.upper === target.frame,
      JSON.stringify(afterPlain));
    assert('e segue bloqueando', (await solidAt(target.x, target.y)) === true);

    await shot('machado-comum-recusado');

    // ── 5. O machado DE ACO derruba, e o tile abre de verdade ────────────────
    // Pegar o item do CHAO de proposito (e nao so atribuir): a coleta passa por GROUND_VISUAL,
    // HUD_ITEM_VISUAL, BACK_ITEM_VISUAL_3D e ITEM_GET_CFG. Um registro esquecido em qualquer
    // uma dessas tabelas aparece aqui, e nao numa tela preta semanas depois.
    log('MACHADO DE ACO: pegar do chao (valida as tabelas de arte) e derrubar');
    await give('none');
    await teleport(target.nx, target.ny);
    await evaluate(([x, y]) => {
      window.__scene.itemManager.drop('greatAxe', x, y);
    }, [target.nx, target.ny]);
    await driver.settle(400);
    // O item largado nasce DESARMADO sob os pes do heroi (regra do drop): sai e volta.
    const step = DIR_KEY[`${-target.dx},${-target.dy}`];
    await driver.walk(step, 1);
    await driver.settle(300);
    await driver.walk(DIR_KEY[`${target.dx},${target.dy}`], 1);
    await driver.settle(500);
    assert('machado de aco na mao (coletado do chao)', (await state()).heldItem === 'greatAxe',
      `held=${(await state()).heldItem}`);

    await bumpTree();
    const afterSteel = await tileAt(target.x, target.y);
    assert('o pinheiro CAIU (o tile abriu)', afterSteel.upper === null, JSON.stringify(afterSteel));
    // A colisao mora no chunk, nao na malha: a worldgen pinta collision=true embaixo de todo
    // frame de obstaculo, entao limpar so o upper deixaria uma parede invisivel.
    assert('e a colisao caiu junto (nada de parede invisivel)',
      (await solidAt(target.x, target.y)) === false, JSON.stringify(afterSteel));
    // O produto: derrubar tem de ALIMENTAR a economia do fogo, igual derrubar arvore seca.
    const stick = await evaluate(([x, y]) => (window.gameDebug.getState().groundItems ?? [])
      .some((i) => i.kind === 'wood' && i.worldX === x && i.worldY === y), [target.x, target.y]);
    assert('a arvore derrubada deixou um GRAVETO', stick === true);

    await shot('machado-aco-derrubou');

    // ── 6. O machado de aco tambem corta madeira MORTA ───────────────────────
    // Superconjunto, nao item paralelo: se ele nao cortasse o que o machado comum corta, achar
    // o machado de aco poderia TRAVAR um puzzle construido em cima do comum.
    log('MACHADO DE ACO: tambem derruba arvore seca (e superconjunto do comum)');
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
      await give('greatAxe');
      await teleport(dry.nx, dry.ny);
      await driver.settle(250);
      // A arvore seca cai por ESTAGIOS (6 frames): bate ate ela deixar de bloquear.
      await driver.walk(DIR_KEY[`${dry.dx},${dry.dy}`], 8);
      await driver.settle(900);
      const stillBlocking = await evaluate(([x, y]) => {
        const t = window.__scene.dryTrees.find((d) => d.worldX === x && d.worldY === y);
        return t ? t.blocking : null;
      }, [dry.x, dry.y]);
      assert('o machado de aco derrubou a arvore seca tambem', stillBlocking === false,
        `blocking=${stillBlocking}`);
    }

    await shot('machado-final');
    await sleep(200);
  },
};

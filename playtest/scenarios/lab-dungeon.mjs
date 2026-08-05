// O LAB ABRE DUNGEON — `/lab?dungeon=N` edita public/levels/dungeon-N.json, o mesmo editor e o
// mesmo P das fases de puzzle, agora sobre um mundo multi-chunk de verdade (a dungeon-1 tem 48
// chunks, 8x6). A grade do editor sempre foi guiada pelo meta do arquivo (o /editor edita o
// overworld 22x8 assim); o que faltava era a PORTA: o resolver do /api/world rejeitava
// `dungeon-N`, o tipo do client nao o enderecava e o /lab nao tinha query para pedi-lo.
//
// O que este cenario prova:
//   1. `/lab?dungeon=1` carrega a Aguia inteira no editor (meta, 48 chunks);
//   2. o /api/world serve dungeon-N e continua rejeitando qualquer outro id;
//   3. a lista do gerenciador traz as DUAS familias (e por tabela guarda o conserto do bug
//      latente: o index.json e reescrito a partir DESTA lista, e sem as dungeons nela o
//      primeiro salvar do lab as apagava do manifesto);
//   4. P joga a dungeon EDITADA em memoria (prop novo aparece no jogo, activeLevel = 1,
//      heroi no playerStart dela) e ESC devolve o editor — nada salvo em disco.

const START = { x: 24, y: 65 }; // meta.playerStart da dungeon-1 (a Aguia)
const BUSH = { x: 25, y: 65 };  // o arbusto plantado pelo teste, vizinho do spawn

export default {
  name: 'lab-dungeon',
  description: 'O /lab abre, edita e joga uma dungeon (dungeon-N.json) — e a lista do gerenciador preserva as nove no manifesto.',
  needsGame: false,
  route: '/lab?dungeon=1',
  async run({ driver, shot, assert, log }) {
    await driver.settle(3000);
    const page = driver.page;

    // ── 1. A AGUIA NO EDITOR ──────────────────────────────────────────────────
    log('EDITOR: a dungeon-1 carrega inteira');
    const loaded = await page.evaluate(() => {
      const store = window.__scene?.store;
      if (!store) return { error: 'sem store no editor' };
      const meta = store.world.meta;
      return {
        name: meta.name,
        chunksX: meta.worldChunksX,
        chunksY: meta.worldChunksY,
        chunkCount: store.world.chunks.length,
        start: meta.playerStart,
      };
    });
    assert('o editor abriu a Aguia (multi-chunk, nao um 12x12)',
      loaded.name === 'Level 1: A Aguia' && loaded.chunksX === 8 && loaded.chunksY === 6
      && loaded.chunkCount === 48, JSON.stringify(loaded));
    assert('com o playerStart proprio dela',
      loaded.start?.worldX === START.x && loaded.start?.worldY === START.y, JSON.stringify(loaded));
    await shot('aguia-no-editor');

    // ── 2. A PORTA DO API, E SO ELA ───────────────────────────────────────────
    log('API: /api/world serve dungeon-N e rejeita o resto');
    const api = await page.evaluate(async () => ({
      dungeon: (await fetch('api/world?file=dungeon-1')).status,
      garbage: (await fetch('api/world?file=../world')).status,
      stillLevels: (await fetch('api/world?file=level-1')).status,
    }));
    assert('dungeon-1 aberto (200), level-1 intacto (200), id torto rejeitado (400)',
      api.dungeon === 200 && api.stillLevels === 200 && api.garbage === 400, JSON.stringify(api));

    // ── 3. AS DUAS FAMILIAS NA LISTA (o guarda do manifesto) ─────────────────
    log('GERENCIADOR: a lista traz levels E dungeons — o index.json nasce dela');
    const listed = await page.evaluate(async () => {
      const entries = await (await fetch('api/lab-levels')).json();
      return {
        dungeons: entries.filter((e) => e.kind === 'dungeon').map((e) => e.id),
        levels: entries.filter((e) => e.kind === 'level').length,
      };
    });
    assert('as nove dungeons estao na lista (o primeiro salvar do lab nao as apaga mais)',
      listed.dungeons.length === 9 && listed.dungeons.includes('dungeon-1')
      && listed.dungeons.includes('dungeon-9'), JSON.stringify(listed));
    assert('e os levels de puzzle continuam la', listed.levels >= 2, JSON.stringify(listed));

    // ── 4. EDITA, JOGA (P), VOLTA (ESC) — nada salvo ─────────────────────────
    log('EDICAO: planta um arbusto ao lado do spawn, so em memoria');
    await page.evaluate(({ x, y }) => {
      window.__scene.store.placeEntity({ list: 'props', type: 'dryBush', worldX: x, worldY: y });
    }, BUSH);

    log('P: joga a dungeon editada');
    await driver.press('p', { count: 1 });
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 20000 });
    await page.waitForFunction(() => window.gameDebug?.getState()?.levelIntroOpen === false, null, { timeout: 20000 });
    await driver.settle(400);

    const inGame = await page.evaluate(({ bush }) => {
      const state = window.gameDebug.getState();
      return {
        levelName: state.levelName,
        activeLevel: state.activeLevel,
        player: state.player,
        bushThere: window.__scene.getDryBushAt(bush.x, bush.y) !== undefined,
      };
    }, { bush: BUSH });
    assert('o jogo esta NA Aguia (nome e level ativo)',
      inGame.levelName === 'Level 1: A Aguia' && inGame.activeLevel === 1, JSON.stringify(inGame));
    assert('o heroi nasceu no playerStart da dungeon',
      inGame.player.worldX === START.x && inGame.player.worldY === START.y, JSON.stringify(inGame));
    assert('e o arbusto plantado no editor EXISTE no jogo (a edicao viajou pelo P)',
      inGame.bushThere === true, JSON.stringify(inGame));
    await shot('aguia-em-jogo-com-arbusto');

    log('ESC: devolve o editor, sem salvar nada');
    await driver.press('Escape', { count: 1 });
    await driver.settle(600);
    const backInEditor = await page.evaluate(() => {
      const button = document.getElementById('zh-level-manager-open');
      return { uiVisible: button !== null && button.offsetParent !== null };
    });
    assert('a UI do editor esta de volta na tela', backInEditor.uiVisible === true,
      JSON.stringify(backInEditor));
    // O contrato de disco: NADA foi salvo — o arquivo real nao pode ter o arbusto do teste.
    const onDisk = await page.evaluate(async ({ bush }) => {
      const world = await (await fetch('api/world?file=dungeon-1')).json();
      return {
        bushOnDisk: (world.props ?? []).some(
          (p) => p.type === 'dryBush' && p.worldX === bush.x && p.worldY === bush.y,
        ),
      };
    }, { bush: BUSH });
    assert('o dungeon-1.json em disco segue intocado (P nunca salva)',
      onDisk.bushOnDisk === false, JSON.stringify(onDisk));
  },
};

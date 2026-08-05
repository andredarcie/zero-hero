// AS NOVE DUNGEONS SAO GERADAS — e, uma vez geradas, sao DAQUELE SAVE PARA SEMPRE.
//
// Este cenario guarda o encanamento (a promessa que o jogador sente), nao a qualidade da planta:
// quem mede geracao em massa e `npx tsx scripts/audit-dungeons.ts --seeds 200`, que roda o MESMO
// gerador fora do browser (ele e TypeScript puro, sem Phaser e sem Three) e ja e o lugar certo
// para contar salas, ciclos e recusas do juiz. Duplicar isso aqui custaria minutos de Playwright
// para dizer o que um `tsx` diz em segundos.
//
// O que ele prova, na ordem em que o jogador sentiria cada falha:
//   1. entrar num portal do overworld gera uma dungeon (nome, tamanho e o portal de volta no pe
//      do heroi) e ela ja nasce gravada no save;
//   2. sair pela escada e voltar devolve A MESMA dungeon (mesmos tiles, mesma semente);
//   3. RECARREGAR A ABA e entrar de novo devolve a mesma — o retrato atravessa o browser;
//   4. `?dungeons=static` continua lendo os nove arquivos do Zelda 1 do disco (a rede de
//      seguranca e o controle do A/B);
//   5. "Start over" cunha outra semente: a mesma aventura, nove masmorras que ninguem viu.
//
// Ele NAO caminha ate a caverna: `enterDungeon` e chamado direto no `__scene` (a travessia inteira
// roda, com succao, tunel e queda), porque andar meio overworld ate um portal e o tipo de trecho
// que flakeia sem provar nada.

const SAVE_KEY = 'zh.adventure.v1';

/** O retrato salvo de uma dungeon: a planta em RLE + a semente. E a identidade dela. */
const snapshotOf = (page, level) => page.evaluate((n) => {
  const raw = window.localStorage.getItem('zh.adventure.v1');
  if (!raw) return null;
  const save = JSON.parse(raw);
  const snap = save.dungeons?.[`dungeon-${n}`];
  if (!snap) return null;
  return {
    seed: snap.seed,
    name: snap.name,
    chunks: snap.cw * snap.ch,
    runs: snap.tiles.length / 2,
    // Uma assinatura barata da planta inteira: soma posicional do RLE. Dois mapas diferentes
    // batem aqui com probabilidade desprezivel, e comparar a string toda seria um diff ilegivel.
    fingerprint: snap.tiles.reduce((h, v, i) => (h * 31 + v * (i + 1)) % 2147483647, 7),
    bytes: JSON.stringify(snap).length,
    enemies: snap.enemies.length,
    pickups: snap.pickups.length,
  };
}, level);

const enterDungeon = async (driver, level) => {
  await driver.page.evaluate((n) => {
    const scene = window.__scene;
    const portal = scene.levelPortals.find((p) => p.level === n);
    if (!portal) throw new Error(`sem portal para a dungeon ${n} no overworld`);
    // Sem await: a travessia termina num scene.restart(), e a promessa dela morre com a cena.
    void scene.enterDungeon(portal);
  }, level);
  await driver.page.waitForFunction(
    (n) => window.gameDebug?.getState()?.activeLevel === n,
    level,
    { timeout: 20000 },
  );
  await driver.settle(1200);
};

export default {
  name: 'dungeon-gerada',
  description: 'A dungeon nasce da semente da partida, e a mesma dungeon volta depois da saida, da morte e do reload.',
  needsGame: false,
  route: '/?play',
  async run({ driver, shot, assert, log }) {
    const page = driver.page;
    await page.waitForFunction(
      () => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 14000 },
    );
    // Uma aventura limpa: sem retrato antigo, a primeira descida GERA em vez de hidratar.
    await page.evaluate((key) => window.localStorage.removeItem(key), SAVE_KEY);
    await driver.open('/?play');
    await page.waitForFunction(
      () => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 14000 },
    );
    await driver.settle(800);

    // ── 1. A PRIMEIRA DESCIDA GERA ────────────────────────────────────────────
    log('Descendo na dungeon 1 — ela nao existe em disco nenhum: nasce agora');
    await enterDungeon(driver, 1);
    await shot('01-dentro', { note: 'A dungeon 1, gerada da semente desta partida' });

    const first = await snapshotOf(page, 1);
    assert('o save ja guarda o retrato da dungeon 1', first !== null, JSON.stringify(first));
    assert('...com nome proprio e uma semente', Boolean(first?.name) && first.seed > 0, JSON.stringify(first));
    assert('...e o retrato e pequeno (o orcamento do localStorage)',
      first.bytes < 12000, `${first.bytes} bytes`);
    assert('a planta tem salas de verdade (16 chunks na dungeon 1)',
      first.chunks === 16, JSON.stringify(first));
    assert('ela nasceu povoada: covas e tesouro',
      first.enemies > 0 && first.pickups > 0, JSON.stringify(first));

    const inside = await page.evaluate(() => {
      const s = window.gameDebug.getState();
      return {
        player: s.player,
        activeLevel: s.activeLevel,
        spawners: s.enemySpawners.length,
        // A escada de volta fica UM tile ao sul do heroi: sair e um passo deliberado.
        portals: window.__scene.levelPortals.map((p) => ({ x: p.worldX, y: p.worldY, level: p.level })),
      };
    });
    assert('o heroi esta dentro da dungeon 1', inside.activeLevel === 1, JSON.stringify(inside));
    assert('a escada de volta esta um passo ao sul dele',
      inside.portals.some((p) => p.x === inside.player.worldX && p.y === inside.player.worldY + 1),
      JSON.stringify(inside));
    assert('as covas autoradas subiram com o mundo', inside.spawners > 0, JSON.stringify(inside));

    // ── 2. SAIR E VOLTAR: A MESMA DUNGEON ────────────────────────────────────
    log('Um passo ao sul = a escada. Sair e descer de novo tem de dar a MESMA planta');
    await driver.walk('down', 1);
    await page.waitForFunction(
      () => window.gameDebug?.getState()?.activeLevel === null, null, { timeout: 20000 },
    );
    await driver.settle(1200);
    await shot('02-de-volta-ao-overworld', { note: 'De volta a boca da caverna' });

    await enterDungeon(driver, 1);
    const second = await snapshotOf(page, 1);
    assert('a segunda descida devolveu a MESMA planta',
      second.fingerprint === first.fingerprint && second.seed === first.seed,
      JSON.stringify({ first: first.fingerprint, second: second.fingerprint }));

    // ── 3. O RELOAD ──────────────────────────────────────────────────────────
    log('Recarregando a aba: o retrato tem de atravessar o browser');
    await driver.open('/?play');
    await page.waitForFunction(
      () => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 14000 },
    );
    await driver.settle(800);
    await enterDungeon(driver, 1);
    const third = await snapshotOf(page, 1);
    assert('depois do reload, ainda a mesma dungeon',
      third.fingerprint === first.fingerprint,
      JSON.stringify({ first: first.fingerprint, third: third.fingerprint }));
    await shot('03-depois-do-reload', { note: 'A mesma planta, outra sessao de browser' });

    // ── 4. A REDE DE SEGURANCA ───────────────────────────────────────────────
    log('?dungeons=static volta a ler os nove arquivos do Zelda 1');
    await driver.open('/?play&dungeons=static');
    await page.waitForFunction(
      () => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 14000 },
    );
    await driver.settle(800);
    await enterDungeon(driver, 1);
    const staticWorld = await page.evaluate(() => ({
      activeLevel: window.gameDebug.getState().activeLevel,
      player: window.gameDebug.getState().player,
    }));
    // A Aguia do cartucho nasce em (24,65) — coordenada que nenhuma dungeon gerada tem, porque a
    // grade delas e bem menor.
    assert('com ?dungeons=static o heroi nasce no playerStart do arquivo do Zelda 1',
      staticWorld.player.worldX === 24 && staticWorld.player.worldY === 65,
      JSON.stringify(staticWorld));
    await shot('04-estatica', { note: 'A planta exata do Zelda 1, ainda no repositorio' });

    // ── 5. START OVER CUNHA OUTRA SEMENTE ────────────────────────────────────
    log('Start over: a aventura recomeca e as nove masmorras sao outras');
    await driver.open('/');
    await page.waitForFunction(
      () => (window.__game?.scene?.getScenes(true) ?? []).some((s) => s.scene.key === 'title'),
      null, { timeout: 14000 },
    );
    await driver.settle(900);
    await driver.press('2', { count: 1, delay: 300, holdMs: 80 }); // Start over
    await page.waitForFunction(
      () => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 16000 },
    );
    await driver.settle(900);
    await enterDungeon(driver, 1);
    const reborn = await snapshotOf(page, 1);
    assert('a partida nova tem outra semente...',
      reborn.seed !== first.seed, JSON.stringify({ antes: first.seed, agora: reborn.seed }));
    assert('...e portanto outra planta',
      reborn.fingerprint !== first.fingerprint,
      JSON.stringify({ antes: first.fingerprint, agora: reborn.fingerprint }));
    await shot('05-outra-partida', { note: 'Mesma dungeon 1, outra aventura' });
  },
};

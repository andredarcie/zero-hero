// O VENTO — a mata parou de ser uma fotografia.
//
// O que este cenário prova, e por que cada assert existe:
//
//   1. ELE SE MEDE POR A/B CONTRA UM CONTROLE PARADO. "Vi mexer" não é medida: a câmera tem uma
//      deriva de mão (camSway), a poeira anda, o fogo pisca — num quadro qualquer, 1% da tela muda
//      sem vento nenhum. Então a mesma cena é fotografada duas vezes com `hd3d.wind = 0` e duas
//      com 1, e o vento só passa se mexer VÁRIAS VEZES mais que o próprio chão parado. Sem o
//      controle, uma poeira passando na frente aprovaria uma mata completamente imóvel — é a mesma
//      armadilha que a água do `montanha` documenta.
//   2. E ELE ESCALA. Com a força em 5 tem de mexer mais que em 1: isso separa "o efeito existe" de
//      "alguma coisa na tela se move".
//   3. O QUE NÃO É PLANTA NÃO BALANÇA, e esta é a parte que dá para errar em silêncio. As malhas do
//      terreno são fundidas por CAMADA, não por assunto: o mesmo mesh em pé carrega o pinheiro e o
//      TÚMULO, o mesmo mesh deitado carrega o capim e o SEIXO. Quem separa é o atributo `aWind`
//      por vértice — e é ele que o assert lê, tile a tile, porque uma lápide balançando é o tipo de
//      coisa que ninguém vê num teste de pixel e todo mundo vê jogando.
//   4. A FORÇA É UM KNOB VIVO, NUNCA UM RECOMPILE. "Quanto de vento" é decisão de olho e vai ser
//      mexida com o jogo rodando; se mudá-la compilasse um programa novo, o mundo travaria ~500ms
//      no meio da brisa. Conta-se os programas do renderer antes e depois de mexer no knob.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Quantos por cento dos pixels de duas fotos do mesmo tamanho realmente diferem. */
const movedPercent = async (fileA, fileB) => {
  const { readPng } = await import('../../spritefactory/lib/png.mjs');
  const a = readPng(fileA);
  const b = readPng(fileB);
  if (a.width !== b.width || a.height !== b.height) return 100;
  let moved = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.abs(a.data[i] - b.data[i])
      + Math.abs(a.data[i + 1] - b.data[i + 1])
      + Math.abs(a.data[i + 2] - b.data[i + 2]);
    if (d > 20) moved += 1;
  }
  return (moved / (a.data.length / 4)) * 100;
};

export default {
  name: 'vento',
  description: 'A brisa na vegetação: A/B contra um controle parado, o que NÃO balança, e o knob que não recompila.',
  needsGame: false,
  route: '/',
  async run({ driver, shot, assert, log }) {
    const page = driver.page;
    const teleport = (x, y) => page.evaluate(([px, py]) => {
      const scene = window.__scene;
      scene.playerWorld.worldX = px;
      scene.playerWorld.worldY = py;
      scene.movementController.interruptMovement(px, py);
    }, [x, y]);
    const buy = async (id, gateX, gateY) => {
      await page.evaluate(() => window.__scene.explorerDebugSetCoins(60));
      await page.evaluate((card) => window.__scene.explorerDebugSetNextOffers([card]), id);
      await teleport(gateX, gateY);
      await driver.settle(300);
      await driver.useItem();
      await page.waitForSelector('.zh-build-backdrop', { state: 'visible', timeout: 5000 });
      await driver.settle(500);
      await driver.press('Enter');
      await driver.settle(2200);
      await page.evaluate(() => window.__scene.enemyManager?.despawnAll());
    };

    await page.waitForFunction(() => window.__game?.scene.isActive('title'), null, { timeout: 30000 });
    await driver.settle(500);
    await driver.press('Enter');
    await page.waitForFunction(() => window.gameDebug?.getState()?.explorer?.builder != null, null, { timeout: 30000 });
    await driver.settle(1200);

    // A floresta é a carta certa para MEDIR: nenhuma fogueira (a luz não pisca), nenhuma água (o
    // glint não corre) e mata densa de ponta a ponta.
    log('MEDIDA: a mesma mata, parada e ventando');
    await buy('whispering-forest', 10, 8);
    await teleport(17, 3);
    await driver.settle(1200);
    await page.evaluate(() => { window.hd3d.fireflies = 0; window.hd3d.mist = 0; });
    await driver.settle(500);

    const pair = async (tag) => {
      const a = await shot(`vento-${tag}-a`, { note: `Primeiro quadro (${tag}).` });
      await sleep(900);
      const b = await shot(`vento-${tag}-b`, { note: `Segundo quadro (${tag}).` });
      return movedPercent(a, b);
    };

    await page.evaluate(() => { window.hd3d.wind = 0; });
    await driver.settle(600);
    const still = await pair('parado');
    await page.evaluate(() => { window.hd3d.wind = 1; });
    await driver.settle(600);
    const breeze = await pair('brisa');
    await page.evaluate(() => { window.hd3d.wind = 5; });
    await driver.settle(600);
    const gale = await pair('vendaval');
    await page.evaluate(() => { window.hd3d.wind = 1; window.hd3d.fireflies = 3; window.hd3d.mist = 2.2; });

    assert('A mata VENTANDO mexe muito mais tela que a mata parada',
      breeze > still * 1.8, `parado=${still.toFixed(2)}% brisa=${breeze.toFixed(2)}%`);
    assert('E a força do vento escala o movimento',
      gale > breeze, `brisa=${breeze.toFixed(2)}% vendaval=${gale.toFixed(2)}%`);

    // ── o que não é planta ──────────────────────────────────────────────────────────────────
    log('IMOBILIDADE: a lápide e o seixo estão na MESMA malha da árvore, e não podem balançar');
    await buy('sunken-graveyard', 6, 1);
    await teleport(6, -6);
    await driver.settle(1400);

    const masks = await page.evaluate(async () => {
      const w3 = window.__scene.world3d;
      // O mesmo par (tile, vértice) das malhas fundidas: 4 vértices por quad, na ordem em que o
      // construtor os empilhou.
      const CUBES = [45, 46, 47, 39, 40]; // alvenaria e montanha saem da malha de quads
      const upright = {};
      const uprightAttr = w3.solidGeo.attributes.aWind;
      w3.solidTiles.filter((t) => !CUBES.includes(t.frame)).forEach((tile, i) => {
        upright[tile.frame] = upright[tile.frame] ?? { on: 0, off: 0 };
        upright[tile.frame][uprightAttr.getX(i * 4) > 0.5 ? 'on' : 'off'] += 1;
      });
      // O mato deitado não guarda o frame em lugar nenhum do renderer (a malha só sabe UV), então
      // o frame de cada tile vem do ARQUIVO — a carta do cemitério, posta no chunk (0,-1).
      const file = await (await fetch(`${document.baseURI}world.json`)).json();
      const card = file.chunks.find((chunk) => chunk.catalog?.id === 'sunken-graveyard');
      const decorAttr = w3.decorGeo.attributes.aWind;
      const decor = {};
      for (const [key, start] of w3.decorQuads) {
        const [wx, wz] = key.split(',').map(Number);
        const lx = wx;
        const ly = wz + 12; // o chunk comprado ao norte: world y -12..-1 → local 0..11
        if (lx < 0 || lx > 11 || ly < 0 || ly > 11) continue;
        const frame = card?.upper?.[ly]?.[lx];
        if (frame === null || frame === undefined) continue;
        decor[frame] = decor[frame] ?? { on: 0, off: 0 };
        decor[frame][decorAttr.getX(start) > 0.5 ? 'on' : 'off'] += 1;
      }
      return { upright, decor, hasDecorAttr: Boolean(decorAttr) };
    });

    const uprightOf = (frame) => masks.upright[String(frame)];
    // 3/21 = árvore seca (madeira em pé), 22 = cabeça na estaca, 25 = túmulo. Os três moram na
    // mesma malha do cemitério, e é exatamente por isso que este assert existe.
    const wood = [3, 21].map(uprightOf).filter(Boolean);
    const stone = [22, 25].map(uprightOf).filter(Boolean);
    assert('A árvore seca do cemitério obedece ao vento',
      wood.length > 0 && wood.every((entry) => entry.on > 0 && entry.off === 0),
      JSON.stringify(masks.upright));
    assert('A LÁPIDE e a cabeça na estaca ficam paradas — na mesma malha',
      stone.length > 0 && stone.every((entry) => entry.on === 0 && entry.off > 0),
      JSON.stringify(masks.upright));
    assert('A malha do mato deitado carrega a máscara do vento', masks.hasDecorAttr, JSON.stringify(masks));
    // 19/20 = folhagem (mexe), 13 = seixo e 2/9 = graveto (não mexem). Todos no mesmo mesh.
    const leaf = [19, 20].map((f) => masks.decor[String(f)]).filter(Boolean);
    const litter = [2, 9, 13].map((f) => masks.decor[String(f)]).filter(Boolean);
    assert('A folhagem do chão estremece',
      leaf.length > 0 && leaf.every((entry) => entry.on > 0 && entry.off === 0),
      JSON.stringify(masks.decor));
    assert('O seixo e o graveto ficam parados no chão',
      litter.length > 0 && litter.every((entry) => entry.on === 0 && entry.off > 0),
      JSON.stringify(masks.decor));

    await shot('vento-cemiterio', {
      note: 'Onde a madeira balança e a pedra nao: as duas na mesma malha.',
      state: { still, breeze, gale, masks: masks.upright },
    });

    // ── o knob ──────────────────────────────────────────────────────────────────────────────
    log('KNOB: mudar a força é um uniform, nunca um programa novo');
    const programs = () => page.evaluate(() => window.__scene.world3d.rendererInfo.programs.length);
    const before = await programs();
    for (const value of [0, 3, 0.5, 1]) {
      await page.evaluate((v) => { window.hd3d.wind = v; }, value);
      await driver.settle(220);
    }
    const after = await programs();
    assert('Mexer no vento não compila shader nenhum', after === before, `${before} -> ${after}`);
  },
};

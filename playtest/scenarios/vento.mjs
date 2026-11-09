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
//      terreno são fundidas por CAMADA, não por assunto: o mesmo mesh deitado carrega o capim e o
//      SEIXO. Quem separa é o atributo `aWind` por vértice — e é ele que o assert lê, tile a tile
//      (gameDebug.render.windMasks), porque um seixo balançando é o tipo de coisa que ninguém vê num
//      teste de pixel e todo mundo vê jogando.
//   4. A FORÇA É UM KNOB VIVO, NUNCA UM RECOMPILE. "Quanto de vento" é decisão de olho e vai ser
//      mexida com o jogo rodando; se mudá-la compilasse um programa novo, o mundo travaria ~500ms
//      no meio da brisa. Conta-se os programas do renderer antes e depois de mexer no knob.
//
// (A versão anterior comprava as cartas "floresta" e "cemitério" do modo explorador para ter o palco;
// o explorador saiu do jogo, e o palco agora é a mata mais fechada do vale.)
import { readPng } from '../../spritefactory/lib/png.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Frames da camada de cima: pinheiros e árvores (balançam) — ver WIND_SWAY_FRAMES no terrainGeometry. */
const PINES = [4, 14, 15, 16, 17, 18];
/** Na decoração deitada: folhagem (estremece) e seixo/graveto (parados). */
const LEAVES = [19, 20];
const LITTER = [2, 9, 13];

/** Quantos por cento dos pixels de duas fotos do mesmo tamanho realmente diferem. */
const movedPercent = async (fileA, fileB) => {
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
  needsGame: true,
  async run({ driver, shot, assert, log }) {
    const page = driver.page;
    await driver.settle(1200);

    // O palco para MEDIR: o tile livre com mais PINHEIRO em volta (a mata comum; a mata antiga do jardim fica embaixo
    // da névoa dele, que anda sozinha), longe de fogueira (a luz não pisca) e de água (o glint não corre).
    log('MEDIDA: a mesma mata, parada e ventando');
    const forest = await page.evaluate((pines) => {
      const g = window.gameDebug;
      const fires = g.props.campfires();
      let best = null;
      for (let y = 5; y < 55; y += 1) {
        for (let x = 5; x < 55; x += 1) {
          if (g.world.solid(x, y) || fires.some((f) => Math.hypot(f.x - x, f.y - y) < 9)) continue;
          let trees = 0;
          let water = false;
          for (let dy = -4; dy <= 4; dy += 1) for (let dx = -5; dx <= 5; dx += 1) {
            if (pines.includes(g.world.tile(x + dx, y + dy)?.upper)) trees += 1;
            if (g.world.openWater(x + dx, y + dy)) water = true;
          }
          if (!water && (!best || trees > best.trees)) best = { x, y, trees };
        }
      }
      if (best) g.hero.teleport(best.x, best.y);
      window.gameTime.set(0.5);
      return best;
    }, PINES);
    assert('O vale tem uma mata fechada longe de fogo e de água', forest !== null && forest.trees >= 20, JSON.stringify(forest));
    await driver.settle(1200);
    // O controle parado tem de ser PARADO: sem vaga-lume, sem névoa, sem a deriva de mão da câmera (ela sozinha mexia
    // 5% da tela, mais que a brisa inteira) e sem o aviso de controles do rodapé, que aparece e some no tempo dele.
    const knobs = await page.evaluate(() => {
      const was = { fireflies: window.hd3d.fireflies, mist: window.hd3d.mist, camSway: window.hd3d.camSway };
      Object.assign(window.hd3d, { fireflies: 0, mist: 0, camSway: 0 });
      const hint = document.getElementById('zh-controls-hint');
      if (hint) hint.style.display = 'none';
      return was;
    });
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
    await page.evaluate((was) => Object.assign(window.hd3d, { wind: 1, ...was }), knobs);

    assert('A mata VENTANDO mexe muito mais tela que a mata parada',
      breeze > still * 1.8, `parado=${still.toFixed(2)}% brisa=${breeze.toFixed(2)}%`);
    assert('E a força do vento escala o movimento',
      gale > breeze, `brisa=${breeze.toFixed(2)}% vendaval=${gale.toFixed(2)}%`);

    // ── o que não é planta ──────────────────────────────────────────────────────────────────
    log('IMOBILIDADE: na mesma malha, o que é planta balança e o que é pedra não');
    const masks = await page.evaluate(() => window.gameDebug.render.windMasks());
    const mixed = (layer) => Object.entries(masks[layer]).filter(([, e]) => e.on > 0 && e.off > 0).map(([f]) => f);
    const present = (layer, frames) => frames.map((f) => masks[layer][String(f)]).filter(Boolean);
    log(`  em pé: ${JSON.stringify(masks.upright)}`);
    log(`  deitado: ${JSON.stringify(masks.decor)}`);
    assert('Cada frame obedece ao vento por inteiro ou não obedece (nenhum tile pela metade)',
      mixed('upright').length === 0 && mixed('decor').length === 0, JSON.stringify({ upright: mixed('upright'), decor: mixed('decor') }));
    const pines = present('upright', PINES);
    assert('Os pinheiros do vale obedecem ao vento', pines.length > 0 && pines.every((e) => e.on > 0 && e.off === 0), JSON.stringify(masks.upright));
    const decorOn = Object.values(masks.decor).some((e) => e.on > 0);
    const decorOff = Object.values(masks.decor).some((e) => e.off > 0);
    assert('Na MESMA malha deitada, uma parte estremece e outra fica parada', decorOn && decorOff, JSON.stringify(masks.decor));
    const leaf = present('decor', LEAVES);
    const litter = present('decor', LITTER);
    if (leaf.length) assert('A folhagem do chão estremece', leaf.every((e) => e.on > 0 && e.off === 0), JSON.stringify(masks.decor));
    if (litter.length) assert('O seixo e o graveto ficam parados no chão', litter.every((e) => e.on === 0 && e.off > 0), JSON.stringify(masks.decor));

    await shot('vento-mata', {
      note: 'A mata do vale: o que balança e o que não.',
      state: { still, breeze, gale, masks: masks.upright },
    });

    // ── o knob ──────────────────────────────────────────────────────────────────────────────
    log('KNOB: mudar a força é um uniform, nunca um programa novo');
    const programs = () => page.evaluate(() => window.gameDebug.render.programs());
    const before = await programs();
    for (const value of [0, 3, 0.5, 1]) {
      await page.evaluate((v) => { window.hd3d.wind = v; }, value);
      await driver.settle(220);
    }
    const after = await programs();
    assert('Mexer no vento não compila shader nenhum', after === before, `${before} -> ${after}`);
  },
};

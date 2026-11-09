// A MONTANHA — a pedra da serra: ela existe no vale, o volume dela e PINTADO, e ela barra todo mundo.
//
// O que este cenario prova, e por que cada assert existe:
//
//   1. O VOLUME E PINTADO. Com `normalUp` toda face recebe a mesma luz, entao sem cor de vertice
//      a pedra le como adesivo. A malha de rocha tem de ter `color`, com o teto no topo da faixa e
//      alguma face bem abaixo dele.
//   2. E ELA BARRA, inclusive quem ignora hazards: o desenho e cosmetico para a fisica, e essa e a
//      parte que nao pode mudar.
//
// (A versao anterior tambem cobrava a montanha em CUBO com a arte do Chao de Pedra, a agua do MAR
// andando e a praia dele. A montanha de hoje e esculpida pelo contorno da serra, com arte propria
// (ROCK_TOP_FRAMES), e o vale e cercado de mata: nao ha mar. Esses asserts sairam.)
//
// Roda na AVENTURA (`?play`): a serra so existe no mundo autorado.

export default {
  name: 'montanha',
  description: 'A montanha da serra: existe, o volume e pintado, e ela barra ate quem ignora hazards.',
  needsGame: true,
  async run({ driver, shot, assert, log }) {
    await driver.settle(1500);
    const page = driver.page;
    const evaluate = (fn, arg) => page.evaluate(fn, arg);

    const teleport = (x, y) => evaluate(([px, py]) => {
      const g = window.gameDebug;
      g.hero.teleport(px, py);
    }, [x, y]);

    // O tamanho do mundo sai do proprio arquivo, nunca escrito aqui: o mundo e autorado a mao e
    // um numero fixo neste teste apodrece no dia em que alguem redimensiona o mapa no /editor.
    const size = await evaluate(async () => {
      const w = await (await fetch('/world.json')).json();
      return {
        w: w.meta.worldChunksX * w.meta.chunkColumns,
        h: w.meta.worldChunksY * w.meta.chunkRows,
      };
    });
    log(`mundo: ${size.w}x${size.h} tiles`);

    // ── 2. Ela e cubo, e continua bloqueando ─────────────────────────────────
    log('CUBO: a montanha tem teto e face sul, e saiu da malha de quads');
    const cliff = await evaluate(({ w, h }) => {
      const g = window.gameDebug;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (g.world.tile(x, y).upper !== 39) continue;
          // Uma com chao aberto ao sul, para a face da frente aparecer na foto.
          const below = g.world.tile(x, y + 1);
          if (below.upper === null && !below.collision) return { x, y };
        }
      }
      return null;
    }, size);
    assert('o mundo tem montanha para olhar', cliff !== null, JSON.stringify(cliff));

    // A malha de rocha e a faixa de sombra pintada nela. (O teto em y=1 e a face sul no z+0.5 eram do cubo de antes;
    // a montanha de hoje e esculpida pelo contorno da serra, e esses dois vertices nao existem mais.)
    const cube = await evaluate(({ x, y }) => window.gameDebug.render.rockCube(x, y), cliff);
    assert('existe a malha de rocha (material terrain-rock)', cube.mesh === true, JSON.stringify(cube));
    assert('o volume esta PINTADO: o teto e o mais claro e alguma face esta bem abaixo dele',
      cube.topShade >= cube.shadeMax - 1e-3 && cube.shadeMin < 0.8, JSON.stringify(cube));

    // A parte que nao pode ter mudado: cubo e desenho, colisao e colisao.
    const solid = await evaluate(
      ([x, y]) => [
        window.gameDebug.world.solid(x, y, false),
        window.gameDebug.world.solid(x, y, true),
      ],
      [cliff.x, cliff.y],
    );
    assert('a montanha bloqueia, inclusive para quem ignora hazards',
      solid[0] === true && solid[1] === true, JSON.stringify(solid));

    await teleport(cliff.x, cliff.y + 3);
    await driver.settle(700);
    await shot('montanha-cubo', { note: `Montanha em cubo vista de baixo (${cliff.x},${cliff.y})` });
  },
};

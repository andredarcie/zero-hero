// A FLOR DA LUA — uma planta, duas poses, e a travessia entre elas.
//
// A flor fecha na luz e abre no escuro: botao fechado BLOQUEIA, flor aberta e PONTE de petalas. O
// que este cenario cobra e o que estava errado antes de existir o sheet novo: o fechado e o aberto
// eram dois desenhos independentes, e o jogador lia duas coisas trocando de lugar em vez de uma
// planta mudando de estado.
//
// Provar isso num teste tem exatamente uma forma honesta: perguntar ao RENDERER de que folha cada
// um dos dois corpos esta desenhando. Se as duas geometrias apontam para o mesmo sheet e para
// frames vizinhos de um mesmo ladder, a promessa e estrutural — nao depende de ninguem olhar e
// achar que ficou parecido.
//
//   1. Na luz da fogueira ela nasce FECHADA, e o tile e parede (o heroi esbarra e nao passa).
//   2. Apagada a fogueira, ela abre — e a abertura passa pelo LADDER: poses intermediarias, os dois
//      bancos dissolvendo um no outro no meio, e o tile so libera DEPOIS que as petalas descem.
//   3. Aberta, o heroi pisa em cima.
//   4. Reacesa a fogueira, ela fecha e volta a bloquear — e o caminho de volta e o mesmo ladder.
//
// A assercao 2 e a que importa: uma flor que pulasse de fechada a aberta em um frame passaria em
// "abriu" e falharia aqui, que e o pedido de verdade.

const FLOWER = { x: 7, y: 5 };
const FIRE = { x: 7, y: 3 }; // dentro dos ~2.6 tiles que mantem a flor fechada
const HERO = { x: 5, y: 5 };
// Uma segunda flor LONGE da fogueira, so pra cobrar o snap de boot na outra direcao: nascida no
// escuro ela tem de JA estar aberta. Sem essa, o unico caso testado seria o trivial (nasce fechada
// e o alvo tambem e fechado), e uma flor que animasse por cima da carta de titulo do level passaria.
const DARK_FLOWER = { x: 4, y: 8 };

export default {
  name: 'flor-da-lua',
  description: 'Uma flor, nove poses: fecha na luz, abre no escuro pelo ladder, e o tile segue a arte.',
  needsGame: false, // entra pelo editor; a GameScene nasce no P (a regra do braco/fios/portao)
  route: '/lab?level=1',
  async run({ driver, shot, assert, log }) {
    await driver.settle(3000);
    const page = driver.page;

    log('EDITOR: uma flor, uma fogueira perto dela, e um corredor limpo pro heroi');
    const authored = await page.evaluate(({ flower, fire, hero, dark }) => {
      const store = window.__scene?.store;
      if (!store) return { error: 'sem store no editor' };

      // O level 1 e um puzzle cheio: limpa a area antes ou o teste mede a mobilia do vizinho.
      for (let x = 3; x <= 10; x += 1) {
        for (let y = 2; y <= 8; y += 1) {
          store.eraseEntitiesAt(x, y);
          store.setCell('upper', x, y, null);
          store.setCell('collision', x, y, false);
        }
      }
      store.setSpawn(hero.x, hero.y);
      // A perto PRIMEIRO: a ordem de colocacao e a ordem em que o runtime as constroi, e o resto do
      // cenario le moonflowers[0] como "a que a fogueira controla".
      store.placeEntity({ list: 'props', type: 'moonflower', worldX: flower.x, worldY: flower.y });
      store.placeEntity({ list: 'props', type: 'moonflower', worldX: dark.x, worldY: dark.y });
      // A fogueira e o interruptor da flor. Ela nasce ACESA porque e a mais perto do spawn (a
      // regra do runtime pra qual fogueira comeca viva), e e isso que faz a flor nascer fechada.
      store.placeEntity({ list: 'props', type: 'campfire', worldX: fire.x, worldY: fire.y });
      // A folha tem de existir no lado PHASER tambem (paleta e chip do tabuleiro), com os 9 frames
      // fatiados. Um erro de frameWidth no assetManifest nao quebra o jogo — ele so desenha a folha
      // inteira espremida num tile, e ninguem repara ate abrir o editor.
      const tex = window.__scene?.textures?.get('moonflower');
      return {
        flowers: store.allEntities().filter((e) => e.type === 'moonflower').length,
        fires: store.allEntities().filter((e) => e.type === 'campfire').length,
        sheetFrames: tex ? tex.getFrameNames().length : 0,
      };
    }, { flower: FLOWER, fire: FIRE, hero: HERO, dark: DARK_FLOWER });
    assert('a flor da lua e autoravel pelo editor', authored.flowers === 2,
      JSON.stringify(authored));
    assert('e a fogueira que a mantem fechada esta posta', authored.fires === 1,
      JSON.stringify(authored));
    assert('a folha da flor entrou no Phaser fatiada em 9 poses', authored.sheetFrames === 9,
      JSON.stringify(authored));

    log('LAB: P joga o mundo editado');
    await driver.press('p', { count: 1 });
    await driver.settle(2200);
    await page.waitForFunction(() => window.gameDebug?.getState()?.levelIntroOpen === false,
      null, { timeout: 15000 });
    await driver.settle(400);

    // ── 1. NA LUZ: fechada, e parede ───────────────────────────────────────
    const born = await driver.getState();
    const shut = born.moonflowers[0];
    const dark = born.moonflowers[1];
    assert('na luz da fogueira a flor nasce FECHADA', born.moonflowers.length === 2
      && shut.open === false && shut.openness === 0, JSON.stringify(born.moonflowers));
    assert('e ela nasce parada na pose, sem animar no boot', shut.standingFrame === 0,
      JSON.stringify(shut));
    // O snap de boot na outra direcao: nascida longe do fogo, a flor JA esta aberta no primeiro
    // estado observavel. Sem o snap ela abriria por cima da carta de titulo do level.
    assert('e a flor nascida no escuro JA esta aberta (snap de boot, sem animar)',
      dark.openness === 1 && dark.blocking === false, JSON.stringify(dark));
    assert('o botao fechado BLOQUEIA o tile', shut.blocking === true, JSON.stringify(shut));
    await shot('flor-fechada-na-luz');

    const teleport = (x, y) => page.evaluate(([px, py]) => {
      const s = window.__scene;
      s.playerWorld.worldX = px;
      s.playerWorld.worldY = py;
      s.movementController.interruptMovement(px, py);
    }, [x, y]);

    log('TRAVA: bare-handed, o botao recusa o heroi (a trava, nao so a solucao)');
    await teleport(FLOWER.x - 1, FLOWER.y);
    await driver.settle(250);
    await driver.press('ArrowRight', { count: 1 });
    await driver.settle(500);
    const bumped = await driver.getState();
    assert('o heroi esbarra e continua do lado de ca',
      bumped.player.worldX === FLOWER.x - 1 && bumped.player.worldY === FLOWER.y,
      JSON.stringify(bumped.player));

    // ── 2. O ESCURO: ela abre PELO LADDER ──────────────────────────────────
    log('ESCURO: apaga a fogueira e observa a abertura quadro a quadro');
    // Amostra a animacao INTEIRA enquanto ela roda. E a unica forma de provar que existe
    // travessia: um estado final aberto e compativel com um corte seco de um frame.
    const arc = await page.evaluate(async () => {
      const fires = window.__scene?.campfires ?? [];
      for (const cf of fires) if (cf.isLit) cf.extinguish();
      const seen = [];
      for (let i = 0; i < 120; i += 1) {
        const mf = window.gameDebug?.getState()?.moonflowers?.[0];
        if (mf) {
          seen.push({
            o: mf.openness,
            sf: mf.standingFrame,
            lf: mf.lyingFrame,
            sa: Number(mf.standingAlpha.toFixed(2)),
            la: Number(mf.lyingAlpha.toFixed(2)),
            blocking: mf.blocking,
            sheet: mf.sheet,
          });
          if (mf.openness >= 1) break;
        }
        await new Promise((r) => setTimeout(r, 40));
      }
      return seen;
    });
    const last = arc[arc.length - 1];
    assert('a flor abriu de vez', last?.o === 1, JSON.stringify(last));

    // A promessa central: UMA folha para os dois estados.
    const sheets = [...new Set(arc.map((s) => s.sheet))];
    assert('os dois corpos desenham da MESMA folha do inicio ao fim',
      sheets.length === 1 && sheets[0] === 'moonflower', JSON.stringify(sheets));

    // O ladder: poses INTERMEDIARIAS de verdade, nos dois bancos.
    const standingPoses = [...new Set(arc.filter((s) => s.sa > 0).map((s) => s.sf))].sort();
    const lyingPoses = [...new Set(arc.filter((s) => s.la > 0).map((s) => s.lf))].sort();
    assert('o banco EM PE passou por poses intermediarias (nao pulou de fechado a aberto)',
      standingPoses.length >= 3, JSON.stringify(standingPoses));
    assert('e o banco DEITADO tambem tem mais de uma pose', lyingPoses.length >= 2,
      JSON.stringify(lyingPoses));
    assert('as poses em pe sao frames 0..4 do sheet e as deitadas 5..8',
      standingPoses.every((f) => f >= 0 && f <= 4) && lyingPoses.every((f) => f >= 5 && f <= 8),
      JSON.stringify({ standingPoses, lyingPoses }));

    // A dissolvencia: existe um instante em que os DOIS corpos estao na tela ao mesmo tempo, cada
    // um com alpha parcial. Sem isso a troca de geometria seria um corte, e a costura apareceria.
    const dissolving = arc.filter((s) => s.sa > 0.05 && s.la > 0.05);
    assert('houve dissolvencia: os dois bancos coexistem na travessia',
      dissolving.length >= 1, JSON.stringify(arc.map((s) => [s.o, s.sa, s.la])));
    log(`  ladder: ${standingPoses.length} poses em pe, ${lyingPoses.length} deitadas, `
      + `${dissolving.length} amostras em dissolvencia`);

    // A colisao segue a ARTE, nao o gatilho: o tile ainda era parede depois da metade da abertura.
    const lateBlock = arc.filter((s) => s.blocking).map((s) => s.o);
    const openedWhileBlocking = Math.max(0, ...lateBlock);
    assert('o tile continuou bloqueando com a flor ja meio aberta (colisao segue a arte)',
      openedWhileBlocking >= 0.5, JSON.stringify({ openedWhileBlocking }));
    assert('e liberou so no fim', arc.some((s) => s.o >= 0.9 && !s.blocking),
      JSON.stringify(arc.slice(-4)));
    await shot('flor-aberta-no-escuro');

    // ── 3. ABERTA E PONTE ──────────────────────────────────────────────────
    log('PONTE: aberta, o heroi pisa em cima');
    await teleport(FLOWER.x - 1, FLOWER.y);
    await driver.settle(250);
    await driver.press('ArrowRight', { count: 1 });
    await driver.settle(700);
    const crossing = await driver.getState();
    assert('o heroi entra no tile da flor aberta',
      crossing.player.worldX === FLOWER.x && crossing.player.worldY === FLOWER.y,
      JSON.stringify(crossing.player));
    await shot('heroi-em-cima-da-flor');

    // ── 4. A LUZ DE VOLTA: fecha pelo mesmo ladder ─────────────────────────
    log('LUZ: reacende a fogueira; a flor recolhe as petalas e volta a bloquear');
    await teleport(HERO.x, HERO.y);
    const closeArc = await page.evaluate(async () => {
      const fires = window.__scene?.campfires ?? [];
      for (const cf of fires) if (!cf.isLit) cf.light();
      const seen = [];
      for (let i = 0; i < 120; i += 1) {
        const mf = window.gameDebug?.getState()?.moonflowers?.[0];
        if (mf) {
          seen.push({ o: mf.openness, sf: mf.standingFrame, sa: Number(mf.standingAlpha.toFixed(2)) });
          if (mf.openness <= 0) break;
        }
        await new Promise((r) => setTimeout(r, 40));
      }
      return seen;
    });
    const closed = await driver.getState();
    assert('a flor fechou de novo', closed.moonflowers[0].openness === 0,
      JSON.stringify(closed.moonflowers));
    assert('e voltou a bloquear o tile', closed.moonflowers[0].blocking === true,
      JSON.stringify(closed.moonflowers));
    const closePoses = [...new Set(closeArc.filter((s) => s.sa > 0).map((s) => s.sf))];
    assert('o fechamento tambem passou pelo ladder (nao foi um corte)', closePoses.length >= 3,
      JSON.stringify(closePoses));
    // Fechar RECUA da luz: e mais rapido que abrir, e e isso que faz os dois lados lerem como
    // eventos diferentes em vez de uma animacao tocada de tras pra frente.
    log(`  abriu em ~${arc.length * 40}ms, fechou em ~${closeArc.length * 40}ms`);
    assert('fechar e mais rapido que abrir', closeArc.length < arc.length,
      JSON.stringify({ open: arc.length, close: closeArc.length }));
    await shot('flor-fechada-de-novo');

    // Um retrato do MEIO do caminho, que e onde a troca de geometria acontece — a hora em que a
    // costura entre os dois bancos apareceria, se houvesse costura. Fica no FIM de proposito: uma
    // travessia interrompida pra posar no meio do cenario roubaria o tempo da medicao seguinte, e
    // foi assim que a primeira versao acabou cronometrando um fechamento pela metade.
    // Melhor-esforco: a animacao nao para pra ser fotografada.
    log('RETRATO: mais uma abertura, fotografada no meio da dissolvencia');
    await page.evaluate(async () => {
      const fires = window.__scene?.campfires ?? [];
      for (const cf of fires) if (cf.isLit) cf.extinguish();
      for (let i = 0; i < 80; i += 1) {
        const o = window.gameDebug?.getState()?.moonflowers?.[0]?.openness ?? 0;
        if (o >= 0.45) return;
        await new Promise((r) => setTimeout(r, 20));
      }
    });
    await shot('flor-no-meio-da-travessia');

    log('OK: uma folha, nove poses, ladder nos dois sentidos, e a colisao seguindo a arte.');
  },
};

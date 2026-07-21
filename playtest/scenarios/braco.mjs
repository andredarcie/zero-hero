// O BRACO ROBOTICO: a primeira coisa do jogo que move um item sem o heroi na jogada.
//
// O cenario entra pelo LAB de proposito, e nao por um level pronto. O braco e uma peca de
// AUTORIA — o que se pede dele e "coloquei no editor, girei, funcionou" — entao o teste percorre
// exatamente esse caminho: coloca pelo EditorStore, gira, aperta P e joga o mundo em memoria.
// Testar sobre um level ja gravado pularia justamente a parte que quase se perdeu no caminho: a
// direcao sobrevivendo ao place/erase do editor (o `sameEntity` do store ignorava `dir`, e girar
// um braco no proprio tile virava um no-op silencioso).
//
// O que ele prova, nesta ordem:
//   1. GIRO: as 4 direcoes gravam os tiles certos de entrada e saida (e a rotacao e mesmo 4-way).
//   2. TRANSPORTE: um item largado na entrada aparece na saida, sozinho, sem o heroi encostar.
//   3. A TRAVA: o corpo da maquina e SOLIDO — o item atravessa um tile que o heroi contorna.
//   4. RECUSA: com a saida ocupada, o braco nao mexe — dois itens no mesmo tile seria um sumico.
//   5. FOGO: uma tocha ACESA entregue a maquina atravessa ACESA — o combustivel queima em
//      transito (pode morrer no meio do arco) e a carga pousada acende o que ha de inflamavel
//      ao lado da saida. E a chama cruzando um muro sem combustivel nenhum.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Um ciclo completo (procura, alcanca, fecha, atravessa, larga, volta) da ~1.5s. O teste espera
// com folga e faz polling em vez de dormir um numero magico: maquina lenta nao pode reprovar.
const CYCLE_TIMEOUT_MS = 6000;

export default {
  name: 'braco',
  description: 'O braco robotico: gira nas 4 direcoes e leva um item da entrada pra saida sozinho.',
  // needsGame: false de proposito. O cenario entra no EDITOR, e o startGame do harness procura
  // uma GameScene — nao achando, ele recarrega em /?play e joga fora a rota do lab. Aqui a
  // GameScene nasce mais tarde, quando o P levanta o mundo em memoria.
  needsGame: false,
  route: '/lab',
  async run({ driver, shot, assert, log }) {
    await driver.settle(3000);

    // ── 1. Colocar os bracos pelo store do editor ────────────────────────────
    // Um braco por direcao, bem espalhados, para os tiles de um nao encostarem nos do outro.
    const PLACED = [
      { worldX: 3, worldY: 3, dir: 0 }, // norte
      { worldX: 6, worldY: 6, dir: 1 }, // leste
      { worldX: 3, worldY: 9, dir: 2 }, // sul
      { worldX: 9, worldY: 3, dir: 3 }, // oeste
    ];

    // O lab abre sobre o level-1, que e um puzzle DdENSO: os onze itens estao no chao e quase
    // todo tile tem lava, agua, rocha ou mato. Antes de qualquer coisa, limpa-se um quadrado 3x3
    // em volta de cada braco — senao a saida nasce bloqueada e a maquina, corretamente, se
    // recusa a trabalhar, e o teste acusaria um defeito que nao existe.
    log('EDITOR: limpa o terreno em volta de cada braco (o level-1 e denso demais)');
    await driver.page.evaluate((list) => {
      const store = window.__scene.store;
      const clear = (x, y) => {
        store.eraseEntitiesAt(x, y); // itens autorais, props (lava, agua, rocha, mato...)
        store.setCell('upper', x, y, null); // arvores do tileset
        store.setCell('collision', x, y, false); // colisao pintada a mao
      };
      for (const p of list) {
        for (let dx = -1; dx <= 1; dx += 1) {
          for (let dy = -1; dy <= 1; dy += 1) clear(p.worldX + dx, p.worldY + dy);
        }
      }
      // A pista do estagio de FOGO (9): a carga ACESA pousada em (7,6) espalha dali — nada de
      // combustivel do level pode encostar nessa faixa, senao um incendio alheio contamina o
      // assert. Limpa a fileira inteira e planta DOIS capins com papeis opostos: o de (8,6),
      // vizinho da SAIDA, deve pegar; o de (4,6), vizinho da ENTRADA, deve SOBREVIVER — o
      // braco carrega o graveto embora antes do fusivel de 850ms, e fogo nao nasce de um tile
      // vazio (o espalhamento do deposito e condicional: hasLitItemAt no disparo).
      for (let x = 4; x <= 8; x += 1) for (let y = 5; y <= 7; y += 1) clear(x, y);
      store.placeEntity({ list: 'props', type: 'tallGrass', worldX: 8, worldY: 6 });
      store.placeEntity({ list: 'props', type: 'tallGrass', worldX: 4, worldY: 6 });
    }, PLACED);

    // O QUINTO braco, o unico VINCULADO a rede: (8,9) leste, entrada (7,9) e saida (9,9). Os
    // quatro de cima nao tem vinculo nenhum, entao sao autoalimentados e nunca veem energia
    // cair — e sem isso nao ha como testar a inversao. A variavel `motor` fica sem produtor de
    // proposito: nenhuma placa/roda/caldeira a escreve, entao o cenario e quem manda nela.
    // A faixa e limpa porque ali mora o lago de lava do level-1.
    log('EDITOR: coloca o braco CABEADO (8,9) vinculado a variavel motor');
    await driver.page.evaluate(() => {
      const store = window.__scene.store;
      for (let x = 6; x <= 10; x += 1) {
        for (let y = 8; y <= 10; y += 1) {
          store.eraseEntitiesAt(x, y);
          store.setCell('upper', x, y, null);
          store.setCell('collision', x, y, false);
        }
      }
      store.replaceGlobalVariables({ ...store.globalVariables, motor: false });
      store.placeEntity({ list: 'props', type: 'inserter', worldX: 8, worldY: 9, dir: 1, variable: 'motor' });
    });

    log('EDITOR: coloca um braco em cada uma das 4 direcoes pelo EditorStore');
    const placedOk = await driver.page.evaluate((list) => {
      const store = window.__scene?.store;
      if (!store) return 'sem store no editor';
      for (const p of list) {
        store.placeEntity({ list: 'props', type: 'inserter', worldX: p.worldX, worldY: p.worldY, dir: p.dir });
      }
      // Le de volta o que o mundo REALMENTE guardou — e aqui que um `dir` perdido apareceria.
      // Filtra pelos tiles QUE ESTE TESTE colocou: o level-1 e um arquivo de AUTORIA, e quem
      // estiver desenhando puzzles pode ter salvo bracos proprios nele. Exigir que o mundo tenha
      // exatamente estes quatro seria o teste reprovando o trabalho do autor.
      const mine = new Set(list.map((q) => `${q.worldX},${q.worldY}`));
      return store.allEntities()
        .filter((e) => e.list === 'props' && e.type === 'inserter' && mine.has(`${e.worldX},${e.worldY}`))
        .map((e) => `${e.worldX},${e.worldY},${e.dir}`)
        .sort()
        .join(' | ');
    }, PLACED);

    const expectPlaced = PLACED.map((p) => `${p.worldX},${p.worldY},${p.dir}`).sort().join(' | ');
    assert('o store guarda os 4 bracos COM a direcao', placedOk === expectPlaced, placedOk);

    // ── 2. O giro no proprio tile nao pode ser um no-op ──────────────────────
    // Recolocar o mesmo braco no mesmo lugar com outra direcao TEM de mudar o mundo. Foi o bug
    // que o `sameEntity` escondia: ele comparava tipo e posicao e concluia "ja esta ali".
    log('EDITOR: girar um braco no proprio tile precisa ser uma mudanca de verdade');
    const rotatedInPlace = await driver.page.evaluate(() => {
      const store = window.__scene.store;
      store.placeEntity({ list: 'props', type: 'inserter', worldX: 6, worldY: 6, dir: 2 });
      const arm = store.allEntities().find((e) => e.list === 'props' && e.type === 'inserter' && e.worldX === 6 && e.worldY === 6);
      return arm?.dir;
    });
    assert('girar no proprio tile muda a direcao (nao e no-op)', rotatedInPlace === 2, `veio ${rotatedInPlace}`);

    // devolve o braco do meio pro leste, que e a direcao que o resto do cenario usa
    await driver.page.evaluate(() => {
      window.__scene.store.placeEntity({ list: 'props', type: 'inserter', worldX: 6, worldY: 6, dir: 1 });
    });

    // ── 3. O atalho G, que e como o humano gira ──────────────────────────────
    log('EDITOR: a tecla G cicla a direcao do proximo braco');
    await driver.page.evaluate(() => {
      // seleciona a paleta de props no braco, senao o G nao se aplica
      window.__scene.uiState.tab = 'props';
      window.__scene.uiState.entity = { list: 'props', type: 'inserter' };
    });
    const dirBefore = await driver.page.evaluate(() => window.__scene.uiState.propDir);
    await driver.press('g', { count: 1 });
    await sleep(200);
    const dirAfter = await driver.page.evaluate(() => window.__scene.uiState.propDir);
    assert('a tecla G cicla a direcao', dirAfter === (dirBefore + 1) % 4, `${dirBefore} -> ${dirAfter}`);

    await shot('braco-editor');

    // ── 4. Jogar o mundo em memoria ─────────────────────────────────────────
    log('LAB: P joga o mundo editado (nada e salvo)');
    await driver.press('p', { count: 1 });
    await driver.settle(2500);

    const arms = await driver.page.evaluate((list) => {
      const mine = new Set(list.map((q) => `${q.worldX},${q.worldY}`));
      return (window.__scene.inserters ?? [])
        .filter((a) => mine.has(`${a.worldX},${a.worldY}`))
        .map((a) => ({ x: a.worldX, y: a.worldY, dir: a.dir, in: a.inputTile, out: a.outputTile }));
    }, PLACED);
    assert('os 4 bracos colocados existem no jogo', arms.length === 4, `achei ${arms.length}`);

    // Norte tira do sul e poe no norte; leste tira do oeste e poe no leste; e assim por diante.
    // Y cresce pra BAIXO, entao norte e -1.
    const EXPECT = {
      '3,3': { dir: 0, in: [3, 4], out: [3, 2] },
      '6,6': { dir: 1, in: [5, 6], out: [7, 6] },
      '3,9': { dir: 2, in: [3, 8], out: [3, 10] },
      '9,3': { dir: 3, in: [10, 3], out: [8, 3] },
    };
    for (const arm of arms) {
      const want = EXPECT[`${arm.x},${arm.y}`];
      assert(`braco (${arm.x},${arm.y}) e um dos colocados`, want !== undefined);
      assert(`braco (${arm.x},${arm.y}) aponta pra ${want?.dir}`, arm.dir === want?.dir, `veio ${arm.dir}`);
      assert(
        `braco (${arm.x},${arm.y}) dir ${arm.dir}: entra em ${want?.in} e sai em ${want?.out}`,
        arm.in[0] === want?.in[0] && arm.in[1] === want?.in[1]
        && arm.out[0] === want?.out[0] && arm.out[1] === want?.out[1],
        `veio entrada ${arm.in}, saida ${arm.out}`,
      );
    }

    // ── 5. A garra mora sobre a ORIGEM, e presa a maquina ───────────────────
    // A v1 estacionava a garra em cima do proprio corpo, e ela era uma mao solta boiando: nada
    // ligava uma coisa a outra. Agora ela pousa sobre a origem (e a sombra dela no chao e o
    // convite pra depositar) e uma fileira de elos vai do ombro ate o punho.
    const rig = await driver.page.evaluate(() => {
      const arm = window.__scene.inserters.find((a) => a.worldX === 6 && a.worldY === 6);
      return {
        handX: Math.round(arm.handX * 100) / 100,
        handY: Math.round(arm.handY * 100) / 100,
        handElev: arm.handElev,
        // As duas juntas: ombro->cotovelo e cotovelo->punho. Se as duas distancias baterem com
        // os comprimentos das pecas, as juntas se ENCONTRAM — que e a definicao de um braco
        // conectado. Uma barra solta apareceria aqui como uma distancia que nao fecha.
        // 0.66 = SHOULDER_ELEV (o topo da coluna giratoria). Se esse numero sair de sincronia
        // com o objeto, o assert acusa uma junta aberta que nao existe — foi o que aconteceu
        // quando o ombro subiu junto com a base v3.
        upperSpan: Math.hypot(arm.elbowX - arm.worldX, arm.elbowY - arm.worldY, arm.elbowElev - 0.66),
        foreSpan: Math.hypot(arm.handX - arm.elbowX, arm.handY - arm.elbowY, arm.handElev - arm.elbowElev),
      };
    });
    assert('a garra descansa SOBRE a origem (5,6)', rig.handX === 5 && rig.handY === 6, JSON.stringify(rig));
    // Parada, a maquina fica de braco ERGUIDO — so mergulha quando aparece carga. Sao os
    // estados que se leem de longe, entao o repouso tem de estar bem acima do chao. (O repouso
    // RESPIRA ±0.028 de proposito — o convite de "poe algo aqui" e uma coisa viva — entao o
    // limiar fica folgado abaixo do fundo da respiracao.)
    assert('em repouso o braco fica ALTO', rig.handElev > 0.7, `elev ${rig.handElev}`);
    assert(
      'as juntas se encontram: ombro-cotovelo = 0.70 e cotovelo-punho = 0.52',
      Math.abs(rig.upperSpan - 0.7) < 0.02 && Math.abs(rig.foreSpan - 0.52) < 0.02,
      JSON.stringify(rig),
    );

    // Num braco apontado pro FUNDO da tela (norte/sul), a dobra vertical projeta pra zero — o
    // rig colapsava numa linha e a maquina era um poste. O plano de dobra agora deita pro lado
    // nesses angulos (ELBOW_SIDE), entao o cotovelo tem de sair da coluna TAMBEM em X. O braco
    // (3,3) aponta pro norte e descansa sobre (3,4): e o pior caso, e e aqui que se mede.
    const sideBend = await driver.page.evaluate(() => {
      const arm = window.__scene.inserters.find((a) => a.worldX === 3 && a.worldY === 3);
      return {
        offX: Math.abs(arm.elbowX - arm.worldX),
        upperSpan: Math.hypot(arm.elbowX - arm.worldX, arm.elbowY - arm.worldY, arm.elbowElev - 0.66),
      };
    });
    assert('apontado pro fundo, o cotovelo dobra DE LADO (nao vira poste)', sideBend.offX > 0.12, `offX ${sideBend.offX}`);
    assert('e a dobra lateral NAO estica o elo: ombro-cotovelo segue 0.70', Math.abs(sideBend.upperSpan - 0.7) < 0.02, `span ${sideBend.upperSpan}`);

    // ── 5b. Pisar na origem entrega a carga ─────────────────────────────────
    // O gesto que torna o braco alimentavel: o jogo nao tem botao de largar item, entao entrar
    // no tile de origem com algo na mao TEM de depositar sozinho.
    log('JOGO: o heroi pisa na origem segurando um item — a carga tem de ficar ali');
    const walkOn = await driver.page.evaluate(async () => {
      const scene = window.__scene;
      const arm = scene.inserters.find((a) => a.worldX === 6 && a.worldY === 6);
      const [ix, iy] = arm.inputTile;
      scene.heldItem = 'key'; // como se o heroi tivesse chegado com a chave na mao
      scene.handleTileEntered(ix, iy);
      return { held: scene.heldItem, onTile: scene.itemManager.snapshot().find((i) => i.worldX === ix && i.worldY === iy)?.kind ?? null };
    });
    assert('pisar na origem largou a chave no tile', walkOn.onTile === 'key', JSON.stringify(walkOn));
    assert('e a mao do heroi ficou vazia', walkOn.held === 'none', JSON.stringify(walkOn));

    // deixa o terreno limpo pro teste de transporte que vem a seguir
    await driver.page.evaluate(() => {
      const items = window.__scene.itemManager;
      items.takeAt(5, 6);
      items.takeAt(7, 6);
    });
    await sleep(2200); // deixa a garra terminar qualquer ciclo que tenha comecado

    // ── 6. A maquina e solida ───────────────────────────────────────────────
    const solid = await driver.page.evaluate(() => window.__scene.isSolidForEntities(6, 6, false));
    assert('o corpo do braco BLOQUEIA (e o que o torna peca de puzzle)', solid === true);

    // ── 6. O TRANSPORTE ─────────────────────────────────────────────────────
    // Larga uma pedra na entrada do braco do meio (5,6) e nao encosta em mais nada. Se em algum
    // momento ela aparecer em (7,6), o braco atravessou o proprio corpo com a carga.
    log('JOGO: larga uma pedra na ENTRADA (5,6) e ninguem mais toca nela');
    // As perguntas sao sempre POR TILE, nunca por tipo de item: o level-1 ja tem os onze itens
    // espalhados pelo chao, e um `find(kind === 'wood')` acha o graveto do PUZZLE do outro lado
    // do mapa em vez do que este teste largou. Foi exatamente esse o engano da primeira versao.
    const itemAt = (x, y) => driver.page.evaluate(([px, py]) => {
      const it = window.__scene.itemManager.snapshot().find((i) => i.worldX === px && i.worldY === py);
      return it ? it.kind : null;
    }, [x, y]);

    // Espiao de audio. "Nao ouvi o som" tem duas causas muito diferentes — nao disparar e
    // disparar baixo demais — e so uma delas e um bug de fiacao. Contar os osciladores criados
    // durante o ciclo separa as duas de uma vez: a trilha e o vento tocam por buffer, entao um
    // oscilador novo aqui so pode ter vindo do playArmGrab.
    await driver.page.evaluate(() => {
      window.__oscCount = 0;
      const proto = (window.AudioContext || window.webkitAudioContext).prototype;
      const orig = proto.createOscillator;
      proto.createOscillator = function patched() {
        window.__oscCount += 1;
        return orig.call(this);
      };
    });

    await driver.page.evaluate(() => window.__scene.itemManager.drop('stone', 5, 6));
    assert('a pedra comeca na entrada (5,6)', (await itemAt(5, 6)) === 'stone');

    // …e agora ele TEM de abaixar. E a unica coisa que faz a maquina parecer viva quando ha
    // trabalho: o mergulho so acontece com carga na origem. O limiar e no PUNHO, e o punho para
    // de descer uma garra acima do item (a pinca pende NODE_UP abaixo dele, dedos pra baixo —
    // sao os dedos que fazem o ultimo palmo): agarrar e punho ~0.52, repouso e ~0.92.
    let dipped = false;
    for (let i = 0; i < 25; i += 1) {
      const elev = await driver.page.evaluate(() => window.__scene.inserters.find((a) => a.worldX === 6 && a.worldY === 6).handElev);
      if (elev < 0.6) { dipped = true; break; }
      await sleep(60);
    }
    assert('com carga na origem, o braco MERGULHA pra pegar', dipped);

    // Um retrato NO MEIO da travessia. O ciclo e alcancar(320) + fechar(140) + atravessar(560),
    // entao por volta de 700ms a garra esta em cima da propria maquina com a carga pendurada —
    // que e o unico instante em que da pra ver se a animacao existe mesmo ou se o item so
    // teleportou de um tile pro outro.
    // Antes do arco comecar correm ate 220ms de respiro + 170 descendo + 120 fechando + 170
    // levantando; a meia-volta leva 520. Entao por volta de 950ms o braco esta com o punho no
    // ponto mais lateral do arco — o instante em que da pra ver se a haste liga o ombro a garra
    // de verdade, ou se a mao voltou a boiar.
    await sleep(950);
    await shot('braco-no-meio-do-arco');
    await sleep(220);
    await shot('braco-arco-adiante');

    let arrived = false;
    const deadline = Date.now() + CYCLE_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if ((await itemAt(7, 6)) === 'stone') { arrived = true; break; }
      await sleep(200);
    }
    assert('a pedra chega sozinha na SAIDA (7,6)', arrived);

    const oscs = await driver.page.evaluate(() => window.__oscCount);
    assert('a garra TOCOU o som ao agarrar (playArmGrab disparou)', oscs > 0, `${oscs} osciladores`);
    assert('a ENTRADA ficou vazia — a pedra foi movida, nao copiada', (await itemAt(5, 6)) === null);

    await shot('braco-transportou');

    // ── 7. A RECUSA: saida ocupada ──────────────────────────────────────────
    // A saida (7,6) ainda tem a pedra que acabou de chegar. Poe outra na entrada: o braco tem de
    // ficar parado, porque dois itens no mesmo tile seriam um sumico silencioso.
    log('JOGO: com a saida ocupada, o braco recusa a carga em vez de empilhar');
    await driver.page.evaluate(() => window.__scene.itemManager.drop('wood', 5, 6));
    await sleep(3500);

    assert('com a saida ocupada, o graveto FICA na entrada', (await itemAt(5, 6)) === 'wood');
    assert('a saida continua com a pedra que ja estava la', (await itemAt(7, 6)) === 'stone');

    // …e a recusa e VISIVEL: o braco se inclina sobre a carga que ele quer e nao pode pegar
    // (STRAIN_ELEV 0.66, com um tremor). Sem essa postura, saida bloqueada e maquina quebrada
    // eram a mesma imagem. Bem acima do grab (0.52): inclinar nao e trabalhar; bem abaixo do
    // repouso respirando (0.92 ± 0.028): inclinar nao e descansar.
    const strainElev = await driver.page.evaluate(
      () => window.__scene.inserters.find((a) => a.worldX === 6 && a.worldY === 6).handElev,
    );
    assert('recusando, o braco se INCLINA sobre a carga presa', strainElev > 0.55 && strainElev < 0.75, `elev ${strainElev}`);
    await shot('braco-recusando-inclinado');

    // ── 8. A saida ocupada NO MEIO do ciclo tambem recusa ───────────────────
    // A checagem de saida livre morava so no idle — o ciclo inteiro (pegar, atravessar, largar)
    // leva ~1.5s, e qualquer coisa que ocupasse a saida NESSE meio tempo (outro braco, um item
    // largado, um caixote empurrado) recebia a carga POR CIMA: dois itens num tile, e o segundo
    // e um sumico silencioso. O release tem de revalidar e ESPERAR com a carga na garra.
    log('JOGO: a saida vaga, o braco parte — e a saida e ocupada NO MEIO do arco');
    await driver.page.evaluate(() => window.__scene.itemManager.takeAt(7, 6)); // libera: o ciclo comeca
    let grabbed = false;
    const grabDeadline = Date.now() + CYCLE_TIMEOUT_MS;
    while (Date.now() < grabDeadline) {
      const carried = await driver.page.evaluate(
        () => window.__scene.inserters.find((a) => a.worldX === 6 && a.worldY === 6).carriedKind,
      );
      if (carried === 'wood') { grabbed = true; break; }
      await sleep(80);
    }
    assert('a garra agarrou o graveto (ciclo em andamento)', grabbed);

    // Enquanto a garra atravessa, a saida e ocupada de novo.
    await driver.page.evaluate(() => window.__scene.itemManager.drop('stone', 7, 6));
    await sleep(3000); // tempo de sobra pro ciclo alcancar o release

    const midBlock = await driver.page.evaluate(() => {
      const s = window.__scene;
      return {
        outKinds: s.itemManager.snapshot().filter((i) => i.worldX === 7 && i.worldY === 6).map((i) => i.kind),
        carried: s.inserters.find((a) => a.worldX === 6 && a.worldY === 6).carriedKind,
      };
    });
    assert('o braco NAO empilhou: um item so na saida', midBlock.outKinds.length === 1,
      JSON.stringify(midBlock));
    assert('a garra SEGURA a carga esperando a saida vagar', midBlock.carried === 'wood',
      JSON.stringify(midBlock));
    await shot('braco-segurando-sobre-saida-ocupada');

    // Saida livre de novo: a entrega que estava suspensa acontece.
    await driver.page.evaluate(() => window.__scene.itemManager.takeAt(7, 6));
    let delivered = false;
    const freeDeadline = Date.now() + CYCLE_TIMEOUT_MS;
    while (Date.now() < freeDeadline) {
      if ((await itemAt(7, 6)) === 'wood') { delivered = true; break; }
      await sleep(200);
    }
    assert('saida livre: o graveto suspenso e entregue', delivered);

    // ── 9. O FOGO viaja com a carga ─────────────────────────────────────────
    // A tocha acesa entregue a maquina desce ACESA pro chao, sobe acesa na garra, chega acesa
    // na saida — e o graveto pousado e uma FONTE: o capim plantado em (8,6) tem de pegar
    // sozinho. E o unico jeito do jogo de levar chama pra onde nenhuma mao chega.
    log('JOGO: tocha ACESA entregue ao braco atravessa acesa — e acende o capim do outro lado');
    await driver.page.evaluate(() => {
      const items = window.__scene.itemManager;
      items.takeAt(5, 6);
      items.takeAt(7, 6);
    });
    await sleep(2200); // qualquer ciclo pendente termina

    const litDeposit = await driver.page.evaluate(() => {
      const s = window.__scene;
      s.heldItem = 'wood';
      s.heldOnFire = true;
      s.torchFuelMs = 5000;
      s.handleTileEntered(5, 6); // o heroi pisa na origem com a tocha acesa
      const it = s.itemManager.snapshot().find((i) => i.worldX === 5 && i.worldY === 6);
      return { held: s.heldItem, onFire: s.heldOnFire, ground: it ? { kind: it.kind, lit: !!it.fire } : null };
    });
    assert('o deposito poe o graveto ACESO no chao (fogo desceu junto)',
      litDeposit.ground?.kind === 'wood' && litDeposit.ground?.lit === true, JSON.stringify(litDeposit));
    assert('e a mao do heroi esvaziou', litDeposit.held === 'none' && litDeposit.onFire === false,
      JSON.stringify(litDeposit));

    let carriedLit = false;
    const litGrabDeadline = Date.now() + CYCLE_TIMEOUT_MS;
    while (Date.now() < litGrabDeadline) {
      const carried = await driver.page.evaluate(() => {
        const a = window.__scene.inserters.find((x) => x.worldX === 6 && x.worldY === 6);
        return { kind: a.carriedKind, lit: !!a.carriedFire };
      });
      if (carried.kind === 'wood') { carriedLit = carried.lit; break; }
      await sleep(80);
    }
    assert('a garra carrega a carga ACESA (a chama viaja pendurada)', carriedLit === true);
    await shot('braco-carga-acesa');

    let litArrived = null;
    const litArriveDeadline = Date.now() + CYCLE_TIMEOUT_MS;
    while (Date.now() < litArriveDeadline) {
      litArrived = await driver.page.evaluate(() => {
        const it = window.__scene.itemManager.snapshot().find((i) => i.worldX === 7 && i.worldY === 6);
        return it ? { kind: it.kind, lit: !!it.fire, fuel: it.fire?.fuelMs ?? 0 } : null;
      });
      if (litArrived?.kind === 'wood') break;
      await sleep(200);
    }
    assert('o graveto chega ACESO na saida', litArrived?.lit === true, JSON.stringify(litArrived));
    assert('e o combustivel QUEIMOU em transito (nao congelou na garra)',
      litArrived.fuel > 0 && litArrived.fuel < 4600, JSON.stringify(litArrived));

    // O capim em (8,6), vizinho da saida, pega da carga pousada (FIRE_SPREAD_MS depois).
    let grassCaught = false;
    const spreadDeadline = Date.now() + 4000;
    while (Date.now() < spreadDeadline) {
      const st = await driver.page.evaluate(
        () => window.__scene.tallGrasses.find((g) => g.worldX === 8 && g.worldY === 6)?.state ?? 'missing',
      );
      if (st === 'burning' || st === 'cut') { grassCaught = true; break; }
      await sleep(200);
    }
    assert('o capim vizinho da saida PEGA da carga pousada — o fogo cruzou o muro', grassCaught);

    // O gemeo de controle: o capim em (4,6), vizinho da ENTRADA, tem de estar INTACTO. O braco
    // levou o graveto embora antes do fusivel do deposito vencer — um espalhamento cego aqui
    // acenderia fogo a partir de um tile vazio (o bug do fantasma que este assert trava).
    const inputGrass = await driver.page.evaluate(
      () => window.__scene.tallGrasses.find((g) => g.worldX === 4 && g.worldY === 6)?.state ?? 'missing',
    );
    assert('o capim vizinho da ENTRADA sobrevive — sem fogo fantasma de tile vazio',
      inputGrass === 'tall', `estado: ${inputGrass}`);
    await shot('braco-fogo-atravessou');

    // ── 10. A chama pode MORRER no meio do arco ─────────────────────────────
    // Combustivel curto: a esteira inteira leva ~2s, entao 700ms de chama morrem em transito e
    // a carga chega como madeira apagada — drama de graca, e o contrato de que o relogio da
    // tocha nunca congela so porque saiu da mao do heroi.
    log('JOGO: com pouco combustivel a chama morre em transito — chega madeira apagada');
    await driver.page.evaluate(() => window.__scene.itemManager.takeAt(7, 6));
    await sleep(400);
    await driver.page.evaluate(() => {
      const s = window.__scene;
      s.heldItem = 'wood';
      s.heldOnFire = true;
      s.torchFuelMs = 700;
      s.handleTileEntered(5, 6);
    });
    let deadArrived = null;
    const deadDeadline = Date.now() + CYCLE_TIMEOUT_MS;
    while (Date.now() < deadDeadline) {
      deadArrived = await driver.page.evaluate(() => {
        const it = window.__scene.itemManager.snapshot().find((i) => i.worldX === 7 && i.worldY === 6);
        return it ? { kind: it.kind, lit: !!it.fire } : null;
      });
      if (deadArrived?.kind === 'wood') break;
      await sleep(200);
    }
    assert('a carga chegou como madeira APAGADA (a chama morreu no caminho)',
      deadArrived?.kind === 'wood' && deadArrived.lit === false, JSON.stringify(deadArrived));

    // ── 11. CORTAR A ENERGIA DESFAZ A ENTREGA ───────────────────────────────
    // O braco e a unica peca do jogo que poe um item onde o heroi NAO alcanca — logo a unica
    // capaz de criar um beco sem saida de verdade. O contrato que fecha esse buraco: desligar a
    // fonte faz a maquina ir buscar o que entregou e devolver na origem, UMA vez, e so entao
    // morrer. Aqui usa-se o quinto braco, o unico vinculado a rede (`motor`): os quatro de cima
    // sao autoalimentados e nunca veem a energia cair.
    const armState = () => driver.page.evaluate(() => window.gameDebug.getState().inserters
      .find((a) => a.worldX === 8 && a.worldY === 9));

    const born = await armState();
    assert('o braco cabeado existe e nasce SEM energia (motor=false)',
      born?.variable === 'motor' && born.powered === false, JSON.stringify(born));

    // Desligado e sem divida, ele e so um braco desligado: a carga na entrada nao anda.
    log('JOGO: desligado e sem divida, o braco nao encosta na carga');
    await driver.page.evaluate(() => window.__scene.itemManager.drop('stone', 7, 9));
    await sleep(2600);
    assert('sem energia e sem divida, a pedra FICA na entrada (7,9)', (await itemAt(7, 9)) === 'stone');
    const idleOff = await armState();
    assert('e ele nao deve nada a ninguem', idleOff.owes === false && idleOff.reversed === false,
      JSON.stringify(idleOff));

    // Liga: a entrega normal acontece e ABRE a divida.
    log('JOGO: liga o motor — a pedra atravessa e a maquina passa a DEVER a devolucao');
    await driver.page.evaluate(() => window.__scene.globalVariables.set('motor', true));
    let sent = false;
    const sendDeadline = Date.now() + CYCLE_TIMEOUT_MS;
    while (Date.now() < sendDeadline) {
      if ((await itemAt(9, 9)) === 'stone') { sent = true; break; }
      await sleep(150);
    }
    assert('energizado, o braco leva a pedra de (7,9) pra saida (9,9)', sent);
    const owing = await armState();
    assert('e passa a DEVER a devolucao do que entregou', owing.owes === true, JSON.stringify(owing));

    // Corta: a maquina vai buscar de volta. E a promessa toda — a entrega tem volta.
    log('JOGO: corta o motor — a maquina vai buscar a pedra e devolve na origem');
    await driver.page.evaluate(() => window.__scene.globalVariables.set('motor', false));
    let undoing = false;
    const undoDeadline = Date.now() + 3000;
    while (Date.now() < undoDeadline) {
      const st = await armState();
      if (st.reversed === true) { undoing = true; break; }
      await sleep(80);
    }
    assert('sem energia com divida em aberto, ele entra em modo DESFAZER', undoing);
    await shot('braco-desfazendo');

    let returned = false;
    const returnDeadline = Date.now() + CYCLE_TIMEOUT_MS * 2; // o desfazer corre a 0.62x
    while (Date.now() < returnDeadline) {
      if ((await itemAt(7, 9)) === 'stone') { returned = true; break; }
      await sleep(150);
    }
    assert('a pedra VOLTA sozinha pra entrada (7,9) — a entrega e reversivel', returned);
    assert('e a saida (9,9) ficou vazia', (await itemAt(9, 9)) === null);

    // Quitada a divida, ele para de novo — nao vira uma esteira ao contrario levando tudo que
    // aparecer na saida pra origem. Uma pedra nova na saida tem de ficar exatamente onde esta.
    log('JOGO: divida quitada, ele volta a ser um braco desligado (nao e esteira reversa)');
    let settled = null;
    const settleDeadline = Date.now() + 6000;
    while (Date.now() < settleDeadline) {
      settled = await armState();
      if (settled.reversed === false && settled.busy === false) break;
      await sleep(150);
    }
    assert('ele para de desfazer e volta ao repouso, sem divida',
      settled.reversed === false && settled.owes === false && settled.busy === false,
      JSON.stringify(settled));

    await driver.page.evaluate(() => window.__scene.itemManager.drop('wood', 9, 9));
    await sleep(2600);
    assert('um item novo na SAIDA nao e sequestrado por um braco desligado',
      (await itemAt(9, 9)) === 'wood', 'o braco arrastou algo que nunca entregou');
    await shot('braco-desligado-sem-divida');

    log('OK: gira nas 4 direcoes, atravessa a carga sozinho, recusa empilhar, leva FOGO — e '
      + 'DESFAZ a entrega quando a energia cai.');
  },
};

// A TRAVESSIA DO PORTAL — as quatro batidas, na ordem, cada uma provada onde ela acontece.
//
// A sequencia inteira e uma so animacao contada por DOIS objetos GameScene diferentes: a succao
// e o tunel rodam na cena do level velho, a queda roda na cena do level novo, e entre as duas ha
// um `scene.restart()` que apaga tudo. Um teste que so olhasse o comeco e o fim veria apenas
// "trocou de level" — que era exatamente o que o jogo ja fazia antes desta animacao existir.
//
// Entao ele cobra as batidas uma por uma:
//   1. SUCCAO  — o portal engole (swallow sobe) e o heroi ENCOLHE ate sumir.
//   2. VAZIO   — o heroi ja nao esta, o portal ainda esta: o gesto tem uma pausa para ser visto.
//   3. TUNEL   — o overlay #portal-tunnel existe, cobre a tela e SOBREVIVE ao restart (e o unico
//                pedaco do jogo que atravessa a troca de cena — se ele morresse junto, a viagem
//                seria um corte para preto).
//   4. QUEDA   — do outro lado o heroi comeca NO AR (lift > 0) e so depois toca o chao.
//
// A autoria e pelo /lab com o EditorStore, como braco/fios/caldeira, e NADA e salvo: o portal so
// existe na memoria desta run. O destino e o proximo level do manifesto de verdade — a travessia
// nao teria o que provar contra um destino de mentira.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * O brilho medio de um frame — medido no PNG que o `shot` acabou de gravar.
 *
 * Tres caminhos mais faceis foram tentados e os tres MENTEM:
 *
 *   1. Ler o knob (`window.hd3d.exposure`) dizia PASS num efeito que nao existia. A succao
 *      derrubava exposure de 2.05 para 0.37 e a tela nao mudava um pixel — o mundo e desenhado
 *      num render target do EffectComposer, e o three so aplica tone mapping quando desenha
 *      direto no canvas. O mesmo alvo-vinculado que o prewarmShaders documenta.
 *   2. `drawImage` do canvas WebGL dentro da pagina devolve preto: sem `preserveDrawingBuffer`
 *      o buffer ja foi descartado quando o teste olha.
 *   3. Um screenshot SEPARADO para medir custa quase um segundo, e um segundo aqui e a batida
 *      inteira: a medicao caia dentro do tunel e lia a tela mais CLARA do que antes.
 *
 * Entao mede-se a propria foto da batida. Uma captura, dois usos, zero deriva no tempo.
 */
const shotLuma = async (file) => {
  const { readPng } = await import('../../spritefactory/lib/png.mjs');
  const { data } = readPng(file);
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return sum / (data.length / 4);
};

/** O overlay do tunel visto do DOM: e um canvas irmao, nao um objeto do jogo. */
const tunnelDom = (page) => page.evaluate(() => {
  const el = document.getElementById('portal-tunnel');
  if (!el) return null;
  return {
    z: Number(getComputedStyle(el).zIndex),
    opacity: Number(getComputedStyle(el).opacity),
    coversScreen: el.clientWidth >= window.innerWidth * 0.98
      && el.clientHeight >= window.innerHeight * 0.98,
  };
});

export default {
  name: 'portal-travessia',
  description: 'Portal: succao do heroi, pausa, tunel que sobrevive ao restart e queda no level novo.',
  needsGame: false, // entra pelo editor; a GameScene nasce no P (mesma razao do braco/fios)
  route: '/lab?level=1',
  async run({ driver, shot, assert, log }) {
    await driver.settle(3000);
    const page = driver.page;

    log('EDITOR: abre um corredor no spawn e planta o Portal de Saida ao lado dele');
    const authored = await page.evaluate(() => {
      const store = window.__scene?.store;
      if (!store) return { error: 'sem store no editor' };
      const start = store.spawn;
      const px = start.worldX + 1;
      const py = start.worldY;
      for (const [x, y] of [[start.worldX, start.worldY], [px, py]]) {
        store.eraseEntitiesAt(x, y);
        store.setCell('upper', x, y, null);
        store.setCell('collision', x, y, false);
      }
      store.placeEntity({ list: 'props', type: 'levelPortal', worldX: px, worldY: py });
      return { start, portal: { worldX: px, worldY: py } };
    });
    assert('o portal foi autorado ao lado do spawn', !authored.error, authored.error ?? '');

    log('LAB: P joga o mundo editado');
    await driver.press('p', { count: 1 });
    await driver.settle(2200);
    await page.waitForFunction(() => window.gameDebug?.getState()?.levelIntroOpen === false,
      null, { timeout: 15000 });
    await driver.settle(200);

    const before = await driver.getState();
    const fromLevel = before.activeLevel;
    assert('o level de origem esta no ar com o portal em repouso',
      before.levelPortals.length === 1 && before.levelPortals[0].swallow === 0,
      JSON.stringify(before.levelPortals));
    assert('nenhum tunel aberto antes da travessia', (await tunnelDom(page)) === null);
    const litLuma = await shotLuma(await shot('travessia-00-antes'));
    assert('o mundo comeca aceso', litLuma > 12, `luma=${litLuma.toFixed(1)}`);

    // ── 1. A SUCCAO ────────────────────────────────────────────────────────
    log('SUCCAO: o passo para dentro do portal engole o heroi');
    // Sem await: o passo dispara a sequencia inteira e ela dura segundos — esperar aqui seria
    // esperar a travessia acabar, e o que este teste quer e olhar o MEIO dela.
    void driver.walk('right', 1);
    await sleep(700);
    const sucking = await driver.getState();
    assert('o portal esta engolindo (swallow subiu) e ativado',
      sucking.levelPortals[0]?.swallow > 0.25 && sucking.levelPortals[0]?.activated === true,
      JSON.stringify(sucking.levelPortals));
    assert('e o heroi ja encolheu bem antes de sumir',
      sucking.heroScale < 0.65 && sucking.heroScale > 0,
      `heroScale=${sucking.heroScale}`);
    assert('o mundo continua no level de origem enquanto a succao roda',
      sucking.activeLevel === fromLevel && sucking.levelTransitioning === true,
      JSON.stringify({ level: sucking.activeLevel, transitioning: sucking.levelTransitioning }));
    await shot('travessia-01-succao');

    // ── 2. O PORTAL SOZINHO ────────────────────────────────────────────────
    log('VAZIO: o heroi ja se foi, o portal ainda gira');
    await sleep(500);
    const empty = await driver.getState();
    assert('o heroi sumiu (encolhido a nada) e o portal engoliu por inteiro',
      empty.heroScale <= 0.02 && empty.levelPortals[0]?.swallow === 1,
      JSON.stringify({ heroScale: empty.heroScale, portal: empty.levelPortals[0] }));
    // O buraco negro come a LUZ, nao so o heroi: e isto que faz o portal ficar SOZINHO na tela
    // em vez de so ficar sem companhia. Medido no frame, nao no knob (ver shotLuma).
    const darkLuma = await shotLuma(await shot('travessia-02-portal-sozinho'));
    assert('a tela escureceu de verdade — o portal comeu a luz do mundo',
      darkLuma < litLuma * 0.45, `de ${litLuma.toFixed(1)} para ${darkLuma.toFixed(1)}`);

    // ── 3. O TUNEL ─────────────────────────────────────────────────────────
    log('TUNEL: o overlay cobre a tela e atravessa o restart da cena');
    await page.waitForFunction(() => Boolean(document.getElementById('portal-tunnel')),
      null, { timeout: 8000 });
    const tunnel = await tunnelDom(page);
    assert('o tunel cobre a tela inteira', tunnel?.coversScreen === true, JSON.stringify(tunnel));
    assert('e fica ACIMA do mundo (0) e do canvas do Phaser (1)',
      tunnel?.z >= 2, JSON.stringify(tunnel));
    await sleep(450);
    await shot('travessia-03-tunel');

    // A prova de que ele sobrevive a troca: o level ja mudou e o overlay ainda esta la.
    await page.waitForFunction((from) => window.gameDebug?.getState()?.activeLevel !== from,
      fromLevel, { timeout: 15000 });
    const duringSwap = await driver.getState();
    assert('o tunel continua de pe DEPOIS do restart que trocou o level',
      duringSwap.portalTunnel === true && (await tunnelDom(page)) !== null,
      JSON.stringify({ level: duringSwap.activeLevel, tunnel: duringSwap.portalTunnel }));
    assert('o level de destino e o proximo do manifesto', duringSwap.activeLevel > fromLevel,
      JSON.stringify({ from: fromLevel, to: duringSwap.activeLevel }));

    // ── 4. A QUEDA ─────────────────────────────────────────────────────────
    log('QUEDA: do outro lado o heroi chega pelo ar');
    const airborne = await page.evaluate(async () => {
      // Espera o heroi estar no ar COM O TUNEL JA FORA: e esse o instante que o jogador ve. Ele
      // e posto la em cima assim que a cena nasce, ainda atras do overlay, entao amostrar so
      // por `heroLift > 0` daria PASS num frame que ninguem enxerga (e a foto sairia do tunel).
      for (let i = 0; i < 200; i += 1) {
        const s = window.gameDebug?.getState();
        if (s && s.heroLift > 0.5 && !s.portalTunnel) return { lift: s.heroLift };
        await new Promise((r) => setTimeout(r, 25));
      }
      return null;
    });
    assert('o heroi aparece no level novo NO AR, com o tunel ja fora da frente',
      airborne !== null && airborne.lift > 0.5, JSON.stringify(airborne));
    await shot('travessia-04-queda');

    log('POUSO: o tunel morre e o heroi encosta no chao');
    await page.waitForFunction(() => {
      const s = window.gameDebug?.getState();
      return s && s.heroLift === 0 && s.portalTunnel === false;
    }, null, { timeout: 15000 });
    const landed = await driver.getState();
    assert('o tunel foi destruido de vez (nenhum canvas orfao no DOM)',
      (await tunnelDom(page)) === null);
    assert('o heroi pousou no ponto inicial do level novo, inteiro e visivel',
      landed.heroLift === 0 && landed.heroScale > 0.9,
      JSON.stringify({ lift: landed.heroLift, scale: landed.heroScale }));
    assert('e o jogo entregou o controle de volta (a transicao acabou)',
      landed.levelTransitioning === false, JSON.stringify(landed.levelTransitioning));
    await shot('travessia-05-pousou');

    log('OK: succao, pausa, tunel atravessando o restart e queda — as quatro batidas.');
  },
};

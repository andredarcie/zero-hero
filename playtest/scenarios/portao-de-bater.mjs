// O PORTAO DE BATER — a porta sem chave, e a unica trava do jogo que nenhum item abre.
//
// Todo o resto que fecha caminho aqui e uma fechadura com exatamente uma chave, e o balao de
// item ainda te mostra qual e. Este nao: ele abre sozinho no esbarrao, mas a folha gira para o
// lado de LA, entao qualquer coisa parada atras dele trava tudo. Nao ha item nenhum a procurar
// — o que destrava e mudar o outro lado. E o outro lado, por construcao, e onde o heroi nao
// pode entrar.
//
// Este cenario monta e resolve o puzzle inteiro que a peca existe para permitir:
//
//        heroi                 | parede |            do outro lado
//   (6,4) entrada do braco  ->  BRACO(7,4) ->  (8,4) onde a tocha cai
//   (6,6) heroi esbarra     ->  PORTAO(7,6)    (8,5) mato   <- pega do graveto aceso
//                                              (8,6) mato   <- e o que trava a folha
//
//   1. O portao RECUSA: o mato de (8,6) esta no caminho da folha. Ele treme e continua fechado.
//   2. O heroi larga o graveto ACESO na entrada do braco — ele nao pode atravessar, o item pode.
//   3. O braco entrega a tocha em (8,4). O fogo anda pelo mato: (8,5), depois (8,6).
//   4. Queimado o mato de (8,6), a folha tem para onde girar. O portao abre.
//
// A ordem das assercoes e o puzzle: provar que ele ABRE sem provar antes que ele RECUSA nao
// prova peca nenhuma — seria uma porta comum.

const GATE = { x: 7, y: 6 };
const ARM = { x: 7, y: 4 };
const DROP = { x: 8, y: 4 }; // saida do braco: onde a tocha pousa acesa
const FUSE = { x: 8, y: 5 }; // o mato do meio, que leva o fogo
const BLOCKER = { x: 8, y: 6 }; // o mato atras do portao — o que trava a folha

export default {
  name: 'portao-de-bater',
  description: 'Portao sem chave: recusa com mato atras, abre depois que o braco leva fogo ate la.',
  needsGame: false, // entra pelo editor; a GameScene nasce no P (mesma razao do braco/fios)
  route: '/lab?level=1',
  async run({ driver, shot, assert, log }) {
    await driver.settle(3000);
    const page = driver.page;

    log('EDITOR: monta a parede, o portao, o braco e o mato do outro lado');
    const authored = await page.evaluate(({ gate, arm, drop, fuse, blocker }) => {
      const store = window.__scene?.store;
      if (!store) return { error: 'sem store no editor' };

      // Limpa a area toda antes: o level 1 e um puzzle cheio, e um prop esquecido no caminho
      // faria o teste medir a mobilia do vizinho.
      for (let x = 4; x <= 10; x += 1) {
        for (let y = 2; y <= 9; y += 1) {
          store.eraseEntitiesAt(x, y);
          store.setCell('upper', x, y, null);
          store.setCell('collision', x, y, false);
        }
      }
      // A PAREDE: a coluna 7 inteira e solida, menos os dois vaos — o portao e o braco. Sem ela
      // o heroi daria a volta e o portao deixaria de ser uma trava para virar decoracao.
      for (let y = 2; y <= 9; y += 1) {
        if (y !== gate.y && y !== arm.y) store.setCell('collision', 7, y, true);
      }
      store.setSpawn(5, 6);
      store.placeEntity({ list: 'props', type: 'swingGate', worldX: gate.x, worldY: gate.y });
      store.placeEntity({ list: 'props', type: 'inserter', worldX: arm.x, worldY: arm.y, dir: 1 });
      store.placeEntity({ list: 'props', type: 'tallGrass', worldX: fuse.x, worldY: fuse.y });
      store.placeEntity({ list: 'props', type: 'tallGrass', worldX: blocker.x, worldY: blocker.y });
      // So o mato DESTE puzzle: o level 1 tem tufos espalhados pelo mapa inteiro, e contar
      // todos mediria o level do vizinho em vez do que este teste acabou de plantar.
      const mine = (x, y) => store.allEntities()
        .some((e) => e.type === 'tallGrass' && e.worldX === x && e.worldY === y);
      return {
        gates: store.allEntities().filter((e) => e.type === 'swingGate').length,
        grass: Number(mine(fuse.x, fuse.y)) + Number(mine(blocker.x, blocker.y)),
        drop,
      };
    }, { gate: GATE, arm: ARM, drop: DROP, fuse: FUSE, blocker: BLOCKER });
    assert('o portao de bater e autoravel pelo editor', authored.gates === 1,
      JSON.stringify(authored));
    assert('e o mato do outro lado esta plantado', authored.grass === 2, JSON.stringify(authored));

    log('LAB: P joga o mundo editado');
    await driver.press('p', { count: 1 });
    await driver.settle(2200);
    await page.waitForFunction(() => window.gameDebug?.getState()?.levelIntroOpen === false,
      null, { timeout: 15000 });
    await driver.settle(200);

    const born = await driver.getState();
    assert('o portao nasce fechado', born.swingGates.length === 1
      && born.swingGates[0].open === false && born.swingGates[0].refusals === 0,
      JSON.stringify(born.swingGates));

    // ── 1. A RECUSA ────────────────────────────────────────────────────────
    log('RECUSA: com o mato atras, o portao treme e nao abre');
    const teleport = (x, y) => page.evaluate(([px, py]) => {
      const s = window.__scene;
      s.playerWorld.worldX = px;
      s.playerWorld.worldY = py;
      s.movementController.interruptMovement(px, py);
    }, [x, y]);

    await teleport(GATE.x - 1, GATE.y);
    await driver.settle(250);
    await driver.press('ArrowRight', { count: 1 });
    await driver.settle(600);
    const refused = await driver.getState();
    assert('o portao TENTOU abrir e nao conseguiu',
      refused.swingGates[0].refusals > 0 && refused.swingGates[0].open === false,
      JSON.stringify(refused.swingGates));
    assert('e o heroi continua do lado de ca — o tile do portao segue bloqueado',
      refused.player.worldX === GATE.x - 1 && refused.player.worldY === GATE.y,
      JSON.stringify(refused.player));
    await shot('portao-recusou-com-mato-atras');

    // ── 2. A TOCHA NO BRACO ────────────────────────────────────────────────
    // O heroi nao pode atravessar; o item pode. E exatamente para isso que o braco existe.
    log('BRACO: o heroi larga o graveto ACESO na entrada do braco');
    await teleport(ARM.x - 2, ARM.y);
    await page.evaluate(() => {
      const s = window.__scene;
      s.heldItem = 'wood';
      s.heldOnFire = true;
      s.torchFuelMs = 20000; // combustivel de sobra: o teste e sobre o portao, nao sobre a tocha
    });
    await driver.settle(200);
    // Pisar na entrada do braco DEPOSITA o que estiver na mao (o jogo e so-andar: nao ha botao
    // de largar, entao a casa do braco recebe carga pelo passo).
    await driver.press('ArrowRight', { count: 1 });
    await driver.settle(900);
    const handedOver = await driver.getState();
    assert('a tocha saiu da mao e ficou na entrada do braco',
      handedOver.heldItem === 'none', JSON.stringify({ held: handedOver.heldItem }));
    await shot('tocha-entregue-ao-braco');

    // ── 3. O FOGO DO OUTRO LADO ────────────────────────────────────────────
    log('FOGO: o braco joga a tocha para o outro lado e o mato pega');
    // O ciclo do braco (~1.5s) + dois saltos de fogo (850ms cada) + a queima do mato (1.7s).
    // O sinal e o proprio mato sumindo, entao espere pelo ESTADO e nao por um relogio.
    const burned = await page.evaluate(async (blocker) => {
      for (let i = 0; i < 240; i += 1) {
        const grass = window.__scene?.tallGrasses ?? [];
        const at = grass.find((g) => g.worldX === blocker.x && g.worldY === blocker.y);
        if (at && !at.blocking) return { blocking: false, elapsed: i * 50 };
        await new Promise((r) => setTimeout(r, 50));
      }
      return null;
    }, BLOCKER);
    assert('o fogo atravessou o mato e liberou o tile atras do portao',
      burned !== null, JSON.stringify(burned));
    log(`  o mato de (${BLOCKER.x},${BLOCKER.y}) queimou em ~${burned?.elapsed}ms`);
    await shot('mato-queimado-do-outro-lado');

    // ── 4. O PORTAO ABRE ───────────────────────────────────────────────────
    log('ABRE: com o caminho da folha livre, o mesmo esbarrao abre o portao');
    await teleport(GATE.x - 1, GATE.y);
    await driver.settle(250);
    await driver.press('ArrowRight', { count: 1 });
    await driver.settle(700);
    const opened = await driver.getState();
    assert('o portao abriu — o MESMO gesto que antes so tremia',
      opened.swingGates[0].open === true, JSON.stringify(opened.swingGates));
    await shot('portao-abriu');

    // E abrir significa PASSAR: um portao que abre e continua bloqueando nao abriu nada.
    await driver.press('ArrowRight', { count: 1 });
    await driver.settle(700);
    const crossed = await driver.getState();
    assert('e o heroi atravessa o vao', crossed.player.worldX >= GATE.x,
      JSON.stringify(crossed.player));
    await shot('portao-atravessado');

    log('OK: recusa com objeto atras, o braco leva o fogo, o fogo abre o caminho da folha.');
  },
};

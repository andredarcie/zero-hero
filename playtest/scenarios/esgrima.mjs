// A ESGRIMA — o que faz um golpe ser fluido, dinamico e divertido.
//
// O `combate` guarda o CONTRATO dos dois botoes (A golpeia sem encostar, B usa ou pousa, a
// mochila guarda, a subtela troca). Este guarda a MAO: o que acontece entre apertar o botao e o
// corpo do outro lado responder. Sao cinco leis, e cada uma existe porque a sua ausencia era um
// defeito que dava pra sentir jogando:
//
//   1. MIRAR NUM MONSTRO E DE GRACA — a primeira seta contra uma criatura so vira o heroi. Antes,
//      apertar a seta contra a caveira ao lado custava um coracao de dano de contato, e mirar era
//      literalmente a jogada mais cara do jogo.
//   2. O GOLPE VARRE A AREA DA FRENTE — o bloco 2x3 (duas fileiras, tres de largura), e o desenho
//      alcanca junto porque o PUNHO orbita mais longe (a arte da espada nunca muda de tamanho). O
//      acerto ja foi um tile so: o jogador via um arco largo e precisava de alinhamento perfeito.
//      De mao vazia, o soco para na primeira fileira.
//   3. O ACERTO COMPRA ESPACO — o corpo atingido e ARREMESSADO um tile, de verdade, quando ha
//      para onde. O recuo era um deslocamento de desenho que voltava sozinho: bater e nao bater
//      davam o mesmo tabuleiro no frame seguinte.
//   4. O ACERTO COMPRA TEMPO — e o corpo fica atordoado, sem andar e sem armar golpe.
//   5. A LAMINA RODOPIANTE — segurar o A carrega, soltar gira e corta os OITO vizinhos. E a unica
//      resposta do jogo a estar cercado; sem carga, nao ha giro.
//
// (O buffer de entrada — um A apertado durante a cadencia nao se perde — nao tem assercao aqui de
// proposito: e uma janela de 130ms medida em frames, e um cenario que a cronometrasse por relogio
// de parede estaria medindo a maquina e nao o jogo.)
//
// Ele monta a propria fixture no /lab: um quintal limpo, sem prop nenhum, para que o unico
// bloqueio de qualquer tile seja o que este cenario colocou ali. E toda caveira e CONGELADA
// (`applyHitstun`) assim que sai do chao: o assunto aqui e o golpe do heroi, e uma caveira com
// vontade propria andando e mordendo no meio de uma medicao e ruido, nao realismo.

const HERO = { x: 6, y: 6 };

export default {
  name: 'esgrima',
  description: 'A mao do combate: mira de graca, a area 2x3 do golpe, arremesso, atordoamento e a lamina rodopiante.',
  needsGame: false, // entra pelo editor; a GameScene nasce no P (mesma razao do combate/braco)
  route: '/lab?level=1',
  async run({ driver, shot, assert, log }) {
    await driver.settle(3000);
    const page = driver.page;

    log('EDITOR: um quintal completamente limpo — so o heroi');
    const authored = await page.evaluate(({ hero }) => {
      const store = window.__scene?.store;
      if (!store) return { error: 'sem store no editor' };
      for (let x = 1; x <= 11; x += 1) {
        for (let y = 1; y <= 11; y += 1) {
          store.eraseEntitiesAt(x, y);
          store.setCell('upper', x, y, null);
          store.setCell('collision', x, y, false);
        }
      }
      store.setSpawn(hero.x, hero.y);
      return { entities: store.allEntities().length };
    }, { hero: HERO });
    assert('o quintal esta vazio', authored.entities === 0, JSON.stringify(authored));

    log('LAB: P joga o mundo editado');
    await driver.press('p', { count: 1 });
    await driver.settle(2200);
    await page.waitForFunction(() => window.gameDebug?.getState()?.levelIntroOpen === false,
      null, { timeout: 15000 });
    await driver.settle(300);

    // ── Utilitarios ─────────────────────────────────────────────────────────

    /** Campo limpo, heroi inteiro, armado, no lugar e olhando para onde o teste precisa. */
    const reset = (facing, armed = true) => page.evaluate(([fx, fy, wantSword, px, py]) => {
      const s = window.__scene;
      s.enemyManager.getAliveEnemies().forEach((e) => e.takeDamage(999));
      s.playerWorld.worldX = px;
      s.playerWorld.worldY = py;
      s.movementController.interruptMovement(px, py);
      s.movementController.lastFacing = { dx: fx, dy: fy };
      s.playerHealth = s.playerMaxHealth;
      s.playerInvincible = false;
      s.invincibleTimer = 0;
      s.creatureTurnGraceUntilMs = 0;
      s.attackCooldownMs = 0;
      if (wantSword) s.inventory.add('sword');
      else s.inventory.remove('sword');
    }, [facing.dx, facing.dy, armed, HERO.x, HERO.y]);

    /**
     * Nascem caveiras nos offsets pedidos, e o teste so segue quando todas estao de pe.
     *
     * `freeze` CONGELA cada uma (`applyHitstun`, o proprio sistema que este cenario guarda) e
     * reafirma o tile dela: uma caveira sai do chao e ja comeca a andar, e entre o instante em
     * que a espera resolve e o instante em que o congelamento chega passa uma ida e volta de
     * CDP — tempo suficiente pra ela dar um passo e a fixture deixar de ser a que foi pedida.
     * Quem MEDE atordoamento pede `freeze: false`, ou estaria medindo o proprio congelamento.
     */
    const spawnReady = async (offsets, freeze = true) => {
      await page.evaluate(([spots, px, py]) => {
        for (const [ox, oy] of spots) window.__scene.enemyManager.spawnUndead(px + ox, py + oy);
      }, [offsets, HERO.x, HERO.y]);
      await page.waitForFunction((want) => {
        const u = window.gameDebug?.getState()?.undead ?? [];
        return u.length === want && u.every((e) => e.spawning === false);
      }, offsets.length, { timeout: 16000 });
      await page.evaluate(([spots, px, py, hold]) => {
        const s = window.__scene;
        const list = s.enemyManager.getAliveEnemies();
        spots.forEach(([ox, oy], i) => {
          const e = list[i];
          if (!e) return;
          if (hold) {
            e.applyHitstun(60000);
            e.worldX = px + ox;
            e.worldY = py + oy;
          }
        });
        // Sair do chao ao lado do heroi pode ter custado um coracao antes do congelamento.
        s.playerHealth = s.playerMaxHealth;
        s.playerInvincible = false;
        s.invincibleTimer = 0;
        s.creatureTurnGraceUntilMs = 0;
      }, [offsets, HERO.x, HERO.y, freeze]);
      await driver.settle(150);
    };

    // ── 1. MIRAR NUM MONSTRO E DE GRACA ─────────────────────────────────────
    // A parede vira o heroi, e e assim que se mira — mas um monstro tambem bloqueia, e apertar a
    // seta contra ele cobrava dano de contato. Com a caveira ao NORTE e o heroi olhando pro SUL,
    // a manobra correta do jogo era se machucar de proposito para poder revidar.
    log('MIRA: virar-se para a caveira nao custa coracao — insistir custa');
    await reset({ dx: 0, dy: 1 });      // olhando para o SUL, de costas
    await spawnReady([[0, -1]]);        // e a caveira ao NORTE
    const beforeAim = await driver.getState();
    await driver.press('ArrowUp', { count: 1 });
    await driver.settle(250);
    const aimed = await driver.getState();
    assert('a seta contra a caveira VIROU o heroi para o norte',
      aimed.facing.dx === 0 && aimed.facing.dy === -1, JSON.stringify(aimed.facing));
    assert('e nao custou um coracao — mirar deixou de ser a jogada mais cara do jogo',
      aimed.health === beforeAim.health, `${beforeAim.health} -> ${aimed.health}`);
    assert('e ele nao entrou no tile dela', aimed.player.worldX === HERO.x
      && aimed.player.worldY === HERO.y, JSON.stringify(aimed.player));
    assert('e a caveira continua viva (virar-se nunca foi um golpe)',
      aimed.undead.length === 1, JSON.stringify(aimed.undead));

    // A outra metade do contrato: passada a carencia, INSISTIR contra o mesmo corpo cobra.
    await driver.settle(400); // deixa a carencia (180ms) expirar
    await driver.press('ArrowUp', { count: 1 });
    await driver.settle(300);
    const insisted = await driver.getState();
    assert('insistir contra a caveira ja encarada cobra o dano de contato',
      insisted.health === beforeAim.health - 1, `${beforeAim.health} -> ${insisted.health}`);
    await shot('mira-de-graca');

    // ── 2. O GOLPE VARRE A AREA DA FRENTE (o bloco 2x3) ─────────────────────
    // O desenho sempre foi uma foice larga; o acerto era um tile, depois virou a fileira da
    // frente, e agora sao DUAS fileiras — a do corpo e a da ponta da lamina. A orbita do punho
    // (SLASH_ORBIT_FACTOR) e o contrato visual disto, e por isso os dois numeros andam juntos.
    log('AREA: o golpe pega o bloco 2x3 a frente — duas fileiras, tres de largura');
    await reset({ dx: 0, dy: -1 }); // olhando para o NORTE, com espada
    const arc = (await driver.getState()).arc;
    assert('o arco declara seis tiles', arc.length === 6, JSON.stringify(arc));
    assert('o primeiro deles e o tile a frente (o alvo canonico)',
      arc[0].x === HERO.x && arc[0].y === HERO.y - 1, JSON.stringify(arc));
    const swept3x2 = arc.map((t) => `${t.x},${t.y}`).sort().join(' ');
    const expected = [-1, 0, 1].flatMap((lat) => [1, 2].map((f) => `${HERO.x + lat},${HERO.y - f}`));
    assert('e as seis casas sao as duas fileiras a frente',
      swept3x2 === expected.sort().join(' '), `${swept3x2} != ${expected.sort().join(' ')}`);

    // O acerto tem de concordar com a lista: uma caveira SO na diagonal morre no golpe...
    await spawnReady([[1, -1]]); // nordeste: nunca esteve no tile a frente
    await driver.attack();
    await driver.settle(700);
    const swept = await driver.getState();
    assert('o golpe alcanca a diagonal da frente — o acerto concorda com a arte',
      swept.undead.length === 0, JSON.stringify(swept.undead));

    // ...e a SEGUNDA fileira tambem: e o alcance novo, o que a orbita da lamina promete.
    await reset({ dx: 0, dy: -1 });
    await spawnReady([[0, -2]]); // dois tiles ao norte, sem nada no meio
    await driver.attack();
    await driver.settle(700);
    const reached = await driver.getState();
    assert('a ponta da lamina alcanca a segunda fileira',
      reached.undead.length === 0, JSON.stringify(reached.undead));

    // Mas so com CAMINHO: de mao vazia o soco para na primeira fileira.
    await reset({ dx: 0, dy: -1 }, false); // sem espada: o punho
    const fistArc = (await driver.getState()).arc;
    assert('o soco declara tres tiles — alcance e da arma, nao do braco',
      fistArc.length === 3, JSON.stringify(fistArc));
    await spawnReady([[0, -2]], false);
    await driver.attack();
    await driver.settle(700);
    const punched = await driver.getState();
    assert('e o soco nao alcanca a segunda fileira',
      punched.undead.length === 1, JSON.stringify(punched.undead));
    await reset({ dx: 0, dy: -1 });

    // ...e o que esta ATRAS continua fora: o arco e frontal, nao um circulo.
    await reset({ dx: 0, dy: -1 });
    await spawnReady([[0, 1]]); // ao SUL, com o heroi olhando ao NORTE
    await driver.attack();
    await driver.settle(700);
    const behind = await driver.getState();
    assert('e quem esta atras do heroi continua intocado — o arco e frontal',
      behind.undead.length === 1, JSON.stringify(behind.undead));
    await shot('area-2x3');

    // ── 3 e 4. O ACERTO COMPRA ESPACO E TEMPO ───────────────────────────────
    // As duas saem do MESMO soco, e e por isso que estao juntas: era exatamente esse par que
    // faltava. O arremesso era um deslocamento de RENDER que voltava sozinho e os relogios do
    // bicho seguiam correndo, entao bater e nao bater davam o mesmo tabuleiro no frame seguinte —
    // e sem tabuleiro nao ha espacamento, que e a unica coisa que um combate de grade ensina.
    //
    // Um SOCO, e nao a espada: a espada mata a caveira de um golpe, e um cadaver nao voa nem se
    // atordoa. E esta caveira nasce SOLTA — medir atordoamento numa criatura congelada pelo
    // proprio cenario seria medir o cenario.
    log('ARREMESSO + ATORDOAMENTO: um soco compra um tile de espaco e um tempo de iniciativa');
    await reset({ dx: 0, dy: -1 }, false); // sem espada na mochila: o punho
    await spawnReady([[0, -1]], false);
    const beforeShove = await driver.getState();
    assert('a caveira esta adjacente ao norte antes do soco',
      beforeShove.undead.length === 1 && beforeShove.undead[0].worldX === HERO.x
      && beforeShove.undead[0].worldY === HERO.y - 1, JSON.stringify(beforeShove.undead));
    // O soco a cru, e nao `driver.attack()`: aquele espera 320ms depois de soltar a tecla, e o
    // atordoamento dura 300 — a leitura tem de cair DENTRO da janela. E o unico ponto deste
    // cenario em que o relogio de parede importa, e por isso o unico com um aperto proprio.
    await page.keyboard.down('z');
    await driver.settle(60);
    await page.keyboard.up('z');
    const struck = await page.evaluate(() => {
      const e = window.__scene.enemyManager.getAliveEnemies()[0];
      return e ? { alive: e.isAlive, stunned: e.isStunned, x: e.worldX, y: e.worldY } : null;
    });
    assert('a caveira sobreviveu ao soco (o punho nao mata de um golpe)',
      struck !== null && struck.alive === true, JSON.stringify(struck));
    assert('ela foi ARREMESSADA um tile para longe do heroi',
      struck !== null && struck.x === HERO.x && struck.y === HERO.y - 2,
      JSON.stringify({ before: beforeShove.undead[0], after: struck }));
    assert('e o golpe a deixou ATORDOADA — o acerto para o relogio dela',
      struck !== null && struck.stunned === true, JSON.stringify(struck));

    // ...e a trava ABRE sozinha: o atordoamento e uma janela de vantagem, nao uma prisao.
    await driver.settle(500); // > HITSTUN_MS (300ms)
    const recovered = await page.evaluate(() => {
      const e = window.__scene.enemyManager.getAliveEnemies()[0];
      return e ? { stunned: e.isStunned } : null;
    });
    assert('e ela volta a si passada a janela (300ms), sem ficar presa',
      recovered !== null && recovered.stunned === false, JSON.stringify(recovered));

    // ── 5. A LAMINA RODOPIANTE ──────────────────────────────────────────────
    // Segurar o A carrega; soltar gira e corta os OITO vizinhos. E a unica resposta do jogo a
    // estar cercado — e o cerco de caveiras e metade da aventura.
    log('GIRO: soltar o A carregado corta os oito vizinhos de uma vez');
    await reset({ dx: 0, dy: 1 }); // olhando para o SUL...
    // ...e as quatro caveiras ao NORTE e a OESTE: nenhuma delas cai dentro do arco de um golpe
    // (que daqui cobre sul, sudoeste e sudeste). Assim o toque curto so pode falhar, e o giro so
    // pode acertar — sem isso as duas metades do teste mediriam a mesma coisa.
    await spawnReady([[0, -1], [1, -1], [-1, -1], [-1, 0]]);
    const surrounded = await driver.getState();
    assert('o heroi esta cercado por quatro caveiras, todas FORA do arco frontal',
      surrounded.undead.length === 4, JSON.stringify(surrounded.undead));
    await shot('cercado-antes-do-giro');

    // Primeiro a prova negativa: um toque CURTO nao carrega, e sem carga nao ha giro.
    await driver.spinAttack(120);
    await driver.settle(400);
    const tapped = await driver.getState();
    assert('um toque curto no A nao gira — a carga e o preco do golpe',
      tapped.undead.length === 4, JSON.stringify(tapped.undead));
    assert('e a lamina nao ficou carregada com 120ms de aperto',
      tapped.spinCharged === false, JSON.stringify({ charged: tapped.spinCharged }));

    await page.evaluate(() => { window.__scene.attackCooldownMs = 0; });
    await driver.spinAttack(700); // 700ms > SPIN_CHARGE_MS (450ms)
    await driver.settle(700);
    const spun = await driver.getState();
    assert('a lamina carregada varre as quatro de uma vez',
      spun.undead.length === 0, JSON.stringify(spun.undead));
    await shot('depois-do-giro');
  },
};

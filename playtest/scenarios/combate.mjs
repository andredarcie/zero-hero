// OS DOIS BOTOES E A MOCHILA — o fim do walk-only.
//
// O jogo era so-andar: bater era andar contra o inimigo, usar item era andar contra a coisa
// certa, e depositar era PISAR num tile. As tres coisas eram o mesmo gesto, e por isso nenhuma
// delas era uma decisao. Agora:
//
//   A (Z)  → A ESPADA, sempre, na direcao em que o heroi olha. NAO precisa encostar, e NAO
//            depende do que esta na bolsa: a espada e do heroi, nao um item da mochila.
//   B (X)  → o item escolhido, no tile a frente. USA — e so isso: largar no chao ACABOU.
//   pisar  → APANHA (a mochila enche andando; o X nunca mais devolve nada ao chao).
//   ESC    → a subtela (a mochila + os coracoes + o mapa), com o jogo congelado.
//
// (Escolher o item do B tem HOJE dois caminhos: esta subtela, que congela tudo, e a BOLSA, que
// nao congela nada — `npm run playtest -- bolsa`. O item 7 abaixo guarda a subtela.)
//
// O que este cenario guarda, na ordem em que uma coisa depende da outra:
//
//   1. PISAR APANHA, e a mochila guarda em vez de trocar (o segundo item nao larga o primeiro);
//   2. a PAREDE VIRA o heroi — sem isso nao ha como mirar num tile bloqueado, e os dois botoes
//      nao teriam alvo;
//   3. o A ALCANCA o tile da frente, sem o heroi encostar (fere: a espada nao mata de um golpe) —
//      e ele saca a ESPADA mesmo com a picareta escolhida na bolsa;
//   4. o ESBARRAO NAO BATE MAIS — e cobra dano de contato de quem esbarrou;
//   5. o B usa o item contra a trava que o pede (a rocha e a picareta);
//   6. o B NAO LARGA NADA: num tile que nao pede o item, o gesto sai no vazio e a mochila fica
//      como estava;
//   7. a subtela desenha a mochila com a arte do jogo e TROCA o item do B por clique.
//
// Ele monta a propria fixture no /lab (a lei da casa: um cenario nunca pode depender do que um
// level autorado por outra pessoa contem hoje).

const HERO = { x: 5, y: 6 };
const ROCK = { x: 7, y: 6 };  // duas picaretadas a leste do heroi

export default {
  name: 'combate',
  description: 'Os dois botoes (A golpeia, B usa/pousa), a mochila e a subtela.',
  needsGame: false, // entra pelo editor; a GameScene nasce no P (mesma razao do braco/fios)
  route: '/lab?level=1',
  async run({ driver, shot, assert, log }) {
    await driver.settle(3000);
    const page = driver.page;

    log('EDITOR: um quintal limpo, o heroi e uma rocha a dois tiles dele');
    const authored = await page.evaluate(({ hero, rock }) => {
      const store = window.__scene?.store;
      if (!store) return { error: 'sem store no editor' };
      // O QUINTAL INTEIRO, borda a borda. Limpar so o miolo (2..11 x 2..10) deixava de pe as
      // rochas autoradas do level-1 nas beiradas — e como as assercoes de rocha leem `rocks[0]`,
      // elas mediam uma pedra do outro lado do mapa que nenhuma picareta tinha tocado.
      for (let x = 0; x < 12; x += 1) {
        for (let y = 0; y < 12; y += 1) {
          store.eraseEntitiesAt(x, y);
          store.setCell('upper', x, y, null);
          store.setCell('collision', x, y, false);
        }
      }
      store.setSpawn(hero.x, hero.y);
      store.placeEntity({ list: 'props', type: 'rock', worldX: rock.x, worldY: rock.y });
      return { rocks: store.allEntities().filter((e) => e.type === 'rock').length };
    }, { hero: HERO, rock: ROCK });
    assert('a fixture tem a rocha', authored.rocks === 1, JSON.stringify(authored));

    log('LAB: P joga o mundo editado');
    await driver.press('p', { count: 1 });
    await driver.settle(2200);
    await page.waitForFunction(() => window.gameDebug?.getState()?.levelIntroOpen === false,
      null, { timeout: 15000 });
    await driver.settle(300);

    const teleport = (x, y) => page.evaluate(([px, py]) => {
      const s = window.__scene;
      s.playerWorld.worldX = px;
      s.playerWorld.worldY = py;
      s.movementController.interruptMovement(px, py);
    }, [x, y]);

    // ── 1. PISAR APANHA, E A MOCHILA GUARDA ─────────────────────────────────
    // Duas leis numa passada so. A primeira: apanhar deixou de ser um botao — o heroi anda por
    // cima e a coisa sobe (sem o gesto de largar, apanhar nao pode custar nada). A segunda: a
    // mochila GUARDA em vez de trocar, entao o segundo item nao derruba o primeiro.
    log('PISADA: dois itens no chao, e o heroi fica com os dois so de passar por cima');
    await page.evaluate(([px, py]) => {
      const s = window.__scene;
      s.itemManager.drop('pickaxe', px + 1, py, undefined, undefined);
      s.itemManager.drop('wood', px - 1, py, undefined, undefined);
    }, [HERO.x, HERO.y]);
    await driver.settle(300);
    // A CERIMONIA DE ITEM NOVO (o "ITEM GET") abre ao pisar num tipo inedito e prende os pes ate
    // fechar — entao o cenario espera por ela ENTRE os passos. Sem isto, o segundo item nunca e
    // alcancado: as setas viram "pular a cerimonia" em vez de andar.
    const settled = async () => {
      await page.waitForFunction(() => window.gameDebug?.getState()?.itemGetOpen === false,
        null, { timeout: 8000 });
      await driver.settle(250);
    };
    await driver.walk('right', 1);
    await driver.settle(500);
    await settled();
    await driver.walk('left', 1);
    await driver.settle(500);
    await driver.walk('left', 1);
    await driver.settle(600);
    await settled();
    const packed = await driver.getState();
    const kinds = packed.inventory.map((i) => i.kind).sort();
    assert('pisar nos dois os apanha, e o segundo NAO larga o primeiro',
      kinds.join(',') === 'pickaxe,wood', JSON.stringify(packed.inventory));
    assert('e nada ficou no chao onde eles estavam',
      packed.groundItems.filter((g) => g.worldY === HERO.y).length === 0,
      JSON.stringify(packed.groundItems));

    // ── 2. A PAREDE VIRA O HEROI ────────────────────────────────────────────
    // Precondicao dos dois botoes: eles agem no tile A FRENTE, e num tile bloqueado o heroi
    // nunca chega a andar. Se a parede nao virasse, encarar a rocha seria impossivel e o B
    // miraria eternamente no vazio pelas costas dela.
    log('MIRA: apertar a seta contra a rocha VIRA o heroi sem faze-lo andar');
    await teleport(ROCK.x - 1, ROCK.y);
    await driver.settle(250);
    await page.evaluate(() => {
      // olhando para BAIXO de proposito: a virada tem de ser observavel
      window.__scene.movementController.setFacing?.(0, 1, false);
      window.__scene.movementController.lastFacing = { dx: 0, dy: 1 };
    });
    await driver.press('ArrowRight', { count: 1 });
    await driver.settle(400);
    const facing = await page.evaluate(() => ({
      ...window.__scene.movementController.facing,
      x: window.__scene.playerWorld.worldX,
      y: window.__scene.playerWorld.worldY,
    }));
    assert('a seta contra a trava vira o heroi para leste',
      facing.dx === 1 && facing.dy === 0, JSON.stringify(facing));
    assert('e ele NAO entrou no tile da rocha',
      facing.x === ROCK.x - 1 && facing.y === ROCK.y, JSON.stringify(facing));

    // ── 3. O BOTAO A GOLPEIA A DISTANCIA ────────────────────────────────────
    log('A: a espada alcanca a caveira do tile a frente, sem encostar nela');
    await page.evaluate(([x, y]) => {
      const s = window.__scene;
      // A PICARETA na bolsa DE PROPOSITO: a espada deixou de ser item, entao o Z tem de cortar
      // com qualquer coisa selecionada. Era exatamente isto que faltava — defender-se passava por
      // abrir a bolsa e equipar a espada, com a caveira ja em cima.
      s.heldItem = 'pickaxe';
      s.enemyManager.spawnUndead(x, y);
    }, [ROCK.x - 1, ROCK.y - 1]); // um tile ao NORTE do heroi
    // a caveira nasce invulneravel (a animacao de sair do chao); espere ela ficar de pe
    await page.waitForFunction(() => {
      const u = window.gameDebug?.getState()?.undead ?? [];
      return u.length > 0 && u.every((e) => e.spawning === false);
    }, null, { timeout: 8000 });
    await driver.press('ArrowUp', { count: 1 }); // a caveira bloqueia: isto so VIRA o heroi
    await driver.settle(300);
    const before = await driver.getState();
    // A CERIMONIA DE ITEM NOVO agora dispara ANDANDO (pisar apanha), e enquanto ela esta aberta
    // `canAct()` recusa os dois botoes — um golpe apertado por cima dela seria descartado em
    // silencio. Esperar por ela e o preco de o cenario apanhar coisas de passagem.
    await page.waitForFunction(() => window.gameDebug?.getState()?.itemGetOpen === false,
      null, { timeout: 8000 });
    assert('a caveira esta viva e adjacente antes do golpe',
      before.undead.length === 1, JSON.stringify(before.undead));
    assert('e o esbarrao NAO a matou — encostar deixou de bater',
      before.undead[0].spawning === false, JSON.stringify(before.undead));
    // O GOLPE INSISTE ATE PASSAR, e a razao e uma lei do jogo: a caveira adjacente ARMA um golpe
    // e GUARDA o lado de onde ele vem enquanto arma (`guardsAgainst`) — toda espadada frontal
    // dentro dessa janela e recusada, de propósito. Uma tentativa unica media o telegrafo dela,
    // nao o alcance do botao: passava ou falhava conforme o milissegundo em que o cenario chegou.
    // O que este passo guarda e "o Z alcanca o tile da frente sem encostar", entao ele bate ate a
    // guarda abrir — e mede a espadada que PASSOU.
    let landed = null;
    for (let attempt = 0; attempt < 6 && !landed; attempt += 1) {
      const pre = (await driver.getState()).undead[0];
      // Vida cheia a cada volta: a caveira revida enquanto o heroi insiste, e um heroi morto
      // reiniciaria a cena no meio do cenario.
      await page.evaluate(() => { window.__scene.playerHealth = window.__scene.playerMaxHealth; });
      await driver.attack();
      await driver.settle(500);
      const post = (await driver.getState()).undead[0];
      if (pre && post && post.health < pre.health) landed = { pre: pre.health, post: post.health };
    }
    const struck = await driver.getState();
    // FERE, nao mata: a espada deixou de valer 999 de dano (ver MELEE_DAMAGE.sword). O que este
    // cenario guarda e o CONTRATO DO BOTAO — o A alcanca o tile da frente sem encostar —, e isso
    // se prova no dano; contar cadaveres media a tabela de dano de tabela.
    assert('o botao A fere a caveira do tile a frente, sem o heroi encostar nela',
      landed !== null, JSON.stringify({ landed, undead: struck.undead }));
    // O DANO E O DA ESPADA (MELEE_DAMAGE.sword = 2), e nao o da picareta selecionada (1.5): e a
    // prova de que o Z saca a arma do heroi, e nao o que a bolsa escolheu.
    assert('e o golpe foi da ESPADA, com a picareta na bolsa',
      landed !== null && landed.pre - landed.post === 2,
      JSON.stringify({ held: struck.heldItem, landed }));
    assert('e o heroi nunca saiu do lugar', struck.player.worldX === ROCK.x - 1
      && struck.player.worldY === ROCK.y, JSON.stringify(struck.player));
    await shot('a-golpeia-a-distancia');

    // ── 4. O ESBARRAO COBRA, NAO BATE ───────────────────────────────────────
    // A metade que falta do item 3: se andar contra o bicho ainda machucasse ELE, o botao A nao
    // significaria nada. Agora quem paga o esbarrao e o heroi.
    log('ESBARRAO: andar contra a caveira custa vida ao HEROI');
    await page.evaluate(([x, y]) => {
      // O campo limpo ANTES de plantar a nova: a caveira do passo anterior pode ter sobrevivido
      // (o golpe FERE, nao mata), e duas no mesmo tile fariam esta secao contar corpos em vez de
      // medir o esbarrao.
      window.__scene.enemyManager.getAliveEnemies().forEach((e) => {
        e.tickHurtInvuln(9999);
        e.takeDamage(999);
      });
      window.__scene.enemyManager.spawnUndead(x, y);
    }, [ROCK.x - 1, ROCK.y - 1]);
    await page.waitForFunction(() => {
      const u = window.gameDebug?.getState()?.undead ?? [];
      return u.length > 0 && u.every((e) => e.spawning === false);
    }, null, { timeout: 8000 });
    // A vida cheia e os i-frames zerados JUNTO do esbarrao: o golpe anterior deixou o heroi
    // piscando, e uma janela de invencibilidade aberta faria o dano de contato parecer ausente.
    const healthBefore = await page.evaluate(() => {
      const s = window.__scene;
      s.playerInvincible = false;
      s.invincibleTimer = 0;
      s.playerHealth = s.playerMaxHealth;
      return s.playerHealth;
    });
    await driver.press('ArrowUp', { count: 1 });
    await driver.settle(500);
    const bumped = await driver.getState();
    assert('a caveira continua viva depois do esbarrao (o bump nao bate mais)',
      bumped.undead.length === 1, JSON.stringify(bumped.undead));
    assert('e o heroi levou o dano de contato',
      bumped.health === healthBefore - 1, `${healthBefore} -> ${bumped.health}`);
    await page.evaluate(() => {
      // limpa o campo: o resto do cenario e sobre itens, e uma caveira viva atras vira ruido
      window.__scene.enemyManager.getAliveEnemies().forEach((e) => {
        e.tickHurtInvuln(9999); // gasta a janela de i-frames: matar de proposito nao pode resvalar
        e.takeDamage(999);
      });
      window.__scene.playerHealth = window.__scene.playerMaxHealth;
    });
    await driver.settle(400);

    // ── 5. O BOTAO B USA O ITEM NA TRAVA ────────────────────────────────────
    log('B: a picareta abre a rocha — duas golpadas, e nenhuma delas e um esbarrao');
    await page.evaluate(() => { window.__scene.heldItem = 'pickaxe'; });
    await driver.settle(200);
    const rockState = () => page.evaluate(() => {
      const r = window.__scene.rocks?.[0];
      return { texture: r?.sprite?.texKey ?? null, blocking: r?.blocking ?? null };
    });
    const intact = await rockState();
    // primeiro: o ESBARRAO sozinho nao arranha a rocha, mesmo com a picareta na mao
    await driver.press('ArrowRight', { count: 1 });
    await driver.settle(500);
    const afterBump = await rockState();
    assert('esbarrar com a picareta na mao NAO quebra a rocha',
      afterBump.texture === intact.texture && afterBump.blocking === true,
      JSON.stringify({ intact, afterBump }));
    await driver.useItem();
    await driver.settle(800);
    const cracked = await rockState();
    assert('a primeira golpada do B racha a rocha',
      cracked.texture !== intact.texture, `${intact.texture} -> ${cracked.texture}`);
    assert('e a rocha rachada AINDA bloqueia', cracked.blocking === true, JSON.stringify(cracked));
    await driver.useItem();
    await driver.settle(800);
    const broken = await rockState();
    assert('a segunda golpada do B abre o tile', broken.blocking === false, JSON.stringify(broken));
    await shot('b-quebra-a-rocha');

    // ── 6. O B NAO LARGA NADA ───────────────────────────────────────────────
    // A metade que MORREU do botao. Ele pousava o item num tile que nao pedisse nada, e isso era
    // meio gesto: um botao que ora usa, ora larga desarma o jogador por engano. Hoje o X e uma
    // frase so — usar —, e num tile sem resposta o gesto sai no VAZIO e a mochila fica igual.
    log('B: num tile que nao pede nada, o item CONTINUA na mochila');
    await teleport(HERO.x, HERO.y);
    await driver.settle(300);
    await page.evaluate(() => { window.__scene.heldItem = 'wood'; });
    await driver.walk('down', 1); // anda um tile para o sul: agora ele OLHA para o sul
    await driver.settle(400);
    const standing = await driver.getState();
    await driver.useItem();
    await driver.settle(500);
    const swung = await driver.getState();
    // O TILE DA FRENTE, e nao o mundo inteiro: o level-1 nasce com itens autorados no chao (uma
    // picareta, um machado), e "nenhum graveto em lugar nenhum" mediria o cenario, nao o botao.
    const front = { x: standing.player.worldX, y: standing.player.worldY + 1 };
    assert('o X num tile vazio NAO pousa o graveto',
      !swung.groundItems.some((g) => g.worldX === front.x && g.worldY === front.y),
      JSON.stringify({ front, ground: swung.groundItems }));
    assert('e o graveto continua na mochila',
      swung.inventory.some((i) => i.kind === 'wood'), JSON.stringify(swung.inventory));
    assert('e o heroi nao saiu do lugar (o gesto e no tile a frente)',
      swung.player.worldX === standing.player.worldX
      && swung.player.worldY === standing.player.worldY, JSON.stringify(swung.player));

    // E a volta do gesto que sobrou: o chao devolve pela PISADA. Um item posto no mundo por uma
    // maquina (a bancada atira a peca no chao) tem de subir sem botao nenhum. Um SEGUNDO graveto
    // de proposito — um tipo ja visto nao dispara a cerimonia de item novo, que roubaria o
    // teclado das proximas teclas do cenario.
    const woodBefore = swung.inventory.find((i) => i.kind === 'wood')?.count ?? 0;
    await page.evaluate(([px, py]) => {
      window.__scene.itemManager.drop('wood', px, py + 1);
    }, [standing.player.worldX, standing.player.worldY]);
    await driver.settle(300);
    await driver.walk('down', 1);
    await driver.settle(700);
    const stepped = await driver.getState();
    assert('pisar no item o recolhe — e sem trocar o item da mao',
      (stepped.inventory.find((i) => i.kind === 'wood')?.count ?? 0) === woodBefore + 1
      && stepped.heldItem === 'wood',
      JSON.stringify({ inv: stepped.inventory, held: stepped.heldItem, woodBefore }));

    // ── 7. A SUBTELA ────────────────────────────────────────────────────────
    // Ela nao e HUD: so existe enquanto foi pedida. E e ela quem escolhe o item do B — sem isso
    // a mochila seria um deposito sem porta.
    // O ESC NAO SERVE AQUI, e a razao e a fixture: este cenario roda DENTRO do /lab (ele autora o
    // proprio quintal e aperta P), e no lab o ESC volta para o EDITOR — a cena de jogo morre junto,
    // que era exatamente o "Cannot read properties of null" com que este arquivo terminava. Quem
    // abre a pausa em modo level e o botao flutuante (LevelButtons), que e o gesto de verdade num
    // telefone.
    log('SUBTELA: o botao de pausa abre a mochila, e clicar num slot troca o item do X');
    await page.evaluate(() => {
      const s = window.__scene;
      s.heldItem = 'pickaxe';
      s.heldItem = 'wood';
      s.playerHealth = Math.max(1, s.playerMaxHealth - 1);
    });
    await driver.settle(200);
    // ABRIR PELA CENA, e nao pela tecla: dentro do /lab o ESC pertence ao editor (ele VOLTA para
    // a edicao e mata a cena de jogo — era o "Cannot read properties of null" com que este arquivo
    // terminava), e o botao flutuante de pausa so existe quando ha um level ATIVO de verdade
    // (`getActiveLevel()`), que um mundo tocado da memoria do lab nao tem. O caminho de codigo
    // exercitado e exatamente o mesmo que a tecla e o botao chamam.
    await page.evaluate(() => window.__scene.openPauseMenu());
    await driver.settle(600);
    const panel = await page.evaluate(() => {
      const slots = [...document.querySelectorAll('.zh-sub-slot')];
      return {
        open: document.querySelector('.zh-sub') !== null,
        hearts: document.querySelectorAll('.zh-sub-heart').length,
        slots: slots.length,
        // todo icone e a arte DO JOGO desenhada num canvas — nunca um desenho proprio da UI
        icons: slots.every((el) => (el.querySelector('img')?.src ?? '').startsWith('data:image/png')),
        selected: slots.findIndex((el) => el.classList.contains('zh-on')),
      };
    });
    assert('a pausa abre a subtela com os coracoes desenhados',
      panel.open && panel.hearts > 0, JSON.stringify(panel));
    assert('a mochila mostra os itens com a arte do jogo',
      panel.slots >= 2 && panel.icons, JSON.stringify(panel));
    await shot('subtela-mochila');

    const swapped = await page.evaluate(() => {
      const slots = [...document.querySelectorAll('.zh-sub-slot')];
      const other = slots.find((el) => !el.classList.contains('zh-on'));
      other?.click();
      return {
        selectedTitle: document.querySelector('.zh-sub-slot.zh-on')?.title ?? null,
        held: window.__scene.heldItem,
      };
    });
    assert('clicar num slot troca o item do X',
      swapped.held === 'pickaxe', JSON.stringify(swapped));
    // Fechar pelo botao "continuar" do proprio menu (o primeiro da lista) — este e DOM de
    // verdade, entao continua sendo um clique.
    await page.click('.zh-pause-btn');
    await driver.settle(500);
    const resumed = await driver.getState();
    assert('e o jogo volta com o item escolhido na mao',
      resumed.heldItem === 'pickaxe', JSON.stringify({ held: resumed.heldItem }));
  },
};

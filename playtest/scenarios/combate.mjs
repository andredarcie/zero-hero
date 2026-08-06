// OS DOIS BOTOES E A MOCHILA — o fim do walk-only.
//
// O jogo era so-andar: bater era andar contra o inimigo, usar item era andar contra a coisa
// certa, e depositar era PISAR num tile. As tres coisas eram o mesmo gesto, e por isso nenhuma
// delas era uma decisao. Agora:
//
//   A (Z)  → a espada, na direcao em que o heroi olha. NAO precisa encostar.
//   B (X)  → o item escolhido, no tile a frente: usa se o tile pedir, pousa ali se nao pedir.
//   ESC    → a subtela (a mochila + os coracoes + o mapa), com o jogo congelado.
//
// (Escolher o item do B tem HOJE dois caminhos: esta subtela, que congela tudo, e a BOLSA, que
// nao congela nada — `npm run playtest -- bolsa`. O item 7 abaixo guarda a subtela.)
//
// O que este cenario guarda, na ordem em que uma coisa depende da outra:
//
//   1. a MOCHILA guarda em vez de trocar (pegar um item nao larga o anterior);
//   2. a PAREDE VIRA o heroi — sem isso nao ha como mirar num tile bloqueado, e os dois botoes
//      nao teriam alvo;
//   3. o A ALCANCA o tile da frente, sem o heroi encostar (fere: a espada nao mata de um golpe);
//   4. o ESBARRAO NAO BATE MAIS — e cobra dano de contato de quem esbarrou;
//   5. o B usa o item contra a trava que o pede (a rocha e a picareta);
//   6. o B POUSA o item num tile livre, e o heroi o pega de volta andando por cima;
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
      for (let x = 2; x <= 11; x += 1) {
        for (let y = 2; y <= 10; y += 1) {
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

    // ── 1. A MOCHILA GUARDA, NAO TROCA ──────────────────────────────────────
    // A lei "uma mao so" era a razao de o jogo poder ser so-andar: sem botao, a unica forma de
    // pousar algo era TROCAR por outra coisa no chao. Com dois botoes ela cai — e a prova e que
    // pegar o segundo item nao larga o primeiro.
    log('MOCHILA: dois itens no chao, e o heroi fica com os dois');
    await page.evaluate(([px, py]) => {
      const s = window.__scene;
      s.itemManager.drop('pickaxe', px + 1, py, undefined, undefined);
      s.itemManager.drop('wood', px - 1, py, undefined, undefined);
    }, [HERO.x, HERO.y]);
    await driver.settle(300);
    await driver.walk('right', 1);
    await driver.settle(500);
    await driver.walk('left', 2);
    await driver.settle(700);
    const packed = await driver.getState();
    const kinds = packed.inventory.map((i) => i.kind).sort();
    assert('pegar o segundo item NAO larga o primeiro — os dois estao na mochila',
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
      s.heldItem = 'sword';
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
    assert('a caveira esta viva e adjacente antes do golpe',
      before.undead.length === 1, JSON.stringify(before.undead));
    assert('e o esbarrao NAO a matou — encostar deixou de bater',
      before.undead[0].spawning === false, JSON.stringify(before.undead));
    await driver.attack();
    await driver.settle(600);
    const struck = await driver.getState();
    // FERE, nao mata: a espada deixou de valer 999 de dano (ver MELEE_DAMAGE.sword). O que este
    // cenario guarda e o CONTRATO DO BOTAO — o A alcanca o tile da frente sem encostar —, e isso
    // se prova no dano; contar cadaveres media a tabela de dano de tabela.
    assert('o botao A fere a caveira do tile a frente, sem o heroi encostar nela',
      struck.undead.length === 1 && struck.undead[0].health < struck.undead[0].maxHealth,
      JSON.stringify(struck.undead));
    assert('e o heroi nunca saiu do lugar', struck.player.worldX === ROCK.x - 1
      && struck.player.worldY === ROCK.y, JSON.stringify(struck.player));
    await shot('a-golpeia-a-distancia');

    // ── 4. O ESBARRAO COBRA, NAO BATE ───────────────────────────────────────
    // A metade que falta do item 3: se andar contra o bicho ainda machucasse ELE, o botao A nao
    // significaria nada. Agora quem paga o esbarrao e o heroi.
    log('ESBARRAO: andar contra a caveira custa vida ao HEROI');
    await page.evaluate(([x, y]) => {
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

    // ── 6. O B POUSA O ITEM, E O MESMO B PEGA DE VOLTA ──────────────────────
    // O gesto que substituiu o deposito-por-pisada. Ele tem de ser REVERSIVEL — e a volta e o
    // MESMO botao: nada mais entra na mochila por pisada, entao o heroi pousa o graveto a frente
    // e o recolhe sem sair do lugar, porque o B pega do tile que ele esta encarando.
    log('B: num tile que nao pede nada, o item simplesmente fica no chao');
    await teleport(HERO.x, HERO.y);
    await driver.settle(300);
    await page.evaluate(() => { window.__scene.heldItem = 'wood'; });
    await driver.walk('down', 1); // anda um tile para o sul: agora ele OLHA para o sul
    await driver.settle(400);
    const standing = await driver.getState();
    await driver.useItem();
    await driver.settle(500);
    const dropped = await driver.getState();
    const ahead = dropped.groundItems.find((g) => g.kind === 'wood');
    assert('o graveto pousou no tile a frente',
      ahead !== undefined && ahead.worldX === standing.player.worldX
      && ahead.worldY === standing.player.worldY + 1,
      JSON.stringify({ standing: standing.player, ahead }));
    assert('e saiu da mochila', dropped.inventory.every((i) => i.kind !== 'wood'),
      JSON.stringify(dropped.inventory));
    // Andar por cima NAO devolve nada — esta e a metade nova do contrato.
    await driver.walk('down', 1);
    await driver.settle(700);
    const steppedOn = await driver.getState();
    assert('pisar em cima do item NAO o recolhe — o heroi nunca pega nada sozinho',
      steppedOn.inventory.every((i) => i.kind !== 'wood'), JSON.stringify(steppedOn.inventory));
    assert('e o graveto continua no chao', steppedOn.groundItems.some((g) => g.kind === 'wood'),
      JSON.stringify(steppedOn.groundItems));

    await driver.pickUp();
    await driver.settle(600);
    const retaken = await driver.getState();
    assert('o B recolhe o item de baixo dos pes — pousar nunca perde nada',
      retaken.inventory.some((i) => i.kind === 'wood'), JSON.stringify(retaken.inventory));

    // ── 7. A SUBTELA ────────────────────────────────────────────────────────
    // Ela nao e HUD: so existe enquanto foi pedida. E e ela quem escolhe o item do B — sem isso
    // a mochila seria um deposito sem porta.
    log('SUBTELA: ESC abre a mochila, e clicar num slot troca o item do B');
    await page.evaluate(() => {
      const s = window.__scene;
      s.heldItem = 'pickaxe';
      s.heldItem = 'wood';
      s.playerHealth = Math.max(1, s.playerMaxHealth - 1);
    });
    await driver.settle(200);
    await driver.press('Escape', { count: 1 });
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
    assert('o ESC abre a subtela com os coracoes desenhados',
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
    assert('clicar num slot troca o item do B',
      swapped.held === 'pickaxe', JSON.stringify(swapped));
    await driver.press('Escape', { count: 1 });
    await driver.settle(500);
    const resumed = await driver.getState();
    assert('e o jogo volta com o item escolhido na mao',
      resumed.heldItem === 'pickaxe', JSON.stringify({ held: resumed.heldItem }));
  },
};

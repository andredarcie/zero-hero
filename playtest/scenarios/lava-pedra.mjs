// LAVA SEM ATALHO — o herói não vadeia; uma pedra fabrica o único chão portátil.

export default {
  name: 'lava-pedra',
  description: 'Lava bloqueia o herói; jogar uma pedra cria basalto permanente e permite cruzar.',
  needsGame: true,
  route: '/?play&level=1',
  async run({ driver, shot, assert, log }) {
    await driver.settle(1400);
    const evaluate = (fn, arg) => driver.page.evaluate(fn, arg);

    const authored = await evaluate(async () => {
      const world = await (await fetch(new URL('/world.json', document.baseURI))).json();
      const card = world.chunks.find((chunk) => chunk.catalog?.id === 'glowing-ford');
      const props = card ? world.props.filter((prop) => (
        Math.floor(prop.worldX / 12) === card.cx && Math.floor(prop.worldY / 12) === card.cy
      )) : [];
      return {
        pickups: card?.pickups?.map((pickup) => pickup.type) ?? [],
        description: card?.catalog?.description ?? '',
        lava: props.filter((prop) => prop.type === 'lava').length,
        dialog: world.dialogs?.radiationSuit?.lines?.map((line) => line.text).join(' ') ?? '',
        retiredInWorld: JSON.stringify(world).includes('lavaBoots'),
      };
    });
    assert('Workman\'s Ford trocou a bota por uma pedra diante da lava',
      authored.pickups.includes('stone') && authored.lava > 0 && authored.retiredInWorld === false,
      JSON.stringify(authored));
    assert('a carta e o diálogo ensinam basalto permanente',
      authored.description.toLowerCase().includes('permanent')
        && authored.dialog.toLowerCase().includes('basalt'), JSON.stringify(authored));

    const setup = await evaluate(() => {
      const s = window.__scene;
      const dirs = [
        { dx: -1, dy: 0, face: 'right' },
        { dx: 1, dy: 0, face: 'left' },
        { dx: 0, dy: -1, face: 'down' },
        { dx: 0, dy: 1, face: 'up' },
      ];
      for (const lava of s.lavaTiles ?? []) {
        if (!lava.blocking) continue;
        for (const dir of dirs) {
          const x = lava.worldX + dir.dx;
          const y = lava.worldY + dir.dy;
          if (s.isSolidForEntities(x, y) || s.itemManager?.hasItemAt(x, y)) continue;
          s.inventory.clear();
          s.playerWorld.worldX = x;
          s.playerWorld.worldY = y;
          s.movementController.interruptMovement(x, y);
          return { lavaX: lava.worldX, lavaY: lava.worldY, heroX: x, heroY: y, face: dir.face };
        }
      }
      return null;
    });

    assert('o level oferece lava bloqueante com margem acessível', setup !== null, JSON.stringify(setup));
    if (!setup) return;

    log('SEM PEDRA: a lava continua sendo parede para o herói');
    await driver.press({ up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }[setup.face], {
      count: 2,
      delay: 260,
    });
    await driver.settle(400);
    const blocked = await evaluate(([lavaX, lavaY]) => {
      const s = window.__scene;
      const lava = s.lavaTiles.find((tile) => tile.worldX === lavaX && tile.worldY === lavaY);
      return {
        player: { x: s.playerWorld.worldX, y: s.playerWorld.worldY },
        lavaBlocking: lava?.blocking ?? null,
        inventory: s.inventory.list(),
      };
    }, [setup.lavaX, setup.lavaY]);
    assert('sem item o herói não entra na lava',
      blocked.player.x === setup.heroX && blocked.player.y === setup.heroY && blocked.lavaBlocking === true,
      JSON.stringify(blocked));
    await shot('lava-bloqueia', { note: 'A lava viva barra o herói; não existe equipamento para vadeá-la.' });

    log('PEDRA: o X joga a pedra, espera o assentamento e deixa um degrau permanente');
    await evaluate(() => { window.__scene.heldItem = 'stone'; });
    await driver.faceAndUse(setup.face);
    await driver.settle(2300);

    const basalt = await evaluate(([lavaX, lavaY]) => {
      const s = window.__scene;
      const lava = s.lavaTiles.find((tile) => tile.worldX === lavaX && tile.worldY === lavaY);
      return {
        solidified: lava?.solidified ?? null,
        blocking: s.isSolidForEntities(lavaX, lavaY),
        selected: s.heldItem,
        inventory: s.inventory.list(),
        text: window.render_game_to_text?.() ?? '',
      };
    }, [setup.lavaX, setup.lavaY]);
    assert('a pedra virou basalto e abriu exatamente aquele tile',
      basalt.solidified === true && basalt.blocking === false, JSON.stringify(basalt));
    assert('a pedra foi consumida', !basalt.inventory.some((item) => item.kind === 'stone'),
      JSON.stringify(basalt.inventory));
    assert('o estado textual não expõe o item aposentado', !basalt.text.includes('lavaBoots'));
    await shot('lava-basalto', { note: 'A coroa de basalto assentada é o novo chão sobre a lava.' });

    await driver.walk(setup.face, 1);
    await driver.settle(600);
    const crossed = await driver.getState();
    assert('o herói atravessa pelo basalto sem equipamento especial',
      crossed.player.worldX === setup.lavaX && crossed.player.worldY === setup.lavaY,
      JSON.stringify(crossed.player));
    await shot('lava-atravessada', { note: 'O herói ocupa o degrau; a travessia agora pertence ao chão.' });
  },
};

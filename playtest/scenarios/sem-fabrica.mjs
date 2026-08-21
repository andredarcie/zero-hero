// Contrato de remoção: conteúdo antigo não pode reativar automação ou venda por dados autorados.

const RETIRED_PROPS = [
  'sellBox', 'waterWheel', 'wire', 'belt', 'electronicGate', 'pressurePlate',
  'woodenCrate', 'chest', 'boiler', 'inserter', 'extractor', 'tripHammer',
];
const RETIRED_ITEMS = [
  'battery', 'batteryFull', 'gear', 'wire', 'belt', 'chest', 'boiler',
  'inserter', 'extractor', 'tripHammer',
];
const RETIRED_DEBUG = [
  'sellBoxes', 'sellOverlayOpen', 'crates', 'pressurePlates', 'waterWheels', 'wires',
  'boilers', 'inserters', 'electronicGates', 'belts', 'chests', 'extractors', 'tripHammers',
  'globalVariables',
];

export default {
  name: 'sem-fabrica',
  description: 'Automação, energia e caixa de correio não existem no runtime nem no conteúdo ativo.',
  needsGame: true,
  async run({ driver, shot, assert, log }) {
    await driver.settle(900);
    const audit = await driver.page.evaluate(async ({ retiredProps, retiredItems, retiredDebug }) => {
      const world = await (await fetch('/world.json', { cache: 'no-store' })).json();
      const index = await (await fetch('/levels/index.json', { cache: 'no-store' })).json();
      const levels = await Promise.all(index
        .filter((entry) => /^level-\d+\.json$/u.test(entry.file))
        .map(async (entry) => ({
          file: entry.file,
          data: await (await fetch(`/levels/${entry.file}`, { cache: 'no-store' })).json(),
        })));
      const content = [world, ...levels.map((entry) => entry.data)];
      const badProps = [];
      const badItems = [];
      const inspect = (data, label) => {
        for (const prop of data.props ?? []) {
          if (retiredProps.includes(prop.type)) badProps.push(`${label}:${prop.type}`);
        }
        for (const chunk of data.chunks ?? []) {
          for (const pickup of chunk.pickups ?? []) {
            if (retiredItems.includes(pickup.type)) badItems.push(`${label}:${pickup.type}`);
          }
        }
      };
      inspect(world, 'world');
      levels.forEach((entry) => inspect(entry.data, entry.file));
      const state = window.gameDebug.getState();
      return {
        badProps,
        badItems,
        retiredCards: world.chunks
          .filter((chunk) => ['cat-weight', 'cat-current'].includes(chunk.catalog?.id))
          .map((chunk) => chunk.catalog.id),
        retiredLevels: index
          .filter((entry) => ['level-1.json', 'level-3.json', 'level-11.json', 'level-15.json'].includes(entry.file))
          .map((entry) => entry.file),
        retiredDebug: retiredDebug.filter((field) => Object.hasOwn(state, field)),
        manualStations: {
          furnace: world.props.filter((prop) => prop.type === 'furnace').length,
          altar: world.props.filter((prop) => prop.type === 'altar').length,
        },
        state,
        contentCount: content.length,
      };
    }, { retiredProps: RETIRED_PROPS, retiredItems: RETIRED_ITEMS, retiredDebug: RETIRED_DEBUG });

    assert('Nenhum prop industrial ou caixa de correio existe no conteúdo ativo',
      audit.badProps.length === 0, JSON.stringify(audit.badProps));
    assert('Nenhum item industrial existe nos pickups ativos',
      audit.badItems.length === 0, JSON.stringify(audit.badItems));
    assert('As duas cartas industriais do gato foram retiradas',
      audit.retiredCards.length === 0, JSON.stringify(audit.retiredCards));
    assert('Os níveis dependentes da fábrica saíram do manifesto',
      audit.retiredLevels.length === 0, JSON.stringify(audit.retiredLevels));
    assert('render_game_to_text não publica mais estado industrial',
      audit.retiredDebug.length === 0, JSON.stringify(audit.retiredDebug));
    assert('Fornalha e altar manuais continuam disponíveis',
      audit.manualStations.furnace > 0 && audit.manualStations.altar > 0,
      JSON.stringify(audit.manualStations));

    const manual = await driver.page.evaluate(() => {
      const s = window.__scene;
      const freeRow = (startY) => {
        for (let dy = 0; dy < 10; dy += 1) {
          const y = startY + dy;
          for (let dx = -4; dx <= 4; dx += 1) {
            const x = s.playerWorld.worldX + dx;
            if ([x - 2, x - 1, x, x + 1].every((tx) => !s.isTileOccupied(tx, y))) return { x, y };
          }
        }
        return null;
      };
      const searchY = s.playerWorld.worldY - 4;
      const furnaceAt = freeRow(searchY);
      if (!furnaceAt) return { error: 'sem fileira livre para o forno da fixture' };
      s.spawnStreamedProps([{ type: 'furnace', worldX: furnaceAt.x, worldY: furnaceAt.y, dir: 1 }]);
      const benchAt = freeRow(searchY);
      if (!benchAt) return { error: 'sem fileira livre para a bancada da fixture' };
      s.spawnStreamedProps([{ type: 'toolbox', worldX: benchAt.x, worldY: benchAt.y, dir: 1 }]);
      const furnace = s.furnaces.find((f) => f.worldX === furnaceAt.x && f.worldY === furnaceAt.y);
      const bench = s.toolboxes.find((b) => b.worldX === benchAt.x && b.worldY === benchAt.y);
      if (!furnace || !bench) return { error: 'estacoes da fixture nao nasceram' };

      // Os quatro itens ocupam as antigas posicoes de entrada. Cinco segundos nao podem iniciar
      // nada: o chao deixou de ser uma interface de fabricacao.
      s.itemManager.drop('ore', furnaceAt.x - 1, furnaceAt.y);
      s.itemManager.drop('charcoal', furnaceAt.x - 2, furnaceAt.y);
      s.itemManager.drop('wood', benchAt.x - 1, benchAt.y);
      s.itemManager.drop('stone', benchAt.x - 2, benchAt.y);
      window.advanceTime(5000);
      const at = (kind, x, y) => s.itemManager.snapshot()
        .some((item) => item.kind === kind && item.worldX === x && item.worldY === y);
      const floorUntouched = at('ore', furnaceAt.x - 1, furnaceAt.y)
        && at('charcoal', furnaceAt.x - 2, furnaceAt.y)
        && at('wood', benchAt.x - 1, benchAt.y)
        && at('stone', benchAt.x - 2, benchAt.y);
      const autoIdle = !furnace.isBusy && !bench.isBusy;

      s.inventory.clear();
      s.inventory.add('wood', 1);
      s.inventory.add('stone', 1);
      s.seenItems.add('axe');
      const axesBefore = s.itemManager.snapshot().filter((item) => item.kind === 'axe').length;
      const benchStarted = s.craftAtStation(bench, 'bench', 'axe');
      const axesAfter = s.itemManager.snapshot().filter((item) => item.kind === 'axe').length;
      const benchManual = benchStarted && s.inventory.count('wood') === 0
        && s.inventory.count('stone') === 0 && axesAfter === axesBefore + 1;

      s.inventory.clear();
      s.inventory.add('wood', 2);
      s.seenItems.add('charcoal');
      const charcoalBefore = s.itemManager.snapshot().filter((item) => item.kind === 'charcoal').length;
      const furnaceStarted = s.craftAtStation(furnace, 'furnace', 'charcoal');
      const busyAfterConfirm = furnace.isBusy;
      window.advanceTime(2500);
      const charcoalAfter = s.itemManager.snapshot().filter((item) => item.kind === 'charcoal').length;
      const furnaceManual = furnaceStarted && busyAfterConfirm && s.inventory.count('wood') === 0
        && charcoalAfter === charcoalBefore + 1;
      return {
        floorUntouched, autoIdle, benchManual, furnaceManual,
        furnaceAt, benchAt,
      };
    });

    assert('Itens largados nas antigas entradas não alimentam bancada nem forno',
      manual.floorUntouched === true && manual.autoIdle === true, JSON.stringify(manual));
    assert('A bancada ainda fabrica manualmente pelo catálogo e pela mochila',
      manual.benchManual === true, JSON.stringify(manual));
    assert('O forno ainda executa a fornada manual confirmada no catálogo',
      manual.furnaceManual === true, JSON.stringify(manual));

    log(`AUDITADO: mundo + ${audit.contentCount - 1} levels, sem automação e sem venda aérea`);
    await shot('sem-fabrica', {
      note: 'O jogo ativo sem componentes industriais; fornalha e altar manuais preservados.',
      state: {
        manualStations: audit.manualStations,
        manualRegression: manual,
        retiredDebug: audit.retiredDebug,
        player: audit.state.player,
      },
    });
  },
};

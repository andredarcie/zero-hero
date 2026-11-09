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
      // Os levels isolados sairam do jogo: sem o indice (o servidor devolve a pagina do jogo), nao ha level a auditar.
      const indexRes = await fetch('/levels/index.json', { cache: 'no-store' });
      const index = (indexRes.headers.get('content-type') ?? '').includes('json') ? await indexRes.json() : [];
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

    // (A segunda metade — bancada e forno montados na hora, fabricando com a mochila — saiu: a mochila acabou e o
    // jogo não monta mais estação fora do mapa. O que sobra é o contrato de remoção, que é o nome do cenário.)
    log(`AUDITADO: mundo + ${audit.contentCount - 1} levels, sem automação e sem venda aérea`);
    await shot('sem-fabrica', {
      note: 'O jogo ativo sem componentes industriais; fornalha e altar manuais preservados.',
      state: {
        manualStations: audit.manualStations,
        retiredDebug: audit.retiredDebug,
        player: audit.state.player,
      },
    });
  },
};

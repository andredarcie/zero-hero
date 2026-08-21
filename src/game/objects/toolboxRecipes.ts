import type { HeldItemKind } from '@/game/entities/ItemPickup';

/** Livro de receitas das duas estacoes manuais: bancada e forno. */

export type ToolboxFamily = 'tool' | 'machine' | 'material';

/**
 * ONDE a receita se faz. Duas maquinas leem o mesmo livro e a mesma tela, e a estacao e o que
 * separa os catalogos: a bancada monta, o FORNO reduz oxido. Elas nao sao intercambiaveis nem por
 * acidente — `craftAt` confere a estacao antes de gastar material, senao um dia uma carta aparece
 * no painel errado e a mesa passa a fundir minerio.
 */
export type CraftStation = 'bench' | 'furnace';

export type ToolboxRecipe = {
  inputs: readonly [HeldItemKind, HeldItemKind];
  output: HeldItemKind;
  /** Quantos itens saem. Ausente = 1. */
  units?: number;
  /**
   * A FAMILIA agrupa ferramentas, estações manuais e materiais na interface.
   */
  family: ToolboxFamily;
  /** A maquina que sabe fazer isto. Ausente = a BANCADA, que e a dona da esmagadora maioria. */
  station?: CraftStation;
};

export const TOOLBOX_RECIPES: readonly ToolboxRecipe[] = [
  // A REGRA: cabo + cabeca. Uma cabeca de cada material da uma ferramenta, e o jogador aprende
  // isso com UM exemplo — o que e a unica forma de haver receita num jogo sem livro de receitas.
  //
  // Note a consequencia dessa regra: `graveto + X` so pode significar UMA coisa, entao o numero
  // de ferramentas fabricaveis e o numero de MATERIAIS, nunca o numero de ideias. Duas hoje.
  //
  // Um cabo e uma cabeca de pedra. E a receita mais velha que existe, e e a que ensina a peca:
  // os dois insumos ja sao produtos de OUTRAS ferramentas (a arvore da o graveto, a picareta da
  // a pedra), entao a caixa fecha a cadeia em vez de comecar uma nova.
  { inputs: ['wood', 'stone'], output: 'axe', family: 'tool' },
  // Cabo e lamina de ferro. A FOICE, e nao a picareta, por um motivo que so aparece quando se
  // desenha a cadeia inteira: o ferro sai de uma pedra de minerio, e pedra se quebra com
  // picareta. Uma receita que fabricasse a picareta exigiria a picareta pra chegar nos insumos —
  // circular, e portanto inutil em qualquer level que nao dependesse da bomba pra abrir a
  // primeira rocha. A foice nao tem esse problema: picareta -> ferro -> foice e uma escada que
  // sempre sobe. E a foice PRODUZ (sementes), que e o que se pede de qualquer coisa nova aqui.
  { inputs: ['wood', 'iron'], output: 'scythe', family: 'tool' },

  // ── A CADEIA DO FERRO, e as duas pecas que ela pede ────────────────────────────────────────
  //
  // O FORNO: pedra com pedra. Nao e por economia — e cronologia. O forno FAZ o primeiro ferro, e
  // qualquer receita que pedisse metal seria circular: precisaria de ferro para construir a coisa
  // que produz ferro. Duas pedras e o que o jogador tem antes de ter qualquer outra coisa, e por
  // isso o forno e a primeira estacao construivel da cadeia manual.
  { inputs: ['stone', 'stone'], output: 'furnace', family: 'machine' },
  // O ALTAR: pedra e MINERIO — a laje bruta e o veio de ferro dentro dela.
  //
  // Ele custou uma ESPONJA por um dia, e a receita era bonita no papel (para construir o lugar onde
  // se malha, e preciso ter malhado uma vez sem ele) e CIRCULAR na mao: o altar e onde a esponja
  // vira barra, entao cobrar uma esponja por ele e a mesma armadilha que esta tabela recusa na
  // picareta ("uma receita que fabricasse a picareta exigiria a picareta pra chegar nos insumos").
  // Pior ainda depois que a laje virou o LUGAR do gesto: uma barra custa 9 moedas, e a primeira
  // esponja do jogador ia inteira para a mesa em vez de para a bolsa dele.
  //
  // Pedra e minerio saem os dois da mesma picareta, no primeiro minuto da cratera, e os dois sao
  // renovaveis (o veio nunca acaba). O altar passou a ser o que ele precisa ser: o SEGUNDO degrau,
  // logo depois do forno, comprado com o que o jogador ja tem na mao quando o forno acende.
  //
  { inputs: ['stone', 'ore'], output: 'altar', family: 'machine' },
  // ── O FORNO, e ele e a UNICA receita de outra estacao ──────────────────────────────────────
  //
  // Minerio + CARVAO = esponja de ferro. O carvao aqui nao e combustivel: e o REAGENTE que rouba o
  // oxigenio do oxido (Fe2O3 + 3CO -> 2Fe + 3CO2), e e por isso que ele entra na receita como
  // materia e nao como fogo. Um bloomery e movido a fole.
  //
  // A familia e `material` porque o que sai nao e ferramenta nem maquina — e um INSUMO, e ainda
  // por cima um insumo imprestavel: a esponja so vira ferro depois de tres marteladas. Chamar isso
  // de "maquina" no cabecalho do catalogo ensinaria a coisa errada sobre a cadeia.
  { inputs: ['ore', 'charcoal'], output: 'bloom', family: 'material', station: 'furnace' },
  // ── A CARVOARIA, e ela existe porque a cadeia do ferro tinha um FUNDO ────────────────────────
  //
  // O carvao so nascia de um jeito: queimar um arbusto seco, e com 25% de chance (o sorteio caiu
  // depois desta receita — hoje todo arbusto paga). Arbusto nao rebrota. Ou seja, todo mapa tinha um numero FINITO de
  // barras de ferro dentro dele — quatro arbustos davam, em media, um carvao —, e a cadeia
  // manual morria depois da primeira fornada. Isso
  // nao aparecia enquanto o dinheiro comecava em 100 e as cartas eram baratas; virou o teto da
  // economia no minuto em que a bolsa passou a comecar em zero.
  //
  // Madeira e madeira, no FORNO. Uma carvoaria e exatamente isto: lenha cozida sem oxigenio ate
  // sobrar so o carbono — a mesma quimica de sempre, e a mesma maquina. O que ela devolve ao jogo
  // e a RENOVABILIDADE: a arvore seca rebrota (TREE_REGROW_MS), entao lenha nunca acaba, e o
  // gargalo do ferro volta a ser o TEMPO do jogador em vez do estoque do mapa.
  //
  // Duas madeiras e nao uma: um carvao tem de custar mais que um graveto, senao a bancada acharia
  // que madeira e carvao sao a mesma coisa com nomes diferentes.
  { inputs: ['wood', 'wood'], output: 'charcoal', family: 'material', station: 'furnace' },
];

/** A receita que produz este item. */
export const recipeMaking = (kind: HeldItemKind): ToolboxRecipe | null =>
  TOOLBOX_RECIPES.find((r) => r.output === kind) ?? null;

/**
 * Este item se FABRICA numa maquina? (O minerio e a pedra nao — eles vem do mundo.)
 *
 * A pergunta e sobre o jogo inteiro, e nao sobre uma estacao: a esponja nao sai da bancada, mas
 * dizer dela "procure no mundo" seria mentir com o desenho que importa — o jogador tem de saber
 * que aquilo se PRODUZ. Onde, ele descobre no forno; o catalogo so promete que existe um caminho.
 */
export const isCraftable = (kind: HeldItemKind): boolean => recipeMaking(kind) !== null;

/** Quantas unidades de cada insumo uma receita pede (o `iron+iron` pede DUAS de ferro). */
export const recipeCost = (recipe: ToolboxRecipe): Map<HeldItemKind, number> => {
  const cost = new Map<HeldItemKind, number>();
  for (const input of recipe.inputs) cost.set(input, (cost.get(input) ?? 0) + 1);
  return cost;
};

/**
 * A ordem em que o catalogo apresenta o livro: ferramentas primeiro (a familia que o jogador
 * encontra antes), maquinas depois, cada uma na ordem em que foi escrita acima — que e a ordem de
 * custo crescente dentro da familia.
 */
export const FAMILY_ORDER: readonly ToolboxFamily[] = ['tool', 'machine', 'material'];

/** A estacao de uma receita, com o padrao resolvido — um lugar so faz essa pergunta. */
export const recipeStation = (recipe: ToolboxRecipe): CraftStation => recipe.station ?? 'bench';

export const catalogOrder = (station: CraftStation = 'bench'): readonly ToolboxRecipe[] => {
  const mine = TOOLBOX_RECIPES.filter((r) => recipeStation(r) === station);
  return FAMILY_ORDER.flatMap((family) => mine.filter((r) => r.family === family));
};

/**
 * A ESCADA — a ordem em que as receitas se abrem para o jogador, um degrau de cada vez.
 *
 * O catálogo mostrava TUDO desde o primeiro segundo: onze cartas na bancada, com a promessa de que
 * "a lista é a lista de ambições". A intenção era boa e o efeito, medido no relato de quem jogou,
 * foi o oposto — onze coisas ao mesmo tempo não é ambição, é uma parede. O jogador não precisa
 * conhecer tudo antes de fazer o primeiro ferro; ele precisa saber QUAL É O PRÓXIMO PASSO.
 *
 * Então a mesa passou a mostrar o mínimo: **tudo que ele já fez, mais UMA coisa nova**. A carta
 * nova é sempre a próxima da escada, e ela só aparece quando a anterior saiu — de modo que abrir a
 * bancada nunca custa uma leitura de catálogo, e sim uma olhada.
 *
 * A ordem segue o caminho manual: forno, altar, machado e foice.
 */
const LADDER: Record<CraftStation, readonly HeldItemKind[]> = {
  bench: [
    // FORNO e depois ALTAR, nesta ordem e coladinhos: sao as duas metades de UM processo. O forno
    // devolve uma esponja encharcada de escoria, e a esponja so vira barra apanhando — o altar e o
    // lugar disso. Quem acabou de acender o primeiro forno tem exatamente o que a laje pede (uma
    // pedra e um minerio, os dois da mesma picareta), entao o segundo degrau da escada e sempre
    // pagavel no minuto em que aparece.
    'furnace', 'altar', 'axe', 'scythe',
  ],
  // O forno tem dois degraus, e a ordem é a da própria química: primeiro se faz o carvão (que só
  // pede lenha), e é com ele que o minério vira esponja.
  furnace: ['charcoal', 'bloom'],
};

/**
 * O que a mesa MOSTRA agora: os degraus já cumpridos, mais o primeiro que falta.
 *
 * "Cumprido" é o produto já ter passado pelas mãos do jogador (`seen`) — e não um contador de
 * fabricações — porque a pergunta que interessa é "isto ainda é novidade?". Assim uma peça achada
 * no mundo (o machado que o astronauta deixa no chão) também abre o degrau seguinte: descobrir a
 * coisa pelo mundo e descobrir pela bancada ensinam a mesma lição.
 *
 * Receita fora da escada (uma nova que ninguém encaixou ainda) entra no fim, sempre visível: é
 * melhor uma carta a mais do que uma receita que o jogo tem e nunca mostra.
 */
export const catalogSteps = (
  station: CraftStation,
  seen: ReadonlySet<HeldItemKind>,
): readonly ToolboxRecipe[] => {
  const mine = catalogOrder(station);
  const rungs = LADDER[station] ?? [];
  const byKind = new Map(mine.map((recipe) => [recipe.output, recipe]));
  const out: ToolboxRecipe[] = [];
  for (const kind of rungs) {
    const recipe = byKind.get(kind);
    if (!recipe) continue;
    byKind.delete(kind);
    out.push(recipe);
    // O primeiro degrau que o jogador ainda não conhece é o ÚLTIMO que ele vê: é o próximo passo,
    // e mostrar dois passos à frente devolveria a parede em miniatura.
    if (!seen.has(kind)) return [...out, ...[...byKind.values()].filter((r) => !rungs.includes(r.output))];
  }
  return [...out, ...byKind.values()];
};

/** O degrau que a mesa está oferecendo agora (a carta nova), ou null se a escada acabou. */
export const nextStep = (
  station: CraftStation,
  seen: ReadonlySet<HeldItemKind>,
): HeldItemKind | null => (LADDER[station] ?? []).find((kind) => !seen.has(kind)) ?? null;

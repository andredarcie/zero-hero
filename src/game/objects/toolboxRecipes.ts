import type { HeldItemKind } from '@/game/entities/ItemPickup';

/**
 * O LIVRO DE RECEITAS, e a ENCOMENDA — o que a caixa sabe fazer, e o plano que o jogador prega
 * nela. Tudo aqui e funcao pura: nao ha Phaser, nao ha three, nao ha cena. Foi separado do
 * `ToolboxObject` porque agora tem TRES leitores (a maquina, o catalogo do overlay e a pagina de
 * planos da subtela), e uma tabela com tres leitores dentro do arquivo de um deles vira uma
 * dependencia circular no dia em que o segundo precisar dela.
 *
 * ── Por que a encomenda existe ────────────────────────────────────────────────────────────────
 * A caixa nasceu EXPERIMENTO-PRIMEIRO: junte dois itens e veja o que sai. E o modelo do Minecraft
 * de 2009, e ele so funcionou la porque havia um milhao de jogadores contando um ao outro pela
 * internet. Aqui nao ha esse boca-a-boca — entao a mesma caixa era um cadeado com combinacao
 * secreta, e a recusa fisica (a tampa pulando) respondia "agora nao" a uma pergunta que o jogador
 * nem sabia formular.
 *
 * O conserto e o que todo jogo de crafting legivel faz, do Recipe Book do Minecraft 1.12 ao menu
 * do Stardew: inverter a direcao. O jogador escolhe O QUE QUER (o catalogo mostra tudo, sempre —
 * o catalogo E a lista de ambicoes), e o jogo responde DO QUE ELE PRECISA. A diferenca deste jogo
 * e onde a resposta aparece: nao numa legenda, mas no chao — o fantasma de cada insumo que falta,
 * desenhado na bandeja em que ele tem de ser posto.
 *
 * ── A encomenda DESCE ─────────────────────────────────────────────────────────────────────────
 * O extrator custa duas engrenagens, e a engrenagem custa dois ferros. Pedir "extrator" sem ter
 * engrenagem nenhuma deveria ensinar a arvore, e nao recusar. Entao o plano DESCE ate o degrau
 * que da pra fazer agora (`resolveOrderStep`) e SOBE de volta a medida que o jogador entrega —
 * o chain-craft do Factorio ("laranja = voce nao tem, mas sabe fazer") contado com fisica em vez
 * de cor de texto. O jogador aprende a arvore ANDANDO nela.
 */

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
  /** Quantos saem. Ausente = 1. So o cabo passa disso (cinco) — ver a receita dele. */
  units?: number;
  /**
   * A FAMILIA, e ela nao e enfeite de catalogo: e a segunda regra do livro (cabo+cabeca faz
   * FERRAMENTA, engrenagem+corpo faz MAQUINA) escrita onde a UI possa le-la. Sem ela o catalogo
   * seria uma lista alfabetica de dez coisas, e a simetria que torna as duas regras aprendiveis
   * juntas — a unica coisa que faz este livro caber na cabeca — nao apareceria em lugar nenhum.
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

  // ── A SEGUNDA REGRA: engrenagem + corpo = MAQUINA ─────────────────────────────────────────
  //
  // A primeira regra (cabo + cabeca) tem um teto que o proprio comentario acima ja declarava: o
  // numero de ferramentas fabricaveis e o numero de MATERIAIS. Uma fabrica nao cabe embaixo
  // desse teto — ela precisa de uma ESCADA, e escada quer dizer um bem que nao e materia-prima
  // nem produto final. Por isso a engrenagem, e por isso ela e a unica receita do jogo cujos
  // dois insumos sao a MESMA coisa: duas peças iguais entrando e uma peça diferente saindo e o
  // anuncio, sem uma linha de texto, de que aqui comeca outra familia.
  //
  // A simetria com a primeira regra e o que torna as duas aprendiveis juntas: ferramenta e
  // `graveto + X`, maquina e `engrenagem + X`. O X continua sendo o material, e continua
  // decidindo O QUE sai — entao quem entendeu o machado entende o extrator.
  { inputs: ['iron', 'iron'], output: 'gear', family: 'machine' },

  // O CABO, e a unica receita que sai em PACOTE: CINCO — o mesmo punhado com que ele nasce no
  // chao (ver spawnPackSize). As duas contagens tem de ser a mesma, ou o jogador aprende duas
  // coisas sobre um objeto so. Nao e generosidade: uma rede se DESENHA, tile a tile, e uma peca
  // que se deita as duzias a uma bancada por unidade viraria uma tarefa em vez de um projeto.
  // Ferro e pedra porque o cabo e nucleo de metal em bainha mineral — e porque os dois sao as
  // duas materias-primas infinitas do jogo (o veio nunca acaba, a rocha sempre volta), entao a
  // rede nunca pode ficar sem material e travar o modo.
  { inputs: ['iron', 'stone'], output: 'wire', units: 5, family: 'machine' },

  // A ESTEIRA: engrenagem + madeira. A madeira e a correia, e a esteira e a peca mais barata da
  // familia de proposito — ela e o que o jogador precisa MUITO, e uma linha longa nao pode
  // custar o mesmo que a maquina que a alimenta.
  { inputs: ['gear', 'wood'], output: 'belt', family: 'machine' },
  // A CALDEIRA: engrenagem + pedra, que e a fornalha. A caldeira ja existia como prop autorado;
  // o que muda e que agora o jogador pode POR uma onde a rede dele ficou curta — que e a unica
  // resposta possivel a um gargalo, e a razao de a rede ter passado a ter vazao.
  { inputs: ['gear', 'stone'], output: 'boiler', family: 'machine' },
  // O BRACO: engrenagem + ferro, que e a garra. O ferro (o material mais caro) no membro que
  // MOVE carga entre duas maquinas — a junta que a esteira nao faz.
  { inputs: ['gear', 'iron'], output: 'inserter', family: 'machine' },
  // O EXTRATOR: duas engrenagens. E a maquina mais cara do jogo e a unica que produz materia do
  // nada (do veio, que e infinito), entao ela tem de custar o dobro da mais barata da familia —
  // senao a primeira coisa que qualquer jogador faz e nunca mais tocar numa picareta.
  { inputs: ['gear', 'gear'], output: 'extractor', family: 'machine' },

  // O BAU: madeira e madeira. A unica peca da fabrica que NAO leva engrenagem, porque e a unica
  // que nao consome energia — e a regra tem de valer nos dois sentidos pra ensinar alguma coisa.
  // Duas madeiras tambem e o que a torna a primeira coisa que um jogador consegue construir: o
  // machado e a arvore chegam muito antes do veio de ferro.
  { inputs: ['wood', 'wood'], output: 'chest', family: 'machine' },

  // ── A CADEIA DO FERRO, e as duas pecas que ela pede ────────────────────────────────────────
  //
  // O FORNO: pedra com pedra, e e a UNICA receita da familia que nao leva engrenagem nem ferro.
  // Nao e por economia — e cronologia. O forno e a maquina que FAZ o primeiro ferro do jogo, e
  // qualquer receita que pedisse metal seria circular: precisaria de ferro para construir a coisa
  // que produz ferro. Duas pedras e o que o jogador tem antes de ter qualquer outra coisa, e por
  // isso o forno e a primeira maquina construivel de toda a fabrica.
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
  // Sem engrenagem e sem energia, como o bau: as duas pecas que nao sao maquina nenhuma, e a regra
  // "engrenagem + corpo = maquina" tem de valer nos dois sentidos para ensinar alguma coisa.
  { inputs: ['stone', 'ore'], output: 'altar', family: 'machine' },
  // O MARTINETE: engrenagem e ESPONJA. A cabeca de um malho e um tarugo de ferro bruto — nao se
  // gasta uma barra refinada num peso que so serve para bater. E a receita tem uma consequencia
  // de desenho deliciosa: para construir a maquina que martela, o jogador precisa martelar a mao
  // pelo menos uma vez. Ele so pode automatizar um trabalho que ja fez.
  { inputs: ['gear', 'bloom'], output: 'tripHammer', family: 'machine' },
  // ── O FORNO, e ele e a UNICA receita de outra estacao ──────────────────────────────────────
  //
  // Minerio + CARVAO = esponja de ferro. O carvao aqui nao e combustivel: e o REAGENTE que rouba o
  // oxigenio do oxido (Fe2O3 + 3CO -> 2Fe + 3CO2), e e por isso que ele entra na receita como
  // materia e nao como fogo. Um bloomery e movido a fole, o que faz deste o unico maquinario do
  // jogo que nao consome watt nenhum.
  //
  // A familia e `material` porque o que sai nao e ferramenta nem maquina — e um INSUMO, e ainda
  // por cima um insumo imprestavel: a esponja so vira ferro depois de tres marteladas. Chamar isso
  // de "maquina" no cabecalho do catalogo ensinaria a coisa errada sobre a cadeia.
  { inputs: ['ore', 'charcoal'], output: 'bloom', family: 'material', station: 'furnace' },
  // ── A CARVOARIA, e ela existe porque a cadeia do ferro tinha um FUNDO ────────────────────────
  //
  // O carvao so nascia de um jeito: queimar um arbusto seco, e com 25% de chance (o sorteio caiu
  // depois desta receita — hoje todo arbusto paga). Arbusto nao rebrota. Ou seja, todo mapa tinha um numero FINITO de
  // barras de ferro dentro dele — quatro arbustos davam, em media, um carvao —, e a fabrica
  // inteira (que existe para produzir sem parar) morria de fome depois da primeira fornada. Isso
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

/** A receita inteira (o pacote do cabo precisa da contagem, nao so do tipo), em qualquer ordem. */
export const toolboxRecipeFor = (
  a: HeldItemKind | null,
  b: HeldItemKind | null,
): ToolboxRecipe | null => {
  if (!a || !b) return null;
  return TOOLBOX_RECIPES.find(
    (r) => (r.inputs[0] === a && r.inputs[1] === b) || (r.inputs[0] === b && r.inputs[1] === a),
  ) ?? null;
};

/** O que estes dois itens viram juntos, em qualquer ordem — ou null se nao viram nada. */
export const toolboxResult = (a: HeldItemKind | null, b: HeldItemKind | null): HeldItemKind | null =>
  toolboxRecipeFor(a, b)?.output ?? null;

/** A receita que PRODUZ este item (a busca ao contrario — a que a encomenda faz). */
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
 * O DEGRAU: o que a encomenda manda fabricar AGORA.
 *
 * `make === goal` e o caso feliz — os dois insumos existem e a bancada vai produzir a peca pedida.
 * Quando falta um insumo que a PROPRIA bancada sabe fazer, o plano DESCE (extrator -> engrenagem),
 * e `goal` guarda a ambicao enquanto `make` guarda o passo. Quando nao ha nem descida possivel (o
 * que falta e ferro, e ferro vem do veio), o degrau para no proprio alvo e os fantasmas mostram a
 * materia-prima — que continua sendo a resposta certa a "do que eu preciso".
 *
 * `owned` conta o que o heroi pode ENTREGAR: a mochila mais o que ja esta nas bandejas desta
 * bancada. Nao conta o chao do mundo inteiro de proposito — um graveto a vinte tiles de distancia
 * nao e um insumo que voce tem, e um plano que nunca desce porque existe um ferro perdido no mapa
 * seria pior do que nenhum plano.
 */
export type OrderStep = {
  /** A ambicao pregada pelo jogador. */
  goal: HeldItemKind;
  /** O que a bancada vai fabricar neste degrau (== goal quando da pra fazer direto). */
  make: HeldItemKind;
  recipe: ToolboxRecipe;
  /** Os dois insumos do degrau, na ordem da receita. */
  needs: readonly [HeldItemKind, HeldItemKind];
  /** O plano teve de descer? (E o que faz a bancada desenhar a ambicao POR CIMA do corpo.) */
  descended: boolean;
};

const MAX_DESCENT = 4; // a arvore de hoje tem 2 degraus; o teto e so a rede contra receita circular

export const resolveOrderStep = (
  goal: HeldItemKind,
  owned: (kind: HeldItemKind) => number,
): OrderStep | null => {
  const walk = (target: HeldItemKind, depth: number, seen: ReadonlySet<HeldItemKind>): OrderStep | null => {
    const recipe = recipeMaking(target);
    if (!recipe) return null;
    const step: OrderStep = {
      goal, make: target, recipe, needs: recipe.inputs, descended: target !== goal,
    };
    if (depth >= MAX_DESCENT) return step;
    const cost = recipeCost(recipe);
    // O primeiro insumo em falta que a bancada sabe fazer manda o plano descer. "Primeiro" na
    // ordem da receita, e nao "o mais barato": a ordem da receita e a que o jogador ve desenhada
    // nas bandejas, e um plano que descesse por outro criterio pularia justamente o fantasma que
    // ele estava olhando.
    for (const [kind, need] of cost) {
      if (owned(kind) >= need) continue;
      if (!isCraftable(kind) || seen.has(kind)) continue;
      const deeper = walk(kind, depth + 1, new Set([...seen, kind]));
      if (deeper) return deeper;
    }
    return step;
  };
  return walk(goal, 0, new Set([goal]));
};

/**
 * O QUE DESENHAR EM CADA BANDEJA — a encomenda virando fisica.
 *
 * Casa os insumos do degrau com o que JA esta nas bandejas e devolve, para cada uma, o fantasma
 * do que ainda falta (ou null: a bandeja ja esta servida, ou tem outra coisa em cima). A ordem
 * importa exatamente uma vez: um insumo que ja esta numa bandeja sai da conta, entao pousar o
 * graveto na bandeja "errada" nunca faz a caixa pedir um segundo graveto — a ordem das bandejas
 * nunca importou para a receita e nao pode passar a importar para o desenho dela.
 */
export const planGhosts = (
  needs: readonly [HeldItemKind, HeldItemKind],
  trays: readonly [HeldItemKind | null, HeldItemKind | null],
): [HeldItemKind | null, HeldItemKind | null] => {
  const remaining = [...needs] as HeldItemKind[];
  for (const tray of trays) {
    if (!tray) continue;
    const at = remaining.indexOf(tray);
    if (at >= 0) remaining.splice(at, 1);
  }
  const ghosts: [HeldItemKind | null, HeldItemKind | null] = [null, null];
  for (let i = 0; i < trays.length; i += 1) {
    if (trays[i] !== null) continue;      // servida: nada de fantasma por cima da carga
    ghosts[i] = remaining.shift() ?? null;
  }
  return ghosts;
};

/**
 * A ordem em que o catalogo apresenta o livro: ferramentas primeiro (a familia que o jogador
 * encontra antes), maquinas depois, cada uma na ordem em que foi escrita acima — que e a ordem de
 * custo crescente dentro da familia. Uma ordenacao alfabetica poria o bau antes da engrenagem e a
 * escada da fabrica deixaria de se ler de cima a baixo.
 */
export const FAMILY_ORDER: readonly ToolboxFamily[] = ['tool', 'machine', 'material'];

/** A estacao de uma receita, com o padrao resolvido — um lugar so faz essa pergunta. */
export const recipeStation = (recipe: ToolboxRecipe): CraftStation => recipe.station ?? 'bench';

export const catalogOrder = (station: CraftStation = 'bench'): readonly ToolboxRecipe[] => {
  const mine = TOOLBOX_RECIPES.filter((r) => recipeStation(r) === station);
  return FAMILY_ORDER.flatMap((family) => mine.filter((r) => r.family === family));
};

/**
 * A ESCADA — a ordem em que a fábrica se abre para o jogador, um degrau de cada vez.
 *
 * O catálogo mostrava TUDO desde o primeiro segundo: onze cartas na bancada, com a promessa de que
 * "a lista é a lista de ambições". A intenção era boa e o efeito, medido no relato de quem jogou,
 * foi o oposto — onze coisas ao mesmo tempo não é ambição, é uma parede. O jogador não precisa
 * saber que existe extrator enquanto ainda não fez o primeiro ferro; ele precisa saber QUAL É O
 * PRÓXIMO PASSO.
 *
 * Então a mesa passou a mostrar o mínimo: **tudo que ele já fez, mais UMA coisa nova**. A carta
 * nova é sempre a próxima da escada, e ela só aparece quando a anterior saiu — de modo que abrir a
 * bancada nunca custa uma leitura de catálogo, e sim uma olhada.
 *
 * A ordem não é arbitrária: ela é a cadeia do ferro contada na sequência em que ela acontece.
 *   forno (a primeira máquina, e a única que não pede metal)
 *     → machado (a ferramenta que abre a madeira, e o carvão com ela)
 *       → engrenagem (o primeiro bem que só existe porque a bancada existe)
 *         → martinete (automatizar a martelada que ele acabou de dar à mão)
 *           → caldeira e cabo (a energia que o martinete pede)
 *             → esteira, braço, baú (mover carga)
 *               → extrator (a peça mais cara, que produz matéria do nada)
 *                 → foice (a ponta solta: um luxo, não um degrau)
 */
const LADDER: Record<CraftStation, readonly HeldItemKind[]> = {
  bench: [
    // FORNO e depois ALTAR, nesta ordem e coladinhos: sao as duas metades de UM processo. O forno
    // devolve uma esponja encharcada de escoria, e a esponja so vira barra apanhando — o altar e o
    // lugar disso. Quem acabou de acender o primeiro forno tem exatamente o que a laje pede (uma
    // pedra e um minerio, os dois da mesma picareta), entao o segundo degrau da escada e sempre
    // pagavel no minuto em que aparece.
    //
    // O martinete continua sendo o degrau que AUTOMATIZA este mesmo gesto, la adiante: a maquina
    // chega como alivio de um trabalho que o jogador ja conhece na mao.
    'furnace', 'altar', 'axe', 'gear', 'tripHammer', 'boiler', 'wire',
    'belt', 'inserter', 'chest', 'extractor', 'scythe',
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

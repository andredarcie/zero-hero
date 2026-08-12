/**
 * A REDE DE ENERGIA — e a morte do circuito booleano.
 *
 * Ate aqui "energia" era um `Set` de cabos vivos: um flood-fill que dizia LIGADO ou DESLIGADO e
 * nada mais. Isso bastava enquanto o unico consumidor era um braco que so precisava saber se
 * podia mexer, mas e exatamente o que impedia este jogo de ter uma FABRICA: sem quantidade nao
 * existe GARGALO, e gargalo e a unica pergunta que uma linha de producao faz. Com um booleano,
 * ligar o decimo braco na mesma roda d'agua custa o mesmo que ligar o primeiro — entao nao ha
 * o que projetar, so o que conectar.
 *
 * Agora cada fonte PUBLICA watts e cada maquina PUXA watts, e o que sai daqui e uma
 * `satisfaction` de 0 a 1 por consumidor: quanto do que ele pediu a rede conseguiu dar. Ela nao
 * vira legenda em lugar nenhum — vira VELOCIDADE (o consumidor multiplica o proprio delta por
 * ela) e vira BRILHO (o filete do cabo acende na intensidade da carga). A lei das travas vale
 * aqui como vale no resto do jogo: a rede sobrecarregada responde com fisica, nunca com texto.
 * O jogador ve os bracos arrastando e vai construir uma caldeira.
 *
 * TS puro de proposito — nada de Phaser, nada de Three. A rede e um grafo e uma divisao; poder
 * exercita-la sem subir uma cena e o que mantem esta peca honesta.
 */

/** A chave de tile que o resto da cena ja usa em todo indice espacial. */
export const tileKey = (x: number, y: number): string => `${x},${y}`;

const CARDINALS: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/** Uma maquina ligada na rede: onde ela esta e quantos watts ela da (fonte) ou pede (consumidor). */
export type PowerNode = {
  readonly x: number;
  readonly y: number;
  /** Watts. Uma fonte apagada entra com 0 — ela continua no grafo (o cabo dela existe), so nao da nada. */
  readonly watts: number;
};

export type PowerGridInput = {
  /**
   * Todo tile que CONDUZ: os cabos, e as ESTEIRAS.
   *
   * A esteira entrou aqui depois de a linha ser montada uma vez no jogo real, e o defeito ficou
   * obvio no primeiro teste: com o cabo como unico condutor, uma linha de dez esteiras exigiria
   * dez cabos deitados ao lado dela. Isso nao e um custo — e uma tarefa, e nenhum jogador
   * construiria a segunda linha. A esteira tem o proprio eixo de tracao, entao ela leva corrente
   * ao longo de si mesma: energize a CABECA da linha e a linha inteira anda.
   *
   * Note o que NAO mudou: maquina encostada em maquina continua nao conduzindo. Caldeira colada
   * no extrator segue precisando de fio. E o que mantem o cabo sendo peca de puzzle — a esteira
   * conduz porque ela ja e, ela propria, uma linha que alguem teve de deitar tile a tile.
   */
  readonly conductors: ReadonlySet<string>;
  /** Caldeira, roda, placa — o que gera por conta propria. */
  readonly sources: readonly PowerNode[];
  /**
   * A bateria pousada. Ela e uma fonte de SEGUNDA CLASSE por desenho: so entrega o que faltou
   * depois das fontes de verdade, e so gasta carga na proporcao do que entregou. E o que
   * preserva a lei que ela ja tinha ("drena SO enquanto alimenta") agora que ha quantidade:
   * uma bateria num circuito de sobra fica intacta em vez de queimar carga a toa.
   */
  readonly batteries: readonly PowerNode[];
  /** Braco, esteira, extrator, portao — quem consome. */
  readonly sinks: readonly PowerNode[];
};

export type PowerGridSolution = {
  /**
   * Quanto do pedido deste consumidor a rede atendeu, de 0 a 1. Sem cabo encostado: 0.
   * Consumidor de 0 watt (uma maquina que so quer saber se ha corrente) recebe 1 quando o
   * componente tem qualquer sobra — nunca uma divisao por zero.
   */
  readonly satisfactionAt: ReadonlyMap<string, number>;
  /** Os CONDUTORES vivos e com que carga (0..1) — e o que o filete de ouro do cabo desenha. */
  readonly wireLoad: ReadonlyMap<string, number>;
  /** Fracao da propria potencia que cada bateria realmente entregou neste frame (0..1). */
  readonly batteryDraw: ReadonlyMap<string, number>;
};

type Component = {
  tiles: string[];
  supply: number;
  batterySupply: number;
  demand: number;
};

/**
 * Resolve a rede inteira de uma vez.
 *
 * A geografia continua sendo a mesma de sempre: o cabo conduz, e uma maquina se liga ao cabo
 * ORTOGONALMENTE vizinho. A unica coisa nova e que uma maquina encostada em dois trechos de
 * cabo diferentes os UNE — o que e o que um terminal de gerador faz no mundo real, e o que
 * impede um jogador de "descobrir" que dois cabos separados pela caldeira sao duas redes.
 * Maquina encostada em maquina continua nao conduzindo: sem isso o cabo deixaria de ser peca
 * de puzzle e viraria decoracao (a lei que o WireObject inteiro existe para sustentar).
 */
export const solvePowerGrid = (input: PowerGridInput): PowerGridSolution => {
  const satisfactionAt = new Map<string, number>();
  const wireLoad = new Map<string, number>();
  const batteryDraw = new Map<string, number>();
  if (input.conductors.size === 0) {
    // Sem condutor nao ha rede. Todo consumidor fica em zero, e isso e uma resposta, nao uma
    // falta: e o braco parado que ensina que faltou fio.
    for (const sink of input.sinks) satisfactionAt.set(tileKey(sink.x, sink.y), 0);
    return { satisfactionAt, wireLoad, batteryDraw };
  }

  // --- 1. Union-find sobre os tiles CONDUTORES ----------------------------------------------
  const parent = new Map<string, string>();
  for (const key of input.conductors) parent.set(key, key);
  const find = (key: string): string => {
    let root = key;
    while (parent.get(root) !== root) root = parent.get(root)!;
    // Compressao de caminho: a rede e re-resolvida TODO frame, entao o custo por chamada importa.
    let walk = key;
    while (parent.get(walk) !== root) {
      const next = parent.get(walk)!;
      parent.set(walk, root);
      walk = next;
    }
    return root;
  };
  const union = (a: string, b: string): void => {
    const ra = find(a); const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const key of input.conductors) {
    const comma = key.indexOf(',');
    const x = Number(key.slice(0, comma));
    const y = Number(key.slice(comma + 1));
    // So dois dos quatro vizinhos, e nao os quatro: a aresta A-B e a mesma que B-A, e varrer os
    // quatro faria cada uma duas vezes num grafo que roda a cada frame.
    const east = tileKey(x + 1, y);
    if (input.conductors.has(east)) union(key, east);
    const south = tileKey(x, y + 1);
    if (input.conductors.has(south)) union(key, south);
  }

  /** Os condutores que esta maquina toca, ja unidos entre si (o terminal do gerador). */
  const attach = (node: PowerNode): string | null => {
    let root: string | null = null;
    for (const [dx, dy] of CARDINALS) {
      const key = tileKey(node.x + dx, node.y + dy);
      if (!input.conductors.has(key)) continue;
      if (root === null) root = find(key);
      else union(root, key);
    }
    // A maquina pousada EM CIMA do proprio condutor conta por ele — sao dois casos: a bateria,
    // que o heroi larga onde os pes dele estao (ver placeItemAt), e a ESTEIRA, que e condutor e
    // consumidor ao mesmo tempo e por isso se liga a si mesma.
    const self = tileKey(node.x, node.y);
    if (input.conductors.has(self)) {
      if (root === null) root = find(self);
      else union(root, self);
    }
    return root === null ? null : find(root);
  };

  // As uniões acontecem TODAS antes de qualquer soma: uma maquina no fim da varredura pode
  // fundir dois componentes que ja tinham sido contados, e a soma sairia dividida ao meio.
  const sourceRoots = input.sources.map(attach);
  const batteryRoots = input.batteries.map(attach);
  const sinkRoots = input.sinks.map(attach);

  // --- 2. Soma oferta e demanda por componente ----------------------------------------------
  const components = new Map<string, Component>();
  const componentOf = (root: string): Component => {
    const existing = components.get(root);
    if (existing) return existing;
    const created: Component = { tiles: [], supply: 0, batterySupply: 0, demand: 0 };
    components.set(root, created);
    return created;
  };
  for (const key of input.conductors) componentOf(find(key)).tiles.push(key);

  input.sources.forEach((source, i) => {
    const root = sourceRoots[i];
    if (root === null) return;
    componentOf(find(root)).supply += Math.max(0, source.watts);
  });
  input.batteries.forEach((battery, i) => {
    const root = batteryRoots[i];
    if (root === null) return;
    componentOf(find(root)).batterySupply += Math.max(0, battery.watts);
  });
  input.sinks.forEach((sink, i) => {
    const root = sinkRoots[i];
    if (root === null) return;
    componentOf(find(root)).demand += Math.max(0, sink.watts);
  });

  // --- 3. A divisao, que e a peca inteira ---------------------------------------------------
  // `satisfaction` e o mesmo numero para TODOS os consumidores do componente, e nao uma fila em
  // que os primeiros comem tudo: uma rede curta de energia faz a fabrica INTEIRA arrastar, o que
  // se le de relance, em vez de parar uma maquina no fim da linha, o que so se descobre indo la.
  const satisfactionOf = new Map<string, number>();
  for (const [root, component] of components) {
    const total = component.supply + component.batterySupply;
    if (component.demand <= 0) {
      satisfactionOf.set(root, total > 0 ? 1 : 0);
      continue;
    }
    satisfactionOf.set(root, total <= 0 ? 0 : Math.min(1, total / component.demand));
  }

  input.sinks.forEach((sink, i) => {
    const root = sinkRoots[i];
    satisfactionAt.set(
      tileKey(sink.x, sink.y),
      root === null ? 0 : satisfactionOf.get(find(root)) ?? 0,
    );
  });

  // A bateria so cobre o BURACO que as fontes de verdade deixaram, e todas as baterias do mesmo
  // componente o dividem na proporcao das suas potencias. Sobra de geracao = bateria intacta.
  input.batteries.forEach((battery, i) => {
    const root = batteryRoots[i];
    if (root === null || battery.watts <= 0) return;
    const component = components.get(find(root));
    if (!component || component.batterySupply <= 0) return;
    const deficit = Math.max(0, component.demand - component.supply);
    const used = Math.min(component.batterySupply, deficit);
    batteryDraw.set(tileKey(battery.x, battery.y), used / component.batterySupply);
  });

  // --- 4. O que o cabo mostra ---------------------------------------------------------------
  // Carga, nao satisfacao: um cabo sozinho ligado a uma caldeira sem consumidor nenhum esta VIVO
  // e brilha cheio; a mesma caldeira puxada por tres extratores brilha fraco. E o unico lugar em
  // que o jogador le a conta antes de sentir o resultado dela.
  for (const component of components.values()) {
    const total = component.supply + component.batterySupply;
    if (total <= 0) continue;
    const load = component.demand <= 0 ? 1 : Math.min(1, total / component.demand);
    for (const key of component.tiles) wireLoad.set(key, load);
  }

  return { satisfactionAt, wireLoad, batteryDraw };
};

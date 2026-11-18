/**
 * O QUE O ACAMPAMENTO PODE GANHAR (pedido do autor, 2026-11-17): o acampamento começa só com o colchão, o fogo com a
 * panela e o caderno; todo o resto o jogador PÕE, no modo de construção da bancada (scenes/game/BuildMode), num tile
 * que ele escolhe. Duas origens:
 *   • a CONSTRUÇÃO, paga com o material guardado na bancada — sempre o que o vale nunca deixa acabar (graveto, pedra,
 *     carvão e minério: a árvore seca rebrota e as rochas voltam), para o lar crescer também depois do fim;
 *   • o PRESENTE de um vizinho, que chega quando o pedido dele fecha e não custa nada — mas só vale quando o herói o
 *     põe no acampamento com a mão dele.
 *
 * CADA PEÇA UMA VEZ SÓ (pedido do autor, 2026-11-17: "cada item só pode ser construído uma vez, e ele sai da lista; se
 * eu destruir, ele volta para a lista"): a peça posta some da bancada; mudá-la de lugar continua de graça; DESMONTÁ-LA
 * (com ela levantada, na grade) devolve o material à bancada e a carta à lista, para construir de novo onde quiser.
 *
 * Aqui mora a regra pura: a lista, o preço, a escada (a bancada mostra o mínimo para continuar: o que já foi feito e
 * não está posto, mais UMA construção nova) e a conta do estoque.
 */

export type HomePieceKind =
  | 'log' | 'sign' | 'tub' | 'sundial' | 'cairn' | 'lantern' | 'flowerPot' | 'windChime'
  | 'rack' | 'easel' | 'woodpile' | 'chart';

/** O que a bancada guarda: o material das construções. */
export type BenchMaterial = 'wood' | 'stone' | 'charcoal' | 'ore';
export const BENCH_MATERIALS: readonly BenchMaterial[] = ['wood', 'stone', 'charcoal', 'ore'];
export const isBenchMaterial = (kind: unknown): kind is BenchMaterial =>
  typeof kind === 'string' && (BENCH_MATERIALS as readonly string[]).includes(kind);

export type BenchStock = Readonly<Partial<Record<BenchMaterial, number>>>;

export interface HomeBuild {
  kind: HomePieceKind;
  /** O preço, em material da bancada. Ausente = presente de um vizinho. */
  cost?: BenchStock;
  /** O pedido (dialogs/NpcQuests) que dá esta peça. */
  gift?: string;
}

/** A ESCADA das construções, na ordem em que se abrem; depois, os presentes (um por vizinho com pedido). */
export const HOME_BUILDS: readonly HomeBuild[] = [
  // O tronco de sentar ao lado do fogo. (Havia também o banquinho, e saiu a pedido do autor, 2026-11-17: o tronco já
  // senta — duas peças com o mesmo gesto são uma a mais. Num save antigo, o banquinho posto vira tronco: adventureState.)
  { kind: 'log', cost: { wood: 2 } },
  // A placa com o nome do lugar (o carvão é a tinta das letras) e a tina de tingir.
  { kind: 'sign', cost: { wood: 2, charcoal: 1 } },
  { kind: 'tub', cost: { wood: 2, stone: 1 } },
  // O relógio de sol: o mostrador de pedra e o graveto que faz a sombra.
  { kind: 'sundial', cost: { stone: 1, wood: 1 } },
  { kind: 'cairn', cost: { stone: 3 } },
  { kind: 'lantern', cost: { wood: 1, charcoal: 1 } },
  // O vaso de pedra com carvão no fundo: o carvão segura água e adubo na terra (é o biocarvão).
  { kind: 'flowerPot', cost: { stone: 1, charcoal: 1 } },
  // As lascas de minério penduradas num graveto.
  { kind: 'windChime', cost: { wood: 1, ore: 1 } },
  // As lembranças dos pedidos: o varal da Shui, o quadro da Sisi, a lenha do Marco, o mapa de estrelas da Thea.
  { kind: 'rack', gift: 'radiationSuit' },
  { kind: 'easel', gift: 'painter' },
  { kind: 'woodpile', gift: 'businessMan' },
  { kind: 'chart', gift: 'astronaut' },
];

export const homeBuild = (kind: HomePieceKind): HomeBuild =>
  HOME_BUILDS.find((b) => b.kind === kind) ?? { kind };

export const isHomePiece = (kind: unknown): kind is HomePieceKind =>
  typeof kind === 'string' && HOME_BUILDS.some((b) => b.kind === kind);

/** Dá para pagar com o que a bancada tem? */
export const canAfford = (cost: BenchStock | undefined, stock: BenchStock): boolean =>
  !cost || BENCH_MATERIALS.every((m) => (stock[m] ?? 0) >= (cost[m] ?? 0));

/** O estoque depois de pagar (quem chama já conferiu com `canAfford`). */
export const spend = (cost: BenchStock | undefined, stock: BenchStock): Record<BenchMaterial, number> => {
  const out = { wood: 0, stone: 0, charcoal: 0, ore: 0 } as Record<BenchMaterial, number>;
  for (const m of BENCH_MATERIALS) out[m] = Math.max(0, (stock[m] ?? 0) - (cost?.[m] ?? 0));
  return out;
};

/** O estoque com o material de volta (a peça desmontada; a repetida de um save antigo). */
export const refund = (cost: BenchStock | undefined, stock: BenchStock): Record<BenchMaterial, number> => {
  const out = { wood: 0, stone: 0, charcoal: 0, ore: 0 } as Record<BenchMaterial, number>;
  for (const m of BENCH_MATERIALS) out[m] = (stock[m] ?? 0) + (cost?.[m] ?? 0);
  return out;
};

export type HomeMenuState = 'ready' | 'lacking';

export interface HomeMenuEntry {
  kind: HomePieceKind;
  cost?: BenchStock;
  gift?: string;
  state: HomeMenuState;
  /** A construção nova da escada (a carta que a mesa está oferecendo agora). */
  next: boolean;
}

/**
 * O QUE A BANCADA MOSTRA: as construções já feitas uma vez, mais a PRIMEIRA que falta (onze cartas de uma vez eram uma
 * parede — a lei da mesa, ver toolboxRecipes.catalogSteps), e os presentes dos pedidos já fechados — MENOS o que está
 * no acampamento (ou levantado na mão para mudar de lugar): cada peça existe uma vez só. A escada anda pelo `built` (o
 * que já foi feito alguma vez), então desmontar uma peça a devolve à lista sem fechar a próxima.
 */
export const homeMenu = (
  built: ReadonlySet<string>,
  questDone: (quest: string) => boolean,
  placed: (kind: HomePieceKind) => number,
  stock: BenchStock,
): HomeMenuEntry[] => {
  const out: HomeMenuEntry[] = [];
  let offered = false;
  for (const b of HOME_BUILDS) {
    if (b.gift) {
      if (!questDone(b.gift)) continue;
    } else if (!built.has(b.kind)) {
      if (offered) continue;
      offered = true;
    }
    if (placed(b.kind) > 0) continue;
    out.push({
      kind: b.kind,
      cost: b.cost,
      gift: b.gift,
      next: !b.gift && !built.has(b.kind),
      state: canAfford(b.cost, stock) ? 'ready' : 'lacking',
    });
  }
  return out;
};

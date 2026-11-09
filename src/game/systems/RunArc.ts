// A JORNADA: os marcos de uma partida, na ordem em que acontecem — a abertura, a chave do jardim alto, o portão
// aberto, a névoa levantada, a fogueira do cume acesa e o fim (o cogumelo assado, os créditos).
//
// Eles moravam em dois lugares: quatro campos soltos na cena (`introDone`, `gateOpened`, `hearthLit`, `roasted`),
// copiados do save no boot e de volta a cada gravação, e dois só no save (`gardenKeyGiven`, `mistCleared`), escritos
// direto por quem precisasse. E as regras entre eles ficavam escondidas na leitura do save ("portão aberto = chave
// dada", "fim visto = névoa levantada"). Aqui eles são UMA sequência: alcançar um marco é ter passado por todos os
// anteriores, e o marco mora num lugar só — o save da aventura, ou a memória (o playtest do editor não grava nada:
// a lei do adventureState).

import { adventureState } from '@/game/runtime/adventureState';

export const MILESTONES = ['intro', 'gardenKey', 'gate', 'mist', 'hearth', 'ending'] as const;
export type Milestone = (typeof MILESTONES)[number];

/** Onde os marcos moram. `reached` diz quais estão marcados; `mark` marca um. */
export interface ArcStore {
  reached(m: Milestone): boolean;
  mark(m: Milestone): void;
}

/** O campo do save de cada marco (os nomes de sempre, para os saves que já existem). */
const SAVE_FIELD = {
  intro: 'introSeen',
  gardenKey: 'gardenKeyGiven',
  gate: 'gateOpened',
  mist: 'mistCleared',
  hearth: 'hearthLit',
  ending: 'endingSeen',
} as const satisfies Record<Milestone, string>;

/** Os marcos no save da aventura. */
export const adventureArcStore = (): ArcStore => ({
  reached: (m) => adventureState()[SAVE_FIELD[m]],
  mark: (m) => { adventureState()[SAVE_FIELD[m]] = true; },
});

/** Os marcos só na memória (o playtest do editor, os testes): nascem com `start` já alcançados. */
export const memoryArcStore = (...start: Milestone[]): ArcStore => {
  const set = new Set<Milestone>(start);
  return { reached: (m) => set.has(m), mark: (m) => { set.add(m); } };
};

export class RunArc {
  private store: ArcStore = memoryArcStore();
  /** O índice do marco mais adiante já alcançado (-1: nenhum). */
  private stage = -1;

  /** Liga a jornada a um lugar (o boot de cada partida) e lê de lá até onde ela já foi. */
  public load(store: ArcStore): void {
    this.store = store;
    this.stage = -1;
    MILESTONES.forEach((m, i) => { if (store.reached(m)) this.stage = i; });
  }

  /** A partida já passou por `m`? (Passar por um marco é ter passado pelos de antes.) */
  public has(m: Milestone): boolean {
    return MILESTONES.indexOf(m) <= this.stage;
  }

  /** Alcança `m` e marca no lugar dele tudo o que vem antes. Devolve true se a jornada andou. */
  public reach(m: Milestone): boolean {
    const target = MILESTONES.indexOf(m);
    if (target <= this.stage) return false;
    for (let i = this.stage + 1; i <= target; i += 1) this.store.mark(MILESTONES[i]);
    this.stage = target;
    return true;
  }

  /** Os marcos, em ordem, com o que já foi (para o debug e os playtests). */
  public snapshot(): Record<Milestone, boolean> {
    return Object.fromEntries(MILESTONES.map((m) => [m, this.has(m)])) as Record<Milestone, boolean>;
  }
}

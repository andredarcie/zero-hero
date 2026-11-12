import type { HeldItemKind } from '@/game/entities/ItemPickup';
import { MUSHROOM_KINDS } from '@/game/fungi/fungi';
import { adventureState } from '@/game/runtime/adventureState';

/**
 * O CADERNO DE CAMPO DO ACAMPAMENTO (pedido do autor, 2026-11-11): em cima do colchão, um caderninho que guarda tudo
 * o que o herói já pegou, como uma coleção que ele vai montando. Cada coisa tem a sua página, com a arte e o que ele
 * anotou dela; o que ele ainda não achou aparece só como silhueta. Está lá desde o começo.
 *
 * Aqui mora a LISTA (as seções e a ordem) e o registro do que já passou pelas mãos dele. A lista é só do que o vale
 * dá de verdade: a espada fica fincada na entrada, e o vaso, o banquinho, a lanterna, o forno e o altar não saem do
 * mundo (não há bancada nem quem os dê). Uma coleção com uma página que nunca se enche seria uma promessa falsa.
 * O balde cheio é o mesmo balde.
 */
export type NotebookSection = 'tools' | 'materials' | 'neighbours' | 'mushrooms';

export const NOTEBOOK: ReadonlyArray<{ section: NotebookSection; kinds: readonly HeldItemKind[] }> = [
  { section: 'tools', kinds: ['knife', 'axe', 'shovel', 'bucket', 'pickaxe', 'scythe', 'key'] },
  { section: 'materials', kinds: ['wood', 'splitWood', 'stone', 'charcoal', 'ore', 'bloom', 'iron', 'sand', 'ash', 'glass'] },
  { section: 'neighbours', kinds: ['dyeSeeds', 'dyeBundle', 'brush', 'telescope'] },
  { section: 'mushrooms', kinds: MUSHROOM_KINDS },
];

/** Os estados de uma coisa que é a mesma no caderno. */
const SAME_AS: Partial<Record<HeldItemKind, HeldItemKind>> = { bucketFull: 'bucket' };

/**
 * PASSOU PELAS MÃOS. A entrada é uma só, a mochila (`Inventory.add`): tudo que o herói pega entra por ela, venha do
 * chão, de um vizinho, do forno ou da bigorna. A cerimônia de item novo (`seenItems`) não serve sozinha, porque nem
 * todo presente passa por ela.
 */
export const noteFound = (kind: HeldItemKind): void => {
  adventureState().found.add(SAME_AS[kind] ?? kind);
};

export type NotebookEntry = { kind: HeldItemKind; section: NotebookSection; known: boolean };

/**
 * As páginas, na ordem do caderno. Achado = passou pelas mãos (`found`) ou teve a cerimônia de item novo (`seen`);
 * o segundo vale também para um save de antes do caderno existir.
 */
export const notebookEntries = (
  seen: ReadonlySet<string>,
  found: ReadonlySet<string> = adventureState().found,
): NotebookEntry[] => {
  const had = (kind: string): boolean => seen.has(kind) || found.has(kind);
  const known = (kind: HeldItemKind): boolean => had(kind)
    || Object.entries(SAME_AS).some(([alias, base]) => base === kind && had(alias));
  return NOTEBOOK.flatMap(({ section, kinds }) => kinds.map((kind) => ({ kind, section, known: known(kind) })));
};

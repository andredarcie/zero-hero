import { adventureState } from '@/game/runtime/adventureState';

/**
 * O CADERNO DE DESENHO (pedido do autor, 2026-11-11): os bichos do vale entram no caderno de campo desenhados à mão.
 * O herói olha para um bicho, abre o caderno (o Z) e desenha enquanto ele está distraído; quando o bicho levanta a
 * cabeça, ele para, senão o bicho se assusta e vai embora (o desenho fica pela metade, e se termina outro dia).
 *
 * Aqui mora a lista dos bichos e quanto de cada desenho já está no papel (no save). Quem os acha no mundo e monta a
 * tela é scenes/game/AnimalSketching; o desenho a pena é runtime/inkSketch.
 *
 * Cada bicho tem a sua hora: o esquilo de dia no carvalho, o pisco ciscando de dia, a lebre de manhãzinha e no fim da
 * tarde, a rã na margem (mais de noite), a libélula sobre a água de dia, a carpa no lago o tempo todo, e o gato só
 * dormindo no barril (acordado ele não para quieto).
 */
export type AnimalKind = 'squirrel' | 'bird' | 'hare' | 'frog' | 'dragonfly' | 'koi' | 'cat';

export const ANIMALS: readonly AnimalKind[] = ['squirrel', 'bird', 'hare', 'frog', 'dragonfly', 'koi', 'cat'];

/** Quanto do desenho deste bicho já está no papel (0..1). */
export const sketchProgress = (kind: string): number => adventureState().sketches.get(kind) ?? 0;

/** O desenho só anda para a frente: um traço feito não se desfaz. */
export const noteSketch = (kind: string, progress: number): void => {
  const sketches = adventureState().sketches;
  sketches.set(kind, Math.max(sketches.get(kind) ?? 0, Math.min(1, Math.max(0, progress))));
};

export const isSketched = (kind: string): boolean => sketchProgress(kind) >= 1;

/**
 * A CATEGORIA de uma carta: o que aquela terra é, e o que ela permite.
 *
 * Ela responde duas perguntas de uma vez, e é por isso que vale um campo em vez de uma cor:
 *
 *   • na MÃO, ela é a promessa — a moldura muda de metal e a palavra está escrita na carta (as duas
 *     coisas juntas, porque cor sozinha exclui quem não separa violeta de vermelho), então escolher
 *     entre três cartas deixa de ser escolher entre três desenhos bonitos;
 *   • no MUNDO, ela decide se o cerco de undead entra por aquela estrada (ver
 *     ChunkUndeadDirector). Só COMBATE recebe.
 *
 * A dedução existe para o baralho que já estava escrito: dezoito cartas sem o campo continuam
 * valendo, e cada uma cai na categoria óbvia. Ela erra num caso só — uma aula que tem professor E
 * parede seria narrativa por ter alguém dentro —, e é para esse caso que o campo explícito existe.
 */
import type { ChunkCategory, ChunkCatalogEntry } from '@/game/world/worldSchema';

export type { ChunkCategory };

/** A palavra que vai NA carta. Curta: ela divide a linha com o nome da terra. */
export const CATEGORY_LABEL: Record<ChunkCategory, string> = {
  narrative: 'NARRATIVE',
  combat: 'COMBAT',
  puzzle: 'PUZZLE',
};

type Categorisable = {
  catalog: ChunkCatalogEntry;
  npcs: ReadonlyArray<unknown>;
  enemies: ReadonlyArray<unknown>;
};

export const chunkCategoryOf = (template: Categorisable): ChunkCategory => {
  const explicit = template.catalog.category;
  if (explicit) return explicit;
  if (template.npcs.length > 0) return 'narrative';
  if (template.enemies.length > 0) return 'combat';
  return 'puzzle';
};

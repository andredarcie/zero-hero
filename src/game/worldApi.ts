import type { WorldData } from '@/game/world/worldSchema';

// Editor-side client for the dev-server world API (see vite.config.ts). Loads the current world
// file and persists edits back to it. Dev-only, which is exactly where the editor runs.
//
// SÃO DOIS ARQUIVOS, e só: `world` é a superfície (public/world.json) e `underworld` é o ESPELHO
// dela — o andar de baixo, mesmo tamanho e mesmas coordenadas (public/underworld.json), aberto
// pelo `/editor?under`. Houve um terceiro, `level-N`, a tela solta de puzzle editada pelo `/lab`;
// os levels isolados foram removidos do jogo e ele foi junto, com o CRUD inteiro que os criava,
// renomeava e apagava.

export type WorldFileId = 'world' | 'underworld';

/**
 * OS DOIS ANDARES DO MUNDO, com os nomes que o resto do projeto já usa: `overworld` é a superfície
 * (`world.json`, e `scripts/enrich-overworld-props.mjs`) e `underworld` é o espelho de baixo
 * (`underworld.json`, `runtime/underworld.ts`).
 *
 * O nome do arquivo da superfície continua sendo `world` por compatibilidade com tudo que já
 * grava nele; a tradução mora em `worldFileForFloor`, num lugar só.
 */
export type WorldFloor = 'overworld' | 'underworld';

export const worldFileForFloor = (floor: WorldFloor): WorldFileId =>
  (floor === 'underworld' ? 'underworld' : 'world');

/** ONDE cada andar mora, num lugar só — é o que o toast do Salvar anuncia. */
export const worldFilePath = (file: WorldFileId): string => (
  file === 'underworld' ? 'public/underworld.json' : 'public/world.json'
);

const buildApiUrl = (path: string): string => `${import.meta.env.BASE_URL}${path.replace(/^\/+/u, '')}`;

export const loadWorld = async (file: WorldFileId = 'world'): Promise<WorldData> => {
  const response = await window.fetch(buildApiUrl(`api/world?file=${file}`));
  if (!response.ok) {
    throw new Error(`Falha ao carregar ${file}.json`);
  }
  return response.json() as Promise<WorldData>;
};

export const saveWorld = async (world: WorldData, file: WorldFileId = 'world'): Promise<void> => {
  const response = await window.fetch(buildApiUrl(`api/world?file=${file}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(world),
  });
  if (!response.ok) {
    throw new Error(`Falha ao salvar ${file}.json`);
  }
};

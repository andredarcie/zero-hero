// Which puzzle level is being played right now (its 1-based number), or null for the main
// adventure. It drives the level-aware pause menu — "reiniciar level" and "voltar aos levels"
// only make sense when a level is active. Module-level state, like WorldData: it persists across
// scene.restart() (which is how "restart level" works) within a single game instance.

let current: number | null = null;

export const setActiveLevel = (level: number | null): void => {
  current = level;
};

export const getActiveLevel = (): number | null => current;

// The static asset path for a level (works in dev and the published build alike).
//
// `file` vem do manifesto (`public/levels/index.json`) e e o que MANDA; o numero e so o fallback
// para quem so tem ele em mao. O campo `file` existia no manifesto desde o comeco e nunca era
// lido: o carregador montava `level-N.json` a partir do numero e ignorava o arquivo declarado.
// Isso passou despercebido enquanto todo level se chamava `level-N`, e virou uma parede assim que
// as nove dungeons chegaram com nome proprio — segui-lo teria significado renomea-las para
// `level-3..11` e passar por cima dos dois levels autorados a mao, que e exatamente o que o
// CLAUDE.md proibe em maiusculas.
export const levelFilePath = (level: number, file?: string): string => (
  `${import.meta.env.BASE_URL}levels/${file ?? `level-${level}.json`}`
);

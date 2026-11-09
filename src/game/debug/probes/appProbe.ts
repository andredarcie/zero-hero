// O JOGO COMO APLICAÇÃO (`window.appDebug`): as cenas (registradas, ativas) e o texto de uma tela — o que o playtest
// precisa ANTES de existir partida (o título, o menu) e depois dela (os créditos), quando o `gameDebug` não existe.
// Só no modo de desenvolvimento, como as sondas do jogo.

import type * as Engine from '@/game/engine';

export const buildAppProbes = (game: Engine.Game) => ({
  /** As cenas que estão rodando agora, pela chave ('title', 'game', 'credits'...). */
  activeScenes: (): string[] => game.scene.getScenes(true).map((s) => s.scene.key),
  /** Todas as cenas que o jogo registrou, rodando ou não. */
  registeredScenes: (): string[] => game.scene.scenes.map((s) => s.scene.key),
  isActive: (key: string): boolean => game.scene.isActive(key) === true,
  /** Os textos que a cena `key` desenha (os objetos de texto do motor 2D). */
  sceneTexts: (key: string): string[] => {
    const scene = game.scene.getScene(key);
    return (scene?.children.list ?? []).filter((o) => o.type === 'Text').map((o) => (o as unknown as { text: string }).text);
  },
  /** Quantos objetos a cena `key` tem, e se ela carregou a textura `texture`. */
  sceneStats: (key: string, texture?: string) => {
    const scene = game.scene.getScene(key);
    return { objects: scene?.children.list.length ?? 0, texture: texture ? Boolean(scene?.textures.exists(texture)) : null };
  },
});

export type AppProbes = ReturnType<typeof buildAppProbes>;

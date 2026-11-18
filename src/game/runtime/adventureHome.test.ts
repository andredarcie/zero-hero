import { describe, expect, it, vi } from 'vitest';

// O LAR DE UM SAVE DE ANTES (pedido do autor, 2026-11-17): o banquinho saiu (o tronco já senta) e cada peça existe uma
// vez só. Ao carregar, o banquinho posto vira tronco no mesmo tile, e a peça repetida sai — o material dela volta para a
// bancada, para nada do que o jogador construiu se perder.

/** O save é lido UMA vez, no primeiro `adventureState()`: o módulo novo (com a sua plataforma) lê este disco. */
const loadHome = async (home: unknown) => {
  vi.resetModules();
  const { installPlatform, localStore } = await import('@/game/platform/platform');
  const { createTestPlatform } = await import('@/test-support/testPlatform');
  installPlatform(createTestPlatform());
  localStore().setItem('zh.cozy.v1', JSON.stringify({ started: true, home }));
  const { adventureState } = await import('./adventureState');
  return adventureState().home;
};

describe('o lar de um save antigo', () => {
  it('o banquinho vira tronco; a repetida sai e devolve o material; a escada não guarda o banquinho', async () => {
    const home = await loadHome({
      pieces: [
        { kind: 'stool', x: 52, y: 49 }, { kind: 'cairn', x: 50, y: 50 },
        { kind: 'cairn', x: 51, y: 50 }, { kind: 'log', x: 55, y: 49 },
      ],
      built: ['log', 'stool', 'cairn'],
      stock: { wood: 1 },
    });
    expect(home.pieces).toEqual([{ kind: 'log', x: 52, y: 49 }, { kind: 'cairn', x: 50, y: 50 }]);
    // a pilha de pedras repetida devolve 3 pedras; o tronco repetido, 2 gravetos
    expect(home.stock).toEqual({ wood: 3, stone: 3, charcoal: 0, ore: 0 });
    expect(home.built).toEqual(['log', 'cairn']);
  });
});

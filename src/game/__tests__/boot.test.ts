// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { bootGame } from '@/test-support/game';

describe('o jogo sobe inteiro, sem navegador', () => {
  it('carrega tudo, monta o mundo e entra na cena do jogo', async () => {
    const booted = await bootGame();
    expect(booted.game.scene.isActive('game')).toBe(true);
    const state = window.gameDebug!.getState();
    expect(state.scene).toBe('game');
    expect(Number.isFinite(state.player.worldX)).toBe(true);
    booted.tick(30);
  }, 120_000);
});

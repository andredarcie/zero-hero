// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';

import { adventureState } from '@/game/runtime/adventureState';
import type { GameScene } from '@/game/scenes/GameScene';
import { bootGame, type BootedGame } from '@/test-support/game';
import type { TestPage } from '@/test-support/nodeHost';

// A JORNADA ATÉ O FIM, sem navegador: a abertura, a chave do jardim, o portão, a fogueira do cume e o assado — cada
// marco chega à jornada da cena (systems/RunArc) e ao save da aventura, no mesmo gesto. É o caminho que só o `zerar`
// (dez minutos de Chromium) cobria.

const Z = 90;
let booted: BootedGame;
let page: TestPage;
const scene = (): GameScene => booted.scene<GameScene>('game');
const press = (code: number): void => {
  page.key('keydown', code);
  booted.tick(2);
  page.key('keyup', code);
  booted.tick(2);
};

beforeAll(async () => {
  booted = await bootGame();
  page = booted.platform.engineHost.page!;
  // A abertura até o fim: o Z passa as falas do mago.
  await booted.until(() => {
    const st = window.gameDebug!.getState();
    if (st.dialogOpen) press(Z);
    return st.introDone && !st.cutsceneActive && !st.dialogOpen;
  }, 12_000);
}, 120_000);

describe('o fim do jogo', () => {
  it('a abertura vista é o primeiro marco, e já está no save', () => {
    expect(scene().arc.has('intro')).toBe(true);
    expect(adventureState().introSeen).toBe(true);
    expect(scene().arc.has('gardenKey')).toBe(false);
  });

  it('a chave do jardim vai para a mão uma vez só', async () => {
    const s = scene();
    s.gardenUnlock.giveGardenKey(undefined);
    expect(s.arc.has('gardenKey')).toBe(true);
    expect(adventureState().gardenKeyGiven).toBe(true);
    expect(s.heldItem).toBe('key');
    // A cerimônia de "você ganhou" fecha sozinha.
    await booted.until(() => !s.hand.itemGetOpen, 600);
    s.hand.clearHeldItem();
    s.gardenUnlock.giveGardenKey(undefined);
    expect(s.heldItem).toBe('none');
  }, 60_000);

  it('o portão do jardim abre, e o save lembra', () => {
    const s = scene();
    s.gardenUnlock.openGardenGate();
    expect(s.arc.has('gate')).toBe(true);
    expect(adventureState().gateOpened).toBe(true);
    expect(s.props.gardenGates.length).toBeGreaterThan(0);
    expect(s.props.gardenGates.every((g) => g.isOpen || !g.blocking)).toBe(true);
  });

  it('a fogueira do cume acende, e acender é ter passado pela névoa', async () => {
    const s = scene();
    const hearth = s.props.hearths[0];
    expect(hearth).toBeDefined();
    expect(s.roastEnding.tendHearthAt(hearth.worldX, hearth.worldY)).toBe(true);
    await booted.until(() => s.arc.has('hearth') && !s.cutsceneActive, 900);
    expect(hearth.isLit).toBe(true);
    expect(adventureState().hearthLit).toBe(true);
    // A névoa só não levantou neste teste porque o herói não subiu: a jornada diz que, aqui, ela já foi.
    expect(s.arc.has('mist')).toBe(true);
  }, 60_000);

  it('com o graveto na mão, o Z na fogueira assa: é o fim', () => {
    const s = scene();
    const hearth = s.props.hearths[0];
    window.gameDebug!.items!.hold('wood');
    expect(s.roastEnding.tendHearthAt(hearth.worldX, hearth.worldY)).toBe(true);
    expect(s.arc.has('ending')).toBe(true);
    expect(adventureState().endingSeen).toBe(true);
    expect(window.gameDebug!.getState().ending).toEqual({ gateOpen: true, hearthLit: true, roasted: true });
  });
});

// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';

import { t } from '@/game/i18n/i18n';
import { RELIC_KINDS, RELIC_SPOTS } from '@/game/relics/relics';
import { CELL_TOWER_OFFSET } from '@/game/render3d/towerArt';
import { adventureState } from '@/game/runtime/adventureState';
import type { GameScene } from '@/game/scenes/GameScene';
import { getHearths } from '@/game/world/WorldData';
import { bootGame, type BootedGame } from '@/test-support/game';
import type { TestPage } from '@/test-support/nodeHost';

// AS RELÍQUIAS, JOGADAS: o jogo montado, a pá guardada, o herói em cima da trinca (a cavada no pé) e de frente para
// ela (o golpe da pá). A coisa sai da terra, a cerimônia abre e fecha, o caderno ganha a página e o save lembra. E a
// torre do cume: no lugar, barrando o corpo, com a luz piscando.

const X = 88;
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
const teleport = (x: number, y: number, dx: number, dy: number): void => {
  window.gameDebug!.hero!.teleport(x, y, dx, dy);
  booted.tick(12);
};

beforeAll(async () => {
  booted = await bootGame();
  page = booted.platform.engineHost.page!;
  await booted.until(() => {
    const st = window.gameDebug!.getState();
    if (st.dialogOpen) press(Z);
    return st.introDone && !st.cutsceneActive && !st.dialogOpen;
  }, 12_000);
}, 120_000);

describe('as relíquias enterradas', () => {
  it('as onze trincas estão no chão, cada uma num tile livre do jogo montado', () => {
    const s = scene();
    for (const kind of RELIC_KINDS) {
      const { x, y } = RELIC_SPOTS[kind];
      teleport(x, y + 1, 0, -1);
      expect(s.relics.buriedAt(x, y), kind).toBe(kind);
      expect(s.query.isTileTaken(x, y), `${kind}: nada em cima`).toBe(false);
      expect(s.relics.canDigAt(x, y), `${kind}: a pá cavaria de frente`).toBe(true);
    }
  });

  it('de pé em cima da trinca, o balão diz Cavar e o X cava no pé: a coisa sai, cai na mão e vai para o caderno', async () => {
    const s = scene();
    s.inventory.clear();
    s.inventory.keep('shovel');
    s.carry.updateBackItem();
    const kind = 'odyssey2001';
    const { x, y } = RELIC_SPOTS[kind];
    teleport(x, y, 0, 1);
    booted.tick(30);
    expect(s.verbs.currentPrompt({ x, y })?.view.rows.map((r) => r.label)).toContain(t('actions.dig'));
    press(X);
    expect(s.cutsceneActive, 'o herói para enquanto cava').toBe(true);
    await booted.until(() => s.hand.itemGetOpen, 4000);
    expect(adventureState().found.has(kind)).toBe(true);
    expect(s.relics.buriedAt(x, y)).toBeUndefined();
    expect(s.heldItem, 'a pá veio das guardadas').toBe('shovel');
    await booted.until(() => !s.hand.itemGetOpen && !s.cutsceneActive, 8000);
    expect(s.camp.notebook.view().pages.find((p) => p.kind === kind)?.known).toBe(true);
  }, 60_000);

  it('de frente para a trinca, o golpe da pá também cava', async () => {
    const s = scene();
    const kind = 'goneHome';
    const { x, y } = RELIC_SPOTS[kind];
    teleport(x - 1, y, 1, 0);
    booted.tick(30);
    expect(s.verbs.useVerbAt(x, y)).toBe('dig');
    expect(s.verbs.currentPrompt({ x: x - 1, y })?.view.rows.map((r) => r.label)).toContain(t('actions.dig'));
    press(X);
    await booted.until(() => s.hand.itemGetOpen, 4000);
    expect(adventureState().found.has(kind)).toBe(true);
    await booted.until(() => !s.hand.itemGetOpen && !s.cutsceneActive, 8000);
    // a terra revirada: ali a pá não cava mais
    expect(s.relics.canDigAt(x, y)).toBe(false);
    expect(s.verbs.useVerbAt(x, y)).not.toBe('dig');
  }, 60_000);

  it('a torre está na ponta do cume, barra o corpo, e a luz pisca', async () => {
    const s = scene();
    const hearth = getHearths()[0];
    const tower = s.valley.cellTower!;
    expect(tower).toBeDefined();
    expect({ x: tower.x, y: tower.y }).toEqual({ x: hearth.worldX + CELL_TOWER_OFFSET.dx, y: hearth.worldY + CELL_TOWER_OFFSET.dy });
    expect(s.query.isSolidForEntities(tower.x, tower.y)).toBe(true);
    const seen: number[] = [];
    await booted.until(() => {
      seen.push(tower.lit);
      return seen.length > 200;
    }, 6000);
    expect(Math.max(...seen)).toBeGreaterThan(0.8);
    expect(Math.min(...seen)).toBeLessThan(0.2);
  }, 60_000);
});

// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';

import type { EditorStore } from '@/game/editor/EditorStore';
import type { UiState } from '@/game/editor/EditorDomUi';
import { bootGame, type BootedGame } from '@/test-support/game';
import type { TestPage } from '@/test-support/nodeHost';

// O EDITOR DO MUNDO, usado como o autor usa: os atalhos ligam e desligam as camadas, o pincel pinta o tile sob o
// ponteiro, a borracha apaga, as janelas abrem e fecham no ESC, salvar grava o world.json (pela API do editor),
// e o "testar" (P) põe o mundo em memória para jogar e o ESC volta ao editor.

interface EditorInternals {
  store?: EditorStore;
  uiState: UiState;
  ui?: { isModalOpen(): boolean; openHelpModal(): void; openWorldModal(): void; openDialogModal(kind: string): void };
  screenToCell(x: number, y: number): { x: number; y: number };
  handleSave(): Promise<void>;
  fitView(): void;
  centerOnTile(x: number, y: number): void;
}

let booted: BootedGame;
let page: TestPage;
const editor = (): EditorInternals => booted.scene('editor') as unknown as EditorInternals;
const press = (code: number, fields: Record<string, unknown> = {}): void => {
  page.key('keydown', code, fields);
  booted.tick(1);
  page.key('keyup', code, fields);
  booted.tick(1);
};

beforeAll(async () => {
  booted = await bootGame({ mode: 'editor' });
  page = booted.platform.engineHost.page!;
  await booted.until(() => Boolean(editor().store), 600);
}, 120_000);

describe('o editor sobe', () => {
  it('carrega o mundo pela API e monta a interface em DOM', () => {
    const store = editor().store!;
    expect(store.world.meta.worldChunksX).toBe(5);
    expect(document.querySelectorAll('button').length).toBeGreaterThan(10);
    expect(document.body.textContent?.length).toBeGreaterThan(50);
  });
});

describe('atalhos', () => {
  it('G, V, L, T e O ligam e desligam as camadas da vista', () => {
    const s = editor().uiState;
    const before = [s.showGrid, s.showCollisions, s.showRelief, s.showEntities, s.showFixtures];
    for (const code of [71, 86, 76, 84, 79]) press(code);
    expect([s.showGrid, s.showCollisions, s.showRelief, s.showEntities, s.showFixtures]).toEqual(before.map((v) => !v));
    for (const code of [71, 86, 76, 84, 79]) press(code);
    expect([s.showGrid, s.showCollisions, s.showRelief, s.showEntities, s.showFixtures]).toEqual(before);
  });

  it('M troca a vista (mundo / chunk) e as setas andam de chunk em chunk', () => {
    const s = editor().uiState;
    const mode = s.viewMode;
    press(77);
    expect(s.viewMode).not.toBe(mode);
    if (s.viewMode === 'chunk') {
      const start = s.chunkX;
      press(39);
      expect(s.chunkX).toBe(Math.min(4, start + 1));
      press(37);
      expect(s.chunkX).toBe(start);
    }
    press(77);
    expect(s.viewMode).toBe(mode);
  });

  it('0 enquadra o mundo inteiro', () => {
    press(48);
    booted.tick(2);
    expect(booted.game.scene.isActive('editor')).toBe(true);
  });
});

describe('pintar com o ponteiro', () => {
  it('o pincel pinta o tile sob o ponteiro, e Ctrl+Z desfaz', () => {
    const e = editor();
    const store = e.store!;
    e.uiState.tool = 'brush';
    e.uiState.layer = 'ground';
    e.fitView();
    booted.tick(2);
    const sx = booted.game.scale.width / 2;
    const sy = booted.game.scale.height / 2;
    const cell = e.screenToCell(sx, sy);
    const before = store.readCell('ground', cell.x, cell.y) as number;
    // Um tile DIFERENTE do que já está no chão, senão pintar não muda nada.
    e.uiState.tile = before === 1 ? 2 : 1;
    e.uiState.brushSize = 1;
    page.mouse('mousedown', sx, sy);
    booted.tick(1);
    page.mouse('mouseup', sx, sy);
    booted.tick(1);
    expect(store.readCell('ground', cell.x, cell.y)).toBe(e.uiState.tile);
    expect(store.dirty).toBe(true);
    press(90, { ctrlKey: true });
    expect(store.readCell('ground', cell.x, cell.y)).toBe(before);
  });

  it('a borracha tira a peça do tile', () => {
    const e = editor();
    const store = e.store!;
    const prop = store.world.props.find((p) => p.type === 'rock')!;
    e.centerOnTile(prop.worldX, prop.worldY);
    booted.tick(2);
    e.uiState.tool = 'eraser';
    let hit: { x: number; y: number } | null = null;
    for (let y = 0; y < booted.game.scale.height && !hit; y += 2) {
      for (let x = 0; x < booted.game.scale.width && !hit; x += 2) {
        const c = e.screenToCell(x, y);
        if (c.x === prop.worldX && c.y === prop.worldY) hit = { x, y };
      }
    }
    expect(hit).not.toBeNull();
    page.mouse('mousedown', hit!.x, hit!.y);
    booted.tick(1);
    page.mouse('mouseup', hit!.x, hit!.y);
    booted.tick(1);
    expect(store.entitiesAt(prop.worldX, prop.worldY).some((p) => p.type === 'rock')).toBe(false);
  });
});

describe('janelas e salvar', () => {
  it('ajuda, mundo e fala abrem como janela, e o ESC fecha', () => {
    const ui = editor().ui!;
    for (const open of [() => ui.openHelpModal(), () => ui.openWorldModal(), () => ui.openDialogModal('wizard')]) {
      open();
      booted.tick(1);
      expect(ui.isModalOpen()).toBe(true);
      press(27);
      expect(ui.isModalOpen()).toBe(false);
    }
  });

  it('salvar grava o mundo pela API do editor', async () => {
    await editor().handleSave();
    const saved = booted.platform.saved.get('world');
    expect(saved).toBeDefined();
    expect(JSON.parse(saved!).meta.worldChunksX).toBe(5);
    expect(editor().store!.dirty).toBe(false);
  });
});

describe('testar o mundo sem sair do editor', () => {
  it('P põe o mundo em memória para jogar, e o ESC volta ao editor', async () => {
    press(80);
    await booted.until(() => booted.game.scene.isActive('game') === true, 2000);
    expect(booted.game.scene.isSleeping('editor')).toBe(true);
    booted.tick(10);
    press(27);
    await booted.until(() => booted.game.scene.isActive('editor') === true, 600);
    expect(booted.game.scene.isActive('game')).toBe(false);
  }, 120_000);
});

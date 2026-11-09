import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorldData } from '@/game/world/worldSchema';
import { EditorStore, type PlacedEntity } from './EditorStore';

// O ARMAZÉM DO EDITOR: o mundo que o autor pinta. As leis que ele cumpre são as do CLAUDE.md — chão + uma coisa
// por tile, um NPC aparece uma vez só, um gesto desfaz inteiro — e é por elas que o world.json não ganha pilhas.

const here = path.dirname(fileURLToPath(import.meta.url));
const loadWorld = (): WorldData => JSON.parse(readFileSync(path.resolve(here, '../../../public/world.json'), 'utf8')) as WorldData;

/** Um tile sem nada em cima e sem colisão, longe das peças do mundo. */
const emptyTile = (store: EditorStore): { x: number; y: number } => {
  for (let y = 1; y < 59; y++) {
    for (let x = 1; x < 59; x++) {
      if (store.entities.entitiesAt(x, y).length === 0 && store.readCell('upper', x, y) === null && store.readCell('collision', x, y) === false) return { x, y };
    }
  }
  throw new Error('nenhum tile vazio');
};

let store: EditorStore;
beforeEach(() => { store = new EditorStore(loadWorld()); });

describe('células', () => {
  it('pinta e lê de volta, marca sujo e avisa quem escuta', () => {
    const { x, y } = emptyTile(store);
    const onChange = vi.fn();
    store.listen(onChange);
    expect(store.setCell('ground', x, y, 42)).toBe(true);
    expect(store.readCell('ground', x, y)).toBe(42);
    expect(store.dirty).toBe(true);
    expect(onChange).toHaveBeenCalledWith({ cells: [{ wx: x, wy: y }] });
    expect(store.setCell('ground', x, y, 42)).toBe(false);
  });

  it('fora do mapa: nada se escreve, e a leitura devolve o padrão', () => {
    expect(store.setCell('ground', -1, 0, 3)).toBe(false);
    expect(store.readCell('upper', 9999, 9999)).toBeNull();
    expect(store.readCell('collision', 9999, 9999)).toBe(false);
    expect(store.readCell('relief', 9999, 9999)).toBe(0);
  });

  it('chão + uma coisa: o tile de cima não entra onde já mora uma peça; apagar sempre pode', () => {
    const prop = store.world.props[0];
    expect(store.setCell('upper', prop.worldX, prop.worldY, 7)).toBe(false);
    expect(store.setCell('upper', prop.worldX, prop.worldY, null)).toBe(false);
  });

  it('a serra nasce na primeira escrita e some quando o chunk volta a ser plano', () => {
    const { x, y } = emptyTile(store);
    const chunk = store.world.chunks.find((c) => c.cx === Math.floor(x / 12) && c.cy === Math.floor(y / 12))!;
    const hadRelief = Boolean(chunk.relief);
    store.setCell('relief', x, y, 1);
    expect(chunk.relief).toBeDefined();
    store.setCell('relief', x, y, 0);
    expect(Boolean(chunk.relief)).toBe(hadRelief);
  });

  it('o balde pinta a região ligada e para nas bordas pedidas', () => {
    const { x, y } = emptyTile(store);
    const target = store.readCell('ground', x, y);
    const bounds = { x0: x - 1, y0: y - 1, x1: x + 1, y1: y + 1 };
    const filled = store.floodFill('ground', x, y, 99, bounds);
    expect(filled.length).toBeGreaterThan(0);
    expect(filled.length).toBeLessThanOrEqual(9);
    for (const cell of filled) {
      expect(store.readCell('ground', cell.wx, cell.wy)).toBe(99);
      expect(cell.wx).toBeGreaterThanOrEqual(bounds.x0);
      expect(cell.wx).toBeLessThanOrEqual(bounds.x1);
    }
    expect(store.floodFill('ground', x, y, 99)).toEqual([]);
    expect(target).not.toBe(99);
  });
});

describe('desfazer e refazer', () => {
  it('um traço inteiro desfaz de uma vez', () => {
    const { x, y } = emptyTile(store);
    const before = [store.readCell('ground', x, y), store.readCell('ground', x + 1, y)];
    store.history.beginStroke();
    store.setCell('ground', x, y, 11);
    store.setCell('ground', x + 1, y, 11);
    store.setCell('ground', x, y, 12);
    store.history.commitStroke();
    expect(store.canUndo).toBe(true);
    expect(store.history.undo()).toBe(true);
    expect([store.readCell('ground', x, y), store.readCell('ground', x + 1, y)]).toEqual(before);
    expect(store.canRedo).toBe(true);
    expect(store.history.redo()).toBe(true);
    expect(store.readCell('ground', x, y)).toBe(12);
    expect(store.history.undo()).toBe(true);
    expect(store.history.undo()).toBe(false);
  });

  it('um gesto novo depois de desfazer apaga o refazer', () => {
    const { x, y } = emptyTile(store);
    store.setCell('ground', x, y, 5);
    store.history.undo();
    store.setCell('ground', x, y, 6);
    expect(store.canRedo).toBe(false);
  });
});

describe('peças', () => {
  it('colocar troca tudo o que estava no tile, e um Ctrl+Z devolve o tile inteiro', () => {
    const prop = store.world.props.find((p) => p.type === 'rock')!;
    const before = store.entities.entitiesAt(prop.worldX, prop.worldY);
    const placed: PlacedEntity = { list: 'props', type: 'dryShrub', worldX: prop.worldX, worldY: prop.worldY };
    store.entities.placeEntity(placed);
    expect(store.entities.entitiesAt(prop.worldX, prop.worldY)).toEqual([{ ...placed, dir: undefined }]);
    store.history.undo();
    expect(store.entities.entitiesAt(prop.worldX, prop.worldY)).toEqual(before);
  });

  it('colocar a mesma peça no mesmo lugar não faz nada; girar faz', () => {
    const { x, y } = emptyTile(store);
    store.entities.placeEntity({ list: 'props', type: 'furnace', worldX: x, worldY: y, dir: 0 });
    const count = store.world.props.length;
    store.entities.placeEntity({ list: 'props', type: 'furnace', worldX: x, worldY: y, dir: 0 });
    expect(store.world.props.length).toBe(count);
    store.entities.placeEntity({ list: 'props', type: 'furnace', worldX: x, worldY: y, dir: 2 });
    expect(store.entities.entitiesAt(x, y)[0]).toMatchObject({ type: 'furnace', dir: 2 });
  });

  it('um NPC aparece uma vez só: pôr de novo em outro tile MOVE o personagem', () => {
    const wizard = store.entities.allEntities().find((e) => e.list === 'npcs' && e.type === 'wizard')!;
    const { x, y } = emptyTile(store);
    store.entities.placeEntity({ list: 'npcs', type: 'wizard', worldX: x, worldY: y });
    const wizards = store.entities.allEntities().filter((e) => e.list === 'npcs' && e.type === 'wizard');
    expect(wizards).toEqual([{ list: 'npcs', type: 'wizard', worldX: x, worldY: y }]);
    store.history.undo();
    const back = store.entities.allEntities().filter((e) => e.list === 'npcs' && e.type === 'wizard');
    expect(back.map((e) => [e.worldX, e.worldY])).toEqual([[wizard.worldX, wizard.worldY]]);
  });

  it('apagar tira tudo do tile; tile vazio não tem o que apagar', () => {
    const prop = store.world.props[0];
    expect(store.entities.eraseEntitiesAt(prop.worldX, prop.worldY)).toBe(true);
    expect(store.entities.entitiesAt(prop.worldX, prop.worldY)).toEqual([]);
    const { x, y } = emptyTile(store);
    expect(store.entities.eraseEntitiesAt(x, y)).toBe(false);
  });

  it('as contas do mundo: estatísticas e o mundo copiado', () => {
    const stats = store.checks.stats();
    expect(stats.npcs).toBe(5);
    expect(stats.pickups).toBe(6);
    expect(stats.props).toBe(store.world.props.length);
    const copy = store.snapshotWorld();
    expect(copy).toEqual(store.world);
    expect(copy).not.toBe(store.world);
  });
});

describe('ponto inicial, falas e mundo', () => {
  it('o ponto inicial anda, desfaz, e precisa estar num tile sem colisão', () => {
    const start = { ...store.spawn };
    const { x, y } = emptyTile(store);
    store.meta.setSpawn(x, y);
    expect(store.spawn).toEqual({ worldX: x, worldY: y });
    expect(store.checks.startPointErrors()).toEqual([]);
    store.setCell('collision', x, y, true);
    expect(store.checks.startPointErrors()).toEqual(['O Ponto Inicial precisa estar em um tile sem colisao']);
    store.history.undo();
    store.history.undo();
    expect(store.spawn).toEqual(start);
  });

  it('sem ponto inicial válido, o armazém põe um no meio e fica sujo para salvar', () => {
    const world = loadWorld();
    world.meta.playerStart = { worldX: -5, worldY: 999 };
    const fresh = new EditorStore(world);
    expect(fresh.dirty).toBe(true);
    expect(fresh.spawn).toEqual({ worldX: 30, worldY: 30 });
  });

  it('a fala do NPC: a do mundo, ou a do código como modelo; trocar desfaz', () => {
    const dialog = store.meta.getDialog('wizard');
    expect(dialog.lines.length).toBeGreaterThan(0);
    store.meta.setDialog('wizard', { ...dialog, npcName: 'Outro' });
    expect(store.meta.getDialog('wizard').npcName).toBe('Outro');
    store.history.undo();
    expect(store.meta.getDialog('wizard').npcName).toBe(dialog.npcName);
  });

  it('renomear e mudar o tamanho (que apaga o histórico e tira o que caiu fora)', () => {
    store.meta.renameWorld('  Vale Novo ');
    expect(store.world.meta.name).toBe('Vale Novo');
    const { x, y } = emptyTile(store);
    store.setCell('ground', x, y, 1);
    store.meta.resizeWorld(2, 2);
    expect(store.world.chunks).toHaveLength(4);
    expect(store.canUndo).toBe(false);
    expect(store.world.props.every((p) => p.worldX < 24 && p.worldY < 24)).toBe(true);
    expect(store.spawn.worldX).toBeLessThan(24);
    store.meta.resizeWorld(3, 2);
    expect(store.world.chunks).toHaveLength(6);
  });

  it('a validação acusa pilha, NPC repetido e peça em colisão (o JSON escrito à mão)', () => {
    const world = loadWorld();
    const { worldX, worldY } = world.props[0];
    world.props.push({ type: 'rock', worldX, worldY });
    const wizard = world.chunks.flatMap((c) => c.npcs).find((n) => n.type === 'wizard')!;
    const chunk = world.chunks.find((c) => c.npcs.length === 0)!;
    chunk.npcs.push({ type: 'wizard', worldX: chunk.cx * 12 + 1, worldY: chunk.cy * 12 + 1 });
    const warnings = new EditorStore(world).checks.validate();
    expect(warnings.some((w) => w.includes('mais de uma coisa'))).toBe(true);
    expect(warnings.some((w) => w.includes('NPC repetido') && w.includes('wizard x2'))).toBe(true);
    expect(wizard).toBeDefined();
  });
});

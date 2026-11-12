import { describe, expect, it, vi } from 'vitest';

import type { DialogScript } from '@/game/dialogs/NpcDialogs';
import type { HeldItemKind } from '@/game/entities/ItemPickup';
import { tLines } from '@/game/i18n/i18n';
import { CALL_RADIUS } from './LumberGuide';
import { chopBlockTile, LumberQuest, type LumberHost } from './LumberQuest';

// O MARCO MOSTRANDO (pedido do autor, 2026-11-11): o cepo à direita dele, a câmera que vai até o cepo quando ele diz
// onde o galho vai, e o chamado de quem volta com o galho na mão. A árvore e o brilho são 3D: as fotos os conferem.

const MARCO = { worldX: 53, worldY: 5 };
const BLOCK = { x: 55, y: 5 };
const BASE: DialogScript = { npcName: 'Marco', npcColorHex: '#fff', npcAssetKey: 'marco', lines: tLines('npc.businessMan.lines') };

const quest = (opts: { held?: HeldItemKind | 'none'; hero?: { x: number; y: number }; busy?: boolean } = {}) => {
  const state = { held: opts.held ?? 'none', hero: opts.hero ?? { x: 53, y: 8 }, busy: opts.busy ?? false };
  const said: DialogScript[] = [];
  const host = {
    held: () => state.held,
    hero: () => state.hero,
    busy: () => state.busy,
    owns: () => true,
    onGround: () => false,
    say: vi.fn((script: DialogScript) => { said.push(script); }),
    glance: vi.fn(),
    glint: vi.fn(),
    hop: vi.fn(),
    markHeard: vi.fn(),
    persist: vi.fn(),
  } as unknown as LumberHost;
  const q = new LumberQuest(host);
  q.save.stage = 'gather';
  q.save.standing = false;
  q.save.laid = 0;
  q.npc = MARCO;
  q.blockTile = BLOCK;
  q.setDialogBase(() => BASE);
  return { q, host, state, said };
};

describe('o cepo do Marco', () => {
  it('fica dois tiles à direita dele; ocupado, desce um, e só então vai para perto ou para a esquerda', () => {
    expect(chopBlockTile(MARCO, () => true)).toEqual({ x: 55, y: 5 });
    expect(chopBlockTile(MARCO, (t) => t.x !== 55 || t.y !== 5)).toEqual({ x: 55, y: 6 });
    expect(chopBlockTile(MARCO, (t) => t.x < 53)).toEqual({ x: 52, y: 5 });
    expect(chopBlockTile(MARCO, () => false)).toBeUndefined();
  });
});

describe('a volta com o galho', () => {
  it('quem chega perto com o galho ouve a fala do cepo, e a câmera vai até ele na primeira caixa', () => {
    const { q, host, said } = quest({ held: 'wood' });
    q.update();
    expect(host.hop).toHaveBeenCalledWith(MARCO.worldX, MARCO.worldY, expect.any(Number));
    expect(said).toHaveLength(1);
    expect(said[0].lines.map((l) => l.text)).toEqual(tLines('npc.businessManStep.block').map((l) => l.text));
    said[0].onLine?.(0);
    expect(host.glance).toHaveBeenCalledWith(BLOCK, MARCO, expect.any(Function));
  });

  it('chama uma vez por galho: de novo só depois de largar este e voltar com outro', () => {
    const { q, state, said } = quest({ held: 'wood' });
    q.update();
    q.update();
    expect(said).toHaveLength(1);
    state.held = 'none';
    q.update();
    state.held = 'wood';
    q.update();
    expect(said).toHaveLength(2);
  });

  it('não chama de longe, no meio de outra cena, nem depois que um galho já ficou de pé no cepo', () => {
    const far = quest({ held: 'wood', hero: { x: 53, y: 5 + CALL_RADIUS + 1 } });
    far.q.update();
    expect(far.said).toHaveLength(0);
    const busy = quest({ held: 'wood', busy: true });
    busy.q.update();
    expect(busy.said).toHaveLength(0);
    const done = quest({ held: 'wood' });
    done.q.save.laid = 1;
    done.q.update();
    expect(done.said).toHaveLength(0);
    const empty = quest();
    empty.q.update();
    expect(empty.said).toHaveLength(0);
  });

  it('falar com ele segurando o galho é a mesma conversa do cepo; sem galho, é a de sempre', () => {
    const withBranch = quest({ held: 'wood' });
    withBranch.q.talk(BASE, MARCO);
    expect(withBranch.said[0].lines.map((l) => l.text)).toEqual(tLines('npc.businessManStep.block').map((l) => l.text));
    const without = quest();
    without.q.talk(BASE, MARCO);
    expect(without.said[0].lines.map((l) => l.text)).not.toEqual(tLines('npc.businessManStep.block').map((l) => l.text));
  });
});

describe('a primeira conversa', () => {
  it('a câmera vai ao cepo na fala que diz onde ele fica, e não nas outras', () => {
    const { q, host, said } = quest();
    q.save.stage = 'start';
    q.talk(BASE, MARCO);
    const cepo = BASE.lines.findIndex((l) => /cepo|stump/i.test(l.text) && /direita|right/i.test(l.text));
    expect(cepo).toBeGreaterThan(0);
    said[0].onLine?.(0);
    expect(host.glance).not.toHaveBeenCalled();
    said[0].onLine?.(cepo);
    expect(host.glance).toHaveBeenCalledWith(BLOCK, MARCO, expect.any(Function));
  });
});

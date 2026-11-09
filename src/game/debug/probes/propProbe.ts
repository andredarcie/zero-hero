// AS PEÇAS DO MAPA (scenes/game/PropLists): onde está cada uma e o estado que um cenário confere — a pedra rachando,
// a árvore seca caindo, o forno aceso, a bigorna carregada, o canteiro, a fogueira.

import { lavaLightScales } from '@/game/objects/LavaObject';
import type { WorldProp } from '@/game/objects/WorldProp';
import type { PropLists } from '@/game/scenes/game/PropLists';
import type { GameScene } from '@/game/scenes/GameScene';

/** As listas de peças do mapa (as que guardam peças com tile). */
export type PropListName = { [K in keyof PropLists]: PropLists[K] extends WorldProp[] ? K : never }[keyof PropLists];

const at = <T extends WorldProp>(list: readonly T[], x: number, y: number): T | undefined => list.find((p) => p.worldX === x && p.worldY === y);

export const propProbe = (s: GameScene) => ({
  /** Onde estão as peças de uma lista e se cada uma bloqueia agora. */
  tiles: (name: PropListName) => (s.props[name] as WorldProp[]).map((p) => ({ x: p.worldX, y: p.worldY, blocking: p.blocking ?? false })),
  /** Há uma peça de `name` bloqueando (x, y)? */
  blockingAt: (name: PropListName, x: number, y: number): boolean => Boolean(at(s.props[name] as WorldProp[], x, y)?.blocking),

  rocks: () => s.props.rocks.map((r) => ({
    x: r.worldX, y: r.worldY, ore: r.ore, product: r.product, blocking: r.blocking, texKey: r['sprite'].texKey, frame: r['sprite'].frame,
  })),
  dryTrees: () => s.props.dryTrees.map((t) => ({ x: t.worldX, y: t.worldY, blocking: t.blocking, stage: t['stage'] })),
  dryBushes: () => s.props.dryBushes.map((b) => ({ x: b.worldX, y: b.worldY, blocking: b.blocking, ash: b.isAsh, burning: b.isBurning })),
  campfires: () => s.props.campfires.map((f) => ({ x: f.worldX, y: f.worldY, lit: f.isLit, full: f.isFullyLit })),
  hearths: () => s.props.hearths.map((f) => ({ x: f.worldX, y: f.worldY, lit: f.isLit })),
  furnaces: () => s.props.furnaces.map((f) => ({
    x: f.worldX, y: f.worldY, kindled: f.kindled, playerBuilt: f.playerBuilt, busy: f.isBusy, smelted: f.smeltCount,
  })),
  altars: () => s.props.altars.map((a) => ({
    x: a.worldX, y: a.worldY, playerBuilt: a.playerBuilt, carrying: a.carrying, blows: a.blowsLanded, forged: a.forgeCount,
  })),
  plantSpots: () => s.props.plantSpots.map((p) => ({ x: p.worldX, y: p.worldY, state: p.currentState })),
  toolboxes: () => s.props.toolboxes.map((b) => ({ x: b.worldX, y: b.worldY, busy: b.isBusy })),

  /** A luz de cada tile de lava (o lago inteiro não pode somar mais luz que alguns tiles soltos). */
  lavaLight: () => {
    const tiles = s.props.lavaTiles.map((l) => ({ worldX: l.worldX, worldY: l.worldY }));
    const scales = lavaLightScales(tiles);
    return tiles.map((t, i) => ({ x: t.worldX, y: t.worldY, scale: scales[i] }));
  },
});

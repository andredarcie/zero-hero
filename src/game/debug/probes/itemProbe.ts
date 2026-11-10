// AS COISAS: o que está na mão, o que está no chão, e a cerimônia de "você ganhou". As ações passam pelos mesmos
// caminhos do jogo (pegar, pousar, largar perto de um vizinho); só `hold` é porta de autoria, sem tocar no mundo.

import type { HeldItemKind } from '@/game/entities/ItemPickup';
import type { GameScene } from '@/game/scenes/GameScene';

export const itemProbe = (s: GameScene) => {
  let itemGetClosed = true;
  return {
    /** O que está na mão agora ('none' = mãos vazias). */
    held: (): string => s.heldItem,
    /** AUTORIA: deixa `kind` na mão sem pôr nem tirar nada do mundo ('none' esvazia a mão). */
    hold: (kind: HeldItemKind | 'none'): void => {
      // A porta de autoria da cena é um setter privado de propósito: só o debug escreve por ela.
      s['heldItem'] = kind;
    },
    /** Pega `kind` como o jogo pega (material sobre material: o da mão vai para o chão; ferramenta é guardada). */
    take: (kind: HeldItemKind, units = 1): void => s.hand.takeIntoHand(kind, units),
    /** É dele: nas costas ou entre as ferramentas guardadas. */
    owns: (kind: HeldItemKind): boolean => s.inventory.owns(kind),
    /** As ferramentas guardadas, fora das costas. */
    kept: (): string[] => s.inventory.keptTools(),
    /** O verbo que uma ferramenta guardada daria no tile da frente ('hand' = Z, 'use' = X), e qual ferramenta. */
    toolVerb: (button: 'hand' | 'use') => {
      const f = s.verbs.facingTile();
      return s.verbs.toolFor(f.x, f.y, button);
    },
    /** O herói apanha `kind` do chão onde está, pelo caminho do jogo (a cerimônia da primeira vez inclusa). */
    collect: (kind: HeldItemKind): void => s.hand.onCollectItem({ kind, worldX: s.playerWorld.worldX, worldY: s.playerWorld.worldY }),
    /** Esvazia a mão (o item some, não cai). */
    clear: (): void => s.hand.clearHeldItem(),
    /** Pousa o que está na mão no tile (x, y), como o Z faz. */
    place: (x: number, y: number): boolean => s.hand.placeItemAt(x, y),
    /** Quantos de `kind` a mão carrega. */
    count: (kind: HeldItemKind): number => s.inventory.count(kind),
    /** Marca `kind` como já visto: pegá-lo de novo não abre a cerimônia. */
    markSeen: (kind: HeldItemKind): void => { s.seenItems.add(kind); },

    /** Tudo o que está no chão do mundo. */
    ground: () => s.itemManager?.snapshot() ?? [],
    /** Põe `kind` no chão em (x, y) direto, sem a regra da frente dos vizinhos (como um save antigo faria). */
    drop: (kind: HeldItemKind, x: number, y: number, units?: number): void => s.itemManager?.drop(kind, x, y, undefined, units),
    /** Larga `kind` em (x, y) pela regra do jogo (desvia da frente de um vizinho). */
    dropByRule: (kind: HeldItemKind, x: number, y: number) => s.groundItems.dropItem(kind, x, y),
    kindAt: (x: number, y: number): string | null => s.itemManager?.kindAt(x, y) ?? null,
    hasAt: (x: number, y: number): boolean => s.itemManager?.hasItemAt(x, y) ?? false,
    takeAt: (x: number, y: number) => s.itemManager?.takeAt(x, y) ?? null,
    /** Os tiles dos vizinhos (a frente de cada um é proibida para item). */
    npcTiles: () => s.groundItems['npcTiles']().map((n) => ({ x: n.worldX, y: n.worldY })),
    /** Tira da frente dos vizinhos o que estiver lá; devolve quantos moveu. */
    enforceNpcFrontRule: (): number => s.groundItems.enforceNpcFrontRule(),

    /** Abre a cerimônia de "você ganhou `kind`"; `itemGetClosed` diz quando ela fechou. */
    showItemGet: (kind: HeldItemKind): void => {
      itemGetClosed = false;
      s.hand.showItemGet(kind, () => { itemGetClosed = true; });
    },
    itemGetClosed: (): boolean => itemGetClosed,
    /** O cartão da cerimônia: os textos, a opacidade do véu e os modos de mistura das imagens. */
    itemGetCard: () => {
      const objs = s.hand.itemGetOverlay?.['objs'] ?? [];
      const of = <T>(type: string): T[] => objs.filter((o) => o.type === type) as unknown as T[];
      return {
        open: s.hand.itemGetOpen,
        texts: of<{ text: string }>('Text').map((o) => o.text),
        veilAlpha: of<{ fillAlpha: number }>('Rectangle')[0]?.fillAlpha ?? null,
        imageBlends: of<{ blendMode: number | string }>('Image').map((o) => o.blendMode),
      };
    },
  };
};

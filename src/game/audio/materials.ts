import type { HeldItemKind } from '@/game/entities/ItemPickup';

// A REGRA DO SOM: cada coisa soa pelo que ela É, e isto é o único lugar que diz o que ela é. Pegar, pousar e
// pisar leem daqui, e o SoundManager só sabe tocar um material, nunca um item. Coisa nova entra com uma linha.
// As peças que importam não passam por esta tabela: têm voz própria (playSwordHum, playHearthCatch,
// playFindTouch), para nunca soarem como um graveto qualquer.

export type Material = 'wood' | 'stone' | 'metal' | 'soft' | 'glass';
export type Surface = 'grass' | 'dirt' | 'stone' | 'wood';

const BY_ITEM: Partial<Record<HeldItemKind, Material>> = {
  wood: 'wood', stool: 'wood', altar: 'stone',
  stone: 'stone', ore: 'stone', bloom: 'stone', charcoal: 'stone', furnace: 'stone', flowerPot: 'stone', sand: 'stone', ash: 'soft',
  iron: 'metal', axe: 'metal', pickaxe: 'metal', scythe: 'metal', knife: 'metal', sword: 'metal', key: 'metal', shovel: 'metal', lantern: 'metal', bucket: 'metal', bucketFull: 'metal',
  glass: 'glass',
};

/** O que não está na tabela é mole: cogumelo, semente, tinta, flor. */
export const materialOf = (kind: HeldItemKind): Material => BY_ITEM[kind] ?? 'soft';

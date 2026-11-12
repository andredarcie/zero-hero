// A COLHEITA DE COGUMELOS (scenes/game/ForagingWork) e os BALÕES DO HERÓI (BodyBumps): o mini-game aberto, legível
// quadro a quadro (a faca, a zona do corte, a terra ainda grudada), a cesta, os cogumelinhos-filhos, o aceno do Shui e
// o balão de pensamento que aponta onde achar uma ferramenta.

import type { HeldItemKind } from '@/game/entities/ItemPickup';
import { adventureState } from '@/game/runtime/adventureState';
import type { MushroomKind } from '@/game/fungi/fungi';
import type { GameScene } from '@/game/scenes/GameScene';

type Stage = Parameters<NonNullable<GameScene['forage']['foraging']>['enter']>[0];

export const forageProbe = (s: GameScene) => ({
  /** Abre a colheita do cogumelo de (x, y), como o Z com a faca na mão. */
  harvestAt: (x: number, y: number): boolean => s.forage.harvestMushroomAt(x, y),
  /** O cogumelo entra na cesta (o fim da colheita), sem jogar o mini-game. */
  basket: (kind: MushroomKind, x: number, y: number): void => s.forage['basketMushroom'](kind, x, y),
  /**
   * O mini-game aberto: a etapa, a faca e a zona do corte, a escala do desenho, a primeira célula de terra ainda
   * suja, e onde fica na página o canto do desenho (para o mouse esfregar a bucha no lugar certo).
   */
  overlay: () => {
    const o = s.forage.foraging;
    if (!o) return null;
    const cs = Math.sqrt(o.dirt.length);
    const dirty = o.dirt.findIndex((c) => c);
    const origin = o.screen.origin();
    const dpr = o.canvas.width / Math.max(1, o.root.clientWidth);
    return {
      stage: o.stage,
      knifeY: o.knifeY, zoneTop: o.zoneTop, zoneBottom: o.zoneBottom,
      scale: o.scale,
      nextDirt: dirty < 0 ? null : { x: dirty % cs, y: Math.floor(dirty / cs) },
      /** Converte um ponto do desenho (em px da arte) para a página (px CSS). */
      page: { originX: origin.x / dpr, originY: origin.y / dpr, unit: o.scale / dpr },
    };
  },
  /** Pula o mini-game aberto para uma etapa ('clean', 'note'...). */
  enter: (stage: Stage): void => s.forage.foraging?.enter(stage),
  close: (): void => s.forage.foraging?.destroy(),

  /** Quantos cogumelinhos-filhos de `kind` nasceram em volta do pai. */
  kin: (kind: MushroomKind): number => s.forage.mushroomKin?.count(kind) ?? 0,
  /** O brilho de noite de `kind` agora (0 dia ou colhido, 1 noite fechada; objects/MushroomGlow). */
  glow: (kind: MushroomKind): number => s.forage.mushroomGlow?.level(kind) ?? 0,
  /** A cesta voando para as costas do herói (a cerimônia de guardar): existe, e se está andando. */
  bagStashOpen: (): boolean => s.forage.bagStash !== undefined,
  bagStashActive: (): boolean => s.forage.bagStash?.active === true,
  /** Põe `kind` na cesta da aventura (como se tivesse sido colhido antes). */
  addToBasket: (kind: MushroomKind): void => { adventureState().basket.push(kind); },
  /** O aceno da Shui: existe, e se está acenando agora. (`resetShuiWave` deixa ela acenar de novo.) */
  shuiWaveOpen: (): boolean => s.forage.shuiWave !== undefined,
  shuiWaving: (): boolean => s.forage.shuiWave?.active === true,
  resetShuiWave: (): void => { s.forage.shuiWaved = false; },

  /** O balão de pensamento do herói: o ícone que mostra e para onde a pontinha aponta. */
  thought: () => ({ icon: s.bumps.heroThought?.visibleIcon ?? null, pointing: s.bumps.heroThought?.pointing ?? null }),
  /** O herói esbarra no que precisa de uma ferramenta em (x, y): o balão aparece. */
  thinkOfNeed: (x: number, y: number): void => s.bumps.thinkOfNeed(x, y, true),
  /** De onde vem a ferramenta única `kind` (o tile para onde o balão aponta), ou null. */
  toolSource: (kind: HeldItemKind): { x: number; y: number } | null => s.bumps['uniqueItemSource'](kind),
});

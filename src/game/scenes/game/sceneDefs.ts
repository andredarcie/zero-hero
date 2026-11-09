// O QUE MAIS DE UMA PEÇA DA CENA USA: o nome da cena, os visuais dos itens (na mão, nas costas, os fungos), o feitio
// comum dos efeitos de uma vez só, as direções, os tempos da abertura e as falas de quest que mais de uma conversa
// abre. Cada peça (scenes/game/) importa daqui em vez de uma da outra.

import { ASSET_KEYS, KEY_FRAMES } from '@/game/constants';
import { type HeldItemKind } from '@/game/entities/ItemPickup';
import { KNIFE_TEXTURE_KEY, MUSHROOM_KINDS, fungusTextureKey, type MushroomKind } from '@/game/fungi/fungi';
import { ASH_TEXTURE, GLASS_TEXTURE, SAND_TEXTURE, TELESCOPE_ITEM_TEXTURE } from '@/game/render3d/skyTextures';
import { SPLIT_WOOD_TEXTURE } from '@/game/render3d/woodTextures';
import { BRUSH_TEXTURE, DYE_BUNDLE_TEXTURE, DYE_SEEDS_TEXTURE } from '@/game/render3d/paintTextures';

// Os seis fungos usam a MESMA arte de 16px em toda parte (chão, costas, bolsa, item-get) — ela é
// gerada no boot por registerFungiTextures, nas duas pipelines, sob a mesma chave.
export const FUNGUS_VISUALS = Object.fromEntries(
  MUSHROOM_KINDS.map((kind) => [kind, { texture: fungusTextureKey(kind), frame: 0 }]),
) as Record<MushroomKind, { texture: string; frame: number }>;

// The per-item 2D art (2D texture atlas keys): the swing arc, the overhead chop and the
// death elegy's back item all draw from here. The 3D twin is BACK_ITEM_VISUAL_3D below.
export const ITEM_VISUAL_2D: Record<HeldItemKind, { texture: string; frame: number }> = {
  stool: { texture: 'valley-find-stool', frame: 0 },
  lantern: { texture: 'valley-find-lantern', frame: 0 },
  flowerPot: { texture: 'valley-find-flowerPot', frame: 0 },
  sword: { texture: ASSET_KEYS.swordItemIcon, frame: 0 },
  key: { texture: ASSET_KEYS.keyItem, frame: KEY_FRAMES.held },
  axe: { texture: ASSET_KEYS.axeIcon, frame: 0 },
  pickaxe: { texture: ASSET_KEYS.pickaxeIcon, frame: 0 },
  scythe: { texture: ASSET_KEYS.scytheIcon, frame: 0 },
  shovel: { texture: ASSET_KEYS.shovelIcon, frame: 0 },
  wood: { texture: ASSET_KEYS.woodIcon, frame: 0 },
  stone: { texture: ASSET_KEYS.rock, frame: 0 },
  iron: { texture: ASSET_KEYS.ironItem, frame: 0 },
  ore: { texture: ASSET_KEYS.oreItem, frame: 0 },
  bloom: { texture: ASSET_KEYS.bloomItem, frame: 0 },
  bucket: { texture: 'bucket-icon', frame: 0 },
  bucketFull: { texture: 'bucket-full-icon', frame: 0 },
  charcoal: { texture: 'charcoal-item', frame: 0 },
  furnace: { texture: ASSET_KEYS.furnace, frame: 0 },
  altar: { texture: ASSET_KEYS.altar, frame: 0 },
  knife: { texture: KNIFE_TEXTURE_KEY, frame: 0 },
  dyeSeeds: { texture: DYE_SEEDS_TEXTURE, frame: 0 },
  dyeBundle: { texture: DYE_BUNDLE_TEXTURE, frame: 0 },
  brush: { texture: BRUSH_TEXTURE, frame: 0 },
  splitWood: { texture: SPLIT_WOOD_TEXTURE, frame: 0 },
  sand: { texture: SAND_TEXTURE, frame: 0 },
  ash: { texture: ASH_TEXTURE, frame: 0 },
  glass: { texture: GLASS_TEXTURE, frame: 0 },
  telescope: { texture: TELESCOPE_ITEM_TEXTURE, frame: 0 },
  ...FUNGUS_VISUALS,
};

// The same per-item art resolved through the 3D texture registry (textures3d keys),
// for the back-item billboard that rides the hero in the world.
export const BACK_ITEM_VISUAL_3D: Record<HeldItemKind, { texture: string; frame: number }> = {
  stool: { texture: 'valley-find-stool', frame: 0 },
  lantern: { texture: 'valley-find-lantern', frame: 0 },
  flowerPot: { texture: 'valley-find-flowerPot', frame: 0 },
  sword: { texture: 'sword-icon', frame: 0 },
  key: { texture: 'key-item', frame: KEY_FRAMES.held },
  axe: { texture: 'axe-icon', frame: 0 },
  pickaxe: { texture: 'pickaxe-icon', frame: 0 },
  scythe: { texture: 'scythe-icon', frame: 0 },
  shovel: { texture: 'shovel-icon', frame: 0 },
  wood: { texture: 'wood-icon', frame: 0 },
  stone: { texture: 'rock', frame: 0 },
  iron: { texture: 'iron-item', frame: 0 },
  ore: { texture: 'ore-item', frame: 0 },
  bloom: { texture: 'bloom-item', frame: 0 },
  bucket: { texture: 'bucket-icon', frame: 0 },
  bucketFull: { texture: 'bucket-full-icon', frame: 0 },
  charcoal: { texture: 'charcoal-item', frame: 0 },
  furnace: { texture: 'furnace', frame: 0 },
  altar: { texture: 'altar', frame: 0 },
  knife: { texture: KNIFE_TEXTURE_KEY, frame: 0 },
  dyeSeeds: { texture: DYE_SEEDS_TEXTURE, frame: 0 },
  dyeBundle: { texture: DYE_BUNDLE_TEXTURE, frame: 0 },
  brush: { texture: BRUSH_TEXTURE, frame: 0 },
  splitWood: { texture: SPLIT_WOOD_TEXTURE, frame: 0 },
  sand: { texture: SAND_TEXTURE, frame: 0 },
  ash: { texture: ASH_TEXTURE, frame: 0 },
  glass: { texture: GLASS_TEXTURE, frame: 0 },
  telescope: { texture: TELESCOPE_ITEM_TEXTURE, frame: 0 },
  ...FUNGUS_VISUALS,
};

// The flame on the torch's tip: the same little fire that burns on a lit bush, cycling at a
// deliberately coarse cadence — the frame flip IS the animation, there is no smooth sway.
export const TORCH_FLAME_KEYS = ['tiny-fire-0', 'tiny-fire-1', 'tiny-fire-2'] as const;

// What every one-shot FX billboard shares: it hangs around its point (centred), the night fog
// never touches it, and it never writes depth — see Billboard3D for why each of those matters
// to a translucent particle.
export const FX_BILLBOARD = { centered: true, fog: false, depthWrite: false } as const;

// ── OS DOIS BOTOES ───────────────────────────────────────────────────────────
//
// Este jogo nao tem combate: nao ha inimigo, nao ha dano e nao ha morte. Os dois botoes sao
// gestos de MAO, nunca de briga:
//
//   Z  →  FALAR com quem esta na frente, abrir o catalogo da bancada, pousar a peca no altar,
//         acender e cuidar da fogueira do fim. Nada no Z saca lamina — a espada ficou fincada na
//         entrada do vale (ver playIntro).
//   X  →  o item escolhido na bolsa, no tile a frente: o machado na arvore seca, a picareta na
//         pedra, o balde no rio, a semente no buraco.
/** O X tem cadencia: usar uma ferramenta e um gesto, nao uma metralhadora. */
export const USE_COOLDOWN_MS = 300;

/**
 * A altura do CENTRO da espada fincada (o billboard e centrado e mede um tile): 0,22 deixa um
 * pouco de ponta dentro da terra, que o chao esconde.
 */
export const SWORD_PLANTED_ELEV = 0.36;

// The 4 grid moves a walking entity has (fire spread steps by these).
export const CARDINAL_DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
];

// ── A ABERTURA E O FIM ───────────────────────────────────────────────────────
/** A hora em que a abertura e o fim acontecem: dez da noite, a hora dos vaga-lumes. */
export const INTRO_CLOCK = 0.92;

/** O roteiro da Shui, a coletora: é ela quem guarda a faca e recebe os cogumelos. */
export const FORAGER_DIALOG = 'radiationSuit';

/** O roteiro da Sisi: a quest dela é em etapas (ver quests/PainterQuest). */
export const PAINTER_DIALOG = 'painter';

/** O roteiro do Marco: a quest dele também é em etapas (ver quests/LumberQuest). */
export const LUMBER_DIALOG = 'businessMan';

/** O roteiro da Thea: em etapas também (ver quests/AstronomerQuest). */
export const SKY_DIALOG = 'astronaut';

/** Quantos tiles o cavaleiro anda pela estrada antes de parar. */
export const INTRO_WALK_TILES = 3;

/** O recado que a cena deixa para si mesma ao reiniciar: quem pulou ainda ouve o mago. */
export const OPENING_TALK_KEY = 'openingTalkPending';

export const BUTTERFLY_TINTS = [0xb0a890, 0xb0a070, 0x8a9cb0, 0xb09080, 0xa8a4b0] as const;

/** Três pixels de arte de largura, na densidade do chão. */
export const BUTTERFLY_SIZE = 3 / 16;

export const BUTTERFLY_ASPECT = 2 / 3;

/** O nome da cena do jogo no motor (GameScene.key). */
export const GAME_SCENE_KEY = 'game';

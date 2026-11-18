import { DECOR_PAINTERS } from '@/game/render3d/findArt';
import { HOME_DECOR_PAINTERS, sign, tub } from '@/game/render3d/homeArt';
import { paintedCanvas } from '@/game/render3d/homeTextures';
import type { Paint } from '@/game/render3d/pixelForms';
import { campPainter, type CampArtPiece } from '@/game/objects/HeroCamp';
import type { HomePieceKind } from '@/game/objects/homeBuilds';
import { adventureState } from '@/game/runtime/adventureState';

/**
 * O DESENHO DE CADA PEÇA DO LAR NA TÁBUA DO MODO DE CONSTRUÇÃO (runtime/BuildOverlay): o mesmo desenho que vai ao mundo,
 * em 16 px, como imagem (a tábua o amplia com o pixel inteiro). A tina mostra a tinta da capa, como no mundo.
 */

const CAMP_ART: ReadonlySet<string> = new Set<CampArtPiece>(['log', 'rack', 'easel', 'woodpile', 'chart']);
const cache = new Map<string, string>();

const painterOf = (kind: HomePieceKind): ((rect: Paint) => void) => {
  if (CAMP_ART.has(kind)) return campPainter(kind as CampArtPiece);
  if (kind === 'tub') return tub(adventureState().home.cape);
  if (kind === 'sign') return sign(true);
  if (kind === 'lantern') return DECOR_PAINTERS[kind];
  return HOME_DECOR_PAINTERS[kind as keyof typeof HOME_DECOR_PAINTERS];
};

export const pieceIcon = (kind: HomePieceKind): string => {
  const key = kind === 'tub' ? `tub:${adventureState().home.cape}` : kind;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let url = '';
  try {
    url = paintedCanvas(painterOf(kind), 16, 16).toDataURL();
  } catch {
    url = '';
  }
  cache.set(key, url);
  return url;
};

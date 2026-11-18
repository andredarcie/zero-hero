import type { HeldItemKind } from '@/game/entities/ItemPickup';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { registerHomeArt, signTexture, tubTexture } from '@/game/render3d/homeArt';
import { world3d } from '@/game/render3d/World3D';
import { adventureState, type HomePieceSave } from '@/game/runtime/adventureState';
import { CAMP_TINT, campTexture, registerCampArt, type CampArtPiece } from './HeroCamp';
import { DecorLife, LIVING_DECOR } from './DecorLife';
import { SEAT_BEHIND } from './ValleyFinds';
import type { HomePieceKind } from './homeBuilds';

/**
 * AS PEÇAS QUE O JOGADOR PÔS NO ACAMPAMENTO (objects/homeBuilds; o modo de construção, scenes/game/BuildMode): o
 * tronco, a tina, a placa, os enfeites e as lembranças dos pedidos, cada uma no tile que ele escolheu. O save é a
 * lista (`adventureState().home.pieces`); aqui mora o desenho dela no mundo, a pergunta "o que há neste tile", e a vida
 * dos enfeites que mudam sozinhos (a lanterna que acende, o sino que balança, o vaso da estação: objects/DecorLife).
 * Toda peça é sólida, como as do acampamento e os achados do vale.
 */

const CAMP_ART: ReadonlySet<string> = new Set<CampArtPiece>(['log', 'rack', 'easel', 'woodpile', 'chart']);
const SHADOW = { rx: 0.42, rz: 0.2, alpha: 0.3 };
/**
 * O QUE É DE SENTAR, e a ALTURA do assento em tiles (pedido do autor, 2026-11-17: "o herói fica atrás do tronco, assim
 * não parece que ele está sentado"). O herói sobe no tile da peça para sentar, e o corpo dele fica NESTE tile — o móvel
 * fica um nada atrás (`SEAT_BEHIND`, o mesmo dos bancos do vale); no mesmo plano, o tronco ganhava dele. E o corpo SOBE
 * no assento (`hero.lift`, como na pedra de meditar): o tampo do tronco fica 7 px acima do chão (render3d/campArt LOG),
 * e com o corpo achatado do sentar, 4 px põem o quadril no tampo — o tronco aparece embaixo e dos lados dele. Sem
 * subir, o herói cobria o tronco inteiro e parecia de pé no capim.
 */
export const CAMP_SEAT_LIFT: Readonly<Partial<Record<HomePieceKind, number>>> = { log: 4 / 16 };

/** A textura de cada peça no mundo (a tina e a placa mudam com o lar: a cor da última tinta, o nome escrito). */
export const pieceTexture = (kind: HomePieceKind): string => {
  if (CAMP_ART.has(kind)) return campTexture(kind as CampArtPiece);
  const home = adventureState().home;
  if (kind === 'tub') return tubTexture(home.cape);
  if (kind === 'sign') return signTexture(home.name !== '');
  return `valley-find-${kind}`;
};

interface PlacedPiece {
  kind: HomePieceKind;
  x: number;
  y: number;
  body: Billboard3D;
  life?: DecorLife;
}

export class CampPieces {
  private readonly pieces: PlacedPiece[] = [];

  public constructor() {
    registerCampArt();
    registerHomeArt();
    for (const p of adventureState().home.pieces) this.spawn(p);
  }

  /** A peça deste tile, ou nada. */
  public at(x: number, y: number): HomePieceKind | null {
    return this.pieces.find((p) => p.x === x && p.y === y)?.kind ?? null;
  }

  /** Quantas desta peça estão no acampamento. */
  public count(kind: HomePieceKind): number {
    return this.pieces.filter((p) => p.kind === kind).length;
  }

  /** Onde estão (a cópia: o save é a fonte). */
  public get list(): ReadonlyArray<{ kind: HomePieceKind; x: number; y: number }> {
    return this.pieces.map(({ kind, x, y }) => ({ kind, x, y }));
  }

  /** Põe uma peça no tile e no save. */
  public add(kind: HomePieceKind, x: number, y: number): void {
    if (this.at(x, y)) return;
    const save: HomePieceSave = { kind, x, y };
    adventureState().home.pieces.push(save);
    this.spawn(save);
  }

  /** Tira a peça do tile (e do save); devolve qual era. */
  public remove(x: number, y: number): HomePieceKind | null {
    const i = this.pieces.findIndex((p) => p.x === x && p.y === y);
    if (i < 0) return null;
    const [gone] = this.pieces.splice(i, 1);
    gone.life?.destroy();
    gone.body.destroy();
    const home = adventureState().home;
    home.pieces = home.pieces.filter((p) => !(p.x === x && p.y === y));
    return gone.kind;
  }

  /** A tina e a placa acompanham o lar (a tinta da capa, o nome escrito). */
  public refreshLook(): void {
    for (const p of this.pieces) if (p.kind === 'tub' || p.kind === 'sign') p.body.setTexture(pieceTexture(p.kind), 0);
  }

  /** A vida dos enfeites (a cena chama a cada quadro do mundo andando). */
  public render(nowMs: number): void {
    for (const p of this.pieces) p.life?.render(nowMs, 1);
  }

  public destroy(): void {
    for (const p of this.pieces) {
      p.life?.destroy();
      p.body.destroy();
    }
    this.pieces.length = 0;
  }

  private spawn(save: HomePieceSave): void {
    const { kind, x, y } = save;
    const lantern = kind === 'lantern';
    const body = world3d().objects.addBillboard(pieceTexture(kind), 0, lantern ? { groundShadow: SHADOW, emissive: true } : { groundShadow: SHADOW })
      .setDisplaySize(1, 1)
      .setPosition(x, CAMP_SEAT_LIFT[kind] === undefined ? y : y - SEAT_BEHIND);
    // O tom do acampamento (a luz do mundo estoura os claros); a lanterna acende, então fica no claro dela.
    if (!lantern) body.setTint(CAMP_TINT);
    const life = LIVING_DECOR.has(kind as HeldItemKind) ? new DecorLife(kind as HeldItemKind, body, x, y) : undefined;
    this.pieces.push({ kind, x, y, body, life });
  }
}

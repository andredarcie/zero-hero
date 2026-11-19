// AS RELÍQUIAS ENTERRADAS (relics/relics.ts): as trincas no chão do vale, a pá que cava nelas — de frente, com o golpe
// de sempre, ou de pé em cima, com a cavada no pé (ShovelStab) — e a coisa que pula do buraco, gira no ar e cai na mão
// do Zero. Depois vem a cerimônia de "você encontrou" e a página no caderno de campo. O buraco é tapado de novo: fica
// a terra revirada no lugar da trinca, e o save lembra (`found`, o mesmo registro do caderno).

import { getSoundManager } from '@/game/audio/SoundManager';
import { CHUNK_COLUMNS, CHUNK_ROWS } from '@/game/constants';
import { t } from '@/game/i18n/i18n';
import { GroundCracks } from '@/game/objects/GroundCracks';
import { RELIC_KINDS, RELIC_SPOTS, relicAt, type RelicKind } from '@/game/relics/relics';
import { WHITE_SAFE_TINT } from '@/game/render3d/pixelForms';
import { DUG_PATCH_TEXTURE, relicTexture, SAND_DUG_TEXTURE, SAND_HINT_TEXTURE } from '@/game/render3d/relicTextures';
import { adventureState } from '@/game/runtime/adventureState';
import type { GameScene } from '../GameScene';
import { ShovelStab } from './ShovelStab';

/** O que RelicDig usa de GameScene. */
export type RelicDigHost = Pick<GameScene,
  'actions' | 'adventure' | 'carry' | 'chunkManager' | 'cutsceneActive' | 'debris' | 'hand' | 'hero' | 'movementController'
  | 'playerWorld' | 'props' | 'query' | 'save' | 'sparkle' | 'steps' | 'swing' | 'time' | 'tweens' | 'world3d'
>;

/** Quantas pazadas até a coisa aparecer (de frente, o golpe de sempre; no pé, a cavada). */
const STROKES = 2;
const FRONT_SWING_MS = 300;
/**
 * O pulo: quanto sobe e o tamanho no ar (tiles). Pequeno de propósito: no alto ela fica mais perto da câmera e cresce
 * sozinha (com 1,15 e 1,9 ela tapava o herói e meia tela).
 */
const POP_HIGH = 1.45;
const POP_UP_MS = 430;
const POP_DOWN_MS = 360;
const POP_SIZE = 0.78;
/** Na mão: a altura do colo do herói, e o tamanho de uma coisa de mão. */
const HANDS = 0.9;
const HAND_SIZE = 0.62;

export class RelicDig {
  /** A cavada no pé, que a cova da Sisi também usa (ItemUseGround.digUnderfoot). */
  public readonly stab: ShovelStab;
  private cracks?: GroundCracks;
  private patches?: GroundCracks;
  /** Na areia da praia (o cartão de 2024): a pontinha do cartão no lugar da trinca, e a areia revirada depois. */
  private sandHints?: GroundCracks;
  private sandPatches?: GroundCracks;
  /** Do primeiro golpe até a cerimônia fechar: nada mais cava, e o herói não sai andando. */
  private busy = false;

  public constructor(private readonly host: RelicDigHost) {
    this.stab = new ShovelStab(host);
  }

  /** No boot (só na aventura): as trincas que ainda guardam alguma coisa, e a terra revirada das que já deram. */
  public build(): void {
    if (!this.host.adventure) return;
    const found = adventureState().found;
    const spots = (dug: boolean, sand: boolean): Array<{ x: number; y: number }> => RELIC_KINDS
      .filter((k) => found.has(k) === dug && this.onSand(RELIC_SPOTS[k]) === sand).map((k) => RELIC_SPOTS[k]);
    this.cracks = new GroundCracks(spots(false, false));
    this.patches = new GroundCracks(spots(true, false), DUG_PATCH_TEXTURE);
    this.sandHints = new GroundCracks(spots(false, true), SAND_HINT_TEXTURE);
    this.sandPatches = new GroundCracks(spots(true, true), SAND_DUG_TEXTURE);
  }

  private onSand(at: { x: number; y: number }): boolean {
    return this.host.query.isSandAt(at.x, at.y);
  }

  public destroy(): void {
    for (const g of [this.cracks, this.patches, this.sandHints, this.sandPatches]) g?.destroy();
    this.cracks = undefined;
    this.patches = undefined;
    this.sandHints = undefined;
    this.sandPatches = undefined;
    this.busy = false;
  }

  /** A relíquia que ainda está enterrada neste tile. */
  public buriedAt(x: number, y: number): RelicKind | undefined {
    if (!this.cracks) return undefined;
    const kind = relicAt(x, y);
    return kind && !adventureState().found.has(kind) ? kind : undefined;
  }

  /** Tem trinca de relíquia aqui? (o pensamento da pá, BodyBumps) */
  public isCrack(x: number, y: number): boolean {
    return this.buriedAt(x, y) !== undefined;
  }

  /**
   * A PÁ CAVARIA AQUI? A trinca de uma relíquia ainda enterrada, com o chão nu (nada em cima; de pé em cima dela,
   * `underfoot`, o próprio herói não conta) e nenhuma outra cavada no meio.
   */
  public canDigAt(x: number, y: number, underfoot = false): boolean {
    if (this.busy || !this.buriedAt(x, y)) return false;
    if (this.host.chunkManager?.hasChunkCoordinate(Math.floor(x / CHUNK_COLUMNS), Math.floor(y / CHUNK_ROWS)) !== true) return false;
    if (underfoot ? this.host.query.isTileTaken(x, y) : this.host.query.isTileOccupied(x, y)) return false;
    return !this.host.props.propRegistry.some((entry) => this.host.query.propAt(entry.list, x, y));
  }

  /** Cava a trinca de (x, y): de frente (o golpe da pá) ou de pé em cima dela (a cavada no pé). A pá guardada vem às costas. */
  public digAt(x: number, y: number, underfoot: boolean): boolean {
    const kind = this.buriedAt(x, y);
    if (!kind || !this.canDigAt(x, y, underfoot) || !this.host.swing.equip('shovel')) return false;
    this.busy = true;
    this.host.cutsceneActive = true;
    this.host.movementController?.interruptMovement(this.host.playerWorld.worldX, this.host.playerWorld.worldY);
    const bite = (stroke: number): void => {
      if (stroke > 0) return;
      // A primeira pazada abre a terra: a trinca some, fica a terra revirada (na praia, a areia revirada).
      this.cracks?.remove(x, y);
      this.sandHints?.remove(x, y);
      if (this.onSand({ x, y })) this.sandPatches?.add(x, y);
      else this.patches?.add(x, y);
    };
    if (underfoot) {
      this.stab.stab(x, y, STROKES, bite, () => this.pop(kind, x, y));
      return true;
    }
    for (let i = 0; i < STROKES; i += 1) {
      this.host.time.delayedCall(i * FRONT_SWING_MS, () => {
        this.host.swing.swingHeld(x, y);
        this.host.time.delayedCall(150, () => {
          getSoundManager().work.playGrassCut();
          this.host.debris.spawnDirtBurst(x, y, i === 0 ? 6 : 4);
          bite(i);
        });
      });
    }
    this.host.time.delayedCall(STROKES * FRONT_SWING_MS + 120, () => this.pop(kind, x, y));
    return true;
  }

  /**
   * A COISA PULA DO BURACO: sai da terra pequena, sobe girando e crescendo, e cai na mão do Zero, que dá um pulinho.
   * O save já guarda o achado aqui (um jogo fechado no meio da cerimônia não devolve a trinca).
   */
  private pop(kind: RelicKind, x: number, y: number): void {
    adventureState().found.add(kind);
    this.host.save.persistAdventure();
    const sound = getSoundManager();
    const hero = { x: this.host.playerWorld.worldX, y: this.host.playerWorld.worldY };
    this.host.debris.spawnSmokePuff(x, y);
    this.host.debris.spawnDirtBurst(x, y, 8);
    sound.ui.playPick('soft', 3);
    // O tom de quem tem branco na arte (pixelForms): sem ele, o creme das etiquetas estoura ao sol.
    const relic = this.host.world3d?.objects.addBillboard(relicTexture(kind), 0, { groundShadow: { rx: 0.2, rz: 0.09, alpha: 0.26 } })
      .setTint(WHITE_SAFE_TINT)
      .setPosition(x, y + 0.2)
      .setElevation(0)
      .setDisplaySize(0.3, 0.3);
    if (!relic) { this.ceremony(kind); return; }
    this.host.tweens.add({
      targets: relic,
      elevation: POP_HIGH,
      displayWidth: POP_SIZE,
      displayHeight: POP_SIZE,
      angle: 360,
      duration: POP_UP_MS,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.host.tweens.add({
          targets: relic,
          x: hero.x,
          y: hero.y + 0.22,
          elevation: HANDS,
          displayWidth: HAND_SIZE,
          displayHeight: HAND_SIZE,
          angle: 720,
          duration: POP_DOWN_MS,
          ease: 'Quad.easeIn',
          onComplete: () => {
            // pegou: o pulinho de contente, o brilho, e a coisa vai para a cerimônia
            sound.ui.playItemStash();
            this.host.sparkle.spawnGrowSparkle(hero.x, hero.y);
            this.host.tweens.add({ targets: this.host.hero, lift: 0.16, duration: 110, yoyo: true, ease: 'Sine.easeOut' });
            this.host.time.delayedCall(240, () => {
              relic.destroy();
              this.ceremony(kind);
            });
          },
        });
      },
    });
  }

  private ceremony(kind: RelicKind): void {
    const label = t('relics.get').replace('{name}', t(`relics.${kind}.name`));
    this.host.hand.showGet({ texture: relicTexture(kind), frame: 0, label }, () => {
      this.busy = false;
      this.host.cutsceneActive = false;
    });
  }

  /** O que o playtest e o painel leem: cada relíquia, onde está e se já saiu da terra. */
  public get state(): Array<{ kind: RelicKind; x: number; y: number; found: boolean; busy: boolean }> {
    const found = adventureState().found;
    return RELIC_KINDS.map((kind) => ({ kind, ...RELIC_SPOTS[kind], found: found.has(kind), busy: this.busy }));
  }
}

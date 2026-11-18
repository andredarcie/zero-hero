// O LAR DO HERÓI (pedido do autor, 2026-11-17). O acampamento começa com o colchão, o fogo e o caderno; o resto o
// jogador PÕE pela bancada (o modo de construção, scenes/game/BuildMode). Aqui mora o resto do lar: a BANCADA guarda o
// material (o X com graveto, pedra, carvão ou minério na mão o guarda nela), as PEÇAS postas respondem às mãos (a tina
// tinge a capa e a manta, a placa guarda o nome, o tronco e o banquinho são de sentar, o relógio de sol diz a hora, o
// sino toca, as lembranças se olham), o MATO cortado em volta fica cortado (objects/CampGrass), e chegar em casa
// escreve o nome do lugar no alto da tela.

import { getSoundManager } from '@/game/audio/SoundManager';
import type { HeldItemKind } from '@/game/entities/ItemPickup';
import { t } from '@/game/i18n/i18n';
import { CampGrass } from '@/game/objects/CampGrass';
import { CAMP_CENTER, CAMP_RING } from '@/game/objects/HeroCamp';
import { CHIME_GUST } from '@/game/objects/DecorLife';
import { isBenchMaterial, type HomePieceKind } from '@/game/objects/homeBuilds';
import { applyHeroCape } from '@/game/render3d/heroDye';
import { adventureState } from '@/game/runtime/adventureState';
import { DyeCard } from '@/game/runtime/DyeCard';
import { unlockedDyes, type ClothDye, type ClothTarget } from '@/game/runtime/homeState';
import { NameCard } from '@/game/runtime/NameCard';
import { isTouchDevice } from '@/game/runtime/PauseMenu';
import { PlaceTitle } from '@/game/runtime/PlaceTitle';
import { gameClock } from '@/game/runtime/campRegrowth';
import { getDay, getTimeOfDay, isNightTime } from '@/game/runtime/timeOfDay';
import { gustAt } from '@/game/runtime/wind';
import { getNpcHome } from '@/game/world/WorldData';
import type * as Engine from '@/game/engine';
import type { GameScene } from '../GameScene';
import { ITEM_VISUAL_2D } from './sceneDefs';

/** O que CampHome usa de GameScene (e a cena do motor, de onde saem as texturas 2D da capa). */
export type CampHomeHost = Engine.Scene & Pick<GameScene,
  'actions' | 'bumps' | 'carry' | 'cutsceneActive' | 'heldItem' | 'inventory' | 'orders' | 'playerWorld' | 'props'
  | 'query' | 'save' | 'seenItems' | 'sparkle' | 'steps' | 'torch' | 'valley'
>;

/** "Chegar em casa": entrar a este raio do meio do acampamento depois de ter estado além do outro. */
export const HOME_RADIUS = 3.5;
export const AWAY_RADIUS = 11;
/** O sino toca sozinho para quem está a até tantos tiles, e não mais que uma vez neste intervalo. */
const CHIME_HEAR_TILES = 8;
const CHIME_GAP_MS = 2600;
/** De quanto em quanto tempo a cena olha se mais algum mato do acampamento caiu. */
const GRASS_CHECK_MS = 500;
/** As lembranças dos pedidos: o Z nelas lê a fala do narrador de cada uma (`camp.<tipo>`). */
const MEMENTOS: ReadonlySet<HomePieceKind> = new Set<HomePieceKind>(['rack', 'easel', 'woodpile', 'chart']);

/** O que o Z faz numa peça posta (o balão e o botão perguntam a mesma coisa). */
export const pieceHandVerb = (kind: HomePieceKind | null): string | null => {
  if (!kind) return null;
  if (kind === 'tub') return 'dye';
  if (kind === 'sign') return 'write';
  if (kind === 'log') return 'sit';
  if (kind === 'sundial') return 'readHour';
  if (kind === 'windChime') return 'ring';
  return MEMENTOS.has(kind) ? 'look' : null;
};

/**
 * A HORA QUE A SOMBRA MARCA, arredondada à meia hora (é o que um relógio de sol dá de ler), ou null de noite: sem sol,
 * não há sombra. Em português "15h" e "15h30"; em inglês "3 pm" e "3:30 pm".
 */
export const sundialReading = (time: number, twelveHour: boolean): string | null => {
  if (time < 0.25 || time >= 0.75) return null;
  const halves = Math.round(time * 48) % 48;
  const hour = Math.floor(halves / 2);
  const half = halves % 2 === 1;
  if (!twelveHour) return `${hour}h${half ? '30' : ''}`;
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}${half ? ':30' : ''} ${hour < 12 ? 'am' : 'pm'}`;
};

export class CampHome {
  public dyeCard?: DyeCard;
  public nameCard?: NameCard;
  private title?: PlaceTitle;
  private grass?: CampGrass;
  /** O herói esteve longe desde o último título: a próxima chegada escreve o nome de novo. */
  private wasAway = false;
  private chimeQuietMs = 0;
  private grassCheckMs = 0;

  public constructor(private readonly host: CampHomeHost) {}

  /** Alguma tela do lar aberta: o mundo e as mãos param, como com o caderno. */
  public get isOpen(): boolean {
    return this.dyeCard !== undefined || this.nameCard !== undefined;
  }

  /** O título escrito que está na tela agora (a janela do playtest). */
  public get titleText(): string | null {
    return this.title && !this.title.isGone ? this.title.text : null;
  }

  /** O nome que a placa mostra: o que o jogador escreveu, ou o de sempre. */
  public get homeName(): string {
    return adventureState().home.name || t('home.sign.placeholder');
  }

  /** Quanto mato do acampamento ainda está em pé (a janela do playtest). */
  public get grassStanding(): number {
    return this.grass?.standing ?? 0;
  }

  /** O mato do acampamento (o relógio do mato que volta; o painel de testes o apressa). */
  public get campGrass(): CampGrass | undefined {
    return this.grass;
  }

  /** O mato pode voltar a fechar este tile sem trancar ninguém? Quem sabe é a grade (CampLife liga em BuildMode). */
  public grassCanClose?: (x: number, y: number) => boolean;

  /** O boot: a capa e a manta do save, a tina e a placa como ele as deixou, e o mato que ele já cortou. */
  public applyLook(): void {
    const home = adventureState().home;
    applyHeroCape(home.cape, this.host);
    this.host.valley.heroCamp?.setBlanket(home.blanket);
    this.host.valley.campPieces?.refreshLook();
    // O mato que volta: a hora é a do jogo; o tile em USO é o da peça e o que o herói pisa (trilha pisada não cresce).
    this.grass = new CampGrass(this.host.props.tallGrasses, {
      now: () => gameClock(getDay(), getTimeOfDay()),
      used: (x, y) => Boolean(this.host.valley.campPieces?.at(x, y))
        || (this.host.playerWorld.worldX === x && this.host.playerWorld.worldY === y),
      canClose: (x, y) => this.grassCanClose?.(x, y) ?? true,
    });
    this.grass.settleSaved();
    // Quem começa a partida em casa não "chega": o título espera ele sair e voltar.
    this.wasAway = this.distanceHome() > AWAY_RADIUS;
  }

  /** As cores que a tina já tem (a natural sempre; as tintas, depois das flores da Sisi). */
  public dyes(): readonly ClothDye[] {
    const found = adventureState().found;
    return unlockedDyes((kind) => this.host.seenItems.has(kind as HeldItemKind) || found.has(kind));
  }

  // ── A BANCADA GUARDA O MATERIAL ───────────────────────────────────────────────────────────────────────────────

  /** O X com material da bancada na mão, diante dela, o guarda lá dentro (uma tocha acesa não entra). */
  public canStockAt(x: number, y: number): boolean {
    const held = this.host.heldItem;
    return isBenchMaterial(held) && !this.host.torch.heldOnFire && this.host.query.getToolboxAt(x, y) !== undefined;
  }

  public stockBenchAt(x: number, y: number): boolean {
    if (!this.canStockAt(x, y)) return false;
    const out = this.host.inventory.takeAll();
    if (!out || !isBenchMaterial(out.kind)) return false;
    this.host.carry.updateBackItem();
    const home = adventureState().home;
    home.stock[out.kind] += out.count;
    const hero = this.host.playerWorld;
    this.host.orders.flingCraftedItem(out.kind, hero.worldX, hero.worldY, x, y);
    this.host.query.getToolboxAt(x, y)?.bump();
    getSoundManager().ui.playToolboxDeliver();
    this.host.save.persistAdventure();
    return true;
  }

  // ── AS PEÇAS POSTAS ───────────────────────────────────────────────────────────────────────────────────────────

  /** O Z numa peça posta: tingir, escrever, sentar, ler a hora, tocar o sino, olhar a lembrança. */
  public usePieceAt(x: number, y: number, narrate: (key: string) => void, sit: (view: { x: number; y: number }) => void): boolean {
    const kind = this.host.valley.campPieces?.at(x, y) ?? null;
    const verb = pieceHandVerb(kind);
    if (!kind || !verb) return false;
    if (verb === 'dye') this.useTub(narrate);
    else if (verb === 'write') this.useSign();
    else if (verb === 'readHour' || verb === 'ring') this.useDecorAt(x, y);
    else if (verb === 'sit') {
      // Sentado, ele olha o fogo se estiver perto dele; senão, a frente.
      const nearFire = Math.hypot(CAMP_RING.x - x, CAMP_RING.y - y) <= 3;
      sit(nearFire ? { x: CAMP_RING.x, y: CAMP_RING.y } : { x, y: y + 1 });
    } else {
      getSoundManager().work.playFindTouch('bench');
      narrate(`camp.${kind}`);
    }
    return true;
  }

  /** O que o X faz numa peça posta: o relógio de sol diz a hora, o sino toca. */
  public decorVerbAt(x: number, y: number): 'readHour' | 'ring' | null {
    const kind = this.host.valley.campPieces?.at(x, y);
    if (kind === 'sundial') return 'readHour';
    if (kind === 'windChime') return 'ring';
    return null;
  }

  public useDecorAt(x: number, y: number): boolean {
    const verb = this.decorVerbAt(x, y);
    if (verb === 'readHour') {
      const reading = sundialReading(getTimeOfDay(), t('home.sundial.clock') === '12');
      this.note(reading ? t('home.sundial.hour').replace('{h}', reading) : t('home.sundial.night'), t('home.piece.sundial'));
      getSoundManager().work.playFindTouch('bench');
      return true;
    }
    if (verb === 'ring') {
      getSoundManager().nature.playWindChime(1);
      this.chimeQuietMs = CHIME_GAP_MS;
      return true;
    }
    return false;
  }

  // ── A TINA ─────────────────────────────────────────────────────────────────────────────────────────────────────

  /** O Z na tina: sem tinta ainda, o herói pensa nas flores da Sisi; com tinta, abre a tina. */
  public useTub(narrate: (key: string) => void): void {
    const dyes = this.dyes();
    if (dyes.length <= 1) {
      const visual = ITEM_VISUAL_2D.dyeBundle;
      const sisi = getNpcHome('painter');
      this.host.bumps.heroThought?.show(visual.texture, visual.frame, sisi ? { x: sisi.worldX, y: sisi.worldY } : null);
      narrate('camp.tubEmpty');
      return;
    }
    if (this.isOpen) return;
    this.pauseHands();
    getSoundManager().ui.playPaperUnfold();
    const home = adventureState().home;
    this.dyeCard = new DyeCard(
      { dyes, worn: { cape: home.cape, blanket: home.blanket }, touch: isTouchDevice() },
      { onDye: (target, dye) => this.dip(target, dye), onClose: () => { this.dyeCard = undefined; this.resumeHands(); } },
    );
  }

  /** Mergulha o pano na cor: a capa muda no corpo do herói ali mesmo; a manta, no colchão. */
  public dip(target: ClothTarget, dye: ClothDye): void {
    const home = adventureState().home;
    home[target] = dye;
    if (target === 'cape') {
      applyHeroCape(dye, this.host);
      const hero = this.host.playerWorld;
      this.host.sparkle.spawnGrowSparkle(hero.worldX, hero.worldY);
    } else {
      this.host.valley.heroCamp?.setBlanket(dye);
    }
    // A tina mostra a tinta da capa.
    this.host.valley.campPieces?.refreshLook();
    getSoundManager().nature.playSplash();
    this.host.save.persistAdventure();
  }

  // ── A PLACA ───────────────────────────────────────────────────────────────────────────────────────────────────

  /** O Z na placa: escrever (ou reescrever) o nome do lugar. */
  public useSign(): void {
    if (this.isOpen) return;
    this.pauseHands();
    getSoundManager().ui.playPaperUnfold();
    this.nameCard = new NameCard(adventureState().home.name, t('home.sign.placeholder'), {
      onWrite: (name) => this.writeName(name),
      onClose: () => { this.nameCard = undefined; this.resumeHands(); },
    }, isTouchDevice());
  }

  /** O nome escrito: a placa ganha as letras a carvão, e o nome aparece no alto da tela. */
  public writeName(name: string): void {
    adventureState().home.name = name;
    this.host.valley.campPieces?.refreshLook();
    this.host.save.persistAdventure();
    this.showTitle();
  }

  // ── A CHEGADA, O SINO E O MATO ────────────────────────────────────────────────────────────────────────────────

  public update(delta: number): void {
    this.host.valley.campPieces?.render(this.host.time.now);
    this.grassCheckMs -= delta;
    if (this.grassCheckMs <= 0) {
      this.grassCheckMs = GRASS_CHECK_MS;
      const noticed = this.grass?.notice() ?? false;
      const grew = this.grass?.tick() ?? false;
      if (noticed || grew) this.host.save.persistAdventure();
    }
    const d = this.distanceHome();
    if (d > AWAY_RADIUS) this.wasAway = true;
    else if (d <= HOME_RADIUS && this.wasAway && !this.host.cutsceneActive && !this.isOpen) {
      this.wasAway = false;
      this.showTitle();
    }
    this.chimeQuietMs = Math.max(0, this.chimeQuietMs - delta);
    if (this.chimeQuietMs > 0 || this.host.cutsceneActive) return;
    const gust = gustAt(this.host.time.now);
    if (gust < CHIME_GUST + 0.15) return;
    const hero = this.host.playerWorld;
    const near = (this.host.valley.campPieces?.list ?? []).some((p) => p.kind === 'windChime'
      && Math.hypot(p.x - hero.worldX, p.y - hero.worldY) <= CHIME_HEAR_TILES);
    if (!near) return;
    getSoundManager().nature.playWindChime(Math.min(1, gust));
    this.chimeQuietMs = CHIME_GAP_MS + Math.random() * 1800;
  }

  /** O nome do lugar, escrito à mão no alto da tela. */
  public showTitle(): void {
    this.note(this.homeName, isNightTime() ? t('home.arrive.night') : t('home.arrive.day'));
  }

  public destroy(): void {
    this.dyeCard?.destroy();
    this.dyeCard = undefined;
    this.nameCard?.destroy();
    this.nameCard = undefined;
    this.title?.destroy();
    this.title = undefined;
    this.grass = undefined;
  }

  private note(text: string, sub: string): void {
    this.title?.destroy();
    this.title = new PlaceTitle(text, sub);
  }

  private distanceHome(): number {
    const hero = this.host.playerWorld;
    return Math.hypot(hero.worldX - CAMP_CENTER.x, hero.worldY - CAMP_CENTER.y);
  }

  /** A tela do lar abre: o balão das mãos e a tarja de teclas somem (o rodapé dela diz o que as teclas fazem). */
  private pauseHands(): void {
    this.host.actions.useBufferMs = 0;
    this.host.steps.stopBreathing();
    this.host.actions.actionButtons?.setVisible(false);
    this.host.actions.controlsHint?.destroy();
    this.host.actions.controlsHint = undefined;
  }

  private resumeHands(): void {
    this.host.actions.actionButtons?.setVisible(true);
  }
}

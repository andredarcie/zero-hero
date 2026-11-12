// A MEDITAÇÃO NA PEDRA DA COLINA (pedido do autor, 2026-11-12; a regra em runtime/meditation, o desenho em
// runtime/MeditationView, as mãos em runtime/MeditationOverlay, o corpo do herói e o vale em volta em
// scenes/game/MeditationBody). O Z na pedra leva o herói para cima dela e o senta,
// virado para o vale, com o relógio na marcha normal; a sessão não acaba sozinha, e levanta-se quando quiser. Quem respirou de
// verdade ganha, ao levantar, a nota do caderno com uma coisa que a pesquisa diz.

import type * as Engine from '@/game/engine';
import { getSoundManager } from '@/game/audio/SoundManager';
import type { HeldItemKind } from '@/game/entities/ItemPickup';
import { t, tWords } from '@/game/i18n/i18n';
import { MEDITATION_SEAT, MeditationSpot, type MeditationPiece } from '@/game/objects/MeditationSpot';
import { adventureState } from '@/game/runtime/adventureState';
import { MeditationSession, type MeditationEvent, type Thought, type ThoughtKind } from '@/game/runtime/meditation';
import { MeditationOverlay } from '@/game/runtime/MeditationOverlay';
import { MeditationView, type ThoughtIcon } from '@/game/runtime/MeditationView';
import { MeditationBody } from './MeditationBody';
import { MinigameCaption } from '@/game/runtime/MinigameCaption';
import { isTouchDevice } from '@/game/runtime/PauseMenu';
import type { GameScene } from '../GameScene';
import { ITEM_VISUAL_2D } from './sceneDefs';

/** O que Meditation usa de GameScene (e a cena do motor, onde o desenho mora). */
export type MeditationHost = Engine.Scene & Pick<GameScene,
  'actions' | 'camera' | 'camp' | 'cinema' | 'cutsceneActive' | 'dialog' | 'hand' | 'hero' | 'movementController' | 'pause' | 'playerWorld'
  | 'save' | 'tileSize' | 'uiTileSize' | 'verbs'
>;

/** O que vai dentro de cada tipo de pensamento: as coisas da vida do herói no vale. */
const THOUGHT_ITEMS: Readonly<Record<ThoughtKind, readonly HeldItemKind[]>> = {
  memory: ['knife', 'axe', 'brush', 'splitWood', 'porcini'],
  plan: ['key', 'telescope', 'pickaxe', 'shovel', 'glass'],
  worry: ['scythe', 'flyAgaric', 'jackOLantern', 'charcoal'],
  want: ['chanterelle', 'morel', 'oyster', 'dyeBundle'],
};
/** As legendas que ensinam as teclas, nas primeiras sessões (quem já meditou duas vezes sabe). */
const TAUGHT_AFTER = 2;
/** A nota do caderno só vem para quem respirou de verdade. */
const NOTE_AFTER_BREATHS = 2;
/** A legenda do "perceber" fica no máximo isto (ms) esperando a primeira volta. */
const NOTICE_CAPTION_MS = 12_000;
/** O passo (pulinho) do chão para cima da pedra (ms). */
const HOP_MS = 320;

type CaptionStage = 'breath' | 'waitThought' | 'notice' | 'done';

export class Meditation {
  public spot?: MeditationSpot;
  private session?: MeditationSession;
  private view?: MeditationView;
  private overlay?: MeditationOverlay;
  private caption?: MinigameCaption;
  private stage: CaptionStage = 'done';
  private noticeCaptionUntil = 0;
  private starting = false;
  /** O corpo do herói na pedra e o vale em volta (a pose, o fôlego, a música, o ambiente, as bordas da tela). */
  private readonly body: MeditationBody;

  public constructor(private readonly host: MeditationHost) {
    this.body = new MeditationBody(host);
  }

  /** A pedra e a pilha de pedras no mundo (o World3D já tem de existir). */
  public build(): void {
    this.spot ??= new MeditationSpot();
  }

  public at(x: number, y: number): MeditationPiece | null {
    return this.spot?.at(x, y) ?? null;
  }

  /** Meditando (ou indo sentar): o Z, o X e as setas são da meditação. */
  public get active(): boolean {
    return this.session !== undefined || this.starting;
  }

  /** O Z diante da pedra: sentar e meditar. */
  public useAt(x: number, y: number): boolean {
    if (this.at(x, y) !== 'seat') return false;
    void this.start();
    return true;
  }

  private async start(): Promise<void> {
    if (this.active || this.host.camp.rest.isResting || this.host.cutsceneActive) return;
    this.starting = true;
    this.host.cutsceneActive = true;
    const { worldX, worldY } = this.host.playerWorld;
    this.body.hop(HOP_MS);
    await this.host.cinema.scriptStep(MEDITATION_SEAT.x - worldX, MEDITATION_SEAT.y - worldY, HOP_MS);
    // A cena se desmontou durante o passo (volta ao título): nada de sessão aberta em cima do nada.
    if (!this.spot) { this.starting = false; return; }
    this.host.movementController?.interruptMovement(MEDITATION_SEAT.x, MEDITATION_SEAT.y);
    this.host.cutsceneActive = false;
    this.host.cinema.scriptFace(0, 1);
    // Sentado como num banco, mas sem o relógio acelerar como no banco (meditar é estar no tempo que passa) e sem o
    // sininho dele: quem abre a sessão é o sino de bacia.
    this.host.camp.rest.sit(MEDITATION_SEAT.x, MEDITATION_SEAT.y + 2, 1, false);
    this.body.settle();
    this.starting = false;
    // Os botões do toque saem (o A e o B da meditação são outros), e o ⏸ também: ficaria por baixo da tela dela,
    // aparecendo sem responder.
    this.host.actions.actionButtons?.setVisible(false);
    this.host.pause.pauseTouchButton?.setVisible(false);
    this.session = new MeditationSession();
    this.view = new MeditationView(this.host, (thought) => this.iconFor(thought), (kind) => t(`meditation.labels.${kind}`));
    this.overlay = new MeditationOverlay({
      onNotice: () => this.notice(),
      onLeave: () => this.leave(),
      close: t('meditation.close'),
      notice: t('meditation.notice'),
    }, isTouchDevice());
    this.caption = new MinigameCaption();
    this.stage = adventureState().meditations >= TAUGHT_AFTER ? 'done' : 'breath';
    if (this.stage === 'breath') this.caption.show('meditation.breath');
    this.host.time.delayedCall(500, () => { if (this.session) getSoundManager().ui.playSingingBowl(); });
  }

  private iconFor(thought: Thought): ThoughtIcon {
    const list = THOUGHT_ITEMS[thought.kind];
    return ITEM_VISUAL_2D[list[thought.pick % list.length]];
  }

  /** A cada quadro, com o herói sentado (FrameTick, no galho do descanso). */
  public tick(deltaMs: number): void {
    const s = this.session;
    if (!s || !this.view || !this.overlay) return;
    // Alguma outra coisa levantou o herói: a sessão acaba junto.
    if (!this.host.camp.rest.isResting) { this.finish(); return; }
    // Com a nota do caderno na tela a sessão já acabou: nada mais anda nem se desenha (MeditationView.hide).
    if (this.overlay.noteOpen) return;
    for (const event of s.step(Math.min(0.1, Math.max(0, deltaMs / 1000)), this.overlay.holding)) this.onEvent(event);
    this.body.breathe(s.breath);
    this.body.deepen(s.depth, s.quiet);
    if (this.stage === 'notice' && this.host.time.now > this.noticeCaptionUntil) this.teach('done');
    if (this.host.camera) this.view.render(s, this.host.camera, this.host.tileSize, this.host.uiTileSize, this.host.time.now, MEDITATION_SEAT, this.host.hero.lift);
  }

  /** De pé, a cada quadro: descer da pedra andando (MeditationBody.update). */
  public update(): void {
    if (!this.active) this.body.update();
  }

  /**
   * A TELA FOI TOMADA (uma conversa que veio sozinha, uma cena, um item ganho): a sessão acaba. Roda no começo do
   * quadro (FrameTick), antes do galho da conversa, que congela tudo e nunca chegaria ao `tick`. Sem isto a tela da
   * meditação seguraria o Z e o toque, e a conversa não andaria.
   */
  public yieldScreen(): void {
    if (this.session && (this.host.dialog.dialogOpen || this.host.hand.itemGetOpen || this.host.cutsceneActive)) this.finish();
  }

  private onEvent(event: MeditationEvent): void {
    const ui = getSoundManager().ui;
    if (event.type === 'inhale' || event.type === 'exhale') ui.playBreathCue(event.type === 'inhale');
    else if (event.type === 'quiet') ui.playSingingBowl();
    else if (event.type === 'breath' && this.stage === 'breath' && (this.session?.breaths ?? 0) >= 2) this.teach('waitThought');
    else if (event.type === 'thought' && (this.stage === 'breath' || this.stage === 'waitThought')) {
      this.noticeCaptionUntil = this.host.time.now + NOTICE_CAPTION_MS;
      this.teach('notice');
    }
  }

  /** As legendas, em etapas: o fôlego, e depois o perceber, quando o primeiro pensamento chega. */
  private teach(stage: CaptionStage): void {
    this.stage = stage;
    this.caption?.show(stage === 'breath' ? 'meditation.breath' : stage === 'notice' ? 'meditation.notice' : null);
  }

  /** O X (ou o B): perceber o pensamento. Sem pensamento nenhum, não faz nada. */
  private notice(): void {
    if (!this.session?.notice()) return;
    getSoundManager().ui.playNotice();
    if (this.stage === 'notice') this.teach('done');
  }

  /** Levantar: quem respirou de verdade ganha a nota do caderno antes. */
  private leave(): void {
    const s = this.session;
    if (!s || !this.overlay || this.overlay.noteOpen) return;
    this.caption?.show(null);
    if (s.breaths < NOTE_AFTER_BREATHS) { this.finish(); return; }
    const save = adventureState();
    const facts = tWords('meditation.facts');
    const sources = tWords('meditation.sources');
    const i = save.meditationFacts % Math.max(1, facts.length);
    save.meditationFacts += 1;
    this.view?.hide();
    this.overlay.showNote({ title: t('meditation.title'), stats: this.stats(s), fact: facts[i] ?? '', source: sources[i] ?? '' }, () => this.finish());
  }

  /** "9 fôlegos · 4 voltas · 2 min": o que a sessão foi, sem nota de prova. */
  private stats(s: MeditationSession): string {
    const count = (key: string, n: number): string => t(`meditation.stats.${key}${n === 1 ? 'One' : 'Many'}`).replace('{n}', String(n));
    const minutes = Math.floor(s.time / 60);
    const time = minutes < 1 ? t('meditation.stats.underMinute') : t('meditation.stats.minutes').replace('{n}', String(minutes));
    return [count('breaths', s.breaths), count('returns', s.returns), time].join('  ·  ');
  }

  private finish(): void {
    if (this.session && this.session.breaths >= NOTE_AFTER_BREATHS) adventureState().meditations += 1;
    const taken = this.host.dialog.dialogOpen || this.host.hand.itemGetOpen || this.host.cutsceneActive;
    this.close();
    this.body.rise(this.host.camp.rest.isResting, taken);
    if (this.host.camp.rest.isResting) this.host.camp.rest.getUp();
    this.host.actions.actionButtons?.setVisible(true);
    this.host.pause.pauseTouchButton?.setVisible(true);
    this.host.save.persistAdventure();
  }

  private close(): void {
    this.view?.destroy();
    this.overlay?.destroy();
    this.caption?.destroy();
    this.view = undefined;
    this.overlay = undefined;
    this.caption = undefined;
    this.session = undefined;
    this.stage = 'done';
  }

  /** A sessão por dentro (a janela dos playtests), ou null. */
  public get state(): {
    inhaling: boolean; depth: number; breaths: number; returns: number; lapses: number; focused: boolean; quiet: boolean;
    thoughts: string[]; caption: string; note: boolean; holding: boolean; breath: number; time: number;
  } | null {
    const s = this.session;
    if (!s) return null;
    return {
      inhaling: s.guide.inhaling, depth: s.depth, breaths: s.breaths, returns: s.returns, lapses: s.lapses, focused: s.focused, quiet: s.quiet,
      thoughts: s.thoughts.map((th) => `${th.kind}:${th.state}`), caption: this.caption?.text ?? '', note: this.overlay?.noteOpen ?? false,
      holding: this.overlay?.holding ?? false, breath: s.breath, time: s.time,
    };
  }

  /** Playtest: põe a sessão nesta profundidade (para fotografar o fundo sem esperar dois minutos). */
  public setDepth(depth: number): void {
    if (this.session) this.session.depth = Math.min(1, Math.max(0, depth));
  }

  /** O desmonte da cena: some tudo, sem levantar ninguém. */
  public destroy(): void {
    this.body.destroy();
    this.close();
    this.spot?.destroy();
    this.spot = undefined;
  }
}

// A ABERTURA: a primeira vez no vale — o herói chegando pela estrada, o mago que vem a pé, a conversa, e o pular.

import { NPC_VISUALS } from '@/game/constants';
import { isNightTime, setTimeOfDay } from '@/game/runtime/timeOfDay';
import { t, tLines } from '@/game/i18n/i18n';
import { INTRO_SKIP_CODES, INTRO_SKIP_WINDOW_MS, IntroSkipGate } from '@/game/runtime/introSkip';
import { isTouchDevice } from '@/game/runtime/PauseMenu';
import { ControlsHint } from '@/game/runtime/ActionButtons';
import { getSoundManager } from '@/game/audio/SoundManager';
import { getDialog, getDialogVoice, getPlayerStart } from '@/game/world/WorldData';
import { requestAdventureRespawn } from '@/game/runtime/adventureState';
import type { GameScene } from '../GameScene';
import { Billboard3D } from '@/game/render3d/Billboard3D';
import { INTRO_CLOCK, INTRO_WALK_TILES, OPENING_TALK_KEY } from './sceneDefs';

/** PULAR A ABERTURA leva dois toques (ver runtime/introSkip); o pulo escurece o quadro neste tempo. */
const INTRO_SKIP_FADE_MS = 320;
/** Um passo cansado: bem mais lento que o andar normal. */
const INTRO_STEP_MS = 520;
/** De quantos tiles a leste o mago chega andando. */
const WIZARD_WALK_TILES = 5;

/** O que Intro usa de GameScene. */
export type IntroHost = Pick<GameScene,
  'actions' | 'camera' | 'carry' | 'cinema' | 'cutsceneActive' | 'delivery' | 'dialog' | 'fire' | 'introDone'
  | 'life' | 'npcManager' | 'playerWorld' | 'props' | 'registry' | 'save' | 'scene' | 'seenDialogKeys'
  | 'swordPlanting' | 'time' | 'tweens' | 'view' | 'world3d'
>;

export class Intro {
  /** A abertura foi pulada e falta a conversa com o mago (ver skipIntro). */
  public openingTalk = false;
  public disarmIntroSkip?: () => void;
  public wizardStandIn?: Billboard3D;

  public constructor(private readonly host: IntroHost) {}

  /**
   * A ABERTURA — a unica cena do jogo que acontece sem o jogador, e por isso ela e curta.
   *
   * Ela e NOITE de proposito (o relogio do mundo e posto as dez da noite): e a hora dos
   * vaga-lumes, e a hora em que um cavaleiro cansado para de andar.
   */
  public async playIntro(): Promise<void> {
    const w3 = this.host.world3d;
    if (!w3 || !this.host.camera) return;
    this.host.cutsceneActive = true;
    setTimeOfDay(INTRO_CLOCK);
    this.host.life.ambienceClockMs = 0;
    this.host.props.campfiresFollowNight = !isNightTime();
    this.host.fire.syncCampfiresToClock();
    this.host.carry.updateBackItem(); // a espada nas costas: ela ainda e dele
    this.host.cinema.setLetterbox(true, 1400);
    w3.look.setWorldFade(1);
    this.host.view.cutsceneHeroLight = 0.6;
    this.armIntroSkip();
    await this.host.cinema.wait(400);
    this.host.tweens.addCounter({
      from: 1, to: 0, duration: 2200, ease: 'Sine.easeOut',
      onUpdate: (tw) => this.host.world3d?.look.setWorldFade(tw.getValue() ?? 0),
    });

    // 1. A ESTRADA: ele chega andando, devagar, do sul.
    for (let i = 0; i < INTRO_WALK_TILES; i += 1) await this.host.cinema.scriptStep(0, -1, INTRO_STEP_MS);
    this.host.cinema.scriptFace(0, -1);
    await this.host.cinema.wait(900);

    // 2. A ESPADA: ele se vira para a estrada que fez, tira a espada das costas e a crava no chao.
    this.host.cinema.scriptFace(0, 1);
    await this.host.cinema.wait(600);
    await this.host.swordPlanting.playSwordPlanting();

    // 3. O SILENCIO: a musica ja tinha baixado; ele olha em volta, e o vale e so vaga-lume.
    getSoundManager().music.fadeMusicOut();
    await this.host.cinema.wait(1400);
    this.host.cinema.scriptFace(-1, 0);
    await this.host.cinema.wait(1100);
    this.host.cinema.scriptFace(1, 0);
    await this.host.cinema.wait(1100);
    this.host.cinema.scriptFace(0, -1);
    await this.host.cinema.wait(1300);

    // 4. O MAGO: uma figura vem pelo leste, sem pressa nenhuma.
    this.host.cinema.scriptFace(1, 0);
    await this.walkWizardIn();

    // 5. A CONVERSA. As faixas saem: a fala precisa do rodape inteiro.
    this.disarmIntroSkip?.();
    this.host.cinema.setLetterbox(false, 700);
    await this.talkToWizardAtLast();
  }

  /** A conversa da abertura e a volta do controle: o fim comum de quem viu a cena e de quem pulou. */
  private async talkToWizardAtLast(): Promise<void> {
    const base = getDialog('wizard');
    const wizardAt = { worldX: this.host.playerWorld.worldX + 1, worldY: this.host.playerWorld.worldY };
    await new Promise<void>((resolve) => {
      if (!base) { resolve(); return; }
      // A abertura já manda o herói para a barraca: a lembrança do mago não acende o "!" de novo.
      this.host.seenDialogKeys.add('wizard:tent');
      this.host.dialog.openDialogScript({ ...base, lines: tLines('wizard.intro') }, wizardAt, getDialogVoice('wizard'), resolve);
    });

    // 6. O CONTROLE VOLTA: o mago fica ali, na beira da estrada, para quem quiser conversar.
    this.host.npcManager?.setKindHidden('wizard', false);
    this.wizardStandIn?.destroy();
    this.wizardStandIn = undefined;
    this.host.introDone = true;
    void this.host.cinema.dollyTo(1, 1800);
    const shaft = this.host.cinema.moonShaft;
    this.host.cinema.moonShaft = undefined;
    if (shaft) this.host.tweens.add({ targets: shaft, alpha: 0, duration: 2400, onComplete: () => shaft.destroy() });
    this.host.seenDialogKeys.add(`wizard:${this.host.delivery.wizardLine()}`);
    this.host.view.cutsceneHeroLight = 1;
    this.host.cutsceneActive = false;
    this.host.carry.updateBackItem();
    getSoundManager().music.fadeMusicIn();
    this.host.actions.showControlsHint();
    this.host.save.persistAdventure();
  }

  /**
   * O PEDIDO DE PULAR. Vale do comeco da abertura ate o mago abrir a boca; dali em diante as teclas
   * sao do dialogo, que ja se passa fala a fala.
   */
  private armIntroSkip(): void {
    const gate = new IntroSkipGate(() => performance.now());
    const press = (): void => {
      // No congelamento do impacto quem devolve o tempo e um timer, e ele descongelaria o pulo.
      if (this.host.tweens.timeScale === 0) return;
      const verdict = gate.press();
      if (verdict === 'hint') {
        this.host.actions.controlsHint?.destroy();
        const touch = isTouchDevice();
        this.host.actions.controlsHint = new ControlsHint(t(touch ? 'controls.skipIntroTouch' : 'controls.skipIntro'), INTRO_SKIP_WINDOW_MS, touch);
      } else if (verdict === 'skip') {
        this.skipIntro();
      }
    };
    const onKey = (event: KeyboardEvent): void => {
      if (!event.repeat && INTRO_SKIP_CODES.includes(event.code)) press();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', press);
    this.disarmIntroSkip = () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', press);
      this.disarmIntroSkip = undefined;
      this.host.actions.controlsHint?.destroy();
      this.host.actions.controlsHint = undefined;
    };
  }

  /**
   * PULAR A ABERTURA. A cena mexe em quase tudo (espada, camera, tempo, faixas), e desfazer isso
   * por partes pode acabar em qualquer quadro dela. Por isso ela congela, escurece e o jogo
   * REINICIA pelo caminho do Continue: o save ja diz que a abertura passou e onde ela deixa o
   * heroi, e o create monta a espada fincada e o mago na estrada. Falta so a conversa.
   */
  private skipIntro(): void {
    this.disarmIntroSkip?.();
    this.host.time.paused = true;
    this.host.tweens.timeScale = 0;
    const started = performance.now();
    const darken = (now: number): void => {
      const k = Math.min(1, (now - started) / INTRO_SKIP_FADE_MS);
      this.host.world3d?.look.setWorldFade(Math.max(k, this.host.world3d.look.worldFade));
      if (k < 1) { requestAnimationFrame(darken); return; }
      const road = getPlayerStart();
      this.host.playerWorld = { worldX: road.worldX, worldY: road.worldY - INTRO_WALK_TILES - 1 };
      this.host.introDone = true;
      this.host.save.persistAdventure();
      requestAdventureRespawn();
      this.host.registry.set(OPENING_TALK_KEY, true);
      this.host.time.paused = false;
      this.host.scene.restart();
    };
    requestAnimationFrame(darken);
  }

  /** Quem pulou a cena volta do escuro na mesma noite, ao lado do mago, e ouve o que ele tem a dizer. */
  public async playOpeningTalk(): Promise<void> {
    this.host.cutsceneActive = true;
    setTimeOfDay(INTRO_CLOCK);
    this.host.life.ambienceClockMs = 0;
    this.host.props.campfiresFollowNight = !isNightTime();
    this.host.fire.syncCampfiresToClock();
    this.host.cinema.scriptFace(1, 0);
    this.host.world3d?.look.setWorldFade(1);
    await this.host.cinema.fadeWorld(1, 0, 700);
    this.openingTalk = false;
    await this.talkToWizardAtLast();
  }

  /** O mago chega a pe pela direita da estrada e para ao lado do heroi. */
  private walkWizardIn(): Promise<void> {
    const w3 = this.host.world3d;
    const visual = NPC_VISUALS.wizard;
    const endX = this.host.playerWorld.worldX + 1;
    const y = this.host.playerWorld.worldY;
    if (!w3) return Promise.resolve();
    this.wizardStandIn = w3.objects.addBillboard(visual.key, visual.frame ?? 0, { groundShadow: true, reflected: true })
      .setPosition(endX + WIZARD_WALK_TILES, y)
      .setDisplaySize(1, 1)
      .setFlipX(true);
    const standIn = this.wizardStandIn;
    return new Promise<void>((resolve) => {
      const k = { t: 0 };
      this.host.tweens.add({
        targets: k,
        t: 1,
        duration: WIZARD_WALK_TILES * 820,
        ease: 'Sine.easeOut',
        onUpdate: () => {
          standIn.setPosition(endX + WIZARD_WALK_TILES * (1 - k.t), y);
          // O passo dele e lento e redondo: um quique pequeno por tile.
          standIn.setElevation(Math.abs(Math.sin(k.t * WIZARD_WALK_TILES * Math.PI)) * 0.05);
        },
        onComplete: () => { standIn.setElevation(0); resolve(); },
      });
    });
  }
}

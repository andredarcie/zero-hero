// O FIM: a fogueira do jardim que só o herói acende, o espeto, o marshmallow, e a cena que leva aos créditos.

import { HERO_FRAMES } from '@/game/constants';
import type { DialogScript } from '@/game/dialogs/NpcDialogs';
import { isNightTime, setTimeOfDay } from '@/game/runtime/timeOfDay';
import { CampfireObject } from '@/game/objects/CampfireObject';
import { tLines } from '@/game/i18n/i18n';
import { ROAST_STICK_DONE_TEXTURE, ROAST_STICK_TEXTURE } from '@/game/render3d/cozyTextures';
import { getSoundManager } from '@/game/audio/SoundManager';
import { getDialog, getDialogVoice } from '@/game/world/WorldData';
import { HearthReunion } from '@/game/entities/HearthReunion';
import type { GameScene } from '../GameScene';
import { Billboard3D } from '@/game/render3d/Billboard3D';
import { INTRO_CLOCK, SKY_DIALOG } from './sceneDefs';

/** A fogueira do fim: a nave desce ao norte do fogo, os amigos entram pelo portão do jardim. */
const REUNION_SHIP_NORTH = 2.8;
const REUNION_GATE = [30, 36] as const;
const REUNION_DOLLY = 1.2;

/** O que RoastEnding usa de GameScene. */
export type RoastEndingHost = Pick<GameScene,
  'actions' | 'bumps' | 'camp' | 'carry' | 'cinema' | 'cutsceneActive' | 'dialog' | 'fire' | 'arc'
  | 'heldItem' | 'hero' | 'heroBillboard' | 'inventory' | 'life' | 'movementController' | 'npcManager'
  | 'playerWorld' | 'props' | 'query' | 'questSetup' | 'save' | 'sparkle' | 'steps' | 'torch'
  | 'tweens' | 'world3d'
>;

export class RoastEnding {
  /** Todo mundo em volta da fogueira do fim. */
  public reunion?: HearthReunion;
  public roasting = false;
  public roastStick?: Billboard3D;

  public constructor(private readonly host: RoastEndingHost) {}

  /**
   * O Z NA FOGUEIRA DO FIM. Apagada, ele a ACENDE (sem tocha: ele tem pederneira, e este fogo e
   * dele). Acesa, ele senta e assa um MARSHMALLOW — o pacote espera ao lado do fogo, e o herói só
   * traz o espeto: um graveto NA MÃO. Sem ele, o pensamento mostra o graveto (o ícone, nunca a palavra).
   */
  public tendHearthAt(wx: number, wy: number): boolean {
    const hearth = this.host.query.getHearthAt(wx, wy);
    if (!hearth) return false;
    // Depois dos creditos ela vira uma fogueira como as outras: quem cuida dela e restAtFireAt.
    if (this.host.arc.has('ending')) return false;
    if (this.host.cutsceneActive) return true;
    if (!hearth.isLit) {
      void this.lightHearth(hearth, wx, wy);
      return true;
    }
    if (this.host.heldItem !== 'wood') { this.host.bumps.thinkOfNeed(wx, wy, true); return true; }
    void this.playRoastEnding(hearth, wx, wy);
    return true;
  }

  /** Acender a fogueira do fim: tres faiscas, a chama pegando aos poucos, e o calor. */
  private async lightHearth(hearth: CampfireObject, wx: number, wy: number): Promise<void> {
    this.host.cutsceneActive = true;
    this.host.steps.stopBreathing();
    for (let i = 0; i < 3; i += 1) {
      this.host.hero.frame = HERO_FRAMES.attack;
      getSoundManager().work.playRockSmash();
      this.host.sparkle.spawnFireHitEffect(wx, wy);
      await this.host.cinema.wait(180);
      this.host.hero.frame = HERO_FRAMES.idleDown;
      await this.host.cinema.wait(320);
    }
    await new Promise<void>((resolve) => {
      const grow = { t: 0 };
      this.host.tweens.add({
        targets: grow, t: 1, duration: 1600, ease: 'Sine.easeIn',
        onUpdate: () => hearth.igniteProgress(grow.t),
        onComplete: () => resolve(),
      });
    });
    hearth.light();
    this.host.arc.reach('hearth');
    getSoundManager().nature.playHearthCatch();
    this.host.sparkle.spawnFireHitEffect(wx, wy);
    this.host.sparkle.softWash(0xffd28c, 0.22, 1400);
    this.host.save.persistAdventure();
    this.host.cutsceneActive = false;
  }

  /**
   * O FIM. Ele senta na frente do fogo, espeta um marshmallow no graveto e o segura sobre a chama.
   * Ele doura aos poucos, os vaga-lumes passam, a brisa mexe no mato. Ninguem diz nada por
   * um tempo — e entao o quadro escurece e os creditos sobem.
   */
  private async playRoastEnding(
    hearth: CampfireObject, wx: number, wy: number,
  ): Promise<void> {
    const w3 = this.host.world3d;
    const hb = this.host.heroBillboard;
    if (!w3 || !hb) return;
    this.host.cutsceneActive = true;
    this.roasting = true;
    this.host.arc.reach('ending');
    this.host.inventory.remove('wood'); // o graveto vira o espeto
    this.host.torch.extinguishTorch();
    this.host.carry.updateBackItem();
    this.host.carry.backItemBb?.setVisible(false);
    this.host.actions.actionButtons?.setVisible(false);
    this.host.actions.controlsHint?.destroy();
    this.host.actions.controlsHint = undefined;
    // O SAVE SO APRENDE O FIM QUANDO OS CREDITOS SOBEM (la embaixo). Gravado aqui, um jogo
    // fechado no meio da cena voltava "zerado", sem graveto e sem final para ver.
    this.host.steps.stopBreathing();
    getSoundManager().music.fadeMusicOut();

    // Mais tarde, naquela noite: o mundo apaga um instante e volta escuro, so o fogo e os
    // vaga-lumes acesos.
    await this.host.cinema.fadeWorld(0, 1, 900);
    setTimeOfDay(INTRO_CLOCK);
    this.host.life.ambienceClockMs = 0;
    this.host.props.campfiresFollowNight = !isNightTime();
    this.host.fire.syncCampfiresToClock();
    if (!hearth.isLit) hearth.light();
    // No corte para o escuro, ele já está acima do fogo, olhando para baixo: de frente para a câmera,
    // e com a roda dos amigos à vista.
    if (!this.host.query.isSolidForEntities(wx, wy - 1)) {
      this.host.playerWorld.worldX = wx;
      this.host.playerWorld.worldY = wy - 1;
      this.host.movementController?.interruptMovement(wx, wy - 1);
      await this.host.cinema.wait(60);
    }
    // SENTADO: o corpo baixa e alarga um pouco (a pose de quem dobrou os joelhos na frente do
    // fogo), de frente para a chama.
    const toFire = { dx: Math.sign(wx - this.host.playerWorld.worldX), dy: Math.sign(wy - this.host.playerWorld.worldY) };
    this.host.cinema.scriptFace(toFire.dx, toFire.dy);
    this.host.hero.scaleY = 0.84;
    this.host.hero.scaleX = 1.04;
    const stick = w3.objects.addBillboard(ROAST_STICK_TEXTURE, 0, { centered: true })
      .setDisplaySize(0.62, 0.62);
    const stickAt = (): void => {
      stick.setPosition(hb.x + toFire.dx * 0.55 + 0.08, hb.y + toFire.dy * 0.42 + 0.06);
    };
    stickAt();
    stick.setElevation(0.42);
    this.roastStick = stick;
    await this.host.cinema.fadeWorld(1, 0, 1800);

    // O espeto balanca devagar sobre a chama — a mao de quem nao tem pressa nenhuma.
    this.host.tweens.add({ targets: stick, elevation: 0.5, duration: 1400, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 });
    const quietly = async (beats: number): Promise<void> => {
      for (let i = 0; i < beats; i += 1) {
        await this.host.cinema.wait(900);
        stickAt();
        if (i % 2 === 0) this.host.sparkle.spawnFireHitEffect(wx, wy);
        this.host.world3d?.objects.rustleDecor(this.host.playerWorld.worldX - 1, this.host.playerWorld.worldY);
        this.host.world3d?.objects.rustleDecor(this.host.playerWorld.worldX + 1, this.host.playerWorld.worldY + 1);
      }
    };
    await quietly(6);
    // E então, sem aviso, os amigos. A câmera abre um pouco, para caber a roda inteira.
    const reunion = new HearthReunion({
      ...this.host.questSetup.shipHost({ x: wx, y: wy - REUNION_SHIP_NORTH }),
      fire: { x: wx, y: wy },
      heroBody: this.host.hero,
      gate: REUNION_GATE,
      pathTo: (from, seats) => this.host.camp.visitPath(from, seats, [this.host.playerWorld.worldX, this.host.playerWorld.worldY], [wx, wy]),
      isFree: (x, y) => !this.host.query.isSolidForEntities(x, y),
      away: (kind) => this.host.npcManager?.setKindAway(kind, true),
      hearts: (x, y) => this.host.sparkle.spawnHearts(x, y),
      heroFaces: (dx, dy) => this.host.cinema.scriptFace(dx, dy),
      say: (speaker, onClosed) => {
        const base = getDialog('astronaut', SKY_DIALOG) as DialogScript;
        this.host.dialog.dialogSpeaker = speaker;
        this.host.dialog.openDialogScript({ ...base, calm: true, lines: tLines('npc.astronautStep.reunion') }, undefined, getDialogVoice('astronaut'), () => {
          this.host.dialog.dialogSpeaker = undefined;
          this.host.cutsceneActive = true;
          onClosed();
        });
      },
    }, { x: this.host.playerWorld.worldX, y: this.host.playerWorld.worldY });
    this.reunion = reunion;
    void this.host.cinema.dollyTo(REUNION_DOLLY, 2400);
    await reunion.friends();
    this.host.cinema.scriptFace(toFire.dx, toFire.dy);
    // Falta a Thea. Ninguém comenta: o fogo estala, e passa um tempo.
    await quietly(5);
    await reunion.thea();
    this.host.cinema.scriptFace(toFire.dx, toFire.dy);
    await quietly(3);
    // Dourou.
    stick.setTexture(ROAST_STICK_DONE_TEXTURE, 0);
    getSoundManager().ui.playSingingBowl();
    this.host.sparkle.spawnFireHitEffect(wx, wy);
    await this.host.cinema.wait(2400);

    // Uma frase, e o silencio.
    await new Promise<void>((resolve) => {
      const base = getDialog('wizard');
      if (!base) { resolve(); return; }
      this.host.dialog.openDialogScript({ ...base, npcName: '', lines: tLines('ending.lines') }, undefined, undefined, resolve);
    });
    await this.host.cinema.wait(2600);
    void this.host.cinema.dollyTo(1, 1200);
    this.host.save.persistAdventure();
    this.host.cinema.rollCredits();
  }
}

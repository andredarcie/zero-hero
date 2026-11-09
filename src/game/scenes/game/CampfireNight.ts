// A NOITE NA FOGUEIRA: a cena inteira, do herói que senta ao dia que vira.

import * as Engine from '@/game/engine';
import type { DialogScript } from '@/game/dialogs/NpcDialogs';
import { getDay, isNightTime, setDay, setTimeOfDay } from '@/game/runtime/timeOfDay';
import { CampfireObject } from '@/game/objects/CampfireObject';
import { Billboard3D } from '@/game/render3d/Billboard3D';
import { FX_DOT_TEXTURE } from '@/game/render3d/World3D';
import { getSoundManager } from '@/game/audio/SoundManager';
import { getDialogVoice } from '@/game/world/WorldData';
import { FireVisitor } from '@/game/entities/FireVisitor';
import type { GameScene } from '../GameScene';
import { FX_BILLBOARD, INTRO_CLOCK } from './sceneDefs';

/** A manhã depois da noite do Marco. */
const MORNING_CLOCK = 0.34;

/** O que CampfireNight usa de GameScene (e a cena do motor, que ele passa a quem monta objetos do mundo). */
export type CampfireNightHost = Engine.Scene & Pick<GameScene,
  'actions' | 'camera' | 'camp' | 'cinema' | 'cutsceneActive' | 'dialog' | 'events' | 'fire' | 'hero' | 'life'
  | 'npcManager' | 'pause' | 'playerWorld' | 'props' | 'query' | 'roastEnding' | 'save' | 'sparkle' | 'steps'
  | 'tileSize' | 'time' | 'tweens' | 'world3d'
>;

export class CampfireNight {
  public constructor(private readonly host: CampfireNightHost) {}

  /**
   * A NOITE DO MARCO. O fogo pega, ele vem andando e senta, o herói senta de frente, e o mundo apaga em
   * volta: só a fogueira, os dois e os vaga-lumes. Ele conta como o fogo funciona, e depois ninguém diz
   * nada por um tempo, só os grilos. Corta para o dia, com o fogo apagado e cada um no seu lugar.
   *
   * O save só aprende no fim (`onDone`): fechar o jogo no meio volta para o fogo ainda por acender.
   */
  public async playCampfireNight(
    night: {
      fire: CampfireObject;
      pit: { x: number; y: number };
      seat: { x: number; y: number };
      npc: { worldX: number; worldY: number };
      story: DialogScript;
      farewell: DialogScript;
    },
    onDone: () => void,
  ): Promise<void> {
    const { fire, pit, seat, npc } = night;
    const sound = getSoundManager();
    this.host.cutsceneActive = true;
    this.host.roastEnding.roasting = true; // os vaga-lumes valem de dia ou de noite, nesta cena
    this.host.steps.stopBreathing();
    this.host.actions.actionButtons?.setVisible(false);
    this.host.pause.pauseTouchButton?.setVisible(false);
    this.host.actions.controlsHint?.destroy();
    this.host.actions.controlsHint = undefined;
    sound.music.fadeMusicOut(1500);

    // O FOGO PEGA: um clarão, um tranco, faíscas, e a chama sobe.
    this.host.fire.keptLitFires.add(fire);
    fire.light();
    sound.nature.playFurnaceIgnite();
    sound.nature.playIgnite();
    this.host.world3d?.cam.shake(180, 0.012);
    this.host.sparkle.softWash(0xffb060, 0.34, 900);
    for (let i = 0; i < 4; i += 1) this.host.time.delayedCall(i * 170, () => this.host.sparkle.spawnFireHitEffect(pit.x, pit.y));
    await this.host.cinema.wait(1500);

    // O herói vai para a frente do fogo, e o Marco vem de casa.
    const walkHero = async (): Promise<void> => {
      const goal = { x: pit.x, y: pit.y + 1 };
      const visited = new Map<string, [number, number] | null>([[`${this.host.playerWorld.worldX},${this.host.playerWorld.worldY}`, null]]);
      const queue: Array<[number, number]> = [[this.host.playerWorld.worldX, this.host.playerWorld.worldY]];
      while (queue.length > 0) {
        const [cx, cy] = queue.shift() as [number, number];
        if (cx === goal.x && cy === goal.y) break;
        for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
          const key = `${cx + dx},${cy + dy}`;
          if (visited.has(key) || this.host.query.isSolidForEntities(cx + dx, cy + dy)) continue;
          visited.set(key, [cx, cy]);
          queue.push([cx + dx, cy + dy]);
        }
      }
      const steps: Array<[number, number]> = [];
      let at: [number, number] | null | undefined = visited.has(`${goal.x},${goal.y}`) ? [goal.x, goal.y] : null;
      while (at) {
        steps.unshift(at);
        at = visited.get(`${at[0]},${at[1]}`);
      }
      for (let i = 1; i < steps.length; i += 1) {
        await this.host.cinema.scriptStep(steps[i][0] - steps[i - 1][0], steps[i][1] - steps[i - 1][1], 300);
      }
    };
    this.host.npcManager?.setKindAway('businessMan', true);
    const path = this.host.camp.visitPath([npc.worldX, npc.worldY], [[seat.x, seat.y]], [pit.x, pit.y + 1], [pit.x, pit.y]);
    const visitor = new FireVisitor(this.host, 'businessMan', path ?? [[npc.worldX, npc.worldY], [seat.x, seat.y]]);
    visitor.arrive();
    await walkHero();
    this.host.cinema.scriptFace(0, -1);
    await this.host.cinema.wait(250);
    this.host.tweens.add({ targets: this.host.hero, scaleY: 0.84, scaleX: 1.05, duration: 380, ease: 'Sine.easeOut' });
    for (let i = 0; i < 80 && !visitor.isSeated; i += 1) await this.host.cinema.wait(120);
    await this.host.cinema.wait(500);

    // A NOITE: o relógio vai para as dez, e o escuro fecha em volta do fogo.
    setTimeOfDay(INTRO_CLOCK);
    this.host.life.ambienceClockMs = 0;
    this.host.props.campfiresFollowNight = !isNightTime();
    this.host.fire.syncCampfiresToClock();
    void this.host.cinema.dollyTo(0.72, 3200);
    const focus = document.createElement('div');
    focus.style.cssText = 'position:fixed;inset:0;z-index:39;pointer-events:none;opacity:0;transition:opacity 3000ms ease;';
    document.body.appendChild(focus);
    const followFire = (): void => {
      if (!this.host.camera) return;
      const at = this.host.camera.tileToScreen(pit.x, pit.y, this.host.tileSize);
      const near = this.host.tileSize * 2.5;
      const far = this.host.tileSize * 5.4;
      focus.style.background = `radial-gradient(circle at ${at.x}px ${at.y}px, rgba(4,3,8,0) ${near}px, rgba(4,3,8,0.72) ${(near + far) / 2}px, rgba(3,2,6,0.97) ${far}px)`;
    };
    followFire();
    this.host.events.on('postupdate', followFire);
    window.requestAnimationFrame(() => { focus.style.opacity = '1'; });

    // Bastante vaga-lume, em volta do fogo. Pontos sem luz, como os de sempre.
    const motes: Billboard3D[] = [];
    const moteTweens: Engine.Tweens.Tween[] = [];
    if (this.host.world3d) {
      for (let i = 0; i < 34; i += 1) {
        const mote = this.host.world3d.objects.addBillboard(FX_DOT_TEXTURE, 0, { ...FX_BILLBOARD, additive: true, emissiveBoost: 2.6 })
          .setTint(i % 3 === 0 ? 0xfff2a0 : 0xd6ff8a)
          .setPosition(pit.x + (Math.random() - 0.5) * 6, pit.y + (Math.random() - 0.5) * 4.5)
          .setElevation(0.3 + Math.random() * 1.1)
          .setDisplaySize(0.09, 0.09)
          .setAlpha(0);
        motes.push(mote);
        moteTweens.push(this.host.tweens.add({
          targets: mote,
          x: mote.x + (Math.random() - 0.5) * 1.6,
          y: mote.y + (Math.random() - 0.5) * 1.2,
          elevation: mote.elevation + (Math.random() - 0.5) * 0.7,
          alpha: { from: 0, to: 0.95 },
          duration: 1300 + Math.random() * 2200,
          delay: Math.random() * 2600,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        }));
      }
    }
    await this.host.cinema.wait(3400);

    // A história.
    const say = (script: DialogScript): Promise<void> => new Promise<void>((resolve) => {
      this.host.dialog.dialogSpeaker = visitor.bodySprite;
      this.host.dialog.openDialogScript(script, undefined, getDialogVoice('businessMan'), () => {
        this.host.dialog.dialogSpeaker = undefined;
        resolve();
      });
    });
    await say(night.story);
    this.host.cutsceneActive = true;

    // Ninguém diz nada: só os grilos, a lenha estalando e o fogo.
    sound.ambience.setAmbienceMix(1, 0);
    for (let i = 0; i < 7; i += 1) {
      await this.host.cinema.wait(1300);
      if (i % 2 === 0) this.host.sparkle.spawnFireHitEffect(pit.x, pit.y);
    }
    await say(night.farewell);
    this.host.cutsceneActive = true;
    await this.host.cinema.wait(600);

    // O CORTE: apaga, e volta de dia, com o fogo apagado e cada um no seu lugar.
    await this.host.cinema.fadeWorld(0, 1, 1500);
    for (const tween of moteTweens) tween.stop();
    for (const mote of motes) mote.destroy();
    this.host.events.off('postupdate', followFire);
    focus.remove();
    this.host.fire.keptLitFires.delete(fire);
    fire.extinguish();
    visitor.destroy();
    this.host.npcManager?.setKindAway('businessMan', false);
    this.host.tweens.add({ targets: this.host.hero, scaleY: 1, scaleX: 1, duration: 120 });
    this.host.roastEnding.roasting = false;
    void this.host.cinema.dollyTo(1, 100);
    setTimeOfDay(MORNING_CLOCK);
    setDay(getDay() + 1); // o corte atravessa a meia-noite que o relógio não andou
    this.host.life.ambienceClockMs = 0;
    this.host.props.campfiresFollowNight = !isNightTime();
    onDone();
    this.host.fire.syncCampfiresToClock();
    await this.host.cinema.wait(700);
    await this.host.cinema.fadeWorld(1, 0, 1600);
    sound.music.fadeMusicIn(1800);
    this.host.cutsceneActive = false;
    this.host.actions.actionButtons?.setVisible(true);
    this.host.pause.pauseTouchButton?.setVisible(true);
    this.host.save.persistAdventure();
  }
}

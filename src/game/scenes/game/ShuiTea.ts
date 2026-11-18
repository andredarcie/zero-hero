// O CHÁ DA SHUI (pedido do autor): fechado o pedido dos cogumelos, ela acha no fundo da cesta um pequeno que ninguém
// pediu — um cogumelo alucinógeno, grudado no musgo — e faz um chá com ele ali mesmo (entities/MushroomTea). O herói
// bebe, e a viagem o leva longe: primeiro de dentro do elmo, depois pelo túnel de luz, depois voando sobre o vale
// (entities/TeaTrip). Na volta, horas depois, ela diz o que ele viu, pela escola dela. Uma vez por partida.

import { getSoundManager } from '@/game/audio/SoundManager';
import { HERO_FRAMES } from '@/game/constants';
import { questFor } from '@/game/dialogs/NpcQuests';
import { MushroomTea } from '@/game/entities/MushroomTea';
import { TeaTrip } from '@/game/entities/TeaTrip';
import { tLines } from '@/game/i18n/i18n';
import { isReducedMotion } from '@/game/runtime/accessibility';
import { isQuestDone } from '@/game/runtime/QuestLog';
import { setTimeScale } from '@/game/runtime/timeOfDay';
import { getDialog, getDialogVoice } from '@/game/world/WorldData';
import type * as Engine from '@/game/engine';
import type { GameScene } from '../GameScene';
import { FORAGER_DIALOG } from './sceneDefs';

/** O chá já foi: a marca mora com as falas ouvidas, no save. */
export const SHUI_TEA_KEY = 'shui/tea';
/** Depois do obrigado, o vale comemora (o sino, os corações, a lembrança, o gato, a chave do jardim): só então o chá. */
const AFTER_PARTY_MS = 1600;

type Tile = { x: number; y: number };
type NpcAt = { worldX: number; worldY: number };

/** O que ShuiTea usa de GameScene (e a cena do motor, para os tweens e o relógio). */
export type ShuiTeaHost = Engine.Scene & Pick<GameScene,
  'actions' | 'adventure' | 'carry' | 'cutsceneActive' | 'debris' | 'dialog' | 'dialogCam' | 'hand' | 'hero'
  | 'movementController' | 'npcManager' | 'pause' | 'playerWorld' | 'query' | 'save' | 'seenDialogKeys' | 'sparkle' | 'steps'
>;

export class ShuiTea {
  private running = false;
  private waiting?: Engine.Time.TimerEvent;
  private tea?: MushroomTea;

  public constructor(private readonly host: ShuiTeaHost) {}

  /** O chá está acontecendo (do primeiro "espere" ao último verso dela). */
  public get active(): boolean {
    return this.running;
  }

  /** O pedido dos cogumelos fechou e o chá ainda não veio — também num save de antes do chá existir. */
  public due(): boolean {
    const quest = questFor(FORAGER_DIALOG);
    return this.host.adventure && quest !== undefined && isQuestDone(quest) && !this.host.seenDialogKeys.has(SHUI_TEA_KEY);
  }

  /** Depois da conversa com ela: o chá começa quando a tela estiver livre (a festa do pedido, a chave do jardim). */
  public queue(npc: NpcAt): void {
    if (this.running || this.waiting) return;
    let since = 0;
    this.waiting = this.host.time.addEvent({
      delay: 200,
      loop: true,
      callback: () => {
        since += 200;
        const busy = this.host.dialog.dialogOpen || this.host.hand.itemGetOpen || this.host.cutsceneActive || this.host.dialogCam.camShifting;
        if (since < AFTER_PARTY_MS || busy) return;
        this.waiting?.remove();
        this.waiting = undefined;
        void this.play(npc);
      },
    });
  }

  /** A cena acabou (volta ao título, restart): nada fica esperando nem pela metade. */
  public reset(): void {
    this.waiting?.remove();
    this.waiting = undefined;
    this.tea?.clear(false);
    this.tea = undefined;
    this.running = false;
  }

  private async play(npc: NpcAt): Promise<void> {
    const host = this.host;
    this.running = true;
    const shui = { x: npc.worldX, y: npc.worldY };
    const start = { x: host.playerWorld.worldX, y: host.playerWorld.worldY };
    const seat = this.seatBy(shui);
    this.cutscene(true);
    host.steps.stopBreathing();
    // O relógio para durante o chá: quem o move, na viagem, é ela.
    setTimeScale(0);
    host.npcManager?.hop(shui.x, shui.y, 0.3);
    await this.say('npc.radiationSuitTea', npc);
    const tea = new MushroomTea({
      scene: host,
      spot: this.spotBy(shui, [start, seat]),
      shui,
      hero: start,
      heroBody: host.hero,
      hop: () => host.npcManager?.hop(shui.x, shui.y, 0.22),
      dirt: (x, y) => host.debris.spawnDirtBurst(x, y, 6),
      smoke: (x, y) => host.debris.spawnSmokePuff(x, y),
      hearts: (x, y) => host.sparkle.spawnHearts(x, y),
    });
    this.tea = tea;
    await tea.brew();
    await this.say('npc.radiationSuitTeaDrink', npc);
    await tea.serve();
    await tea.drink();
    const sound = getSoundManager();
    sound.music.fadeMusicOut(2500);
    sound.ambience.setHush(0.7);
    host.carry.backItemBb?.setVisible(false);
    let seated = false;
    await new TeaTrip({
      scene: host,
      seat,
      facing: shui,
      reduced: isReducedMotion(),
      showHero: (on) => {
        // No escuro do piscar, ele já está sentado diante dela: a caneca sai, e o corpo some (a câmera está nele).
        if (!on && !seated) {
          seated = true;
          tea.dropMug();
          this.sitBefore(seat, shui);
        }
        host.hero.alpha = on ? 1 : 0;
      },
    }).run();
    sound.ambience.setHush(0);
    host.seenDialogKeys.add(SHUI_TEA_KEY);
    host.save.persistAdventure();
    await this.say('npc.radiationSuitTeaAfter', npc);
    // Ela fica contente, o fogo some numa fumacinha, e ele levanta.
    tea.clear();
    this.tea = undefined;
    host.npcManager?.hop(shui.x, shui.y, 0.3);
    host.sparkle.spawnHearts(shui.x, shui.y);
    host.tweens.add({ targets: host.hero, scaleX: 1, scaleY: 1, duration: 320, ease: 'Back.easeOut' });
    host.carry.updateBackItem();
    setTimeScale(1);
    this.cutscene(false);
    host.movementController?.interruptMovement(host.playerWorld.worldX, host.playerWorld.worldY);
    this.running = false;
  }

  /** Uma fala dela; o jogo continua parado quando a caixa fecha (o fechar devolve os botões). */
  private say(key: string, npc: NpcAt): Promise<void> {
    const base = getDialog('radiationSuit');
    if (!base) return Promise.resolve();
    return new Promise((resolve) => {
      this.host.dialog.openDialogScript({ ...base, lines: tLines(key) }, npc, getDialogVoice('radiationSuit'), () => {
        this.cutscene(true);
        resolve();
      });
    });
  }

  private cutscene(on: boolean): void {
    this.host.cutsceneActive = on;
    this.host.actions.actionButtons?.setVisible(!on);
    this.host.pause.pauseTouchButton?.setVisible(!on);
  }

  /** Onde ele bebe e viaja: de frente para ela (o tile ao sul, que fica sempre livre), ou onde ele já está. */
  private seatBy(shui: Tile): Tile {
    const front = { x: shui.x, y: shui.y + 1 };
    return this.host.query.isSolidForEntities(front.x, front.y) ? { x: this.host.playerWorld.worldX, y: this.host.playerWorld.worldY } : front;
  }

  /** Onde ela arma o fogo: ao lado dela, num chão livre que não seja o do herói. */
  private spotBy(shui: Tile, taken: Tile[]): Tile {
    const options = [{ x: shui.x + 1, y: shui.y }, { x: shui.x - 1, y: shui.y }, { x: shui.x + 1, y: shui.y + 1 }, { x: shui.x - 1, y: shui.y + 1 }];
    const free = options.find((t) => !this.host.query.isSolidForEntities(t.x, t.y) && !taken.some((o) => o.x === t.x && o.y === t.y));
    return free ?? options[0];
  }

  /** O herói sentado no chão, de frente para ela. */
  private sitBefore(seat: Tile, shui: Tile): void {
    const host = this.host;
    host.playerWorld = { worldX: seat.x, worldY: seat.y };
    host.movementController?.interruptMovement(seat.x, seat.y);
    host.movementController?.faceTo(Math.sign(shui.x - seat.x), Math.sign(shui.y - seat.y));
    host.tweens.killTweensOf(host.hero);
    host.hero.frame = shui.y < seat.y ? HERO_FRAMES.idleUp : HERO_FRAMES.idleDown;
    host.hero.scaleX = 1.05;
    host.hero.scaleY = 0.84;
  }
}

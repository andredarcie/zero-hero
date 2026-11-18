// A MANHÃ DEPOIS DO FIM (pedido do autor, 2026-11-17: "não volte para o menu inicial... como se o Zero tivesse acordado
// no acampamento dele, depois de uma noite dormida na própria caminha"). Os créditos acabam e a cena recomeça do save —
// o mesmo caminho do Continue, com o world.json do disco —, mas com o herói deitado no colchão do acampamento. A noite
// da fogueira do fim passa no sono de sempre (Resting: ele dorme a 48×, e levanta sozinho quando clareia), e um
// bilhete avisa que a aventura principal acabou e o vale continua aberto.
//
// O sono é deitado SEM `atCamp`: a Morte e o céu da primeira noite são do sono que o jogador escolhe no acampamento, e
// não podem cair por cima do fim.

import { t } from '@/game/i18n/i18n';
import { CAMP_BED, CAMP_RING } from '@/game/objects/HeroCamp';
import { AfterwordNote } from '@/game/runtime/AfterwordNote';
import { setTimeScale } from '@/game/runtime/timeOfDay';
import { SLEEP_TIME_SCALE } from '@/game/systems/Resting';
import { reloadWorldData } from '@/game/world/reloadWorld';
import type { GameScene } from '../GameScene';
import { MORNING_AFTER_KEY } from './sceneDefs';

/** A cena nasce preta e o acampamento aparece devagar, o herói já deitado. */
const FADE_IN_MS = 2600;
/**
 * Deitado na noite, quieto, antes de ela passar. Sem esta espera o sono (48×: a noite inteira em uns três segundos)
 * corria por baixo do escuro, e o acampamento aparecia já de manhã, com ele de pé: ninguém o via dormir nem acordar.
 */
const NIGHT_HOLD_MS = 1500;
/** Ele levanta e se espreguiça antes de o bilhete aparecer. */
const NOTE_AFTER_MS = 1400;
/** De quanto em quanto (relógio da cena) se olha se ele já levantou. */
const POLL_MS = 200;

/** O que MorningAfter usa de GameScene. */
export type MorningAfterHost = Pick<GameScene,
  'adventure' | 'camp' | 'cinema' | 'cutsceneActive' | 'movementController' | 'playerWorld' | 'registry' | 'save'
  | 'scene' | 'time' | 'world3d'
>;

export class MorningAfter {
  /** Esta cena nasceu dos créditos: o herói acorda no acampamento (quem lê o recado é o RunBoot). */
  public pending = false;
  private note?: AfterwordNote;

  public constructor(private readonly host: MorningAfterHost) {}

  /** O bilhete está na tela (a sonda do playtest). */
  public get noteOpen(): boolean {
    return this.note !== undefined;
  }

  /** Os créditos acabaram: o recado fica para a cena seguinte, e ela recomeça do save, com o mundo do disco. */
  public restartAtCamp(): void {
    this.host.registry.set(MORNING_AFTER_KEY, true);
    void reloadWorldData().finally(() => this.host.scene.restart());
  }

  /**
   * O boot pergunta, uma vez por cena, se ela é a manhã depois do fim; se for, devolve onde o herói nasce (o colchão)
   * e a manhã fica pendente para o fecho do boot (`play`). Fora da aventura (o playtest do editor) nunca é.
   */
  public takeRequest(): { worldX: number; worldY: number } | null {
    const asked = this.host.adventure && this.host.registry.get(MORNING_AFTER_KEY) === true;
    this.host.registry.remove(MORNING_AFTER_KEY);
    this.pending = asked;
    return asked ? { worldX: CAMP_BED.x, worldY: CAMP_BED.y } : null;
  }

  /** A manhã: deitado no colchão, a noite passa dormindo, ele levanta quando clareia, e o bilhete aparece. */
  public async play(): Promise<void> {
    this.pending = false;
    const { camp, cinema } = this.host;
    this.host.world3d?.look.setWorldFade(1);
    // NO colchão, e não ao lado: ele é tile sólido, e o boot tira do sólido quem nasce nele (RunSave.unstickHero). É o
    // mesmo lugar em que o sono de sempre o deita (CampLife.sleepAtCamp).
    this.host.playerWorld = { worldX: CAMP_BED.x, worldY: CAMP_BED.y };
    this.host.movementController?.interruptMovement(CAMP_BED.x, CAMP_BED.y);
    camp.rest.lieDown(CAMP_RING.x, CAMP_RING.y, { fixedBed: true });
    // A noite espera o acampamento aparecer; depois passa no ritmo do sono.
    setTimeScale(0);
    await cinema.fadeWorld(1, 0, FADE_IN_MS);
    await cinema.wait(NIGHT_HOLD_MS);
    setTimeScale(SLEEP_TIME_SCALE);
    // Quem levanta é o descanso, sozinho, quando a noite passou (Resting.tick).
    await this.until(() => !camp.rest.isResting);
    await cinema.wait(NOTE_AFTER_MS);
    this.host.save.persistAdventure();
    this.showNote();
  }

  /** A cena saiu (troca de cena, volta ao título): o bilhete some junto, sem avisar ninguém. */
  public reset(): void {
    this.note?.destroy();
    this.note = undefined;
    this.pending = false;
  }

  private showNote(): void {
    // Com o bilhete na tela o herói fica parado: a tecla que fecha é do bilhete.
    this.host.cutsceneActive = true;
    this.note = new AfterwordNote(t('ending.afterword'), () => {
      this.note = undefined;
      this.host.cutsceneActive = false;
    });
  }

  /** Espera `done` virar verdade, olhando no relógio da cena (pausar o jogo pausa a espera junto). */
  private until(done: () => boolean): Promise<void> {
    return new Promise<void>((resolve) => {
      if (done()) { resolve(); return; }
      const poll = this.host.time.addEvent({
        delay: POLL_MS,
        loop: true,
        callback: () => {
          if (!done()) return;
          poll.remove();
          resolve();
        },
      });
    });
  }
}

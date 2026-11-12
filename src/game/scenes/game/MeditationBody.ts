// O CORPO E O MUNDO DA MEDITAÇÃO (pedido do autor, 2026-11-12; a sessão e as telas em scenes/game/Meditation). O herói
// sobe na pedra num pulinho, senta de pernas cruzadas com o visor apagado (HERO_FRAMES.meditate) e RESPIRA JUNTO com
// o jogador: o peito sobe enquanto ele segura e desce quando solta. E o vale em volta acalma conforme ele aprofunda:
// a música sai ao sentar, os pássaros, a brisa e a água se afastam, e as bordas da tela escurecem; na quietude, mais
// ainda. Ao levantar tudo volta, e ele fica de pé em cima da pedra até descer dela andando.

import type * as Engine from '@/game/engine';
import { getSoundManager } from '@/game/audio/SoundManager';
import { HERO_FRAMES } from '@/game/constants';
import { MEDITATION_SEAT } from '@/game/objects/MeditationSpot';
import type { GameScene } from '../GameScene';

/** O que MeditationBody usa de GameScene (e os tweens da cena do motor). */
export type MeditationBodyHost = Engine.Scene & Pick<GameScene, 'cinema' | 'hero' | 'verbs'>;

/**
 * A altura do herói EM CIMA da pedra (tiles): o tampo dela, para o bloco aparecer embaixo dele. No chão, o herói
 * sentado cobria a pedra inteira e parecia sentado no capim.
 */
export const SEAT_LIFT = 0.4;
/** As bordas da tela: a do descanso ao sentar, até onde escurecem no fundo, e na quietude. */
const VIGNETTE_SAT = 0.35;
const VIGNETTE_DEEP = 0.58;
const VIGNETTE_QUIET = 0.66;
/** O ambiente se afasta até esta fração do "calar" no fundo (AmbiencePlayer.setHush); a quietude cala o resto. */
const HUSH_DEEP = 0.8;
/** A música sai devagar ao sentar e volta devagar ao levantar (ms). */
const MUSIC_FADE_MS = 2500;
/** O fôlego do jogador acima disto mostra o quadro de inspirar, e abaixo de BREATH_OUT volta: a folga não deixa piscar. */
const BREATH_IN = 0.6;
const BREATH_OUT = 0.4;

export class MeditationBody {
  /** O herói está em cima da pedra (sentado, ou de pé depois de levantar, até descer dela). */
  private onSeat = false;
  private inhaled = false;
  private vignette = -1;
  private hush = -1;

  public constructor(private readonly host: MeditationBodyHost) {}

  /** O passo para a pedra é um pulinho para CIMA dela: a altura sobe junto com o passo (`ms`). */
  public hop(ms: number): void {
    this.onSeat = true;
    this.host.tweens.add({ targets: this.host.hero, lift: SEAT_LIFT, duration: ms, ease: 'Quad.easeOut' });
  }

  /** Sentou (o descanso já o pôs sentado): a pose de pernas cruzadas, com um assentar, e o vale começa a calar. */
  public settle(): void {
    const hero = this.host.hero;
    // O descanso achata o quadro de parado (é o sentar do banco); a pose de meditar já é sentada, e o achatado sai.
    this.host.tweens.killTweensOf(hero);
    hero.lift = SEAT_LIFT;
    hero.frame = HERO_FRAMES.meditate;
    hero.scaleX = 1.06;
    hero.scaleY = 0.9;
    this.host.tweens.add({ targets: hero, scaleX: 1, scaleY: 1, duration: 280, ease: 'Back.easeOut' });
    this.inhaled = false;
    getSoundManager().music.fadeMusicOut(MUSIC_FADE_MS);
    this.vignette = -1;
    this.hush = -1;
    this.deepen(0, false);
  }

  /** O peito acompanha o fôlego do jogador (0 vazio, 1 cheio): o quadro de inspirar enquanto ele está cheio. */
  public breathe(breath: number): void {
    if (!this.inhaled && breath > BREATH_IN) this.inhaled = true;
    else if (this.inhaled && breath < BREATH_OUT) this.inhaled = false;
    this.host.hero.frame = this.inhaled ? HERO_FRAMES.meditateIn : HERO_FRAMES.meditate;
  }

  /**
   * O vale acalma com a profundidade (0..1), e mais na quietude: as bordas escurecem e o ambiente se afasta. Em
   * degraus (de 0,02 na borda, de um décimo no ambiente): cada mudança é uma transição longa, não uma por quadro.
   */
  public deepen(depth: number, quiet: boolean): void {
    const v = Math.round((quiet ? VIGNETTE_QUIET : VIGNETTE_SAT + (VIGNETTE_DEEP - VIGNETTE_SAT) * depth) * 50) / 50;
    if (v !== this.vignette) {
      this.vignette = v;
      this.host.cinema.setVignette(v, 2400);
    }
    const hush = quiet ? 1 : (Math.round(depth * 10) / 10) * HUSH_DEEP;
    if (hush !== this.hush) {
      this.hush = hush;
      getSoundManager().ambience.setHush(hush);
    }
  }

  /**
   * Levantou: a pose de parado volta, e com o herói ainda sentado (`seated`) ela sai de um achatado, que o levantar
   * do descanso estica de volta. O ambiente e a música voltam, a não ser que uma conversa, cena ou item tenha tomado
   * a tela (`taken`): quem abaixou a música para ela a devolve ao fechar.
   */
  public rise(seated: boolean, taken: boolean): void {
    const hero = this.host.hero;
    hero.frame = HERO_FRAMES.idleDown;
    hero.scaleX = seated ? 1.05 : 1;
    hero.scaleY = seated ? 0.86 : 1;
    this.inhaled = false;
    this.hush = 0;
    getSoundManager().ambience.setHush(0);
    if (!taken) getSoundManager().music.fadeMusicIn(MUSIC_FADE_MS);
  }

  /**
   * DESCER DA PEDRA (a cada quadro, de pé): levantar deixa o herói de pé em cima dela, e "levantar é só andar", como
   * nos achados. A altura acompanha o corpo de verdade: cheia em cima da pedra, zero na metade do passo para fora.
   */
  public update(): void {
    if (!this.onSeat) return;
    const hero = this.host.verbs.heroVisualTile();
    const off = Math.hypot(hero.x - MEDITATION_SEAT.x, hero.y - MEDITATION_SEAT.y);
    this.host.hero.lift = SEAT_LIFT * Math.max(0, 1 - off * 2);
    if (off >= 0.5) this.onSeat = false;
  }

  /** O desmonte da cena: o herói no chão e o vale com o som de sempre (o tocador de ambiente é um só, entre cenas). */
  public destroy(): void {
    if (this.onSeat) this.host.hero.lift = 0;
    this.onSeat = false;
    getSoundManager().ambience.setHush(0);
  }
}

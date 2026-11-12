// O SOM DAS TELAS E DAS COISAS NA MÃO: o sininho, a voz das falas, o rádio, o papel, a bolsa, a bancada, a loja, o título,
// a tigela, e pegar e pôr. Tudo sintetizado (ver SoundManager.osc/noise).

import { scheduleRadioClick, scheduleSyllable } from '@/game/audio/dialogVoice';
import type { SpokenSyllable } from '@/game/dialogs/voicePersonas';
import type { Material } from '@/game/audio/materials';
import { detune } from './WorkSounds';
import type { SoundManager } from './SoundManager';

/** Os degraus de quem apanha em seguida, em semitons: a pentatônica de fá, sem nunca passar da oitava. */
const PICK_SCALE = [0, 2, 4, 7, 9, 12];
/**
 * O volume de pico do sopro da meditação (Synth.swell). Medido em janela de 400 ms: uns 8 dB abaixo do "notar" (que
 * é gesto do jogador), para se seguir de ouvido sem incomodar repetindo a cada 5 s. O "tss" de antes ficava 16 dB
 * abaixo e sumia debaixo da música.
 */
const BREATH_IN_VOL = 0.028;
const BREATH_OUT_VOL = 0.03;

/** O que UiSounds usa de SoundManager. */
export type UiSoundsHost = Pick<SoundManager,
  'audio' | 'sfxUserBus' | 'synth' | 'work'
>;

export class UiSounds {
  public constructor(private readonly host: UiSoundsHost) {}

  /**
   * A short "talking" blip for the dialog typewriter. Each NPC passes its own base
   * frequency + waveform so voices sound distinct (a tiny random jitter keeps it lively).
   * Deliberately dry and procedural — close, intimate, no room around it.
   */
  /**
   * O CARRILHAO de ganhar uma coisa: tres notas de seno subindo em F maior (do, fa, la), cada uma
   * com um harmonico de oitava bem baixinho — uma caixinha de musica, nunca uma fanfarra.
   */
  public playCozyChime(): void {
    const notes = [1046.5, 1396.9, 1760];
    notes.forEach((f, i) => {
      this.host.synth.osc('sine', f, f, 0.09, 1.1, i * 0.14);
      this.host.synth.osc('sine', f * 2, f * 2, 0.018, 0.6, i * 0.14);
    });
  }

  /**
   * O "falar" de cada letra. As vozes autoradas pedem onda quadrada ou serra (o chiptune da
   * aventura antiga), e aqui elas sao AMACIADAS: quadrada vira triangulo, serra vira seno, e o
   * blip ficou mais baixo e mais redondo. A altura de cada personagem continua a dele.
   */
  public playDialogBlip(freq: number, wave: OscillatorType = 'triangle'): void {
    const jitter = 1 + (Math.random() - 0.5) * 0.05;
    const soft: OscillatorType = wave === 'square' ? 'triangle' : wave === 'sawtooth' ? 'sine' : wave;
    this.host.synth.osc(soft, freq * jitter, freq * jitter * 0.92, 0.075, 0.07);
  }

  /** Uma sílaba da fala de um NPC (ver dialogs/voicePersonas). */
  public playDialogSyllable(syllable: SpokenSyllable): void {
    const ctx = this.host.audio; // ensures sfxUserBus exists
    if (!ctx) return;
    scheduleSyllable(ctx, this.host.sfxUserBus, ctx.currentTime, syllable);
  }

  public playRadioClick(closing: boolean): void {
    const ctx = this.host.audio; // ensures sfxUserBus exists
    if (!ctx) return;
    scheduleRadioClick(ctx, this.host.sfxUserBus, ctx.currentTime, closing);
  }

  /** Pegar sobe: cada coisa em seguida vai um degrau acima na pentatônica, e o ouvido percebe a série. */
  public playPick(material: Material, streak = 0): void {
    const step = PICK_SCALE[Math.min(streak, PICK_SCALE.length - 1)];
    const pitch = Math.pow(2, step / 12);
    this.host.work.materialKnock(material, pitch, 0.9);
    this.host.synth.osc('sine', 660 * pitch, 880 * pitch, 0.045, 0.08, 0.02);
  }

  /** Pousar desce e pesa: é o mesmo material, mais grave, com o baque do chão embaixo. */
  public playPut(material: Material): void {
    this.host.work.materialKnock(material, 0.78, 1);
    this.host.synth.noise('lowpass', 240, 1, 0.14, 0.07, 0.015);
  }

  public playItemBonk(): void {
    const d = detune();
    this.host.synth.noise('lowpass', 380 * d, 1.2, 0.16, 0.07);
    this.host.synth.osc('sine', 150 * d, 90 * d, 0.1, 0.09);
  }

  // ── A BOLSA DE COURO (runtime/BagStash): abrir, lançar, cair dentro, fechar o fecho ──
  public playBagOpen(): void {
    this.host.synth.noise('bandpass', 1100, 1.6, 0.05, 0.14);          // o couro farfalhando
    this.host.synth.osc('triangle', 240, 300, 0.04, 0.09, 0.02);       // a aba subindo
  }

  public playBagToss(): void {
    this.host.synth.noise('bandpass', 1400, 2.2, 0.035, 0.22);         // o sopro do arco
    this.host.synth.osc('sine', 520, 880, 0.03, 0.18, 0.02);           // subindo junto com ele
  }

  public playBagLand(): void {
    this.host.synth.noise('lowpass', 380, 0.9, 0.11, 0.13);            // o baque surdo no fundo do couro
    this.host.synth.osc('sine', 150, 95, 0.12, 0.16);                  // o peso assentando
    this.host.synth.osc('triangle', 660, 620, 0.035, 0.06, 0.04);      // "guardou"
  }

  public playBagClasp(): void {
    this.host.synth.noise('bandpass', 2600, 7, 0.06, 0.035);           // o estalo do fecho de latão
    this.host.synth.osc('triangle', 1180, 1150, 0.045, 0.07, 0.02);
    this.host.synth.osc('sine', 1760, 1740, 0.03, 0.18, 0.07);         // e um brilho curto, de coisa bem feita
  }

  public playItemStash(): void {
    this.host.synth.noise('lowpass', 620, 1.0, 0.09, 0.055);   // o baque surdo da coisa entrando
    this.host.synth.osc('triangle', 300, 190, 0.10, 0.075);    // o peso dela assentando, descendo
    this.host.synth.osc('sine', 720, 640, 0.035, 0.05, 0.035); // e um toque claro no fim: "peguei" — sem metal
  }

  /** The cinematic finale hit — the title screen fires this once, when the author's name lands. */
  public playTitleImpact(): void {
    if (this.host.synth.playSample('titleImpact')) return;
    // Fallback: a sub drop, a low boom, and an A2 toll — the same shape as the sample.
    this.host.synth.osc('sine', 110, 34, 0.7, 1.0);
    this.host.synth.noise('lowpass', 500, 0.8, 0.5, 0.5);
    this.host.synth.osc('triangle', 110, 110, 0.22, 1.6);
  }

  /** Tibetan singing bowl — was the intro's "wake up" swell; kept for the next slow moment. */
  public playSingingBowl(): void {
    if (this.host.synth.playSample('singingBowl')) return;
    // Fallback: a swelling A3 bowl-ish chord (root + fifth + low om), long and calm.
    this.host.synth.osc('sine', 220, 220, 0.26, 3.2);
    this.host.synth.osc('sine', 330, 330, 0.13, 3.0, 0.1);
    this.host.synth.osc('sine', 110, 110, 0.16, 3.6);
  }

  /**
   * O FÔLEGO DA MEDITAÇÃO (scenes/game/Meditation): o AR ENTRANDO enquanto o guia sobe (um sopro que cresce devagar e
   * clareia, 4 s) e SAINDO enquanto ele desce (mais grave, escurecendo, 6 s). Sopro de verdade, que cresce e se
   * desfaz (Synth.swell), e não um "tss" que entra de golpe. Baixinho: é para quem medita seguir o ritmo de ouvido,
   * mesmo de olhos fechados, e não um aviso.
   */
  public playBreathCue(inhale: boolean): void {
    if (inhale) this.host.synth.swell('bandpass', 420, 1050, 0.7, BREATH_IN_VOL, 1.7, 3.7);
    else this.host.synth.swell('lowpass', 900, 300, 0.5, BREATH_OUT_VOL, 1.0, 5.4);
  }

  /** PERCEBER um pensamento: um toque de madeira e uma nota curta, como quem anota a lápis. */
  public playNotice(): void {
    this.host.synth.noise('bandpass', 1800, 2.4, 0.03, 0.05);
    this.host.synth.osc('triangle', 784, 784, 0.045, 0.32, 0.03);
    this.host.synth.osc('sine', 1175, 1175, 0.018, 0.5, 0.08);
  }

  public playHeartPickup(): void {
    if (this.host.synth.playSample('heartPickup')) return;
    this.host.synth.osc('triangle', 220, 220, 0.26, 0.22);
    this.host.synth.osc('triangle', 262, 262, 0.18, 0.28, 0.06);
  }

  public playSwordPickup(): void {
    if (this.host.synth.playSample('swordPickup')) return;
    // Fallback mirrors the sample: a quick ascending A-minor arpeggio climbing an octave
    // (A4-C5-E5-A5) — the "item get" rise, warm and short.
    const notes = [440, 523, 659, 880] as const;
    notes.forEach((freq, i) => {
      this.host.synth.osc('triangle', freq, freq, 0.16, i === notes.length - 1 ? 0.34 : 0.2, i * 0.05);
    });
  }

  /** A trava soltando e a tampa girando na dobradica: metalico, seco, sem drama. */
  public playToolboxOpen(): void {
    this.host.synth.noise('bandpass', 2600, 3.6, 0.1, 0.05);
    this.host.synth.osc('square', 240, 420, 0.075, 0.09);
    this.host.synth.osc('triangle', 620, 520, 0.045, 0.07, 0.04);
  }

  /** Uma martelada la dentro. Repete 3x na forja, entao e curta e um tico mais grave a cada vez. */
  public playToolboxForge(step = 0): void {
    const drop = step * 18;
    this.host.synth.noise('bandpass', 3000 - drop * 30, 4.2, 0.13, 0.035);
    this.host.synth.osc('square', 200 - drop, 110 - drop, 0.11, 0.055, 0.005);
    this.host.synth.osc('triangle', 480 - drop * 2, 360, 0.05, 0.05, 0.008);
  }

  /** O item novo saltando pra fora e caindo no chao: glissando curto pra cima e um toque seco. */
  public playToolboxDeliver(): void {
    this.host.synth.osc('triangle', 330, 660, 0.09, 0.13);
    this.host.synth.osc('square', 660, 990, 0.035, 0.1, 0.05);
    this.host.synth.noise('lowpass', 900, 1.2, 0.085, 0.08, 0.14); // a peca assentando no chao
  }

  /** Estes dois nao dao em nada: a tampa pula e bate de volta. A dobradica sem o fim feliz. */
  public playToolboxRefuse(): void {
    this.host.synth.osc('square', 240, 300, 0.055, 0.05);
    this.host.synth.noise('lowpass', 260, 1.3, 0.16, 0.1, 0.06); // o baque da tampa voltando
    this.host.synth.osc('sine', 130, 80, 0.075, 0.12, 0.06);
  }

  /** A PENA no papel (o caderno de desenho): um risco curto e baixo, repetido enquanto se desenha. */
  public playPenScratch(): void {
    this.host.synth.noise('bandpass', 2100 + Math.random() * 700, 1.6, 0.022, 0.07);
  }

  /** O BICHO SE ASSUSTA: um farfalho rápido subindo, de quem sai correndo do mato. */
  public playStartle(): void {
    this.host.synth.noise('bandpass', 1200, 1.1, 0.06, 0.16);
    this.host.synth.osc('triangle', 380, 640, 0.04, 0.09, 0.03);
  }

  /** O PAPEL abrindo: dois farfalhos secos, o segundo mais grave (a folha assentando). */
  public playPaperUnfold(): void {
    this.host.synth.noise('bandpass', 2400, 0.9, 0.09, 0.12);
    this.host.synth.noise('bandpass', 1300, 0.8, 0.07, 0.16, 0.1);
  }

  public playShopOpen(): void {
    if (this.host.synth.playSample('shopOpen')) return;
    this.host.synth.osc('sine', 196, 196, 0.18, 0.09);
    this.host.synth.osc('sine', 131, 131, 0.20, 0.16, 0.07);
  }

  public playShopClose(): void {
    if (this.host.synth.playSample('shopClose')) return;
    this.host.synth.osc('sine', 131, 131, 0.18, 0.09);
    this.host.synth.osc('sine', 196, 196, 0.16, 0.16, 0.07);
  }
}

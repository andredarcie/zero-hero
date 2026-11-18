// O SOM DAS CENAS: a nave da Thea (o chamado, a descida, o pouso, a porta, a subida), as canecas, a Morte chegando e
// indo, a chave, a fechadura e os portões. Tudo sintetizado (ver SoundManager.osc/noise).

import { detune } from './WorkSounds';
import type { SoundManager } from './SoundManager';

/** O que StorySounds usa de SoundManager. */
export type StorySoundsHost = Pick<SoundManager,
  'synth'
>;

export class StorySounds {
  public constructor(private readonly host: StorySoundsHost) {}

  /** O chamado pelo rádio: dois bipes secos, subindo. */
  public playShipCall(): void {
    const d = detune();
    this.host.synth.osc('square', 620 * d, 620 * d, 0.07, 0.03);
    this.host.synth.osc('square', 830 * d, 830 * d, 0.16, 0.03);
  }

  /** A nave descendo: um sopro que vai ficando grave conforme freia. */
  public playShipDescend(): void {
    const d = detune();
    this.host.synth.noise('lowpass', 420 * d, 0.7, 2.2, 0.07);
    this.host.synth.osc('sine', 150 * d, 56 * d, 2.2, 0.05);
  }

  /** O pouso: o peso no chão. */
  public playShipLand(): void {
    const d = detune();
    this.host.synth.noise('lowpass', 240 * d, 1, 0.42, 0.13);
    this.host.synth.osc('sine', 92 * d, 38 * d, 0.34, 0.16);
  }

  /** A porta: um chiado de pressão e o trinco. */
  public playShipDoor(): void {
    const d = detune();
    this.host.synth.noise('bandpass', 1500 * d, 1.1, 0.24, 0.035);
    this.host.synth.osc('triangle', 240 * d, 170 * d, 0.09, 0.05);
  }

  /** A decolagem: o motor carrega subindo, e o estouro leva tudo embora. */
  public playShipLift(): void {
    const d = detune();
    this.host.synth.noise('lowpass', 520 * d, 0.8, 3.1, 0.1);
    this.host.synth.osc('sine', 48 * d, 210 * d, 3, 0.09);
  }

  /** O brinde: duas canecas de esmalte, um toque curto e sem brilho demais. */
  public playMugClink(): void {
    const d = detune();
    this.host.synth.osc('triangle', 1180 * d, 1140 * d, 0.14, 0.05);
    this.host.synth.osc('sine', 1760 * d, 1720 * d, 0.08, 0.025);
  }

  /** Um gole: líquido grave, subindo um pouco no fim da garganta. */
  public playMugSip(): void {
    const d = detune();
    this.host.synth.noise('lowpass', 520 * d, 1.4, 0.14, 0.04);
    this.host.synth.osc('sine', 190 * d, 290 * d, 0.11, 0.05);
  }

  /** A Morte chegando: um ar grave que desce e não tem pressa. */
  public playDeathArrive(): void {
    const d = detune();
    this.host.synth.noise('lowpass', 380 * d, 0.9, 0.09, 1.7);
    this.host.synth.osc('sine', 98 * d, 49 * d, 0.11, 1.9);
  }

  /** E indo embora: só o ar, sem o peso. */
  public playDeathLeave(): void {
    this.host.synth.noise('lowpass', 300 * detune(), 1, 0.06, 1.2);
  }

  /** A chave saindo das costas: um tilintar pequeno de metal. */
  public playKeyJingle(): void {
    this.host.synth.osc('triangle', 2350, 2300, 0.022, 0.07);
    this.host.synth.osc('triangle', 3050, 3000, 0.016, 0.06, 0.05);
    this.host.synth.noise('bandpass', 4200, 6, 0.015, 0.05, 0.02);
  }

  /** A chave entrando no tambor: o raspar do metal nos pinos, e o encosto no fundo. */
  public playKeyInsert(): void {
    this.host.synth.noise('bandpass', 2600, 3, 0.05, 0.2);
    this.host.synth.noise('bandpass', 1700, 4, 0.03, 0.16, 0.04);
    this.host.synth.osc('square', 820, 640, 0.02, 0.025, 0.21);
    this.host.synth.noise('lowpass', 900, 1.2, 0.05, 0.04, 0.21);
  }

  /** Um dente do giro: o estalo seco de um pino caindo no lugar. */
  public playLockTick(): void {
    this.host.synth.osc('square', 1250, 1050, 0.022, 0.018);
    this.host.synth.noise('bandpass', 2800, 5, 0.04, 0.03);
  }

  /** O trinco cedendo: um baque grave de ferro pesado, com o eco curto da lingueta. */
  public playLockClunk(): void {
    this.host.synth.noise('lowpass', 420, 1, 0.16, 0.12);
    this.host.synth.osc('sine', 150, 82, 0.11, 0.2);
    this.host.synth.osc('triangle', 690, 520, 0.035, 0.06, 0.01);
    this.host.synth.noise('bandpass', 1500, 4, 0.03, 0.05, 0.09);
  }

  /** O portão velho abrindo: a dobradiça seca rangendo em duas puxadas, e a folha assentando no fim. */
  public playOldGateCreak(): void {
    this.host.synth.osc('triangle', 185, 262, 0.05, 0.45);
    this.host.synth.osc('triangle', 372, 520, 0.018, 0.45);
    this.host.synth.noise('bandpass', 950, 7, 0.04, 0.45);
    this.host.synth.osc('triangle', 262, 168, 0.045, 0.5, 0.42);
    this.host.synth.osc('triangle', 520, 336, 0.015, 0.5, 0.42);
    this.host.synth.noise('bandpass', 760, 7, 0.035, 0.5, 0.42);
    this.host.synth.noise('lowpass', 320, 1, 0.09, 0.14, 0.95);
  }

  /** A folha girando livre: dobradica rangendo e o batente soltando. */
  public playGateSwing(): void {
    this.host.synth.osc('triangle', 210, 95, 0.07, 0.3);
    this.host.synth.noise('bandpass', 1100, 2.4, 0.07, 0.16);
    this.host.synth.noise('lowpass', 500, 1.0, 0.09, 0.1, 0.2); // a folha assentando no fim do curso
  }

  /** A folha batendo no que esta do outro lado: o mesmo range, cortado por uma pancada surda. */
  public playGateStrain(): void {
    this.host.synth.osc('triangle', 210, 150, 0.06, 0.1);
    this.host.synth.noise('lowpass', 240, 1.2, 0.2, 0.11, 0.08); // o baque contra o obstaculo
    this.host.synth.osc('sine', 120, 70, 0.09, 0.14, 0.08);
  }

  /** A estrela cadente (a primeira noite): um fio de ar alto que desliza para baixo, e um brilho fino, sem estalo. */
  public playShootingStar(): void {
    const d = detune();
    this.host.synth.swell('bandpass', 2400 * d, 900 * d, 1.6, 0.014, 0.18, 1.1);
    this.host.synth.tone('sine', 1396 * d, 1047 * d, 0.006, 0.12, 1.2);
    this.host.synth.tone('sine', 2093 * d, 1568 * d, 0.0025, 0.1, 1.0, 0.05);
  }

  /** A água começando a ferver na chaleira da Shui: bolhas pequenas e graves, em cacho. */
  public playTeaBubble(): void {
    const d = detune();
    for (let i = 0; i < 5; i += 1) {
      const f = (220 + Math.random() * 260) * d;
      this.host.synth.osc('sine', f, f * 1.6, 0.012, 0.05, i * 0.06 + Math.random() * 0.03);
    }
    this.host.synth.noise('lowpass', 500 * d, 1, 0.02, 0.3);
  }

  /** O chá caindo na caneca: um fio de água que desce do agudo para o grave conforme ela enche. */
  public playTeaPour(): void {
    const d = detune();
    this.host.synth.swell('bandpass', 1700 * d, 700 * d, 2.2, 0.03, 0.2, 1.1);
    this.host.synth.tone('sine', 520 * d, 260 * d, 0.006, 0.4, 1.1);
  }

  /** A VIAGEM DO CHÁ, etapa por etapa (ver runtime/trip): tudo em fá maior, o tom do vale, entrando e saindo devagar. */
  public playTrip(stage: TripStage): void {
    const s = this.host.synth;
    switch (stage) {
      case 'inside': // dentro do elmo: um zumbido grave, como o próprio sangue
        s.tone('sine', 87.3, 87.3, 0.05, 2.5, 9);
        s.tone('sine', 130.8, 130.8, 0.018, 3, 9);
        break;
      case 'tingle': // o formigar: um chiado fino que cresce
        s.swell('bandpass', 2600, 4200, 3, 0.008, 4, 8);
        break;
      case 'colors': // as cores: o acorde de fá subindo devagar
        [174.6, 220, 261.6, 349.2].forEach((f, i) => s.tone('triangle', f, f, 0.014, 4 + i * 0.5, 10, i * 0.4));
        break;
      case 'open': // o elmo abrindo: o acorde sobe uma oitava, e o ar entra
        for (const f of [349.2, 440, 523.3]) s.tone('sine', f, f * 2, 0.012, 2.6, 3.5);
        s.swell('highpass', 800, 3000, 0.7, 0.02, 2.4, 3.5);
        break;
      case 'tunnel': // o túnel: o vento que acelera, e as notas subindo sem parar
        s.swell('bandpass', 220, 2600, 0.9, 0.05, 9, 14);
        [174.6, 261.6, 349.2, 523.3].forEach((f, i) => s.tone('triangle', f, f * 2, 0.008, 8, 14, i * 0.15));
        break;
      case 'bloom': // o clarão do fim: sinos claros em arpejo, e o acorde inteiro embaixo
        [698.5, 880, 1046.5, 1396.9, 1760].forEach((f, i) => s.osc('triangle', f, f, 0.026, 1.8, i * 0.12));
        for (const f of [174.6, 261.6, 349.2, 440]) s.tone('sine', f, f, 0.016, 4, 16);
        break;
      case 'return': // a volta: o acorde desce e assenta
        for (const f of [349.2, 440, 523.3]) s.tone('sine', f, f * 0.5, 0.012, 1.5, 6);
        break;
    }
  }
}

/** As etapas da viagem do chá que têm som próprio (ver StorySounds.playTrip). */
export type TripStage = 'inside' | 'tingle' | 'colors' | 'open' | 'tunnel' | 'bloom' | 'return';

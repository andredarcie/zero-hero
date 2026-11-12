// O SOM DO VALE VIVO: o fogo pegando e respirando, a gota, o sapo, o peixe, a poça, o vento, a onda longe, e a flor da lua
// abrindo e fechando. Tudo sintetizado (ver SoundManager.osc/noise).

import type { SoundManager } from './SoundManager';

/** O que NatureSounds usa de SoundManager. */
export type NatureSoundsHost = Pick<SoundManager,
  'synth'
>;

export class NatureSounds {
  public constructor(private readonly host: NatureSoundsHost) {}

  /** A fogueira do fim pegando: o fogo de sempre, e por cima três notas que nenhuma outra fogueira tem. */
  public playHearthCatch(): void {
    this.playIgnite();
    [349.2, 523.3, 698.5].forEach((f, i) => this.host.synth.osc('triangle', f, f, 0.07, 1.4, 0.25 + i * 0.28));
  }

  /**
   * APANHAR UMA COISA DO CHÃO — o som de GUARDAR.
   *
   * Pisar num graveto, numa pedra, num minério ou num carvão tocava o tilintar metálico da moeda,
   * com escada de tom e tudo, e numa cadeia de minério (cinco blocos saltando de uma rocha) o
   * ouvido acreditava estar enriquecendo. Removida a moeda do jogo, esta voz ficou sendo a única —
   * e ela é o oposto da que estava aqui em todos os eixos que o ouvido usa: grave em vez de agudo,
   * DESCENDO em vez de subindo, com um chiado surdo por baixo (o couro da mochila) em vez do
   * sustain limpo de metal. Continua curta, porque uma pisada apanha e segue andando.
   *
   * Sintetizada e sem amostra de propósito: ela toca dezenas de vezes por minuto numa mineração, e
   * som que se repete tanto tem de ser barato de tocar e fácil de reafinar quando incomodar.
   */
  /** O tchau de longe (entities/NpcWave): dois assobios curtos, o segundo descendo — "oi!". */
  public playFarWave(): void {
    this.host.synth.osc('sine', 880, 1180, 0.035, 0.14);
    this.host.synth.osc('sine', 1180, 880, 0.035, 0.2, 0.18);
  }

  /** A single water drop — the title screen fires one per word as it drops in. */
  public playWaterDrop(): void {
    if (this.host.synth.playSample('dropWater', 0.5)) return; // slight pitch jitter so drops never repeat exactly
    // Fallback mirrors the sample: an upward pitch snap (the drip "ploop") + a faint low plunk.
    this.host.synth.osc('sine', 700, 1700, 0.3, 0.08);
    this.host.synth.osc('sine', 300, 210, 0.12, 0.05);
  }

  public playIgnite(): void {
    if (this.host.synth.playSample('ignite')) return;
    this.host.synth.noise('lowpass', 500, 1.2, 0.36, 0.32);
    this.host.synth.osc('sawtooth', 90, 200, 0.14, 0.30, 0.05);
  }

  /** A chama pegou no forno: um sopro grave de tiragem, ar entrando na fornalha. */
  public playFurnaceIgnite(): void {
    this.host.synth.noise('lowpass', 300, 1.1, 0.14, 0.24);
    this.host.synth.osc('triangle', 58, 92, 0.09, 0.3, 0.03);
  }

  /** Respiração curta do forno em regime, baixa porque se repete durante a fornada. */
  public playFurnaceBreath(): void {
    this.host.synth.noise('bandpass', 3100, 1.6, 0.04, 0.08);
    this.host.synth.noise('highpass', 5200, 1.0, 0.02, 0.05, 0.01);
  }

  /**
   * O "plop" do sapo pulando na água (objects/nature/Frogs): a gota do título, mais grave e baixa — um corpo
   * pequeno entrando na água, não uma pedra.
   */
  public playFrogPlop(): void {
    if (this.host.synth.playSample('dropWater', 1, 0.5, 0.72)) return;
    this.host.synth.osc('sine', 520, 260, 0.14, 0.05);
  }

  /** O peixe voltando para a água (objects/nature/FishJumps): o splash, baixo e agudo, um peixe e não um balde. */
  public playFishSplash(): void {
    if (this.host.synth.playSample('splash', 1, 0.32, 1.25)) return;
    this.host.synth.noise('lowpass', 1400, 0.6, 0.12, 0.05);
  }

  /** A PEDRA QUICANDO (scenes/game/StoneSkipping): a gota do título, curta, subindo um tom a cada quique. */
  public playStoneSkip(n: number): void {
    const rate = Math.min(1.9, 0.95 + n * 0.1);
    if (this.host.synth.playSample('dropWater', 0, 0.42, rate)) return;
    this.host.synth.osc('sine', 600 * rate, 1300 * rate, 0.12, 0.05);
  }

  /** A pedra que afunda no fim: o "plop" da rã, mais grave. */
  public playStonePlunk(): void {
    if (this.host.synth.playSample('dropWater', 0, 0.6, 0.6)) return;
    this.host.synth.osc('sine', 420, 200, 0.14, 0.07);
  }

  /** O pé na poça (objects/nature/Puddles): o splash curto e agudo, quase um "chap". */
  public playPuddleSplash(): void {
    if (this.host.synth.playSample('splash', 1.5, 0.28, 1.55)) return;
    this.host.synth.noise('lowpass', 1800, 0.6, 0.09, 0.05);
  }

  public playSplash(): void {
    if (this.host.synth.playSample('splash', 0.5)) return;
    this.host.synth.noise('lowpass', 1100, 0.6, 0.24, 0.16);
    this.host.synth.noise('highpass', 2800, 0.5, 0.11, 0.14, 0.02);
  }

  public playFireHit(): void {
    if (this.host.synth.playSample('fireHit', 0.9)) return;
    this.host.synth.noise('lowpass', 700, 1.5, 0.24, 0.10);
    this.host.synth.osc('sawtooth', 200, 110, 0.12, 0.08);
  }

  /**
   * O VENTO QUE LEVA A NÉVOA DO JARDIM ALTO: uma rajada que entra baixa, sobe, atravessa e vai embora — ar
   * filtrado em faixas que se sobrepõem, mais agudo no meio, e um sopro grave por baixo. Uns três segundos.
   */
  public playWindGust(): void {
    const bands: ReadonlyArray<readonly [number, number, number]> = [
      // [freq, volume, atraso]
      [260, 0.05, 0], [380, 0.08, 0.35], [560, 0.11, 0.75], [820, 0.12, 1.15],
      [700, 0.1, 1.55], [520, 0.08, 1.95], [360, 0.05, 2.35],
    ];
    for (const [freq, vol, at] of bands) this.host.synth.noise('bandpass', freq, 0.9, vol, 1.3, at);
    this.host.synth.noise('lowpass', 180, 0.7, 0.07, 3.2);
    this.host.synth.osc('sine', 70, 52, 0.04, 3, 0.2);
  }

  /** A flor abrindo: ar entrando devagar e um sino distante subindo uma quinta. */
  public playMoonflowerBloom(): void {
    // O sopro: passa-banda subindo devagar. E ele que da a duracao — a flor abre em ~1,4s, e um
    // som curto por cima de uma animacao longa faz a animacao parecer atrasada.
    this.host.synth.noise('bandpass', 700, 1.4, 0.075, 0.9);
    this.host.synth.noise('highpass', 3200, 0.8, 0.03, 0.7, 0.15);
    // O sino: A4 e a quinta acima, o intervalo mais aberto que existe — a mesma "abertura" do
    // gesto. Entra depois do sopro comecar, nunca junto: e a flor que ABRIU, nao o ar.
    this.host.synth.osc('sine', 440, 440, 0.085, 0.9, 0.28);
    this.host.synth.osc('sine', 659, 659, 0.05, 0.8, 0.42);
    this.host.synth.osc('triangle', 220, 220, 0.045, 1.0, 0.3);
  }

  /** A flor fechando: o mesmo ar, agora descendo, cortado pelo tapa das petalas se encontrando. */
  public playMoonflowerClose(): void {
    this.host.synth.noise('bandpass', 1500, 1.6, 0.07, 0.26);
    this.host.synth.osc('sine', 520, 180, 0.06, 0.24);
    // O tapa: grave, curto e sem brilho nenhum. E o que separa "fechou" de "esta fechando".
    this.host.synth.noise('lowpass', 300, 1.1, 0.12, 0.09, 0.2);
  }
}

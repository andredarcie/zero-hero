// O SOM DO TRABALHO DAS MÃOS: os passos por material, o toque nas coisas, a espada e o machado, o martelo e a bigorna,
// a pedra quebrando, o capim e o cogumelo cortados, a árvore caindo, a ponte. Tudo sintetizado (ver SoundManager.osc/noise).

import type { Material, Surface } from '@/game/audio/materials';
import type { SoundManager } from './SoundManager';

export const SAMPLES = {
  // O JOGO NAO TEM COMBATE, e a tabela tambem nao: os sons de briga (golpe, dano, morte, os
  // telegrafos do bestiario, a bomba) sairam daqui junto com o que os tocava. O que ficou foi
  // remixado para baixo onde batia forte demais para um vale tranquilo — a rocha estourando, o
  // machado, a arvore caindo —, porque o volume desta coluna e uma decisao de jogo.
  swordSlash: { file: 'combat/sword-swing.wav', vol: 0.55 }, // o assobio da espada descendo (abertura)
  heartPickup: { file: 'heart.mp3', vol: 0.6 },
  swordPickup: { file: 'item-pickup.mp3', vol: 0.55 }, // item get (Freesound #37089, see CREDITS.md)
  dropWater: { file: 'water-drop.mp3', vol: 0.65 }, // a gota do titulo
  titleImpact: { file: 'title-impact.mp3', vol: 0.9 }, // a espada entrando na terra (abertura)
  singingBowl: { file: 'singing-bowl.mp3', vol: 0.75 }, // o sino dos momentos bons
  shopOpen: { file: 'shop-open.mp3', vol: 0.45 },
  shopClose: { file: 'shop-close.mp3', vol: 0.5 },
  ignite: { file: 'ignite.mp3', vol: 0.6 },
  woodChop: { file: 'wood-chop.mp3', vol: 0.5 },
  treeFall: { file: 'tree-fall.mp3', vol: 0.45 },
  splash: { file: 'splash.mp3', vol: 0.55 },
  rockSmash: { file: 'rock-smash.mp3', vol: 0.42 },
  grassCut: { file: 'grass-cut.mp3', vol: 0.5 },
  fireHit: { file: 'combat/fire-hit.wav', vol: 0.45 },
  bridgePlank: { file: 'bridge-plank.mp3', vol: 0.55 },
  bridgeBuilt: { file: 'bridge-built.mp3', vol: 0.6 },
  hammer: { file: 'hammer.mp3', vol: 0.5 }, // nailing a plank home during a bridge build
  footstep0: { file: 'footstep-0.wav', vol: 0.4 },
  footstep1: { file: 'footstep-1.wav', vol: 0.4 },
  footstep2: { file: 'footstep-2.wav', vol: 0.4 },
  footstep3: { file: 'footstep-3.wav', vol: 0.4 },
} as const;
export type SampleKey = keyof typeof SAMPLES;
const FOOTSTEP_KEYS: readonly SampleKey[] = ['footstep0', 'footstep1', 'footstep2', 'footstep3'];
/**
 * Fator de altura para um som SINTETIZADO que se repete — o equivalente do jitter que `playSample`
 * dá às amostras. ±4% (uns dois terços de semitom) é o bastante para o ouvido parar de reconhecer
 * a repetição e pouco o bastante para o som continuar sendo o mesmo som.
 */
export const detune = (): number => 1 + (Math.random() * 2 - 1) * 0.04;

/** O que WorkSounds usa de SoundManager. */
export type WorkSoundsHost = Pick<SoundManager,
  'synth'
>;

export class WorkSounds {
  private lastFootstep = -1;

  public constructor(private readonly host: WorkSoundsHost) {}

  public playFootstep(): void {
    // Rotate the four variants (never the same one twice) + rate jitter.
    let pick = Math.floor(Math.random() * FOOTSTEP_KEYS.length);
    if (pick === this.lastFootstep) pick = (pick + 1) % FOOTSTEP_KEYS.length;
    this.lastFootstep = pick;
    if (this.host.synth.playSample(FOOTSTEP_KEYS[pick], 1.2, 0.85 + Math.random() * 0.3)) return;
    this.host.synth.noise('lowpass', 120, 1.0, 0.09, 0.06);
  }

  /** O pé no chão: a grama é a amostra de sempre, e o resto se faz aqui, porque um passo toca o tempo todo. */
  public playStep(surface: Surface): void {
    const d = 0.92 + Math.random() * 0.16;
    if (surface === 'grass') { this.playFootstep(); return; }
    if (surface === 'dirt') {
      this.host.synth.noise('lowpass', 420 * d, 0.9, 0.2, 0.07);
    } else if (surface === 'stone') {
      this.host.synth.noise('bandpass', 2100 * d, 2.2, 0.09, 0.022);
      this.host.synth.noise('lowpass', 500 * d, 1, 0.14, 0.04);
    } else {
      this.host.synth.osc('triangle', 210 * d, 130 * d, 0.13, 0.07);
      this.host.synth.noise('bandpass', 1100 * d, 2.5, 0.05, 0.02);
    }
  }

  /** O corpo de cada material: é o que pegar e pousar têm em comum. */
  public materialKnock(material: Material, pitch: number, vol: number): void {
    switch (material) {
      case 'wood':
        this.host.synth.osc('triangle', 330 * pitch, 190 * pitch, 0.16 * vol, 0.08);
        this.host.synth.noise('bandpass', 1300 * pitch, 2.5, 0.05 * vol, 0.02);
        break;
      case 'stone':
        this.host.synth.noise('bandpass', 1900 * pitch, 3, 0.13 * vol, 0.03);
        this.host.synth.noise('lowpass', 600 * pitch, 1, 0.16 * vol, 0.06);
        break;
      case 'metal':
        this.host.synth.osc('triangle', 980 * pitch, 960 * pitch, 0.07 * vol, 0.22);
        this.host.synth.osc('sine', 2470 * pitch, 2450 * pitch, 0.03 * vol, 0.14);
        break;
      case 'glass':
        this.host.synth.osc('sine', 2090 * pitch, 2080 * pitch, 0.07 * vol, 0.16);
        this.host.synth.osc('sine', 3136 * pitch, 3130 * pitch, 0.03 * vol, 0.1);
        break;
      default:
        this.host.synth.noise('lowpass', 700 * pitch, 0.8, 0.11 * vol, 0.07);
        this.host.synth.osc('sine', 260 * pitch, 180 * pitch, 0.07 * vol, 0.07);
    }
  }

  /** A espada fincada, tocada: um anel longo que só ela tem. */
  public playSwordHum(): void {
    this.host.synth.osc('sine', 880, 878, 0.05, 1.6);
    this.host.synth.osc('sine', 1318, 1316, 0.028, 1.2, 0.02);
    this.host.synth.osc('triangle', 220, 219, 0.04, 0.9);
  }

  /** Cada achado tem o seu toque, e é o que faz ele parecer uma coisa de verdade antes de qualquer texto. */
  public playFindTouch(kind: string): void {
    switch (kind) {
      case 'helmet':
        this.host.synth.osc('triangle', 520, 505, 0.1, 0.4);
        this.host.synth.osc('sine', 1310, 1290, 0.03, 0.25);
        break;
      case 'bottle':
        this.materialKnock('glass', 1, 1.1);
        break;
      case 'door':
        [0, 0.2, 0.4].forEach((at) => {
          this.host.synth.osc('triangle', 180, 120, 0.2, 0.08, at);
          this.host.synth.noise('bandpass', 900, 2, 0.05, 0.02, at);
        });
        break;
      case 'sign':
        // A madeira velha e oca da placa: um toque surdo, e o musgo abafa o resto.
        this.materialKnock('wood', 0.7, 0.8);
        break;
      case 'chair':
        // A madeira da cadeira range sob o peso: um nó grave e um estalo curto.
        this.materialKnock('wood', 0.8, 0.9);
        this.host.synth.osc('triangle', 210, 160, 0.05, 0.14, 0.06);
        break;
      default:
        this.materialKnock('wood', 0.9, 1);
    }
  }

  public playSwordSlash(): void {
    if (this.host.synth.playSample('swordSlash', 0.7)) return;
    this.host.synth.noise('lowpass', 900, 0.7, 0.26, 0.13);
    this.host.synth.osc('sawtooth', 150, 45, 0.16, 0.12);
  }

  public playWoodChop(): void {
    if (this.host.synth.playSample('woodChop', 1.0)) return;
    this.host.synth.noise('lowpass', 600, 1.4, 0.34, 0.07);
    this.host.synth.osc('square', 190, 90, 0.16, 0.09);
    this.host.synth.noise('highpass', 1800, 1.0, 0.08, 0.05, 0.02);
  }

  /** A lâmina cortando o ar: sopro, sem pancada nenhuma. */
  public playAxeWhoosh(): void {
    this.host.synth.noise('bandpass', 700, 0.9, 0.2, 0.17);
    this.host.synth.noise('bandpass', 1500, 1.4, 0.07, 0.1, 0.03);
  }

  /** A lâmina entrando no tronco: o baque surdo da madeira, e o estalo seco da fibra. */
  public playAxeBite(): void {
    this.playWoodChop();
    this.host.synth.osc('triangle', 210, 62, 0.34, 0.15);
    this.host.synth.noise('lowpass', 1100, 1.2, 0.32, 0.07);
    this.host.synth.noise('highpass', 2600, 1.0, 0.12, 0.03, 0.01);
  }

  public playBridgePlank(): void {
    if (this.host.synth.playSample('bridgePlank', 0.8)) return;
    // A wet wooden knock — a graveto laid onto the frame over the river.
    this.host.synth.noise('lowpass', 420, 1.6, 0.26, 0.06);
    this.host.synth.osc('square', 150, 78, 0.14, 0.10);
    this.host.synth.osc('triangle', 300, 300, 0.07, 0.05, 0.01);
    this.host.synth.noise('highpass', 2600, 0.6, 0.06, 0.10, 0.02); // faint splash tail
  }

  /** `blow` é qual pancada esta é: a peça vai endurecendo, e o som sobe junto. */
  public playHammer(blow = 0): void {
    // Nailing a plank home: a bright metallic tick over a short hollow-wood knock.
    if (this.host.synth.playSample('hammer', 0.9 + Math.random() * 0.25, 1, 1 + blow * 0.09)) return;
    this.host.synth.noise('bandpass', 3200, 4.0, 0.14, 0.03);
    this.host.synth.osc('square', 220, 120, 0.12, 0.05, 0.005);
    this.host.synth.osc('triangle', 520, 380, 0.05, 0.04, 0.005);
  }

  public playBridgeBuilt(): void {
    if (this.host.synth.playSample('bridgeBuilt')) return;
    this.host.synth.noise('lowpass', 500, 1.4, 0.24, 0.06);
    this.host.synth.osc('square', 170, 90, 0.14, 0.08);
    this.host.synth.osc('square', 150, 80, 0.12, 0.08, 0.07);
    this.host.synth.osc('triangle', 262, 262, 0.16, 0.16, 0.10);
    this.host.synth.osc('triangle', 330, 330, 0.16, 0.16, 0.20);
    this.host.synth.osc('triangle', 392, 392, 0.18, 0.26, 0.30);
  }

  public playTreeFall(): void {
    if (this.host.synth.playSample('treeFall')) return;
    this.host.synth.osc('sawtooth', 130, 58, 0.14, 0.34);
    this.host.synth.noise('lowpass', 700, 0.8, 0.20, 0.34, 0.16);
  }

  public playRockSmash(): void {
    if (this.host.synth.playSample('rockSmash', 0.9)) return;
    this.host.synth.noise('bandpass', 2600, 3.0, 0.22, 0.05);
    this.host.synth.osc('square', 320, 140, 0.14, 0.07);
    this.host.synth.noise('lowpass', 500, 1.0, 0.22, 0.14, 0.02);
  }

  public playGrassCut(): void {
    if (this.host.synth.playSample('grassCut', 1.2)) return;
    this.host.synth.noise('highpass', 2400, 0.8, 0.16, 0.12);
    this.host.synth.noise('bandpass', 900, 1.2, 0.10, 0.10, 0.04);
  }

  /**
   * O CORTE DO COGUMELO: um "tic" seco de lâmina passando pela carne e, colado nele, o POP — a
   * bolha de seno que sobe de tom rápido (o mesmo gesto do pingo d'água, mais curto e mais
   * redondo). É o som da recompensa do mini-game, então é gostoso e nunca agudo demais.
   */
  public playMushroomCut(): void {
    const d = detune();
    this.host.synth.noise('bandpass', 3200 * d, 2.2, 0.10, 0.035);        // o fio da lâmina
    this.host.synth.osc('sine', 260 * d, 820 * d, 0.22, 0.09, 0.012);     // o pop subindo
    this.host.synth.osc('sine', 520 * d, 1240 * d, 0.05, 0.06, 0.012);    // o brilho do pop, uma oitava acima
    this.host.synth.osc('triangle', 140 * d, 90 * d, 0.08, 0.08, 0.02);   // o corpo do cogumelo soltando
  }

  /**
   * A TERRA ESCORRENDO da bucha: um chiado granulado e baixinho, filtrado em faixa estreita. Toca
   * muitas vezes seguidas enquanto se esfrega, por isso é curto, quieto e varia de tom sozinho.
   */
  public playSandTrickle(): void {
    const d = detune();
    this.host.synth.noise('bandpass', 1700 * d, 1.6, 0.05, 0.07);
    this.host.synth.noise('highpass', 4200 * d, 0.7, 0.02, 0.05, 0.02);
  }

  /** Uma martelada na bigorna. A última toca mais cheia e mais longa. */
  public playAnvilStrike(last = false): void {
    const ring = last ? 1.1 : 0.7;
    this.host.synth.noise('highpass', 2400, 0.8, 0.09, 0.03);
    this.host.synth.noise('bandpass', 1300, 2, 0.07, 0.05);
    for (const [freq, vol] of [[905, 0.05], [1489, 0.04], [2210, 0.028], [3080, 0.018]] as const) {
      this.host.synth.osc('sine', freq, freq * 0.998, vol, ring);
    }
    this.host.synth.osc('sine', 150, 80, 0.09, 0.16);
    this.host.synth.noise('lowpass', 260, 1, 0.08, 0.1);
  }

  /** Pegar o martelinho do toco: o cabo de madeira raspando e o ferro tocando de leve. */
  public playForgeHammerPickup(): void {
    this.host.synth.noise('bandpass', 900, 3, 0.04, 0.06);
    this.host.synth.osc('triangle', 1850, 1820, 0.015, 0.12, 0.04);
  }

  /** Devolver o martelinho: ele encosta no toco. */
  public playForgeHammerSetDown(): void {
    this.host.synth.noise('lowpass', 500, 1, 0.07, 0.06);
    this.host.synth.osc('triangle', 1600, 1580, 0.012, 0.1, 0.03);
  }
}

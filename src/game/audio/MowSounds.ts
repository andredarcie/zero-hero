// O SOM DA FOICE NO MATO (pedido do autor, 2026-11-17: "crie sons especificamente para esse corte de grama, que são
// também variáveis, para não ficar repetitivo"). O corte usava a mesma amostra do farfalhar de plantar: um chiado só,
// igual toda vez.
//
// Um golpe de foice no capim, ouvido de perto, são quatro coisas, e cada uma é sorteada de novo a cada golpe:
//   1. O ASSOBIO da lâmina no ar: ruído numa faixa estreita que sobe de tom enquanto a lâmina acelera e cai quando ela
//      passa — o "fwip". Vem antes do contato (`playSwish`, no começo da varrida).
//   2. O CORTE: dezenas de talos se rompendo em sessenta milissegundos — uma chuva de estalinhos curtíssimos, cada um
//      no seu tom, que aceleram (a lâmina pega primeiro um talo, depois muitos), e dois ou três talos grossos que
//      estalam mais grave. É o que faz o ouvido acreditar no corte.
//   3. O "CHHK": o sopro agudo da lâmina atravessando a touceira inteira, colado nos estalos.
//   4. A CAÍDA: o farfalhar baixinho das pontas caindo, e uns toquinhos quando elas pousam.
// E em SEQUÊNCIA o golpe sobe um nadinha de tom (até +12% no quarto corte seguido): roçar o mato vira um ritmo, não uma
// repetição. Nada é amostra: o ruído é um buffer branco de um segundo, tocado de um ponto sorteado a cada grão.
//
// O PLANO (o que tocar, quando, em que tom) é uma conta pura, testada (`planMowCut`); a WebAudio só executa.

import type { SoundManager } from './SoundManager';

/** Um grão de ruído filtrado: quando (s, a partir do agora), quanto dura, a faixa, o volume. */
export interface NoiseGrain {
  at: number;
  dur: number;
  type: BiquadFilterType;
  freq: number;
  /** Para onde o filtro desliza até o fim do grão (o assobio sobe e desce); ausente = parado. */
  freqTo?: number;
  q: number;
  vol: number;
  /** 'hit' entra em 1 ms e cai exponencial; 'swell' cresce e se desfaz (o assobio, a caída). */
  shape: 'hit' | 'swell';
}

/** Até quantos golpes em sequência o tom sobe, e quanto cada um. */
const COMBO_MAX = 3;
const COMBO_STEP = 0.04;
/** Golpes mais perto que isto contam como sequência. */
export const COMBO_WINDOW_S = 1.2;

const between = (rand: () => number, a: number, b: number): number => a + (b - a) * rand();

/** O assobio da lâmina, sorteado. */
export const planMowSwish = (rand: () => number = Math.random): NoiseGrain[] => {
  const dur = between(rand, 0.16, 0.22);
  const low = between(rand, 520, 760);
  return [
    { at: 0, dur, type: 'bandpass', freq: low, freqTo: low * between(rand, 2.6, 3.4), q: between(rand, 0.9, 1.4), vol: between(rand, 0.1, 0.14), shape: 'swell' },
    // o corpo de ar, grave, que dá peso ao gesto
    { at: 0.02, dur: dur * 0.8, type: 'lowpass', freq: between(rand, 300, 420), q: 0.7, vol: between(rand, 0.05, 0.07), shape: 'swell' },
  ];
};

/** O corte, sorteado; `combo` = quantos cortes vieram logo antes (0 = o primeiro). */
export const planMowCut = (blades: number, combo: number, rand: () => number = Math.random): NoiseGrain[] => {
  const pitch = 1 + Math.min(COMBO_MAX, Math.max(0, combo)) * COMBO_STEP;
  const grains: NoiseGrain[] = [];
  // 2. os talos: mais fios no tufo, mais estalos (7 a 13), espalhados em 45..70 ms e acelerando
  const snaps = Math.max(7, Math.min(13, Math.round(blades * 0.8 + between(rand, -1, 2))));
  const span = between(rand, 0.045, 0.07);
  for (let i = 0; i < snaps; i += 1) {
    const u = (i + rand() * 0.6) / snaps;
    grains.push({
      at: span * Math.pow(u, 1.35),
      dur: between(rand, 0.004, 0.009),
      type: 'bandpass',
      freq: between(rand, 2400, 5200) * pitch,
      q: between(rand, 2, 4),
      vol: between(rand, 0.07, 0.17),
      shape: 'hit',
    });
  }
  const thick = 2 + Math.floor(rand() * 2);
  for (let i = 0; i < thick; i += 1) {
    grains.push({
      at: between(rand, 0.008, span),
      dur: between(rand, 0.01, 0.016),
      type: 'bandpass',
      freq: between(rand, 1100, 1800) * pitch,
      q: between(rand, 2.5, 3.5),
      vol: between(rand, 0.12, 0.2),
      shape: 'hit',
    });
  }
  // 3. o chhk da lâmina atravessando a touceira
  grains.push({
    at: 0.004, dur: between(rand, 0.05, 0.08), type: 'highpass', freq: between(rand, 2800, 3800) * pitch, q: 0.7,
    vol: between(rand, 0.1, 0.14), shape: 'hit',
  });
  // 4. a caída: o farfalhar das pontas e os toquinhos de quando elas pousam
  grains.push({
    at: between(rand, 0.03, 0.06), dur: between(rand, 0.3, 0.48), type: 'bandpass', freq: between(rand, 1200, 2000) * pitch,
    freqTo: between(rand, 700, 1000), q: 0.7, vol: between(rand, 0.045, 0.065), shape: 'swell',
  });
  const lands = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < lands; i += 1) {
    grains.push({
      at: between(rand, 0.2, 0.56), dur: between(rand, 0.005, 0.008), type: 'lowpass', freq: between(rand, 700, 1100), q: 1,
      vol: between(rand, 0.03, 0.05), shape: 'hit',
    });
  }
  return grains.sort((a, b) => a.at - b.at);
};

/** O que MowSounds usa de SoundManager. */
export type MowSoundsHost = Pick<SoundManager, 'audio' | 'sfxUserBus'>;

export class MowSounds {
  private noise?: AudioBuffer;
  private lastCutAt = -10;
  private combo = 0;

  public constructor(private readonly host: MowSoundsHost) {}

  /** O assobio da lâmina descendo (o começo da varrida). */
  public playSwish(): void {
    this.play(planMowSwish());
  }

  /** O corte de um tufo de `blades` fios. */
  public playCut(blades: number): void {
    const ctx = this.host.audio;
    if (!ctx) return;
    const now = ctx.currentTime;
    this.combo = now - this.lastCutAt < COMBO_WINDOW_S ? this.combo + 1 : 0;
    this.lastCutAt = now;
    this.play(planMowCut(blades, this.combo));
  }

  private play(grains: readonly NoiseGrain[]): void {
    const ctx = this.host.audio;
    if (!ctx) return;
    const noise = this.noiseBuffer(ctx);
    const t0 = ctx.currentTime + 0.005;
    for (const g of grains) {
      const t = t0 + g.at;
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const f = ctx.createBiquadFilter();
      f.type = g.type;
      f.Q.value = g.q;
      f.frequency.setValueAtTime(g.freq, t);
      if (g.freqTo) {
        // o assobio sobe até 45% e volta; a caída só desce
        if (g.shape === 'swell' && g.freqTo > g.freq) {
          f.frequency.exponentialRampToValueAtTime(g.freqTo, t + g.dur * 0.45);
          f.frequency.exponentialRampToValueAtTime(g.freq * 1.1, t + g.dur);
        } else {
          f.frequency.exponentialRampToValueAtTime(g.freqTo, t + g.dur);
        }
      }
      const amp = ctx.createGain();
      if (g.shape === 'hit') {
        amp.gain.setValueAtTime(0, t);
        amp.gain.linearRampToValueAtTime(g.vol, t + 0.001);
        amp.gain.exponentialRampToValueAtTime(0.0005, t + g.dur);
      } else {
        amp.gain.setValueAtTime(0, t);
        amp.gain.linearRampToValueAtTime(g.vol, t + g.dur * 0.4);
        amp.gain.linearRampToValueAtTime(0, t + g.dur);
      }
      src.connect(f);
      f.connect(amp);
      amp.connect(this.host.sfxUserBus);
      // cada grão lê o ruído de um ponto sorteado: nunca o mesmo chiado duas vezes
      src.start(t, Math.random() * (noise.duration - g.dur - 0.02), g.dur + 0.01);
    }
  }

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noise && this.noise.sampleRate === ctx.sampleRate) return this.noise;
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < ch.length; i += 1) ch[i] = Math.random() * 2 - 1;
    this.noise = buf;
    return buf;
  }
}

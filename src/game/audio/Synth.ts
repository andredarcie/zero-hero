// O SINTETIZADOR DOS EFEITOS: um oscilador com envelope, um ruído filtrado, e uma amostra gravada tocada no barramento dos
// efeitos. Todo som de efeito do jogo sai destes três (ver WorkSounds, UiSounds, NatureSounds, StorySounds).

import { SAMPLES, type SampleKey } from './WorkSounds';
import type { SoundManager } from './SoundManager';

/** O que Synth usa de SoundManager. */
export type SynthHost = Pick<SoundManager,
  'audio' | 'buffers' | 'sfxUserBus'
>;

export class Synth {
  public constructor(private readonly host: SynthHost) {}

  /**
   * Play a decoded sample. `jitter` is a ± range in semitones applied to the playback
   * rate so frequent sounds (hits, steps, chops) never machine-gun the exact same file.
   * Returns false if the sample isn't loaded yet (caller falls back to the synth).
   */
  public playSample(key: SampleKey, jitter = 0, volScale = 1, rate = 1): boolean {
    const buffer = this.host.buffers.get(key);
    if (!buffer) return false;
    const ctx = this.host.audio; // ensures this.master exists
    if (!ctx) return true; // sem som: o efeito "tocou" mudo (não cai no sintetizador)
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    // `rate` e a altura FIXA de quem fala (a voz por especie, ver ENEMY_VOICE); o jitter aleatorio
    // multiplica por cima, entao a variacao continua existindo DENTRO da voz de cada corpo.
    src.playbackRate.value = rate
      * (jitter > 0 ? Math.pow(2, ((Math.random() * 2 - 1) * jitter) / 12) : 1);
    const g = ctx.createGain();
    g.gain.value = SAMPLES[key].vol * volScale;
    src.connect(g);
    g.connect(this.host.sfxUserBus);
    src.start();
    return true;
  }

  public osc(
    type: OscillatorType,
    freqStart: number,
    freqEnd: number,
    vol: number,
    duration: number,
    delay = 0,
  ): void {
    const ctx = this.host.audio; // ensures this.master is initialised
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freqStart, t);
    if (freqEnd !== freqStart) o.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 0.01), t + duration);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.005, duration * 0.1));
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g);
    g.connect(this.host.sfxUserBus);
    o.start(t);
    o.stop(t + duration + 0.01);
  }

  public noise(
    filterType: BiquadFilterType,
    filterFreq: number,
    filterQ: number,
    vol: number,
    duration: number,
    delay = 0,
  ): void {
    const ctx = this.host.audio; // ensures this.master is initialised
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const len = Math.ceil(ctx.sampleRate * (duration + 0.02));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = filterFreq;
    f.Q.value = filterQ;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(f);
    f.connect(g);
    g.connect(this.host.sfxUserBus);
    src.start(t);
    src.stop(t + duration + 0.02);
  }
}

const MASTER_VOL = 0.32;

class SoundManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;

  private get audio(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = MASTER_VOL;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  // ── low-level helpers ────────────────────────────────────────────────────
  // Both helpers call this.audio first so this.master is guaranteed to exist
  // before it is used. Never pass this.master as an argument — it may be
  // undefined at call-site if the AudioContext hasn't been created yet.

  private osc(
    type: OscillatorType,
    freqStart: number,
    freqEnd: number,
    vol: number,
    duration: number,
    delay = 0,
  ): void {
    const ctx = this.audio; // ensures this.master is initialised
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
    g.connect(this.master);
    o.start(t);
    o.stop(t + duration + 0.01);
  }

  private noise(
    filterType: BiquadFilterType,
    filterFreq: number,
    filterQ: number,
    vol: number,
    duration: number,
    delay = 0,
  ): void {
    const ctx = this.audio; // ensures this.master is initialised
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
    g.connect(this.master);
    src.start(t);
    src.stop(t + duration + 0.02);
  }

  // ── public sound effects ─────────────────────────────────────────────────

  public playFootstep(): void {
    this.noise('lowpass', 160, 1.0, 0.10, 0.055);
  }

  public playSwordSlash(): void {
    this.noise('highpass', 2200, 0.6, 0.28, 0.11);
    this.osc('sawtooth', 190, 55, 0.18, 0.10);
  }

  public playEnemyHit(): void {
    this.noise('bandpass', 520, 2.5, 0.48, 0.07);
    this.osc('square', 180, 80, 0.22, 0.07);
  }

  public playEnemyDeath(): void {
    const notes = [196, 147, 98] as const;
    notes.forEach((freq, i) => {
      this.osc('sawtooth', freq, freq * 0.65, 0.28, 0.13, i * 0.10);
      this.noise('bandpass', 380, 1.5, 0.18, 0.07, i * 0.10);
    });
  }

  public playPlayerHurt(): void {
    this.osc('square', 220, 210, 0.32, 0.22);
    this.osc('square', 233, 220, 0.20, 0.20);
    this.noise('bandpass', 600, 1.5, 0.24, 0.09);
  }

  public playPlayerDeath(): void {
    const notes = [220, 196, 175, 165, 147, 110] as const;
    notes.forEach((freq, i) => {
      this.osc('sawtooth', freq, freq * 0.78, 0.26, 0.18, i * 0.15);
    });
    this.noise('lowpass', 200, 0.8, 0.22, 0.55, notes.length * 0.15 + 0.05);
  }

  public playCoinPickup(): void {
    this.osc('square', 880, 880, 0.20, 0.06);
    this.osc('square', 1319, 1319, 0.24, 0.09, 0.065);
  }

  public playHeartPickup(): void {
    this.osc('triangle', 440, 440, 0.28, 0.16);
    this.osc('triangle', 523, 523, 0.18, 0.16, 0.04);
    this.osc('triangle', 659, 659, 0.12, 0.14, 0.08);
  }

  public playSwordPickup(): void {
    this.noise('highpass', 3200, 1.2, 0.18, 0.05);
    this.osc('sine', 1200, 580, 0.42, 0.40);
    this.osc('sine', 2400, 1200, 0.14, 0.32);
  }

  public playIgnite(): void {
    this.noise('bandpass', 900, 1.8, 0.38, 0.30);
    this.noise('highpass', 2800, 1.0, 0.20, 0.18, 0.14);
    this.osc('sawtooth', 130, 320, 0.15, 0.28, 0.05);
  }

  public playFireHit(): void {
    this.noise('bandpass', 2600, 2.0, 0.28, 0.09);
    this.osc('sawtooth', 380, 200, 0.10, 0.07);
  }

  public playShopOpen(): void {
    this.osc('sine', 440, 440, 0.18, 0.08);
    this.osc('sine', 880, 880, 0.22, 0.12, 0.07);
  }

  public playShopClose(): void {
    this.osc('sine', 880, 880, 0.20, 0.08);
    this.osc('sine', 440, 440, 0.16, 0.10, 0.07);
  }
}

// Singleton — persists across scene restarts, shares one AudioContext
let _instance: SoundManager | null = null;
export const getSoundManager = (): SoundManager => {
  _instance ??= new SoundManager();
  return _instance;
};

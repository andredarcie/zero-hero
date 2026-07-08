const MASTER_VOL = 0.32;
const MUSIC_VOL = 0.6; // background-music bed level (under the SFX)

// 8-bit / old-console chiptune SFX, generated with tools/gen-sfx.mjs (see
// public/assets/audio/CREDITS.md). Played as decoded samples; the procedural synth below
// is kept as a fallback for when a sample hasn't finished decoding yet (or fails to load).
type SampleKey =
  | 'swordSlash'
  | 'enemyHit'
  | 'enemyDeath'
  | 'coinPickup'
  | 'heartPickup'
  | 'swordPickup'
  | 'playerHurt'
  | 'playerDeath'
  | 'shopOpen'
  | 'shopClose'
  | 'ignite';

const SAMPLES: Record<SampleKey, { file: string; vol: number }> = {
  swordSlash:  { file: 'sword-slash.wav',  vol: 0.85 },
  enemyHit:    { file: 'enemy-hit.wav',    vol: 0.90 },
  enemyDeath:  { file: 'enemy-death.wav',  vol: 0.85 },
  coinPickup:  { file: 'coin.wav',         vol: 0.80 },
  heartPickup: { file: 'heart.wav',        vol: 0.75 },
  swordPickup: { file: 'sword-pickup.wav', vol: 0.80 },
  playerHurt:  { file: 'hurt.wav',         vol: 0.90 },
  playerDeath: { file: 'game-over.wav',    vol: 0.80 },
  shopOpen:    { file: 'shop-open.wav',    vol: 0.55 },
  shopClose:   { file: 'shop-close.wav',   vol: 0.70 },
  ignite:      { file: 'ignite.wav',       vol: 0.70 },
};

class SoundManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private readonly buffers = new Map<SampleKey, AudioBuffer>();
  private loadStarted = false;

  // Looping background music (one shared instance across scene restarts).
  private musicBuffer: AudioBuffer | null = null;
  private musicSource: AudioBufferSourceNode | null = null;
  private musicGain: GainNode | null = null;
  private wantMusic = false;

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

  // ── sample loading / playback ─────────────────────────────────────────────

  /** Fetch + decode every downloaded SFX once. Safe (and cheap) to call repeatedly. */
  public preload(): void {
    if (this.loadStarted) return;
    this.loadStarted = true;
    const ctx = this.audio;
    const base = import.meta.env.BASE_URL;

    (Object.keys(SAMPLES) as SampleKey[]).forEach((key) => {
      const url = `${base}assets/audio/${SAMPLES[key].file}`;
      fetch(url)
        .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(`HTTP ${res.status}`))))
        .then((data) => ctx.decodeAudioData(data))
        .then((buffer) => { this.buffers.set(key, buffer); })
        .catch((err) => { console.warn(`[audio] could not load ${SAMPLES[key].file}:`, err); });
    });

    fetch(`${base}assets/audio/music.wav`)
      .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => ctx.decodeAudioData(data))
      .then((buffer) => { this.musicBuffer = buffer; if (this.wantMusic) this.startMusicNow(); })
      .catch((err) => { console.warn('[audio] could not load music.wav:', err); });
  }

  /** Start the looping background music (idempotent — survives scene restarts). */
  public startMusic(): void {
    this.wantMusic = true;
    if (this.musicSource) return;
    if (this.musicBuffer) this.startMusicNow();
  }

  public stopMusic(): void {
    this.wantMusic = false;
    if (this.musicSource) {
      try { this.musicSource.stop(); } catch { /* already stopped */ }
      this.musicSource = null;
    }
  }

  private startMusicNow(): void {
    if (this.musicSource || !this.musicBuffer) return;
    const ctx = this.audio;
    if (!this.musicGain) {
      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = MUSIC_VOL;
      this.musicGain.connect(this.master);
    }
    const src = ctx.createBufferSource();
    src.buffer = this.musicBuffer;
    src.loop = true;
    src.connect(this.musicGain);
    src.start();
    this.musicSource = src;
  }

  /** Duck the music down to silence (e.g. while an NPC is talking / item-get plays). */
  public fadeMusicOut(ms = 450): void { this.rampMusic(0, ms); }

  /** Bring the music back up to full. */
  public fadeMusicIn(ms = 800): void { this.rampMusic(MUSIC_VOL, ms); }

  private rampMusic(target: number, ms: number): void {
    if (!this.musicGain) return;
    const ctx = this.audio;
    const now = ctx.currentTime;
    const gain = this.musicGain.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(target, now + ms / 1000);
  }

  /**
   * A short "talking" blip for the dialog typewriter. Each NPC passes its own base
   * frequency + waveform so voices sound distinct (a tiny random jitter keeps it lively).
   */
  public playDialogBlip(freq: number, wave: OscillatorType = 'square'): void {
    const jitter = 1 + (Math.random() - 0.5) * 0.06;
    this.osc(wave, freq * jitter, freq * jitter * 0.86, 0.14, 0.05);
  }

  /** Play a decoded sample. Returns false if it isn't loaded yet (caller falls back). */
  private playSample(key: SampleKey): boolean {
    const buffer = this.buffers.get(key);
    if (!buffer) return false;
    const ctx = this.audio; // ensures this.master exists
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = SAMPLES[key].vol;
    src.connect(g);
    g.connect(this.master);
    src.start();
    return true;
  }

  // ── low-level procedural helpers (fallbacks) ──────────────────────────────
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
  // Each plays the downloaded sample, falling back to the procedural synth.

  public playFootstep(): void {
    // Frequent + subtle: kept fully procedural so it never gets repetitive or loud. Low and
    // soft — a muffled footfall on soil, not a click.
    this.noise('lowpass', 120, 1.0, 0.09, 0.06);
  }

  public playSwordSlash(): void {
    if (this.playSample('swordSlash')) return;
    // Heavy, low air-cut instead of a bright hiss.
    this.noise('lowpass', 900, 0.7, 0.26, 0.13);
    this.osc('sawtooth', 150, 45, 0.16, 0.12);
  }

  public playEnemyHit(): void {
    if (this.playSample('enemyHit')) return;
    // Low, meaty thud.
    this.noise('lowpass', 320, 1.2, 0.42, 0.09);
    this.osc('sawtooth', 140, 55, 0.26, 0.12);
  }

  public playEnemyDeath(): void {
    if (this.playSample('enemyDeath')) return;
    // Low guttural collapse.
    const notes = [150, 110, 73] as const;
    notes.forEach((freq, i) => {
      this.osc('sawtooth', freq, freq * 0.6, 0.26, 0.16, i * 0.09);
      this.noise('lowpass', 300, 1.0, 0.16, 0.10, i * 0.09);
    });
  }

  public playPlayerHurt(): void {
    if (this.playSample('playerHurt')) return;
    // Low pained grunt.
    this.osc('sawtooth', 150, 90, 0.30, 0.24);
    this.osc('sawtooth', 160, 96, 0.16, 0.22);
    this.noise('lowpass', 400, 1.0, 0.20, 0.12);
  }

  public playPlayerDeath(): void {
    if (this.playSample('playerDeath')) return;
    // Slow dark descent into a low drone.
    const notes = [220, 165, 131, 110, 82, 55] as const;
    notes.forEach((freq, i) => {
      this.osc('triangle', freq, freq * 0.9, 0.26, 0.20, i * 0.16);
    });
    this.noise('lowpass', 150, 0.8, 0.22, 0.6, notes.length * 0.16 + 0.05);
  }

  public playCoinPickup(): void {
    if (this.playSample('coinPickup')) return;
    // Soft, muffled low tick — not a bright coin blip.
    this.osc('sine', 330, 300, 0.18, 0.14);
  }

  public playHeartPickup(): void {
    if (this.playSample('heartPickup')) return;
    // Warm low minor-third swell (A3 → C4).
    this.osc('triangle', 220, 220, 0.26, 0.22);
    this.osc('triangle', 262, 262, 0.18, 0.28, 0.06);
  }

  public playSwordPickup(): void {
    if (this.playSample('swordPickup')) return;
    // Solemn, epic root-fifth-octave (A2 / E3 / A3), low and weighty.
    this.osc('sawtooth', 110, 110, 0.30, 0.50);
    this.osc('sawtooth', 165, 165, 0.16, 0.40, 0.18);
    this.osc('sawtooth', 220, 220, 0.20, 0.50, 0.36);
  }

  public playIgnite(): void {
    if (this.playSample('ignite')) return;
    // Deep, muffled roar.
    this.noise('lowpass', 500, 1.2, 0.36, 0.32);
    this.osc('sawtooth', 90, 200, 0.14, 0.30, 0.05);
  }

  public playWoodChop(): void {
    // No dedicated sample — procedural. Dull axe bite into dry wood: a thock + short crack.
    this.noise('lowpass', 600, 1.4, 0.34, 0.07);
    this.osc('square', 190, 90, 0.16, 0.09);
    this.noise('highpass', 1800, 1.0, 0.08, 0.05, 0.02);
  }

  public playRockSmash(): void {
    // No dedicated sample — procedural. Stone clack with a gritty tail.
    this.noise('bandpass', 2600, 3.0, 0.22, 0.05);
    this.osc('square', 320, 140, 0.14, 0.07);
    this.noise('lowpass', 500, 1.0, 0.22, 0.14, 0.02);
  }

  public playGrassCut(): void {
    // No dedicated sample — procedural. A quick swish through dry stalks.
    this.noise('highpass', 2400, 0.8, 0.16, 0.12);
    this.noise('bandpass', 900, 1.2, 0.10, 0.10, 0.04);
  }

  public playBombPlace(): void {
    // No dedicated sample — procedural. Soft thud + fuse hiss starting up.
    this.noise('lowpass', 300, 1.0, 0.22, 0.08);
    this.noise('highpass', 3200, 0.8, 0.05, 0.30, 0.06);
  }

  public playBombExplode(): void {
    // No dedicated sample — procedural. Deep boom with a rumbling tail.
    this.osc('sine', 110, 28, 0.6, 0.5);
    this.noise('lowpass', 900, 0.8, 0.55, 0.20);
    this.noise('lowpass', 240, 1.0, 0.35, 0.7, 0.10);
    this.noise('highpass', 1500, 1.0, 0.12, 0.08);
  }

  public playUndeadSpawn(): void {
    // No dedicated sample — procedural. Bones grinding up through soil: two gritty
    // filtered-noise scrapes plus a low rising groan.
    this.noise('bandpass', 700, 2.0, 0.16, 0.16);
    this.noise('bandpass', 1300, 2.5, 0.10, 0.12, 0.12);
    this.osc('sawtooth', 55, 130, 0.16, 0.42);
    this.osc('triangle', 42, 84, 0.13, 0.5, 0.06);
  }

  public playFireHit(): void {
    // No dedicated sample — procedural. Low fiery crackle, not a bright zap.
    this.noise('lowpass', 700, 1.5, 0.24, 0.10);
    this.osc('sawtooth', 200, 110, 0.12, 0.08);
  }

  public playShopOpen(): void {
    if (this.playSample('shopOpen')) return;
    // Low, subdued menu tone (down).
    this.osc('sine', 196, 196, 0.18, 0.09);
    this.osc('sine', 131, 131, 0.20, 0.16, 0.07);
  }

  public playShopClose(): void {
    if (this.playSample('shopClose')) return;
    // Low, subdued menu tone (up).
    this.osc('sine', 131, 131, 0.18, 0.09);
    this.osc('sine', 196, 196, 0.16, 0.16, 0.07);
  }
}

// Singleton — persists across scene restarts, shares one AudioContext
let _instance: SoundManager | null = null;
export const getSoundManager = (): SoundManager => {
  _instance ??= new SoundManager();
  return _instance;
};

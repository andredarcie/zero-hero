const MASTER_VOL = 0.32;
const MUSIC_VOL = 0.6; // music-bus duck level (under the SFX)
const AMBIENCE_VOL = 0.4; // the wind bed — always subtle

// Player-facing volume settings (pause menu sliders), persisted like zh.locale. They sit on
// dedicated user gain stages so they never fight the internal mix: the dialog duck still
// ramps the music bus, footstep jitter still scales per-sample — the user volume multiplies
// on top. The wind bed counts as "music" for the player (it IS the world's soundtrack).
const VOL_MUSIC_KEY = 'zh.musicVol';
const VOL_SFX_KEY = 'zh.sfxVol';

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

const loadVol = (storageKey: string): number => {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw !== null) {
      const v = Number(raw);
      if (Number.isFinite(v)) return clamp01(v);
    }
  } catch { /* storage unavailable */ }
  return 1;
};

// All audio is generated offline ("Dark Souls weight, SNES timbre" — see
// public/assets/audio/CREDITS.md): layered SFX with baked echo/reverb tails, plus four
// seamless music/ambience loops at 32 kHz. This manager decodes and plays the samples;
// the procedural synth at the bottom is only a fallback for the first seconds before a
// sample finishes decoding (or if one fails to load).

const SAMPLES = {
  swordSlash: { file: 'sword-slash.wav', vol: 0.8 },
  enemyHit: { file: 'enemy-hit.wav', vol: 0.85 },
  enemyDeath: { file: 'enemy-death.wav', vol: 0.8 },
  coinPickup: { file: 'coin.wav', vol: 0.55 },
  heartPickup: { file: 'heart.wav', vol: 0.7 },
  swordPickup: { file: 'item-pickup.wav', vol: 0.6 }, // item get (Freesound #37089, see CREDITS.md)
  dropWater: { file: 'water-drop.wav', vol: 0.75 }, // single drop for the title-screen reveal
  titleImpact: { file: 'title-impact.wav', vol: 0.95 }, // epic hit when the author's name lands
  singingBowl: { file: 'singing-bowl.wav', vol: 0.8 }, // Tibetan bowl for the intro "wake up"
  playerHurt: { file: 'hurt.wav', vol: 0.85 },
  playerDeath: { file: 'game-over.wav', vol: 0.85 },
  shopOpen: { file: 'shop-open.wav', vol: 0.5 },
  shopClose: { file: 'shop-close.wav', vol: 0.6 },
  ignite: { file: 'ignite.wav', vol: 0.75 },
  woodChop: { file: 'wood-chop.wav', vol: 0.8 },
  treeFall: { file: 'tree-fall.wav', vol: 0.8 },
  splash: { file: 'splash.wav', vol: 0.7 },
  rockSmash: { file: 'rock-smash.wav', vol: 0.8 },
  grassCut: { file: 'grass-cut.wav', vol: 0.6 },
  bombPlace: { file: 'bomb-place.wav', vol: 0.6 },
  bombExplode: { file: 'bomb-explode.wav', vol: 1.0 },
  undeadSpawn: { file: 'undead-spawn.wav', vol: 0.7 },
  fireHit: { file: 'fire-hit.wav', vol: 0.7 },
  bridgePlank: { file: 'bridge-plank.wav', vol: 0.7 },
  bridgeBuilt: { file: 'bridge-built.wav', vol: 0.75 },
  hammer: { file: 'hammer.wav', vol: 0.7 }, // nailing a plank home during a bridge build
  footstep0: { file: 'footstep-0.wav', vol: 0.5 },
  footstep1: { file: 'footstep-1.wav', vol: 0.5 },
  footstep2: { file: 'footstep-2.wav', vol: 0.5 },
  footstep3: { file: 'footstep-3.wav', vol: 0.5 },
} as const;
type SampleKey = keyof typeof SAMPLES;

// Souls staging: the title screen is just dripping water, the wind bed is the world's
// default "soundtrack", and only the combat track rises while undead are out of the ground.
// ('title'/'overworld' still exist — the intro uses the title theme; overworld is currently
// unused since exploration is wind-only, kept for easy revival.)
export type MusicKey = 'title' | 'overworld' | 'danger' | 'menu';
const TRACKS: Record<MusicKey, { file: string; vol: number }> = {
  title: { file: 'music-title.wav', vol: 0.8 },
  overworld: { file: 'music-overworld.wav', vol: 0.9 },
  danger: { file: 'music-danger.wav', vol: 1.0 },
  menu: { file: 'menu-drips.wav', vol: 0.5 }, // soft water drops under the title screen
};
const AMBIENCE_FILE = 'ambience-wind.wav';

const FOOTSTEP_KEYS: readonly SampleKey[] = ['footstep0', 'footstep1', 'footstep2', 'footstep3'];

class SoundManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode; // gain -> "SNES" lowpass -> compressor -> destination
  // User volume stages (pause-menu sliders): every SFX routes through sfxUserBus, the music
  // bus and the wind bed route through musicUserBus. Both feed the master chain.
  private sfxUserBus!: GainNode;
  private musicUserBus!: GainNode;
  private musicVol = loadVol(VOL_MUSIC_KEY);
  private sfxVol = loadVol(VOL_SFX_KEY);
  private readonly buffers = new Map<SampleKey, AudioBuffer>();
  private loadStarted = false;

  // Music: one bus (ducked for dialogs) with at most two overlapping tracks while
  // crossfading. `wantTrack` survives until its buffer finishes decoding.
  private musicBus: GainNode | null = null;
  private readonly musicBuffers = new Map<MusicKey, AudioBuffer>();
  private currentMusic: { key: MusicKey; source: AudioBufferSourceNode; gain: GainNode } | null = null;
  private wantTrack: MusicKey | null = null;
  private wantFadeMs = 1600;

  // The wind bed — plain loop with its own gain, NOT on the music bus, so it keeps
  // blowing while music ducks for dialogs (Souls: voices over wind, not over silence).
  private ambienceBuffer: AudioBuffer | null = null;
  private ambienceSource: AudioBufferSourceNode | null = null;
  private wantAmbience = false;

  private lastFootstep = -1;

  private get audio(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = MASTER_VOL;
      // Master chain: a gentle low-pass fakes the S-SMP's gaussian-interpolation warmth
      // (nothing in this game should sound crisp), a soft compressor glues SFX + music.
      const warmth = this.ctx.createBiquadFilter();
      warmth.type = 'lowpass';
      warmth.frequency.value = 7800;
      warmth.Q.value = 0.5;
      const glue = this.ctx.createDynamicsCompressor();
      glue.threshold.value = -20;
      glue.knee.value = 22;
      glue.ratio.value = 3;
      glue.attack.value = 0.006;
      glue.release.value = 0.28;
      this.master.connect(warmth);
      warmth.connect(glue);
      glue.connect(this.ctx.destination);
      this.sfxUserBus = this.ctx.createGain();
      this.sfxUserBus.gain.value = this.sfxVol;
      this.sfxUserBus.connect(this.master);
      this.musicUserBus = this.ctx.createGain();
      this.musicUserBus.gain.value = this.musicVol;
      this.musicUserBus.connect(this.master);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** Poke the AudioContext from a user gesture so autoplay restrictions lift. */
  public unlock(): void {
    void this.audio;
  }

  // ── sample loading ─────────────────────────────────────────────────────────

  /** Fetch + decode every sample and music loop once. Safe (and cheap) to call repeatedly. */
  public preload(): void {
    if (this.loadStarted) return;
    this.loadStarted = true;
    const ctx = this.audio;
    const base = import.meta.env.BASE_URL;
    const fetchBuffer = (file: string): Promise<AudioBuffer> =>
      fetch(`${base}assets/audio/${file}`)
        .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(`HTTP ${res.status}`))))
        .then((data) => ctx.decodeAudioData(data));

    (Object.keys(SAMPLES) as SampleKey[]).forEach((key) => {
      fetchBuffer(SAMPLES[key].file)
        .then((buffer) => { this.buffers.set(key, buffer); })
        .catch((err) => { console.warn(`[audio] could not load ${SAMPLES[key].file}:`, err); });
    });

    (Object.keys(TRACKS) as MusicKey[]).forEach((key) => {
      fetchBuffer(TRACKS[key].file)
        .then((buffer) => {
          this.musicBuffers.set(key, buffer);
          if (this.wantTrack === key && this.currentMusic?.key !== key) {
            this.crossfadeTo(key, buffer, this.wantFadeMs);
          }
        })
        .catch((err) => { console.warn(`[audio] could not load ${TRACKS[key].file}:`, err); });
    });

    fetchBuffer(AMBIENCE_FILE)
      .then((buffer) => { this.ambienceBuffer = buffer; if (this.wantAmbience) this.startAmbienceNow(); })
      .catch((err) => { console.warn(`[audio] could not load ${AMBIENCE_FILE}:`, err); });
  }

  // ── music ──────────────────────────────────────────────────────────────────

  /**
   * Play (or crossfade to) a named track. Idempotent for the already-playing track,
   * so scenes may call it every frame with the state they want.
   */
  public startMusic(key: MusicKey, fadeMs = 1600): void {
    this.wantTrack = key;
    this.wantFadeMs = fadeMs;
    if (this.currentMusic?.key === key) return;
    const buffer = this.musicBuffers.get(key);
    if (buffer) this.crossfadeTo(key, buffer, fadeMs);
  }

  /**
   * Stop the current track. With `fadeMs > 0` the track rings out to silence (used when
   * combat calms back down to the wind-only default); otherwise it stops instantly.
   * `currentMusic` is cleared immediately either way, so per-frame callers are idempotent.
   */
  public stopMusic(fadeMs = 0): void {
    this.wantTrack = null;
    const cur = this.currentMusic;
    if (!cur) return;
    this.currentMusic = null;
    if (fadeMs <= 0) {
      try { cur.source.stop(); } catch { /* already stopped */ }
      return;
    }
    const ctx = this.audio;
    const now = ctx.currentTime;
    const fadeS = Math.max(0.05, fadeMs / 1000);
    cur.gain.gain.cancelScheduledValues(now);
    cur.gain.gain.setValueAtTime(Math.max(cur.gain.gain.value, 0.0001), now);
    cur.gain.gain.exponentialRampToValueAtTime(0.0001, now + fadeS);
    try { cur.source.stop(now + fadeS + 0.1); } catch { /* already stopped */ }
  }

  private ensureMusicBus(): GainNode {
    const ctx = this.audio;
    if (!this.musicBus) {
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = MUSIC_VOL;
      this.musicBus.connect(this.musicUserBus);
    }
    return this.musicBus;
  }

  private crossfadeTo(key: MusicKey, buffer: AudioBuffer, fadeMs: number): void {
    const ctx = this.audio;
    const bus = this.ensureMusicBus();
    const now = ctx.currentTime;
    const fadeS = Math.max(0.05, fadeMs / 1000);

    const old = this.currentMusic;
    if (!old) {
      // Fresh start (scene boot / after death): make sure a leftover dialog duck from a
      // previous life can't leave the new track silent.
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(MUSIC_VOL, now);
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(TRACKS[key].vol, now + fadeS);
    gain.connect(bus);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gain);
    source.start();
    this.currentMusic = { key, source, gain };

    if (old) {
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueAtTime(Math.max(old.gain.gain.value, 0.0001), now);
      old.gain.gain.exponentialRampToValueAtTime(0.0001, now + fadeS);
      try { old.source.stop(now + fadeS + 0.1); } catch { /* already stopped */ }
    }
  }

  // ── user volume settings (pause menu) ─────────────────────────────────────

  public getMusicVolume(): number { return this.musicVol; }
  public getSfxVolume(): number { return this.sfxVol; }

  /** Set the player's music+ambience volume (0..1), persisted across sessions. */
  public setMusicVolume(vol: number): void {
    this.musicVol = clamp01(vol);
    try { localStorage.setItem(VOL_MUSIC_KEY, String(this.musicVol)); } catch { /* storage unavailable */ }
    this.rampUserBus(this.musicUserBus, this.musicVol);
  }

  /** Set the player's sound-effects volume (0..1), persisted across sessions. */
  public setSfxVolume(vol: number): void {
    this.sfxVol = clamp01(vol);
    try { localStorage.setItem(VOL_SFX_KEY, String(this.sfxVol)); } catch { /* storage unavailable */ }
    this.rampUserBus(this.sfxUserBus, this.sfxVol);
  }

  private rampUserBus(bus: GainNode | undefined, target: number): void {
    if (!this.ctx || !bus) return; // no AudioContext yet — the bus is created with the saved value
    const now = this.ctx.currentTime;
    bus.gain.cancelScheduledValues(now);
    bus.gain.setValueAtTime(bus.gain.value, now);
    bus.gain.linearRampToValueAtTime(target, now + 0.06);
  }

  /** Duck the music down to silence (e.g. while an NPC is talking / item-get plays). */
  public fadeMusicOut(ms = 450): void { this.rampMusicBus(0, ms); }

  /** Bring the music back up to full. */
  public fadeMusicIn(ms = 800): void { this.rampMusicBus(MUSIC_VOL, ms); }

  private rampMusicBus(target: number, ms: number): void {
    if (!this.musicBus) return;
    const ctx = this.audio;
    const now = ctx.currentTime;
    const gain = this.musicBus.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(target, now + ms / 1000);
  }

  // ── ambience (wind) ────────────────────────────────────────────────────────

  public startAmbience(): void {
    this.wantAmbience = true;
    if (this.ambienceSource) return;
    if (this.ambienceBuffer) this.startAmbienceNow();
  }

  public stopAmbience(): void {
    this.wantAmbience = false;
    if (this.ambienceSource) {
      try { this.ambienceSource.stop(); } catch { /* already stopped */ }
      this.ambienceSource = null;
    }
  }

  private startAmbienceNow(): void {
    if (this.ambienceSource || !this.ambienceBuffer) return;
    const ctx = this.audio;
    const gain = ctx.createGain();
    gain.gain.value = AMBIENCE_VOL;
    gain.connect(this.musicUserBus);
    const src = ctx.createBufferSource();
    src.buffer = this.ambienceBuffer;
    src.loop = true;
    src.connect(gain);
    src.start();
    this.ambienceSource = src;
  }

  // ── sample playback ────────────────────────────────────────────────────────

  /**
   * Play a decoded sample. `jitter` is a ± range in semitones applied to the playback
   * rate so frequent sounds (hits, steps, chops) never machine-gun the exact same file.
   * Returns false if the sample isn't loaded yet (caller falls back to the synth).
   */
  private playSample(key: SampleKey, jitter = 0, volScale = 1): boolean {
    const buffer = this.buffers.get(key);
    if (!buffer) return false;
    const ctx = this.audio; // ensures this.master exists
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    if (jitter > 0) src.playbackRate.value = Math.pow(2, ((Math.random() * 2 - 1) * jitter) / 12);
    const g = ctx.createGain();
    g.gain.value = SAMPLES[key].vol * volScale;
    src.connect(g);
    g.connect(this.sfxUserBus);
    src.start();
    return true;
  }

  /**
   * A short "talking" blip for the dialog typewriter. Each NPC passes its own base
   * frequency + waveform so voices sound distinct (a tiny random jitter keeps it lively).
   * Deliberately dry and procedural — close, intimate, no room around it.
   */
  public playDialogBlip(freq: number, wave: OscillatorType = 'square'): void {
    const jitter = 1 + (Math.random() - 0.5) * 0.06;
    this.osc(wave, freq * jitter, freq * jitter * 0.86, 0.14, 0.05);
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
    g.connect(this.sfxUserBus);
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
    g.connect(this.sfxUserBus);
    src.start(t);
    src.stop(t + duration + 0.02);
  }

  // ── public sound effects ─────────────────────────────────────────────────
  // Each plays its offline-rendered sample (with jitter where repetition hurts),
  // falling back to the procedural synth while samples are still decoding.

  public playFootstep(): void {
    // Rotate the four variants (never the same one twice) + rate jitter.
    let pick = Math.floor(Math.random() * FOOTSTEP_KEYS.length);
    if (pick === this.lastFootstep) pick = (pick + 1) % FOOTSTEP_KEYS.length;
    this.lastFootstep = pick;
    if (this.playSample(FOOTSTEP_KEYS[pick], 1.2, 0.85 + Math.random() * 0.3)) return;
    this.noise('lowpass', 120, 1.0, 0.09, 0.06);
  }

  public playSwordSlash(): void {
    if (this.playSample('swordSlash', 0.7)) return;
    this.noise('lowpass', 900, 0.7, 0.26, 0.13);
    this.osc('sawtooth', 150, 45, 0.16, 0.12);
  }

  public playEnemyHit(): void {
    if (this.playSample('enemyHit', 0.9)) return;
    this.noise('lowpass', 320, 1.2, 0.42, 0.09);
    this.osc('sawtooth', 140, 55, 0.26, 0.12);
  }

  public playEnemyDeath(): void {
    if (this.playSample('enemyDeath', 0.5)) return;
    const notes = [150, 110, 73] as const;
    notes.forEach((freq, i) => {
      this.osc('sawtooth', freq, freq * 0.6, 0.26, 0.16, i * 0.09);
      this.noise('lowpass', 300, 1.0, 0.16, 0.10, i * 0.09);
    });
  }

  public playPlayerHurt(): void {
    if (this.playSample('playerHurt', 0.6)) return;
    this.osc('sawtooth', 150, 90, 0.30, 0.24);
    this.osc('sawtooth', 160, 96, 0.16, 0.22);
    this.noise('lowpass', 400, 1.0, 0.20, 0.12);
  }

  public playPlayerDeath(): void {
    if (this.playSample('playerDeath')) return;
    const notes = [220, 165, 131, 110, 82, 55] as const;
    notes.forEach((freq, i) => {
      this.osc('triangle', freq, freq * 0.9, 0.26, 0.20, i * 0.16);
    });
    this.noise('lowpass', 150, 0.8, 0.22, 0.6, notes.length * 0.16 + 0.05);
  }

  public playCoinPickup(): void {
    if (this.playSample('coinPickup', 0.4)) return;
    this.osc('sine', 330, 300, 0.18, 0.14);
  }

  /** A single water drop — the title screen fires one per word as it drops in. */
  public playWaterDrop(): void {
    if (this.playSample('dropWater', 0.5)) return; // slight pitch jitter so drops never repeat exactly
    // Fallback mirrors the sample: an upward pitch snap (the drip "ploop") + a faint low plunk.
    this.osc('sine', 700, 1700, 0.3, 0.08);
    this.osc('sine', 300, 210, 0.12, 0.05);
  }

  /** The cinematic finale hit — the title screen fires this once, when the author's name lands. */
  public playTitleImpact(): void {
    if (this.playSample('titleImpact')) return;
    // Fallback: a sub drop, a low boom, and an A2 toll — the same shape as the sample.
    this.osc('sine', 110, 34, 0.7, 1.0);
    this.noise('lowpass', 500, 0.8, 0.5, 0.5);
    this.osc('triangle', 110, 110, 0.22, 1.6);
  }

  /** Tibetan singing bowl — the intro's "wake up" swell as the hero grows into the world. */
  public playSingingBowl(): void {
    if (this.playSample('singingBowl')) return;
    // Fallback: a swelling A3 bowl-ish chord (root + fifth + low om), long and calm.
    this.osc('sine', 220, 220, 0.26, 3.2);
    this.osc('sine', 330, 330, 0.13, 3.0, 0.1);
    this.osc('sine', 110, 110, 0.16, 3.6);
  }

  public playHeartPickup(): void {
    if (this.playSample('heartPickup')) return;
    this.osc('triangle', 220, 220, 0.26, 0.22);
    this.osc('triangle', 262, 262, 0.18, 0.28, 0.06);
  }

  public playSwordPickup(): void {
    if (this.playSample('swordPickup')) return;
    // Fallback mirrors the sample: a quick ascending A-minor arpeggio climbing an octave
    // (A4-C5-E5-A5) — the "item get" rise, warm and short.
    const notes = [440, 523, 659, 880] as const;
    notes.forEach((freq, i) => {
      this.osc('triangle', freq, freq, 0.16, i === notes.length - 1 ? 0.34 : 0.2, i * 0.05);
    });
  }

  public playIgnite(): void {
    if (this.playSample('ignite')) return;
    this.noise('lowpass', 500, 1.2, 0.36, 0.32);
    this.osc('sawtooth', 90, 200, 0.14, 0.30, 0.05);
  }

  public playWoodChop(): void {
    if (this.playSample('woodChop', 1.0)) return;
    this.noise('lowpass', 600, 1.4, 0.34, 0.07);
    this.osc('square', 190, 90, 0.16, 0.09);
    this.noise('highpass', 1800, 1.0, 0.08, 0.05, 0.02);
  }

  public playBridgePlank(): void {
    if (this.playSample('bridgePlank', 0.8)) return;
    // A wet wooden knock — a graveto laid onto the frame over the river.
    this.noise('lowpass', 420, 1.6, 0.26, 0.06);
    this.osc('square', 150, 78, 0.14, 0.10);
    this.osc('triangle', 300, 300, 0.07, 0.05, 0.01);
    this.noise('highpass', 2600, 0.6, 0.06, 0.10, 0.02); // faint splash tail
  }

  public playHammer(): void {
    // Nailing a plank home: a bright metallic tick over a short hollow-wood knock.
    if (this.playSample('hammer', 0.9 + Math.random() * 0.25)) return;
    this.noise('bandpass', 3200, 4.0, 0.14, 0.03);
    this.osc('square', 220, 120, 0.12, 0.05, 0.005);
    this.osc('triangle', 520, 380, 0.05, 0.04, 0.005);
  }

  public playBridgeBuilt(): void {
    if (this.playSample('bridgeBuilt')) return;
    this.noise('lowpass', 500, 1.4, 0.24, 0.06);
    this.osc('square', 170, 90, 0.14, 0.08);
    this.osc('square', 150, 80, 0.12, 0.08, 0.07);
    this.osc('triangle', 262, 262, 0.16, 0.16, 0.10);
    this.osc('triangle', 330, 330, 0.16, 0.16, 0.20);
    this.osc('triangle', 392, 392, 0.18, 0.26, 0.30);
  }

  public playTreeFall(): void {
    if (this.playSample('treeFall')) return;
    this.osc('sawtooth', 130, 58, 0.14, 0.34);
    this.noise('lowpass', 700, 0.8, 0.20, 0.34, 0.16);
  }

  public playSplash(): void {
    if (this.playSample('splash', 0.5)) return;
    this.noise('lowpass', 1100, 0.6, 0.24, 0.16);
    this.noise('highpass', 2800, 0.5, 0.11, 0.14, 0.02);
  }

  public playRockSmash(): void {
    if (this.playSample('rockSmash', 0.9)) return;
    this.noise('bandpass', 2600, 3.0, 0.22, 0.05);
    this.osc('square', 320, 140, 0.14, 0.07);
    this.noise('lowpass', 500, 1.0, 0.22, 0.14, 0.02);
  }

  public playGrassCut(): void {
    if (this.playSample('grassCut', 1.2)) return;
    this.noise('highpass', 2400, 0.8, 0.16, 0.12);
    this.noise('bandpass', 900, 1.2, 0.10, 0.10, 0.04);
  }

  public playBombPlace(): void {
    if (this.playSample('bombPlace')) return;
    this.noise('lowpass', 300, 1.0, 0.22, 0.08);
    this.noise('highpass', 3200, 0.8, 0.05, 0.30, 0.06);
  }

  public playBombExplode(): void {
    if (this.playSample('bombExplode')) return;
    this.osc('sine', 110, 28, 0.6, 0.5);
    this.noise('lowpass', 900, 0.8, 0.55, 0.20);
    this.noise('lowpass', 240, 1.0, 0.35, 0.7, 0.10);
    this.noise('highpass', 1500, 1.0, 0.12, 0.08);
  }

  /**
   * The undead attack wind-up: a short rising hiss — the audio half of the "dodge now"
   * telegraph (the visual half is the red flash + rear-back pose in UndeadEnemy).
   * Procedural only — no authored sample yet.
   */
  public playUndeadWindup(): void {
    this.osc('sawtooth', 70, 170, 0.10, 0.32);
    this.noise('bandpass', 520, 2.2, 0.09, 0.28);
  }

  /** The strike that met empty air: a thin whoosh, nothing landed. */
  public playUndeadWhiff(): void {
    this.noise('highpass', 1600, 1.0, 0.10, 0.09);
    this.osc('triangle', 220, 90, 0.05, 0.08);
  }

  /**
   * The undead spawn telegraph: a low ground-rumble with a gravelly crunch on top, warning
   * that something is about to claw out of the tile (playUndeadSpawn fires when it does).
   * Procedural only — no authored sample yet.
   */
  public playGroundCrack(): void {
    this.noise('lowpass', 170, 0.8, 0.30, 0.55);
    this.noise('bandpass', 950, 3.0, 0.10, 0.20, 0.06);
    this.osc('triangle', 38, 30, 0.20, 0.6);
  }

  public playUndeadSpawn(): void {
    if (this.playSample('undeadSpawn', 0.8)) return;
    this.noise('bandpass', 700, 2.0, 0.16, 0.16);
    this.noise('bandpass', 1300, 2.5, 0.10, 0.12, 0.12);
    this.osc('sawtooth', 55, 130, 0.16, 0.42);
    this.osc('triangle', 42, 84, 0.13, 0.5, 0.06);
  }

  public playFireHit(): void {
    if (this.playSample('fireHit', 0.9)) return;
    this.noise('lowpass', 700, 1.5, 0.24, 0.10);
    this.osc('sawtooth', 200, 110, 0.12, 0.08);
  }

  public playShopOpen(): void {
    if (this.playSample('shopOpen')) return;
    this.osc('sine', 196, 196, 0.18, 0.09);
    this.osc('sine', 131, 131, 0.20, 0.16, 0.07);
  }

  public playShopClose(): void {
    if (this.playSample('shopClose')) return;
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

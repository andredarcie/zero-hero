
const MASTER_VOL = 0.32;
const MUSIC_VOL = 0.6; // music-bus duck level (under the SFX)
const AMBIENCE_VOL = 0.42; // os leitos do vale (passaros, grilos, agua) — sempre por baixo

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
  // O JOGO NAO TEM COMBATE, e a tabela tambem nao: os sons de briga (golpe, dano, morte, os
  // telegrafos do bestiario, a bomba) sairam daqui junto com o que os tocava. O que ficou foi
  // remixado para baixo onde batia forte demais para um vale tranquilo — a rocha estourando, o
  // machado, a arvore caindo —, porque o volume desta coluna e uma decisao de jogo.
  swordSlash: { file: 'combat/sword-swing.wav', vol: 0.55 }, // o assobio da espada descendo (abertura)
  heartPickup: { file: 'heart.wav', vol: 0.6 },
  swordPickup: { file: 'item-pickup.wav', vol: 0.55 }, // item get (Freesound #37089, see CREDITS.md)
  dropWater: { file: 'water-drop.wav', vol: 0.65 }, // a gota do titulo
  titleImpact: { file: 'title-impact.wav', vol: 0.9 }, // a espada entrando na terra (abertura)
  singingBowl: { file: 'singing-bowl.wav', vol: 0.75 }, // o sino dos momentos bons
  shopOpen: { file: 'shop-open.wav', vol: 0.45 },
  shopClose: { file: 'shop-close.wav', vol: 0.5 },
  ignite: { file: 'ignite.wav', vol: 0.6 },
  woodChop: { file: 'wood-chop.wav', vol: 0.5 },
  treeFall: { file: 'tree-fall.wav', vol: 0.45 },
  splash: { file: 'splash.wav', vol: 0.55 },
  rockSmash: { file: 'rock-smash.wav', vol: 0.42 },
  grassCut: { file: 'grass-cut.wav', vol: 0.5 },
  fireHit: { file: 'combat/fire-hit.wav', vol: 0.45 },
  bridgePlank: { file: 'bridge-plank.wav', vol: 0.55 },
  bridgeBuilt: { file: 'bridge-built.wav', vol: 0.6 },
  hammer: { file: 'hammer.wav', vol: 0.5 }, // nailing a plank home during a bridge build
  footstep0: { file: 'footstep-0.wav', vol: 0.4 },
  footstep1: { file: 'footstep-1.wav', vol: 0.4 },
  footstep2: { file: 'footstep-2.wav', vol: 0.4 },
  footstep3: { file: 'footstep-3.wav', vol: 0.4 },
} as const;

type SampleKey = keyof typeof SAMPLES;


// A MUSICA E DO VALE, E SO DELE. 'overworld' e "Little Hearth" (music-valley, F maior, a
// caixinha de musica sobre a harpa) do inicio ao fim da aventura; 'menu' e a cancao de ninar do
// titulo e dos creditos (music-lullaby). As duas saem de tools/gen-music.mjs (que ainda sabe
// renderizar a trilha sombria antiga, mas os arquivos dela sairam do jogo).
export type MusicKey = 'title' | 'overworld' | 'menu';
const TRACKS: Record<MusicKey, { file: string; vol: number }> = {
  title: { file: 'music-lullaby.wav', vol: 0.7 },
  overworld: { file: 'music-valley.wav', vol: 0.8 },
  menu: { file: 'music-lullaby.wav', vol: 0.7 },
};

/**
 * OS LEITOS DE AMBIENTE. Eram um vento so; agora sao tres, tocando juntos o tempo todo, e o jogo
 * so mexe no VOLUME de cada um (`setAmbienceMix`): passaros e brisa de dia, grilos e um sapo de
 * noite, e o marulho que cresce perto da agua. Misturar em vez de trocar e o que deixa o
 * amanhecer ACONTECER aos poucos, em vez de cortar de um arquivo para o outro.
 */
type AmbienceBed = 'day' | 'night' | 'water';
const AMBIENCE_FILES: Record<AmbienceBed, string> = {
  day: 'ambience-day.wav',
  night: 'ambience-night.wav',
  water: 'ambience-water.wav',
};

const FOOTSTEP_KEYS: readonly SampleKey[] = ['footstep0', 'footstep1', 'footstep2', 'footstep3'];

/**
 * Fator de altura para um som SINTETIZADO que se repete — o equivalente do jitter que `playSample`
 * dá às amostras. ±4% (uns dois terços de semitom) é o bastante para o ouvido parar de reconhecer
 * a repetição e pouco o bastante para o som continuar sendo o mesmo som.
 */
const detune = (): number => 1 + (Math.random() * 2 - 1) * 0.04;

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

  // Os leitos de ambiente — loops com ganho proprio, FORA do barramento da musica, entao o vale
  // continua soando quando a musica baixa para um dialogo.
  private readonly ambienceBuffers = new Map<AmbienceBed, AudioBuffer>();
  private readonly ambienceBeds = new Map<AmbienceBed, { source: AudioBufferSourceNode; gain: GainNode }>();
  private ambienceMix: Record<AmbienceBed, number> = { day: 1, night: 0, water: 0 };
  private wantAmbience = false;

  private lastFootstep = -1;

  // O zumbido da lamina juntando forca (ver startSpinChargeHum) — guardado para poder ser
  // cortado no instante em que a carga morre (soltar cedo, apanhar segurando, pausar).
  private chargeHum: { oscs: OscillatorNode[]; gain: GainNode } | null = null;

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

    (Object.keys(AMBIENCE_FILES) as AmbienceBed[]).forEach((bed) => {
      fetchBuffer(AMBIENCE_FILES[bed])
        .then((buffer) => { this.ambienceBuffers.set(bed, buffer); if (this.wantAmbience) this.startAmbienceNow(); })
        .catch((err) => { console.warn(`[audio] could not load ${AMBIENCE_FILES[bed]}:`, err); });
    });
  }

  // ── music ──────────────────────────────────────────────────────────────────

  /**
   * A trilha que o jogo PEDIU por ultimo (null = silencio/vento). E leitura de playtest: o que
   * toca de verdade depende de buffer decodificado, mas o contrato testavel e o pedido.
   */
  public get requestedTrack(): MusicKey | null {
    return this.wantTrack;
  }

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
   * Stop the current track. With `fadeMs > 0` the track rings out to silence (entrar numa
   * dungeon, sair para o menu); otherwise it stops instantly.
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
    this.startAmbienceNow();
  }

  public stopAmbience(): void {
    this.wantAmbience = false;
    for (const { source } of this.ambienceBeds.values()) {
      try { source.stop(); } catch { /* already stopped */ }
    }
    this.ambienceBeds.clear();
  }

  /**
   * Quanto de cada leito o mundo pede agora (0..1): `night` cruza dia e noite, `water` e a
   * proximidade da agua. Os ganhos deslizam (setTargetAtTime), entao chamar a cada frame e barato
   * e nunca estala.
   */
  public setAmbienceMix(night: number, water: number): void {
    this.ambienceMix = { day: 1 - clamp01(night), night: clamp01(night), water: clamp01(water) };
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const [bed, { gain }] of this.ambienceBeds) {
      gain.gain.setTargetAtTime(AMBIENCE_VOL * this.ambienceMix[bed], now, 0.8);
    }
  }

  private startAmbienceNow(): void {
    if (!this.wantAmbience) return;
    const ctx = this.audio;
    for (const [bed, buffer] of this.ambienceBuffers) {
      if (this.ambienceBeds.has(bed)) continue;
      const gain = ctx.createGain();
      gain.gain.value = AMBIENCE_VOL * this.ambienceMix[bed];
      gain.connect(this.musicUserBus);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      // Os tres leitos tem comprimentos diferentes e comecam em pontos diferentes: nunca se
      // alinham, e o vale nao "repete" a cada trinta segundos.
      src.connect(gain);
      src.start(0, Math.random() * buffer.duration);
      this.ambienceBeds.set(bed, { source: src, gain });
    }
  }

  // ── sample playback ────────────────────────────────────────────────────────

  /**
   * Play a decoded sample. `jitter` is a ± range in semitones applied to the playback
   * rate so frequent sounds (hits, steps, chops) never machine-gun the exact same file.
   * Returns false if the sample isn't loaded yet (caller falls back to the synth).
   */
  private playSample(key: SampleKey, jitter = 0, volScale = 1, rate = 1): boolean {
    const buffer = this.buffers.get(key);
    if (!buffer) return false;
    const ctx = this.audio; // ensures this.master exists
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    // `rate` e a altura FIXA de quem fala (a voz por especie, ver ENEMY_VOICE); o jitter aleatorio
    // multiplica por cima, entao a variacao continua existindo DENTRO da voz de cada corpo.
    src.playbackRate.value = rate
      * (jitter > 0 ? Math.pow(2, ((Math.random() * 2 - 1) * jitter) / 12) : 1);
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
  /**
   * O CARRILHAO de ganhar uma coisa: tres notas de seno subindo em F maior (do, fa, la), cada uma
   * com um harmonico de oitava bem baixinho — uma caixinha de musica, nunca uma fanfarra.
   */
  public playCozyChime(): void {
    const notes = [1046.5, 1396.9, 1760];
    notes.forEach((f, i) => {
      this.osc('sine', f, f, 0.09, 1.1, i * 0.14);
      this.osc('sine', f * 2, f * 2, 0.018, 0.6, i * 0.14);
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
    this.osc(soft, freq * jitter, freq * jitter * 0.92, 0.075, 0.07);
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

  /**
   * O ITEM QUE NÃO É ARMA batendo num corpo — o balde, a bomba, as botas cutucando uma caveira.
   * Era a única resposta MUDA do botão B (nem swing, nem som, nem recusa), quebrando a lei de que
   * toda recusa tem desenho próprio. Um "toc" surdo, sem metal e sem dano: encostou, não mordeu.
   */
  public playItemBonk(): void {
    const d = detune();
    this.noise('lowpass', 380 * d, 1.2, 0.16, 0.07);
    this.osc('sine', 150 * d, 90 * d, 0.1, 0.09);
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
  public playItemStash(): void {
    this.noise('lowpass', 620, 1.0, 0.09, 0.055);   // o baque surdo da coisa entrando
    this.osc('triangle', 300, 190, 0.10, 0.075);    // o peso dela assentando, descendo
    this.osc('sine', 720, 640, 0.035, 0.05, 0.035); // e um toque claro no fim: "peguei" — sem metal
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

  /** Tibetan singing bowl — was the intro's "wake up" swell; kept for the next slow moment. */
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

  /** A chama pegou no forno: um sopro grave de tiragem, ar entrando na fornalha. */
  public playFurnaceIgnite(): void {
    this.noise('lowpass', 300, 1.1, 0.14, 0.24);
    this.osc('triangle', 58, 92, 0.09, 0.3, 0.03);
  }

  /** Respiração curta do forno em regime, baixa porque se repete durante a fornada. */
  public playFurnaceBreath(): void {
    this.noise('bandpass', 3100, 1.6, 0.04, 0.08);
    this.noise('highpass', 5200, 1.0, 0.02, 0.05, 0.01);
  }

  // ── a caixa de ferramentas ───────────────────────────────────────────────
  // Os quatro sons contam UM arco: a tampa abre (agudo, curto), a forja bate (grave, repetida),
  // o produto salta (sobe e assenta) e a recusa e a mesma dobradica da abertura CORTADA por um
  // baque — exatamente o truque que o portao de bater usa pra distinguir "abriu" de "tentou".

  /** A trava soltando e a tampa girando na dobradica: metalico, seco, sem drama. */
  public playToolboxOpen(): void {
    this.noise('bandpass', 2600, 3.6, 0.1, 0.05);
    this.osc('square', 240, 420, 0.075, 0.09);
    this.osc('triangle', 620, 520, 0.045, 0.07, 0.04);
  }

  /** Uma martelada la dentro. Repete 3x na forja, entao e curta e um tico mais grave a cada vez. */
  public playToolboxForge(step = 0): void {
    const drop = step * 18;
    this.noise('bandpass', 3000 - drop * 30, 4.2, 0.13, 0.035);
    this.osc('square', 200 - drop, 110 - drop, 0.11, 0.055, 0.005);
    this.osc('triangle', 480 - drop * 2, 360, 0.05, 0.05, 0.008);
  }

  /** O item novo saltando pra fora e caindo no chao: glissando curto pra cima e um toque seco. */
  public playToolboxDeliver(): void {
    this.osc('triangle', 330, 660, 0.09, 0.13);
    this.osc('square', 660, 990, 0.035, 0.1, 0.05);
    this.noise('lowpass', 900, 1.2, 0.085, 0.08, 0.14); // a peca assentando no chao
  }

  /** Estes dois nao dao em nada: a tampa pula e bate de volta. A dobradica sem o fim feliz. */
  public playToolboxRefuse(): void {
    this.osc('square', 240, 300, 0.055, 0.05);
    this.noise('lowpass', 260, 1.3, 0.16, 0.1, 0.06); // o baque da tampa voltando
    this.osc('sine', 130, 80, 0.075, 0.12, 0.06);
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

  /**
   * O CORTE DO COGUMELO: um "tic" seco de lâmina passando pela carne e, colado nele, o POP — a
   * bolha de seno que sobe de tom rápido (o mesmo gesto do pingo d'água, mais curto e mais
   * redondo). É o som da recompensa do mini-game, então é gostoso e nunca agudo demais.
   */
  public playMushroomCut(): void {
    const d = detune();
    this.noise('bandpass', 3200 * d, 2.2, 0.10, 0.035);        // o fio da lâmina
    this.osc('sine', 260 * d, 820 * d, 0.22, 0.09, 0.012);     // o pop subindo
    this.osc('sine', 520 * d, 1240 * d, 0.05, 0.06, 0.012);    // o brilho do pop, uma oitava acima
    this.osc('triangle', 140 * d, 90 * d, 0.08, 0.08, 0.02);   // o corpo do cogumelo soltando
  }

  /**
   * A TERRA ESCORRENDO da bucha: um chiado granulado e baixinho, filtrado em faixa estreita. Toca
   * muitas vezes seguidas enquanto se esfrega, por isso é curto, quieto e varia de tom sozinho.
   */
  public playSandTrickle(): void {
    const d = detune();
    this.noise('bandpass', 1700 * d, 1.6, 0.05, 0.07);
    this.noise('highpass', 4200 * d, 0.7, 0.02, 0.05, 0.02);
  }

  /** O PAPEL abrindo: dois farfalhos secos, o segundo mais grave (a folha assentando). */
  public playPaperUnfold(): void {
    this.noise('bandpass', 2400, 0.9, 0.09, 0.12);
    this.noise('bandpass', 1300, 0.8, 0.07, 0.16, 0.1);
  }

  // ── o bestiario que nao vem do chao ──────────────────────────────────────
  // A caveira tem o chao rachando (playGroundCrack) porque ela nasce de baixo. Bicho, gosma e
  // maquina chegam de outro jeito, e cada som abaixo e o par sonoro de um gesto que ja esta na
  // tela — nenhum deles existe para "avisar" sozinho.

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

  // ── o portao de bater ────────────────────────────────────────────────────
  // Os dois sons sao o MESMO gesto com finais diferentes, e e isso que ensina a regra sem uma
  // linha de texto: a dobradica range igual nos dois, so que um termina em vao aberto e o
  // outro numa batida seca contra o que esta atras.

  /** A folha girando livre: dobradica rangendo e o batente soltando. */
  public playGateSwing(): void {
    this.osc('triangle', 210, 95, 0.07, 0.3);
    this.noise('bandpass', 1100, 2.4, 0.07, 0.16);
    this.noise('lowpass', 500, 1.0, 0.09, 0.1, 0.2); // a folha assentando no fim do curso
  }

  /** A folha batendo no que esta do outro lado: o mesmo range, cortado por uma pancada surda. */
  public playGateStrain(): void {
    this.osc('triangle', 210, 150, 0.06, 0.1);
    this.noise('lowpass', 240, 1.2, 0.2, 0.11, 0.08); // o baque contra o obstaculo
    this.osc('sine', 120, 70, 0.09, 0.14, 0.08);
  }

  // ── a flor da lua ────────────────────────────────────────────────────────
  // O par tem a mesma logica do portao de bater: um gesto, dois finais. Abrir SOBE e demora (uma
  // flor nao estala); fechar DESCE e acaba num tapa surdo de petala batendo em petala. Sao os dois
  // unicos sons vegetais do jogo, entao nenhum leva metal nem madeira: e ar e um sino.
  // Sintetizados, sem sample — cada um toca quando a escuridao muda, o que e raro.

  /** A flor abrindo: ar entrando devagar e um sino distante subindo uma quinta. */
  public playMoonflowerBloom(): void {
    // O sopro: passa-banda subindo devagar. E ele que da a duracao — a flor abre em ~1,4s, e um
    // som curto por cima de uma animacao longa faz a animacao parecer atrasada.
    this.noise('bandpass', 700, 1.4, 0.075, 0.9);
    this.noise('highpass', 3200, 0.8, 0.03, 0.7, 0.15);
    // O sino: A4 e a quinta acima, o intervalo mais aberto que existe — a mesma "abertura" do
    // gesto. Entra depois do sopro comecar, nunca junto: e a flor que ABRIU, nao o ar.
    this.osc('sine', 440, 440, 0.085, 0.9, 0.28);
    this.osc('sine', 659, 659, 0.05, 0.8, 0.42);
    this.osc('triangle', 220, 220, 0.045, 1.0, 0.3);
  }

  /** A flor fechando: o mesmo ar, agora descendo, cortado pelo tapa das petalas se encontrando. */
  public playMoonflowerClose(): void {
    this.noise('bandpass', 1500, 1.6, 0.07, 0.26);
    this.osc('sine', 520, 180, 0.06, 0.24);
    // O tapa: grave, curto e sem brilho nenhum. E o que separa "fechou" de "esta fechando".
    this.noise('lowpass', 300, 1.1, 0.12, 0.09, 0.2);
  }

  // ── a travessia do portal ────────────────────────────────────────────────
  // Os tres sons sao um arco so, e por isso valem juntos: a succao SOBE (o portal puxando), a
  // viagem e um bordao GRAVE e parado (nada acontece, so distancia passando) e a aterrissagem
  // DESCE e para seco. Nenhum deles usa sample: tocam uma vez por level, e um sample so para
  // isso seria peso de download por um som que quase ninguem ouve duas vezes seguidas.

  // ── a escada ────────────────────────────────────────────────────────────
  // A porta entre os andares deixou de ser magica em tudo — a peca virou pedra de verdade, o
  // heroi desce ANDANDO — menos numa camada: a que o jogador OUVE. Ela ainda tocava o
  // `playPortalSuck`, que e literalmente um glissando de 110 para 880 Hz subindo e afinando com
  // um ruido varrendo junto: "o portal inspirando o heroi". Um lance de escada nao inspira
  // ninguem. O que ele faz e BATER: quatro botas em pedra, uma por pisada, cada uma um pouco
  // mais grave e um pouco mais abafada que a anterior — e e a QUEDA de altura que diz para onde
  // se vai, porque descer e subir usam a mesma pedra e o mesmo passo.

}

// Singleton — persists across scene restarts, shares one AudioContext
let _instance: SoundManager | null = null;
export const getSoundManager = (): SoundManager => {
  if (!_instance) {
    _instance = new SoundManager();
    // Dev-only handle for the playtest (the same instance the game plays through).
    if (import.meta.env.DEV) (window as unknown as { __sound?: SoundManager }).__sound = _instance;
  }
  return _instance;
};

import type { EnemyKind } from '@/game/world/ScreenContent';

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
  // A ESPINHA DO COMBATE. Tudo em `combat/` vem dos pacotes de fantasia importados (ver o bloco
  // no fim desta tabela, `tools/import-combat-sfx.mjs` e CREDITS.md); os `sword-slash.wav`,
  // `enemy-hit.wav` e `enemy-death.wav` GERADOS continuam na raiz de `audio/`, intactos.
  swordSlash: { file: 'combat/sword-swing.wav', vol: 0.8 },
  enemyHit: { file: 'combat/enemy-hit.wav', vol: 0.85 },
  enemyDeath: { file: 'combat/enemy-death.wav', vol: 0.8 },
  coinPickup: { file: 'coin.wav', vol: 0.55 },
  heartPickup: { file: 'heart.wav', vol: 0.7 },
  swordPickup: { file: 'item-pickup.wav', vol: 0.6 }, // item get (Freesound #37089, see CREDITS.md)
  dropWater: { file: 'water-drop.wav', vol: 0.75 }, // single drop for the title-screen reveal
  titleImpact: { file: 'title-impact.wav', vol: 0.95 }, // epic hit when the author's name lands
  singingBowl: { file: 'singing-bowl.wav', vol: 0.8 }, // Tibetan bowl for the intro "wake up"
  playerHurt: { file: 'combat/player-hurt.wav', vol: 0.85 },
  playerDeath: { file: 'combat/player-death.wav', vol: 0.85 },
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
  undeadSpawn: { file: 'combat/undead-spawn.wav', vol: 0.7 },
  fireHit: { file: 'combat/fire-hit.wav', vol: 0.7 },
  bridgePlank: { file: 'bridge-plank.wav', vol: 0.7 },
  bridgeBuilt: { file: 'bridge-built.wav', vol: 0.75 },
  hammer: { file: 'hammer.wav', vol: 0.7 }, // nailing a plank home during a bridge build
  footstep0: { file: 'footstep-0.wav', vol: 0.5 },
  footstep1: { file: 'footstep-1.wav', vol: 0.5 },
  footstep2: { file: 'footstep-2.wav', vol: 0.5 },
  footstep3: { file: 'footstep-3.wav', vol: 0.5 },

  // ── O COMBATE (ver tools/import-combat-sfx.mjs e CREDITS.md) ─────────────────────────────
  //
  // Catorze destes eventos NAO tinham amostra nenhuma: cada um tocava a sintese de emergencia do
  // proprio SoundManager — a rede que existe pra cobrir um sample que ainda nao decodificou — e
  // ela tinha virado o som definitivo de metade da briga.
  //
  // A FONTE E UM PACOTE DE RPG DE FANTASIA (o "RPG Sound Pack", CC0), e isso importa: houve uma
  // versao com um pacote retro de fliperama, e o combate acabou com LASER no feitico do mago,
  // ALARME no telegrafo da caveira e GRITO DE ALIENIGENA na morte. Hoje o mago tem `battle/spell`,
  // a caveira tem `NPC/shade` (o espectro — que e o que ela e), a gosma tem `NPC/slime` e a aranha
  // tem `NPC/beetle`. Sobraram SEIS sons do pacote retro, e so nos IMPACTOS: o pacote de fantasia
  // tem golpe e criatura, mas nao tem nenhuma pancada — e as seis que ficaram sao percussivas e
  // neutras, sem nada de espacial.
  //
  // O volume de cada um e DAQUI, nao do arquivo: o importador normaliza tudo no mesmo pico (-1
  // dBFS) exatamente pra que a mixagem seja uma decisao de jogo, tomada nesta coluna, e nao um
  // acidente de quao alto o pacote gravou. E por isso a gosma (0.32) e um sopro e o encontrao
  // (0.8) e um evento, com o mesmo arquivo de origem tendo a mesma escala.
  fistSwing: { file: 'combat/fist-swing.wav', vol: 0.62 },
  spinRelease: { file: 'combat/spin-release.wav', vol: 0.85 },
  undeadWhiff: { file: 'combat/undead-whiff.wav', vol: 0.45 },
  spinReady: { file: 'combat/spin-ready.wav', vol: 0.55 },
  guardBlock: { file: 'combat/guard-block.wav', vol: 0.7 },
  bladeGlance: { file: 'combat/blade-glance.wav', vol: 0.5 },
  bodySlam: { file: 'combat/body-slam.wav', vol: 0.8 },
  enemyShot: { file: 'combat/enemy-shot.wav', vol: 0.55 },
  // OS TELEGRAFOS SUBIRAM. Estes três (mais o `spellWindup` abaixo) são sons SUSTENTADOS — uma
  // carga que dura, não um baque —, e por isso o RMS é régua válida para eles: mediam de 8 a 10 dB
  // abaixo do resto do combate, ou seja, os avisos eram a coisa mais silenciosa da briga. Ficam
  // ainda abaixo dos golpes de propósito (um aviso não compete com o impacto), mas agora dentro da
  // mesma conversa.
  //
  // Os curtos NÃO foram mexidos pelo mesmo número, e isso importa: todo arquivo aqui sai com o
  // mesmo pico (-1 dBFS), então num tique de 46ms o RMS baixo só quer dizer "é um tique", não "é
  // baixo". Corrigir o aparo por RMS seria distorcer o único som que já estava certo.
  turretCharge: { file: 'combat/turret-charge.wav', vol: 0.55 },
  zoraSpit: { file: 'combat/zora-spit.wav', vol: 0.66 },
  spiderPounce: { file: 'combat/spider-pounce.wav', vol: 0.55 },
  slimeHop: { file: 'combat/slime-hop.wav', vol: 0.32 },
  creatureArrive: { file: 'combat/creature-arrive.wav', vol: 0.38 },
  // Os telegrafos que ainda eram sintetizados. O da caveira e um SIBILO DE ESPECTRO e o do mago e
  // um FEITICO carregando — os dois do bestiario de fantasia, e os dois cortados para caber
  // exatamente na janela que anunciam.
  undeadWindup: { file: 'combat/undead-windup.wav', vol: 0.62 },
  spellWindup: { file: 'combat/spell-windup.wav', vol: 0.7 },
  zoraSurface: { file: 'combat/zora-surface.wav', vol: 0.4 },
} as const;

/**
 * O JITTER DE ALTURA MUDA A DURACAO, e isso decide quais sons podem levar jitter.
 *
 * `playSample` varia o tom mexendo em `playbackRate` — que e a mesma coisa que esticar ou encolher
 * o arquivo no tempo. Para um baque de 90ms isso e invisivel e resolve a repeticao. Para um som
 * cuja duracao FOI ESCOLHIDA pra casar com uma janela do jogo — a carga da torreta acaba no frame
 * em que o leque sai, a boca do zora fecha quando o cuspe sai — esticar o arquivo desalinha o
 * aviso do gesto que ele anuncia. Esses tocam sem jitter, e a repeticao deles nao incomoda porque
 * sao raros e longos.
 */
const HIT_JITTER = 0.9; // semitons, o mesmo do enemyHit
type SampleKey = keyof typeof SAMPLES;

/**
 * A VOZ POR ESPÉCIE — o bestiário tem oito corpos e tinha UMA voz.
 *
 * `enemy-hit.wav`, `enemy-death.wav`, `undead-windup.wav` e `creature-arrive.wav` tocavam iguais
 * para todo mundo: osso, gosma, aranha e torreta morriam com o mesmo som (o próprio progress.md
 * aponta isso como fraqueza a re-escutar). A resposta NÃO é oito pares de arquivos novos: é a
 * mesma amostra em ALTURA de espécie — corpo pequeno agudo, corpo pesado grave — que é como o
 * SNES sempre fez família de bicho com um sample só.
 *
 * A taxa é FIXA por espécie de propósito, e por isso ela pode existir até no telegrafo (que recusa
 * o jitter ALEATÓRIO — ver HIT_JITTER): uma altura constante é aprendível, e a mudança de duração
 * que ela causa é constante junto. No morcego ela até CONSERTA um desalinho: o aviso de ~300ms
 * não cabia na janela de 280ms dele — a 1.28x passa a caber. O jitter aleatório continua por cima,
 * multiplicativo, nos sons que já o tinham.
 */
const ENEMY_VOICE: Readonly<Record<EnemyKind, { hit: number; death: number; tell: number }>> = {
  undead: { hit: 1.0, death: 1.0, tell: 1.0 }, // a régua: o corpo que ensinou o combate
  bat: { hit: 1.3, death: 1.35, tell: 1.28 },
  spider: { hit: 1.15, death: 1.2, tell: 1.12 },
  slime: { hit: 0.88, death: 0.9, tell: 0.84 },
  bigslime: { hit: 0.68, death: 0.62, tell: 0.72 },
  zora: { hit: 0.95, death: 0.95, tell: 1.0 },
  mage: { hit: 1.05, death: 1.05, tell: 1.0 },
  turret: { hit: 0.6, death: 0.55, tell: 1.0 }, // pedra: o mesmo baque, uma oitava abaixo
};

const voiceRate = (kind: EnemyKind | undefined, part: 'hit' | 'death' | 'tell'): number =>
  kind ? ENEMY_VOICE[kind][part] : 1;

// Souls staging: the title screen is just dripping water, and the combat track rises while
// undead are out of the ground. 'overworld' ("Ashen Fields") is the adventure's exploration
// theme, revived after years shelved — it plays over the wind bed in the overworld only
// (dungeons, levels and the explorer stay wind-only: their dark is design). 'title' remains
// unused since the intro was cut.
export type MusicKey = 'title' | 'overworld' | 'danger' | 'menu';
const TRACKS: Record<MusicKey, { file: string; vol: number }> = {
  title: { file: 'music-title.wav', vol: 0.8 },
  overworld: { file: 'music-overworld.wav', vol: 0.9 },
  danger: { file: 'music-danger.wav', vol: 1.0 },
  menu: { file: 'menu-drips.wav', vol: 0.5 }, // soft water drops under the title screen
};
const AMBIENCE_FILE = 'ambience-wind.wav';

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

  // The wind bed — plain loop with its own gain, NOT on the music bus, so it keeps
  // blowing while music ducks for dialogs (Souls: voices over wind, not over silence).
  private ambienceBuffer: AudioBuffer | null = null;
  private ambienceSource: AudioBufferSourceNode | null = null;
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

    fetchBuffer(AMBIENCE_FILE)
      .then((buffer) => { this.ambienceBuffer = buffer; if (this.wantAmbience) this.startAmbienceNow(); })
      .catch((err) => { console.warn(`[audio] could not load ${AMBIENCE_FILE}:`, err); });
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

  /**
   * O SOCO — o botao A sem espada na mochila.
   *
   * Ele tocava `playSwordSlash`, e por isso a arma que o heroi NAO tem soava exatamente igual a que
   * ele tem: a unica diferenca audivel entre estar armado e nao estar era o silencio de nao acertar
   * a segunda fileira do arco. O golpe de punho tem alcance menor, dano menor e nenhuma lamina — e
   * agora tem som proprio, seco e sem metal.
   */
  public playFistSwing(): void {
    if (this.playSample('fistSwing', HIT_JITTER)) return;
    this.noise('lowpass', 700, 0.8, 0.18, 0.09);
    this.osc('sawtooth', 120, 40, 0.10, 0.09);
  }

  /**
   * A lamina TERMINOU de carregar (ver GameScene.tickSpinCharge). Duas notas subindo, curtas e
   * limpas — um sino, nunca um zumbido: o zumbido ja e a lingua da maquina (torreta, caldeira),
   * e este som pertence ao heroi.
   */
  public playSpinReady(): void {
    if (this.playSample('spinReady', 0.5)) return;
    const d = detune();
    this.osc('triangle', 660 * d, 880 * d, 0.14, 0.09);
    this.osc('sine', 1320 * d, 1760 * d, 0.07, 0.11, 0.04);
  }

  /**
   * A CARGA EM CURSO — o meio segundo entre segurar o A e o sino de pronta era MUDO: nada na mão,
   * nada no ouvido, e o gesto só existia para quem já sabia que ele existia. Um zumbido fino
   * SUBINDO (toda carga desta casa sobe) preenche exatamente essa janela: ele nasce quase
   * inaudível, cresce até o instante da carga completa e é substituído pelo sino.
   *
   * É um nó vivo e não um one-shot porque a carga pode MORRER no meio (soltar cedo, apanhar
   * segurando, abrir o menu) — e um zumbido que continuasse subindo depois de a carga já era
   * seria o som mentindo sobre o estado. `stopSpinChargeHum` corta em 50ms.
   */
  public startSpinChargeHum(durationMs: number): void {
    this.stopSpinChargeHum();
    const ctx = this.audio;
    const t = ctx.currentTime;
    const dur = Math.max(0.1, durationMs / 1000);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.085, t + dur);
    g.connect(this.sfxUserBus);
    const d = detune();
    const oscs = [
      { type: 'triangle' as OscillatorType, from: 220 * d, to: 560 * d },
      { type: 'sine' as OscillatorType, from: 440 * d, to: 1120 * d }, // a oitava, mais fina
    ].map(({ type, from, to }) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(from, t);
      o.frequency.exponentialRampToValueAtTime(to, t + dur);
      o.connect(g);
      o.start(t);
      o.stop(t + dur + 0.03); // acaba sozinho no instante em que o sino assume
      return o;
    });
    this.chargeHum = { oscs, gain: g };
  }

  public stopSpinChargeHum(): void {
    const hum = this.chargeHum;
    if (!hum) return;
    this.chargeHum = null;
    const now = this.audio.currentTime;
    hum.gain.gain.cancelScheduledValues(now);
    hum.gain.gain.setValueAtTime(Math.max(hum.gain.gain.value, 0.0001), now);
    hum.gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    for (const o of hum.oscs) {
      try { o.stop(now + 0.06); } catch { /* already stopped */ }
    }
  }

  /**
   * A CARGA PERDIDA — soltar a lâmina pronta no meio do atordoamento a desperdiça (a outra metade
   * do trato do giro), e o desperdício era mudo: o jogador pagou meio segundo parado e nem ficou
   * sabendo que pagou à toa. Um DESCER curto e abafado — o inverso exato do sino de pronta.
   */
  public playSpinFizzle(): void {
    const d = detune();
    this.osc('triangle', 620 * d, 180 * d, 0.1, 0.16);
    this.noise('lowpass', 900, 1.0, 0.07, 0.12, 0.02);
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
   * A GUARDA APARANDO — o tim de metal contra metal, dos dois lados do combate: o escudo do herói
   * e a guarda que um bicho ergue enquanto arma o golpe.
   *
   * Tem de ser o OPOSTO do acerto (`playEnemyHit`, que é grave e sujo): agudo, curtíssimo e
   * limpo. Um golpe aparado que soasse parecido com um golpe certeiro ensinaria a coisa errada
   * no único instante em que o jogo está tentando ensinar posicionamento.
   */
  public playGuardBlock(): void {
    if (this.playSample('guardBlock', HIT_JITTER)) return;
    // A VARIAÇÃO não é enfeite: toda amostra deste jogo que se repete já sai com jitter de altura
    // (o passo roda quatro variantes com ±1,2 semitom, o acerto sai com ±0,9), justamente porque
    // repetição idêntica denuncia a amostra. Os sons SINTETIZADOS não tinham nada disso — e o
    // aparo e o encontrão são, por definição, sons que acontecem muitas vezes seguidas na mesma
    // briga. Uma oitava de ±4% na frequência resolve, e sai de graça: não há amostra para variar,
    // só um número.
    const d = detune();
    this.osc('square', 1760 * d, 1320 * d, 0.1, 0.05);
    this.osc('triangle', 2640 * d, 1980 * d, 0.06, 0.07, 0.01);
    this.noise('highpass', 4200 * d, 0.6, 0.12, 0.06);
  }

  /**
   * O RESVALO — a lâmina escorregando de um corpo que ainda está piscando de invulnerável.
   *
   * Ele era **mudo**, e mudo é a pior resposta que um botão pode dar: o jogador apertou, viu a
   * lâmina passar por dentro do bicho e não ouviu nada, o que lê como input perdido e não como
   * recusa. Duas das três recusas do combate estavam assim (esta e o golpe num corpo que ainda
   * está saindo do chão) — e a lei da casa, "toda recusa tem desenho PRÓPRIO", vale para o ouvido
   * também: o anel azul frio já dizia ESPERE, e faltava alguém dizer isso em voz alta.
   *
   * É o oposto do aparo (`playGuardBlock`, agudo e limpo, metal contra metal): ali houve encontro,
   * aqui houve ESCORREGÃO. Um raspão curto e abafado, sem cauda e sem brilho — grave o bastante
   * para nunca ser confundido com um acerto, seco o bastante para não pesar quando sai três vezes
   * no mesmo giro.
   */
  public playBladeGlance(): void {
    if (this.playSample('bladeGlance', HIT_JITTER)) return;
    const d = detune();
    this.noise('bandpass', 820 * d, 2.2, 0.16, 0.055);
    this.osc('triangle', 400 * d, 260 * d, 0.07, 0.05, 0.01);
  }

  /**
   * O ENCONTRÃO — o corpo batendo na parede depois do arremesso.
   *
   * Não podia ser o `playRockSmash`, que era o candidato óbvio por ser o impacto pesado que já
   * existe: aquela amostra diz **pedra QUEBRANDO**, e ela tocaria por cima do baque do acerto toda
   * vez que o jogador encurralasse uma caveira contra uma árvore. Um som que descreve outra coisa
   * ensina outra coisa. Este é o oposto de quebrar: um baque surdo e curto, sem cauda e sem
   * estilhaço — massa encontrando massa.
   */
  public playBodySlam(): void {
    if (this.playSample('bodySlam', HIT_JITTER)) return;
    const d = detune();
    this.noise('lowpass', 260 * d, 1.4, 0.5, 0.1);
    this.osc('sine', 120 * d, 46 * d, 0.34, 0.13);
  }

  /** O giro escapando: o vento do arco, grave e largo, com o metal por cima. */
  public playSpinRelease(): void {
    if (this.playSample('spinRelease', HIT_JITTER)) return;
    this.noise('bandpass', 1100, 0.9, 0.34, 0.26);
    this.osc('sawtooth', 320, 90, 0.2, 0.22);
    this.osc('triangle', 880, 440, 0.1, 0.18, 0.02);
  }

  /** O golpe conectando num corpo — na ALTURA da espécie que apanhou (ver ENEMY_VOICE). */
  public playEnemyHit(kind?: EnemyKind): void {
    const r = voiceRate(kind, 'hit');
    if (this.playSample('enemyHit', 0.9, 1, r)) return;
    this.noise('lowpass', 320 * r, 1.2, 0.42, 0.09);
    this.osc('sawtooth', 140 * r, 55 * r, 0.26, 0.12);
  }

  /** A morte — a mesma amostra, mas o morcego morre agudo e a torreta desaba grave. */
  public playEnemyDeath(kind?: EnemyKind): void {
    const r = voiceRate(kind, 'death');
    if (this.playSample('enemyDeath', 0.5, 1, r)) return;
    const notes = [150, 110, 73] as const;
    notes.forEach((freq, i) => {
      this.osc('sawtooth', freq * r, freq * r * 0.6, 0.26, 0.16, i * 0.09);
      this.noise('lowpass', 300 * r, 1.0, 0.16, 0.10, i * 0.09);
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

  /**
   * A garra do braco robotico fechando em cima de um item. Sintetizado direto, sem sample: e um
   * som que toca sozinho e pode repetir muitas vezes seguidas numa esteira de bracos, entao ele
   * precisa ser CURTO e discreto — um servo curtinho subindo e o "tac" seco da pinca travando em
   * cima dele. Nada de peso metalico grande, que viraria martelada a cada tres segundos.
   */
  public playArmGrab(): void {
    // Volumes na mesma faixa do playHammer (0.12-0.14). A primeira versao usava 0.045-0.07 e
    // simplesmente nao se ouvia: "discreto" virou inaudivel debaixo da trilha e do vento. Leve
    // ainda e — so que agora leve de verdade, e nao ausente.
    this.osc('square', 190, 340, 0.11, 0.08); // o servo subindo
    this.noise('bandpass', 2800, 4.0, 0.13, 0.05, 0.05); // a pinca travando
    this.osc('triangle', 470, 350, 0.075, 0.07, 0.05);
  }

  /**
   * O servo do braco robotico girando. Toca no comeco da meia-volta e dura o tanto que ela dura —
   * e o unico som do conjunto que nao e um impacto, e e ele que da a sensacao de MAQUINA em vez
   * de uma sequencia de estalos soltos. Grave e baixo: ele vai tocar a cada item, pra sempre.
   */
  public playArmServo(): void {
    this.osc('triangle', 118, 132, 0.055, 0.42);
    this.osc('square', 236, 264, 0.022, 0.42);
  }

  /** A pinca abrindo e a carga assentando no chao — mais leve que a mordida da pegada. */
  public playArmRelease(): void {
    this.osc('square', 300, 190, 0.06, 0.06);
    this.noise('lowpass', 900, 1.2, 0.09, 0.07, 0.04); // a carga tocando o chao
  }

  /**
   * O braco ARRANCOU pra entregar e nao pode: a saida esta presa. Mesma decisao do par do portao
   * de bater — e o som de trabalho (playArmServo) com outro final. O servo comeca a girar e morre
   * num baque surdo em vez de completar a meia-volta, entao "tentou e nao deu" e audivel sem que
   * nada precise dizer o que falta. Grave e curto: repete a cada 2,2s enquanto o impasse durar.
   */
  public playArmStrain(): void {
    this.osc('triangle', 118, 126, 0.05, 0.12); // o servo, cortado antes de pegar embalo
    this.noise('lowpass', 260, 1.1, 0.11, 0.08, 0.1); // o baque de fim de curso
    this.osc('sine', 96, 62, 0.06, 0.14, 0.1);
  }

  /** O toque seco do braco chegando ao fim do curso, ja de volta em repouso. */
  public playArmPark(): void {
    this.noise('bandpass', 1500, 3.0, 0.05, 0.035);
    this.osc('triangle', 150, 110, 0.045, 0.05);
  }

  /** A corrente vence a inercia: madeira pesada, eixo metalico e a primeira pa pegando agua. */
  public playWaterWheelStart(): void {
    this.noise('lowpass', 520, 1.1, 0.16, 0.18);
    this.osc('triangle', 72, 108, 0.12, 0.28);
    this.noise('bandpass', 1350, 2.8, 0.08, 0.07, 0.06);
  }

  /** Batida recorrente de uma pa no rio; propositalmente curta e baixa para poder repetir. */
  public playWaterWheelPaddle(speed01 = 1): void {
    const strength = Math.max(0.35, Math.min(1, speed01));
    this.noise('lowpass', 760, 0.85, 0.055 * strength, 0.09);
    this.osc('triangle', 92, 70, 0.028 * strength, 0.1, 0.015);
  }

  /** O dinamo alcancou tensao: confirmacao curta, ascendente e harmonica, sem fanfarra. */
  public playWaterWheelPower(): void {
    this.osc('triangle', 196, 247, 0.08, 0.16);
    this.osc('square', 392, 494, 0.035, 0.13, 0.045);
    this.noise('bandpass', 2400, 3.5, 0.045, 0.055, 0.08);
  }

  /** A agua parou de empurrar; o tom cai, mas a animacao ainda conserva momento por um tempo. */
  public playWaterWheelStop(): void {
    this.osc('triangle', 108, 62, 0.065, 0.32);
    this.noise('lowpass', 390, 1.2, 0.055, 0.16, 0.03);
  }

  /** A chama pegou sob a caldeira: um sopro grave de tiragem, ar sendo puxado pela fornalha. */
  public playBoilerIgnite(): void {
    this.noise('lowpass', 300, 1.1, 0.14, 0.24);
    this.osc('triangle', 58, 92, 0.09, 0.3, 0.03);
  }

  /** A valvula solta vapor em regime; curto e baixo de proposito, porque repete para sempre. */
  public playBoilerPuff(pressure01 = 1): void {
    const strength = Math.max(0.35, Math.min(1, pressure01));
    this.noise('bandpass', 3100, 1.6, 0.04 * strength, 0.08);
    this.noise('highpass', 5200, 1.0, 0.02 * strength, 0.05, 0.01);
  }

  /** O vapor alcancou pressao de circuito: a confirmacao do dinamo, com um xiado por cima. */
  public playBoilerPower(): void {
    this.osc('triangle', 175, 220, 0.08, 0.16);
    this.osc('square', 349, 440, 0.035, 0.13, 0.045);
    this.noise('highpass', 4200, 1.4, 0.05, 0.1, 0.05);
  }

  /** A pressao se foi: o tom desce e o ultimo vapor escapa devagar. */
  public playBoilerStop(): void {
    this.osc('triangle', 120, 68, 0.06, 0.3);
    this.noise('bandpass', 2200, 1.4, 0.045, 0.22, 0.04);
  }

  /** A carga salta do cabo pra bateria: um zap curto SUBINDO, com um tico de brilho no fim. */
  public playBatteryCharge(): void {
    this.osc('square', 240, 960, 0.05, 0.12);
    this.osc('triangle', 480, 1400, 0.04, 0.1, 0.03);
    this.noise('highpass', 6000, 1.2, 0.025, 0.05, 0.08);
  }

  /** O canister encaixa no cabo: trava metalica curta + corrente assumindo a rede. */
  public playBatteryDock(): void {
    this.noise('bandpass', 1700, 3.2, 0.09, 0.045);
    this.osc('triangle', 150, 92, 0.07, 0.1, 0.02);
    this.osc('square', 220, 260, 0.035, 0.08, 0.055);
  }

  /** Motor do portao assumindo carga (subindo) ou perdendo tensao (descendo por gravidade). */
  public playElectronicGateMotor(opening: boolean): void {
    if (opening) {
      this.osc('triangle', 74, 118, 0.065, 0.48);
      this.osc('square', 148, 236, 0.022, 0.44, 0.025);
      this.noise('bandpass', 1300, 2.8, 0.045, 0.12, 0.04);
    } else {
      this.osc('triangle', 112, 58, 0.06, 0.38);
      this.noise('lowpass', 430, 1.4, 0.075, 0.28, 0.03);
    }
  }

  /** Fim de curso: leve no alto, pesado e travado quando a grade volta ao chao. */
  public playElectronicGateStop(opened: boolean): void {
    this.noise('bandpass', opened ? 1800 : 900, 3, opened ? 0.055 : 0.12, 0.055);
    this.osc('triangle', opened ? 210 : 92, opened ? 160 : 48, opened ? 0.045 : 0.1, 0.09);
  }

  /** Grade fechada recebendo um bump: vibracao metalica curta, sem parecer dano/ataque. */
  public playElectronicGateDenied(): void {
    this.noise('bandpass', 1200, 4.2, 0.075, 0.045);
    this.osc('triangle', 180, 145, 0.045, 0.08, 0.01);
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
   * The undead attack wind-up: the audio half of the "dodge now" telegraph (the visual half is the
   * ground ring closing + the rear-back pose + the bone going up over the head).
   *
   * SEM JITTER: os 300ms deste arquivo cabem na janela de 500ms com folga, e esticar o tom
   * estica a duracao (ver HIT_JITTER) — este e o aviso que menos pode escorregar do gesto.
   * A voz por especie (ver ENEMY_VOICE) e FIXA, entao pode entrar: a duracao muda junto, mas
   * muda sempre igual — e no morcego (janela de 280ms) a taxa 1.28x faz o aviso finalmente caber.
   */
  public playUndeadWindup(kind?: EnemyKind): void {
    const r = voiceRate(kind, 'tell');
    if (this.playSample('undeadWindup', 0, 1, r)) return;
    this.osc('sawtooth', 70 * r, 170 * r, 0.10, 0.32);
    this.noise('bandpass', 520 * r, 2.2, 0.09, 0.28);
  }

  /** The strike that met empty air: a thin whoosh, nothing landed. */
  public playUndeadWhiff(): void {
    if (this.playSample('undeadWhiff', HIT_JITTER)) return;
    this.noise('highpass', 1600, 1.0, 0.10, 0.09);
    this.osc('triangle', 220, 90, 0.05, 0.08);
  }

  /**
   * The undead spawn telegraph: a low ground-rumble with a gravelly crunch on top, warning
   * that something is about to claw out of the tile (playUndeadSpawn fires when it does).
   * Procedural only — no authored sample yet.
   */
  /**
   * O CHÃO RACHANDO antes de a caveira sair — e este é o único evento de combate que ficou na
   * SÍNTESE, de propósito.
   *
   * Ele já foi 8-bit por um dia, com uma explosão longa do pacote: 2,1 SEGUNDOS de bomba (4,5×
   * mais longa que qualquer outro som do combate) disparando a cada 3,2s de cerco, na abertura de
   * toda partida. O som tinha sido escolhido por medida — grave, longo, contínuo — passando por
   * cima do nome da pasta, que dizia *Explosions*.
   *
   * O pacote não tem TERRA, e esta é a diferença entre o telegrafo funcionar e não funcionar: ele
   * é um aviso de TRÊS SEGUNDOS cujo trabalho inteiro é dar tempo de sair do tile. Precisa ser
   * baixo, contínuo e quase discreto — um evento sonoro grande no lugar de um aviso faz o jogador
   * reagir ao susto em vez de ao chão. Estas três camadas foram desenhadas exatamente para isso.
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

  // ── o bestiario que nao vem do chao ──────────────────────────────────────
  // A caveira tem o chao rachando (playGroundCrack) porque ela nasce de baixo. Bicho, gosma e
  // maquina chegam de outro jeito, e cada som abaixo e o par sonoro de um gesto que ja esta na
  // tela — nenhum deles existe para "avisar" sozinho.

  /** A chegada de um corpo que nao vem de baixo: um roçado seco e um baque leve assentando. */
  public playCreatureArrive(kind?: EnemyKind): void {
    const r = voiceRate(kind, 'tell');
    if (this.playSample('creatureArrive', HIT_JITTER, 1, r)) return;
    this.noise('highpass', 2200 * r, 0.9, 0.07, 0.14);
    this.noise('lowpass', 420 * r, 1.0, 0.11, 0.18, 0.05);
    this.osc('triangle', 150 * r, 90 * r, 0.06, 0.14, 0.04);
  }

  /**
   * O INSTANTE DE NOTAR — o corpo que vagava viu o herói e passou a caçá-lo (ver
   * EnemyBase.startleNotice). Um sopro curto SUBINDO, porque atenção sobe (toda carga desta casa
   * sobe), e baixo de propósito: é informação de leitura, não um susto — o susto é o bicho vindo.
   * Sintetizado, sem sample: toca uma vez por avistamento, na altura da voz da espécie.
   */
  public playCreatureNotice(kind?: EnemyKind): void {
    const r = voiceRate(kind, 'tell');
    this.noise('bandpass', 1500 * r, 2.0, 0.055, 0.09);
    this.osc('triangle', 300 * r, 540 * r, 0.05, 0.11);
  }

  /** O bote da aranha: o estalo da mola soltando, curto e seco. */
  public playSpiderPounce(): void {
    if (this.playSample('spiderPounce', HIT_JITTER)) return;
    this.osc('square', 480, 180, 0.07, 0.09);
    this.noise('bandpass', 1800, 2.6, 0.09, 0.1);
  }

  /** O salto da gosma: um plop molhado, gordo e sem ataque nenhum. */
  public playSlimeHop(): void {
    // Jitter LARGO (1,4 semitom): a gosma salta sem parar e o plop dela e o som mais repetido do
    // bestiario — 40ms nao tem duracao nenhuma a perder esticando.
    if (this.playSample('slimeHop', 1.4)) return;
    this.osc('sine', 190, 70, 0.09, 0.14);
    this.noise('lowpass', 700, 0.9, 0.07, 0.1, 0.02);
  }

  /**
   * A carga da torreta: um zumbido SUBINDO — o aviso de 350ms antes do leque. Sobe porque toda
   * carga do jogo sobe (o vento da caveira, o sopro da flor): descer significa acabar.
   */
  public playTurretCharge(): void {
    // SEM JITTER: os 348ms deste arquivo foram escolhidos contra os 350ms da janela de carga, e
    // jitter e `playbackRate` — esticar o tom estica a duracao e desalinha o aviso do leque.
    if (this.playSample('turretCharge')) return;
    this.osc('sawtooth', 180, 620, 0.06, 0.34);
    this.noise('bandpass', 1400, 4.0, 0.04, 0.3);
  }

  /** O vento da conjuracao do mago: o mesmo gesto de subir, em ar em vez de metal. */
  public playSpellWindup(): void {
    if (this.playSample('spellWindup')) return; // sem jitter: telegrafo de 420ms, ver playTurretCharge
    this.noise('bandpass', 900, 2.4, 0.07, 0.4);
    this.osc('sine', 320, 760, 0.05, 0.38);
  }

  /**
   * O zora rompendo a superficie (e voltando pra ela: o mesmo som serve aos dois, porque e o mesmo
   * gesto). Agua deslocada — ruido passa-baixa curto com um "glup" grave por baixo. Deliberadamente
   * DISCRETO: e o unico aviso de que o rio tem coisa dentro, e um som grande arruinaria o susto.
   */
  public playZoraSurface(): void {
    if (this.playSample('zoraSurface', HIT_JITTER)) return;
    this.noise('lowpass', 900, 0.9, 0.12, 0.2);
    this.osc('sine', 220, 90, 0.07, 0.16);
    this.noise('highpass', 3000, 0.7, 0.04, 0.12, 0.06); // as goticulas caindo depois
  }

  /** A boca abrindo com o cuspe carregando dentro: um sugar que SOBE, como toda carga desta casa. */
  public playZoraSpit(): void {
    if (this.playSample('zoraSpit')) return; // sem jitter: ver playTurretCharge (telegrafo de 400ms)
    this.noise('bandpass', 700, 3.0, 0.06, 0.34);
    this.osc('sine', 180, 520, 0.05, 0.3);
  }

  /** O disparo — o instante em que a bala (ou a bola) sai. Curto: o voo ja e visivel. */
  public playEnemyShot(): void {
    if (this.playSample('enemyShot', HIT_JITTER)) return;
    this.osc('square', 700, 240, 0.08, 0.1);
    this.noise('highpass', 2600, 0.8, 0.06, 0.08);
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

  /** O portal inspirando o heroi: um glissando que sobe e afina ate sumir na propria altura. */
  public playPortalSuck(): void {
    this.osc('sine', 110, 880, 0.16, 0.85);
    this.osc('triangle', 220, 1760, 0.07, 0.8, 0.04);
    // O ar indo junto — passa-banda subindo mantem a impressao de succao, nao de assobio.
    this.noise('bandpass', 900, 2.2, 0.1, 0.7, 0.06);
  }

  /** O estalo do heroi atravessando: o unico impacto do conjunto, e o mais curto. */
  public playPortalSwallow(): void {
    this.noise('lowpass', 420, 0.9, 0.22, 0.16);
    this.osc('sine', 320, 60, 0.14, 0.28);
  }

  /**
   * O tunel. Longo de proposito (~2.4s): e uma CAMA, nao um efeito — a viagem inteira acontece
   * em cima dele, e um som curto aqui deixaria a metade da travessia em silencio.
   */
  public playPortalTravel(): void {
    this.osc('sine', 58, 44, 0.12, 2.4);
    this.osc('triangle', 87, 66, 0.05, 2.4);
    this.noise('lowpass', 380, 0.7, 0.09, 2.2, 0.08);
    // Um brilho subindo no fim: a luz do outro lado chegando antes do heroi.
    this.osc('sine', 330, 990, 0.05, 0.5, 1.85);
  }

  /** As botas no chao do mundo novo: grave, seco, sem cauda. */
  public playPortalLand(): void {
    this.noise('lowpass', 260, 1.1, 0.26, 0.14);
    this.osc('sine', 140, 55, 0.16, 0.2);
    this.noise('bandpass', 1600, 2.5, 0.06, 0.05, 0.02); // a poeira
  }
}

// Singleton — persists across scene restarts, shares one AudioContext
let _instance: SoundManager | null = null;
export const getSoundManager = (): SoundManager => {
  _instance ??= new SoundManager();
  return _instance;
};

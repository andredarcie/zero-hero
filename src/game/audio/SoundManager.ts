import { scheduleRadioClick, scheduleSyllable } from '@/game/audio/dialogVoice';
import type { SpokenSyllable } from '@/game/dialogs/voicePersonas';
import type { Material, Surface } from '@/game/audio/materials';
import { localStore, platform } from '@/game/platform/platform';


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
    const raw = localStore().getItem(storageKey);
    if (raw !== null) {
      const v = Number(raw);
      if (Number.isFinite(v)) return clamp01(v);
    }
  } catch { /* storage unavailable */ }
  return 1;
};

// All audio is generated offline ("Dark Souls weight, SNES timbre" — see
// public/assets/audio/CREDITS.md): layered SFX with baked echo/reverb tails, plus four
// seamless ambience loops at 32 kHz; the music comes from tools/gen-cozy-music.mjs (whole pieces at
// 44.1 kHz, see VALLEY_PIECES). This manager decodes and plays the samples;
// the procedural synth at the bottom is only a fallback for the first seconds before a
// sample finishes decoding (or if one fails to load).

const SAMPLES = {
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

type SampleKey = keyof typeof SAMPLES;

/** O atraso de um decodificador de MP3 não passa disto, e nenhum efeito começa em silêncio de propósito. */
const MAX_DECODER_DELAY_S = 0.06;
const DECODER_SILENCE = 0.001;


// A MUSICA E DO VALE, E SO DELE (tudo de tools/gen-cozy-music.mjs). 'title' e 'menu' sao a cancao de
// ninar do titulo e dos creditos, um loop sem emenda. 'overworld' NAO e um loop: sao seis pecas
// inteiras, de quase dois a tres minutos e meio, escolhidas pela hora do dia, com um silencio so de
// ambiente entre uma e outra (ver VALLEY_PIECES). Loop curto e o que cansa numa trilha calma.
export type MusicKey = 'title' | 'overworld' | 'menu';
type LoopKey = Exclude<MusicKey, 'overworld'>;
/**
 * As pecas saem masterizadas a -18 LUFS com o pico preso a ~10 dB acima do nivel (ataque nenhum
 * "bate" por cima da musica). No jogo elas soam como -10 LUFS: 1,5 dB acima da trilha antiga (-11,5),
 * porque o autor achou a musica baixa demais com os picos altos — agora que os picos cairam, o corpo
 * pode subir.
 */
const MUSIC_GAIN = 10 ** ((-10 - -18) / 20);
const LULLABY_SECONDS = 3386880 / 44100;
const TRACKS: Record<LoopKey, { file: string; vol: number; seconds: number }> = {
  title: { file: 'music-lullaby.mp3', vol: 0.7 * MUSIC_GAIN, seconds: LULLABY_SECONDS },
  menu: { file: 'music-lullaby.mp3', vol: 0.7 * MUSIC_GAIN, seconds: LULLABY_SECONDS },
};

/** Dia, entardecer e noite, lidos da mistura dos leitos de ambiente (`setAmbienceMix`). */
type ValleyTime = 'day' | 'dusk' | 'night';
const VALLEY_PIECES: readonly { file: string; when: readonly ValleyTime[] }[] = [
  { file: 'valley-morning.mp3', when: ['day'] }, // Morning Dew: fa maior, violao e piano
  { file: 'valley-waltz.mp3', when: ['day'] }, // Garden Waltz: valsa, clarinete
  { file: 'valley-clouds.mp3', when: ['day', 'dusk'] }, // Lazy Clouds: lidio, flauta longa
  { file: 'valley-golden.mp3', when: ['dusk', 'night'] }, // Golden Hour: eolio, clarinete grave
  { file: 'valley-fireflies.mp3', when: ['dusk', 'night'] }, // Fireflies: piano de feltro quase sozinho
  { file: 'valley-moon.mp3', when: ['night'] }, // Moon over the Lake: dorico, flauta e cordas
];
const VALLEY_VOL = 0.8 * MUSIC_GAIN;

/**
 * Tudo o que dá para ouvir no player do menu de pausa (`Jukebox`), com o ganho com que cada faixa
 * toca no jogo: no player ela soa no mesmo nível em que se ouve no vale.
 */
export const LISTENING_TRACKS: readonly { file: string; vol: number; when: readonly (ValleyTime | 'title')[] }[] = [
  ...VALLEY_PIECES.map((p) => ({ file: p.file, vol: VALLEY_VOL, when: p.when })),
  { file: TRACKS.title.file, vol: TRACKS.title.vol, when: ['title'] },
];
/** A primeira peca entra pouco depois do jogo; entre as outras, so o vale (passaros, grilos, agua). */
const VALLEY_FIRST_DELAY_S = 3;
const VALLEY_GAP_S = [35, 75] as const;
/**
 * Uma peca de tres minutos e meio decodificada a 48 kHz ocupa uns 80 MB. A trilha nao tem nada acima de
 * 9 kHz, entao decodificar a 32 kHz nao perde nada que se ouca e cabe num celular. So a peca que toca
 * (e a proxima, enquanto baixa) fica na memoria.
 */
const VALLEY_DECODE_RATE = 32000;

/**
 * Cada loop comprimido traz a própria cauda antes e o próprio começo depois (tools/encode-audio.mjs):
 * o atraso do decodificador de MP3 cai nessa sobra, e o que toca é só o miolo, sem estalo na emenda.
 */
const LOOP_WRAP_S = 0.25;

/** Os degraus de quem apanha em seguida, em semitons: a pentatônica de fá, sem nunca passar da oitava. */
const PICK_SCALE = [0, 2, 4, 7, 9, 12];

/**
 * OS LEITOS DE AMBIENTE. Eram um vento so; agora sao tres, tocando juntos o tempo todo, e o jogo
 * so mexe no VOLUME de cada um (`setAmbienceMix`): passaros e brisa de dia, grilos e um sapo de
 * noite, e o marulho que cresce perto da agua. Misturar em vez de trocar e o que deixa o
 * amanhecer ACONTECER aos poucos, em vez de cortar de um arquivo para o outro.
 */
type AmbienceBed = 'day' | 'night' | 'water' | 'rain';
const AMBIENCE_FILES: Record<AmbienceBed, { file: string; seconds: number }> = {
  day: { file: 'ambience-day.mp3', seconds: 30 },
  night: { file: 'ambience-night.mp3', seconds: 24 },
  water: { file: 'ambience-water.mp3', seconds: 16 },
  rain: { file: 'ambience-rain.mp3', seconds: 16 },
};

/**
 * AS CAMADAS DO LUGAR. Vinte segundos sem pulso, só com a pentatônica de fá, que cabe em todas as peças
 * (todas ficam dentro de fá maior): gotas de celesta perto da água, cordas graves perto do fogo. Tocam o
 * tempo todo na aventura, também no silêncio entre as peças, e o lugar só mexe no volume. Saem a -27
 * LUFS; no máximo ficam 4 dB abaixo da música.
 */
type MusicLayer = 'water' | 'fire';
const LAYER_FILES: Record<MusicLayer, string> = { water: 'music-layer-water.mp3', fire: 'music-layer-fire.mp3' };
const LAYER_SECONDS = 20;
const LAYER_VOL = 10 ** ((-14 - -27) / 20);

const FOOTSTEP_KEYS: readonly SampleKey[] = ['footstep0', 'footstep1', 'footstep2', 'footstep3'];

/**
 * Fator de altura para um som SINTETIZADO que se repete — o equivalente do jitter que `playSample`
 * dá às amostras. ±4% (uns dois terços de semitom) é o bastante para o ouvido parar de reconhecer
 * a repetição e pouco o bastante para o som continuar sendo o mesmo som.
 */
const detune = (): number => 1 + (Math.random() * 2 - 1) * 0.04;

/** Os temporizadores do escopo global (no navegador, a própria janela): o som não precisa de `window`. */
const timers = globalThis as unknown as Pick<Window, 'setTimeout' | 'clearTimeout'>;

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
  /** Cada arquivo baixa uma vez só: o título e o menu tocam a mesma canção. */
  private readonly downloads = new Map<string, Promise<AudioBuffer>>();

  // Music: one bus (ducked for dialogs) with at most two overlapping tracks while
  // crossfading. `wantTrack` survives until its buffer finishes decoding.
  private musicBus: GainNode | null = null;
  private readonly musicBuffers = new Map<LoopKey, AudioBuffer>();
  private currentMusic: { key: LoopKey; source: AudioBufferSourceNode; gain: GainNode } | null = null;
  /** A aventura: a peça que toca agora (ou null no silêncio), o relógio da próxima e as últimas tocadas. */
  private valley: {
    timer: number | null;
    piece: { file: string; source: AudioBufferSourceNode; gain: GainNode } | null;
    recent: string[];
  } | null = null;
  private wantTrack: MusicKey | null = null;
  private wantFadeMs = 1600;

  // Os leitos de ambiente — loops com ganho proprio, FORA do barramento da musica, entao o vale
  // continua soando quando a musica baixa para um dialogo.
  private readonly ambienceBuffers = new Map<AmbienceBed, AudioBuffer>();
  private readonly ambienceBeds = new Map<AmbienceBed, { source: AudioBufferSourceNode; gain: GainNode }>();
  private ambienceMix: Record<AmbienceBed, number> = { day: 1, night: 0, water: 0, rain: 0 };
  private readonly layerBuffers = new Map<MusicLayer, AudioBuffer>();
  private readonly layers = new Map<MusicLayer, { source: AudioBufferSourceNode; gain: GainNode }>();
  private layerMix: Record<MusicLayer, number> = { water: 0, fire: 0 };
  private wantAmbience = false;

  private lastFootstep = -1;


  /**
   * O contexto de áudio, criado na primeira vez que alguém toca algo — ou `null` quando a plataforma não tem som
   * (ver platform.ts): aí o jogo segue mudo, e cada efeito simplesmente não toca.
   */
  private get audio(): AudioContext | null {
    if (!this.ctx) {
      const created = platform().createAudioContext();
      if (!created) return null;
      this.ctx = created;
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

  private fetchBuffer(file: string): Promise<AudioBuffer> {
    let download = this.downloads.get(file);
    if (!download) {
      const ctx = this.audio;
      if (!ctx) return Promise.reject(new Error('sem áudio'));
      download = platform().fetch(`${import.meta.env.BASE_URL}assets/audio/${file}`)
        .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(`HTTP ${res.status}`))))
        .then((data) => ctx.decodeAudioData(data));
      this.downloads.set(file, download);
    }
    return download;
  }

  /**
   * Baixa os efeitos, que são pequenos e precisam estar prontos. Música e ambiente só vêm quando
   * alguém pede (`startMusic`, `startAmbience`). Pode chamar quantas vezes quiser.
   */
  public preload(): void {
    if (this.loadStarted) return;
    if (!this.audio) return; // sem som (ver o getter): nada a baixar
    this.loadStarted = true;
    (Object.keys(SAMPLES) as SampleKey[]).forEach((key) => {
      this.fetchBuffer(SAMPLES[key].file)
        .then((buffer) => { this.buffers.set(key, this.withoutDecoderDelay(SAMPLES[key].file, buffer)); })
        .catch((err) => { console.warn(`[audio] could not load ${SAMPLES[key].file}:`, err); });
    });
  }

  /**
   * O MP3 abre com um silêncio pequeno, de tamanho que varia por navegador, e um efeito tem de soar
   * no instante do gesto. Em vez de confiar em cada decodificador, o silêncio do começo sai daqui.
   */
  private withoutDecoderDelay(file: string, buffer: AudioBuffer): AudioBuffer {
    if (!file.endsWith('.mp3')) return buffer;
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
    const limit = Math.min(buffer.length - 1, Math.round(MAX_DECODER_DELAY_S * buffer.sampleRate));
    let start = 0;
    while (start < limit && channels.every((data) => Math.abs(data[start]) < DECODER_SILENCE)) start += 1;
    if (start === 0) return buffer;
    const ctx = this.audio;
    if (!ctx) return buffer;
    const trimmed = ctx.createBuffer(buffer.numberOfChannels, buffer.length - start, buffer.sampleRate);
    channels.forEach((data, c) => trimmed.copyToChannel(data.subarray(start), c));
    return trimmed;
  }

  private loadTrack(key: LoopKey): void {
    if (!this.audio) return;
    this.fetchBuffer(TRACKS[key].file)
      .then((buffer) => {
        this.musicBuffers.set(key, buffer);
        if (this.wantTrack === key && this.currentMusic?.key !== key) {
          this.crossfadeTo(key, buffer, this.wantFadeMs);
        }
      })
      .catch((err) => { console.warn(`[audio] could not load ${TRACKS[key].file}:`, err); });
  }

  private loadAmbience(): void {
    if (!this.audio) return;
    (Object.keys(AMBIENCE_FILES) as AmbienceBed[]).forEach((bed) => {
      if (this.ambienceBuffers.has(bed)) return;
      this.fetchBuffer(AMBIENCE_FILES[bed].file)
        .then((buffer) => { this.ambienceBuffers.set(bed, buffer); if (this.wantAmbience) this.startAmbienceNow(); })
        .catch((err) => { console.warn(`[audio] could not load ${AMBIENCE_FILES[bed].file}:`, err); });
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
    if (key === 'overworld') {
      this.fadeOutLoop(fadeMs);
      if (this.valley) return;
      this.startValley(fadeMs);
      this.loadLayers();
      return;
    }
    this.stopValley(fadeMs);
    if (this.currentMusic?.key === key) return;
    const buffer = this.musicBuffers.get(key);
    if (buffer) this.crossfadeTo(key, buffer, fadeMs);
    else this.loadTrack(key);
  }

  /** A peça do vale tocando agora (null no silêncio entre elas). Leitura de playtest. */
  public get valleyPiece(): string | null {
    return this.valley?.piece?.file ?? null;
  }

  // ── a música da aventura: peças inteiras, silêncio entre elas ──────────────

  private startValley(fadeMs: number): void {
    const ctx = this.audio;
    if (!ctx) return;
    const bus = this.ensureMusicBus(ctx);
    if (!this.currentMusic) {
      // começo do zero (boot da cena): um abaixar de diálogo esquecido não pode calar o vale
      const now = ctx.currentTime;
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(MUSIC_VOL, now);
    }
    this.valley = { timer: null, piece: null, recent: [] };
    this.scheduleValley(fadeMs / 1000 + VALLEY_FIRST_DELAY_S);
  }

  private stopValley(fadeMs: number): void {
    const v = this.valley;
    if (!v) return;
    this.valley = null;
    if (v.timer !== null) timers.clearTimeout(v.timer);
    this.stopLayers();
    if (v.piece) this.fadeOut(v.piece.source, v.piece.gain, fadeMs);
  }

  private valleyTime(): ValleyTime {
    const n = this.ambienceMix.night;
    return n < 0.3 ? 'day' : n > 0.7 ? 'night' : 'dusk';
  }

  /** Uma peça da hora certa que não tenha tocado nas duas últimas vezes. */
  private pickValleyPiece(recent: readonly string[]): string {
    const time = this.valleyTime();
    const fits = VALLEY_PIECES.filter((p) => p.when.includes(time));
    const fresh = fits.filter((p) => !recent.includes(p.file));
    const pool = fresh.length ? fresh : fits;
    return pool[Math.floor(Math.random() * pool.length)].file;
  }

  /** Baixa e decodifica sem guardar no cache dos efeitos: a peça sai da memória quando acaba. */
  private decodeValley(file: string): Promise<AudioBuffer> {
    return platform().fetch(`${import.meta.env.BASE_URL}assets/audio/${file}`)
      .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => {
        // O decodificador desanexa o ArrayBuffer; a cópia é para a segunda tentativa, no contexto do
        // jogo (na taxa dele), se o navegador recusar decodificar fora dele ou nessa taxa.
        const spare = data.slice(0);
        return SoundManager.decodeIn(() => platform().createOfflineAudioContext(2, 1, VALLEY_DECODE_RATE), data)
          .catch(() => SoundManager.decodeIn(() => this.audio, spare));
      });
  }

  /** decodeAudioData nas duas formas que os navegadores já tiveram (promessa e callbacks). */
  private static decodeIn(make: () => BaseAudioContext | null, data: ArrayBuffer): Promise<AudioBuffer> {
    return new Promise((resolve, reject) => {
      try {
        const ctx = make();
        if (!ctx) throw new Error('sem áudio');
        const ret = ctx.decodeAudioData(data, resolve, reject);
        if (ret && typeof ret.then === 'function') ret.then(resolve, reject);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * A próxima peça daqui a `delayS`. Ela já começa a baixar agora; se na hora de tocar a hora do dia tiver
   * mudado (anoiteceu durante o silêncio), troca por uma que caiba.
   */
  private scheduleValley(delayS: number): void {
    const v = this.valley;
    if (!v) return;
    if (v.timer !== null) timers.clearTimeout(v.timer);
    const planned = this.pickValleyPiece(v.recent);
    const download = this.decodeValley(planned);
    download.catch(() => { /* tratado na hora de tocar */ });
    v.timer = timers.setTimeout(() => {
      v.timer = null;
      if (this.valley !== v) return;
      const stillFits = VALLEY_PIECES.find((p) => p.file === planned)?.when.includes(this.valleyTime());
      const file = stillFits ? planned : this.pickValleyPiece(v.recent);
      (file === planned ? download : this.decodeValley(file))
        .then((buffer) => { if (this.valley === v && !v.piece) this.playValley(v, file, buffer); })
        .catch((err) => {
          // sem rede (ou arquivo quebrado): o vale segue só com o ambiente e tenta de novo daqui a um minuto
          console.warn(`[audio] could not load ${file}:`, err);
          if (this.valley === v) this.scheduleValley(60);
        });
    }, Math.max(0, delayS) * 1000);
  }

  private playValley(v: NonNullable<SoundManager['valley']>, file: string, buffer: AudioBuffer): void {
    const ctx = this.audio;
    if (!ctx) return;
    const gain = ctx.createGain();
    gain.gain.value = VALLEY_VOL;
    gain.connect(this.ensureMusicBus(ctx));
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.onended = () => {
      gain.disconnect();
      if (this.valley !== v || v.piece?.source !== source) return;
      v.piece = null;
      const [min, max] = VALLEY_GAP_S;
      this.scheduleValley(min + Math.random() * (max - min));
    };
    source.start();
    v.piece = { file, source, gain };
    v.recent = [file, ...v.recent].slice(0, 2);
  }

  private loadLayers(): void {
    if (!this.audio) return;
    (Object.keys(LAYER_FILES) as MusicLayer[]).forEach((layer) => {
      if (this.layerBuffers.has(layer)) { this.startLayers(); return; }
      this.fetchBuffer(LAYER_FILES[layer])
        .then((buffer) => { this.layerBuffers.set(layer, buffer); this.startLayers(); })
        .catch((err) => { console.warn(`[audio] could not load ${LAYER_FILES[layer]}:`, err); });
    });
  }

  /** Só na aventura. Não têm pulso, então entram em qualquer ponto. */
  private startLayers(): void {
    if (!this.valley) return;
    const ctx = this.audio;
    if (!ctx) return;
    const bus = this.ensureMusicBus(ctx);
    for (const [layer, buffer] of this.layerBuffers) {
      if (this.layers.has(layer)) continue;
      const gain = ctx.createGain();
      gain.gain.value = LAYER_VOL * this.layerMix[layer];
      gain.connect(bus);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.loopStart = LOOP_WRAP_S;
      source.loopEnd = LOOP_WRAP_S + LAYER_SECONDS;
      source.connect(gain);
      source.start(0, LOOP_WRAP_S + Math.random() * LAYER_SECONDS);
      this.layers.set(layer, { source, gain });
    }
  }

  private stopLayers(): void {
    for (const { source, gain } of this.layers.values()) {
      source.stop();
      gain.disconnect();
    }
    this.layers.clear();
  }

  /** Quanto de cada camada o lugar pede agora (0..1). O ganho desliza sozinho. */
  public setMusicLayers(water: number, fire: number): void {
    this.layerMix = { water: clamp01(water), fire: clamp01(fire) };
    if (!this.ctx) return;
    for (const [layer, { gain }] of this.layers) {
      gain.gain.setTargetAtTime(LAYER_VOL * this.layerMix[layer], this.ctx.currentTime, 1.4);
    }
  }

  /**
   * Stop the current track. With `fadeMs > 0` the track rings out to silence (entrar numa
   * dungeon, sair para o menu); otherwise it stops instantly.
   * `currentMusic` is cleared immediately either way, so per-frame callers are idempotent.
   */
  public stopMusic(fadeMs = 0): void {
    this.wantTrack = null;
    this.stopLayers();
    this.stopValley(fadeMs);
    this.fadeOutLoop(fadeMs);
  }

  /** O loop do título/créditos sai (com `fadeMs` > 0, morrendo devagar). */
  private fadeOutLoop(fadeMs: number): void {
    const cur = this.currentMusic;
    if (!cur) return;
    this.currentMusic = null;
    this.fadeOut(cur.source, cur.gain, fadeMs);
  }

  private fadeOut(source: AudioBufferSourceNode, gain: GainNode, fadeMs: number): void {
    source.onended = null;
    if (fadeMs <= 0) {
      try { source.stop(); } catch { /* already stopped */ }
      return;
    }
    const ctx = this.audio;
    if (!ctx) return;
    const now = ctx.currentTime;
    const fadeS = Math.max(0.05, fadeMs / 1000);
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + fadeS);
    try { source.stop(now + fadeS + 0.1); } catch { /* already stopped */ }
  }

  private ensureMusicBus(ctx: AudioContext): GainNode {
    if (!this.musicBus) {
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = MUSIC_VOL;
      this.musicBus.connect(this.musicUserBus);
    }
    return this.musicBus;
  }

  private crossfadeTo(key: LoopKey, buffer: AudioBuffer, fadeMs: number): void {
    const ctx = this.audio;
    if (!ctx) return;
    const bus = this.ensureMusicBus(ctx);
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
    source.loopStart = LOOP_WRAP_S;
    source.loopEnd = LOOP_WRAP_S + TRACKS[key].seconds;
    source.connect(gain);
    source.start(0, LOOP_WRAP_S);
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
    try { localStore().setItem(VOL_MUSIC_KEY, String(this.musicVol)); } catch { /* storage unavailable */ }
    this.rampUserBus(this.musicUserBus, this.musicVol);
  }

  /** Set the player's sound-effects volume (0..1), persisted across sessions. */
  public setSfxVolume(vol: number): void {
    this.sfxVol = clamp01(vol);
    try { localStore().setItem(VOL_SFX_KEY, String(this.sfxVol)); } catch { /* storage unavailable */ }
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

  // ── o player do menu de pausa (ver Jukebox) ───────────────────────────────

  private listenBus: GainNode | null = null;

  /** Onde o player toca: no mesmo nível da música do jogo e debaixo do volume de música da pessoa. */
  /** `null` sem som (ver o getter `audio`). */
  public listeningOutput(): { ctx: AudioContext; out: AudioNode } | null {
    const ctx = this.audio;
    if (!ctx) return null;
    if (!this.listenBus) {
      this.listenBus = ctx.createGain();
      this.listenBus.gain.value = MUSIC_VOL;
      this.listenBus.connect(this.musicUserBus);
    }
    return { ctx, out: this.listenBus };
  }

  /**
   * Ouvindo no player, o vale se cala (a música do jogo e os leitos de ambiente), para a faixa escolhida
   * soar sozinha; ao sair, tudo volta devagar ao que o lugar pede.
   */
  public setListening(on: boolean): void {
    if (!this.ctx) return;
    this.rampMusicBus(on ? 0 : MUSIC_VOL, on ? 400 : 1200);
    const now = this.ctx.currentTime;
    for (const [bed, { gain }] of this.ambienceBeds) {
      gain.gain.setTargetAtTime(on ? 0 : AMBIENCE_VOL * this.ambienceMix[bed], now, on ? 0.12 : 0.6);
    }
  }

  private rampMusicBus(target: number, ms: number): void {
    if (!this.musicBus) return;
    const ctx = this.audio;
    if (!ctx) return;
    const now = ctx.currentTime;
    const gain = this.musicBus.gain;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(target, now + ms / 1000);
  }

  // ── ambience (wind) ────────────────────────────────────────────────────────

  public startAmbience(): void {
    this.wantAmbience = true;
    this.loadAmbience();
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
  public setAmbienceMix(night: number, water: number, rain = 0): void {
    this.ambienceMix = { day: 1 - clamp01(night), night: clamp01(night), water: clamp01(water), rain: clamp01(rain) };
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const [bed, { gain }] of this.ambienceBeds) {
      gain.gain.setTargetAtTime(AMBIENCE_VOL * this.ambienceMix[bed], now, 0.8);
    }
  }

  private startAmbienceNow(): void {
    if (!this.wantAmbience) return;
    const ctx = this.audio;
    if (!ctx) return;
    for (const [bed, buffer] of this.ambienceBuffers) {
      if (this.ambienceBeds.has(bed)) continue;
      const gain = ctx.createGain();
      gain.gain.value = AMBIENCE_VOL * this.ambienceMix[bed];
      gain.connect(this.musicUserBus);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const { seconds } = AMBIENCE_FILES[bed];
      src.loop = true;
      src.loopStart = LOOP_WRAP_S;
      src.loopEnd = LOOP_WRAP_S + seconds;
      // Os tres leitos tem comprimentos diferentes e comecam em pontos diferentes: nunca se
      // alinham, e o vale nao "repete" a cada trinta segundos.
      src.connect(gain);
      src.start(0, LOOP_WRAP_S + Math.random() * seconds);
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

  /** Uma sílaba da fala de um NPC (ver dialogs/voicePersonas). */
  public playDialogSyllable(syllable: SpokenSyllable): void {
    const ctx = this.audio; // ensures sfxUserBus exists
    if (!ctx) return;
    scheduleSyllable(ctx, this.sfxUserBus, ctx.currentTime, syllable);
  }

  public playRadioClick(closing: boolean): void {
    const ctx = this.audio; // ensures sfxUserBus exists
    if (!ctx) return;
    scheduleRadioClick(ctx, this.sfxUserBus, ctx.currentTime, closing);
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

  /** O pé no chão: a grama é a amostra de sempre, e o resto se faz aqui, porque um passo toca o tempo todo. */
  public playStep(surface: Surface): void {
    const d = 0.92 + Math.random() * 0.16;
    if (surface === 'grass') { this.playFootstep(); return; }
    if (surface === 'dirt') {
      this.noise('lowpass', 420 * d, 0.9, 0.2, 0.07);
    } else if (surface === 'stone') {
      this.noise('bandpass', 2100 * d, 2.2, 0.09, 0.022);
      this.noise('lowpass', 500 * d, 1, 0.14, 0.04);
    } else {
      this.osc('triangle', 210 * d, 130 * d, 0.13, 0.07);
      this.noise('bandpass', 1100 * d, 2.5, 0.05, 0.02);
    }
  }

  /** O corpo de cada material: é o que pegar e pousar têm em comum. */
  private materialKnock(material: Material, pitch: number, vol: number): void {
    switch (material) {
      case 'wood':
        this.osc('triangle', 330 * pitch, 190 * pitch, 0.16 * vol, 0.08);
        this.noise('bandpass', 1300 * pitch, 2.5, 0.05 * vol, 0.02);
        break;
      case 'stone':
        this.noise('bandpass', 1900 * pitch, 3, 0.13 * vol, 0.03);
        this.noise('lowpass', 600 * pitch, 1, 0.16 * vol, 0.06);
        break;
      case 'metal':
        this.osc('triangle', 980 * pitch, 960 * pitch, 0.07 * vol, 0.22);
        this.osc('sine', 2470 * pitch, 2450 * pitch, 0.03 * vol, 0.14);
        break;
      case 'glass':
        this.osc('sine', 2090 * pitch, 2080 * pitch, 0.07 * vol, 0.16);
        this.osc('sine', 3136 * pitch, 3130 * pitch, 0.03 * vol, 0.1);
        break;
      default:
        this.noise('lowpass', 700 * pitch, 0.8, 0.11 * vol, 0.07);
        this.osc('sine', 260 * pitch, 180 * pitch, 0.07 * vol, 0.07);
    }
  }

  /** Pegar sobe: cada coisa em seguida vai um degrau acima na pentatônica, e o ouvido percebe a série. */
  public playPick(material: Material, streak = 0): void {
    const step = PICK_SCALE[Math.min(streak, PICK_SCALE.length - 1)];
    const pitch = Math.pow(2, step / 12);
    this.materialKnock(material, pitch, 0.9);
    this.osc('sine', 660 * pitch, 880 * pitch, 0.045, 0.08, 0.02);
  }

  /** Pousar desce e pesa: é o mesmo material, mais grave, com o baque do chão embaixo. */
  public playPut(material: Material): void {
    this.materialKnock(material, 0.78, 1);
    this.noise('lowpass', 240, 1, 0.14, 0.07, 0.015);
  }

  /** A espada fincada, tocada: um anel longo que só ela tem. */
  public playSwordHum(): void {
    this.osc('sine', 880, 878, 0.05, 1.6);
    this.osc('sine', 1318, 1316, 0.028, 1.2, 0.02);
    this.osc('triangle', 220, 219, 0.04, 0.9);
  }

  /** A fogueira do fim pegando: o fogo de sempre, e por cima três notas que nenhuma outra fogueira tem. */
  public playHearthCatch(): void {
    this.playIgnite();
    [349.2, 523.3, 698.5].forEach((f, i) => this.osc('triangle', f, f, 0.07, 1.4, 0.25 + i * 0.28));
  }

  /** Cada achado tem o seu toque, e é o que faz ele parecer uma coisa de verdade antes de qualquer texto. */
  public playFindTouch(kind: string): void {
    switch (kind) {
      case 'helmet':
        this.osc('triangle', 520, 505, 0.1, 0.4);
        this.osc('sine', 1310, 1290, 0.03, 0.25);
        break;
      case 'bottle':
        this.materialKnock('glass', 1, 1.1);
        break;
      case 'door':
        [0, 0.2, 0.4].forEach((at) => {
          this.osc('triangle', 180, 120, 0.2, 0.08, at);
          this.noise('bandpass', 900, 2, 0.05, 0.02, at);
        });
        break;
      case 'sign':
        // A madeira velha e oca da placa: um toque surdo, e o musgo abafa o resto.
        this.materialKnock('wood', 0.7, 0.8);
        break;
      case 'chair':
        // A madeira da cadeira range sob o peso: um nó grave e um estalo curto.
        this.materialKnock('wood', 0.8, 0.9);
        this.osc('triangle', 210, 160, 0.05, 0.14, 0.06);
        break;
      default:
        this.materialKnock('wood', 0.9, 1);
    }
  }

  public playSwordSlash(): void {
    if (this.playSample('swordSlash', 0.7)) return;
    this.noise('lowpass', 900, 0.7, 0.26, 0.13);
    this.osc('sawtooth', 150, 45, 0.16, 0.12);
  }

  /** O chamado pelo rádio: dois bipes secos, subindo. */
  public playShipCall(): void {
    const d = detune();
    this.osc('square', 620 * d, 620 * d, 0.07, 0.03);
    this.osc('square', 830 * d, 830 * d, 0.16, 0.03);
  }

  /** A nave descendo: um sopro que vai ficando grave conforme freia. */
  public playShipDescend(): void {
    const d = detune();
    this.noise('lowpass', 420 * d, 0.7, 2.2, 0.07);
    this.osc('sine', 150 * d, 56 * d, 2.2, 0.05);
  }

  /** O pouso: o peso no chão. */
  public playShipLand(): void {
    const d = detune();
    this.noise('lowpass', 240 * d, 1, 0.42, 0.13);
    this.osc('sine', 92 * d, 38 * d, 0.34, 0.16);
  }

  /** A porta: um chiado de pressão e o trinco. */
  public playShipDoor(): void {
    const d = detune();
    this.noise('bandpass', 1500 * d, 1.1, 0.24, 0.035);
    this.osc('triangle', 240 * d, 170 * d, 0.09, 0.05);
  }

  /** A decolagem: o motor carrega subindo, e o estouro leva tudo embora. */
  public playShipLift(): void {
    const d = detune();
    this.noise('lowpass', 520 * d, 0.8, 3.1, 0.1);
    this.osc('sine', 48 * d, 210 * d, 3, 0.09);
  }

  /** O brinde: duas canecas de esmalte, um toque curto e sem brilho demais. */
  public playMugClink(): void {
    const d = detune();
    this.osc('triangle', 1180 * d, 1140 * d, 0.14, 0.05);
    this.osc('sine', 1760 * d, 1720 * d, 0.08, 0.025);
  }

  /** Um gole: líquido grave, subindo um pouco no fim da garganta. */
  public playMugSip(): void {
    const d = detune();
    this.noise('lowpass', 520 * d, 1.4, 0.14, 0.04);
    this.osc('sine', 190 * d, 290 * d, 0.11, 0.05);
  }

  /** A Morte chegando: um ar grave que desce e não tem pressa. */
  public playDeathArrive(): void {
    const d = detune();
    this.noise('lowpass', 380 * d, 0.9, 0.09, 1.7);
    this.osc('sine', 98 * d, 49 * d, 0.11, 1.9);
  }

  /** E indo embora: só o ar, sem o peso. */
  public playDeathLeave(): void {
    this.noise('lowpass', 300 * detune(), 1, 0.06, 1.2);
  }

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
  /** O tchau de longe (entities/NpcWave): dois assobios curtos, o segundo descendo — "oi!". */
  public playFarWave(): void {
    this.osc('sine', 880, 1180, 0.035, 0.14);
    this.osc('sine', 1180, 880, 0.035, 0.2, 0.18);
  }

  // ── A BOLSA DE COURO (runtime/BagStash): abrir, lançar, cair dentro, fechar o fecho ──
  public playBagOpen(): void {
    this.noise('bandpass', 1100, 1.6, 0.05, 0.14);          // o couro farfalhando
    this.osc('triangle', 240, 300, 0.04, 0.09, 0.02);       // a aba subindo
  }

  public playBagToss(): void {
    this.noise('bandpass', 1400, 2.2, 0.035, 0.22);         // o sopro do arco
    this.osc('sine', 520, 880, 0.03, 0.18, 0.02);           // subindo junto com ele
  }

  public playBagLand(): void {
    this.noise('lowpass', 380, 0.9, 0.11, 0.13);            // o baque surdo no fundo do couro
    this.osc('sine', 150, 95, 0.12, 0.16);                  // o peso assentando
    this.osc('triangle', 660, 620, 0.035, 0.06, 0.04);      // "guardou"
  }

  public playBagClasp(): void {
    this.noise('bandpass', 2600, 7, 0.06, 0.035);           // o estalo do fecho de latão
    this.osc('triangle', 1180, 1150, 0.045, 0.07, 0.02);
    this.osc('sine', 1760, 1740, 0.03, 0.18, 0.07);         // e um brilho curto, de coisa bem feita
  }

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

  /** A lâmina cortando o ar: sopro, sem pancada nenhuma. */
  public playAxeWhoosh(): void {
    this.noise('bandpass', 700, 0.9, 0.2, 0.17);
    this.noise('bandpass', 1500, 1.4, 0.07, 0.1, 0.03);
  }

  /** A lâmina entrando no tronco: o baque surdo da madeira, e o estalo seco da fibra. */
  public playAxeBite(): void {
    this.playWoodChop();
    this.osc('triangle', 210, 62, 0.34, 0.15);
    this.noise('lowpass', 1100, 1.2, 0.32, 0.07);
    this.noise('highpass', 2600, 1.0, 0.12, 0.03, 0.01);
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

  /** `blow` é qual pancada esta é: a peça vai endurecendo, e o som sobe junto. */
  public playHammer(blow = 0): void {
    // Nailing a plank home: a bright metallic tick over a short hollow-wood knock.
    if (this.playSample('hammer', 0.9 + Math.random() * 0.25, 1, 1 + blow * 0.09)) return;
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

  /**
   * O "plop" do sapo pulando na água (objects/nature/Frogs): a gota do título, mais grave e baixa — um corpo
   * pequeno entrando na água, não uma pedra.
   */
  public playFrogPlop(): void {
    if (this.playSample('dropWater', 1, 0.5, 0.72)) return;
    this.osc('sine', 520, 260, 0.14, 0.05);
  }

  /** O peixe voltando para a água (objects/nature/FishJumps): o splash, baixo e agudo, um peixe e não um balde. */
  public playFishSplash(): void {
    if (this.playSample('splash', 1, 0.32, 1.25)) return;
    this.noise('lowpass', 1400, 0.6, 0.12, 0.05);
  }

  /** O pé na poça (objects/nature/Puddles): o splash curto e agudo, quase um "chap". */
  public playPuddleSplash(): void {
    if (this.playSample('splash', 1.5, 0.28, 1.55)) return;
    this.noise('lowpass', 1800, 0.6, 0.09, 0.05);
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

  // ── os gestos do mundo ───────────────────────────────────────────────────
  // Cada som abaixo e o par sonoro de um gesto que ja esta na tela — nenhum deles existe para
  // "avisar" sozinho.

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
    for (const [freq, vol, at] of bands) this.noise('bandpass', freq, 0.9, vol, 1.3, at);
    this.noise('lowpass', 180, 0.7, 0.07, 3.2);
    this.osc('sine', 70, 52, 0.04, 3, 0.2);
  }

  // ── a chave do jardim alto ────────────────────────────────────────────────
  // A cena inteira da fechadura (GameScene.playGardenUnlock), em cinco sons curtos de metal: tirar a chave das
  // costas, enfiar no tambor, cada dente do giro, o trinco cedendo e o portão velho rangendo ao abrir.

  // ── a bigorna da Thea ─────────────────────────────────────────────────────────────────────
  // Uma bigorna de verdade TOCA: o golpe é um estalo curto de impacto e, por cima, as parciais inarmônicas do ferro
  // grosso (não um tom só, nem harmônicas certinhas), que somem em menos de um segundo. Por baixo, o baque do toco.

  /** Uma martelada na bigorna. A última toca mais cheia e mais longa. */
  public playAnvilStrike(last = false): void {
    const ring = last ? 1.1 : 0.7;
    this.noise('highpass', 2400, 0.8, 0.09, 0.03);
    this.noise('bandpass', 1300, 2, 0.07, 0.05);
    for (const [freq, vol] of [[905, 0.05], [1489, 0.04], [2210, 0.028], [3080, 0.018]] as const) {
      this.osc('sine', freq, freq * 0.998, vol, ring);
    }
    this.osc('sine', 150, 80, 0.09, 0.16);
    this.noise('lowpass', 260, 1, 0.08, 0.1);
  }

  /** Pegar o martelinho do toco: o cabo de madeira raspando e o ferro tocando de leve. */
  public playForgeHammerPickup(): void {
    this.noise('bandpass', 900, 3, 0.04, 0.06);
    this.osc('triangle', 1850, 1820, 0.015, 0.12, 0.04);
  }

  /** Devolver o martelinho: ele encosta no toco. */
  public playForgeHammerSetDown(): void {
    this.noise('lowpass', 500, 1, 0.07, 0.06);
    this.osc('triangle', 1600, 1580, 0.012, 0.1, 0.03);
  }

  /** A chave saindo das costas: um tilintar pequeno de metal. */
  public playKeyJingle(): void {
    this.osc('triangle', 2350, 2300, 0.022, 0.07);
    this.osc('triangle', 3050, 3000, 0.016, 0.06, 0.05);
    this.noise('bandpass', 4200, 6, 0.015, 0.05, 0.02);
  }

  /** A chave entrando no tambor: o raspar do metal nos pinos, e o encosto no fundo. */
  public playKeyInsert(): void {
    this.noise('bandpass', 2600, 3, 0.05, 0.2);
    this.noise('bandpass', 1700, 4, 0.03, 0.16, 0.04);
    this.osc('square', 820, 640, 0.02, 0.025, 0.21);
    this.noise('lowpass', 900, 1.2, 0.05, 0.04, 0.21);
  }

  /** Um dente do giro: o estalo seco de um pino caindo no lugar. */
  public playLockTick(): void {
    this.osc('square', 1250, 1050, 0.022, 0.018);
    this.noise('bandpass', 2800, 5, 0.04, 0.03);
  }

  /** O trinco cedendo: um baque grave de ferro pesado, com o eco curto da lingueta. */
  public playLockClunk(): void {
    this.noise('lowpass', 420, 1, 0.16, 0.12);
    this.osc('sine', 150, 82, 0.11, 0.2);
    this.osc('triangle', 690, 520, 0.035, 0.06, 0.01);
    this.noise('bandpass', 1500, 4, 0.03, 0.05, 0.09);
  }

  /** O portão velho abrindo: a dobradiça seca rangendo em duas puxadas, e a folha assentando no fim. */
  public playOldGateCreak(): void {
    this.osc('triangle', 185, 262, 0.05, 0.45);
    this.osc('triangle', 372, 520, 0.018, 0.45);
    this.noise('bandpass', 950, 7, 0.04, 0.45);
    this.osc('triangle', 262, 168, 0.045, 0.5, 0.42);
    this.osc('triangle', 520, 336, 0.015, 0.5, 0.42);
    this.noise('bandpass', 760, 7, 0.035, 0.5, 0.42);
    this.noise('lowpass', 320, 1, 0.09, 0.14, 0.95);
  }

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
    if (import.meta.env.DEV) (globalThis as unknown as { __sound?: SoundManager }).__sound = _instance;
  }
  return _instance;
};

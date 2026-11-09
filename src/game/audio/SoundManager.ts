

import { localStore, platform } from '@/game/platform/platform';
import { AmbiencePlayer, AMBIENCE_VOL, clamp01, type AmbienceBed } from './AmbiencePlayer';
import { WorkSounds, SAMPLES, type SampleKey } from './WorkSounds';
import { UiSounds } from './UiSounds';
import { NatureSounds } from './NatureSounds';
import { StorySounds } from './StorySounds';
import { MusicPlayer, MUSIC_VOL, TRACKS, type ValleyTime, VALLEY_PIECES, VALLEY_VOL } from './MusicPlayer';
import { Synth } from './Synth';
export type { MusicKey } from './MusicPlayer';

const MASTER_VOL = 0.32;

// Player-facing volume settings (pause menu sliders), persisted like zh.locale. They sit on
// dedicated user gain stages so they never fight the internal mix: the dialog duck still
// ramps the music bus, footstep jitter still scales per-sample — the user volume multiplies
// on top. The wind bed counts as "music" for the player (it IS the world's soundtrack).
const VOL_MUSIC_KEY = 'zh.musicVol';
const VOL_SFX_KEY = 'zh.sfxVol';

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

/** O atraso de um decodificador de MP3 não passa disto, e nenhum efeito começa em silêncio de propósito. */
const MAX_DECODER_DELAY_S = 0.06;
const DECODER_SILENCE = 0.001;

/**
 * Tudo o que dá para ouvir no player do menu de pausa (`Jukebox`), com o ganho com que cada faixa
 * toca no jogo: no player ela soa no mesmo nível em que se ouve no vale.
 */
export const LISTENING_TRACKS: readonly { file: string; vol: number; when: readonly (ValleyTime | 'title')[] }[] = [
  ...VALLEY_PIECES.map((p) => ({ file: p.file, vol: VALLEY_VOL, when: p.when })),
  { file: TRACKS.title.file, vol: TRACKS.title.vol, when: ['title'] },
];

export class SoundManager {
  public ctx: AudioContext | null = null;
  private master!: GainNode; // gain -> "SNES" lowpass -> compressor -> destination
  // User volume stages (pause-menu sliders): every SFX routes through sfxUserBus, the music
  // bus and the wind bed route through musicUserBus. Both feed the master chain.
  public sfxUserBus!: GainNode;
  public musicUserBus!: GainNode;
  private musicVol = loadVol(VOL_MUSIC_KEY);
  private sfxVol = loadVol(VOL_SFX_KEY);
  public readonly buffers = new Map<SampleKey, AudioBuffer>();
  private loadStarted = false;
  /** Cada arquivo baixa uma vez só: o título e o menu tocam a mesma canção. */
  private readonly downloads = new Map<string, Promise<AudioBuffer>>();

  // Music: one bus (ducked for dialogs) with at most two overlapping tracks while
  // crossfading. `wantTrack` survives until its buffer finishes decoding.
  public musicBus: GainNode | null = null;

  public readonly ambienceBeds = new Map<AmbienceBed, { source: AudioBufferSourceNode; gain: GainNode }>();
  public ambienceMix: Record<AmbienceBed, number> = { day: 1, night: 0, water: 0, rain: 0 };

  /**
   * O contexto de áudio, criado na primeira vez que alguém toca algo — ou `null` quando a plataforma não tem som
   * (ver platform.ts): aí o jogo segue mudo, e cada efeito simplesmente não toca.
   */
  public get audio(): AudioContext | null {
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

  public fetchBuffer(file: string): Promise<AudioBuffer> {
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

  // ── music ──────────────────────────────────────────────────────────────────

  // ── a música da aventura: peças inteiras, silêncio entre elas ──────────────

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

  // ── o player do menu de pausa (ver Jukebox) ───────────────────────────────

  private listenBus: GainNode | null = null;
  /** Os leitos de ambiente. (ver AmbiencePlayer) */
  public readonly ambience: AmbiencePlayer = new AmbiencePlayer(this);
  /** O som das mÃ£os e das ferramentas. (ver WorkSounds) */
  public readonly work: WorkSounds = new WorkSounds(this);
  /** O som das telas e do que vai na mÃ£o. (ver UiSounds) */
  public readonly ui: UiSounds = new UiSounds(this);
  /** O som do vale vivo. (ver NatureSounds) */
  public readonly nature: NatureSounds = new NatureSounds(this);
  /** O som das cenas. (ver StorySounds) */
  public readonly story: StorySounds = new StorySounds(this);
  /** A música: faixas, camadas e crossfade. (ver MusicPlayer) */
  public readonly music: MusicPlayer = new MusicPlayer(this);
  /** O oscilador, o ruído e a amostra. (ver Synth) */
  public readonly synth: Synth = new Synth(this);

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

  public rampMusicBus(target: number, ms: number): void {
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

  // ── sample playback ────────────────────────────────────────────────────────

  // ── low-level procedural helpers (fallbacks) ──────────────────────────────
  // Both helpers call this.audio first so this.master is guaranteed to exist
  // before it is used. Never pass this.master as an argument — it may be
  // undefined at call-site if the AudioContext hasn't been created yet.

  // ── public sound effects ─────────────────────────────────────────────────
  // Each plays its offline-rendered sample (with jitter where repetition hurts),
  // falling back to the procedural synth while samples are still decoding.

  // ── a caixa de ferramentas ───────────────────────────────────────────────
  // Os quatro sons contam UM arco: a tampa abre (agudo, curto), a forja bate (grave, repetida),
  // o produto salta (sobe e assenta) e a recusa e a mesma dobradica da abertura CORTADA por um
  // baque — exatamente o truque que o portao de bater usa pra distinguir "abriu" de "tentou".

  // ── os gestos do mundo ───────────────────────────────────────────────────
  // Cada som abaixo e o par sonoro de um gesto que ja esta na tela — nenhum deles existe para
  // "avisar" sozinho.

  // ── o portao de bater ────────────────────────────────────────────────────
  // Os dois sons sao o MESMO gesto com finais diferentes, e e isso que ensina a regra sem uma
  // linha de texto: a dobradica range igual nos dois, so que um termina em vao aberto e o
  // outro numa batida seca contra o que esta atras.

  // ── a chave do jardim alto ────────────────────────────────────────────────
  // A cena inteira da fechadura (GameScene.playGardenUnlock), em cinco sons curtos de metal: tirar a chave das
  // costas, enfiar no tambor, cada dente do giro, o trinco cedendo e o portão velho rangendo ao abrir.

  // ── a bigorna da Thea ─────────────────────────────────────────────────────────────────────
  // Uma bigorna de verdade TOCA: o golpe é um estalo curto de impacto e, por cima, as parciais inarmônicas do ferro
  // grosso (não um tom só, nem harmônicas certinhas), que somem em menos de um segundo. Por baixo, o baque do toco.

  // ── a flor da lua ────────────────────────────────────────────────────────
  // O par tem a mesma logica do portao de bater: um gesto, dois finais. Abrir SOBE e demora (uma
  // flor nao estala); fechar DESCE e acaba num tapa surdo de petala batendo em petala. Sao os dois
  // unicos sons vegetais do jogo, entao nenhum leva metal nem madeira: e ar e um sino.
  // Sintetizados, sem sample — cada um toca quando a escuridao muda, o que e raro.

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

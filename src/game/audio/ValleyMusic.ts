// A TRILHA DO VALE: uma peça inteira por hora do dia (e o silêncio entre elas), sorteada sem repetir a última, decodificada
// sob demanda e agendada para começar no compasso. Ver tools/gen-cozy-music.mjs.

import { platform } from '@/game/platform/platform';
import type { MusicPlayer } from './MusicPlayer';

export const MUSIC_VOL = 0.6; // music-bus duck level (under the SFX)
/**
 * As pecas saem masterizadas a -18 LUFS com o pico preso a ~10 dB acima do nivel (ataque nenhum
 * "bate" por cima da musica). No jogo elas soam como -10 LUFS: 1,5 dB acima da trilha antiga (-11,5),
 * porque o autor achou a musica baixa demais com os picos altos — agora que os picos cairam, o corpo
 * pode subir.
 */
export const MUSIC_GAIN = 10 ** ((-10 - -18) / 20);
/** Dia, entardecer e noite, lidos da mistura dos leitos de ambiente (`setAmbienceMix`). */
export type ValleyTime = 'day' | 'dusk' | 'night';
export const VALLEY_PIECES: readonly { file: string; when: readonly ValleyTime[] }[] = [
  { file: 'valley-morning.mp3', when: ['day'] }, // Morning Dew: fa maior, violao e piano
  { file: 'valley-waltz.mp3', when: ['day'] }, // Garden Waltz: valsa, clarinete
  { file: 'valley-clouds.mp3', when: ['day', 'dusk'] }, // Lazy Clouds: lidio, flauta longa
  { file: 'valley-golden.mp3', when: ['dusk', 'night'] }, // Golden Hour: eolio, clarinete grave
  { file: 'valley-fireflies.mp3', when: ['dusk', 'night'] }, // Fireflies: piano de feltro quase sozinho
  { file: 'valley-moon.mp3', when: ['night'] }, // Moon over the Lake: dorico, flauta e cordas
];
export const VALLEY_VOL = 0.8 * MUSIC_GAIN;
/** A primeira peca entra pouco depois do jogo; entre as outras, so o vale (passaros, grilos, agua). */
const VALLEY_FIRST_DELAY_S = 3;
const VALLEY_GAP_S = [35, 75] as const;
/**
 * Uma peca de tres minutos e meio decodificada a 48 kHz ocupa uns 80 MB. A trilha nao tem nada acima de
 * 9 kHz, entao decodificar a 32 kHz nao perde nada que se ouca e cabe num celular. So a peca que toca
 * (e a proxima, enquanto baixa) fica na memoria.
 */
const VALLEY_DECODE_RATE = 32000;
/** Os temporizadores do escopo global (no navegador, a própria janela): o som não precisa de `window`. */
const timers = globalThis as unknown as Pick<Window, 'setTimeout' | 'clearTimeout'>;
/** decodeAudioData nas duas formas que os navegadores já tiveram (promessa e callbacks). */
const decodeIn = (make: () => BaseAudioContext | null, data: ArrayBuffer): Promise<AudioBuffer> => new Promise((resolve, reject) => {
  try {
    const ctx = make();
    if (!ctx) throw new Error('sem áudio');
    const ret = ctx.decodeAudioData(data, resolve, reject);
    if (ret && typeof ret.then === 'function') ret.then(resolve, reject);
  } catch (err) {
    reject(err);
  }
});

/** O que ValleyMusic usa de MusicPlayer. */
export type ValleyMusicHost = Pick<MusicPlayer,
  'currentMusic' | 'ensureMusicBus' | 'fadeOut' | 'host' | 'stopLayers' | 'valley'
>;

export class ValleyMusic {
  public constructor(private readonly host: ValleyMusicHost) {}

  /** A peça do vale tocando agora (null no silêncio entre elas). Leitura de playtest. */
  public get valleyPiece(): string | null {
    return this.host.valley?.piece?.file ?? null;
  }

  public startValley(fadeMs: number): void {
    const ctx = this.host.host.audio;
    if (!ctx) return;
    const bus = this.host.ensureMusicBus(ctx);
    if (!this.host.currentMusic) {
      // começo do zero (boot da cena): um abaixar de diálogo esquecido não pode calar o vale
      const now = ctx.currentTime;
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(MUSIC_VOL, now);
    }
    this.host.valley = { timer: null, piece: null, recent: [] };
    this.scheduleValley(fadeMs / 1000 + VALLEY_FIRST_DELAY_S);
  }

  public stopValley(fadeMs: number): void {
    const v = this.host.valley;
    if (!v) return;
    this.host.valley = null;
    if (v.timer !== null) timers.clearTimeout(v.timer);
    this.host.stopLayers();
    if (v.piece) this.host.fadeOut(v.piece.source, v.piece.gain, fadeMs);
  }

  private valleyTime(): ValleyTime {
    const n = this.host.host.ambienceMix.night;
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
        return decodeIn(() => platform().createOfflineAudioContext(2, 1, VALLEY_DECODE_RATE), data)
          .catch(() => decodeIn(() => this.host.host.audio, spare));
      });
  }

  /**
   * A próxima peça daqui a `delayS`. Ela já começa a baixar agora; se na hora de tocar a hora do dia tiver
   * mudado (anoiteceu durante o silêncio), troca por uma que caiba.
   */
  private scheduleValley(delayS: number): void {
    const v = this.host.valley;
    if (!v) return;
    if (v.timer !== null) timers.clearTimeout(v.timer);
    const planned = this.pickValleyPiece(v.recent);
    const download = this.decodeValley(planned);
    download.catch(() => { /* tratado na hora de tocar */ });
    v.timer = timers.setTimeout(() => {
      v.timer = null;
      if (this.host.valley !== v) return;
      const stillFits = VALLEY_PIECES.find((p) => p.file === planned)?.when.includes(this.valleyTime());
      const file = stillFits ? planned : this.pickValleyPiece(v.recent);
      (file === planned ? download : this.decodeValley(file))
        .then((buffer) => { if (this.host.valley === v && !v.piece) this.playValley(v, file, buffer); })
        .catch((err) => {
          // sem rede (ou arquivo quebrado): o vale segue só com o ambiente e tenta de novo daqui a um minuto
          console.warn(`[audio] could not load ${file}:`, err);
          if (this.host.valley === v) this.scheduleValley(60);
        });
    }, Math.max(0, delayS) * 1000);
  }

  private playValley(v: NonNullable<MusicPlayer['valley']>, file: string, buffer: AudioBuffer): void {
    const ctx = this.host.host.audio;
    if (!ctx) return;
    const gain = ctx.createGain();
    gain.gain.value = VALLEY_VOL;
    gain.connect(this.host.ensureMusicBus(ctx));
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.onended = () => {
      gain.disconnect();
      if (this.host.valley !== v || v.piece?.source !== source) return;
      v.piece = null;
      const [min, max] = VALLEY_GAP_S;
      this.scheduleValley(min + Math.random() * (max - min));
    };
    source.start();
    v.piece = { file, source, gain };
    v.recent = [file, ...v.recent].slice(0, 2);
  }
}

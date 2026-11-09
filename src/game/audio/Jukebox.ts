import { getSoundManager, LISTENING_TRACKS } from '@/game/audio/SoundManager';

// O PLAYER DAS MÚSICAS DO JOGO (menu de pausa → Músicas). Um <audio> só, reaproveitado de faixa em
// faixa: ele baixa aos poucos (streaming), procura qualquer ponto na hora e não segura uma peça inteira
// decodificada na memória. O som passa pelo Web Audio (createMediaElementSource), então obedece ao
// volume de música da pessoa e sai no mesmo nível em que a faixa toca no vale. Usar um elemento só
// também é o que deixa o iPhone trocar de faixa sozinho: ele só libera o play de um elemento que já
// tocou por um toque.

export type RepeatMode = 'all' | 'one' | 'off';

/** Os nomes e a hora de cada faixa, nas chaves de texto do menu. A ordem é a do dia. */
// `seconds` é só para a lista mostrar a duração antes de a faixa carregar (o player usa a do arquivo).
const META: Record<string, { title: string; when: string; seconds: number }> = {
  'valley-morning.mp3': { title: 'pause.trackMorning', when: 'pause.whenDay', seconds: 155 },
  'valley-waltz.mp3': { title: 'pause.trackWaltz', when: 'pause.whenDay', seconds: 112 },
  'valley-clouds.mp3': { title: 'pause.trackClouds', when: 'pause.whenDay', seconds: 169 },
  'valley-golden.mp3': { title: 'pause.trackGolden', when: 'pause.whenDusk', seconds: 179 },
  'valley-fireflies.mp3': { title: 'pause.trackFireflies', when: 'pause.whenNight', seconds: 203 },
  'valley-moon.mp3': { title: 'pause.trackMoon', when: 'pause.whenNight', seconds: 204 },
  'music-lullaby.mp3': { title: 'pause.trackLullaby', when: 'pause.whenTitle', seconds: 77 },
};

export interface JukeboxTrack { file: string; vol: number; title: string; when: string; seconds: number }

export const JUKEBOX_TRACKS: readonly JukeboxTrack[] = LISTENING_TRACKS.map((track) => {
  const meta = META[track.file];
  if (!meta) throw new Error(`[jukebox] faixa sem nome: ${track.file}`);
  return { file: track.file, vol: track.vol, ...meta };
});

const MAX_VOLUME_GAIN = 4;

class Jukebox {
  public index = -1;
  public repeat: RepeatMode = 'all';
  public shuffle = false;
  private el: HTMLAudioElement | null = null;
  private gain: GainNode | null = null;
  private readonly listeners = new Set<() => void>();
  private listening = false;

  public get playing(): boolean { return Boolean(this.el && !this.el.paused && !this.el.ended); }
  public get time(): number { return this.el?.currentTime ?? 0; }
  public get duration(): number { const d = this.el?.duration; return d && Number.isFinite(d) ? d : 0; }
  public get track(): JukeboxTrack | null { return JUKEBOX_TRACKS[this.index] ?? null; }

  /** Quem desenha o player ouve aqui (tempo, faixa, play/pausa). Devolve o "parar de ouvir". */
  public subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void { this.listeners.forEach((fn) => fn()); }

  private element(): HTMLAudioElement {
    if (this.el) return this.el;
    const el = document.createElement('audio');
    el.preload = 'auto';
    el.addEventListener('timeupdate', () => this.emit());
    el.addEventListener('durationchange', () => this.emit());
    el.addEventListener('play', () => this.emit());
    el.addEventListener('pause', () => this.emit());
    el.addEventListener('ended', () => this.onEnded());
    el.addEventListener('error', () => { console.warn('[jukebox] não tocou', el.src); this.emit(); });
    try {
      const output = getSoundManager().listeningOutput();
      if (!output) throw new Error('sem áudio');
      const { ctx, out } = output;
      this.gain = ctx.createGain();
      ctx.createMediaElementSource(el).connect(this.gain);
      this.gain.connect(out);
    } catch {
      // sem Web Audio para o elemento: ele toca direto, no volume do próprio elemento
      this.gain = null;
    }
    this.el = el;
    return el;
  }

  private applyVolume(): void {
    const track = this.track;
    if (!track || !this.el) return;
    if (this.gain) this.gain.gain.value = track.vol;
    else this.el.volume = Math.min(1, (track.vol / MAX_VOLUME_GAIN) * getSoundManager().getMusicVolume());
  }

  /** Toca a faixa `index` desde o começo (ou retoma, se já for ela e estiver em pausa). */
  public play(index = this.index < 0 ? 0 : this.index): void {
    const el = this.element();
    if (index !== this.index || !el.src) {
      this.index = (index + JUKEBOX_TRACKS.length) % JUKEBOX_TRACKS.length;
      el.src = `${import.meta.env.BASE_URL}assets/audio/${JUKEBOX_TRACKS[this.index].file}`;
    }
    this.applyVolume();
    this.listen(true);
    void el.play().catch((err) => { console.warn('[jukebox] play recusado:', err); this.emit(); });
    this.emit();
  }

  public pause(): void {
    this.el?.pause();
    this.emit();
  }

  public toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  /** Próxima faixa: no aleatório, qualquer outra; senão a seguinte, voltando ao começo da lista. */
  public next(): void {
    this.play(this.nextIndex());
  }

  /** Com mais de 3 s tocados, volta ao começo da faixa; senão vai para a anterior (como todo player). */
  public prev(): void {
    if (this.time > 3) { this.seek(0); if (!this.playing) this.play(); return; }
    this.play(this.index <= 0 ? JUKEBOX_TRACKS.length - 1 : this.index - 1);
  }

  public seek(seconds: number): void {
    if (!this.el || !this.duration) return;
    this.el.currentTime = Math.max(0, Math.min(this.duration - 0.05, seconds));
    this.emit();
  }

  public setRepeat(mode: RepeatMode): void { this.repeat = mode; this.emit(); }
  public setShuffle(on: boolean): void { this.shuffle = on; this.emit(); }

  private nextIndex(): number {
    const n = JUKEBOX_TRACKS.length;
    if (this.shuffle && n > 1) {
      let i = this.index;
      while (i === this.index) i = Math.floor(Math.random() * n);
      return i;
    }
    return (this.index + 1) % n;
  }

  private onEnded(): void {
    if (this.repeat === 'one') { this.seek(0); this.play(); return; }
    const last = !this.shuffle && this.index === JUKEBOX_TRACKS.length - 1;
    if (this.repeat === 'off' && last) { this.emit(); return; }
    this.next();
  }

  /** Volume de música da pessoa mudou: o elemento sem Web Audio precisa ser avisado. */
  public refreshVolume(): void { this.applyVolume(); }

  /** Saiu do menu: o player para e o vale volta. A faixa escolhida fica lembrada para a próxima vez. */
  public stop(): void {
    this.el?.pause();
    this.listen(false);
    this.emit();
  }

  private listen(on: boolean): void {
    if (this.listening === on) return;
    this.listening = on;
    getSoundManager().setListening(on);
  }
}

let instance: Jukebox | null = null;
export const getJukebox = (): Jukebox => {
  if (!instance) {
    instance = new Jukebox();
    if (import.meta.env.DEV) (window as unknown as { __jukebox?: Jukebox }).__jukebox = instance;
  }
  return instance;
};

/** 125 → "2:05". */
export const formatTime = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

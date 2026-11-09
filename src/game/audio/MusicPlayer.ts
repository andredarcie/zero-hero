// A MÚSICA: a faixa pedida (menu, vale, fim), o crossfade entre faixas, as camadas que entram perto da água e do fogo,
// e o fade de quando a cena pede silêncio. As peças do vale por hora do dia são da ValleyMusic; o volume, do SoundManager.

import { clamp01, LOOP_WRAP_S } from './AmbiencePlayer';
import type { SoundManager } from './SoundManager';
import { ValleyMusic, MUSIC_VOL, MUSIC_GAIN } from './ValleyMusic';
export { MUSIC_VOL, VALLEY_PIECES, VALLEY_VOL } from './ValleyMusic';
export type { ValleyTime } from './ValleyMusic';

// A MUSICA E DO VALE, E SO DELE (tudo de tools/gen-cozy-music.mjs). 'title' e 'menu' sao a cancao de
// ninar do titulo e dos creditos, um loop sem emenda. 'overworld' NAO e um loop: sao seis pecas
// inteiras, de quase dois a tres minutos e meio, escolhidas pela hora do dia, com um silencio so de
// ambiente entre uma e outra (ver VALLEY_PIECES). Loop curto e o que cansa numa trilha calma.
export type MusicKey = 'title' | 'overworld' | 'menu';
type LoopKey = Exclude<MusicKey, 'overworld'>;
const LULLABY_SECONDS = 3386880 / 44100;
export const TRACKS: Record<LoopKey, { file: string; vol: number; seconds: number }> = {
  title: { file: 'music-lullaby.mp3', vol: 0.7 * MUSIC_GAIN, seconds: LULLABY_SECONDS },
  menu: { file: 'music-lullaby.mp3', vol: 0.7 * MUSIC_GAIN, seconds: LULLABY_SECONDS },
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

/** O que MusicPlayer usa de SoundManager. */
export type MusicPlayerHost = Pick<SoundManager,
  'ambienceMix' | 'audio' | 'ctx' | 'fetchBuffer' | 'musicBus' | 'musicUserBus' | 'rampMusicBus'
>;

export class MusicPlayer {
  private readonly musicBuffers = new Map<LoopKey, AudioBuffer>();
  public currentMusic: { key: LoopKey; source: AudioBufferSourceNode; gain: GainNode } | null = null;
  /** A aventura: a peça que toca agora (ou null no silêncio), o relógio da próxima e as últimas tocadas. */
  public valley: {
    timer: number | null;
    piece: { file: string; source: AudioBufferSourceNode; gain: GainNode } | null;
    recent: string[];
  } | null = null;
  private wantTrack: MusicKey | null = null;
  private wantFadeMs = 1600;
  private readonly layerBuffers = new Map<MusicLayer, AudioBuffer>();
  private readonly layers = new Map<MusicLayer, { source: AudioBufferSourceNode; gain: GainNode }>();
  private layerMix: Record<MusicLayer, number> = { water: 0, fire: 0 };
  /** As peças do vale por hora do dia. (ver ValleyMusic) */
  public readonly valleyMusic: ValleyMusic = new ValleyMusic(this);

  public constructor(public readonly host: MusicPlayerHost) {}

  private loadTrack(key: LoopKey): void {
    if (!this.host.audio) return;
    this.host.fetchBuffer(TRACKS[key].file)
      .then((buffer) => {
        this.musicBuffers.set(key, buffer);
        if (this.wantTrack === key && this.currentMusic?.key !== key) {
          this.crossfadeTo(key, buffer, this.wantFadeMs);
        }
      })
      .catch((err) => { console.warn(`[audio] could not load ${TRACKS[key].file}:`, err); });
  }

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
      this.valleyMusic.startValley(fadeMs);
      this.loadLayers();
      return;
    }
    this.valleyMusic.stopValley(fadeMs);
    if (this.currentMusic?.key === key) return;
    const buffer = this.musicBuffers.get(key);
    if (buffer) this.crossfadeTo(key, buffer, fadeMs);
    else this.loadTrack(key);
  }

  private loadLayers(): void {
    if (!this.host.audio) return;
    (Object.keys(LAYER_FILES) as MusicLayer[]).forEach((layer) => {
      if (this.layerBuffers.has(layer)) { this.startLayers(); return; }
      this.host.fetchBuffer(LAYER_FILES[layer])
        .then((buffer) => { this.layerBuffers.set(layer, buffer); this.startLayers(); })
        .catch((err) => { console.warn(`[audio] could not load ${LAYER_FILES[layer]}:`, err); });
    });
  }

  /** Só na aventura. Não têm pulso, então entram em qualquer ponto. */
  private startLayers(): void {
    if (!this.valley) return;
    const ctx = this.host.audio;
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

  public stopLayers(): void {
    for (const { source, gain } of this.layers.values()) {
      source.stop();
      gain.disconnect();
    }
    this.layers.clear();
  }

  /** Quanto de cada camada o lugar pede agora (0..1). O ganho desliza sozinho. */
  public setMusicLayers(water: number, fire: number): void {
    this.layerMix = { water: clamp01(water), fire: clamp01(fire) };
    if (!this.host.ctx) return;
    for (const [layer, { gain }] of this.layers) {
      gain.gain.setTargetAtTime(LAYER_VOL * this.layerMix[layer], this.host.ctx.currentTime, 1.4);
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
    this.valleyMusic.stopValley(fadeMs);
    this.fadeOutLoop(fadeMs);
  }

  /** O loop do título/créditos sai (com `fadeMs` > 0, morrendo devagar). */
  private fadeOutLoop(fadeMs: number): void {
    const cur = this.currentMusic;
    if (!cur) return;
    this.currentMusic = null;
    this.fadeOut(cur.source, cur.gain, fadeMs);
  }

  public fadeOut(source: AudioBufferSourceNode, gain: GainNode, fadeMs: number): void {
    source.onended = null;
    if (fadeMs <= 0) {
      try { source.stop(); } catch { /* already stopped */ }
      return;
    }
    const ctx = this.host.audio;
    if (!ctx) return;
    const now = ctx.currentTime;
    const fadeS = Math.max(0.05, fadeMs / 1000);
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + fadeS);
    try { source.stop(now + fadeS + 0.1); } catch { /* already stopped */ }
  }

  public ensureMusicBus(ctx: AudioContext): GainNode {
    if (!this.host.musicBus) {
      this.host.musicBus = ctx.createGain();
      this.host.musicBus.gain.value = MUSIC_VOL;
      this.host.musicBus.connect(this.host.musicUserBus);
    }
    return this.host.musicBus;
  }

  private crossfadeTo(key: LoopKey, buffer: AudioBuffer, fadeMs: number): void {
    const ctx = this.host.audio;
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

  /** Duck the music down to silence (e.g. while an NPC is talking / item-get plays). */
  public fadeMusicOut(ms = 450): void { this.host.rampMusicBus(0, ms); }

  /** Bring the music back up to full. */
  public fadeMusicIn(ms = 800): void { this.host.rampMusicBus(MUSIC_VOL, ms); }
}

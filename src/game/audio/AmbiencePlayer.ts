// OS LEITOS DE AMBIENTE: a noite, a água e a chuva, cada um um laço que sobe e desce com o lugar e a hora (setAmbienceMix).

import type { SoundManager } from './SoundManager';

export const AMBIENCE_VOL = 0.42; // os leitos do vale (passaros, grilos, agua) — sempre por baixo
export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
/**
 * Cada loop comprimido traz a própria cauda antes e o próprio começo depois (tools/encode-audio.mjs):
 * o atraso do decodificador de MP3 cai nessa sobra, e o que toca é só o miolo, sem estalo na emenda.
 */
export const LOOP_WRAP_S = 0.25;
/** Com o vale todo calado (`setHush(1)`), os leitos ficam nesta fração do volume: mais longe, nunca mudos. */
const HUSHED = 0.45;
/**
 * OS LEITOS DE AMBIENTE. Eram um vento so; agora sao tres, tocando juntos o tempo todo, e o jogo
 * so mexe no VOLUME de cada um (`setAmbienceMix`): passaros e brisa de dia, grilos e um sapo de
 * noite, e o marulho que cresce perto da agua. Misturar em vez de trocar e o que deixa o
 * amanhecer ACONTECER aos poucos, em vez de cortar de um arquivo para o outro.
 */
export type AmbienceBed = 'day' | 'night' | 'water' | 'rain';
const AMBIENCE_FILES: Record<AmbienceBed, { file: string; seconds: number }> = {
  day: { file: 'ambience-day.mp3', seconds: 30 },
  night: { file: 'ambience-night.mp3', seconds: 24 },
  water: { file: 'ambience-water.mp3', seconds: 16 },
  rain: { file: 'ambience-rain.mp3', seconds: 16 },
};

/** O que AmbiencePlayer usa de SoundManager. */
export type AmbiencePlayerHost = Pick<SoundManager,
  'ambienceBeds' | 'ambienceMix' | 'audio' | 'ctx' | 'fetchBuffer' | 'musicUserBus'
>;

export class AmbiencePlayer {
  // Os leitos de ambiente — loops com ganho proprio, FORA do barramento da musica, entao o vale
  // continua soando quando a musica baixa para um dialogo.
  private readonly ambienceBuffers = new Map<AmbienceBed, AudioBuffer>();
  private wantAmbience = false;
  /** O quanto o vale se cala agora (0..1; ver setHush). */
  private hush = 0;

  public constructor(private readonly host: AmbiencePlayerHost) {}

  private loadAmbience(): void {
    if (!this.host.audio) return;
    (Object.keys(AMBIENCE_FILES) as AmbienceBed[]).forEach((bed) => {
      if (this.ambienceBuffers.has(bed)) return;
      this.host.fetchBuffer(AMBIENCE_FILES[bed].file)
        .then((buffer) => { this.ambienceBuffers.set(bed, buffer); if (this.wantAmbience) this.startAmbienceNow(); })
        .catch((err) => { console.warn(`[audio] could not load ${AMBIENCE_FILES[bed].file}:`, err); });
    });
  }

  public startAmbience(): void {
    this.wantAmbience = true;
    this.loadAmbience();
    this.startAmbienceNow();
  }

  public stopAmbience(): void {
    this.wantAmbience = false;
    for (const { source } of this.host.ambienceBeds.values()) {
      try { source.stop(); } catch { /* already stopped */ }
    }
    this.host.ambienceBeds.clear();
  }

  /**
   * Quanto de cada leito o mundo pede agora (0..1): `night` cruza dia e noite, `water` e a
   * proximidade da agua. Os ganhos deslizam (setTargetAtTime), entao chamar a cada frame e barato
   * e nunca estala.
   */
  public setAmbienceMix(night: number, water: number, rain = 0): void {
    this.host.ambienceMix = { day: 1 - clamp01(night), night: clamp01(night), water: clamp01(water), rain: clamp01(rain) };
    this.applyMix(0.8);
  }

  /**
   * O VALE SE CALA (0..1): a meditação funda afasta os pássaros, a brisa e a água, sem calar (com 1, ficam em
   * HUSHED do volume). Desliza devagar, e o mix do lugar continua valendo por baixo.
   */
  public setHush(level: number): void {
    const next = clamp01(level);
    if (next === this.hush) return;
    this.hush = next;
    this.applyMix(1.6);
  }

  private volumeOf(bed: AmbienceBed): number {
    return AMBIENCE_VOL * this.host.ambienceMix[bed] * (1 - (1 - HUSHED) * this.hush);
  }

  private applyMix(glideS: number): void {
    if (!this.host.ctx) return;
    const now = this.host.ctx.currentTime;
    for (const [bed, { gain }] of this.host.ambienceBeds) gain.gain.setTargetAtTime(this.volumeOf(bed), now, glideS);
  }

  private startAmbienceNow(): void {
    if (!this.wantAmbience) return;
    const ctx = this.host.audio;
    if (!ctx) return;
    for (const [bed, buffer] of this.ambienceBuffers) {
      if (this.host.ambienceBeds.has(bed)) continue;
      const gain = ctx.createGain();
      gain.gain.value = this.volumeOf(bed);
      gain.connect(this.host.musicUserBus);
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
      this.host.ambienceBeds.set(bed, { source: src, gain });
    }
  }
}

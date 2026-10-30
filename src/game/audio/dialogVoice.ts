import type { SpokenSyllable, VowelSound } from '@/game/dialogs/voicePersonas';

// Duas ressonâncias por vogal é o que faz um bipe parecer boca: é a diferença entre "a" e "i".
const FORMANTS: Record<VowelSound, [number, number]> = {
  a: [800, 1250],
  e: [500, 1850],
  i: [320, 2250],
  o: [520, 950],
  u: [340, 800],
};

const FORMANT_Q = 5;
const DRY = 0.3;
// A segunda formante é a que sobrevive no alto-falante de celular, que quase não toca grave.
const F2_LEVEL = 0.85;

/** Agenda uma sílaba: fonte → duas formantes (mais um pouco do som seco, que segura a altura). */
export const scheduleSyllable = (
  ctx: BaseAudioContext,
  out: AudioNode,
  when: number,
  syllable: SpokenSyllable,
): void => {
  const { freq, vowel, plosive, persona } = syllable;
  const end = when + persona.length;
  const source = ctx.createOscillator();
  const envelope = ctx.createGain();
  source.type = persona.wave;

  // A consoante é o começo da nota: a explosiva entra de cima e depressa, o resto entra macio.
  const settle = when + Math.min(0.018, persona.length * 0.3);
  source.frequency.setValueAtTime(freq * (plosive ? 1.14 : 1.03), when);
  source.frequency.exponentialRampToValueAtTime(freq, settle);
  if (persona.glide !== 0) source.frequency.exponentialRampToValueAtTime(freq * 2 ** (persona.glide / 12), end);

  const sources: OscillatorNode[] = [source];
  if (persona.vibrato > 0) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = persona.vibratoHz;
    depth.gain.value = freq * (2 ** (persona.vibrato / 12) - 1);
    lfo.connect(depth);
    depth.connect(source.frequency);
    sources.push(lfo);
  }

  const [f1, f2] = FORMANTS[vowel];
  for (const [center, level] of [[f1, 1], [f2, F2_LEVEL]] as const) {
    const band = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    band.type = 'bandpass';
    band.frequency.value = center * persona.body;
    band.Q.value = persona.radio ? FORMANT_Q * 2 : FORMANT_Q;
    gain.gain.value = level;
    source.connect(band);
    band.connect(gain);
    gain.connect(envelope);
  }
  const dry = ctx.createGain();
  dry.gain.value = DRY;
  source.connect(dry);
  dry.connect(envelope);

  const peak = persona.gain * (plosive ? 1 : 0.88);
  envelope.gain.setValueAtTime(0.0001, when);
  envelope.gain.exponentialRampToValueAtTime(peak, when + (plosive ? 0.004 : 0.012));
  envelope.gain.setValueAtTime(peak, when + persona.length * 0.45);
  envelope.gain.exponentialRampToValueAtTime(0.0001, end);
  envelope.connect(out);

  for (const node of sources) {
    node.start(when);
    node.stop(end + 0.02);
  }
  source.onended = (): void => envelope.disconnect();
};

/** O clique de abrir e fechar o canal de rádio. */
export const scheduleRadioClick = (ctx: BaseAudioContext, out: AudioNode, when: number, closing: boolean): void => {
  const source = ctx.createOscillator();
  const envelope = ctx.createGain();
  const pitch = closing ? 1320 : 1760;
  source.type = 'triangle';
  source.frequency.setValueAtTime(pitch, when);
  source.frequency.exponentialRampToValueAtTime(pitch * 0.8, when + 0.035);
  envelope.gain.setValueAtTime(0.0001, when);
  envelope.gain.exponentialRampToValueAtTime(0.12, when + 0.003);
  envelope.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
  source.connect(envelope);
  envelope.connect(out);
  source.start(when);
  source.stop(when + 0.05);
  source.onended = (): void => envelope.disconnect();
};

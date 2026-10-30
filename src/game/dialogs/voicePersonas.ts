import { NPC_VISUALS } from '@/game/constants';
import type { DialogScript } from '@/game/dialogs/NpcDialogs';

// A VOZ DE CADA UM: o NPC "fala" uma língua inventada, sílaba a sílaba, enquanto o texto aparece.
// A altura mora no world.json (`voice.freq`, editável); aqui mora o JEITO de falar — ritmo, pausa,
// melodia e tremor —, e é ele que diz quem fala de olhos fechados. A língua é determinística: a mesma
// frase soa sempre igual, como uma fala de verdade.

export type VowelSound = 'a' | 'e' | 'i' | 'o' | 'u';

export type VoicePersona = {
  /** Milissegundos por letra: a pressa de quem fala. */
  charMs: number;
  /** A espera depois de vírgula e depois de fim de frase. */
  commaMs: number;
  stopMs: number;
  wave: OscillatorType;
  /** Duração de cada sílaba em segundos: curta é seca, longa é ligada. */
  length: number;
  /** Medido por voz: forma de onda e formantes mudam o quanto passa, e o pico tem de ficar igual. */
  gain: number;
  /** Multiplica as formantes: abaixo de 1 é corpo grande, acima é corpo pequeno. */
  body: number;
  /** Quantos semitons as letras abrem entre si. Zero é monocórdio. */
  spread: number;
  /** Quantos semitons a voz ondula, sílaba a sílaba. É o que faz cantar. */
  sway: number;
  /** Quantos semitons a voz cai ao longo da frase. */
  fall: number;
  /** Quantos semitons cada sílaba escorrega do começo ao fim. */
  glide: number;
  vibratoHz: number;
  /** Profundidade do vibrato em semitons. */
  vibrato: number;
  /** Rádio: faixa estreita e um clique de abrir e fechar o canal em cada fala. */
  radio?: boolean;
};

const BASE: VoicePersona = {
  charMs: 36, commaMs: 90, stopMs: 170, wave: 'triangle', length: 0.08, gain: 0.15, body: 1,
  spread: 4, sway: 0, fall: 2, glide: 0, vibratoHz: 0, vibrato: 0,
};

const PERSONAS: Record<string, VoicePersona> = {
  // O mago: velho e solene. Devagar, grave, frases que assentam.
  wizard: { ...BASE, gain: 0.18, charMs: 48, commaMs: 170, stopMs: 340, wave: 'sawtooth', length: 0.14, body: 0.82, spread: 2.5, fall: 4, vibratoHz: 4, vibrato: 0.2 },
  // Hollis, a micóloga: precisa e medida. Sílaba seca, passo regular, para no ponto para pensar.
  radiationSuit: { ...BASE, gain: 0.12, charMs: 34, commaMs: 110, stopMs: 280, length: 0.055, spread: 2, fall: 1 },
  // Iris, a pintora: sonhadora. Aguda e ligada, a voz passeia como uma melodia.
  painter: { ...BASE, gain: 0.22, charMs: 40, commaMs: 120, stopMs: 240, length: 0.13, body: 1.2, spread: 7, sway: 3, fall: 1 },
  // Bram, com frio e sem lenha: "minhas mãos tremem". Devagar, cansado, a voz treme.
  businessMan: { ...BASE, gain: 0.19, charMs: 54, commaMs: 200, stopMs: 330, wave: 'sawtooth', length: 0.12, body: 0.9, spread: 2, fall: 5, glide: -1, vibratoHz: 9, vibrato: 0.9 },
  // Vega, a astronauta: fala pelo rádio. Curto, seco, com o clique do canal.
  astronaut: { ...BASE, gain: 0.12, charMs: 30, commaMs: 70, stopMs: 150, wave: 'square', length: 0.05, body: 1.1, spread: 3, fall: 0, radio: true },
  // O gato: com preguiça. Cada sílaba é um miado que escorrega para baixo.
  blackCat: { ...BASE, gain: 0.14, charMs: 50, commaMs: 160, stopMs: 300, length: 0.15, body: 1.3, spread: 3, fall: 1, glide: -5 },
  // O vendedor: não respira. Rápido, sobe em vez de cair, quase não pausa.
  salesman: { ...BASE, gain: 0.12, charMs: 21, commaMs: 30, stopMs: 70, length: 0.05, body: 1.05, spread: 5, fall: -2, glide: 1 },
  // O poeta: declama. Sobe e desce com regularidade, como quem conta a métrica.
  poet: { ...BASE, gain: 0.28, charMs: 44, commaMs: 200, stopMs: 360, length: 0.13, spread: 1.5, sway: 5, fall: 1 },
  // O mímico finge ser normal: nota única, metrônomo perfeito, nenhuma inflexão. É o que incomoda.
  mimic: { ...BASE, gain: 0.095, charMs: 36, commaMs: 36, stopMs: 36, wave: 'square', length: 0.07, spread: 0, fall: 0 },
  // A morte: fora de serviço e sem pressa. Muito grave, longa, sem subir nunca.
  death: { ...BASE, gain: 0.2, charMs: 58, commaMs: 240, stopMs: 460, wave: 'sawtooth', length: 0.2, body: 0.7, spread: 1, fall: 3, glide: -1 },
};

/** Quem fala, a partir do retrato: é ele que acompanha o NPC em todas as falas e pedidos. */
export const personaFor = (script: Pick<DialogScript, 'npcAssetKey' | 'npcFrame'>): VoicePersona => {
  const kind = Object.keys(NPC_VISUALS).find((id) => {
    const visual = NPC_VISUALS[id];
    return visual.key === script.npcAssetKey && visual.frame === script.npcFrame;
  });
  return (kind && PERSONAS[kind]) || BASE;
};

export type SpokenSyllable = {
  /** Altura em Hz, já com a melodia da frase. */
  freq: number;
  vowel: VowelSound;
  /** Consoante explosiva (p, t, k...) no começo da sílaba: o ataque é seco. */
  plosive: boolean;
  persona: VoicePersona;
};

export type SpokenChar = { delayMs: number; syllable?: SpokenSyllable };

const PENTATONIC = [0, 2, 4, 7, 9];
const VOWELS = 'aeiou';
const PLOSIVES = 'pbtdkgcq';
const STOPS = '.!?…';
const VOWEL_CYCLE: VowelSound[] = ['a', 'e', 'o', 'i', 'u'];

// "ã" vira "a", "é" vira "e": a língua inventada só precisa saber a vogal.
const plain = (char: string): string => char.normalize('NFD').charAt(0).toLowerCase();
const isVowel = (char: string): boolean => char !== '' && VOWELS.includes(char);
const isLetter = (char: string): boolean => /[a-z]/u.test(char);
const isStop = (char: string): boolean => char !== '' && STOPS.includes(char);

/**
 * A partitura de uma fala: quanto cada letra espera e quais delas soltam sílaba. Soa a sílaba, não
 * a letra — o começo de cada grupo de vogais, levando a consoante que veio antes —, porque um bipe
 * por letra vira metralhadora. A entonação vem da pontuação: a pergunta sobe e o ponto desce.
 */
export const planSpeech = (text: string, persona: VoicePersona, baseFreq: number): SpokenChar[] => {
  const chars = [...text].map(plain);
  const plan: SpokenChar[] = chars.map(() => ({ delayMs: persona.charMs }));
  const onsets: number[] = [];

  chars.forEach((char, i) => {
    const prev = chars[i - 1] ?? ' ';
    const next = chars[i + 1] ?? ' ';
    // Letra solta sem vogal ("Z", "X") e número também falam.
    const lone = isLetter(char) && !isVowel(char) && !isLetter(prev) && !isLetter(next);
    if ((isVowel(char) && !isVowel(prev)) || lone || /\d/u.test(char)) onsets.push(i);
    if (i === chars.length - 1) return;
    if (',;:'.includes(char)) plan[i].delayMs += persona.commaMs;
    if (isStop(char) && !isStop(next)) plan[i].delayMs += persona.stopMs;
  });

  // Agrupa as sílabas em frases: é a posição na frase que dá a queda e a inflexão final.
  const sentences: number[][] = [[]];
  onsets.forEach((onset, order) => {
    sentences[sentences.length - 1].push(order);
    const until = onsets[order + 1] ?? chars.length;
    if (chars.slice(onset, until).some(isStop)) sentences.push([]);
  });

  for (const sentence of sentences) {
    sentence.forEach((order, position) => {
      const i = onsets[order];
      const char = chars[i];
      const prev = chars[i - 1] ?? ' ';
      const code = Math.max(0, char.charCodeAt(0) - 97);
      const degree = PENTATONIC[(code * 7 + prev.charCodeAt(0)) % PENTATONIC.length];
      const progress = sentence.length > 1 ? position / (sentence.length - 1) : 1;

      let semis = (degree / 9 - 0.5) * persona.spread;
      semis += Math.sin(order * Math.PI / 2) * persona.sway;
      semis -= progress * persona.fall;
      if (position === sentence.length - 1 && persona.spread > 0) {
        const lastOnset = onsets[order];
        const stop = chars.slice(lastOnset).find(isStop);
        semis += stop === '?' ? 5 : stop === '!' ? 2 : -1.5;
      }

      plan[i].syllable = {
        freq: baseFreq * 2 ** (semis / 12),
        vowel: isVowel(char) ? char as VowelSound : VOWEL_CYCLE[code % VOWEL_CYCLE.length],
        plosive: PLOSIVES.includes(prev),
        persona,
      };
    });
  }
  return plan;
};

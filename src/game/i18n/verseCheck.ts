import { rhyme, scan } from './metrica';

/**
 * A FORMA DE UMA CAIXA DE FALA, conferida (a regra é o `_verso` de dialogos/pt-br.json; o padrão de escrita está em
 * docs/escrita-em-verso.md). É a mesma conta do src/game/i18n/versos.test.ts, numa caixa só, para o editor de falas
 * (editor/DialogEditor) mostrar enquanto se escreve: as sílabas de cada verso, os versos que rimam (e as palavras da
 * rima), e se a caixa é uma quadra (o 2º com o 4º rimando) ou um dístico (os dois rimando). Os avisos são para quem
 * ESCREVE: dizem o que fazer, em português de gente. A rima é pela GRAFIA; o timbre (é aberto, ê fechado) fica com o
 * ouvido.
 */

export interface VerseRule {
  metro: { min: number; max: number };
  estrofe: number;
  rimam: number[];
}

/** "[narrador] " / "[narrator] " no começo da caixa: a narração. */
export const NARRATOR_TAG = /^\[(narrador|narrator)\] /u;
/** O {n} vira número no jogo: de 1 a 4, e "quatro" tem uma sílaba a mais que "um", "dois" e "três". */
const NUMBERS = ['dois', 'quatro'];

export const versesOf = (box: string): string[] => box.replace(NARRATOR_TAG, '').split('\n');

export interface VerseScan {
  /** As sílabas poéticas: "7", ou "6–8" quando a fusão das vogais deixa ler de mais de um jeito. */
  syllables: string;
  ok: boolean;
}

/** Dois versos que têm de rimar: as posições (de 0), as palavras da rima, e se rimam. */
export interface RhymePair {
  rows: [number, number];
  words: [string, string];
  ok: boolean;
}

export interface BoxCheck {
  verses: VerseScan[];
  rhymes: RhymePair[];
  problems: string[];
}

const scanVerse = (verse: string, rule: VerseRule): VerseScan => {
  const said = verse.includes('{n}') ? NUMBERS.map((n) => verse.replace('{n}', n)) : [verse];
  let lo = Infinity;
  let hi = 0;
  let ok = true;
  for (const s of said) {
    const { min, max } = scan(s);
    lo = Math.min(lo, min);
    hi = Math.max(hi, max);
    if (max < rule.metro.min || min > rule.metro.max) ok = false;
  }
  return { syllables: lo === hi ? String(lo) : `${lo}–${hi}`, ok };
};

const ordinal = (n: number): string => `${n}º`;

/** A caixa inteira: o metro de cada verso, e a estrofe (quadra ou dístico) com a sua rima. */
export const checkBox = (box: string, rule: VerseRule): BoxCheck => {
  const verses = versesOf(box);
  const scans = verses.map((v) => scanVerse(v, rule));
  const problems: string[] = [];
  scans.forEach((s, i) => {
    if (!s.ok) problems.push(`O ${ordinal(i + 1)} verso tem ${s.syllables} sílabas; o ritmo do jogo é de ${rule.metro.min} a ${rule.metro.max}.`);
  });
  const rhymes: RhymePair[] = [];
  const pair = (a: number, b: number): void => {
    const [x, y] = [rhyme(verses[a]), rhyme(verses[b])];
    const ok = x.key === y.key && x.word !== y.word;
    rhymes.push({ rows: [a, b], words: [x.word, y.word], ok });
    if (x.key !== y.key) problems.push(`"${x.word}" e "${y.word}" não rimam (o ${ordinal(a + 1)} e o ${ordinal(b + 1)} verso precisam rimar).`);
    else if (x.word === y.word) problems.push(`"${x.word}" rima com ela mesma: troque uma das duas palavras.`);
  };
  if (verses.length === rule.estrofe) {
    const [first, ...rest] = rule.rimam.map((n) => n - 1);
    for (const other of rest) pair(first, other);
  } else if (verses.length === 2) {
    pair(0, 1);
  } else {
    problems.push(`Esta caixa tem ${verses.length} ${verses.length === 1 ? 'verso' : 'versos'}: use ${rule.estrofe} (quadra) ou 2 (dístico).`);
  }
  return { verses: scans, rhymes, problems };
};

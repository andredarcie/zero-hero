// A MÉTRICA DO VERSO EM PORTUGUÊS (pedido do autor: as falas em poema rimado, a começar pela Morte). As duas medidas
// da versificação de sempre:
//  · as SÍLABAS POÉTICAS, contadas até a última tônica do verso. A fala junta vogais vizinhas — a sinalefa entre
//    palavras ("desde_o começo"), a sinérese dentro de uma ("amaldi-çoa-ria") — e separa o ditongo depois da tônica
//    ("gló-ri-a"), e quem escolhe é o poeta. Por isso a conta é uma FAIXA: o verso mede N se N cabe nela;
//  · a RIMA: o som da última palavra tônica a partir da vogal tônica ("conh-EÇO" / "com-EÇO").
// É conta pela grafia, não ouvido: pega o verso que sobra ou falta e a rima que não fecha. O timbre (é aberto, ê
// fechado) e a ênfase ficam com quem lê em voz alta.

export type Scansion = { min: number; max: number };
export type Rhyme = { key: string; word: string };

const VOWELS = 'aeiouáéíóúâêôãõàü';
const ACCENTED = 'áéíóúâêô';
const NASAL = 'ãõ';
const WEAK = 'iu';
/** As palavras sem acento próprio: encostam na vizinha e nunca fecham o verso. */
const ATONIC = new Set([
  'o', 'a', 'os', 'as', 'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na', 'nos', 'nas', 'num', 'numa', 'por',
  'pelo', 'pela', 'pelos', 'pelas', 'pra', 'pro', 'pras', 'pros', 'para', 'com', 'e', 'ou', 'que', 'se', 'me', 'te',
  'lhe', 'lhes', 'mas', 'nem', 'à', 'às', 'ao', 'aos',
]);

type Span = [number, number];
type Word = {
  text: string;
  /** Os núcleos (as vogais que fazem sílaba), já com o ditongo crescente depois da tônica junto. */
  spans: Span[];
  /** O núcleo tônico; -1 na palavra átona. */
  stress: number;
  /** k: os núcleos k e k+1 (um hiato fora da tônica) podem virar uma sílaba. */
  sinereses: number[];
  /** k: o núcleo k (ditongo crescente depois da tônica) pode virar duas. */
  diereses: number[];
  startsWithVowel: boolean;
  endsWithVowel: boolean;
};

const isVowel = (c: string): boolean => c !== '' && VOWELS.includes(c);

/** "qu"/"gu" antes de vogal: o "u" não faz sílaba ("que", "guerra") ou se cola na vogal ("igual", "quando"). */
const vowelAt = (w: string, i: number): boolean =>
  isVowel(w.charAt(i)) && !(w.charAt(i) === 'u' && 'qg'.includes(w.charAt(i - 1) || ' ') && isVowel(w.charAt(i + 1)));

/** O "i"/"u" que, mesmo colado numa vogal, faz sílaba sozinho: "ra-i-nha", "a-in-da", "sa-ir", "ju-iz". */
const weakStandsAlone = (w: string, j: number): boolean => {
  const after = w.slice(j + 1);
  if (after.startsWith('nh')) return true;
  if ('mn'.includes(after.charAt(0) || ' ') && !isVowel(after.charAt(1))) return true;
  return after.length === 1 && 'rlz'.includes(after);
};

const nucleiOf = (w: string): Span[] => {
  if (w === 'ao' || w === 'aos') return [[0, 1]];
  const out: Span[] = [];
  let i = 0;
  while (i < w.length) {
    if (!vowelAt(w, i)) { i += 1; continue; }
    const c = w.charAt(i);
    const next = w.charAt(i + 1);
    let end = i;
    // Ditongo nasal (ão, ãe, õe) e decrescente (ai, ei, oi, au, eu, ou, ui, iu): uma sílaba.
    if (NASAL.includes(c) && next !== '' && 'oei'.includes(next)) end = i + 1;
    else if (vowelAt(w, i + 1) && WEAK.includes(next) && !weakStandsAlone(w, i + 1)) end = i + 1;
    out.push([i, end]);
    i = end + 1;
  }
  return out.length ? out : [[0, 0]];
};

/** O acento pela grafia; a palavra átona fica sem (-1), a não ser que `asWord` (a última do verso, sempre tônica). */
const stressOf = (w: string, spans: Span[], asWord = false): number => {
  if (ATONIC.has(w) && !asWord) return -1;
  const marked = (set: string): number => spans.findIndex(([a, b]) => [...w.slice(a, b + 1)].some((c) => set.includes(c)));
  const acute = marked(ACCENTED);
  if (acute >= 0) return acute;
  const tilde = marked(NASAL);
  if (tilde >= 0) return tilde;
  if (spans.length < 2) return spans.length - 1;
  return /(a|e|o|as|es|os|am|em|ens)$/u.test(w) ? spans.length - 2 : spans.length - 1;
};

const parse = (text: string): Word => {
  const raw = nucleiOf(text);
  const stress = stressOf(text, raw);
  // Depois da tônica, "i"/"u" colado na vogal seguinte é ditongo crescente: "gló-ria", "sé-rie".
  const spans: Span[] = [];
  const diereses: number[] = [];
  for (let k = 0; k < raw.length; k += 1) {
    const [a, b] = raw[k];
    const next = raw[k + 1];
    if (stress >= 0 && k > stress && next && a === b && WEAK.includes(text.charAt(a)) && next[0] === b + 1) {
      diereses.push(spans.length);
      spans.push([a, next[1]]);
      k += 1;
    } else {
      spans.push([a, b]);
    }
  }
  // Sinérese: o hiato vira uma sílaba quando nenhuma das duas vogais é a tônica, ou quando uma delas é "i"/"u"
  // sem acento, que a fala faz de semivogal mesmo encostado na tônica ("cri-ar" → "criar", "du-as" → "duas").
  const glide = ([a, b]: Span): boolean => a === b && WEAK.includes(text.charAt(a));
  const sinereses: number[] = [];
  for (let k = 0; k + 1 < spans.length; k += 1) {
    const touching = spans[k][1] + 1 === spans[k + 1][0];
    const freeOfStress = k !== stress && k + 1 !== stress;
    if (touching && (freeOfStress || glide(spans[k]) || glide(spans[k + 1]))) sinereses.push(k);
  }
  return {
    text,
    spans,
    stress,
    sinereses,
    diereses,
    startsWithVowel: isVowel(text.charAt(0)) || (text.charAt(0) === 'h' && isVowel(text.charAt(1))),
    endsWithVowel: isVowel(text.charAt(text.length - 1)),
  };
};

const wordsOf = (verse: string): Word[] => verse.toLowerCase().normalize('NFC')
  .split(/[\s\-–—]+/u)
  .map((token) => token.replace(/[^\p{L}]/gu, ''))
  .filter(Boolean)
  .map(parse);

/**
 * A última palavra do verso e o núcleo onde a conta para. Ela é sempre tônica: "para", "que" e "se" no fim do verso
 * são o verbo, o pronome que fecha a frase, a conjunção que o verso de baixo completa ("e não para", "o porquê").
 */
const lastStress = (words: Word[]): { last: number; cut: number } => {
  const last = words.length - 1;
  const end = words[last];
  return { last, cut: end.stress >= 0 ? end.stress : stressOf(end.text, end.spans, true) };
};

/** As sílabas poéticas do verso: de nenhuma fusão de vogal (max, com os ditongos abertos) a todas (min). */
export const scan = (verse: string): Scansion => {
  const words = wordsOf(verse);
  if (!words.length) return { min: 0, max: 0 };
  const { last, cut } = lastStress(words);
  let raw = 0;
  let fuse = 0;
  let split = 0;
  for (let i = 0; i <= last; i += 1) {
    const word = words[i];
    const isEnd = i === last;
    raw += isEnd ? cut + 1 : word.spans.length;
    fuse += word.sinereses.filter((k) => !isEnd || k + 1 <= cut).length;
    split += word.diereses.filter((k) => !isEnd || k <= cut).length;
    // Sinalefa: a vogal do fim encosta na do começo da seguinte — menos quando as duas são tônicas ("você é").
    const prev = words[i - 1];
    const stressedJoint = prev && prev.stress === prev.spans.length - 1 && word.stress === 0;
    if (prev && prev.endsWithVowel && word.startsWithVowel && !stressedJoint) fuse += 1;
  }
  return { min: raw - fuse, max: raw + split };
};

const PLAIN: Record<string, string> = { á: 'a', à: 'a', â: 'a', é: 'e', ê: 'e', í: 'i', ó: 'o', ô: 'o', ú: 'u', ü: 'u' };
const NASALIZED: Record<string, string> = { a: 'ã', e: 'ẽ', i: 'ĩ', o: 'õ', u: 'ũ' };

/** O som de um pedaço de palavra pela grafia: "eço" e "essa" viram "eso"/"esa", "ão" e "am" no fim viram "ãu". */
const sound = (letters: string): string => [...letters].map((c) => PLAIN[c] ?? c).join('')
  .replace(/ch/gu, 'x').replace(/lh/gu, 'L').replace(/nh/gu, 'N')
  .replace(/qu(?=[ei])/gu, 'k').replace(/gu(?=[ei])/gu, 'g').replace(/q/gu, 'k')
  .replace(/sc(?=[ei])/gu, 'S').replace(/ss/gu, 'S').replace(/ç/gu, 'S').replace(/c(?=[ei])/gu, 'S').replace(/c/gu, 'k')
  .replace(/g(?=[ei])/gu, 'j').replace(/h/gu, '')
  .replace(/(?<=[aeiouãõ])s(?=[aeiouãõ])/gu, 'z').replace(/S/gu, 's')
  .replace(/z$/u, 's').replace(/rr/gu, 'R')
  .replace(/ão$/u, 'ãu').replace(/am$/u, 'ãu').replace(/em$/u, 'ẽi').replace(/ens$/u, 'ẽis')
  .replace(/([aeiou])[mn](?![aeiouãõ])/gu, (_, v: string) => NASALIZED[v] ?? v);

/** A rima do verso: o som da última palavra tônica, da vogal tônica até o fim, e a palavra (rima idêntica não vale). */
export const rhyme = (verse: string): Rhyme => {
  const words = wordsOf(verse);
  if (!words.length) return { key: '', word: '' };
  const { last, cut } = lastStress(words);
  const word = words[last];
  return { key: sound(word.text.slice(word.spans[cut][0])), word: word.text };
};

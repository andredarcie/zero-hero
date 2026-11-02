// AS ESTAÇÕES E O TEMPO QUE FAZ. São contas sobre o dia do relógio, sem estado próprio: o mesmo dia dá
// sempre a mesma estação e a mesma chuva, e quem volta a uma partida reencontra o céu que deixou.

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type Weather = 'clear' | 'rain' | 'snow';

const SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];
/** Um dia leva onze minutos: duas estações cabem numa sentada, e o ano inteiro em menos de duas horas. */
const DAYS_PER_SEASON = 2;

export const seasonOf = (day: number): Season => SEASONS[Math.floor(day / DAYS_PER_SEASON) % SEASONS.length];

const CHANCE: Readonly<Record<Season, number>> = { spring: 0.5, summer: 0.2, autumn: 0.5, winter: 0.65 };
/** Quanto do mostrador uma chuva dura: umas duas horas e meia do dia, nunca o dia inteiro. */
const SPELL = 0.1;

const hash = (n: number): number => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export const weatherAt = (day: number, phase: number): Weather => {
  // O primeiro dia é limpo: é o dia de conhecer o vale.
  if (day === 0) return 'clear';
  const season = seasonOf(day);
  if (hash(day) > CHANCE[season]) return 'clear';
  const start = 0.3 + hash(day + 0.5) * 0.35;
  if (phase < start || phase > start + SPELL) return 'clear';
  return season === 'winter' ? 'snow' : 'rain';
};

export interface SeasonGrade { r: number; g: number; b: number; saturation: number }

/** A primavera é o quadro de sempre (o neutro): as outras três só se medem contra ela. */
export const SEASON_GRADE: Readonly<Record<Season, SeasonGrade>> = {
  spring: { r: 1, g: 1, b: 1, saturation: 1 },
  summer: { r: 1.03, g: 1.01, b: 0.93, saturation: 1.04 },
  autumn: { r: 1.13, g: 0.93, b: 0.7, saturation: 1.05 },
  winter: { r: 0.94, g: 1, b: 1.2, saturation: 0.55 },
};

/** O céu fechado tira um pouco de luz de qualquer estação. */
export const OVERCAST = 0.86;

/** As folhas que caem: pétalas na primavera, o verde no verão, o fogo no outono. No inverno, nenhuma. */
export const SEASON_LEAVES: Readonly<Record<Season, readonly number[]>> = {
  spring: [0xf0b8c8, 0xe89ab2, 0xf6d4dc, 0xb7cf72],
  summer: [0x9cc46a, 0xb7cf72, 0x86b45c, 0xd8c25a],
  autumn: [0xd08a44, 0xc8602e, 0xd8a83c, 0xa84a2a],
  winter: [],
};

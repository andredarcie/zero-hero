// The world's clock deliberately lives outside World3D: a scene restart must not turn noon
// back into midnight.
//
// O DIA E LONGO E A NOITE E CURTA. O relogio corria igual nas duas metades (dois minutos cada), e
// num jogo cozy metade do tempo no escuro e metade do tempo sem ver o vale. Agora o dia (06h-18h)
// leva DAY_MS e a noite (18h-06h) leva NIGHT_MS — a mesma metade do mostrador, andada em
// velocidades diferentes. A noite continua existindo inteira (os grilos, os vaga-lumes, a abertura
// e o fim), so passa mais depressa.
const DAY_MS = 8 * 60 * 1000;
const NIGHT_MS = 3 * 60 * 1000;

let time = 0; // 0 = midnight, .25 = sunrise, .5 = noon, .75 = sunset
let initialized = false;

/** Seed only the first renderer of a run; scene restarts keep the same sun position. */
export const initializeTimeOfDay = (initial: number): void => {
  if (initialized) return;
  initialized = true;
  setTimeOfDay(initial);
};

export const getTimeOfDay = (): number => time;

/** Night runs from sunset (18:00) through sunrise (06:00). */
export const isNightTime = (): boolean => time < 0.25 || time >= 0.75;

export const setTimeOfDay = (value: number): void => {
  time = ((value % 1) + 1) % 1;
};

/**
 * O DESCANSO acelera o relogio (sentar numa fogueira e ver o ceu andar): 1 = normal. E estado de
 * modulo como o proprio relogio, e quem o liga e responsavel por devolve-lo a 1.
 */
let restScale = 1;
export const setTimeScale = (scale: number): void => { restScale = Math.max(0, scale); };

export const advanceTimeOfDay = (ms: number): void => {
  // Meio mostrador (0.5) por DAY_MS de dia e por NIGHT_MS de noite.
  const half = isNightTime() ? NIGHT_MS : DAY_MS;
  setTimeOfDay(time + (Math.max(0, ms) * restScale * 0.5) / half);
};

export const timeOfDayLabel = (): string => {
  const minutes = Math.floor(time * 24 * 60);
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
};

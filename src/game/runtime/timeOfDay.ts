// The world's clock deliberately lives outside World3D: a scene restart must not turn noon
// back into midnight.
//
// O DIA E LONGO E A NOITE E CURTA. O relogio corria igual nas duas metades (dois minutos cada), e
// num jogo cozy metade do tempo no escuro e metade do tempo sem ver o vale. Agora o dia (06h-18h)
// leva DAY_MS e a noite (18h-06h) leva NIGHT_MS — a mesma metade do mostrador, andada em
// velocidades diferentes. A noite continua existindo inteira (os grilos, os vaga-lumes, a abertura
// e o fim), so passa mais depressa.
//
// OS DOIS CREPUSCULOS ANDAM NO PASSO DO DIA (2026-11-20, pedido do autor: "cada momento do dia bem claro e
// observavel"). O passo rapido comecava as 18h em ponto e ia ate as 6h: a hora azul, o arrebol e a aurora (os
// momentos mais bonitos do ceu, render3d/skyPreset.SKY_TRACK) passavam em oito segundos cada, e o dia virava noite
// num piscar. Agora o relogio so corre na noite FECHADA (19h45 a 4h30); do fim da madrugada ao fim da hora azul ele
// anda devagar. `isNightTime` nao muda (18h-6h): ele diz quem dorme e quem acorda, nao a pressa do relogio.
const DAY_MS = 8 * 60 * 1000;
const NIGHT_MS = 3 * 60 * 1000;
const SLOW_FROM = 4.5 / 24;
const SLOW_TO = 19.75 / 24;

let time = 0; // 0 = midnight, .25 = sunrise, .5 = noon, .75 = sunset
let initialized = false;
/** Quantas meias-noites passaram: é de onde saem as estações (ver seasons). */
let day = 0;

export const getDay = (): number => day;
export const setDay = (value: number): void => { day = Math.max(0, Math.floor(value)); };

/** Seed only the first renderer of a run; scene restarts keep the same sun position. */
export const initializeTimeOfDay = (initial: number): void => {
  if (initialized) return;
  initialized = true;
  setTimeOfDay(initial);
};

export const getTimeOfDay = (): number => time;

/** Night runs from sunset (18:00) through sunrise (06:00). */
export const isNightTime = (): boolean => time < 0.25 || time >= 0.75;

/**
 * A hora em que os vizinhos dormem: das 21h as 5h, o miolo da noite. A noite inteira (18h-6h)
 * seria tempo demais de vale parado; com a margem, o anoitecer e o amanhecer ainda tem gente.
 */
export const isSleepTime = (): boolean => time < 5 / 24 || time >= 21 / 24;

export const setTimeOfDay = (value: number): void => {
  time = ((value % 1) + 1) % 1;
};

/**
 * O DESCANSO acelera o relogio (sentar numa fogueira e ver o ceu andar): 1 = normal. E estado de
 * modulo como o proprio relogio, e quem o liga e responsavel por devolve-lo a 1.
 */
let restScale = 1;
export const setTimeScale = (scale: number): void => { restScale = Math.max(0, scale); };
/** Quantas vezes o relógio do jogo corre agora (1 andando; 24 sentado; 48 dormindo): as nuvens do céu do mar andam junto. */
export const getTimeScale = (): number => restScale;

/** O relógio anda no passo lento do dia? (Do fim da madrugada ao fim da hora azul; ver o cabeçalho.) */
export const isSlowClock = (): boolean => time >= SLOW_FROM && time < SLOW_TO;

export const advanceTimeOfDay = (ms: number): void => {
  // Meio mostrador (0.5) por DAY_MS no passo lento e por NIGHT_MS na noite fechada.
  const half = isSlowClock() ? DAY_MS : NIGHT_MS;
  const next = time + (Math.max(0, ms) * restScale * 0.5) / half;
  if (next >= 1) day += 1;
  setTimeOfDay(next);
};

export const timeOfDayLabel = (): string => {
  const minutes = Math.floor(time * 24 * 60);
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
};

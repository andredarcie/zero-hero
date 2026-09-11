// The world's clock deliberately lives outside World3D: a scene restart must not turn noon
// back into midnight. A whole day is four minutes: two minutes in daylight and two at night,
// with the dawn and dusk transitions naturally distributed around the two boundaries.
const FULL_DAY_MS = 4 * 60 * 1000;

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

export const advanceTimeOfDay = (ms: number): void => {
  setTimeOfDay(time + Math.max(0, ms) / FULL_DAY_MS);
};

export const timeOfDayLabel = (): string => {
  const minutes = Math.floor(time * 24 * 60);
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
};

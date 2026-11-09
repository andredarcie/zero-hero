/**
 * A MATEMÁTICA do jogo (`Engine.Math`), e as curvas de easing das animações.
 * Parte do motor próprio (src/game/engine); licenças em LICENSES.md.
 */

/** Um inteiro entre `min` e `max`, os dois inclusos. */
export const Between = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1) + min);

/** Um real entre `min` e `max`. */
export const FloatBetween = (min: number, max: number): number => Math.random() * (max - min) + min;

export const Clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export const Linear = (p0: number, p1: number, t: number): number => (p1 - p0) * t + p0;

export const DegToRad = (degrees: number): number => degrees * (Math.PI / 180);

export const RadToDeg = (radians: number): number => radians * (180 / Math.PI);

export const Distance = {
  Between: (x1: number, y1: number, x2: number, y2: number): number => Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2),
};

/** O Wrap, letra por letra (a ordem das contas decide o último bit do ângulo). */
export const Wrap = (value: number, min: number, max: number): number => {
  const range = max - min;
  return (min + ((((value - min) % range) + range) % range));
};

/** O ângulo em graus no intervalo [-180, 180) — o que o `angle` dos objetos guarda. */
export const WrapDegrees = (angle: number): number => Wrap(angle, -180, 180);

/** O ângulo em radianos no intervalo [-π, π) — o `rotation` dos objetos. */
export const WrapRadians = (angle: number): number => Wrap(angle, -Math.PI, Math.PI);

export const RAD_TO_DEG = 180 / Math.PI;
export const DEG_TO_RAD = Math.PI / 180;

/** Embaralha no lugar (Fisher–Yates, o `Engine.Utils.Array.Shuffle`). */
export const Shuffle = <T>(array: T[]): T[] => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
  return array;
};

// ── As curvas de easing ──────────────────────────────────────────────────

type Ease = (v: number, ...params: number[]) => number;

const backIn: Ease = (v, overshoot = 1.70158) => v * v * ((overshoot + 1) * v - overshoot);
const backOut: Ease = (v, overshoot = 1.70158) => --v * v * ((overshoot + 1) * v + overshoot) + 1;
const backInOut: Ease = (v, overshoot = 1.70158) => {
  const s = overshoot * 1.525;
  if ((v *= 2) < 1) return 0.5 * (v * v * ((s + 1) * v - s));
  return 0.5 * ((v -= 2) * v * ((s + 1) * v + s) + 2);
};
const bounceOut: Ease = (v) => {
  if (v < 1 / 2.75) return 7.5625 * v * v;
  if (v < 2 / 2.75) return 7.5625 * (v -= 1.5 / 2.75) * v + 0.75;
  if (v < 2.5 / 2.75) return 7.5625 * (v -= 2.25 / 2.75) * v + 0.9375;
  return 7.5625 * (v -= 2.625 / 2.75) * v + 0.984375;
};
const bounceIn: Ease = (v) => {
  v = 1 - v;
  if (v < 1 / 2.75) return 1 - (7.5625 * v * v);
  if (v < 2 / 2.75) return 1 - (7.5625 * (v -= 1.5 / 2.75) * v + 0.75);
  if (v < 2.5 / 2.75) return 1 - (7.5625 * (v -= 2.25 / 2.75) * v + 0.9375);
  return 1 - (7.5625 * (v -= 2.625 / 2.75) * v + 0.984375);
};
const bounceInOut: Ease = (v) => {
  let reverse = false;
  if (v < 0.5) {
    v = 1 - (v * 2);
    reverse = true;
  } else {
    v = (v * 2) - 1;
  }
  if (v < 1 / 2.75) v = 7.5625 * v * v;
  else if (v < 2 / 2.75) v = 7.5625 * (v -= 1.5 / 2.75) * v + 0.75;
  else if (v < 2.5 / 2.75) v = 7.5625 * (v -= 2.25 / 2.75) * v + 0.9375;
  else v = 7.5625 * (v -= 2.625 / 2.75) * v + 0.984375;
  return reverse ? (1 - v) * 0.5 : v * 0.5 + 0.5;
};
const cubicIn: Ease = (v) => v * v * v;
const cubicOut: Ease = (v) => --v * v * v + 1;
const cubicInOut: Ease = (v) => ((v *= 2) < 1 ? 0.5 * v * v * v : 0.5 * ((v -= 2) * v * v + 2));
const expoIn: Ease = (v) => Math.pow(2, 10 * (v - 1)) - 0.001;
const expoOut: Ease = (v) => 1 - Math.pow(2, -10 * v);
const expoInOut: Ease = (v) => ((v *= 2) < 1 ? 0.5 * Math.pow(2, 10 * (v - 1)) : 0.5 * (2 - Math.pow(2, -10 * (v - 1))));
const quadIn: Ease = (v) => v * v;
const quadOut: Ease = (v) => v * (2 - v);
const quadInOut: Ease = (v) => ((v *= 2) < 1 ? 0.5 * v * v : -0.5 * (--v * (v - 2) - 1));
const quartIn: Ease = (v) => v * v * v * v;
const quartOut: Ease = (v) => 1 - (--v * v * v * v);
const quartInOut: Ease = (v) => ((v *= 2) < 1 ? 0.5 * v * v * v * v : -0.5 * ((v -= 2) * v * v * v - 2));
const quintIn: Ease = (v) => v * v * v * v * v;
const quintOut: Ease = (v) => --v * v * v * v * v + 1;
const quintInOut: Ease = (v) => ((v *= 2) < 1 ? 0.5 * v * v * v * v * v : 0.5 * ((v -= 2) * v * v * v * v + 2));
const sineIn: Ease = (v) => (v === 0 ? 0 : v === 1 ? 1 : 1 - Math.cos(v * Math.PI / 2));
const sineOut: Ease = (v) => (v === 0 ? 0 : v === 1 ? 1 : Math.sin(v * Math.PI / 2));
const sineInOut: Ease = (v) => (v === 0 ? 0 : v === 1 ? 1 : 0.5 * (1 - Math.cos(Math.PI * v)));
const circIn: Ease = (v) => 1 - Math.sqrt(1 - v * v);
const circOut: Ease = (v) => Math.sqrt(1 - (--v * v));
const circInOut: Ease = (v) => ((v *= 2) < 1 ? -0.5 * (Math.sqrt(1 - v * v) - 1) : 0.5 * (Math.sqrt(1 - (v -= 2) * v) + 1));
const linear: Ease = (v) => v;
const stepped: Ease = (v, steps = 1) => {
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  return (((steps * v) | 0) + 1) * (1 / steps);
};

/** O EaseMap, chave por chave. Um nome que não está aqui (ex.: 'Power2.easeOut') cai em Power0. */
export const EaseMap: Readonly<Record<string, Ease>> = {
  Power0: linear,
  Power1: quadOut,
  Power2: cubicOut,
  Power3: quartOut,
  Power4: quintOut,
  Linear: linear,
  Quad: quadOut,
  Cubic: cubicOut,
  Quart: quartOut,
  Quint: quintOut,
  Sine: sineOut,
  Expo: expoOut,
  Circ: circOut,
  Back: backOut,
  Bounce: bounceOut,
  Stepped: stepped,
  'Quad.easeIn': quadIn,
  'Cubic.easeIn': cubicIn,
  'Quart.easeIn': quartIn,
  'Quint.easeIn': quintIn,
  'Sine.easeIn': sineIn,
  'Expo.easeIn': expoIn,
  'Circ.easeIn': circIn,
  'Back.easeIn': backIn,
  'Bounce.easeIn': bounceIn,
  'Quad.easeOut': quadOut,
  'Cubic.easeOut': cubicOut,
  'Quart.easeOut': quartOut,
  'Quint.easeOut': quintOut,
  'Sine.easeOut': sineOut,
  'Expo.easeOut': expoOut,
  'Circ.easeOut': circOut,
  'Back.easeOut': backOut,
  'Bounce.easeOut': bounceOut,
  'Quad.easeInOut': quadInOut,
  'Cubic.easeInOut': cubicInOut,
  'Quart.easeInOut': quartInOut,
  'Quint.easeInOut': quintInOut,
  'Sine.easeInOut': sineInOut,
  'Expo.easeInOut': expoInOut,
  'Circ.easeInOut': circInOut,
  'Back.easeInOut': backInOut,
  'Bounce.easeInOut': bounceInOut,
};

const uppercaseFirst = (s: string): string => (s && s[0].toUpperCase() + s.slice(1));

/** O GetEaseFunction: o nome vira a função (com a normalização de 'X.in' → 'X.easeIn'). */
export const getEaseFunction = (ease: unknown, easeParams?: number[] | null): Ease => {
  let easeFunction: Ease = EaseMap.Power0;
  if (typeof ease === 'string') {
    if (Object.prototype.hasOwnProperty.call(EaseMap, ease)) {
      easeFunction = EaseMap[ease];
    } else {
      let direction = '';
      if (ease.indexOf('.')) {
        direction = ease.substring(ease.indexOf('.') + 1);
        const lower = direction.toLowerCase();
        if (lower === 'in') direction = 'easeIn';
        else if (lower === 'out') direction = 'easeOut';
        else if (lower === 'inout') direction = 'easeInOut';
      }
      const name = uppercaseFirst(ease.substring(0, ease.indexOf('.') + 1) + direction);
      if (Object.prototype.hasOwnProperty.call(EaseMap, name)) easeFunction = EaseMap[name];
    }
  } else if (typeof ease === 'function') {
    easeFunction = ease as Ease;
  }
  if (!easeParams) return easeFunction;
  const cloneParams = easeParams.slice(0);
  cloneParams.unshift(0);
  return (v: number) => {
    cloneParams[0] = v;
    return easeFunction(...(cloneParams as [number, ...number[]]));
  };
};

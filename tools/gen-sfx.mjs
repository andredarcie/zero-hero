// Generates the game's sound effects as .wav files — "Dark Souls weight, SNES timbre".
//
// Every effect is built from LAYERS (a body, a low sub-thump for physical weight, and a
// short transient for definition), then run through a per-sound post chain:
//   - SNES-style echo: a short delay with a low-passed feedback loop (the S-DSP FIR sound)
//   - a small dark Schroeder reverb tail (the Souls "space" — baked into the sample)
//   - a gentle low-pass (the console's gaussian-interpolation warmth) + soft saturation
// Output -> public/assets/audio/.  Everything is original synthesis, no recordings.
//
//   node tools/gen-sfx.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'audio');

// ── note helper ────────────────────────────────────────────────────────────
const SEMI = {
  C: -9, 'C#': -8, D: -7, Eb: -6, E: -5, F: -4, 'F#': -3, G: -2, 'G#': -1, A: 0, Bb: 1, B: 2,
};
const note = (name) => {
  const m = /^([A-G][#b]?)(\d)$/.exec(name);
  return 440 * Math.pow(2, (SEMI[m[1]] + (Number(m[2]) - 4) * 12) / 12);
};

// ── primitives ─────────────────────────────────────────────────────────────
function makeSVF() {
  let ic1 = 0, ic2 = 0;
  return (x, cutoff, q) => {
    const g = Math.tan(Math.PI * Math.min(cutoff, SR * 0.49) / SR);
    const k = 1 / q;
    const a1 = 1 / (1 + g * (g + k));
    const a2 = g * a1;
    const a3 = g * a2;
    const v3 = x - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    return { lp: v2, bp: v1, hp: x - k * v1 - v2 };
  };
}

// amp envelope: linear attack, exponential decay landing ~e^-curve at the end
const env = (t, dur, attack, curve) =>
  t < attack ? t / Math.max(attack, 1e-4) : Math.exp(-curve * (t - attack) / Math.max(dur - attack, 1e-4));

// Oscillator layer. freq holds f0 until holdFrac*dur, then ramps exponentially to f1.
// trem = amplitude flicker {rate, depth}. Layers return {at, data} for mixAt().
function osc({
  wave = 'sine', f0 = 220, f1 = f0, holdFrac = 0, dur = 0.2, vol = 0.4,
  attack = 0.004, curve = 5, at = 0, detune = 0, trem = null, sub = 0,
}) {
  const n = Math.floor(dur * SR);
  const data = new Float32Array(n);
  const voices = detune > 0 ? [1 - detune / 1200 * Math.LN2, 1 + detune / 1200 * Math.LN2] : [1];
  for (const dv of voices) {
    let ph = 0, phSub = 0;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const frac = t / dur;
      const f = (frac <= holdFrac || f1 === f0)
        ? f0
        : f0 * Math.pow(f1 / f0, (frac - holdFrac) / (1 - holdFrac));
      ph += (f * dv) / SR; if (ph >= 1) ph -= 1;
      phSub += (f * dv * 0.5) / SR; if (phSub >= 1) phSub -= 1;
      let s;
      if (wave === 'saw') s = 2 * ph - 1;
      else if (wave === 'square') s = ph < 0.5 ? 0.6 : -0.6;
      else if (wave === 'triangle') s = 2 * Math.abs(2 * ph - 1) - 1;
      else s = Math.sin(2 * Math.PI * ph);
      if (sub > 0) s = s * (1 - sub) + Math.sin(2 * Math.PI * phSub) * sub;
      let a = env(t, dur, attack, curve);
      if (trem) a *= 1 - trem.depth * (0.5 - 0.5 * Math.sin(2 * Math.PI * trem.rate * t));
      data[i] += (s * a * vol) / voices.length;
    }
  }
  return { at, data };
}

// Filtered-noise layer with a swept SVF (lowpass | bandpass | highpass).
function noise({
  type = 'lowpass', f0 = 800, f1 = f0, q = 1, dur = 0.15, vol = 0.4,
  attack = 0.003, curve = 5, at = 0, trem = null,
}) {
  const n = Math.floor(dur * SR);
  const data = new Float32Array(n);
  const svf = makeSVF();
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = f1 === f0 ? f0 : f0 * Math.pow(f1 / f0, t / dur);
    const bands = svf(Math.random() * 2 - 1, f, q);
    const s = type === 'bandpass' ? bands.bp : type === 'highpass' ? bands.hp : bands.lp;
    let a = env(t, dur, attack, curve);
    if (trem) a *= 1 - trem.depth * (0.5 - 0.5 * Math.sin(2 * Math.PI * trem.rate * t));
    data[i] = s * a * vol;
  }
  return { at, data };
}

// The physical weight under every impact: a fast pitch-dropping sine thump.
const thump = ({ f = 68, dur = 0.07, vol = 0.5, at = 0 }) =>
  osc({ wave: 'sine', f0: f * 1.6, f1: f * 0.8, dur, vol, attack: 0.002, curve: 6, at });

// Karplus-Strong pluck — muted-harp notes for "success" cues.
function pluck({ f = 261.6, dur = 0.6, vol = 0.4, bright = 0.45, at = 0 }) {
  const N = Math.max(2, Math.round(SR / f));
  const line = new Float32Array(N);
  let lp = 0;
  for (let i = 0; i < N; i++) { lp += bright * ((Math.random() * 2 - 1) - lp); line[i] = lp; }
  const n = Math.floor(dur * SR);
  const data = new Float32Array(n);
  let idx = 0;
  const fadeN = Math.min(n, Math.floor(0.1 * SR));
  for (let i = 0; i < n; i++) {
    const cur = line[idx];
    line[idx] = 0.997 * 0.5 * (cur + line[(idx + 1) % N]);
    idx = (idx + 1) % N;
    data[i] = cur * vol * (i > n - fadeN ? (n - i) / fadeN : 1);
  }
  return { at, data };
}

// Inharmonic bell partials — the cast-metal "toll" (pickups, the death knell).
function bell({ f = 220, dur = 1.5, vol = 0.3, tau = 1.0, at = 0 }) {
  const ratios = [1, 2.0, 2.4, 3.6, 4.8];
  const amps = [1, 0.5, 0.32, 0.2, 0.1];
  const n = Math.floor(dur * SR);
  const data = new Float32Array(n);
  for (let k = 0; k < ratios.length; k++) {
    const fk = f * ratios[k] * (1 + (k % 2 === 0 ? 1 : -1) * 0.0015);
    if (fk > SR * 0.45) continue;
    const w = 2 * Math.PI * fk / SR;
    const tk = tau / (1 + 0.8 * k);
    for (let i = 0; i < n; i++) data[i] += Math.sin(w * i) * Math.exp(-(i / SR) / tk) * amps[k] * vol;
  }
  return { at, data };
}

const mixAt = (layers) => {
  let end = 0;
  for (const l of layers) end = Math.max(end, Math.floor(l.at * SR) + l.data.length);
  const out = new Float32Array(end);
  for (const l of layers) {
    const o = Math.floor(l.at * SR);
    for (let i = 0; i < l.data.length; i++) out[o + i] += l.data[i];
  }
  return out;
};

// ── post chain ─────────────────────────────────────────────────────────────
function echoMono(x, { delayMs = 96, feedback = 0.25, lpHz = 4200, mix = 0.15, tail = 0.4 }) {
  const d = Math.max(1, Math.round(SR * delayMs / 1000));
  const out = new Float32Array(x.length + Math.floor(tail * SR));
  const buf = new Float32Array(d);
  let idx = 0, lp = 0;
  const a = 1 - Math.exp(-2 * Math.PI * lpHz / SR);
  for (let i = 0; i < out.length; i++) {
    const dry = i < x.length ? x[i] : 0;
    const e = buf[idx];
    lp += a * ((dry + e * feedback) - lp);
    buf[idx] = lp;
    idx = (idx + 1) % d;
    out[i] = dry + e * mix;
  }
  return out;
}

// Small dark Schroeder reverb — 4 combs + 2 allpasses, low-passed feedback. The wet tail
// is what gives one-shot effects their sense of a large cold place.
function reverbMono(x, { seconds = 1.0, wet = 0.15, damp = 0.45 }) {
  const out = new Float32Array(x.length + Math.floor(seconds * SR));
  const combT = [1116, 1277, 1422, 1617];
  const fb = Math.pow(10, (-3 * (combT[3] / SR)) / seconds); // ~RT60 target
  const combs = combT.map((t) => ({ buf: new Float32Array(t), i: 0, fs: 0 }));
  const aps = [225, 556].map((t) => ({ buf: new Float32Array(t), i: 0 }));
  for (let i = 0; i < out.length; i++) {
    const dry = i < x.length ? x[i] : 0;
    let w = 0;
    for (const c of combs) {
      const o = c.buf[c.i];
      c.fs = o * (1 - damp) + c.fs * damp;
      c.buf[c.i] = dry + c.fs * fb;
      if (++c.i >= c.buf.length) c.i = 0;
      w += o;
    }
    w *= 0.25;
    for (const a of aps) {
      const bo = a.buf[a.i];
      const o = -w + bo;
      a.buf[a.i] = w + bo * 0.5;
      if (++a.i >= a.buf.length) a.i = 0;
      w = o;
    }
    out[i] = dry + w * wet;
  }
  return out;
}

function lowpass(x, hz) {
  const a = 1 - Math.exp(-2 * Math.PI * hz / SR);
  let lp = 0;
  for (let i = 0; i < x.length; i++) { lp += a * (x[i] - lp); x[i] = lp; }
  return x;
}

function finalize(x, { lpHz = 5500, echo = null, reverb = null, drive = 1.15, peakTo = 0.9 }) {
  let y = x;
  if (echo) y = echoMono(y, echo);
  if (reverb) y = reverbMono(y, reverb);
  lowpass(y, lpHz);
  let peak = 0;
  for (const s of y) peak = Math.max(peak, Math.abs(s));
  const g = peak > 0 ? 1 / peak : 1;
  for (let i = 0; i < y.length; i++) y[i] = Math.tanh(y[i] * g * drive) * (peakTo / Math.tanh(drive));
  return y;
}

function toWav(samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  return buf;
}

// ── the sound set ──────────────────────────────────────────────────────────
// Design language: every impact = transient + body + sub-thump; nothing bright or
// cheerful; melodic cues use minor/neutral intervals in the game's key world (E minor /
// A minor); reverb tails short and dark; footsteps and UI stay dry and understated.
const sounds = {
  // Heavy air-cut: swept band of noise + a faint metal ring (a fifth) + sub weight.
  'sword-slash': () => finalize(mixAt([
    noise({ type: 'bandpass', f0: 3600, f1: 850, q: 1.2, dur: 0.1, vol: 0.8, curve: 4.5 }),
    osc({ wave: 'square', f0: note('E5'), dur: 0.11, vol: 0.05, curve: 7, at: 0.012, detune: 7 }),
    osc({ wave: 'square', f0: note('B5'), dur: 0.09, vol: 0.035, curve: 7, at: 0.012 }),
    thump({ f: 72, dur: 0.07, vol: 0.5, at: 0.004 }),
  ]), { lpHz: 6200, echo: { delayMs: 96, feedback: 0.25, lpHz: 4200, mix: 0.16, tail: 0.35 }, reverb: { seconds: 0.8, wet: 0.1 } }),

  // The blade bites: meaty low knock, quick and physical.
  'enemy-hit': () => finalize(mixAt([
    noise({ type: 'lowpass', f0: 420, f1: 190, q: 1.1, dur: 0.09, vol: 0.85, curve: 5 }),
    osc({ wave: 'saw', f0: 150, f1: 52, dur: 0.11, vol: 0.42, curve: 6, detune: 9 }),
    noise({ type: 'bandpass', f0: 1900, q: 2, dur: 0.02, vol: 0.22 }),
    thump({ f: 64, dur: 0.06, vol: 0.6 }),
  ]), { lpHz: 5400, echo: { delayMs: 80, feedback: 0.2, lpHz: 4000, mix: 0.12, tail: 0.3 }, reverb: { seconds: 0.7, wet: 0.09 } }),

  // A body giving out: three sagging growls, bone rattle, dust.
  'enemy-death': () => finalize(mixAt([
    osc({ wave: 'saw', f0: 150, f1: 92, dur: 0.16, vol: 0.34, detune: 10 }),
    osc({ wave: 'saw', f0: 110, f1: 68, dur: 0.17, vol: 0.32, at: 0.1, detune: 10 }),
    osc({ wave: 'saw', f0: 73, f1: 45, dur: 0.2, vol: 0.3, at: 0.2, detune: 10 }),
    noise({ type: 'lowpass', f0: 340, f1: 160, dur: 0.5, vol: 0.3, at: 0.05, curve: 4 }),
    noise({ type: 'bandpass', f0: 2100, q: 3, dur: 0.014, vol: 0.16, at: 0.06 }),
    noise({ type: 'bandpass', f0: 1750, q: 3, dur: 0.012, vol: 0.14, at: 0.16 }),
    noise({ type: 'bandpass', f0: 2300, q: 3, dur: 0.013, vol: 0.12, at: 0.27 }),
    thump({ f: 52, dur: 0.09, vol: 0.42, at: 0.2 }),
  ]), { lpHz: 5000, echo: { delayMs: 128, feedback: 0.3, lpHz: 3800, mix: 0.16, tail: 0.5 }, reverb: { seconds: 1.4, wet: 0.2 } }),

  // A soul-fragment tick — one small dark chime (E5), understated.
  'coin': () => finalize(mixAt([
    bell({ f: note('E5'), dur: 0.45, vol: 0.5, tau: 0.28 }),
    noise({ type: 'bandpass', f0: 3200, q: 3, dur: 0.006, vol: 0.1 }),
  ]), { lpHz: 6800, echo: { delayMs: 96, feedback: 0.3, lpHz: 4500, mix: 0.2, tail: 0.4 }, reverb: { seconds: 0.8, wet: 0.12 }, drive: 1.0, peakTo: 0.8 }),

  // A single water drop for the title screen's dramatic reveal. The signature of a real drip
  // is an UPWARD pitch snap — the air-bubble cavity resonance rising as it collapses — so a
  // sine sweeps up fast (700 -> 1700) with a quick decay, over a faint low "plunk" body and a
  // tiny surface tick, then a short cistern reverb. One drop = one word.
  'water-drop': () => finalize(mixAt([
    osc({ wave: 'sine', f0: 700, f1: 1700, holdFrac: 0, dur: 0.08, vol: 0.55, attack: 0.002, curve: 5.5 }),
    noise({ type: 'highpass', f0: 5000, q: 0.7, dur: 0.004, vol: 0.12 }),
    osc({ wave: 'sine', f0: 300, f1: 210, dur: 0.05, vol: 0.13, attack: 0.001, curve: 7 }),
  ]), { lpHz: 7200, echo: { delayMs: 180, feedback: 0.24, lpHz: 3800, mix: 0.12, tail: 0.4 }, reverb: { seconds: 1.0, wet: 0.2 }, drive: 1.0, peakTo: 0.85 }),

  // The author's name lands: a cinematic impact for the title's finale — a chest-hit sub drop,
  // a body boom, a bright metallic clang, and a low A-minor bell toll (A2 + its fifth E3) ringing
  // out into a huge dark hall. Loud and marcante on purpose; plays once, on "ANDRÉ N. DARCIE".
  'title-impact': () => finalize(mixAt([
    osc({ wave: 'sine', f0: 110, f1: 34, dur: 1.1, vol: 0.9, attack: 0.003, curve: 3.5 }),
    noise({ type: 'lowpass', f0: 700, f1: 150, q: 0.8, dur: 0.6, vol: 0.7, curve: 3.5 }),
    noise({ type: 'bandpass', f0: 3000, q: 1.5, dur: 0.05, vol: 0.35 }),
    bell({ f: note('A2'), dur: 2.8, vol: 0.4, tau: 1.9, at: 0.01 }),
    bell({ f: note('E3'), dur: 2.4, vol: 0.22, tau: 1.5, at: 0.02 }),
    thump({ f: 60, dur: 0.12, vol: 0.6 }),
  ]), { lpHz: 6000, echo: { delayMs: 260, feedback: 0.4, lpHz: 3400, mix: 0.2, tail: 1.2 }, reverb: { seconds: 3.2, wet: 0.4, damp: 0.5 }, drive: 1.3, peakTo: 0.96 }),

  // Tibetan singing bowl — the intro's "wake up" swell. Inharmonic bowl partials (1 : 2.76 :
  // 5.4 : 8.93) each split into a slightly detuned pair so they beat and shimmer like a real
  // struck bowl, over a soft low "om" drone an octave down. Slow swell, long ring, big temple
  // hall — meditative and spiritual, growing as the hero grows.
  'singing-bowl': () => {
    const bowlBase = note('A3'); // 220 Hz — calm, in the game's key
    const DUR = 8.2;
    const partials = [
      { r: 1.00, v: 0.46, curve: 2.4 },
      { r: 2.76, v: 0.30, curve: 3.2 },
      { r: 5.40, v: 0.16, curve: 4.2 },
      { r: 8.93, v: 0.08, curve: 5.4 },
    ];
    const layers = [];
    for (const p of partials) {
      for (const cents of [-5, 5]) {
        layers.push(osc({ wave: 'sine', f0: bowlBase * p.r * Math.pow(2, cents / 1200), dur: DUR, vol: p.v / 2, attack: 0.8, curve: p.curve }));
      }
    }
    layers.push(osc({ wave: 'sine', f0: bowlBase / 2, dur: DUR, vol: 0.18, attack: 1.4, curve: 2.0 })); // om drone
    return finalize(mixAt(layers), { lpHz: 6200, echo: { delayMs: 320, feedback: 0.3, lpHz: 3400, mix: 0.14, tail: 1.5 }, reverb: { seconds: 4.0, wet: 0.36, damp: 0.4 }, drive: 1.0, peakTo: 0.82 });
  },

  // Warm subdued heal — a low minor third (A3 -> C4), felt more than heard.
  'heart': () => finalize(mixAt([
    osc({ wave: 'triangle', f0: note('A3'), dur: 0.2, vol: 0.42, attack: 0.02, curve: 3.5, sub: 0.5 }),
    osc({ wave: 'triangle', f0: note('C4'), dur: 0.42, vol: 0.4, attack: 0.03, curve: 3.5, at: 0.15, sub: 0.5 }),
  ]), { lpHz: 4400, echo: { delayMs: 160, feedback: 0.35, lpHz: 3600, mix: 0.22, tail: 0.6 }, reverb: { seconds: 1.1, wet: 0.16 }, drive: 1.0 }),

  // NB: the item-get sound is NOT synthesized here — it uses public/assets/audio/item-pickup.wav
  // (a Freesound recording, see CREDITS.md). SoundManager's `swordPickup` sample points at it.

  // Pained grunt — short, low, human-ish.
  'hurt': () => finalize(mixAt([
    osc({ wave: 'saw', f0: 155, f1: 86, dur: 0.22, vol: 0.45, curve: 5, detune: 12 }),
    noise({ type: 'lowpass', f0: 430, f1: 240, dur: 0.11, vol: 0.35 }),
    thump({ f: 70, dur: 0.06, vol: 0.4 }),
  ]), { lpHz: 5000, echo: { delayMs: 80, feedback: 0.2, lpHz: 4000, mix: 0.1, tail: 0.25 }, reverb: { seconds: 0.6, wet: 0.08 } }),

  // YOU DIED. A minor-2nd cluster (E+F) swells out of nothing, the pitch gives way two
  // semitones, one distant knell — then the hall swallows everything. No melody.
  'game-over': () => finalize(mixAt([
    osc({ wave: 'saw', f0: note('E2'), f1: note('D2'), holdFrac: 0.35, dur: 3.4, vol: 0.3, attack: 0.85, curve: 2.2, detune: 7, sub: 0.35 }),
    osc({ wave: 'saw', f0: note('F2'), f1: note('Eb2'), holdFrac: 0.35, dur: 3.4, vol: 0.26, attack: 0.9, curve: 2.2, detune: 7, sub: 0.3 }),
    osc({ wave: 'sine', f0: note('E1'), f1: note('D1'), holdFrac: 0.4, dur: 3.6, vol: 0.5, attack: 1.0, curve: 2.0 }),
    bell({ f: note('E2'), dur: 3.2, vol: 0.13, tau: 2.6, at: 0.25 }),
  ]), { lpHz: 3800, echo: { delayMs: 240, feedback: 0.4, lpHz: 3200, mix: 0.18, tail: 1.2 }, reverb: { seconds: 3.5, wet: 0.42, damp: 0.5 }, drive: 1.05, peakTo: 0.88 }),

  // Low muted menu tones (down = open, up = close).
  'shop-open': () => finalize(mixAt([
    osc({ wave: 'sine', f0: note('G3'), dur: 0.1, vol: 0.4, curve: 4 }),
    osc({ wave: 'sine', f0: note('C3'), dur: 0.2, vol: 0.44, curve: 3.5, at: 0.08 }),
  ]), { lpHz: 4000, echo: { delayMs: 96, feedback: 0.25, lpHz: 3500, mix: 0.14, tail: 0.3 }, drive: 1.0 }),
  'shop-close': () => finalize(mixAt([
    osc({ wave: 'sine', f0: note('C3'), dur: 0.1, vol: 0.4, curve: 4 }),
    osc({ wave: 'sine', f0: note('G3'), dur: 0.2, vol: 0.4, curve: 3.5, at: 0.08 }),
  ]), { lpHz: 4000, echo: { delayMs: 96, feedback: 0.25, lpHz: 3500, mix: 0.14, tail: 0.3 }, drive: 1.0 }),

  // Fire catches: a muffled roar blooming up with real crackles riding it.
  'ignite': () => (() => {
    const layers = [
      noise({ type: 'bandpass', f0: 300, f1: 1300, q: 0.9, dur: 0.55, vol: 0.6, attack: 0.12, curve: 3.5 }),
      osc({ wave: 'saw', f0: 85, f1: 190, dur: 0.4, vol: 0.13, at: 0.1, curve: 3, detune: 10 }),
      thump({ f: 46, dur: 0.5, vol: 0.45, at: 0.14 }),
    ];
    let t = 0.16;
    while (t < 0.92) {
      layers.push(noise({ type: 'highpass', f0: 2100, q: 1, dur: 0.008 + Math.random() * 0.007, vol: 0.16 + Math.random() * 0.14, at: t }));
      t += 0.05 + Math.random() * 0.11;
    }
    return finalize(mixAt(layers), { lpHz: 5200, echo: { delayMs: 128, feedback: 0.3, lpHz: 3800, mix: 0.15, tail: 0.5 }, reverb: { seconds: 1.2, wet: 0.18 } });
  })(),

  // Axe bite: dry thock + splintering crack.
  'wood-chop': () => finalize(mixAt([
    noise({ type: 'lowpass', f0: 680, f1: 350, q: 1.3, dur: 0.06, vol: 0.85 }),
    osc({ wave: 'square', f0: 195, f1: 84, dur: 0.09, vol: 0.32, curve: 6 }),
    noise({ type: 'highpass', f0: 1900, q: 1, dur: 0.03, vol: 0.3, at: 0.014 }),
    thump({ f: 76, dur: 0.05, vol: 0.35 }),
  ]), { lpHz: 6000, echo: { delayMs: 64, feedback: 0.18, lpHz: 4200, mix: 0.1, tail: 0.2 }, reverb: { seconds: 0.4, wet: 0.06 } }),

  // Trunk topples: a groaning creak, the fall's whoosh, then the ground takes it.
  'tree-fall': () => finalize(mixAt([
    osc({ wave: 'saw', f0: 120, f1: 55, dur: 0.55, vol: 0.28, curve: 3, detune: 14, trem: { rate: 13, depth: 0.5 } }),
    noise({ type: 'lowpass', f0: 380, f1: 950, q: 0.8, dur: 0.5, vol: 0.38, attack: 0.12, curve: 3.5, at: 0.35 }),
    noise({ type: 'lowpass', f0: 260, f1: 130, q: 1, dur: 0.14, vol: 0.75, at: 0.92 }),
    thump({ f: 50, dur: 0.12, vol: 0.75, at: 0.92 }),
    noise({ type: 'bandpass', f0: 1200, q: 2.5, dur: 0.02, vol: 0.14, at: 1.0 }),
    noise({ type: 'bandpass', f0: 950, q: 2.5, dur: 0.02, vol: 0.12, at: 1.08 }),
  ]), { lpHz: 5000, echo: { delayMs: 128, feedback: 0.25, lpHz: 3800, mix: 0.13, tail: 0.5 }, reverb: { seconds: 1.2, wet: 0.16 } }),

  // Trunk meets river: wet slap, spray, a few sinking droplets.
  'splash': () => finalize(mixAt([
    noise({ type: 'lowpass', f0: 1200, f1: 500, q: 0.7, dur: 0.13, vol: 0.75, attack: 0.004 }),
    noise({ type: 'highpass', f0: 2500, q: 0.6, dur: 0.32, vol: 0.22, at: 0.03, curve: 4 }),
    osc({ wave: 'sine', f0: 640, f1: 210, dur: 0.06, vol: 0.16, at: 0.12 }),
    osc({ wave: 'sine', f0: 720, f1: 260, dur: 0.05, vol: 0.13, at: 0.21 }),
    osc({ wave: 'sine', f0: 560, f1: 190, dur: 0.06, vol: 0.12, at: 0.31 }),
    thump({ f: 85, dur: 0.05, vol: 0.3 }),
  ]), { lpHz: 6400, echo: { delayMs: 96, feedback: 0.25, lpHz: 4000, mix: 0.14, tail: 0.4 }, reverb: { seconds: 1.0, wet: 0.16 } }),

  // Pickaxe on stone: sharp clack, then rubble settling.
  'rock-smash': () => finalize(mixAt([
    noise({ type: 'bandpass', f0: 2600, q: 3, dur: 0.045, vol: 0.7 }),
    osc({ wave: 'square', f0: 330, f1: 130, dur: 0.07, vol: 0.3, curve: 6 }),
    noise({ type: 'lowpass', f0: 500, f1: 240, dur: 0.36, vol: 0.5, at: 0.03, curve: 4 }),
    noise({ type: 'bandpass', f0: 950, q: 2.5, dur: 0.018, vol: 0.2, at: 0.09 }),
    noise({ type: 'bandpass', f0: 780, q: 2.5, dur: 0.016, vol: 0.16, at: 0.17 }),
    thump({ f: 58, dur: 0.06, vol: 0.5 }),
  ]), { lpHz: 6000, echo: { delayMs: 80, feedback: 0.2, lpHz: 4200, mix: 0.11, tail: 0.3 }, reverb: { seconds: 0.8, wet: 0.11 } }),

  // Scythe through dry stalks: two quick swishes, mostly dry.
  'grass-cut': () => finalize(mixAt([
    noise({ type: 'highpass', f0: 2200, f1: 3800, q: 0.7, dur: 0.12, vol: 0.5, curve: 4.5 }),
    noise({ type: 'highpass', f0: 1800, f1: 3000, q: 0.7, dur: 0.1, vol: 0.3, at: 0.07 }),
    noise({ type: 'bandpass', f0: 1000, q: 2, dur: 0.01, vol: 0.14, at: 0.02 }),
  ]), { lpHz: 7500, echo: { delayMs: 48, feedback: 0.15, lpHz: 4500, mix: 0.08, tail: 0.15 }, reverb: { seconds: 0.3, wet: 0.05 } }),

  // Bomb set down: soft thud, then the fuse starts spitting.
  'bomb-place': () => finalize(mixAt([
    noise({ type: 'lowpass', f0: 320, f1: 180, dur: 0.08, vol: 0.6 }),
    thump({ f: 62, dur: 0.05, vol: 0.4 }),
    noise({ type: 'highpass', f0: 3400, q: 0.8, dur: 0.34, vol: 0.16, at: 0.07, curve: 1.2, trem: { rate: 28, depth: 0.6 } }),
  ]), { lpHz: 6000, drive: 1.05 }),

  // The blast: a sub drop you feel, a boom, a long rumbling tail.
  'bomb-explode': () => finalize(mixAt([
    osc({ wave: 'sine', f0: 105, f1: 24, dur: 0.9, vol: 0.9, attack: 0.003, curve: 4 }),
    noise({ type: 'lowpass', f0: 850, f1: 190, q: 0.8, dur: 0.5, vol: 0.85, curve: 4 }),
    noise({ type: 'lowpass', f0: 190, f1: 90, dur: 1.3, vol: 0.5, at: 0.12, curve: 3 }),
    noise({ type: 'highpass', f0: 1600, q: 0.8, dur: 0.06, vol: 0.3 }),
    noise({ type: 'bandpass', f0: 900, q: 2, dur: 0.03, vol: 0.2, at: 0.3 }),
    noise({ type: 'bandpass', f0: 700, q: 2, dur: 0.03, vol: 0.16, at: 0.5 }),
  ]), { lpHz: 4500, echo: { delayMs: 192, feedback: 0.35, lpHz: 3200, mix: 0.2, tail: 0.8 }, reverb: { seconds: 2.2, wet: 0.28 }, drive: 1.3 }),

  // Bones grinding up through soil: scrapes, a rising groan, dirt falling away.
  'undead-spawn': () => finalize(mixAt([
    noise({ type: 'bandpass', f0: 520, f1: 900, q: 2.5, dur: 0.2, vol: 0.34, curve: 3 }),
    noise({ type: 'bandpass', f0: 1250, f1: 800, q: 2.8, dur: 0.16, vol: 0.24, at: 0.18 }),
    osc({ wave: 'saw', f0: 52, f1: 126, dur: 0.5, vol: 0.3, at: 0.08, curve: 2.5, detune: 16 }),
    noise({ type: 'lowpass', f0: 700, f1: 300, dur: 0.32, vol: 0.24, at: 0.05, curve: 3 }),
    noise({ type: 'bandpass', f0: 1900, q: 3, dur: 0.014, vol: 0.18, at: 0.5 }),
    noise({ type: 'bandpass', f0: 2200, q: 3, dur: 0.012, vol: 0.15, at: 0.63 }),
    noise({ type: 'bandpass', f0: 1700, q: 3, dur: 0.013, vol: 0.13, at: 0.78 }),
  ]), { lpHz: 4200, echo: { delayMs: 160, feedback: 0.3, lpHz: 3400, mix: 0.15, tail: 0.5 }, reverb: { seconds: 1.3, wet: 0.22 } }),

  // Flame licks a foe: a low whoomp with crackle spits.
  'fire-hit': () => finalize(mixAt([
    noise({ type: 'lowpass', f0: 620, f1: 300, dur: 0.13, vol: 0.6, attack: 0.008 }),
    osc({ wave: 'saw', f0: 210, f1: 100, dur: 0.1, vol: 0.18, detune: 10 }),
    noise({ type: 'highpass', f0: 2200, q: 1, dur: 0.008, vol: 0.28, at: 0.03 }),
    noise({ type: 'highpass', f0: 2500, q: 1, dur: 0.007, vol: 0.22, at: 0.1 }),
    noise({ type: 'highpass', f0: 2000, q: 1, dur: 0.008, vol: 0.18, at: 0.17 }),
    thump({ f: 58, dur: 0.05, vol: 0.32 }),
  ]), { lpHz: 5200, echo: { delayMs: 96, feedback: 0.22, lpHz: 3800, mix: 0.11, tail: 0.3 }, reverb: { seconds: 0.7, wet: 0.12 } }),

  // Laying a graveto onto the frame over the river: a hollow wooden "tok" with a wet edge.
  'bridge-plank': () => finalize(mixAt([
    noise({ type: 'bandpass', f0: 430, q: 2.2, dur: 0.05, vol: 0.7 }),
    osc({ wave: 'square', f0: 145, f1: 74, dur: 0.09, vol: 0.28, curve: 6 }),
    osc({ wave: 'triangle', f0: 300, dur: 0.06, vol: 0.1, at: 0.01 }),
    noise({ type: 'highpass', f0: 2600, f1: 1400, q: 0.6, dur: 0.12, vol: 0.14, at: 0.03, curve: 4 }), // splash tail
    thump({ f: 82, dur: 0.04, vol: 0.3 }),
  ]), { lpHz: 5400, echo: { delayMs: 64, feedback: 0.18, lpHz: 4000, mix: 0.1, tail: 0.2 }, reverb: { seconds: 0.5, wet: 0.09 } }),

  // Hammering a nail through a board: a bright metallic tick over a short hollow-wood knock,
  // a whisker of ring, a little sub weight. Short and dry — it repeats fast as the bridge lays.
  'hammer': () => finalize(mixAt([
    noise({ type: 'bandpass', f0: 3400, q: 4, dur: 0.02, vol: 0.7 }),
    osc({ wave: 'square', f0: 230, f1: 118, dur: 0.05, vol: 0.34, curve: 7 }),
    osc({ wave: 'triangle', f0: 620, f1: 430, dur: 0.05, vol: 0.16, curve: 6, at: 0.004 }),
    noise({ type: 'bandpass', f0: 1500, q: 3, dur: 0.012, vol: 0.16, at: 0.006 }),
    thump({ f: 90, dur: 0.035, vol: 0.28 }),
  ]), { lpHz: 6200, echo: { delayMs: 56, feedback: 0.16, lpHz: 4200, mix: 0.09, tail: 0.18 }, reverb: { seconds: 0.4, wet: 0.08 } }),

  // Bridge done: planks settle, then three muted harp notes rise (C-E-G — earned, not
  // triumphant; the only major cue in the game, kept low and woody).
  'bridge-built': () => finalize(mixAt([
    noise({ type: 'bandpass', f0: 430, q: 2.2, dur: 0.05, vol: 0.55 }),
    noise({ type: 'bandpass', f0: 390, q: 2.2, dur: 0.05, vol: 0.45, at: 0.13 }),
    noise({ type: 'bandpass', f0: 460, q: 2.2, dur: 0.05, vol: 0.5, at: 0.26 }),
    osc({ wave: 'square', f0: 150, f1: 80, dur: 0.08, vol: 0.2 }),
    pluck({ f: note('C4'), dur: 0.6, vol: 0.4, bright: 0.4, at: 0.42 }),
    pluck({ f: note('E4'), dur: 0.6, vol: 0.36, bright: 0.4, at: 0.58 }),
    pluck({ f: note('G4'), dur: 0.9, vol: 0.4, bright: 0.42, at: 0.74 }),
  ]), { lpHz: 5000, echo: { delayMs: 160, feedback: 0.35, lpHz: 3800, mix: 0.22, tail: 0.7 }, reverb: { seconds: 1.3, wet: 0.18 }, drive: 1.05 }),
};

// Four footstep variants — soft muffled falls on packed soil, close-mic'd and DRY
// (Souls keeps movement understated; variety comes from rotation + runtime jitter).
for (let v = 0; v < 4; v++) {
  const f = 130 + v * 14;
  sounds[`footstep-${v}`] = () => finalize(mixAt([
    noise({ type: 'lowpass', f0: f, f1: f * 0.7, q: 0.9, dur: 0.06 + v * 0.004, vol: 0.7, attack: 0.004, curve: 5.5 }),
    noise({ type: 'bandpass', f0: 750 + v * 90, q: 2, dur: 0.008, vol: 0.05 + (v % 2) * 0.02, at: 0.004 }),
  ]), { lpHz: 3000, drive: 1.0, peakTo: 0.75 });
}

// Optional CLI filter: `node tools/gen-sfx.mjs coin heart` regenerates only the
// named sounds. Handy because every sound uses Math.random(), so a full run rewrites all
// the .wav files (perceptually identical, but noisy in git) — pass names to touch just those.
const only = process.argv.slice(2);
const selected = only.length ? Object.entries(sounds).filter(([n]) => only.includes(n)) : Object.entries(sounds);

fs.mkdirSync(OUT, { recursive: true });
for (const [name, gen] of selected) {
  const samples = gen();
  const wav = toWav(samples);
  fs.writeFileSync(path.join(OUT, `${name}.wav`), wav);
  console.log(`${name.padEnd(16)} ${(samples.length / SR).toFixed(2)}s  ${(wav.length / 1024).toFixed(1)}KB`);
}
console.log(`\nWrote ${selected.length} .wav file(s) to ${OUT}`);

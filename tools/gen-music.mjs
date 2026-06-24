// Generates an original, HIGH-QUALITY dark-fantasy music loop as music.wav (stereo).
//
// Still chiptune-rooted, but rendered with real synthesis/production: band-limited
// (anti-aliased) oscillators, a resonant state-variable filter with LFO sweeps, stereo
// unison/detune for a lush choir/strings bed, a deep sine sub, a stereo Freeverb hall, and
// a master chain (DC-block + soft saturation + normalize). The piece is ORIGINAL — a slow
// D-Phrygian dirge written to evoke a Souls-like mood, not to copy any existing music.
//
//   node tools/gen-music.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const BPM = 60;
const SPB = 60 / BPM;
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'audio');

// ── note name -> frequency (sharps and flats) ─────────────────────────────
const SEMI = {
  C: -9, 'C#': -8, Db: -8, D: -7, 'D#': -6, Eb: -6, E: -5, F: -4, 'F#': -3, Gb: -3,
  G: -2, 'G#': -1, Ab: -1, A: 0, 'A#': 1, Bb: 1, B: 2,
};
const freq = (name) => {
  const m = /^([A-G][#b]?)(\d)$/.exec(name);
  return 440 * Math.pow(2, (SEMI[m[1]] + (Number(m[2]) - 4) * 12) / 12);
};

// ── DSP primitives ─────────────────────────────────────────────────────────
// PolyBLEP band-limiting for an anti-aliased sawtooth.
function polyBlep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
const blSaw = (phase, dt) => (2 * phase - 1) - polyBlep(phase, dt);

// Topology-preserving state-variable low-pass filter (per-sample coefficients allow sweeps).
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
    return v2;
  };
}

const stereo = (n) => ({ L: new Float32Array(n), R: new Float32Array(n) });

// Stereo Freeverb (Schroeder/Moorer comb+allpass bank) — a long, dark hall.
function makeFreeverb(roomsize, damp) {
  const combTun = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const apTun = [556, 441, 341, 225];
  const spread = 23;
  const feedback = roomsize * 0.28 + 0.7;
  const damp1 = damp * 0.4;
  const damp2 = 1 - damp1;
  const mkComb = (size) => ({ buf: new Float32Array(size), i: 0, fs: 0 });
  const mkAp = (size) => ({ buf: new Float32Array(size), i: 0 });
  const combsL = combTun.map(mkComb), combsR = combTun.map((t) => mkComb(t + spread));
  const apsL = apTun.map(mkAp), apsR = apTun.map((t) => mkAp(t + spread));
  const comb = (c, x) => { const o = c.buf[c.i]; c.fs = o * damp2 + c.fs * damp1; c.buf[c.i] = x + c.fs * feedback; if (++c.i >= c.buf.length) c.i = 0; return o; };
  const ap = (a, x) => { const bo = a.buf[a.i]; const o = -x + bo; a.buf[a.i] = x + bo * 0.5; if (++a.i >= a.buf.length) a.i = 0; return o; };
  return (inL, inR) => {
    const n = inL.length;
    const out = stereo(n);
    const gain = 0.015;
    for (let s = 0; s < n; s++) {
      const input = (inL[s] + inR[s]) * gain;
      let l = 0, r = 0;
      for (const c of combsL) l += comb(c, input);
      for (const c of combsR) r += comb(c, input);
      for (const a of apsL) l = ap(a, l);
      for (const a of apsR) r = ap(a, r);
      out.L[s] = l; out.R[s] = r;
    }
    return out;
  };
}

// ── instrument renderer (unison + detune + stereo spread + filter) ────────
function renderInstrument(events, total, opts) {
  const o = {
    wave: 'saw', unison: 1, detune: 0, spread: 0, vol: 0.4,
    attack: 0.02, decay: 0.1, sustain: 0.85, release: 0.3,
    vibRate: 0, vibDepth: 0, vibDelay: 0,
    cutoff: 20000, resonance: 0.7, lfoRate: 0, lfoDepth: 0, pan: 0,
    swellRate: 0, swellDepth: 0, ...opts,
  };
  const L = new Float32Array(total);
  const R = new Float32Array(total);
  const U = o.unison;
  const detV = new Float32Array(U);
  const panL = new Float32Array(U);
  const panR = new Float32Array(U);
  for (let v = 0; v < U; v++) {
    const d = U === 1 ? 0 : ((v / (U - 1)) - 0.5) * 2;
    detV[v] = Math.pow(2, (d * o.detune) / 1200);
    const pan = Math.max(-1, Math.min(1, o.pan + d * o.spread));
    const a = (pan + 1) * 0.25 * Math.PI;
    panL[v] = Math.cos(a);
    panR[v] = Math.sin(a);
  }
  const norm = o.vol / Math.sqrt(U);

  for (const ev of events) {
    if (!ev.freq) continue;
    const start = Math.floor(ev.t * SR);
    const len = Math.floor(ev.dur * SR);
    const aS = o.attack * SR, dS = o.decay * SR, rS = o.release * SR;
    const phase = new Float32Array(U);
    for (let v = 0; v < U; v++) phase[v] = (v * 0.61803) % 1; // de-correlate voice phases

    for (let i = 0; i < len; i++) {
      const gi = start + i;
      if (gi >= total) break;
      const tt = i / SR;

      let env;
      if (i < aS) env = i / aS;
      else if (i < aS + dS) env = 1 - (1 - o.sustain) * ((i - aS) / dS);
      else if (i > len - rS) env = o.sustain * Math.max(0, (len - i) / rS);
      else env = o.sustain;
      if (o.swellDepth > 0) env *= 1 - o.swellDepth * (0.5 - 0.5 * Math.cos(2 * Math.PI * o.swellRate * tt));

      let vib = 1;
      if (o.vibDepth > 0) {
        const vamp = o.vibDelay > 0 ? Math.min(1, tt / o.vibDelay) : 1;
        vib = 1 + Math.sin(2 * Math.PI * o.vibRate * tt) * o.vibDepth * vamp;
      }

      let sL = 0, sR = 0;
      for (let v = 0; v < U; v++) {
        const f = ev.freq * detV[v] * vib;
        const dt = f / SR;
        phase[v] += dt;
        if (phase[v] >= 1) phase[v] -= 1;
        let s;
        if (o.wave === 'sine') s = Math.sin(2 * Math.PI * phase[v]);
        else if (o.wave === 'triangle') s = 2 * Math.abs(2 * phase[v] - 1) - 1;
        else s = blSaw(phase[v], dt);
        sL += s * panL[v];
        sR += s * panR[v];
      }
      L[gi] += sL * env * norm;
      R[gi] += sR * env * norm;
    }
  }

  if (o.cutoff < 18000) {
    const fL = makeSVF(), fR = makeSVF();
    for (let i = 0; i < total; i++) {
      const lfo = o.lfoDepth > 0 ? (1 + o.lfoDepth * Math.sin(2 * Math.PI * o.lfoRate * (i / SR))) : 1;
      const cut = Math.max(80, o.cutoff * lfo);
      L[i] = fL(L[i], cut, o.resonance);
      R[i] = fR(R[i], cut, o.resonance);
    }
  }
  return { L, R };
}

// Deep, soft funeral drum (kick) rendered to stereo center.
function renderDrums(hits, total) {
  const out = stereo(total);
  for (const h of hits) {
    const start = Math.floor(h.t * SR);
    const len = Math.floor(0.5 * SR);
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const gi = start + i; if (gi >= total) break;
      const t = i / SR;
      const f = 38 + 70 * Math.exp(-t * 18);
      ph += f / SR; if (ph >= 1) ph -= 1;
      const body = Math.sin(2 * Math.PI * ph);
      const click = i < 0.006 * SR ? (Math.sin(i * 0.7) * 0.3) : 0;
      const s = (body + click) * (h.vol ?? 0.4) * Math.exp(-t * 6.5);
      out.L[gi] += s; out.R[gi] += s;
    }
  }
  return out;
}

// ── the composition (original, D Phrygian, 12 bars, very slow & funereal) ──
const CHORDS = {
  Dm: ['D', 'F', 'A'], Eb: ['Eb', 'G', 'Bb'], Bb: ['Bb', 'D', 'F'], Gm: ['G', 'Bb', 'D'], A: ['A', 'C#', 'E'],
};
const PROG = ['Dm', 'Eb', 'Dm', 'Bb', 'Gm', 'Dm', 'Eb', 'A', 'Dm', 'Bb', 'Gm', 'A'];

const LEAD_BARS = [
  [['A4', 3], [null, 1]],            // 1  Dm
  [['Bb4', 2], ['G4', 2]],           // 2  Eb
  [['F4', 2], [null, 2]],            // 3  Dm
  [['D4', 3], [null, 1]],            // 4  Bb
  [['Bb4', 2], ['A4', 2]],           // 5  Gm
  [['F4', 2], ['D4', 2]],            // 6  Dm
  [['Eb4', 3], [null, 1]],           // 7  Eb
  [['C#5', 2], ['A4', 2]],           // 8  A
  [['D4', 4]],                       // 9  Dm
  [['F4', 2], ['D4', 2]],            // 10 Bb
  [['G4', 2], ['Bb4', 2]],           // 11 Gm
  [['A4', 2], [null, 2]],            // 12 A
];

const leadEvents = [];
let beat = 0;
for (const bar of LEAD_BARS) {
  for (const [name, b] of bar) {
    if (name) leadEvents.push({ t: beat * SPB, dur: b * SPB * 0.98, freq: freq(name) });
    beat += b;
  }
}
const TOTAL_BEATS = beat;
const total = Math.ceil((TOTAL_BEATS * SPB + 3.5) * SR); // tail room for the reverb

const barEvents = (octave, pick) => {
  const evs = [];
  PROG.forEach((ch, bar) => {
    for (const n of pick(CHORDS[ch])) {
      evs.push({ t: bar * 4 * SPB, dur: 4 * SPB * 0.99, freq: freq(`${n}${octave}`) });
    }
  });
  return evs;
};

const subEvents = [];
for (let bar = 0; bar < TOTAL_BEATS / 4; bar++) subEvents.push({ t: bar * 4 * SPB, dur: 4 * SPB * 0.99, freq: freq('D1') });
const bassEvents = barEvents(2, (c) => [c[0]]);          // chord root
const choirEvents = barEvents(3, (c) => c);              // full triad
const drumHits = [];
for (let bar = 0; bar < TOTAL_BEATS / 4; bar++) drumHits.push({ t: bar * 4 * SPB, vol: 0.5 });

// ── render instruments ──────────────────────────────────────────────────
const sub = renderInstrument(subEvents, total, { wave: 'sine', vol: 0.55, attack: 0.4, decay: 0.2, sustain: 0.96, release: 0.8 });
const bass = renderInstrument(bassEvents, total, { wave: 'saw', unison: 2, detune: 10, vol: 0.3, attack: 0.06, decay: 0.2, sustain: 0.9, release: 0.5, cutoff: 360, resonance: 1.0 });
const choir = renderInstrument(choirEvents, total, {
  wave: 'saw', unison: 7, detune: 16, spread: 0.75, vol: 0.16,
  attack: 0.7, decay: 0.5, sustain: 0.9, release: 1.6,
  vibRate: 4.6, vibDepth: 0.005, vibDelay: 0.7,
  cutoff: 1500, resonance: 0.8, lfoRate: 0.05, lfoDepth: 0.45, swellRate: 0.07, swellDepth: 0.28,
});
const lead = renderInstrument(leadEvents, total, {
  wave: 'saw', unison: 2, detune: 8, spread: 0.18, vol: 0.28,
  attack: 0.05, decay: 0.18, sustain: 0.8, release: 0.6,
  vibRate: 5.0, vibDepth: 0.013, vibDelay: 0.3, cutoff: 2300, resonance: 1.1,
});
const drums = renderDrums(drumHits, total);

// ── mix: dry bus + reverb send -> Freeverb -> master ──────────────────────
const tracks = [
  { buf: sub, send: 0.05 },
  { buf: bass, send: 0.12 },
  { buf: choir, send: 0.6 },
  { buf: lead, send: 0.45 },
  { buf: drums, send: 0.25 },
];
const dryL = new Float32Array(total), dryR = new Float32Array(total);
const sendL = new Float32Array(total), sendR = new Float32Array(total);
for (const t of tracks) {
  for (let i = 0; i < total; i++) {
    dryL[i] += t.buf.L[i]; dryR[i] += t.buf.R[i];
    sendL[i] += t.buf.L[i] * t.send; sendR[i] += t.buf.R[i] * t.send;
  }
}
const wet = makeFreeverb(0.92, 0.32)(sendL, sendR);
const WET = 1.1;

// Master: mix + DC-block high-pass + soft saturation.
const mixL = new Float32Array(total), mixR = new Float32Array(total);
let hxL = 0, hyL = 0, hxR = 0, hyR = 0;
for (let i = 0; i < total; i++) {
  let l = dryL[i] + wet.L[i] * WET;
  let r = dryR[i] + wet.R[i] * WET;
  hyL = 0.9985 * (hyL + l - hxL); hxL = l; l = hyL;
  hyR = 0.9985 * (hyR + r - hxR); hxR = r; r = hyR;
  mixL[i] = l; mixR[i] = r;
}
let peak = 0;
for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(mixL[i]), Math.abs(mixR[i]));
const g = 1.0 / (peak || 1);
for (let i = 0; i < total; i++) {
  mixL[i] = Math.tanh(mixL[i] * g * 1.3);
  mixR[i] = Math.tanh(mixR[i] * g * 1.3);
}

// Seamless loop: fold the reverb/release tail (everything past the loop length) back onto
// the start, so the hall tail of one pass flows into the next with no gap or click.
const loopLen = Math.round(TOTAL_BEATS * SPB * SR);
const tailLen = total - loopLen;
const outL = new Float32Array(loopLen), outR = new Float32Array(loopLen);
let sumSq = 0;
for (let i = 0; i < loopLen; i++) {
  const l = mixL[i] + (i < tailLen ? mixL[i + loopLen] : 0);
  const r = mixR[i] + (i < tailLen ? mixR[i + loopLen] : 0);
  outL[i] = l; outR[i] = r;
  sumSq += l * l + r * r;
}
let post = 0;
for (let i = 0; i < loopLen; i++) post = Math.max(post, Math.abs(outL[i]), Math.abs(outR[i]));
const ng = 0.95 / (post || 1);

// ── write stereo 16-bit WAV ───────────────────────────────────────────────
const buf = Buffer.alloc(44 + loopLen * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + loopLen * 4, 4); buf.write('WAVE', 8);
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(loopLen * 4, 40);
for (let i = 0; i < loopLen; i++) {
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, outL[i] * ng)) * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, outR[i] * ng)) * 32767), 44 + i * 4 + 2);
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'music.wav'), buf);

const rms = Math.sqrt(sumSq / (loopLen * 2));
console.log(`music.wav  ${(loopLen / SR).toFixed(1)}s stereo (seamless)  ${(buf.length / 1024 / 1024).toFixed(2)}MB  rms=${rms.toFixed(3)}  (${BPM} BPM, ${TOTAL_BEATS / 4} bars, D Phrygian, reverb+choir)`);

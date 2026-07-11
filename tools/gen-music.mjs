// Generates the game's ORIGINAL dark-fantasy soundtrack — "Dark Souls mood on SNES
// hardware". Four stereo loops rendered offline to public/assets/audio/:
//
//   music-title.wav      Firelink-like: sparse harp, pp choir, church bell. A minor, 52 BPM.
//   music-overworld.wav  exploration dirge: E-aeolian w/ phrygian borrowings, 64 BPM,
//                        long silences over an E pedal drone (Souls exploration is QUIET).
//   music-danger.wav     combat: E phrygian ostinato, timpani gallop, tritone stab. 150 BPM.
//   ambience-wind.wav    tonal-free wind bed that always plays under the world.
//
// The SNES character comes from the render chain, not from lo-fi shortcuts:
//   - 32 000 Hz output (the S-SMP's native rate)
//   - a hardware-style echo bus: delay in ~16 ms steps, low-passed feedback loop
//     (the S-DSP's FIR), per-instrument echo sends (like per-voice EON flags)
//   - a master low-pass ~7.6 kHz emulating the chip's gaussian interpolation roll-off
//   - few, economical voices (the 8-voice aesthetic)
// The Souls weight comes from the writing (modes, drones, minor 2nds, unresolved V)
// and a dark Freeverb hall used sparingly as a send.
//
//   node tools/gen-music.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 32000;
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'audio');

// ── note name -> frequency ─────────────────────────────────────────────────
const SEMI = {
  C: -9, 'C#': -8, Db: -8, D: -7, 'D#': -6, Eb: -6, E: -5, F: -4, 'F#': -3, Gb: -3,
  G: -2, 'G#': -1, Ab: -1, A: 0, 'A#': 1, Bb: 1, B: 2,
};
const freq = (name) => {
  const m = /^([A-G][#b]?)(\d)$/.exec(name);
  return 440 * Math.pow(2, (SEMI[m[1]] + (Number(m[2]) - 4) * 12) / 12);
};

// ── DSP primitives ─────────────────────────────────────────────────────────
function polyBlep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
const blSaw = (phase, dt) => (2 * phase - 1) - polyBlep(phase, dt);

// Topology-preserving state-variable low-pass (per-sample coefficients allow sweeps).
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

// Stereo Freeverb — the dark hall, used as a SEND (Souls space on top of the SNES echo).
function makeFreeverb(roomsize, damp) {
  const combTun = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((t) => Math.round(t * SR / 44100));
  const apTun = [556, 441, 341, 225].map((t) => Math.round(t * SR / 44100));
  const spread = Math.round(23 * SR / 44100);
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

// SNES-style echo bus: a single delay whose FEEDBACK path is low-passed (the S-DSP runs an
// FIR filter inside the echo loop — that dark, blooming repeat is THE SNES reverb sound).
// Returns the wet-only signal. delayMs should sit on ~16 ms steps (hardware granularity).
function snesEcho(inL, inR, { delayMs = 192, feedback = 0.38, lpHz = 4200, spreadMs = 8 }) {
  const n = inL.length;
  const out = stereo(n);
  const dl = Math.max(1, Math.round(SR * delayMs / 1000));
  const dr = dl + Math.max(0, Math.round(SR * spreadMs / 1000));
  const bufL = new Float32Array(dl), bufR = new Float32Array(dr);
  let il = 0, ir = 0, lpL = 0, lpR = 0;
  const a = 1 - Math.exp(-2 * Math.PI * lpHz / SR);
  for (let i = 0; i < n; i++) {
    const eL = bufL[il], eR = bufR[ir];
    lpL += a * ((inL[i] + eL * feedback) - lpL);
    lpR += a * ((inR[i] + eR * feedback) - lpR);
    bufL[il] = lpL; bufR[ir] = lpR;
    out.L[i] = eL; out.R[i] = eR;
    if (++il >= dl) il = 0;
    if (++ir >= dr) ir = 0;
  }
  return out;
}

// RBJ biquad low-pass, in place — the "gaussian interpolation" warmth on the master.
function biquadLP(x, fc, Q) {
  const w0 = 2 * Math.PI * fc / SR;
  const alpha = Math.sin(w0) / (2 * Q);
  const cosw = Math.cos(w0);
  const b0 = (1 - cosw) / 2, b1 = 1 - cosw, b2 = (1 - cosw) / 2;
  const a0 = 1 + alpha, a1 = -2 * cosw, a2 = 1 - alpha;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i];
    const y = (b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = xi; y2 = y1; y1 = y;
    x[i] = y;
  }
}

// ── instruments ────────────────────────────────────────────────────────────
// Sustained voice: band-limited saw / pulse / triangle / sine, unison+detune+spread,
// delayed vibrato, SVF with slow LFO — the "choir / strings / ocarina" of the set.
function renderInstrument(events, total, opts) {
  const o = {
    wave: 'saw', duty: 0.25, unison: 1, detune: 0, spread: 0, vol: 0.4,
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
    const vel = ev.vel ?? 1;
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
        else if (o.wave === 'pulse') {
          let p2 = phase[v] + o.duty;
          if (p2 >= 1) p2 -= 1;
          s = (blSaw(phase[v], dt) - blSaw(p2, dt)) * 0.7;
        } else s = blSaw(phase[v], dt);
        sL += s * panL[v];
        sR += s * panR[v];
      }
      L[gi] += sL * env * norm * vel;
      R[gi] += sR * env * norm * vel;
    }
  }

  if (o.cutoff < 15000) {
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

// Karplus-Strong plucked string — the harp. A noise burst circulating a damped delay
// line; warm, woody, and it decays like a real pluck (SNES harps were exactly this dark).
function renderPluck(events, total, opts) {
  const o = { vol: 0.4, decay: 0.9975, bright: 0.55, pan: 0, panByPitch: 0.35, ring: 1.6, ...opts };
  const out = stereo(total);
  for (const ev of events) {
    if (!ev.freq) continue;
    const start = Math.floor(ev.t * SR);
    const N = Math.max(2, Math.round(SR / ev.freq));
    const line = new Float32Array(N);
    let lp = 0;
    for (let i = 0; i < N; i++) {
      const w = Math.random() * 2 - 1;
      lp += o.bright * (w - lp);
      line[i] = lp;
    }
    const len = Math.min(total - start, Math.floor(ev.dur * o.ring * SR));
    if (len <= 0) continue;
    const vel = ev.vel ?? 1;
    // higher strings sit further right — a harpist's spread
    const pitchPan = Math.max(-1, Math.min(1, o.pan + o.panByPitch * (Math.log2(ev.freq / 220) / 2)));
    const pa = (pitchPan + 1) * 0.25 * Math.PI;
    const gL = Math.cos(pa) * o.vol * vel, gR = Math.sin(pa) * o.vol * vel;
    let idx = 0;
    const fadeS = Math.min(len, Math.floor(0.12 * SR));
    for (let i = 0; i < len; i++) {
      const cur = line[idx];
      const nxt = line[(idx + 1) % N];
      line[idx] = o.decay * 0.5 * (cur + nxt);
      idx = (idx + 1) % N;
      const fade = i > len - fadeS ? (len - i) / fadeS : 1;
      const gi = start + i;
      out.L[gi] += cur * gL * fade;
      out.R[gi] += cur * gR * fade;
    }
  }
  return out;
}

// Additive inharmonic bell — church bell (low) or small chapel bell (high). Slightly
// detuned partial pairs beat against each other, which is what makes a bell feel cast.
function renderBell(events, total, opts) {
  const o = { vol: 0.4, tau: 2.4, pan: 0, ...opts };
  const ratios = [1, 2.0, 2.4, 3.6, 4.8];
  const amps = [1, 0.55, 0.35, 0.22, 0.12];
  const out = stereo(total);
  const pa = (Math.max(-1, Math.min(1, o.pan)) + 1) * 0.25 * Math.PI;
  const gL = Math.cos(pa), gR = Math.sin(pa);
  for (const ev of events) {
    if (!ev.freq) continue;
    const start = Math.floor(ev.t * SR);
    const len = Math.min(total - start, Math.floor(ev.dur * SR));
    if (len <= 0) continue;
    const vel = ev.vel ?? 1;
    for (let k = 0; k < ratios.length; k++) {
      const f = ev.freq * ratios[k] * (1 + (k % 2 === 0 ? 1 : -1) * 0.0015);
      if (f > SR * 0.45) continue;
      const tau = o.tau / (1 + 0.8 * k);
      const w = 2 * Math.PI * f / SR;
      const amp = amps[k] * o.vol * vel;
      for (let i = 0; i < len; i++) {
        const t = i / SR;
        const s = Math.sin(w * i) * Math.exp(-t / tau) * amp;
        out.L[start + i] += s * gL;
        out.R[start + i] += s * gR;
      }
    }
    // strike transient — a soft "clang" of filtered noise, 8 ms
    const strike = Math.min(len, Math.floor(0.008 * SR));
    let flt = 0;
    for (let i = 0; i < strike; i++) {
      flt += 0.4 * ((Math.random() * 2 - 1) - flt);
      const s = flt * 0.5 * o.vol * vel * (1 - i / strike);
      out.L[start + i] += s * gL;
      out.R[start + i] += s * gR;
    }
  }
  return out;
}

// Deep funeral timpani: pitch-dropping sine body + a short low-passed noise "skin".
function renderTimpani(hits, total, opts) {
  const o = { f0: 55, vol: 0.4, ...opts };
  const out = stereo(total);
  for (const h of hits) {
    const start = Math.floor(h.t * SR);
    const len = Math.min(total - start, Math.floor(0.6 * SR));
    let ph = 0, flt = 0;
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const f = o.f0 * (0.72 + 0.28 * Math.exp(-t * 14)) + 45 * Math.exp(-t * 22);
      ph += f / SR; if (ph >= 1) ph -= 1;
      const body = Math.sin(2 * Math.PI * ph);
      let skin = 0;
      if (t < 0.05) {
        flt += 0.12 * ((Math.random() * 2 - 1) - flt);
        skin = flt * 2.2 * (1 - t / 0.05);
      }
      const s = (body + skin) * (h.vol ?? o.vol) * Math.exp(-t * 6);
      out.L[start + i] += s;
      out.R[start + i] += s;
    }
  }
  return out;
}

// ── mixdown: sends -> SNES echo + Freeverb -> master (DC, LP, tanh, loop-fold) ──
function mixdown(tracks, { total, loopLen, echo, reverb, lpHz = 7600, drive = 1.25 }) {
  const dryL = new Float32Array(total), dryR = new Float32Array(total);
  const echoL = new Float32Array(total), echoR = new Float32Array(total);
  const revL = new Float32Array(total), revR = new Float32Array(total);
  for (const t of tracks) {
    const es = t.echoSend ?? 0, rs = t.revSend ?? 0;
    for (let i = 0; i < total; i++) {
      dryL[i] += t.buf.L[i]; dryR[i] += t.buf.R[i];
      if (es > 0) { echoL[i] += t.buf.L[i] * es; echoR[i] += t.buf.R[i] * es; }
      if (rs > 0) { revL[i] += t.buf.L[i] * rs; revR[i] += t.buf.R[i] * rs; }
    }
  }
  const e = snesEcho(echoL, echoR, echo);
  // a touch of the echo tail also feeds the hall, gluing both spaces together
  for (let i = 0; i < total; i++) {
    revL[i] += e.L[i] * 0.25; revR[i] += e.R[i] * 0.25;
  }
  const wet = makeFreeverb(reverb.room, reverb.damp)(revL, revR);

  const mixL = new Float32Array(total), mixR = new Float32Array(total);
  let hxL = 0, hyL = 0, hxR = 0, hyR = 0;
  for (let i = 0; i < total; i++) {
    let l = dryL[i] + e.L[i] * (echo.gain ?? 1) + wet.L[i] * reverb.gain;
    let r = dryR[i] + e.R[i] * (echo.gain ?? 1) + wet.R[i] * reverb.gain;
    hyL = 0.9985 * (hyL + l - hxL); hxL = l; l = hyL; // DC block
    hyR = 0.9985 * (hyR + r - hxR); hxR = r; r = hyR;
    mixL[i] = l; mixR[i] = r;
  }
  biquadLP(mixL, lpHz, 0.6);
  biquadLP(mixR, lpHz, 0.6);

  let peak = 0;
  for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(mixL[i]), Math.abs(mixR[i]));
  const g = 1.0 / (peak || 1);
  for (let i = 0; i < total; i++) {
    mixL[i] = Math.tanh(mixL[i] * g * drive);
    mixR[i] = Math.tanh(mixR[i] * g * drive);
  }

  // Seamless loop: fold everything past the loop point (echo/hall/release tails) back
  // onto the start so one pass flows into the next without a gap or click.
  const tailLen = total - loopLen;
  const outL = new Float32Array(loopLen), outR = new Float32Array(loopLen);
  for (let i = 0; i < loopLen; i++) {
    outL[i] = mixL[i] + (i < tailLen ? mixL[i + loopLen] : 0);
    outR[i] = mixR[i] + (i < tailLen ? mixR[i + loopLen] : 0);
  }
  let post = 0;
  for (let i = 0; i < loopLen; i++) post = Math.max(post, Math.abs(outL[i]), Math.abs(outR[i]));
  const ng = 0.95 / (post || 1);
  for (let i = 0; i < loopLen; i++) { outL[i] *= ng; outR[i] *= ng; }
  return { L: outL, R: outR };
}

function writeWav(name, L, R) {
  const n = L.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i])) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i])) * 32767), 44 + i * 4 + 2);
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log(`${name.padEnd(22)} ${(n / SR).toFixed(1)}s stereo  ${(buf.length / 1024 / 1024).toFixed(2)}MB`);
}

// ── event-building helpers ─────────────────────────────────────────────────
// tuples: [noteName|null, beats, vel?] laid out sequentially inside a bar.
function barMelody(evts, bar, tuples, spb, bpb) {
  let b = 0;
  for (const [name, beats, vel] of tuples) {
    if (name) evts.push({ t: (bar * bpb + b) * spb, dur: beats * spb * 0.97, freq: freq(name), vel });
    b += beats;
  }
}
const chordEvents = (prog, chords, spb, bpb, barsEach = 1) => {
  const evts = [];
  prog.forEach((name, i) => {
    for (const n of chords[name]) {
      evts.push({ t: i * barsEach * bpb * spb, dur: barsEach * bpb * spb * 0.99, freq: freq(n) });
    }
  });
  return evts;
};

// ═══════════════════════════════════════════════════════════════════════════
// TITLE — "Ember" · A minor, 52 BPM, 12 bars. Harp arpeggios over a pp choir,
// a church bell every 4 bars, andalusian descent Am-G-F-E; the loop rests on the
// unresolved V (E major) and falls back to Am — an eternal cycle, Firelink-style.
// ═══════════════════════════════════════════════════════════════════════════
function renderTitle() {
  const BPM = 52, SPB = 60 / BPM, BPB = 4, BARS = 12;
  const loopLen = Math.round(BARS * BPB * SPB * SR);
  const total = Math.ceil((BARS * BPB * SPB + 4.5) * SR);

  const PROG = ['Am', 'Am', 'G', 'G', 'F', 'F', 'E', 'E', 'Am', 'Am', 'F', 'E'];
  const CH = {
    Am: ['A3', 'C4', 'E4'],
    G: ['G3', 'B3', 'D4'],
    F: ['F3', 'A3', 'C4'],
    E: ['E3', 'G#3', 'B3'],
  };
  // broken-chord voicing for the harp: low root climbing to the 5th an octave up
  const ARP = {
    Am: ['A2', 'E3', 'A3', 'C4', 'E4', 'C4'],
    G: ['G2', 'D3', 'G3', 'B3', 'D4', 'B3'],
    F: ['F2', 'C3', 'F3', 'A3', 'C4', 'A3'],
    E: ['E2', 'B2', 'E3', 'G#3', 'B3', 'G#3'],
  };

  const harp = [];
  PROG.forEach((ch, bar) => {
    ARP[ch].forEach((n, k) => {
      // six 8ths then a 1-beat rest — the echo blooms into the silence
      harp.push({ t: (bar * BPB + k * 0.5) * SPB, dur: 1.1 * SPB, freq: freq(n), vel: k === 0 ? 1 : 0.8 });
    });
  });

  const lead = [];
  barMelody(lead, 4, [['C5', 3], ['B4', 1]], SPB, BPB);
  barMelody(lead, 5, [['A4', 4]], SPB, BPB);
  barMelody(lead, 6, [['G#4', 2], ['E4', 2]], SPB, BPB);
  barMelody(lead, 7, [['B4', 4]], SPB, BPB);
  barMelody(lead, 8, [['C5', 2], ['E5', 2]], SPB, BPB);
  barMelody(lead, 9, [['D5', 1], ['C5', 1], ['A4', 2]], SPB, BPB);
  barMelody(lead, 10, [['A4', 3], ['G4', 1]], SPB, BPB);
  barMelody(lead, 11, [['G#4', 4]], SPB, BPB); // hangs on the major 3rd of V

  const bells = [0, 4, 8].map((bar) => ({ t: bar * BPB * SPB, dur: 4.2, freq: freq('A2'), vel: 1 }));

  const subs = [];
  const subRegions = [[0, 6, 'A1'], [6, 8, 'E1'], [8, 10, 'A1'], [10, 11, 'F1'], [11, 12, 'E1']];
  for (const [from, to, n] of subRegions) {
    subs.push({ t: from * BPB * SPB, dur: (to - from) * BPB * SPB * 0.99, freq: freq(n) });
  }

  const tracks = [
    { buf: renderPluck(harp, total, { vol: 0.34, decay: 0.9978, bright: 0.5 }), echoSend: 0.85, revSend: 0.28 },
    { buf: renderInstrument(chordEvents(PROG, CH, SPB, BPB), total, {
        wave: 'saw', unison: 6, detune: 14, spread: 0.8, vol: 0.085,
        attack: 1.3, decay: 0.6, sustain: 0.9, release: 1.8,
        vibRate: 4.4, vibDepth: 0.004, vibDelay: 0.9,
        cutoff: 1100, resonance: 0.8, lfoRate: 0.04, lfoDepth: 0.4, swellRate: 0.06, swellDepth: 0.3,
      }), echoSend: 0.25, revSend: 0.55 },
    { buf: renderInstrument(lead, total, {
        wave: 'sine', unison: 2, detune: 6, spread: 0.1, vol: 0.16,
        attack: 0.09, decay: 0.2, sustain: 0.85, release: 0.7,
        vibRate: 5.4, vibDepth: 0.011, vibDelay: 0.35, cutoff: 3000, resonance: 0.8,
      }), echoSend: 0.7, revSend: 0.35 },
    { buf: renderBell(bells, total, { vol: 0.2, tau: 3.4, pan: -0.25 }), echoSend: 0.4, revSend: 0.45 },
    { buf: renderInstrument(subs, total, { wave: 'sine', vol: 0.42, attack: 0.6, decay: 0.3, sustain: 0.95, release: 1.2 }), echoSend: 0, revSend: 0.03 },
  ];

  const out = mixdown(tracks, {
    total, loopLen,
    echo: { delayMs: 240, feedback: 0.42, lpHz: 4000, spreadMs: 11, gain: 0.85 },
    reverb: { room: 0.94, damp: 0.4, gain: 1.15 },
    lpHz: 7400, drive: 1.15,
  });
  writeWav('music-title.wav', out.L, out.R);
}

// ═══════════════════════════════════════════════════════════════════════════
// OVERWORLD — "Ashen Fields" · E aeolian w/ phrygian borrowings, 64 BPM, 16 bars.
// Souls exploration is nearly silent: an E1 pedal the whole way, funeral timpani,
// harp fragments, choir entering mid-way, a brief ocarina lament, then the floor
// drops out to a hollow open fifth before the loop. The bII (F major) over the E
// pedal is the "something is wrong with this land" moment.
// ═══════════════════════════════════════════════════════════════════════════
function renderOverworld() {
  const BPM = 64, SPB = 60 / BPM, BPB = 4, BARS = 16;
  const loopLen = Math.round(BARS * BPB * SPB * SR);
  const total = Math.ceil((BARS * BPB * SPB + 4) * SR);

  const PROG = ['Em', 'Em', 'C', 'C', 'D', 'D', 'Em', 'Em', 'Am', 'Am', 'F', 'F', 'C', 'D', 'B5', 'B5'];
  const CH = {
    Em: ['E3', 'G3', 'B3'],
    C: ['C3', 'E3', 'G3'],
    D: ['D3', 'F#3', 'A3'],
    Am: ['A3', 'C4', 'E4'],
    F: ['F3', 'A3', 'C4'],
    B5: ['B2', 'F#3', 'B3'], // open fifth — no third, hollow
  };
  const ROOT2 = { Em: 'E2', C: 'C2', D: 'D2', Am: 'A2', F: 'F2', B5: 'B1' };

  // choir enters bar 5, leaves before the hollow ending (bars 15-16)
  const choirEvents = [];
  PROG.forEach((ch, bar) => {
    if (bar < 4 || bar >= 14) return;
    for (const n of CH[ch]) choirEvents.push({ t: bar * BPB * SPB, dur: BPB * SPB * 0.99, freq: freq(n) });
  });

  const bassEvents = [];
  PROG.forEach((ch, bar) => {
    bassEvents.push({ t: bar * BPB * SPB, dur: 2 * SPB * 0.98, freq: freq(ROOT2[ch]) });
    bassEvents.push({ t: (bar * BPB + 2) * SPB, dur: 2 * SPB * 0.98, freq: freq(ROOT2[ch]), vel: 0.8 });
  });

  // harp: sparse fragments early, fuller mid-piece, sparse again at the end
  const harp = [];
  const frag = (bar, notes) => notes.forEach(([n, beat, vel]) => {
    harp.push({ t: (bar * BPB + beat) * SPB, dur: 1.6 * SPB, freq: freq(n), vel: vel ?? 0.85 });
  });
  frag(0, [['E3', 0, 1], ['B3', 1], ['E4', 2]]);
  frag(2, [['C4', 0, 1], ['G3', 1.5], ['E4', 3]]);
  frag(4, [['D4', 0, 1], ['A3', 2]]);
  frag(6, [['E4', 0, 1], ['B3', 1], ['G3', 2.5]]);
  for (let bar = 8; bar < 12; bar++) {
    const ch = PROG[bar];
    const seq = { Am: ['A2', 'E3', 'A3', 'C4', 'E4', 'C4'], F: ['F2', 'C3', 'F3', 'A3', 'C4', 'A3'] }[ch]
      ?? ['E2', 'B2', 'E3', 'G3', 'B3', 'G3'];
    seq.forEach((n, k) => harp.push({ t: (bar * BPB + k * 0.5) * SPB, dur: 1.1 * SPB, freq: freq(n), vel: k === 0 ? 0.95 : 0.72 }));
  }
  frag(12, [['C4', 0, 0.9], ['G3', 2]]);
  frag(14, [['B3', 0, 0.9], ['F#3', 2]]);

  // ocarina lament, bars 9-14 (F natural over bars 11-12 = the phrygian chill)
  const lead = [];
  barMelody(lead, 8, [[null, 1], ['C5', 1.5], ['B4', 1.5]], SPB, BPB);
  barMelody(lead, 9, [['A4', 3], ['G4', 1]], SPB, BPB);
  barMelody(lead, 10, [['F4', 2], ['A4', 2]], SPB, BPB);
  barMelody(lead, 11, [['G4', 1], ['F4', 1], ['C5', 2]], SPB, BPB);
  barMelody(lead, 12, [['E4', 2], ['G4', 2]], SPB, BPB);
  barMelody(lead, 13, [['F#4', 3], ['A4', 1]], SPB, BPB);

  const timp = [];
  for (const bar of [0, 2, 4, 6, 8, 10, 12]) timp.push({ t: bar * BPB * SPB, vol: 0.34 });
  timp.push({ t: 14 * BPB * SPB, vol: 0.48 });
  timp.push({ t: (14 * BPB + 2) * SPB, vol: 0.38 });

  const bells = [
    { t: 0, dur: 4, freq: freq('E3'), vel: 0.9 },
    { t: 14 * BPB * SPB, dur: 4, freq: freq('E3'), vel: 1 }, // the loop toll
  ];

  const subs = [{ t: 0, dur: BARS * BPB * SPB * 0.995, freq: freq('E1') }];

  const tracks = [
    { buf: renderInstrument(subs, total, { wave: 'sine', vol: 0.5, attack: 1.2, decay: 0.4, sustain: 0.96, release: 1.5 }), echoSend: 0, revSend: 0.03 },
    { buf: renderInstrument(bassEvents, total, { wave: 'saw', unison: 2, detune: 9, vol: 0.24, attack: 0.07, decay: 0.25, sustain: 0.88, release: 0.5, cutoff: 340, resonance: 0.9 }), echoSend: 0.12, revSend: 0.1 },
    { buf: renderInstrument(choirEvents, total, {
        wave: 'saw', unison: 7, detune: 15, spread: 0.75, vol: 0.1,
        attack: 0.9, decay: 0.5, sustain: 0.9, release: 1.6,
        vibRate: 4.6, vibDepth: 0.005, vibDelay: 0.7,
        cutoff: 1350, resonance: 0.8, lfoRate: 0.05, lfoDepth: 0.42, swellRate: 0.07, swellDepth: 0.26,
      }), echoSend: 0.3, revSend: 0.4 },
    { buf: renderPluck(harp, total, { vol: 0.3, decay: 0.9972, bright: 0.48 }), echoSend: 0.9, revSend: 0.16 },
    { buf: renderInstrument(lead, total, {
        wave: 'pulse', duty: 0.27, unison: 1, vol: 0.17,
        attack: 0.05, decay: 0.15, sustain: 0.82, release: 0.5,
        vibRate: 5.2, vibDepth: 0.012, vibDelay: 0.3, cutoff: 2100, resonance: 1.0,
      }), echoSend: 0.8, revSend: 0.22 },
    { buf: renderTimpani(timp, total, { f0: 52 }), echoSend: 0.15, revSend: 0.22 },
    { buf: renderBell(bells, total, { vol: 0.17, tau: 3.0, pan: 0.2 }), echoSend: 0.5, revSend: 0.32 },
  ];

  const out = mixdown(tracks, {
    total, loopLen,
    echo: { delayMs: 192, feedback: 0.38, lpHz: 4500, spreadMs: 9, gain: 0.8 },
    reverb: { room: 0.88, damp: 0.5, gain: 0.95 },
    lpHz: 7600, drive: 1.25,
  });
  writeWav('music-overworld.wav', out.L, out.R);
}

// ═══════════════════════════════════════════════════════════════════════════
// DANGER — "The Hollowing" · E phrygian, 150 BPM, 16 bars (~25.6 s loop).
// Galloping low-string ostinato hammering the phrygian bII (E->F), timpani
// pattern, offbeat staccato stabs, a choir swell, and one Bb (tritone) bar
// right before the loop seam. Reserved for when the undead are actually out.
// ═══════════════════════════════════════════════════════════════════════════
function renderDanger() {
  const BPM = 150, SPB = 60 / BPM, BPB = 4, BARS = 16;
  const loopLen = Math.round(BARS * BPB * SPB * SR);
  const total = Math.ceil((BARS * BPB * SPB + 3) * SR);

  const PROG = ['Em', 'Em', 'F', 'F', 'Em', 'Em', 'F', 'F', 'Em', 'F', 'G', 'F', 'Em', 'Em', 'Bb', 'B5'];
  const ROOT = { Em: 'E2', F: 'F2', G: 'G2', Bb: 'Bb1', B5: 'B1' };
  const STAB = {
    Em: ['E3', 'G3', 'B3', 'E4'],
    F: ['F3', 'A3', 'C4', 'F4'],
    G: ['G3', 'B3', 'D4', 'G4'],
    Bb: ['Bb3', 'D4', 'F4', 'Bb4'],
    B5: ['B3', 'F#4', 'B4', 'F#5'],
  };

  // galloping ostinato: 8ths with octave jumps — r r R r r R r r
  const bass = [];
  PROG.forEach((ch, bar) => {
    const r = ROOT[ch];
    const up = r.replace(/\d/, (d) => String(Number(d) + 1));
    const pat = [r, r, up, r, r, up, r, r];
    pat.forEach((n, k) => {
      bass.push({ t: (bar * BPB + k * 0.5) * SPB, dur: 0.5 * SPB * 0.85, freq: freq(n), vel: k === 0 ? 1 : (k % 3 === 2 ? 0.9 : 0.72) });
    });
  });

  const timp = [];
  PROG.forEach((_, bar) => {
    const t0 = bar * BPB * SPB;
    timp.push({ t: t0, vol: 0.5 });
    timp.push({ t: t0 + 2.5 * SPB, vol: 0.34 });
    timp.push({ t: t0 + 3 * SPB, vol: 0.4 });
    if (bar >= 14) timp.push({ t: t0 + 1.5 * SPB, vol: 0.42 });
  });

  const stabs = [];
  PROG.forEach((ch, bar) => {
    const beats = bar >= 8 ? [0.5, 1.5, 3.5] : [1.5, 3.5];
    for (const b of beats) {
      for (const n of STAB[ch]) {
        stabs.push({ t: (bar * BPB + b) * SPB, dur: 0.3 * SPB, freq: freq(n), vel: b === 3.5 ? 1 : 0.8 });
      }
    }
  });

  // choir swell, bars 9-12: Em rising into F — dread cresting
  const choirEvents = [];
  for (const [bar, tones] of [[8, ['E4', 'G4', 'B4']], [10, ['F4', 'A4', 'C5']]]) {
    for (const n of tones) choirEvents.push({ t: bar * BPB * SPB, dur: 2 * BPB * SPB * 0.98, freq: freq(n) });
  }

  // fills: a falling phrygian run (bar 8) and a rising arp into the loop (bar 16)
  const lead = [];
  barMelody(lead, 7, [[null, 2], ['E5', 0.25], ['F5', 0.25], ['E5', 0.25], ['D5', 0.25], ['C5', 0.25], ['B4', 0.25], ['A4', 0.25], ['G4', 0.25]], SPB, BPB);
  barMelody(lead, 15, [[null, 2], ['B3', 0.5], ['D4', 0.5], ['F#4', 0.5], ['B4', 0.5]], SPB, BPB);

  const bells = [4, 12].map((bar) => ({ t: bar * BPB * SPB, dur: 2.5, freq: freq('E5'), vel: 0.8 }));

  const tracks = [
    { buf: renderInstrument(bass, total, { wave: 'saw', unison: 2, detune: 10, vol: 0.3, attack: 0.008, decay: 0.06, sustain: 0.7, release: 0.05, cutoff: 900, resonance: 1.1 }), echoSend: 0.1, revSend: 0.06 },
    { buf: renderTimpani(timp, total, { f0: 55 }), echoSend: 0.15, revSend: 0.16 },
    { buf: renderInstrument(stabs, total, { wave: 'saw', unison: 3, detune: 12, spread: 0.5, vol: 0.14, attack: 0.006, decay: 0.08, sustain: 0.5, release: 0.06, cutoff: 2100, resonance: 0.9 }), echoSend: 0.5, revSend: 0.14 },
    { buf: renderInstrument(choirEvents, total, {
        wave: 'saw', unison: 6, detune: 16, spread: 0.7, vol: 0.11,
        attack: 1.1, decay: 0.4, sustain: 0.95, release: 1.2,
        vibRate: 5.0, vibDepth: 0.006, vibDelay: 0.5, cutoff: 1600, resonance: 0.8,
      }), echoSend: 0.3, revSend: 0.4 },
    { buf: renderInstrument(lead, total, {
        wave: 'pulse', duty: 0.25, vol: 0.15, attack: 0.005, decay: 0.05, sustain: 0.75, release: 0.08,
        cutoff: 2600, resonance: 1.0,
      }), echoSend: 0.55, revSend: 0.12 },
    { buf: renderBell(bells, total, { vol: 0.11, tau: 1.8, pan: 0.35 }), echoSend: 0.6, revSend: 0.3 },
  ];

  const out = mixdown(tracks, {
    total, loopLen,
    echo: { delayMs: 160, feedback: 0.32, lpHz: 4200, spreadMs: 7, gain: 0.75 },
    reverb: { room: 0.8, damp: 0.55, gain: 0.8 },
    lpHz: 7800, drive: 1.35,
  });
  writeWav('music-danger.wav', out.L, out.R);
}

// ═══════════════════════════════════════════════════════════════════════════
// AMBIENCE — wind. No tonal content at all, so it can sit under any track (or
// under Souls-style silence) without ever clashing. Two decorrelated noise
// channels through slowly gusting low-pass filters; loop made seamless with an
// equal-power crossfade of the tail onto the head.
// ═══════════════════════════════════════════════════════════════════════════
function renderAmbience() {
  const LOOP_S = 20;
  const FADE_S = 1.2;
  const total = Math.ceil((LOOP_S + FADE_S) * SR);
  const loopLen = LOOP_S * SR;

  const render = (phaseA, phaseB, phaseC) => {
    const out = new Float32Array(total);
    const svf = makeSVF();
    let pink = 0;
    for (let i = 0; i < total; i++) {
      const t = i / SR;
      // gusts periodic in the loop length -> the modulation itself loops cleanly
      const g1 = Math.sin(2 * Math.PI * (1 / LOOP_S) * t + phaseA);
      const g2 = Math.sin(2 * Math.PI * (3 / LOOP_S) * t + phaseB);
      const g3 = Math.sin(2 * Math.PI * (7 / LOOP_S) * t + phaseC);
      const gust = 0.5 + 0.28 * g1 + 0.16 * g2 + 0.06 * g3;
      const w = Math.random() * 2 - 1;
      pink += 0.045 * (w - pink); // leaky integrator ≈ dark noise
      const cut = 260 + 620 * gust;
      out[i] = svf(pink * 6, cut, 0.85) * (0.45 + 0.55 * gust);
    }
    return out;
  };

  const rawL = render(0.0, 1.7, 4.1);
  const rawR = render(2.6, 0.6, 3.2);

  const fadeN = Math.floor(FADE_S * SR);
  const L = new Float32Array(loopLen), R = new Float32Array(loopLen);
  for (let i = 0; i < loopLen; i++) {
    if (i < fadeN) {
      const a = Math.sin((i / fadeN) * Math.PI / 2);
      const b = Math.cos((i / fadeN) * Math.PI / 2);
      L[i] = rawL[i] * a + rawL[loopLen + i] * b;
      R[i] = rawR[i] * a + rawR[loopLen + i] * b;
    } else {
      L[i] = rawL[i];
      R[i] = rawR[i];
    }
  }
  let peak = 0;
  for (let i = 0; i < loopLen; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const g = 0.55 / (peak || 1); // wind is a bed — leave headroom, runtime gain is low anyway
  for (let i = 0; i < loopLen; i++) { L[i] *= g; R[i] *= g; }
  writeWav('ambience-wind.wav', L, R);
}

renderTitle();
renderOverworld();
renderDanger();
renderAmbience();
console.log('\nDone. 32 kHz stereo (SNES output rate), SNES echo bus + dark hall, seamless loops.');

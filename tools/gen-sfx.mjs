// Generates 8-bit / old-console style sound effects as .wav files.
//
// Uses a faithful port of the public-domain sfxr / jsfxr synth (Tomas Pettersson) for the
// bleepy single-channel SFX, plus a tiny square/triangle "chiptune melody" synth for the
// little NES-style jingles (item get / game over / heart). Output -> public/assets/audio/.
//
//   node tools/gen-sfx.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'audio');

// ── sfxr synth (public domain algorithm) ──────────────────────────────────
const DEFAULTS = {
  wave_type: 0, // 0 square, 1 sawtooth, 2 sine, 3 noise
  p_env_attack: 0.0, p_env_sustain: 0.3, p_env_punch: 0.0, p_env_decay: 0.4,
  p_base_freq: 0.3, p_freq_limit: 0.0, p_freq_ramp: 0.0, p_freq_dramp: 0.0,
  p_vib_strength: 0.0, p_vib_speed: 0.0,
  p_arp_mod: 0.0, p_arp_speed: 0.0,
  p_duty: 0.0, p_duty_ramp: 0.0,
  p_repeat_speed: 0.0,
  p_pha_offset: 0.0, p_pha_ramp: 0.0,
  p_lpf_freq: 1.0, p_lpf_ramp: 0.0, p_lpf_resonance: 0.0,
  p_hpf_freq: 0.0, p_hpf_ramp: 0.0,
  sound_vol: 0.5,
};

function sfxr(params) {
  const p = { ...DEFAULTS, ...params };
  let fperiod, fmaxperiod, fslide, fdslide, period, square_duty, square_slide;
  let env_vol = 0, env_stage = 0, env_time = 0;
  const env_length = [0, 0, 0];
  let fphase, fdphase, iphase;
  const phaser_buffer = new Float32Array(1024);
  let ipp = 0;
  const noise_buffer = new Float32Array(32);
  let fltp = 0, fltdp = 0, fltw, fltw_d, fltdmp, fltphp = 0, flthp, flthp_d;
  let vib_phase = 0, vib_speed, vib_amp;
  let rep_time = 0, rep_limit;
  let arp_time, arp_limit, arp_mod;
  let phase = 0;

  const resetFreq = () => {
    fperiod = 100.0 / (p.p_base_freq * p.p_base_freq + 0.001);
    period = Math.floor(fperiod);
    fmaxperiod = 100.0 / (p.p_freq_limit * p.p_freq_limit + 0.001);
    fslide = 1.0 - Math.pow(p.p_freq_ramp, 3) * 0.01;
    fdslide = -Math.pow(p.p_freq_dramp, 3) * 0.000001;
    square_duty = 0.5 - p.p_duty * 0.5;
    square_slide = -p.p_duty_ramp * 0.00005;
    arp_mod = p.p_arp_mod >= 0 ? 1.0 - Math.pow(p.p_arp_mod, 2) * 0.9 : 1.0 + Math.pow(p.p_arp_mod, 2) * 10.0;
    arp_time = 0;
    arp_limit = Math.floor(Math.pow(1.0 - p.p_arp_speed, 2) * 20000 + 32);
    if (p.p_arp_speed === 1.0) arp_limit = 0;
  };

  resetFreq();
  fltw = Math.pow(p.p_lpf_freq, 3) * 0.1;
  fltw_d = 1.0 + p.p_lpf_ramp * 0.0001;
  fltdmp = Math.min(0.8, 5.0 / (1.0 + Math.pow(p.p_lpf_resonance, 2) * 20.0) * (0.01 + fltw));
  flthp = Math.pow(p.p_hpf_freq, 2) * 0.1;
  flthp_d = 1.0 + p.p_hpf_ramp * 0.0003;
  vib_speed = Math.pow(p.p_vib_speed, 2) * 0.01;
  vib_amp = p.p_vib_strength * 0.5;
  env_length[0] = Math.floor(p.p_env_attack * p.p_env_attack * 100000);
  env_length[1] = Math.floor(p.p_env_sustain * p.p_env_sustain * 100000);
  env_length[2] = Math.floor(p.p_env_decay * p.p_env_decay * 100000);
  fphase = Math.pow(p.p_pha_offset, 2) * 1020.0; if (p.p_pha_offset < 0) fphase = -fphase;
  fdphase = Math.pow(p.p_pha_ramp, 2) * 1.0; if (p.p_pha_ramp < 0) fdphase = -fdphase;
  iphase = Math.abs(Math.floor(fphase));
  for (let i = 0; i < 32; i++) noise_buffer[i] = Math.random() * 2 - 1;
  rep_limit = Math.floor(Math.pow(1.0 - p.p_repeat_speed, 2) * 20000 + 32);
  if (p.p_repeat_speed === 0) rep_limit = 0;

  const out = [];
  const MAX = SR * 6;
  let finished = false;
  while (!finished && out.length < MAX) {
    rep_time++;
    if (rep_limit !== 0 && rep_time >= rep_limit) { rep_time = 0; resetFreq(); }
    arp_time++;
    if (arp_limit !== 0 && arp_time >= arp_limit) { arp_limit = 0; fperiod *= arp_mod; }
    fslide += fdslide;
    fperiod *= fslide;
    if (fperiod > fmaxperiod) { fperiod = fmaxperiod; if (p.p_freq_limit > 0) finished = true; }
    let rfperiod = fperiod;
    if (vib_amp > 0) { vib_phase += vib_speed; rfperiod = fperiod * (1.0 + Math.sin(vib_phase) * vib_amp); }
    period = Math.max(8, Math.floor(rfperiod));
    square_duty = Math.max(0, Math.min(0.5, square_duty + square_slide));
    env_time++;
    if (env_time > env_length[env_stage]) { env_time = 0; if (++env_stage === 3) break; }
    if (env_stage === 0) env_vol = env_length[0] ? env_time / env_length[0] : 1;
    else if (env_stage === 1) env_vol = 1.0 + (1.0 - (env_length[1] ? env_time / env_length[1] : 1)) * 2.0 * p.p_env_punch;
    else env_vol = env_length[2] ? 1.0 - env_time / env_length[2] : 0;

    fphase += fdphase;
    iphase = Math.min(1023, Math.abs(Math.floor(fphase)));
    if (flthp_d !== 0) flthp = Math.max(0.00001, Math.min(0.1, flthp * flthp_d));

    let ssample = 0;
    for (let si = 0; si < 8; si++) {
      phase++;
      if (phase >= period) {
        phase %= period;
        if (p.wave_type === 3) for (let i = 0; i < 32; i++) noise_buffer[i] = Math.random() * 2 - 1;
      }
      const fp = phase / period;
      let sample;
      switch (p.wave_type) {
        case 1: sample = 1.0 - fp * 2; break;
        case 2: sample = Math.sin(fp * 2 * Math.PI); break;
        case 3: sample = noise_buffer[Math.floor(phase * 32 / period)] ?? 0; break;
        default: sample = fp < square_duty ? 0.5 : -0.5; break;
      }
      const pp = fltp;
      fltw = Math.max(0, Math.min(0.1, fltw * fltw_d));
      if (p.p_lpf_freq !== 1.0) { fltdp += (sample - fltp) * fltw; fltdp -= fltdp * fltdmp; } else { fltp = sample; fltdp = 0; }
      fltp += fltdp;
      fltphp += fltp - pp;
      fltphp -= fltphp * flthp;
      sample = fltphp;
      phaser_buffer[ipp & 1023] = sample;
      sample += phaser_buffer[(ipp - iphase + 1024) & 1023];
      ipp = (ipp + 1) & 1023;
      ssample += sample * env_vol;
    }
    ssample = (ssample / 8) * 2.0 * p.sound_vol;
    out.push(Math.max(-1, Math.min(1, ssample)));
  }
  return Float32Array.from(out);
}

// ── chiptune melody synth (for little NES-style jingles) ──────────────────
const N = {
  A2: 110.0, B2: 123.47,
  C3: 130.81, D3: 146.83, E3: 164.81, F3: 174.61, G3: 196.0, A3: 220.0, B3: 246.94,
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0, B5: 987.77,
  C6: 1046.5, E6: 1318.51,
};

// `lp` (0..1) = one-pole low-pass amount (lower = warmer/darker, 1 = open). `sub` (0..1) mixes
// in an octave-down sine for weight. Together they turn bright chiptune bleeps into deep,
// serious tones.
function note(freq, dur, { wave = 'square', duty = 0.5, vol = 0.5, attack = 0.004, release = 0.03, lp = 1, sub = 0 } = {}) {
  const n = Math.floor(dur * SR);
  const buf = new Float32Array(n);
  const period = SR / freq;
  const subPeriod = SR / (freq / 2);
  const a = attack * SR, r = release * SR;
  const coef = lp >= 1 ? 1 : Math.max(0.002, lp);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const ph = (i % period) / period;
    let s;
    if (wave === 'triangle') s = 2 * Math.abs(2 * ph - 1) - 1;
    else if (wave === 'saw') s = 1 - 2 * ph;
    else if (wave === 'sine') s = Math.sin(ph * 2 * Math.PI);
    else s = ph < duty ? 0.5 : -0.5;
    if (sub > 0) {
      const sp = (i % subPeriod) / subPeriod;
      s = s * (1 - sub) + Math.sin(sp * 2 * Math.PI) * sub;
    }
    prev += coef * (s - prev); // one-pole low-pass
    s = prev;
    let amp = 1;
    if (i < a) amp = i / a;
    else if (i > n - r) amp = Math.max(0, (n - i) / r);
    buf[i] = s * vol * amp;
  }
  return buf;
}

function melody(notes, opts = {}) {
  const parts = notes.map((nn) => note(nn.f, nn.d, { ...opts, ...nn }));
  const total = parts.reduce((s, pt) => s + pt.length, 0);
  const out = new Float32Array(total);
  let o = 0;
  for (const part of parts) { out.set(part, o); o += part.length; }
  return out;
}

// ── normalize + WAV ───────────────────────────────────────────────────────
function normalize(samples, target = 0.9) {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  if (peak === 0) return samples;
  const g = target / peak;
  for (let i = 0; i < samples.length; i++) samples[i] *= g;
  return samples;
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

// ── the sound set (dark, weighty, serious-RPG / Dark-Souls flavored) ───────
// Design: low fundamentals, muffled low-pass (no bright highs), minor / neutral
// power-interval motifs (root-fifth-octave, never a cheerful major arpeggio), longer
// weightier decays. Nothing bleepy or triumphant.
const sounds = {
  // Muted, low "soul" tick — a soft muffled sine, not a bright coin jingle.
  'coin': () => sfxr({ wave_type: 2, p_base_freq: 0.30, p_freq_ramp: -0.05, p_env_sustain: 0.05, p_env_punch: 0.2, p_env_decay: 0.22, p_lpf_freq: 0.5 }),
  // Heavy, low air-cut — a weighty whoosh, not a hissy swish.
  'sword-slash': () => sfxr({ wave_type: 3, p_base_freq: 0.34, p_freq_ramp: -0.30, p_env_sustain: 0.05, p_env_decay: 0.22, p_hpf_freq: 0.10, p_lpf_freq: 0.45 }),
  // Meaty downward thud — the blade bites, low and punchy.
  'enemy-hit': () => sfxr({ wave_type: 1, p_base_freq: 0.30, p_freq_ramp: -0.50, p_env_sustain: 0.02, p_env_decay: 0.17, p_env_punch: 0.5, p_lpf_freq: 0.55 }),
  // Low, muffled collapse — an enemy falls.
  'enemy-death': () => sfxr({ wave_type: 3, p_base_freq: 0.30, p_freq_ramp: -0.26, p_env_sustain: 0.14, p_env_decay: 0.40, p_env_punch: 0.25, p_lpf_freq: 0.38 }),
  // Low pained grunt — took damage.
  'hurt': () => sfxr({ wave_type: 1, p_base_freq: 0.22, p_freq_ramp: -0.24, p_env_sustain: 0.08, p_env_decay: 0.26, p_lpf_freq: 0.50 }),
  // Warm, subdued heal — a low minor-third swell, not a rising jingle.
  'heart': () => melody([{ f: N.A3, d: 0.14 }, { f: N.C4, d: 0.34 }], { wave: 'triangle', sub: 0.5, lp: 0.25, vol: 0.5, release: 0.08 }),
  // Solemn, epic sword-get — root/fifth/octave (no third), low and weighty.
  'sword-pickup': () => melody([{ f: N.A2, d: 0.22 }, { f: N.E3, d: 0.20 }, { f: N.A3, d: 0.62 }], { wave: 'saw', sub: 0.55, lp: 0.22, vol: 0.5, release: 0.10 }),
  // Slow, dark descending minor — you died.
  'game-over': () => melody([{ f: N.A3, d: 0.24 }, { f: N.E3, d: 0.24 }, { f: N.C3, d: 0.24 }, { f: N.A2, d: 0.80 }], { wave: 'triangle', sub: 0.5, lp: 0.22, vol: 0.5, release: 0.12 }),
  // Low, muted menu tones (down = open, up = close), subdued.
  'shop-open': () => melody([{ f: N.G3, d: 0.07 }, { f: N.C3, d: 0.16 }], { wave: 'sine', lp: 0.4, vol: 0.45 }),
  'shop-close': () => melody([{ f: N.C3, d: 0.07 }, { f: N.G3, d: 0.16 }], { wave: 'sine', lp: 0.4, vol: 0.45 }),
  // Deep, muffled roar rising — the sword catches fire.
  'ignite': () => sfxr({ wave_type: 3, p_base_freq: 0.15, p_freq_ramp: 0.09, p_env_attack: 0.04, p_env_sustain: 0.14, p_env_decay: 0.42, p_lpf_freq: 0.32, p_lpf_ramp: 0.08 }),
};

fs.mkdirSync(OUT, { recursive: true });
for (const [name, gen] of Object.entries(sounds)) {
  const samples = normalize(gen(), 0.92);
  const wav = toWav(samples);
  fs.writeFileSync(path.join(OUT, `${name}.wav`), wav);
  console.log(`${name.padEnd(14)} ${(samples.length / SR).toFixed(2)}s  ${(wav.length / 1024).toFixed(1)}KB`);
}
console.log(`\nWrote ${Object.keys(sounds).length} .wav files to ${OUT}`);

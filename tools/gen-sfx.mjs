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
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0, B5: 987.77,
  C6: 1046.5, E6: 1318.51,
};

function note(freq, dur, { wave = 'square', duty = 0.5, vol = 0.5, attack = 0.004, release = 0.03 } = {}) {
  const n = Math.floor(dur * SR);
  const buf = new Float32Array(n);
  const period = SR / freq;
  const a = attack * SR, r = release * SR;
  for (let i = 0; i < n; i++) {
    const ph = (i % period) / period;
    let s;
    if (wave === 'triangle') s = 2 * Math.abs(2 * ph - 1) - 1;
    else if (wave === 'saw') s = 1 - 2 * ph;
    else if (wave === 'sine') s = Math.sin(ph * 2 * Math.PI);
    else s = ph < duty ? 0.5 : -0.5;
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

// ── the sound set (8-bit, fantasy/Zelda/RPG flavored) ─────────────────────
const sounds = {
  // Classic ascending two-tone coin blip (the arp must fire before the envelope ends).
  'coin': () => sfxr({ wave_type: 0, p_base_freq: 0.52, p_env_sustain: 0.08, p_env_punch: 0.5, p_env_decay: 0.22, p_arp_mod: 0.45, p_arp_speed: 0.68, p_duty: 0.35 }),
  // Short noise "swish" sweeping down — a sword cutting air.
  'sword-slash': () => sfxr({ wave_type: 3, p_base_freq: 0.5, p_freq_ramp: -0.38, p_env_sustain: 0.05, p_env_decay: 0.22, p_hpf_freq: 0.3 }),
  // Square zap down — blade connects.
  'enemy-hit': () => sfxr({ wave_type: 0, p_base_freq: 0.52, p_freq_ramp: -0.45, p_env_sustain: 0.03, p_env_decay: 0.18, p_env_punch: 0.35, p_duty: 0.45 }),
  // Noisy little explosion/poof — enemy defeated.
  'enemy-death': () => sfxr({ wave_type: 3, p_base_freq: 0.42, p_freq_ramp: -0.2, p_env_sustain: 0.12, p_env_decay: 0.32, p_env_punch: 0.3 }),
  // Harsh descending square with a duty sweep — took damage.
  'hurt': () => sfxr({ wave_type: 0, p_base_freq: 0.34, p_freq_ramp: -0.3, p_env_sustain: 0.07, p_env_decay: 0.24, p_duty: 0.5, p_duty_ramp: 0.3 }),
  // Rising arpeggio jingle — picked up a heart.
  'heart': () => melody([{ f: N.C5, d: 0.085 }, { f: N.E5, d: 0.085 }, { f: N.G5, d: 0.085 }, { f: N.C6, d: 0.22 }], { wave: 'square', duty: 0.5 }),
  // Triumphant item-get fanfare — got the sword.
  'sword-pickup': () => melody([{ f: N.G4, d: 0.1 }, { f: N.C5, d: 0.1 }, { f: N.E5, d: 0.1 }, { f: N.G5, d: 0.1 }, { f: N.C6, d: 0.44 }], { wave: 'square', duty: 0.5 }),
  // Sad descending triangle jingle — game over.
  'game-over': () => melody([{ f: N.C5, d: 0.16 }, { f: N.G4, d: 0.16 }, { f: N.E4, d: 0.16 }, { f: N.C4, d: 0.5 }], { wave: 'triangle', release: 0.06 }),
  // Short up/down menu blips.
  'shop-open': () => melody([{ f: N.E5, d: 0.06 }, { f: N.A5, d: 0.12 }], { wave: 'square', duty: 0.25 }),
  'shop-close': () => melody([{ f: N.A5, d: 0.06 }, { f: N.E5, d: 0.12 }], { wave: 'square', duty: 0.25 }),
  // Rising noise whoosh with a moving low-pass — the sword catches fire.
  'ignite': () => sfxr({ wave_type: 3, p_base_freq: 0.2, p_freq_ramp: 0.14, p_env_attack: 0.03, p_env_sustain: 0.12, p_env_decay: 0.34, p_lpf_freq: 0.5, p_lpf_ramp: 0.12 }),
};

fs.mkdirSync(OUT, { recursive: true });
for (const [name, gen] of Object.entries(sounds)) {
  const samples = normalize(gen(), 0.92);
  const wav = toWav(samples);
  fs.writeFileSync(path.join(OUT, `${name}.wav`), wav);
  console.log(`${name.padEnd(14)} ${(samples.length / SR).toFixed(2)}s  ${(wav.length / 1024).toFixed(1)}KB`);
}
console.log(`\nWrote ${Object.keys(sounds).length} .wav files to ${OUT}`);

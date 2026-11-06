#!/usr/bin/env node
// A TRILHA DO VALE. Gera, por código e sem nenhuma amostra gravada, as músicas do Zero The Hero:
// seis peças inteiras para a aventura (dia, entardecer e noite), a canção de ninar do título e dos
// créditos, e as duas camadas que o lugar acende (água e fogo).
//
//   node tools/gen-cozy-music.mjs                 # tudo
//   node tools/gen-cozy-music.mjs valley-morning  # só as peças com esses nomes
//
// O QUE ORIENTA CADA ESCOLHA (pesquisa de música para relaxar e de trilha de jogo cozy):
// - BRILHO BAIXO é o que mais separa música de relaxar e dormir do resto (Kirk & Timmers, 2024, em
//   playlists do Spotify). Então nada de caixinha de música aguda: piano de feltro, violão de náilon,
//   flauta e clarinete no registro médio, um filtro escuro no fim e a melodia quase nunca acima do lá 5.
// - ANDAMENTO entre 56 e 96 BPM, pouca variação de ritmo e de dinâmica, timbres acústicos, sem bateria.
// - HARMONIA CONSONANTE e previsível: tudo diatônico em fá maior (o mesmo conjunto de sete notas), com
//   o colorido vindo do modo (jônio, mixolídio de dó, lídio de si bemol, eólio de ré, dórico de sol) e de
//   acordes com sétima maior e nona, nunca de tensão. Isso também deixa as camadas de água e fogo, que
//   só usam a pentatônica de fá, caberem em cima de qualquer peça.
// - CANSAÇO DE OUVIR vem de loop curto. Cada peça é inteira (de quase dois a três minutos e meio, com começo,
//   meio e fim), e o jogo deixa um silêncio só com o ambiente entre uma e outra (SoundManager).
// - REPETIÇÃO COM VARIAÇÃO: a melodia volta (o ouvido descansa no que conhece), mas em outro
//   instrumento, com outra companhia — forma A A B A A, com introdução e coda que desaceleram.
//
// Tudo é determinístico (gerador pseudoaleatório com semente): rodar de novo dá os mesmos arquivos.
// Os WAV saem em tools/audio-masters/ (fora do git: se regeneram daqui) e tools/encode-audio.mjs faz
// os MP3 que o jogo baixa.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'audio-masters');
const TAU = Math.PI * 2;

// ── utilidades ─────────────────────────────────────────────────────────────
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rand = rng(1);
const noise = () => rand() * 2 - 1;
const gauss = () => { let s = 0; for (let i = 0; i < 4; i++) s += rand(); return (s - 2) / 0.577; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const stereo = (n) => ({ L: new Float32Array(n), R: new Float32Array(n) });
const panGains = (p) => { const a = (clamp(p, -1, 1) + 1) * 0.25 * Math.PI; return [Math.cos(a), Math.sin(a)]; };

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function midi(name) {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`nota inválida: ${name}`);
  return PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12 * (Number(m[3]) + 1);
}
const hz = (m) => 440 * 2 ** ((m - 69) / 12);

// ── a partitura ────────────────────────────────────────────────────────────
// Uma linha de melodia é texto: `A4:1.5 C5:0.5 -:1 | ...`. `-` é pausa, `_` prolonga a nota anterior,
// `[A4,C5]` é um acorde, `!` acentua e `'` suaviza. Cada `|` confere se o compasso fechou: um erro de
// conta numa partitura escrita à mão aparece aqui, e não como uma nota fora do tempo no jogo.
class Score {
  constructor({ name, bpm, bpb }) {
    this.name = name;
    this.bpm = bpm;
    this.bpb = bpb;
    this.spb = 60 / bpm;
    this.tracks = {};
    this.rit = null;
    this.endBeat = 0;
  }

  /** Desacelera do compasso `fromBar` até o fim: o andamento cai `amount` (0.25 = 25% mais lento). */
  ritard(fromBar, toBar, amount) { this.rit = { a: fromBar * this.bpb, b: toBar * this.bpb, amount }; }

  time(beat) {
    const { spb, rit } = this;
    if (!rit || beat <= rit.a) return beat * spb;
    const len = rit.b - rit.a;
    const k = (1 / (1 - rit.amount) - 1) / len;
    const x = Math.min(beat, rit.b) - rit.a;
    let t = rit.a * spb + spb * (x + (k * x * x) / 2);
    if (beat > rit.b) t += (beat - rit.b) * spb / (1 - rit.amount);
    return t;
  }

  push(track, beat, dur, notes, vel) {
    (this.tracks[track] ||= []).push({ beat, dur, notes, vel });
    this.endBeat = Math.max(this.endBeat, beat + dur);
  }

  melody(track, bar, text, { vel = 0.75, oct = 0 } = {}) {
    let pos = 0;
    let barStart = 0;
    let barNo = 0;
    let last = null;
    for (const tok of text.trim().split(/\s+/)) {
      if (tok === '|') {
        if (Math.abs(pos - barStart - this.bpb) > 1e-6) {
          throw new Error(`${this.name}/${track}: compasso ${bar + barNo} soma ${pos - barStart}, não ${this.bpb}`);
        }
        barStart = pos;
        barNo += 1;
        continue;
      }
      const m = /^(\[[^\]]+\]|[^:]+):([\d.]+)([!']?)$/.exec(tok);
      if (!m) throw new Error(`${this.name}/${track}: token inválido "${tok}"`);
      const [, what, d, mark] = m;
      const dur = Number(d);
      if (what === '_') {
        if (last) last.dur += dur;
      } else if (what !== '-') {
        const names = what.startsWith('[') ? what.slice(1, -1).split(',') : [what];
        const v = vel * (mark === '!' ? 1.18 : mark === "'" ? 0.72 : 1);
        this.push(track, bar * this.bpb + pos, dur, names.map((n) => midi(n) + oct), v);
        last = this.tracks[track][this.tracks[track].length - 1];
      } else last = null;
      pos += dur;
    }
    if (Math.abs(pos - barStart - this.bpb) > 1e-6 && pos !== barStart) {
      throw new Error(`${this.name}/${track}: último compasso (${bar + barNo}) soma ${pos - barStart}`);
    }
    return Math.ceil(pos / this.bpb - 1e-6);
  }

  /** `Fmaj9 C/E Dm9:2 G:2` — um acorde por compasso, ou com duração em tempos. */
  progression(bar, text) {
    const out = [];
    let beat = bar * this.bpb;
    for (const tok of text.trim().split(/\s+/)) {
      if (tok === '|') continue;
      const [name, d] = tok.split(':');
      const dur = d ? Number(d) : this.bpb;
      out.push({ beat, dur, name });
      beat += dur;
    }
    return out;
  }
}

// Acompanhamentos: o mesmo gesto, acorde após acorde. `V` é o dicionário de vozes da peça
// ({ bass, up: [...] }), escrito à mão para cada acorde andar pouco até o próximo.
function voice(V, name) {
  const v = V[name];
  if (!v) throw new Error(`acorde sem vozes: ${name}`);
  return { bass: midi(v.bass), up: v.up.map(midi) };
}

function arpeggio(s, track, chords, V, { pattern, step, ring = 2.5, vel = 0.5, accent = 1.25, swing = 0 }) {
  for (const c of chords) {
    const v = voice(V, c.name);
    const notes = [v.bass, ...v.up];
    const n = Math.round(c.dur / step);
    for (let k = 0; k < n; k++) {
      const idx = pattern[k % pattern.length];
      if (idx === null || idx >= notes.length) continue;
      const off = k * step + (k % 2 === 1 ? swing * step : 0);
      const isBeat = Math.abs(off - Math.round(off)) < 1e-6 && Math.round(off) % s.bpb === 0;
      s.push(track, c.beat + off, Math.min(ring * step, c.dur - off + 0.25), [notes[idx]], vel * (isBeat ? accent : 1));
    }
  }
}

function blocks(s, track, chords, V, hits) {
  for (const c of chords) {
    const v = voice(V, c.name);
    for (const [off, dur, vel, which] of hits) {
      if (off >= c.dur) continue;
      const notes = which === 'bass' ? [v.bass] : which === 'up' ? v.up : [v.bass, ...v.up];
      s.push(track, c.beat + off, Math.min(dur, c.dur - off + 0.25), notes, vel);
    }
  }
}

function sustained(s, track, chords, V, { vel = 0.5, withBass = false } = {}) {
  for (const c of chords) {
    const v = voice(V, c.name);
    s.push(track, c.beat, c.dur, withBass ? [v.bass, ...v.up] : v.up, vel);
  }
}

function bassline(s, track, chords, V, hits) {
  for (const c of chords) {
    const v = voice(V, c.name);
    for (const [off, dur, vel, interval = 0] of hits) {
      if (off >= c.dur) continue;
      s.push(track, c.beat + off, Math.min(dur, c.dur - off), [v.bass + interval], vel);
    }
  }
}

/** Uma segunda voz que acompanha a melodia por baixo: no tempo forte, a nota do acorde logo abaixo. */
function underVoice(s, from, track, chords, V, { vel = 0.4, minGap = 3 } = {}) {
  const mel = s.tracks[from] || [];
  for (const c of chords) {
    const v = voice(V, c.name);
    const pool = [v.bass + 12, v.bass + 24, ...v.up, ...v.up.map((n) => n + 12)];
    // abaixo da nota MAIS GRAVE da melodia naquele acorde: a melodia anda, a segunda voz fica parada,
    // e nenhuma passagem dela pode encostar a um semitom da nota longa
    const inSpan = mel.filter((e) => e.beat < c.beat + c.dur - 0.01 && e.beat + e.dur > c.beat + 0.01).flatMap((e) => e.notes);
    if (!inSpan.length) continue;
    const top = Math.min(...inSpan);
    const near = (n) => [...v.up, ...inSpan].some((x) => Math.abs(x - n) === 1 || Math.abs(x - n) === 13);
    const below = pool.filter((n) => n <= top - minGap && n >= top - 9 && !near(n)).sort((a, b) => b - a)[0];
    if (below !== undefined) s.push(track, c.beat, c.dur, [below], vel);
  }
}

// ── instrumentos ───────────────────────────────────────────────────────────
// Todos recebem eventos já em segundos: { t, dur, m, vel }.

// PIANO DE FELTRO. Síntese modal: cada nota é a soma das parciais de uma corda de verdade, um pouco
// mais agudas que os harmônicos (inarmonicidade B, como no aço), cada uma decaindo mais rápido quanto
// mais aguda é. Duas cordas por nota, desafinadas por uma fração de cent: uma morre cedo (o "som
// inicial") e a outra fica (o "pós-som") — é esse decaimento em dois tempos, com o batimento entre
// elas, que faz o ouvido acreditar em piano. O feltro entre martelo e corda é um filtro escuro que
// abre um pouco com a força do toque.
function piano(events, total, o) {
  o = { vol: 0.5, pan: 0, bright: 1, release: 0.35, spread: 0.45, ...o };
  const out = stereo(total);
  for (const ev of events) {
    const f0 = hz(ev.m);
    const v = clamp(ev.vel, 0.05, 1.2);
    const B = clamp(1.1e-4 * 2 ** ((ev.m - 60) / 14), 2e-5, 2.5e-3);
    // o feltro: abre pouco com a força (tocar forte não pode virar "pim" de vidro)
    const fc = (600 + 2000 * v ** 1.5) * o.bright;
    const tau1 = clamp(5.2 * (262 / f0) ** 0.62, 1.1, 15);
    const start = Math.floor(ev.t * SR);
    const holdS = ev.dur;
    const len = Math.min(total - start, Math.floor(Math.min(holdS + o.release * 7, tau1 * 5.5) * SR));
    if (len <= 0) continue;
    const buf = new Float32Array(len);
    const attackS = Math.floor((0.004 + (1.1 - v) * 0.009) * SR);
    let norm = 0;
    for (let n = 1; n <= 40; n++) {
      const fn = n * f0 * Math.sqrt(1 + B * n * n);
      if (fn > 9500 || fn > SR * 0.45) break;
      let a = n ** -1.1 / (1 + (fn / fc) ** 3) * (0.25 + Math.abs(Math.sin(Math.PI * n * 0.118)));
      if (n === 1) norm = a;
      a /= norm || 1;
      if (a < 0.002) continue;
      // as parciais altas morrem muito antes da fundamental: é o que tira o sino de dentro do piano
      const tau = tau1 / (1 + (fn / 900) ** 1.3);
      const det = 1 + (0.00022 + 0.00006 * n) * (n % 2 ? 1 : -1);
      for (const [mult, decT, amp] of [[1, tau * 0.32, 0.62], [det, tau, 0.38]]) {
        const w = (TAU * fn * mult) / SR;
        const r = Math.exp(-1 / (decT * SR));
        const c = Math.cos(w) * r, sn = Math.sin(w) * r;
        let x = 1, y = 0;
        const g = a * amp;
        for (let i = 0; i < len; i++) {
          const nx = c * x - sn * y;
          y = sn * x + c * y;
          x = nx;
          buf[i] += y * g;
        }
      }
    }
    // martelo: um baque surdo de feltro, 14 ms de ruído grave
    let lp = 0;
    const thump = Math.min(len, Math.floor(0.014 * SR));
    for (let i = 0; i < thump; i++) {
      lp += 0.06 * (noise() - lp);
      buf[i] += lp * 0.5 * v * (1 - i / thump);
    }
    // ataque macio, abafador depois da duração
    const relK = Math.exp(-1 / (o.release * SR));
    let damp = 1;
    const holdSamples = Math.floor(holdS * SR);
    const pan = o.pan + clamp((ev.m - 62) / 30, -1, 1) * o.spread;
    const [gl, gr] = panGains(pan);
    // o agudo do piano de feltro é contido: acima do sol 4 cada semitom soa um pouco mais baixo, para a
    // nota alta de uma melodia não saltar à frente das outras
    const amp = (o.vol * v ** 1.5 * 0.22) / (1 + 0.045 * Math.max(0, ev.m - 67));
    for (let i = 0; i < len; i++) {
      let e = i < attackS ? 0.5 - 0.5 * Math.cos((Math.PI * i) / attackS) : 1;
      if (i > holdSamples) { damp *= relK; e *= damp; }
      const sm = buf[i] * e * amp;
      out.L[start + i] += sm * gl;
      out.R[start + i] += sm * gr;
    }
  }
  return out;
}

// VIOLÃO DE NÁILON. Karplus-Strong com afinação fracionária (passa-tudo), posição do dedo (pente que
// tira os harmônicos que a corda não tem naquele ponto), perda por período calibrada para o tempo de
// decaimento de uma corda de náilon, e um corpo de madeira (três ressonâncias graves) por cima.
function guitar(events, total, o) {
  o = { vol: 0.5, pan: 0, bright: 0.5, body: 0.45, spread: 0.35, t60: 1, ...o };
  const out = stereo(total);
  const dry = stereo(total);
  for (const ev of events) {
    const f0 = hz(ev.m);
    const v = clamp(ev.vel, 0.05, 1.2);
    const D = SR / f0 - 0.5;
    const N = Math.floor(D);
    const frac = D - N;
    const C = (1 - frac) / (1 + frac);
    const line = new Float32Array(N + 1);
    const exc = new Float32Array(N + 1);
    let lp = 0;
    const alpha = 0.16 + 0.5 * v * o.bright;
    for (let i = 0; i <= N; i++) { lp += alpha * (noise() - lp); exc[i] = lp; }
    const P = Math.max(1, Math.round(N * 0.17));
    for (let i = 0; i <= N; i++) line[i] = exc[i] - 0.85 * exc[(i - P + N + 1) % (N + 1)];
    const t60 = clamp(6.2 * (110 / f0) ** 0.5, 1.3, 6.5) * o.t60;
    const rho = 10 ** (-3 / (t60 * f0));
    const muteRho = 10 ** (-3 / (0.25 * f0));
    const S = 0.5 - 0.22 * o.bright;
    const start = Math.floor(ev.t * SR);
    const len = Math.min(total - start, Math.floor(Math.min(ev.dur + 0.3, t60 * 1.1) * SR));
    if (len <= 0) continue;
    const pan = o.pan + clamp((ev.m - 57) / 24, -1, 1) * o.spread;
    const [gl, gr] = panGains(pan);
    const amp = o.vol * v ** 1.3 * 0.5;
    const holdS = Math.floor(ev.dur * SR);
    let idx = 0, prev = 0, apX = 0, apY = 0;
    const fadeIn = 32;
    for (let i = 0; i < len; i++) {
      const y = line[idx];
      const r = i > holdS ? muteRho : rho;
      const filt = r * ((1 - S) * y + S * prev);
      prev = y;
      const ap = C * filt + apX - C * apY;
      apX = filt; apY = ap;
      line[idx] = ap;
      idx = idx === N ? 0 : idx + 1;
      const e = i < fadeIn ? i / fadeIn : 1;
      const sm = y * amp * e;
      dry.L[start + i] += sm * gl;
      dry.R[start + i] += sm * gr;
    }
  }
  // o corpo: ressonâncias de tampo e de ar (Helmholtz), bem largas
  const bodies = [[102, 2.2, 0.9], [204, 2.8, 0.55], [410, 3.2, 0.3]];
  for (const ch of ['L', 'R']) {
    const x = dry[ch];
    const y = out[ch];
    for (let i = 0; i < total; i++) y[i] = x[i];
    for (const [f, Q, g] of bodies) {
      const bp = bandpass(f, Q);
      for (let i = 0; i < total; i++) y[i] += bp(x[i]) * g * o.body;
    }
  }
  return out;
}

function bandpass(f, Q) {
  const w = (TAU * f) / SR, al = Math.sin(w) / (2 * Q), a0 = 1 + al;
  const b0 = al / a0, b2 = -al / a0, a1 = (-2 * Math.cos(w)) / a0, a2 = (1 - al) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => { const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
}
function lowpass(f, Q = 0.707) {
  const w = (TAU * f) / SR, al = Math.sin(w) / (2 * Q), cw = Math.cos(w), a0 = 1 + al;
  const b0 = (1 - cw) / 2 / a0, b1 = (1 - cw) / a0, a1 = (-2 * cw) / a0, a2 = (1 - al) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => { const y = b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
}
function highpass(f, Q = 0.707) {
  const w = (TAU * f) / SR, al = Math.sin(w) / (2 * Q), cw = Math.cos(w), a0 = 1 + al;
  const b0 = (1 + cw) / 2 / a0, b1 = -(1 + cw) / a0, a1 = (-2 * cw) / a0, a2 = (1 - al) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => { const y = b0 * x + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
}

// SOPRO: flauta de madeira ou clarinete. Monofônico, como quem toca: as notas se ligam (legato) com
// uma escorregada curta de altura, o vibrato só aparece quando a nota se sustenta, e o ar está sempre
// lá — ruído filtrado em volta da nota, mais forte no começo de cada frase (o "chiff" da flauta).
const WIND = {
  flute: { harm: [1, 0.32, 0.11, 0.045, 0.018], breath: 0.05, chiff: 0.12, attack: 0.09, vib: 0.0045 },
  clarinet: { harm: [1, 0.035, 0.42, 0.03, 0.2, 0.02, 0.09, 0.01, 0.04], breath: 0.018, chiff: 0.04, attack: 0.07, vib: 0.0025 },
};
function wind(events, total, o) {
  o = { kind: 'flute', vol: 0.5, pan: 0, ...o };
  const K = WIND[o.kind];
  const out = stereo(total);
  const evs = [...events].sort((a, b) => a.t - b.t);
  const mono = new Float32Array(total);
  const [gl, gr] = panGains(o.pan);
  let phase = 0;
  const vibRate = 4.6 + rand() * 0.6;
  const bp = bandpass(1000, 1.2);
  const lpOut = lowpass(o.kind === 'flute' ? 4200 : 3600, 0.6);
  for (let k = 0; k < evs.length; k++) {
    const ev = evs[k];
    const prev = evs[k - 1];
    const next = evs[k + 1];
    const legatoIn = prev && ev.t - (prev.t + prev.dur) < 0.04;
    const legatoOut = next && next.t - (ev.t + ev.dur) < 0.04;
    const f = hz(ev.m);
    const fPrev = legatoIn ? hz(prev.m) : f * 0.985;
    const start = Math.floor(ev.t * SR);
    const holdS = Math.floor(ev.dur * SR);
    const relS = Math.floor((legatoOut ? 0.03 : next && next.t - (ev.t + ev.dur) < 0.6 ? 0.22 : 0.7) * SR);
    const atkS = Math.floor((legatoIn ? 0.03 : K.attack) * SR);
    const glideS = Math.floor((legatoIn ? 0.055 : 0.07) * SR);
    const v = clamp(ev.vel, 0.05, 1.2);
    const hAmp = K.harm.map((a, i) => a * (i === 0 ? 1 : v ** (0.6 + i * 0.25)));
    const amp = o.vol * (0.45 + 0.55 * v) * 0.3;
    for (let i = 0; i < holdS + relS && start + i < total; i++) {
      const tt = i / SR;
      const g = i < glideS ? 1 - (1 - i / glideS) ** 2 : 1;
      const vibAmt = K.vib * clamp((tt - 0.35) / 0.5, 0, 1);
      const ff = (fPrev + (f - fPrev) * g) * (1 + vibAmt * Math.sin(TAU * vibRate * tt));
      phase += ff / SR;
      if (phase > 1e6) phase -= 1e6;
      let env = i < atkS ? Math.sin((Math.PI / 2) * (i / atkS)) : 1;
      // nota longa vai perdendo o ar, como numa respiração de verdade
      if (ev.dur > 2 && !legatoOut) env *= 1 - 0.4 * clamp((tt - 0.8) / (ev.dur - 0.8), 0, 1);
      if (i >= holdS) env *= (1 - (i - holdS) / relS) ** 1.6;
      env *= 1 + 0.03 * Math.sin(TAU * 0.7 * tt);
      let s = 0;
      for (let h = 0; h < hAmp.length; h++) {
        if (ff * (h + 1) > 7000) break;
        s += hAmp[h] * Math.sin(TAU * phase * (h + 1));
      }
      const air = bp(noise()) * (K.breath + (i < 0.06 * SR && !legatoIn ? K.chiff * (1 - i / (0.06 * SR)) : 0));
      mono[start + i] += (s + air * 3) * env * amp;
    }
  }
  for (let i = 0; i < total; i++) {
    const s = lpOut(mono[i]);
    out.L[i] = s * gl;
    out.R[i] = s * gr;
  }
  return out;
}

// CORDAS AO LONGE: o colchão. Cinco serras levemente desafinadas por nota, um filtro bem fechado e
// um ataque de quase dois segundos — ninguém percebe quando entra, só quando sai.
function strings(events, total, o) {
  o = { vol: 0.3, pan: 0, cutoff: 1100, attack: 1.6, release: 2.4, width: 0.8, ...o };
  const out = stereo(total);
  const U = 5;
  for (const ev of events) {
    const f = hz(ev.m);
    const start = Math.floor(ev.t * SR);
    const holdS = Math.floor(ev.dur * SR);
    const relS = Math.floor(o.release * SR);
    const atkS = Math.floor(Math.min(o.attack, ev.dur * 0.6) * SR);
    const len = Math.min(total - start, holdS + relS);
    if (len <= 0) continue;
    const fL = lowpass(o.cutoff, 0.6), fR = lowpass(o.cutoff, 0.6);
    const fL2 = lowpass(o.cutoff * 1.4, 0.6), fR2 = lowpass(o.cutoff * 1.4, 0.6);
    const ph = Array.from({ length: U }, () => rand());
    const det = Array.from({ length: U }, (_, u) => 2 ** ((((u / (U - 1)) - 0.5) * 2 * 9 + gauss() * 1.5) / 1200));
    const pans = Array.from({ length: U }, (_, u) => panGains(o.pan + ((u / (U - 1)) - 0.5) * 2 * o.width));
    const amp = o.vol * clamp(ev.vel, 0.05, 1.2) * 0.12;
    for (let i = 0; i < len; i++) {
      let e = i < atkS ? (1 - Math.cos((Math.PI * i) / atkS)) / 2 : 1;
      if (i >= holdS) e *= Math.exp(-((i - holdS) / relS) * 4.5);
      let sl = 0, sr = 0;
      for (let u = 0; u < U; u++) {
        const dt = (f * det[u]) / SR;
        ph[u] += dt;
        if (ph[u] >= 1) ph[u] -= 1;
        let s = 2 * ph[u] - 1;
        s -= polyBlep(ph[u], dt);
        sl += s * pans[u][0];
        sr += s * pans[u][1];
      }
      out.L[start + i] += fL2(fL(sl)) * e * amp;
      out.R[start + i] += fR2(fR(sr)) * e * amp;
    }
  }
  return out;
}
function polyBlep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

// BAIXO DE DEDO: um contrabaixo tocado com a polpa, redondo e curto. Seno com dois harmônicos fracos,
// um baque de dedo e um decaimento em dois tempos.
function bass(events, total, o) {
  o = { vol: 0.5, pan: 0, ...o };
  const out = stereo(total);
  const [gl, gr] = panGains(o.pan);
  for (const ev of events) {
    const f = hz(ev.m);
    const start = Math.floor(ev.t * SR);
    const holdS = Math.floor(ev.dur * SR);
    const len = Math.min(total - start, holdS + Math.floor(0.35 * SR));
    if (len <= 0) continue;
    const v = clamp(ev.vel, 0.05, 1.2);
    const amp = o.vol * v * 0.4;
    let ph = 0, lp = 0;
    for (let i = 0; i < len; i++) {
      const tt = i / SR;
      ph += f / SR;
      let e = (0.55 * Math.exp(-tt / 0.35) + 0.45 * Math.exp(-tt / 2.8)) * Math.min(1, i / (0.012 * SR));
      if (i > holdS) e *= Math.exp(-((i - holdS) / SR) / 0.07);
      let s = Math.sin(TAU * ph) + 0.22 * Math.sin(TAU * ph * 2) * Math.exp(-tt / 0.6) + 0.06 * Math.sin(TAU * ph * 3) * Math.exp(-tt / 0.3);
      if (i < 0.025 * SR) { lp += 0.03 * (noise() - lp); s += lp * 2.2 * (1 - i / (0.025 * SR)); }
      const sm = s * e * amp;
      out.L[start + i] += sm * gl;
      out.R[start + i] += sm * gr;
    }
  }
  return out;
}

// CELESTA COM FELTRO: o brilho da noite, usado pouco. Lâmina de metal batida por martelinho macio:
// fundamental longa e um parcial agudo inarmônico que some logo.
function celesta(events, total, o) {
  o = { vol: 0.4, pan: 0, spread: 0.4, tau: 2.2, ...o };
  const out = stereo(total);
  const parts = [[1, 1, 1], [2, 0.05, 0.5], [3.98, 0.045, 0.14]];
  for (const ev of events) {
    const f = hz(ev.m);
    const start = Math.floor(ev.t * SR);
    const len = Math.min(total - start, Math.floor(o.tau * 4 * SR));
    if (len <= 0) continue;
    const v = clamp(ev.vel, 0.05, 1.2);
    const [gl, gr] = panGains(o.pan + clamp((ev.m - 76) / 12, -1, 1) * o.spread);
    const amp = o.vol * v * 0.2;
    const buf = new Float32Array(len);
    for (const [ratio, a, tauK] of parts) {
      const fr = f * ratio;
      if (fr > 9000) continue;
      const w = (TAU * fr) / SR;
      const r = Math.exp(-1 / (o.tau * tauK * SR));
      const c = Math.cos(w) * r, sn = Math.sin(w) * r;
      let x = 1, y = 0;
      const g = a * (ratio > 1 ? v : 1);
      for (let i = 0; i < len; i++) { const nx = c * x - sn * y; y = sn * x + c * y; x = nx; buf[i] += y * g; }
    }
    const atk = Math.floor(0.012 * SR);
    for (let i = 0; i < len; i++) {
      const e = i < atk ? i / atk : 1;
      out.L[start + i] += buf[i] * e * amp * gl;
      out.R[start + i] += buf[i] * e * amp * gr;
    }
  }
  return out;
}

const INSTRUMENTS = { piano, guitar, wind, strings, bass, celesta };

// ── a sala ─────────────────────────────────────────────────────────────────
// Reverb por convolução com uma resposta de sala gerada aqui: algumas reflexões cedo, depois uma
// cauda de ruído que escurece enquanto morre (o ar e a madeira comem o agudo primeiro). L e R têm
// ruídos diferentes, o que abre o som sem fazer nada soar "de lado".
function makeIR(seconds, { rt60 = 2.2, predelay = 0.018, damp = 0.55, seed = 7 }) {
  const r = rng(seed);
  const n = Math.floor(seconds * SR);
  const ir = { L: new Float64Array(n), R: new Float64Array(n) };
  const pre = Math.floor(predelay * SR);
  for (const [ch, off] of [['L', 0], ['R', 0.37]]) {
    const x = ir[ch];
    for (const [d, g] of [[0.011, 0.5], [0.019, 0.38], [0.027, 0.33], [0.041, 0.25], [0.053, 0.2], [0.067, 0.16]]) {
      const i = pre + Math.floor((d + off * 0.004) * SR);
      if (i < n) x[i] += g * (r() > 0.5 ? 1 : -1);
    }
    let lp = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / SR;
      const decay = Math.exp((-6.91 * t) / rt60);
      const cutoff = clamp(0.9 - damp * (t / rt60) * 1.4, 0.04, 0.9);
      lp += cutoff * ((r() * 2 - 1) - lp);
      const build = Math.min(1, t / 0.06);
      x[i] += lp * decay * build * 0.11;
    }
  }
  return ir;
}

function fft(re, im, inverse) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inverse ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

function convolve(x, ir) {
  const M = ir.length;
  let size = 1;
  while (size < M * 2) size <<= 1;
  const block = size - M + 1;
  const hr = new Float64Array(size), hi = new Float64Array(size);
  hr.set(ir);
  fft(hr, hi, false);
  const y = new Float32Array(x.length + M);
  const re = new Float64Array(size), im = new Float64Array(size);
  for (let pos = 0; pos < x.length; pos += block) {
    re.fill(0); im.fill(0);
    const end = Math.min(x.length, pos + block);
    for (let i = pos; i < end; i++) re[i - pos] = x[i];
    fft(re, im, false);
    for (let k = 0; k < size; k++) {
      const a = re[k], b = im[k];
      re[k] = a * hr[k] - b * hi[k];
      im[k] = a * hi[k] + b * hr[k];
    }
    fft(re, im, true);
    const lim = Math.min(size, y.length - pos);
    for (let i = 0; i < lim; i++) y[pos + i] += re[i];
  }
  return y;
}

// ── mixagem e masterização ─────────────────────────────────────────────────
// Faixas → sala → master: corta o subgrave inútil, fecha o agudo (o "brilho baixo" da pesquisa), um
// tantinho de oscilação de fita (wow de um cent) e uma saturação quase invisível que arredonda os
// picos. Por fim TODAS as peças saem no mesmo volume percebido, para nenhuma chegar mais alta que a
// anterior depois do silêncio.
const TARGET_LUFS = -18;
/** Quanto o ataque de uma faixa pode passar do nível dela, e o pico da mix do nível da mix. */
const CREST_DB = 10;
const MASTER_PLR_DB = 9.5;
const LOCAL_CREST_DB = 10.5;

// O EQUILÍBRIO É POR PAPEL, NÃO POR VOLUME DE SINTETIZADOR. Cada faixa é medida sozinha (loudness com
// portão, só onde ela toca) e posta no nível do seu papel, relativo à melodia. Assim a melodia nunca
// entra como susto por cima de um acompanhamento sumido, que é o erro mais comum de trilha "calma".
const ROLE_DB = { lead: 0, counter: -6, acc: -4.5, chords: -9, bass: -9, pad: -11, spark: -10, solo: 0 };

function render(score, arrangement, { room, tail = 7, loop = false, lpHz = 9000, target = TARGET_LUFS }) {
  rand = rng(hashName(score.name));
  const lastT = score.time(score.endBeat);
  // o loop fecha no fim do último compasso, não no fim da última nota (que pode passar dele)
  const loopLen = loop ? Math.round(score.time(score.loopBeats ?? Math.ceil(score.endBeat / score.bpb - 1e-6) * score.bpb) * SR) : 0;
  const total = Math.ceil((lastT + tail) * SR);
  const dry = stereo(total);
  const send = stereo(total);
  for (const [track, cfg] of Object.entries(arrangement)) {
    const evs = (score.tracks[track] || []).flatMap((e) => e.notes.map((m, j) => ({ e, m, j })));
    if (!evs.length) continue;
    const human = cfg.human ?? 0.006;
    const events = evs.map(({ e, m, j }) => {
      const t0 = score.time(e.beat);
      const t1 = score.time(e.beat + e.dur);
      const strum = (cfg.strum ?? 0) * j;
      return {
        t: Math.max(0, t0 + gauss() * human + strum),
        dur: Math.max(0.05, (t1 - t0) * (cfg.legato ?? 1)),
        m,
        vel: clamp(e.vel * (1 + gauss() * (cfg.velJitter ?? 0.05)), 0.05, 1.25),
      };
    });
    const buf = INSTRUMENTS[cfg.inst](events, total, cfg);
    const role = cfg.role ?? 'lead';
    if (!(role in ROLE_DB)) throw new Error(`${score.name}/${track}: papel desconhecido ${role}`);
    // O ATAQUE NÃO PODE BATER. Corda dedilhada e martelo nascem até 18 dB acima do próprio nível; num
    // fundo calmo isso soa como "a música está baixa mas uns picos batem". Cada faixa tem o ataque
    // domado a no máximo CREST_DB acima do seu nível, com um limitador que olha 6 ms à frente e solta
    // devagar (a nota continua a mesma, só não estala por cima das outras).
    limitPeaks(buf.L, buf.R, 10 ** ((loudness(buf.L, buf.R) + (cfg.crest ?? CREST_DB)) / 20), { release: 0.15, loop });
    const g = 10 ** ((ROLE_DB[role] - 18 - loudness(buf.L, buf.R)) / 20) * 10 ** ((cfg.trim ?? 0) / 20);
    const rs = cfg.reverb ?? 0.3;
    if (process.env.MEDIR) {
      let pk = 0;
      for (let i = 0; i < total; i++) pk = Math.max(pk, Math.abs(buf.L[i]), Math.abs(buf.R[i]));
      const lu = loudness(buf.L, buf.R);
      // brilho da faixa: a parte da energia acima de 1,5 kHz
      const hp = highpass(1500, 0.7);
      let eh = 0, ea = 0;
      for (let i = 0; i < total; i++) { const x = buf.L[i] + buf.R[i]; const y = hp(x); eh += y * y; ea += x * x; }
      console.log(`  ${track.padEnd(6)} ${cfg.inst.padEnd(8)} pico-loudness ${(20 * Math.log10(pk) - lu).toFixed(1)} dB  pico na mix ${(20 * Math.log10(pk * g)).toFixed(1)} dBFS  >1,5 kHz ${((100 * eh) / (ea || 1)).toFixed(1)}%`);
    }
    for (let i = 0; i < total; i++) {
      dry.L[i] += buf.L[i] * g; dry.R[i] += buf.R[i] * g;
      send.L[i] += buf.L[i] * g * rs; send.R[i] += buf.R[i] * g * rs;
    }
  }
  // A CURVA DA PEÇA: entra de mansinho, fica num nível só (pouca variação é o que acalma) e sai mais
  // baixa do que entrou. `score.dyn` são pontos [compasso, dB], ligados em reta.
  if (score.dyn) {
    const pts = score.dyn.map(([bar, db]) => [score.time(bar * score.bpb) * SR, db]);
    let k = 0;
    for (let i = 0; i < total; i++) {
      while (k < pts.length - 2 && i > pts[k + 1][0]) k++;
      const [x0, d0] = pts[k], [x1, d1] = pts[Math.min(k + 1, pts.length - 1)];
      const db = i <= x0 ? d0 : i >= x1 ? d1 : d0 + ((d1 - d0) * (i - x0)) / (x1 - x0);
      const g = 10 ** (db / 20);
      dry.L[i] *= g; dry.R[i] *= g; send.L[i] *= g; send.R[i] *= g;
    }
  }
  const ir = makeIR(room.seconds ?? 3.4, room);
  const wetL = convolve(send.L, ir.L);
  const wetR = convolve(send.R, ir.R);
  const wetGain = room.gain ?? 1;
  let L = new Float32Array(total), R = new Float32Array(total);
  for (let i = 0; i < total; i++) { L[i] = dry.L[i] + wetL[i] * wetGain; R[i] = dry.R[i] + wetR[i] * wetGain; }

  if (loop) {
    // a cauda depois do ponto de loop volta para o começo: uma passada emenda na outra sem buraco
    const fl = new Float32Array(loopLen), fr = new Float32Array(loopLen);
    for (let i = 0; i < total; i++) { fl[i % loopLen] += L[i]; fr[i % loopLen] += R[i]; }
    L = fl; R = fr;
  }
  master(L, R, lpHz, loop, target);
  if (!loop) {
    // o arquivo termina quando o som termina (abaixo de -70 dBFS), mais meio segundo
    let last = L.length - 1;
    while (last > 0 && Math.abs(L[last]) < 3e-4 && Math.abs(R[last]) < 3e-4) last -= 1;
    const end = Math.min(L.length, last + Math.floor(0.5 * SR));
    L = L.slice(0, end); R = R.slice(0, end);
    // o fim: o último acorde já morreu quase todo; os dois segundos finais vão a zero devagar
    const fade = Math.floor(2.5 * SR);
    for (let i = 0; i < fade; i++) {
      const k = (1 - i / fade) ** 2;
      L[L.length - fade + i] *= k; R[R.length - fade + i] *= k;
    }
  }
  return { L, R, loopLen };
}

function master(L, R, lpHz, loop, target) {
  const n = L.length;
  for (const x of [L, R]) {
    const hp = highpass(32, 0.7), lp1 = lowpass(lpHz, 0.6), lp2 = lowpass(lpHz * 1.6, 0.5);
    // em loop, aquece os filtros com o fim do arquivo para a emenda não estalar
    if (loop) for (let i = n - 4096; i < n; i++) lp2(lp1(hp(x[i])));
    for (let i = 0; i < n; i++) x[i] = lp2(lp1(hp(x[i])));
  }
  // wow de fita: atraso que oscila 0,33 Hz, ±0,25 ms (cerca de um cent)
  const base = 0.002 * SR, depth = 0.00025 * SR;
  // num loop, a oscilação fecha um número inteiro de voltas, senão a emenda pula de altura
  const wowHz = loop ? Math.max(1, Math.round((0.33 * n) / SR)) / (n / SR) : 0.33;
  for (const x of [L, R]) {
    const src = Float32Array.from(x);
    for (let i = 0; i < n; i++) {
      const d = base + depth * Math.sin((TAU * wowHz * i) / SR);
      let p = i - d;
      if (loop) p = ((p % n) + n) % n;
      const i0 = Math.floor(p);
      const fr = p - i0;
      const a = src[(i0 + n) % n] ?? 0, b = src[(i0 + 1) % n] ?? 0;
      x[i] = i0 < 0 && !loop ? 0 : a + (b - a) * fr;
    }
  }
  // primeiro o VOLUME PERCEBIDO (frases), depois o pico (ataques)
  levelPhrases(L, R, loop);
  // Nível e pico juntos: normaliza, segura o pico a MASTER_PLR_DB acima do nível (o que sobrou de
  // ataque depois das faixas), e normaliza de novo, porque limitar baixa um pouco o nível.
  for (let pass = 0; pass < 3; pass++) {
    const g = 10 ** ((target - loudness(L, R)) / 20);
    for (let i = 0; i < n; i++) { L[i] *= g; R[i] *= g; }
    if (pass < 2) limitPeaks(L, R, localCeiling(L, R, 10 ** ((target + MASTER_PLR_DB) / 20), LOCAL_CREST_DB, loop), { release: 0.25, loop });
  }
  // rede de segurança: nada passa de -1 dBFS
  for (let i = 0; i < n; i++) { L[i] = clamp(L[i], -0.89, 0.89); R[i] = clamp(R[i], -0.89, 0.89); }
}

// O NIVELADOR DE FRASES. O limitador de pico cuida de amostras; o ouvido julga o volume em blocos de
// ~0,4 s (o "momentâneo" da BS.1770). Uma frase que sobe 4–6 LU acima dos segundos em volta é o "pico
// que aparece do nada" mesmo sem nenhuma amostra alta. Aqui o volume momentâneo (0,4 s, com o filtro K)
// é comparado com o dos 3 s anteriores; o que passa de PHRASE_LU é reduzido até ele. Como
// é offline, o ganho desce ANTES da frase (olha 0,3 s à frente) e volta devagar (1,2 s): ninguém ouve
// o volume mexendo, só deixa de ouvir o salto.
const PHRASE_LU = 1;
function levelPhrases(L, R, loop) {
  const n = L.length;
  const hop = 441; // 10 ms
  const frames = Math.ceil(n / hop);
  // energia K-ponderada por quadro de 10 ms
  const shelf = shelfK(), hp = highpass(38, 0.5), shelf2 = shelfK(), hp2 = highpass(38, 0.5);
  const e = new Float64Array(frames);
  for (let i = 0; i < n; i++) {
    const a = hp(shelf(L[i])), b = hp2(shelf2(R[i]));
    e[Math.floor(i / hop)] += a * a + b * b;
  }
  const at = (k) => (loop ? ((k % frames) + frames) % frames : Math.min(frames - 1, Math.max(0, k)));
  // o ouvido compara com o que ACABOU de passar: os 0,4 s de agora contra os 3 s anteriores (as
  // janelas "momentâneo" e "curto prazo" da BS.1770). Cinco voltas, porque abaixar uma frase muda o
  // passado da seguinte.
  const want = new Float64Array(frames); // ganho desejado, em dB (<= 0)
  const gained = (k) => 10 ** (want[at(k)] / 10);
  // A frase que subiu são os 0,4 s que acabaram de tocar: é NELES que o ganho desce, não no instante
  // seguinte (senão a correção chega depois do salto).
  const extra = new Float64Array(frames);
  for (let round = 0; round < 5; round++) {
    extra.fill(0);
    for (let k = 0; k < frames; k++) {
      let m = 0, s = 0;
      for (let j = -40; j < 0; j++) m += e[at(k + j)] * gained(k + j);
      for (let j = -300; j < -40; j++) s += e[at(k + j)] * gained(k + j);
      m /= 40; s /= 260;
      if (m < 1e-12 || s < 1e-12 || (!loop && k < 300)) continue;
      const over = 10 * Math.log10(m / s) - PHRASE_LU;
      if (over > 0) for (let j = -40; j < 0; j++) { const f = at(k + j); if (over > extra[f]) extra[f] = over; }
    }
    for (let k = 0; k < frames; k++) want[k] -= extra[k];
  }
  // olha 0,3 s à frente (o menor ganho da janela), desce em rampa e solta em 1,2 s
  const look = 30, rel = 1 - Math.exp(-1 / 120);
  const ahead = new Float64Array(frames);
  for (let k = 0; k < frames; k++) { let lo = 0; for (let j = 0; j <= look; j++) lo = Math.min(lo, want[at(k + j)]); ahead[k] = lo; }
  const smooth = new Float64Array(frames);
  for (let k = 0; k < frames; k++) { let sum = 0; for (let j = -look; j <= 0; j++) sum += ahead[at(k + j)]; smooth[k] = Math.min(ahead[k], sum / (look + 1)); }
  const g = new Float64Array(frames);
  let cur = 0;
  for (let pass = 0; pass < (loop ? 2 : 1); pass++) {
    for (let k = 0; k < frames; k++) { cur = smooth[k] < cur ? smooth[k] : cur + (smooth[k] - cur) * rel; g[k] = cur; }
  }
  for (let i = 0; i < n; i++) {
    const k = i / hop, k0 = Math.floor(k), f = k - k0;
    const db = g[at(k0)] * (1 - f) + g[at(k0 + 1)] * f;
    const lin = 10 ** (db / 20);
    L[i] *= lin; R[i] *= lin;
  }
}

// O TETO TAMBÉM OLHA EM VOLTA. Num trecho calmo (introdução, coda) um acorde comum já salta por cima do
// silêncio; então o teto de cada ponto é o menor entre o teto da peça e o nível dos 3 s em volta
// (RMS) mais `crestDb`.
function localCeiling(L, R, ceiling, crestDb, loop) {
  const n = L.length;
  const half = Math.floor(1.5 * SR);
  const sq = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) sq[i + 1] = sq[i] + (L[i] * L[i] + R[i] * R[i]) / 2;
  const k = 10 ** (crestDb / 20);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let a = i - half, b = i + half, e;
    if (loop) {
      // janela que dá a volta no loop
      const wrap = (x) => (x < 0 ? sq[n] - sq[n + x] : x > n ? sq[n] + sq[x - n] : sq[x]);
      e = (wrap(b) - wrap(a)) / (b - a);
    } else {
      a = Math.max(0, a); b = Math.min(n, b);
      e = (sq[b] - sq[a]) / (b - a);
    }
    out[i] = Math.min(ceiling, Math.max(Math.sqrt(e) * k, 1e-4));
  }
  return out;
}

// LIMITADOR DE PICO, offline e sem atraso: o ganho de cada amostra olha `look` segundos À FRENTE (a
// partitura já está toda escrita, dá para ver o pico chegando), desce em rampa até ele e volta devagar
// em `release`. Num loop o fim enxerga o começo.
function limitPeaks(L, R, ceiling, { look = 0.006, release = 0.15, loop = false } = {}) {
  const n = L.length;
  const W = Math.max(1, Math.floor(look * SR));
  const at = (i) => (loop ? ((i % n) + n) % n : Math.min(n - 1, Math.max(0, i)));
  const req = new Float32Array(n);
  let any = false;
  for (let i = 0; i < n; i++) {
    const p = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    const c = typeof ceiling === 'number' ? ceiling : ceiling[i];
    req[i] = p > c ? c / p : 1;
    if (req[i] < 1) any = true;
  }
  if (!any) return;
  // mínimo da janela [i, i+W] (fila monotônica)
  const fwd = new Float32Array(n);
  const q = [];
  let head = 0;
  for (let j = 0; j < n + W; j++) {
    const v = loop || j < n ? req[at(j)] : 1;
    while (q.length > head && q[q.length - 1][1] >= v) q.pop();
    q.push([j, v]);
    const i = j - W;
    if (i >= 0) {
      while (q[head][0] < i) head++;
      fwd[i] = q[head][1];
    }
  }
  // rampa de descida: média da janela anterior (chega ao alvo exatamente no pico)
  const att = new Float32Array(n);
  let sum = 0;
  for (let k = -W; k < 0; k++) sum += loop ? fwd[at(k)] : 1;
  for (let i = 0; i < n; i++) {
    sum += fwd[i] - (loop ? fwd[at(i - W)] : i - W >= 0 ? fwd[i - W] : 1);
    att[i] = Math.min(fwd[i], sum / W);
  }
  const rel = 1 - Math.exp(-1 / (release * SR));
  let g = 1;
  const passes = loop ? 2 : 1;
  for (let p = 0; p < passes; p++) {
    for (let i = 0; i < n; i++) {
      g = att[i] < g ? att[i] : g + (att[i] - g) * rel;
      if (p === passes - 1) { L[i] *= g; R[i] *= g; }
    }
  }
}

// Loudness integrado (ITU-R BS.1770: filtro K e portões absoluto e relativo), para igualar as peças.
function loudness(L, R) {
  const kw = (x) => {
    const y = new Float64Array(x.length);
    // pré-filtro de prateleira (+4 dB acima de ~1,5 kHz) e passa-alta RLB, coeficientes a 48 kHz
    // recalculados para a taxa daqui
    const shelf = shelfK(), hp = highpass(38, 0.5);
    for (let i = 0; i < x.length; i++) y[i] = hp(shelf(x[i]));
    return y;
  };
  const a = kw(L), b = kw(R);
  const blk = Math.floor(0.4 * SR), hop = Math.floor(0.1 * SR);
  const ms = [];
  for (let s = 0; s + blk <= a.length; s += hop) {
    let sum = 0;
    for (let i = s; i < s + blk; i++) sum += a[i] * a[i] + b[i] * b[i];
    ms.push(sum / blk);
  }
  const lu = (m) => -0.691 + 10 * Math.log10(m || 1e-12);
  const abs = ms.filter((m) => lu(m) > -70);
  const mean = abs.reduce((x, y) => x + y, 0) / (abs.length || 1);
  const rel = abs.filter((m) => lu(m) > lu(mean) - 10);
  return lu(rel.reduce((x, y) => x + y, 0) / (rel.length || 1));
}
function shelfK() {
  const f0 = 1681.97, G = 3.99984, Q = 0.7071752;
  const K = Math.tan((Math.PI * f0) / SR), Vh = 10 ** (G / 20), Vb = Vh ** 0.4996667741545416;
  const a0 = 1 + K / Q + K * K;
  const b0 = (Vh + (Vb * K) / Q + K * K) / a0, b1 = (2 * (K * K - Vh)) / a0, b2 = (Vh - (Vb * K) / Q + K * K) / a0;
  const a1 = (2 * (K * K - 1)) / a0, a2 = (1 - K / Q + K * K) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => { const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
}

function hashName(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

function writeWav(name, L, R) {
  const n = L.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  const dither = rng(99);
  for (let i = 0; i < n; i++) {
    const tpdf = (dither() - dither()) / 32768;
    buf.writeInt16LE(Math.round(clamp(L[i] + tpdf, -1, 1) * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(clamp(R[i] + tpdf, -1, 1) * 32767), 46 + i * 4);
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name), buf);
  return buf.length;
}

// ═══════════════════════════════════════════════════════════════════════════
// AS PEÇAS
// ═══════════════════════════════════════════════════════════════════════════

// I. MORNING DEW — fá maior (jônio), 76 BPM. A manhã: violão em arpejo, o piano canta a melodia, e na
// volta dela quem canta é a flauta. É a primeira coisa que o vale toca de dia.
function morning() {
  const s = new Score({ name: 'valley-morning', bpm: 76, bpb: 4 });
  const V = {
    Fmaj9: { bass: 'F2', up: ['C3', 'G3', 'A3', 'C4'] },
    'C/E': { bass: 'E2', up: ['C3', 'G3', 'D4', 'E4'] },
    Dm9: { bass: 'D2', up: ['A2', 'F3', 'A3', 'C4'] },
    Bbmaj9: { bass: 'Bb1', up: ['F2', 'D3', 'A3', 'C4'] },
    'F/A': { bass: 'A2', up: ['C3', 'F3', 'A3', 'C4'] },
    Gm7: { bass: 'G2', up: ['D3', 'F3', 'Bb3', 'D4'] },
    Bbmaj7: { bass: 'Bb2', up: ['F3', 'A3', 'D4', 'F4'] },
    C7sus4: { bass: 'C2', up: ['G2', 'Bb2', 'F3', 'G3'] },
    C: { bass: 'C2', up: ['G2', 'C3', 'E3', 'G3'] },
    Am7: { bass: 'A2', up: ['E3', 'G3', 'C4', 'E4'] },
    Fmaj7: { bass: 'F2', up: ['C3', 'A3', 'C4', 'E4'] },
    Bb: { bass: 'Bb2', up: ['F3', 'Bb3', 'D4', 'F4'] },
  };
  const A1 = 'Fmaj9 C/E Dm9 Bbmaj9 F/A Gm7 Bbmaj7 C7sus4:2 C:2';
  const A2 = 'Fmaj9 C/E Dm9 Bbmaj9 F/A Gm7 Gm7:2 C:2 Fmaj9';
  const B = 'Bb Am7 Gm7 Fmaj7 Bb Am7 Gm7 C7sus4';
  const melA1 = 'C5:1.5 A4:0.5 G4:1 A4:1 | G4:3 -:1 | F4:1 G4:0.5 A4:0.5 D5:1.5 C5:0.5 | D5:3 -:1 | C5:1.5 A4:0.5 F4:1 A4:1 | Bb4:1.5 A4:0.5 G4:2 | F4:1 G4:1 A4:1 C5:1 | G4:3 -:1';
  const melA2 = 'C5:1.5 A4:0.5 G4:1 A4:1 | G4:3 -:1 | F4:1 G4:0.5 A4:0.5 D5:1.5 C5:0.5 | D5:3 -:1 | C5:1.5 A4:0.5 F4:1 A4:1 | Bb4:1.5 A4:0.5 G4:2 | Bb4:1 A4:1 G4:1 E4:1 | F4:3 -:1';
  const melB = "F5:1.5 D5:0.5 C5:1 A4:1 | E5:2 C5:1 A4:1 | D5:1.5 C5:0.5 Bb4:1 A4:1 | A4:3 -:1 | F5:1.5 D5:0.5 C5:1 D5:1 | E5:1.5 C5:0.5 A4:1 G4:1 | Bb4:1 A4:1 G4:1 F4:1 | G4:3 -:1";
  const arp = { pattern: [0, 1, 2, 3, 4, 3, 2, 1], step: 0.5, ring: 3, vel: 0.42 };
  let bar = 0;
  const all = [];
  const sec = (prog) => { const c = s.progression(bar, prog); all.push(...c); return c; };
  // introdução: só o violão
  arpeggio(s, 'gtr', sec('Fmaj9 C/E'), V, arp); bar += 2;
  for (const [prog, mel, voiceT, padOn] of [[A1, melA1, 'pno', false], [A2, melA2, 'pno', false], [B, melB, 'pno', true], [A1, melA1, 'fl', true], [A2, melA2, 'fl', true]]) {
    const c = sec(prog);
    arpeggio(s, 'gtr', c, V, arp);
    bassline(s, 'bs', c, V, [[0, 1.8, 0.5], [2.5, 1.2, 0.3]]);
    if (padOn) sustained(s, 'pad', c, V, { vel: 0.5 });
    s.melody(voiceT, bar, mel, { vel: voiceT === 'pno' ? 0.62 : 0.7 });
    if (voiceT === 'fl') blocks(s, 'pnoC', c, V, [[0, 3.5, 0.28, 'up']]);
    bar += 8;
  }
  const coda = sec('Bbmaj9 F/A Gm7 Fmaj9 Fmaj9');
  arpeggio(s, 'gtr', coda.slice(0, 4), V, { ...arp, vel: 0.36 });
  sustained(s, 'pad', coda, V, { vel: 0.4 });
  s.melody('pno', bar, 'D5:2 C5:2 | A4:4 | Bb4:2 G4:2 | A4:4 | [F4,A4,C5]:4', { vel: 0.5 });
  s.push('gtr', (bar + 4) * 4, 4, [midi('F2'), midi('C3'), midi('A3'), midi('C4')], 0.4);
  s.ritard(bar, bar + 5, 0.3);
  s.dyn = [[0, -4], [2, 0], [bar, 0], [bar + 5, -6]];
  return [s, {
    gtr: { role: 'acc', inst: 'guitar', vol: 0.85, pan: -0.25, reverb: 0.28, bright: 0.42, strum: 0.012 },
    bs: { role: 'bass', inst: 'bass', vol: 0.55, reverb: 0.08 },
    pno: { role: 'lead', inst: 'piano', vol: 1.05, pan: 0.12, reverb: 0.4, human: 0.008 },
    pnoC: { role: 'chords', inst: 'piano', vol: 0.55, pan: 0.2, reverb: 0.45, strum: 0.03, bright: 0.8 },
    fl: { role: 'lead', trim: -1, inst: 'wind', kind: 'flute', vol: 0.75, pan: 0.1, reverb: 0.42, human: 0.004, legato: 1.02 },
    pad: { role: 'pad', inst: 'strings', vol: 0.55, cutoff: 950, reverb: 0.5 },
  }, { room: { rt60: 2.1, gain: 0.85, seed: 11 } }];
}

// II. GARDEN WALTZ — mixolídio de dó, 3/4 a 96 BPM. O meio da manhã, mexendo na horta: valsa de
// piano (baixo no um, acorde no dois e no três), o clarinete na melodia, o violão dobrando na volta.
function waltz() {
  const s = new Score({ name: 'valley-waltz', bpm: 96, bpb: 3 });
  const V = {
    C: { bass: 'C2', up: ['G3', 'C4', 'E4'] },
    'Bb/C': { bass: 'C2', up: ['F3', 'Bb3', 'D4'] },
    'F/C': { bass: 'C2', up: ['F3', 'A3', 'C4'] },
    Am7: { bass: 'A1', up: ['G3', 'C4', 'E4'] },
    Bb: { bass: 'Bb1', up: ['F3', 'Bb3', 'D4'] },
    F: { bass: 'F2', up: ['F3', 'A3', 'C4'] },
    Gm7: { bass: 'G1', up: ['F3', 'Bb3', 'D4'] },
    'C/E': { bass: 'E2', up: ['G3', 'C4', 'E4'] },
    Dm7: { bass: 'D2', up: ['F3', 'A3', 'C4'] },
  };
  const A1 = 'C Bb/C F/C C Am7 Bb F Gm7';
  const A2 = 'C Bb/C F/C C Am7 Bb F C';
  const B = 'F C/E Dm7 Bb F C/E Bb Bb/C';
  const melA1 = 'E4:1 G4:1 C5:1 | D5:2 Bb4:1 | A4:2 F4:1 | G4:3 | A4:1 C5:1 E5:1 | D5:1.5 C5:0.5 Bb4:1 | A4:1 G4:1 F4:1 | G4:3';
  const melA2 = 'E4:1 G4:1 C5:1 | D5:2 Bb4:1 | A4:2 F4:1 | G4:3 | A4:1 C5:1 E5:1 | D5:1.5 C5:0.5 Bb4:1 | A4:1 C5:1 A4:1 | G4:2 E4:1';
  const melB = 'A4:2 C5:1 | G4:3 | F4:2 A4:1 | D5:3 | C5:2 A4:1 | G4:1 E4:1 G4:1 | Bb4:2 A4:1 | G4:3';
  const waltzHits = [[0, 2.6, 0.5, 'bass'], [1, 0.9, 0.3, 'up'], [2, 0.9, 0.27, 'up']];
  let bar = 0;
  const sec = (prog) => s.progression(bar, prog);
  blocks(s, 'pno', sec('C Bb/C C Bb/C'), V, waltzHits); bar += 4;
  const plan = [[A1, melA1, 'cl'], [A2, melA2, 'cl'], [B, melB, 'pnoM'], [A1, melA1, 'cl2'], [A2, melA2, 'cl2'], [B, melB, 'cl2']];
  for (const [prog, mel, who] of plan) {
    const c = sec(prog);
    blocks(s, 'pno', c, V, waltzHits);
    if (who === 'cl2') {
      s.melody('cl', bar, mel, { vel: 0.7 });
      arpeggio(s, 'gtr', c, V, { pattern: [null, 1, 2, 3, 2, 1], step: 0.5, ring: 2.2, vel: 0.3, accent: 1 });
    } else s.melody(who, bar, mel, { vel: who === 'cl' ? 0.66 : 0.6 });
    if (who === 'pnoM') sustained(s, 'pad', c, V, { vel: 0.45 });
    bar += 8;
  }
  const coda = sec('C Bb/C F/C C C');
  blocks(s, 'pno', coda.slice(0, 4), V, waltzHits);
  s.melody('cl', bar, 'E5:2 D5:1 | C5:2 Bb4:1 | A4:2 F4:1 | G4:3 | -:3');
  s.push('pno', (bar + 4) * 3, 4, [midi('C2'), midi('G3'), midi('C4'), midi('E4')], 0.42);
  s.ritard(bar, bar + 5, 0.32);
  s.dyn = [[0, -4], [4, 0], [bar, 0], [bar + 5, -6]];
  return [s, {
    pno: { role: 'acc', trim: -1, inst: 'piano', vol: 0.8, pan: -0.1, reverb: 0.35, bright: 0.85, human: 0.007 },
    pnoM: { role: 'lead', inst: 'piano', vol: 1, pan: 0.1, reverb: 0.4 },
    cl: { role: 'lead', trim: -1, inst: 'wind', kind: 'clarinet', vol: 0.78, pan: 0.18, reverb: 0.38, human: 0.005 },
    gtr: { role: 'counter', trim: -2, inst: 'guitar', vol: 0.7, pan: -0.35, reverb: 0.3, bright: 0.35 },
    pad: { role: 'pad', inst: 'strings', vol: 0.45, cutoff: 900, reverb: 0.5 },
  }, { room: { rt60: 1.9, gain: 0.8, seed: 23 } }];
}

// III. LAZY CLOUDS — lídio de si bemol, 68 BPM. O começo da tarde, deitado na grama: o mi natural sobre
// o si bemol é a nuvem passando. Flauta longa sobre cordas e piano que só marca o compasso.
function clouds() {
  const s = new Score({ name: 'valley-clouds', bpm: 68, bpb: 4 });
  const V = {
    Bbmaj7: { bass: 'Bb1', up: ['F3', 'A3', 'D4'] },
    'C/Bb': { bass: 'Bb1', up: ['G3', 'C4', 'E4'] },
    Gm7: { bass: 'G2', up: ['F3', 'Bb3', 'D4'] },
    Am7: { bass: 'A2', up: ['G3', 'C4', 'E4'] },
    C: { bass: 'C2', up: ['G3', 'C4', 'E4'] },
    Dm7: { bass: 'D2', up: ['F3', 'A3', 'C4'] },
    Cadd9: { bass: 'C2', up: ['G3', 'D4', 'E4'] },
    'F/A': { bass: 'A2', up: ['F3', 'A3', 'C4'] },
    Bbmaj9: { bass: 'Bb1', up: ['F3', 'A3', 'C4', 'D4'] },
    Bb: { bass: 'Bb1', up: ['F3', 'Bb3', 'D4'] },
  };
  const A1 = 'Bbmaj7 C/Bb Bbmaj7 C/Bb Gm7 Am7 Bbmaj7 C';
  const A2 = 'Bbmaj7 C/Bb Bbmaj7 C/Bb Gm7 Am7 C/Bb Bbmaj7';
  const B = 'Dm7 Cadd9 Bbmaj7 F/A Gm7 Dm7 Bb C';
  const melA1 = 'F4:1 A4:1 D5:2 | E5:2 D5:1 C5:1 | D5:3 -:1 | G4:1 A4:1 C5:2 | Bb4:2 A4:1 G4:1 | A4:2 C5:1 E5:1 | D5:1.5 C5:0.5 A4:2 | G4:3 -:1';
  const melA2 = 'F4:1 A4:1 D5:2 | E5:2 D5:1 C5:1 | D5:3 -:1 | G4:1 A4:1 C5:2 | Bb4:2 A4:1 G4:1 | A4:2 C5:1 E5:1 | E5:1 D5:1 C5:1 A4:1 | D5:3 -:1';
  const melB = 'A4:1.5 C5:0.5 F5:2 | E5:1.5 D5:0.5 C5:2 | D5:1 C5:1 A4:2 | C5:3 -:1 | Bb4:1.5 D5:0.5 F5:2 | E5:1 D5:1 C5:1 A4:1 | Bb4:1 C5:1 D5:2 | E5:3 -:1';
  const hits = [[0, 3.6, 0.36, 'all'], [2.5, 1.4, 0.22, 'up']];
  let bar = 0;
  const sec = (prog) => s.progression(bar, prog);
  { const c = sec('Bbmaj7 C/Bb'); sustained(s, 'pad', c, V, { vel: 0.5 }); blocks(s, 'pno', c, V, hits); bar += 2; }
  for (const [prog, mel, who] of [[A1, melA1, 'fl'], [A2, melA2, 'fl'], [B, melB, 'pnoM'], [A1, melA1, 'pnoM'], [A2, melA2, 'pnoM']]) {
    const c = sec(prog);
    sustained(s, 'pad', c, V, { vel: who === 'pnoM' && prog === B ? 0.55 : 0.45 });
    blocks(s, 'pno', c, V, who === 'pnoM' ? [[0, 3.6, 0.3, 'bass'], [1, 2.5, 0.2, 'up']] : hits);
    s.melody(who, bar, mel, { vel: who === 'fl' ? 0.68 : 0.6 });
    if (who === 'pnoM' && prog !== B) underVoice(s, 'pnoM', 'fl2', c, V, { vel: 0.42 });
    bar += 8;
  }
  const coda = sec('Bbmaj9 C/Bb Bbmaj9 Bbmaj9');
  sustained(s, 'pad', coda, V, { vel: 0.4 });
  blocks(s, 'pno', coda.slice(0, 3), V, [[0, 3.6, 0.28, 'all']]);
  s.melody('fl', bar, 'D5:2 C5:2 | E5:2 D5:2 | F5:4 | D5:4', { vel: 0.55 });
  s.push('pno', (bar + 3) * 4, 5, [midi('Bb1'), midi('F3'), midi('C4'), midi('D4')], 0.3);
  s.ritard(bar, bar + 4, 0.28);
  s.dyn = [[0, -4], [2, 0], [bar, 0], [bar + 4, -6]];
  return [s, {
    pad: { role: 'pad', trim: 2, inst: 'strings', vol: 0.75, cutoff: 1000, reverb: 0.55, attack: 2 },
    pno: { role: 'acc', trim: -1, inst: 'piano', vol: 0.75, pan: -0.15, reverb: 0.45, bright: 0.8, strum: 0.025 },
    pnoM: { role: 'lead', inst: 'piano', vol: 1, pan: 0.1, reverb: 0.45 },
    fl: { role: 'lead', trim: -1, inst: 'wind', kind: 'flute', vol: 0.75, pan: 0.15, reverb: 0.48, legato: 1.02 },
    fl2: { role: 'counter', inst: 'wind', kind: 'flute', vol: 0.45, pan: -0.2, reverb: 0.55, legato: 1.02 },
  }, { room: { rt60: 2.6, gain: 0.95, seed: 31 } }];
}

// IV. GOLDEN HOUR — eólio de ré, 64 BPM. O entardecer: um pouco de saudade, nunca tristeza. Violão
// dedilhado, clarinete grave na melodia; na volta o piano canta e o clarinete faz a segunda voz.
function golden() {
  const s = new Score({ name: 'valley-golden', bpm: 64, bpb: 4 });
  const V = {
    Dm9: { bass: 'D2', up: ['A2', 'F3', 'A3', 'C4'] },
    Bbmaj7: { bass: 'Bb1', up: ['F2', 'D3', 'A3', 'D4'] },
    Bb: { bass: 'Bb1', up: ['F2', 'D3', 'F3', 'Bb3'] },
    Fmaj7: { bass: 'F2', up: ['C3', 'A3', 'C4', 'E4'] },
    Cadd9: { bass: 'C2', up: ['G2', 'E3', 'D4', 'G4'] },
    Gm7: { bass: 'G2', up: ['D3', 'F3', 'Bb3', 'D4'] },
    Am7: { bass: 'A2', up: ['E3', 'G3', 'C4', 'E4'] },
    Dm: { bass: 'D2', up: ['A2', 'F3', 'A3', 'D4'] },
    C: { bass: 'C2', up: ['G2', 'E3', 'C4', 'G4'] },
  };
  const A1 = 'Dm9 Bbmaj7 Fmaj7 Cadd9 Dm9 Bbmaj7 Gm7 Am7';
  const A2 = 'Dm9 Bbmaj7 Fmaj7 Cadd9 Dm9 Bbmaj7 Gm7 Am7:2 Dm:2';
  const B = 'Bb C Am7 Dm9 Bb C Gm7 Am7';
  const melA1 = 'A4:1.5 F4:0.5 E4:1 F4:1 | D4:3 -:1 | C5:1.5 A4:0.5 G4:1 A4:1 | G4:3 -:1 | A4:1 C5:1 D5:1.5 C5:0.5 | A4:2 F4:2 | G4:1 Bb4:1 A4:1 G4:1 | E4:3 -:1';
  const melA2 = 'A4:1.5 F4:0.5 E4:1 F4:1 | D4:3 -:1 | C5:1.5 A4:0.5 G4:1 A4:1 | G4:3 -:1 | A4:1 C5:1 D5:1.5 C5:0.5 | A4:2 F4:2 | Bb4:1 A4:1 G4:1 F4:1 | E4:2 D4:2';
  const melB = 'D5:1.5 C5:0.5 Bb4:1 A4:1 | G4:2 C5:2 | E5:2 D5:1 C5:1 | A4:3 -:1 | F4:1 Bb4:1 D5:2 | E5:1.5 D5:0.5 C5:2 | Bb4:1 A4:1 G4:2 | A4:3 -:1';
  const arp = { pattern: [0, 2, 3, 4, 1, 3, 2, 4], step: 0.5, ring: 3.2, vel: 0.4 };
  let bar = 0;
  const sec = (prog) => s.progression(bar, prog);
  arpeggio(s, 'gtr', sec('Dm9 Bbmaj7'), V, arp); bar += 2;
  for (const [prog, mel, who] of [[A1, melA1, 'cl'], [A2, melA2, 'cl'], [B, melB, 'pnoM'], [A1, melA1, 'pnoM'], [A2, melA2, 'pnoM']]) {
    const c = sec(prog);
    arpeggio(s, 'gtr', c, V, arp);
    bassline(s, 'bs', c, V, [[0, 3, 0.45]]);
    s.melody(who, bar, mel, { vel: who === 'cl' ? 0.7 : 0.6 });
    if (prog === B) sustained(s, 'pad', c, V, { vel: 0.5 });
    if (who === 'pnoM' && prog !== B) { underVoice(s, 'pnoM', 'cl2', c, V, { vel: 0.5 }); sustained(s, 'pad', c, V, { vel: 0.38 }); }
    bar += 8;
  }
  const coda = sec('Bbmaj7 Cadd9 Dm9 Dm9');
  arpeggio(s, 'gtr', coda.slice(0, 3), V, { ...arp, vel: 0.34 });
  sustained(s, 'pad', coda, V, { vel: 0.4 });
  s.melody('cl', bar, 'F4:2 A4:2 | G4:2 E4:2 | F4:4 | D4:4', { vel: 0.55 });
  s.push('gtr', (bar + 3) * 4, 5, [midi('D2'), midi('A2'), midi('F3'), midi('C4'), midi('E4')], 0.35);
  s.ritard(bar, bar + 4, 0.3);
  s.dyn = [[0, -4], [2, 0], [bar, 0], [bar + 4, -6]];
  return [s, {
    gtr: { role: 'acc', inst: 'guitar', vol: 0.85, pan: -0.2, reverb: 0.3, bright: 0.38, strum: 0.012 },
    bs: { role: 'bass', inst: 'bass', vol: 0.5, reverb: 0.08 },
    cl: { role: 'lead', trim: -1, inst: 'wind', kind: 'clarinet', vol: 0.8, pan: 0.15, reverb: 0.42, legato: 1.02 },
    cl2: { role: 'counter', inst: 'wind', kind: 'clarinet', vol: 0.5, pan: -0.25, reverb: 0.5, legato: 1.02 },
    pnoM: { role: 'lead', inst: 'piano', vol: 1, pan: 0.12, reverb: 0.45 },
    pad: { role: 'pad', inst: 'strings', vol: 0.55, cutoff: 900, reverb: 0.55 },
  }, { room: { rt60: 2.4, gain: 0.9, seed: 41 } }];
}

// V. FIREFLIES — fá maior, 58 BPM. A primeira noite: piano de feltro quase sozinho, como quem toca
// baixinho para não acordar ninguém. (Havia vaga-lumes de celesta, notas agudas soltas; o autor
// ouviu como um "pim pim" do nada, e eles saíram.)
function fireflies() {
  const s = new Score({ name: 'valley-fireflies', bpm: 58, bpb: 4 });
  const V = {
    Fadd9: { bass: 'F2', up: ['C3', 'G3', 'A3'] },
    Am7: { bass: 'A1', up: ['E3', 'G3', 'C4'] },
    Bbmaj7: { bass: 'Bb1', up: ['F3', 'A3', 'D4'] },
    'F/A': { bass: 'A2', up: ['F3', 'A3', 'C4'] },
    Bb: { bass: 'Bb1', up: ['F3', 'Bb3', 'D4'] },
    Gm7: { bass: 'G2', up: ['F3', 'Bb3', 'D4'] },
    Csus4: { bass: 'C2', up: ['F3', 'G3', 'C4'] },
    C: { bass: 'C2', up: ['E3', 'G3', 'C4'] },
    Dm7: { bass: 'D2', up: ['F3', 'A3', 'C4'] },
    'C/E': { bass: 'E2', up: ['G3', 'C4', 'D4'] },
    Fmaj7: { bass: 'F2', up: ['C3', 'A3', 'E4'] },
  };
  const A1 = 'Fadd9 Am7 Bbmaj7 F/A Gm7 F/A Bb Csus4';
  const A2 = 'Fadd9 Am7 Bbmaj7 F/A Gm7 F/A Gm7:2 C:2 Fadd9';
  const B = 'Dm7 Am7 Bbmaj7 Fmaj7 Dm7 C/E Bb Csus4';
  const melA1 = 'C5:2 A4:1 G4:1 | A4:2 -:2 | D5:1.5 C5:0.5 A4:2 | C5:3 -:1 | Bb4:2 A4:1 G4:1 | A4:2 F4:2 | G4:1 A4:1 Bb4:1 D5:1 | C5:3 -:1';
  const melA2 = 'C5:2 A4:1 G4:1 | A4:2 -:2 | D5:1.5 C5:0.5 A4:2 | C5:3 -:1 | Bb4:2 A4:1 G4:1 | A4:2 F4:2 | Bb4:1 A4:1 G4:1 E4:1 | F4:3 -:1';
  const melB = 'D5:2 E5:1 F5:1 | E5:2 C5:2 | D5:1 C5:1 A4:2 | C5:3 -:1 | A4:1 D5:1 F5:2 | E5:1.5 D5:0.5 C5:2 | D5:1 C5:1 Bb4:1 A4:1 | G4:3 -:1';
  // a mão esquerda: baixo no um, as três notas do acorde subindo devagar
  const lh = { pattern: [0, 1, 2, 3, null, 2, 1, null], step: 0.5, ring: 5, vel: 0.34, accent: 1.3 };
  let bar = 0;
  const sec = (prog) => s.progression(bar, prog);
  arpeggio(s, 'lh', sec('Fadd9 Bbmaj7'), V, lh); bar += 2;
  for (const [prog, mel, part] of [[A1, melA1, 1], [A2, melA2, 1], [B, melB, 2], [A1, melA1, 3], [A2, melA2, 3]]) {
    const c = sec(prog);
    arpeggio(s, 'lh', c, V, lh);
    s.melody('rh', bar, mel, { vel: part === 2 ? 0.58 : 0.55 });
    if (part >= 2) sustained(s, 'pad', c, V, { vel: part === 2 ? 0.5 : 0.38 });
    bar += 8;
  }
  const coda = sec('Bb F/A Gm7 Fadd9 Fadd9');
  arpeggio(s, 'lh', coda.slice(0, 4), V, { ...lh, vel: 0.3 });
  sustained(s, 'pad', coda, V, { vel: 0.35 });
  s.melody('rh', bar, 'D5:2 C5:2 | A4:4 | Bb4:2 G4:2 | A4:4 | [F4,C5]:4', { vel: 0.46 });
  s.ritard(bar, bar + 5, 0.32);
  s.dyn = [[0, -4], [2, 0], [bar, 0], [bar + 5, -6]];
  return [s, {
    lh: { role: 'acc', trim: -0.5, inst: 'piano', vol: 0.8, pan: -0.1, reverb: 0.5, bright: 0.75, human: 0.012, release: 0.6 },
    rh: { role: 'lead', inst: 'piano', vol: 1, pan: 0.08, reverb: 0.5, human: 0.012, release: 0.5 },
    pad: { role: 'pad', inst: 'strings', vol: 0.5, cutoff: 800, reverb: 0.6, attack: 2.4 },
  }, { room: { rt60: 2.9, gain: 1, seed: 53 }, lpHz: 8000 }];
}

// VI. MOON OVER THE LAKE — dórico de sol, 56 BPM. Noite funda: o mi natural do dórico é o luar na água.
// Flauta grave e piano em arpejo lento sobre cordas.
function moon() {
  const s = new Score({ name: 'valley-moon', bpm: 56, bpb: 4 });
  const V = {
    Gm9: { bass: 'G1', up: ['D3', 'F3', 'Bb3', 'D4'] },
    'C/G': { bass: 'G1', up: ['E3', 'G3', 'C4', 'D4'] },
    Bbmaj7: { bass: 'Bb1', up: ['F3', 'Bb3', 'D4'] },
    'F/A': { bass: 'A1', up: ['F3', 'A3', 'C4'] },
    Cadd9: { bass: 'C2', up: ['G3', 'D4', 'E4'] },
    Dm7: { bass: 'D2', up: ['F3', 'A3', 'C4'] },
    F: { bass: 'F2', up: ['F3', 'A3', 'C4'] },
    C: { bass: 'C2', up: ['E3', 'G3', 'C4'] },
    Am7: { bass: 'A1', up: ['E3', 'G3', 'C4'] },
  };
  const A1 = 'Gm9 C/G Gm9 C/G Bbmaj7 F/A Cadd9 Dm7';
  const A2 = 'Gm9 C/G Gm9 C/G Bbmaj7 F/A Cadd9 Gm9';
  const B = 'Dm7 Bbmaj7 F C Dm7 Bbmaj7 Am7 C/G';
  const melA1 = 'D5:2 Bb4:1 A4:1 | G4:3 -:1 | Bb4:1 C5:1 D5:1.5 F5:0.5 | E5:3 -:1 | D5:2 C5:1 Bb4:1 | A4:2 C5:2 | D5:1 E5:1 G5:1 E5:1 | D5:3 -:1';
  const melA2 = 'D5:2 Bb4:1 A4:1 | G4:3 -:1 | Bb4:1 C5:1 D5:1.5 F5:0.5 | E5:3 -:1 | D5:2 C5:1 Bb4:1 | A4:2 C5:2 | E5:1 D5:1 C5:1 A4:1 | G4:3 -:1';
  const melB = 'F4:1.5 A4:0.5 C5:2 | D5:1.5 C5:0.5 A4:2 | C5:1 A4:1 G4:1 F4:1 | G4:3 -:1 | A4:2 D5:2 | F5:1.5 D5:0.5 C5:2 | C5:1 A4:1 G4:1 E4:1 | G4:3 -:1';
  const arp = { pattern: [0, 1, 2, 3, 4, 3, 2, 1], step: 0.5, ring: 4, vel: 0.3, accent: 1.35 };
  let bar = 0;
  const sec = (prog) => s.progression(bar, prog);
  { const c = sec('Gm9 C/G'); arpeggio(s, 'pno', c, V, arp); sustained(s, 'pad', c, V, { vel: 0.4 }); bar += 2; }
  for (const [prog, mel, who] of [[A1, melA1, 'fl'], [A2, melA2, 'fl'], [B, melB, 'pnoM'], [A1, melA1, 'fl'], [A2, melA2, 'fl']]) {
    const c = sec(prog);
    arpeggio(s, 'pno', c, V, who === 'pnoM' ? { ...arp, vel: 0.24 } : arp);
    sustained(s, 'pad', c, V, { vel: 0.45 });
    s.melody(who, bar, mel, { vel: who === 'fl' ? 0.62 : 0.58 });
    if (bar > 20 && who === 'fl') underVoice(s, 'fl', 'cel', c, V, { vel: 0.22, minGap: 3 });
    bar += 8;
  }
  const coda = sec('Gm9 C/G Gm9 Gm9');
  arpeggio(s, 'pno', coda.slice(0, 3), V, { ...arp, vel: 0.26 });
  sustained(s, 'pad', coda, V, { vel: 0.35 });
  s.melody('fl', bar, 'D5:2 Bb4:2 | E5:4 | D5:4 | G4:4', { vel: 0.5 });
  s.ritard(bar, bar + 4, 0.3);
  s.dyn = [[0, -4], [2, 0], [bar, 0], [bar + 4, -6]];
  return [s, {
    pno: { role: 'acc', inst: 'piano', vol: 0.85, pan: -0.15, reverb: 0.55, bright: 0.7, human: 0.012, release: 0.8 },
    pnoM: { role: 'lead', inst: 'piano', vol: 1, pan: 0.1, reverb: 0.55, release: 0.6 },
    fl: { role: 'lead', trim: -1, inst: 'wind', kind: 'flute', vol: 0.72, pan: 0.12, reverb: 0.55, legato: 1.02 },
    cel: { role: 'spark', trim: -2, inst: 'celesta', vol: 0.35, pan: 0.35, reverb: 0.75, tau: 3 },
    pad: { role: 'pad', trim: 1, inst: 'strings', vol: 0.6, cutoff: 850, reverb: 0.6, attack: 2.4 },
  }, { room: { rt60: 3.1, gain: 1.05, seed: 61 }, lpHz: 7500 }];
}

// A CANÇÃO DE NINAR — título e créditos. Fá maior em 6/8, embalando (colcheia a 150): piano de feltro
// balançando, celesta macia na melodia e, na volta, a flauta. É um loop sem emenda.
function lullaby() {
  const s = new Score({ name: 'music-lullaby', bpm: 150, bpb: 6 });
  const V = {
    F: { bass: 'F2', up: ['C3', 'A3', 'C4'] },
    Dm: { bass: 'D2', up: ['A2', 'F3', 'A3'] },
    Bb: { bass: 'Bb1', up: ['F2', 'D3', 'F3'] },
    C: { bass: 'C2', up: ['G2', 'E3', 'G3'] },
    Csus4: { bass: 'C2', up: ['G2', 'F3', 'G3'] },
    Am: { bass: 'A1', up: ['E2', 'C3', 'E3'] },
    Gm7: { bass: 'G1', up: ['D3', 'F3', 'G3'] },
  };
  const A = 'F Dm Bb C F Am Bb Csus4:3 C:3';
  const B = 'Dm Bb F C Dm Bb Gm7:3 C:3 F';
  const melA = 'A4:2 C5:1 A4:2 F4:1 | D5:2 C5:1 A4:3 | Bb4:2 D5:1 Bb4:2 F4:1 | G4:6 | A4:2 C5:1 F5:2 E5:1 | E5:2 D5:1 C5:3 | D5:2 C5:1 Bb4:2 G4:1 | F4:3 E4:3';
  const melB = 'D5:3 A4:3 | Bb4:2 C5:1 D5:3 | C5:3 A4:3 | G4:2 A4:1 G4:3 | F4:2 A4:1 D5:3 | D5:2 C5:1 Bb4:3 | Bb4:2 A4:1 G4:3 | F4:6';
  // balanço do 6/8: baixo no um, acorde no quatro, uma nota de passagem no seis
  const rock = [[0, 3.2, 0.42, 'bass'], [3, 2.6, 0.24, 'up'], [5, 1, 0.16, 'bass']];
  let bar = 0;
  const sec = (prog) => s.progression(bar, prog);
  for (const [prog, mel, who] of [[A, melA, 'cel'], [B, melB, 'cel'], [A, melA, 'fl'], [B, melB, 'fl']]) {
    const c = sec(prog);
    blocks(s, 'pno', c, V, rock);
    s.melody(who, bar, mel, { vel: who === 'cel' ? 0.62 : 0.6 });
    if (who === 'fl') { sustained(s, 'pad', c, V, { vel: 0.4 }); s.melody('celE', bar, mel, { vel: 0.22, oct: -12 }); }
    bar += 8;
  }
  return [s, {
    pno: { role: 'acc', inst: 'piano', vol: 0.9, reverb: 0.5, bright: 0.75, human: 0.01, release: 0.7 },
    cel: { role: 'lead', inst: 'celesta', vol: 0.9, pan: 0.15, reverb: 0.6, tau: 2.4 },
    celE: { role: 'spark', inst: 'celesta', vol: 0.5, pan: -0.25, reverb: 0.7, tau: 2 },
    fl: { role: 'lead', trim: -1, inst: 'wind', kind: 'flute', vol: 0.7, pan: 0.12, reverb: 0.55, legato: 1.02 },
    pad: { role: 'pad', inst: 'strings', vol: 0.5, cutoff: 800, reverb: 0.6, attack: 2.2 },
  }, { room: { rt60: 2.8, gain: 1, seed: 71 }, loop: true, lpHz: 8000 }];
}

// AS CAMADAS DO LUGAR. Vinte segundos sem pulso (soam em cima de qualquer peça, ou sozinhas no
// silêncio entre elas), só com a pentatônica de fá — que cabe em todos os modos daqui.
function layerWater() {
  const s = new Score({ name: 'music-layer-water', bpm: 60, bpb: 4 });
  // gotas de celesta, espaçadas como água pingando de uma folha
  s.melody('cel', 0, "-:1 C5:1.5 A4:1.5' | -:2.5 D5:1.5 | -:3 G4:1' | F5:2 -:2 | -:1.5 C5:1 D5:1.5'");
  s.loopBeats = 20;
  return [s, { cel: { role: 'solo', inst: 'celesta', vol: 0.8, reverb: 0.8, tau: 2.6, spread: 0.6 } },
    { room: { rt60: 3, gain: 1.1, seed: 81 }, loop: true, lpHz: 6500, target: -27 }];
}
function layerFire() {
  const s = new Score({ name: 'music-layer-fire', bpm: 60, bpb: 10 });
  s.loopBeats = 20;
  // o calor de perto do fogo: um fá e um dó graves de cordas, respirando
  s.melody('pad', 0, '[F2,C3]:10 | [F2,C3,A3]:10', { vel: 0.6 });
  s.melody('pad2', 0, '-:4 C4:6 | -:2 A3:8', { vel: 0.4 });
  return [s, {
    pad: { role: 'solo', inst: 'strings', vol: 0.9, cutoff: 700, reverb: 0.5, attack: 3, release: 4 },
    pad2: { role: 'counter', inst: 'strings', vol: 0.5, cutoff: 900, reverb: 0.6, attack: 3, release: 4 },
  }, { room: { rt60: 2.5, gain: 0.9, seed: 91 }, loop: true, lpHz: 5000, target: -27 }];
}

const PIECES = {
  'valley-morning': morning,
  'valley-waltz': waltz,
  'valley-clouds': clouds,
  'valley-golden': golden,
  'valley-fireflies': fireflies,
  'valley-moon': moon,
  'music-lullaby': lullaby,
  'music-layer-water': layerWater,
  'music-layer-fire': layerFire,
};

// A REVISÃO DA PARTITURA, antes de qualquer som: duas notas a um semitom (ou a uma nona menor) soando
// juntas por mais de meio tempo são o atrito que uma trilha para relaxar não pode ter. Cada choque
// sai com peça, compasso, faixas e notas. `--check` só confere, sem renderizar.
const NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const nm = (m) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;
function audit(score) {
  const flat = Object.entries(score.tracks).flatMap(([track, evs]) => evs.flatMap((e) => e.notes.map((m) => ({ track, m, a: e.beat, b: e.beat + e.dur }))));
  flat.sort((x, y) => x.a - y.a);
  const found = new Map();
  for (let i = 0; i < flat.length; i++) {
    for (let j = i + 1; j < flat.length && flat[j].a < flat[i].b; j++) {
      const x = flat[i], y = flat[j];
      const overlap = Math.min(x.b, y.b) - Math.max(x.a, y.a);
      const d = Math.abs(x.m - y.m);
      if (overlap >= 0.5 && (d === 1 || d === 13)) {
        const bar = Math.floor(Math.max(x.a, y.a) / score.bpb);
        const key = `${bar}:${[nm(x.m), nm(y.m)].sort().join('-')}`;
        if (!found.has(key)) found.set(key, `compasso ${bar}: ${x.track} ${nm(x.m)} × ${y.track} ${nm(y.m)}`);
      }
    }
  }
  // fora de fá maior (as camadas de água e fogo só cabem em cima de peças que não saem dele)
  const KEY = new Set([5, 7, 9, 10, 0, 2, 4]);
  for (const x of flat) if (!KEY.has(x.m % 12)) found.set(`fora:${x.track}:${x.m}`, `${x.track}: ${nm(x.m)} está fora de fá maior (compasso ${Math.floor(x.a / score.bpb)})`);
  // brilho baixo: melodia de sopro e de piano até o lá 5; só a celesta passa disso, e fraca
  for (const x of flat) if (x.m > midi('A5') && !/^cel/.test(x.track)) found.set(`alto:${x.track}:${x.m}`, `${x.track}: ${nm(x.m)} é agudo demais (compasso ${Math.floor(x.a / score.bpb)})`);
  return [...found.values()];
}

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
const only = args.filter((a) => !a.startsWith('--'));
const chosen = only.length ? Object.entries(PIECES).filter(([n]) => only.includes(n)) : Object.entries(PIECES);
if (only.length && !chosen.length) {
  console.error(`Nenhuma peça com esse nome. Conhecidas: ${Object.keys(PIECES).join(', ')}`);
  process.exit(1);
}
for (const [name, build] of chosen) {
  const t0 = Date.now();
  const [score, arrangement, opts] = build();
  const clashes = audit(score);
  if (clashes.length) console.log(`${name}: ${clashes.length} choque(s) de semitom\n  ${clashes.join('\n  ')}`);
  if (checkOnly) continue;
  const { L, R, loopLen } = render(score, arrangement, opts);
  const bytes = writeWav(`${name}.wav`, L, R);
  const secs = L.length / SR;
  console.log(`${name.padEnd(20)} ${secs.toFixed(2).padStart(7)} s${opts.loop ? ` (loop ${loopLen} amostras)` : ''}  ${(bytes / 1048576).toFixed(1)} MB  ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

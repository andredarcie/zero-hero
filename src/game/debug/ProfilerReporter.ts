// O RELATÓRIO DO PROFILER: o que se lê depois de uma rodada (window.__prof.report() e .csv()). Só leitura das amostras
// que o Profiler gravou: nada aqui mede nada.

import type { Profiler } from './Profiler';

export interface Spike {
  frame: number;
  dt: number;
  cpu: number;
  gpu: number;
  /** The costliest sections that frame, biggest first. */
  worst: Array<{ section: string; ms: number }>;
  /** Shader programs compiled on this frame (the classic invisible stall). */
  programsAdded: number;
  /** Change in the scene's point-light count — the usual cause of programsAdded. */
  lightsDelta: number;
  marks: string[];
  /** Best guess at the cause, in words. */
  cause: string;
}
export interface Stat {
  p50: number;
  p95: number;
  p99: number;
  max: number;
  avg: number;
}
export interface ProfilerReport {
  frames: number;
  fps: number;
  dt: Stat;
  cpu: Stat;
  /** Null when the driver has no timer-query extension (rare on desktop Chrome). */
  gpu: Stat | null;
  /** Which half is the bottleneck. Tuning the other half is wasted work. */
  bound: 'cpu' | 'gpu' | 'balanced' | 'unknown';
  sections: Array<{ section: string; avgMs: number; p99Ms: number; maxMs: number; shareOfCpu: number }>;
  gauges: Array<{ gauge: string; min: number; avg: number; max: number }>;
  memory: { heapStartMb: number; heapEndMb: number; heapGrowthMb: number };
  programs: { start: number; end: number; compiledDuringRun: number };
  spikes: Spike[];
}
const pct = (sorted: number[], p: number): number =>
  sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];

/** O que ProfilerReporter usa de Profiler. */
export type ProfilerReporterHost = Pick<Profiler,
  'frames' | 'programsCompiled' | 'spikeLog' | 'spikeMs'
>;

export class ProfilerReporter {
  public constructor(private readonly host: ProfilerReporterHost) {}

  public report(): ProfilerReport {
    const usable = this.host.frames.filter((f) => f.dt > 0);
    const r2 = (n: number): number => Math.round(n * 100) / 100;
    const stat = (vals: number[]): Stat => {
      const s = [...vals].sort((a, b) => a - b);
      return {
        p50: r2(pct(s, 50)),
        p95: r2(pct(s, 95)),
        p99: r2(pct(s, 99)),
        max: r2(s[s.length - 1] ?? 0),
        avg: r2(s.reduce((a, b) => a + b, 0) / Math.max(1, s.length)),
      };
    };

    const dt = stat(usable.map((f) => f.dt));
    const cpu = stat(usable.map((f) => f.cpu));
    const gpuFrames = usable.filter((f) => f.gpu >= 0);
    const gpu = gpuFrames.length ? stat(gpuFrames.map((f) => f.gpu)) : null;

    // Per-section percentiles, not just an average: a section that is cheap on median and
    // brutal at p99 (a rebuild, a flood fill) is invisible in a mean.
    const bySection = new Map<string, number[]>();
    for (const f of usable) {
      for (const [k, v] of Object.entries(f.sections)) {
        const arr = bySection.get(k) ?? [];
        arr.push(v);
        bySection.set(k, arr);
      }
    }
    const sections = [...bySection.entries()]
      .map(([section, vals]) => {
        const s = stat(vals);
        return { section, avgMs: s.avg, p99Ms: s.p99, maxMs: s.max, shareOfCpu: r2((s.avg / Math.max(0.001, cpu.avg)) * 100) };
      })
      .sort((a, b) => b.avgMs - a.avgMs);

    // Gauges: min/avg/max of every counter (fires, lights in use, draw calls…).
    const byGauge = new Map<string, number[]>();
    const addGauge = (k: string, v: number): void => {
      const arr = byGauge.get(k) ?? [];
      arr.push(v);
      byGauge.set(k, arr);
    };
    for (const f of usable) {
      addGauge('drawCalls', f.calls);
      addGauge('triangles', f.tris);
      addGauge('geometries', f.geometries);
      addGauge('textures', f.textures);
      for (const [k, v] of Object.entries(f.gauges)) addGauge(k, v);
    }
    const gauges = [...byGauge.entries()]
      .map(([gauge, vals]) => ({
        gauge,
        min: Math.min(...vals),
        avg: r2(vals.reduce((a, b) => a + b, 0) / vals.length),
        max: Math.max(...vals),
      }))
      .sort((a, b) => a.gauge.localeCompare(b.gauge));

    const heapStart = usable[0]?.heapMb ?? 0;
    const heapEnd = usable[usable.length - 1]?.heapMb ?? 0;

    const out: ProfilerReport = {
      frames: usable.length,
      fps: r2(dt.avg === 0 ? 0 : 1000 / dt.avg),
      dt,
      cpu,
      gpu,
      // Which side is actually the bottleneck. Without this you tune the wrong half.
      bound: gpu === null ? 'unknown' : gpu.p50 > cpu.p50 * 1.2 ? 'gpu' : cpu.p50 > gpu.p50 * 1.2 ? 'cpu' : 'balanced',
      sections,
      gauges,
      memory: { heapStartMb: heapStart, heapEndMb: heapEnd, heapGrowthMb: r2(heapEnd - heapStart) },
      programs: {
        start: this.host.frames[0]?.programs ?? 0,
        end: this.host.frames[this.host.frames.length - 1]?.programs ?? 0,
        // Counted per frame, NOT derived from the spike log: a compile that happened to land
        // under the spike threshold is still a compile, and still the thing to go fix.
        compiledDuringRun: this.host.programsCompiled,
      },
      spikes: this.host.spikeLog,
    };

    console.groupCollapsed(
      `%c[prof] ${out.frames} frames · ${out.fps.toFixed(1)} fps · p99 ${out.dt.p99}ms · ` +
        `${out.bound}-bound · ${out.spikes.length} spike(s) · ${out.programs.compiledDuringRun} shader compile(s)`,
      'color:#ffc873;font-weight:bold',
    );
    console.log(
      `frame ${out.dt.p50}ms p50 / ${out.dt.p99}ms p99   ` +
        `cpu ${out.cpu.p50}ms   gpu ${out.gpu ? `${out.gpu.p50}ms` : 'n/a'}   ` +
        `heap ${out.memory.heapEndMb}MB (${out.memory.heapGrowthMb >= 0 ? '+' : ''}${out.memory.heapGrowthMb}MB)`,
    );
    console.table(out.sections);
    console.table(out.gauges);
    if (out.programs.compiledDuringRun > 0) {
      console.warn(
        `${out.programs.compiledDuringRun} shader program(s) compiled DURING the run ` +
          `(${out.programs.start} → ${out.programs.end}). Compiling mid-play always hitches; ` +
          'the usual cause is the scene\'s light count changing.',
      );
    }
    if (out.spikes.length) {
      console.warn(`Spikes (frames over ${this.host.spikeMs}ms):`);
      for (const s of out.spikes) {
        console.warn(
          `  frame ${s.frame}: ${s.dt}ms${s.marks.length ? ` [${s.marks.join(', ')}]` : ''} — ${s.cause}`,
          s.worst,
        );
      }
    } else {
      console.log('%cNo spikes.', 'color:#8f8');
    }
    console.groupEnd();

    return out;
  }

  /** Every frame as CSV — for when you want to plot it rather than read a summary. */
  public csv(): string {
    const gaugeKeys = [...new Set(this.host.frames.flatMap((f) => Object.keys(f.gauges)))].sort();
    const sectionKeys = [...new Set(this.host.frames.flatMap((f) => Object.keys(f.sections)))].sort();
    const head = [
      'frame', 'dtMs', 'cpuMs', 'gpuMs', 'drawCalls', 'triangles', 'programs', 'lights',
      'geometries', 'textures', 'heapMb',
      ...sectionKeys.map((k) => `sec.${k}`),
      ...gaugeKeys.map((k) => `g.${k}`),
      'marks',
    ];
    const rows = this.host.frames.map((f) => [
      f.frame, f.dt.toFixed(3), f.cpu.toFixed(3), f.gpu.toFixed(3), f.calls, f.tris, f.programs,
      f.lights, f.geometries, f.textures, f.heapMb,
      ...sectionKeys.map((k) => (f.sections[k] ?? 0).toFixed(3)),
      ...gaugeKeys.map((k) => f.gauges[k] ?? ''),
      f.marks.join('|'),
    ]);
    return [head.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }
}

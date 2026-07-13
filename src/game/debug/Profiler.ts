import type * as THREE from 'three';

/**
 * Frame profiler for the 3D game loop.
 *
 * It exists because of a class of bug you cannot find by staring at code: the frame
 * that hitches is not the frame that did something obviously expensive. The stall we
 * chased first (setting a bush alight dropped the game to a crawl for a few frames)
 * was a THREE.PointLight being added to the scene — three.js keys every compiled
 * shader program on the scene's light COUNTS, so one scene.add(light) silently threw
 * away and recompiled every lit material in the world. Nothing in the fire code looked
 * slow, and nothing in the fire code was slow.
 *
 * So the profiler records, per frame: the real frame interval, our own CPU time broken
 * down by section, and the GL counters (draw calls, triangles, live shader programs,
 * point lights). When a frame runs long it snapshots WHY — including how many shader
 * programs were compiled and whether the light count moved — and correlates it with
 * whatever gameplay marks were dropped that frame (`profiler.mark('bush.ignite')`).
 * That turns "the game stutters when I burn a bush" into a line of output naming the
 * cause.
 *
 * Off by default and cheap when off: begin/end return immediately, so the calls can
 * live permanently in the hot path.
 *
 *   ?prof             — boot with the profiler running and the HUD up
 *   F3                — toggle the HUD (starts the profiler if idle)
 *   __prof.report()   — summary: fps, percentiles, every spike with its cause
 *   __prof.spikes()   — just the spikes
 *   __prof.record(ms) — profile a window, then auto-report (used by the playtest)
 */

/** A frame slower than this is a hitch worth explaining, not just jitter. */
const DEFAULT_SPIKE_MS = 24; // ~1.5 frames at 60Hz
const HISTORY = 900; // ~15s at 60fps

export interface FrameSample {
  frame: number;
  /** Real interval since the previous frame (ms). The ground truth for a hitch. */
  dt: number;
  /** CPU time we measured inside our own instrumented code (ms). */
  cpu: number;
  /** Real GPU time for the frame (ms), or -1 if the driver could not tell us. */
  gpu: number;
  sections: Record<string, number>;
  calls: number;
  tris: number;
  /** Live compiled shader programs. A jump here means a compile+link stall. */
  programs: number;
  lights: number;
  geometries: number;
  textures: number;
  /** JS heap in MB (Chrome only, 0 elsewhere). A staircase here is a leak. */
  heapMb: number;
  /** Renderer + gameplay gauges (fires, enemies, tweens…). */
  gauges: Record<string, number>;
  marks: string[];
}

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

/** What the profiler needs from the renderer each frame. World3D satisfies this. */
export interface ProfilerSource {
  readonly rendererInfo: THREE.WebGLRenderer['info'];
  readonly lightCount: number;
  readonly gl: WebGLRenderingContext | WebGL2RenderingContext;
  /** Free-form renderer gauges (fires, casters, scene objects…), sampled every frame. */
  stats(): Record<string, number>;
}

/**
 * Real GPU time per frame, via EXT_disjoint_timer_query_webgl2.
 *
 * Worth the trouble: fragment cost is INVISIBLE to a CPU timer. `composer.render()` only
 * submits work — it returns long before the GPU has drawn anything, so a change that makes
 * every lit pixel more expensive (one more light in the scene, a heavier shader, more
 * overdraw) shows up as "the frame interval got worse" and nothing else. Without this, you
 * can only see THAT the frame got slower, never that the GPU is what got slower.
 *
 * Results arrive a few frames late, so each query carries the frame it belongs to.
 */
class GpuTimer {
  private ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null = null;
  private gl2: WebGL2RenderingContext | null = null;
  private active: WebGLQuery | null = null;
  private pending: Array<{ query: WebGLQuery; frame: number }> = [];
  private spare: WebGLQuery[] = [];
  /** frame → GPU ms, drained by the profiler once the driver hands the result back. */
  public readonly results = new Map<number, number>();

  public attach(gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.reset();
    const gl2 = (typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext)
      ? gl : null;
    this.gl2 = gl2;
    this.ext = gl2?.getExtension('EXT_disjoint_timer_query_webgl2') ?? null;
  }

  public get supported(): boolean {
    return this.ext !== null && this.gl2 !== null;
  }

  public begin(frame: number): void {
    const { gl2, ext } = this;
    if (!gl2 || !ext || this.active) return;
    const query = this.spare.pop() ?? gl2.createQuery();
    if (!query) return;
    gl2.beginQuery(ext.TIME_ELAPSED_EXT, query);
    this.active = query;
    this.activeFrame = frame;
  }

  public end(): void {
    const { gl2, ext } = this;
    if (!gl2 || !ext || !this.active) return;
    gl2.endQuery(ext.TIME_ELAPSED_EXT);
    this.pending.push({ query: this.active, frame: this.activeFrame });
    this.active = null;
    this.poll();
  }

  private activeFrame = 0;

  /** Collect whatever the driver has finished. Queries resolve a few frames after the fact. */
  private poll(): void {
    const { gl2, ext } = this;
    if (!gl2 || !ext) return;
    // A "disjoint" means the GPU was interrupted (clock changed, context lost slice…) and
    // every in-flight timing is garbage. Throw them away rather than report a fantasy.
    const disjoint = gl2.getParameter(ext.GPU_DISJOINT_EXT);
    for (let i = this.pending.length - 1; i >= 0; i -= 1) {
      const p = this.pending[i];
      if (!gl2.getQueryParameter(p.query, gl2.QUERY_RESULT_AVAILABLE)) continue;
      if (!disjoint) {
        this.results.set(p.frame, gl2.getQueryParameter(p.query, gl2.QUERY_RESULT) / 1e6);
      }
      this.pending.splice(i, 1);
      this.spare.push(p.query);
    }
  }

  public reset(): void {
    this.results.clear();
    this.pending = [];
    this.active = null;
  }
}

const pct = (sorted: number[], p: number): number =>
  sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];

class Profiler {
  public enabled = false;
  public spikeMs = DEFAULT_SPIKE_MS;

  private source?: ProfilerSource;
  private readonly gpuTimer = new GpuTimer();

  private frames: FrameSample[] = [];
  private spikeLog: Spike[] = [];
  private frameNo = 0;

  private tFrameStart = 0;
  private tPrevEnd = 0;
  private openSections = new Map<string, number>();
  private sections: Record<string, number> = {};
  private pendingMarks: string[] = [];
  private pendingGauges: Record<string, number> = {};
  private prevPrograms = 0;
  private prevLights = 0;
  /** Shader programs compiled since the recording started — the count that must stay 0. */
  private programsCompiled = 0;

  private hud?: HTMLDivElement;
  private hudAcc = 0;

  /** Bind to the live renderer. Safe to call again when a scene restarts. */
  public attach(source: ProfilerSource): void {
    this.source = source;
    this.gpuTimer.attach(source.gl);
    this.prevPrograms = source.rendererInfo.programs?.length ?? 0;
    this.prevLights = source.lightCount;
  }

  public detach(): void {
    this.source = undefined;
    this.gpuTimer.reset();
    this.enabled = false;
    this.hideHud();
  }

  /**
   * Record a gameplay counter for this frame (enemies alive, tweens running…). Correlating a
   * spike with what the game was DOING is usually faster than reading any timing.
   */
  public gauge(name: string, value: number): void {
    if (!this.enabled) return;
    this.pendingGauges[name] = value;
  }

  /** Bracket the GPU work of the frame. Called around composer.render() in World3D. */
  public gpuBegin(): void {
    if (this.enabled) this.gpuTimer.begin(this.frameNo);
  }

  public gpuEnd(): void {
    if (this.enabled) this.gpuTimer.end();
  }

  public start(): void {
    this.reset();
    this.enabled = true;
  }

  public stop(): void {
    this.enabled = false;
  }

  public reset(): void {
    this.frames = [];
    this.spikeLog = [];
    this.frameNo = 0;
    this.programsCompiled = 0;
    this.tPrevEnd = 0;
    this.sections = {};
    this.openSections.clear();
    this.pendingMarks = [];
    this.pendingGauges = {};
    this.gpuTimer.reset();
    this.prevPrograms = this.source?.rendererInfo.programs?.length ?? 0;
    this.prevLights = this.source?.lightCount ?? 0;
  }

  /**
   * Tag this frame with a gameplay event, so a spike can be blamed on the thing that
   * actually happened ("bush.ignite") instead of on whichever section absorbed the cost.
   */
  public mark(label: string): void {
    if (!this.enabled) return;
    this.pendingMarks.push(label);
  }

  public frameStart(): void {
    if (!this.enabled) return;
    this.tFrameStart = performance.now();
    this.sections = {};
    this.openSections.clear();
  }

  public begin(section: string): void {
    if (!this.enabled) return;
    this.openSections.set(section, performance.now());
  }

  public end(section: string): void {
    if (!this.enabled) return;
    const t0 = this.openSections.get(section);
    if (t0 === undefined) return;
    this.openSections.delete(section);
    this.sections[section] = (this.sections[section] ?? 0) + (performance.now() - t0);
  }

  public frameEnd(): void {
    if (!this.enabled) return;
    const now = performance.now();
    const dt = this.tPrevEnd === 0 ? 0 : now - this.tPrevEnd;
    this.tPrevEnd = now;

    const info = this.source?.rendererInfo;
    const programs = info?.programs?.length ?? 0;
    const lights = this.source?.lightCount ?? 0;
    const programsAdded = programs - this.prevPrograms;
    const lightsDelta = lights - this.prevLights;
    const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;

    const sample: FrameSample = {
      frame: this.frameNo,
      dt,
      cpu: now - this.tFrameStart,
      gpu: -1, // back-filled below, once the driver returns the query
      sections: this.sections,
      calls: info?.render.calls ?? 0,
      tris: info?.render.triangles ?? 0,
      programs,
      lights,
      geometries: info?.memory.geometries ?? 0,
      textures: info?.memory.textures ?? 0,
      heapMb: heap ? Math.round((heap.usedJSHeapSize / 1048576) * 10) / 10 : 0,
      gauges: { ...this.pendingGauges, ...(this.source?.stats() ?? {}) },
      marks: this.pendingMarks,
    };

    this.frames.push(sample);
    if (this.frames.length > HISTORY) this.frames.shift();
    if (programsAdded > 0) this.programsCompiled += programsAdded;

    // GPU queries resolve a few frames after the fact — stitch each result back onto the
    // frame it actually measured, so `gpu` lines up with the spike that caused it.
    if (this.gpuTimer.results.size > 0) {
      for (let i = this.frames.length - 1; i >= 0; i -= 1) {
        const f = this.frames[i];
        if (f.gpu >= 0) break; // everything older is already filled
        const ms = this.gpuTimer.results.get(f.frame);
        if (ms !== undefined) {
          f.gpu = ms;
          this.gpuTimer.results.delete(f.frame);
        }
      }
    }

    // dt is 0 on the very first frame (nothing to measure an interval against), so it can
    // never trip the threshold — no frame-number guard needed. Do NOT add one: a recording
    // started immediately before the event under test would swallow the very spike it exists
    // to catch, and report a clean run.
    if (dt > this.spikeMs) {
      this.spikeLog.push(this.describeSpike(sample, programsAdded, lightsDelta));
    }

    this.prevPrograms = programs;
    this.prevLights = lights;
    this.frameNo += 1;
    this.pendingMarks = [];
    this.pendingGauges = {};
    this.updateHud(now, sample);
  }

  private describeSpike(s: FrameSample, programsAdded: number, lightsDelta: number): Spike {
    const worst = Object.entries(s.sections)
      .map(([section, ms]) => ({ section, ms: Math.round(ms * 100) / 100 }))
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 4);

    const reasons: string[] = [];
    if (lightsDelta !== 0) {
      reasons.push(
        `point-light count changed by ${lightsDelta > 0 ? '+' : ''}${lightsDelta} (→${s.lights}) ` +
          '— three.js recompiles EVERY lit material when it does',
      );
    }
    if (programsAdded > 0) {
      reasons.push(`${programsAdded} shader program(s) compiled+linked`);
    }
    if (reasons.length === 0) {
      const top = worst[0];
      if (s.gpu >= 0 && s.gpu > s.dt * 0.6) {
        // The GPU, not us. More lights, more overdraw, a heavier shader, a bigger target.
        reasons.push(`GPU-bound (${s.gpu.toFixed(1)}ms on GPU vs ${s.cpu.toFixed(1)}ms on CPU)`);
      } else if (top && top.ms > s.dt * 0.4) {
        reasons.push(`CPU-bound in "${top.section}" (${top.ms}ms)`);
      } else if (s.cpu < s.dt * 0.5) {
        reasons.push('stall outside our instrumented code (GC, browser, or a blocking driver call)');
      } else {
        reasons.push('CPU spread across sections');
      }
    }

    return {
      frame: s.frame,
      dt: Math.round(s.dt * 100) / 100,
      cpu: Math.round(s.cpu * 100) / 100,
      gpu: Math.round(s.gpu * 100) / 100,
      worst,
      programsAdded,
      lightsDelta,
      marks: s.marks,
      cause: reasons.join('; '),
    };
  }

  public spikes(): Spike[] {
    return this.spikeLog;
  }

  public samples(): FrameSample[] {
    return this.frames;
  }

  public report(): ProfilerReport {
    const usable = this.frames.filter((f) => f.dt > 0);
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

    // Gauges: min/avg/max of every counter (fires, lights in use, enemies, draw calls…).
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
        start: this.frames[0]?.programs ?? 0,
        end: this.frames[this.frames.length - 1]?.programs ?? 0,
        // Counted per frame, NOT derived from the spike log: a compile that happened to land
        // under the spike threshold is still a compile, and still the thing to go fix.
        compiledDuringRun: this.programsCompiled,
      },
      spikes: this.spikeLog,
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
      console.warn(`Spikes (frames over ${this.spikeMs}ms):`);
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
    const gaugeKeys = [...new Set(this.frames.flatMap((f) => Object.keys(f.gauges)))].sort();
    const sectionKeys = [...new Set(this.frames.flatMap((f) => Object.keys(f.sections)))].sort();
    const head = [
      'frame', 'dtMs', 'cpuMs', 'gpuMs', 'drawCalls', 'triangles', 'programs', 'lights',
      'geometries', 'textures', 'heapMb',
      ...sectionKeys.map((k) => `sec.${k}`),
      ...gaugeKeys.map((k) => `g.${k}`),
      'marks',
    ];
    const rows = this.frames.map((f) => [
      f.frame, f.dt.toFixed(3), f.cpu.toFixed(3), f.gpu.toFixed(3), f.calls, f.tris, f.programs,
      f.lights, f.geometries, f.textures, f.heapMb,
      ...sectionKeys.map((k) => (f.sections[k] ?? 0).toFixed(3)),
      ...gaugeKeys.map((k) => f.gauges[k] ?? ''),
      f.marks.join('|'),
    ]);
    return [head.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  /** Profile a fixed window, then report. Returns the report — what the playtest awaits. */
  public async record(ms = 3000): Promise<ReturnType<Profiler['report']>> {
    this.start();
    await new Promise((r) => setTimeout(r, ms));
    this.stop();
    return this.report();
  }

  // ── HUD ─────────────────────────────────────────────────────────────────────

  public toggleHud(): void {
    if (this.hud) this.hideHud();
    else this.showHud();
  }

  public showHud(): void {
    if (this.hud) return;
    if (!this.enabled) this.start();
    const el = document.createElement('div');
    el.id = 'zh-prof-hud';
    el.style.cssText =
      'position:fixed;top:8px;left:8px;z-index:9999;pointer-events:none;' +
      'font:11px/1.45 ui-monospace,Consolas,monospace;color:#d7e2ff;' +
      'background:rgba(8,10,20,.82);border:1px solid rgba(255,200,115,.35);' +
      'border-radius:4px;padding:6px 9px;white-space:pre;text-shadow:0 1px 0 #000;';
    document.body.appendChild(el);
    this.hud = el;
  }

  public hideHud(): void {
    this.hud?.remove();
    this.hud = undefined;
  }

  private updateHud(now: number, s: FrameSample): void {
    const hud = this.hud;
    if (!hud) return;
    // Refresh at 5Hz — a HUD that repaints every frame is itself a cost, and a number
    // that changes 60 times a second is unreadable anyway.
    if (now - this.hudAcc < 200) return;
    this.hudAcc = now;

    const recent = this.frames.slice(-60).filter((f) => f.dt > 0);
    const dts = recent.map((f) => f.dt).sort((a, b) => a - b);
    const avg = dts.reduce((a, b) => a + b, 0) / Math.max(1, dts.length);
    const worst = Object.entries(s.sections).sort((a, b) => b[1] - a[1])[0];
    // The most recent frame whose GPU query has come back (the last few are always pending).
    const gpuMs = recent.filter((f) => f.gpu >= 0).pop()?.gpu ?? -1;
    const used = s.gauges.fireLightsUsed;

    hud.textContent = [
      `fps  ${(1000 / Math.max(0.01, avg)).toFixed(0).padStart(3)}   ${avg.toFixed(1)}ms  p99 ${pct(dts, 99).toFixed(1)}ms`,
      // CPU vs GPU side by side: a change that only costs fragments (an extra light, more
      // overdraw) moves the GPU number and nothing else. Reading CPU alone hides it.
      `cpu  ${s.cpu.toFixed(1)}ms    gpu ${gpuMs >= 0 ? `${gpuMs.toFixed(1)}ms` : ' n/a'}`,
      `hot  ${worst ? `${worst[0]} ${worst[1].toFixed(1)}ms` : '—'}`,
      `gl   ${s.calls} calls  ${(s.tris / 1000).toFixed(1)}k tris  ${s.programs} shaders`,
      `fire ${s.gauges.litFires ?? 0} lit / ${s.gauges.fires ?? 0}   lights ${s.lights}${used === undefined ? '' : ` (${used} on fires)`}`,
      `heap ${s.heapMb}MB   spikes ${this.spikeLog.length}`,
      this.spikeLog.length ? `last: ${this.spikeLog[this.spikeLog.length - 1].cause.slice(0, 44)}` : '',
    ].filter(Boolean).join('\n');
  }
}

export const profiler = new Profiler();

/** Wire the profiler to a scene's renderer and expose it on window (dev only). */
export const initProfiler = (source: ProfilerSource): void => {
  if (!import.meta.env.DEV) return;
  profiler.attach(source);

  const w = window as unknown as { __prof?: Profiler };
  if (!w.__prof) {
    w.__prof = profiler;
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F3') {
        e.preventDefault();
        profiler.toggleHud();
      }
    });
  }

  if (new URLSearchParams(window.location.search).has('prof')) {
    profiler.start();
    profiler.showHud();
  }
};

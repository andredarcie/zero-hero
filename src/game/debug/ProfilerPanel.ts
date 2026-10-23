import type { FrameSample, Spike } from './Profiler';

/**
 * O PAINEL DO PROFILER (F3) — o "top" do jogo.
 *
 * Dois tamanhos, porque são duas perguntas diferentes:
 *
 *   · `compact` — "está tudo bem?": fps, cpu x gpu, a seção mais cara. Fica na tela jogando.
 *   · `top`     — "para onde foi o quadro?": o gráfico dos últimos 240 quadros (cada barra é um
 *                 quadro, as linhas são 60 e 30 fps), o 1% low, a tabela de seções ANINHADAS
 *                 ordenada por custo (avg / p99 / max / fatia do quadro), os contadores de GL,
 *                 a memória com a tendência, todos os medidores do jogo e os picos com a causa.
 *
 * Ele lê as amostras que o `Profiler` já guarda e não mede nada sozinho. Repinta a 4Hz: um painel
 * que se redesenha a cada quadro custa o próprio quadro que ele está medindo, e um número que muda
 * 200 vezes por segundo não se lê.
 */

export type PanelMode = 'off' | 'compact' | 'top';

/** Quantos quadros entram nas estatísticas do painel (~2s a 60Hz). */
const STATS_WINDOW = 120;
/** Quantos quadros o gráfico mostra. */
const GRAPH_FRAMES = 240;
const GRAPH_W = 360;
const GRAPH_H = 76;
/** O teto do gráfico, em ms. Um quadro acima disto encosta no topo (e já é um pico). */
const GRAPH_MAX_MS = 50;
const REPAINT_MS = 250;

/**
 * Quem está DENTRO de quem. As seções de `World3D.render` rodam dentro do `render3d` da cena, e
 * as do `update` se chamam `update.<parte>`. Sem a árvore, a tabela somaria o pai com os filhos e
 * mostraria um quadro maior do que o quadro.
 */
const RENDER3D_CHILDREN = new Set([
  'compose', 'castShadows', 'fires', 'particles', 'torch', 'rustle', 'biome', 'godRays', 'groundLight',
]);
const parentOf = (section: string): string | null => {
  if (RENDER3D_CHILDREN.has(section)) return 'render3d';
  const dot = section.lastIndexOf('.');
  return dot > 0 ? section.slice(0, dot) : null;
};

const pct = (sorted: number[], p: number): number =>
  sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];

const ms = (v: number): string => (v >= 100 ? v.toFixed(0) : v.toFixed(2)).padStart(6);

const STYLE = `
#zh-prof-hud {
  position: fixed; top: 26px; left: 8px; z-index: 9999; pointer-events: none;
  font: 11px/1.4 ui-monospace, Consolas, monospace; color: #d7e2ff;
  background: rgba(8, 10, 20, 0.86); border: 1px solid rgba(255, 200, 115, 0.35);
  border-radius: 4px; padding: 6px 9px; text-shadow: 0 1px 0 #000;
  max-height: calc(100vh - 40px); overflow: hidden;
}
#zh-prof-hud pre { margin: 0; font: inherit; white-space: pre; }
#zh-prof-hud canvas { display: block; margin: 5px 0 4px; image-rendering: pixelated; }
#zh-prof-hud .h { color: #ffc873; }
#zh-prof-hud .d { color: #7d86a8; }
#zh-prof-hud .w { color: #ffb347; }
#zh-prof-hud .b { color: #ff6b6b; }
#zh-prof-hud .g { color: #8fe388; }
`;

export class ProfilerPanel {
  private root?: HTMLDivElement;
  private head?: HTMLPreElement;
  private body?: HTMLPreElement;
  private graph?: HTMLCanvasElement;
  private lastPaint = 0;
  private mode: PanelMode = 'off';

  public get current(): PanelMode {
    return this.mode;
  }

  public setMode(mode: PanelMode): void {
    this.mode = mode;
    if (mode === 'off') {
      this.root?.remove();
      this.root = undefined;
      return;
    }
    if (!this.root) this.build();
    if (this.graph) this.graph.style.display = mode === 'top' ? 'block' : 'none';
    if (this.body) this.body.style.display = mode === 'top' ? 'block' : 'none';
    this.lastPaint = 0;
  }

  private build(): void {
    if (!document.getElementById('zh-prof-style')) {
      const style = document.createElement('style');
      style.id = 'zh-prof-style';
      style.textContent = STYLE;
      document.head.appendChild(style);
    }
    const root = document.createElement('div');
    root.id = 'zh-prof-hud';
    this.head = document.createElement('pre');
    this.graph = document.createElement('canvas');
    // O buffer do gráfico acompanha a densidade da tela: um canvas de 360px numa retina
    // borraria as barras de 1px que são o ponto dele.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.graph.width = GRAPH_W * dpr;
    this.graph.height = GRAPH_H * dpr;
    this.graph.style.width = `${GRAPH_W}px`;
    this.graph.style.height = `${GRAPH_H}px`;
    this.body = document.createElement('pre');
    root.append(this.head, this.graph, this.body);
    document.body.appendChild(root);
    this.root = root;
  }

  /** Chamado pelo profiler a cada quadro; só repinta a 4Hz. */
  public update(now: number, frames: FrameSample[], spikes: Spike[], spikeMs: number): void {
    if (this.mode === 'off' || !this.root || !this.head) return;
    if (now - this.lastPaint < REPAINT_MS) return;
    this.lastPaint = now;

    const recent = frames.slice(-STATS_WINDOW).filter((f) => f.dt > 0);
    if (recent.length === 0) return;
    const last = recent[recent.length - 1];
    const dts = recent.map((f) => f.dt).sort((a, b) => a - b);
    const avgDt = dts.reduce((a, b) => a + b, 0) / dts.length;
    const cpus = recent.map((f) => f.cpu).sort((a, b) => a - b);
    const gpus = recent.filter((f) => f.gpu >= 0).map((f) => f.gpu).sort((a, b) => a - b);
    const gpu50 = gpus.length ? pct(gpus, 50) : -1;
    const cpu50 = pct(cpus, 50);
    // 1% LOW: a média do pior 1% dos quadros, em fps. É o número que conta o tranco que a média
    // esconde — 200 fps de média com 1% low de 30 é um jogo que engasga.
    const worstN = Math.max(1, Math.ceil(dts.length * 0.01));
    const worst = dts.slice(-worstN);
    const low1 = 1000 / (worst.reduce((a, b) => a + b, 0) / worst.length);
    const fps = 1000 / avgDt;
    const fpsCls = fps >= 55 ? 'g' : fps >= 30 ? 'w' : 'b';
    const bound = gpu50 < 0 ? '' : gpu50 > cpu50 * 1.2 ? 'GPU-bound' : cpu50 > gpu50 * 1.2 ? 'CPU-bound' : 'balanced';

    if (this.mode === 'compact') {
      const top = Object.entries(last.sections).sort((a, b) => b[1] - a[1])[0];
      this.head.innerHTML = [
        `<span class="${fpsCls}">fps ${fps.toFixed(0).padStart(3)}</span>  ${avgDt.toFixed(1)}ms  1%low ${low1.toFixed(0)}  p99 ${pct(dts, 99).toFixed(1)}ms`,
        `cpu ${cpu50.toFixed(1)}ms  gpu ${gpu50 >= 0 ? `${gpu50.toFixed(1)}ms` : 'n/a'}  <span class="d">${bound}</span>`,
        `hot ${top ? `${top[0]} ${top[1].toFixed(1)}ms` : '—'}`,
        `gl  ${last.calls} draws  ${(last.tris / 1000).toFixed(1)}k tris  ${last.programs} shaders`,
        `<span class="d">F3: top</span>`,
      ].join('\n');
      return;
    }

    // ── TOP ──────────────────────────────────────────────────────────────────
    this.head.innerHTML = [
      `<span class="h">ZERO PROFILER</span>  <span class="d">quadro ${last.frame} · F3 fecha · __prof.report()</span>`,
      `<span class="${fpsCls}">FPS ${fps.toFixed(0).padStart(4)}</span>  avg ${avgDt.toFixed(2)}ms  `
        + `1%low <span class="${low1 >= 55 ? 'g' : low1 >= 30 ? 'w' : 'b'}">${low1.toFixed(0)}</span>  `
        + `p50 ${pct(dts, 50).toFixed(1)}  p99 ${pct(dts, 99).toFixed(1)}  max ${dts[dts.length - 1].toFixed(1)}ms`,
      `CPU ${cpu50.toFixed(2)}ms  GPU ${gpu50 >= 0 ? `${gpu50.toFixed(2)}ms` : ' n/a'}  <span class="h">${bound}</span>`,
    ].join('\n');

    this.drawGraph(frames.slice(-GRAPH_FRAMES), spikeMs);

    // A tabela: estatística por seção sobre a janela, montada como árvore.
    const bySection = new Map<string, number[]>();
    for (const f of recent) {
      for (const [k, v] of Object.entries(f.sections)) {
        let arr = bySection.get(k);
        if (!arr) bySection.set(k, (arr = []));
        arr.push(v);
      }
    }
    const rows = [...bySection.entries()].map(([section, vals]) => {
      // Uma seção que não rodou num quadro conta como 0 nele: a média é do QUADRO, não da chamada.
      const padded = vals.concat(new Array(Math.max(0, recent.length - vals.length)).fill(0));
      const sorted = padded.sort((a, b) => a - b);
      const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
      return { section, avg, p99: pct(sorted, 99), max: sorted[sorted.length - 1] };
    });
    const children = new Map<string | null, typeof rows>();
    for (const r of rows) {
      const p = parentOf(r.section);
      const key = p && bySection.has(p) ? p : null;
      let list = children.get(key);
      if (!list) children.set(key, (list = []));
      list.push(r);
    }
    const lines: string[] = [
      `<span class="h">SEÇÃO                  avg     p99     max  quadro</span>`,
    ];
    let measured = 0;
    const walk = (parent: string | null, depth: number): void => {
      const list = (children.get(parent) ?? []).sort((a, b) => b.avg - a.avg);
      for (const r of list) {
        if (depth === 0) measured += r.avg;
        const share = (r.avg / avgDt) * 100;
        const cls = r.p99 > 8 ? 'b' : r.p99 > 4 ? 'w' : '';
        const name = `${'  '.repeat(depth)}${r.section}`.slice(0, 20).padEnd(20);
        const line = `${name}${ms(r.avg)}  ${ms(r.p99)}  ${ms(r.max)}  ${share.toFixed(0).padStart(4)}%`;
        lines.push(cls ? `<span class="${cls}">${line}</span>` : line);
        walk(r.section, depth + 1);
      }
    };
    walk(null, 0);
    // O que o quadro gastou FORA do que medimos: o navegador, o GC, o driver esperando a GPU.
    const outside = Math.max(0, avgDt - measured);
    lines.push(`<span class="d">${'(fora: browser/GC/vsync)'.padEnd(20)}${ms(outside)}${' '.repeat(18)}${((outside / avgDt) * 100).toFixed(0).padStart(4)}%</span>`);

    const heapTrend = (() => {
      const first = recent[0].heapMb;
      const secs = recent.reduce((a, f) => a + f.dt, 0) / 1000;
      if (!first || secs <= 0) return '';
      const rate = (last.heapMb - first) / secs;
      return `  ${rate >= 0 ? '▲' : '▼'}${Math.abs(rate).toFixed(1)}MB/s`;
    })();
    const programsDelta = last.programs - recent[0].programs;
    lines.push(
      '',
      `<span class="h">GL</span>     ${last.calls} draws  ${(last.tris / 1000).toFixed(1)}k tris  `
        + `<span class="${programsDelta > 0 ? 'b' : ''}">${last.programs} shaders${programsDelta > 0 ? ` (+${programsDelta}!)` : ''}</span>  `
        + `${last.textures} tex  ${last.geometries} geo  ${last.lights} luzes`,
      `<span class="h">MEM</span>    heap ${last.heapMb ? `${last.heapMb}MB${heapTrend}` : 'n/a'}`,
    );
    const gauges = Object.entries(last.gauges)
      .filter(([, v]) => typeof v === 'number')
      .map(([k, v]) => `${k} ${Number.isInteger(v) ? v : v.toFixed(1)}`);
    for (let i = 0; i < gauges.length; i += 4) {
      lines.push(`${i === 0 ? '<span class="h">JOGO</span>   ' : '       '}${gauges.slice(i, i + 4).join('  ')}`);
    }

    lines.push('', `<span class="h">PICOS</span>  ${spikes.length} acima de ${spikeMs}ms nesta gravação`);
    for (const s of spikes.slice(-5).reverse()) {
      const marks = s.marks.length ? ` [${s.marks.join(',')}]` : '';
      lines.push(`  <span class="w">q${s.frame} ${s.dt.toFixed(0)}ms</span>${marks} ${s.cause.slice(0, 58)}`);
    }
    this.body!.innerHTML = lines.join('\n');
  }

  private drawGraph(frames: FrameSample[], spikeMs: number): void {
    const c = this.graph;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const sx = c.width / GRAPH_W;
    const sy = c.height / GRAPH_H;
    ctx.setTransform(sx, 0, 0, sy, 0, 0);
    ctx.clearRect(0, 0, GRAPH_W, GRAPH_H);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fillRect(0, 0, GRAPH_W, GRAPH_H);

    const y = (v: number): number => GRAPH_H - Math.min(1, v / GRAPH_MAX_MS) * GRAPH_H;
    const bw = GRAPH_W / GRAPH_FRAMES;
    const x0 = GRAPH_W - frames.length * bw;
    frames.forEach((f, i) => {
      if (f.dt <= 0) return;
      ctx.fillStyle = f.dt > spikeMs ? '#ff6b6b' : f.dt > 17.5 ? '#ffb347' : '#5fb35a';
      const top = y(f.dt);
      ctx.fillRect(x0 + i * bw, top, Math.max(1, bw - 0.2), GRAPH_H - top);
    });
    // A GPU por cima, em linha: quando ela encosta na barra, o quadro é dela.
    ctx.strokeStyle = 'rgba(140, 190, 255, 0.95)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    let pen = false;
    frames.forEach((f, i) => {
      if (f.gpu < 0) { pen = false; return; }
      const px = x0 + i * bw + bw / 2;
      if (pen) ctx.lineTo(px, y(f.gpu)); else ctx.moveTo(px, y(f.gpu));
      pen = true;
    });
    ctx.stroke();

    for (const [v, label] of [[1000 / 60, '60'], [1000 / 30, '30']] as const) {
      ctx.strokeStyle = 'rgba(255, 200, 115, 0.45)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(0, y(v) + 0.5);
      ctx.lineTo(GRAPH_W, y(v) + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255, 200, 115, 0.8)';
      ctx.font = '9px ui-monospace, Consolas, monospace';
      ctx.fillText(label, 2, y(v) - 2);
    }
    ctx.fillStyle = 'rgba(140, 190, 255, 0.9)';
    ctx.fillText('gpu', GRAPH_W - 22, 10);
  }
}

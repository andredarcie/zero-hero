/**
 * A AUDITORIA — o gerador de dungeons medido em massa, fora do jogo.
 *
 *   npx tsx scripts/audit-dungeons.ts            # 60 sementes por dungeon
 *   npx tsx scripts/audit-dungeons.ts --seeds 500
 *   npx tsx scripts/audit-dungeons.ts --level 6 --seeds 200 --verbose
 *
 * Ela existe porque "com qualidade" sem número é opinião. O gerador é TypeScript puro e não
 * importa Phaser nem Three (é uma lei do diretório `src/game/dungeon/`), então o que roda aqui é
 * exatamente o que o jogador recebe — não uma reimplementação que envelhece em silêncio.
 *
 * O que a tabela responde, e por que cada coluna está nela:
 *   • **reprovadas** — quantas sementes o juiz recusou, e por quê. Se subir, o gerador está
 *     construindo errado e o juiz está segurando a bomba.
 *   • **emergência** — quantas caíram no layout linear. Tem de ser ZERO: é a rede, não o plano.
 *   • **salas / caminho** — o tamanho percebido. O alvo é 10-20 salas e um caminho crítico que
 *     não vire caminhada.
 *   • **ciclos** — a distribuição do catálogo. Um ciclo que nunca sai é um ciclo que não existe.
 *   • **retrato** — o tamanho do save. É o orçamento do `localStorage`, medido e não estimado.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DUNGEON_BRIEFS } from '@/game/dungeon/dungeonBriefs';
import { buildDungeon } from '@/game/dungeon/dungeonBuild';
import { mixSeed } from '@/game/dungeon/dungeonRandom';
import { snapshotDungeon } from '@/game/dungeon/dungeonSnapshot';
import { parseTemplateLibrary } from '@/game/dungeon/dungeonTemplates';
import { verifyDungeon } from '@/game/dungeon/dungeonVerify';
import { worldFromSnapshot } from '@/game/dungeon/dungeonSnapshot';
import type { WorldData } from '@/game/world/worldSchema';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const flag = (name: string, fallback: number): number => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : fallback;
};
const SEEDS = flag('seeds', 60);
const ONLY = flag('level', 0);
const VERBOSE = argv.includes('--verbose');

// A folha de peças, se ela existir. Ausência é o estado normal (ver dungeonTemplates).
let library = parseTemplateLibrary(null);
try {
  const raw = readFileSync(path.join(ROOT, 'public', 'levels', 'dungeon-0.json'), 'utf8');
  library = parseTemplateLibrary(JSON.parse(raw) as WorldData);
} catch { /* sem biblioteca: só as formas paramétricas */ }
console.log(`biblioteca de templates: ${library.length} sala(s) autorada(s)\n`);

type Row = {
  level: number;
  name: string;
  rooms: number[];
  paths: number[];
  reach: number[];
  attempts: number[];
  ms: number[];
  bytes: number[];
  cycles: Map<string, number>;
  rejects: Map<string, number>;
  fallback: number;
  failed: number;
};

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};
const range = (values: number[]): string =>
  (values.length === 0 ? '-' : `${Math.min(...values)}-${Math.max(...values)}`);

const rows: Row[] = [];
for (const brief of DUNGEON_BRIEFS) {
  if (ONLY && brief.level !== ONLY) continue;
  const row: Row = {
    level: brief.level,
    name: brief.name,
    rooms: [],
    paths: [],
    reach: [],
    attempts: [],
    ms: [],
    bytes: [],
    cycles: new Map(),
    rejects: new Map(),
    fallback: 0,
    failed: 0,
  };

  for (let s = 0; s < SEEDS; s++) {
    const seed = mixSeed(0xbeef, s, brief.level);
    const t0 = performance.now();
    const built = buildDungeon(brief.level, seed, library);
    row.ms.push(performance.now() - t0);

    const verdict = verifyDungeon(built.world, built.plan);
    if (built.plan.linear) row.fallback += 1;
    if (!verdict.ok) {
      row.failed += 1;
      if (VERBOSE) console.log(`  ⚠ dungeon ${brief.level} semente ${s}: ${verdict.reasons.join(', ')}`);
    }
    for (const reason of built.rejects) row.rejects.set(reason, (row.rejects.get(reason) ?? 0) + 1);
    row.cycles.set(built.plan.cycle, (row.cycles.get(built.plan.cycle) ?? 0) + 1);
    row.rooms.push(verdict.metrics.rooms);
    row.paths.push(verdict.metrics.criticalPath);
    row.reach.push(verdict.metrics.reachablePercent);
    row.attempts.push(built.attempts);

    // ── O RETRATO TEM DE FECHAR O CICLO ───────────────────────────────────────────────────
    // gerar → fotografar → hidratar → fotografar de novo, e as duas fotos idênticas. É a
    // promessa inteira do save numa linha: se a arte não voltar exata da semente, o jogador vê
    // a dungeon MUDAR ao reabrir a aba — e nenhum outro teste pega isso, porque dentro de uma
    // sessão o mundo vivo nunca passa pelo retrato.
    const snap = snapshotDungeon(built.world, brief.level, seed);
    const again = snapshotDungeon(worldFromSnapshot(snap), brief.level, seed);
    if (JSON.stringify(snap) !== JSON.stringify(again)) {
      row.failed += 1;
      console.log(`  ⚠ dungeon ${brief.level} semente ${s}: o retrato NAO fecha o ciclo (hidratar mudou a planta)`);
    }
    row.bytes.push(JSON.stringify(snap).length);
  }
  rows.push(row);
}

const pad = (s: string | number, n: number): string => String(s).padEnd(n);
console.log(`${SEEDS} sementes por dungeon\n`);
console.log([
  pad('#', 3), pad('nome', 11), pad('salas', 7), pad('caminho', 9), pad('alc.%', 7),
  pad('tent.', 7), pad('ms', 7), pad('retrato', 9), pad('reprov', 7), pad('emerg', 6),
].join(''));
console.log('-'.repeat(80));

let totalFailed = 0;
let totalFallback = 0;
for (const row of rows) {
  totalFailed += row.failed;
  totalFallback += row.fallback;
  console.log([
    pad(row.level, 3),
    pad(row.name, 11),
    pad(range(row.rooms), 7),
    pad(range(row.paths), 9),
    pad(`${median(row.reach)}`, 7),
    pad(`${median(row.attempts)}/${Math.max(...row.attempts)}`, 7),
    pad(`${median(row.ms).toFixed(0)}/${Math.max(...row.ms).toFixed(0)}`, 7),
    pad(`${(median(row.bytes) / 1024).toFixed(1)}KB`, 9),
    pad(row.failed, 7),
    pad(row.fallback, 6),
  ].join(''));
}

console.log('\nciclos sorteados');
const cycles = new Map<string, number>();
for (const row of rows) for (const [id, n] of row.cycles) cycles.set(id, (cycles.get(id) ?? 0) + n);
for (const [id, n] of [...cycles].sort((a, b) => b[1] - a[1])) {
  const total = rows.length * SEEDS;
  console.log(`  ${pad(id, 18)} ${String(n).padStart(5)}  ${((n / total) * 100).toFixed(1)}%`);
}

console.log('\nmotivos de recusa do juiz (tentativas descartadas antes de uma passar)');
const rejects = new Map<string, number>();
for (const row of rows) for (const [id, n] of row.rejects) rejects.set(id, (rejects.get(id) ?? 0) + n);
if (rejects.size === 0) console.log('  nenhuma');
for (const [id, n] of [...rejects].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${pad(id, 26)} ${String(n).padStart(5)}`);
}

const allBytes = rows.flatMap((r) => r.bytes);
console.log(`\nretrato: mediana ${(median(allBytes) / 1024).toFixed(1)} KB, pior ${(Math.max(...allBytes) / 1024).toFixed(1)} KB`);
console.log(`nove dungeons de um save ≈ ${((median(allBytes) * 9) / 1024).toFixed(0)} KB\n`);

if (totalFailed > 0 || totalFallback > 0) {
  console.log(`❌ ${totalFailed} dungeon(s) entregues reprovadas, ${totalFallback} caíram na emergência`);
  process.exit(1);
}
console.log('✅ todas as sementes passaram no juiz, nenhuma caiu na emergência');

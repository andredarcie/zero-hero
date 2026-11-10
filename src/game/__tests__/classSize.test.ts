import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * NENHUMA CLASSE PASSA DE 300 LINHAS (pedido do autor, regra rígida, sem exceção). Conta as linhas físicas, da linha do
 * `class` até a chave que fecha — comentário e linha em branco inclusive, porque é o número que o editor mostra. Vale
 * para todo .ts de src/ e todo .mjs/.js de playtest/, scripts/ e tools/.
 *
 * Classe que cresce além do limite se divide por assunto: uma peça por responsabilidade, ligada ao dono por um campo
 * (a "faceta": `this.world3d.objects.addBillboard`, `scene.query.isSolidForEntities`) — ver o progress.md.
 */
const LIMIT = 300;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const SKIP = new Set(['node_modules', 'results', 'dist', 'out', 'coverage']);

const sources = (): string[] => {
  const out: string[] = [];
  const walk = (dir: string, test: (f: string) => boolean): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP.has(e.name)) continue;
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f, test);
      else if (test(e.name)) out.push(f);
    }
  };
  walk(path.join(ROOT, 'src'), (n) => n.endsWith('.ts') && !n.endsWith('.d.ts'));
  for (const d of ['playtest', 'scripts', 'tools']) walk(path.join(ROOT, d), (n) => /\.(mjs|js)$/u.test(n));
  return out;
};

/** Cada classe do repo (declarada ou expressão) e quantas linhas ela ocupa. */
const classSizes = (): Map<string, number> => {
  const sizes = new Map<string, number>();
  for (const file of sources()) {
    const text = readFileSync(file, 'utf8');
    const kind = file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    let anon = 0;
    const visit = (node: ts.Node): void => {
      if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
        const first = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
        const last = sf.getLineAndCharacterOfPosition(node.getEnd()).line;
        sizes.set(`${rel}#${node.name?.text ?? `(anônima ${++anon})`}`, last - first + 1);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return sizes;
};

describe('o tamanho das classes', () => {
  it(`nenhuma classe passa de ${LIMIT} linhas`, () => {
    const sizes = classSizes();
    expect(sizes.size).toBeGreaterThan(100); // a varredura achou o repo (um caminho errado daria zero e passaria)
    const over = [...sizes].filter(([, n]) => n > LIMIT).map(([key, n]) => `${key}: ${n}`);
    expect(over).toEqual([]);
    // A varredura lê o código inteiro (~400 arquivos): sozinha leva ~2 s, mas com a bateria toda rodando em paralelo
    // numa máquina ocupada passou dos 5 s do padrão e caiu por tempo, não por classe grande.
  }, 30_000);
});

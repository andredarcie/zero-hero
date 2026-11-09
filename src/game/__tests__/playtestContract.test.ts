import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import type { GameDebugApi } from '@/game/debug/debugHooks';
import { buildProbes, type GameProbes } from '@/game/debug/probes';
import { buildAppProbes } from '@/game/debug/probes/appProbe';
import { buildEditorProbes } from '@/game/debug/probes/editorProbe';
import type * as Engine from '@/game/engine';
import type { EditorScene } from '@/game/scenes/EditorScene';
import type { GameScene } from '@/game/scenes/GameScene';

/**
 * O CONTRATO DOS PLAYTESTS: os cenários (playtest/) falam com o jogo só pelas sondas (ver debug/probes):
 * `window.gameDebug` na partida, `window.appDebug` nas cenas (título, créditos) e `window.editorDebug` no editor.
 *
 * - Nenhum cenário lê o interior do jogo: `window.__scene`, `__game`, `__sound`, `__jukebox`, nem importa módulo de
 *   `src/` dentro da página. Era assim que uma mudança interna (um membro que muda de dono) quebrava a suíte sem o
 *   compilador ver — na divisão das classes de 300 linhas foram ~500 caminhos acertados à mão.
 * - Toda sonda que um cenário chama (`gameDebug.hero.teleport`) existe: renomear ou tirar uma sonda reprova aqui, não
 *   no meio de uma rodada de playtest.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PLAYTEST = path.join(ROOT, 'playtest');
const FORBIDDEN = new Set(['__scene', '__game', '__sound', '__jukebox']);

const playtestFiles = (): string[] => {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'results' || e.name === 'node_modules') continue;
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else if (/\.(mjs|js)$/u.test(e.name)) out.push(f);
    }
  };
  walk(PLAYTEST);
  return out;
};

interface Call { where: string; root: Root; chain: string[] }
interface Scan { touches: string[]; calls: Call[] }

/** As três portas: a partida (`gameDebug`), as cenas (`appDebug`) e o editor (`editorDebug`). */
type Root = 'gameDebug' | 'appDebug' | 'editorDebug';
const ROOTS: readonly Root[] = ['gameDebug', 'appDebug', 'editorDebug'];

const scan = (): Scan => {
  const touches: string[] = [];
  const calls: Call[] = [];
  for (const file of playtestFiles()) {
    const text = readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    const where = (node: ts.Node): string => `${rel}:${sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1}`;
    // `window.gameDebug`, `gameDebug` e os apelidos (`const g = window.gameDebug`), cada apelido valendo no escopo da
    // função que o declara — um parâmetro ou outra variável com o mesmo nome numa função de dentro o esconde.
    const rootOf = (node: ts.Node, aliases: ReadonlyMap<string, Root>): Root | null => {
      if (ts.isIdentifier(node)) return aliases.get(node.text) ?? null;
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'window') {
        return (ROOTS as readonly string[]).includes(node.name.text) ? node.name.text as Root : null;
      }
      return null;
    };
    const names = (b: ts.BindingName): string[] => (ts.isIdentifier(b) ? [b.text] : b.elements.flatMap((e) => (ts.isOmittedExpression(e) ? [] : names(e.name))));
    const visit = (node: ts.Node, aliases: Map<string, Root>): void => {
      let scope = aliases;
      if (ts.isFunctionLike(node)) {
        scope = new Map(aliases);
        for (const p of node.parameters) for (const n of names(p.name)) scope.delete(n);
      }
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        const root = node.initializer ? rootOf(node.initializer, aliases) : null;
        if (root) aliases.set(node.name.text, root);
        else aliases.delete(node.name.text);
      }
      if ((ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) && FORBIDDEN.has(node.text)) touches.push(`${where(node)} ${node.text}`);
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) touches.push(`${where(node)} import()`);
      if (ts.isPropertyAccessExpression(node) && node.name.text === 'getEntriesByType') touches.push(`${where(node)} getEntriesByType`);
      // A cadeia mais longa a partir da raiz: gameDebug.ns.fn (as de dentro são visitadas pela de fora).
      if (ts.isPropertyAccessExpression(node) && !ts.isPropertyAccessExpression(node.parent)) {
        const chain: string[] = [];
        let cur: ts.Expression = node;
        while (ts.isPropertyAccessExpression(cur) && !rootOf(cur, scope)) { chain.unshift(cur.name.text); cur = cur.expression; }
        const root = rootOf(cur, scope);
        if (root && chain.length) calls.push({ where: where(node), root, chain: chain.slice(0, 2) });
      }
      ts.forEachChild(node, (child) => visit(child, scope));
    };
    visit(sf, new Map(ROOTS.map((r) => [r, r])));
  }
  return { touches, calls };
};

// Os membros de sempre da interface da partida (fora as sondas). O tipo cobra que a lista esteja completa.
const BASE: Record<Exclude<keyof GameDebugApi, keyof GameProbes>, true> = {
  getState: true, openDialog: true, closeDialog: true, listNpcKinds: true, quests: true,
};

/** A forma de cada porta. As sondas só guardam o dono e o leem na hora da chamada: um dono vazio basta. */
const shapes = (): Record<Root, Record<string, unknown>> => ({
  gameDebug: { ...BASE, ...buildProbes({} as GameScene) },
  appDebug: buildAppProbes({} as Engine.Game),
  editorDebug: buildEditorProbes({} as EditorScene),
});

describe('o contrato dos playtests', () => {
  const { touches, calls } = scan();

  it('nenhum cenário lê o interior do jogo', () => {
    expect(touches).toEqual([]);
  });

  it('toda sonda que um cenário chama existe', () => {
    expect(calls.length).toBeGreaterThan(50); // a varredura achou os cenários
    const shape = shapes();
    const missing = calls.filter(({ root, chain: [first, second] }) => {
      const member = shape[root][first];
      if (member === undefined) return true;
      // gameDebug.ns.fn: o namespace de uma sonda tem de ter a função (getState() e afins não têm namespace).
      return root === 'gameDebug' && !(first in BASE) && second !== undefined && !(second in (member as Record<string, unknown>));
    }).map(({ where, root, chain }) => `${where} ${root}.${chain.join('.')}`);
    expect(missing).toEqual([]);
  });
});

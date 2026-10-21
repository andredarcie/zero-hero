import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import globals from 'globals';

export default [
  {
    // spritefactory/out e saida do build da fabrica (fora do git): nao e codigo de ninguem.
    ignores: ['dist/**', 'node_modules/**', 'playtest/results/**', 'spritefactory/out/**'],
  },
  js.configs.recommended,
  {
    // Playtest harness: plain Node ESM scripts that also embed browser-context callbacks
    // (page.evaluate). Give them both Node and browser globals. A Sprite Factory e o mesmo
    // tipo de script de Node.
    files: ['playtest/**/*.mjs', 'tools/**/*.mjs', 'scripts/**/*.mjs', 'spritefactory/**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      globals: {
        document: 'readonly',
        window: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        localStorage: 'readonly',
        navigator: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        setTimeout: 'readonly',
      },
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // O gerador de mundo (scripts/*.ts) roda no Node via tsx e fica FORA do tsconfig, que e so
    // do jogo. Sem `project` o parser le o arquivo sozinho — as regras recomendadas nao precisam
    // de tipos.
    files: ['scripts/**/*.ts'],
    languageOptions: {
      globals: globals.node,
      parserOptions: { project: null },
    },
  },
];

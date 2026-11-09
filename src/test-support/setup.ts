/**
 * Roda antes de cada arquivo de teste (vite.config.ts → test.setupFiles): instala a plataforma dos testes, para todo
 * módulo do jogo que pede canvas, armazenamento, som ou GPU achar a porta no lugar — inclusive os que leem o
 * armazenamento no momento em que são importados. Com DOM (os testes `@vitest-environment jsdom`), canvas e imagem
 * são os do jsdom.
 */
import { installPlatform } from '@/game/platform/platform';
import { createTestPlatform } from './testPlatform';

installPlatform(createTestPlatform());

/**
 * Instala a plataforma do navegador. É o PRIMEIRO import do `main.ts`, e por isso roda antes de qualquer módulo do
 * jogo: alguns leem o armazenamento no momento em que são importados (o idioma, as opções de acessibilidade), e
 * precisam achar a plataforma já no lugar.
 */
import { browserPlatform } from './browserPlatform';
import { installPlatform } from './platform';

installPlatform(browserPlatform);

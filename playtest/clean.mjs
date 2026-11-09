#!/usr/bin/env node
// Encerra o que rodadas de playtest interrompidas deixaram para trás: navegadores marcados com `--zh-playtest-owner`
// e servidores Vite do registro, cujo dono (o node da rodada) não existe mais. Rodada viva não é tocada.
//   npm run playtest:clean
import { freeMB } from './lib/memoryGuard.mjs';
import { cleanLeftovers } from './lib/processes.mjs';

const before = freeMB();
const { killed, mb } = await cleanLeftovers();
await new Promise((r) => setTimeout(r, 1500));
console.log(killed
  ? `${killed} processo(s) de rodadas interrompidas encerrados (~${mb} MB). Livre: ${before} → ${freeMB()} MB.`
  : `Nada para limpar. Livre: ${freeMB()} MB.`);

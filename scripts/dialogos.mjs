#!/usr/bin/env node
// A LEI DAS ESCOLAS (pedido do autor: "cada NPC tem que seguir uma escola, uma corrente filosófica específica").
// Confere os arquivos de falas (src/game/i18n/dialogos/<lang>.json):
//   · todo personagem (e o fim) tem `filosofia` com escola, livros, ideia e voz;
//   · nenhuma escola se repete, e nenhum pensador principal (o nome antes do ":" em `livros`) aparece em dois;
//   · `livros` cita obra (tem ":" depois do pensador), não só o nome;
//   · português e inglês têm as mesmas seções, os mesmos caminhos de fala, a mesma forma e o mesmo número de
//     linhas em cada fala, e a narração ("[narrador] " / "[narrator] ") nas mesmas linhas.
//
//   node scripts/dialogos.mjs --check
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'src/game/i18n/dialogos');
const LANGS = ['pt-br', 'en'];
// Seções que não são uma pessoa com escola: a narração, a fala genérica de quem fecha o último pedido, e os NPCs
// que não estão no mundo.
const NO_SCHOOL = new Set(['narrador', 'ultimo_pedido', 'fora_do_jogo']);
const NARRATOR = /^\[(narrador|narrator)\] /u;

const errors = [];
const fail = (msg) => errors.push(msg);
const load = (lang) => JSON.parse(fs.readFileSync(path.join(DIR, `${lang}.json`), 'utf8'));
const files = Object.fromEntries(LANGS.map((l) => [l, load(l)]));
const sections = (d) => Object.keys(d).filter((k) => !k.startsWith('_'));

for (const lang of LANGS) {
  const d = files[lang];
  const schools = new Map();
  const thinkers = new Map();
  for (const id of sections(d)) {
    const s = d[id];
    if (!s || typeof s !== 'object' || typeof s.falas !== 'object') { fail(`${lang}/${id}: sem "falas"`); continue; }
    if (NO_SCHOOL.has(id)) continue;
    const f = s.filosofia;
    if (!f) { fail(`${lang}/${id}: sem "filosofia"`); continue; }
    for (const k of ['escola', 'livros', 'ideia', 'voz']) if (!String(f[k] ?? '').trim()) fail(`${lang}/${id}: filosofia.${k} vazia`);
    const school = String(f.escola).trim().toLowerCase();
    if (schools.has(school)) fail(`${lang}: a escola "${f.escola}" é de ${schools.get(school)} e de ${id}`);
    schools.set(school, id);
    const colon = String(f.livros).indexOf(':');
    if (colon < 0) { fail(`${lang}/${id}: "livros" não cita obra (formato "Pensador: Obra (...)")`); continue; }
    const thinker = String(f.livros).slice(0, colon).replace(/\(.*\)/u, '').trim().toLowerCase();
    if (thinkers.has(thinker)) fail(`${lang}: o pensador "${thinker}" é a base de ${thinkers.get(thinker)} e de ${id}`);
    thinkers.set(thinker, id);
  }
}

// As duas línguas, lado a lado.
const shape = (v, at, other, otherAt) => {
  if (Array.isArray(v)) {
    if (!Array.isArray(other)) { fail(`${at}: lista em uma língua e não na outra`); return; }
    if (v.length !== other.length) fail(`${at}: ${v.length} linhas em pt-br, ${other.length} em en`);
    v.forEach((line, i) => {
      if (other[i] === undefined) return;
      if (NARRATOR.test(String(line)) !== NARRATOR.test(String(other[i]))) fail(`${at}[${i}]: narração numa língua só`);
    });
    return;
  }
  if (v && typeof v === 'object') {
    if (!other || typeof other !== 'object' || Array.isArray(other)) { fail(`${at}: forma diferente em ${otherAt}`); return; }
    const a = Object.keys(v).sort(); const b = Object.keys(other).sort();
    for (const k of a) if (!b.includes(k)) fail(`${at}.${k}: falta em en`);
    for (const k of b) if (!a.includes(k)) fail(`${at}.${k}: falta em pt-br`);
    for (const k of a) if (b.includes(k)) shape(v[k], `${at}.${k}`, other[k], `${otherAt}.${k}`);
    return;
  }
  if (typeof v !== typeof other) fail(`${at}: tipo diferente entre as línguas`);
};
const [pt, en] = [files['pt-br'], files.en];
const ids = new Set([...sections(pt), ...sections(en)]);
for (const id of ids) {
  if (!pt[id]) { fail(`${id}: só existe em en`); continue; }
  if (!en[id]) { fail(`${id}: só existe em pt-br`); continue; }
  shape(pt[id].falas ?? {}, `${id}.falas`, en[id].falas ?? {}, `${id}.falas`);
  if (Boolean(pt[id].filosofia) !== Boolean(en[id].filosofia)) fail(`${id}: filosofia numa língua só`);
}

if (errors.length) {
  console.error(`dialogos: ${errors.length} problema(s)`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
const list = sections(pt).filter((id) => !NO_SCHOOL.has(id)).map((id) => `${id}: ${pt[id].filosofia.escola}`);
console.log(`dialogos OK — uma escola por personagem, pt-br e en iguais na forma.\n  ${list.join('\n  ')}`);

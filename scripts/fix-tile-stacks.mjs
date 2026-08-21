// CHÃO + UMA COISA — a regra do tabuleiro, aplicada aos arquivos de mundo.
//
// A LEI. Um tile tem o `ground`, e em cima dele NO MÁXIMO uma coisa: ou um tile de `upper`, ou um
// prop, ou um item, ou um NPC, ou uma cova. Nunca duas. Um mundo que empilha mente para todo mundo
// que o lê — o jogador vê a folhagem e não a caixa de ferramentas embaixo dela; o autor pinta por
// cima de uma peça que continua lá; e o runtime desenha dois quads coplanares no mesmo tile, que é
// exatamente o z-fight que `depthLayer` existe para evitar.
//
// Modelo enrich-*: LÊ o arquivo e conserta — nunca refaz.
//   · idempotente — mira num PONTO FIXO (zero pilhas), não num delta. Rodar de novo não muda um
//     byte, e `--check` falha se o disco ainda tiver pilha.
//   · determinístico — zero Math.random, zero timestamp. A ordem de varredura é a do arquivo e o
//     desempate é uma lista fixa de vizinhos.
//   · não toca em `ground`, em `collisions`, nem em nada que não esteja empilhado.
//
// COMO CADA PILHA SE RESOLVE — e por que estas escolhas e não outras:
//
// 1. **`upper` + qualquer coisa com COMPORTAMENTO → o `upper` sai.** O prop, o item, o NPC e a cova
//    são peças com regra (a água bloqueia e aceita ponte, a árvore seca cai no machado, a pira é o
//    fim do jogo, o item se apanha). O tile de cima é CENÁRIO — e, pior, cenário DESENHADO POR
//    CIMA: era ele que escondia a peça. Tirar cenário é sempre reversível a olho; tirar a peça
//    apagaria uma regra do mundo.
//
//    Isso vale mesmo quando o `upper` bloqueia (pinheiro, montanha): um pinheiro plantado dentro do
//    rio ou em cima de uma cova de aranha não é decoração ambígua, é o defeito em estado puro — a
//    cova nascia dentro de uma parede.
//
//    **Isto não pode SELAR caminho**, que é a lei que governa mexer em massa neste mundo: o script
//    só REMOVE tiles de cima, e remover só abre. Nenhum dos tiles tocados tem colisão pintada
//    (o script confere e recusa se tiver — aí a remoção deixaria uma parede invisível).
//
// 2. **Duas peças com comportamento → o ITEM se muda, a peça fixa fica.** É o caso do item largado
//    em cima da escada: a escada é uma das cinco portas entre os dois andares e não tem para onde
//    ir, e o item em cima dela nunca seria apanhado (pisar ali é descer). O item vai para o
//    primeiro vizinho LIVRE numa ordem fixa — nada é apagado, porque um item apagado pode ser uma
//    ferramenta que trava o jogo.
//
// 3. **Qualquer outra pilha → o script RECLAMA e não toca.** Um caso que ninguém previu não tem
//    conserto óbvio, e adivinhar em cima do mundo autorado é pior que deixar o aviso.
//
//   node scripts/fix-tile-stacks.mjs            # conserta e grava
//   node scripts/fix-tile-stacks.mjs --check    # só confere que o disco já é o ponto fixo
//   node scripts/fix-tile-stacks.mjs --dry      # mostra o que faria, sem gravar

import fs from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

const FILES = [
  'public/world.json',
  'public/underworld.json',
];

// Os levels do lab entram sozinhos: um level é autorado no mesmo /lab, com o mesmo tabuleiro.
const LEVELS_DIR = 'public/levels';

// Para onde um item se muda, em ordem. Ortogonais antes das diagonais: mudar de tile é para ficar
// ao LADO da escada, e um vizinho diagonal lê como "atrás dela".
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

// O que é CENÁRIO e o que é PEÇA. O `upper` é a única camada de cenário do tabuleiro; todo o resto
// carrega regra. (O `ground` não entra: ele é o chão, e o chão sempre existe.)
const SCENERY = 'upper';

const resolvePath = (rel) => fileURLToPath(new URL(`../${rel}`, import.meta.url));

const readJson = async (rel) => JSON.parse(await fs.readFile(resolvePath(rel), 'utf8'));

/** Todo ocupante de todo tile, indexado por "x,y". O `ground` não é ocupante. */
const occupantsOf = (world) => {
  const { chunkColumns: cols, chunkRows: rows } = world.meta;
  const at = new Map();
  const add = (x, y, entry) => {
    const key = `${x},${y}`;
    const list = at.get(key);
    if (list) list.push(entry);
    else at.set(key, [entry]);
  };
  for (const chunk of world.chunks ?? []) {
    const ox = chunk.cx * cols;
    const oy = chunk.cy * rows;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const frame = chunk.upper?.[r]?.[c];
        if (frame !== null && frame !== undefined) {
          add(ox + c, oy + r, { layer: 'upper', what: `tile ${frame}`, chunk, r, c });
        }
      }
    }
    for (const e of chunk.enemies ?? []) add(e.worldX, e.worldY, { layer: 'enemies', what: e.type, chunk, ref: e });
    for (const p of chunk.pickups ?? []) add(p.worldX, p.worldY, { layer: 'pickups', what: p.type, chunk, ref: p });
    for (const n of chunk.npcs ?? []) add(n.worldX, n.worldY, { layer: 'npcs', what: n.type, chunk, ref: n });
  }
  for (const p of world.props ?? []) add(p.worldX, p.worldY, { layer: 'props', what: p.type, ref: p });
  return at;
};

const paintedCollisionAt = (world, x, y) => {
  const { chunkColumns: cols, chunkRows: rows } = world.meta;
  const chunk = (world.chunks ?? []).find(
    (c) => c.cx === Math.floor(x / cols) && c.cy === Math.floor(y / rows),
  );
  return chunk ? Boolean(chunk.collisions?.[y % rows]?.[x % cols]) : false;
};

const insideWorld = (world, x, y) => {
  const { worldChunksX, worldChunksY, chunkColumns, chunkRows } = world.meta;
  return x >= 0 && y >= 0 && x < worldChunksX * chunkColumns && y < worldChunksY * chunkRows;
};

const fixWorld = (world, name, log) => {
  const at = occupantsOf(world);
  const stacks = [...at.entries()]
    .filter(([, list]) => list.length > 1)
    // Ordem de leitura (linha, depois coluna) para o relatório sair estável entre rodadas.
    .map(([key, list]) => { const [x, y] = key.split(',').map(Number); return { x, y, list }; })
    .sort((a, b) => a.y - b.y || a.x - b.x);

  let cleared = 0;
  let moved = 0;
  const refused = [];

  for (const stack of stacks) {
    const scenery = stack.list.filter((e) => e.layer === SCENERY);
    const pieces = stack.list.filter((e) => e.layer !== SCENERY);

    // Regra 1: o cenário sai, e a peça fica.
    if (scenery.length > 0 && pieces.length > 0) {
      if (paintedCollisionAt(world, stack.x, stack.y)) {
        // Tirar o tile deixaria a colisão pintada sozinha: uma parede que ninguém vê.
        refused.push(`(${stack.x},${stack.y}) ${SCENERY} sobre COLISÃO PINTADA — resolva no /editor`);
        continue;
      }
      for (const entry of scenery) {
        entry.chunk.upper[entry.r][entry.c] = null;
        cleared += 1;
        log(`  limpo  (${String(stack.x).padStart(2)},${String(stack.y).padStart(2)}) ${entry.what} sob ${pieces.map((p) => p.what).join(', ')}`);
      }
      if (pieces.length === 1) continue;
    }

    // Regra 2: duas peças — o item se muda, o resto fica onde está.
    const rest = stack.list.filter((e) => e.layer !== SCENERY);
    if (rest.length < 2) continue;
    const item = rest.find((e) => e.layer === 'pickups');
    const stay = rest.filter((e) => e !== item);
    if (!item || stay.length !== 1) {
      refused.push(`(${stack.x},${stack.y}) ${rest.map((e) => `${e.layer}:${e.what}`).join(' + ')} — sem regra, resolva no /editor`);
      continue;
    }
    const free = NEIGHBOURS
      .map(([dx, dy]) => [stack.x + dx, stack.y + dy])
      .find(([nx, ny]) => insideWorld(world, nx, ny)
        && !at.has(`${nx},${ny}`)
        && !paintedCollisionAt(world, nx, ny));
    if (!free) {
      refused.push(`(${stack.x},${stack.y}) item ${item.what} sobre ${stay[0].what} sem vizinho livre`);
      continue;
    }
    const [nx, ny] = free;
    item.ref.worldX = nx;
    item.ref.worldY = ny;
    at.set(`${nx},${ny}`, [item]);
    moved += 1;
    log(`  movido (${String(stack.x).padStart(2)},${String(stack.y).padStart(2)}) item ${item.what} sai de cima de ${stay[0].what} → (${nx},${ny})`);
  }

  // O item mudou de tile, e o tile MANDA no chunk em que ele é gravado: um pickup que atravessa a
  // fronteira e fica na lista do chunk vizinho some do arquivo do ponto de vista do runtime, que
  // lê cada chunk pelo próprio quadro. Reindexar aqui é o preço de mover.
  if (moved > 0) reindexEntities(world);

  log(`${name}: ${stacks.length} pilha(s) → ${cleared} tile(s) de cenário limpos, ${moved} item(ns) movido(s)`);
  return { stacks: stacks.length, cleared, moved, refused };
};

/** Devolve cada entidade ao chunk em que o TILE dela cai (só muda algo depois de um `move`). */
const reindexEntities = (world) => {
  const { chunkColumns: cols, chunkRows: rows } = world.meta;
  const byKey = new Map(world.chunks.map((c) => [`${c.cx},${c.cy}`, c]));
  for (const list of ['enemies', 'pickups', 'npcs']) {
    const all = world.chunks.flatMap((c) => c[list] ?? []);
    for (const chunk of world.chunks) chunk[list] = [];
    for (const entity of all) {
      const home = byKey.get(`${Math.floor(entity.worldX / cols)},${Math.floor(entity.worldY / rows)}`);
      if (home) home[list].push(entity);
    }
  }
};

const main = async () => {
  const check = process.argv.includes('--check');
  const dry = process.argv.includes('--dry') || check;
  const log = (line) => console.log(line);

  const levels = await fs.readdir(resolvePath(LEVELS_DIR))
    .then((names) => names.filter((n) => /^level-\d+\.json$/u.test(n)).sort()
      .map((n) => `${LEVELS_DIR}/${n}`))
    .catch(() => []);

  let stacks = 0;
  let refused = [];
  for (const rel of [...FILES, ...levels]) {
    const world = await readJson(rel);
    // O MESMO formato dos dois lados da comparação, e o mesmo que o disco já usa (2 espaços +
    // \n final, como o editor grava). Comparar compacto com indentado marcaria TODO arquivo como
    // mudado, e o script reescreveria 14 mapas para não consertar nada em 13 deles.
    const before = JSON.stringify(world, null, 2);
    const result = fixWorld(world, rel, log);
    stacks += result.stacks;
    refused = refused.concat(result.refused.map((r) => `${rel} ${r}`));
    const after = JSON.stringify(world, null, 2);
    if (!dry && after !== before) await fs.writeFile(resolvePath(rel), `${after}\n`, 'utf8');
  }

  for (const line of refused) console.error(`RECUSADO: ${line}`);

  if (check && (stacks > 0 || refused.length > 0)) {
    console.error(`\nFALHOU: ${stacks} tile(s) ainda com pilha no disco.`);
    process.exit(1);
  }
  if (refused.length > 0) process.exit(1);
  console.log(dry ? '\n(--dry: nada foi gravado)' : '\nOK — chão + uma coisa em todo tile.');
};

await main();

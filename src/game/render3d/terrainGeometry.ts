// Os construtores de geometria do terreno, fundidos por chunk: o chão plano com AO, as margens e o beiço da água, a
// lava e a terra queimada em volta, os blocos (rocha, parede, penhasco), o relevo com os degraus, as escadas, e a sombra
// de massa assada aos poucos. São funções puras de dado → BufferGeometry: o World3D (buildTerrain) as chama.

import * as THREE from 'three';
import { CLIFF_WALL_FRAMES, DUNGEON_WALL_FRAMES, MASS_TILE_FRAMES, terrainVariant } from '@/game/constants';
import { RELIEF_HEIGHT } from '@/game/world/relief';
import { ANCIENT_GROVE, BIOME_DECOR, biomeTintAt } from '@/game/world/biomes';
import { VINE_VARIANTS, type VineQuad } from './vineTexture';
import { tilesetFrameUv } from './textures3d';

/** Trepadeira em uma face a cada tantas (de cem), escolhidas pela coordenada. */
const VINE_CHANCE = 42;
// NUMERIC tile/bucket keys for the shadow pass's lookups. A `${x},${z}` string key would
// allocate on every probe of the hottest loops; these fold the coordinate into one number.
// The +4096 offset keeps negatives (the void ring runs past the world bounds) positive.
export const tileKey = (x: number, z: number): number => (x + 4096) * 16384 + (z + 4096);
export const bucketKey = (x: number, z: number): number => ((x + 4096) >> 2) * 16384 + ((z + 4096) >> 2);
// Lava tiles sink into a well too, but a SHALLOWER one than the river — molten rock pools
// in a low basin, not a deep channel. Same treatment (dropped bed + dark charred banks), less
// deep. LavaObject sets its surface just above the bed at this depth.
export const LAVA_DEPTH_TILES = 0.26;
// Baked AO: how dark a ground corner goes when all three tiles touching it are standing solids.
const AO_MAX = 0.5;
// ── O QUE O VENTO MOVE ────────────────────────────────────────────────────────────────────────
// Duas listas, e as duas existem para dizer o que NÃO se mexe. As malhas do terreno são fundidas
// por camada, não por assunto: a mesma malha em pé carrega o pinheiro e o TÚMULO, e a mesma malha
// deitada carrega o capim e os OSSOS. Sem estas listas, o vento sacudiria a pedra do cemitério —
// e uma lápide balançando desmente, num quadro, a solidez de tudo o mais que está parado.
//
// A mata em pé: pinheiros (4/14-18), árvore seca (3/21) e os dois estágios de tombamento (36/37),
// que continuam sendo madeira em pé. Fora ficam a cabeça na estaca (22) e o túmulo (25).
const WIND_SWAY_FRAMES: ReadonlySet<number> = new Set([3, 4, 14, 15, 16, 17, 18, 21, 36, 37, ANCIENT_GROVE.treeA, ANCIENT_GROVE.treeB]);
// O mato deitado: capim, folhagem e o arbusto florido. Cogumelo, graveto, seixo, pedregulho e osso
// ficam de fora — o que é rígido no mundo tem de ficar rígido na tela.
export const WIND_STIR_FRAMES: ReadonlySet<number> = new Set([
  0, 1, 7, 8, 19, 20,
  // a flora dos biomas que balança; cristal, brasa e folha caída ficam parados
  BIOME_DECOR.fern, BIOME_DECOR.mossBloom, BIOME_DECOR.wheat, BIOME_DECOR.daisies, BIOME_DECOR.poppies,
  BIOME_DECOR.bluebells, BIOME_DECOR.clover, ANCIENT_GROVE.bush, ANCIENT_GROVE.grass,
]);
// ── merged tile geometry builders ─────────────────────────────────────────────

/**
 * Erase one quad from a merged, indexed geometry by folding its four vertices onto a single
 * point: both its triangles become degenerate and rasterize zero pixels. The alternative —
 * rebuilding the buffer without that quad — reallocates and re-uploads the whole mesh, which
 * for the ~6000-quad forest is a visible hitch on a single axe swing.
 */
export const collapseQuad = (geo: THREE.BufferGeometry, vertStart: number): void => {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const x = pos.getX(vertStart);
  const y = pos.getY(vertStart);
  const z = pos.getZ(vertStart);
  for (let i = 0; i < 4; i++) pos.setXYZ(vertStart + i, x, y, z);
  pos.needsUpdate = true;
};

// Corner order of a flat quad, as (dx, dz) in half-tiles — the order positions are pushed in.
const AO_CORNERS: ReadonlyArray<readonly [number, number]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

/**
 * Baked ambient occlusion for one flat tile, as four corner shades: a corner hemmed in by
 * standing tiles (trees, walls) sees less of the sky, so it goes darker. This is depth from
 * LIGHT, not from geometry — the rule of the project is that nothing may grow out of its tile.
 *
 * Split out of buildFlatTileGeometry because felling a tree TILE has to re-bake it: the shade
 * around a tree's feet is baked into its NEIGHBOURS' vertex colours, so a tree that vanished
 * without this would leave its own shadow printed on the clearing the player just opened.
 *
 * O CANTO É UM SÓ, e por isso a conta inclui o próprio tile: os quatro tiles que se encontram num ponto
 * perguntam pelos mesmos quatro tiles e chegam ao mesmo tom. Sem isso, o tile da árvore não se contava,
 * saía claro no canto em que o vizinho saía escuro, e a divisa virava um risco reto em volta dele (relato
 * do autor).
 */
/**
 * A COR DO CHÃO NUM PONTO QUALQUER: o bioma vezes a sombra de canto (`tileAoCorners`), interpolada dentro do
 * tile. Nos cantos dá exatamente o que `buildFlatTileGeometry` põe no vértice — é isso que faz o beiço da
 * serra e da montanha (desenhado por `buildReliefContourGeometry`, em pedaços que não caem nos cantos)
 * emendar no chão comum sem risco. Antes o beiço saía sem sombra de canto, e a montanha nem com o bioma:
 * onde os dois se encostavam, a cor saltava numa linha reta.
 */
export const groundShadeAt = (solids: ReadonlySet<number>) => {
  const tint = groundTintAt(solids);
  return (px: number, pz: number): readonly [number, number, number] => {
    const tx = Math.round(px);
    const tz = Math.round(pz);
    const ao = tileAoCorners(tx, tz, solids);
    const u = Math.min(1, Math.max(0, px - (tx - 0.5)));
    const v = Math.min(1, Math.max(0, pz - (tz - 0.5)));
    const shade = ao[0] * (1 - u) * (1 - v) + ao[1] * u * (1 - v) + ao[2] * u * v + ao[3] * (1 - u) * v;
    const t = tint(px, pz);
    return [t[0] * shade, t[1] * shade, t[2] * shade];
  };
};

// ── O CHÃO EM DUAS ESCALAS (pedido do autor, 2026-11-10) ──────────────────────────────────────────────────────
// O chão só tinha a escala FINA: o grão do capim, igual em todo canto. De longe ele lia como um tapete chapado — sem
// uma mancha mais clara, sem o escuro debaixo da mata. Duas camadas de valor, as duas suaves e LIDAS NO PONTO (nunca
// por tile), para os vizinhos chegarem ao mesmo tom no mesmo canto e nenhum risco reto nascer:
//
//   · a MANCHA larga (~7 tiles): um ruído que clareia e esquenta um lado, escurece e esfria o outro (±7%);
//   · a SOMBRA DE COPA: o chão a até dois tiles de árvores e paredes escurece aos poucos (até 11%) — a sombra de canto
//     (AO_MAX) já fecha o encosto; esta é a penumbra larga da mata, que faltava.
const PATCH_GRAIN = 7;
const PATCH_AMOUNT = 0.07;
const CANOPY_MAX = 0.11;
const patchHash = (x: number, z: number): number => {
  let h = (x * 73856093) ^ (z * 19349663) ^ 0x2f6b1a;
  h = (h ^ (h >>> 13)) >>> 0;
  return (Math.imul(h, 0x5bd1e995) >>> 0) / 4294967295;
};
const patchNoise = (x: number, z: number): number => {
  const fx = x / PATCH_GRAIN; const fz = z / PATCH_GRAIN;
  const cx = Math.floor(fx); const cz = Math.floor(fz);
  const tx = fx - cx; const tz = fz - cz;
  const sx = tx * tx * (3 - 2 * tx); const sz = tz * tz * (3 - 2 * tz);
  const top = patchHash(cx, cz) * (1 - sx) + patchHash(cx + 1, cz) * sx;
  const bottom = patchHash(cx, cz + 1) * (1 - sx) + patchHash(cx + 1, cz + 1) * sx;
  return top * (1 - sz) + bottom * sz;
};

/**
 * A COR DO CHÃO antes da sombra de canto: o bioma × a mancha larga × a sombra de copa. É ela que toda malha de chão
 * veste (`groundShadeAt` multiplica a sombra de canto por cima) — o chão comum, o do planalto, o beiço, a margem e a
 * decoração rasteira.
 */
export const groundTintAt = (solids?: ReadonlySet<number>) => {
  // A sombra de copa na grade dos CANTOS de tile (um número por canto, lembrado), e interpolada dentro do tile.
  const memo = new Map<number, number>();
  const canopyCorner = (ix: number, iz: number): number => {
    const k = tileKey(ix, iz);
    let v = memo.get(k);
    if (v !== undefined) return v;
    let sum = 0;
    if (solids) {
      // o canto (ix - 0.5, iz - 0.5): os tiles num raio de ~2,5 em volta dele
      for (let dz = -3; dz <= 2; dz++) {
        for (let dx = -3; dx <= 2; dx++) {
          if (!solids.has(tileKey(ix + dx, iz + dz))) continue;
          const d = Math.hypot(dx + 0.5, dz + 0.5);
          sum += Math.max(0, 1 - (d - 0.7) / 1.9);
        }
      }
    }
    v = 1 - CANOPY_MAX * Math.min(1, sum / 5);
    memo.set(k, v);
    return v;
  };
  return (px: number, pz: number): [number, number, number] => {
    const t = biomeTintAt(px, pz);
    const k = (patchNoise(px, pz) - 0.5) * 2 * PATCH_AMOUNT;
    // os cantos de tile são meio-inteiros: o canto (i - 0.5) guarda o índice i
    const gx = px + 0.5; const gz = pz + 0.5;
    const ix = Math.floor(gx); const iz = Math.floor(gz);
    const u = gx - ix; const v = gz - iz;
    const canopy = canopyCorner(ix, iz) * (1 - u) * (1 - v) + canopyCorner(ix + 1, iz) * u * (1 - v)
      + canopyCorner(ix + 1, iz + 1) * u * v + canopyCorner(ix, iz + 1) * (1 - u) * v;
    // a mancha clara esquenta, a escura esfria (a mesma regra da rampa: sombra fria, luz quente)
    return [t[0] * (1 + k * 1.25) * canopy, t[1] * (1 + k) * canopy, t[2] * (1 + k * 0.4) * canopy];
  };
};

const tileAoCorners = (x: number, z: number, solids?: ReadonlySet<number>): number[] =>
  AO_CORNERS.map(([dx, dz]) => {
    let occluders = 0;
    if (solids) {
      if (solids.has(tileKey(x, z))) occluders++;
      if (solids.has(tileKey(x + dx, z))) occluders++;
      if (solids.has(tileKey(x, z + dz))) occluders++;
      if (solids.has(tileKey(x + dx, z + dz))) occluders++;
    }
    return 1 - AO_MAX * Math.min(1, occluders / 3);
  });

/**
 * A COSTA, por canto — o degrau que a arrebentação do mar sobe e desce (SEA_SHALLOW_GLSL).
 *
 * Mesma leitura de três vizinhos que a oclusão-ambiente do chão faz, e de propósito: as duas
 * perguntam "o que encosta neste canto?", e se discordassem a espuma nasceria meio tile fora da
 * praia que a sombra desenha. 0 = mar aberto, 1 = um canto cercado de terra (o fundo de uma
 * enseada); a beira de uma costa reta chega a 2/3, que é a faixa em que os limiares do shader
 * estão calibrados.
 */
export const tileShoreCorners = (x: number, z: number, wet: ReadonlySet<number>): number[] =>
  AO_CORNERS.map(([dx, dz]) => {
    let land = 0;
    if (!wet.has(tileKey(x + dx, z))) land++;
    if (!wet.has(tileKey(x, z + dz))) land++;
    if (!wet.has(tileKey(x + dx, z + dz))) land++;
    return land / 3;
  });

export const buildFlatTileGeometry = (
  tiles: Array<{ x: number; z: number; frame: number }>,
  /** A altura do quad: um numero, ou uma por tile (a decoracao que sobe com o planalto). */
  yAt: number | ((x: number, z: number) => number),
  solids?: ReadonlySet<number>,
  /** Per-corner shore ramp, emitted as the `aShore` attribute the sea's material reads. */
  shore?: (x: number, z: number) => number[],
  /**
   * Emite o atributo `aWind` (ver WIND_WAVE_GLSL). Só a malha de DECORAÇÃO passa isto: o chão, o
   * leito e o mar não têm vegetação nenhuma, e um atributo a mais em 11 mil quads de oceano seria
   * meio megabyte para multiplicar por zero.
   */
  windMask?: (frame: number) => number,
  /**
   * A cor do BIOMA (world/biomes.ts), lida em cada CANTO do tile: dois tiles vizinhos perguntam pelo
   * mesmo ponto e chegam à mesma cor, então a passagem de um bioma ao outro é um degradê, nunca um risco.
   */
  tintAt?: (x: number, z: number) => readonly [number, number, number],
  /**
   * O ESPALHAMENTO da decoração (ver TerrainFeatures.bakeDecor): quanto o quad anda dentro do próprio tile, em tiles, e
   * quanto o tom dele varia. Só a malha de DECORAÇÃO passa isto — o chão emenda canto a canto e não pode andar.
   */
  scatter?: (x: number, z: number, frame: number) => { dx: number; dz: number; shade: number },
): THREE.BufferGeometry => {
  const pos: number[] = [];
  const uv: number[] = [];
  const bounds: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const shr: number[] = [];
  const wind: number[] = [];
  const idx: number[] = [];
  tiles.forEach(({ x, z, frame }, i) => {
    const f = tilesetFrameUv(frame);
    const y = typeof yAt === 'number' ? yAt : yAt(x, z);
    const sc = scatter?.(x, z, frame);
    const cx = x + (sc?.dx ?? 0);
    const cz = z + (sc?.dz ?? 0);
    pos.push(cx - 0.5, y, cz - 0.5, cx + 0.5, y, cz - 0.5, cx + 0.5, y, cz + 0.5, cx - 0.5, y, cz + 0.5);
    uv.push(f.u0, f.v1, f.u1, f.v1, f.u1, f.v0, f.u0, f.v0);
    // Which frame of the atlas this quad may sample, so the texel-AA fetch cannot slide into the
    // next tile's art (pixelArtLight/zhTexelUv). Per vertex because it is ONE mesh: the whole
    // ground is a single draw and every quad in it windows onto a different tile.
    for (let k = 0; k < 4; k++) bounds.push(f.cu0, f.cv0, f.cu1, f.cv1);
    nrm.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
    const ao = tileAoCorners(x, z, solids);
    const tone = sc?.shade ?? 1;
    if (tintAt) {
      // os cantos na MESMA ordem das posições acima
      [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].forEach(([dx, dz], k) => {
        const t = tintAt(x + dx, z + dz);
        col.push(ao[k] * t[0] * tone, ao[k] * t[1] * tone, ao[k] * t[2] * tone);
      });
    } else {
      for (const shade of ao) col.push(shade * tone, shade * tone, shade * tone);
    }
    if (shore) shr.push(...shore(x, z));
    if (windMask) {
      // o vento gira o quad em volta do centro DELE (o que andou com o espalhamento), não do tile
      const stir = windMask(frame);
      for (let k = 0; k < 4; k++) wind.push(stir, cx, cz);
    }
    const b = i * 4;
    idx.push(b, b + 3, b + 2, b, b + 2, b + 1);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aUvBounds', new THREE.Float32BufferAttribute(bounds, 4));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  if (shore) geo.setAttribute('aShore', new THREE.Float32BufferAttribute(shr, 1));
  if (windMask) geo.setAttribute('aWind', new THREE.Float32BufferAttribute(wind, 3));
  geo.setIndex(idx);
  return geo;
};

/**
 * As FAIXAS da margem, de cima para baixo: [onde começa, onde acaba] em fração da profundidade, e
 * a cor. Faixas CHAPADAS e não um degradê — um degradê seria a única aresta lisa do jogo, a mesma
 * razão da espuma serrilhada do mar. O friso de capim de cima é o chão dobrando a borda (sem ele a
 * grama acaba num corte de faca); a terra do meio é a cor do leito; a de baixo é a terra MOLHADA,
 * que é o que diz onde a água bate.
 */
const BANK_BANDS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0.22, 0x2e4720],
  [0.22, 0.68, 0x4a3520],
  [0.68, 1, 0x21180e],
];

// Vertical walls closing the sunken river channel: one strip per band on every edge where a
// water tile meets a non-water tile, from the land (y=0) down to the bed (y=-depth).
export const buildBankGeometry = (
  water: ReadonlySet<string>,
  bedTiles: ReadonlyArray<{ x: number; z: number }>,
  depth: number,
): THREE.BufferGeometry => {
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const sides: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const bandColors = BANK_BANDS.map(([, , hex]) => new THREE.Color(hex)); // sRGB → linear
  let v = 0;
  for (const { x, z } of bedTiles) {
    for (const [dx, dz] of sides) {
      if (water.has(`${x + dx},${z + dz}`)) continue; // neighbour is also water → no bank here
      // The shared edge, as two endpoints (a → b) on the ground plane.
      let ax: number; let az: number; let bx: number; let bz: number;
      if (dx !== 0) { ax = bx = x + dx * 0.5; az = z - 0.5; bz = z + 0.5; }
      else { az = bz = z + dz * 0.5; ax = x - 0.5; bx = x + 0.5; }
      BANK_BANDS.forEach(([from, to], band) => {
        const top = -depth * from;
        const bottom = -depth * to;
        // Strip: (a,b at its top) down to (b,a at its bottom).
        pos.push(ax, top, az, bx, top, bz, bx, bottom, bz, ax, bottom, az);
        const c = bandColors[band];
        for (let k = 0; k < 4; k++) {
          nrm.push(dx, 0, dz); // horizontal; DoubleSide lights both faces
          col.push(c.r, c.g, c.b);
        }
        idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
        v += 4;
      });
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  return geo;
};

/**
 * A MARGEM ORGÂNICA — onde a terra encontra a água, sem a linha reta do tile.
 *
 * O lago e o rio são tiles, e a margem era a borda do tile: paredes retas, quinas de 90°, o chão
 * acabando num corte de faca. Nada disso muda no DADO (a colisão continua por tile); muda o que se
 * vê. Em cada tile de água encostado na terra, o chão AVANÇA sobre a água por um "beiço" cujo
 * contorno é um campo de distância, decidido pixel de arte a pixel de arte (SHORE_CELLS por tile):
 *
 *   · a distância de cada pixel até a terra vizinha é uma UNIÃO SUAVE (smooth-min) das distâncias
 *     até cada tile de terra — é ela que arredonda a quina CÔNCAVA (a água fazendo um canto);
 *   · a distância até um tile de terra é euclidiana fora dele, então a ponta de terra que entra na
 *     água (o píer, uma quina convexa) sai arredondada sozinha;
 *   · a largura do beiço anda num ruído de valor por coordenada (SHORE_MIN..+SHORE_VAR): a margem
 *     ondula, e é sempre a mesma em todo boot.
 *
 * O beiço é pixel de arte inteiro, em degraus — a margem é serrilhada por texel como a espuma do
 * mar, nunca uma curva lisa que seria a única aresta suave do jogo. Ele veste a arte do tile de
 * chão de onde vem (o mesmo material do chão, então a luz e o AA de texel são os do chão), e o
 * barranco desce pelo CONTORNO dele com as faixas de BANK_BANDS. Faces viradas para o norte não
 * nascem: o próprio beiço as esconde da câmera, que nunca gira.
 *
 * Custo: zero por quadro. É geometria estática nos dois materiais que já existiam (sem programa
 * novo), assada no boot: as células viram faixas por linha (um quad por corrida), e o rio e o lago
 * do mundo inteiro somam poucos milhares de quads — menos que um canto da floresta.
 */
const SHORE_CELLS = 16; // um pixel de arte
const SHORE_MIN = 0.05; // em tiles: a largura mínima do beiço (cobre a borda do tile em todo lugar)
const SHORE_VAR = 0.2; // quanto o ruído soma a ela
const SHORE_ROUND = 0.45; // o raio da união suave: o tamanho da curva na quina côncava
const SHORE_MUD = 0x3a2a18; // a terra molhada na linha da água
const SHORE_MUD_Y = -0.012; // logo abaixo do beiço

const shoreHash = (x: number, z: number): number => {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
/** Ruído de valor suave em (x, z), 0..1 — determinístico: a mesma margem em todo boot. */
const shoreNoise = (x: number, z: number): number => {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = shoreHash(ix, iz);
  const b = shoreHash(ix + 1, iz);
  const c = shoreHash(ix, iz + 1);
  const d = shoreHash(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
};
const smoothMin = (a: number, b: number, k: number): number => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};

type ShoreOptions = {
  /** A largura do beiço, em tiles: o mínimo e quanto o ruído soma. */
  min?: number;
  variance?: number;
  /** O quanto a união das distâncias arredonda. Num corredor estreito o padrão fecha a passagem inteira. */
  round?: number;
  /** Raio do canto, em tiles: dois lados de terra se encontrando viram curva. */
  corner?: number;
  /** A frequência da ondulação da beira: um poço pequeno precisa dela mais curta para mostrá-la. */
  wobble?: number;
  /** A altura do beiço, para quem pousa sobre um chão no mesmo plano. */
  y?: number;
  /** Só o beiço: sem barranco, para o que não tem desnível. */
  flatOnly?: boolean;
  /** Só a terra que tem arte conta como margem. */
  sourceOnly?: boolean;
  /** Só desenha o beiço onde isto responder sim. */
  keep?: (px: number, pz: number) => boolean;
  lipTint?: readonly [number, number, number];
  /**
   * A cor do chão em cada ponto do beiço (`groundShadeAt`: bioma × sombra de canto). O beiço é o chão de
   * terra avançando sobre a água (ou o capim mordendo o calçamento), então tem de vestir a MESMA cor do chão
   * de onde vem; branco, ele desenhava em volta de todo lago um anel de outra cor. Ganha de `lipTint`.
   */
  shadeAt?: (x: number, z: number) => readonly [number, number, number];
  bands?: ReadonlyArray<readonly [number, number, number]>;
  mud?: number;
};

export const STONE_LIP_Y = 0.004;
/** A beira do calçamento: positivo o capim morde a pedra, negativo a pedra avança no capim. O mesmo ruído decide os dois lados. */
export const STONE_EDGE_MIN = -0.24;
export const STONE_EDGE_VAR = 0.5;
export const STONE_EDGE_WOBBLE = 2.6;

/** A beira do poço é chão queimado, o mesmo tom do torrão em volta dele. */
const LAVA_RIM = new THREE.Color(0x453826);
export const LAVA_RIM_TINT: readonly [number, number, number] = [LAVA_RIM.r, LAVA_RIM.g, LAVA_RIM.b];

/** O barranco da lava: carvão em cima, e a parede vai acendendo até o fundo, de onde vem a luz. */
export const LAVA_BANK_BANDS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0.4, 0x1c0f08],
  [0.4, 0.75, 0x4e1a08],
  [0.75, 1, 0xd4561a],
];

/**
 * A SUPERFÍCIE DA LAVA, uma malha só e em células: `aShore` vale 1 na margem e 0 a meio tile dela. O canto por
 * vizinho que a água usa não serve aqui: num poço de um tile de largura todo canto encosta na terra, e a lava
 * inteira viraria beira.
 */
export const buildLavaSurface = (lava: ReadonlySet<number>, tiles: ReadonlyArray<{ x: number; z: number }>): THREE.BufferGeometry => {
  const N = 8;
  const pos: number[] = [];
  const uv: number[] = [];
  const shore: number[] = [];
  const idx: number[] = [];
  const y = -LAVA_DEPTH_TILES + 0.02;
  for (const { x, z } of tiles) {
    const base = pos.length / 3;
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        const px = x - 0.5 + i / N;
        const pz = z - 0.5 + j / N;
        let d = Infinity;
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (lava.has(tileKey(x + dx, z + dz))) continue;
            d = Math.min(d, Math.hypot(Math.max(Math.abs(px - x - dx) - 0.5, 0), Math.max(Math.abs(pz - z - dz) - 0.5, 0)));
          }
        }
        pos.push(px, y, pz);
        uv.push(i / N, j / N);
        shore.push(1 - Math.min(1, d / 0.5));
      }
    }
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const a = base + j * (N + 1) + i;
        const b = a + 1;
        const c = a + N + 1;
        const e = c + 1;
        idx.push(a, c, e, a, e, b);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aShore', new THREE.Float32BufferAttribute(shore, 1));
  geo.setIndex(idx);
  return geo;
};

export const buildShoreGeometry = (
  wet: ReadonlySet<number>,
  tiles: ReadonlyArray<{ x: number; z: number }>,
  landFrame: (x: number, z: number) => number | null,
  depth: number,
  opts: ShoreOptions = {},
): { lip: THREE.BufferGeometry; walls: THREE.BufferGeometry } => {
  const lipMin = opts.min ?? SHORE_MIN;
  const lipVar = opts.variance ?? SHORE_VAR;
  const lipY = opts.y ?? 0;
  const round = opts.round ?? SHORE_ROUND;
  const wobble = opts.wobble ?? 1.3;
  const tint = opts.lipTint ?? [1, 1, 1];
  const bands = opts.bands ?? BANK_BANDS;
  const N = SHORE_CELLS;
  const step = 1 / N;
  const memo = new Map<number, number>();
  /** −1 = terra (fora da água), 0 = água aberta, >0 = beiço: o tileKey do chão de onde ele vem, +1. */
  const cellAt = (gx: number, gz: number): number => {
    const key = (gx + 262144) * 524288 + (gz + 262144);
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const tx = Math.floor(gx / N);
    const tz = Math.floor(gz / N);
    let out = 0;
    if (!wet.has(tileKey(tx, tz))) {
      out = -1;
    } else {
      const px = (gx + 0.5) / N - 0.5;
      const pz = (gz + 0.5) / N - 0.5;
      let d = Infinity;
      let best = Infinity;
      let src = -1;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const lx = tx + dx;
          const lz = tz + dz;
          if ((dx === 0 && dz === 0) || wet.has(tileKey(lx, lz))) continue;
          if (opts.sourceOnly && landFrame(lx, lz) === null) continue;
          const ex = Math.max(Math.abs(px - lx) - 0.5, 0);
          const ez = Math.max(Math.abs(pz - lz) - 0.5, 0);
          const di = Math.sqrt(ex * ex + ez * ez);
          d = d === Infinity ? di : smoothMin(d, di, round);
          if (di < best && landFrame(lx, lz) !== null) {
            best = di;
            src = tileKey(lx, lz);
          }
        }
      }
      if (opts.corner) {
        const r = opts.corner;
        const fx = px - tx;
        const fz = pz - tz;
        const ex = 0.5 - Math.abs(fx);
        const ez = 0.5 - Math.abs(fz);
        const sideX = !wet.has(tileKey(tx + (fx >= 0 ? 1 : -1), tz));
        const sideZ = !wet.has(tileKey(tx, tz + (fz >= 0 ? 1 : -1)));
        if (sideX && sideZ && ex < r && ez < r) d = Math.min(d, r - Math.hypot(r - ex, r - ez));
      }
      if (src >= 0 && d < lipMin + lipVar * shoreNoise(px * wobble, pz * wobble) && (!opts.keep || opts.keep(px, pz))) out = src + 1;
    }
    memo.set(key, out);
    return out;
  };

  const lp: number[] = [];
  const luv: number[] = [];
  const lb: number[] = [];
  const ln: number[] = [];
  const lc: number[] = [];
  const li: number[] = [];
  let lv = 0;
  const wp: number[] = [];
  const wn: number[] = [];
  const wc: number[] = [];
  const wi: number[] = [];
  let wv = 0;
  const bandColors = bands.map(([, , hex]) => new THREE.Color(hex)); // sRGB → linear
  const wall = (ax: number, az: number, bx: number, bz: number, nx: number, nz: number): void => {
    if (opts.flatOnly) return;
    bands.forEach(([from, to], band) => {
      const top = -depth * from;
      const bottom = -depth * to;
      wp.push(ax, top, az, bx, top, bz, bx, bottom, bz, ax, bottom, az);
      const c = bandColors[band];
      for (let k = 0; k < 4; k++) {
        wn.push(nx, 0, nz);
        wc.push(c.r, c.g, c.b);
      }
      wi.push(wv, wv + 1, wv + 2, wv, wv + 2, wv + 3);
      wv += 4;
    });
  };

  for (const { x: tx, z: tz } of tiles) {
    let nearLand = false;
    for (let dz = -1; dz <= 1 && !nearLand; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!wet.has(tileKey(tx + dx, tz + dz))) { nearLand = true; break; }
      }
    }
    if (!nearLand) continue;
    const gx0 = tx * N;
    const gz0 = tz * N;
    const x0 = tx - 0.5;
    const z0 = tz - 0.5;

    // O beiço: uma faixa por corrida de células da mesma origem, em cada linha.
    for (let j = 0; j < N; j++) {
      let i = 0;
      while (i < N) {
        const code = cellAt(gx0 + i, gz0 + j);
        if (code <= 0) { i++; continue; }
        let e = i;
        while (e + 1 < N && cellAt(gx0 + e + 1, gz0 + j) === code) e++;
        const src = code - 1;
        const f = tilesetFrameUv(landFrame(Math.floor(src / 16384) - 4096, (src % 16384) - 4096) as number);
        const ax = x0 + i * step;
        const bx = x0 + (e + 1) * step;
        const az = z0 + j * step;
        const bz = az + step;
        // A arte do chão de origem, pousada sobre o tile de água como se continuasse nele.
        const u = (px: number): number => f.u0 + (px - x0) * (f.u1 - f.u0);
        const v = (pz: number): number => f.v1 - (pz - z0) * (f.v1 - f.v0);
        // Beiço erguido sobre o mesmo plano: sem esta sobra, a câmera vê por baixo da beira um fio do que ele cobre.
        const g = opts.flatOnly ? 0.012 : 0;
        lp.push(ax - g, lipY, az - g, bx + g, lipY, az - g, bx + g, lipY, bz + g, ax - g, lipY, bz + g);
        luv.push(u(ax), v(az), u(bx), v(az), u(bx), v(bz), u(ax), v(bz));
        for (const [cx, cz] of [[ax - g, az - g], [bx + g, az - g], [bx + g, bz + g], [ax - g, bz + g]]) {
          lb.push(f.cu0, f.cv0, f.cu1, f.cv1);
          ln.push(0, 1, 0);
          const c = opts.shadeAt ? opts.shadeAt(cx, cz) : tint;
          lc.push(c[0], c[1], c[2]);
        }
        li.push(lv, lv + 3, lv + 2, lv, lv + 2, lv + 1);
        lv += 4;
        i = e + 1;
      }
    }

    // O barranco pelo contorno: a face SUL de cada corrida que dá para água aberta...
    for (let j = 0; j < N; j++) {
      let i = 0;
      while (i < N) {
        const open = (c: number): boolean => cellAt(gx0 + c, gz0 + j) > 0 && cellAt(gx0 + c, gz0 + j + 1) === 0;
        if (!open(i)) { i++; continue; }
        let e = i;
        while (e + 1 < N && open(e + 1)) e++;
        const z = z0 + (j + 1) * step;
        wall(x0 + i * step, z, x0 + (e + 1) * step, z, 0, 1);
        i = e + 1;
      }
    }
    // A LAMA MOLHADA: um pixel de terra onde a água encosta na margem pelos lados e por baixo. Ali o barranco
    // fica de costas para a câmera, e sem isto o capim acabava direto na água.
    const mud = new THREE.Color(opts.mud ?? SHORE_MUD);
    for (let j = 0; j < N && !opts.flatOnly; j++) {
      for (let i = 0; i < N; i++) {
        const gx = gx0 + i;
        const gz = gz0 + j;
        if (cellAt(gx, gz) !== 0) continue;
        if (cellAt(gx, gz + 1) === 0 && cellAt(gx - 1, gz) === 0 && cellAt(gx + 1, gz) === 0) continue;
        const ax = x0 + i * step;
        const az = z0 + j * step;
        wp.push(ax, SHORE_MUD_Y, az, ax + step, SHORE_MUD_Y, az, ax + step, SHORE_MUD_Y, az + step, ax, SHORE_MUD_Y, az + step);
        for (let k = 0; k < 4; k++) {
          wn.push(0, 1, 0);
          wc.push(mud.r, mud.g, mud.b);
        }
        wi.push(wv, wv + 3, wv + 2, wv, wv + 2, wv + 1);
        wv += 4;
      }
    }
    // ...e as faces LESTE e OESTE, por coluna.
    for (const side of [1, -1]) {
      for (let i = 0; i < N; i++) {
        let j = 0;
        while (j < N) {
          const open = (r: number): boolean => cellAt(gx0 + i, gz0 + r) > 0 && cellAt(gx0 + i + side, gz0 + r) === 0;
          if (!open(j)) { j++; continue; }
          let e = j;
          while (e + 1 < N && open(e + 1)) e++;
          const x = x0 + (side > 0 ? i + 1 : i) * step;
          wall(x, z0 + j * step, x, z0 + (e + 1) * step, side, 0);
          j = e + 1;
        }
      }
    }
  }

  const lip = new THREE.BufferGeometry();
  lip.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  lip.setAttribute('uv', new THREE.Float32BufferAttribute(luv, 2));
  lip.setAttribute('aUvBounds', new THREE.Float32BufferAttribute(lb, 4));
  lip.setAttribute('normal', new THREE.Float32BufferAttribute(ln, 3));
  lip.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3));
  lip.setIndex(li);
  const walls = new THREE.BufferGeometry();
  walls.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
  walls.setAttribute('normal', new THREE.Float32BufferAttribute(wn, 3));
  walls.setAttribute('color', new THREE.Float32BufferAttribute(wc, 3));
  walls.setIndex(wi);
  return { lip, walls };
};

/**
 * O CHÃO QUEIMADO EM VOLTA DA LAVA: torrões de dois pixels de arte que se desfazem no capim. É geometria do
 * terreno porque só ela sabe onde há lava: nada aqui cai dentro de um tile de lava.
 */
const SCORCH_REACH = 0.8; // em tiles, a partir da borda da lava
const SCORCH_CELL = 1 / 8; // dois pixels de arte
const SCORCH_Y = 0.006;
const SCORCH_TONES = [0x352c20, 0x453826, 0x56482c] as const;

export const buildScorchGeometry = (
  lava: ReadonlySet<number>,
  tiles: ReadonlyArray<{ x: number; z: number }>,
): THREE.BufferGeometry => {
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const tones = SCORCH_TONES.map((hex) => new THREE.Color(hex));
  const seen = new Set<number>();
  const perTile = Math.round(1 / SCORCH_CELL);
  const span = Math.ceil(SCORCH_REACH) + 1;
  let v = 0;
  for (const t of tiles) {
    for (let gz = (t.z - span) * perTile; gz < (t.z + span + 1) * perTile; gz++) {
      for (let gx = (t.x - span) * perTile; gx < (t.x + span + 1) * perTile; gx++) {
        const key = (gx + 262144) * 524288 + (gz + 262144);
        if (seen.has(key)) continue;
        seen.add(key);
        const cx = (gx + 0.5) * SCORCH_CELL - 0.5;
        const cz = (gz + 0.5) * SCORCH_CELL - 0.5;
        const tx = Math.round(cx);
        const tz = Math.round(cz);
        if (lava.has(tileKey(tx, tz))) continue;
        let d = Infinity;
        for (const o of tiles) {
          const ex = Math.max(Math.abs(cx - o.x) - 0.5, 0);
          const ez = Math.max(Math.abs(cz - o.z) - 0.5, 0);
          d = Math.min(d, Math.hypot(ex, ez));
        }
        if (d >= SCORCH_REACH || shoreHash(gx, gz) < d / SCORCH_REACH) continue;
        const c = tones[Math.min(tones.length - 1, Math.floor((d / SCORCH_REACH) * 2 + shoreHash(gz, gx)))];
        const ax = gx * SCORCH_CELL - 0.5;
        const az = gz * SCORCH_CELL - 0.5;
        const bx = ax + SCORCH_CELL;
        const bz = az + SCORCH_CELL;
        pos.push(ax, SCORCH_Y, az, bx, SCORCH_Y, az, bx, SCORCH_Y, bz, ax, SCORCH_Y, bz);
        for (let k = 0; k < 4; k++) {
          nrm.push(0, 1, 0);
          col.push(c.r, c.g, c.b);
        }
        idx.push(v, v + 3, v + 2, v, v + 2, v + 1);
        v += 4;
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  return geo;
};

/**
 * OS BLOCOS MACICOS, em CUBO — a alvenaria da dungeon e a MONTANHA do mundo aberto.
 *
 * Todo o resto que fica em pe aqui e um quad vertical: uma arvore, uma lapide. Isso funciona
 * porque sao objetos com silhueta, vistos de frente por uma camera que nunca gira — um pinheiro
 * nao tem "lado". Uma parede de masmorra tem: ela e um bloco macico, e o corredor que ela forma so
 * le como corredor se a espessura aparecer. Com quad, uma sala de dungeon vira um desenho de sala;
 * com cubo, vira uma sala. A montanha entrou aqui pela mesma frase: um penhasco desenhado como
 * carta em pe e o adesivo de uma montanha — o mapa fica com paredes de papel, e o topo, que e a
 * metade dela que a camera de cima realmente ve, nao existe.
 *
 * ── Faces escondidas nao entram ─────────────────────────────────────────────────────────────
 * Um cubo cheio custaria 20 vertices por tile, e a dungeon 9 tem ~8 mil tiles de parede: 160 mil
 * vertices para uma masmorra em que a esmagadora maioria dos blocos esta cercada de blocos e nao
 * mostra lado nenhum. Entao cada face lateral so e emitida quando o vizinho daquele lado NAO e
 * parede — a mesma poda que qualquer engine de voxel faz, e aqui ela derruba a conta para perto
 * do que o quad ja custava. Medido na montanha do overworld: 6.147 tiles dao 9.321 faces, ou seja
 * 1,52x os triangulos que os quads em pe custavam — e em troca a malha ficou opaca (o quad em pe
 * era alphaTest, que descarta fragmento e estraga o early-Z).
 *
 * A face NORTE nunca e emitida: a camera esta em (0, camHeight, camBack) olhando o alvo e o mundo
 * nao tem yaw, entao o lado -z de um bloco e sempre o lado de tras. Emiti-la seria pagar geometria
 * para nunca ser vista.
 *
 * ── Uma malha nova, o MESMO material ────────────────────────────────────────────────────────
 * A dungeon reaproveita `mats.solid` tal e qual, e a montanha usa `mats.rock`, que existe desde o
 * primeiro bake e nunca e recriado (terrainMats): material novo em runtime recompilaria todo shader
 * do mundo (a lei do projeto). O que muda a cada bake e so a geometria — e geometria pode nascer e
 * morrer a vontade.
 *
 * ── O VOLUME e PINTADO, nao iluminado ───────────────────────────────────────────────────────
 * `mats.solid`/`mats.rock` levam `normalUp`: toda face e acesa como se olhasse para cima. Isso e a
 * lei de iluminacao deste jogo (uma tocha atras de um plano nunca pode apagar o plano), mas a conta
 * de um cubo: com a mesma luz nas seis faces, teto e frente saem no MESMO tom e o cubo volta a ler
 * como adesivo. Entao a diferenca entre as faces vem em cor de VERTICE (`shade`), com a luz do alto
 * a esquerda que o resto do jogo usa: teto cheio, oeste quase cheio, sul um degrau abaixo, leste no
 * escuro — e um degrade para o PE de cada face lateral, que e a sombra propria do bloco.
 *
 * A dungeon nao leva `shade` de proposito: o teto dela e preto puro (ver mats.wallTop — foram tres
 * tentativas de sombrear aquele teto e todas competiram com o chao), e sombrear as laterais de uma
 * massa que ja e quase preta nao acrescenta leitura nenhuma.
 */
/** Os frames que viram cubo. Set porque a consulta roda por tile no bake. */
export const DUNGEON_WALL_SET: ReadonlySet<number> = new Set(DUNGEON_WALL_FRAMES);
export const CLIFF_WALL_SET: ReadonlySet<number> = new Set(CLIFF_WALL_FRAMES);
/** Este frame e MASSA (vira cubo)? Uma pergunta so — a sombra e o bake leem dela. */
// A mesma lista que a precondicao da tocha de parede consulta (ver `wallTorchFaceIsClear`): duas
// respostas para "este tile e um bloco macico?" ja seriam uma a mais.
export const isMassFrame = (frame: number): boolean => MASS_TILE_FRAMES.has(frame);

/** Quanto cada face de um cubo vale de luz, e quanto o PE de uma face lateral escurece. */
type CubeShade = {
  top: number; south: number; west: number; east: number; foot: number;
};

/**
 * A MONTANHA iluminada do alto-a-esquerda. Numeros modestos de proposito: a arte de pedra ja e
 * escura (37% dela e a argamassa em #3b3b3b) e a noite deste jogo escurece por cima disto — o
 * bastante para as quinas se separarem, nunca o bastante para a face leste virar um buraco.
 */
export const ROCK_CUBE_SHADE: CubeShade = {
  top: 1, south: 0.84, west: 0.95, east: 0.72, foot: 0.78,
};

export const buildTileCubeGeometry = (
  tiles: ReadonlyArray<{ x: number; z: number; frame: number }>,
  isWall: (x: number, z: number) => boolean,
  shade?: CubeShade,
): THREE.BufferGeometry => {
  const pos: number[] = [];
  const uv: number[] = [];
  const bounds: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const topIdx: number[] = [];
  const sideIdx: number[] = [];
  const face = (
    f: ReturnType<typeof tilesetFrameUv>,
    a: readonly [number, number, number], b: readonly [number, number, number],
    c: readonly [number, number, number], d: readonly [number, number, number],
    n: readonly [number, number, number],
    into: number[],
    /** Luz na dupla de cima e na dupla de baixo da face — o degrade que assenta o bloco no chao. */
    lit?: readonly [number, number],
  ): void => {
    const base = pos.length / 3;
    pos.push(...a, ...b, ...c, ...d);
    // a=cima-esq, b=cima-dir, c=baixo-dir, d=baixo-esq — a mesma ordem do quad em pe, para a
    // arte cair de pe em toda face e o `aUvBounds` continuar sendo a janela certa do texel-AA.
    uv.push(f.u0, f.v1, f.u1, f.v1, f.u1, f.v0, f.u0, f.v0);
    for (let k = 0; k < 4; k++) bounds.push(f.cu0, f.cv0, f.cu1, f.cv1);
    for (let k = 0; k < 4; k++) nrm.push(...n);
    if (lit) {
      for (const s of [lit[0], lit[0], lit[1], lit[1]]) col.push(s, s, s);
    }
    into.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };
  for (const { x, z, frame } of tiles) {
    const f = tilesetFrameUv(frame);
    const [x0, x1] = [x - 0.5, x + 0.5];
    const [z0, z1] = [z - 0.5, z + 0.5];
    const side = (s: number): readonly [number, number] | undefined =>
      (shade ? [s, s * shade.foot] : undefined);
    // O TETO, sempre — sem ele o bloco fica oco por cima (a face de tras e descartada pelo
    // backface culling, entao o buraco mostraria o nada). Na dungeon ele vai para o GRUPO PRETO:
    // uma parede vista de cima nao e uma parede, e desenhar o tijolo ali punha um campo de
    // alvenaria do tamanho da dungeon competindo com o chao pela atencao. Na MONTANHA e o
    // contrario — o teto e o planalto, a face que a camera de cima mais ve, e a rocha ali e o que
    // faz a massa ler como terreno e nao como muro.
    face(
      f, [x0, 1, z0], [x1, 1, z0], [x1, 1, z1], [x0, 1, z1], [0, 1, 0],
      shade ? sideIdx : topIdx, shade ? [shade.top, shade.top] : undefined,
    );
    // A face SUL: a frente do bloco, e a unica lateral que a camera enxerga de cheio.
    if (!isWall(x, z + 1)) {
      face(f, [x0, 1, z1], [x1, 1, z1], [x1, 0, z1], [x0, 0, z1], [0, 0, 1], sideIdx,
        side(shade?.south ?? 1));
    }
    if (!isWall(x - 1, z)) {
      face(f, [x0, 1, z0], [x0, 1, z1], [x0, 0, z1], [x0, 0, z0], [-1, 0, 0], sideIdx,
        side(shade?.west ?? 1));
    }
    if (!isWall(x + 1, z)) {
      face(f, [x1, 1, z1], [x1, 1, z0], [x1, 0, z0], [x1, 0, z1], [1, 0, 0], sideIdx,
        side(shade?.east ?? 1));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aUvBounds', new THREE.Float32BufferAttribute(bounds, 4));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setIndex([...topIdx, ...sideIdx]);
  if (shade) {
    // Um material so, um grupo so: o teto entrou na mesma lista das laterais.
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return geo;
  }
  // Dois grupos, dois materiais, UMA malha: o teto preto e os lados texturizados. Continua sendo
  // uma geometria so — o custo de um material a mais aqui e um bind, nao um draw call por bloco.
  geo.addGroup(0, topIdx.length, 0);
  geo.addGroup(topIdx.length, sideIdx.length, 1);
  return geo;
};

/**
 * A SOMBRA DE UMA MASSA — a lei: **um bloco de alvenaria não é um monte de tiles, e a sombra dele
 * não pode ser um monte de sombras.**
 *
 * O campo instanciado da lua (`fillMoonCastField`) desenha, por tile em pé, uma cópia esticada da
 * arte daquele tile. Para uma ÁRVORE isso é a coisa certa e é o que ele existe para fazer: a
 * silhueta é o desenho da copa, e uma árvore é um objeto solto. Para um MURO é o defeito que o
 * autor viu na dungeon — cada tile de parede largando o seu losango, e o olho contando os tiles do
 * muro pelo chão. Três coisas o produziam ao mesmo tempo, e nenhuma se conserta sozinha:
 *
 *   · **A regra do "só quem está exposto"** (≤ 4 vizinhos sólidos) existe para a mata fechada não
 *     virar um bloco escuro. Numa massa de alvenaria ela faz o contrário do que promete: a fileira
 *     de fora de um maciço tem 5 vizinhos e NÃO projeta, enquanto a quina convexa ao lado projeta —
 *     então o que aparece no chão é um punhado de manchas soltas em vez de uma barra.
 *   · **A largura era 0,92 tile** (`WIDTH_FACTOR`, para a silhueta de uma árvore ser um sopro mais
 *     magra que ela). Entre dois tiles vizinhos isso era uma fresta de luz.
 *   · **A luz é DIRECIONAL e diagonal.** Duas cópias esticadas de tiles vizinhos não ladrilham: na
 *     perpendicular do rumo elas distam 0,55 tile e têm 1 de largura, então ou sobram frestas ou
 *     sobrepõem — e sobrepor DOBRA o escuro (a lei do campo: N camadas pretas dão 1-(1-a)^N).
 *
 * Por isso a sombra de uma massa não sai de quad por tile: ela é **assada como UMA malha sem
 * sobreposição nenhuma**. O desenho é literalmente o que a física manda — a pegada da massa varrida
 * ao longo do rumo da luz (a soma de Minkowski da pegada com o segmento de luz) —, e a UNIÃO é
 * calculada de verdade, num raster de sub-tiles, em vez de ser aproximada empilhando transparências.
 * Sem sobreposição, o escuro é o mesmo em toda a barra: é isso que faz ela ler como UMA sombra.
 *
 * Ela é assada uma vez (a lua não anda) e sai num draw call. O passo do raster é 1/8 de tile — dois
 * texels da arte —, então a borda é uma escadinha de dois pixels, que é o vocabulário desta casa
 * (as sombras são "jagged, and that is fine") e não a curva lisa de um shadow map, que este jogo
 * não tem por decisão.
 */
const MASS_SHADOW_SUB = 8;
/** Quanto do quadro o bake do rumo do sol pode gastar. */
export const MASS_BAKE_MS_PER_FRAME = 2;
/** A folga do campo de alturas em volta do que projeta: a sombra mais longa, com qualquer knob razoável. */
const MASS_SHADOW_PAD = 8;
/** Acima do chão e da mancha de contato, abaixo da silhueta de fogo (que é `FOOT_Y` = 0.015). */
const MASS_SHADOW_Y = 0.012;

/**
 * A SERRA COM A CURVA DA MARGEM — a mesma receita da margem orgânica (`buildShoreGeometry`), agora
 * na pedra. O dado continua por tile (quem anda e quem colide não sabe disto); o que muda é o que se
 * vê. Para cada nível, o contorno é um campo de distância lido por pixel de arte:
 *
 *   · a UNIÃO SUAVE das distâncias até os tiles daquele nível arredonda a quina côncava;
 *   · a quina convexa de verdade (nenhum vizinho nos dois lados nem na diagonal) é um canto de raio
 *     RELIEF_CORNER, que MORDE o próprio tile: só o canto, nunca o centro, onde o herói pisa;
 *   · a largura do beiço anda no mesmo ruído da margem, então a beira ondula e é igual em todo boot.
 *
 * A escada e a água têm chão próprio e ficam de fora: o contorno para na beira delas.
 */
const RELIEF_CELLS = 16; // um pixel de arte, como a margem: com dois, a curva volta a ser escada
const RELIEF_CELLS_FAR = 8; // fora do mundo ninguém chega perto: dois pixels, e um quarto das faces
const RELIEF_LIP_MIN = 0.06;
const RELIEF_LIP_VAR = 0.3;
const RELIEF_ROUND = 0.5;
const RELIEF_CORNER = 0.38;
const SHORT_STEP_RUN = 0.32;
const VINE_MIN_RUN = 0.35;
/** O muro: negativo morde o próprio tile, positivo avança sobre o vizinho. */
const ROCK_LIP_MIN = -0.24;
const ROCK_LIP_VAR = 0.56;
/** O topo do muro mistura pedras grandes e pequenas: uma pintura só repetida lia como piso de pátio. */
const ROCK_TOP_FRAMES: readonly number[] = [39, 40, 57, 58, 59, 60];

export type ReliefPoint = (px: number, pz: number) => number;

export const makeReliefField = (
  levelAt: (x: number, z: number) => number,
  blocked: (x: number, z: number) => boolean,
): ReliefPoint => {
  // A VIZINHANÇA 5×5 DO TILE, lida uma vez por tile: o campo é pedido pixel a pixel (16×16 por tile), cada pixel lia
  // nível e bloqueio dos mesmos tiles umas 45 vezes, e os pixels de um tile chegam juntos. A conta abaixo é a de
  // sempre (a distância até cada tile, a quina convexa, a união suave), na mesma ordem: só a leitura mudou de lugar.
  const lvl = new Float64Array(25);
  const blk = new Uint8Array(25);
  let cTx = Number.NaN;
  let cTz = Number.NaN;
  const load = (tx: number, tz: number): void => {
    for (let dz = -2; dz <= 2; dz++) {
      for (let dx = -2; dx <= 2; dx++) {
        const i = (dz + 2) * 5 + (dx + 2);
        lvl[i] = levelAt(tx + dx, tz + dz);
        blk[i] = blocked(tx + dx, tz + dz) ? 1 : 0;
      }
    }
    cTx = tx;
    cTz = tz;
  };
  /** O tile (dx, dz) da vizinhança está abaixo deste nível e não é escada nem água. */
  const openAt = (dx: number, dz: number, level: number): boolean => {
    const i = (dz + 2) * 5 + (dx + 2);
    return lvl[i] < level && blk[i] === 0;
  };
  const inner = 0.5 - RELIEF_CORNER;
  return (px, pz) => {
    const tx = Math.round(px);
    const tz = Math.round(pz);
    if (tx !== cTx || tz !== cTz) load(tx, tz);
    if (blk[12] === 1) return lvl[12];
    let top = 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) top = Math.max(top, lvl[(dz + 2) * 5 + (dx + 2)]);
    }
    for (let level = top; level >= 1; level--) {
      let d = Infinity;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (lvl[(dz + 2) * 5 + (dx + 2)] < level) continue;
          // A distância do pixel até o tile (tx+dx, tz+dz): a quina convexa morde em arco, o resto é a caixa.
          const x = tx + dx;
          const z = tz + dz;
          const sx = px >= x ? 1 : -1;
          const sz = pz >= z ? 1 : -1;
          const qx = Math.abs(px - x);
          const qz = Math.abs(pz - z);
          const di = qx > inner && qz > inner && openAt(dx + sx, dz, level) && openAt(dx, dz + sz, level) && openAt(dx + sx, dz + sz, level)
            ? Math.max(0, Math.hypot(qx - inner, qz - inner) - RELIEF_CORNER)
            : Math.hypot(Math.max(qx - 0.5, 0), Math.max(qz - 0.5, 0));
          d = d === Infinity ? di : smoothMin(d, di, RELIEF_ROUND);
        }
      }
      // O nível de cima fica um fio para dentro: entre os dois sobra uma saliência, não uma parede só.
      const lip = (RELIEF_LIP_MIN + RELIEF_LIP_VAR * shoreNoise(px * 1.3 + level * 17, pz * 1.3 + level * 5)) * (level > 1 ? 0.6 : 1);
      if (d < lip) return level;
    }
    return 0;
  };
};

/**
 * O MURO DE PEDRA COM FORMA DE ROCHA. O dado continua por tile; o que muda é o desenho, pelo mesmo contorno da
 * serra. A diferença é o sinal: a serra só cresce para fora, e aqui o ruído também morde para dentro do tile, senão
 * o muro seria uma caixa de borda ondulada. No miolo de um maciço, parte dos tiles sobe mais um nível.
 */
export const shapeRock = (
  tiles: ReadonlyArray<{ x: number; z: number; frame: number }>,
  blocked: (x: number, z: number) => boolean,
) => {
  const keys = new Set(tiles.map((t) => tileKey(t.x, t.z)));
  const isRock = (x: number, z: number): boolean => keys.has(tileKey(x, z));
  const levels = new Map<number, number>();
  const frameOf = new Map<number, number>();
  for (const { x, z } of tiles) {
    const frame = ROCK_TOP_FRAMES[terrainVariant(x, z, ROCK_TOP_FRAMES.length)];
    const inner = isRock(x + 1, z) && isRock(x - 1, z) && isRock(x, z + 1) && isRock(x, z - 1);
    levels.set(tileKey(x, z), inner && shoreNoise(x * 0.7 + 3, z * 0.7 + 8) > 0.45 ? 2 : 1);
    frameOf.set(tileKey(x, z), frame);
  }
  const levelAt = (x: number, z: number): number => levels.get(tileKey(x, z)) ?? 0;
  const open = (x: number, z: number, level: number): boolean => levelAt(x, z) < level && !blocked(x, z);
  const field: ReliefPoint = (px, pz) => {
    const tx = Math.round(px);
    const tz = Math.round(pz);
    if (blocked(tx, tz)) return levelAt(tx, tz);
    let top = 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) top = Math.max(top, levelAt(tx + dx, tz + dz));
    }
    for (let level = top; level >= 1; level--) {
      const reach = ROCK_LIP_MIN - (level > 1 ? 0.14 : 0) + ROCK_LIP_VAR * shoreNoise(px * 1.25 + level * 17, pz * 1.25 + level * 5);
      let edge: number;
      if (levelAt(tx, tz) >= level) {
        const fx = px - tx;
        const fz = pz - tz;
        edge = -Infinity;
        if (open(tx + 1, tz, level)) edge = Math.max(edge, fx - 0.5);
        if (open(tx - 1, tz, level)) edge = Math.max(edge, -fx - 0.5);
        if (open(tx, tz + 1, level)) edge = Math.max(edge, fz - 0.5);
        if (open(tx, tz - 1, level)) edge = Math.max(edge, -fz - 0.5);
        const sx = fx >= 0 ? 1 : -1;
        const sz = fz >= 0 ? 1 : -1;
        const inner = 0.5 - RELIEF_CORNER;
        if (Math.abs(fx) > inner && Math.abs(fz) > inner && open(tx + sx, tz, level) && open(tx, tz + sz, level) && open(tx + sx, tz + sz, level)) {
          edge = Math.max(edge, Math.hypot(Math.abs(fx) - inner, Math.abs(fz) - inner) - RELIEF_CORNER);
        }
      } else {
        edge = Infinity;
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (levelAt(tx + dx, tz + dz) < level) continue;
            const di = Math.hypot(Math.max(Math.abs(px - tx - dx) - 0.5, 0), Math.max(Math.abs(pz - tz - dz) - 0.5, 0));
            edge = edge === Infinity ? di : smoothMin(edge, di, RELIEF_ROUND);
          }
        }
      }
      if (edge < reach) return level;
    }
    return 0;
  };
  const near = new Map<number, { x: number; z: number; frame: number; level: number; far: boolean }>();
  for (const { x, z } of tiles) {
    const frame = frameOf.get(tileKey(x, z)) ?? ROCK_TOP_FRAMES[0];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const k = tileKey(x + dx, z + dz);
        if (!near.has(k)) near.set(k, { x: x + dx, z: z + dz, frame, level: levelAt(x + dx, z + dz), far: false });
      }
    }
  }
  return {
    near: [...near.values()],
    frameOf,
    field,
    levelAt,
    blocked,
    isNear: (x: number, z: number): boolean => near.has(tileKey(x, z)),
  };
};

/** O desenho do contorno: o gramado do topo, a pedra que desce por ele e as trepadeiras sobre a pedra. */
export const buildReliefContourGeometry = (
  tiles: ReadonlyArray<{ x: number; z: number; frame: number; level: number; far: boolean }>,
  /** A arte de todos os tiles da serra: o beiço de um pedaço pode vestir o tile do pedaço vizinho. */
  frameOf: ReadonlyMap<number, number>,
  field: ReliefPoint,
  levelAt: (x: number, z: number) => number,
  stairs: ReadonlySet<number>,
  blocked: (x: number, z: number) => boolean,
  /**
   * A cor do chão no ponto (bioma × sombra de canto, `groundShadeAt`: a mesma do chão inteiro). Sem ela o beiço
   * saía branco e o miolo tingido, e onde o beiço encosta no chão comum a cor saltava numa linha reta.
   */
  tintAt?: (x: number, z: number) => readonly [number, number, number],
): {
  tops: THREE.BufferGeometry; walls: THREE.BufferGeometry; vines: VineQuad[];
  whole: Array<{ x: number; z: number; frame: number }>; bases: Array<{ x: number; z: number; frame: number }>;
} => {
  const whole: Array<{ x: number; z: number; frame: number }> = [];
  const bases: Array<{ x: number; z: number; frame: number }> = [];
  const vines: VineQuad[] = [];
  const tp: number[] = [];
  const tuv: number[] = [];
  const tb: number[] = [];
  const tn: number[] = [];
  const tc: number[] = [];
  const ti: number[] = [];
  const wp: number[] = [];
  const wuv: number[] = [];
  const wb: number[] = [];
  const wn: number[] = [];
  const wc: number[] = [];
  const wi: number[] = [];
  const shade = ROCK_CUBE_SHADE;
  const lip = 0.012; // a trepadeira, um fio à frente da pedra

  for (const { x: tx, z: tz, frame, level, far } of tiles) {
    const uniform = (() => {
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (levelAt(tx + dx, tz + dz) !== level || blocked(tx + dx, tz + dz)) return false;
        }
      }
      return true;
    })();
    if (uniform) { whole.push({ x: tx, z: tz, frame }); continue; }
    const N = far ? RELIEF_CELLS_FAR : RELIEF_CELLS;
    const step = 1 / N;
    const x0 = tx - 0.5;
    const z0 = tz - 0.5;
    const cells = new Int8Array((N + 2) * (N + 2));
    for (let j = -1; j <= N; j++) {
      for (let i = -1; i <= N; i++) cells[(j + 1) * (N + 2) + i + 1] = field(x0 + (i + 0.5) * step, z0 + (j + 0.5) * step);
    }
    const at = (i: number, j: number): number => cells[(j + 1) * (N + 2) + i + 1];
    // O beiço veste a arte do tile mais perto daquele nível.
    const artFor = (c: number): number => {
      if (level >= c) return frame;
      let best = frame;
      let dist = Infinity;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (levelAt(tx + dx, tz + dz) < c) continue;
          const f = frameOf.get(tileKey(tx + dx, tz + dz));
          const d = dx * dx + dz * dz;
          if (f !== undefined && d < dist) { dist = d; best = f; }
        }
      }
      return best;
    };

    // O TOPO: corridas de células do mesmo nível, esticadas para baixo enquanto a linha seguinte for
    // igual. O miolo do tile é quase todo uma peça só, e é aqui que mora a maior parte da economia.
    let opensToGround = false;
    const used = new Uint8Array(N * N);
    for (let j = 0; j < N; j++) {
      let i = 0;
      while (i < N) {
        const c = at(i, j);
        if (c <= 0) { if (level > 0) opensToGround = true; i++; continue; }
        if (used[j * N + i]) { i++; continue; }
        let e = i;
        while (e + 1 < N && at(e + 1, j) === c && !used[j * N + e + 1]) e++;
        let rows = 1;
        grow: while (j + rows < N) {
          for (let r = i; r <= e; r++) {
            if (at(r, j + rows) !== c || used[(j + rows) * N + r]) break grow;
          }
          rows++;
        }
        for (let m = 0; m < rows; m++) used.fill(1, (j + m) * N + i, (j + m) * N + e + 1);
        const f = tilesetFrameUv(artFor(c));
        const ax = x0 + i * step;
        const bx = x0 + (e + 1) * step;
        const az = z0 + j * step;
        const bz = az + rows * step;
        const u = (px: number): number => f.u0 + (px - x0) * (f.u1 - f.u0);
        const v = (pz: number): number => f.v1 - (pz - z0) * (f.v1 - f.v0);
        const y = c * RELIEF_HEIGHT;
        const b = tp.length / 3;
        tp.push(ax, y, az, bx, y, az, bx, y, bz, ax, y, bz);
        tuv.push(u(ax), v(az), u(bx), v(az), u(bx), v(bz), u(ax), v(bz));
        for (const [cx, cz] of [[ax, az], [bx, az], [bx, bz], [ax, bz]]) {
          tb.push(f.cu0, f.cv0, f.cu1, f.cv1);
          tn.push(0, 1, 0);
          const t = tintAt ? tintAt(cx, cz) : [1, 1, 1];
          tc.push(t[0], t[1], t[2]);
        }
        ti.push(b, b + 3, b + 2, b, b + 2, b + 1);
        i = e + 1;
      }
    }
    if (opensToGround) bases.push({ x: tx, z: tz, frame });

    // A PEDRA, por camada: `a`/`b` são o começo e o fim da corrida no chão, e s0/s1 onde ela cai na arte.
    const face = (
      ax: number, az: number, bx: number, bz: number, s0: number, s1: number,
      high: number, low: number, nx: number, nz: number, lit: number,
    ): void => {
      for (let y = low; y < high; y++) {
        const f = tilesetFrameUv(CLIFF_WALL_FRAMES[terrainVariant(tx, tz + y * 7, CLIFF_WALL_FRAMES.length)]);
        const base = wp.length / 3;
        const y0 = y * RELIEF_HEIGHT;
        const y1 = (y + 1) * RELIEF_HEIGHT;
        wp.push(ax, y1, az, bx, y1, bz, bx, y0, bz, ax, y0, az);
        const u0 = f.u0 + s0 * (f.u1 - f.u0);
        const u1 = f.u0 + s1 * (f.u1 - f.u0);
        wuv.push(u0, f.v1, u1, f.v1, u1, f.v0, u0, f.v0);
        for (let k = 0; k < 4; k++) {
          wb.push(f.cu0, f.cv0, f.cu1, f.cv1);
          wn.push(nx, 0, nz);
          const s = k < 2 ? lit : lit * shade.foot;
          wc.push(s, s, s);
        }
        wi.push(base, base + 2, base + 1, base, base + 3, base + 2);
      }
      // A trepadeira é por tile e por lado: um trecho inteiro de mato, não uns fiapos soltos. Só na face sul e em
      // trecho comprido: de lado ou num degrau da curva ela sobrava como pontas verdes soltas.
      if (nz === 0 || Math.hypot(bx - ax, bz - az) < VINE_MIN_RUN) return;
      const salt = nz !== 0 ? 0 : nx < 0 ? 1 : 2;
      const roll = Math.abs(Math.imul(tx * 73 + salt * 19 + 5, tz * 137 + 11)) % 100;
      if (roll >= VINE_CHANCE) return;
      vines.push({
        x0: ax + nx * lip, z0: az + nz * lip, x1: bx + nx * lip, z1: bz + nz * lip,
        top: high * RELIEF_HEIGHT, drop: (high - low) * RELIEF_HEIGHT,
        variant: roll % VINE_VARIANTS, nx, nz, u0: s0, u1: s1,
      });
    };
    const across = (i: number, j: number): boolean => {
      const ax = Math.round(x0 + (i + 0.5) * step);
      const az = Math.round(z0 + (j + 0.5) * step);
      return stairs.has(tileKey(ax, az));
    };
    // A face SUL de cada corrida...
    for (let j = 0; j < N; j++) {
      let i = 0;
      while (i < N) {
        const c = at(i, j);
        const n = at(i, j + 1);
        if (c <= n || across(i, j + 1)) { i++; continue; }
        let e = i;
        while (e + 1 < N && at(e + 1, j) === c && at(e + 1, j + 1) === n && !across(e + 1, j + 1)) e++;
        const z = z0 + (j + 1) * step;
        face(x0 + i * step, z, x0 + (e + 1) * step, z, i * step, (e + 1) * step, c, n, 0, 1, shade.south);
        i = e + 1;
      }
    }
    // ...e as faces LESTE e OESTE, por coluna.
    for (const side of [1, -1]) {
      for (let i = 0; i < N; i++) {
        let j = 0;
        while (j < N) {
          const c = at(i, j);
          const n = at(i + side, j);
          if (c <= n || across(i + side, j)) { j++; continue; }
          let e = j;
          while (e + 1 < N && at(i, e + 1) === c && at(i + side, e + 1) === n && !across(i + side, e + 1)) e++;
          const x = x0 + (side > 0 ? i + 1 : i) * step;
          const a = z0 + j * step;
          const b = z0 + (e + 1) * step;
          // O DEGRAU CURTO DA CURVA NÃO É OUTRA FACE. Com arte e luz próprias, cada um lia como uma ripa, e a parede
          // curva como uma cerca. Ele repete a coluna de arte onde está e a luz da face sul: a parede fica contínua.
          if ((e + 1 - j) * step <= SHORT_STEP_RUN) {
            const s = (i + 0.5) * step;
            if (side > 0) face(x, b, x, a, s, s, c, n, 1, 0, shade.south);
            else face(x, a, x, b, s, s, c, n, -1, 0, shade.south);
          } else if (side > 0) face(x, b, x, a, (e + 1) * step, j * step, c, n, 1, 0, shade.east);
          else face(x, a, x, b, j * step, (e + 1) * step, c, n, -1, 0, shade.west);
          j = e + 1;
        }
      }
    }
  }

  const tops = new THREE.BufferGeometry();
  tops.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
  tops.setAttribute('uv', new THREE.Float32BufferAttribute(tuv, 2));
  tops.setAttribute('aUvBounds', new THREE.Float32BufferAttribute(tb, 4));
  tops.setAttribute('normal', new THREE.Float32BufferAttribute(tn, 3));
  tops.setAttribute('color', new THREE.Float32BufferAttribute(tc, 3));
  tops.setIndex(ti);
  const walls = new THREE.BufferGeometry();
  walls.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
  walls.setAttribute('uv', new THREE.Float32BufferAttribute(wuv, 2));
  walls.setAttribute('aUvBounds', new THREE.Float32BufferAttribute(wb, 4));
  walls.setAttribute('normal', new THREE.Float32BufferAttribute(wn, 3));
  walls.setAttribute('color', new THREE.Float32BufferAttribute(wc, 3));
  walls.setIndex(wi);
  return { tops, walls, vines, whole, bases };
};

/**
 * O RELEVO É QUE DITA A SOMBRA: um campo de alturas por sub-célula, o mesmo contorno que o desenho usa.
 * Para cada altura que recebe sombra há uma varredura própria, e cada beira projeta `length` por nível
 * de DIFERENÇA. A célula só escurece onde o chão está exatamente naquela altura, de modo que a sombra
 * some dentro de um bloco porque ele a tapa, e volta do outro lado se ainda alcançar.
 */
export type MassHeightGrid = { heights: Int8Array; minX: number; minZ: number; w: number; h: number; top: number };

export const buildMassHeightGrid = (
  tiles: ReadonlyArray<{ x: number; z: number }>,
  cubeHeight: (x: number, z: number) => number,
  levelAt: (x: number, z: number) => number,
  field: ReliefPoint | undefined,
  isFloorless: (x: number, z: number) => boolean,
  /** O muro curvo: a sombra dele segue o mesmo contorno do desenho. */
  rock?: { isNear: (x: number, z: number) => boolean; field: ReliefPoint } | null,
): MassHeightGrid | null => {
  if (tiles.length === 0) return null;
  const S = MASS_SHADOW_SUB;
  let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity;
  for (const t of tiles) {
    if (t.x < minX) minX = t.x;
    if (t.x > maxX) maxX = t.x;
    if (t.z < minZ) minZ = t.z;
    if (t.z > maxZ) maxZ = t.z;
  }
  minX -= MASS_SHADOW_PAD; maxX += MASS_SHADOW_PAD; minZ -= MASS_SHADOW_PAD; maxZ += MASS_SHADOW_PAD;
  const w = (maxX - minX + 1) * S;
  const h = (maxZ - minZ + 1) * S;
  const heights = new Int8Array(w * h);
  let top = 0;
  for (let tz = minZ; tz <= maxZ; tz++) {
    for (let tx = minX; tx <= maxX; tx++) {
      const cube = cubeHeight(tx, tz);
      let near = false;
      for (let dz = -1; dz <= 1 && !near; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (levelAt(tx + dx, tz + dz) > 0) { near = true; break; }
        }
      }
      const floorless = isFloorless(tx, tz);
      const curved = rock?.isNear(tx, tz) ?? false;
      const bx = (tx - minX) * S;
      const bz = (tz - minZ) * S;
      for (let j = 0; j < S; j++) {
        const row = (bz + j) * w + bx;
        for (let i = 0; i < S; i++) {
          let v = cube;
          if (floorless) v = -1;
          else if (curved) v = rock!.field(tx - 0.5 + (i + 0.5) / S, tz - 0.5 + (j + 0.5) / S);
          else if (near && field && cube === 0) v = field(tx - 0.5 + (i + 0.5) / S, tz - 0.5 + (j + 0.5) / S);
          heights[row + i] = v;
          if (v > top) top = v;
        }
      }
    }
  }
  return { heights, minX, minZ, w, h, top };
};

export const bakeMassShadow = function* (
  grid: MassHeightGrid | null,
  stairs: ReadonlyArray<{ x: number; z: number; ux: number; uz: number; base: number }>,
  dirX: number,
  dirZ: number,
  length: number,
): Generator<void, THREE.BufferGeometry | null, void> {
  if (!grid || length <= 0.01) return null;
  const S = MASS_SHADOW_SUB;
  const { heights, minX, minZ, w, h, top } = grid;
  const cell = 1 / S;
  const pos: number[] = [];
  const idx: number[] = [];
  const pushQuad = (x0: number, x1: number, z0: number, z1: number, y: number): void => {
    const b = pos.length / 3;
    pos.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
    idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  };
  // O MIOLO NÃO VARRE: se os vizinhos no rumo da sombra são tão altos quanto a célula, a sombra dela
  // cai inteira dentro da deles. Sobra a beira, que é um fio do mundo.
  const sx = Math.sign(dirX);
  const sz = Math.sign(dirZ);
  const edges: number[] = [];
  for (let gz = 1; gz < h - 1; gz++) {
    if (gz % 48 === 0) yield;
    for (let gx = 1; gx < w - 1; gx++) {
      const v = heights[gz * w + gx];
      if (v <= 0) continue;
      if ((sx !== 0 && heights[gz * w + gx + sx] < v) || (sz !== 0 && heights[(gz + sz) * w + gx] < v)
        || (sx !== 0 && sz !== 0 && heights[(gz + sz) * w + gx + sx] < v)) edges.push(gx, gz);
    }
  }
  const out = new Uint8Array(w * h);
  // Marca só o que cai no chão desta altura: o resto é pedra por cima, ou chão de outro nível.
  const sweep = (gx0: number, gz0: number, size: number, rise: number, receiver: number, sizeZ = size): void => {
    const reach = rise * length * S;
    const steps = Math.ceil(reach * 2);
    for (let s = 0; s <= steps; s++) {
      const d = (s / steps) * reach;
      const ox = Math.round(gx0 + dirX * d);
      const oz = Math.round(gz0 + dirZ * d);
      for (let j = 0; j < sizeZ; j++) {
        const gz = oz + j;
        if (gz < 0 || gz >= h) continue;
        for (let i = 0; i < size; i++) {
          const gx = ox + i;
          if (gx >= 0 && gx < w && heights[gz * w + gx] === receiver) out[gz * w + gx] = 1;
        }
      }
    }
  };
  for (let receiver = 0; receiver < top; receiver++) {
    out.fill(0);
    for (let e = 0; e < edges.length; e += 2) {
      if (e % 512 === 0) yield;
      const rise = heights[edges[e + 1] * w + edges[e]] - receiver;
      if (rise > 0) sweep(edges[e], edges[e + 1], 1, rise, receiver);
    }
    // A escada projeta da altura do meio dela: senão a parede teria um vão bem atrás dos degraus.
    // A ESCADA PROJETA DEGRAU POR DEGRAU, cada fatia da altura dela: um bloco inteiro na altura do meio saía como
    // um retângulo duro, maior que os degraus de baixo e mais curto que os de cima (pedido do autor: nada de
    // risco reto na sombra do chão). Sem ela a parede teria um vão bem atrás dos degraus.
    for (const t of stairs) {
      if (t.base !== receiver) continue;
      const slice = S / STAIR_STEPS;
      for (let k = 0; k < STAIR_STEPS; k++) {
        // a fatia `k` (0 embaixo) ocupa, no rumo da subida, [k, k+1] de STAIR_STEPS
        const along = t.ux + t.uz > 0 ? k : STAIR_STEPS - 1 - k;
        const gx0 = (t.x - minX) * S + (t.ux !== 0 ? along * slice : 0);
        const gz0 = (t.z - minZ) * S + (t.uz !== 0 ? along * slice : 0);
        sweep(gx0, gz0, t.ux !== 0 ? slice : S, (k + 1) / STAIR_STEPS, receiver, t.uz !== 0 ? slice : S);
      }
    }
    // GREEDY MESH: corridas horizontais esticadas para baixo enquanto a linha seguinte for igual.
    for (let gz = 0; gz < h; gz++) {
      if (gz % 48 === 0) yield;
      let gx = 0;
      while (gx < w) {
        if (out[gz * w + gx] !== 1) { gx += 1; continue; }
        let runW = 1;
        while (gx + runW < w && out[gz * w + gx + runW] === 1) runW += 1;
        let runH = 1;
        grow: while (gz + runH < h) {
          for (let i = 0; i < runW; i += 1) {
            if (out[(gz + runH) * w + gx + i] !== 1) break grow;
          }
          runH += 1;
        }
        for (let j = 0; j < runH; j += 1) out.fill(2, (gz + j) * w + gx, (gz + j) * w + gx + runW);
        // Sub-célula → mundo: o tile (x,z) ocupa [x-0.5, x+0.5].
        const x0 = minX - 0.5 + gx * cell;
        const z0 = minZ - 0.5 + gz * cell;
        pushQuad(x0, x0 + runW * cell, z0, z0 + runH * cell, receiver * RELIEF_HEIGHT + MASS_SHADOW_Y);
        gx += runW;
      }
    }
  }
  // OS DEGRAUS têm altura própria: cada sub-célula pergunta se algo corta o raio que sobe dali.
  const reachTiles = length * top;
  for (const { x, z, ux, uz, base } of stairs) {
    yield;
    for (let j = 0; j < S; j += 1) {
      for (let i = 0; i < S; i += 1) {
        const px = x - 0.5 + (i + 0.5) * cell;
        const pz = z - 0.5 + (j + 0.5) * cell;
        const along = (px - x) * ux + (pz - z) * uz + 0.5;
        const tread = base + (Math.min(STAIR_STEPS - 1, Math.floor(along * STAIR_STEPS)) + 1) / STAIR_STEPS;
        let shaded = false;
        for (let t = cell; t <= reachTiles && !shaded; t += cell) {
          const qx = px - dirX * t;
          const qz = pz - dirZ * t;
          if (Math.round(qx) === x && Math.round(qz) === z) continue;
          const gx = Math.floor((qx - minX + 0.5) * S);
          const gz = Math.floor((qz - minZ + 0.5) * S);
          if (gx < 0 || gz < 0 || gx >= w || gz >= h) continue;
          shaded = heights[gz * w + gx] > tread + t / length;
        }
        if (!shaded) continue;
        const x0 = px - cell / 2;
        const z0 = pz - cell / 2;
        pushQuad(x0, x0 + cell, z0, z0 + cell, tread * RELIEF_HEIGHT + MASS_SHADOW_Y);
      }
    }
  }
  if (idx.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return geo;
};


export const buildUprightTileGeometry = (
  tiles: ReadonlyArray<{ x: number; z: number; frame: number }>,
  /** O chão de cada árvore: a mata sobe o morro junto com ele (ver world/relief). */
  liftAt: (x: number, z: number) => number = () => 0,
  /** A cor do bioma no pé da árvore (ver `trees` em terrainMats); sem ela, a arte crua. */
  tintAt?: (x: number, z: number) => readonly [number, number, number],
): THREE.BufferGeometry => {
  const pos: number[] = [];
  const uv: number[] = [];
  const bounds: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const wind: number[] = [];
  const idx: number[] = [];
  tiles.forEach(({ x, z, frame }, i) => {
    const f = tilesetFrameUv(frame);
    // Upright quad on the tile, facing the (fixed-yaw) camera direction (+z). NO CENTRO EXATO do
    // tile, sempre: o mundo é uma grade e a grade é o desenho (ver o chamador em buildTerrain).
    const lift = liftAt(x, z);
    pos.push(x - 0.5, lift + 1, z, x + 0.5, lift + 1, z, x + 0.5, lift, z, x - 0.5, lift, z);
    uv.push(f.u0, f.v1, f.u1, f.v1, f.u1, f.v0, f.u0, f.v0);
    for (let k = 0; k < 4; k++) bounds.push(f.cu0, f.cv0, f.cu1, f.cv1);
    nrm.push(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1);
    // Quem obedece ao VENTO, e o centro do tile de onde a onda é lida (ver WIND_WAVE_GLSL). É
    // por vértice porque é UMA malha: a árvore que balança e o túmulo que não estão nela juntos.
    const sway = WIND_SWAY_FRAMES.has(frame) ? 1 : 0;
    for (let k = 0; k < 4; k++) wind.push(sway, x, z);
    const t = tintAt ? tintAt(x, z) : [1, 1, 1];
    for (let k = 0; k < 4; k++) col.push(t[0], t[1], t[2]);
    const b = i * 4;
    idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aUvBounds', new THREE.Float32BufferAttribute(bounds, 4));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('aWind', new THREE.Float32BufferAttribute(wind, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  return geo;
};

/**
 * A ESCADA DA SERRA: quatro degraus que vencem um nível (RELIEF_HEIGHT) dentro de um tile, no rumo da subida
 * (`ux`, `uz`). Ela era pedra bruta do paredão nos espelhos e nos lados, e lia como uma rampa enfiada na parede
 * (pedido do autor: "melhore drasticamente o visual da escadaria"). Agora é PEDRA LAVRADA:
 *
 *  · o piso de cada degrau é o calçamento, com uma QUINA mais escura na frente — é a quina que faz o olho
 *    contar degraus de cima;
 *  · o espelho é a mesma pedra, em sombra (talhada do bloco, não o paredão);
 *  · dos lados, uma MURETA que sobe com a escada e acaba num PILAR embaixo e em cima. Só pedra: lanternas em
 *    cima dos pilares chegaram a existir e saíram a pedido do autor ("deixa a escada pura de pedra").
 *
 * Escadas lado a lado, no mesmo rumo e no mesmo andar, são UMA escadaria: entre elas não há mureta, e o piso
 * corre inteiro. A arte de cada face é RECORTADA, não esticada, então os pisos juntos desenham o calçamento uma
 * vez só, no grão do resto do mundo.
 */
const STAIR_STEPS = 4;
/** O calçamento liso (as pracinhas de pedra do mundo). */
const STAIR_TREAD_FRAME = 23;
const STAIR_SHADE = { tread: 1.14, nose: 0.62, riser: 0.46, wall: 0.68, cap: 1.16, post: 0.82 };
/** A quina da frente de cada degrau, em fração do fundo do degrau. */
const STAIR_NOSE = 0.22;
/** A mureta: espessura (em tiles), altura acima da linha dos degraus, e o pilar das pontas. */
const STAIR_WALL = 0.14;
const STAIR_PARAPET = 0.3;
const STAIR_POST = { len: 0.17, wide: 0.04, rise: 0.2 };

export const buildStairGeometry = (
  stairs: ReadonlyArray<{ x: number; z: number; ux: number; uz: number; base: number }>,
): THREE.BufferGeometry => {
  const pos: number[] = [];
  const uv: number[] = [];
  const bounds: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  type Corner = readonly [number, number, number, number, number]; // x, y, z, a, b (a,b em 0..1)
  const quad = (frame: number, corners: readonly [Corner, Corner, Corner, Corner], shade: number): void => {
    const f = tilesetFrameUv(frame);
    const base = pos.length / 3;
    for (const [x, y, z, a, b] of corners) {
      pos.push(x, y, z);
      uv.push(f.u0 + Math.min(1, Math.max(0, a)) * (f.u1 - f.u0), f.v0 + Math.min(1, Math.max(0, b)) * (f.v1 - f.v0));
      bounds.push(f.cu0, f.cv0, f.cu1, f.cv1);
      nrm.push(0, 1, 0);
      col.push(shade, shade, shade);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  // As escadas gêmeas: o mesmo rumo, o mesmo andar, encostadas de lado.
  const keyOf = (t: { x: number; z: number; ux: number; uz: number; base: number }): string => `${t.x},${t.z},${t.ux},${t.uz},${t.base}`;
  const all = new Set(stairs.map(keyOf));
  const T = STAIR_TREAD_FRAME;
  for (const st of stairs) {
    const { x, z, ux, uz, base } = st;
    // `s` corre na subida (0 na borda de baixo, 1 na de cima), `t` atravessa a escada. `h` conta a partir
    // do andar de onde a escada sai (`base`): a do cume nasce em cima do planalto.
    const vx = -uz;
    const vz = ux;
    const at = (s0: number, t0: number, h: number, a: number, b: number): Corner => [
      x + (s0 - 0.5) * ux + (t0 - 0.5) * vx, (base + h) * RELIEF_HEIGHT, z + (s0 - 0.5) * uz + (t0 - 0.5) * vz, a, b,
    ];
    // Gêmea do lado t=0 fica em -v, a do lado t=1 em +v.
    const twin = [
      all.has(keyOf({ ...st, x: x - vx, z: z - vz })),
      all.has(keyOf({ ...st, x: x + vx, z: z + vz })),
    ];
    const t0 = twin[0] ? 0 : STAIR_WALL;
    const t1 = twin[1] ? 1 : 1 - STAIR_WALL;

    // OS DEGRAUS: piso com a quina escura na frente, e o espelho em sombra.
    for (let k = 0; k < STAIR_STEPS; k += 1) {
      const s0 = k / STAIR_STEPS;
      const s1 = (k + 1) / STAIR_STEPS;
      const sn = s0 + (s1 - s0) * STAIR_NOSE;
      const h0 = k / STAIR_STEPS;
      const h1 = (k + 1) / STAIR_STEPS;
      quad(T, [at(s0, t0, h1, t0, s0), at(s0, t1, h1, t1, s0), at(sn, t1, h1, t1, sn), at(sn, t0, h1, t0, sn)], STAIR_SHADE.nose);
      quad(T, [at(sn, t0, h1, t0, sn), at(sn, t1, h1, t1, sn), at(s1, t1, h1, t1, s1), at(s1, t0, h1, t0, s1)], STAIR_SHADE.tread);
      quad(T, [at(s0, t0, h0, t0, h0 * 4 % 1), at(s0, t1, h0, t1, h0 * 4 % 1), at(s0, t1, h1, t1, 1), at(s0, t0, h1, t0, 1)], STAIR_SHADE.riser);
    }

    // A MURETA de cada lado sem gêmea: sobe com a escada, a uma altura fixa acima da linha dos degraus.
    for (const side of [0, 1] as const) {
      if (twin[side]) continue;
      const out = side === 0 ? 0 : 1;
      const inn = side === 0 ? STAIR_WALL : 1 - STAIR_WALL;
      const top = (sv: number): number => sv + STAIR_PARAPET;
      // a face de fora, do chão até o topo inclinado
      quad(T, [at(0, out, 0, 0, 0), at(1, out, 0, 1, 0), at(1, out, top(1), 1, 1), at(0, out, top(0), 0, 1)], STAIR_SHADE.wall);
      // a face de dentro, dos degraus até o topo (por degrau, para não atravessar o piso)
      for (let k = 0; k < STAIR_STEPS; k += 1) {
        const s0 = k / STAIR_STEPS;
        const s1 = (k + 1) / STAIR_STEPS;
        const h1 = (k + 1) / STAIR_STEPS;
        quad(T, [at(s0, inn, h1, s0, 0), at(s1, inn, h1, s1, 0), at(s1, inn, top(s1), s1, 1), at(s0, inn, top(s0), s0, 1)], STAIR_SHADE.wall);
      }
      // o capeamento, mais claro: é a linha que desenha a escadaria de cima
      quad(T, [at(0, out, top(0), out, 0), at(0, inn, top(0), inn, 0), at(1, inn, top(1), inn, 1), at(1, out, top(1), out, 1)], STAIR_SHADE.cap);
      // a ponta de baixo da mureta
      quad(T, [at(0, out, 0, 0, 0), at(0, inn, 0, 1, 0), at(0, inn, top(0), 1, 1), at(0, out, top(0), 0, 1)], STAIR_SHADE.wall);
      // OS PILARES, embaixo e em cima: um bloco um nada mais largo e mais alto que a mureta — e um nada mais
      // comprido também, para FORA da escada. Com a face no mesmo plano da ponta da mureta e do espelho do
      // primeiro degrau (s = 0), as duas brigavam pela frente e o pé do pilar piscava (o autor viu).
      const wide = STAIR_POST.wide;
      const pOut = side === 0 ? -wide : 1 + wide;
      const pIn = side === 0 ? STAIR_WALL + wide : 1 - STAIR_WALL - wide;
      for (const [sa, sb, floor] of [[-wide, STAIR_POST.len, 0], [1 - STAIR_POST.len, 1 + wide, 1]] as const) {
        const hTop = floor + STAIR_PARAPET + STAIR_POST.rise;
        const hBot = floor === 0 ? 0 : 0.5;
        const box = (ta: number, tb: number, s0: number, s1: number, shade: number): void => {
          quad(T, [at(s0, ta, hBot, 0, 0), at(s1, tb, hBot, 1, 0), at(s1, tb, hTop, 1, 1), at(s0, ta, hTop, 0, 1)], shade);
        };
        box(pOut, pOut, sa, sb, STAIR_SHADE.post); // fora
        box(pIn, pIn, sa, sb, STAIR_SHADE.post); // dentro
        box(pOut, pIn, sa, sa, STAIR_SHADE.post * 0.92); // de frente (o lado de baixo da escada)
        box(pOut, pIn, sb, sb, STAIR_SHADE.post * 0.92); // de trás
        quad(T, [at(sa, pOut, hTop, 0, 0), at(sa, pIn, hTop, 1, 0), at(sb, pIn, hTop, 1, 1), at(sb, pOut, hTop, 0, 1)], STAIR_SHADE.cap);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aUvBounds', new THREE.Float32BufferAttribute(bounds, 4));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  return geo;
};

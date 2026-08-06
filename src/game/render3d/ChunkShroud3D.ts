import * as THREE from 'three';
import { CHUNK_COLUMNS, CHUNK_ROWS } from '@/game/constants';
import { flowTimeUniform } from './pixelArtLight';

/**
 * A MORTALHA — a escuridão que cobre cada chunk ainda não comprado do construtor de mundo.
 *
 * O chunk escuro continua sendo terreno de verdade por baixo (chão aberto: é por ali que o
 * undead entra), mas o jogador não pode LER nada dele — a curiosidade é a moeda do modo.
 * A cobertura tem DOIS MODOS, e quem escolhe é a câmera (que olha sempre para o norte):
 *
 *   · CAIXA — teto a SHROUD_HEIGHT + cortinas — para chunks ao norte/leste/oeste da terra
 *     comprada: lá a muralha escura no alto e nos lados da tela é o desenho desejado, e as
 *     cortinas fecham a fresta real que existe sob o teto nesses ângulos.
 *   · TAPETE — um quad de névoa RASTEIRO, colado no chão — para todo chunk ao SUL de terra
 *     comprada (vizinho norte, nordeste ou noroeste comprado). Qualquer altura desse lado
 *     aparece de frente para a câmera como muro/parapeito preto em primeiro plano (feedback
 *     do usuário, duas vezes: primeiro a cortina, depois a borda da própria laje do teto).
 *     O tapete só funciona porque o chunk escuro é VAZIO (explorerWorld.darkChunk): uma
 *     árvore em pé vararia a névoa do chão.
 *
 * TENDRILS de névoa rasteira invadem ~1 tile do lado comprado nos dois modos, para a
 * fronteira ler como fumaça viva e não como geometria.
 *
 * As leis de render que este arquivo obedece:
 *   · Nenhuma luz nasce nem morre aqui — é malha e material, e malha pode ir e vir.
 *   · Um BUNDLE de material por chunk (uniforms próprios), nunca um material compartilhado
 *     com poke por objeto: em material built-in o three só re-envia uniforms no primeiro
 *     draw de cada material por frame, então o progresso de uma revelação vazaria para as
 *     mortalhas vizinhas. Todos os bundles têm o MESMO customProgramCacheKey — um programa
 *     por variante (caixa/tendril), compilado no boot: o primeiro sync acontece antes do
 *     prewarmShaders no modo construtor.
 *   · Bundles voltam para um POOL em vez de morrer: dar dispose no último material de um
 *     programa zeraria o refcount do three e o programa seria destruído — e a recompilação
 *     voltaria, no meio do jogo, exatamente na recentrada de janela que a lei proíbe.
 *   · Sem gradiente liso: o mosqueado é ruído POR TEXEL (16 por tile, preso ao mundo) em
 *     QUATRO tons chapados — o quarto, lunar, só onde o TOPO da névoa apanha a lua
 *     (aShroudLift: teto/tapete/crista 1, pé da parede 0). As faces em pé têm variação
 *     vertical escorrendo para baixo, o banco inteiro respira num período longo, e uma CRISTA
 *     de fiapos (o material dos tendrils, em pé) desfaz a régua da silhueta. A dissolução
 *     descarta fragmento (borda serrilhada), nunca esmaece alpha — descartar também é o que
 *     mantém o teto opaco escrevendo depth sem ocluir o que a revelação já abriu.
 *
 * A REVELAÇÃO: `reveal()` varre uma frente de dissolução por distância a partir da boca da
 * estrada comprada (a costura), com a mesma textura de ruído esfarrapando a frente e um
 * filete MORNO no limiar — a luz do mundo comendo a névoa. Um estado por chunk; as malhas
 * saem do registro na compra e morrem quando a varredura termina.
 */

export type ShroudChunkInfo = {
  cx: number;
  cy: number;
  /** Faces que encostam em terra COMPRADA: só elas ganham tendrils (e cortinas, no modo caixa). */
  builtN: boolean;
  builtE: boolean;
  builtS: boolean;
  builtW: boolean;
  /** As diagonais do NORTE decidem o MODO: terra comprada a noroeste/nordeste = modo tapete. */
  builtNE: boolean;
  builtNW: boolean;
};

/** Acima do quad de árvore (1 tile em pé); abaixo disso o teto decapitaria a própria arte. */
const SHROUD_HEIGHT = 1.22;
/** A crista: fiapos de névoa subindo acima das cortinas, para a silhueta não ser uma régua. */
const CREST_TILES = 0.42;
/** Quão fundo a névoa rasteira invade o chunk comprado (tiles). */
const FRINGE_TILES = 1.35;
/** Altura da névoa rasteira: sobre o chão (0) e sobre o decor (0.02), sob tudo que anda. */
const FRINGE_Y = 0.035;
/** A dissolução da compra: lenta de propósito — a névoa se retira, não evapora. */
const REVEAL_MS = 4400;
/** Tiles de ruído na frente de dissolução — a varredura avança em línguas, não em círculo. */
const REVEAL_RAGGED = 3.2;

/**
 * Os três tons do mosqueado + o filete da frente de revelação, em LINEAR (o mundo é desenhado
 * no render target do composer, sem tone mapping — ver o comentário do prewarmShaders). Todos
 * orbitam o fundo da cena (#070811): a mortalha é um pouco mais funda que a noite, com um
 * respiro azul-violeta para ela ler como matéria e não como buraco de framebuffer.
 */
const SHROUD_DEEP = '0.0016, 0.0019, 0.0048';
const SHROUD_MID = '0.0036, 0.0044, 0.0110';
const SHROUD_RIM = '0.0085, 0.0105, 0.0270';
/** O tom mais claro, só onde o TOPO da névoa apanha a lua (vShroudLift alto). Frio, discreto. */
const SHROUD_MOON = '0.0150, 0.0185, 0.0420';
const REVEAL_EMBER = '0.0600, 0.0420, 0.0180';

const SHROUD_GLSL_HEADER = /* glsl */ `
  uniform float uFlowTime;
  uniform float uShroudReveal;
  uniform vec2 uShroudOrigin;
  uniform float uShroudMax;
  varying vec3 vShroudPos;
  float zhShroudHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float zhShroudNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(zhShroudHash(i), zhShroudHash(i + vec2(1.0, 0.0)), u.x),
      mix(zhShroudHash(i + vec2(0.0, 1.0)), zhShroudHash(i + vec2(1.0, 1.0)), u.x),
      u.y);
  }
`;

/**
 * O corpo do fragmento. `fringeTest` entra só no material dos tendrils — o limiar de descarte
 * sobe do rés da parede (vShroudEdge=1, névoa densa) até a ponta (rala), e como o campo de
 * ruído deriva com uFlowTime, as línguas rastejam sozinhas sobre a estrada comprada.
 */
const shroudBody = (fringeTest: boolean): string => /* glsl */ `
  {
    vec2 wp = floor(vShroudPos.xz * 16.0) / 16.0;
    float wy = floor(vShroudPos.y * 16.0) / 16.0;
    float na = zhShroudNoise(wp * 0.9 + vec2(uFlowTime * 0.052, -uFlowTime * 0.037));
    float nb = zhShroudNoise(wp * 2.6 - vec2(uFlowTime * 0.030, uFlowTime * 0.024));
    // Variação VERTICAL, escorrendo devagar para BAIXO: sem ela uma face em pé repetia a
    // mesma cor do topo ao chão (o ruído era só-XZ) e a parede lia como listras de papel.
    float nc = zhShroudNoise(vec2((wp.x + wp.y) * 1.7, wy * 2.2 - uFlowTime * 0.11));
    float m = na * 0.45 + nb * 0.25 + nc * 0.30;
    // O banco inteiro RESPIRA num período longo: patches clareiam e afundam como nuvem baixa.
    m += sin(uFlowTime * 0.12 + vShroudPos.x * 0.16 + vShroudPos.z * 0.10) * 0.07;
    float d = distance(vShroudPos.xz, uShroudOrigin) + (m - 0.5) * ${REVEAL_RAGGED.toFixed(2)};
    float sweep = uShroudReveal * uShroudMax;
    if (d < sweep) discard;
    ${fringeTest ? 'if (m < mix(0.92, 0.30, vShroudEdge)) discard;' : ''}
    // O TOPO da névoa apanha a lua (vShroudLift: 1 = teto/tapete/crista, 0 = pé da parede) —
    // os mesmos degraus chapados, só deslocados para cima onde a luz fria alcança. O tom
    // lunar em si é gated no lift: o pé da muralha nunca acende.
    float lit = m + vShroudLift * 0.16;
    vec3 c = vec3(${SHROUD_DEEP});
    if (lit > 0.54) c = vec3(${SHROUD_MID});
    if (lit > 0.76) c = vec3(${SHROUD_RIM});
    if (lit > 0.92 && vShroudLift > 0.6) c = vec3(${SHROUD_MOON});
    if (uShroudReveal > 0.0 && d < sweep + 0.85) c = vec3(${REVEAL_EMBER});
    diffuseColor.rgb = c;
  }
`;

/** Um chunk coberto: as malhas dele + o bundle de material que as veste. */
type ShroudEntry = { meshes: THREE.Mesh[]; bundle: MatBundle };

type MatBundle = {
  box: THREE.MeshBasicMaterial;
  fringe: THREE.MeshBasicMaterial;
  uReveal: THREE.IUniform;
  uOrigin: THREE.IUniform<THREE.Vector2>;
  uMax: THREE.IUniform;
};

type RevealState = ShroudEntry & { ms: number };

const keyOf = (cx: number, cy: number): string => `${cx},${cy}`;

const pushQuad = (
  pos: number[],
  idx: number[],
  corners: ReadonlyArray<readonly [number, number, number]>,
): void => {
  const base = pos.length / 3;
  for (const [x, y, z] of corners) pos.push(x, y, z);
  idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
};

const buildGeometry = (
  pos: number[],
  idx: number[],
  lift: number[],
  edge?: number[],
): THREE.BufferGeometry => {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aShroudLift', new THREE.Float32BufferAttribute(lift, 1));
  if (edge) geo.setAttribute('aShroudEdge', new THREE.Float32BufferAttribute(edge, 1));
  geo.setIndex(idx);
  return geo;
};

export class ChunkShroud3D {
  /** Chunks de fronteira (vizinhos de terra comprada): malhas próprias, podem revelar. */
  private readonly near = new Map<string, ShroudEntry>();
  /** O resto da janela coberta, fundido num teto só — nunca revela diretamente. */
  private far?: ShroudEntry;
  private farKeys: string[] = [];
  private readonly revealing = new Map<string, RevealState>();
  private readonly pool: MatBundle[] = [];

  public constructor(private readonly scene: THREE.Scene) {}

  /**
   * Reconstrói a cobertura para a lista dada (a janela do explorador + 1 anel). Malhas em
   * revelação NÃO são tocadas — elas já saíram do registro e morrem no fim da varredura;
   * se um chunk em revelação reaparecer coberto (não deveria), a animação é cortada.
   */
  public sync(chunks: readonly ShroudChunkInfo[]): void {
    for (const info of chunks) {
      const stale = this.revealing.get(keyOf(info.cx, info.cy));
      if (stale) {
        this.release(stale);
        this.revealing.delete(keyOf(info.cx, info.cy));
      }
    }
    for (const entry of this.near.values()) this.release(entry);
    this.near.clear();
    if (this.far) {
      this.release(this.far);
      this.far = undefined;
    }
    this.farKeys = [];
    if (chunks.length === 0) return;

    // Primeira passada: o MODO de cada chunk coberto (ver o topo do arquivo). A segunda
    // passada precisa do mapa inteiro: uma caixa fecha a face sul também quando o vizinho de
    // baixo é TAPETE — o tapete é baixo demais para selar a fresta sob a borda do teto dela.
    const carpet = new Map<string, boolean>();
    for (const info of chunks) {
      carpet.set(keyOf(info.cx, info.cy), info.builtN || info.builtNE || info.builtNW);
    }

    const farPos: number[] = [];
    const farIdx: number[] = [];
    const farLift: number[] = [];
    for (const info of chunks) {
      const key = keyOf(info.cx, info.cy);
      const nearBuilt = info.builtN || info.builtE || info.builtS || info.builtW;
      const southCarpet = carpet.get(keyOf(info.cx, info.cy + 1)) === true;
      if (nearBuilt || carpet.get(key) === true || southCarpet) {
        this.near.set(key, this.buildNearEntry(info, carpet.get(key) === true, southCarpet));
      } else {
        pushTop(farPos, farIdx, farLift, info.cx, info.cy);
        this.farKeys.push(key);
      }
    }
    if (farPos.length > 0) {
      const bundle = this.takeBundle();
      this.far = {
        bundle,
        meshes: [this.addMesh(buildGeometry(farPos, farIdx, farLift), bundle.box, 0)],
      };
    }
  }

  /** Começa a varredura de dissolução do chunk, a partir da boca da estrada comprada. */
  public reveal(cx: number, cy: number, originWorldX: number, originWorldY: number): void {
    const key = keyOf(cx, cy);
    const entry = this.near.get(key);
    if (!entry) return;
    this.near.delete(key);
    const x0 = cx * CHUNK_COLUMNS - 0.5;
    const z0 = cy * CHUNK_ROWS - 0.5;
    let max = 0;
    for (const [px, pz] of [
      [x0, z0], [x0 + CHUNK_COLUMNS, z0], [x0 + CHUNK_COLUMNS, z0 + CHUNK_ROWS], [x0, z0 + CHUNK_ROWS],
    ] as const) {
      max = Math.max(max, Math.hypot(px - originWorldX, pz - originWorldY));
    }
    entry.bundle.uOrigin.value.set(originWorldX, originWorldY);
    // A frente cobre o canto mais fundo + os tendrils + a própria borda esfarrapada.
    entry.bundle.uMax.value = max + FRINGE_TILES + REVEAL_RAGGED;
    this.revealing.set(key, { ...entry, ms: 0 });
  }

  public update(dtMs: number): void {
    for (const [key, state] of this.revealing) {
      state.ms += dtMs;
      const k = Math.min(1, state.ms / REVEAL_MS);
      state.bundle.uReveal.value = k * k * (3 - 2 * k); // a névoa hesita, depois vai de vez
      if (state.ms >= REVEAL_MS) {
        this.release(state);
        this.revealing.delete(key);
      }
    }
  }

  /** Estado para o playtest (`world-builder`): quem está coberto, quem está dissolvendo. */
  public stats(): { covered: string[]; revealing: Array<{ key: string; progress: number }> } {
    return {
      covered: [...this.near.keys(), ...this.farKeys].sort(),
      revealing: [...this.revealing].map(([key, state]) => ({
        key,
        progress: Number((state.bundle.uReveal.value as number).toFixed(3)),
      })),
    };
  }

  // ── malhas ───────────────────────────────────────────────────────────────────

  private buildNearEntry(info: ShroudChunkInfo, isCarpet: boolean, southCarpet: boolean): ShroudEntry {
    const x0 = info.cx * CHUNK_COLUMNS - 0.5;
    const z0 = info.cy * CHUNK_ROWS - 0.5;
    const x1 = x0 + CHUNK_COLUMNS;
    const z1 = z0 + CHUNK_ROWS;
    const bundle = this.takeBundle();
    const pos: number[] = [];
    const idx: number[] = [];
    const lift: number[] = [];
    // O tendril rasteiro e a CRISTA usam o mesmo material (o dos fiapos que se desfazem):
    // aShroudEdge 1 = névoa densa, 0 = a ponta rala onde quase tudo se descarta.
    const fPos: number[] = [];
    const fIdx: number[] = [];
    const fEdge: number[] = [];
    const fLift: number[] = [];
    const wisp = (
      corners: ReadonlyArray<readonly [number, number, number]>,
      edges: readonly [number, number, number, number],
      wispLift: number,
    ): void => {
      pushQuad(fPos, fIdx, corners);
      fEdge.push(...edges);
      for (let n = 0; n < 4; n += 1) fLift.push(wispLift);
    };

    if (isCarpet) {
      // O TAPETE: névoa colada no chão, altura nenhuma. Qualquer coisa elevada ao sul da terra
      // comprada aparece de frente para a câmera como muro/parapeito preto (ver o topo do
      // arquivo). Não há nada a esconder verticalmente: o chunk escuro é vazio. Lift 1: visto
      // de cima o tapete É o topo do banco de névoa, e apanha a lua como o teto.
      const y = FRINGE_Y;
      pushQuad(pos, idx, [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]]);
      lift.push(1, 1, 1, 1);
    } else {
      pushTop(pos, idx, lift, info.cx, info.cy);
      // Cortinas: nas faces LESTE/OESTE compradas (entre dois chunks cobertos os tetos já se
      // emendam, e duas cortinas coplanares na mesma costura fariam z-fight); na face SUL
      // comprada OU com vizinho-tapete (o tapete é rasteiro e não sela a fresta visível sob a
      // borda sul do teto desta caixa). NUNCA na face NORTE: a câmera olha sempre para o
      // norte, nenhum raio de visão entra por ali — uma cortina norte só mostra as costas,
      // que é exatamente o muro preto que o usuário viu. Lift 1 no alto, 0 no pé: a muralha
      // escurece para baixo e o topo dela apanha a lua.
      const H = SHROUD_HEIGHT;
      const C = H + CREST_TILES;
      if (info.builtS || southCarpet) {
        pushQuad(pos, idx, [[x0, H, z1], [x1, H, z1], [x1, 0, z1], [x0, 0, z1]]);
        lift.push(1, 1, 0, 0);
        // A crista: fiapos subindo da borda da cortina e se desfazendo — a silhueta do banco
        // de névoa contra a noite deixa de ser uma régua.
        wisp([[x0, C, z1], [x1, C, z1], [x1, H, z1], [x0, H, z1]], [0, 0, 1, 1], 1);
      }
      if (info.builtW) {
        pushQuad(pos, idx, [[x0, H, z0], [x0, H, z1], [x0, 0, z1], [x0, 0, z0]]);
        lift.push(1, 1, 0, 0);
        wisp([[x0, C, z0], [x0, C, z1], [x0, H, z1], [x0, H, z0]], [0, 0, 1, 1], 1);
      }
      if (info.builtE) {
        pushQuad(pos, idx, [[x1, H, z0], [x1, H, z1], [x1, 0, z1], [x1, 0, z0]]);
        lift.push(1, 1, 0, 0);
        wisp([[x1, C, z0], [x1, C, z1], [x1, H, z1], [x1, H, z0]], [0, 0, 1, 1], 1);
      }
    }
    const meshes = [this.addMesh(buildGeometry(pos, idx, lift), bundle.box, 0)];

    const F = FRINGE_TILES;
    const y = FRINGE_Y;
    if (info.builtN) wisp([[x0, y, z0 - F], [x1, y, z0 - F], [x1, y, z0], [x0, y, z0]], [0, 0, 1, 1], 0);
    if (info.builtS) wisp([[x0, y, z1], [x1, y, z1], [x1, y, z1 + F], [x0, y, z1 + F]], [1, 1, 0, 0], 0);
    if (info.builtW) wisp([[x0 - F, y, z0], [x0, y, z0], [x0, y, z1], [x0 - F, y, z1]], [0, 1, 1, 0], 0);
    if (info.builtE) wisp([[x1, y, z0], [x1 + F, y, z0], [x1 + F, y, z1], [x1, y, z1]], [1, 0, 0, 1], 0);
    if (fPos.length > 0) {
      meshes.push(this.addMesh(buildGeometry(fPos, fIdx, fLift, fEdge), bundle.fringe, 1));
    }
    return { meshes, bundle };
  }

  private addMesh(geo: THREE.BufferGeometry, mat: THREE.Material, renderOrder: number): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = renderOrder;
    this.scene.add(mesh);
    return mesh;
  }

  /** Devolve as malhas ao nada e o bundle ao pool — geometria morre, material nunca. */
  private release(entry: ShroudEntry): void {
    for (const mesh of entry.meshes) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
    this.pool.push(entry.bundle);
  }

  // ── material ─────────────────────────────────────────────────────────────────

  private takeBundle(): MatBundle {
    const pooled = this.pool.pop();
    if (pooled) {
      pooled.uReveal.value = 0;
      pooled.uOrigin.value.set(1e6, 1e6);
      pooled.uMax.value = 1;
      return pooled;
    }
    const uReveal: THREE.IUniform = { value: 0 };
    const uOrigin: THREE.IUniform<THREE.Vector2> = { value: new THREE.Vector2(1e6, 1e6) };
    const uMax: THREE.IUniform = { value: 1 };
    return {
      box: makeShroudMaterial(false, uReveal, uOrigin, uMax),
      fringe: makeShroudMaterial(true, uReveal, uOrigin, uMax),
      uReveal,
      uOrigin,
      uMax,
    };
  }
}

const pushTop = (pos: number[], idx: number[], lift: number[], cx: number, cy: number): void => {
  const x0 = cx * CHUNK_COLUMNS - 0.5;
  const z0 = cy * CHUNK_ROWS - 0.5;
  const x1 = x0 + CHUNK_COLUMNS;
  const z1 = z0 + CHUNK_ROWS;
  pushQuad(pos, idx, [[x0, SHROUD_HEIGHT, z0], [x1, SHROUD_HEIGHT, z0], [x1, SHROUD_HEIGHT, z1], [x0, SHROUD_HEIGHT, z1]]);
  lift.push(1, 1, 1, 1); // o teto é o TOPO do banco de névoa: apanha a lua
};

const makeShroudMaterial = (
  fringe: boolean,
  uReveal: THREE.IUniform,
  uOrigin: THREE.IUniform<THREE.Vector2>,
  uMax: THREE.IUniform,
): THREE.MeshBasicMaterial => {
  // DoubleSide: o caixão é visto por fora em qualquer ângulo de câmera e as faces são
  // baratas demais para valerem uma convenção de winding própria.
  const mat = new THREE.MeshBasicMaterial(
    fringe
      ? { transparent: true, depthWrite: false, side: THREE.DoubleSide }
      : { side: THREE.DoubleSide },
  );
  mat.name = fringe ? 'chunk-shroud-fringe' : 'chunk-shroud';
  mat.customProgramCacheKey = () => `chunkShroud|${fringe ? 'fringe' : 'box'}`;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFlowTime = flowTimeUniform;
    shader.uniforms.uShroudReveal = uReveal;
    shader.uniforms.uShroudOrigin = uOrigin;
    shader.uniforms.uShroudMax = uMax;
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        `varying vec3 vShroudPos;\nattribute float aShroudLift;\nvarying float vShroudLift;\n${fringe ? 'attribute float aShroudEdge;\nvarying float vShroudEdge;\n' : ''}void main() {`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\n vShroudPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n vShroudLift = aShroudLift;${fringe ? '\n vShroudEdge = aShroudEdge;' : ''}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `${SHROUD_GLSL_HEADER}varying float vShroudLift;\n${fringe ? 'varying float vShroudEdge;\n' : ''}void main() {`,
      )
      .replace('#include <color_fragment>', `#include <color_fragment>\n${shroudBody(fringe)}`);
  };
  return mat;
};

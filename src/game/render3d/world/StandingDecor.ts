// A DECORAÇÃO EM PÉ NO MUNDO (ver render3d/standingDecor.ts para a engenharia de desenho e decorSway.ts para o
// movimento e a luz): a cada assado do terreno recebe os tiles de decoração e os põe de pé numa malha só — a grama em
// FIOS, cada um no lugar do pé dele no desenho (grassBlades.ts), o resto um quad por tile —, guarda os quads de cada
// tile (a cova cavada os apaga), e a cada quadro diz ao shader quem está passando, que tile foi pisado e se a
// decoração está em pé.

import * as THREE from 'three';
import { TIMINGS } from '@/game/constants';
import { RELIEF_HEIGHT, reliefLevelAt } from '@/game/world/relief';
import {
  STAND_ACTOR_SLOTS, STAND_FRONT_DEPTH, STAND_RUSTLE_SLOTS, STAND_WAKE_SLOTS, standActorsUniform, standRustleUniform, standUniform,
  standWakeUniform,
} from '../decorSway';
import { BLADE_FRAMES, bladeGrowth, contactShadows, traceBlades, type Blade } from '../grassBlades';
import {
  buildStandingDecorGeometry, collapsePiece, isFlexibleDecor, STANDING_DECOR_ORDER, type BladePiece, type ShadowDot, type StandingPiece,
} from '../standingDecor';
import { groundShadeAt, tileKey } from '../terrainGeometry';
import { frameFootPad, framePixelReader } from '../textures3d';
import { decorScatterAt } from './decorScatter';

/** O que a decoração usa do mundo: pôr a malha na cena (pelo assado), os corpos que passam e o knob `hd3d.stand`. */
export interface StandingDecorHost {
  addMesh(mesh: THREE.Mesh): void;
  /** Os corpos que abrem as plantas: os do espelho d'água (herói, vizinhos, gato). */
  actors(): Iterable<THREE.Object3D>;
  /** O ponto da câmera: com mais corpos que slots, ficam os mais perto dele. */
  focus(): { x: number; z: number };
  /** 1 = em pé, 0 = deitada como o adesivo de antes. */
  stand(): number;
  /** O relógio da água (`flowTimeUniform`), em segundos: é por ele que o shader mede a idade de cada passo da esteira. */
  now(): number;
}

/** Os personagens (herói, vizinho, gato) passam DEPOIS da decoração; a passada da frente vem logo depois deles. */
const FRONT_ORDER = 0.5;
/** A esteira: um passo a cada meio tile andado, dos três corpos mais perto da câmera; um salto maior (o teleporte, a
 *  cena) não abre anel nenhum. */
const WAKE_STEP = 0.5;
const WAKE_ACTORS = 3;
const WAKE_JUMP = 3;

/**
 * O raio em que um corpo abre as plantas, em tiles: o tile em que ele está, e os vizinhos dos lados se afastam dele
 * (a planta do pé fica escondida atrás do próprio corpo; é a vizinha se curvando que se vê).
 */
const ACTOR_RADIUS = 1.4;
/** O pisão: a ponta vai até 3 pixels de arte para o lado e volta (ida e volta no tempo do farfalhar do 2D). */
const RUSTLE_TEXELS = 3;
/** Um pixel de arte, em tiles. */
const PX = 1 / 16;
/** O tom de um fio para o vizinho: ±5%, como numa touceira de verdade. */
const BLADE_TONE = 0.1;

const hash01 = (a: number, b: number, salt: number): number => {
  let h = (a * 73856093) ^ (b * 19349663) ^ (salt * 83492791);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};

type Item = (StandingPiece | BladePiece | ShadowDot) & { tile: number };

export class StandingDecor {
  private mesh?: THREE.Mesh;
  /** tileKey → os quads da decoração daquele tile: um, ou os pedaços de todos os fios dele. */
  private readonly quads = new Map<number, number[]>();
  /** Os tiles cuja peça é planta (só eles farfalham). */
  private readonly flexible = new Set<number>();
  /** Os tiles pisados que ainda sacodem: o centro do tile e o tempo do pisão (0 a 1). */
  private readonly rustles = new Map<number, { x: number; z: number; t: number }>();
  private readonly ranked: Array<{ o: THREE.Object3D; d: number }> = [];
  /** Os fios de cada quadro de grama, lidos da arte uma vez (null: a arte não é legível, e o tile fica peça inteira). */
  private readonly bladesByFrame = new Map<number, { blades: Blade[]; dots: Array<{ col: number; row: number }> } | null>();
  /** Onde cada corpo deu o último passo da esteira, e o próximo slot dela (um anel: o mais velho cede o lugar). */
  private readonly lastStep = new WeakMap<THREE.Object3D, { x: number; z: number }>();
  private wakeNext = 0;
  /**
   * A PASSADA DA FRENTE desenha só a fatia da malha à frente dos pés do herói: uma geometria que divide os atributos e
   * o índice da principal (na placa é o mesmo buffer), com a faixa de desenho dela. `footZs` é a linha do pé de cada
   * quad, em ordem — a fatia sai por busca binária, a cada quadro.
   */
  private frontGeometry?: THREE.BufferGeometry;
  private footZs = new Float32Array(0);
  /** Os pisões vivos, reusados a cada quadro (nada de lixo no caminho quente). */
  private readonly liveRustles: Array<{ x: number; z: number; t: number }> = [];
  /** Quantos tiles de decoração o último assado pôs de pé (a janela do playtest e do profiler). */
  public count = 0;
  /** Quantos fios de grama o último assado pôs de pé. */
  public blades = 0;

  public constructor(private readonly host: StandingDecorHost) {}

  public bake(
    tiles: ReadonlyArray<{ x: number; z: number; frame: number; still?: boolean }>,
    solidSet: ReadonlySet<number>,
    material: THREE.Material,
    frontMaterial?: THREE.Material,
    trees?: ReadonlySet<number>,
  ): void {
    this.mesh = undefined; // a malha velha o re-assado já tirou da cena (é malha de terreno)
    this.quads.clear();
    this.flexible.clear();
    this.rustles.clear();
    this.count = 0;
    this.blades = 0;
    if (tiles.length === 0) return;
    // a luz do chão em que cada peça pisa, com a sombra da mata (a moita debaixo das árvores escurece com o chão)
    const shade = groundShadeAt(solidSet, trees);
    const items: Item[] = [];
    for (const { x, z, frame, still } of tiles) {
      // o MESMO espalhamento e o MESMO tom do adesivo deitado: a peça fica de pé onde estava
      const sc = decorScatterAt(x, z, frame);
      const y = 0.02 + reliefLevelAt(x, z) * RELIEF_HEIGHT;
      const tile = tileKey(x, z);
      // a peça PARADA (o capim do meio da mata) fica inteira, mesmo sendo grama: fio a fio é para o que se pisa
      const grass = !still && BLADE_FRAMES.has(frame) ? this.bladesOf(frame) : null;
      if (grass && grass.blades.length > 0) {
        this.pushBlades(items, grass, { x, z, frame, y, tile, sc, shade });
        continue;
      }
      const cx = x + sc.dx;
      const cz = z + sc.dz;
      const pad = frameFootPad('forest-tileset', frame);
      const footZ = cz + 0.5 - pad;
      const c = shade(cx, footZ);
      items.push({
        x: cx, footZ, y, rootX: cx, rootZ: cz, frame, pad, still,
        r: c[0] * sc.shade, g: c[1] * sc.shade, b: c[2] * sc.shade, tile,
      });
    }
    // A ORDEM DO PINTOR: do norte para o sul (a câmera olha para o norte e a decoração não grava profundidade). Um fio
    // é um pé: um fio mais ao sul cobre o de trás dele, e o tufo de cima do desenho fica ATRÁS do de baixo.
    items.sort((a, c) => a.footZ - c.footZ || a.x - c.x);
    const geometry = buildStandingDecorGeometry(items);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = STANDING_DECOR_ORDER;
    mesh.name = 'terrain-decor';
    items.forEach((p, quad) => {
      const list = this.quads.get(p.tile);
      if (list) list.push(quad);
      else this.quads.set(p.tile, [quad]);
      if (isFlexibleDecor(p.frame) && !('still' in p && p.still)) this.flexible.add(p.tile);
    });
    this.count = tiles.length;
    this.mesh = mesh;
    this.host.addMesh(mesh);
    this.footZs = Float32Array.from(items, (p) => p.footZ);
    // A PASSADA DA FRENTE (decorSway.ts): os MESMOS atributos, desenhados de novo depois dos personagens, só na fatia
    // à frente dos pés de quem está no foco (o shader ainda corta pelos lados). A cova cavada a apaga junto.
    this.frontGeometry = undefined;
    if (frontMaterial) {
      const frontGeometry = new THREE.BufferGeometry();
      for (const [name, attr] of Object.entries(geometry.attributes)) frontGeometry.setAttribute(name, attr);
      frontGeometry.setIndex(geometry.getIndex());
      frontGeometry.boundingSphere = geometry.boundingSphere?.clone() ?? null;
      frontGeometry.setDrawRange(0, 0);
      const front = new THREE.Mesh(frontGeometry, frontMaterial);
      front.renderOrder = FRONT_ORDER;
      front.name = 'terrain-decor-front';
      this.frontGeometry = frontGeometry;
      this.host.addMesh(front);
    }
  }

  /** A fatia da malha à frente dos pés de quem está no foco (o slot 0 dos corpos): de lá a passada da frente desenha. */
  private updateFront(): void {
    const geo = this.frontGeometry;
    if (!geo) return;
    const hero = standActorsUniform.value[0];
    if (hero.w < 0.5 || this.footZs.length === 0) {
      geo.setDrawRange(0, 0);
      return;
    }
    const first = this.firstQuadAfter(hero.y);
    const end = this.firstQuadAfter(hero.y + STAND_FRONT_DEPTH);
    geo.setDrawRange(first * 6, Math.max(0, end - first) * 6);
  }

  /** O primeiro quad cuja linha do pé passa de `z` (busca binária: a malha vem ordenada do norte para o sul). */
  private firstQuadAfter(z: number): number {
    let lo = 0;
    let hi = this.footZs.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.footZs[mid] <= z) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /**
   * Os fios de um tile de grama: cada um em pé no ponto do chão onde o pé dele está no desenho (com o espalhamento do
   * tile), na luz do chão daquele ponto, com um tom e uma fase de tremular só dele.
   */
  private pushBlades(
    items: Item[],
    grass: { blades: readonly Blade[]; dots: ReadonlyArray<{ col: number; row: number }> },
    t: {
      x: number; z: number; frame: number; y: number; tile: number;
      sc: { dx: number; dz: number; shade: number }; shade: (x: number, z: number) => readonly number[];
    },
  ): void {
    const left = t.x - 0.5 + t.sc.dx;
    const north = t.z - 0.5 + t.sc.dz;
    grass.blades.forEach((b, i) => {
      const footZ = north + (b.footRow + 1) * PX;
      const rootX = left + (b.footCol + 0.5) * PX;
      const c = t.shade(rootX, footZ);
      const tone = t.sc.shade * (1 - BLADE_TONE / 2 + hash01(t.tile, i, 7) * BLADE_TONE);
      const phase = hash01(t.tile, i, 13) * Math.PI * 2;
      // cada fio sorteia a altura dele (a haste cresce em pixel inteiro: grassBlades.bladeGrowth)
      const grow = bladeGrowth(t.frame, b, hash01(t.tile, i, 29));
      for (const r of b.runs) {
        items.push({
          blade: true, x: left + (r.col + 0.5) * PX, rootX, footZ, y: t.y, frame: t.frame,
          col: r.col, top: r.top, bottom: r.bottom, base: r.base, height: b.height, footRows: b.footRows, grow, phase,
          r: c[0] * tone, g: c[1] * tone, b: c[2] * tone, tile: t.tile,
        });
      }
    });
    // a sombra de contato de cada fio, deitada no chão onde está no desenho (na frente do pé)
    for (const d of grass.dots) {
      const z = north + d.row * PX;
      const x = left + (d.col + 0.5) * PX;
      const c = t.shade(x, z);
      items.push({
        dot: true, x, z, footZ: z + PX, y: t.y, frame: t.frame, col: d.col, row: d.row,
        r: c[0], g: c[1], b: c[2], tile: t.tile,
      });
    }
    this.blades += grass.blades.length;
  }

  private bladesOf(frame: number): { blades: Blade[]; dots: Array<{ col: number; row: number }> } | null {
    if (this.bladesByFrame.has(frame)) return this.bladesByFrame.get(frame) ?? null;
    const read = framePixelReader('forest-tileset', frame);
    const grass = read ? { blades: traceBlades(read), dots: contactShadows(read) } : null;
    this.bladesByFrame.set(frame, grass);
    return grass;
  }

  /** O tile perdeu a decoração (a cova cavada): os quads somem sem realocar nada, e o pisão dele morre junto. */
  public clearTile(x: number, z: number): void {
    const key = tileKey(x, z);
    const list = this.quads.get(key);
    if (list === undefined || !this.mesh) return;
    this.quads.delete(key);
    this.flexible.delete(key);
    this.rustles.delete(key);
    for (const quad of list) collapsePiece(this.mesh.geometry, quad);
  }

  /** O herói entrou no tile (ou a espada, a mão, o fogo mexeram nele): a ponta da planta vai e volta. */
  public rustle(x: number, z: number): void {
    const key = tileKey(x, z);
    if (this.quads.has(key) && this.flexible.has(key)) this.rustles.set(key, { x, z, t: 0 });
  }

  /** A cada quadro: o knob, os pisões e os corpos que passam. */
  public update(dt: number): void {
    standUniform.value = Math.min(1, Math.max(0, this.host.stand()));
    this.updateRustles(dt);
    this.updateActors();
    this.updateFront();
  }

  /** Os pisões vivos, os mais novos primeiro, um por slot do shader; os slots que sobram ficam desligados. */
  private updateRustles(dt: number): void {
    const slots = standRustleUniform.value;
    const cycle = (TIMINGS.grassRustleDurationMs * 2) / 1000;
    const live = this.liveRustles;
    live.length = 0;
    for (const [key, r] of this.rustles) {
      r.t += dt / cycle;
      if (r.t >= 1) this.rustles.delete(key);
      else live.push(r);
    }
    // os mais novos primeiro: com mais pisões que slots, fica o que acabou de acontecer
    live.sort((a, c) => a.t - c.t);
    const used = Math.min(live.length, STAND_RUSTLE_SLOTS);
    for (let i = 0; i < used; i++) {
      const r = live[i];
      // ida e volta com Sine.easeOut, como o tween do 2D; em pixel de arte inteiro
      const half = r.t < 0.5 ? r.t * 2 : (1 - r.t) * 2;
      slots[i].set(r.x, r.z, Math.round(RUSTLE_TEXELS * Math.sin((half * Math.PI) / 2)), 1);
    }
    for (let i = used; i < STAND_RUSTLE_SLOTS; i++) slots[i].w = 0;
  }

  /**
   * Os corpos mais perto da câmera abrem as plantas; os slots que sobram ficam desligados. O slot 0 é quem está no
   * foco (o herói): é dos pés dele que a passada da frente mede. E os três mais perto deixam a esteira.
   */
  private updateActors(): void {
    const f = this.host.focus();
    this.ranked.length = 0;
    for (const o of this.host.actors()) {
      if (!o.visible || !o.parent) continue; // escondido, ou já fora da cena (o espelho o tira depois)
      this.ranked.push({ o, d: Math.hypot(o.position.x - f.x, o.position.z - f.z) });
    }
    this.ranked.sort((a, c) => a.d - c.d);
    const slots = standActorsUniform.value;
    for (let i = 0; i < STAND_ACTOR_SLOTS; i++) {
      const a = this.ranked[i];
      if (a) slots[i].set(a.o.position.x, a.o.position.z, ACTOR_RADIUS, 1);
      else slots[i].w = 0;
    }
    for (let i = 0; i < Math.min(WAKE_ACTORS, this.ranked.length); i++) this.stepWake(this.ranked[i].o);
  }

  /** Um passo da esteira a cada meio tile que o corpo anda (o salto de um teleporte não conta). */
  private stepWake(o: THREE.Object3D): void {
    const x = o.position.x;
    const z = o.position.z;
    const last = this.lastStep.get(o);
    if (!last) {
      this.lastStep.set(o, { x, z });
      return;
    }
    const moved = Math.hypot(x - last.x, z - last.z);
    if (moved < WAKE_STEP) return;
    last.x = x;
    last.z = z;
    if (moved > WAKE_JUMP) return;
    standWakeUniform.value[this.wakeNext].set(x, z, this.host.now(), 1);
    this.wakeNext = (this.wakeNext + 1) % STAND_WAKE_SLOTS;
  }
}

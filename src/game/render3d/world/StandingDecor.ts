// A DECORAÇÃO EM PÉ NO MUNDO (ver render3d/standingDecor.ts para a engenharia de desenho e decorSway.ts para o
// movimento e a luz): a cada assado do terreno recebe os tiles de decoração e os põe de pé numa malha só, guarda o
// quad de cada tile (a cova cavada o apaga, o pisão o sacode), e a cada quadro diz ao shader quem está passando e se
// a decoração está em pé.

import * as THREE from 'three';
import { TIMINGS } from '@/game/constants';
import { RELIEF_HEIGHT, reliefLevelAt } from '@/game/world/relief';
import { STAND_ACTOR_SLOTS, standActorsUniform, standUniform } from '../decorSway';
import { buildStandingDecorGeometry, collapsePiece, isFlexibleDecor, setPieceRustle, STANDING_DECOR_ORDER, type StandingPiece } from '../standingDecor';
import { groundShadeAt, tileKey } from '../terrainGeometry';
import { frameFootPad } from '../textures3d';
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
}

/**
 * O raio em que um corpo abre as plantas, em tiles: o tile em que ele está, e os vizinhos dos lados se afastam dele
 * (a planta do pé fica escondida atrás do próprio corpo; é a vizinha se curvando que se vê).
 */
const ACTOR_RADIUS = 1.4;
/** O pisão: a ponta vai até 3 pixels de arte para o lado e volta (ida e volta no tempo do farfalhar do 2D). */
const RUSTLE_TEXELS = 3;

export class StandingDecor {
  private mesh?: THREE.Mesh;
  /** tileKey → o quad da decoração daquele tile. */
  private readonly quads = new Map<number, number>();
  /** Os tiles cuja peça é planta (só eles farfalham). */
  private readonly flexible = new Set<number>();
  private readonly rustles = new Map<number, { quad: number; t: number }>();
  private readonly ranked: Array<{ o: THREE.Object3D; d: number }> = [];
  /** Quantos tiles de decoração o último assado pôs de pé (a janela do playtest e do profiler). */
  public count = 0;

  public constructor(private readonly host: StandingDecorHost) {}

  public bake(tiles: ReadonlyArray<{ x: number; z: number; frame: number }>, solidSet: ReadonlySet<number>, material: THREE.Material): void {
    this.mesh = undefined; // a malha velha o re-assado já tirou da cena (é malha de terreno)
    this.quads.clear();
    this.flexible.clear();
    this.rustles.clear();
    this.count = 0;
    if (tiles.length === 0) return;
    const shade = groundShadeAt(solidSet);
    const pieces: Array<StandingPiece & { tile: number }> = tiles.map(({ x, z, frame }) => {
      // o MESMO espalhamento e o MESMO tom do adesivo deitado: a peça fica de pé onde estava
      const sc = decorScatterAt(x, z, frame);
      const cx = x + sc.dx;
      const cz = z + sc.dz;
      const pad = frameFootPad('forest-tileset', frame);
      const footZ = cz + 0.5 - pad;
      const c = shade(cx, footZ);
      return {
        x: cx, footZ, y: 0.02 + reliefLevelAt(x, z) * RELIEF_HEIGHT, rootX: cx, rootZ: cz, frame, pad,
        r: c[0] * sc.shade, g: c[1] * sc.shade, b: c[2] * sc.shade, tile: tileKey(x, z),
      };
    });
    // A ORDEM DO PINTOR: do norte para o sul (a câmera olha para o norte e a decoração não grava profundidade).
    pieces.sort((a, c) => a.footZ - c.footZ || a.x - c.x);
    const mesh = new THREE.Mesh(buildStandingDecorGeometry(pieces), material);
    mesh.renderOrder = STANDING_DECOR_ORDER;
    mesh.name = 'terrain-decor';
    pieces.forEach((p, quad) => {
      this.quads.set(p.tile, quad);
      if (isFlexibleDecor(p.frame)) this.flexible.add(p.tile);
    });
    this.count = pieces.length;
    this.mesh = mesh;
    this.host.addMesh(mesh);
  }

  /** O tile perdeu a decoração (a cova cavada): o quad some sem realocar nada, e o pisão dele morre junto. */
  public clearTile(x: number, z: number): void {
    const key = tileKey(x, z);
    const quad = this.quads.get(key);
    if (quad === undefined || !this.mesh) return;
    this.quads.delete(key);
    this.flexible.delete(key);
    // TEM que morrer: o pisão reescreve a ponta a cada quadro e levantaria o quad dobrado.
    this.rustles.delete(key);
    collapsePiece(this.mesh.geometry, quad);
  }

  /** O herói entrou no tile (ou a espada, a mão, o fogo mexeram nele): a ponta da planta vai e volta. */
  public rustle(x: number, z: number): void {
    const key = tileKey(x, z);
    const quad = this.quads.get(key);
    if (quad !== undefined && this.flexible.has(key)) this.rustles.set(key, { quad, t: 0 });
  }

  /** A cada quadro: o knob, os pisões e os corpos que passam. */
  public update(dt: number): void {
    standUniform.value = Math.min(1, Math.max(0, this.host.stand()));
    this.updateRustles(dt);
    this.updateActors();
  }

  private updateRustles(dt: number): void {
    if (this.rustles.size === 0 || !this.mesh) return;
    const cycle = (TIMINGS.grassRustleDurationMs * 2) / 1000;
    for (const [key, r] of this.rustles) {
      r.t += dt / cycle;
      const done = r.t >= 1;
      // ida e volta com Sine.easeOut, como o tween do 2D; em pixel de arte inteiro
      const half = done ? 0 : (r.t < 0.5 ? r.t * 2 : (1 - r.t) * 2);
      setPieceRustle(this.mesh.geometry, r.quad, Math.round(RUSTLE_TEXELS * Math.sin((half * Math.PI) / 2)));
      if (done) this.rustles.delete(key);
    }
  }

  /** Os corpos mais perto da câmera abrem as plantas; os slots que sobram ficam desligados. */
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
  }
}

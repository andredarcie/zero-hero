// O MATO ALTO NO MUNDO (pedido do autor, 2026-11-17; a arte em render3d/tallGrassArt, o tufo em tallGrassTuft): todos
// os tufos do vale numa malha só, FIO A FIO, desenhados pelo MESMO programa da decoração em pé (standingDecor.ts /
// decorSway.ts). Então o mato alto pega a mesma brisa que atravessa o vale (a onda larga e o tremular de cada fio, a
// curva em pixel inteiro, o pé parado), abre em volta de quem passa, sacode na esteira dos passos e leva a rampa do
// bioma na folha — o mesmo verde do capim do chão em que ele nasce. Nada compila a mais: a chave do programa é a da
// decoração.
//
// A ÚNICA DIFERENÇA DA DECORAÇÃO: o fio do mato GRAVA PROFUNDIDADE (só onde há pixel: o corte de alfa). O mato alto é
// da altura do herói e ocupa o tile dele, então quem está atrás dele some atrás dele e quem está na frente o cobre — o
// que a decoração, baixinha, resolve com a passada da frente. As sombras pontilhadas vão numa malha à parte, que não
// grava (senão comeriam a grade e as películas do chão desenhadas depois).
//
// O tufo cortado vira os tocos do mesmo tufo; o queimado afunda e acinzenta (`setChar`, `setSink`) e vira o toco
// carbonizado. Mudar de estado remonta a malha (alguns milissegundos, no instante do corte); queimar e afundar só
// reescrevem a faixa daquele tufo.

import * as THREE from 'three';
import { biomeTintAt } from '@/game/world/biomes';
import { RELIEF_HEIGHT, reliefLevelAt } from '@/game/world/relief';
import { patchPixelMaterial, syncTexelAaUniforms, type TexelAaUniforms } from '../pixelArtLight';
import { pixelTexture } from '../pixelTexture';
import {
  buildStandingDecorGeometry, STANDING_DECOR_ORDER, type BladePiece, type FlatPiece, type FrameUv,
} from '../standingDecor';
import {
  ATLAS_H, ATLAS_W, buildTallGrassAtlas, cellOrigin, SHADOW_CELL, STUB_SHADOW_CELL, tipRegion, type TallGrassAtlas,
} from '../tallGrassArt';
import { composeTuft, type PlacedBlade, type TuftLayout } from '../tallGrassTuft';
import { GrassFlyers, type FlyerArt } from './GrassFlyers';

export type TuftState = 'tall' | 'stub' | 'gone';

/** Um tufo no mundo. Quem o segura é o TallGrassObject; o campo é quem o desenha. */
export interface Tuft {
  readonly x: number;
  readonly y: number;
  readonly layout: TuftLayout;
  state: TuftState;
  /** 0 = verde, 1 = cinza (a queima). */
  char: number;
  /** 0 = em pé, 1 = afundado no chão a altura inteira (a queima, o broto nascendo). */
  sink: number;
  /** A faixa de quads dele na malha dos fios (o último assado). */
  start: number;
  count: number;
}

const PX = 1 / 16;
/** Os fios antes da decoração (-1,5): eles gravam profundidade, e a decoração que está atrás deles some atrás deles. */
const BLADES_ORDER = STANDING_DECOR_ORDER - 0.1;
const SHADOWS_ORDER = STANDING_DECOR_ORDER - 0.15;
/** A cor da cinza: o verde da queima vira isto (multiplica a cor do bioma). */
const ASH: readonly [number, number, number] = [0.4, 0.38, 0.36];
/** Quanto a queima e o broto afundam, no máximo: a altura do fio mais alto. */
const SINK_PX = 15;
/** Afundado daqui para cima, o tufo é baixo (o broto, o queimado murchando): leva a sombra pequena. */
const LOW_SINK = 0.5;

/** A janela 16×16 que começa na célula (o quadro "da" célula: as colunas 0..7 são dela, o resto o shader recorta). */
const cellUv = (cell: number): FrameUv => {
  const o = cellOrigin(cell);
  const u0 = o.x / ATLAS_W;
  const u1 = (o.x + 16) / ATLAS_W;
  const v1 = 1 - o.y / ATLAS_H;
  const v0 = 1 - (o.y + 16) / ATLAS_H;
  const hx = 0.5 / ATLAS_W;
  const hy = 0.5 / ATLAS_H;
  return { u0, u1, v0, v1, cu0: u0 + hx, cu1: u1 - hx, cv0: v0 + hy, cv1: v1 - hy };
};

const fields = new WeakMap<THREE.Scene, TallGrassField>();

export class TallGrassField {
  /** O campo da cena (um por mundo). */
  public static for(scene: THREE.Scene): TallGrassField {
    let field = fields.get(scene);
    if (!field) {
      field = new TallGrassField(scene);
      fields.set(scene, field);
    }
    return field;
  }

  public readonly atlas: TallGrassAtlas;
  private readonly texture: THREE.Texture;
  private readonly bladeMaterial: THREE.MeshLambertMaterial;
  private readonly shadowMaterial: THREE.MeshLambertMaterial;
  private readonly tufts = new Set<Tuft>();
  private blades?: THREE.Mesh;
  private shadows?: THREE.Mesh;
  private flyerPool?: GrassFlyers;
  private basePos = new Float32Array(0);
  private baseCol = new Float32Array(0);
  private dirty = false;

  private constructor(private readonly scene: THREE.Scene) {
    this.atlas = buildTallGrassAtlas();
    this.texture = pixelTexture(this.atlas.pixels, ATLAS_W, ATLAS_H);
    const aa: TexelAaUniforms = { size: { value: new THREE.Vector2() } };
    syncTexelAaUniforms(aa, this.texture);
    // Os mesmos parâmetros do material da decoração (terrainMaterials): o mesmo programa. Só a profundidade muda.
    const make = (depthWrite: boolean): THREE.MeshLambertMaterial => {
      const m = new THREE.MeshLambertMaterial({ map: this.texture, transparent: true, alphaTest: 0.35, depthWrite, vertexColors: true });
      patchPixelMaterial(m, { quantize: true, texelAa: aa, biome: 'decor', standing: true });
      return m;
    };
    this.bladeMaterial = make(true);
    this.bladeMaterial.name = 'tall-grass';
    this.shadowMaterial = make(false);
    this.shadowMaterial.name = 'tall-grass-shadow';
  }

  /** Um tufo novo, em pé, no tile (x, y). */
  public add(x: number, y: number): Tuft {
    const tuft: Tuft = { x, y, layout: composeTuft(x, y, this.atlas), state: 'tall', char: 0, sink: 0, start: 0, count: 0 };
    this.tufts.add(tuft);
    this.markDirty();
    return tuft;
  }

  public setState(tuft: Tuft, state: TuftState): void {
    if (tuft.state === state) return;
    tuft.state = state;
    this.markDirty();
  }

  /** A queima: o verde vai à cinza (0..1). Só reescreve o tufo. */
  public setChar(tuft: Tuft, char: number): void {
    tuft.char = Math.min(1, Math.max(0, char));
    this.rewrite(tuft);
  }

  /**
   * O tufo afunda no chão (0..1 da altura): a queima que o derruba, o broto que sobe. Só reescreve o tufo — a não ser
   * quando ele passa da meia altura, que troca a sombra (o broto e o tufo afundado levam a sombra pequena do toco).
   */
  public setSink(tuft: Tuft, sink: number): void {
    const wasLow = tuft.sink >= LOW_SINK;
    tuft.sink = Math.min(1, Math.max(0, sink));
    if (tuft.state === 'tall' && (tuft.sink >= LOW_SINK) !== wasLow) this.markDirty();
    else this.rewrite(tuft);
  }

  public remove(tuft: Tuft): void {
    if (!this.tufts.delete(tuft)) return;
    if (this.tufts.size === 0) {
      this.dispose();
      return;
    }
    this.markDirty();
  }

  /**
   * Os fios em pé de um tufo, no mundo: de onde a foice os atira (scenes/game/MowFx). `tip` é a ponta acima do corte,
   * pronta para voar (GrassFlyers), com a cor que ela tem no chão.
   */
  public bladesOf(tuft: Tuft): Array<{
    x: number; z: number; y: number; height: number; kind: PlacedBlade['art']['kind']; tone: number; tip: FlyerArt | null;
  }> {
    const y = this.groundY(tuft);
    const tint = biomeTintAt(tuft.x, tuft.y);
    return tuft.layout.tall.map((b) => {
      const region = tipRegion(b.art);
      return {
        x: tuft.x + b.dxPx * PX, z: tuft.y + b.dz, y, height: b.art.height * PX, kind: b.art.kind, tone: b.tone,
        tip: region ? { cell: b.art.cell, ...region, r: tint[0] * b.tone, g: tint[1] * b.tone, b: tint[2] * b.tone } : null,
      };
    });
  }

  /** O voo das pontas cortadas, no mesmo material do mato (ver GrassFlyers). */
  public get flyers(): GrassFlyers {
    this.flyerPool ??= new GrassFlyers(this.scene, this.bladeMaterial, cellUv, BLADES_ORDER + 0.01);
    return this.flyerPool;
  }

  /** Quantos fios a malha desenha agora (a sonda do playtest). */
  public get bladeQuads(): number {
    this.flush();
    return this.blades ? (this.blades.geometry.index?.count ?? 0) / 6 : 0;
  }

  private groundY(tuft: Pick<Tuft, 'x' | 'y'>): number {
    return 0.02 + reliefLevelAt(tuft.x, tuft.y) * RELIEF_HEIGHT;
  }

  private markDirty(): void {
    if (this.dirty) return;
    this.dirty = true;
    // vários tufos mudam no mesmo instante (o mundo nascendo, o fogo que se espalha): um assado só, antes do quadro
    void Promise.resolve().then(() => this.flush());
  }

  private flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.rebuild();
  }

  /** A malha de novo: os fios (e os tocos) de cada tufo, e as sombras. */
  private rebuild(): void {
    const blades: BladePiece[] = [];
    const shadows: FlatPiece[] = [];
    const ordered = [...this.tufts].sort((a, b) => a.y - b.y || a.x - b.x);
    for (const t of ordered) {
      t.start = blades.length;
      if (t.state !== 'gone') {
        const set = t.state === 'tall' ? t.layout.tall : t.layout.stubs;
        const y = this.groundY(t);
        const tint = biomeTintAt(t.x, t.y);
        for (const b of set) {
          const fx = t.x + b.dxPx * PX;
          const footZ = t.y + b.dz;
          for (const r of b.art.runs) {
            blades.push({
              blade: true, x: fx + (r.col - b.art.footCol) * PX, rootX: fx, footZ, y, frame: b.art.cell,
              col: r.col, top: r.top, bottom: r.bottom, base: r.base, height: b.art.height, footRows: b.art.footRows,
              grow: 1, phase: b.phase, r: tint[0] * b.tone, g: tint[1] * b.tone, b: tint[2] * b.tone,
            });
          }
        }
        const cell = t.state === 'tall' && t.sink < LOW_SINK ? SHADOW_CELL : STUB_SHADOW_CELL;
        shadows.push({
          flatRect: true, x0: t.x - 0.5, x1: t.x + 0.5, z0: t.y - 0.5, z1: t.y + 0.5, y: y + 0.004, frame: cell,
          col0: 0, row0: 0, col1: 15, row1: 15, footZ: t.y + 0.5, r: 1, g: 1, b: 1,
        });
      }
      t.count = blades.length - t.start;
    }
    this.blades = this.swap(this.blades, blades, this.bladeMaterial, BLADES_ORDER, 'tall-grass');
    this.shadows = this.swap(this.shadows, shadows, this.shadowMaterial, SHADOWS_ORDER, 'tall-grass-shadow');
    const geo = this.blades?.geometry;
    this.basePos = geo ? Float32Array.from((geo.attributes.position as THREE.BufferAttribute).array) : new Float32Array(0);
    this.baseCol = geo ? Float32Array.from((geo.attributes.color as THREE.BufferAttribute).array) : new Float32Array(0);
    for (const t of ordered) if (t.char > 0 || t.sink > 0) this.rewrite(t);
  }

  private swap(
    old: THREE.Mesh | undefined, pieces: ReadonlyArray<BladePiece | FlatPiece>, material: THREE.Material, order: number, name: string,
  ): THREE.Mesh | undefined {
    if (old) {
      this.scene.remove(old);
      old.geometry.dispose();
    }
    if (pieces.length === 0) return undefined;
    const mesh = new THREE.Mesh(buildStandingDecorGeometry(pieces, cellUv), material);
    mesh.renderOrder = order;
    mesh.name = name;
    mesh.frustumCulled = false; // os tufos se espalham pelo vale: a esfera da malha cobriria tudo de qualquer jeito
    this.scene.add(mesh);
    return mesh;
  }

  /** Reescreve a faixa de UM tufo a partir do assado: a cor (a cinza) e a altura (o afundar). */
  private rewrite(tuft: Tuft): void {
    this.flush();
    const geo = this.blades?.geometry;
    if (!geo || tuft.count === 0) return;
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const col = geo.attributes.color as THREE.BufferAttribute;
    const drop = tuft.sink * SINK_PX * PX;
    const k = [1 + (ASH[0] - 1) * tuft.char, 1 + (ASH[1] - 1) * tuft.char, 1 + (ASH[2] - 1) * tuft.char];
    const v0 = tuft.start * 4;
    const v1 = (tuft.start + tuft.count) * 4;
    for (let v = v0; v < v1; v += 1) {
      pos.setY(v, this.basePos[v * 3 + 1] - drop);
      col.setXYZ(v, this.baseCol[v * 3] * k[0], this.baseCol[v * 3 + 1] * k[1], this.baseCol[v * 3 + 2] * k[2]);
    }
    pos.addUpdateRange(v0 * 3, (v1 - v0) * 3);
    col.addUpdateRange(v0 * 3, (v1 - v0) * 3);
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  private dispose(): void {
    this.dirty = false;
    for (const m of [this.blades, this.shadows]) {
      if (!m) continue;
      this.scene.remove(m);
      m.geometry.dispose();
    }
    this.blades = undefined;
    this.shadows = undefined;
    this.flyerPool?.dispose();
    this.flyerPool = undefined;
    fields.delete(this.scene);
    this.bladeMaterial.dispose();
    this.shadowMaterial.dispose();
    this.texture.dispose();
  }
}

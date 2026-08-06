import { CHUNK_COLUMNS, CHUNK_ROWS } from '@/game/constants';
import type { ShroudChunkInfo } from '@/game/render3d/ChunkShroud3D';
import type { World3D } from '@/game/render3d/World3D';
import { setInfiniteWorld, setStreamedProps, setWorldWindow } from '@/game/world/WorldData';
import type { WorldProp } from '@/game/world/worldSchema';
import {
  CAMP_SPAWN_X,
  CAMP_SPAWN_Y,
  ExplorerWorldSource,
  campKit,
  type BuiltChunk,
  type ChunkFrontier,
} from './explorerWorld';

const WINDOW_RADIUS = 2;

export type PropMemory = { gone?: boolean; lit?: boolean };

export interface ExplorerPropHost {
  spawnStreamedProps(defs: readonly WorldProp[]): void;
  despawnPropsOutside(chunks: ReadonlySet<string>): Array<{ key: string; memory: PropMemory }>;
  syncChunkGates(gates: readonly ChunkFrontier[], enabled: boolean): void;
  spawnBuiltChunkEnemies(cx: number, cy: number): void;
  /** Itens autorados E NPCs do template comprado nascem na hora (o presente + o morador). */
  spawnBuiltChunkContent(cx: number, cy: number): void;
  /** A fonte regenerou o terreno deste chunk: todo cache de colisão baixado dele é mentira. */
  invalidateTerrain(cx: number, cy: number): void;
}

const chunkKey = (cx: number, cy: number): string => `${cx},${cy}`;
const propKey = (prop: { worldX: number; worldY: number }): string => `${prop.worldX},${prop.worldY}`;

export class ExplorerDirector {
  public readonly source: ExplorerWorldSource;
  private centerCx = NaN;
  private centerCy = NaN;
  private loaded = new Set<string>();
  private readonly memory = new Map<string, PropMemory>();
  public rebuilds = 0;
  public lastRebuildMs = 0;

  public constructor(seed: number) { this.source = new ExplorerWorldSource(seed); }

  public install(): void {
    setInfiniteWorld({
      name: 'world-builder',
      playerStart: { worldX: CAMP_SPAWN_X, worldY: CAMP_SPAWN_Y },
      chunk: (cx, cy) => this.source.chunk(cx, cy),
      content: (cx, cy) => this.source.chunkContent(cx, cy),
      heldItems: () => campKit(),
    });
    this.recenter(0, 0);
  }

  public update(playerWorldX: number, playerWorldY: number, host: ExplorerPropHost, world3d?: World3D): boolean {
    const cx = Math.floor(playerWorldX / CHUNK_COLUMNS);
    const cy = Math.floor(playerWorldY / CHUNK_ROWS);
    if (cx === this.centerCx && cy === this.centerCy) return false;
    const previous = new Set(this.loaded);
    this.recenter(cx, cy);
    for (const entry of host.despawnPropsOutside(this.loaded)) {
      this.memory.set(entry.key, { ...(this.memory.get(entry.key) ?? {}), ...entry.memory });
    }
    const fresh: WorldProp[] = [];
    for (const key of this.loaded) {
      if (previous.has(key)) continue;
      const [kx, ky] = key.split(',').map(Number);
      fresh.push(...this.propsFor(kx, ky));
    }
    host.spawnStreamedProps(fresh);
    host.syncChunkGates(this.frontiers(), false);
    if (world3d) {
      this.rebuild(world3d);
      this.syncShroud(world3d);
    }
    return true;
  }

  /**
   * Recobre de escuridão todo chunk não-comprado da janela (+1 anel, para o horizonte não
   * mostrar floresta nua atrás da última mortalha). Chamado no boot ANTES do prewarmShaders —
   * é o que compila os dois programas da mortalha junto com todo o resto — e a cada recentrada
   * ou compra.
   */
  public syncShroud(world3d: World3D): void {
    const radius = WINDOW_RADIUS + 1;
    const covered: ShroudChunkInfo[] = [];
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        const cx = this.centerCx + dx;
        const cy = this.centerCy + dy;
        if (this.source.isBuilt(cx, cy)) continue;
        covered.push({
          cx,
          cy,
          builtN: this.source.isBuilt(cx, cy - 1),
          builtS: this.source.isBuilt(cx, cy + 1),
          builtW: this.source.isBuilt(cx - 1, cy),
          builtE: this.source.isBuilt(cx + 1, cy),
          builtNE: this.source.isBuilt(cx + 1, cy - 1),
          builtNW: this.source.isBuilt(cx - 1, cy - 1),
        });
      }
    }
    world3d.chunkShroud.sync(covered);
  }

  public frontiers(): ChunkFrontier[] { return this.source.frontiers(); }

  public gateAt(worldX: number, worldY: number): ChunkFrontier | undefined {
    return this.source.frontierAt(worldX, worldY);
  }

  public blocksPlayerAt(worldX: number, worldY: number): boolean {
    return !this.source.isBuilt(
      Math.floor(worldX / CHUNK_COLUMNS),
      Math.floor(worldY / CHUNK_ROWS),
    );
  }

  public minCost(): number {
    return Math.min(...this.source.catalog().map((entry) => entry.catalog.cost));
  }

  /**
   * A próxima mão FORÇADA, por id — só para o playtest: com o baralho crescendo (cartas de
   * NPC) o sorteio deixaria o cenário à mercê da sorte. Consumida no uso.
   */
  public debugNextOffers?: string[];

  public offers(): ReturnType<ExplorerWorldSource['catalog']> {
    const catalog = this.source.catalog();
    const forced = this.debugNextOffers;
    if (forced) {
      this.debugNextOffers = undefined;
      const picked = forced
        .map((id) => catalog.find((entry) => entry.catalog.id === id))
        .filter((entry): entry is NonNullable<typeof entry> => entry !== undefined);
      if (picked.length > 0) return picked.slice(0, 3);
    }
    return [...catalog].sort(() => Math.random() - 0.5).slice(0, 3);
  }

  public purchase(
    frontier: ChunkFrontier,
    typeId: string,
    host: ExplorerPropHost,
    world3d?: World3D,
  ): BuiltChunk | null {
    const built = this.source.purchase(frontier, typeId);
    if (!built) return null;
    // O mesmo conjunto que a fonte regenerou (o template novo + as bocas de estrada dos
    // vizinhos): quem guardou o terreno escuro antigo precisa soltá-lo AGORA, senão o chunk
    // comprado nasce com a colisão da floresta que não existe mais — parede invisível.
    host.invalidateTerrain(built.cx, built.cy);
    host.invalidateTerrain(built.cx, built.cy - 1);
    host.invalidateTerrain(built.cx, built.cy + 1);
    host.invalidateTerrain(built.cx - 1, built.cy);
    host.invalidateTerrain(built.cx + 1, built.cy);
    host.spawnStreamedProps(this.propsFor(built.cx, built.cy));
    host.spawnBuiltChunkEnemies(built.cx, built.cy);
    host.spawnBuiltChunkContent(built.cx, built.cy);
    setStreamedProps(this.windowProps());
    if (world3d) {
      this.rebuild(world3d);
      // A ordem importa: reveal() sequestra as malhas do chunk comprado ANTES do sync varrer
      // a cobertura — a névoa dele dissolve da boca da estrada para dentro, enquanto os novos
      // vizinhos já nascem cobertos atrás dela.
      world3d.chunkShroud.reveal(built.cx, built.cy, frontier.enemyX, frontier.enemyY);
      this.syncShroud(world3d);
    }
    return built;
  }

  public windowProps(): WorldProp[] {
    const out: WorldProp[] = [];
    for (const key of this.loaded) {
      const [cx, cy] = key.split(',').map(Number);
      out.push(...this.propsFor(cx, cy));
    }
    return out;
  }

  public remember(prop: { worldX: number; worldY: number }, memory: PropMemory): void {
    const key = propKey(prop);
    this.memory.set(key, { ...(this.memory.get(key) ?? {}), ...memory });
  }

  private propsFor(cx: number, cy: number): WorldProp[] {
    return this.source.chunkProps(cx, cy)
      .filter((prop) => !this.memory.get(propKey(prop))?.gone)
      .map((prop) => this.memory.get(propKey(prop))?.lit ? { ...prop, lit: true } : prop);
  }

  private rebuild(world3d: World3D): void {
    const t0 = performance.now();
    world3d.rebuildTerrain();
    this.lastRebuildMs = performance.now() - t0;
    this.rebuilds += 1;
  }

  private recenter(cx: number, cy: number): void {
    this.centerCx = cx;
    this.centerCy = cy;
    this.loaded = new Set<string>();
    for (let dy = -WINDOW_RADIUS; dy <= WINDOW_RADIUS; dy += 1) {
      for (let dx = -WINDOW_RADIUS; dx <= WINDOW_RADIUS; dx += 1) {
        this.loaded.add(chunkKey(cx + dx, cy + dy));
      }
    }
    setWorldWindow(cx - WINDOW_RADIUS, cy - WINDOW_RADIUS, cx + WINDOW_RADIUS, cy + WINDOW_RADIUS);
    setStreamedProps(this.windowProps());
  }
}

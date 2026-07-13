import { CAMPFIRE_SAFE_RADIUS_TILES } from '@/game/constants';

// Governs the undead siege. Near a campfire nothing ever spawns and the danger meter
// drains. Away from every fire the meter fills — faster the deeper into the dark the hero
// goes — and skulls rise from the ground around the hero at an accelerating pace, until
// staying in the dark becomes unsurvivable.

export type UndeadSpawnQuery = {
  playerWorldX: number;
  playerWorldY: number;
  // Euclidean distance (in tiles) from the hero to the nearest campfire.
  distToFireTiles: number;
  aliveUndead: number;
  // Tile checks live in GameScene (terrain, props, light, occupancy — and reachability:
  // a skull only rises where it could actually walk to the hero).
  canSpawnAt: (wx: number, wy: number) => boolean;
  spawn: (wx: number, wy: number) => void;
};

// Time to fill the danger meter: slow just past the safe ring, fast deep in the dark.
const RAMP_EDGE_MS = 25000;
const RAMP_DEEP_MS = 9000;
// How many tiles past the safe ring counts as "deep".
const DEEP_DARK_TILES = 12;
// Stepping back into safety drains the full meter in ~2.5s.
const DECAY_MS = 2500;

// Spawn cadence and horde size both scale with the meter.
const INTERVAL_CALM_MS = 3200;
const INTERVAL_FRENZY_MS = 650;
const MAX_UNDEAD_AT_FULL_DANGER = 4;

// Skulls rise in a ring around the hero: outside the hero's light, close enough to attack.
// The max is exported: GameScene's reachability flood-fill (a spawn tile must have a walkable
// path to the hero) uses it to bound its search area.
const RING_MIN_TILES = 4;
export const RING_MAX_TILES = 7;
const PLACEMENT_TRIES = 14;

export class UndeadSpawnDirector {
  // 0 = calm, 1 = the dark is fully awake.
  private dangerLevel = 0;
  private spawnTimer = 0;

  public get danger(): number {
    return this.dangerLevel;
  }

  public update(delta: number, query: UndeadSpawnQuery): void {
    const safe = query.distToFireTiles <= CAMPFIRE_SAFE_RADIUS_TILES;
    if (safe) {
      this.dangerLevel = Math.max(0, this.dangerLevel - delta / DECAY_MS);
      this.spawnTimer = 0;
      return;
    }

    const depth = Math.min((query.distToFireTiles - CAMPFIRE_SAFE_RADIUS_TILES) / DEEP_DARK_TILES, 1);
    const rampMs = RAMP_EDGE_MS + (RAMP_DEEP_MS - RAMP_EDGE_MS) * depth;
    this.dangerLevel = Math.min(1, this.dangerLevel + delta / rampMs);

    const cap = Math.max(1, Math.round(this.dangerLevel * MAX_UNDEAD_AT_FULL_DANGER));
    if (query.aliveUndead >= cap) return;

    this.spawnTimer += delta;
    const interval = INTERVAL_CALM_MS + (INTERVAL_FRENZY_MS - INTERVAL_CALM_MS) * this.dangerLevel;
    if (this.spawnTimer < interval) return;

    for (let attempt = 0; attempt < PLACEMENT_TRIES; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = RING_MIN_TILES + Math.random() * (RING_MAX_TILES - RING_MIN_TILES);
      const wx = Math.round(query.playerWorldX + Math.cos(angle) * radius);
      const wy = Math.round(query.playerWorldY + Math.sin(angle) * radius);
      if (query.canSpawnAt(wx, wy)) {
        query.spawn(wx, wy);
        this.spawnTimer = 0;
        return;
      }
    }
    // Every candidate tile was blocked/lit — keep the timer pinned and retry next frame.
    this.spawnTimer = interval;
  }
}

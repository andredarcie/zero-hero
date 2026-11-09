// O FOGO DO VALE: a chama que passa de um tile ao vizinho, o graveto aceso largado no chão, acender uma fogueira, as
// fogueiras que seguem o relógio e os vizinhos que as cuidam.

import * as Engine from '@/game/engine';
import { isNightTime } from '@/game/runtime/timeOfDay';
import { CampfireObject } from '@/game/objects/CampfireObject';
import { getSoundManager } from '@/game/audio/SoundManager';
import { FireVisitor } from '@/game/entities/FireVisitor';
import type { GameScene } from '../GameScene';
import { CARDINAL_DIRS } from './sceneDefs';

// How long a burning tile takes to set its neighbours alight. Slow enough that the fire is a
// thing you WATCH travel, fast enough that a fuse pays off inside one held thought. See
// GameScene.scheduleFireSpread.
const FIRE_SPREAD_MS = 850;
/** Até onde o herói vê o vizinho acendendo o fogo: além disso a fogueira só aparece acesa. */
const FIRE_KEEPER_SEEN_TILES = 22;
/** O vizinho abaixado, riscando o fogo, antes da primeira chama. */
const FIRE_KEEPER_STRIKE_MS = 900;
/** Da primeira chama até a fogueira inteira. */
const FIRE_KINDLE_MS = 8000;

export class FireSpread {
  // As fogueiras que um pedido deixou acesas para sempre (a do Marco): o relogio nao as apaga.
  public readonly keptLitFires = new Set<CampfireObject>();
  /** O vizinho indo acender a fogueira dele (ver fireKeeperLights). */
  public readonly fireKeepers = new Map<CampfireObject, { visitor: FireVisitor; timers: Engine.Time.TimerEvent[] }>();

  public constructor(private readonly host: GameScene) {}

  public lightCampfire(cf: CampfireObject, wx: number, wy: number): void {
    if (cf.isLit) return;
    this.host.delivery.questEvent({ type: 'light' });
    if (!cf.light()) return;
    getSoundManager().nature.playIgnite();
    this.host.sparkle.spawnFireHitEffect(wx, wy);
    this.host.sparkle.softWash(0xffc86e, 0.12, 900);
  }

  // ── Fire spread ────────────────────────────────────────────────────────────
  // Fire is the one system in this world the player STEERS instead of unlocks. Everything
  // else here is a lock and a key — bump the rock with the pickaxe, the tree with the axe —
  // a 1:1 table with exactly one right answer. Fire is
  // different: it travels on its own, through whatever will carry it, and it does not care
  // what you still needed. So the question stops being "which item?" and becomes "what will
  // this reach, and what do I have to cut away first so it doesn't?".
  //
  // The fuel graph is: tall grass, dry bushes, and BUILT BRIDGES (they are wood — see
  // WaterObject.burn). Stone, water, lava and bare ground are firebreaks; the scythe and the
  // axe MAKE firebreaks, which is what finally gives them a use beyond opening their own tile.
  //
  // A DEAD CAMPFIRE catches from an adjacent flame — that is the whole point. It means a fire
  // can be lit WITHOUT the hero ever standing next to it: lay a path of fuel and let the fire
  // walk there. But a LIT campfire never spreads outward: it is a sink, not a source.
  // Otherwise every hearth in the world would set its own meadow alight the moment it was lit.
  public scheduleFireSpread(wx: number, wy: number): void {
    this.host.time.delayedCall(FIRE_SPREAD_MS, () => {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        this.igniteFlammableAt(wx + dx, wy + dy);
      }
    });
  }

  /**
   * A versao CONDICIONAL do scheduleFireSpread, para um graveto ACESO pousado no chao. Um
   * arbusto que agendou espalhamento ainda esta queimando quando o fusivel de FIRE_SPREAD_MS
   * vence — mas um ITEM pode ter sido recolhido nesse meio-tempo, e fogo nao nasce de um tile vazio.
   * O teste no DISPARO (hasLitItemAt) tambem cobre o caso-borda do deposito com combustivel
   * exatamente zero: pousa como madeira apagada e nao arma espalhamento nenhum.
   */
  public scheduleGroundTorchSpread(wx: number, wy: number): void {
    this.host.time.delayedCall(FIRE_SPREAD_MS, () => {
      if (!this.host.itemManager?.hasLitItemAt(wx, wy)) return;
      for (const [dx, dy] of CARDINAL_DIRS) {
        this.igniteFlammableAt(wx + dx, wy + dy);
      }
    });
  }

  /**
   * Set alight whatever burns on this tile, and chain the spread onward from it. Each object's
   * own ignite() refuses if it is already burning or spent, which is what terminates the chain.
   * Returns true if something caught here.
   */
  private igniteFlammableAt(wx: number, wy: number): boolean {
    const bush = this.host.query.getDryBushAt(wx, wy);
    if (bush?.ignite()) {
      this.host.sparkle.spawnFireHitEffect(wx, wy);
      this.scheduleFireSpread(wx, wy);
      return true;
    }

    const grass = this.host.query.getTallGrassAt(wx, wy);
    if (grass?.ignite()) {
      this.host.sparkle.spawnFireHitEffect(wx, wy);
      this.scheduleFireSpread(wx, wy);
      return true;
    }

    // A bridge is wood: it carries the flame across the water and is eaten doing it.
    const water = this.host.query.getWaterAt(wx, wy);
    if (water?.burn()) {
      this.host.sparkle.spawnFireHitEffect(wx, wy);
      this.scheduleFireSpread(wx, wy);
      return true;
    }

    // The destination. Fire stops here — a lit hearth does not go on to burn the world down.
    const campfire = this.host.query.getCampfireAt(wx, wy);
    if (campfire && !campfire.isLit) {
      this.lightCampfire(campfire, wx, wy);
      return true;
    }

    return false;
  }

  /** Apply sunrise/sunset to every ambient fire once per transition, never every frame. */
  public syncCampfiresToClock(): void {
    const night = isNightTime();
    if (night === this.host.props.campfiresFollowNight) return;
    this.host.props.campfiresFollowNight = night;
    for (const campfire of this.host.props.campfires) {
      if (this.keptLitFires.has(campfire)) continue; // aceso por um pedido: o dia nao o apaga
      if (night) {
        this.fireKeeperLights(campfire);
      } else {
        this.dismissFireKeeper(campfire);
        campfire.setClockLit(false);
      }
    }
  }

  /**
   * QUANDO ANOITECE, O VIZINHO VAI ACENDER A FOGUEIRA DELE. Ele contorna até o lado oposto (colado no fogo como mora, sem
   * isso não haveria caminhada, e na frente ele cobriria a chama), se abaixa, e o fogo pega aos poucos. Quem o herói não
   * está vendo não anda: a fogueira só aparece acesa quando ele chegar.
   */
  private fireKeeperLights(fire: CampfireObject): void {
    const hero = this.host.playerWorld;
    const seen = Math.hypot(hero.worldX - fire.worldX, hero.worldY - fire.worldY) <= FIRE_KEEPER_SEEN_TILES;
    const owner = seen && !fire.isLit && !fire.isHeldCold && !this.fireKeepers.has(fire)
      ? this.host.npcManager?.getActiveWorldPositions().find(
        (n) => Math.max(Math.abs(n.worldX - fire.worldX), Math.abs(n.worldY - fire.worldY)) === 1,
      )
      : undefined;
    if (!owner) {
      fire.setClockLit(true);
      return;
    }
    const home: [number, number] = [owner.worldX, owner.worldY];
    const across: [number, number] = [fire.worldX * 2 - home[0], fire.worldY * 2 - home[1]];
    const seats: Array<[number, number]> = [across];
    for (const [ox, oy] of [[0, 1], [1, 0], [-1, 0], [0, -1]] as const) seats.push([fire.worldX + ox, fire.worldY + oy]);
    const free = seats.filter(([x, y]) => !(x === home[0] && y === home[1])
      && !(x === hero.worldX && y === hero.worldY)
      && !this.host.query.isSolidForEntities(x, y) && !this.host.itemManager?.hasItemAt(x, y));
    const path = (free.length > 0 && this.host.camp.visitPath(home, free, [hero.worldX, hero.worldY], [fire.worldX, fire.worldY])) || [home];
    this.host.npcManager?.setKindAway(owner.kind, true);
    const visitor = new FireVisitor(this.host, owner.kind, path);
    const keeper = { visitor, timers: [] as Engine.Time.TimerEvent[] };
    this.fireKeepers.set(fire, keeper);
    visitor.arrive(() => {
      if (this.fireKeepers.get(fire) !== keeper) return;
      keeper.timers.push(this.host.time.delayedCall(FIRE_KEEPER_STRIKE_MS, () => {
        if (fire.kindle(FIRE_KINDLE_MS)) getSoundManager().nature.playIgnite();
        keeper.timers.push(this.host.time.delayedCall(FIRE_KINDLE_MS * 0.6, () => this.dismissFireKeeper(fire)));
      }));
    });
  }

  /** Ele levanta e volta para casa. Se a manhã chegou antes, a fogueira nem chega a acender. */
  private dismissFireKeeper(fire: CampfireObject): void {
    const keeper = this.fireKeepers.get(fire);
    if (!keeper) return;
    this.fireKeepers.delete(fire);
    for (const timer of keeper.timers) timer.remove();
    const { kind } = keeper.visitor;
    keeper.visitor.leave(() => {
      // A abertura de uma cena pode ter chamado este mesmo vizinho enquanto ele voltava.
      if (this.host.questSetup.fireVisitor?.kind === kind || this.host.questSetup.skyVisitor?.kind === kind) return;
      this.host.npcManager?.setKindAway(kind, false);
    });
  }
}

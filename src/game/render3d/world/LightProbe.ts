// AS PERGUNTAS À LUZ DO MUNDO 3D: a fogueira acesa mais perto, os sólidos ao alcance de uma chama (em cache), se um
// tile está aceso, quanto de luz chega a ele, e a sombra que cai num ponto do chão.

import { castTransformInto, handoffCastInto } from '../CastShadow3D';
import type { SolidTileEntry, FireEntry } from './TerrainData';
import type { World3D } from '../World3D';

// How far a full-strength flame still counts as "lighting" a point, for lightLevelAt. Tiles.
const LIGHT_SAMPLE_REACH = 5.5;
/**
 * O quanto o SOL já acende qualquer lugar do mundo, para `lightLevelAt`. Não é 1: mesmo ao
 * meio-dia a fogueira tem de ter para onde subir, senão chegar perto do fogo com a espada na mão
 * deixa de mudar alguma coisa e o único desenho que o arco faz da luz do mundo morre.
 */
const DAYLIGHT_SWING_FLOOR = 0.82;
/** Anything that remembers which flame last threw its shadow (heading hysteresis).
 *  Exported as an opaque handle: long-lived groundCastAt callers (the robotic arm) hold
 *  one so their shadow's heading gets the same hysteresis the billboard casters have. */
export interface CastMemory {
  lastFire?: FireEntry | 'torch' | null;
}

/** O que LightProbe usa de World3D. */
export type LightProbeHost = Pick<World3D, 'casts' | 'hero' | 'lights' | 'moonCastRotY' | 'params' | 'tiles'>;

export class LightProbe {
  private readonly groundCastFallback: CastMemory = {};

  /** Per-lit-fire candidate solids within castShadowRadius. Fires never move, so this is
   *  built once per fire (and dropped when a tree falls / the radius knob turns) instead
   *  of scanning every castable solid × every fire × every frame — the old hottest loop. */
  public readonly fireCastLists = new Map<FireEntry, SolidTileEntry[]>();
  public fireListRadius = -1;

  public constructor(private readonly host: LightProbeHost) {}

  /**
   * The ground-shadow projection at (x, z), for objects that must cast their OWN silhouette
   * (an articulated machine whose parts float between joints — no sprite stands at any tile,
   * so the per-billboard cast is unusable). Returns the same stylization every standing prop
   * uses — nearest lit flame with the moon handoff at the pool's edge (castTransform /
   * handoffCast) — reduced to what a projector needs: the ground DIRECTION the shadow runs
   * along, how far one tile of height lands along it (`unitLen`), and the darkness. A world
   * point at elevation e therefore shadows at `plan(P) + dir · e · unitLen` — which is exactly
   * where the standing sprites' stretched silhouettes put their pixels, so a projected chain
   * GROWS OUT of its base's own cast shadow instead of contradicting it.
   */
  public groundCastAt(
    x: number,
    z: number,
    memory?: CastMemory,
  ): { dirX: number; dirZ: number; unitLen: number; alpha: number } | null {
    const radius = Math.max(0.5, this.host.params.castShadowRadius);
    const heightScale = 2.2 / Math.max(0.5, this.host.params.shadowHeight);
    // Callers that live across frames (the robotic arm) pass their own memory so the
    // heading hysteresis holds for them too; a memory-less call gets a fresh (reset)
    // holder — hysteresis needs history, and a shared default would leak one caller's
    // incumbent flame into another's.
    const mem = memory ?? this.groundCastFallback;
    if (!memory) mem.lastFire = null;
    // Same rule as the actors: standing on a lit fire tile has no stable heading.
    const fromFire = !this.onLitFireTile(x, z)
      && this.nearestLitFireInto(x, z, mem, this.host.casts.nearestScratch)
      && castTransformInto(
        this.host.casts.fireCastScratch, x, z, 1,
        this.host.casts.nearestScratch.worldX, this.host.casts.nearestScratch.worldY, this.host.casts.nearestScratch.level,
        radius, this.host.params.castShadowAlpha, heightScale,
      );
    if (!handoffCastInto(
      this.host.casts.castScratch, fromFire ? this.host.casts.fireCastScratch : null,
      this.host.moonCastRotY, this.host.params.moonShadowLength, this.host.params.moonShadowAlpha,
    )) return null;
    const cast = this.host.casts.castScratch;
    // The heading is stored as a quad rotation (head along -Z); the ground vector is its image.
    return { dirX: -Math.sin(cast.rotY), dirZ: -Math.cos(cast.rotY), unitLen: cast.length, alpha: cast.alpha };
  }

  /**
   * How LIT a world point is: 0 = moonlight only, 1 = standing in a flame.
   *
   * This exists for the 2D overlay, which is drawn on the 2D canvas ABOVE the 3D world and
   * therefore receives none of its lighting, none of its tone mapping and none of the night
   * grade. The swing arc is the last world object still living there, and unlit it renders at
   * FULL art brightness over a night-dark world — which is why the steel axe, whose palette is
   * light greys and bone, swung like a lightbulb while the hero holding it was in shadow.
   *
   * A cheap STAND-IN for the shader, deliberately not a second copy of it: the nearest lit flame
   * (the same `litFires` set the cast shadows rank each frame, plus the carried torch) with a
   * linear falloff. It only has to land the sprite in the same value range as the hero swinging
   * it — anything more faithful would be a second lighting model to keep in sync.
   */
  public lightLevelAt(x: number, y: number): number {
    // DE DIA O PISO NÃO É ZERO. A chama é a única luz que este cálculo conhece, e isso está certo
    // à noite — longe do fogo o arco tem mesmo de escurecer. Ao meio-dia a mesma conta devolvia 0
    // no campo aberto e a espada saía como um borrão escuro por cima de um mundo batido de sol: o
    // "branco estourado" ao contrário, e pelo mesmo motivo (o traço não recebe a luz da cena).
    // O sol não tem posição para consultar — ele bate em tudo —, então ele é um PISO.
    let best = DAYLIGHT_SWING_FLOOR * this.host.params.daylight;
    const consider = (fx: number, fy: number, level: number): void => {
      const reach = LIGHT_SAMPLE_REACH * Math.max(0.2, level);
      const d = Math.hypot(fx - x, fy - y);
      best = Math.max(best, 1 - Math.min(1, d / reach));
    };
    for (const f of this.host.lights.litFires) consider(f.worldX, f.worldY, f.level);
    // The torch is the one light that rides the hero, so it is the one that most often decides
    // how a swing of his should read.
    if (this.host.hero.torch.strength > 0.15) consider(this.host.hero.torch.x, this.host.hero.torch.y, this.host.hero.torch.level);
    return best;
  }

  /**
   * The lit light source closest to a world tile (null if none reaches it), for
   * cast-shadow aim. The carried TORCH counts too — a lit torch throws shadows off
   * objects just like a campfire — but it's skipped for whatever holds it (dist
   * ≈ 0), so the hero never casts a shadow from the flame in his own hand.
   */
  /**
   * The flame that owns `holder`'s shadow this frame, written into `out` (no allocation —
   * this runs once per caster and once per candidate solid, every frame). Squared
   * distances throughout; `litFires` was filtered for this frame in render().
   *
   * `holder.lastFire` is the heading HYSTERESIS (P5): midway between two lit fires the
   * nearest one flips with the flames' breathing, and the shadow used to snap direction
   * with it. The incumbent keeps the caster until a challenger is castHysteresis× closer.
   */
  public nearestLitFireInto(
    x: number,
    y: number,
    holder: CastMemory,
    out: { worldX: number; worldY: number; level: number },
  ): boolean {
    let best: FireEntry | 'torch' | null = null;
    let bestD2 = Infinity;
    for (const f of this.host.lights.litFires) {
      const dx = f.worldX - x;
      const dy = f.worldY - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { bestD2 = d2; best = f; }
    }
    let torchD2 = Infinity;
    if (this.host.hero.torch.strength > 0.15) {
      const dx = this.host.hero.torch.x - x;
      const dy = this.host.hero.torch.y - y;
      torchD2 = dx * dx + dy * dy;
      // The torch is skipped for whatever holds it (d ≈ 0), so the hero never casts a
      // shadow from the flame in his own hand.
      if (torchD2 > 0.36 && torchD2 < bestD2) { best = 'torch'; bestD2 = torchD2; }
    }
    if (!best) {
      holder.lastFire = null;
      return false;
    }

    const hyst = this.host.params.castHysteresis;
    const prev = holder.lastFire;
    if (prev && prev !== best && hyst < 1) {
      let prevD2 = Infinity;
      if (prev === 'torch') {
        if (this.host.hero.torch.strength > 0.15 && torchD2 > 0.36) prevD2 = torchD2;
      } else if (prev.lit && prev.scale > 0.05) {
        const dx = prev.worldX - x;
        const dy = prev.worldY - y;
        prevD2 = dx * dx + dy * dy;
      }
      // Keep the incumbent unless the challenger is clearly closer (ratio² on squared d).
      if (prevD2 !== Infinity && bestD2 > prevD2 * hyst * hyst) best = prev;
    }
    holder.lastFire = best;

    if (best === 'torch') {
      out.worldX = this.host.hero.torch.x;
      out.worldY = this.host.hero.torch.y;
      out.level = this.host.hero.torch.level;
    } else {
      out.worldX = best.worldX;
      out.worldY = best.worldY;
      out.level = best.level;
    }
    return true;
  }

  /** Per-lit-fire candidate solids, built once per fire — fires never move (see the field).
   *  Over every standing tile, not just the exposed ones — see the bucket note in buildTerrain. */
  public listForFire(f: FireEntry, radius: number): SolidTileEntry[] {
    let list = this.fireCastLists.get(f);
    if (!list) {
      list = [];
      const r2 = radius * radius;
      for (const t of this.host.tiles.solidTiles) {
        const dx = t.x - f.worldX;
        const dz = t.z - f.worldY;
        if (dx * dx + dz * dz <= r2) list.push(t);
      }
      this.fireCastLists.set(f, list);
    }
    return list;
  }

  /**
   * True when a caster is standing ON a lit fire tile (now possible: the hero walks lava with the
   * boots, or a stone-capped lava tile that keeps its glow). A directional cast shadow makes no
   * sense there — "point away from the flame" is atan2(≈0,≈0) at the fire underfoot, and among a
   * ring of equal fires the nearest one flips with the hero's breathing bob — both strobe the
   * silhouette. So on a fire tile we drop the directional cast and let the contact blob be the
   * shadow (see updateCastShadows). ≈0.6 tiles, the same radius the torch-holder guard uses.
   */
  public onLitFireTile(x: number, y: number): boolean {
    for (const f of this.host.lights.litFires) {
      const dx = f.worldX - x;
      const dy = f.worldY - y;
      if (dx * dx + dy * dy < 0.36) return true;
    }
    return false;
  }
}

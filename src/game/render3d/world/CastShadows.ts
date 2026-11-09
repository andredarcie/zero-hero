// AS SOMBRAS DE FOGO, A CADA QUADRO: quem está perto de uma chama acesa (pelo índice de baldes do terreno), quem a
// câmera vê, e a sombra de cada um no campo instanciado — com a passagem para a lua quando o fogo some.

import * as THREE from 'three';
import { terrainHeightAt } from '@/game/world/relief';
import { applyCast, castTransformInto, handoffCastInto } from '../CastShadow3D';
import { frameFootPad, getTexture3D } from '../textures3d';
import type { World3D } from '../World3D';
import { Billboard3D } from '../Billboard3D';
import { type CastPose } from '../CastShadow3D';
import { type CastMemory } from './LightProbe';
import { CAST_REACH_TILES, MIN_CAST_LEN } from './worldDefs';


/** O que CastShadows usa de World3D. */
export type CastShadowsHost = Pick<World3D,
  'appliedMoonShadow' | 'camTarget' | 'emit' | 'hero' | 'isNearView' | 'lights' | 'moonCastRotY' | 'moonDimmed' | 'params' | 'probe' | 'shadows' | 'terrain' | 'tiles'
>;

export class CastShadows {
  /** Monotonic id stamped on tiles as the cast pass visits them (cross-list dedupe). */
  private castFrameId = 0;

  // ── firelight cast shadows (2D ground silhouettes) ──
  // One persistent silhouette per dynamic caster (hero, props, NPCs)…
  public readonly castCasters: Array<{
    bb: Billboard3D;
    mesh: THREE.Mesh;
    /** The decal material the mesh was born with, and the mask-RT variant — the
     *  shadowMask toggle swaps them (both programs compiled at boot). */
    sceneMat: THREE.Material;
    maskMat: THREE.Material;
  } & CastMemory> = [];
  // NOTA: aqui viviam os CAMPOS INSTANCIADOS de silhueta de ator (um por sprite sheet), com um
  // opt-in publico (`enableActorCastBatching`) e um limiar de 3 casters. Eles existiam para UMA
  // coisa: a horda do modo Sobreviventes, cujas ~100 caveiras eram ~100 draws de sombra. O modo
  // saiu do jogo, e com ele o unico chamador do opt-in — o conjunto ficava vazio para sempre e
  // todo o caminho era codigo morto atras de um `if`. A aventura NUNCA batchou de proposito:
  // dobrar N quads ordenados individualmente num mesh so muda a ordem da fila transparente, e
  // portanto a mistura com o fog (o mato alto batchou sozinho uma vez e as fotos de referencia
  // pegaram a diferenca). Se um dia voltar a existir uma horda, o que volta e isto, com o opt-in.
  // ── the cast pass's reusable scratch (zero per-frame allocation — see plano.md P8) ──
  public readonly fireCastScratch: CastPose = { length: 0, rotY: 0, alpha: 0 };
  public readonly castScratch: CastPose = { length: 0, rotY: 0, alpha: 0 };
  public readonly nearestScratch = { worldX: 0, worldY: 0, level: 0 };

  public constructor(private readonly host: CastShadowsHost) {}

  /**
   * Lay down each caster's black silhouette pointing away from its nearest flame —
   * or along the moon's heading where no flame reaches (see CastShadow3D.ts).
   * Dynamic casters (hero/props/NPCs) each own a mesh; static solid tiles
   * borrow from a pool, so only those near a lit fire this frame consume one.
   */
  public updateCastShadows(): void {
    const radius = Math.max(0.5, this.host.params.castShadowRadius);
    const alpha = this.host.params.castShadowAlpha;
    const moonAlpha = this.host.params.moonShadowAlpha;
    const moonLength = this.host.params.moonShadowLength;
    // The shadowHeight knob made honest (0d): it always promised "higher light = shorter
    // shadows" but only ever moved the LIGHT. Normalized so the tuned default (2.2) is
    // exactly the old behaviour.
    const heightScale = 2.2 / Math.max(0.5, this.host.params.shadowHeight);
    // Live tuning (window.hd3d): the statics' moon field is baked, so a knob move re-bakes it.
    if (moonAlpha !== this.host.appliedMoonShadow.alpha || moonLength !== this.host.appliedMoonShadow.length
      || this.host.moonCastRotY !== this.host.appliedMoonShadow.rotY) {
      this.host.terrain.fillMoonCastField();
    }
    // A barra dos maciços tem os MESMOS dois knobs, e re-assa junto: se ela ficasse para trás, o
    // dia clarearia a sombra de uma árvore e deixaria a do muro ao lado na noite.
    // Só o rumo e o comprimento mudam a geometria; a escuridão é a opacidade do material, e o dia
    // mexe nela sem parar.
    if (moonLength !== this.host.shadows.appliedMassShadow.length || this.host.moonCastRotY !== this.host.shadows.appliedMassShadow.rotY) {
      this.host.shadows.massBake = this.host.shadows.startMassShadowBake();
    } else if (moonAlpha !== this.host.shadows.appliedMassShadow.alpha) {
      this.host.shadows.appliedMassShadow.alpha = moonAlpha;
      if (this.host.shadows.massShadowMesh) (this.host.shadows.massShadowMesh.material as THREE.MeshBasicMaterial).opacity = moonAlpha;
    }
    this.host.shadows.tickMassShadowBake();

    // Restore the moon instances the statics' handoff dimmed last frame (2d) — the pass
    // below re-dims whichever still sit inside a lit pool.
    if (this.host.moonDimmed.length > 0) {
      const full = this.host.appliedMoonShadow.alpha;
      for (const tile of this.host.moonDimmed) {
        if (tile.moonSlot !== undefined) this.host.tiles.moonCastField.setInstanceAlpha(tile.moonSlot, full);
      }
      this.host.moonDimmed.length = 0;
    }

    // ── dynamic casters ── um mesh por ator, ordenado individualmente (ver a nota nos campos).
    for (let i = this.castCasters.length - 1; i >= 0; i--) {
      const c = this.castCasters[i];
      if (!c.bb.active) { // the billboard was destroyed — drop its shadow
        c.mesh.removeFromParent(); // scene or maskScene, whichever mode holds it
        c.mesh.geometry.dispose();
        c.sceneMat.dispose();
        c.maskMat.dispose();
        this.castCasters.splice(i, 1);
        continue;
      }
      if (!c.bb.visible) { c.mesh.visible = false; continue; }
      // Longe da tela, a sombra não alcança a tela: nem calcula. No quadro em que ele chega perto,
      // ela é recalculada do estado de agora — nada nela depende do quadro anterior.
      if (!this.host.isNearView(c.bb.x, c.bb.y, CAST_REACH_TILES)) { c.mesh.visible = false; continue; }
      const height = Math.abs(c.bb.scaleY);
      // Standing ON a lit fire tile gives no stable heading (the flame is underfoot, and a ring of
      // equal fires flips which is "nearest" with every bob) — so drop the directional cast there
      // and let the contact blob carry the shadow. Otherwise: point away from the nearest flame.
      const fromFire = !this.host.probe.onLitFireTile(c.bb.x, c.bb.y)
        && this.host.probe.nearestLitFireInto(c.bb.x, c.bb.y, c, this.nearestScratch)
        && castTransformInto(
          this.fireCastScratch, c.bb.x, c.bb.y, height,
          this.nearestScratch.worldX, this.nearestScratch.worldY, this.nearestScratch.level,
          radius, alpha, heightScale,
        );
      if (!handoffCastInto(
        this.castScratch, fromFire ? this.fireCastScratch : null,
        this.host.moonCastRotY, moonLength * height, moonAlpha,
      )) { c.mesh.visible = false; continue; }
      const cast = this.castScratch;

      // A sprite spun in the camera plane (the bomb's wobble) turns its silhouette with
      // it (2e) — the quad has no yaw, so the spin IS the ground rotation, mirrored.
      let rotY = cast.rotY;
      const spin = c.bb.mesh.rotation.z;
      if (spin !== 0) rotY -= spin;

      // Steer the sprite's mask-receive probe toward its own light (opposite the cast
      // heading): sampling there keeps a caster out of its OWN silhouette, which starts
      // exactly at its feet. Costs two writes; only read while hd3d.shadowMask is on.
      c.bb.maskProbe.value.set(Math.sin(rotY) * 0.45, Math.cos(rotY) * 0.45);

      // Elevation (2a): a lifted caster's silhouette slides away from the light and
      // thins — the same projection the arm's skeleton shadow already used (groundCastAt),
      // now the rule for every caster. Sells the walk bob, the loot arc, the ITEM GET.
      let ax = c.bb.x;
      let az = c.bb.y;
      // A silhueta EXISTE tanto quanto o dono dela. Sem isto, um corpo que apaga (o heroi
      // entrando na escada, um bicho sumindo) deixa a propria sombra de fogueira estampada no
      // chao a plena forca — o mesmo defeito que o blob de contato tinha, so que projetado.
      let a = cast.alpha * c.bb.alpha;
      const elev = c.bb.elevation * this.host.params.castElevation;
      if (elev > 0) {
        const unit = cast.length / Math.max(0.05, height);
        ax -= Math.sin(rotY) * elev * unit;
        az -= Math.cos(rotY) * elev * unit;
        a /= 1 + 1.2 * elev;
      }

      // The silhouette stops at the water's edge instead of floating over the channel (2b).
      // Floored at MIN_CAST_LEN, unlike the statics' path: a static keeps a separate baked
      // moon instance when its fire cast is dropped, but an actor owns exactly ONE quad, so
      // cutting it to a stub would leave the hero standing on the bank with no shadow at
      // all. A shadow overhanging the water by half a tile is the lesser wrong.
      let length = cast.length;
      if (this.host.params.castWaterClamp > 0) {
        const clamped = this.host.emit.clampCastAtSunken(ax, az, rotY, length);
        if (clamped < length) {
          length = Math.max(MIN_CAST_LEN, clamped);
          a *= 0.6;
        }
      }

      const width = Math.abs(c.bb.scaleX);
      applyCast(
        c.mesh, ax, az, getTexture3D(c.bb.texKey, c.bb.frame), c.bb.flipX,
        width, length, rotY, a,
        frameFootPad(c.bb.texKey, c.bb.frame),
        terrainHeightAt(c.bb.x, c.bb.y),
      );
    }

    // ── static solid tiles (trees/walls) near a lit flame — one instanced draw ──
    // Candidates come from the per-fire lists plus the torch's spatial buckets (P8): the
    // world is never scanned per frame any more. `mark` dedupes a tile two flames reach.
    const field = this.host.tiles.solidCastField;
    field.begin();
    const torchLive = this.host.hero.torch.strength > 0.15;
    if (torchLive || this.host.lights.litFires.length > 0) {
      if (this.host.probe.fireListRadius !== radius) { // the radius knob moved — the lists are stale
        this.host.probe.fireCastLists.clear();
        this.host.probe.fireListRadius = radius;
      }
      this.castFrameId += 1;
      const id = this.castFrameId;
      for (const f of this.host.lights.litFires) {
        // Uma fogueira só projeta sombra até `radius` dela; somado ao alcance da sombra, é o
        // máximo que ela pode desenhar longe de si. Mais longe que isso da tela, nada dela aparece.
        if (!this.host.isNearView(f.worldX, f.worldY, radius + CAST_REACH_TILES)) continue;
        const list = this.host.probe.listForFire(f, radius);
        for (const tile of list) {
          if (tile.mark === id) continue;
          if (!this.host.isNearView(tile.x, tile.z, CAST_REACH_TILES)) continue;
          tile.mark = id;
          this.host.emit.emitSolidCast(tile, radius, alpha, heightScale, moonAlpha);
        }
      }
      if (torchLive) {
        const r2 = radius * radius;
        const bx0 = (Math.round(this.host.hero.torch.x - radius) + 4096) >> 2;
        const bx1 = (Math.round(this.host.hero.torch.x + radius) + 4096) >> 2;
        const bz0 = (Math.round(this.host.hero.torch.y - radius) + 4096) >> 2;
        const bz1 = (Math.round(this.host.hero.torch.y + radius) + 4096) >> 2;
        for (let bx = bx0; bx <= bx1; bx++) {
          for (let bz = bz0; bz <= bz1; bz++) {
            const bucket = this.host.tiles.solidBuckets.get(bx * 16384 + bz);
            if (!bucket) continue;
            for (const tile of bucket) {
              if (tile.mark === id) continue;
              const dx = tile.x - this.host.hero.torch.x;
              const dz = tile.z - this.host.hero.torch.y;
              if (dx * dx + dz * dz > r2) continue;
              tile.mark = id;
              this.host.emit.emitSolidCast(tile, radius, alpha, heightScale, moonAlpha);
            }
          }
        }
      }
    }
    field.end(this.host.camTarget.x, this.host.camTarget.z);
  }
}

import * as THREE from 'three';

import { makeShadowBlob } from './groundShadow';
import { patchPixelMaterial } from './pixelArtLight';
import { getTexture3D } from './textures3d';

// ── A world sprite in the 3D renderer, with a Phaser-sprite-like surface ──────
//
// The game's object classes render by calling sprite methods every frame
// (setPosition / setDisplaySize / setTint / setAlpha / setVisible / setTexture)
// and juice their sprites with Phaser tweens that mutate plain numeric props
// (scaleX, scaleY, alpha, angle, x, y). This adapter exposes the same surface
// over a THREE mesh, so the migration mostly swaps the object a class holds —
// the render/tween code keeps its shape.
//
// Billboards are LIT by the world's real lights (fires, hero glow, torch) with
// the pixel-art treatment (quantized bands — see pixelArtLight.ts), lit
// uniformly by the ground at their feet. `emissive`/`additive` opt out into a
// full-bright unlit material (flames, lava, glows, pickups).
//
// Units are TILES, not pixels: position (x, y) is the world tile coordinate
// (y = the game's worldY = 3D z), sizes are in tile fractions. Upright
// billboards anchor at the FOOT (bottom-centre sits on the ground at its tile);
// flat quads lie on the ground slightly above it.

/**
 * DEPTH LAYERS — the fix for two sprites that share a tile.
 *
 * Every upright billboard is a camera-facing quad. Two of them at the same tile are therefore
 * EXACTLY COPLANAR, and a depth test between coplanar surfaces has no winner: the result comes
 * down to floating-point noise, so it flips per pixel and per frame and the pair strobes — the
 * hero standing on an item, and the item blinking out through his boots. That is not a bug in
 * any one prop; it is what coplanar geometry DOES, which is why it kept coming back each time
 * it was patched prop by prop with a hand-placed nudge.
 *
 * So the order is DECLARED instead of left to the GPU. Anything the hero can stand ON sits in
 * the `ground` layer, a hair further from the camera; actors keep the tile's true depth. The
 * offset rides the view axis (worldY is the 3D z, and the camera sits at +z looking toward -z —
 * see World3D.updateCamera — so subtracting worldY pushes a sprite AWAY), and it is orders of
 * magnitude above depth-buffer precision, so the winner is the same on every frame and every
 * GPU. It is the same trick the pickup outline has always used, promoted to a rule.
 *
 * The nudge is along the CAMERA axis, so on screen it costs a pixel or two of vertical shift —
 * the item reads as sitting a touch behind the hero's feet, which is exactly the truth.
 */
export const DEPTH_LAYER = {
  /** Owns its tile: hero, enemies, NPCs, trees, rocks, standing grass. The default. */
  actor: 0,
  /** Walkable clutter: ground items, spot marks, planted bombs, cut stubble. */
  ground: 0.06,
} as const;
export type DepthLayerName = keyof typeof DEPTH_LAYER;

export interface Billboard3DOptions {
  /**
   * Which depth layer this sprite belongs to (default `actor`). Pass `ground` for ANYTHING the
   * hero can stand on top of — see DEPTH_LAYER above; without it the two quads z-fight and
   * strobe. Switchable at runtime (setDepthLayer) for a prop that becomes walkable, like grass
   * mown to stubble.
   */
  depthLayer?: DepthLayerName;
  /** Lie flat on the ground (water, lava, item shadows) instead of standing. */
  flat?: boolean;
  /** Additive blending (fire glows, magic) — unlit, and never casts a shadow. */
  additive?: boolean;
  /** Full-bright/unlit (flames, lava, pickups): ignores the night entirely. */
  emissive?: boolean;
  /** Height in tiles above the ground for flat quads (default 0.02). */
  flatY?: number;
  /**
   * Anchor at the CENTRE instead of the foot: a puff, a spark or a flash hangs in the air
   * around its point, and grows outward from it — a foot anchor would make it climb.
   */
  centered?: boolean;
  /**
   * Alpha cutoff (default 0.35 lit / unlit, 0.01 additive). A particle that fades out must
   * set this near 0: with the default cutoff the whole sprite pops out of existence the
   * moment its opacity crosses the threshold, instead of fading.
   */
  alphaTest?: number;
  /**
   * Let the night fog tint this sprite (default true, like every body in the world). One-shot FX
   * turn it OFF: fog drags a translucent sprite's colour toward the dark night, which on a soft
   * puff eats the faint rim first and leaves a dark ring around it — a grey smudge on the ground
   * instead of smoke. They are brief accents right next to the camera; nothing to gain by fogging.
   */
  fog?: boolean;
  /**
   * Write into the depth buffer (default true; additive sprites always false). A translucent
   * one-shot FX must set this OFF: writing depth makes it REJECT whatever transparent surface is
   * drawn after it — the campfire's additive ground glow, above all — so a pale smoke puff punches
   * a dark hole through the warm pool of firelight and reads as a smudge instead of smoke.
   */
  depthWrite?: boolean;
  castShadow?: boolean;
  /**
   * The 2D grounding blob under a standing object (trees, NPCs, enemies, props):
   * a soft dark contact shadow that follows the billboard's foot. Pass `true` for
   * a sensible default, or override the blob radii (tiles) / darkness. Ignored on
   * flat/emissive/additive billboards (ground, water, flames, glows, pickups).
   */
  groundShadow?: boolean | { rx?: number; rz?: number; alpha?: number };
  /**
   * Firelight cast shadow: a black silhouette laid on the ground pointing away
   * from the nearest lit flame (see CastShadow3D.ts). World3D registers and drives
   * it. Implied by `groundShadow` for standing objects; set explicitly on actors
   * that use a separate contact blob (the hero). Ignored on flat/emissive billboards.
   */
  castGroundShadow?: boolean;
  /** Animated surface shader (see pixelArtLight.ts): lava heat shimmer / water moon-glint. */
  worldFx?: 'lavaFlow' | 'waterGlint';
  /**
   * Emissive/additive only: multiply the colour ABOVE 1 so the sprite is HDR and
   * blooms (a real flame/lava glows). Lit sprites stay ≤ lightCap, so a high bloom
   * threshold keeps them out of the bloom while these HDR emissives still glow.
   */
  emissiveBoost?: number;
}

export class Billboard3D {
  public readonly mesh: THREE.Mesh;
  private readonly mat: THREE.MeshLambertMaterial | THREE.MeshBasicMaterial;
  private readonly depthMat?: THREE.MeshDepthMaterial;
  // The 2D grounding blob (soft contact shadow) that follows this sprite's foot.
  private readonly groundShadow?: THREE.Mesh;
  private readonly flat: boolean;
  private readonly flatY: number;
  // Phaser's setTintFill paints the sprite a SOLID colour (keeping only the
  // texture's alpha). A multiply material can't do that, so the fragment shader
  // gets a fill mix uniform patched in (see pixelArtLight.ts).
  private readonly uFillColor: THREE.IUniform = { value: new THREE.Color(0x000000) };
  private readonly uFillMix: THREE.IUniform = { value: 0 };
  private tileX = 0;
  private tileY = 0;
  private elev = 0;
  /** Tiles pushed away from the camera to keep this sprite off an actor's plane (DEPTH_LAYER). */
  private depthBias: number;
  private w = 1;
  private h = 1;
  private baseColor = new THREE.Color(1, 1, 1);
  private tinted = false;
  private texKeyCur: string;
  private frameCur: number;
  public visible = true;
  private destroyed = false;

  public constructor(
    private readonly parent: THREE.Scene | THREE.Object3D,
    texKey: string,
    frame = 0,
    opts: Billboard3DOptions = {},
  ) {
    this.flat = opts.flat ?? false;
    this.flatY = opts.flatY ?? 0.02;
    this.depthBias = DEPTH_LAYER[opts.depthLayer ?? 'actor'];
    this.texKeyCur = texKey;
    this.frameCur = frame;
    const tex = getTexture3D(texKey, frame);
    const unlit = (opts.emissive ?? false) || (opts.additive ?? false);

    if (unlit) {
      this.mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        alphaTest: opts.alphaTest ?? (opts.additive ? 0.01 : 0.35),
      });
      if (opts.additive) {
        this.mat.blending = THREE.AdditiveBlending;
        this.mat.depthWrite = false;
      }
      patchPixelMaterial(this.mat, {
        fill: { color: this.uFillColor, mix: this.uFillMix },
        worldFx: opts.worldFx,
      });
    } else {
      this.mat = new THREE.MeshLambertMaterial({
        map: tex,
        transparent: true,
        alphaTest: opts.alphaTest ?? 0.5,
      });
      patchPixelMaterial(this.mat, {
        quantize: true,
        normalUp: !this.flat,
        footDistance: !this.flat,
        fill: { color: this.uFillColor, mix: this.uFillMix },
        worldFx: opts.worldFx,
      });
    }
    if (opts.fog === false) this.mat.fog = false;
    if (opts.depthWrite === false) this.mat.depthWrite = false;
    // HDR emissive: push the colour past 1 so the flame/lava blooms. Baked into
    // baseColor so clearTint() (relighting a fire) keeps it hot.
    if (unlit && opts.emissiveBoost && opts.emissiveBoost !== 1) {
      this.mat.color.multiplyScalar(opts.emissiveBoost);
    }
    this.baseColor.copy(this.mat.color);

    // Unit quad; scale carries the display size, position carries the anchor.
    const geo = new THREE.PlaneGeometry(1, 1);
    if (this.flat) geo.rotateX(-Math.PI / 2);
    else if (!opts.centered) geo.translate(0, 0.5, 0); // upright: origin at the feet
    this.mesh = new THREE.Mesh(geo, this.mat);

    const wantsShadow = opts.castShadow ?? (!this.flat && !unlit);
    if (wantsShadow) {
      this.mesh.castShadow = true;
      this.depthMat = new THREE.MeshDepthMaterial({
        depthPacking: THREE.RGBADepthPacking,
        map: tex,
        alphaTest: 0.5,
      });
      this.mesh.customDepthMaterial = this.depthMat;
    }

    // The soft grounding blob (2D contact ellipse). A sibling mesh on the ground —
    // NOT a child of the upright quad, so it never inherits the sprite's squash,
    // tilt or camera-facing rotation; it just tracks the foot each frame. Built at
    // its base radii and scaled by the sprite's width in apply().
    if (opts.groundShadow && !this.flat) {
      const cfg = opts.groundShadow === true ? {} : opts.groundShadow;
      this.groundShadow = makeShadowBlob(cfg.rx ?? 0.44, cfg.rz ?? 0.4, cfg.alpha ?? 0.34);
      parent.add(this.groundShadow);
    }

    parent.add(this.mesh);
    this.apply();
  }

  private apply(): void {
    if (this.destroyed) return;
    // The depth bias rides the view axis (see DEPTH_LAYER): ground clutter sits a hair behind
    // the actor plane so the two never tie in the depth test.
    const z = this.tileY - this.depthBias;
    this.mesh.position.set(this.tileX, (this.flat ? this.flatY : 0) + this.elev, z);
    this.mesh.scale.set(this.w, this.flat ? 1 : this.h, this.flat ? this.h : 1);
    this.mesh.visible = this.visible;
    if (this.groundShadow) {
      // Stays pinned to the foot on the ground (ignores the sprite's elevation, so
      // a bobbing/lifted sprite still throws a steady blob), scaled by its width.
      this.groundShadow.position.set(this.tileX, this.groundShadow.position.y, z);
      this.groundShadow.scale.set(this.w, 1, this.w);
      this.groundShadow.visible = this.visible;
    }
  }

  // ── Phaser-sprite-like surface (all chainable) ──────────────────────────────

  /** Position in TILE coordinates (worldX, worldY). */
  public setPosition(worldX: number, worldY: number): this {
    this.tileX = worldX;
    this.tileY = worldY;
    this.apply();
    return this;
  }

  /** Display size in TILE units. */
  public setDisplaySize(w: number, h: number): this {
    this.w = w;
    this.h = h;
    this.apply();
    return this;
  }

  /**
   * Move this sprite between depth layers at runtime — for a prop that BECOMES walkable (tall
   * grass mown to stubble): the instant the hero can share the tile, the sprite must leave the
   * actor plane. See DEPTH_LAYER.
   */
  public setDepthLayer(layer: DepthLayerName): this {
    this.depthBias = DEPTH_LAYER[layer];
    this.apply();
    return this;
  }

  /** Height above the ground in TILE units (item bob, coin arcs, carried gear). */
  public setElevation(tiles: number): this {
    this.elev = tiles;
    this.apply();
    return this;
  }

  public setTexture(texKey: string, frame = 0): this {
    this.texKeyCur = texKey;
    this.frameCur = frame;
    const tex = getTexture3D(texKey, frame);
    this.mat.map = tex;
    if (this.depthMat) this.depthMat.map = tex;
    return this;
  }

  /** The current texture (exposed for mirroring FX). */
  public get texKey(): string { return this.texKeyCur; }
  public get frame(): number { return this.frameCur; }

  public setTint(color: number): this {
    this.mat.color.set(color);
    this.uFillMix.value = 0;
    this.tinted = true;
    return this;
  }

  /** Solid-colour fill keeping only the texture alpha — Phaser's setTintFill. */
  public setTintFill(color: number): this {
    (this.uFillColor.value as THREE.Color).set(color);
    this.uFillMix.value = 1;
    this.tinted = true;
    return this;
  }

  public clearTint(): this {
    this.mat.color.copy(this.baseColor);
    this.uFillMix.value = 0;
    this.tinted = false;
    return this;
  }

  public get isTinted(): boolean {
    return this.tinted;
  }

  public setAlpha(a: number): this {
    this.mat.opacity = a;
    return this;
  }

  public setVisible(v: boolean): this {
    this.visible = v;
    this.apply();
    return this;
  }

  public setFlipX(flip: boolean): this {
    const sx = Math.abs(this.mesh.scale.x);
    this.mesh.scale.x = flip ? -sx : sx;
    return this;
  }

  public get flipX(): boolean {
    return this.mesh.scale.x < 0;
  }

  /** No-op: depth comes from the z-buffer in 3D. Kept for call-site parity. */
  public setDepth(_d: number): this {
    return this;
  }

  /** No-op: billboards anchor at the foot by construction. */
  public setOrigin(_x?: number, _y?: number): this {
    return this;
  }

  // ── tweenable plain properties (Phaser tweens mutate these directly) ────────

  public get x(): number { return this.tileX; }
  public set x(v: number) { this.tileX = v; this.apply(); }

  public get y(): number { return this.tileY; }
  public set y(v: number) { this.tileY = v; this.apply(); }

  public get elevation(): number { return this.elev; }
  public set elevation(v: number) { this.elev = v; this.apply(); }

  public get alpha(): number { return this.mat.opacity; }
  public set alpha(v: number) { this.mat.opacity = v; }

  public get scaleX(): number { return this.w; }
  public set scaleX(v: number) { this.w = v; this.apply(); }

  public get scaleY(): number { return this.h; }
  public set scaleY(v: number) { this.h = v; this.apply(); }

  public get displayWidth(): number { return this.w; }
  public set displayWidth(v: number) { this.w = v; this.apply(); }

  public get displayHeight(): number { return this.h; }
  public set displayHeight(v: number) { this.h = v; this.apply(); }

  /** Spin around the axis facing the camera (bomb wobble, poof FX). Radians-free: degrees, like Phaser. */
  public get angle(): number { return -THREE.MathUtils.radToDeg(this.mesh.rotation.z); }
  public set angle(deg: number) { this.mesh.rotation.z = -THREE.MathUtils.degToRad(deg); }

  public setAngle(deg: number): this {
    this.angle = deg;
    return this;
  }

  /** Parity with Phaser's GameObject.active (true until destroyed). */
  public get active(): boolean {
    return !this.destroyed;
  }

  /** Parity no-op: depth comes from the z-buffer. */
  public get depth(): number {
    return 0;
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.parent.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.depthMat?.dispose();
    if (this.groundShadow) {
      this.parent.remove(this.groundShadow);
      this.groundShadow.geometry.dispose();
      (this.groundShadow.material as THREE.Material).dispose();
    }
  }
}

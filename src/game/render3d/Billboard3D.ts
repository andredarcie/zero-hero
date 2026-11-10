import * as THREE from 'three';

import { makeShadowBlob } from './groundShadow';
import { patchPixelMaterial } from './pixelArtLight';
import { getTexture3D } from './textures3d';
import { terrainHeightAt } from '@/game/world/relief';

// ── A world sprite in the 3D renderer, with a 2D-sprite-like surface ──────
//
// The game's object classes render by calling sprite methods every frame
// (setPosition / setDisplaySize / setTint / setAlpha / setVisible / setTexture)
// and juice their sprites with engine tweens that mutate plain numeric props
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
  /** Owns its tile: hero, NPCs, trees, rocks, standing grass. The default. */
  actor: 0,
  /** Walkable clutter: ground items, spot marks, planted bombs, cut stubble. */
  ground: 0.06,
  /**
   * O que VESTE um ator no mesmo tile (o bloco de gelo do congelamento, os cacos dele): um fio
   * À FRENTE do plano do ator, pelo mesmo desenho declarado das outras duas camadas — coplanar
   * com o corpo o bloco perde o empate e desenha ATRÁS, que é o contrário do que um invólucro
   * afirma. Pequeno de propósito: um corpo no tile ao sul continua ocluindo o gelo normalmente.
   */
  overlay: -0.06,
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
  /**
   * The 2D grounding blob under a standing object (trees, NPCs, props):
   * a soft dark contact shadow that follows the billboard's foot. Pass `true` for
   * a sensible default, or override the blob radii (tiles) / darkness. Ignored on
   * flat/emissive/additive billboards (ground, water, flames, glows, pickups).
   */
  groundShadow?: boolean | { rx?: number; rz?: number; alpha?: number; zBias?: number };
  /**
   * Firelight cast shadow: a black silhouette laid on the ground pointing away
   * from the nearest lit flame (see CastShadow3D.ts). World3D registers and drives
   * it. Implied by `groundShadow` for standing objects; set explicitly on actors
   * that use a separate contact blob (the hero). Ignored on flat/emissive billboards.
   */
  castGroundShadow?: boolean;
  /** Animated surface shader (see pixelArtLight.ts): lava heat shimmer / water moon-glint. */
  worldFx?: 'lavaFlow' | 'waterGlint';
  /** Água que ESPELHA os personagens (o quad do rio) — ver pixelArtLight.mirrorSurface. */
  mirrorSurface?: boolean;
  /**
   * Este sprite APARECE no espelho d'água (herói, NPCs, gato). Quem lê é o World3D, que desenha
   * os marcados na passada do reflexo; o Billboard3D em si não muda nada.
   */
  reflected?: boolean;
  /**
   * Emissive/additive only: multiply the colour ABOVE 1 so the sprite is HDR and
   * blooms (a real flame/lava glows). Lit sprites stay ≤ lightCap, so a high bloom
   * threshold keeps them out of the bloom while these HDR emissives still glow.
   */
  emissiveBoost?: number;
  /**
   * Ordem de desenho no passe transparente (default 0). O `depthLayer` decide quem GANHA o
   * teste de profundidade; isto decide quem desenha DEPOIS — e um sprite `depthWrite: false`
   * precisa das duas coisas para cobrir um corpo: se ele sai primeiro, o corpo (que escreve
   * profundidade) pinta por cima mesmo estando atrás. O bloco de gelo é o caso; o brilho da
   * fogueira (World3D) já usava o mesmo truque à mão. O teste de profundidade continua ligado:
   * uma parede mais perto ainda oclui normalmente.
   */
  renderOrder?: number;
  /**
   * O CONTORNO de 1 texel (ver spriteOutline.ts): o anel escuro que separa um PERSONAGEM do chão granulado. Só para
   * quem é o assunto do quadro (o herói, os vizinhos, o gato) — nunca para cenário, que é o fundo.
   */
  outline?: boolean;
}

export class Billboard3D {
  public readonly mesh: THREE.Mesh;
  private readonly mat: THREE.MeshLambertMaterial | THREE.MeshBasicMaterial;
  // The 2D grounding blob (soft contact shadow) that follows this sprite's foot (see ContactBlob).
  private readonly groundShadow?: ContactBlob;
  /** Ver `alpha` / `setBlinkAlpha`: o quanto o CORPO existe, que nao e o alpha do frame. */
  private bodyAlpha = 1;
  private readonly flat: boolean;
  private readonly flatY: number;
  // The 2D engine's setTintFill paints the sprite a SOLID colour (keeping only the
  // texture's alpha). A multiply material can't do that, so the fragment shader
  // gets a fill mix uniform patched in (see pixelArtLight.ts).
  private readonly uFillColor: THREE.IUniform = { value: new THREE.Color(0x000000) };
  private readonly uFillMix: THREE.IUniform = { value: 0 };
  /**
   * Shadow-mask receive probe (hd3d.shadowMask): the XZ offset this sprite samples the
   * mask at, steered per frame by World3D toward the sprite's own light so a caster
   * never stands in its OWN silhouette (it starts at his feet). Lit billboards only.
   */
  public readonly maskProbe: THREE.IUniform<THREE.Vector2> = { value: new THREE.Vector2() };
  private tileX = 0;
  private tileY = 0;
  private elev = 0;
  /** Tiles pushed away from the camera to keep this sprite off an actor's plane (DEPTH_LAYER). */
  private depthBias: number;
  private w = 1;
  private h = 1;
  /**
   * O espelhamento e ESTADO, e nao um arranhao no `mesh.scale.x`: `apply()` reescreve a escala inteira a partir de `w`
   * (sempre positivo) e roda em todo setPosition/setDisplaySize/setElevation/setVisible, entao um sinal guardado na
   * escala era desfeito no MESMO frame em que o `setFlipX` o pedia. Guardado aqui, ele sobrevive a `apply()` e a ordem
   * das chamadas para de importar.
   */
  private flipped = false;
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
    this.mat = makeBillboardMaterial(getTexture3D(texKey, frame), opts, this.flat, { color: this.uFillColor, mix: this.uFillMix }, this.maskProbe);
    this.baseColor.copy(this.mat.color);

    // Unit quad; scale carries the display size, position carries the anchor.
    const geo = new THREE.PlaneGeometry(1, 1);
    if (this.flat) geo.rotateX(-Math.PI / 2);
    else if (!opts.centered) geo.translate(0, 0.5, 0); // upright: origin at the feet
    this.mesh = new THREE.Mesh(geo, this.mat);
    if (opts.renderOrder !== undefined) this.mesh.renderOrder = opts.renderOrder;

    // NO shadow-map plumbing here on purpose. Real shadow maps are off for the whole game
    // (billboards are slivers seen from a light — see World3D), and every billboard used to
    // allocate a MeshDepthMaterial anyway "for the door back": hundreds of dead material
    // objects per run. If shadow maps ever return, recreate the customDepthMaterial here
    // (RGBADepthPacking + map + alphaTest 0.5 — see git history).

    // The soft grounding blob (2D contact ellipse). A sibling mesh on the ground —
    // NOT a child of the upright quad, so it never inherits the sprite's squash,
    // tilt or camera-facing rotation; it just tracks the foot each frame. Built at
    // its base radii and scaled by the sprite's width in apply().
    if (opts.groundShadow && !this.flat) {
      this.groundShadow = new ContactBlob(parent, opts.groundShadow === true ? {} : opts.groundShadow);
    }

    parent.add(this.mesh);
    this.apply();
  }

  private apply(): void {
    if (this.destroyed) return;
    // The depth bias rides the view axis (see DEPTH_LAYER): ground clutter sits a hair behind
    // the actor plane so the two never tie in the depth test.
    const z = this.tileY - this.depthBias;
    // A SERRA: tudo que fica no mundo pisa no chão de onde está — um item no planalto, o corpo do
    // herói subindo a escada. Lido aqui, e não por quem posiciona, para nenhum dono de sprite
    // precisar saber que o chão tem altura (ver world/relief).
    const ground = terrainHeightAt(this.tileX, this.tileY);
    this.mesh.position.set(this.tileX, (this.flat ? this.flatY : 0) + this.elev + ground, z);
    this.mesh.scale.set(
      this.flipped ? -this.w : this.w,
      this.flat ? 1 : this.h,
      this.flat ? this.h : 1,
    );
    this.mesh.visible = this.visible;
    this.groundShadow?.place(this.tileX, ground, z, this.w, this.visible);
  }

  // ── 2D-sprite-like surface (all chainable) ──────────────────────────────

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

  /** Height above the ground in TILE units (item bob, loot arcs, carried gear). */
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

  /** Solid-colour fill keeping only the texture alpha — the 2D engine's setTintFill. */
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

  /**
   * A opacidade do corpo — E A DA SOMBRA DELE JUNTO.
   *
   * O blob de contato tem material próprio, então ele não seguia o alpha do sprite: um corpo que
   * apagava (o herói entrando na escada, um sumiço qualquer) deixava para trás uma sombra cheia,
   * plantada no chão e sem dono. Ela escala pela escuridão CHEIA que o dono pediu no nascimento,
   * nunca por uma soma sobre o valor atual — senão dois `setAlpha` seguidos a apagariam de vez.
   */
  public setAlpha(a: number): this {
    this.alpha = a;
    return this;
  }

  /**
   * A PISCADA, e so ela: mexe no sprite e deixa as sombras em paz.
   *
   * Piscar nao e sumir. O blob de contato e a ancora de POSICAO do corpo — e a mesma razao pela
   * qual a piscada de dano nunca vai a zero ("um bicho invisivel nao se acerta") vale para a
   * sombra dele: um blob que apaga cinco vezes em 450ms faz o bicho tremer de lugar bem no
   * momento em que o jogador precisa saber onde ele esta. `setAlpha` e para o corpo que
   * desaparece; isto e para o corpo que lampeja.
   */
  public setBlinkAlpha(a: number): this {
    this.mat.opacity = a;
    return this;
  }

  public setVisible(v: boolean): this {
    this.visible = v;
    this.apply();
    return this;
  }

  public setFlipX(flip: boolean): this {
    this.flipped = flip;
    this.apply();
    return this;
  }

  public get flipX(): boolean {
    return this.flipped;
  }

  /** No-op: depth comes from the z-buffer in 3D. Kept for call-site parity. */
  public setDepth(_d: number): this {
    return this;
  }

  /** No-op: billboards anchor at the foot by construction. */
  public setOrigin(_x?: number, _y?: number): this {
    return this;
  }

  // ── tweenable plain properties (engine tweens mutate these directly) ────────

  public get x(): number { return this.tileX; }
  public set x(v: number) { this.tileX = v; this.apply(); }

  public get y(): number { return this.tileY; }
  public set y(v: number) { this.tileY = v; this.apply(); }

  public get elevation(): number { return this.elev; }
  public set elevation(v: number) { this.elev = v; this.apply(); }

  /**
   * A OPACIDADE DO CORPO — e a das sombras dele junto.
   *
   * A regra mora no SETTER e nao em `setAlpha` porque este par de propriedades e a porta de
   * entrada de verdade: metade do jogo apaga um sprite com um tween do motor
   * (`tweens.add({ targets: bb, alpha: 0 })`), que escreve aqui e nunca chama o metodo. Com a
   * regra so no metodo, todo sumico tweenado continuaria deixando a sombra para tras — que era
   * exatamente o defeito.
   *
   * O blob escala pela escuridao CHEIA que o dono pediu no nascimento, nunca sobre o valor
   * atual: composto, dois `alpha` seguidos o apagariam de vez. A silhueta projetada le
   * `bodyAlpha` la no World3D, pelo mesmo motivo.
   */
  public get alpha(): number { return this.bodyAlpha; }

  public set alpha(v: number) {
    this.bodyAlpha = v;
    this.mat.opacity = v;
    this.groundShadow?.setBodyAlpha(v);
  }

  public get scaleX(): number { return this.w; }
  public set scaleX(v: number) { this.w = v; this.apply(); }

  public get scaleY(): number { return this.h; }
  public set scaleY(v: number) { this.h = v; this.apply(); }

  public get displayWidth(): number { return this.w; }
  public set displayWidth(v: number) { this.w = v; this.apply(); }

  public get displayHeight(): number { return this.h; }
  public set displayHeight(v: number) { this.h = v; this.apply(); }

  /** Spin around the axis facing the camera (bomb wobble, poof FX). Radians-free: degrees, like the 2D engine. */
  public get angle(): number { return -THREE.MathUtils.radToDeg(this.mesh.rotation.z); }
  public set angle(deg: number) { this.mesh.rotation.z = -THREE.MathUtils.degToRad(deg); }

  public setAngle(deg: number): this {
    this.angle = deg;
    return this;
  }

  /** Parity with the 2D GameObject.active (true until destroyed). */
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
    this.groundShadow?.destroy();
  }
}

/** A forma do blob de contato que o dono pediu (Billboard3DOptions.groundShadow). */
interface ContactBlobShape { rx?: number; rz?: number; alpha?: number; zBias?: number }

/**
 * O BLOB DE CONTATO de um billboard em pé: uma malha irmã no chão — NÃO filha do quad em pé, para nunca herdar o
 * achatamento, a inclinação nem a rotação para a câmera — que só acompanha o pé a cada apply.
 */
class ContactBlob {
  private readonly mesh: THREE.Mesh;
  /**
   * A ESCURIDÃO CHEIA do blob — a que ele tem com o corpo inteiro na tela.
   *
   * Ela existe porque `setAlpha` tem de valer para os DOIS: um corpo que apaga (a escada, a
   * morte, um sumiço qualquer) deixava a sombra inteira para trás, plantada no chão, sem dono.
   * Sombra é consequência de corpo — quem some leva a sua.
   */
  private readonly fullAlpha: number;
  /** Forward (+z) nudge of the contact blob, in tiles — the hero's blob peeks past his boots. */
  private readonly zBias: number;
  /** A altura do blob sobre o chão — o chão em si vem da serra (`terrainHeightAt`) a cada place. */
  private readonly baseY: number;

  public constructor(private readonly parent: THREE.Scene | THREE.Object3D, shape: ContactBlobShape) {
    this.fullAlpha = shape.alpha ?? 0.34;
    this.mesh = makeShadowBlob(shape.rx ?? 0.44, shape.rz ?? 0.4, this.fullAlpha);
    this.zBias = shape.zBias ?? 0;
    this.baseY = this.mesh.position.y;
    parent.add(this.mesh);
  }

  /**
   * Stays pinned to the foot on the ground (ignores the sprite's elevation, so a bobbing/lifted sprite still throws a
   * steady blob), scaled by its width.
   */
  public place(x: number, ground: number, z: number, width: number, visible: boolean): void {
    this.mesh.position.set(x, this.baseY + ground, z + this.zBias);
    this.mesh.scale.set(width, 1, width);
    this.mesh.visible = visible;
  }

  /** O corpo apagou (ou voltou): o blob escala pela escuridão CHEIA, nunca sobre o valor atual. */
  public setBodyAlpha(v: number): void {
    (this.mesh.material as THREE.Material).opacity = this.fullAlpha * v;
  }

  public destroy(): void {
    this.parent.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/**
 * O MATERIAL DE UM BILLBOARD. Sem luz (o que brilha: emissivo ou aditivo) é um MeshBasic; o resto é Lambert, com o
 * remendo de pixel-art inteiro (quantização, luz pelo pé, a sonda da máscara de sombra). `fill` é o par de uniforms
 * do setTintFill (pintar o sprite de uma cor sólida mantendo só o alfa da textura).
 */
const makeBillboardMaterial = (
  tex: THREE.Texture,
  opts: Billboard3DOptions,
  flat: boolean,
  fill: { color: THREE.IUniform; mix: THREE.IUniform },
  maskProbe: THREE.IUniform<THREE.Vector2>,
): THREE.MeshLambertMaterial | THREE.MeshBasicMaterial => {
  const unlit = (opts.emissive ?? false) || (opts.additive ?? false);
  let mat: THREE.MeshLambertMaterial | THREE.MeshBasicMaterial;
  if (unlit) {
    mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      alphaTest: opts.alphaTest ?? (opts.additive ? 0.01 : 0.35),
    });
    if (opts.additive) {
      mat.blending = THREE.AdditiveBlending;
      mat.depthWrite = false;
    }
    patchPixelMaterial(mat, {
      fill,
      worldFx: opts.worldFx,
      mirrorSurface: opts.mirrorSurface,
    });
  } else {
    mat = new THREE.MeshLambertMaterial({
      map: tex,
      transparent: true,
      alphaTest: opts.alphaTest ?? 0.5,
    });
    patchPixelMaterial(mat, {
      quantize: true,
      normalUp: !flat,
      footDistance: !flat,
      // A centred quad keeps its origin at its MIDDLE (see the geometry in the constructor), so its foot
      // is half a unit down — without this it lights from its chest. See footAnchorY.
      footAnchorY: opts.centered ? -0.5 : 0,
      fill,
      worldFx: opts.worldFx,
      mirrorSurface: opts.mirrorSurface,
      maskProbe,
      outline: opts.outline,
    });
  }
  if (opts.fog === false) mat.fog = false;
  if (opts.depthWrite === false) mat.depthWrite = false;
  // HDR emissive: push the colour past 1 so the flame/lava blooms. Baked into
  // baseColor so clearTint() (relighting a fire) keeps it hot.
  if (unlit && opts.emissiveBoost && opts.emissiveBoost !== 1) {
    mat.color.multiplyScalar(opts.emissiveBoost);
  }
  return mat;
};

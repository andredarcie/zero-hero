// OS ESTILHAÇOS DO MUNDO: a pedra que racha e voa, a onda de choque, a terra que espirra, as lascas da ponte e a
// fumaça — efeitos de uma vez só, sem estado.

import * as Engine from '@/game/engine';
import { ASSET_KEYS, SCENE_DEPTHS } from '@/game/constants';
import { FX_DOT_TEXTURE, FX_PUFF_TEXTURE, FX_RING_TEXTURE } from '@/game/render3d/World3D';
import type { GameScene } from '../GameScene';
import { FX_BILLBOARD } from './sceneDefs';

// How far in front of a rock's centre its struck FACE is (tiles). The pick's debris comes off the
// face the hero is swinging at, not out of the middle of the tile he cannot even see.
const ROCK_FACE_TILES = 0.34;
// Granite greys for the chips — a solid FILL (see spawnRockDebris), so these are the exact colours
// that fly. Pale enough to read against the night ground, and short of the near-white that sends an
// unlit sprite over the bloom threshold and turns a stone chip into a spark.
const ROCK_CHIP_TINTS = [0xb4bac1, 0x99a0a8, 0xc3c9cf, 0x848c95] as const;
// Os cacos de uma pedra de FERRO: a rampa quente do veio, com um unico cinza sobrando.
const ORE_CHIP_TINTS = [0x826841, 0x733e11, 0x99a0a8, 0x68380f] as const;

/** O que DebrisFx usa de GameScene. */
export type DebrisFxHost = Pick<GameScene,
  'add' | 'camera' | 'tileSize' | 'tweens' | 'world3d'
>;

export class DebrisFx {
  public constructor(private readonly host: DebrisFxHost) {}

  /**
   * Steel into granite. EVERY blow throws stone — not just the one that opens the tile — because
   * a first hit that merely swapped the sprite for a cracked one was the whole reason mining read
   * as pressing a button twice.
   *
   * The chips are real debris in the 3D world: they burst off the struck FACE (not the middle of
   * the tile), arc back at the hero, fall under gravity, BOUNCE where they land and lie in the
   * grass a moment before they go. The old shatter drew flat rectangles on the 2D canvas at
   * `lastScreen` — a screen position nothing ever refreshed, so the "shards" fired off the
   * top-left corner of the screen. (dirX, dirY) points from the hero into the rock.
   */
  public spawnRockDebris(wx: number, wy: number, dirX: number, dirY: number, shattered: boolean, ore = false): void {
    const w3 = this.host.world3d;
    if (!w3) return;

    // The point of contact: the face he is actually hitting, at about chest height on the rock.
    const ix = wx - dirX * ROCK_FACE_TILES;
    const iy = wy - dirY * ROCK_FACE_TILES;
    const iz = 0.52;
    // Where the stone goes. The blow throws it back at the man swinging — but he is standing
    // BETWEEN the rock and the camera, so a chip thrown straight back at him flies into his own
    // billboard and is never seen. So the spray is a wide V: out to BOTH SIDES of the blow, with
    // only a bias backwards. It is what a struck rock does anyway (the chip leaves along the
    // face, not along the pick), and it is the only version of it the player can watch.
    const back = Math.atan2(-dirY, -dirX);
    const tints = ore ? ORE_CHIP_TINTS : ROCK_CHIP_TINTS;

    for (let i = 0; i < (shattered ? 12 : 7); i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const ang  = back + side * (0.55 + Math.random() * 0.95);
      const dist = 0.3 + Math.random() * (shattered ? 0.8 : 0.45);
      const size = 0.11 + Math.random() * (shattered ? 0.13 : 0.08);
      const riseMs = 110 + Math.random() * 70;
      const fallMs = 300 + Math.random() * 140;
      // Unlit, like every other one-shot FX in this world (see spawnSmokePuff's note). A chip is a
      // piece of the rock, so a LIT one is the honest choice and it was the first thing I tried —
      // and at night it renders BLACK: a rock you cannot see, coming off a rock you can. The night
      // owns the world; it does not get to own the feedback.
      //
      // And it is FILLED, not tinted: a tint multiplies the rock's art, and a chip is small enough
      // that it samples the mound's dark body pixels and comes out charcoal. Fill keeps the
      // silhouette and paints it granite.
      const chip = w3
        .objects.addBillboard(ASSET_KEYS.rock, 0, { ...FX_BILLBOARD, emissive: true, alphaTest: 0.05 })
        .setTintFill(tints[i % tints.length])
        .setPosition(ix, iy)
        .setElevation(iz)
        .setDisplaySize(size, size);

      // Horizontal flight: it leaves fast and drags to a stop over the whole arc (the y throw is
      // foreshortened — the ground plane is tilted away from us).
      this.host.tweens.add({
        targets: chip,
        x: ix + Math.cos(ang) * dist,
        y: iy + Math.sin(ang) * dist * 0.7,
        angle: Engine.Math.Between(-540, 540), // end over end
        duration: riseMs + fallMs,
        ease: 'Quad.easeOut',
      });
      // …and the gravity arc under it: up off the face, then down, and it BOUNCES where it lands.
      // That bounce is the entire difference between a chip of rock and a puff of smoke.
      this.host.tweens.add({
        targets: chip,
        elevation: iz + 0.22 + Math.random() * 0.3,
        duration: riseMs,
        ease: 'Quad.easeOut',
        onComplete: () => {
          this.host.tweens.add({
            targets: chip,
            elevation: 0.03, // on the ground, where it stays
            duration: fallMs,
            ease: 'Bounce.easeOut',
            onComplete: () => {
              this.host.tweens.add({
                targets: chip,
                alpha: 0,
                delay: 260, // it lies there first — debris that vanishes on landing never landed
                duration: 240,
                onComplete: () => chip.destroy(),
              });
            },
          });
        },
      });
    }

    // Dust knocked out of the crack, and the sparks of the point biting stone.
    for (let i = 0; i < (shattered ? 4 : 2); i++) {
      const puff = w3
        .objects.addBillboard(FX_PUFF_TEXTURE, 0, { ...FX_BILLBOARD, emissive: true, alphaTest: 0.02 })
        .setTint(0xb0a89c)
        .setPosition(ix + (Math.random() - 0.5) * 0.3, iy + (Math.random() - 0.5) * 0.2)
        .setElevation(iz - 0.15)
        .setDisplaySize(0.24, 0.24)
        .setAlpha(0.4);
      this.host.tweens.add({
        targets: puff,
        elevation: iz + 0.35 + Math.random() * 0.2,
        scaleX: 0.55,
        scaleY: 0.55,
        alpha: 0,
        duration: 420 + i * 90,
        ease: 'Power2.easeOut',
        onComplete: () => puff.destroy(),
      });
    }
    for (let i = 0; i < 2; i++) {
      const ang = back + (i === 0 ? 1 : -1) * (0.4 + Math.random() * 0.8); // off the face, like the chips
      const spark = w3
        .objects.addBillboard(FX_DOT_TEXTURE, 0, { ...FX_BILLBOARD, additive: true, emissiveBoost: 2 })
        .setTint(0xffe0a8) // struck steel, not fire: a pale gold, and gone in a blink
        .setPosition(ix, iy)
        .setElevation(iz)
        .setDisplaySize(0.08, 0.08);
      this.host.tweens.add({
        targets: spark,
        x: ix + Math.cos(ang) * 0.4,
        y: iy + Math.sin(ang) * 0.28,
        elevation: iz + 0.12,
        alpha: 0,
        duration: 110 + Math.random() * 70,
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy(),
      });
    }

    // A pedra se abre, e o mundo so sente de leve — num vale tranquilo nada sacode a tela.
    if (shattered) this.spawnShockwave(wx, wy, 0xb6bcc4, 0.3, 1.05, 260);
    w3.cam.shake(shattered ? 90 : 50, shattered ? 0.008 : 0.003);
  }

  /**
   * An impact wave washing out over the ground: a flat additive ring at the tile, growing from
   * `from` to `to` tiles across. Shared by the landed hit, the deflected blow and the heal tick,
   * so every "something struck here" beat speaks with one shape.
   */
  public spawnShockwave(
    wx: number, wy: number, color: number, from: number, to: number, durationMs: number,
  ): void {
    const w3 = this.host.world3d;
    if (!w3) return;
    const ring = w3
      .objects.addBillboard(FX_RING_TEXTURE, 0, { additive: true, flat: true, flatY: 0.05, fog: false, depthWrite: false })
      .setTint(color)
      .setPosition(wx, wy)
      .setDisplaySize(from, from);
    this.host.tweens.add({
      targets: ring,
      scaleX: to,
      scaleY: to,
      alpha: 0,
      duration: durationMs,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  // A few grey puffs rising where a flame died.
  public spawnSmokePuff(wx: number, wy: number): void {
    const w3 = this.host.world3d;
    if (!w3) return;
    for (let i = 0; i < 3; i++) {
      // Unlit but NOT additive: smoke must not glow — it veils. The near-zero alphaTest lets it
      // fade out instead of popping when its opacity crosses the default cutoff.
      const puff = w3
        .objects.addBillboard(FX_PUFF_TEXTURE, 0, { ...FX_BILLBOARD, emissive: true, alphaTest: 0.02 })
        .setTint(0xcac5bd)
        .setPosition(wx + (Math.random() - 0.5) * 0.16, wy)
        .setElevation(0.35)
        .setDisplaySize(0.26, 0.26)
        .setAlpha(0.38);
      this.host.tweens.add({
        targets: puff,
        elevation: 1.05,
        alpha: 0,
        scaleX: 0.47,
        scaleY: 0.47,
        duration: 500 + i * 120,
        ease: 'Power2.easeOut',
        onComplete: () => puff.destroy(),
      });
    }
  }

  // Wood chips bursting up as a plank is laid — a small spray per deposit, a bigger one when
  // the bridge finishes. Screen-anchored (the hero is stopped here), like spawnSmokePuff.
  public spawnBridgeChips(wx: number, wy: number, count: number): void {
    if (!this.host.camera) return;
    const s = this.host.camera.tileToScreen(wx, wy, this.host.tileSize);
    const colors = [0x815938, 0x63452c, 0x966b48];
    const size = Math.max(2, Math.floor(this.host.tileSize * 0.13));
    for (let i = 0; i < count; i++) {
      const chip = this.host.add
        .rectangle(s.x + Engine.Math.Between(-4, 4), s.y + Engine.Math.Between(-3, 3), size, size, colors[i % colors.length])
        .setDepth(SCENE_DEPTHS.player + 3)
        .setAngle(Engine.Math.Between(0, 360));
      this.host.tweens.add({
        targets: chip,
        x: chip.x + Engine.Math.Between(-6, 6) * (this.host.tileSize * 0.06),
        y: chip.y - this.host.tileSize * (0.35 + Math.random() * 0.5),
        angle: chip.angle + Engine.Math.Between(-200, 200),
        alpha: 0,
        duration: 320 + i * 18,
        ease: 'Quad.easeOut',
        onComplete: () => chip.destroy(),
      });
    }
  }

  // Torrões de terra chutados por uma pazada — o gesto das lascas da ponte com a física
  // invertida: lasca de madeira voa e SOME no ar; torrão é PESO — sobe rápido, para, e CAI de
  // volta, apagando só quando pousa. Cores da própria arte do buraco (aro recém-cavado, sombra
  // e nightsoil), para que o que voa e o que fica no chão leiam como a mesma terra.
  public spawnDirtBurst(wx: number, wy: number, count: number): void {
    if (!this.host.camera) return;
    const s = this.host.camera.tileToScreen(wx, wy, this.host.tileSize);
    const colors = [0x63452c, 0x3e2533, 0x452939];
    const size = Math.max(2, Math.floor(this.host.tileSize * 0.11));
    for (let i = 0; i < count; i++) {
      const clod = this.host.add
        .rectangle(s.x + Engine.Math.Between(-5, 5), s.y + Engine.Math.Between(-2, 2), size, size, colors[i % colors.length])
        .setDepth(SCENE_DEPTHS.player + 3)
        .setAngle(Engine.Math.Between(0, 360));
      const driftX = Engine.Math.Between(-8, 8) * (this.host.tileSize * 0.045);
      const rise = this.host.tileSize * (0.28 + Math.random() * 0.34);
      this.host.tweens.add({
        targets: clod,
        x: clod.x + driftX * 0.6,
        y: clod.y - rise,
        angle: clod.angle + Engine.Math.Between(-160, 160),
        duration: 150 + i * 12,
        ease: 'Quad.easeOut',
        onComplete: () => {
          this.host.tweens.add({
            targets: clod,
            x: clod.x + driftX * 0.4,
            // Cai um fio ALÉM de onde subiu: o torrão pousa em volta do buraco, não dentro.
            y: clod.y + rise * (0.8 + Math.random() * 0.35),
            angle: clod.angle + Engine.Math.Between(-120, 120),
            alpha: 0,
            duration: 190 + i * 14,
            ease: 'Quad.easeIn',
            onComplete: () => clod.destroy(),
          });
        },
      });
    }
  }
}

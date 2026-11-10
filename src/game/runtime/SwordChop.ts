// O GOLPE DE MACHADO: a lâmina que desce em arco sobre o tile, o rastro e o clarão no acerto. O balanço da espada e o
// giro são do SwordSlash.

import * as Engine from '@/game/engine';
import type { SwordSlash } from './SwordOrbit';

const SLASH_HANDLE_FACTOR = 0.26; // handle sits this fraction of tileSize from player center
export const SLASH_BLADE_FACTOR  = 1.08; // blade length relative to tileSize
export const TRAIL_ALPHAS = [0.55, 0.44, 0.35, 0.27, 0.20, 0.14, 0.09, 0.05] as const;
// ── Standing in the world's light ────────────────────────────────────────────
//
// The swing is the last WORLD object drawn on the 2D canvas, which sits ABOVE the 3D one:
// it gets no lighting, no tone mapping and no night grade. Left alone it renders at full art
// brightness over a night-dark world, so a light-palette tool (the steel axe is greys and bone)
// swung like a lightbulb while the hero holding it stood in shadow — the "branco estourado".
// So the sprite is TINTED by the light where the hero is standing (World3D.lightLevelAt):
// moonlight at 0, the art's own colours at 1. It only has to sit in the hero's value range.
const SWING_DARK = 0x5a5c78; // the multiply tint under moonlight alone — cool, like the night
/**
 * O lampejo do acerto (ver `flashHit`). Quente e claro, mas NÃO branco puro: a arma tem de
 * continuar sendo a arma no quadro congelado — branco chapado apagaria a silhueta dela, que é
 * exatamente o defeito que fez a piscada branca ser arrancada do corpo dos inimigos.
 */
const HIT_FLASH_TINT = 0xfff0c4;
/** Curto o bastante para caber dentro do hitstop mais leve (60ms) e morrer com ele. */
const HIT_FLASH_MS = 70;
/** Blend the night tint toward white by `level` (0..1) and pack it back into a 2D tint. */
export const swingLitTint = (level: number): number => {
  const t = Math.max(0, Math.min(1, level));
  const lerp = (dark: number): number => Math.round(dark + (255 - dark) * t);
  return (lerp((SWING_DARK >> 16) & 0xff) << 16)
    | (lerp((SWING_DARK >> 8) & 0xff) << 8)
    | lerp(SWING_DARK & 0xff);
};
// ── The mining swing ─────────────────────────────────────────────────────────
//
// A pickaxe is not a sword. The slash above is a flat sweep that passes THROUGH its target and
// out the other side; a pick is heavy — it is hauled up over the head, HANGS there while its
// weight gathers, and is then driven into one single spot, and the stone hands it straight back
// to you. Those four beats are the whole animation, and the hang is the one that sells it: cut
// the pause and the same arc reads as a fly-swat.
//
// The head always travels OVER the hero and never up through the ground: it sweeps in ONE
// direction, from a wind-up behind him to the strike. The rotation is driven through a scratch
// object rather than the sprite's own `angle`, because the engine wraps that getter into [-180, 180]
// — a tween reading it back would take the long way round (the same trap the slash documents).
export const CHOP_REAR_MS    = 125;  // hauling it up and back: the slow beat that gives it weight
export const CHOP_HANG_MS    = 50;   // held at the top of the swing
export const CHOP_DRIVE_MS   = 70;   // and down — fast, the only beat that leaves a trail
export const CHOP_RECOIL_MS  = 130;  // granite gives nothing back but the pick
export const CHOP_FADE_MS    = 90;
const CHOP_CARRY_DEG  = 28;   // where it rests in his hands before the swing (tipped back)
const CHOP_REAR_DEG   = 152;  // how far behind the strike the wind-up reaches
const CHOP_BURY_DEG   = 16;   // driven a little PAST the target: the point bites in
const CHOP_RECOIL_DEG = 34;   // and is kicked back out of the stone
const CHOP_TRAIL_DEG  = 13;   // spacing of the motion-blur ghosts along the drive
// The head may never wind up BELOW the horizon. "Behind the hero" is a direction on the ground,
// but on screen it is a direction on the clock face — and when he chops NORTH, behind him is
// straight DOWN the screen: a 152° wind-up put the pick under his feet and he read as a man
// sweeping a floor. Capped, the head always rises above his shoulder, whichever way he faces.
const CHOP_REAR_CAP = 78;
// A chop up or down the screen barely rotates (the rock is above his head, so the blade already
// points at it) — so what has to sell it is the pick SHRINKING as it is driven away from the
// camera, and swelling as it is driven toward it. Sideways chops have the arc and need neither.
const CHOP_AWAY_SIZE   = 0.82;
const CHOP_TOWARD_SIZE = 1.04;
// The pick's handle travels too — the arms haul back on the wind-up and shove into the blow.
// Fractions of a tile from the hero's centre; negative = drawn back behind him.
const CHOP_HAND_REAR   = -0.08;
const CHOP_HAND_LIFT   = 0.16;  // ...and up (screen-up is -y): the hands rise past his head
const CHOP_HAND_STRIKE = 0.44;
const CHOP_HAND_REST   = 0.30;
// O MACHADO é o mesmo gesto da picareta, com o peso de outro jeito. Ele vem colado ao corpo, e o que
// separa o golpe do vazio é o fim: no ar ele passa reto e leva o corpo junto; no tronco ele ENTRA e
// fica, o tronco segura a lâmina um instante, e só então o braço a arranca de volta.
const AXE_HAND_LIFT    = 0.1;
const AXE_HAND_REAR    = -0.04;
const AXE_HAND_STRIKE  = 0.26;
const AXE_HAND_REST    = 0.16;
const AXE_BITE_DEG     = 4;   // no tronco ela para quase onde mirou
const AXE_FOLLOW_DEG   = 74;  // no ar ela segue, até quase apontar para baixo
const AXE_FOLLOW_MS    = 150;
/** Quanto o tronco segura a lâmina antes de soltar. */
export const AXE_STUCK_MS = 120;

/** O que SwordChop usa de SwordSlash. */
export type SwordChopHost = Pick<SwordSlash,
  'bladeTint' | 'chop$' | 'lightLevel' | 'scene' | 'sprite' | 'trails'
>;

export class SwordChop {
  /** Qual lampejo é o atual: um gesto novo invalida o retorno do anterior (ver `flashHit`). */
  private flashUntilId = 0;

  public constructor(private readonly host: SwordChopHost) {}

  /**
   * O QUADRO DE IMPACTO — a lâmina dizendo por que parou.
   *
   * O arco varria os mesmos 155°, na mesma velocidade e na mesma cor, acertando ou não. E o jogo já
   * tinha metade do gesto pronta sem usá-la: o hitstop de um acerto zera `tweens.timeScale`, o que
   * CONGELA a lâmina no meio do arco por 60-110ms. A pose parada já existia; faltava a cor.
   *
   * Então um lampejo quente no sprite da arma no instante do acerto, apagando por conta própria —
   * `delayedCall` e não tween, porque um tween seria congelado pelo mesmo hitstop que este lampejo
   * existe para pintar, e a lâmina ficaria acesa até o mundo voltar a andar.
   *
   * Aqui isso é de graça, e é o único gesto do herói em que é: o arco é um sprite 2D do motor
   * DESENHADO POR CIMA do canvas 3D, não um billboard `emissive` — então a lei que proíbe acender
   * um corpo atingido (silhueta chapada que o bloom espalha e o hitstop segura acesa) não alcança
   * a arma. Ela não passa pelo bloom.
   */
  public flashHit(): void {
    if (!this.host.sprite.visible) return;
    // A cor de volta sai de `bladeTint`, e não de ler `tintTopLeft` do sprite: aquele campo é a
    // representação INTERNA do motor (quatro cantos, formato dele), e depender dela para uma
    // ida-e-volta é o tipo de coisa que uma versão menor do motor quebra em silêncio. Quem pintou
    // a lâmina sabe de que cor ela é.
    this.flashUntilId += 1;
    const id = this.flashUntilId;
    this.host.sprite.setTint(HIT_FLASH_TINT);
    this.host.scene.time.delayedCall(HIT_FLASH_MS, () => {
      // Um golpe novo no meio do lampejo repinta a lâmina por conta própria (`slash`/`spin` chamam
      // `setTint`), e este retorno chegaria depois para desfazer o que o golpe novo acabou de
      // fazer. O contador é o que faz o lampejo velho perder para o gesto novo.
      if (id !== this.flashUntilId || !this.host.sprite.active) return;
      this.host.sprite.setTint(this.host.bladeTint);
    });
  }

  /**
   * The overhead pickaxe strike (see the notes above `CHOP_REAR_MS`): rear back, hang, drive,
   * recoil. `dx/dy` is the cardinal direction of the blow; the head lands `CHOP_IMPACT_MS` later,
   * which is where the caller must put its hit, its debris and its sound.
   */
  public chop(
    playerScreenX: number,
    playerScreenY: number,
    dx: number,
    dy: number,
    tileSize: number,
    item: { texture: string; frame: number },
    axe?: { hit: boolean },
  ): void {
    this.host.scene.tweens.killTweensOf(this.host.sprite);
    this.host.scene.tweens.killTweensOf(this.host.chop$);
    this.host.trails.forEach(t => this.host.scene.tweens.killTweensOf(t));

    let attack = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
    if (attack > 180) attack -= 360;
    // Which way round the head travels. Mirrored for a westward blow: with a single fixed spin
    // the pick would wind up ahead of the hero and scoop UP through the floor into the rock.
    const spin = attack >= 0 ? 1 : -1;
    const rear   = Engine.Math.Clamp(attack - spin * CHOP_REAR_DEG, -CHOP_REAR_CAP, CHOP_REAR_CAP);
    const bury   = attack + spin * (axe ? AXE_BITE_DEG : CHOP_BURY_DEG);
    const recoil = attack - spin * CHOP_RECOIL_DEG;

    const size = Math.max(12, Math.floor(tileSize * SLASH_BLADE_FACTOR));
    // Driven away from the camera (north) or into it (south) — see CHOP_AWAY_SIZE.
    const struckSize = size * (dy < 0 ? CHOP_AWAY_SIZE : dy > 0 ? CHOP_TOWARD_SIZE : 0.94);
    const hand = (reach: number, lift = 0) => ({
      x: playerScreenX + dx * tileSize * reach,
      y: playerScreenY + dy * tileSize * reach - tileSize * lift,
    });

    const s = this.host.chop$;
    const carry = hand(SLASH_HANDLE_FACTOR);
    s.spin  = spin;
    s.angle = attack - spin * CHOP_CARRY_DEG; // as it sits in his hands, tipped back
    s.handX = carry.x;
    s.handY = carry.y;
    s.size  = size * 0.92;
    s.trail = 0;

    const litTint = swingLitTint(this.host.lightLevel); // stand in the world's light — see SWING_DARK
    this.host.bladeTint = litTint;
    this.host.sprite
      .setTexture(item.texture, item.frame)
      .setFlip(false, false)
      .setTint(litTint)
      .setAlpha(1)
      .setVisible(true);
    this.host.trails.forEach(t =>
      t.setTexture(item.texture, item.frame).setFlip(false, false).setTint(litTint).setAlpha(0).setVisible(false));
    this.applyChop();

    const reared = axe ? hand(AXE_HAND_REAR, AXE_HAND_LIFT) : hand(CHOP_HAND_REAR, CHOP_HAND_LIFT);
    const struck = hand(axe ? AXE_HAND_STRIKE : CHOP_HAND_STRIKE);
    const rested = hand(axe ? AXE_HAND_REST : CHOP_HAND_REST, 0.04);

    // 1. Rear back: slow, decelerating into the hang — the pick is heavy and he is winding up.
    //    It grows as it comes up over his head (it is nearer the camera up there).
    this.host.scene.tweens.add({
      targets: s,
      angle: rear,
      handX: reared.x,
      handY: reared.y,
      size: size * 1.16,
      duration: CHOP_REAR_MS,
      ease: 'Sine.easeOut',
      onUpdate: () => this.applyChop(),
      onComplete: () => {
        // 2. Hang (the tween's delay), then 3. drive: accelerating all the way into the stone,
        //    smearing a motion-blur trail behind it, and shortening as it foreshortens into the
        //    ground. `size` snapping back under 1× on the last frames is the impact.
        this.host.scene.tweens.add({
          targets: s,
          angle: bury,
          handX: struck.x,
          handY: struck.y,
          size: struckSize,
          trail: 1,
          delay: CHOP_HANG_MS,
          duration: CHOP_DRIVE_MS,
          ease: 'Cubic.easeIn',
          onUpdate: () => this.applyChop(),
          onComplete: () => {
            const fadeOut = (): void => {
              this.host.scene.tweens.add({
                targets: [this.host.sprite, ...this.host.trails],
                alpha: 0,
                duration: CHOP_FADE_MS,
                onComplete: () => {
                  this.host.sprite.setVisible(false);
                  this.host.trails.forEach(t => t.setVisible(false));
                },
              });
            };
            // 4. Recoil: the stone throws it back out. Back.easeOut overshoots — the wrists give.
            const pullOut = (): void => {
              this.host.scene.tweens.add({
                targets: s,
                angle: recoil,
                handX: rested.x,
                handY: rested.y,
                size,
                trail: 0,
                duration: CHOP_RECOIL_MS,
                ease: 'Back.easeOut',
                onUpdate: () => this.applyChop(),
                onComplete: fadeOut,
              });
            };
            if (axe && !axe.hit) {
              // NO AR: nada segura. A lâmina segue pelo próprio peso até gastar o impulso.
              const past = hand(AXE_HAND_STRIKE + 0.1, -0.12);
              this.host.scene.tweens.add({
                targets: s,
                angle: attack + spin * AXE_FOLLOW_DEG,
                handX: past.x,
                handY: past.y,
                trail: 0,
                duration: AXE_FOLLOW_MS,
                ease: 'Sine.easeOut',
                onUpdate: () => this.applyChop(),
                onComplete: fadeOut,
              });
              return;
            }
            if (axe) {
              // NO TRONCO: a lâmina fica presa e vibra, e o braço precisa arrancá-la.
              s.trail = 0;
              this.flashHit();
              const stuck = { x: s.handX, y: s.handY };
              const shake = this.host.scene.tweens.addCounter({
                from: 0,
                to: 1,
                duration: AXE_STUCK_MS,
                onUpdate: (tw) => {
                  const k = 1 - (tw.getValue() ?? 0);
                  s.handX = stuck.x + Math.sin((tw.getValue() ?? 0) * 40) * 1.5 * k;
                  s.handY = stuck.y;
                  this.applyChop();
                },
                onComplete: pullOut,
              });
              void shake;
              return;
            }
            pullOut();
          },
        });
      },
    });
  }

  /** Write the chop's tweened pose onto the pick and its motion-blur ghosts. */
  private applyChop(): void {
    const s = this.host.chop$;
    this.host.sprite
      .setPosition(s.handX, s.handY)
      .setDisplaySize(s.size, s.size)
      .setAngle(s.angle);
    if (s.trail <= 0) {
      this.host.trails.forEach(t => t.setVisible(false));
      return;
    }
    // The ghosts hang BEHIND the head along the arc it just swept — so they trail up the way it
    // came down, which is the only reason a 70ms drive reads as fast rather than as a teleport.
    this.host.trails.forEach((t, i) => {
      t.setPosition(s.handX, s.handY)
        .setDisplaySize(s.size, s.size)
        .setAngle(s.angle - s.spin * CHOP_TRAIL_DEG * (i + 1))
        .setAlpha(TRAIL_ALPHAS[i] * s.trail)
        .setVisible(true);
    });
  }
}

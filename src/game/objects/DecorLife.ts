import type { HeldItemKind } from '@/game/entities/ItemPickup';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { CHIME_FRAMES, potTexture } from '@/game/render3d/homeArt';
import { FX_DOT_TEXTURE, world3d } from '@/game/render3d/World3D';
import { seasonOf } from '@/game/runtime/seasons';
import { getDay, getTimeOfDay } from '@/game/runtime/timeOfDay';
import { gustAt } from '@/game/runtime/wind';

/**
 * OS ENFEITES QUE VIVEM (o lar do herói, runtime/homeState): pousados no chão, três deles mudam com o mundo, sem o
 * jogador fazer nada. A LANTERNA acende quando escurece (um halo somado, nunca uma luz THREE: a contagem de luzes do
 * mundo é fixa); o SINO DE VENTO balança nas rajadas (os três quadros de `homeArt.windChime`; o som é da cena, que sabe
 * onde o herói está); o VASO troca de flor com a estação. É uma peça do `ItemPickup`, criada só para esses três.
 */

/** Quem tem vida própria no chão. */
export const LIVING_DECOR: ReadonlySet<HeldItemKind> = new Set<HeldItemKind>(['lantern', 'windChime', 'flowerPot']);

/** A hora em que a noite começa a chegar e a acabar (0..1 do relógio, como `timeOfDay`), e o tempo da passagem. */
const DUSK = 0.75;
const DAWN = 0.25;
const TWILIGHT = 0.035;

/**
 * Quanto é noite agora, de 0 (dia) a 1 (noite), com uma passagem curta e suave em volta do anoitecer e do amanhecer: a
 * lanterna acende aos poucos, não de estalo. A noite do jogo é a mesma de `isNightTime` (antes das 6h, depois das 18h).
 */
export const nightAmount = (time: number): number => {
  const ramp = (edge: number, rising: boolean): number => {
    const k = Math.min(1, Math.max(0, (time - edge) / TWILIGHT + 0.5));
    return rising ? k : 1 - k;
  };
  return time >= 0.5 ? ramp(DUSK, true) : ramp(DAWN, false);
};

/** A rajada a partir da qual o sino se mexe: a brisa de fundo não o tira do lugar. */
export const CHIME_GUST = 0.18;

/**
 * O quadro do sino agora: 0 parado, 1 para a esquerda, 2 para a direita. Ele balança de um lado para o outro numa
 * cadência própria (`phase`: cada sino no seu tempo), e só enquanto a rajada passa do limiar.
 */
export const chimeFrame = (nowMs: number, gust: number, phase: number): 0 | 1 | 2 => {
  if (gust < CHIME_GUST) return 0;
  const swing = Math.sin(nowMs / 260 + phase);
  if (Math.abs(swing) < 0.35) return 0;
  return swing < 0 ? 1 : 2;
};

const GLOW_TINT = 0xffb24a;
/** O halo da lanterna: um pouco acima do chão, na altura da chama, bem mais largo que o tile (a primeira versão, de
 * tile e meio, quase não se via no escuro). */
const GLOW = { elevation: 0.38, w: 2.4, h: 1.8, alpha: 0.6 };

export class DecorLife {
  private readonly glow?: Billboard3D;
  private readonly phase: number;
  private shown = '';

  public constructor(
    private readonly kind: HeldItemKind,
    private readonly sprite: Billboard3D,
    x: number,
    y: number,
  ) {
    this.phase = (x * 1.7 + y * 2.3) % (Math.PI * 2);
    if (kind === 'lantern') {
      this.glow = world3d()
        // As mesmas opções das brasas do forno (FurnaceEffects): somado e EMISSIVO — sem isso a noite apagava o próprio
        // halo, que é justamente o que só existe de noite —, e o material já está aquecido no prewarm.
        .objects.addBillboard(FX_DOT_TEXTURE, 0, { centered: true, additive: true, emissive: true, fog: false, depthWrite: false })
        .setTint(GLOW_TINT)
        .setPosition(x, y + 0.02)
        .setElevation(GLOW.elevation)
        .setDisplaySize(GLOW.w, GLOW.h)
        .setAlpha(0);
    }
  }

  /** A cada quadro, com a transparência do enfeite (ele aparece aos poucos ao ser pousado). */
  public render(nowMs: number, alpha: number): void {
    if (this.glow) {
      const flicker = 0.88 + 0.08 * Math.sin(nowMs / 97 + this.phase) + 0.04 * Math.sin(nowMs / 41);
      this.glow.setAlpha(alpha * GLOW.alpha * nightAmount(getTimeOfDay()) * flicker);
    }
    if (this.kind === 'windChime') this.show(CHIME_FRAMES[chimeFrame(nowMs, gustAt(nowMs), this.phase)]);
    else if (this.kind === 'flowerPot') this.show(potTexture(seasonOf(getDay())));
  }

  /** O enfeite foi apanhado: o halo some junto. */
  public hide(): void {
    this.glow?.setVisible(false);
  }

  public destroy(): void {
    this.glow?.destroy();
  }

  private show(key: string): void {
    if (key === this.shown) return;
    this.shown = key;
    this.sprite.setTexture(key, 0);
  }
}

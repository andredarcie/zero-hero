import * as Engine from '@/game/engine';

import { NPC_VISUALS } from '@/game/constants';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import type { NpcKind } from '@/game/world/ScreenContent';

/**
 * O VIZINHO QUE VEM SENTAR. Quando o heroi senta numa fogueira, o vizinho mais perto atravessa o
 * vale ate ela e senta do outro lado — sem fala, so presenca.
 *
 * Ele e um STAND-IN, como o mago da abertura: o NPC de verdade fica "fora" no NpcManager (o
 * corpo some, o tile continua ocupado e ninguem conversa com ele ali), e este corpo anda o
 * caminho que o BFS da cena achou. Levantar o manda de volta pelo mesmo caminho, e so quando
 * ele chega o de verdade reaparece.
 */

/** O passo dele: um pouco mais lento que o do heroi, e sem pressa nenhuma. */
const STEP_MS = 420;

export type VisitPath = ReadonlyArray<readonly [number, number]>;

export class FireVisitor {
  private readonly body: Billboard3D;
  /** Onde ele esta no caminho, em passos fracionarios (0 = casa, fim = ao pe do fogo). */
  private t = 0;
  private tween?: Engine.Tweens.Tween;
  private seated = false;

  public constructor(
    private readonly scene: Engine.Scene,
    public readonly kind: NpcKind,
    private readonly path: VisitPath,
    /** O passo, em ms por tile (a Thea vindo buscar a barra corre: passo mais curto). */
    private readonly stepMs = STEP_MS,
  ) {
    const visual = NPC_VISUALS[kind];
    this.body = world3d()
      .objects.addBillboard(visual.key, visual.frame ?? 0, { groundShadow: true, reflected: true, outline: true })
      .setDisplaySize(1, 1);
    if (visual.tint !== undefined) this.body.setTint(visual.tint);
    this.place();
  }

  /** O corpo dele, para falar e se mexer em cena. */
  public get bodySprite(): Billboard3D { return this.body; }

  /** Ja sentado ao pe do fogo? */
  public get isSeated(): boolean { return this.seated; }

  /** Vai ate a fogueira e senta (ou só chega, com `sit` falso: quem veio buscar alguma coisa fica de pé). */
  public arrive(onSeated?: () => void, sit = true): void {
    this.walkTo(this.path.length - 1, () => {
      this.seated = true;
      onSeated?.();
      if (!sit) return;
      // SENTAR e a mesma pose do heroi: o corpo baixa e alarga um pouco.
      this.scene.tweens.add({ targets: this.body, displayHeight: 0.86, displayWidth: 1.04, duration: 380, ease: 'Sine.easeOut' });
    });
  }

  /** Levanta e volta para casa; `onHome` roda quando ele chega (e o corpo ja foi destruido). */
  public leave(onHome: () => void): void {
    this.seated = false;
    this.body.setDisplaySize(1, 1);
    this.walkTo(0, () => {
      this.destroy();
      onHome();
    });
  }

  public destroy(): void {
    this.tween?.remove();
    this.tween = undefined;
    this.scene.tweens.killTweensOf(this.body);
    this.body.destroy();
  }

  private walkTo(target: number, done: () => void): void {
    this.tween?.remove();
    const steps = Math.abs(target - this.t);
    if (steps < 0.01) { done(); return; }
    const k = { t: this.t };
    this.tween = this.scene.tweens.add({
      targets: k,
      t: target,
      duration: steps * this.stepMs,
      ease: 'Linear',
      onUpdate: () => { this.t = k.t; this.place(); },
      onComplete: () => {
        this.tween = undefined;
        this.t = target;
        this.place();
        this.body.setElevation(0);
        done();
      },
    });
  }

  /** Poe o corpo no ponto `t` do caminho, com o quique de um passo por tile. */
  private place(): void {
    const i = Math.min(this.path.length - 1, Math.floor(this.t));
    const j = Math.min(this.path.length - 1, i + 1);
    const f = this.t - i;
    const [ax, ay] = this.path[i];
    const [bx, by] = this.path[j];
    this.body.setPosition(ax + (bx - ax) * f, ay + (by - ay) * f);
    this.body.setElevation(Math.abs(Math.sin(this.t * Math.PI)) * 0.05);
  }
}

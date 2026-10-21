import Phaser from 'phaser';

import { NPC_VISUALS } from '@/game/constants';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';

/**
 * O GATO — a companhia que o vale da depois do primeiro favor.
 *
 * Ele NAO e um NPC: nao ocupa tile, nao bloqueia, nao conversa. E um corpo que anda atras do
 * heroi pelo RASTRO dele (os pontos por onde o heroi passou), e e isso que o impede de
 * atravessar parede sem pathfinding nenhum: todo ponto do rastro ja foi chao livre um instante
 * antes. Parado, ele fica onde o rastro termina, um passo atras; sentado na fogueira, ele vem
 * para o lado do heroi e se enrola.
 *
 * A arte e o frame do gato preto da folha de NPCs, desenhado de frente — e por isso nunca
 * espelha ao andar (espelhar so inverteria a luz, que nesta arte vem da esquerda).
 */

/** A distancia, em tiles DE CAMINHO, que ele guarda atras do heroi. */
const FOLLOW_TILES = 1.25;
/** Um ponto novo no rastro a cada quarto de tile andado. */
const TRAIL_STEP = 0.25;
/**
 * O rastro guarda bem mais que FOLLOW_TILES: se um ponto ainda nao andado cair da fila, o gato
 * iria em linha reta ate o seguinte — e reta e o que atravessa canto de parede.
 */
const TRAIL_MAX = 64;
/** Mais longe que isto (o Continue, um corte de cena) ele reaparece atras do heroi. */
const LOST_TILES = 6;
const SIZE = 0.7;

export class CatCompanion {
  private readonly body: Billboard3D;
  private readonly trail: Array<{ x: number; y: number }> = [];
  private x: number;
  private y: number;
  private walkPhase = 0;
  private curl = 0;
  private readonly breathPhase = Math.random() * Math.PI * 2;

  public constructor(private readonly scene: Phaser.Scene, x: number, y: number, arriving: boolean) {
    this.x = x;
    this.y = y;
    const visual = NPC_VISUALS.blackCat;
    this.body = world3d()
      .addBillboard(visual.key, visual.frame ?? 0, { groundShadow: true })
      .setPosition(x, y)
      .setDisplaySize(SIZE, SIZE);
    if (arriving) {
      // A CHEGADA: ele surge devagar e da um pulinho — "decidi que voce e meu".
      this.body.setAlpha(0);
      scene.tweens.add({ targets: this.body, alpha: 1, duration: 900, ease: 'Sine.easeOut' });
      this.hop(900);
    }
  }

  /** Onde ele esta desenhado, em tiles fracionarios. */
  public get position(): { x: number; y: number } { return { x: this.x, y: this.y }; }

  /**
   * Um passo do gato. `hero` e a posicao VISUAL do heroi (a que desliza durante o passo);
   * `restingBeside`, quando o heroi esta sentado, e o lugar ao lado dele onde o gato se enrola.
   */
  public update(deltaMs: number, hero: { x: number; y: number }, restingBeside: { x: number; y: number } | null): void {
    const k = Math.min(1, deltaMs / 1000);
    if (Math.hypot(hero.x - this.x, hero.y - this.y) > LOST_TILES) {
      // Perdido (o heroi apareceu longe): volta a nascer no rastro, sem atravessar o mundo.
      this.trail.length = 0;
      this.x = hero.x;
      this.y = hero.y;
    }
    let moving = false;
    if (restingBeside) {
      // SENTADO: o rastro de antes deixa de valer (ele esta ao lado, nao atras), e o gato vai ate
      // o lado do heroi — um palmo so, de onde o rastro o deixou.
      this.trail.length = 0;
      moving = this.stepToward(restingBeside, deltaMs, 1.4);
      this.curl = Math.min(1, this.curl + k * 1.5);
    } else {
      this.record(hero);
      this.curl = Math.max(0, this.curl - k * 3);
      // EM FILA: ele anda o MESMO caminho do heroi, ponto a ponto, e para quando o que falta ate
      // ele (pelo caminho) cabe em FOLLOW_TILES. Nunca corta canto, nem quando o heroi da meia-volta.
      const lag = this.pathLength(hero);
      if (lag > FOLLOW_TILES && this.trail.length > 0) {
        // Atrasado, ele aperta o passo; no ritmo, anda junto.
        const speed = 2.6 + Math.max(0, lag - FOLLOW_TILES) * 2.4;
        let budget = speed * deltaMs / 1000;
        while (budget > 0 && this.trail.length > 0 && this.pathLength(hero) > FOLLOW_TILES) {
          const next = this.trail[0];
          const seg = Math.hypot(next.x - this.x, next.y - this.y);
          if (seg <= budget) {
            this.x = next.x;
            this.y = next.y;
            this.trail.shift();
            budget -= seg;
          } else {
            this.x += ((next.x - this.x) / seg) * budget;
            this.y += ((next.y - this.y) / seg) * budget;
            budget = 0;
          }
          moving = true;
        }
      }
    }
    if (moving) this.walkPhase += deltaMs / 95;
    // O PASSO e um quique curto; parado ele respira; enrolado ele fica baixo e largo.
    const step = moving ? Math.abs(Math.sin(this.walkPhase)) * 0.06 : 0;
    const b = Math.sin(this.scene.time.now / 1100 + this.breathPhase);
    const w = SIZE * (1 + 0.14 * this.curl - 0.01 * b);
    const h = SIZE * (1 - 0.3 * this.curl + 0.025 * b);
    this.body.setPosition(this.x, this.y).setDisplaySize(w, h);
    if (!this.scene.tweens.isTweening(this.body)) this.body.setElevation(step);
  }

  /** O carinho: um pulinho de contente. */
  public pet(): void {
    this.hop(0);
  }

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.body);
    this.body.destroy();
  }

  private hop(delay: number): void {
    this.scene.tweens.add({
      targets: this.body, elevation: 0.18, duration: 150, yoyo: true, delay, ease: 'Sine.easeOut',
      onComplete: () => this.body.setElevation(0),
    });
  }

  private record(hero: { x: number; y: number }): void {
    const last = this.trail[this.trail.length - 1];
    if (last && Math.hypot(hero.x - last.x, hero.y - last.y) < TRAIL_STEP) return;
    this.trail.push({ x: hero.x, y: hero.y });
    if (this.trail.length > TRAIL_MAX) this.trail.shift();
  }

  /** O caminho que falta do gato ate o heroi: pelos pontos do rastro, nunca em linha reta. */
  private pathLength(hero: { x: number; y: number }): number {
    let total = 0;
    let from = { x: this.x, y: this.y };
    for (const p of this.trail) {
      total += Math.hypot(p.x - from.x, p.y - from.y);
      from = p;
    }
    return total + Math.hypot(hero.x - from.x, hero.y - from.y);
  }

  /** Anda em linha reta ate `goal` (so para distancias curtas). Devolve se ele se mexeu. */
  private stepToward(goal: { x: number; y: number }, deltaMs: number, speed: number): boolean {
    const dx = goal.x - this.x;
    const dy = goal.y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.02) return false;
    const step = Math.min(dist, speed * deltaMs / 1000);
    this.x += (dx / dist) * step;
    this.y += (dy / dist) * step;
    return true;
  }
}

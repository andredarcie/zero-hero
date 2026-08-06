import type { ChunkFrontier } from './explorerWorld';

/** Quiet pressure from unfinished roads: never announces a wave, and never floods the screen. */
export class ChunkUndeadDirector {
  private timerMs = 2400;
  private cursor = 0;

  public update(
    delta: number,
    gates: readonly ChunkFrontier[],
    alive: number,
    spawn: (worldX: number, worldY: number) => void,
  ): void {
    if (gates.length === 0) return;
    const cap = Math.min(4, Math.max(1, Math.ceil(gates.length / 3)));
    if (alive >= cap) return;
    this.timerMs -= delta;
    if (this.timerMs > 0) return;
    const gate = gates[this.cursor % gates.length];
    this.cursor += 1;
    spawn(gate.enemyX, gate.enemyY);
    this.timerMs = 4300 + Math.random() * 2600;
  }
}

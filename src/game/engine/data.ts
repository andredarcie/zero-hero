/**
 * O REGISTRO global do jogo (`this.registry`, `game.registry`) — o DataManager no que o jogo usa:
 * guardar, ler e apagar valores por chave.
 * Parte do motor próprio (src/game/engine).
 */
import { EventEmitter } from './events';

export class DataManager {
  public readonly events = new EventEmitter();
  private readonly list: Record<string, unknown> = {};

  public get<T = unknown>(key: string): T {
    return this.list[key] as T;
  }

  public set(key: string, value: unknown): this {
    const had = Object.prototype.hasOwnProperty.call(this.list, key);
    const previous = this.list[key];
    this.list[key] = value;
    if (had) this.events.emit('changedata', this, key, value, previous);
    else this.events.emit('setdata', this, key, value);
    return this;
  }

  public has(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.list, key);
  }

  public remove(key: string): this {
    if (this.has(key)) {
      const data = this.list[key];
      delete this.list[key];
      this.events.emit('removedata', this, key, data);
    }
    return this;
  }

  public getAll(): Record<string, unknown> {
    return { ...this.list };
  }
}

/**
 * O EMISSOR DE EVENTOS do motor — o contrato do `eventemitter3` (que o jogo inteiro escuta):
 * `on/once/off/emit` com contexto, ouvintes na ordem em que entraram, e um `emit` que percorre a lista DO MOMENTO em
 * que começou (quem entra ou sai durante a emissão vale só para a próxima).
 *
 * Parte do motor próprio (src/game/engine); licenças em LICENSES.md.
 */
/** Qualquer função serve de ouvinte (os argumentos são os do `emit`). */
export type ListenerFn = (...args: never[]) => unknown;
type Listener = { fn: ListenerFn; context: unknown; once: boolean };

export class EventEmitter {
  private _events: Map<string | symbol, Listener[]> = new Map();

  public on(event: string | symbol, fn: ListenerFn, context?: unknown): this {
    return this.addListenerInternal(event, fn, context, false);
  }

  public addListener(event: string | symbol, fn: ListenerFn, context?: unknown): this {
    return this.addListenerInternal(event, fn, context, false);
  }

  public once(event: string | symbol, fn: ListenerFn, context?: unknown): this {
    return this.addListenerInternal(event, fn, context, true);
  }

  private addListenerInternal(event: string | symbol, fn: ListenerFn, context: unknown, once: boolean): this {
    if (typeof fn !== 'function') throw new TypeError('The listener must be a function');
    const list = this._events.get(event);
    const l: Listener = { fn, context: context || this, once };
    if (list) list.push(l);
    else this._events.set(event, [l]);
    return this;
  }

  /** Sem `fn`, tira todos os ouvintes do evento; com `context`, só os daquele contexto. */
  public off(event: string | symbol, fn?: ListenerFn, context?: unknown, once?: boolean): this {
    const list = this._events.get(event);
    if (!list) return this;
    if (!fn) {
      this._events.delete(event);
      return this;
    }
    // Uma lista NOVA (e não a mesma, mexida): uma emissão em andamento segue com a de antes. O contexto vale só
    // quando é "verdadeiro", como no eventemitter3 (null/undefined = qualquer contexto).
    const kept = list.filter((l) => l.fn !== fn || (once && !l.once) || (Boolean(context) && l.context !== context));
    if (kept.length) this._events.set(event, kept);
    else this._events.delete(event);
    return this;
  }

  public removeListener(event: string | symbol, fn?: ListenerFn, context?: unknown, once?: boolean): this {
    return this.off(event, fn, context, once);
  }

  public removeAllListeners(event?: string | symbol): this {
    if (event === undefined) this._events = new Map();
    else this._events.delete(event);
    return this;
  }

  public emit(event: string | symbol, ...args: unknown[]): boolean {
    const list = this._events.get(event);
    if (!list) return false;
    const length = list.length;
    for (let i = 0; i < length; i++) {
      const l = list[i];
      if (l.once) this.off(event, l.fn, undefined, true);
      Reflect.apply(l.fn, l.context, args);
    }
    return true;
  }

  public listenerCount(event: string | symbol): number {
    return this._events.get(event)?.length ?? 0;
  }

  public listeners(event: string | symbol): Array<ListenerFn> {
    return (this._events.get(event) ?? []).map((l) => l.fn);
  }

  public eventNames(): Array<string | symbol> {
    return [...this._events.keys()];
  }
}

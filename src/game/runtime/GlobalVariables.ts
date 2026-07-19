// Runtime state for authored puzzle variables. The world file owns the names and initial
// booleans; mechanisms read/write this small store instead of knowing about one another.
// Keeping it independent of Phaser makes future doors, lights and cut-scenes easy consumers.
export class GlobalVariables {
  private readonly values = new Map<string, boolean>();

  public constructor(initial: Record<string, boolean> = {}) {
    Object.entries(initial).forEach(([name, value]) => this.values.set(name, value === true));
  }

  public has(name: string): boolean {
    return this.values.has(name);
  }

  public get(name: string): boolean {
    return this.values.get(name) ?? false;
  }

  public set(name: string, value: boolean): boolean {
    if (!this.values.has(name) || this.values.get(name) === value) return false;
    this.values.set(name, value);
    return true;
  }

  public snapshot(): Record<string, boolean> {
    return Object.fromEntries(this.values);
  }
}

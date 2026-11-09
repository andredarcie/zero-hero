// AS CONFERÊNCIAS DO EDITOR: o que impede de salvar (o herói nascendo dentro de parede, fora do mapa…) e os números do
// mapa. Só leitura.

import type { EditorStore } from './EditorStore';

/** O que EditorChecks usa de EditorStore. */
export type EditorChecksHost = Pick<EditorStore,
  'entities' | 'isInside' | 'readCell' | 'world'
>;

export class EditorChecks {
  public constructor(private readonly host: EditorChecksHost) {}

  /** Hard requirements shared by save and playtest: a start must exist on a walkable tile. */
  public startPointErrors(): string[] {
    const start = this.host.world.meta.playerStart as { worldX?: unknown; worldY?: unknown } | undefined;
    if (!start || !Number.isInteger(start.worldX) || !Number.isInteger(start.worldY)) {
      return ['Todo level precisa de um Ponto Inicial'];
    }
    const worldX = Number(start.worldX);
    const worldY = Number(start.worldY);
    if (!this.host.isInside(worldX, worldY)) return ['O Ponto Inicial esta fora do level'];
    if (this.host.readCell('collision', worldX, worldY) === true) {
      return ['O Ponto Inicial precisa estar em um tile sem colisao'];
    }
    return [];
  }

  public validate(): string[] {
    const warnings: string[] = [...this.startPointErrors()];

    let onCollision = 0;
    this.host.entities.allEntities().forEach((entity) => {
      if (this.host.readCell('collision', entity.worldX, entity.worldY) === true) onCollision += 1;
    });
    if (onCollision > 0) warnings.push(`${onCollision} entidade(s) em cima de colisao`);

    // CHAO + UMA COISA. O editor ja impede isto ao colocar (placeEntity) e ao pintar (setCell);
    // este aviso e para o JSON escrito a mao ou por script, que e por onde as 45 pilhas do
    // world.json entraram. O conserto em massa e `node scripts/fix-tile-stacks.mjs`.
    const occupied = new Map<string, number>();
    this.host.entities.allEntities().forEach((entity) => {
      const key = `${entity.worldX},${entity.worldY}`;
      occupied.set(key, (occupied.get(key) ?? 0) + 1);
    });
    let stacked = 0;
    occupied.forEach((count, key) => {
      const [wx, wy] = key.split(',').map(Number);
      if (count > 1 || this.host.readCell('upper', wx, wy) !== null) stacked += 1;
    });
    if (stacked > 0) {
      warnings.push(`${stacked} tile(s) com mais de uma coisa em cima do chao — rode scripts/fix-tile-stacks.mjs`);
    }

    // UM NPC, UM LUGAR. O editor ja impede isto ao colocar (ver placeEntity); este aviso e para o
    // JSON escrito a mao ou por script, que e por onde a regra entrou quebrada da primeira vez.
    const npcSeen = new Map<string, number>();
    this.host.entities.allEntities().forEach((entity) => {
      if (entity.list !== 'npcs') return;
      npcSeen.set(entity.type, (npcSeen.get(entity.type) ?? 0) + 1);
    });
    const repeated = [...npcSeen.entries()].filter(([, count]) => count > 1);
    if (repeated.length > 0) {
      warnings.push(
        `NPC repetido (so pode haver um de cada no mapa): ${repeated.map(([kind, count]) => `${kind} x${count}`).join(', ')}`,
      );
    }

    return warnings;
  }

  public stats(): { npcs: number; pickups: number; props: number } {
    const all = this.host.entities.allEntities();
    return {
      npcs: all.filter((e) => e.list === 'npcs').length,
      pickups: all.filter((e) => e.list === 'pickups').length,
      props: all.filter((e) => e.list === 'props').length,
    };
  }
}

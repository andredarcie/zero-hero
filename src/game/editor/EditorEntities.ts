// AS PEÇAS DO MAPA NO EDITOR: o que está num tile, todas as peças, pôr uma (no lugar da que estava) e apagar as de um
// tile — sempre pelo histórico, para o Ctrl+Z valer.

import type { PlacedEntity } from './EditorHistory';
import type { EditorStore } from './EditorStore';

// A direcao PRECISA entrar nesta comparacao. placeEntity trata "ja tem isso aqui" como um
// no-op, e sem o `dir` girar um braco no proprio tile seria exatamente isso: o editor
// concluiria que nada mudou e o giro nao aconteceria.
const sameEntity = (a: PlacedEntity, b: PlacedEntity): boolean =>
  a.list === b.list && a.type === b.type && a.worldX === b.worldX && a.worldY === b.worldY
  && (a.list !== 'props' || b.list !== 'props' || a.dir === b.dir);

/** O que EditorEntities usa de EditorStore. */
export type EditorEntitiesHost = Pick<EditorStore,
  'chunkAt' | 'emit' | 'history' | 'isInside' | 'markDirty' | 'readCell' | 'setCell' | 'world'
>;

export class EditorEntities {
  public constructor(private readonly host: EditorEntitiesHost) {}

  public entitiesAt(wx: number, wy: number): PlacedEntity[] {
    const found: PlacedEntity[] = [];
    const chunk = this.host.chunkAt(wx, wy);
    if (chunk) {
      chunk.npcs.forEach((n) => { if (n.worldX === wx && n.worldY === wy) found.push({ list: 'npcs', ...n }); });
      chunk.pickups.forEach((p) => { if (p.worldX === wx && p.worldY === wy) found.push({ list: 'pickups', ...p }); });
    }
    this.host.world.props.forEach((p) => {
      if (p.worldX === wx && p.worldY === wy) found.push({ list: 'props', type: p.type, worldX: p.worldX, worldY: p.worldY, dir: p.dir });
    });
    return found;
  }

  public allEntities(): PlacedEntity[] {
    const all: PlacedEntity[] = [];
    this.host.world.chunks.forEach((chunk) => {
      chunk.npcs.forEach((n) => all.push({ list: 'npcs', ...n }));
      chunk.pickups.forEach((p) => all.push({ list: 'pickups', ...p }));
    });
    this.host.world.props.forEach((p) => all.push({ list: 'props', type: p.type, worldX: p.worldX, worldY: p.worldY, dir: p.dir }));
    return all;
  }

  /**
   * Põe UMA coisa no tile — e o tile fica com uma coisa só.
   *
   * **CHÃO + UMA COISA** é a lei do tabuleiro, e é aqui que ela se cumpre na hora de colocar: sai
   * tudo o que estava naquele tile (prop, item, NPC, cova — não só a lista da peça nova) e sai
   * também o tile de CIMA, se houver. Antes daqui a limpeza era só da MESMA lista, então largar um
   * prop em cima de um item guardava os dois e o mundo ganhava uma pilha por clique — foi assim
   * que 45 delas apareceram no world.json (ver scripts/fix-tile-stacks.mjs).
   *
   * Trocar em vez de recusar pelo mesmo motivo do NPC logo abaixo: um clique que não faz nada não
   * ensina nada. E tudo entra no MESMO op, então um Ctrl+Z devolve o tile inteiro — a peça velha,
   * o item que estava lá e a folhagem por cima.
   */
  public placeEntity(entity: PlacedEntity): void {
    if (!this.host.isInside(entity.worldX, entity.worldY)) return;
    const removed = this.entitiesAt(entity.worldX, entity.worldY);
    // Nada a fazer só quando o tile JÁ está do jeito que o clique quer — a peça certa e nada em
    // cima dela. Com folhagem por cima (um arquivo antigo, um script), o clique ainda tem trabalho.
    const stacked = this.host.readCell('upper', entity.worldX, entity.worldY) !== null;
    if (removed.length === 1 && sameEntity(removed[0], entity) && !stacked) return;

    // Um gesto, um desfazer: se o chamador já abriu um traço (arrastar o pincel de entidades),
    // isto entra nele; se não, abre o seu e fecha no fim.
    const ownStroke = !this.host.history.strokeOps;
    if (ownStroke) this.host.history.beginStroke();
    this.host.setCell('upper', entity.worldX, entity.worldY, null);

    // UM NPC APARECE UMA VEZ SO NO MAPA. Por um personagem que ja existe em outro tile e MOVE-LO,
    // nao clona-lo: o mesmo gato em dez telas deixa de ser um personagem e vira cenario, e a fala
    // dele deixa de ser de alguem. Mover em vez de recusar porque um clique que nao faz nada nao
    // ensina nada — e a mudanca inteira entra no MESMO op, entao Ctrl+Z devolve o personagem ao
    // lugar de onde ele veio. Vale so pra NPC: cova, pickup e prop se repetem por desenho.
    if (entity.list === 'npcs') {
      for (const other of this.allEntities()) {
        if (other.list !== 'npcs' || other.type !== entity.type) continue;
        if (other.worldX === entity.worldX && other.worldY === entity.worldY) continue;
        this.removeEntityFromWorld(other);
        removed.push(other);
      }
    }

    removed.forEach((e) => this.removeEntityFromWorld(e));
    this.addEntityToWorld(entity);
    this.host.history.recordOp({ kind: 'entities', added: [entity], removed });
    if (ownStroke) this.host.history.commitStroke();
    this.host.markDirty();
    this.host.emit({ entities: true });
  }

  public eraseEntitiesAt(wx: number, wy: number): boolean {
    const removed = this.entitiesAt(wx, wy);
    if (removed.length === 0) return false;
    removed.forEach((e) => this.removeEntityFromWorld(e));
    this.host.history.recordOp({ kind: 'entities', added: [], removed });
    this.host.markDirty();
    this.host.emit({ entities: true });
    return true;
  }

  public addEntityToWorld(entity: PlacedEntity): void {
    if (entity.list === 'props') {
      this.host.world.props.push({
        type: entity.type,
        worldX: entity.worldX,
        worldY: entity.worldY,
        ...(entity.dir === undefined ? {} : { dir: entity.dir }),
      });
      return;
    }
    const chunk = this.host.chunkAt(entity.worldX, entity.worldY);
    if (!chunk) return;
    if (entity.list === 'npcs') chunk.npcs.push({ type: entity.type, worldX: entity.worldX, worldY: entity.worldY });
    else chunk.pickups.push({ type: entity.type, worldX: entity.worldX, worldY: entity.worldY });
  }

  public removeEntityFromWorld(entity: PlacedEntity): void {
    if (entity.list === 'props') {
      const index = this.host.world.props.findIndex((p) => p.type === entity.type && p.worldX === entity.worldX && p.worldY === entity.worldY);
      if (index >= 0) this.host.world.props.splice(index, 1);
      return;
    }
    const chunk = this.host.chunkAt(entity.worldX, entity.worldY);
    if (!chunk) return;
    const list = chunk[entity.list] as Array<{ type: string; worldX: number; worldY: number }>;
    const index = list.findIndex((e) => e.type === entity.type && e.worldX === entity.worldX && e.worldY === entity.worldY);
    if (index >= 0) list.splice(index, 1);
  }
}

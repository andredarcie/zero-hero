// AS COISAS NO CHÃO: onde um item pode pousar (nunca na frente de um vizinho, nunca preso), o que cai da árvore e da
// pedra, e o item solto que salta para perto.

import { TREE_STICK_YIELD } from '@/game/constants';
import { isDecorKind, type HeldItemKind } from '@/game/entities/ItemPickup';
import { RockObject } from '@/game/objects/RockObject';
import { isMushroomKind } from '@/game/fungi/fungi';
import { npcFacing, npcFrontKeys, npcSideTiles, type NpcTile } from '@/game/world/npcFront';
import { getSoundManager } from '@/game/audio/SoundManager';
import { getNpcTiles } from '@/game/world/WorldData';
import type { GameScene } from '../GameScene';
import { CARDINAL_DIRS } from './sceneDefs';

/** Até onde o herói anda para buscar o que pousou perto dele. */
const DROP_WALK_TILES = 12;

/** O que GroundItems usa de GameScene. */
export type GroundItemsHost = Pick<GameScene,
  'chunkManager' | 'itemManager' | 'npcManager' | 'orders' | 'playerWorld' | 'props' | 'query' | 'save'
  | 'swing'
>;

export class GroundItems {
  /** As casas dos NPCs do mapa (lidas uma vez): de quem é a frente proibida para item. */
  public npcHouseTiles?: NpcTile[];

  public constructor(private readonly host: GroundItemsHost) {}

  /**
   * POUSAR PERTO: o tile livre mais perto de (x, y), ele mesmo primeiro. Para o que chega ao herói
   * sem caber na mão (o segundo presente, a mochila de um save antigo). Sem chão livre em volta, a
   * busca abre mais um anel — nada some.
   */
  public dropNear(
    kind: HeldItemKind, units: number | undefined, x: number, y: number, fire?: { fuelMs: number },
  ): [number, number] | null {
    if (!this.host.itemManager) return null;
    // SÓ ONDE O HERÓI CHEGA A PÉ. O tile livre mais perto pode ser um bolsão fechado: o machado do Marco caía atrás do
    // cepo, e como ele só dá outro se não houver nenhum no chão, a partida travava para sempre, e o save lembrava.
    const reachable = this.tilesWithinWalk(DROP_WALK_TILES);
    // A FRENTE DO NPC (world/npcFront): o que ia cair ali — o herói conversando de mão cheia e ganhando outra
    // coisa — vai para a direita do NPC, depois a esquerda, depois para trás dele.
    const facing = this.itemForbiddenAt(x, y) ? npcFacing(x, y, this.npcTiles()) : null;
    for (const side of facing ? npcSideTiles(facing) : []) {
      if (!this.itemFreeAt(side.x, side.y) || !reachable.has(`${side.x},${side.y}`)) continue;
      this.host.itemManager.drop(kind, side.x, side.y, fire, units);
      return [side.x, side.y];
    }
    for (const onlyReachable of [true, false]) {
      for (let r = 0; r <= 4; r += 1) {
        for (let oy = -r; oy <= r; oy += 1) {
          for (let ox = -r; ox <= r; ox += 1) {
            if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
            const tx = x + ox;
            const ty = y + oy;
            if (this.host.query.isTileTaken(tx, ty) || this.itemForbiddenAt(tx, ty)) continue;
            if (tx === this.host.playerWorld.worldX && ty === this.host.playerWorld.worldY && r > 0) continue;
            if (onlyReachable && !reachable.has(`${tx},${ty}`)) continue;
            this.host.itemManager.drop(kind, tx, ty, fire, units);
            return [tx, ty];
          }
        }
      }
    }
    return null;
  }

  /** Os NPCs do mapa (a casa de cada um) e os que estão de pé agora — de quem é a frente proibida. */
  private npcTiles(): NpcTile[] {
    this.npcHouseTiles ??= getNpcTiles();
    return [...this.npcHouseTiles, ...(this.host.npcManager?.getActiveWorldPositions() ?? [])];
  }

  /** A FRENTE DE UM NPC: nenhum item fica ali (world/npcFront). */
  public itemForbiddenAt(x: number, y: number): boolean {
    return npcFrontKeys(this.npcTiles()).has(`${x},${y}`);
  }

  /** Um item pode cair aqui: chão livre, sem item, fora da frente de NPC e fora do herói. */
  private itemFreeAt(x: number, y: number): boolean {
    return !this.host.query.isTileTaken(x, y) && !this.itemForbiddenAt(x, y)
      && !(x === this.host.playerWorld.worldX && y === this.host.playerWorld.worldY);
  }

  /**
   * O PONTO ÚNICO POR ONDE UM ITEM NOVO CAI NO CHÃO. Fora da frente de NPC, cai onde pediram; na frente, vai para o
   * lado do NPC (dropNear). Devolve onde caiu — o arco do item desenha até lá.
   */
  public dropItem(
    kind: HeldItemKind, x: number, y: number, fire?: { fuelMs: number }, units?: number,
  ): [number, number] | null {
    if (!this.host.itemManager) return null;
    if (!this.itemForbiddenAt(x, y)) {
      this.host.itemManager.drop(kind, x, y, fire, units);
      return [x, y];
    }
    return this.dropNear(kind, units, x, y, fire);
  }

  /**
   * Um save de antes da regra (ou um mundo autorado errado) com item na frente de um NPC: ele vai para o lado.
   * Devolve quantos mudaram de lugar.
   */
  public enforceNpcFrontRule(): number {
    if (!this.host.itemManager) return 0;
    let moved = 0;
    for (const item of this.host.itemManager.snapshot()) {
      if (!this.itemForbiddenAt(item.worldX, item.worldY)) continue;
      const taken = this.host.itemManager.takeAt(item.worldX, item.worldY);
      if (!taken) continue;
      this.dropItem(taken.kind, item.worldX, item.worldY, taken.fire, taken.units);
      moved += 1;
    }
    if (moved > 0) this.host.save.persistAdventure();
    return moved;
  }

  /**
   * NADA PRESO DENTRO DE UMA COISA SÓLIDA: o save guarda os itens do chão, mas não as árvores secas derrubadas — no
   * load elas estão de pé de novo, e um graveto que ficou no tile de uma delas sumia dentro do tronco para sempre. O
   * que estiver debaixo de um prop sólido vai para o tile livre mais perto. Devolve quantos mudaram de lugar.
   */
  public freeTrappedItems(): number {
    if (!this.host.itemManager) return 0;
    let moved = 0;
    for (const item of this.host.itemManager.snapshot()) {
      if (isMushroomKind(item.kind) || isDecorKind(item.kind)) continue;
      const trapped = this.host.chunkManager?.isCellBlocked(item.worldX, item.worldY)
        || this.host.props.propRegistry.some((entry) => this.host.query.propAt(entry.list, item.worldX, item.worldY)?.blocking);
      if (!trapped) continue;
      const taken = this.host.itemManager.takeAt(item.worldX, item.worldY);
      if (!taken) continue;
      this.dropNear(taken.kind, taken.units, item.worldX, item.worldY, taken.fire);
      moved += 1;
    }
    if (moved > 0) this.host.save.persistAdventure();
    return moved;
  }

  /** Os tiles a até `steps` passos do herói, andando pelo chão livre. */
  private tilesWithinWalk(steps: number): Set<string> {
    const start: [number, number, number] = [this.host.playerWorld.worldX, this.host.playerWorld.worldY, 0];
    const seen = new Set<string>([`${start[0]},${start[1]}`]);
    const queue = [start];
    for (let head = 0; head < queue.length; head += 1) {
      const [x, y, walked] = queue[head];
      if (walked >= steps) continue;
      for (const [dx, dy] of CARDINAL_DIRS) {
        const key = `${x + dx},${y + dy}`;
        if (seen.has(key) || this.host.query.isSolidForEntities(x + dx, y + dy)) continue;
        seen.add(key);
        queue.push([x + dx, y + dy, walked + 1]);
      }
    }
    return seen;
  }

  /**
   * Deixa o PRODUTO de uma ferramenta no chao. O tile do obstaculo acabou de abrir e e o
   * lugar natural — mas se um item ja estiver ali (um braco depositou na janela do corte, um
   * swap), o produto NAO evapora: cai no primeiro vizinho cardeal livre. "Items should
   * PRODUCE" so vale se a producao chega ao chao; a regra "um item por tile" continua
   * absoluta — suprimir e o ultimo recurso, apenas com todos os vizinhos tomados.
   */
  public dropProduct(
    kind: HeldItemKind, worldX: number, worldY: number, units?: number,
  ): void {
    if (!this.host.itemManager) return;
    if (!this.host.itemManager.hasItemAt(worldX, worldY) && !this.itemForbiddenAt(worldX, worldY)) {
      this.host.itemManager.drop(kind, worldX, worldY, undefined, units);
      this.host.save.persistAdventure();
      return;
    }
    for (const [dx, dy] of CARDINAL_DIRS) {
      const nx = worldX + dx;
      const ny = worldY + dy;
      // O produto nunca cai num rio, na lava ou dentro de um corpo solido — um item so pousa
      // onde o heroi pode pisar pra busca-lo.
      if (this.host.query.isSolidForEntities(nx, ny) || this.host.itemManager.hasItemAt(nx, ny) || this.itemForbiddenAt(nx, ny)) continue;
      this.host.itemManager.drop(kind, nx, ny, undefined, units);
      this.host.save.persistAdventure();
      return;
    }
  }

  public dropTreeStick(worldX: number, worldY: number): void {
    // Um galho por árvore (TREE_STICK_YIELD).
    this.host.swing.dropFallingStick(worldX, worldY, TREE_STICK_YIELD);
  }

  /**
   * O que uma pedra ESTOURADA deixa pra tras: pedra, ou um bloco de ferro se ela tinha veio.
   *
   * Existe como funcao propria porque DOIS caminhos quebram pedra — a picareta e a explosao —
   * e eles ja tinham divergido uma vez. Com a regra escrita em dois lugares, uma pedra de
   * minerio aberta a bomba largaria calmamente uma pedra comum, e o jogador levaria um bom
   * tempo pra desconfiar que o defeito era esse.
   */
  public dropRockSpoil(rock: RockObject): void {
    // A rocha de VEIO entrega MINERIO, nao ferro: o que sai de uma pedra e pedra com oxido
    // dentro. O metal so existe depois do forno — e essa etapa e a peca inteira desta cadeia.
    this.dropProduct(rock.product, rock.worldX, rock.worldY);
  }

  /**
   * O bloco que o VEIO produz SALTA E ESPALHA (pedido do usuário: minerar tem que fluir):
   * pula da pedra, quica num tile vizinho e se pega ANDANDO por cima — a exceção deliberada
   * ao "nada entra na mochila por pisada". A outra metade da exceção: `stash`, nunca `add` —
   * o minério entra na mochila e a MÃO do herói fica exatamente com o que estava (a picareta,
   * no meio da mineração, não pode ser roubada por cada bloco que cai).
   */
  public spawnOreLoot(rock: RockObject): void {
    // A MÃO ESTÁ COM A PICARETA: o minério SALTA do veio para o chão ao lado e espera ser levado
    // (ele corria até o herói e entrava na mochila, que não existe mais).
    const at = this.dropNear(rock.product, 1, rock.worldX, rock.worldY);
    if (at) this.host.orders.flingCraftedItem(rock.product, rock.worldX, rock.worldY, at[0], at[1]);
    getSoundManager().ui.playItemStash();
    this.host.save.persistAdventure();
  }
}

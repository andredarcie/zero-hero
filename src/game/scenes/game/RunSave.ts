// O SAVE DA AVENTURA: o retrato da partida (onde está, o que tem, o que já viu, o que está no chão) no localStorage.

import { getDay, getTimeOfDay } from '@/game/runtime/timeOfDay';
import { adventureState, saveAdventure, type AdventureGroundItem } from '@/game/runtime/adventureState';
import { nearestRoomyTile } from '@/game/world/roomyTile';
import type { GameScene } from '../GameScene';

/** O que RunSave usa de GameScene. */
export type RunSaveHost = Pick<GameScene,
  'adventure' | 'arc' | 'inventory' | 'itemManager' | 'machines' | 'movementController'
  | 'playerWorld' | 'props' | 'query' | 'seenDialogKeys' | 'seenItems'
>;

/** Os vizinhos que servem de volta a quem está em cima de algo, a FRENTE primeiro (quem senta olha para baixo). */
const STEP_OFF: ReadonlyArray<readonly [number, number]> = [[0, 1], [0, -1], [-1, 0], [1, 0]];

export class RunSave {
  // Qual arquivo de mundo esta aberto ('world' ou 'under') — a chave da foto de itens no
  // chao dentro do save.
  public adventureScope = 'world';

  public constructor(private readonly host: RunSaveHost) {}

  /**
   * Fotografa o que e volatil na cena (mochila, itens no chao, dialogos, missoes) para dentro do
   * adventureState e grava. Chamado nos eventos que mudam o mundo — acender fogueira,
   * pegar/pousar item, fabricar, falar, viajar, morrer — e barato o bastante para nao ser
   * economizado: o retrato inteiro tem poucos KB.
   */
  public persistAdventure(): void {
    if (!this.host.adventure) return;
    const st = adventureState();
    st.started = true;
    st.inventory = this.host.inventory.list();
    st.selected = this.host.inventory.selected;
    // (A jornada — abertura, chave, portão, névoa, fogueira, fim — já mora no save: ver systems/RunArc.)
    st.day = getDay();
    st.clock = getTimeOfDay();
    // De onde ele CONTINUA: o tile em que esta agora. Durante a abertura ele ainda nao chegou a
    // lugar nenhum, entao o retrato nao anda (o Continue o poria no meio da caminhada).
    if (this.host.arc.has('intro')) st.respawn = this.respawnTile();
    st.seenDialogKeys = new Set(this.host.seenDialogKeys);
    st.seenItems = new Set(this.host.seenItems);
    if (this.host.itemManager) {
      const ground: AdventureGroundItem[] = this.host.itemManager.snapshot().map((s) => ({
        kind: s.kind, worldX: s.worldX, worldY: s.worldY, count: s.units,
      }));
      // A FORNADA EM CURSO vai ao save como a peca que ela vai virar, na boca do forno: os insumos
      // ja sairam da mochila, e sem isto fechar o jogo nos ~4s do fole sumia com eles.
      for (const furnace of this.host.props.furnaces) {
        const pending = furnace.pendingProduct;
        if (pending) ground.push({ kind: pending.kind, worldX: pending.tile[0], worldY: pending.tile[1], count: pending.units });
      }
      st.groundItems.set(this.adventureScope, ground);
    }
    // Estações construídas pelo jogador. As autoradas já moram no world.json.
    st.machines.set(this.adventureScope, this.host.machines.snapshotBuiltMachines());
    saveAdventure();
  }

  /**
   * O tile de onde ele continua. Sentado EM CIMA de algo (a pedra de meditar, um achado com vista, o colchão) o tile
   * dele é sólido, e o Continue o punha dentro da pedra: volta-se do vizinho livre DE ONDE SE SAI ANDANDO, a frente
   * primeiro. Só "livre" não basta: do colchão, o primeiro livre era o beco do varal da Shui, e o herói voltava preso.
   */
  private respawnTile(): { worldX: number; worldY: number } {
    const { worldX, worldY } = this.host.playerWorld;
    const solid = (x: number, y: number): boolean => this.host.query.isSolidForEntities(x, y);
    if (!solid(worldX, worldY)) return { worldX, worldY };
    const roomy = nearestRoomyTile(worldX, worldY, solid, 1);
    if (roomy) return { worldX: roomy.x, worldY: roomy.y };
    const free = STEP_OFF.find(([dx, dy]) => !solid(worldX + dx, worldY + dy));
    return free ? { worldX: worldX + free[0], worldY: worldY + free[1] } : { worldX, worldY };
  }

  /**
   * CONTINUAR NUM BECO NÃO PRENDE: um save de antes do conserto acima pode ter o herói num tile livre cercado de
   * peças. Com o mundo montado (as lembranças do acampamento incluídas), ele continua do tile com espaço mais perto.
   */
  public unstickHero(): void {
    const { worldX, worldY } = this.host.playerWorld;
    const to = nearestRoomyTile(worldX, worldY, (x, y) => this.host.query.isSolidForEntities(x, y));
    if (!to || (to.x === worldX && to.y === worldY)) return;
    this.host.playerWorld.worldX = to.x;
    this.host.playerWorld.worldY = to.y;
    this.host.movementController?.interruptMovement(to.x, to.y);
  }
}

// O SAVE DA AVENTURA: o retrato da partida (onde está, o que tem, o que já viu, o que está no chão) no localStorage.

import { getDay, getTimeOfDay } from '@/game/runtime/timeOfDay';
import { adventureState, saveAdventure, type AdventureGroundItem } from '@/game/runtime/adventureState';
import type { GameScene } from '../GameScene';

/** O que RunSave usa de GameScene. */
export type RunSaveHost = Pick<GameScene,
  'adventure' | 'gateOpened' | 'hearthLit' | 'introDone' | 'inventory' | 'itemManager' | 'machines'
  | 'playerWorld' | 'props' | 'roasted' | 'seenDialogKeys' | 'seenItems'
>;

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
    st.introSeen = this.host.introDone;
    st.gateOpened = this.host.gateOpened;
    st.hearthLit = this.host.hearthLit;
    st.endingSeen = this.host.roasted;
    st.day = getDay();
    st.clock = getTimeOfDay();
    // De onde ele CONTINUA: o tile em que esta agora. Durante a abertura ele ainda nao chegou a
    // lugar nenhum, entao o retrato nao anda (o Continue o poria no meio da caminhada).
    if (this.host.introDone) st.respawn = { worldX: this.host.playerWorld.worldX, worldY: this.host.playerWorld.worldY };
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
}

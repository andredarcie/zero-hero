// AS ESTAÇÕES DO JOGADOR: pôr um forno ou um altar no chão (onde cabe, com a marca de onde cabe), recolher, e lembrar
// no save o que foi construído.

import { MACHINE_ITEM_KINDS, type HeldItemKind } from '@/game/entities/ItemPickup';
import { FurnaceObject } from '@/game/objects/FurnaceObject';
import { AltarObject } from '@/game/objects/AltarObject';
import type { WorldProp } from '@/game/objects/WorldProp';
import type { PropDir } from '@/game/world/worldSchema';
import { getSoundManager } from '@/game/audio/SoundManager';
import { adventureState, type AdventureMachine } from '@/game/runtime/adventureState';
import type * as Engine from '@/game/engine';
import type { GameScene } from '../GameScene';
import { PlacementHints } from '@/game/runtime/PlacementHints';

/**
 * A direcao que veio do SAVE, domada. Um numero gravado por uma versao anterior (ou por uma
 * mao humana no localStorage) nao pode virar um frame fora da folha.
 */
const asPropDir = (value: number | undefined): PropDir => {
  const n = Math.trunc(value ?? 1);
  return (Number.isFinite(n) ? (((n % 4) + 4) % 4) : 1) as PropDir;
};

/** O que Machines usa de GameScene (e a cena do motor, que ele passa a quem monta objetos do mundo). */
export type MachinesHost = Engine.Scene & Pick<GameScene,
  'adventure' | 'carry' | 'chunkManager' | 'hand' | 'heldItem' | 'inventory' | 'props' | 'query' | 'save'
  | 'swing' | 'verbs'
>;

export class Machines {
  /** As marcas de "a peça cai aqui" — o quadrado no chão e o keycap (ver PlacementHints). */
  public placementHints?: PlacementHints;

  public constructor(private readonly host: MachinesHost) {}

  /**
   * Há uma estação manual neste tile? Uma pergunta só para construção e restauração do save.
   */
  private machineAt(wx: number, wy: number): boolean {
    return this.host.query.getFurnaceAt(wx, wy) !== undefined || this.host.query.getAltarAt(wx, wy) !== undefined;
  }

  /**
   * INSTALAR a estação que esta na mao no tile a frente. Devolve `false` quando o item não é uma
   * estação — e ai a tabela do A segue para as outras linhas dela.
   *
   * A DIREÇÃO nasce de para onde o herói está olhando, nunca de um menu.
   */
  public buildMachineAt(wx: number, wy: number): boolean {
    const kind = this.host.heldItem;
    if (kind === 'none' || !MACHINE_ITEM_KINDS.has(kind)) return false;
    if (!this.canBuildMachineAt(kind, wx, wy)) {
      this.host.swing.swingHeld(wx, wy);
      getSoundManager().ui.playToolboxRefuse();
      return true;
    }
    const dir = this.host.verbs.facingDirIndex();
    if (!this.installMachine(kind, wx, wy, dir)) return false;
    this.host.inventory.remove(kind, 1);
    this.host.carry.updateBackItem();
    // O mesmo martelo da bancada: montar uma estação soa como fabricação. Um som novo
    // aqui ensinaria que instalar e outra categoria de gesto, e nao e — e fabricacao.
    getSoundManager().ui.playToolboxDeliver();
    this.host.save.persistAdventure();
    return true;
  }

  /**
   * O ATO de pôr a estação no mundo, sem nada em volta: nem cobrar a mochila, nem tocar som, nem
   * gravar o save. E o corpo compartilhado entre o gesto do jogador (`buildMachineAt`), a volta
   * do save (`restoreBuiltMachines`) e o hook de teste — porque a alternativa e a construcao
   * existir escrita tres vezes.
   *
   * Devolve `false` para um item que nao vira prop, nunca para um tile ruim: quem
   * checa o tile e quem chama, porque cada um deles recusa de um jeito diferente (o jogador ve
   * o gesto falhar, o save simplesmente descarta a peca).
   */
  private installMachine(kind: HeldItemKind, wx: number, wy: number, dir: PropDir): boolean {
    switch (kind) {
      case 'furnace': this.host.props.furnaces.push(new FurnaceObject(this.host, wx, wy, dir, true)); break;
      // O ALTAR nao recebe `dir`: ele nao tem frente — e uma laje, e se trabalha nela de qualquer
      // lado. Uma peca que aceitasse direcao sem usa-la ensinaria que o G do editor faz algo aqui.
      case 'altar': this.host.props.altars.push(new AltarObject(this.host, wx, wy, true)); break;
      default: return false;
    }
    return true;
  }

  /**
   * ESTE TILE ACEITA ESTA PECA? — a pergunta que o botao e a MARCA fazem, e por isso ela existe
   * uma vez so. Duas copias divergindo seria o pior defeito possivel desta reforma: um quadrado
   * branco no chao prometendo um gesto que o botao recusa.
   *
   * `machineAt` entra na conta para a construção e a restauração concordarem sobre ocupação.
   */
  /**
   * A PEGADA de uma estação: todo tile que ela vai ocupar depois de instalada.
   */
  private machineFootprint(_kind: HeldItemKind, wx: number, wy: number): Array<[number, number]> {
    return [[wx, wy]];
  }

  public canBuildMachineAt(kind: HeldItemKind, wx: number, wy: number): boolean {
    if (!MACHINE_ITEM_KINDS.has(kind)) return false;
    for (const [tx, ty] of this.machineFootprint(kind, wx, wy)) {
      if (this.host.query.isTileOccupied(tx, ty) || this.machineAt(tx, ty)) return false;
    }
    return true;
  }

  public syncPlacementHints(): void {
    const hints = this.placementHints;
    if (!hints) return;
    const kind = this.host.heldItem;
    if (kind === 'none' || !MACHINE_ITEM_KINDS.has(kind)) {
      hints.clear();
      return;
    }
    const { x, y } = this.host.verbs.facingTile();
    const target = this.canBuildMachineAt(kind, x, y) ? { x, y } : null;
    hints.show(target);
  }

  /**
   * RECOLHER a maquina que esta a frente. TUDO que se instala se recolhe — inclusive o que o
   * mapa autorou.
   *
   * Isto e o par exato do `buildMachineAt`, e a razao de a construcao ser segura: todo gesto
   * deste jogo que poe alguma coisa no mundo tem um gesto que a tira (pousar com B, pegar com
   * B). Sem a volta, errar um tile custaria a peca — e o jogador pararia de experimentar, que e
   * o que mantém a experimentação segura.
   *
   * O campo `playerBuilt` continua existindo porque é ele que diz o que vai ao
   * SAVE (o mundo autorado ja mora no world.json; gravar tudo o duplicaria no proximo boot).
   */
  public pickUpMachineAt(wx: number, wy: number): boolean {
    // A máquina recolhida vai para a MÃO, então ela precisa estar vazia.
    if (this.host.heldItem !== 'none') return false;
    // O FORNO DA THEA É FIXO (pedido do autor): é o guia da quest e não sai do lugar. O tranco diz isso.
    const furnace = this.host.query.getFurnaceAt(wx, wy);
    if (furnace) {
      furnace.bump();
      getSoundManager().ui.playToolboxRefuse();
      return true;
    }
    // A LAJE VAZIA sobe; com uma peça em cima, não — o X ali é o gesto de tirar a peça (ver
    // `workAltarAt`), e ele roda antes deste. É a mesma regra de um recipiente cheio, e pela mesma
    // razão: recolher um móvel com carga dentro é a carga sumindo em silêncio.
    const altar = this.host.query.getAltarAt(wx, wy);
    if (altar && altar.carrying === null && altar.playerBuilt) {
      this.removeProp(this.host.props.altars, altar);
      return this.collectMachine('altar', wx, wy);
    }
    return false;
  }

  /** Tira o prop da lista IN PLACE (o propRegistry referencia ESTES arrays) e o destroi. */
  private removeProp<T extends WorldProp>(list: T[], prop: T): void {
    const idx = list.indexOf(prop);
    if (idx >= 0) list.splice(idx, 1);
    prop.destroy();
  }

  /** A peca recolhida volta para a mochila pelo caminho de qualquer item apanhado. */
  private collectMachine(kind: HeldItemKind, wx: number, wy: number): boolean {
    this.host.hand.onCollectItem({ kind, worldX: wx, worldY: wy });
    return true;
  }

  /** O diff de estações manuais que vai ao save: só as peças do jogador. */
  public snapshotBuiltMachines(): AdventureMachine[] {
    const out: AdventureMachine[] = [];
    for (const furnace of this.host.props.furnaces) {
      if (!furnace.playerBuilt) continue;
      out.push({
        type: 'furnace', worldX: furnace.worldX, worldY: furnace.worldY, dir: furnace.dir,
      });
    }
    // A LAJE nao guarda `dir` (nao tem frente) nem o que esta em cima: a peca sobre ela e estado
    // de partida como a carga do bau, mas ao contrario do bau ela nunca fica sozinha no mundo —
    // o jogador esta ali malhando. Salvar o meio de uma martelada seria salvar um gesto.
    for (const altar of this.host.props.altars) {
      if (!altar.playerBuilt) continue;
      out.push({ type: 'altar', worldX: altar.worldX, worldY: altar.worldY });
    }
    return out;
  }

  /**
   * O caminho de volta: o diff de estacoes manuais do save, aplicado sobre o mundo construido.
   *
   * O MUNDO SEMPRE GANHA, e essa e a unica regra aqui — a mesma dos buracos da pa. Se o autor
   * pos uma peca no tile onde o jogador tinha uma, a do autor fica e a do save e descartada; se
   * o terreno mudou e o tile virou parede, a peca nao nasce. O contrario (o save sobrescrevendo)
   * transformaria toda edicao no /editor e toda carta de chunk comprada num campo minado.
   *
   * Levels e explorador nunca chegam aqui: la, zerar E o desenho.
   */
  public restoreBuiltMachines(): void {
    if (!this.host.adventure) return;
    const saved = adventureState().machines.get(this.host.save.adventureScope);
    if (!saved?.length) return;
    const occupied = (x: number, y: number): boolean =>
      this.host.chunkManager?.isCellBlocked(x, y) === true || this.machineAt(x, y);
    for (const machine of saved) {
      const { worldX: x, worldY: y } = machine;
      const dir = asPropDir(machine.dir);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (occupied(x, y)) continue;
      if (!this.installMachine(machine.type, x, y, dir)) continue;
    }
  }
}

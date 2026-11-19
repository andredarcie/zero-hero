// O PAINEL DE TESTES DO LOCALHOST, o lado do jogo (pedido do autor, 2026-11-17: "quando está executando em localhost
// [...] apertar uma tecla e abrir um modal para auxílio de testes locais [...] finalizar missões [...] colocar itens
// no inventário [...] adicionar recursos [...] outras coisas úteis"). A tela é o debug/DevPanel; aqui mora o que cada
// botão faz, sempre pelos MESMOS caminhos do jogo (a mão, o caderno de missões, o save, o relógio, o teleporte das
// sondas), nunca por um atalho que deixe o mundo num estado que o jogo não saberia produzir.
//
// Só existe rodando local (`devToolsAllowed`): o servidor de desenvolvimento ou o próprio computador. No itch e no
// Pages a tecla não faz nada.

import { questFor, NPC_QUESTS } from '@/game/dialogs/NpcQuests';
import type { HeldItemKind } from '@/game/entities/ItemPickup';
import { t } from '@/game/i18n/i18n';
import { BENCH_MATERIALS, HOME_BUILDS, type BenchMaterial } from '@/game/objects/homeBuilds';
import { adventureState, resetAdventure } from '@/game/runtime/adventureState';
import { gameClock } from '@/game/runtime/campRegrowth';
import { inCampZone } from '@/game/runtime/homeGrid';
import { isToolKind, TOOL_KINDS } from '@/game/runtime/Inventory';
import { forceQuestDone, isQuestDone, taskProgress } from '@/game/runtime/QuestLog';
import { spriteDataUrl } from '@/game/runtime/spriteDataUrl';
import { getDay, getTimeOfDay, setDay, setTimeOfDay, timeOfDayLabel } from '@/game/runtime/timeOfDay';
import { DEATH_VISITS } from '@/game/systems/Resting';
import { getNpcHome } from '@/game/world/WorldData';
import type { NpcKind } from '@/game/world/ScreenContent';
import type { GameScene } from '../GameScene';
import { ITEM_VISUAL_2D } from './sceneDefs';

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '[::1]'];

/** O painel existe aqui? O servidor de desenvolvimento (inclusive pelo celular na rede de casa) ou o localhost. */
export const devToolsAllowed = (): boolean =>
  import.meta.env.DEV || (typeof window !== 'undefined' && LOCAL_HOSTS.includes(window.location.hostname));

/** Quem pede o quê, pelo nome de quem se conhece no vale. */
const QUEST_NAMES: Readonly<Record<string, string>> = {
  radiationSuit: 'Shui — os cogumelos',
  painter: 'Sisi — o quadro',
  businessMan: 'Marco — o fogo que dura',
  astronaut: 'Thea — o telescópio',
};

/** Os lugares do teleporte: o tile e para onde o herói olha. Os vizinhos são achados no mapa (o tile ao sul deles). */
const FIXED_PLACES: ReadonlyArray<{ id: string; name: string; x: number; y: number; dx: number; dy: number }> = [
  { id: 'camp', name: 'Acampamento', x: 54, y: 50, dx: 0, dy: -1 },
  { id: 'bench', name: 'Bancada (frente)', x: 54, y: 45, dx: 1, dy: 0 },
  { id: 'campGrass', name: 'Mato do acampamento', x: 55, y: 48, dx: 1, dy: 0 },
  { id: 'spring', name: 'Fonte termal', x: 5, y: -1, dx: 0, dy: -1 },
  { id: 'beachSeat', name: 'Guarda-sol da praia', x: 41, y: -14, dx: 0, dy: -1 },
];

export interface DevQuestRow { dialog: string; name: string; done: boolean; progress: string }
export interface DevItemRow { kind: string; name: string; icon: string; tool: boolean; owned: boolean }
export interface DevStockRow { id: string; name: string; icon: string; count: number }

/** O que o DevTools usa de GameScene (ele mexe em quase tudo, como um jogador muito apressado). */
export type DevToolsHost = GameScene;

export class DevTools {
  public constructor(private readonly host: DevToolsHost) {}

  // ── as missões ──────────────────────────────────────────────────────────────────────────────────────────────────

  public quests(): DevQuestRow[] {
    return Object.values(NPC_QUESTS).map((q) => {
      const done = q.tasks.filter((task) => taskProgress(q, task) >= task.count).length;
      return {
        dialog: q.dialog, name: QUEST_NAMES[q.dialog] ?? q.dialog, done: isQuestDone(q),
        progress: `${done}/${q.need ?? q.tasks.length} tarefas`,
      };
    });
  }

  /** Fecha um pedido: os contadores vão ao alvo e o vale reage como no jogo (o sino, a marca, o gato, a chave). */
  public finishQuest(dialog: string): string {
    const quest = questFor(dialog);
    if (!quest) return 'Pedido desconhecido.';
    if (isQuestDone(quest)) return `${QUEST_NAMES[dialog] ?? dialog}: já estava concluído.`;
    if (forceQuestDone(dialog)) this.host.delivery.celebrateQuestDone(undefined);
    this.afterChange();
    return `${QUEST_NAMES[dialog] ?? dialog}: concluído.`;
  }

  public finishAllQuests(): string {
    let closed = 0;
    for (const q of Object.values(NPC_QUESTS)) if (forceQuestDone(q.dialog)) closed += 1;
    if (closed > 0) this.host.delivery.celebrateQuestDone(undefined);
    this.afterChange();
    return closed > 0 ? `${closed} pedido(s) concluído(s). A chave do jardim vem em seguida.` : 'Todos já estavam concluídos.';
  }

  // ── os itens ────────────────────────────────────────────────────────────────────────────────────────────────────

  public items(): DevItemRow[] {
    return (Object.keys(ITEM_VISUAL_2D) as HeldItemKind[])
      .filter((kind) => kind !== 'sword' && kind !== 'bucketFull' && kind !== 'stool')
      .map((kind) => {
        const v = ITEM_VISUAL_2D[kind];
        return {
          kind, name: this.itemName(kind), icon: spriteDataUrl(this.host, v.texture, v.frame, 2),
          tool: isToolKind(kind), owned: this.host.inventory.owns(kind),
        };
      })
      .sort((a, b) => Number(b.tool) - Number(a.tool) || a.name.localeCompare(b.name, 'pt-BR'));
  }

  /** O que vai nas costas agora (e as ferramentas guardadas). */
  public held(): string {
    const list = this.host.inventory.list();
    if (list.length === 0) return 'Mãos vazias.';
    const [first, ...kept] = list;
    const back = `${first.count > 1 ? `${first.count} × ` : ''}${this.itemName(first.kind)}`;
    return kept.length > 0 ? `Nas costas: ${back} · guardadas: ${kept.map((k) => this.itemName(k.kind)).join(', ')}` : `Nas costas: ${back}`;
  }

  /**
   * Põe na mão, como um presente de vizinho (HandItems.takeIntoHand): material vai nas costas, um pacote de `units`
   * (o que estava nelas pousa ao lado); ferramenta fica com ele para sempre. Sem a cerimônia: é teste.
   */
  public giveItem(kind: string, units: number): string {
    const k = kind as HeldItemKind;
    this.host.seenItems.add(k);
    adventureState().found.add(k);
    this.host.hand.takeIntoHand(k, isToolKind(k) ? 1 : Math.max(1, units));
    this.afterChange();
    return isToolKind(k) ? `${this.itemName(k)}: nas costas (fica guardada).` : `${units} × ${this.itemName(k)} nas costas.`;
  }

  public giveAllTools(): string {
    for (const kind of TOOL_KINDS) {
      if (kind === 'bucketFull' || kind === 'key') continue;
      this.host.seenItems.add(kind);
      adventureState().found.add(kind);
      if (!this.host.inventory.owns(kind)) this.host.inventory.keep(kind);
    }
    this.host.carry.updateBackItem();
    this.afterChange();
    return 'Todas as ferramentas guardadas (menos a chave do jardim).';
  }

  public clearHand(): string {
    this.host.inventory.takeAll();
    this.host.torch.heldOnFire = false;
    this.host.torch.torchFuelMs = 0;
    this.host.carry.updateBackItem();
    this.afterChange();
    return 'Costas vazias (as ferramentas guardadas continuam).';
  }

  /** Marca tudo como visto: o caderno de campo fica cheio. */
  public markAllSeen(): string {
    for (const kind of Object.keys(ITEM_VISUAL_2D) as HeldItemKind[]) {
      this.host.seenItems.add(kind);
      adventureState().found.add(kind);
    }
    this.afterChange();
    return 'Todos os itens marcados como vistos (o caderno de campo enche).';
  }

  // ── o acampamento ───────────────────────────────────────────────────────────────────────────────────────────────

  public stock(): DevStockRow[] {
    const stock = adventureState().home.stock;
    return BENCH_MATERIALS.map((m) => {
      const v = ITEM_VISUAL_2D[m];
      return { id: m, name: this.itemName(m), icon: spriteDataUrl(this.host, v.texture, v.frame, 2), count: stock[m] };
    });
  }

  public addStock(id: string, n: number): string {
    const home = adventureState().home;
    const m = id as BenchMaterial;
    home.stock = { ...home.stock, [m]: Math.max(0, home.stock[m] + n) };
    this.afterChange();
    return `Bancada: ${home.stock[m]} × ${this.itemName(m)}.`;
  }

  public fillStock(): string {
    const home = adventureState().home;
    home.stock = Object.fromEntries(BENCH_MATERIALS.map((m) => [m, 99])) as Record<BenchMaterial, number>;
    this.afterChange();
    return 'Bancada cheia: 99 de cada material.';
  }

  public clearStock(): string {
    const home = adventureState().home;
    home.stock = Object.fromEntries(BENCH_MATERIALS.map((m) => [m, 0])) as Record<BenchMaterial, number>;
    this.afterChange();
    return 'Bancada vazia.';
  }

  /** A escada inteira de construções liberada (as lembranças continuam esperando os pedidos). */
  public unlockBuilds(): string {
    const home = adventureState().home;
    home.built = HOME_BUILDS.filter((b) => !b.gift).map((b) => b.kind);
    this.afterChange();
    return 'Todas as construções aparecem na bancada.';
  }

  /** Corta todo o mato do acampamento de uma vez, chão limpo (o save lembra, com a hora, como lembra o da foice). */
  public mowCamp(): string {
    const home = adventureState().home;
    const now = gameClock(getDay(), getTimeOfDay());
    let n = 0;
    for (const g of this.host.props.tallGrasses) {
      if (!(g.isTall || g.isGrowing) || !inCampZone(g.worldX, g.worldY)) continue;
      if (g.isGrowing) g.growTo(0, true);
      else g.settle();
      const key = `${g.worldX},${g.worldY}`;
      if (!home.cleared.includes(key)) home.cleared.push(key);
      home.clearedAt[key] = now;
      n += 1;
    }
    this.afterChange();
    return n > 0 ? `${n} tufos do acampamento cortados.` : 'Não sobrou mato no acampamento.';
  }

  /**
   * O mato cortado e SEM USO volta já, pelo mesmo relógio do jogo (objects/CampGrass): o que tem peça em cima, o tile
   * do herói e o que é passagem continuam limpos.
   */
  public regrowCamp(): string {
    const grass = this.host.camp.home.campGrass;
    if (!grass) return 'O mato do acampamento não está montado.';
    const before = grass.standing;
    grass.regrowNow();
    this.afterChange();
    const back = grass.standing - before;
    return back > 0 ? `${back} tufos voltaram a crescer (o que está em uso continua limpo).` : 'Nenhum tile cortado está sem uso.';
  }

  /** O acampamento volta ao começo: só o colchão, o fogo e o caderno (as construções feitas continuam liberadas). */
  public clearPieces(): string {
    const pieces = this.host.valley.campPieces;
    const list = [...(pieces?.list ?? [])];
    for (const p of list) pieces?.remove(p.x, p.y);
    this.afterChange();
    return list.length > 0 ? `${list.length} peças tiradas do acampamento.` : 'O acampamento já estava vazio.';
  }

  /** As três noites da Morte passam de uma vez, e a foice fica com o herói. */
  public skipDeathNights(): string {
    for (const v of DEATH_VISITS) this.host.seenDialogKeys.add(v.key);
    this.host.seenItems.add('scythe');
    adventureState().found.add('scythe');
    if (!this.host.inventory.owns('scythe')) this.host.inventory.keep('scythe');
    this.host.carry.updateBackItem();
    this.afterChange();
    return 'As três visitas da Morte foram ouvidas, e a foice está guardada.';
  }

  // ── o mundo ─────────────────────────────────────────────────────────────────────────────────────────────────────

  public clock(): string {
    return `Dia ${getDay()} · ${timeOfDayLabel()}`;
  }

  public setTime(phase: number): string {
    setTimeOfDay(phase);
    this.afterChange();
    return `Agora: ${timeOfDayLabel()}.`;
  }

  public nextDay(): string {
    setDay(getDay() + 1);
    setTimeOfDay(0.27);
    this.afterChange();
    return `Dia ${getDay()}, de manhã.`;
  }

  public places(): Array<{ id: string; name: string }> {
    return [
      ...FIXED_PLACES.map((p) => ({ id: p.id, name: p.name })),
      ...Object.keys(NPC_QUESTS).map((d) => ({ id: `npc:${d}`, name: (QUEST_NAMES[d] ?? d).split(' — ')[0] })),
    ];
  }

  /** O herói aparece lá, parado, olhando para o que interessa, com o mundo em volta carregado. */
  public teleport(id: string): string {
    let spot = FIXED_PLACES.find((p) => p.id === id) as { x: number; y: number; dx: number; dy: number; name?: string } | undefined;
    if (!spot && id.startsWith('npc:')) {
      const home = getNpcHome(id.slice(4) as NpcKind);
      if (home) spot = { x: home.worldX, y: home.worldY + 1, dx: 0, dy: -1, name: (QUEST_NAMES[id.slice(4)] ?? id).split(' — ')[0] };
    }
    if (!spot) return 'Lugar desconhecido.';
    this.host.playerWorld.worldX = spot.x;
    this.host.playerWorld.worldY = spot.y;
    this.host.movementController?.interruptMovement(spot.x, spot.y);
    this.host.movementController?.faceTo(spot.dx, spot.dy);
    this.host.streamChunks(true);
    this.afterChange();
    return `O herói foi para ${spot.name ?? FIXED_PLACES.find((p) => p.id === id)?.name ?? id}.`;
  }

  // ── o save ──────────────────────────────────────────────────────────────────────────────────────────────────────

  public saveNow(): string {
    adventureState().clock = getTimeOfDay();
    adventureState().day = getDay();
    this.host.save.persistAdventure();
    return 'Save gravado.';
  }

  /** Apaga o save e recomeça a página (o "novo jogo" do título), sem o relógio se regravar ao sair. */
  public resetSave(): void {
    if (this.host.boot.keepClockOnLeave) window.removeEventListener('pagehide', this.host.boot.keepClockOnLeave);
    resetAdventure();
    window.location.reload();
  }

  // ──────────────────────────────────────────────────────────────────────────────────────────────────────────────

  private itemName(kind: string): string {
    const name = t(`items.name.${kind}`);
    return name.startsWith('items.') ? kind : name;
  }

  /** Grava, e a tela da bancada (se estiver aberta por baixo) relê o estoque e as cartas. */
  private afterChange(): void {
    this.host.save.persistAdventure();
    this.host.camp.build.overlay?.refresh();
  }
}

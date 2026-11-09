// AS MARCAS DAS QUESTS: o sinal sobre o tile de cada pedido aberto, refeito quando um fecha, e a despedida da estrela
// no céu.

import { HERO_FRAMES } from '@/game/constants';
import type { DialogScript } from '@/game/dialogs/NpcDialogs';
import { Billboard3D } from '@/game/render3d/Billboard3D';
import { BASKET_TEXTURE, CAIRN_TEXTURE } from '@/game/render3d/cozyTextures';
import type { NpcKind } from '@/game/world/ScreenContent';
import { getChunkContent, getWorldBounds, getDialogVoice } from '@/game/world/WorldData';
import { isQuestDone } from '@/game/runtime/QuestLog';
import { questFor } from '@/game/dialogs/NpcQuests';
import { TheaDeparture } from '@/game/entities/TheaDeparture';
import type { GameScene } from '../GameScene';

// ── AS MARCAS DO VALE AJUDADO ─────────────────────────────────────────────────
// Uma por pedido: o que aparece (ou muda) ao lado do NPC quando ele fecha. `before` e a pose de
// antes, se a marca ja existe desde o comeco (o cavalete da Sisi, com a tela cinza).
type QuestMarkDef = { dialog: string; npc: NpcKind; before?: string; after: string };
export type QuestMarkState = {
  def: QuestMarkDef; tile: { x: number; y: number }; npcAt: { x: number; y: number }; done: boolean; bb?: Billboard3D;
};
const QUEST_MARKS: readonly QuestMarkDef[] = [
  { dialog: 'astronaut', npc: 'astronaut', after: CAIRN_TEXTURE },
  { dialog: 'radiationSuit', npc: 'radiationSuit', after: BASKET_TEXTURE },
];

/** O que QuestMarks usa de GameScene. */
export type QuestMarksHost = Pick<GameScene,
  'actions' | 'adventure' | 'cinema' | 'cutsceneActive' | 'dialog' | 'hero' | 'itemManager' | 'npcManager'
  | 'pause' | 'playerWorld' | 'query' | 'questSetup' | 'save' | 'sparkle' | 'steps' | 'tweens' | 'world3d'
>;

export class QuestMarks {
  public readonly questMarks: QuestMarkState[] = [];

  public constructor(private readonly host: QuestMarksHost) {}

  /**
   * AS MARCAS DO VALE AJUDADO — o que muda no mundo quando um pedido fecha (ver QUEST_MARKS).
   *
   * O "obrigado" era so uma fala, e uma fala some. A marca fica: o marco de pedras da Thea, o cesto
   * da Shui, a lenha do Marco (e a fogueira dele, acesa para sempre) e o cavalete da Sisi, cuja
   * tela cinza vira paisagem. Ela nasce do ESTADO do pedido (nenhum campo novo no save) e mora num
   * tile escolhido uma vez, no boot: o mais perto do NPC (ate tres) que nao e ponto de corte (os
   * livres do anel de oito em volta dele sao uma corrida so) — um bloco assim nunca fecha caminho.
   */
  public buildQuestMarks(): void {
    const npcs = new Map<string, { x: number; y: number }>();
    const bounds = getWorldBounds();
    for (let cy = bounds.minCy; cy <= bounds.maxCy; cy += 1) {
      for (let cx = bounds.minCx; cx <= bounds.maxCx; cx += 1) {
        for (const n of getChunkContent(cx, cy).npcs) npcs.set(n.type, { x: n.worldX, y: n.worldY });
      }
    }
    const npcTiles = new Set([...npcs.values()].map((p) => `${p.x},${p.y}`));
    const taken = new Set<string>();
    const free = (x: number, y: number): boolean => !npcTiles.has(`${x},${y}`) && !taken.has(`${x},${y}`)
      && !this.host.query.isSolidForEntities(x, y) && !(this.host.itemManager?.hasItemAt(x, y) ?? false)
      && !this.host.query.getPlantSpotAt(x, y) && !this.host.query.isOpenWaterAt(x, y);
    // Do mais perto para o mais longe, ate tres tiles; no empate, o lado (a marca ao lado do NPC le
    // melhor que em cima ou embaixo dele) e depois uma ordem fixa.
    const OFFSETS: Array<[number, number]> = [];
    for (let dy = -3; dy <= 3; dy += 1) for (let dx = -3; dx <= 3; dx += 1) if (dx || dy) OFFSETS.push([dx, dy]);
    OFFSETS.sort((a, b) => (Math.hypot(...a) - Math.hypot(...b)) || (Math.abs(a[1]) - Math.abs(b[1])) || (b[0] - a[0]) || (a[1] - b[1]));
    this.questMarks.length = 0;
    for (const def of QUEST_MARKS) {
      const at = npcs.get(def.npc);
      if (!at) continue;
      let tile: { x: number; y: number } | undefined;
      for (const [dx, dy] of OFFSETS) {
        const x = at.x + dx; const y = at.y + dy;
        if (!free(x, y)) continue;
        // NAO E PONTO DE CORTE: os tiles livres do anel de oito vizinhos formam UMA corrida so
        // (vizinhos consecutivos no anel sao vizinhos de passo), entao quem passava por aqui
        // continua passando em volta. Pelo menos tres livres, para a peca nao entupir um canto.
        const ring: Array<[number, number]> = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
        const open = ring.map(([ox, oy]) => !this.host.query.isSolidForEntities(x + ox, y + oy) || npcTiles.has(`${x + ox},${y + oy}`));
        let runs = 0;
        for (let k = 0; k < 8; k += 1) if (open[k] && !open[(k + 7) % 8]) runs += 1;
        const openCount = open.filter(Boolean).length;
        const roomy = openCount === 8 || (openCount >= 3 && runs <= 1);
        if (roomy) { tile = { x, y }; break; }
      }
      if (!tile) continue;
      taken.add(`${tile.x},${tile.y}`);
      const quest = questFor(def.dialog);
      const done = this.host.adventure && quest !== undefined && isQuestDone(quest);
      const mark: QuestMarkState = { def, tile, done, npcAt: at };
      this.questMarks.push(mark);
      this.drawQuestMark(mark, false);
    }
  }

  public async playStarFarewell(
    farewell: { from: readonly [number, number]; beside: { x: number; y: number }; script: DialogScript; goodbye: DialogScript; ship: { x: number; y: number } },
    onDone: () => void,
  ): Promise<void> {
    const { from, beside, script, goodbye, ship } = farewell;
    this.host.cutsceneActive = true;
    this.host.steps.stopBreathing();
    this.host.actions.actionButtons?.setVisible(false);
    this.host.pause.pauseTouchButton?.setVisible(false);
    const visitor = this.host.questSetup.skyVisitor ?? this.host.questSetup.theaComesTo(from, beside);
    this.host.questSetup.skyVisitor = undefined;
    for (let i = 0; i < 80 && !visitor.isSeated; i += 1) await this.host.cinema.wait(120);
    await this.host.cinema.wait(500);
    await new Promise<void>((resolve) => {
      this.host.dialog.dialogSpeaker = visitor.bodySprite;
      this.host.dialog.openDialogScript(script, undefined, getDialogVoice('astronaut'), () => {
        this.host.dialog.dialogSpeaker = undefined;
        resolve();
      });
    });
    this.host.cutsceneActive = true;
    await this.host.cinema.wait(500);
    await new TheaDeparture({
      ...this.host.questSetup.shipHost(ship),
      thea: visitor.bodySprite,
      hero: { x: this.host.playerWorld.worldX, y: this.host.playerWorld.worldY },
      heroBody: this.host.hero,
      say: (onClosed) => {
        this.host.dialog.dialogSpeaker = visitor.bodySprite;
        this.host.dialog.openDialogScript(goodbye, undefined, getDialogVoice('astronaut'), () => {
          this.host.dialog.dialogSpeaker = undefined;
          this.host.cutsceneActive = true;
          onClosed();
        });
      },
      hearts: (x, y) => this.host.sparkle.spawnHearts(x, y),
      heroLooksUp: () => { this.host.hero.frame = HERO_FRAMES.idleUp; },
    }).run();
    visitor.destroy();
    this.host.npcManager?.setKindAway('astronaut', false);
    onDone();
    this.host.cutsceneActive = false;
    this.host.actions.actionButtons?.setVisible(true);
    this.host.pause.pauseTouchButton?.setVisible(true);
    this.host.save.persistAdventure();
  }

  /** Desenha (ou troca) a marca: antes do pedido, a pose `before` se houver; depois, a `after`. */
  private drawQuestMark(mark: QuestMarkState, animate: boolean): void {
    const w3 = this.host.world3d;
    if (!w3) return;
    const texture = mark.done ? mark.def.after : mark.def.before;
    if (!texture) return;
    if (!mark.bb) {
      mark.bb = w3.objects.addBillboard(texture, 0, { groundShadow: { rx: 0.3, rz: 0.2, alpha: 0.28 } })
        .setPosition(mark.tile.x, mark.tile.y)
        .setDisplaySize(0.9, 0.9);
    } else {
      mark.bb.setTexture(texture, 0);
    }
    if (!animate) return;
    // O SURGIMENTO: a peca brota do chao com um pulinho, um brilho e um sino.
    const bb = mark.bb;
    bb.setDisplaySize(0.2, 0.2);
    this.host.tweens.add({ targets: bb, displayWidth: 0.9, displayHeight: 0.9, duration: 520, ease: 'Back.easeOut' });
    this.host.sparkle.spawnGrowSparkle(mark.tile.x, mark.tile.y);
    this.host.sparkle.spawnGlint(mark.tile.x, mark.tile.y, 0.7, 0.5);
  }

  /** Um pedido fechou: as marcas que ainda nao sabiam disso mudam agora, com festa. */
  public refreshQuestMarks(): void {
    for (const mark of this.questMarks) {
      if (mark.done) continue;
      const quest = questFor(mark.def.dialog);
      if (!quest || !isQuestDone(quest)) continue;
      mark.done = true;
      this.drawQuestMark(mark, true);
    }
  }

  public isQuestMarkAt(wx: number, wy: number): boolean {
    return this.questMarks.some((m) => m.bb !== undefined && m.tile.x === wx && m.tile.y === wy);
  }
}

import * as Engine from '@/game/engine';

import { NPC_VISUALS } from '@/game/constants';
import { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import type { WorldCamera } from '@/game/runtime/WorldCamera';
import type { NpcKind, ScreenContent } from '@/game/world/ScreenContent';

// Tiny pixel-art "!" shown above an NPC whose current dialog the player hasn't heard yet.
// Core glyph only — a dark outline is added programmatically around every filled pixel.
// Stays a 2D overlay sprite: it is a UI marker, not a body in the world, and the
// projected tileToScreen keeps it glued above the 3D NPC.
const EXCLAIM_TEXTURE_KEY = 'npc-exclaim';
const EXCLAIM_GLYPH = [
  '.###.',
  '.###.',
  '.###.',
  '..#..',
  '.....',
  '.###.',
  '.###.',
];
const EXCLAIM_FILL = '#ffe066';
const EXCLAIM_OUTLINE = '#241d0f';

function ensureExclaimTexture(scene: Engine.Scene): void {
  if (scene.textures.exists(EXCLAIM_TEXTURE_KEY)) return;
  const rows = EXCLAIM_GLYPH.length;
  const cols = EXCLAIM_GLYPH[0].length;
  // +1px border all around so the outline never clips at the texture edge.
  const canvas = scene.textures.createCanvas(EXCLAIM_TEXTURE_KEY, cols + 2, rows + 2);
  if (!canvas) return;
  const ctx = canvas.getContext();
  const filled = (x: number, y: number): boolean =>
    y >= 0 && y < rows && x >= 0 && x < cols && EXCLAIM_GLYPH[y][x] === '#';
  for (let y = -1; y <= rows; y++) {
    for (let x = -1; x <= cols; x++) {
      if (filled(x, y)) ctx.fillStyle = EXCLAIM_FILL;
      else if (
        filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)
      ) ctx.fillStyle = EXCLAIM_OUTLINE;
      else continue;
      ctx.fillRect(x + 1, y + 1, 1, 1);
    }
  }
  canvas.refresh();
  canvas.setFilter(Engine.Textures.FilterMode.NEAREST);
}

// O SONO DO HERÓI no colchão (ver FireBed): um "z" pequeno que sobe e some. Mesma técnica do "!" (glifo +
// contorno escuro). Os vizinhos não dormem: ficam sempre onde estão, esperando o herói.
export const SLEEP_TEXTURE_KEY = 'npc-sleep-z';
const SLEEP_GLYPH = [
  '####',
  '..#.',
  '.#..',
  '####',
];
const SLEEP_FILL = '#cfd8ff';

export function ensureSleepTexture(scene: Engine.Scene): void {
  if (scene.textures.exists(SLEEP_TEXTURE_KEY)) return;
  const rows = SLEEP_GLYPH.length;
  const cols = SLEEP_GLYPH[0].length;
  const canvas = scene.textures.createCanvas(SLEEP_TEXTURE_KEY, cols + 2, rows + 2);
  if (!canvas) return;
  const ctx = canvas.getContext();
  const filled = (x: number, y: number): boolean =>
    y >= 0 && y < rows && x >= 0 && x < cols && SLEEP_GLYPH[y][x] === '#';
  for (let y = -1; y <= rows; y++) {
    for (let x = -1; x <= cols; x++) {
      if (filled(x, y)) ctx.fillStyle = SLEEP_FILL;
      else if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) ctx.fillStyle = EXCLAIM_OUTLINE;
      else continue;
      ctx.fillRect(x + 1, y + 1, 1, 1);
    }
  }
  canvas.refresh();
  canvas.setFilter(Engine.Textures.FilterMode.NEAREST);
}

class NpcEntity {
  public readonly worldX: number;
  public readonly worldY: number;
  public readonly kind: NpcKind;
  /** O roteiro DESTA instância, quando ela tem um só dela (ver WorldNpcSpawn.dialog). */
  public readonly dialog?: string;

  private readonly sprite: Billboard3D;
  private readonly size: number;
  /** A fase da respiracao: cada um respira no seu ritmo, ninguem em coro. */
  private readonly breathPhase: number;
  private readonly exclaim: Engine.GameObjects.Image;

  public constructor(
    scene: Engine.Scene,
    worldX: number,
    worldY: number,
    kind: NpcKind,
    dialog?: string,
  ) {
    this.worldX = worldX;
    this.worldY = worldY;
    this.kind = kind;
    this.dialog = dialog;
    const visual = NPC_VISUALS[kind];
    // Death looms at twice the size; the billboard anchors at the feet either way.
    const size = kind === 'death' ? 2 : 1;
    this.size = size;
    this.breathPhase = ((worldX * 7 + worldY * 13) % 17) / 17 * Math.PI * 2;
    this.sprite = world3d()
      .objects.addBillboard(visual.key, visual.frame ?? 0, { groundShadow: true, reflected: true })
      .setPosition(worldX, worldY)
      .setDisplaySize(size, size);
    if (visual.tint !== undefined) this.sprite.setTint(visual.tint);
    ensureExclaimTexture(scene);
    this.exclaim = scene.add
      .image(0, 0, EXCLAIM_TEXTURE_KEY)
      .setOrigin(0.5, 1)
      .setVisible(false);
  }

  public render(tileSize: number, camera: WorldCamera, showExclaim: boolean, timeMs: number): void {
    // A RESPIRACAO: o corpo cresce um fio para cima e afina um fio, devagar — a mesma do heroi
    // parado. Pela base: o billboard pisa no chao e cresce para cima, entao os pes nao saem do lugar.
    const b = Math.sin(timeMs / 900 + this.breathPhase);
    this.sprite.setDisplaySize(this.size * (1 - 0.012 * b), this.size * (1 + 0.028 * b));
    this.exclaim.setVisible(showExclaim);
    if (!showExclaim) return;
    const screen = camera.tileToScreen(this.worldX, this.worldY, tileSize);
    // Chunky pixel scaling (integer multiple of the source texels) + a gentle bob.
    const px = Math.max(1, Math.round(tileSize / 24));
    const bob = Math.round(Math.sin(timeMs / 280) * px);
    const height = this.kind === 'death' ? 2 : 1;
    this.exclaim.setScale(px).setPosition(screen.x, screen.y - tileSize * height - px * 2 + bob);
  }

  public hideExclaim(): void {
    this.exclaim.setVisible(false);
  }

  /** Um pulinho: oi, obrigado, toma aqui. A altura volta a zero sozinha. */
  public hop(scene: Engine.Scene, height = 0.22): void {
    scene.tweens.killTweensOf(this.sprite);
    this.sprite.setElevation(0);
    scene.tweens.add({ targets: this.sprite, elevation: height, duration: 160, yoyo: true, ease: 'Sine.easeOut', repeat: 1, repeatDelay: 40 });
  }

  public get body(): Billboard3D {
    return this.sprite;
  }

  /** Some de cena (o corpo e as marcas) sem sair da lista — ver NpcManager.setKindHidden. */
  public setVisible(visible: boolean): void {
    this.sprite.setVisible(visible);
    if (!visible) this.hideExclaim();
  }

  public destroy(): void {
    this.sprite.destroy();
    this.exclaim.destroy();
  }
}

export class NpcManager {
  // NPCs grouped by chunk, streamed in/out as the player roams the open world.
  private readonly byChunk = new Map<string, NpcEntity[]>();
  /**
   * Especies FORA DE CENA: o mago, antes de a abertura o trazer andando. Um NPC escondido nao
   * desenha, nao bloqueia e nao conversa — para o mundo ele ainda nao chegou.
   */
  private readonly hiddenKinds = new Set<NpcKind>();
  /**
   * Especies FORA DE CASA: o vizinho que foi sentar na fogueira (ver FireVisitor). Diferente do
   * escondido, ele CONTINUA ocupando o tile dele — senao o heroi pisaria la, e a volta poria
   * os dois no mesmo lugar —, mas nao desenha e nao conversa: quem esta la e so a casa vazia.
   */
  private readonly awayKinds = new Set<NpcKind>();

  public constructor(
    private readonly scene: Engine.Scene,
    private readonly getContent: (cx: number, cy: number) => ScreenContent,
    // Whether this NPC's current dialog is still unheard — drives the "!" marker above it.
    // `dialog` é o roteiro próprio da instância: sem ele aqui, o "!" perguntaria pela fala da
    // ESPÉCIE enquanto conversar marcaria a do roteiro — e a marca nunca apagaria.
    private readonly hasNewDialog: (
      kind: NpcKind,
      worldX: number,
      worldY: number,
      dialog?: string,
    ) => boolean = () => false,
    // O herói está ADJACENTE e DE FRENTE para este NPC: quem fala agora é o balão de ação, e o "!" sai.
    private readonly isTalkTarget: (worldX: number, worldY: number) => boolean = () => false,
  ) {}

  public syncChunks(active: Set<string>): void {
    for (const [key, list] of this.byChunk) {
      if (active.has(key)) continue;
      for (const npc of list) npc.destroy();
      this.byChunk.delete(key);
    }
    for (const key of active) {
      if (this.byChunk.has(key)) continue;
      const [cx, cy] = key.split(',').map(Number);
      const list = this.getContent(cx, cy).npcs.map(
        (spawn) => new NpcEntity(this.scene, spawn.worldX, spawn.worldY, spawn.type, spawn.dialog),
      );
      for (const npc of list) if (this.hiddenKinds.has(npc.kind) || this.awayKinds.has(npc.kind)) npc.setVisible(false);
      this.byChunk.set(key, list);
    }
  }

  /**
   * O chunk renasceu na FONTE sem o herói cruzar fronteira (a compra do construtor de mundo):
   * o syncChunks pula chunks já ativos, então a lista vazia do chunk escuro ficaria em cache e
   * o NPC recém-comprado só apareceria depois de sair da janela e voltar. Recarrega agora.
   */
  public refreshChunk(cx: number, cy: number): void {
    const key = `${cx},${cy}`;
    const current = this.byChunk.get(key);
    if (!current) return; // fora da janela ativa: o syncChunks normal cuida quando ela chegar lá
    for (const npc of current) npc.destroy();
    this.byChunk.set(key, this.getContent(cx, cy).npcs.map(
      (spawn) => new NpcEntity(this.scene, spawn.worldX, spawn.worldY, spawn.type, spawn.dialog),
    ));
  }

  /** Tira uma especie de cena (ou a devolve). Vale tambem para os chunks que ainda vao chegar. */
  public setKindHidden(kind: NpcKind, hidden: boolean): void {
    if (hidden) this.hiddenKinds.add(kind);
    else this.hiddenKinds.delete(kind);
    for (const list of this.byChunk.values()) {
      for (const npc of list) if (npc.kind === kind) npc.setVisible(!hidden);
    }
  }

  /** Esta espécie saiu de cena (a Thea que foi embora na nave, por exemplo). */
  public isKindHidden(kind: NpcKind): boolean {
    return this.hiddenKinds.has(kind);
  }

  /** Vizinho saiu para a fogueira (ou voltou). Vale tambem para os chunks que ainda vao chegar. */
  public setKindAway(kind: NpcKind, away: boolean): void {
    if (away) this.awayKinds.add(kind);
    else this.awayKinds.delete(kind);
    for (const list of this.byChunk.values()) {
      for (const npc of list) if (npc.kind === kind) npc.setVisible(!away && !this.hiddenKinds.has(kind));
    }
  }

  /** Todos os que ocupam um tile agora — inclusive a casa vazia de quem saiu. */
  private all(): NpcEntity[] {
    const out: NpcEntity[] = [];
    for (const list of this.byChunk.values()) {
      for (const npc of list) if (!this.hiddenKinds.has(npc.kind)) out.push(npc);
    }
    return out;
  }

  /** Os que estao EM CASA: os unicos que conversam, pulam e desenham marcas. */
  private present(): NpcEntity[] {
    return this.all().filter((n) => !this.awayKinds.has(n.kind));
  }

  public hasNpcAt(worldX: number, worldY: number): boolean {
    return this.all().some((n) => n.worldX === worldX && n.worldY === worldY);
  }

  public getKindAt(worldX: number, worldY: number): NpcKind | null {
    return this.present().find((n) => n.worldX === worldX && n.worldY === worldY)?.kind ?? null;
  }

  /** O roteiro próprio deste NPC, se ele tiver um (ver WorldNpcSpawn.dialog). */
  public getDialogIdAt(worldX: number, worldY: number): string | undefined {
    return this.present().find((n) => n.worldX === worldX && n.worldY === worldY)?.dialog;
  }

  /** O corpo do NPC deste tile: é ele que se mexe enquanto fala (ver runtime/TalkingBody). */
  public bodyAt(worldX: number, worldY: number): Billboard3D | undefined {
    return this.present().find((n) => n.worldX === worldX && n.worldY === worldY)?.body;
  }

  /** O NPC deste tile da um pulinho (ver NpcEntity.hop). */
  public hop(worldX: number, worldY: number, height?: number): boolean {
    const npc = this.present().find((n) => n.worldX === worldX && n.worldY === worldY);
    npc?.hop(this.scene, height);
    return npc !== undefined;
  }

  public getActiveWorldPositions(): ReadonlyArray<{ worldX: number; worldY: number; kind: NpcKind }> {
    return this.present().map((n) => ({ worldX: n.worldX, worldY: n.worldY, kind: n.kind }));
  }

  public render(tileSize: number, camera: WorldCamera): void {
    const now = this.scene.time.now;
    for (const npc of this.present()) {
      npc.render(
        tileSize,
        camera,
        !this.isTalkTarget(npc.worldX, npc.worldY) && this.hasNewDialog(npc.kind, npc.worldX, npc.worldY, npc.dialog),
        now,
      );
    }
  }

  /**
   * Drop every "!" marker. The markers are 2D overlay sprites, so they do NOT sink with
   * the world when the death fade darkens the 3D canvas — and render() stops running once the
   * hero is dead, which would otherwise leave one hanging over the black.
   */
  public hideExclaims(): void {
    for (const npc of this.all()) npc.hideExclaim();
  }

  public destroy(): void {
    for (const list of this.byChunk.values()) {
      for (const npc of list) npc.destroy();
    }
    this.byChunk.clear();
    this.awayKinds.clear();
  }
}

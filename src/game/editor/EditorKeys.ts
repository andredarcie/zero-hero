// OS ATALHOS DO EDITOR: as abas, as ferramentas, desfazer e refazer, salvar, navegar entre chunks, e o espaço que arrasta
// a vista — nunca enquanto se digita num campo nem com uma janela aberta.

import type { TileLayerId } from '@/game/editor/EditorStore';
import type { PropDir, PropKind } from '@/game/world/worldSchema';
import type { EntitySelection } from './EditorMinimap';
import type { CollisionPaintMode, ReliefPaintMode, SoilPaintMode, ViewMode } from './EditorPanels';
import type { EditorDomUi } from './EditorDomUi';

export type ToolId = 'brush' | 'eraser' | 'rect' | 'fill' | 'picker' | 'collision' | 'relief' | 'soil' | 'entity' | 'spawn';
export type PaletteTab = 'tiles' | 'npcs' | 'pickups' | 'props';
export type UiState = {
  tool: ToolId;
  layer: TileLayerId;
  tile: number | null;
  brushSize: 1 | 2 | 3;
  collisionMode: CollisionPaintMode;
  reliefMode: ReliefPaintMode;
  soilMode: SoilPaintMode;
  tab: PaletteTab;
  entity: EntitySelection;
  showGrid: boolean;
  showCollisions: boolean;
  showRelief: boolean;
  showEntities: boolean;
  /** As peças que o JOGO monta por código em lugar fixo (cachoeira, bosque, acampamento...): ver EditorFixtures. */
  showFixtures: boolean;
  // A direcao com que o proximo prop direcional sera colocado.
  // Vive no estado da UI, e nao na selecao da paleta, porque e uma preferencia do PINCEL —
  // igual ao tamanho do brush: escolhe-se uma vez e vale pras proximas colocadas.
  propDir: PropDir;
  // Chunk view: camera locked and fitted to one chunk, edits confined to it.
  viewMode: ViewMode;
  chunkX: number;
  chunkY: number;
};
// Props que carregam orientacao. E um conjunto, e nao um booleano no braco, porque a pergunta
// que o editor faz e "esta peca gira?" — e quando existir a segunda peca giratoria, ela entra
// aqui e ganha o G de graca. (Aconteceu: a caixa de ferramentas.)
const DIRECTIONAL_PROPS: ReadonlySet<PropKind> = new Set<PropKind>(['toolbox', 'furnace']);
export const isDirectionalProp = (type: PropKind): boolean => DIRECTIONAL_PROPS.has(type);

/** O que EditorKeys usa de EditorDomUi. */
export type EditorKeysHost = Pick<EditorDomUi,
  'cb' | 'changed' | 'isModalOpen' | 'modals' | 'navChunk' | 'selectTab' | 'spaceHeld' | 'state' | 'suspended'
>;

export class EditorKeys {
  public constructor(private readonly host: EditorKeysHost) {}

  private isTypingTarget(event: KeyboardEvent): boolean {
    const target = event.target as HTMLElement | null;
    if (!target) return false;
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
  }

  public onKeyDown(event: KeyboardEvent): void {
    if (this.host.suspended) return;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      this.host.cb.onSave();
      return;
    }
    if (this.isTypingTarget(event)) return;

    if (event.key === 'Escape' && this.host.isModalOpen()) {
      this.host.modals.closeModal();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) this.host.cb.onRedo();
      else this.host.cb.onUndo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      this.host.cb.onRedo();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey || this.host.isModalOpen()) return;

    if (event.code === 'Space') {
      this.host.spaceHeld = true;
      event.preventDefault();
      return;
    }

    const key = event.key.toLowerCase();
    const toolByKey: Record<string, ToolId> = { b: 'brush', e: 'eraser', r: 'rect', f: 'fill', i: 'picker', c: 'collision', a: 'relief', h: 'soil', s: 'spawn' };
    if (toolByKey[key]) {
      this.host.state.tool = toolByKey[key];
      this.host.changed();
      return;
    }
    // G de GIRAR. Nao e R porque aqui R ja e a ferramenta retangulo, e
    // roubar um atalho de ferramenta pra girar um unico prop seria um mau negocio.
    if (key === 'g' && this.host.state.entity.list === 'props' && isDirectionalProp(this.host.state.entity.type)) {
      this.host.state.propDir = (((this.host.state.propDir ?? 1) + 1) % 4) as PropDir;
      this.host.changed();
      return;
    }
    const tabByKey: Record<string, PaletteTab> = { 1: 'tiles', 2: 'npcs', 3: 'pickups', 4: 'props' };
    if (tabByKey[key]) {
      this.host.selectTab(tabByKey[key]);
      return;
    }
    if (key === 'm') {
      this.host.state.viewMode = this.host.state.viewMode === 'world' ? 'chunk' : 'world';
      this.host.changed();
      return;
    }
    if (this.host.state.viewMode === 'chunk' && key.startsWith('arrow')) {
      event.preventDefault();
      if (key === 'arrowleft') this.host.navChunk(-1, 0);
      else if (key === 'arrowright') this.host.navChunk(1, 0);
      else if (key === 'arrowup') this.host.navChunk(0, -1);
      else this.host.navChunk(0, 1);
      return;
    }
    if (key === 'g') { this.host.state.showGrid = !this.host.state.showGrid; this.host.changed(); return; }
    if (key === 'v') { this.host.state.showCollisions = !this.host.state.showCollisions; this.host.changed(); return; }
    if (key === 'l') { this.host.state.showRelief = !this.host.state.showRelief; this.host.changed(); return; }
    if (key === 't') { this.host.state.showEntities = !this.host.state.showEntities; this.host.changed(); return; }
    if (key === 'o') { this.host.state.showFixtures = !this.host.state.showFixtures; this.host.changed(); return; }
    if (key === 'p') { this.host.cb.onPlaytest(); return; }
    if (key === '0') { this.host.cb.onFitView(); return; }
    if (key === 'tab') {
      event.preventDefault();
      this.host.state.layer = this.host.state.layer === 'ground' ? 'upper' : 'ground';
      this.host.changed();
      return;
    }
    if (key === '[') {
      this.host.state.brushSize = Math.max(1, this.host.state.brushSize - 1) as UiState['brushSize'];
      this.host.changed();
      return;
    }
    if (key === ']') {
      this.host.state.brushSize = Math.min(3, this.host.state.brushSize + 1) as UiState['brushSize'];
      this.host.changed();
    }
  }

  public onKeyUp(event: KeyboardEvent): void {
    if (event.code === 'Space') this.host.spaceHeld = false;
  }
}

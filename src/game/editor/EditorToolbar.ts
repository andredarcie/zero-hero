// A BARRA DO PAINEL DO EDITOR: o título (com a marca de não salvo e o nome do mundo), as ações (salvar, testar,
// recarregar, as janelas, desfazer, refazer, enquadrar), as ferramentas e as abas da paleta. Montada uma vez; quem acende
// os botões a cada mudança é a EditorDomUi (syncFromState/refreshHeader), e quem os põe no painel, na ordem, também.

import type { EditorDomUi } from './EditorDomUi';
import type { PaletteTab, ToolId } from './EditorKeys';

/** As ferramentas: o botão, a tecla e a dica de cada uma (a barra de status também lê). */
export const TOOL_DEFS: ReadonlyArray<{ id: ToolId; label: string; kbd: string; hint: string }> = [
  { id: 'brush', label: 'Pincel', kbd: 'B', hint: 'Pinta tiles na camada ativa' },
  { id: 'eraser', label: 'Borracha', kbd: 'E', hint: 'Limpa camada superior, colisao e entidades' },
  { id: 'rect', label: 'Retangulo', kbd: 'R', hint: 'Arraste para preencher uma area' },
  { id: 'fill', label: 'Balde', kbd: 'F', hint: 'Preenche a regiao contigua com o tile' },
  { id: 'picker', label: 'Conta-gotas', kbd: 'I', hint: 'Copia o tile sob o cursor' },
  { id: 'collision', label: 'Colisao', kbd: 'C', hint: 'Pinta colisao (botao direito limpa)' },
  { id: 'relief', label: 'Serra', kbd: 'A', hint: 'Planalto um nivel acima, ou escada para subir (botao direito volta ao chao)' },
  { id: 'entity', label: 'Entidade', kbd: '2-5', hint: 'Coloca a entidade escolhida na paleta' },
  { id: 'spawn', label: 'Ponto Inicial', kbd: 'S', hint: 'Obrigatorio: clique onde o jogador deve comecar' },
];

const TAB_DEFS: ReadonlyArray<{ id: PaletteTab; label: string; kbd: string }> = [
  { id: 'tiles', label: 'Tiles', kbd: '1' },
  { id: 'npcs', label: 'NPCs', kbd: '2' },
  { id: 'pickups', label: 'Itens', kbd: '3' },
  { id: 'props', label: 'Props', kbd: '4' },
];

/** O que a barra usa da EditorDomUi. */
export type EditorToolbarHost = Pick<EditorDomUi,
  'button' | 'cb' | 'changed' | 'modals' | 'saveTargetPath' | 'sectionLabel' | 'selectTab' | 'state'
>;

export class EditorToolbar {
  public readonly header: HTMLDivElement;
  public readonly actions: HTMLDivElement;
  public readonly tools: HTMLDivElement;
  public readonly tabs: HTMLDivElement;
  public readonly dirtyEl: HTMLSpanElement;
  public readonly subtitleEl: HTMLDivElement;
  public readonly undoBtn: HTMLButtonElement;
  public readonly redoBtn: HTMLButtonElement;
  public readonly toolButtons = new Map<ToolId, HTMLButtonElement>();
  public readonly tabButtons = new Map<PaletteTab, HTMLButtonElement>();

  public constructor(ui: EditorToolbarHost) {
    const header = document.createElement('div');
    header.className = 'zh-header';
    const title = document.createElement('div');
    title.className = 'zh-title';
    title.textContent = 'ZERO ENGINE';
    this.dirtyEl = document.createElement('span');
    this.dirtyEl.className = 'zh-dirty';
    this.dirtyEl.title = 'Alteracoes nao salvas';
    title.appendChild(this.dirtyEl);
    this.subtitleEl = document.createElement('div');
    this.subtitleEl.className = 'zh-subtitle';
    header.append(title, this.subtitleEl);

    // OS DOIS ANDARES, e por que eles ficam ANTES do Salvar: o botão mais perigoso do painel
    // escreve num arquivo, e o autor precisa ler de cima para baixo "estou no subterrâneo → salvo
    // no subterrâneo". Embaixo, a chave viraria uma descoberta depois do estrago.

    // Primary actions
    const actions = document.createElement('div');
    actions.className = 'zh-actions';
    actions.append(
      ui.button('Salvar', `Salvar em ${ui.saveTargetPath()} (Ctrl+S)`, () => ui.cb.onSave(), 'primary'),
      ui.button('&#9654; Testar', 'Joga o mundo em edicao sem salvar (P) — ESC volta', () => ui.cb.onPlaytest()),
      ui.button('Recarregar', `Descarta e recarrega de ${ui.saveTargetPath()}`, () => ui.cb.onReload()),
    );
    actions.append(
      ui.button('Mundo&#8230;', 'Nome, tamanho e validacao do mundo', () => ui.modals.openWorldModal()),
      ui.button('Dialogos&#8230;', 'Editor de dialogos dos NPCs', () => ui.modals.openDialogModal()),
      ui.button('Ajuda (?)', 'Atalhos e controles', () => ui.modals.openHelpModal()),
    );
    this.undoBtn = ui.button('&#8630; Desfazer', 'Ctrl+Z', () => ui.cb.onUndo());
    this.redoBtn = ui.button('&#8631; Refazer', 'Ctrl+Y', () => ui.cb.onRedo());
    actions.append(this.undoBtn, this.redoBtn, ui.button('Enquadrar', 'Centraliza o mundo na tela (0)', () => ui.cb.onFitView()));

    // Tools
    const toolSection = document.createElement('div');
    toolSection.className = 'zh-section';
    toolSection.appendChild(ui.sectionLabel('Ferramentas'));
    const tools = document.createElement('div');
    tools.className = 'zh-tools';
    TOOL_DEFS.forEach((def) => {
      const btn = ui.button(def.label, `${def.hint}`, () => {
        ui.state.tool = def.id;
        ui.changed();
      });
      const kbd = document.createElement('span');
      kbd.className = 'zh-kbd';
      kbd.textContent = def.kbd;
      btn.appendChild(kbd);
      this.toolButtons.set(def.id, btn);
      tools.appendChild(btn);
    });
    toolSection.appendChild(tools);
    this.header = header;
    this.actions = actions;
    this.tools = toolSection;

    const tabs = document.createElement('div');
    tabs.className = 'zh-tabs';
    TAB_DEFS.forEach((def) => {
      const btn = ui.button(def.label, `Paleta de ${def.label.toLowerCase()} (${def.kbd})`, () => {
        ui.selectTab(def.id);
      });
      this.tabButtons.set(def.id, btn);
      tabs.appendChild(btn);
    });
    this.tabs = tabs;
  }
}

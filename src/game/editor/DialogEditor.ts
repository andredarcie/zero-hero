// O EDITOR DE FALAS (pedido do autor, 2026-11-18: "um editor de diálogos para eu usar e alterar os diálogos quando
// quiser" e, depois, "mais amigável para escritores"). Abre do /editor (botão "Falas…") por cima do mapa e edita o que
// os personagens DIZEM de verdade: os dois arquivos de src/game/i18n/dialogos (o rascunho em editor/dialogDraft),
// gravados pelo dev server (/api/dialogos). Três colunas: os personagens; as conversas de quem está escolhido, cada uma
// com título e QUANDO aparece (editor/DialogEditorFalas, editor/DialogEditorBox); e a coluna de quem escreve — a
// prévia da caixa como no jogo, a ficha do personagem e o guia de escrita (editor/DialogEditorSide).
//
// Para não perder trabalho: o rascunho se guarda sozinho enquanto se escreve (e volta, oferecido, se a página
// recarregar), e o que muda a lista de caixas se desfaz (o botão ↶, ou Ctrl+Z fora do texto). O aviso de verso não
// impede salvar — o versos.test cobra depois. Ctrl+S salva as FALAS (e não o mundo); Esc fecha, perguntando antes.

import { NPC_VISUALS } from '@/game/constants';
import { DIALOG_FILES_PATH, loadDialogFiles, saveDialogFiles } from '@/game/dialogApi';
import type { VerseRule } from '@/game/i18n/verseCheck';
import type { EditorDomUi } from './EditorDomUi';
import { DialogEditorFalas, characterWarnings, falaWarns } from './DialogEditorFalas';
import { DialogEditorSide, type SpeakerLook } from './DialogEditorSide';
import { ensureDialogEditorStyle } from './dialogEditorCss';
import {
  applyDraft, draftOf, formatDialogJson, kindOf, matchesFala, readCharacters, speakerName, writeFalas,
  type Character, type DialogFiles, type DialogLang, type DraftSnapshot, type Fala,
} from './dialogDraft';

export interface DialogPort {
  load: () => Promise<DialogFiles>;
  save: (texts: Record<DialogLang, string>) => Promise<void>;
  /** Onde o rascunho não salvo se guarda sozinho (o navegador); sem ele, não se guarda. */
  draft?: { read: () => DraftSnapshot | null; write: (d: DraftSnapshot) => void; clear: () => void };
}

export interface DialogEditorHost {
  modalRoot: HTMLElement;
  toast: (message: string, durationMs?: number) => void;
  icon: (key: string, frame?: number) => string;
  /** A cor do nome deste NPC na caixa de fala (o world.json). */
  colorOf?: (kind: string) => string | undefined;
}

const SECTION_LABEL: Record<string, string> = {
  narrador: 'Narrador', ultimo_pedido: 'Último pedido', fim: 'Fim', fora_do_jogo: 'Fora do jogo',
};
const PREF_ENGLISH = 'zh.falas.ingles';
const DRAFT_MS = 700;

const div = (className: string, text = ''): HTMLDivElement => {
  const node = document.createElement('div');
  node.className = className;
  if (text) node.textContent = text;
  return node;
};
const pref = (key: string, fallback: boolean): boolean => {
  try { const v = localStorage.getItem(key); return v === null ? fallback : v === '1'; } catch { return fallback; }
};

const button = (label: string, title: string, onClick: () => void, extra = ''): HTMLButtonElement => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `zh-btn ${extra}`.trim();
  b.textContent = label;
  if (title) b.title = title;
  b.addEventListener('click', onClick);
  return b;
};

const toggle = (parent: HTMLElement, label: string, on: boolean, change: (on: boolean) => void): HTMLInputElement => {
  const wrap = document.createElement('label');
  wrap.className = 'zh-falas-toggle';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = on;
  input.addEventListener('change', () => change(input.checked));
  wrap.append(input, document.createTextNode(label));
  parent.appendChild(wrap);
  return input;
};

/** O retrato do personagem (o do NPC das falas dele), ou vazio. */
const portraitFor = (host: DialogEditorHost, c: Character): string => {
  const kind = kindOf(c, (k) => Boolean(NPC_VISUALS[k]));
  const visual = kind ? NPC_VISUALS[kind] : undefined;
  return visual ? host.icon(visual.key, visual.frame) : '';
};

/** A lista dos personagens: retrato, nome, quantas falas (ou quantas a busca achou) e quantas caixas com aviso. */
const renderList = (
  listEl: HTMLElement,
  characters: readonly Character[],
  o: { query: string; active: string; rule: VerseRule; portrait: (c: Character) => string; select: (id: string) => void },
): void => {
  listEl.replaceChildren();
  const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
  // Quem não fala no jogo (o herói) não ocupa lugar na lista.
  for (const c of characters.filter((x) => x.falas.length > 0)) {
    const hits = o.query ? c.falas.filter((f) => matchesFala(f, o.query)).length : -1;
    const btn = button('', c.id, () => o.select(c.id));
    btn.dataset.section = c.id;
    btn.classList.toggle('active', c.id === o.active);
    btn.classList.toggle('off', hits === 0);
    const img = document.createElement('img');
    img.alt = '';
    const portrait = o.portrait(c);
    if (portrait) img.src = portrait;
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = c.name || SECTION_LABEL[c.id] || c.id;
    const small = document.createElement('small');
    small.textContent = hits >= 0
      ? plural(hits, 'fala achada', 'falas achadas')
      : plural(c.falas.filter((f) => f.kind !== 'name').length, 'fala', 'falas');
    who.appendChild(small);
    btn.append(img, who);
    const warnings = characterWarnings(c, o.rule);
    if (warnings > 0) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = String(warnings);
      badge.title = `${warnings} ${warnings === 1 ? 'caixa' : 'caixas'} com aviso`;
      btn.appendChild(badge);
    }
    listEl.appendChild(btn);
  }
};

export class DialogEditor {
  private readonly root: HTMLDivElement;
  private readonly listEl: HTMLDivElement;
  private readonly statusEl: HTMLDivElement;
  private readonly bannerEl: HTMLDivElement;
  private readonly searchEl: HTMLInputElement;
  private readonly englishEl: HTMLInputElement;
  private readonly warnOnlyEl: HTMLInputElement;
  private readonly undoBtn: HTMLButtonElement;
  private readonly falas: DialogEditorFalas;
  private readonly side = new DialogEditorSide();
  private files?: DialogFiles;
  /** As falas como estão nos arquivos (o rascunho se mede contra elas). */
  private saved: Character[] = [];
  private characters: Character[] = [];
  private rule: VerseRule = { metro: { min: 6, max: 9 }, estrofe: 4, rimam: [2, 4] };
  private selected = '';
  private dirty = false;
  private destroyed = false;
  private draftTimer = 0;
  private readonly undo: Array<{ fala: Fala; pt: string[]; en: string[]; label: string }> = [];

  public constructor(private readonly host: DialogEditorHost, private readonly port: DialogPort) {
    ensureDialogEditorStyle();
    host.modalRoot.innerHTML = '';
    this.root = div('zh-modal-backdrop');
    const panel = div('zh-falas');
    const head = div('zh-falas-head');
    const title = document.createElement('h2');
    title.textContent = 'FALAS';
    this.searchEl = document.createElement('input');
    this.searchEl.type = 'search';
    this.searchEl.placeholder = 'Buscar em todas as falas (uma palavra, um nome)…';
    this.searchEl.addEventListener('input', () => this.render());
    this.englishEl = toggle(head, 'Mostrar inglês', pref(PREF_ENGLISH, true), (on) => {
      try { localStorage.setItem(PREF_ENGLISH, on ? '1' : '0'); } catch { /* sem storage */ }
      this.render();
    });
    this.warnOnlyEl = toggle(head, 'Só caixas com aviso', false, () => this.render());
    this.statusEl = div('zh-falas-status', 'Carregando falas…');
    this.undoBtn = button('↶ Desfazer', 'Desfaz a última mudança na lista de caixas (Ctrl+Z fora do texto)', () => this.undoLast());
    head.prepend(title, this.searchEl);
    head.append(
      this.statusEl, this.undoBtn,
      button('Descartar', 'Volta ao que está nos arquivos (joga fora o que não foi salvo)', () => void this.reload(true)),
      button('Salvar', `Grava em ${DIALOG_FILES_PATH} (Ctrl+S)`, () => void this.save(), 'primary'),
      button('✕', 'Fechar (Esc)', () => this.close()),
    );
    this.bannerEl = div('zh-falas-banner');
    const main = div('zh-falas-main');
    this.listEl = div('zh-falas-list');
    this.falas = new DialogEditorFalas({
      rule: () => this.rule,
      changed: () => this.touch(),
      focus: (f, i, lang) => this.side.preview(f, i, lang, this.speaker(f.section, lang)),
      structure: (f, label, op) => this.structure(f, label, op),
      look: (c) => ({ speaker: speakerName(c, 'pt-br'), portrait: portraitFor(this.host, c) }),
    });
    main.append(this.listEl, this.falas.el, this.side.el);
    panel.append(head, this.bannerEl, main);
    this.root.appendChild(panel);
    host.modalRoot.appendChild(this.root);
    window.addEventListener('keydown', this.onKey, true);
    void this.reload();
  }

  /** O que a janela mostra (a janela do teste e do playtest). */
  public get state(): { selected: string; query: string; dirty: boolean; characters: number; warnings: number; undo: number } {
    return {
      selected: this.selected, query: this.searchEl.value, dirty: this.dirty, characters: this.characters.length,
      warnings: this.characters.reduce((n, c) => n + characterWarnings(c, this.rule), 0), undo: this.undo.length,
    };
  }

  public get preview(): DialogEditorSide['state'] {
    return this.side.state;
  }

  /** Lê os arquivos de novo. `discard` joga fora o rascunho guardado; sem ele, o rascunho é oferecido de volta. */
  public async reload(discard = false): Promise<void> {
    try {
      this.files = await this.port.load();
    } catch (error) {
      this.statusEl.textContent = error instanceof Error ? error.message : 'Falha ao carregar as falas';
      return;
    }
    if (this.destroyed) return;
    const verso = this.files['pt-br']._verso as Partial<VerseRule> | undefined;
    if (verso?.metro && verso.estrofe && verso.rimam) this.rule = verso as VerseRule;
    this.characters = readCharacters(this.files);
    this.saved = readCharacters(this.files);
    if (!this.characters.some((c) => c.id === this.selected)) this.selected = this.characters.find((c) => c.falas.length > 0)?.id ?? '';
    this.dirty = false;
    this.undo.length = 0;
    this.banner(null);
    if (discard) this.port.draft?.clear();
    else this.offerDraft();
    this.render();
  }

  /** Grava os dois arquivos. Devolve se gravou. */
  public async save(): Promise<boolean> {
    if (!this.files) return false;
    const next = writeFalas(this.files, this.characters);
    try {
      await this.port.save({ 'pt-br': formatDialogJson(next['pt-br']), en: formatDialogJson(next.en) });
    } catch (error) {
      this.host.toast(`Falas NÃO salvas: ${error instanceof Error ? error.message : 'erro'}`, 5000);
      return false;
    }
    this.files = next;
    this.saved = readCharacters(next);
    this.dirty = false;
    window.clearTimeout(this.draftTimer);
    this.port.draft?.clear();
    const warnings = this.state.warnings;
    this.host.toast(warnings > 0
      ? `Falas salvas — ${warnings} ${warnings === 1 ? 'caixa' : 'caixas'} com aviso de verso`
      : 'Falas salvas. O jogo aberto já fala o texto novo.', 4000);
    this.refreshStatus();
    return true;
  }

  /** Fecha; com falas não salvas, pergunta antes (a menos que `force`). */
  public close(force = false): void {
    if (this.dirty && !force) {
      this.banner('warn', 'As falas mudaram e não foram salvas.', [
        ['Salvar e fechar', () => void this.save().then((ok) => { if (ok) this.destroy(); }), 'primary'],
        ['Fechar sem salvar', () => { this.port.draft?.clear(); this.destroy(); }],
        ['Continuar escrevendo', () => this.banner(null)],
      ]);
      return;
    }
    this.destroy();
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    window.clearTimeout(this.draftTimer);
    window.speechSynthesis?.cancel();
    window.removeEventListener('keydown', this.onKey, true);
    this.root.remove();
  }

  public select(id: string): void {
    this.selected = id;
    this.searchEl.value = '';
    this.render();
    this.falas.el.scrollTop = 0;
  }

  /** Volta a última mudança na lista de caixas. */
  public undoLast(): void {
    const last = this.undo.pop();
    if (!last) return;
    last.fala.pt.splice(0, last.fala.pt.length, ...last.pt);
    last.fala.en.splice(0, last.fala.en.length, ...last.en);
    this.host.toast(`Desfeito: ${last.label}`, 2000);
    this.touch();
    this.render();
  }

  private structure(f: Fala, label: string, op: () => void): void {
    this.undo.push({ fala: f, pt: [...f.pt], en: [...f.en], label });
    const before = f.pt.length;
    op();
    if (f.pt.length < before) this.host.toast('Caixa tirada. Para trazer de volta: ↶ Desfazer (ou Ctrl+Z).', 3500);
    this.touch();
    this.render();
    this.side.refresh();
  }

  private touch(): void {
    this.dirty = true;
    this.refreshStatus();
    this.renderList();
    this.side.refresh();
    window.clearTimeout(this.draftTimer);
    if (this.port.draft) this.draftTimer = window.setTimeout(() => this.port.draft?.write(draftOf(this.characters, this.saved, Date.now())), DRAFT_MS);
  }

  /** Um rascunho guardado que difere dos arquivos é oferecido de volta (nunca posto sem perguntar). */
  private offerDraft(): void {
    const draft = this.port.draft?.read();
    if (!draft || draft.falas.length === 0) return;
    const at = new Date(draft.at);
    const when = `${at.toLocaleDateString('pt-BR')} ${at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    this.banner('info', `Há um rascunho não salvo de ${when} (${draft.falas.length} ${draft.falas.length === 1 ? 'fala' : 'falas'}).`, [
      ['Recuperar o rascunho', () => {
        const n = applyDraft(this.characters, draft);
        this.banner(null);
        this.touch();
        this.render();
        this.host.toast(`${n} ${n === 1 ? 'fala recuperada' : 'falas recuperadas'} — confira e salve.`, 3500);
      }, 'primary'],
      ['Jogar fora', () => { this.port.draft?.clear(); this.banner(null); }],
    ]);
  }

  private render(): void {
    this.renderList();
    const query = this.searchEl.value.trim();
    const warnOnly = this.warnOnlyEl.checked;
    const pick = (c: Character): Fala[] => c.falas.filter((f) => (!query || matchesFala(f, query)) && (!warnOnly || falaWarns(f, this.rule)));
    const english = this.englishEl.checked;
    if (query || warnOnly) {
      const groups = this.characters.map((character) => ({ character, falas: pick(character) })).filter((g) => g.falas.length > 0);
      this.falas.show(groups, { titled: true, english, empty: query ? `Nenhuma fala com "${query}".` : 'Nenhuma caixa com aviso. Tudo no metro e rimando.' });
      this.side.showCharacter(undefined);
    } else {
      const c = this.characters.find((x) => x.id === this.selected);
      this.falas.show(c ? [{ character: c, falas: c.falas }] : [], { titled: false, english, empty: 'Este personagem não fala no jogo.' });
      this.side.showCharacter(c);
    }
    this.refreshStatus();
  }

  private renderList(): void {
    const query = this.searchEl.value.trim();
    renderList(this.listEl, this.characters, {
      query, rule: this.rule, active: query || this.warnOnlyEl.checked ? '' : this.selected,
      portrait: (c) => portraitFor(this.host, c), select: (id) => this.select(id),
    });
  }

  /** Quem fala na prévia: o nome da caixa de fala, a cor do world.json e o retrato. */
  private speaker(section: string, lang: DialogLang): SpeakerLook {
    const c = this.characters.find((x) => x.id === section);
    if (!c) return { name: '', color: '#e5b558', portrait: '' };
    const kind = kindOf(c, (k) => Boolean(NPC_VISUALS[k]));
    return { name: kind ? speakerName(c, lang) : '', color: (kind && this.host.colorOf?.(kind)) || '#e5b558', portrait: portraitFor(this.host, c) };
  }

  private refreshStatus(): void {
    const { warnings } = this.state;
    this.statusEl.replaceChildren();
    const w = document.createElement('span');
    w.className = warnings > 0 ? 'on' : '';
    w.textContent = warnings > 0 ? `${warnings} ${warnings === 1 ? 'caixa' : 'caixas'} com aviso` : 'verso conferido';
    const d = document.createElement('span');
    d.className = this.dirty ? 'on' : '';
    d.textContent = this.dirty ? ' · não salvo' : ' · salvo';
    this.statusEl.append(w, d);
    this.undoBtn.disabled = this.undo.length === 0;
    this.undoBtn.title = this.undo.length ? `Desfazer: ${this.undo[this.undo.length - 1].label} (Ctrl+Z fora do texto)` : 'Nada a desfazer';
  }

  private banner(kind: 'warn' | 'info' | null, text = '', actions: Array<[string, () => void, string?]> = []): void {
    this.bannerEl.className = kind ? `zh-falas-banner on ${kind}` : 'zh-falas-banner';
    this.bannerEl.replaceChildren();
    if (!kind) return;
    this.bannerEl.appendChild(document.createTextNode(text));
    for (const [label, fn, extra] of actions) this.bannerEl.appendChild(button(label, '', fn, extra));
  }

  /** Ctrl+S salva as falas, Esc fecha, Ctrl+Z fora do texto desfaz a lista; nada disso chega ao editor do mapa. */
  private readonly onKey = (event: KeyboardEvent): void => {
    if (this.destroyed) return;
    if (!this.root.isConnected) { this.destroy(); return; }
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    const inText = ['TEXTAREA', 'INPUT'].includes((event.target as HTMLElement | null)?.tagName ?? '');
    if (mod && key === 's') {
      event.preventDefault();
      event.stopPropagation();
      void this.save();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (event.target === this.searchEl && this.searchEl.value) { this.searchEl.value = ''; this.render(); } else this.close();
    } else if (mod && (key === 'z' || key === 'y')) {
      event.stopPropagation();
      if (inText) return;
      event.preventDefault();
      if (key === 'z' && !event.shiftKey) this.undoLast();
    }
  };
}

const DRAFT_KEY = 'zh.falas.rascunho';

/** Abre o editor de falas com os arquivos de verdade (o dev server) e o rascunho no navegador. */
export const openDialogEditor = (ui: Pick<EditorDomUi, 'icon' | 'modalRoot' | 'store' | 'toast'>): DialogEditor => new DialogEditor({
  modalRoot: ui.modalRoot,
  toast: (m, ms) => ui.toast(m, ms),
  icon: (k, f) => ui.icon(k, f),
  colorOf: (kind) => {
    try { return ui.store.meta.getDialog(kind as never).npcColorHex; } catch { return undefined; }
  },
}, {
  load: loadDialogFiles,
  save: saveDialogFiles,
  draft: {
    read: () => {
      try { return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') as DraftSnapshot | null; } catch { return null; }
    },
    write: (d) => {
      try { if (d.falas.length) localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); else localStorage.removeItem(DRAFT_KEY); } catch { /* sem storage */ }
    },
    clear: () => { try { localStorage.removeItem(DRAFT_KEY); } catch { /* sem storage */ } },
  },
});

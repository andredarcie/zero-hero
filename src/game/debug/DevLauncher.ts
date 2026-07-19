// Dev-only launcher: [I] pops a menu to jump between every entry point of the project —
// the game (with and without the intro), the world editor, the puzzle lab (editor or play)
// and Survivors. Localhost only; it never ships (the whole module no-ops unless DEV).
//
// Plain DOM, like DialogOverlay / PauseMenu / EditorDomUi: it must keep working across scene
// swaps and while a Phaser scene is paused, and every jump is a full page load anyway
// (Phaser scene changes do not hot-reload — see CLAUDE.md).
//
// Key choice: [I] is free in the game, but inside the EDITOR it is already the eyedropper
// ("conta-gotas"), so there the launcher answers to Shift+I instead of stealing the tool.

const STYLE_ID = 'zh-launcher-style';
const ROOT_ID = 'zh-launcher-root';
const SERIF = "Georgia, 'Times New Roman', 'Book Antiqua', serif";

type Entry = {
  label: string;
  hint: string;
  url: string;
  group: string;
};

const ENTRIES: Entry[] = [
  { group: 'Jogo', label: 'Jogar o jogo', hint: 'Do começo: idioma, título e intro', url: '/' },
  { group: 'Jogo', label: 'Jogar pulando a intro', hint: 'Cai direto no mundo (?play)', url: '/?play' },
  { group: 'Jogo', label: 'Survivors', hint: 'Modo Vampire-Survivors (?survivors)', url: '/?survivors' },
  { group: 'Laboratório de puzzles', label: 'Jogar o level 1', hint: 'Joga levels/level-1.json direto', url: '/lab?play' },
  { group: 'Laboratório de puzzles', label: 'Editar o level 1', hint: 'Editor do lab — monte o puzzle e [P] testa', url: '/lab' },
  { group: 'Laboratório de puzzles', label: 'Editar o level 2', hint: 'Editor do lab apontado no level 2', url: '/lab?level=2' },
  { group: 'Editor', label: 'Abrir o editor do mundo', hint: 'Edita o mundo real (world.json)', url: '/editor' },
];

const CSS = `
#${ROOT_ID} { position: fixed; inset: 0; z-index: 90; font-family: ${SERIF}; }
#${ROOT_ID} .zh-lx-scrim {
  position: absolute; inset: 0; background: rgba(0, 0, 0, 0.62);
  opacity: 0; transition: opacity 120ms ease;
}
#${ROOT_ID} .zh-lx-panel {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: min(30em, calc(100vw - 2.5em));
  max-height: calc(100vh - 2em); overflow-y: auto;
  background: #14100c; border: 1px solid #3d342a; color: #d8d1c0;
  box-shadow: 0 12px 44px rgba(0, 0, 0, 0.7);
  padding: 1.4em 1.6em 1.2em;
  font-size: clamp(13px, 2.3vh, 16px);
  opacity: 0; transform-origin: center; transition: opacity 120ms ease;
}
#${ROOT_ID}.zh-in .zh-lx-scrim, #${ROOT_ID}.zh-in .zh-lx-panel { opacity: 1; }
#${ROOT_ID} h1 {
  margin: 0 0 0.2em; text-align: center; font-size: 1em; font-weight: 700;
  letter-spacing: 0.34em; text-indent: 0.34em; color: #e7dcc4;
}
#${ROOT_ID} .zh-lx-sub {
  margin: 0 0 1.1em; text-align: center; font-size: 0.78em; color: #8b8474;
}
#${ROOT_ID} .zh-lx-group {
  margin: 1em 0 0.35em; font-size: 0.72em; letter-spacing: 0.2em;
  text-transform: uppercase; color: #7a6f5c;
}
#${ROOT_ID} .zh-lx-item {
  display: flex; align-items: baseline; gap: 0.7em;
  box-sizing: border-box; width: 100%;
  padding: 0.5em 0.75em; margin: 0.25em 0;
  text-align: left; cursor: pointer; user-select: none;
  border: 1px solid #3d342a; background: transparent; color: #d8d1c0;
  font: inherit;
  transition: background 80ms ease, color 80ms ease, border-color 80ms ease;
}
#${ROOT_ID} .zh-lx-item .zh-lx-num {
  flex: none; width: 1.2em; color: #7a6f5c; font-size: 0.85em;
}
#${ROOT_ID} .zh-lx-item .zh-lx-label { flex: none; }
#${ROOT_ID} .zh-lx-item .zh-lx-hint {
  margin-left: auto; text-align: right; font-size: 0.76em; color: #8b8474;
}
#${ROOT_ID} .zh-lx-item:hover, #${ROOT_ID} .zh-lx-item.zh-sel {
  background: #d4c8a4; color: #241d12; border-color: #d4c8a4;
}
#${ROOT_ID} .zh-lx-item:hover .zh-lx-num, #${ROOT_ID} .zh-lx-item.zh-sel .zh-lx-num,
#${ROOT_ID} .zh-lx-item:hover .zh-lx-hint, #${ROOT_ID} .zh-lx-item.zh-sel .zh-lx-hint {
  color: #4a3f2c;
}
#${ROOT_ID} .zh-lx-here {
  opacity: 0.45; cursor: default;
}
#${ROOT_ID} .zh-lx-foot {
  margin-top: 1.1em; padding-top: 0.8em; border-top: 1px solid #3d342a;
  font-size: 0.72em; color: #7a6f5c; text-align: center;
}
`;

// The lab and the editor share EditorDomUi, whose own [I] is the eyedropper — so there the
// launcher listens for Shift+I. Detected from the live DOM, not from the app mode, because
// this module boots before any scene does.
const editorIsOpen = (): boolean => document.querySelector('.editor-panel, #editor-panel, .zh-editor') !== null
  || window.location.pathname.endsWith('/editor')
  || (window.location.pathname.endsWith('/lab') && !new URLSearchParams(window.location.search).has('play'));

const isTypingTarget = (el: EventTarget | null): boolean => {
  const node = el as HTMLElement | null;
  if (!node) return false;
  const tag = node.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable;
};

class DevLauncher {
  private root?: HTMLDivElement;
  private selected = 0;
  private readonly base: string;

  public constructor() {
    // Respect Vite's base path (the itch/Pages builds are not served from root).
    this.base = import.meta.env.BASE_URL.replace(/\/+$/u, '');
    window.addEventListener('keydown', this.onKeyDown, true);
  }

  private get isOpen(): boolean {
    return this.root !== undefined;
  }

  /** The entry that matches the page we are already on (shown dimmed, not navigable). */
  private isCurrent(entry: Entry): boolean {
    const here = `${window.location.pathname.replace(this.base, '') || '/'}${window.location.search}`;
    return here === entry.url;
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (this.isOpen) {
      // While the menu is up it owns the keyboard: nothing may leak into Phaser or the editor.
      const key = event.key.toLowerCase();
      if (key === 'escape' || key === 'i') {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.close();
        return;
      }
      if (key === 'arrowdown' || key === 'arrowup') {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.move(key === 'arrowdown' ? 1 : -1);
        return;
      }
      if (key === 'enter' || key === ' ') {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.go(ENTRIES[this.selected]);
        return;
      }
      const n = Number.parseInt(event.key, 10);
      if (!Number.isNaN(n) && n >= 1 && n <= ENTRIES.length) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.go(ENTRIES[n - 1]);
        return;
      }
      // Swallow everything else so the game never sees it.
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    if (event.key.toLowerCase() !== 'i' || event.ctrlKey || event.metaKey || event.altKey) return;
    if (isTypingTarget(event.target)) return;
    // In the editor, plain [I] is the eyedropper — only Shift+I opens the launcher there.
    if (editorIsOpen() && !event.shiftKey) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    this.open();
  };

  private open(): void {
    if (this.isOpen) return;
    this.ensureStyle();

    const root = document.createElement('div');
    root.id = ROOT_ID;

    const scrim = document.createElement('div');
    scrim.className = 'zh-lx-scrim';
    scrim.addEventListener('pointerdown', () => this.close());
    root.appendChild(scrim);

    const panel = document.createElement('div');
    panel.className = 'zh-lx-panel';

    const title = document.createElement('h1');
    title.textContent = 'ZERO ENGINE';
    panel.appendChild(title);

    const sub = document.createElement('p');
    sub.className = 'zh-lx-sub';
    sub.textContent = 'atalhos de desenvolvimento (só no localhost)';
    panel.appendChild(sub);

    this.selected = ENTRIES.findIndex((e) => !this.isCurrent(e));
    if (this.selected < 0) this.selected = 0;

    let lastGroup = '';
    ENTRIES.forEach((entry, index) => {
      if (entry.group !== lastGroup) {
        lastGroup = entry.group;
        const g = document.createElement('div');
        g.className = 'zh-lx-group';
        g.textContent = entry.group;
        panel.appendChild(g);
      }

      const here = this.isCurrent(entry);
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `zh-lx-item${here ? ' zh-lx-here' : ''}`;
      item.dataset.index = String(index);

      const num = document.createElement('span');
      num.className = 'zh-lx-num';
      num.textContent = String(index + 1);
      const label = document.createElement('span');
      label.className = 'zh-lx-label';
      label.textContent = entry.label;
      const hint = document.createElement('span');
      hint.className = 'zh-lx-hint';
      hint.textContent = here ? 'você está aqui' : entry.hint;

      item.append(num, label, hint);
      if (!here) {
        item.addEventListener('click', () => this.go(entry));
        item.addEventListener('pointerenter', () => {
          this.selected = index;
          this.paintSelection();
        });
      }
      panel.appendChild(item);
    });

    const foot = document.createElement('div');
    foot.className = 'zh-lx-foot';
    foot.textContent = `1-${ENTRIES.length} ou ↑↓ + Enter · ESC fecha · no editor abra com Shift+I`;
    panel.appendChild(foot);

    root.appendChild(panel);
    document.body.appendChild(root);
    this.root = root;
    this.paintSelection();
    // Next frame, so the opacity transition actually runs.
    requestAnimationFrame(() => root.classList.add('zh-in'));
  }

  private move(delta: number): void {
    const count = ENTRIES.length;
    for (let i = 1; i <= count; i += 1) {
      const next = (this.selected + delta * i + count * count) % count;
      if (!this.isCurrent(ENTRIES[next])) {
        this.selected = next;
        break;
      }
    }
    this.paintSelection();
  }

  private paintSelection(): void {
    this.root?.querySelectorAll<HTMLElement>('.zh-lx-item').forEach((el) => {
      el.classList.toggle('zh-sel', Number(el.dataset.index) === this.selected);
    });
  }

  private go(entry: Entry): void {
    if (!entry || this.isCurrent(entry)) return;
    // A full load, not a history push: Phaser scene sets are decided at boot (config.ts),
    // so switching between game / editor / lab has to re-create the game instance.
    window.location.href = `${this.base}${entry.url}`;
  }

  private close(): void {
    const root = this.root;
    if (!root) return;
    this.root = undefined;
    root.classList.remove('zh-in');
    window.setTimeout(() => root.remove(), 140);
  }

  private ensureStyle(): void {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }
}

export const installDevLauncher = (): void => {
  if (!import.meta.env.DEV) return;
  new DevLauncher();
};

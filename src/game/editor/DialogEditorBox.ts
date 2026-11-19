// UMA CAIXA DE FALA no editor de falas (editor/DialogEditor), como quem escreve precisa dela: quem fala (o personagem
// ou a narração), o português e o inglês, cada verso com a MARGEM ao lado (as sílabas, e a bolinha dos versos que
// rimam: verde se rimam, laranja se não), as palavras da rima embaixo, e os avisos em português de gente. Os campos
// não quebram linha sozinhos: uma linha do campo é um verso, e a margem fica alinhada a ela.

import { checkBox, versesOf, type VerseRule } from '@/game/i18n/verseCheck';
import { bodyOf, isNarrated, withNarration, type DialogLang, type Fala } from './dialogDraft';

/** A altura de uma linha do campo (e de uma linha da margem), e o que o campo tem além das linhas (borda + respiro). */
export const LINE_PX = 26;
const PAD_PX = 20;

/** As seções que não estão no jogo: a conferência do verso não vale para elas (o versos.test também as pula). */
export const OUT_OF_GAME: ReadonlySet<string> = new Set(['fora_do_jogo']);

/** Os avisos de uma caixa, para quem escreve: a forma do verso em português e o inglês com o mesmo número de versos. */
export const boxProblems = (f: Fala, i: number, rule: VerseRule): string[] => {
  if (f.kind === 'name') return f.pt[i].trim() && f.en[i].trim() ? [] : ['O nome está vazio.'];
  if (!bodyOf(f.pt[i]).trim()) return ['Caixa vazia: escreva a fala ou tire a caixa.'];
  if (OUT_OF_GAME.has(f.section)) return [];
  const problems = checkBox(f.pt[i], rule).problems;
  const [pt, en] = [versesOf(f.pt[i]).length, versesOf(f.en[i]).length];
  if (!bodyOf(f.en[i]).trim()) return [...problems, 'Falta o inglês desta caixa.'];
  return pt === en ? problems : [...problems, `O inglês tem ${en} ${en === 1 ? 'verso' : 'versos'} e o português ${pt}: deixe o mesmo número.`];
};

export interface BoxCallbacks {
  rule: () => VerseRule;
  /** O texto mudou (o rascunho fica não salvo, os avisos se recontam). */
  changed: () => void;
  /** O escritor está nesta caixa, nesta língua: a prévia mostra ela. */
  focus: (f: Fala, i: number, lang: DialogLang) => void;
  /** Mexer na lista de caixas (subir, descer, pôr, tirar): quem chama guarda o antes, para desfazer. */
  structure: (f: Fala, label: string, op: () => void) => void;
}

export interface BoxLook {
  /** Quem fala, no seletor: o nome e o retrato (vazio sem retrato). */
  speaker: string;
  portrait: string;
  english: boolean;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};

const sizeArea = (area: HTMLTextAreaElement): void => {
  area.style.height = `${Math.max(2, area.value.split('\n').length) * LINE_PX + PAD_PX}px`;
};

/** Monta a caixa `i` da fala `f`. */
export const renderBox = (f: Fala, i: number, look: BoxLook, cb: BoxCallbacks): HTMLElement => {
  const box = el('div', 'zh-box');
  box.dataset.box = String(i);
  const top = el('div', 'zh-box-top');
  top.appendChild(el('span', 'zh-box-n', String(i + 1)));
  // QUEM FALA: o personagem ou a narração (a voz do jogo, em itálico e sem retrato).
  const who = el('div', 'zh-speaker');
  who.setAttribute('role', 'group');
  who.setAttribute('aria-label', 'Quem fala nesta caixa');
  const person = el('button', 'zh-speaker-btn');
  person.type = 'button';
  if (look.portrait) {
    const img = el('img');
    img.src = look.portrait;
    img.alt = '';
    person.appendChild(img);
  }
  person.appendChild(document.createTextNode(look.speaker || 'Personagem'));
  const narr = el('button', 'zh-speaker-btn', 'Narração');
  narr.type = 'button';
  narr.title = 'A voz do jogo: em itálico, sem retrato e sem nome';
  who.append(person, narr);
  top.appendChild(who);
  const actions = el('span', 'zh-box-actions');
  if (f.kind === 'boxes') {
    const act = (label: string, title: string, undoLabel: string, op: () => void, enabled: boolean): void => {
      const b = el('button', 'zh-btn zh-icon', label);
      b.type = 'button';
      b.title = title;
      b.disabled = !enabled;
      b.addEventListener('click', () => cb.structure(f, undoLabel, op));
      actions.appendChild(b);
    };
    act('↑', 'Subir esta caixa', 'subir a caixa', () => moveTo(f, i, -1), i > 0);
    act('↓', 'Descer esta caixa', 'descer a caixa', () => moveTo(f, i, 1), i < f.pt.length - 1);
    act('+', 'Uma caixa nova logo depois desta', 'pôr uma caixa', () => insertAfter(f, i), true);
    act('✕', 'Tirar esta caixa (das duas línguas; dá para desfazer)', 'tirar a caixa', () => removeAt(f, i), f.pt.length > 1);
  }
  top.appendChild(actions);

  const warn = el('ul', 'zh-box-warn');
  const cols = el('div', look.english ? 'zh-box-cols' : 'zh-box-cols zh-one');
  const ptCol = column(f, i, 'pt-br', cb);
  cols.appendChild(ptCol.el);
  const enCol = look.english ? column(f, i, 'en', cb) : null;
  if (enCol) cols.appendChild(enCol.el);

  const refresh = (): void => {
    const narrated = isNarrated(f.pt[i]);
    person.classList.toggle('is-on', !narrated);
    narr.classList.toggle('is-on', narrated);
    person.setAttribute('aria-pressed', String(!narrated));
    narr.setAttribute('aria-pressed', String(narrated));
    box.classList.toggle('is-narr', narrated);
    const problems = boxProblems(f, i, cb.rule());
    box.classList.toggle('has-warn', problems.length > 0);
    warn.replaceChildren(...problems.map((p) => el('li', '', p)));
    ptCol.refresh();
    enCol?.refresh();
  };
  const speak = (narrated: boolean): void => {
    for (const lang of ['pt-br', 'en'] as DialogLang[]) {
      const list = lang === 'pt-br' ? f.pt : f.en;
      list[i] = withNarration(list[i], lang, narrated);
    }
    refresh();
    cb.changed();
    cb.focus(f, i, 'pt-br');
  };
  person.addEventListener('click', () => speak(false));
  narr.addEventListener('click', () => speak(true));
  ptCol.onInput = refresh;
  if (enCol) enCol.onInput = refresh;
  box.append(top, cols, warn);
  refresh();
  return box;
};

const moveTo = (f: Fala, i: number, dir: -1 | 1): void => {
  const j = i + dir;
  [f.pt[i], f.pt[j]] = [f.pt[j], f.pt[i]];
  [f.en[i], f.en[j]] = [f.en[j], f.en[i]];
};
const insertAfter = (f: Fala, i: number): void => {
  f.pt.splice(i + 1, 0, '');
  f.en.splice(i + 1, 0, '');
};
const removeAt = (f: Fala, i: number): void => {
  f.pt.splice(i, 1);
  f.en.splice(i, 1);
};

/** Uma língua da caixa: o campo, a margem dos versos e a linha da rima. */
const column = (f: Fala, i: number, lang: DialogLang, cb: BoxCallbacks): { el: HTMLElement; refresh: () => void; onInput?: () => void } => {
  const list = lang === 'pt-br' ? f.pt : f.en;
  const col = el('label', `zh-box-col zh-${lang === 'pt-br' ? 'pt' : 'en'}`);
  col.appendChild(el('span', 'zh-box-lang', lang === 'pt-br' ? 'Português' : 'Inglês'));
  const wrap = el('div', 'zh-ta');
  const area = el('textarea');
  area.value = bodyOf(list[i]);
  area.wrap = 'off';
  area.spellcheck = true;
  area.lang = lang === 'pt-br' ? 'pt-BR' : 'en';
  area.dataset.lang = lang;
  area.placeholder = lang === 'pt-br' ? 'Um verso por linha…' : 'One line per verse…';
  sizeArea(area);
  const gutter = el('div', 'zh-gutter');
  gutter.setAttribute('aria-hidden', 'true');
  wrap.append(area, gutter);
  const rhymeEl = el('div', 'zh-rhyme');
  col.append(wrap, rhymeEl);
  const out = {
    el: col as HTMLElement,
    onInput: undefined as (() => void) | undefined,
    refresh: (): void => {
      gutter.replaceChildren();
      rhymeEl.replaceChildren();
      if (lang !== 'pt-br' || OUT_OF_GAME.has(f.section) || !area.value.trim()) return;
      const check = checkBox(list[i], cb.rule());
      const rhymeOf = new Map<number, boolean>();
      for (const r of check.rhymes) for (const row of r.rows) rhymeOf.set(row, r.ok);
      check.verses.forEach((v, row) => {
        const line = el('div', v.ok ? 'zh-g' : 'zh-g bad', v.syllables);
        line.title = `${v.syllables} sílabas`;
        if (rhymeOf.has(row)) line.appendChild(el('i', rhymeOf.get(row) ? 'rh ok' : 'rh bad', '●'));
        gutter.appendChild(line);
      });
      for (const r of check.rhymes) {
        const tag = el('span', r.ok ? 'ok' : 'bad', `${r.words[0]} · ${r.words[1]} ${r.ok ? '✓' : '✗'}`);
        rhymeEl.append(el('span', 'zh-rhyme-l', 'rima '), tag, document.createTextNode('  '));
      }
    },
  };
  area.addEventListener('input', () => {
    list[i] = withNarration(area.value, lang, isNarrated(list[i]));
    sizeArea(area);
    out.onInput?.();
    cb.changed();
    cb.focus(f, i, lang);
  });
  area.addEventListener('focus', () => cb.focus(f, i, lang));
  return out;
};

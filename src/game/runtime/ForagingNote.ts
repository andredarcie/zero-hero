// A FICHA DO COGUMELO: o papel rasgado com a foto, o nome e as notas escritas a pena, e o papel dobrando ao fechar.

import { t, tWords } from '@/game/i18n/i18n';
import { paperTexture, seedOf, tornEdge } from '@/game/runtime/uiStyle';
import type { ForagingOverlay } from './ForagingOverlay';

/** Quando a pena começa (o papel já assentou) e o ritmo dela. */
export const WRITE_START_MS = 760;
export const WRITE_MS_PER_CHAR = 26;
/** O clipe de papel: um arame dobrado, de metal fosco, por cima da beirada da foto. */
export const paperClip = (): SVGSVGElement => {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'zh-note-clip');
  svg.setAttribute('viewBox', '0 0 15 46');
  svg.setAttribute('aria-hidden', 'true');
  const wire = 'M4.5 32 V9 a4 4 0 0 1 8 0 V37 a5.5 5.5 0 0 1 -11 0 V5 a3.5 3.5 0 0 1 3.5 -3.5';
  const shadow = document.createElementNS(ns, 'path');
  shadow.setAttribute('d', wire);
  shadow.setAttribute('transform', 'translate(0.9 1.4)');
  shadow.setAttribute('fill', 'none');
  shadow.setAttribute('stroke', 'rgba(40,24,8,0.35)');
  shadow.setAttribute('stroke-width', '1.9');
  const metal = document.createElementNS(ns, 'path');
  metal.setAttribute('d', wire);
  metal.setAttribute('fill', 'none');
  metal.setAttribute('stroke', '#8e959b');
  metal.setAttribute('stroke-width', '1.6');
  metal.setAttribute('stroke-linecap', 'round');
  const shine = document.createElementNS(ns, 'path');
  shine.setAttribute('d', wire);
  shine.setAttribute('fill', 'none');
  shine.setAttribute('stroke', '#e4e8eb');
  shine.setAttribute('stroke-width', '0.5');
  shine.setAttribute('stroke-linecap', 'round');
  svg.append(shadow, metal, shine);
  return svg;
};

/** O que ForagingNote usa de ForagingOverlay. */
export type ForagingNoteHost = Pick<ForagingOverlay,
  'art' | 'cb' | 'closed' | 'destroy' | 'enter' | 'kind' | 'note' | 'root' | 'spec' | 'stage' | 'stageClock'
>;

export class ForagingNote {
  /** Quando a pena termina de escrever (ms desde que o papel abriu). */
  private writeEndMs = 0;

  public constructor(private readonly host: ForagingNoteHost) {}

  /**
   * O toque na ficha: durante a escrita ele TERMINA a escrita; escrita pronta, ele dobra o
   * papel, o embaçado volta ao foco, e só então o cogumelo vai para as costas.
   */
  public closeNote(): void {
    if (this.host.stage !== 'note') return;
    const elapsed = this.host.stageClock * 1000;
    if (elapsed < this.writeEndMs && !this.host.note.classList.contains('zh-done')) {
      if (elapsed > 300) this.host.note.classList.add('zh-done');
      return;
    }
    if (elapsed < 450) return;
    this.host.enter('closing');
    this.host.note.classList.add('zh-off');
    this.host.root.classList.remove('zh-in');
    window.setTimeout(() => {
      if (this.host.closed) return;
      this.host.destroy();
      this.host.cb.onDone();
    }, 340);
  }

  /**
   * O PAPEL: velho, amassado, com a borda rasgada à mão, escrito com pena — e a fotinha do
   * cogumelo presa por um clipe. Nada aqui é botão, moldura ou etiqueta de interface. Cada linha
   * ganha o seu tempo de pena, em sequência, proporcional ao tamanho dela.
   */
  public buildNote(): HTMLDivElement {
    const species = `fungi.species.${this.host.kind}`;
    const note = document.createElement('div');
    note.className = 'zh-note';
    const paper = document.createElement('div');
    paper.className = 'zh-note-paper';
    paper.style.clipPath = tornEdge(seedOf(this.host.kind));
    const texture = paperTexture();
    if (texture) paper.style.backgroundImage = `url(${texture})`;

    const photo = document.createElement('div');
    photo.className = 'zh-note-photo';
    const shot = document.createElement('div');
    shot.className = 'zh-note-shot';
    const img = document.createElement('img');
    img.src = this.host.art.toDataURL();
    img.alt = t(`items.name.${this.host.kind}`);
    shot.appendChild(img);
    photo.append(shot, paperClip());

    let at = WRITE_START_MS;
    const ink = (el: HTMLElement, text: string): HTMLElement => {
      const d = Math.max(280, Math.min(1100, text.length * WRITE_MS_PER_CHAR));
      el.classList.add('zh-ink');
      el.style.setProperty('--at', `${at}ms`);
      el.style.setProperty('--d', `${d}ms`);
      el.textContent = text;
      at += d + 90;
      return el;
    };
    const stroke = (cls: string, path: string, viewBox: string, d: number): SVGSVGElement => {
      const svg = this.svgStroke(cls, path, viewBox);
      svg.style.setProperty('--at', `${at}ms`);
      svg.style.setProperty('--d', `${d}ms`);
      at += d + 60;
      return svg;
    };

    const name = document.createElement('h2');
    name.className = 'zh-note-name';
    name.appendChild(ink(document.createElement('span'), t(`items.name.${this.host.kind}`)));
    const latin = document.createElement('p');
    latin.className = 'zh-note-latin';
    latin.appendChild(ink(document.createElement('span'), t(`${species}.latin`)));
    // O nome científico sublinhado à mão, como num caderno de campo.
    latin.appendChild(stroke('zh-under', 'M1 6 C 18 3, 34 8, 52 5 S 84 3, 99 6', '0 0 100 10', 380));
    const row = document.createElement('div');
    row.className = 'zh-note-edible-row';
    const edible = document.createElement('span');
    edible.className = `zh-note-edible zh-${this.host.spec.edibility}`;
    edible.appendChild(ink(document.createElement('span'), t(`fungi.edibility.${this.host.spec.edibility}`)));
    // ...e a comestibilidade CIRCULADA, numa volta só, que passa do ponto onde começou.
    edible.appendChild(stroke('zh-ring',
      'M14 30 C 4 20, 14 6, 44 4 C 76 2, 98 10, 96 24 C 94 38, 60 44, 30 40 C 10 37, 4 28, 12 16 C 16 11, 24 8, 30 7',
      '0 0 100 46', 520));
    row.appendChild(edible);
    const notes = document.createElement('ul');
    notes.className = 'zh-note-notes';
    for (const line of tWords(`${species}.notes`)) {
      const li = document.createElement('li');
      li.appendChild(ink(document.createElement('span'), `~ ${line}`));
      notes.appendChild(li);
    }
    this.writeEndMs = at;
    paper.append(photo, name, latin, row, notes);
    note.appendChild(paper);
    return note;
  }

  /** Um traço de pena em SVG (o sublinhado, o círculo), desenhado com stroke-dashoffset. */
  private svgStroke(cls: string, path: string, viewBox: string): SVGSVGElement {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', `zh-stroke ${cls}`);
    svg.setAttribute('viewBox', viewBox);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', path);
    p.setAttribute('pathLength', '1');
    svg.appendChild(p);
    return svg;
  }
}

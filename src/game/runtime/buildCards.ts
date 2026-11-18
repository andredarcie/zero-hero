import { paperTexture } from '@/game/runtime/uiStyle';

/**
 * A TÁBUA DO MODO DE CONSTRUÇÃO (runtime/BuildOverlay): o título com o material guardado na bancada, e as cartas do que
 * dá para pôr. Desenhar só: o que cada toque quer dizer vem de quem chama.
 */

export interface BuildCardView {
  kind: string;
  icon: string;
  name: string;
  /** O preço: o desenho do material, quanto pede e quanto a bancada tem. Vazio = presente. */
  needs: ReadonlyArray<{ icon: string; label: string; need: number; have: number }>;
  gift: boolean;
  state: 'ready' | 'lacking';
  next: boolean;
}

/** O título e o material guardado na bancada. */
export const renderTop = (
  top: HTMLElement,
  title: string,
  stock: ReadonlyArray<{ icon: string; label: string; count: number }>,
): void => {
  top.replaceChildren();
  const head = document.createElement('div');
  head.className = 'zh-build-title';
  head.textContent = title;
  const row = document.createElement('div');
  row.className = 'zh-build-stock';
  for (const s of stock) {
    const chip = document.createElement('span');
    chip.title = s.label;
    chip.setAttribute('aria-label', `${s.label}: ${s.count}`);
    const img = document.createElement('img');
    img.src = s.icon;
    img.alt = '';
    chip.append(img, document.createTextNode(String(s.count)));
    row.appendChild(chip);
  }
  top.append(head, row);
};

/** As cartas: o desenho, o nome, o preço (em vermelho o que falta) ou "presente". A peça posta não tem carta. */
export const renderCards = (
  box: HTMLElement,
  cards: readonly BuildCardView[],
  opts: { cursor: number; armed: string | null; giftText: string; onPick: (kind: string) => void },
): void => {
  box.replaceChildren();
  const paper = paperTexture();
  cards.forEach((card, i) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'zh-build-card';
    el.dataset.kind = card.kind;
    el.dataset.state = card.state;
    if (paper) el.style.backgroundImage = `url(${paper})`;
    if (card.next) el.dataset.next = '';
    if (i === opts.cursor) el.dataset.cursor = '';
    if (opts.armed === card.kind && i === opts.cursor) el.dataset.armed = '';
    const art = document.createElement('img');
    art.className = 'art';
    art.src = card.icon;
    art.alt = card.name;
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = card.name;
    const needs = document.createElement('div');
    needs.className = 'needs';
    if (card.needs.length === 0) needs.textContent = opts.giftText;
    for (const n of card.needs) {
      const slot = document.createElement('span');
      if (n.have < n.need) slot.className = 'lack';
      const img = document.createElement('img');
      img.src = n.icon;
      img.alt = n.label;
      slot.append(img, document.createTextNode(String(n.need)));
      needs.appendChild(slot);
    }
    el.append(art, name, needs);
    // quem lê a tela ouve a carta inteira: o nome e o preço (ou "presente")
    const price = card.needs.length === 0 ? needs.textContent ?? '' : card.needs.map((n) => `${n.need} ${n.label}`).join(', ');
    el.setAttribute('aria-label', `${card.name} — ${price}`);
    if (card.state !== 'ready') el.setAttribute('aria-disabled', 'true');
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); opts.onPick(card.kind); });
    box.appendChild(el);
  });
  box.querySelector<HTMLElement>('[data-cursor]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
};

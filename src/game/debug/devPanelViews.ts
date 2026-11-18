// O CONTEÚDO DE CADA ABA do painel de testes (debug/DevPanel): só desenhar. O que cada botão faz vem do jogo
// (scenes/game/DevTools), por esta interface; cada ação devolve a frase que o rodapé mostra.

export interface DevPanelApi {
  quests(): Array<{ dialog: string; name: string; done: boolean; progress: string }>;
  finishQuest(dialog: string): string;
  finishAllQuests(): string;
  items(): Array<{ kind: string; name: string; icon: string; tool: boolean; owned: boolean }>;
  held(): string;
  giveItem(kind: string, units: number): string;
  giveAllTools(): string;
  clearHand(): string;
  markAllSeen(): string;
  stock(): Array<{ id: string; name: string; icon: string; count: number }>;
  addStock(id: string, n: number): string;
  fillStock(): string;
  clearStock(): string;
  unlockBuilds(): string;
  mowCamp(): string;
  regrowCamp(): string;
  clearPieces(): string;
  skipDeathNights(): string;
  clock(): string;
  setTime(phase: number): string;
  nextDay(): string;
  places(): Array<{ id: string; name: string }>;
  teleport(id: string): string;
  saveNow(): string;
  resetSave(): void;
}

/** O que uma aba precisa para desenhar: o jogo, onde pôr a frase do resultado, e como se redesenhar. */
export interface DevViewCtx {
  api: DevPanelApi;
  say: (text: string) => void;
  redraw: () => void;
}

export const DEV_TABS = ['Missões', 'Itens', 'Acampamento', 'Mundo', 'Save'] as const;
export type DevTab = (typeof DEV_TABS)[number];

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

/** Um botão que faz `act`, mostra a frase dele e redesenha a aba. */
const button = (ctx: DevViewCtx, label: string, act: () => string | void, cls = 'zh-dev-btn'): HTMLButtonElement => {
  const b = el('button', cls, label);
  b.type = 'button';
  b.addEventListener('click', () => {
    const said = act();
    if (typeof said === 'string') ctx.say(said);
    ctx.redraw();
  });
  return b;
};

const section = (title: string, hint?: string): HTMLElement => {
  const s = el('section', 'zh-dev-sec');
  s.appendChild(el('h3', undefined, title));
  if (hint) s.appendChild(el('p', 'zh-dev-hint', hint));
  return s;
};

const row = (...children: HTMLElement[]): HTMLDivElement => {
  const r = el('div', 'zh-dev-row');
  r.append(...children);
  return r;
};

const quests = (ctx: DevViewCtx): HTMLElement[] => {
  const s = section('Pedidos dos vizinhos', 'Concluir um pedido faz o vizinho agradecer na próxima conversa, libera a lembrança dele na bancada e, no último, a chave do jardim.');
  for (const q of ctx.api.quests()) {
    const line = el('div', `zh-dev-quest${q.done ? ' zh-done' : ''}`);
    const text = el('div', 'zh-dev-qtext');
    text.append(el('strong', undefined, q.name), el('span', 'zh-dev-hint', q.done ? 'concluído' : q.progress));
    line.appendChild(text);
    if (!q.done) line.appendChild(button(ctx, 'Concluir', () => ctx.api.finishQuest(q.dialog)));
    else line.appendChild(el('span', 'zh-dev-check', '✓'));
    s.appendChild(line);
  }
  s.appendChild(row(button(ctx, 'Concluir todos os pedidos', () => ctx.api.finishAllQuests(), 'zh-dev-btn zh-dev-main')));
  return [s];
};

let units = 1;
const items = (ctx: DevViewCtx): HTMLElement[] => {
  const top = section('Na mão', ctx.api.held());
  const qty = el('div', 'zh-dev-seg');
  qty.setAttribute('role', 'group');
  qty.setAttribute('aria-label', 'Quantidade de material');
  qty.appendChild(el('span', 'zh-dev-hint', 'Quantidade de material:'));
  for (const n of [1, 5, 10, 20]) {
    const b = button(ctx, String(n), () => { units = n; }, `zh-dev-btn zh-dev-pill${units === n ? ' zh-on' : ''}`);
    b.setAttribute('aria-pressed', String(units === n));
    qty.appendChild(b);
  }
  top.append(qty, row(
    button(ctx, 'Todas as ferramentas', () => ctx.api.giveAllTools()),
    button(ctx, 'Esvaziar as costas', () => ctx.api.clearHand()),
    button(ctx, 'Encher o caderno', () => ctx.api.markAllSeen()),
  ));
  const grid = section('Pôr na mão', 'Material vai nas costas (o que estava nelas cai ao lado). Ferramenta fica guardada para sempre.');
  const box = el('div', 'zh-dev-items');
  for (const it of ctx.api.items()) {
    const b = button(ctx, '', () => ctx.api.giveItem(it.kind, units), `zh-dev-item${it.owned ? ' zh-on' : ''}`);
    const img = el('img');
    img.src = it.icon;
    img.alt = '';
    const label = el('span', 'zh-dev-ilabel');
    label.appendChild(el('span', undefined, it.name));
    if (it.tool) label.appendChild(el('em', undefined, 'ferramenta'));
    b.append(img, label);
    b.setAttribute('aria-label', `${it.name}${it.tool ? ' (ferramenta)' : ''}`);
    box.appendChild(b);
  }
  grid.appendChild(box);
  return [top, grid];
};

const camp = (ctx: DevViewCtx): HTMLElement[] => {
  const st = section('Material guardado na bancada', 'É o que a construção gasta. Com a bancada aberta por baixo, ela se atualiza na hora.');
  for (const m of ctx.api.stock()) {
    const line = el('div', 'zh-dev-stock');
    const img = el('img');
    img.src = m.icon;
    img.alt = '';
    line.append(img, el('strong', undefined, `${m.name}: ${m.count}`));
    for (const n of [1, 5, 10]) line.appendChild(button(ctx, `+${n}`, () => ctx.api.addStock(m.id, n), 'zh-dev-btn zh-dev-pill'));
    line.appendChild(button(ctx, '−5', () => ctx.api.addStock(m.id, -5), 'zh-dev-btn zh-dev-pill'));
    st.appendChild(line);
  }
  st.appendChild(row(
    button(ctx, 'Encher a bancada (99 de cada)', () => ctx.api.fillStock(), 'zh-dev-btn zh-dev-main'),
    button(ctx, 'Zerar', () => ctx.api.clearStock()),
  ));
  const build = section('Construção e mato');
  build.append(row(
    button(ctx, 'Liberar todas as construções', () => ctx.api.unlockBuilds()),
    button(ctx, 'Tirar as peças postas', () => ctx.api.clearPieces()),
  ), row(
    button(ctx, 'Cortar todo o mato do acampamento', () => ctx.api.mowCamp()),
    button(ctx, 'O mato cortado sem uso volta já', () => ctx.api.regrowCamp()),
  ));
  const death = section('A Morte e a foice', 'Pula as três noites: as visitas contam como ouvidas e a foice fica guardada.');
  death.appendChild(row(button(ctx, 'Pular as três noites (ganhar a foice)', () => ctx.api.skipDeathNights(), 'zh-dev-btn zh-dev-main')));
  return [st, build, death];
};

const world = (ctx: DevViewCtx): HTMLElement[] => {
  const time = section('Hora do dia', ctx.api.clock());
  const hours: Array<[string, number]> = [['Madrugada 03h', 0.125], ['Manhã 07h', 7 / 24], ['Meio-dia 12h', 0.5], ['Tarde 15h', 15 / 24], ['Hora dourada 17h', 17 / 24], ['Noite 21h', 21 / 24]];
  time.appendChild(row(...hours.map(([label, phase]) => button(ctx, label, () => ctx.api.setTime(phase)))));
  time.appendChild(row(button(ctx, 'Próximo dia (de manhã)', () => ctx.api.nextDay())));
  const go = section('Ir para', 'O herói aparece lá, parado e de frente para o que interessa.');
  go.appendChild(row(...ctx.api.places().map((p) => button(ctx, p.name, () => ctx.api.teleport(p.id)))));
  return [time, go];
};

let confirmReset = false;
const save = (ctx: DevViewCtx): HTMLElement[] => {
  const s = section('O save desta aba', 'O jogo grava sozinho; isto grava agora (com a hora do relógio).');
  s.appendChild(row(button(ctx, 'Gravar agora', () => ctx.api.saveNow())));
  const danger = section('Recomeçar do zero', 'Apaga o save deste navegador e recarrega a página.');
  danger.appendChild(row(button(ctx, confirmReset ? 'Confirmar: apagar o save' : 'Apagar o save…', () => {
    if (!confirmReset) {
      confirmReset = true;
      return 'Aperte de novo para confirmar.';
    }
    ctx.api.resetSave();
    return undefined;
  }, `zh-dev-btn${confirmReset ? ' zh-dev-danger' : ''}`)));
  return [s, danger];
};

/** As seções de uma aba. */
export const renderTab = (tab: DevTab, ctx: DevViewCtx): HTMLElement[] => {
  if (tab !== 'Save') confirmReset = false;
  switch (tab) {
    case 'Missões': return quests(ctx);
    case 'Itens': return items(ctx);
    case 'Acampamento': return camp(ctx);
    case 'Mundo': return world(ctx);
    case 'Save': return save(ctx);
  }
};

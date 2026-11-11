// AS JANELAS DO EDITOR: o mundo (nome e tamanho), as falas dos NPCs e a ajuda dos atalhos, todas na mesma moldura
// (modalShell). O que cada uma muda vai pelo EditorStore, com desfazer.

import { CHUNK_COLUMNS, CHUNK_ROWS, NPC_VISUALS } from '@/game/constants';
import type { NpcKind } from '@/game/world/ScreenContent';
import type { WorldDialog } from '@/game/world/worldSchema';
import type { EditorDomUi } from './EditorDomUi';

export const NPC_KINDS: readonly NpcKind[] = [
  'blackCat', 'mimic', 'astronaut', 'businessMan', 'radiationSuit', 'painter', 'salesman', 'poet', 'wizard', 'death',
];
export const NPC_LABELS: Record<NpcKind, string> = {
  blackCat: 'Gato Preto',
  mimic: 'Mimico',
  astronaut: 'Astronauta',
  businessMan: 'Empresario',
  radiationSuit: 'Operario',
  painter: 'Pintor',
  salesman: 'Vendedor',
  poet: 'Poeta',
  wizard: 'Mago',
  death: 'Morte',
};
const WAVE_OPTIONS: OscillatorType[] = ['sine', 'square', 'triangle', 'sawtooth'];

/** O que EditorModals usa de EditorDomUi. */
export type EditorModalsHost = Pick<EditorDomUi,
  'button' | 'cb' | 'icon' | 'modalRoot' | 'sectionLabel' | 'store' | 'toast'
>;

export class EditorModals {
  public constructor(private readonly host: EditorModalsHost) {}

  public closeModal(): void {
    this.host.modalRoot.innerHTML = '';
  }

  private modalShell(titleText: string): { body: HTMLDivElement; foot: HTMLDivElement } {
    this.closeModal();
    const backdrop = document.createElement('div');
    backdrop.className = 'zh-modal-backdrop';
    backdrop.addEventListener('mousedown', (event) => {
      if (event.target === backdrop) this.closeModal();
    });
    const modal = document.createElement('div');
    modal.className = 'zh-modal';
    const head = document.createElement('div');
    head.className = 'zh-modal-head';
    const title = document.createElement('h2');
    title.textContent = titleText;
    const close = this.host.button('&#10005;', 'Fechar (ESC)', () => this.closeModal());
    head.append(title, close);
    const body = document.createElement('div');
    body.className = 'zh-modal-body';
    const foot = document.createElement('div');
    foot.className = 'zh-modal-foot';
    modal.append(head, body, foot);
    backdrop.appendChild(modal);
    this.host.modalRoot.appendChild(backdrop);
    return { body, foot };
  }

  private field(labelText: string, input: HTMLElement): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'zh-field';
    const span = document.createElement('span');
    span.textContent = labelText;
    row.append(span, input);
    return row;
  }

  /**
   * O BARALHO: quais cartas o jogador pode comprar.
   *
   * Ele mora no topo da biblioteca de chunks e não numa tela própria porque a pergunta "que
   * cartas existem?" e a pergunta "esta carta está no jogo?" são sobre o mesmo objeto — separá-las
   * em dois lugares faria o autor editar uma carta aqui e procurar o interruptor dela ali.
   *
   * A lista é a ÚNICA escrita de `enabled` (o formulário de metadados só carrega o valor adiante),
   * e ela se recusa a esvaziar o baralho: sem carta nenhuma o portão não tem o que oferecer, e um
   * mundo que não cresce mais é indistinguível de um bug.
   */
  public openWorldModal(): void {
    const { body, foot } = this.modalShell('Mundo');
    const meta = this.host.store.world.meta;

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = meta.name;
    const dimensions = document.createElement('p');
    dimensions.textContent = 'Mundo aberto fixo: 5 x 5 chunks.';
    body.append(this.field('Nome', nameInput), dimensions);

    const stats = this.host.store.checks.stats();
    const statsEl = document.createElement('p');
    statsEl.innerHTML = `Cada chunk tem ${CHUNK_COLUMNS}x${CHUNK_ROWS} tiles.<br>`
      + `NPCs: <b>${stats.npcs}</b> — Itens: <b>${stats.pickups}</b> — Props: <b>${stats.props}</b>`;
    body.appendChild(statsEl);

    const warnings = this.host.store.checks.validate();
    if (warnings.length > 0) {
      const warnEl = document.createElement('p');
      warnEl.style.color = '#ffb057';
      warnEl.innerHTML = `&#9888; ${warnings.join('<br>&#9888; ')}`;
      body.appendChild(warnEl);
    }

    foot.append(
      this.host.button('Cancelar', '', () => this.closeModal()),
      this.host.button('Aplicar', '', () => {
        this.host.cb.onWorldApply({
          name: nameInput.value,
          chunksX: 5,
          chunksY: 5,
        });
        this.closeModal();
      }, 'primary'),
    );
  }

  public openDialogModal(initialKind: NpcKind = NPC_KINDS[0]): void {
    const { body, foot } = this.modalShell('Dialogos dos NPCs');
    let currentKind = initialKind;
    let working: WorldDialog = this.host.store.meta.getDialog(currentKind);

    const grid = document.createElement('div');
    grid.className = 'zh-dialog-grid';
    const listEl = document.createElement('div');
    listEl.className = 'zh-npc-list';
    const formEl = document.createElement('div');
    grid.append(listEl, formEl);
    body.appendChild(grid);

    const renderList = (): void => {
      listEl.innerHTML = '';
      NPC_KINDS.forEach((kind) => {
        const visual = NPC_VISUALS[kind];
        const btn = this.host.button('', NPC_LABELS[kind], () => {
          currentKind = kind;
          working = this.host.store.meta.getDialog(kind);
          renderList();
          renderForm();
        });
        btn.classList.toggle('active', kind === currentKind);
        const img = document.createElement('img');
        img.src = this.host.icon(visual.key, visual.frame);
        const span = document.createElement('span');
        span.textContent = NPC_LABELS[kind];
        btn.append(img, span);
        listEl.appendChild(btn);
      });
    };

    const renderForm = (): void => {
      formEl.innerHTML = '';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.value = working.npcName;
      nameInput.addEventListener('input', () => { working.npcName = nameInput.value; });

      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = working.npcColorHex;
      colorInput.addEventListener('input', () => { working.npcColorHex = colorInput.value; });

      const freqInput = document.createElement('input');
      freqInput.type = 'number';
      freqInput.min = '60';
      freqInput.max = '2000';
      freqInput.value = String(working.voice.freq);
      freqInput.addEventListener('input', () => { working.voice.freq = Number(freqInput.value) || working.voice.freq; });

      const waveSelect = document.createElement('select');
      WAVE_OPTIONS.forEach((wave) => {
        const option = document.createElement('option');
        option.value = wave;
        option.textContent = wave;
        option.selected = working.voice.wave === wave;
        waveSelect.appendChild(option);
      });
      waveSelect.addEventListener('change', () => { working.voice.wave = waveSelect.value as OscillatorType; });

      formEl.append(
        this.field('Nome exibido', nameInput),
        this.field('Cor do nome', colorInput),
        this.field('Voz (freq Hz)', freqInput),
        this.field('Voz (onda)', waveSelect),
        this.host.sectionLabel('Falas (npc fala, narrador descreve)'),
      );

      const linesEl = document.createElement('div');
      formEl.appendChild(linesEl);

      const renderLines = (): void => {
        linesEl.innerHTML = '';
        working.lines.forEach((line, index) => {
          const row = document.createElement('div');
          row.className = 'zh-line-row';

          const speakerSelect = document.createElement('select');
          (['npc', 'narrator'] as const).forEach((speaker) => {
            const option = document.createElement('option');
            option.value = speaker;
            option.textContent = speaker === 'npc' ? 'NPC' : 'Narrador';
            option.selected = line.speaker === speaker;
            speakerSelect.appendChild(option);
          });
          speakerSelect.addEventListener('change', () => { line.speaker = speakerSelect.value as 'npc' | 'narrator'; });

          const textInput = document.createElement('input');
          textInput.type = 'text';
          textInput.value = line.text;
          textInput.addEventListener('input', () => { line.text = textInput.value; });

          const up = this.host.button('&#8593;', 'Mover para cima', () => {
            if (index === 0) return;
            [working.lines[index - 1], working.lines[index]] = [working.lines[index], working.lines[index - 1]];
            renderLines();
          });
          const down = this.host.button('&#8595;', 'Mover para baixo', () => {
            if (index >= working.lines.length - 1) return;
            [working.lines[index + 1], working.lines[index]] = [working.lines[index], working.lines[index + 1]];
            renderLines();
          });
          const del = this.host.button('&#10005;', 'Remover fala', () => {
            working.lines.splice(index, 1);
            renderLines();
          });

          row.append(speakerSelect, textInput, up, down, del);
          linesEl.appendChild(row);
        });

        const add = this.host.button('+ Adicionar fala', '', () => {
          working.lines.push({ speaker: 'npc', text: '' });
          renderLines();
        });
        add.style.marginTop = '4px';
        linesEl.appendChild(add);
      };
      renderLines();
    };

    renderList();
    renderForm();

    foot.append(
      this.host.button('Fechar', '', () => this.closeModal()),
      this.host.button('Aplicar neste NPC', 'Grava as falas editadas no mundo (salve depois com Ctrl+S)', () => {
        working.lines = working.lines.filter((line) => line.text.trim().length > 0);
        this.host.cb.onDialogApply(currentKind, working);
        working = this.host.store.meta.getDialog(currentKind);
        this.host.toast(`Dialogo de ${NPC_LABELS[currentKind]} aplicado`);
      }, 'primary'),
    );
  }

  public openHelpModal(): void {
    const { body, foot } = this.modalShell('Ajuda — controles');
    const rows: Array<[string, string]> = [
      ['Botao esquerdo', 'Usa a ferramenta ativa'],
      ['Botao direito', 'Apaga (entidades, tile superior e colisao; na ferramenta Colisao, so colisao)'],
      ['Botao do meio / Espaco + arrastar', 'Move a camera'],
      ['Roda do mouse', 'Zoom no cursor'],
      ['B / E / R / F / I / C / A / H / S', 'Pincel, Borracha, Retangulo, Balde, Conta-gotas, Colisao, Serra, Solo, Ponto Inicial'],
      ['1..4', 'Abas: Tiles, NPCs, Itens, Props'],
      ['Tab', 'Alterna camada chao/superior'],
      ['[ e ]', 'Tamanho do pincel'],
      ['M', 'Alterna visao mundo / chunk'],
      ['Setas', 'Na visao chunk: muda o chunk selecionado'],
      ['G / V / T / O', 'Mostrar grade / colisoes / entidades / pecas do jogo'],
      ['Ctrl+Z / Ctrl+Y', 'Desfazer / refazer'],
      ['Ctrl+S', 'Salvar world.json'],
      ['P', 'Testar o mundo em edicao (ESC volta ao editor)'],
      ['0', 'Enquadrar o mundo na tela'],
    ];
    const table = document.createElement('table');
    table.className = 'zh-help-table';
    rows.forEach(([keys, description]) => {
      const tr = document.createElement('tr');
      const td1 = document.createElement('td');
      td1.textContent = keys;
      const td2 = document.createElement('td');
      td2.textContent = description;
      tr.append(td1, td2);
      table.appendChild(tr);
    });
    body.appendChild(table);
    foot.appendChild(this.host.button('Fechar', '', () => this.closeModal(), 'primary'));
  }
}

import { getSoundManager } from '@/game/audio/SoundManager';
import { isTouchDevice } from '@/game/runtime/PauseMenu';
import type { ChunkTemplate } from '@/game/world/WorldData';
import type { ChunkFrontier } from './explorerWorld';
import { drawCardArt } from './chunkCardArt';
import { cardSuit, type CardSuit } from './chunkCardSuits';
import '@/styles/chunk-cards.css';

const FAN = [
  { angle: '-3.4deg', y: '0.55rem' },
  { angle: '0deg', y: '-0.2rem' },
  { angle: '3.4deg', y: '0.55rem' },
] as const;

/** Inclinação máxima do tilt-3D que segue o cursor (a lição de Balatro: carta nunca parada). */
const TILT_X_DEG = 9;
const TILT_Y_DEG = 12;

const SIGILS: Record<CardSuit, string> = {
  tide: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 16.5A8 8 0 0 1 8 5.2 7 7 0 1 0 18 16.5Z"/></svg>',
  thorn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3-6 8h4l-5 7h14l-5-7h4l-6-8Z"/><path d="M12 18v3"/></svg>',
  web: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7"/><path d="M12 2v20M2 12h20M5 5l14 14M19 5 5 19"/></svg>',
  peak: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 19 6-12 4 7 3-5 5 10Z"/><path d="M3 21h18"/></svg>',
  grave: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 19v-8a4 4 0 0 1 8 0v8Z"/><path d="M10 13h4"/><path d="M5 21h14"/></svg>',
  bloom: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a3 3 0 0 1 3 3 3 3 0 0 1-3 3 3 3 0 0 1-3-3 3 3 0 0 1 3-3Z"/><path d="M12 10v11"/><path d="M12 17c-2.4 0-4-1.2-4-3 2.4 0 4 1.2 4 3Zm0-2c2.4 0 4-1.2 4-3-2.4 0-4 1.2-4 3Z"/></svg>',
  hearth: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c2 3.2 5 4.6 5 8a5 5 0 0 1-10 0c0-2 1-3.4 2.2-4.8C9.8 7.6 11 5.8 12 3Z"/><path d="M5 21h14"/></svg>',
  wild: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z"/></svg>',
};

export class ChunkGatePrompt {
  private readonly root: HTMLDivElement;

  public constructor() {
    this.root = document.createElement('div');
    this.root.className = 'zh-gate-prompt';
    this.root.style.display = 'none';
    document.body.appendChild(this.root);
  }

  public show(cost: number, coins: number): void {
    // BARALHO VAZIO — nenhuma carta sobrou (todas compradas, ou o editor deixou poucas ligadas).
    // `minCost` é um `Math.min` de lista vazia, ou seja Infinity, e o selo anunciava "NEEDS
    // Infinity COINS": a estrada parecia cara em vez de acabada, e apertar o botão não fazia
    // nada. Deck que se escolhe no editor torna isto um estado NORMAL, não um caso de borda.
    if (!Number.isFinite(cost)) {
      this.root.classList.add('is-locked');
      this.root.innerHTML = 'ROAD\'S END<br>NO LAND LEFT TO CLAIM';
      this.root.style.display = 'block';
      return;
    }
    const enabled = coins >= cost;
    this.root.classList.toggle('is-locked', !enabled);
    // No dedo o botão se chama B (o círculo esquerdo do ActionButtons) — dizer "[X / K]" a
    // quem não tem teclado é pedir uma tecla que não existe no aparelho.
    const button = isTouchDevice() ? '[B]' : '[X / K]';
    this.root.innerHTML = enabled
      ? `${button} BUILD<br>${coins} COINS`
      : `DORMANT ROAD<br>NEEDS ${cost} COINS`;
    this.root.style.display = 'block';
  }

  public hide(): void { this.root.style.display = 'none'; }
  public destroy(): void { this.root.remove(); }
}

export class ChunkPurchaseOverlay {
  private readonly root: HTMLDivElement;
  private selected = 0;
  private closed = false;
  private choosing = false;
  private readonly buttons: HTMLButtonElement[] = [];
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  public constructor(
    _frontier: ChunkFrontier,
    options: readonly ChunkTemplate[],
    coins: number,
    private readonly onChoose: (choice: ChunkTemplate) => void,
    private readonly onClose: () => void,
    /**
     * Onde, NA TELA, fica a boca da estrada comprada (projeção do mundo 3D). Com ela a compra
     * vira cinema: a carta centraliza, vira luz, VOA até lá — e o pouso é o que dispara a
     * compra de verdade, então é literalmente a carta que apaga a névoa.
     */
    private readonly flightTarget?: () => { x: number; y: number } | null,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'zh-build-backdrop';
    const panel = document.createElement('section');
    panel.className = 'zh-build-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', 'Choose the next chunk');
    const heading = document.createElement('h2');
    heading.className = 'zh-build-title';
    heading.textContent = 'WHAT WILL EXIST HERE?';
    const headingFrame = document.createElement('div');
    headingFrame.className = 'zh-build-heading';
    headingFrame.appendChild(heading);
    const cards = document.createElement('div');
    cards.className = 'zh-build-cards';

    options.forEach((option, index) => {
      const card = document.createElement('button');
      card.className = 'zh-build-card';
      card.type = 'button';
      const locked = option.catalog.cost > coins;
      // Um template COM NPC é uma carta de vínculo (hearth): outro naipe, outra cor de moldura.
      const isNpcCard = option.npcs.length > 0;
      const suit: CardSuit = isNpcCard ? 'hearth' : cardSuit(option.catalog.id);
      const sigil = SIGILS[suit];
      const fan = FAN[index] ?? FAN[1];
      card.disabled = locked;
      card.dataset.state = locked ? 'disabled' : 'default';
      card.dataset.imageState = 'loading';
      card.dataset.suit = suit;
      card.dataset.npc = isNpcCard ? 'true' : 'false';
      card.style.setProperty('--zh-card-angle', fan.angle);
      card.style.setProperty('--zh-card-fan-y', fan.y);
      // A pilha: cada carta nasce no baralho central, levemente torta como um maço de verdade.
      card.style.setProperty('--zh-card-stack', `${((index - 1) * 4).toFixed(0)}deg`);
      // A varredura de foil defasada por carta: as três nunca brilham em uníssono.
      card.style.setProperty('--zh-card-sheen-delay', `${(index * -2.1).toFixed(1)}s`);
      card.setAttribute('aria-label', `${option.catalog.name}. ${option.catalog.cost} coins.${locked ? ` Locked; you have ${coins} coins.` : ' Available to build.'}`);
      // A carta minimalista: sigilo nos dois cantos (sem número), a arte, o TÍTULO e a moeda.
      // Nada de subtítulo, descrição, rótulo de arte ou dica de tecla — o leque fala sozinho.
      card.innerHTML = `
        <span class="zh-build-back" aria-hidden="true">
          <span class="zh-build-back-sigil">${sigil}</span>
        </span>
        <span class="zh-build-face">
          <span class="zh-build-corner zh-build-corner--top" aria-hidden="true">
            <span class="zh-build-sigil">${sigil}</span>
          </span>
          <span class="zh-build-corner zh-build-corner--bottom" aria-hidden="true">
            <span class="zh-build-sigil">${sigil}</span>
          </span>
          <span class="zh-build-art-frame" aria-busy="true">
            <canvas class="zh-build-art" role="img" aria-label="${this.escape(option.catalog.name)}"></canvas>
            <span class="zh-build-art-state zh-build-state-loading"><span>READING THE MAP…</span></span>
            <span class="zh-build-art-state zh-build-state-error"><span>ART LOST<br>IN THE FOG</span></span>
            <span class="zh-build-art-state zh-build-state-success" role="status">
              <span class="zh-build-sigil">${sigil}</span><span>LAND CLAIMED</span>
            </span>
          </span>
          <span class="zh-build-copy">
            <span class="zh-build-name">${this.escape(option.catalog.name)}</span>
            <span class="zh-build-price">
              <span class="zh-build-coin">${option.catalog.cost}</span>
            </span>
          </span>
          <span class="zh-build-lock" aria-hidden="true">LOCKED · NEED ${option.catalog.cost}</span>
        </span>`;
      // A arte é desenhada AQUI (pixel art P&B simbólica, chunkCardArt) — síncrona, então a
      // carta nunca espera rede. Os estados loading/error ficam no CSS: o editor ainda pode
      // apontar uma imagem própria um dia, e o esqueleto de estados já está pago.
      const art = card.querySelector<HTMLCanvasElement>('.zh-build-art');
      // A carta de NPC desenha o EMBLEMA do morador (o gato, o capacete, a foice…): oito
      // cartas com a mesma capa de fogueira não se distinguem na mão.
      if (art) drawCardArt(art, suit, isNpcCard ? option.npcs[0]?.type : undefined);
      card.dataset.imageState = 'ready';
      card.querySelector('.zh-build-art-frame')?.setAttribute('aria-busy', 'false');
      card.addEventListener('focus', () => {
        this.selected = index;
        this.buttons.forEach((entry) => entry.classList.toggle('is-selected', entry === card));
        card.scrollIntoView({ block: 'nearest', inline: 'center' });
      });
      card.addEventListener('click', () => this.choose(index));
      if (!this.reducedMotion) this.installTilt(card);
      cards.appendChild(card);
      this.buttons.push(card);
      window.setTimeout(() => card.classList.add('is-dealt'), 140 + index * 150);
    });

    // O baralho: cada carta mede a própria distância até o centro do leque e nasce LÁ,
    // virada para baixo — o keyframe da distribuição viaja dessa pilha até o lugar dela.
    window.requestAnimationFrame(() => {
      const bounds = cards.getBoundingClientRect();
      for (const card of this.buttons) {
        const rect = card.getBoundingClientRect();
        const dx = bounds.left + bounds.width / 2 - (rect.left + rect.width / 2);
        const dy = bounds.top + bounds.height / 2 - (rect.top + rect.height / 2);
        card.style.setProperty('--zh-card-deck-x', `${dx.toFixed(1)}px`);
        card.style.setProperty('--zh-card-deck-y', `${dy.toFixed(1)}px`);
      }
    });

    const foot = document.createElement('div');
    foot.className = 'zh-build-foot';
    foot.textContent = 'Arrow keys choose · Enter builds · Esc returns';
    panel.append(headingFrame, cards, foot);
    this.root.appendChild(panel);
    document.body.appendChild(this.root);
    window.addEventListener('keydown', this.handleKey, true);
    this.selectFirstAffordable();
  }

  /**
   * O tilt-3D que segue o cursor + o brilho de foil que acompanha (a dupla que faz uma carta
   * ler como objeto físico, não como botão). Só transforma via custom props: o CSS decide o
   * resto, e `prefers-reduced-motion` nem instala isto.
   */
  private installTilt(card: HTMLButtonElement): void {
    card.addEventListener('mousemove', (event: MouseEvent) => {
      if (card.disabled || card.dataset.state === 'success') return;
      const rect = card.getBoundingClientRect();
      const px = (event.clientX - rect.left) / Math.max(1, rect.width) - 0.5;
      const py = (event.clientY - rect.top) / Math.max(1, rect.height) - 0.5;
      card.style.setProperty('--zh-card-tilt-x', `${(-py * TILT_X_DEG).toFixed(2)}deg`);
      card.style.setProperty('--zh-card-tilt-y', `${(px * TILT_Y_DEG).toFixed(2)}deg`);
      card.style.setProperty('--zh-card-shine-x', `${(px * 100 + 50).toFixed(1)}%`);
      card.style.setProperty('--zh-card-shine-y', `${(py * 100 + 50).toFixed(1)}%`);
    });
    card.addEventListener('mouseleave', () => {
      card.style.setProperty('--zh-card-tilt-x', '0deg');
      card.style.setProperty('--zh-card-tilt-y', '0deg');
    });
  }

  private escape(value: string): string {
    const span = document.createElement('span');
    span.textContent = value;
    return span.innerHTML;
  }

  private selectFirstAffordable(): void {
    const index = this.buttons.findIndex((button) => !button.disabled);
    this.selected = Math.max(0, index);
    window.setTimeout(() => this.buttons[this.selected]?.focus(), 560);
  }

  private readonly handleKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') { event.preventDefault(); this.close(); return; }
    if (/^[1-3]$/u.test(event.key)) {
      event.preventDefault();
      this.choose(Number(event.key) - 1);
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const step = event.key === 'ArrowRight' ? 1 : -1;
      for (let n = 1; n <= this.buttons.length; n += 1) {
        const i = (this.selected + step * n + this.buttons.length) % this.buttons.length;
        if (!this.buttons[i].disabled) { this.selected = i; this.buttons[i].focus(); break; }
      }
      return;
    }
    if (event.key === 'Enter') { event.preventDefault(); this.choose(this.selected); }
  };

  /**
   * A compra em quatro tempos (princípio do pack-opening: dar tempo de APRECIAR a escolha):
   * o carimbo na carta e as recusadas caindo → a carta puxa ao CENTRO da tela e segura um
   * instante → o pano de fundo se dissolve, a carta vira LUZ e voa até a boca da estrada →
   * o pouso estoura em ouro e SÓ ENTÃO dispara a compra — a névoa começa a morrer exatamente
   * onde a luz tocou. Com `prefers-reduced-motion` (ou sem projeção), vale o corte seco.
   */
  private choose(index: number): void {
    const button = this.buttons[index];
    if (this.closed || this.choosing || !button || button.disabled) return;
    this.choosing = true;
    window.removeEventListener('keydown', this.handleKey, true);
    // O som de COMPRAR a carta: a moeda paga + a tigela que consagra. Os dois já existem no
    // catálogo gerado — nada novo entra no pipeline de áudio por causa disto.
    getSoundManager().playCoinPickup();
    getSoundManager().playSingingBowl();
    const bounds = button.getBoundingClientRect();
    button.style.setProperty('--zh-card-claim-x', `${(window.innerWidth / 2 - (bounds.left + bounds.width / 2)).toFixed(1)}px`);
    button.style.setProperty('--zh-card-claim-y', `${(window.innerHeight / 2 - (bounds.top + bounds.height / 2)).toFixed(1)}px`);
    this.root.querySelector('.zh-build-panel')?.classList.add('is-resolving');
    const options = [...this.root.querySelectorAll<HTMLButtonElement>('.zh-build-card')];
    options.forEach((card, i) => {
      if (i === index) {
        card.dataset.state = 'success';
        card.setAttribute('aria-label', `${card.getAttribute('aria-label') ?? ''} Selected.`);
      } else {
        card.classList.add('is-dismissed');
      }
    });
    const dispatch = (): void => {
      if (this.closed) return;
      this.closed = true;
      const choiceIndex = this.buttons.indexOf(button);
      const event = new CustomEvent<number>('zh-choice', { detail: choiceIndex });
      this.root.dispatchEvent(event);
    };

    const target = this.reducedMotion ? null : this.flightTarget?.() ?? null;
    if (!target) {
      window.setTimeout(dispatch, 700);
      return;
    }
    const CENTER_MS = 430;
    const HOLD_MS = 430;
    const FLY_MS = 640;
    window.setTimeout(() => {
      if (this.closed) return;
      this.root.classList.add('is-departing');
      const ghost = this.spawnGhost(button);
      button.style.visibility = 'hidden';
      const rect = ghost.getBoundingClientRect();
      ghost.style.setProperty('--zh-card-fly-x', `${(target.x - (rect.left + rect.width / 2)).toFixed(1)}px`);
      ghost.style.setProperty('--zh-card-fly-y', `${(target.y - (rect.top + rect.height / 2)).toFixed(1)}px`);
      window.requestAnimationFrame(() => ghost.classList.add('is-flying'));
      window.setTimeout(() => {
        this.spawnBurst(target);
        ghost.style.opacity = '0';
        window.setTimeout(() => ghost.remove(), 260);
        dispatch();
      }, FLY_MS);
    }, CENTER_MS + HOLD_MS);
  }

  /**
   * O clone que voa. A carta original mora dentro do painel (que rola e recorta); o fantasma
   * nasce em `position:fixed` no body, com a MESMA cara, e é ele que atravessa a tela. A
   * classe é só `zh-build-flight`: sem `zh-build-card`, nenhum estado do leque (deck, leque,
   * sucesso) disputa o transform do voo.
   */
  private spawnGhost(button: HTMLButtonElement): HTMLButtonElement {
    const rect = button.getBoundingClientRect();
    const ghost = button.cloneNode(true) as HTMLButtonElement;
    ghost.className = 'zh-build-flight';
    ghost.removeAttribute('style');
    ghost.disabled = true;
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.left = `${rect.left.toFixed(1)}px`;
    ghost.style.top = `${rect.top.toFixed(1)}px`;
    ghost.style.width = `${rect.width.toFixed(1)}px`;
    ghost.style.height = `${rect.height.toFixed(1)}px`;
    // cloneNode não copia o CONTEÚDO de um canvas: a arte é redesenhada por cópia de pixels.
    const src = button.querySelector<HTMLCanvasElement>('.zh-build-art');
    const dst = ghost.querySelector<HTMLCanvasElement>('.zh-build-art');
    if (src && dst) {
      dst.width = src.width;
      dst.height = src.height;
      dst.getContext('2d')?.drawImage(src, 0, 0);
    }
    document.body.appendChild(ghost);
    return ghost;
  }

  /**
   * O estouro de ouro no pouso: um clarão e um anel que se abrem e morrem. Fantasma e estouro
   * se AUTO-limpam por timer próprio: o pouso dispara a compra, a compra destrói o overlay no
   * mesmo tick — um cleanup preso ao destroy() mataria o estouro no nascimento.
   */
  private spawnBurst(target: { x: number; y: number }): void {
    const burst = document.createElement('div');
    burst.className = 'zh-build-burst';
    burst.style.left = `${target.x.toFixed(1)}px`;
    burst.style.top = `${target.y.toFixed(1)}px`;
    document.body.appendChild(burst);
    window.setTimeout(() => burst.remove(), 900);
  }

  public bindChoices(options: readonly ChunkTemplate[]): void {
    this.root.addEventListener('zh-choice', ((event: CustomEvent<number>) => {
      const choice = options[event.detail];
      if (choice) this.onChoose(choice);
    }) as EventListener, { once: true });
  }

  public close(): void {
    if (this.closed) return;
    this.closed = true;
    window.removeEventListener('keydown', this.handleKey, true);
    this.root.remove();
    this.onClose();
  }

  public destroy(): void {
    window.removeEventListener('keydown', this.handleKey, true);
    this.root.remove();
    this.closed = true;
  }
}

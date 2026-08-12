import { t } from '@/game/i18n/i18n';
import type { ExplorerArrival } from './explorerRun';

/**
 * O UNICO HUD do jogo — e a excecao precisa de defesa, porque a lei do projeto e "o mundo
 * ensina, o HUD nao".
 *
 * Essa lei foi escrita contra LEGENDAS: o balao que dizia qual item falta numa fechadura foi
 * arrancado justamente porque entregava ao jogador uma resposta que o mundo tinha o dever de
 * ensinar. Aqui a pergunta e outra. O modo explorador pede uma decisao — "vale a pena mais um
 * chunk?" — cujos dois termos sao numeros: quanto voce carrega, e quao longe voce esta. O
 * mundo nao tem como dizer "142 moedas". Esconder isso nao ensinaria nada; so tornaria a
 * aposta um chute, e uma aposta as cegas nao e uma decisao.
 *
 * Entao ele mostra exatamente os dois numeros da aposta, e nada mais: nem vida (as bordas
 * vermelhas ja fazem isso), nem inimigos, nem bussola. E DOM, como todo overlay do projeto,
 * para o texto serifado sair nitido na resolucao do dispositivo em vez de na do canvas.
 */

const STYLE_ID = 'zh-explorer-style';
const ROOT_ID = 'zh-explorer-hud';
const MAP_ID = 'zh-chunk-map';
const SERIF = "Georgia, 'Times New Roman', 'Book Antiqua', serif";

const CSS = `
#${ROOT_ID} {
  position: fixed;
  top: calc(12px + env(safe-area-inset-top, 0px));
  left: calc(12px + env(safe-area-inset-left, 0px));
  z-index: 44; pointer-events: none;
  font-family: ${SERIF};
  display: flex; flex-direction: column; gap: 4px;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
}
#${ROOT_ID} .zh-ex-coins {
  display: flex; align-items: baseline; gap: 0.4em;
  font-size: clamp(15px, 2.9vh, 22px); color: #f0d489; letter-spacing: 0.04em;
}
#${ROOT_ID} .zh-ex-coins b { font-weight: 700; }
#${ROOT_ID} .zh-ex-mult {
  font-size: 0.62em; color: #e5b558; opacity: 0.9;
  border: 1px solid rgba(229, 181, 88, 0.45); border-radius: 3px; padding: 0 0.35em;
}
#${ROOT_ID} .zh-ex-depth {
  font-size: clamp(10px, 1.7vh, 13px); color: #9fb0c4; letter-spacing: 0.06em;
}
/* Longe de casa o numero da distancia ESQUENTA: a mesma informacao, dita pela cor, para o
   jogador sentir a profundidade sem precisar ler o valor. */
#${ROOT_ID} .zh-ex-depth.zh-deep { color: #d59a6a; }
#${ROOT_ID} .zh-ex-depth.zh-abyss { color: #d2695c; }
#${ROOT_ID} .zh-ex-pulse { animation: zh-ex-pop 420ms ease-out; }
@keyframes zh-ex-pop {
  0% { transform: scale(1); } 35% { transform: scale(1.16); } 100% { transform: scale(1); }
}
#zh-explorer-toast {
  position: fixed; left: 50%; top: 18%; transform: translateX(-50%);
  z-index: 46; pointer-events: none; font-family: ${SERIF};
  background: rgba(10, 8, 6, 0.86); border: 1px solid #3d342a;
  padding: 0.9em 1.4em; text-align: center; color: #d8d1c0;
  max-width: min(26em, calc(100vw - 3em));
  opacity: 0; transition: opacity 420ms ease;
}
#zh-explorer-toast.zh-in { opacity: 1; }
#zh-explorer-toast .zh-ex-head {
  font-size: clamp(14px, 2.6vh, 19px); color: #e7dcc4; margin-bottom: 0.35em;
}
#zh-explorer-toast .zh-ex-sub { font-size: clamp(11px, 1.9vh, 14px); color: #a49c8b; }
#zh-explorer-toast.zh-loss .zh-ex-head { color: #d2695c; }
#zh-explorer-toast.zh-gain .zh-ex-head { color: #f0d489; }

/* O MAPA DO QUE FOI CONSTRUIDO — um quadradinho por chunk comprado, no canto de baixo.
   Cinza e translucido de proposito: ele nao e informacao de decisao (a bolsa e a distancia sao),
   e um mapa opaco puxaria o olho para fora do mundo. Ele e o RETRATO do labirinto que o jogador
   desenhou sem querer, e so quem procurar por ele vai olha-lo. */
#${MAP_ID} {
  position: fixed;
  right: calc(12px + env(safe-area-inset-right, 0px));
  bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  z-index: 44; pointer-events: none;
  display: grid; gap: 2px;
  opacity: 0.55;
}
#${MAP_ID} i {
  display: block; width: 7px; height: 7px;
  background: rgba(196, 202, 214, 0.22);
  border-radius: 1px;
}
/* ONDE O HEROI ESTA. Roxo, e a unica cor do mapa: uma cor so num campo cinza e um PONTO, e um
   ponto e a unica coisa que este desenho precisa dizer alem da forma. */
#${MAP_ID} i.zh-here {
  background: rgba(158, 110, 224, 0.72);
  box-shadow: 0 0 4px rgba(158, 110, 224, 0.5);
}
`;

const ensureStyle = (): void => {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
};

export class ExplorerHud {
  private readonly root: HTMLDivElement;
  private readonly coinValue: HTMLElement;
  private readonly depth: HTMLElement;
  /** O mapa dos chunks comprados — raiz própria porque ele mora no canto oposto da tela. */
  private readonly map: HTMLDivElement;
  /** Um quadradinho por chunk, indexado por `cx,cy`. Nasce quando o chunk é comprado. */
  private readonly cells = new Map<string, HTMLElement>();
  /** A assinatura do conjunto construído: só quando ela muda o mapa é redesenhado. */
  private mapSig = '';
  /** Onde o roxo está agora. Trocar de casa é mexer em DOIS elementos, nunca no mapa inteiro. */
  private hereKey = '';
  private toast?: HTMLDivElement;
  private toastTimer?: number;
  private lastCoins = -1;
  private destroyed = false;

  public constructor() {
    ensureStyle();
    this.root = document.createElement('div');
    this.root.id = ROOT_ID;
    this.map = document.createElement('div');
    this.map.id = MAP_ID;
    document.body.appendChild(this.map);

    const coins = document.createElement('div');
    coins.className = 'zh-ex-coins';
    this.coinValue = document.createElement('b');
    this.coinValue.textContent = '0';
    const coinLabel = document.createElement('span');
    coinLabel.textContent = 'coins';
    coins.append(this.coinValue, coinLabel);

    this.depth = document.createElement('div');
    this.depth.className = 'zh-ex-depth';

    this.root.append(coins, this.depth);
    document.body.appendChild(this.root);
  }

  public update(coins: number, builtChunks: number): void {
    if (this.destroyed) return;
    if (coins !== this.lastCoins) {
      this.coinValue.textContent = String(coins);
      // O numero PULA quando cresce. Sem isso, uma moeda que entra longe de casa (valendo 5) e
      // uma que entra ao lado da fogueira (valendo 1) sao a mesma imagem, e o multiplicador —
      // que e o motivo de estar la fora — nunca e sentido.
      if (coins > this.lastCoins && this.lastCoins >= 0) {
        this.coinValue.classList.remove('zh-ex-pulse');
        void this.coinValue.offsetWidth; // reinicia a animacao
        this.coinValue.classList.add('zh-ex-pulse');
      }
      this.lastCoins = coins;
    }
    this.depth.textContent = `${builtChunks} chunk${builtChunks === 1 ? '' : 's'} built`;
    this.depth.classList.remove('zh-deep', 'zh-abyss');
  }

  /**
   * O MAPA DO MUNDO QUE ELE ESTÁ DESENHANDO.
   *
   * Um quadradinho por chunk comprado, na posição relativa de cada um — visto de longe, o
   * labirinto que o jogador escolheu construir. Ele não é bússola nem informação de decisão: é o
   * RETRATO de uma escolha acumulada, e por isso é cinza, translúcido e fica no canto de baixo.
   *
   * O DOM só é refeito quando o conjunto muda (uma compra: acontece uma vez a cada minutos), e a
   * casa do herói é uma troca de classe em dois elementos. Sem essas duas guardas isto seria
   * reconstruir algumas dezenas de nós 60 vezes por segundo para desenhar o mesmo quadro.
   *
   * O layout é uma GRADE CSS com as coordenadas normalizadas (o canto superior-esquerdo do
   * conjunto vira 1,1): o mundo cresce para qualquer lado, inclusive para negativo, e uma grade
   * com origem no menor `cx/cy` é o que faz um chunk comprado a oeste empurrar o desenho em vez
   * de sair da tela.
   */
  public updateMap(
    built: ReadonlyArray<{ cx: number; cy: number }>,
    hereCx: number,
    hereCy: number,
  ): void {
    if (this.destroyed) return;
    const sig = built.map((c) => `${c.cx},${c.cy}`).sort().join(';');
    if (sig !== this.mapSig) {
      this.mapSig = sig;
      this.rebuildMap(built);
      this.hereKey = ''; // as casas são outras: o roxo é reaplicado abaixo
    }
    const key = `${hereCx},${hereCy}`;
    if (key === this.hereKey) return;
    this.cells.get(this.hereKey)?.classList.remove('zh-here');
    // O herói SEMPRE está num chunk comprado (o mundo não comprado é névoa sólida), mas a
    // ausência é tratada mesmo assim: durante a travessia de um portão ele pisa antes de a compra
    // registrar, e um `?.` a mais é mais barato que um quadrado roxo perdido.
    this.cells.get(key)?.classList.add('zh-here');
    this.hereKey = key;
  }

  private rebuildMap(built: ReadonlyArray<{ cx: number; cy: number }>): void {
    this.map.replaceChildren();
    this.cells.clear();
    if (built.length === 0) return;
    const minX = Math.min(...built.map((c) => c.cx));
    const minY = Math.min(...built.map((c) => c.cy));
    const cols = Math.max(...built.map((c) => c.cx)) - minX + 1;
    this.map.style.gridTemplateColumns = `repeat(${cols}, 7px)`;
    for (const chunk of built) {
      const cell = document.createElement('i');
      cell.style.gridColumn = String(chunk.cx - minX + 1);
      cell.style.gridRow = String(chunk.cy - minY + 1);
      this.map.appendChild(cell);
      this.cells.set(`${chunk.cx},${chunk.cy}`, cell);
    }
  }

  public setVisible(visible: boolean): void {
    this.root.style.display = visible ? 'flex' : 'none';
    this.map.style.display = visible ? 'grid' : 'none';
  }

  /**
   * Onde está o NÚMERO de moedas, em coordenadas de página — o alvo do voo da moeda apanhada.
   * A moeda voando até o contador (e o pulso que já existe quando ele cresce) é o feedback de
   * que pegar moeda é sempre bom. Null quando o HUD não está na tela: o voo cai no herói.
   */
  public coinAnchorRect(): DOMRect | null {
    if (this.destroyed || this.root.style.display === 'none') return null;
    return this.coinValue.getBoundingClientRect();
  }

  /**
   * O recibo da expedicao anterior, mostrado ao chegar no acampamento. E o unico lugar onde o
   * modo diz em palavras o que as duas porcentagens fizeram — e ele so aparece uma vez, porque
   * o numero que importa dali em diante e o do banco, na loja da fogueira.
   */
  public showArrival(arrival: ExplorerArrival): void {
    if (arrival.kind === 'start' || this.destroyed) return;
    this.toast?.remove();
    if (this.toastTimer) window.clearTimeout(this.toastTimer);

    const toast = document.createElement('div');
    toast.id = 'zh-explorer-toast';
    toast.classList.add(arrival.kind === 'extract' ? 'zh-gain' : 'zh-loss');
    const head = document.createElement('div');
    head.className = 'zh-ex-head';
    head.textContent = arrival.kind === 'extract'
      ? t('explorer.arrival.extract')
      : t('explorer.arrival.death');
    const sub = document.createElement('div');
    sub.className = 'zh-ex-sub';
    sub.textContent = t('explorer.arrival.kept')
      .replace('{kept}', String(arrival.kept))
      .replace('{lost}', String(arrival.lost))
      .replace('{depth}', String(arrival.depth));
    toast.append(head, sub);
    document.body.appendChild(toast);
    this.toast = toast;
    requestAnimationFrame(() => toast.classList.add('zh-in'));
    this.toastTimer = window.setTimeout(() => {
      toast.classList.remove('zh-in');
      window.setTimeout(() => toast.remove(), 500);
    }, 5200);
  }

  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toast?.remove();
    this.root.remove();
    this.map.remove();
    this.cells.clear();
  }
}

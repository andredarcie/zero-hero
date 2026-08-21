/**
 * A CORTINA DA ESCADA — o preto que cobre a troca de andar, e a única coisa da travessia que
 * sobrevive ao `scene.restart()`.
 *
 * Ela existe pelo mesmo motivo que o `PortalTunnel` existe, e a comparação é o argumento inteiro:
 * o portal de level abre o túnel ANTES do restart de propósito, porque o mundo (World3D) e a cena
 * do Phaser são DESTRUÍDOS no meio da transição — o canvas 3D é literalmente removido do DOM
 * (`World3D.dispose`) e um novo nasce do outro lado. Nada que viva dentro da cena pode desenhar
 * durante essa janela.
 *
 * A escada não tinha cobertura nenhuma, e o que o jogador via era:
 *
 *     mundo velho a 10%  →  engasgo (canvas removido, fundo da página)  →  ANDAR NOVO A 100%
 *     por uns 120ms  →  estalo para 10%  →  fade de 620ms
 *
 * O clarão do meio é o oposto de descer para o escuro. Duas coisas o causavam: o fade de mundo
 * parava em 0,9 (sobrava 10% de imagem) e ele é um uniform do World3D, que nasce zerado na cena
 * seguinte — o andar novo aparecia inteiro antes de alguém ter chance de apagá-lo.
 *
 * Por que um DIV e não um segundo contexto WebGL como o túnel: aqui não há nada a desenhar. É
 * preto. Um `div` fixo custa zero de GPU, não compila shader nenhum e cobre TUDO — o canvas 3D
 * (z-index 0), o canvas do Phaser com a HUD em cima dele (z-index 1) e qualquer overlay de DOM.
 * O túnel fica no 3; a cortina fica no 4, acima dele, porque quando os dois existirem (nunca
 * hoje, mas o custo de decidir agora é zero) quem cobre é o último a subir.
 *
 * `pointer-events: none` porque a cortina não é um modal: quem congela o jogo é o `cutsceneActive`
 * da cena, e uma cortina que comesse clique deixaria o jogo preso se alguém esquecesse de baixá-la.
 */

const Z_INDEX = 4;
/** A folga entre o fim da transição e a hora de confiar que a tela está preta — ver `close`. */
const CURTAIN_SETTLE_MS = 60;

let curtain: HTMLDivElement | null = null;
let timer: number | undefined;

const ensure = (): HTMLDivElement => {
  if (curtain) return curtain;
  const el = document.createElement('div');
  el.dataset.zh = 'stairs-curtain';
  el.style.cssText = [
    'position:fixed',
    'inset:0',
    'background:#000',
    'opacity:0',
    `z-index:${Z_INDEX}`,
    'pointer-events:none',
  ].join(';');
  document.body.appendChild(el);
  curtain = el;
  return el;
};

/** Cancela a transição em curso sem mexer na opacidade — quem chama decide o novo destino. */
const stopTimer = (): void => {
  if (timer !== undefined) {
    window.clearTimeout(timer);
    timer = undefined;
  }
};

/**
 * Fecha a cortina em `ms` e resolve quando ela estiver PRETA de verdade.
 *
 * Quem espera este promise é a descida: o `scene.restart()` só pode acontecer depois, senão a
 * reconstrução do mundo aparece na tela. Com `ms = 0` ela fecha no mesmo frame — é o que a
 * chegada usa para nascer preta antes do primeiro render da cena nova.
 */
export const closeStairsCurtain = (ms: number): Promise<void> => {
  const el = ensure();
  stopTimer();
  if (ms <= 0) {
    el.style.transition = 'none';
    el.style.opacity = '1';
    // Uma leitura forçada: sem ela o browser pode juntar o `none` e o `1` com a transição
    // anterior e animar assim mesmo — e a cortina "instantânea" abriria fade nenhum.
    void el.offsetHeight;
    return Promise.resolve();
  }
  el.style.transition = `opacity ${ms}ms linear`;
  // Idem: o valor inicial precisa estar no estilo computado antes de trocar o destino, ou a
  // transição não tem de onde sair.
  void el.offsetHeight;
  el.style.opacity = '1';
  return new Promise<void>((resolve) => {
    // A CAUDA. O relógio do `setTimeout` e o da transição de CSS não são o mesmo: um frame perdido
    // no fim deixaria a cortina em 0,99 no instante em que a cena é destruída. Sessenta
    // milissegundos a mais de preto ninguém vê; um frame de mundo no meio da viagem, sim.
    timer = window.setTimeout(() => { timer = undefined; resolve(); }, ms + CURTAIN_SETTLE_MS);
  });
};

/**
 * Abre a cortina em `ms` e a REMOVE do DOM no fim.
 *
 * Remover importa: ela é `position: fixed` sobre a tela inteira, e um nó esquecido ali com
 * `opacity: 0` é uma armadilha para o próximo overlay que alguém empilhar.
 */
export const openStairsCurtain = (ms: number): void => {
  if (!curtain) return;
  const el = curtain;
  stopTimer();
  el.style.transition = `opacity ${ms}ms linear`;
  void el.offsetHeight;
  el.style.opacity = '0';
  timer = window.setTimeout(() => {
    timer = undefined;
    destroyStairsCurtain();
  }, ms + CURTAIN_SETTLE_MS);
};

/** Some com a cortina agora. A saída de emergência: uma travessia que falhou não pode deixar a tela preta. */
export const destroyStairsCurtain = (): void => {
  stopTimer();
  curtain?.remove();
  curtain = null;
};

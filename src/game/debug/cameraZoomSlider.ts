import type { World3DParams } from '@/game/render3d/World3D';

// ── TEMPORARIO: o slider de zoom da camera ───────────────────────────────────────────────────
//
// Uma reguinha na tela pra achar o enquadramento do jogo com o olho em vez de recompilar a cada
// palpite. Serve pra UMA coisa: descobrir o numero. Achado o valor, ele vira `camHeight`/`camBack`
// em `DEFAULT_PARAMS` (World3D) e este arquivo sai do repo — o painel mostra os dois numeros
// prontos pra copiar exatamente por isso.
//
// ── Zoom aqui e DOLLY, nunca fov ─────────────────────────────────────────────────────────────
// A camera esta em (0, camHeight, camBack) olhando pro alvo, e a RAZAO entre os dois e a direcao
// de visao — que meio jogo tem assada dentro de si: `camHeight/camBack` e o DEPTH_UP que a arte da
// flor da lua carrega nos frames em pe, e e o `depthToScreen` com que o braco robotico calcula o
// comprimento de cada haste na tela. Mexer em um dos dois sozinho gira a camera e faz todo esse
// material mentir em silencio. Entao o slider escala os DOIS pelo mesmo fator: a camera se afasta
// ou se aproxima pela propria linha de visao, o angulo nao muda um grau, e nada do que foi assado
// contra ele se quebra.
//
// `follow()` le os dois parametros a cada frame e `tileScreenSize()` deriva o "tileSize" que a
// camada 2D do Phaser usa, tambem a cada frame — entao nao ha nada pra reaplicar: arrastar o
// slider ja e o jogo inteiro reenquadrando, HUD e sprites incluidos.

/** Fator de zoom (1 = o enquadramento autorado). Vive no modulo pra sobreviver a um restart. */
let zoom = 1;
let panel: HTMLDivElement | undefined;
/** Os valores autorados, pra o fator sempre multiplicar a base e nunca o proprio resultado. */
let base = { height: 0, back: 0 };

const MIN = 0.5;
const MAX = 2;

/**
 * Monta o slider (so em dev). Chame junto de `window.hd3d = params`, e desmonte no shutdown da
 * cena — senao um `scene.restart()` (a morte) deixa um painel orfao mexendo nos parametros de um
 * World3D que ja morreu.
 *
 * Fica escondido sob AUTOMACAO (`navigator.webdriver`): o playtest tira screenshot da pagina, e
 * `visual-ref` grava referencias que existem justamente pra diferenca de pixel significar algo.
 * Um painel de dev por cima delas nao quebraria o diff (ele e deterministico), mas sujaria toda
 * imagem de referencia do projeto — e a proxima pessoa a olhar uma delas ia acreditar no painel.
 */
export const mountCameraZoomSlider = (params: World3DParams): void => {
  if (!import.meta.env.DEV) return;
  if (navigator.webdriver) return;
  if (panel) unmountCameraZoomSlider();

  base = { height: params.camHeight, back: params.camBack };

  const el = document.createElement('div');
  el.id = 'zh-zoom-slider';
  // Canto inferior esquerdo: o HUD do profiler mora no superior esquerdo e os botoes de level no
  // superior direito. Mesma fonte e mesma moldura do profiler, pra ler como mobilia de dev e nao
  // como UI do jogo — este painel nao e do jogador, e ele nao deve parecer que e.
  el.style.cssText =
    'position:fixed;bottom:10px;left:10px;z-index:9999;pointer-events:auto;'
    + 'display:flex;align-items:center;gap:8px;'
    + 'font:11px/1.4 ui-monospace,Consolas,monospace;color:#d7e2ff;'
    + 'background:rgba(8,10,20,.82);border:1px solid rgba(255,200,115,.35);'
    + 'border-radius:4px;padding:6px 9px;text-shadow:0 1px 0 #000;user-select:none;';

  const label = document.createElement('span');
  label.textContent = 'zoom';
  label.style.cssText = 'opacity:.7;';

  const range = document.createElement('input');
  range.type = 'range';
  range.min = String(MIN);
  range.max = String(MAX);
  range.step = '0.02';
  range.value = String(zoom);
  range.style.cssText = 'width:132px;accent-color:#ffc873;cursor:ew-resize;';

  // O que o painel existe pra entregar: os dois numeros que vao pro DEFAULT_PARAMS depois.
  const readout = document.createElement('span');
  readout.style.cssText = 'min-width:118px;color:#ffc873;';

  const reset = document.createElement('button');
  reset.textContent = '1×';
  reset.title = 'volta ao enquadramento autorado';
  reset.style.cssText =
    'font:inherit;color:#d7e2ff;background:rgba(255,255,255,.08);cursor:pointer;'
    + 'border:1px solid rgba(255,200,115,.35);border-radius:3px;padding:1px 6px;';

  const apply = (next: number): void => {
    zoom = Math.min(MAX, Math.max(MIN, next));
    params.camHeight = base.height * zoom;
    params.camBack = base.back * zoom;
    range.value = String(zoom);
    readout.textContent = `${zoom.toFixed(2)}× · ${params.camHeight.toFixed(2)}/${params.camBack.toFixed(2)}`;
  };

  range.addEventListener('input', () => apply(Number(range.value)));
  reset.addEventListener('click', () => apply(1));
  // O jogo e so-andar e as setas dirigem o heroi: uma tecla que chegasse ao Phaser a partir daqui
  // faria o heroi caminhar enquanto se ajusta o zoom.
  el.addEventListener('keydown', (e) => e.stopPropagation());

  el.append(label, range, readout, reset);
  document.body.appendChild(el);
  panel = el;
  // Reaplica o fator que estava valendo: ajustar o zoom, morrer e recomecar do zero seria perder
  // o ajuste no exato momento em que se esta procurando por ele.
  apply(zoom);
};

/** Tira o painel e devolve a camera ao enquadramento autorado. */
export const unmountCameraZoomSlider = (): void => {
  panel?.remove();
  panel = undefined;
};

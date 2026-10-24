// OS CONTROLES DE TOQUE do jogador (o menu de pausa escreve, os botões leem).
//
// Tudo aqui é acessibilidade, e por isso é ESCOLHA do jogador e nunca um detector decidindo por
// ele: a mão que segura o telefone, o tamanho do alvo que o dedo dele acerta, quanto o botão
// precisa aparecer contra o mundo, e se ele quer o tranco da vibração.
//
// · CANHOTO: o par A/B e a bolsa vão para o canto esquerdo, com o A na beirada (o polegar alcança a
//   beirada primeiro). O andar continua em qualquer ponto da tela, então não há o que espelhar nele.
// · BOTÕES GRANDES: 1,3× — para dedo grande, mão trêmula, tela pequena.
// · BOTÕES SÓLIDOS: fundo e borda quase opacos — para quem não enxerga o botão translúcido contra o
//   chão claro do dia.
// · VIBRAÇÃO: um toque curto ao apertar A ou B (só onde o navegador sabe vibrar: o iPhone não sabe).
//
// As três primeiras são CLASSES no <body> (`zh-left-hand`, `zh-big-btns`, `zh-solid-btns`): o CSS
// de cada botão decide o que fazer com elas, e trocar a opção não reconstrói nada.

const LEFT_KEY = 'zh.leftHand';
const BIG_KEY = 'zh.bigButtons';
const SOLID_KEY = 'zh.solidButtons';
const HAPTICS_KEY = 'zh.haptics';

const readFlag = (key: string, fallback: boolean): boolean => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : raw === '1';
  } catch {
    return fallback; // modo privado / storage desligado: vale para a sessão, só não sobrevive
  }
};

const writeFlag = (key: string, value: boolean): void => {
  try {
    window.localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // ignore
  }
};

const state = {
  leftHand: readFlag(LEFT_KEY, false),
  bigButtons: readFlag(BIG_KEY, false),
  solidButtons: readFlag(SOLID_KEY, false),
  haptics: readFlag(HAPTICS_KEY, true),
};

/** Põe as preferências no <body>. Chamada no boot dos botões e a cada troca no menu. */
export const applyTouchSettings = (): void => {
  const body = document.body.classList;
  body.toggle('zh-left-hand', state.leftHand);
  body.toggle('zh-big-btns', state.bigButtons);
  body.toggle('zh-solid-btns', state.solidButtons);
};

export const isLeftHanded = (): boolean => state.leftHand;
export const setLeftHanded = (v: boolean): void => {
  state.leftHand = v;
  writeFlag(LEFT_KEY, v);
  applyTouchSettings();
};

export const hasBigButtons = (): boolean => state.bigButtons;
export const setBigButtons = (v: boolean): void => {
  state.bigButtons = v;
  writeFlag(BIG_KEY, v);
  applyTouchSettings();
};

export const hasSolidButtons = (): boolean => state.solidButtons;
export const setSolidButtons = (v: boolean): void => {
  state.solidButtons = v;
  writeFlag(SOLID_KEY, v);
  applyTouchSettings();
};

/** O navegador sabe vibrar? (O Safari do iPhone não: lá a opção nem aparece.) */
export const canVibrate = (): boolean => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
export const hasHaptics = (): boolean => state.haptics;
export const setHaptics = (v: boolean): void => {
  state.haptics = v;
  writeFlag(HAPTICS_KEY, v);
};

/** Um toque curto na mão do jogador — o botão "afundou". Silencioso onde não há vibração. */
export const haptic = (ms = 8): void => {
  if (!state.haptics || !canVibrate()) return;
  try {
    navigator.vibrate(ms);
  } catch {
    // alguns navegadores recusam vibrar sem gesto recente: o botão continua funcionando
  }
};

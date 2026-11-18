// O CHÁ DA SHUI, no tempo (pedido do autor): a regra pura de quanto de cada efeito existe a cada segundo da viagem.
// Quem desenha é o render3d/TripPass (o quadro) e o entities/TeaTrip (a câmera, o herói, o céu girando).
//
//   1. O PISCAR: o herói bebe, a tela escurece e volta DE DENTRO DO ELMO, em primeira pessoa: o mundo pela fresta
//      em T da máscara de ferro, com a Shui na frente.
//   2. O FORMIGAR: pontinhos pretos, como depois de esfregar os olhos; e eles ganham todas as cores.
//   3. O MUNDO RESPIRA: a cor gira, as formas constantes (o favo, a espiral) aparecem, as coisas deixam rastro.
//   4. O ELMO ABRE: a fresta se alarga até sumir, e a luz invade.
//   5. O TÚNEL: o corredor de luz de "2001", cada vez mais rápido, girando devagar, até um clarão.
//   6. O VOO: a câmera sai do corpo e voa sobre o vale, e debaixo do chão acende a rede que ninguém vê — o micélio
//      ligando tudo, a partir de onde ele bebeu. O sol e a lua passam correndo: o tempo deixou de valer.
//   7. A VOLTA: a câmera desce até o herói sentado diante da Shui, e tudo assenta. Passaram-se horas.

/** A viagem inteira, em segundos. */
export const TRIP_S = 62;
/** Quando a tela está toda escura no piscar: é aí que a câmera entra no elmo. */
export const TRIP_EYE_AT_S = 1.2;
/** Quando o clarão do fim do túnel cobre tudo: é aí que a câmera salta para o céu do vale. */
export const TRIP_FLIGHT_AT_S = 37.5;
/** O voo sobre o vale (o caminho de entities/TeaTrip vai de 0 a 1 entre estes dois instantes). */
export const TRIP_FLIGHT_END_S = 57;
/** As horas que passam de verdade: quem bebeu o chá à tarde volta com o céu mudado. */
export const TRIP_HOURS = 2;

export interface TripFrame {
  visor: number;
  open: number;
  specks: number;
  rainbow: number;
  breathe: number;
  hue: number;
  form: number;
  tunnel: number;
  /** A velocidade do túnel (unidades de profundidade por segundo): quem a acumula é quem desenha. */
  speed: number;
  spin: number;
  web: number;
  /** Até onde a rede já acendeu, em tiles a partir do herói. */
  webR: number;
  trail: number;
  white: number;
  dark: number;
  /** A câmera de cena (CameraLens.blend). */
  lens: number;
  /** 'eye' dentro do elmo, 'flight' no voo; antes do piscar e depois da volta, a câmera de sempre. */
  view: 'game' | 'eye' | 'flight';
  /** O quanto do voo já foi (0..1). */
  flight: number;
  /** O quanto do giro do céu já foi (0..1): um dia inteiro mais as horas de verdade. */
  sky: number;
}

/** De 0 a 1 entre `a` e `b`, sem tranco. */
const ramp = (t: number, a: number, b: number): number => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};
/** Sobe entre a0 e a1, fica, e desce entre b0 e b1. */
const hold = (t: number, a0: number, a1: number, b0: number, b1: number): number => ramp(t, a0, a1) * (1 - ramp(t, b0, b1));

export const tripFrame = (t: number, reduced = false): TripFrame => {
  const eye = t >= TRIP_EYE_AT_S && t < TRIP_FLIGHT_AT_S;
  const flying = t >= TRIP_FLIGHT_AT_S && t < TRIP_S;
  const open = ramp(t, 19, 23.5);
  // A velocidade do túnel: arranca, corre, e freia antes do clarão.
  const speed = (2 + 14 * ramp(t, 23, 32) - 9 * ramp(t, 34, 37.5)) * (reduced ? 0.4 : 1);
  return {
    visor: eye && open < 1 ? 1 : 0,
    open,
    specks: hold(t, 5, 11, 17.5, 20),
    rainbow: ramp(t, 12, 18),
    breathe: (ramp(t, 3, 18) * (1 - 0.5 * ramp(t, 37.5, 40)) * (1 - ramp(t, 55, 60))) * (reduced ? 0.3 : 1),
    hue: (0.6 * ramp(t, 12, 20) - 0.15 * ramp(t, 38, 42)) * (1 - ramp(t, 55, 61)),
    form: 0.85 * hold(t, 15, 18.5, 22, 24),
    tunnel: eye ? ramp(t, 22.5, 24.2) : 0,
    speed,
    spin: 1.6 * ramp(t, 24, 37),
    // A rede nasce debaixo do clarão (ela também pinta o cosmos além da beira do vale), e acende a partir do herói.
    web: hold(t, 37.5, 40, 57, 61),
    webR: 70 * ramp(t, 39, 48),
    trail: (0.45 * ramp(t, 13, 18) - 0.1 * ramp(t, 38, 40)) * (1 - ramp(t, 55, 60)) * (reduced ? 0.5 : 1),
    // A luz que invade quando o elmo abre, e o clarão do fim do túnel (com movimento reduzido, nunca a tela toda branca).
    white: Math.min(reduced ? 0.5 : 1, 0.8 * hold(t, 21.5, 23.2, 23.4, 25) + hold(t, 35.5, 37.5, 37.5, 39.5)),
    // O piscar ao beber; com movimento reduzido, o salto do túnel para o voo também passa pelo escuro.
    dark: Math.max(hold(t, 0, TRIP_EYE_AT_S, TRIP_EYE_AT_S, 2.6), reduced ? hold(t, 35.5, 37.5, 37.5, 39.5) : 0),
    lens: eye ? 1 : flying ? 1 - ramp(t, 55, 61) : 0,
    view: eye ? 'eye' : flying ? 'flight' : 'game',
    flight: ramp(t, TRIP_FLIGHT_AT_S, TRIP_FLIGHT_END_S),
    sky: ramp(t, 40, 54),
  };
};

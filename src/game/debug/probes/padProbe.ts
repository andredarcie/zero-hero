// O CONTROLE (runtime/gamepad) visto pelo playtest: se o jogo acha que o jogador está no controle, de que família ele
// é, e o que o balão e os textos mostram para cada gesto (o botão impresso no controle).

import { getKeyLetter, withKeyNames } from '@/game/runtime/accessibility';
import { getPadFamily, usingPad } from '@/game/runtime/gamepad';

export const padProbe = () => ({
  state: () => ({ using: usingPad(), family: getPadFamily(), hand: getKeyLetter('hand'), use: getKeyLetter('use') }),
  /** Um texto de ajuda como o jogo o mostraria agora (as teclas trocadas pelos botões, no controle). */
  keyNames: (text: string): string => withKeyNames(text),
});

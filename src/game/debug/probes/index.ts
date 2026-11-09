// A INTERFACE DE TESTE DO JOGO. Os playtests (playtest/) falam com o jogo SÓ por aqui, pelo `window.gameDebug`: nada
// de ler a cena por dentro (`window.__scene`) nem importar módulo de `src/` na página. A razão é o compilador: cada
// sonda é TypeScript conferido contra as classes de verdade, então quem muda um membro de lugar acerta a sonda junto
// (o tsc aponta), e o cenário, que só conhece os nomes daqui, não quebra. O guarda é
// `src/game/__tests__/playtestContract.test.ts`: cenário que toca o interior do jogo, ou que chama uma sonda que não
// existe, reprova o `npm test`.
//
// As sondas só existem no modo de desenvolvimento (o build de produção não as carrega). Fora da partida há mais duas
// portas no mesmo molde: `window.appDebug` (as cenas: título, créditos — appProbe.ts) e `window.editorDebug` (montar a
// fixture de um cenário no /editor — editorProbe.ts).
//
// Leitura de membro PRIVADO numa sonda usa colchetes (`obj['campo']`): o TypeScript deixa e continua conferindo o nome
// e o tipo, então renomear o campo quebra a sonda na compilação, como deve.

import type { GameScene } from '@/game/scenes/GameScene';
import { campProbe } from './campProbe';
import { dialogProbe, npcProbe } from './dialogProbe';
import { fireProbe } from './fireProbe';
import { forageProbe } from './forageProbe';
import { heroProbe } from './heroProbe';
import { itemProbe } from './itemProbe';
import { minigameProbe } from './minigameProbe';
import { propProbe } from './propProbe';
import { questProbe } from './questProbe';
import { referenceProbe } from './referenceProbe';
import { renderProbe } from './renderProbe';
import { sceneProbe } from './sceneProbe';
import { shadowProbe } from './shadowProbe';
import { soundProbe } from './soundProbe';
import { valleyProbe } from './valleyProbe';
import { verbProbe } from './verbProbe';
import { worldProbe } from './worldProbe';

export const buildProbes = (s: GameScene) => ({
  hero: heroProbe(s),
  world: worldProbe(s),
  verbs: verbProbe(s),
  items: itemProbe(s),
  npcs: npcProbe(s),
  dialog: dialogProbe(s),
  camp: campProbe(s),
  props: propProbe(s),
  valley: valleyProbe(s),
  quest: questProbe(s),
  scene: sceneProbe(s),
  sound: soundProbe(),
  fire: fireProbe(s),
  forage: forageProbe(s),
  minigames: minigameProbe(),
  render: renderProbe(s),
  shadows: shadowProbe(s),
  reference: referenceProbe(s),
});

export type GameProbes = ReturnType<typeof buildProbes>;

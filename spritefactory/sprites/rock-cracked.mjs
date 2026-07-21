// A PEDRA RACHADA — o que sobra da primeira picaretada (RockObject.smash: 'intact' -> 'cracked').
//
// O BUG QUE ISTO CONSERTA: rock.png e rock__1.png eram BYTE A BYTE o mesmo arquivo. A troca de
// textura acontecia, o recoil acontecia, os cacos voavam (GameScene.spawnRockDebris) — e a pedra
// na tela continuava intacta. Metade da unica interacao da picareta nao existia visualmente: o
// jogador batia duas vezes e so via a segunda.
//
// A regra de animacao da casa e "micro-variacao, nunca redesenhe a silhueta" — mas isto nao e um
// frame de animacao, e um ESTADO, e estado se le de longe (a fogueira troca de frame inteiro, a
// arvore-tile desce por uma escada de frames). Alem disso a golpada JA cospe cacos 3D reais: se a
// pedra continua do mesmo tamanho, aqueles cacos vieram do nada. Entao:
//
//   - O PICO VAI EMBORA (linhas 3-4). E a mudanca de SILHUETA que faz o estado ler num relance,
//     e e de onde os cacos sairam.
//   - A quebra e FRESCA: a face nova e o degrau mais claro da paleta (W), como a madeira clara do
//     corte no tree-chop-stages. A ferida tem de ser a coisa que se ve mudar — pedra por dentro
//     nao esta gasta pelo tempo como a casca de fora.
//   - Uma FENDA em Y desce do corte ate quase a base, em slate (o degrau mais escuro): ela nao e
//     enfeite, e a promessa da segunda picaretada. Vai bifurcada e torta de proposito — pedra nao
//     racha em linha reta, e uma linha reta vertical no meio de um sprite de 16px le como costura.
//   - A fenda MORRE antes da linha de contato: se ela encostasse no chao, a pedra ja estaria em
//     dois pedacos, e ela ainda bloqueia o tile.
//
// O pe continua na linha 13, igual ao frame inteiro: `frameFootPad` mede esse vazio para colar a
// sombra projetada no objeto, e um pe diferente entre os dois estados faria a sombra PULAR na
// primeira picaretada.

import { PALETTE } from './rock.mjs';

export default {
  name: 'rock-cracked',
  kind: 'prop',
  palette: PALETTE,
  frames: [[
    '................',
    '................',
    '................',
    '................',
    '................',
    '..HWWWWM........',
    '..HHWWWMSS......',
    '.HHHHKKMMSSS....',
    '.HHHMKMSSSSSDDD.',
    '.MMMKMMSSSSSDDD.',
    '.MMMKMSSSSSSDDD.',
    '.MMKMSSSSSSSDDD.',
    '.DMSSSSSSSDDDDD.',
    '..KKKKKKKKKKKK..',
    '................',
    '................',
  ]],
  notes: 'O estado rachado — antes deste arquivo, um clone exato da pedra inteira. Perde o pico '
    + '(de onde os cacos 3D sairam), mostra a quebra fresca no degrau mais claro e leva uma fenda '
    + 'bifurcada em slate que para antes do chao. Mesma paleta e mesmo pe do frame inteiro, '
    + 'importados de rock.mjs para os dois nao poderem divergir.',
};

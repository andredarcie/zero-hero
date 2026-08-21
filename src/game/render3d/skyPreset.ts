import type { World3DParams } from '@/game/render3d/World3D';

// ── O DIA, E A DESCOBERTA QUE REFEZ ESTE ARQUIVO ─────────────────────────────
//
// O jogo nasceu de noite: cada número do `World3DParams` foi escolhido a olho contra um mundo
// escuro. Então a NOITE não mora aqui — ela É o padrão do `World3D.params`, e este arquivo guarda
// só o DELTA que faz virar dia. Duas cópias da noite (uma no padrão, outra num preset "night")
// seriam duas vozes discordando na primeira vez que alguém mexesse num knob.
//
// **A PRIMEIRA VERSÃO SUBIU A LUZ E NÃO PARECEU DIA.** A explicação não estava em nenhum número,
// estava numa premissa errada, e ela é o que este arquivo mais tem a ensinar:
//
//   **ESTE JOGO NÃO TEM TONE MAPPING.** O `RenderPass` desenha o mundo num render target, e o
//   three só monta o ACES quando o alvo é a TELA (`WebGLPrograms`: com um alvo ligado o
//   `toneMapping` fica em `NoToneMapping`). O `EffectComposer` não tem `OutputPass`, e o
//   `FinishShader` é um ShaderMaterial cru. Logo o valor LINEAR do buffer vai direto para o
//   canvas, que o mostra como se fosse sRGB — e `params.exposure`, que só existe como uniform de
//   tone mapping, não chega a shader nenhum. É daí que vêm o escuro fundo e o contraste da noite,
//   e é por isso que a `ambient` precisou de 8,5 para o mundo ficar legível.
//
//   Duas consequências, e as duas mandam aqui:
//
//     · **Não há ombro nenhum segurando o alto.** 1,0 é um corte seco. Subir a luz clareia pouco a
//       sombra (é multiplicação: 0,10 × 1,7 ainda é escuro) e estoura o branco depressa. Foi
//       exatamente isso que a primeira versão fez.
//     · **O lugar de levantar um quadro é a CURVA, não a lâmpada.** `params.lift` (novo) aplica
//       `pow` no quadro pronto: monótono, leva 1 em 1, e abre justamente os graves — que é onde a
//       diferença entre meio-dia e meia-noite mora. Um tile de capim sai em ~#144E0A à noite e em
//       ~#5FA466 de dia, sem um único pixel novo estourado. A noite fica em `lift` = 1, que é a
//       identidade literal (o `if` do shader nem roda).
//
// **A SEGUNDA VERSÃO CLAREOU, MAS SAIU "NEBLINA BRANCA".** Duas coisas, e as duas são a mesma
// armadilha — clarear um quadro sem devolver nada:
//
//     · **O fog.** Ele foi subido a 0.045 com um azul quase branco, para comprar "ar". Misturado
//       27% no topo e 12% em volta do herói, ele MAIS QUE DOBRAVA o azul de cada pixel: era ele a
//       neblina, literalmente. Hoje ele é metade da densidade e DOURADO — poeira de sol, não vapor.
//     · **O bloom.** Com o mundo mais claro, o limiar de 0.95 passou a deixar meia arte acima da
//       linha, e o halo virou um véu leitoso sobre a tela inteira. Ao meio-dia não há halo.
//
//   E o que faltava do outro lado: **a curva DESSATURA e LAVA o preto** — `pow` comprime razões
//   entre canais e levanta o pé. Ela precisa de dois pares fixos: `contrast`, que devolve o preto,
//   e `saturation`, que devolve a cor. Sem eles, "mais claro" é sempre "mais leite".
//
// Com isso resolvido, o dia é ganho em quatro lugares, nesta ordem de impacto:
//
//   1. **A CURVA E SEUS DOIS PARES** (`lift` + `contrast` + `saturation`) — o quadro sai do porão
//      sem perder o preto nem a cor.
//   2. **O OURO** — o sol é a única luz quente do mundo, e ele ganha o orçamento que a ambiente
//      perde; o split-tone dobra isso com um par próprio (GRADE_DAY_* no World3D); o pouco de fog
//      que resta é dourado. Três lugares empurrando a MESMA cor.
//   3. **A SOMBRA** — sol dá sombra curta, dura e escura; lua dá sombra longa e fraca. Sem shadow
//      map, o decalque no chão é o ÚNICO desenho que aponta para a luz do mundo.
//   4. **O QUE SOME** — vinheta, grão, bloom e vaga-lume são desenhos do ESCURO, e ao meio-dia
//      eles não se atenuam: eles não acontecem.
//
// A luz sobe também (~1,26×) e com viés quente, mas como TEMPERO — não como o argumento.
//
// Três leis mandam no formato desta tabela:
//
//  1. **O SOL É A LUA.** Nada pode criar nem destruir uma luz THREE em runtime — o three assa a
//     CONTAGEM de luzes na chave de cache de todo shader, e um `scene.add` no meio do jogo
//     recompila o mundo inteiro (~550ms travados). Então a direcional que enche a noite continua
//     sendo a mesma de dia: mesma posição, mesma direção, mesma classe. O que muda é a roupa —
//     cor quente e intensidade. O rumo que a sombra segue (`moonCastRotY`) não se mexe: o sol
//     deste jogo nasce no mesmo quadrante em que a lua se põe.
//  2. **A COR DO SOL SÓ SOBREVIVE COM FOLGA NO TETO.** `lightCap` limita a luz DIRETA a
//     `albedo × cap − ambiente`. Se a ambiente gastar quase tudo, a direta é cortada e o mundo sai
//     CHAPADO na cor da ambiente — foi assim que uma tentativa de "céu azul forte" virou um mundo
//     azul sem sol nenhum. Por isso a ambiente do dia é MENOR que a da noite e o teto é escolhido
//     um fio acima da soma: o sol tem onde pintar.
//  3. **NADA AQUI MEXE NA `exposure`** — ela não faz nada (ver acima). Quem levanta é `lift`.
//
// Tudo aqui é knob vivo (`window.hd3d`), então afinar o dia é console, nunca recompilação.

/**
 * O que muda ao acender o dia. Toda chave aqui é restaurada ao valor de fábrica (a noite) quando
 * `daylight` volta a 0 — ver `World3D.applySky`, que captura o padrão ANTES de escrever por cima.
 */
export const DAY_SKY: Partial<World3DParams> = {
  // ── 1. A CURVA ─────────────────────────────────────────────────────────────
  // O knob mais forte do dia inteiro, e o único que clareia sem estourar nada. 0.66 leva o 0,10 a
  // 0,22 e o 0,33 a 0,48, e deixa o 1,0 onde está. Subir o dia é BAIXAR este número; passar de
  // ~0.55 lava o preto e o quadro vira leite — foi metade do "neblina branca" da v2. O `contrast`
  // lá embaixo é o par dele: a curva levanta o pé, e o contraste devolve o preto.
  lift: 0.66,

  // ── 2. O AR, E POR QUE ELE FICOU DOURADO ───────────────────────────────────
  // A câmera olha ~48° para baixo e o horizonte NUNCA entra no quadro: o topo da tela é chão a ~12
  // unidades, e é só isso que o fog tem para trabalhar. A v2 quis comprar "ar" subindo a densidade
  // a 0.045 com um azul PÁLIDO (#bdd9ec, quase branco em linear) — e essa névoa, misturada 27% no
  // topo e 12% em volta do herói, MAIS QUE DOBRAVA o azul de cada pixel. Era ela a neblina branca.
  //
  // A correção não é só menos: é outra COR. Um dia de sol tem poeira dourada no ar, não vapor —
  // então a distância agora esquenta em vez de embranquecer, e o pouco de fog que resta trabalha
  // A FAVOR do amarelo em vez de contra. Metade da densidade, e um tom mais escuro que o chão em
  // verde e azul: ele puxa a distância para o ouro sem levantar o pé de nada.
  //
  // Fundo e fog são a mesma cor e os dois passam pela curva, então o hex aqui é o que se vê — sem
  // tone mapping não há a tradução torta que um pipeline com ACES imporia.
  skyColor: '#c7b389',
  fogDensity: 0.026,

  // ── 3. A SOMBRA ────────────────────────────────────────────────────────────
  // A lua era preenchimento e INSINUAVA (0.22 de escuro, 2,1 alturas de comprido); o sol CRAVA.
  // Curta como o que a projeta, e escura o bastante para o chão sob uma árvore ficar em ~62% do
  // chão ao lado depois da curva. Mexer nestes dois re-assa o campo instanciado, uma vez, na troca.
  moonShadowAlpha: 0.55,
  moonShadowLength: 1,

  // ── 4. O OURO, E O QUE SOME COM O ESCURO ───────────────────────────────────
  // O split-tone é onde o amarelo do dia é decidido (na luz ele quase não pode — lei 2), com par
  // PRÓPRIO e extremo: sol dourado em cima, céu azul na sombra (ver GRADE_DAY_* no World3D). Ele é
  // extremo porque a curva come tinta — 1,24× de razão chega à tela como 1,15×.
  //
  // `contrast` é o PAR da curva, não um enfeite: `pow` levanta o pé do quadro, e sem devolver o
  // preto o resultado é exatamente o leite que a v2 tinha. `saturation` existe pela mesma razão —
  // `pow` comprime razões entre canais, ou seja DESSATURA, e este número compra a cor de volta.
  grade: 0.65,
  saturation: 1.32,
  contrast: 1.14,
  // Vinheta, grão e bloom são os três desenhos do ESCURO. O grão é ruído de pouca luz e a vinheta
  // fecha um quadro que agora é aberto (fica um sopro dela: sem nenhuma, o quadro deixa de ser uma
  // fotografia). O BLOOM é o caso grave e foi a outra metade da "neblina branca" da v2: com o
  // mundo 1,26× mais claro, um limiar de 0.95 punha meia arte acima da linha e o halo virava um
  // véu leitoso sobre tudo. Ao meio-dia não há halo — o limiar sobe ACIMA de qualquer superfície
  // iluminada (o teto é 2.0, então só arte quase branca passa) e a força cai ao sopro que a chama
  // ainda merece.
  vignette: 0.06,
  grain: 0.012,
  bloomStrength: 0.1,
  bloomThreshold: 1.05,

  // ── A LUZ: menos abóbada, mais SOL ─────────────────────────────────────────
  // A ambiente DESCE de novo (5.0 contra os 8.5 da noite) e o sol SOBE. Não é por brilho — o total
  // mal se mexe — é por PROPORÇÃO: a ambiente é uma luz quase branca e o sol é o único ouro do
  // mundo, então cada ponto que passa de uma para o outro é amarelo que chega à tela. Uma ambiente
  // gorda é literalmente a cor errada ocupando o orçamento (e, pela lei 2, comendo o teto que o
  // sol precisa para pintar).
  //
  // Somados, o chão aberto sai em ~(1.96, 1.64, 1.33)× a cor da própria arte — razão 1 : 0,84 :
  // 0,68 — contra os ~1,55 quase neutros da noite. O teto está um fio acima do vermelho para NÃO
  // cortar nenhum canal: cortar seria achatar exatamente esse r > g > b, que é o amarelo.
  ambient: 5,
  ambientColor: '#c2c8d6',
  moon: 4.25,
  moonColor: '#ffd486',
  lightCap: 2,

  // ── A FOGUEIRA RECUA ───────────────────────────────────────────────────────
  // Ela não deixa de existir — continua sendo a fechadura do jogo e o sprite da chama continua
  // aceso —, mas ao meio-dia ela é uma mancha morna no chão, não a luz do mundo. Halo, silhueta,
  // raios e brilho do herói encolhem JUNTOS; se só um encolhesse, sobraria uma fogueira que não
  // ilumina nada mas ainda risca o chão de sombras compridas. A curva ajuda de graça: ela é
  // côncava, então o mesmo tanto de brilho aditivo rende menos sobre um chão já claro.
  fireIntensity: 140,
  fireGlowStrength: 0.22,
  castShadowAlpha: 0.22,
  castShadowRadius: 4.5,
  godRays: 0.1,
  heroLight: 0,
  // A VISTA some junto, e pelo mesmo motivo dos vaga-lumes: ela é um desenho do ESCURO. Ao
  // meio-dia não há grave nenhum para ela abrir — o `lift` do dia já levantou o quadro inteiro —,
  // e um segundo `pow` por cima só faria uma mancha lavada seguindo o herói.
  heroSight: 0,
  heroSightGlow: 0,

  // O vaga-lume é o caso limpo do parágrafo acima: ao meio-dia ele não fica mais fraco, ele não
  // acontece. A névoa fica, fraca — e vira POEIRA (a cor dela troca em updateParticles).
  fireflies: 0,
  // A névoa rasteira é aditiva, então de dia ela soma EM CIMA de um chão já claro: o que à noite
  // era um véu no escuro vira leite. Fica só o traço de poeira que dá matéria ao ar.
  mist: 0.45,

  // A água. De noite ela pisca a lua — faíscas frias e esparsas; de dia ela pisca o SOL, e sol na
  // água é branco-quente. Mesma cintilação, outra estrela.
  glintColor: '#fff2cf',
};

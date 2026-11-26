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
// **A TERCEIRA VERSÃO: SOL E SOMBRA NO MESMO QUADRO (2026-11-10, o estudo HD-2D).** Medido contra 31 capturas
// oficiais do gênero, o dia deste jogo usava METADE da faixa de tons delas (luma 27 a 128 contra 13 a 211) e tinha
// 2% da tela em sombra funda contra 14%: sombra rasa, nada realmente claro, e a mesma saturação do claro ao escuro.
// A causa estava na própria curva: `pow(0,64)` levanta o quadro COMPRIMINDO razões (um chão ao sol 2× mais claro
// que a sombra chega à tela 1,56×). O conserto é o par oposto ao da v1, e só é possível porque o ombro das
// altas-luzes (`shoulder`) passou a existir: **mais luz E curva mais reta**. A luz inteira sobe ~1,4× (ambiente, sol
// e teto juntos, para a lei 2 continuar valendo) e o expoente vai a 0,76 — o meio-tom fica onde estava, o grave
// desce e o alto sobe. Junto: a sombra de sol e a de nuvem mais fundas, e a sombra perde cor (`shadeSat`).
// O que NÃO foi feito, de propósito: a mata fechada não ganhou uma massa de sombra no chão (o autor já recusou o
// "bloco escuro colado na parede"), e a noite não escureceu (ele pediu a noite legível).
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
  // 0,76 (era 0,64; ver "A TERCEIRA VERSÃO" no cabeçalho): a curva mais reta comprime menos a razão entre sol e
  // sombra, e a luz que subiu lá embaixo (ambient, moon, lightCap) devolve o meio-tom. Mexer num sem o outro escurece
  // ou lava o dia inteiro. Baixar este número continua sendo o jeito de clarear; abaixo de ~0,7 o quadro achata.
  lift: 0.76,

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
  // 0,026 ÷ 1,285 (2026-11-10): a câmera recuou pelo dolly zoom (worldParams.camHeight), e o fog conta da câmera.
  // × 0,591 (2026-11-19): a câmera HD-2D recuou de novo, pelo mesmo motivo.
  fogDensity: 0.01194,
  // A perspectiva atmosférica (finishShader): de dia o longe se perde na poeira dourada — é o que dá ar ao quadro sem
  // borrar a pixel art (o desfoque, que fazia esse papel, cedeu).
  haze: 0.85,

  // ── 3. A SOMBRA ────────────────────────────────────────────────────────────
  // A lua era preenchimento e INSINUAVA (0.22 de escuro, 2,1 alturas de comprido); o sol CRAVA.
  // Curta como o que a projeta, e escura o bastante para o chão sob uma árvore ficar em ~62% do
  // chão ao lado depois da curva. Mexer nestes dois re-assa o campo instanciado, uma vez, na troca.
  // (0,68 e 1,3 alturas desde o estudo HD-2D: a sombra de sol é o maior desenho de claro-escuro que o dia tem, e ela
  // era curta e rasa. Mais que 0,7 e a sombra some em preto nos biomas escuros, o musgo e a mata.)
  moonShadowAlpha: 0.68,
  moonShadowLength: 1.3,

  // ── 4. O OURO, E O QUE SOME COM O ESCURO ───────────────────────────────────
  // O split-tone é onde o amarelo do dia é decidido (na luz ele quase não pode — lei 2), com par
  // PRÓPRIO e extremo: sol dourado em cima, céu azul na sombra (ver GRADE_DAY_* no World3D). Ele é
  // extremo porque a curva come tinta — 1,24× de razão chega à tela como 1,15×.
  //
  // `contrast` é o PAR da curva, não um enfeite: `pow` levanta o pé do quadro, e sem devolver o
  // preto o resultado é exatamente o leite que a v2 tinha. `saturation` existe pela mesma razão —
  // `pow` comprime razões entre canais, ou seja DESSATURA, e este número compra a cor de volta.
  grade: 0.65,
  // 1.32 → 1.24 → 1.04 (2026-11-10): com a rampa do bioma (biomeRamp.ts) a cor do chão já é escolhida, e a curva
  // mais reta (0,76) come bem menos tinta que a de 0,64 — o que este número devolvia a mais passou a sobrar.
  saturation: 1.04,
  // A SOMBRA PERDE COR (finishShader): a cor do dia mora no que o sol pega.
  shadeSat: 0.4,
  contrast: 1.17,
  // Vinheta, grão e bloom são os três desenhos do ESCURO. O grão é ruído de pouca luz e a vinheta
  // fecha um quadro que agora é aberto (fica um sopro dela: sem nenhuma, o quadro deixa de ser uma
  // fotografia). O BLOOM é o caso grave e foi a outra metade da "neblina branca" da v2: com o
  // mundo 1,26× mais claro, um limiar de 0.95 punha meia arte acima da linha e o halo virava um
  // véu leitoso sobre tudo. Ao meio-dia não há halo — o limiar sobe ACIMA de qualquer superfície
  // iluminada (o teto é 2.0, então só arte quase branca passa) e a força cai ao sopro que a chama
  // ainda merece.
  // (0,14 e não mais 0,06: nas referências os cantos têm menos da metade do brilho do centro; aqui eram iguais.)
  vignette: 0.14,
  grain: 0.012,
  // (O halo voltou um fio — 0,14 com limiar 1,0 — junto com o ombro das altas-luzes: a flor branca e a faísca d'água
  // ao sol ganham um brilho curto, e nenhuma superfície comum chega ao limiar.)
  // (O limiar acompanha a luz: com tudo 1,4× mais claro, 1,0 punha o prado inteiro acima da linha — o véu de novo.
  // 1,7 e não 1,5: a flor branca ao sol passa do limiar por ~0,9, como passava antes; com 1,5 passava por 1,1 e cada
  // flor virava uma bolinha acesa que chamava mais que o herói.)
  bloomStrength: 0.14,
  bloomThreshold: 1.7,

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
  //
  // (2026-11-10: os três sobem juntos, 5 / 4,25 / 2 → 6,8 / 7 / 3, e o sol mais que a abóbada. É a metade "mais luz"
  // do par com `lift` 0,76; o teto sobe na mesma proporção para o sol continuar tendo onde pintar.)
  ambient: 6.8,
  ambientColor: '#c2c8d6',
  moon: 7,
  moonColor: '#ffd486',
  lightCap: 3,

  // ── A FOGUEIRA RECUA ───────────────────────────────────────────────────────
  // Ela não deixa de existir — continua sendo a fechadura do jogo e o sprite da chama continua
  // aceso —, mas ao meio-dia ela é uma mancha morna no chão, não a luz do mundo. Halo, silhueta
  // e brilho do herói encolhem JUNTOS; se só um encolhesse, sobraria uma fogueira que não
  // ilumina nada mas ainda risca o chão de sombras compridas. A curva ajuda de graça: ela é
  // côncava, então o mesmo tanto de brilho aditivo rende menos sobre um chão já claro.
  fireIntensity: 140,
  fireGlowStrength: 0.22,
  castShadowAlpha: 0.22,
  castShadowRadius: 4.5,
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

  // ── A SOMBRA TEM COR, O AR TEM LUZ E O CÉU PASSA (2026-11-10) ───────────────
  // Sombra de sol é o lugar onde só o céu ilumina: azul. Ela fica um pouco mais funda que os 0,55 pretos de antes
  // porque parte da escuridão agora é cor (o vermelho cai à metade, o azul só a três quartos).
  shadowTint: '#7a93c8',
  // O ar do meio-dia quase não aparece: sol alto, pouca poeira. Só a mata guarda um fio de bruma clara.
  air: 0.5,
  airColor: '#fff0c4',
  // As nuvens passam: manchas largas de sombra fria atravessando o vale, e o lago devolvendo o céu azul com elas.
  // (1,35: a sombra de nuvem é a única MASSA de sombra que um prado aberto pode ter — ver SkyLight.CLOUD_KNOB_MAX.)
  clouds: 1.35,
  waterSkyColor: '#7db8f1',
  waterCloudColor: '#f8fbff',
  stars: 0,
};

/**
 * A HORA DOURADA — o que o sol baixo põe POR CIMA do que o dia já decidiu. É a BASE dos momentos de sol rente da
 * trilha lá embaixo (`SKY_TRACK`): o nascer do sol, a hora dourada da tarde e o pôr do sol partem dela, cada um com a sua cor.
 *
 * Ela não existia. O relógio ia da noite ao dia misturando as duas tabelas, e o meio do caminho entre "noite cinza" e
 * "dia dourado" é lama: o entardecer saía como um dia apagado, a hora mais bonita do dia era a mais feia do jogo.
 *
 * O que ela diz, na ordem do que mais se vê:
 *   · o SOL fica laranja e forte (ele bate de raspão: a força compensa o ângulo), e a sombra fica COMPRIDA e violeta;
 *   · o AR acende — é a hora dos fachos: a bruma entre as árvores pega o ouro, e cada copa recorta o seu;
 *   · a distância se perde em pêssego, e o lago devolve um céu de fogo;
 *   · a curva, o contraste e a cor ficam entre o dia e a noite, com mais contraste que os dois.
 */
export const GOLDEN_SKY: Partial<World3DParams> = {
  // ── o sol rente ──
  // Ouro, não vermelho: um laranja saturado multiplicado pelo verde do capim dá marrom, e a primeira versão saiu um
  // vale de ferrugem. A cor forte da hora vem do AR, da distância e do split-tone; a luz só esquenta. A força é o
  // dobro da do meio-dia porque o sol bate de raspão (o chão recebe ~40% dele).
  // (2026-11-10: 8,6 / 5,6 / 2,2 → 12,5 / 7 / 3,1, junto com a curva mais reta — o mesmo par do dia.)
  moonColor: '#ffcb96',
  moon: 12.5,
  ambient: 7,
  ambientColor: '#d8cbd0',
  lightCap: 3.1,
  // ── a sombra comprida e violeta ──
  shadowTint: '#8f8cc9',
  moonShadowAlpha: 0.66,
  moonShadowLength: 2.1,
  // ── o ar e a distância ──
  skyColor: '#dba779',
  haze: 0.9,
  air: 2.7,
  airColor: '#ffb469',
  airOpen: 0.16,
  mist: 1.3,
  // ── a curva: tão aberta quanto a do dia (a luz é mais fraca, o quadro não pode ser) ──
  lift: 0.76,
  contrast: 1.14,
  saturation: 1.04,
  shadeSat: 0.45,
  grade: 0.62,
  bloomStrength: 0.22,
  bloomThreshold: 1.55,
  vignette: 0.2,
  grain: 0.014,
  // A vista e a luz do herói são desenhos do ESCURO: com o sol ainda no céu elas fariam uma mancha em volta dele.
  heroSight: 0,
  heroSightGlow: 0,
  heroLight: 0,
  // ── o céu que passa e o lago que o devolve ──
  clouds: 0.9,
  waterSkyColor: '#f2a268',
  waterCloudColor: '#ffd9ae',
  stars: 0.08,
  glintColor: '#ffd9a6',
};

// ── OS MOMENTOS DO DIA (2026-11-20, pedido do autor: "cada momento do dia bem claro e observável") ─────────────────
//
// O céu tinha TRÊS roupas (a noite, o dia, a hora dourada) pesadas pela ALTURA do sol, e a altura é simétrica: o
// amanhecer era o entardecer, a manhã era a tarde, e das 9h às 15h o quadro não mudava um pixel. Medido nas fotos hora a
// hora: o nascer do sol estourava a tela de laranja (o sol nasce ao norte, DE FRENTE para a câmera, e o ar aceso espalha
// para a frente: ~15× mais que com ele às costas), o pôr do sol era um dia um pouco mais quente, e o dia virava noite em
// meia hora de relógio — oito segundos de jogo.
//
// Agora o dia é uma TRILHA de momentos com HORA MARCADA. Cada momento é o quadro inteiro daquela hora (os knobs e o par
// do split-tone), e o relógio anda de um ao seguinte em linha reta. Não há mais simetria: manhã e tarde são tabelas
// diferentes. O que cada um conta, do jeito que o céu de verdade conta:
//
//   · a MADRUGADA esfria e clareia um fio (a lua se apaga, o azul sobe do horizonte, a bruma engrossa);
//   · a AURORA é rosa e lilás, e SEM SOMBRA: o sol ainda não saiu, quem ilumina é o céu inteiro;
//   · o NASCER DO SOL é ouro-rosa, de raspão, com a sombra comprida — mais frio e mais limpo que o pôr (ar da manhã);
//   · a MANHÃ é a hora mais limpa: luz branca, sombra azul, pouco pó no ar, o verde mais vivo do dia;
//   · o MEIO-DIA é o `DAY_SKY` ao pé da letra: sol a pino, sombra curta e dura;
//   · a TARDE esquenta e empoeira: o ouro volta à luz e à distância;
//   · a HORA DOURADA e o PÔR DO SOL são o fogo: laranja fundo, sombra violeta muito comprida, o longe em brasa;
//   · o CREPÚSCULO é o arrebol: o sol já foi e o céu fica magenta — de novo sem sombra, e mais escuro a cada minuto;
//   · a HORA AZUL é o anil saturado em que as janelas e os vaga-lumes acendem; e então a NOITE.
//
// AS LEIS QUE VALEM AQUI (além das três lá de cima):
//  · "Laranja saturado na LUZ × verde do capim = marrom": a cor forte de cada hora vem do AR, da DISTÂNCIA
//    (`skyColor` + `haze`), da sombra e do split-tone. A luz só esquenta ou esfria.
//  · Sol abaixo do horizonte = sombra de sol quase nenhuma (`moonShadowAlpha` baixo) e a AMBIENTE mandando: a aurora e o
//    crepúsculo são chapados de propósito, é a luz difusa do céu.
//  · O lago devolve o céu DO ALTO, não o do horizonte: ao nascer e ao pôr ele é lilás com nuvem acesa, nunca laranja
//    chapado (o "piso de barro" que a hora dourada antiga fazia).
//  · O `air` dos dois sóis rentes NÃO é o mesmo número: de manhã o sol está de frente (pouco ar já acende a tela), de
//    tarde está às costas (precisa de muito mais para aparecer). Se o caminho do sol mudar, estes dois trocam.
//  · O relógio corre devagar de 4h30 a 19h45 (runtime/timeOfDay): os dois crepúsculos duram o bastante para serem vistos.

/** O par do split-tone de um momento: por quanto a sombra e a alta-luz multiplicam cada canal (finishShader). */
export type SkyTint = readonly [number, number, number];

export interface SkyMoment {
  readonly name: string;
  /** A hora do relógio (0 a 24) em que o quadro é exatamente este. */
  readonly at: number;
  /** Os knobs deste momento. O que ele não diz vale o da NOITE: o valor de fábrica do `World3DParams`. */
  readonly sky: Partial<World3DParams>;
  readonly shadow: SkyTint;
  readonly high: SkyTint;
}

// A noite longe do fogo puxa para o AZUL FRIO de pouca cor — pelo grade, nunca pela luz: uma luz azul forte já pintou as
// árvores de turquesa (relato do autor, ver ambientColor). Só a sombra esfria; o fogo fica quente por contraste.
const NIGHT_SHADOW: SkyTint = [0.84, 0.9, 1.22];
const NIGHT_HIGH: SkyTint = [1.12, 1.02, 0.86];
// O meio-dia precisa de par próprio: o que enche a sombra de um dia de sol é o CÉU (azul) e o que bate no alto é o SOL
// (ouro). O alto puxa forte porque a CURVA come tinta (uma razão de 1,24× chega à tela como ~1,15×).
const NOON_SHADOW: SkyTint = [0.84, 0.93, 1.2];
const NOON_HIGH: SkyTint = [1.24, 1.06, 0.72];

/** A noite fechada: nada escrito, tudo de fábrica. */
const NIGHT: Partial<World3DParams> = {};

/** A MADRUGADA (a hora azul da manhã): a noite esfriando e clareando um fio, antes de qualquer cor quente. */
const BLUE_DAWN: Partial<World3DParams> = {
  lift: 0.93,
  ambient: 8.8,
  ambientColor: '#a9b8d8',
  moon: 2.4,
  moonColor: '#9db0d2',
  moonShadowAlpha: 0.12,
  skyColor: '#17203c',
  haze: 0.62,
  air: 1.3,
  airColor: '#86a2dc',
  airOpen: 0.1,
  mist: 2.7,
  fireflies: 1.4,
  stars: 0.55,
  waterSkyColor: '#3b5182',
  waterCloudColor: '#6c7a9c',
  grade: 0.4,
  saturation: 0.97,
  heroSight: 0.2,
  heroSightGlow: 0.15,
};

/** A AURORA: o céu rosa e lilás antes do sol. Luz difusa, sem sombra; a distância acende primeiro. */
const AURORA: Partial<World3DParams> = {
  lift: 0.85,
  ambient: 8.8,
  ambientColor: '#d2bcd4',
  moon: 1.6,
  moonColor: '#ffc8b4',
  lightCap: 2.1,
  moonShadowAlpha: 0.07,
  moonShadowLength: 2.4,
  shadowTint: '#3b3a7a',
  skyColor: '#8a5f86',
  haze: 0.85,
  air: 1.1,
  airColor: '#eaa8c2',
  airOpen: 0.14,
  mist: 2.5,
  fireflies: 0.25,
  stars: 0.12,
  clouds: 0.4,
  waterSkyColor: '#8672a6',
  waterCloudColor: '#f5b6b4',
  glintColor: '#f0cfe0',
  grade: 0.52,
  saturation: 1.0,
  contrast: 1.05,
  shadeSat: 0.15,
  vignette: 0.2,
  bloomStrength: 0.26,
  bloomThreshold: 1.1,
  heroSight: 0.06,
  heroSightGlow: 0.05,
  heroLight: 8,
  fireIntensity: 220,
  fireGlowStrength: 0.5,
};

/** O NASCER DO SOL: ouro-rosa de raspão. Parte da hora dourada, mais fria e mais limpa (e com bem menos ar: o sol está de frente). */
const SUNRISE: Partial<World3DParams> = {
  ...DAY_SKY,
  ...GOLDEN_SKY,
  moonColor: '#ffcdae',
  moon: 10.5,
  ambientColor: '#dccbd8',
  lightCap: 3.0,
  shadowTint: '#8a88d0',
  moonShadowAlpha: 0.6,
  moonShadowLength: 2.5,
  skyColor: '#e8a99c',
  haze: 0.84,
  air: 0.95,
  airColor: '#ffbc9c',
  airOpen: 0.1,
  mist: 1.7,
  stars: 0.03,
  waterSkyColor: '#b3a0d2',
  waterCloudColor: '#ffd3c0',
  glintColor: '#ffe0d0',
  grade: 0.62,
  saturation: 1.04,
  contrast: 1.15,
};

/** A MANHÃ CEDO: o ouro clareando, a sombra ainda comprida e já azul, um resto de bruma. */
const EARLY: Partial<World3DParams> = {
  ...DAY_SKY,
  moonColor: '#ffe3b2',
  moon: 8.6,
  ambient: 6.9,
  ambientColor: '#c8cfe0',
  lightCap: 3.05,
  shadowTint: '#8298d0',
  moonShadowAlpha: 0.66,
  moonShadowLength: 1.85,
  skyColor: '#d4c4a8',
  haze: 0.82,
  air: 0.9,
  airColor: '#ffe6b8',
  airOpen: 0.08,
  mist: 0.9,
  clouds: 1.1,
  waterSkyColor: '#8db6ea',
  waterCloudColor: '#fff2e0',
  grade: 0.6,
  saturation: 1.06,
};

/** A MANHÃ: a hora mais limpa do dia. Luz branca, sombra azul, pouco pó, o verde mais vivo. */
const MORNING: Partial<World3DParams> = {
  ...DAY_SKY,
  moonColor: '#fff1d2',
  ambientColor: '#bfcee4',
  shadowTint: '#7092d6',
  moonShadowLength: 1.5,
  skyColor: '#bcc6ba',
  haze: 0.68,
  air: 0.6,
  airColor: '#fff6dc',
  waterSkyColor: '#6cb2f6',
  grade: 0.6,
  saturation: 1.1,
};

/** A TARDE: a luz esquenta, o pó dourado volta ao ar e a sombra começa a crescer para o outro lado. */
const AFTERNOON: Partial<World3DParams> = {
  ...DAY_SKY,
  moonColor: '#ffcd7c',
  moon: 7.8,
  ambientColor: '#c8c6cc',
  shadowTint: '#8290c6',
  moonShadowLength: 1.65,
  skyColor: '#d2ae76',
  haze: 0.95,
  air: 1.4,
  airColor: '#ffdc98',
  airOpen: 0.1,
  mist: 0.7,
  waterSkyColor: '#86b2e2',
  waterCloudColor: '#fff0d2',
  grade: 0.7,
  saturation: 1.05,
};

/** A HORA DOURADA DA TARDE: o `GOLDEN_SKY`, com o ar reforçado (o sol está às costas da câmera) e o lago ainda azul. */
const GOLDEN_HOUR: Partial<World3DParams> = {
  ...DAY_SKY,
  ...GOLDEN_SKY,
  moonColor: '#ffc88c',
  moon: 12,
  moonShadowLength: 2.05,
  skyColor: '#dfa468',
  air: 3.4,
  airOpen: 0.18,
  waterSkyColor: '#93a4d0',
  waterCloudColor: '#ffdcae',
  grade: 0.68,
  saturation: 1.07,
};

/** O PÔR DO SOL: o fogo. Laranja fundo, sombra violeta muito comprida, o longe em brasa, o lago lilás com nuvem acesa. */
const SUNSET: Partial<World3DParams> = {
  ...DAY_SKY,
  ...GOLDEN_SKY,
  // (O laranja fundo mora no AR, na distância e no split-tone. Na primeira prova o ar ia a 7 e a luz a #ffb27a: o capim
  // virava ferrugem e a mata, um bloco marrom — a lei do "laranja × verde = marrom", de novo.)
  moonColor: '#ffba88',
  moon: 12.5,
  ambient: 6.8,
  ambientColor: '#d8c4d0',
  lightCap: 3.1,
  shadowTint: '#8676c8',
  // (0,6 e não os 0,66 da hora dourada: com a sombra tão comprida a mata inteira fica debaixo dela, e saía um bloco escuro.)
  moonShadowAlpha: 0.6,
  moonShadowLength: 2.6,
  skyColor: '#e2875a',
  haze: 1.0,
  air: 3.6,
  airColor: '#ffa25e',
  airOpen: 0.16,
  mist: 1.5,
  lift: 0.77,
  contrast: 1.17,
  saturation: 1.05,
  grade: 0.72,
  vignette: 0.24,
  bloomStrength: 0.26,
  bloomThreshold: 1.5,
  stars: 0.05,
  waterSkyColor: '#8c7ec2',
  waterCloudColor: '#ffb48c',
  glintColor: '#ffc89a',
};

/** O CREPÚSCULO (o arrebol): o sol já foi e o céu fica magenta. Luz difusa, sem sombra, mais escura a cada minuto. */
const AFTERGLOW: Partial<World3DParams> = {
  lift: 0.86,
  ambient: 8.5,
  ambientColor: '#cdb4d6',
  moon: 1.8,
  moonColor: '#ffa08c',
  lightCap: 2.1,
  moonShadowAlpha: 0.08,
  moonShadowLength: 2.6,
  shadowTint: '#3e3478',
  skyColor: '#93527e',
  haze: 0.95,
  air: 3.2,
  airColor: '#e88cac',
  airOpen: 0.16,
  mist: 1.8,
  fireflies: 0.8,
  stars: 0.18,
  clouds: 0.4,
  waterSkyColor: '#72609f',
  waterCloudColor: '#f29ca4',
  glintColor: '#f0b8cc',
  grade: 0.56,
  saturation: 1.02,
  contrast: 1.06,
  shadeSat: 0.2,
  vignette: 0.22,
  bloomStrength: 0.28,
  bloomThreshold: 1.05,
  heroSight: 0.05,
  heroSightGlow: 0.04,
  heroLight: 6,
  fireIntensity: 230,
  fireGlowStrength: 0.5,
};

/** A HORA AZUL: o anil saturado depois do arrebol. As primeiras estrelas; as janelas e os vaga-lumes acendem. */
const BLUE_DUSK: Partial<World3DParams> = {
  // Mais clara que a noite (o céu ainda dá luz) e bem mais azul: o azul vem do split-tone e da distância, nunca de uma
  // luz azul forte (ela pinta as árvores de turquesa).
  lift: 0.9,
  ambient: 8.6,
  ambientColor: '#9fb1e2',
  moon: 2.6,
  moonColor: '#8ea2d2',
  moonShadowAlpha: 0.12,
  skyColor: '#1b2a5e',
  haze: 0.78,
  air: 2.6,
  airColor: '#7088e0',
  airOpen: 0.1,
  fireflies: 2.4,
  stars: 0.7,
  waterSkyColor: '#364c84',
  waterCloudColor: '#62729e',
  grade: 0.58,
  saturation: 1.0,
  heroSight: 0.2,
  heroSightGlow: 0.15,
};

/**
 * A TRILHA DO DIA, em ordem de hora. Entre dois momentos o quadro anda em linha reta; dois iguais seguidos são um
 * patamar (a noite fechada, o meio-dia). O sol cruza o horizonte às 6h e às 18h (WorldLook.applySky).
 */
export const SKY_TRACK: readonly SkyMoment[] = [
  { name: 'noite', at: 0, sky: NIGHT, shadow: NIGHT_SHADOW, high: NIGHT_HIGH },
  { name: 'noite', at: 4.25, sky: NIGHT, shadow: NIGHT_SHADOW, high: NIGHT_HIGH },
  { name: 'madrugada', at: 5.1, sky: BLUE_DAWN, shadow: [0.8, 0.92, 1.28], high: [0.98, 1.02, 1.1] },
  { name: 'aurora', at: 5.7, sky: AURORA, shadow: [0.86, 0.87, 1.26], high: [1.16, 0.98, 1.04] },
  { name: 'nascer do sol', at: 6.25, sky: SUNRISE, shadow: [0.86, 0.87, 1.22], high: [1.24, 1.02, 0.86] },
  { name: 'manhã cedo', at: 7.5, sky: EARLY, shadow: [0.84, 0.92, 1.21], high: [1.2, 1.06, 0.82] },
  { name: 'manhã', at: 9.5, sky: MORNING, shadow: [0.81, 0.94, 1.24], high: [1.14, 1.07, 0.88] },
  { name: 'meio-dia', at: 12, sky: DAY_SKY, shadow: NOON_SHADOW, high: NOON_HIGH },
  { name: 'meio-dia', at: 13, sky: DAY_SKY, shadow: NOON_SHADOW, high: NOON_HIGH },
  { name: 'tarde', at: 15.25, sky: AFTERNOON, shadow: [0.86, 0.92, 1.18], high: [1.27, 1.05, 0.68] },
  { name: 'hora dourada', at: 16.75, sky: GOLDEN_HOUR, shadow: [0.86, 0.88, 1.2], high: [1.26, 1.04, 0.72] },
  { name: 'pôr do sol', at: 17.8, sky: SUNSET, shadow: [0.9, 0.84, 1.2], high: [1.27, 1.02, 0.7] },
  { name: 'crepúsculo', at: 18.4, sky: AFTERGLOW, shadow: [0.88, 0.84, 1.28], high: [1.2, 0.96, 1.02] },
  { name: 'hora azul', at: 19.2, sky: BLUE_DUSK, shadow: [0.78, 0.9, 1.34], high: [0.93, 1.0, 1.2] },
  { name: 'noite', at: 20.25, sky: NIGHT, shadow: NIGHT_SHADOW, high: NIGHT_HIGH },
];

/** Todo knob que algum momento escreve: é o que a noite de fábrica precisa guardar (WorldLook.applySky). */
export const SKY_KEYS: ReadonlyArray<keyof World3DParams> = [
  ...new Set(SKY_TRACK.flatMap((m) => Object.keys(m.sky))),
] as Array<keyof World3DParams>;

/**
 * Entre quais dois momentos a hora `time` (0..1 do mostrador) está, e o quanto já andou do primeiro ao segundo (0..1).
 * Depois do último momento a trilha dá a volta ao primeiro do dia seguinte.
 */
export const skyMomentsAt = (time: number): { from: SkyMoment; to: SkyMoment; mix: number } => {
  const hour = (((time % 1) + 1) % 1) * 24;
  let i = SKY_TRACK.length - 1;
  while (i > 0 && SKY_TRACK[i].at > hour) i -= 1;
  const from = SKY_TRACK[i];
  const to = SKY_TRACK[(i + 1) % SKY_TRACK.length];
  const span = (i + 1 < SKY_TRACK.length ? to.at : to.at + 24) - from.at;
  return { from, to, mix: span > 0 ? Math.min(1, Math.max(0, (hour - from.at) / span)) : 0 };
};

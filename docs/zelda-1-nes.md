# Como funciona o Zelda 1 (NES, 1986) — pesquisa técnica e de design

> Documento de referência. Cobre o jogo em quatro camadas: **história**, **estrutura do mundo**,
> **regras de jogo (números reais)** e **implementação no cartucho**. Cada seção diz de onde vem o
> número — porque metade do que se repete sobre esse jogo é folclore, e a outra metade está numa
> desmontagem do ROM.
>
> **Confiabilidade:** o que vem de desmontagem/ROM map (Data Crystal, Red Candle, NESdev,
> `zelda1-disassembly`) é verificável no binário. O que vem de wikis de fã e da comunidade de
> speedrun (tabelas de HP, taxas percentuais de drop) é medido na prática e amplamente
> reproduzido, mas não é fonte primária — está marcado onde importa. Índice de fontes no fim.

---

## 1. Ficha técnica

| | |
|---|---|
| Título original (JP) | *The Hyrule Fantasy: Zelda no Densetsu* — o subtítulo "Hyrule Fantasy" só existiu na caixa japonesa |
| Estreia | **21 de fevereiro de 1986**, Japão, **Family Computer Disk System** (lançou junto com o próprio Disk System) |
| América do Norte | **22 de agosto de 1987**, cartucho NES |
| Europa/PAL | 15 de novembro de 1987 |
| Cartucho japonês | 19 de fevereiro de 1994, como *Zelda no Densetsu 1* |
| Direção / design | Shigeru Miyamoto e Takashi Tezuka |
| Produção | Shigeru Miyamoto |
| Programação | Toshihiko Nakago (SRD), Yasunari Soejima, I. Marui |
| Roteiro | Takashi Tezuka, Keiji Terui (roteirista de anime) |
| Música | Koji Kondo |
| Início do desenvolvimento | outono de 1984 — **antes** de *Super Mario Bros.*, em paralelo com ele |
| Mapper do cartucho | **MMC1**, com RAM mantida por bateria |
| Vendas | 1,69 milhão (FDS JP) · 3 milhões de cartuchos nos EUA até 1990 · **6,51 milhões** no total |

O cartucho NES foi **o primeiro do console com save por bateria** — três arquivos, cada um com um
nome registrado pelo jogador. Isso não é trivia: o jogo inteiro é desenhado em torno de sessões
longas e interrompidas, o que era impossível na geração anterior.

---

## 2. Como o jogo nasceu

### 2.1 A intenção declarada

Miyamoto, em 1989:

> "Eu queria criar um mundo de jogo que transmitisse a mesma sensação que você tem quando está
> explorando uma cidade nova pela primeira vez."

E que o jogador "se identificasse com o personagem e ficasse **completamente perdido e imerso**
naquele mundo". Ele também registra a dificuldade central: fazer um RPG em tempo real com aquela
memória e ainda ter conteúdo satisfatório foi "um desafio enorme".

Nas entrevistas do NES Classic Mini (2016), o resto do quadro:

- **A referência não era RPG de mesa, era cinema de aventura** — filmes de aventura da época,
  Indiana Jones explicitamente. O tema declarado foi "espada e feitiçaria" com caça ao tesouro.
- **O jogo foi desenhado para a conversa entre jogadores.** Miyamoto observou que quem jogava RPG
  de computador na época "se gabava de quão forte o espadachim tinha ficado, e ligava um para o
  outro à noite para trocar informação". O segredo escondido existe **para ser contado a alguém**.
- **"It's a secret to everybody"** é frase escrita pelo próprio Miyamoto, que se orgulhava de ter
  cabido o sentido certo em pouquíssimo texto: um segredo entre o jogador e o inimigo, escondido
  tanto dos amigos quanto dos outros Moblins.
- **Rupee** foi escolhido pelo som, não pela moeda indiana — Miyamoto diz que são "mais parecidas
  com rubis".
- **O mapa-dica selado** que vinha no cartucho ocidental trazia o aviso "use apenas como último
  recurso". A dificuldade do jogo era assumida como parte do produto.

### 2.2 O acidente do Boléro

Kondo tinha arranjado o *Boléro* de Ravel para o tema de abertura. Descobriu-se, em novembro de
1985, que a obra ainda não estava em domínio público no Japão — faltavam **11 meses** para os 50
anos da morte de Ravel. Kondo compôs o tema do overworld que todo mundo conhece **em um dia**,
sob prazo.

### 2.3 Mario e Zelda como opostos deliberados

O mesmo núcleo fez os dois jogos ao mesmo tempo e os separou de propósito: *Mario* ficou linear,
cinético e legível; *Zelda* ficou aberto, contemplativo e silenciosamente hostil. *Zelda* começou
primeiro e saiu depois, porque esperava o Disk System.

---

## 3. A estrutura do mundo

### 3.1 O overworld em números

| medida | valor |
|---|---|
| Grade de telas | **16 × 8 = 128 telas** |
| Tamanho total | 4096 × 1344 pixels = 256 × 88 tiles |
| Uma tela | **16 × 11 tiles** = 256 × 176 pixels (a linha de baixo só mostra meia altura) |
| Um tile | 16 × 16 pixels — inclusive o Link |
| Paleta do overworld | 7 cores: azul (32,56,236) · branco (252,252,252) · marrom (200,76,12) · verde (0,168,0) · cinza (116,116,116) · bege (252,216,168) · preto |

**Não há câmera.** A transição é *flip-scroll*: ao tocar a borda, a tela inteira desliza para a
vizinha e o jogo continua. Isso é uma decisão de design tanto quanto técnica — a tela é a unidade
de espaço, e o jogador aprende o mundo como um **tabuleiro de 128 casas memorizáveis**, não como
uma paisagem contínua. Miyamoto desenhou essa geografia a partir da própria infância explorando
encostas e cavernas em Sonobe.

### 3.2 O underworld

- O interior de uma sala de dungeon é **12 × 7 blocos** — paredes e portas são tratadas à parte,
  por fora dessa grade.
- **As dungeons compartilham grades.** Os níveis 1 a 6 se encaixam juntos, como peças, dentro de
  **uma** grade de 16 × 8 salas; os níveis 7 a 9 se encaixam em outra. Cada nível é, no ROM, um
  recorte marcado dentro de um mapa comum. Isso é economia pura de memória — e é por isso que
  duas dungeons nunca têm salas realmente sobrepostas.

### 3.3 As nove dungeons

| # | Nome | Forma do mapa |
|---|---|---|
| 1 | The Eagle | águia |
| 2 | The Moon | lua |
| 3 | The Manji | suástica budista (manji) |
| 4 | The Snake | cobra |
| 5 | The Lizard | lagarto |
| 6 | The Dragon | dragão |
| 7 | The Demon | demônio |
| 8 | The Lion | leão |
| 9 | Death Mountain | caveira |

O mapa de quase toda dungeon **desenha o nome dela**. É a primeira vez que a série faz o mapa ser
um objeto legível e não só um grafo de salas.

Conteúdo padrão de um nível: **mapa**, **bússola**, um **item novo**, chaves, um **boss** e um
fragmento da Triforce (níveis 1–8). O nível 9 não tem fragmento: tem Ganon e a flecha de prata.

**Entradas no primeiro quest** (coordenadas na grade clássica A–P × 1–8 usada pelos guias):

| Nível | Coord. | Como entrar |
|---|---|---|
| 1 | H5 | acessível de cara |
| 2 | M5 | acessível de cara |
| 3 | E1 | — |
| 4 | F4 | precisa da **balsa** |
| 5 | L8 | atravessar as **Lost Hills** (sequência de direções) |
| 6 | C6 | — |
| 7 | C4 | tocar o **apito/recorder** no lago |
| 8 | N2 | **queimar** um arbusto isolado com a vela |
| 9 | F8 | **bombardear** a rocha certa (Spectacle Rock) — exige as 8 Triforces |

### 3.4 A anatomia de uma dungeon

A análise de level design mais citada descreve a forma recorrente como **"corpo de aranha com
pernas"**: a entrada leva a um corpo central que distribui vários caminhos; alguns trancados,
outros não. O achado importante é este —

> **o caminho crítico é quase sempre linear.** A sensação de exploração vem das *pernas* (salas
> opcionais que se destacam do corpo), não de o mapa ser realmente não-linear.

Ou seja: o jogo compra a sensação de liberdade com ramificações baratas e mantém o jogador sem se
perder. Outras observações da mesma análise:

- **Gating por item dentro da dungeon.** O nível 4 não deixa o jogador seguir enquanto ele não
  pega a escada na sala 8. Zeldas posteriores corrigiram isso pondo o item obrigatório *no*
  caminho crítico em vez de num galho opcional.
- **Nenhum encontro se repete.** A dificuldade sobe por *arranjo*, não por quantidade: cinco
  Stalfos numa sala podem ser mais fáceis que três em outra, dependendo de onde estão os
  bloqueadores e de quanto espaço tático sobra.
- **As "salas pretas" são o sistema de treino** — o velho com a dica. E aí mora o defeito
  histórico: a versão japonesa dava conselho tático útil ("você precisa de dinheiro para atirar
  flechas"), e a tradução inglesa virou charada ("eastmost peninsula is the secret"). O sistema de
  ensino existia; a localização o quebrou.

### 3.5 Portas e travas

- porta aberta
- porta de **chave**
- porta **bombardeável** (parede falsa — o vício mais criticado do jogo: paredes sem nenhuma pista)
- **shutter**: fecha sozinha e só reabre quando a sala é limpa ou o bloco certo é empurrado
- **salas escuras**, que exigem a vela
- **blocos empurráveis**, com um som de segredo confirmando o acerto

---

## 4. Progressão, itens e economia

### 4.1 O arco de poder

| Eixo | Degraus |
|---|---|
| Espada | madeira (dano **1**) → branca, com 5 corações (dano **2**) → mágica, com 12 corações (dano **4**) |
| Defesa | escudo pequeno → escudo mágico → **anel azul** (metade do dano recebido) → **anel vermelho** (um quarto) |
| Vida | até **16 corações** |
| Carteira | até **255 rupias** |
| Bombas | 8 → até 16 com upgrades |

Itens-chave: arco (**cada flecha custa rupia**), flecha de prata (única arma que mata Ganon), vela
azul/vermelha (a azul só acende uma vez por tela), bumerangue e bumerangue mágico, isca, poção
azul/vermelha, carta (libera a compra de poção), vara mágica, livro de magia (fogo na vara),
**balsa**, **escada**, bracelete de força, chave mágica (infinita), **apito/recorder**.

### 4.2 A regra de combate que vira recompensa

**Com a vida cheia, a espada dispara um feixe.** É a mesma espada — o que muda é o estado do
jogador. Isso transforma "não levar dano" de higiene em **poder**: quem está inteiro luta a
distância, quem apanhou luta corpo a corpo. Uma regra, dois estilos de jogo, zero UI.

O contador de drops faz a mesma aposta por outro caminho (§5.2): **10 mortes sem levar dano** força
um drop garantido.

---

## 5. As regras de combate (números do motor)

Fonte: desmontagem/documentação técnica (Red Candle, Data Crystal). Estes são os números do
binário, não estimativas.

### 5.1 Objetos, movimento e dano

- **19 slots de objeto**, com índices fixos: `#$00` = Link; `#$01–0B` = objetos dinâmicos
  (inimigos, projéteis, NPCs); `#$0D` = espada; `#$0E` = feixe da espada/vara; `#$0F` =
  bumerangue/isca; `#$10–11` = chamas e bombas; `#$12` = vara/flecha; `#$13` = tesouro da sala.
- **Movimento em grade:** os objetos andam sobre uma grade de **16 px**; o Link, sobre uma de
  **8 px**. Fora dos vértices o movimento fica preso às arestas — é isso que dá o "trilho" tão
  característico do jogo. Desvio máximo do subgrid: ±8 px para o Link, ±16 px para inimigos.
- **4 ticks de movimento por frame**; velocidade máxima ~4 px.
- Ao virar perpendicularmente, o objeto **herda a posição de subpixel** — origem de várias
  esquisitices de alinhamento.
- **Vida** (`$0485`) é armazenada em **múltiplos de `#$10`**, com máximo efetivo **15**.
- **Knockback** (`$D3`): 1 pixel por tick, portanto 4 px/frame — quase três vezes a velocidade
  normal de caminhada (~1,5 px/frame). É por isso que apanhar te *arremessa*.
- **i-frames** (`$04F0`) existem dos dois lados: o Link e os inimigos. Você pode girar a espada o
  quanto quiser; o inimigo não aceita dano nessa taxa (e nem você).

### 5.2 Imunidades — a tabela que faz cada inimigo ser um enigma

Cada objeto carrega uma máscara de bits em `$04B2`:

| bit | arma |
|---|---|
| 0 | espada |
| 1 | bumerangue |
| 2 | flecha |
| 3 | bomba |
| 4 | vara |
| 5 | chama |

E a regra que explica metade do bestiário:

> **Se a vida é 0 e o objeto é atingido por qualquer arma à qual não seja imune, ele morre — mesmo
> que a arma cause 0 de dano.**

É assim que o bumerangue mata Keese e Gel (vida 0) sem causar dano nenhum. A ordem de checagem de
armas por frame é fixa: bumerangue → feixe → chama/bomba slot A → slot B → espada → flecha/vara.

### 5.3 Bestiário (HP em golpes de espada de madeira)

Tabela de comunidade (Mike's RPG Center), consistente com a leitura de que 1 HP = 1 golpe da
espada de madeira. Onde há duas variantes, a primeira é a fraca (vermelha).

**Overworld**

| Inimigo | HP | Comportamento |
|---|---|---|
| Octorok vermelho / azul | 1 / 2 | cospem pedra; a pedra é bloqueável pelo escudo |
| Tektite vermelho / azul | 1 / 1 | pulos erráticos; bumerangue atordoa |
| Leever vermelho / azul | 2 / 4 | brotam do chão; o vermelho vem reto até você, o azul anda aleatório |
| Peahat | 2 | **só pode ser ferido quando para de girar** |
| Moblin vermelho / azul | 2 / 3 | lança bloqueável |
| Zola | 2 | ataca da água e regenera |
| Armos | 3 | estátua que acorda quando você chega perto |
| Lynel vermelho / azul | 4 / 6 | atira feixes de espada; só o escudo mágico bloqueia |
| Ghini | 9 | fantasma do cemitério |

**Underworld e chefes**

| Inimigo | HP | Comportamento |
|---|---|---|
| Gel / Keese | 1 / 1 | morrem de bumerangue (vida 0 + não imune) |
| Rope | 1 | investe quando fica alinhado com você |
| Zol | 2 | **divide-se em dois Gels** ao ser ferido |
| Stalfos | 2 | nas dungeons finais também atira espada |
| Wall Master | 2 | agarra e te devolve à **entrada da dungeon** |
| Goriya vermelho / azul | 3 / 5 | bumerangue bloqueável |
| Darknut vermelho / azul | 4 / 8 | **só ferível pelas costas ou pelos lados** |
| Vire | 4 | divide-se em dois Keese |
| Wizzrobe vermelho / azul | 4 / 10 | o vermelho só é vulnerável enquanto visível |
| Gibdo | 7 | múmia |
| Like Like | 9 | **come o escudo mágico** |
| Pols Voice | 10 | morre com **uma flecha** (e, no FDS, com o microfone do 2º controle) |
| Aquamentus | 6 | boss; acerte a cabeça |
| Gohma vermelho / azul | 2 / 6 | boss; **só a flecha, no olho aberto** |
| Dodongo | — | boss; engole bombas — duas bombas, ou bomba + espada |
| Digdogger | 8 | boss; **o recorder** o parte e o torna vulnerável |
| Manhandla | 4 por boca | acelera conforme perde bocas |
| Gleeok | 10 + 6 por cabeça | as cabeças se soltam e continuam atirando |
| Moldorm | 11 | encolhe conforme apanha |
| Lanmola | 2 por segmento | serpente segmentada |
| Patra | 6–11 | os satélites precisam morrer primeiro |
| Bubble | — | **indestrutível**; desarma sua espada temporariamente (vermelho = permanente até um azul te curar) |
| Trap / estátua | — | indestrutível; dispara quando alinhado |

O padrão de design é notável: **quase todo chefe é uma trava com uma chave específica** — flecha
para Gohma, recorder para Digdogger, bomba para Dodongo. O jogo passa nove dungeons ensinando que
o item novo é a resposta, e o corredor final (Ganon → flecha de prata) é a última repetição da
mesma frase.

---

## 6. Drops: o sistema aleatório que quase não é aleatório

Esta é a parte do jogo que mais surpreende quem só jogou.

### 6.1 O contador cíclico

Existe um **contador global de mortes** que começa em 0 no boot e sobe 1 a cada inimigo morto
(inimigos gerados por outros inimigos não contam). Ele cicla em **10 posições**. Cada inimigo
pertence a um **grupo de drop**:

| grupo | o que pode cair |
|---|---|
| A | rupia |
| B | bomba (nas posições 1, 6 e 8 do ciclo) |
| C | rupia de 5 |
| D | fada |
| **X** | **nada** — mas o inimigo ainda gasta uma posição do contador |

O que cai não é sorteio: é **a posição atual do ciclo cruzada com o grupo do inimigo**. Duas
consequências práticas, e ambas são design:

1. **A ordem em que você mata as coisas determina o que você ganha.** Speedrunners planejam a
   sequência de mortes como se fosse rota de item.
2. **Um inimigo do grupo X é um imposto**: ele queima uma posição do ciclo e não paga nada.

Taxas agregadas medidas pela comunidade: grupo A ≈ 31%, B ≈ 41%, C ≈ 59%, D ≈ 41% de chance de
largar algo.

### 6.2 Os drops forçados (a recompensa por não apanhar)

Sobrepostos ao ciclo, dois contadores separados:

- **`$50` — mortes consecutivas sem levar dano.** Ao chegar a **10**, o próximo inimigo capaz de
  largar algo **larga uma rupia azul (5) garantida**.
- **`$51` — flag de bomba.** Se a décima morte foi **por bomba**, o drop garantido vira **uma
  bomba** em vez da rupia. (E se o décimo inimigo era do grupo X, a promessa fica pendurada: o
  próximo drop real é que vira bomba.)
- **`$0627` — contador de fada.** Ao chegar a **16**, força **uma fada**. Depois disso o padrão
  segue em 26, 36, 46...; se você *não* pegar a fada dos 16, o ciclo passa a 20, 30, 40.
- **Prioridade:** fada (16) > bomba/rupia (10) > drop aleatório do ciclo.

**Casos especiais que a desmontagem registra:**

- Matar um **Dodongo** com a espada seta o contador de dez para 10 **e** liga a flag de bomba — é
  uma fonte de bombas embutida no chefe que *come* bombas.
- Inimigos vulneráveis mas immortais contam como morte **a cada frame** em que a arma os toca.
- Inimigos de múltiplas partes contam cada parte; a morte final não conta duas vezes.
- **Zols ficam vulneráveis um frame a mais** depois de dividir, por causa de um bug em que o Zol
  se apaga antes de gerar os Gels.
- O contador de fada é de 8 bits: **estoura em 256 mortes**.
- Gels e Keese nascidos de uma divisão **não contam** para o contador cíclico, mas **contam** para
  o de mortes consecutivas. Os dois contadores discordam de propósito.

---

## 7. Os segredos do overworld

O overworld é uma **superfície com furos**. Os verbos de descoberta são poucos e o jogo nunca diz
nenhum deles:

| verbo | o que revela |
|---|---|
| **bombardear** paredes de rocha e penhascos | cavernas, lojas, containers de coração, entradas de dungeon |
| **queimar** arbustos com a vela | escadas escondidas, incluindo entradas de dungeon |
| **empurrar** lápides no cemitério | escadas subterrâneas |
| **empurrar** estátuas Armos | itens (o bracelete de força está sob uma) e dicas |
| **tocar o recorder** | seca o lago do nível 7; fora disso, teleporta entre entradas de dungeon |
| **andar a sequência certa** | Lost Woods e Lost Hills: a direção errada devolve você à mesma tela |

Tipos de caverna: velho que dá item, velho que dá dica, loja, **"pay me for the door repair
charge"** (o velho que simplesmente te cobra), o **jogo de aposta** (escolha um de três baús),
e a **fonte de fadas**, que cura tudo.

Em 128 telas há **9 entradas de dungeon**, fontes de fada e mais de vinte cavernas escondidas. A
densidade é o ponto: qualquer tela pode ter algo, e nada na arte promete.

---

## 8. O Second Quest

Terminando o jogo (ou registrando o nome **ZELDA** na segunda linha da tela de nome) abre-se um
jogo novo:

- **O overworld é o mesmo mapa** — mas as aberturas mudam de lugar: outras paredes bombardeáveis,
  outros arbustos, outras entradas.
- **As nove dungeons são inteiramente novas**, não remixes.
- **Inimigos mais fortes aparecem muito mais cedo**, e alguns ganham truques novos.
- Containers de coração e lojas mudam de lugar.
- Aparecem **paredes atravessáveis** sem nenhuma pista visual — a decisão mais cruel do jogo, e a
  mais citada como onde o desenho passa do ponto.

Historicamente isso é notável por duas razões: era raríssimo um jogo de 1986 ter um "new game +"
com conteúdo original, e ele existe basicamente porque **sobrou espaço** — a restrição virou
feature.

---

## 9. Como o cartucho faz isso caber

### 9.1 Compressão do overworld: uma tela = 16 bytes

O jogo **não guarda tiles com coordenadas**. Ele guarda **colunas**:

- Existem pouco menos de **256 "metasprites" de coluna**, cada um com **16 px de largura por 176
  px de altura** — a altura inteira da área de jogo.
- Uma tela é, então, **16 bytes**: um índice de coluna por faixa vertical.
- As colunas são **reusadas agressivamente** entre telas. Repetição não é preguiça de arte: é o
  formato de arquivo.
- A cor não vai junto: cada tela escolhe **um esquema de cor para a borda** (entre três) e um para
  o centro. O mesmo pedaço de mata pode ser verde numa tela e marrom em outra.

128 telas × 16 bytes = **2 KB** para o mapa físico do mundo inteiro.

### 9.2 Salas de dungeon

- O interior de uma sala é **12 × 7 blocos**, definido por **12 bytes** — de novo, um por coluna,
  cada byte um índice numa tabela de grupos predefinidos.
- Paredes externas e portas são comuns a todas as salas e ficam guardadas uma vez só.
- O layout de renderização da sala é descrito em 32 faixas verticais de 22 tiles.
- Os níveis 1–6 são recortes de uma grade compartilhada de 16 × 8 salas; 7–9, de outra.

Por nível, o ROM guarda também: quatro paletas de imagem (sub-tela, mapa/texto, paredes/chão, chão
líquido), quatro paletas de sprite (Link, inimigos, NPCs, blocos), contagem de monstros, tiles de
item, offsets de coordenada de mapa, IDs de sala (entrada, sala da Triforce, sala do boss), lista
de escadas, o mapa desenhado (16 colunas) e as paletas das sequências de fade (escada, volta do
porão, salas escurecidas, espiral de morte).

### 9.3 Mapa de RAM (endereços úteis)

| endereço | significado |
|---|---|
| `$10` | nível atual (0 = overworld) |
| `$12` | modo de jogo (título, seleção, jogo normal…) |
| `$EB` | posição no mapa — fórmula `x + 0x10 × y` |
| `$0657` | espada atual (0 nenhuma, 1 madeira, 2 branca, 3 mágica) |
| `$0658` | bombas |
| `$0659` | flecha (0/1/2 = nenhuma/normal/prata) |
| `$065A–$0666` | arco, velas, apito, comida, poção, vara, balsa, livro, anel, escada, chave mágica, bracelete, carta |
| `$066D` / `$066E` | rupias / chaves |
| `$066F` | corações — **nibble baixo = corações cheios, nibble alto = containers − 1** |
| `$0350–$035B` | tipos dos inimigos nos slots |
| `$71–$76` / `$85–$8A` | X / Y dos inimigos |
| `$52A` | contador cíclico de mortes (reseta depois de 9) |
| `$50` | mortes consecutivas sem dano (reseta em 10) |
| `$0627` | contador de fada |
| `$29–$2E` | timers de ação dos 6 inimigos |

### 9.4 Dois bugs famosos que a desmontagem explica

- **Corrupção gráfica na entrada da dungeon.** Entrar numa dungeon no mesmo frame em que um bloco
  de fundo muda tem **50% de chance** de embaralhar o gráfico: o registrador de incremento da PPU
  fica com o valor errado e a escrita atravessa a VRAM, corrompendo **1 byte a cada 32**.
- **Screen scroll (o glitch de speedrun).** O Link pode pular a checagem de colisão de vértice
  quando o offset é 0, usando o **knockback** — que o move a 4 px/frame contra os ~1,5 px/frame da
  caminhada. É assim que se atravessa bloco de dungeon e obstáculo do overworld sem limpar a sala.

---

## 10. O que este jogo tem a ensinar (leitura de design)

Recortes que sobrevivem fora do NES — e que vale confrontar com qualquer jogo top-down de hoje:

1. **A tela é a unidade de espaço.** Sem câmera contínua, cada tela é uma composição fechada, com
   entrada, saída e uma ideia. Isso força o designer a ter uma ideia por tela, e dá ao jogador um
   mapa mental feito de casas, não de coordenadas.
2. **O mapa é o texto.** As dungeons desenham o próprio nome; o overworld é geografia memorável
   (lago, deserto, cemitério, montanha) e não terreno genérico. Um mapa que se descreve dispensa
   legenda.
3. **A ilusão de abertura custa barato.** "Corpo de aranha com pernas": espinha linear + galhos
   opcionais. O jogador sente que escolheu; o designer sabe onde ele está.
4. **Quase toda trava tem exatamente uma chave** — e esse é, ao mesmo tempo, o motor e o teto do
   jogo. Onde ele escapa disso (a espada com vida cheia, o contador de drops, o Zol que se divide,
   o fogo da vela que revela escada), o jogo fica muito mais interessante do que em qualquer porta
   com chave.
5. **A recompensa por não apanhar é um sistema, não um placar.** Vida cheia = feixe de espada; 10
   mortes limpas = drop garantido. O jogo remunera a competência com *poder*, imediatamente,
   dentro da mesma cena.
6. **A aleatoriedade é uma tabela.** Os drops parecem sorte e são um ciclo de 10 posições. Isso dá
   ao especialista algo para dominar sem tirar do novato a sensação de acaso — um truque que vale
   copiar inteiro.
7. **O segredo existe para ser contado.** O jogo foi desenhado no pressuposto de que jogadores
   falam entre si. Esconder informação só funciona quando existe um canal social — e a versão
   ocidental provou o contrário: dicas mal traduzidas viraram charadas insolúveis, e a "dificuldade
   lendária" do Zelda 1 é, em boa parte, um bug de localização.
8. **O que o jogo se recusa a dizer, ele precisa mostrar.** A crítica mais durável ao Zelda 1 são
   as paredes bombardeáveis sem pista nenhuma — a fronteira exata entre "mistério" e "tentativa e
   erro". Segredo sem affordance é loteria.

---

## 11. Fontes

**Primárias / técnicas**

- [The Legend of Zelda — Technical Information (Red Candle)](https://redcandle.us/Legend_of_Zelda/Technical_Information) — slots de objeto, grid de movimento, imunidades, drops forçados, glitches
- [Data Crystal — The Legend of Zelda / RAM map](https://datacrystal.tcrf.net/wiki/The_Legend_of_Zelda/RAM_map)
- [Data Crystal — The Legend of Zelda / ROM map](https://datacrystal.tcrf.net/wiki/The_Legend_of_Zelda/ROM_map)
- [Data Crystal — Dungeon Data](https://datacrystal.tcrf.net/wiki/The_Legend_of_Zelda/Dungeon_Data) — paletas, IDs de sala, escadas, mapas por nível
- [aldonunez/zelda1-disassembly (GitHub)](https://github.com/aldonunez/zelda1-disassembly) — desmontagem completa, ca65
- [NESdev Forum — Level data storage](https://forums.nesdev.org/viewtopic.php?t=15387) — colunas de 16×176 px, 16 bytes por tela, grades 16×8 compartilhadas, interior 12×7
- [NESdev Wiki — Level compression](https://wiki.nesdev.org/w/index.php/Level_compression)
- [Invent with Python — 8-bit NES Legend of Zelda Map Data](https://inventwithpython.com/blog/8-bit-nes-legend-of-zelda-map-data.html) — dimensões e paleta do overworld

**Mecânicas / comunidade**

- [ZeldaSpeedRuns — Item Drops Chart](https://www.zeldaspeedruns.com/loz/generalknowledge/item-drops-chart)
- [ZeldaSpeedRuns — Forced Item Drops](https://www.zeldaspeedruns.com/loz/tech/forced-item-drops)
- [SDA Knowledge Base — The Legend of Zelda](https://kb.speeddemosarchive.com/The_Legend_of_Zelda) — contadores, casos de borda, screen scroll
- [Zelda Dungeon — Item Drop Rates](https://www.zeldadungeon.net/wiki/Item_Drop_Rates_(The_Legend_of_Zelda))
- [Mike's RPG Center — Enemies](https://mikesrpgcenter.com/zelda/enemies.html) — tabela de HP
- [StrategyWiki — The Legend of Zelda / Enemies](https://strategywiki.org/wiki/The_Legend_of_Zelda/Enemies)
- [Zelda Wiki — Weapon Strength](https://zelda.fandom.com/wiki/Weapon_Strength) — dano 1/2/4 das espadas
- [Zeldapedia — Second Quest](https://zelda-archive.fandom.com/wiki/Second_Quest) · [Name Registration](https://zelda-archive.fandom.com/wiki/Name_Registration)

**Design e história**

- [Wikipedia — The Legend of Zelda (video game)](https://en.wikipedia.org/wiki/The_Legend_of_Zelda_(video_game)) — datas, equipe, vendas, MMC1/bateria
- [Nintendo UK — NES Classic Mini interview, Vol. 4: The Legend of Zelda](https://www.nintendo.com/en-gb/News/2016/November/Nintendo-Classic-Mini-NES-special-interview-Volume-4-The-Legend-of-Zelda-1160048.html) — Indiana Jones, Boléro, "Hyrule Fantasy", "It's a secret to everybody", rupees
- [Game Developer — In 1989, Miyamoto laid out his original design goals for Zelda](https://www.gamedeveloper.com/design/in-1989-miyamoto-laid-out-his-original-design-goals-for-i-zelda-i-)
- [Game Developer — Learning From The Masters: Level Design in The Legend of Zelda](https://www.gamedeveloper.com/design/learning-from-the-masters-level-design-in-i-the-legend-of-zelda-i-) — "spider body and legs", gating, salas pretas
- [Nintendo Everything — Nintendo on Zelda 1](https://nintendoeverything.com/nintendo-on-zelda-1-miyamotos-inspiration-kondos-all-nighter-molblins-famous-message-original-hyrule-fantasy-name/)
- [Zelda Dungeon — The Legend of Zelda Dungeons](https://www.zeldadungeon.net/wiki/The_Legend_of_Zelda_Dungeons) — nomes e formas dos nove níveis
- [Boss Keys (Mark Brown / GMTK)](https://roomescapeartist.com/2017/09/10/boss-keys-analysis-zelda-dungeons/) — análise dos grafos de trava-e-chave da série

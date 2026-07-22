# Game Jam "Count Down" — a estratégia

> **Tese em uma frase:** todo mundo na jam vai desenhar um número no topo da tela. Nós vamos
> desenhar o número **no chão** — a contagem regressiva é um pavio de capim atravessando o mapa,
> o jogador a edita com as próprias mãos, e quando ela chegar a zero… ela chega no **Zero**.

---

## 1. O nome do jogo já é o tema

Toda contagem regressiva termina em zero. O herói **se chama Zero**. Isso não é trocadilho de
página de jam — é a espinha narrativa de graça: *"toda contagem termina no Zero"*. O seletor de
levels conta **para trás** (Level 5, 4, 3, 2, 1…) e o level final é o **Level 0** — aquele em que
a contagem converge para o próprio herói. Nenhuma linha de código nova compra tanta aderência ao
tema quanto essa moldura.

## 2. A vantagem injusta: o jogo já é um relógio

O projeto tem uma regra de alma — *"the world teaches, the HUD does not"* — e por causa dela
**todas** as contagens que já existem são físicas, nunca numéricas:

| contagem que já existe | onde mora | o que ela é na tela |
|---|---|---|
| fogo se espalhando tile a tile | `FIRE_SPREAD_MS` | **um relógio cuja agulha anda pelo mapa** |
| tocha queimando na mão | `TORCH_BURN_MS` | a sua luz morrendo |
| bomba plantada | fusível de 1.6s | o chiado antes do estouro |
| caldeira estocada | ~16s por graveto, ~45s por balde | fumaça na chaminé, visor d'água |
| pressão do vapor | histerese + coast | o portão eletrônico que só fica aberto *enquanto dura* |
| bateria no chão | ~20s de rede viva (`BATTERY_FEED_MS`) | **20 segundos engarrafados num item** |
| mato plantado | ~3.5s até brotar | o montinho virando parede |
| roda d'água desacelerando | inércia + coast | o dínamo apagando devagar |

O tema da jam é literalmente o que este projeto já faz por filosofia. A estratégia não é
*adicionar* um sistema de countdown — é **apontar os holofotes para os que já existem**.

## 3. O conceito: "O PAVIO" — tempo é espaço

A sacada central, e o que nenhum outro jogo da jam vai ter:

**`FIRE_SPREAD_MS` por tile transforma tempo em geografia.** Um corredor de capim de 10 tiles é
uma contagem de 10 batidas. O jogador não *lê* o tempo restante num HUD — ele **conta os tiles**.
E, mais importante: ele não assiste ao relógio. Ele **edita o relógio**:

- **foice** corta capim → *remove segundos* (ou corta o pavio inteiro → desarma)
- **plantar + regar** → *adiciona segundos* — e plantar leva tempo real, então **comprar tempo
  custa tempo** (essa frase sozinha ganha prêmio de design em jam)
- **balde** → apaga → pausa/cancela
- **ponte de madeira** → o relógio *atravessa* o rio; **vau de pedra** → o relógio *não atravessa*
  (a escolha piso-ou-pavio que já existe vira uma escolha sobre o tempo)
- **braço robótico** → o relógio *pula um muro* (graveto aceso entregue do outro lado)
- **fogueira acesa** → sumidouro: onde a contagem morre

E o **zero** — o momento em que a chama chega ao destino — já tem consequências prontas no jogo:
acende uma fogueira morta, pressuriza uma caldeira, detona um bombSpot, queima uma ponte, abre um
portão de bater via capim. Cada level escolhe o que "chegar a zero" significa.

## 4. As duas metades do arco: DESARMAR e ENTREGAR

"Count down" tem duas leituras, e o jogo usa as duas:

- **Desarme** — a contagem corre *contra* você. O fogo já anda; corte o pavio, roube segundos,
  jogue água. (O clássico do tema, feito do nosso jeito.)
- **Entrega** — a contagem corre *por* você. O zero **precisa acontecer**: leve a chama até lá.
  (A inversão que quase ninguém vai fazer: você não desarma a bomba — você **é** o relojoeiro.)

O twist do meio do jogo: um level onde a MESMA chama precisa fazer os dois — queimar o que abre o
caminho sem queimar o que você precisa. O level-1 atual, *"O fogo que ajuda atrapalha"*, já é o
protótipo exato disso; a jam o promove de exceção a espinha dorsal.

## 5. O relógio de dois tempos (por que isso não vira estresse chato)

O defeito clássico do jogo-de-timer de jam é o pânico burro. Nosso antídoto é estrutural — cada
level tem duas fases, e **quem dá a partida no tempo é o jogador**:

1. **Preparação** (sem pressa): o mundo parado. Ler o mapa, contar os tiles, cortar, plantar,
   posicionar o braço, encher o balde.
2. **Ignição** (a contagem): **um único ato irreversível** — encostar a tocha no primeiro tufo —
   e tudo o que foi preparado acontece de uma vez, certo ou errado.

A tensão inteira do jogo mora na pergunta *"acendo agora?"*. É o design de Rube Goldberg: você
constrói o dominó, e o countdown é o dominó caindo.

## 6. Contagem dentro de contagem (a escada de profundidade)

Para os levels finais, os sistemas encadeiam contagens — sem uma linha de código nova:

- O zero do pavio **inicia** a segunda contagem: a chama chega à caldeira → pressão sobe → o
  portão eletrônico abre → e fica aberto só **enquanto o vapor durar**. Atravesse dentro da
  janela do coast.
- A **bateria** é a contagem portátil: 20 segundos de rede na mão do herói, gastos só enquanto
  alimenta — *quando* dockar é a decisão.
- A **tocha** é a contagem pessoal: num level de fogueiras mortas, a sua própria luz é o timer
  que você carrega. (Atenção à restrição: cerco de undead é desligado em level — a pressão aqui
  é o combustível da tocha, não a escuridão.)

## 7. Os levels (contando para trás: 5 → 0)

Todos 12×12, todos autorados à mão no `/lab`, vitória = portal (como hoje). O seletor os
apresenta em contagem regressiva:

| # | nome | o que ensina |
|---|---|---|
| **5 — "Três batidas"** | tutorial: pavio de 3 tiles até uma fogueira morta. Acenda, veja o tempo *andar*, veja o zero acontecer. | tempo = tiles |
| **4 — "Corte"** | o primeiro desarme: o fogo nasce aceso e caminhando; abra um firebreak com a foice antes que alcance a ponte que você precisa. | roubar segundos |
| **3 — "Comprar tempo custa tempo"** | o pavio existente é curto demais para a travessia; plante e regue mais capim ANTES de acender. | adicionar segundos |
| **2 — "O relógio pula o muro"** | braço robótico entrega o graveto aceso do outro lado; o capim de trás abre o portão de bater. | a contagem atravessa onde você não pode |
| **1 — "Tempo engarrafado"** | o zero do pavio pressuriza a caldeira; o portão eletrônico só vive enquanto o vapor durar. Contagem dentro de contagem. | encadear relógios |
| **0 — "Zero"** | o final: dois pavios de comprimentos diferentes, acesos em momentos diferentes, precisam convergir — e o ponto de convergência é o tile onde o herói precisa estar. Toda contagem termina no Zero. | síntese + o título do jogo como última frase |

Ordem de produção (o corte de escopo que salva a jam): **5, 4 e 1 primeiro** — são os três que
provam o arco (aprender / desarmar / encadear). 3, 2 e 0 entram conforme o tempo render.

## 8. O código novo é quase nenhum — e isso é a estratégia, não preguiça

- **Vitória:** o `levelPortal` já é a vitória, com a travessia de quatro atos já polida. O pavio
  não precisa de "win condition" nova — ele **guarda o caminho até o portal**.
- **Derrota:** um pavio gasto errado é softlock — e o botão ↻ com a pill *"Travou? ↻ recomeça o
  level"* já existe exatamente para isso. Perder = recomeçar informado.
- **Fases, fogo, braço, caldeira, fios, bateria, portões:** tudo já embarcado e com playtest
  (`perf-burn`, `braco`, `caldeira`, `fios`, `bateria`, `portao-de-bater`, `portao-eletronico`).

O trabalho da jam é **autoria** (lab) e **polish temático**, não sistemas. Numa jam, o time que
não constrói engine ganha dois dias de level design dos outros.

### O pouco que vale a pena codar (alto ROI temático)

1. **A batida.** Cada spread de fogo ao longo de uma cadeia toca um *tick* curto — e o intervalo
   entre ticks é o próprio `FIRE_SPREAD_MS`, então o pavio **soa** como um relógio andando. Se a
   cadeia restante for curta, o tick sobe de tom: urgência sem HUD. (Síntese no padrão do
   `playArmGrab`: curto, quieto, nunca vira ruído de fundo.)
2. **A brasa quente.** Os últimos 2–3 tiles de uma cadeia queimando brilham mais — o "faltam 3
   segundos" dito em luz, não em número.
3. **Seletor em contagem regressiva.** `index.json` apresentando 5→0; o card de título de cada
   level já existe.

Se sobrar tempo (e só se sobrar): um prop-destino "sino de pedra" para o zero ter um gongo — mas
a fogueira morta acendendo já cumpre o papel.

## 9. O que NÃO fazer (a lista que protege a semana)

- **Nenhum timer numérico na tela.** Se a tentação vier: o jogador conta os tiles. É o jogo.
- **Nenhum sistema novo de física/fogo.** O grafo de combustível existente é o vocabulário todo.
- **Survivors mode fora.** (Um "modo horda com timer" é a ideia genérica que os outros vão fazer.)
- **Nada de undead nos levels** — já é a regra (`isPuzzleWorld()`), e skulls mid-solve são ruído.
- **Não crescer o mapa.** 12×12 é lei: o pavio inteiro cabe numa tela, o jogador lê o relógio
  completo de um olhar — essa legibilidade É a mecânica.
- **Não rodar `generate:levels`.** Nunca. Os levels são à mão, no `/lab`, salvos com Salvar.

### Alternativas consideradas e rejeitadas

- *Speedrun com cronômetro por level* — genérico, viola a filosofia sem-HUD, não usa nada único
  da base.
- *Doom clock global na aventura (o mundo acaba em N minutos)* — forte, mas exige mexer no cerco
  de undead e na aventura inteira; escopo de mês, não de jam.
- *Contagem de recursos ("você tem 10 sementes")* — count down de inventário é contabilidade,
  não tensão.

## 10. Riscos e antídotos

- **`FIRE_SPREAD_MS` pode não ler como "batida"** (rápido demais = pânico, lento demais = tédio).
  É uma constante: tunar cedo, no level 5 ("Três batidas"), antes de autorar os outros.
- **Autoria à mão é o grosso do trabalho.** Por isso a ordem 5-4-1: com três levels o jogo já é
  submissível; cada level extra é lucro.
- **Playtests:** cada level novo ganha o seu cenário pontual (a regra do projeto — nunca replay
  do solve inteiro para mudança pontual). O harness já entra em level por `/?play&level=N`.
- **Flakiness de timing:** os cenários que autoram a própria fixture no `/lab` são os imunes —
  seguir esse padrão (`braco`, `portao-de-bater` são os modelos).

## 11. O pitch de 15 segundos (para a página da jam)

> Todo jogo de contagem regressiva te dá um número e medo. O nosso te dá **o relógio na mão**: a
> contagem é um pavio de capim atravessando o mapa — a foice rouba segundos, a semente compra
> segundos (e comprar tempo custa tempo), o balde pausa, o braço robótico faz o relógio pular o
> muro. Você decide quando o tempo começa. E quando chegar a zero — e ela vai chegar — que chegue
> onde **você** mandou.
>
> **Zero the Hero: toda contagem termina no Zero.**

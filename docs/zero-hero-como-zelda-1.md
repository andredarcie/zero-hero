# Zero the Hero como Zelda 1 — o plano

> **Tese em uma frase:** o Zelda 1 tem a **moldura** que falta a este projeto — um mundo grande,
> nove fechaduras grandes e uma razão para andar; e este projeto tem os **sistemas** que faltavam
> ao Zelda 1 — fogo que se espalha, ferramentas que produzem, máquinas que movem carga. A conversão
> não é reescrever o jogo: é pendurar o que já existe na estrutura do Zelda, e usar a lei da casa
> (*"o mundo ensina, o HUD não"*) para consertar o defeito mais famoso dele.

> Base factual: [`docs/zelda-1-nes.md`](./zelda-1-nes.md) — números do ROM, do bestiário e do design.
> Estado do projeto medido em **2026-07-29**, `main` `b1fc107`. Este documento **substitui**
> [`docs/cozy-open-world.md`](./cozy-open-world.md) como direção do mundo aberto: aquele plano
> propunha uma moldura cozy, este propõe a moldura Zelda. Vários diagnósticos daquele documento
> continuam válidos e são reaproveitados aqui (persistência, morte, economia morta, NPCs sem pedido).

---

## 0. As decisões já tomadas

Não são pontos em aberto. São o contrato deste plano.

| # | Decisão | Consequência imediata |
|---|---|---|
| 1 | **O visual é mantido inteiro** — o 3D real sob pixel art 2D, a mesma câmera, as mesmas luzes | Nenhuma linha do `World3D` muda por design. Tudo aqui é gameplay e conteúdo. |
| 2 | **Mundo aberto contínuo** — sem fatiar em telas, sem flip-scroll, sem troca de sala | A câmera nunca "pula". O chunk continua sendo unidade de **arquivo e streaming**, nunca de jogo. |
| 3 | **Sem HUD** — nada do topo de tela do Zelda (corações, rupias, minimapa) | Todo número do Zelda precisa de um corpo no mundo. §7 é a tabela dessa tradução. |
| 4 | **Dois botões, como o NES: A = espada, B = item selecionado**, com **mochila + subtela de pausa** | Morrem duas leis do `CLAUDE.md`: *walk-only* e *uma mão só*. §2. |
| 5 | **Mundo semeado pelo gerador, esculpido à mão** — 20×8 chunks, seed fixa, autoria no `/editor` | 23.040 tiles ≈ o tamanho exato do overworld do Zelda. §3. |
| 6 | **Dungeons são levels carregados** — arquivo próprio, autoria no `/lab`, entrada pela viagem de portal | Cai a regra "um level é sempre 12×12". Dungeon do Zelda não cabe num chunk. §6. |

---

## 1. O ponto de partida, medido

### 1.1 O que existe hoje

| | hoje | o Zelda 1 |
|---|---|---|
| Mundo | **8×8 chunks = 96×96 = 9.216 tiles** | 256×88 = **22.528 tiles** (128 telas) |
| Props no mundo inteiro | **69** | ~20 cavernas + 9 entradas + centenas de segredos de tile |
| Tipos de prop implementados | **22** (`src/game/objects/`) | ~8 |
| Tipos de inimigo | **1** (`UndeadEnemy`, HP 3, alcance de visão 14) | **~30**, com tabela de imunidade por arma |
| Vida do herói | `PLAYER_HEALTH_MAX = 4`, regenera na fogueira | 3 corações → **16**, sem regeneração |
| Itens carregáveis | **13** (`HeldItemKind`) — um na mão por vez | ~25, mochila permanente |
| Economia | `CoinManager.spawnCoins()` **nunca é chamado** — não há fonte de moeda na aventura | rupias caem de tudo, e a flecha **custa** rupia por tiro |
| Persistência | **nenhuma** — fechar a aba apaga o mundo | 3 arquivos em bateria, o feature de assinatura do cartucho |
| Morte | `scene.restart()` — perde upgrades, moeda, item, toda fogueira acesa | continue/save/retry, **mantém o inventário** |
| HUD | **já não existe** na aventura: contorno vermelho pulsando na vida baixa + bússola de fogo | corações, rupias, chaves, bombas, minimapa, item do B |

### 1.2 O que este projeto tem que o Zelda 1 nunca teve

Isto não é vaidade: é o que impede a conversão de virar um clone pior do original.

- **Fogo que se propaga tile a tile e o jogador dirige** (`scheduleFireSpread`). O Zelda tem uma
  vela que queima **um** arbusto por tela. Aqui o fogo é geografia móvel.
- **Ferramentas que PRODUZEM.** Árvore → graveto; pedra → pedra; capim → sementes; minério → ferro;
  caixa de ferramentas → machado/foice. No Zelda todo item só abre passagem.
- **Máquinas** — braço robótico, caldeira, roda d'água, fios, bateria, portão eletrônico. Nenhuma
  delas tem paralelo em 1986, e todas falam a mesma língua (item no chão, corrente no fio).
- **Iluminação e sombra 3D** que fazem a noite ser uma mecânica, não uma paleta.
- **A borda do mundo já é o mar** — exatamente a fronteira que o Zelda precisou inventar, e pelo
  mesmo motivo (uma borda que nenhum item responde).
- **A janela de terreno do explorador** (`ExplorerDirector`, raio 2 = 5×5 chunks, reassado em
  15-25 ms). É o que torna um mundo 2,5× maior um problema já resolvido.

### 1.3 O que falta, e é trabalho de verdade

1. **Um bestiário.** Um inimigo não faz um jogo de ação. É o maior item deste plano.
2. **Combate direcional** com os dois botões, i-frames, knockback e feixe.
3. **Nove dungeons**, que é conteúdo autoral, não código.
4. **Save**, porque um mundo de 23 mil tiles que se apaga ao fechar a aba é uma piada.
5. **Uma economia** — a moeda existe no código e nunca nasceu no mundo.

### 1.4 O acervo esquecido — metade do kit de dungeon já está no repositório

Varredura completa: **170 PNGs em `public/assets`, e 58 deles não são citados por nenhum arquivo do
projeto** (nem código, nem `world.json`, nem playtest). Não é lixo acumulado — é quase exatamente o
que as fases 4, 8 e 10 deste plano iam mandar desenhar.

**O tileset de dungeon existe** — `environment/tilesets/dungeon.png`, **32×144 = 2×9 = 18 frames**
de 16×16, nunca carregado uma única vez:

| frames | o que é | serve para |
|---|---|---|
| 0, 7, 8 | parede de tijolo, três variações | a parede da dungeon |
| 3, 5, 6 | piso liso, três variações | o chão |
| 2 | parede com **tocha acesa** (com faísca) | luz de dungeon — e o jogo já tem fogo real |
| 1 | parede com **morcego de olhos vermelhos** grudado | o Keese antes de acordar |
| 9 | parede com **hera/musgo** | idade, e a dica visual de "aqui é diferente" |
| 12, 13 | **parede rachada** e **piso rachado** | **a afordância da parede bombardeável** (§5.3) |
| 4 | **grade/alçapão** afundado | armadilha, poço, saída |
| 10 | **estante de livros** | a sala do velho |
| 11 | **estandarte vermelho** com brasão dourado | a sala do chefe |
| 14 | **barril** | quebrável |
| 15, 16 | **ossos + caveira**, e uma teia clara | o cenário do Stalfos |
| 17 | vazio | — |

E, soltos, o resto do kit: `props/vase_0..6` (**sete frames de um vaso quebrando** — os potes do
Zelda), `structures/up_down_block` (**espinhos que sobem e descem**, 2 poses), `effects/ambient/web_spider`
(6 teias), `props/torch_0/1`, `props/wardrobes` (6 estantes), `props/mushroom` (3),
`items/collectibles/heart_container` (**o container de coração**, cheio e vazio),
`items/collectibles/heart_bottle` (**a poção**), `items/equipment/arrow` (**a flecha**),
`effects/portals/portal_0/1` e `Respawn`, `terrain/sand`, `tilesets/snow_tileset` (2×3, limpo),
`effects/combat/blood|ashes|foot_steps|pool_of_blood`.

**O bestiário também já está desenhado.** `spider`, `mage`, `Slime`, `bat` e `turret` estão em
`public/assets/characters/enemies/`. Eram a fauna do modo Survivors, que **saiu do jogo em
2026-07-30** — e com ele saíram as `DEFS` do `textures3d` que carregavam essa arte no boot (o
registro carrega tudo de uma vez, então def sem ninguém desenhando era download por nada). A arte
ficou no disco esperando exatamente este plano; usar uma delas custa **uma linha** de volta no
`textures3d` (mais a classe e o `EnemyKind`). A aventura nunca viu nenhum deles:

| sprite | vira | onda (§4.5) |
|---|---|---|
| `bat.png` (morcego navy, olhos vermelhos) | **Keese** | 2 |
| `Slime.png` (2 frames) + `BigSlime` + pools | **Zol → Gel** | 2 |
| `spider.png` (aranha verde, olhos vermelhos) | **Tektite** | 1 |
| `mage__1.png` (mago de chapéu com cajado) + `mage_magic` + `magic_ball` | **Wizzrobe** | 3 |
| `turret.png` + `turret_bullet.png` | **Octorok** / a estátua que atira | 1 |

Isso derruba o risco nº 1 do §11: dos doze inimigos do roster, **cinco já têm arte pronta e
carregada**, com sprite de dano e projétil inclusos.

**Três ressalvas, e nenhuma é pequena:**

1. **O tileset de dungeon não passa no lint do próprio projeto.** `node spritefactory/factory.mjs
   check public/assets/environment/tilesets/dungeon.png tile` → **17 FAIL em 7 frames**. Mas a
   distribuição é boa notícia: **11 dos 18 frames passam limpos** — justamente as paredes e os
   pisos. O que falha é o enfeite (estante, estandarte, barril) e, nos dois frames rachados, **uma
   cor só** (`#1a1812` → `#111214`). É uma requantização, não um redesenho.
2. **Um tile novo é um FRAME num atlas existente, nunca um arquivo novo.** O chão inteiro é UMA
   malha amostrando UMA textura (`forest_tile_set.png`, 3 colunas, row-major) — é por isso que uma
   floresta custa um draw call. Carregar `dungeon.png` como segundo tileset seria um segundo
   material e um segundo draw call no chão. O caminho certo é `install-tile.mjs`, que só **apenda**:
   o atlas tem **39 slots, 37 ocupados** (livres: 26 e 38), então as paredes e os pisos de dungeon
   entram a partir do **frame 39**, em linhas novas.
3. **O tileset de deserto está com fundo magenta.** `desert_tileset.png` (3×3) tem **1.405 px de
   `#bb0d6e`** — 61% da folha: é color key que nunca virou alpha (o chão de areia de verdade está
   no `terrain/sand.png`, à parte). Tem só quatro frames úteis (cacto, árvore morta, dunas, uma
   criatura), e precisa de conversão antes de servir para a região de deserto do §3.3. O de **neve
   está limpo** (6 cores, sem magenta) — e não há região de neve neste plano.

---

## 2. As leis do `CLAUDE.md` que caem — e as que ficam

| lei | veredito | por quê |
|---|---|---|
| *"The game is walk-only — there are NO gameplay buttons at all"* | **CAI** | Decisão 4. O combate do Zelda precisa de golpe direcional: bater sem encostar é o que separa Darknut e Lynel de sacos de pancada. |
| *"one item at a time"* (uma mão só) | **CAI** | Decisão 4. Mochila + subtela. |
| *"the world teaches, the HUD does not"* | **FICA, e fica mais forte** | A subtela **não é HUD**: só existe quando chamada, e some. HUD é o que fica na cara do jogador sem ele pedir. |
| *"a new locked prop gets a shake, not a hint"* (sem balão de item-que-falta) | **FICA** | O Zelda também nunca diz o que falta. As duas filosofias são a mesma. |
| *"no sprite may overflow its tile"* | **FICA, intocável** | É a decisão de arte do usuário. |
| *"nothing may add or remove a THREE light at runtime"* | **FICA, intocável** | ~550 ms de recompilação. Nenhum inimigo novo, nenhuma dungeon, nenhum efeito pode encostar nisso. |
| *"a level is ALWAYS exactly one 12×12 chunk"* | **CAI para dungeons**, fica para puzzles | Decisão 6. Um level-puzzle continua sendo uma tela; uma dungeon é um mapa. |
| *"items should PRODUCE, not just DELETE"* | **FICA, e vira a correção do Zelda** | §5.4. |

### 2.1 A consequência que ninguém vê vindo: o gesto de depositar

Metade das peças de hoje existe em cima de um truque: **como não há botão, pisar num tile deposita
o item da mão**. É assim que se alimenta o braço robótico, as duas bandejas da caixa de ferramentas,
o `plantSpot`, o `bombSpot`.

Com o botão B isso deixa de ser um truque e vira **um verbo**:

> **B coloca o item selecionado no tile à frente.** Se o tile pede aquele item (bandeja, bombSpot,
> buraco de plantio, entrada do braço), ele o consome; se não pede, o item simplesmente fica no chão.

Ganhos, e são grandes:

- **Deixa de ser possível depositar sem querer.** Hoje atravessar a bandeja da caixa de ferramentas
  carregando a coisa errada é um acidente silencioso.
- **As afordâncias continuam valendo inteiras** — a bomba-fantasma que respira, a bandeja que pulsa
  enquanto vazia. Elas nunca disseram "pise aqui"; diziam "ponha algo aqui". Continuam certas.
- **O `ItemGetOverlay`, a loja e a fogueira não mudam.**

O que **precisa** ser reescrito: `handleTileEntered` perde os ramos de depósito, e `WoodenCrateObject`
/ `SwingGateObject` continuam no bump (empurrar e abrir são gestos de corpo, não de mão).

---

## 3. O mundo

### 3.1 Tamanho e forma

| | tiles | chunks | telas do Zelda equivalentes |
|---|---|---|---|
| aventura hoje | 96×96 = 9.216 | 8×8 = 64 | ~52 |
| **alvo** | **240×96 = 23.040** | **20×8 = 160** | **~131** |
| Zelda 1 | 256×88 = 22.528 | — | 128 |

A proporção importa: o Zelda é **largo e baixo** (quase 3:1). Um mundo quadrado convida a andar em
círculos; um mundo largo cria **leste e oeste** como ideias, e o jogador ganha um senso de direção
de graça. 20×8 mantém isso e cai redondo na grade de chunks que já existe.

### 3.2 O que o gerador faz, o que a mão faz

O gerador do explorador (`explorerWorld.ts`) já sabe fazer bosque por percolação, lago, pedra e
árvore seca — e já sabe fazer isso **sem trancar o caminho** (`FOREST_FILL_PERCENT` em 34%, abaixo
do limiar crítico `p_c ≈ 0,5927`; 99% do chão alcançável, maior bolsão 23 tiles). Esse número é a
única razão pela qual semear é seguro.

```
scripts/gen-zelda-world.mjs   (novo)
  seed fixa  →  20×8 chunks de mato, rio, pedra, floresta
              →  public/world.json
                     ↓
  /editor (à mão)   →  9 entradas de dungeon, ~24 cavernas, os segredos,
                       os gargalos, a rota crítica, as regiões
```

**Regra dura, e é a regra que salva o projeto:** o gerador roda **uma vez**, escreve o arquivo, e
nunca mais. Depois disso `world.json` é hand-authored e o script é scaffolding — exatamente o
aviso que já existe no `CLAUDE.md` para `gen-levels.mjs`, e pela mesma razão: um script que
sobrescreve autoria é uma bomba-relógio. O script novo **não** pode apontar para `public/world.json`
depois da primeira semeadura.

### 3.3 As oito regiões

O Zelda não tem bioma no sentido técnico: tem **lugares que se lembra**. Cada região precisa de uma
silhueta que se reconheça de longe e de um verbo próprio.

| região | tiles/props que já existem | o verbo |
|---|---|---|
| Planície inicial | grama, pinheiro esparso | andar, aprender a espada |
| Floresta densa | pinheiro (frames 4/14–17), mato alto | **queimar** — o fogo abre caminho onde o machado comum não morde |
| Rio e lagos | `water`, `bridgeSpot`, vau de pedra | **atravessar** — ponte (combustível) ou vau (à prova de fogo) |
| Cemitério | túmulos (prop novo, empurrável — reusa o empurrão da caixa) | **empurrar** |
| Montanha | rocha, minério, lava | **quebrar** e **bombardear** |
| Deserto | chão claro (frame novo), Leevers brotando | **sobreviver ao chão** |
| Mata Perdida | floresta idêntica em todas as saídas | **a sequência de direções** |
| Litoral | mar (33/34/35, já implementado) | a borda que nenhum item responde |

### 3.4 Streaming: apontar a aventura para a janela do explorador

Hoje `World3D.buildTerrain()` assa o mundo inteiro no boot; a 160 chunks isso é 2,5× de triângulos
permanentes. O explorador já resolveu: `setWorldWindow()` em `WorldData` + `rebuildTerrain()` a cada
cruzamento de fronteira de chunk, 5×5 chunks, **15-25 ms** medidos.

O trabalho é apontar `ExplorerDirector` (ou um irmão dele, `WorldStreamDirector`) para o mundo
autorado em vez do gerado. **Nada no renderer muda** — é o mesmo buraco de fechadura que o modo
explorador já usa. Duas invariantes a preservar, ambas já cobertas por playtest:

- `terrainMats` guarda os materiais entre reassados (material novo em runtime = recompila todo
  shader do mundo);
- o reassado não pode mexer na contagem de luzes.

### 3.5 Densidade de segredos

O Zelda esconde algo em **~1 de cada 4 telas**. Traduzindo para a nossa grade:

| | Zelda 1 | alvo |
|---|---|---|
| entradas de dungeon | 9 | **9** |
| cavernas/fontes | 20+ | **24** (1 a cada ~6,7 chunks) |
| segredos de tile (queimar, bombardear, empurrar) | ~60 | **~50** |
| containers de coração no mundo | 5 | **5** (+8 nos chefes, +3 iniciais = **16**) |

---

## 4. Combate

### 4.1 Os dois botões

```
A  →  espada, na direção que o herói olha        (não precisa encostar)
B  →  o item selecionado na subtela
ESC→  subtela / pausa
```

O bump **para de bater**. Encostar num inimigo passa a ser só dano de contato, como no Zelda —
senão andar contra tudo continua sendo a resposta ótima e o botão A não significa nada.

### 4.2 Os números (todos vindos da §5 da pesquisa)

| regra | valor | por quê |
|---|---|---|
| Dano da espada | madeira **1**, branca **2**, mágica **4** | a progressão inteira em três números |
| Vida do herói | 3 corações → **16** | `PLAYER_HEALTH_MAX` sai de 4 |
| Anéis | azul = **metade** do dano, vermelho = **um quarto** | defesa que não é número na tela |
| i-frames | dos **dois** lados | girar a espada não pode ser DPS infinito |
| Knockback | **4 px/frame** contra ~1,5 de caminhada | apanhar tem que te **arremessar** |
| Morte com dano 0 | vida 0 + arma não-imune = **morre** | é assim que o bumerangue mata Keese |

**A regeneração na fogueira acaba.** No Zelda a vida é um recurso que se gasta e se compra (fada,
poção, coração no chão). Regenerar de graça esvazia o `#4.3` inteiro.

### 4.3 O feixe É a barra de vida

A peça mais importante deste plano, e ela sai de graça:

> **Com a vida cheia, a espada dispara um feixe.**

Isso resolve a decisão 3 sem inventar nada. O jogador lê a própria vida **na arma**:

| estado | o que ele vê | já implementado? |
|---|---|---|
| vida cheia | o feixe voa | não — é o trabalho |
| ferido | o feixe some, o alcance encurta | consequência do acima |
| 2 corações ou menos | contorno vermelho pulsando + bússola de fogo | **sim** (`LOW_HEALTH_HEARTS`) |

Um jogo sem HUD que ainda assim informa vida em três faixas, e a informação chega **enquanto se
luta**, não num canto da tela.

### 4.4 Imunidade por arma: o bestiário vira dado, não código

A máscara de bits do original (espada / bumerangue / flecha / bomba / vara / chama) é o que faz cada
inimigo ser um enigma pequeno. Um `EnemyDef` com `immune: WeaponMask` e `hp` transforma "criar um
inimigo" numa linha de tabela, não numa classe nova — e é exatamente onde o projeto já erra menos
(a pedra de minério é `RockObject` com `ore: true`, não uma subclasse).

### 4.5 O roster: 12 inimigos, em três ondas

Escolhidos por **o que cada um ensina** e por reaproveitarem o que o motor já sabe desenhar.

**Onda 1 — o combate básico funciona**
| inimigo | HP | arte | o que ensina |
|---|---|---|---|
| Octorok | 1 / 2 | **`turret` + `turret_bullet`** (§1.4) | projétil bloqueável pelo escudo — o primeiro "vire-se para se defender" |
| Tektite | 1 | **`spider.png`** (§1.4) | movimento imprevisível: mira não resolve, espaçamento resolve |
| Moblin | 2 / 3 | nova | lança em linha reta — as diagonais são seguras |
| **Stalfos** = a caveira de hoje | 2 | **`UndeadEnemy`, pronto** | já existe inteiro; vira o inimigo padrão de dungeon |

**Onda 2 — o combate fica um assunto**
| inimigo | HP | arte | o que ensina |
|---|---|---|---|
| Keese | 0 | **`bat.png`** (§1.4) | vida 0: morre de qualquer coisa, existe para gastar seus i-frames |
| Zol → Gel | 2 → 1 | **`Slime` + `BigSlime` + pools** (§1.4) | **divide ao apanhar** — matar pode piorar sua situação |
| Darknut | 4 / 8 | nova | **só pelas costas ou pelos lados** — a aula de posicionamento do jogo |
| Leever | 2 / 4 | nova | brota do chão: o deserto é o inimigo |
| Zola | 2 | nova | atira **da água** — usa os rios que já existem, e não dá para revidar |

**Onda 3 — o mundo fica perigoso**
| inimigo | HP | arte | o que ensina |
|---|---|---|---|
| Wizzrobe | 4 / 10 | **`mage__1` + `mage_magic` + `magic_ball`** (§1.4) | teleporta: só é vulnerável na janela em que está visível |
| Armos | 3 | nova | a estátua que **acorda** — decoração deixa de ser confiável |
| Lynel | 4 / 6 | nova | atira feixe: mini-chefe de campo, o muro que marca "você foi longe demais" |

**Seis dos doze já têm arte** — cinco herdadas do finado modo Survivors (no disco, hoje sem def no
`textures3d`), mais a caveira que já é um inimigo completo. Sobram seis para desenhar, e os chefes.

Chefes (um por dungeon), na ordem em que o item que os mata é ganho: **Aquamentus** (espada) ·
**Dodongo** (come bomba — a bomba já existe) · **Manhandla** · **Gleeok** · **Digdogger** (recorder)
· **Gohma** (só flecha) · **Ganon** (só flecha de prata).

---

## 5. Itens, mochila e subtela

### 5.1 A subtela

Uma tela de pausa que mostra o que o herói tem e escolhe o item do B. Não é HUD porque **não está
lá quando você não pediu** — a mesma licença que o `ShopOverlay` e o `PauseMenu` já usam. Regras:

- Pixel art, sem números onde um desenho serve: corações desenhados, não "3/16".
- **Não** mostra contadores de rupia e chave como texto: mostra a bolsa e o molho. §7.
- Abre com ESC, junto do menu de pausa que já existe (`PauseMenu.ts`).

### 5.2 Os itens: Zelda → zero-hero

| item do Zelda | aqui | estado |
|---|---|---|
| Espada de madeira / branca / mágica | idem, três tiers | **espada existe**; faltam os dois upgrades e o dano 1/2/4 |
| Escudo / escudo mágico | idem | novo — bloqueio passivo na direção olhada |
| Bombas | **existe** (`bomb` + `bombSpot`) | vira consumível de mochila com contador |
| Vela azul / vermelha | **existe** como graveto aceso + `TORCH_BURN_MS` | a vela vira o acendedor; o graveto continua sendo o fogo portátil |
| Arco e flecha (**custa rupia**) | **`items/equipment/arrow.png` já existe** (§1.4) | é o que finalmente dá razão à moeda |
| Bumerangue | novo | atordoa e **puxa item do chão** — resolve item atrás de buraco |
| Balsa / escada | `bridgeSpot` e vau **já existem** | a escada vira travessia de 1 tile |
| Bracelete de força | o empurrão da caixa **já existe** | vira o gate de empurrar pedra grande |
| Recorder | novo | abre a dungeon 7 e teleporta entre entradas já visitadas |
| Chave / chave mágica | **existe** (`key`) | passa a contar na mochila |
| Anel azul / vermelho | novo | dois números, zero UI |
| Container de coração | **`heart_container.png` já existe** (cheio + vazio, §1.4) | os 13 que levam de 3 a 16 |
| Poção | **`heart_bottle.png` já existe** (§1.4) | a compra que dá uma segunda vida |
| Fada / coração no chão | `HeartPickup` **existe** | fada = cura total, e é o topo da tabela de drops |
| Mapa / bússola | novo | §7 |

### 5.3 As ferramentas que o Zelda não tem — e por que ficam

Machado, machado de aço, picareta, foice, balde, sementes, pedra, ferro, caixa de ferramentas,
braço, caldeira, fios, bateria: **tudo fica**, como itens de mochila e props de mundo.

É o que impede a conversão de virar um Zelda pior. O Zelda 1 é uma tabela de fechaduras com uma
chave cada — e a própria pesquisa mostra que é onde ele envelheceu pior (§10 da pesquisa: paredes
bombardeáveis sem nenhuma pista, "a fronteira exata entre mistério e tentativa e erro"). Aqui o
verbo se soma: `árvore → graveto → ponte`, `capim → sementes → mato novo → pavio`, `minério → ferro
→ foice`. **A dungeon é do Zelda; o mundo entre as dungeons é deste projeto.**

E a regra de ouro do `CLAUDE.md` vira a correção do defeito histórico:

> **Toda fechadura precisa de uma afordância na arte.** Parede bombardeável tem rachadura. Arbusto
> queimável é seco e de outra cor. Túmulo empurrável está torto. Se a única forma de o jogador
> descobrir é ler um guia, o problema é o desenho do prop.

---

## 6. As nove dungeons

### 6.1 Formato

Cada dungeon é um arquivo `public/levels/dungeon-N.json`, autorado no `/lab`, entrado pela viagem de
portal que já está pronta (sucção → vazio → túnel → queda) e por ela devolvido. **Lá dentro é
contínuo**: salas de verdade ligadas por portas de verdade, câmera rolando, zero troca de tela.

`makeLevel` ganha tamanho, o `/lab` ganha rolagem de câmera e a regra "12×12" passa a valer só para
levels-puzzle.

### 6.2 Tamanhos

Uma sala do Zelda tem interior 12×7 e, com paredes, ocupa ~16×11. Convertendo para chunks de 12×12:

| dungeon | salas | chunks | tiles |
|---|---|---|---|
| 1 · Águia | 3×3 | 4×3 | 48×36 |
| 2 · Lua | 4×3 | 5×3 | 60×36 |
| 3 · Manji | 4×4 | 5×4 | 60×48 |
| 4 · Serpente | 5×4 | 7×4 | 84×48 |
| 5 · Lagarto | 5×5 | 7×5 | 84×60 |
| 6 · Dragão | 6×5 | 8×5 | 96×60 |
| 7 · Demônio | 6×5 | 8×5 | 96×60 |
| 8 · Leão | 7×6 | 9×6 | 108×72 |
| 9 · Morte | 8×6 | 10×6 | 120×72 |

**O mapa continua desenhando o nome da dungeon.** É o truque mais barato e mais bonito do original,
e num mundo contínuo ele fica melhor: dá para ver o contorno andando.

### 6.3 A gramática de sala, sem troca de tela

O que o Zelda comunicava com o corte de tela precisa de outra coisa:

| peça | no Zelda | aqui |
|---|---|---|
| entrar numa sala | corte de tela | **vão de porta estreito** — o corredor é o corte |
| porta trancada | chave | **`LockedDoorObject`, já existe** |
| parede falsa | bomba, sem pista | bomba, com **a parede rachada do `dungeon.png` frame 12** como pista (§1.4) |
| shutter (fecha até limpar) | grade caindo | **`ElectronicGateObject`, já existe** — trocar a energia por "sala limpa" |
| sala escura | vela | **as luzes 3D já fazem isso melhor** — e o graveto aceso é a vela |
| bloco empurrável | som de segredo | **`WoodenCrateObject` + `PressurePlateObject`, já existem** |
| pote quebrável | pote com rupia | **`vase_0..6`, 7 frames de quebra, já desenhados** (§1.4) |
| armadilha de espinhos | Trap que dispara | **`up_down_block`, 2 poses, já desenhado** (§1.4) |
| parede, piso, tocha, ossos, teia | tileset da dungeon | **`dungeon.png`, 11 frames limpos** (§1.4) |
| Wallmaster | te joga na entrada | novo |

**Nove das dez peças já existem em código ou em arte.** É por isso que este plano é conteúdo, não
engine — e o §1.4 é a razão pela qual a fase 8 é muito mais barata do que parece.

### 6.4 Mapa e bússola sem HUD

- **Mapa** — um objeto físico na dungeon; pegá-lo **acende as paredes já visitadas** na subtela
  (que só existe quando pedida). Nada permanente na tela.
- **Bússola** — som, não ícone: perto do chefe, um batimento grave que acelera. Vira o ancestral do
  contorno vermelho de vida baixa que já existe, e usa a mesma linguagem.

### 6.5 O sino da estrutura

Cada dungeon tem **um** item novo, e esse item é a chave do chefe dela e a chave de um pedaço do
overworld. É essa costura — e só ela — que faz um mundo aberto ter ordem sem ter corredor.

---

## 7. Onde cada número do Zelda vai morar sem HUD

| o número | no Zelda | aqui |
|---|---|---|
| Corações | fileira no topo | **o feixe da espada** (cheio) + **contorno vermelho pulsando** (2 ou menos) + a subtela, quando pedida |
| Rupias | contador no topo | **bolsa física** que engorda na cintura do herói (3 estágios); na loja, o que não dá para pagar fica escuro |
| Chaves | contador | **molho no cinto**, um desenho por chave até 4, "muitas" acima disso |
| Bombas | contador | idem, no cinto |
| Item do B | canto do HUD | **na mão do herói**, como já é hoje |
| Minimapa | canto do HUD | **não existe**. O mundo é memorizável por desenho — é o trabalho do §3.3 |
| Mapa da dungeon | canto do HUD | item físico → subtela |
| Bússola | ícone | **som** |
| Nível/andar | texto | nenhum |

---

## 8. Drops: o ciclo de 10

A descoberta mais aproveitável da pesquisa (§6): **os drops do Zelda não são sorteio, são uma tabela
de 10 posições** cruzada com o grupo do inimigo, mais dois contadores forçados.

Implementação (`DropDirector`, ~120 linhas):

```
contador cíclico 0..9        → sobe a cada morte
grupo do inimigo A/B/C/D/X   → uma linha na tabela de EnemyDef
mortes consecutivas sem dano → 10 = rupia garantida
                               (se a 10ª foi de bomba → bomba)
                            → 16 = FADA garantida, depois 26, 36, 46…
```

Por que isso vale ser copiado inteiro:

1. **Dá ao especialista algo para dominar sem tirar do novato a sensação de acaso.**
2. **É a segunda recompensa por não apanhar**, e ela conversa com o feixe: quem está inteiro luta
   melhor **e** ganha mais.
3. **Finalmente dá razão ao `CoinManager`**, que existe no repositório e nunca foi chamado uma única
   vez na aventura.

---

## 9. Morte, save e o mundo que lembra

Hoje a morte é `scene.restart()` e leva tudo — incluindo cada fogueira que o jogador acendeu. Num
mundo de 23 mil tiles isso deixa de ser duro e passa a ser **inviável**.

- **Morrer mantém o inventário** e devolve o herói ao início do mundo (ou à entrada da dungeon, se
  morreu dentro de uma). É o `continue` do Zelda.
- **O mundo lembra**: fogueira acesa, prop consumido, dungeon terminada, container pego, caverna
  aberta. O explorador **já tem** essa lista de "o que um prop lembra ao sair da janela"; ela vira o
  save.
- **Save em `localStorage`**, 3 arquivos, com nome — a única homenagem literal que este plano faz
  ao cartucho, e ela é gratuita.

---

## 10. As fases

Cada fase entrega algo jogável e tem um cenário de playtest que a guarda. Nenhuma fase depende de a
seguinte existir.

| # | fase | entrega | guardado por |
|---|---|---|---|
| **0** | **Resgatar o acervo** (§1.4) | requantizar os 7 frames sujos do `dungeon.png`; instalar paredes e pisos no atlas a partir do **frame 39** (`install-tile.mjs`); converter o magenta do `desert_tileset`; apagar as duplicatas (`dungeon_floor__1` é byte-a-byte igual ao original, `forest_tile_set (2)`) | `factory.mjs check` com 0 FAIL nos frames instalados |
| **1** | **Os dois botões** | A golpeia na direção olhada; B usa/coloca o item; bump deixa de bater; mochila mínima (sem subtela) | `combate` (novo) |
| **2** | **Vida, feixe e i-frames** | 3→16 corações, dano 1/2/4, knockback, i-frames dos dois lados, **feixe na vida cheia**, fim da regeneração | `combate` |
| **3** | **A subtela** | pausa mostra inventário, escolhe o item do B, corações desenhados; bolsa/molho/cinto no herói | `subtela` (novo) |
| **4** | **`EnemyDef` + onda 1** | tabela de inimigos com HP e máscara de imunidade; Octorok, Tektite, Moblin, Stalfos; projétil bloqueável | `inimigos` (novo) |
| **5** | **O mundo semeado** | `gen-zelda-world.mjs` roda **uma vez**, 20×8 chunks; a aventura passa a usar a janela de terreno | `mundo-aberto` (novo) — flood-fill provando chão único, reassado < 30 ms, 0 shaders, 0 luzes |
| **6** | **Drops e economia** | `DropDirector` com o ciclo de 10 e os contadores forçados; moeda cai de inimigo; loja passa a ser comprável | `drops` (novo) |
| **7** | **Save** | 3 arquivos, o mundo lembra, morrer não zera | `save` (novo) |
| **8** | **Dungeon 1 ponta a ponta** | `/lab` multi-chunk, `dungeon-1.json`, portas/shutter/sala escura, Aquamentus, o primeiro container de coração | `dungeon-1` (novo) |
| **9** | **Ondas 2 e 3 do bestiário** | Keese, Zol, Darknut, Leever, Zola, Wizzrobe, Armos, Lynel | `inimigos` |
| **10** | **Itens do Zelda** | arco (custa rupia), bumerangue, escudo, anéis, recorder, espada branca/mágica | `itens-zelda` (novo) |
| **11** | **Dungeons 2–8** | conteúdo autoral, uma por vez | `dungeon-N` |
| **12** | **A esculpida do mundo** | 24 cavernas, ~50 segredos de tile, 5 containers, as 8 regiões, Mata Perdida | `mundo-aberto` |
| **13** | **Dungeon 9 e Ganon** | flecha de prata, o fecho | `dungeon-9` |

**Fases 1–4 já fazem um jogo jogável** com o mundo de hoje. Só a fase 5 toca no mundo, e só a 8 toca
no `/lab`. Essa ordem é de propósito: nada de conteúdo grande antes de o combate ser bom, porque
conteúdo autorado em cima de um combate ruim é conteúdo que vai ser refeito.

---

## 11. Riscos, e o que fica de fora

**Riscos**

1. **O bestiário continua sendo o item mais caro do plano**, mas encolheu: o §1.4 mostrou que
   **seis dos doze já têm arte**, cinco delas herdadas do finado modo Survivors. O caro agora é
   *comportamento*, não desenho — e comportamento é `EnemyDef` como dado (§4.4) mais as três ondas.
   O que **não** encolheu foram os chefes: sete, nenhum com arte.
2. **A mochila mata puzzles que existem.** Vários levels de hoje se apoiam em "você só tem uma mão".
   Eles não quebram — ficam **fáceis**. Precisam de revisão, um por um, ou de aposentadoria honesta.
3. **A janela de terreno é a única peça de risco técnico.** Ela funciona no explorador; num mundo
   autorado, props têm estado (fogueira acesa, árvore derrubada) que precisa sobreviver à saída da
   janela. O explorador já resolve isso para um subconjunto; a lista precisa crescer.
4. **Sem HUD, o jogador pode não descobrir que tem rupias.** A bolsa em 3 estágios é a resposta, e
   ela precisa de teste com gente de verdade, não de convicção.
5. **23 mil tiles esculpidos à mão é muito tempo humano.** É a fase 12, e é a mais longa do plano.
6. **O acervo do §1.4 é arte de terceiros e não fala a paleta da casa.** 17 FAIL no linter, famílias
   de cor que não são as do jogo (o `dungeon.png` é azul-petróleo; a floresta é navy-ink). Usar como
   está é aceitar que a dungeon pareça de outro jogo; requantizar é a fase 0. **A tentação a evitar
   é instalar primeiro e consertar depois** — frames de atlas são posicionais, e trocar arte
   instalada é mais caro do que trocar arte solta.

**Fora de escopo, explicitamente**

- O modo **Survivors** não existe mais (removido em 2026-07-30, a pedido) — o que era "não mexer
  nele" virou uma porta a menos no título e ~4 mil linhas fora do repo.
- O modo **explorador** continua existindo; o que ele empresta é o `Director`, não a aposta.
- **O second quest** do Zelda (§8 da pesquisa) não entra: é o dobro do conteúdo autoral, e o defeito
  dele (paredes atravessáveis sem pista) é exatamente o que o §5.3 deste plano proíbe.
- **Nenhuma mudança no `World3D`** que altere contagem de luzes, contagem de materiais ou o
  enquadramento da câmera. Decisão 1.

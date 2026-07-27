# O mundo aberto como cozy game — revisão e plano

> **Tese em uma frase:** o jogo cozy já está escrito aqui dentro. Os verbos do mundo aberto já são
> domésticos — acender, plantar, regar, colher, atravessar, forjar, conversar. O que não é cozy é a
> **moldura**: nada do que você faz sobrevive, nada do que você faz é para alguém, e o escuro é um
> predador com cronômetro. Tornar o jogo cozy é inverter a polaridade dessa moldura, e quase nada
> disso passa pelos olhos.

---

## 1. Diagnóstico — o que o mundo aberto é hoje

Levantado lendo `public/world.json`, `GameScene.ts`, `UndeadSpawnDirector.ts`, `ShopOverlay.ts` e os
catálogos de locale. Números medidos, não estimados:

| o que | estado real hoje | por que isso é anti-cozy |
|---|---|---|
| **Tamanho / densidade** | 8×8 chunks = 96×96 tiles, **69 props no total**, 7 NPCs, **4 fogueiras** (1 acesa), 6 itens, 21 corações, ~846 pinheiros | Uma floresta grande e vazia. Cozy vive de **densidade de pequenos prazeres**, não de extensão. |
| **Morte** | `GameScene.triggerDeath` → `scene.restart()`. Perde vida, upgrades, moedas, item na mão, **toda fogueira que você acendeu**, toda ponte construída, toda árvore derrubada | É o loop souls-like inteiro. Cozy pode ter fracasso; não pode ter **perda**. |
| **Epitáfio** | `death.epitaph` = *"Nada fez sentido, tudo foi em vão."* | A frase mais anti-cozy que existe, dita no momento de maior atenção do jogador. |
| **Persistência** | **Nenhuma.** `localStorage` só guarda volume, idioma, gráficos e o meta do Survivors | Fechar a aba apaga o mundo. Um cozy game é, antes de tudo, **um lugar que lembra de você**. |
| **Pressão** | `UndeadSpawnDirector`: fora do anel da fogueira o medidor enche em 25s (borda) → **9s** (fundo do escuro); intervalo de spawn 3.2s → **0.65s**; até 4 caveiras. Comentário do próprio arquivo: *"até que ficar no escuro se torne insobrevivível"* | O escuro é um **cronômetro de morte**. Cozy quer que o escuro seja **clima** — algo para o qual você se prepara e do qual você volta. |
| **Economia** | `CoinManager.spawnCoins()` **nunca é chamado**. Não existe uma única fonte de moeda na aventura | A loja de upgrades existe e é **incomprável**. A moeda é um sistema morto — e portanto **livre**. |
| **Loja** | VIDA MAX, ESPADA+, PASSO+, ÍMÃ DE MOEDAS | Vocabulário de recompensa 100% de combate, num jogo onde ninguém consegue comprar nada. |
| **NPCs** | 7, com falas placeholder de alpha (*"impossível achar a espada na versão alpha"*), metade em inglês, metade em português. **Não pedem nada, não lembram de nada, não dão nada** | O trabalho do jogador não tem **destinatário**. Essa é a maior perda cozy do projeto. |
| **História** | `wizardStoryState()`: **1 fogueira acesa** → `prophecy` → `playIntroEnding()` → volta pro título | O mundo aberto acaba em ~5 minutos, e acaba dizendo "você jogou a introdução". |
| **Produção** | Tudo que o mundo produz (graveto, pedra, ferro, semente, carvão, machado forjado) só serve para **abrir passagem ou queimar** | "Items should PRODUCE" já é lei do projeto, mas todo produto termina consumido numa fechadura. Falta o produto que **fica**. |

E o que já é cozy, e é bom, e não deve ser tocado: o mundo ensina sem HUD; o fogo é um sistema que o
jogador **dirige**; a fogueira é abrigo, loja e ponto de conversa ao mesmo tempo; a vida **regenera
sozinha perto do fogo** (`HEALTH_REGEN_MS`, já implementado); as caveiras avisam antes de nascer
(3s de chão rachando) e antes de bater (500ms de wind-up); o jogo é walk-only, sem um único botão de
gameplay. Esse último ponto é ouro: **um jogo sem botões já é um jogo sem ansiedade.**

---

## 2. A restrição: "sem mudar os visuais"

O plano inteiro respeita isso, e é bom dizer o que ela tranca — porque ela tranca exatamente as
ideias óbvias de cozy:

**Recusado, e por quê:**

- **Ciclo dia/noite.** O movimento cozy clássico, e o mais caro aqui: a renderização inteira é
  autorada para a noite (`ambient` 8.5 + `moon` 3.6), a sombra da lua é **assada uma vez** no build
  do mesh, e as luzes de fogo são um pool de contagem fixa que não pode crescer em runtime
  (recompila todo shader do mundo — a trava de ~550ms documentada no CLAUDE.md). Um sol que anda
  reassaria sombra por frame e mudaria a imagem por definição. **Fora.**
- **Paleta mais quente, céu, estações, chuva/neve.** Mesma razão, e a chuva ainda brigaria com as
  regras do sistema de fogo.
- **Construir casas / móveis / decoração.** Precisa de arte nova e esbarra na lei fundamental do
  projeto: *nenhum sprite pode vazar do seu tile*.
- **HUD cozy** (relógio, inventário em grade, diário de quests). Viola a lei do projeto — *"the
  world teaches, the HUD does not"*. E não precisa: o jogo já inventou o substituto (§5).

**O que a restrição deixa livre — e é onde o plano inteiro mora:** regras, permanência, ritmo,
tuning numérico, texto, som, e **autoria de conteúdo no `/editor`** (colocar mais fogueiras, hortas,
NPCs e props já existentes não é mudar visual — é mobiliar o mundo com o mobiliário que já existe).

**Zona cinza declarada:** as Fases 0–5 exigem **zero arte nova**. Onde um sprite novo ajudaria, está
marcado como **opcional** e sempre passaria pela Sprite Factory no padrão medido — mesma arte, não
outra. Se "sem mudar os visuais" for lido no sentido estrito de *nenhum arquivo de imagem novo*, o
plano continua inteiro: nada essencial depende disso.

---

## 3. As três colunas

1. **O mundo lembra.** Permanência é a coluna cozy invisível: sem ela, cuidar de alguma coisa é
   burrice mecânica.
2. **O escuro é clima, não predador.** A pressão continua existindo — sem ela acender fogueira não
   significa nada — mas ela deixa de terminar em perda e passa a **encolher conforme você cuida do
   mundo**.
3. **O que você faz é para alguém.** Produção sem destinatário é fetch quest. Os 7 NPCs já estão
   plantados no mapa; falta darem um **pedido** e uma **memória**.

---

## Fase 0 — a morte vira desmaio *(a decisão que destrava todas as outras)*

**O que muda:** `triggerDeath()` para de chamar `scene.restart()`. O herói **desmaia e acorda na
fogueira acesa mais próxima** (ou na fogueira-casa), com a vida cheia.

- **Você não perde nada — mas larga o que estava carregando** no tile onde caiu. O jogo já sabe
  fazer isso (um item por tile no chão, `dropStone`/graveto/sementes já pousam sozinhos). O item
  fica lá, esperando: a consequência vira **uma caminhada de volta**, que é a forma cozy de custo.
- **A cinemática de morte fica** — é tweens e post, não arte: o mundo drenando cor
  (`World3D.setWorldFade`), o herói sozinho no vazio. Só encurta (1500ms → ~900ms) e troca o
  encerramento: em vez de reiniciar, o mundo **volta** com o herói deitado na fogueira.
- **O epitáfio muda de texto** (`death.epitaph` em `pt-br.json`/`en.json`). Não é arte, é uma linha
  de locale — e é a linha que decide o gênero do jogo. Algo na chave de *"você acordou. o fogo
  aguentou por você"*.
- **Som:** `playPlayerDeath` (o cluster grave) troca por um acorde de brasa; a ambiência **não
  precisa mais ser cortada** para o silêncio total.

**Implementação (o cuidado real):** hoje o reset de estado mora em `create()`. Precisa de um caminho
de *soft respawn* que não reinicie a cena: restaurar vida, reposicionar `playerWorld` na fogueira,
recentrar câmera, `movementController.interruptMovement`, mandar o `enemyManager` fazer o *sunset*
(a rotina de "as caveiras desmoronam quando você chega na luz" já existe) e zerar o `danger`. Todas
as peças existem soltas; a fase é costurá-las.

**Arquivos:** `GameScene.ts` (`triggerDeath`, novo `wakeAtHearth`), `locales/*.json`,
`SoundManager.ts`.

---

## Fase 1 — o mundo lembra *(save)*

A maior alavanca cozy do projeto, e ela é **invisível na tela**.

Um módulo `runtime/runState.ts` no mesmo padrão dos singletons que já existem (`activeLevel.ts`,
`GlobalVariables.ts`), persistido em `localStorage` sob `zh.save` (convenção `zh.*` já usada).

**O que salvar — um DIFF, nunca o mundo:**

| estado | chave natural |
|---|---|
| fogueiras acesas | `campfire@x,y` |
| pontes construídas / vaus de pedra | `water@x,y` |
| árvores derrubadas (tile e prop) | lista de tiles editados (`fellTreeTile` já muta `chunk.upper`+`collisions`) |
| rochas quebradas, arbustos queimados, portas abertas | `type@x,y` |
| horta: buraco / plantado / regado / matagal | `plantSpot@x,y` + estágio |
| itens já coletados do chão | `pickup@x,y` |
| falas já ouvidas, pedidos entregues | `seenDialogKeys` (já existe em memória) + novo `deliveries` |
| herói: posição, item na mão, vida, moedas, upgrades | direto |

Escrita com debounce nos **momentos de significado** (fogueira acesa, item pego, diálogo fechado,
entrega feita) + `beforeunload`. Nunca a grade de terreno inteira.

**Consequência de UI:** o título ganha **"Continuar"** ao lado de "Jogar aventura" — mesmo componente
de botão que já existe, texto novo, nenhum pixel novo. E o menu de pausa ganha "recomeçar mundo"
(com o mesmo arm-confirm de dois toques que os botões de level já usam).

**Armadilha do projeto:** `npm run generate:world` **sobrescreve `public/world.json` sem perguntar** —
exatamente a mesma armadilha do `generate:levels` já documentada no CLAUDE.md. Como a Fase 5 autora
o mundo à mão no `/editor`, esse script precisa da mesma tarja de aviso, e o CLAUDE.md precisa dizer
isso antes que alguém rode.

**Arquivos:** novo `runtime/runState.ts`, `GameScene.create/shutdown`, `TitleScene.ts`, `PauseMenu.ts`.

---

## Fase 2 — o escuro vira clima

A pressão fica; o que muda é o **significado** dela. Hoje o medidor termina em morte. Depois da Fase
0 ele termina em "voltar para casa" — e agora ele passa a **encolher conforme o mundo é cuidado**.

- **Um termo de território no `UndeadSpawnDirector`.** O dread global multiplica por
  `1 − (fogueiras acesas / total)`. Cada fogueira acesa deixa o mundo inteiro permanentemente mais
  quieto. Isso faz a fala do mago (*"proteja esta chama… o mundo ainda poderá renascer"*) virar
  **verdade mecânica** em vez de floreio — e transforma "acender o mundo" na barra de progresso
  cozy que o jogo já queria ter.
- **Retuning:** `RAMP_EDGE_MS` 25s → ~60s, `RAMP_DEEP_MS` 9s → ~25s, `MAX_UNDEAD_AT_FULL_DANGER`
  4 → 2, `INTERVAL_FRENZY_MS` 0.65s → ~1.6s. O escuro continua desconfortável; deixa de ser um
  relógio de execução.
- **O escuro precisa continuar valendo a pena.** Já vale: a moonflower só abre longe do fogo, e é
  lá que estão os materiais. Cozy-aventura é isso — o escuro é onde cresce o que você quer, não
  onde você morre.
- **Música:** `danger` hoje entra com `aliveCount > 0 && !playerSafe`. Sobe para ≥2 vivas **e** uma
  histerese mais longa, para o mundo ficar quase sempre no `overworld` + vento. Uma linha de
  condição em `GameScene.update`.

**Arquivos:** `UndeadSpawnDirector.ts`, `GameScene.ts` (o contador de fogueiras já existe:
`litFireCount`).

---

## Fase 3 — o trabalho tem destinatário

A fase de maior retorno cozy, e a que mais é **conteúdo** e menos é código.

### 3a. O pedido é um balão de pensamento — arte zero

O jogo **já inventou a gramática exata** para isso e ainda não usou fora do morto-vivo: a caveira
que quer uma placa de pressão mostra **um balão de pensamento com a placa acesa dentro**
(`thought-plate.png`). O CLAUDE.md já formula a regra: *"a new creature intent gets a bubble; a new
LOCK still gets only a shake"*. Um NPC querendo alguma coisa é **intenção**, não fechadura.

Então: um NPC com pedido pendente mostra um balão com **o ícone do item que ele quer**. Todos os
ícones já existem (`axeIcon`, `woodIcon`, `seedsItem`, `ironItem`, `bombIcon`, `bucket`…), e o
`NpcManager` já projeta um marcador flutuante acima da cabeça (o "!"). É recombinação, não desenho.

### 3b. A entrega é um esbarrão — o jogo é walk-only

Esbarrar no NPC carregando o que ele quer **entrega**. Mesma gramática do braço robótico e da caixa
de ferramentas ("pisar deposita"), mesma tecla de sempre: nenhuma. Em troca ele dá:

- moedas (§4 — a moeda morta acorda aqui);
- um item;
- ou, o melhor: **ele muda o mundo**. Acende a própria fogueira. Limpa os arbustos. Abre um caminho.

O painter **já reclama** que "these bushes are getting in the way" e o jogo **já tem** machado e
fogo. O pedido dele estava escrito no diálogo desde sempre e nunca foi ligado em nada.

### 3c. Reescrever o elenco

As falas de alpha (piada de "versão alpha", metade em inglês) saem. Entram 7 moradores com falas
curtas, quentes e **repetíveis** — cozy é reler, não zerar. Lembrar: **diálogo mora em dois lugares**
(`public/world.json` → `dialogs` **e** os catálogos de locale); um NPC novo precisa dos dois.

### 3d. O mago para de encerrar o jogo

`wizardStoryState()` hoje pula para `prophecy` com **1** fogueira, e o `prophecy` chama
`playIntroEnding()` — que apaga a tela e volta pro título. Vira um arco escalonado pelas fogueiras
acesas (1 / metade / todas), e só o último beat encerra. Com a Fase 5 (mais fogueiras), o arco passa
a ter comprimento de jogo em vez de comprimento de demo.

**Arquivos:** `NpcManager.ts` (balão + estado de pedido), `GameScene.handlePlayerBump` (entrega),
`NpcDialogs.ts` + `world.json.dialogs` + locales, `GameScene.wizardStoryState`.

---

## Fase 4 — a moeda que não existe vira a moeda do cuidado

`spawnCoins()` nunca é chamado: **não há uma única moeda na aventura**. A loja inteira é decorativa.
Isso é sorte — a moeda está livre para ser redefinida sem quebrar nada.

**De onde vem moeda, a partir de agora:** de **cuidar**. Entregar o pedido de um NPC. Acender uma
fogueira morta. Fazer um matagal brotar. (Matar caveira pode continuar pagando — mas deixa de ser
a única via, e o jogador pacifista deixa de ficar de fora da economia.)

**O que a loja vende** — mesma loja, mesmo lugar (esbarrar na fogueira acesa; a fogueira é o móvel
mais cozy que o jogo tem), vocabulário novo, **ícones reaproveitados dos itens que já existem**:

| some | entra | o que é |
|---|---|---|
| ESPADA + | **tocha longa** | `TORCH_BURN_MS` maior — o escuro fica mais gentil |
| ÍMÃ DE MOEDAS | **fogueira que aquece mais longe** | `CAMPFIRE_SAFE_RADIUS_TILES` +1: você literalmente **compra paz**, e ela é permanente |
| — | **semente farta** | a foice rende 2 — a horta vira folgada |
| VIDA MAX / PASSO + | ficam | descanso e caminhada não são vocabulário de combate |

**Arquivos:** `ShopOverlay.ts` (`UPGRADES_CFG`), `GameScene.applyUpgrade`, locales,
`CoinManager.spawnCoins` (passa a ser chamado nos atos de cuidado).

---

## Fase 5 — densidade de pequenos prazeres *(autoria no `/editor`, zero código)*

O mapa tem 96×96 tiles e 69 props. Cozy é o oposto disso. Tudo abaixo se autora no editor com peças
que **já existem no jogo**:

- **Fogueiras: 4 → ~12**, espalhadas de modo que nenhum ponto do mapa fique a mais de ~15 tiles de
  uma. Isso sozinho converte o mapa de hostil para hospitaleiro **e** dá comprimento real ao arco de
  "acender o mundo" (que a Fase 2 transformou em progressão e a Fase 3d amarrou ao mago).
- **Cada NPC ganha a sua fogueira.** O mecanismo já pressupõe isso (`NPC_GATE_RADIUS_TILES`: um NPC
  perto de fogueira morta só fala as `lockedLines` com medo). Sete estranhos espalhados viram um
  **vilarejo** que você reacende casa por casa.
- **Uma horta perto da fogueira-casa:** `plantSpot`s junto do rio, balde e foice alcançáveis cedo.
  O loop semear → regar → brotar → colher é a batida cozy do jogo e hoje quase não aparece no mundo
  aberto.
- **A oficina do vilarejo:** uma `toolbox` perto de casa e uma `waterWheel` no rio. As duas são peças
  de puzzle hoje, autoráveis no mundo, e uma roda d'água girando e zumbindo é a definição de
  **landmark cozy**.
- **Mais água, mais `bridgeSpot`, mais `dryTree`** (regrow já garante que a lenha nunca acaba).

---

## Fase 6 — som e ritmo

- `danger` mais raro (Fase 2), `overworld` + vento como estado normal do mundo.
- Um pequeno **cue de lar** ao acordar/descansar na fogueira (o `SoundManager` é síntese própria +
  samples; acrescentar um som é barato e não é visual).
- A ambiência de vento já existe: variá-la lentamente já dá sensação de tempo passando **sem tocar
  em uma única luz** — que é como se compra "ciclo do dia" dentro da restrição.

---

## Ordem, e como verificar cada passo

O CLAUDE.md é explícito: **testar exatamente o que mudou**, com um cenário dirigido, nunca o solve
inteiro. Um cenário novo por fase, registrado em `playtest/scenarios/index.mjs`:

| fase | cenário | o que ele prova |
|---|---|---|
| 0 | `desmaio` | morrer não reinicia; acorda na fogueira; o item cai no tile onde caiu e continua lá |
| 1 | `memoria` | acende fogueira → recarrega a página → continua acesa; árvore derrubada continua derrubada |
| 2 | `escuro-clima` | com N fogueiras acesas o dread cai; o teto de caveiras cai; a música de perigo não entra com 1 |
| 3 | `pedido` | balão com o ícone certo; esbarrão entregando; o mundo mudando em troca; o balão sumindo |
| 4 | `loja-cuidado` | acender/entregar paga moeda; comprar raio de fogueira aumenta o anel de segurança de verdade |
| 5 | — | `explore` / `tour` continuam passando com o mundo mobiliado |

Regressões que **não** devem ser rodadas atrás de nada disso: `espada` e `itens` já estão vermelhos
por mudança de design (documentado), e `perf-burn` / `visual-ref` só interessam se alguém encostar
no renderer — o que este plano inteiro **não faz**.

---

## O que este plano deliberadamente não faz

- Não encosta em `render3d/`. Nenhuma luz, nenhuma sombra, nenhum shader, nenhuma paleta.
- Não desenha nada. As Fases 0–5 são regra, texto, número, som e autoria.
- Não remove o combate. As caveiras são o motivo de a fogueira importar; um mundo sem escuro nenhum
  faz "acender o mundo" não significar nada. Cozy não é vazio — é **abrigo**, e abrigo precisa de
  intempérie do lado de fora.

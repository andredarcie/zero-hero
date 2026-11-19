# Zero the Hero

Aventura **cozy** top-down em pixel art, **em inglês e pt-BR** (local abre sempre em pt-BR). O **motor próprio**
(`src/game/engine/`, `import * as Engine from '@/game/engine'`) cuida da lógica, input e UI num canvas
**transparente**; o mundo embaixo dele é **3D de verdade** (Three.js, `src/game/render3d/`). O motor (cenas, laço,
tweens, relógio, teclado/toque, texturas, desenho WebGL 2D, texto) tem contas e ordem de eventos FIXAS, travadas pelo
gabarito de `src/game/engine/__tests__/` (que não se regera) — mudar uma conta dele muda o jogo. API nova que o jogo
pedir entra no motor, no estilo dele e com teste. **O projeto não depende nem fala de nenhum outro motor** (pedido do
autor): nada de pacote, import, comentário ou doc citando outro; o aviso de licença do código de terceiros fica só em
`src/game/engine/LICENSES.md`. **O JOGO É 100% PACÍFICO: não existe combate, inimigo, dano, vida, morte
nem game over** — e nada se perde. Combate, bestiário, subterrâneo, escadas, bombas, pira e
planta carnívora foram REMOVIDOS por inteiro (código, arquivos e conteúdo). `/` é o jogo e
`/editor` é o editor; não há terceira rota.

## O arco do jogo (um só, e ele mora em `GameScene`, seção "A HISTORIA")

1. **A abertura** (`playIntro`): à noite, o cavaleiro chega pela estrada do sul com a espada nas
   costas, a finca no chão (ela fica ali para sempre e bloqueia o tile), olha em volta entre
   vaga-lumes, e o mago chega andando e fala. Toca uma vez por partida (`introSeen` no save).
2. **As quests da Sisi, do Marco e da Thea são em etapas** e têm dono próprio (`quests/`). **Os outros vizinhos** (`dialogs/NpcQuests.ts`): um pedido pequeno por NPC, cada um com o PRESENTE
   que o torna possível (`gift`). Pedido novo = uma entrada lá + falas `npc.<id>`/`npc.<id>Done`
   no locale.
3. **O portão** (`openGardenGate`): quando `allQuestsDone()`, o `gardenGate` do centro abre.
4. **A fogueira do fim** (`hearth`, `tendHearthAt` → `playRoastEnding` → `rollCredits`): Z acende,
   Z de novo com um graveto na mão assa um MARSHMALLOW (o pacote mora ao lado do fogo). Os amigos
   chegam pelo portão, depois a nave traz a Thea (`entities/HearthReunion.ts`), e os créditos voltam ao título.

`npm run playtest -- zerar` joga tudo isso do título aos créditos com o teclado. **O texto do jogo
mora nos locales — `en.json` e `pt-br.json`, as MESMAS chaves nos dois** —, inclusive o roteiro
`<id>Done`; o `world.json` guarda retrato, cor e voz. Texto novo entra nos dois arquivos. **AS FALAS DOS PERSONAGENS moram em `src/game/i18n/dialogos/pt-br.json` e `en.json`**, uma seção por personagem com a `filosofia` (escola e LIVROS: só referência) e as `falas` pelo caminho que o código pede; o `i18n.ts` as junta ao locale. Fala de personagem nova entra LÁ, nunca nos `locales/`. **Cada personagem segue UMA escola filosófica, só dele** (nenhuma escola nem pensador principal repetido) sobre o sentido da vida: fala nova tem de caber nela e sair dos livros dela. `node scripts/dialogos.mjs --check` confere isso e que pt-br e en têm a mesma forma. **Os nomes também saem da escola** (`filosofia.nome` diz de onde): Zero (Sartre, começa do nada), Sati (o mago: a atenção plena), Sinope (o gato: a cidade de Diógenes), Shui (Taoísmo, a água), Sisi (Camus, Sísifo), Marco (estoicismo, Marco Aurélio), Thea (Aristóteles, theoria). O código, os comentários, os testes e as seções do `dialogos` ainda usam os nomes antigos (Shui = Shui, Sisi = Sisi, Marco = Marco, Thea = Thea): só o texto do jogo mudou. **Todo texto usa o MÍNIMO de palavras** — só a essência, nada de floreio (pedido do autor). **TODA FALA É VERSO** (pedido do autor), e **o PADRÃO DE ESCRITA é o `docs/escrita-em-verso.md`: ler ANTES de escrever qualquer verso** (lida uma vez em voz alta, um leigo entende; ordem direta, palavras do dia a dia, a escola como conselho prático; se a rima e a clareza brigam, troca-se a rima): quadras de 6 a 9 sílabas rimando o 2º e o 4º verso, UMA ESTROFE POR CAIXA (a quadra inteira, `\n` quebra o verso; a caixa recua o 2º e o 4º, não quebra verso e tem a largura do poema: `runtime/poemLayout`), e dístico na fala curta ou encaixada; a regra mora no `_verso` do `dialogos/pt-br.json` e o `src/game/i18n/versos.test.ts` reprova verso fora do metro e rima que não fecha. O inglês é outro poema (8·6·8·6), conferido de ouvido.

## O save da aventura

- **A aventura LEMBRA** (`runtime/adventureState.ts`, chave `zh.cozy.v1`): `create()` hidrata, e
  todo evento que muda o mundo chama `persistAdventure()`. O **playtest do editor** fica de fora.
- **O título recarrega o `world.json` do disco ao entrar** (Continue / New journey): o mundo em
  memória pode estar mexido, e o que merece viver mora no save como diff.

## Como este documento funciona

- **Aqui só entra LEI FUNDAMENTAL.** Uma lei é a regra que, quebrada, custa uma tarde e vale para
  o jogo inteiro — não para a peça que você acabou de mexer. Detalhe **nunca** entra: nem número
  medido, nem nome de campo, nem o que a sua mudança fez.
- **A postura padrão é NÃO escrever aqui.** Terminou um trabalho? Escreva no
  [`progress.md`](progress.md) e siga. Só volte aqui se a resposta for sim: *"quem nunca viu este
  código vai quebrar alguma coisa amanhã por não saber disto?"* — e mesmo então, em **uma linha**.
- **Este arquivo não cresce a cada mudança.** Um arquivo que ganha um parágrafo por tarefa vira o
  changelog que ninguém lê, e aí ele para de proteger as leis que já estavam nele.
- **O "porquê" mora no [`progress.md`](progress.md)** — a discussão de design de cada peça, os
  números medidos, as armadilhas que cada sistema escondeu. Se uma explicação aqui passar de duas
  linhas, ela pertence lá.
- **Teto de 200 linhas. Passou, CORTE** — e o primeiro candidato ao corte é o que você acabou de
  acrescentar.

## Workflow

- **Tudo acontece na `main`. Nunca crie branch.** Commit e push direto nela.
- **Mensagem de commit sempre em inglês** (o código e o jogo são em português).
- **Commits semânticos** (`feat:`, `fix:`, `perf:`, `refactor:`, `docs:`, `test:`, `chore:`) com
  descrição de verdade: o que mudou e *por que* — sobretudo a parte não-óbvia.

## Comandos

```bash
npm run dev              # vite dev server
npm run typecheck        # tsc --noEmit
npm run lint             # eslint — o repo inteiro passa limpo; erro novo é seu
npm run build            # typecheck + vite build
#  NUNCA rode `generate:world` — ele SOBRESCREVE o que foi feito à
#  mão, sem merge e sem perguntar (ver abaixo). Para mexer no mundo: o /editor, ou um script que
#  LÊ o world.json e acrescenta (`node scripts/enrich-world.mjs` é o modelo).
npm run playtest         # cenários default
npm run playtest -- all  # todos
node scripts/cozy-world.mjs --check   # o world.json é o ponto fixo do mundo pacífico?
```

A porta 5173 costuma estar ocupada por outro projeto. Para playtest, suba o Vite numa porta livre:

```bash
npx vite --port 5180 --strictPort
PLAYTEST_BASE_URL=http://localhost:5180 npm run playtest -- perf-burn
```

## Os dois botões e a pausa

    Z (J / espaço)  →  a MÃO: fala com o NPC à frente, acende/assa na fogueira do fim, abre o
                       catálogo da bancada/forno, põe e malha no altar, e PEGA / TROCA a coisa do
                       tile da frente (`handAt`; pousar no chão livre saiu, só o enfeite pousa). Nada no Z é golpe.
    X (K)           →  USA o que está na mão no tile à frente (a tabela `useItemAt`).
    pisar           →  não pega nada: o Z pega ou troca o que está debaixo do herói (`takeUnderfoot`),
                       antes de tudo menos da conversa.
    o balão         →  TODA interação nova ganha uma palavra em `actions.*` e uma linha em `handVerbAt`
                       ou `useVerbAt`, na ordem dos botões. O balão é um só (`ActionPrompt`): nada de
                       keycap solto sobre as coisas. Os vizinhos não dormem.
    ESC             →  a pausa: retornar, conversas, opções, músicas, sair. Não há bolsa, mapa nem caderno (pedido do autor).

- **AS CONVERSAS** (pausa → Conversas; `runtime/talkLog` + `runtime/TalkLogOverlay`): toda conversa COM NOME que passa
  por `NpcDialog.openDialogScript` entra no save (`talks`) com as falas lidas até o fim, como TEXTO pronto (a fala é
  montada de pedaços; fica na língua em que foi lida). A narração sem nome não entra; conversa sem fala nova daquela
  pessoa não vira página. Diálogo novo não precisa fazer nada — só não abrir caixa de fala fora de `openDialogScript`.

- `pressAttack`/`pressUse` são ligados **por evento de teclado**, nunca por `JustDown`; a
  repetição se filtra por `event.repeat`.
- **A SERRA: a altura do chão é de `world/relief`** e `Billboard3D`/`projectTile` já a somam — nunca
  somar de novo; passar de nível só por `canStep`. São DOIS andares onde se pisa (planalto e CUME, o do
  jardim do fim), cada escada vence um; os scripts e playtests usam a mesma regra (`scripts/relevo.mjs`). O `relief` se edita no /editor (ferramenta Serra, A). A terra do chão é conta (`groundFrameAt`), mas o `soil` do chunk (ferramenta Solo, H: grama/terra fixa) manda no tile — quem lê a terra passa por `setSoilSource`;
  rodar `serra-world.mjs` de novo REGERA o campo e apaga o que foi feito à mão. O topo de capim leva a beirada (`render3d/reliefEdge.rimClass`) e a franja; a face de lado de beira que olha para o norte não se monta (`stepFacesAway`); parede e alto da serra vestem a rocha de `render3d/cliffRock.ts` (quadros 120..129), nunca o calçamento em pé; a escada é pedra lavrada (`render3d/stairGeometry.ts`, 130..134) com a arte na medida do mundo, nunca esticada.
- **Cada cogumelo tem a sua trilha** (`scripts/trilhas-cogumelos.mjs` para os seis do pedido; `scripts/cogumelos-novos.mjs` para os dois opcionais, o ostra no campo da flor da lua e o da oliveira, que brilha de noite em `objects/MushroomGlow`; rode `--check` depois de mexer em volta deles). Espécie nova entra em `fungi.ts` (lista, ficha, pintor), no locale e na dica da Shui.
- **A CACHOEIRA do acampamento** (`objects/Waterfall.ts` + `scripts/cachoeira.mjs`, as mesmas coordenadas nos dois): beira sólida em (53,55), com o riacho do alto (olho d'água em (52,54), leito em (53,54), sólidos; a água no planalto é desenho deitado `paintStream`, o World3D só faz água no nível baixo); o pé da queda e o laguinho do acampamento são UM lago de 5×3 tiles, (52..56, 56..58), com as carpas de `objects/KoiPond.ts` (mesmo retângulo em `KOI_POND`). A beira de olhar é (51,58). Rode `--check` depois de mexer em volta.
- **O BOSQUE** (`objects/BigTrees.ts`): carvalhos velhos, bétulas, carvalhinhos e troncos caídos são PROPS do world.json (`oakTree`, `birchTree`, `youngOak`, `fallenLog`), postos e apagados no editor (aba Props). O pé bloqueia pelo próprio prop (`BigTrees.at`, sem colisão pintada); o tronco caído ocupa o tile dele e o da direita. Nada de posição de árvore no código. `scripts/bosque.mjs` só CONFERE (chão plano, nunca sobre árvore do tileset — quadros 3/4/14-18/21/36/37/73/74 —, BFS) e nunca replanta. Os passarinhos de dia são `objects/BirdLife.ts`. O herói atrás de uma árvore aparece de contorno, como atrás da serra (a árvore é desenhada antes da silhueta: `TREE_RENDER_ORDER`); ela não fica translúcida.
- **O EDITOR mostra as peças que o jogo monta por código** (`editor/EditorFixtures.ts`, camada "Pecas do jogo", tecla O): ele cria os MESMOS objetos sobre um World3D que só anota os billboards. Objeto novo de mapa em lugar fixo entra na lista de `recordFixtures`; ele só pode usar do World3D o `addBillboard` e o `params` (o resto, o gravador não tem). Editor só no `npm run dev` (o `/api/world` não existe no preview).
- **CADA VIDA MORA NUM BIOMA** (`world/biomeLife.ts`, pedido do autor: a tela poluída com tudo ao mesmo tempo): bicho, planta e luz da natureza, passarinhos e vaga-lumes só nascem no bioma da tabela `LIFE_HOMES` (um, no máximo dois). O NatureLife dá a cada sistema um host que só acha chão/água/árvore no lar dele; quem segue o herói multiplica por `home()`. Coisa nova de natureza ganha uma linha na tabela, nunca o vale inteiro.
- **A THEA (astronaut) NÃO TEM CASA** (pedido do autor): é a única vizinha sem casa — caiu do céu, e a busca dela é voltar para a casa lá em cima. O forno e a bigorna ao lado dela são a FORJA VELHA de um ferreiro que foi embora (`objects/OldForge.ts`, achado `smithy`, `scripts/forja-velha.mjs`). Nunca dar casa a ela: onde era a casa fica a CRATERA da queda da nave (`objects/CrashSite.ts`, `scripts/cratera-da-nave.mjs`).
- **A CERCA DE MADEIRA** (`objects/WoodFence.ts`, prop `woodFence` por tile): liga sozinha nos vizinhos; o trecho norte-sul é tábua DEITADA na altura do trilho (o quad em pé não gira); a ponta é pilar de portão. Bloqueia pelo prop. As coisas de dentro (lenha, cavalete, tocos, carrinho, placa) são `objects/LumberYard.ts` + `scripts/quintal-do-lenhador.mjs`, que nunca põe peça nos tiles da quest do Marco. O quintal do lenhador: `scripts/cerca-do-lenhador.mjs`, que exporta o BFS de verdade (`reachable`, conta os quadros sólidos do tileset — o do bosque antigo não contava e deixou 46 tiles presos).
- **A NATUREZA** (`objects/nature/`, maestro `NatureLife`): esquilo, sapos, libélulas, lebre, peixe, folhas no chão, cogumelos depois da chuva, margaridas, neblina, a sombra das copas (as manchinhas de sol que piscavam saíram a pedido do autor), sementes, arco-íris, poças, gotas das folhas — um sistema por arquivo, todos lendo o mesmo `NatureFrame`. Billboard novo que nasce TARDE entra no `prewarmShaders` do World3D (senão compila na hora e trava ~0,8 s); o que se pisa deitado usa `depthLayer: 'ground'`. Playtest: `natureza`.
- **Arte nova SEGUE O TILESET** (o autor: "não seguem cores e estilos das árvores já existentes"): a paleta do `forest_tile_set.png` (cores novas só se combinarem com ela), a mesma densidade (16 px por tile, mais pixels e não pixels maiores), textura granulada sem degradê nem contorno, e a cor do bioma (`biomeTreeTintAt`) no material das árvores, como o World3D faz nas do mapa.
- **Árvore seca é rara de propósito** (`scripts/arvores-secas.mjs`): a quest do Marco pede procurar. Não espalhe mais delas. Mas NUNCA de enfeite: toda árvore seca é prop `dryTree` (o machado derruba); os tiles de árvore morta (3, 21) viraram secas de verdade ou pinheiro, e bioma nenhum desenha árvore morta.
- **Cogumelo no chão é SÓLIDO e só a faca o solta** (`ForagingOverlay`); a espécie é o tipo do item
  (`fungi.ts`), e cada espécie existe UMA vez no mundo. O pedido da Shui fecha com 4 quaisquer (`need`), e as outras 2 são opcionais: ela continua aceitando e dando dicas. Colhido, vai para a CESTA, que é a única exceção
  à lei de uma coisa de cada vez, e a Shui leva a cesta inteira. Fechado o pedido, ela faz o CHÁ do cogumelo que veio na cesta e o herói viaja (`scenes/game/ShuiTea`, uma vez por partida, marca `shui/tea`; o quadro da viagem é o `render3d/TripPass`, desligado fora dela).
- **O herói anda PRESO ao grid** (um tile por passo, 4 direções): o livre foi tentado e desfeito —
  no celular o grid controla melhor. A posição lógica já é o tile de DESTINO durante o passo.
- **A parede VIRA o herói** (`PlayerMovementController`): é assim que se mira. Contra tile LIVRE a
  seta anda — não há virar-no-lugar.
- **UMA COISA NAS COSTAS, TODA FERRAMENTA GUARDADA** (`Inventory`, sem inventário à vista): material sobre material
  passa por `takeIntoHand`, que pousa o antigo no chão; a ferramenta guardada que o tile pede vem às costas pelo botão (`toolFor`/`equipToolFor`). A pá só cava nas 4 covas rachadas da Sisi (`PainterCracks`).
- **Overlay 2D preso ao herói se ancora na posição VISUAL** (`visualWorld`), nunca na lógica. O TAMANHO da interface presa ao mundo (balão de ação, pensamento, "!") é `uiTileSize` (o tile no zoom de 100%): o zoom do jogador mexe só na câmera.
- **Cutscene é `cutsceneActive`**: o `update` para, o `render3D` (POST_UPDATE) continua — por isso
  vaga-lumes e herói moram lá. Passo roteirizado = `scriptStep`, nunca o controlador.
- **As estações são exclusivamente MANUAIS** e **não existe dinheiro**: recompensa é item ou nada.

## O mundo (`world.json`) e o editor (`/editor`)

- **HÁ UM MUNDO SÓ, e só a superfície.** Levels, `/lab`, explorador e o subterrâneo
  (`underworld.json`, escadas) foram removidos. **`scripts/cozy-world.mjs`** é o passo que tirou o
  combate do mundo e montou o jardim (rode com `--check`: o disco tem de ser o ponto fixo).
- **O jardim do centro é fechado por PROVA DE BFS**, e a sebe é de pinheiro com colisão PINTADA.
- **⚠️ NUNCA rode `generate:world`.** `generateWorld.ts` sobrescreve o `world.json` inteiro por um
  mundo **8×8 sem NPC autorado e com uma fogueira** — e o de hoje é 5×5 chunks, feito à mão no
  `/editor`. Ele escreve **sem merge e sem perguntar**. Fica no repo como scaffolding, e só depois
  de apontar a saída para um caminho desocupado.
- **O BARALHO comprável se escolhe no /editor** (`catalog.enabled`, a lista de caixas da Biblioteca
  de chunks), e quem filtra é `getChunkTemplates` — **um lugar só**: carta desligada continua
  inteira no arquivo, e um segundo filtro rio abaixo seria uma segunda resposta.
- **Mexer no mundo em massa é um script que LÊ o `world.json` e acrescenta** — nunca um que o
  refaz. `scripts/cozy-world.mjs`, `enrich-world.mjs` e `enrich-chunk-cards.mjs` são os modelos: idempotentes (miram num TOTAL,
  não num delta — e o `--check` do último falha se o disco não for o ponto fixo),
  determinísticos (zero `Math.random()`) e proibidos de tocar em `ground`, `collisions` e no que
  o autor já pôs. **Prop que bloqueia só entra com prova de BFS de que não selou caminho** — a
  heurística local de vizinhos já prendeu 1.700 tiles em bolsões. Faça um backup antes.
- **Leia o JSON, nunca a documentação, para saber o que o mundo contém** — ele muda sempre que
  alguém abre o editor.
- **As fogueiras comuns seguem o relógio**, e só existem ao lado de um NPC: ao anoitecer ele contorna até ela, se abaixa e o fogo pega aos poucos (`fireKeeperLights`, `CampfireObject.kindle`). Longe do herói ela só aparece acesa; de manhã apaga sozinha. Apagada são galhos cruzados com pedras, nunca uma chama escura. Só a `hearth` é do herói.
- **CHÃO + UMA COISA. Um tile tem o `ground` e, em cima dele, no máximo UMA — `upper`, prop, item,
  ou NPC.** O editor cumpre (colocar limpa o tile, pintar `upper` pula o tile ocupado); quem
  quebra é script e JSON à mão. `npm run audit:stacks` confere, `scripts/fix-tile-stacks.mjs` conserta.
- **Um playtest AUTORA a fixture que precisa** (entra no `/editor`, limpa um quintal e coloca
  props pelo `EditorStore`, aperta P) em vez de depender do que o mundo autorado contém hoje.
- `/editor` edita o `world.json` via `/api/world`. **P** joga o mundo em memória (sem abertura e
  sem save), **ESC** volta; nada salva até o Salvar.
- **AS FALAS se editam no /editor → "Falas…"** (`editor/DialogEditor` + `DialogEditorFalas`, o rascunho em
  `editor/dialogDraft`): os dois `dialogos/*.json` via `/api/dialogos`, à parte do mundo (o Ctrl+S ali grava as
  falas). PT e EN lado a lado; a forma de cada fala é a do arquivo (lista de caixas, caixa única lida por `t()`,
  nome) e o editor não a muda; o verso é conferido com a regra do `versos.test` (`i18n/verseCheck`). Salvar não mexe
  em mais nada do arquivo (`formatDialogJson` escreve como à mão) e o jogo aberto pega a fala nova pelo HMR do
  `i18n.ts`, sem recarregar. "Cor e voz…" é o que o `world.json` ainda guarda de cada NPC. É FEITO PARA ESCRITOR:
  cada fala tem título e QUANDO aparece (`editor/falaTitles` — **caminho de fala novo no código ganha uma linha lá**,
  o `falaTitles.test` cobra), margem de sílabas e rima por verso (`DialogEditorBox`), prévia da caixa como no jogo +
  ficha + guia (`DialogEditorSide`), desfazer da lista de caixas e rascunho guardado sozinho no navegador.
- **AS RELÍQUIAS ENTERRADAS** (`relics/relics.ts`, `scenes/game/RelicDig`): coisas da vida do autor, nas trincas do vale;
  a pá (que a Sisi deixa com o herói) cava de frente ou DE PÉ EM CIMA (`ShovelStab`, a cavada no pé, que a cova da Sisi
  também usa), a coisa pula para a mão, a cerimônia, e a página na seção "Relíquias" do caderno (`found`). **Relíquia
  nova:** o tipo e o tile em `relics.ts` (chão livre e nu, uma por região — o `relics.test` cobra), o desenho em
  `render3d/relicArt` (32×32, rampas do jogo, sem logotipo) e `relics.<kind>` (name, what, text, note) nos dois locales.
- **A torre de telefonia do cume** (`objects/CellTower`, desenho em `render3d/towerArt`) é só enfeite, na quina de trás
  do cume (fogueira + (2, −3)); ocupa o tile dela. Billboard pisa no chão de onde o CENTRO dele cai: peça presa a
  outra que sai do tile dela desconta `terrainHeightAt` (as luzes da torre). **Billboard alto tomba na perspectiva**
  (o topo se abre para fora do meio da tela): a torre gira a cada quadro para ficar no prumo (`CellTower.standUp`).
- **O MAPA É SEMPRE UM RETÂNGULO** (regra do autor, 2026-11-19; `beach.test` cobra): cada chunk de `worldChunksX` ×
  `worldChunksY` existe uma vez, nenhum fora. Lugar novo cabe DENTRO (a fonte termal foi aberta no pé da serra); se precisar
  crescer, é uma faixa inteira de chunks de ponta a ponta, nunca um chunk avulso.
- **O MAPA COMEÇA ACIMA DA LINHA 0** (`meta.originCy` = -2, a praia do norte): há tiles de `worldY` NEGATIVO (-24 a -1).
  Nada de `y >= 0`, `for (y = 0; y < H…)` nem `% CHUNK_ROWS` cru: use `getWorldBounds()` (jogo), `store.minY`
  (editor) e `((y % n) + n) % n`. Crescer o mapa é pelo script (`scripts/praia-do-norte.mjs`), nunca renumerando.
- **A PRAIA DO NORTE** (`scripts/praia-do-norte.mjs`, `--check`/`--map`): a trilha ao norte da Thea (**LIVRE desde o
  começo do jogo**, o autor, 2026-11-19: nada de mato nem foice no caminho; o script prova `reach(false)`), o mirante, a
  duna, a areia, os coqueiros (`objects/CoconutPalms`, prop `coconutPalm`) e o mar. **A areia e o oceano são UMA malha** (`render3d/surf.ts`, `worldFx: 'surf'`): tudo sai da
  distância até a linha d'água (`aCoast4`); a faixa molhada é shader, não frame; só o tile de mar barra. O relógio da
  onda (`swashAt`) é o mesmo no shader e no jogo: **só senos de argumento pequeno, nunca hash de seno**. O mar de fora
  continua onde a borda é mar (`WorldData.isVoidSea`).
- **Chão CLARO novo: albedo quase neutro.** A luz do vale é dourada; ocre ou madeira no arquivo saem laranja-queimado
  na tela. A areia é o cinza quente do calçamento salpicado de ocre (`beach-sand.mjs` conta as três versões).
- **Na praia a câmera é a de SEMPRE** (o autor, 2026-11-19: "no mirante, na areia ou no mar, a câmera fica como é
  padrão, fixa"). A câmera que baixava até o horizonte no mirante e na beira saiu; `objects/beach/SeaVista` só puxa o
  ar para a bruma do mar descendo a duna, e a câmera do horizonte (céu em `render3d/SeaSky`) ficou para quem SENTA na
  cadeira do guarda-sol e para o playtest (`holdVista`). Não religar câmera que se mexe sozinha sem ele pedir. **O sol nasce no mar** (ao norte) e se põe atrás
  da câmera: o astro da cúpula segue a luz do mundo, nunca um disco onde as sombras negariam.
- **A AREIA DO JOGO SÓ VEM DA PRAIA, NUM BALDE** (o autor, 2026-11-19): os montinhos de `objects/beach/SandMounds` (sólidos;
  o X com o balde vazio vira `bucketSand` e o montinho afunda; volta no dia seguinte, no mesmo tile). O forno da Thea
  pede `bucketSand` e devolve o balde vazio (`ForgeWork.feedFurnaceAt`). Não existe mais monte de areia no lago do sul.
- **OLHAR O MAR** é sentado, nunca andando: a cadeira do guarda-sol (`objects/beach/BeachSeat`, no meio da enseada,
  41,-15: o quadro só pega mar, céu e coqueiros — o autor não quer a serra de pedra nele) e `scenes/game/SeaWatch`, que
  liga a câmera do horizonte (`SeaVista.watch`) e o tempo corrido do descanso. As nuvens do céu do mar (`SeaSky`:
  cirro + cúmulo sombreado) andam com o tempo corrido (`getTimeScale`).
- **A FONTE TERMAL** (o autor, 2026-11-19: "um lugar para descanso, depois do lago de lava"; e "zero contato com a
  praia, zero visão da praia... separar experiências... se compara mais com sentar e ver o lago"): uma GRUTA no pé da
  serra, logo atrás do corredor das minas (entra-se por entre as pedras de minério, x 3/5/7). A água (3..6, -3..-2, chão
  de baixo, com colisão), a lanterna (7,-2) e o pé do bordo (1,-2), sólidos, e o paredão de mata ALTA (relevo 7) entre a gruta e a duna são da
  `scripts/praia-do-norte.mjs` (`SPRING`; ela é dona de todas as linhas negativas: mexer ali é nela, nunca à mão). **A
  câmera alcança ~11 tiles ao norte no chão baixo e a areia começa na -7: nada de abrir a gruta para o norte nem baixar
  aquele paredão** (o `beach.test` cobra). **A BACIA É FUNDA DE VERDADE** (o autor: "profundidade 3D, ser possível ver
  o fundo"): `world/hotSpring` diz onde e quanto, o terreno a cava (`TerrainSorter.springTiles`,
  `TerrainFeatures.bakeSpring`: leito de areia, borda avançando, parede) e a ÁGUA é uma lâmina translúcida pintada no
  shader (`render3d/springWater`, `worldFx: 'spring'`, dentro da luz do mundo como o mar). **Ela não escreve
  profundidade e é desenhada DEPOIS dos corpos (`WATER_ORDER`); tudo que é ar por cima dela e também não escreve
  profundidade (vapor, cascata, folhas, halo, vaga-lumes) leva `OVER_WATER`, senão sai tingido como se estivesse no
  fundo.** As peças são de `objects/spring` (`HotSpring` é o maestro: `SpringSteam`, `SpringCascade`, `SpringMaple`,
  `SpringNight`; a arte em `springArt`/`rockArt`/`mapleArt`; roda no quadro da praia). **Quadro em pé deita para trás
  com a câmera (o alto recua 0,454 × a altura): perto de parede, o pé fica longe dela na medida da altura.** O Z diante
  da água, pela beira de baixo: `SeaWatch.soakAt` — ele senta no leito (`hero.lift` NEGATIVO; o contorno
  `OccludedSilhouette` desliga com o corpo abaixo do chão), vira DE FRENTE e a câmera vai até a água como no banco do
  lago (`cameraLook` com passeio curto + dolly 0,74). NUNCA a câmera do horizonte ali. Só se chega atravessando a lava
  (`minas-alem-da-lava.mjs --check`, `beach.test`). Painel de testes: "Fonte termal".
- **O cartão de 2024** (relíquia `nomadPostcard`) está enterrado na areia (15,-15, atrás do coqueiro); relíquia na areia
  mostra a pontinha de papel (`SAND_HINT_ART`) em vez da rachadura.
- **Bicho novo da praia** entra em `objects/beach/buildBeach.ts` (um `BeachSystem`); quem anda com a onda lê `swashAt`.
  A água contorna os corpos de `standActorsUniform`; as pegadas e os respingos são de `objects/beach/BeachSteps`.
- **AS PEGADAS** são deitadas no chão do mundo 3D, nunca 2D por cima dele (`objects/stepPrints`: a sola de bota afundada,
  pé esquerdo e direito, quatro rumos, um desenho por chão — terra, lama na chuva, capim, areia, areia molhada). Fora da
  praia quem as deixa é `scenes/game/Footprints` (dois passos por tile, pela posição DESENHADA do herói); na areia,
  `BeachSteps`. O claro delas é ocre ou do próprio chão, nunca creme: a luz do vale o deixa amarelo-vivo.

## Fogo, e a lei das travas

- **Fogo é o único sistema que o jogador conduz** (`scheduleFireSpread`/`igniteFlammableAt`): um
  tile em chamas acende os 4 vizinhos. Combustível: mato alto, arbustos secos (que o machado também derruba) e
  **pontes de madeira**. Pedra, água, lava e chão pelado são corta-fogo.
- **Fogueira APAGADA pega fogo de um vizinho** (é o ponto: acender sem o herói ir lá). **Fogueira
  ACESA nunca espalha** (é sumidouro). **Mato alto barra o herói e conduz fogo.**
- **O HERÓI PENSA NO QUE FALTA** (pedido do autor, `GameScene.neededAt`): toda vez que ele tenta usar uma coisa que não tem, um balão mostra o DESENHO dela, nunca uma palavra. Trava nova é uma linha ali, e continua tremendo também.
- **Itens devem PRODUZIR, não só apagar** (árvore→graveto/ponte, picareta→pedra).
  Pergunte de qualquer item novo: o que ele *faz*?
- **Ferramenta não se fabrica nem fica solta** (pedido do autor): o machado só vem do Marco, a foice só da
  Morte, e só no fim da TERCEIRA noite (pedido do autor, 2026-11-17: na primeira ela avisa que volta e que no fim
  deixa um presente para o acampamento; `Resting.DEATH_LAST_VISIT_KEY`; aparece onde ela esteve, quando o herói
  levanta). A foice corta o mato rente e não dá nada; o mato VERDE do acampamento só ela corta.
- **O MATO ALTO É FIO A FIO, NA MALHA DA DECORAÇÃO** (refeito a pedido do autor, 2026-11-17): a arte é uma BIBLIOTECA
  de fios gerada em código na paleta do tileset (`render3d/tallGrassArt`, um fio por célula 8×16, testada: paleta, pé
  escuro, linha sem degrau duplo, nenhum fio repetido); o tufo é um sorteio deles pela posição (`tallGrassTuft`: uma
  ou duas touceiras, fundo mais alto e escuro, espiga e palha de vez em quando — nunca dois tufos iguais); todos os
  tufos do vale numa malha só (`render3d/world/TallGrassField`) desenhada pelo MESMO programa da decoração em pé
  (`standingDecor`/`decorSway`: a brisa do vale, a esteira, a rampa do bioma) — só que GRAVANDO profundidade.
  O TallGrassObject só diz o estado do tufo. A roçada é `runtime/SwordMow` (recuo, varrida baixa da direita para a
  esquerda, acompanhamento; o corte em `MOW_CONTACT_MS`), o golpe é `scenes/game/MowFx` (as pontas são a própria ponta
  do fio, no material do mato — `GrassFlyers` —, a palha, o pó, a onda no capim, hitstop de 50 ms, tranco) e o som é
  `audio/MowSounds` (sintetizado e sorteado a cada golpe; sobe de tom em sequência). Nada de sprite com cor crua por
  cima do mato: o que for do mato passa pela rampa do bioma, senão sai escuro. OS TOCOS SOMEM: ficam 2 s à vista
  (`STUB_LINGER_MS`) e afundam na terra — chão limpo (o queimado fica carbonizado). O MATO DO ACAMPAMENTO VOLTA
  (`objects/CampGrass` + `runtime/campRegrowth`, `home.clearedAt`): tile cortado e SEM USO fica limpo um dia do jogo,
  brota e cresce em três degraus no dia seguinte (não bloqueia) e fica em pé de novo (bloqueia, sai do save). USO =
  peça em cima, o herói pisando (trilha pisada não cresce) ou ser passagem (`pathStaysOpen`: crescer ali não pode
  trancar peça nem herói). Cenário: `mato-volta`. **Semente só existe a de tinta da Sisi**: o item `seeds` e o plantio genérico saíram.
  Cada árvore seca dá **um** graveto; a ponte do morel pede duas (`scripts/ponte-do-morel.mjs`).
- **A tela de título é só a mata** (pedido do autor: sem herói, NPC, casa, item ou fogo): `public/assets/ui/title_bg.jpg`
  é uma foto do jogo tirada por `node scripts/capturar-titulo.mjs`; refaça quando o visual do mundo mudar. Por
  cima, a `TitleScene` põe o luar, a névoa, os vaga-lumes e as folhas, o título em pixel e as teclas.
- **Só se dorme no acampamento** (pedido do autor): o único lugar onde o herói dorme é o colchão fixo dele; nas fogueiras dos vizinhos ele só senta (o X nelas não deita). O sono é AUTOMÁTICO: deitado, nada o levanta (sem "Levantar", setas e botões não fazem nada, o ESC só pausa) — a noite vem, a Morte vem (na primeira noite, antes dela, a câmera sobe ao céu estrelado: `entities/StarGaze`), e ele levanta sozinho de manhã (`Resting.canGetUp`/`getUp`). Cena que tira a câmera do herói usa a câmera de cena (`CameraRig.lens` + `WorldScreen.calm`/`fovExtra`) e devolve tudo a zero.
- **ÁRVORE VERDE NUNCA SAI DO LUGAR.** O `axe` só corta madeira MORTA (props `dryTree`/`dryShrub`);
  a árvore verde é **tile** assado na malha estática do terreno, escrita UMA vez na GPU, sem índice
  nem remendo. **Nenhum item edita terreno em pé** — o machado de aço que fazia isso foi removido.
- **O FORA DO MUNDO trava por COORDENADA, não por material** (`buildVoidChunk`): todo tile de lá
  nasce com `collisions: true`, e nada no jogo edita terreno em pé. São
  as duas travas — tirar uma abre uma porta para fora do mapa. Por elas a arte de lá é livre: em
  cima é floresta sob névoa negra, embaixo é a alvenaria de teto preto. (Já foi mar, quando a
  única trava era o material.) Tile de terreno novo = **frame novo num atlas existente**
  (`node spritefactory/install-tile.mjs`), só acrescentando linhas.

## As peças (o contrato de cada uma está no `progress.md`)

- **ESTAÇÃO É ITEM: o X instala no tile à frente, e o X recolhe — TUDO que se instala se recolhe**,
  inclusive o autorado. Instalar É
  usar, então mora na tabela `useItemAt`; a direção nasce de para onde o herói olha, nunca de um
  menu. Recolher exige a mão vazia (a peça vai para ela) e é o degrau DEPOIS da tabela e da
  entrega, então ferramenta que tem o que fazer ali nunca desmonta.
- **O alvo de uma instalação é DESENHADO** (`PlacementHints`): quadrado branco no tile em que o
  botão vai agir; a palavra e a tecla são do balão de ação. A marca e o botão leem `canBuildMachineAt` — **uma pergunta
  só**, ou um quadrado branco
  promete um gesto que o botão recusa. Recusa = ausência de marca, nunca marca vermelha.
- **MINÉRIO NÃO É FERRO.** O veio dá `ore` — pedra com óxido. O **forno manual** transforma
  minério+carvão numa `bloom` esponjosa, e ela só vira `iron` depois de **3 marteladas** no chão
  ou no altar. O carvão é o reagente que rouba o oxigênio, não uma fonte elétrica.
- **O ALTAR é a bigorna que NÃO é máquina** (`AltarObject`; bancada: **pedra + minério**, o 2º
  degrau da escada — cobrar uma esponja por ele era circular: é nele que a esponja vira barra): laje de
  pedra, sem energia, sem direção e sem ciclo — o Z na laje vazia PÕE o item selecionado, e bater
  no que está lá (o Z de espada, ou o X com o que estiver na mão) malha. Ele aceita QUALQUER coisa e deixa bater em tudo:
  o que a pancada trabalha cospe brasa e vira outra peça em `BLOOM_BLOWS` golpes, o que não
  trabalha solta lasca cinzenta e nunca vira nada, e o X devolve o que não é malhável — assim nada
  fica preso na mesa. **O que uma pancada transforma mora em `objects/hammering.ts`**, um lugar
  só: o chão e o altar leem a mesma tabela.
- **AS DUAS MÁQUINAS DE FABRICAR SÃO A MESMA TELA E O MESMO GESTO** (bancada e forno): o A abre o
  catálogo *daquela* máquina, e o que as separa é uma palavra na receita (`station`) — nunca uma
  interação própria. O forno tinha a dele (o A acendia fantasmas), e eram duas gramáticas para o
  mesmo botão contra o mesmo tipo de peça. Estação nova = uma linha na tabela, e nada de código.
- **A BANCADA DO ACAMPAMENTO (55,45) NÃO É MAIS MESA DE FERRAMENTA: é o MODO CONSTRUIR** (pedido do autor,
  2026-11-17; `scenes/game/BuildMode` + `runtime/BuildOverlay`). O X nela GUARDA graveto, pedra, carvão e minério
  (`home.stock`); o Z PARA O JOGO INTEIRO (`scene.pause()` + `setListening(true)`, música junto) e o chão do
  acampamento vira grade: VERDE onde dá para pôr, VERMELHO no mato e onde a peça fecharia o caminho
  (`runtime/homeGrid.pathStaysOpen`: o colchão, o caderno, a bancada e as peças de usar ficam ao alcance, e as
  passagens `CAMP_PASSAGES` nunca recebem peça). Cartas = `homeMenu` (`objects/homeBuilds.ts`): o que já se
  construiu + UM degrau novo + a lembrança de cada pedido fechado (de graça, uma vez). Toque/clique escolhe o tile;
  clicar numa peça posta a muda de lugar sem custo. A GRADE É DESENHADA NO CHÃO DO MUNDO (`scenes/game/BuildGridView` +
  `render3d/campGridArt`: um canteiro de pixel art 16×16 deitado por tile, atrás do mato e das peças; a peça na mão
  aparece em pé, translúcida, no tile), nunca num canvas por cima da tela. A TÁBUA TEM LETRA GRANDE EM TODA TELA
  (pedido do autor: acessibilidade): piso de 18 px no texto e 20 px nos botões, alvo de toque ≥ 44 px, e no celular
  deitado ela vira coluna à direita (`buildPanelOnSide`, a câmera vai junto) — `construir-telas` mede as cinco telas.
  O texto abaixo vale para as OUTRAS mesas (a do mapa antigo):
- **A BANCADA É UMA MESA, e o A nela CONSTRÓI** — e o menu mostra o **MÍNIMO PARA CONTINUAR**: os
  degraus que o jogador já cumpriu, mais UM novo (`catalogSteps` + a `LADDER` de `toolboxRecipes`).
  Ele listava as onze receitas de uma vez, e onze cartas na primeira abertura não são ambição, são
  uma parede. Receita nova entra na escada, senão ela aparece no fim e fora de ordem.
  Confirmar **gasta do CHÃO EM VOLTA da máquina e da mão** (`stationCount`/`stationSpend`) e a mesa ATIRA a peça no chão ao
  lado** — nunca direto na mochila: entregar por dentro fazia a mesa martelar para ninguém, e o
  gesto ficava sem nenhuma parte visível. O destino é o vizinho mais perto do herói **que não seja
  o tile dele** (o corpo esconde o que está sob os pés), e apanhar continua sendo o B. Sem material
  — ou sem chão livre em volta — a carta treme, o insumo que falta ACENDE e o painel FICA aberto.
  Com uma mão só, o insumo se leva um de cada vez; o forno da Thea o engole da mão (`feed`).
- **NO FORNO, CONFIRMAR NÃO ENTREGA: ACENDE** (`startHandSmelt`). A mesa martela e a peça salta no
  mesmo frame — uma martelada é um instante. Fundir é um PROCESSO, e o gesto tem os três tempos na
  tela: a carga voa da mão para a boca, o fole sopra sacudindo a alvenaria, a brasa esguicha e só
  então a peça pula pela SAÍDA da frente. O produto entra no mundo no fim; morrer no meio perde a
  fornada.
- **O FORNO É UM SÓ, FIXO, E GUIA A QUEST** (o da Thea): não se constrói, não se recolhe e não tem catálogo — pede o próximo item (`AstronomerQuest.furnaceNeed`). Picareta, só a que a Thea dá.
- **CADA NPC É INDEPENDENTE** (pedido do autor): nenhum pedido precisa de ferramenta ou item de outro vizinho; o jogador faz na ordem que quiser.
- **O ACAMPAMENTO DO HERÓI COMEÇA SÓ COM O COLCHÃO, O FOGO E O CADERNO** (pedido do autor, 2026-11-17; `objects/HeroCamp.ts`): todo o resto o jogador constrói ou põe pela bancada (as peças são `objects/CampPieces.ts`, salvas em `home.pieces`; as lembranças dos pedidos NÃO aparecem sozinhas: esperam na bancada). Em volta, MATO ALTO VERDE e RALO (`scripts/mato-do-acampamento.mjs`, zona `CAMP_ZONE` 48..59 × 44..52; desde 2026-11-19 o autor o quer espalhado: um tile de chão entre dois tufos, nunca em fileira, 19 tufos): não pega fogo, só a foice corta, e o tile cortado fica cortado (`objects/CampGrass` → `home.cleared`). O colchão fixo (onde ele dorme; as três primeiras noites nele são as das visitas da Morte), as pedras frias, e o CADERNO DE CAMPO em cima do colchão (a coleção de tudo que passou pelas mãos: a lista em `runtime/notebook.ts`, alimentada só pelo `Inventory.add`; coisa nova que se pega no vale entra na lista e ganha `notebook.entry.<kind>` nos dois locales; a seção Bichos vem do caderno de desenho, `runtime/sketches.ts` + `scenes/game/AnimalSketching.ts`, bicho novo entra em `ANIMALS`, no `ART` e em `sketch.animals.<kind>`), do lado direito do laguinho (margem nordeste). O LAZER mora no `CampLife`: o desenho (`camp.sketching`), a pedra que quica (`camp.skipping`, seixo da beira, nunca a pedra da mochila) e a MEDITAÇÃO na pedra do alto da colina (`camp.meditation`; a regra pura em `runtime/meditation.ts`, testada; cada nota do caderno de lá tem a fonte científica dela, e nota nova só entra com a fonte conferida; o chão é de `scripts/meditacao.mjs`). O chão do acampamento é de `scripts/acampamento.mjs` (a mesma tabela de tiles: mudou num, muda no outro). O LAR (`scenes/game/CampHome`): a bancada (prop `toolbox` do mesmo script, usada DE FRENTE de (55,46) — esse tile fica vazio no mapa e é passagem da grade, `CAMP_PASSAGES` — ou de lado de (54,45)) e as peças de usar (tina, placa, tronco, relógio de sol, sino; o banquinho saiu em 2026-11-17 — o tronco já senta — e o save antigo o troca por tronco). CADA PEÇA UMA VEZ SÓ (`homeMenu`): a posta sai das cartas; levantada, muda de lugar de graça ou se DESMONTA (botão/Delete: o material volta à bancada e a carta à tábua); a escada anda pelo `built`; a repetida de um save antigo sai e devolve o material (`cleanHome`). PEÇA DE SENTAR entra em `CampPieces.CAMP_SEAT_LIFT` com a altura do assento: o móvel fica `SEAT_BEHIND` atrás do tile e o corpo sobe (`hero.lift`) até o tampo, senão o herói some atrás dele ou o cobre inteiro; peça nova = uma linha em `HOME_BUILDS` (custo ou `gift` de quest) + `home.piece.<kind>` nos dois locales + arte em `CampPieces.pieceTexture` + a seção Casa do caderno. A capa tingida troca os TRÊS TONS exatos da capa no `hero.png` na folha inteira (`render3d/heroDye`, `homeState.CAPE_COLORS`): arte nova do herói mantém esses três só na capa, senão a tina para de tingir (ou tinge o que não devia). **O HERÓI (desde 2026-11-19)** é o cavaleiro cozy SEM ROSTO — elmo redondo de aço com viseira em T e chifrinhos de marfim, armadura de aço um degrau mais escura, BRAÇOS FINOS de aço claro, broche dourado e CAPA ÍNDIGO (a cor do herói de antes, o "roxo" dele) —, escolhido em oito rodadas julgadas no jogo (`docs/heroi-cozy/README.md`): o rosto fica atrás do elmo de propósito (o jogador se projeta nele), o T, os chifres e a capa são a marca do Zero, e o aço é AZULADO na folha porque a luz dourada do dia o leva a cinza (aço "neutro" sai bege). O autor reprovou o rosto, a túnica roxa, o cachecol e o couro, e pediu os braços ("faltou os braços"). Braço do herói é do aço CLARO e tem UM pixel de largura, no lugar de um pixel da capa (o tronco não encolhe): no aço escuro ele some na capa, e com 2 pixels o autor achou grosso e feio. A folha sai de `docs/heroi-cozy/gerar_heroi_cozy.py` (`hero-v8`), não da Sprite Factory (`hero-meditate.mjs` é o herói antigo: não reinstalar).
- **NADA NA FRENTE DO NPC** (pedido do autor): o tile exatamente de frente para um NPC (o sul dele) nunca guarda item no chão, para a conversa não se misturar com o pegar. Todo item novo cai pelo ponto único `GameScene.dropItem`/`dropNear`, e o que ia cair na frente vai para a DIREITA do NPC, depois a ESQUERDA, depois para TRÁS (`world/npcFront.ts`). O herói não pousa ali, e um save antigo com item ali é corrigido ao carregar (`enforceNpcFrontRule`). Nunca chamar `itemManager.drop` direto para um item novo. O cenário `frente-do-npc` confere.
- **Nada solto no chão que uma ferramenta produz**: graveto só de árvore seca cortada, pedra só de rocha quebrada (`scripts/ajustes-do-vale.mjs`).
- **A automação industrial foi removida por completo.** Não existem energia, cabos, esteiras,
  extratores, braços, baús de linha, martinete automático, bateria, caldeira, placas ou portões
  eletrônicos. A caixa de correio/venda aérea também não existe. Saves antigos apenas descartam
  esses tipos durante a migração.

`hearth` **a FOGUEIRA DO FIM: não segue o relógio, só o herói a acende (Z), e Z com um graveto na
mão assa um marshmallow (nunca cogumelo) e fecha o jogo** · `gardenGate` (a porta sem chave: abre quando o último pedido
fecha) · `toolbox` caixa de ferramentas manual (graveto+pedra=machado, graveto+ferro=foice,
pedra+pedra=forno, pedra+minério=altar) · `furnace` forno manual (madeira+madeira=carvão,
minério+carvão=bloom) · `altar` laje manual de martelar · `ironRock`/`iron` (mesma rocha,
`ore: true`) · `swingGate` (a trava sem chave: só abre com o tile de trás livre) · `moonflower`
(abre no escuro).

## A montanha em cubo, e a água que anda

As duas coisas saem do mesmo assado (`World3D.buildTerrain`), e as duas nasceram do mesmo defeito:
o mundo do overworld é feito de **tiles**, e um tile só sabia ser um quad chapado.

- **A montanha é CUBO** (`buildTileCubeGeometry`, o mesmo caminho da alvenaria de dungeon): teto de
  planalto em `y=1` e faces laterais só onde o vizinho não é montanha (a poda de voxel). Um quad em
  pe é o adesivo de uma montanha — e o topo, que é a metade que uma câmera de cima realmente vê,
  não existia. Cubo e quad continuam em malhas separadas porque `solidQuads` (o índice que o
  machado usa) assume 4 vértices por tile.
- **O volume é PINTADO, não iluminado** (`ROCK_CUBE_SHADE`, cor de vértice). O material leva
  `normalUp` — toda face acende como se olhasse para cima, que é a lei de luz deste jogo —, então
  sem sombreado no vértice teto e frente saem no mesmo tom e o cubo volta a ler como adesivo.
- **Custo medido:** 6.147 montanhas viram 9.321 faces (18,6k triângulos contra 12,3k dos quads,
  ×1,52) — a poda interna é o que segura isso, porque a esmagadora maioria dos blocos está cercada
  de blocos e não mostra lado nenhum. Em troca a malha ficou **opaca** (o quad em pé era
  `alphaTest`, que descarta fragmento e atravanca o early-Z).
- **A arte da montanha é a pedra que já estava no CHÃO** (frames 23/24, "Chão de Pedra": uma arte de
  parede que estava deitada), copiada em pé para os frames 39/40. A parede gerada que estava lá
  antes foi deletada (`spritefactory/sprites/cliff-wall.mjs`) e o frame **41 ficou vazio** de
  propósito: id de frame é posicional, e apagar a linha re-apontaria todo tile de dungeon. É uma
  cópia dos pixels e não uma referência porque o editor mapeia **um frame para uma camada** — chão
  e parede têm de ser dois ids.
- **A água do mundo é o frame do MAR, e ela era uma foto.** Rio-prop (`WaterObject`) tem um quad por
  tile que já ciclava `water_0..3`; o mar são milhares de quads numa malha só, sem objeto nenhum —
  e o gerador do overworld escreve **toda** água (rio, lago, oceano) como esse frame. Então o
  movimento vem do shader (`worldFx: 'seaFlow'`, material `terrain-sea`): a janela amostrada
  escorrega dentro do frame em **texel inteiro** (a arte do mar é cíclica no toro de 16×16, então o
  `mod` costura sem emenda e pixel art não escorrega meio pixel), a **arrebentação** avança e recua
  sobre a rampa de costa que a malha carrega por vértice (`aShore`, a mesma leitura de 3 vizinhos
  que a oclusão-ambiente do chão faz) com borda serrilhada por texel, e o glint de lua é o mesmo do
  rio. As cores da beira são a própria ramp de água: a costa lê como água **rasa**. Quanta vida ela
  tem é um knob vivo — `hd3d.seaFlow` (1 = padrão, 0 = a foto de antes, 2 = o dobro): "mais/menos
  movimento" é decisão de olho, e não pode custar uma recompilação.
- **A ÁGUA NA TELA É UMA SÓ.** O rio é prop no dado (`WaterObject`: colisão, ponte, vau, comporta),
  mas a superfície dele o `World3D` assa com o material do lago — prop de água não desenha quad.
- `npm run playtest -- montanha` guarda as duas: compara os pixels do atlas (39 é 23, 41 vazio),
  exige teto e face sul na malha de rocha com o tile fora do índice de quads e ainda bloqueando, e
  mede a água por **A/B contra um controle de chão parado** — sem o controle, uma poeira passando
  na frente aprovaria uma água completamente imóvel.

## Renderização: as leis que doem

- **A CÂMERA É A DOS JOGOS HD-2D** (2026-11-19, aprovada pelo autor como definitiva): 27° para baixo, lente de 18°
  (`worldParams`: 9,1192 / 17,1126). Ela olhava 46,5° com lente de 30°. Tudo que contava com a direção antiga foi
  refeito junto e tem de ser refeito de novo se ela mudar: o fog (conta da câmera), o piso da tela em pé
  (`WorldScreen`), a flor da lua (`DEPTH_UP` = tg da inclinação, `spritefactory/sprites/moonflower.mjs`), as máscaras
  de cima (`AirLight`/`ShadowLayers`, centradas AO NORTE do herói, `MASK_NORTH`) e as lentes de cena, que somam
  FOV sobre a lente do chão (`SeaVista`, `StarGaze`, `TeaTrip`), e o PASSO VERTICAL (`verticalStepSpeedup`: ×1,6, para
  subir e descer não parecerem câmera lenta; as pernas giram no ritmo de sempre). Zoom é dolly (os dois números pelo
  mesmo fator).
- **O DESFOQUE É UMA LENTE, pela DISTÂNCIA** (`finishShader` "A LENTE", `hd3d.dofDepth`/`dofBand`/`dofRamp`/`bokeh`):
  nítido a 2,4 tiles de profundidade do herói, borrado (com bokeh) só no fundo, e só amacia o pé da tela. A névoa de
  distância é pela mesma profundidade. A cor separa nos cantos e pulsa no baque da câmera (`hd3d.aberration`).
  `playtest camera-hd2d` fotografa o antes (câmera e lente velhas, por knob) e o depois nos mesmos lugares.
- **Nada pode adicionar ou remover uma luz THREE em runtime.** O three assa a *contagem* de luzes na chave de todo
  shader: um `scene.add(pointLight)` no meio do jogo recompila o mundo (~550ms). Fogo **empresta** de um pool fixo
  (`FIRE_LIGHT_SLOTS`); mesh pode nascer e morrer, luz não. `perf-burn` guarda isso.
- **A LUZ NO AR, A SOMBRA DAS NUVENS E O CÉU NA ÁGUA são pós e uniforms, nunca luz THREE** (`render3d/AirLight.ts`, `atmosphere.ts`). O ar e os corpos leem as sombras de chão numa MÁSCARA vista de cima: sombra de chão nova usa `tintShadowMaterial` (a cor é `hd3d.shadowTint`) e entra em `AirLight.renderMask`, senão não faz facho nem escurece quem pisa nela. Todo billboard em pé aparece na água (`WaterMirror`).
- **`prewarmShaders()` roda com o render target do composer ligado** — o mundo nunca é desenhado
  no canvas, e o three assa o color space do alvo na chave do programa. E ele **DESENHA**, não só
  compila: no ANGLE (Chrome/Windows) o shader só termina no primeiro draw (o rio travava 312ms).
- **A luz pontual do CHÃO sai do `GroundLightMap`** (uma conta por célula, não por pixel): mexer na
  conta de luz do `pixelArtLight` exige mexer nele também. Ele também escreve o ALCANCE das luzes acesas
  (`groundLightReachUniform`): fora dessa caixa o material com encaixe na grade pula o laço de luz pontual (vale zero
  exato pelo corte `distance`). Luz pontual nova precisa estar em `WorldLights.livePointLights`, senão ela some fora da
  caixa. E **nada de `THREE.Points`** (`ParticleBatch`).
- **POÇA DE LUZ NO CHÃO é do `GlowField`** (`render3d/world/GlowField.ts`): as poças dos fogos, da lava e das janelas
  são malhas de `WorldLights` que só guardam lugar/tamanho/força (`setFireGlow`, material invisível); o campo soma todas
  UMA vez por célula (8 por tile) numa textura e desenha um quadro só. Poça nova = `addFireLight`/`addStillGlow`,
  nunca um quad aditivo grande próprio (eram 50 de 15×15 tiles na lava: 3,5 ms de GPU na fonte termal).
- **Cúpula de céu desenha POR ÚLTIMO, no plano distante** (`SeaSky`: `gl_Position.z = w`, `renderOrder` alto,
  sem gravar profundidade): o teste de profundidade só a deixa pintar onde nada foi desenhado.
- **NÃO HÁ TONE MAPPING.** O mundo é desenhado num render target, e o three só monta o ACES quando
  o alvo é a tela — então o linear vai cru pro canvas e **`hd3d.exposure` não faz nada**. Quem levanta
  um quadro é a CURVA (`hd3d.lift`); só o alto ROLA até o branco (`hd3d.shoulder`). O claro-escuro do dia é um PAR:
  mais luz (`ambient`/`moon`/`lightCap` juntos) E curva mais reta. Mexer num sem o outro escurece ou lava o dia.
- **O MUNDO TEM TRÊS TABELAS DE HORA, e o SOL é a mesma luz que a lua** (`skyPreset.ts`: a noite é o padrão,
  `DAY_SKY` e `GOLDEN_SKY` são deltas pesados por `daylight` e `golden`): cor de luz, de céu ou de partícula cravada
  num arquivo só existe numa delas — e some, ou fica preta, nas outras. Ela é knob ou é um valor por tabela.
- **Nenhum sprite pode vazar do seu tile.** Profundidade vem do shader, nunca de escalar arte. **A MATA é a exceção desenhada** (`render3d/forest.ts`, pedido do autor): a COLISÃO é da grade (um tile, uma árvore, no dado), mas cada árvore sai do centro em pixel inteiro e veste uma forma da família `forest-trees` (frames 78..119; as altas são duas células na mesma coluna do atlas, só com dois tiles em pé ao norte). Forma nova de árvore entra lá, nunca centrada à mão; a sombra lê o `look` do tile (`solidCastArt`, que segue o espelho). As ANCIÃS do jardim alto (73/74 no dado) vestem a família `ancient-grove-2` (135..140: larga, jovem, torta, gêmea, alta de dois tiles), espelhadas, pela coordenada (`forest.ancientLookAt`). A mata e o capim balançam na RAJADA do vale (`windGustUniform` = `runtime/wind.gustAt`), medidos do chão de cada árvore (`aWind.w`); folhas caem das copas (`objects/nature/FallingLeaves`) e de dia raios de sol entram nos vãos da mata (`objects/nature/SunShafts`: calmos, sem piscar — as manchinhas de sol que dançavam foram reprovadas). **Só o chão puro fica deitado** (o tile de capim e de terra, e o que É chão: trilha, estrada, poça, água, trinca, folha caída). TODA a decoração do mapa fica EM PÉ (`render3d/standingDecor.ts`): a planta se curva (`aFlex`, = `WIND_STIR_FRAMES`), o rígido fica parado; a GRAMA fica em FIOS (`grassBlades.ts`, `BLADE_FRAMES`): cada risco em pé no ponto do pé dele no desenho, nunca o quadro como cartão; a haste cresce em pixel INTEIRO (`bladeGrowth`, nunca esticar), a sombra de contato fica deitada, e o herói abre esteira e passa por trás dos fios da frente (`decorSway.ts`). Nunca plantar vegetação nova por cima (dois matos, em pé e chapado, poluem: o autor reprovou) — a exceção pedida é o SUB-BOSQUE da mata fechada, só nos tiles de árvore e nas clareiras da mata de fora, feito das PRÓPRIAS árvores na malha delas (`forest.forestUnderstory`: mudas, jovem e copas afundadas, com a cor e a roupa da árvore; a decoração não combinava), só nos VÃOS e com folga (`TRUNK_ROOM`/`PLANT_ROOM`: nada colado num tronco nem noutra planta), mais o capim e o mato alto do mapa onde o chão da mata aparece (`forest.forestGrass`: peça PARADA, `still` — um quad por tufo, sem fio, vento nem pisão; ali ninguém pisa), com a sombra de mata `FOREST_SHADE` no chão: ali o herói nunca pisa, e o chão vazio prometia uma passagem.
- **TODA MALHA DE CHÃO PINTA COM `groundShadeAt`** (bioma × mancha × sombra de copa × sombra de canto): uma que pinte por conta própria faz um risco reto onde encosta no chão comum. `chao-sem-risco` mede. **A cor do bioma é RAMPA da folha, não multiplicação** (`render3d/biomeRamp.ts`): o `biomeTintAt` é só dos materiais de terreno; sprite INTEIRO tingido pelo bioma usa `biomeWashAt`, senão a flor e o tronco viram a cor do capim.
- **Tudo em que o herói pisa declara `depthLayer: 'ground'`** (`Billboard3D`), senão dois quads
  coplanares piscam. Quads deitados (buracos, água, flor aberta) são isentos.
- Material com `onBeforeCompile` **precisa** de `customProgramCacheKey`.
- **O canvas do mundo pode ser MAIOR que a tela e DESLOCADO** (câmera de pixel suave, quando um pixel
  desenhado ocupa mais de um do aparelho): tela ↔ mundo só por `projectTile`/`screenToGround`, nunca por `innerWidth`.
- **O VENTO é vertex shader nas duas malhas de terreno, e o que NÃO balança é uma máscara por
  vértice** (`aWind`): elas são fundidas por camada, então o túmulo mora na mesma malha do pinheiro
  e o seixo na do capim. Frame novo de árvore/mato entra em `WIND_SWAY_FRAMES`/`WIND_STIR_FRAMES`;
  frame novo de pedra ou osso fica **fora**, ou o cemitério passa a tremer.
- Prop montado com vários billboards precisa de **ordem interna de profundidade** (o braço e a
  caixa de ferramentas z-fightavam consigo mesmos).
- Direção de prop é **frame**, nunca rotação (`setAngle` gira no plano da câmera).
- **Tudo que o billboard desenha é ESTADO dele** — `apply()` reescreve posição e escala inteiras a
  cada `setPosition`/`setDisplaySize`, então o que for arranhado direto no `mesh` some no frame
  seguinte. Foi assim que o `setFlipX` ficou anos sem virar ninguém. **O bestiário é desenhado de
  frente e não espelha ao andar**: espelhar só inverte a luz, que nesta arte vem sempre da esquerda.

## Verificando uma mudança

**QUEM RODA OS TESTES É O AUTOR, SEMPRE.** Não rode `npm run playtest` por conta própria e não
escreva cenário sem ele pedir: implemente, rode `typecheck`/`lint`/`test`/`build`, diga **qual cenário
guarda o que mudou** e pare.

**O JOGO NÃO CHAMA O NAVEGADOR DIRETO.** Tudo o que vem de fora passa por uma porta:
- **O motor 2D:** `src/game/engine/host.ts`, chegando pela config (`new Game({ host })`). Por ela vêm
  o relógio, o quadro, o canvas, a imagem, o JSON, o desenho na GPU e a página (teclado, mouse,
  foco e tamanho).
- **O jogo:** `src/game/platform/platform.ts`, que o `main.ts` instala como primeiro import. Por ela
  vêm canvas de pintar (`createCanvas()`), armazenamento (`localStore()`/`sessionStore()`), `fetch`,
  áudio (`null` = jogo mudo), o renderizador 3D e a janela (`display`).

Código novo usa essas portas, nunca `document.createElement('canvas')`, `localStorage`,
`new AudioContext()`, `new THREE.WebGLRenderer` ou `window.innerWidth`. As telas em DOM (diálogo,
pausa, minijogos, editor) continuam no DOM: o DOM é o meio delas.

**Testes de unidade** (`npm test`, Vitest, ~15 s, sem navegador). Cada teste roda numa plataforma de
teste (`src/test-support/`) instalada pelo `setup.ts`: canvas 2D de verdade (o pacote `canvas`),
arquivos de `public/`, armazenamento em memória, sem som e sem GPU (o 3D desenha num renderizador
nulo).
- **O motor contra o gabarito** (`src/game/engine/__tests__/`, que **não se regera**: teste vermelho
  ali é o motor mudando de comportamento). O gabarito já tem toda curva de easing que o motor conhece:
  um nome fora dele cairia no Linear sem aviso, e o teste acusa. Os números comparam com folga de ulps
  (o `Math.pow` do V8 muda o último bit entre versões do Node): não volte para igualdade exata.
- **O motor sozinho:** cenas, objetos, texto, entrada, câmera e carregador (`bootEngine`).
- **O JOGO INTEIRO** (`bootGame`, em arquivo com `// @vitest-environment jsdom`): o mesmo
  `ZeroTheHeroGame`, jogado por teclado e lido pelo `gameDebug`. Exemplos: a abertura, andar, o
  diálogo, a pausa e o editor (pincel, salvar, o "testar").
- **Os minijogos** (colheita, lenha, fogo, lente, céu) com relógio falso (`vi.useFakeTimers`).
- **O som** com um contexto que só anota (`recordingAudio.ts`).
- **As regras:** catálogos de texto, biomas, `world.json` e o armazém do editor.
- **Os sistemas da cena** (`systems/`, `world/visitPath`, `render3d/sceneCull`) com host falso e dublês (`CatParts`, `RestParts`).

`npm run test:coverage` gera o relatório (`coverage/index.html`), com piso de 60% de comandos.

**O DEPLOY TEM PORTÃO** (pedido do autor): nos dois workflows (`deploy-pages.yml` e
`deploy-itch.yml`), o job **"Lint e testes de unidade"** roda primeiro. O build e o deploy só rodam
se ele passar (`needs: test`). Com um teste vermelho, nada vai ao ar, nem no GitHub Pages nem no
itch.io. Não tire esse `needs` nem pule os testes para "destravar" um deploy: conserte o teste ou o
código.

**Rodar o jogo para testar é SEMPRE mudo** (o `GameDriver` garante: `--mute-audio` + volumes
zerados). O harness (`playtest/`) é Playwright com cabeça; entre com `?play`; não dirija o jogo
por aba MCP (aba oculta congela o rAF). **Cenário fala com o jogo só pelas sondas** (`gameDebug`, `appDebug`, `editorDebug`:
`src/game/debug/probes/`, TypeScript conferido pelo tsc), mais `hd3d`, `gameTime` e `__prof`; ler `window.__scene` ou importar `src/` na página
reprova o `playtestContract.test.ts`. Membro novo que um cenário precisa ler vira sonda. **Teste EXATAMENTE o que você mudou** — o `zerar` leva ~10 minutos.
**Uma rodada de playtest por vez, em lotes** (`--budget=8`, depois `--resume`): cada cenário usa um navegador novo, com guarda de memória e relatório gravado a cada cenário (`playtest/README.md`, "A memória").

A abertura (espada real fincada, mago) → `abertura`; o jogo inteiro, título → créditos → `zerar` (só para mudança que atravessa o arco); machado → `machado`; pedra →
`pedra`; altar → `altar`; flor da lua → `flor-da-lua`; montanha → `montanha`; vento na mata → `vento`;
menu → `menu-flow`; nenhum bloqueio sem nada visível → `sem-parede`; trilha, leitos de dia/noite/água e SFX → `audio`; a cerimônia de ganhar item → `item-get`; o vale respondendo aos pedidos e a vida dos NPCs → `marcas`; sentar na fogueira e ver o tempo passar → `descanso`; fogueira de vizinho nunca faz dormir → `fogueira-dormir`; borboletas e folhas do dia → `dia`; a quest inteira da Thea → `telescopio`; os ajustes do autor jogando (cadeira, aceno, bolsa, carvão, lava, título) → `ajustes`; o jardim do fim em dois andares → `jardim-alto`; o lar (bancada guarda material, grade com o jogo parado, peças postas com o mouse, mato verde, foice abrindo espaço, recarga) → `lar`; o acampamento mínimo e a lembrança esperando na bancada → `acampamento`; o mato alto fio a fio, a roçada, as pontas voando, os tocos e a grade no chão → `mato-alto`; os tocos somem e o mato sem uso volta com o tempo → `mato-volta`; o modo construir legível e funcional no computador, tablet e celular → `construir-telas`; as três noites da Morte e a foice só na terceira → `morte-tres-noites`; nenhum risco reto de cor no chão → `chao-sem-risco`; tamanho do herói → `smoke`; fogo e luz → `perf-burn`; frame → `perf-profile`; o quadro em cada lugar do mapa (acampamento, lava, Thea, praia, cadeira, fonte) → `perf-lugares` (`PERF_LUGARES=praia,fonte` filtra).
A suíte inteira está verde (2026-11-09): um cenário vermelho é regressão, ou um cenário que precisa acompanhar uma mudança
de desenho — nunca "conserte" editando conteúdo do jogo para o teste passar.

**Performance sempre contra a `main`** (`git stash`) ou, melhor, com a variante antiga e a nova ligáveis na MESMA
sessão. **Nesta máquina (monitor de 165 Hz) não medir com vsync livre** (`PLAYTEST_UNTHROTTLED=1`): o Chrome alterna
de regime e mostra travadas de 90–180 ms que não existem no jogo (achado de 2026-11-19). Meça com vsync: o
`perf-lugares` grava os intervalos do rAF por lugar (o quadro sai em múltiplos de ~6 ms: 12 ms = perdeu um vsync) e,
para saber ONDE a GPU gasta, um cronômetro `EXT_disjoint_timer_query_webgl2` por passe do compositor ou por draw
(não aninham: um modo de cada vez). O timer do `__prof` mede só o `composer.render` (não o espelho nem a luz do
chão) e o profiler infla o tempo de CPU. O knob `hd3d.pixelScale` é sobrescrito a cada quadro pelo ajuste do menu.
Mudança de renderer: `npm run playtest -- visual-ref` + `node
playtest/compare-visual.mjs <dirA> <dirB>` (duas rodadas do mesmo build diferem em **0 pixels**).
Armadilha: o three gasta `Math.random()` em UUID, então alocar um número diferente de objetos no
boot muda o ritmo das chamas e o diff "falha" por 40% da tela sem nada de render ter mudado.

## Outras coisas fáceis de errar

- **Nenhuma classe passa de 300 linhas** (`classSize.test.ts` reprova): a que cresce se divide em peças por assunto, ligadas ao dono por um campo (o molde e as armadilhas estão no `progress.md`).
- **A GameScene e o World3D não crescem.** Sistema novo (estado + decisões) vai para `src/game/systems/` no molde
  das quests: um `Host` pequeno que a cena implementa e um teste com host falso. Peça de render nova, módulo próprio em `render3d/`.
- **A interface é MADEIRA, PAPEL ou PIXEL — nunca "interface"** (`runtime/uiStyle.ts`): painel novo
  usa `WOOD_PANEL`/fonte de livro, o que o herói escreve usa o papel e a pena, tecla/botão usa
  `pixelFrame`. Fonte do sistema, pílula e painel preto de filete fino estão proibidos.

- **A cena não chama `shutdown()` sozinha** — ligue via `events.once(SHUTDOWN, ...)`, ou um
  `scene.restart()` vaza listeners entre runs.
- **O motor gasta `Math.random()` sempre nos mesmos pontos** (31 por texto criado, no UUID da textura; 1 no boot; os
  sorteios das partículas e do tremor de câmera): é o que mantém a sequência de sorteios do jogo igual. Não troque
  esses sorteios por outra coisa.
- **Mudança em cena não faz hot-reload**; o `beforeunload` do editor bloqueia o reload automático,
  então você fica olhando código velho.
- **Fala de NPC vive no `public/world.json`**, não só em `NPC_DIALOGS` — NPC novo precisa dos dois.
- `mat.needsUpdate = true` na troca de textura de sombra parece desperdício e não é (senão a sombra
  do herói congela num frame do passo).
- Editor: **G gira** (não R, que é o retângulo); `UI_STATE_KEY` sobe de versão junto com a *forma*
  do `UiState`; o Salvar avisa sobre entidades em tiles inválidos.
- Profiler: `?prof` boota com ele, **F3** alterna compacto → top, `__prof.report()`/`.csv()`
  despejam. Ele mede GPU de verdade (timer query) e **nomeia a causa** de cada pico.
- **PAINEL DE TESTES** (só local: dev server ou localhost; `devToolsAllowed`): a tecla **à esquerda do 1**
  (`Backquote`: ' no ABNT2) abre, para o jogo e fecha com ela ou Esc; no toque, o botão "Testes" no canto. Abas:
  concluir pedidos (um ou todos — pelo contador do caderno, `QuestLog.forceQuestDone`, e a mesma comemoração do jogo,
  então a chave do jardim vem), pôr material/ferramenta na mão, encher a bancada, liberar construções, cortar o mato
  do acampamento, pular as noites da Morte, hora do dia, teleporte, gravar/apagar o save. A tela é `debug/DevPanel` +
  `debug/devPanelViews`; o que cada botão faz é `scenes/game/DevTools` — sempre pelos caminhos do jogo. Ação nova = um
  método em DevTools + um botão na aba. Shift+I continua sendo o lançador de páginas (`DevLauncher`).
  Cenário: `painel-testes`.

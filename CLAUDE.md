# Zero the Hero

Aventura top-down em pixel art, **só em inglês** (não há mais locale nenhum). **Phaser 3** cuida da
lógica, input e UI num canvas **transparente**; o mundo embaixo dele é **3D de verdade** (Three.js,
`src/game/render3d/`). O menu é **uma tela e um botão** — o título cai direto na aventura. Levels e
**explorador** continuam vivos e sem porta no título (`/?level=N`, `?explorer`, ou o **[I]** do
DevLauncher); os três modos são a mesma `GameScene`.

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
npm run lint             # eslint (scripts/worldgen tem 3 erros de parser pré-existentes — ignore)
npm run build            # typecheck + vite build
#  NUNCA rode `generate:levels` NEM `generate:world` — os dois SOBRESCREVEM o que foi feito à
#  mão, sem merge e sem perguntar (ver abaixo). Para mexer no mundo: o /editor, ou um script que
#  LÊ o world.json e acrescenta (`node scripts/enrich-world.mjs` é o modelo).
npm run playtest         # cenários default
npm run playtest -- all  # todos
```

A porta 5173 costuma estar ocupada por outro projeto. Para playtest, suba o Vite numa porta livre:

```bash
npx vite --port 5180 --strictPort
PLAYTEST_BASE_URL=http://localhost:5180 npm run playtest -- perf-burn
```

## Os dois botões, a mochila e a subtela

O jogo **não é mais só-andar**. Detalhes e consequências: `progress.md`.

    A (Z / J / espaço)  →  a ESPADA, na área à frente do herói. Sem espada, o soco.
    B (X / K)           →  PEGA o item do chão; FALA com o NPC à frente; senão usa o escolhido
                           no tile à frente, ou o pousa.
    ESC                 →  a subtela: mochila + corações, e quem escolhe o item do B.

No toque são dois círculos no canto de baixo (`ActionButtons`, ordem do NES: B à esquerda), e eles
aparecem em qualquer aparelho de dedo (`isTouchDevice`).

- `GameScene.pressAttack` / `pressUse` são ligados **por evento de teclado**, nunca por `JustDown`
  (o `update` tem meia dúzia de saídas antecipadas onde uma tecla lida por polling morre). O A tem
  `keyup` também — segurá-lo carrega a **lâmina rodopiante** (corta os 8 vizinhos) —, e a repetição
  de tecla se filtra pelo `event.repeat`, nunca por um booleano nosso: um `keyup` perdido mataria o
  botão. Pedido feito na cadência **espera** (130ms), nunca some.
- **A parede VIRA o herói** (`PlayerMovementController`): precondição dos dois botões, que agem no
  tile à frente. Ele encara, não entra. E **virar-se para uma criatura é de graça** — a primeira
  investida só vira o corpo (`turnedTowardCreature`), insistir cobra o dano de contato. Só criatura.
- **O golpe varre a ÁREA à frente — o bloco 2×3** (`SWING_ARC_NEAR` + `SWING_ARC_FAR`), e quem
  mostra isso é a **órbita do punho** (`SLASH_ORBIT_FACTOR`): a espada é sempre o sprite da espada,
  no tamanho dela — o golpe alcança porque o braço estende, **nunca** porque a arte cresce ou porque
  um efeito desenhado entra na frente dela. A fileira de trás precisa de **caminho**
  (o tile do meio não pode ser parede — senão a lâmina cortaria através da rocha), e o **soco só
  alcança a primeira**: alcance é da arma, não do braço.
- **Golpe que não mata compra espaço e tempo**: arremessa um tile (`EnemyBase.shove`, consultando o
  **mesmo mundo** em que o bicho anda — luz de fogueira inclusive) e atordoa (`applyHitstun`).
  Espécie que escreve a própria posição (torreta, zora) **precisa** de `canBeShoved = false`.
- **NADA morre de um golpe** (`MELEE_DAMAGE.sword` = 2; só o graveto ACESO ainda mata em um). Era
  999, e com isso o telegrafo de 500ms de cada espécie nunca acontecia: o encontro inteiro era
  chegar perto e apertar Z. Toda lei abaixo depende desta.
- **O corpo tem i-FRAMES** (`EnemyBase.hurtInvulnMs`, 450ms) e o golpe que cai neles **resvala**
  (anel pálido, sem dano). Sem isso um arco de 6 tiles a cada 260ms é uma serra.
- **O golpe armado do bicho NÃO se cancela batendo nele, e ele GUARDA a frente enquanto arma**
  (`guardsAgainst`): a resposta ao telegrafo é sair do tile e contornar. Espécie sem frente
  (gosma, morcego) devolve `guardsWhileWindingUp = false`. **O telegrafo marca o TILE mirado** (um
  anel que fecha no chão): a resposta é sair de lá, então o lugar tem de estar na tela.
- **Toda recusa tem desenho PRÓPRIO**: resvalo de i-frames = anel azul frio (espere) · guarda =
  faíscas quentes NO LADO guardado (contorne), anunciadas por um brilho no mesmo lado durante o
  telegrafo · encontrão contra parede = poeira + hitstop extra (`shove` devolve
  `'moved' | 'slammed' | 'immovable'`). Duas recusas com o mesmo pixel não ensinam nenhuma.
- **NÃO existe barra de vida** (o esqueleto dela foi deletado). Quem conta é o CORPO: ele escurece
  conforme perde vida (`woundedShade`, que multiplica o tom permanente da espécie em vez de
  substituí-lo) e deixa MARCA ao morrer — `die()` liga `corpseMark`, `despawn()` não, e quem tem
  arte própria de morte (a poça da gosma) devolve `leavesCorpseMark = false`.
- **Atacar PRENDE os pés** (`SWING_ROOT_MS` = 160, o giro 260): sem compromisso, espaçamento não
  custa nada. `PlayerMovementController.root` impede COMEÇAR um passo, nunca congela um em curso.
- **O escudo do herói é a DIREÇÃO EM QUE ELE OLHA, e só apara TIRO** (`blocksBlowFrom`, cone de
  90°; guarda baixa enquanto ataca). Se aparasse golpe de corpo, encarar seria invencibilidade.
- **O esbarrão ficou só com os gestos de corpo**: empurrar caixote, portão de bater, sentar na
  fogueira acesa (a loja) — e tomar dano de contato. **Falar NÃO é esbarrão** (é o B): um gesto que
  para o jogo inteiro não pode acontecer por a seta ter encostado em alguém de passagem.
- `useItemAt` é a tabela de itens (machado→árvore, picareta→rocha, tocha→fogueira morta…). Devolve
  `false` só quando o item não tem nada a ver com o tile, e **só então** `placeItemAt` pousa ali.
- **Depositar é o B** (bandejas, buraco de plantio, marca de bomba, entrada do braço…), e **pegar
  também**: o herói **nunca** recolhe nada por pisar em cima (`pickUpItemAt` — o tile à frente
  primeiro, o de baixo dos pés depois). No passo ficaram só **carregar** a bateria num cabo vivo e
  comer carvão com a tocha acesa. Moeda e coração não são itens e continuam entrando andando.
- A mochila (`runtime/Inventory.ts`) guarda em vez de trocar; `GameScene.heldItem` é um **getter**
  sobre a seleção (uma fonte de verdade só). Trocar de item **apaga a tocha**.
- **Overlay 2D preso ao herói se ancora na posição VISUAL** (`visualWorld`), nunca na lógica: a
  lógica pula pro tile de destino quando o passo começa, e o corpo desenhado fica um tile atrás.
- **Golpe não ACENDE o corpo que o levou:** tint branco em billboard `emissive` é silhueta chapada
  que o bloom espalha, e o hitstop a congela acesa. Tint no bicho só pro que não é dano.
- **Não há exceção aos dois botões.** Houve um revólver que se mirava com o mouse em 360°; ele foi
  arrancado inteiro (arma, balas, cruz de mira). Nada neste jogo se aponta.
- `npm run playtest -- combate` guarda o contrato dos botões; `esgrima`, a mão do combate.

## O mundo, os levels (`/levels`) e o lab (`/lab`)

- **⚠️ NUNCA rode `generate:levels` NEM `generate:world`.** `gen-levels.mjs` sobrescreve
  `public/levels/level-1.json` e `index.json`; `generateWorld.ts` sobrescreve o `world.json`
  inteiro por um mundo **8×8 sem portal, sem NPC autorado e com uma fogueira** — e o de hoje é
  22×8, feito à mão no `/editor`. Os dois escrevem **sem merge e sem perguntar**. Ficam no repo
  como scaffolding, e só depois de apontar a saída para um caminho desocupado.
- **Mexer no mundo em massa é um script que LÊ o `world.json` e acrescenta** — nunca um que o
  refaz. `scripts/enrich-world.mjs` e `scripts/place-enemies.mjs` são os modelos: idempotentes
  (miram num TOTAL, não num delta), determinísticos (zero `Math.random()`) e proibidos de tocar em
  `ground`, `collisions` e no que o autor já pôs — quando a regra nova conflita com o autorado, o
  tile dele sobrevive e só a espécie cede. Faça um backup antes assim mesmo.
- **Leia o JSON, nunca a documentação, para saber o que um level contém** — um level muda sempre
  que seu autor abre o lab.
- **Um level é SEMPRE exatamente um chunk 12×12. Nunca maior.** A câmera enquadra ~um chunk:
  caminhar não é puzzle. Se não couber, corte o puzzle.
- **Cada level se resolve sozinho:** `playerStart` próprio + uma **fogueira-lar acesa** (a mais
  próxima do spawn — é assim que o runtime escolhe), toda outra apagada; só as ferramentas do
  puzzle. **Um puzzle só é puzzle se o caminho fácil estiver fechado** — asserte a *trava*.
- **Um playtest AUTORA a fixture que precisa** (entra no `/lab`, coloca props pelo `EditorStore`,
  aperta P) em vez de depender do conteúdo de um level.
- `/lab` edita um level (`?level=N`) via `/api/world?file=level-N`; **P** joga o mundo em memória,
  **ESC** volta; nada salva até o Salvar. `/?level=N` e `/lab?play` bootam direto.
- O **cerco de undead** (`UndeadSpawnDirector`) está desligado em mundo-puzzle (`isPuzzleWorld()`).
  Isso vale só pro cerco: **inimigo autorado (aba Inimigos) funciona em level, nas 7 espécies**.
- Um level mostra dois botões flutuantes (↻ recomeçar, com confirmação de 2 toques, e pausa) —
  `LevelButtons` em `PauseMenu.ts`.

## O explorador (`src/game/explorer/`) — a única aposta do jogo

Mundo gerado enquanto o herói anda, acampamento seguro no centro, risco × recompensa em 3 números:
**longe paga mais** (`coinMultiplierAt`, degraus, teto x8), **50% se você escolher parar** (portal
pergunta, `ExtractPrompt`), **5% se o escuro escolher por você** (morrer; reiniciar custa o mesmo).
O perigo sobe mais devagar que a recompensa (`dangerScaleAt`), senão ir fundo seria neutro.

- O mundo entra pelo mesmo buraco de fechadura do `world.json` (`WorldData.setInfiniteWorld`).
- O renderer segura uma **janela** de 5×5 chunks (`ExplorerDirector`) e reassa o terreno ao cruzar
  a fronteira (~15-25ms); `terrainMats` guarda os materiais **porque material novo em runtime
  recompila todo shader do mundo**.
- **`FOREST_FILL_PERCENT` = 34% e subir isso reabre um bug fechado**: chão aberto é percolação por
  sítios (`p_c ≈ 0.5927`), e acima de ~40% de mata o mundo quebra em bolsões — com portal dentro.
- `npm run playtest -- explorador` guarda o modo inteiro.

## Fogo, e a lei das travas

- **Fogo é o único sistema que o jogador conduz** (`scheduleFireSpread`/`igniteFlammableAt`): um
  tile em chamas acende os 4 vizinhos. Combustível: mato alto, arbustos secos e **pontes de
  madeira**. Pedra, água, lava e chão pelado são corta-fogo.
- **Fogueira APAGADA pega fogo de um vizinho** (é o ponto: acender sem o herói ir lá). **Fogueira
  ACESA nunca espalha** (é sumidouro). **Mato alto barra o herói e conduz fogo.**
- **Toda outra trava é uma fechadura com uma chave só, e ela responde com FÍSICA, nunca com
  legenda.** O balão de item-que-falta foi arrancado. **Trava nova ganha um tremor, não um texto**
  — se só uma legenda ensinaria o que fazer, o que precisa de conserto é a arte da peça.
- **Itens devem PRODUZIR, não só apagar** (árvore→graveto/ponte, picareta→pedra, foice→sementes).
  Pergunte de qualquer item novo: o que ele *faz*?
- **Dois machados:** `axe` (só madeira morta) e `greatAxe` (qualquer árvore, superset do primeiro —
  um item novo nunca invalida o que o jogador já tem). Árvore é **tile**, não prop (846 no
  `world.json`, um draw call), então o machado de aço edita **terreno**.
- **A borda do mundo é MAR** por causa disso: nada no jogo remove água (`SOLID_GROUND_FRAMES`
  bloqueia até as botas de lava). Tile de terreno novo = **frame novo num atlas existente**
  (`node spritefactory/install-tile.mjs`), só acrescentando linhas.

## As peças (o contrato de cada uma está no `progress.md`)

`inserter` braço robótico (leva item sozinho; `dir`; corta a energia e ele **desfaz** a entrega) ·
`toolbox` caixa de ferramentas (haste+cabeça: graveto+pedra=machado, graveto+ferro=foice) ·
`ironRock`/`iron` (mesma rocha, `ore: true`) · `pressurePlate` (herói, caixote **ou inimigo** —
a caveira MARCHA até uma placa que enxerga) · `waterWheel` · `boiler` (fogo→energia) · `wire`
(corrente é flood-fill por adjacência; forma nasce dos vizinhos) · `battery` (carrega pisando em
cabo vivo; **encaixa** com B num cabo morto) · `electronicGate` (fail-closed) · `swingGate` (a
trava sem chave: só abre com o tile de trás livre) · `moonflower` (abre no escuro; uma arte
avaliada em 9 aberturas) · `enemies` (ponto de spawn: um corpo por cova, volta em
`ENEMY_RESPAWN_MS`; luz de fogueira acesa cala a cova) · `levelPortal` (a travessia em 4 tempos,
com um `scene.restart()` no meio).

## O bestiário (`src/game/entities/enemies/`, um arquivo por espécie)

- **Espécie nova nasce de uma FRASE, não de uma tabela de HP** — o que ela diz que nenhuma outra
  diz. Números diferentes fazem inimigos diferentes no papel e o mesmo inimigo na mão.
- **Luz de fogueira é parede pra TODO monstro** — é a alavanca central do jogo e não tem exceção.
  A **tocha** é outra coisa: uma *lista* (`fearsTorch`), e há quem a ignore.
- **Chegar é um evento e todo golpe é telegrafado** (`WalkerEnemy`). Corpo que aparece do nada, ou
  que fere sem aviso, desmente a promessa que a caveira ensinou.
- **Onde cada espécie PODE existir é uma lista só** (`FLYING_ENEMY_KINDS` / `AQUATIC_ENEMY_KINDS`,
  em `ScreenContent`): o corpo, a cova e o aviso do editor leem dela. Três cópias já discordaram.
- **Água tem DUAS procedências e quem pergunta por uma só quebra**: prop `water` (levels) e tile de
  terreno (overworld). Uma resposta só, `GameScene.isOpenWaterAt`. Fora do mundo o chão também é
  mar — o teste de chunk não é opcional.
- **Projétil é a única coisa em coordenada CONTÍNUA de tile** (`EnemyProjectile`): parede mata bala,
  luz e água não. Ele brilha por ser `emissive`, **nunca por trazer uma luz**.
- **UMA ESPÉCIE POR TELA.** O chunk é a região (a câmera enquadra ~um), e duas espécies na mesma
  tela não são variedade: são ruído, porque cada corpo pede uma resposta diferente e nenhuma dá pra
  aprender. Quem impõe isso no `world.json` é `node scripts/place-enemies.mjs` — e o número que se
  olha ao mexer nele **não** é covas por tela, é **covas dentro de 14 tiles** (a cova acorda na
  distância de visão da caveira, que vale ~4 telas: 3 por tela viram 13 corpos em volta do herói).

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
- `npm run playtest -- montanha` guarda as duas: compara os pixels do atlas (39 é 23, 41 vazio),
  exige teto e face sul na malha de rocha com o tile fora do índice de quads e ainda bloqueando, e
  mede a água por **A/B contra um controle de chão parado** — sem o controle, uma poeira passando
  na frente aprovaria uma água completamente imóvel.

## Renderização: as leis que doem

- **Nada pode adicionar ou remover uma luz THREE em runtime.** O three assa a *contagem* de luzes
  na chave de cache de todo shader: um `scene.add(pointLight)` no meio do jogo recompila o mundo
  inteiro (~550ms travados). Fogo **empresta** de um pool fixo (`FIRE_LIGHT_SLOTS`); mesh pode
  nascer e morrer, luz não. `perf-burn` guarda isso.
- **`prewarmShaders()` roda com o render target do composer ligado** — o mundo nunca é desenhado
  no canvas, e o three assa o color space do alvo na chave do programa.
- **Nenhum sprite pode vazar do seu tile.** Profundidade vem do shader, nunca de escalar arte.
- **Tudo em que o herói pisa declara `depthLayer: 'ground'`** (`Billboard3D`), senão dois quads
  coplanares piscam. Quads deitados (buracos, água, flor aberta) são isentos.
- Material com `onBeforeCompile` **precisa** de `customProgramCacheKey`.
- Prop montado com vários billboards precisa de **ordem interna de profundidade** (o braço e a
  caixa de ferramentas z-fightavam consigo mesmos).
- Direção de prop é **frame**, nunca rotação (`setAngle` gira no plano da câmera).
- **Tudo que o billboard desenha é ESTADO dele** — `apply()` reescreve posição e escala inteiras a
  cada `setPosition`/`setDisplaySize`, então o que for arranhado direto no `mesh` some no frame
  seguinte. Foi assim que o `setFlipX` ficou anos sem virar ninguém. **O bestiário é desenhado de
  frente e não espelha ao andar**: espelhar só inverte a luz, que nesta arte vem sempre da esquerda.

## Verificando uma mudança

**Rodar o jogo para testar é SEMPRE mudo.** Nunca com efeito sonoro: a janela é visível (o WebGL
exige) e uma suíte inteira grita na sala de quem está trabalhando. O `GameDriver` já garante isso
por construção (`--mute-audio` + volumes zerados antes do boot) — não desligue.

O harness (`playtest/`) é Playwright com cabeça: dirige o jogo real e asserta estado real. Novo
cenário em `playtest/scenarios/` + registro no `index.mjs`. Entre **sempre com `?play`**. Não
dirija o jogo por aba MCP (aba oculta congela o rAF do Phaser). Handles vivos: `window.__scene`,
`__game`, `hd3d`, `gameDebug`, `__prof`.

**Teste EXATAMENTE o que você mudou.** Não replay o jogo inteiro para checar algo pontual — os
solves completos levam minutos, são sensíveis a timing e flakeiam.

Dois botões / mochila / subtela → `combate`; **mira, arco de 3 tiles, arremesso, atordoamento e a
lâmina rodopiante → `esgrima`**. Machado, árvore e borda → `machado`; rocha e picareta →
`pedra`; contratos de estado de item → `itens`. Braço → `braco`; caixa de ferramentas →
`caixa-ferramentas`; placa com herói/caixote → `caixa-placa`, e a caveira que marcha até uma →
`placa-undead`. **Aba Inimigos e a cova que devolve o inimigo → `inimigos`; o bestiário que anda →
`fauna`; torreta, mago e a lei do tiro → `projeteis`; o zora e a janela dele → `zora`.**
Roda → `roda-agua`;
caldeira → `caldeira`; fios → `fios`; bateria → `bateria`; portões → `portao-eletronico` e
`portao-de-bater`. Flor da lua → `flor-da-lua`; travessia do portal → `portal-travessia`;
explorador → `explorador`. **Montanha em cubo e a água que anda → `montanha`.** Fogo e o orçamento
de luz → `perf-burn`; custo de frame → `perf-profile`.

**`espada` e `itens` estão VERMELHOS por mudança de design** (eles assertam o level-1 gerado antigo,
e o `espada` ainda resolve tudo esbarrando). Não "conserte" editando level. O menu (uma porta só,
sem idioma e sem intro) → `menu-flow`; o herói **nascendo do tamanho certo** → `smoke`. Uma falha
num cenário que você não tocou é um flake a anotar, não uma suíte a rodar quatro vezes.

**Performance sempre contra a `main`** (`git stash`), e sempre com vsync livre
(`PLAYTEST_UNTHROTTLED=1 PLAYTEST_SLOWMO=0`) — com vsync a GPU só *reduz o clock* e toda variante
mede igual. Mudança de renderer: `npm run playtest -- visual-ref` + `node
playtest/compare-visual.mjs <dirA> <dirB>` (duas rodadas do mesmo build diferem em **0 pixels**).
Armadilha: o three gasta `Math.random()` em UUID, então alocar um número diferente de objetos no
boot muda o ritmo das chamas e o diff "falha" por 40% da tela sem nada de render ter mudado.

## Outras coisas fáceis de errar

- **O Phaser não chama `shutdown()` sozinho** — ligue via `events.once(SHUTDOWN, ...)`, ou um
  `scene.restart()` (morte) vaza listeners entre runs.
- **Mudança em cena não faz hot-reload**; o `beforeunload` do editor bloqueia o reload automático,
  então você fica olhando código velho.
- **Fala de NPC vive no `public/world.json`**, não só em `NPC_DIALOGS` — NPC novo precisa dos dois.
- `mat.needsUpdate = true` na troca de textura de sombra parece desperdício e não é (senão a sombra
  do herói congela num frame do passo).
- Editor: **G gira** (não R, que é o retângulo); `UI_STATE_KEY` sobe de versão junto com a *forma*
  do `UiState`; a forma do cabo nunca é autorada, nasce dos vizinhos; o Salvar avisa (bandeja
  bloqueada, roda seca, portão sem cabo, cova em tile bloqueado ou na luz).
- Profiler: `?prof` boota com ele, **F3** liga o HUD, `__prof.report()`/`.csv()` despejam. Ele
  mede GPU de verdade (timer query) e **nomeia a causa** de cada pico.

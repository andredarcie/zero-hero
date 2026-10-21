# Zero the Hero

Aventura **cozy** top-down em pixel art, **só em inglês**. **Phaser 3** cuida da lógica, input e
UI num canvas **transparente**; o mundo embaixo dele é **3D de verdade** (Three.js,
`src/game/render3d/`). **O JOGO É 100% PACÍFICO: não existe combate, inimigo, dano, vida, morte
nem game over** — e nada se perde. Combate, bestiário, subterrâneo, escadas, bombas, lava, pira e
planta carnívora foram REMOVIDOS por inteiro (código, arquivos e conteúdo). `/` é o jogo e
`/editor` é o editor; não há terceira rota.

## O arco do jogo (um só, e ele mora em `GameScene`, seção "A HISTORIA")

1. **A abertura** (`playIntro`): à noite, o cavaleiro chega pela estrada do sul com a espada nas
   costas, a finca no chão (ela fica ali para sempre e bloqueia o tile), olha em volta entre
   vaga-lumes, e o mago chega andando e fala. Toca uma vez por partida (`introSeen` no save).
2. **Os vizinhos** (`dialogs/NpcQuests.ts`): um pedido pequeno por NPC, cada um com o PRESENTE
   que o torna possível (`gift`). Pedido novo = uma entrada lá + falas `npc.<id>`/`npc.<id>Done`
   no locale.
3. **O portão** (`openGardenGate`): quando `allQuestsDone()`, o `gardenGate` do centro abre.
4. **A fogueira do fim** (`hearth`, `tendHearthAt` → `playRoastEnding` → `rollCredits`): Z acende,
   Z de novo com graveto + cogumelo assa, e os créditos voltam ao título.

`npm run playtest -- zerar` joga tudo isso do título aos créditos com o teclado. **O texto do jogo
mora no locale (`en.json`)**, inclusive o roteiro `<id>Done`; o `world.json` guarda retrato,
cor e voz. **Todo texto usa o MÍNIMO de palavras** — só a essência, nada de floreio (pedido do autor).

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

## Os dois botões, a mochila e a subtela

    Z (J / espaço)  →  a MÃO: fala com o NPC à frente, acende/assa na fogueira do fim, abre o
                       catálogo da bancada/forno, põe e malha no altar. Nada no Z é golpe.
    X (K)           →  USA o item selecionado no tile à frente (a tabela `useItemAt`).
    pisar           →  APANHA (`collectUnderfoot`).
    I               →  a BOLSA (não pausa o jogo).   ESC → a subtela (mochila + mapa).

- `pressAttack`/`pressUse` são ligados **por evento de teclado**, nunca por `JustDown`; a
  repetição se filtra por `event.repeat`.
- **A parede VIRA o herói** (`PlayerMovementController`): é assim que se mira. Contra tile LIVRE a
  seta anda — não há virar-no-lugar.
- **A FERRAMENTA CERTA SE APRESENTA SOZINHA** (`toolWantedAt`) e a **MOCHILA SÓ GUARDA O QUE TEM
  GESTO** (`isBagItem`; matéria-prima e cogumelo são contadores).
- **Overlay 2D preso ao herói se ancora na posição VISUAL** (`visualWorld`), nunca na lógica.
- **Cutscene é `cutsceneActive`**: o `update` para, o `render3D` (POST_UPDATE) continua — por isso
  vaga-lumes e herói moram lá. Passo roteirizado = `scriptStep`, nunca o controlador.
- **As estações são exclusivamente MANUAIS** e **não existe dinheiro**: recompensa é item ou nada.

## O mundo (`world.json`) e o editor (`/editor`)

- **HÁ UM MUNDO SÓ, e só a superfície.** Levels, `/lab`, explorador e o subterrâneo
  (`underworld.json`, escadas) foram removidos. **`scripts/cozy-world.mjs`** é o passo que tirou o
  combate do mundo e montou o jardim (rode com `--check`: o disco tem de ser o ponto fixo).
- **O jardim do centro é fechado por PROVA DE BFS**, e a sebe tem colisão PINTADA: árvore com
  colisão pintada não é cortável (`treeTileFrameAt`) — senão o machado de aço abre o portão.
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
- **As fogueiras comuns seguem o relógio** (acesas à noite); só a `hearth` é do herói.
- **CHÃO + UMA COISA. Um tile tem o `ground` e, em cima dele, no máximo UMA — `upper`, prop, item,
  ou NPC.** O editor cumpre (colocar limpa o tile, pintar `upper` pula o tile ocupado); quem
  quebra é script e JSON à mão. `npm run audit:stacks` confere, `scripts/fix-tile-stacks.mjs` conserta.
- **Um playtest AUTORA a fixture que precisa** (entra no `/editor`, limpa um quintal e coloca
  props pelo `EditorStore`, aperta P) em vez de depender do que o mundo autorado contém hoje.
- `/editor` edita o `world.json` via `/api/world`. **P** joga o mundo em memória (sem abertura e
  sem save), **ESC** volta; nada salva até o Salvar.

## Fogo, e a lei das travas

- **Fogo é o único sistema que o jogador conduz** (`scheduleFireSpread`/`igniteFlammableAt`): um
  tile em chamas acende os 4 vizinhos. Combustível: mato alto, arbustos secos e **pontes de
  madeira**. Pedra, água, lava e chão pelado são corta-fogo.
- **Fogueira APAGADA pega fogo de um vizinho** (é o ponto: acender sem o herói ir lá). **Fogueira
  ACESA nunca espalha** (é sumidouro). **Mato alto barra o herói e conduz fogo.**
- **O HERÓI PENSA ALTO em UM caso só** (`HeroThought`): bater num arbusto seco com o graveto
  APAGADO acende um balão de ÍCONE (a tocha) sobre a cabeça dele. Não é o balão de
  item-que-falta ressuscitado — aquele respondia a qualquer fechadura e entregava o enigma;
  este só existe com o item JÁ na mão e o gesto JÁ feito, e mostra ícone, nunca palavra.
- **Toda outra trava é uma fechadura com uma chave só, e ela responde com FÍSICA, nunca com
  legenda.** O balão de item-que-falta foi arrancado. **Trava nova ganha um tremor, não um texto**
  — se só uma legenda ensinaria o que fazer, o que precisa de conserto é a arte da peça.
- **Itens devem PRODUZIR, não só apagar** (árvore→graveto/ponte, picareta→pedra, foice→sementes).
  Pergunte de qualquer item novo: o que ele *faz*?
- **Dois machados:** `axe` (só madeira morta) e `greatAxe` (qualquer árvore, superset do primeiro —
  um item novo nunca invalida o que o jogador já tem). Árvore é **tile**, não prop (846 no
  `world.json`, um draw call), então o machado de aço edita **terreno**.
- **O FORA DO MUNDO trava por COORDENADA, não por material** (`buildVoidChunk`): todo tile de lá
  nasce com `collisions: true`, e `treeTileFrameAt` recusa editar fora dos chunks autorados. São
  as duas travas — tirar uma abre uma porta para fora do mapa. Por elas a arte de lá é livre: em
  cima é floresta sob névoa negra, embaixo é a alvenaria de teto preto. (Já foi mar, quando a
  única trava era o material.) Tile de terreno novo = **frame novo num atlas existente**
  (`node spritefactory/install-tile.mjs`), só acrescentando linhas.

## As peças (o contrato de cada uma está no `progress.md`)

- **ESTAÇÃO É ITEM: o X instala no tile à frente, e o X recolhe — TUDO que se instala se recolhe**,
  inclusive o autorado. Instalar É
  usar, então mora na tabela `useItemAt`; a direção nasce de para onde o herói olha, nunca de um
  menu. Recolher deixou de exigir mão vazia (esse estado sumiu com a bolsa sempre cheia): ele é o
  degrau DEPOIS da tabela e da entrega, então ferramenta que tem o que fazer ali nunca desmonta.
- **O alvo de uma instalação é DESENHADO** (`PlacementHints`): quadrado branco no tile em que o
  botão vai agir + o keycap da tecla. A marca e o botão leem `canBuildMachineAt` — **uma pergunta
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
- **A BANCADA É UMA MESA, e o A nela CONSTRÓI** — e o menu mostra o **MÍNIMO PARA CONTINUAR**: os
  degraus que o jogador já cumpriu, mais UM novo (`catalogSteps` + a `LADDER` de `toolboxRecipes`).
  Ele listava as onze receitas de uma vez, e onze cartas na primeira abertura não são ambição, são
  uma parede. Receita nova entra na escada, senão ela aparece no fim e fora de ordem. A mesma
  escada vale para a página de PLANOS da subtela — duas listas discordando é uma segunda voz.
  Confirmar **gasta da mochila e a mesa ATIRA a peça no chão ao
  lado** — nunca direto na mochila: entregar por dentro fazia a mesa martelar para ninguém, e o
  gesto ficava sem nenhuma parte visível. O destino é o vizinho mais perto do herói **que não seja
  o tile dele** (o corpo esconde o que está sob os pés), e apanhar continua sendo o B. Sem material
  — ou sem chão livre em volta — a carta treme, o insumo que falta ACENDE e o painel FICA aberto.
  Não existem bandejas funcionais: o catálogo e a mochila são o único caminho de fabricação.
- **NO FORNO, CONFIRMAR NÃO ENTREGA: ACENDE** (`startHandSmelt`). A mesa martela e a peça salta no
  mesmo frame — uma martelada é um instante. Fundir é um PROCESSO, e o gesto tem os três tempos na
  tela: a carga voa da mão para a boca, o fole sopra sacudindo a alvenaria, a brasa esguicha e só
  então a peça pula pela SAÍDA da frente. O produto entra no mundo no fim; morrer no meio perde a
  fornada.
- **A automação industrial foi removida por completo.** Não existem energia, cabos, esteiras,
  extratores, braços, baús de linha, martinete automático, bateria, caldeira, placas ou portões
  eletrônicos. A caixa de correio/venda aérea também não existe. Saves antigos apenas descartam
  esses tipos durante a migração.

`hearth` **a FOGUEIRA DO FIM: não segue o relógio, só o herói a acende (Z), e Z com graveto +
cogumelo assa e fecha o jogo** · `gardenGate` (a porta sem chave: abre quando o último pedido
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
- **NÃO HÁ TONE MAPPING.** O mundo é desenhado num render target, e o three só monta o ACES quando
  o alvo é a tela — então o linear vai cru pro canvas e **`hd3d.exposure` não faz nada**. Sem ombro
  segurando o alto, 1.0 é corte seco: subir luz estoura o branco antes de clarear a sombra (é para
  isso que existe o `lightCap`). Quem levanta um quadro é a CURVA, `hd3d.lift` no `FinishShader`.
- **O MUNDO TEM DUAS HORAS DO DIA, e o SOL é a mesma luz que a lua** (`skyPreset.ts`, o delta que
  `hd3d.daylight` aplica sobre a noite): cor de luz, de céu ou de partícula que você cravar num
  arquivo só existe numa das duas — e some, ou fica preta, na outra. Ela é knob ou é dois valores.
- **Nenhum sprite pode vazar do seu tile.** Profundidade vem do shader, nunca de escalar arte.
- **Tudo em que o herói pisa declara `depthLayer: 'ground'`** (`Billboard3D`), senão dois quads
  coplanares piscam. Quads deitados (buracos, água, flor aberta) são isentos.
- Material com `onBeforeCompile` **precisa** de `customProgramCacheKey`.
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
escreva cenário sem ele pedir: implemente, rode `typecheck`/`lint`/`build`, diga **qual cenário
guarda o que mudou** e pare.

**Rodar o jogo para testar é SEMPRE mudo** (o `GameDriver` garante: `--mute-audio` + volumes
zerados). O harness (`playtest/`) é Playwright com cabeça; entre com `?play`; não dirija o jogo
por aba MCP (aba oculta congela o rAF). Handles: `window.__scene`, `__game`, `hd3d`, `gameDebug`,
`__prof`. **Teste EXATAMENTE o que você mudou** — o `zerar` leva ~5 minutos.

A abertura (espada real fincada, mago) → `abertura`; o jogo inteiro, título → créditos → `zerar` (só para mudança que atravessa o arco); bolsa → `bolsa`; machado → `machado`; pedra →
`pedra`; pá → `pa`; altar → `altar`; flor da lua → `flor-da-lua`; montanha e água → `montanha`;
menu → `menu-flow`; nenhum bloqueio sem nada visível → `sem-parede`; trilha, leitos de dia/noite/água e SFX → `audio`; a cerimônia de ganhar item → `item-get`; o vale respondendo aos pedidos e a vida dos NPCs → `marcas`; sentar na fogueira e ver o tempo passar → `descanso`; borboletas e folhas do dia → `dia`; tamanho do herói → `smoke`; fogo e luz → `perf-burn`; frame → `perf-profile`.
Cenários que ainda citam o mundo antigo (`prologo`, `vento`, `sem-fabrica`, `ferro`, `tour`)
podem estar vermelhos: não "conserte" editando conteúdo.

**Performance sempre contra a `main`** (`git stash`), e sempre com vsync livre
(`PLAYTEST_UNTHROTTLED=1 PLAYTEST_SLOWMO=0`) — com vsync a GPU só *reduz o clock* e toda variante
mede igual. Mudança de renderer: `npm run playtest -- visual-ref` + `node
playtest/compare-visual.mjs <dirA> <dirB>` (duas rodadas do mesmo build diferem em **0 pixels**).
Armadilha: o three gasta `Math.random()` em UUID, então alocar um número diferente de objetos no
boot muda o ritmo das chamas e o diff "falha" por 40% da tela sem nada de render ter mudado.

## Outras coisas fáceis de errar

- **O Phaser não chama `shutdown()` sozinho** — ligue via `events.once(SHUTDOWN, ...)`, ou um
  `scene.restart()` vaza listeners entre runs.
- **Mudança em cena não faz hot-reload**; o `beforeunload` do editor bloqueia o reload automático,
  então você fica olhando código velho.
- **Fala de NPC vive no `public/world.json`**, não só em `NPC_DIALOGS` — NPC novo precisa dos dois.
- `mat.needsUpdate = true` na troca de textura de sombra parece desperdício e não é (senão a sombra
  do herói congela num frame do passo).
- Editor: **G gira** (não R, que é o retângulo); `UI_STATE_KEY` sobe de versão junto com a *forma*
  do `UiState`; o Salvar avisa sobre entidades em tiles inválidos.
- Profiler: `?prof` boota com ele, **F3** liga o HUD, `__prof.report()`/`.csv()` despejam. Ele
  mede GPU de verdade (timer query) e **nomeia a causa** de cada pico.

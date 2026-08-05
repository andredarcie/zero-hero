# O que falta para a aventura ser um jogo — diagnóstico e plano

*2026-08-04. Varredura profunda do repositório (arquitetura, narrativa, conteúdo do mundo, UI/UX
e o `progress.md` inteiro) atrás do que é **praticamente obrigatório** num jogo de mundo aberto
focado em narrativa e exploração — e que hoje não existe.*

## O diagnóstico, em ordem de gravidade

1. **O final do jogo é inalcançável.** A condição de vitória é acender uma fogueira apagada e
   voltar ao mago — mas acender exige carregar uma chama (graveto aceso), e o mundo autorado não
   tem **nenhuma** fonte de madeira: zero `dryTree`, zero `dryBush`, zero `tallGrass`, e o
   `greatAxe` (único item que derruba os 3.871 pinheiros-tile) não é obtível em lugar nenhum.
   Dos 15 tipos de pickup autoráveis, o `world.json` contém exatamente **1** (a espada). O mundo
   8×8 antigo tinha 69 props e 27 itens; o 22×8 atual tem 18 props e 1 item.
2. **Não existe save.** Fechar o browser apaga tudo. Morrer apaga quase tudo (mochila, moedas,
   fogueiras, diálogos, história do mago) — e **entrar numa dungeon também apaga a história**,
   porque a travessia usa `scene.restart()` e os flags do mago vivem na instância da cena.
   Num mundo aberto de 264×96 tiles, recomeçar do zero a cada sessão não é dificuldade, é
   descarte do jogador.
3. **`meta.puzzle: true` ficou esquecido no overworld.** O gerador declarou a flag como
   temporária ("sai quando o bestiário entrar"); o bestiário entrou (363 covas) e a flag ficou —
   desligando a **loja** e o **cerco de undead** no mundo inteiro.
4. **A economia não tem entrada nem saída.** `rewardKill` só funciona no explorador; matar as
   363 covas da aventura dá zero moedas, e a única saída (a loja da fogueira) está atrás da flag
   acima. Coração: zero no mundo, zero em drop — há **um** ponto de cura no mundo inteiro.
5. **As 9 dungeons são 506 chunks vazios.** Zero inimigos, zero itens, zero recompensa — cada
   portal do overworld leva a um labirinto oco cujo único conteúdo é a escada de saída.
6. **Nenhuma orientação espacial.** Sem mapa, sem bússola, sem nome de região, num mundo de 176
   telas. A única seta que existe (bússola de fogo) só aparece à beira da morte.
7. **A história não aponta.** O beat "protect" do mago diz "proteja ESTA chama" — o oposto
   literal da ação que destrava o final (acender OUTRA fogueira). Nada no jogo comunica o
   objetivo.
8. **A música do mundo existe e está desligada.** "Ashen Fields" (`music-overworld.wav`) está no
   repo, mantida "para revival fácil"; a exploração hoje é vento puro até o perigo tocar.

## As leis do projeto que o plano respeita

- **"O mundo ensina, o HUD não"** — nada aqui adiciona HUD em jogo. O mapa vive na subtela ESC
  (que já mostra os corações), a direção vem da fala do mago, a economia é diegética.
- **Mexer no mundo em massa = script que LÊ o `world.json` e ACRESCENTA** — os dois scripts
  novos seguem `enrich-world.mjs`/`place-enemies.mjs`: determinísticos, idempotentes (miram
  TOTAL, não delta), proibidos de tocar `ground`/`collisions`/autorado. Backup antes.
- **Trava responde com física, não legenda** — nenhuma legenda nova; o que muda de texto é fala
  de NPC, que é o canal narrativo do jogo.
- **Título com uma porta** — continua uma tela; "Continue" substitui o texto do botão quando há
  save, e "Start over" é uma linha discreta abaixo (a porta continua sendo uma).

## As fases

### Fase 0 — Destravar o mundo
Remover `meta.puzzle: true` do `public/world.json`. Religa a loja (bump na fogueira acesa) e o
cerco de undead — o jogo que o resto do código já esperava estar ligado.

### Fase 1 — A fogueira lembra (save da aventura)
`src/game/runtime/adventureState.ts`, no padrão do `dungeonTrip` (estado de módulo sobrevive ao
`scene.restart()`) + `localStorage['zh.adventure.v1']` (sobrevive ao browser). Guarda: fogueira
de respawn, mochila (+ seleção), moedas, upgrades, fogueiras acesas, flags do mago
(`wizardIntroSeen`, `litFireCount`), diálogos vistos, cerimônias de item vistas, árvores
derrubadas (diff de terreno), pickups tomados (por arquivo: mundo e cada dungeon), chunks
visitados (para o mapa). `GameScene.create()` hidrata do módulo; os eventos que mudam o mundo
(acender fogueira, comprar, pegar item, viajar) salvam. `TitleScene`: com save existente o botão
vira **"Continue"**, com **"Start over"** discreto abaixo.
*Consequência de graça: a travessia de dungeon deixa de apagar a história do mago.*

### Fase 2 — A morte não apaga o mundo
Na aventura, morrer devolve o herói à última fogueira acesa em que descansou (a home por
default), **com a mochila, as moedas, os upgrades, as fogueiras e a história intactos** — o
custo da morte é a distância. Explorador (5% da bolsa) e levels (restart de puzzle) mantêm o
comportamento atual, que é desenhado.

### Fase 3 — Economia viva
`rewardKill` passa a valer na aventura: moeda fixa por kill (sem multiplicador de profundidade,
que é do explorador). Inimigo morto tem chance de dropar coração quando o herói está ferido.
Com a Fase 0, a loja volta a existir; com a Fase 1, os upgrades comprados persistem.

### Fase 4 — O mundo reganha as ferramentas (e o final vira alcançável)
`scripts/enrich-overworld-props.mjs`: espalha pelo mundo autorado `dryTree` (madeira → tocha),
`dryBush` (carvão), `rock`/`ironRock` (pedra/ferro), `tallGrass` (sementes) — em tiles andáveis,
longe do que o autor pôs, determinístico. É o que devolve o loop central do jogo (levar a chama
às fogueiras mortas) e dá uso a machado, picareta e foice na aventura.

### Fase 5 — As dungeons ganham corpo e tesouro
`scripts/enrich-dungeons.mjs`: inimigos por sala (espécies sobem a escada com o número da
dungeon, uma espécie por chunk, sem zora — não há água), corações esparsos, e **um tesouro na
sala mais funda** (BFS a partir da entrada): uma ferramenta única por dungeon — axe, bucket,
pickaxe, scythe, bomb, lavaBoots, battery, greatAxe, key — para explorar dungeon valer o desvio.
Tesouro tomado persiste no save.

### Fase 6 — O mapa na mochila
A subtela ESC ganha o mapa do mundo: grade 22×8 com fog of war (chunks visitados, persistidos),
fogueiras acesas, portais descobertos e o herói. Pixel art mínima, DOM como o resto da subtela.

### Fase 7 — A história aponta o caminho
O "protect" do mago passa a dizer o objetivo real: o mundo está cheio de fogueiras mortas, leve
a chama até elas. A "prophecy" reconhece o feito. Só texto (`en.json`), no tom que já existe.

### Fase 8 — O som do mundo
Religar "Ashen Fields" como trilha da aventura, sob o vento, com o override de danger existente.

## Verificação

- `npm run typecheck` a cada fase; commits semânticos na `main`, um por fase.
- Cenários que guardam o que muda: `menu-flow` (título), `combate`/`esgrima` (nada do combate
  muda), `inimigos` (covas autoradas nas dungeons), `explorador` (o modo não pode regredir —
  todo gate novo checa `isExplorerMode()`/`getActiveLevel()`).
- Cenário novo `salvamento` (playtest): morre e confere que a mochila e as fogueiras
  sobreviveram; recarrega e confere o Continue.
- Os playtests ficam para o autor rodar (lei da casa); esta lista diz qual guarda o quê.

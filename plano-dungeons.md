# Plano — as nove dungeons passam a ser GERADAS (e a lembrar-se de si)

Objetivo: `dungeon-1..9` deixam de ser nove arquivos fixos e passam a nascer de uma **semente da
partida**. Uma vez geradas, elas são **daquele save para sempre** — entrar, sair, morrer, fechar a
aba e voltar devolve a mesma planta, com o tesouro que já foi tomado ainda tomado.

O risco desta mudança não é técnica, é de qualidade: o jogo troca nove plantas de 1986 desenhadas à
mão por um algoritmo. Este plano existe para que a troca seja para melhor, e a espinha dele são
seis leis destiladas de quem já fez isso bem (fontes no fim).

---

## O que existe hoje (medido, não lembrado)

| | |
|---|---|
| como nascem | `scripts/gen-zelda-dungeons.mjs` lê os mapas do Zelda 1 em PNG e classifica pixel a pixel |
| o que são | 9 JSONs em `public/levels/`, 95 KB a 183 KB, de 8×6 a 11×8 chunks (6.912 a 12.672 tiles) |
| conteúdo | `enrich-dungeons.mjs` acrescenta covas (32 a **157**), corações (3 a 12) e o tesouro na sala mais funda |
| a sala | 16×11 tiles com anel de parede de 2 — a forma do cartucho, **desalinhada** do chunk 12×12 |
| como entram | `GameScene.enterDungeon` faz `fetch(levels/dungeon-N.json)` → `setWorldData` |
| o que já lembra | itens no chão por escopo (`adventureState.groundItems['dungeon-N']`) |
| o que não lembra | a planta (vem do disco, limpa) e o terreno editado lá dentro |
| props dentro | **um**: o `levelPortal` de saída. Sem fogueira, sem tranca, sem puzzle |
| portais no overworld | 9, em tiles fixos do `world.json` — a boca de cada caverna é autorada e continua |

Duas coisas ficam evidentes nessa tabela e mandam no plano inteiro:

1. **A dungeon de hoje é arquitetura sem verbo.** 57 salas e 157 covas na 9ª; nenhuma tranca,
   nenhuma chave, nenhum atalho. O que ela pede do jogador é *andar até o fim*. Um gerador que
   copiasse isso geraria labirinto — e labirinto grande é a definição do problema dos 10.000 pratos
   de aveia (Compton): matematicamente único, perceptualmente igual.
2. **O tesouro é progressão do overworld** (picareta, balde, foice, machado de aço). Isso **não**
   pode ser sorteado. O gerador recebe um *brief* e arranja o resto.

---

## A tese: o que "com qualidade" quer dizer

Seis leis, cada uma tirada de um gerador que funcionou:

1. **Ciclo, nunca árvore.** O esqueleto de uma dungeon é um LOOP entre a entrada e o objetivo, com
   dois arcos que fazem coisas diferentes. É o achado do *Unexplored*, e é o que separa "planta
   procedural" de "level design": num loop cabem tranca, atalho, volta pelo caminho de trás e
   revisita — numa árvore cabe ida e volta pelo mesmo corredor.
2. **Gerar a MISSÃO antes do ESPAÇO.** Primeiro o grafo (o que o jogador faz, em que ordem, o que
   tranca o quê), depois onde isso mora no mapa (Dormans). Inverter a ordem é como o jogo tem hoje:
   geometria bonita sem nada a resolver.
3. **O procedural arranja; o autorado preenche.** A variedade percebida vem da **quantidade de
   regra escrita à mão**, não da entropia (Spelunky, Edgar, Unexplored). Sala é template/forma
   autorada; o gerador só escolhe qual vai onde.
4. **Conexo por construção, provado por BFS.** Brogue cresce a masmorra por acreção justamente para
   nunca precisar podar sala inalcançável. Aqui a lei já existe no repositório (*"prop que bloqueia
   só entra com prova de BFS"*) — o gerador herda ela e o juiz é um flood-fill, não uma heurística.
5. **Pequeno e denso, não grande e vazio.** Dorman: é muito mais interessante gerar níveis pequenos.
   Alvo: **10 a 20 salas**, contra as 57 de hoje.
6. **Um marco por dungeon.** Uma sala que só aquela dungeon tem (o salão do tesouro, o poço, a
   arena). É a resposta direta ao prato de aveia: o jogador precisa de uma frase para lembrar a
   dungeon 6, e "tinha muitas salas" não é uma.

**O que este plano recusa:** WFC. Ele é ótimo para textura de terreno e péssimo para intenção — não
sabe o que é "chave antes da porta", e a saída padrão é empilhar um validador de grafo por cima
para rejeitar o que ele produziu. Se o validador de grafo é obrigatório, o grafo devia ter vindo
primeiro. É exatamente o que a lei 2 diz.

---

## A arquitetura, em quatro camadas + um juiz

Tudo em `src/game/dungeon/`, espelhando `src/game/explorer/` — que já provou que dá para injetar
mundo inventado pelo buraco de fechadura do `WorldData` sem que o resto do runtime perceba.

**Regra de arquitetura, inegociável:** o gerador é TypeScript puro. Não importa Phaser, não importa
Three, não toca em `window`. Sem isso o script de auditoria (fase 5) não roda em node, e sem
auditoria não existe "qualidade", existe opinião.

### 0. O brief (autorado, um por dungeon)

`dungeonBriefs.ts` — nove entradas, o que hoje está espalhado entre `gen-zelda-dungeons` e
`enrich-dungeons`:

```
{ n: 6, nome: 'O Dragão', grade: [5, 4], salas: [14, 18],
  especies: ['undead', 'mage'], tranca: 'placa', tesouro: [['greatAxe', 1]],
  marco: 'salao', paleta: 'fria' }
```

O brief é o contrato com o resto do jogo: a escada de espécies sobe com o número, o tesouro é o que
o overworld espera, o tamanho cresce devagar. **Só a arrumação é sorteada.**

### 1. A missão — um grafo cíclico

Um catálogo autorado de **ciclos**, escrito no vocabulário deste jogo e não no genérico. Cada ciclo
devolve nós (`entrada`, `objetivo`, `tranca`, `chave`, `arena`, `recompensa`, `atalho`, `descanso`)
e as arestas entre eles; o comprimento de cada arco é sorteado dentro de uma faixa.

| ciclo | arco A | arco B | peça que ele usa |
|---|---|---|---|
| chave & porta | a chave, guardada | a porta trancada, caminho curto | `lockedDoor` + `key` |
| atalho de mão única | a volta longa até o objetivo | o portão que só abre de dentro | `swingGate` (a trava sem chave) |
| o fogo que abre | a tocha acesa | o mato alto que barra | `tallGrass` + tocha (`igniteFlammableAt`) |
| caixote & placa | empurrar o caixote até a placa | o portão elétrico que ela abre | `woodenCrate` + `pressurePlate` + `electronicGate` |
| a guarda | rota longa e limpa | rota curta atravessando a arena | covas + a lei do telegrafo |
| o fosso | contorno pela margem | a travessia (ponte/flor) | tile de mar + `moonflower` |
| o eixo (hub) | três braços curtos | a saída trancada no fim | `lockedDoor` + duas chaves |
| a rachadura | o caminho da planta | a parede rachada, atalho secreto | `wallCracked` (frame 50) + piso rachado |

Mais duas reescritas simples aplicadas 1-3 vezes sobre o ciclo escolhido — **inserir bifurcação com
recompensa numa aresta** e **alongar um arco em uma sala**. Isso é o suficiente: o Unexplored tem
~5.000 regras porque tinha o Ludoscope para editá-las; aqui, catálogo autorado é a versão honesta do
mesmo princípio, e cresce uma linha por vez.

### 2. O espaço — embutir o grafo na grade de salas

**A sala passa a ser UM CHUNK, 12×12, alinhado.** Anel de parede de 1 tile por sala (2 entre
vizinhas, que é a espessura do Zelda), interior 10×10, porta = vão de 2 tiles no meio da parede.

Por que abandonar o 16×11 do cartucho: a câmera enquadra ~um chunk, então **sala = tela**; a lei
"uma espécie por tela" passa a ser literal em vez de aproximada; a densidade de covas já se mede por
chunk; o `visitedChunks` do save já é por chunk; e o editor já autora chunk — a biblioteca de
templates da fase 4 sai de graça. O desalinhamento de hoje é herança da fonte, não escolha.

Embutir = backtracking sobre a grade (≤ 30 células, ≤ 20 nós): coloca o ciclo primeiro (é o
esqueleto), depois as bifurcações; aresta exige adjacência ortogonal. Falhou em K tentativas,
encolhe a bifurcação e re-sorteia. O Edgar faz isso com recozimento simulado porque trabalha em
espaço contínuo; numa grade discreta deste tamanho a busca fecha em milissegundos.

### 3. A sala — o que enche cada célula

Duas fontes, nesta ordem de preferência:

1. **Template autorado** (fase 4), casado por **assinatura de portas** (bitmask N-E-S-O) + papel +
   paleta. Cada template rende 8 variantes por simetria (4 rotações × espelho) — só terreno.
2. **Forma paramétrica** (fase 1, e a maioria no v1): ~12 famílias em código — pilares, ilha
   central, corredor em S, fosso em U, quatro alcovas, arena vazia, xadrez, ferradura, poço, cela,
   coluna dupla, salão. Cada forma é desenhada **por cima do esqueleto de corredores porta→centro**,
   então ela não pode selar uma porta: a conexão interna é anterior à decoração.

Por cima, as regras de enfeite (os *set pieces* do Unexplored, as *machines* do Brogue): par de
tochas de parede ladeando porta de sala importante, hera na alvenaria velha, piso rachado só onde o
gerador furou parede, fosso só onde a forma pediu.

**Colisão continua vindo do FRAME, nunca pintada** (`collisions` tudo `false`, como nas nove de
hoje): é o que faz a picareta que abre uma parede abrir junto a passagem, sem parede invisível
sobrando — a armadilha que o `explorerWorld` documenta.

### 4. O juiz — o verificador que pode dizer não

Um BFS **com estado**: o nó é ⟨tile, conjunto de trancas já abertas, itens na mão⟩. Ele prova, para
cada dungeon gerada, antes de ela existir:

- entrada → tesouro → saída, alcançáveis de verdade;
- toda chave alcançável **antes** da tranca dela, e nenhuma tranca consumindo a chave de outra
  (*soft-lock*);
- **o ciclo é real**: fechar qualquer porta de um dos arcos deixa o objetivo alcançável pelo outro;
- zero bolsão fechado com conteúdo dentro;
- nenhuma cova na sala de entrada nem a menos de 6 tiles de porta de entrada/saída (o número que o
  `enrich-dungeons` já usa), e **uma espécie por sala**;
- caminho crítico dentro da faixa do brief.

Reprovou → próxima semente (até 24 tentativas) → depois disso, um layout linear seguro. **Nunca
entregar dungeon quebrada.** Cada rejeição sai contada por motivo: é isso que a auditoria lê.

---

## A persistência (o "entrou de novo, é a mesma")

- **`runSeed`** nasce com a aventura e vive no `adventureState`. "Start over" cunha outro — as nove
  dungeons daquele save inteiro mudam, e é aí que mora o replay.
- **`dungeonSeed(N) = hash(runSeed, N)`** — determinístico, sem estado, sem `Math.random()` no
  gerador (a mesma lei do `explorerWorld`: o que existe em (x,y) é função da semente e de mais nada).
- **O retrato**, gravado ao sair da dungeon e ao morrer dentro dela: RLE da **classe semântica** por
  tile (chão / parede / fosso / rachado) + props + covas. Não se grava o frame sorteado — ele volta
  da semente.

Medido nas dungeons de hoje, que são o pior caso (elas nem foram feitas para comprimir):

| | JSON cru | RLE do frame | **RLE semântico** |
|---|---|---|---|
| dungeon-1 (6.912 tiles) | 95 KB | 31 KB | **4,0 KB** |
| dungeon-9 (12.672 tiles) | 183 KB | 68 KB | **7,8 KB** |

As nove cabem em ~50 KB dentro dos ~5 MB do `localStorage`. O RLE do frame é ruim de propósito na
tabela: ele mostra o que acontece se alguém gravar a arte em vez do significado.

**A ordem de leitura ao entrar** — e ela é a resposta à pergunta "e quando eu mexer no gerador?":

```
retrato salvo?  → hidrata (é o que o jogador viu; manda sempre)
senão           → gera da semente, grava o retrato NA HORA
```

Gravar na entrada, e não só na saída, é o que faz a primeira aba fechada não apagar a dungeon. E o
retrato mandar sobre a semente é o que faz um deploy novo não remontar o mundo de quem está no meio
da descida. `genVersion` fica gravado junto só para diagnóstico.

O que já funciona e não muda: `groundItems['dungeon-N']` (tesouro tomado não renasce), corações,
mochila, moedas. Covas continuam devolvendo corpo em `ENEMY_RESPAWN_MS` — isso é vida do mundo, não
progresso.

---

## Onde isto se pluga

| ponto | hoje | depois |
|---|---|---|
| `GameScene.enterDungeon` | `fetch(levels/dungeon-N.json)` | `hydrateOrBuild(N, runSeed)` → `setWorldData` |
| `GameScene.leaveDungeon` | `persistAdventure()` | + `snapshotDungeon(N)` |
| morte dentro da dungeon | `persistAdventure()` | + `snapshotDungeon(N)` |
| `adventureState` | — | `runSeed`, `dungeons: Map<'dungeon-N', Retrato>` |
| resto do runtime | — | **nada** |

A geração roda **dentro da travessia do portal**, que já é assíncrona e já dura ~1s (sucção, vazio,
túnel, queda): `portalTrip` recebe uma promessa e é indiferente a de onde ela vem. Orçamento:
**< 150 ms** para gerar + verificar. Passou disso, a geração vira `await` picado na sucção.

**Os nove arquivos ficam.** Eles continuam alimentando o `/lab` e a lista de levels, viram o
**controle** do A/B (`?dungeons=static`) e são a rede de segurança se a geração der errado num
build. Apagar autoria porque apareceu um gerador é a bomba-relógio que o `CLAUDE.md` proíbe em
maiúsculas.

---

## As leis do jogo que o gerador não pode quebrar

- **Uma espécie por sala** — e a densidade se mede em covas dentro de 14 tiles, não por tela.
- **O tesouro é autorado por dungeon** (a escada do overworld depende dele).
- **Sem fogueira dentro da dungeon**: a cura aqui é o coração no chão. Luz de fogueira é parede
  para monstro, e uma fogueira gerada lá dentro reescreveria o encontro inteiro.
- **Tocha de parede é tile** (frame 48) e cada uma acende uma luz do pool fixo: o gerador tem um
  **teto de tochas por tela**, senão `FIRE_LIGHT_SLOTS` estoura e o mundo recompila shader.
- **Nada de `Math.random()`**, nada de estado global, nada de ordem de visita.
- **`meta.puzzle = true`** continua (o cerco de undead fica desligado; as covas autoradas valem).
- **Nenhum script novo escreve em `public/`** em runtime. A biblioteca de templates da fase 4 é o
  único arquivo novo, e quem escreve nela é o `/lab`.

---

## Fases

- [x] **0 — O encanamento.** `runSeed` + retrato RLE no `adventureState`, `dungeonWorldFor`, o seam
      no `enterDungeon`/`leaveDungeon`/morte, `?dungeons=static` como rede.
- [x] **1 — A sala.** Dez formas paramétricas, as faixas de porta reservadas antes do desenho, o
      alagamento de ilhas, e covas/corações/tesouro pelo brief.
- [x] **2 — A missão.** Catálogo de cinco ciclos, becos até o número de salas do brief, e o
      embutimento na grade com o ciclo colocado primeiro.
- [x] **3 — As trancas.** Chave/porta e caixote/placa, com o BFS de estado no juiz. **Duas foram
      cortadas com motivo medido** (ver abaixo).
- [x] **4 — Os templates.** `public/levels/dungeon-0.json` editável em `/lab?dungeon=0`, assinatura
      de portas deduzida da geometria, 8 simetrias por peça, e oito salas de partida.
- [x] **5 — A auditoria.** `npm run audit:dungeons` — 1.350 sementes, zero reprovadas, zero
      emergências, retrato fechando o ciclo em todas. A tabela está no `progress.md`.

### O que a implementação mudou no plano

- **Duas fechaduras do catálogo não existem, e agora se sabe por quê.** O portão de bater não faz
  atalho de mão única: quem decide "o lado de lá" é o *sentido do esbarrão*, então bloquear o tile
  de trás proíbe os dois lados de uma vez. E o "fogo que abre" precisaria de uma fonte de fogo
  dentro da dungeon — que a lei da fogueira proíbe. Ficaram a chave e a placa.
- **Duas leis novas apareceram no meio do caminho**, e as duas são de GRADE, não de gosto: todo
  ciclo de uma grade tem comprimento **par** (os dois arcos precisam da mesma paridade), e nenhum
  nó pode passar de **quatro** arestas. Antes delas, metade das missões era impossível de embutir e
  a dungeon 9 caía na emergência em 1 de cada 4 sementes, com 499 ms de pior caso.
- **O retrato ficou 40% menor que o estimado**: 2,9 KB de mediana contra os 4-8 KB previstos, e
  26 KB para as nove.

---

## Testes

Cenário novo — **`npm run playtest -- dungeon`**:

1. entra pelo portal da dungeon 1; a sala de entrada tem porta e nenhuma cova a < 6 tiles;
2. **a lei da persistência**: pega o tesouro, sai, volta → mesmo hash de terreno, tesouro não
   voltou;
3. **atravessa a aba**: recarrega com `?play` e entra de novo → mesmo hash (o retrato sobreviveu);
4. **o juiz na página**: roda o verificador em 50 sementes dentro do browser e exige 100%
   aprovadas — e que duas sementes diferentes deem plantas diferentes (o teste que pega uma semente
   grudada);
5. **quota**: `localStorage` cheio não pode derrubar a aventura (o `saveAdventure` engole a exceção
   hoje; com nove retratos isso passa a ser um caminho real).

`salvamento` e `lab-dungeon` continuam guardando o que já guardavam. O `montanha`/`perf-burn` não
são tocados por isto.

---

## Riscos, e a resposta de cada um

| risco | resposta |
|---|---|
| geração trava a travessia | orçamento de 150 ms medido na fase 0, com o `await` picado como saída |
| prato de aveia (tudo igual) | catálogo de ciclos autorado + marco por dungeon + templates da fase 4 |
| perder as nove formas do Zelda | os arquivos ficam; `?dungeons=static` é o controle e a rede |
| retrato grande demais | RLE semântico: 4-8 KB medidos por dungeon, ~50 KB no total |
| gerador muda e quebra save antigo | o retrato manda sobre a semente, sempre |
| dungeon impossível chegar ao jogador | juiz + 24 sementes + fallback linear; nunca um mapa sem prova |

---

## Fontes

- [Dungeon Generation in Unexplored — BorisTheBrave](https://www.boristhebrave.com/2021/04/10/dungeon-generation-in-unexplored/) — o desmonte técnico do gerador cíclico: os 24 tipos de ciclo, os não-terminais, os biomas, a expansão grafo→grade.
- [Unexplored's Secret: 'Cyclic Dungeon Generation' — Game Developer](https://www.gamedeveloper.com/design/unexplored-s-secret-cyclic-dungeon-generation-) — o artigo do próprio Dormans sobre por que o ciclo bate a árvore.
- [Graph Rewriting for Procedural Level Generation — BorisTheBrave](https://www.boristhebrave.com/2021/04/02/graph-rewriting/) e [GraphDungeonGenerator (Dormans, missão + layout)](https://github.com/amidos2006/GraphDungeonGenerator) — missão antes do espaço.
- [Edgar — gerador por grafo com templates autorados (Nepožitek)](https://github.com/OndrejNepozitek/Edgar-Unity) e [os fundamentos, no blog dele](https://ondra.nepozitek.cz/blog/graph-based-dungeon-generator-basics-1/) — layout por grafo COM ciclos, casado com salas feitas à mão.
- [Broguelike Dungeon Creation (acreção + machines)](http://anderoonies.github.io/2020/03/17/brogue-generation.html) e [a palestra do Brian Walker](https://www.youtube.com/watch?v=Uo9-IcHhq_w) — conectividade por construção, e a passada final que transforma sala em peça temática.
- [Spelunky — Procedural Content Generation Wiki](https://procedural-content-generation.fandom.com/wiki/Spelunky) — caminho-solução numa grade + templates autorados por tipo de saída.
- [So you want to build a generator… — Kate Compton](https://galaxykate0.tumblr.com/post/139774965871/so-you-want-to-build-a-generator) — os 10.000 pratos de aveia: unicidade matemática não é variedade percebida.
- [Illuminating the Space of Dungeon Maps, Locked-door Missions and Enemy Placement (MAP-Elites)](https://arxiv.org/pdf/2202.09301) — medir o espaço gerado por dimensões de design, que é o que a fase 5 faz em miniatura.
- [Combining Constructive Dungeon Generation with WaveFunctionCollapse](https://www.sbgames.org/proceedings2020/ComputacaoShort/207911.pdf) — por que WFC precisa de um validador de grafo por cima, e portanto por que o grafo vem primeiro.

# O chão do overworld — o achado, a medição e o plano

> Análise feita em 2026-08-23 rodando o jogo de verdade (Playwright, 1280×720, `?play`), medindo os
> pixels do quadro e o atlas de terreno. Nada aqui é impressão: cada número abaixo saiu de uma
> captura ou de uma varredura do `world.json`.

## O achado

**87% do chão do mundo é uma frame de duas cores que nunca foi desenhada.**

`public/world.json`, 3.600 tiles de chão:

| frame | rótulo no editor | tiles | % |
|---|---|---|---|
| **5** | "Terra" | 3.129 | **86,9%** |
| 6 | "Terra 2" | 178 | 4,9% |
| 23/24 | Chão de Pedra (cemitério) | 210 | 5,8% |
| 33 | Mar | 51 | 1,4% |
| 29/30/31/32 | lajes e cova | 32 | 0,9% |

E a frame 5 é isto:

- **duas cores**: `#452939` (luma 51,2) e `#3e2533` (luma 46,0) — **5 unidades de luma de diferença**
- a frame 6 é o mesmo pigmento com outro ruído: indistinguível a 1×
- as duas vêm do **commit inicial**. Todo tile de terreno que o projeto desenhou depois — mar,
  dungeon, alvenaria, rocha — passou pela `spritefactory/`. O chão do overworld nunca passou:
  não existe `spritefactory/sprites/ground*.mjs`.

A própria paleta registra o buraco. Em `spritefactory/lib/palette.mjs`, toda ramp é uma escada de
3 a 5 degraus — menos uma:

```js
nightsoil: ['#3e2533', '#452939'],   // "The dark maroon the night ground is made of"
```

**Duas cores.** O chão do jogo é a única superfície que não tem ramp; tem um par.

## A medição

Luminância do quadro real (banda central, sem a faixa de UI):

| cena | média | desvio | % da tela em roxo-terra |
|---|---|---|---|
| noite, no campo (spawn) | **18/255** | 15,1 | 68% |
| **dia** (`hd3d.daylight = 1`), no campo | **40/255** | 21,0 | 76% |
| noite, no cemitério (frames 23/24) | **55,5/255** | **47,7** | — |

Três leituras:

1. **O mesmo renderer, a mesma noite, as mesmas luzes.** Sobre um chão que tem desenho, o desvio de
   luminância **triplica** e a imagem ganha matéria, profundidade e leitura. No campo, 92% dos
   pixels caem em três degraus de histograma.
2. **Ao meio-dia o jogo tem 16% de cinza médio.** O `lift` do `DAY_SKY` está fazendo o trabalho
   dele; o que ele levanta é que não tem informação.
3. **O chão ocupa 68–76% de cada quadro.** Não é um detalhe de fundo: é a superfície.

## Por que é ESTA a mudança de maior impacto visual

Os outros candidatos foram considerados e nenhum vence:

- **Ausência de tone mapping** (`exposure` é morta; `lift` é o ombro improvisado) — é real e está
  documentada, mas é ajuste de curva sobre um quadro sem informação. Um ombro filmico sobre dois
  tons de ameixa devolve dois tons de ameixa.
- **Sombras falsas em vez de shadow map** — decisão deliberada, bem defendida, e no cemitério ela
  funciona.
- **Sem shading direcional** (`normalUp` + `lightCap`) — é a lei estética do jogo, e o cemitério
  prova que ela não é o gargalo.

Split-tone por bioma, banding de luz em texel de mundo, vento em vertex shader com máscara por
vértice, montanha em voxel podado, mar que escorre em texel inteiro, AO assado nos cantos — tudo
isso está sendo aplicado sobre a superfície que não tem nada a revelar. É polimento sobre um
placeholder de 70% da tela.

## O plano

### A forma da correção: o precedente do MAR

O mar já resolveu exatamente este problema e a solução dele é a que se copia
(`World3D.seaVariant` + `SEA_TILE_FRAMES`):

> Uma frame é o que se GUARDA no `world.json`; as outras existem só como ARTE, e quem escolhe qual
> tile veste qual é um hash inteiro da coordenada — determinístico, então a mesma tela sai igual em
> todo boot e o `visual-ref` continua diferindo em 0 pixels.

Isso é o que faz esta mudança barata e sem risco:

- **o `world.json` não é tocado** — nada de script de reescrita, nada de backup, nada de prova de
  BFS, nada de risco sobre o que foi autorado à mão;
- **o editor continua com UMA carta "Terra"** — o autor não passa a escolher entre quatro terras;
- **custa zero draw call** (a frame já viaja por vértice em `aUvBounds`);
- `DIGGABLE_GROUND_FRAMES = {5, 6}` continua valendo, porque o dado guardado continua sendo 5.

> Correção de rumo: a primeira versão desta análise propunha um script que reescreve o `world.json`
> trocando a frame 5 por uma família nova. O caminho do mar é estritamente melhor e foi adotado.

### Os passos

1. **A ramp.** Estender `nightsoil` de 2 para 5 degraus em `spritefactory/lib/palette.mjs`. É a
   correção na raiz: a ramp que falta é o motivo de a arte ser chapada, e é o que qualquer tile de
   chão futuro vai compor.

2. **A arte** — `spritefactory/sprites/ground-earth.mjs`, `kind: 'terrain'`, 5 frames (4 da
   "Terra" + a "Terra 2" seca):
   - `draw()` procedural com RNG semeado (builds determinísticos), **periódico no toro de 16×16**
     por construção — toda coordenada envolve em `mod 16`, então a costura entre tiles vizinhos
     fecha sozinha, inclusive entre variantes diferentes;
   - as quatro variantes são **pinturas de verdade** (sementes diferentes), não deslocamentos de
     uma só: mesma estatística, mesmo ritmo, nenhuma repetição reconhecível;
   - camadas, na ordem em que um chão de floresta se forma: relevo em oitavas → luz de
     cima-à-esquerda sobre ele → fenda no lado da sombra → agulha seca de pinheiro caída da copa.
     "Cluster shading, não listras" (README da fábrica).
   - hue preservado: a direção ameixa/cinza do "Ashen Wilds" é deliberada. O que se corrige é
     **amplitude e desenho**, não a cor.

3. **O linter.** A regra `value-range` — a que mede exatamente este defeito ("chapado") — está
   escopada para `prop | item` e **exclui terreno**. É por isso que a frame 5 passou. Estendê-la a
   `terrain` é o que impede a próxima.

4. **A instalação.** `spritefactory/install-tile.mjs` ganha `--force` (o veto a sobrescrever existe
   para um número errado não comer arte; um remaster deliberado declara a intenção) e `--src` (o
   sheet é a unidade de autoria, os slots do atlas nem sempre são contíguos).
   - frames **5 e 6** recebem as pinturas-base remasterizadas (o editor e o `world.json` continuam
     concordando, zero migração);
   - frames **52, 53, 54** — vazios hoje, no fim do sheet — recebem as três variantes extras.
     Appendar é o único jeito seguro de crescer: id de frame é posicional.
   - **A frame 41 continua vazia.** Ela é vazia de propósito (`CLAUDE.md`).

5. **A ligação.** `GROUND_TILE_FRAME = 5` / `GROUND_TILE_FRAMES = [5, 52, 53, 54]` em
   `constants.ts`; o swap por hash em `World3D.buildTerrain`, ao lado do do mar; e o mesmo swap no
   `EditorScene` (o editor do mundo desenha um tilemap em coordenada de mundo, então é a mesma
   pergunta) para o editor mostrar o que o jogo mostra.

## O que fica de fora, e por quê

- **A costura repetida do cobble do cemitério.** A captura do cemitério mostra a mesma pedra
  idêntica tile a tile com uma grade escura visível nas juntas. É real e vale variantes pelo mesmo
  mecanismo — mas são 5,8% do mundo contra 87%. Depois.
- **Clarear o mundo.** A média de 18/255 é em boa parte a direção do autor (o mundo é escuro, a luz
  é a fechadura do jogo). A nova base sobe pouco a média e muito a **amplitude** — é o desvio que
  faz ler, não o brilho. Se depois de olhar o preview o autor quiser o campo mais claro, o lugar é
  a ramp, e é um número.

## O que foi feito (2026-08-23)

Tudo acima, executado. O que o plano não previa e o trabalho ensinou:

**O QUILT.** A primeira versão instalada saiu com uma grade visível no jogo — dava para CONTAR os
tiles, cada um com sua mancha clara no meio. O preview do sprite não denuncia isso; só o mundo
montado denuncia, e por isso a captura no jogo é um passo obrigatório e não um luxo. A causa é
geométrica e vale para qualquer textura ladrilhada: a pintura tinha uma oitava de ruído com células
de 8px, e um ruído obrigado a ser periódico em 16px com 2×2 pontos de treliça **tem** os extremos no
meio do tile. Uma feição do tamanho do tile *é* o tile. O teto de escala num ladrilho de 16px é
~4px — é por isso que o cobble do cemitério tem seis pedras de ~5px e não uma de 16 —, e a variedade
grande vem das quatro pinturas espalhadas pelo hash, que é para isso que elas existem.

**A FENDA É LINHA, E DE UM LADO SÓ.** Três versões: sem erosão, o miolo escuro de uma depressão lê
como buraco e o campo vira cascalho; erodindo para o contorno inteiro, cada depressão vira um ANEL
FECHADO e o campo fica salpicado de "0" e "c". O que resolve é a física que já manda no resto do
tile — a fenda é SOMBRA, e sombra cai de um lado só: sobrevive o pixel encostado em algo mais alto
na direção da luz (cima-à-esquerda). Anéis viram arcos, e os arcos apontam todos para o mesmo lado.

**O linter já tinha a regra e ela estava desligada.** `value-range` mede exatamente este defeito
("chapado") e estava escopada para `prop | item`, excluindo terreno. Agora inclui `terrain` — e não
dispara em nenhuma arte de terreno já existente (mar e dungeon passam limpos). A frame 5 antiga, com
duas cores só, é pega pela regra vizinha: *"#452939 e #3e2533 diferem por d=10 — invisível a 1×"*.

### O resultado, medido no mesmo quadro

| cena | antes | depois |
|---|---|---|
| noite, no campo | média 18,0 · desvio 15,1 | **média 22,4 · desvio 15,5** |
| dia, no campo | média 40,0 · desvio 21,0 | **média 48,3 · desvio 22,2** |
| o tile em si (arte crua) | média 49 · **desvio 2,5** | média 59 · **desvio ~15** |

O desvio do TILE — que é onde a mudança realmente mora — subiu **6×**. O do quadro sobe pouco
porque o quadro sempre teve contraste: ele vinha todo da vegetação e do fogo, e agora o chão também
participa. Na captura noturna dá para ver o que isso compra: a poça de luz do herói passou a
REVELAR chão, em vez de clarear um vazio.

### Arquivos

- `spritefactory/lib/palette.mjs` — `nightsoil` de 2 para 5 degraus
- `spritefactory/sprites/ground-earth.mjs` — a pintura (5 frames: Terra, Terra 2 seca, 3 variantes)
- `spritefactory/lib/analyze.mjs` — `value-range` passa a valer para `terrain`
- `spritefactory/install-tile.mjs` — `--src=i[:n]` e `--force`
- `public/assets/environment/tilesets/forest_tile_set.png` — frames 5, 6 (remaster) e 52–54 (novas);
  o sheet cresceu para 57 frames. **39/40 continuam cópias de 23/24 e a 41 continua vazia** —
  conferido, é o que o playtest `montanha` assere.
- `src/game/constants.ts` — `GROUND_TILE_FRAME`, `GROUND_TILE_FRAMES`, `terrainVariant`,
  `groundFrameAt` (e o `seaVariant` do World3D virou o `terrainVariant` compartilhado: duas cópias
  do hash seriam duas respostas para "qual pintura este tile veste")
- `src/game/render3d/World3D.ts` e `src/game/scenes/EditorScene.ts` — os dois consultam o MESMO
  `groundFrameAt`, senão o editor pinta uma terra e o jogo desenha outra

`npm run build` (typecheck + vite) passa; `npx eslint src` limpo. Os erros de lint da
`spritefactory/` são os pré-existentes de sempre (`console`/`process` sem globals de Node
configurados naquele diretório) — 4 a mais, todos dessa mesma classe, nas linhas novas do
`install-tile.mjs`.

#### A VIRADA: a terra pintada virou MANCHA, não o chão

Decisão do autor depois de ver o resultado: **a maioria do chão continua a arte de sempre, e só
algumas partes abrem na pintura nova.** É a leitura certa, e por uma razão que a versão anterior
não tinha visto — um chão desenhado de parede a parede é uma segunda textura competindo com todo
sprite que pisa nele, e ela leva junto a calma do mundo. Um chão de verdade é quase todo uma coisa
só; o interesse está onde ele deixa de ser.

O que mudou:

- **As frames 5 e 6 voltaram a ser a arte original** (`git checkout` do atlas). O campo de ameixa
  chapado é de novo o chão do mundo.
- As cinco pinturas passaram a viver **só** nas frames 52–56, no fim do sheet — puramente aditivo:
  o diff do PNG não mexe em nenhum pixel que já existia.
- `groundFrameAt` deixou de ser "escolha uma das quatro" e virou "abra ou não abra": um campo de
  ruído suave sobre o mapa (`groundEarthiness`) decide onde há terra exposta, e só dentro dela o
  hash por tile escolhe qual pintura.

E o defeito que essa virada trouxe, corrigido no caminho: **a mancha não pode ser uma CAIXA.**
Decidir a mancha por célula grossa agrupa certo e dá a toda mancha quatro lados retos — o que se vê
não é terra aparecendo, é um retângulo de outra textura colado no chão, e nada neste mundo tem
aresta quadrada. O campo suave (ruído de valor bilinear sobre uma treliça de hashes — a MESMA
técnica da própria pintura, uma escala acima) resolve: a borda vira curva.

O corte é o knob, e ele não é uma porcentagem: ruído bilinear se acumula em torno do meio em vez de
se espalhar, então nenhuma fórmula honesta converte "quero 20%" em corte. A conversão é medida
sobre o `world.json` de verdade e está na tabela do próprio `constants.ts`:

| corte | terra pintada |
|---|---|
| 0,60 | 32% |
| 0,66 | 24% |
| **0,70** | **19%** ← o de hoje |
| 0,75 | 14% |

Medido no mesmo quadro depois da virada: noite **19,8 · 15,8** · dia **43,3 · 21,4** (contra 18,0 ·
15,1 e 40,0 · 21,0 de antes). O ganho é menor que o da versão de parede a parede, e é para ser: o
que se comprou foi contraste ONDE ELE CONTA, sem gastar a calma do resto.

## O que ficou em aberto para o olho do autor

**Dentro da mancha, a crista puxa para o rosa de dia** — o `grade` do dia empurra o alto para o
quente e o degrau novo `#6b4a5c` responde indo para magenta. Com a terra pintada em ~19% do chão
isso ficou bem menos grave, mas os botões continuam onde estavam: `BAND_SHARE` (quanta crista
existe) e o hex da crista, no spec; e `GROUND_DETAIL_CUT`, que decide quanta mancha existe.

## Como verificar

Não há teste de playtest a escrever: é arte nova em frames do atlas mais um swap determinístico.
O que já guarda o que muda:

- `npm run playtest -- montanha` — compara **pixels do atlas** (assere que a 39 é a 23 e que a 41
  segue vazia); é ele que pega uma instalação no slot errado.
- `npm run playtest -- visual-ref` + `node playtest/compare-visual.mjs` — o hash é determinístico,
  então duas rodadas do mesmo build continuam diferindo em 0 pixels.
- `npm run playtest -- jardim` e `vento` — a vegetação que fica por cima do chão novo.
- `npm run build` (typecheck + lint + vite).

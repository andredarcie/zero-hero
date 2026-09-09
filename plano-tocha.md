# Plano — refazer a tocha da dungeon

Revisão de `WallTorchObject`, do frame 48 do atlas, do caminho de cubo em `World3D.buildTerrain`, do
pool de fogo (`addFireLight` + o laço `fires` do `render`), do passo 3 de
`scripts/enrich-underworld.mjs` e da tabela `useItemAt`.

São **75 tochas, todas no subterrâneo** (frame 48 no `world.json`: zero). O andar de baixo tem 6
escadas, 9 flores da lua e 2 marcas de bomba — a atmosfera do lugar inteiro repousa nessas 75 peças,
e nenhuma delas foi desenhada para o que faz.

Ordem de execução: arte → objeto → números → **olhar** → custo → gesto → guarda. As três primeiras
já entregam a peça refeita e são reversíveis sozinhas; a de custo é performance pura e a do gesto é
a única que muda jogo.

---

## O diagnóstico (medido, não suposto)

| # | o que é hoje | onde | por que dói |
|---|---|---|---|
| 1 | a chama é `campfire-0..2` = `sprite_fire0..2`, e esses PNGs **têm as toras desenhadas** | `WallTorchObject.FIRE_TEXTURES` | toda tocha de parede é uma **fogueirinha de acampamento de 0,42 tile pregada na pedra**, toras e tudo |
| 2 | o frame 48 **já tem uma chama pintada** na alvenaria | `spritefactory/sprites/dungeon-tiles.mjs` (`PICK[6]`) | são **duas chamas** no mesmo tile: a pintada e a viva por cima |
| 3 | o tile vira **CUBO**, e o cubo repete o frame nas faces sul/oeste/leste | `buildTileCubeGeometry` | tocha numa quina = **tocha pintada em 3 faces, chama viva em 1** |
| 4 | `FACE_OFFSET = 0.5`, e o `Billboard3D` **não é camera-facing** (o `apply()` não gira nada: é um quad vertical fixo) | `WallTorchObject` + `Billboard3D.apply` | a chama fica **exatamente coplanar** com a face sul da alvenaria; só ganha o teste de profundidade por sorte da ordem de desenho |
| 5 | o sul é **cravado na constante** | `FACE_OFFSET` | o editor deixa pintar o frame 48 em qualquer parede, e na parede errada a chama queima **dentro da pedra** |
| 6 | `fireGlowSize = 15` **tiles**, e `setIntensityScale` **não mexe no tamanho** | o laço `fires` do `World3D.render` | 75 poças de ~15 tiles: a masmorra sai lavada de laranja e **nenhuma tocha lê como marco** — que é o único motivo de elas existirem |
| 7 | `fireIntensity: 265`, o mesmo de uma fogueira de acampamento | `World3DParams` | a tocha é, em cada número que ela usa, uma fogueira |

**Custo.** Cada tocha são 2 `Billboard3D` (mesh + material **próprios** cada) + 1 glow do pool →
**225 draw calls e 225 materiais** no subterrâneo, mais **75 entradas em `litFires`**, que
`nearestLitFireInto` varre por candidato de sombra a cada frame.

**E a que mais importa.** `TORCH_BURN_MS = 5000` — cinco segundos. O comentário da constante diz que
se reacende "em qualquer fogo vivo — fogueira acesa ou lava". Lá embaixo **não há fogueira nem
lava** (`underworld.json`: 0 de cada), e `useItemAt` só conhece `getCampfireAt`: o frame 48 não é
fogo para ninguém. **A única chama do andar não pode ser tocada.**

Nenhum cenário de playtest cobre o subterrâneo.

---

## A frase

Antes de qualquer número, o que a peça diz e nenhuma outra diz:

> **A tocha de parede é um ponto FIXO de fogo preso na pedra: ela marca o lugar — e é a única coisa
> lá embaixo de onde se leva fogo.**

*Fixo* é o oposto da fogueira (que é destino e cura); *de onde se leva fogo* é o que a fogueira
também faz, e é justamente o que hoje falta. Todo o resto sai daí.

---

## 1. A arte (`spritefactory/`)

**A decisão que destrava as outras: a tocha sai do TILE e vira desenho do OBJETO.**

- [x] **O frame 48 continua sendo o MARCADOR** que o autor pinta no `/editor` (arte atual mantida —
      ela é ótima como marcador), mas no runtime `buildTerrain` assa o cubo com um frame de **muro
      liso** (`DUNGEON_TILES.walls[hash(x,y)]`). Morrem de uma vez os defeitos 2 e 3: a parede volta
      a ser parede nas três faces, e existe **uma chama só**.
- [x] **`torch-flame`** — 16×16, **4 frames**: chama de tocha, alta e estreita, sem tora nenhuma.
      Rampa `ember` da paleta da casa, alpha binário, sem AA. Vale a regra 8 da fábrica: **animação
      é micro-variação** — a ponta oscila e o núcleo respira, a silhueta *não* se redesenha entre
      frames.
- [x] **`torch-sconce`** — 16×16: o suporte. Braçadeira de ferro na pedra + o cabo embebido; ink
      navy + rampa `stone`, luz da esquerda (regra 5). Ele responde "o que segura essa chama?", que
      hoje é ninguém.
- [x] Instalar por `factory.mjs install` — são sprites, **não** terreno. Nada de `install-tile.mjs`,
      o atlas não é tocado. Entradas em `textures3d.ts` e no `assetManifest`.

Loop da fábrica, sem pular passo: `dump → grid → build → OLHAR o preview → install`.

---

## 2. O objeto (`WallTorchObject.ts`, reescrita)

- [x] **A face vem do mundo, não de uma constante.** ~~Escolher entre os 4 vizinhos: sul primeiro,
      depois oeste/leste, depois norte.~~ **A derivação colapsou numa precondição, e o motivo é
      geometria:** `Billboard3D` não gira — todo quad é vertical e olha para o sul, porque a câmera
      está em +z. Um quad na face oeste de um bloco cai dentro do intervalo em z do próprio bloco, e
      a face sul dele, mais perto da câmera, o oclui inteiro. Logo: **sem chão ao sul não existe
      lugar visível para a chama**, e a tocha não desenha nada. A regra é `wallTorchFaceIsClear`, uma
      pergunta só, e quem avisa o autor é o Salvar do editor (ver §6).
- [x] **Sair do plano da face**: `0.5 + ε`, ou uma `depthLayer` própria. Coplanar com a alvenaria
      nunca foi de propósito.
- [x] **Três peças, não duas:** o **suporte** (billboard normal, iluminado pelo mundo — ele é pedra e
      ferro, não fogo), a **chama** (`emissive`) e o **halo**.
- [x] **O halo vira RADIAL** (`FX_DOT_TEXTURE`). Hoje ele é a própria silhueta da fogueira escalada
      3,4× e tingida — ou seja, uma segunda chama maior e borrada atrás da primeira. A
      `CampfireObject` já faz exatamente isso na brasa morta; é o precedente.
- [x] **A chama passa a DANÇAR com a luz que ela lança.** Maior ganho por linha do plano inteiro:
      hoje o sprite troca de frame num metrônomo de 110 ms enquanto a luz executa cinco camadas de
      dança (`swell + flicker + shimmer + jitter + flare`), e as duas não se conhecem — a chama lê
      como decalque em loop e a luz como um efeito separado. Basta expor `readonly level` na
      interface `FireLight3D` e ler dele a escala/alpha/tint do quad.
- [x] **Fumaça e fuligem.** Um fio de fumo lento saindo da ponta (`FX_PUFF_TEXTURE`, só nas tochas
      enquadradas) e uma marca escura estática na alvenaria acima. A fuligem é barata e é o detalhe
      que diz *isto queima há muito tempo*.

---

## 3. Os números param de ser os de uma fogueira

- [x] **`FireLight3D.setSizeScale(s)`** → `gSize = params.fireGlowSize * f.sizeScale * (…)`. O
      padrão já existe: `updateTorch` faz isso com `TORCH_SCALE = 0.85` para a tocha da mão. As
      fogueiras do pool só têm `scale`, que mexe na **intensidade** e não no **tamanho** — é por isso
      que 75 tochas pintam 75 poças de 15 tiles.
- [x] Alvo: poça em torno de **0,35–0,45** da fogueira, intensidade em torno de **0,5**. Números de
      olho, afinados por knob vivo (`window.hd3d`) — nunca recompilando.
- [ ] Opcional, se incomodar: `fireLights[i].position.set(f.lx, 1.1, f.lz)` tem a altura cravada, e a
      chama de parede vive a 0,62–0,8.

---

## 4. O custo

- [x] **Um anel de ativação**, no molde do `framed` do bestiário: só as tochas dentro de N tiles da
      câmera seguram billboards e uma entrada de fogo; as outras são dados inertes.

Por que isso é **legal**, e vale escrever no comentário: `addFireLight`/`destroy` **não criam nem
destroem luz THREE** — a contagem está congelada em oito lâmpadas (`FIRE_LIGHT_SLOTS`) e o glow já é
pool. Entra e sai uma entrada de lista, nada mais.

Ganho esperado: de 225 draw calls para ~20, e o laço de sombra deixa de varrer 75 candidatos por
frame. Medir com `?prof` / F3 / `__prof.report()` antes e depois.

---

## 5. O gesto — **decisão do autor**

- [x] **A tocha de parede acende o graveto.** Uma linha em `useItemAt`, no mesmo degrau do
      `getCampfireAt` — **é o mesmo gesto que já existe** contra uma fogueira acesa, então não é
      gramática nova. Sem isso, os cinco segundos de `TORCH_BURN_MS` fazem da tocha da mão algo que
      simplesmente não funciona no único lugar do jogo que é escuro o tempo todo.
- [x] **Fonte, nunca alvo:** o balde não a apaga. Uma masmorra que o jogador consegue apagar para
      sempre é atmosfera com trava de segurança e sem recompensa. (Se a decisão for o contrário —
      apagável e persistida —, o `adventureState.litFires` já existe e serve, com chave `under:x,y`.)

### O que este plano deliberadamente NÃO faz

O `progress.md` ("O subterrâneo ganhou arquitetura") já explica os dois primeiros, e eles ficam:

- **Não conta como `isLitAt`** — 75 tochas calariam as 24 covas.
- **Não conta como `nearFire` da flor da lua** — fechariam as 9 flores de uma vez.
- **Não tem `tickScorch`.** A lei "a fogueira não repele, ela QUEIMA" é sobre o anel de 2 tiles
  colado na lenha de uma fogueira; um anel desses em volta de 75 tochas tornaria todo corredor da
  masmorra letal para o bestiário sem o jogador ter feito nada. Escrever isso no comentário da
  classe, senão alguém "conserta" daqui a três meses.
- **Não vira prop** (quebra "chão + uma coisa" — o tile já é a parede), **não soma luz THREE**, **não
  pinta a chama no atlas** e **não ganha legenda nem balão**.

---

## 6. Autoria e guarda

- [x] **Editor:** o Salvar passa a avisar tocha sem vizinho aberto (hoje ela queima dentro da pedra,
      em silêncio).
- [x] **`scripts/enrich-underworld.mjs`:** ~~o passo 3 tem "o vizinho do SUL tem de ser chão livre"
      cravado; com a face derivada, generaliza para "alguma face livre".~~ **O plano estava errado
      aqui, e a implementação achou o motivo:** nenhum billboard deste jogo gira, então a face sul é
      a única onde uma chama cabe (§2 acima). A regra do script não afrouxa — ela virou a
      precondição da peça, e o que mudou no arquivo foi o comentário, que agora explica por que ela
      não pode ser afrouxada. As 75 tochas autoradas passam todas.
- [ ] **Playtest — do autor, e hoje não existe nenhum do subterrâneo.** O que guardaria isto é um
      `tocha-parede`, autorando a fixture pelo `/editor?under` (limpa um quintal, pinta um corredor,
      põe uma tocha em cada uma das 4 faces, aperta P) e assertando: a chama na face aberta, a
      textura **não** sendo a da fogueira, a poça menor que a de uma fogueira, o graveto acendendo
      nela, e as tochas fora do anel sem billboard.
- [ ] `perf-burn` continua guardando a lei do orçamento de luz — rodar depois do §4.
- [ ] `visual-ref` é a rede da mudança de render (duas rodadas do mesmo build diferem em 0 pixels);
      atenção à armadilha do `Math.random()` de UUID do three — alocar um número diferente de objetos
      no boot muda o ritmo das chamas e o diff "falha" sem nada de render ter mudado.

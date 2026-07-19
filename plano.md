# Plano — Sombras: alto padrão de qualidade e performance excelente

> Estado analisado em 2026-07-19, branch `main` (`77735c9`). three.js `0.185.1`, Phaser `3.90`.
> Arquivos centrais: `src/game/render3d/CastShadow3D.ts`, `groundShadow.ts`, `World3D.ts`,
> `Billboard3D.ts`, `pixelArtLight.ts`.
>
> Organização: **Parte 1** = como funciona hoje (a evidência). **Parte 2** = o padrão de
> qualidade — as boas práticas de sombra para este tipo de jogo, e a nota atual em cada uma.
> **Parte 3** = auditoria de performance com achados concretos e orçamentos. **Parte 4** = o
> plano por fases, cada fase fechando princípios da Parte 2 dentro dos orçamentos da Parte 3.

---

## Parte 1 — Como as sombras funcionam hoje

### 1.0 A decisão fundadora

`renderer.shadowMap.enabled = false`, de propósito (`World3D.ts:620-625`). Um shadow map
projeta geometria real, e a geometria de quase tudo neste mundo é um quad vertical — visto
de uma luz, uma lasca. Além disso cada shadow map custa um render extra por luz num jogo
que raciona 8 point lights (~0,35 ms/luz/frame), e a direção de arte pede as sombras
desenhadas do 2D. As flags `castShadow`/`customDepthMaterial` que restaram estão inertes.

Existem **cinco subsistemas** que juntos formam a linguagem de sombra:

| # | Subsistema | Arquivo | O que é |
|---|-----------|---------|---------|
| 1 | Blob de contato | `groundShadow.ts:30-78` | Elipse escura macia sob tudo que está em pé (ancoragem ambiente) |
| 2 | Silhueta de fogo | `CastShadow3D.ts` | Silhueta preta do próprio sprite, deitada, apontando para longe da chama |
| 3 | Silhueta de lua | `World3D.fillMoonCastField` + `handoffCast` | Mesma silhueta, rumo fixo; estáticos assados 1×, atores com handoff |
| 4 | AO assado | `World3D.ts:2619-2662` | Cantos do chão escurecidos por vertex color (`AO_MAX = 0.5`) |
| 5 | Esqueleto projetado | `ShadowStrip` + `World3D.groundCastAt` | Sombra articulada do braço robótico, elo por elo |

### 1.1 Blob de contato

Textura compartilhada 22×22 NEAREST (borda quebra em blocos de pixel). Dinâmicos: mesh
irmão por billboard (`groundShadow: true`), segue o pé, **ignora elevação** de propósito.
Estáticos: um mesh mesclado, só para sólidos *expostos* (≤ 4 vizinhos sólidos — um tile no
meio da parede da floresta não ganha blob, senão a soma vira bloco escuro), alpha 0.34.
O herói da aventura é caso especial: `GameScene.ts:3935` cria um `GroundEllipse` à mão
(o Survivors já usa o caminho normal, `SurvivorsScene.ts:145`).

### 1.2 Silhueta de fogo (a peça central)

`castTransform` (`CastShadow3D.ts:260-285`):

```
t           = min(1, dist / castShadowRadius)              // raio 7.5 tiles
comprimento = altura × lerp(1.3, 3.2, t) × (1.5 − 0.5·level)   // chama baixa → sombra longa
alpha       = 0.6 × (1 − t²)                               // escura junto à chama → 0 na borda
```

Os fatores 1.3–3.2 compensam o foreshortening da câmera inclinada. O loop de fogo em
`render()` (`World3D.ts:1898-1961`) reconstrói `litFires` por frame com a dança de cada
fogueira (flicker em camadas + flare + jitter de posição + temperatura de cor); a mais
próxima entrega a dança à `shadowLight`, então as sombras esticam **junto** com a luz.

Dois caminhos de desenho:

- **Atores**: um mesh por caster (`castCasters`), via `applyCast`. Sutilezas conquistadas:
  `alphaTest` escala com o alpha (fixo em 0.4 comia sombras fracas inteiras — luar
  invisível, fogo piscando a 58% do raio); `needsUpdate` no swap de textura (senão a
  sombra congela num frame do ciclo de andar); `castAnchor`+`frameFootPad` (margem
  transparente esticada viraria faixa de chão nu).
- **Sólidos estáticos**: `SolidCastField` — **um InstancedMesh, um draw** (eram 36 dos 120
  draws do frame e a maior fonte de garbage). O batching é exato por duas provas: todas
  recortam o mesmo atlas (janela UV por instância, fetch pinado no centro do texel) e
  todas são preto puro — quase comutativo; o fog tinge por profundidade, então `end()`
  ordena back-to-front na CPU. Pool `CAST_POOL_MAX = 72`.

Regras de borda: em cima de fogo aceso não há rumo estável → dropa a direcional e o blob
carrega (`onLitFireTile`); a tocha não sombreia o portador (guarda `d² > 0.36`) mas
sombreia o resto; fogueira nascendo (scale ~0) não vence o "mais próximo" (entregaria
intensidade zero e toda sombra piscaria).

### 1.3 Silhueta de lua

Fallback, não adição — um segundo mesh por ator dobraria os draws (Survivors ~100
atores). Rumo derivado de `moonLight.position` (não podem divergir). Estáticos:
`moonCastField` assado **uma vez** (câmera virtual no sul infinito para a ordenação — a
câmera do jogo só translada); re-assa em knob, `removeSolidTile` e `setSolidTileFrame`
(o toco não pode jogar a sombra da árvore inteira). Atores: `handoffCast` — ângulo e
comprimento giram pelo caminho curto com peso `w = fireAlpha/moonAlpha`; alpha é
`max(fire, moon)` porque lerp afundava no meio da passagem (pulso visível). Params:
alpha 0.22, comprimento 2.1 alturas — luar é preenchimento, nunca compete com o fogo.

### 1.4 AO assado

`tileAoCorners`: cada canto de tile conta os 3 vizinhos que o tocam e escurece o vertex
color. Derrubar árvore re-assa o 3×3 (a sombra do canto vive nos vizinhos — sem isso a
clareira guarda a sombra de uma árvore que não existe).

### 1.5 Esqueleto projetado

`groundCastAt` expõe a estilização dos sprites em pé como **projetor** (direção, `unitLen`,
alpha — a mesma `castTransform`+`handoffCast`); o braço projeta cada junta em
`plan + dir·elev·unitLen` e liga com uma `ShadowStrip` **dura** por elo (a versão macia leu
como blur — "duas línguas de sombra numa máquina"). Conectada por construção.

### 1.6 A disciplina que segura tudo

renderOrder: glow 2 → blob 3 → silhueta 4 (a sombra escurece a poça, não é lavada por
ela). `depthWrite: false` em toda sombra E no decor rasteiro (senão oclui em remendos).
Shapes `{groundShadow}`/`{castGroundShadow}` têm stand-ins no `prewarmShaders`;
`perf-profile` falha se qualquer programa compilar durante o play. Guardas: `perf-burn`,
`machado`, `braco`, `visual-ref`+`compare-visual` (seeds pinadas; `VISUAL_ISOLATE=shadows`).

---

## Parte 2 — O padrão de qualidade

Boas práticas de sombra para **este** tipo de jogo — pixel art em billboards sobre 3D real,
cena noturna, luz de fogo viva (a família HD-2D: Octopath/Triangle Strategy, mais as lições
de A Short Hike já absorvidas pela luz). Oito princípios; cada um com a nota de hoje.
**Este é o contrato de aceite do plano: ao final, as oito colunas devem estar ✅.**

| # | Princípio | Hoje | Evidência |
|---|-----------|------|-----------|
| P1 | **Sombra é dado, não decalque** — receptores *amostram* a sombra | ❌ | Silhuetas são quads por cima do chão; nenhum shader sabe que elas existem |
| P2 | **Sombra remove a luz certa** — só o termo direto do fogo; ambiente e lua atravessam | ❌ | Multiplica a cor final por `(1−α)`; sombra de fogo fica mais escura que a noite (~0.62× vs ~1.2× albedo) |
| P3 | **Sombra tem cor** — o escuro desloca para o frio da noite, nunca preto puro | ❌ | Silhuetas são `#000` multiplicado; só o grade global tinge o frame inteiro |
| P4 | **Uma gramática só** — contato = macio (ambiente); cast = recorte duro quantizado (direcional) | ✅ | Regra já paga com sangue: strip macio do braço rejeitado como "blur" |
| P5 | **Estabilidade temporal absoluta** — nenhum pixel de sombra ferve, pisca ou salta | ◐ | Handoff contínuo, seeds pinadas, tudo ancorado no mundo ✅; **furo**: entre DUAS fogueiras o "mais próximo" vira chave e a sombra do ator salta de direção |
| P6 | **A sombra respeita o mundo** — elevação, terreno, estado do caster | ◐ | Toco ≠ árvore ✅; elevação ignorada (pulo/itens, `applyCast` não lê `elev`); sombra flutua sobre o canal do rio (leito a −0.42) |
| P7 | **A sombra respira com a luz** — comprimento/escuridão dirigidos pela chama viva | ✅ | `castTransform` × dança do fogo × `shadowLight` — ponto forte, preservar |
| P8 | **Custo fixo, zero alocação** — O(tela), não O(mundo); GC silencioso | ◐ | Campos instanciados ✅; mas atores = O(N) draws, loop O(sólidos×fogos), e o caminho aloca centenas de objetos/frame (Parte 3) |

Duas notas sobre a régua:

- **Octopath é o precedente de P1/P2**: lá os personagens-billboard escurecem ao entrar na
  sombra do ambiente porque amostram a iluminação da cena — a sombra existe como dado. É
  o que separa "sombra pintada no chão" de "sombra no mundo".
- **P3 é a lição de A Short Hike que a luz já aplica e a sombra ainda não**: o projeto já
  declara `GRADE_WOOD_SHADOW` violeta-azulado ("o escuro é uma COR") e pinta a poça de
  fogo com rampa autorada — mas a silhueta continua sendo preto multiplicado. Fisicamente
  P2 e P3 são o mesmo fato: a região sombreada ainda recebe ambiente+lua, logo sua cor É
  a cor da noite.

---

## Parte 3 — Auditoria de performance

### 3.1 O que já é excelente (não tocar sem motivo)

- `SolidCastField`: 36 draws → 1, com prova de correção (preto puro + sort CPU).
- `moonCastField` assado uma vez; re-assa só em evento raro.
- Loop de fogo des-alocado à mão (`lightCandidates`/`litFires` reusados, "never
  reallocated"); `skipDarkPointLights` poupa o custo dos slots vazios em todo fragmento.
- Distâncias ao quadrado no loop quente; texturas de sombra compartilhadas.

### 3.2 Achados (verificados no código)

**A1 — O caminho de sombra ALOCA, todo frame.** O loop de fogo foi des-alocado; o de
sombra não:

| Fonte | Alocação | Frequência |
|-------|----------|------------|
| `frameUvWindow` (`textures3d.ts:178-197`) | objeto novo `{offsetX…}` **sem cache** | 1× por sólido sombreado por frame (até 72) + re-bake da lua |
| `SolidCastField.add` (`CastShadow3D.ts:215`) | literal `{objX…depth}` no `pending` | 1× por instância por frame |
| `castAnchor` (`CastShadow3D.ts:40-52`) | `{x, y}` novo (nos dois ramos) | 2× por instância (add + applyCast) |
| `castTransform` / `handoffCast` | objeto novo cada | 1–2× por caster por frame |

Com 2 fogueiras acesas + ~20 casters: **~300 objetos/frame ≈ 18k/s** de pressão de GC num
projeto cujo pior bug de perf da história foi um stop-the-world de 300 ms. No Survivors
com 100 atores, mais. Nada disso aparece em média de frame — aparece como espinho de GC.

**A2 — Draws de ator crescem com a população.** 1 mesh + 1 material + 1 draw por caster
dinâmico. Aventura: dezenas; Survivors: ~100 draws só de silhueta — a mesma conta que o
`SolidCastField` já resolveu para os estáticos. Os undead compartilham UMA sheet.

**A3 — O loop mais quente é O(sólidos expostos × fogos acesos).** `nearestLitFire` roda
por sólido exposto por frame ("the hottest loop in the renderer", nota do próprio código)
— mas fogueiras **não se movem** e o conjunto `lit` muda raramente. O trabalho é
recomputável por evento, não por frame. Só a tocha é móvel.

**A4 — `moonCastField` desenha o mundo inteiro todo frame** (`frustumCulled = false`,
instâncias = todos os sólidos expostos do mundo). Custo de vértice de ~milhares de quads
por frame para uma janela de ~30×17 tiles na tela. Provavelmente barato (2 tris cada) —
**medir antes de agir** (regra do repo: número sem "antes" não prova nada).

**A5 — Sort transparente por frame** (72 números — barato, mas existe só porque as
silhuetas blendam na cena com fog; a arquitetura da Fase 3 o elimina por construção).

### 3.3 Orçamentos (o contrato de performance)

Medidos com `?prof`/`perf-profile`, `PLAYTEST_UNTHROTTLED=1 PLAYTEST_SLOWMO=0`, sempre
comparando contra `main` (`git stash`). Baseline conhecida do frame: p50 ~6.1 ms.

| Métrica | Hoje (estimado — Fase 0 mede) | Alvo |
|---------|-------------------------------|------|
| Seção `castShadows` CPU p50 (aventura, 2 fogos) | a medir | **≤ 0.10 ms** |
| Seção `castShadows` CPU p50 (Survivors, 100 atores) | a medir | **≤ 0.25 ms** |
| Draw calls de sombra (aventura) | 2 campos + N casters + 3 strips | **≤ 6, fixo, independente de N** |
| Draw calls de sombra (Survivors) | ~100+ | **≤ 6, fixo** |
| Alocações/frame no caminho de sombra | ~300 | **0** |
| Passe da máscara (Fase 3) GPU | — | **≤ 0.3 ms desktop / ≤ 0.6 ms handheld** |
| Custo de amostrar a máscara | — | +1 fetch/fragmento lit (imensurável isolado; o frame total responde) |
| Programas compilados durante o play | 0 | **0** (lei existente, `perf-profile` guarda) |
| Luzes em cena | fixas | **fixas** (lei existente, `perf-burn` guarda) |

---

## Parte 4 — O plano

Cada fase declara **quais princípios fecha** e **quais orçamentos prova**. Regra
transversal de verificação (CLAUDE.md): mudança invisível → `visual-ref` diff **0**;
mudança visual → diff isolado (`VISUAL_ISOLATE=shadows`) e re-base deliberado; perf →
antes/depois contra `main`; cenário alvo, nunca o solve inteiro.

### Fase 0 — Instrumentar e limpar (P8 começa aqui; nenhum pixel muda)

**0a. Medir a linha de base.** `perf-profile` + `?prof` nas duas cenas: ms de
`castShadows`, draws de sombra, contagem de casters, espinhos de GC (heap no HUD do
profiler). Preencher a coluna "hoje" da tabela 3.3. Sem isso nenhuma fase prova nada.

**0b. Cenário `sombras` no playtest.** O contrato de qualidade vira código executável:
- caminha o herói da poça de fogo até o escuro e amostra a opacidade do mesh de sombra
  por frame → **asserta continuidade** (nenhum salto de alpha > ε entre frames — o pulso
  do handoff nunca volta);
- pisa em tile de fogo aceso → asserta que a direcional dropou e o blob ficou;
- asserta a **contagem de draws de sombra** contra o orçamento (via `renderer.info`, que
  o profiler já lê);
- (Fase 1+) asserta que ficou dentro do orçamento após cada mudança.
Sem timing sensível a bump — só leitura de estado — para não flakear.

**0c. Remover o peso morto.** `MeshDepthMaterial` por billboard e nos sólidos mesclados
(`Billboard3D.ts:207-216`, `World3D.ts:984-987`): alocado para shadow maps desligados.
Um comentário de uma linha vira a "porta de volta". *Aceite: diff 0; nenhum programa novo.*

**0d. `shadowHeight` honesto.** O knob promete "mais alto = sombra mais curta" e
`castTransform` não o lê. Fazer funcionar: `flameStretch × (2.2 / shadowHeight)`,
normalizado para o default atual (2.2 → comportamento idêntico). Um knob de tuning que
mente envenena toda sessão futura de `hd3d`. *Aceite: diff 0 no default.*

**0e. Unificar a sombra do herói.** Trocar o `GroundEllipse` manual do `GameScene` por
`groundShadow` no billboard (como o Survivors já faz), preservando o offset +0.1 via campo
opcional no config do blob. Um caminho de código a menos. *Aceite: diff só sob o herói.*

### Fase 1 — Performance excelente (P8 fecha; diff de pixel = 0 em TODA a fase)

**1a. Zero alocação no caminho de sombra (achado A1).**
- `frameUvWindow`: cachear por `(key, frame)` num `Map` — os valores são constantes da
  sheet; o objeto nasce uma vez. (Mesmo padrão do cache de `frameFootPad`, logo abaixo
  no mesmo arquivo.)
- `SolidCastField.pending`: trocar array de objetos por **buffers planos pré-alocados**
  (`Float32Array` de capacidade `CAST_POOL_MAX` + array de índices para o sort) — o sort
  ordena índices, os writes vão direto nos atributos.
- `castAnchor`/`castTransform`/`handoffCast`: variante com **out-param** (objeto scratch
  do chamador, o padrão que `lightCandidates` já usa no loop de fogo). Manter as
  assinaturas puras para testes/braço, com a variante quente ao lado.
*Aceite: 0 alocações/frame no caminho (verificar com o heap do profiler estável e/ou
Allocation instrumentation no DevTools); diff 0; `braco` verde (o braço consome
`groundCastAt`).*

**1b. Índice espacial fogo→sólidos (achado A3).**
Por fogueira, a lista de sólidos expostos dentro de `castShadowRadius`, computada quando
o fogo acende/apaga ou uma árvore cai (`removeSolidTile` já é o gancho; `perf-burn`
exercita exatamente acender/apagar em cascata). `updateCastShadows` itera só as listas
dos fogos acesos. A tocha (móvel) consulta um hash espacial (`Map` de bucket 4×4 tiles →
sólidos), não o array do mundo. De O(S×F) para O(π·r²·F).
*Aceite: `castShadows` ms ↓ vs main; `perf-burn` verde; diff 0.*

**1c. Silhuetas de atores instanciadas por sheet (achado A2).**
Generalizar `SolidCastField` → `ActorCastField`: um InstancedMesh **por textura base**
(undead compartilham uma; NPCs outra; o herói pode ficar no caminho single-mesh). As duas
provas do batching seguem de pé (mesma imagem por campo; preto puro + sort). O shader do
campo já existe (`aUvWindow`/`aCastAlpha`); flipX entra como escala X negativa na matriz
da instância, como hoje. Stand-in no `prewarmShaders` (mesma cache key `solidCastField`).
*Aceite: draws de sombra ≤ 6 no Survivors com 100 atores (era ~100); diff 0 nas duas
cenas; orçamento CPU Survivors ≤ 0.25 ms.*

**1d. Medir A4 e decidir.** Se `moonCastField` custar > 0.1 ms de vértice, particionar
por chunk com bounding spheres (frustum cull de graça). Se não custar, **documentar que
foi medido e deixado** — otimização sem número é a doença que o CLAUDE.md já cauteriza.

### Fase 2 — Fechar P5 e P6 no sistema atual (mudanças pequenas, cada uma atrás de knob `hd3d`)

**2a. Elevação no cast (P6).** `applyCast`/campos ganham `elevation`: âncora desloca
`elev · unitLen` na direção do cast (a projeção que o braço já usa — vira a regra de
todos) e alpha atenua `1/(1+k·elev)`. Vende o pulo, o ITEM GET, a moeda em arco.
*Aceite: diff apenas em frames com objeto no ar; custo zero mensurável.*

**2b. Sombra encontra a água (P6).** `buildTerrain` já constrói `waterSet`/`lavaSet`/
`seaSet` — expor um lookup O(1). Silhueta cuja ponta cruza tile afundado: **clampa o
comprimento na margem** e corta o alpha (~0.5). Não é projeção no leito (isso a Fase 3 dá
de graça); é parar de flutuar no ar. *Aceite: diff isolado no rio; nenhuma sombra
pairando sobre o canal nas shots de referência.*

**2c. Histerese no "fogo mais próximo" (P5 — o furo).** Entre duas fogueiras
equidistantes, o vencedor alterna com o bob da respiração e a sombra do ator salta de
direção. Correção mínima e barata: o fogo atual só perde o posto se outro ficar
**15% mais perto** (hysteresis), eliminando o flip sem mudar o visual em regime.
(A solução rica — duas sombras com peso contínuo — é a Fase 4; esta tapa o furo já.)
*Aceite: cenário `sombras` ganha um assert andando na mediatriz de dois fogos: zero
saltos de `rotY` > ε.*

**2d. Handoff também para estáticos (consistência P7).** Perto do fogo, a árvore mostra
fogo+lua simultâneos; o NPC do lado, só fogo. Escrever `moonAlpha × (1−w)` no
`aCastAlpha` das instâncias de lua dentro de poças acesas (listas da 1b; o atributo já é
dinâmico). *Aceite: árvore e NPC na mesma borda de poça se comportam igual; diff isolado
esperado só dentro das poças.*

**2e. Miudezas.** Tremor do machado treme a silhueta (mesma senoide do `shakeSolidTile`
no `rotY` da instância); `angle` do sprite soma no cast (bomba balançando).
*Aceite: `machado` verde; olho.*

### Fase 3 — A máscara de sombra (P1, P2, P3 fecham; a arquitetura correta para 2D-em-3D)

A única forma de sprite **receber** sombra, de a sombra remover **apenas** a luz do fogo,
e de existir penumbra honesta, é a sombra virar **dado consultável** — o que Octopath faz
com seus billboards, adaptado ao nosso pipeline estilizado. É a técnica do
`webgl_shadow_contact`/drei `ContactShadows` **invertida**: eles renderizam profundidade
da geometria (de novo: lascas); nós já temos os quads estilizados certos — muda para onde
eles são desenhados.

**Arquitetura:**

1. **RT pequeno**, ortográfico, top-down, seguindo a câmera: ~48×28 tiles a 16 texels/tile
   desktop (768×448), 8 no handheld — snap do RT ao grid de texels do mundo para não
   nadar no pan (a mesma lição do `lightRes`-snap).
2. Todos os quads de sombra **de fogo** (silhuetas de atores e estáticos + strips do
   braço) desenham **nele**, uma vez por frame, com blend **MAX**: elimina o
   double-darkening de sombras sobrepostas E a dependência de ordem — **o sort da CPU
   morre por construção** (no RT não há fog). Os batches da 1c desenham lá dentro sem
   mudança.
3. `patchPixelMaterial` ganha um sample da máscara por posição de mundo (o varying já
   existe para o `lightRes`-snap): o valor atenua **somente o termo direto das point
   lights** — ambiente e lua atravessam (**P2**). Billboards amostram **no pé**
   (`footDistance` já define onde): o herói escurece ao pisar na sombra da árvore
   (**P1**). O disco de glow do fogo também amostra — a poça sombreada escurece na
   fonte, não por um quad por cima.
4. **Cor da sombra de graça (P3):** atenuar só o termo do fogo significa que a região
   sombreada fica com ambiente+lua — a cor da noite (o violeta-azulado que
   `GRADE_WOOD_SHADOW` já declara), **sem nenhum tint artificial**. E `castShadowAlpha`
   fica livre para subir sem virar breu.
5. **Penumbra (P5/P4):** blur separável no RT com força crescendo pela distância da
   âncora (canal G), **quantizado no grid da arte** — a penumbra quebra em blocos de
   pixel, não em gaussiana HD (a lição do dither rejeitado: "estipple sujo").
6. Blobs de contato e AO ficam como estão (são ambiente, não fogo). Lua idem na primeira
   entrega; migra para um segundo canal como follow-up (aí a sombra da lua também é
   recebida pelos sprites).

**O que cai de graça depois:** sombra projetada no leito do rio (o mesh do leito amostra
o RT na altura dele — fecha o resto de P6), reflexo/escurecimento coerente na água, duas
sombras do herói sem custo extra de cena (Fase 4).

**Custos, riscos e as leis do repo:**

- +1 passe pequeno de GPU (orçamento: ≤ 0.3 ms desktop / 0.6 handheld, medido por GPU
  timer) e +1 fetch por fragmento lit. Fill do RT é trivial (quads pretos, sem texturas
  além do atlas).
- O sample entra no `customProgramCacheKey` e ganha stand-in no `prewarmShaders` —
  **nenhum compile durante o play** (lei; `perf-profile` guarda).
- **Nenhuma luz nova** — máscara é mesh+RT (lei; `perf-burn` guarda).
- Determinismo: nada de `Math.random` em caminho novo; `visual-ref` re-baseia **uma
  vez**, deliberadamente, no commit que liga o default.
- Entra atrás de `hd3d.shadowMask = 0|1` com A/B ao vivo; o caminho velho só morre quando
  a máscara provar paridade no diff isolado E orçamento cumprido.

**Faseamento interno (cada passo com gate):**
1. RT + consumo SÓ pelo chão, replicando o visual atual → gate: paridade (diff ~0).
2. Subtração seletiva do termo direto (P2/P3) → gate: re-base deliberado + tuning de
   `castShadowAlpha` com o usuário.
3. Billboards recebem (P1) → gate: shots novas de referência (herói na sombra).
4. Penumbra quantizada (P5) → gate: shots + zero "boiling" sob `camSway` (assert no
   cenário `sombras`: dois frames parados idênticos).
5. Lua no canal 2 + leito do rio (fecha P6 de verdade).

### Fase 4 — Luxo (depois do padrão fechado)

- **Duas sombras para o herói** entre duas fogueiras — peso contínuo por distância
  (nunca ranking), dois quads a mais **no RT**, zero draw extra na cena. Muito Souls.
- **Trapézio**: projeção de point light alarga com a distância — atributo `aWiden`
  deslocando os dois vértices da ponta. Sutil; só com a máscara assentada.
- **Preview de sombra de lua no editor/lab** (hoje o editor não mostra nenhuma) — compor
  levels legíveis à noite sem entrar no play.

---

## Parte 5 — Bibliotecas externas: avaliação honesta

| Lib | Veredito | Por quê |
|-----|----------|---------|
| three.js shadow maps / `three-csm` | **Não** | Billboards viram lascas vistos da luz; brigaria com o pixel look e com a lei das luzes fixas. A rejeição fundadora continua certa. |
| `n8ao` / SSAO | **Não** | Depth buffer cheio de quads verticais coplanares → halos e fervura sob `camSway`. O AO assado por canto já entrega a leitura, determinístico e de graça. |
| drei `ContactShadows` / `webgl_shadow_contact` | **Como técnica, não como lib** | O pipeline (RT ortográfico + blur no chão) É a Fase 3 — mas eles renderizam profundidade de geometria (lascas de novo) e o drei arrastaria React. Adotamos a arquitetura alimentada pelas nossas silhuetas. |
| `postprocessing` (pmndrs) | **Neutro, fora de escopo** | Consolidaria passes e daria SMAA, mas força re-base de todo o `visual-ref` por um ganho que nenhum profile pediu. Só se `compose` virar gargalo medido. |
| `three-mesh-bvh`, SSGI/realism-effects | **Não** | Sem interseção com o problema; SSGI é o oposto estético do jogo. |

Nenhuma dependência nova se paga: o sistema é art-directed demais para código genérico
ajudar. O valor externo está em técnicas de referência — coerente com o histórico do
projeto, onde toda vitória de sombra (batching exato, alphaTest escalado, handoff,
esqueleto projetado) foi doméstica e cirúrgica.

---

## Parte 6 — Ordem de execução

| Fase | Item | Esforço | Fecha | Aceite objetivo |
|------|------|---------|-------|-----------------|
| 0 | 0a baseline | XS | — | tabela 3.3 preenchida |
| 0 | 0b cenário `sombras` | S | — | asserts de continuidade + draws rodando verdes |
| 0 | 0c peso morto | XS | P8 | diff 0; sem programa novo |
| 0 | 0d `shadowHeight` | XS | — | diff 0 no default; knob responde |
| 0 | 0e herói unificado | S | — | diff só sob o herói |
| 1 | 1a zero alloc | M | P8 | 0 alocações/frame; diff 0; `braco` verde |
| 1 | 1b índice espacial | M | P8 | `castShadows` ↓ vs main; `perf-burn` verde; diff 0 |
| 1 | 1c batch por sheet | M | P8 | ≤ 6 draws de sombra no Survivors; diff 0 |
| 1 | 1d medir lua | XS | P8 | número anotado; agir só se > 0.1 ms |
| 2 | 2a elevação | S | P6 | diff só com objeto no ar |
| 2 | 2b água | S | P6 | nenhuma sombra flutuando no diff isolado |
| 2 | 2c histerese | S | P5 | assert de zero saltos de rotY no `sombras` |
| 2 | 2d handoff estáticos | M | P7 | árvore = NPC na borda da poça |
| 2 | 2e miudezas | S | — | `machado` verde |
| 3 | máscara i→v | L | P1 P2 P3 P5 P6 | gates internos; orçamento GPU ≤ 0.3/0.6 ms; re-base deliberado |
| 4 | luxo | — | — | por demanda |

**As cinco leis transversais** (nenhuma fase as viola):

1. Nenhuma luz nasce ou morre em runtime; sombra é sempre mesh/RT.
2. Nenhum programa compila durante o play — shape novo entra no `prewarmShaders`.
3. Toda mudança "invisível" prova-se invisível (`visual-ref`, lembrando a armadilha do
   `Math.random` compartilhado — diff estrutural → checar o estado do fogo primeiro).
4. Todo número de perf tem um "antes" (`git stash`, `PLAYTEST_UNTHROTTLED=1`).
5. Testar exatamente o que mudou — cenário alvo, nunca o solve inteiro.

# Plano HD-2D — Qualidade Visual Total

> **Objetivo:** levar o renderer real do jogo (`src/game/render3d/World3D.ts`) ao padrão visual
> HD-2D (Octopath Traveler I/II): pixel art 2D vivendo dentro de um diorama 3D com iluminação
> dinâmica dramática, tilt-shift/depth-of-field, bloom e atmosfera densa.
>
> **Estado-chave descoberto na auditoria:** o protótipo (`src/prototype3d/main.ts`) JÁ implementa
> a maior parte do acabamento HD-2D (ACES, bloom, tilt-shift, vignette, grain, lua direcional,
> partículas). O jogo real renderiza com `renderer.render()` direto, sem nenhum post-processing.
> **A maior parte deste plano é portar e refinar, não inventar.**

---

## Status de implementação

**Fases 0, 1, 2, 3, 4, 5 e 6 IMPLEMENTADAS** (typecheck ✅, build ✅, sem erros de console, testado
via `npm run playtest -- hd2d-fx`, que abre o jogo em `?play` e captura os FX). Fases 0–3, 5 e 6
vivem em `src/game/render3d/World3D.ts`; a Fase 4
adiciona shaders animados via `pixelArtLight.ts` → `Billboard3D` → `WaterObject`/`LavaObject`.
Além do plano original, a **luz de fogueira** foi refeita para ser realista e reproduzir a poça
quente do jogo 2D (feedback direto do usuário):

- ✅ **Fase 0 — post chain completo:** `EffectComposer` + `RenderPass` + `UnrealBloomPass` +
  `ShaderPass` (FinishShader: tilt-shift DoF + vignette + grain) + `ACESFilmicToneMapping`.
  MSAA desligado. `hd3d.fov` agora reprojeta ao vivo. Todos os emissivos (fogo/lava/moedas/glows)
  acendem no bloom de graça.
- ✅ **Fase 1 — foco do DoF segue o herói:** a faixa nítida do tilt-shift acompanha a linha
  projetada do herói na tela; quando um diálogo pana a câmera (`setViewOffset`) e ele sai do
  centro, a faixa vai junto. `params.focusY` vira um viés a partir do centro.
- ✅ **Fase 2 — lua direcional** `#6478b4` (fill frio contra as poças quentes).
- ✅ **Fase 3 — partículas 3D + atmosfera:** brasas (seguem a fogueira acesa mais próxima) +
  poeira cintilante + **vagalumes** (acendem só no raio de uma fogueira acesa — recompensa por
  acender o mundo) + **névoa rasteira** (wisps frios que se afinam junto ao fogo). Todas as
  partículas usam uma textura de "dot" macia (glow redondo, não quadrado). *Céu com gradiente foi
  deliberadamente pulado: com a câmera olhando ~29–48° ABAIXO do horizonte, nenhum céu aparece no
  frame — o topo é chão distante dissolvido no fog; investir em céu ali é desperdício.*
- ✅ **Fase 4 — materiais animados de água e lava:** novo `worldFx` no `patchPixelMaterial`
  (uniform de tempo compartilhado `flowTimeUniform` + varying de posição-mundo `vWorldFxPos`,
  ancorado no MUNDO para que um rio/campo de lava brilhe como uma folha só, sem repetir por tile):
  - **Água** (`waterGlint`) — sparkles frios de luar cintilando pela superfície, somados à cor
    FINAL (pós-iluminação) para brilharem no escuro; o bloom os pega. **Verificado em runtime.**
  - **Lava** (`lavaFlow`) — onda de calor diagonal que modula o emissivo (cristas mais quentes
    empurram mais no bloom). **Confirmado em runtime** (12/07, teleportando até o campo de lava em
    ~56,56): a crosta pulsa e o bloom pega as cristas.
- ✅ **Fase 5 — os FX de mundo saíram do canvas 2D:** a **chama da tocha** virou billboard emissivo
  (o mesmo `tiny-fire` que arde num mato aceso, com `emissiveBoost` → entra no bloom e é ocluída
  pelo mundo); a **danger vignette** virou uniform do FinishShader (`uDanger`/`uDangerColor` — o
  mesmo ramp frio→sangue, agora dentro do post); o **fade de morte** virou `uFade` (o mundo dessatura
  e afunda no post, com bloom/grain/fogo juntos) em vez do retângulo preto. Como a morte não é mais
  uma tampa opaca sobre TUDO, os overlays Phaser que sobravam (o "!" dos NPCs, a bússola de fogo)
  passaram a ser escondidos explicitamente em `triggerDeath`. **Também: o screen shake era
  `cameras.main.shake()`, que hoje só sacode a camada de UI** — virou `World3D.shake()`, um kick que
  translada a câmera do diorama (também cobre o bullet de micro-movimento da Fase 6). Órfão do
  `item-shadow` removido (`constants.ts`, `assetManifest.ts`, `textures3d.ts`).
- ✅ **Fase 6 — color grading cinematográfico** no FinishShader: split-tone (sombras frias / luzes
  quentes), saturação e contraste, com knobs `grade/saturation/contrast`.
- ✅ **Luz de fogueira realista + poça quente estilo 2D** (pedido do usuário, com screenshot de
  referência 2D-vs-3D): flicker em camadas (swell lento + flicker médio + shimmer rápido + ruído +
  flares de "estalo de lenha"), temperatura de cor por brilho (laranja→dourado), fonte que dança;
  a fogueira mais próxima passa a dança para a luz de sombra. A **poça quente ampla** do 2D exigiu
  `fireDist` grande + `fireDecay` baixo + um `lightCap` ALTO novo (o cap `diffuse*1.25` do
  pixelArtLight era fraco demais — o fogo só "revelava" a arte, não construía uma poça quente) +
  um **glow aditivo visível** (`fireGlowSize`/`fireGlowStrength`): um disco radial dourado macio no
  chão, pulsando com a chama — sem ele a `PointLight` só ilumina superfícies e o fogo "parecia
  irrelevante"; ESTE glow é a "luz quente amarelada em volta da fogueira" do 2D.
- ✅ **Knobs `window.hd3d` estendidos:** `lightCap, moon, exposure, fireDist, fireDecay,
  bloomStrength/Radius/Threshold, focusY, focusBand, dofBlur, vignette, grain, fireflies, mist,
  grade, saturation, contrast` — todos aplicados ao vivo por frame.
- ✅ **Defaults recalibrados (2 rodadas de feedback "muito escuro"):** o primeiro tuning ACES saiu
  escuro demais; valores finais aprovados ao vivo — `ambient 4.0`, `moon 2.1`, `exposure 2.2`,
  `lightCap 3.0`, `fireDist 32`, `fireDecay 0.6`, `fireIntensity 265`, `heroLight 42`,
  `vignette 0.24`, `contrast 1.0`. Escuro o suficiente para o clima, claro o suficiente para ler o
  detalhe da terra e a poça do fogo dominar a clareira.

**PLANO CONCLUÍDO — 12/07.** Tudo que restava da auditoria entrou e foi visto rodando
(`npm run playtest -- hd2d-fx`, que entra em `?play`, dispara os FX e mede o frame rate):

- ✅ **Fase 0 — perf medida, não presumida:** 157 fps no desktop com a cadeia de post completa (o
  cenário afirma ≥55). A mitigação de mobile é automática: um aparelho de toque com tela estreita
  entra em `pixelScale 2` (renderiza a 1/4 dos fragmentos e o browser reescala com NEAREST — que é
  o que o pixel art quer de qualquer jeito). *Ressalva honesta: o número de "mobile" foi medido com
  viewport de celular numa GPU de desktop; falta um aparelho real.*
- ✅ **Fase 1 — DoF terminado:** o blur virou assimétrico (o FUNDO derrete, o primeiro plano só
  amacia — `dofNear`), o raio é quantizado em meio-pixel (senão o pixel art "ferve" a cada passo do
  herói), e a intensidade virou **slider no menu de pause** (`graphicsSettings.ts`, persistido; 0 =
  diorama nítido de ponta a ponta) — acessibilidade, como o plano pedia.
- ✅ **Fase 2 — god rays:** um leque de quads aditivos saindo da fogueira acesa mais próxima,
  atravessando as árvores da clareira, respirando com a chama e morrendo quando ela morre (knob
  `hd3d.godRays`). *A sombra da lua ficou DECIDIDA como fora de escopo (ver Fase 2 abaixo).*
- ✅ **Fase 3 — os últimos FX 2D viraram mundo:** faíscas de impacto, flash, estilhaços do deflect,
  motes de cura, fumaça e fagulhas da tocha agora são billboards no mundo (3 texturas de FX geradas:
  ponto, anel e baforada), e os anéis de impacto/cura viraram ondas de choque **no chão**. Duas
  armadilhas que só apareceram rodando: partícula translúcida NÃO pode escrever depth (furava o glow
  aditivo da fogueira e virava um borrão escuro no chão) e NÃO deve pegar fog (a névoa comia a borda
  fraca e deixava um anel escuro em volta) — ambas viraram flags explicadas em `Billboard3D`.
- ✅ **Fase 4 — completa:** AO assado por vertex color nos cantos do chão encostados em árvores/muros
  (profundidade por LUZ, nunca por geometria) e **lava confirmada rodando** — de quebra, a lava
  ganhou luz de fogo própria (é fonte de fogo na ficção do jogo; era um adesivo brilhante sobre o
  chão preto e agora derrama a própria poça de calor).
- ✅ **Fase 6 — completa:** color grading **por região** (a floresta é fria; um campo de lava puxa o
  quadro inteiro para âmbar, com transição suave por proximidade) e **molduras de primeiro plano** —
  copas quase pretas presas à LENTE (filhas da câmera), que o tilt-shift desfoca de graça.

---

## Os 6 pilares do HD-2D (pesquisa)

(Coluna "jogo real" reauditada em 12/07 — era o retrato ANTES da implementação.)

| # | Pilar | O que é | Jogo real hoje |
|---|-------|---------|----------------|
| 1 | **Câmera diorama** | Perspectiva com tilt, FOV que achata mantendo profundidade, parallax | ✅ FOV 38 (reprojeta ao vivo), tilt ~48°, kick de impacto (`World3D.shake`) |
| 2 | **Tilt-shift / DoF** | Faixa nítida no herói, fundo E primeiro plano desfocados = efeito miniatura | 🟡 A faixa segue o herói; falta a curva assimétrica topo×base |
| 3 | **Luz dinâmica dramática** | Point lights que iluminam sprites e projetam sombras; contraste quente×frio | 🟡 Fogueiras vivas + lua fria; sombras são silhuetas fake (`CastShadow3D`); faltam god rays |
| 4 | **Post pesado** | Bloom nos emissivos, tone mapping filmic, vignette, color grading | ✅ ACES + bloom + tilt-shift + vignette + grain + grade (danger e fade de morte inclusos) |
| 5 | **Materiais ricos** | Água com reflexo/specular, emissivos alimentando bloom, relevo por shader | 🟡 `waterGlint` e `lavaFlow` no shader; falta o AO no pé dos cutouts |
| 6 | **Atmosfera** | Partículas (brasas, poeira, vagalumes), fog em camadas, céu | ✅ Brasas, poeira, vagalumes e névoa em `Points` + `FogExp2` (céu pulado de propósito) |

Regra fundamental do projeto que o plano respeita: **nenhum sprite vaza do seu tile — profundidade
vem de shader/luz/post, nunca de aumentar sprites.**

---

## Fase 0 — Fundação: EffectComposer no jogo real ⭐ (maior salto visual por esforço)

Portar o pipeline do protótipo (`src/prototype3d/main.ts:510-567`) para dentro do `World3D`:

- [x] `EffectComposer` + `RenderPass` substituindo o `renderer.render()` direto (`World3D.ts:455`).
- [x] `UnrealBloomPass` — partir dos valores do proto (strength 0.5, radius 0.65, threshold 0.72)
      e retunar: chamas, lava, glows, moedas e outlines já são `MeshBasicMaterial` emissive/additive,
      então vão "acender" de graça. (O comentário em `LavaObject.ts:8` que menciona bloom
      finalmente vira verdade.)
- [x] `ShaderPass` **FinishShader** (portar do proto): tilt-shift DoF (focusY 0.52, band 0.14,
      blur 3.2) + vignette (0.34) + grain (0.02).
- [x] **`ACESFilmicToneMapping` + exposure ~1.15** (proto `main.ts:57-58`). Atenção: o
      `pixelArtLight.ts` capa a luz em ~cor da arte ×1.25 — retunar o cap junto com o ACES para a
      arte não lavar nem escurecer.
- [x] **Disciplina pixel:** desligar `antialias: true` (`World3D.ts:141`) — MSAA contradiz o alvo
      pixel-art e o composer torna ele inútil. Render targets do composer respeitando `pixelScale`.
- [x] **Knobs:** estender `window.hd3d` com `bloomStrength/bloomRadius/bloomThreshold`,
      `focusY/focusBand/dofBlur`, `vignette`, `grain`, `exposure` (espelhar o `window.proto3d`
      do proto `main.ts:571`) — tudo aplicado ao vivo no `render()`.
- [x] **Fix:** `hd3d.fov` hoje é inerte após o boot — aplicar no `render()` com
      `updateProjectionMatrix()`.

**Critério de aceite:** lado a lado jogo × protótipo na mesma cena, indistinguíveis em bloom,
tonalidade e vinheta. Perf: 60 fps desktop; medir em mobile (composer dobra o custo de fill).

---

## Fase 1 — Tilt-shift/DoF: a assinatura do estilo

O FinishShader do proto já dá o efeito em screen-space (barato e fiel ao Octopath). Refinar:

- [x] Faixa de foco ancorada na **linha do herói** (ele é fixo no centro — focusY quase constante,
      mas validar com a UI/HUD: diálogo pana a câmera (`dialog-camera-pan`), a faixa deve
      acompanhar o novo centro de interesse).
- [x] Blur crescente para o **topo** (fundo distante) e **base** (primeiro plano) da tela, com
      curvas independentes — Octopath borra mais o fundo que a frente.
- [x] Desfoque em 2 taps + meio-pixel para não "ferver" o pixel art na faixa de transição.
- [x] Knob de intensidade global (acessibilidade: tem jogador que odeia DoF — expor no menu de
      pause futuramente, junto de `zh.musicVol`).

**Critério de aceite:** screenshot parado parece uma foto de diorama em miniatura; herói e
NPCs próximos sempre nítidos.

---

## Fase 2 — Iluminação: lua + hierarquia de luz (o contraste Octopath)

O coração do HD-2D é o contraste **luz quente pontual × penumbra fria ambiente** — que é
exatamente a fantasia do jogo (acender o mundo às escuras). Já temos a metade quente; falta a fria:

- [x] **`DirectionalLight` lua** `#6478b4` (portar do proto `main.ts:71-84`), intensidade baixa —
      dá modelagem direcional aos cutouts (árvores/muros) e um "rim" frio no lado escuro do mundo,
      em vez do ambient chapado atual (`#8d9cd8` a 2.4).
- [x] Rebalancear ambient ↓ quando a lua entrar (proto usa ambient 9 + lua 3.2 em outra escala —
      retunar no jogo com `hd3d`).
- [x] ~~**Sombra da lua:** segunda shadow map para os cutouts estáticos.~~ **DECIDIDO: não.** O
      projeto abandonou shadow maps reais — `renderer.shadowMap.enabled = false`. As sombras hoje
      são as silhuetas projetadas fake do `CastShadow3D` (que "respiram" com a fogueira mais
      próxima, via `shadowLight`) + os blobs de contato do `groundShadow`. São mais baratas, mais
      controláveis e casam melhor com o pixel art. (Sobraram flags `receiveShadow` mortos no chão.)
- [x] **God rays fake:** shafts de luz como quads additive inclinados atravessando árvores perto
      de fogueiras acesas (técnica clássica do Octopath; billboards emissive alimentando o bloom —
      zero custo de volumetria real).

**Fora de escopo consciente:** ciclo dia/noite — a direção de arte do jogo é noite perpétua
(loop "light the world"); a lua É o nosso "sol".

---

## Fase 3 — Atmosfera: partículas 3D + céu

- [x] **Portar do proto** (`main.ts:475-508`): brasas (26 `THREE.Points` additive subindo da
      fogueira) e poeira (140 `Points` cintilando) — instanciar por fogueira **acesa** e no
      entorno do herói.
- [x] **Vagalumes** perto de fogueiras acesas / grama alta (Points verdes-âmbar com drift senoidal
      e blink) — recompensa visual por acender o mundo.
- [x] **Névoa rasteira em camadas:** 2-3 planos horizontais com textura de nuvem rolando em alpha
      baixo nas áreas escuras/água — some perto de fogo aceso (a fantasia: luz expulsa a névoa).
- [x] ~~**Céu:** substituir a cor sólida~~ **PULADO DE PROPÓSITO** (a câmera olha abaixo do horizonte; nenhum céu aparece no frame). Era: substituir a cor sólida (`World3D.ts:147`) por gradiente vertical + estrelas
      (quad/cúpula distante ou big-triangle shader atrás do fog). O `FogExp2` da mesma família de
      cor continua dissolvendo a borda do mundo.
- [x] Fagulhas da tocha e motes de cura, hoje retângulos 2D Phaser (`GameScene.ts:~1709`,
      `~1912`) → migrar para os mesmos `Points` 3D (herdam luz da cena e bloom).

**Critério de aceite:** cena parada nunca está "morta" — sempre há brasas, poeira ou névoa em
movimento sutil; nada disso rouba atenção do gameplay.

---

## Fase 4 — Materiais: água, lava e relevo por shader

- [x] **Água** (`WaterObject.ts:87-91`): manter o flipbook como base + shader por cima
      (`onBeforeCompile`, com `customProgramCacheKey` — regra do projeto): glint specular da lua
      (sparkles quantizados no ritmo do pixel art) + reflexo fake das luzes de fogo próximas
      (mancha quente alongada que ondula). Nada de reflexo planar real — caro e anti-pixel.
- [x] **Lava** (`LavaObject.ts:24-38`): trocar pulso de alpha por shader de fluxo (scroll UV lento
      + distorção) com emissive acima do threshold do bloom — lava deve ser a coisa mais brilhante
      do mundo depois das chamas.
- [x] **Relevo por luz, não por geometria** (regra do tile): AO baked barato — escurecer levemente
      o pé dos cutouts no vertex color da mesh do chão (as elipses de contato de
      `buildEllipseGeometry` já ajudam; isto integra ainda mais).
- [x] **Normal maps: NÃO.** Em pixel art 16px eles brigam com o estilo (o Octopath usa em texturas
      HD de ambiente, que não é o nosso caso). Nossa profundidade vem de: banding de luz
      (`lightSteps`), footDistance, AO, sombras e post.

---

## Fase 5 — Unificar os FX 2D restantes no pipeline 3D

Tudo que hoje desenha "por cima" em 2D quebra a integridade do diorama (não recebe DoF, bloom
nem tone mapping):

- [x] **Chama da tocha** (era a textura canvas `_torch_flame`) → billboard emissivo 3D, usando o
      sprite `tiny-fire` (o mesmo fogo que arde num mato aceso) com `emissiveBoost: 4`. Entra no
      bloom, é ocluída pelo mundo e some junto com o corpo do herói na morte.
- [x] **Danger vignette** (era imagem radial 2D) → uniforms `uDanger`/`uDangerColor` no
      FinishShader. O ramp (frio → sangue), a respiração e o alpha continuam no `GameScene`; só o
      desenho migrou para dentro do post.
- [x] **Death elegy**: a cena continua 2D (teatral, screen-space), mas o fade virou `uFade` no
      FinishShader (dessatura → afunda em preto), no lugar do retângulo preto. Consequência: como
      a tampa preta sumiu, `triggerDeath` agora esconde à mão os overlays Phaser que sobreviviam
      (o "!" dos NPCs, a bússola de fogo).
- [x] **Screen shake** — não estava no plano, mas era o mesmo pecado: `cameras.main.shake()` sacode
      só a camada 2D, e o mundo (canvas 3D) ficava parado. Virou `World3D.shake(ms, tiles)`, um
      kick que translada a câmera do diorama.
- [x] Balões de dica/números de dano continuam 2D projetados (`projectTile`) — é UI, UI fica
      nítida fora do DoF. **Regra final: mundo = 3D com post; UI = 2D nítido.**
- [x] Cleanup do `item-shadow` órfão (removido de `constants.ts`, `assetManifest.ts` e
      `textures3d.ts`). O `Pickup3D` (itens que giravam como slab 3D) também morreu: por decisão do
      usuário TODO item é billboard 2D, como o resto do jogo.

---

## Fase 6 — Polimento diorama (opcional, alto glamour)

- [x] **Molduras de primeiro plano:** silhuetas desfocadas (galhos/folhagem) entrando pelas
      bordas da tela em cenas-chave (entrada de floresta, santuários) — truque de composição
      direto do Octopath II.
- [x] **Color grading por região:** LUT ou tint no FinishShader variando por bioma (floresta
      fria-azulada, área de lava âmbar) com lerp suave na transição.
- [x] Micro-movimentos de câmera: sway sutil de ±0.5° em idle, kick de 1-2px em dano (respeitando
      o snap no herói).

---

## Ordem, verificação e riscos

**Ordem recomendada:** 0 → 1 → 2 → 3 → 4 → 5 → 6. A Fase 0 sozinha entrega ~60% da diferença
visual entre proto e jogo. Cada fase fecha com tuning ao vivo via `window.hd3d` antes de fixar
defaults em `World3DParams` (`World3D.ts:100-110`).

**Verificação por fase:** screenshot A/B (antes/depois) na cena da fogueira inicial via browser
test (`?play` pula a intro; aba oculta exige `game.step()` manual). Comparar com screenshots de
referência do Octopath II na mesma situação (noite + fogueira).

**Riscos:**
- **Perf mobile:** EffectComposer + bloom dobram fill rate. Mitigação: render em `pixelScale ≥ 2`
  (que ainda por cima reforça o look pixel) e bloom em meia resolução; knob para desligar DoF.
- **ACES × pixelArtLight:** o tone mapping muda a curva de tudo — retunar `lightSteps`, cap ×1.25,
  ambient e fireIntensity em conjunto, não isoladamente.
- **Shader patches:** todo material novo com `onBeforeCompile` precisa de `customProgramCacheKey`
  (regra já aprendida no projeto).

---

## Fontes (pesquisa HD-2D)

- [HD-2D — Wikipedia](https://en.wikipedia.org/wiki/HD-2D) — definição e catálogo de técnicas
  (billboards em 3D, point lights com sombra, tilt-shift, DoF, bloom, volumetria, fog, partículas,
  parallax).
- [Octopath Traveler's "HD-2D" art style — Unreal Engine spotlight](https://www.unrealengine.com/en-US/spotlights/octopath-traveler-s-hd-2d-art-style-and-story-make-for-a-jrpg-dream-come-true)
- [Octopath Traveler II builds a bigger, bolder world — Unreal Engine interview](https://www.unrealengine.com/en-US/developer-interviews/octopath-traveler-ii-builds-a-bigger-bolder-world-in-its-stunning-hd-2d-style)
- [Why Octopath Traveler's HD-2D Style Changed RPG Gaming Forever — Samppy](https://samppy.com/octopath-travelers-hd-2d/) — câmera tilt-shift com FOV amplo, DoF destacando sprites, billboards com sombra.
- [Unveiling Octopath Traveler's Engine — QuartzMountain](https://quartzmountain.org/article/what-engine-does-octopath-traveler-use) — camadas de luz sobre sprites, PBR no ambiente.

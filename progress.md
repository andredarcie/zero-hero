Original prompt: Crie a estrutura do projeto em phaser, com ts e vite, usando as boas praticas

- Projeto inicialmente continha apenas assets e README.
- Vou criar uma base limpa com Phaser + TypeScript + Vite, organizada para expansao.
- Objetivo inicial: cena bootstrap, configuracao central, aliases, pasta public para assets e scripts de qualidade.
- Estrutura inicial criada com Vite + Phaser + TypeScript + ESLint.
- Assets movidos para public/assets para servir arquivos estaticos no Vite.
- Validacao local: typecheck, lint e build passaram.
- Proximo passo: inspecao visual da cena inicial no navegador.
- Inspecao visual concluida no navegador; a cena inicial renderiza grade, HUD textual minima e sprite do heroi.
- Teste de input validado: movimento a direita alterou o estado exposto em render_game_to_text.
- Adicionados .gitignore e README com instrucoes de stack, estrutura e scripts.
- Grid alterada para tabuleiro fixo 8x8 com movimento discreto por celula.
- Heroi trocado para spritesheet 16x16; parado usa frame 3, subida usa frame 4, e movimento lateral anima frames 0 a 3 com tween curto por celula.
- render_game_to_text agora expõe frame atual e moving para validar animacoes do heroi.
- Mini mapa criado com forest_tile_set em duas camadas: ground abaixo e decor acima, com algumas celulas bloqueadas por vegetacao/objetos.
- Ajuste visual: removido preenchimento da grid que estava cobrindo a camada de chao do tileset.
- Ordem de render ajustada: grama baixa agora fica abaixo do personagem; elementos altos continuam acima.
- Grama baixa agora anima com um rustle curto quando o personagem entra em uma celula com esse tile.
- Adicionada base de modo separado `/editor`, com inicializacao distinta entre gameplay e editor.
- Criada `EditorScene` para montar mapas 8x8 com `forest_tile_set`, selecao de tile, camada (`ground`/`upper`), toggle de colisao por camada, reset de mapa e exportacao para JSON copiado no clipboard.
- Criada a pasta raiz `levels/` para receber os arquivos JSON exportados manualmente.
- Validacao concluida: `npm run typecheck`, `npm run lint` e `npm run build` passaram.
- Inspecao visual em `/editor` concluida; selecao de tile, pintura no mapa, camada superior, colisao e exportacao atualizaram corretamente o estado e o JSON exposto em `window.last_exported_level_json`.
- `GameScene` agora usa `levels/level_01.json` como primeiro level do jogo, em vez do layout hardcoded.
- Colisoes do gameplay agora respeitam `collisions.ground` e `collisions.upper` do JSON exportado pelo editor.
- Validacao visual da rota principal concluida com o `level_01.json`; o HUD mostra `Level 01` e o mapa renderizado bate com o arquivo.
- Editor expandido para listar arquivos existentes em `levels/`, carregar um level para edicao e salvar sobrescrevendo o JSON no disco via API local do Vite.
- API local adicionada no Vite para `GET /api/levels`, `GET /api/levels/:file` e `PUT /api/levels/:file`.
- Validacao concluida no editor: `level_01.json` aparece na lista, o carregamento reflete o arquivo real e o botao `Salvar arquivo` regravou `levels/level_01.json` no disco.

- Refatoracao estrutural concluida para separar responsabilidades.
- src/game/assets/assetManifest.ts centraliza preload de assets compartilhados.
- src/game/shared/grid.ts concentra math e utilitarios de grid.
- src/game/debug/debugHooks.ts centraliza ender_game_to_text e dvanceTime.
- src/game/maps/levelRuntime.ts concentra normalizacao de level, spawn e bloqueios.
- src/game/runtime/ agora abriga renderer do board, controle de movimento e efeitos.
- src/game/editor/ agora abriga board do editor, palette e helpers de UI.
- GameScene e EditorScene foram reduzidas para orquestracao de fluxo.
- README reescrito para refletir a estrutura atual e remover problemas de encoding.
- Validacao estrutural concluida: 
pm run typecheck, 
pm run lint e 
pm run build passaram apos a refatoracao.

- Nota final: a refatoracao estrutural foi validada visualmente com capturas headless das rotas / e /editor.
- Nota final: gameplay e editor renderizaram corretamente apos a correcao do init antecipado de GameScene.
- Nota final: ha um aviso de chunk grande no build do Vite, mas o build conclui com sucesso.

- Overworld procedural foi trocado por um mapa fixo de 32 blocos, organizado como 8x4 screens.
- Estrutura de chunk do runtime foi refatorada de quadrado para dimensoes separadas, usando 16x11 tiles visiveis por screen para espelhar o overworld de Zelda 1 no NES.
- Camera/runtime agora tratam a tela ativa por bloco em vez de viewport aberta; a renderizacao visivel foi limitada a um unico screen de cada vez.
- Validacao local apos a refatoracao Zelda 1: npm run typecheck e npm run lint passaram.
- HUD redesenhada no estilo subscreen do Zelda 1: quadro de mapa integrado ao topo, contadores centrais, slots B/A e bloco `-LIFE-` a direita.
- Minimap de canto foi removido e substituido por um mapa de screens dentro da HUD.
- Enemies agora respeitam a tela ativa: spawn apenas no bloco atual, update/render limitados ao screen corrente e bloqueio para nao cruzar para outro bloco.
- Validacao local apos HUD/inimigos: npm run typecheck, npm run lint e npm run build passaram.
- Observacao de QA: a captura headless do client Playwright continuou saindo preta, mas a inspecao no browser do MCP mostrou a HUD nova renderizando corretamente.
- Mundo agora tem conteudo fixo por screen em `ScreenContent.ts`: inimigos e pickups sao definidos deterministicamente no boot, sem spawn por tempo e sem `Math.random` durante a partida.
- `EnemyManager`, `HeartPickupManager` e `SwordPickupManager` foram simplificados para carregar blueprints da tela ativa, destruindo e recriando entidades conforme o jogador troca de screen.
- A espada foi posicionada em uma screen fixa ao leste da tela inicial; coracoes aparecem em screens fixas derivadas deterministicamente do mapa.
- Validacao local apos conteudo fixo: npm run typecheck, npm run lint e npm run build passaram.
- Troca de cenario foi convertida para scroll animado em duas fases no estilo Zelda: passo final para fora da tela antiga e, depois, scroll linear da camera para a proxima screen.
- Durante o scroll, a simulacao de inimigos, moedas e pickups fica congelada para evitar movimento/colisao no meio da transicao.
- `WorldCamera` agora expõe estado de transicao e range visivel inteiro com floor/ceil para suportar screens parciais durante o scroll.
- Validacao local apos a transicao animada: npm run typecheck, npm run lint e npm run build passaram.

- Criado harness de playtest em `playtest/` para o agente rodar e JOGAR o jogo num navegador real (Playwright headed, nunca headless — WebGL headless gera canvas preto). Estrutura: config central, devServer (sobe/reaproveita o Vite), GameDriver (boot/andar/dialogo/loja/screenshots), cenas (smoke/explore/dialog/shop/text-legibility) e orquestrador com relatorio md/json.
- Resultados (screenshots + report) vao para `playtest/results/<run>/`, ignorado no git (regra `playtest/results/*` com `!.gitkeep`). Scripts npm: `playtest`, `playtest:text`, `playtest:all`.
- GameScene agora expoe `window.gameDebug` (getState/openDialog/openShop/closeShop/listNpcKinds), limpo no shutdown, para o harness validar HUD e dialogo de forma deterministica em vez de andar as cegas ate um NPC procedural.
- Descoberto que `page.keyboard.press()` (down+up no mesmo frame) nao registra no jogo, que le `JustDown()` no update(); o driver agora SEGURA a tecla (~70ms) antes de soltar.
- Fonte `Press Start 2P` passou a ser hospedada localmente (`src/styles/fonts/PressStart2P-latin.woff2` via @font-face), sem CDN; o boot em `main.ts` espera `document.fonts.load` antes de criar o jogo para o texto nunca cair no fallback.
- Texto 100% nitido: a causa do borrao era `resolution: 2` nos Text somado a `pixelArt` (NEAREST) — a textura 2x era reduzida para o buffer 1x e esfarelava a fonte. Centralizado em `TEXT_RESOLUTION = 1` (mapeamento texel->pixel 1:1) e aplicado em HUD, intro, dialogo, loja e tela de morte.
- Removido o pos-processamento da GameScene (saturate + vignette) que dava o "clarao branco" na cena.
- Validacao: npm run typecheck, lint e build passaram (fonte empacotada com hash em dist/assets); `npm run playtest:all` rodou as 5 cenas com janela visivel e todas as assercoes passaram.

- Adicionados SFX retro reais (Mixkit, licenca free para jogos) baixados para `public/assets/audio/` e mapeados aos eventos: golpe de espada, acerto/morte de inimigo, moeda, coracao, pegar espada, dano, morte, abrir/fechar loja (ver `public/assets/audio/CREDITS.md`).
- `SoundManager` agora decodifica os MP3 (fetch+decodeAudioData) e toca via AudioBuffer no master gain, com fallback para o synth procedural enquanto o sample nao carregou; footstep/ignite/fireHit seguem procedurais (frequentes/sutis). `GameScene.create()` chama `getSoundManager().preload()`.
- Nova cena de harness `audio` valida que os 10 arquivos servem HTTP 200, que o browser decodifica o formato e que disparar loja/dialogo nao gera erro de pagina.
- Validacao: typecheck, lint e build passaram (10 mp3 copiados para dist/assets/audio); `npm run playtest -- audio` passou todas as assercoes.

- SFX retrabalhados para o clima retro/fantasia-medieval/Zelda/RPG: golpe=Sword blade swish, acerto=Metallic sword strike, morte inimigo=Fantasy monster grunt, moeda=Game treasure coin, coracao=Fairy bell bless, pegar espada=Medieval show fanfare, dano=Human fighter pain, morte=Magical game over, loja abre=Fantasy bells, loja fecha=Page back chime, e novo sample para a espada pegar fogo (Fast magic game spell). Creditos/ids atualizados em CREDITS.md.
- Clipes longos foram cortados com ffmpeg (fade-out) para tamanhos de jogo: eventos frequentes (golpe/acerto/moeda ~0.55-0.6s) nao se acumulam; one-shots (fanfarra 3.6s, ignite 2.0s, game over 2.4s) mantem o impacto. A cena de harness `audio` agora decodifica todos e valida a duracao maxima dos sons frequentes.
- Validacao: typecheck/lint/build ok; `npm run playtest -- audio` passou (11 clips, duracoes dentro do limite, sem erros).

- Trocado de novo: os SFX gravados realistas (Mixkit) foram substituidos por som de CONSOLE ANTIGO/8-bit gerado por sintese. `tools/gen-sfx.mjs` porta o synth sfxr/jsfxr (dominio publico) para os bleeps de canal unico + um mini synth de melodia chiptune (onda quadrada/triangular) para os jingles NES (item get, game over, coracao). Saida em `public/assets/audio/*.wav`.
- `SoundManager` agora carrega .wav (decodeAudioData) em vez de .mp3; mp3 antigos removidos. CREDITS.md reescrito (gerado, sem atribuicao). ESLint passou a lintar `tools/**/*.mjs` com globals de Node.
- Validacao: typecheck/lint/build ok (11 wav em dist/assets/audio, 0 mp3); `npm run playtest -- audio` passou (durações 0.08-0.98s, decodificam, sem erros).

- Adicionada musica de fundo chiptune ORIGINAL (nao copia nenhuma trilha existente) no estilo overworld de aventura/fantasia: `tools/gen-music.mjs` compoe uma peca em Re maior sobre progressao I-IV-V-vi, renderizada no layout autentico de NES (2 pulse: melodia+arpejo, triangulo: baixo, ruido: bateria), com eco no lead e soft-clip. Loop de ~29s (132 BPM, 16 compassos) em `public/assets/audio/music.wav`.
- `SoundManager` carrega e toca a musica em loop (BufferSource loop + musicGain ~0.6 abaixo dos SFX), idempotente entre restarts; `GameScene.create()` chama `startMusic()`. Cena `audio` do harness valida que a musica carrega/decodifica e tem duracao de loop (>10s).
- Validacao: typecheck/lint/build ok (music.wav 2.45MB no dist); `npm run playtest -- audio` passou (12 clipes incl. musica, loop 29.1s, sem erros).

- Musica retrabalhada para um tom dark fantasy, mais lenta e atmosferica: trocada de Re maior/132 BPM para Re menor (Aeolio com V de menor harmonica para tensao)/88 BPM. Arpejo cintilante substituido por um pad sustentado sombrio; bateria de marcha (kick/snare/hats) trocada por um kick lento e suave so nos tempos 1 e 3; melodia mais espacada e em registro mais grave. Loop de ~43.6s.
- Validacao: build ok (music.wav 3.67MB no dist); `npm run playtest -- audio` passou (loop 43.6s, sem erros).

- Musica deixada ainda mais sombria/pesada (estilo dark souls, mas chiptune): 60 BPM, D Phrygian (com o bII/Eb para dread e V harmonico para luto), drone grave constante de D2 (pedal que bate meio-tom contra Eb/A), melodia esparsa e lamentosa em registro grave com muitos silencios, pad frio e lento, e um tambor profundo e raro so na cabeca de cada compasso. Eco longo/cavernoso. Loop de 48s.
- Validacao: build ok (music.wav 4.04MB no dist); `npm run playtest -- audio` passou (loop 48s, decodifica, sem erros).

- Qualidade da musica aumentada drasticamente: motor de audio reescrito em `tools/gen-music.mjs` com sintese/producao de verdade — osciladores band-limited (PolyBLEP, sem aliasing), filtro state-variable ressonante com LFO de corte, unison/detune estereo (cama de coral/cordas encorpada), camada de sub-grave senoidal, reverb estereo Freeverb (hall de catedral) e cadeia de master (DC-block + saturacao tanh + normalizacao). Saida agora em ESTEREO 16-bit. A cauda do reverb da a volta (tail-wrap) para o loop ficar perfeitamente continuo (48.0s, sem gap). Mesma composicao dark Phrygian.
- Validacao: typecheck/lint/build ok (music.wav 8.07MB no dist); `npm run playtest -- audio` passou (loop 48s estereo, decodifica, sem erros).

- Apresentacao estilo "item get" ao pegar a espada (`SwordGetOverlay`): congela o gameplay, escurece a tela, mostra o heroi grande no centro e a espada SOBE acima da cabeca com Back.easeOut, com brilho radial, raios de sol girando, faiscas (estrelas), anel expandindo, flash branco, screen shake e o letreiro "VOCE PEGOU A ESPADA!". Sons: swish na subida + fanfarra no apice. Efeito 100% original (sem assets copiados).
- `GameScene` ganhou flag `itemGetOpen` (congela o update), dispara o overlay em `equipSword()`, limpa no shutdown. `window.gameDebug` ganhou `triggerSwordGet()` + `itemGetOpen` no estado; nova cena de harness `sword-get` dispara e captura o efeito (apex/hold/resumed).
- Validacao: typecheck/lint/build ok; `npm run playtest -- sword-get` passou; capturas confirmam heroi centralizado, espada erguida com raios/faiscas/letreiro.

- Lote NPC/dialogo/combate: todo NPC agora emite luz propria (mesma erase do sistema de iluminacao). Diálogo agora abaixa a musica ate sumir (fadeMusicOut) e a traz de volta a 100% ao fechar (fadeMusicIn); mesmo ducking vale para o item-get. Typewriter toca um blip de "voz" por letra, com tom (freq+forma de onda) por NPC para dar personalidade (DIALOG_VOICES). Jogador nao pode mais ferir inimigos sem espada. A NPC da Morte renderiza 2x o tamanho (ancorada pela base).
- Refatoracao para MUNDO ABERTO com camera centrada: WorldGenerator agora gera terreno aberto infinito procedural por chunk (sem paredes de borda); ChunkManager cacheia chunks sob demanda; ScreenContent virou `getChunkContent` lazy (NPCs curados no nucleo original, procedurais alem). WorldCamera virou modelo centrado (camX/camY seguem o heroi); PlayerMovementController tweena a camera entre tiles com o heroi fixo no centro da tela (removido o scroll tela-a-tela). GameBoardRenderer projeta tiles via tileToScreen. Enemy/Npc/Heart/Sword managers passaram de "uma tela ativa" para streaming de um conjunto 3x3 de chunks ao redor do jogador. Minimap virou radar local centrado no jogador. Footprints agora sao ancorados em world-space e reprojetados a cada frame.
- Validacao: typecheck/lint/build ok; `npm run playtest:all` passou todas as cenas; capturas confirmam heroi sempre centralizado, mundo rolando continuamente e terreno aberto/infinito sem paredes de tela.

- Efeito visual da tocha carregada atualizado: o brilho adicional agora e uma chama feita de blocos 2x2 com paleta retro limitada, sem gradiente, curvas, rotacao suave ou blend aditivo. As particulas de fim de combustivel tambem passaram de circulos para quadrados pixelados. O usuario fara o teste manual; npm run typecheck passou.
- Validacao da chama pixelada: npm run typecheck e npx eslint src/game/scenes/GameScene.ts passaram. O lint completo continua bloqueado por configuracao preexistente: scripts/generateWorld.ts e scripts/worldgen/{contentGen,terrainGen}.ts nao fazem parte do tsconfig usado pelo ESLint.

- Tocha carregada agora mantem o sprite comum do graveto; a chama pixelada separada e o unico elemento que representa o fogo. npm run typecheck e npx eslint src/game/scenes/GameScene.ts passaram.

- Espada, graveto e machado no chao agora usam Pickup3D: um mesh Three.js fino, com frente e verso texturizados pelos sprites pixel-art existentes, sombra de contato e giro continuo no eixo Y. A primeira versao de planos cruzados foi corrigida porque duplicava visualmente a lamina do machado; o modelo atual mantem uma unica silhueta.
- Validacao: npm run typecheck e npx eslint src/game/render3d/Pickup3D.ts src/game/render3d/World3D.ts src/game/entities/ItemPickup.ts passaram. O build completo tambem passou antes do ajuste geometrico final (a alteracao final passou no typecheck e lint).

- Pickup3D deixou de usar planos: espada, machado e graveto agora sao modelos Three.js low-poly reais, formados respectivamente por caixa/cilindro/esfera (lamina, guarda e punho), caixa+cilindro (cabeca unica e cabo) e cilindro+ponteira. Cada parte recebe o sprite original como mapa de textura, responde a iluminacao e projeta sombra; todos continuam girando no eixo Y enquanto estao no chao. Validacao: cliente Playwright executou sem erros; lint dos tres arquivos e npm run build passaram.

- Em andamento: mecanismos de puzzle sem tecla de uso. O schema/editor agora suportam `woodenCrate`, `pressurePlate`, o campo `variable` da placa e `globalVariables` booleanas opcionais no mundo. O editor ganhou modal de variaveis, seletor contextual por placa, validacao e undo/redo; os campos extras sobrevivem a place/erase/undo.
- Runtime implementado: caixa solida empurrada por bump cardinal (recusa destinos ocupados), placa walkable acionada por heroi/inimigo/caixa e placas com o mesmo nome combinadas por OR. Estado e mecanismos foram expostos no debug para playtest. Arte pixel procedural foi registrada nos pipelines Phaser e Three.
- Validacao final dos mecanismos: `npm run typecheck`, ESLint direcionado e `npm run build` passaram. `npm run playtest -- caixa-placa` passou todas as assercoes em Chromium headed: autoria/vinculo no editor, caixa pressionando, heroi pressionando, caixa recusada por rocha e inimigo pressionando; capturas foram inspecionadas e mostram caixa/placa legiveis e o estado pressionado verde.

- Arte do caixote e da placa refeita integralmente na Sprite Factory nativa, estritamente com a paleta oficial: caixote = ramps `wood` + `ink`; placa = `stone` + `ink` + `heroGreen/meadow` no circuito ativo. Specs versionadas em `spritefactory/sprites/wooden-crate.mjs` e `pressure-plate.mjs`; PNGs instalados em `public/assets/environment/props/`. A primeira iteracao foi rejeitada visualmente (X do caixote parecia buraco; placa parecia um L) e redesenhada: X inequívoco, tampa iluminada, bevel completo, quatro parafusos e miolo rebaixado/verde. Ambos os assets passaram com 0 FAIL e 0 WARN, inclusive zero cor off-palette.
- O antigo gerador procedural `mechanismTextures.ts` foi removido; Phaser e Three.js agora carregam os PNGs auditados da fábrica, com a placa como sheet 16x32 (solta/pressionada). Typecheck, ESLint direcionado e build passaram. `npm run playtest -- caixa-placa` passou novamente no run `2026-07-19T22-11-00`; screenshots do editor, caixa na placa e inimigo na placa foram inspecionados e aprovados.

- Em andamento: roda d'agua geradora pedida pelo usuario. A arte `water-wheel` foi criada na Sprite Factory como sheet 16x16 de 16 frames (8 orientacoes fisicas do rotor em bancos desligado/ligado), com roda/cavalete de madeira, eixo/carcaca de pedra e indicador verde. O loop build→preview→correcao removeu pixels diagonais orfaos; relatorio final da fabrica: 0 FAIL, 0 WARN. PNG instalado em `public/assets/environment/props/water_wheel.png`; falta integrar ao editor/runtime e validar no jogo.
- Integracao base da roda concluida: novo prop `waterWheel`, asset carregado por Phaser/Three, paleta do editor e seletor contextual de saida. O editor valida roda sem variavel e roda sem rio ortogonal adjacente. Runtime modela aceleracao, coast e limiar real de geracao; placas+rodas agregam fontes por OR na mesma variavel. Braco robotico agora aceita alimentacao opcional (sem vinculo preserva compatibilidade; vinculado congela/escurece sem energia). Debug expoe roda/velocidade/frame/geracao e energia dos bracos. `npm run typecheck` e ESLint direcionado passaram.

- Correcao de requisito da roda d'agua: ela deixou de ser um billboard bancario e agora ocupa o PROPRIO tile de rio. O editor recusa terreno seco e permite substituir apenas `water`/`bridgeSpot`; o runtime cria agua ativa sob a roda e exige continuidade ortogonal. `World3D` inclui `waterWheel` na malha rebaixada do canal, portanto a agua fica realmente visivel sob as pas; drenar o tile da maquina corta a corrente.
- Rotor refeito em 3D real com Three.js: aro low-poly, seis raios conectados, oito pas volumetricas, cubo, eixo, cavalete parcialmente submerso, carcaca e lampada fisica do dinamo. A hierarquia gira continuamente em `rotation.z`, com aceleracao, inercia/coast e limiar de geracao. A folha da Sprite Factory (0 FAIL/0 WARN) permanece como icone/editor e referencia de paleta.
- Juice final: splash direcionado e SFX ciclico nas pas, som+shake de partida, pulso/anel/faiscas verdes ao energizar, lampada fisica ligada/desligada e brilho de queda de tensao. Efeitos e audio sao limitados por distancia, mas a simulacao continua fora da tela.
- Playtest final `run-2026-07-19T23-13-47`: todas as assercoes passaram, sem erros de pagina. Cobertura: rejeicao em terra seca, substituicao da agua, continuidade do rio, angulo 3D mudando, aceleracao, geracao, braco transportando carga, drenagem sob a roda, coast e desligamento. As seis capturas foram inspecionadas; mostram o rotor dentro do canal antes/depois da drenagem e o dinamo verde/cinza.
- Regressoes `caixa-placa` e `braco` passaram juntas no run `run-2026-07-19T23-17-37`. Cliente Playwright padrao do skill tambem executou sobre `?play&level=1` e gerou captura valida. Typecheck, ESLint direcionado e `npm run build` passaram; a fabrica foi reexecutada no fim e manteve 16 frames com 0 FAIL/0 WARN. O unico aviso do build e o chunk grande preexistente do Vite.

- Solicitacao atual: "crie um item genial que ainda esta faltando no jogo".
- Criada a bateria vazia/carregada, fechando o triangulo de recursos portateis: graveto leva fogo, balde leva agua e bateria leva eletricidade. Ela carrega ao pisar num cabo vivo, permanece estavel durante o transporte, alimenta por 20s uma rede isolada e termina como carcaça vazia recuperavel.
- Arte da bateria feita na Sprite Factory em dois frames (janela vazia/dourada), 0 FAIL e 0 WARN, integrada ao runtime 3D e ao editor. O ciclo possui efeito/som de carga e som proprio de encaixe.
- Fechado o gesto walk-only que faltava: pisar num cabo morto com a bateria cheia agora a encaixa no proprio tile, sem exigir um botao de largar nem uma troca artificial com outro pickup. Sair e voltar permite recolher o item normalmente.
- Textos de item adicionados em pt-BR/en (incluindo o carvao, que ja caia no fallback cru). GameScene agora registra `render_game_to_text` e `advanceTime`, restaurando os hooks anteriores no shutdown; o cliente Playwright padrao voltou a emitir `state-0.json` com coordenadas e estado completo.
- Validacao final: `npm run typecheck`, ESLint direcionado, `npm run build`, cliente Playwright padrao e playtests `bateria`, `fios` e `itens` passaram. Capturas da bateria carregada/alimentando/esgotada foram inspecionadas. O lint global ainda encontra a configuracao preexistente fora do escopo em `scripts/worldgen` e nos `.mjs` da Sprite Factory; o build mantem apenas o aviso conhecido de chunk grande.
- TODO resolvido na reconciliacao das duas implementacoes: `chargeMs` agora VIAJA com o item por
  toda troca de maos (chao -> mao -> chao -> garra do braco), via `heldBatteryChargeMs` na cena
  (o par eletrico do torchFuelMs), `chargeMs` no CollectedItem/takeAt/drop e `carriedCharge` no
  braco. Pegar uma bateria meio-drenada e re-encaixar mantem a carga parcial — o exploit de
  energia infinita por ciclagem esta travado pelo assert 2b do cenario `bateria`.

- Solicitacao atual: "Crie um portao eletronico, que so pode ser aberto por eletricidade; se o fio
  fica sem eletricidade ele fecha novamente. Crie essa prop. De alta qualidade."
- Decisao de integracao: `electronicGate` sera um consumidor fisico da malha de cabos (sem energia
  sem fio), direcional, solido ate o vao estar livre e fail-safe — perder corrente inicia o
  fechamento automaticamente. Arte de autoria pela Sprite Factory; runtime em Three.js 3D real.
- Implementacao base concluida: spec `electronic-gate` com quatro orientacoes foi construida e
  instalada com 0 FAIL/0 WARN; editor/schema/manifest reconhecem o prop e avisam se ele estiver
  sem cabo adjacente. `ElectronicGateObject` monta pilares, travessa, grade, faixas de risco,
  motor e lampada em Three.js; a grade abre/fecha com percurso fisico e colisao pelo vao.
- Runtime integrado ao flood-fill: somente cabo vivo adjacente energiza o portao; apagar a rede
  inicia o fechamento fail-safe no mesmo frame. Debug expoe energia, abertura, movimento e
  blocking. Cenario dedicado `portao-eletronico` adicionado para autoria e ciclo completo.
- Correcao visual solicitada pelo usuario: descartado integralmente o modelo Three.js volumetrico.
  O corpo agora e um UNICO `Billboard3D` 2D, igual aos outros props. A Sprite Factory foi
  redesenhada para 8 frames 16x16 (4 alturas da grade x bancos apagado/energizado), usando apenas
  a paleta oficial ink/stone/gold/meadow; build final da arte: 0 FAIL e 0 WARN.
- Primeiro playtest da versao billboard encontrou a omissao do sheet no registro Three.js
  (`textures3d: chave desconhecida electronic-gate`) antes de entrar no gameplay. Registro 3D
  adicionado; o teste dedicado sera reexecutado do zero.
- Segundo playtest passou todas as assercoes sem erro de pagina. Capturas fechada/aberta foram
  inspecionadas e confirmam o corpo como sprite pixel-art, cabo apagado/aceso e vao realmente
  vazio no frame aberto. O cenario foi apertado para capturar explicitamente os frames 5/6 na
  subida e 1/2 na descida, em vez de aceitar um instante ainda no frame extremo.
- Validacao final da versao 2D: cenario `portao-eletronico` passou novamente com capturas do
  editor, fechado, subindo (frame 5), aberto (frame 7), descendo sem energia (frame 2) e fechado
  de novo; todas foram inspecionadas. Regressao `fios`, cliente Playwright padrao, typecheck,
  ESLint direcionado e build passaram. Unico aviso: chunk grande preexistente do Vite.

- Solicitacao atual: "Revise a qualidade da roda da agua. Faca que ela uma texturua mais fiel
  possivel ao pixel art do jogo. E faca ela ser possivel ligar aos fios de energia, ela gera
  energia neles se ligado."
- Revisao encontrou que a roda usava geometria Three.js (torus/caixas/cilindros) no gameplay,
  apesar de os demais props usarem sprites. `WaterWheelObject` foi convertido para um unico
  Billboard3D animado por 8 poses inteiras, preservando aceleracao, coast, limiar do dinamo,
  respingos e SFX.
- Arte `water-wheel` v2 refeita em 16x16 na Sprite Factory: silhueta ink, rampa wood completa,
  carcaca stone, linha de imersao e lampada verde, em bancos off/on. Build da fabrica: 0 FAIL,
  0 WARN; PNG instalado em `public/assets/environment/props/water_wheel.png`.
- Cabo adjacente virou a saida principal explicitamente documentada no editor/debug. A roda nao
  exige mais variavel global quando esta fisicamente cabeada; variavel permanece opcional para
  compatibilidade com puzzles existentes. Falta atualizar/reexecutar o playtest dedicado com
  uma rede de fios real e inspecionar as capturas.
- Ajuste visual apos feedback do usuario: o plugue generico do cabo ia da borda ao centro do tile
  e atravessava a roda. `resolveWireShapes` agora continua reconhecendo a roda como conexao, mas
  nao cria nela o prolongamento central; o cabo termina na borda compartilhada, junto da tomada
  lateral do dinamo. Outras maquinas preservam seus plugues centrais.
- Correcao de direcao do usuario: a roda deve permanecer 3D. `WaterWheelObject` foi restaurado ao
  modelo Three.js original (aro low-poly, raios, pas volumetricas, eixo, cavalete e dinamo). A
  folha pixel-art v2 permanece apenas como icone/editor; as melhorias de cabo direto e tomada
  lateral sem fio atravessando o rotor foram mantidas.
- Validacao final: `roda-agua` passou 25/25 assercoes com a roda 3D, dois fios reais e braco sem
  variavel; capturas ligada/desligada foram inspecionadas e confirmam que o cabo termina na lateral
  do dinamo sem cruzar o rotor. Regressao `fios`, cliente Playwright padrao, typecheck, ESLint
  direcionado e build passaram. O build mantem apenas o aviso conhecido de chunk grande.

- Solicitacao atual: "revise a qualidade visual da roda" mantendo a decisao anterior de que ela
  deve permanecer 3D.
- Primeira revisao do modelo 3D implementada em `WaterWheelObject`: aro duplo separado em
  profundidade, raios dianteiros/traseiros, pas texturizadas com cintas metalicas, quatro pernas de
  cavalete, eixo com tampas e dinamo em camadas (base/corpo/tampa/bobinas/tomada). A lampada ganhou
  emissivo discreto sem adicionar PointLight. Typecheck e ESLint direcionado passaram; falta o
  playtest visual e eventuais ajustes de silhueta.
- Segundo passe visual concluido apos inspecao das capturas: eixo, cubo e tampa do dinamo foram
  escurecidos para remover a leitura de "cruz branca"; as duas faixas de cobre foram trazidas para
  a face visivel do gerador. O cabo continua terminando na tomada lateral, sem atravessar o rotor.
- Validacao final: `roda-agua` passou todo o ciclo de aceleracao, geracao, consumo, coast e
  desligamento; as capturas ligada/desligada foram inspecionadas. Regressao `fios`, cliente
  Playwright padrao, typecheck, ESLint direcionado e build passaram. O build mantem somente o aviso
  conhecido de chunk grande do Vite.

- Solicitacao atual: no `/lab`, criar um gerenciador simples para listar, criar, nomear, abrir,
  modificar e apagar levels; adicionar um prop de portal roxo que conclui o level e leva ao
  proximo.
- Decisao de arquitetura: a autoria passa por uma API dev dedicada sobre `public/levels`, que
  mantem `index.json` sincronizado com os arquivos reais. O painel de levels fica dentro do DOM do
  editor e bloqueia trocas/mutacoes enquanto houver alteracoes nao salvas. O portal consulta a
  ordem desse manifesto para avancar, em vez de assumir que os numeros sao sempre consecutivos.
- Correcao visual explicita do usuario: o portal nao deve ser geometria 3D. O primeiro arco
  volumetrico foi descartado; o prop inteiro agora e uma unica imagem 16x16 pixel-art roxa em
  `Billboard3D`, com pulso de luz em dois degraus e tile caminhavel.
- Implementacao concluida: o botao `Levels...` abre um painel que lista todos os levels, destaca
  o atual e permite criar, abrir, renomear e apagar (com protecao do level base). Criar ou salvar
  atualiza `public/levels/index.json`; operacoes destrutivas ficam bloqueadas enquanto houver
  alteracoes locais nao salvas.
- O prop `levelPortal` foi integrado ao schema, paleta do editor e runtime. Ao entrar no tile, o
  jogador recebe o feedback roxo e o jogo carrega o proximo arquivo na ordem real do manifesto;
  lacunas numericas sao aceitas e o ultimo level retorna para a selecao/editor.
- Validacao final: o cenario dedicado `level-manager-portal` criou dois levels, listou, renomeou,
  abriu, salvou um portal pelo editor, atravessou-o para chegar ao segundo e apagou os temporarios.
  A captura confirmou que o portal e uma unica imagem 2D pixel-art em billboard. Build, checks de
  sintaxe e as regressoes `fios` e `portao-eletronico` passaram sem erros de pagina; permanece
  apenas o aviso conhecido de chunk grande do Vite.
- Requisito adicional: todo level precisa de um ponto de partida colocado. A antiga ferramenta
  `Spawn` virou `Ponto Inicial`, com marcador ciano rotulado no mapa, coordenadas no gerenciador e
  ajuda contextual. Levels novos ja recebem o ponto (6,6); arquivos antigos sem ponto recebem um
  no centro e ficam marcados como alterados para serem salvos.
- O Ponto Inicial e requisito de save/playtest: precisa existir, estar dentro do level e ocupar um
  tile sem colisao. O cenario final `run-2026-07-21T00-07-03` validou criacao automatica, ferramenta,
  coordenadas na lista, reposicionamento, rejeicao sobre colisao, portal e progressao; todas as
  assercoes passaram sem erros de pagina. Capturas do painel e do marcador foram inspecionadas.

- Solicitacao atual: ao entrar em um level, mostrar o nome autoral centralizado com a fonte do jogo
  e remove-lo com uma animacao bonita e elegante.
- Implementacao inicial: `LevelIntroOverlay` usa `meta.name`, numero do level, moldura pixelada em
  dourado e uma faixa escura sobre o mundo 3D. O gameplay e os botoes do level ficam bloqueados
  durante a apresentacao e voltam quando o fade termina. Cenario `level-intro` cobre o ciclo.
- Primeiro playtest confirmou visual e bloqueio de input; a assercao final tentou andar sobre o
  NPC a direita do spawn e foi corrigida para usar o tile livre acima. A dica de restart dos
  botoes tambem volta a contar seus 6 segundos somente depois que a apresentacao termina.
- O cliente Playwright padrao capturou o letreiro corretamente e revelou o 404 preexistente de
  `/favicon.ico`; `index.html` agora declara o icone do heroi ja existente como favicon.
- Validacao visual final: o harness dedicado passou todas as assercoes e as capturas foram
  inspecionadas. O cliente padrao percorreu entrada e estado final quadro a quadro, gerou quatro
  estados (aberto -> fechado) sem `errors-*.json`; o processo apenas excedeu o timeout ao fechar o
  Chromium depois de todos os artefatos ja terem sido gravados.
- Validacao final de codigo: `npm run build` e ESLint direcionado aos arquivos alterados passaram.
  O `npm run lint` completo continua bloqueado por erros preexistentes de configuracao/globals em
  `scripts/worldgen` e `spritefactory`; nenhum erro envolve a apresentacao de level.

- Solicitacao atual: "Faca o portal ser um portal estilo medieval, em volta feito de pedra e no
  meio roxo so que com animacoes, use particulas. Faca um pixel art de alta qualidade, baseado nos
  sprites do jogo."
- Revisao inicial: o portal atual e um canvas 16x16 de frame unico, com moldura cinza uniforme e
  apenas pulso de alpha. A nova direcao mantem o prop como Billboard3D 2D, cria arco medieval com
  a rampa stone/ink oficial, vortice roxo animado em quatro frames e particulas pixeladas orbitais.
- Arte `level-portal` criada na Sprite Factory: quatro frames 16x16, oito cores oficiais, arco de
  pedra estavel, energia roxa em fluxo e motes embutidos. O build da fabrica passou com 0 FAIL e
  0 WARN; PNG instalado em `public/assets/environment/props/level_portal.png`.
- Integracao runtime concluida: sheet carregado por Phaser/Three, animacao de 4 frames, glifo de
  soleira pulsante e oito particulas pixeladas ascendentes/orbitais. Debug agora expoe frame e
  numero de particulas visiveis para validacao deterministica.
- Primeiro playtest encontrou uma defasagem no proprio cenario: ele tentava andar durante a nova
  apresentacao autoral do level, quando o input fica bloqueado por design. O cenario agora espera
  `levelIntroOpen=false` antes de capturar e atravessar; nenhuma excecao de pagina foi registrada.
- A segunda execucao validou visual, particulas e progressao, mas revelou outra premissa antiga do
  teste: havia agora um Level 2 autoral preexistente, entao apagar os levels QA retorna corretamente
  a ele, nao obrigatoriamente ao Level 1. A assercao passou a derivar o ultimo level inicial.
- O cenario dedicado agora tambem amostra dois instantes do portal e exige troca real de frame com
  particulas visiveis nos dois, alem de salvar as duas capturas para revisao visual da animacao.
- Validacao final: `level-manager-portal` passou todas as assercoes no run
  `run-2026-07-21T01-49-34`, sem erros de pagina. O estado mudou do frame 1 para o 3 e manteve oito
  particulas visiveis; as duas capturas foram inspecionadas e confirmam pedra estavel, fluxo roxo,
  glifo no chao e motes em posicoes distintas. A travessia continuou carregando o proximo level.
- A fabrica foi reexecutada no fim e permaneceu com 0 FAIL/0 WARN. `npm run typecheck`, ESLint
  direcionado, `npm run build` e o cliente Playwright padrao passaram; este ultimo gerou estado e
  capturas sem `errors-*.json`. O build mantem apenas o aviso preexistente de chunk grande.
- TODOs: nenhum para esta solicitacao.

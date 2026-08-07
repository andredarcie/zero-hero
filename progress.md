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
- src/game/debug/debugHooks.ts centraliza render_game_to_text e advanceTime.
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

- Auditoria do overworld contra Zelda 1 (pedido de 2026-07-29): a folha limpa 4096x1408 usada pelo
  gerador foi baixada novamente para uma pasta temporaria e `gen-zelda-world.mjs` foi reexecutado
  fora do repo. O terreno gerado e o `public/world.json` atual tiveram 0 diferencas em ground,
  upper e collision nos 22.528 tiles Zelda; o mapa ocupa 256x88 tiles dentro de uma moldura de
  mar 264x96. O componente alcancavel desde o spawn cobre 9.716 de 9.941 tiles livres (97,74%).
- Conclusao da auditoria: a macrogeografia/caminhabilidade e uma conversao 1:1 muito boa, mas o
  mundo jogavel ainda nao e fiel ao Zelda 1. Os chunks sao 12x12, a camera e continua/centrada e
  a apresentacao e HD-2D escura; o original organiza o overworld em 128 telas 16x11 com flip-scroll.
  O gerador tambem substitui pontes por pedra, cavernas por piso de tumulo e nunca emite a classe
  STATUE, apesar de declarar suporte a ela.
- Conteudo/progressao ausentes: os 176 chunks do overworld tem 0 inimigos, 0 pickups e 0 NPCs;
  os unicos props sao uma fogueira e nove portais. Os portais 7, 8 e 9 ficam visiveis e ativos sem
  recorder/queima/bomba/Triforce. Teste funcional entrou no Level 9 com inventario vazio. O Level 4
  e o unico portal fora do componente alcancavel e nao ha balsa/bridgeSpot no overworld, portanto
  ele fica inacessivel por jogo normal.
- Regressao encontrada antes do playtest: `npm run typecheck` falha porque GameScene usa
  `getWorldBounds`, `getChunkTerrain` e `DUNGEON_TILES` sem importa-los; o smoke real cai com
  `ReferenceError: getWorldBounds is not defined`. Para concluir somente a inspeção, uma instancia
  Vite temporaria injetou esses tres imports em memoria, sem modificar codigo do repo; smoke e
  explore passaram nela e as capturas dos marcos foram inspecionadas.
- TODO sugerido: restaurar os tres imports; depois decidir se o alvo e fidelidade geografica ou
  fidelidade estrutural. Para a segunda, reintroduzir telas 16x11/flip-scroll, segredos e gating,
  conteudo de cavernas, Armos e os itens de travessia antes de chamar o overworld de fiel.


- A ABA INIMIGOS VOLTOU, e o que ela coloca e um PONTO DE SPAWN (pedido de 2026-07-30: "no editor
  nao tem uma aba dos inimigos... e no caso e adicionar o spawn do inimigo, pois depois de mortos
  passa um tempo e eles voltam"). O jogo tinha uma fonte de caveira so — o cerco
  (`UndeadSpawnDirector`), que invoca num anel em volta do HEROI no escuro. Isso e pressao de
  ambiente e nunca serviu pra autorar nada ("a caveira daquele corredor" nao existia), e ele fica
  desligado justamente onde uma sala precisa de guarda (lab e levels, `meta.puzzle`).
- A aba existia e foi REMOVIDA quando o inimigo passou a ser dinamico; o schema (`chunk.enemies`),
  o place/erase/undo do `EditorStore`, o chip do tabuleiro e o ponto do minimapa continuaram
  inteiros esse tempo todo. O que faltava era a aba e, sobretudo, alguem no runtime que lesse
  aquilo — a validacao do editor ate mandava o autor APAGAR os inimigos do arquivo ("inimigo(s)
  legado(s)... o jogo ignora inimigos colocados"), aviso que morreu agora.
- Runtime novo: `src/game/entities/EnemySpawnerManager.ts` + `WorldData.getEnemySpawns()` +
  `ENEMY_RESPAWN_MS` (25s, ao lado de `TREE_REGROW_MS`). `EnemyManager.spawnUndead` passou a
  DEVOLVER o corpo — e o unico canal de morte que existe, porque `EnemyBase.die()` nao avisa
  ninguem de fora e os dois lugares que matam (o golpe e a bomba) nao sabem de covas.
- As decisoes que sustentam a peca: **um corpo por cova**, e a cova continua responsavel por ele
  depois que ele anda para longe do tile (se o criterio fosse "tem alguem no meu tile?", ela pariria
  outro a cada passo do proprio corpo e uma cova autorada viraria um cerco); **o relogio conta
  sempre**, mesmo com o heroi longe (senao voltar a uma sala limpa daria uma sala vazia, e a cova
  viraria decoracao — e por isso as covas sao lidas de uma vez e nunca por chunk, que zeraria o
  relogio a cada ida e volta); **a cova acorda em `DETECTION_RANGE` (14)**, o mesmo numero pelo qual
  a caveira enxerga o heroi e uma placa, e 14 < 18 (`DESPAWN_DISTANCE_TILES`) de proposito, pra nada
  nascer dentro da faixa em que seria despejado no mesmo instante; **sem distancia minima** (o autor
  escolheu o tile, e o telegrafo de ~3s e o que torna justo um nascimento colado).
- **A cova nao desenha nada em jogo**: o nascimento JA e a arte dela (o chao rachando em tres
  estagios com poeira). Uma marca parada entregaria a emboscada antes de ela existir — a lei da
  casa, o mundo ensina e o HUD nao. No tabuleiro do editor ela e um chip vermelho com a arte do
  bicho, porque ali ela precisa dizer O QUE nasce.
- **Elegibilidade = a do cerco MENOS a alcancabilidade**, e a subtracao e a peca:
  `undeadReachableTiles` e um flood-fill a partir do HEROI limitado ao anel + 3, e reprovaria toda
  cova a mais de ~10 tiles. Ficaram: tile solido, corpo em cima e LUZ DE FOGUEIRA — que virou jogo
  de graca (acender o fogo do corredor cala o corredor; apagar com o balde reabre). Com o heroi
  DENTRO da seguranca de um fogo nenhuma cova abre, e isso tambem e consequencia do bicho e nao
  regra nova: alcancada a seguranca a matilha se desfaz sozinha (o sunset), entao parir um corpo pra
  ele virar po tres segundos depois seria promessa nao cumprida — e o jogador sentado na fogueira
  ouviria o chao rachando pra sempre por nada.
- Editor: `PaletteTab`/`EntitySelection` ganharam `enemies`, `ENEMY_DEFS`, o ponto vermelho, a aba
  como **5** (no fim, e nao na segunda posicao que tinha antes: 1..4 e musculo de quem autora hoje),
  `TOOL_DEFS` da entidade virou "2-5", a linha do modal de ajuda foi corrigida (ela ja prometia 5
  abas), o modal Mundo conta inimigos e `UI_STATE_KEY` foi pra **v6**. O aviso de inimigo legado deu
  lugar a dois avisos reais, que sao as duas unicas maneiras de uma cova nascer morta em silencio:
  tile bloqueado (colisao pintada, pinheiro/montanha/alvenaria/mar, ou prop solido) e cova dentro da
  luz de um fogo que JA nasce aceso (o de casa, ou `lit: true`). O `solidProps` da caixa de
  ferramentas foi hoisted pros dois usarem a mesma lista.
- Consequencia emergente: a isca de placa de pressao (a caveira que MARCHA ate uma placa) passou a
  valer num LEVEL. Ela estava escrita como "so na aventura, porque caveira nao e autoravel"; o corpo
  que faltava era este, e nao uma linha de codigo.
- Cenario novo `npm run playtest -- inimigos`, e ele vale de pe porque roda no **lab**, onde o cerco
  nao existe: toda caveira que aparece saiu de uma cova. Tres covas — a que funciona (nasce, morre,
  VOLTA, e nao faz a segunda enquanto o corpo dela anda longe), a que esta na luz (calada, e ABRE
  quando o fogo apaga: sem essa segunda metade uma cova simplesmente quebrada passaria no teste) e a
  que esta debaixo de uma pedra (calada, e apagar fogueira nao resolve). Ele tambem cobra os dois
  avisos do editor e que o jogo BOOTE com o respawn de verdade antes de encurtar o relogio em campo
  (`enemySpawners.respawnMs`, exposto so pra isso). `npm run typecheck` e o ESLint direcionado
  passaram; o cenario ainda nao foi rodado.
- O CLAUDE.md foi cortado pra 200 linhas no mesmo dia (regra nova, escrita nele): so contratos,
  comandos e as regras que doem quando quebradas; o porque de cada peca ficou aqui, e o arquivo
  longo inteiro esta preservado no apendice abaixo.

- MINIMAPA DO ZELDA 1 REMOVIDO (pedido de 2026-07-30: "era so pra testes na epoca"). Ele existia
  para conferir andando que o mundo gerado era o overworld do Zelda 1 — auditoria concluida logo
  acima. `src/game/debug/zeldaMiniMap.ts` foi apagado e os quatro pontos de contato no `GameScene`
  (import, `mountZeldaMiniMap` no create, `updateZeldaMiniMap` no update e `unmountZeldaMiniMap` no
  shutdown) sairam junto; os quatro ja estavam marcados TEMPORARIO, que e o unico motivo de a
  remocao ter sido limpa. O modulo nunca chegou a ser commitado, entao saiu de vez.
  A imagem-referencia da auditoria (`public/assets/debug/zelda-overworld-mini.png`, 12KB) foi
  apagada em seguida a pedido, e a pasta `public/assets/debug/` sumiu com ela — nao havia nenhuma
  referencia sobrando no codigo, e ela vinha embarcando no build por morar em `public/`. Ela tambem
  nunca tinha sido commitada: se aquela conferencia precisar rodar de novo, a folha limpa se baixa
  outra vez (ver a auditoria acima, que fez exatamente isso numa pasta temporaria fora do repo).
- Junto disso, um erro de sintaxe REAL que impedia o `typecheck` foi corrigido em
  `render3d/pixelArtLight.ts:103`: um comentario dentro do template `/* glsl */ \`...\`` usava
  crases em volta de `bounds`, e crase dentro de template literal FECHA a string (dois TS1005 no
  arquivo inteiro). Comentario de GLSL vive dentro de uma string JS: markdown ali quebra o build.

- MODO SOBREVIVENTES REMOVIDO POR COMPLETO (pedido de 2026-07-30). Saiu `src/game/survivors/`
  inteiro (17 arquivos: cena, config de balanceamento, horda, jogador, armas, gemas, pickups, meta,
  mundo, texturas, escolhas e 4 overlays de UI) e o cenario `playtest/scenarios/survivors-tour.mjs`.
  Junto com eles, cada ponto por onde o modo entrava no jogo: a cena no `config.ts`, a rota
  `?survivors` no `PreloadScene`, o `[S]` do titulo (texto, handler e `startSurvivors`), a entrada
  do `DevLauncher`, a chave `title.survivors` nos dois locales, e a faixa `survivors` do
  `SoundManager` (`MusicKey` encolheu).
- Peso morto que saiu com ele: `public/assets/audio/music-survivors.wav` (2,8 MB que embarcavam no
  build), o `renderSurvivors` do `tools/gen-music.mjs` (~160 linhas) com sua entrada no registro de
  renderers, e a linha do `CREDITS.md`. E — o achado do dia — **12 DEFS do `textures3d.ts`**
  (morcego, aranha, dois slimes, duas pocas, mago-ferido/conjurando, bola magica, torreta, bala,
  flecha): aquele registro carrega TODA def em `preloadTextures3D`, no boot, entao a fauna de um
  modo que quase ninguem abria era download e VRAM em cada partida da AVENTURA. O `mage` ficou: nao
  e inimigo, e a arte do NPC "wizard" (`NPC_VISUALS.wizard`).
- **A ARTE dos bichos continua no disco** (`public/assets/characters/enemies/{bat,spider,slime,
  turret}` + os projeteis), de proposito: ela e a resposta mais barata para o bestiario que o plano
  do Zelda pede (`docs/zero-hero-como-zelda-1.md` §1.4), e voltar uma delas custa UMA linha de def.
  O que foi apagado ali foi so o que carregava a arte, nao a arte.
- **O batching de sombra de ator saiu do renderer com o modo, e essa foi a unica decisao dificil.**
  Os campos instanciados por sprite sheet (`actorCastFields`/`sheetCounts`/`actorBatchSheets`,
  `ACTOR_BATCH_MIN`, `ACTOR_FIELD_CAPACITY`, `actorFieldFor` e o opt-in publico
  `enableActorCastBatching`) existiam para UMA coisa: as ~100 caveiras da horda eram ~100 draws de
  silhueta. `SurvivorsScene` era o unico chamador do opt-in, entao sem ele o conjunto ficava vazio
  para sempre e todo o caminho virava codigo morto atras de um `if`. Remover e provadamente inocuo
  para a aventura porque ela NUNCA batchou: o `if (actorBatchSheets.size > 0)` nunca era verdade
  ali, por decisao antiga (dobrar N quads ordenados individualmente num mesh so muda a ordem da fila
  transparente e portanto a mistura com o fog — o mato alto batchou sozinho uma vez e as fotos de
  referencia pegaram a diferenca). Ficou uma NOTA no lugar dos campos dizendo o que era e por que
  voltaria, se um dia voltar a existir uma horda. O `sombras` perdeu o assert
  "ZERO batched actor fields" (ele lia `w3.actorCastFields.size`, que nao existe mais).
- O que NAO foi tocado, e por que: `plano.md` e as medicoes de P8 (documento historico — as medidas
  foram feitas com o modo vivo e reescrever isso seria falsificar registro), `docs/gamejam-count-down.md`
  ("Survivors mode fora" ja era a decisao de nao usa-lo) e os `playtest/results/*/report.json`
  (saida de rodadas passadas). Foram corrigidas, isso sim, as afirmacoes que ficaram FALSAS sobre o
  presente: `docs/cozy-open-world.md` (o `localStorage` nao guarda mais meta de Survivors) e quatro
  linhas de `docs/zero-hero-como-zelda-1.md`, que e plano ATIVO e dizia que a arte do bestiario "ja
  esta sendo carregada" e que "o modo Survivors nao muda".
- `npm run typecheck` e o ESLint em `src/game` inteiro passam. O que precisa de olho humano e a
  sombra: `npm run playtest -- sombras` e o par `visual-ref` + `compare-visual.mjs`, que e o unico
  jeito de provar que arrancar o caminho batchado nao mexeu um pixel da aventura.

---

# Arquivo: o CLAUDE.md longo (movido em 2026-07-30)

Regra nova: o `CLAUDE.md` tem no maximo 200 linhas e guarda so o essencial (contratos, comandos,
regras duras). O "porque" de cada peca — a discussao de design, os numeros medidos, as armadilhas
que cada sistema escondia — mora AQUI, no progress.md, que e o registro de evolucao do projeto.

O que segue e o CLAUDE.md inteiro como ele estava antes do corte, preservado na integra: ele e a
unica documentacao dos motivos de dezenas de decisoes (a lei das luzes, o limiar de percolacao da
floresta, o porque de cada refusal ser fisica e nao legenda, o contrato de cada peca de circuito).

# Zero the Hero

Top-down pixel-art adventure. Phaser 3 drives the game logic, input and UI on a **transparent**
canvas; the world underneath it is **real 3D** (Three.js). Three modes on the title screen — the
adventure, the puzzle levels and the **explorer** (all three are `GameScene`) — plus a
Vampire-Survivors mode (`SurvivorsScene`, still the hidden `[S]`).

## Os dois botões, a mochila e a subtela — o fim do walk-only

O jogo **era só-andar**: bater era andar contra o inimigo, usar item era andar contra a coisa
certa, e depositar era **pisar** num tile. Três verbos, um gesto só — e por isso nenhum deles era
uma decisão. Isto é a fase 1+3 de [`docs/zero-hero-como-zelda-1.md`](docs/zero-hero-como-zelda-1.md),
e mata duas leis que este arquivo repetia em meia dúzia de lugares (*walk-only* e *uma mão só*).

    A (Z / J / espaço)  →  a ESPADA, na direção em que o herói olha. Sem espada, o soco.
    B (X / K)           →  o ITEM escolhido, no tile à frente: usa, ou pousa ali.
    ESC                 →  a subtela: a mochila + os corações, e quem escolhe o item do B.

- **`GameScene.pressAttack` / `pressUse`, por EVENTO de teclado e não por `JustDown`.** O `update`
  tem meia dúzia de portas por onde sai mais cedo (diálogo, loja, cutscene, hitstop) e uma tecla
  lida por polling morre em todas elas — ou, pior, fica guardada e dispara sozinha no frame em que
  o diálogo fecha. No toque os dois botões têm corpo (`ActionButtons`, só em touch); no teclado uma
  tarja diz as teclas uma vez e some (`ControlsHint`) — o mundo não tem como ensinar que a tecla é X.
- **A PAREDE VIRA O HERÓI** (`PlayerMovementController`), e isso é precondição e não detalhe: A e B
  agem no tile **à frente**, e num tile bloqueado o passo nunca acontece. Sem a virada, encarar uma
  rocha seria impossível e o botão miraria eternamente pelas costas dela. O passo continua não
  acontecendo — ele encara, não entra.
- **O esbarrão ficou só com os gestos de CORPO**: empurrar caixote, abrir portão de bater, conversar
  com NPC, sentar na fogueira acesa (a loja) — e **dano de contato** de quem está do outro lado.
  Bater deixou de acontecer ali: enquanto andar contra o bicho resolvesse, o botão A não
  significaria nada. A guarda automática (o herói parado golpeando sozinho) foi arrancada pelo mesmo
  motivo — um golpe que o jogador não deu. O que o corpo ainda faz contra uma trava é o que sempre
  fez: um tremor (`bumpRefusal`), nunca uma legenda.
- **`useItemAt` é a tabela de itens** (o corpo do antigo esbarrão: machado→árvore, picareta→rocha,
  tocha→fogueira morta, balde→rio…). Devolve `false` só quando o tile não tem nada a ver com o que
  está na mão — e **só então** `placeItemAt` pousa o item ali.
- **Depositar virou o B, e essa é a maior consequência.** Metade das peças vivia em cima do truque
  "pisar deposita": o braço robótico, as duas bandejas da caixa, o buraco de plantio, a marca da
  bomba, o cabo morto que recebe a bateria. O preço era um acidente silencioso — atravessar uma
  bandeja com a coisa errada entregava a coisa errada. As afordâncias continuam valendo inteiras: a
  bomba-fantasma que respira e a bandeja que pulsa nunca disseram "pise aqui", disseram "ponha algo
  aqui". Consequência de mira: para alimentar um tile **pisável** o herói anda até um tile ANTES
  dele e aperta B (o passo é quem decide para onde ele olha). O que ficou no passo: **carregar** a
  bateria num cabo vivo e comer carvão com a tocha acesa — ganhar nunca foi algo que se faça sem
  querer e se perca.
- **A mochila (`runtime/Inventory.ts`) guarda em vez de trocar.** `GameScene.heldItem` continua
  querendo dizer exatamente o que sempre quis — *o que está na mão agora* — e por isso virou um
  **getter** sobre a seleção: toda fechadura do mundo segue perguntando a mesma coisa, e duas
  fontes para a mesma verdade seriam a maneira certa de elas discordarem daqui a um mês. Trocar de
  item **apaga a tocha** (fogo mora no graveto que estava na mão; guardá-lo aceso seria fogo em
  lugar nenhum do mundo). `clearHeldItem` passou a *gastar uma unidade*, e `Inventory.replace` faz
  balde→balde-cheio **no mesmo slot** (senão o item transformado pularia para o fim da mochila toda
  vez que o herói enchesse o balde).
- **A subtela não é HUD** (`runtime/SubScreen.ts`): só existe enquanto foi pedida, mora dentro do
  menu de pausa (que já congela a cena) e some. Corações **desenhados** (`ui/hearts.png`, arte que
  dormia no repositório desde sempre porque o jogo não tem HUD: cheio e vazio são dois frames, nunca
  o mesmo coração com opacidade), a mochila com os **próprios ícones do jogo** (frames do Phaser
  virados em data URL) e o clique que troca o item do B. Setas ← → andam na grade.
- **Consequências assumidas.** O kit do explorador (espada/machado/picareta no chão do acampamento)
  era "uma mão só, a primeira decisão do modo" — com a mochila o herói leva os três, e essa aposta
  cai. Vários levels de hoje ficam **mais fáceis** pelo mesmo motivo; eles não quebram, e precisam
  de revisão um a um (§11 do plano).
- `npm run playtest -- combate` guarda tudo: a mochila que não troca, a parede que vira o herói, o A
  matando a um tile de distância, o esbarrão que **não** bate mais (e cobra vida), o B abrindo a
  rocha, o B pousando o item num tile livre (e o herói o recolhendo andando por cima) e a subtela
  trocando o item do B por clique.

## A esgrima — o que faltava entre apertar o botão e o corpo do outro lado responder

Os dois botões entregaram o **contrato** (bater é uma decisão, não um esbarrão). Isto entrega a
**mão**: o combate estava correto e travado. Diagnóstico, item por item, e todos são o mesmo tipo de
defeito — o jogo prometia uma coisa com a arte e cobrava outra na regra:

| o que o jogador via | o que o código fazia |
|---|---|
| uma foice de **155°** varrendo a frente do herói | acerto em **um** tile, alinhamento perfeito ou nada |
| um golpe que **arremessa** (o recuo elástico, a esticada) | deslocamento de **render** que voltava sozinho: mesmo tabuleiro no frame seguinte |
| um botão que responde | um A apertado durante a cadência (ou durante os 110 ms de hitstop) era **descartado** |
| um herói que pode encarar o que quiser | virar-se para uma caveira custava **um coração** de dano de contato |
| estar cercado | quatro corpos, um golpe direcional, uma conta que não fecha |

As fontes são unânimes sobre as três primeiras — [anatomia de um
ataque](https://gdkeys.com/keys-to-combat-design-1-anatomy-of-an-attack/) (antecipação → golpe →
**recuperação**, e é a recuperação que dá contra-jogo), [input
buffering](https://www.gamejuice.co.uk/articles/coyote-time-input-buffering) ("honrar a *intenção*,
não o sinal"; 80-120 ms em jogo de ação) e a [primeira sala do `A Link to the
Past`](https://www.gamedeveloper.com/design/first-combat-of-link-to-the-past), que é desenhada com
um nicho **do tamanho exato do arremesso** só para ensinar que bater abre espaço.

**1. Mirar num monstro é de graça** (`GameScene.turnedTowardCreature`). A primeira seta contra uma
criatura que o herói ainda não encara gasta-se **virando o corpo**, e nada mais. A carência de
180 ms não é folga: um toque humano dura de 3 a 6 frames, e sem ela o segundo frame da mesma tecla
já leria "já estou olhando pra ele" e cobraria o coração que o primeiro perdoou — o perdão duraria
16 ms e ninguém o veria. Insista e o dano de contato volta inteiro. Vale **só** para criatura:
caixote, portão, NPC e rocha não cobram nada por serem tocados, e adiar a resposta deles seria
trocar um perdão por um atraso.

> Tentei antes fazer o `PlayerMovementController` virar sem andar (o *tap-to-turn* clássico) e
> **desfiz**: turno na primeira leitura + passo na segunda dá uma janela de **um frame**, então um
> toque humano ainda andava. Alargar a janela para ~110 ms consertaria a mira e cobraria atraso em
> **toda** partida do zero — pagar no verbo principal do jogo pelo verbo secundário. O bloqueio já
> virava o herói; só faltava o bloqueio que machuca não cobrar por isso.

**2. O golpe varre o arco** (`SWING_ARC`, `arcTiles`). Os três tiles que a foice desenhada cobre: o
da frente e as duas diagonais dianteiras (155° cobre ±77° — as diagonais entram, os lados puros
não). O gabarito é `[à frente, para o lado]` rodado por uma conta só, para não existirem quatro
tabelas cardinais que podem discordar; o **primeiro** par tem de continuar sendo o tile à frente,
que é o alvo canônico. Não é generosidade — é o acerto concordando com a arte que já estava na tela.

**3. O acerto compra ESPAÇO e TEMPO** (`EnemyBase.shove` / `applyHitstun`). O corpo atingido é
arremessado um tile de verdade e fica 300 ms atordoado (420 no giro): sem passo, sem armar golpe.
Duas armadilhas resolvidas: o empurrão consulta o **mesmo** mundo que o bicho usa para andar,
inclusive a luz de fogueira — arremessar uma caveira para dentro da luz não pode ser a porta dos
fundos da lei que diz que monstro não existe nela (em compensação a luz virou um muro em que dá para
bater coisas) — e quem escreve a própria posição **não é arremessado** (`canBeShoved = false`: a
torreta, que é mobília plantada por um autor, e o zora, que escolhe onde a água o devolve). Os dois
levam o recuo visual e nada mais.

**4. O botão não se perde** (`ACTION_BUFFER_MS = 130`). O A e o B apertados durante a cadência
esperam e saem no instante em que ela libera. Vale mais do que parece porque o **hitstop congela o
`update` inteiro** por até 110 ms — exatamente o intervalo em que o segundo golpe é apertado, então
o jogo punia quem acertava o ritmo. E o A ganhou `keyup`: a repetição de tecla é filtrada pelo
`event.repeat` do próprio evento e não por um booleano nosso, senão um `keyup` perdido (o jogo pausa
com a tecla apertada) deixaria o botão A morto até a próxima recarga.

**5. A lâmina rodopiante** (`SwordSlash.spin`, 450 ms de carga). Segure o A, o gume junta força,
solte e o herói gira cortando os **oito** vizinhos. É a única resposta do jogo a estar cercado — e o
cerco de caveiras é metade da aventura. Custa meio segundo parado no meio da matilha e uma cadência
de 460 ms depois, e por isso é uma decisão e não um golpe melhor. Pede a espada (um punho não
rodopia). O arco passa de **uma volta e meia**: uma volta exata começa e termina no mesmo ângulo e o
olho lê "a espada tremeu". O ângulo é tweenado num objeto de rascunho pela armadilha que o `chop` já
documenta (o getter do Phaser embrulha em [-180, 180] e o tween volta pelo caminho longo).

**6. O feixe da vida cheia foi ARRANCADO** (`runtime/SwordBeam.ts`, deletado). Ele era a barra de
vida sem HUD — vida cheia, cada golpe mandava uma lâmina de luz voando — e a ideia continua boa no
papel. Na mão ela não era: o que o jogador via não era uma barra de vida, eram **pequenas espadas
saindo voando** a cada golpe, em toda briga, e o jogo passou a parecer que a arma atirava. Um sinal
de estado que ninguém lê como estado é ruído com custo de leitura. A vida continua se lendo pelo
**contorno vermelho pulsando** dos dois corações, que sempre foi a faixa que importa — a que avisa
que o próximo golpe mata. Junto saíram `playSwordBeam`, o `weapon: 'beam'` do `strikeEnemy` e o
`beams` do snapshot de debug.

**7. Nenhum golpe ACENDE o corpo que o levou.** A piscada branca de dano (`setTintFill(0xffffff)`,
o substituto de arte de dano pra metade do bestiário) e o clarão branco da morte foram arrancados
dos dois lados do `EnemyBase`. O motivo é de renderer, não de gosto: num billboard `emissive` um
tint-fill branco não é uma piscada, é uma **silhueta chapada de branco puro** que o bloom espalha
pela tela — e o hitstop (60 ms num acerto, 110 ms numa morte) a **congela acesa**, então o clarão
dura o dobro do que a duração no código diz. Bater num bicho cegava quem estava olhando pra ele. O
impacto continua inteiro pelo que já existia e não depende de luz: faísca, baque de tela, arremesso
de um tile e atordoamento. Tint no bicho ficou só pro que **não** é dano — o vermelho quente do
aviso de golpe e o azul pálido do resvalo —, e é melhor assim: as duas cores voltaram a significar
uma coisa cada.

**8. O arco se ancora no corpo DESENHADO** (`PlayerMovementController.visualWorld`). A posição
lógica do herói pula pro tile de destino no instante em que o passo começa (de propósito: o wind-up
da caveira trava naquele tile e a esquiva é decidida contra ele), mas o corpo ainda está atrás,
deslizando — ele fica pregado no centro da tela e é o mundo que escorrega. `swingAnchor` lia a
lógica, então quem corria e batia ao mesmo tempo via a espada **flutuando até um tile à frente** de
si. Parado os dois pontos são o mesmo, e é por isso que o bug só aparecia em movimento. Como o herói
não sai do centro da tela enquanto anda, o ponto visual também não se move durante a animação: o
arco acompanha a corrida sem precisar ser reposicionado quadro a quadro.

**O coro.** O arco varre três tiles e o giro varre oito, então o que é do **corpo** (dano, faísca,
arremesso) acontece uma vez por corpo e o que é do **gesto** (o som do impacto, a piscada do herói,
o baque da morte) uma vez por gesto — `strikeEnemy(..., echo)`. Sem isso um giro no meio da matilha
dispara oito sons de acerto no mesmo frame, que é ruído e não peso.

`npm run playtest -- esgrima` guarda as cinco primeiras: a mira que não custa coração (e o insistir
que custa), o arco de três tiles que **não** pega quem está atrás, o soco que arremessa e atordoa, o
atordoamento que abre sozinho, e o giro que só existe carregado. Ele congela cada caveira com o
próprio `applyHitstun` assim que ela sai do chão — o assunto é o golpe do herói, e uma criatura com
vontade própria no meio de uma medição é ruído — **menos** a que mede atordoamento, que nasce solta
(medir atordoamento numa criatura congelada pelo cenário seria medir o cenário).

## Workflow rules

- **All work happens on `main`. Never create a branch.** Commit straight to `main` and push there.
- **Commit messages are always in English**, even though the code comments and the game are in
  Portuguese.
- **Use semantic commits** (`feat:`, `fix:`, `perf:`, `refactor:`, `docs:`, `test:`, `chore:`) and
  write a real description, not a one-liner: say what changed, and *why* — especially the
  non-obvious part a reader would otherwise have to rediscover.

## Commands

```bash
npm run dev              # vite dev server
npm run typecheck        # tsc --noEmit
npm run lint             # eslint (scripts/worldgen has 3 pre-existing parser errors — ignore)
npm run build            # typecheck + vite build
npm run generate:world   # regenerate public/world.json
#  NEVER run `npm run generate:levels` — it OVERWRITES the hand-authored levels. See the warning below.
npm run playtest         # default scenarios
npm run playtest -- all  # every scenario
```

Port 5173 is often taken by another project. For playtests, start Vite on a free port and point the
harness at it:

```bash
npx vite --port 5180 --strictPort
PLAYTEST_BASE_URL=http://localhost:5180 npm run playtest -- perf-burn
```

## The puzzle levels (`/levels`) and the lab (`/lab`)

Each puzzle is a **self-contained level** — a 12×12-chunk world in `public/levels/level-N.json`
(WorldData format, `meta.puzzle: true`), listed for the player by `public/levels/index.json`. The
title's **"Jogar levels"** reads that manifest and boots the chosen level (`LevelSelectScene` →
`setWorldData` → `GameScene`). A shareable/dev deep link is `/?level=N` (skips the menu).

## ⚠️ THE LEVELS ON DISK ARE HAND-AUTHORED. NEVER RUN `npm run generate:levels`.

`scripts/gen-levels.mjs` writes `public/levels/level-1.json` and `index.json` **unconditionally**
(no merge, no prompt). The levels shipping today were built BY HAND in `/lab` and are not what that
script produces, so running it destroys them. It stays in the repo as scaffolding for a brand-new
level, and only after its output path is pointed somewhere unoccupied.

Today: `level-1` **"O fogo que ajuda atrapalha"** (fire + boiler + wire + robotic arm + swing gate
→ portal; pickaxe, bucket and axe) and `level-2` **"Fogo"** (a work in progress). **Read the JSON,
never this file, for what a level contains** — a hand-authored level changes whenever its author
opens the lab, and any prose here describing its layout starts rotting the same day.

That has a consequence for tests: **a playtest must AUTHOR the fixture it needs** (enter `/lab`,
place props through `EditorStore`, press P) instead of relying on a level already containing one.
`braco`, `caixa-ferramentas`, `portao-de-bater` and `fios` all do this and are immune. The two
that still read level-1's old content — `espada` (it scripts the full solve of "A Espada na Pedra",
a level that no longer exists) and `itens` (it needs a `plantSpot` level-1 no longer has) — are
**stale by design change, not broken by a regression**. Do not "fix" them by editing the level.

`/lab` is where a level gets built/validated without touching the real world — the same editor as
`/editor`, pointed at a level file (`public/levels/level-N.json`) via `/api/world?file=level-N`.
`?level=N` picks which (default 1). Build, press **P** to play the in-memory world, **ESC** to come
back; nothing saves until Salvar, and Salvar only writes that one level file.

- `/lab?play` boots the level straight into `GameScene`. Playtests enter levels via `/?play&level=N`
  (the `espada` scenario) — a scenario overrides its entry route.
- **Puzzles are authored in `/lab`, by hand, and saved with Salvar** — not in `gen-levels.mjs`
  (see the warning above: that script would overwrite them).
- **O jogo tem DOIS BOTÕES (A golpeia, B usa o item) — ver a seção no topo deste arquivo.** As
  marcas continuam sendo afordâncias de *colocar*, só que agora com o B: um `bombSpot` (a
  bomba-fantasma roxa que respira) planta a bomba carregada quando o herói aperta B encarando-o;
  com o item errado na mão nada acontece — a arte da marca é o convite. Autore um bombSpot onde a
  explosão precisa acontecer: o raio de 2,2 tiles tem de cobrir tudo aquilo para que ela existe. A
  loja de melhorias (só na aventura) é o bonfire de Souls: **esbarrar** numa fogueira ACESA a abre
  (sentar nela é gesto de corpo; apagar com o balde e acender a tocha viraram gestos de B).
- **The farming loop (`plantSpot` + seeds).** The scythe's product is SEEDS (sprites from the
  sprite factory). Aperte B encarando um buraco (`plantSpot`) com as sementes na mão para semear;
  o monte sobe quando o herói SAI do tile (a cúpula nunca pode nascer bloqueando sob os pés dele —
  a regra de armar item largado); rega-se o monte com o B e o `bucketFull`; after ~3.5s REAL tall grass sprouts
  (a `TallGrassObject` pushed into `tallGrasses` — blocks, conducts fire, falls to the scythe
  for seeds again). Consume that grass and the hole reopens: renewable, placeable fuel — a burnt
  fuse is never a dead end. Hay/haySpot are gone; seeds replaced them.
- **A level is ALWAYS exactly one 12×12 chunk — the standard, original size. Never bigger.** No
  multi-chunk levels (no 24×12, no 24×24). The camera frames ~one chunk, so the whole level sits on
  a single screen and nothing needs a hike — walking is not a puzzle. `makeLevel` in
  `scripts/gen-levels.mjs` is single-chunk on purpose (no size parameter) so this can't be
  bypassed; if a puzzle doesn't fit in 12×12, cut it down, don't grow the map.
- **Each level is independently solvable.** Its own `playerStart` and its own **home campfire**
  (lit, nearest the spawn — that's how the runtime picks which fire is born lit); every other
  campfire stays dead. Only the tools that level's puzzle needs.
- **A puzzle is only a puzzle if the easy road is shut.** Assert the *lock* (bare-handed, the ring
  must refuse the hero), not just the solution.
- The undead siege (`UndeadSpawnDirector`) is **off** for a puzzle world (`appMode === 'lab'` OR
  `meta.puzzle`, via `isPuzzleWorld()`): skulls mid-solve are noise and made the run flaky. So a
  level cannot test anything that depends on darkness pressure — use the real world for that.
  **Isso vale só para o CERCO.** Um inimigo autorado na aba **Inimigos** roda num level como em
  qualquer lugar: é assim que um corredor ganha guarda, e é a diferença entre pressão de ambiente
  (ninguém pediu, ninguém sabe onde bate) e uma decisão de autor num tile escolhido a mão — ver a
  seção do ponto de spawn.
- The ESC return-to-editor handler is gated on the editor scene actually existing, because a level
  played from the title / `/?level=N` has no editor to wake (there ESC opens the pause menu, which
  offers **back to levels / restart / quit to the title** when a level is active).
- **A level run shows two floating square buttons top-right on every device** (`LevelButtons` in
  `PauseMenu.ts`): restart (↻, two-tap arm like the pause menu's destructive entries) and pause.
  A puzzle can be spent into a corner, so restarting must be advertised, not buried in ESC — a
  hint pill ("Travou? ↻ recomeça o level") shows on boot and doubles as the arm-confirm prompt.
  The adventure keeps only the discreet touch-only pause button.

## O explorador (`src/game/explorer/`) — o mundo infinito, e a única aposta do jogo

A terceira porta do título. Um mundo **gerado enquanto o herói anda**, sem borda em direção
nenhuma, com um **acampamento seguro** no centro; a base é risco × recompensa, e ela cabe em três
números:

- **Longe paga mais.** `coinMultiplierAt`: a cada 24 tiles de distância do acampamento a caveira
  larga um degrau a mais de moeda (teto x8). Em DEGRAUS e não contínuo — o jogador precisa poder
  dizer "subi de nível" enquanto anda; um número que sobe um centésimo por passo é um gráfico, não
  uma decisão.
- **50% se você escolher parar.** Portais nascem no escuro (nunca a menos de 26 tiles de casa) e
  pisar num deles PERGUNTA (`ExtractPrompt`). Sim = metade da bolsa vira banco e o herói volta
  vivo. Caro de propósito: se voltar fosse de graça o modo seria "ande até cansar" em vez de
  "ande até ter medo".
- **5% se o escuro escolher por você.** Morrer não zera (zerar faz de cada expedição ruim tempo
  jogado fora) mas 5% é perto o bastante de nada para doer. **Reiniciar pelo menu custa o mesmo
  que morrer** — se fosse grátis, seria a saída ótima de toda expedição ruim e as duas
  porcentagens viravam opcionais.

O perigo também escala com a distância (`dangerScaleAt` → `UndeadSpawnQuery.pressure`), mas **mais
devagar que a recompensa**: se os dois subissem no mesmo passo, ir fundo seria matematicamente
neutro e não haveria decisão dentro do modo.

- **O mundo entra pelo mesmo buraco de fechadura do `world.json`.** `WorldData.setInfiniteWorld`:
  troque o que os acessadores respondem e ChunkManager, os managers e o World3D leem o mundo
  gerado sem saber. Nada foi duplicado; o `getHeldItemPickups` do infinito devolve o **kit** do
  acampamento (espada / machado / picareta — era "uma mão só, a primeira decisão do modo"; com a
  mochila o herói leva os três, e essa aposta caiu junto com o walk-only. Ver o topo do arquivo).
- **O renderer segura uma JANELA, não o mundo** (`ExplorerDirector`, raio 2 = 5×5 chunks). A
  floresta custa um draw call porque é *assada* num mesh só, e um buffer não cresce para sempre —
  então ao cruzar a fronteira de um chunk a janela se recentraliza e `World3D.rebuildTerrain()`
  reassa. Medido: **~15-25ms**, uma vez a cada 12 tiles. `terrainMats` guarda os materiais entre
  reassados **porque um material novo em runtime recompilaria todo shader do mundo** (a lei do
  projeto): o playtest afirma 0 programas e 0 luzes de diferença através de uma travessia.
- **`solidKeys` virou `Set<number>`** (`tileKey`) por causa disto: a AO do chão consulta esse
  conjunto 12× por tile, e com chave de string eram 12 alocações por tile — ~30% do custo do
  bake (medido 93ms → 67ms no mundo autorado). O bake deixou de ser um evento único.
- **Props entram e saem com a janela** — "tem prop neste tile?" é busca LINEAR e roda dentro do
  flood-fill dos inimigos, então guardar tudo que a expedição já viu viraria o gargalo do modo no
  quinto minuto. O que um prop **lembra** ao sair é o mínimo que muda o jogo: fogueira ACESA (o
  jogador pagou aquela luz com uma tocha e uma caminhada) e prop CONSUMIDO. A árvore seca de
  propósito **não** é lembrada: ela já volta sozinha (`TREE_REGROW_MS`).
- **Geografia é TILE, prop é o que se mexe.** Árvore/lago são frames do tileset (o lago é tile de
  MAR: bloqueio incondicional, que num mundo gerado é o certo — o gerador não pode garantir que um
  rio tenha margem, ponte ou saída). Fogueira, pedra, árvore seca e portal são props, com a mão
  fechada.
- **⚠️ A ÁRVORE NUNCA PODE TRANCAR O CAMINHO, e isso é um NÚMERO e não um cuidado.** No explorador
  o herói carrega o machado COMUM, que só morde madeira morta — pinheiro é permanente para ele —,
  e nenhum item do jogo remove um lago. Então mata fechada não é "difícil": é o fim do mundo.
  Como o herói anda em 4 direções, o chão aberto é um problema de **percolação por sítios** numa
  grade quadrada, cujo limiar crítico é `p_c ≈ 0.5927`: acima disso o aberto é um único campo
  infinito e todo bolsão é pequeno e finito; abaixo, quebra em ilhas. `FOREST_FILL_PERCENT` é a
  chance de um tile virar pinheiro DENTRO de um bosque, então a fração aberta é `1 - fill` e o
  caminho só é garantido com **fill abaixo de ~40%**. Ele nasceu em 62% (38% de aberto, do lado
  errado do limiar) e o mundo saía QUEBRADO — flood-fill do acampamento: só 79–92% do chão aberto
  alcançável, bolsões de até 4.523 tiles e **1 em cada 4 portais nascendo dentro de um**, que é a
  única saída segura do modo trancada atrás de uma parede. Hoje é 34% → 99% alcançável, maior
  bolsão 23 tiles. **Subir esse número é reabrir o bug**; a curva medida está no comentário da
  constante. Percolação garante bolsão *pequeno*, não *zero*, então os props que importam ganham
  uma segunda garantia, exata: `escapesPocket` só planta onde um flood-fill curto prova que a
  região tem ≥ 400 tiles (o triplo do maior bolsão medido). O critério é TAMANHO e não distância —
  a primeira versão perguntava "consegue se afastar 10 tiles?" e um bolsão comprido atravessava a
  caixa sem sair da ilha. A aventura autorada, para comparar, tem 9,2% dos tiles bloqueados e
  **99,99% do chão alcançável** (um único tile isolado): denso e fechado não são a mesma coisa.
- **A armadilha do hash.** `hash()` termina em `(v >> 16) ^ v`, e `>>` em JS é int32 COM SINAL —
  o bit 31 nunca acende, então o hash só devolve `[0, 2^31)`. Dividir por `0xffffffff` dava um
  "ruído" que jamais passava de 0.5 e **todo limiar acima disso era terra que nunca acontecia**:
  o mundo nasceu sem uma única floresta e sem um único lago. `rand01` divide por `0x7fffffff`.
- **O HUD é a única exceção à lei "o mundo ensina, o HUD não"**, e a exceção é estreita: a lei foi
  escrita contra LEGENDAS (o balão de item-que-falta, que entregava a resposta de uma fechadura).
  Aqui a pergunta é "vale mais um chunk?", e os dois termos dela são números que o mundo não tem
  como dizer. Esconder não ensinaria nada — só faria da aposta um chute.
- **O prompt PERGUNTA em vez de engolir**: a decisão é IRREVERSÍVEL e custa dinheiro, e tudo o
  mais no jogo se desfaz andando de volta. Não há tecla para o SIM — Enter,
  Escape e clique-fora **continuam a expedição**, porque as teclas de reflexo não podem custar
  metade da bolsa. Recusar não gasta o portal (só a pergunta, até sair do tile).
- **A volta é a viagem do portal dos levels, inteira** (sucção → vazio → túnel → queda). Não é
  economia: é a mesma FRASE. O jogo já ensinou que atravessar um portal é assim; voltar por um
  fade seria uma segunda gramática para a mesma coisa.
- **O banco é permanente, a bolsa não.** A loja da fogueira (o bonfire de sempre) gasta o BANCO e
  as melhorias atravessam expedições — gastar em campo o que ainda está em risco esvaziaria a
  aposta pelo outro lado. Isso finalmente dá à moeda um motivo: `CoinManager.spawnCoins` existia
  desde sempre e **nunca havia sido chamado uma única vez**.
- **Cada expedição tem um mundo novo** (`rerollExplorerWorld`); decorar onde ficam os portais
  mataria a aposta. `?explorer` entra direto, `?explorerSeed=N` prende **só a primeira** expedição
  (o playtest precisa do mesmo mato, e um pino permanente faria o modo mentir onde é testado).
- `npm run playtest -- explorador` guarda o modo inteiro: o acampamento (seguro, com fogo aceso,
  kit no chão e os quatro portões abertos), o mundo que não acaba a 200 tiles em coordenada
  negativa, o reassado abaixo de 30ms **sem compilar shader nem mexer numa luz**, **o chão aberto
  sendo um campo só** (flood-fill no mundo vivo, pelo mesmo `isCellBlocked` que barra o herói) e
  os quatro corredores de casa andáveis, a mesma caveira pagando mais longe do que perto, o portal
  perguntando e a recusa não cobrando nada, os 50% e os 5%.

## Fire spreads (the one system the player steers)

Every other obstacle in this game is a **lock with exactly one key** — axe→tree, pickaxe→rock,
key→door. That table is why puzzles here kept collapsing into "fetch item, use item, repeat":
there is only ever one right answer.

**The game no longer NAMES that answer.** There used to be a need-item balloon: bump a lock
empty-handed and a speech bubble popped over the hero with the icon of the key you were missing.
It is gone — table, art, every call site. A locked thing still answers a bump, but only
physically: the rock shudders, the door rattles, the gate strains against what is behind it. The
hero says "this did not work", never "fetch the pickaxe". Removing it is the same bet the swing
gate makes: the world teaches, the HUD does not. **A new locked prop gets a shake, not a hint** —
if the only way a player could know what to do is a caption, the prop's art is what needs
fixing.

Fire is the exception, and the only place a real puzzle can live. `GameScene.scheduleFireSpread` /
`igniteFlammableAt`: a burning tile sets its 4-neighbours alight after `FIRE_SPREAD_MS`.

- **Fuel:** tall grass, dry bushes, and **built bridges** (they are wood — `WaterObject.burn()`
  collapses the deck into the river and the tile blocks again). Stone, water, lava and bare ground
  are firebreaks — which is what finally gives the scythe and the axe a use beyond opening their
  own tile.
- **A DEAD campfire catches from an adjacent flame.** That is the whole point: a fire can be lit
  without the hero ever standing next to it. Lay a path of fuel and let the fire walk there.
- **A LIT campfire never spreads.** It is a sink, not a source — otherwise every hearth would set
  its own meadow alight the moment it was lit, and the overworld would burn down on contact.
- Chains terminate because each object's `ignite()` refuses if it is already burning or spent.
- The light budget survives it: burning bushes *borrow* from the fire-light pool, so a cascade
  cannot move the light count. `perf-burn` guards this.

**Tall grass blocks the hero but conducts fire.** A grass corridor is a wall to you and a highway
to a flame — that asymmetry is where the lab's "O Pavio" puzzle comes from.

**Items should PRODUCE, not just DELETE.** This is the rule that keeps puzzles from collapsing into
fetch-and-use. A tool whose only output is *passage* is a password, not a tool. Compare:
`grass.cut()` and `door.unlock()` produce nothing, while `tree.chop()` yields a graveto — or a
bridge, depending on where you stood — which is why the axe was the only interesting item in the
game. (Felling a pine *tile* with the steel axe drops a graveto for exactly this reason.)
So the pickaxe now drops a **stone** (`GameScene.dropStone`), and one stone **fords** a
bridgeSpot (`WaterObject.placeStone`). Stone is wood's opposite: both span a river, but a plank
deck is *fuel* and a ford never burns (`WaterObject.burn` refuses a ford). Every crossing is now a
question — do you want a **floor**, or a **fuse**? Ask that of any new item: what does it *make*?

## The two axes, and why the world's edge had to become the sea

There are two axes, and the second one is the only item in the game that edits **terrain**.

- **`axe` — "Machado".** Unchanged. It bites **dead wood only**: the `dryTree` prop (6 stages,
  regrows, TIMBER log-bridge) and the `dryShrub`.
- **`greatAxe` — "Machado de Aço".** Fells **any tree**, and is a strict **superset** of the plain
  axe (both go through `GameScene.holdsAnAxe`). That matters: if the steel axe did not cut dead
  wood, finding it could *soft-lock* a puzzle built around the plain one. A new tool must never
  invalidate the tool the player already has.

**Most trees in this world are not props — they are tiles.** `world.json` holds 846 pine tiles in
the upper layer (frames 4/14/15/16/17) against 69 props *in total*, and `World3D` merges every
standing tile into ONE static mesh. That is the whole reason a forest costs one draw call, and it
is why "cut any tree" could not be solved by adding a `TreeObject`: 846 billboards with contact
blobs and cast shadows would be a serious perf regression. So the steel axe removes the **tile**:

- `CHOPPABLE_UPPER_FRAMES` (constants) says which standing frames are wood. Deliberately not all
  of `SOLID_UPPER_FRAMES` — 22 (spiked head) and 25 (tomb) stand up the same way but are masonry.
- `GameScene.fellTreeTile` clears **both** `chunk.upper` *and* `chunk.collisions` — the worldgen
  paints an explicit collision under every obstacle frame, so clearing only the frame leaves an
  invisible wall. Those chunk arrays are the same ones `WorldData` holds, so the edit persists for
  the run.
- `World3D.removeSolidTile` un-bakes the tile from the merged buffers in place rather than
  rebuilding them: it collapses the quad's four vertices onto a point (a degenerate triangle draws
  nothing) in the solids mesh and in the contact-blob mesh, re-bakes the **ambient occlusion** the
  tree printed on its neighbours (or the new clearing keeps the shadow of a tree that is gone),
  drops it from `castableSolids`, and re-fills the moon cast. Rebuilding a ~6000-quad buffer per
  swing would hitch; this is the `grassQuads` rustle trick applied to three buffers at once.
- **It comes down in STAGES, like the dryTree prop** — whole tree → crown gone → stump → open,
  three swings, and it BLOCKS until the last one. The prop shrinks through its own 6-frame sheet
  (woods.png); a tile cannot, because the merged mesh samples the tileset atlas, so the stages
  have to be frames of that atlas too (`TREE_CHOP_STAGE_FRAMES` = 36, 37, drawn by the sprite
  factory from the shipped pine's own palette). The two stages are **shared by all eight** tree
  frames: at 16×16 a stump keeps no silhouette saying which pine it came from, and eight private
  ladders would be sixteen frames saying one thing. `World3D.setSolidTileFrame` swaps the quad's
  `uv` **and** `aUvBounds` in place (the bounds are not optional — they are the window the
  texel-AA fetch may sample, and leaving them stale lets the filter slide into the next tile's
  art), and re-bakes the moon cast so a stump stops throwing a whole tree's shadow.
- Felling drops a graveto **only ~25% of the time** (`TREE_TILE_STICK_CHANCE`). A tile tree is
  not the dry tree's equal: there are ~850 of them against 8 dryTree props, and if every one paid
  out, the map would become an infinite fuel dispenser and flatten the fire economy that the
  scythe, the planting loop and the dryTree's own regrow timer exist to meter. It still PRODUCES
  (see the rule above) — just not on demand, so wood stays worth walking for.
- Refusing a pine is **silent**, with the plain axe or bare-handed. It was the last place the
  game said out loud that there are two axes; now the player learns it by swinging — the steel
  axe fells what the plain one cannot. Same price every other lock pays.

**The border is the sea, and that is a consequence of the steel axe, not a decoration.** The world
edge used to be a wall of **pine tiles** (`WorldData`'s old `VOID_WALL_FRAME = 4`) — made of the
exact thing the new item exists to destroy, so a player could chop a doorway and walk off the map.
The fix is not to special-case the axe at the edge (a border you must remember to defend will be
forgotten by the next feature) but to build the border out of something **no item answers**:

- Out-of-bounds chunks are ground frame `SEA_TILE_FRAME` with no upper layer and collision
  everywhere. Collision comes from `SOLID_GROUND_FRAMES` (the floor's mirror of
  `SOLID_UPPER_FRAMES`), which is **unconditional** — so the sea blocks even the **lava boots**,
  which wade every other hazard. Nothing in the game removes water: the bridge, the ford and the
  boots all *cross* a river tile, and none of them apply to a ground frame.
- "Mar" is also paintable in the editor's **Chao** group, and blocks there by the same implicit
  rule (the editor draws it in the same amber as an implicitly-solid tree).
- The sea borrows the river's **sunken bed and earthen banks**; those banks are the coastline.
  Without that it reads as blue floor, not water.
- It ships **three interchangeable frames** (33/34/35, the same grid cyclically shifted), picked
  per tile by a hash of the coordinate in `World3D`. The river gets away with one tile because it
  is ~30 of them; the sea covers thousands, and one frame repeated that far stops reading as water
  and starts reading as a **grid**. Only `SEA_TILE_FRAME` is ever stored in world data — the
  variants are art, chosen at build-mesh time, and cost nothing because the frame already travels
  per vertex (`aUvBounds`).
- `VOID_MARGIN_CHUNKS` stays at **1**, measured: a second ring of ocean cost ~9% more triangles
  (53.1k vs 48.8k on main, frame p50 6.9ms vs 6.1ms). One ring lands at 40.2k — *under* main —
  because the void used to carry an upright pine quad per tile plus its blob and its cast shadow,
  and open water carries none. The border got cheaper by becoming flat.

`npm run playtest -- machado` guards all of it: the sea blocks (boots included), the steel axe
cannot open the border, the plain axe cannot fell a pine, the steel axe walks it down the stage
ladder (blocking at every stage until the tile really opens, collision too), the graveto rate
sits near 25%, and the steel axe still cuts dead wood. The stage asserts chop until the tile
CHANGES rather than counting keypresses — the first key after a teleport is swallowed by the
just-interrupted movement controller, so counting presses would measure the input, not the ladder.

**A new terrain tile is a new FRAME in an existing atlas, not a new file.** Ground/upper index
frames of `forest_tile_set.png` (3 columns, row-major) and the whole ground is one mesh sampling
that one texture. `node spritefactory/install-tile.mjs <name> <tileset> <frame>` installs a built
sprite into it, growing the sheet by appending rows — **only** appending, since frame ids are
positional and inserting would silently re-point every tile already authored in `world.json`.

## The robotic arm (`inserter`) — the one thing that moves an item without the hero

`src/game/objects/RoboticArmObject.ts`. A Factorio-style inserter: it takes whatever item lies on
the tile **behind** it and puts it on the tile **in front**, by itself, on a ~1.5s cycle (reach →
grip → swing → release → return). Everything else in this game that moves cargo needs the hero's
one hand; this doesn't — and its own body is **solid**, so what it really does is hand an item
across a line the hero has to walk around. That is the whole reason it earns a place: *an item can
reach where the hero cannot.*

- **The arm is RIGID and ROTATES — it never stretches.** Like Factorio, where an inserter's speed
  is literally an *angular* velocity: the hand rides a fixed-radius arc (`ARM_RADIUS` = 1 tile)
  half a turn from origin to destination, passing beside the machine. The first version moved the
  hand in a straight line between the two tiles, which could never look attached — at mid-travel
  the hand sits exactly on the base, i.e. the arm has length **zero**. Rotation is what makes a
  constant-length arm possible, so it is a precondition for the linkage, not a style choice. The
  sweep always passes the side that reads *up* on screen; sweeping under would hide the hand and
  its cargo behind the machine's own body at the very moment of the gesture.
- **Anatomy: base → upper arm → forearm → claw**, two SOLID rectangles with a bending elbow, like
  the real inserter. Each part is ONE stretched quad, not a row of small blocks — a machine part
  is one part. This works because a billboard here is **not** camera-facing by `lookAt`: it is a
  plane in the world's (X, elevation) axes and the camera never yaws, so `rotation.z` rotates
  exactly in the screen plane. `layBar` places a quad at the midpoint of two joints, sizes it to
  the on-screen distance and rotates it to point along them. Depth is folded in through
  `depthToScreen` (derived from `camHeight`/`camBack`) — without it a north-pointing arm would
  compute a length of zero and vanish. The sprite is full-bleed for the same reason: a
  transparent margin would stretch too and the bar would fall short of its joints.
- **The elbow must actually bend, so the arm FOLDS.** Rotating at a constant radius gives a
  constant elbow angle — that is a rigid arm whose parts never move relative to each other. The
  wrist retracts (`FOLD`) as it passes the machine and extends again to reach the tile, which is
  what makes the two parts read as two parts. The elbow comes from 2-link inverse kinematics
  (`poseArm`) solved in the vertical plane through shoulder and wrist; `UPPER_LEN + FORE_LEN`
  must exceed the maximum reach or the solution clamps and the elbow locks straight.
- **The bend plane LEANS SIDEWAYS as the arm points into screen depth** (`ELBOW_SIDE`). A bend in
  the (radial, vertical) plane projects to ZERO when the radial direction is the view-depth axis:
  a north/south arm — half of all placements — collapsed into one vertical line (a lamppost), and
  mid-swing passes north, so the fold's most dramatic moment was exactly the invisible one. The
  fix rotates the perpendicular the elbow displaces along toward the world-lateral axis by
  `|sin(angle)|`; a normalized blend of two unit vectors perpendicular to the shoulder–wrist line
  is still perpendicular, so both link lengths stay exact and the joints-meet playtest holds.
- **Direction is a FRAME, never a rotation.** A billboard has no yaw — `Billboard3D.setAngle`
  spins in the *camera* plane (`mesh.rotation.z`), which would tilt the art instead of turning it.
  So the sheet holds 4 frames (0=N 1=L 2=S 3=O) and `dir` indexes the art directly. Any future
  prop with a facing must do the same.
- **Its own parts z-fight unless they are ordered.** A quad here is a plane at `z = tileY`, so two
  parts of the arm sharing a tileY land in exactly the same plane and strobe where they overlap —
  `DEPTH_LAYER` all over again, but *inside* one object (`ItemPickup` does the same for its 8 rim
  copies). Each part gets a small push toward the camera in the order it must read: body, upper
  arm, forearm, hand, cargo in front. Any future prop assembled from several billboards needs the
  same internal ordering.
- **Idle = arm HIGH breathing, refusing = LEANING and trembling, working = arm dipped.** It only
  descends when there is cargo on the origin, and the rest pose is well off the ground so the
  states read at a glance; a rest pose close to the floor made the dip a half-pixel twitch. The
  parked claw bobs slowly (`IDLE_BOB` — the bombSpot ghost's grammar: an invitation is a living
  thing, not a photograph), and when the input holds an item the arm cannot deliver (output
  blocked/occupied) it eases down to `STRAIN_ELEV` and shivers over the waiting cargo — without
  that posture, a blocked output and a broken machine were the same image. `playArmGrab`
  (synthesised, no sample) fires when the claw closes on cargo — short and quiet on purpose,
  since a row of arms repeats it forever.
- **The refusal also has to say WHERE the problem is, so it LUNGES** (`LUNGE_*`). Leaning over the
  cargo says "I want to and cannot", but it says it at the wrong end: the jam is on the OUTPUT, and
  a machine writhing on top of the item the player just deposited reads as "my deposit failed" or
  "this thing is broken" — and both send the player looking for the answer in their own hand, the
  one place it isn't. So every ~2.2s the strain **starts the half-turn**, travels a fraction of the
  arc toward the output and springs back, with `playArmStrain` (the working servo cut short by a
  dull thud, exactly the swing gate's `playGateSwing`/`playGateStrain` pair). The eye follows the
  lunge and the gesture dies pointing at the tile that is taken. This is the swing gate's answer to
  the same question — "the player has to see the leaf MOVE to understand the problem is on the
  other side" — and it is a fraction of the arc on purpose: a lunge that reached the destination
  would stop reading as a failed attempt and start reading as a badly drawn delivery. Spaced, never
  continuous, for the toolbox's reason: a machine that writhes without pause becomes background and
  the player stops seeing it. `strained()` is the one arm sound gated on distance (the water
  wheel's rule) because it is the only one that repeats for as long as the state lasts.
  **Consequence for the piece as a whole: one delivery per arm until that output tile frees.** A
  self-powered arm (no variable, no wire) never sees power drop, so it has no undo either — feed it
  a second item and the item simply waits on the input, visible, swappable, while the machine
  lunges at the far side. That is the intended, legible dead end, not a bug: authoring an arm whose
  output the hero can never reach is authoring a one-shot machine.
- **The hand parks in the air over the ORIGIN tile, with its contact shadow on the ground below.**
  That shadow is the affordance — "put something here and something happens", the same grammar as
  the bombSpot's breathing ghost. Alimenta-se pela ENTRADA, com o botão B (`placeItemAt`): o herói
  para um tile antes dela e põe a carga ali. Era um passo enquanto o jogo não tinha botão nenhum —
  ver a seção dos dois botões no topo.
- **`dir` is the first per-placement field that is NOT droppable.** `lit`/`floodgate` are authored
  in gen-levels and an editor save is allowed to lose them; a rotation is placed by hand and *is*
  the behaviour. So `EditorStore` carries `dir` through place/erase/undo — including `sameEntity`,
  which compared only type+position and therefore made "rotate in place" a silent no-op.
  In the editor: **G girar** (not R — R is the rectangle tool). `UI_STATE_KEY` went to v4 with it.
- **The claw is a separate billboard that TRAVELS, and it HANGS fingers-DOWN.** The arm must reach
  the neighbouring tile, but no sprite may overflow its tile — so the base keeps its tile and a
  second one-tile quad moves. What travels is the *position*, never the scale. It also hovers
  (`HAND_HOVER`), which keeps it off the `ground` depth layer where it would strobe against the
  very pickups it is reaching for. The claw art (v4) has its node on TOP and the pincers opening
  downward — a claw that dives onto floor items, not the sky-facing V it used to be — and the quad
  hangs `NODE_UP` below the IK wrist, so the forearm arrives from above and dies at the node:
  no geometry can lay the bar across the pincer's mouth anymore (the defect that killed five
  drawings and that `CLAW_AHEAD` merely dodged). Consequence: `HAND_GRAB` is a WRIST height —
  the wrist stops a claw-length above the item and the fingers do the last stretch.
- **The arm casts ONE shadow: its projected SKELETON.** All three shadow systems (contact blob,
  fire-cast silhouette, baked moon-cast) assume a prop STANDING at its tile — and the arm's limbs
  float between joints, so per-part shadows always shatter: blobs made a dotted line, plan-projected
  strips drew a zenith sun that exists nowhere in the scene, and per-bar `castGroundShadow` sprouted
  streaks where the bars aren't (the cast is elevation-blind). `World3D.groundCastAt(x, z)` exposes
  the standing-sprite stylization (nearest lit flame + moon handoff, via castTransform/handoffCast)
  as a projector — a point at elevation e shadows at `plan + dir · e · unitLen` — and the arm chains
  one `ShadowStrip` per limb between its projected joints (shoulder→elbow→wrist→fingers). Connected
  by construction, it GROWS OUT of the base sprite's own cast silhouette and breathes with the
  flame. The claw keeps its pinned contact blob (the deposit-here mark, the hero's own grammar) but
  opts out of the per-sprite cast with `castGroundShadow: false`.
- **Cargo draws BEHIND the claw, and it HANGS — it is not welded.** `DEPTH_ITEM` sits between
  forearm and hand: the shut claw is a band across the item, the open claw spreads its fingers
  over it. The first version drew cargo in front of everything, and at the only moment the
  machine exists to be seen the item covered the whole claw — a flying item with an arm behind
  it. The carried item is also a pendulum (`CARGO_*`, underdamped spring driven by the wrist's
  tangential velocity): it lags the swing, tilts on its invisible string and settles with a
  wobble on arrival. Only the screen-X component is applied — a depth swing is invisible and
  would corrupt the cargo-behind-claw draw order.
- **It refuses rather than stacks.** If the output tile is blocked or already holds an item, the
  arm idles: the ground keeps one item per tile, and two would be a silent disappearance.
- **Cutting the power UNDOES the delivery — that is the anti-dead-end guarantee.** An unpowered
  arm is still dead (it does not scan, dip or pick anything up), but if it *did* carry something
  across while it was live and that item is still sitting on the output tile, losing power sends
  it to fetch that item and put it back on the input tile, once, and only then does it stop —
  parked over the input like always. This exists because the arm is the one piece that can place
  an item where the hero cannot reach, so it is the only piece that can strand a puzzle for good;
  with the undo, every delivery has a way back and the puzzle becomes *when* to switch the power
  on and off instead of "careful, this is irreversible". Consequences: cutting power with the
  cargo still IN the claw also undoes (it goes back to the tile it came from — freezing there
  would trap the item in the hand forever), and a forward gesture already in flight is ABORTED,
  never completed, when the power dies with nothing owed. The undo runs at `REVERSE_RATE` (0.62)
  so grey-and-slow reads as "this is going backwards", not "this is working".
- **The debt is ONE item and it forgives itself.** Not a history: the ground keeps one item per
  tile, so what this arm left stranded is at most whatever is on its output tile right now. If
  that tile empties by another hand, the debt is cleared at the next rest (`owed` in
  `RoboticArmObject`) — the player already has the item, there is nothing to undo, and a machine
  that kept owing would later kidnap an item it never delivered. An arm with no variable and no
  wire is self-powered, never sees power drop, and is therefore the one variant with no undo.
- **Por que a origem precisava de um gesto de largar.** Enquanto o jogo era só-andar, o herói só
  podia pousar algo TROCANDO por outro item já no chão — e a origem de um braço começa vazia, então
  a máquina seria inalimentável. Era por isso que pisar nela depositava; hoje é o botão B, e o
  contrato é o mesmo (o fogo e a carga descem junto com o item). (O PRODUTO de uma ferramenta
  continua caindo sozinho: `dropStone`, o graveto do machado, as sementes da foice.)
- `npm run playtest -- braco` guards all of it. It enters `/lab`, places the four rotations through
  the real `EditorStore`, presses P, and asserts the transfer — the authoring path, because that is
  what the piece is for. It also authors a FIFTH arm bound to a variable with no producer (the four
  others are self-powered and can never be switched off) and drives the undo end to end: dead and
  owing nothing it ignores the cargo, live it delivers and takes on the debt, cut it fetches the
  item home, and once square it goes inert again — a fresh item dropped on its output is NOT
  dragged back, which is the assert that keeps the undo from degenerating into a reverse conveyor.
  The refusal's lunge is checked by SAMPLING the claw for two lunge cycles and demanding both halves
  of the gesture: that it leaves the tile over the input, and that it comes BACK. Without the second
  half a claw frozen mid-arc would pass, and that is not an attempt — it is a jammed machine.

## The toolbox (`toolbox`) — the one thing that makes an item OUT OF other items

`src/game/objects/ToolboxObject.ts`. Four tiles in a line, derived from `dir`:

    (item A) (item B) [CAIXA] (resultado)

Drop an item on each of the two slot tiles behind it; if the pair is a **recipe**, the machine
eats both and spits a third item onto the tile in front.

**The rule is HAFT + HEAD, and it caps itself.** One head material makes one tool:

| receita | de onde vêm os insumos |
|---|---|
| `graveto + pedra = machado` | árvore (axe) + pedra (pickaxe) |
| `graveto + ferro  = foice`  | árvore (axe) + **pedra de ferro** (pickaxe) |

Because the pair is unordered, `graveto + X` can only ever mean ONE tool — so the number of
craftable tools is the number of **materials**, never the number of ideas. Growing the tree means
adding raw matter, not adding lines to `TOOLBOX_RECIPES`.

**Why the iron makes the SCYTHE and not the pickaxe.** Iron comes out of an ore rock, and rock is
what the pickaxe breaks — so a recipe producing the pickaxe would need the pickaxe to reach its
own ingredients. Circular, and therefore worthless in any level that doesn't hand you a bomb to
open the first vein. `picareta → ferro → foice` is a staircase that always goes up, and the scythe
PRODUCES (seeds), which is what the project asks of anything new.

Recipes that are traps, and why: **key** (kills every locked door and the floodgate in one line),
**sword** (level-1's entire moonflower chain exists to award it), **`pedra + pedra = fogo`**
(sounds clever, guts the torch's timed round trip), **`graveto + graveto`** (two sticks already
mean *bridge* in this game's vocabulary).

- **Why it earns a place.** "Items should PRODUCE" has always been satisfied by props: the tree
  gives a graveto, the rock gives a stone, the grass gives seeds — the world is the only factory.
  The toolbox inverts the source: here the *items* are the input and the map contributes nothing.
  It is the only place where the answer to "I don't have the axe" can be **"then make one"**, and
  it gives gravetos and stones a destination beyond local consumption.
- **`TOOLBOX_RECIPES` is order-independent.** Requiring "the stick in the back tray" would be an
  invisible rule, and an invisible rule is the same sin as the deleted need-item balloon:
  information that only exists outside the world.
- **The slots deposit on step, exactly like the arm's origin tile, and for the same reason.** The
  game has no drop button — the hero only puts something down by *swapping* with an item already
  on that tile — and both trays start empty, so a toolbox would otherwise be unfeedable. The tray
  drawn on the ground BREATHES while empty and goes still and gold when loaded (the bombSpot's
  grammar): reading "one still missing" is just seeing which of the two is still pulsing.
- **A robotic arm can feed it, for free.** An arm whose output tile is a toolbox slot runs the
  factory unattended. No code was written for that — the two pieces just speak the same language
  (items lying on the ground), which is the point of keeping everything on tiles.
- **The refusal is PHYSICAL.** A pair that is not a recipe makes the lid jump and slam back with
  a dull iron thud, every ~2.5s — not continuously, or it becomes background noise. The player
  sees the machine TRY and give up; it never says what is missing. Same answer when the output
  tile is occupied: "not now" is the honest word for both, and distinguishing them would be the
  hint balloon back under another name.
- **It refuses rather than stacks, and it revalidates at delivery.** The output check at the start
  of the cycle can go stale over the ~2.3s it takes — so if the tile is taken mid-forge the
  finished item stays VISIBLE inside the open, still-glowing box until the spot frees. You can see
  the axe waiting in there.
- **The inputs are taken at the FIRST frame of the craft**, not at the forge: leaving them on the
  ground would open a window where the hero (or an arm) walks off with one while the machine is
  already working, and the box would produce out of nothing.
- Four beats, ~2.3s, and each one is a pixel-art pose swap, never a scale/fade: lid opens (240ms)
  → both items arc in and shrink to nothing (460ms) → **the forge** (900ms: hot frame, gold glow,
  three hammer blows with sparks, tremble that peaks mid-cycle) → the product arcs out and lands
  (420ms) → lid closes. Sprite Factory owns `toolbox.png`: 4 body poses + 2 tray states, 0 FAIL /
  0 WARN. The arched handle with a see-through gap is what separates its silhouette from the
  wooden crate; the base never changes between frames so opening reads as movement, not as a
  different object appearing.
- **Its parts need internal depth ordering** (`DEPTH_GLOW`/`DEPTH_ITEM`) — the same trap as the
  arm's. An east-facing box has its slots, body and output on the SAME `tileY`, so the flying
  cargo and the forge glow land in the body's own plane and either strobe or vanish behind it.
- The body is SOLID (bumping it rattles the tools inside), and `dir` travels through the editor's
  place/erase/undo like the arm's. It is the second directional prop, so it took the **G** key for
  free — but its frames are lid poses, not directions, so the board draws a **prow nub** on the
  chip instead of a direction frame (`hasDirectionFrames` vs `isDirectionalProp`). The editor
  warns when a slot or the output lands on collision, the world edge or another solid prop.
- `npm run playtest -- caixa-ferramentas` guards all of it: the four rotations derive the right
  three tiles, the body blocks, stepping on a tray deposits, the axe is manufactured and both
  inputs are consumed, a wrong pair is refused without producing anything, a blocked output holds
  the product until the tile frees, and the whole iron chain runs end to end.

### The ore rock (`ironRock`) and the iron block (`iron`)

The second raw material, and the prop that yields it. `ironRock` is **the same `RockObject`** with
`ore: true` — same two pickaxe blows, same recoil, same collapse, same collision, and the bomb
shatters it exactly like any boulder. What changes is the art and the drop.

- **It must not take a third blow.** An ore rock that costs one more swing is the same decision
  taken more slowly; the difference has to live in what comes OUT, never in the timing.
- **One class, not a subclass.** The difference fits in a boolean, while two classes would mean
  two copies of the recoil, the collapse and the collision contract — the reliable way for them to
  disagree a month from now. Same reasoning as `isTileOccupied` being shared by the crate and the
  swing gate.
- **`GameScene.dropRockSpoil` exists because TWO paths shatter rock** — the pickaxe and the blast —
  and they had already drifted once. With the rule written in two places, an ore rock opened by a
  bomb would calmly drop an ordinary stone.
- **The art is the plain rock's grid, pixel for pixel, with ore painted into it.** Both frames are
  literal dumps of `rock.png` / `rock_cracked.png`: the player has to recognise the boulder to
  think of the pickaxe. The ore is drywood BROWN against the lavender stone — a HUE contrast, which
  survives the night (the dark eats luminance, not warm-vs-cool). The cracked frame runs the vein
  along the fissure, so the crack promises the next blow instead of just recording the last one.
  The chips it throws are rust-tinted (`ORE_CHIP_TINTS`), so the blow reads different before the
  item even lands.
- **The iron block is the first item with NO use of its own.** Stone fords a river and quenches
  lava; a stick bridges and carries fire; iron only ever goes into a toolbox tray. That is
  deliberate — the bench needed an input whose only reason to exist was the bench, or every recipe
  would compete with its own ingredients' direct uses. It is also the only item whose ITEM GET
  caption points at another machine, because "I picked up a lump of metal and it does nothing" is
  otherwise the correct reading, and it is wrong.

## The pressure plate (`pressurePlate`) and the undead that WANTS it

A plate is the oldest circuit producer and the simplest: it needs a **body** on it. Three things
count, and always have — the **hero**, a pushed **crate**, and **any enemy**
(`GameScene.updateMechanismCircuits`). The first two are the problem the plate poses: the hero has
one pair of feet and needs them somewhere else, and a crate only goes where there is room to shove
it. The third used to be an accident of the occupancy test. Now it is the piece.

**A skull is drawn to a pressure plate.** If one is inside its sight radius (the SAME
`DETECTION_RANGE` it hunts the hero by — "what a skull can see" has to be one number), a **thought
balloon with a lit plate in it** rises over its head and it marches there, **ignoring the hero
completely**: it does not chase him, does not back away from his torch, does not strike even from
an adjacent tile. It arrives, it **stands there**, and the circuit closes. So a plate near the dark
is a switch the player throws by *leading a monster onto it* — the undead stop being only a threat
and become the third body, the only one that walks to the plate by itself.

- **The one lever the hero has is hitting it.** A blow snaps the fixation and keeps the skull
  plate-blind for `PLATE_BLIND_AFTER_HIT_MS` (`UndeadEnemy.takeDamage`). Without that window the
  manager would hand the plate straight back on the next frame and the counter-play would be
  decorative. There is no other cancel: you cannot talk it out of it, and standing in the way only
  makes it walk around you.
- **The balloon is NOT the need-item hint balloon coming back.** That one talked to the *player*
  ("go fetch the pickaxe") and handed him the answer to a lock; it is still gone, and `pedra` still
  asserts its texture never even loads. This one belongs to the *creature* — the same sentence as
  the attack wind-up's red flash, an intention shown before it is acted on — and without it a skull
  walking past the hero reads as a broken chase. Different sentence, different art (Sprite Factory
  `thought-plate.png`: thought bubbles trailing down, never a speech tail), different asset key.
  **A new creature intent gets a bubble; a new LOCK still gets only a shake.**
- **`EnemyManager.assignPlateLures` hands out ONE skull per plate**, honouring existing fixations
  first (re-assigning would walk a skull off the plate it is holding and strobe the circuit) and
  pairing the rest closest-first. It lives in the manager because it is the only place that can see
  the other skulls; a plate claimed by two would leave one standing beside a taken tile forever,
  which reads as broken rather than as hungry.
- **`GameScene.lurablePlates` decides what is even offerable**, and refuses two: a plate in campfire
  light (the undead never enter it, so that march could never end) and a plate under a crate
  (blocked, and pressed already). A balloon is a promise, and a promise the creature cannot keep is
  worse than no balloon. The hero standing on a plate is NOT a disqualifier — he walks off, and
  dropping the fixation every time he crosses would leave the skull dithering mid-room.
- **The march gives up on PROGRESS, not on a clock** (`PLATE_PATIENCE_MS`): `moveToward` is greedy
  and there is no pathfinder, so a rock between skull and plate is a dead march. As long as it keeps
  closing the gap it may take as long as it likes.
- Nothing that ships today has a plate in it (`world.json` and both levels have zero), so this
  changes no existing world — it is a tool for the next one. It used to exist only in the
  **adventure** (the siege is off in a puzzle world, and skulls were not authorable) — **e isso
  mudou com a volta da aba Inimigos**: um level pode ter uma caveira, então pode ter o quebra-cabeça
  de LEVAR um monstro até a placa. A isca não custou uma linha para isso funcionar; o corpo que
  faltava era o inimigo autorável. A playtest reaches it with `__scene.enemyManager.spawnUndead(x, y)`.
- `npm run playtest -- placa-undead` builds the whole thing: the skull is born BETWEEN the hero and
  the plate (hero 3 tiles west, plate 4 east) so walking east is the only reading of "it ignored
  the hero", then it presses the plate, holds the circuit without flicker, and a single blow drops
  the balloon and sends it back after the hero. `caixa-placa` remains the hero/crate regression.

## O ponto de spawn (`enemies`) — a cova que o autor cava, e o inimigo que volta

`src/game/entities/EnemySpawnerManager.ts` + a aba **Inimigos** do editor (5). O jogo tinha uma
fonte de caveira só: o **cerco** (`UndeadSpawnDirector`), que invoca num anel em volta do HERÓI
enquanto ele demora no escuro. Isso é pressão de ambiente, e por isso nunca serviu para autorar
nada — não existe "a caveira daquele corredor" — e ele fica **desligado justamente onde uma sala
precisa de guarda** (o lab e os levels, `meta.puzzle`). O ponto de spawn é a outra pergunta: um
tile FIXO, escolhido a mão, que tem um corpo em cima e faz outro depois que aquele cai.

A aba existiu e foi **removida** quando o inimigo passou a ser invocado dinamicamente; o schema
(`chunk.enemies`), o place/erase/undo do `EditorStore`, o chip do tabuleiro e o ponto do minimapa
continuaram inteiros esse tempo todo — o que faltava era a aba e, sobretudo, **alguém no runtime que
lesse aquilo** (`WorldData.getEnemySpawns`). As duas portas convivem, e não se confundem:

- **Um corpo por cova, nunca uma fila.** Enquanto o ocupante estiver vivo a cova não faz nada — e
  ela continua responsável por ele **depois que ele anda para longe do tile**. Se o critério fosse
  "tem alguém no meu tile?", ela pariria outro a cada passo que o corpo dela dá, e uma cova autorada
  viraria um cerco (que é exatamente o que já existe). É por isso que `EnemyManager.spawnUndead`
  passou a **devolver o corpo**: é o único canal de morte que existe (`EnemyBase.die()` não avisa
  ninguém de fora, e os dois lugares que matam — o golpe e a bomba — não sabem de covas).
- **O relógio conta sempre** (`ENEMY_RESPAWN_MS`, 25s), mesmo com o herói do outro lado do mapa. Se
  contasse só por perto, voltar a uma sala limpa daria uma sala vazia e a cova viraria decoração. É
  também por isso que as covas são lidas **de uma vez** e nunca por chunk: streamar zeraria o
  relógio a cada ida e volta.
- **A cova acorda no raio de visão da caveira** (`DETECTION_RANGE`, o mesmo número pelo qual ela
  enxerga o herói e enxerga uma placa). Nascer é um evento de ~3,8s de aviso, e a 40 tiles o aviso
  seria dado para ninguém — pior, o `EnemyManager` despeja aos 18 tiles, então 14 < 18 de propósito:
  nada nasce dentro da faixa em que seria despejado no mesmo instante. **Não há distância mínima**: o
  autor escolheu o tile, e o telégrafo de 3s é o que torna justo um nascimento colado no herói.
- **A cova não desenha nada, e isso é a lei da casa e não economia.** O nascimento JÁ é a arte dela
  — o chão rachando em três estágios com poeira subindo diz "vem coisa daqui" melhor que qualquer
  marca parada, e uma marca permanente entregaria a emboscada antes de ela existir. No editor ela é
  visível (chip vermelho com a arte do bicho: o tabuleiro é o único lugar onde ela precisa dizer O
  QUE nasce).
- **Luz de fogueira ACESA cala a cova**, de graça: undead não existe na luz, então acender o fogo do
  corredor silencia o corredor enquanto ele queimar — e apagá-lo com o balde reabre. A alavanca é a
  mesma do balde e da tocha, sem uma linha nova. Com o herói **dentro da segurança** de um fogo
  (`playerSafe`) nenhuma cova abre em lugar nenhum, e essa também é uma consequência do bicho e não
  uma regra nova: alcançada a segurança a matilha se desfaz sozinha (o sunset), então parir um corpo
  para ele virar pó três segundos depois é uma promessa que a cova não cumpre.
- **A elegibilidade do tile é a do cerco MENOS a alcançabilidade**, e a subtração é a peça:
  `undeadReachableTiles` é um flood-fill a partir do herói limitado ao anel + 3, e existe porque o
  cerco escolhe o tile na hora e não pode cair num bolsão. A cova não escolhe nada — o autor já
  escolheu —, e cobrar dela um alcance medido em volta do herói reprovaria toda cova a mais de 10
  tiles, ou seja, quase todas.
- **O editor denuncia as duas maneiras de nascer morta**, porque em jogo elas são silenciosas e um
  tile que nunca faz nada sem aviso nenhum é o pior defeito que um editor pode ter: tile bloqueado
  (colisão pintada, pinheiro/montanha/alvenaria/mar, ou prop sólido) e cova dentro da luz de um fogo
  que **já nasce aceso** (o de casa, ou um `lit: true` explícito — uma fogueira apagada por perto é
  o oposto de um erro, é a alavanca). `UI_STATE_KEY` foi para **v6** com a aba.
- Um inimigo autorado **não tem estado no arquivo** (`{ type, worldX, worldY }`): vida, direção e o
  relógio nascem com o corpo e morrem com ele. Um campo ali seria estado de partida gravado no mapa.
  O mundo infinito devolve **zero** covas de propósito — lá o perigo é o cerco com a pressão da
  distância.
- `npm run playtest -- inimigos` guarda tudo, e vale de pé porque roda no **lab**, onde o cerco não
  existe: toda caveira que aparece saiu de uma cova. Três covas — a que funciona (nasce, morre,
  VOLTA, e não faz a segunda enquanto o corpo dela anda longe), a que está na luz da fogueira (fica
  calada e **abre quando o fogo apaga** — sem essa segunda metade, uma cova simplesmente quebrada
  passaria no teste) e a que está debaixo de uma pedra (calada, e apagar fogueira não a resolve).
  Ele também cobra os dois avisos do editor e que o jogo **boote com o respawn de verdade** antes de
  encurtar o relógio em campo.

## O revólver — a única peça que se aponta

`runtime/PlayerBullets.ts` + o bloco do revólver na `GameScene` + `spritefactory/sprites/revolver.mjs`.
Um item novo, largado a um tile do spawn (`world.json`), que se mira com o **mouse** em 360° e
dispara no clique. Munição infinita.

**Ele quebra a regra dos dois botões de propósito, e é a coisa mais cara que faz.** O A é a espada,
o B é o item no tile à frente — e o gesto do revólver não é nenhum dos dois: é **apontar**, que num
tabuleiro de grade só existe se o mouse existir. Preso às quatro cardeais ele seria a espada com
mais alcance, que é exatamente o item que não vale a pena existir. O B continua valendo para ele
como para qualquer item sem ação de tile: deposita a arma no chão. É assim que se larga.

**A munição é infinita porque um contador seria um HUD**, e este jogo decidiu não ter nenhum (é a
mesma decisão que fez o feixe da vida cheia existir — e, depois, ser arrancado). O que mede o tiro
é a **cadência** (320 ms), que se sente na mão, e o **dano**: 1,5, o de uma ferramenta qualquer,
contra o 999 da espada. Duas balas para derrubar a caveira que a espada derruba com um golpe. O
revólver compra DISTÂNCIA e paga em tempo — e não herda a melhoria de cadência da loja, que é da
espada, ou a arma de longe mataria mais rápido que a de perto.

**A mira é resolvida no plano do chão, não por delta de tela** (`World3D.screenToGround`, o inverso
do `projectTile`). A tentação era `direção = cursor − centro da tela`: o herói fica no centro, então
parece bastar. Não basta — a câmera olha o mundo **inclinada**, e num plano em perspectiva um passo
para cima na tela vale muito mais mundo que um passo para o lado. A bala sairia sempre mais
"achatada" que o cursor, e o erro cresceria com a distância do centro. O raio da câmera pelo pixel
intercepta o plano `y = 0.5` — a altura em que a bala voa, e não o chão: mirar no chão faria o
cursor cair nos **pés** do que o jogador está vendo.

**O mouse tinha um emprego e ganhou outro.** Ele era o dedo de quem não tem tela de toque (arrasto
= andar). Com a arma na mão isso desliga (`PlayerMovementController.setMouseWalkEnabled`), senão o
clique do tiro planta a âncora do arrasto e o herói sai andando junto. Desligar com o botão
apertado limpa a direção presa — a mesma armadilha do `keyup` perdido no botão A. Teclado e toque
não sabem que a chave existe.

**A bala herda as leis do projétil de inimigo, e uma própria.** Coordenada contínua de tile, parede
mata e luz não, brilha por ser `emissive` e nunca por trazer uma luz. A própria: **morre no
primeiro corpo** — uma arma de munição infinita que varasse a fila seria melhor que a espada em
toda situação. O passo é subdividido em fatias de meio raio de acerto porque a 15 tiles/s um frame
gordo atravessaria um corpo inteiro sem nunca ter estado dentro dele. E o corpo é testado **antes**
da parede: um bicho encostado numa pedra tem de poder ser baleado.

Detalhes que só aparecem fazendo:

- **O billboard da bala usa a forma EXATA do projétil de inimigo** (`centered` + fogless +
  `alphaTest`). Não é preguiça: cada combinação de opções é um programa de shader, e essa já está
  no `prewarmShaders`. Flags próprias compilariam um shader no primeiro tiro do jogo.
- **A arma é sprite 2D, como o arco da espada**, e pelo mesmo motivo: billboard não tem eixo
  vertical (a lei do `dir` do braço robótico), então 360° só se desenha no plano da câmera. Ela usa
  o `swingLitTint` — que virou exportado — ou aço claro brilharia na mão de um herói no escuro.
- **A arte aponta para a DIREITA e espelha na VERTICAL** ao mirar para a esquerda. Girar 180° a
  deixaria de cabeça para baixo. Por isso a silhueta é um perfil limpo, sem detalhe de topo que
  denuncie o espelho.
- **O coice mora num objeto de rascunho**, não na cena: `killTweensOf(this)` mataria junto o tween
  da luz de cutscene, que também tem a cena por alvo. Mesma razão do `chop$` no `SwordOrbit`.
- **O cursor do sistema some** e vira a cruz desenhada — duas miras na tela não são mira nenhuma. A
  troca acontece só na borda (item entrou/saiu da mão), não a cada frame: `setDefaultCursor`
  escreve CSS, e escrever CSS 60 vezes por segundo é layout de graça.
- **O clique não tem buffer**, ao contrário do A e do B. Um tiro adiado sairia depois de o jogador
  já ter movido o cursor, e acertaria um lugar que ele não escolheu. A cruz fica cinza na cadência.

O snapshot de debug ganhou `bullets` e `aim`: é o par que deixa um cenário cobrar a mira sem
depender de pixel — mova o cursor, leia o `aim`, cobre que a bala saiu nele.

## A ossada, e a povoação do mundo grande

Quatro pedidos numa tacada — o que fica quando uma caveira cai, o dobro de covas, um mundo com mais
mato e flor, e fogueiras espalhadas. Três deles são conteúdo e um é código, e o registro que
importa é o do conteúdo: **por que o `generate:world` não podia ser usado**.

### A ossada (`entities/CorpseDecals.ts`)

Matar uma caveira não deixava marca nenhuma. Num mundo em que a cova devolve corpo em 25 s, isso
apaga o único registro de que o jogador esteve ali e ganhou — e num jogo sem HUD e sem contador, o
chão é o único lugar onde esse registro cabe. Agora ela deixa **caveira e ossos** no tile onde caiu.

- **A arte já existia**: frame 27 do `forest_tile_set`, "Caveira e Ossos", o mesmo que o editor
  espalha pelo cemitério. Nada de sprite novo — e reusar o frame amarra os dois lugares na mesma
  leitura. (Foi olhando os pixels ampliados que também se descobriu que "Cogumelos Vermelhos" (10)
  e "Cogumelos Roxos" (11) são, na arte, **florzinhas** vermelhas e lilases. O rótulo da paleta
  mente; o tileset não.)
- **Quad deitado no formato que o `prewarmShaders` já segura** (`flat` + `alphaTest` baixo, a mesma
  forma da poça de gosma). Toda combinação nova de opções é um programa novo, e compilar shader no
  frame em que um bicho morre é o pior engasgo deste renderer.
- **Vive no `EnemyManager`, não no corpo**: o osso sobrevive à caveira, que é destruída assim que
  acaba de se esfarelar. Quem vive mais que o dono pertence a quem enterra os dois.
- **Tem teto (24)**: cada ossada é um billboard, billboard é draw call, e o explorador é infinito —
  sem teto, uma expedição longa deixaria centenas penduradas para sempre. Passou, a mais antiga se
  desfaz.
- Vai no `onDeath` e **não** no `despawn`: quando o herói alcança a fogueira o escuro reclama os
  próprios de volta, e ali não houve briga para registrar. Osso é o que sobra de quem foi *morto*.

### ⚠️ O `generate:world` teria apagado o mundo

O primeiro instinto foi rodar `npm run generate:world` com números maiores. Ele teria destruído o
jogo: `scripts/generateWorld.ts` escreve um mundo **8×8, com uma fogueira e zero portais**, e o
`public/world.json` de hoje é **22×8, autorado à mão no editor**, com 9 portais de level, 10 NPCs e
140 covas — 71 mil linhas de trabalho **não commitado**. É exatamente a armadilha do
`generate:levels`, no arquivo que ninguém tinha marcado como perigoso. O `CLAUDE.md` agora diz isso
dos dois.

O caminho certo é `scripts/enrich-world.mjs`: **lê** o world.json e acrescenta. Três regras que
qualquer script de conteúdo em massa herda daqui:

- **Idempotente**: mira num TOTAL, nunca num delta. A primeira versão fazia `undead × 2`, e a
  segunda rodada levou 48 para 96 — a mesma linha de código, duas vezes, dois mundos diferentes.
  Hoje o alvo é o número absoluto 48, e rodar de novo é no-op.
- **Determinístico**: zero `Math.random()`. "Rode de novo" não pode dar outro mapa.
- **Proibido de tocar no que já estava lá**: `ground`, `collisions` e qualquer célula da camada de
  cima que não estivesse vazia saem intactos — e a validação cobra isso contra um backup, célula a
  célula (0 tiles de chão, 0 colisões e 0 mudanças de **caminhabilidade**).

### O que entrou

**Decoração 666 → 2.945** (~30 % do chão livre), e a distribuição é por **ruído suave**, não por
sorteio tile a tile: sorteio uniforme espalha confete e deixa o mapa inteiro com a mesma densidade,
que lê como textura de fundo. Com um campo de duas oitavas por cima nascem clareiras e matagais, e
é a *diferença* entre eles que faz o lugar parecer um lugar. O **que** brota sai da vizinhança —
cascalho no pé da montanha, arbusto florido na meia-sombra da mata, florzinha em campo aberto —
porque um cogumelo no meio do descampado é só um pixel colorido. Nada disso bloqueia: frame de
camada superior fora de `SOLID_UPPER_FRAMES` deita no chão e se pisa por cima.

**Gravetos (2 e 9) ficaram de fora**, e é a única escolha ali que não é estética: graveto é um
**item** neste jogo — a lenha da tocha, as tábuas da ponte. Um tile que desenha um graveto e não
entrega nenhum é uma afordância mentindo, e o mapa coberto delas ensinaria o jogador a parar de
olhar pro chão.

**Covas de morto-vivo 24 → 48**, e dobrar não foi espalhar caveira nova pelo mapa: cada cova nova
nasce a 2–6 tiles de uma que já existia, anel a anel. Os trechos assombrados ficam mais
assombrados e o resto do mundo continua sendo o resto do mundo — que é o que faz um trecho
assombrado existir. Todas passam pelos dois filtros que o editor cobra: fora de tile bloqueado e
fora da luz de fogo aceso (cova na luz fica calada para sempre).

**Fogueiras 1 → 9, e as oito novas nascem APAGADAS.** Fogueira acesa é zona segura e é a loja —
semear oito acesas seria plantar oito ilhas de paz num mundo cuja única tensão é o escuro. O jogo
já tem resposta para fogo morto: a tocha. Cada uma é um destino, e a primeira coisa que o jogador
faz com ela é decidir se vale a caminhada com a chama na mão. Elas só pousam em **clareira** (20
dos 24 vizinhos abertos), porque a fogueira ocupa o próprio tile e numa passagem estreita seria uma
parede nova; e ficam a ≥26 tiles uma da outra. A de casa continua sendo a mais próxima do spawn,
que é como o runtime escolhe qual acende.

## O bestiário — sete espécies, e cada uma é uma FRASE

`src/game/entities/enemies/` (um arquivo por espécie) + `EnemyProjectile.ts`. A aba **Inimigos**
oferecia uma linha: a caveira. Hoje oferece `undead · bat · spider · slime · bigslime · turret ·
mage`, e a arte de todas elas **já estava no repositório** — era a fauna do modo Sobreviventes, que
saiu do jogo. O `textures3d.ts` guardava a nota por escrito ("esperando um inimigo de verdade na
aventura"); esta é a entrega dessa nota.

O critério de projeto foi um só, e ele é o motivo de o trabalho não ser uma tabela de HP: **uma
espécie nova só se justifica se disser algo que nenhuma outra diz.** Números diferentes fazem
inimigos diferentes no papel e o mesmo inimigo na mão. Então:

- **Morcego** — *o mapa não segura quem voa.* Todo perigo do jogo era negociável com terreno: ponha
  a água entre você e o problema e o problema fica lá. Ele é a única coisa que aparece do outro lado
  do vau sem que ninguém tenha construído ponte. Em troca é frouxo (1 de vida, um soco basta): o
  custo dele é de POSIÇÃO, não de dano. **O mar continua fora** — nada no jogo atravessa mar.
- **Aranha** — *quebra a conta que a caveira ensinou.* A caveira anda num relógio fixo, então
  distância é tempo. A aranha rasteja a 700ms, AGACHA 400ms (o aviso, e o único momento fácil dela)
  e dá três passos em 120ms. O bote é o próprio telegrafo: quando ela chega, ela já avisou.
- **Slime** — *a tocha protege do MORTO e do BICHO, não de tudo.* O jogador aprendeu a tratar chama
  na mão como escudo, e um saco de limo sem olhos nem medo é a correção dessa leitura. Nada disso é
  dito em texto: ele levanta a tocha, e a gosma continua vindo.
- **Slime Grande** — *a única peça que responde ao golpe perfeito com mais trabalho.* A espada mata
  qualquer coisa de um golpe (`MELEE_DAMAGE.sword = 999`), então tanque de HP é ficção contra ela;
  o que não é ficção é rachar em dois. Matar um vira matar três.
- **Torreta** — *inimigo e MOBÍLIA ao mesmo tempo.* Corpo ocupa tile e ninguém atravessa inimigo,
  então ela é uma parede que atira, e o autor pode usá-la como as duas coisas. Atira em **leque
  radial** (6 balas, ângulo de partida sorteado a cada rajada): sair da linha de tiro não serve, o
  que serve é a pedra. Ignora a tocha por um motivo diferente do da gosma — máquina não vê chama.
- **Mago** — *nega o golpe em vez de aguentá-lo.* Mantém 5 tiles, recua quando o herói avança e
  RODEIA na faixa boa (sem o rodeio, um mago na distância certa fica plantado como um poste).

### As leis que o bestiário respeita, e a que ele quebra

- **Chegar é um evento.** A caveira racha o chão por 3s; quem não vem de baixo faz o gesto curto
  equivalente (silhueta crescendo + poeira + som, 900ms), **invulnerável e inerte** enquanto isso.
  Um corpo que aparece do nada ao lado do herói é injusto, e isso vale para o bestiário todo.
- **O golpe é telegrafado e trava um tile** (`WalkerEnemy`): mira onde o herói está AGORA, avisa,
  bate depois. Sair de lá é esquiva de verdade; um golpe do herói no meio do movimento cancela.
- **Luz de fogueira é parede para todo monstro**, inclusive a máquina — e por isso acender o fogo
  do corredor continua calando a cova dele, seja qual for a espécie. Foi a única regra que não
  ganhou exceção: ela é a alavanca central do jogo, e uma exceção aqui a tiraria do jogador.
- **O desmanche na segurança (`sunset`) ficou SÓ do morto-vivo.** O escuro invocou a matilha, então
  a matilha se desfaz; bicho vivo e máquina não derretem porque o herói sentou na fogueira.
- **A placa de pressão continua só com a caveira** (`EnemyBase.seeksPlates`, com default `false`).
  A placa quer um corpo e o corpo que o escuro manda vai lá sozinho; um bestiário inteiro marchando
  para placas transformaria toda placa em interruptor de bicho.
- **Quebrada:** `fearsTorch`. A tocha era absoluta e agora é uma **lista** — gosma e máquina a
  ignoram. Isso é intencional e é a frase de duas peças.

### O projétil, o primeiro dano à distância do jogo

`EnemyProjectile.ts`. Todo dano de contato mora na grade; o mago e a torreta não cabem nela — uma
bala que andasse de tile em tile no relógio de passo do bicho é uma ameaça que se vê chegar de longe
e da qual se sai andando. Então o projétil é **a única coisa do jogo em coordenada contínua de
tile**: voa em tiles/segundo por cima do tabuleiro.

- **Parede mata bala; luz e rio, não.** A luz é a lei sobre onde uma *criatura* existe (uma torreta
  que parasse de acertar quem senta na fogueira faria do fogo um escudo antibalas), e hazard é o
  que segura *pé* (uma bola de fogo morrendo na beira do riacho ensinaria uma regra que não existe).
  Sobra o que de fato atravanca um voo: pedra, árvore, montanha, alvenaria, portão, corpo de NPC.
- **O passo é subdividido.** A bala mais rápida faz ~0,12 tile por frame de 16ms, mas um frame gordo
  (25ms de terreno reassando no explorador) a faria pular quase um tile — e atravessar uma parede de
  um tile, ou o próprio herói, sem nunca ter estado dentro. Ela anda em fatias de meio raio de
  acerto, e é isso que garante que "passou por dentro" é sempre visto.
- **Herói invencível não é atravessado em silêncio:** o tiro morre nele com o mesmo estouro. Sem
  isso, a primeira bala de uma rajada doeria e as outras cinco passariam por dentro do corpo dele.
- **Ninguém acende nada.** A lei da casa (contagem de luz THREE não muda em runtime) valeria uma
  recompilação do mundo inteiro por bola de fogo: elas brilham por serem `emissive` com boost.
- **Quem atirou não lunga.** O acerto devolve o PONTO do projétil e não a posição do bicho
  (`EnemyHit.ranged`), porque o empurrão do herói vem da direção do voo — um mago a cinco tiles
  dando um soco no ar seria comédia.
- **Nenhuma forma nova de billboard.** `perf-profile` falha se um programa compilar durante o jogo,
  e a poça de gosma foi a armadilha: `fog: false` num quad deitado é *outro shader* (`USE_FOG` entra
  na chave), então a poça ficou com fog ligado para cair numa forma que o `prewarmShaders` já segura.

### As armadilhas que este trabalho encontrou

- **A arte do mago tem dois donos.** `mage__1.png` é o sprite do NPC "wizard", o velho que conta a
  história. Um inimigo com o corpo de um amigo é uma mentira visual que nenhuma legenda conserta, e
  a saída foi um **tom frio permanente** (`COLD_TINT`) — um espectro do feiticeiro, não ele. Isso
  obrigou `restoreTint()` a existir em `EnemyBase`: toda piscada (dano, imunidade, aviso de golpe)
  terminava em `clearTint`, que devolveria o mago inimigo ao branco do NPC por um instante. Na
  conjuração o tom SAI, porque a arte de casting tem clarão próprio — o contraste frio→quente é o
  telegrafo.
- **`FLYING_ENEMY_KINDS` é uma lista, não três.** Voar aparece no corpo (`EnemyBase.flies`), na cova
  (`canSpawnAuthoredEnemyAt`, que precisa aceitar um tile de água quando o que vai nascer tem asa) e
  no aviso do Salvar (que senão denunciaria como "tile bloqueado" uma cova de morcego perfeitamente
  boa). Três cópias seria o jeito garantido de as três discordarem daqui a um mês — e o meio-caminho
  chegou a existir neste trabalho: o editor já perdoava a água que o runtime ainda recusava.
- **`EnemySpawnerQuery.canSpawnAt` passou a levar o `type`** pela mesma razão: sem a espécie na
  pergunta, uma cova de morcego em cima da água ficaria calada para sempre.
- **Relógio com fase não pode nascer no construtor.** `moveIntervalMs` é abstrato (a aranha muda de
  ritmo em voo) e o construtor da base roda antes da subclasse existir; a fase entra quando o corpo
  fica ativo, que também é o momento honesto — dois bichos que chegaram no mesmo frame não saem
  andando em coro.
- **`render()` reescreve a escala do sprite todo frame** (`spriteScale × squash`), então o recuo da
  torreta e o pop de chegada não podem ser tweens diretos no billboard: o recuo passou a ser
  `triggerKnockback(0, 0)` e a chegada, um `spriteScale` que cresce.
- **O `undead` do estado de debug ficou com o nome antigo** e hoje lista o bestiário inteiro, cada
  entrada dizendo a própria espécie em `kind`. Renomear quebraria todo cenário existente sem contar
  nada de novo.
- `npm run playtest -- fauna` e `-- projeteis` guardam isso, e valem de pé porque rodam no **lab**,
  onde o cerco não existe. O `fauna` autora um rio inteiro e mede as frases em A/B — o morcego cruza
  o rio que a gosma não cruza; a mesma tocha, no mesmo instante, espanta a aranha e não move a
  gosma; o bote fecha 2+ tiles em meio segundo; o grande racha em dois encostados nele. O
  `projeteis` mede o leque (6 balas simultâneas com direções opostas), que a torreta não anda nem
  cala com a tocha na cara, e a lei do tiro em A/B: **atrás da pedra o feitiço não chega e o herói
  não perde um coração; no aberto, o mesmo feitiço dói.** Sem a segunda metade, um mago simplesmente
  incapaz de ferir passaria no teste da parede com louvor.

## O zora — o Zola do Zelda 1, e o dia em que o rio parou de ser só parede

`src/game/entities/enemies/ZoraEnemy.ts` + `spritefactory/sprites/zora.mjs`. É a oitava espécie, a
**primeira desenhada nesta casa** (todas as outras herdaram arte do finado modo Sobreviventes) e a
única cujo pedido foi explícito: *a mecânica igualzinha à do Zelda 1, o visual não*.

### A mecânica, sem adaptação

No Zelda 1 o Zola é o único inimigo cuja resposta correta não é lutar: ele ataca de dentro d'água —
o único terreno onde o Link não pode estar — e enquanto está submerso não existe alvo nenhum. O
ciclo foi mantido inteiro: **submerso → emerge num tile de água → cospe mirado (com aviso) → some, e
volta em outro lugar.** Ele não anda, não persegue, não tem caminho a bloquear; o rio inteiro é a
casa dele. HP 2, como no original.

O que faz a peça funcionar é a **janela**: submerso e emergindo ele é intocável (`isSpawning`, o
mesmo canal que o corpo saindo do chão já usava — a espada bate, o anel frio responde e nada
acontece); erguido e cuspindo, não. Quem quer matá-lo tem de estar pronto **antes** de ele aparecer.

Duas coisas vieram de graça do que o jogo já tinha, e são exatamente as certas: encostar num zora
erguido dói (o esbarrão já cobra contato de qualquer corpo não-`isSpawning`) e o cuspe morre na
pedra (`EnemyProjectile`), então uma coluna entre você e o rio ainda é resposta.

### A inversão que ele obrigou

Todo corpo do jogo **recusa** água; o morcego a tolera porque voa. O zora é o oposto dos dois: só
existe em cima de rio, e terra seca é o tile impossível dele. Isso virou `AQUATIC_ENEMY_KINDS` (ao
lado de `FLYING_ENEMY_KINDS`) e inverteu as três perguntas de sempre — a cova só abre em água aberta,
o aviso do Salvar denuncia a cova **em terra** (e some com o aviso de "tile bloqueado", que para
qualquer outra espécie seria o correto naquele mesmo tile), e o bicho não anda com hazard liberado:
ele mergulha e reaparece.

### A contra-jogada que o Zelda não tem

No original não há resposta para o Zola: você anda para longe da margem. Aqui há, e ela **já existia
antes dele**: o zora precisa de água **aberta** (`WaterObject.blocking`), e o rio deste jogo deixa de
ser rio de três maneiras que o jogador conhece — a ponte de madeira, o vau de pedra e a comporta que
drena o canal. Tampe a água dele e ele fica sem lugar; drene o canal e ele não volta mais, porque a
cova também não pode abrir. **Zero linha de código nova**: a resposta é a soma de duas peças que já
estavam na mesa, que é como esta casa prefere responder.

O efeito colateral vale mais que o inimigo: até aqui o rio era só uma **parede que se atravessa** — a
única peça que tinha alguma relação com ele era o morcego, que passa por cima. Agora é um lugar de
onde sai coisa, e atravessar deixou de ser a única pergunta que a água faz.

### A arte, e o que o linter não pega

Feita na Sprite Factory, **6 estados** em coluna: submerso, emergindo, erguido, cuspindo, o próprio
cuspe (a munição mora no sheet do bicho, como a fagulha mora no `bomb.png`) e um segundo "erguido"
de micro-variação, para ele **respirar** parado em vez de virar estátua.

O sprite passou por quatro versões, e as três primeiras morreram de causas que valem para qualquer
bicho futuro. **Nenhuma delas foi pega pelo linter** — as três apareceram olhando, e as duas
últimas só apareceram olhando o **jogo**, não o preview:

1. **v1 — corpo em ink navy.** Passou em todas as regras objetivas e sumia no preview NOTURNO.
2. **v2 — silhueta de peão encapuzado** (cabeça e ombros fundidos num sino) e a esteira em anel
   fechado, que lê como um **olho flutuante** (anel fechado com miolo claro *é* um olho).
3. **v3 — a esteira num quad EM PÉ.** No jogo ela aparecia meio tile **acima da água**, boiando no
   ar. Marca na água é chão: hoje o frame 0 é desenhado **de cima**, para um quad **deitado** (o
   mesmo caminho da fissura fria da caveira). Foi a correção que mais mudou a peça, e ela é de
   código, não de pixel — a arte só existe direito porque o billboard mudou de plano.
4. **v4a — o quad deitado ficou `lit`,** e de noite apagava junto com o resto do chão. A esteira é o
   **único aviso** que o jogador tem antes de o bicho subir; aviso que a noite come não é aviso.
   Virou **aditivo**, a mesma receita da fissura da caveira — e por isso a arte perdeu a massa
   escura que tinha no meio: em blending aditivo, pixel escuro não existe.

O que a versão final faz de diferente, e por quê:

- **Cabeça com estrutura**: focinho que avança, **sobrancelha** escura sobre o olho (é ela que faz
  um pixel vermelho virar OLHO), mandíbula de osso e duas espinhas de crista. Quatro leituras — o
  máximo que 16×16 aguenta antes de virar ruído.
- **Sombra em mancha, não em listra.** A v3 tinha uma coluna de 1px clara na esquerda: isso é
  contorno, não volume.
- **Luz de borda de LUAR.** Foi o que finalmente fez o corpo existir à noite: alguns pixels de
  `#bbf2f4` no contorno superior-esquerdo da cabeça e do ombro. Clarear o bicho inteiro teria
  matado o "vulto no rio"; a borda dá silhueta **sem** dar valor médio.
- **A gola de espuma muda por estado** (coroa alta emergindo, assentada parado) — sair da água e
  estar na água não podem ser a mesma imagem.
- **O cuspe levou três tentativas**: estrela de 4 pontas (leu como faísca de metal), losango (leu
  como cristal) e enfim a **gota redonda com casca de onda e uma gotícula soltando atrás** — o que
  o separa da bala da torreta, que já é a munição redonda e azul deste jogo.

E a esteira ganhou um papel que ela não tinha: ela abre no tile escolhido **900ms antes** de a
cabeça sair. Antes ela ficava parada onde ele havia mergulhado — ou seja, **prometia um lugar e
entregava outro**. Hoje a água avisa onde, e quem estava atento sai da linha: a mesma gramática do
chão rachando antes da caveira.

- **A v1 passou em todas as regras objetivas e estava errada.** Corpo em ink navy — a cor com que
  este jogo escreve "escuro" — e no preview NOTURNO ele simplesmente não existia. A regra que saiu
  disso: **o valor da peça segue a função dela.** Vulto de fundo pode ser navy; **alvo tem de ler**,
  e este só pode ser ferido dentro de uma janela de tempo. O corpo virou a rampa `deepblue`, mais
  clara que a noite e mais fria que a água teal em que ele nasce.
- A v1 também lia como um **peão encapuzado** (cabeça e ombros fundidos num sino) e a esteira do
  frame submerso lia como um **olho flutuante** (anel fechado com miolo claro *é* um olho). O corpo
  virou cunha estreita com pescoço de 2px, e a esteira virou um V de traços horizontais — diagonal
  de 1px é um rosário de pixels órfãos, e o linter conta vizinhos em cruz com razão.
- O que ele pega emprestado do jogo, de propósito: **olho vermelho da caveira** (`#a53030` — no
  Zero, o que te caça tem olho vermelho; uma peça que inventa o próprio código de cor obriga o
  jogador a reaprender do zero), **boca de osso** (`#b5b5b5`, e é ela que muda entre "parado" e "vai
  cuspir") e **espuma/onda do dump literal de `water_0.png`**, que é o que o ancora no rio.
- O frame `emergindo` é a MESMA cabeça do `erguido`, cinco linhas abaixo com espuma por cima (regra
  8: animação é micro-variação, nunca silhueta nova) — a primeira versão dele era um monte genérico,
  e o bicho parecia virar outra coisa no meio do ciclo. **O olho fica apagado enquanto ele sobe:**
  olho aceso = janela aberta, e o jogador aprende isso vendo.
- O cuspe é uma **estrela de respingo** e não uma gota: a bala da torreta já é a munição redonda
  deste jogo, e duas munições redondas e claras seriam a mesma munição.

### O bug que escapou: **a água deste jogo tem duas procedências**

A primeira versão só enxergava o prop `water` (`WaterObject`) — que é como um *level* autora um rio,
e foi com props que o cenário nasceu. Mas o overworld não usa props: o gerador escreve **toda** água
— rio, lago e oceano — como **tile de terreno** (`SEA_TILE_FRAMES`), e o `CLAUDE.md` já dizia isso na
seção da água que anda. Resultado: cinco covas autoradas em cima de um lago do mundo grande ficaram
mudas, e o aviso do editor ainda jurava que estavam em terra — um aviso que mente é pior que aviso
nenhum, porque manda mover a única coisa que estava certa.

Hoje `GameScene.isOpenWaterAt` é a única resposta, e a ordem dela importa: **se há prop, é ele quem
responde** (ponte, vau ou canal drenado deixam de ser casa mesmo com água pintada por baixo); senão,
vale o tile. Dessa assimetria sai uma consequência que vale dizer em voz alta: **num rio-prop o
jogador tem resposta; na água pintada e no mar, não** — e ali o zora é tão inegociável quanto o Zola
do Zelda, o que é justo, porque aquilo é a moldura do mundo e não uma sala.

A correção abriu uma armadilha nova, e ela é do tipo que só aparece lendo o código do vizinho: **fora
do mundo o chão também é o frame do mar** (`WorldData.VOID_GROUND_FRAME = SEA_TILE_FRAME` — é assim
que o mapa finito ganha borda dura). Sem um teste de "este chunk existe?", um zora autorado perto da
beirada emergiria em coordenada inexistente: vivo, cuspindo, num lugar onde a câmera nunca vai.

### A armadilha que só apareceu ao escrever o teste

A primeira `pickSurfaceSpot` emergia no tile de água **mais próximo do herói** — parece mais esperto
e prega o bicho num buraco só: com o herói parado, o mais próximo é sempre o mesmo, e "some aqui,
aparece ali" (a assinatura do Zola) virava "sobe e desce no mesmo lugar". Um inimigo que só muda de
lugar quando o jogador se mexe não muda de lugar. Hoje é sorteio entre a água ao alcance do herói,
dentro do raio de casa — e o cenário cobra **≥2 tiles distintos com o herói parado**.

### O cuspe que saía pelas costas — e o espelho que nunca existiu

Duas coisas, e a segunda é a que valia.

**A mira parava cedo.** Erguido, o zora encarava o herói — mas **só na fase `up`**. A boca aberta é
uma fase própria, de 400ms, e o herói anda dentro deles: quem cruzava pro outro lado durante o
telegrafo levava um cuspe saindo das costas do bicho. Hoje ele vira **até o último frame**, e o
`spit` fixa o lado no instante em que a bola sai com o **mesmo `dx`** que a bala leva — duas
leituras separadas de "onde está o herói" (uma pra virar, outra pra atirar) podem discordar por um
frame, e um frame já basta. Alinhado na vertical (`dx === 0`) ele **não** vira: o cuspe sobe ou
desce, não há lado a escolher, e um `flipX(false)` ali daria um tranco pra esquerda de graça.

**Mas ele continuou olhando pra esquerda e cuspindo pra direita** — porque o espelho nunca chegou a
existir. `Billboard3D.setFlipX` escrevia direto no `mesh.scale.x`, e `apply()` — que reescreve a
escala inteira a partir de `w`, sempre positivo — apagava o sinal. `apply()` roda em `setPosition`,
`setDisplaySize`, `setElevation` e `setVisible`, e `EnemyBase.render` chama os dois primeiros **todo
frame**: o flip era desfeito no mesmo frame em que era pedido. O herói escapava por acidente — ele é
o único que chama `setFlipX` *depois* de se posicionar, e refaz isso a cada frame. Hoje o
espelhamento é **estado do billboard** (`flipped`, lido dentro do `apply()`), então ele sobrevive e
a ordem das chamadas deixa de importar. De quebra o contorno vermelho de vida baixa parou de sair
espelhado ao contrário do corpo — ele copiava `hb.flipX` e perdia o flip na linha seguinte.

**E o `setFlipX(ox < 0)` do `stepTo` foi removido.** Consertada a plataforma ele passaria a valer, e
valeria errado: este bestiário é desenhado **de frente** (caveira, aranha, morcego, gosma, mago),
então espelhar não vira ninguém — só inverte a luz, que nesta arte vem sempre da esquerda. Quem é
vista de lado pede o espelho por conta própria, e hoje há uma só: o zora.

`npm run playtest -- zora` guarda tudo, e a assertiva que mais importa é a janela cobrada **nos dois
sentidos, no mesmo corpo, com o mesmo golpe**: 999 de dano submerso não faz nada, e 999 de dano com
ele erguido mata. Sem a primeira metade, um zora sempre vulnerável passa; sem a segunda, um zora
imortal passa. O cenário ainda cobra a inversão no editor (a cova na água **não** pode aparecer como
"tile bloqueado") e a contra-jogada: drenado o rio, a cova para de fazer corpo.

**Três defeitos foram encontrados RODANDO, e nenhum deles era do jogo — eram das minhas fixtures.**
Vale registrar porque a lição é a mesma nas três: um cenário escrito e nunca executado é uma
hipótese, não um teste. (1) O `projeteis` punha o mago **fora da ponta** de uma parede de 5 tiles, e
o tiro contornava com toda a razão; corrigida a posição, o **próprio mago** deu a volta a pé — ele é
um kiter — até ficar do mesmo lado do herói. Cobertura de verdade não tem ponta: a parede passou a
atravessar o mapa. (2) O `fauna` punha a aranha **dentro da luz da fogueira**, e luz é parede para
monstro: com todos os quatro vizinhos acesos, ela congela — o teste lia "não recuou" quando o fato
era "não pode andar". As asserções de fuga/perseguição passaram a medir **distância**, não
coordenada: cobrar um `worldY` específico é cobrar o caminho em vez do comportamento.

Depois do bug acima ele passou a autorar **as duas águas na mesma fixture** — um rio de props e um
lago de tile pintado, cada um com a sua cova — e cobra que as duas abrem. O lago fica a 11 tiles do
herói de propósito (além do `SURFACE_RANGE`), então aquele corpo nasce e **fica submerso o teste
inteiro**: ele não atrapalha nenhuma medição e ainda serve de controle no fim, quando o rio é drenado
e só o zora do rio some.

## The water wheel (`waterWheel`) — a real in-river 3D generator

`src/game/objects/WaterWheelObject.ts`. The wheel is a named boolean circuit producer with a real
Three.js rotor: low-poly rim, connected spokes, volumetric paddles, hub, axle, submerged trestle
and dynamo housing. The whole rotor is one hierarchy and turns continuously through
`rotor.rotation.z`; the runtime sprite sheet is not faking its motion.

- **The wheel occupies the river tile itself.** In the editor it may only replace an existing
  `water`/`bridgeSpot` prop. At runtime that prop creates its own non-buildable `WaterObject`, and
  `World3D.buildTerrain` includes wheel tiles in the sunken river set. Forgetting the latter leaves
  the water quad below an ordinary ground tile, making a logically wet wheel look dry.
- **Standing water is not enough.** `waterFlowAt` requires active, non-drained water under the
  rotor and at least one active orthogonal river neighbour. Draining the wheel's own tile removes
  its source even while an adjacent tile stays full.
- **Power comes from angular speed, not directly from the water predicate.** The rotor accelerates
  against inertia, closes its circuit above a threshold and coasts after flow stops. This keeps the
  dínamo alive briefly during slowdown instead of snapping wheel, light and consumer off together.
- **Circuit producers combine by OR.** Pressure plates and water wheels sharing a variable are
  aggregated once per frame before consumers update. A robotic arm with a `variable` only moves
  while that circuit is live; an old unbound arm remains self-powered for compatibility.
- **Sprite Factory still owns the authored pixel asset.** `spritefactory/sprites/water-wheel.mjs`
  builds 8 rotor phases in off/on banks with the official wood/stone/green palette (0 FAIL,
  0 WARN). Phaser uses it for the editor palette and placement icon; gameplay uses the 3D model.
- Juice is stateful: water spray follows the detected flow, paddles have a repeating splash SFX,
  startup shakes, the dynamo emits a green pulse/sparks and its physical lamp changes colour.
- `npm run playtest -- roda-agua` guards dry-placement rejection, in-river authoring, continuous
  3D angle change, acceleration, power delivery to an arm, draining under the wheel, coast and
  final shutdown. `caixa-placa` and `braco` are the circuit/consumer regressions.

## The boiler (`boiler`) — fire becomes energy

`src/game/objects/BoilerObject.ts`. The third circuit producer, beside the plate and the wheel —
and the one that finally connects FIRE, the game's only steerable system, to the power grid. The
wheel asks "is water flowing here?"; the boiler asks "is there flame touching me?"
(`GameScene.fireHeatAt`, orthogonal neighbours): a LIT campfire (steady state — the bucket is its
off switch), a burning bush/grass (the pulse of a planted fuse), lava (geothermal, permanent —
the melt around a settled crown still burns), or a lit graveto lying on the ground (what the
robotic arm delivers — flame crossing a wall into a firebox). Heat is not spread: nothing
CATCHES fire because of the boiler. And the hero's own lit torch STOKES it directly — bump the
furnace with the burning graveto (the house fire-bump grammar; the torch survives the transfer)
and it burns internally for ~16s (`stoke`): a timed round trip, never a switch, so running a
machine on torch alone means feeding the furnace — fixed sources are how a plant stays on.
While alive (stoked, heated or coasting on steam) the chimney SMOKES — a running plant
announces itself from afar.

**Steam needs BOTH elements.** Fire under an EMPTY tank pressurizes nothing: bump with the
full bucket to fill it (the throw empties the bucket, same as dousing), and boiling CONSUMES
the water (~45s per bucket, draining only while heated — steam is the water leaving). The
sprite carries both asks as its two dark voids: the cold firebox mouth wants fire, the empty
sight glass (blue when wet) wants water. The ART carries both asks — there is no balloon
translating them. Both are round trips: the plant demands the two elements, repeatedly.

- **Power comes from steam PRESSURE, not from the heat test** — the exact mirror of the wheel's
  angular speed. Pressure builds against thermal inertia (~1.4s) and drains slowly (~5.2s), with
  hysteresis (on at 0.45, off at 0.18): one grass tuft burning 2.2s buys several seconds of live
  circuit, so a pulsed fuse can FEED the furnace without the consumer flickering — stoking is
  the gameplay, the farming loop become a power plant.
- The body is a BILLBOARD like every other world prop (the game's style), boot-generated in
  three looks swapped on state edges the way a campfire swaps frames: cold / stoked (the
  firebox mouth ember lights — the readable thermometer) / generating (the dynamo's green
  status lamp — the one "circuit closed" grammar shared with the wheel). Steam puffs pace with
  pressure and a near-subliminal tremble marks full regime; effects/audio only exist near the
  hero (the wheel's rule). No new THREE lights — the fire that heats it brings its own from
  the pool.
- Producers still combine by OR per variable; the editor authors it like the wheel ("Saida de
  energia" + the variables modal), warns about unbound boilers, and its palette icon is
  boot-generated (`boilerTexture.ts`) — the runtime never draws the sprite.
- `npm run playtest -- caldeira` guards: cold boiler = dead grid = frozen arm; lit campfire →
  pressure → circuit → the arm works; extinguish → coast holds, then opens; a lit ground torch
  heats and its burnout cools. `caixa-placa` and `braco` remain the circuit regressions.

## Power wires (`wire`) — current becomes geography

`src/game/objects/WireObject.ts` + `render3d/wireTexture.ts`. Before wires, energy was a named
variable — a bus with no body. The wire makes the grid PHYSICAL: the author lays cable props
tile by tile from a producer to the consumer, and current is a per-frame flood-fill over
orthogonally adjacent wires (`GameScene.updateWireEnergy`), seeded by every producer that is
GENERATING right now (boiler with steam, turning wheel, pressed plate). A one-tile gap is an
open circuit — which is exactly what makes the cable a puzzle piece and not decoration.

- **The shape is never authored.** Seven forms (vertical, horizontal, four elbows, junction),
  resolved from the neighbours — other wires and the grid's machines — at boot in game and live
  on the editor board (`EditorScene.wireShapeAt`): painting the path IS the authoring, the same
  rule that gives the arm its direction frame. Textures are boot-generated pairs per shape:
  the dark cable base, plus a yellow energy core drawn additively on top only while the wire is
  LIVE (a pulsing glow — current is a living thing, the bombSpot's grammar).
- **A wire beside a machine converts it to wired mode.** An arm touching ANY wire is powered
  only by a live wire (OR the wireless variable, if it also has one); with no wire nearby the
  old behavior stands (variable-gated, or legacy self-powered when unbound). Wires don't need
  variables at all — a boiler with no variable still energizes its adjacent cables.
- Wires never block (a floor cable — the hero steps over it) and never burn (rubber is not in
  the fuel graph). Current has no memory: the live set is derived from sources every frame;
  what persists is the producers' physics (pressure, spin), never the wire.
- `npm run playtest -- fios` guards: shapes born from neighbours (h/nw/v/se), a wired unbound
  arm freezing on a dead grid, the path lighting yellow end to end while an isolated cable
  stays dark, cargo moving on cable power alone, walkability, and full shutdown when the
  source dies.

**The battery (`battery`/`batteryFull`) — electricity's portable vessel.** The stick carries
fire, the bucket carries water, the battery carries CURRENT — the item that lets energy cross
where no cable can be laid (a river in the hero's hand, a wall in the arm's claw). Charge the
empty one by STEPPING on a LIVE wire while holding it (a dead wire charges nothing — carregar
ficou no passo porque ganhar carga nunca é algo que se faça sem querer e se perca); com a cheia na
mão, o botão B contra um cabo MORTO a ENCAIXA naquele tile (um cabo já vivo não rouba uma carga de
que não precisa). The grounded battery is a SEED for the
flood-fill, draining ONLY while feeding (`BATTERY_FEED_MS`, ~20s of grid uptime) — in the hand
it is stable, away from cables it waits intact. The charge TRAVELS with the item through every
hand-off (ground → hand → ground → the arm's claw, `heldBatteryChargeMs`/`carriedCharge` — the
electric twin of torch fuel), so pick-up-and-redock never refills it. Spent, it dies into the
empty shell in place (nothing evaporates) and the island goes dark. Sprite Factory art
(`battery.png`, empty/charged window in the wire's gold); the empty battery is authorable as a
pickup. `npm run playtest -- bateria` guards the whole arc: dead wire refuses, live wire
charges, the dock gesture empties the hand, an ISLANDED net lights from the grounded battery
and its arm hauls cargo, partial charge survives the pickup cycle, and the spent charge leaves
the shell.

**The electronic gate (`electronicGate`) — power must stay on.** A gate is a physical wired
consumer: at least one adjacent cable must be LIVE to raise it. It has no wireless/variable mode;
an unwired gate is deliberately fail-closed. Losing the last live cable starts closing it in the
same frame, so a pressure plate, generator coast or battery charge can hold a passage only for as
long as that source really lasts. Collision follows the visible clearance: the tile stays solid
through the lower poses and becomes walkable only at the fully raised pose.

The body is one 16x16 `Billboard3D`, not a Three.js model. Sprite Factory owns eight frames in
`electronic_gate.png`: four grille heights in unpowered/powered banks; the lamp changes from dark
to the shared circuit green and the adjacent cable supplies the yellow live line. Animation swaps
whole pixel-art poses (no smooth scaling/fading). The open billboard uses `depthLayer: 'ground'`
because the hero can occupy its tile. `npm run playtest -- portao-eletronico` covers editor
authoring, dead-grid collision, intermediate frames, live opening, automatic closing and re-open.

## The swing gate (`swingGate`) — the lock with no key

`src/game/objects/SwingGateObject.ts`. The locked door's twin, minus the lock: same ironwork
(the art is `locked_door.png` with the keyhole plate replaced by the bars running behind it),
no key, and it opens by itself when the hero bumps it. **Unless something is standing on the
tile behind it** — a swing leaf needs room to swing, so a tuft of tall grass back there jams it.
It shoves, catches and settles back, and stays shut.

This is the one barrier in the game that breaks the rule stated at the top of the fire section:
every other obstacle is a lock with exactly one key. Here there is no item to find — **what opens
it is changing the far side**, and the far side is by definition where the hero cannot go. So it
only has answers when paired with the things that act at a distance: fire, and the robotic arm
that carries a lit graveto across a line the hero can't cross.

- **The refusal must not be the locked door's shake.** That shake is the game's word for "this is
  solid, forget it" — and this gate is not refusing, it is *trying*. So the leaf actually starts
  to swing (the sprite narrows ~12%), hits what's behind it and springs back, twice. The player
  has to see the leaf MOVE to understand the problem is on the other side and not in their hands.
  The two SFX are the same hinge with different endings: `playGateSwing` opens into clear air,
  `playGateStrain` is that same creak cut short by a dull thud.
- **"The other side" is measured from the bump direction, not from an authored rotation.** The
  gate opens away from whoever arrives, so it works from either side and the author never has to
  get a facing right when placing it.
- **`GameScene.isTileOccupied` is shared with the crate push, on purpose.** Both ask the same
  question — "is there anything at all here?", which is wider than "is it solid": an item lying
  on the ground is not solid (the hero walks over it) but it stops both a crate and a leaf. Two
  copies of that list were the reliable way for the two to disagree a month from now.
- `npm run playtest -- portao-de-bater` builds and solves the whole puzzle the piece exists for:
  a wall with the gate at one gap and the arm at another, grass behind the gate, the hero hands
  the arm a lit graveto, the fire walks the grass, and the same bump that only rattled now opens.

## The moonflower (`moonflower`) — ONE plant drawn nine times

`src/game/objects/MoonflowerObject.ts` + `spritefactory/sprites/moonflower.mjs`. A night-blooming
flower over a chokepoint: a shut BUD (it blocks) while a flame burns within `MOONFLOWER_LIGHT_TILES`
(~2.6), an open petal-BRIDGE (walkable, faintly bioluminescent) once the area goes dark. Reversible
— bring fire back and it folds shut again. It is the only barrier whose key is the *absence* of
something.

**The flame that shuts it can be the one in your HAND** (`GameScene.updateMoonflowers`). Three count,
and they are the same fire seen in three places: the lit campfire, the hero's lit TORCH, and a lit
graveto lying on the ground (the torch he put down, or the one an arm delivered). The torch is the
only moving light source in the game, and it is what turns the flower from a piece of the map into a
piece the *player* operates: walk at a petal-bridge with fire in hand and it folds shut before you
reach it, so crossing costs leaving the light behind. **Lava is deliberately not on the list** — it
never goes out, so a flower planted by the pit would be a lock with no key, and level-1 already has
one (the flower at (8,6) has lava 2 tiles away). The fire that shuts a moonflower is always a fire
someone can douse or carry away.

**The two states are one drawing, not two drawings that resemble each other.** They used to be two
independent procedural sprites — a green side-on teardrop and a pale top-down rosette — sharing no
palette, no petal count and no silhouette, so the pair read as two objects swapping places. Now a
single parametric function (six petals on a receptacle on a stem) is evaluated at nine openness
values and dumped into one sheet. "Closed" and "open" cannot drift apart, because there is nothing
to keep in sync: they are the same drawing at `t = 0` and `t = 1`. **Ask this of any prop with
states** — if two poses need a rule to stay related, they will stop being related.

- **The sheet is split into two BANKS because the game draws the flower in two geometries**, and
  that split is not cosmetic: the shut bud is an UPRIGHT billboard (volume + a cast shadow, so it
  reads as an obstacle) and the open bloom is a FLAT quad on the `ground` depth layer (the hero
  stands on it). Frames 0–4 are standing, with the camera's projection **baked into the art**
  (`DEPTH_UP` = camHeight/camBack, the same conversion the robotic arm computes at runtime); frames
  5–8 are plain plan views, which the lying quad's own geometry foreshortens. The cut sits at
  `MOONFLOWER_FRAMES.handoff` — the last instant the near petal is still in the air.
- **The banks CROSS-DISSOLVE, and that is why both bodies carry a lowered `alphaTest`.** At the lit
  default (0.5) a fading sprite pops out of existence instead of fading. The seam does not show
  because both sides draw the same flower at the same instant; the lying quad also fades in
  slightly ELEVATED and settles (`LAND_ELEV`), which is what the petals are actually doing.
  Both shapes need a stand-in in `prewarmShaders` — `alphaTest` reaches the program's cache key,
  and the lying body is born hidden, so `compile()` (which walks only VISIBLE objects) never sees
  it and the first bloom of the run would pay for the link.
- **Openness travels at a RATE, never on a tween.** One number moves toward its target at a speed
  that depends on where it already is, so a reversal is free: light a fire halfway through the
  bloom and the petals fold back from exactly where they were. Two tweens would have to be killed
  and re-aimed, and the flower would jump to a pose belonging to the other animation. The two
  curves are the animation's whole feel — opening eases in and out (a flower does not snap, ~1.4s),
  closing HESITATES at full bloom and then whips shut (~0.9s), which is what makes the directions
  read as two events instead of one clip played backwards.
- **Collision follows the ART, not the trigger** (`WALKABLE_AT` = 0.78): the tile is still a wall
  when the flower is half open, and only opens once the petals are on the ground — the electronic
  gate's rule. Closing crosses the same line immediately, so it blocks again the moment it starts
  folding.
- Juice, all of it mesh-and-tween (nothing may add a point light at runtime): pollen motes exhaled
  at the moment the petals break apart, a halo that overshoots on arrival then breathes, a settle
  spring at both ends, a tiny world shake as the petals land / slam shut, wind sway on the closed
  bud, and two synthesised SFX built like the swing gate's pair — one gesture, two endings (air
  rising into a bell; the same air descending into a dull slap).
- **`shake()` sets a counter, not a tween.** `render()` owns the bud's angle every frame for the
  wind, so a tween on the same property is overwritten and the bump is never seen.
- The proximity test lives in `GameScene.updateMoonflowers`, called from `update()` and **not** from
  `renderProps()` — which `reprojectStatic()` also calls, and a dialog pan must not advance a bloom.
- `npm run playtest -- flor-da-lua` authors the fixture in `/lab` and asserts the claim the way it
  has to be asserted: it asks the RENDERER which sheet each of the two bodies is drawing from. Plus
  the lock (bare-handed, the bud refuses), real intermediate poses in both banks, a frame where both
  bodies are on screen at partial alpha, collision still blocking past half-open, and the fold back.
  The torch is checked as a RADIUS and not as an item: the hero lights it 4 tiles out and the bridge
  stays open, he walks in and it shuts in front of him and refuses the crossing, a second flower off
  the path never moves (without that one, "torch lit = every flower shut" would pass), and dousing
  the torch where he stands reopens it.

## The portal crossing — the one animation told by two scenes

Stepping into a `levelPortal` used to be a 620ms fade to purple. Now it is four beats, and the
thing that makes it structurally different from every other effect in the game is that **a
`scene.restart()` happens in the middle of it**: the suck and the tunnel run in the OLD level's
GameScene, the fall runs in the NEW one, and those are two different objects with a dead world
between them.

1. **A sucção** (`GameScene.playPortalSuck`, 900ms). The hero is already standing ON the portal
   tile when `handleTileEntered` fires, so there is nowhere to drag him: he is pulled *in* where
   he stands — rises, spins, shrinks to nothing. He vanishes by SIZE, never by alpha alone, which
   would read as a ghost instead of as swallowed. The portal's particles reverse (`setSwallow`):
   at rest they rise and it exhales, inverted they fall inward and it INHALES.
2. **O vazio** (620ms). The portal spinning alone in the dark it just made. Without the pause the
   trip starts on top of the hero disappearing and neither beat is seen.
3. **O túnel** (`render3d/PortalTunnel.ts`). Owns its own canvas, renderer and rAF loop at
   `z-index: 3` — it has to, because World3D and the Phaser scene are both destroyed underneath
   it. Low-res backing store stretched with NEAREST, sized so one tunnel pixel matches one pixel
   of the world's ART (`tileScreenSize() / 16`): the trip is the only non-16px frame in the game
   and it must not read as another game's screen. Wall = an open cylinder seen from inside with a
   generated column texture scrolling along its axis; streaks = instanced quads rotated so their
   normal points at the tunnel axis (a quad that does not rotate goes edge-on exactly when it
   passes the side of the screen). It starts BEFORE the restart so the second WebGL context is
   paid for behind a screen that is already covered.
4. **A queda** (`GameScene.playPortalArrival`). The world builds behind the overlay, then the
   overlay leaves — never a frame of half-built world. The fall starts INSIDE the exit flash, not
   after it, or the level would open on a hero hanging motionless in the air. `Quad.easeIn`,
   because falling accelerates; the reflex `easeOut` makes him float down like a feather. The
   level title card waits for his feet to touch.

- **`setPendingPortalArrival` (`runtime/portalTransition.ts`) is the whole bridge across the
  restart** — one boolean, consumed on read so a death/restart never drops the hero out of the sky.
- **The suck eats the world's LIGHT, and only one knob does that.** `params.ambient`/`moon` kill
  the sources, but in a lava level the emissive floor IS the light and the frame does not move
  (measured: 45.6 → 45.2). `World3D.setWorldFade` (the death drain) finishes it in the post.
  **`params.exposure` is inert here**: the world is drawn into an EffectComposer render target and
  three only applies tone mapping when drawing straight to the canvas — the same bound-target trap
  `prewarmShaders` documents. A test that watched the knob passed on an effect that did not exist.
- **The hero's view state must be RESET on create** (`resetHeroView`). Phaser reuses the scene
  instance across `restart()`, and `hero` is a `readonly` field — so the scale-0.001 the suck left
  behind arrived in the next level and the hero was born invisible.
- `npm run playtest -- portal-travessia` guards all four beats where each happens, including the
  tunnel surviving the restart, and measures the darkening on the SCREENSHOT (see the comment on
  `shotLuma` for the two easier measurements that lie).

## O combate que passou a existir — oito peças, e a primeira explica as outras sete

O jogador disse que o combate não estava gostoso, e a auditoria contra o `A Link to the Past`
([enemy design](https://www.gamedeveloper.com/design/enemy-design-in-link-to-the-past),
[a primeira sala](https://www.gamedeveloper.com/design/first-combat-of-link-to-the-past),
[dano e i-frames](https://spannerisms.github.io/damage/)) e contra o guia de combate em ARPG do
[howtomakeanrpg](https://howtomakeanrpg.com/r/a/realtime-combat-design.html) achou o motivo em uma
linha de código: `MELEE_DAMAGE.sword = 999`.

**Não havia combate — havia execução.** Todo corpo do jogo morria no primeiro acerto, e por isso
nada do que existia em volta chegava a acontecer: o telegrafo de 500ms que cada espécie carrega
nunca era usado (o bicho morria antes de armar), o atordoamento não comprava nada (não havia o que
atordoar), o arremesso não abria espaço (não havia corpo para afastar) e a lâmina rodopiante não
resolvia estar cercado (encostar já resolvia). A camada de *juice* — hitstop, tremor, faísca,
buffer de entrada — estava boa o tempo todo. O que faltava era o **oponente**.

As oito mudanças, e cada uma só faz sentido depois da anterior:

1. **A espada dá 2 de dano.** A caveira (3 de vida) leva duas espadadas, o slime grande (6), três.
   O graveto **aceso** continua matando de um golpe e agora é a única coisa que faz isso — fogo é
   recurso que se gasta (o combustível corre, a chama entrega sua posição no escuro, a mão fica
   presa nele), então ele pode comprar o que a lâmina deixou de dar.
2. **O corpo ganhou i-frames** de 450ms (os ~32 frames do original). O golpe que cai dentro da
   janela **resvala** — anel pálido, sem dano —, porque um arco de seis tiles a cada 260ms sem isso
   é uma serra elétrica. A melhoria "ataque mais rápido" da loja parou de multiplicar golpes por
   gesto (todos cairiam na mesma janela) e passou a comprar **cadência**, que é o que o nome diz.
3. **O golpe armado do inimigo deixou de ser cancelável.** Bater nele zerava o windup; com dano
   real, trancar o bicho em interrupção viraria a estratégia dominante do jogo inteiro. A resposta
   ao telegrafo voltou a ser a que ele sempre prometeu: **sair do tile mirado**.
4. **...e enquanto arma, ele guarda a frente** (`guardsAgainst`). É a aula que o soldado da primeira
   sala do LttP dá sem texto: de frente bate na guarda, contornando entra. Só na janela do
   telegrafo — guarda permanente viraria um enigma de ângulo — e só em quem tem frente: a gosma é
   uma bolha e o morcego é um borrão, e os dois devolvem `guardsWhileWindingUp = false`.
5. **O bestiário andou mais rápido.** O herói dá um passo a cada 150ms e a caveira dava um a cada
   850 — **5,7× mais lenta**, isto é, fugir era sempre grátis e nunca havia motivo para lutar.
   Agora ela anda a 520ms (~3×), a aranha a 500, o morcego a 270. A regra que não se quebra: nunca
   mais rápido que o herói, ou não existe desengajar.
6. **Atacar prende os pés por 160ms** (o giro, 260). Dava para golpear em pleno passo, na velocidade
   máxima, então nunca havia um instante em que estar perto custava caro. A raiz impede *começar*
   um passo e nunca congela um em curso — parar o herói em cima de uma aresta seria um soluço.
7. **O escudo, e ele é a direção em que o herói olha.** Não havia verbo defensivo nenhum. Ele é
   intrínseco (o herói tem uma mão só, e um escudo que a ocupasse custaria a tocha e o machado) e
   **só apara tiro**: se aparasse golpe de corpo, encarar seria invencibilidade contra metade do
   bestiário, parado. Contra corpo a resposta é sair do tile; contra tiro, encarar. Dois problemas,
   duas respostas, e nenhuma resolve a outra. A guarda cai enquanto o herói ataca.
8. **O feixe da espada com vida cheia foi construído e ARRANCADO no mesmo dia**, a pedido do
   jogador. A ideia era a do original — com a vida cheia a espada dispara, ferido ela para —, e
   num jogo sem HUD ela é sedutora: a barra de vida vira a arma. O que ela custa é a leitura do
   combate que as sete peças acima acabaram de montar: um tiro grátis a cada golpe empurra o
   jogador para longe, e tudo aqui — a área 2×3, o arremesso, a guarda frontal, o escudo que só
   apara tiro — existe para ensinar a chegar perto e escolher o lado. Fica registrado para não ser
   reinventado sem essa conta: **a espada deste jogo não atira.**

`npm run playtest -- esgrima` cresceu para cobrir as leis novas (dano real, i-frames, guarda,
escudo e o encontrão) e `combate` deixou de contar cadáveres: ele guarda o **contrato do botão** —
o A alcança o tile da frente sem encostar —, e isso agora se prova no dano.

### E o polimento, que é onde as regras viram jogo

As sete peças acima mudaram o que o combate É; nenhuma delas mudou o que ele MOSTRA, e uma regra
que o jogador não vê não existe. Cinco correções, todas em cima do que já estava lá:

- **Os i-frames piscam.** A troca de textura de dano durava 150ms e a invulnerabilidade dura 450 —
  nos 300ms de diferença o corpo era indistinguível de um corpo que aceita dano, e o jogador só
  descobria isso depois de já ter apertado o botão. O alpha agora alterna a cada 80ms pela janela
  inteira, derivado do próprio relógio (nada de tween novo por golpe) e escrito só na TROCA de
  fase, porque `apply()` do billboard reescreve o mesh a cada `setAlpha`.
- **O telegrafo mostra o TILE.** Ele avisava de três maneiras — clarão, pose recuada e som — e
  nenhuma dizia *onde*, que virou a única informação que importa desde que bater deixou de
  cancelar. Um anel deitado FECHA sobre o tile mirado no tempo exato do windup: quando fecha, bate.
  Fechar e não abrir é a diferença entre um relógio e um rastro.
- **A guarda deixou de falar a língua do resvalo.** Os dois chamavam `spawnDeflect`, e são lições
  opostas: o resvalo diz *espere*, a guarda diz *contorne*. A guarda ganhou faíscas quentes na
  BORDA do corpo, no lado de onde o golpe veio — a posição é a informação.
- **O herói investe ao golpear.** O corpo dele não fazia nada: a lâmina varria e ele ficava parado,
  então os 160ms de raiz liam como travamento. Um oitavo de tile para a frente, saindo em 60ms e
  voltando em 130 (`HeroView.lungeX`, campo próprio — o `x/y` de tela pertence ao arremesso de dano
  e os dois brigando pelo mesmo campo seria um bug que só aparece ao apanhar no meio de um golpe).
- **Encurralar paga.** O arremesso barrado por parede caía no mesmo recuo elástico de um empurrão
  qualquer — a jogada boa era a mais silenciosa do jogo. `shove` passou a devolver
  `'moved' | 'slammed' | 'immovable'` (a distinção importa: torreta e zora não *têm* parede, só não
  andam) e o encontrão ganhou hitstop, tremor fundo e poeira no ponto de impacto. O jogo tem a
  melhor parede possível para isto, que é a luz da fogueira.

### A segunda passada, e as três acusações que o código derrubou

Uma auditoria feita para achar o que ainda faltava de polimento listou cinco coisas, e **três
estavam erradas** — o que vale registrar porque cada erro veio de supor em vez de ler:

- "Os sons de combate não variam" — variam. `playSample(key, jitter, volScale)` recebe jitter em
  SEMITONS no segundo parâmetro, e `playEnemyHit` já sai com ±0,9. O que não variava eram os sons
  **sintetizados** (o aparo e o encontrão, escritos horas antes), que não passam por ali.
- "Sete espécies morrem sem deixar nada" — a gosma já deixava a poça que seca, arte própria dela.
  Eram cinco.
- "Só a caveira mostra barra de vida" — **ninguém** mostrava: a barra tinha sido removida por
  design e o esqueleto ficou, alocando uma `Graphics` por inimigo e limpando-a todo frame para
  nunca preenchê-la. O `healthBarVisible` era um flag que ninguém lia.

O que de fato foi feito:

- **A piscada do herói passou a sair da janela.** Ela era `repeat: 5` de 80ms (960ms) contra uma
  invulnerabilidade de 1500 — nos últimos 540ms ele parecia vulnerável e não era, o mesmo defeito
  que tínhamos acabado de consertar no inimigo. Agora a contagem é derivada de `PLAYER_INVULN_MS`:
  um número só, e a piscada não pode mais mentir sobre ele.
- **Morrer deixa marca em todo corpo morto.** `die()` liga `corpseMark`, `despawn()` não (o escuro
  reclamando os seus não é uma briga a registrar), e o `EnemyManager` enterra no frame em que o
  corpo termina de sumir. De quebra, a caveira perdeu o caminho PRÓPRIO que tinha para a mesma
  coisa — um callback recebido no construtor, de quando ela era a única espécie com ossada. Duas
  rotas para um mesmo fato é como uma delas envelhece errada.
- **A barra de vida morta foi deletada** e substituída pelo que ela deveria ter dito: o corpo
  ESCURECE conforme perde vida. `woundedShade(base)` recebe a cor base e a escurece, em vez de
  devolver um tom absoluto — o mago tem tom frio permanente (a arte é dividida com o NPC mago) e um
  tom absoluto apagaria a identidade dele justo enquanto ele apanha.
- **Os sons sintetizados ganharam ±4% de altura**, que é o equivalente do jitter que as amostras
  já tinham. Aparo e encontrão são, por definição, sons que se repetem muitas vezes na mesma briga.
- **A guarda passou a ser anunciada.** Ela existia só como punição: o jogador descobria o lado
  fechado gastando um golpe nele. Agora um risco de luz acende na borda guardada durante o
  telegrafo, na mesma paleta das faíscas de aparo — a mesma coisa dita antes e depois.

E uma incoerência que a auditoria achou de brinde: **a conjuração do mago ainda era cancelável por
dano**, sobrevivente da lei que o windup do andarilho tinha acabado de perder. Com i-frames e dano
real, ele seria o corpo mais fácil do bestiário de anular parado na frente — justamente o inimigo
que existe para obrigar o jogador a se mover.

### A terceira passada: a caveira não tinha entrado na reforma

O mago era o **segundo** sobrevivente da lei antiga. O primeiro — e o único que importava de verdade
— era a caveira, e ela não foi esquecida por descuido: ela é o único corpo do bestiário que **não é
um `WalkerEnemy`**, e o telegrafo inteiro tinha sido escrito dentro daquela classe. Toda a reforma
passou por cima dela.

O inimigo que o jogador mais encontra, o que **ensinou** o telegrafo, e o único do jogo que:

- ainda tinha o golpe armado cancelável a pancada (a estratégia dominante que a reforma removeu);
- nunca guardava a frente (`guardsAgainst` era o `false` da base);
- não marcava o tile mirado, então o aviso dela não dizia *onde* — a única informação que importa
  desde que bater deixou de cancelar;
- não acendia o brilho da guarda;
- reportava `windingUp: false` no `gameDebug`, o que fazia o `esgrima` esperar oito segundos por um
  estado que nunca chegava e cair nas duas asserções seguintes;
- voltava ao **tom cheio** ao armar (`clearTint` em vez de `restoreTint`), apagando o `woundedShade`
  — a leitura de vida — justamente no instante em que ameaça.

A correção **não** foi fazê-la herdar do andarilho: o cabeçalho daquela classe explica, e continua
certo, por que a fissura de 3s, o laço da placa e o desmanche não cabem num molde comum. Foi mover o
telegrafo para onde ele sempre pertenceu — o `EnemyBase` —, que é o mesmo raciocínio que já tinha
tirado a ossada própria da caveira: **duas rotas para o mesmo fato é como uma delas envelhece
errada.** As sete espécies passaram a ler a mesma máquina; `WalkerEnemy` encolheu 70 linhas e agora
só decide *quando* armar e *por quanto tempo*.

E no caminho apareceu um defeito que só existia porque o arremesso é novo: **o golpe armado acertava
por cima de um vão.** O `tickHitstun` sai do update antes do bloco do windup, então um corpo atingido
no meio do telegrafo é jogado um tile para trás, fica atordoado 300ms, e cobra o golpe de **dois
tiles de distância** quando volta a si. `tickWindup` passou a exigir que o tile mirado ainda esteja
ao alcance do corpo; fora disso, `whiff`. (A caveira escapava disso por acidente — porque cancelava
o próprio windup, que era o outro bug.)

### E o resto da revisão, que é tudo consequência de a reforma ser nova

- **`sweepArc` contava recusa como acerto.** `landed` subia mesmo quando o golpe resvalava nos
  i-frames ou batia na guarda, então o próximo corpo do mesmo gesto chegava como ECO — sem som de
  acerto, sem a piscada do herói e sem o baque da morte. No giro, que varre oito tiles, o baque de
  uma morte era engolido com frequência. `strikeEnemy` agora devolve se o golpe **landou**.
- **A carga do giro sobrevivia à pausa.** `scene.pause()` adormece o plugin de teclado: soltar o A
  com a subtela aberta perde o `keyup`, e `attackHeld` ficava preso em `true` para sempre — o sino
  de "carregada" tocava sozinho ao voltar e o herói soltava faíscas indefinidamente. É a mesma
  armadilha que o `pressAttack` já documentava e defendia só do lado do *aperto*.
- **O botão B não pagava nada pelo golpe.** A raiz e a investida moravam só no A, e a exceção caía
  justo no golpe mais forte do jogo: o graveto **aceso** é a única coisa que ainda mata de uma vez, e
  era também a única que se dava em velocidade máxima de caminhada. A raiz entra só no ramo que bate
  numa criatura — prender os pés para apanhar um graveto seria o defeito oposto.
- **O golpe de item só era desenhado quando acertava.** O arco subiu para antes das duas recusas: um
  B recusado mostrava faísca e nenhuma mão se mexendo. A faísca explica o que aconteceu; ela não
  substitui o gesto de ter atacado.
- **A carência de virar-se era um relógio solto.** Virar-se para a caveira ao norte comprava 180ms de
  esbarrão de graça no slime a leste. Ela passou a lembrar **em quem** foi gasta — um toque humano
  acontece contra um corpo só.
- **`shove` matava a pose do telegrafo.** O `killTweensOf(this)` apagava o agachamento, então um
  corpo empurrado no meio do aviso ficava em pé e relaxado enquanto o anel no chão continuava
  fechando: as duas metades do mesmo aviso discordavam. Assentado o solavanco, ele volta a se
  agachar pelo tempo que sobra.
- **`despawn()` não desfazia a piscada dos i-frames** — `die()` já tinha essa lei ("a piscada não
  pode vazar para a morte") e o desmanche não. Um corpo despejado no vale da piscada começava a
  derreter em alpha 0.35.
- **As faíscas da carga e o anel do giro ancoravam no tile LÓGICO.** O `swingAnchor` já passava pelo
  `visualWorld` de propósito (a posição lógica pula para o tile de destino quando o passo começa);
  esses dois não, então carregar andando punha o brilho até um tile à frente de quem brilhava.
- **O lingote de ferro não batia**, sozinho numa lista em que a pedra, o carvão e a bateria batem
  1.5 com o comentário "as good as any other blunt tool".
- **O `EnemyManager` alocava um closure por corpo por frame**, e cada consulta dele um `some` com
  outro. Um closure por `update` e uma varredura em `for` resolvem. O que **não** dá para fazer é um
  índice tile→corpo por tick: os corpos andam DURANTE o laço (o inimigo *i* dá um passo e o *i+1*
  consulta), e um índice velho deixaria dois empilharem.
- Saiu junto o `setMouseWalkEnabled` do `PlayerMovementController` — código morto desde que o
  revólver foi arrancado, com três parágrafos de docstring sobre uma arma que não existe.

`npm run playtest -- esgrima` ganhou a asserção que faltava e é o portão disto: ele cobra a guarda e
o compromisso **na caveira**, que é onde a unificação pode quebrar de novo.

### O polimento, e o achado que estava escondido no golpe mais importante do jogo

Oito coisas, e a primeira é a que dói mais quando se vê:

- **O golpe que MATA era o único que não movia o corpo.** Todo golpe que não mata arremessa um tile
  (`shove`); o fatal chamava `triggerKnockback`, que sai na primeira linha se o corpo já morreu — e
  mesmo que não saísse, `render()` para de escrever a posição do billboard depois da morte, então o
  deslocamento não teria por onde aparecer. O melhor gesto do jogo deixava a caveira inchando e se
  desmanchando **de pé, exatamente onde estava**. Agora a morte tem `deathFling`, que anda na
  posição do próprio billboard (que é o que o desmanche já usa). A bomba ganhou o mesmo sopro: ela
  era a única coisa do jogo com raio de ação e sem empurrão.
- **Duas das três recusas eram MUDAS.** Só o aparo tinha som. O resvalo nos i-frames e o golpe num
  corpo que ainda sai do chão não faziam ruído nenhum — o jogador aperta, vê a lâmina passar por
  dentro do bicho e não ouve nada, o que lê como **input perdido** e não como recusa. `playBladeGlance`
  é o oposto do tim do aparo: ali houve encontro, aqui houve escorregão — um raspão curto e abafado.
- **Nenhuma recusa tinha hitstop.** A lâmina atravessava uma guarda erguida com menos resistência do
  que atravessava o ar. Aparar é aço contra aço (55ms), resvalar é a lâmina escorregando (28ms), e os
  dois ficam abaixo do hitstop de um acerto: recusar nunca pode pesar mais que conectar.
- **A faísca do acerto não tinha direção** — 360° uniformes, então um golpe do oeste e um do leste
  desenhavam a mesma estrela. Agora ela sai num leque para fora do golpe; o golpe que mata abre o
  leque quase até o círculo, porque ali não há mais direção a ensinar.
- **O golpe errado do bicho não marcava o lugar que ele mirou.** O anel fechava sobre um tile por
  meio segundo prometendo um golpe, e quando ele saía não acontecia nada ali: a esquiva só era
  desenhada no corpo. A poeira rasteira no tile mirado é o que fecha o laço — o golpe caiu, caiu ALI,
  e você não estava lá.
- **Quatro espécies não reagiam em cor ao dano.** `hurtTexture` só existe na caveira, no morcego e no
  mago; aranha, gosma, torreta e zora caíam num `restoreTint()` que, com a vida cheia, não muda um
  pixel. A resposta não podia ser acender (a lei do bloom), então é ESCURECER: um mergulho de valor
  de 110ms que funciona em qualquer corpo e não pede arte nova.
- **Bater na torreta apagava o aviso de que ela ia atirar** — `restoreTint` limpava o `CHARGE_TINT`,
  e o leque saía de uma máquina que parecia adormecida. Um aviso que o jogador desliga batendo é pior
  que aviso nenhum: ensina que bater é seguro justamente no instante em que não é.
- **A lâmina não reagia ao conectar.** O hitstop já CONGELAVA o arco no meio do gesto — a pose parada
  existia e faltava a cor. Um lampejo quente no sprite da arma é o *impact frame* clássico, e aqui
  sai de graça: o arco é um sprite 2D do Phaser por cima do canvas, não um billboard `emissive`, então
  a lei que proíbe acender um corpo atingido não alcança a arma.

Duas notas de método que valem mais que os itens: o `flashHit` guarda a cor da lâmina num campo
próprio em vez de ler `tintTopLeft` de volta do Phaser (depender da representação interna do motor
para uma ida-e-volta é o que uma versão menor quebra em silêncio), e as duas vozes do gesto — a do
acerto e a da recusa — têm **orçamentos separados** em `sweepArc`, ou um resvalo no primeiro tile do
arco cala o som da morte no segundo.

## A caveira ganhou um osso, uma ossada de verdade e uma morte própria

Três pedidos do jogador, e os três caem na mesma espécie — a que o jogo mais mostra e a que menos
tinha para mostrar.

### O osso na mão (`BoneClub.ts`, `undead-bone.png`)

A caveira telegrafava o golpe de três maneiras (clarão, pose recuada, anel fechando no chão) e batia
com **nada**. O corpo que ensinou o combate deste jogo era o único que acertava de mão vazia.

Agora ela empunha um fêmur, e o gesto é o do herói do outro lado da briga: ao armar, o osso sobe
atrás da cabeça do lado oposto ao alvo; quando o golpe sai, ele desaba por cima do tile mirado e
**atravessa**. Ele bate no vazio quando o herói esquiva, de propósito e pela mesma razão que o arco
do herói sai mesmo sem acertar — é assim que o jogador vê que sair do tile *funciona*.

Duas decisões que não são óbvias:

- **É um `Billboard3D`, e não o caminho do herói.** O arco do herói é um sprite 2D do Phaser
  desenhado POR CIMA do canvas 3D: não é ocluído por nada e precisa que a cena lhe conte quanta luz
  existe onde ele está. Isso é aceitável para quem está sempre no centro da tela e sempre na frente
  de tudo; para um inimigo não é — ele pode estar atrás de uma árvore, e um osso desenhado por cima
  disso denunciaria a trapaça na hora. Como billboard ele é iluminado e ocluído de graça.
- **O punho ORBITA o corpo em vez de a arma girar em torno do punho.** O billboard gira em torno do
  próprio centro (`setOrigin` é no-op por construção), então não há pivô a mover — é o osso inteiro
  que anda numa circunferência em volta da caveira, girando junto para continuar apontando para
  fora. E é por isso que a arte tem **nó dos dois lados**: girando pelo centro, um osso com nó de um
  lado só passaria metade do arco de ponta-cabeça.

A arma segue a posição **desenhada** do corpo (`this.sprite.x/y`, que já traz recuo e deslize
somados), nunca o tile lógico — é o mesmo defeito que o `visualWorld` resolveu no arco do herói. E
ela escurece junto com quem a segura (`woundedShade`): um osso claro na mão de uma caveira quase
morta seria a única peça da silhueta mentindo sobre o estado dela.

### A ossada borrada, e o diagnóstico que estava errado

A marca no chão saía **borrada**, e a leitura óbvia era culpar a arte: é a frame 27 do
`forest_tile_set`, duas cores, e 16 pixels ampliados três vezes. Foi o que eu concluí, e desenhei
uma substituta na Sprite Factory. **Estava errado, e o jogador mandou usar a arte dele.** Ele tinha
razão, e a causa real é bem melhor:

O `forest-tileset` é a **única textura do jogo carregada em `LinearFilter`** (`textures3d.ts`), e
isso é deliberado e está documentado lá: a malha do terreno busca o centro de cada texel por conta
própria (`zhTexelUv`) e só deixa o filtro agir na costura entre dois tiles, que é exatamente onde
ele conserta a escadinha da perspectiva de graça.

**Um billboard não faz essa conta.** Ele amostra o atlas direto — então a ossada, o único *sprite*
do jogo desenhado a partir do tileset, era também o único desenhado borrado. Nada no PNG denunciava
isso, e trocar a arte teria "consertado" o sintoma deixando a causa de pé para o próximo sprite que
puxasse um frame do tileset.

O conserto é a arte autorada recortada **pixel a pixel** para uma textura própria
(`environment/props/bones.png`, `ASSET_KEYS.bones`), que carrega em NEAREST como todo o resto do
jogo. Mesma arte, mesmo tamanho, mesma posição — e nítida. A substituta que eu tinha desenhado foi
deletada.

A lição de método vale mais que a peça: **"a arte é ruim" e "a arte está sendo desenhada errada"
parecem iguais na tela**, e só a segunda tem conserto que serve para o próximo caso.

### O desmonte (`undead-bits.png`, `EnemyBase.onCrumble`)

Um esqueleto tem a morte mais óbvia que existe e ela não estava sendo usada: a caveira sumia com o
gesto genérico do `EnemyBase` (incha e some girando), que serve para qualquer corpo justamente
porque não diz nada sobre nenhum.

Agora ela **se parte**: no pico do desmanche o corpo some e viram quatro peças no ar — a cabeça, o
osso que ela empunhava e dois pedaços quebrados. O gesto genérico continua rodando por baixo (é ele
que conta o relógio da remoção e solta a ossada no chão), só que num sprite invisível.

- **O gancho é `onCrumble`, e não `onDeath`.** Aquele roda no frame em que a vida chega a zero, com
  o corpo inteiro e parado; este roda no pico do inchaço, que é onde uma silhueta pode se partir sem
  que o olho perca o fio entre o corpo e as peças.
- **As peças se espalham a FAVOR do golpe** (`deathDirection`, guardada pelo `deathFling`): a
  caveira que leva uma espadada do oeste se parte para o leste. Uma explosão simétrica leria como a
  coisa tendo se desfeito sozinha, e o que aconteceu foi que alguém bateu nela.
- **O osso continua de onde a órbita o deixou**, e não do centro do corpo: a arma estava numa ponta
  do gesto, e vê-la saltar para o meio da caveira antes de voar seria o único frame falso da cena.
- **Subir e cair são dois tweens e não um yoyo**: a pancada joga a peça para cima depressa e a
  gravidade a traz devagar. Simétrico é a curva de uma bola de desenho animado, não a de um osso.

Só uma peça de arte nova precisou existir para isso — a cabeça e um osso quebrado. A terceira peça é
o próprio fêmur da arma: **o esqueleto se parte nos mesmos ossos com que batia**, e essa rima saiu
de graça.

## Catorze eventos de combate estavam tocando a rede de emergência

O `SoundManager` tem um contrato bonito: `if (this.playSample(...)) return;` e, abaixo, uma síntese
de emergência para o caso de a amostra ainda não ter decodificado. **Catorze eventos de combate
nunca tiveram amostra nenhuma** — a rede virou o som definitivo deles. São justamente os gestos mais
novos (o aparo, o resvalo, o encontrão, a lâmina rodopiante) e o bestiário inteiro que não é a
caveira: o bote da aranha, o plop da gosma, a carga da torreta, a boca do zora, o disparo, a chegada
de um corpo, a fenda no chão.

Eles vêm agora do pacote **CC0** de Juhani Junkala (*The Essential Retro Video Game Sound Effects
Collection*, 512 sons, domínio público), que por sorte já sai no formato exato do projeto: 44,1 kHz,
16-bit, mono. O importador (`tools/import-8bit-sfx.mjs`) só normaliza o pico para −1 dBFS, a mesma
convenção do único sample de terceiros que já existia aqui.

Quatro decisões que valem mais que a lista:

- **A proveniência é DADO, não commit.** A tabela `MAP` do importador diz qual som do pacote virou
  qual som do jogo e por quê. Sem ela, daqui a seis meses `guard-block.wav` é um WAV anônimo que
  ninguém sabe refazer — e o projeto já tinha essa disciplina do outro lado (`gen-sfx.mjs` guarda a
  receita de cada som gerado). Trocar um som é uma linha e um re-run. **O pacote não entra no
  repositório**: só os 14 arquivos usados.
- **A escolha foi por nome e por MEDIDA, não por ouvido** — quem montou a tabela não podia ouvir os
  arquivos. Então a regra foi conservadora: só entrou som cuja pasta no pacote nomeia o *gesto* sem
  ambiguidade (uma espada é uma espada, um laser é um tiro, um "landing" é algo pousando), e cada
  escolha foi conferida contra duração, pico, RMS e centroide espectral. Dá para verificar que o
  aparo é curto e agudo (99 ms, 1464 Hz), que o encontrão é curto e grave (93 ms, 408 Hz) e que a
  carga da torreta dura 348 ms contra uma janela de 350.
- **Quatro pastas ficaram de fora de propósito** — *High Pitched*, *Weird*, *Neutral* e *Alarms*. Os
  nomes delas não dizem que gesto o som faz, e o telegrafo do golpe (`playUndeadWindup`) é o aviso
  mais importante do combate inteiro: um som errado ali custa mais que a falta dele. Esses seguem na
  síntese que foi desenhada para eles.
- **O jitter de altura é `playbackRate`, e portanto muda a DURAÇÃO.** Para um baque de 90 ms isso é
  invisível e resolve a repetição; para um som cuja duração foi escolhida para casar com uma janela
  do jogo — a carga que acaba no frame em que o leque sai — esticar o arquivo desalinha o aviso do
  gesto. A carga da torreta e a boca do zora tocam sem jitter; a gosma, que é o som mais repetido do
  bestiário, toca com jitter largo.

De brinde, um defeito que só apareceu ao listar os eventos: **o soco tocava o som da espada.** A arma
que o herói não tem soava exatamente igual à que ele tem — de olhos fechados, estar armado e estar de
mãos vazias eram o mesmo gesto. Agora o punho tem som próprio, seco e sem metal.

### E depois a decisão de identidade foi tomada: o combate inteiro fala 8-bit

A primeira leva só tapou buracos e deixou a espinha do combate — espadada, acerto, morte do inimigo,
dano e morte do herói, o graveto aceso, a caveira irrompendo — nos sons gerados. O jogador foi
direto ao ponto: *"o combate ainda está lotado de som gerado, converta tudo."* Mais dez sons, e
agora **os 24 eventos de combate tocam amostra** (há um script de auditoria que verifica isso: todo
método de combate tem de começar por `playSample`).

Duas coisas dessa segunda leva valem mais que a lista:

- **Os importados moram em `audio/8bit/`, e isso é uma trava e não arrumação.** O `gen-sfx.mjs`
  escreve na raiz de `audio/`, e o CREDITS manda rodá-lo depois de mexer nos presets. Um som
  importado com o nome de um gerado seria apagado em silêncio na primeira regeneração — e o culpado
  só apareceria meses depois, quando a espada voltasse a soar diferente sem ninguém ter tocado em
  áudio. Separados, os originais gerados continuam intactos no disco e **voltar qualquer som é
  apagar `8bit/` de uma linha em `SAMPLES`**.
- **Três alturas para três respostas no mesmo ponto da tela.** O acerto que entra é grave (308 Hz),
  o resvalo nos i-frames é médio (640 Hz) e o aparo é agudo (1464 Hz). O mesmo cuidado separa as
  duas cargas do bestiário: a torreta a 2515 Hz e o mago a 937 — dá para ouvir *qual* das duas está
  carregando sem olhar. Isso não é sorte de pacote; foi o critério de escolha, e é o que os números
  serviam para garantir sem ninguém poder ouvir.

Três escolhas são reconhecidamente fracas e estão marcadas no CREDITS para serem ouvidas primeiro: a
água do zora (o pacote não tem água), o telegrafo do golpe (é um arquivo de *loop* tocado uma vez) e
a morte do inimigo (um som só serve caveira, gosma, morcego, aranha, mago, torreta e zora).

### E depois o pacote inteiro estava errado: o combate virou fantasia

O jogador ouviu o resultado e acertou o diagnóstico numa frase: **"esse pacote tem sons futuristas
estranhos."** Estava certo, e o erro era de origem. O pacote do Junkala é excelente — e é de
**fliperama/nave**: lasers, robôs, alienígenas, alarmes. Eu tinha tratado "8-bit" como se fosse um
gênero de conteúdo quando é só uma era de *timbre*, e o combate acabou com **laser** no feitiço do
mago, **laser** no cuspe do zora, **alarme de pouca vida** no telegrafo da caveira e **grito de
alienígena** em toda morte.

A fonte agora é o **"RPG Sound Pack" de artisticdude** (CC0, 192 sons) — o pacote de RPG de fantasia
mais baixado do OpenGameArt —, e a diferença não é de gosto, é de vocabulário: ele vem **arquivado
por criatura**. A caveira usa `NPC/shade` (o espectro, que é literalmente o que ela é), a gosma usa
`NPC/slime`, a aranha usa `NPC/beetle`, o mago usa `battle/spell` e o zora usa `inventory/bubble`.
Dezessete dos vinte e três sons saem de lá.

O pacote retro sobreviveu em **seis, e só nos impactos**: o pacote de fantasia tem golpe e criatura,
mas não tem *pancada* — nada nele é lâmina encontrando corpo ou corpo encontrando parede. Os seis
que ficaram são percussivos e neutros, sem nada de espacial.

Duas coisas técnicas que essa troca obrigou, e que valem mais que a lista:

- **O importador corta.** Gravação de fantasia é cinematográfica (`battle/spell.wav` tem 3,25 s) e
  as janelas do jogo têm 100–500 ms. Um telegrafo precisa acabar quando o golpe cai, então quase
  tudo entra cortado no começo (que é onde mora a carga) com 22 ms de fade — cortar uma onda no meio
  do ciclo deixa um degrau, e degrau é **estalo** tocando toda vez.
- **A normalização passou a ser por ALTO-FALÂNCIA, não por pico** — e é isso que faz dois pacotes
  soarem como um. Pico mede uma amostra só. Fantasia é gravação orgânica (transiente curto, cauda
  longa) e o retro é denso e comprimido: alinhados pelo pico, ficam **20 a 30 dB de diferença no
  volume percebido**, os dois marcados "−1 dBFS" — e foi exatamente o que aconteceu (span de 31 dB,
  com a espadada sumindo e o baque estourando). A referência virou o RMS da janela mais alta de
  150 ms, com os picos dobrados no `tanh` em vez de cortados — a mesma saturação suave com que o
  `gen-sfx.mjs` já termina cada som gerado. Depois disso a coluna `vol` do `SAMPLES` virou mixagem
  de verdade: os 23 arquivos ficam dentro de 3 dB entre si, e o número ali passou a significar
  "isto tem de ser mais alto que aquilo" em vez de "este pacote gravou mais baixo".

### E duas voltaram — o erro de trocar a régua da medida pela do significado

O jogador abriu o jogo e ouviu **"um som de explosão absurdo e nem sei do que se trata"**. Era o
chão rachando antes de a caveira nascer: `Explosions/Long/sfx_exp_long4`, **2,1 segundos**, 4,5×
mais longo que qualquer outro som do combate, disparando a cada 3,2 s de cerco na abertura de toda
partida — seguido, três segundos depois, de uma segunda explosão (a caveira irrompendo,
`Explosions/Short`).

Os dois tinham sido escolhidos por MEDIDA — grave, longo, contínuo — passando por cima do nome da
pasta, que dizia **Explosions**. A regra declarada no próprio importador ("só entra som cuja pasta
descreve o gesto sem ambiguidade") existia exatamente para impedir isso, e foi quebrada nos dois
únicos sons do conjunto que tocam antes de o jogador ter feito qualquer coisa.

Os dois voltaram para o som desenhado para eles: o nascimento para o `undead-spawn.wav` gerado
("bones grinding up through soil") e o chão rachando para a síntese — ele nunca teve arquivo, e as
três camadas dele existem para ser um rumor quase subliminar, porque o trabalho da peça é dar três
segundos de aviso **sem sustar ninguém**. Um evento sonoro grande no lugar de um aviso faz o jogador
reagir ao susto em vez de reagir ao chão.

**Este pacote não tem TERRA**, e nenhuma medição conserta um som que descreve outra coisa.

De brinde, a mesma auditoria de níveis achou o oposto: os **telegrafos eram a coisa mais silenciosa
da briga** (a conjuração do mago e o cuspe do zora mediam 10 dB abaixo do resto). Subiram. E ficou
registrado por que os sons CURTOS não foram corrigidos pelo mesmo número: todo arquivo sai com o
mesmo pico (−1 dBFS), então num tique de 46 ms um RMS baixo só quer dizer "é um tique" — corrigir o
aparo por RMS seria distorcer o único som que já estava certo. RMS só é régua honesta para som
sustentado.

## Cinco pedidos do jogador, e os dois defeitos que dois deles desenterraram

- **A fenda ficou rápida.** O telegrafo do nascimento da caveira era de 3s "de propósito", e o
  próprio comentário registrava o pedido antigo ("dar um tempo pro herói ver e fugir"). O jogador
  reviu: 3s não davam mais tempo de *fugir* — davam tempo de *esperar*, e num cerco de quatro covas
  abrindo em sequência era o que fazia a pressão do escuro parecer lenta. Foi para 1,4s, que ainda
  são nove passos de folga para sair do tile. O nascimento em si caiu junto (110→80ms por frame), e
  a cadência da poeira acompanhou (240→150ms) — senão a fenda mantinha o ritmo antigo num tempo
  menor, o que lê como animação acelerada e não como aviso mais curto.
- **Quem não enxerga o herói não pensa.** `AI_ACTIVE_TILES = 15`, e o número é demonstrável em vez
  de escolhido: a maior `detectionRange` do bestiário é 14, e fora do alcance o `takeStep` de todas
  as espécies cai no `wander`. Acima de 15 o único produto de um update seria um passo aleatório
  fora da tela — que custa uma consulta de terreno, a varredura dos outros corpos e **dois tweens**.
  15 também cai entre os dois números que já existiam: acima dos 14 em que uma cova acorda (nada
  congela recém-nascido) e abaixo dos 18 do despejo. A exceção que evita um bug: **quem está com o
  golpe armado nunca é cortado** — congelar um telegrafo deixaria a guarda erguida para sempre.
- **A aranha deixa teia.** Era a única espécie que não escrevia nada no mundo (a caveira racha o
  chão, a gosma deixa poça, o zora abre esteira), e é o corpo mais móvel do jogo. A teia não trava
  nada: a informação está em quantas há e quão juntas. **Não sai no bote** — no salto ela está no
  ar, e um rastro contínuo apagaria a diferença entre o rastejo (que se contorna) e o bote (que
  não). Três tentativas de teia orbicular foram descartadas: de canto lê como diagonais paralelas,
  centrada com anéis grossos lê como ALVO, e com raios finos o arredondamento quebra cada raio. A
  forma orbicular era errada de qualquer modo — uma aranha *andando* não fia um orbe, ela arrasta
  seda.
- **O mago ganhou corpo próprio, e isso consertou um defeito que ninguém tinha visto.** A arte
  normal dele era a do NPC *wizard* (`mage__1`), remendada com um tom frio para não ler como o velho
  amigo. Debaixo desse remendo havia outro defeito: a arte de DANO dele (`mage_hurt`) nunca foi a
  variante do `mage__1` — **ela é a variante do `mage_magic`**, mesma silhueta e mesma paleta. Ou
  seja, acertar o mago o transformava em outro personagem por 150ms, e era impossível notar porque
  o corpo normal já era emprestado de um terceiro. Com `mage_magic` como padrão: silhueta própria, a
  arte de dano casa, e o tom frio postiço sumiu. O telegrafo da conjuração virou o de todo mundo —
  clarão, corpo parado, som.
- **O dobro de mortos-vivos**, e este vem com um aviso medido. As covas moram em `chunk.enemies`
  (não em `props` — minha primeira contagem olhou no lugar errado e achou zero). Eram 54; o caminho
  sancionado era o `place-enemies.mjs`, que mira num TOTAL por tela e é idempotente, então bastou um
  fator só para a espécie. Deu **120**, e as outras sete ficaram idênticas ao byte.

  O aviso: o número que se olha não é covas por tela, é **covas dentro de 14 tiles** — e ele foi de
  10 para **25** no pior ponto do mapa. O cabeçalho do `TIERS` já apontava **13** como o número
  quebrado. Está tudo medido e tabelado na constante, e é um número só para dialar.

## Duas lacunas que a revisão do polimento deixou apontadas, e o conserto das duas

### Apanhar não custava tempo — a lei valia num sentido só

"O acerto compra TEMPO" é a frase que sustenta o combate: todo corpo que o herói atinge fica 300ms
sem andar e sem armar (`HITSTUN_MS`). **O herói atingido não pagava nada.** Levava os i-frames, o
arremesso e o hitstop — e podia golpear no frame seguinte. Trocar dano era LUCRO para quem tem a
espada, e a única coisa que o telegrafo de 500ms conseguia cobrar era um coração.

Agora um golpe recebido custa **240ms** (`PLAYER_STAGGER_MS`), e o número é o mesmo do tween que
devolve o herói ao centro da tela: ele recupera o controle no instante em que o corpo assenta, então
o que se vê e o que se pode fazer terminam juntos. Fica abaixo dos 300ms do inimigo de propósito —
quem apanha já perdeu um coração, e o jogo não cobra duas vezes pela mesma falha — e cabe inteiro
dentro dos 1500ms de invencibilidade: atordoado, mas nunca atordoado **e** vulnerável.

Três decisões dentro disso, e a primeira eu errei antes de acertar:

- **O atordoamento é uma CADÊNCIA, não uma porta fechada.** A primeira versão o pôs no `canAct()`, e
  ali o pedido é *descartado* — o que contradiz a razão de o buffer existir ("o jogador que encadeia
  dois golpes no ritmo certo era punido por acertar o ritmo"). Ele foi para junto da cadência, onde
  o aperto é **adiado**: o herói perde os 240ms, não perde o botão.
- **A janela do buffer continua correndo durante o atordoamento; só o gasto espera.** Se ela
  congelasse junto, um aperto feito antes da pancada sairia 240ms depois — um golpe que já não foi
  pedido. E o gasto precisa ser barrado de fora, porque `swingAttack` re-arma o buffer ao recusar:
  chamá-lo todo frame manteria a janela viva para sempre.
- **A lâmina rodopiante perde-se se você apanhar carregando**, e ela precisou de trava explícita por
  ser o único gesto que ignora cadência de propósito. É a outra metade do trato que a peça sempre
  cobrou: meio segundo parado no meio da matilha.

### A bomba podia falhar em silêncio

`explodeBomb` chamava `takeDamage(999)` sem perguntar nada. O `EnemyBase.takeDamage` já escrevia a
regra — *"quem chama SEMPRE pergunta antes (`isHurtInvulnerable`) para poder responder na tela —
este guarda é a rede, não a porta"* — e a bomba era o único caminho de dano do jogo que não a
seguia. Um corpo que tivesse acabado de levar uma espadada **atravessava a explosão inteira**: sem
dano, sem anel, sem som. O jogador via a bomba estourar em cima da caveira e a caveira seguir
andando, sem uma pista do porquê.

A recusa continua sendo recusa (os i-frames valem para toda fonte de dano, ou o combate volta a ser
uma serra) — o que mudou é que agora ela tem desenho: o mesmo anel frio de sempre. E de brinde, a
voz da explosão passou a sair **uma vez**: uma bomba no meio de uma matilha disparava um som de
morte por corpo, todos no mesmo frame — o mesmo defeito de orçamento que o `sweepArc` já tinha
corrigido no arco.

## A caveira parou de escurecer, e a régua multiplicativa é a razão

`woundedShade` é a substituta da barra de vida: o corpo perde brilho conforme perde vida. A ideia
está certa e funciona no resto do bestiário — mas ela é **multiplicativa**, e multiplicar castiga
exatamente quem já é claro.

A arte da caveira é osso (`#b5b5b5`), o tom mais claro do bestiário inteiro. No último ponto de vida
ela caía de **71% para 32% de luminância** — menos da metade do brilho, num mundo que a graduação de
noite já escurece. O inimigo mais comum do jogo ficava difícil de ver justamente no instante em que
mais se precisa enxergá-lo, e foi assim que o jogador reportou: *"a cor do undead vai ficando escura
demais pra ver com os danos."*

Ela agora devolve a base intacta (`woundedShade` sobrescrito em `UndeadEnemy`), e isso desliga tudo
de uma vez: `restoreTint` — na base e na dela — decide entre `clearTint` e `setTint` lendo esse
mesmo valor, então corpo e osso saem juntos.

O que ela perde é o estado **persistente** de vida. O que continua contando o dano nela: a troca de
textura a cada golpe (`undeadHurt`), a piscada dos i-frames, o arremesso e o atordoamento — e, com
3 de vida contra 2 de espadada, são dois acertos até cair. É pouca informação a perder por um corpo
que volta a ser legível.

A lição vale para a próxima espécie clara que entrar: **um tom multiplicativo não é uma régua
uniforme.** O mesmo fator que dá uma sombra elegante num corpo escuro apaga um corpo claro.

## Falar deixou de ser um acidente de trajeto

O diálogo abria no ESBARRÃO, e com isso conversar era a única coisa do jogo que acontecia sem
ninguém ter pedido: bastava a seta encostar no NPC — atravessando um vão, fugindo de uma caveira,
tentando contornar o velho para chegar na fogueira — e a tela parava, a câmera panorava e uma
conversa começava. **Um gesto que interrompe o jogo inteiro não pode ser um acidente de trajeto.**

Agora falar é o **botão B**, como usar qualquer outra coisa do mundo (`GameScene.talkToNpcAt`), e a
mudança não acrescenta nada para o jogador aprender:

- a parede já **vira** o herói, e um NPC bloqueia como qualquer parede — encarar quem se quer ouvir
  é o mesmo gesto de mira que a árvore e a rocha já cobravam;
- a afordância já estava pronta e não custou um pixel: o **"!"** que flutua sobre quem tem assunto
  novo (`NpcManager.hasNewDialog`) deixou de descrever um acidente e passou a apontar para um botão.

A ordem dentro do B importa e é a lei do próprio botão — **o que está na frente ganha do que está
embaixo**: pegar o item do tile à frente, depois falar, depois pegar o de baixo dos pés. Estar de
cara para um NPC e apertar B significa falar, mesmo pisando num graveto. E falar vem antes da porta
de "mão vazia": conversar não depende do que se carrega, e um herói com o machado escolhido não pode
ficar mudo por isso.

## O combate que mostra o próprio alcance, e o mundo que virou telas

Cinco mudanças que se explicam melhor juntas do que separadas: elas são a mesma decisão de tirar do
jogo tudo que pede para ser **adivinhado**.

- **O REVÓLVER saiu inteiro** — arma, balas (`PlayerBullets.ts`), cruz de mira, o coice, o som, o
  ícone, o sprite de fábrica e o item autorado no `world.json`. Ele era a única exceção à lei dos
  dois botões e a justificava bem (apontar em 360° só existe se o mouse existir), mas o preço era
  uma gramática dupla: um item que não se usa como todos os outros, um botão a mais, um cursor que
  some, o arrasto de mouse que deixa de andar. Com ele fora, **nada neste jogo se aponta**.
  `World3D.screenToGround` ficou de pé sem chamador, e é a única sobra deliberada: a conta dele (o
  raio pelo pixel, não o delta de tela) é a armadilha, e qualquer coisa que um dia traduza pixel em
  tile vai cair nela.
- **O golpe passou a varrer o bloco 2×3 à frente.** Era um tile, virou a fileira da frente, e agora
  são duas fileiras: seis tiles, até seis corpos num gesto. A fileira de trás pede **caminho** (o
  tile do meio não pode ser parede — reaproveitando `isShotBlockedAt`, que é a mesma pergunta que
  uma bala faz), e o **soco continua alcançando uma só**: alcance é da arma. Sem isso, um punho com
  dois tiles de alcance tornaria a espada decorativa.
- **E o alcance virou desenho SEM inventar desenho nenhum.** A primeira tentativa foi um crescente
  varrido (uma faixa anular desenhada em `Graphics`, acesa na cabeça e apagando na cauda) e ela foi
  arrancada no mesmo dia, por um motivo que vale registrar como regra: *"a espada tem que usar o
  sprite da espada mesmo, parece que foi criado algo fake pra aumentar o tamanho"*. Estava certo —
  qualquer forma que não seja a arte da arma lê como efeito colado por cima, e o mesmo vale para
  esticar o sprite (o `SLASH_BLADE_FACTOR` chegou a subir para 1,18 e voltou para 1,08: uma espada
  que cresce ao ser sacada não é uma espada). **O alcance é físico**: o punho passou a orbitar a
  0,62 tile do corpo (`SLASH_ORBIT_FACTOR`) em vez de 0,26 — o braço estende —, o que põe a ponta a
  ~1,7 tiles, dentro da segunda fileira. E o rastro são **cópias do próprio sprite**: de quatro
  fantasmas amontoados atrás do gume para oito abertos pelo arco inteiro, que é a fila que mostra
  por onde a lâmina passou.
- **O herói não pega mais nada sozinho.** A coleta por pisada saiu do `ItemManager.update`; pegar é
  o B (`pickUpItemAt`: o tile à frente primeiro, o de baixo dos pés depois). Três consequências que
  valem mais que a regra: o gesto ficou **reversível** (pousa com B, pega com B, sem sair do lugar),
  o flag `armed` do `ItemPickup` **deixou de existir** — ele só existia para remendar o acidente de
  um item largado voltar para a mão no mesmo frame —, e atravessar uma sala cheia de coisas deixou
  de encher a mochila sem que ninguém pedisse. Moeda e coração não são itens e continuam entrando
  andando.
- **Uma espécie por tela** (`scripts/place-enemies.mjs`). O chunk é a região porque a câmera
  enquadra ~um chunk: é a unidade que o jogador experimenta. Telas misturadas não davam variedade,
  davam ruído — cada corpo pede uma resposta diferente e nenhuma sobrevive ao ruído das outras. O
  script preserva o que foi autorado onde pode (tela de espécie única fica intacta; tela misturada
  entrega a vitória à espécie dominante e **converte as outras no mesmo tile**, porque o tile é a
  decisão que importa) e move só a cova que ficou ilegal (zora tem de estar na água). O número que
  mais custou aqui **não** é covas por tela: a cova acorda na distância de visão da caveira (14
  tiles ≈ 4,3 telas), então 3 por tela — o número do Zelda 1, onde a tela é um corte duro — punha
  **13 corpos** acordados em volta do herói. Uma a duas por tela dá ~7, medido. Resultado: 297 covas
  em 173 telas, zero telas misturadas, zero covas ilegais.

**Os dois botões de toque já existiam** (`ActionButtons`); o que faltava era o B fazer o que o
polegar espera dele — pegar e largar — e o `isTouchDevice` reconhecer aparelho que responde
`maxTouchPoints = 0` e não expõe `ontouchstart` (Android em modo desktop, emulador do Chrome). Ali
o jogo ficava sem A e sem B num aparelho que só tem dedo.

## O caminho até o jogo: uma tela, um botão — e o herói que nascia do tamanho errado

Quatro cortes e um conserto, todos na mesma direção: **entre "quero jogar" e jogar não pode haver
nada**.

- **A câmera desceu para 72% do par original** (`camHeight`/`camBack` = 6.048/5.472). São dois
  passos do slider temporário — 80%, e depois 90% desse 80% — e os dois números andam **sempre**
  pelo mesmo fator, porque a razão entre eles é a direção de visão que o `DEPTH_UP` da flor da lua
  e o `depthToScreen` do braço robótico têm assada dentro de si (ver `debug/cameraZoomSlider.ts`).
  Baixar o valor escolhido para o `DEFAULT_PARAMS` devolve o slider ao 1×.
- **A tela de idioma morreu e o jogo é só em inglês.** O catálogo `pt-br.json` saiu, a
  `LanguageScene` saiu, o par de botões PT-BR/EN do menu de pausa saiu. O **seam do i18n ficou**, e
  não por nostalgia: `t()`/`tLines()` são o único lugar onde o texto do jogo mora fora do código, e
  a fala de NPC depende de `localizedNpc()` devolver `undefined` para cair no texto autorado no
  `world.json`. Uma tabela só, sem cadeia de fallback — uma chave que falta agora aparece na tela
  como a própria chave, que é o comportamento que se quer.
- **A intro saiu inteira.** Eram ~7 segundos de tela preta com o herói crescendo de um ponto
  enquanto uma voz mandava acordar — bonito na primeira vez e um pedágio em todas as outras. O que
  ela dizia, o mago diz na primeira conversa, e essa o jogador **escolhe** ter. O `playSingingBowl`
  continua no `SoundManager` sem chamador, guardado para o próximo momento lento.
- **O título tem uma porta.** Levels e explorador não morreram: perderam a porta *daqui*.
  `/?level=N` boota um level, `?explorer` boota uma expedição, o menu de pausa de um level ainda
  volta para a `LevelSelectScene`, e o **[I]** do DevLauncher lista os três. E o título herdou da
  tela de idioma a **abertura do áudio**: ele é a primeira tela agora, então é nele que o primeiro
  gesto do jogador destrava o `AudioContext`.

**O herói nascia com o tamanho errado, e o zoom da câmera é que provou.** Ele aparecia menor e
"consertava-se" no primeiro passo. A causa: `hero.sizePx` tinha **dois** escritores discordando —
o `handleResize`, com a fórmula 2D antiga (`min(largura/12, altura/12)`, ~60px), e o
`stopBreathing`, com o `tileSize` de verdade, que é a **projeção** de um tile pela câmera 3D
(~93px depois do zoom). Quem chamava `stopBreathing` era o primeiro passo. Enquanto o zoom era o
autorado os dois números eram parecidos e o defeito passava por nada; aproximar a câmera abriu a
distância entre eles e o pulo ficou óbvio.

O tamanho era metade do estrago. `heroFootY` soma **meio `sizePx`** para achar a linha do pé, e o
`syncHeroBillboard` divide isso pelo `tileSize` — com os dois em desacordo, o corpo era plantado
~0,1 tile ao **norte** do tile em que o herói de fato estava. Um herói levemente fora do próprio
tile é o tipo de erro que ninguém encontra olhando: ele não pisca, não trava, só desalinha tudo o
que se ancora nele.

O conserto é uma fonte só: `sizePx` é escrito **uma vez por frame, no `render3D`, na linha
seguinte à que deriva o `tileSize`** — que era o que o `HeroView.ts` já dizia em comentário (ele
citava uma função `updateHeroSize` que não existe há tempos). O `handleResize` também passou a
derivar o `tileSize` da projeção 3D quando o mundo já existe; a fórmula 2D só responde no primeiro
resize do boot, antes de haver câmera 3D para perguntar.

## A escada de vida — a lei que estava escrita e a tabela que a contradizia

A pergunta era "o que falta de essencial pro combate ficar mais divertido?", e a resposta não foi
uma mecânica que faltava: foi uma **contradição entre a lei escrita e os números**.

`MELEE_DAMAGE.sword` tinha caído de 999 para 2 com um comentário longo explicando por quê — com
999, o telegrafo de 500ms que cada espécie carrega nunca chegava a acontecer, e todo encontro era
"chegue perto, aperte Z". Mas o comentário daquele dia só cita duas espécies: *"a caveira (3) leva
duas espadadas, o slime grande (6) leva três"*. Foram as duas únicas reconferidas. As outras seis
ficaram com a vida da época em que tudo morria no primeiro toque:

| espécie | HP antes | espadadas |
|---|---|---|
| morcego | 1 | **1** |
| mago | 2 | **1** |
| aranha | 2 | **1** |
| zora | 2 | **1** |
| caveira | 3 | 2 |
| gosma / gosma grande | 4 / 6 | 2 / 3 |
| torreta | 6 | 3 |

**Quatro de oito corpos morriam de um golpe** — a lei do `CLAUDE.md` ("NADA morre de um golpe")
era falsa em metade do bestiário, e ninguém percebeu porque a linha que a lei cita
(`MELEE_DAMAGE.sword = 2`) estava certa. O erro não estava onde a lei apontava.

E repare em QUAIS quatro caíram: as de vocabulário mais rico. A aranha tem rastejo → agachada →
bote → telegrafo → golpe, uma máquina de estados inteira — e morria no primeiro encostão. Toda
aquela gramática só chegava a rodar se ela alcançasse o herói primeiro, ou seja, **só quando o
jogador já estava perdendo**. O mago é um duelo à distância que acabava no instante em que você
fechava a distância uma vez. Não faltava mecânica no combate: faltava o encontro **durar** o
suficiente para a mecânica que já existia acontecer.

### A escada, e por que ela mora num lugar só

A correção não é uma tabela de HP nova — é uma **escada**: o corpo mais fraco custa dois golpes e
cada espécie seguinte custa exatamente um a mais, sem repetir nenhum degrau. Isso transforma o
balanço numa pergunta que tem resposta ("de quem esta espécie é mais difícil?") em vez de numa que
não tem ("quanto HP ela devia ter?"). Número repetido seriam duas espécies que, na mão, custam a
mesma coisa.

| degrau | espécie | golpes | HP | tempo até cair |
|---|---|---|---|---|
| 1 | morcego | 2 | 4 | 0,45s |
| 2 | caveira | 3 | 6 | 0,90s |
| 3 | gosma | 4 | 8 | 1,35s |
| 4 | aranha | 5 | 10 | 1,80s |
| 5 | zora | 6 | 12 | 2,25s |
| 6 | mago | 7 | 14 | 2,70s |
| 7 | gosma grande | 8 | 16 | 3,15s |
| 8 | torreta | 9 | 18 | 3,60s |

O tempo não é estimativa: o intervalo mínimo entre dois acertos é o piso dos i-frames
(`HURT_INVULN_MS`, 450ms), então a escada de golpes **é** uma escada de tempo, em degraus de 0,45s.
Nenhum corpo do jogo passa de 3,6 segundos.

A ordem sai da frase de cada espécie, não de conveniência. O morcego voa torto e não tem golpe
armado a perder — é estorvo, e já é difícil de acertar. A caveira é a régua: é a professora do
telegrafo e o corpo mais comum do mundo, então o que ela custa vira a expectativa de todo o resto.
A gosma "aguenta pancada" por design e não teme a tocha. A aranha precisa viver o bote. O zora não
se arremessa e escolhe a própria janela. O mago se recusa a chegar perto, então o custo dele é
fechar a distância sete vezes, não bater sete vezes seguidas. A torreta é o teto justamente porque
**não persegue ninguém**: nove golpes só são cobrados de quem escolheu derrubar a parede em vez de
contorná-la.

A escada mora em `world/ScreenContent.ts` (`ENEMY_BLOWS`), que é módulo folha, e não espalhada em
oito arquivos — a mesma lei que já valia para `FLYING_ENEMY_KINDS`: *"três cópias seria o jeito
garantido de as três discordarem daqui a um mês"*, e a tabela velha é a prova de que discordam
mesmo. Duas consequências valem mais que o comentário:

- **`Record<EnemyKind, number>` é exaustivo**, então espécie nova **não compila** sem declarar um
  degrau. A lei deixou de depender de alguém ler a documentação.
- **`SWORD_BLOW_DAMAGE` mora lá também**, e o `MELEE_DAMAGE.sword` do GameScene lê dele. A vida de
  todo corpo é derivada (`enemyMaxHealth`), então mexer no dano da espada reescala o bestiário
  inteiro de uma vez — que é o comportamento correto, e o oposto exato do acidente que criou a
  tabela velha.

`woundedShade` não precisou de nada: ele já era fração de `maxHealth`, então mais vida virou
sozinho um escurecimento de passo mais fino — o que é uma melhora, porque a leitura de vida do
corpo ficou mais resolvida justamente nos corpos que agora duram mais.

### O que o `esgrima` passou a cobrar

Os passos 6 e 7 assertavam *"a segunda espadada mata"* — verdade com 3 de vida, mentira com 6. A
reescrita não troca 2 por 3: ela **lê a tabela do jogo** (`gameDebug.enemyBlows()`) e cobra a LEI,
que é o que não muda: piso 2, estritamente crescente, sem repetição. Um cenário que guarda números
vira uma segunda tabela para manter em dia; um que guarda a lei sobrevive ao balanço. A regressão
que ele existe para pegar também não é um número — é uma espécie entrando num degrau **ocupado**.

Ele ainda mede os golpes **contando**, e por `strikeEnemy` direto e não pelo botão A: cada acerto
arremessa o corpo um tile, então do terceiro golpe em diante a caveira já saiu do alcance do arco —
pelo botão, o passo mediria a mira do cenário e não a vida dela.

O `explorador` também mexeu: o laço que mata uma caveira para haver moeda no chão tentava 8 vezes,
dimensionado para 2 golpes. Com 3 golpes e resvalos de i-frame, o pior caso honesto é o dobro — 16.

### O que continua matando de um golpe, e é de propósito

O **graveto ACESO** (999 de dano). A exceção é do ITEM e não do inimigo: o fogo é recurso que se
gasta — o combustível corre, a chama entrega sua posição no escuro e a mão fica presa nele —, então
ele compra o que a espada deixou de dar. A bomba idem. Nenhum dos dois é uma espécie com vida baixa.

## O polimento que a régua da própria casa cobrava — quatro frentes de uma vez

Uma auditoria contra os combates de referência (LttP, Hades, Hollow Knight) achou um padrão: o jogo
já tinha as ferramentas certas (hitstop escalonado, shake direcional, gramática de recusas,
telegrafo com anel), mas **a régua não estava aplicada por igual**. Quatro frentes fecharam isso.

### 1. Apanhar pesava menos que bater

- **O golpe recebido não sacudia o mundo.** O herói acertando move o mundo 3D
  (`world3d.shake` 90/0.09, 150/0.15 na morte); o herói apanhando só tremia a câmera Phaser da UI
  (`cameras.main.shake(200, 0.01)`) — o mundo ficava parado. Nos elogiados, apanhar é o momento
  mais pesado. Agora: `shake(170, 0.14)` direcional, entre o acerto e a morte, e o Phaser-shake
  saiu (dois sistemas de tremor no mesmo golpe dessincronizavam as camadas). O flash vermelho fica.
- **Golpe inimigo no herói invencível evaporava mudo** (early-return no `handleEnemyAttackPlayer`)
  — leitura de bug ("a clava me atravessou"). Agora RESVALA com o pacote frio dos i-frames
  (`spawnDeflect` no tile visual + `playBladeGlance`), e o atacante ainda investe. **Só o golpe de
  corpo do BICHO**: o tiro já morre com o próprio estouro, e o esbarrão do herói piscando ganhou um
  flag próprio (`EnemyHit.bump`) para NÃO disparar anel a cada encostão — a piscada já explica.
- **Item sem entrada em MELEE_DAMAGE contra um corpo não fazia NADA** (nem swing, nem som — o ramo
  armado exigia dano e `placeItemAt` recusava mudo por tile ocupado). Agora: o item balança
  (`swingHeld`), o corpo absorve (`triggerKnockback(0,0)`, o agachado da torreta) e um `playItemBonk`
  surdo diz "encostou, não mordeu". Sem raiz nos pés: cutucar não é atacar.
- **O resvalo em i-frames não tremia a câmera e o resvalo em corpo nascendo tremia** — a mesma
  recusa com dois pesos. Os dois agora: `shake(40, 0.03)` direcional.

### 2. Três estados invisíveis da IA ganharam corpo

- **A recuperação** (`ATTACK_RECOVER_MS` 450, em `EnemyBase`): o terceiro tempo do ataque existia
  só como aritmética (`attackInterval − windup`) e nenhuma pose o mostrava. Agora todo golpe que
  sai (acertando ou errando) planta o corpo por 450ms, caído na pose (`poseRecover`, mergulho de
  escala — nunca esticar, sprite não vaza do tile), sem guarda (ela lê o relógio do windup, que já
  zerou). Corre DENTRO do 'busy' do `tickWindup`, então nenhuma espécie precisou saber dela — e
  zora/torreta (que nunca chamam `startWindup`) ficam de fora, porque já têm os próprios tempos.
- **O hitstun era invisível** (`tickHitstun` só devolve true). Agora o corpo TREME — ângulo derivado
  do relógio (`tickStunFx`, chamado pelo EnemyManager junto dos i-frames, pelo mesmo motivo: a
  espécie sai cedo do update exatamente nesse estado), ±7° a ~8Hz decaindo. A frequência é o que
  separa "andando" (tombo de 260ms) de "zonzo".
- **O instante de notar** (`noteSeesHero`/`startleNotice`): vagar virava caçar sem um pixel. Agora a
  primeira transição ganha clarão âmbar de 90ms (`NOTICE_FLASH` — âmbar e não vermelho: vermelho é
  promessa de golpe), duas fagulhas subindo da CABEÇA (a zona da intenção, a mesma do balão da
  caveira) e um sopro curto (`playCreatureNotice`). A primeira avaliação da vida semeia em silêncio
  (quem nasce vendo o herói acabou de fazer a chegada — seria o mesmo aviso duas vezes) e o re-arme
  de 2,5s impede o susto de virar strobe na fronteira de visão, que oscila. A caveira avalia depois
  da fixação de placa: reaver o herói após o golpe que quebra a fixação É um momento de notar.
- **A agachada da aranha** (400ms, o tell mais longo fora de windup) era sem cor e sem som — e o
  `playSpiderPounce` tocava no FIM, quando o salto já tinha partido. O clarão de ameaça
  (`flashThreat`, extraído do startWindup) e o som desceram para o COMEÇO da agachada; o salto não
  precisa de voz — três passos em 360ms são a coisa mais visível que ela faz.

### 3. Oito corpos, uma voz — a família de altura

`enemy-hit`, `enemy-death`, `undead-windup` e `creature-arrive` tocavam iguais para as oito
espécies (a fraqueza que este arquivo já apontava). A resposta não foi 8×4 arquivos novos: é
`ENEMY_VOICE` no SoundManager — **a mesma amostra em altura fixa por espécie** (morcego 1.3×,
torreta 0.6×...), como o SNES sempre fez família com um sample. `playSample` ganhou o parâmetro
`rate`; o jitter aleatório multiplica POR CIMA, então a variação continua dentro da voz de cada
corpo. A taxa fixa pode entrar até no telegrafo (que recusa jitter aleatório porque rate muda
duração): a mudança é constante e aprendível — e no morcego ela CONSERTA um desalinho, o aviso de
~300ms que não cabia na janela de 280ms dele. Os fallbacks sintetizados escalam as frequências
pela mesma taxa. A voz da chegada saiu do construtor do WalkerEnemy para o primeiro `tickArrival`
(`kind` é getter abstrato — o TS proíbe lê-lo no construtor, com razão).

### 4. A carga da lâmina falava só no fim

Entre segurar o A e o sino de pronta (450ms), NADA acontecia. Agora, passado um limiar de toque
(`SPIN_CHARGE_TELL_MS` 120 — sem ele toda espadada viraria começo falso de giro): faíscas de carga
ralas e pálidas que engrossam com o progresso (`spawnChargeMote(intensity)` — a mesma gramática das
prontas, em dois volumes) e um zumbido fino SUBINDO (`startSpinChargeHum` — nó vivo com a duração
embutida, então hitstop não o deixa subindo para sempre; cortado em 50ms por soltar cedo, pausar ou
morrer). E **a carga perdida no atordoamento ganhou recibo**: soltar a lâmina pronta no stagger a
desperdiçava em silêncio total — agora um descer curto (`playSpinFizzle`, o inverso do sino) e as
faíscas de carga CAINDO apagadas (`spawnChargeFizzle` — subir é carregar, cair é o que sobrou).

### O que a validação mediu (e o que ela desenterrou)

`typecheck`, lint (nos arquivos tocados) e `build` limpos. `fauna` e `projeteis` **100% verdes**
com as mudanças. E três cenários falham HOJE — **idêntico na `main` limpa** (medido por
stash/rodada A-B, não por suposição): `esgrima` 5 asserções (o soco declara/alcança a segunda
fileira; o resvalo de i-frames tira vida via `strikeEnemy`; a caveira cai em 2 espadadas),
`combate` 11 (o cenário aborta em "Cannot read properties of null"), `placa-undead` 1 — um flake
de FRONTEIRA: o balão da caveira em (7,6) projeta em x=1290 numa tela de 1280, e chegar a (7,6)
antes da amostra depende da fase sorteada do primeiro passo (`Between(0, 520)`). A asserção agora
carrega `skullX/feetX/tileSize` no payload para o próximo a olhar isso ver de relance. Nenhuma
dessas é desta mudança: são a fatura dos cinco commits da reforma que nunca rodaram o gate.

## Verifying a change

The playtest harness (`playtest/`) is headed Playwright — it drives the real game and asserts on
real state. Add a scenario in `playtest/scenarios/` and register it in `index.mjs`.

- Always enter the game with **`?play`** (dev-only; skips the title — keying past it is flaky,
  since its input only arms 300ms in).
- Do **not** drive the game through an MCP browser tab: a hidden tab freezes Phaser's rAF, so
  nothing advances and every timing is meaningless.
- Live handles in dev: `window.__scene` (the Phaser scene), `window.__game`, `window.hd3d` (every
  3D render knob, live-tunable), `window.gameDebug`, `window.__prof`.

**Test EXACTLY what you changed, and nothing else.** Write (or extend) the one scenario that
covers the new thing and run that. Do **not** replay the whole game to check a pointed change:
the full puzzle solves (`espada` above all) take minutes each, they are bump-timing sensitive and
so they flake, and a flake in an unrelated scenario tells you nothing about your change while
costing you the afternoon. Os dois botões, a mochila e a subtela → `combate`.
Axe/tree/border → `machado`. Robotic arm → `braco`. Toolbox and its
recipes → `caixa-ferramentas`. Rock and pickaxe →
`pedra`. Pressure plate + hero/crate → `caixa-placa`; the undead that walks onto one →
`placa-undead`. A aba Inimigos e a cova que devolve o inimigo → `inimigos`.
Portal crossing → `portal-travessia`. Swing gate → `portao-de-bater`. Moonflower →
`flor-da-lua`. O modo explorador (mundo infinito, janela do terreno, 50%/5%) → `explorador`.
Fire and the light
budget → `perf-burn`. Frame cost → `perf-profile`. Item-state contracts (a bridge refusing a
second burn, the mound waiting for a clear tile, production drops falling to a free neighbour,
the bomb's fuse tween dying with the bomb) → `itens`. Same rule for re-runs: one failure in a
scenario you did not touch is a flake to note, not a suite to run four times.

**`espada` and `itens` are currently RED, and not because of anything you did.** Both assert the
contents of the old generated `level-1` ("A Espada na Pedra"), which the hand-authored level
replaced — see the warning at the top. Treat their failure as expected until they are rewritten to
author their own fixture in `/lab`, and never "repair" them by editing a level file. (`menu-flow`
was rewritten for the one-door title and no longer touches level contents.)
`espada` ficou vermelho por um segundo motivo desde os dois botões: ele resolve o level inteiro
**esbarrando** nas coisas, e esbarrar não usa mais item nenhum. Quando ele for reescrito, o gesto
é `driver.faceAndUse(dir)`.

**Os dois botões mudaram o GESTO de vários cenários** (o esbarrão com item na mão virou
`faceAndUse`, e o depósito por pisada virou `placeItemAt`): `machado`, `pedra`,
`caixa-ferramentas`, `caldeira`, `braco`, `bateria`, `portao-de-bater`, `itens` e `explorador`
foram migrados junto com a mudança e **ainda não foram rodados** — a primeira rodada deles depois
disto é uma verificação de verdade, não uma formalidade.

**When measuring performance, always compare against `main` (`git stash`).** A number on its own
proves nothing — a fix that removes a stall can quietly cost frame time, and you will not see it
without the before.

**Unlock vsync for any perf measurement**: `PLAYTEST_UNTHROTTLED=1 PLAYTEST_SLOWMO=0`. With vsync on
a desktop GPU simply *downclocks* to meet the refresh — strip the whole post chain out of the frame
and the reported GPU time does not budge, because the hardware just did the smaller job more slowly.
Every variant then measures the same and every optimisation looks like it changed nothing.

## Proving a render change is invisible

`npm run playtest -- visual-ref` writes deterministic reference shots; `node playtest/compare-visual.mjs
<dirA> <dirB>` diffs them pixel by pixel. Two runs of the same build differ by **0 pixels**, so
anything the diff reports is real. Use it for every performance change that touches the renderer.

    git stash && npm run playtest -- visual-ref
    mv playtest/results/visual playtest/results/visual-main
    git stash pop && npm run playtest -- visual-ref
    node playtest/compare-visual.mjs playtest/results/visual-main playtest/results/visual

`VISUAL_ISOLATE=shadows` strips the frame back to the ground and the cast shadows with no post chain
— the bloom smears any local change across half the image, so it will tell you a shadow moved when
what moved was a mote of dust.

**The trap that will waste your afternoon:** three.js burns `Math.random()` draws on every object's
UUID. So a change that merely allocates a *different number of objects* at boot shifts the shared
generator — and every flame then gets a different seed and flickers to a different rhythm. A cast
shadow's LENGTH is driven by its flame's brightness, so two byte-identical renderers will "fail" the
pixel diff by 40% of the frame for a reason that has nothing to do with rendering. `visual-ref` pins
the seeds themselves for exactly this reason. If a diff looks structural, check the fire state first.

## Profiler

`src/game/debug/Profiler.ts`. `?prof` boots with it running, **F3** toggles the HUD,
`__prof.report()` / `.csv()` dump the data. Per frame it records the real frame interval, CPU by
section, **real GPU time** (timer query), draw calls, live shader programs, lights, heap and
gameplay counters — and its spike log **names the cause** rather than just showing a number.

GPU time matters: fragment cost is invisible to a CPU clock (`composer.render()` only *submits*
work), so "one more light" or extra overdraw shows up nowhere else.

## The rendering rule that keeps biting

`src/game/render3d/World3D.ts` holds a **fixed, small** number of point lights, and nothing may add
or remove one at runtime. Two costs push the same way:

1. three.js bakes the light **counts** into every compiled shader's cache key. One
   `scene.add(pointLight)` mid-run invalidates *every lit material in the world* and recompiles them
   all — a ~550ms frozen frame. (This was the "travada ao queimar o arbusto" bug.)
2. Every light is evaluated by **every lit fragment**, and the patched shader does a world-space
   snap + flame wobble per light: ~0.35ms of frame time each. So the count must also stay small.

So a fire does **not own** a light — it **borrows** one. All lights are built in the `World3D`
constructor (`FIRE_LIGHT_SLOTS`); each frame the pool is aimed at the lit fires nearest the camera.
A fire that misses out keeps its glow quad, which is a *mesh* — meshes can come and go freely, only
lights cannot. `npm run playtest -- perf-burn` guards this.

## Other things that are easy to get wrong

- **Phaser does not auto-call `shutdown()`** — wire it via `events.once(SHUTDOWN, ...)` or a
  `scene.restart()` (death) leaks listeners across runs.
- **Scene edits do not hot-reload.** Phaser scene changes need a hard reload; the editor's
  `beforeunload` blocks the auto-reload, so you can sit there looking at stale code.
- **No sprite may overflow its tile.** 3D depth comes from the shader, never from scaling art up.
- **Anything the hero can STAND ON must declare `depthLayer: 'ground'`** (`DEPTH_LAYER` in
  `Billboard3D.ts`). Two upright billboards on one tile are camera-facing quads at the same spot,
  i.e. exactly coplanar: the depth test has no winner, so it flips per pixel per frame and the
  pair strobes (the item blinking out under the hero's boots). It is not a bug in any one prop —
  it is what coplanar geometry does — so patching it prop by prop with a hand-placed nudge only
  moves it around. The layer pushes ground clutter a hair down the view axis, deterministically.
  Already declared: every ItemPickup + its rim, coins, hearts, survivors pickups, the bombSpot
  ghost, a planted bomb, grass mown to stubble (`setDepthLayer('ground')` the instant it stops
  blocking). Flat quads (holes, blooms, water) are exempt — they separate by `flatY`.
- **NPC dialogue lives in `public/world.json`**, not only in `NPC_DIALOGS` — a new NPC needs both.
- Materials with `onBeforeCompile` **must** set `customProgramCacheKey`, or differently-patched
  materials silently share whichever variant compiled first.
- **`prewarmShaders()` must run with the composer's render target bound.** The world is never drawn
  to the canvas — EffectComposer draws it into an offscreen target — and three bakes the target's
  *colour space* into the program's cache key. A prewarm that leaves the canvas bound compiles a
  complete, correct, useless set of programs the game never asks for, and the game then compiles its
  real set lazily, one 50–300ms freeze at a time. `perf-profile` fails if a single program compiles
  during play; a new billboard option shape must register a stand-in in `prewarmShaders`.
- A cast shadow's `mat.needsUpdate = true` on a texture swap looks like waste and is not: three only
  refreshes a material's uniforms when its version moves, so without it the hero's shadow freezes on
  one frame of his walk cycle while he walks.

---

## 2026-08-04 — A auditoria do "isso é um jogo?": save, morte, economia, dungeons, mapa, história

Uma varredura profunda (arquitetura, narrativa, conteúdo autorado, UI/UX e este arquivo inteiro)
atrás do que um jogo de mundo aberto focado em narrativa e exploração não pode não ter. O
diagnóstico completo e as fases estão em `PLANO.md`; aqui fica o porquê de cada decisão e as
armadilhas que o trabalho revelou.

### O que a auditoria encontrou (em ordem de gravidade)

1. **O final era INALCANÇÁVEL.** Acender uma fogueira morta (a condição da prophecy) exige tocha;
   tocha exige graveto; graveto exigia `dryTree` ou `greatAxe` — e o mundo 22×8 tinha ZERO de
   ambos. A troca de mundo (8×8 → 22×8) perdeu 51 props e 26 itens no caminho: sobraram 18 props
   (fogueiras+portais) e a espada. Todo o sistema de ferramentas era código morto na aventura.
2. **Não havia save.** A aventura inteira morava numa instância de `GameScene`: morrer, entrar
   numa dungeon (o `scene.restart()` da travessia) ou fechar o browser apagava mochila, moedas,
   fogueiras, diálogos e a história do mago. Só a árvore derrubada sobrevivia — por acidente
   (`WorldData` é module-level e mutável), e mesmo ela morria na volta de dungeon (o
   `leaveDungeon` re-fetcha o `world.json` limpo).
3. **`meta.puzzle: true` esquecido no overworld** — o gen-zelda-world a declarou TEMPORÁRIA ("sai
   quando o bestiário entrar"); o bestiário entrou (363 covas) e a flag ficou, desligando a LOJA
   e o CERCO no mundo inteiro.
4. **A moeda era um sistema órfão**: `rewardKill` era explorer-only (matar as 363 covas pagava
   zero) e a única saída (a loja) estava atrás da flag acima.
5. **As 9 dungeons eram 506 chunks vazios** — zero inimigos, zero itens, zero recompensa.
6. **Zero orientação** num mundo de 264×96 tiles, **objetivo nunca comunicado** (o "protect this
   flame" do mago dizia o OPOSTO da ação que destrava o final) e **a música do overworld** (Ashen
   Fields) engavetada "para revival fácil".

### O que foi feito, e por quê assim

- **`runtime/adventureState.ts`** — o padrão `dungeonTrip` (estado de módulo sobrevive ao
  restart) com um andar a mais: o retrato dorme em `localStorage['zh.adventure.v1']`. O que entra:
  respawn (o tile pisado no anel de um fogo aceso — o bonfire), mochila+seleção, moedas, upgrades,
  fogueiras acesas, beats do mago, diálogos vistos, cerimônias de item, árvores-tile derrubadas
  (diff reaplicado ANTES do World3D assar), fotos de itens-no-chão POR MUNDO ('world'/'dungeon-N')
  e chunks visitados. O que NÃO entra, de propósito: vida atual (acordar acorda inteiro), props
  consumidos (rocha, arbusto — são os renováveis do mundo) e QUALQUER coisa de explorador/level.
- **"Aventura" = `!explorer && appMode game && (activeLevel null || dungeonTrip)`** — a armadilha
  é que `enterDungeon` SETA `activeLevel`, então "estou num level?" não distingue dungeon de
  puzzle; o `dungeonTrip` distingue. O mesmo raciocínio tirou o "Back to levels" da pausa de
  dungeon.
- **Morrer = acordar na fogueira com tudo.** O custo é a distância, não o progresso. Morrer
  DENTRO de dungeon acorda do lado de fora (re-fetch do world.json, o gesto do leaveDungeon).
  Restart da pausa = o mesmo contrato sem o funeral. Explorador intocado (os 5% são o modo).
- **O título sempre re-fetcha o `world.json`** ao entrar na aventura: o WorldData em memória pode
  estar segurando uma DUNGEON (quit de dentro dela) ou cicatrizes de sessão, e tudo que merece
  viver já mora no save. Continue = mesmo boot + `requestAdventureRespawn()` (pedido consumido
  UMA vez — a volta de dungeon também reinicia a cena e precisa nascer na boca da caverna, não no
  fogo).
- **Economia pela escada de vida**: um corpo paga `ENEMY_BLOWS - 1` moedas (morcego 1, torreta 8)
  — a tabela que diz "de quem é mais difícil" agora diz "quanto vale", nenhum número novo.
  Coração dropa a 20% SÓ com o herói ferido (coração no chão com vida cheia é lixo visual) — e é
  a única cura de dungeon, onde fogueira não existe.
- **`scripts/enrich-overworld-props.mjs`** devolveu 549 props (189 dryTree, 109 dryBush, 59 rock,
  12 ironRock, 180 tallGrass) + UM machado autorado uma tela ao norte do spawn (a espada mora ao
  lado do mago; o machado mora na estrada do primeiro portal — ele abre o loop do fogo inteiro).
  **A armadilha medida**: a heurística "só coloca com ≥3 vizinhos cardeais abertos" parecia
  suficiente e deixou **1.700 tiles presos em bolsões** (dois props de chunks diferentes fecham
  juntos uma boca de baía que nenhum fecha sozinho). A regra final é um BFS do spawn por
  colocação: o mundo alcançável só pode perder o próprio tile do prop. 5,8s de script; barato.
- **`scripts/enrich-dungeons.mjs`**: covas subindo a escada com o número da dungeon (d1
  morcego/gosma → d9 mago/torreta/gosma-grande/caveira), uma espécie por chunk, sem zora (não há
  água), bigslime só em sala ≥25 tiles (as metades precisam de chão), nada perto da entrada nem
  do portal. Corações na metade funda. **Tesouro no tile MAIS DISTANTE alcançável** (BFS):
  d1 picareta, d2 balde, d3 foice, d6 greatAxe (o prêmio que edita o mapa), e kits de expedição
  (graveto/pedra/coração) nos demais — distâncias de 94 a 269 tiles, descidas de verdade.
  Carvão ficou de fora dos tesouros: `PickupKind` não o inclui (é drop de runtime).
- **O mapa na subtela** (a exceção licenciada ao "o mundo ensina"): um quadrado por chunk, fog
  dos chunks PISADOS, e só marcas que o herói viu — fogueira acesa/morta (a superfície de quest
  do jogo), portal, ele mesmo. Sem legenda. Level (uma tela), explorador (infinito é a aposta) e
  dungeon (se aprende andando) não têm mapa.
- **O mago aponta**: o protect agora dá a quest na voz dele (as fogueiras mortas esperando, corte
  madeira morta, acorde o graveto NESTA chama, o machado abandonado na estrada norte — e ele está
  lá mesmo), a prophecy reconhece e aponta o resto (outras fogueiras, o que os portais enterram).
  NPC é o canal narrativo sancionado; a lei do balão segue de pé.
- **Ashen Fields religada** na aventura de overworld (a calmaria do danger volta pra ela em vez
  do silêncio); dungeon/level/explorador continuam só no vento — o escuro deles é desenho.

### Verificação

`playtest -- salvamento` (novo): morre de propósito, afirma que a picareta sobreviveu, que o
retrato dorme no localStorage, que o título vira Continue+Start over e que o Start over (tecla 2)
o devolve a uma porta. `menu-flow` continua verde por construção (perfil novo não tem save).
Enriquecimentos validados por script: espécie pura por chunk nas 9 dungeons, zero cova/tesouro
inalcançável, segunda rodada de cada script acrescenta zero (idempotência), e o BFS de
conectividade do overworld: 549 props novos, perda de exatamente 535 tiles alcançáveis (os 14
restantes caíram em bolsões que JÁ eram inalcançáveis).

### O que ficou aberto (e é decisão, não esquecimento)

- O custo da morte na aventura é zero além da caminhada — se a mão disser que ficou barato
  demais, o knob é largar uma fração das moedas no lugar da queda.
- Os tesouros de d4/d5/d7/d8/d9 são kits (graveto/pedra/coração) porque metade dos itens do jogo
  não tem uso no overworld de hoje (key sem porta, bomba sem bombSpot, botas sem lava, bateria
  sem circuito). Quando o mundo ganhar essas fechaduras, os tesouros sobem de degrau.
- O cerco de undead voltou junto com a loja (a flag desligava os dois) — com 363 covas autoradas
  E o cerco, a noite pode ter ficado dura; o dial é o `UndeadSpawnDirector`, não as covas.
- Os NPCs continuam com as meta-piadas de alpha — são a voz do jogo; só o mago mudou.

## 2026-08-05 — A lei do quadro: o que a tela não mostra não fala, não atira e não liga música

**A queixa**: "ainda ouço inimigos que não consigo ver." Três fontes, todas medidas no jogo real:

1. **O quadro é muito menor do que os alcances assumiam.** Medido projetando tiles pela câmera de
   verdade (1280×800, tileSize ~105px): o enquadramento vai a **~4,5 tiles pros lados, ~6,5 pro
   NORTE e só ~2,5 pro SUL** — a câmera inclinada comprime o longe (cabem 6 fileiras acima do
   herói) e engole o perto (2 abaixo). O retângulo plano do `getVisibleRange` (13×8 ÷ 2) mente nas
   quatro bordas. Enquanto isso: IA ativa a 15 tiles, cova acorda a 14, torreta atira a 9, mago
   conjura a 8, zora emerge a 8. Metade do bestiário vivia gritando (e atirando!) de fora da tela.
2. **Sons sem posição.** Todo SFX de bicho tocava a volume cheio viesse de onde viesse — o plop da
   gosma VAGANDO fora da tela era o pior ofensor de repetição; o estrondo da cova a 14 tiles, o
   pior de susto.
3. **A trilha de perigo contava corpo invisível.** `aliveCount > 0` ligava a música de combate com
   uma caveira congelada (além dos 15 da IA) atrás do herói — tela vazia, música de luta, minutos.

**A decisão de desenho — por que NÃO congelar o bicho fora do quadro** (que era a leitura literal
do pedido): movimento fora da tela é mecânica sancionada pelas leis da casa — o cerco PERSEGUE, a
caveira MARCHA até a placa (a marcha cruza o quadro; congelada na borda, o portão eletrônico nunca
abriria), "chegar é um evento". Congelar quebraria `placa-undead`, o cerco do explorador e as
fixtures de `fauna`/`inimigos` inteiras. O que fere a percepção não é o corpo andando invisível —
é ele SOAR e FERIR de onde não se vê. Então a lei ficou: **fora do quadro o corpo existe e anda,
mas não fala, não inicia golpe e não conta pra trilha.**

**As peças** (o predicado é `GameScene.isTileFramed` — projeção real via `tileToScreen`, folga de
meio tile pros lados e um tile abaixo da borda de baixo, nada acima porque o corpo desenha pra
CIMA dos pés; instalado como static em `EnemyBase.setFrameGate` a cada update do EnemyManager):

- **Início de ataque**: `startWindup` (base, todos os corpo-a-corpo), carga da torreta, conjuração
  do mago, agachada da aranha, emersão do zora (o teste é no TILE de emersão, não no corpo
  submerso). Relógios param junto (o padrão que a torreta já usava fora de alcance): enquadrar um
  atirador não pode receber o jogador com um leque instantâneo acumulado.
- **Voz**: plop da gosma, susto de notar (a caveira enxerga a 14 — o sopro dela era voz de bicho
  invisível), chegada do walker (o flag consome mesmo sem plateia: a voz pertence ao instante),
  garra e estrondo da cova, mergulho do zora. Windup/whiff não precisaram: windup agora só nasce
  enquadrado.
- **Trilha**: `EnemyManager.framedAliveCount` no lugar de `aliveCount` SÓ na decisão de música —
  o teto do cerco e o snapshot continuam contando a população inteira.
- **Leituras novas de playtest**: `state.music` (a trilha PEDIDA, `SoundManager.requestedTrack`) e
  `framed` por corpo no snapshot.

**Verificado no jogo real** (sonda Playwright muda): torreta a +7 do herói (alcance 9) → 9s sem um
tiro, `framed:false`, trilha em `overworld`; a mesma a +3 → leque de 6. `projeteis` ganhou a seção
4 ("a lei do quadro") cobrando exatamente isso — inclusive que a trilha não liga por corpo fora da
tela. As fixtures existentes sobrevivem por geometria: os atiradores de `projeteis` ficam ao NORTE
do herói (onde o quadro alcança −6), o rio do `zora` está a dx+3, e `inimigos`/`fauna` não
assertam som. O risco residual anotado: `fauna` espera o bote da aranha vindo do SUL (dy+4 =
desenquadrada); ela agora precisa andar até dy+3 antes de agachar — um passo a mais dentro de um
waitForFunction folgado.

**Armadilha para o futuro**: qualquer som ou ataque novo de bicho nasce DENTRO desta lei — o
gate é de graça (`this.framed` / `this.tileFramed(x,y)`), e um evento novo sem ele reabre
exatamente o bug que esta tarde fechou.

---

## A tocha viva — fogo que alcança um corpo o acende (2026-08-05)

**A frase**: empurrar um monstro contra o fogo o transforma numa fogueira em pânico que corre do
herói acendendo o que toca — e os outros monstros a temem como temem a luz. Não é um sistema novo:
é a soma de três leis que já existiam e nunca tinham se encontrado. (1) O encontrão (`shove` →
`'slammed'`) já dizia que encurralar contra parede é a jogada boa, e a melhor parede do jogo sempre
foi o fogo; (2) fogo já era o único sistema que o jogador CONDUZ (`igniteFlammableAt`), só faltava
o corpo do monstro entrar no grafo de combustível; (3) luz de fogueira já era parede para todo
monstro — a tocha viva é essa lei ganhando pernas.

**Como acende** (todas as portas passam por `GameScene.igniteEnemy` → `EnemyBase.igniteBody`):
- **fogo que chega no tile de um corpo** — `igniteFlammableAt` agora tenta acender o ocupante
  antes dos objetos. Isso cobre o espalhamento (um pulso que alcança o tile de quem ficou parado
  na frente do fogo), o pavio, a bomba acendendo o mato e o RASTRO de outra tocha viva — um buraco
  de fechadura só, nenhuma segunda tabela;
- **o encontrão contra fogo** — `'slammed'` com `fireOnTile` no tile da parede: fogueira ACESA,
  arbusto/mato em chamas, lava, graveto aceso no chão. Só o tile que ARDE conta — bater na borda
  da luz (a parede invisível de `isTileLitByCampfire`, ~4 tiles) não acende nada. Luz repele,
  fogo queima: são duas respostas distintas de propósito, é assim que se ensina a diferença;
- **o arremesso que POUSA em fogo** (`'moved'` + `fireOnTile` no tile de chegada) — o graveto
  aceso largado no chão como armadilha, e a lava para quem voa por cima.

**O que o corpo em chamas é** (`EnemyBase`, zero mudança em qualquer espécie): o `EnemyManager`
troca o update da espécie por `updateBurning` — não caça, não arma golpe, não atira. Corre DO
herói (`moveAway`, cadência 190ms vs 260 do passo de caça), e isso é alavanca, não detalhe: andar
sobre a tocha viva a CONDUZ para onde se quer que o fogo vá, igual se conduz o fogo de chão. Cada
passo, `emberTouch` (static instalado pelo GameScene, o desenho do `frameGate`) tenta acender o
próprio tile + 4 vizinhos. Quem escreve a própria posição (torreta, zora — o mesmo `canBeShoved`)
arde PARADO. O fogo come o corpo em 2,6s e o mata de verdade (`die()`, marca no chão) — morte por
fogo não paga moeda (`rewardKill` é só do golpe): o fogo comeu o corpo, e uma AoE que pagasse
viraria fazenda.

**Por que não é dano por tique**: fogo MATA neste jogo (o graveto aceso é a única coisa que ainda
mata de um golpe — a chama é o topo da escada). Uma espécie "meio queimada" sobrevivente ensinaria
que fogo é arranhão. E a ignição NÃO passa por `takeDamage` de propósito: o caminho do dano tem
i-frames, que estão SEMPRE correndo no instante do encontrão (o arremesso veio de um golpe) — fogo
que respeitasse i-frames nunca acenderia ninguém.

**O medo da matilha**: no `blockedForEnemy` do EnemyManager, tile a Chebyshev ≤1 de um corpo em
chamas é parede para os outros — a lei da luz no raio de um corpo. Duas consequências desenhadas:
a matilha ABRE para a tocha viva passar, e o fogo não pula de corpo em corpo de graça — só alcança
quem já estava colado quando ela acendeu (ou quem ela alcança correndo, já que o halo não bloqueia
a própria tocha).

**A luz sem quebrar a lei mais cara**: `FireLight3D` ganhou `setPosition` — move a ENTRADA do pool
(`fires[]`), nunca cria luz. A entrada anda com a posição VISUAL do corpo (knockback incluso — a
lei do overlay ancorado em `visualWorld`), o slot THREE é emprestado por proximidade de câmera
como sempre, e a cache de sombra (`fireCastLists`) invalida só na troca de TILE, senão um fogo
ambulante pagaria uma varredura de `solidTiles` por frame. As chamas no corpo são a arte da tocha
do herói (`tiny-fire-0..2`), o corpo embaixo CARBONIZA multiplicativo via `restoreTint` (a lei do
escurecer — acender billboard emissive é silhueta chapada), e a voz da morte tem o gate do quadro
(`framed`): o rastro costuma terminar longe de onde começou.

**Quem não arde**: só quem vive na água (`AQUATIC_ENEMY_KINDS` — a lista de espécie, não um
override por classe). A gosma arde e a máquina arde: o graveto aceso já matava as duas, a chama
não escolhe alvo.

**Guarda**: `npm run playtest -- tocha-viva` — ignição por fogo-no-tile, zero luz THREE nova
(compara `stats().pointLights` antes/durante/depois), fuga para longe do herói, fogo pulando para
a segunda caveira, rastro acendendo mato autorado, morte com marca e a entrada devolvida ao pool.

**Armadilha para o futuro**: espécie nova que escreva a própria posição precisa de
`canBeShoved = false` TAMBÉM por causa do pânico (a tocha viva usa o mesmo flag para decidir se
corre); e um caminho novo de fogo que não passe por `igniteFlammableAt` não acende corpo nenhum —
o corpo é combustível DAQUELE grafo, não de qualquer chama desenhada.

---

## O congelamento — a bola do zora não fere: TRAVA (2026-08-05)

**A frase**: o cuspe do zora deixou de ser dano e virou CONTROLE — o que a bola toca congela num
bloco de gelo por 2,4s: trava, não fere, e depois volta. E "o que a bola toca" é deliberadamente
QUALQUER COISA: bicho, NPC, o próprio herói, item no chão, árvore (prop ou tile), arbusto, mato,
caixote, pedra. A espada fecha o laço: balançada com a bola dentro do arco, ela a DEVOLVE — a bola
volta pelo caminho que veio, fria e do herói, e congela o bicho que tocar (o zora que a cuspiu,
se ainda estiver de pé — a janela da espécie vale também para a bola dela).

**A arquitetura — um sistema, zero cópias** (`runtime/FreezeManager.ts`):
- **O gerenciador conhece UMA coisa**: alvos congelados (posição, relógio, dois ganchos
  onFreeze/onThaw, follow para estátua deslocada, stillValid para alvo que morre no meio). Quem
  sabe o que existe num tile e o que "travar" significa para cada coisa é o
  `GameScene.freezeAtTile` — a lista inteira de "qualquer coisa" mora num método só.
- **Todo gate é ESPACIAL**: `frozenAt(tile)` — porque neste jogo tudo mora num tile. O machado
  recusa a árvore no gelo, a picareta a rocha, a tocha a fogueira morta (um gate só no topo da
  tabela do `useItemAt`, não um `if` por linha), o B não pega item preso nem conversa com NPC
  congelado, o esbarrão não empurra caixote nem gira portão — e o BICHO congelado não cobra dano
  de contato (uma estátua não morde: é exatamente o prêmio). Nenhum alvo carrega flag próprio além
  do inimigo (`isFrozen`, que o EnemyManager lê para pular o update da espécie — o mesmo desenho
  da tocha viva: **nenhuma das sete espécies sabe que gelo existe**).
- **A recusa é FÍSICA** (a lei da casa): bater no gelo sacode o bloco (`pulse`), nunca abre texto.
- **O degelo é telegrafado**: nos últimos 500ms o bloco treme e clareia — o relógio que fecha, a
  mesma gramática do anel de windup. Estátua deslocada (o arremesso desliza) leva o gelo junto
  (`follow` lê a posição VISUAL — `EnemyBase.visualX/Y`, a lei do overlay ancorado no desenho).

**Fogo e gelo se anulam, nos dois sentidos**: fogo que chega num tile congelado DERRETE o gelo e
se gasta nisso (`meltAt` na primeira linha do `igniteFlammableAt` — vapor, nada acende naquele
pulso; o seguinte queima normal); a bola de gelo num corpo EM CHAMAS apaga o fogo em vez de
congelar (`extinguish` — o zora salvando a matilha da tocha viva é jogada emergente dele). E
fogueira ACESA nem congela: só vapor. Nenhum dos dois estados existe por cima do outro.

**A bola** (`EnemyProjectile`): o cuspe continua um tiro comum — parede mata, luz não, escudo
apara (encarar a bola ainda a bloqueia: a lei do tiro vale inteira). O que mudou é o IMPACTO:
`ShotImpact` sempre carregou o `kind`, e agora `EnemyHit.shotKind` o leva até o
`handleEnemyAttackPlayer`, que para `spit` congela em vez de ferir — sem gastar invencibilidade
(congelar não é apanhar). Bola que morre num tile emite `ShotLanded` e o que estiver ali congela.
A REBATIDA usa o MESMO arco do golpe (`reflectAt` recebe os tiles do `sweepArc` — nenhuma hitbox
nova): só o cuspe aceita, a bola inverte a velocidade, ganha tint frio e passa a colidir com
BICHO — a única bala do jogo que fere... congela... um inimigo, e só porque a espada a devolveu.
O "momento certo" não é relógio novo: é a bola dentro do arco durante o gesto.

**O herói congelado**: pés na raiz (`root(FREEZE_MS)`, re-aplicada por frame — cinto e
suspensório contra qualquer caminho que devolva os pés cedo), botões na cadência
(`playerStaggerMs` via `Math.max` — um golpe de corpo no herói-estátua não pode devolver os
botões), corpo frio, e DANO ZERO. O perigo é a matilha chegar enquanto você é estátua. Contra o
stun-lock: já-congelado não recongela (dedupe por id) e o degelo dá 1,3s de imunidade
(`HERO_FREEZE_IMMUNE_MS`) — um passo e meio para sair da linha de tiro.

**O gelo desenhado sem quebrar lei nenhuma**: textura procedural nova (`FX_ICE_TEXTURE`, cristal
facetado BRANCO desenhado em canvas, NEAREST — o tint decide a cor, como todo FX da casa), bloco
translúcido (o alvo continua legível DENTRO — a informação é "aquilo, travado", não "um cubo
novo"), `emissive` sem luz THREE nenhuma, shimmer/captura/tremor todos DERIVADOS de relógio (zero
tween por estado — a economia da piscada de i-frames), estilhaço que CAI no degelo (gelo tem
peso) e vapor no derretimento. Sons reaproveitados (`playBladeGlance` frio para congelar/quebrar,
`playGuardBlock` — o tim do aparo — para a rebatida), todos com o gate do quadro.

**Cenários**: `gelo` (novo) — estátua que não anda e volta, herói travado sem perder vida, a
rebatida com `reflected` e velocidade invertida congelando a caveira do caminho, e fogo×gelo
(derrete-e-gasta, fogueira acesa recusa). `zora` foi ATUALIZADO à mão nas seções 3 e 6 (mudança
de design: onde cobrava "o cuspe fere", cobra "o cuspe congela sem ferir" — inclusive sobre água
pintada) — não é flake, é o contrato novo.

**Armadilhas para o futuro**: coisa nova que interaja por tile (um gesto novo de B, uma mecânica
de esbarrão) precisa perguntar `frozenAt` OU aceitar que gelo não a trava — a lista de gates é
consciente, não automática; e um caminho novo de FOGO que não passe por `igniteFlammableAt` não
derrete gelo (o guarda de `igniteBody` segura o corpo, mas prop congelado ficaria à prova de fogo
em silêncio).

### Rodada de verificação do gelo e da tocha viva (2026-08-05, à tarde)

`gelo` e `tocha-viva` verdes de ponta a ponta, depois de consertar DUAS asserções minhas que mediam
corrida em vez de contrato — o mesmo erro, duas vezes: **efeito agendado não se amostra, se
espera**. (1) A prova da rebatida era um snapshot 200ms depois do golpe — mas a caveira vem
ANDANDO na direção da bola devolvida e o voo de volta pode durar menos que isso; a prova virou
"reflected em voo OU o bicho já congelado". (2) A ossada só cai quando o desmanche termina
(~310ms depois de a vida zerar); `corpseCount` no frame em que a lista esvazia via 0 — virou
waitForFunction.

**Vermelho PRÉ-EXISTENTE anotado (não é do gelo nem da tocha viva)**: a seção 6 do `zora` ("água
pintada") falha porque o zora do LAGO nunca emerge/cospe com o herói teleportado à margem — A/B
limpo: falha idêntica em `414b4cb` (antes de qualquer mudança desta sessão), `1b63bec` e na main.
As seções 1–5 passam, incluindo o contrato novo do cuspe-que-congela no zora do rio. Fica como
investigação separada: o suspeito natural é o teleport direto (`playerWorld.worldX = x`) não
acordar o que o SURFACE_RANGE do zora lê, ou uma regressão antiga na própria fixture.

---

## O lab abre dungeon — `/lab?dungeon=N` (2026-08-05)

**O que faltava não era o editor, era a PORTA.** A grade do editor sempre foi guiada pelo meta do
arquivo (é assim que o /editor edita o overworld 22×8), então as 17–57 salas de uma dungeon
entram sem uma linha de mudança no desenho. O que barrava: o resolver do `/api/world` rejeitava
`dungeon-N`, o tipo `WorldFileId` do client não o endereçava, e o /lab não tinha query para
pedi-lo. Três remendos pequenos: o resolver aceita `(level|dungeon)-N`, o tipo ganhou o membro, e
`?dungeon=N` vence `?level=N` na escolha do arquivo (um parâmetro por vez — `openLabFile` limpa o
outro ao navegar). O P joga a dungeon EDITADA em memória com `activeLevel = N` (mesmo pause, mesmo
reiniciar), o ESC volta, o Salvar grava no `dungeon-N.json`.

**O bug latente que a mudança consertou por tabela**: `syncLabLevelIndex` reescreve o
`index.json` a partir de `listLabLevels()`, e a lista só enxergava `level-N` — o primeiro salvar
do lab APAGARIA as nove dungeons do manifesto que o título e a seleção de levels leem. Com as
dungeons na lista (com `kind: 'level' | 'dungeon'` e a mesma ordem de sempre), a projeção
preserva tudo. O `+ Criar` filtra por kind na numeração, senão o segundo level de puzzle nasceria
como level-10 (as dungeons ocupam 1..9).

**O gerenciador virou id-aware** (`level-3` e `dungeon-3` colidem no número): abrir funciona para
as duas famílias (rótulo `D3` vs `#3`), renomear/apagar continuam SÓ de level — dungeon é
conteúdo fixo, edita-se e nunca se apaga pelo lab — e o fallback pós-remoção filtra por kind
(cair numa dungeon de 50 salas porque um puzzle 12×12 sumiu seria o susto errado).

**O segundo bug destampado, este com anos**: `World3D.dispose()` fazia `material?.dispose()` — e
a alvenaria de CUBO das dungeons usa material em ARRAY (teto/lados agrupados), onde
`array.dispose` não existe. O ESC de volta ao editor estourava no meio do teardown e o wake nunca
chegava (UI morta). Ninguém viu porque nenhum caminho anterior fazia teardown com um mesh
multi-material vivo: os levels 12×12 não têm cubo, e da aventura não se sai por ESC. O dispose
agora trata `Material | Material[]`.

**Guarda**: `npm run playtest -- lab-dungeon` — a Águia inteira no editor (48 chunks), o API
servindo `dungeon-N` e rejeitando id torto, as duas famílias na lista (a prova do manifesto),
edição em memória viajando pelo P (arbusto plantado aparece no jogo), ESC devolvendo a UI viva e
o arquivo em disco intocado (P nunca salva).

## As nove dungeons passaram a ser GERADAS — e a lembrar-se de si (2026-08-05)

Elas eram nove arquivos de 95–183 KB, extraídos pixel a pixel dos mapas do Zelda 1
(`gen-zelda-dungeons.mjs`). Continuam no repositório — `?dungeons=static` ainda as joga, e a lista
de levels nunca deixou de jogá-las —, mas a aventura agora **gera** as nove a partir da semente da
partida, e uma vez geradas elas são **daquele save para sempre**. O plano inteiro, com as fontes
que o sustentam, está em [`plano-dungeons.md`](plano-dungeons.md).

**O diagnóstico que mandou no projeto:** a dungeon de ontem era *arquitetura sem verbo*. 57 salas e
157 covas na nona, nenhuma tranca, nenhuma chave, nenhum atalho — o que ela pedia do jogador era
andar até o fim. Copiar isso proceduralmente daria labirinto, e labirinto grande é a definição dos
10.000 pratos de aveia. Então o gerador não gera *plantas*: ele gera **missões**, e só depois as
embute num mapa.

### As cinco camadas (`src/game/dungeon/`, TypeScript puro — nada de Phaser, nada de Three)

1. **O brief** (`dungeonBriefs`) — o que o gerador NÃO tem permissão de sortear: o tesouro (a
   escada picareta→balde→foice→machado de aço, de que o overworld depende), o pool de espécies, o
   número de salas (10 a 20, contra as 57 de antes) e o marco daquela dungeon.
2. **A missão** (`dungeonMission`) — um catálogo autorado de cinco **ciclos**, não uma árvore:
   entrada → dois arcos independentes → antessala → *[fechadura]* → objetivo. É o achado do
   Unexplored: num loop cabe level design (a chave num arco, a porta no outro, a volta por onde
   não se veio); numa árvore, voltar é sempre desandar o mesmo corredor.
3. **O espaço** (`dungeonLayout`) — busca com retrocesso que pendura o grafo numa grade de salas.
   Aresta = parede compartilhada com porta; nada de corredor inventado no meio.
4. **A sala** (`dungeonRooms`) — **a sala passou a ser UM CHUNK 12×12**, contra os 16×11
   desalinhados que vinham do cartucho. Paga em quatro lugares: sala = tela (a câmera enquadra um
   chunk), "uma espécie por tela" vira literal, a densidade de covas já se media por chunk e o
   editor já autora chunk. Anel de 1 tile por sala = 2 tiles de alvenaria entre vizinhas.
   As faixas de cada porta até o miolo são **reservadas antes** de qualquer forma ser pintada: a
   conexão é anterior ao desenho, e o que sobra de ilha o flood-fill final alaga de parede.
5. **O juiz** (`dungeonVerify`) — o único que pode dizer não. BFS **com estado** (⟨tile, fechaduras
   abertas⟩), num ponto fixo monótono que só converge porque nada neste jogo se desfaz: a chave não
   se gasta, o caixote fica na placa, o portão que subiu não desce. Reprovou → próxima semente (24
   tentativas) → depois disso, um layout linear de emergência. Nunca chega ao jogador uma dungeon
   sem prova.

### As duas descobertas que custaram (e o que elas ensinam)

**A paridade da grade.** Metade das missões era **impossível de embutir** e ninguém sabia: toda
grade é um grafo bipartido, então todo ciclo dela tem comprimento par — e um anel de `2 + lenA +
lenB` com arcos de paridades diferentes não existe em grade nenhuma. O layout gastava seis
reinícios provando isso. Medido antes: 1.744 recusas em 1.800 sementes e uma cauda de **499 ms** na
dungeon 9. Depois de forçar `lenB ≡ lenA (mod 2)`: 186 recusas e **19 ms** de pior caso.

**O grau máximo é quatro.** Uma célula tem quatro lados, então um nó com cinco arestas trava toda
semente. A antessala já nasce com três (arco A, arco B, objetivo) e por isso aceita **um** beco; um
nó de arco aceita dois. Sem esse teto, a dungeon 9 caía na emergência em 1 de cada 4 sementes.

### Duas fechaduras que o jogo tem e que ficaram de fora, com o motivo medido

- **Portão de bater como atalho de mão única** — *não existe*. Quem decide "o lado de lá" é o
  SENTIDO DO ESBARRÃO (`isTileOccupied(wx+dx, wy+dy)`), então bloquear o tile de trás para proibir
  um lado bloqueia junto o tile onde o herói precisaria estar para abrir pelo outro. Ele é uma
  fechadura de MUNDO (queime o mato do outro lado, mande o braço), não de direção.
- **O fogo que abre** — dentro de uma dungeon não há fonte de fogo, e não pode haver: fogueira
  acesa é parede para todo monstro. Sem fonte, a tocha depende do que o jogador trouxe — e uma
  fechadura assim tranca a dungeon.

Sobraram **a chave** (`lockedDoor` + `key`, que não se gasta) e **a placa** (caixote empurrado numa
`pressurePlate` que energiza dois `electronicGate` por cabo). A placa é construída em coordenada de
FAIXA, uma geometria só servindo aos quatro lados, com a coluna de passagem deliberadamente limpa —
senão o próprio caixote que resolve o puzzle selaria o corredor.

### O retrato: 2,9 KB onde o arquivo custava 95

O save guarda a **classe** de cada tile (chão/parede/fosso/rachado/tocha) em RLE e recalcula a
**arte** da semente. Medido nas dungeons antigas, que são o pior caso: 95 KB de JSON viram 31 KB se
alguém gravar o frame e **4,0 KB** gravando o significado — os 31 KB do meio são a medida do erro
que isso evita, porque a variante de piso é sorteada tile a tile e gravá-la é gravar ruído.

E a ordem de leitura é a promessa: **retrato primeiro, semente só se não houver retrato**. O
retrato é gravado JÁ NA ENTRADA (senão a primeira aba fechada apagaria a dungeon recém-nascida) e
de novo na saída e na morte (o runtime edita os arrays de chunk no lugar, então fotografar é
fotografar as edições). Assim um deploy novo do gerador não remonta o mundo de quem está no meio da
descida — a semente só decide o que ainda não existe.

### A folha de peças — `/lab?dungeon=0`

Cada chunk de `public/levels/dungeon-0.json` é uma sala-template, e de que lados ela tem porta se
**deduz da geometria** (nada de metadado a dessincronizar). Cada peça serve a até 8 assinaturas (4
rotações × espelho). O zero não é decoração: os portais do overworld apontam para 1..9, então ela é
inalcançável por dentro do jogo e editável por fora (o `EditorScene.worldFileId` passou a aceitar
`>= 0`). `node scripts/seed-room-templates.mjs` semeou oito salas que as formas paramétricas não
sabem fazer — espiral dupla, ponte em L sobre o poço, claustro — e **se recusa a sobrescrever** o
arquivo depois disso: a folha é autorada.

### Medido — `npx tsx scripts/audit-dungeons.ts --seeds 150` (1.350 sementes)

| # | salas | caminho (tiles) | alcance | tentativas | ms (mediana/pior) | retrato |
|---|---|---|---|---|---|---|
| 1 A Águia | 10-11 | 47-69 | 100% | 1/3 | 3/14 | 1,9 KB |
| 5 O Lagarto | 14 | 47-87 | 100% | 1/3 | 6/15 | 2,9 KB |
| 9 A Morte | 20 | 49-101 | 100% | 1/1 | 9/16 | 4,1 KB |

Zero reprovadas, zero emergências, ciclos distribuídos entre 12,9% e 25,9% (nenhum morto no
catálogo), e o **retrato fecha o ciclo em todas**: gerar → fotografar → hidratar → fotografar de
novo dá bit a bit a mesma coisa. Nove dungeons de um save ≈ **26 KB**. A geração roda dentro da
travessia do portal, que já dura ~1,5 s — o orçamento era 150 ms e o pior caso medido é 19.

O caminho crítico **cresce com a dungeon** (47-69 na primeira, 49-101 na nona) porque o comprimento
dos arcos escala com o brief; sem isso a nona era larga (vinte salas) e rasa (o tesouro a cinco
portas da escada), já que tudo o que o brief pedia a mais virava beco opcional.

**Guarda**: `npm run playtest -- dungeon-gerada` — a dungeon nasce ao descer, volta idêntica depois
da escada, atravessa o reload da aba, `?dungeons=static` ainda lê o Zelda 1 do disco, e "Start over"
cunha outra semente. A qualidade da planta em massa é da auditoria, não do Playwright: o gerador é
TS puro de propósito, e medir 1.350 sementes num `tsx` custa segundos onde o browser custaria horas.

## A bolsa — trocar de item com o jogo RODANDO (2026-08-05)

A mochila tinha uma porta só, e ela congelava o mundo: `ESC` → a subtela do Zelda (corações,
grade de itens, mapa), com `scene.pause()` por baixo. Isso responde bem à pergunta *"o que eu
tenho?"* e responde errado à outra, que é a que aparece o tempo todo desde a reforma do combate:
*"preciso da picareta AGORA, com a caveira em cima de mim"*. Com o mundo parado, essa troca custa
zero — e escolher a ferramenta certa deixa de ser uma decisão para virar burocracia entre dois
golpes.

A **bolsa** (`src/game/runtime/QuickBag.ts`) é a segunda porta, e a diferença dela é uma só: **ela
não pausa nada**. O fogo continua se espalhando, a caveira continua vindo, o relógio da cena
continua andando. É o contrato de The Last of Us — a mochila é um lugar perigoso de se estar.

- **`I` no teclado, um botão de bolsa no dedo** (círculo logo acima do par A/B, no alcance do mesmo
  polegar). O `I` era do **DevLauncher**, que passou a atender só a **Shift+I** — ele já era Shift+I
  dentro do editor (lá o `[I]` é o conta-gotas), então a regra ficou uma só em vez de depender de
  onde você está. Uma tecla de ferramenta de dev não pode disputar a tecla de um gesto do jogo,
  nem "só no localhost", que é exatamente onde o jogo é testado.
- **Só para os lados, e a ação confirma.** O cursor anda com ← →; o **X** (o próprio botão B —
  a bolsa decide o que o B carrega, então é o B que fecha o assunto) equipa e fecha. Apontar e
  equipar são **dois gestos**: trocar de item sem querer, com um bicho em cima, seria pior do que
  não trocar. No dedo, o primeiro toque num ícone aponta e o segundo equipa — mesma frase.
- **O que está na mão AGORA tem marca própria** (um ponto de brasa sob o slot), separado do anel
  do cursor. Sem isso "onde eu estou olhando" e "o que o B usa" viram a mesma leitura, e são
  justamente as duas coisas que este desenho separou.
- **Grande, e no MEIO DO QUADRO** (slots de 76px, nome em 23px, tudo centrado nos dois eixos): a
  bolsa é a coisa que você está fazendo agora, e a primeira versão — uma fileirinha de 44px no
  rodapé — lia como HUD, aquela tarja que se aprende a ignorar. O que ela **não** tem é moldura:
  sem caixa, sem título, sem borda opaca, só os ícones sobre o mundo e uma **faixa** de sombra que
  some para cima e para baixo. Escurecer a tela inteira diria "o jogo parou", que é a única coisa
  que este modo não pode dizer; a faixa deixa ver o que se aproxima. A fileira **desliza sob o
  cursor** (uma bobina, não uma grade que cresce): com quinze itens continua sendo uma fileira, e
  as medidas moram num lugar só (`SLOT_PX`/`GAP_PX`/`PAD_X`) porque a CSS e a aritmética do deslize
  são a mesma bobina vista de dois lados — um slot mais largo do que a conta supõe descentra o
  cursor, e o erro se acumula slot a slot.
  O preço de estar no centro é honesto e foi escolhido: a fileira passa por cima do herói, que fica
  no centro da tela. É o mesmo trato do resto do modo — folhear custa alguma coisa.
- **O preço de folhear**: os pés presos (`PlayerMovementController.hold` — é `root` sem relógio,
  então o passo em curso TERMINA no tile em vez de congelar em cima de uma aresta) e os dois botões
  calados (`canAct`). O escudo cai junto, porque `isRooted` passou a incluir a bolsa: quem está com
  as duas mãos dentro da mochila não apara tiro nenhum.
- **Apanhar FECHA a bolsa.** Ela é a única tela do jogo que fica aberta com o mundo correndo, então
  é a única que o mundo pode fechar. Um herói apanhando enquanto folheia calmamente uma fileira de
  ícones desmente, num quadro, a promessa inteira do modo. Virar estátua (o cuspe do zora) idem.
  O **atordoamento atravessa** a abertura, ao contrário da pausa: apagar a pancada que o herói
  acabou de levar seria comprar tempo de recuperação abrindo um menu.

### A armadilha que isso desenterrou: o B repetia

`GameScene.pressUse` nunca filtrou a repetição de tecla do navegador — o `pressAttack` filtra desde
sempre (`event.repeat`), o B não. Com a bolsa atrás da mesma tecla isso virou um bug de verdade:
segurar o X um instante a mais para equipar fazia o primeiro `keydown` **confirmar** o item e a
repetição seguinte, já com a bolsa fechada, **usá-lo** no tile da frente. O conserto é a mesma
linha que o A já tinha, e ela também deixa os dois botões coerentes: quem quer usar duas vezes
aperta duas vezes, e a cadência (`USE_COOLDOWN_MS`) continua separando os apertos.

Pela mesma razão, a bolsa **não escuta tecla nenhuma**: a cena está VIVA por baixo dela, então todo
teclado continua chegando ao Phaser, e um segundo ouvinte faria cada tecla acontecer duas vezes
(confirmar o item e, meio milissegundo depois, usá-lo). `I`, `←`, `→`, `X` e `ESC` são roteados num
lugar só, na `GameScene`, antes de decidir o que o herói faz.

A subtela do `ESC` **continua existindo** e não perdeu nada: ela é onde moram os corações, o mapa e
a contagem — as perguntas que valem a pena congelar o mundo para responder. A bolsa é a pergunta
que não vale.

**Guarda**: `npm run playtest -- bolsa` — o relógio da cena andando com a bolsa aberta, os pés
presos, o cursor que anda sem equipar, o X que equipa sem usar, e a pancada que fecha.

## A pá — o buraco de plantio vira decisão do jogador (2026-08-06)

O loop da fazenda tinha um lado autorado que ninguém notava: a foice produz a semente, o balde
rega, o mato brota — mas o **buraco** (`plantSpot`) só existia onde o editor o tivesse posto.
Mato novo em lugar novo era privilégio de quem edita o mundo, não de quem joga. A **pá**
(`shovel`) fecha esse lado: B num tile de **terra nua** cava um canteiro de verdade — o mesmo
`PlantSpotObject` dos autorados, então semente, balde, brotação e reabertura já o conhecem sem
uma linha nova. Cavar É produzir (um tile que aceita semente), então ela passa no teste do "o
que ele *faz*?" sem virar senha.

- **A fechadura dela é o FRAME do chão, não "qualquer tile andável"** (`DIGGABLE_GROUND_FRAMES`
  = os dois frames de "Terra", 5 e 6). Pátio de pedra, laje, alvenaria de dungeon e mar recusam
  a lâmina — o que mantém a resposta física E resolve o conflito estrutural do item: `useItemAt`
  devolvendo `false` é o que deixa o B **pousar** um item, e uma pá que cavasse todo chão andável
  seria a primeira ferramenta impossível de largar. Onde não há terra, ela descansa.
- **"Terra NUA" é a pergunta larga duas vezes** (`canDigAt`): `isTileOccupied` (parede, bicho,
  item, coração, bomba, o próprio herói) **e** nenhum prop nem não-bloqueante em cima — um toco
  de mato, uma marca de bomba, um cabo ou um canteiro já cavado são todos "este chão tem dono".
  O alvo é **reconferido no impacto** (150ms depois do golpe, o compasso do arbusto): tempo de
  sobra pra um corpo pisar no tile.
- **O buraco cavado é ESTRUTURA do jogador e entra no save como diff** (`dugSpots`, o padrão
  exato do `felledTrees`): a morte não pode apagar uma benfeitoria. Só a POSIÇÃO persiste — o
  estado do canteiro (monte, mato) é dos renováveis, como nos autorados. Overworld apenas:
  dungeon não tem terra (a lista de frames já diz isso), e level/explorador zeram por desenho.
- **A arte saiu do loop do spritefactory** (`shovel-icon.mjs`): empunhadura em T + cabo idêntico
  ao do machado (mesma empunhadura, cabeça diferente — a regra de família do great-axe) + lâmina
  de ferro fosco com fio de aço na aresta iluminada. A v1 arredondava a lâmina nos dois extremos
  e lia como concha de sopa; a v2 abre ombro largo direto do cabo e afunila 6-4-2 até a PONTA —
  que é a parte que entra no chão.
- **Ela é o tesouro da dungeon 4** (era um kit de 3 gravetos — o "sobe de degrau" prometido na
  auditoria): um degrau depois da foice (d3), que é a ordem em que o loop se completa na mão.
  Save antigo com a d4 já gerada mantém o kit (retrato primeiro, semente depois — o contrato).
- No mais: `MELEE_DAMAGE` 1.5 como toda ferramenta, aba Itens do editor, cerimônia de item-get
  ("DIG THE BARE EARTH" — instrução do próprio uso, o padrão das sementes e do balde), poster.

**Guarda**: `npm run playtest -- pa` — a terra vazia que vira canteiro e aceita a semente, a pá
que não se gasta, a pedra que recusa E recebe a pá pousada (as duas metades do `return false`),
e o save da aventura que um level não toca.

### O cavar mudou de botão no mesmo dia — o A usa o item segurado

A primeira versão pôs o cavar na tabela do B, porque era lá que "usar item" morava. O autor
corrigiu a gramática: **o botão de AÇÃO usa o item que está na mão** — a bolsa escolhe, o A
executa. A espada corta; a pá **bate no chão à frente e cava**. É a frase que o combate já
ensinava (o A é o golpe; bater na terra É um golpe), e ela desfez de graça o único atrito do
desenho anterior:

- **O B voltou a ser só pega/fala/pousa para a pá** — e com isso a pá pousa em QUALQUER chão
  livre, como todo item. A troca "onde há terra não se pousa" (o preço do cavar-no-B) morreu:
  o A nunca pousa, então cavar e pousar deixaram de disputar o mesmo botão.
- **O golpe da pá divide tudo com os outros golpes do A** (`swingAttack`): cadência, raiz nos
  pés, investida do corpo, o arco que sai mesmo no vazio. Num corpo à frente ele cobra a
  escada de item (1.5, `strikeEnemy 'item'`); em terra nua, cava (o impacto reconfere o alvo
  150ms depois); em pátio/laje/alvenaria, o arco sai vazio.
- **Segurar o A com a pá não carrega a lâmina rodopiante** (`tickSpinCharge` +
  `spinAttack`): o giro é da espada, e uma carga que nascesse de um corpo que o jogador viu
  cavando sairia de uma arma que o gesto não empunhava.
- A arte subiu para **v3** no mesmo passo: a lâmina de 2 tons lia como papelão (a lição do
  barril), e ganhou a meia-luz `#5d6165` (o stone escuro do great-axe) — mancha de luz gorda
  no ombro esquerdo afinando até a ponta, meia-luz em diagonal, massa na sombra. Cluster
  shading, nunca listra.

O princípio declarado ("a ação é sempre usar o item da mão") ganhou o segundo caso no mesmo
dia: **a SEMENTE** — o A mirando um buraco aberto PLANTA (no impacto, o compasso da pá, e a
semente só é gasta se entrou na terra); num corpo, o cutucão do item-não-arma; senão o arco
sai no vazio. O plantio saiu da tabela do B, que agora pousa a semente como item — **até em
cima do buraco aberto** (fica ali como item no chão, não plantada; o segundo B a pega de
volta). A lista `A_USE_ITEMS` + o `actionUseHeld` são agora o lugar único da gramática:
item novo que migrar pro A entra na lista (que os dois gates do giro leem) e ganha um ramo.
Estender aos demais (machado, picareta, balde...) segue decisão em aberto.

**Guarda (atualizada)**: `npm run playtest -- pa` — o A que cava a terra vazia e não gasta a
pá, a pedra onde o arco sai no vazio, **o B que nunca cava e pousa a pá mesmo sobre terra
cavável**, a semente que entra no canteiro cavado, e o save da aventura que um level não toca.

### O buraco fica SOZINHO no tile — a cavada engole o que estava pintado nele

Cavar num tile com grama baixa (o decor assado da camada upper) ou com uma ossada deixava
**três pinturas disputando o mesmo chão**: folhagem, osso e o recorte do buraco, empilhados. A
regra nova é física — revolver a terra engole a superfície:

- **A grama baixa sai das DUAS casas dela**: do dado (`chunk.upper[ly][lx] = null`, que é de
  onde qualquer reassado futuro lê) e da malha (`World3D.removeDecorTile`, novo — o mesmo
  colapso de quad do machado de aço, agora no `decorGeo`; o índice `decorQuads` cobre TODO
  decor, porque o `grassQuads` só rastreava o frame com rustle). O rustle ativo morre junto,
  e TEM que morrer: `updateRustles` reescreve posições absolutas por frame e ressuscitaria o
  quad colapsado no tick seguinte.
- **A ossada/mancha sai do `CorpseDecals`** (`removeAt`, via `EnemyManager.removeCorpseAt`).
  Ela é memória de sessão, nunca do save — por isso não entra no diff de boot.
- **O decor sob um buraco salvo não renasce**: `applyDugSpotDiff`, o irmão do
  `applyFelledTreeDiff` (mesmo compasso: ANTES do World3D assar), limpa a camada upper sob
  cada `dugSpot`. Só decor NÃO-sólido sai — um mundo re-autorado que puser árvore ou parede
  ali GANHA do save: o diff não derruba sólido, e a hidratação do buraco cede o tile
  (`isCellBlocked` pula o spawn) em vez de nascer dentro de rocha.

O `pa` agora pinta Folhagem no tile-alvo e deita uma ossada nele (pelo caminho real,
`CorpseDecals.drop`) antes do golpe — e afirma que depois da cavada `chunk.upper` é null e a
contagem de ossadas zerou: o buraco sozinho no tile.

### A cavada acontece AOS POUCOS — quatro tempos, e a terra tem peso

O buraco surgia num fade de 300ms: um desenho ligando, não uma cavada acontecendo. Agora:

- **`plant_hole.png` virou SHEET em coluna (16×64)**: o buraco pronto (frame 0, pixel a pixel
  o de sempre — no TOPO da coluna para toda referência `frame: 0` continuar valendo) + os três
  tempos da cavada: **raspão** (1, a primeira mordida da lâmina), **depressão** (2, a bacia
  rasa sem o poço), **fundo** (3, o buraco inteiro SEM os torrões externos). Cada estágio é um
  subconjunto do desenho final — a lição da flor-da-lua — e os torrões chutados pra fora do
  aro existem só no frame 0: eles aparecem na última pazada, no instante em que a última leva
  de torrões voa de verdade.
- **`PlantSpotObject.animateDigIn`**: um frame por batida (`DIG_STAGE_MS` = 110), e cada
  batida MORDE — o recorte encolhe um fio e assenta com `Back.easeOut`, que é o que separa
  "quatro desenhos trocando" de "uma cavada acontecendo". Os timers pendentes morrem no
  `destroy` (um restart no meio da cavada não pode avançar frames numa cena morta).
- **Torrões com física de terra** (`spawnDirtBurst`): o gesto das lascas da ponte com a física
  invertida — lasca voa e some no ar; torrão SOBE rápido, para, e CAI de volta, apagando só
  quando pousa (duas fases de tween, `easeOut` subindo e `easeIn` caindo, pousando um fio
  além de onde subiu: em volta do buraco, nunca dentro). Três levas que minguam (7→5→4→3, a
  primeira pazada tira o grosso), nas cores da própria arte do buraco.
- **A última batida assenta**: o baque surdo de pousar algo (`playFootstep`) + um tremorzinho
  do mundo na direção da pazada. Tudo no compasso de `DIG_STAGE_MS`, uma fonte só — mexer no
  número não dessincroniza som, terra e desenho.

O `pa` afirma o fim e não o meio (a lição do gelo): depois do settle, o recorte tem de ter
assentado no frame 0 — o buraco dos autorados.

### O balde estava furado pela lei das duas procedências — e a fazenda, trancada

A auditoria do "plantar é útil?" achou o cano: `fillBucket` só disparava no ramo do rio-PROP
(`getWaterAt`), e **a água do overworld inteira é TILE de terreno** (o gerador escreve rio,
lago e oceano como o frame do mar — zero props `water` no `world.json`). Consequência em
cadeia: o balde nunca enchia na aventura → o monte nunca era regado → **a fazenda era
impossível no modo principal**, e o tesouro da dungeon 2 era peso morto. Pior: o gesto era
MUDO — B mirando a água do mundo não fazia nada (o pousar recusa em silêncio porque o mar
bloqueia), a leitura de botão quebrado que a lei da recusa proíbe.

O conserto é a própria lei do zora: um ramo novo depois do rio-prop enche via
**`isOpenWaterAt`**, a resposta única para as duas procedências — e de graça ela já responde
certo sobre ponte, vau e canal drenado (deixam de ser água em cima dela). O `pa` agora fecha
o ciclo inteiro numa tela: cavar (A) → plantar (A) → **encher o balde num tile de mar
pintado, sem prop nenhum** → regar o monte (B) — com o balde voltando vazio pra mão.

O que continua faltando para plantar ser ÚTIL (design, não conserto — decisões em aberto):
nenhuma fechadura do overworld pede o pavio (a tocha resolve tudo; a trava natural é fogueira
morta atrás de flor-da-lua, que a chama na mão não atravessa — e não há flor no overworld),
o mato não tem demanda além do fogo (cerca viva contra o cerco já funciona e nada a pede; a
caldeira já aceita mato como calor e não existe caldeira no overworld), e o braço não planta.

## A REFORMA DOS DOIS BOTÕES: o A usa o item da mão — para TODOS os itens (2026-08-06)

O que a pá inaugurou e a semente confirmou virou a gramática inteira, por decisão do autor:
**"o item que o herói carrega no botão de ação é quando ele usa o item"**. Balde na mão + A
mirando o rio = bate com o balde e enche. E assim para tudo:

- **A TABELA DE ITENS INTEIRA mudou de botão** (`useItemAt`, agora chamada de `swingAttack`):
  machado→árvore, picareta→rocha, balde→água/monte/fogueira acesa, tocha→fogueira
  morta/arbusto/mato, chave→porta, pedra→vau/lava, graveto→ponte, bomba→marca, pá→terra,
  semente→buraco. O golpe divide tudo com os outros golpes do A (cadência, raiz, investida,
  pose), e quando a tabela devolve `false` o **arco sai no vazio** — o `false` deixou de ser
  "então pousa".
- **A ESPADA virou o que sempre deveria ser: um item empunhado.** O A corta com ela quando ela
  está SELECIONADA (era `inventory.has('sword')` — a espada na mochila armava o braço para
  sempre). Só ela tem o arco de duas fileiras, a rebatida e a carga do giro
  (`tickSpinCharge`/`spinAttack` agora leem `heldItem === 'sword'`). Mão vazia = soco.
  A_USE_ITEMS e actionUseHeld morreram: a lista era a migração pela metade.
- **O B ficou com três verbos: PEGA, FALA, POUSA.** Pousar também é depositar (bandeja, dock
  da bateria, o chão do braço) — e não precisa mais que a tabela inteira falhe primeiro. O
  gate de gelo que morava na tabela ganhou cópia no pousar (item sob o vidro, nunca).
- **Custo jogável honesto**: pegar item SELECIONA (a lei da mochila), então apanhar um graveto
  no meio da briga tira a espada do A até re-selecionar na bolsa — a bolsa-que-não-pausa é
  exatamente o preço desenhado para isso.
- **Dívida de migração dos cenários**: `caldeira` e `itens` chamam `s.useItemAt` direto
  (continuam válidos — só os comentários "o B" ficaram velhos); `esgrima`/`gelo` usam o Z com
  a espada injetada (ok se selecionada); `combate` guarda o CONTRATO ANTIGO dos botões e
  precisa de revisão de design, não de conserto. `espada`/`itens` seguem vermelhos por design.

**Guarda**: `npm run playtest -- pa` — o ciclo da fazenda inteiro na gramática nova (A cava,
A planta, A enche o balde no mar pintado, A rega; B pousa até sobre o buraco e nunca usa).

## A semente anda em PACOTE de 5 — e o pacote viaja com o item (2026-08-06)

Um corte de mato rendia UMA semente: plantar era trocar um mato por outro, um ciclo fechado
que nunca crescia. Agora o punhado que a foice derruba vale **`SEEDS_PER_PACK` = 5** na
mochila — plantar gasta uma por canteiro, então um corte rende uma FILEIRA, e a fazenda vira
amplificador de combustível de verdade (cada semente plantada volta como mato que rende outro
pacote). A bolsa e a subtela já mostravam contagem (`.zh-bag-count`), então "5" ficou visível
de graça; plantar uma deixa as outras quatro NA MÃO, selecionadas (a lei do `Inventory.remove`).

A regra que custou desenho: **o pacote VIAJA com o item no chão** (`ItemPickup.units`, o
contrato exato da carga da bateria — "a carga viaja, nunca se re-enche"). Sem isso, pousar 1
e pegar 5 era uma máquina de imprimir semente. Então: a foice derruba um pacote cheio (o
default do `ItemManager.drop`), sementes autoradas num mundo são um pacote cheio, **pousar
põe o punhado INTEIRO num item só** (e pegá-lo devolve a mesma contagem), a foto do save
guarda `count` por item (`AdventureGroundItem` — save antigo sem o campo lê como 1), e o
braço robótico carrega `carriedUnits` ao lado de `carriedFire`/`carriedCharge` — um punhado
de 3 que atravessa o muro chega como um punhado de 3.

**Guarda (atualizada)**: `npm run playtest -- pa` — o pacote pego do chão pelo caminho real
(+5 de uma vez, selecionado), o badge "5" no slot da bolsa, o B pousando o punhado inteiro
(um item, bolsa zerada) e pegando os 5 de volta, e o A plantando UMA com as QUATRO seguindo
na mão.

## A PLANTA CARNÍVORA — a colheita que se defende sozinha (2026-08-06)

A fazenda ganhou a segunda cultura, e ela diz a frase que nenhuma outra peça diz: **o corpo do
inimigo vira recurso do terreno**. A `carnivoreSeeds` (pacote de 5, como toda semente —
`SEED_PACK_KINDS`) planta no MESMO ciclo (buraco → monte → água), e o canteiro **lembra o que
recebeu** (`PlantSpotObject.sownKind`): semente comum brota mato (combustível), a carnívora
brota a `CarnivorousPlantObject` (defesa). Tesouro da dungeon 5 (era kit), na escada d2
balde → d3 foice → d4 pá → d5 a colheita que morde.

- **Todo inimigo que ENCOSTA é comido** (`updateCarnivorousPlants`): a cada frame, cada planta
  pronta olha os 4 vizinhos e dá o bote no primeiro corpo parado ali. As recusas são as leis
  de sempre: quem NASCE é invulnerável, corpo CONGELADO é estátua. No pico do bote a
  adjacência é RECONFERIDA — corpo que saiu do tile é bote no ar, e a planta mastiga o vazio
  mesmo assim: **errar também custa a recarga**, e é isso que faz o bote esquivável.
- **A animação é a folha de 6 tempos** (`carnivorous_plant.png`): fechada (serra de presas
  bone entre lábios olive) → ABERTA (o bote — o ember só aparece aqui, e é a leitura do
  perigo) → engolida (a cabeça incha 2px) → mastiga A/B (o MESMO bojo deslocado — a presa se
  debate) → murcha (o estado morto). No runtime o gole é em TRÊS tempos: a bocarra abre e se
  arma inclinada pro corpo (SNAP_MS), a mordida PRENDE e **o corpo é ARRASTADO pelo ar até a
  goela** — a boca fica aberta o arrasto inteiro, endireitando o pescoço conforme recolhe —
  e ela só fecha quando ele chega dentro, espremendo fino-e-alto e assentando gorda
  (`Back.easeOut` — o peso chegando ao bucho). Depois mastiga ~2,6s alternando o bojo, e
  volta à espreita respirando.
- **O arrasto é de verdade, não um fade** (`EnemyBase.consume(mouthX, mouthY, dragMs)`): com
  `alive = false` a lógica solta o sprite (o mesmo canal em que o despawn derrete o corpo
  parado — e o mote de cura já provou que billboard aceita tween de x/y/elevation), então o
  corpo é PUXADO da própria casa até a boca em `Quad.easeIn` (quem puxa é a planta), subindo
  à altura da cabeça, **se debatendo** (um tween de ângulo próprio, ±14°) e encolhendo goela
  adentro — visível o caminho quase inteiro, apagando só no último trecho, já dentro do arco.
  O relógio do arrasto é UM (`CarnivorousPlantObject.DRAG_MS`, passado ao consume): o corpo
  chegando e a bocarra fechando (`onGulp` — o baque e o tremor moram aí) nunca dessincronizam.
- **O gole não paga moeda nem deixa ossada** (`EnemyBase.consume`, a remoção sem funeral:
  encolhe goela adentro em 200ms, `Back.easeIn`): quem ficou com o corpo foi a planta — uma
  cova vizinha pagando moeda seria uma fábrica AFK, e uma ossada no chão mentiria.
- **O herói ela NÃO morde** — é a peça do jogador. Para ele, ela é um mato que retribui:
  bloqueia o tile (barreira de verdade, `propRegistry`), **conduz fogo** (planta é
  combustível — entrou no buraco de fechadura do `igniteFlammableAt`), cai pra **foice** (sem
  colheita: predador não é lavoura) e treme pro resto. As três saídas de quem plantou errado.
- **A mastigação é a recarga E a janela**: um corpo por vez. Uma horda passa pela cerca viva
  pagando um corpo por planta por ciclo — barreira, não muralha.

**Guarda**: `npm run playtest -- carnivora` — a caveira que nasce colada na planta (corredor
murado, sem perseguição flaky) e é engolida no primeiro fôlego (zero corpos, zero ossadas,
zero moedas), a semente carnívora brotando a armadilha pelo ciclo real da fazenda (sownKind),
e o herói colado nela a cena inteira sem perder um coração.

---

Current redesign prompt (2026-08-06): archive the Zelda-like overworld and replace the main game with a coin-funded world-builder. Every run starts on one chunk with a campfire, wizard and sword; unfinished west/north/lower-east roads spawn small numbers of undead; interacting with affordable road squares pauses play and deals three animated cards for authored chunks; `/editor` must create chunks and edit card name, image and cost.

- Archived the exact current 22x8 `public/world.json` at `backup/zelda-open-world/world.json` (SHA-256 ABCE03032B38AEB814DFC6C992D0CD2D43C4E190A9591079B3020BBC4B512E8C).
- Replaced active `public/world.json` with a three-template chunk library generated by `npm run generate:chunks`: Moonlit Lake, Whispering Forest, Spider Hollow.
- Main title now starts the chunk-builder run; old authored overworld has no runtime/editor entry.
- Implemented fixed start clearing, closed frontier seams, road markers, frontier-only undead cadence, carried-coin spending, animated/blurred three-card chooser, dynamic chunk placement, and debug-state coverage.
- Added `/editor` chunk catalogue modal for creating templates and editing ID/name/cost/image/description.
- Fixed the lower-east seam so both the dark road mouth and every purchased template connect at y=8; the hero remains blocked at x=12 until that frontier is bought.
- Browser verification: `npm run playtest -- world-builder` passed every assertion with no uncaught page errors. It covers the fixed camp layout, three frontiers, quiet road undead, the unaffordable/affordable seal states, three dealt cards, seven seconds of paused simulation, coin deduction, Spider Hollow placement, traversal into the purchased chunk, and the `/editor` chunk library modal.
- Visual inspection completed for the camp, card chooser, purchased Spider Hollow, and editor library screenshots; the final clean run is `playtest/results/run-2026-08-06T16-57-50/` and also proves the title's sole main action is `Build a world`. The wizard was moved one tile closer after inspection so his full silhouette is visible above-left of the fire in the opening frame.
- Final checks: `npm run typecheck`, `npm run build`, `git diff --check`, and targeted ESLint for every touched TypeScript/JavaScript implementation file all pass. The repository-wide lint command still reports the unrelated pre-existing script/spritefactory configuration failures documented earlier.

## A mortalha: o escuro que esconde o chunk não-comprado (2026-08-06)

Pedido: a área além da fronteira tem que ser escura a ponto de o jogador NÃO SABER o que existe
lá — a curiosidade é a moeda do modo — e a compra ganha uma animação em que a névoa sai aos
poucos e abre o lugar novo. Antes, o chunk escuro era floresta legível na luz da fogueira: uma
tocha na costura mostrava de graça o que a carta deveria vender.

**Como ficou** (`src/game/render3d/ChunkShroud3D.ts`):

- Cada chunk não-comprado da janela do explorador (+1 anel de horizonte) ganha um caixão de
  escuridão: **teto** a 1.22 tiles (acima do quad de árvore), **cortinas** só nas faces que
  encostam em terra comprada (entre dois chunks cobertos os tetos se emendam — cortina dupla
  na mesma costura seria z-fight) e **tendrils** de névoa rasteira invadindo 1.35 tiles do lado
  comprado (quad deitado, `depthWrite:false`, renderOrder 1 — nunca oclui o herói).
- O terreno escuro de verdade continua existindo por baixo (bocas de estrada por onde o undead
  entra); a mortalha só o torna ilegível.
- **Material**: `MeshBasicMaterial` patchado em duas variantes (caixa/tendril), um **bundle por
  chunk** com uniforms próprios — poke por objeto num material compartilhado NÃO funciona em
  built-in: o three só re-envia uniforms no primeiro draw de cada material por frame, e o
  progresso de uma revelação vazaria para as mortalhas vizinhas. Todos os bundles têm o mesmo
  `customProgramCacheKey` (dois programas no total), e o primeiro sync roda ANTES do
  `prewarmShaders`, então os dois compilam no boot e nunca em jogo. Bundles voltam para um POOL
  em vez de morrer: `dispose()` no último material de um programa zera o refcount do three e
  DESTRÓI o programa — a recompilação voltaria exatamente na recentrada de janela. Ruído por
  TEXEL (16/tile, preso ao mundo) em três tons chapados derivando com o `flowTimeUniform`; toda
  transparência é `discard` (borda serrilhada, teto opaco escrevendo depth). Zero luz nova.
- **A revelação**: `purchase()` → `chunkShroud.reveal(cx, cy, enemyX, enemyY)` — uma frente de
  dissolução por distância varre da boca da estrada comprada para dentro (2.6s, smoothstep),
  esfarrapada pelo mesmo campo de ruído e com um filete MORNO no limiar (a luz do mundo comendo
  a névoa). Estado por chunk no próprio bundle, então N revelações concorrentes funcionam.
- Sync da cobertura em três pontos: boot (GameScene, antes do prewarm), recentrada da janela
  (`ExplorerDirector.update`) e compra (reveal ANTES do sync, para o chunk comprado sair do
  registro sem perder a animação).

**Guarda**: `npm run playtest -- world-builder` — a mortalha cobrindo os três alvos de estrada
no boot (e o chunk inicial descoberto), a compra tirando o chunk da cobertura com a dissolução
em curso (`builder.shroud.revealing`), os novos vizinhos já nascendo cobertos atrás dela, e a
espera até a névoa morrer de vez antes da travessia.

## Compra sem parede invisível, cartas na paleta da casa, bolsa de 100 (2026-08-06)

Três pedidos do usuário depois de jogar o construtor:

- **BUG — parede invisível no chunk comprado.** A compra regenera terreno na FONTE
  (`ExplorerWorldSource.purchase` apaga o chunk alvo + 4 vizinhos), mas o `ChunkManager` tem um
  cache próprio de `ChunkData` — e ele continuava servindo a floresta escura antiga: o visual
  reassava (rebuildTerrain lê a fonte), a colisão não, e o chunk novo nascia cheio de árvore
  fantasma. Fix: `ChunkManager.invalidate(cx, cy)` + `ExplorerPropHost.invalidateTerrain`,
  chamado na compra para o MESMO conjunto que a fonte regenera (alvo + 4 vizinhos), antes de
  spawnar props/inimigos. Lição: quem regenera terreno numa fonte tem de derrubar TODO cache
  baixado dele — o de colisão não é o mesmo do renderer.
- **Cartas na paleta do jogo, minimalistas** (`src/styles/chunk-cards.css` reescrito): fora o
  papel pergaminho claro, texturas, glint varrendo, moldura dupla e marca-d'água; a carta agora
  é painel NOITE (#0b0d13) com UMA moldura fina de ouro (#d7b86b), títulos #ffe4a0, texto
  #f5ead1, sombras DURAS de deslocamento (0 4px 0, a linguagem do selo de estrada e da bolsa) e
  a arte do chunk como única cor forte. A virada 3D saiu (a carta só sobe e assenta); toda a
  máquina de estados (hover/focus/active/disabled/loading/error/success) e as classes ficaram —
  o playtest cobra cada uma.
- **Bolsa de partida = 100 moedas** (`START_COINS` em explorerRun.ts): capital inicial para
  testar compras sem farmar caveira. O boot do GameScene agora hidrata o CoinManager do
  `explorerRun().coins` (antes só a aventura restaurava — o HUD nasceria mentindo zero).

**Guarda**: `npm run playtest -- world-builder` — os 100 no boot (bolsa E HUD), o selo dormente
testado com a bolsa explicitamente zerada, e duas sondas de interior do chunk comprado (tiles
que eram árvore na escuridão e que o openSeams garante abertos) contra a regressão do cache.

**Correção pós-jogo (mesmo dia, em dois atos): o muro preto do sul.** Primeiro caiu a CORTINA
da face norte (o chunk ao sul da terra comprada): a câmera olha sempre para o norte (pitch
45.9° + FOV/2 19° = 64.9° < 90°, nenhum raio de visão viaja para o sul), então essa face nunca
esconde nada e só mostrava as costas — um muro preto em primeiro plano mais alto que o herói.
Não bastou: sobrou a LAJE do teto (1.22) da fileira sul inteira — o chunk direto e os diagonais
do far-mesh — preenchendo o rodapé da tela como banda preta elevada com borda em paralaxe.
A resposta virou regra de dois MODOS na mortalha: chunk ao sul de terra comprada (vizinho N,
NE ou NW comprado) usa **TAPETE** — névoa rasteira colada no chão, altura zero — e os demais
mantêm a CAIXA (teto + cortinas, que no norte/leste/oeste é o desenho desejado; a caixa também
fecha a face sul quando o vizinho de baixo é tapete, senão fica fresta sob a borda do teto).
O tapete exigiu o `darkChunk` ficar VAZIO (sem a floresta cheia + bocas de estrada): as árvores
eram legado invisível sob a mortalha opaca, e qualquer coisa em pé vararia a névoa do chão.
Bônus: o undead agora entra visível, vadeando a névoa rasteira da estrada sul.

**Terceiro ato — a névoa ficou bonita** (pedido: "mais realista e bonita"), tudo dentro dos
mesmos dois programas: (1) ruído com componente VERTICAL escorrendo para baixo nas faces em pé
— antes o campo era só-XZ e a parede saía em colunas listradas, cor constante do topo ao chão;
(2) `aShroudLift` por vértice: o TOPO do banco (teto, tapete, crista) apanha a lua — quarto tom
frio `SHROUD_MOON`, gated no lift para o pé da muralha nunca acender; (3) o banco inteiro
respira num período de ~50s (patches clareiam e afundam); (4) uma CRISTA de fiapos
(`CREST_TILES`, o material dos tendrils em pé, densa embaixo e rala em cima) sobe das cortinas
e desfaz a régua da silhueta contra a noite.

## Cartas de NPC: compra única, oito lares-tutorial, naipe violeta (2026-08-06)

Pedido: cada carta compra UMA vez; uma carta por NPC; o cenário do NPC tem fogueira acesa (a
proteção), o NPC ao lado, um item-presente que combina, terreno com a cara dele, fala explicando
o item, e matéria-prima para TESTÁ-LO ali (mini tutorial); cor de carta diferente.

- **Compra única** (`ExplorerWorldSource`): `used` set — `catalog()` filtra, `purchase()` marca e
  recusa repetida. A resolução de chunk JÁ CONSTRUÍDO continua no `templates` cheio (a carta sai
  do baralho; o terreno fica). `debugNextOffers` no director (consumido no uso) dá determinismo
  ao playtest agora que a mão é sorteada de 11 cartas.
- **Os oito lares** (`scripts/add-npc-chunks.mjs`, modelo enrich: lê world.json, backup em
  `backup/world-pre-npc-cards.json`, idempotente por id, zero random): gato→graveto/tocha
  (fogueiras mortas p/ acender) · astronauta→picareta (rochas+ferro em chão de pedra) ·
  empresário→machado (fileiras de árvore seca) · operário→botas de lava (poça d'água com ferro
  afundado numa ilhota) · pintora→sementes (canteiros plantSpot prontos) · vendedor→balde
  (lagoa) · poeta→machado de aço (pinheiros VIVOS) · Morte→foice (campo de mato alto). Fogueira
  ACESA ao lado de cada NPC; nada essencial nas faixas de costura do openSeams.
- **Falas**: en.json (que VENCE o world.json — getDialog prefere o locale) reescrito para os 8
  com o presente + para que serve + o empurrão do tutorial; world.json dialogs ganhou as configs
  (retrato/cor/voz) + as mesmas linhas de fallback.
- **Encanamento que faltava**: pickups de template comprado não nasciam (ItemManager carrega uma
  vez e não streama) e o NPC também não (NpcManager pula chunk já ativo — a lista VAZIA do chunk
  escuro ficava em cache). `spawnBuiltChunkContent` no host dropa os itens + `refreshChunk` novo
  no NpcManager. `plantSpot` entrou no spawnStreamedProps/despawn (canteiros da pintora).
- **Visual**: naipe `hearth` (decidido por o template TER npc, não pelo id) com pictograma
  fogueira+morador+presente na arte P&B, sigilo de chama, e moldura/nome/moeda/verso em VIOLETA
  arcano (#8b5cf6/#e9d5ff — a paleta do portal/mago) via `data-npc`.

**Guarda**: `world-builder` — baralho de 11 no boot com os 8 ids, mão de NPC forçada com naipe
hearth + moldura não-ouro (shot `npc-cards`), compra única (spider-hollow some do catálogo, 10
restam), editor listando 11.

## As cartas viraram baralho de verdade: arte P&B procedural + juice pesquisado (2026-08-06)

Pedido: arte pixel P&B minimalista e SIMBÓLICA do que se compra, e "juice de abrir baralho",
com pesquisa de referências. Da pesquisa (Balatro/pack-opening UX) vieram os princípios
aplicados: carta nunca estática, foil que segue o cursor, revelação coreografada com flip de
arco, sutileza como régua, celebração clara da escolhida.

- **Arte**: `chunkCardArt.ts` desenha em canvas 36×24 (esticado pixelated) um pictograma por
  domínio — lua minguante sobre ondas (tide), três pinheiros em silhueta (thorn), teia no canto
  + aranha pendurada (web), estrela de quatro pontas (wild) — duas cores (tinta-pergaminho
  sobre noite), zero aleatório, síncrono (estado 'ready' imediato; loading/error ficam no CSS
  para um dia o editor voltar a apontar imagem própria — hoje o campo do editor não é lido).
  Naipe/label extraídos para `chunkCardSuits.ts`.
- **Coreografia do baralho** (CSS + medidas em TS): as cartas nascem NUMA PILHA no centro do
  leque, de costas e tortas (±4°); cada uma é distribuída em stagger — sobe em arco, VIRA no
  ar com escala 1.07 no meio do giro (o flip "realista"), assenta com overshoot. Verso ganhou
  treliça diagonal de ouro. Hover = tilt-3D seguindo o cursor (±9°/±12°, custom props via
  mousemove) + halo de foil na posição do mouse; uma varredura ambiente de brilho cruza cada
  carta a cada 6.5s, defasada. Escolher: a carta puxa ao centro com escala e o carimbo LAND
  CLAIMED bate com overshoot; as recusadas caem girando no sentido do leque.
  `prefers-reduced-motion` desliga tudo (o tilt nem instala).
- A máquina de estados e as classes são as mesmas — o playtest `world-builder` continua
  cobrindo: 3 cartas, opacidade pós-deal, proporção 5:7, verso/cantos/sigilos, foco visível,
  hover que levanta, pressão que assenta, estados de arte, trava com texto, sucesso na carta.

**O cinema da compra (pedido seguinte): a carta é a luz que apaga a névoa.** `choose()` agora
tem quatro tempos: carimbo + recusadas caem → a carta puxa ao CENTRO da tela (os dois eixos,
`--zh-card-claim-x/y`) e segura ~430ms (o beat de apreciação do pack-opening) → o pano de fundo
se dissolve (`is-departing`: blur→0, mundo reaparece) e um FANTASMA da carta (`zh-build-flight`,
clone em position:fixed no body — fora do painel que recorta; canvas re-desenhado porque
cloneNode não copia conteúdo de canvas; classe própria para nenhum estado do leque disputar o
transform) acende em ouro e voa ACELERANDO (`cubic-bezier(.55,-.12,.82,.42)`, scale 0.07 +
brightness 2.4) até a projeção em tela da boca da estrada (`world3d.projectTile(enemyX,enemyY)`,
novo 6º parâmetro do overlay) → o POUSO estoura (clarão + anel de ouro) e SÓ ENTÃO dispara o
`zh-choice` — a compra e o reveal da mortalha começam exatamente onde a luz tocou. Fantasma e
estouro se auto-limpam por timer (um cleanup no destroy() os mataria no nascimento: o dispatch
destrói o overlay no mesmo tick). Reduced-motion ou sem projeção: corte seco de 700ms como era.
O POST_UPDATE do GameScene continua rodando com o modal aberto, então o mundo renderiza sob o
voo. Também: título com folga (a carta selecionada levantada não o atropela mais), fio de ouro
interno nas sombras da carta, vinheta sobre a arte, letter-spacing no título.

**Ajustes finos do cinema (pedido seguinte):** a dissolução da mortalha desacelerou
(`REVEAL_MS` 2600→4400 — a névoa se retira, não evapora; as janelas do playtest seguem folgadas),
o LAND CLAIMED virou uma FITA estreita no pé do quadro da arte em vez de tapá-la (o texto e o
sigilo continuam no DOM — os asserts os leem; o sigilo só não entra na fita), e a compra ganhou
som: `playCoinPickup` + `playSingingBowl` no clique (catálogo já gerado, nada novo no pipeline
de áudio), com o `playShopClose` de sempre servindo de baque do pouso.

**Passada de poda (pedido seguinte): a carta ficou só o essencial.** Fora os números dos
cantos (o sigilo fica — o playtest conta `.zh-build-corner === 2`), o "WORLD CHUNK", o
subtítulo de domínio, a descrição, a dica de tecla e o subtítulo do painel ("The X road is
unfinished…"). Sobrou: sigilo nos cantos, arte, TÍTULO centrado e UMA moeda de ouro com o
valor no rodapé. Cartas menores (teto 12.5rem no desktop, ~14rem no mobile — o piso de 220px
do teste responsivo continua respeitado) e painel mais estreito. A SELEÇÃO ficou inconfundível
sem apagar as vizinhas (o assert de opacidade > 0.9 proíbe): a carta selecionada (`is-selected`,
segue o foco) ganha elevação persistente, moldura dupla de ouro vivo, glow quente e moeda acesa.

## O baralho do mundo ganhou corpo de carta (2026-08-06)

Pedido atual: fazer as cartas de compra parecerem cartas de baralho de verdade, com acabamento e
"juice". A primeira passagem separou a arte em `src/styles/chunk-cards.css` e converteu o trio de
retângulos em um leque físico 5:7: verso autorado, virada escalonada, papel texturizado, moldura
dupla, canto espelhado, sigilo vetorial por domínio (maré/espinho/teia), quadro da arte, selo de
moeda e tipografia hierárquica. O componente agora declara os oito estados: default, hover, foco,
pressão, bloqueado, carregando arte, erro de arte e compra concluída. A confirmação é silenciosa e
visível na própria carta antes de ela virar terreno; `prefers-reduced-motion` remove todo movimento
espacial. `npm run typecheck` e o ESLint direcionado ao componente/cenário passaram na primeira
checagem.

Fechamento: `npm run build`, `git diff --check`, o cliente Playwright padrão do skill de jogo e
`npm run playtest -- world-builder` passaram. O cenário agora exercita também proporção 5:7, versos,
cantos/sigilos, foco, hover, pressão, arte carregando/com erro, bloqueio por preço, confirmação de
compra e ausência de overflow em 320/375/414/768px. A última execução limpa, sem erro de página, é
`playtest/results/run-2026-08-06T17-25-31/`; as capturas desktop, mobile e de sucesso foram
inspecionadas visualmente. A auditoria Hallmark de escopo de componente passou sem gate universal
aplicável em aberto.

## Três cartas de terreno estreiam os tiles órfãos (2026-08-06)

A biblioteca usava só 11 dos ~30 frames do atlas (chão 5/23/24/33, superior 0/4/6/7/8/10/11).
`scripts/add-terrain-chunks.mjs` (modelo enrich: lê o world.json, acrescenta, backup em
`backup/world-pre-terrain-cards.json`, idempotente por id, zero random) somou três cartas que
estreiam as famílias restantes:

- **Granite Pass (6)** — a montanha em cubo (39/40) em quatro maciços de canto, pátio/trilha de
  pedra (23/24), pedras deitadas (12/13), rocha+ferro pra picareta, e DOIS MORCEGOS: no chunk
  feito de parede, a espécie certa é a que voa por cima dela.
- **Sunken Graveyard (8)** — o cemitério inteiro: xadrez de pedra com lajes 29/30/32, covas
  abertas (31) ladeadas de túmulos (25), cabeças na estaca (22) na encruzilhada, ossos 27/28,
  árvores mortas 3/21. Três spawns de undead SOBRE as covas desenhadas — a cova que pare é a
  cova que se vê — e sem fogueira de propósito (luz calaria as covas).
- **Blooming Grove (4)** — canteiros de terra lavrável (6, o chão que a PÁ aceita) com os
  pinheiros de fruto (15), flor (16) e variantes 14/17/18, arbusto florido (1), folhagens 19/20
  e gravetos 2/9. Zero inimigos: a carta barata e mansa do baralho.

Nada essencial nas faixas que o `openSeams` limpa (N x5-7/y0-3 · S x5-7/y8-11 · W x0-3/y5-9 ·
E x8-11/y5-9) — no cemitério a estrada corta o pátio de pedra em grama, de propósito. Cada carta
respeita "uma espécie por tela" e nenhum bloqueio sela bolsão (conferido em render ASCII).

Naipes novos com pictograma e sigilo próprios (ids fora das regex caíam no `wild` genérico):
`peak`/`grave`/`bloom` em `chunkCardSuits.ts` + desenhos P&B em `chunkCardArt.ts` + SVGs em
`ChunkPurchaseOverlay.ts` — os três `Record<CardSuit,…>` fazem o compilador cobrar naipe novo.
CSS intocado (a moldura só distingue NPC/violeta de terreno/ouro).

`world-builder` atualizado: baralho 11→14, pós-compra 10→13, editor 11→14, e três asserts novos
cobrando que cada carta usa seus frames-assinatura (39/40, 31/25/22, 15/16/6) e a lei da espécie
única. `npm run typecheck` limpo; lint sem erro novo (os 56 são pré-existentes de
spritefactory/worldgen).

## O veio de ferro, a pilha e o balcão do astronauta (2026-08-06)

Pedido do usuário: a rocha de ferro NÃO se destrói mais — 3 picaretadas soltam um minério e
dá pra bater pra sempre; o minério acumula como semente; e o astronauta, depois da primeira
fala, oferece duas opções (continuar conversando / vender ferro), pergunta só a QUANTIDADE e
paga em moedas. "Minerar é uma atividade lucrativa."

**O veio (`RockObject`)**: `ore` deixou de ser só arte — a rocha comum segue fechadura (2
batidas, tile abre), a de minério virou POÇO: ciclo de 3 batidas (1ª racha, 2ª recua, 3ª
produz e REARMA com a arte inteira de volta — o placar é a própria textura), nunca quebra,
nunca desbloqueia. `smash()` agora devolve `'none'|'struck'|'shattered'|'yielded'` e quem
solta o item é a GameScene (`dropOreYield`): o bloco salta pro lado de quem bateu (os pés —
o B pega do chão sob os pés) e, se já houver ferro ali, ENGROSSA o item (`units`). A bomba
avança o ciclo (2 batidas) mas nunca abre o veio.

**A pilha**: `UNIT_PACK_KINDS` = sementes + ferro — pousar põe a contagem inteira num item
só, pegar devolve (o contrato `ItemPickup.units` de sempre). Lista SEPARADA de
`SEED_PACK_KINDS` porque o buraco de plantio pergunta por semente (ferro não é semeável).
Armadilha achada no caminho: a bandeja da caixa de ferramentas engolia o item INTEIRO
(`take` devolvia só o kind) — 5 ferros teriam virado UMA foice; o port agora consome uma
unidade e devolve o resto ao tile no mesmo frame. O braço robótico já preservava units.

**O balcão (`DialogOverlay` + `trade` no world.json)**: o rodapé do painel Disco-Elysium
deixou de ser uma opção única e virou MENU (dados, numerado, `data-opt` pro playtest).
`WorldDialog.trade` = `{item, coinsPerUnit, offer, empty, thanks}` — autorado no
`add-npc-chunks.mjs` (dialogs são reescritos a cada rodada; preço = editar o número e rodar).
Fluxo: 1ª fala → [Keep talking / Sell iron]; vender com mochila vazia responde com FALA
(nunca menu mudo); com estoque, o NPC pergunta e abre o caixa (− n +, começa em TUDO, setas
ajustam, Enter confirma, Esc desiste); a venda entra como recibo do narrador (número exato)
+ agradecimento, e o balcão reabre. A transação mora na GameScene (`tradePortFor`): mochila
e carteira mudam juntas pelo caminho da moeda real (`addExplorerCoins` + `CoinManager`),
com `persistAdventure`. `gateDialog` DESPE o trade da variante travada (NPC com medo não
vende), e ferro a 3 moedas: ~2s por minério contra 1 moeda da caveira — minerar é o ganho
honesto que o diálogo promete. Falas novas do astronauta espelhadas em en.json E no script.

**Guarda**: cenário novo `npm run playtest -- ferro` — o ciclo de 3 (frame 1 → frame 0,
blocking sempre true), a pilha (units 2 no MESMO item), o pegar que devolve 2, o menu de
duas opções após a 1ª fala, o caixa (2 → − → 1 → + → 2), a venda (6 moedas na carteira,
recibo no log), a recusa sem estoque e o Esc. Nota: o comentário do GameDriver diz "B usa o
item", mas a tabela `useItemAt` mora no A (`swingAttack`) — o cenário minera com
`driver.attack`; `pedra` usa `faceAndUse` (B) pra picaretar e pode estar vermelho por isso
(flake anotado, não tocado). `typecheck` e eslint dos arquivos tocados limpos.

## A loja morreu; a moeda vive no mundo (2026-08-06)

Seis pedidos do usuário numa passada, todos na mesma direção: economia e conversa acontecem no
MUNDO, nunca em menu.

**1. A LOJA foi removida por inteiro.** `ShopOverlay.ts` deletado, e o sistema de upgrades
(maxHealth/swordSpeed/moveSpeed/magnet) junto — sem a loja ele era código morto. Saíram:
gatilho de bump na fogueira acesa (o bump agora só faz a chama reagir), `openShop/closeShop`
do gameDebug e do GameDriver, `shopOpen` do estado, o campo `upgrades` dos dois saves
(parse tolerante ignora a chave velha), `buyExplorerUpgrade`, o cenário `shop` (e o
DEFAULT_SEQUENCE), o passo de loja do `audio`. Cadência de ataque agora é fixa
(`ATTACK_COOLDOWN_MS`); vida máxima é `PLAYER_HEALTH_MAX`. Os SAMPLES `shopOpen/Close` ficam —
cartas de chunk, selo e porta os reusam.

**2. O minério ESPALHA como moeda.** O yield do veio deixou de ser item de chão com pilha:
`CoinManager.spawnLoot` (o `Coin` ganhou `CoinLook` — mesma física de espalhar/quicar/pegar
de passagem, arte parametrizada) e o bloco entra na mochila POR PISADA via `Inventory.stash`
— o par do `add` que NUNCA seleciona: a picareta não é roubada por cada bloco que cai. É a
exceção deliberada ao "nada entra por pisada", documentada no CLAUDE.md: o que espalha como
moeda se pega como moeda. Som: o chime de item (`playSwordPickup`), não o de moeda.

**3. A venda DERRUBA moedas.** `tradePortFor` ganhou o `npcWorld`: vender não credita mais a
carteira — o NPC derruba as moedas exatas em volta de si (`spawnCoins` com count), como um
inimigo derrubaria, e o jogador anda até elas. A mochila esvazia na hora; cada moeda entra
pelo caminho único de toda moeda (explorer `addExplorerCoins`, aventura persist).

**4. Moeda pega VOA pro HUD.** `CoinManager.update` agora recebe DOIS âncoras: moeda voa pro
CONTADOR (`ExplorerHud.coinAnchorRect`, DOM→canvas via `hudCoinAnchor`), que já pulsa ao
crescer; loot voa pro HERÓI (o corpo é a mochila). Sem HUD (aventura/levels), moeda cai no
herói como antes.

**5. O keycap "Z" e a conversa pelo botão de ação.** `NpcManager` ganhou um segundo overlay
por NPC: um keycap pixel-art (mesma técnica do "!", com a tecla Z — ou A no toque) mostrado
quando o herói está adjacente E encarando (`isTalkTarget`, quarto callback). O keycap CALA o
"!" enquanto visível (dois balões no mesmo pixel não ensinam nenhum). `swingAttack` checa
`talkToNpcAt` ANTES da cadência/lâmina: Z de frente pra alguém conversa — sem investida, sem
gasto de golpe; o B continua falando. `openDialogScript` chama `resetChargeAndBuffers` (o Z
segurado que abriu o diálogo perderia o keyup — a rede da subtela).

**6. Menu de diálogo navegável.** O overlay ganhou seleção destacada (`is-selected`, UM
estado alimentado por ↑↓/WS, hover e toque), Enter/Espaço/Z confirmam A SELECIONADA (com
guard de `event.repeat` — tecla segurada não metralha a conversa), dígitos continuam
escolhendo direto, ←→/AD lapidam a quantidade no caixa, Esc volta/fecha.

**Guarda**: `playtest -- ferro` reescrito de ponta a ponta — ciclo de 3 do veio, loot por
pisada que não rouba a mão, keycap visível ao encarar, Z abrindo o diálogo real (com
npcWorld: as moedas caem em volta do NPC), seta+Enter navegando até vender, caixa 2→1→2,
venda que derruba 6 moedas SEM creditar carteira, recusa sem estoque, e a coleta andando
tile a tile até a carteira fechar em +6. CLAUDE.md atualizado (dois botões, esbarrão sem
loja, a exceção do minério); memórias idem. `typecheck` e eslint dos tocados limpos.

## Auditoria mobile (2026-08-06)

Varredura de toda superfície de toque, a pedido. O que JÁ estava certo: andar por arrasto
(touchstart na janela + `data-zh-ui` marcando UI), os dois círculos A/B (golpe no touchstart
sem o atraso do click sintético, release fora do círculo solta a carga do giro), a bolsa
(slots/setas/confirmar por toque, teclas escondidas), pausa (pill touch-only) e subtela via
pausa, LevelButtons (↻ com confirmação de 2 toques), título (POINTER_DOWN), ItemGet (tap
skip + auto-close 3.2s), ExtractPrompt (botões DOM), morte (tap para continuar + auto-restart
de graça longa), as cartas de compra (leque horizontal com snap, testadas em 320–768px), o
diálogo inteiro (tap no log avança, opções/caixa clicáveis, seleção unificada com o hover), o
keycap do NPC mostrando "A" no toque, e moedas/loot por pisada + voo pro HUD (independem de
input). Safe-area insets presentes em HUD, pad e pausa.

**Dois furos achados e fechados:**
1. O selo de estrada dizia `[X / K] BUILD` — tecla que não existe num aparelho de dedo. No
   toque agora diz `[B]`, o nome do círculo esquerdo (ChunkGatePrompt + isTouchDevice). O
   assert do `world-builder` (`/BUILD/`) segue valendo — Playwright não é touch.
2. Alvos de toque do diálogo: `.zh-dlg-opt` e os botões −/+ do caixa tinham ~24–26px em fonte
   mínima. `@media (pointer: coarse)` sobe tudo ao mínimo confortável (44px) e os dois ganham
   `touch-action: manipulation` + tap-highlight transparente.

**Item de observação (não mexido):** o painel de diálogo em RETRATO estreito fica com ~50% de
375px ≈ 187px — funcional (fonte piso 12px, alvos ok), mas apertado. Se um dia incomodar, a
resposta é um layout de folha inferior para retrato — decisão de design, não bug.

## A morte devolve rápido (2026-08-06)

Pedido do usuário: morrer tem que voltar mais depressa pro jogo. A elegia INTEIRA continua —
o baque, o mundo drenando de cor, o herói sumindo no vazio, o epitáfio subindo — mas
comprimida: fade do mundo 1500→900ms, herói (e o item das costas) delay 900→500 + fade
3200→1600ms, epitáfio 3000→1200ms (pleno a ~3.3s, era ~7.1s). O pulo por tap/tecla arma aos
1.6s (era 4.8s) — tarde o bastante pra um botão apertado enquanto caía não engolir a elegia —
e o retorno automático caiu de 12s pra 5s. O custo de morrer segue sendo a caminhada de volta
(o contrato do save não mudou), nunca a espera. `salvamento` ajustado ao relógio novo (foto da
elegia aos 3.4s, antes do auto-restart); comentário do `explorador` idem.

## A moeda de verdade, e cada carta de NPC com a própria cara (2026-08-06)

Três pedidos do usuário na mesma passada:

**1. Som de moeda DE FATO.** O `playCoinPickup` tocava o `coin.wav` sintetizado do gen-sfx.
O RPG Sound Pack (CC0, o pacote da casa) tem moedas reais em `inventory/` — os pacotes-fonte
não estavam mais no disco, então o zip foi re-baixado do OpenGameArt e o `import-combat-sfx`
ganhou a entrada `coin-pickup.wav` (inventory/coin3, a mais CURTA das três: 309ms contra 604
e 1000 — moeda entra em rajada e cauda longa empilhando vira sino). O rerun do importador
saiu determinístico (17 arquivos byte-idênticos, só o novo mudou; os 6 do pacote retro
ausente reportaram FALTA e ficaram intactos). `SAMPLES.coinPickup` →
`combat/coin-pickup.wav`; CREDITS.md atualizado (o coin.wav gerado ficou aposentado no
disco — regenerável, nunca referenciado). O cenário `audio` trocou a lista (e de quebra o
`music.wav` fantasma virou `music-title.wav` — estava vermelho desde a troca das trilhas).

**2. Um pictograma POR MORADOR.** As oito cartas de NPC usavam o mesmo desenho de
fogueira+morador (`drawHearth`). Agora `chunkCardArt` tem `NPC_ART` — o EMBLEMA de cada um,
no mesmo P&B: o gato sentado de perfil com a lareira fria fumegando, o capacete de visor
vazado sobre a cratera, a gravata pendurada sobre os toros em anel, o trevo de radiação
sobre a água, o pincel com a gota e os canteiros, o balde de alça sobre a lagoa, a pena com
a nota subindo, e a foice fincada no mato alto. `drawCardArt(canvas, suit, npc?)` — o naipe
hearth continua assinando moldura e sigilo ("vem alguém junto"); a ARTE diz quem. Os oito
foram REVISADOS em render ASCII antes de valer (a regra do preview do spritefactory).

**3. O nome da carta diz QUEM.** Cold Hearths/Crater Quarry/etc viraram possessivos
NPC-primeiro: Cat's Hearths, Astronaut's Crater, Businessman's Timber, Workman's Ford,
Artist's Beds, Salesman's Pond, Poet's Pines, Death's Meadow. O `add-npc-chunks` aprendeu a
ATUALIZAR o catálogo de cartas já existentes (antes só pulava ids — um rename nunca chegava
ao world.json); terreno autorado nunca é tocado.

Guarda: `world-builder` ganhou dois asserts — as três cartas de NPC oferecidas têm artes
distintas (toDataURL) e os nomes NPC-primeiro. `typecheck` e eslint limpos.

## A lava que o editor punha e a compra descartava (2026-08-06)

Chamado do usuário: "coloquei props de lava e não apareceu lava". Causa: o
`spawnStreamedProps` — o caminho por onde a carta comprada vira props vivos (e por onde a
janela do construtor re-entra em chunks) — só conhecia os 8 tipos que o GERADOR antigo
plantava (campfire, dryTree, dryBush, rock, ironRock, tallGrass, plantSpot, levelPortal).
Qualquer outro prop pintado num card pelo /editor caía no `default` e era descartado em
silêncio na compra.

O switch agora conhece todo o MUNDO autorável: lava (a luz vem do POOL — nascer em runtime
não recompila shader), água, bridgeSpot (com o flash do onBuilt), dryShrub, moonflower,
bombSpot, lockedDoor (com floodgate), swingGate, woodenCrate e carnivorousPlant. O
`despawnPropsOutside` ganhou os sweeps espelho — com memória onde importa: porta ABERTA fica
aberta (a chave foi consumida; voltar trancada seria soft-lock) e arbusto cortado fica
cortado; o resto o template refaz idêntico. As MÁQUINAS (fio, roda, caldeira, placa, portão
eletrônico, braço, bancada) continuam no `default` DE PROPÓSITO, agora com o comentário
dizendo isso: elas têm índice de cabo e circuito a recompor, e meio construídas seriam
piores que ausentes — carta com máquina é trabalho futuro.

Guarda: `world-builder` espawna lava+água+arbusto pelo caminho da compra num chunk comprado
e cobra corpo físico (listas crescem, tiles bloqueiam).

## A luz protege 30% menos (2026-08-06)

Pedido do usuário: o inimigo pode chegar mais perto da fogueira. `LIGHT_RADIUS_TILES`
(a parede que o monstro não pisa + o silêncio das covas) caiu de 4.5 → **3.15**, e
`CAMPFIRE_SAFE_RADIUS_TILES` (o anel em que o herói conta como "safe" pro cerco) encolheu
junto, 5 → **3.65**, mantendo a margem documentada de +0.5 — o perigo continua começando na
borda da parede, nunca com o jogador ainda se lendo protegido. A luz VISÍVEL não lê dessas
constantes (é a luz 3D real com falloff suave), então nada na tela contradiz a parede menor.
O aviso do editor (cova na luz) segue a mesma constante sozinho. Fixtures conferidas antes:
a cova-na-luz do `inimigos` está a 1,4 tiles (segue calada) e o resto a 6+ (segue fora);
comentários com os números velhos atualizados em `inimigos`, `fauna` e `placa-undead`.

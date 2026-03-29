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

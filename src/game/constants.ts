export const TILE_SIZE = 8;
export const CHARACTER_SIZE = 16;
export const DEFAULT_GAME_WIDTH = 320;
export const DEFAULT_GAME_HEIGHT = 240;
export const GRID_COLUMNS = 8;
export const GRID_ROWS = 8;
export const TILESET_FRAME_SIZE = 16;
export const MIN_BOARD_TILE_SIZE = 24;
export const MAX_CHARACTER_SIZE = 52;
export const FONT_FAMILY = "'Press Start 2P', monospace";

// Resolution for every Text object. The game canvas renders at 1x (Scale.NONE, no
// devicePixelRatio scaling) with NEAREST sampling (pixelArt: true). A Text with
// resolution R rasterizes its glyphs to an R× canvas, then draws it scaled by 1/R into the
// 1x buffer — and that NEAREST downscale is what smears the pixel font. Rendering at 1
// keeps a 1:1 texel→pixel mapping so glyphs stay razor sharp; the canvas'
// image-rendering: pixelated handles any hi-DPI upscale crisply.
export const TEXT_RESOLUTION = 1;
// A CAIXA DE FALA é uma barra no RODAPÉ (o formato tradicional), com UMA mensagem por vez — e
// o quanto ela ocupa é UMA pergunta só: o desenho (DialogOverlay) e a câmera (GameScene, que
// enquadra herói e NPC no que sobra ACIMA dela) leem a mesma resposta. Duas contas diferentes e
// a fala taparia quem está falando.
//
// A altura sai da TIPOGRAFIA, não de uma fração fixa: ela é a placa do nome mais as linhas de
// texto que a fala mais longa do jogo (~180 caracteres) precisa NAQUELA largura — três num
// monitor, quase cinco num telefone em pé, onde cabem 45 caracteres por linha. Uma altura
// única serviria mal aos dois: sobra de barra vazia no monitor, texto cortado no telefone.
// Piso e teto seguram os extremos (uma barra fina demais não é uma caixa de fala; metade da
// tela num telefone deitado é a tela inteira).
export const DIALOG_BOX_MIN_FONT = 17;
export const DIALOG_BOX_MAX_FONT = 30;
export const DIALOG_BOX_MIN_FRACTION = 0.2;
export const DIALOG_BOX_MAX_FRACTION = 0.45;

export type DialogBoxMetrics = { boxHeight: number; fontSize: number; margin: number };

/** As medidas da caixa de fala, em pixels de tela, para um canvas de `width` × `height`. */
export const dialogBoxMetrics = (width: number, height: number): DialogBoxMetrics => {
  const margin = Math.round(Math.min(20, Math.max(8, Math.min(width, height) * 0.02)));
  // A largura manda (a caixa é uma barra), mas a altura tem voto: num telefone deitado uma
  // fonte escolhida só pela largura empurraria a caixa por metade da tela.
  const fontSize = Math.max(DIALOG_BOX_MIN_FONT, Math.min(DIALOG_BOX_MAX_FONT,
    Math.round(Math.min(width / 36, height / 18))));
  // Os degraus batem com os do CSS (o retrato e o respiro encolhem em 560px).
  const ems = width < 560 ? 9.4 : width < 900 ? 7.6 : 6.6;
  const boxHeight = Math.round(Math.min(
    height * DIALOG_BOX_MAX_FRACTION,
    Math.max(fontSize * ems, height * DIALOG_BOX_MIN_FRACTION),
  ));
  return { boxHeight, fontSize, margin };
};
export const GAMEPLAY_HERO_SCALE = 1;
export const GAMEPLAY_HERO_MAX_SIZE = Number.MAX_SAFE_INTEGER;

export const CHUNK_COLUMNS = 12;
export const CHUNK_ROWS = 12;

export const SCENE_DEPTHS = {
  ground: 0,
  decorBelowPlayer: 4,
  grid: 5,
  // Dynamic firelight cast shadows lie on the ground: above the tiles/decor, below every actor
  // (items, player, props) so objects stand on top of their own and each other's shadows.
  castShadow: 6,
  item: 8,
  player: 10,
  object: 18,
  upper: 20,
  lighting: 25,
  ui: 30,
  uiOverlay: 31,
  uiLabel: 32,
  paletteSelection: 35,
  toast: 40,
} as const;

export const HERO_FRAMES = {
  idleDown: 3,
  idleUp: 4,
  walkStart: 0,
  walkEnd: 3,
  /**
   * AS POSES DE ATAQUE (Sprite Factory, acrescentadas a folha numa linha nova — nenhum id acima
   * mudou). Duas, pela mesma regra do andar: o heroi e desenhado de FRENTE para baixo e para os
   * lados (espelhado) e tem uma unica frame de costas para cima, entao uma pose so apareceria de
   * barriga enquanto ele golpeia para o norte.
   *
   * Existem porque o heroi era o unico corpo do combate que nao se mexia ao atacar: todo bicho se
   * agacha ao armar, a caveira levanta um osso, a espada tem arco e investida — e o sprite dele
   * ficava na pose de parado enquanto o gesto inteiro acontecia ao lado.
   */
  attack: 5,
  attackUp: 6,
} as const;

export const TIMINGS = {
  /**
   * Milliseconds to cross one tile, at a constant speed — a tap covers ground at exactly the
   * same rate as a held key. It used to be the duration of a per-tile tween, and *which* number
   * you got depended on how you typed: 140ms for a fresh press, but 87ms (×0.62) while holding.
   *
   * 150ms = 6.7 tiles/s: a walk. Holding a key used to cover ground at nearly 10 tiles/s, but it
   * lurched and stalled the whole way, and once the walk ran smoothly that same pace simply read
   * as a sprint. The shop's boots take it back up to ~9.5 (see applyUpgrade).
   */
  moveDurationMs: 150,
  /**
   * Tiles covered by one full 4-frame stride — a property of the hero's legs, not of his speed.
   * The walk cycle is driven by distance rather than by a frame rate (see HeroView), so the feet
   * stay locked to the ground however fast he walks: slow down, and the legs slow down with him.
   * Two tiles per stride puts the cycle near 13fps at a walking pace.
   */
  walkCycleTiles: 2,
  grassRustleDurationMs: 110,
  toastFadeDelayMs: 1600,
  toastFadeDurationMs: 300,
} as const;

export const NPC_FRAMES = {
  blackCat: 0,
  mimic: 1,
  astronaut: 2,
  businessMan: 3,
  radiationSuit: 4,
  painter: 5,
} as const;

export const ASSET_KEYS = {
  hero: 'hero',
  npcs: 'npcs',
  npcSalesman: 'npc-salesman',
  npcPoet: 'npc-poet',
  npcDeath: 'npc-death',
  forestTileset: 'forest-tileset',
  keyItem: 'key-item',
  swordItem: 'sword-item',
  swordItemIcon: 'sword-item-icon',
  axeIcon: 'axe-icon',
  greatAxeIcon: 'great-axe-icon',
  pickaxeIcon: 'pickaxe-icon',
  scytheIcon: 'scythe-icon',
  shovelIcon: 'shovel-icon',
  woodItem: 'wood-item',
  woodIcon: 'wood-icon',
  lookedDoorObject: 'looked-door-object',
  swingGateObject: 'swing-gate-object',
  /**
   * A OSSADA do chao — a MESMA arte da frame 27 do `forest_tile_set` ("Caveira e Ossos"), recortada
   * pixel a pixel para um PNG proprio.
   *
   * O recorte nao e organizacao: e o CONSERTO da nitidez dela. O `forest-tileset` e a unica textura
   * do jogo filtrada em LINEAR (ver textures3d) — de proposito, porque a malha do terreno busca o
   * centro do texel por conta propria e usa o filtro so na costura entre tiles. Um BILLBOARD nao faz
   * essa conta: ele amostra o atlas direto, entao a ossada era o unico sprite do jogo desenhado
   * borrado. Textura propria = NEAREST como todo o resto, sem nenhum pixel diferente.
   */
  // O irmao dele: o balao com o GRAVETO ACESO, que o heroi pensa ao bater num arbusto seco com o
  // graveto apagado na mao (ver HeroThought e GameScene.useItemAt).
  thoughtTorch: 'thought-torch',
  // `mage` e a arte que o NPC "wizard" tambem usa (NPC_VISUALS). O mago INIMIGO nasce com um tom
  // frio por cima justamente por isso — ver MageEnemy: dois personagens nao podem ler igual.
  mage: 'mage',
  swordOnFire: 'sword-on-fire',
  dryBush: 'dry-bush',
  dryTree: 'dry-tree',
  dryShrub: 'dry-shrub',
  rock: 'rock',
  rockCracked: 'rock-cracked',
  // A pedra de FERRO: mesma silhueta da rocha, com veio de minerio. Sheet de 2 frames
  // (inteira / rachada) — o par que a rocha comum guarda em dois arquivos soltos.
  ironRock: 'iron-rock',
  ironItem: 'iron-item',
  // O mato alto EM PE (spritefactory): 4 frames de vento + o toco cortado. E a arte que o
  // JOGO desenha, entao e a que o editor tem de mostrar — a antiga grass_wind0 era o tile
  // top-down de fundo opaco, e um icone que nao e o objeto e uma mentira na paleta.
  tallGrassUp: 'tall-grass-up',
  seedsItem: 'seeds-item',
  mushroomItem: 'mushroom-item',
  plantHole: 'plant-hole',
  plantMound: 'plant-mound',
  // A flor da lua (spritefactory): as 9 poses de UMA flor abrindo — ver MOONFLOWER_FRAMES.
  moonflower: 'moonflower',
  toolbox: 'workbench',
  furnace: 'furnace',
  // O ALTAR: laje de pedra em 2 frames (fria / com o tampo em brasa). Ver AltarObject.
  altar: 'altar',
  oreItem: 'ore-item',
  bloomItem: 'bloom-item',
  water: 'water',
  water1: 'water-1',
  water2: 'water-2',
  water3: 'water-3',
  bridge: 'bridge',
  campfireFrame1: 'campfire-f1',
} as const;

/**
 * Sprite Factory moonflower.png: NOVE poses de UMA flor abrindo — nao dois desenhos parecidos, a
 * mesma funcao de desenho avaliada em nove `t` de abertura (ver spritefactory/sprites/moonflower.mjs).
 *
 * O sheet vem partido em dois bancos porque o jogo desenha a flor em duas geometrias, e a divisao
 * nao e capricho: o botao fechado BLOQUEIA (billboard em pe, com sombra, pra ler como obstaculo) e
 * a flor aberta e PONTE (quad deitado, que o heroi pisa). `standing` carrega a projecao da camera
 * assada na arte; `lying` e planta baixa, que o proprio quad deitado ja achata.
 *
 * `openAt` e o `t` de cada frame — o runtime escolhe a pose por ele, e nao por um indice, pra que
 * mudar a duracao da animacao nunca precise mexer em contagem de frame.
 */
export const MOONFLOWER_FRAMES = {
  standing: [0, 1, 2, 3, 4],
  lying: [5, 6, 7, 8],
  openAt: {
    standing: [0, 0.13, 0.26, 0.39, 0.52],
    lying: [0.52, 0.68, 0.84, 1],
  },
  /** O `t` em que a arte troca de banco: a ultima pose em que a petala da frente ainda esta no ar. */
  handoff: 0.52,
} as const;
/**
 * A que distancia uma chama fecha uma flor da lua. UM numero pra toda chama — a fogueira acesa
 * parada no mapa e a tocha que o heroi traz na mao —, pela razao de sempre: "o que a flor enxerga"
 * tem de ser uma coisa so, ou o jogador aprende um alcance e e desmentido pelo outro.
 *
 * O que NAO conta e a lava, e nao por esquecimento: ela nunca apaga. Uma flor a beira do poco
 * viraria uma trava sem chave, e ja ha uma no level-1 (a flor de (8,6) tem lava a 2 tiles). O fogo
 * que fecha a flor e sempre um fogo que alguem pode apagar ou levar embora.
 */
export const MOONFLOWER_LIGHT_TILES = 2.6;
// Sprite Factory workbench.png: a MESA parada, a mesa TRABALHANDO (o martelo sobe um pixel e
// saltam duas fagulhas — micro-variacao, nunca uma silhueta nova), e as duas poses da BANDEJA.
export const TOOLBOX_FRAMES = { closed: 0, forging: 1 } as const;

// O FORNO: quanto dura uma fornada. 4s e quase o dobro da bancada (2,28s) de proposito — reduzir
// minerio nao e montar uma peca, e uma reacao quimica que leva TEMPO, e o forno tem de ser o
// gargalo natural da linha do ferro. Um bloomery é movido a fole.

// Quantas marteladas uma esponja aguenta antes de virar ferro, na mão ou sobre o altar.
export const BLOOM_BLOWS = 3;

// ONDE MONSTRO NÃO NASCE. Este raio já foi a parede de movimento e hoje é só isto: uma cova (ou o
// cerco) não abre dentro da luz de um fogo aceso, e é por isso que acender a fogueira do corredor
// CALA a cova dele. A caveira também não marcha para dentro do fogo de propósito. Continua sendo
// a alavanca do balde e da tocha; o que
// mudou é que ela não empurra mais ninguém, ela só impede que alguém apareça ali.
//
// A SEGURANÇA DO HERÓI é outro número (`CAMPFIRE_SAFE_RADIUS_TILES`): o anel em que ele descansa,
// cura e acorda. Ele continua maior que os dois — mas atenção, ele deixou de ser intransponível
// para monstro: quem quiser chegar até o herói na fogueira consegue, e paga com o corpo em chamas.
export const LIGHT_RADIUS_TILES = 3.15;
export const CAMPFIRE_SAFE_RADIUS_TILES = 3.65;

// How long a carried flame (a lit sword or wood club) lasts before it burns out in the dark.
// Re-igniting at any living fire — a lit campfire or a lava pool — resets it. Short enough
// that a long dark crossing is tense; tune against shrine spacing.
export const TORCH_BURN_MS = 5000;

// An NPC standing this close (in tiles) to a still-dead campfire won't hold a real
// conversation until that fire is lit and the ground around it is safe.
export const NPC_GATE_RADIUS_TILES = 3.2;

type NpcVisual = {
  key: string;
  frame?: number;
};

export const NPC_VISUALS: Record<string, NpcVisual> = {
  blackCat: { key: ASSET_KEYS.npcs, frame: NPC_FRAMES.blackCat },
  mimic: { key: ASSET_KEYS.npcs, frame: NPC_FRAMES.mimic },
  astronaut: { key: ASSET_KEYS.npcs, frame: NPC_FRAMES.astronaut },
  businessMan: { key: ASSET_KEYS.npcs, frame: NPC_FRAMES.businessMan },
  radiationSuit: { key: ASSET_KEYS.npcs, frame: NPC_FRAMES.radiationSuit },
  painter: { key: ASSET_KEYS.npcs, frame: NPC_FRAMES.painter },
  salesman: { key: ASSET_KEYS.npcSalesman },
  poet: { key: ASSET_KEYS.npcPoet },
  wizard: { key: ASSET_KEYS.mage },
  death: { key: ASSET_KEYS.npcDeath },
};

export const ITEM_FRAMES = {
  swordIdle: 0,
} as const;

// key.png is a 16x32 sheet of two stacked keys: the top (blue) is the held item and the
// swing sprite (like the sword), the bottom (white outline) is what sits on the map.
export const KEY_FRAMES = {
  held: 0,
  pickup: 1,
} as const;

// heart.png is a 16x32 sheet built on the same convention as key.png: the top heart is the plain
// one (ink navy, for a lit UI slot), the bottom one carries a bone outline so it reads lying on
// the dark ground — which is the only place the game shows a heart, so `pickup` is what it uses.
export const HEART_FRAMES = {
  plain: 0,
  pickup: 1,
} as const;

// woods.png is a 16x96 sheet: the dry tree shrinking one stage per axe chop, frame 0 (full
// tree) through frame 5 (passable stump).
export const DRY_TREE_FRAME_COUNT = 6;

// A felled tree grows back after this long, so the player can never run out of gravetos (the
// fuel for fire) and soft-lock. It only regrows once its tile is clear of the hero and enemies.
export const TREE_REGROW_MS = 60000;

/**
 * Quantos gravetos uma árvore derrubada solta. Era UM, e um é o que a transforma no gargalo do
 * jogo inteiro: a carvoaria pede duas madeiras por carvão, cada carvão faz uma barra de ferro, e a
 * carta final custa dez barras — vinte derrubadas, cada uma seguida de um minuto de espera pela
 * rebrota. Medido, isso são ~10 minutos parado olhando um toco, que é a única coisa neste jogo que
 * não tem gesto nenhum.
 *
 * DOIS também é o número honesto: são quatro machadadas para pôr uma árvore no chão, e uma árvore
 * inteira dando um único graveto sempre foi a parte da física que ninguém acreditou.
 */
export const TREE_STICK_YIELD = 2;

// O PONTO DE SPAWN AUTORADO: quanto tempo a cova espera, depois de o corpo dela cair, antes de
// fazer outro (EnemySpawnerManager). O relogio conta mesmo com o heroi longe — se contasse so
// perto, voltar a uma sala limpa daria uma sala vazia e a cova viraria decoracao.
//
// O numero e o que separa esta peca de um cerco: menos que isto e a sala nunca fica limpa (o
// jogador para de lutar e passa correndo), muito mais e a cova deixa de ser uma cova e vira um
// inimigo que se mata uma vez. 25s e perto do dobro do que se leva pra cruzar um chunk 12x12
// andando — atravessar de volta encontra a caveira de pe, ficar por perto nao.
export const ENEMY_RESPAWN_MS = 25000;

// A MONTANHA — a rocha em pe, e o primeiro bloqueio VERTICAL do jogo que nao e madeira.
//
// A ARTE E A PEDRA QUE O MUNDO JA TINHA, E ELA VIRA CUBO. A primeira versao destes tres frames era
// uma parede de penhasco GERADA (spritefactory/sprites/cliff-wall.mjs, agora deletada): fiadas de
// tijolo azul-acinzentado que, deitadas num quad em pe, saiam genericas — o adesivo de uma montanha.
// O mundo ja tinha a pedra certa desenhada a mao no proprio tileset, servindo de CHAO (frames 23/24,
// "Chao de Pedra": pedregulhos irregulares com argamassa escura, linha escura no topo e sombra de
// contato no pe — uma arte de PAREDE que estava deitada). Entao a montanha passou a usar essa
// pintura, e World3D a assa como CUBO de verdade (buildTileCubeGeometry): topo de rocha iluminado —
// o planalto, que e a face que uma camera de cima mais ve — e as laterais sombreadas em cor de
// vertice. Volume e o que separa uma montanha de um muro pintado.
//
// POR QUE E UMA COPIA DOS PIXELS, E NAO O FRAME 23 DIRETO. O que o mundo guarda por tile e um ID de
// frame, e o editor mapeia um frame para UMA camada (TILE_DEFS): o mesmo id nao pode ser "chao" na
// paleta de piso e "parede" na de montanha. Chao e parede tem de ser dois ids, entao a mesma
// pintura mora duas vezes no atlas — de proposito, e este comentario e o aviso de que sao duas.
//
// Duas variantes e nao tres: a pedra lisa (39) e a pedra com MUSGO (40), as duas copiadas de 23/24.
// A terceira existia pelo motivo do mar — um frame repetido milhares de vezes para de ler como
// rocha e passa a ler como GRADE —, e o cubo resolve isso melhor do que qualquer variante: cada
// bloco tem silhueta e sombreado proprios, tirados dos vizinhos. O frame 41 ficou MORTO no atlas
// (pixels apagados): id de frame e posicional, e remover a linha re-apontaria em silencio todo tile
// de dungeon autorado a partir do 42.
//
// Ela entra em SOLID_UPPER_FRAMES logo abaixo e fica deliberadamente FORA de
// CHOPPABLE_UPPER_FRAMES: o machado de aco derruba qualquer ARVORE, e nada no jogo abre montanha.
// Rocha cortavel devolveria a cada parede do mapa a condicao de porta destrancada — que e
// exatamente o bug que fez a borda do mundo virar mar.
export const CLIFF_WALL_FRAMES: readonly number[] = [39, 40];

// OS TILES DE DUNGEON, instalados no atlas a partir do frame 42 (spritefactory/sprites/
// dungeon-tiles.mjs, requantizacao 1:1 da `dungeon.png` que dormia no repositorio desde sempre).
// A ORDEM E O CONTRATO: ela e a mesma da spec e a mesma que `scripts/gen-zelda-dungeons.mjs`
// indexa. Inserir um frame no meio re-aponta em silencio todo tile ja autorado.
//
// As paredes entram em SOLID_UPPER_FRAMES abaixo — quad em pe, com sombra — e ficam fora de
// CHOPPABLE_UPPER_FRAMES: masmorra nao se derruba a machado.
export const DUNGEON_TILES = {
  floors: [42, 43, 44] as readonly number[],
  walls: [45, 46, 47] as readonly number[],
  wallTorch: 48,
  wallMoss: 49,
  /** A parede RACHADA: a pista da parede bombardeavel — a legenda que o Zelda 1 nunca deu. */
  wallCracked: 50,
  floorCracked: 51,
} as const;
export const DUNGEON_WALL_FRAMES: readonly number[] = [
  ...DUNGEON_TILES.walls, DUNGEON_TILES.wallTorch, DUNGEON_TILES.wallMoss, DUNGEON_TILES.wallCracked,
];

/**
 * O que o World3D assa como BLOCO MACICO (`buildTileCubeGeometry`) em vez de quad em pe: a
 * alvenaria de dungeon e a montanha. E a unica lista que responde "este tile OCLUI de verdade, do
 * chao ao topo" — uma arvore esta em `SOLID_UPPER_FRAMES` e bloqueia o passo, mas e uma silhueta
 * e nao tapa nada por tras dela.
 */
export const MASS_TILE_FRAMES: ReadonlySet<number> = new Set([
  ...DUNGEON_WALL_FRAMES, ...CLIFF_WALL_FRAMES,
]);

/**
 * A PRECONDICAO DA TOCHA DE PAREDE: o tile ao SUL dela nao pode ser um bloco macico.
 *
 * Nao e gosto, e geometria. `Billboard3D` nao gira — todo quad deste jogo e vertical e olha para o
 * sul, porque a camera esta em +z. Uma tocha desenhada na face oeste de um bloco cai DENTRO do
 * intervalo em z do proprio bloco, e a face sul dele, mais perto da camera, a oclui inteira; com
 * alvenaria ao sul acontece o mesmo, um tile adiante. Ou seja: quando o vizinho de baixo e macico
 * nao existe lugar visivel para a chama, e a tocha nao pode desenhar nada.
 *
 * Ela mora aqui, e nao no `WallTorchObject`, para o `EditorStore` poder fazer a MESMA pergunta no
 * Salvar sem arrastar o renderer 3D para dentro do editor — o aviso e o desenho discordarem seria
 * uma segunda verdade, e a peca ficaria prometendo o que o jogo recusa.
 */
export const wallTorchFaceIsClear = (southUpperFrame: number | null | undefined): boolean => (
  southUpperFrame === null || southUpperFrame === undefined || !MASS_TILE_FRAMES.has(southUpperFrame)
);

// Upper-layer tileset frames that stand UP off the ground. Being listed here means three
// things at once, which is why it is the only switch a standing tile needs:
//   1. ChunkManager.isCellBlocked treats the cell as collision even with none painted, so the
//      tile blocks the hero and enemies alike (both consult isCellBlocked);
//   2. World3D.buildTerrain builds it as an upright quad that casts a shadow, instead of the
//      flat sticker every other upper tile becomes;
//   3. the editor paints its implicit collision in amber (vs the red of hand-painted).
// An upper-layer frame that is NOT here lies flat on the floor and is walked straight through —
// which is what you want for bones and rubble, and never what you want for a headstone.
// Frame ids index forest_tile_set.png (3 columns): 3 & 21 are dead trees, 4/14/15/16/17/18 are
// pines, and 22 & 25 are the cemetery's spiked head and tomb.
export const SOLID_UPPER_FRAMES: ReadonlySet<number> = new Set([
  3, 4, 14, 15, 16, 17, 18, 21, 22, 25,
  36, 37, // the tree-chop stages (see TREE_CHOP_STAGE_FRAMES): a half-felled tree still blocks
  ...CLIFF_WALL_FRAMES, // the mountain: standing rock, and the only vertical blocker that is not wood
  ...DUNGEON_WALL_FRAMES, // a alvenaria das dungeons
]);

// Which of those standing tiles are TREES — the ones the steel axe (`greatAxe`) can fell.
// The plain axe only ever bites dead wood (the dryTree/dryShrub props); the steel axe is
// defined by cutting ANY tree, and most trees in the world are not props at all: they are
// upper-layer tiles baked into one static mesh (846 of them in world.json). So "any tree"
// has to mean the tile too, or the item's whole promise is a lie the moment you meet a pine.
// Deliberately NOT the whole of SOLID_UPPER_FRAMES: 22 (spiked head) and 25 (tomb) stand up
// the same way but are masonry and bone — an axe that chopped down a gravestone would say
// the frame set means "scenery", when what it means here is "wood".
// A tree TILE comes down the way the dryTree prop does — one stage per swing, not in one blow.
// The prop shrinks through its own 6-frame sheet (woods.png); a tile cannot, because World3D
// merges every standing tile into ONE mesh sampling the tileset atlas, so a tile's stages have
// to be frames of that same atlas. These two are SHARED by all eight tree frames: at 16x16 a
// severed stump keeps no silhouette that says which pine it came from, and eight private
// ladders would be sixteen frames saying the same thing.
export const TREE_CHOP_STAGE_FRAMES: readonly number[] = [36, 37]; // wounded (crown gone), stump
export const CHOPPABLE_UPPER_FRAMES: ReadonlySet<number> = new Set([
  3, 4, 14, 15, 16, 17, 18, 21, // the standing trees themselves
  ...TREE_CHOP_STAGE_FRAMES, // …and what a half-felled one becomes, so the next swing continues
]);

// Chance that felling a common tree yields a graveto. A tile tree is NOT the dry tree's equal:
// there are ~850 of them against 8 dryTree props, and every one of them dropping a stick would
// turn the whole map into an infinite fuel dispenser and flatten the fire economy that the
// scythe, the plant loop and the dryTree's own regrow timer exist to meter. So most of them
// give nothing, and wood stays worth walking for.
export const TREE_TILE_STICK_CHANCE = 0.25;

// O SORTEIO DO CARVAO MORREU (2026-08-12): todo arbusto seco queimado deixa carvao, sempre. Era
// 1 em 4, e a raridade metrificava o fogo enquanto o carvao era so comida de tocha e a unica
// fonte dele era queimar mato. Hoje ele e o REAGENTE da cadeia do ferro e o forno tem a CARVOARIA
// (madeira+madeira, renovavel): contra uma receita repetivel, o sorteio no arbusto deixou de ser
// economia e virou imposto sobre quem escolheu o caminho do fogo. Ver GameScene.dropCharcoalFromBush.

// Ground-layer frames that BLOCK, the mirror of SOLID_UPPER_FRAMES for the floor. The sea is
// the only one, and it exists because of the steel axe: the world's edge used to be a wall of
// pine tiles (WorldData's VOID_WALL_FRAME), which an axe that fells any tree turns into a door
// out of the map. The sea is the border that no item in the game answers — collision here is
// implicit and unconditional.
export const SEA_TILE_FRAME = 33;
// Three interchangeable paintings of the same water, picked per tile at render time (World3D).
// The river gets away with ONE tile because it is ~30 of them; the sea covers ~11k, and a single
// frame repeated that many times stops reading as water and starts reading as a grid — wallpaper
// (caught in the `machado` playtest shots). The variants are the same grid cyclically shifted,
// so density and dash length are identical and no variant reads lighter than its neighbours.
// Only SEA_TILE_FRAME is ever stored in world data; the others exist purely as art.
export const SEA_TILE_FRAMES: readonly number[] = [SEA_TILE_FRAME, 34, 35];
export const SOLID_GROUND_FRAMES: ReadonlySet<number> = new Set([SEA_TILE_FRAME]);

// THE WORLD'S FLOOR, AND THE EARTH THAT SHOWS THROUGH IT.
//
// 87% of the 3.600 ground tiles in world.json are this one frame, and it covers 68-76% of every
// frame the player looks at. Its art is two colours 5 luma apart — a flat plum field, straight
// from the initial commit and the only terrain in the game that never went through the sprite
// factory — which is why the whole picture measures a luminance sd of 15 against the cemetery
// cobble's 48 under the SAME lights (see plano-chao.md for the measurement).
//
// The answer is NOT to replace it. A painted floor everywhere is a second texture competing with
// every sprite standing on it, and it takes the world's calm with it. So the drawn earth comes in
// PATCHES: most of the ground stays the field it always was, and here and there it opens into
// bare, worked earth with real relief. That is what a floor does — it is mostly one thing, and
// the interest is where it stops being that.
//
// The mechanism is the sea's (see SEA_TILE_FRAMES above): only GROUND_TILE_FRAME is ever stored
// in world data, and a deterministic hash of the coordinate decides what a tile actually wears at
// mesh-build time. Nothing in world.json changed, the editor still paints one "Terra", and
// DIGGABLE_GROUND_FRAMES below still keys off the stored 5.
export const GROUND_TILE_FRAME = 5;
/** The painted-earth family, art only — never stored in world data. Appended at the end of the
 *  atlas, because frame ids are positional and appending is the only safe way to grow it. */
export const GROUND_DETAIL_FRAMES: readonly number[] = [52, 53, 54, 55, 56];
/**
 * How the patches fall — the two knobs for the eye. `GRAIN` is their size in tiles; `CUT` is how
 * high the earthiness field (below) has to run before the ground opens, so LOWER means MORE earth.
 *
 * Measured on the real world.json, over its 3.129 tiles of frame 5:
 *
 *     cut 0.60 → 28%   0.64 → 22%   0.66 → 19%   0.70 → 14%   0.75 → 8%
 *
 * The cut is the knob and not a "share" percentage on purpose: bilinear value noise piles up
 * around its middle instead of spreading evenly, so no honest formula turns one into the other —
 * a `share` field would be a number that lies. The table above is the conversion, and it is
 * re-measured, not derived.
 *
 * TWO THINGS THIS HAD TO GET RIGHT, and each one was a version:
 *
 *   · the detail has to CLUSTER. Decided per tile, it scatters lone painted squares across the
 *     field, and a lone high-contrast tile in a calm field does not read as a patch of earth —
 *     it reads as a broken tile.
 *   · and the cluster cannot be a BOX. Deciding it per coarse cell clusters correctly and gives
 *     every patch four straight sides: what you see is not earth showing through, it is a
 *     rectangle of another texture pasted on the floor. Nothing in this world has square edges.
 */
export const GROUND_DETAIL_GRAIN = 3;
export const GROUND_DETAIL_CUT = 0.66;

/**
 * Which of a terrain family's interchangeable paintings a given tile wears — the sea's three
 * waters, the ground's four earths. A cheap integer hash of the coordinate, and DETERMINISTIC:
 * the same tile is the same variant on every boot, which is what keeps the reference screenshots
 * byte-identical between runs (and keeps three.js's shared Math.random stream untouched — see the
 * visual-ref trap in CLAUDE.md).
 *
 * It lives HERE, next to the two families, because both the 3D renderer and the editor's tilemap
 * ask the question and they have to give the same answer: an editor that paints one earth while
 * the game draws another is an editor that lies about the world being built in it.
 */
export const terrainVariant = (x: number, y: number, count: number): number => {
  let h = (x * 73856093) ^ (y * 19349663);
  h = (h ^ (h >>> 13)) >>> 0;
  return h % count;
};

/**
 * "Quanta terra tem aqui" — a smooth field over the world, 0..1, from a lattice of hashes read
 * bilinearly. It is the same value noise the ground art itself is painted with
 * (spritefactory/sprites/ground-earth.mjs), one scale up: there it shapes clods inside a tile,
 * here it shapes patches across the map. Deterministic, so the world is identical on every boot.
 */
const earthField = (x: number, y: number, grain: number, salt: number): number => {
  const fx = x / grain; const fy = y / grain;
  const cx = Math.floor(fx); const cy = Math.floor(fy);
  const tx = fx - cx; const ty = fy - cy;
  const at = (i: number, j: number): number => terrainVariant(i + salt, j - salt, 1024) / 1023;
  const top = at(cx, cy) * (1 - tx) + at(cx + 1, cy) * tx;
  const bottom = at(cx, cy + 1) * (1 - tx) + at(cx + 1, cy + 1) * tx;
  return top * (1 - ty) + bottom * ty;
};
/**
 * TWO OCTAVES, and the fine one is not decoration — it is what stops the patch from looking
 * MACHINE-CUT. One octave alone thresholds into contours that hug the lattice it was built on:
 * the edges come out as long straight runs and clean 45° corners, which at this scale reads as a
 * shape someone laid out on graph paper. The fine octave (one lattice point per tile) jitters
 * that boundary by about a tile, so the edge frays the way a worn patch of ground frays. Same
 * lesson as the tile art itself: what kills a procedural surface is the grid showing through.
 */
const groundEarthiness = (x: number, y: number): number => (
  0.76 * earthField(x, y, GROUND_DETAIL_GRAIN, 0) + 0.24 * earthField(x, y, 1, 977)
);
/**
 * What a stored ground frame actually wears at (x, y) — identity for everything but the earth,
 * which opens into a patch of painted ground over roughly a fifth of the map.
 *
 * Two reads at two scales: the SMOOTH one says whether this corner of the world is bare earth at
 * all (and its edge is a curve, not a box), and a per-tile hash picks which of the paintings the
 * tile wears — so a patch is never four copies of the same square.
 */
export const groundFrameAt = (frame: number, x: number, y: number): number => {
  if (frame !== GROUND_TILE_FRAME) return frame;
  if (groundEarthiness(x, y) < GROUND_DETAIL_CUT) return frame;
  return GROUND_DETAIL_FRAMES[terrainVariant(x, y, GROUND_DETAIL_FRAMES.length)];
};

// Ground-layer frames the SHOVEL (swung with the A button) can dig a plantSpot hole into: the
// two "Terra" paintings — the overworld's bare earth. A frame list and not "anything walkable"
// on purpose: stone patios (23/24), cracked slabs, dungeon masonry and the sea all refuse the
// blade, which is what keeps the answer physical — a shovel bites EARTH, and where there is
// no earth the swing comes out empty.
export const DIGGABLE_GROUND_FRAMES: ReadonlySet<number> = new Set([5, 6]);

// Two wood sticks ("gravetos") build one bridge tile over water (see WaterObject); the plank
// art is a dedicated tile (ASSET_KEYS.bridge = bridge.png).
export const BRIDGE_GRAVETOS_REQUIRED = 2;

// A SEMENTE anda em PACOTE: o punhado que a foice derruba (e o que um mundo autora) vale
// CINCO sementes na mochila — plantar gasta uma por canteiro, então um corte de mato rende
// uma fileira, não um buraco. O pacote VIAJA com o item no chão (ItemPickup.units): pousar põe o
// punhado inteiro num item só, e pegá-lo devolve
// a mesma contagem — sem isso, pousar 1 e pegar 5 seria uma máquina de imprimir semente.
export const SEEDS_PER_PACK = 5;
// Que tipos de item são SEMENTE-EM-PACOTE (a regra acima vale para todas — uma regra, nunca
// um `if` por espécie de semente): a comum brota mato; a carnívora brota a planta-armadilha.
export const SEED_PACK_KINDS: ReadonlySet<string> = new Set(['seeds']);

// O punhado que VIAJA JUNTO: pousar com B põe a contagem INTEIRA da mochila num item só no
// chão, e pegá-lo devolve a mesma contagem (ItemPickup.units). As sementes inauguraram o
// contrato; o MINÉRIO DE FERRO entra porque a rocha-veio o produz aos montes e vendê-lo ao
// astronauta é por quantidade. Lista SEPARADA de SEED_PACK_KINDS de propósito: o buraco de
// plantio pergunta por SEMENTE, e um punhado de ferro não pode ser semeado num canteiro.
export const UNIT_PACK_KINDS: ReadonlySet<string> = new Set([...SEED_PACK_KINDS, 'iron']);

// O PUNHADO COM QUE UMA PECA NASCE NO CHAO. Isto vale so para o que nasce no mundo (pickup
// autorado, drop sem contagem explicita). Um item
// que ja viajava com `units` mantem os dele: o punhado viaja, e essa lei nao muda.
const SPAWN_PACK: ReadonlyMap<string, number> = new Map([
  ...[...SEED_PACK_KINDS].map((k) => [k, SEEDS_PER_PACK] as const),
]);

/** Com quantas unidades este tipo nasce no chao quando ninguem diz a contagem. */
export const spawnPackSize = (kind: string): number => SPAWN_PACK.get(kind) ?? 1;

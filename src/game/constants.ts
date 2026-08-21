export const TILE_SIZE = 8;
export const CHARACTER_SIZE = 16;
export const DEFAULT_GAME_WIDTH = 320;
export const DEFAULT_GAME_HEIGHT = 240;
export const GRID_COLUMNS = 8;
export const GRID_ROWS = 8;
export const TILESET_FRAME_SIZE = 16;
export const ITEM_FRAME_SIZE = 16;
export const MIN_BOARD_TILE_SIZE = 24;
export const MAX_CHARACTER_SIZE = 52;
export const BOARD_PANEL_PADDING = 16;
export const TILE_GAP = 6;
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
export const DIALOG_BOX_MIN_FONT = 13;
export const DIALOG_BOX_MAX_FONT = 20;
export const DIALOG_BOX_MIN_FRACTION = 0.16;
export const DIALOG_BOX_MAX_FRACTION = 0.45;

export type DialogBoxMetrics = { boxHeight: number; fontSize: number; margin: number };

/** As medidas da caixa de fala, em pixels de tela, para um canvas de `width` × `height`. */
export const dialogBoxMetrics = (width: number, height: number): DialogBoxMetrics => {
  const margin = Math.round(Math.min(20, Math.max(8, Math.min(width, height) * 0.02)));
  // A largura manda (a caixa é uma barra), mas a altura tem voto: num telefone deitado uma
  // fonte escolhida só pela largura empurraria a caixa por metade da tela.
  const fontSize = Math.max(DIALOG_BOX_MIN_FONT, Math.min(DIALOG_BOX_MAX_FONT,
    Math.round(Math.min(width / 46, height / 22))));
  // Os degraus batem com os do CSS (o retrato e o respiro encolhem em 560px).
  const ems = width < 560 ? 9.4 : width < 900 ? 7.6 : 6.6;
  const boxHeight = Math.round(Math.min(
    height * DIALOG_BOX_MAX_FRACTION,
    Math.max(fontSize * ems, height * DIALOG_BOX_MIN_FRACTION),
  ));
  return { boxHeight, fontSize, margin };
};
// Starting/maximum hearts.
export const PLAYER_HEALTH_MAX = 4;
export const ITEM_FLOAT_AMPLITUDE = 3;
export const ITEM_FLOAT_SPEED = 0.0034;
export const ITEM_SCALE_PULSE = 0.04;
export const EDITOR_PANEL_WIDTH = 320;
export const EDITOR_BUTTON_HEIGHT = 30;
export const EDITOR_BUTTON_WIDTH = 90;
export const EDITOR_PALETTE_COLUMNS = 5;
export const EDITOR_EMPTY_TILE_LABEL = 'Limpar';
export const EDITOR_LEVEL_BUTTON_HEIGHT = 24;
export const EDITOR_LEVEL_LIST_MAX = 5;
export const EDITOR_NEW_LEVEL_FILE_NAME = 'level_new.json';
export const EDITOR_PALETTE_TILE_SIZE = 32;
export const GAMEPLAY_HERO_SCALE = 1;
export const GAMEPLAY_HERO_MAX_SIZE = Number.MAX_SAFE_INTEGER;

export const CHUNK_COLUMNS = 12;
export const CHUNK_ROWS = 12;
export const WORLD_VIEWPORT_COLS = 10;
export const WORLD_VIEWPORT_ROWS = 12;

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

// 2.5D depth sorting: entities lower on screen (greater worldY) are closer to the
// camera, so they draw in front. The band stays above pickups (item=8) and well below
// the lighting overlay (25). worldY spans roughly [-24, 23], giving depths ~9.6..14.3.
const Y_SORT_BASE = 12;
const Y_SORT_STEP = 0.1;
export const ySortDepth = (worldY: number, bias = 0): number =>
  Y_SORT_BASE + (worldY * Y_SORT_STEP) + bias;

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
  hearts: 'hearts',
  keyItem: 'key-item',
  keyItemIcon: 'key-item-icon',
  swordItem: 'sword-item',
  swordItemIcon: 'sword-item-icon',
  axeIcon: 'axe-icon',
  greatAxeIcon: 'great-axe-icon',
  bombItem: 'bomb-item',
  bombIcon: 'bomb-icon',
  pickaxeIcon: 'pickaxe-icon',
  scytheIcon: 'scythe-icon',
  shovelIcon: 'shovel-icon',
  carnivoreSeedsItem: 'carnivore-seeds',
  carnivorousPlant: 'carnivorous-plant',
  woodItem: 'wood-item',
  woodIcon: 'wood-icon',
  woodOnFireIcon: 'wood-on-fire-icon',
  lookedDoorObject: 'looked-door-object',
  swingGateObject: 'swing-gate-object',
  undead: 'undead',
  undeadHurt: 'undead-hurt',
  undeadBorn0: 'undead-born-0',
  undeadBorn1: 'undead-born-1',
  undeadBorn2: 'undead-born-2',
  undeadBorn3: 'undead-born-3',
  undeadBorn4: 'undead-born-4',
  undeadBorn5: 'undead-born-5',
  undeadBorn6: 'undead-born-6',
  // A ARMA DELA (Sprite Factory). Um femur simetrico: o billboard gira em torno do proprio centro
  // durante o golpe, e um osso com no de um lado so leria de ponta-cabeca em metade do arco.
  undeadBone: 'undead-bone',
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
  bones: 'bones',
  // A TEIA que a aranha larga ao andar (Sprite Factory). Marca de chao como a ossada: nao bloqueia,
  // nao prende, nao fere — diz que ha aranha naquele corredor antes de uma pular nele.
  spiderWeb: 'spider-web',
  // Os PEDACOS do desmonte: [0] a cabeca, [1] um osso quebrado. O femur inteiro que voa junto e o
  // proprio `undeadBone` — o esqueleto se parte nos mesmos ossos com que batia.
  undeadBits: 'undead-bits',
  // O irmao dele: o balao com o GRAVETO ACESO, que o heroi pensa ao bater num arbusto seco com o
  // graveto apagado na mao (ver HeroThought e GameScene.useItemAt).
  thoughtTorch: 'thought-torch',
  coin: 'coin',
  // A FAUNA que voltou a ter corpo (ver entities/enemies/). A arte sempre esteve em
  // public/assets/characters/enemies/ — era o bestiario do modo Sobreviventes —, e ela so pode
  // morar aqui porque agora tem quem a desenhe: cada def carregada e download e VRAM no boot.
  bat: 'bat',
  batHurt: 'bat-hurt',
  spider: 'spider',
  // Slime e Slime Grande sao SHEETS de 2 frames (16x32): pousado e esticado no pulo. O pulo e a
  // unica animacao deles, e ela troca de frame no passo — gosma nao anda, salta.
  slime: 'slime',
  slimePool: 'slime-pool',
  bigSlime: 'bigslime',
  bigSlimePool: 'bigslime-pool',
  turret: 'turret',
  turretBullet: 'turret-bullet',
  // O bicho do rio (Sprite Factory). Sheet de 5 ESTADOS em coluna — ver ZORA_FRAMES.
  zora: 'zora',
  // `mage` e a arte que o NPC "wizard" tambem usa (NPC_VISUALS). O mago INIMIGO nasce com um tom
  // frio por cima justamente por isso — ver MageEnemy: dois personagens nao podem ler igual.
  mage: 'mage',
  mageHurt: 'mage-hurt',
  mageCast: 'mage-cast',
  magicBall: 'magic-ball',
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
  cuttingGrass0: 'cutting-grass0',
  cuttingGrass1: 'cutting-grass1',
  cuttingGrass2: 'cutting-grass2',
  cuttingGrass3: 'cutting-grass3',
  seedsItem: 'seeds-item',
  plantHole: 'plant-hole',
  plantMound: 'plant-mound',
  // A flor da lua (spritefactory): as 9 poses de UMA flor abrindo — ver MOONFLOWER_FRAMES.
  moonflower: 'moonflower',
  // O MARCO da estrada do construtor de mundo (spritefactory/sprites/road-seal.mjs): a laje de
  // pedra em que se compra o próximo chunk. Dois frames — dormente e desperta.
  roadSeal: 'road-seal',
  toolbox: 'workbench',
  furnace: 'furnace',
  // O ALTAR: laje de pedra em 2 frames (fria / com o tampo em brasa). Ver AltarObject.
  altar: 'altar',
  oreItem: 'ore-item',
  bloomItem: 'bloom-item',
  levelPortal: 'level-portal-icon',
  cutGrass: 'cut-grass',
  cutGrassWind0: 'cut-grass-wind0',
  cutGrassWind1: 'cut-grass-wind1',
  grassFire0: 'grass-fire0',
  grassFire1: 'grass-fire1',
  lavaFloor: 'lava-floor',
  water: 'water',
  water1: 'water-1',
  water2: 'water-2',
  water3: 'water-3',
  bridge: 'bridge',
  campfireFrame0: 'campfire-f0',
  campfireFrame1: 'campfire-f1',
  campfireFrame2: 'campfire-f2',
  tinyFire0: 'tiny-fire0',
  tinyFire1: 'tiny-fire1',
  tinyFire2: 'tiny-fire2',
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
/** As duas caras do marco da estrada: pedra fria, e pedra com o vinco de moeda ACESO. */
export const ROAD_SEAL_FRAMES = { dormant: 0, awake: 1 } as const;

// O FORNO: quanto dura uma fornada. 4s e quase o dobro da bancada (2,28s) de proposito — reduzir
// minerio nao e montar uma peca, e uma reacao quimica que leva TEMPO, e o forno tem de ser o
// gargalo natural da linha do ferro. Um bloomery é movido a fole.

// Quantas marteladas uma esponja aguenta antes de virar ferro, na mão ou sobre o altar.
export const BLOOM_BLOWS = 3;

// A gosma nao anda: SALTA. Sao os dois unicos frames dela — pousada e esticada no ar —, e a troca
// acontece no passo (ver SlimeEnemy), nao num relogio de animacao: um slime parado fica parado.
export const SLIME_FRAMES = { rest: 0, hop: 1 } as const;

// O ZORA (Sprite Factory, zora.mjs): o CICLO inteiro dele, na ordem em que acontece. `up` e a unica
// janela em que a espada o alcanca; `breathing` e o mesmo `up` com micro-variacao, e os dois se
// alternam parados para o bicho respirar. O `spit` mora no mesmo sheet porque a municao e do bicho
// (o precedente e bomb.png, que guarda a bomba e a fagulha juntas).
//
// `submerged` e o unico frame desenhado DE CIMA: ele nao vai num billboard em pe como o resto do
// jogo, vai num quad DEITADO na agua (ver ZoraEnemy). Marca na agua e chao — desenhada de lado, ela
// flutuava meio tile no ar, que foi como a primeira versao chegou ao jogo.
export const ZORA_FRAMES = { submerged: 0, rising: 1, up: 2, spitting: 3, spit: 4, breathing: 5 } as const;

// The skull's rise-from-the-ground animation, in playback order (see UndeadEnemy).
export const UNDEAD_BORN_FRAME_KEYS: readonly string[] = [
  ASSET_KEYS.undeadBorn0,
  ASSET_KEYS.undeadBorn1,
  ASSET_KEYS.undeadBorn2,
  ASSET_KEYS.undeadBorn3,
  ASSET_KEYS.undeadBorn4,
  ASSET_KEYS.undeadBorn5,
  ASSET_KEYS.undeadBorn6,
];

// ── O QUE UMA FOGUEIRA ACESA FAZ COM UM MONSTRO ─────────────────────────────────────────────
//
// Ela QUEIMA quem chega perto, e mais nada. A luz era uma PAREDE — monstro nenhum pisava dentro
// dela, por nenhum motivo visível —, e essa parede caiu (2026-08-12, a pedido do usuário: "se for
// mais longe que 2 tiles ele está 100% seguro e não liga mais pra fogueira"). O que ficou é uma
// regra só, física e legível de longe: dentro do CALOR o corpo pega fogo e perde vida; fora dele a
// fogueira é uma luz bonita e nada mais.
//
// Duas tiles é o anel inteiro à volta da lenha (os quatro cardeais a 1, as diagonais a 1,41 e os
// cardeais a 2) — perto o bastante para ser uma decisão de quem chega, longe o bastante para não
// ser um acidente de quem passa.
export const CAMPFIRE_SCORCH_RADIUS_TILES = 2;

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

// ui/hearts.png (5 frames de 7x7) e OUTRA coisa: o coracao do HUD enchendo, do vazio (so o
// contorno) ao cheio. Ele dormia no repositorio desde sempre, sem um unico uso — o jogo nao tem
// HUD. A subtela e o primeiro lugar onde ele cabe, e cabe exatamente: "quantos coracoes faltam"
// se desenha com o coracao VAZIO no lugar, nunca com o cheio apagado por opacidade.
export const UI_HEART_FRAMES = { empty: 0, full: 4 } as const;

// heart.png is a 16x32 sheet built on the same convention as key.png: the top heart is the plain
// one (ink navy, for a lit UI slot), the bottom one carries a bone outline so it reads lying on
// the dark ground — which is the only place the game shows a heart, so `pickup` is what it uses.
export const HEART_FRAMES = {
  plain: 0,
  pickup: 1,
} as const;

// bomb.png is a 16x32 sheet: top = the bomb itself, bottom = a small spark puff (used as
// explosion debris).
export const BOMB_FRAMES = {
  item: 0,
  spark: 1,
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

// Ground-layer frames the SHOVEL (swung with the A button) can dig a plantSpot hole into: the
// two "Terra" paintings — the overworld's bare earth. A frame list and not "anything walkable"
// on purpose: stone patios (23/24), cracked slabs, dungeon masonry and the sea all refuse the
// blade, which is what keeps the answer physical — a shovel bites EARTH, and where there is
// no earth the swing comes out empty.
export const DIGGABLE_GROUND_FRAMES: ReadonlySet<number> = new Set([5, 6]);

// Two wood sticks ("gravetos") build one bridge tile over water (see WaterObject); the plank
// art is a dedicated tile (ASSET_KEYS.bridge = bridge.png).
export const BRIDGE_GRAVETOS_REQUIRED = 2;

// Quantos gravetos FECHAM a pira (ver PyreObject). Ela e a irma grande da ponte: a ponte custa
// dois gravetos porque e um gesto, a pira custa VIAGENS — e desde que ela virou O FIM DO JOGO
// (acende-la e zerar), esse preco tem de ser uma EMPREITADA, nao um recado. Quinze toras sao
// umas seis idas a mata; o atalho e ajudar os NPCs, e cada missao cumprida manda toras para ca
// (ver QUEST_PYRE_LOGS em dialogs/NpcQuests) — metade do baralho fecha a torre sozinha.
export const PYRE_LOGS_REQUIRED = 15;

// A SEMENTE anda em PACOTE: o punhado que a foice derruba (e o que um mundo autora) vale
// CINCO sementes na mochila — plantar gasta uma por canteiro, então um corte de mato rende
// uma fileira, não um buraco. O pacote VIAJA com o item no chão (ItemPickup.units): pousar põe o
// punhado inteiro num item só, e pegá-lo devolve
// a mesma contagem — sem isso, pousar 1 e pegar 5 seria uma máquina de imprimir semente.
export const SEEDS_PER_PACK = 5;
// Que tipos de item são SEMENTE-EM-PACOTE (a regra acima vale para todas — uma regra, nunca
// um `if` por espécie de semente): a comum brota mato; a carnívora brota a planta-armadilha.
export const SEED_PACK_KINDS: ReadonlySet<string> = new Set(['seeds', 'carnivoreSeeds']);

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

// River water is animated: these frames (water_0..3.png, a seamless-looping ripple cycle) are
// cycled by WaterObject, exactly like the campfire's flame frames.
export const WATER_FRAME_KEYS: readonly string[] = [
  ASSET_KEYS.water,
  ASSET_KEYS.water1,
  ASSET_KEYS.water2,
  ASSET_KEYS.water3,
];

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
// The dialogue panel hugs this fraction of the canvas width, but never grows past
// DIALOG_PANEL_MAX_WIDTH — on wide screens 50% would stretch the text past a comfortable
// reading measure. Shared by DialogOverlay (the panel) and GameScene (the camera pan).
export const DIALOG_PANEL_FRACTION = 0.5;
export const DIALOG_PANEL_MAX_WIDTH = 640;
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
  lavaBootsIcon: 'lava-boots-icon',
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
  // O balao de PENSAMENTO do morto-vivo (Sprite Factory). Nao confundir com o balao de
  // item-que-falta, que foi arrancado do jogo: aquele falava com o jogador, este mostra o que a
  // criatura quer. Por isso a arte e outra (bolhas soltas, nao rabicho de fala) e a chave e outra.
  thoughtPlate: 'thought-plate',
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
  // O braco robotico (spritefactory): 4 frames = 4 orientacoes, e a garra que viaja em 2.
  inserter: 'inserter',
  inserterHand: 'inserter-hand',
  woodenCrate: 'wooden-crate',
  // A flor da lua (spritefactory): as 9 poses de UMA flor abrindo — ver MOONFLOWER_FRAMES.
  moonflower: 'moonflower',
  pressurePlate: 'pressure-plate',
  // O MARCO da estrada do construtor de mundo (spritefactory/sprites/road-seal.mjs): a laje de
  // pedra em que se compra o próximo chunk. Dois frames — dormente e desperta.
  roadSeal: 'road-seal',
  waterWheel: 'water-wheel',
  boiler: 'boiler',
  wire: 'wire',
  // A FABRICA (spritefactory): a esteira em 8 frames (`dir + 4*fase`), o extrator na mesma
  // convencao, o bau em 2 (vazio / com carga) e a engrenagem, que e um icone de item.
  belt: 'belt',
  extractor: 'extractor',
  chest: 'chest',
  gearItem: 'gear-item',
  toolbox: 'workbench',
  furnace: 'furnace',
  tripHammer: 'trip-hammer',
  // O ALTAR: laje de pedra em 2 frames (fria / com o tampo em brasa). Ver AltarObject.
  altar: 'altar',
  // A VIGA do martinete: sheet PROPRIO porque os frames dele tem 32px (dois tiles de largura).
  tripHammerBeam: 'trip-hammer-beam',
  oreItem: 'ore-item',
  bloomItem: 'bloom-item',
  electronicGate: 'electronic-gate',
  levelPortal: 'level-portal-icon',
  battery: 'battery',
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

// Sprite Factory sheet: placa solta em cima, pressionada embaixo.
export const PRESSURE_PLATE_FRAMES = { up: 0, down: 1 } as const;

// Sprite Factory: oito orientacoes do rotor, primeiro apagadas e depois com o dinamo ativo.
// O banco duplicado deixa a roda parar em qualquer orientacao sem a lampada teleportar o rotor.
export const WATER_WHEEL_FRAMES = { phases: 8, off: 0, powered: 8 } as const;
// Sprite Factory boiler.png: (fria|acesa) × (seca|com agua) + gerando — micro-variacao pura.
// O visor de nivel vazio e o pedido visual de AGUA, como a boca fria e o pedido de fogo.
export const BOILER_FRAMES = { coldDry: 0, coldWet: 1, hotDry: 2, hotWet: 3, on: 4 } as const;
// Sprite Factory battery.png: vazia / carregada (a janela gold) — o balde da eletricidade.
export const BATTERY_FRAMES = { empty: 0, full: 1 } as const;
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
// Sprite Factory electronic_gate.png: quatro alturas da grade em bancos sem/com energia.
export const ELECTRONIC_GATE_FRAMES = { phases: 4, off: 0, powered: 4 } as const;
// Sprite Factory workbench.png: a MESA parada, a mesa TRABALHANDO (o martelo sobe um pixel e
// saltam duas fagulhas — micro-variacao, nunca uma silhueta nova), e as duas poses da BANDEJA.
//
// A bandeja sobreviveu a reforma que tirou os slots do caminho do JOGADOR porque as MAQUINAS
// continuam alimentando a bancada por ali: um braco robotico nao abre menu. O que mudou e que
// ninguem mais e OBRIGADO a usa-la — o jogador constroi pelo A, direto da mochila.
export const TOOLBOX_FRAMES = { closed: 0, ajar: 0, open: 1, forging: 1, slot: 2, slotFull: 3 } as const;
// Quanto tempo de REDE VIVA uma carga banca: pousada junto a um cabo, a bateria e uma semente
// do flood-fill e drena so ENQUANTO alimenta (na mao ela e estavel — a tensao mora em quanto
// tempo a rede precisa ficar de pe, nao na viagem, que ja e o drama da tocha).
export const BATTERY_FEED_MS = 20000;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// A REDE COM VAZAO — os watts, que sao os unicos numeros do jogo que existem para NAO fechar.
//
// A regra que desenha a escada toda: uma RODA banca duas maquinas, uma CALDEIRA banca cinco. Foi
// escolhido assim porque a roda e de graca (basta um rio) e a caldeira custa combustivel — se a
// gratuita bancasse a fabrica inteira, a caldeira seria decoracao e a lenha nunca teria motivo.
// A placa de pressao fica em 1 de proposito: ela e um SENSOR que por acaso gera, e uma fabrica
// movida a caixote em cima de um botao seria a resposta errada para todo problema de energia.
//
// O que acontece quando a conta nao fecha nao e um aviso: e a fabrica inteira ARRASTANDO na
// proporcao exata do que faltou (ver solvePowerGrid). Um sexto consumidor numa caldeira nao
// para nada — deixa tudo 17% mais lento, e e o jogador que decide se isso e um problema.
// ─────────────────────────────────────────────────────────────────────────────────────────────
/** As duas caras do marco da estrada: pedra fria, e pedra com o vinco de moeda ACESO. */
export const ROAD_SEAL_FRAMES = { dormant: 0, awake: 1 } as const;

export const POWER_WATTS = {
  // Fontes.
  pressurePlate: 1,
  waterWheel: 4,
  boiler: 10,
  /** A bateria pousada: meia roda. Ela e emergencia e ponte, nunca uma usina de bolso. */
  battery: 2,
  // Consumidores. O braco e a referencia (2): tudo se le como "quantos bracos isto vale".
  inserter: 2,
  /** A esteira e a peca que se compra as duzias, entao ela e a mais barata que existe. */
  belt: 1,
  /** O extrator custa dois bracos: ele e o unico que cria materia, e criar tem de doer. */
  extractor: 4,
  /** O portao so quer saber se ha corrente — ele nao tem velocidade para degradar. */
  electronicGate: 1,
  /**
   * O MARTINETE: tres. Ele custa mais que um braco e menos que um extrator, e a razao e
   * historica — o martinete e movido a RODA D'AGUA, que da 4. Uma roda banca exatamente um
   * martinete e sobra 1, que e o custo de uma esteira levando o ferro embora. A primeira
   * automacao completa do jogo cabe numa roda so, e essa e a promessa que o numero faz.
   */
  tripHammer: 3,
} as const;

// O FORNO: quanto dura uma fornada. 4s e quase o dobro da bancada (2,28s) de proposito — reduzir
// minerio nao e montar uma peca, e uma reacao quimica que leva TEMPO, e o forno tem de ser o
// gargalo natural da linha do ferro. E ele nao consome energia: um bloomery e movido a fole, nao
// a eletricidade, e por isso e a unica maquina que se constroi antes de existir uma rede.
export const FURNACE_CYCLE_MS = 4000;

// O MARTINETE: uma pancada a cada 1,1s a plena carga, e TRES pancadas por esponja (a mesma conta
// da mao do heroi). Sao ~3,3s por barra contra os ~2,4s que o jogador leva martelando — a mesma
// lei do extrator: a maquina nao ganha por ser rapida, ganha por trabalhar sozinha.
export const TRIP_HAMMER_BLOW_MS = 1100;

// Quantas marteladas uma esponja aguenta antes de virar ferro. Vale para a mao do heroi E para o
// martinete: uma so contagem, ou o jogador aprende dois numeros para o mesmo gesto.
export const BLOOM_BLOWS = 3;

// A ESTEIRA: quanto tempo um item leva para atravessar um tile a plena carga. 900ms deixa a
// carga VISIVEL viajando (o olho acompanha um item saltando de tile em tile) e ainda assim
// quase tres vezes mais rapida que o braco robotico, que e a comparacao que importa: a esteira
// tem de ganhar do braco em linha reta, ou nao ha razao para existirem as duas.
export const BELT_STEP_MS = 900;

// O EXTRATOR: um bloco de minerio a cada 2.4s a plena carga. A picareta na mao faz o mesmo em
// ~2s (tres batidas na cadencia do A), entao UM extrator e mais lento que o heroi — de
// proposito. A maquina nao ganha por ser rapida; ela ganha por ser MUITA e por trabalhar
// enquanto o jogador esta numa dungeon do outro lado do mapa.
export const EXTRACTOR_CYCLE_MS = 2400;

// O BAU: quantas unidades cabem. 99 e o teto que nunca se encosta numa sessao normal — o bau
// existe para a producao NAO entupir, e um bau que enche viraria a mesma parede que ele veio
// resolver. Nao ha numero na tela: cheio ou vazio se le pelo ferrolho (ver chest.mjs).
export const CHEST_CAPACITY = 99;

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

// Light radii in tiles: the radius undead refuse to step into (they live only in the dark)
// and the mute ring for enemy graves. The safety ring stays slightly wider (+0.5) so danger
// begins right at the wall's edge, never while the player still reads as protected.
// 2026-08-06, a pedido do usuário: o raio caiu 30% (4.5 → 3.15) — o inimigo chega mais perto
// da fogueira, e o anel seguro encolheu junto para manter a margem. A luz VISÍVEL não lê
// daqui (é a luz 3D real, com falloff suave), então a parede menor não contradiz borda nenhuma.
export const LIGHT_RADIUS_TILES = 3.15;
export const CAMPFIRE_SAFE_RADIUS_TILES = 3.65;

/**
 * O CALOR — o anel logo FORA da parede de luz, onde o corpo que se encosta na fogueira ARDE
 * (ver EnemyBase.tickScorch). É a segunda metade da lei da luz: ela repele, e quem insiste em
 * ficar colado nela pega fogo e perde vida enquanto ficar ali.
 *
 * O número é geometria, não gosto: a parede acende em 3,15, então o corpo mais próximo que
 * consegue existir pisa em tiles a 3,16 (3,±1), 3,61 (3,±2), 4,0 (±4,0) e 4,24 (3,3) da lenha —
 * 4,35 pega exatamente essa primeira coroa de tiles pisáveis, e nada além dela. Um raio menor
 * que 3,15 seria letra morta (lá ninguém pisa) e um muito maior faria a fogueira cozinhar a
 * matilha de longe, sem que ela tivesse chegado perto de nada.
 */
export const CAMPFIRE_SCORCH_RADIUS_TILES = 4.35;

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
// implicit and unconditional, so it blocks even the lava boots (which wade every OTHER hazard).
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

// A SEMENTE anda em PACOTE: o punhado que a foice derruba (e o que um mundo autora) vale
// CINCO sementes na mochila — plantar gasta uma por canteiro, então um corte de mato rende
// uma fileira, não um buraco. O pacote VIAJA com o item no chão (ItemPickup.units, o mesmo
// contrato da carga da bateria): pousar põe o punhado inteiro num item só, e pegá-lo devolve
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
// O CABO entra pela mesma porta e pelo mesmo motivo do ferro: a bancada o produz aos quatro e
// uma rede se deita as duzias. Ele e a UNICA peca da fabrica que empilha — as maquinas nao, e
// isso e desenho: carregar seis caldeiras num slot faria construir uma fabrica parecer digitar
// uma lista, e nao percorrer o mundo atras de material.
export const UNIT_PACK_KINDS: ReadonlySet<string> = new Set([...SEED_PACK_KINDS, 'iron', 'wire', 'belt']);

// O PUNHADO COM QUE UMA PECA NASCE NO CHAO. Semente ja nascia aos cinco; cabo e esteira entraram
// pelo mesmo motivo e por um pedido direto: sao as duas pecas que se deitam em LINHA, e uma linha
// nao se faz de uma peca. Pegar uma unidade de cada vez transformaria "desenhar um caminho" numa
// tarefa de coleta — e o gesto que interessa e o de deitar, nao o de juntar.
//
// Isto vale so para o que NASCE no mundo (pickup autorado, drop sem contagem explicita). Um item
// que ja viajava com `units` mantem os dele: o punhado viaja, e essa lei nao muda.
const SPAWN_PACK: ReadonlyMap<string, number> = new Map([
  ...[...SEED_PACK_KINDS].map((k) => [k, SEEDS_PER_PACK] as const),
  ['wire', 5], ['belt', 5],
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

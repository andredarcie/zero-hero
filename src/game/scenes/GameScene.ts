import * as Engine from '@/game/engine';

import { CHUNK_COLUMNS, CHUNK_ROWS, MIN_BOARD_TILE_SIZE } from '@/game/constants';

import { profiler } from '@/game/debug/Profiler';

import { NpcManager } from '@/game/entities/NpcManager';
import { ItemManager } from '@/game/entities/ItemManager';
import type { HeldItemKind } from '@/game/entities/ItemPickup';



// O DEF de um prop (o registro de dados: tipo + tile + flags) contra o OBJETO de prop (a coisa
// viva com sprite e colisao) — dois tipos com o mesmo nome em modulos diferentes. Aqui os dois
// se encontram, porque o mundo infinito converte um no outro enquanto o heroi anda.

import { Billboard3D } from '@/game/render3d/Billboard3D';
import { World3D } from '@/game/render3d/World3D';


import { RELIEF_PEAK, reliefAt } from '@/game/world/relief';






import { createHeroView, type HeroView } from '@/game/runtime/HeroView';
import { Inventory } from '@/game/runtime/Inventory';
import { noteFound } from '@/game/runtime/notebook';

import { PlayerMovementController } from '@/game/runtime/PlayerMovementController';
import { WorldCamera } from '@/game/runtime/WorldCamera';

import { ChunkManager } from '@/game/world/ChunkManager';

import { adventureState, saveAdventure } from '@/game/runtime/adventureState';
import { RunArc } from '@/game/systems/RunArc';



import { HeldTorch } from './game/HeldTorch';
import { ToolSwing } from './game/ToolSwing';
import { DebrisFx } from './game/DebrisFx';
import { SparkleFx } from './game/SparkleFx';
import { WaterWork } from './game/WaterWork';
import { Crafting } from './game/Crafting';
import { CraftOrders } from './game/CraftOrders';
import { ForagingWork } from './game/ForagingWork';
import { ForgeWork } from './game/ForgeWork';
import { Machines } from './game/Machines';
import { GroundItems } from './game/GroundItems';
import { HandItems } from './game/HandItems';
import { ActionInput } from './game/ActionInput';
import { ActionVerbs } from './game/ActionVerbs';
import { ItemUse } from './game/ItemUse';
import { ItemUseGround } from './game/ItemUseGround';
import { BodyBumps } from './game/BodyBumps';
import { WorldQuery } from './game/WorldQuery';
import { Garden } from './game/Garden';
import { FireSpread } from './game/FireSpread';
import { QuestSetup } from './game/QuestSetup';
import { QuestMarks } from './game/QuestMarks';
import { Cinema } from './game/Cinema';
import { CampfireNight } from './game/CampfireNight';
import { SwordPlanting } from './game/SwordPlanting';
import { RoastEnding } from './game/RoastEnding';
import { GardenUnlock } from './game/GardenUnlock';
import { Intro } from './game/Intro';
import { NpcDialog } from './game/NpcDialog';
import { QuestDelivery } from './game/QuestDelivery';
import { DialogCamera } from './game/DialogCamera';
import { ValleyLife } from './game/ValleyLife';
import { SceneRender } from './game/SceneRender';
import { BackItem } from './game/BackItem';
import { Footprints } from './game/Footprints';
import { CampLife } from './game/CampLife';
import { RunBoot } from './game/RunBoot';
import { WorldBoot } from './game/WorldBoot';
import { RunSave } from './game/RunSave';
import { DebugApi } from './game/DebugApi';
import { SceneTeardown } from './game/SceneTeardown';
import { PauseControl } from './game/PauseControl';
import { FrameTick } from './game/FrameTick';
import { PropLists } from './game/PropLists';
import { ValleySet } from './game/ValleySet';
import { GAME_SCENE_KEY } from './game/sceneDefs';
export { GAME_SCENE_KEY } from './game/sceneDefs';

export class GameScene extends Engine.Scene {
  public static readonly key = GAME_SCENE_KEY;

  public camera?: WorldCamera;
  public chunkManager?: ChunkManager;
  public npcManager?: NpcManager;
  public itemManager?: ItemManager;
  /**
   * AS COSTAS. O herói carrega UMA coisa de cada vez nas costas, e guarda sem mostrar toda ferramenta que
   * ganhou (ver Inventory). Pegar outro material pede largar o da mão (`takeIntoHand`), e o Z é a mão —
   * pega, troca e pousa no tile da frente (`handAt`).
   *
   * `heldItem` continua querendo dizer o que sempre quis: o que está na mão AGORA. Toda fechadura
   * do mundo pergunta isso, e a resposta é uma só.
   */
  public readonly inventory = new Inventory(noteFound);
  public get heldItem(): 'none' | HeldItemKind {
    return this.inventory.selected;
  }

  /**
   * Escrever em `heldItem` e a porta de AUTORIA (debug e playtest): "ponha isto na mochila e
   * deixe na mao". Ela existe porque os cenarios montam o estado assim desde sempre
   * (`__scene.heldItem = 'pickaxe'`), e trocar isso por um metodo novo faria toda a suite mentir
   * sobre o que ela testa. `'none'` significa MAOS VAZIAS: solta a selecao sem esvaziar a
   * mochila — que e exatamente o que uma assercao de "bare-handed" quer dizer.
   */
  private set heldItem(kind: 'none' | HeldItemKind) {
    // A porta de AUTORIA (debug e playtest) troca o que está nas costas sem pôr nada no mundo, e
    // sem mexer nas ferramentas guardadas. `'sword'` vira mão vazia: a espada não é item.
    this.inventory.takeAll();
    if (kind !== 'none' && kind !== 'sword') this.inventory.add(kind);
    this.carry.updateBackItem();
  }

  // `seenItems` tracks which kinds have had their one-time "item get" ceremony, so re-picking a
  // dropped item just flies it onto the hero's back.
  public readonly seenItems = new Set<HeldItemKind>();
  // The hero has no 2D GameObject in the world: he is plain state (tweened like any
  // object) drawn by the 3D billboard alone. See HeroView.
  public readonly hero: HeroView = createHeroView();
  public movementController?: PlayerMovementController;
  public playerWorld = { worldX: 0, worldY: 0 };
  public tileSize = MIN_BOARD_TILE_SIZE;
  /**
   * O tile no zoom de 100%: o tamanho que a INTERFACE presa ao mundo (o balão de ação, o pensamento, o "!" dos
   * vizinhos) usa, para o zoom do jogador mexer só na câmera (pedido do autor). O lugar dela segue o `tileSize`.
   */
  public uiTileSize = MIN_BOARD_TILE_SIZE;
  // Dialog variants the player already heard this run (kind:base / kind:locked / wizard:beat).
  // An NPC whose *current* variant isn't here yet shows a "!" marker above its head.
  public readonly seenDialogKeys = new Set<string>();
  // True quando esta cena e a AVENTURA (overworld ou uma dungeon dela) — o unico modo com
  // memoria persistente (adventureState). Explorador e levels nunca ligam isto.
  public adventure = false;
  public cutsceneActive = false;
  // A JORNADA: da abertura ao fim, os marcos da partida num lugar só (ver systems/RunArc). O boot a liga ao save
  // da aventura, ou à memória no playtest do editor.
  public readonly arc = new RunArc();
  // Center chunk of the streamed window; NaN forces the first stream.
  public streamCenter = { cx: NaN, cy: NaN };



  // The real HD-2D: the whole world renders in true 3D (render3d/World3D.ts) on a
  // canvas UNDER this transparent 2D one. The 2D engine keeps logic, input, canvas UI
  // and screen-space FX; the hero's hidden 2D sprite (all the movement/juice
  // code still drives it) is mirrored onto a 3D billboard every frame.
  public world3d?: World3D;
  public heroBillboard?: Billboard3D;

  /** As peças do mapa, por tipo. (ver PropLists) */
  public readonly props = new PropLists();

  /** As atrações do vale. (ver ValleySet) */
  public readonly valley = new ValleySet();

  public constructor() {
    super(GameScene.key);
  }

  public create(): void {
    // A ORDEM É A DO MUNDO: a partida (o save, o começo, o renderizador), o que ela lembra, a gente, o herói, as peças
    // do mapa, a vida do vale, e o fecho (shaders, entrada, a abertura).
    const { startWorldX, startWorldY, skipIntro } = this.boot.prepareRun();
    this.boot.loadSavedRun(skipIntro);
    this.boot.spawnPeople(startWorldX, startWorldY);
    this.boot.spawnHero(startWorldX, startWorldY);
    this.worldBoot.spawnProps(startWorldX, startWorldY);
    this.worldBoot.spawnValley();
    this.worldBoot.finishBoot(skipIntro);
  }

  // ── the 3D frame ─────────────────────────────────────────────────────────────
  // Runs on POST_UPDATE so it sees this frame's final state (movement tweens
  // included) and keeps running even when update() early-returns (dialog pan,
  // cut-scenes). Freezes with the scene on pause — a still backdrop for the menu.

  /** O tile que a câmera olha sem o herói sair do lugar: é o que se vê pela lente da Thea. */
  public cameraLook?: { x: number; y: number };
  /** De 0 (no herói) a 1 (no `cameraLook`): a câmera vai e volta deslizando. */
  public cameraLookBlend = 0;
  /** O graveto aceso na mão: acender, reabastecer, apagar, a chama. (ver HeldTorch) */
  public readonly torch: HeldTorch = new HeldTorch(this);
  /** O balanço do que está na mão: espada, machado, picareta. (ver ToolSwing) */
  public readonly swing: ToolSwing = new ToolSwing(this);
  /** Os estilhaços: pedra, terra, lascas, fumaça, onda de choque. (ver DebrisFx) */
  public readonly debris: DebrisFx = new DebrisFx(this);
  /** Os brilhos: faísca, reflexo, poeira que sobe, corações. (ver SparkleFx) */
  public readonly sparkle: SparkleFx = new SparkleFx(this);
  /** O balde, a comporta e a árvore que cai sobre o rio. (ver WaterWork) */
  public readonly water: WaterWork = new WaterWork(this);
  /** A bancada: o menu, o estoque em volta, a peça pronta. (ver Crafting) */
  public readonly craft: Crafting = new Crafting(this);
  /** A encomenda na caixa de ferramentas e a peça pronta que salta. (ver CraftOrders) */
  public readonly orders: CraftOrders = new CraftOrders(this);
  /** A colheita de cogumelos: faca, cesto, o aceno do Shui. (ver ForagingWork) */
  public readonly forage: ForagingWork = new ForagingWork(this);
  /** A forja: altar, martelo, forno. (ver ForgeWork) */
  public readonly forge: ForgeWork = new ForgeWork(this);
  /** As estações que o jogador põe e recolhe. (ver Machines) */
  public readonly machines: Machines = new Machines(this);
  /** As coisas no chão: onde pousam, o que sai de árvore e pedra. (ver GroundItems) */
  public readonly groundItems: GroundItems = new GroundItems(this);
  /** O que a mão pega e pousa. (ver HandItems) */
  public readonly hand: HandItems = new HandItems(this);
  /** Os botões A e B e a dica dos controles. (ver ActionInput) */
  public readonly actions: ActionInput = new ActionInput(this);
  /** O que cada botão faria agora, e o tile à frente. (ver ActionVerbs) */
  public readonly verbs: ActionVerbs = new ActionVerbs(this);
  /** A tabela de itens: fogo, água, mato. (ver ItemUse) */
  public readonly use: ItemUse = new ItemUse(this);
  /** A tabela de itens: pedra, plantas, portas, chão. (ver ItemUseGround) */
  public readonly useGround: ItemUseGround = new ItemUseGround(this);
  /** O esbarrão: gestos de corpo e o pensamento do que falta. (ver BodyBumps) */
  public readonly bumps: BodyBumps = new BodyBumps(this);
  /** As perguntas ao mapa: que peça está aqui, é sólido, é água. (ver WorldQuery) */
  public readonly query: WorldQuery = new WorldQuery(this);
  /** O canteiro: cavar, regar, brotar. (ver Garden) */
  public readonly garden: Garden = new Garden(this);
  /** O fogo que se espalha e as fogueiras do vale. (ver FireSpread) */
  public readonly fire: FireSpread = new FireSpread(this);
  /** As quests montadas: Marco, Thea, Sisi. (ver QuestSetup) */
  public readonly questSetup: QuestSetup = new QuestSetup(this);
  /** As marcas no mapa e a despedida da estrela. (ver QuestMarks) */
  public readonly marks: QuestMarks = new QuestMarks(this);
  /** Os recursos de cena: tarjas, dolly, vinheta, esperar, créditos. (ver Cinema) */
  public readonly cinema: Cinema = new Cinema(this);
  /** A noite na fogueira. (ver CampfireNight) */
  public readonly campfireNight: CampfireNight = new CampfireNight(this);
  /** A espada fincada. (ver SwordPlanting) */
  public readonly swordPlanting: SwordPlanting = new SwordPlanting(this);
  /** O fim: a fogueira do jardim e o marshmallow. (ver RoastEnding) */
  public readonly roastEnding: RoastEnding = new RoastEnding(this);
  /** A chave do jardim, o portão e a névoa que sai. (ver GardenUnlock) */
  public readonly gardenUnlock: GardenUnlock = new GardenUnlock(this);
  /** A abertura: o mago na estrada. (ver Intro) */
  public readonly intro: Intro = new Intro(this);
  /** A conversa com os vizinhos. (ver NpcDialog) */
  public readonly dialog: NpcDialog = new NpcDialog(this);
  /** A entrega: o que se dá, o presente, a festa do pedido cumprido. (ver QuestDelivery) */
  public readonly delivery: QuestDelivery = new QuestDelivery(this);
  /** A câmera que abre espaço para o diálogo. (ver DialogCamera) */
  public readonly dialogCam: DialogCamera = new DialogCamera(this);
  /** A vida do vale a cada quadro: bichos, som, clima. (ver ValleyLife) */
  public readonly life: ValleyLife = new ValleyLife(this);
  /** O desenho: o mundo 3D e o herói em cada quadro. (ver SceneRender) */
  public readonly view: SceneRender = new SceneRender(this);
  /** O item nas costas. (ver BackItem) */
  public readonly carry: BackItem = new BackItem(this);
  /** As pegadas e a respiração do herói parado. (ver Footprints) */
  public readonly steps: Footprints = new Footprints(this);
  /** O acampamento, o descanso e a visita. (ver CampLife) */
  public readonly camp: CampLife = new CampLife(this);
  /** O começo da partida: save, mundo 3D, gente, herói. (ver RunBoot) */
  public readonly boot: RunBoot = new RunBoot(this);
  /** O mapa montado: peças, vida do vale, fecho. (ver WorldBoot) */
  public readonly worldBoot: WorldBoot = new WorldBoot(this);
  /** Guardar a aventura. (ver RunSave) */
  public readonly save: RunSave = new RunSave(this);
  /** A superfície de controle do playtest e a volta ao editor. (ver DebugApi) */
  public readonly debug: DebugApi = new DebugApi(this);
  /** O desmonte da cena no restart. (ver SceneTeardown) */
  public readonly teardown: SceneTeardown = new SceneTeardown(this);
  /** O menu de pausa. (ver PauseControl) */
  public readonly pause: PauseControl = new PauseControl(this);
  /** O quadro: tudo que anda a cada tick. (ver FrameTick) */
  public readonly frame: FrameTick = new FrameTick(this);

  public update(time: number, delta: number): void {
    profiler.begin('update');
    this.frame.tick(time, delta);
    profiler.end('update');
  }

  // ── A COMPANHIA ─────────────────────────────────────────────────────────────

  // Stream content for the 3x3 chunk window around the player, loading/unloading as the
  // hero roams the open world.
  public streamChunks(force = false): void {
    const pcx = Math.floor(this.playerWorld.worldX / CHUNK_COLUMNS);
    const pcy = Math.floor(this.playerWorld.worldY / CHUNK_ROWS);
    if (!force && pcx === this.streamCenter.cx && pcy === this.streamCenter.cy) return;
    this.streamCenter = { cx: pcx, cy: pcy };

    const active = new Set<string>();
    const radius = 1;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        active.add(`${pcx + dx},${pcy + dy}`);
      }
    }

    this.npcManager?.syncChunks(active);
    // Held items (sword/key) are loaded once and never streamed — see ItemManager.
  }

  // ── OS DOIS BOTOES ─────────────────────────────────────────────────────────

  // ── Walk-on ─────────────────────────────────────────────────────────────────
  /**
   * Um tile ENTRADO (uma vez por passo, nunca por frame). `_dx`/`_dy` são a direção do passo que
   * trouxe o herói até aqui — zero quando alguém chamou isto de fora do andar (o debug).
   */
  public handleTileEntered(wx: number, wy: number, _dx = 0, _dy = 0): void {
    // O CUME DO JARDIM ALTO, pela primeira vez: o vento leva a névoa.
    if (this.valley.gardenMist && !this.cutsceneActive && reliefAt(wx, wy) === RELIEF_PEAK) void this.gardenUnlock.playMistClearing();
    // O fog of war do mapa: o chunk pisado entra no save (176 chaves no maximo, um evento raro).
    if (this.adventure) {
      const chunkKey = `${Math.floor(wx / CHUNK_COLUMNS)},${Math.floor(wy / CHUNK_ROWS)}`;
      const st = adventureState();
      if (!st.visitedChunks.has(chunkKey)) {
        st.visitedChunks.add(chunkKey);
        this.delivery.questEvent({ type: 'explore' });
        saveAdventure();
      }
    }
    // Depositar itens usa o botao B contra o tile a frente (ver pressUse/placeItemAt).
  }

  // ── The farming loop (plantSpot) ────────────────────────────────────────────
  // Seeds (the scythe's product) planted in a hole + a bucket of water = REAL tall grass, a
  // little later and with a sprout animation. From then on it is grass like any other — blocks,
  // conducts fire, falls to the scythe (yielding seeds again). When that grass is consumed, the
  // hole reopens (see updatePlantSpots): the loop is renewable by design — placeable fuel the
  // player GROWS, so a burnt fuse is never a dead end.

  // ── O congelamento (ver FreezeManager, onde mora a lei) ─────────────────────

  // ── A HISTORIA: a chegada, os vizinhos, o jardim e a fogueira ─────────────────
  //
  // O jogo inteiro e um arco so, e ele mora aqui:
  //
  //   1. A ABERTURA (playIntro): o cavaleiro chega pela estrada do sul com a espada nas costas,
  //      para e a finca no chao. Silencio, vaga-lumes. O mago se aproxima e diz o que ninguem
  //      disse a ele ainda: acabou, e agora e preciso achar um sentido alem disso.
  //   2. OS VIZINHOS (dialogs/NpcQuests): quatro pedidos pequenos, cada um com o presente que o
  //      torna possivel. Nada se perde, nada tem prazo.
  //   3. O PORTAO (openGardenGate): quando o ultimo pedido fecha, o jardim do centro do vale abre.
  //   4. A FOGUEIRA (tendHearthAt / playRoastEnding): o heroi acende o fogo, espeta um cogumelo
  //      num graveto e fica ali, assando, enquanto a brisa passa. Fim, e os creditos.

  // ── AS MISSÕES DOS NPCs ────────────────────────────────────────────────────
  // O sistema inteiro (ver dialogs/NpcQuests + runtime/QuestLog) toca a cena em três lugares e
  // em mais nenhum: o FUNIL abaixo, que conta o que aconteceu no mundo; a ENTREGA, que é o
  // gesto de falar com quem pediu; e a ESCOLHA DE ROTEIRO, que é o único efeito visível de tudo
  // isto — o NPC dizendo outra coisa. Não há tela de missão, de propósito.

}

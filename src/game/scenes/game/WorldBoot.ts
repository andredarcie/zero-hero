// O MAPA MONTADO (o resto do create): as peças do world.json, a vida do vale e as quests, e o fecho — shaders, a
// pausa ou a volta ao editor, os balões, a abertura.

import * as Engine from '@/game/engine';
import { isLifeHome } from '@/game/world/biomeLife';
import { CHUNK_COLUMNS, CHUNK_ROWS } from '@/game/constants';
import type { AppMode } from '@/game/config';
import { initProfiler, profiler } from '@/game/debug/Profiler';
import { isNightTime } from '@/game/runtime/timeOfDay';
import { ValleyWeather } from '@/game/entities/ValleyWeather';
import { CampfireObject } from '@/game/objects/CampfireObject';
import { DryBushObject } from '@/game/objects/DryBushObject';
import { DryTreeObject } from '@/game/objects/DryTreeObject';
import { DryShrubObject } from '@/game/objects/DryShrubObject';
import { lavaLightScales, LavaObject } from '@/game/objects/LavaObject';
import { WaterObject } from '@/game/objects/WaterObject';
import { LockedDoorObject } from '@/game/objects/LockedDoorObject';
import { SwingGateObject } from '@/game/objects/SwingGateObject';
import { RockObject } from '@/game/objects/RockObject';
import { TallGrassObject } from '@/game/objects/TallGrassObject';
import { PlantSpotObject } from '@/game/objects/PlantSpotObject';
import { ToolboxObject } from '@/game/objects/ToolboxObject';
import { MoonflowerObject } from '@/game/objects/MoonflowerObject';
import { FurnaceObject } from '@/game/objects/FurnaceObject';
import { AltarObject } from '@/game/objects/AltarObject';
import { MARSHMALLOW_BAG_TEXTURE } from '@/game/render3d/cozyTextures';
import { ActionPrompt } from '@/game/runtime/ActionPrompt';
import { HeroThought } from '@/game/runtime/HeroThought';
import { PlacementHints } from '@/game/runtime/PlacementHints';
import { PauseTouchButton, isTouchDevice } from '@/game/runtime/PauseMenu';
import { OldRoad } from '@/game/objects/OldRoad';
import { Trails } from '@/game/objects/Trails';
import { GardenMist } from '@/game/objects/GardenMist';
import { BigTrees } from '@/game/objects/BigTrees';
import { WoodFence } from '@/game/objects/WoodFence';
import { LumberYard } from '@/game/objects/LumberYard';
import { OldForge } from '@/game/objects/OldForge';
import { CrashSite } from '@/game/objects/CrashSite';
import { BirdLife } from '@/game/objects/BirdLife';
import { KoiPond } from '@/game/objects/KoiPond';
import { NatureLife } from '@/game/objects/nature/NatureLife';
import { Waterfall } from '@/game/objects/Waterfall';
import { HeroCamp } from '@/game/objects/HeroCamp';
import { FpsCounter } from '@/game/runtime/FpsCounter';
import { getCampfires, getDryBushes, getDryTrees, getDryShrubs, getLavaTiles, getWaterTiles, getBridgeSpots, getPlantSpots, getToolboxes, getIronRocks, getCoalRocks, getFurnaces, getAltars, getMoonflowers, getLockedDoors, getSwingGates, getRocks, getTallGrass, getPlayerStart, getHearths, getGardenGates } from '@/game/world/WorldData';
import { adventureState } from '@/game/runtime/adventureState';
import { allQuestsDone, isQuestDone } from '@/game/runtime/QuestLog';
import { NPC_QUESTS, questFor } from '@/game/dialogs/NpcQuests';
import { NpcHomes } from '@/game/objects/NpcHomes';
import { ValleyFinds } from '@/game/objects/ValleyFinds';
import type { GameScene } from '../GameScene';
import { INTRO_WALK_TILES } from './sceneDefs';

/** O que WorldBoot usa de GameScene (e a cena do motor, que ele passa a quem monta objetos do mundo). */
export type WorldBootHost = Engine.Scene & Pick<GameScene,
  'actions' | 'adventure' | 'arc' | 'bumps' | 'camp' | 'chunkManager' | 'cinema' | 'cutsceneActive' | 'debug'
  | 'events' | 'fire' | 'forage' | 'forge' | 'game' | 'gardenUnlock' | 'groundItems' | 'input' | 'intro'
  | 'machines' | 'marks' | 'pause' | 'playerWorld' | 'props' | 'query' | 'questSetup' | 'registry' | 'sparkle'
  | 'streamChunks' | 'swordPlanting' | 'time' | 'valley' | 'verbs' | 'view' | 'world3d'
>;

export class WorldBoot {
  public constructor(private readonly host: WorldBootHost) {}

  /** As peças do mapa (world.json): fogueiras, portões, arbustos, pedras, água, lava, estações. */
  public spawnProps(startWorldX: number, startWorldY: number): void {
    // All world props are authored in world.json; their collision is resolved at runtime.
    const campfireDefs = getCampfires();
    // A tela em que se nasce ja conta como pisada — o mapa nunca abre 100% escuro.
    if (this.host.adventure) {
      adventureState().visitedChunks.add(
        `${Math.floor(startWorldX / CHUNK_COLUMNS)},${Math.floor(startWorldY / CHUNK_ROWS)}`,
      );
    }
    this.host.props.campfiresFollowNight = isNightTime();
    this.host.props.campfires = campfireDefs.map((c) => new CampfireObject(
      this.host, c.worldX, c.worldY, this.host.props.campfiresFollowNight,
    ));
    // A FOGUEIRA DO FIM nao segue o relogio: ela nasce apagada e so o heroi a acende, dentro do
    // jardim. Ela mora na MESMA classe das outras fogueiras (arte, luz, fumaca), so que fora da
    // lista que o dia acende e apaga sozinho.
    this.host.props.hearths = getHearths().map((h) => new CampfireObject(this.host, h.worldX, h.worldY, this.host.arc.has('hearth')));
    // O PACOTE DE MARSHMALLOW mora no canto do tile da fogueira do fim (dentro dele: nenhum sprite
    // vaza do seu tile). É dele que sai o que vai ao espeto — o herói só traz o graveto.
    for (const h of getHearths()) {
      this.host.world3d?.objects.addBillboard(MARSHMALLOW_BAG_TEXTURE, 0)
        .setPosition(h.worldX + 0.28, h.worldY + 0.28)
        .setDisplaySize(0.42, 0.42);
    }
    // O PORTAO DO JARDIM e a porta trancada sem chave: quem a abre e o ultimo pedido fechado.
    this.host.props.gardenGates = getGardenGates().map((g) => {
      const gate = new LockedDoorObject(this.host, g.worldX, g.worldY, false, true);
      if (this.host.arc.has('gate')) gate.setOpenInstantly();
      return gate;
    });
    this.host.props.dryBushes = getDryBushes().map((b) => new DryBushObject(this.host, b.worldX, b.worldY));
    this.host.props.lockedDoors = getLockedDoors().map((d) => new LockedDoorObject(this.host, d.worldX, d.worldY, d.floodgate === true));
    this.host.props.swingGates = getSwingGates().map((g) => new SwingGateObject(this.host, g.worldX, g.worldY));
    this.host.props.dryTrees = getDryTrees().map((t) => new DryTreeObject(this.host, t.worldX, t.worldY));
    this.host.props.dryShrubs = getDryShrubs().map((s) => new DryShrubObject(this.host, s.worldX, s.worldY));
    // As duas pedras vivem no MESMO array de proposito: colisao, picareta e o registro de props ja
    // atravessam `rocks`, e a unica coisa que a de minerio muda e a arte e o que ela deixa cair.
    this.host.props.rocks = [
      ...getRocks().map((r) => new RockObject(this.host, r.worldX, r.worldY)),
      ...getIronRocks().map((r) => new RockObject(this.host, r.worldX, r.worldY, 'ore')),
      ...getCoalRocks().map((r) => new RockObject(this.host, r.worldX, r.worldY, 'coal')),
    ];
    this.host.props.tallGrasses = getTallGrass().map((g) => new TallGrassObject(this.host, g.worldX, g.worldY));
    this.host.props.moonflowers = getMoonflowers().map((m) => new MoonflowerObject(this.host, m.worldX, m.worldY));
    this.host.props.plantSpots = getPlantSpots().map((s) => new PlantSpotObject(this.host, s.worldX, s.worldY));
    // Os buracos que a PÁ cavou voltam do save (diff sobre os autorados).
    if (this.host.adventure) {
      for (const key of adventureState().dugSpots) {
        const [wx, wy] = key.split(',').map(Number);
        if (!Number.isFinite(wx) || !Number.isFinite(wy)) continue;
        if (this.host.props.plantSpots.some((s) => s.worldX === wx && s.worldY === wy)) continue;
        // Um mundo re-autorado pode ter posto parede onde havia terra: o save cede ao mundo.
        if (this.host.chunkManager?.isCellBlocked(wx, wy)) continue;
        this.host.props.plantSpots.push(new PlantSpotObject(this.host, wx, wy));
      }
    }
    // Mesma regra de default de toda peca direcional (`dir ?? 1`): um JSON antigo nunca vira um
    // prop quebrado, e leste e a direcao que o editor oferece primeiro.
    this.host.props.toolboxes = getToolboxes().map(
      (t) => new ToolboxObject(this.host, t.worldX, t.worldY, t.dir ?? 1),
    );
    this.host.props.furnaces = getFurnaces().map(
      (f) => new FurnaceObject(this.host, f.worldX, f.worldY, f.dir ?? 1),
    );
    this.host.props.altars = getAltars().map((a) => new AltarObject(this.host, a.worldX, a.worldY));
    // O que o jogador construiu volta do save AQUI — depois dos autorados, para que uma peca
    // autorada num tile sempre ganhe do diff (o save cede ao mundo).
    this.host.machines.restoreBuiltMachines();
    // Both `water` and `bridgeSpot` are river tiles (WaterObjects render animated water). A
    // plain `water` tile is an impassable river; a `bridgeSpot` is a river tile you CAN bridge.
    this.host.props.waterTiles = [
      ...getWaterTiles().map((w) => new WaterObject(this.host, w.worldX, w.worldY, false)),
      ...getBridgeSpots().map((b) => {
        const w = new WaterObject(this.host, b.worldX, b.worldY, true);
        // A scene-level burst of pale light the moment the last board is nailed home.
        w.onBuilt = () => this.host.sparkle.softWash(0xd2be96, 0.16, 700);
        return w;
      }),
    ];
    // A lava só existe em volta de um cogumelo (o do cantarelo): é a trava da pedra.
    const lava = getLavaTiles();
    const lavaLight = lavaLightScales(lava);
    this.host.props.lavaTiles = lava.map((l, i) => new LavaObject(this.host, l.worldX, l.worldY, lavaLight[i]));
    this.host.props.propRegistry = [
      { list: this.host.props.campfires },
      { list: this.host.props.hearths },
      { list: this.host.props.gardenGates },
      { list: this.host.props.dryBushes },
      { list: this.host.props.lockedDoors },
      { list: this.host.props.swingGates },
      { list: this.host.props.dryTrees },
      { list: this.host.props.dryShrubs },
      { list: this.host.props.rocks },
      { list: this.host.props.tallGrasses },
      { list: this.host.props.moonflowers },
      { list: this.host.props.plantSpots },
      { list: this.host.props.toolboxes },
      { list: this.host.props.furnaces },
      { list: this.host.props.altars },
      // A agua continua no registro como hazard: o heroi so passa depois que o tile deixou de
      // bloquear (uma ponte).
      { list: this.host.props.waterTiles, hazard: true },
      { list: this.host.props.lavaTiles, hazard: true },
    ];
    // A ESPADA FINCADA. Ela e o primeiro gesto da historia e fica onde o heroi a deixou, para
    // sempre: na abertura ela desce das costas para o chao (playIntro); quem continua uma partida
    // a encontra ja de pe ali.
    if (this.host.arc.has('intro') && this.host.adventure) {
      const ps = getPlayerStart();
      this.host.swordPlanting.plantSwordAt(ps.worldX, ps.worldY - INTRO_WALK_TILES + 1);
      this.host.cinema.crackGroundAt(ps.worldX, ps.worldY - INTRO_WALK_TILES + 1, false);
    }

  }

  /** A vida do vale (só na aventura): o acampamento, o gato, a natureza, o clima, e as quests. */
  public spawnValley(): void {
    this.host.fire.keptLitFires.clear();
    if (this.host.adventure) {
      this.host.valley.valleyFinds = new ValleyFinds();
      this.host.valley.heroCamp = new HeroCamp(this.host, (quest) => {
        const q = questFor(quest);
        return q !== undefined && isQuestDone(q);
      });
      this.host.camp.catCare.build();
      this.host.valley.waterfall = new Waterfall(this.host);
      this.host.valley.koiPond = new KoiPond(this.host, () => ({ x: this.host.playerWorld.worldX, y: this.host.playerWorld.worldY }));
      this.host.valley.bigTrees = new BigTrees(this.host);
      this.host.valley.woodFence = new WoodFence();
      this.host.valley.lumberYard = new LumberYard();
      this.host.valley.oldForge = new OldForge();
      this.host.valley.crashSite = new CrashSite(this.host);
      this.host.valley.birdLife = new BirdLife(this.host, {
        heroAt: () => ({ x: this.host.playerWorld.worldX, y: this.host.playerWorld.worldY }),
        // Os passarinhos moram na mata (world/biomeLife): só pousam lá.
        canLand: (x, y) => isLifeHome('birds', x, y) && !this.host.query.isSolidForEntities(x, y) && !this.host.query.isOpenWaterAt(x, y),
        rain: () => this.host.valley.weather?.rain ?? 0,
      });
      this.host.valley.nature = new NatureLife(this.host, {
        hero: () => this.host.verbs.heroVisualTile(),
        isWater: (x, y) => this.host.query.isOpenWaterAt(x, y),
        isFree: (x, y) => this.host.query.isNatureFree(x, y),
        isTileTree: (x, y) => this.host.query.isLiveTileTree(x, y),
        rain: () => this.host.valley.weather?.rain ?? 0,
        busy: () => this.host.cutsceneActive,
      });
      // Um jogo fechado entre o último pedido e a entrega da chave: ela chega agora.
      if (allQuestsDone() && !this.host.arc.has('gardenKey')) this.host.time.delayedCall(900, () => this.host.gardenUnlock.giveGardenKey(undefined));
      this.host.valley.oldRoad = new OldRoad();
      this.host.valley.trails = new Trails();
      const garden = getHearths()[0];
      if (garden && !this.host.arc.has('mist')) this.host.valley.gardenMist = new GardenMist(this.host, { x: garden.worldX, y: garden.worldY });
      this.host.forage.mushroomKin = this.host.forage.makeMushroomKin();
      this.host.groundItems.enforceNpcFrontRule();
      this.host.groundItems.freeTrappedItems();
      this.host.valley.weather = new ValleyWeather(this.host.world3d!, (x, y) => this.host.query.isOpenWaterAt(x, y));
      this.host.valley.shownSeason = this.host.valley.weather.season;
    }
    this.host.questSetup.buildPainterQuest();
    this.host.questSetup.buildLumberQuest();
    this.host.questSetup.buildAstronomerQuest();
    if (this.host.adventure) this.host.valley.npcHomes = new NpcHomes();
    this.host.marks.buildQuestMarks();
    this.host.streamChunks(true);

  }

  /** O fecho: shaders aquecidos, o profiler, a pausa ou a volta ao editor, os balões, e a abertura. */
  public finishBoot(skipIntro: boolean): void {
    // The world is fully built, so compile every shader now rather than lazily, one hitch at
    // a time, on the frames each material is first drawn.
    this.host.world3d!.prewarm.prewarmShaders();
    initProfiler(this.host.world3d!);
    this.host.events.on(Engine.Scenes.Events.PRE_UPDATE, profiler.frameStart, profiler);
    // O quadro so termina depois do desenho do motor 2D (a UI 2D por cima do 3D): fechado no
    // render3D, o profiler deixava a camada 2D inteira fora da conta.
    this.host.game.events.on(Engine.Core.Events.PRE_RENDER, this.host.view.handlePreRender, this.host.view);
    this.host.game.events.on(Engine.Core.Events.POST_RENDER, this.host.view.handlePostRender, this.host.view);
    this.host.game.events.on(Engine.Core.Events.VISIBLE, this.host.view.handleVisible, this.host.view);
    if (FpsCounter.wanted()) this.host.view.fpsCounter = new FpsCounter();

    this.host.debug.registerDebugApi();

    // Live playtest launched from the world editor: ESC stops the run and wakes the
    // sleeping EditorScene, with the in-memory (possibly unsaved) world still loaded.
    // In the real game ESC pauses instead (plus a discreet touch button on mobile).
    if ((this.host.registry.get('appMode') as AppMode | undefined) === 'editor') {
      this.host.debug.enableEditorReturn();
    } else {
      // O ESC TEM UM DONO SÓ: a pausa (sentado na fogueira, ele só levanta).
      this.host.input.keyboard?.on('keydown-ESC', () => {
        // Sentado na fogueira, o ESC so levanta: ele levantava E abria a pausa no mesmo toque. Dormindo, o ESC pausa
        // (o sono continua depois): levantar da cama e da manha.
        if (this.host.camp.rest.canGetUp) { this.host.camp.rest.getUp(); return; }
        this.host.pause.openPauseMenu();
      });
      if (isTouchDevice()) {
        this.host.pause.pauseTouchButton = new PauseTouchButton(() => this.host.pause.openPauseMenu());
      }
    }

    this.host.machines.placementHints = new PlacementHints();
    this.host.bumps.heroThought = new HeroThought(this.host);
    this.host.forge.furnaceAsk = new HeroThought(this.host);
    this.host.verbs.actionPrompt = new ActionPrompt(this.host, isTouchDevice());
    this.host.actions.installActionInput();

    // O GATO de quem ja fez algum favor volta junto com a partida.
    if (Object.values(NPC_QUESTS).some(isQuestDone)) this.host.camp.catCare.ensure(false);

    // A ABERTURA: a primeira vez no vale e uma cena, nao um controle. Ela toca uma vez por partida
    // (o save lembra), e continuar uma partida pula direto para o heroi parado na estrada.
    if (!this.host.arc.has('intro')) void this.host.intro.playIntro();
    else if (this.host.intro.openingTalk) void this.host.intro.playOpeningTalk();
    else if (skipIntro) this.host.actions.showControlsHint();
  }
}

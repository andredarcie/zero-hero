// O COMEÇO DA PARTIDA (os primeiros passos do create): aventura ou playtest, o save, o mundo 3D e as texturas, a gente
// do vale, os itens no chão, a câmera e o herói.

import * as Engine from '@/game/engine';
import { ASSET_KEYS, HERO_FRAMES, SCENE_DEPTHS, UNIT_PACK_KINDS } from '@/game/constants';
import { isToolKind } from '@/game/runtime/Inventory';
import { getDay, getTimeOfDay, setDay, setTimeOfDay } from '@/game/runtime/timeOfDay';
import { NpcManager } from '@/game/entities/NpcManager';
import { ItemManager } from '@/game/entities/ItemManager';
import type { HeldItemKind } from '@/game/entities/ItemPickup';
import { SwordSlash } from '@/game/runtime/SwordOrbit';
import { setCurrentWorld3D, World3D } from '@/game/render3d/World3D';
import { registerBucketTextures } from '@/game/render3d/bucketTexture';
import { registerCharcoalTexture } from '@/game/render3d/charcoalTexture';
import { registerFungiTextures } from '@/game/fungi/fungi';
import { canStep, terrainHeightAt } from '@/game/world/relief';
import { registerPlacementTextures } from '@/game/render3d/placementTexture';
import { OccludedSilhouette } from '@/game/render3d/OccludedSilhouette';
import { registerCozyTextures } from '@/game/render3d/cozyTextures';
import { resetHeroView } from '@/game/runtime/HeroView';
import { registerSkyTextures } from '@/game/render3d/skyTextures';
import { registerWoodTextures } from '@/game/render3d/woodTextures';
import { registerPaintTextures } from '@/game/render3d/paintTextures';
import { PlayerMovementController } from '@/game/runtime/PlayerMovementController';
import { WorldCamera } from '@/game/runtime/WorldCamera';
import { getSoundManager } from '@/game/audio/SoundManager';
import { ChunkManager } from '@/game/world/ChunkManager';
import type { ScreenContent } from '@/game/world/ScreenContent';
import { getChunkContent, getHeldItemPickups, getPlayerStart } from '@/game/world/WorldData';
import { adventureState, consumeAdventureRespawn, saveAdventure } from '@/game/runtime/adventureState';
import { adventureArcStore, memoryArcStore } from '@/game/systems/RunArc';
import { clearHomeYards } from '@/game/objects/NpcHomes';
import { registerHomeTextures } from '@/game/render3d/homeTextures';
import { registerFindTextures } from '@/game/objects/ValleyFinds';
import type { GameScene } from '../GameScene';
import { INTRO_WALK_TILES, OPENING_TALK_KEY } from './sceneDefs';

/**
 * NO LOCALHOST A ABERTURA NAO TOCA: testar nao pode custar a cutscene inteira a cada partida nova.
 * O heroi nasce onde ela o deixaria (a espada fincada atras dele, o mago na estrada). `?intro` toca
 * a cena assim mesmo.
 */
const SKIP_INTRO_LOCALLY = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(window.location.hostname)
  && !new URLSearchParams(window.location.search).has('intro');

/** O que RunBoot usa de GameScene (e a cena do motor, que ele passa a quem monta objetos do mundo). */
export type RunBootHost = Engine.Scene & Pick<GameScene,
  'actions' | 'add' | 'adventure' | 'arc' | 'bumps' | 'camera' | 'carry' | 'chunkManager' | 'cutsceneActive'
  | 'dialog' | 'events' | 'game' | 'garden' | 'groundItems' | 'handleTileEntered' | 'hero' | 'heroBillboard'
  | 'intro' | 'inventory' | 'itemManager' | 'movementController' | 'npcManager' | 'playerWorld' | 'query'
  | 'registry' | 'save' | 'scale' | 'seenDialogKeys' | 'seenItems' | 'streamCenter' | 'swing' | 'teardown'
  | 'torch' | 'tweens' | 'verbs' | 'view' | 'world3d'
>;

export class RunBoot {
  // The held item, slung diagonally on the hero's back like it's tucked in a satchel.
  // In-world it's a 3D billboard riding the hero billboard (so the body occludes it
  // properly); the 2D image only returns for the screen-space death elegy.
  public backItem?: Engine.GameObjects.Image;
  public keepClockOnLeave?: () => void;

  public constructor(private readonly host: RunBootHost) {}

  /** A partida começa: aventura ou playtest, de onde se nasce, o mundo 3D, as texturas geradas, o som. */
  public prepareRun(): { startWorldX: number; startWorldY: number; skipIntro: boolean } {
    // A AVENTURA TEM MEMORIA. O jogo e UM mundo aberto, e ele hidrata do retrato em
    // adventureState, que sobrevive ao scene.restart() por ser estado de modulo e ao browser por
    // viver no localStorage.
    //
    // Quem fica de fora e o PLAYTEST DO EDITOR (`appMode === 'editor'`): ali o mundo em memoria
    // pode estar sujo de edicao nao salva, e deixa-lo escrever no save contaminaria a partida de
    // quem so foi testar um tile.
    this.host.adventure = this.host.registry.get('appMode') === 'game';
    // Os buracos cavados voltam ao chao ANTES do World3D assar o terreno (o construtor le os
    // chunks): a cavada e um diff por cima do world.json, que volta limpo do disco a cada boot.
    if (this.host.adventure) this.host.garden.applyDugSpotDiff();
    if (this.host.adventure) clearHomeYards();

    let start = getPlayerStart();
    const skipIntro = this.host.adventure && SKIP_INTRO_LOCALLY && !adventureState().introSeen;
    this.host.intro.openingTalk = this.host.adventure && this.host.registry.get(OPENING_TALK_KEY) === true;
    this.host.registry.remove(OPENING_TALK_KEY);
    // "Continue de onde parou" e um PEDIDO (o Continue do titulo), nunca o padrao.
    if (this.host.adventure && consumeAdventureRespawn() && adventureState().respawn) {
      start = { ...adventureState().respawn! };
    } else if (skipIntro) {
      start = { ...start, worldY: start.worldY - INTRO_WALK_TILES };
    }
    const { worldX: startWorldX, worldY: startWorldY } = start;

    this.host.actions.useCooldownMs = 0;
    this.host.actions.useBufferMs = 0;
    this.host.tweens.timeScale = 1;
    this.host.playerWorld = { worldX: startWorldX, worldY: startWorldY };
    this.host.streamCenter = { cx: NaN, cy: NaN };
    // O heroi e um campo `readonly` e o motor REUSA esta instancia de cena no restart: sem
    // isto, o que a cena anterior escreveu nele chega inteiro na seguinte.
    resetHeroView(this.host.hero);

    // The 2D canvas is transparent: the 3D world shows through from below.
    // Build the renderer before ANY world object — they attach their billboards to it.
    this.host.world3d = new World3D();
    setCurrentWorld3D(this.host.world3d);
    // Generate the bucket's + charcoal's pixel art into both texture pipelines before any
    // prop/item is built (their billboards resolve their textures on construction below).
    registerBucketTextures(this.host);
    registerCharcoalTexture(this.host);
    registerFungiTextures(this.host);
    registerPlacementTextures(this.host);
    registerCozyTextures(this.host);
    registerPaintTextures(this.host);
    registerWoodTextures(this.host);
    registerSkyTextures(this.host);
    registerHomeTextures(this.host);
    registerFindTextures(this.host);
    // The 3D canvas is position:fixed (z-index 0), which paints ABOVE static content.
    // Promote the 2D canvas into its own stacking level so the whole 2D side —
    // lighting overlays, FX, canvas UI — draws over the 3D world, not under it.
    this.host.game.canvas.style.position = 'relative';
    this.host.game.canvas.style.zIndex = '1';
    window.hd3d = this.host.world3d.params;
    this.host.events.on(Engine.Scenes.Events.POST_UPDATE, this.host.view.render3D, this.host.view);

    // Decode the SFX + music loops. A aventura tem trilha ("Little Hearth") sobre os leitos do vale,
    // e ESTA E A UNICA VEZ EM QUE A TRILHA E ESCOLHIDA: quem baixa a musica sao as telas que a
    // tomam — dialogo, item-get, cutscene —, e cada uma a devolve com fadeMusicIn ao fechar.
    getSoundManager().preload();
    if (this.host.adventure) getSoundManager().music.startMusic('overworld', 2400);
    else getSoundManager().music.stopMusic(1800);
    getSoundManager().ambience.startAmbience();

    // The engine does not auto-call shutdown(); wire it so scene.restart() cleans up
    // listeners/textures instead of leaking them across runs.
    this.host.events.once(Engine.Scenes.Events.SHUTDOWN, this.host.teardown.shutdown, this.host.teardown);

    return { startWorldX, startWorldY, skipIntro };
  }

  /** O que a partida lembra: os chunks, a história já vista, o dia e a hora. */
  public loadSavedRun(skipIntro: boolean): void {
    this.host.chunkManager = new ChunkManager();
    this.host.cutsceneActive = false;
    this.host.view.cutsceneHeroLight = 1;
    this.host.seenDialogKeys.clear();
    if (this.host.adventure) {
      // A historia e os dialogos ouvidos voltam do save: a jornada mora nele (ver systems/RunArc). O portão só abre
      // com a CHAVE, que quem fecha o último pedido entrega. Um jogo fechado entre o último pedido e a entrega volta
      // com tudo cumprido e sem chave: ela chega logo depois (ver create).
      const st = adventureState();
      this.host.arc.load(adventureArcStore());
      if (skipIntro) this.host.arc.reach('intro');
      setDay(st.day);
      if (st.clock !== null) setTimeOfDay(st.clock);
      // Fechar a aba não passa por nenhum gesto: a hora se guarda sozinha. Só a hora, porque a cena do
      // fim já mexe no resto antes de os créditos subirem (ver playRoastEnding).
      this.keepClockOnLeave = () => {
        const saved = adventureState();
        if (!saved.started) return;
        saved.day = getDay();
        saved.clock = getTimeOfDay();
        saveAdventure();
      };
      window.addEventListener('pagehide', this.keepClockOnLeave);
      st.seenDialogKeys.forEach((k) => this.host.seenDialogKeys.add(k));
    } else {
      // O playtest do editor nao tem abertura: quem aperta P quer testar o tile, nao a historia. E nao grava nada.
      this.host.arc.load(memoryArcStore('intro'));
    }
  }

  /** A gente do vale e as coisas soltas: NPCs, itens no chão, a mão do herói, a câmera. */
  public spawnPeople(startWorldX: number, startWorldY: number): void {
    const getContent = (cx: number, cy: number): ScreenContent => getChunkContent(cx, cy);
    this.host.npcManager = new NpcManager(this.host, getContent, (kind, wx, wy, dialog) => {
      const key = this.host.dialog.dialogKeyFor(kind, wx, wy, dialog);
      return key !== null && !this.host.seenDialogKeys.has(key);
    }, (wx, wy) => {
      // Encarado de perto, quem fala é o balão de ação: ele já diz o que o Z faz, e o "!" sai.
      if (!this.host.actions.canAct() || !this.host.movementController) return false;
      const front = this.host.verbs.facingTile();
      return front.x === wx && front.y === wy;
    });
    // O mago so entra em cena DURANTE a abertura: ate la o lugar dele na estrada fica vazio.
    if (!this.host.arc.has('intro')) this.host.npcManager.setKindHidden('wizard', true);
    this.host.itemManager = new ItemManager(this.host);
    // O chao tambem lembra: a foto salva dos itens substitui a lista autorada — um item largado
    // fica onde ficou, um cogumelo colhido nao renasce. Sem foto, vale o autorado.
    this.host.save.adventureScope = 'world';
    const savedGround = this.host.adventure ? adventureState().groundItems.get(this.host.save.adventureScope) : undefined;
    this.host.itemManager.loadAuthored(
      savedGround
        ? savedGround.map((g) => ({ type: g.kind, worldX: g.worldX, worldY: g.worldY, units: g.count }))
        : getHeldItemPickups(),
    );
    this.host.inventory.clear(); // fora da aventura a mochila e da RUN e comeca de maos vazias
    this.host.seenItems.clear();
    if (this.host.adventure) {
      const st = adventureState();
      // As costas voltam com o que estava nelas, e as ferramentas guardadas voltam guardadas. O resto (um save da
      // mochila antiga) pousa em volta do herói — nada se perde, só deixa de caber nas costas.
      const kept = st.inventory.find((it) => it.kind === st.selected) ?? st.inventory.find((it) => !isToolKind(it.kind));
      for (const it of st.inventory) {
        if (it === kept) { this.host.inventory.add(it.kind, it.count); continue; }
        if (this.host.inventory.keep(it.kind)) continue;
        const units = UNIT_PACK_KINDS.has(it.kind) ? [it.count] : Array.from({ length: it.count }, () => 1);
        for (const n of units) this.host.groundItems.dropNear(it.kind, n, startWorldX, startWorldY);
      }
      st.seenItems.forEach((k) => this.host.seenItems.add(k as HeldItemKind));
      this.host.carry.updateBackItem(); // o item selecionado volta as costas do heroi ja no primeiro frame
    }
    this.host.torch.heldOnFire = false;
    // One reusable swing animator, alive for the whole scene: the tools swing through it
    // (SwordSlash.slash accepts a custom item sprite).
    this.host.swing.swordSlash = new SwordSlash(this.host);
    this.host.camera = new WorldCamera(startWorldX, startWorldY, 0, 0);
    this.host.camera.world3d = this.host.world3d;
    this.host.world3d!.cam.follow(startWorldX, startWorldY, true, terrainHeightAt(startWorldX, startWorldY));

  }

  /** O herói: o billboard, a silhueta, o item das costas, o controle de andar e a tela. */
  public spawnHero(startWorldX: number, startWorldY: number): void {
    // The hero's contact blob rides the billboard like every other actor's; zBias peeks the
    // shadow past his boots.
    this.host.heroBillboard = this.host.world3d!.objects.addBillboard('hero', HERO_FRAMES.idleDown, {
      castGroundShadow: true,
      reflected: true, // o espelho d'água (World3D.renderReflection)
      groundShadow: { rx: 0.34, rz: 0.32, alpha: 0.34, zBias: 0.1 },
      outline: true, // o assunto do quadro: o anel escuro o separa do chão (render3d/spriteOutline.ts)
    })
      .setPosition(startWorldX, startWorldY)
      .setDisplaySize(1, 1);
    this.host.view.heroSilhouette = new OccludedSilhouette(this.host.heroBillboard);

    // The 2D back-item image idles hidden (the in-world carried item is a billboard — see
    // updateBackItem).
    this.backItem = this.host.add
      .image(0, 0, ASSET_KEYS.swordItemIcon)
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(SCENE_DEPTHS.player - 1);

    this.host.movementController = new PlayerMovementController(
      this.host,
      this.host.hero,
      this.host.camera!,
      // A SERRA barra pelo PAR de tiles: do chao para o planalto, so pela escada (ver relief).
      (wx, wy, fx, fy) => this.host.query.isSolidForEntities(wx, wy) || !canStep(fx, fy, wx, wy),
      // Fires once per tile ENTERED (never per frame): decor rustle + walk-on interactions.
      (wx, wy, dx, dy) => {
        this.host.world3d?.objects.rustleDecor(wx, wy);
        this.host.handleTileEntered(wx, wy, dx, dy);
      },
      (wx, wy) => this.host.bumps.handlePlayerBump(wx, wy),
    );

    this.host.scale.on(Engine.Scale.Events.RESIZE, this.host.view.handleResize, this.host.view);
    this.host.view.handleResize({ width: this.host.scale.width, height: this.host.scale.height });

  }
}

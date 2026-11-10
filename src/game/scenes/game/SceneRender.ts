// O DESENHO DA CENA: o mundo 3D a cada quadro (depois da atualização), o herói no billboard dele, as peças, o tamanho
// do tile para a tela, e o profiler em volta do desenho.

import * as Engine from '@/game/engine';
import { ASSET_KEYS, CHUNK_COLUMNS, CHUNK_ROWS, GAMEPLAY_HERO_MAX_SIZE, GAMEPLAY_HERO_SCALE, MIN_BOARD_TILE_SIZE } from '@/game/constants';
import { profiler } from '@/game/debug/Profiler';
import { isNightTime } from '@/game/runtime/timeOfDay';
import { terrainHeightAt } from '@/game/world/relief';
import { heroFootY, tickHeroView } from '@/game/runtime/HeroView';
import { createBoardMetrics } from '@/game/shared/grid';
import { adventureState } from '@/game/runtime/adventureState';
import type { HomeKind } from '@/game/render3d/homeTextures';
import type { GameScene } from '../GameScene';
import { OccludedSilhouette } from '@/game/render3d/OccludedSilhouette';
import { FpsCounter } from '@/game/runtime/FpsCounter';

// The torch's light shrinks with its fuel (full circle → this fraction right before it dies),
// so the closing pool of firelight IS the fuel gauge.
const TORCH_MIN_LIGHT_FRAC = 0.4;
const THEA_GONE: ReadonlySet<HomeKind> = new Set<HomeKind>(['astronaut']);
const NOBODY_GONE: ReadonlySet<HomeKind> = new Set<HomeKind>();

/** O que SceneRender usa de GameScene. */
export type SceneRenderHost = Pick<GameScene,
  'bumps' | 'camera' | 'cameraLookBlend' | 'cameras' | 'carry' | 'children' | 'chunkManager' | 'cutsceneActive'
  | 'dialog' | 'dialogCam' | 'forage' | 'forge' | 'game' | 'hero' | 'heroBillboard' | 'itemManager' | 'life'
  | 'movementController' | 'npcManager' | 'playerWorld' | 'props' | 'scale' | 'steps' | 'tileSize' | 'time'
  | 'torch' | 'tweens' | 'uiTileSize' | 'valley' | 'verbs' | 'world3d'
>;

export class SceneRender {
  /** O FPS fixo no canto da tela (ver FpsCounter). */
  public fpsCounter?: FpsCounter;
  // Scales the hero's ambient glow (1 = normal). During the first-campfire cut-scene it fades to
  // 0 so all the light comes from the blooming fire, then eases back to 1 as we return to the hero.
  public cutsceneHeroLight = 1;
  public heroSilhouette?: OccludedSilhouette;

  public constructor(private readonly host: SceneRenderHost) {}

  public render3D(_time: number, delta: number): void {
    const w3 = this.host.world3d;
    const cam = this.host.camera;
    if (!w3 || !cam) return;
    profiler.begin('render3d');

    // The dialog pan shifts WorldCamera.screenCenter; translate that into a
    // camera view offset in tiles so the 3D framing pans the same way.
    const ts = Math.max(1, this.host.tileSize);
    const defCx = Math.floor(this.host.scale.width / 2);
    const defCy = Math.floor(this.host.scale.height / 2);
    const look = this.host.dialogCam.cameraLookOffset(delta, cam.camX, cam.camY);
    w3.projection.setViewOffset((defCx - cam.screenCenterX) / ts + look.x, (defCy - cam.screenCenterY) / ts + look.y);
    w3.projection.setFocusAtCentre(this.host.cameraLookBlend > 0);
    // A camera sobe e desce com o chao debaixo do heroi (a serra): no planalto o quadro e o mesmo,
    // um nivel acima. A altura e continua na escada, entao a subida da camera e o proprio passo.
    w3.cam.follow(cam.camX, cam.camY, false, terrainHeightAt(cam.camX, cam.camY));

    // The projected size of one tile at screen centre IS the legacy "tileSize"
    // every remaining 2D-side FX scales itself by.
    this.host.tileSize = w3.projection.tileScreenSize();
    this.host.uiTileSize = this.host.tileSize / w3.cam.zoomFactor;
    // E o heroi mede EXATAMENTE um tile — aqui, todo frame, junto do numero de que ele depende.
    this.host.hero.sizePx = this.host.tileSize;

    // The walk cycle ticks here (POST_UPDATE runs even when update() early-returns).
    tickHeroView(this.host.hero, delta);
    this.host.valley.npcHomes?.syncNight(isNightTime(), adventureState().skyQuest.departed ? THEA_GONE : NOBODY_GONE);
    this.syncHeroBillboard();
    this.host.steps.fadeFootprints();
    // Os vaga-lumes vivem aqui e nao no update: eles sao a moldura das cutscenes (a abertura e o
    // fim), e o update fica parado justamente nelas.
    profiler.begin('life.fireflies');
    this.host.life.updateFireflies(delta);
    profiler.end('life.fireflies');
    profiler.begin('life.weather');
    this.host.life.updateWeather(delta);
    profiler.end('life.weather');
    profiler.begin('life.daylife');
    this.host.life.updateDaytimeLife(delta);
    profiler.end('life.daylife');
    this.host.life.updateAmbienceMix(delta);

    // A vista do heroi + a tocha na mao dele, as duas montadas no corpo DESENHADO.
    const hb = this.host.heroBillboard;
    if (hb) {
      const f = this.host.movementController?.facing ?? { dx: 0, dy: 1 };
      w3.hero.setHeroSight(hb.x, hb.y, f.dx, f.dy, this.cutsceneHeroLight);
      const torchOn = this.host.torch.isTorchLit && !this.host.cutsceneActive;
      const fuel = TORCH_MIN_LIGHT_FRAC + (1 - TORCH_MIN_LIGHT_FRAC) * this.host.torch.torchFuelFrac;
      w3.hero.setTorchLight(hb.x, hb.y, torchOn ? fuel * this.host.torch.torchGutter.level : 0);
    }

    w3.frame.render(delta);
    profiler.end('render3d');
    profiler.gauge('tweens', this.host.tweens.getTweens().length);
    profiler.gauge('displayList', this.host.children.length);
  }

  public handlePreRender(): void {
    profiler.begin('ui2d');
  }

  public handlePostRender(): void {
    profiler.end('ui2d');
    profiler.frameEnd();
    this.fpsCounter?.tick(performance.now());
  }

  public handleVisible(): void {
    this.fpsCounter?.resync();
  }

  // Draw the hero's state onto its 3D billboard: position from the screen-centre pin
  // + any lunge offset, size/frame/flip/tint verbatim.
  private syncHeroBillboard(): void {
    const b = this.host.heroBillboard;
    const h = this.host.hero;
    const cam = this.host.camera;
    if (!b || !cam) return;
    const ts = Math.max(1, this.host.tileSize);

    // Anchor the mapping at the hero's FEET, not his centre: the billboard is planted on the
    // ground of its tile and grows upward, so breathing (which stretches scaleY) must not move
    // the foot line — otherwise the hero looks like he is hopping.
    b.setPosition(
      cam.camX + (h.x - cam.screenCenterX) / ts + h.lungeX,
      cam.camY + (heroFootY(h) - cam.screenCenterY) / ts - 0.5 + h.lungeY,
    );
    // The walk bob is elevation, not a shift of y (y is the ground plane here). `lift` is what a
    // cut-scene owns; the bob rides on top of it.
    b.setElevation(h.bobLift + h.lift);
    b.setDisplaySize(
      Math.max(0.05, (h.sizePx * h.scaleX) / ts),
      Math.max(0.05, (h.sizePx * h.scaleY) / ts),
    );
    b.setTexture(ASSET_KEYS.hero, h.frame);
    b.setFlipX(h.flipX);
    b.setAlpha(h.alpha);
    b.setAngle(h.spin);
    this.heroSilhouette?.sync();

    // The carried item rides the just-synced hero position.
    this.host.carry.positionBackItem();

    if (h.tint !== null) b.setTint(h.tint);
    else b.clearTint();
  }

  public handleResize(gameSize: Engine.Structs.Size | { width: number; height: number }): void {
    const { width, height } = gameSize;
    this.host.cameras.main.setViewport(0, 0, width, height);

    // O tileSize e a PROJECAO de um tile pela camera 3D — nunca a formula 2D antiga, que da um
    // numero bem diferente (~60px contra ~93px num viewport de 1280x720, porque a camera enquadra
    // menos de um chunk desde que o zoom desceu). A formula velha so responde antes de o mundo 3D
    // existir, no primeiro `handleResize` do boot.
    this.host.tileSize = this.host.world3d?.projection.tileScreenSize() ?? this.computeTileSize(width, height);
    this.host.uiTileSize = this.host.tileSize / (this.host.world3d?.cam.zoomFactor ?? 1);

    if (this.host.camera) {
      this.host.camera.screenCenterX = Math.floor(width / 2);
      this.host.camera.screenCenterY = Math.floor(height / 2);
      // Visible tile counts around the centered hero (used for the streaming window).
      this.host.camera.viewportColumns = Math.ceil(width / this.host.tileSize);
      this.host.camera.viewportRows = Math.ceil(height / this.host.tileSize);
      // A resize mid-dialog would recentre the hero under the panel; re-apply the pan offset.
      if (this.host.dialog.dialogOpen) {
        const t = this.host.dialogCam.dialogScreenCenter(this.host.dialog.dialogNpcWorld);
        this.host.camera.screenCenterX = t.x;
        this.host.camera.screenCenterY = t.y;
      }
    }

    this.host.hero.sizePx = this.host.tileSize; // o render3D reescreve isto todo frame; aqui e so pro primeiro
    this.host.movementController?.syncPlayerToWorld(this.host.playerWorld.worldX, this.host.playerWorld.worldY, this.host.tileSize);
  }

  private computeTileSize(width: number, height: number): number {
    const metrics = createBoardMetrics(width, height, {
      columns: CHUNK_COLUMNS,
      rows: CHUNK_ROWS,
      minTileSize: MIN_BOARD_TILE_SIZE,
      characterScale: GAMEPLAY_HERO_SCALE,
      maxCharacterSize: GAMEPLAY_HERO_MAX_SIZE,
    });
    return metrics.tileSize;
  }

  // Re-project the frozen world to the current camera anchor without advancing any gameplay.
  // Used to redraw every frame of the dialog camera pan (update() is short-circuited then;
  // render3D on POST_UPDATE keeps the 3D camera itself panning).
  public reprojectStatic(): void {
    if (!this.host.camera || !this.host.chunkManager) return;
    this.host.hero.x = this.host.camera.screenCenterX;
    this.host.hero.y = this.host.camera.screenCenterY;
    this.host.carry.positionBackItem();
    this.host.steps.updateFootprints();
    this.host.itemManager?.render(this.host.tileSize, this.host.camera);
    this.host.npcManager?.render(this.host.tileSize, this.host.camera, this.host.uiTileSize);
    this.renderProps();
  }

  // Per-frame prop work. Props are static in world space (the 3D camera does the moving), so
  // only the two with real per-frame logic appear here — the old per-type render() no-ops are
  // gone with the 2D projection they used to serve.
  public renderProps(): void {
    if (!this.host.camera) return;
    for (const w of this.host.props.waterTiles) {
      // Show the "build a bridge here" indicator on any un-bridged river tile the hero stands
      // orthogonally next to — the exact tile a graveto would go into.
      const dist = Math.abs(w.worldX - this.host.playerWorld.worldX) + Math.abs(w.worldY - this.host.playerWorld.worldY);
      w.setBuildHint(dist === 1 && !this.host.dialog.dialogOpen);
      w.render(this.host.tileSize, this.host.camera);
    }
    // O aviso de apanhar segue o corpo DESENHADO, e nao o tile logico: a logica salta para o
    // destino no primeiro frame do passo, e o nome sairia um tile na frente do heroi a cada passo.
    if (this.host.camera) {
      const at = this.host.movementController?.visualWorld(this.host.playerWorld.worldX, this.host.playerWorld.worldY)
        ?? { x: this.host.playerWorld.worldX, y: this.host.playerWorld.worldY };
      // O balao de pensamento monta no MESMO ponto do aviso de apanhar, e pelo mesmo motivo: a
      // ancora e o corpo DESENHADO. O relogio dele corre no update (ver HeroThought.tick).
      const ui = this.host.uiTileSize;
      this.host.bumps.heroThought?.render(this.host.tileSize, this.host.camera, this.host.time.now, at, ui);
      this.host.forage.bagStash?.render(this.host.tileSize, this.host.camera, at, this.host.game.loop.delta);
      const oven = this.host.props.furnaces[0];
      if (oven) this.host.forge.furnaceAsk?.render(this.host.tileSize, this.host.camera, this.host.time.now, { x: oven.worldX, y: oven.worldY }, ui);
      const prompt = this.host.verbs.currentPrompt(at);
      this.host.verbs.actionPrompt?.render(prompt?.view ?? null, this.host.tileSize, this.host.camera, this.host.time.now, prompt?.at ?? at, ui);
    }
    // Bombs are world-anchored billboards; nothing to reproject here.
  }
}

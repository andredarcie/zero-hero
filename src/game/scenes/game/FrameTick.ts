// O QUADRO DA CENA: tudo o que anda a cada tick, na ordem em que um precisa do outro.

import { profiler } from '@/game/debug/Profiler';
import { getSoundManager } from '@/game/audio/SoundManager';
import type { GameScene } from '../GameScene';

/** O que FrameTick usa de GameScene. */
export type FrameTickHost = Pick<GameScene,
  'actions' | 'bumps' | 'camera' | 'camp' | 'chunkManager' | 'cutsceneActive' | 'dialog' | 'dialogCam' | 'fire'
  | 'forage' | 'forge' | 'garden' | 'hand' | 'hero' | 'itemManager' | 'life' | 'machines' | 'movementController'
  | 'npcManager' | 'orders' | 'playerWorld' | 'props' | 'query' | 'questSetup' | 'save' | 'steps' | 'streamChunks'
  | 'tileSize' | 'time' | 'torch' | 'uiTileSize' | 'verbs' | 'view'
>;

export class FrameTick {
  private lastStepTime = 0;

  public constructor(private readonly host: FrameTickHost) {}

  public tick(_time: number, delta: number): void {
    // A marca some junto: um quadrado branco prometendo um gesto durante um dialogo e a mesma
    // mentira que o balao de dica era. `syncPlacementHints` a reacende logo abaixo se o jogo
    // estiver mesmo correndo.
    this.host.machines.placementHints?.clear();

    // The camera pan (open or close) drives its own reprojection from the tween, so keep the
    // world frozen here until it finishes — otherwise gameplay would fight the pan.
    if (this.host.dialog.dialogOpen || this.host.dialogCam.camShifting) {
      // O balão some com a conversa. Fora dela ele vive o tempo dele (ver HeroThought.tick): apagá-lo
      // a cada quadro fazia o pensamento nunca aparecer.
      this.host.bumps.heroThought?.clear();
      if (this.host.camera && !this.host.dialogCam.camShifting) this.host.verbs.actionPrompt?.render(null, this.host.tileSize, this.host.camera, this.host.time.now, { x: this.host.playerWorld.worldX, y: this.host.playerWorld.worldY });
      this.host.dialog.dialogOverlay?.update();
      return;
    }

    // The item-get and the cut-scenes freeze gameplay; only their own tweens run.
    if (this.host.hand.itemGetOpen || this.host.cutsceneActive) {
      // O balão de ação é redesenhado só aqui embaixo (renderProps): sem isto ele ficava congelado na tela a cena
      // inteira — o "Assar Z" pairava sobre o herói durante o fim todo.
      if (this.host.camera) this.host.verbs.actionPrompt?.render(null, this.host.tileSize, this.host.camera, this.host.time.now, { x: this.host.playerWorld.worldX, y: this.host.playerWorld.worldY });
      return;
    }
    // SENTADO NA FOGUEIRA: o mundo anda (o relogio acelerado, as fogueiras seguindo o ceu), o
    // heroi nao. Qualquer tecla o levanta (ver restAtFireAt).
    if (this.host.camp.rest.isResting) {
      if (this.host.camp.rest.tick()) return;
      this.host.fire.syncCampfiresToClock();
      if (this.host.npcManager && this.host.camera) this.host.npcManager.render(this.host.tileSize, this.host.camera, this.host.uiTileSize);
      this.host.camp.catCare.update(delta);
      this.host.view.renderProps();
      return;
    }
    // O CATALOGO de fabricacao congela igual, e a colheita de um cogumelo tambem.
    if (this.host.orders.orderOverlay || this.host.forage.foraging) return;

    if (!this.host.movementController || !this.host.chunkManager || !this.host.camera) {
      return;
    }

    // A cadencia do X. Ele NAO e lido aqui: chega por evento de teclado (e pelo circulo no
    // toque), porque um `JustDown` lido dentro do update morre em toda porta que este metodo tem
    // para sair mais cedo.
    this.host.actions.useCooldownMs = Math.max(0, this.host.actions.useCooldownMs - delta);
    this.host.actions.spendActionBuffers(delta);
    const prevWorldX = this.host.playerWorld.worldX;
    const prevWorldY = this.host.playerWorld.worldY;
    profiler.begin('update.move');
    this.host.playerWorld = this.host.movementController.update(
      this.host.playerWorld.worldX,
      this.host.playerWorld.worldY,
      delta,
    );
    profiler.end('update.move');
    const stepDx = this.host.playerWorld.worldX - prevWorldX;
    const stepDy = this.host.playerWorld.worldY - prevWorldY;

    this.host.fire.syncCampfiresToClock();

    if (stepDx !== 0 || stepDy !== 0) {
      this.lastStepTime = this.host.time.now;
      this.host.steps.stopBreathing();
      this.host.steps.spawnFootprint(prevWorldX, prevWorldY, stepDx, stepDy);
    } else if (!this.host.dialog.dialogOpen && !this.host.dialogCam.camShifting && this.host.time.now - this.lastStepTime > 180) {
      this.host.steps.startBreathing();
    }
    profiler.begin('update.chunks');
    this.host.streamChunks();
    profiler.end('update.chunks');
    this.host.steps.updateFootprints();
    this.host.forage.tickShuiWave();
    this.host.bumps.heroThought?.tick(delta);
    this.host.forge.updateFurnaceAsk(delta);

    // Burn the carried flame down; snuff it when the fuel runs out. Re-igniting at a lit
    // campfire refills it.
    if (this.host.torch.heldOnFire) {
      this.host.torch.torchFuelMs -= delta;
      if (this.host.torch.torchFuelMs <= 0) this.host.torch.extinguishTorch();
    }
    this.host.torch.updateTorchFx(delta);

    profiler.begin('update.items');
    if (this.host.itemManager) {
      // O combustivel de um graveto aceso no chao queima no mesmo relogio do da mao.
      this.host.itemManager.tickFires(delta);
      // CARVAO sob a tocha ACESA: consome em vez de guardar — o passo COME o carvao e a chama
      // volta ao combustivel cheio.
      if (this.host.torch.isTorchLit
        && this.host.itemManager.kindAt(this.host.playerWorld.worldX, this.host.playerWorld.worldY) === 'charcoal') {
        this.host.itemManager.takeAt(this.host.playerWorld.worldX, this.host.playerWorld.worldY);
        this.host.torch.refuelTorch();
        getSoundManager().nature.playIgnite();
        this.host.hero.tint = 0xff6600;
        this.host.time.delayedCall(250, () => { this.host.hero.tint = null; });
        this.host.save.persistAdventure(); // o carvao comido saiu do chao
      }
      this.host.itemManager.render(this.host.tileSize, this.host.camera!);
    }

    profiler.end('update.items');

    profiler.begin('update.world');
    // Felled trees grow back after a while (renewable gravetos = no soft-lock). The clock only
    // ticks while the tile is clear — a dropped item (the graveto) on the stump pauses it.
    for (const tree of this.host.props.dryTrees) {
      if (tree.updateRegrow(delta, this.host.query.isTileClearForRegrow(tree.worldX, tree.worldY))) {
        tree.regrow();
      }
    }
    // Plots whose grown grass was consumed reopen their hole for replanting (the farming loop).
    this.host.garden.updatePlantSpots();
    this.host.questSetup.painterQuest?.update(delta);
    // A flor da lua le a luz das fogueiras e abre/fecha por conta dela.
    this.host.life.updateMoonflowers(delta);
    this.host.forge.updateFurnaces(delta);
    // O ALTAR não tem ciclo: o único relógio dele é o da brasa que a pancada deixou no tampo.
    for (const altar of this.host.props.altars) altar.update(delta);
    this.host.forge.tickForging();
    this.host.orders.updateToolboxes(delta);
    profiler.end('update.world');

    // As marcas de posicionamento seguem o corpo NO MESMO frame em que ele vira.
    this.host.machines.syncPlacementHints();
    profiler.begin('update.npcs');
    if (this.host.npcManager && this.host.camera) this.host.npcManager.render(this.host.tileSize, this.host.camera, this.host.uiTileSize);
    this.host.dialog.greetNearbyNpcs();
    this.host.camp.catCare.update(delta);
    profiler.end('update.npcs');
    profiler.begin('update.props');
    this.host.view.renderProps();
    profiler.end('update.props');
  }
}

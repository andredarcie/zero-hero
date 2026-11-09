// A FORJA: a peça no altar e a pancada que a trabalha, o martelo que volta, a barra que a Thea busca, o forno que
// come carvão e pede o que falta.

import { HERO_FRAMES } from '@/game/constants';
import { FurnaceObject, type FurnaceWorldPort } from '@/game/objects/FurnaceObject';
import { AltarObject, FORGE_HAMMER_SIZE, FORGE_HAMMER_TEXTURE, LOAD_ELEV as ANVIL_FACE_ELEV } from '@/game/objects/AltarObject';
import { hammerResult } from '@/game/objects/hammering';
import { tLines } from '@/game/i18n/i18n';
import { getSoundManager } from '@/game/audio/SoundManager';
import { getDialog, getDialogVoice, getNpcHome } from '@/game/world/WorldData';
import { FireVisitor } from '@/game/entities/FireVisitor';
import type * as Engine from '@/game/engine';
import type { GameScene } from '../GameScene';
import { Billboard3D } from '@/game/render3d/Billboard3D';
import { HeroThought } from '@/game/runtime/HeroThought';
import { CARDINAL_DIRS, ITEM_VISUAL_2D } from './sceneDefs';

/** A Thea vindo buscar a barra na bigorna: ela corre (o passo de visita é 420 ms). */
const THEA_RUN_STEP_MS = 230;

/** O que ForgeWork usa de GameScene (e a cena do motor, que ele passa a quem monta objetos do mundo). */
export type ForgeWorkHost = Engine.Scene & Pick<GameScene,
  'actions' | 'bumps' | 'camp' | 'carry' | 'cinema' | 'cutsceneActive' | 'dialog' | 'groundItems' | 'hand'
  | 'heldItem' | 'hero' | 'heroBillboard' | 'inventory' | 'movementController' | 'npcManager' | 'orders'
  | 'playerWorld' | 'props' | 'query' | 'questSetup' | 'save' | 'seenItems' | 'steps' | 'time' | 'torch'
  | 'tweens' | 'verbs' | 'world3d'
>;

export class ForgeWork {
  /** O balão sobre o forno da Thea: o item que ele pede agora (ver AstronomerQuest.furnaceNeed). */
  public furnaceAsk?: HeroThought;
  /**
   * O HERÓI MALHANDO NA BIGORNA: o martelinho saiu do toco para a mão dele. Ao sair de perto (andar, virar,
   * conversar), ele volta para o lugar — é da bigorna, não da bolsa (ver forgeStrike / returnForgeHammer).
   */
  public forging?: { altar: AltarObject; hammer: Billboard3D; at: string; busy: boolean };

  public constructor(private readonly host: ForgeWorkHost) {}

  /**
   * A BIGORNA (pedido do autor): com uma peça que a pancada trabalha (a esponja), é malhar — o herói pega o
   * martelinho do toco e bate (forgeStrike). Com outra coisa (a barra pronta, uma pedra posta por engano), o gesto
   * a devolve para a mão. Devolve `false` quando não há bigorna com peça ali.
   */
  public workAltarAt(wx: number, wy: number): boolean {
    const altar = this.host.query.getAltarAt(wx, wy);
    if (!altar?.carrying) return false;
    if (hammerResult(altar.carrying) !== undefined) {
      void this.forgeStrike(altar);
      return true;
    }
    const back = altar.take();
    if (!back) return false;
    this.host.hand.takeIntoHand(back);
    getSoundManager().ui.playSwordPickup();
    this.host.save.persistAdventure();
    return true;
  }

  /**
   * UMA MARTELADA NA BIGORNA. Na primeira, o herói pega o martelinho do toco; cada aperto depois dela é uma
   * pancada inteira: o martelo sobe por cima do ombro, desce seco na mesa (faísca, pedrinhas de escória, a mesa em
   * brasa, o toque do ferro), quica e fica pronto para a próxima. Na última, a esponja vira barra — e, se a Thea
   * está esperando por ela, ela vem buscar.
   */
  private async forgeStrike(altar: AltarObject): Promise<void> {
    const hb = this.host.heroBillboard;
    const w3 = this.host.world3d;
    if (!hb || !w3) return;
    if (this.forging && this.forging.altar !== altar) this.returnForgeHammer();
    const hero = this.host.playerWorld;
    const dx = Math.sign(altar.worldX - hero.worldX);
    const dy = Math.sign(altar.worldY - hero.worldY);
    if (!this.forging) {
      const rest = altar.hammerRest;
      altar.setHammerAway(true);
      const hammer = w3.objects.addBillboard(FORGE_HAMMER_TEXTURE, 0, { centered: true })
        .setPosition(rest.x, rest.y)
        .setElevation(rest.elevation + FORGE_HAMMER_SIZE / 2)
        .setDisplaySize(FORGE_HAMMER_SIZE, FORGE_HAMMER_SIZE)
        .setAngle(rest.angle)
        .setTint(0xd8d8d8);
      this.forging = { altar, hammer, at: `${hero.worldX},${hero.worldY}`, busy: true };
      getSoundManager().work.playForgeHammerPickup();
      await this.host.cinema.tweenTo({
        targets: hammer, x: hb.x + 0.16, y: hb.y - dy * 0.05, elevation: 0.75, angle: -20, duration: 200, ease: 'Quad.easeOut',
      });
      this.forging.busy = false;
    }
    const f = this.forging;
    if (!f || f.busy) return;
    f.busy = true;
    const hammer = f.hammer;
    // ERGUER: por cima do ombro, a cabeça para trás.
    this.host.hero.frame = dy < 0 ? HERO_FRAMES.attackUp : HERO_FRAMES.attack;
    await this.host.cinema.tweenTo({
      targets: hammer, x: hb.x + 0.12 - dx * 0.08, y: hb.y - dy * 0.04, elevation: 1.3, angle: -70, duration: 150, ease: 'Sine.easeOut',
    });
    // DESCER: seco, na mesa da bigorna (um fio à frente dela, para desenhar por cima).
    this.host.tweens.add({ targets: this.host.hero, lungeX: dx * 0.1, lungeY: dy * 0.1, duration: 90, ease: 'Quad.easeIn' });
    await this.host.cinema.tweenTo({
      targets: hammer, x: altar.worldX - dx * 0.16, y: altar.worldY + 0.1, elevation: ANVIL_FACE_ELEV + 0.12, angle: 28, duration: 85, ease: 'Quad.easeIn',
    });
    const result = altar.strike();
    getSoundManager().work.playAnvilStrike(result === 'forged');
    if (result === 'forged') {
      const made = altar.carrying;
      if (made) this.host.seenItems.add(made);
      this.host.save.persistAdventure();
    }
    // O QUIQUE: o martelo volta um pouco no rebote do ferro, e o corpo também.
    this.host.tweens.add({ targets: this.host.hero, lungeX: 0, lungeY: 0, duration: 200, ease: 'Sine.easeOut' });
    await this.host.cinema.tweenTo({
      targets: hammer, elevation: ANVIL_FACE_ELEV + 0.45, angle: -12, duration: 130, ease: 'Quad.easeOut',
    });
    this.host.hero.frame = dy < 0 ? HERO_FRAMES.idleUp : HERO_FRAMES.idleDown;
    f.busy = false;
    if (result === 'forged' && altar.carrying === 'iron' && this.host.questSetup.astronomerQuest?.wantsIronAtAnvil()) {
      await this.host.cinema.wait(500);
      this.returnForgeHammer();
      void this.theaFetchesBar(altar);
    }
  }

  /** O martelinho volta para o toco da bigorna (o herói saiu de perto, ou a peça ficou pronta). */
  private returnForgeHammer(): void {
    const f = this.forging;
    if (!f) return;
    this.forging = undefined;
    const rest = f.altar.hammerRest;
    this.host.tweens.killTweensOf(f.hammer);
    this.host.tweens.add({
      targets: f.hammer,
      x: rest.x,
      y: rest.y,
      elevation: rest.elevation + FORGE_HAMMER_SIZE / 2,
      angle: rest.angle,
      duration: 220,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        f.hammer.destroy();
        f.altar.setHammerAway(false);
        getSoundManager().work.playForgeHammerSetDown();
      },
    });
  }

  /** O martelinho só fica na mão enquanto o herói está parado de frente para a bigorna, fora de conversa. */
  public tickForging(): void {
    const f = this.forging;
    if (!f || f.busy) return;
    const front = this.host.verbs.facingTile();
    const here = `${this.host.playerWorld.worldX},${this.host.playerWorld.worldY}`;
    if (here !== f.at || front.x !== f.altar.worldX || front.y !== f.altar.worldY || this.host.dialog.dialogOpen) this.returnForgeHammer();
  }

  /**
   * A THEA VEM BUSCAR A BARRA (pedido do autor): a barra pronta na bigorna, ela sai correndo do acampamento, chega ao lado
   * da bigorna, pega a barra, diz que vai construir o tripé e volta — e o tripé aparece no acampamento dela.
   */
  private async theaFetchesBar(altar: AltarObject): Promise<void> {
    const quest = this.host.questSetup.astronomerQuest;
    const home = getNpcHome('astronaut');
    if (!quest || !home || !quest.wantsIronAtAnvil() || this.host.cutsceneActive) return;
    this.host.cutsceneActive = true;
    this.host.steps.stopBreathing();
    this.host.movementController?.interruptMovement(this.host.playerWorld.worldX, this.host.playerWorld.worldY);
    this.host.actions.actionButtons?.setVisible(false);
    const hero: [number, number] = [this.host.playerWorld.worldX, this.host.playerWorld.worldY];
    const seats = CARDINAL_DIRS
      .map(([dx, dy]): [number, number] => [altar.worldX + dx, altar.worldY + dy])
      .filter(([x, y]) => !(x === hero[0] && y === hero[1]) && !this.host.query.isSolidForEntities(x, y));
    const path = this.host.camp.visitPath([home.worldX, home.worldY], seats, hero, [altar.worldX, altar.worldY])
      ?? [[home.worldX, home.worldY], seats[0] ?? [home.worldX, home.worldY]];
    const end = path[path.length - 1];
    this.host.npcManager?.setKindAway('astronaut', true);
    const runner = new FireVisitor(this.host, 'astronaut', path, THEA_RUN_STEP_MS);
    await new Promise<void>((resolve) => runner.arrive(resolve, false));
    // Ela pega a barra da mesa.
    altar.take();
    this.host.orders.flingCraftedItem('iron', altar.worldX, altar.worldY, end[0], end[1]);
    getSoundManager().ui.playItemStash();
    this.host.tweens.add({ targets: runner.bodySprite, elevation: 0.3, duration: 140, yoyo: true, ease: 'Quad.easeOut' });
    await this.host.cinema.wait(350);
    const base = getDialog('astronaut');
    if (base) {
      this.host.dialog.dialogSpeaker = runner.bodySprite;
      await new Promise<void>((resolve) => {
        this.host.dialog.openDialogScript({ ...base, lines: tLines('npc.astronautStep.anvil') }, { worldX: end[0], worldY: end[1] }, getDialogVoice('astronaut'), resolve);
      });
      this.host.dialog.dialogSpeaker = undefined;
    }
    await new Promise<void>((resolve) => runner.leave(resolve));
    this.host.npcManager?.setKindAway('astronaut', false);
    quest.ironFromAnvil();
    this.host.save.persistAdventure();
    this.host.actions.actionButtons?.setVisible(true);
    this.host.cutsceneActive = false;
  }

  /**
   * O Z NA LAJE VAZIA: põe nela o item SELECIONADO na bolsa (o "secundário" — o que o X usaria).
   *
   * Devolve `false` quando não havia altar ali, quando ele já está ocupado (um lugar, uma peça) ou
   * quando não há nada selecionado — e nos três casos o gesto SEGUE para o golpe, que é o que
   * mantém o botão com uma frase só: o Z é a espada, e pôr uma coisa numa mesa é a exceção curta
   * que só existe enquanto a mesa está vazia.
   */
  public placeOnAltarAt(wx: number, wy: number): boolean {
    const altar = this.host.query.getAltarAt(wx, wy);
    if (!altar || altar.carrying !== null) return false;
    const kind = this.host.heldItem;
    if (kind === 'none') return false;
    if (!altar.place(kind)) return false;
    // `clearHeldItem` e não um `remove` solto: ele é quem sabe que uma tocha que sai da mão apaga.
    this.host.hand.clearHeldItem();
    getSoundManager().ui.playToolboxDeliver();
    this.host.save.persistAdventure();
    return true;
  }

  /**
   * O FORNO GUIA (pedido do autor): com o item que ele pede na mão, o Z o entrega — o item sai da mão e
   * entra pela boca; quando a receita fecha, ele ruge e devolve o resultado pela boca. Com outra coisa (ou
   * nada), o tranco de recusa e o herói pensa no que o forno pede. Nunca há escolha a fazer.
   */
  public feedFurnaceAt(furnace: FurnaceObject): boolean {
    const quest = this.host.questSetup.astronomerQuest;
    const need = quest?.furnaceNeed() ?? null;
    const held = this.host.heldItem;
    if (!quest || !need || held !== need || furnace.isBusy) {
      furnace.bump();
      getSoundManager().ui.playToolboxRefuse();
      if (need && held !== need) {
        const visual = ITEM_VISUAL_2D[need];
        this.host.bumps.heroThought?.show(visual.texture, visual.frame);
      }
      return true;
    }
    const from: [number, number] = [this.host.playerWorld.worldX, this.host.playerWorld.worldY];
    if (this.host.torch.heldOnFire) this.host.torch.extinguishTorch();
    this.host.inventory.remove(held, 1);
    this.host.carry.updateBackItem();
    furnace.swallow(held, from);
    getSoundManager().ui.playItemStash();
    const result = quest.feedFurnace(held);
    if (result.done) this.host.time.delayedCall(420, () => furnace.startHandSmelt(result.product, 1, [], from));
    this.host.save.persistAdventure();
    return true;
  }

  /** O balão do forno: o que ele pede, enquanto o herói está por perto e ele não está trabalhando. */
  public updateFurnaceAsk(delta: number): void {
    const ask = this.furnaceAsk;
    if (!ask) return;
    const oven = this.host.props.furnaces[0];
    if (oven) oven.kindled = this.host.questSetup.astronomerQuest?.furnaceKindled() ?? false;
    const need = this.host.questSetup.astronomerQuest?.furnaceNeed() ?? null;
    const near = oven && Math.hypot(oven.worldX - this.host.playerWorld.worldX, oven.worldY - this.host.playerWorld.worldY) <= 3.5;
    if (oven && need && near && !oven.isBusy && !this.host.dialog.dialogOpen) {
      const visual = ITEM_VISUAL_2D[need];
      ask.show(visual.texture, visual.frame);
    } else if (!near) {
      ask.clear();
    }
    ask.tick(delta);
  }

  /**
   * O FORNO — a reducao do minerio, que e a unica quimica de verdade deste jogo.
   *
   * A receita vem exclusivamente do catalogo e da mochila. O port serve apenas para pousar o
   * produto quando a animacao manual termina.
   */
  public updateFurnaces(delta: number): void {
    if (!this.host.props.furnaces.length) return;
    const port: FurnaceWorldPort = {
      put: (kind, x, y, units) => { this.host.groundItems.dropItem(kind, x, y, undefined, units); },
      occupied: (x, y) => this.host.query.isTileOccupied(x, y),
      // O mesmo vizinho livre que a bancada usa, escolhido pela distancia ate o heroi.
      landing: (x, y) => this.host.orders.deliveryTileAround(x, y),
      lit: () => getSoundManager().nature.playFurnaceIgnite(),
      breath: () => getSoundManager().nature.playFurnaceBreath(),
      delivered: () => getSoundManager().ui.playToolboxDeliver(),
    };
    for (const furnace of this.host.props.furnaces) {
      const effectsVisible = Math.hypot(
        furnace.worldX - this.host.playerWorld.worldX,
        furnace.worldY - this.host.playerWorld.worldY,
      ) <= 10;
      furnace.update(delta, port, effectsVisible);
    }
  }
}

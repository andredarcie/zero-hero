// O ESBARRÃO: o que o corpo faz ao encostar (o portão de bater) e o pensamento do herói sobre o que falta ali — com a
// pontinha do balão apontando quem tem a ferramenta.

import type { HeldItemKind } from '@/game/entities/ItemPickup';
import { isMushroomKind } from '@/game/fungi/fungi';
import { getSoundManager } from '@/game/audio/SoundManager';
import type { NpcKind } from '@/game/world/ScreenContent';
import { getNpcHome } from '@/game/world/WorldData';
import type { GameScene } from '../GameScene';
import { HeroThought } from '@/game/runtime/HeroThought';
import { ITEM_VISUAL_2D } from './sceneDefs';

/**
 * AS FERRAMENTAS ÚNICAS e quem as dá: a pontinha do balão aponta para lá (GameScene.uniqueItemSource). A foice não
 * tem quem dê (a Morte aparece onde o herói dorme): ela só ganha pontinha quando está largada no chão.
 */
const UNIQUE_TOOL_GIVERS: Partial<Record<HeldItemKind, NpcKind | null>> = {
  axe: 'businessMan',
  shovel: 'painter',
  bucket: 'painter',
  pickaxe: 'astronaut',
  knife: 'radiationSuit',
  scythe: null,
};

/** O que BodyBumps usa de GameScene. */
export type BodyBumpsHost = Pick<GameScene,
  'heldItem' | 'itemManager' | 'npcManager' | 'playerWorld' | 'query' | 'questSetup' | 'steps' | 'swing'
  | 'torch'
>;

export class BodyBumps {
  /** O balao de PENSAMENTO do heroi: um icone, um instante. Ver HeroThought. */
  public heroThought?: HeroThought;

  public constructor(private readonly host: BodyBumpsHost) {}

  /**
   * O ESBARRAO, so com gestos de CORPO: abrir o portao de bater e pensar no que falta (o cogumelo
   * sem faca). Nada mais acontece por encostar: falar, sentar e usar sao botoes. E o que o corpo faz
   * contra uma trava e o que sempre fez: um tremor, nunca uma legenda.
   */
  public handlePlayerBump(wx: number, wy: number): void {
    // A bump interrupts movement and re-pins the hero to screen centre. The idle breathing
    // pose parks the sprite on a bottom origin with a compensating y-offset, so that repin
    // must happen from the canonical centre origin — otherwise the hero visibly jumps up
    // half a tile. Bumps aren't steps, so nothing else stops breathing here.
    this.host.steps.stopBreathing();

    // O COGUMELO NASCENDO sem faca na mochila: o heroi PENSA nela (a Shui tem uma). O icone,
    // nunca a palavra — a mesma lingua da fogueira do fim.
    if (isMushroomKind(this.host.itemManager?.kindAt(wx, wy)) && this.host.heldItem !== 'knife') {
      this.thinkOfNeed(wx, wy, false);
      return;
    }

    // (FALAR SAIU DAQUI. O esbarrao abria o dialogo, e com isso conversar era a unica coisa do jogo
    // que acontecia sem ninguem ter pedido: bastava a seta encostar no NPC — atravessando um vao,
    // fugindo de uma caveira, tentando contornar o velho pra chegar na fogueira — e a tela parava.
    // Hoje falar e o botao B, como usar qualquer coisa (ver `talkToNpcAt`). O esbarrao continua
    // fazendo o que faz com toda parede: VIRA o heroi para o NPC, que e justamente o gesto de mira
    // que o B precisa. E a afordancia ja existia e nao custou nada — o "!" que flutua sobre quem tem
    // assunto novo agora aponta para um botao em vez de descrever um acidente.)

    // Portao de bater — a porta sem chave, e o unico bloqueio que o CORPO abre. Ele gira para o
    // lado de la, entao qualquer coisa parada no tile atras dele trava tudo, e o sentido do
    // esbarrao (nao uma rotacao autorada) e quem diz onde e "o lado de la".
    const gate = this.host.query.getSwingGateAt(wx, wy);
    if (gate?.blocking) {
      const dx = Math.sign(wx - this.host.playerWorld.worldX);
      const dy = Math.sign(wy - this.host.playerWorld.worldY);
      if (this.host.query.isTileOccupied(wx + dx, wy + dy)) {
        gate.refuse();
        getSoundManager().story.playGateStrain();
      } else {
        gate.swingOpen();
        getSoundManager().story.playGateSwing();
      }
      return;
    }

    // Fogueira: o esbarrao so faz a chama reagir. A LOJA que abria aqui foi removida por
    // inteiro, e depois dela a MOEDA que a alimentava — o jogo nao tem dinheiro nenhum.
    // Acender, apagar e reabastecer a tocha vivem no botao B.
    const campfire = this.host.query.getCampfireAt(wx, wy);
    if (campfire) {
      campfire.onHit();
      return;
    }

    // Tudo o mais responde FISICAMENTE, e so: a rocha estremece, a porta chacoalha, a bancada
    // sacode as ferramentas la dentro. O corpo nunca diz o que falta.
    this.bumpRefusal(wx, wy);
  }

  /**
   * A recusa fisica de uma trava. E o que sobra do esbarrao depois que os itens foram para o
   * botao B: o mundo responde ao corpo, sem nunca dizer qual e a chave (o balao de
   * item-que-falta foi arrancado do jogo e nao volta por esta porta).
   */
  /**
   * O QUE FALTA NA MÃO PARA AGIR NESTE TILE, ou nada. É a única resposta do jogo a essa pergunta: o
   * balão (`thinkOfNeed`) lê daqui, e uma trava nova é uma linha aqui.
   *
   * `pressed` separa o botão do esbarrão: andar pela margem de um lago ou por cima de um buraco não é
   * querer um balde nem uma semente, então esses dois só respondem a quem apertou.
   */
  private neededAt(wx: number, wy: number, pressed: boolean): HeldItemKind | 'torch' | null {
    const held = this.host.heldItem;
    const quest = this.host.questSetup.painterQuest?.neededAt(wx, wy) ?? this.host.questSetup.lumberQuest?.neededAt(wx, wy) ?? this.host.questSetup.astronomerQuest?.neededAt(wx, wy);
    if (quest) return quest;
    // o forno pede o próximo item da quest; com ele na mão, não falta nada
    if (this.host.query.getFurnaceAt(wx, wy)) {
      const need = this.host.questSetup.astronomerQuest?.furnaceNeed();
      return need && held !== need ? need : null;
    }
    if (isMushroomKind(this.host.itemManager?.kindAt(wx, wy))) return held === 'knife' ? null : 'knife';
    if (this.host.query.getDryTreeAt(wx, wy)?.blocking || this.host.query.getDryShrubAt(wx, wy)?.blocking) return this.host.swing.holdsAnAxe ? null : 'axe';
    if (this.host.query.getRockAt(wx, wy)?.blocking) return held === 'pickaxe' ? null : 'pickaxe';
    if (this.host.query.getLockedDoorAt(wx, wy)?.blocking) return held === 'key' ? null : 'key';
    if (this.host.query.getDryBushAt(wx, wy)?.blocking) return this.host.torch.heldOnFire ? null : 'torch';
    const grass = this.host.query.getTallGrassAt(wx, wy);
    if (grass?.blocking && grass.isTall) return held === 'scythe' || this.host.torch.heldOnFire ? null : 'scythe';
    const spot = this.host.query.getPlantSpotAt(wx, wy);
    if (spot?.isMound) return held === 'bucketFull' ? null : 'bucketFull';
    if (!pressed) {
      const bridge = this.host.query.getWaterAt(wx, wy);
      return bridge?.blocking && bridge.canBuild && held !== 'wood' && held !== 'stone' ? 'wood' : null;
    }
    const hearth = this.host.query.getHearthAt(wx, wy);
    if (hearth) return hearth.isLit && held !== 'wood' ? 'wood' : null;
    const fire = this.host.query.getCampfireAt(wx, wy);
    if (fire) return fire.isLit || fire.isHeldCold || this.host.torch.heldOnFire ? null : 'torch';
    const water = this.host.query.getWaterAt(wx, wy);
    if (water?.blocking && water.canBuild) return held === 'wood' || held === 'stone' || held === 'bucket' ? null : 'wood';
    if (water?.blocking || this.host.query.isOpenWaterAt(wx, wy)) return held === 'bucket' || held === 'bucketFull' ? null : 'bucket';
    return null;
  }

  /** O herói pensa no que falta, se faltar alguma coisa. */
  public thinkOfNeed(wx: number, wy: number, pressed: boolean): void {
    const need = this.neededAt(wx, wy, pressed);
    if (!need) return;
    const kind = need === 'torch' ? 'wood' : need;
    const visual = ITEM_VISUAL_2D[kind];
    this.heroThought?.show(visual.texture, visual.frame, this.uniqueItemSource(kind));
  }

  /**
   * ONDE ESTÁ A FERRAMENTA ÚNICA (pedido do autor): a pontinha do balão aponta para ela. Primeiro o chão (o herói
   * a largou em algum lugar, ou a trocou por outra), depois quem a dá. A foice não tem quem dê: a Morte aparece
   * onde o herói dorme, então sem pontinha até ela estar no chão.
   */
  private uniqueItemSource(kind: HeldItemKind): { x: number; y: number } | null {
    if (!(kind in UNIQUE_TOOL_GIVERS)) return null;
    const hero = this.host.playerWorld;
    const onGround = (this.host.itemManager?.snapshot() ?? [])
      .filter((item) => item.kind === kind)
      .sort((a, b) => Math.hypot(a.worldX - hero.worldX, a.worldY - hero.worldY) - Math.hypot(b.worldX - hero.worldX, b.worldY - hero.worldY))[0];
    if (onGround) return { x: onGround.worldX, y: onGround.worldY };
    const giver = UNIQUE_TOOL_GIVERS[kind];
    if (!giver || this.host.npcManager?.isKindHidden(giver)) return null;
    const home = getNpcHome(giver);
    return home ? { x: home.worldX, y: home.worldY } : null;
  }

  private bumpRefusal(wx: number, wy: number): void {
    this.thinkOfNeed(wx, wy, false);
    const toolbox = this.host.query.getToolboxAt(wx, wy);
    if (toolbox) { toolbox.bump(); getSoundManager().ui.playToolboxRefuse(); return; }

    const furnace = this.host.query.getFurnaceAt(wx, wy);
    if (furnace) { furnace.bump(); getSoundManager().ui.playToolboxRefuse(); return; }

    this.host.query.getRockAt(wx, wy)?.shake();
    this.host.query.getDryTreeAt(wx, wy)?.shake();
    this.host.query.getDryShrubAt(wx, wy)?.shake();
    this.host.query.getDryBushAt(wx, wy)?.shake();
    this.host.query.getMoonflowerAt(wx, wy)?.shake();
    this.host.query.getLockedDoorAt(wx, wy)?.shake();
    const grass = this.host.query.getTallGrassAt(wx, wy);
    if (grass?.blocking && grass.isTall) grass.shake();
  }
}

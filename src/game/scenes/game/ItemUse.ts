// A TABELA DE ITENS (o botão A): o que o item na mão faz contra o tile à frente — primeiro a pintura, o cogumelo, o
// altar e as estações; depois a fogueira e a lava, o rio, o arbusto, a árvore e a moita.

import { profiler } from '@/game/debug/Profiler';
import { CHOP_IMPACT_MS } from '@/game/runtime/SwordOrbit';
import type { GameScene } from '../GameScene';

/** O que ItemUse usa de GameScene. */
export type ItemUseHost = Pick<GameScene,
  'fire' | 'forage' | 'forge' | 'groundItems' | 'hand' | 'heldItem' | 'machines' | 'playerWorld' | 'query'
  | 'questSetup' | 'sparkle' | 'swing' | 'time' | 'torch' | 'useGround' | 'water'
>;

export class ItemUse {
  public constructor(private readonly host: ItemUseHost) {}

  /**
   * A TABELA DE ITENS — o que cada coisa na mao faz contra o tile a frente. Ela era o corpo do
   * esbarrao, depois foi o botao B; hoje ela e o BOTAO A ("o botao de acao usa o item
   * segurado" — ver swingAttack, que ja pagou cadencia, raiz, investida e pose antes de chamar
   * aqui). O esbarrao ficou so com os gestos de CORPO (handlePlayerBump); o B ficou com pegar,
   * falar e pousar.
   *
   * Devolve true quando o item fez alguma coisa — inclusive quando ele foi RECUSADO por uma
   * regra do proprio prop (uma agua que nao aceita ponte ali). Falso significa "este tile nao
   * tem nada a ver com o que voce esta segurando" — e ai o swingAttack faz o arco sair no
   * VAZIO (a lei do A). Pousar nao e mais o fallback disto: pousar mora no B.
   */
  public useItemAt(wx: number, wy: number): boolean {
    if (this.host.questSetup.painterQuest?.useAt(wx, wy)) return true;
    // O COGUMELO NASCENDO vem primeiro: a faca e a resposta, e `equipToolFor` ja a sacou.
    if (this.host.forage.harvestMushroomAt(wx, wy)) return true;
    // A PEÇA NO ALTAR, pela mesma regra e no mesmo degrau: se a laje segura algo que a pancada
    // TRABALHA, o X é uma pancada — não importa o que esteja na mão (a picareta, o machado, uma
    // pedra), porque malhar não é usar uma ferramenta, é bater. O que ela segura e a pancada não
    // trabalha cai adiante, na ENTREGA, onde o X vira o gesto de tirar de volta: assim todo aperto
    // contra o altar faz alguma coisa, e o jogador nunca fica com uma peça presa na mesa.
    if (this.host.query.getAltarAt(wx, wy)?.carrying && this.host.forge.workAltarAt(wx, wy)) return true;
    // INSTALAR UMA ESTAÇÃO é usar — a tabela inteira já é "o que este item faz contra o tile à
    // frente", e forno/altar viram props no chão.
    // Não é um modo de construção, não é um menu, não é um botão novo — é a mesma linha da tabela
    // em que mora o machado contra a árvore. (Recolher é o mesmo X, depois que a tabela cala.)
    if (this.host.machines.buildMachineAt(wx, wy)) return true;

    // A ESPONJA se pousa para ser martelada; o resto da mochila age contra o tile.
    const held = this.host.heldItem;
    if (held === 'bloom') return this.host.hand.placeItemAt(wx, wy);

    // OS DEGRAUS, na ordem de sempre: o primeiro que reconhece o tile responde (true OU false), e um degrau que não
    // tem nada a ver com o tile devolve `undefined` e passa adiante.
    return this.useOnFire(wx, wy) ?? this.useOnWater(wx, wy) ?? this.useOnBrush(wx, wy)
      ?? this.host.useGround.useOnStoneAndPlants(wx, wy) ?? this.host.useGround.useOnDoorAndGround(wx, wy) ?? false;
  }

  /** A fogueira e a lava: acender, reabastecer, apagar com o balde, afundar a pedra. `undefined` = não é com este degrau (ver useItemAt). */
  private useOnFire(wx: number, wy: number): boolean | undefined {
    // Campfire interaction. A LIT fire relights/refuels the carried torch; a DEAD fire is
    // brought back to life by carrying a flame into it (the heart of the game).
    const campfire = this.host.query.getCampfireAt(wx, wy);
    if (campfire) {
      if (campfire.isLit) {
        if (this.host.heldItem === 'bucketFull') {
          // Throw the bucket of water on the fire — the water leaves the bucket with the swing,
          // ARCS across as a slug of droplets, and the fire hisses out when it LANDS. The one
          // deliberate way to UNDO a fire (one use, then back to the river).
          this.host.swing.swingHeld(wx, wy);
          this.host.time.delayedCall(120, () => {
            this.host.water.throwBucketWater(wx, wy, () => this.host.water.douseCampfire(campfire, wx, wy));
          });
        } else if (this.host.torch.isFlammableHeld) {
          this.host.swing.swingHeld(wx, wy);
          // Light the torch at the fire, or top it back up if it's already burning.
          if (!this.host.torch.heldOnFire) this.host.time.delayedCall(150, () => { this.host.torch.igniteHeldItem(); });
          else this.host.torch.refuelTorch();
        } else {
          // Qualquer outro item na fogueira acesa nao faz nada: SENTAR nela (a loja) e um gesto
          // de corpo e mora no esbarrao — ver handlePlayerBump.
          return false;
        }
      } else if (this.host.torch.isFlammableHeld && this.host.torch.heldOnFire) {
        // Carry the flame into a dead campfire to reignite the world.
        this.host.swing.swingHeld(wx, wy);
        this.host.time.delayedCall(150, () => { this.host.fire.lightCampfire(campfire, wx, wy); });
      }
      return true;
    }

    // LAVA é fogo que não apaga: o graveto acende nela, de dia ou de noite (a fogueira comum só
    // arde de noite). E ela bloqueia até uma PEDRA afundar e virar chão: a pedra vai embora, e o
    // tile só se pisa depois que ela assentou.
    const lava = this.host.query.getLavaAt(wx, wy);
    if (lava && !lava.solidified) {
      if (!lava.cooling) {
        if (this.host.heldItem === 'stone') {
          this.host.swing.swingHeld(wx, wy);
          this.host.hand.clearHeldItem();
          this.host.time.delayedCall(150, () => { this.host.torch.solidifyLava(lava, wx, wy); });
        } else if (this.host.torch.isFlammableHeld) {
          this.host.swing.swingHeld(wx, wy);
          if (!this.host.torch.heldOnFire) this.host.time.delayedCall(150, () => { this.host.torch.igniteHeldItem(); });
          else this.host.torch.refuelTorch();
        }
      }
      return true;
    }
    return undefined;
  }

  /** O rio e a água do terreno: encher o balde, a ponte de gravetos, o vau de pedra. `undefined` = não é com este degrau (ver useItemAt). */
  private useOnWater(wx: number, wy: number): boolean | undefined {
    // River — only tiles marked with a `bridgeSpot` are buildable. Two things can span it, and
    // WHICH you choose is a real decision, not a formality:
    //   - two gravetos build a plank deck. It is wood: fire runs across it (and eats it).
    //   - ONE stone fords it. Cheaper, instant, permanent — and fire stops dead at it.
    // A floor, or a fuse. Plain river tiles just block (no interaction).
    const water = this.host.query.getWaterAt(wx, wy);
    if (water?.blocking) {
      if (this.host.heldItem === 'bucket') {
        // Dip the empty bucket in the river to fill it — works on ANY river tile, not just a
        // bridgeSpot (you are drawing water, not building). The full bucket douses a campfire.
        this.host.water.fillBucket(wx, wy);
      } else if (water.canBuild) {
        if (this.host.heldItem === 'stone') {
          this.host.hand.clearHeldItem(); // the stone goes into the river
          water.placeStone();
        } else if (this.host.heldItem === 'wood') {
          this.host.hand.clearHeldItem(); // the graveto is consumed
          // WaterObject owns the carpentry now: it nails this deposit's boards in with hammer
          // beats + sawdust, and cross-fades to the finished tile (firing onBuilt) on the last.
          water.deposit();
        }
      }
      return true;
    }

    // A OUTRA PROCEDÊNCIA da água: a pintada no TERRENO (SEA_TILE_FRAMES — é assim que o
    // overworld escreve TODO rio, lago e oceano). O balde enchia só no rio-prop, e esse era o
    // gesto MUDO da aventura: B mirando a água do mundo grande não fazia nada (o pousar recusa
    // em silêncio porque o mar bloqueia) — e sem encher o balde, regar um canteiro era
    // impossível fora dos levels: a fazenda inteira nascia trancada no modo principal.
    // `isOpenWaterAt` é a resposta ÚNICA para as duas procedências (a lição do zora) — e uma
    // ponte, um vau ou um canal drenado deixam de ser água em cima dela, como têm de deixar.
    if (this.host.heldItem === 'bucket' && this.host.query.isOpenWaterAt(wx, wy)) {
      this.host.water.fillBucket(wx, wy);
      return true;
    }
    return undefined;
  }

  /** O que o fogo e o machado abrem: o arbusto seco, a árvore seca, a moita. `undefined` = não é com este degrau (ver useItemAt). */
  private useOnBrush(wx: number, wy: number): boolean | undefined {
    // Dry bush — a flaming item sets it alight; it chars to ash and opens the tile.
    const bush = this.host.query.getDryBushAt(wx, wy);
    if (bush?.blocking) {
      bush.shake();
      // O GRAVETO APAGADO É O ÚNICO CASO EM QUE O HERÓI PENSA ALTO. Ele bateu no arbusto com a
      // coisa certa na mão e não aconteceu nada — e a distância entre o que ele tem e o que ele
      // precisa é UM gesto (acender numa fogueira, na lava, num arbusto já em chamas). Isto não é
      // o balão de item-que-falta que foi arrancado: aquele respondia a qualquer fechadura e
      // entregava a solução de um enigma; este só existe quando o item JÁ ESTÁ NA MÃO e o gesto
      // JÁ FOI FEITO. Sem ele o jogo respondia com um tremor idêntico ao de "isto é uma parede",
      // e as duas coisas não são a mesma — uma diz "não é aqui", a outra diz "falta uma faísca".
      if (this.host.torch.isFlammableHeld && this.host.torch.heldOnFire) {
        this.host.swing.swingHeld(wx, wy);
        // Ignite when the flame reaches the bush (end of the main swing arc).
        this.host.time.delayedCall(150, () => {
          if (!bush.ignite()) return;
          profiler.mark('bush.ignite');
          this.host.sparkle.spawnFireHitEffect(wx, wy);
          this.host.fire.scheduleFireSpread(wx, wy); // it will carry to whatever is touching it
        });
      }
      return true;
    }

    // Dry tree — the axe chops it down stage by stage until only a stump is left. On the
    // felling chop: if water lies beyond in the chop direction, TIMBER! — the trunk topples
    // across the river as a free log bridge. Otherwise it just drops a graveto on the ground.
    const tree = this.host.query.getDryTreeAt(wx, wy);
    if (tree?.blocking) {
      if (this.host.swing.holdsAnAxe) {
        this.host.swing.swingHeld(wx, wy);
        // Capture the chop direction now (the hero is stopped, but a queued key could shift it).
        const px = this.host.playerWorld.worldX;
        const py = this.host.playerWorld.worldY;
        this.host.time.delayedCall(CHOP_IMPACT_MS, () => {
          if (tree.chop()) {
            this.host.swing.axeBite(wx, wy);
            if (!tree.blocking) {
              if (this.host.water.tryTimberBridge(tree.worldX, tree.worldY, wx - px, wy - py)) {
                tree.cancelRegrow(); // its trunk became the bridge — no regrowth
              } else {
                this.host.groundItems.dropTreeStick(tree.worldX, tree.worldY);
              }
            }
          }
        });
      } else {
        tree.shake();
      }
      return true;
    }

    // Dry shrub — a small dead bush the axe clears in one hit. It drops nothing and never grows
    // back: purely a physical barrier.
    const shrub = this.host.query.getDryShrubAt(wx, wy);
    if (shrub?.blocking) {
      if (this.host.swing.holdsAnAxe) {
        this.host.swing.swingHeld(wx, wy);
        this.host.time.delayedCall(CHOP_IMPACT_MS, () => {
          if (shrub.chop()) this.host.swing.axeBite(wx, wy);
        });
      } else {
        shrub.shake();
      }
      return true;
    }
    return undefined;
  }
}

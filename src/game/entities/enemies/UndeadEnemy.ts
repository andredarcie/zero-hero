import Phaser from 'phaser';

import { ASSET_KEYS, SCENE_DEPTHS, UNDEAD_BORN_FRAME_KEYS } from '@/game/constants';
import { getSoundManager } from '@/game/audio/SoundManager';
import { EnemyBase } from '@/game/entities/EnemyBase';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { FX_CRACK_TEXTURE, FX_PUFF_TEXTURE, world3d } from '@/game/render3d/World3D';
import type { WorldCamera } from '@/game/runtime/WorldCamera';
import { enemyMaxHealth, type EnemyKind } from '@/game/world/ScreenContent';
import { BoneClub } from './BoneClub';

// Tres golpes (ver ENEMY_BLOWS). Ela e a REGUA: o corpo mais comum do mundo e o que ensina o
// telegrafo, entao o que ela custa vira a expectativa do jogador pra todo o resto do bestiario.
const MAX_HEALTH = enemyMaxHealth('undead');
const MOVE_INTERVAL = 520;
const ATTACK_INTERVAL = 1200;
/**
 * O golpe e TELEGRAFADO: estourado o relogio, a caveira nao fere — ela trava o tile em que o
 * heroi esta AGORA, marca o chao dele, avisa e bate meio segundo depois, naquele tile. Tempo de
 * sobra pra ler e sair de la (um passo leva ~230ms), e SAIR E A UNICA RESPOSTA: bater nela nao
 * cancela mais nada, e de frente nem entra (a guarda). A maquinaria toda mora no `EnemyBase` —
 * ver o bloco "O TELEGRAFO" la —, porque ela e identica a de todo bicho que arma um golpe, e
 * enquanto morou so no `WalkerEnemy` a caveira era a unica especie sem nada disso.
 */
const WINDUP_MS = 500;
// Skulls are summoned by the dark to hunt the hero, so they chase from farther than the
// old placed undead did (the spawn ring is 4-7 tiles out; see UndeadSpawnDirector).
// Exported because the pressure-plate lure uses the SAME radius: "what a skull can see" has to
// be one number, or the creature would notice a plate at a distance it cannot notice a hero.
export const DETECTION_RANGE = 14;
const BORN_FRAME_MS = 80;
/**
 * Antes de a caveira existir na tela, o CHÃO a telegrafa: fissuras frias abrem no tile e a poeira
 * sobe. O aviso continua sendo um aviso — a resposta a ele é sair de cima —, mas ele foi de 3s
 * para 1,4s a pedido do jogador, e a conta fecha: um passo custa ~150ms, então 1,4s ainda são
 * NOVE passos de folga para deixar o tile. Três segundos não davam mais tempo de fugir do que
 * isso; davam tempo de esperar, que é outra coisa — e num cerco de quatro covas abrindo em
 * sequência, esperar três segundos por cada uma é o que fazia a pressão do escuro parecer lenta.
 *
 * O nascimento em si (`BORN_FRAME_MS`) encurtou junto, de 110 para 80ms por frame: o gesto de sair
 * do chão passou de 770ms para 560. Somados, um nascimento inteiro caiu de 3,8s para 2,0s.
 */
const TELEGRAPH_MS = 1400;
// The fissure widens in discrete SNAPS (pixel-art: stages, never a smooth scale tween).
const CRACK_STAGE_SIZES = [0.45, 0.7, 0.95] as const;
const CRACK_TINT = 0x8fa8ff; // the cold pale blue of everything undead (deflect ring, wisps)
// A cadência da poeira acompanha o aviso encurtado: com 240ms num telegrafo de 1,4s sairiam seis
// baforadas, e a fenda ficaria com o mesmo ritmo de antes num tempo menos da metade — o que lê
// como uma animação acelerada, não como um aviso mais curto.
const DUST_INTERVAL_MS = 150;
const DUST_TINT = 0x9a9284; // dry earth being pushed up from below
// Once the hero steps into a campfire's safety the pack crumbles back into the ground,
// staggered per skull so the horde doesn't vanish in a single frame.
const SUNSET_MIN_MS = 1800;
const SUNSET_MAX_MS = 4800;

// A blow from the hero SNAPS the skull out of a pressure-plate fixation and keeps it out for
// this long: whatever it wanted, the thing hitting it is the problem now. Without the window it
// would re-fixate on the very next frame and the player's only counter-play would do nothing.
const PLATE_BLIND_AFTER_HIT_MS = 6000;
// The march to a plate is greedy (moveToward has no pathfinder), so a wall between skull and
// plate is a real possibility. If it goes this long without getting any closer it gives up and
// goes plate-blind for the same window — a balloon over a creature grinding against a rock is
// a promise the world isn't keeping.
const PLATE_PATIENCE_MS = 5000;
// The balloon over the head: size in tiles, and the elevation its CENTRE is projected at. The
// skull's own billboard is 1 tile tall, so anything under ~1.3 buries the trailing bubbles in its
// skull and anything over ~1.6 cuts the balloon loose from the creature it belongs to.
const THOUGHT_SIZE_TILES = 1.05;
const THOUGHT_ELEVATION_TILES = 1.45;

/**
 * O DESMONTE — em quantas peças ela se parte, e como elas voam (ver `onCrumble`).
 *
 * Um esqueleto tem a morte mais óbvia que existe, e ela não estava sendo usada: a caveira sumia com
 * o gesto genérico do `EnemyBase` (incha e some girando), que serve para qualquer corpo justamente
 * porque não diz nada sobre nenhum. A espécie mais vista do jogo morria com a menor frase dele.
 */
const PIECE_COUNT = 4;
const PIECE_SIZE = 0.34;
/** O quanto uma peça se afasta do corpo, em tiles, e a altura do arco que ela descreve. */
const PIECE_SPREAD = 0.5;
const PIECE_PEAK = 0.72;
/** Subir é rápido (a pancada joga), cair é o dobro (a gravidade demora). */
const PIECE_RISE_MS = 210;
const PIECE_FALL_MS = 360;
/** Quanto a peça ainda fica no chão depois de pousar, antes de o escuro levá-la. */
const PIECE_LINGER_MS = 240;

export class UndeadEnemy extends EnemyBase {
  protected override hurtTexture = ASSET_KEYS.undeadHurt;

  private moveTimer: number;
  private attackTimer: number;
  // Spawn runs in two phases, both under `spawning` (tile occupied, invulnerable, inert):
  // 1. telegraph — the skull is INVISIBLE; a fissure cracks open and dust kicks up (the warning);
  // 2. born — the claw-out animation (undead_born0..6).
  private spawning = true;
  private telegraphTimer = 0;
  private crackStage = -1;
  private crack?: Billboard3D;
  private dustTimer = 0;
  private bornFrame = 0;
  private bornTimer = 0;
  private sunsetTimer = 0;
  private readonly sunsetDelay: number;
  // The pressure-plate fixation. EnemyManager owns the assignment (one skull per plate); the
  // skull owns what it DOES about it: it stops hunting the hero entirely and marches there.
  private plate?: { x: number; y: number };
  private plateBlindMs = 0;
  private plateStallMs = 0;
  private plateBestDist = Infinity;
  private thought?: Phaser.GameObjects.Container;
  private thoughtTween?: Phaser.Tweens.Tween;
  /**
   * O OSSO NA MÃO — a arma dela (ver BoneClub). Ela telegrafava o golpe com um clarão, uma pose
   * recuada e um anel no chão, e batia com NADA: o corpo que ensinou o combate deste jogo era o
   * único que acertava com a mão vazia.
   */
  private bone?: BoneClub;

  /**
   * O que ELA deixa no chao ao cair — a ossada (ver CorpseDecals). Vem de fora pelo mesmo motivo
   * que o `splitter` do slime grande: quem sabe quantas ossadas o mundo aguenta e o dono da lista,
   * nao o corpo que acabou de morrer. Opcional porque um teste pode fazer uma caveira sozinha.
   */

  public constructor(
    scene: Phaser.Scene,
    worldX: number,
    worldY: number,
  ) {
    const sprite = world3d()
      .addBillboard(UNDEAD_BORN_FRAME_KEYS[0], 0, { groundShadow: { rx: 0.36, rz: 0.34, alpha: 0.32 } })
      .setPosition(worldX, worldY)
      .setDisplaySize(1, 1);

    super(scene, worldX, worldY, MAX_HEALTH, sprite);

    // Through the telegraph the cracking ground is the only actor — the skull stays hidden.
    this.sprite.setVisible(false);
    this.crack = world3d()
      .addBillboard(FX_CRACK_TEXTURE, 0, { flat: true, flatY: 0.03, additive: true, fog: false, depthWrite: false })
      .setTint(CRACK_TINT)
      .setPosition(worldX, worldY)
      .setFlipX(Math.random() < 0.5);
    this.applyCrackStage(0);

    // A arma nasce junto e fica ESCONDIDA: durante a fenda e a saída do chão o corpo ainda não
    // existe na tela, e um osso pairando sozinho sobre uma rachadura entregaria o bicho antes do
    // tempo — a chegada é o telegrafo mais longo do jogo justamente para dar tempo de fugir dela.
    this.bone = new BoneClub(scene, worldX, worldY);
    this.bone.setVisible(false);

    this.moveTimer = Phaser.Math.Between(0, MOVE_INTERVAL);
    this.attackTimer = Phaser.Math.Between(0, ATTACK_INTERVAL);
    this.sunsetDelay = Phaser.Math.Between(SUNSET_MIN_MS, SUNSET_MAX_MS);
  }

  protected override get normalTexture(): string {
    return ASSET_KEYS.undead;
  }

  public override get kind(): EnemyKind {
    return 'undead';
  }

  public override get isSpawning(): boolean {
    return this.spawning;
  }

  /**
   * A CAVEIRA NÃO ESCURECE COM O DANO — e ela é a única espécie que não escurece.
   *
   * `woundedShade` é a substituta da barra de vida deste jogo: o corpo perde brilho conforme perde
   * vida (ver EnemyBase). A ideia está certa e funciona no resto do bestiário, mas ela é
   * multiplicativa — e multiplicar castiga exatamente quem já é claro. A arte da caveira é osso
   * (#b5b5b5), o tom mais claro do bestiário inteiro, e no último ponto de vida ela caía de **71%
   * para 32% de luminância**: menos da metade do brilho, num mundo que a graduação de noite já
   * escurece. O resultado era o inimigo mais comum do jogo ficando difícil de ver justamente
   * quando está prestes a morrer — que é o instante em que se precisa mais enxergá-lo.
   *
   * O que ela perde é o estado PERSISTENTE de vida. O que continua contando o dano nela: a troca de
   * textura a cada golpe (`undeadHurt`), a piscada dos i-frames, o arremesso e o atordoamento — e,
   * com 3 de vida contra 2 de espadada, são dois acertos até cair. É pouca informação a perder por
   * um corpo que volta a ser legível.
   *
   * Devolver a base intacta é o suficiente para desligar tudo: `restoreTint` (aqui e na base)
   * decide entre `clearTint` e `setTint` lendo justamente este valor — corpo e osso juntos.
   */
  protected override woundedShade(base = 0xffffff): number {
    return base;
  }

  /**
   * A ARMA ACOMPANHA O CORPO. Ela não escurece (ver acima), mas o caminho continua ligado: qualquer
   * tom que o corpo passe a ter — hoje nenhum — tem de valer para o osso também, ou a peça mais
   * visível do gesto de ameaça seria a única da silhueta com cor própria.
   */
  protected override restoreTint(): void {
    super.restoreTint();
    const shade = this.woundedShade();
    if (shade === 0xffffff) this.bone?.clearTint();
    else this.bone?.setTint(shade);
  }

  /**
   * True while this skull is available to be pulled onto a pressure plate. EnemyManager owns
   * WHICH plate (one body per plate, or a second skull would stand beside a taken one wanting
   * forever); the skull owns what it does about it.
   */
  public override get seeksPlates(): boolean {
    return this.isAlive && !this.spawning && this.plateBlindMs <= 0;
  }

  /** The plate this skull is marching to — the thing the balloon over its head is showing. */
  public override get plateTarget(): { x: number; y: number } | undefined {
    return this.plate;
  }

  public override setPlateTarget(target?: { x: number; y: number }): void {
    if (!this.plate && !target) return;
    if (this.plate && target && this.plate.x === target.x && this.plate.y === target.y) return;
    this.plate = target ? { x: target.x, y: target.y } : undefined;
    this.plateStallMs = 0;
    this.plateBestDist = target
      ? Math.abs(target.x - this.worldX) + Math.abs(target.y - this.worldY)
      : Infinity;
    if (target) this.showThought();
    else this.hideThought();
  }

  // Invulnerable while clawing out of the ground.
  public override takeDamage(amount = 1): boolean {
    if (this.spawning) return false;
    // O GOLPE ARMADO NAO SE CANCELA MAIS. Um acerto do heroi zerava o windup aqui, e isso caiu
    // junto com a mesma regra no andarilho e na conjuracao do mago: com dano real, trancar um
    // corpo em interrupcao vira a estrategia dominante do jogo — bata a cada 260ms e nada nunca
    // chega a bater em voce. A resposta ao telegrafo volta a ser SAIR DO TILE MIRADO.
    //
    // O que o golpe AINDA faz e arrancar a fixacao de placa: whatever the skull wanted, the thing
    // hitting it is the problem now. The blind window is what makes this real counter-play —
    // without it the manager would hand the plate straight back on the next frame and the blow
    // would mean nothing. Note this is the hero's ONLY lever on the lure.
    this.plateBlindMs = PLATE_BLIND_AFTER_HIT_MS;
    this.setPlateTarget(undefined);
    return super.takeDamage(amount);
  }

  public override update(
    delta: number,
    playerWorldX: number,
    playerWorldY: number,
    playerSafe: boolean,
    playerHasTorch: boolean,
    isBlocked: (wx: number, wy: number) => boolean,
  ): boolean {
    if (!this.isAlive) return false;

    if (this.spawning) {
      // Phase 1 — the telegraph: fissures + dust only; the skull itself doesn't exist yet.
      if (this.telegraphTimer < TELEGRAPH_MS) {
        this.telegraphTimer += delta;
        this.applyCrackStage(Math.min(
          CRACK_STAGE_SIZES.length - 1,
          Math.floor((this.telegraphTimer / TELEGRAPH_MS) * CRACK_STAGE_SIZES.length),
        ));
        this.dustTimer += delta;
        if (this.dustTimer >= DUST_INTERVAL_MS) {
          this.dustTimer = 0;
          this.spawnDustPuff();
        }
        if (this.telegraphTimer < TELEGRAPH_MS) return false;
        // Phase 2 — the ground gives way: the skull appears and starts clawing out.
        // Fora do quadro a garra sai muda (o mesmo contrato do estrondo da cova): som de
        // nascimento é aviso, e aviso sem plateia é só barulho de bicho invisível.
        this.sprite.setVisible(true);
        if (this.framed) getSoundManager().playUndeadSpawn();
        this.fadeOutCrack();
      }

      this.bornTimer += delta;
      while (this.bornTimer >= BORN_FRAME_MS && this.spawning) {
        this.bornTimer -= BORN_FRAME_MS;
        this.bornFrame += 1;
        if (this.bornFrame >= UNDEAD_BORN_FRAME_KEYS.length) {
          this.spawning = false;
          this.sprite.setTexture(this.normalTexture);
          // De pé e armada: o osso aparece com o corpo, nunca antes dele.
          this.bone?.setVisible(true);
        } else {
          this.sprite.setTexture(UNDEAD_BORN_FRAME_KEYS[this.bornFrame]);
        }
      }
      return false;
    }

    // The hero found a fire: this skull's time is up. It keeps fighting until its own
    // staggered timer runs out, then crumbles (despawn — no loot).
    if (playerSafe) {
      this.sunsetTimer += delta;
      if (this.sunsetTimer >= this.sunsetDelay) {
        this.despawn();
        return false;
      }
    } else {
      this.sunsetTimer = 0;
    }

    if (this.plateBlindMs > 0) this.plateBlindMs = Math.max(0, this.plateBlindMs - delta);

    // ATORDOADA: o golpe que ela levou ainda e dono deste corpo — ver EnemyBase.applyHitstun.
    // Fica depois do por-do-sol e da cegueira de placa de proposito: os dois sao relogios do
    // MUNDO (o heroi achou uma fogueira, o golpe passou), e nao acoes que ela toma.
    if (this.tickHitstun(delta)) return false;

    // Mid-wind-up: committed to the strike — no moving, no re-arming. When the countdown ends the
    // blow lands ONLY if the hero is still on the tile it locked onto (stepping off is a dodge)
    // and the tile is still within reach — being shoved a tile back by a blow makes it whiff. A
    // fixation that arrives mid-wind-up does NOT cancel it: the skull already committed.
    // Ver EnemyBase.tickWindup: a maquinaria e a mesma de todo bicho que arma um golpe.
    const windup = this.tickWindup(delta, playerWorldX, playerWorldY, playerHasTorch);
    if (windup !== 'idle') return windup === 'strike';

    // FIXATED ON A PLATE: for as long as this lasts the hero simply stops existing. The skull
    // does not chase him, does not back away from his torch and does not strike even from an
    // adjacent tile — it walks to the plate and stands on it. That is the whole trade the piece
    // offers: the plate wants a BODY, and a skull is a body that walks to it on its own, so a
    // plate near the dark is a switch the player throws by leading a monster to it. Only a blow
    // buys the skull's attention back (see takeDamage).
    if (this.plate) {
      const reached = this.worldX === this.plate.x && this.worldY === this.plate.y;
      if (reached) {
        // Arrived: it stands there. Not a pause before something else — the standing IS the
        // behaviour, and a skull that wandered off the plate would make the circuit strobe.
        this.plateStallMs = 0;
        return false;
      }
      this.moveTimer += delta;
      if (this.moveTimer >= MOVE_INTERVAL) {
        this.moveTimer = 0;
        this.moveToward(this.plate.x, this.plate.y, isBlocked);
      }
      // moveToward is greedy (there is no pathfinder in this game), so a rock or a river between
      // skull and plate is a dead march. Measure PROGRESS, not time: as long as it keeps getting
      // closer it can take as long as it likes; the moment it stops closing the gap the patience
      // clock runs, and when it expires the skull gives up and goes plate-blind for a while.
      const gap = Math.abs(this.plate.x - this.worldX) + Math.abs(this.plate.y - this.worldY);
      if (gap < this.plateBestDist) {
        this.plateBestDist = gap;
        this.plateStallMs = 0;
      } else {
        this.plateStallMs += delta;
        if (this.plateStallMs >= PLATE_PATIENCE_MS) {
          this.plateBlindMs = PLATE_BLIND_AFTER_HIT_MS;
          this.setPlateTarget(undefined);
        }
      }
      return false;
    }

    const dx = playerWorldX - this.worldX;
    const dy = playerWorldY - this.worldY;
    const dist = Math.abs(dx) + Math.abs(dy);

    // O INSTANTE DE NOTAR (ver EnemyBase.noteSeesHero). Fica DEPOIS da fixacao de placa de
    // proposito: enquanto marcha, o heroi nao existe para ela — e o susto de reave-lo depois de
    // um golpe quebrar a fixacao e honesto: a pancada comprou exatamente essa atencao.
    this.noteSeesHero(dist <= DETECTION_RANGE, delta);

    this.moveTimer += delta;
    if (this.moveTimer >= MOVE_INTERVAL) {
      this.moveTimer = 0;
      if (playerHasTorch) {
        // A carried flame wards the undead completely: they back away from the bearer
        // instead of hunting him, and drift aimlessly once out of its reach.
        if (dist <= DETECTION_RANGE) {
          this.moveAway(playerWorldX, playerWorldY, isBlocked);
        } else {
          this.wander(isBlocked);
        }
      } else if (dist > 1 && dist <= DETECTION_RANGE) {
        this.moveToward(playerWorldX, playerWorldY, isBlocked);
      } else if (dist > DETECTION_RANGE) {
        this.wander(isBlocked);
      }
    }

    this.attackTimer += delta;
    if (this.attackTimer >= ATTACK_INTERVAL) {
      this.attackTimer = 0;
      // The torch keeps the hero untouchable: no undead dares strike its bearer.
      if (dist === 1 && !playerHasTorch) {
        this.startWindup(playerWorldX, playerWorldY, WINDUP_MS);
      }
    }

    return false;
  }

  /**
   * ARMANDO: o corpo faz a pose recuada (o `super`) e o OSSO sobe atrás da cabeça, do lado oposto
   * ao alvo. As duas metades do aviso dizem a mesma coisa, e é isso que faz um telegrafo — a arma
   * levantada é a promessa que o clarão e o anel no chão já estavam fazendo sozinhos.
   */
  protected override startWindup(targetX: number, targetY: number, durationMs: number): void {
    super.startWindup(targetX, targetY, durationMs);
    this.bone?.rear(targetX - this.worldX, targetY - this.worldY, durationMs);
  }

  /**
   * O GOLPE SAI — e o osso desaba por cima do tile mirado, tenha o herói continuado ali ou não.
   *
   * Ele bate no VAZIO quando o herói esquiva, de propósito e pela mesma razão que o arco do herói
   * sai mesmo sem acertar: uma arma que só se movesse quando conecta esconderia o alcance dela, e
   * aqui esconderia também a coisa mais importante que este gesto tem a ensinar — que sair do tile
   * FUNCIONA. O jogador precisa ver o osso descer onde ele estava.
   */
  protected override onWindupRelease(dirX: number, dirY: number): void {
    this.bone?.strike(dirX, dirY);
  }

  /**
   * The thought balloon: a bubble with a lit pressure plate in it, floating over the skull.
   *
   * This is NOT the need-item hint balloon that was torn out of the game — that one talked to
   * the PLAYER ("go fetch the pickaxe") and handed him the answer to a lock. This one belongs to
   * the creature: it is the same sentence as the attack wind-up's red flash, an intention shown
   * before it is acted on, so the player can read a skull walking past him and understand it is
   * not a bug. Different sentence, different art (thought bubbles, no speech tail), different key.
   */
  private showThought(): void {
    if (this.thought?.active) return;
    const bubble = this.scene.add.image(0, 0, ASSET_KEYS.thoughtPlate);
    // Off-screen until the first onRendered projects it — otherwise it pops at 0,0 for a frame.
    this.thought = this.scene.add.container(-9999, -9999, [bubble])
      .setDepth(SCENE_DEPTHS.player + 2)
      .setScale(0);
    this.scene.tweens.add({
      targets: this.thought,
      scale: 1,
      duration: 220,
      ease: 'Back.easeOut',
    });
    // A wish is a living thing (the bombSpot ghost's grammar): the bubble breathes on its own
    // string. Bobbing the CHILD, never the container, leaves onRendered free to own the anchor.
    this.thoughtTween = this.scene.tweens.add({
      targets: bubble,
      y: -3,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private hideThought(): void {
    const thought = this.thought;
    if (!thought) return;
    this.thought = undefined;
    this.thoughtTween?.stop();
    this.thoughtTween = undefined;
    if (!thought.active || !this.scene.tweens) {
      thought.destroy();
      return;
    }
    this.scene.tweens.add({
      targets: thought,
      scale: 0,
      alpha: 0,
      duration: 160,
      ease: 'Power2.easeIn',
      onComplete: () => thought.destroy(),
    });
  }

  /**
   * Ride the head. Projected at its own ELEVATION rather than offset by a fixed number of
   * pixels: the perspective camera shrinks a tile with depth, so a pixel offset that sits on the
   * head up close floats away from it down the screen. The knockback/step offsets are left out
   * on purpose — the balloon hanging still while the body slides under it reads as a balloon.
   */
  protected override onRendered(camera: WorldCamera, tileSize: number): void {
    // O OSSO SEGUE O CORPO DESENHADO, e não o tile lógico: `render` acabou de somar o recuo do
    // golpe e o deslize do passo na posição do billboard, e é dela que a arma tem de sair. Ancorada
    // no tile lógico, ela ficaria parada no ar toda vez que a caveira fosse arremessada, e um tile
    // à frente do corpo durante cada passo — o mesmo defeito que `visualWorld` resolveu no arco do
    // herói. Aqui a fonte da verdade é o próprio sprite, que já tem tudo somado.
    this.bone?.follow(this.sprite.x, this.sprite.y);

    const thought = this.thought;
    if (!thought?.active) return;
    const anchor = camera.tileToScreen(this.worldX, this.worldY, tileSize, THOUGHT_ELEVATION_TILES);
    thought.setPosition(anchor.x, anchor.y);
    const size = tileSize * THOUGHT_SIZE_TILES;
    (thought.list[0] as Phaser.GameObjects.Image).setDisplaySize(size, size);
  }

  // Each widening step SNAPS the fissure to its next size/brightness — a discrete pop, so the
  // crack visibly jumps wider instead of quietly scaling — and coughs up an extra pair of puffs.
  private applyCrackStage(stage: number): void {
    if (!this.crack || stage === this.crackStage) return;
    const first = this.crackStage < 0;
    this.crackStage = stage;
    const size = CRACK_STAGE_SIZES[Math.min(stage, CRACK_STAGE_SIZES.length - 1)];
    this.crack.setDisplaySize(size, size).setAlpha(0.4 + 0.25 * stage);
    if (!first) {
      this.spawnDustPuff();
      this.spawnDustPuff();
    }
  }

  // Dry earth kicked up along the fissure: grey-brown motes popping off the ground.
  private spawnDustPuff(): void {
    const puff = world3d()
      .addBillboard(FX_PUFF_TEXTURE, 0, { centered: true, fog: false, depthWrite: false, emissive: true, alphaTest: 0.02 })
      .setTint(DUST_TINT)
      .setPosition(this.worldX + (Math.random() - 0.5) * 0.7, this.worldY + (Math.random() - 0.5) * 0.55)
      .setElevation(0.06)
      .setDisplaySize(0.2, 0.2)
      .setAlpha(0.5);
    this.scene.tweens.add({
      targets: puff,
      elevation: 0.45 + Math.random() * 0.35,
      alpha: 0,
      scaleX: 0.42,
      scaleY: 0.42,
      duration: 420 + Math.random() * 220,
      ease: 'Power2.easeOut',
      onComplete: () => puff.destroy(),
    });
  }

  // The fissure never pops off — the skull rises THROUGH it and it fades under the body
  // (or the ground quietly closes again, when a telegraphing skull is despawned).
  private fadeOutCrack(): void {
    const crack = this.crack;
    if (!crack) return;
    this.crack = undefined;
    this.scene.tweens.add({
      targets: crack,
      alpha: 0,
      duration: UNDEAD_BORN_FRAME_KEYS.length * BORN_FRAME_MS,
      ease: 'Power1.easeIn',
      onComplete: () => crack.destroy(),
    });
  }

  public override despawn(): void {
    this.fadeOutCrack();
    this.hideThought();
    // O escuro reclama os seus INTEIROS — sem desmonte e sem peças: aqui não houve briga nenhuma,
    // e o osso derrete junto com a mão que o segurava.
    this.destroyBone();
    super.despawn();
  }

  // A skull that dies mid-march must not leave its wish floating over the empty tile.
  /**
   * A OSSADA nao e mais responsabilidade dela: quem enterra e o EnemyManager, para TODO corpo
   * morto (ver EnemyBase.corpseMark). A caveira tinha um caminho proprio — um callback recebido no
   * construtor — de quando ela era a unica especie que deixava marca; dois caminhos para a mesma
   * coisa e como um deles envelhece errado. A distincao que aquele comentario guardava continua
   * valendo e agora vale para todos: `die()` marca, `despawn()` nao — quando o heroi alcanca uma
   * fogueira o escuro reclama os proprios de volta, e ali nao houve briga nenhuma pra registrar.
   */
  protected override onDeath(): void {
    this.hideThought();
  }

  /**
   * ELA DESMONTA — a morte própria da caveira, no pico do desmanche (ver EnemyBase.onCrumble).
   *
   * O corpo SOME neste instante e vira quatro peças no ar: a cabeça, o osso que ela empunhava e
   * dois pedaços quebrados. O gesto genérico continua rodando por baixo (é ele que conta o relógio
   * da remoção e solta a ossada no chão) — só que num sprite invisível, porque quem conta a morte
   * agora são as peças.
   *
   * As peças se espalham a FAVOR do golpe que matou (`deathDirection`), quando houve um: a caveira
   * que leva uma espadada do oeste se parte para o leste. Uma explosão simétrica leria como a coisa
   * tendo se desfeito sozinha, e o que aconteceu foi que alguém bateu nela.
   */
  protected override onCrumble(): void {
    this.sprite.setVisible(false);

    // O osso que ela segurava deixa de ser arma e vira peça: ele continua exatamente de onde a
    // órbita o deixou, e não do centro do corpo — a arma estava numa ponta do gesto, e vê-la
    // saltar para o meio da caveira antes de voar seria o único frame falso da cena.
    const held = this.bone?.release();
    this.destroyBone();

    const dir = this.deathDirection;
    for (let i = 0; i < PIECE_COUNT; i++) {
      // O leque abre a favor do golpe; sem golpe (uma bomba, o escuro), ele vira o círculo inteiro.
      const base = dir ? Math.atan2(dir.y, dir.x) : Math.PI * 2 * (i / PIECE_COUNT);
      const ang = base + (dir ? ((i / (PIECE_COUNT - 1)) * 2 - 1) * 1.15 : 0)
        + (Math.random() - 0.5) * 0.5;
      // A primeira peça é a CABEÇA (a que o olho segue), a segunda é o osso que ela empunhava, e o
      // resto são pedaços quebrados.
      const from = i === 1 && held ? held : undefined;
      this.spawnDeathPiece(i, ang, from);
    }
  }

  /**
   * Uma peça do desmonte: sai do corpo, sobe num arco, cai e fica um instante no chão.
   *
   * O arco são DOIS tweens de elevação e não um só com yoyo, porque subir e cair não duram o mesmo:
   * a pancada joga a peça para cima depressa e a gravidade a traz de volta devagar. Um yoyo daria
   * as duas metades simétricas, que é a curva de uma bola quicando em desenho animado e não a de um
   * osso sendo arremessado.
   */
  private spawnDeathPiece(
    index: number,
    angle: number,
    from?: { x: number; y: number; elevation: number; angle: number },
  ): void {
    // [0] a cabeça · [1] o fêmur inteiro (o que ela empunhava) · resto: pedaços quebrados.
    const art = index === 0
      ? { texture: ASSET_KEYS.undeadBits, frame: 0, size: PIECE_SIZE * 1.15 }
      : index === 1
        ? { texture: ASSET_KEYS.undeadBone, frame: 0, size: PIECE_SIZE }
        : { texture: ASSET_KEYS.undeadBits, frame: 1, size: PIECE_SIZE * 0.85 };

    const startX = from?.x ?? this.worldX;
    const startY = from?.y ?? this.worldY;
    const startElev = from?.elevation ?? 0.42;
    const dist = PIECE_SPREAD * (0.65 + Math.random() * 0.7);

    const piece = world3d()
      .addBillboard(art.texture, art.frame, { centered: true, alphaTest: 0.02 })
      .setPosition(startX, startY)
      .setElevation(startElev)
      .setDisplaySize(art.size, art.size)
      .setAngle(from?.angle ?? Phaser.Math.Between(-180, 180));

    const flight = PIECE_RISE_MS + PIECE_FALL_MS;
    // O voo horizontal e o giro são UM tween só, correndo por cima dos dois de elevação: no ar a
    // peça não muda de direção nem para de girar só porque chegou ao topo do arco.
    this.scene.tweens.add({
      targets: piece,
      // O `y` anda menos que o `x` pelo mesmo motivo das faíscas de impacto: o plano do chão está
      // inclinado para longe da câmera, e um espalhamento circular em tiles lê como elipse errada.
      x: startX + Math.cos(angle) * dist,
      y: startY + Math.sin(angle) * dist * 0.62,
      angle: (from?.angle ?? 0) + Phaser.Math.Between(-320, 320),
      duration: flight,
      ease: 'Quad.easeOut', // ela perde velocidade no ar; só a queda continua acelerando
    });
    this.scene.tweens.add({
      targets: piece,
      elevation: startElev + PIECE_PEAK * (0.7 + Math.random() * 0.6),
      duration: PIECE_RISE_MS,
      ease: 'Quad.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: piece,
          elevation: 0.03, // pousa no chão, não dentro dele
          duration: PIECE_FALL_MS,
          ease: 'Quad.easeIn',
          onComplete: () => {
            // No chão ela PARA de girar e só some — uma peça que continuasse rodando deitada leria
            // como pião, e o que ela é agora é lixo de osso esperando o escuro levar.
            this.scene.tweens.add({
              targets: piece,
              alpha: 0,
              duration: PIECE_LINGER_MS,
              ease: 'Sine.easeIn',
              onComplete: () => piece.destroy(),
            });
          },
        });
      },
    });
  }

  /** A arma não sobrevive a quem a segurava — nem morrendo, nem se desfazendo, nem sendo enterrada. */
  private destroyBone(): void {
    this.bone?.destroy();
    this.bone = undefined;
  }

  public override destroy(): void {
    this.destroyBone();
    if (this.crack) {
      if (this.scene.tweens) this.scene.tweens.killTweensOf(this.crack);
      this.crack.destroy();
      this.crack = undefined;
    }
    this.thoughtTween?.stop();
    this.thoughtTween = undefined;
    this.thought?.destroy();
    this.thought = undefined;
    super.destroy();
  }
}

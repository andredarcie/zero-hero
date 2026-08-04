import Phaser from 'phaser';

import { SCENE_DEPTHS } from '@/game/constants';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import type { WorldCamera } from '@/game/runtime/WorldCamera';
import { FLYING_ENEMY_KINDS, type EnemyKind } from '@/game/world/ScreenContent';

export abstract class EnemyBase {
  public worldX: number;
  public worldY: number;
  public pendingRemoval = false;

  private health: number;
  private readonly maxHealth: number;
  private alive = true;
  // Visual displacement in TILE units, applied at render time on top of the grid position.
  // Shared by the hit-knockback stretch and the per-step slide (a step starts the sprite
  // back at the old tile and eases it into the new one).
  private knockbackOffsetX = 0;
  private knockbackOffsetY = 0;
  private knockbackSquash = 1.0;
  // Footstep feel: alternate a small left/right tilt on every step.
  private stepFlip = false;
  private stepTween?: Phaser.Tweens.Tween;
  /**
   * O ATORDOAMENTO — quanto tempo este corpo ainda pertence ao golpe que levou.
   *
   * Sem ele um golpe nao muda NADA no bicho: ele continua andando no mesmo relogio, continua
   * armando o mesmo ataque, e a unica diferenca entre acertar e errar e um numero invisivel
   * descendo. A janela de recuperacao (o terceiro tempo de todo ataque: antecipacao → golpe →
   * recuperacao) e o que transforma "acertei" numa VANTAGEM de posicao — e ela e do jogador,
   * nao do bicho. Quem conta o relogio e cada especie, no topo do proprio update (tickHitstun).
   */
  private hitstunMs = 0;

  protected readonly scene: Phaser.Scene;
  protected readonly sprite: Billboard3D;
  private readonly healthBar: Phaser.GameObjects.Graphics;
  // Last projected screen position/scale — anchors Phaser-side FX (shadow wisps).
  private lastScreen = { x: 0, y: 0 };
  private lastTileSize = 48;

  /** Override to return the hurt texture key; if defined, flashes on takeDamage */
  protected hurtTexture?: string;

  /** Subclasses can hide the health bar (e.g. while the spawn animation plays). */
  protected healthBarVisible = true;

  /** Override to return the normal texture key used to restore after hurt flash */
  protected abstract get normalTexture(): string;

  /** Override to control display scale (default 1.0) */
  protected get spriteScale(): number {
    return 1.0;
  }

  public constructor(
    scene: Phaser.Scene,
    worldX: number,
    worldY: number,
    maxHealth: number,
    sprite: Billboard3D,
  ) {
    this.scene = scene;
    this.worldX = worldX;
    this.worldY = worldY;
    this.maxHealth = maxHealth;
    this.health = maxHealth;
    this.sprite = sprite;
    this.healthBar = scene.add.graphics().setDepth(SCENE_DEPTHS.player + 2);
  }

  public get isAlive(): boolean {
    return this.alive;
  }

  /** True while a spawn animation plays (the enemy is invulnerable); subclasses override. */
  public get isSpawning(): boolean {
    return false;
  }

  /** Que especie e este corpo (o snapshot de debug e a cova autorada leem isto). */
  public abstract get kind(): EnemyKind;

  /**
   * VOA. O morcego cruza rio, lava e buraco — o que o segura e parede (e o mar, que nada no jogo
   * atravessa). Quem responde `true` aqui e consultado com hazardsPassable pelo EnemyManager, e e
   * a unica diferenca entre "onde eu ando" de um bicho e de outro: o resto do mundo e igual pra
   * todos, inclusive a luz de fogueira, que e parede pra qualquer monstro.
   *
   * A resposta vem da ESPECIE (FLYING_ENEMY_KINDS) e nao de um override por classe, porque a cova
   * e o editor precisam da mesma informacao antes de existir corpo nenhum pra perguntar.
   */
  public get flies(): boolean {
    return FLYING_ENEMY_KINDS.has(this.kind);
  }

  /**
   * A tocha ACESA na mao do heroi afasta esta criatura, e o torna intocavel?
   *
   * Vale pro morto-vivo (a chama e o oposto dele) e pro bicho vivo, que teme fogo como todo
   * animal. NAO vale pra gosma (nao ha o que assustar num saco de limo) nem pra maquina (a
   * torreta nao ve chama, ve alvo) — e essa e a frase que essas duas dizem: a tocha protege do
   * MORTO e do BICHO, nao de tudo. Quem ignora a tocha ainda respeita a luz de fogueira como
   * parede; o que muda e o que ele faz com o heroi que carrega uma.
   */
  public get fearsTorch(): boolean {
    return true;
  }

  /**
   * O laco da PLACA DE PRESSAO. So a caveira o atende (ver UndeadEnemy): a placa quer um corpo, e
   * o corpo que o escuro manda vai la sozinho. Bicho vivo, gosma e maquina tem vontade propria —
   * e um bestiario inteiro marchando para placas transformaria toda placa em interruptor de bicho.
   * Os tres membros vivem aqui para o EnemyManager poder distribuir placas sem saber de especies.
   */
  public get seeksPlates(): boolean {
    return false;
  }

  public get plateTarget(): { x: number; y: number } | undefined {
    return undefined;
  }

  /**
   * O corpo pode ser ARREMESSADO um tile por um golpe?
   *
   * Nao e uma questao de peso: e de quem manda na posicao. A torreta e mobilia (um autor a
   * planta num tile e conta com ela ali) e o zora escolhe sozinho onde a agua o devolve — os
   * dois escrevem `worldX/worldY` por conta propria, e um empurrao os deixaria discordando de
   * si mesmos. Quem responde `false` ainda leva o RECUO visual: o golpe sempre responde no
   * corpo, so nao ganha terreno.
   */
  public get canBeShoved(): boolean {
    return true;
  }

  /** True enquanto um golpe recebido ainda segura este corpo (ver hitstunMs). */
  public get isStunned(): boolean {
    return this.hitstunMs > 0;
  }

  /** Um golpe landou: este corpo nao anda nem bate pelos proximos `ms`. */
  public applyHitstun(ms: number): void {
    this.hitstunMs = Math.max(this.hitstunMs, ms);
  }

  /**
   * Desconta o atordoamento do frame. Devolve `true` quando ele ainda esta correndo — e a
   * especie que chama isto tem de sair do update NAQUELE instante, sem andar e sem armar nada.
   */
  protected tickHitstun(delta: number): boolean {
    if (this.hitstunMs <= 0) return false;
    this.hitstunMs = Math.max(0, this.hitstunMs - delta);
    return true;
  }

  /**
   * O EMPURRAO DE VERDADE: o golpe move o corpo um tile, e nao so o desenho dele.
   *
   * Era so um deslocamento de render que voltava sozinho, entao bater e nao bater davam o mesmo
   * tabuleiro — e um jogo de grade em que o golpe nao abre espaco nao tem espacamento, que e a
   * unica coisa que uma luta corpo a corpo tem pra ensinar. (No `A Link to the Past` a primeira
   * sala e desenhada com um nicho do tamanho exato do arremesso, so pra ensinar isto.)
   *
   * `canEnter` vem de fora porque quem sabe o que e solido e o GameScene — inclusive a luz de
   * fogueira, que continua sendo parede: arremessar um bicho pra dentro da luz nao pode ser a
   * porta dos fundos da lei que diz que monstro nao existe nela. Bloqueado, ele bate na parede:
   * o recuo elastico de sempre, e nenhum terreno ganho.
   */
  public shove(
    dx: number,
    dy: number,
    canEnter: (wx: number, wy: number) => boolean,
  ): boolean {
    if (!this.alive) return false;
    if (dx === 0 && dy === 0) return false;
    if (!this.canBeShoved || !canEnter(this.worldX + dx, this.worldY + dy)) {
      this.triggerKnockback(dx, dy);
      return false;
    }

    this.worldX += dx;
    this.worldY += dy;
    // Ele SAI do tile antigo deslizando (a mesma gramatica do passo), so que esticado e rapido:
    // teleportar um tile no frame do impacto leria como um bug, nao como um arremesso.
    this.scene.tweens.killTweensOf(this);
    this.stepTween?.stop();
    this.sprite.setAngle(0);
    this.knockbackOffsetX = -dx;
    this.knockbackOffsetY = -dy;
    this.knockbackSquash = 0.8;
    this.scene.tweens.add({
      targets: this,
      knockbackOffsetX: 0,
      knockbackOffsetY: 0,
      knockbackSquash: 1.0,
      duration: 200,
      ease: 'Power3.easeOut',
    });
    return true;
  }

  public setPlateTarget(_target?: { x: number; y: number }): void {
    // no-op: so quem busca placa implementa
  }

  /** Apply damage (default 1). Weak weapons pass fractions — e.g. the wood club deals 0.5. */
  public takeDamage(amount = 1): boolean {
    if (!this.alive) return false;
    this.health -= amount;

    // A PISCADA BRANCA FOI ARRANCADA. Um `setTintFill(0xffffff)` num billboard `emissive` nao e
    // uma piscada: e uma silhueta chapada de branco puro que o bloom espalha pela tela, e o
    // hitstop de 60-110ms a CONGELA acesa — bater num bicho cegava quem estava olhando pra ele.
    // O golpe continua respondendo no corpo por tudo o que ja fazia e nao depende de luz: a
    // faisca do impacto, o baque da tela, o arremesso de um tile e o atordoamento.
    if (this.hurtTexture) {
      this.sprite.setTexture(this.hurtTexture);
      this.scene.time.delayedCall(150, () => {
        if (this.alive) {
          this.sprite.setTexture(this.normalTexture);
        }
      });
    }

    if (this.health <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  public abstract update(
    delta: number,
    playerX: number,
    playerY: number,
    playerSafe: boolean,
    playerHasTorch: boolean,
    isBlocked: (wx: number, wy: number) => boolean,
  ): boolean;

  /**
   * A blow glanced off (spawn invulnerability): flash a pale cold tint for a beat. Tint only —
   * never the hurtTexture swap, which is the "real damage" signal.
   */
  public flashImmune(): void {
    if (!this.alive) return;
    this.sprite.setTintFill(0xaec6ff);
    this.scene.time.delayedCall(90, () => {
      if (this.alive && this.sprite.active) this.restoreTint();
    });
  }

  /**
   * Devolve a cor de base depois de uma piscada. E um metodo e nao um `clearTint` solto porque uma
   * especie pode ter tom PERMANENTE (o mago frio, que divide a arte com o NPC mago): limpar o tint
   * la o devolveria branco, e ele leria como o outro personagem por um instante.
   */
  protected restoreTint(): void {
    this.sprite.clearTint();
  }

  /**
   * Rear back into a HELD pose (the attack wind-up): ease away from the strike direction
   * and crouch slightly, then stay there — the release (the lunge of a landed hit or a
   * whiffed triggerKnockback) is its own tween and overwrites this one.
   */
  protected poseWindup(awayX: number, awayY: number, ms: number): void {
    this.scene.tweens.killTweensOf(this);
    this.scene.tweens.add({
      targets: this,
      knockbackOffsetX: awayX * 0.2,
      knockbackOffsetY: awayY * 0.2,
      knockbackSquash: 0.86,
      duration: ms,
      ease: 'Sine.easeOut',
    });
  }

  public triggerKnockback(dx: number, dy: number): void {
    if (!this.alive) return;
    this.scene.tweens.killTweensOf(this);
    this.knockbackOffsetX = dx * 0.38;
    this.knockbackOffsetY = dy * 0.38;
    this.knockbackSquash = 0.78;
    this.scene.tweens.add({
      targets: this,
      knockbackOffsetX: 0,
      knockbackOffsetY: 0,
      knockbackSquash: 1.0,
      duration: 230,
      ease: 'Power3.easeOut',
    });
  }

  /**
   * Play the footstep animation for a completed grid step: the sprite starts back at the
   * old tile and slides into the new one, tilting slightly left/right on alternate steps.
   */
  private animateStep(ox: number, oy: number): void {
    this.scene.tweens.killTweensOf(this);
    this.knockbackOffsetX = -ox;
    this.knockbackOffsetY = -oy;
    this.scene.tweens.add({
      targets: this,
      knockbackOffsetX: 0,
      knockbackOffsetY: 0,
      duration: 260,
      ease: 'Sine.easeOut',
    });

    this.stepFlip = !this.stepFlip;
    this.stepTween?.stop();
    this.sprite.setAngle(this.stepFlip ? 9 : -9);
    this.stepTween = this.scene.tweens.add({
      targets: this.sprite,
      angle: 0,
      duration: 260,
      ease: 'Sine.easeOut',
    });
  }

  public render(tileSize: number, camera: WorldCamera): void {
    if (!this.alive) return;

    // The billboard lives in tile space; knockback/step offsets are already tile units.
    const scale = this.spriteScale * this.knockbackSquash;
    this.sprite
      .setPosition(this.worldX + this.knockbackOffsetX, this.worldY + this.knockbackOffsetY)
      .setDisplaySize(scale, scale);

    this.lastScreen = camera.tileToScreen(this.worldX, this.worldY, tileSize);
    this.lastTileSize = tileSize;

    // Enemy health bars are intentionally not drawn (removed by design). The graphics object is
    // kept (and cleared) so nothing else has to change; it just never fills.
    this.healthBar.clear();

    this.onRendered(camera, tileSize);
  }

  /**
   * Hook for screen-space FX a subclass pins to this body (the undead's thought balloon).
   * It gets the CAMERA rather than the projected point because anything floating above the
   * head has to be projected at its own elevation — the 3D perspective shrinks a tile with
   * depth, so a fixed pixel offset would drift off the head as the creature walks away.
   */
  protected onRendered(_camera: WorldCamera, _tileSize: number): void {
    // no-op by default
  }

  public destroy(): void {
    if (this.scene.tweens) {
      this.scene.tweens.killTweensOf(this.sprite);
      this.scene.tweens.killTweensOf(this);
    }
    this.sprite.destroy();
    this.healthBar.destroy();
  }

  protected die(): void {
    this.alive = false;
    this.healthBar.clear();
    // The step tilt also tweens sprite.angle; stop it so it can't fight the crumble spin.
    this.stepTween?.stop();
    this.onDeath();
    // Impact pop: swell for a beat, then crumble away spinning. O clarao branco daqui saiu pelo
    // mesmo motivo que o do dano (ver takeDamage) — e ele era o pior dos dois, porque o hitstop
    // da morte e o mais longo do jogo e segurava a silhueta branca acesa na tela inteira.
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: this.sprite.scaleX * 1.35,
      scaleY: this.sprite.scaleY * 1.35,
      duration: 70,
      ease: 'Back.easeOut',
      onComplete: () => {
        if (!this.sprite.active) return;
        this.restoreTint();
        this.scene.tweens.add({
          targets: this.sprite,
          alpha: 0,
          scaleX: 0.1,
          scaleY: 0.1,
          angle: Phaser.Math.Between(-40, 40),
          duration: 240,
          ease: 'Power2.easeIn',
          onComplete: () => {
            this.sprite.setVisible(false);
            this.pendingRemoval = true;
          },
        });
      },
    });
  }

  /** Override to add death effects (pool, spawn, etc.) */
  protected onDeath(): void {
    // no-op by default
  }

  /**
   * Quiet removal (no loot, no onDeath): the dark reclaims its own when the hero reaches a
   * campfire's safety. The skull turns pitch-black silhouette and melts back into the
   * ground while wisps of shadow curl up from the spot. Distinct from die(), a combat kill.
   */
  public despawn(): void {
    if (!this.alive) return;
    this.alive = false;
    this.healthBar.clear();
    this.scene.tweens.killTweensOf(this);
    this.stepTween?.stop();
    this.sprite.setAngle(0);
    this.sprite.setTintFill(0x05060f);

    this.spawnShadowWisps();
    this.scene.tweens.add({
      targets: this.sprite,
      scaleY: 0.08,
      alpha: 0,
      duration: 520,
      ease: 'Power2.easeIn',
      onComplete: () => {
        this.sprite.setVisible(false);
        this.pendingRemoval = true;
      },
    });
  }

  /** Pale cold wisps rising from where a despawning skull melted into the ground (2D overlay FX). */
  private spawnShadowWisps(): void {
    const w = this.lastTileSize;
    const x = this.lastScreen.x;
    const groundY = this.lastScreen.y;
    for (let i = 0; i < 4; i++) {
      const wisp = this.scene.add
        .circle(
          x + Phaser.Math.Between(-Math.round(w * 0.3), Math.round(w * 0.3)),
          groundY - Phaser.Math.Between(0, 4),
          Math.max(2, Math.round(w * 0.12)),
          0x6c7aa8,
          0.55,
        )
        .setDepth(SCENE_DEPTHS.player + 1);
      this.scene.tweens.add({
        targets: wisp,
        y: groundY - w * (0.7 + Math.random() * 0.6),
        x: wisp.x + Phaser.Math.Between(-5, 5),
        alpha: 0,
        scale: 0.4,
        delay: i * 80,
        duration: 480 + i * 90,
        ease: 'Sine.easeOut',
        onComplete: () => wisp.destroy(),
      });
    }
  }

  protected moveToward(
    targetX: number,
    targetY: number,
    isBlocked: (wx: number, wy: number) => boolean,
  ): void {
    const dx = targetX - this.worldX;
    const dy = targetY - this.worldY;

    const primary: [number, number] = Math.abs(dx) >= Math.abs(dy)
      ? [Math.sign(dx), 0]
      : [0, Math.sign(dy)];
    const secondary: [number, number] = Math.abs(dx) >= Math.abs(dy)
      ? [0, Math.sign(dy)]
      : [Math.sign(dx), 0];

    for (const [ox, oy] of [primary, secondary]) {
      if (ox === 0 && oy === 0) continue;
      if (!isBlocked(this.worldX + ox, this.worldY + oy)) {
        this.stepTo(ox, oy);
        return;
      }
    }
  }

  /**
   * Da UM passo na direcao pedida, sem perguntar nada: quem chamou ja checou o bloqueio. E o
   * unico lugar que mexe em worldX/worldY, e por isso o unico que sabe animar o passo — uma
   * especie com movimento proprio (o rodeio do mago) precisa desta porta para nao reimplementar
   * o deslize e o tombo lateral do passo.
   */
  protected stepTo(ox: number, oy: number): void {
    this.worldX += ox;
    this.worldY += oy;
    // Andar NAO espelha o corpo. Havia um `setFlipX(ox < 0)` aqui, e ele nunca fez nada — o
    // espelho morria no `apply()` do billboard no mesmo frame (ver Billboard3D.flipped). Consertada
    // a plataforma, ele passaria a valer, e valeria errado: este bestiario e desenhado DE FRENTE
    // (caveira, aranha, morcego, gosma, mago), entao espelhar nao vira ninguem — so inverte a luz,
    // que nesta arte vem sempre da esquerda. Quem e vista de LADO pede o espelho por conta propria,
    // e hoje ha uma so: o zora, que precisa encarar o lado pra onde cospe.
    this.animateStep(ox, oy);
  }

  protected moveAway(
    fromX: number,
    fromY: number,
    isBlocked: (wx: number, wy: number) => boolean,
  ): void {
    const dx = this.worldX - fromX;
    const dy = this.worldY - fromY;

    const primary: [number, number] = Math.abs(dx) >= Math.abs(dy)
      ? [Math.sign(dx) || 1, 0]
      : [0, Math.sign(dy) || 1];
    const secondary: [number, number] = Math.abs(dx) >= Math.abs(dy)
      ? [0, Math.sign(dy) || 1]
      : [Math.sign(dx) || 1, 0];

    for (const [ox, oy] of [primary, secondary]) {
      if (!isBlocked(this.worldX + ox, this.worldY + oy)) {
        this.stepTo(ox, oy);
        return;
      }
    }
  }

  protected wander(isBlocked: (wx: number, wy: number) => boolean): void {
    const dirs: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const [ox, oy] = dirs[Phaser.Math.Between(0, 3)];
    if (!isBlocked(this.worldX + ox, this.worldY + oy)) this.stepTo(ox, oy);
  }
}

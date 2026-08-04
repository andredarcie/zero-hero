import type Phaser from 'phaser';

import { ASSET_KEYS } from '@/game/constants';
import { world3d } from '@/game/render3d/World3D';
import type { WorldCamera } from '@/game/runtime/WorldCamera';
import type { EnemyKind } from '@/game/world/ScreenContent';
import { WalkerEnemy, type StepContext } from './WalkerEnemy';

/**
 * O MORCEGO — o bicho que o mapa nao segura.
 *
 * A frase dele e uma so: **rio, lava e buraco nao sao parede pra quem voa**. Todo perigo do jogo
 * ate aqui era negociavel com terreno — ponha a agua entre voce e o problema e o problema fica do
 * outro lado —, e o morcego e a resposta a isso. Ele e o unico corpo que aparece do outro lado do
 * vau sem que ninguem tenha construido ponte.
 *
 * O que ele NAO e: um perigo. Morre com qualquer coisa (1 de vida — um soco basta), bate pouco e
 * espera bastante entre golpes. O custo dele e de POSICAO, nao de dano: ele obriga a pensar num
 * lugar que parecia resolvido. E ele ainda teme a tocha (bicho vivo teme fogo), o que da ao
 * jogador a mesma alavanca de sempre.
 *
 * O mar continua fora: nada no jogo cruza o mar (SOLID_GROUND_FRAMES), nem ele. A borda do mundo
 * nao e um perigo a ser vencido, e a moldura.
 */

const MAX_HEALTH = 1;
// Rapido, e por isso o passo dele nao e uma caminhada: e um bater de asa. Menos que ~260ms comeca
// a ficar impossivel de ler no meio de tres deles.
const MOVE_INTERVAL = 300;
const ATTACK_INTERVAL = 1500;
// Aviso curto — ele e rapido —, mas nunca zero: golpe sem telegrafo desmente a promessa da casa.
const WINDUP_MS = 280;
const DETECTION_RANGE = 12;
// A altura de voo, em tiles, e o quanto ela respira. Um morcego pousado no chao le como rato.
const FLY_ELEVATION = 0.55;
const BOB_AMPLITUDE = 0.09;
const BOB_SPEED = 0.006; // rad/ms
// Um em cada tres passos e torto: ele NAO vem em linha reta, e isso e metade da leitura de morcego.
const ERRATIC_CHANCE = 0.34;

export class BatEnemy extends WalkerEnemy {
  protected override hurtTexture = ASSET_KEYS.batHurt;

  private bobPhase = Math.random() * Math.PI * 2;

  public constructor(scene: Phaser.Scene, worldX: number, worldY: number) {
    const sprite = world3d()
      // A sombra e pequena e fraca de proposito: e a sombra de uma coisa que nao esta no chao.
      .addBillboard(ASSET_KEYS.bat, 0, { groundShadow: { rx: 0.26, rz: 0.2, alpha: 0.2 } })
      .setPosition(worldX, worldY)
      .setElevation(FLY_ELEVATION)
      .setDisplaySize(0.8, 0.8);
    super(scene, worldX, worldY, MAX_HEALTH, sprite, 0.8);
  }

  public override get kind(): EnemyKind {
    return 'bat';
  }

  protected override get normalTexture(): string {
    return ASSET_KEYS.bat;
  }

  // `flies` nao e sobrescrito aqui: ele sai de FLYING_ENEMY_KINDS (ver ScreenContent), a lista que
  // a cova e o editor tambem leem. Um override nesta classe seria a segunda copia da verdade.

  protected override get moveIntervalMs(): number {
    return MOVE_INTERVAL;
  }

  protected override get attackIntervalMs(): number {
    return ATTACK_INTERVAL;
  }

  protected override get windupDurationMs(): number {
    return WINDUP_MS;
  }

  protected override get detectionRange(): number {
    return DETECTION_RANGE;
  }

  /**
   * A altura respira TODO frame, e por isso ela mora aqui e nao no `think`: `think` e a cabeca do
   * bicho e nao roda enquanto ele chega nem enquanto o golpe esta comprometido — um morcego que
   * congelasse no ar durante meio segundo de aviso viraria um adesivo pendurado. `onRendered` e o
   * gancho de quem desenha, e e chamado sempre que o corpo e desenhado.
   */
  protected override onRendered(_camera: WorldCamera, _tileSize: number): void {
    this.bobPhase += this.scene.game.loop.delta * BOB_SPEED;
    this.sprite.setElevation(FLY_ELEVATION + Math.sin(this.bobPhase) * BOB_AMPLITUDE);
  }

  /**
   * Caca torto. A perseguicao e a mesma de todos, mas um passo em cada tres e sorteado — o morcego
   * chega, so nao chega reto. Sem isso ele e uma caveira rapida com asas.
   */
  protected override takeStep(ctx: StepContext): void {
    if (!ctx.playerHasTorch && ctx.dist > 1 && ctx.dist <= this.detectionRange
      && Math.random() < ERRATIC_CHANCE) {
      this.wander(ctx.isBlocked);
      return;
    }
    super.takeStep(ctx);
  }
}

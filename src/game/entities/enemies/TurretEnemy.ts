import Phaser from 'phaser';

import { getSoundManager } from '@/game/audio/SoundManager';
import { ASSET_KEYS } from '@/game/constants';
import { EnemyBase } from '@/game/entities/EnemyBase';
import type { EnemyProjectileManager } from '@/game/entities/EnemyProjectile';
import { world3d } from '@/game/render3d/World3D';
import type { EnemyKind } from '@/game/world/ScreenContent';

/**
 * A TORRETA — a unica coisa viva do bestiario que nao esta viva.
 *
 * Ela nao anda. Nunca. E porque nao anda, ela e a primeira peca do jogo que e ao mesmo tempo
 * INIMIGO e MOBILIA: um corpo ocupa tile (ninguem atravessa inimigo), entao uma torreta e uma
 * parede que atira — e o autor de level pode usa-la como as duas coisas.
 *
 * O que ela diz:
 *
 * - **Fogo nao a impressiona.** `fearsTorch = false`, e por um motivo diferente do da gosma: a
 *   gosma nao tem medo, a maquina nao tem olho pra chama. A tocha e um escudo contra o que teme
 *   fogo, e a torreta e a prova de que isso e uma lista, nao uma lei.
 * - **A cobertura e a resposta.** Ela dispara em LEQUE RADIAL: seis balas lentas, em todas as
 *   direcoes, o que torna "sair da linha de tiro" inutil. O que funciona e a parede — a bala morre
 *   na pedra (ver EnemyProjectile) —, entao a pergunta que ela faz e sobre o mapa: onde e que da
 *   pra ficar? Um leque tambem e a unica forma de tiro que nao exige mira, e isso e de proposito:
 *   ela nao caca, ela nega area.
 * - **Ela avisa.** 350ms de carga (brilho subindo + zumbido) antes de cada leque. Sem isso a
 *   primeira bala e sempre injusta, e a segunda tambem, porque ninguem aprendeu nada.
 *
 * Ela e o corpo mais duro do bestiario (6 de vida) porque nao tem para onde fugir: dar 5 socos numa
 * torreta e uma decisao com custo — os leques continuam saindo enquanto voce bate.
 */

const MAX_HEALTH = 6;
/** Cadencia do leque e o aviso que vem antes dele. */
const FIRE_INTERVAL_MS = 3600;
const CHARGE_MS = 350;
/** Ate onde ela se da o trabalho. Fora disso ela fica muda: uma torreta atirando sozinha do outro
 *  lado do mapa e som e bala pra ninguem. */
const RANGE_TILES = 9;
const SHOT_COUNT = 6;
const SHOT_SPEED = 3.2;
/** O brilho da carga: o mesmo azul-gelo da arte dela, subindo antes do leque. */
const CHARGE_TINT = 0x8fd8ff;
/** A maquina se levanta do chao antes de servir — o mesmo "chegar e um evento" dos bichos. */
const ARRIVE_MS = 700;

export class TurretEnemy extends EnemyBase {
  private fireTimer: number;
  private chargeMs = 0;
  private arriveMs = ARRIVE_MS;
  private arriveScale = 0.4;

  public constructor(
    scene: Phaser.Scene,
    worldX: number,
    worldY: number,
    private readonly shots: EnemyProjectileManager,
  ) {
    const sprite = world3d()
      .addBillboard(ASSET_KEYS.turret, 0, { groundShadow: { rx: 0.4, rz: 0.32, alpha: 0.4 } })
      .setPosition(worldX, worldY)
      .setDisplaySize(1, 1);
    super(scene, worldX, worldY, MAX_HEALTH, sprite);
    this.fireTimer = Phaser.Math.Between(0, FIRE_INTERVAL_MS);
  }

  public override get kind(): EnemyKind {
    return 'turret';
  }

  protected override get normalTexture(): string {
    return ASSET_KEYS.turret;
  }

  public override get fearsTorch(): boolean {
    return false;
  }

  /** Mobilia nao voa pra tras. Ela leva o recuo visual e continua exatamente onde foi plantada. */
  public override get canBeShoved(): boolean {
    return false;
  }

  public override get isSpawning(): boolean {
    return this.arriveMs > 0;
  }

  protected override get spriteScale(): number {
    return this.arriveScale;
  }

  public override takeDamage(amount = 1): boolean {
    if (this.isSpawning) return false;
    return super.takeDamage(amount);
  }

  /**
   * O AZUL DA CARGA SOBREVIVE A UMA PANCADA.
   *
   * Todo caminho de piscada volta pela `restoreTint`, e a dela limpava o tint — entao acertar a
   * torreta no meio da carga APAGAVA o unico aviso de que o leque vinha, e as seis balas saiam de
   * uma maquina que parecia adormecida. Um aviso que o jogador desliga batendo e pior que aviso
   * nenhum: ele ensina que bater e seguro justamente no instante em que nao e.
   *
   * E o mesmo remendo que o mago ja tinha (o tom frio dele e identidade); aqui o tom e ESTADO, e
   * por isso ele so vale enquanto a carga corre. O escurecimento de ferido continua por baixo dos
   * dois — `woundedShade` multiplica a cor de base em vez de substitui-la.
   */
  protected override restoreTint(): void {
    if (this.chargeMs > 0) this.sprite.setTint(this.woundedShade(CHARGE_TINT));
    else super.restoreTint();
  }

  public override update(
    delta: number,
    playerWorldX: number,
    playerWorldY: number,
    _playerSafe: boolean,
    _playerHasTorch: boolean,
    _isBlocked: (wx: number, wy: number) => boolean,
  ): boolean {
    if (!this.isAlive) return false;

    // Chegar e um evento pra ela tambem — a maquina se levanta do chao antes de servir.
    if (this.arriveMs > 0) {
      this.arriveMs = Math.max(0, this.arriveMs - delta);
      const t = 1 - this.arriveMs / ARRIVE_MS;
      // Teto em 1 pelo mesmo motivo do WalkerEnemy: o overshoot do `Back.Out` faria a maquina vazar
      // do tile dela por um instante, e nenhum sprite deste jogo vaza do seu tile.
      this.arriveScale = Math.min(1, 0.4 + 0.6 * Phaser.Math.Easing.Back.Out(t, 1.2));
      return false;
    }

    const dist = Math.abs(playerWorldX - this.worldX) + Math.abs(playerWorldY - this.worldY);

    // A carga: comprometida. Uma vez zumbindo, o leque sai — inclusive se o heroi sair do alcance
    // no meio (o inverso ensinaria a andar pra tras pra desarmar uma maquina, o que ela nao faz).
    if (this.chargeMs > 0) {
      this.chargeMs -= delta;
      if (this.chargeMs <= 0) {
        this.chargeMs = 0;
        this.restoreTint();
        this.fireFan();
      }
      return false;
    }

    if (dist > RANGE_TILES) return false;

    this.fireTimer += delta;
    if (this.fireTimer >= FIRE_INTERVAL_MS) {
      this.fireTimer = 0;
      this.chargeMs = CHARGE_MS;
      // Tint MULTIPLICADO e nao `setTintFill`: preencher de solido apaga a arte e le como
      // "tomei dano", que e a leitura errada. Ela nao pisca, ela ESQUENTA de azul. E entra pela
      // `restoreTint` (com a carga ja marcada acima) em vez de escrever a cor na mao, para que o
      // escurecimento de ferido continue por baixo dela: uma torreta quase morta que carrega tem
      // de continuar lendo como quase morta.
      this.restoreTint();
      getSoundManager().playTurretCharge();
    }

    // Ela nunca devolve `true`: a torreta nao toca no heroi. Todo dano dela vem da bala, e o
    // acerto e resolvido pelo gerenciador de projetil.
    return false;
  }

  /**
   * O leque: SHOT_COUNT balas em angulos iguais, com um deslocamento que muda a cada rajada. Sem
   * esse giro, os seis raios saem sempre nas mesmas seis direcoes e existe um lugar onde a torreta
   * nunca acerta — decorar aquele lugar seria a solucao, e a peca ia calar.
   */
  private fireFan(): void {
    const offset = Math.random() * Math.PI * 2;
    for (let i = 0; i < SHOT_COUNT; i++) {
      const angle = offset + (i / SHOT_COUNT) * Math.PI * 2;
      this.shots.fire('bullet', this.worldX, this.worldY, Math.cos(angle), Math.sin(angle), SHOT_SPEED);
    }
    getSoundManager().playEnemyShot();
    // O recuo, pelo caminho do proprio EnemyBase: `render` reescreve a escala do sprite todo frame
    // (spriteScale x squash), entao um tween direto no billboard seria apagado no frame seguinte.
    // Knockback com direcao zero = so o agachamento, que e exatamente o gesto de soltar a rajada.
    this.triggerKnockback(0, 0);
  }
}

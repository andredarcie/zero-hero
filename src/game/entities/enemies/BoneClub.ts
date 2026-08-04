import type Phaser from 'phaser';

import { ASSET_KEYS } from '@/game/constants';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';

/**
 * O OSSO NA MAO DA CAVEIRA — o `SwordOrbit` do herói, do outro lado da briga.
 *
 * O herói telegrafa o golpe com a ESPADA: um arco que orbita a mão dele, sai mesmo no vazio e diz
 * o alcance da arma antes de o dano existir. A caveira telegrafava com um clarão, uma pose recuada
 * e um anel no chão — tudo certo, e nada na mão. O corpo que ENSINOU o combate deste jogo era o
 * único que batia com nada.
 *
 * ── Por que um billboard, e não o caminho do herói ──────────────────────────
 *
 * O arco do herói é um sprite 2D do Phaser DESENHADO POR CIMA do canvas 3D: ele não é ocluído por
 * nada, não recebe luz e precisa que a cena lhe conte quanta luz existe onde o herói está
 * (`SwordSlash.setLightLevel`). Isso é aceitável para a arma de quem está sempre no centro da tela
 * e sempre na frente de tudo. Para um inimigo não é: ele pode estar atrás de uma árvore, dentro da
 * sombra, do outro lado de uma pedra — e um osso desenhado por cima disso tudo denunciaria a
 * trapaça na hora.
 *
 * Então o osso é um `Billboard3D` como qualquer outro corpo: ele é iluminado, ocluído e embaçado
 * junto com o mundo, de graça.
 *
 * ── A geometria, e a razão de o osso ser simétrico ──────────────────────────
 *
 * O billboard gira em torno do PRÓPRIO CENTRO (`setAngle` roda no plano da câmera) — não há origem
 * a mover, `setOrigin` é no-op por construção. Então o gesto não pode ser "girar a arma em torno do
 * punho" como no herói; é o punho que ORBITA o corpo. O osso anda numa circunferência em volta da
 * caveira e gira junto para continuar apontando para fora — uma alavanca, que é exatamente o que um
 * fêmur na mão de um esqueleto é.
 *
 * E é por isso que a arte dele tem nó dos DOIS lados: girando em torno do centro, um osso com nó de
 * um lado só passaria metade do arco de ponta-cabeça.
 *
 * O eixo `y` da órbita é achatado (`Y_SQUASH`) pela mesma razão que as faíscas de impacto são: o
 * plano do chão está inclinado para longe da câmera, e uma órbita perfeitamente circular em tiles
 * lê como uma elipse errada na tela.
 */

/** Onde o osso descansa quando nada está acontecendo: ao lado do corpo, pendendo. */
const REST_ANGLE_DEG = 25;
const REST_RADIUS = 0.4;
const REST_ELEVATION = 0.34;
/** O tamanho do osso em tiles. Menor que o corpo: é uma arma, não um segundo bicho. */
const BONE_SIZE = 0.5;

/**
 * O ARMAR: para onde o osso vai enquanto o golpe é telegrafado — atrás e ACIMA da cabeça, do lado
 * oposto ao alvo. É a mesma leitura da pose recuada do corpo (`poseWindup`), dita pela arma: uma
 * massa levantada é uma promessa de que ela vai descer.
 */
const REAR_BEHIND_DEG = 165;
const REAR_RADIUS = 0.46;
const REAR_ELEVATION = 0.82;

/**
 * O GOLPE: o arco que o osso varre ao ser solto, em graus, e quanto ele dura.
 *
 * Curto e ADIANTADO de propósito. O dano é resolvido no instante exato em que o telegrafo estoura
 * (é o contrato de `EnemyBase.tickWindup`, e mexer nele mudaria a janela de esquiva que o jogo
 * inteiro ensina), então o osso tem de estar no alvo quase no primeiro frame do gesto — daí o
 * `Quad.easeOut`, que gasta metade do arco nos primeiros 30% do tempo. Um golpe que chegasse no
 * meio da animação mostraria o dano antes da pancada.
 */
const SWING_MS = 190;
/** Quanto o osso passa DO alvo: ele não freia em cima da coisa que acertou, ele atravessa. */
const SWING_OVERSHOOT_DEG = 45;
const SWING_RADIUS = 0.56;
const SWING_ELEVATION = 0.26;
/** A volta ao descanso, depois do golpe. Lenta: o braço morto não recolhe a arma, ele a arrasta. */
const SETTLE_MS = 280;
/** O achatamento do eixo `y` da órbita — ver o cabeçalho. */
const Y_SQUASH = 0.62;

/** A pose do osso, tweenada como números soltos e escrita no billboard a cada frame. */
type Pose = { angle: number; radius: number; elevation: number };

export class BoneClub {
  private readonly sprite: Billboard3D;
  private readonly pose: Pose = {
    angle: REST_ANGLE_DEG,
    radius: REST_RADIUS,
    elevation: REST_ELEVATION,
  };

  /**
   * O corpo dono do osso, em tiles. É reescrito todo frame pelo dono (a caveira anda, é
   * arremessada e recua), e a órbita é sempre relativa a ele — o osso nunca tem posição própria.
   */
  private ownerX: number;
  private ownerY: number;

  public constructor(
    private readonly scene: Phaser.Scene,
    worldX: number,
    worldY: number,
  ) {
    this.ownerX = worldX;
    this.ownerY = worldY;
    this.sprite = world3d()
      .addBillboard(ASSET_KEYS.undeadBone, 0, { centered: true })
      .setDisplaySize(BONE_SIZE, BONE_SIZE);
    this.apply();
  }

  public setVisible(visible: boolean): this {
    this.sprite.setVisible(visible);
    return this;
  }

  /**
   * Onde o corpo está AGORA. Recebe a posição já desenhada (com recuo e passo somados), e não o
   * tile lógico: a arma tem de acompanhar o corpo que se vê, ou ela flutua sozinha um tile à frente
   * toda vez que a caveira dá um passo — o mesmo defeito que o arco do herói teve e que
   * `visualWorld` resolveu lá.
   */
  public follow(worldX: number, worldY: number): void {
    if (worldX === this.ownerX && worldY === this.ownerY) return;
    this.ownerX = worldX;
    this.ownerY = worldY;
    this.apply();
  }

  /** O tom do corpo (o escurecimento de ferido): a arma apanha junto com quem a segura. */
  public setTint(tint: number): void {
    this.sprite.setTint(tint);
  }

  public clearTint(): void {
    this.sprite.clearTint();
  }

  /**
   * ARMA: levanta o osso atrás da cabeça, do lado oposto ao alvo, e SEGURA ali. O gesto ocupa a
   * janela inteira do telegrafo menos um respiro — a arma tem de estar parada no alto quando o
   * golpe sai, ou o jogador vê duas acelerações e não sabe qual delas é a ameaça.
   */
  public rear(dirX: number, dirY: number, windupMs: number): void {
    const strike = Math.atan2(dirY, dirX) * (180 / Math.PI);
    this.tweenTo(
      {
        angle: strike + REAR_BEHIND_DEG,
        radius: REAR_RADIUS,
        elevation: REAR_ELEVATION,
      },
      Math.max(80, windupMs * 0.6),
      'Sine.easeOut',
    );
  }

  /**
   * BATE: o osso desaba do alto por cima do alvo e ATRAVESSA, e só depois volta ao descanso.
   *
   * O arco é calculado a partir do ângulo em que o osso REALMENTE está, e não do `rear` teórico:
   * um golpe pode sair com a caveira tendo sido arremessada no meio do telegrafo, e nesse caso a
   * arma está onde o empurrão a deixou. Partir de onde ela está é a única versão que nunca salta.
   */
  public strike(dirX: number, dirY: number): void {
    const strike = Math.atan2(dirY, dirX) * (180 / Math.PI);
    // Para que lado ele desce: o caminho CURTO do ângulo atual até o alvo. Sem isto, um osso
    // armado a 165° do alvo desceria pelo lado errado em metade dos casos — uma volta inteira por
    // trás do corpo em vez do arco por cima da cabeça.
    const delta = wrapDeg(strike - this.pose.angle);
    const end = this.pose.angle + delta + Math.sign(delta || 1) * SWING_OVERSHOOT_DEG;
    this.tweenTo(
      { angle: end, radius: SWING_RADIUS, elevation: SWING_ELEVATION },
      SWING_MS,
      'Quad.easeOut', // gasta o arco cedo: o dano acontece no primeiro frame do gesto
      () => this.rest(),
    );
  }

  /** Volta ao descanso — do jeito que estiver, de onde estiver. */
  public rest(): void {
    // O ângulo de descanso é escolhido pela volta CURTA a partir de onde o osso parou, ou ele
    // desenrolaria as voltas acumuladas de trás para a frente depois de cada golpe.
    const angle = this.pose.angle + wrapDeg(REST_ANGLE_DEG - this.pose.angle);
    this.tweenTo(
      { angle, radius: REST_RADIUS, elevation: REST_ELEVATION },
      SETTLE_MS,
      'Sine.easeInOut',
    );
  }

  /**
   * SOLTA O OSSO: ele deixa de pertencer ao corpo e vira um pedaço qualquer (a caveira morreu).
   * Devolve onde ele estava, para quem for jogá-lo no ar poder continuar de lá.
   */
  public release(): { x: number; y: number; elevation: number; angle: number } {
    const at = this.orbitPoint();
    this.scene.tweens.killTweensOf(this.pose);
    return { ...at, angle: this.pose.angle + 90 };
  }

  public destroy(): void {
    if (this.scene.tweens) this.scene.tweens.killTweensOf(this.pose);
    this.sprite.destroy();
  }

  private tweenTo(to: Pose, duration: number, ease: string, onComplete?: () => void): void {
    this.scene.tweens.killTweensOf(this.pose);
    this.scene.tweens.add({
      targets: this.pose,
      angle: to.angle,
      radius: to.radius,
      elevation: to.elevation,
      duration,
      ease,
      onUpdate: () => this.apply(),
      onComplete: () => {
        this.apply();
        onComplete?.();
      },
    });
  }

  private orbitPoint(): { x: number; y: number; elevation: number } {
    const rad = this.pose.angle * (Math.PI / 180);
    return {
      x: this.ownerX + Math.cos(rad) * this.pose.radius,
      y: this.ownerY + Math.sin(rad) * this.pose.radius * Y_SQUASH,
      elevation: this.pose.elevation,
    };
  }

  private apply(): void {
    if (!this.sprite.active) return;
    const at = this.orbitPoint();
    this.sprite
      .setPosition(at.x, at.y)
      .setElevation(at.elevation)
      // +90 porque a arte é desenhada EM PÉ (o eixo longo é o y do sprite) e o osso tem de apontar
      // para FORA da órbita: no ângulo 0 (leste) ele fica deitado, que é a rotação de um quarto.
      .setAngle(this.pose.angle + 90);
  }
}

/** Um ângulo em graus dobrado para (-180, 180] — o caminho curto entre duas direções. */
const wrapDeg = (deg: number): number => {
  let d = deg % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
};

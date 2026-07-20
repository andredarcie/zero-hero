import Phaser from 'phaser';

import { getSoundManager } from '@/game/audio/SoundManager';
import { BOILER_FRAMES } from '@/game/constants';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { FX_DOT_TEXTURE, FX_PUFF_TEXTURE, FX_RING_TEXTURE, world3d } from '@/game/render3d/World3D';
import type { WorldProp } from './WorldProp';

type BoilerLook = keyof typeof BOILER_FRAMES;

// A CALDEIRA ("boiler"): o terceiro produtor de circuito, ao lado da placa de pressao e da roda
// d'agua — e o que finalmente liga o FOGO, o unico sistema que o jogador pilota, a rede de
// energia. A roda pergunta "ha agua correndo aqui?"; a caldeira pergunta "ha FOGO encostado em
// mim?" (fogueira acesa, mato/arbusto ardendo, lava, um graveto aceso pousado — ver
// GameScene.fireHeatAt). Qualquer chama vizinha serve, o que compoe com tudo que ja existe:
// um pavio plantado alimenta a fornalha em pulsos, um braco robotico entrega a tocha acesa do
// outro lado do muro, uma fogueira e um regime permanente que o balde DESLIGA — agua e fogo,
// cada elemento com sua usina e seu interruptor.
//
// A energia nasce da PRESSAO, nao diretamente do teste de fogo — o espelho exato da roda, onde
// ela nasce do giro. A pressao sobe contra a inercia termica enquanto ha chama e cai devagar
// sem ela (vapor acumulado), entao um tufo de capim que arde 2.2s compra varios segundos de
// circuito: nasce o gameplay de MANTER A FORNALHA ALIMENTADA, o loop de fazenda virando usina.
// A histerese (liga em GEN_ON, so desliga em GEN_OFF) impede a rede de tremeluzir entre dois
// tufos — um consumidor piscando a cada pulso de pavio leria como maquina quebrada.
//
// O corpo e um BILLBOARD, como todo prop do mundo — a maquina combina com a vila, nao com uma
// maquete. Os estados sao TEXTURAS trocadas nas bordas (fria / brasa acesa / lampada verde do
// dinamo — a mesma gramatica de "circuito fechou" da roda), como a fogueira troca frames; o
// que vive por cima sao os sopros de vapor, as faiscas e um tremor sutil de regime. Nenhuma
// luz THREE nova: quem ilumina a cena e o proprio fogo que aquece a maquina.

const PRESSURE_BUILD_MS = 1400; // fria -> pressao cheia sob chama continua
const PRESSURE_COOL_MS = 5200; // cheia -> zero sem chama: o "coast" que atravessa as estocadas
const GEN_ON = 0.45; // o vapor so fecha o circuito com pressao de verdade
const GEN_OFF = 0.18; // ...e so o abre de novo bem abaixo: histerese, nunca tremeluzir
const PUFF_MS = 560; // cadencia da valvula soltando vapor em regime
// Uma ESTOCADA direta da tocha do heroi (bump com o graveto aceso) acende a fornalha por
// dentro por este tempo. E deliberadamente um RELOGIO, nao um interruptor: com stoke + coast o
// jogador compra ~8s de circuito por viagem, entao rodar uma maquina so na tocha e possivel —
// mas e ir e voltar alimentando a fornalha, nunca apertar um botao e ir embora. Fontes fixas
// (fogueira, lava, pavio) continuam sendo o jeito de deixar a usina ligada sozinha.
const STOKE_BURN_MS = 4000;

const SPRITE_SIZE = 0.92; // arte 16x16 da Sprite Factory num tile — nada vaza do tile
const VALVE_ELEV = 0.5; // ombro do domo, de onde o vapor sopra
const CHIMNEY_X = -0.14; // a chamine fica a esquerda do eixo na arte
const POWER_GREEN = 0x7dde99;
const STEAM_TINT = 0xdce4ea;

export class BoilerObject implements WorldProp {
  private readonly sprite: Billboard3D;

  private pressure01 = 0;
  private heated = false;
  private stokeMs = 0;
  private powered = false;
  private look: BoilerLook = 'cold';
  private puffMs = PUFF_MS;
  private aliveMs = 0;
  private dead = false;
  private readonly effects = new Set<Billboard3D>();

  public constructor(
    private readonly scene: Phaser.Scene,
    public readonly worldX: number,
    public readonly worldY: number,
    public readonly variable?: string,
  ) {
    this.sprite = world3d()
      .addBillboard('boiler', BOILER_FRAMES.cold, { groundShadow: true })
      .setPosition(worldX, worldY)
      .setDisplaySize(SPRITE_SIZE, SPRITE_SIZE);
  }

  /** A fornalha e um corpo de pedra e ferro; ninguem atravessa a maquina. */
  public get blocking(): boolean { return true; }

  /** Ha chama encostada agora (o teste vem da cena — fireHeatAt). */
  public get isHeated(): boolean { return this.heated; }

  /** Pressao de vapor normalizada, exposta a debug/playtest (0 fria, 1 regime). */
  public get pressure(): number { return this.pressure01; }

  /** Saida eletrica real: segue viva pelo vapor acumulado depois que a chama morre. */
  public get isGenerating(): boolean { return this.powered; }

  /**
   * A tocha do heroi acende a fornalha POR DENTRO (bump com o graveto aceso): uma queima com
   * relogio, realimentavel — re-estocar antes de apagar so enche o relogio de novo. A chama da
   * tocha nao se gasta na transferencia, como ao acender uma fogueira.
   */
  public stoke(): void {
    this.stokeMs = STOKE_BURN_MS;
  }

  public update(deltaMs: number, externalHeat: boolean, effectsVisible: boolean): void {
    if (this.dead) return;
    this.aliveMs += deltaMs;

    // Calor de fora (fireHeatAt) OU a queima interna da estocada — a fornalha nao distingue.
    this.stokeMs = Math.max(0, this.stokeMs - deltaMs);
    const heated = externalHeat || this.stokeMs > 0;

    if (heated !== this.heated) {
      this.heated = heated;
      if (heated && effectsVisible) {
        getSoundManager().playBoilerIgnite();
        world3d().shake(120, 0.008);
      }
    }

    const target = heated ? 1 : 0;
    const rampMs = target > this.pressure01 ? PRESSURE_BUILD_MS : PRESSURE_COOL_MS;
    const maxStep = deltaMs / rampMs;
    this.pressure01 += Math.sign(target - this.pressure01)
      * Math.min(Math.abs(target - this.pressure01), maxStep);

    // Energia com histerese: liga com pressao de verdade, so desliga quase vazia — dois tufos
    // de capim em sequencia mantem a rede acesa em vez de piscar o consumidor a cada pulso.
    const wasPowered = this.powered;
    if (!this.powered && this.pressure01 >= GEN_ON) this.powered = true;
    else if (this.powered && this.pressure01 <= GEN_OFF) this.powered = false;

    if (this.powered !== wasPowered) {
      if (this.powered) {
        if (effectsVisible) {
          getSoundManager().playBoilerPower();
          this.spawnPowerPulse();
        }
      } else if (effectsVisible) {
        getSoundManager().playBoilerStop();
      }
    }

    // O estado e uma TEXTURA, trocada so nas bordas: gerando mostra a lampada verde do dinamo;
    // aquecida sem pressao mostra a brasa na boca; fria e ferro morto. A leitura de longe.
    const look: BoilerLook = this.powered ? 'on' : this.heated ? 'hot' : 'cold';
    if (look !== this.look) {
      this.look = look;
      this.sprite.setTexture('boiler', BOILER_FRAMES[look]);
    }

    // Regime: um tremor quase subliminar — a maquina TRABALHANDO, a mesma ideia do braco que
    // respira. setAngle gira no plano da camera, o certo para um tremor de corpo de sprite.
    const strain = Math.max(0, this.pressure01 - 0.85) / 0.15;
    this.sprite.setAngle(strain > 0 ? Math.sin(this.aliveMs * 0.055) * 1.1 * strain : 0);

    // Vapor e som so perto do heroi (a regra da roda: cem caldeiras autoradas nunca criam cem
    // fumacas invisiveis). A fisica acima continua correndo fora da tela.
    if (effectsVisible && this.pressure01 > 0.25) {
      this.puffMs -= deltaMs * (0.35 + this.pressure01);
      if (this.puffMs <= 0) {
        this.puffMs += PUFF_MS;
        this.spawnSteamPuff();
        getSoundManager().playBoilerPuff(this.pressure01);
      }
    } else {
      this.puffMs = Math.min(PUFF_MS, this.puffMs);
    }
  }

  /** Um sopro de vapor pelo ombro do tanque (e, aquecida, fumaca fina pela chamine). */
  private spawnSteamPuff(): void {
    const puff = world3d()
      .addBillboard(FX_PUFF_TEXTURE, 0, { centered: true, fog: false, depthWrite: false, emissive: true, alphaTest: 0.02 })
      .setTint(STEAM_TINT)
      .setPosition(this.worldX + 0.14, this.worldY - 0.02)
      .setElevation(VALVE_ELEV)
      .setDisplaySize(0.11, 0.11)
      .setAlpha(0.55);
    this.effects.add(puff);
    this.scene.tweens.add({
      targets: puff,
      x: puff.x + 0.05 + Math.random() * 0.08,
      elevation: VALVE_ELEV + 0.3 + Math.random() * 0.14,
      displayWidth: 0.22,
      displayHeight: 0.22,
      alpha: 0,
      duration: 620 + Math.random() * 240,
      ease: 'Quad.easeOut',
      onComplete: () => this.retireEffect(puff),
    });

    if (this.heated) {
      const smoke = world3d()
        .addBillboard(FX_PUFF_TEXTURE, 0, { centered: true, fog: false, depthWrite: false, emissive: true, alphaTest: 0.02 })
        .setTint(0x8d8880)
        .setPosition(this.worldX + CHIMNEY_X, this.worldY - 0.02)
        .setElevation(SPRITE_SIZE - 0.05)
        .setDisplaySize(0.08, 0.08)
        .setAlpha(0.4);
      this.effects.add(smoke);
      this.scene.tweens.add({
        targets: smoke,
        x: smoke.x + (Math.random() - 0.5) * 0.1,
        elevation: SPRITE_SIZE + 0.3,
        displayWidth: 0.18,
        displayHeight: 0.18,
        alpha: 0,
        duration: 900 + Math.random() * 300,
        ease: 'Sine.easeOut',
        onComplete: () => this.retireEffect(smoke),
      });
    }
  }

  /** O vapor fechou o circuito: a mesma onda verde + faiscas do dinamo, aqui sobre o chao. */
  private spawnPowerPulse(): void {
    const ring = world3d()
      .addBillboard(FX_RING_TEXTURE, 0, {
        flat: true, flatY: 0.03, additive: true, fog: false, depthWrite: false,
      })
      .setTint(POWER_GREEN)
      .setPosition(this.worldX, this.worldY)
      .setDisplaySize(0.2, 0.2)
      .setAlpha(0.72);
    this.effects.add(ring);
    this.scene.tweens.add({
      targets: ring,
      scaleX: 1.15,
      scaleY: 1.15,
      alpha: 0,
      duration: 560,
      ease: 'Quad.easeOut',
      onComplete: () => this.retireEffect(ring),
    });

    for (let i = 0; i < 5; i += 1) {
      const spark = world3d()
        .addBillboard(FX_DOT_TEXTURE, 0, {
          centered: true, fog: false, additive: true, depthWrite: false, emissive: true,
        })
        .setTint(i % 2 === 0 ? POWER_GREEN : 0xf8e394)
        .setPosition(this.worldX + 0.02, this.worldY + 0.03)
        .setElevation(0.34)
        .setDisplaySize(0.055, 0.055);
      this.effects.add(spark);
      this.scene.tweens.add({
        targets: spark,
        x: spark.x + (Math.random() - 0.5) * 0.32,
        y: spark.y + (Math.random() - 0.5) * 0.12,
        elevation: 0.55 + Math.random() * 0.22,
        alpha: 0,
        duration: 330 + i * 55,
        delay: i * 35,
        ease: 'Quad.easeOut',
        onComplete: () => this.retireEffect(spark),
      });
    }
  }

  private retireEffect(effect: Billboard3D): void {
    this.effects.delete(effect);
    effect.destroy();
  }

  public destroy(): void {
    this.dead = true;
    this.sprite.destroy();
    for (const effect of this.effects) {
      this.scene.tweens.killTweensOf(effect);
      effect.destroy();
    }
    this.effects.clear();
  }
}

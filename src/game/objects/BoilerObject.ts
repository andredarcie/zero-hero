import Phaser from 'phaser';
import * as THREE from 'three';

import { getSoundManager } from '@/game/audio/SoundManager';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { getStoneTexture } from '@/game/render3d/stoneTexture';
import { FX_DOT_TEXTURE, FX_PUFF_TEXTURE, FX_RING_TEXTURE, world3d } from '@/game/render3d/World3D';
import type { WorldProp } from './WorldProp';

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

const PRESSURE_BUILD_MS = 1400; // fria -> pressao cheia sob chama continua
const PRESSURE_COOL_MS = 5200; // cheia -> zero sem chama: o "coast" que atravessa as estocadas
const GEN_ON = 0.45; // o vapor so fecha o circuito com pressao de verdade
const GEN_OFF = 0.18; // ...e so o abre de novo bem abaixo: histerese, nunca tremeluzir
const PUFF_MS = 560; // cadencia da valvula soltando vapor em regime

const TANK_R = 0.2;
const FIREBOX_H = 0.3;
const POWER_GREEN = 0x7dde99;
const POWER_OFF = 0x454b52;
const EMBER_COLD = new THREE.Color(0x241c14);
const EMBER_HOT = new THREE.Color(0xd2622a);
const STEAM_TINT = 0xdce4ea;

/**
 * Gerador a vapor em 3D real, na mesma linguagem da roda d'agua: fornalha de pedra com a boca
 * em brasa, tanque de ferro rebitado com domo, chamine, valvula de vapor e a MESMA lampada de
 * status do dinamo — o vocabulario visual de "circuito fechou" e um so no jogo inteiro. Nada
 * aqui e billboard animado: o que vive sao a cor da brasa (segue o calor), os sopros de vapor
 * (seguem a pressao) e um tremor sutil de regime. Nenhuma luz THREE nova — quem ilumina a cena
 * e o proprio fogo que aquece a maquina, que ja traz a sua do pool.
 */
export class BoilerObject implements WorldProp {
  private readonly root = new THREE.Group();
  private readonly meshes: THREE.Mesh[] = [];
  private readonly statusLamp: THREE.Mesh;
  private readonly emberGlow: THREE.Mesh;

  private pressure01 = 0;
  private heated = false;
  private powered = false;
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
    const w3 = world3d();
    this.root.position.set(worldX, 0, worldY);
    w3.scene.add(this.root);

    const attach = (
      geometry: THREE.BufferGeometry,
      skin: number | THREE.Texture,
      parent: THREE.Object3D = this.root,
    ): THREE.Mesh => {
      const mesh = w3.addLitMesh(geometry, skin);
      parent.add(mesh); // reparenta sem perder o material quantizado criado pelo World3D
      this.meshes.push(mesh);
      return mesh;
    };

    const stone = getStoneTexture('slab');
    const ironDark = 0x5c626b;
    const ironLight = 0x9aa0a8;

    // ── Fornalha ────────────────────────────────────────────────────────────
    // Pedra no chao, com a boca escura voltada para a camera (+z, como a lampada do dinamo) e
    // a brasa DENTRO dela — a cor da brasa e o termometro que se le de longe.
    const firebox = attach(new THREE.BoxGeometry(0.56, FIREBOX_H, 0.44), stone);
    firebox.position.set(0, FIREBOX_H / 2, 0);
    const mouth = attach(new THREE.BoxGeometry(0.3, 0.16, 0.04), 0x14100c);
    mouth.position.set(0, 0.12, 0.215);
    this.emberGlow = attach(new THREE.BoxGeometry(0.22, 0.09, 0.03), EMBER_COLD.getHex());
    this.emberGlow.position.set(0, 0.1, 0.23);

    // ── Tanque + domo ──────────────────────────────────────────────────────
    const tank = attach(new THREE.CylinderGeometry(TANK_R, TANK_R + 0.015, 0.34, 10), ironLight);
    tank.position.set(0, FIREBOX_H + 0.17, 0);
    // Duas cintas rebitadas: o que faz um cilindro liso ler como caldeira e nao como cano.
    for (const bandY of [FIREBOX_H + 0.08, FIREBOX_H + 0.27]) {
      const band = attach(new THREE.CylinderGeometry(TANK_R + 0.012, TANK_R + 0.012, 0.035, 10), ironDark);
      band.position.set(0, bandY, 0);
    }
    const dome = attach(new THREE.SphereGeometry(TANK_R, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), ironLight);
    dome.position.set(0, FIREBOX_H + 0.34, 0);

    // ── Chamine e valvula ──────────────────────────────────────────────────
    const chimney = attach(new THREE.CylinderGeometry(0.05, 0.06, 0.3, 8), ironDark);
    chimney.position.set(-0.09, FIREBOX_H + 0.56, -0.08);
    const valve = attach(new THREE.CylinderGeometry(0.032, 0.032, 0.09, 6), ironDark);
    valve.position.set(0.13, FIREBOX_H + 0.5, 0.05);
    valve.rotation.z = -0.5;

    // ── Lampada de status ──────────────────────────────────────────────────
    // A mesma gramatica do dinamo da roda: geometria na face da camera, material troca com o
    // circuito. Quem ja viu uma roda gerar le esta maquina sem tutorial.
    this.statusLamp = attach(new THREE.BoxGeometry(0.075, 0.09, 0.035), POWER_OFF);
    this.statusLamp.position.set(0, FIREBOX_H + 0.14, TANK_R + 0.012);
  }

  /** A fornalha e um corpo de pedra e ferro; ninguem atravessa a maquina. */
  public get blocking(): boolean { return true; }

  /** Ha chama encostada agora (o teste vem da cena — fireHeatAt). */
  public get isHeated(): boolean { return this.heated; }

  /** Pressao de vapor normalizada, exposta a debug/playtest (0 fria, 1 regime). */
  public get pressure(): number { return this.pressure01; }

  /** Saida eletrica real: segue viva pelo vapor acumulado depois que a chama morre. */
  public get isGenerating(): boolean { return this.powered; }

  public update(deltaMs: number, heated: boolean, effectsVisible: boolean): void {
    if (this.dead) return;
    this.aliveMs += deltaMs;

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

    // A brasa e o termometro: acesa ela queima laranja; sem chama, morre junto com a pressao.
    const emberMat = this.emberGlow.material as THREE.MeshLambertMaterial;
    emberMat.color.lerpColors(EMBER_COLD, EMBER_HOT, heated ? 1 : this.pressure01 * 0.55);

    // Energia com histerese: liga com pressao de verdade, so desliga quase vazia — dois tufos
    // de capim em sequencia mantem a rede acesa em vez de piscar o consumidor a cada pulso.
    const wasPowered = this.powered;
    if (!this.powered && this.pressure01 >= GEN_ON) this.powered = true;
    else if (this.powered && this.pressure01 <= GEN_OFF) this.powered = false;

    if (this.powered !== wasPowered) {
      const material = this.statusLamp.material as THREE.MeshLambertMaterial;
      material.color.setHex(this.powered ? POWER_GREEN : POWER_OFF);
      if (this.powered) {
        if (effectsVisible) {
          getSoundManager().playBoilerPower();
          this.spawnPowerPulse();
        }
      } else if (effectsVisible) {
        getSoundManager().playBoilerStop();
      }
    }

    // Regime: um tremor quase subliminar no corpo todo — a maquina TRABALHANDO, a mesma ideia
    // do braco que respira. Abaixo do limiar a caldeira fica perfeitamente parada.
    const strain = Math.max(0, this.pressure01 - 0.85) / 0.15;
    this.root.rotation.z = strain > 0 ? Math.sin(this.aliveMs * 0.055) * 0.006 * strain : 0;

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

  /** Um sopro de vapor pela valvula (e, aquecida, fumaca fina pela chamine). */
  private spawnSteamPuff(): void {
    const puff = world3d()
      .addBillboard(FX_PUFF_TEXTURE, 0, { centered: true, fog: false, depthWrite: false, emissive: true, alphaTest: 0.02 })
      .setTint(STEAM_TINT)
      .setPosition(this.worldX + 0.15, this.worldY + 0.02)
      .setElevation(FIREBOX_H + 0.56)
      .setDisplaySize(0.11, 0.11)
      .setAlpha(0.55);
    this.effects.add(puff);
    this.scene.tweens.add({
      targets: puff,
      x: puff.x + 0.05 + Math.random() * 0.08,
      elevation: FIREBOX_H + 0.86 + Math.random() * 0.14,
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
        .setPosition(this.worldX - 0.09, this.worldY - 0.02)
        .setElevation(FIREBOX_H + 0.72)
        .setDisplaySize(0.08, 0.08)
        .setAlpha(0.4);
      this.effects.add(smoke);
      this.scene.tweens.add({
        targets: smoke,
        x: smoke.x + (Math.random() - 0.5) * 0.1,
        elevation: FIREBOX_H + 1.05,
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
        .setElevation(FIREBOX_H + 0.2)
        .setDisplaySize(0.055, 0.055);
      this.effects.add(spark);
      this.scene.tweens.add({
        targets: spark,
        x: spark.x + (Math.random() - 0.5) * 0.32,
        y: spark.y + (Math.random() - 0.5) * 0.12,
        elevation: FIREBOX_H + 0.45 + Math.random() * 0.22,
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
    this.root.removeFromParent();
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => material.dispose());
    }
    this.meshes.length = 0;
    for (const effect of this.effects) {
      this.scene.tweens.killTweensOf(effect);
      effect.destroy();
    }
    this.effects.clear();
  }
}

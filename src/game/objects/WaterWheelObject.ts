import Phaser from 'phaser';
import * as THREE from 'three';

import { getSoundManager } from '@/game/audio/SoundManager';
import { WATER_WHEEL_FRAMES } from '@/game/constants';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { getStoneTexture } from '@/game/render3d/stoneTexture';
import { getWoodTexture } from '@/game/render3d/woodTexture';
import {
  FX_DOT_TEXTURE, FX_RING_TEXTURE, WATER_DEPTH_TILES, world3d,
} from '@/game/render3d/World3D';
import type { WorldProp } from './WorldProp';

// A roda ocupa o PROPRIO tile de rio. O vetor diz por qual vizinho a corrente continua e serve
// apenas para orientar spray; agua debaixo da maquina e a precondicao fisica da geracao.
export type WaterFlow = Readonly<{ dx: number; dy: number }>;

const FRAME_MS = 90; // equivalente visual dos 8 frames Sprite Factory por quarto de volta
const START_MS = 900; // a corrente precisa vencer a inercia do aro e do dinamo
const COAST_MS = 1800; // sem agua, a roda nao congela: perde momento devagar
const POWER_THRESHOLD = 0.3; // o dinamo so fecha o circuito depois de ganhar giro suficiente
const SPRAY_MS = 430; // uma batida d'agua a cada grupo de pas, em velocidade nominal

const WATER_SURFACE = -WATER_DEPTH_TILES + 0.03;
const ROTOR_X = -0.065; // abre espaco para o dinamo na direita sem encolher a roda
const ROTOR_CENTER_Y = 0.055;
const ROTOR_RADIUS = 0.43;
const ROTOR_DEPTH = 0.24;
const RIM_TUBE = 0.045;
const WATER_TINTS = [0x9fcbd7, 0xbfe7eb, 0x557998] as const;
const POWER_GREEN = 0x7dde99;
const POWER_OFF = 0x454b52;
const METAL_DARK = 0x454b52;
const METAL_MID = 0x7c7e8b;
const COPPER_DARK = 0x815938;
const COPPER_LIGHT = 0xb7916a;

/**
 * Gerador hidraulico em 3D real. O rotor e uma hierarquia THREE: dois aros low-poly separados em
 * profundidade, seis raios em cada face, oito pas volumetricas, cubo, eixo e ferragens. O cavalete
 * tambem tem frente e fundo, e o dinamo e montado em camadas com tomada propria na borda do tile.
 * `rotation.z` gira todo o conjunto fisico; nada e billboard animado no runtime. Materiais usam
 * as mesmas texturas/paleta pixel-art da carpintaria, pedra e mecanismos do jogo.
 */
export class WaterWheelObject implements WorldProp {
  private readonly root = new THREE.Group();
  private readonly rotor = new THREE.Group();
  private readonly meshes: THREE.Mesh[] = [];
  private readonly statusLamp: THREE.Mesh;

  private speed01 = 0;
  private phase = 0; // 0..8 = um quarto de volta; a forma fecha porque os raios sao simetricos
  private visualFrame = 0; // paridade com o icone Sprite Factory, exposta so para debug/playtest
  private flowing = false;
  private powered = false;
  private sprayMs = SPRAY_MS;
  private flowDir: WaterFlow = { dx: 0, dy: 1 };
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

    const rimWood = getWoodTexture('stringer');
    const paddleWood = getWoodTexture('plankA');
    const postWood = getWoodTexture('post');
    const darkWood = 0x63452c;
    const metal = getStoneTexture('boulder');

    // ── Cavalete dentro do canal ────────────────────────────────────────────
    // Dois cavaletes A (frente/fundo) deixam a estrutura ter profundidade real. As quatro pernas
    // nascem no leito e somem parcialmente sob a superficie do canal.
    const legH = ROTOR_CENTER_Y + WATER_DEPTH_TILES;
    for (const z of [-0.12, 0.16]) {
      const leftLeg = attach(new THREE.BoxGeometry(0.075, legH, 0.075), postWood);
      leftLeg.position.set(ROTOR_X - 0.22, -WATER_DEPTH_TILES + legH / 2, z);
      leftLeg.rotation.z = -0.24;
      const rightLeg = attach(new THREE.BoxGeometry(0.075, legH, 0.075), postWood);
      rightLeg.position.set(ROTOR_X + 0.22, -WATER_DEPTH_TILES + legH / 2, z);
      rightLeg.rotation.z = 0.24;

      const saddle = attach(new THREE.BoxGeometry(0.59, 0.065, 0.075), darkWood);
      saddle.position.set(ROTOR_X, ROTOR_CENTER_Y - 0.025, z);
    }
    // Travessa axial liga os dois cavaletes e impede que parecam duas silhuetas soltas.
    const frameTie = attach(new THREE.BoxGeometry(0.075, 0.075, 0.38), rimWood);
    frameTie.position.set(ROTOR_X, ROTOR_CENTER_Y - 0.025, 0.02);

    // ── Rotor ───────────────────────────────────────────────────────────────
    this.rotor.position.set(ROTOR_X, ROTOR_CENTER_Y, 0.02);
    this.root.add(this.rotor);

    // Dois aros separados vendem a espessura da roda mesmo parada. O aro de tras e mais escuro;
    // o da frente leva a textura de madeira da ponte, ambos facetados e sem suavizacao PBR.
    const rimZs = [-ROTOR_DEPTH / 2, ROTOR_DEPTH / 2] as const;
    rimZs.forEach((z, face) => {
      const rim = attach(
        new THREE.TorusGeometry(ROTOR_RADIUS, RIM_TUBE, 4, 16),
        face === 0 ? darkWood : rimWood,
        this.rotor,
      );
      rim.position.z = z;
      rim.rotation.z = Math.PI / 16;
    });

    // Cada face recebe tres barras inteiras = seis raios conectados. A face traseira escura e a
    // dianteira clara criam leitura de gaiola, sem aumentar o numero de raios na silhueta.
    rimZs.forEach((z, face) => {
      for (let i = 0; i < 3; i += 1) {
        const spoke = attach(
          new THREE.BoxGeometry(ROTOR_RADIUS * 1.72, 0.048, 0.045),
          face === 0 ? darkWood : rimWood,
          this.rotor,
        );
        spoke.position.z = z;
        spoke.rotation.z = i * Math.PI / 3;
      }
    });

    // Oito pas largas atravessam os dois aros. Cada pa recebe uma cinta metalica escura na raiz:
    // detalhe simples, grande o bastante para sobreviver ao pixelScale do renderer.
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2;
      const px = Math.cos(angle) * (ROTOR_RADIUS + 0.02);
      const py = Math.sin(angle) * (ROTOR_RADIUS + 0.02);
      const paddle = attach(new THREE.BoxGeometry(0.21, 0.08, ROTOR_DEPTH + 0.08), paddleWood, this.rotor);
      paddle.position.set(px, py, 0);
      paddle.rotation.z = angle + Math.PI / 2;

      const clamp = attach(new THREE.BoxGeometry(0.09, 0.026, ROTOR_DEPTH + 0.095), METAL_DARK, this.rotor);
      clamp.position.set(px, py, 0);
      clamp.rotation.z = angle + Math.PI / 2;
    }

    // Cubo principal + tampas nas duas faces: a junta agora tem profundidade e borda legivel.
    const hub = attach(new THREE.CylinderGeometry(0.105, 0.105, ROTOR_DEPTH + 0.1, 8), METAL_MID, this.rotor);
    hub.rotation.x = Math.PI / 2;
    const capZs = [-ROTOR_DEPTH / 2 - 0.065, ROTOR_DEPTH / 2 + 0.065] as const;
    capZs.forEach((z, face) => {
      const cap = attach(
        new THREE.CylinderGeometry(0.12, 0.12, 0.026, 8),
        face === 0 ? METAL_DARK : METAL_MID,
        this.rotor,
      );
      cap.position.z = z;
      cap.rotation.x = Math.PI / 2;
    });
    const axle = attach(new THREE.CylinderGeometry(0.05, 0.05, 0.64, 8), METAL_MID);
    axle.position.set(ROTOR_X, ROTOR_CENTER_Y, 0.02);
    axle.rotation.x = Math.PI / 2;

    // ── Dinamo ─────────────────────────────────────────────────────────────
    // Eixo frontal leva o movimento ate a caixa. Base, corpo e tampa em degraus substituem o
    // bloco unico anterior; duas cintas de cobre dizem "bobina/gerador" sem texto ou UI.
    const driveShaft = attach(new THREE.BoxGeometry(0.35, 0.045, 0.055), METAL_DARK);
    driveShaft.position.set(0.16, ROTOR_CENTER_Y, 0.185);

    const dynamoBase = attach(new THREE.BoxGeometry(0.34, 0.065, 0.3), METAL_DARK);
    dynamoBase.position.set(0.37, -0.105, 0.06);
    const housing = attach(new THREE.BoxGeometry(0.255, 0.255, 0.255), metal);
    housing.position.set(0.39, 0.035, 0.06);
    const housingCap = attach(new THREE.BoxGeometry(0.29, 0.055, 0.29), METAL_MID);
    housingCap.position.set(0.39, 0.19, 0.06);
    // Bobinas aplicadas NA FACE: no primeiro passe elas atravessavam a profundidade da caixa e
    // quase desapareciam sob a textura. Agora sao duas faixas frontais de cobre bem separadas.
    for (const x of [0.325, 0.455]) {
      const coil = attach(new THREE.BoxGeometry(0.03, 0.205, 0.028), x < 0.4 ? COPPER_LIGHT : COPPER_DARK);
      coil.position.set(x, 0.025, 0.202);
    }

    // A tomada avanca ate a borda leste: o cabo do tile vizinho encosta aqui sem cruzar a roda.
    const socket = attach(new THREE.BoxGeometry(0.12, 0.09, 0.16), METAL_DARK);
    socket.position.set(0.51, -0.015, 0.075);
    const terminal = attach(new THREE.BoxGeometry(0.035, 0.035, 0.11), COPPER_LIGHT);
    terminal.position.set(0.535, -0.015, 0.165);

    this.statusLamp = attach(new THREE.BoxGeometry(0.085, 0.085, 0.035), POWER_OFF);
    this.statusLamp.position.set(0.39, 0.095, 0.205);
  }

  /** O cavalete/eixo ocupam o tile de rio; ninguem atravessa a maquina nem a agua sob ela. */
  public get blocking(): boolean { return true; }

  /** Agua ativa existe sob a roda e continua para ao menos um tile vizinho. */
  public get hasFlow(): boolean { return this.flowing; }

  /** Velocidade normalizada exposta ao debug/playtest (0 parada, 1 regime). */
  public get speed(): number { return this.speed01; }

  /** Banco equivalente da arte da fabrica, util para testar lampada/orientacao sem ler THREE. */
  public get frame(): number { return this.visualFrame; }

  /** Angulo continuo do rotor 3D; permite provar movimento real sem depender de uma captura. */
  public get rotation(): number { return this.rotor.rotation.z; }

  /** Saida eletrica real: continua por um breve coast mesmo depois de a agua sumir. */
  public get isGenerating(): boolean { return this.powered; }

  public update(deltaMs: number, flow: WaterFlow | null, effectsVisible: boolean): void {
    if (this.dead) return;
    const hasFlow = flow !== null;
    if (flow) this.flowDir = flow;

    if (hasFlow !== this.flowing) {
      this.flowing = hasFlow;
      if (hasFlow) this.kickStart(effectsVisible);
      else if (effectsVisible) getSoundManager().playWaterWheelStop();
    }

    const target = hasFlow ? 1 : 0;
    const rampMs = target > this.speed01 ? START_MS : COAST_MS;
    const maxStep = deltaMs / rampMs;
    this.speed01 += Math.sign(target - this.speed01)
      * Math.min(Math.abs(target - this.speed01), maxStep);

    // A energia nasce do giro, nao diretamente do teste de agua. Isso da inercia legivel tanto
    // na partida quanto no desligamento e impede "corrente eletrica instantanea" numa roda parada.
    const wasPowered = this.powered;
    this.powered = this.speed01 >= POWER_THRESHOLD;

    if (this.speed01 > 0.001) {
      this.phase = (this.phase + (deltaMs / FRAME_MS) * this.speed01) % WATER_WHEEL_FRAMES.phases;
    }
    const phaseFrame = Math.floor(this.phase) % WATER_WHEEL_FRAMES.phases;
    this.visualFrame = (this.powered ? WATER_WHEEL_FRAMES.powered : WATER_WHEEL_FRAMES.off) + phaseFrame;
    // `phase` percorre 0..8 enquanto um quarto de volta fecha a forma; o grupo 3D recebe o
    // angulo continuo, sem saltos de sprite entre esses pontos de amostragem.
    this.rotor.rotation.z = -(this.phase / WATER_WHEEL_FRAMES.phases) * (Math.PI / 2);

    if (this.powered !== wasPowered) {
      const material = this.statusLamp.material as THREE.MeshLambertMaterial;
      material.color.setHex(this.powered ? POWER_GREEN : POWER_OFF);
      // Lampada fisica, nao overlay: um emissive baixo mantem o verde legivel na noite sem criar
      // uma nova PointLight (a quantidade de luzes do renderer e deliberadamente fixa).
      material.emissive.setHex(this.powered ? 0x183d24 : 0x000000);
      material.emissiveIntensity = this.powered ? 0.85 : 0;
      if (this.powered) {
        if (effectsVisible) {
          getSoundManager().playWaterWheelPower();
          this.spawnPowerPulse();
        }
      } else if (effectsVisible) {
        this.spawnPowerDownSpark();
      }
    }

    // Particulas e audio so existem perto do heroi. A geometria continua girando fora da tela,
    // mas cem rodas autoradas nunca criam cem sprays invisiveis nem uma cachoeira global.
    if (effectsVisible && hasFlow && this.speed01 > 0.45) {
      this.sprayMs -= deltaMs * this.speed01;
      if (this.sprayMs <= 0) {
        this.sprayMs += SPRAY_MS;
        this.spawnPaddleSpray();
        getSoundManager().playWaterWheelPaddle(this.speed01);
      }
    } else {
      this.sprayMs = Math.min(SPRAY_MS, this.sprayMs);
    }
  }

  private kickStart(effectsVisible: boolean): void {
    if (!effectsVisible) return;
    getSoundManager().playWaterWheelStart();
    world3d().shake(140, 0.012);
    this.spawnPaddleSpray(6);
  }

  /** Agua levantada pela pa diretamente da superficie do tile que a roda ocupa. */
  private spawnPaddleSpray(count = 3): void {
    const { dx, dy } = this.flowDir;
    const tx = -dy;
    const ty = dx;
    for (let i = 0; i < count; i += 1) {
      const side = (Math.random() - 0.5) * 0.34;
      const startX = this.worldX + dx * 0.16 + tx * side;
      const startY = this.worldY + dy * 0.16 + ty * side;
      const drop = world3d()
        .addBillboard(FX_DOT_TEXTURE, 0, {
          centered: true, fog: false, depthWrite: false, emissive: true, alphaTest: 0.02,
        })
        .setTint(WATER_TINTS[i % WATER_TINTS.length])
        .setPosition(startX, startY)
        .setElevation(WATER_SURFACE + 0.035 + Math.random() * 0.04)
        .setDisplaySize(i === 0 ? 0.1 : 0.07, i === 0 ? 0.1 : 0.07)
        .setAlpha(0.9);
      this.effects.add(drop);
      this.scene.tweens.add({
        targets: drop,
        x: startX + dx * (0.22 + Math.random() * 0.2) + tx * side * 0.5,
        y: startY + dy * (0.22 + Math.random() * 0.2) + ty * side * 0.5,
        elevation: WATER_SURFACE + 0.28 + Math.random() * 0.22,
        alpha: 0,
        duration: 300 + Math.random() * 180,
        ease: 'Quad.easeOut',
        onComplete: () => this.retireEffect(drop),
      });
    }
  }

  /** O dinamo fechou o circuito: onda verde sobre a agua + faiscas subindo da carcaca. */
  private spawnPowerPulse(): void {
    const ring = world3d()
      .addBillboard(FX_RING_TEXTURE, 0, {
        flat: true, flatY: WATER_SURFACE + 0.025, additive: true, fog: false, depthWrite: false,
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
        .setPosition(this.worldX + 0.39, this.worldY + 0.03)
        .setElevation(ROTOR_CENTER_Y + 0.05)
        .setDisplaySize(0.055, 0.055);
      this.effects.add(spark);
      this.scene.tweens.add({
        targets: spark,
        x: spark.x + (Math.random() - 0.5) * 0.32,
        y: spark.y + (Math.random() - 0.5) * 0.12,
        elevation: ROTOR_CENTER_Y + 0.3 + Math.random() * 0.22,
        alpha: 0,
        duration: 330 + i * 55,
        delay: i * 35,
        ease: 'Quad.easeOut',
        onComplete: () => this.retireEffect(spark),
      });
    }
  }

  /** Ultimo brilho do circuito perdendo tensao; pequeno para nao parecer uma explosao. */
  private spawnPowerDownSpark(): void {
    const spark = world3d()
      .addBillboard(FX_DOT_TEXTURE, 0, {
        centered: true, fog: false, additive: true, depthWrite: false, emissive: true,
      })
      .setTint(POWER_OFF)
      .setPosition(this.worldX + 0.39, this.worldY + 0.03)
      .setElevation(ROTOR_CENTER_Y + 0.05)
      .setDisplaySize(0.07, 0.07);
    this.effects.add(spark);
    this.scene.tweens.add({
      targets: spark,
      elevation: ROTOR_CENTER_Y + 0.16,
      alpha: 0,
      duration: 240,
      ease: 'Quad.easeOut',
      onComplete: () => this.retireEffect(spark),
    });
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

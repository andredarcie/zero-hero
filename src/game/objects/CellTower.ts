import * as Engine from '@/game/engine';
import * as THREE from 'three';

import { platform } from '@/game/platform/platform';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { WHITE_SAFE_TINT } from '@/game/render3d/pixelForms';
import { TOWER_TEXTURE } from '@/game/render3d/relicTextures';
import { CELL_TOWER_OFFSET, TOWER_H, TOWER_LIGHTS_PX, TOWER_W } from '@/game/render3d/towerArt';
import { FX_DOT_TEXTURE, world3d } from '@/game/render3d/World3D';
import { terrainHeightAt } from '@/game/world/relief';

/**
 * A TORRE DE TELEFONIA DO JARDIM ALTO (pedido do autor, 2026-11-18): na ponta do cume, no canto de trás, longe de onde
 * os amigos sentam em volta da fogueira e de onde a nave da Thea pousa. Só enfeite: ninguém fala dela, e ela fica lá,
 * com as luzes vermelhas de obstáculo piscando, de dia e de noite. O desenho é o render3d/towerArt; ocupa o tile dela
 * (WorldQuery.isSolidForEntities), como toda peça em pé.
 *
 * EM PÉ NA TELA, E PARADA (pedidos do autor: "parece que ela está caindo"; e depois "faça a torre ser fixa e não torta e
 * nunca se mexer ao mover o herói"). Um quadro em pé visto de cima em perspectiva se abre para fora longe do meio da tela:
 * numa árvore de dois tiles isso não se vê, numa torre de cinco o topo tombava por cima do paredão. A primeira correção
 * girava a torre no plano dela a cada quadro, pelo lugar dela na tela — então ela girava quando o herói andava, e o
 * desenho girado saía com os pixels tortos.
 *
 * Agora o quadro dela fica PARALELO À TELA: a mesma rotação da câmera (`faceCamera`), deitado para trás no ângulo dela
 * em volta do pé. Um plano paralelo à tela é projetado sem perspectiva nenhuma — só escala —, então o "para cima" do
 * desenho é o "para cima" da tela em qualquer canto do quadro, e cada pixel da arte cai reto. E a câmera que segue o
 * herói só ANDA (posição e alvo se movem juntos: CameraRig.follow), nunca gira: a torre não se mexe enquanto ele anda.
 * A altura leva o cosseno da inclinação, para ela ter na tela o mesmo tamanho de antes (um quadro em pé visto de cima
 * encurta na mesma conta).
 */

/** 16 px por tile, como o resto do mundo. */
const WIDTH = TOWER_W / 16;
const HEIGHT = TOWER_H / 16;
const LIGHT_RED = 0xff4a32;
/**
 * O desenho recuado dentro do tile dela, para o lado do meio do cume e para a frente: o pé não fica rente à quina e
 * sobra grama entre ele e o paredão (pedido do autor: "ficou na beirada quase caindo"). O tile que ela ocupa é o mesmo.
 */
const INSET = { dx: -0.16, dy: 0.28 } as const;
/** O piscar: acende rápido, fica, apaga rápido, e espera no escuro (a luz de obstáculo pisca ~30 vezes por minuto). */
const BLINK_FADE_MS = 120;
const BLINK_ON_MS = 640;
const BLINK_OFF_MS = 1100;

type Lamp = { body: Billboard3D; dx: number; e: number; nearer: number };

export class CellTower {
  public readonly x: number;
  public readonly y: number;
  private readonly body: Billboard3D;
  /** As lâmpadas e o halo de cada uma (todas piscam juntas), com o lugar delas no desenho (tiles, a partir do pé). */
  private readonly lamps: Lamp[] = [];
  /** O "para cima" e o "para a direita" da tela, no mundo: os eixos do quadro dela (ver faceCamera). */
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly right = new THREE.Vector3(1, 0, 0);
  /** A altura do quadro no mundo (tiles): HEIGHT encurtada pelo cosseno da inclinação. */
  private tall = HEIGHT;
  /** Já foi posta de frente para a câmera uma vez (o primeiro quadro sempre acerta, mesmo com a câmera ainda na origem). */
  private placed = false;
  private readonly scratch = new THREE.Vector3();
  private readonly scratch2 = new THREE.Vector3();

  public constructor(private readonly scene: Engine.Scene, hearth: { x: number; y: number }) {
    this.x = hearth.x + CELL_TOWER_OFFSET.dx;
    this.y = hearth.y + CELL_TOWER_OFFSET.dy;
    const w3 = world3d();
    // O tom de quem tem branco na arte (pixelForms): sem ele, as faixas brancas estouram ao sol. A sombra de contato
    // escala com a largura do desenho (1,5): os raios aqui a deixam do tamanho do tile, sem vazar pela quina do cume.
    this.body = w3.objects.addBillboard(TOWER_TEXTURE, 0, { groundShadow: { rx: 0.32, rz: 0.2, alpha: 0.32 }, castGroundShadow: false })
      .setTint(WHITE_SAFE_TINT)
      .setPosition(this.footX, this.footY)
      .setDisplaySize(WIDTH, HEIGHT);
    // A luz não pega névoa nem noite: é ela que se vê de longe, no escuro.
    for (const lamp of TOWER_LIGHTS_PX) {
      const top = lamp.y < TOWER_H / 4;
      const glow = (size: number, nearer: number, boost?: number): Lamp => ({
        body: w3.objects
          .addBillboard(FX_DOT_TEXTURE, 0, { emissive: true, additive: true, centered: true, fog: false, alphaTest: 0.01, emissiveBoost: boost })
          .setTint(LIGHT_RED)
          .setDisplaySize(size, size)
          .setAlpha(0),
        dx: (lamp.x - TOWER_W / 2) / 16,
        e: (TOWER_H - lamp.y) / 16,
        nearer,
      });
      this.lamps.push(glow(top ? 0.95 : 0.7, 0.02), glow(top ? 0.26 : 0.2, 0.03, 2.2));
    }
    this.faceCamera();
    scene.tweens.add({
      targets: this.lamps.map((l) => l.body),
      alpha: 1,
      duration: BLINK_FADE_MS,
      hold: BLINK_ON_MS,
      yoyo: true,
      repeat: -1,
      repeatDelay: BLINK_OFF_MS,
      ease: 'Sine.easeOut',
    });
    scene.events.on(Engine.Scenes.Events.POST_UPDATE, this.faceCamera, this);
  }

  private get footX(): number { return this.x + INSET.dx; }
  private get footY(): number { return this.y + INSET.dy; }

  /** A torre ocupa o tile dela. */
  public at(x: number, y: number): boolean {
    return x === this.x && y === this.y;
  }

  /** O quanto as luzes estão acesas agora, de 0 a 1 (o playtest fotografa os dois momentos). */
  public get lit(): number {
    return this.lamps[0]?.body.alpha ?? 0;
  }

  /** O quanto ela deita para trás, em graus: a inclinação da câmera (a mesma em qualquer lugar do mapa). */
  public get backDegrees(): number {
    return (Math.acos(Math.min(1, this.up.y)) * 180) / Math.PI;
  }

  /** O quanto o topo está fora do prumo do pé na tela, agora (pixels; o playtest cobra perto de zero). */
  public get lean(): number {
    const cam = world3d().camera;
    const ground = terrainHeightAt(this.footX, this.footY);
    const foot = this.scratch.set(this.footX, ground, this.footY).project(cam);
    const top = this.scratch2.set(this.footX, ground, this.footY).addScaledVector(this.up, this.tall).project(cam);
    return ((top.x - foot.x) * platform().display.width) / 2;
  }

  /**
   * PARALELA À TELA: a rotação da câmera inteira, em volta do pé (o quadro tem a origem no pé). Com a câmera parada no
   * ângulo — ela só anda atrás do herói — isto não muda nada de um quadro para o outro, e a conta para logo na entrada.
   */
  private faceCamera(): void {
    const cam = world3d().camera;
    const q = this.body.mesh.quaternion;
    if (this.placed && q.equals(cam.quaternion)) return;
    q.copy(cam.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(q);
    this.right.set(1, 0, 0).applyQuaternion(q);
    // (de cima a tela "encurta" o que fica em pé por este cosseno: a torre fica do tamanho que já tinha na tela)
    this.tall = HEIGHT * Math.max(0.2, this.up.y);
    this.body.setDisplaySize(WIDTH, this.tall);
    this.placeLamps();
    this.placed = true;
  }

  /** As luzes no lugar delas no desenho, nos eixos do quadro (o desenho encolhe junto na altura). */
  private placeLamps(): void {
    const ground = terrainHeightAt(this.footX, this.footY);
    const k = this.tall / HEIGHT;
    for (const lamp of this.lamps) {
      const e = lamp.e * k;
      const lx = this.footX + this.right.x * lamp.dx + this.up.x * e;
      const ly = this.footY + this.right.z * lamp.dx + this.up.z * e + lamp.nearer;
      const height = ground + this.right.y * lamp.dx + this.up.y * e;
      // Cada billboard pisa no chão de onde o centro dele cai (Billboard3D.apply): a lâmpada do alto, deitada para trás,
      // pode cair no tile de trás, que é o planalto, um andar abaixo do cume. A diferença volta para a altura dela.
      lamp.body.setPosition(lx, ly).setElevation(height - terrainHeightAt(lx, ly));
    }
  }

  public destroy(): void {
    this.scene.events.off(Engine.Scenes.Events.POST_UPDATE, this.faceCamera, this);
    for (const { body } of this.lamps) {
      this.scene.tweens.killTweensOf(body);
      body.destroy();
    }
    this.lamps.length = 0;
    this.body.destroy();
  }
}

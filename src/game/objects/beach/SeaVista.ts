import * as THREE from 'three';

import { seaSkyFor, type SeaSky } from '@/game/render3d/SeaSky';
import { world3d } from '@/game/render3d/World3D';
import type { CameraLens } from '@/game/render3d/world/CameraRig';
import { getTimeScale } from '@/game/runtime/timeOfDay';
import { terrainHeightAt } from '@/game/world/relief';

import { smooth, type BeachFrame, type BeachSystem } from './kit';

/**
 * O AR E O CÉU DO MAR.
 *
 * Andando, a câmera na praia é a de SEMPRE (pedido do autor, 2026-11-19: "quando o personagem andar no mirante, ou na
 * areia, ou no mar, a câmera fica como é padrão mesmo, fixa"). A primeira versão baixava a câmera até o horizonte no
 * mirante e na beira d'água, e ela ficava mudando enquanto ele andava; isso saiu. O que fica do jogo:
 *
 *   · O AR DO MAR: descendo para a duna, o fog, o fundo e a névoa de distância passam para a bruma do mar da hora (ver
 *     SEA_AIR). É cor, não câmera.
 *   · A CÂMERA DO HORIZONTE, só para o playtest (`forced`, `gameDebug.beach.holdVista`): desce para trás do herói e
 *     levanta os olhos (CameraRig.CameraLens), com o céu da hora (render3d/SeaSky) e o astro. O jogador não a vê.
 */

/** O olho, atrás e acima do herói, e o ponto que ele olha, à frente (tiles; a altura é sobre o chão do herói). */
const EYE_UP = 3.2;
const EYE_BACK = 6.2;
const LOOK_UP = 0.7;
const LOOK_AHEAD = 7.5;
/**
 * A lente abre para caber o mar e o céu: 52° no total. A do chão tinha 30° e hoje tem 18° (a câmera HD-2D,
 * worldParams, 2026-11-19); o olho daqui é próprio, então o quadro do mar continua o mesmo: 22 + 12.
 */
const FOV_EXTRA = 34;
/** Em quanto tempo a câmera acompanha (s). */
const EASE_S = 0.85;
/**
 * O AR DO MAR (pedido do autor, 2026-11-19, "sim" a deixar a névoa azulada sobre o mar): com a câmera HD-2D, quem está
 * na praia tem o MAR inteiro no alto do quadro, e a névoa de distância do vale (poeira dourada) sobre ele lia como lama.
 * Descendo para a duna (linha do mundo -7 → -11), o fog, o fundo e a névoa do pós passam para a bruma do mar.
 */
const SEA_AIR_FROM = -7;
const SEA_AIR_TO = -11;
const SEA_AIR = 0.85;
/** A bruma do horizonte do mar em cada hora (WorldScreen.horizon), como se vê. */
const HAZE_DAY = new THREE.Color('#bcd6e8');
const HAZE_GOLD = new THREE.Color('#f2bc8c');
const HAZE_DAWN = new THREE.Color('#f3c4b6');
const HAZE_NIGHT = new THREE.Color('#0b1122');

/** O rumo do astro na hora `time` do mostrador: o sol de dia, a lua de noite — a mesma conta que deita as sombras. */
export const luminaryAt = (time: number, out: THREE.Vector3): THREE.Vector3 => {
  const angle = time * Math.PI * 2;
  const elevation = Math.sin((time - 0.25) * Math.PI * 2);
  const up = Math.min(1, Math.abs(elevation));
  const alt = Math.asin(up * 0.74);
  // na virada (o sol ou a lua rente ao horizonte) o disco mergulha um fio abaixo dele
  const dip = 0.065 * (1 - Math.min(1, up / 0.12));
  return out.set(-Math.cos(angle) * Math.cos(alt), Math.sin(alt) - dip, -Math.sin(angle) * Math.cos(alt));
};


export class SeaVista implements BeachSystem {
  private readonly lens: CameraLens = { blend: 0, eye: new THREE.Vector3(), look: new THREE.Vector3() };
  private readonly sun = new THREE.Vector3();
  private sky?: SeaSky;
  private active = false;
  /** O quanto a câmera baixou (0 = a de sempre, 1 = no horizonte; a janela do playtest lê). */
  public blend = 0;
  /** O ar do mar neste quadro (0 = o do vale; ver SEA_AIR). */
  public air = 0;
  /** Playtest: prende a câmera neste valor (null = ela segue o herói). */
  public forced: number | null = null;
  /** O quanto as nuvens do céu do mar já andaram (s de vento). */
  private drift = 0;

  public update(f: BeachFrame): void {
    const w = world3d();
    // A CÂMERA NÃO BAIXA SOZINHA (pedido do autor, 2026-11-19: "quando o personagem andar no mirante, ou na areia, ou no
    // mar, a câmera fica como é padrão mesmo, fixa"). Ela baixava até o horizonte no mirante e na beira d'água, e ficava
    // mudando enquanto ele andava. Agora só o playtest a prende (`forced`); andando, é sempre a câmera de sempre.
    const target = this.forced ?? 0;
    // outra cena está com a câmera (o céu da primeira noite, o chá): esta não entra
    const taken = w.cam.lens !== null && w.cam.lens !== this.lens;
    const goal = taken ? 0 : target;
    // Suave, mas com fim: só a exponencial nunca chega, e a câmera ficaria um fio fora do lugar por segundos.
    const gap = goal - this.blend;
    const step = Math.max(Math.abs(gap) * (1 - Math.exp(-f.dt / EASE_S)), 0.22 * f.dt);
    this.blend = Math.abs(gap) <= step ? goal : this.blend + Math.sign(gap) * step;
    // o ar do mar anda no mesmo passo (um teleporte para fora da praia não deixa o vale azul nem por um quadro a mais
    // do que o passo dura)
    const airGoal = f.world.busy() ? this.air : SEA_AIR * smooth(SEA_AIR_FROM, SEA_AIR_TO, f.hero.y);
    const airGap = airGoal - this.air;
    const airStep = Math.max(Math.abs(airGap) * (1 - Math.exp(-f.dt / EASE_S)), 0.22 * f.dt);
    this.air = Math.abs(airGap) <= airStep ? airGoal : this.air + Math.sign(airGap) * airStep;
    if (this.blend <= 0.002 || taken) {
      this.release();
      this.setHorizon(w, this.air, f.phase);
      return;
    }
    this.active = true;
    const ground = terrainHeightAt(f.hero.x, f.hero.y);
    this.lens.eye.set(f.hero.x, ground + EYE_UP, f.hero.y + EYE_BACK);
    this.lens.look.set(f.hero.x, ground + LOOK_UP, f.hero.y - LOOK_AHEAD);
    // a curva sai suave nas duas pontas
    const k = this.blend * this.blend * (3 - 2 * this.blend);
    this.lens.blend = k;
    w.cam.lens = this.lens;
    w.screen.fovExtra = k * FOV_EXTRA;
    w.screen.calm = k;
    this.setHorizon(w, Math.max(k, this.air), f.phase);
    this.sky ??= seaSkyFor(w.scene);
    this.sky.show(true);
    const fog = (w.scene.fog as THREE.FogExp2 | null)?.color ?? (w.scene.background as THREE.Color);
    // as nuvens andam com o relógio do JOGO: sentado, o tempo corre e elas passam depressa sobre o mar (com teto, para
    // não virarem um borrão)
    this.drift += f.dt * Math.min(12, Math.max(1, getTimeScale() * 0.5));
    // (a troca de manhã para tarde é ao meio-dia e à meia-noite, quando o peso do sol rente é zero: não se vê)
    this.sky.update(
      w.camera, Math.min(1, k * 1.6), fog, luminaryAt(f.phase, this.sun), w.params.daylight, w.params.golden, w.elapsed, this.drift,
      f.phase < 0.5 ? 0 : 1,
    );
  }

  /**
   * A bruma do horizonte (WorldScreen.horizon: o fog, o fundo e a névoa de distância do pós puxam para ela): clara de
   * dia, rosa ao nascer do sol, pêssego na hora dourada da tarde, anil de noite — o ar do vale é poeira dourada, e sobre
   * o mar ela lia como lama.
   */
  private setHorizon(w: ReturnType<typeof world3d>, amount: number, phase: number): void {
    w.screen.horizon.color.copy(HAZE_NIGHT).lerp(HAZE_DAY, w.params.daylight).lerp(phase < 0.5 ? HAZE_DAWN : HAZE_GOLD, w.params.golden);
    w.screen.horizon.amount = amount;
  }

  /**
   * OLHAR O MAR (scenes/game/SeaWatch): sentado na cadeira do guarda-sol, a câmera desce até o horizonte e fica lá até
   * ele levantar. É o único lugar do jogo em que ela faz isso sozinha (a fonte termal NÃO: ela não vê o mar).
   */
  public watch(on: boolean): void {
    this.forced = on ? 1 : null;
  }

  /** A câmera volta a ser a de sempre (só o que esta cena ligou é desligado). */
  private release(): void {
    if (!this.active) return;
    this.active = false;
    const w = world3d();
    if (w.cam.lens === this.lens) {
      w.cam.lens = null;
      w.screen.fovExtra = 0;
      w.screen.calm = 0;
      w.screen.horizon.amount = 0;
    }
    this.lens.blend = 0;
    this.sky?.show(false);
  }

  public destroy(): void {
    this.blend = 0;
    this.air = 0;
    this.release();
    world3d().screen.horizon.amount = 0;
  }
}

import * as THREE from 'three';
import type * as Engine from '@/game/engine';

import { getSoundManager } from '@/game/audio/SoundManager';
import type { TripStage } from '@/game/audio/StorySounds';
import { restingLook } from '@/game/render3d/TripPass';
import { world3d } from '@/game/render3d/World3D';
import type { CameraLens } from '@/game/render3d/world/CameraRig';
import { getTimeOfDay, setTimeOfDay } from '@/game/runtime/timeOfDay';
import { TRIP_HOURS, TRIP_S, tripFrame } from '@/game/runtime/trip';
import { terrainHeightAt } from '@/game/world/relief';
import { getWorldBounds } from '@/game/world/WorldData';

/**
 * A VIAGEM DO CHÁ DA SHUI (pedido do autor), na tela: a regra do tempo é `runtime/trip`, o desenho dos efeitos é o
 * `render3d/TripPass`; aqui mora a câmera (dentro do elmo, olhando a Shui; depois o voo sobre o vale) e
 * o céu, que passa correndo um dia inteiro e mais umas horas. Ao fim tudo volta ao jogo de sempre.
 */

export interface TeaTripHost {
  scene: Engine.Scene;
  /** Onde o herói está sentado (o olho fica na cabeça dele) e quem está na frente dele (a Shui). */
  seat: { x: number; y: number };
  facing: { x: number; y: number };
  /** O corpo some na primeira pessoa (a câmera está dentro dele) e volta quando ela sai. */
  showHero: (on: boolean) => void;
  /** "Reduzir movimento": a viagem fica mais lenta e sem clarão branco. */
  reduced: boolean;
}

/** Cada etapa com som, e o segundo em que ela começa. */
const CUES: ReadonlyArray<readonly [number, TripStage]> = [
  [1.2, 'inside'], [5, 'tingle'], [12, 'colors'], [21, 'open'], [22.8, 'tunnel'], [37.3, 'bloom'], [55.5, 'return'],
];

/**
 * O olho dentro do elmo: a altura da fresta, um passo atrás do corpo (de dentro dele a Shui encheria o T inteiro), e
 * uma lente aberta (é a vista de quem está ali, não a de uma maquete).
 */
const EYE_HEIGHT = 0.66;
const EYE_BACK = 0.6;
const EYE_FOV_EXTRA = 38;
/** O voo: uma lente um pouco mais aberta que a do chão. */
const FLIGHT_FOV_EXTRA = 10;
/**
 * O CAMINHO DA BORBOLETA sobre o vale, em tiles (x, altura, y): uma volta por dentro dele, da colina da pedra de
 * meditar ao acampamento e de volta pelo sul até o herói. O primeiro ponto (logo acima dele) e o último (onde a câmera
 * de sempre fica) saem de onde ele está sentado.
 */
const FLIGHT_WAYPOINTS: ReadonlyArray<readonly [number, number, number]> = [
  [14, 7, 38], [21, 8, 29], [30, 9, 23], [40, 8, 25], [46, 8, 34], [44, 8, 44], [33, 8, 48], [20, 8, 48],
];
/** A câmera do voo olha um ponto do chão uns tiles à frente, sempre dentro do vale (nunca o fora do mundo). */
const LOOK_AHEAD = 8;
const LOOK_MARGIN = 8;

export class TeaTrip {
  private readonly scratch = { at: new THREE.Vector3(), ahead: new THREE.Vector3() };

  public constructor(private readonly host: TeaTripHost) {}

  public async run(): Promise<void> {
    const w = world3d();
    const { scene, seat, reduced } = this.host;
    const pass = w.screen.trip;
    Object.assign(pass.look, restingLook(), { reduced, webX: seat.x, webY: seat.y });
    pass.enabled = true;
    const lens: CameraLens = { blend: 0, eye: new THREE.Vector3(), look: new THREE.Vector3() };
    w.cam.lens = lens;
    const path = this.flightPath();
    const startTime = getTimeOfDay();
    const sound = getSoundManager().story;
    const clock = { t: 0 };
    let last = 0;
    let travel = 0;
    let cue = 0;
    await new Promise<void>((resolve) => {
      scene.tweens.add({
        targets: clock,
        t: TRIP_S,
        duration: TRIP_S * 1000,
        ease: 'Linear',
        onUpdate: () => {
          const t = clock.t;
          const f = tripFrame(t, reduced);
          const dt = Math.max(0, t - last);
          last = t;
          travel += f.speed * dt;
          while (cue < CUES.length && t >= CUES[cue][0]) sound.playTrip(CUES[cue++][1]);
          Object.assign(pass.look, {
            time: t, visor: f.visor, open: f.open, specks: f.specks, rainbow: f.rainbow, breathe: f.breathe, hue: f.hue,
            form: f.form, tunnel: f.tunnel, travel, spin: f.spin, web: f.web, webR: f.webR,
            trail: f.trail, white: f.white, dark: f.dark,
          });
          lens.blend = f.lens;
          w.screen.calm = f.lens;
          if (f.view === 'eye') {
            this.placeEye(lens, t);
            w.screen.fovExtra = EYE_FOV_EXTRA;
          } else if (f.view === 'flight') {
            this.placeFlight(lens, path, f.flight);
            w.screen.fovExtra = FLIGHT_FOV_EXTRA * f.lens;
          } else {
            w.screen.fovExtra = 0;
          }
          this.host.showHero(f.view !== 'eye');
          // O tempo deixou de valer: um dia inteiro passa correndo no voo, e mais as horas de verdade.
          setTimeOfDay(startTime + f.sky * (1 + TRIP_HOURS / 24));
        },
        onComplete: () => resolve(),
      });
    });
    pass.enabled = false;
    pass.release();
    Object.assign(pass.look, restingLook());
    w.cam.lens = null;
    w.screen.calm = 0;
    w.screen.fovExtra = 0;
    setTimeOfDay(startTime + TRIP_HOURS / 24);
    this.host.showHero(true);
  }

  /** Dentro do elmo: o olho na cabeça do herói sentado, olhando a Shui, balançando com a respiração. */
  private placeEye(lens: CameraLens, t: number): void {
    const { seat, facing, reduced } = this.host;
    const sway = reduced ? 0 : 0.018;
    lens.eye.set(
      seat.x + Math.sin(t * 0.7) * sway,
      terrainHeightAt(seat.x, seat.y) + EYE_HEIGHT + Math.sin(t * 0.9) * sway,
      seat.y + EYE_BACK,
    );
    lens.look.set(facing.x, terrainHeightAt(facing.x, facing.y) + 0.52, facing.y);
  }

  /** No voo: o ponto do caminho, olhando o chão à frente de para onde ele vai. */
  private placeFlight(lens: CameraLens, path: THREE.CatmullRomCurve3, u: number): void {
    const { at, ahead } = this.scratch;
    path.getPointAt(Math.min(1, u), at);
    path.getPointAt(Math.min(1, u + 0.02), ahead);
    ahead.sub(at).setY(0);
    if (ahead.lengthSq() < 1e-6) ahead.set(0, 0, -1);
    ahead.normalize();
    const b = getWorldBounds();
    const gx = THREE.MathUtils.clamp(at.x + ahead.x * LOOK_AHEAD, b.minTileX + LOOK_MARGIN, b.maxTileX - LOOK_MARGIN);
    const gy = THREE.MathUtils.clamp(at.z + ahead.z * LOOK_AHEAD, b.minTileY + LOOK_MARGIN, b.maxTileY - LOOK_MARGIN);
    lens.eye.copy(at);
    lens.look.set(gx, terrainHeightAt(gx, gy), gy);
  }

  private flightPath(): THREE.CatmullRomCurve3 {
    const { seat } = this.host;
    const p = world3d().params;
    const ground = terrainHeightAt(seat.x, seat.y);
    const points = [
      new THREE.Vector3(seat.x, ground + 3, seat.y + 1.5),
      ...FLIGHT_WAYPOINTS.map(([x, h, y]) => new THREE.Vector3(x, terrainHeightAt(x, y) + h, y)),
      new THREE.Vector3(seat.x + 4, ground + 9, seat.y + 10),
      new THREE.Vector3(seat.x, ground + p.camHeight, seat.y + p.camBack),
    ];
    return new THREE.CatmullRomCurve3(points, false, 'centripetal');
  }
}

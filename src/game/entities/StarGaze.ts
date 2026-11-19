import * as THREE from 'three';
import type * as Engine from '@/game/engine';

import { getSoundManager } from '@/game/audio/SoundManager';
import { starDomeFor } from '@/game/render3d/StarDome';
import { world3d } from '@/game/render3d/World3D';
import type { CameraLens } from '@/game/render3d/world/CameraRig';
import { GAZE_TOTAL_S, gazeFrame } from '@/game/runtime/starGaze';
import { terrainHeightAt } from '@/game/world/relief';

/**
 * O CÉU DA PRIMEIRA NOITE (pedido do autor): o herói deitado no colchão do acampamento, e a câmera, que sempre olhou o
 * chão de cima, desce até perto dele e gira devagar para o céu estrelado. Lá em cima ela fica um tempo, uma estrela
 * cadente risca o céu, e ela volta para o chão. A regra do tempo é `runtime/starGaze`; aqui se monta a cúpula
 * (render3d/StarDome) e a câmera de cena (CameraLens), e tudo sai no fim.
 */

export interface StarGazeHost {
  scene: Engine.Scene;
  /** O tile em que ele está deitado: o olho fica logo atrás dele. */
  at: { x: number; y: number };
}

/** O olho, lá no fim da subida: um pouco acima e atrás da cabeça de quem está deitado. */
const EYE_HEIGHT = 1.6;
const EYE_BACK = 0.9;
/** Para onde ele olha lá em cima: o céu do norte, com as copas da clareira recortadas embaixo do quadro. */
const SKY_PITCH = THREE.MathUtils.degToRad(25);
/**
 * O quadro abre olhando o céu: 56° no total. A lente do chão era 30° e hoje é 18° (a câmera HD-2D, worldParams,
 * 2026-11-19); o olho daqui é próprio, então o céu continua o mesmo: 26 + 12.
 */
const SKY_FOV_EXTRA = 38;

export class StarGaze {
  public constructor(private readonly host: StarGazeHost) {}

  public async run(): Promise<void> {
    const w = world3d();
    const { at, scene } = this.host;
    const dome = starDomeFor(w.scene);
    dome.show(true);
    const ground = terrainHeightAt(at.x, at.y);
    const forward = new THREE.Vector3(0, Math.sin(SKY_PITCH), -Math.cos(SKY_PITCH));
    const lens: CameraLens = {
      blend: 0,
      eye: new THREE.Vector3(at.x, ground + EYE_HEIGHT, at.y + EYE_BACK),
      look: new THREE.Vector3(),
    };
    lens.look.copy(lens.eye).add(forward);
    // A estrela cadente atravessa o quadro de cima à esquerda para baixo à direita, uns 30° de céu em menos de 1 s.
    const up = new THREE.Vector3(0, Math.cos(SKY_PITCH), Math.sin(SKY_PITCH));
    const right = new THREE.Vector3(1, 0, 0);
    const from = forward.clone().addScaledVector(right, -0.42).addScaledVector(up, 0.24);
    const to = forward.clone().addScaledVector(right, 0.14).addScaledVector(up, -0.1);
    w.cam.lens = lens;
    let streaked = false;
    const clock = { t: 0 };
    await new Promise<void>((resolve) => {
      scene.tweens.add({
        targets: clock,
        t: GAZE_TOTAL_S,
        duration: GAZE_TOTAL_S * 1000,
        ease: 'Linear',
        onUpdate: () => {
          const f = gazeFrame(clock.t);
          lens.blend = f.blend;
          w.screen.calm = f.blend;
          w.screen.fovExtra = f.blend * SKY_FOV_EXTRA;
          dome.level = Math.min(1, f.blend / 0.25);
          dome.update(w.camera, w.scene.background as THREE.Color, w.elapsed);
          dome.meteor(from, to, f.meteor);
          if (f.meteor >= 0 && !streaked) {
            streaked = true;
            getSoundManager().story.playShootingStar();
          }
        },
        onComplete: () => resolve(),
      });
    });
    w.cam.lens = null;
    w.screen.calm = 0;
    w.screen.fovExtra = 0;
    dome.show(false);
  }
}

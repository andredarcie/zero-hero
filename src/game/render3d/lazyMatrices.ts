import * as THREE from 'three';

/**
 * MATRIZES SÓ QUANDO ALGO SE MEXEU.
 *
 * O three recompõe a matriz LOCAL de todo objeto a cada quadro (`updateMatrix`) e, por isso, também
 * a matriz de MUNDO (`matrixWorldNeedsUpdate` vira true) — mesmo que posição, rotação e escala não
 * tenham mudado em nada. Este mundo tem ~860 objetos e quase todos ficam parados (as pedras, os
 * arbustos, a sombra e o blob de cada um): no celular fraco (CPU 6× mais lenta) isso era 6% do
 * quadro, recalculando matrizes idênticas.
 *
 * Aqui a pose que gerou a matriz fica guardada, e `updateMatrix` só recompõe quando ela muda. A
 * matriz é a MESMA que o three calcularia — o que muda é deixar de refazer a conta igual.
 *
 * Três cuidados para nunca deixar uma matriz velha:
 *   · `pivot` (raro) desliga o atalho para aquele objeto;
 *   · trocar de PAI muda o mundo sem mudar a pose — `add` esquece a pose guardada;
 *   · quem marca `matrixWorldNeedsUpdate` à mão continua sendo atendido (o three lê a flag).
 *
 * O jogo não escreve em `object.matrix` com `matrixAutoUpdate` ligado (o three a sobrescreveria de
 * qualquer jeito); quem compõe matriz própria (o campo de sombras instanciado) usa uma matriz sua.
 */

type Posed = THREE.Object3D & { zhPose?: Float64Array | null };

let installed = false;

export const installLazyMatrices = (): void => {
  if (installed) return;
  installed = true;
  const proto = THREE.Object3D.prototype;
  const compose = proto.updateMatrix;
  const add = proto.add;

  proto.updateMatrix = function updateMatrixLazily(this: Posed): void {
    const p = this.position;
    const q = this.quaternion;
    const s = this.scale;
    let pose = this.zhPose;
    if (
      pose && this.pivot === null
      && pose[0] === p.x && pose[1] === p.y && pose[2] === p.z
      && pose[3] === q.x && pose[4] === q.y && pose[5] === q.z && pose[6] === q.w
      && pose[7] === s.x && pose[8] === s.y && pose[9] === s.z
    ) {
      return;
    }
    compose.call(this);
    if (!pose) pose = this.zhPose = new Float64Array(10);
    pose[0] = p.x; pose[1] = p.y; pose[2] = p.z;
    pose[3] = q.x; pose[4] = q.y; pose[5] = q.z; pose[6] = q.w;
    pose[7] = s.x; pose[8] = s.y; pose[9] = s.z;
  };

  proto.add = function addForgettingPose(this: THREE.Object3D, ...objects: THREE.Object3D[]) {
    for (const o of objects) {
      (o as Posed).zhPose = null;
      o.matrixWorldNeedsUpdate = true;
    }
    return add.apply(this, objects);
  } as typeof proto.add;
};

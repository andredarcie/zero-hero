import type * as THREE from 'three';

/** A área de chão visível do último quadro, em tiles (ver GroundLightMap.view). */
export interface CullView { minX: number; maxX: number; minZ: number; maxZ: number }

/** Só objetos com raio menor que isto (tiles) saem da lista de render quando longe. */
export const CULL_SMALL_TILES = 4;

/** O que cullFarChildren guarda em cada filho da cena (calculado uma vez por geometria). */
type CullTagged = THREE.Object3D & {
  zhCullGeo?: THREE.BufferGeometry | null;
  /** Raio da esfera da geometria; 0 = nunca sai da lista (luz, grande, instanciada, sem culling). */
  zhCullR: number;
  zhCullCx: number;
  zhCullCz: number;
};

const classifyForCull = (o: CullTagged): void => {
  const mesh = o as unknown as THREE.Mesh;
  const geo = mesh.geometry as THREE.BufferGeometry | undefined;
  o.zhCullGeo = geo ?? null;
  o.zhCullR = 0;
  o.zhCullCx = 0;
  o.zhCullCz = 0;
  if (!mesh.isMesh || !geo || !mesh.frustumCulled || (mesh as THREE.InstancedMesh).isInstancedMesh) return;
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  const sphere = geo.boundingSphere!;
  o.zhCullR = sphere.radius;
  o.zhCullCx = sphere.center.x;
  o.zhCullCz = sphere.center.z;
};

/**
 * O RENDER SÓ PERCORRE O QUE PODE APARECER.
 *
 * O three percorre a cena inteira duas vezes por quadro — matrizes (`updateMatrixWorld`) e a
 * lista de desenho (`projectObject`, com um teste de frustum por objeto) — e ela tem ~860 filhos:
 * o sprite, o blob e a sombra de cada prop do MAPA INTEIRO, invisíveis incluídos. Num quadro de
 * celular são desenhados ~30. No celular simulado (CPU 6× mais lenta) as duas voltas eram 16%.
 *
 * Durante o render (e só nele), a lista de filhos da cena vira a dos que podem aparecer: saem os
 * invisíveis (o three não os desenharia) e os objetos PEQUENOS longe da área visível (fora até do
 * alcance de uma sombra projetada, `padTiles`). O `parent` de ninguém muda e a lista original volta logo
 * depois — quem chama a devolve com o que esta função retorna. Ficam sempre: luzes (mexer na contagem
 * recompila o mundo), malhas grandes ou instanciadas (terreno, mar, campos de sombra e de partículas) e quem
 * desligou o frustum culling. Quem volta à tela tem a matriz recalculada no quadro em que volta.
 *
 * `kept` é a lista reaproveitada a cada quadro (nada é alocado aqui). Devolve a lista original da cena.
 */
export const cullFarChildren = (
  scene: THREE.Scene, view: CullView, kept: THREE.Object3D[], padTiles: number,
): THREE.Object3D[] => {
  const all = scene.children;
  kept.length = 0;
  // A área visível uma vez por quadro (o laço passa por ~1.300 objetos).
  const minX = view.minX;
  const maxX = view.maxX;
  const minZ = view.minZ;
  const maxZ = view.maxZ;
  for (let i = 0; i < all.length; i++) {
    const o = all[i] as CullTagged;
    if (!o.visible && !(o as unknown as THREE.Light).isLight) continue;
    // A classificação (pequeno e com culling, ou não) é da GEOMETRIA: refeita só quando ela troca. Quem não tem
    // geometria (as luzes, os grupos) fica com `null` — e não é reclassificado todo quadro por isso.
    const geo = ((o as unknown as THREE.Mesh).geometry as THREE.BufferGeometry | undefined) ?? null;
    if (o.zhCullGeo !== geo) classifyForCull(o);
    if (o.zhCullR > 0 && o.children.length === 0) {
      const sc = o.scale;
      const ax = sc.x < 0 ? -sc.x : sc.x;
      const ay = sc.y < 0 ? -sc.y : sc.y;
      const az = sc.z < 0 ? -sc.z : sc.z;
      const scale = ax > ay ? (ax > az ? ax : az) : (ay > az ? ay : az);
      const reach = o.zhCullR * scale;
      if (reach < CULL_SMALL_TILES) {
        const x = o.position.x + o.zhCullCx * scale;
        const z = o.position.z + o.zhCullCz * scale;
        const pad = reach + padTiles;
        if (!(x >= minX - pad && x <= maxX + pad && z >= minZ - pad && z <= maxZ + pad)) continue;
      }
    }
    kept.push(o);
  }
  scene.children = kept;
  return all;
};

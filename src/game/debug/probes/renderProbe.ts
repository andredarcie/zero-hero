// O DESENHO (render3d): quantos programas de shader e luzes existem, quantos objetos a cena 3D tem, onde um ponto do
// mundo cai na tela, e as leituras das malhas do terreno que os cenários de arte conferem (o vento por tile, as
// emendas de cor do chão, a pedra da montanha, a margem do mar, a arte do tileset).

import * as THREE from 'three';

import { groundFrameAt } from '@/game/constants';
import { tilesetFrameUv } from '@/game/render3d/textures3d';
import type { World3D } from '@/game/render3d/World3D';
import type { GameScene } from '@/game/scenes/GameScene';

const materialOf = (m: THREE.Mesh): THREE.Material => (Array.isArray(m.material) ? m.material[0] : m.material);

export const renderProbe = (s: GameScene) => {
  const w3 = (): World3D => {
    if (!s.world3d) throw new Error('sem o mundo 3D');
    return s.world3d;
  };
  const meshNamed = (name: string): THREE.Mesh | undefined => w3().tiles.terrainMeshes.find((m) => materialOf(m)?.name === name);
  return {
    /** A textura `key` foi carregada? */
    textureLoaded: (key: string): boolean => s.textures.exists(key),
    /** Programas de shader compilados (um a mais no meio do jogo = um engasgo). */
    programs: (): number => w3().rendererInfo.programs?.length ?? 0,
    lightCount: (): number => w3().lightCount,
    /** Quantas chamas (fogueira, tocha, lanterna: toda luz de fogo do mundo) há a até `r` tiles de (x, y). */
    firesNear: (x: number, y: number, r: number): number => w3().lights.fires.filter((f) => Math.hypot(f.worldX - x, f.worldY - y) <= r).length,
    /** Quantos objetos a cena 3D tem na raiz (um efeito que nasce e não some faz isto crescer). */
    objects: (): number => w3().scene.children.length,
    /** Onde o ponto (x, y, altura z) do mundo cai na tela, em px CSS. */
    project: (x: number, y: number, z = 0): { x: number; y: number } => {
      const p = w3().projection.projectTile(x, y, z);
      return { x: p.x, y: p.y };
    },

    /**
     * O VENTO, TILE A TILE: em cada malha que carrega o atributo `aWind` (a da mata em pé e a da decoração deitada),
     * quantos tiles de cada frame obedecem ao vento ('on') e quantos ficam parados ('off'). O frame sai do UV do próprio
     * quad (a decoração é sorteada pelo bioma na hora de desenhar, então o mapa não sabe qual é); a máscara, do vértice.
     */
    windMasks: () => {
      const world = w3();
      // A grade do atlas: o frame 1 começa em u = 1/colunas, e o frame 0 em v = (linhas-1)/linhas.
      const cols = Math.round(1 / tilesetFrameUv(1).u0);
      const rows = Math.round(1 / (1 - tilesetFrameUv(0).v0));
      const out: Record<'upright' | 'decor', Record<string, { on: number; off: number }>> = { upright: {}, decor: {} };
      for (const mesh of world.tiles.terrainMeshes) {
        const wind = mesh.geometry.getAttribute('aWind');
        const uv = mesh.geometry.getAttribute('uv');
        if (!wind || !uv) continue;
        const layer = mesh.geometry === world.tiles.decorGeo ? 'decor' : 'upright';
        for (let v = 0; v + 3 < wind.count; v += 4) {
          // Um quad desmontado (o mato cortado) colapsa em zero: fica de fora.
          if (wind.getY(v) === 0 && wind.getZ(v) === 0 && wind.getX(v) === 0) continue;
          let u = Infinity; let w = Infinity;
          for (let k = 0; k < 4; k++) { u = Math.min(u, uv.getX(v + k)); w = Math.min(w, uv.getY(v + k)); }
          const frame = (rows - 1 - Math.round(w * rows)) * cols + Math.round(u * cols);
          const entry = (out[layer][String(frame)] ??= { on: 0, off: 0 });
          entry[wind.getX(v) > 0.5 ? 'on' : 'off'] += 1;
        }
      }
      return out;
    },

    /**
     * AS EMENDAS DO CHÃO: os pontos da malha de chão (a de mais vértices) onde dois vértices na mesma posição têm cores
     * diferentes (> 0,03 em algum canal) — o "risco reto" de cor que o autor viu. Só os vértices de cima (normal para o
     * alto) dentro do vale.
     */
    groundSeams: () => {
      const meshes = w3().tiles.terrainMeshes.filter((m) => {
        const mat = materialOf(m) as THREE.MeshLambertMaterial;
        return mat?.vertexColors && m.geometry.getAttribute('color') && m.geometry.getAttribute('normal');
      });
      const weight = new Map<THREE.Material, number>();
      for (const m of meshes) weight.set(materialOf(m), (weight.get(materialOf(m)) ?? 0) + m.geometry.getAttribute('position').count);
      const ground = [...weight.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      const pts = new Map<string, { x: number; y: number; z: number; list: number[][] }>();
      for (const m of meshes) {
        if (materialOf(m) !== ground) continue;
        const pos = m.geometry.getAttribute('position');
        const col = m.geometry.getAttribute('color');
        const nrm = m.geometry.getAttribute('normal');
        for (let i = 0; i < pos.count; i += 1) {
          if (nrm.getY(i) < 0.9) continue;
          const x = pos.getX(i); const y = pos.getY(i); const z = pos.getZ(i);
          if (x < -0.5 || x > 59.5 || z < -0.5 || z > 59.5) continue;
          const k = `${Math.round(x * 1000)},${Math.round(y * 100)},${Math.round(z * 1000)}`;
          const at = pts.get(k) ?? { x, y, z, list: [] };
          at.list.push([col.getX(i), col.getY(i), col.getZ(i)]);
          pts.set(k, at);
        }
      }
      const bad: Array<{ x: number; y: number; z: number; worst: number }> = [];
      for (const { x, y, z, list } of pts.values()) {
        let worst = 0;
        for (let a = 0; a < list.length; a += 1) for (let b = a + 1; b < list.length; b += 1) {
          worst = Math.max(worst, ...[0, 1, 2].map((j) => Math.abs(list[a][j] - list[b][j])));
        }
        if (worst > 0.03) bad.push({ x, y, z, worst });
      }
      return bad;
    },
    /** Algum tile sólido de um destes frames encosta no ponto (x, z) do chão (meio tile para cada lado)? */
    solidFrameNear: (x: number, z: number, frames: number[]): boolean => {
      const near = [[0, 0], [-0.5, 0], [0.5, 0], [0, -0.5], [0, 0.5]].map(([dx, dz]) => [Math.round(x + dx), Math.round(z + dz)]);
      return near.some(([tx, tz]) => w3().tiles.solidTiles.some((t) => t.x === tx && t.z === tz && frames.includes(t.frame)));
    },
    /** O frame de chão que o mapa pinta em (x, y) para o frame-base `base` (a variação de terra/grama). */
    groundFrame: (base: number, x: number, y: number): number => groundFrameAt(base, x, y),

    /** A pedra da montanha no tile (x, y): tem teto, tem a face sul, e a faixa de sombra das cores. */
    rockCube: (x: number, y: number) => {
      const mesh = meshNamed('terrain-rock');
      if (!mesh) return { mesh: false };
      const pos = mesh.geometry.getAttribute('position');
      const col = mesh.geometry.getAttribute('color');
      let top = false; let southFace = false; let shadeMin = 9; let shadeMax = -9; let topShade = -9;
      for (let i = 0; i < pos.count; i++) {
        const px = pos.getX(i); const py = pos.getY(i); const pz = pos.getZ(i);
        const mine = Math.abs(px - x) <= 0.5 + 1e-3 && Math.abs(pz - y) <= 0.5 + 1e-3;
        if (mine && py > 0.99 && pz < y - 0.49) top = true;
        if (mine && pz > y + 0.49 && py < 0.01) southFace = true;
        if (col) {
          const sh = col.getX(i);
          shadeMin = Math.min(shadeMin, sh); shadeMax = Math.max(shadeMax, sh);
          if (py > 0.99) topShade = Math.max(topShade, sh);
        }
      }
      return { mesh: true, top, southFace, shadeMin, shadeMax, topShade, verts: pos.count };
    },
    /** A margem do mar: quantos vértices da água estão em mar aberto e quantos na costa (o atributo `aShore`). */
    seaShore: () => {
      const mesh = meshNamed('terrain-sea');
      if (!mesh) return { mesh: false };
      const a = mesh.geometry.getAttribute('aShore');
      if (!a) return { mesh: true, attr: false };
      let open = 0; let coast = 0; let max = 0;
      for (let i = 0; i < a.count; i++) {
        const v = a.getX(i);
        if (v === 0) open++; else coast++;
        max = Math.max(max, v);
      }
      return { mesh: true, attr: true, open, coast, max, count: a.count };
    },
    /** Os pixels RGBA de frames 16×16 da folha do tileset (para comparar a arte de dois frames). */
    tilesetFrames: (frames: number[]): Record<string, number[]> => {
      const img = s.textures.get('forest-tileset').getSourceImage() as CanvasImageSource & { width: number; height: number };
      const cv = document.createElement('canvas');
      cv.width = img.width; cv.height = img.height;
      const cx = cv.getContext('2d');
      if (!cx) return {};
      cx.drawImage(img, 0, 0);
      const cols = img.width / 16;
      return Object.fromEntries(frames.map((f) => [String(f), Array.from(cx.getImageData((f % cols) * 16, Math.floor(f / cols) * 16, 16, 16).data)]));
    },
  };
};

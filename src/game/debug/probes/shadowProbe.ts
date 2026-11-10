// AS SOMBRAS PROJETADAS (render3d: LightProbe, SolidCastEmitter, CastShadows, os campos de sombra do terreno): a
// auditoria que o cenário `sombras` cobra, lida e medida aqui dentro, contra as classes de verdade.

import type * as THREE from 'three';

import type { World3D } from '@/game/render3d/World3D';
import type { GameScene } from '@/game/scenes/GameScene';

const frame = (): Promise<void> => new Promise((res) => requestAnimationFrame(() => res()));

export const shadowProbe = (s: GameScene) => {
  const w3 = (): World3D => {
    if (!s.world3d) throw new Error('sem o mundo 3D');
    return s.world3d;
  };
  return {
    /** O raio da poça de luz de uma fogueira e a escuridão da sombra da lua (os knobs do hd3d). */
    params: () => ({ castShadowRadius: w3().params.castShadowRadius, moonShadowAlpha: w3().params.moonShadowAlpha }),

    /**
     * A AUDITORIA. Cada número é uma lei das sombras:
     *  1. a passagem do fogo para a lua é contínua (nenhum salto de opacidade ou de rumo ao sair da poça);
     *  2. EM CIMA de uma chama não há rumo estável: a sombra cai para a da lua;
     *  3. histerese: perto da metade entre duas fogueiras, quem já projetava segue projetando;
     *  4. a sombra mirada num canal de água para na margem;
     *  5. erguer um corpo desliza a silhueta para fora dos pés dele;
     *  6. nenhum tile perde a sombra: a do fogo DESLOCA a da lua, nunca só a apaga;
     *  7. o pool de sombras não satura;
     *  8. todo tile em pé pode projetar (não só os expostos).
     */
    audit: async () => {
      const world = w3();
      const out: Record<string, unknown> = {};
      const fires = world.lights.fires;
      const fire = fires.find((f) => f.lit && f.scale > 0.5);
      out.hasFire = Boolean(fire);
      if (!fire) return out;

      // 1) a continuidade, por um raio para fora da poça
      const radius = world.params.castShadowRadius;
      let prevA: number | null = null;
      let prevDir = { x: 0, z: 0 };
      let maxAlphaJump = 0;
      let maxAngleJump = 0;
      let lastAlpha = 0;
      for (let d = 0.9; d <= radius + 2.5; d += 0.2) {
        const c = world.probe.groundCastAt(fire.worldX + d, fire.worldY);
        if (!c) { lastAlpha = 0; continue; }
        if (prevA !== null) {
          maxAlphaJump = Math.max(maxAlphaJump, Math.abs(c.alpha - prevA));
          const dot = c.dirX * prevDir.x + c.dirZ * prevDir.z;
          maxAngleJump = Math.max(maxAngleJump, Math.acos(Math.max(-1, Math.min(1, dot))));
        }
        prevA = c.alpha;
        prevDir = { x: c.dirX, z: c.dirZ };
        lastAlpha = c.alpha;
      }
      Object.assign(out, { maxAlphaJump, maxAngleJump, moonAlpha: world.params.moonShadowAlpha, endAlpha: lastAlpha });

      // 2) em cima da chama: a lua
      const onFire = world.probe.groundCastAt(fire.worldX, fire.worldY);
      const moonRot = world['moonCastRotY'];
      const moonDir = { x: -Math.sin(moonRot), z: -Math.cos(moonRot) };
      out.onFireIsMoon = Boolean(onFire)
        && Math.abs((onFire?.dirX ?? 9) - moonDir.x) < 1e-6
        && Math.abs((onFire?.dirZ ?? 9) - moonDir.z) < 1e-6
        && Math.abs((onFire?.alpha ?? 9) - world.params.moonShadowAlpha) < 1e-6;

      // 3) a histerese: uma segunda chama 6 tiles a leste (só o MODELO de sombra lê a posição; volta logo depois)
      const second = fires.find((f) => f !== fire);
      out.hasSecond = Boolean(second);
      if (second) {
        const was = { lit: second.lit, x: second.worldX, y: second.worldY };
        second.worldX = fire.worldX + 6;
        second.worldY = fire.worldY;
        second.lit = true;
        await frame();
        const mx = (fire.worldX + second.worldX) / 2;
        const my = (fire.worldY + second.worldY) / 2;
        const dx = (second.worldX - fire.worldX) * 0.02;
        const dy = (second.worldY - fire.worldY) * 0.02;
        const mem = { lastFire: null };
        const before = world.probe.groundCastAt(mx - dx, my - dy, mem);
        const across = world.probe.groundCastAt(mx + dx, my + dy, mem);
        const fresh = world.probe.groundCastAt(mx + dx, my + dy);
        out.hysteresis = Boolean(before && across && fresh)
          && Math.abs((across?.dirX ?? 0) - (before?.dirX ?? 0)) < 0.15
          && Math.abs((across?.dirX ?? 0) - (fresh?.dirX ?? 0)) > 0.001;
        second.lit = was.lit;
        second.worldX = was.x;
        second.worldY = was.y;
        await frame();
      }

      // 4) a margem: a sombra mirada direto num canal para antes de cruzá-lo
      const sunken = world.tiles.sunkenTiles;
      out.sunkenCount = sunken.size;
      const key = sunken.values().next().value;
      if (key !== undefined) {
        const sx = Math.floor(key / 16384) - 4096;
        const sz = (key % 16384) - 4096;
        const clamped = world.emit.clampCastAtSunken(sx, sz - 1, Math.PI, 3);
        out.waterClamp = clamped < 2;
        out.waterClampLen = clamped;
      }

      // 5) erguer um corpo (não o herói: a altura dele é refeita a cada quadro)
      const caster = world.casts['castCasters'].find((c) => c.bb !== s.heroBillboard && c.bb.visible && c.mesh.visible);
      out.hasElevCaster = Boolean(caster);
      if (caster) {
        await frame();
        const flat = { x: caster.mesh.position.x, z: caster.mesh.position.z };
        const wasElev = caster.bb.elevation;
        caster.bb.setElevation(wasElev + 0.6);
        await frame();
        const lifted = { x: caster.mesh.position.x, z: caster.mesh.position.z };
        caster.bb.setElevation(wasElev);
        await frame();
        out.elevationShift = Math.hypot(lifted.x - flat.x, lifted.z - flat.z);
      }

      // 6) nenhum tile sem sombra: presença (lua + fogo) >= a escuridão da lua
      await frame();
      const tiles = world.tiles;
      const moonField = tiles.moonCastField?.mesh as THREE.InstancedMesh | undefined;
      const fireField = tiles.solidCastField?.mesh as THREE.InstancedMesh | undefined;
      if (moonField && fireField) {
        const moonAttr = moonField.geometry.getAttribute('aCastAlpha');
        const fireAttr = fireField.geometry.getAttribute('aCastAlpha');
        const im = fireField.instanceMatrix.array;
        // De quem é cada silhueta de fogo: da árvore cujo PÉ está mais perto de onde ela nasce. O pé não é mais o
        // centro do tile (render3d/forest.ts tira cada árvore do centro), então arredondar a posição da sombra para
        // achar o tile erraria justamente as árvores mais deslocadas.
        const fireByTile = new Map<(typeof tiles.castableSolids)[number], number>();
        let shortest = Infinity;
        for (let i = 0; i < fireField.count; i++) {
          const o = i * 16;
          shortest = Math.min(shortest, Math.hypot(im[o + 8], im[o + 9], im[o + 10]));
          let owner: (typeof tiles.castableSolids)[number] | null = null;
          let best = 1.2;
          for (const t of tiles.solidTiles) {
            const d = Math.hypot(t.x + (t.look?.dx ?? 0) - im[o + 12], t.z + (t.look?.dz ?? 0) - im[o + 14]);
            if (d < best) { best = d; owner = t; }
          }
          if (owner) fireByTile.set(owner, fireAttr.getX(i));
        }
        out.shortestCast = shortest === Infinity ? null : shortest;
        let starved = 0;
        let worst: { x: number; z: number; moon: number; fire: number; presence: number } | null = null;
        for (const t of tiles.castableSolids) {
          if (t.moonSlot === undefined) continue;
          const moon = moonAttr.getX(t.moonSlot);
          const fireA = fireByTile.get(t) ?? 0;
          const presence = moon + fireA;
          if (presence < world.params.moonShadowAlpha - 0.01) {
            starved++;
            if (!worst || presence < worst.presence) worst = { x: t.x, z: t.z, moon: +moon.toFixed(3), fire: +fireA.toFixed(3), presence: +presence.toFixed(3) };
          }
        }
        out.starved = starved;
        out.worstStarved = worst;
        // 7) o pool
        out.castPool = fireField.count;
        out.poolCap = fireField.instanceMatrix.count;
      }

      // 8) todo tile em pé indexado para projetar
      let indexed = 0;
      for (const bucket of tiles.solidBuckets.values()) indexed += bucket.length;
      out.tilesIndexed = indexed;
      out.solidTiles = tiles.solidTiles.length;
      out.castableExposed = tiles.castableSolids.length;
      return out;
    },
  };
};

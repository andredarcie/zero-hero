// A PRAIA DO NORTE (objects/beach, objects/CoconutPalms, objects/TrailGrass, render3d/surf).

import { coastAt } from '@/game/objects/beach/kit';
import { adventureState } from '@/game/runtime/adventureState';
import { standActorsUniform } from '@/game/render3d/decorSway';
import { swashAt } from '@/game/render3d/surf';
import { world3d } from '@/game/render3d/World3D';
import type { GameScene } from '@/game/scenes/GameScene';
import { reliefAt } from '@/game/world/relief';
import { getWorldBounds } from '@/game/world/WorldData';

export const beachProbe = (s: GameScene) => ({
  /** O tamanho do mapa: as linhas de tile de norte a sul. */
  bounds: () => getWorldBounds(),
  /** O tile (x, y): o chão é areia, barra o corpo, o relevo, e a distância até a linha d'água (negativa na areia). */
  at: (x: number, y: number) => ({
    sand: s.query.isSandAt(x, y),
    sea: s.query.isOpenWaterAt(x, y),
    solid: s.query.isSolidForEntities(x, y),
    relief: reliefAt(x, y),
    coast: coastAt(x, y),
    grass: s.query.getTallGrassAt(x, y)?.isTall ?? null,
  }),
  /** A onda na coluna `x` agora: a beira da lâmina (em distância da costa), até onde ela sobe, e em que ponto do período. */
  swash: (x: number) => swashAt(x, world3d().elapsed),
  /** A câmera do mirante: o quanto baixou (0 a 1) e os graus somados à lente. */
  vista: () => ({ blend: s.valley.beach?.vista.blend ?? 0, fovExtra: world3d().screen.fovExtra, lens: world3d().cam.lensOn }),
  /** Prende a câmera do mirante num valor (null a solta). */
  holdVista: (value: number | null): void => { if (s.valley.beach) s.valley.beach.vista.forced = value; },
  /** Os bichos: caranguejos, gaivotas e maçaricos. */
  life: () => {
    const b = s.valley.beach;
    return b ? {
      crabs: b.crabs.list, scares: b.crabs.scares,
      gulls: b.gulls.state, gullFlights: b.gulls.flights,
      pipers: b.pipers.state, piperFlights: b.pipers.flights,
      washes: b.sound.washes,
    } : null;
  },
  /** Põe um caranguejo num tile (para a foto e para o susto). */
  summonCrab: (x: number, y: number): void => s.valley.beach?.crabs.summon(x, y),
  /** As pegadas: quantas no chão, quantas já deixadas, quantas a onda apagou, os respingos, e o pé molhado. */
  steps: () => {
    const st = s.valley.beach?.steps;
    return st ? { ...st.state, stepped: st.stepped, washed: st.washed, splashes: st.splashes } : null;
  },
  /** Os corpos que a água do espraio contorna (os três primeiros: x, z, raio, ligado). */
  bodies: () => standActorsUniform.value.slice(0, 3).map((v) => [v.x, v.y, v.z, v.w]),
  /** Os coqueiros do mapa. */
  palms: () => [...(s.valley.palms?.list ?? [])].map((p) => ({ x: p.x, y: p.y, kind: p.kind })),
  /** O mato da trilha que a foice já abriu (o save). */
  trailCut: () => [...adventureState().trailCut],
  /** Os montinhos de areia (em pé ou já recolhidos) e quantos o balde já levou. */
  mounds: () => ({ list: s.valley.beach?.mounds.list ?? [], taken: s.valley.beach?.mounds.taken ?? 0 }),
  /** O herói está sentado olhando o mar (a cadeira do guarda-sol, ou dentro da fonte)? */
  watching: (): boolean => s.camp.rest.isResting && Boolean(s.valley.beach?.vista.forced),
  /** A fonte termal: ele está dentro (e onde), o vapor (0..1), o corpo afundado, a noite da gruta e a câmera. */
  spring: () => ({
    soaking: s.camp.seaWatch.soaking,
    at: s.valley.beach?.spring.soakAt ?? null,
    steam: s.valley.beach?.spring.steam ?? 0,
    night: s.valley.beach?.spring.night?.night ?? 0,
    lift: s.hero.lift,
    look: s.cameraLook ?? null,
    verb: s.verbs.handVerbAt(s.playerWorld.worldX, s.playerWorld.worldY - 1),
  }),
});

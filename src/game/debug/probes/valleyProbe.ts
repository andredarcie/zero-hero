// O VALE VIVO: a natureza (esquilo, sapos, libélulas, peixe, lebre, margaridas, poças...), os passarinhos, as árvores
// grandes, a cachoeira e as carpas, o tempo (chuva), a vida do dia (borboletas, folhas, vaga-lumes), o acampamento do
// herói e os achados espalhados.

import type * as THREE from 'three';

import type { GameScene } from '@/game/scenes/GameScene';

/** O material (o primeiro, se forem vários) de um mesh: o que um cenário lê dele é a textura e a opacidade. */
const materialOf = (m: THREE.Mesh): { opacity: number; map?: unknown } => (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshBasicMaterial;

export const valleyProbe = (s: GameScene) => {
  const nature = () => {
    const n = s.valley.nature;
    if (!n) throw new Error('o vale não tem a natureza montada');
    return n;
  };
  const birds = () => {
    const b = s.valley.birdLife;
    if (!b) throw new Error('o vale não tem os passarinhos montados');
    return b;
  };
  return {
    /** Tudo o que a natureza mostra agora. */
    nature: () => {
      const n = nature();
      return {
        frozen: n.frozen,
        dapples: n.dapples.level,
        daisies: { count: n.daisies.count, openness: n.daisies.openness, spots: n.daisies.spots },
        dragonflies: [...n.dragonflies.list],
        fish: n.fish.state,
        frogs: { list: [...n.frogs.list], dives: n.frogs.dives },
        squirrel: n.squirrel.state,
        seeds: n.seeds.count,
        mist: n.mist.level,
        hares: { state: n.hares.state, flees: n.hares.flees },
        litter: n.litter.season,
        puddles: { wetness: n.puddles.wetness, list: [...n.puddles.list], splashes: n.puddles.splashes },
        drips: { level: n.drips.level, fallen: n.drips.fallen },
        rainbow: n.rainbow.level,
        mushrooms: { count: n.mushrooms.count, spots: n.mushrooms.spots },
      };
    },
    /** O peixe que pula: o billboard dele no mundo 3D (posição, escala, se tem textura), ou null. */
    fishBody: () => {
      const m = nature().fish['fish']?.mesh;
      return m ? { visible: m.visible, x: m.position.x, y: m.position.y, z: m.position.z, scaleX: m.scale.x, scaleY: m.scale.y, textured: Boolean(materialOf(m).map) } : null;
    },
    /** Congela a natureza no quadro atual (as fotos não tremem). */
    freezeNature: (on: boolean): void => { nature().frozen = on; },
    forceFishJump: (x: number, y: number): void => nature().fish.force(x, y),
    wakeSquirrel: (): void => nature().squirrel.wake(),
    summonHare: (): void => { const n = nature(); n.hares.summon(n.frame); },

    /** Os passarinhos: cada um, quantas vezes o bando já levantou voo, e o relógio de pouso. */
    birds: () => {
      const b = birds();
      return { list: [...b.list], flushes: b.flushes, nextLanding: b['nextLanding'], clock: b['clock'], awake: b['awake'](), heroAt: b['host'].heroAt() };
    },
    clearBirds: (): void => birds().clear(),
    /** O próximo bando pousa já. */
    landBirdsNow: (): void => { birds()['nextLanding'] = 0; },

    bigTrees: () => [...(s.valley.bigTrees?.list ?? [])],
    /** O billboard da árvore grande de (x, y): visível, onde, escala, opacidade, se está na cena. */
    bigTreeBody: (x: number, y: number) => {
      const t = s.valley.bigTrees?.['trees'].find((q) => q.x === x && q.y === y);
      const m = t?.bb.mesh;
      return m ? { visible: m.visible, pos: [m.position.x, m.position.y, m.position.z], scale: [m.scale.x, m.scale.y], opacity: materialOf(m).opacity, parent: Boolean(m.parent) } : null;
    },
    waterfallFrame: (): number | null => s.valley.waterfall?.currentFrame ?? null,
    koi: () => s.valley.koiPond?.fish ?? [],
    weather: () => {
      const w = s.valley.weather;
      return w ? { rain: w.rain, drops: w.dropCount, splash: w.splashCount, rings: w.ringCount, weather: w.weather } : null;
    },
    gardenMist: () => (s.valley.gardenMist ? { count: s.valley.gardenMist.count } : null),
    hasOldRoad: (): boolean => Boolean(s.valley.oldRoad?.['body']),

    /** A vida do dia: o quanto ela está acesa, as borboletas (largura de cada uma), as folhas caindo, os vaga-lumes. */
    life: () => ({
      daylife: s.life.daylifeLevel,
      fireflies: s.life.fireflyLevel,
      butterflies: s.life.butterflies.map((b) => ({ width: b.bb.displayWidth })),
      leaves: s.life.leaves.map((l) => ({ landedMs: l.landedMs })),
    }),
    /** Zera o relógio do som ambiente (o próximo som do vale é escolhido já). */
    resetAmbienceClock: (): void => { s.life.ambienceClockMs = 0; },

    /** A peça do acampamento do herói em (x, y): 'bed', 'ring', 'easel'... ou null. */
    campAt: (x: number, y: number): string | null => s.valley.heroCamp?.at(x, y) ?? null,
    mementos: (): number => s.valley.heroCamp?.mementoCount ?? 0,
    /** O achado do vale em (x, y), pelo tipo. */
    findAt: (x: number, y: number): string | null => s.valley.valleyFinds?.at(x, y)?.kind ?? null,
  };
};

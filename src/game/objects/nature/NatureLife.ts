import { profiler } from '@/game/debug/Profiler';
import * as Engine from '@/game/engine';

import { bosqueTrees } from '@/game/objects/BigTrees';
import { world3d } from '@/game/render3d/World3D';
import { isWindyDay, seasonOf, sinceRainEnded } from '@/game/runtime/seasons';
import { getDay, getTimeOfDay } from '@/game/runtime/timeOfDay';
import { gustAt, windAt } from '@/game/runtime/wind';
import { isLifeHome, lifeShareAt, type LifeKind } from '@/game/world/biomeLife';

import { AfterRainRainbow } from './AfterRainRainbow';
import { CanopyDrips } from './CanopyDrips';
import { Daisies } from './Daisies';
import { Dragonflies } from './Dragonflies';
import { FishJumps } from './FishJumps';
import { Frogs } from './Frogs';
import { Hares } from './Hares';
import { flushTextures, type NatureFrame, type NatureHost, type NatureSystem, type TreeSpot } from './kit';
import { LeafLitter } from './LeafLitter';
import { MorningMist } from './MorningMist';
import { Puddles } from './Puddles';
import { RainMushrooms } from './RainMushrooms';
import { Seeds } from './Seeds';
import { Squirrel } from './Squirrel';
import { SunDapples } from './SunDapples';

/**
 * A NATUREZA DO VALE (pedido do autor: "adicione exatamente todas as suas sugestões"): os bichos, as plantas e o que
 * o tempo deixa para trás, cada um no seu arquivo desta pasta. Aqui só o maestro: um quadro por frame, com o tempo
 * (hora, dia, estação, chuva, há quanto tempo a chuva parou, vento) e o lugar (onde está o herói, que árvores há
 * perto), igual para todos.
 */

/** O que o GameScene responde à natureza. */
export interface NatureWorld {
  hero(): { x: number; y: number };
  isWater(x: number, y: number): boolean;
  isFree(x: number, y: number): boolean;
  /** Há uma árvore do mapa (tile) viva neste tile. */
  isTileTree(x: number, y: number): boolean;
  rain(): number;
  busy(): boolean;
}

/** A copa e a altura de cada espécie do bosque (tiles), para quem precisa saber de onde pinga ou onde faz sombra. */
const BIG_SHAPES = { oak: { crown: 1.3, height: 2.6, big: true }, birch: { crown: 0.5, height: 1.6, big: false }, sapling: { crown: 0.45, height: 1.15, big: false } } as const;
const TILE_TREE = { crown: 0.45, height: 0.95, big: false } as const;
/** Até onde as árvores do mapa são vistas em volta do herói (tiles). */
const SCAN = 12;

export class NatureLife {
  public readonly squirrel: Squirrel;
  public readonly frogs: Frogs;
  public readonly dragonflies: Dragonflies;
  public readonly hares: Hares;
  public readonly fish: FishJumps;
  public readonly litter: LeafLitter;
  public readonly mushrooms: RainMushrooms;
  public readonly daisies: Daisies;
  public readonly mist: MorningMist;
  public readonly dapples: SunDapples;
  public readonly seeds: Seeds;
  public readonly rainbow: AfterRainRainbow;
  public readonly puddles: Puddles;
  public readonly drips: CanopyDrips;
  /** Cada sistema com o host do lar dele (world/biomeLife): ele só acha chão, água e árvore no bioma onde mora. */
  private readonly systems: Array<{ system: NatureSystem; host: NatureHost; frame: NatureFrame }>;
  private readonly host: NatureHost;
  private clock = 0;
  private lastHeroX = NaN;
  private lastHeroY = NaN;
  private movingFor = 0;
  private treeCacheX = NaN;
  private treeCacheY = NaN;
  private treeCache: TreeSpot[] = [];
  /** O último quadro (a janela do playtest). */
  public readonly frame: NatureFrame;
  /**
   * Playtest: o tempo da natureza PARA (cada bicho fica no instante em que está). A foto do playtest leva ~2 s para
   * sair, e o salto do peixe dura 0,75 s: sem isto, a foto do salto saía com o lago vazio.
   */
  public frozen = false;

  public constructor(private readonly scene: Engine.Scene, private readonly world: NatureWorld) {
    // Os desenhos esperando: agora o World3D já carregou as texturas dele.
    flushTextures();
    this.squirrel = new Squirrel();
    this.frogs = new Frogs();
    this.dragonflies = new Dragonflies();
    this.hares = new Hares();
    this.fish = new FishJumps();
    this.litter = new LeafLitter();
    this.mushrooms = new RainMushrooms();
    this.daisies = new Daisies();
    this.mist = new MorningMist();
    this.dapples = new SunDapples();
    this.seeds = new Seeds();
    this.rainbow = new AfterRainRainbow();
    this.puddles = new Puddles();
    this.drips = new CanopyDrips();
    this.host = {
      hero: () => world.hero(),
      isWater: (x, y) => world.isWater(x, y),
      isFree: (x, y) => world.isFree(x, y),
      treesNear: (x, y, r) => this.treesNear(x, y, r),
      rain: () => world.rain(),
      busy: () => world.busy(),
      home: () => 1,
    };
    this.frame = {
      dt: 0, clock: 0, hero: { x: 0, y: 0 }, heroMoving: false, phase: 0, day: 0, season: seasonOf(0), rain: 0,
      sinceRain: Number.POSITIVE_INFINITY, wind: 0, gust: 0, windyDay: false, host: this.host,
    };
    const homed = (kind: LifeKind): NatureHost => ({
      ...this.host,
      isWater: (x, y) => isLifeHome(kind, x, y) && world.isWater(x, y),
      isFree: (x, y) => isLifeHome(kind, x, y) && world.isFree(x, y),
      treesNear: (x, y, r) => this.treesNear(x, y, r, kind),
      home: (x, y) => lifeShareAt(kind, x, y),
    });
    const entries: Array<[NatureSystem, LifeKind]> = [
      [this.litter, 'litter'], [this.dapples, 'dapples'], [this.mist, 'mist'], [this.daisies, 'daisies'],
      [this.mushrooms, 'mushrooms'], [this.puddles, 'puddles'], [this.drips, 'drips'], [this.rainbow, 'rainbow'],
      [this.seeds, 'seeds'], [this.squirrel, 'squirrel'], [this.frogs, 'frogs'], [this.dragonflies, 'dragonflies'],
      [this.hares, 'hares'], [this.fish, 'fish'],
    ];
    this.systems = entries.map(([system, kind]) => {
      const host = homed(kind);
      return { system, host, frame: { ...this.frame, host } };
    });
    scene.events.on(Engine.Scenes.Events.POST_UPDATE, this.onFrame, this);
  }

  /**
   * As árvores do mapa e do bosque perto de um ponto (as do mapa vêm de um cache em volta do herói), e, com `kind`, só
   * as que ficam no lar dessa vida (world/biomeLife) — numa passada só, na mesma ordem.
   */
  private treesNear(x: number, y: number, r: number, kind?: LifeKind): readonly TreeSpot[] {
    const hero = this.world.hero();
    const cx = Math.round(hero.x);
    const cy = Math.round(hero.y);
    if (cx !== this.treeCacheX || cy !== this.treeCacheY) {
      this.treeCacheX = cx;
      this.treeCacheY = cy;
      const out: TreeSpot[] = [];
      for (let ty = cy - SCAN; ty <= cy + SCAN; ty += 1) {
        for (let tx = cx - SCAN; tx <= cx + SCAN; tx += 1) {
          if (this.world.isTileTree(tx, ty)) out.push({ x: tx, y: ty, ...TILE_TREE });
        }
      }
      for (const t of bosqueTrees()) {
        if (t.kind === 'log') continue;
        out.push({ x: t.x, y: t.y, ...BIG_SHAPES[t.kind] });
      }
      this.treeCache = out;
    }
    const near: TreeSpot[] = [];
    for (const t of this.treeCache) {
      if (Math.hypot(t.x - x, t.y - y) <= r && (!kind || isLifeHome(kind, t.x, t.y))) near.push(t);
    }
    return near;
  }

  /** O quadro, medido (debug/Profiler: seção `life.nature`; desligado, não custa nada). */
  private onFrame(): void {
    profiler.begin('life.nature');
    this.frameTick();
    profiler.end('life.nature');
  }

  private frameTick(): void {
    const deltaMs = this.frozen ? 0 : Math.min(100, this.scene.game.loop.delta);
    this.clock += deltaMs;
    const hero = this.world.hero();
    const moved = Math.hypot(hero.x - this.lastHeroX, hero.y - this.lastHeroY);
    this.movingFor = moved > 0.002 ? 0.15 : Math.max(0, this.movingFor - deltaMs / 1000);
    this.lastHeroX = hero.x;
    this.lastHeroY = hero.y;
    const day = getDay();
    const phase = getTimeOfDay();
    const now = world3d().elapsedMs;
    // O quadro de todo mundo é o mesmo; só o host muda. Os objetos são criados uma vez e atualizados aqui (eram 15
    // objetos novos por quadro, só para virar lixo).
    const f = this.frame;
    f.dt = deltaMs / 1000;
    f.clock = this.clock;
    f.hero = hero;
    f.heroMoving = this.movingFor > 0;
    f.phase = phase;
    f.day = day;
    f.season = seasonOf(day);
    f.rain = this.world.rain();
    f.sinceRain = sinceRainEnded(day, phase);
    f.wind = windAt(now);
    f.gust = gustAt(now);
    f.windyDay = isWindyDay(day);
    for (const s of this.systems) {
      const sf = s.frame;
      sf.dt = f.dt;
      sf.clock = f.clock;
      sf.hero = f.hero;
      sf.heroMoving = f.heroMoving;
      sf.phase = f.phase;
      sf.day = f.day;
      sf.season = f.season;
      sf.rain = f.rain;
      sf.sinceRain = f.sinceRain;
      sf.wind = f.wind;
      sf.gust = f.gust;
      sf.windyDay = f.windyDay;
      s.system.update(sf);
    }
  }

  public destroy(): void {
    this.scene.events.off(Engine.Scenes.Events.POST_UPDATE, this.onFrame, this);
    for (const s of this.systems) s.system.destroy();
  }
}

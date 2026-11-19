import { profiler } from '@/game/debug/Profiler';
import * as Engine from '@/game/engine';

import { flushTextures } from '@/game/objects/nature/kit';
import { world3d } from '@/game/render3d/World3D';
import { getTimeOfDay } from '@/game/runtime/timeOfDay';
import { gustAt, windAt } from '@/game/runtime/wind';

import { coastAt, type BeachFrame, type BeachSystem, type BeachWorld } from './kit';

/**
 * A VIDA DA PRAIA DO NORTE (pedido do autor, 2026-11-19: "vida animal... um dos lugares mais bonitos do jogo"). O
 * maestro: um quadro por frame com o tempo (a hora, o vento, o relógio da onda) e o lugar (onde o herói está, e a que
 * distância do mar), igual para todos os sistemas desta pasta. Cada bicho mora no seu arquivo.
 *
 * Nada aqui roda longe da praia: com o herói ao sul da serra, o quadro nem é montado.
 */
export class BeachLife {
  private readonly systems: BeachSystem[] = [];
  /** O último quadro (a janela do playtest). */
  public readonly frame: BeachFrame;
  private clock = 0;

  public constructor(private readonly scene: Engine.Scene, private readonly world: BeachWorld) {
    flushTextures();
    this.frame = {
      dt: 0, clock: 0, time: 0, hero: { x: 0, y: 0 }, coast: -99, phase: 0, rain: 0, wind: 0, gust: 0, world,
    };
    scene.events.on(Engine.Scenes.Events.POST_UPDATE, this.onFrame, this);
  }

  /** Um sistema entra na roda (os bichos, a câmera do mirante, o som). */
  public add<T extends BeachSystem>(system: T): T {
    this.systems.push(system);
    return system;
  }

  private onFrame(): void {
    profiler.begin('life.beach');
    this.tick();
    profiler.end('life.beach');
  }

  private tick(): void {
    const w3 = world3d();
    const hero = this.world.hero();
    const f = this.frame;
    const deltaMs = Math.min(100, this.scene.game.loop.delta);
    this.clock += deltaMs;
    f.dt = deltaMs / 1000;
    f.clock = this.clock;
    f.time = w3.elapsed;
    f.hero = hero;
    f.coast = coastAt(hero.x, hero.y);
    f.phase = getTimeOfDay();
    f.rain = this.world.rain();
    f.wind = windAt(w3.elapsedMs);
    f.gust = gustAt(w3.elapsedMs);
    for (const s of this.systems) s.update(f);
  }

  public destroy(): void {
    this.scene.events.off(Engine.Scenes.Events.POST_UPDATE, this.onFrame, this);
    for (const s of this.systems) s.destroy();
    this.systems.length = 0;
  }
}

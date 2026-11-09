// AS LUZES DE FOGO DO MUNDO 3D: o pool fixo de luzes (nasce inteiro no construtor — o número está assado em cada
// shader), as fogueiras registradas e o halo de cada uma.

import * as THREE from 'three';
import { makeFireGlowMaterial } from '../glowMaterials';
import type { FireEntry } from './TerrainData';
import type { World3D } from '../World3D';
import { FIRE_COLOR } from './worldDefs';

/**
 * How many real PointLights the scene keeps for fires. FIXED for the whole run, and
 * deliberately SMALL — a fire does not own a light, it BORROWS one.
 *
 * Two separate costs pull in the same direction here:
 *  · Changing the count mid-run makes three.js recompile every lit material in the world
 *    (an ~800ms freeze — this is what made burning a bush hitch). So it must be constant.
 *  · Every light in the scene is evaluated by every lit FRAGMENT, and our patched shader
 *    does a world-space snap + flame wobble per light. So each one is a permanent per-pixel
 *    tax, whether it is lit or sitting at intensity 0. Measured on this world: ~0.35ms of
 *    frame time per light. So the count must also be small.
 *
 * Each frame the pool is handed to the lit fires NEAREST the camera (see the fire loop).
 * A fire that misses out keeps its glow quad — the big additive halo on the ground, which
 * is what actually reads as "warm pool" — and only loses its 3D shading contribution, at a
 * distance where a range-limited point light was contributing almost nothing anyway.
 */
const FIRE_LIGHT_SLOTS = 8;
export interface FireLight3D {
  setLit(lit: boolean): void;
  setIntensityScale(s: number): void;
  /**
   * O tamanho da poça no chão, como fração do padrão (ver `FireEntry.sizeScale`). Uma fonte
   * pequena — a tocha de parede — precisa disto: `setIntensityScale` só a deixa mais FRACA, e uma
   * poça de 15 tiles fraca continua sendo uma poça de 15 tiles.
   */
  setSizeScale(s: number): void;
  /**
   * A DANÇA desta chama neste frame (~0,4 no fundo do vale … ~1,5 num estalo), 0 se apagada.
   *
   * Ela existe para que o DESENHO da chama possa ser a mesma chama que a LUZ. Sem isto, um sprite
   * de fogo troca de frame num metrônomo próprio enquanto a luz executa cinco camadas de dança
   * (swell + flicker + shimmer + jitter + flare) — e as duas não se conhecem, então o quad lê como
   * decalque em loop e a luz como um efeito solto por cima dele. Quem desenha fogo lê daqui.
   */
  readonly level: number;
  /**
   * Fogo que ANDA (a tocha do heroi ja era um; o corpo em chamas e o segundo). Move a ENTRADA
   * do pool — luz, halo no chao e sombra vao atras no proximo frame — sem criar nem destruir
   * luz nenhuma, que e a lei mais cara da casa. `worldX/worldY` ficam sendo o tile de origem.
   */
  setPosition(x: number, y: number): void;
  readonly worldX: number;
  readonly worldY: number;
  destroy(): void;
}

/** O que WorldLights usa de World3D. */
export type WorldLightsHost = Pick<World3D, 'hero' | 'params' | 'probe' | 'scene' | 'shadowLight'>;

export class WorldLights {
  private readonly pointLightList: THREE.PointLight[] = [];

  public readonly fires: FireEntry[] = [];
  // The scene's fire PointLights: a fixed, small pool, aimed each frame at the lit fires
  // nearest the camera. Built once at construction — see FIRE_LIGHT_SLOTS.
  public readonly fireLights: THREE.PointLight[] = [];
  public activeFireLights = 0;
  // Glow quads are meshes, not lights: they can come and go freely (no recompile), so they
  // are pooled only to avoid churning geometry/materials as bushes burn.
  public readonly freeGlows: THREE.Mesh[] = [];
  // Rebuilt once per frame so the cast-shadow pass doesn't re-scan every fire (lit or
  // not, near or not) for every single caster.
  public readonly litFires: FireEntry[] = [];

  public constructor(private readonly host: WorldLightsHost) {}

  /**
   * The scene's fire PointLights, built ONCE at construction and never added to or removed
   * again. See FIRE_LIGHT_SLOTS: a changing light count recompiles every lit material in the
   * world (the burning-bush freeze), and every light is a permanent per-fragment cost — so
   * the count is both fixed and small, and the lights are pointed at whichever fires matter.
   */
  public createFireLights(): void {
    for (let i = 0; i < FIRE_LIGHT_SLOTS; i += 1) {
      const light = new THREE.PointLight(FIRE_COLOR, 0, this.host.params.fireDist, this.host.params.fireDecay);
      light.position.set(0, 1.1, 0);
      this.host.scene.add(light);
      this.fireLights.push(light);
    }
  }

  /**
   * The visible warm halo: a big soft additive radial laid flat over the ground, centred on
   * the fire — this is what actually makes a fire read as a light source (the cozy yellow
   * pool the 2D game drew). It is a MESH, not a light: adding one costs a draw call, never a
   * shader recompile, so every fire keeps its own however many are burning.
   */
  private acquireGlow(): THREE.Mesh {
    const free = this.freeGlows.pop();
    if (free) {
      free.visible = true;
      return free;
    }
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const glow = new THREE.Mesh(geo, makeFireGlowMaterial());
    glow.renderOrder = 2;
    this.host.scene.add(glow);
    return glow;
  }

  private releaseGlow(glow: THREE.Mesh): void {
    glow.visible = false;
    this.freeGlows.push(glow);
  }

  /** As luzes pontuais que existem agora (a tocha e a do herói nascem no primeiro uso). */
  public livePointLights(): readonly THREE.PointLight[] {
    const list = this.pointLightList;
    list.length = 0;
    for (const l of this.fireLights) list.push(l);
    list.push(this.host.shadowLight);
    if (this.host.hero.torchLight) list.push(this.host.hero.torchLight);
    if (this.host.hero.heroLight) list.push(this.host.hero.heroLight);
    return list;
  }

  public addFireLight(worldX: number, worldY: number, lit: boolean): FireLight3D {
    const glow = this.acquireGlow();
    glow.position.set(worldX, 0.07, worldY);

    const entry: FireEntry = {
      worldX, worldY, lit, scale: 1, sizeScale: 1, glow, flicker: 0, level: 1,
      seed: Math.random() * Math.PI * 2, noise: 0, flare: 0, flareTarget: 0,
      flareTimer: Math.random() * 1.5,
      intensity: 0, lx: worldX, lz: worldY, color: new THREE.Color(FIRE_COLOR), camDist: 0,
    };
    this.fires.push(entry);
    let released = false;
    return {
      worldX,
      worldY,
      get level() { return entry.lit ? entry.level : 0; },
      setLit: (v) => { entry.lit = v; },
      setIntensityScale: (s) => { entry.scale = s; },
      setSizeScale: (s) => { entry.sizeScale = s; },
      setPosition: (x, y) => {
        // A cache de solidos da sombra e POR POSICAO (ver fireCastLists): invalida so na troca
        // de TILE — invalidar a cada frame faria um fogo ambulante pagar uma varredura completa
        // de solidTiles por quadro, para uma sombra que nao mudou de vizinhanca.
        if (Math.round(x) !== Math.round(entry.worldX) || Math.round(y) !== Math.round(entry.worldY)) {
          this.host.probe.fireCastLists.delete(entry);
        }
        entry.worldX = x;
        entry.worldY = y;
      },
      destroy: () => {
        if (released) return;
        released = true;
        const i = this.fires.indexOf(entry);
        if (i >= 0) this.fires.splice(i, 1);
        this.host.probe.fireCastLists.delete(entry); // its candidate-solids cache goes with it
        this.releaseGlow(glow);
      },
    };
  }
}

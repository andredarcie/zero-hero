import * as THREE from 'three';

import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { registerTexture3D } from '@/game/render3d/textures3d';
import { FX_DOT_TEXTURE, WATER_DEPTH_TILES, type World3D } from '@/game/render3d/World3D';
import { OVERCAST, SEASON_GRADE, rainAmountAt, seasonOf, weatherAt, type Season, type Weather } from '@/game/runtime/seasons';
import { getDay, getTimeOfDay } from '@/game/runtime/timeOfDay';

/**
 * O CÉU DO VALE: a cor da estação no quadro inteiro e a chuva ou a neve em volta do herói. Os pingos são
 * billboards sem luz (a lei do pool fixo), nascem aos poucos e somem aos poucos, e o quadro desliza de uma
 * estação para a outra em vez de virar de repente.
 *
 * A CHUVA (pedido do autor: "melhore a qualidade da chuva"), como chuva de verdade:
 *   · INTENSIDADE que anda: começa em garoa, engrossa e afina antes de parar, e cada dia tem a sua força
 *     (seasons.rainAmountAt). O número de pingos, o som e o céu fechado seguem esse valor.
 *   · PROFUNDIDADE: três camadas de pingo. Os de perto são longos, nítidos e rápidos; os de longe, curtos, fracos e
 *     lentos. Juntas dão o véu da chuva em vez de uma grade de riscos iguais.
 *   · VENTO em rajadas: a chuva inclina com ele, e cada risco é girado na direção em que cai.
 *   · O PINGO TEM CABEÇA: o risco é claro embaixo e some em cima (o rastro do movimento), não um bastão chapado.
 *   · RESPINGOS: no chão, uma coroinha que abre e some; na água, um anel que se alarga.
 */

/** Pingos no ar no auge de um temporal (a garoa tem bem menos: ver updateDrops). */
const RAIN_DROPS = 240;
const SNOW_FLAKES = 60;
const SPREAD_X = 8;
const SPREAD_Y = 6;
const TOP = 4.2;
const GRADE_MS = 6000;
const LEVEL_MS = 4000;
/** O céu fechado no auge de um temporal: um tanto mais escuro que o nublado de uma garoa. */
const STORM_DARK = 0.07;

/** As camadas da chuva: tamanho do risco (tiles), velocidade (tiles/ms), alfa, quanto o vento a empurra e o peso. */
interface Layer { w: number; h: number; speed: number; alpha: number; wind: number; tex: string; weight: number }
const LAYERS: readonly Layer[] = [
  { w: 1 / 16, h: 0.66, speed: 0.0135, alpha: 0.95, wind: 1, tex: 'rain-near', weight: 0.25 },
  { w: 1 / 16, h: 0.46, speed: 0.011, alpha: 0.75, wind: 0.85, tex: 'rain-mid', weight: 0.4 },
  { w: 1 / 16, h: 0.3, speed: 0.0085, alpha: 0.5, wind: 0.7, tex: 'rain-far', weight: 0.35 },
];
const SPLASH_POOL = 26;
const RING_POOL = 18;
const SPLASH_MS = 260;
const RING_MS = 620;
/** A água afundada dos rios e lagos (World3D): os anéis deitam na superfície dela. */
const WATER_SURFACE = -WATER_DEPTH_TILES + 0.03;

interface Drop { bb: Billboard3D; x: number; y: number; elev: number; drift: number; speed: number; layer: number }
interface Fx { bb: Billboard3D; t: number; busy: boolean }

let texturesReady = false;
const registerRainTextures = (): void => {
  if (texturesReady) return;
  const add = (key: string, w: number, h: number, paint: (put: (x: number, y: number, a: number, c?: string) => void) => void): void => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const put = (x: number, y: number, a: number, color = '#cfe2f0'): void => {
      ctx.fillStyle = color;
      ctx.globalAlpha = a;
      ctx.fillRect(x, y, 1, 1);
    };
    paint(put);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    registerTexture3D(key, tex);
  };
  // O risco: a cabeça clara embaixo, o rastro sumindo para cima.
  for (const [key, len] of [['rain-near', 10], ['rain-mid', 7], ['rain-far', 5]] as const) {
    add(key, 1, len, (put) => {
      for (let y = 0; y < len; y += 1) {
        const t = (y + 1) / len;
        put(0, y, 0.15 + t * 0.85, y === len - 1 ? '#ffffff' : '#dce9f4');
      }
    });
  }
  // A coroinha do respingo, em 3 quadros: a gota bate, a coroa abre, os pinguinhos caem.
  const crowns = [
    [[2, 2], [1, 1], [3, 1]],
    [[0, 1], [4, 1], [1, 0], [3, 0], [2, 2]],
    [[0, 2], [4, 2], [0, 0], [4, 0]],
  ];
  crowns.forEach((pts, i) => add(`rain-splash-${i}`, 5, 3, (put) => { for (const [x, y] of pts) put(x, y, i === 2 ? 0.6 : 0.9, '#dcebf6'); }));
  // O anel na água: um círculo fininho (a escala e o alfa vêm de fora).
  // Pequeno (8 px) e desenhado à mão: num círculo de 10 px os pixels fechavam um quadrado.
  add('rain-ring', 8, 8, (put) => {
    for (const [x, y] of [[3, 0], [4, 0], [1, 1], [6, 1], [0, 3], [7, 3], [0, 4], [7, 4], [1, 6], [6, 6], [3, 7], [4, 7], [2, 0], [5, 0], [2, 7], [5, 7], [0, 2], [7, 2], [0, 5], [7, 5]] as const) {
      put(x, y, 0.85, '#e2eff6');
    }
  });
  texturesReady = true;
};

export class ValleyWeather {
  /** De 0 a 1: quanta chuva está caindo. É o que o som e as borboletas leem. */
  public rain = 0;
  public snow = 0;
  public season: Season = seasonOf(getDay());
  /** Quantos respingos nasceram, no chão e na água (a janela do playtest). */
  public splashCount = 0;
  public ringCount = 0;

  private readonly drops: Drop[] = [];
  private readonly splashes: Fx[] = [];
  private readonly rings: Fx[] = [];
  private grade = { ...SEASON_GRADE[this.season] };
  private overcast = 1;
  private clock = 0;

  /** `isWater`: o tile é água aberta (o pingo vira anel em vez de coroinha). */
  public constructor(private readonly world: World3D, private readonly isWater: (x: number, y: number) => boolean = () => false) {
    registerRainTextures();
    this.world.setSeasonGrade(this.grade.r, this.grade.g, this.grade.b, this.grade.saturation);
  }

  public get weather(): Weather {
    return weatherAt(getDay(), getTimeOfDay());
  }

  /** Quantos pingos estão no ar (a janela do playtest). */
  public get dropCount(): number {
    return this.drops.length;
  }

  public destroy(): void {
    for (const drop of this.drops) drop.bb.destroy();
    for (const fx of [...this.splashes, ...this.rings]) fx.bb.destroy();
    this.drops.length = 0;
    this.splashes.length = 0;
    this.rings.length = 0;
    this.world.setSeasonGrade(1, 1, 1, 1);
  }

  public update(delta: number, at: { x: number; y: number }): void {
    this.clock += delta;
    this.season = seasonOf(getDay());
    const { weather } = this;
    const levelStep = Math.min(1, delta / LEVEL_MS);
    const amount = weather === 'rain' ? rainAmountAt(getDay(), getTimeOfDay()) : 0;
    this.rain += (amount - this.rain) * levelStep;
    // A cauda da curva não fica pingando para sempre: quando quase nada cai, para.
    if (amount === 0 && this.rain < 0.03) this.rain = 0;
    this.snow += ((weather === 'snow' ? 1 : 0) - this.snow) * levelStep;
    this.updateGrade(delta, weather);
    this.updateDrops(delta, at);
    this.updateFx(delta);
  }

  private updateGrade(delta: number, weather: Weather): void {
    const k = Math.min(1, delta / GRADE_MS);
    const want = SEASON_GRADE[this.season];
    // Quanto mais forte a chuva, mais fechado o céu.
    this.overcast += ((weather === 'clear' ? 1 : OVERCAST - STORM_DARK * this.rain) - this.overcast) * k;
    this.grade.r += (want.r - this.grade.r) * k;
    this.grade.g += (want.g - this.grade.g) * k;
    this.grade.b += (want.b - this.grade.b) * k;
    this.grade.saturation += (want.saturation - this.grade.saturation) * k;
    this.world.setSeasonGrade(
      this.grade.r * this.overcast, this.grade.g * this.overcast, this.grade.b * this.overcast, this.grade.saturation,
    );
  }

  /** O vento agora (tiles/ms para o leste): uma brisa que vai e vem, com rajadas por cima. */
  private wind(): number {
    const t = this.clock / 1000;
    const gust = Math.max(0, Math.sin(t * 0.37) * Math.sin(t * 0.11 + 1.3));
    return 0.0007 + 0.0005 * Math.sin(t * 0.21) + 0.0016 * gust * gust;
  }

  private spawn(snowy: boolean, at: { x: number; y: number }, anywhere: boolean): Drop {
    const bb = this.world.addBillboard(FX_DOT_TEXTURE, 0, { centered: true, fog: false, depthWrite: false, emissive: true });
    const drop: Drop = { bb, x: 0, y: 0, elev: 0, drift: 0, speed: 0, layer: 0 };
    this.recycle(drop, snowy, at, anywhere);
    return drop;
  }

  private recycle(drop: Drop, snowy: boolean, at: { x: number; y: number }, anywhere: boolean): void {
    // O corpo é reaproveitado: quem era pingo pode voltar floco.
    drop.x = at.x + (Math.random() - 0.5) * SPREAD_X * 2;
    drop.y = at.y + (Math.random() - 0.5) * SPREAD_Y * 2;
    drop.elev = anywhere ? Math.random() * TOP : TOP;
    if (snowy) {
      drop.bb.setTexture(FX_DOT_TEXTURE).setTint(0xf2f6ff).setDisplaySize(0.16, 0.16).setAngle(0);
      drop.speed = 0.0007 + Math.random() * 0.0005;
      drop.drift = (Math.random() - 0.5) * 0.0006;
      return;
    }
    // A camada sorteada pelo peso dela: mais pingos ao longe que perto, como a chuva de verdade se vê.
    let r = Math.random();
    drop.layer = LAYERS.findIndex((l) => (r -= l.weight) < 0);
    if (drop.layer < 0) drop.layer = LAYERS.length - 1;
    const layer = LAYERS[drop.layer];
    drop.bb.setTexture(layer.tex).setTint(0xffffff).setDisplaySize(layer.w, layer.h);
    drop.speed = layer.speed * (0.9 + Math.random() * 0.2);
    drop.drift = 0;
  }

  private updateDrops(delta: number, at: { x: number; y: number }): void {
    const snowy = this.snow > this.rain;
    const level = Math.max(this.rain, this.snow);
    // A garoa já se vê (a curva sobe rápido no começo) e o temporal enche o quadro.
    const want = Math.round((snowy ? level : level ** 0.75) * (snowy ? SNOW_FLAKES : RAIN_DROPS));
    while (this.drops.length < want) this.drops.push(this.spawn(snowy, at, true));
    while (this.drops.length > want) this.drops.pop()?.bb.destroy();
    const wind = this.wind();
    for (const drop of this.drops) {
      if (!snowy) {
        const layer = LAYERS[drop.layer];
        drop.drift = wind * layer.wind;
        // O risco aponta para onde o pingo vai: inclinado pelo vento (a altura conta ~0,7 na tela, a câmera é de 45°).
        drop.bb.setAngle(-THREE.MathUtils.radToDeg(Math.atan2(drop.drift, drop.speed * 0.7)));
      }
      drop.elev -= delta * drop.speed;
      drop.x += delta * drop.drift;
      if (drop.elev <= 0) {
        // Chegou ao chão: os de perto e do meio deixam um respingo (os de longe são miúdos demais para se ver).
        if (!snowy && drop.layer < 2) this.splash(drop.x, drop.y);
        this.recycle(drop, snowy, at, false);
      } else if (Math.abs(drop.x - at.x) > SPREAD_X || Math.abs(drop.y - at.y) > SPREAD_Y) {
        // Quem saiu do quadro volta lá em cima, perto de onde o herói está agora.
        this.recycle(drop, snowy, at, false);
      }
      const alpha = snowy ? 0.95 * level : LAYERS[drop.layer].alpha * (0.55 + 0.45 * level);
      drop.bb.setPosition(drop.x, drop.y).setElevation(drop.elev).setAlpha(alpha);
    }
  }

  /** Um respingo onde o pingo bateu: anel na água, coroinha no chão. */
  private splash(x: number, y: number): void {
    const water = this.isWater(Math.round(x), Math.round(y));
    const pool = water ? this.rings : this.splashes;
    let fx = pool.find((f) => !f.busy);
    if (!fx && pool.length < (water ? RING_POOL : SPLASH_POOL)) {
      const bb = water
        ? this.world.addBillboard('rain-ring', 0, { flat: true, flatY: WATER_SURFACE, depthWrite: false, alphaTest: 0.01, fog: false })
        : this.world.addBillboard('rain-splash-0', 0, { depthWrite: false, alphaTest: 0.01, fog: false, emissive: true });
      fx = { bb, t: 0, busy: false };
      pool.push(fx);
    }
    if (!fx) return;
    fx.busy = true;
    fx.t = 0;
    fx.bb.setVisible(true).setPosition(x, y);
    if (water) this.ringCount += 1; else this.splashCount += 1;
  }

  private updateFx(delta: number): void {
    for (const fx of this.splashes) {
      if (!fx.busy) continue;
      fx.t += delta / SPLASH_MS;
      if (fx.t >= 1) { fx.busy = false; fx.bb.setVisible(false); continue; }
      fx.bb.setTexture(`rain-splash-${Math.min(2, Math.floor(fx.t * 3))}`).setDisplaySize(5 / 16, 3 / 16).setAlpha(0.8 * (1 - fx.t * 0.6));
    }
    for (const fx of this.rings) {
      if (!fx.busy) continue;
      fx.t += delta / RING_MS;
      if (fx.t >= 1) { fx.busy = false; fx.bb.setVisible(false); continue; }
      // Um respingo de verdade abre um anel de um palmo, não de um tile.
      const s = 0.1 + fx.t * 0.24;
      fx.bb.setDisplaySize(s, s).setAlpha(0.65 * (1 - fx.t));
    }
  }
}

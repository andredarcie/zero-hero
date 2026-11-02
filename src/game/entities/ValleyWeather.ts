import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { FX_DOT_TEXTURE, type World3D } from '@/game/render3d/World3D';
import { OVERCAST, SEASON_GRADE, seasonOf, weatherAt, type Season, type Weather } from '@/game/runtime/seasons';
import { getDay, getTimeOfDay } from '@/game/runtime/timeOfDay';

/**
 * O CÉU DO VALE: a cor da estação no quadro inteiro e a chuva ou a neve em volta do herói. Os pingos são
 * billboards sem luz (a lei do pool fixo), nascem aos poucos e somem aos poucos, e o quadro desliza de uma
 * estação para a outra em vez de virar de repente.
 */

const RAIN_DROPS = 70;
const SNOW_FLAKES = 60;
const SPREAD_X = 8;
const SPREAD_Y = 6;
const TOP = 4.2;
const GRADE_MS = 6000;
const LEVEL_MS = 4000;

interface Drop { bb: Billboard3D; x: number; y: number; elev: number; drift: number; speed: number }

export class ValleyWeather {
  /** De 0 a 1: quanta chuva está caindo. É o que o som e as borboletas leem. */
  public rain = 0;
  public snow = 0;
  public season: Season = seasonOf(getDay());

  private readonly drops: Drop[] = [];
  private grade = { ...SEASON_GRADE[this.season] };
  private overcast = 1;

  public constructor(private readonly world: World3D) {
    this.world.setSeasonGrade(this.grade.r, this.grade.g, this.grade.b, this.grade.saturation);
  }

  public get weather(): Weather {
    return weatherAt(getDay(), getTimeOfDay());
  }

  public destroy(): void {
    for (const drop of this.drops) drop.bb.destroy();
    this.drops.length = 0;
    this.world.setSeasonGrade(1, 1, 1, 1);
  }

  public update(delta: number, at: { x: number; y: number }): void {
    this.season = seasonOf(getDay());
    const { weather } = this;
    const levelStep = Math.min(1, delta / LEVEL_MS);
    this.rain += ((weather === 'rain' ? 1 : 0) - this.rain) * levelStep;
    this.snow += ((weather === 'snow' ? 1 : 0) - this.snow) * levelStep;
    this.updateGrade(delta, weather);
    this.updateDrops(delta, at);
  }

  private updateGrade(delta: number, weather: Weather): void {
    const k = Math.min(1, delta / GRADE_MS);
    const want = SEASON_GRADE[this.season];
    this.overcast += ((weather === 'clear' ? 1 : OVERCAST) - this.overcast) * k;
    this.grade.r += (want.r - this.grade.r) * k;
    this.grade.g += (want.g - this.grade.g) * k;
    this.grade.b += (want.b - this.grade.b) * k;
    this.grade.saturation += (want.saturation - this.grade.saturation) * k;
    this.world.setSeasonGrade(
      this.grade.r * this.overcast, this.grade.g * this.overcast, this.grade.b * this.overcast, this.grade.saturation,
    );
  }

  private spawn(snowy: boolean, at: { x: number; y: number }, anywhere: boolean): Drop {
    const bb = this.world.addBillboard(FX_DOT_TEXTURE, 0, { centered: true, fog: false, depthWrite: false, emissive: true });
    const drop: Drop = { bb, x: 0, y: 0, elev: 0, drift: 0, speed: 0 };
    this.recycle(drop, snowy, at, anywhere);
    return drop;
  }

  private recycle(drop: Drop, snowy: boolean, at: { x: number; y: number }, anywhere: boolean): void {
    // O corpo é reaproveitado: quem era pingo pode voltar floco.
    drop.bb.setTint(snowy ? 0xf2f6ff : 0x9fc4e0);
    if (snowy) drop.bb.setDisplaySize(0.16, 0.16);
    else drop.bb.setDisplaySize(0.06, 0.5);
    drop.x = at.x + (Math.random() - 0.5) * SPREAD_X * 2;
    drop.y = at.y + (Math.random() - 0.5) * SPREAD_Y * 2;
    drop.elev = anywhere ? Math.random() * TOP : TOP;
    drop.speed = snowy ? 0.0007 + Math.random() * 0.0005 : 0.0105 + Math.random() * 0.004;
    drop.drift = snowy ? (Math.random() - 0.5) * 0.0006 : 0.0009;
  }

  private updateDrops(delta: number, at: { x: number; y: number }): void {
    const snowy = this.snow > this.rain;
    const level = Math.max(this.rain, this.snow);
    const want = Math.round(level * (snowy ? SNOW_FLAKES : RAIN_DROPS));
    while (this.drops.length < want) this.drops.push(this.spawn(snowy, at, true));
    while (this.drops.length > want) this.drops.pop()?.bb.destroy();
    for (const drop of this.drops) {
      drop.elev -= delta * drop.speed;
      drop.x += delta * drop.drift;
      // Quem saiu do quadro ou chegou ao chão volta lá em cima, perto de onde o herói está agora.
      if (drop.elev <= 0 || Math.abs(drop.x - at.x) > SPREAD_X || Math.abs(drop.y - at.y) > SPREAD_Y) this.recycle(drop, snowy, at, false);
      drop.bb.setPosition(drop.x, drop.y).setElevation(drop.elev).setAlpha((snowy ? 0.95 : 0.85) * level);
    }
  }
}

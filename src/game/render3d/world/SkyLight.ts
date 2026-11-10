// O CÉU DESTE QUADRO: as nuvens andam com o vento, e os knobs da hora (as cores do céu na água, a luz do ar, quanto
// de estrela, quanto de sombra de nuvem) viram os uniforms que o acabamento, o ar e a água leem (atmosphere.ts).

import * as THREE from 'three';
import { skyNoiseTexture, skyUniforms } from '../atmosphere';
import type { World3D } from '../World3D';

/** O vento do céu, em tiles por segundo com `hd3d.wind` = 1: devagar o bastante para a sombra de uma nuvem ser luz
 *  mudando, e não uma coisa correndo pelo chão. */
const CLOUD_WIND_X = 0.42;
const CLOUD_WIND_Z = 0.19;
/**
 * Quanto a cor do ar rende no quadro (ver AirLight): a soma ao longo do raio dá ~1,6 no ar cheio de sol, e o quadro
 * do dia ainda passa pela curva (`lift`), que abre os graves. Com isto, `air` = 1 soma perto de um décimo.
 */
const AIR_GAIN = 0.062;
/**
 * A sombra de nuvem com `clouds` = 1: o chão debaixo dela fica a ~78% e mais frio. O knob vai até 1,5 (o dia): aí o
 * chão cai a ~67%, que é o que faz o vale ter sol E sombra no mesmo quadro (o estudo de 2026-11-10: a luz do dia
 * usava metade da faixa de tons das referências).
 */
const CLOUD_SHADE_MAX = 0.6;
const CLOUD_KNOB_MAX = 1.5;
/** Quanto da luz direcional vira fio de contorno (a intensidade dela vai de ~3,6 na noite a ~8,6 na hora dourada). */
const RIM_SUN_GAIN = 0.085;
/** O fio da chama: a força junto dela, e até quantos tiles ele alcança. */
const RIM_FIRE_GAIN = 1.5;
const RIM_FIRE_REACH = 5.5;

/** O que SkyLight usa de World3D. */
export type SkyLightHost = Pick<World3D, 'look' | 'moonLight' | 'params'>;

export class SkyLight {
  private readonly airBase = new THREE.Color();

  public constructor(private readonly host: SkyLightHost) {
    skyUniforms.uSkyNoise.value = skyNoiseTexture();
  }

  public update(dt: number): void {
    const p = this.host.params;
    const wind = Math.max(0, p.wind);
    const drift = skyUniforms.uCloudDrift.value;
    drift.x += CLOUD_WIND_X * wind * dt;
    drift.y += CLOUD_WIND_Z * wind * dt;
    skyUniforms.uCloudCover.value = Math.min(0.95, Math.max(0.05, p.cloudCover));
    skyUniforms.uCloudShade.value = Math.min(CLOUD_KNOB_MAX, Math.max(0, p.clouds)) * CLOUD_SHADE_MAX;
    skyUniforms.uStars.value = Math.min(1, Math.max(0, p.stars));
    this.host.look.applyColor('waterSky', skyUniforms.uSkyColor.value, p.waterSkyColor);
    this.host.look.applyColor('waterCloud', skyUniforms.uCloudColor.value, p.waterCloudColor);
    this.host.look.applyColor('air', this.airBase, p.airColor);
    skyUniforms.uSunAir.value.copy(this.airBase).multiplyScalar(Math.max(0, p.air) * AIR_GAIN);
    const sun = skyUniforms.uSunDir.value.copy(this.host.moonLight.position).normalize();

    // A luz de contorno do sol/lua (spriteOutline.RIM_FRAGMENT_GLSL): a cor da própria luz direcional, e de que lado
    // ela pega — de lado conforme o x do sol, e por cima quando ele está atrás de quem a câmera vê (ao norte) ou alto.
    const rim = Math.max(0, p.rim);
    skyUniforms.uRimSun.value.copy(this.host.moonLight.color).multiplyScalar(this.host.moonLight.intensity * RIM_SUN_GAIN * rim);
    skyUniforms.uRimSide.value.set(sun.x * (1 - 0.5 * sun.y), Math.min(1, Math.max(0, -sun.z) * 0.9 + 0.25 * sun.y));
  }

  /**
   * A chama mais perto da câmera neste quadro (ou nenhuma): é dela o fio quente na borda de quem está em volta. O
   * alcance é o do clarão no chão, e a força recua de dia junto com ele (`fireGlowStrength`).
   */
  public setFireRim(fire: { lx: number; lz: number; level: number; scale: number; color: THREE.Color } | null): void {
    const p = this.host.params;
    if (!fire) {
      skyUniforms.uRimFireColor.value.setRGB(0, 0, 0);
      return;
    }
    skyUniforms.uRimFire.value.set(fire.lx, fire.lz, RIM_FIRE_REACH);
    skyUniforms.uRimFireColor.value.copy(fire.color)
      .multiplyScalar(RIM_FIRE_GAIN * Math.max(0, p.rim) * fire.level * fire.scale * Math.min(1.2, p.fireGlowStrength / 0.6));
  }
}

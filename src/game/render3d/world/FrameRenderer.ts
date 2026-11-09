// O QUADRO DO MUNDO 3D: o relógio, o céu, a câmera, as luzes, as sombras e as partículas avançam, e a cadeia de pós
// desenha — na ordem em que cada um precisa do anterior.

import * as THREE from 'three';
import { cullFarChildren } from '../sceneCull';
import { profiler } from '@/game/debug/Profiler';
import { shroudDayUniform } from '../ChunkShroud3D';
import { getPixelScale } from '@/game/runtime/graphicsSettings';
import { flowTimeUniform, lightCapUniform, lightResUniform, lightStepsUniform, lightWobbleUniform, reflectionStrengthUniform, seaFlowUniform, texelAaUniform, waterGlintUniform, windUniform } from '../pixelArtLight';
import { platform } from '@/game/platform/platform';
import { fireGlowResUniform, fireRampCoreUniform, fireRampMidUniform, fireRampRimUniform, type MistUniforms, setFireGlow } from '../glowMaterials';
import type { FireEntry } from './TerrainData';
import type { World3D } from '../World3D';
import { CAST_REACH_TILES, FIRE_COOL, FIRE_HOT } from './worldDefs';

/**
 * Folga além da área de chão visível, em tiles. A área já vem com 2 de folga; isto cobre a altura
 * de um sprite em pé (o pé fora da tela, a cabeça dentro) e a sombra de chão mais comprida.
 */
const CULL_PAD_TILES = CAST_REACH_TILES;

/** O que FrameRenderer usa de World3D. */
export type FrameRendererHost = Pick<World3D,
  'ambientLight' | 'appliedFov' | 'cam' | 'camTarget' | 'camera' | 'casts' | 'chunkShroud' | 'elapsed' | 'groundLight' | 'hero' | 'lights' | 'look' | 'mirror' | 'moonLight' | 'objects' | 'params' | 'particles' | 'projection' | 'renderer' | 'scene' | 'screen' | 'shadowLight' | 'shadows' | 'tiles'
>;

export class FrameRenderer {
  /** A lista de filhos que o render percorre neste quadro (ver cullFarChildren). */
  private readonly renderChildren: THREE.Object3D[] = [];
  // Scratch for the per-frame light assignment (never reallocated).
  private readonly lightCandidates: FireEntry[] = [];

  public constructor(private readonly host: FrameRendererHost) {}

  public render(dtMs: number): void {
    const dt = Math.min(dtMs / 1000, 0.05);
    this.host.elapsed += dt;
    this.host.cam.shakeMs = Math.max(0, this.host.cam.shakeMs - dtMs);
    // We own the reset now (autoReset is off), so the frame's counters cover every pass the
    // composer runs, not just the last one.
    this.host.renderer.info.reset();
    profiler.begin('rustle');
    this.host.objects.updateRustles(dt);
    profiler.end('rustle');
    this.host.chunkShroud.update(dtMs); // avança (e encerra) as dissoluções de compra de chunk

    // Live knobs (window.hd3d). A hora do dia vem PRIMEIRO: ela reescreve os outros.
    this.host.look.syncDaylight(dtMs);
    texelAaUniform.value = Math.min(1, Math.max(0, this.host.params.texelAa));
    lightStepsUniform.value = Math.max(0, this.host.params.lightSteps);
    lightResUniform.value = Math.max(0, this.host.params.lightRes);
    lightWobbleUniform.value = Math.max(0, this.host.params.lightWobble);
    lightCapUniform.value = this.host.params.lightCap;
    seaFlowUniform.value = Math.max(0, this.host.params.seaFlow);
    reflectionStrengthUniform.value = Math.min(1, Math.max(0, this.host.params.reflection));
    // These five are CSS STRINGS, live-tunable through window.hd3d — and Color.set(string) parses
    // the CSS every time it is called. Re-reading them each frame meant five regex parses a frame
    // to arrive back at the colour that was already there. Only re-parse when the knob moves.
    this.host.look.applyColor('fireRampCore', fireRampCoreUniform.value, this.host.params.fireRampCore);
    this.host.look.applyColor('fireRampMid', fireRampMidUniform.value, this.host.params.fireRampMid);
    this.host.look.applyColor('fireRampRim', fireRampRimUniform.value, this.host.params.fireRampRim);
    fireGlowResUniform.value = Math.max(0, this.host.params.fireGlowRes);
    flowTimeUniform.value = this.host.elapsed;
    // A névoa do fora do mundo é knob vivo (hd3d.voidMist): a malha já está assada, e o que
    // muda é só a profundidade da rampa dentro do shader.
    if (this.host.tiles.terrainMats) {
      (this.host.tiles.terrainMats.voidMist.userData.mist as MistUniforms).depth.value = Math.max(0, this.host.params.voidMist);
    }
    windUniform.value = Math.max(0, this.host.params.wind);
    // A mortalha do explorador tem duas paletas, e a escolha é a mesma do céu: de noite ela é mais
    // funda que o escuro, de dia é um banco de neblina batido de sol (ver ChunkShroud3D).
    shroudDayUniform.value = this.host.params.daylight;
    this.host.ambientLight.intensity = this.host.params.ambient;
    this.host.look.applyColor('ambient', this.host.ambientLight.color, this.host.params.ambientColor);
    // A mesma DirectionalLight é a lua e o SOL — de roupa trocada, nunca substituída: criar uma
    // luz em runtime recompilaria todo shader do mundo (ver FIRE_LIGHT_SLOTS).
    this.host.moonLight.intensity = this.host.params.moon;
    this.host.look.applyColor('moon', this.host.moonLight.color, this.host.params.moonColor);
    this.host.look.applyColor('glint', waterGlintUniform.value, this.host.params.glintColor);
    if (this.host.scene.background instanceof THREE.Color) {
      this.host.look.applyColor('sky', this.host.scene.background, this.host.params.skyColor);
    }
    if (this.host.scene.fog instanceof THREE.FogExp2) {
      this.host.look.applyColor('fog', this.host.scene.fog.color, this.host.params.skyColor);
      this.host.scene.fog.density = this.host.params.fogDensity;
    }
    const fov = this.host.screen.effectiveFov(this.host.camera.aspect);
    if (fov !== this.host.appliedFov) {
      this.host.camera.fov = fov;
      this.host.camera.updateProjectionMatrix();
      this.host.appliedFov = fov;
    }
    this.host.screen.syncFinishUniforms();
    // Tilt-shift focus follows the hero: normally he sits at screen centre, but a
    // dialog pan (setViewOffset) slides him off it — track his projected screen
    // line so the sharp band stays on him. params.focusY biases it from centre.
    const heroX = this.host.camTarget.x - this.host.projection.viewOffsetX;
    const heroZ = this.host.camTarget.z - this.host.projection.viewOffsetY;
    const heroScreen = this.host.projection.focusAtCentre ? this.host.projection.projectTile(this.host.camTarget.x, this.host.camTarget.z, 0.5) : this.host.projection.projectTile(heroX, heroZ, 0.5);
    const trackedFocusY = 1 - heroScreen.y / Math.max(1, platform().display.height);
    this.host.screen.finishPass.uniforms.uFocusY.value = trackedFocusY + (this.host.params.focusY - 0.52);
    // A NITIDEZ do menu de pausa entra por aqui, como a hora do dia: quem MEXEU desde o último
    // frame manda. Assim o botão pega no instante em que o jogo volta a andar, e `hd3d.pixelScale`
    // continua funcionando pelo console (ele vence enquanto o menu não é tocado).
    const wanted = getPixelScale();
    if (wanted !== this.host.screen.appliedPixelScale && wanted !== Math.round(this.host.params.pixelScale)) {
      this.host.params.pixelScale = wanted;
    }
    if (Math.max(1, Math.round(this.host.params.pixelScale)) !== this.host.screen.appliedPixelScale) {
      this.host.screen.applyPixelScale();
    }

    // Realistic firelight. A real flame's light is never a steady lamp: it has a
    // fast shimmer riding a slower swell, an irregular jitter, and the odd "log
    // pop" flare or momentary dip — and it shifts colour (deep orange when low,
    // paler gold at a flare's peak) and dances its source point. Each fire layers
    // all of that (seeded so no two sync), then the nearest one hands its dance to
    // the single shadow-casting light so the real cast shadows stretch and shrink.
    profiler.begin('fires');
    const t = this.host.elapsed;
    // Live pool-size knobs (window.hd3d.fireDist / fireDecay).
    this.host.shadowLight.distance = this.host.params.fireDist;
    this.host.shadowLight.decay = this.host.params.fireDecay;
    let nearest: FireEntry | null = null;
    let bestD = Infinity;
    this.host.lights.litFires.length = 0;
    for (const f of this.host.lights.fires) {
      // Irregular jitter: a random walk, low-passed so it wanders instead of buzzing.
      f.noise += (Math.random() - 0.5) * 0.6;
      f.noise *= 0.85;
      const nz = Math.max(-1, Math.min(1, f.noise));
      // Occasional log-pop (a flare up) or a brief settle (a dip), eased in/out.
      f.flareTimer -= dt;
      if (f.flareTimer <= 0) {
        f.flareTarget = Math.random() < 0.35 ? Math.random() * 0.6 - 0.15 : 0;
        f.flareTimer = 0.25 + Math.random() * 1.6;
      }
      f.flare += (f.flareTarget - f.flare) * Math.min(1, dt * 7);
      // Layered dance: slow swell + mid flicker + fast shimmer + jitter + flare.
      const dance =
        0.12 * Math.sin(t * 1.9 + f.seed) +
        0.09 * Math.sin(t * 5.7 + f.seed * 2.1) +
        0.05 * Math.sin(t * 12.3 + f.seed * 3.7) +
        0.11 * nz +
        f.flare;
      const level = Math.max(0.4, 1 + dance); // stays alive at its dimmest
      f.flicker = dance;
      f.level = level;
      const on = f.lit ? 1 : 0;
      // The flame is computed whether or not a real light ends up pointed at it — it is a
      // few sines, and it keeps the glow pool (below) dancing for every fire on screen.
      f.intensity = this.host.params.fireIntensity * f.scale * on * level;
      f.lx = f.worldX + 0.05 * Math.sin(t * 4.6 + f.seed) + nz * 0.04;
      f.lz = f.worldY + 0.04 * Math.cos(t * 3.9 + f.seed * 1.5) + nz * 0.03;
      // Colour temperature tracks brightness: hotter flame reads paler/whiter-gold.
      const warm = Math.max(0, Math.min(1, (level - 0.75) / 0.7));
      f.color.copy(FIRE_COOL).lerp(FIRE_HOT, warm);
      // The visible warm pool breathes with the flame; it vanishes when unlit. `sizeScale` is
      // what lets a SMALL source be small instead of merely dim — see FireEntry.sizeScale.
      const gSize = this.host.params.fireGlowSize * f.sizeScale * (0.95 + 0.08 * (level - 1));
      setFireGlow(
        f.glow, f.lx, f.lz, gSize,
        on * f.scale * this.host.params.fireGlowStrength * (0.8 + 0.2 * level),
      );
      f.camDist = Math.hypot(f.worldX - this.host.camTarget.x, f.worldY - this.host.camTarget.z);
      // A fire only counts as a light source once it is actually giving off light. A bush
      // that has just caught (scale ramping up from 0) or is guttering out (scale back to
      // 0) is lit but BLACK: letting it win the "nearest fire" contest below would hand
      // the single shadow-casting light an intensity of zero, and every cast shadow in the
      // clearing would blink out and pop back for the length of the burn.
      if (f.lit && f.scale > 0.05) {
        this.host.lights.litFires.push(f);
        if (f.camDist < bestD) { bestD = f.camDist; nearest = f; }
      }
    }

    if (nearest) {
      // The nearest fire hands its full dance (position, colour, intensity) to the shadow
      // light; its height rises on a flare so the cast shadows leap with it. That light IS
      // the nearest fire's light — which is why it is skipped in the pool assignment below.
      this.host.shadowLight.position.set(
        nearest.lx,
        this.host.params.shadowHeight + nearest.flare * 0.4 + nearest.flicker * 0.12,
        nearest.lz,
      );
      this.host.shadowLight.intensity = nearest.intensity;
      this.host.shadowLight.color.copy(nearest.color);
    } else {
      this.host.shadowLight.intensity = 0;
    }

    // Hand the pooled lights to the lit fires closest to the camera. There are only
    // FIRE_LIGHT_SLOTS of them because every light taxes every lit fragment (see the
    // constant), and a world can hold far more fires than are ever worth shading — the
    // lava field alone is eight tiles. Whoever misses out keeps their glow quad, so the
    // fire still reads as a warm pool on the ground; it just stops shading the 3D around
    // it, at a range where a distance-limited point light was nearly black anyway.
    this.lightCandidates.length = 0;
    for (const f of this.host.lights.litFires) {
      if (f !== nearest) this.lightCandidates.push(f);
    }
    this.lightCandidates.sort((a, b) => a.camDist - b.camDist);
    let used = 0;
    for (; used < this.host.lights.fireLights.length && used < this.lightCandidates.length; used += 1) {
      const f = this.lightCandidates[used];
      const light = this.host.lights.fireLights[used];
      light.distance = this.host.params.fireDist;
      light.decay = this.host.params.fireDecay;
      light.position.set(f.lx, 1.1, f.lz);
      light.color.copy(f.color);
      light.intensity = f.intensity;
    }
    this.host.lights.activeFireLights = used;
    for (let i = used; i < this.host.lights.fireLights.length; i += 1) this.host.lights.fireLights[i].intensity = 0;
    profiler.end('fires');

    profiler.begin('torch');
    this.host.hero.updateTorch(dt, t);
    this.host.hero.updateHeroSight(); // a vista dele: projetada com a câmera JÁ desta hora (ver o doc)
    profiler.end('torch');
    profiler.begin('castShadows');
    const maskOn = this.host.params.shadowMask > 0;
    if (maskOn !== this.host.shadows.appliedMaskMode) this.host.shadows.applyShadowMaskMode(maskOn);
    this.host.casts.updateCastShadows();
    if (maskOn) this.host.shadows.renderShadowMask();
    profiler.end('castShadows');
    profiler.begin('biome');
    this.host.look.updateBiomeGrade(dt);
    profiler.end('biome');
    profiler.begin('particles');
    this.host.particles.update(dt, this.host.elapsed, this.host.camTarget, nearest, this.host.params);
    profiler.end('particles');

    this.host.screen.finishPass.uniforms.uTime.value = this.host.elapsed;
    // Any shader that still needs compiling gets compiled+linked HERE, inside the driver,
    // on the frame it is first drawn — which is why an invisible shader-cache invalidation
    // surfaces as a mystery spike in this one section. See Profiler.ts.
    //
    // The CPU time of this section is only the SUBMISSION cost; the GPU timer query is what
    // tells you how long the frame actually took to draw (per-pixel cost — lights, overdraw,
    // the post chain — is invisible to any CPU clock).
    // A luz do chão, uma vez por célula (ver GroundLightMap): depois de luzes e câmera andarem.
    profiler.begin('groundLight');
    this.host.groundLight.update(this.host.renderer, this.host.camera);
    profiler.end('groundLight');
    profiler.begin('reflection');
    this.host.mirror.render(this.host.params.reflection);
    profiler.end('reflection');
    profiler.begin('compose');
    profiler.gpuBegin();
    // UMA LIMPEZA SÓ. Com o fundo da cena sendo uma COR (o céu), o three limpa o alvo inteiro — cor, profundidade e
    // stencil, com a cor do céu — ao desenhar o fundo (WebGLBackground: `forceClear`), logo depois da limpeza que a
    // passada da cena faz. A primeira era sobrescrita por inteiro: ~1,2 ms de GPU por quadro numa tela de retina em
    // meio-float, jogados fora. Sem fundo de cor, a passada volta a limpar.
    this.host.screen.scenePass.clear = !(this.host.scene.background as THREE.Color | null)?.isColor;
    // O render só percorre o que pode aparecer (ver sceneCull); a lista da cena volta inteira logo depois.
    const allChildren = cullFarChildren(this.host.scene, this.host.groundLight.view, this.renderChildren, CULL_PAD_TILES);
    this.host.screen.composer.render();
    this.host.scene.children = allChildren;
    profiler.gpuEnd();
    profiler.end('compose');
  }
}

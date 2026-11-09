// A CARA DO MUNDO 3D: o céu e as luzes seguindo a hora do dia, o grade de cor da região (o bosque frio, a lava
// quente), o esmaecer e o grade da estação.

import * as THREE from 'three';
import { setDaylight } from '@/game/runtime/graphicsSettings';
import { advanceTimeOfDay, getTimeOfDay, setTimeOfDay } from '@/game/runtime/timeOfDay';
import { DAY_SKY } from '../skyPreset';
import type { World3D } from '../World3D';

// Per-region colour grading (see updateBiomeGrade): the split-tone the frame is graded with in the
// woodland, and the one a lava basin drags it toward, plus how far the lava's influence reaches.
const BIOME_LAVA_RADIUS = 11; // tiles
// Tinted shadows, the A Short Hike way: the dark is a COLOUR (violet-blue), never just
// darker — it's what makes the fire pool's warmth read as warmth.
const GRADE_WOOD_SHADOW = new THREE.Vector3(0.88, 0.91, 1.14);
const GRADE_WOOD_HIGH = new THREE.Vector3(1.12, 1.02, 0.86); // warm amber highlights
/**
 * O MESMO bosque ao meio-dia. Ele precisa de par próprio — e não do de cima com `grade` mais alto
 * — porque a separação quente/frio do dia é MAIOR e tem outra cor: o que enche a sombra de um dia
 * de sol é o CÉU (azul), e o que bate no alto é o SOL (ouro). Aqui é o único desenho de "quente
 * contra frio" que sobra no dia, e é onde o amarelo dele é decidido.
 *
 * O alto puxa forte para o ouro porque a CURVA come tinta: `pow(0.66)` transforma uma razão de
 * 1,24× em 1,15× na tela. Todo tom escolhido aqui chega mais fraco do que parece — e é por isso
 * que este par é mais extremo que o noturno em vez de ser o noturno com o volume alto.
 */
const GRADE_DAY_SHADOW = new THREE.Vector3(0.84, 0.93, 1.2);
const GRADE_DAY_HIGH = new THREE.Vector3(1.24, 1.06, 0.72);
const GRADE_LAVA_SHADOW = new THREE.Vector3(1.06, 0.92, 0.86); // even the dark runs warm here
const GRADE_LAVA_HIGH = new THREE.Vector3(1.20, 0.98, 0.72); // molten amber
export interface World3DParams {
  camHeight: number;
  camBack: number;
  fov: number;
  /**
   * CSS pixels per rendered pixel. 1 = full resolution (the 2D game's crispness —
   * the pixel-art look comes from the NEAREST-filtered 16px art itself, exactly as
   * before); raise it for a deliberately chunkier retro frame.
   */
  pixelScale: number;
  /**
   * Anti-alias the TILES' pixel grid: 1 = on (default), 0 = the raw NEAREST staircase.
   * The tile art stays crisp either way — only the seam between two texels changes. It is a
   * shader-side A/B of the whole effect (see pixelArtLight/TEXEL_AA_GLSL), so flipping it live
   * through window.hd3d.texelAa costs nothing and recompiles nothing.
   */
  texelAa: number;
  /** Retro light banding: ≥ 1 = that many flat brightness tiers; 0 = smooth (default). */
  lightSteps: number;
  /** Light texels per tile (0 = smooth per-pixel light). See pixelArtLight.lightResUniform. */
  lightRes: number;
  /** How far (tiles) the firelight's contours dent organically (0 = perfect circles). */
  lightWobble: number;
  /** How far direct light may push a surface past its art colour (fire pool brightness). */
  lightCap: number;
  /**
   * Quanta VIDA a agua do mar tem: 1 = o padrao, 0 = uma foto (a agua parada de antes), 2 = o
   * dobro. Escala a corrente, a marola e a arrebentacao de uma vez — "mais/menos movimento" e uma
   * decisao unica de olho, e ela precisa poder ser tomada com o jogo rodando (window.hd3d.seaFlow),
   * nao por recompilacao. Ver as SEA_* GLSL em pixelArtLight.
   */
  seaFlow: number;
  /**
   * O ESPELHO D'ÁGUA: quanto do reflexo dos personagens cobre o rio e o lago (0 = desligado, e a
   * passada nem roda). Ver renderReflection.
   */
  reflection: number;
  /**
   * A HORA DO DIA: 0 = a noite autorada (o padrão do jogo), 1 = o dia de sol.
   *
   * Não é um número contínuo — é uma CHAVE. Virá-la troca ~vinte outros knobs de uma vez
   * (`skyPreset.DAY_SKY`), e voltar a 0 devolve cada um ao valor de fábrica. Ela é o único knob
   * deste objeto que escreve nos outros, então tunar à mão e depois virar a chave descarta o que
   * foi tunado — é o preço de um preset, e ele é o certo: "dia" é uma decisão só.
   *
   * Interpolar entre os dois seria bonito (um amanhecer) e caro: a alpha/comprimento da sombra
   * projetada re-ASSA o campo instanciado dos sólidos, e um lerp por frame seria uma re-assadura
   * por frame. Por isso a troca é seca.
   */
  daylight: number;
  ambient: number;
  fireIntensity: number;
  /** Campfire light reach (THREE distance, in tiles) and falloff exponent (decay).
   *  A big distance + low decay = the wide, smooth warm pool the 2D game had. */
  fireDist: number;
  fireDecay: number;
  /** The visible warm GLOW haze around a fire (the 2D game's cozy yellow halo):
   *  an additive radial sprite on the ground — size in tiles, strength = its opacity. */
  fireGlowSize: number;
  fireGlowStrength: number;
  /** The pool's authored band colours (the A Short Hike painted lighting ramp):
   *  hottest ring → outermost ring. */
  fireRampCore: string;
  fireRampMid: string;
  fireRampRim: string;
  /** The pool's paint resolution in texels/tile — coarser than the art on purpose
   *  (8 = 2×2-art-pixel blocks): the low-res firelight. 0 = smooth. */
  fireGlowRes: number;
  /** Height (tiles) of the shadow-casting fire light: HIGHER = shorter cast shadows
   *  (the 2D game had short shadows); low = long, raking, physically-fiery shadows. */
  shadowHeight: number;
  /** Firelight cast shadows (2D ground silhouettes): the flame's reach in tiles
   *  (past it an object throws no shadow) and the darkness right beside the flame. */
  castShadowRadius: number;
  castShadowAlpha: number;
  /**
   * Moonlight cast shadows — the directional counterpart of the fire silhouettes, so
   * the forest keeps its depth BETWEEN fires. Alpha is the darkness (0 = off); length
   * is in caster heights. The heading follows the moon light itself. Static solids
   * bake into one instanced draw (fillMoonCastField); each actor's single shadow mesh
   * swings from flame-cast to moon-cast at a fire pool's edge (handoffCast).
   */
  moonShadowAlpha: number;
  moonShadowLength: number;
  /**
   * Heading hysteresis for the cast shadows, as a distance RATIO (1 = off). Midway between
   * two lit fires, "nearest" flips with the flames' breathing and the shadow snaps direction
   * every few frames — so the incumbent flame keeps a caster until a challenger is clearly
   * closer (its distance under ratio × the incumbent's).
   */
  castHysteresis: number;
  /**
   * How much a caster's ELEVATION moves its silhouette (1 = full, 0 = the old pinned look):
   * a lifted caster's shadow slides away from the light and thins, so a jump/bob reads on
   * the ground — the same projection the robotic arm's skeleton shadow already used.
   */
  castElevation: number;
  /**
   * Stop silhouettes at the water's edge (1 = on). The river/lava/sea beds are SUNKEN, and
   * a quad laid at ground level would float in the air across the channel — so a cast that
   * reaches a sunken tile is clamped at the bank and dimmed.
   */
  castWaterClamp: number;
  /**
   * Give the STATIC solids the same fire→moon handoff the actors have (1 = on): inside a
   * lit pool a tree's baked moon silhouette fades by the fire cast's strength, so a tree
   * and an NPC on the same pool edge behave the same instead of the tree wearing two
   * shadows at once.
   */
  moonHandoff: number;
  /**
   * THE SHADOW MASK (plano.md fase 3, experimental — 0 = the classic decal path).
   * At 1 the fire silhouettes stop being black quads multiplied over the finished frame
   * and become DATA: drawn once into a small top-down RT (max-blended — overlaps can
   * never double-darken), which the lit materials sample to attenuate ONLY the point
   * lights' direct term. Consequences, in order of importance: sprites RECEIVE shade
   * (the hero darkens inside a tree's shadow), a shadow can never be darker than the
   * unlit night (ambient and moon pass through), and the CPU sort dies (max-blend is
   * order-free). Billboards sample at a probe leaned toward their own light so a caster
   * never stands in its own silhouette. Live-flippable: all programs are compiled at
   * boot and the flip is a uniform.
   */
  shadowMask: number;
  /** Mask texels per tile (the mask's own pixel-art grain). */
  shadowMaskRes: number;
  /**
   * A NÉVOA NEGRA do fora do mundo, em TILES: quantos ela leva para fechar em preto a partir da
   * fronteira autorada (0 = sem névoa, e a mata de fora fica exposta como qualquer outra).
   *
   * É knob e não constante porque é a única coisa que decide quanto de "mundo lá fora" o jogador
   * enxerga — subir esconde a mata e o mapa parece maior; baixar mostra a floresta e o mapa ganha
   * horizonte. Decisão de olho, e olho não recompila.
   */
  voidMist: number;
  heroLight: number;
  /**
   * A VISTA DO HERÓI: quanto o quadro ABRE em volta dele (0 = nada, e a noite é a de antes).
   *
   * Não é uma lâmpada, é uma CURVA — e a razão está medida no doc de `setHeroSight`: à noite o
   * `lightCap` já está gasto pela lua, então nenhuma luz THREE nova pode clarear o chão nem um
   * por cento. Quem levanta um quadro neste jogo é o `pow` (a mesma lei do `lift`, ver
   * skyPreset.ts), e aqui ele é aplicado só onde ele está.
   */
  heroSight: number;
  /**
   * O DISCO da vista: a poça fria desenhada no chão, na mesma opacidade em que a fogueira mede a
   * dela (`fireGlowStrength`). É ele que dá SILHUETA à vista — a curva sozinha clareia uma região
   * sem borda nem centro, e isso a olho é "a tela está mais clara", não "o herói tem luz".
   */
  heroSightGlow: number;
  /** O raio da vista, em TILES de chão (o círculo vira elipse na tela, pela inclinação da câmera). */
  heroSightTiles: number;
  /**
   * Quantos tiles a vista pende PARA ONDE ELE OLHA. É o que a faz ler como visão e não como
   * auréola: virar-se varre o campo claro, então o herói enxerga à frente, não em volta.
   */
  heroSightLean: number;
  fogDensity: number;
  /** Cool directional moonlight that fills the night (0 = off). */
  moon: number;
  /**
   * Tint of the ambient + moon fill. Kept NEAR-NEUTRAL so the sprites show their
   * own art colours (a strongly blue fill turned the trees' green teal — user
   * feedback). Push it bluer for a colder night, greyer for truer art colours.
   */
  ambientColor: string;
  moonColor: string;
  /**
   * O AR: a cor do fundo E do fog, que são obrigatoriamente a mesma (um fog que não termina na cor
   * do fundo desenha uma emenda no infinito). A câmera olha 48° para baixo e o horizonte nunca
   * entra no quadro, então isto não é "o céu": é a cor em que a distância se dissolve.
   */
  skyColor: string;
  /** A estrela que a água pisca: a lua fria de noite, o sol branco de dia (pixelArtLight). */
  glintColor: string;
  // ── HD-2D post chain (all live-tunable) ──
  /** ACES tone-mapping exposure. */
  exposure: number;
  /** Bloom halo strength / radius / luminance threshold. */
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  /** Tilt-shift: screen-Y (0 bottom … 1 top) of the sharp band, its half-height, and max blur px. */
  focusY: number;
  focusBand: number;
  dofBlur: number;
  /**
   * How much of that blur the FOREGROUND (below the hero's band) gets, as a fraction of the
   * background's: Octopath melts the distance and only softens the front, so this stays < 1.
   */
  dofNear: number;
  /** Vignette darkening at the corners (0 = off) and film-grain amount. */
  vignette: number;
  /**
   * A CURVA DE TELA — o expoente com que o quadro pronto é levantado. 1 = a rampa reta que este
   * jogo sempre teve (a noite, intocada); menores levantam sombra e meio-tom sem mexer no branco.
   *
   * Ela existe porque este jogo NÃO tem tone mapping. O `RenderPass` desenha o mundo num render
   * target, e o three só monta o ACES quando o alvo é a tela (`WebGLPrograms`: `toneMapping` fica
   * em `NoToneMapping` com um alvo ligado) — então `params.exposure` não chega a shader nenhum e
   * o valor LINEAR do buffer vai cru para o canvas, que o mostra como se fosse sRGB. É daí que
   * vem o escuro fundo e contrastado da noite, e é por isso que a `ambient` precisou de 8,5.
   *
   * Consequência para o DIA: não há curva nenhuma comprimindo o alto, então "mais luz" estoura o
   * branco antes de clarear a sombra — 1,0 é um corte seco. `lift` é a ferramenta certa para
   * levantar um quadro: `pow` é monótono, leva 1 em 1 e abre justamente os graves, que é onde a
   * diferença entre meio-dia e meia-noite mora. Fica em 1 na noite, e em 1 ela é literalmente a
   * identidade (o `if` no shader nem roda) — a noite não muda um bit por causa disto.
   */
  lift: number;
  grain: number;
  /**
   * O VENTO na vegetação (0 = mundo parado, 1 = padrão, 2 = o dobro). É um knob vivo porque
   * "quanto de vento" é decisão de olho, e não pode custar uma recompilação de shader — a mesma
   * regra do `seaFlow`.
   */
  wind: number;
  /** Ambient particle brightness multipliers (0 = off): fireflies over the grass, low mist. */
  /** Idle handheld drift of the camera, in tiles (0 = a locked-off tripod). */
  camSway: number;
  /**
   * A CÂMERA DE PIXEL SUAVE (1 = ligada, 0 = a câmera contínua de antes). Só age quando um pixel
   * desenhado ocupa mais de um pixel do aparelho (modo econômico, celular): ver snapCameraToPixel.
   */
  pixelSnap: number;
  fireflies: number;
  mist: number;
  /**
   * Cinematic grade (in the FinishShader): split-tone amount (cool shadows / warm
   * highlights, 0 = off), saturation (1 = unchanged) and contrast (1 = unchanged).
   */
  grade: number;
  saturation: number;
  contrast: number;
}
/** Smoothstep keeps dawn and dusk soft instead of behaving like a dimmer switch. */
const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const x = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return x * x * (3 - 2 * x);
};
/** Duas cores CSS misturadas (0 = a primeira, 1 = a segunda), de volta em CSS. */
const mixColor = (from: string, to: string, amount: number): string => {
  const a = new THREE.Color(from);
  a.lerp(new THREE.Color(to), amount);
  return `#${a.getHexString()}`;
};

/** O que WorldLook usa de World3D. */
export type WorldLookHost = Pick<World3D, 'camTarget' | 'moonCastRotY' | 'moonLight' | 'params' | 'screen' | 'tiles'>;

export class WorldLook {
  private biomeHeat = 0;
  // ── a hora do dia (hd3d.daylight — ver skyPreset.ts) ──
  /**
   * O que os knobs do DAY_SKY valiam de fábrica, capturado antes da primeira escrita: é esta a
   * NOITE. Guardá-la em vez de escrever um preset "night" à mão é o que impede as duas de
   * divergirem — mexer no padrão lá em cima já muda a noite para a qual o dia volta.
   */
  private readonly nightSky: Partial<World3DParams> = {};
  /** The last manual value written through window.hd3d.daylight. */
  private appliedDaylightKnob = 0;
  /** Shadows are re-baked only at small solar-angle steps, never every rendered frame. */
  private appliedSolarShadowStep = -1;
  /** Last CSS string pushed into each live colour, so an unchanged knob costs nothing. */
  private readonly appliedColors: Record<string, string> = {};

  public constructor(private readonly host: WorldLookHost) {}

  /**
   * Colour grading per REGION: the woodland is graded cool (blue shadows, faintly amber
   * highlights); a lava field bathes the whole frame in heat. "Where am I" is measured from the
   * ground itself — how much lava lies around the camera — and the tint eases between the two, so
   * walking into a molten basin warms the picture over a few steps instead of cutting to it.
   */
  public updateBiomeGrade(dt: number): void {
    let nearLava = 0;
    for (const p of this.host.tiles.lavaSpots) {
      const d = Math.hypot(p.x - this.host.camTarget.x, p.y - this.host.camTarget.z);
      if (d < BIOME_LAVA_RADIUS) nearLava = Math.max(nearLava, 1 - d / BIOME_LAVA_RADIUS);
    }
    // Ease toward the region's grade (a few tenths of a second), never snap.
    this.biomeHeat += (nearLava - this.biomeHeat) * Math.min(1, dt * 1.6);

    // O bosque tem duas horas do dia; a bacia de lava não — pedra derretida é a mesma fornalha ao
    // meio-dia e à meia-noite, e é ela que o grade está descrevendo ali.
    const u = this.host.screen.finishPass.uniforms;
    (u.uShadowTint.value as THREE.Vector3)
      .copy(GRADE_WOOD_SHADOW)
      .lerp(GRADE_DAY_SHADOW, this.host.params.daylight)
      .lerp(GRADE_LAVA_SHADOW, this.biomeHeat);
    (u.uHighTint.value as THREE.Vector3)
      .copy(GRADE_WOOD_HIGH)
      .lerp(GRADE_DAY_HIGH, this.host.params.daylight)
      .lerp(GRADE_LAVA_HIGH, this.biomeHeat);
  }

  /** Death fade (0 = normal, 1 = black): the world drains and sinks, in the post. */
  public setWorldFade(t: number): void {
    this.host.screen.finishPass.uniforms.uFade.value = Math.max(0, Math.min(1, t));
  }

  /** A cor da estação sobre o quadro inteiro. 1, 1, 1, 1 não muda um bit (ver runtime/seasons). */
  public setSeasonGrade(r: number, g: number, b: number, saturation: number): void {
    (this.host.screen.finishPass.uniforms.uSeasonTint.value as THREE.Vector3).set(r, g, b);
    this.host.screen.finishPass.uniforms.uSeasonSat.value = saturation;
  }

  public get worldFade(): number {
    return this.host.screen.finishPass.uniforms.uFade.value as number;
  }

  public applyColor(key: string, target: THREE.Color, css: string): void {
    if (this.appliedColors[key] === css) return;
    this.appliedColors[key] = css;
    target.set(css);
  }

  /**
   * Applies a solar position, rather than a binary lighting preset. Dawn and dusk interpolate
   * every visual contribution; only the expensive baked ground shadows move in 16 gentle steps.
   */
  public applySky(time: number): void {
    if (Object.keys(this.nightSky).length === 0) {
      // A NOITE, capturada dos valores de fábrica na primeira passagem — antes de qualquer
      // escrita. Ver o campo: é isto que impede a noite de existir duas vezes.
      const factory = this.nightSky as Record<string, number | string>;
      const current = this.host.params as unknown as Record<string, number | string>;
      for (const key of Object.keys(DAY_SKY)) factory[key] = current[key];
    }
    // Midnight → sunrise → noon → sunset → midnight. A little twilight remains after the sun is
    // geometrically below the horizon, which avoids an abrupt black-blue cut.
    const elevation = Math.sin((time - 0.25) * Math.PI * 2);
    const daylight = smoothstep(-0.12, 0.22, elevation);
    const night = this.nightSky as Record<string, number | string>;
    const day = DAY_SKY as Record<string, number | string>;
    const current = this.host.params as unknown as Record<string, number | string>;
    for (const key of Object.keys(DAY_SKY)) {
      const from = night[key];
      const to = day[key];
      if (typeof from === 'number' && typeof to === 'number') current[key] = from + (to - from) * daylight;
      else if (typeof from === 'string' && typeof to === 'string') current[key] = mixColor(from, to, daylight);
    }
    // The shadow field is geometry, not a shader uniform. Quantising it prevents a full terrain
    // re-bake each frame while making the sun's shadow direction visibly travel through the day.
    const shadowStep = Math.round(time * 16) % 16;
    if (this.host.moonLight && shadowStep !== this.appliedSolarShadowStep) {
      this.appliedSolarShadowStep = shadowStep;
      const angle = time * Math.PI * 2;
      this.host.moonLight.position.set(-Math.cos(angle) * 8, Math.max(1.5, 3 + Math.max(0, elevation) * 9), -Math.sin(angle) * 8);
      this.host.moonCastRotY = Math.atan2(this.host.moonLight.position.x, this.host.moonLight.position.z);
    }
    this.host.params.daylight = daylight;
    this.appliedDaylightKnob = this.host.params.daylight;
  }

  /**
   * Duas portas para a mesma verdade: o menu de pausa (que grava) e `hd3d.daylight` (o console).
   * Quem MEXEU desde o último frame é quem quis dizer alguma coisa — e o que ficou decidido volta
   * para as duas, para o rótulo do menu e o knob nunca contarem histórias diferentes.
   */
  public syncDaylight(dtMs: number): void {
    // Keep the former live console knob as a useful deterministic override for visual QA.
    // A deliberate 0/1 write jumps to midnight/noon; otherwise time advances normally.
    if (this.host.params.daylight !== this.appliedDaylightKnob) {
      const forced = this.host.params.daylight >= 0.5 ? 0.5 : 0;
      setTimeOfDay(forced);
      setDaylight(this.host.params.daylight >= 0.5 ? 1 : 0);
    } else {
      advanceTimeOfDay(dtMs);
    }
    this.applySky(getTimeOfDay());
  }
}

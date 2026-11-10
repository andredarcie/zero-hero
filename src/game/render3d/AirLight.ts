// O AR ACESO — a luz VOLUMÉTRICA do vale, o passo que faltava entre "pixel art num chão 3D" e HD-2D.
//
// Até aqui a luz só existia onde batia: no chão, numa árvore, no herói. O AR entre a câmera e o mundo era vazio, e é
// nele que mora o que faz um diorama parecer ter atmosfera: o facho de sol que desce entre duas copas, a mata que
// guarda bruma dourada no fim da tarde, o halo em volta da fogueira com o vizinho recortado contra ele.
//
// SÃO DUAS CONTAS, as duas por pixel de um alvo de MEIA resolução (ar é macio: não precisa de mais), somadas ao quadro
// pelo acabamento (finishShader, `tAir`):
//
//   1. O SOL (e a lua). O raio da câmera até o que ela vê atravessa uma camada de ar rente ao chão. Em cada passo
//      pergunta-se: este ponto do ar está no sol ou na sombra? A resposta já estava desenhada — as SILHUETAS que cada
//      árvore, rocha e personagem deita no chão (CastShadow3D). Elas são fotografadas de cima num alvo pequeno (a
//      MÁSCARA), e um ponto a uma altura h está na sombra se a silhueta cobre o chão onde a sombra DELE cairia
//      (h × o rumo da sombra). A sombra do chão vira volume: o facho de luz tem exatamente o recorte da copa que o
//      deixou passar, e anda com o sol.
//      O ar só é denso onde há sombra por perto (a média larga da própria máscara): a mata guarda bruma, o campo
//      aberto fica limpo. Sem isso o prado inteiro ganharia um véu — a "neblina branca" que este jogo já recusou.
//
//   2. O FOGO. Luz de um ponto num ar parelho tem integral fechada ao longo do raio (dois arcos-tangente): um halo
//      de verdade, em 3D. Quem está ENTRE a câmera e a chama corta o raio antes dela e sai escuro contra o clarão;
//      quem está atrás aparece dentro dele. É o que o disco pintado no chão nunca pôde fazer.
//
// Nada aqui é luz THREE (a contagem é selada) nem mexe em material do mundo: é um passe de tela cheia e um alvo de
// cima. `hd3d.air` = 0 desliga os dois e o passe nem roda.

import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { isReducedMotion } from '@/game/runtime/accessibility';
import { skyUniforms } from './atmosphere';
import { shadowTint } from './CastShadow3D';
import type { World3D } from './World3D';

/** A área que a máscara cobre em volta do alvo da câmera, em tiles, e quantos texels por tile (a grade da arte). */
const MASK_TILES_X = 36;
const MASK_TILES_Z = 30;
const MASK_RES = 16;
/** Passos do raio dentro da camada de ar. O passo é sorteado por pixel (e desmanchado no acabamento). */
const STEPS = 8;
/** Quantas chamas acendem o ar ao mesmo tempo: as mais perto da câmera, mais a tocha. */
const FIRES = 5;
/** A altura do coração do halo de uma fogueira, em tiles acima do chão dela. */
const FLAME_Y = 0.55;
/** Quanto o pé de um corpo anda em direção ao sol para ler a sombra que recebe (fora da silhueta dele mesmo). */
const SHADE_PROBE = 0.42;

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform sampler2D tDepth;
  uniform sampler2D tMask;
  uniform sampler2D uSkyNoise;
  uniform mat4 uInvViewProj;
  uniform vec3 uCamPos;
  uniform vec4 uMaskRect;   // x mínimo, z MÁXIMO, largura, altura (a máscara é vista de cima: o v dela cresce para -z)
  uniform vec2 uCastVec;    // onde cai a sombra de um ponto, no chão, por tile de altura
  uniform float uMaskGain;  // 1 / a escuridão de uma silhueta cheia
  uniform float uGroundY;
  uniform float uAirTop;
  uniform float uOpenAir;
  uniform vec3 uSunAir;
  uniform vec3 uSunDir;
  uniform vec2 uHazeDrift;
  uniform vec4 uFirePos[${FIRES}];
  uniform vec3 uFireCol[${FIRES}];
  uniform float uHeat;
  varying vec2 vUv;

  // Ruído de gradiente intercalado (Jimenez): uma média de 3×3 dele é quase lisa, que é o que o acabamento faz.
  float zhIgn(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

  vec2 zhMaskUv(vec2 xz) {
    return vec2((xz.x - uMaskRect.x) / uMaskRect.z, (uMaskRect.y - xz.y) / uMaskRect.w);
  }

  void main() {
    float depth = texture2D(tDepth, vUv).x;
    vec4 clip = uInvViewProj * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec3 P = clip.xyz / clip.w;
    vec3 ray = P - uCamPos;
    float T = length(ray);
    vec3 D = ray / max(T, 1e-4);
    vec3 air = vec3(0.0);
    float heat = 0.0;

    // ── 1. o sol atravessando a camada de ar ──
    if (uSunAir.r + uSunAir.g + uSunAir.b > 0.0 && D.y < -1e-3) {
      float tIn = clamp((uGroundY + uAirTop - uCamPos.y) / D.y, 0.0, T);
      // No máximo 5 tiles de ar, os mais perto do chão: no alto de uma tela em pé o olhar é raso e o raio atravessaria
      // dez tiles de bruma — o fundo do quadro virava um clarão só.
      tIn = max(tIn, T - 5.0);
      float seg = T - tIn;
      if (seg > 0.0) {
        // A bruma mora onde há sombra por perto (a média larga da máscara) e deriva em bancos lentos.
        vec2 guv = zhMaskUv(P.xz);
        float cover = clamp((1.0 - textureLod(tMask, guv, 5.0).r) * uMaskGain * 2.4, 0.0, 1.0);
        float bank = 0.5 + texture2D(uSkyNoise, P.xz * 0.04 + uHazeDrift).b;
        float body = mix(uOpenAir, 1.0, cover) * bank;
        float jitter = zhIgn(gl_FragCoord.xy);
        float acc = 0.0;
        for (int i = 0; i < ${STEPS}; i++) {
          vec3 p = uCamPos + D * (tIn + seg * (float(i) + jitter) / ${STEPS.toFixed(1)});
          float h = max(p.y - uGroundY, 0.0);
          vec2 muv = zhMaskUv(p.xz + h * uCastVec);
          // Nível 2 da máscara (quatro texels por leitura): a borda de um facho no ar é penumbra, não recorte — e a
          // ponta em degraus da sombra de quem anda (fadeCastTail) riscaria o corpo dele de listras.
          float shade = clamp((1.0 - textureLod(tMask, muv, 2.0).r) * uMaskGain, 0.0, 1.0);
          // Fora da máscara não se sabe: conta como sol (a borda dela fica além da tela).
          shade *= step(0.0, muv.x) * step(muv.x, 1.0) * step(0.0, muv.y) * step(muv.y, 1.0);
          acc += (1.0 - shade) * (1.0 - h / uAirTop);
        }
        // O ar espalha a luz PARA A FRENTE (Henyey-Greenstein, g = 0,55): olhando contra o sol ele acende, de costas
        // para o sol quase some. É o que dá rumo ao clarão — de manhã ele vem do alto da tela, de onde vem o sol.
        float mu = dot(D, uSunDir);
        float phase = 1.05 / pow(1.3025 - 1.1 * mu, 1.5);
        air += uSunAir * body * phase * acc * seg / ${STEPS.toFixed(1)};
      }
    }

    // ── 2. o halo das chamas ──
    // ∫ dt / (r² + a²) ao longo do raio, menos a mesma integral com um raio largo: o que sobra cai como 1/r⁴ ao longe,
    // então o clarão tem tamanho — sem a subtração, a cauda de 1/r acenderia a tela inteira.
    for (int i = 0; i < ${FIRES}; i++) {
      vec3 c = uFireCol[i];
      if (c.r + c.g + c.b > 0.0) {
        vec3 q = uCamPos - uFirePos[i].xyz;
        float b = dot(q, D);
        float near2 = max(dot(q, q) - b * b, 0.0);
        float core = uFirePos[i].w;
        float s1 = sqrt(near2 + core * core);
        float s2 = sqrt(near2 + core * core * 30.0);
        float i1 = (atan((T + b) / s1) - atan(b / s1)) / s1;
        float i2 = (atan((T + b) / s2) - atan(b / s2)) / s2;
        air += c * max(i1 - i2, 0.0);
        // O AR QUENTE: a coluna que sobe da chama, onde o raio passa mais perto dela — larga em cima, estreita no pé,
        // e só se nada está na frente (quem passa entre a câmera e o fogo não treme). Vai no alfa; o acabamento
        // desloca a leitura do quadro por ele (finishShader).
        vec3 hot = uCamPos + D * clamp(-b, 0.0, T) - uFirePos[i].xyz;
        float rise = hot.y;
        heat += exp(-dot(hot.xz, hot.xz) / (0.1 + 0.14 * max(rise, 0.0)))
          * smoothstep(-0.1, 0.25, rise) * (1.0 - smoothstep(0.8, 2.0, rise))
          * step(-b - 0.4, T) * clamp(dot(c, vec3(9.0)), 0.0, 1.0);
      }
    }

    gl_FragColor = vec4(air, clamp(heat, 0.0, 1.0) * uHeat);
  }
`;

/**
 * A SUAVIZAÇÃO do ar: uma tenda de 3×3 texels (quatro leituras bilineares nos cantos do texel). O passo do raio é
 * sorteado por pixel, e esse sorteio é feito para sumir exatamente numa média de 3×3; somar o ar cru ao quadro deixava
 * o pontilhado à vista onde ele varia mais — o corpo do herói saía riscado de listras.
 */
const SMOOTH_FRAGMENT = /* glsl */ `
  uniform sampler2D tAirRaw;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    vec4 s = texture2D(tAirRaw, vUv + vec2( 0.5,  0.5) * uTexel)
           + texture2D(tAirRaw, vUv + vec2(-0.5,  0.5) * uTexel)
           + texture2D(tAirRaw, vUv + vec2( 0.5, -0.5) * uTexel)
           + texture2D(tAirRaw, vUv + vec2(-0.5, -0.5) * uTexel);
    gl_FragColor = s * 0.25; // rgb = a luz no ar, a = o ar quente acima das chamas
  }
`;

/** O que AirLight usa de World3D. */
export type AirLightHost = Pick<World3D,
  'camTarget' | 'camera' | 'casts' | 'hero' | 'lights' | 'moonCastRotY' | 'params' | 'renderer' | 'scene' | 'shadows' | 'tiles'
>;

export class AirLight {
  /** As silhuetas de sol/lua vistas de cima: branco = sol, escuro = sombra. */
  private readonly mask: THREE.WebGLRenderTarget;
  private readonly maskCamera: THREE.OrthographicCamera;
  /** O ar aceso deste quadro, em meia resolução: cru (com o pontilhado do passo) e suavizado (o que o quadro soma). */
  private readonly raw: THREE.WebGLRenderTarget;
  private readonly target: THREE.WebGLRenderTarget;
  private readonly quad: FullScreenQuad;
  private readonly smooth: FullScreenQuad;
  private readonly smoothTexel = new THREE.Vector2(1, 1);
  private readonly uniforms: Record<string, THREE.IUniform>;
  /** A lista de filhos da passada da máscara: as luzes (todas, pela lei do pool) e as sombras. */
  private readonly kept: THREE.Object3D[] = [];
  private readonly scratch = { clear: new THREE.Color(), tint: new THREE.Color(), fire: new THREE.Color() };
  /** O ar foi desenhado neste quadro? (O acabamento só o soma se sim.) */
  public live = false;
  /** O contador de quadros: a máscara é refeita nos ímpares (ver render). */
  private tick = 0;

  public constructor(private readonly host: AirLightHost) {
    this.mask = new THREE.WebGLRenderTarget(MASK_TILES_X * MASK_RES, MASK_TILES_Z * MASK_RES, {
      depthBuffer: false,
      magFilter: THREE.LinearFilter,
      // Com mipmaps: o nível 5 (dois tiles por texel) é a "sombra por perto" que decide onde o ar é denso.
      minFilter: THREE.LinearMipmapLinearFilter,
      generateMipmaps: true,
    });
    // Deitada: olha para baixo com o x do mundo para a direita e o -z para cima (ver uMaskRect).
    this.maskCamera = new THREE.OrthographicCamera(
      -MASK_TILES_X / 2, MASK_TILES_X / 2, MASK_TILES_Z / 2, -MASK_TILES_Z / 2, 0.1, 40,
    );
    this.maskCamera.rotation.x = -Math.PI / 2;
    const half = (): THREE.WebGLRenderTarget => new THREE.WebGLRenderTarget(2, 2, {
      type: THREE.HalfFloatType,
      depthBuffer: false,
      magFilter: THREE.LinearFilter,
      minFilter: THREE.LinearFilter,
      generateMipmaps: false,
    });
    this.raw = half();
    this.target = half();
    this.uniforms = {
      tDepth: { value: null },
      tMask: { value: this.mask.texture },
      uSkyNoise: skyUniforms.uSkyNoise,
      uInvViewProj: { value: new THREE.Matrix4() },
      uCamPos: { value: new THREE.Vector3() },
      uMaskRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      uCastVec: { value: new THREE.Vector2() },
      uMaskGain: { value: 1 },
      uGroundY: { value: 0 },
      uAirTop: { value: 2.4 },
      uOpenAir: { value: 0.1 },
      uSunAir: { value: new THREE.Color(0, 0, 0) },
      uSunDir: skyUniforms.uSunDir,
      uHazeDrift: { value: new THREE.Vector2() },
      uFirePos: { value: new Float32Array(FIRES * 4) },
      uFireCol: { value: new Float32Array(FIRES * 3) },
      uHeat: { value: 1 },
    };
    this.quad = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      depthTest: false,
      depthWrite: false,
    }));
    this.smooth = new FullScreenQuad(new THREE.ShaderMaterial({
      uniforms: { tAirRaw: { value: this.raw.texture }, uTexel: { value: this.smoothTexel } },
      vertexShader: VERTEX,
      fragmentShader: SMOOTH_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    }));
  }

  public get texture(): THREE.Texture {
    return this.target.texture;
  }

  /** O quadro mudou de tamanho (em pixels do buffer): o ar acompanha, na metade. */
  public setSize(w: number, h: number): void {
    const hw = Math.max(1, Math.ceil(w / 2));
    const hh = Math.max(1, Math.ceil(h / 2));
    this.raw.setSize(hw, hh);
    this.target.setSize(hw, hh);
    this.smoothTexel.set(1 / hw, 1 / hh);
  }

  /** Desenha o ar cru e, por cima, a versão suavizada que o acabamento soma. */
  private draw(): void {
    const renderer = this.host.renderer;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.raw);
    this.quad.render(renderer);
    renderer.setRenderTarget(this.target);
    this.smooth.render(renderer);
    renderer.setRenderTarget(prev);
  }

  /**
   * AS SILHUETAS DE CIMA. As mesmas malhas de sombra que o quadro desenha (o campo assado das árvores, a barra dos
   * maciços, a sombra de cada ator), com uma câmera deitada sobre o alvo. Pintadas de PRETO só nesta passada: a
   * máscara guarda quanto de sol chega, e a cor da sombra (`shadowTint`) é assunto do quadro.
   */
  private renderMask(everyCaster = false): void {
    const { scene, renderer, tiles, shadows, casts, camTarget } = this.host;
    const kept = this.kept;
    kept.length = 0;
    for (const o of scene.children) {
      if ((o as THREE.Light).isLight) kept.push(o);
    }
    const field = tiles.moonCastField?.mesh;
    if (field && field.parent === scene && field.count > 0) kept.push(field);
    if (shadows.massShadowMesh) kept.push(shadows.massShadowMesh);
    // `everyCaster` é o aquecimento: a sombra de quem anda entra mesmo escondida (o programa dela tem de ser
    // desenhado uma vez NESTE alvo antes do jogo, e no carregamento ela ainda não tem para onde apontar).
    const hidden: THREE.Mesh[] = [];
    for (const c of casts.castCasters) {
      if (c.mesh.parent !== scene) continue;
      if (!c.mesh.visible) {
        if (!everyCaster) continue;
        c.mesh.visible = true;
        hidden.push(c.mesh);
      }
      kept.push(c.mesh);
    }

    // Presa à grade de texels da máscara: solta, as sombras lidas nadariam contra o mundo quando a câmera anda.
    const cx = Math.round(camTarget.x * MASK_RES) / MASK_RES;
    const cz = Math.round(camTarget.z * MASK_RES) / MASK_RES;
    this.maskCamera.position.set(cx, 20, cz);
    this.maskCamera.updateMatrixWorld();
    (this.uniforms.uMaskRect.value as THREE.Vector4).set(
      cx - MASK_TILES_X / 2, cz + MASK_TILES_Z / 2, MASK_TILES_X, MASK_TILES_Z,
    );

    const s = this.scratch;
    s.tint.copy(shadowTint);
    shadowTint.setRGB(0, 0, 0);
    const prevTarget = renderer.getRenderTarget();
    renderer.getClearColor(s.clear);
    const prevAlpha = renderer.getClearAlpha();
    const all = scene.children;
    const background = scene.background;
    scene.children = kept;
    scene.background = null;
    renderer.setRenderTarget(this.mask);
    renderer.setClearColor(0xffffff, 1);
    renderer.clear(true, false, false);
    renderer.render(scene, this.maskCamera);
    scene.children = all;
    scene.background = background;
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(s.clear, prevAlpha);
    shadowTint.copy(s.tint);
    for (const mesh of hidden) mesh.visible = false;

    // A mesma máscara é a sombra que os CORPOS recebem no quadro seguinte (pixelArtLight.SPRITE_SHADE_GLSL): o pé de
    // cada um a lê um passo em direção ao sol, fora da própria silhueta.
    skyUniforms.uShadeMap.value = this.mask.texture;
    skyUniforms.uShadeRect.value.copy(this.uniforms.uMaskRect.value as THREE.Vector4);
    skyUniforms.uShadeProbe.value.set(Math.sin(this.host.moonCastRotY) * SHADE_PROBE, Math.cos(this.host.moonCastRotY) * SHADE_PROBE);
  }

  /** As chamas que acendem o ar neste quadro: as acesas mais perto da câmera, e a tocha na mão. */
  private gatherFires(strength: number): boolean {
    const pos = this.uniforms.uFirePos.value as Float32Array;
    const col = this.uniforms.uFireCol.value as Float32Array;
    col.fill(0);
    if (strength <= 0) return false;
    const { lights, hero, params } = this.host;
    // A chama recua de dia (o mesmo recuo do disco no chão): fireGlowStrength é o knob que já diz quanto.
    const k = strength * 0.045 * Math.min(1.4, params.fireGlowStrength / 0.6);
    let n = 0;
    const lit = lights.litFires;
    // `litFires` não vem ordenada; com poucas vagas, escolhe-se as mais perto por seleção direta.
    for (let slot = 0; slot < FIRES - 1; slot++) {
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < lit.length; i++) {
        const f = lit[i];
        if (f.camDist >= bestD || f.camDist > 26) continue;
        let taken = false;
        for (let j = 0; j < n; j++) {
          if (pos[j * 4] === f.lx && pos[j * 4 + 2] === f.lz) { taken = true; break; }
        }
        if (!taken) { best = i; bestD = f.camDist; }
      }
      if (best < 0) break;
      const f = lit[best];
      const size = Math.max(0.35, f.sizeScale);
      pos[n * 4] = f.lx; pos[n * 4 + 1] = FLAME_Y; pos[n * 4 + 2] = f.lz; pos[n * 4 + 3] = 0.85 * size;
      const a = k * f.scale * f.level * size;
      col[n * 3] = f.color.r * a; col[n * 3 + 1] = f.color.g * a; col[n * 3 + 2] = f.color.b * a;
      n++;
    }
    if (hero.torch.strength > 0.05 && hero.torchLight) {
      const p = hero.torchLight.position;
      pos[n * 4] = p.x; pos[n * 4 + 1] = p.y; pos[n * 4 + 2] = p.z; pos[n * 4 + 3] = 0.7;
      const a = k * 0.8 * hero.torch.strength * hero.torch.level;
      const c = hero.torchLight.color;
      col[n * 3] = c.r * a; col[n * 3 + 1] = c.g * a; col[n * 3 + 2] = c.b * a;
      n++;
    }
    return n > 0;
  }

  /**
   * Um quadro do ar. `depth` é a profundidade da cena JÁ desenhada neste quadro (o alvo do compositor). Com
   * `hd3d.air` e `hd3d.airFire` em 0 nada é desenhado e `live` fica falso.
   */
  public render(depth: THREE.Texture | null): void {
    const { params, camera, camTarget } = this.host;
    const u = this.uniforms;
    // A máscara das silhuetas é barata (três ou quatro draws num alvo pequeno) e tem dois leitores: o ar e os corpos
    // que recebem sombra. Ela existe sempre que há sombra de sol/lua para desenhar.
    // Um quadro sim, um não: uma sombra anda no máximo um fio de texel por quadro, e o ar e o corpo que a leem são
    // macios — o atraso de um quadro não se vê, e a passada (um render inteiro do three, com as luzes) custa metade.
    const maskOn = params.moonShadowAlpha > 0.03;
    this.tick += 1;
    if (maskOn && (this.tick & 1) === 1) this.renderMask();
    skyUniforms.uShadeOn.value = maskOn ? 1 : 0;
    const sunOn = maskOn && params.air > 0.001;
    const sun = u.uSunAir.value as THREE.Color;
    if (sunOn) sun.copy(skyUniforms.uSunAir.value);
    else sun.setRGB(0, 0, 0);
    const fires = this.gatherFires(Math.max(0, params.airFire));
    this.live = Boolean(depth) && (sunOn || fires);
    if (!this.live) return;

    if (sunOn) {
      const len = params.moonShadowLength;
      (u.uCastVec.value as THREE.Vector2).set(
        -Math.sin(this.host.moonCastRotY) * len, -Math.cos(this.host.moonCastRotY) * len,
      );
      u.uMaskGain.value = 1 / Math.max(0.05, params.moonShadowAlpha);
    }
    u.tDepth.value = depth;
    (u.uInvViewProj.value as THREE.Matrix4).multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
    (u.uCamPos.value as THREE.Vector3).setFromMatrixPosition(camera.matrixWorld);
    u.uGroundY.value = camTarget.y;
    u.uAirTop.value = Math.max(0.5, params.airHeight);
    u.uOpenAir.value = Math.min(1, Math.max(0, params.airOpen));
    (u.uHazeDrift.value as THREE.Vector2).copy(skyUniforms.uCloudDrift.value).multiplyScalar(0.11);
    // O tremor do ar quente é movimento de tela: com "reduzir movimento" ligado ele não acontece.
    u.uHeat.value = isReducedMotion() ? 0 : 1;
    this.draw();
  }

  /** Desenha a máscara e o ar uma vez no carregamento: o ANGLE só termina um programa no primeiro draw. */
  public warm(depth: THREE.Texture | null): void {
    this.renderMask(true);
    this.uniforms.tDepth.value = depth;
    this.draw();
  }

  public dispose(): void {
    this.mask.dispose();
    this.raw.dispose();
    this.target.dispose();
    this.quad.material.dispose();
    this.quad.dispose();
    this.smooth.material.dispose();
    this.smooth.dispose();
  }
}

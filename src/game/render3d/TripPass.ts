// O PASSO DO CHÁ DA SHUI: depois do acabamento, só durante a viagem (desligado, o compositor nem o visita e o
// acabamento volta a desenhar direto na tela). O desenho é o `tripShader`; o que cada efeito vale a cada instante vem
// de `look`, escrito pela cena (scenes/game/ShuiTea, a partir de runtime/trip).
//
// Os RASTROS pedem o quadro anterior: ele é desenhado num alvo próprio (dois, alternando) e depois copiado para a
// saída. Fora da viagem nada disso existe no quadro.

import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';
import { TRIP_FRAGMENT, TRIP_VERTEX } from './tripShader';

/** O quanto de cada efeito, de 0 a 1 (ver tripShader). Tudo em 0 é o quadro de sempre. */
export interface TripLook {
  time: number;
  visor: number;
  open: number;
  specks: number;
  rainbow: number;
  breathe: number;
  hue: number;
  form: number;
  tunnel: number;
  /** Quanto o túnel já andou (a velocidade é a derivada: acumulada fora, para mudar sem tranco). */
  travel: number;
  spin: number;
  web: number;
  /** De onde a rede se acende (o tile do herói), e até onde ela já chegou, em tiles. */
  webX: number;
  webY: number;
  webR: number;
  trail: number;
  white: number;
  dark: number;
  reduced: boolean;
}

export const restingLook = (): TripLook => ({
  time: 0, visor: 0, open: 0, specks: 0, rainbow: 0, breathe: 0, hue: 0, form: 0, tunnel: 0, travel: 0, spin: 0,
  web: 0, webX: 0, webY: 0, webR: 0, trail: 0, white: 0, dark: 0, reduced: false,
});

const COPY_FRAGMENT = /* glsl */ `
  uniform sampler2D tDiffuse;
  varying vec2 vUv;
  void main() { gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb, 1.0); }
`;

export class TripPass extends Pass {
  public readonly look: TripLook = restingLook();
  private readonly material: THREE.ShaderMaterial;
  private readonly copy: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;
  private readonly copyQuad: FullScreenQuad;
  /** Os dois quadros dos rastros: só existem durante a viagem (do tamanho da tela, em meio-float), ver `release`. */
  private history: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget] | null = null;
  private readonly size = { w: 1, h: 1 };
  private flip = 0;

  /** `finish` são os uniformes do acabamento: a profundidade e a matriz de volta ao mundo vêm de lá, a cada quadro. */
  public constructor(w: number, h: number, private readonly finish: Record<string, THREE.IUniform>) {
    super();
    this.enabled = false;
    this.size.w = w;
    this.size.h = h;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tHistory: { value: null },
        tDepth: { value: null },
        uInvViewProj: { value: new THREE.Matrix4() },
        uResolution: { value: new THREE.Vector2(w, h) },
        uTime: { value: 0 },
        uVisor: { value: 0 },
        uOpen: { value: 0 },
        uSpecks: { value: 0 },
        uRainbow: { value: 0 },
        uBreathe: { value: 0 },
        uHue: { value: 0 },
        uForm: { value: 0 },
        uTunnel: { value: 0 },
        uTravel: { value: 0 },
        uSpin: { value: 0 },
        uWeb: { value: 0 },
        uWebAt: { value: new THREE.Vector2() },
        uWebR: { value: 0 },
        uTrail: { value: 0 },
        uWhite: { value: 0 },
        uDark: { value: 0 },
        uReduced: { value: 0 },
      },
      vertexShader: TRIP_VERTEX,
      fragmentShader: TRIP_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this.copy = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null } },
      vertexShader: TRIP_VERTEX,
      fragmentShader: COPY_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.material);
    this.copyQuad = new FullScreenQuad(this.copy);
  }

  public override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    const u = this.material.uniforms;
    const k = this.look;
    const history = this.targets();
    u.tDiffuse.value = readBuffer.texture;
    u.tHistory.value = history[this.flip].texture;
    u.tDepth.value = this.finish.tDepth.value;
    (u.uInvViewProj.value as THREE.Matrix4).copy(this.finish.uInvViewProj.value as THREE.Matrix4);
    u.uTime.value = k.time;
    u.uVisor.value = k.visor;
    u.uOpen.value = k.open;
    u.uSpecks.value = k.specks;
    u.uRainbow.value = k.rainbow;
    u.uBreathe.value = k.breathe;
    u.uHue.value = k.hue;
    u.uForm.value = k.form;
    u.uTunnel.value = k.tunnel;
    u.uTravel.value = k.travel;
    u.uSpin.value = k.spin;
    u.uWeb.value = k.web;
    (u.uWebAt.value as THREE.Vector2).set(k.webX, k.webY);
    u.uWebR.value = k.webR;
    u.uTrail.value = k.trail;
    u.uWhite.value = k.white;
    u.uDark.value = k.dark;
    u.uReduced.value = k.reduced ? 1 : 0;
    const out = history[1 - this.flip];
    renderer.setRenderTarget(out);
    this.quad.render(renderer);
    this.copy.uniforms.tDiffuse.value = out.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.copyQuad.render(renderer);
    this.flip = 1 - this.flip;
  }

  /**
   * Desenha os dois programas uma vez, só nos alvos próprios (o carregamento, ver ShaderPrewarm): no ANGLE o programa
   * só termina no primeiro desenho, e o primeiro quadro do chá não pode ser ele.
   */
  public warm(renderer: THREE.WebGLRenderer): void {
    const prev = renderer.getRenderTarget();
    const [a, b] = this.targets();
    this.material.uniforms.tDiffuse.value = b.texture;
    this.material.uniforms.tHistory.value = b.texture;
    renderer.setRenderTarget(a);
    this.quad.render(renderer);
    this.copy.uniforms.tDiffuse.value = a.texture;
    renderer.setRenderTarget(b);
    this.copyQuad.render(renderer);
    renderer.setRenderTarget(prev);
    this.release();
  }

  /** A viagem acabou: os quadros dos rastros saem da GPU (o programa fica compilado; ele mora no material). */
  public release(): void {
    for (const target of this.history ?? []) target.dispose();
    this.history = null;
    this.material.uniforms.tHistory.value = null;
    this.copy.uniforms.tDiffuse.value = null;
  }

  private targets(): [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget] {
    if (!this.history) {
      const make = (): THREE.WebGLRenderTarget => new THREE.WebGLRenderTarget(this.size.w, this.size.h, { type: THREE.HalfFloatType });
      this.history = [make(), make()];
      this.flip = 0;
    }
    return this.history;
  }

  public override setSize(w: number, h: number): void {
    this.size.w = w;
    this.size.h = h;
    for (const target of this.history ?? []) target.setSize(w, h);
    (this.material.uniforms.uResolution.value as THREE.Vector2).set(w, h);
  }

  public override dispose(): void {
    this.release();
    this.material.dispose();
    this.copy.dispose();
    this.quad.dispose();
    this.copyQuad.dispose();
  }
}

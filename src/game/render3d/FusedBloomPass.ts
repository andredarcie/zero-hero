import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const BLUR_X = new THREE.Vector2(1, 0);
const BLUR_Y = new THREE.Vector2(0, 1);

/**
 * O BLOOM SEM A ÚLTIMA PASSADA. É o `UnrealBloomPass` do three, passo a passo, menos o fim: ele
 * extrai o claro, desfoca os cinco mips e os compõe na meia resolução — e para aí. A soma aditiva
 * sobre o quadro, que o three faz numa passada de tela cheia, quem faz é o shader de acabamento,
 * que já lê cada pixel da tela de qualquer jeito (ver `makeFinishShader`, `frameAt`).
 *
 * A conta é a MESMA: o three soma com `AdditiveBlending` PRÉ-MULTIPLICADO (`ONE, ONE`: cena +
 * bloom, sem pesar pelo alfa — o `blendMaterial` dele nasce com `premultipliedAlpha: true`), e o
 * acabamento soma `bloom.rgb` amostra por amostra, antes do tilt-shift, exatamente onde a soma
 * morava. Conferido pixel a pixel contra o caminho antigo, no mesmo quadro.
 * O que some é uma leitura-e-escrita da tela inteira por quadro — num buffer de retina,
 * 4 megapixels em meio-float.
 *
 * Sem `renderer.clear()` antes de cada passada (o three limpa as doze): cada uma é um quad de
 * tela cheia, opaco e sem blend, que escreve TODO texel do alvo — a limpeza era uma escrita
 * inteira do alvo jogada fora logo em seguida, doze vezes por quadro.
 *
 * `needsSwap = false` porque ele não escreve no quadro: o acabamento lê a cena intacta no
 * `readBuffer` e o bloom em `texture`.
 */
export class FusedBloomPass extends UnrealBloomPass {
  private readonly quad = new FullScreenQuad();
  private readonly oldClearColor = new THREE.Color();

  public constructor(resolution: THREE.Vector2, strength: number, radius: number, threshold: number) {
    super(resolution, strength, radius, threshold);
    this.needsSwap = false;
  }

  /** O bloom composto (meia resolução, filtro linear), pronto para somar sobre o quadro. */
  public get texture(): THREE.Texture {
    return this.renderTargetsHorizontal[0].texture;
  }

  public override render(
    renderer: THREE.WebGLRenderer,
    _writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    const oldClearColor = renderer.getClearColor(this.oldClearColor);
    const oldClearAlpha = renderer.getClearAlpha();
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setClearColor(this.clearColor, 0);

    const highPass = this.highPassUniforms as Record<string, THREE.IUniform>;
    highPass.tDiffuse.value = readBuffer.texture;
    highPass.luminosityThreshold.value = this.threshold;
    this.quad.material = this.materialHighPassFilter;
    renderer.setRenderTarget(this.renderTargetBright);
    this.quad.render(renderer);

    let input: THREE.WebGLRenderTarget = this.renderTargetBright;
    for (let i = 0; i < this.nMips; i++) {
      const blur = this.separableBlurMaterials[i];
      this.quad.material = blur;
      blur.uniforms.colorTexture.value = input.texture;
      blur.uniforms.direction.value = BLUR_X;
      renderer.setRenderTarget(this.renderTargetsHorizontal[i]);
      this.quad.render(renderer);

      blur.uniforms.colorTexture.value = this.renderTargetsHorizontal[i].texture;
      blur.uniforms.direction.value = BLUR_Y;
      renderer.setRenderTarget(this.renderTargetsVertical[i]);
      this.quad.render(renderer);
      input = this.renderTargetsVertical[i];
    }

    const composite = this.compositeMaterial;
    this.quad.material = composite;
    composite.uniforms.bloomStrength.value = this.strength;
    composite.uniforms.bloomRadius.value = this.radius;
    composite.uniforms.bloomTintColors.value = this.bloomTintColors;
    renderer.setRenderTarget(this.renderTargetsHorizontal[0]);
    this.quad.render(renderer);

    renderer.setClearColor(oldClearColor, oldClearAlpha);
    renderer.autoClear = oldAutoClear;
  }

  public override dispose(): void {
    super.dispose();
    this.quad.dispose();
  }
}

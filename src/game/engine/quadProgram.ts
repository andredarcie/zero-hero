// O PROGRAMA DE QUADS: o shader único do desenho 2D, os atributos do buffer de vértices, e a projeção ortográfica da
// tela (refeita quando a janela muda). Licenças em LICENSES.md.

import { VERTEX_COMPONENTS } from './spriteBatch';
import type { Renderer } from './renderer';

// Os shaders de quad, linha por linha (a conta do pixel é a do jogo inteiro: não mexer).
const VERTEX_SHADER = [
  '#define SHADER_NAME ENGINE_QUAD_VS',
  'precision mediump float;',
  'uniform mat4 uProjectionMatrix;',
  'uniform vec2 uResolution;',
  'attribute vec2 inPosition;',
  'attribute vec2 inTexCoord;',
  'attribute float inTexId;',
  'attribute float inTintEffect;',
  'attribute vec4 inTint;',
  'varying vec2 outTexCoord;',
  'varying float outTintEffect;',
  'varying vec4 outTint;',
  'void main ()',
  '{',
  '    gl_Position = uProjectionMatrix * vec4(inPosition, 1.0, 1.0);',
  '    outTexCoord = inTexCoord;',
  '    outTint = inTint;',
  '    outTintEffect = inTintEffect;',
  '}',
].join('\n');
const FRAGMENT_SHADER = [
  '#define SHADER_NAME ENGINE_QUAD_FS',
  '#ifdef GL_FRAGMENT_PRECISION_HIGH',
  'precision highp float;',
  '#else',
  'precision mediump float;',
  '#endif',
  'uniform sampler2D uMainSampler;',
  'varying vec2 outTexCoord;',
  'varying float outTintEffect;',
  'varying vec4 outTint;',
  'void main ()',
  '{',
  '    vec4 texel = vec4(outTint.bgr * outTint.a, outTint.a);',
  '    vec4 texture = texture2D(uMainSampler, outTexCoord);',
  '    vec4 color = texture * texel;',
  '    if (outTintEffect == 1.0)',
  '    {',
  '        color.rgb = mix(texture.rgb, outTint.bgr * outTint.a, texture.a);',
  '    }',
  '    else if (outTintEffect == 2.0)',
  '    {',
  '        color = texel;',
  '    }',
  '    gl_FragColor = color;',
  '}',
].join('\n');
export const VERTEX_SIZE = VERTEX_COMPONENTS * 4;

/** O que QuadProgram usa de Renderer. */
export type QuadProgramHost = Pick<Renderer,
  'flush' | 'gl' | 'program' | 'uProjection'
>;

export class QuadProgram {
  private readonly projectionMatrix = new Float32Array(16);
  private projectionWidth = 0;
  private projectionHeight = 0;

  public constructor(private readonly host: QuadProgramHost) {}

  public createProgram(): WebGLProgram {
    const gl = this.host.gl;
    const compile = (type: number, source: string): WebGLShader => {
      const shader = gl.createShader(type) as WebGLShader;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`Shader: ${gl.getShaderInfoLog(shader)}`);
      return shader;
    };
    const program = gl.createProgram() as WebGLProgram;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Program: ${gl.getProgramInfoLog(program)}`);
    return program;
  }

  public bindAttributes(): void {
    const gl = this.host.gl;
    const attr = (name: string, size: number, type: number, normalized: boolean, offset: number): void => {
      const loc = gl.getAttribLocation(this.host.program, name);
      if (loc < 0) return;
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, type, normalized, VERTEX_SIZE, offset);
    };
    attr('inPosition', 2, gl.FLOAT, false, 0);
    attr('inTexCoord', 2, gl.FLOAT, false, 8);
    attr('inTexId', 1, gl.FLOAT, false, 16);
    attr('inTintEffect', 1, gl.FLOAT, false, 20);
    attr('inTint', 4, gl.UNSIGNED_BYTE, true, 24);
  }

  /** O ortho(0, w, h, 0, -1000, 1000) do Matrix4, em float32. */
  public setProjectionMatrix(width: number, height: number): void {
    if (width === this.projectionWidth && height === this.projectionHeight) return;
    this.projectionWidth = width;
    this.projectionHeight = height;
    const left = 0;
    const right = width;
    const bottom = height;
    const top = 0;
    const near = -1000;
    const far = 1000;
    let lr = left - right;
    let bt = bottom - top;
    let nf = near - far;
    lr = lr === 0 ? lr : 1 / lr;
    bt = bt === 0 ? bt : 1 / bt;
    nf = nf === 0 ? nf : 1 / nf;
    const m = this.projectionMatrix;
    m.set([-2 * lr, 0, 0, 0, 0, -2 * bt, 0, 0, 0, 0, 2 * nf, 0, (left + right) * lr, (top + bottom) * bt, (far + near) * nf, 1]);
    this.host.flush();
    this.host.gl.useProgram(this.host.program);
    this.host.gl.uniformMatrix4fv(this.host.uProjection, false, m);
  }
}

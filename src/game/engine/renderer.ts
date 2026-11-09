/**
 * O DESENHO 2D — o WebGLRenderer e o pipeline de quads, reduzidos ao
 * que o jogo usa e mantendo cada conta que decide um pixel:
 *
 *   • o contexto WebGL com os mesmos atributos (transparente, SEM antialias, alfa pré-multiplicado, stencil);
 *   • o mesmo shader (a textura vezes a tinta, `tintFill` pinta por cima, cor sólida para formas), a mesma projeção
 *     ortográfica e o mesmo formato de vértice (posição/UV em float32, tinta ABGR em 4 bytes);
 *   • as mesmas misturas (NORMAL = ONE, ONE_MINUS_SRC_ALPHA; ADD = ONE, DST_ALPHA — sim, essa);
 *   • o mesmo arredondamento: o sprite tem a posição truncada e o canto de cima travado no pixel quando o zoom é
 *     inteiro; formas e texto seguem as contas exatas de cada desenhista;
 *   • a mesma ordem: limpa, cor de fundo da câmera, objetos na ordem da lista, efeitos da câmera por cima.
 *
 * Parte do motor próprio (src/game/engine); licenças em LICENSES.md.
 */
import { BlendModes, FilterMode, ScaleEvents } from './constants';
import { TransformMatrix } from './matrix';
import { isSizePowerOfTwo } from './textures';
import type { Game } from './game';
import type { Camera } from './camera';
import type { Scene } from './scene';
import type { GameObject } from './gameobjects/GameObject';
import type { Frame } from './textures';

export interface GLTexture {
  webGLTexture: WebGLTexture | null;
  width: number;
  height: number;
  minFilter: number;
  magFilter: number;
  wrapS: number;
  wrapT: number;
  pma: boolean;
  flipY: boolean;
  pixels: TexImageSource | null;
}

export interface Tint { TL: number; TR: number; BL: number; BR: number }

/** A tinta com o alfa nos 8 bits de cima (o getTintAppendFloatAlpha: o alfa é TRUNCADO para 0–255). */
export const getTintAppendFloatAlpha = (rgb: number, a: number): number => ((((a * 255) | 0) & 0xff) << 24 | rgb) >>> 0;

const getTintAppendFloatAlphaAndSwap = (rgb: number, a: number): number => {
  const ur = ((rgb >> 16) | 0) & 0xff;
  const ug = ((rgb >> 8) | 0) & 0xff;
  const ub = (rgb | 0) & 0xff;
  const ua = ((a * 255) | 0) & 0xff;
  return ((ua << 24) | (ub << 16) | (ug << 8) | ur) >>> 0;
};

const getTintFromFloats = (r: number, g: number, b: number, a: number): number => {
  const ur = ((r * 255) | 0) & 0xff;
  const ug = ((g * 255) | 0) & 0xff;
  const ub = ((b * 255) | 0) & 0xff;
  const ua = ((a * 255) | 0) & 0xff;
  return ((ua << 24) | (ur << 16) | (ug << 8) | ub) >>> 0;
};

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

/** 7 componentes de 4 bytes por vértice: x, y, u, v, unidade, efeito de tinta, tinta (4 bytes). */
const VERTEX_COMPONENTS = 7;
const VERTEX_SIZE = VERTEX_COMPONENTS * 4;
/** O batchSize padrão (4096 quads). */
const VERTEX_CAPACITY = 4096 * 6;

type BlendMode = { func: number[]; equation: number };

export class Renderer {
  public readonly gl: WebGLRenderingContext;
  public readonly canvas: HTMLCanvasElement;
  public width = 0;
  public height = 0;
  public drawingBufferHeight = 0;
  public contextLost = false;
  public currentBlendMode = Infinity;
  public currentType = '';
  public newType = false;
  public nextTypeMatch = false;
  public whiteTexture: GLTexture | null = null;
  public blankTexture: GLTexture | null = null;
  public readonly fillTint: Tint = { TL: 0, TR: 0, BL: 0, BR: 0 };
  public readonly strokeTint: Tint = { TL: 0, TR: 0, BL: 0, BR: 0 };
  public readonly calcMatrix = new TransformMatrix();
  private readonly blendModes: BlendMode[] = [];
  private readonly projectionMatrix = new Float32Array(16);
  private projectionWidth = 0;
  private projectionHeight = 0;
  private readonly program: WebGLProgram;
  private readonly vertexBuffer: WebGLBuffer;
  private readonly vertexData = new ArrayBuffer(VERTEX_CAPACITY * VERTEX_SIZE);
  private readonly vertexViewF32 = new Float32Array(this.vertexData);
  private readonly vertexViewU32 = new Uint32Array(this.vertexData);
  private readonly bytes = new Uint8Array(this.vertexData);
  private vertexCount = 0;
  private currentTexture: GLTexture | null = null;
  private readonly uProjection: WebGLUniformLocation | null;
  private readonly _tempMatrix1 = new TransformMatrix();
  private readonly _tempMatrix2 = new TransformMatrix();
  private readonly _tempMatrix3 = new TransformMatrix();
  private readonly prevQuad = new Float32Array(5);
  private readonly firstQuad = new Float32Array(5);
  private readonly defaultScissor = [0, 0, 0, 0];
  private currentScissor: number[] | undefined = this.defaultScissor;
  private readonly scissorStack: number[][] = [];
  private readonly textures = new Set<GLTexture>();

  public constructor(private readonly game: Game) {
    this.canvas = game.canvas;
    const config = game.config;
    const gl = this.canvas.getContext('webgl', {
      alpha: config.transparent,
      desynchronized: false,
      depth: true,
      antialias: config.antialias,
      premultipliedAlpha: true,
      stencil: true,
      failIfMajorPerformanceCaveat: false,
      powerPreference: 'default',
      preserveDrawingBuffer: false,
    } as WebGLContextAttributes) as WebGLRenderingContext | null;
    if (!gl || gl.isContextLost()) throw new Error('WebGL unsupported');
    this.gl = gl;
    this.canvas.addEventListener('webglcontextlost', (event) => {
      this.contextLost = true;
      event.preventDefault();
    }, false);

    for (let i = 0; i <= 27; i++) this.blendModes.push({ func: [gl.ONE, gl.ONE_MINUS_SRC_ALPHA], equation: gl.FUNC_ADD });
    this.blendModes[1].func = [gl.ONE, gl.DST_ALPHA];
    this.blendModes[2].func = [gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA];
    this.blendModes[3].func = [gl.ONE, gl.ONE_MINUS_SRC_COLOR];
    this.blendModes[17] = { func: [gl.ZERO, gl.ONE_MINUS_SRC_ALPHA], equation: gl.FUNC_REVERSE_SUBTRACT };

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    const clearColor = config.backgroundColor;
    gl.clearColor(clearColor.redGL, clearColor.greenGL, clearColor.blueGL, clearColor.alphaGL);
    gl.clear(gl.COLOR_BUFFER_BIT);

    this.program = this.createProgram();
    gl.useProgram(this.program);
    this.uProjection = gl.getUniformLocation(this.program, 'uProjectionMatrix');
    gl.uniform1i(gl.getUniformLocation(this.program, 'uMainSampler'), 0);
    this.vertexBuffer = gl.createBuffer() as WebGLBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertexData, gl.DYNAMIC_DRAW);
    this.bindAttributes();
    this.setBlendMode(BlendModes.NORMAL);
    game.textures.once('ready', this.boot, this);
  }

  private createProgram(): WebGLProgram {
    const gl = this.gl;
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

  private bindAttributes(): void {
    const gl = this.gl;
    const attr = (name: string, size: number, type: number, normalized: boolean, offset: number): void => {
      const loc = gl.getAttribLocation(this.program, name);
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

  /** As texturas de fábrica chegaram: o tamanho, a tesoura e o RESIZE. */
  private boot(): void {
    const game = this.game;
    const baseSize = game.scale.baseSize;
    this.width = baseSize.width;
    this.height = baseSize.height;
    this.blankTexture = game.textures.getFrame('__DEFAULT')?.glTexture ?? null;
    this.whiteTexture = game.textures.getFrame('__WHITE')?.glTexture ?? null;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.enable(gl.SCISSOR_TEST);
    game.scale.on(ScaleEvents.RESIZE, this.onResize, this);
    this.resize(this.width, this.height);
  }

  private onResize(_gameSize: unknown, baseSize: { width: number; height: number }): void {
    if (baseSize.width !== this.width || baseSize.height !== this.height) this.resize(baseSize.width, baseSize.height);
  }

  public resize(width: number, height: number): this {
    const gl = this.gl;
    this.width = width;
    this.height = height;
    this.setProjectionMatrix(width, height);
    gl.viewport(0, 0, width, height);
    this.drawingBufferHeight = gl.drawingBufferHeight;
    gl.scissor(0, (gl.drawingBufferHeight - height), width, height);
    this.defaultScissor[2] = width;
    this.defaultScissor[3] = height;
    return this;
  }

  /** O ortho(0, w, h, 0, -1000, 1000) do Matrix4, em float32. */
  private setProjectionMatrix(width: number, height: number): void {
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
    this.flush();
    this.gl.useProgram(this.program);
    this.gl.uniformMatrix4fv(this.uProjection, false, m);
  }

  // ── Texturas ──

  private processTexture(texture: GLTexture): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    const currentTexture = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
    gl.bindTexture(gl.TEXTURE_2D, texture.webGLTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, texture.minFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, texture.magFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, texture.wrapS);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, texture.wrapT);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, texture.pma);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, texture.flipY);
    let generateMipmap = false;
    const pixels = texture.pixels;
    if (pixels === null) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, texture.width, texture.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      generateMipmap = isSizePowerOfTwo(texture.width, texture.height);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const w = (pixels as { width: number }).width;
      const h = (pixels as { height: number }).height;
      generateMipmap = isSizePowerOfTwo(w, h);
    }
    if (generateMipmap) gl.generateMipmap(gl.TEXTURE_2D);
    gl.bindTexture(gl.TEXTURE_2D, currentTexture);
    // A amostra seguinte do lote religa a textura dela.
    this.boundTexture = null;
  }

  private boundTexture: GLTexture | null = null;

  private createTexture2D(pixels: TexImageSource | null, width: number, height: number, minFilter: number, magFilter: number, wrap: number, pma = true, flipY = false): GLTexture {
    const texture: GLTexture = {
      webGLTexture: this.gl.createTexture(),
      width, height, minFilter, magFilter, wrapS: wrap, wrapT: wrap, pma, flipY, pixels,
    };
    this.textures.add(texture);
    this.processTexture(texture);
    return texture;
  }

  /** Imagem carregada (o createTextureFromSource): NEAREST, REPEAT se o lado for potência de dois. */
  public createTextureFromSource(source: TexImageSource, width: number, height: number): GLTexture {
    const gl = this.gl;
    const pow = isSizePowerOfTwo(width, height);
    const filter = this.game.config.antialias ? gl.LINEAR : gl.NEAREST;
    return this.createTexture2D(source, width, height, filter, filter, pow ? gl.REPEAT : gl.CLAMP_TO_EDGE);
  }

  /** Canvas (o canvasToTexture): NEAREST, REPEAT se potência de dois e não `noRepeat`, alfa pré-multiplicado. */
  public canvasToTexture(srcCanvas: HTMLCanvasElement, dstTexture: GLTexture | null, noRepeat = false, flipY = false): GLTexture {
    const gl = this.gl;
    const width = srcCanvas.width;
    const height = srcCanvas.height;
    const pow = isSizePowerOfTwo(width, height);
    const wrapping = (!noRepeat && pow) ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    const filter = this.game.config.antialias ? gl.LINEAR : gl.NEAREST;
    if (!dstTexture) return this.createTexture2D(srcCanvas, width, height, filter, filter, wrapping, true, flipY);
    if (width === 0 || height === 0) return dstTexture;
    dstTexture.pixels = srcCanvas;
    dstTexture.width = width;
    dstTexture.height = height;
    dstTexture.flipY = flipY;
    dstTexture.wrapS = wrapping;
    dstTexture.wrapT = wrapping;
    dstTexture.minFilter = filter;
    dstTexture.magFilter = filter;
    this.processTexture(dstTexture);
    return dstTexture;
  }

  public createCanvasTexture(srcCanvas: HTMLCanvasElement): GLTexture {
    return this.canvasToTexture(srcCanvas, null, false, false);
  }

  public updateCanvasTexture(srcCanvas: HTMLCanvasElement, dstTexture: GLTexture): GLTexture {
    return this.canvasToTexture(srcCanvas, dstTexture, false, false);
  }

  public setTextureFilter(texture: GLTexture, filter: number): this {
    const gl = this.gl;
    const glFilter = filter === FilterMode.LINEAR ? gl.LINEAR : gl.NEAREST;
    gl.activeTexture(gl.TEXTURE0);
    const currentTexture = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
    gl.bindTexture(gl.TEXTURE_2D, texture.webGLTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, glFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, glFilter);
    texture.minFilter = glFilter;
    texture.magFilter = glFilter;
    if (currentTexture) gl.bindTexture(gl.TEXTURE_2D, currentTexture);
    this.boundTexture = null;
    return this;
  }

  public deleteTexture(texture: GLTexture | null): this {
    if (!texture) return this;
    if (this.currentTexture === texture) this.flush();
    this.textures.delete(texture);
    if (texture.webGLTexture) this.gl.deleteTexture(texture.webGLTexture);
    texture.webGLTexture = null;
    texture.pixels = null;
    return this;
  }

  // ── Estado ──

  public setBlendMode(blendModeId: number, force = false): boolean {
    const gl = this.gl;
    const blendMode = this.blendModes[blendModeId];
    if (force || (blendModeId !== BlendModes.SKIP_CHECK && this.currentBlendMode !== blendModeId)) {
      this.flush();
      gl.enable(gl.BLEND);
      gl.blendEquation(blendMode.equation);
      if (blendMode.func.length > 2) gl.blendFuncSeparate(blendMode.func[0], blendMode.func[1], blendMode.func[2], blendMode.func[3]);
      else gl.blendFunc(blendMode.func[0], blendMode.func[1]);
      this.currentBlendMode = blendModeId;
      return true;
    }
    return false;
  }

  public pushScissor(x: number, y: number, width: number, height: number): number[] {
    const scissor = [x, y, width, height];
    this.scissorStack.push(scissor);
    this.setScissor(x, y, width, height);
    this.currentScissor = scissor;
    return scissor;
  }

  public popScissor(): void {
    this.scissorStack.pop();
    const scissor = this.scissorStack[this.scissorStack.length - 1];
    if (scissor) this.setScissor(scissor[0], scissor[1], scissor[2], scissor[3]);
    this.currentScissor = scissor;
  }

  private setScissor(x: number, y: number, width: number, height: number): void {
    const current = this.currentScissor;
    let set = width > 0 && height > 0;
    if (current && set) set = current[0] !== x || current[1] !== y || current[2] !== width || current[3] !== height;
    if (set) {
      this.flush();
      this.gl.scissor(x, (this.drawingBufferHeight - y - height), width, height);
    }
  }

  // ── O quadro ──

  /**
   * A LIMPEZA PREGUIÇOSA. O motor de antes limpava o canvas inteiro a cada quadro, desenhasse algo ou não. Aqui a limpeza
   * (a mesma: a tela toda, com a cor de fundo da config) só acontece antes do primeiro desenho do quadro — ou no fim
   * dele, se o quadro anterior tinha desenhado alguma coisa. Quadro vazio depois de quadro vazio não toca no WebGL, e
   * o navegador segue mostrando a mesma tela transparente: os pixels são os mesmos, sem limpar e reapresentar o
   * canvas por cima do mundo 3D a cada quadro em que a interface 2D não tem nada na tela.
   */
  private pendingClear = false;
  private drewLastFrame = true;

  private clearNow(): void {
    const gl = this.gl;
    const clearColor = this.game.config.backgroundColor;
    // A tesoura no começo do quadro é sempre a tela toda: limpar sem ela é a mesma limpeza.
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(clearColor.redGL, clearColor.greenGL, clearColor.blueGL, clearColor.alphaGL);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    gl.enable(gl.SCISSOR_TEST);
  }

  private ensureCleared(): void {
    if (!this.pendingClear) return;
    this.pendingClear = false;
    this.clearNow();
    this.drewLastFrame = true;
  }

  public preRender(): void {
    if (this.contextLost) return;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.pendingClear = true;
    gl.enable(gl.SCISSOR_TEST);
    this.currentScissor = this.defaultScissor;
    this.scissorStack.length = 0;
    this.scissorStack.push(this.currentScissor);
    if (this.game.scene.customViewports) gl.scissor(0, (this.drawingBufferHeight - this.height), this.width, this.height);
  }

  public render(_scene: Scene, children: GameObject[], camera: Camera): void {
    if (this.contextLost) return;
    const childCount = children.length;
    this.preRenderCamera(camera);
    if (childCount === 0) {
      this.setBlendMode(BlendModes.NORMAL);
      this.postRenderCamera(camera);
      return;
    }
    this.currentType = '';
    for (let i = 0; i < childCount; i++) {
      const child = children[i];
      if (child.blendMode !== this.currentBlendMode) this.setBlendMode(child.blendMode);
      const type = child.type;
      if (type !== this.currentType) {
        this.newType = true;
        this.currentType = type;
      }
      this.nextTypeMatch = i < childCount - 1 ? children[i + 1].type === this.currentType : false;
      child.renderWebGL(this, child, camera);
      this.newType = false;
    }
    this.setBlendMode(BlendModes.NORMAL);
    this.postRenderCamera(camera);
  }

  private preRenderCamera(camera: Camera): void {
    const color = camera.backgroundColor;
    camera.emit('prerender', camera);
    this.pushScissor(camera.x, camera.y, camera.width, camera.height);
    if (color.alphaGL > 0) {
      this.drawFillRect(camera.x, camera.y, camera.width, camera.height, getTintFromFloats(color.blueGL, color.greenGL, color.redGL, 1), color.alphaGL);
    }
  }

  private postRenderCamera(camera: Camera): void {
    const flash = camera.flashEffect;
    const fade = camera.fadeEffect;
    if (flash.isRunning || fade.isRunning || fade.isComplete) {
      if (flash.isRunning) {
        this.drawFillRect(camera.x, camera.y, camera.width, camera.height, getTintFromFloats(flash.blue / 255, flash.green / 255, flash.red / 255, 1), flash.alpha);
      }
      if (fade.isRunning || fade.isComplete) {
        this.drawFillRect(camera.x, camera.y, camera.width, camera.height, getTintFromFloats(fade.blue / 255, fade.green / 255, fade.red / 255, 1), fade.alpha);
      }
    }
    camera.dirty = false;
    this.popScissor();
    camera.emit('postrender', camera);
  }

  public postRender(): void {
    if (this.contextLost) return;
    if (this.pendingClear) {
      // Nada se desenhou neste quadro: apaga o que o anterior deixou, ou não faz nada se ele já estava vazio.
      this.pendingClear = false;
      if (this.drewLastFrame) {
        this.clearNow();
        this.drewLastFrame = false;
      }
      return;
    }
    this.flush();
  }

  // ── O lote ──

  private setTexture2D(texture: GLTexture | null | undefined): void {
    const tex = texture ?? this.whiteTexture;
    if (tex !== this.currentTexture) {
      if (this.vertexCount > 0) this.flush();
      this.currentTexture = tex;
    }
  }

  public flush(): this {
    if (this.vertexCount === 0) return this;
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    if (this.vertexCount === VERTEX_CAPACITY) gl.bufferData(gl.ARRAY_BUFFER, this.vertexData, gl.DYNAMIC_DRAW);
    else gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.bytes.subarray(0, this.vertexCount * VERTEX_SIZE));
    const tex = this.currentTexture;
    if (tex && tex.webGLTexture) {
      gl.activeTexture(gl.TEXTURE0);
      if (this.boundTexture !== tex) {
        gl.bindTexture(gl.TEXTURE_2D, tex.webGLTexture);
        this.boundTexture = tex;
      }
      gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount);
    }
    this.vertexCount = 0;
    return this;
  }

  public batchQuad(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number,
    u0: number, v0: number, u1: number, v1: number, tintTL: number, tintTR: number, tintBL: number, tintBR: number,
    tintEffect: number | boolean, texture?: GLTexture | null): boolean {
    if (this.pendingClear) this.ensureCleared();
    let hasFlushed = false;
    if (this.vertexCount + 6 > VERTEX_CAPACITY) {
      this.flush();
      hasFlushed = true;
    }
    this.setTexture2D(texture);
    const f32 = this.vertexViewF32;
    const u32 = this.vertexViewU32;
    const effect = +tintEffect;
    let o = (this.vertexCount * VERTEX_COMPONENTS) - 1;
    f32[++o] = x0; f32[++o] = y0; f32[++o] = u0; f32[++o] = v0; f32[++o] = 0; f32[++o] = effect; u32[++o] = tintTL;
    f32[++o] = x1; f32[++o] = y1; f32[++o] = u0; f32[++o] = v1; f32[++o] = 0; f32[++o] = effect; u32[++o] = tintBL;
    f32[++o] = x2; f32[++o] = y2; f32[++o] = u1; f32[++o] = v1; f32[++o] = 0; f32[++o] = effect; u32[++o] = tintBR;
    f32[++o] = x0; f32[++o] = y0; f32[++o] = u0; f32[++o] = v0; f32[++o] = 0; f32[++o] = effect; u32[++o] = tintTL;
    f32[++o] = x2; f32[++o] = y2; f32[++o] = u1; f32[++o] = v1; f32[++o] = 0; f32[++o] = effect; u32[++o] = tintBR;
    f32[++o] = x3; f32[++o] = y3; f32[++o] = u1; f32[++o] = v0; f32[++o] = 0; f32[++o] = effect; u32[++o] = tintTR;
    this.vertexCount += 6;
    return hasFlushed;
  }

  public batchTri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number,
    u0: number, v0: number, u1: number, v1: number, tintTL: number, tintTR: number, tintBL: number,
    tintEffect: number | boolean, texture?: GLTexture | null): boolean {
    if (this.pendingClear) this.ensureCleared();
    let hasFlushed = false;
    if (this.vertexCount + 3 > VERTEX_CAPACITY) {
      this.flush();
      hasFlushed = true;
    }
    this.setTexture2D(texture);
    const f32 = this.vertexViewF32;
    const u32 = this.vertexViewU32;
    const effect = +tintEffect;
    let o = (this.vertexCount * VERTEX_COMPONENTS) - 1;
    f32[++o] = x0; f32[++o] = y0; f32[++o] = u0; f32[++o] = v0; f32[++o] = 0; f32[++o] = effect; u32[++o] = tintTL;
    f32[++o] = x1; f32[++o] = y1; f32[++o] = u0; f32[++o] = v1; f32[++o] = 0; f32[++o] = effect; u32[++o] = tintTR;
    f32[++o] = x2; f32[++o] = y2; f32[++o] = u1; f32[++o] = v1; f32[++o] = 0; f32[++o] = effect; u32[++o] = tintBL;
    this.vertexCount += 3;
    return hasFlushed;
  }

  /** Um retângulo de cor da câmera (fundo, clarão, escurecer) — o drawFillRect, com a textura branca. */
  public drawFillRect(x: number, y: number, width: number, height: number, color: number, alpha: number): void {
    x = Math.floor(x);
    y = Math.floor(y);
    const xw = Math.floor(x + width);
    const yh = Math.floor(y + height);
    const tint = getTintAppendFloatAlphaAndSwap(color, alpha);
    this.batchQuad(x, y, x, yh, xw, yh, xw, y, 0, 1, 1, 0, tint, tint, tint, tint, 0, this.whiteTexture);
  }

  /** Image/Sprite (o batchSprite). */
  public batchSprite(gameObject: GameObject & SpriteLike, camera: Camera, parentTransformMatrix?: TransformMatrix): void {
    const camMatrix = this._tempMatrix1;
    const spriteMatrix = this._tempMatrix2;
    const calcMatrix = this._tempMatrix3;
    const frame = gameObject.frame;
    const texture = frame.glTexture;
    const u0 = frame.u0;
    const v0 = frame.v0;
    const u1 = frame.u1;
    const v1 = frame.v1;
    const frameX = frame.x;
    const frameY = frame.y;
    const frameWidth = frame.cutWidth;
    const frameHeight = frame.cutHeight;
    const customPivot = frame.customPivot;
    const displayOriginX = gameObject.displayOriginX;
    const displayOriginY = gameObject.displayOriginY;
    let x = -displayOriginX + frameX;
    let y = -displayOriginY + frameY;
    let flipX = 1;
    let flipY = 1;
    if (gameObject.flipX) {
      if (!customPivot) x += (-frame.realWidth + (displayOriginX * 2));
      flipX = -1;
    }
    if (gameObject.flipY) {
      if (!customPivot) y += (-frame.realHeight + (displayOriginY * 2));
      flipY = -1;
    }
    let gx = gameObject.x;
    let gy = gameObject.y;
    if (camera.roundPixels) {
      gx = Math.floor(gx);
      gy = Math.floor(gy);
    }
    spriteMatrix.applyITRS(gx, gy, gameObject.rotation, gameObject.scaleX * flipX, gameObject.scaleY * flipY);
    camMatrix.copyFrom(camera.matrix);
    if (parentTransformMatrix) {
      camMatrix.multiplyWithOffset(parentTransformMatrix, -camera.scrollX * gameObject.scrollFactorX, -camera.scrollY * gameObject.scrollFactorY);
      spriteMatrix.e = gx;
      spriteMatrix.f = gy;
    } else {
      spriteMatrix.e -= camera.scrollX * gameObject.scrollFactorX;
      spriteMatrix.f -= camera.scrollY * gameObject.scrollFactorY;
    }
    camMatrix.multiply(spriteMatrix, calcMatrix);
    const quad = calcMatrix.setQuad(x, y, x + frameWidth, y + frameHeight, camera.renderRoundPixels);
    const cameraAlpha = camera.alpha;
    const tintTL = getTintAppendFloatAlpha(gameObject.tintTopLeft, cameraAlpha * gameObject._alphaTL);
    const tintTR = getTintAppendFloatAlpha(gameObject.tintTopRight, cameraAlpha * gameObject._alphaTR);
    const tintBL = getTintAppendFloatAlpha(gameObject.tintBottomLeft, cameraAlpha * gameObject._alphaBL);
    const tintBR = getTintAppendFloatAlpha(gameObject.tintBottomRight, cameraAlpha * gameObject._alphaBR);
    if (this.vertexCount + 6 > VERTEX_CAPACITY) this.flush();
    this.batchQuad(quad[0], quad[1], quad[2], quad[3], quad[4], quad[5], quad[6], quad[7], u0, v0, u1, v1, tintTL, tintTR, tintBL, tintBR, gameObject.tintFill, texture);
  }

  /** Textura avulsa (o batchTexture — o texto passa por aqui). */
  public batchTexture(gameObject: GameObject, texture: GLTexture | null, textureWidth: number, textureHeight: number,
    srcX: number, srcY: number, srcWidth: number, srcHeight: number, scaleX: number, scaleY: number, rotation: number,
    flipX: boolean, flipY: boolean, scrollFactorX: number, scrollFactorY: number, displayOriginX: number, displayOriginY: number,
    frameX: number, frameY: number, frameWidth: number, frameHeight: number,
    tintTL: number, tintTR: number, tintBL: number, tintBR: number, tintEffect: number | boolean,
    uOffset: number, vOffset: number, camera: Camera, parentTransformMatrix?: TransformMatrix): void {
    const camMatrix = this._tempMatrix1;
    const spriteMatrix = this._tempMatrix2;
    const calcMatrix = this._tempMatrix3;
    const u0 = (frameX / textureWidth) + uOffset;
    const v0 = (frameY / textureHeight) + vOffset;
    const u1 = (frameX + frameWidth) / textureWidth + uOffset;
    const v1 = (frameY + frameHeight) / textureHeight + vOffset;
    let width = srcWidth;
    let height = srcHeight;
    let x = -displayOriginX;
    let y = -displayOriginY;
    if (flipX) {
      width *= -1;
      x += srcWidth;
    }
    if (flipY) {
      height *= -1;
      y += srcHeight;
    }
    if (camera.roundPixels) {
      srcX = Math.floor(srcX);
      srcY = Math.floor(srcY);
    }
    spriteMatrix.applyITRS(srcX, srcY, rotation, scaleX, scaleY);
    camMatrix.copyFrom(camera.matrix);
    if (parentTransformMatrix) {
      camMatrix.multiplyWithOffset(parentTransformMatrix, -camera.scrollX * scrollFactorX, -camera.scrollY * scrollFactorY);
      spriteMatrix.e = srcX;
      spriteMatrix.f = srcY;
    } else {
      spriteMatrix.e -= camera.scrollX * scrollFactorX;
      spriteMatrix.f -= camera.scrollY * scrollFactorY;
    }
    camMatrix.multiply(spriteMatrix, calcMatrix);
    const quad = calcMatrix.setQuad(x, y, x + width, y + height, camera.renderRoundPixels);
    void gameObject;
    this.batchQuad(quad[0], quad[1], quad[2], quad[3], quad[4], quad[5], quad[6], quad[7], u0, v0, u1, v1, tintTL, tintTR, tintBL, tintBR, tintEffect, texture);
  }

  // ── Formas (o que o Graphics e os Shapes pedem) ──

  public batchFillRect(x: number, y: number, width: number, height: number, currentMatrix?: TransformMatrix, parentMatrix?: TransformMatrix): void {
    const calcMatrix = this.calcMatrix;
    if (parentMatrix && currentMatrix) parentMatrix.multiply(currentMatrix, calcMatrix);
    const quad = calcMatrix.setQuad(x, y, x + width, y + height);
    const tint = this.fillTint;
    this.batchQuad(quad[0], quad[1], quad[2], quad[3], quad[4], quad[5], quad[6], quad[7], 0, 0, 1, 1, tint.TL, tint.TR, tint.BL, tint.BR, 2);
  }

  public batchFillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, currentMatrix?: TransformMatrix, parentMatrix?: TransformMatrix): void {
    const calcMatrix = this.calcMatrix;
    if (parentMatrix && currentMatrix) parentMatrix.multiply(currentMatrix, calcMatrix);
    const tx0 = calcMatrix.getX(x0, y0);
    const ty0 = calcMatrix.getY(x0, y0);
    const tx1 = calcMatrix.getX(x1, y1);
    const ty1 = calcMatrix.getY(x1, y1);
    const tx2 = calcMatrix.getX(x2, y2);
    const ty2 = calcMatrix.getY(x2, y2);
    const tint = this.fillTint;
    this.batchTri(tx0, ty0, tx1, ty1, tx2, ty2, 0, 0, 1, 1, tint.TL, tint.TR, tint.BL, 2);
  }

  public batchStrokePath(path: Array<{ x: number; y: number; width: number }>, lineWidth: number, pathOpen: boolean, currentMatrix?: TransformMatrix, parentMatrix?: TransformMatrix): void {
    this.prevQuad[4] = 0;
    this.firstQuad[4] = 0;
    const pathLength = path.length - 1;
    for (let pathIndex = 0; pathIndex < pathLength; pathIndex++) {
      const point0 = path[pathIndex];
      const point1 = path[pathIndex + 1];
      this.batchLine(point0.x, point0.y, point1.x, point1.y, point0.width / 2, point1.width / 2, lineWidth, pathIndex,
        !pathOpen && (pathIndex === pathLength - 1), currentMatrix, parentMatrix);
    }
  }

  public batchLine(ax: number, ay: number, bx: number, by: number, aLineWidth: number, bLineWidth: number, lineWidth: number,
    index: number, closePath: boolean, currentMatrix?: TransformMatrix, parentMatrix?: TransformMatrix): void {
    const calcMatrix = this.calcMatrix;
    if (parentMatrix && currentMatrix) parentMatrix.multiply(currentMatrix, calcMatrix);
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;
    const al0 = aLineWidth * (by - ay) / len;
    const al1 = aLineWidth * (ax - bx) / len;
    const bl0 = bLineWidth * (by - ay) / len;
    const bl1 = bLineWidth * (ax - bx) / len;
    const lx0 = bx - bl0;
    const ly0 = by - bl1;
    const lx1 = ax - al0;
    const ly1 = ay - al1;
    const lx2 = bx + bl0;
    const ly2 = by + bl1;
    const lx3 = ax + al0;
    const ly3 = ay + al1;
    const brX = calcMatrix.getX(lx0, ly0);
    const brY = calcMatrix.getY(lx0, ly0);
    const blX = calcMatrix.getX(lx1, ly1);
    const blY = calcMatrix.getY(lx1, ly1);
    const trX = calcMatrix.getX(lx2, ly2);
    const trY = calcMatrix.getY(lx2, ly2);
    const tlX = calcMatrix.getX(lx3, ly3);
    const tlY = calcMatrix.getY(lx3, ly3);
    const tint = this.strokeTint;
    this.batchQuad(tlX, tlY, blX, blY, brX, brY, trX, trY, 0, 0, 1, 1, tint.TL, tint.TR, tint.BL, tint.BR, 2);
    if (lineWidth <= 2) return;
    const prev = this.prevQuad;
    const first = this.firstQuad;
    if (index > 0 && prev[4]) {
      this.batchQuad(tlX, tlY, blX, blY, prev[0], prev[1], prev[2], prev[3], 0, 0, 1, 1, tint.TL, tint.TR, tint.BL, tint.BR, 2);
    } else {
      first[0] = tlX;
      first[1] = tlY;
      first[2] = blX;
      first[3] = blY;
      first[4] = 1;
    }
    if (closePath && first[4]) {
      this.batchQuad(brX, brY, trX, trY, first[0], first[1], first[2], first[3], 0, 0, 1, 1, tint.TL, tint.TR, tint.BL, tint.BR, 2);
    } else {
      prev[0] = brX;
      prev[1] = brY;
      prev[2] = trX;
      prev[3] = trY;
      prev[4] = 1;
    }
  }

  public destroy(): void {
    this.flush();
    for (const texture of this.textures) {
      if (texture.webGLTexture) this.gl.deleteTexture(texture.webGLTexture);
    }
    this.textures.clear();
  }
}

/** O que o batchSprite lê de uma Image/Sprite. */
export interface SpriteLike {
  frame: Frame;
  displayOriginX: number;
  displayOriginY: number;
  flipX: boolean;
  flipY: boolean;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  scrollFactorX: number;
  scrollFactorY: number;
  tintTopLeft: number;
  tintTopRight: number;
  tintBottomLeft: number;
  tintBottomRight: number;
  tintFill: boolean;
  _alphaTL: number;
  _alphaTR: number;
  _alphaBL: number;
  _alphaBR: number;
}

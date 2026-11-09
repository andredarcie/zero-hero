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
import { BlendModes, ScaleEvents } from './constants';
import { TransformMatrix } from './matrix';

import type { Game } from './game';
import type { Camera } from './camera';
import type { Scene } from './scene';
import type { GameObject } from './gameobjects/GameObject';

import { RendererTextures, type GLTexture } from './rendererTextures';
import { SpriteBatch, VERTEX_CAPACITY } from './spriteBatch';
import { CameraPass } from './cameraPass';
import { QuadProgram, VERTEX_SIZE } from './quadProgram';
export { getTintAppendFloatAlpha } from './spriteBatch';
export type { SpriteLike } from './spriteBatch';
export type { GLTexture } from './rendererTextures';

export interface Tint { TL: number; TR: number; BL: number; BR: number }

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
  public readonly program: WebGLProgram;
  private readonly vertexBuffer: WebGLBuffer;
  private readonly vertexData = new ArrayBuffer(VERTEX_CAPACITY * VERTEX_SIZE);
  public readonly vertexViewF32 = new Float32Array(this.vertexData);
  public readonly vertexViewU32 = new Uint32Array(this.vertexData);
  private readonly bytes = new Uint8Array(this.vertexData);
  public vertexCount = 0;
  public currentTexture: GLTexture | null = null;
  public readonly uProjection: WebGLUniformLocation | null;
  public readonly _tempMatrix1 = new TransformMatrix();
  public readonly _tempMatrix2 = new TransformMatrix();
  public readonly _tempMatrix3 = new TransformMatrix();
  public readonly prevQuad = new Float32Array(5);
  public readonly firstQuad = new Float32Array(5);
  private readonly defaultScissor = [0, 0, 0, 0];
  public currentScissor: number[] | undefined = this.defaultScissor;
  public readonly scissorStack: number[][] = [];
  public readonly textures = new Set<GLTexture>();

  public constructor(public readonly game: Game) {
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

    this.program = this.quadProgram.createProgram();
    gl.useProgram(this.program);
    this.uProjection = gl.getUniformLocation(this.program, 'uProjectionMatrix');
    gl.uniform1i(gl.getUniformLocation(this.program, 'uMainSampler'), 0);
    this.vertexBuffer = gl.createBuffer() as WebGLBuffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertexData, gl.DYNAMIC_DRAW);
    this.quadProgram.bindAttributes();
    this.setBlendMode(BlendModes.NORMAL);
    game.textures.once('ready', this.boot, this);
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
    this.quadProgram.setProjectionMatrix(width, height);
    gl.viewport(0, 0, width, height);
    this.drawingBufferHeight = gl.drawingBufferHeight;
    gl.scissor(0, (gl.drawingBufferHeight - height), width, height);
    this.defaultScissor[2] = width;
    this.defaultScissor[3] = height;
    return this;
  }

  // ── Texturas ──

  public boundTexture: GLTexture | null = null;

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

  // ── O quadro ──

  /**
   * A LIMPEZA PREGUIÇOSA. O motor de antes limpava o canvas inteiro a cada quadro, desenhasse algo ou não. Aqui a limpeza
   * (a mesma: a tela toda, com a cor de fundo da config) só acontece antes do primeiro desenho do quadro — ou no fim
   * dele, se o quadro anterior tinha desenhado alguma coisa. Quadro vazio depois de quadro vazio não toca no WebGL, e
   * o navegador segue mostrando a mesma tela transparente: os pixels são os mesmos, sem limpar e reapresentar o
   * canvas por cima do mundo 3D a cada quadro em que a interface 2D não tem nada na tela.
   */
  public pendingClear = false;
  private drewLastFrame = true;
  /** As texturas na GPU (ver RendererTextures). */
  public readonly glTextures: RendererTextures = new RendererTextures(this);
  /** O lote de quads e triângulos (ver SpriteBatch). */
  public readonly batch: SpriteBatch = new SpriteBatch(this);
  /** O recorte e o fundo de cada câmera. (ver CameraPass) */
  private readonly cameraPass = new CameraPass(this);
  /** O shader de quads e a projeção. (ver QuadProgram) */
  private readonly quadProgram = new QuadProgram(this);

  private clearNow(): void {
    const gl = this.gl;
    const clearColor = this.game.config.backgroundColor;
    // A tesoura no começo do quadro é sempre a tela toda: limpar sem ela é a mesma limpeza.
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(clearColor.redGL, clearColor.greenGL, clearColor.blueGL, clearColor.alphaGL);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    gl.enable(gl.SCISSOR_TEST);
  }

  public ensureCleared(): void {
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
    this.cameraPass.preRenderCamera(camera);
    if (childCount === 0) {
      this.setBlendMode(BlendModes.NORMAL);
      this.cameraPass.postRenderCamera(camera);
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
    this.cameraPass.postRenderCamera(camera);
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

  public setTexture2D(texture: GLTexture | null | undefined): void {
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

  // ── Formas (o que o Graphics e os Shapes pedem) ──

  public destroy(): void {
    this.flush();
    for (const texture of this.textures) {
      if (texture.webGLTexture) this.gl.deleteTexture(texture.webGLTexture);
    }
    this.textures.clear();
  }
}


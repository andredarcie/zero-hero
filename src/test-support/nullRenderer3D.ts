/**
 * O RENDERIZADOR 3D DOS TESTES: a porta `createRenderer3D` da plataforma (platform.ts) sem GPU. Ele tem a parte da
 * API do `THREE.WebGLRenderer` que o mundo 3D e os passes de pós-processamento usam — tamanho, alvo de desenho, cor
 * de fundo, `render`, `compile`, `info` — e não desenha nada: o mundo monta a cena inteira (terreno, objetos, luzes,
 * materiais), anda a câmera e "desenha" no vazio.
 *
 * `render` conta quantas vezes foi chamado e guarda a última cena, para um teste poder cobrar que o quadro chegou à
 * GPU. Um membro que o mundo pedir e que não esteja aqui vira função vazia e fica anotado em `missing`.
 */
import * as THREE from 'three';

export class NullRenderer3D {
  public readonly domElement: HTMLCanvasElement;
  public autoClear = true;
  public autoClearColor = true;
  public autoClearDepth = true;
  public autoClearStencil = true;
  public toneMapping: THREE.ToneMapping = THREE.NoToneMapping;
  public toneMappingExposure = 1;
  public outputColorSpace: THREE.ColorSpace = THREE.SRGBColorSpace;
  public sortObjects = true;
  public localClippingEnabled = false;
  public readonly shadowMap = { enabled: false, autoUpdate: true, needsUpdate: false, type: THREE.PCFShadowMap };
  public readonly info = {
    autoReset: true,
    memory: { geometries: 0, textures: 0 },
    render: { frame: 0, calls: 0, triangles: 0, points: 0, lines: 0 },
    programs: [] as unknown[],
    reset(): void { this.render.calls = 0; this.render.triangles = 0; this.render.points = 0; this.render.lines = 0; },
  };
  public readonly capabilities = { isWebGL2: true, maxTextureSize: 4096, maxSamples: 4, precision: 'highp', getMaxAnisotropy: (): number => 1 };
  public readonly extensions = { has: (): boolean => false, get: (): null => null, init: (): void => undefined };
  public readonly state = {
    buffers: {
      color: { setMask: (): void => undefined, setLocked: (): void => undefined, setClear: (): void => undefined },
      depth: { setTest: (): void => undefined, setMask: (): void => undefined, setLocked: (): void => undefined },
      stencil: { setTest: (): void => undefined, setMask: (): void => undefined, setFunc: (): void => undefined, setOp: (): void => undefined, setLocked: (): void => undefined, setClear: (): void => undefined },
    },
    reset: (): void => undefined,
  };
  public readonly xr = { enabled: false, isPresenting: false };
  public readonly properties = { get: (): Record<string, unknown> => ({}) };
  public readonly missing = new Set<string>();
  public renders = 0;
  public lastScene: THREE.Object3D | null = null;
  private width = 300;
  private height = 150;
  private pixelRatio = 1;
  private target: THREE.WebGLRenderTarget | null = null;
  private readonly clearColor = new THREE.Color(0x000000);
  private clearAlpha = 1;

  public constructor(canvas: HTMLCanvasElement) {
    this.domElement = canvas;
  }

  public getContext(): null { return null; }
  public getPixelRatio(): number { return this.pixelRatio; }
  public setPixelRatio(value: number): void { this.pixelRatio = value; }
  public getSize(target: THREE.Vector2): THREE.Vector2 { return target.set(this.width, this.height); }
  public setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.domElement.width = Math.floor(width * this.pixelRatio);
    this.domElement.height = Math.floor(height * this.pixelRatio);
  }
  public getDrawingBufferSize(target: THREE.Vector2): THREE.Vector2 { return target.set(this.width * this.pixelRatio, this.height * this.pixelRatio); }
  public setViewport(): void { /* nada a desenhar */ }
  public setScissor(): void { /* nada a desenhar */ }
  public setScissorTest(): void { /* nada a desenhar */ }
  public getRenderTarget(): THREE.WebGLRenderTarget | null { return this.target; }
  public setRenderTarget(target: THREE.WebGLRenderTarget | null): void { this.target = target; }
  public getClearColor(target: THREE.Color): THREE.Color { return target.copy(this.clearColor); }
  public setClearColor(color: THREE.ColorRepresentation, alpha = 1): void {
    this.clearColor.set(color);
    this.clearAlpha = alpha;
  }
  public getClearAlpha(): number { return this.clearAlpha; }
  public setClearAlpha(alpha: number): void { this.clearAlpha = alpha; }
  public clear(): void { /* nada a desenhar */ }
  public clearColorBuffer(): void { /* nada a desenhar */ }
  public clearDepth(): void { /* nada a desenhar */ }
  public render(scene: THREE.Object3D): void {
    this.renders++;
    this.lastScene = scene;
    this.info.render.frame++;
  }
  public compile(): Set<THREE.Material> { return new Set(); }
  public compileAsync(): Promise<THREE.Object3D> { return Promise.resolve(new THREE.Object3D()); }
  public initTexture(): void { /* nada a subir */ }
  public copyFramebufferToTexture(): void { /* nada a copiar */ }
  public readRenderTargetPixels(): void { /* nada a ler */ }
  public dispose(): void { /* nada a soltar */ }
}

/** Um renderizador nulo atrás de um Proxy que anota (e responde vazio a) o que a classe não tem. */
export const createNullRenderer3D = (canvas: HTMLCanvasElement): THREE.WebGLRenderer => {
  const real = new NullRenderer3D(canvas);
  const proxy = new Proxy(real, {
    get(target, prop, receiver) {
      if (prop in target || typeof prop === 'symbol') return Reflect.get(target, prop, receiver);
      target.missing.add(String(prop));
      return () => undefined;
    },
  });
  return proxy as unknown as THREE.WebGLRenderer;
};

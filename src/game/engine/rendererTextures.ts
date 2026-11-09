// AS TEXTURAS NA GPU: subir uma imagem ou um canvas (alfa pré-multiplicado, NEAREST, REPEAT com mipmap só em lado
// potência de dois), atualizar um canvas, trocar o filtro, apagar. Licenças em LICENSES.md.

import { FilterMode } from './constants';
import { isSizePowerOfTwo } from './textures';
import type { Renderer } from './renderer';

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

export class RendererTextures {
  public constructor(private readonly host: Renderer) {}

  private processTexture(texture: GLTexture): void {
    const gl = this.host.gl;
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
    this.host.boundTexture = null;
  }

  private createTexture2D(pixels: TexImageSource | null, width: number, height: number, minFilter: number, magFilter: number, wrap: number, pma = true, flipY = false): GLTexture {
    const texture: GLTexture = {
      webGLTexture: this.host.gl.createTexture(),
      width, height, minFilter, magFilter, wrapS: wrap, wrapT: wrap, pma, flipY, pixels,
    };
    this.host.textures.add(texture);
    this.processTexture(texture);
    return texture;
  }

  /** Imagem carregada (o createTextureFromSource): NEAREST, REPEAT se o lado for potência de dois. */
  public createTextureFromSource(source: TexImageSource, width: number, height: number): GLTexture {
    const gl = this.host.gl;
    const pow = isSizePowerOfTwo(width, height);
    const filter = this.host.game.config.antialias ? gl.LINEAR : gl.NEAREST;
    return this.createTexture2D(source, width, height, filter, filter, pow ? gl.REPEAT : gl.CLAMP_TO_EDGE);
  }

  /** Canvas (o canvasToTexture): NEAREST, REPEAT se potência de dois e não `noRepeat`, alfa pré-multiplicado. */
  public canvasToTexture(srcCanvas: HTMLCanvasElement, dstTexture: GLTexture | null, noRepeat = false, flipY = false): GLTexture {
    const gl = this.host.gl;
    const width = srcCanvas.width;
    const height = srcCanvas.height;
    const pow = isSizePowerOfTwo(width, height);
    const wrapping = (!noRepeat && pow) ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    const filter = this.host.game.config.antialias ? gl.LINEAR : gl.NEAREST;
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

  public setTextureFilter(texture: GLTexture, filter: number): Renderer {
    const gl = this.host.gl;
    const glFilter = filter === FilterMode.LINEAR ? gl.LINEAR : gl.NEAREST;
    gl.activeTexture(gl.TEXTURE0);
    const currentTexture = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
    gl.bindTexture(gl.TEXTURE_2D, texture.webGLTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, glFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, glFilter);
    texture.minFilter = glFilter;
    texture.magFilter = glFilter;
    if (currentTexture) gl.bindTexture(gl.TEXTURE_2D, currentTexture);
    this.host.boundTexture = null;
    return this.host;
  }

  public deleteTexture(texture: GLTexture | null): Renderer {
    if (!texture) return this.host;
    if (this.host.currentTexture === texture) this.host.flush();
    this.host.textures.delete(texture);
    if (texture.webGLTexture) this.host.gl.deleteTexture(texture.webGLTexture);
    texture.webGLTexture = null;
    texture.pixels = null;
    return this.host;
  }
}

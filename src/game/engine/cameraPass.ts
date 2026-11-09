// UMA CÂMERA NO QUADRO: o recorte (scissor) da janela dela, o fundo, e o fade e o flash por cima ao terminar. A pilha
// de recortes vale para câmeras dentro de câmeras. Licenças em LICENSES.md.

import type { Camera } from './camera';
import type { Renderer } from './renderer';

const getTintFromFloats = (r: number, g: number, b: number, a: number): number => {
  const ur = ((r * 255) | 0) & 0xff;
  const ug = ((g * 255) | 0) & 0xff;
  const ub = ((b * 255) | 0) & 0xff;
  const ua = ((a * 255) | 0) & 0xff;
  return ((ua << 24) | (ur << 16) | (ug << 8) | ub) >>> 0;
};

/** O que CameraPass usa de Renderer. */
export type CameraPassHost = Pick<Renderer,
  'batch' | 'currentScissor' | 'drawingBufferHeight' | 'flush' | 'gl' | 'scissorStack'
>;

export class CameraPass {
  public constructor(private readonly host: CameraPassHost) {}

  public pushScissor(x: number, y: number, width: number, height: number): number[] {
    const scissor = [x, y, width, height];
    this.host.scissorStack.push(scissor);
    this.setScissor(x, y, width, height);
    this.host.currentScissor = scissor;
    return scissor;
  }

  public popScissor(): void {
    this.host.scissorStack.pop();
    const scissor = this.host.scissorStack[this.host.scissorStack.length - 1];
    if (scissor) this.setScissor(scissor[0], scissor[1], scissor[2], scissor[3]);
    this.host.currentScissor = scissor;
  }

  private setScissor(x: number, y: number, width: number, height: number): void {
    const current = this.host.currentScissor;
    let set = width > 0 && height > 0;
    if (current && set) set = current[0] !== x || current[1] !== y || current[2] !== width || current[3] !== height;
    if (set) {
      this.host.flush();
      this.host.gl.scissor(x, (this.host.drawingBufferHeight - y - height), width, height);
    }
  }

  public preRenderCamera(camera: Camera): void {
    const color = camera.backgroundColor;
    camera.emit('prerender', camera);
    this.pushScissor(camera.x, camera.y, camera.width, camera.height);
    if (color.alphaGL > 0) {
      this.host.batch.drawFillRect(camera.x, camera.y, camera.width, camera.height, getTintFromFloats(color.blueGL, color.greenGL, color.redGL, 1), color.alphaGL);
    }
  }

  public postRenderCamera(camera: Camera): void {
    const flash = camera.flashEffect;
    const fade = camera.fadeEffect;
    if (flash.isRunning || fade.isRunning || fade.isComplete) {
      if (flash.isRunning) {
        this.host.batch.drawFillRect(camera.x, camera.y, camera.width, camera.height, getTintFromFloats(flash.blue / 255, flash.green / 255, flash.red / 255, 1), flash.alpha);
      }
      if (fade.isRunning || fade.isComplete) {
        this.host.batch.drawFillRect(camera.x, camera.y, camera.width, camera.height, getTintFromFloats(fade.blue / 255, fade.green / 255, fade.red / 255, 1), fade.alpha);
      }
    }
    camera.dirty = false;
    this.popScissor();
    camera.emit('postrender', camera);
  }
}

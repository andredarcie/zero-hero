// O GRAPHICS NO CANVAS 2D (o GraphicsCanvasRenderer): a fila de comandos desenhada num contexto 2D — é o caminho do
// generateTexture. Licenças em LICENSES.md.

import { GameObject } from './GameObject';
import { TransformMatrix } from '../matrix';
import { Camera } from '../camera';
import type { Graphics } from './Graphics';

export const Commands = {
  ARC: 0,
  BEGIN_PATH: 1,
  CLOSE_PATH: 2,
  FILL_RECT: 3,
  LINE_TO: 4,
  MOVE_TO: 5,
  LINE_STYLE: 6,
  FILL_STYLE: 7,
  FILL_PATH: 8,
  STROKE_PATH: 9,
  FILL_TRIANGLE: 10,
  STROKE_TRIANGLE: 11,
  SAVE: 14,
  RESTORE: 15,
  TRANSLATE: 16,
  SCALE: 17,
  ROTATE: 18,
  GRADIENT_FILL_STYLE: 21,
  GRADIENT_LINE_STYLE: 22,
} as const;
/** A matriz de cálculo (GetCalcMatrix): câmera × objeto, descontando a rolagem. */
const tempCam = new TransformMatrix();
const tempSprite = new TransformMatrix();
const tempCalc = new TransformMatrix();
export const getCalcMatrix = (src: GameObject, camera: Camera, parentMatrix?: TransformMatrix): TransformMatrix => {
  tempSprite.applyITRS(src.x, src.y, src.rotation, src.scaleX, src.scaleY);
  tempCam.copyFrom(camera.matrix);
  if (parentMatrix) {
    tempCam.multiplyWithOffset(parentMatrix, -camera.scrollX * src.scrollFactorX, -camera.scrollY * src.scrollFactorY);
    tempSprite.e = src.x;
    tempSprite.f = src.y;
  } else {
    tempSprite.e -= camera.scrollX * src.scrollFactorX;
    tempSprite.f -= camera.scrollY * src.scrollFactorY;
  }
  tempCam.multiply(tempSprite, tempCalc);
  return tempCalc;
};

export class GraphicsCanvasRender {
  public constructor(private readonly host: Graphics) {}

  public renderCanvas(ctx: CanvasRenderingContext2D, camera: Camera): void {
    const commandBuffer = this.host.commandBuffer;
    const commandBufferLength = commandBuffer.length;
    if (commandBufferLength === 0) return;
    // O SetTransform do caminho de canvas: alfa, composição e a matriz câmera × objeto.
    const alpha = camera.alpha * this.host.alpha;
    if (alpha <= 0) return;
    const calcMatrix = getCalcMatrix(this.host, camera);
    ctx.globalAlpha = alpha;
    ctx.save();
    calcMatrix.setToContext(ctx);
    ctx.imageSmoothingEnabled = false;
    camera.addToRenderList(this.host);
    ctx.beginPath();
    for (let index = 0; index < commandBufferLength; ++index) {
      const commandID = commandBuffer[index];
      switch (commandID) {
        case Commands.ARC:
          ctx.arc(commandBuffer[index + 1], commandBuffer[index + 2], commandBuffer[index + 3], commandBuffer[index + 4], commandBuffer[index + 5], Boolean(commandBuffer[index + 6]));
          index += 7;
          break;
        case Commands.LINE_STYLE: {
          const lineColor = commandBuffer[index + 2];
          const red = (lineColor & 0xFF0000) >>> 16;
          const green = (lineColor & 0xFF00) >>> 8;
          const blue = lineColor & 0xFF;
          ctx.strokeStyle = `rgba(${red},${green},${blue},${commandBuffer[index + 3]})`;
          ctx.lineWidth = commandBuffer[index + 1];
          index += 3;
          break;
        }
        case Commands.FILL_STYLE: {
          const fillColor = commandBuffer[index + 1];
          const red = (fillColor & 0xFF0000) >>> 16;
          const green = (fillColor & 0xFF00) >>> 8;
          const blue = fillColor & 0xFF;
          ctx.fillStyle = `rgba(${red},${green},${blue},${commandBuffer[index + 2]})`;
          index += 2;
          break;
        }
        case Commands.BEGIN_PATH:
          ctx.beginPath();
          break;
        case Commands.CLOSE_PATH:
          ctx.closePath();
          break;
        case Commands.FILL_PATH:
          ctx.fill();
          break;
        case Commands.STROKE_PATH:
          ctx.stroke();
          break;
        case Commands.FILL_RECT:
          ctx.fillRect(commandBuffer[index + 1], commandBuffer[index + 2], commandBuffer[index + 3], commandBuffer[index + 4]);
          index += 4;
          break;
        case Commands.FILL_TRIANGLE:
          ctx.beginPath();
          ctx.moveTo(commandBuffer[index + 1], commandBuffer[index + 2]);
          ctx.lineTo(commandBuffer[index + 3], commandBuffer[index + 4]);
          ctx.lineTo(commandBuffer[index + 5], commandBuffer[index + 6]);
          ctx.closePath();
          ctx.fill();
          index += 6;
          break;
        case Commands.STROKE_TRIANGLE:
          ctx.beginPath();
          ctx.moveTo(commandBuffer[index + 1], commandBuffer[index + 2]);
          ctx.lineTo(commandBuffer[index + 3], commandBuffer[index + 4]);
          ctx.lineTo(commandBuffer[index + 5], commandBuffer[index + 6]);
          ctx.closePath();
          ctx.stroke();
          index += 6;
          break;
        case Commands.LINE_TO:
          ctx.lineTo(commandBuffer[index + 1], commandBuffer[index + 2]);
          index += 2;
          break;
        case Commands.MOVE_TO:
          ctx.moveTo(commandBuffer[index + 1], commandBuffer[index + 2]);
          index += 2;
          break;
        case Commands.SAVE:
          ctx.save();
          break;
        case Commands.RESTORE:
          ctx.restore();
          break;
        case Commands.TRANSLATE:
          ctx.translate(commandBuffer[index + 1], commandBuffer[index + 2]);
          index += 2;
          break;
        case Commands.SCALE:
          ctx.scale(commandBuffer[index + 1], commandBuffer[index + 2]);
          index += 2;
          break;
        case Commands.ROTATE:
          ctx.rotate(commandBuffer[index + 1]);
          index += 1;
          break;
        case Commands.GRADIENT_FILL_STYLE:
          // (sic) o caminho de canvas pula só 5 dos 8 argumentos
          index += 5;
          break;
        case Commands.GRADIENT_LINE_STYLE:
          index += 6;
          break;
        default:
          break;
      }
    }
    ctx.restore();
  }
}

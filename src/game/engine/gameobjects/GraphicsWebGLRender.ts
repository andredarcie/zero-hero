// O GRAPHICS NA GPU (o GraphicsWebGLRenderer): a fila de comandos virando triângulos no lote do Renderer, com a
// matriz da câmera e a do pai. Licenças em LICENSES.md.

import { TransformMatrix } from '../matrix';
import { getTintAppendFloatAlpha } from '../renderer';
import { Camera } from '../camera';
import type { Renderer } from '../renderer';
import { Commands, getCalcMatrix } from './GraphicsCanvasRender';
import type { Graphics } from './Graphics';

type Point = { x: number; y: number; width: number };
const currentMatrixTemp = new TransformMatrix();

export class GraphicsWebGLRender {
  public constructor(private readonly host: Graphics) {}

  public drawWebGL(renderer: Renderer, _src: Graphics, camera: Camera, parentMatrix?: TransformMatrix): void {
    const commands = this.host.commandBuffer;
    if (commands.length === 0) return;
    camera.addToRenderList(this.host);
    const calcMatrix = getCalcMatrix(this.host, camera, parentMatrix);
    const currentMatrix = currentMatrixTemp.loadIdentity();
    const alpha = camera.alpha * this.host.alpha;
    let lineWidth = 1;
    const fillTint = renderer.fillTint;
    const strokeTint = renderer.strokeTint;
    const PI2 = Math.PI * 2;
    const iterStep = 0.01;
    const path: Array<{ points: Point[] }> = [];
    let pathOpen = true;
    let lastPath: { points: Point[] } | null = null;
    const newPath = (x: number, y: number, width: number): { points: Point[] } => ({ points: [{ x, y, width }] });
    for (let cmdIndex = 0; cmdIndex < commands.length; cmdIndex++) {
      const cmd = commands[cmdIndex];
      switch (cmd) {
        case Commands.BEGIN_PATH:
          path.length = 0;
          lastPath = null;
          pathOpen = true;
          break;
        case Commands.CLOSE_PATH:
          pathOpen = false;
          if (lastPath && lastPath.points.length) lastPath.points.push(lastPath.points[0]);
          break;
        case Commands.FILL_PATH:
          // Nenhuma tela do jogo preenche caminho livre; isso pediria triangular (earcut).
          break;
        case Commands.STROKE_PATH:
          for (let pathIndex = 0; pathIndex < path.length; pathIndex++) {
            renderer.batch.batchStrokePath(path[pathIndex].points, lineWidth, pathOpen, currentMatrix, calcMatrix);
          }
          break;
        case Commands.LINE_STYLE: {
          lineWidth = commands[++cmdIndex];
          const strokeColor = commands[++cmdIndex];
          const strokeAlpha = commands[++cmdIndex] * alpha;
          const strokeTintColor = getTintAppendFloatAlpha(strokeColor, strokeAlpha);
          strokeTint.TL = strokeTintColor;
          strokeTint.TR = strokeTintColor;
          strokeTint.BL = strokeTintColor;
          strokeTint.BR = strokeTintColor;
          break;
        }
        case Commands.FILL_STYLE: {
          const fillColor = commands[++cmdIndex];
          const fillAlpha = commands[++cmdIndex] * alpha;
          const fillTintColor = getTintAppendFloatAlpha(fillColor, fillAlpha);
          fillTint.TL = fillTintColor;
          fillTint.TR = fillTintColor;
          fillTint.BL = fillTintColor;
          fillTint.BR = fillTintColor;
          break;
        }
        case Commands.GRADIENT_FILL_STYLE: {
          const alphaTL = commands[++cmdIndex] * alpha;
          const alphaTR = commands[++cmdIndex] * alpha;
          const alphaBL = commands[++cmdIndex] * alpha;
          const alphaBR = commands[++cmdIndex] * alpha;
          fillTint.TL = getTintAppendFloatAlpha(commands[++cmdIndex], alphaTL);
          fillTint.TR = getTintAppendFloatAlpha(commands[++cmdIndex], alphaTR);
          fillTint.BL = getTintAppendFloatAlpha(commands[++cmdIndex], alphaBL);
          fillTint.BR = getTintAppendFloatAlpha(commands[++cmdIndex], alphaBR);
          break;
        }
        case Commands.GRADIENT_LINE_STYLE: {
          lineWidth = commands[++cmdIndex];
          const gradientLineAlpha = commands[++cmdIndex] * alpha;
          strokeTint.TL = getTintAppendFloatAlpha(commands[++cmdIndex], gradientLineAlpha);
          strokeTint.TR = getTintAppendFloatAlpha(commands[++cmdIndex], gradientLineAlpha);
          strokeTint.BL = getTintAppendFloatAlpha(commands[++cmdIndex], gradientLineAlpha);
          strokeTint.BR = getTintAppendFloatAlpha(commands[++cmdIndex], gradientLineAlpha);
          break;
        }
        case Commands.ARC: {
          let iteration = 0;
          const x = commands[++cmdIndex];
          const y = commands[++cmdIndex];
          const radius = commands[++cmdIndex];
          const startAngle = commands[++cmdIndex];
          let endAngle = commands[++cmdIndex];
          const anticlockwise = commands[++cmdIndex];
          const overshoot = commands[++cmdIndex];
          endAngle -= startAngle;
          if (anticlockwise) {
            if (endAngle < -PI2) endAngle = -PI2;
            else if (endAngle > 0) endAngle = -PI2 + endAngle % PI2;
          } else if (endAngle > PI2) {
            endAngle = PI2;
          } else if (endAngle < 0) {
            endAngle = PI2 + endAngle % PI2;
          }
          if (lastPath === null) {
            lastPath = newPath(x + Math.cos(startAngle) * radius, y + Math.sin(startAngle) * radius, lineWidth);
            path.push(lastPath);
            iteration += iterStep;
          }
          while (iteration < 1 + overshoot) {
            const ta = endAngle * iteration + startAngle;
            lastPath.points.push({ x: x + Math.cos(ta) * radius, y: y + Math.sin(ta) * radius, width: lineWidth });
            iteration += iterStep;
          }
          const ta = endAngle + startAngle;
          lastPath.points.push({ x: x + Math.cos(ta) * radius, y: y + Math.sin(ta) * radius, width: lineWidth });
          break;
        }
        case Commands.FILL_RECT:
          renderer.batch.batchFillRect(commands[++cmdIndex], commands[++cmdIndex], commands[++cmdIndex], commands[++cmdIndex], currentMatrix, calcMatrix);
          break;
        case Commands.FILL_TRIANGLE:
          renderer.batch.batchFillTriangle(commands[++cmdIndex], commands[++cmdIndex], commands[++cmdIndex], commands[++cmdIndex], commands[++cmdIndex], commands[++cmdIndex], currentMatrix, calcMatrix);
          break;
        case Commands.STROKE_TRIANGLE: {
          const x0 = commands[++cmdIndex];
          const y0 = commands[++cmdIndex];
          const x1 = commands[++cmdIndex];
          const y1 = commands[++cmdIndex];
          const x2 = commands[++cmdIndex];
          const y2 = commands[++cmdIndex];
          renderer.batch.batchStrokePath([
            { x: x0, y: y0, width: lineWidth }, { x: x1, y: y1, width: lineWidth },
            { x: x2, y: y2, width: lineWidth }, { x: x0, y: y0, width: lineWidth },
          ], lineWidth, false, currentMatrix, calcMatrix);
          break;
        }
        case Commands.LINE_TO:
          if (lastPath !== null) {
            lastPath.points.push({ x: commands[++cmdIndex], y: commands[++cmdIndex], width: lineWidth });
          } else {
            lastPath = newPath(commands[++cmdIndex], commands[++cmdIndex], lineWidth);
            path.push(lastPath);
          }
          break;
        case Commands.MOVE_TO:
          lastPath = newPath(commands[++cmdIndex], commands[++cmdIndex], lineWidth);
          path.push(lastPath);
          break;
        case Commands.TRANSLATE:
          currentMatrix.translate(commands[++cmdIndex], commands[++cmdIndex]);
          break;
        case Commands.SCALE:
          currentMatrix.scale(commands[++cmdIndex], commands[++cmdIndex]);
          break;
        case Commands.ROTATE:
          currentMatrix.rotate(commands[++cmdIndex]);
          break;
        default:
          break;
      }
    }
  }
}

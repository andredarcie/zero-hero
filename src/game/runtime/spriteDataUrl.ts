import type * as Engine from '@/game/engine';
import { createCanvas } from '@/game/platform/platform';

const urlCache = new Map<string, string>();

/**
 * Um frame do motor 2D como data URL, ampliado com NEAREST (o jeito pixel-art). Serve para
 * qualquer textura carregada OU gerada em runtime (o balde e o carvao sao desenhados no boot),
 * porque as duas terminam como imagem/canvas dentro do TextureManager.
 */
export const spriteDataUrl = (
  scene: Engine.Scene,
  key: string,
  frame: number,
  scale = 4,
): string => {
  const id = `${key}:${frame}:${scale}`;
  const cached = urlCache.get(id);
  if (cached) return cached;

  const texture = scene.textures.get(key);
  const f = texture.get(frame);
  const canvas = createCanvas();
  canvas.width = Math.max(1, f.cutWidth * scale);
  canvas.height = Math.max(1, f.cutHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    f.source.image as CanvasImageSource,
    f.cutX, f.cutY, f.cutWidth, f.cutHeight,
    0, 0, canvas.width, canvas.height,
  );
  const url = canvas.toDataURL();
  urlCache.set(id, url);
  return url;
};

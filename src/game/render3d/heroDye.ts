import type * as Engine from '@/game/engine';

import { ASSET_KEYS } from '@/game/constants';
import { createCanvas } from '@/game/platform/platform';
import { replaceTextureImage, textureImage } from '@/game/render3d/textures3d';
import { CAPE_GREENS, clothRamp, swapPalette, type ClothDye } from '@/game/runtime/homeState';

/**
 * A CAPA TINGIDA DO HERÓI (runtime/homeState). A folha do herói (`hero.png`) tem o pano em três verdes; tingir é trocar
 * esses três pela rampa da tinta, na folha INTEIRA, e pôr a folha nova no lugar da velha sob a mesma chave — assim o
 * herói andando, sentado, dormindo, o reflexo na água e o contorno atrás das árvores mudam juntos, sem um quadro
 * redesenhado. O mundo 3D troca a imagem da chave `hero`; o 2D (a cerimônia de item novo) ganha uma folha com chave
 * própria por cor, e `heroSheet2D` diz qual usar.
 */

/** A folha original, guardada antes da primeira troca: toda tinta parte dela, nunca de uma capa já tingida. */
let original: HTMLCanvasElement | null = null;
let current: ClothDye = 'natural';

const sheetOf = (dye: ClothDye): HTMLCanvasElement | null => {
  if (!original) {
    const image = textureImage(ASSET_KEYS.hero);
    if (!image?.width || !image.height) return null;
    const copy = createCanvas();
    copy.width = image.width;
    copy.height = image.height;
    copy.getContext('2d')?.drawImage(image, 0, 0);
    original = copy;
  }
  const out = createCanvas();
  out.width = original.width;
  out.height = original.height;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  const src = original.getContext('2d', { willReadFrequently: true });
  if (!ctx || !src) return null;
  const pixels = src.getImageData(0, 0, original.width, original.height);
  const image = ctx.createImageData(original.width, original.height);
  image.data.set(swapPalette(pixels.data, CAPE_GREENS, clothRamp(dye)));
  ctx.putImageData(image, 0, 0);
  return out;
};

const key2D = (dye: ClothDye): string => (dye === 'natural' ? ASSET_KEYS.hero : `hero-cape-${dye}`);

/** Veste a capa nesta cor (o mundo 3D na hora; a folha 2D, se a cena for dada). Repetir a cor atual não faz nada. */
export const applyHeroCape = (dye: ClothDye, scene?: Engine.Scene): void => {
  if (dye !== current || !original) {
    const sheet = sheetOf(dye);
    if (!sheet) return;
    replaceTextureImage(ASSET_KEYS.hero, sheet);
    current = dye;
  }
  if (scene && dye !== 'natural' && !scene.textures.exists(key2D(dye))) {
    const sheet = sheetOf(dye);
    if (sheet) scene.textures.addSpriteSheet(key2D(dye), sheet as unknown as HTMLImageElement, { frameWidth: 16, frameHeight: 16 });
  }
};

/** A cor que o herói está vestindo agora (a janela do teste e do playtest). */
export const heroCape = (): ClothDye => current;

/** A folha 2D do herói com a capa de agora (a cerimônia de item novo desenha o herói com ela). */
export const heroSheet2D = (scene: Engine.Scene): string => {
  const key = key2D(current);
  return scene.textures.exists(key) ? key : ASSET_KEYS.hero;
};

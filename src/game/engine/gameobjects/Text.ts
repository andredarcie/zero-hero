/**
 * O TEXTO: escrito num canvas próprio com o mesmo estilo (fonte, cor, contorno, sombra, alinhamento,
 * quebra de linha, espaçamento, margem e resolução), medido pelas mesmas contas (o `testString`, a altura
 * da linha = ascendente + descendente + contorno, larguras arredondadas para cima, posição da linha arredondada) e
 * subido como textura sem repetição. A chave da textura é um UUID sorteado — e isso gasta sempre os mesmos
 * 31 `Math.random()`, o que mantém o resto do jogo na mesma sequência de sorteios.
 * Parte do motor próprio (src/game/engine); licenças em LICENSES.md.
 */
import { QuadGameObject } from './GameObject';
import { createPoolCanvas, type CanvasTexture, type Frame } from '../textures';
import { getTintAppendFloatAlpha } from '../renderer';
import type { Scene } from '../scene';
import type { Camera } from '../camera';
import type { Renderer } from '../renderer';
import type { TransformMatrix } from '../matrix';
import { TextLayout, type TextMetrics } from './TextLayout';
export type { TextMetrics } from './TextLayout';

/** O UUID da textura (31 sorteios). */
export const UUID = (): string => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
  const r = Math.random() * 16 | 0;
  const v = c === 'x' ? r : (r & 0x3 | 0x8);
  return v.toString(16);
});

export interface TextStyleConfig {
  fontFamily?: string;
  fontSize?: string | number;
  fontStyle?: string;
  backgroundColor?: string | null;
  color?: string;
  fill?: string;
  stroke?: string;
  strokeThickness?: number;
  shadow?: { offsetX?: number; offsetY?: number; color?: string; blur?: number; stroke?: boolean; fill?: boolean };
  align?: string;
  maxLines?: number;
  fixedWidth?: number;
  fixedHeight?: number;
  resolution?: number;
  rtl?: boolean;
  testString?: string;
  baselineX?: number;
  baselineY?: number;
  wordWrap?: { width?: number | null; callback?: ((text: string, obj: Text) => string | string[]) | null; callbackScope?: unknown; useAdvancedWrap?: boolean };
  padding?: number | { x?: number; y?: number; left?: number; right?: number; top?: number; bottom?: number };
  lineSpacing?: number;
  letterSpacing?: number;
  font?: string;
  metrics?: { ascent?: number; descent?: number; fontSize?: number };
}

// O testString tem os bytes de "É" lidos como Latin-1 ("Ã‰"); é ELE que define a altura medida.
const TEST_STRING = '|MÃ‰qgy';

const getPath = (source: unknown, key: string): { found: boolean; value: unknown } => {
  let parent: unknown = source;
  for (const part of key.split('.')) {
    if (parent && typeof parent === 'object' && Object.prototype.hasOwnProperty.call(parent, part)) {
      parent = (parent as Record<string, unknown>)[part];
    } else {
      return { found: false, value: undefined };
    }
  }
  return { found: true, value: parent };
};

const getValue = <V>(source: unknown, key: string, def: V): V => {
  if (!source || typeof source === 'number') return def;
  const r = getPath(source, key);
  return r.found ? (r.value as V) : def;
};

/** O GetAdvancedValue para estilo (só número/texto/booleano/função chegam aqui). */
const getAdvancedValue = <V>(source: unknown, key: string, def: V): V => {
  const value = getValue<unknown>(source, key, null);
  if (value === null) return def;
  if (typeof value === 'function') return (value as (k: string) => V)(key);
  return value as V;
};

const PROPERTY_MAP: Array<[keyof TextStyle, string, unknown]> = [
  ['fontFamily', 'fontFamily', 'Courier'],
  ['fontSize', 'fontSize', '16px'],
  ['fontStyle', 'fontStyle', ''],
  ['backgroundColor', 'backgroundColor', null],
  ['color', 'color', '#fff'],
  ['stroke', 'stroke', '#fff'],
  ['strokeThickness', 'strokeThickness', 0],
  ['shadowOffsetX', 'shadow.offsetX', 0],
  ['shadowOffsetY', 'shadow.offsetY', 0],
  ['shadowColor', 'shadow.color', '#000'],
  ['shadowBlur', 'shadow.blur', 0],
  ['shadowStroke', 'shadow.stroke', false],
  ['shadowFill', 'shadow.fill', false],
  ['align', 'align', 'left'],
  ['maxLines', 'maxLines', 0],
  ['fixedWidth', 'fixedWidth', 0],
  ['fixedHeight', 'fixedHeight', 0],
  ['resolution', 'resolution', 0],
  ['rtl', 'rtl', false],
  ['testString', 'testString', TEST_STRING],
  ['baselineX', 'baselineX', 1.2],
  ['baselineY', 'baselineY', 1.4],
  ['wordWrapWidth', 'wordWrap.width', null],
  ['wordWrapCallback', 'wordWrap.callback', null],
  ['wordWrapCallbackScope', 'wordWrap.callbackScope', null],
  ['wordWrapUseAdvanced', 'wordWrap.useAdvancedWrap', false],
];

/** O MeasureText (o caminho moderno, com actualBoundingBox*; o de pixels fica para navegador antigo). */
const measureText = (style: TextStyle, antialias: boolean): TextMetrics => {
  const canvas = createPoolCanvas(style.parent.scene.sys.game.host, 1, 1, !antialias);
  const context = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  style.syncFont(canvas, context);
  const metrics = context.measureText(style.testString);
  if ('actualBoundingBoxAscent' in metrics) {
    const ascent = metrics.actualBoundingBoxAscent;
    const descent = metrics.actualBoundingBoxDescent;
    return { ascent, descent, fontSize: ascent + descent };
  }
  const width = Math.ceil((metrics as TextMetrics & { width: number }).width * style.baselineX);
  let baseline = width;
  const height = 2 * baseline;
  baseline = baseline * style.baselineY | 0;
  canvas.width = width;
  canvas.height = height;
  context.fillStyle = '#f00';
  context.fillRect(0, 0, width, height);
  context.font = style._font;
  context.textBaseline = 'alphabetic';
  context.fillStyle = '#000';
  context.fillText(style.testString, 0, baseline);
  const output = { ascent: 0, descent: 0, fontSize: 0 };
  const imagedata = context.getImageData(0, 0, width, height);
  const pixels = imagedata.data;
  const numPixels = pixels.length;
  const line = width * 4;
  let i: number;
  let idx = 0;
  let stop = false;
  for (i = 0; i < baseline; i++) {
    for (let j = 0; j < line; j += 4) {
      if (pixels[idx + j] !== 255) { stop = true; break; }
    }
    if (!stop) idx += line;
    else break;
  }
  output.ascent = baseline - i;
  idx = numPixels - line;
  stop = false;
  for (i = height; i > baseline; i--) {
    for (let j = 0; j < line; j += 4) {
      if (pixels[idx + j] !== 255) { stop = true; break; }
    }
    if (!stop) idx -= line;
    else break;
  }
  output.descent = i - baseline;
  output.fontSize = output.ascent + output.descent;
  return output;
};

export class TextStyle {
  public fontFamily = 'Courier';
  public fontSize = '16px';
  public fontStyle = '';
  public backgroundColor: string | null = null;
  public color = '#fff';
  public stroke = '#fff';
  public strokeThickness = 0;
  public shadowOffsetX = 0;
  public shadowOffsetY = 0;
  public shadowColor = '#000';
  public shadowBlur = 0;
  public shadowStroke = false;
  public shadowFill = false;
  public align = 'left';
  public maxLines = 0;
  public fixedWidth = 0;
  public fixedHeight = 0;
  public resolution = 0;
  public rtl = false;
  public testString = TEST_STRING;
  public baselineX = 1.2;
  public baselineY = 1.4;
  public wordWrapWidth: number | null = null;
  public wordWrapCallback: ((text: string, obj: Text) => string | string[]) | null = null;
  public wordWrapCallbackScope: unknown = null;
  public wordWrapUseAdvanced = false;
  public _font = '';
  public metrics!: TextMetrics;
  /** Sempre falso (lê `style.wordWrap`, que nunca existe no estilo). */
  public readonly wordWrap = undefined;

  public constructor(public readonly parent: Text, style?: TextStyleConfig) {
    this.setStyle(style, false, true);
  }

  public setStyle(style: TextStyleConfig | undefined, updateText = true, setDefaults = false): Text {
    const self = this as unknown as Record<string, unknown>;
    for (const [key, path, def] of PROPERTY_MAP) {
      const value = setDefaults ? def : self[key];
      if (key === 'wordWrapCallback' || key === 'wordWrapCallbackScope') {
        self[key] = getValue(style, path, value);
      } else if (style && key === 'fontSize' && typeof style.fontSize === 'number') {
        self[key] = `${style.fontSize.toString()}px`;
      } else {
        self[key] = getAdvancedValue(style, path, value);
      }
    }
    const font = getValue<string | null>(style, 'font', null);
    if (font !== null) this.setFont(font, false);
    this._font = [this.fontStyle, this.fontSize, this.fontFamily].join(' ').trim();
    const fill = getValue<string | null>(style, 'fill', null);
    if (fill !== null) this.color = fill;
    const metrics = getValue<TextStyleConfig['metrics'] | false>(style, 'metrics', false);
    if (metrics) {
      this.metrics = { ascent: metrics.ascent ?? 0, descent: metrics.descent ?? 0, fontSize: metrics.fontSize ?? 0 };
    } else if (updateText || !this.metrics) {
      this.metrics = measureText(this, this.parent.antialias);
    }
    if (updateText) return this.parent.updateText();
    return this.parent;
  }

  public syncFont(_canvas: HTMLCanvasElement, context: CanvasRenderingContext2D): void {
    context.font = this._font;
  }

  public syncStyle(_canvas: HTMLCanvasElement, context: CanvasRenderingContext2D): void {
    context.textBaseline = 'alphabetic';
    context.fillStyle = this.color;
    context.strokeStyle = this.stroke;
    context.lineWidth = this.strokeThickness;
    context.lineCap = 'round';
    context.lineJoin = 'round';
  }

  public syncShadow(context: CanvasRenderingContext2D, enabled: boolean): void {
    if (enabled) {
      context.shadowOffsetX = this.shadowOffsetX;
      context.shadowOffsetY = this.shadowOffsetY;
      context.shadowColor = this.shadowColor;
      context.shadowBlur = this.shadowBlur;
    } else {
      context.shadowOffsetX = 0;
      context.shadowOffsetY = 0;
      (context as unknown as { shadowColor: unknown }).shadowColor = 0;
      context.shadowBlur = 0;
    }
  }

  public update(recalculateMetrics: boolean): Text {
    if (recalculateMetrics) {
      this._font = [this.fontStyle, this.fontSize, this.fontFamily].join(' ').trim();
      this.metrics = measureText(this, this.parent.antialias);
    }
    return this.parent.updateText();
  }

  public setFont(font: string | { fontFamily?: string; fontSize?: string; fontStyle?: string }, updateText = true): Text {
    let fontFamily: string;
    let fontSize: string;
    let fontStyle: string;
    if (typeof font !== 'string') {
      fontFamily = font.fontFamily ?? 'Courier';
      fontSize = font.fontSize ?? '16px';
      fontStyle = font.fontStyle ?? '';
    } else {
      const fontSplit = font.split(' ');
      let i = 0;
      fontStyle = fontSplit.length > 2 ? fontSplit[i++] : '';
      fontSize = fontSplit[i++] || '16px';
      fontFamily = fontSplit[i++] || 'Courier';
    }
    if (fontFamily !== this.fontFamily || fontSize !== this.fontSize || fontStyle !== this.fontStyle) {
      this.fontFamily = fontFamily;
      this.fontSize = fontSize;
      this.fontStyle = fontStyle;
      if (updateText) this.update(true);
    }
    return this.parent;
  }

  public setFontFamily(family: string): Text {
    if (this.fontFamily !== family) {
      this.fontFamily = family;
      this.update(true);
    }
    return this.parent;
  }

  public setFontStyle(style: string): Text {
    if (this.fontStyle !== style) {
      this.fontStyle = style;
      this.update(true);
    }
    return this.parent;
  }

  public setFontSize(size: number | string): Text {
    if (typeof size === 'number') size = `${size.toString()}px`;
    if (this.fontSize !== size) {
      this.fontSize = size;
      this.update(true);
    }
    return this.parent;
  }

  public setFixedSize(width: number, height: number): Text {
    this.fixedWidth = width;
    this.fixedHeight = height;
    if (width) this.parent.width = width;
    if (height) this.parent.height = height;
    return this.update(false);
  }

  public setBackgroundColor(color: string | null): Text {
    this.backgroundColor = color;
    return this.update(false);
  }

  public setColor(color: string): Text {
    this.color = color;
    return this.update(false);
  }

  public setResolution(value: number): Text {
    this.resolution = value;
    return this.update(false);
  }

  public setStroke(color?: string, thickness: number = this.strokeThickness): Text {
    if (color === undefined && this.strokeThickness !== 0) {
      this.strokeThickness = 0;
      this.update(true);
    } else if (color !== undefined && (this.stroke !== color || this.strokeThickness !== thickness)) {
      this.stroke = color;
      this.strokeThickness = thickness;
      this.update(true);
    }
    return this.parent;
  }

  public setShadow(x = 0, y = 0, color = '#000', blur = 0, shadowStroke = false, shadowFill = true): Text {
    this.shadowOffsetX = x;
    this.shadowOffsetY = y;
    this.shadowColor = color;
    this.shadowBlur = blur;
    this.shadowStroke = shadowStroke;
    this.shadowFill = shadowFill;
    return this.update(false);
  }

  public setWordWrapWidth(width: number | null, useAdvancedWrap = false): Text {
    this.wordWrapWidth = width;
    this.wordWrapUseAdvanced = useAdvancedWrap;
    return this.update(false);
  }

  public setAlign(align = 'left'): Text {
    this.align = align;
    return this.update(false);
  }

  public setMaxLines(max = 0): Text {
    this.maxLines = max;
    return this.update(false);
  }

  public getTextMetrics(): TextMetrics {
    return { ascent: this.metrics.ascent, descent: this.metrics.descent, fontSize: this.metrics.fontSize };
  }
}

export class Text extends QuadGameObject {
  public readonly canvas: HTMLCanvasElement;
  public context: CanvasRenderingContext2D;
  public readonly style: TextStyle;
  public autoRound = true;
  public readonly splitRegExp = /(?:\r\n|\r|\n)/;
  private _text: string | undefined = undefined;
  public readonly padding = { left: 0, right: 0, top: 0, bottom: 0 };
  public lineSpacing = 0;
  public letterSpacing = 0;
  public readonly texture: CanvasTexture;
  public frame: Frame;
  private readonly _textureKey: string;
  public readonly antialias: boolean;
  private readonly renderer: Renderer | null;
  /** A quebra de linha e a medida. (ver TextLayout) */
  private readonly layout = new TextLayout(this);

  public constructor(scene: Scene, x = 0, y = 0, text: string | string[] = '', style?: TextStyleConfig) {
    super(scene, 'Text');
    this.renderer = scene.sys.renderer;
    this.antialias = scene.sys.game.config.antialias;
    this.setPosition(x, y);
    this.setOrigin(0, 0);
    this.canvas = createPoolCanvas(scene.sys.game.host, 1, 1, !this.antialias);
    this.style = new TextStyle(this, style);
    this.width = 1;
    this.height = 1;
    if (this.style.resolution === 0) this.style.resolution = 1;
    this._textureKey = UUID();
    this.texture = scene.sys.textures.addCanvas(this._textureKey, this.canvas) as CanvasTexture;
    this.context = this.texture.context;
    this.frame = this.texture.get();
    // O texto sobe a textura dele em `updateText` (sem repetição); a criada pelo `addCanvas` sai.
    this.renderer?.glTextures.deleteTexture(this.frame.source.glTexture);
    this.frame.source.glTexture = null;
    this.canvas.dir = 'ltr';
    this.context.direction = 'ltr';
    this.setText(text);
    if (style && style.padding) this.setPadding(style.padding);
    if (style && style.lineSpacing) this.setLineSpacing(style.lineSpacing);
    if (style && style.letterSpacing) this.setLetterSpacing(style.letterSpacing);
  }

  // ── ComputedSize ──
  public get displayWidth(): number { return this.scaleX * this.width; }
  public set displayWidth(value: number) { this.scaleX = value / this.width; }
  public get displayHeight(): number { return this.scaleY * this.height; }
  public set displayHeight(value: number) { this.scaleY = value / this.height; }

  public setSize(width: number, height: number): this {
    this.width = width;
    this.height = height;
    return this;
  }

  public setDisplaySize(width: number, height: number): this {
    this.displayWidth = width;
    this.displayHeight = height;
    return this;
  }

  public get text(): string { return this._text ?? ''; }
  public set text(value: string) { this.setText(value); }

  public getWrappedText(text: string = this._text ?? ''): string[] {
    this.style.syncFont(this.canvas, this.context);
    return this.layout.runWordWrap(text).split(this.splitRegExp);
  }

  public setText(value: string | number | string[] | null | undefined): this {
    if (!value && value !== 0) value = '';
    if (Array.isArray(value)) value = value.join('\n');
    if (value !== this._text) {
      this._text = value.toString();
      this.updateText();
    }
    return this;
  }

  public setStyle(style: TextStyleConfig): Text { return this.style.setStyle(style); }
  public setFont(font: string): Text { return this.style.setFont(font); }
  public setFontFamily(family: string): Text { return this.style.setFontFamily(family); }
  public setFontSize(size: number | string): Text { return this.style.setFontSize(size); }
  public setFontStyle(style: string): Text { return this.style.setFontStyle(style); }
  public setColor(color: string): Text { return this.style.setColor(color); }
  public setFill(color: string): Text { return this.style.setColor(color); }
  public setStroke(color?: string, thickness?: number): Text { return this.style.setStroke(color, thickness); }
  public setShadow(x?: number, y?: number, color?: string, blur?: number, shadowStroke?: boolean, shadowFill?: boolean): Text {
    return this.style.setShadow(x, y, color, blur, shadowStroke, shadowFill);
  }
  public setResolution(value: number): Text { return this.style.setResolution(value); }
  public setWordWrapWidth(width: number | null, useAdvancedWrap?: boolean): Text { return this.style.setWordWrapWidth(width, useAdvancedWrap); }
  public setAlign(align?: string): Text { return this.style.setAlign(align); }
  public setFixedSize(width: number, height: number): Text { return this.style.setFixedSize(width, height); }
  public setBackgroundColor(color: string | null): Text { return this.style.setBackgroundColor(color); }
  public setMaxLines(max?: number): Text { return this.style.setMaxLines(max); }

  public setPadding(left: number | { x?: number; y?: number; left?: number; right?: number; top?: number; bottom?: number } = 0, top?: number, right?: number, bottom?: number): this {
    let l: number;
    let t: number;
    let r: number;
    let b: number;
    if (typeof left === 'object') {
      const config = left;
      if (config.x !== undefined && config.x !== null) {
        l = config.x;
        r = config.x;
      } else {
        l = config.left ?? 0;
        r = config.right ?? l;
      }
      if (config.y !== undefined && config.y !== null) {
        t = config.y;
        b = config.y;
      } else {
        t = config.top ?? 0;
        b = config.bottom ?? t;
      }
    } else {
      l = left;
      t = top ?? l;
      r = right ?? l;
      b = bottom ?? t;
    }
    this.padding.left = l;
    this.padding.top = t;
    this.padding.right = r;
    this.padding.bottom = b;
    return this.updateText();
  }

  public setLineSpacing(value: number): this {
    this.lineSpacing = value;
    return this.updateText();
  }

  public setLetterSpacing(value: number): this {
    this.letterSpacing = value;
    return this.updateText();
  }

  public updateText(): this {
    const canvas = this.canvas;
    const context = this.context;
    const style = this.style;
    const resolution = style.resolution;
    const size = style.metrics;
    style.syncFont(canvas, context);
    let outputText = this._text ?? '';
    if (style.wordWrapWidth || style.wordWrapCallback) outputText = this.layout.runWordWrap(outputText);
    const lines = outputText.split(this.splitRegExp);
    const textSize = this.layout.getTextSize(size, lines);
    const padding = this.padding;
    let textWidth: number;
    if (style.fixedWidth === 0) {
      this.width = textSize.width + padding.left + padding.right;
      textWidth = textSize.width;
    } else {
      this.width = style.fixedWidth;
      textWidth = this.width - padding.left - padding.right;
      if (textWidth < textSize.width) textWidth = textSize.width;
    }
    if (style.fixedHeight === 0) this.height = textSize.height + padding.top + padding.bottom;
    else this.height = style.fixedHeight;
    let w = this.width;
    let h = this.height;
    this.updateDisplayOrigin();
    w *= resolution;
    h *= resolution;
    w = Math.max(w, 1);
    h = Math.max(h, 1);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      this.frame.setSize(w, h);
      style.syncFont(canvas, context);
    } else {
      context.clearRect(0, 0, w, h);
    }
    context.save();
    context.scale(resolution, resolution);
    if (style.backgroundColor) {
      context.fillStyle = style.backgroundColor;
      context.fillRect(0, 0, w, h);
    }
    style.syncStyle(canvas, context);
    context.translate(padding.left, padding.top);
    for (let i = 0; i < textSize.lines; i++) {
      let linePositionX = style.strokeThickness / 2;
      let linePositionY = (style.strokeThickness / 2 + i * textSize.lineHeight) + size.ascent;
      if (i > 0) linePositionY += textSize.lineSpacing * i;
      if (style.align === 'right') {
        linePositionX += textWidth - textSize.lineWidths[i];
      } else if (style.align === 'center') {
        linePositionX += (textWidth - textSize.lineWidths[i]) / 2;
      } else if (style.align === 'justify') {
        const minimumLengthToApplyJustification = 0.85;
        if (textSize.lineWidths[i] / textSize.width >= minimumLengthToApplyJustification) {
          let extraSpace = textSize.width - textSize.lineWidths[i];
          const spaceSize = context.measureText(' ').width;
          const trimmedLine = lines[i].trim();
          const array = trimmedLine.split(' ');
          extraSpace += (lines[i].length - trimmedLine.length) * spaceSize;
          let extraSpaceCharacters = Math.floor(extraSpace / spaceSize);
          let idx = 0;
          while (extraSpaceCharacters > 0) {
            array[idx] += ' ';
            idx = (idx + 1) % (array.length - 1 || 1);
            --extraSpaceCharacters;
          }
          lines[i] = array.join(' ');
        }
      }
      if (this.autoRound) {
        linePositionX = Math.round(linePositionX);
        linePositionY = Math.round(linePositionY);
      }
      const letterSpacing = this.letterSpacing;
      if (style.strokeThickness && letterSpacing === 0) {
        style.syncShadow(context, style.shadowStroke);
        context.strokeText(lines[i], linePositionX, linePositionY);
      }
      if (style.color) {
        style.syncShadow(context, style.shadowFill);
        if (letterSpacing !== 0) {
          let charPositionX = 0;
          const line = lines[i].split('');
          for (let l = 0; l < line.length; l++) {
            if (style.strokeThickness) {
              style.syncShadow(context, style.shadowStroke);
              context.strokeText(line[l], linePositionX + charPositionX, linePositionY);
              style.syncShadow(context, style.shadowFill);
            }
            context.fillText(line[l], linePositionX + charPositionX, linePositionY);
            charPositionX += context.measureText(line[l]).width + letterSpacing;
          }
        } else {
          context.fillText(lines[i], linePositionX, linePositionY);
        }
      }
    }
    context.restore();
    if (this.renderer) this.frame.source.glTexture = this.renderer.glTextures.canvasToTexture(canvas, this.frame.source.glTexture, true);
    const input = this.input;
    if (input && !input.customHitArea && input.hitArea) {
      input.hitArea.width = this.width;
      input.hitArea.height = this.height;
    }
    return this;
  }

  public getTextMetrics(): TextMetrics {
    return this.style.getTextMetrics();
  }

  protected override preDestroy(): void {
    this.texture.destroy();
  }

  public override renderWebGL(renderer: Renderer, _src: Text, camera: Camera, parentMatrix?: TransformMatrix): void {
    if (this.width === 0 || this.height === 0) return;
    camera.addToRenderList(this);
    const frame = this.frame;
    const width = frame.width;
    const height = frame.height;
    const res = this.style.resolution;
    renderer.batch.batchTexture(
      this, frame.glTexture, width, height, this.x, this.y, width / res, height / res, this.scaleX, this.scaleY, this.rotation,
      this.flipX, this.flipY, this.scrollFactorX, this.scrollFactorY, this.displayOriginX, this.displayOriginY,
      0, 0, width, height,
      getTintAppendFloatAlpha(this.tintTopLeft, camera.alpha * this._alphaTL),
      getTintAppendFloatAlpha(this.tintTopRight, camera.alpha * this._alphaTR),
      getTintAppendFloatAlpha(this.tintBottomLeft, camera.alpha * this._alphaBL),
      getTintAppendFloatAlpha(this.tintBottomRight, camera.alpha * this._alphaBR),
      this.tintFill, 0, 0, camera, parentMatrix,
    );
  }
}

/**
 * AS CORES (`Engine.Display.Color` e as conversões que o jogo usa), com as mesmas contas: o canal vira inteiro por
 * `floor`, a versão GL guarda a fração, e a interpolação é linear canal a canal.
 * Parte do motor próprio (src/game/engine); licenças em LICENSES.md.
 */
import { Linear } from './math';

export const GetColor = (red: number, green: number, blue: number): number => (red << 16) | (green << 8) | blue;

export const GetColor32 = (red: number, green: number, blue: number, alpha: number): number =>
  (alpha << 24) | (red << 16) | (green << 8) | blue;

export class Color {
  public r = 0;
  public g = 0;
  public b = 0;
  public a = 255;
  public readonly gl: [number, number, number, number] = [0, 0, 0, 1];
  private _color = 0;
  private _color32 = 0;
  private _rgba = '';
  private _locked = false;

  public constructor(red = 0, green = 0, blue = 0, alpha = 255) {
    this.setTo(red, green, blue, alpha);
  }

  public setTo(red: number, green: number, blue: number, alpha = 255): this {
    this._locked = true;
    this.red = red;
    this.green = green;
    this.blue = blue;
    this.alpha = alpha;
    this._locked = false;
    return this.update();
  }

  public setGLTo(red: number, green: number, blue: number, alpha = 1): this {
    this._locked = true;
    this.redGL = red;
    this.greenGL = green;
    this.blueGL = blue;
    this.alphaGL = alpha;
    this._locked = false;
    return this.update();
  }

  public update(): this {
    if (this._locked) return this;
    const { r, g, b, a } = this;
    this._color = GetColor(r, g, b);
    this._color32 = GetColor32(r, g, b, a);
    this._rgba = `rgba(${r},${g},${b},${a / 255})`;
    return this;
  }

  public get color(): number { return this._color; }
  public get color32(): number { return this._color32; }
  public get rgba(): string { return this._rgba; }

  public get red(): number { return this.r; }
  public set red(value: number) {
    value = Math.floor(Math.abs(value));
    this.r = Math.min(value, 255);
    this.gl[0] = value / 255;
    this.update();
  }

  public get green(): number { return this.g; }
  public set green(value: number) {
    value = Math.floor(Math.abs(value));
    this.g = Math.min(value, 255);
    this.gl[1] = value / 255;
    this.update();
  }

  public get blue(): number { return this.b; }
  public set blue(value: number) {
    value = Math.floor(Math.abs(value));
    this.b = Math.min(value, 255);
    this.gl[2] = value / 255;
    this.update();
  }

  public get alpha(): number { return this.a; }
  public set alpha(value: number) {
    value = Math.floor(Math.abs(value));
    this.a = Math.min(value, 255);
    this.gl[3] = value / 255;
    this.update();
  }

  public get redGL(): number { return this.gl[0]; }
  public set redGL(value: number) {
    this.gl[0] = Math.min(Math.abs(value), 1);
    this.r = Math.floor(this.gl[0] * 255);
    this.update();
  }

  public get greenGL(): number { return this.gl[1]; }
  public set greenGL(value: number) {
    this.gl[1] = Math.min(Math.abs(value), 1);
    this.g = Math.floor(this.gl[1] * 255);
    this.update();
  }

  public get blueGL(): number { return this.gl[2]; }
  public set blueGL(value: number) {
    this.gl[2] = Math.min(Math.abs(value), 1);
    this.b = Math.floor(this.gl[2] * 255);
    this.update();
  }

  public get alphaGL(): number { return this.gl[3]; }
  public set alphaGL(value: number) {
    this.gl[3] = Math.min(Math.abs(value), 1);
    this.a = Math.floor(this.gl[3] * 255);
    this.update();
  }

  // As estáticas que o jogo chama como `Engine.Display.Color.X`.
  public static GetColor = GetColor;
  public static GetColor32 = GetColor32;
  public static HexStringToColor = (hex: string): Color => HexStringToColor(hex);
  public static ValueToColor = (input: string | number | Color): Color => ValueToColor(input);
  public static Interpolate = {
    RGBWithRGB: (r1: number, g1: number, b1: number, r2: number, g2: number, b2: number, length = 100, index = 0) => RGBWithRGB(r1, g1, b1, r2, g2, b2, length, index),
    ColorWithColor: (c1: Color, c2: Color, length = 100, index = 0) => RGBWithRGB(c1.r, c1.g, c1.b, c2.r, c2.g, c2.b, length, index),
    ColorWithRGB: (c: Color, r: number, g: number, b: number, length = 100, index = 0) => RGBWithRGB(c.r, c.g, c.b, r, g, b, length, index),
  };
}

const RGBWithRGB = (r1: number, g1: number, b1: number, r2: number, g2: number, b2: number, length = 100, index = 0):
  { r: number; g: number; b: number; a: number; color: number } => {
  const t = index / length;
  const r = Linear(r1, r2, t);
  const g = Linear(g1, g2, t);
  const b = Linear(b1, b2, t);
  return { r, g, b, a: 255, color: GetColor(r, g, b) };
};

export const HexStringToColor = (hex: string): Color => {
  const color = new Color();
  hex = hex.replace(/^(?:#|0x)?([a-f\d])([a-f\d])([a-f\d])$/i, (_m, r, g, b) => r + r + g + g + b + b);
  const result = (/^(?:#|0x)?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i).exec(hex);
  if (result) color.setTo(parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16));
  return color;
};

export const RGBStringToColor = (rgb: string): Color => {
  const color = new Color();
  const result = (/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d+(?:\.\d+)?))?\s*\)$/).exec(rgb.toLowerCase());
  if (result) {
    const a = result[4] !== undefined ? parseFloat(result[4]) : 1;
    color.setTo(parseInt(result[1], 10), parseInt(result[2], 10), parseInt(result[3], 10), a * 255);
  }
  return color;
};

export const IntegerToColor = (input: number): Color => {
  if (input > 16777215) return new Color(input >> 16 & 0xFF, input >> 8 & 0xFF, input & 0xFF, input >>> 24);
  return new Color(input >> 16 & 0xFF, input >> 8 & 0xFF, input & 0xFF, 255);
};

export const ValueToColor = (input: string | number | Color | { r: number; g: number; b: number; a?: number }): Color => {
  if (typeof input === 'string') {
    return input.substr(0, 3).toLowerCase() === 'rgb' ? RGBStringToColor(input) : HexStringToColor(input);
  }
  if (typeof input === 'number') return IntegerToColor(input);
  return new Color(input.r, input.g, input.b, input.a ?? 255);
};

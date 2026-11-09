/**
 * A MATRIZ 2D (o TransformMatrix), guardada num Float32Array: cada conta intermediária que
 * passa pela matriz é arredondada para 32 bits, e é isso que decide em que pixel um sprite girado ou escalado cai.
 * Parte do motor próprio (src/game/engine); licenças em LICENSES.md.
 */
export class TransformMatrix {
  public readonly matrix: Float32Array;
  public readonly quad = new Float32Array(8);

  public constructor(a = 1, b = 0, c = 0, d = 1, tx = 0, ty = 0) {
    this.matrix = new Float32Array([a, b, c, d, tx, ty, 0, 0, 1]);
  }

  public get a(): number { return this.matrix[0]; }
  public set a(v: number) { this.matrix[0] = v; }
  public get b(): number { return this.matrix[1]; }
  public set b(v: number) { this.matrix[1] = v; }
  public get c(): number { return this.matrix[2]; }
  public set c(v: number) { this.matrix[2] = v; }
  public get d(): number { return this.matrix[3]; }
  public set d(v: number) { this.matrix[3] = v; }
  public get e(): number { return this.matrix[4]; }
  public set e(v: number) { this.matrix[4] = v; }
  public get f(): number { return this.matrix[5]; }
  public set f(v: number) { this.matrix[5] = v; }
  public get tx(): number { return this.matrix[4]; }
  public set tx(v: number) { this.matrix[4] = v; }
  public get ty(): number { return this.matrix[5]; }
  public set ty(v: number) { this.matrix[5] = v; }

  public loadIdentity(): this {
    const m = this.matrix;
    m[0] = 1; m[1] = 0; m[2] = 0; m[3] = 1; m[4] = 0; m[5] = 0;
    return this;
  }

  public translate(x: number, y: number): this {
    const m = this.matrix;
    m[4] = m[0] * x + m[2] * y + m[4];
    m[5] = m[1] * x + m[3] * y + m[5];
    return this;
  }

  public scale(x: number, y: number): this {
    const m = this.matrix;
    m[0] *= x;
    m[1] *= x;
    m[2] *= y;
    m[3] *= y;
    return this;
  }

  public rotate(angle: number): this {
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    const m = this.matrix;
    const a = m[0];
    const b = m[1];
    const c = m[2];
    const d = m[3];
    m[0] = a * cos + c * sin;
    m[1] = b * cos + d * sin;
    m[2] = a * -sin + c * cos;
    m[3] = b * -sin + d * cos;
    return this;
  }

  /** `out = this × rhs` (sem `out`, escreve em si mesma). */
  public multiply(rhs: TransformMatrix, out?: TransformMatrix): Float32Array {
    const m = this.matrix;
    const s = rhs.matrix;
    const localA = m[0];
    const localB = m[1];
    const localC = m[2];
    const localD = m[3];
    const localE = m[4];
    const localF = m[5];
    const sourceA = s[0];
    const sourceB = s[1];
    const sourceC = s[2];
    const sourceD = s[3];
    const sourceE = s[4];
    const sourceF = s[5];
    const dst = out === undefined ? m : out.matrix;
    dst[0] = (sourceA * localA) + (sourceB * localC);
    dst[1] = (sourceA * localB) + (sourceB * localD);
    dst[2] = (sourceC * localA) + (sourceD * localC);
    dst[3] = (sourceC * localB) + (sourceD * localD);
    dst[4] = (sourceE * localA) + (sourceF * localC) + localE;
    dst[5] = (sourceE * localB) + (sourceF * localD) + localF;
    return dst;
  }

  public multiplyWithOffset(src: TransformMatrix, offsetX: number, offsetY: number): this {
    const m = this.matrix;
    const o = src.matrix;
    const a0 = m[0];
    const b0 = m[1];
    const c0 = m[2];
    const d0 = m[3];
    const tx0 = m[4];
    const ty0 = m[5];
    const pse = offsetX * a0 + offsetY * c0 + tx0;
    const psf = offsetX * b0 + offsetY * d0 + ty0;
    const a1 = o[0];
    const b1 = o[1];
    const c1 = o[2];
    const d1 = o[3];
    const tx1 = o[4];
    const ty1 = o[5];
    m[0] = a1 * a0 + b1 * c0;
    m[1] = a1 * b0 + b1 * d0;
    m[2] = c1 * a0 + d1 * c0;
    m[3] = c1 * b0 + d1 * d0;
    m[4] = tx1 * a0 + ty1 * c0 + pse;
    m[5] = tx1 * b0 + ty1 * d0 + psf;
    return this;
  }

  public transform(a: number, b: number, c: number, d: number, tx: number, ty: number): this {
    const m = this.matrix;
    const a0 = m[0];
    const b0 = m[1];
    const c0 = m[2];
    const d0 = m[3];
    const tx0 = m[4];
    const ty0 = m[5];
    m[0] = a * a0 + b * c0;
    m[1] = a * b0 + b * d0;
    m[2] = c * a0 + d * c0;
    m[3] = c * b0 + d * d0;
    m[4] = tx * a0 + ty * c0 + tx0;
    m[5] = tx * b0 + ty * d0 + ty0;
    return this;
  }

  public setTransform(a: number, b: number, c: number, d: number, tx: number, ty: number): this {
    const m = this.matrix;
    m[0] = a; m[1] = b; m[2] = c; m[3] = d; m[4] = tx; m[5] = ty;
    return this;
  }

  public copyFrom(src: TransformMatrix): this {
    const m = this.matrix;
    m[0] = src.a; m[1] = src.b; m[2] = src.c; m[3] = src.d; m[4] = src.e; m[5] = src.f;
    return this;
  }

  public copyToContext(ctx: CanvasRenderingContext2D): CanvasRenderingContext2D {
    const m = this.matrix;
    ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    return ctx;
  }

  public setToContext(ctx: CanvasRenderingContext2D): CanvasRenderingContext2D {
    const m = this.matrix;
    ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    return ctx;
  }

  public applyITRS(x: number, y: number, rotation: number, scaleX: number, scaleY: number): this {
    const m = this.matrix;
    const radianSin = Math.sin(rotation);
    const radianCos = Math.cos(rotation);
    m[4] = x;
    m[5] = y;
    m[0] = radianCos * scaleX;
    m[1] = radianSin * scaleX;
    m[2] = -radianSin * scaleY;
    m[3] = radianCos * scaleY;
    return this;
  }

  public applyInverse(x: number, y: number, output: { x: number; y: number } = { x: 0, y: 0 }): { x: number; y: number } {
    const m = this.matrix;
    const a = m[0];
    const b = m[1];
    const c = m[2];
    const d = m[3];
    const tx = m[4];
    const ty = m[5];
    const id = 1 / ((a * d) + (c * -b));
    output.x = (d * id * x) + (-c * id * y) + (((ty * c) - (tx * d)) * id);
    output.y = (a * id * y) + (-b * id * x) + (((-ty * a) + (tx * b)) * id);
    return output;
  }

  public invert(): this {
    const m = this.matrix;
    const a = m[0];
    const b = m[1];
    const c = m[2];
    const d = m[3];
    const tx = m[4];
    const ty = m[5];
    const n = a * d - b * c;
    m[0] = d / n;
    m[1] = -b / n;
    m[2] = -c / n;
    m[3] = a / n;
    m[4] = (c * ty - d * tx) / n;
    m[5] = -(a * ty - b * tx) / n;
    return this;
  }

  public getX(x: number, y: number): number {
    return x * this.matrix[0] + y * this.matrix[2] + this.matrix[4];
  }

  public getY(x: number, y: number): number {
    return x * this.matrix[1] + y * this.matrix[3] + this.matrix[5];
  }

  public getXRound(x: number, y: number, round = false): number {
    const v = this.getX(x, y);
    return round ? Math.floor(v + 0.5) : v;
  }

  public getYRound(x: number, y: number, round = false): number {
    const v = this.getY(x, y);
    return round ? Math.floor(v + 0.5) : v;
  }

  /** Os quatro cantos já transformados (TL, BL, BR, TR), com o canto de cima travado no pixel quando pedido. */
  public setQuad(x: number, y: number, xw: number, yh: number, roundPixels = false, quad: Float32Array = this.quad): Float32Array {
    const m = this.matrix;
    const a = m[0];
    const b = m[1];
    const c = m[2];
    const d = m[3];
    const e = m[4];
    const f = m[5];
    const x0 = x * a + y * c + e;
    const y0 = x * b + y * d + f;
    const x1 = x * a + yh * c + e;
    const y1 = x * b + yh * d + f;
    const x2 = xw * a + yh * c + e;
    const y2 = xw * b + yh * d + f;
    const x3 = xw * a + y * c + e;
    const y3 = xw * b + y * d + f;
    if (roundPixels) {
      const rx0 = Math.floor(x0 + 0.5);
      const ry0 = Math.floor(y0 + 0.5);
      const dx = rx0 - x0;
      const dy = ry0 - y0;
      quad[0] = rx0;
      quad[1] = ry0;
      quad[2] = x1 + dx;
      quad[3] = y1 + dy;
      quad[4] = x2 + dx;
      quad[5] = y2 + dy;
      quad[6] = x3 + dx;
      quad[7] = y3 + dy;
    } else {
      quad[0] = x0;
      quad[1] = y0;
      quad[2] = x1;
      quad[3] = y1;
      quad[4] = x2;
      quad[5] = y2;
      quad[6] = x3;
      quad[7] = y3;
    }
    return quad;
  }
}

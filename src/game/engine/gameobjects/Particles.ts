/**
 * O EMISSOR DE PARTÍCULAS no que a tela de título usa: emissão por frequência, propriedades fixas,
 * sorteadas ({min, max}, lista) ou interpoladas ({start, end}), velocidade com aceleração, e o desenho de cada
 * partícula como um quad sem arredondamento. Os sorteios saem numa ordem e quantidade FIXAS (o quadro,
 * x, vida, giro, velocidades, aceleração, tinta), para a sequência do `Math.random` seguir igual.
 * Parte do motor próprio (src/game/engine); licenças em LICENSES.md.
 */
import { GameObject } from './GameObject';
import { TransformMatrix } from '../matrix';
import { Between, Clamp, DegToRad, FloatBetween, getEaseFunction } from '../math';
import { getTintAppendFloatAlpha } from '../renderer';
import type { Scene } from '../scene';
import type { Camera } from '../camera';
import type { Renderer } from '../renderer';
import type { Frame, Texture } from '../textures';

type OpValue = number | number[] | { min: number; max: number; int?: boolean } | { start: number; end: number; ease?: string; easeParams?: number[]; random?: boolean } | null | undefined;
type ParticleData = Record<string, { min: number; max: number }>;

class EmitterOp {
  public propertyValue: OpValue;
  public start = 0;
  public end = 0;
  public current: number;
  public ease: ((v: number) => number) | null = null;
  public active = true;
  public method = 0;
  public steps = 0;
  public onEmit: (particle?: Particle, key?: string) => number;
  public onUpdate: (particle: Particle, key: string, t: number, value: number) => number;

  public constructor(public propertyKey: string, public readonly defaultValue: OpValue, public readonly emitOnly = false) {
    this.propertyValue = defaultValue;
    this.current = 0;
    this.onEmit = this.defaultEmit;
    this.onUpdate = this.defaultUpdate;
  }

  public loadConfig(config: Record<string, unknown> = {}, newKey?: string): void {
    if (newKey) this.propertyKey = newKey;
    const has = Object.prototype.hasOwnProperty.call(config, this.propertyKey) && config[this.propertyKey] !== undefined;
    this.propertyValue = has ? config[this.propertyKey] as OpValue : this.defaultValue;
    this.method = this.getMethod();
    this.setMethods();
    if (this.emitOnly) this.onUpdate = this.defaultUpdate;
  }

  private getMethod(): number {
    const value = this.propertyValue;
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return 1;
    if (Array.isArray(value)) return 2;
    if (typeof value === 'object') {
      const o = value as Record<string, unknown>;
      const own = (k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
      if (own('start') && own('end')) return own('steps') ? 4 : 5;
      if (own('min') && own('max')) return 6;
    }
    return 0;
  }

  private setMethods(): void {
    const value = this.propertyValue;
    let current: number = value as number;
    let onEmit = this.defaultEmit;
    let onUpdate = this.defaultUpdate;
    switch (this.method) {
      case 1:
        onEmit = this.staticValueEmit;
        break;
      case 2:
        onEmit = this.randomStaticValueEmit;
        current = (value as number[])[0];
        break;
      case 5: {
        const v = value as { start: number; end: number; ease?: string; easeParams?: number[]; random?: boolean };
        this.start = v.start;
        this.end = v.end;
        this.ease = getEaseFunction(Object.prototype.hasOwnProperty.call(v, 'ease') ? v.ease : 'Linear', v.easeParams);
        onEmit = (Object.prototype.hasOwnProperty.call(v, 'random') && v.random) ? this.randomRangedValueEmit : this.easedValueEmit;
        onUpdate = this.easeValueUpdate;
        current = this.start;
        break;
      }
      case 6: {
        const v = value as { min: number; max: number; int?: boolean };
        this.start = v.min;
        this.end = v.max;
        onEmit = (Object.prototype.hasOwnProperty.call(v, 'int') && v.int) ? this.randomRangedIntEmit : this.randomRangedValueEmit;
        current = this.start;
        break;
      }
      default:
        break;
    }
    this.onEmit = onEmit;
    this.onUpdate = onUpdate;
    this.current = current;
  }

  private readonly defaultEmit = (): number => this.defaultValue as number;
  private readonly defaultUpdate = (_particle: Particle, _key: string, _t: number, value: number): number => value;
  private readonly staticValueEmit = (): number => this.current;

  private readonly randomStaticValueEmit = (): number => {
    const list = this.propertyValue as number[];
    const randomIndex = Math.floor(Math.random() * list.length);
    this.current = list[randomIndex];
    return this.current;
  };

  private readonly randomRangedValueEmit = (particle?: Particle, key?: string): number => {
    const value = FloatBetween(this.start, this.end);
    if (particle && key && particle.data[key]) {
      particle.data[key].min = value;
      particle.data[key].max = this.end;
    }
    this.current = value;
    return value;
  };

  private readonly randomRangedIntEmit = (particle?: Particle, key?: string): number => {
    const value = Between(this.start, this.end);
    if (particle && key && particle.data[key]) {
      particle.data[key].min = value;
      particle.data[key].max = this.end;
    }
    this.current = value;
    return value;
  };

  private readonly easedValueEmit = (particle?: Particle, key?: string): number => {
    if (particle && key && particle.data[key]) {
      const data = particle.data[key];
      data.min = this.start;
      data.max = this.end;
    }
    this.current = this.start;
    return this.start;
  };

  private readonly easeValueUpdate = (particle: Particle, key: string, t: number): number => {
    const data = particle.data[key];
    const v = this.ease!(t);
    const current = (data.max - data.min) * v + data.min;
    this.current = current;
    return current;
  };
}

class Particle {
  public frame: Frame | null = null;
  public x = 0;
  public y = 0;
  public velocityX = 0;
  public velocityY = 0;
  public accelerationX = 0;
  public accelerationY = 0;
  public maxVelocityX = 10000;
  public maxVelocityY = 10000;
  public bounce = 0;
  public scaleX = 1;
  public scaleY = 1;
  public alpha = 1;
  public angle = 0;
  public rotation = 0;
  public tint = 0xffffff;
  public life = 1000;
  public lifeCurrent = 1000;
  public delayCurrent = 0;
  public holdCurrent = 0;
  public lifeT = 0;
  public readonly data: ParticleData = {
    tint: { min: 0xffffff, max: 0xffffff },
    alpha: { min: 1, max: 1 },
    rotate: { min: 0, max: 0 },
    scaleX: { min: 1, max: 1 },
    scaleY: { min: 1, max: 1 },
    x: { min: 0, max: 0 },
    y: { min: 0, max: 0 },
    accelerationX: { min: 0, max: 0 },
    accelerationY: { min: 0, max: 0 },
    maxVelocityX: { min: 0, max: 0 },
    maxVelocityY: { min: 0, max: 0 },
    moveToX: { min: 0, max: 0 },
    moveToY: { min: 0, max: 0 },
    bounce: { min: 0, max: 0 },
  };

  public constructor(private readonly emitter: ParticleEmitter) {}

  public fire(x?: number, y?: number): boolean {
    const emitter = this.emitter;
    const ops = emitter.ops;
    this.frame = emitter.getFrame();
    if (x === undefined) this.x += ops.x.onEmit(this, 'x');
    else if (ops.x.steps > 0) this.x += x + ops.x.onEmit(this, 'x');
    else this.x += x;
    if (y === undefined) this.y += ops.y.onEmit(this, 'y');
    else if (ops.y.steps > 0) this.y += y + ops.y.onEmit(this, 'y');
    else this.y += y;
    this.life = ops.lifespan.onEmit(this, 'lifespan');
    this.lifeCurrent = this.life;
    this.lifeT = 0;
    this.delayCurrent = ops.delay.onEmit(this, 'delay');
    this.holdCurrent = ops.hold.onEmit(this, 'hold');
    this.scaleX = ops.scaleX.onEmit(this, 'scaleX');
    this.scaleY = ops.scaleY.active ? ops.scaleY.onEmit(this, 'scaleY') : this.scaleX;
    this.angle = ops.rotate.onEmit(this, 'rotate');
    this.rotation = DegToRad(this.angle);
    const sx = ops.speedX.onEmit(this, 'speedX');
    const sy = ops.speedY.active ? ops.speedY.onEmit(this, 'speedY') : sx;
    if (emitter.radial) {
      const rad = DegToRad(ops.angle.onEmit(this, 'angle'));
      this.velocityX = Math.cos(rad) * Math.abs(sx);
      this.velocityY = Math.sin(rad) * Math.abs(sy);
    } else {
      this.velocityX = sx;
      this.velocityY = sy;
    }
    if (emitter.acceleration) {
      this.accelerationX = ops.accelerationX.onEmit(this, 'accelerationX');
      this.accelerationY = ops.accelerationY.onEmit(this, 'accelerationY');
    }
    this.maxVelocityX = ops.maxVelocityX.onEmit(this, 'maxVelocityX');
    this.maxVelocityY = ops.maxVelocityY.onEmit(this, 'maxVelocityY');
    this.bounce = ops.bounce.onEmit(this, 'bounce');
    this.alpha = ops.alpha.onEmit(this, 'alpha');
    this.tint = ops.tint.onEmit(this, 'tint');
    return true;
  }

  public update(delta: number, step: number): boolean {
    if (this.lifeCurrent <= 0) {
      if (this.holdCurrent > 0) {
        this.holdCurrent -= delta;
        return this.holdCurrent <= 0;
      }
      return true;
    }
    if (this.delayCurrent > 0) {
      this.delayCurrent -= delta;
      return false;
    }
    const emitter = this.emitter;
    const ops = emitter.ops;
    const t = 1 - (this.lifeCurrent / this.life);
    this.lifeT = t;
    this.x = ops.x.onUpdate(this, 'x', t, this.x);
    this.y = ops.y.onUpdate(this, 'y', t, this.y);
    // computeVelocity
    let vx = this.velocityX;
    let vy = this.velocityY;
    const ax = ops.accelerationX.onUpdate(this, 'accelerationX', t, this.accelerationX);
    const ay = ops.accelerationY.onUpdate(this, 'accelerationY', t, this.accelerationY);
    const mx = ops.maxVelocityX.onUpdate(this, 'maxVelocityX', t, this.maxVelocityX);
    const my = ops.maxVelocityY.onUpdate(this, 'maxVelocityY', t, this.maxVelocityY);
    this.bounce = ops.bounce.onUpdate(this, 'bounce', t, this.bounce);
    vx += (emitter.gravityX * step) + (ax * step);
    vy += (emitter.gravityY * step) + (ay * step);
    vx = Clamp(vx, -mx, mx);
    vy = Clamp(vy, -my, my);
    this.velocityX = vx;
    this.velocityY = vy;
    this.x += vx * step;
    this.y += vy * step;
    this.scaleX = ops.scaleX.onUpdate(this, 'scaleX', t, this.scaleX);
    this.scaleY = ops.scaleY.active ? ops.scaleY.onUpdate(this, 'scaleY', t, this.scaleY) : this.scaleX;
    this.angle = ops.rotate.onUpdate(this, 'rotate', t, this.angle);
    this.rotation = DegToRad(this.angle);
    this.alpha = Clamp(ops.alpha.onUpdate(this, 'alpha', t, this.alpha), 0, 1);
    this.tint = ops.tint.onUpdate(this, 'tint', t, this.tint);
    this.lifeCurrent -= delta;
    return this.lifeCurrent <= 0 && this.holdCurrent <= 0;
  }

  public setPosition(x = 0, y = 0): void {
    this.x = x;
    this.y = y;
  }
}

const CONFIG_OP_MAP = ['accelerationX', 'accelerationY', 'alpha', 'angle', 'bounce', 'color', 'delay', 'hold', 'lifespan',
  'maxVelocityX', 'maxVelocityY', 'moveToX', 'moveToY', 'quantity', 'rotate', 'scaleX', 'scaleY', 'speedX', 'speedY', 'tint', 'x', 'y'] as const;
const CONFIG_FAST_MAP = ['frequency', 'gravityX', 'gravityY', 'maxAliveParticles', 'maxParticles', 'name', 'emitting', 'particleBringToTop',
  'radial', 'stopAfter', 'tintFill', 'timeScale', 'visible', 'duration', 'blendMode'] as const;

export interface ParticleEmitterConfig {
  [key: string]: unknown;
}

export class ParticleEmitter extends GameObject {
  public texture!: Texture;
  public frame!: Frame;
  public readonly ops = {
    accelerationX: new EmitterOp('accelerationX', 0),
    accelerationY: new EmitterOp('accelerationY', 0),
    alpha: new EmitterOp('alpha', 1),
    angle: new EmitterOp('angle', { min: 0, max: 360 }, true),
    bounce: new EmitterOp('bounce', 0),
    color: new EmitterOp('color', null),
    delay: new EmitterOp('delay', 0, true),
    hold: new EmitterOp('hold', 0, true),
    lifespan: new EmitterOp('lifespan', 1000, true),
    maxVelocityX: new EmitterOp('maxVelocityX', 10000),
    maxVelocityY: new EmitterOp('maxVelocityY', 10000),
    moveToX: new EmitterOp('moveToX', 0),
    moveToY: new EmitterOp('moveToY', 0),
    quantity: new EmitterOp('quantity', 1, true),
    rotate: new EmitterOp('rotate', 0),
    scaleX: new EmitterOp('scaleX', 1),
    scaleY: new EmitterOp('scaleY', 1),
    speedX: new EmitterOp('speedX', 0, true),
    speedY: new EmitterOp('speedY', 0, true),
    tint: new EmitterOp('tint', 0xffffff),
    x: new EmitterOp('x', 0),
    y: new EmitterOp('y', 0),
  };
  public radial = true;
  public gravityX = 0;
  public gravityY = 0;
  public acceleration = false;
  public maxParticles = 0;
  public maxAliveParticles = 0;
  public stopAfter = 0;
  public duration = 0;
  public frequency = 0;
  public emitting = true;
  public particleBringToTop = true;
  public timeScale = 1;
  public tintFill = false;
  public readonly frames: Array<string | number> = [];
  public randomFrame = true;
  private readonly dead: Particle[] = [];
  public readonly alive: Particle[] = [];
  /** Os contadores moram num Float32Array: o fluxo acumula em 32 bits. */
  private readonly counters = new Float32Array(10);
  private skipping = false;
  public readonly worldMatrix = new TransformMatrix();

  public constructor(scene: Scene, x: number, y: number, texture?: string | Texture, config?: ParticleEmitterConfig) {
    super(scene, 'ParticleEmitter');
    this.setPosition(x, y);
    this.setTexture(texture);
    if (config) this.setConfig(config);
  }

  private get flowCounter(): number { return this.counters[0]; }
  private set flowCounter(value: number) { this.counters[0] = value; }
  private get elapsed(): number { return this.counters[3]; }
  private set elapsed(value: number) { this.counters[3] = value; }
  private get stopCounter(): number { return this.counters[4]; }
  private set stopCounter(value: number) { this.counters[4] = value; }
  private get completeFlag(): number { return this.counters[5]; }
  private set completeFlag(value: number) { this.counters[5] = value; }

  public get accelerationX(): number { return this.ops.accelerationX.current; }
  public get accelerationY(): number { return this.ops.accelerationY.current; }

  public setTexture(key?: string | Texture, frame?: string | number): this {
    this.texture = this.scene.sys.textures.get(key);
    this.frame = this.texture.get(frame);
    return this;
  }

  public setConfig(config: ParticleEmitterConfig): this {
    const ops = this.ops as Record<string, EmitterOp>;
    for (const key of CONFIG_OP_MAP) ops[key].loadConfig(config);
    const self = this as unknown as Record<string, unknown>;
    for (const key of CONFIG_FAST_MAP) {
      if (Object.prototype.hasOwnProperty.call(config, key) && config[key] !== undefined) self[key] = config[key];
    }
    this.acceleration = this.accelerationX !== 0 || this.accelerationY !== 0;
    if (Object.prototype.hasOwnProperty.call(config, 'speed')) {
      this.ops.speedX.loadConfig(config, 'speed');
      this.ops.speedY.active = false;
    }
    if (Object.prototype.hasOwnProperty.call(config, 'speedX') || Object.prototype.hasOwnProperty.call(config, 'speedY')) this.radial = false;
    if (Object.prototype.hasOwnProperty.call(config, 'scale')) {
      this.ops.scaleX.loadConfig(config, 'scale');
      this.ops.scaleY.active = false;
    }
    this.resetCounters(this.frequency, this.emitting);
    if (this.emitting) this.emit('start', this);
    return this;
  }

  private resetCounters(frequency: number, on: boolean): void {
    this.counters.fill(0);
    this.counters[0] = frequency;
    if (on) this.counters[5] = 1;
  }

  /** Sem lista de quadros, ainda há sorteio (um `Math.random` por partícula), e cai no quadro base. */
  public getFrame(): Frame {
    const frames = this.frames;
    const len = frames.length;
    let current: string | number | null;
    if (len === 1) {
      current = frames[0];
    } else {
      const randomIndex = Math.floor(Math.random() * len);
      current = frames[randomIndex] === undefined ? null : frames[randomIndex];
    }
    return this.texture.get(current);
  }

  public getAliveParticleCount(): number { return this.alive.length; }
  public getDeadParticleCount(): number { return this.dead.length; }
  public getParticleCount(): number { return this.alive.length + this.dead.length; }

  private atLimit(): boolean {
    if (this.maxParticles > 0 && this.getParticleCount() >= this.maxParticles) return true;
    return this.maxAliveParticles > 0 && this.getAliveParticleCount() >= this.maxAliveParticles;
  }

  public emitParticle(count?: number, x?: number, y?: number): Particle | undefined {
    if (this.atLimit()) return undefined;
    if (count === undefined) count = this.ops.quantity.onEmit();
    let particle: Particle | undefined;
    for (let i = 0; i < count; i++) {
      particle = this.dead.pop() ?? new Particle(this);
      if (particle.fire(x, y)) {
        if (this.particleBringToTop) this.alive.push(particle);
        else this.alive.unshift(particle);
      } else {
        this.dead.push(particle);
      }
      if (this.stopAfter > 0) {
        this.stopCounter++;
        if (this.stopCounter >= this.stopAfter) break;
      }
      if (this.atLimit()) break;
    }
    return particle;
  }

  public start(): this {
    if (!this.emitting) {
      this.emitting = true;
      this.resetCounters(this.frequency, true);
      this.emit('start', this);
    }
    return this;
  }

  public stop(kill = false): this {
    if (this.emitting) {
      this.emitting = false;
      if (kill) {
        for (const p of this.alive) p.lifeCurrent = 0;
      }
      this.emit('stop', this);
    }
    return this;
  }

  public override addedToScene(): void {
    this.scene.sys.updateList.add(this);
  }

  public override removedFromScene(): void {
    this.scene.sys.updateList.remove(this);
  }

  public preUpdate(_time: number, delta: number): void {
    delta *= this.timeScale;
    const step = delta / 1000;
    this.getWorldTransformMatrix(this.worldMatrix);
    const particles = this.alive;
    const dead = this.dead;
    const rip: Array<{ index: number; particle: Particle }> = [];
    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      if (particle.update(delta, step)) rip.push({ index: i, particle });
    }
    if (rip.length > 0) {
      for (let i = rip.length - 1; i >= 0; i--) {
        const entry = rip[i];
        particles.splice(entry.index, 1);
        dead.push(entry.particle);
        entry.particle.setPosition();
      }
    }
    if (!this.emitting && !this.skipping) {
      if (this.completeFlag === 1 && particles.length === 0) {
        this.completeFlag = 0;
        this.emit('complete', this);
      }
      return;
    }
    if (this.frequency === 0) {
      this.emitParticle();
    } else if (this.frequency > 0) {
      this.flowCounter -= delta;
      while (this.flowCounter <= 0) {
        this.emitParticle();
        this.flowCounter += this.frequency;
      }
    }
    if (!this.skipping) {
      if (this.duration > 0) {
        this.elapsed += delta;
        if (this.elapsed >= this.duration) this.stop();
      }
      if (this.stopAfter > 0 && this.stopCounter >= this.stopAfter) this.stop();
    }
  }

  public override renderWebGL(renderer: Renderer, _src: ParticleEmitter, camera: Camera, parentMatrix?: TransformMatrix): void {
    const camMatrix = tempMatrix1;
    const calcMatrix = tempMatrix2;
    const particleMatrix = tempMatrix3;
    const managerMatrix = tempMatrix4;
    if (parentMatrix) {
      managerMatrix.loadIdentity();
      managerMatrix.multiply(parentMatrix);
      managerMatrix.translate(this.x, this.y);
      managerMatrix.rotate(this.rotation);
      managerMatrix.scale(this.scaleX, this.scaleY);
    } else {
      managerMatrix.applyITRS(this.x, this.y, this.rotation, this.scaleX, this.scaleY);
    }
    const particles = this.alive;
    const particleCount = particles.length;
    if (particleCount === 0) return;
    camera.addToRenderList(this);
    camMatrix.copyFrom(camera.matrix);
    camMatrix.multiplyWithOffset(managerMatrix, -camera.scrollX * this.scrollFactorX, -camera.scrollY * this.scrollFactorY);
    renderer.setBlendMode(this.blendMode);
    const tintEffect = this.tintFill;
    const emitterAlpha = this.alpha;
    for (let i = 0; i < particleCount; i++) {
      const particle = particles[i];
      const alpha = particle.alpha * emitterAlpha * camera.alpha;
      if (alpha <= 0 || particle.scaleX === 0 || particle.scaleY === 0) continue;
      particleMatrix.applyITRS(particle.x, particle.y, particle.rotation, particle.scaleX, particle.scaleY);
      particleMatrix.e = particle.x;
      particleMatrix.f = particle.y;
      camMatrix.multiply(particleMatrix, calcMatrix);
      const frame = particle.frame!;
      const x = -frame.halfWidth;
      const y = -frame.halfHeight;
      const quad = calcMatrix.setQuad(x, y, x + frame.width, y + frame.height);
      const tint = getTintAppendFloatAlpha(particle.tint, alpha);
      renderer.batchQuad(quad[0], quad[1], quad[2], quad[3], quad[4], quad[5], quad[6], quad[7],
        frame.u0, frame.v0, frame.u1, frame.v1, tint, tint, tint, tint, tintEffect, frame.glTexture);
    }
  }
}

const tempMatrix1 = new TransformMatrix();
const tempMatrix2 = new TransformMatrix();
const tempMatrix3 = new TransformMatrix();
const tempMatrix4 = new TransformMatrix();

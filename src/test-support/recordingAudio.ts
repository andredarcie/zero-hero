/**
 * UM CONTEXTO DE ÁUDIO QUE SÓ ANOTA (a porta `createAudioContext` da plataforma, para os testes do som): cada nó
 * criado, cada ligação, cada `start`/`stop` e cada automação de parâmetro ficam registrados, e nada toca. É o que
 * deixa o teste cobrar o que o jogo PEDE ao áudio — que nó nasce, para onde vai, quando começa e termina — sem ouvir.
 */
export class RecordingParam {
  public value = 0;
  public readonly events: Array<[string, number, number?]> = [];
  public setValueAtTime(v: number, t: number): this { this.value = v; this.events.push(['set', v, t]); return this; }
  public linearRampToValueAtTime(v: number, t: number): this { this.value = v; this.events.push(['linear', v, t]); return this; }
  public exponentialRampToValueAtTime(v: number, t: number): this { this.value = v; this.events.push(['exp', v, t]); return this; }
  public setTargetAtTime(v: number, t: number): this { this.value = v; this.events.push(['target', v, t]); return this; }
  public cancelScheduledValues(t: number): this { this.events.push(['cancel', t]); return this; }
  public cancelAndHoldAtTime(t: number): this { this.events.push(['hold', t]); return this; }
  /** A curva inteira de uma vez (o sopro, Synth.swell): anota quando começa e quanto dura; o valor fica o do fim. */
  public setValueCurveAtTime(values: ArrayLike<number>, t: number, duration: number): this {
    if (values.length > 0) this.value = values[values.length - 1];
    this.events.push(['curve', t, duration]);
    return this;
  }
}

const PARAMS = new Set(['gain', 'frequency', 'Q', 'detune', 'playbackRate', 'pan', 'threshold', 'knee', 'ratio', 'attack', 'release', 'delayTime', 'offset']);

export class RecordingNode {
  public readonly outputs: unknown[] = [];
  public started: number | null = null;
  public stopped: number | null = null;
  public onended: (() => void) | null = null;
  public buffer: unknown = null;
  public loop = false;
  public loopStart = 0;
  public loopEnd = 0;
  public type = '';
  public curve: unknown = null;
  private readonly params = new Map<string, RecordingParam>();

  public constructor(public readonly context: RecordingAudioContext, public readonly kind: string) {
    context.nodes.push(this);
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (typeof prop === 'string' && PARAMS.has(prop)) {
          let param = target.params.get(prop);
          if (!param) { param = new RecordingParam(); target.params.set(prop, param); }
          return param;
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  }

  public connect<T>(destination: T): T { this.outputs.push(destination); return destination; }
  public disconnect(): void { this.outputs.length = 0; }
  public start(when = 0): void { this.started = when; this.context.starts++; }
  public stop(when = 0): void { this.stopped = when; }
}

export class RecordingBuffer {
  private readonly channels: Float32Array[];
  public constructor(public readonly numberOfChannels: number, public readonly length: number, public readonly sampleRate: number) {
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(Math.max(0, length)));
  }
  public get duration(): number { return this.length / this.sampleRate; }
  public getChannelData(c: number): Float32Array { return this.channels[c]; }
  public copyToChannel(data: Float32Array, c: number): void { this.channels[c].set(data.subarray(0, this.length)); }
}

export class RecordingAudioContext {
  public readonly nodes: RecordingNode[] = [];
  public starts = 0;
  public currentTime = 0;
  public readonly sampleRate = 48000;
  public state: 'suspended' | 'running' | 'closed' = 'running';
  public readonly destination: RecordingNode;
  public decoded = 0;

  public constructor() {
    this.destination = new RecordingNode(this, 'destination');
  }

  public resume(): Promise<void> { this.state = 'running'; return Promise.resolve(); }
  public suspend(): Promise<void> { this.state = 'suspended'; return Promise.resolve(); }
  public close(): Promise<void> { this.state = 'closed'; return Promise.resolve(); }
  public createGain(): RecordingNode { return new RecordingNode(this, 'gain'); }
  public createOscillator(): RecordingNode { return new RecordingNode(this, 'oscillator'); }
  public createBufferSource(): RecordingNode { return new RecordingNode(this, 'bufferSource'); }
  public createBiquadFilter(): RecordingNode { return new RecordingNode(this, 'biquad'); }
  public createDynamicsCompressor(): RecordingNode { return new RecordingNode(this, 'compressor'); }
  public createStereoPanner(): RecordingNode { return new RecordingNode(this, 'panner'); }
  public createDelay(): RecordingNode { return new RecordingNode(this, 'delay'); }
  public createWaveShaper(): RecordingNode { return new RecordingNode(this, 'waveShaper'); }
  public createConvolver(): RecordingNode { return new RecordingNode(this, 'convolver'); }
  public createConstantSource(): RecordingNode { return new RecordingNode(this, 'constant'); }
  public createMediaElementSource(): RecordingNode { return new RecordingNode(this, 'mediaElement'); }
  public createBuffer(channels: number, length: number, rate: number): RecordingBuffer { return new RecordingBuffer(channels, length, rate); }
  /** Decodifica qualquer coisa num segundo de silêncio estéreo. */
  public decodeAudioData(_data: ArrayBuffer, ok?: (b: RecordingBuffer) => void): Promise<RecordingBuffer> {
    this.decoded++;
    const buffer = new RecordingBuffer(2, this.sampleRate, this.sampleRate);
    ok?.(buffer);
    return Promise.resolve(buffer);
  }

  /** Quantos nós de cada tipo nasceram. */
  public count(kind: string): number { return this.nodes.filter((n) => n.kind === kind).length; }
}

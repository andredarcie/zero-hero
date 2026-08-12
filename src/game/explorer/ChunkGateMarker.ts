import { ASSET_KEYS, ROAD_SEAL_FRAMES } from '@/game/constants';
import { FX_DOT_TEXTURE, world3d } from '@/game/render3d/World3D';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import type { ChunkFrontier } from './explorerWorld';

/** Quanto o halo VIOLETA do marco desperto respira (o mesmo ritmo calmo da fogueira). */
const HALO_HZ = 0.55;
const HALO_MIN = 0.85; // tiles
const HALO_MAX = 1.22;

/**
 * O MARCO DA ESTRADA — a laje em que o mundo se compra.
 *
 * Ele era a arte da PLACA DE PRESSÃO com um banho de cor (dourado = dá pra pagar, cinza = não).
 * Isso errava duas vezes: um botão de máquina largado no meio do mato não diz "aqui acaba a
 * estrada", e reusar a arte de uma peça de circuito ensina que este tile é uma máquina que alguém
 * liga. Ele não é uma máquina — é um marco de fronteira, e agora tem a arte de um
 * (`spritefactory/sprites/road-seal.mjs`): laje redonda embutida no chão, musgo nas juntas e uma
 * MOEDA gravada no meio, que é o verbo do lugar.
 *
 * Os dois estados são a mesma pedra com luzes diferentes — nunca duas silhuetas:
 *   · **dormente** — o vinco apagado, a laje fria e um pouco afundada no escuro;
 *   · **desperta** — o vinco em ouro (frame 1) e um HALO que respira por baixo dela.
 *
 * O halo é um quad aditivo, e não uma luz THREE: a contagem de luzes está selada para a run, e um
 * marco que acendesse uma luz de verdade recompilaria o mundo inteiro na primeira moeda apanhada.
 */
export class ChunkGateMarker {
  public readonly id: string;
  private readonly sprite: Billboard3D;
  private readonly halo: Billboard3D;
  private awake = false;
  private phase = Math.random() * Math.PI * 2;

  public constructor(public readonly frontier: ChunkFrontier, enabled: boolean) {
    this.id = frontier.id;
    this.halo = world3d()
      .addBillboard(FX_DOT_TEXTURE, 0, {
        flat: true, flatY: 0.022, depthLayer: 'ground', additive: true, fog: false, centered: true,
      })
      .setPosition(frontier.gateX, frontier.gateY)
      .setTint(0xaf3fc3) // orquídea: o halo é da MESMA cor da runa, e da mortalha que ele desfaz
      .setDisplaySize(HALO_MIN, HALO_MIN)
      .setAlpha(0);
    this.sprite = world3d()
      .addBillboard(ASSET_KEYS.roadSeal, ROAD_SEAL_FRAMES.dormant, {
        flat: true,
        flatY: 0.032,
        depthLayer: 'ground',
      })
      .setPosition(frontier.gateX, frontier.gateY)
      .setDisplaySize(0.96, 0.96);
    this.setEnabled(enabled);
  }

  public setEnabled(enabled: boolean): void {
    this.awake = enabled;
    this.sprite.setTexture(
      ASSET_KEYS.roadSeal, enabled ? ROAD_SEAL_FRAMES.awake : ROAD_SEAL_FRAMES.dormant,
    );
    // A pedra dormente não é CINZA — ela é a mesma pedra na sombra. Tingir de cinza chapado era o
    // que fazia o marco parecer desligado em vez de frio.
    this.sprite.setTint(enabled ? 0xffffff : 0x9aa0c0);
    this.sprite.setAlpha(enabled ? 1 : 0.82);
    // Quem faz o marco desperto BRILHAR é o halo aditivo, não um boost no material: a laje é
    // pedra, e pedra tem de receber a luz do mundo como qualquer outra (a fogueira ao lado dela
    // acende o marco, e é isso que o casa com o chão em vez de fazê-lo flutuar aceso no escuro).
    if (!enabled) this.halo.setAlpha(0);
  }

  /** O halo respirando. Chamado por frame com o relógio da cena. */
  public update(elapsedMs: number): void {
    if (!this.awake) return;
    const t = Math.sin(elapsedMs * 0.001 * HALO_HZ * Math.PI * 2 + this.phase) * 0.5 + 0.5;
    this.halo
      .setDisplaySize(HALO_MIN + (HALO_MAX - HALO_MIN) * t, HALO_MIN + (HALO_MAX - HALO_MIN) * t)
      // Baixo de propósito: o halo é a RESPIRAÇÃO do marco, não a fonte de luz dele. A primeira
      // versão (0,16 + 0,16) estourava o vinco de ouro num ovo amarelo chapado — o desenho da
      // moeda gravada sumia justamente no estado em que ele é a informação.
      .setAlpha(0.08 + 0.1 * t);
  }

  public destroy(): void {
    this.sprite.destroy();
    this.halo.destroy();
  }
}

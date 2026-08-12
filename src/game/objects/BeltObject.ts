import type Phaser from 'phaser';

import { ASSET_KEYS, BELT_STEP_MS } from '@/game/constants';
import type { HeldItemKind } from '@/game/entities/ItemPickup';
import { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import type { WorldProp } from './WorldProp';

/**
 * A ESTEIRA — a peca que faz "automacao" querer dizer alguma coisa neste jogo.
 *
 * O braco robotico ja movia carga, mas ele e uma JUNTA: um item, um tile, ~2,5s. Enquanto ele
 * foi o unico transporte, toda producao tinha de acontecer a um tile de onde era consumida, e
 * "fabrica" era no maximo um par de maquinas se encostando. A esteira e o que da DISTANCIA ao
 * sistema — e distancia e a unica coisa que transforma um punhado de maquinas numa linha.
 *
 * ── As tres decisoes que a peca toma ────────────────────────────────────────────────────────
 *
 * 1. Ela NAO BLOQUEIA. O heroi anda por cima, como anda por cima do cabo. Uma esteira solida
 *    faria de toda linha longa um muro, e o jogador passaria o jogo contornando a propria
 *    fabrica — o oposto exato do que uma fabrica deveria dar.
 *
 * 2. Ela nao carrega o item: ela o EMPURRA de tile em tile. O item continua sendo um
 *    `ItemPickup` deitado no chao, que o heroi pode pegar com B a qualquer momento e que
 *    qualquer outra maquina enxerga pelo caminho de sempre (a bandeja da bancada, a garra do
 *    braco, o balcao). Uma esteira que "engolisse" a carga precisaria de um estado proprio, e
 *    esse estado teria de aparecer em todo lugar que hoje pergunta "o que ha neste tile".
 *
 * 3. A velocidade e a SATISFACAO da rede (ver solvePowerGrid). Rede curta nao para a esteira:
 *    faz ela arrastar, na proporcao exata do que faltou. E o gargalo dito com fisica, que e a
 *    lei das travas deste jogo — e e legivel de relance, porque as setas do sprite andam mais
 *    devagar junto com a carga.
 */

// N, L, S, O — a mesma tabela do braco robotico e do extrator. `dir` e PARA ONDE a esteira
// entrega, exatamente como no braco: uma segunda semantica de `dir` seria a armadilha mais cara
// que este jogo poderia se dar.
const DIR_VEC: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];

// Quantos passos de animacao a folha tem (ver spritefactory/sprites/belt.mjs): `dir + 4*fase`.
const PHASES = 2;

// A esteira e um quad DEITADO, e mora entre o cabo (0.012/0.022) e o buraco de plantio (0.018).
// A ordem nao e estetica: dois quads flat coplanares piscam, entao cada peca de chao deste jogo
// tem a propria altura declarada — e a esteira e a mais nova, entao ela escolhe a folga que
// sobrou. `depthLayer: 'ground'` porque o heroi PISA nela (a lei do Billboard3D).
const BELT_Y = 0.016;

/** O que a esteira precisa do mundo — um port pequeno, como o do braco e o da bancada. */
export type BeltWorldPort = {
  /** O que esta caido neste tile (null se nada). */
  kindAt(x: number, y: number): HeldItemKind | null;
  /**
   * Move o item de um tile para o outro, PRESERVANDO tudo que ele carrega (fogo, carga de
   * bateria, contagem de pacote). Devolve false quando nao deu — e a esteira entao segura a
   * carga onde ela esta, que e o congestionamento se desenhando sozinho.
   */
  shift(fromX: number, fromY: number, toX: number, toY: number): boolean;
  /** Ha algo que impeca a carga de assentar ali? Parede, prop, bicho, outro item. */
  blocked(x: number, y: number): boolean;
  /** Um item assentou no tile seguinte (o tiquetaque da linha). */
  stepped(x: number, y: number): void;
};

export class BeltObject implements WorldProp {
  public readonly worldX: number;
  public readonly worldY: number;
  public readonly dir: number;
  /**
   * Construida pelo JOGADOR (e nao autorada no world.json). E o que decide se o B de mao vazia
   * pode recolher a peca de volta: desmontar a fabrica que voce mesmo montou e reversibilidade;
   * desmontar a que o autor do level montou e desmontar o puzzle.
   */
  public readonly playerBuilt: boolean;

  private readonly sprite: Billboard3D;
  private elapsed = 0;
  private phase = 0;
  /** Quanto da propria vazao a rede esta bancando agora (0..1). */
  private satisfaction = 0;

  public constructor(
    _scene: Phaser.Scene,
    worldX: number,
    worldY: number,
    dir = 1,
    playerBuilt = false,
  ) {
    this.worldX = worldX;
    this.worldY = worldY;
    this.dir = ((dir % 4) + 4) % 4;
    this.playerBuilt = playerBuilt;
    this.sprite = world3d()
      .addBillboard(ASSET_KEYS.belt, this.dir, { flat: true, flatY: BELT_Y, depthLayer: 'ground' })
      .setPosition(worldX, worldY)
      .setDisplaySize(1, 1); // full bleed: duas esteiras seguidas tem de ler como UMA linha
  }

  /** O tile para onde esta esteira entrega. */
  public get outputTile(): readonly [number, number] {
    const [vx, vy] = DIR_VEC[this.dir];
    return [this.worldX + vx, this.worldY + vy];
  }

  public update(deltaMs: number, port: BeltWorldPort, satisfaction: number): void {
    this.satisfaction = Math.max(0, Math.min(1, satisfaction));
    if (this.satisfaction <= 0) return; // sem energia a esteira e chao: a carga fica onde esta

    // O RELOGIO CORRE NA VELOCIDADE DA REDE, e e so isso que a vazao significa aqui. Multiplicar
    // o delta (em vez de encurtar o passo) e o que faz uma linha meio alimentada arrastar INTEIRA
    // e em sincronia, em vez de umas esteiras andando e outras parando — que leria como bug.
    const scaled = deltaMs * this.satisfaction;
    this.elapsed += scaled;

    // A animacao corre no mesmo relogio da carga, entao as setas dizem a verdade sobre a
    // velocidade mesmo quando nao ha nada em cima da esteira.
    const nextPhase = Math.floor((this.elapsed / (BELT_STEP_MS / PHASES)) % PHASES);
    if (nextPhase !== this.phase) {
      this.phase = nextPhase;
      this.sprite.setTexture(ASSET_KEYS.belt, this.dir + 4 * this.phase);
    }

    if (this.elapsed < BELT_STEP_MS) return;
    this.elapsed -= BELT_STEP_MS;

    // A ENTREGA. Nada em cima: nada a fazer — e nao "falha", entao o relogio ja voltou ao inicio
    // e a proxima carga a chegar espera um passo inteiro, como qualquer outra.
    if (port.kindAt(this.worldX, this.worldY) === null) return;
    const [ox, oy] = this.outputTile;
    // O DESTINO OCUPADO NAO E UM ERRO: e uma FILA. A carga fica, o relogio reseta, e a proxima
    // esteira atras desta encontra este tile ocupado e para tambem — o engarrafamento se propaga
    // sozinho, de tras pra frente, sem ninguem precisar programa-lo. E o unico jeito de o
    // jogador VER onde a linha dele esta entupindo.
    if (port.blocked(ox, oy)) return;
    if (!port.shift(this.worldX, this.worldY, ox, oy)) return;
    port.stepped(ox, oy);
  }

  public destroy(): void {
    this.sprite.destroy();
  }
}

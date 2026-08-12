import type Phaser from 'phaser';

import { ASSET_KEYS, EXTRACTOR_CYCLE_MS } from '@/game/constants';
import type { HeldItemKind } from '@/game/entities/ItemPickup';
import { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';
import type { WorldProp } from './WorldProp';

/**
 * O EXTRATOR — a unica maquina do jogo que PRODUZ, e por isso a unica que justifica todo o resto.
 *
 * O veio de ferro ja era infinito, mas custava tres picaretadas por bloco: enquanto ele foi a
 * unica fonte, "producao" e "o jogador batendo numa pedra" eram a mesma frase, e nenhuma
 * quantidade de esteira, bau ou cabo muda isso. Uma fabrica cuja materia-prima so entra pela mao
 * do heroi e uma esteira de brinquedo. O extrator e o primeiro objeto deste jogo que faz alguma
 * coisa existir sem ninguem olhando.
 *
 * ── A geometria, que e a MESMA do braco robotico, de proposito ──────────────────────────────
 * `dir` e PARA ONDE ele entrega. Ele MORDE o tile de tras (onde o veio tem de estar) e POE no
 * tile da frente. E identico ao braco porque duas maquinas com `dir` significando coisas
 * diferentes seria a armadilha mais cara que este jogo poderia se dar — e porque o sprite ja
 * ensina a regra sozinho: a broca clara marca o lado que morde, o bico de ouro o lado que
 * entrega, e os dois estao sempre opostos (ver spritefactory/sprites/extractor.mjs).
 *
 * ── E por que ele e mais LENTO que a picareta ───────────────────────────────────────────────
 * Um ciclo custa 2,4s a plena carga; o heroi faz o mesmo bloco em ~2s. Isso nao e um numero por
 * afinar: e a peca inteira. Se a maquina ganhasse do jogador na velocidade, minerar a mao
 * morreria no dia em que o primeiro extrator fosse construido. Ela ganha por ser MUITA (a rede
 * banca varios) e por trabalhar enquanto o jogador esta numa dungeon do outro lado do mapa — que
 * e a unica recompensa que uma automacao deveria dar.
 */

const DIR_VEC: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];

// A mesma correcao de brilho da bancada e do braco: a rampa `stone` da arte e clara, e sem o
// desconto o bloom transforma a maquina num borrao branco a noite.
const METAL_TINT = 0xd2d2d2;
const IDLE_TINT = 0x8f9296; // sem energia ela apaga, como o braco — nunca some, nunca pisca

/** O que o extrator precisa do mundo — o port pequeno de sempre. */
export type ExtractorWorldPort = {
  /** Ha um veio de minerio neste tile? (a `ironRock`: a rocha que nunca quebra). */
  oreAt(x: number, y: number): boolean;
  /** Ha algo que impeca o bloco de assentar ali? Parede, prop, bicho, outro item incompativel. */
  blocked(x: number, y: number): boolean;
  /** Entrega o bloco. Devolve false se nao coube — e ai a maquina SEGURA o ciclo pronto. */
  deliver(kind: HeldItemKind, x: number, y: number): boolean;
  /** A broca mordeu (uma vez por ciclo, no instante do impacto). */
  bit(x: number, y: number): void;
};

export class ExtractorObject implements WorldProp {
  public readonly worldX: number;
  public readonly worldY: number;
  public readonly dir: number;
  /** Ver BeltObject.playerBuilt. */
  public readonly playerBuilt: boolean;
  public readonly blocking = true;

  private readonly sprite: Billboard3D;
  private elapsed = 0;
  private phase = 0;
  private satisfaction = 0;
  private powered = false;
  /** Um ciclo que terminou e nao coube na saida: a maquina segura o bloco em vez de perde-lo. */
  private pending = false;

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
      .addBillboard(ASSET_KEYS.extractor, this.dir)
      .setPosition(worldX, worldY)
      .setDisplaySize(1, 1)
      .setTint(IDLE_TINT);
  }

  /** O tile que a broca morde: o de TRAS. E la que o veio tem de estar. */
  public get inputTile(): readonly [number, number] {
    const [vx, vy] = DIR_VEC[this.dir];
    return [this.worldX - vx, this.worldY - vy];
  }

  /** O tile onde o bloco assenta: o da FRENTE. Igualzinho ao braco. */
  public get outputTile(): readonly [number, number] {
    const [vx, vy] = DIR_VEC[this.dir];
    return [this.worldX + vx, this.worldY + vy];
  }

  public get isRunning(): boolean { return this.powered; }

  public update(deltaMs: number, port: ExtractorWorldPort, satisfaction: number): void {
    this.satisfaction = Math.max(0, Math.min(1, satisfaction));
    const [ix, iy] = this.inputTile;
    const [ox, oy] = this.outputTile;

    // TRES condicoes, e a maquina so anda com as tres. Nenhuma delas vira legenda: sem energia
    // ela apaga (tint), sem veio ela nunca acende a fagulha, e com a saida entupida ela para com
    // o bloco pronto na broca — que e o congestionamento se desenhando, como na esteira.
    const hasOre = port.oreAt(ix, iy);
    const running = this.satisfaction > 0 && hasOre;
    this.setPowered(running);

    // O CICLO PRONTO E TEIMOSO: enquanto nao couber, ele tenta a cada frame e o relogio nao
    // reinicia. Sem isso, um bau que encheu por um instante faria a maquina JOGAR FORA o bloco.
    if (this.pending) {
      if (!port.blocked(ox, oy) && port.deliver('ore', ox, oy)) this.pending = false;
      else return;
    }
    if (!running) return;

    // O relogio corre na velocidade da rede — a mesma lei da esteira. Rede a meio banca meio
    // extrator, e o jogador VE a fagulha ficar mais rara antes de contar bloco nenhum.
    this.elapsed += deltaMs * this.satisfaction;

    // A fase da broca e uma leitura DIRETA do progresso do ciclo, nao um relogio proprio: assim
    // a mordida acontece sempre no mesmo ponto da barra invisivel, e a animacao nunca dessincroniza
    // da producao (que e o defeito classico de animar maquina com um timer separado).
    const nextPhase = this.elapsed / EXTRACTOR_CYCLE_MS > 0.5 ? 1 : 0;
    if (nextPhase !== this.phase) {
      this.phase = nextPhase;
      this.sprite.setTexture(ASSET_KEYS.extractor, this.dir + 4 * this.phase);
      if (this.phase === 1) port.bit(ix, iy); // a fagulha e o som nascem no MESMO frame
    }

    if (this.elapsed < EXTRACTOR_CYCLE_MS) return;
    this.elapsed -= EXTRACTOR_CYCLE_MS;
    if (port.blocked(ox, oy) || !port.deliver('ore', ox, oy)) this.pending = true;
  }

  private setPowered(powered: boolean): void {
    if (this.powered === powered) return;
    this.powered = powered;
    this.sprite.setTint(powered ? METAL_TINT : IDLE_TINT);
    if (!powered) {
      // Parar no meio de um ciclo NAO devolve o progresso ao zero: a maquina retoma de onde
      // estava quando a energia voltar. Zerar puniria o jogador por um pico de consumo que ele
      // ja esta pagando em lentidao, e puniria duas vezes pela mesma coisa.
      this.phase = 0;
      this.sprite.setTexture(ASSET_KEYS.extractor, this.dir);
    }
  }

  public destroy(): void {
    this.sprite.destroy();
  }
}

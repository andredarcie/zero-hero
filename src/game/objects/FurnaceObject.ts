import type Phaser from 'phaser';

import { ASSET_KEYS, FURNACE_CYCLE_MS } from '@/game/constants';
import { itemGroundVisual, type HeldItemKind } from '@/game/entities/ItemPickup';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import {
  PLACEMENT_KEY_TEXTURE, ensurePlacementKeyTexture,
} from '@/game/render3d/placementTexture';
import { FX_DOT_TEXTURE, world3d } from '@/game/render3d/World3D';
import { isTouchDevice } from '@/game/runtime/PauseMenu';
import type { WorldCamera } from '@/game/runtime/WorldCamera';
import type { PropDir } from '@/game/world/worldSchema';
import type { WorldProp } from './WorldProp';

/**
 * O FORNO — a unica maquina deste jogo que faz QUIMICA, e a que transforma "minerar" numa cadeia.
 *
 *     (minerio) (carvao) [FORNO] (esponja)
 *
 * Ate aqui o veio cuspia ferro pronto, e isso era uma mentira barata. Minerio de ferro e OXIDO
 * (hematita, magnetita) preso em rocha — quimicamente, ferrugem. Nao se forja, nao se martela,
 * nao serve para nada. Para virar metal ele precisa do carvao, e nao pelo motivo que todo mundo
 * supoe:
 *
 *   **O carvao nao esta ali para dar calor. Esta ali para roubar o oxigenio.**
 *
 * Queimando com pouco ar, o carvao vira monoxido de carbono, e e o CO que arranca o oxigenio do
 * oxido: `Fe2O3 + 3CO -> 2Fe + 3CO2`. E por isso que um forno de ferro precisa de um tubo de ar
 * (a ventaneira, que o sprite desenha) — sem ar nao ha CO, e sem CO o minerio continua sendo
 * pedra por mais fogo que se jogue nele. As duas bandejas do forno sao essa equacao: uma pede a
 * materia, a outra pede o REAGENTE.
 *
 * ── E o que sai NAO e uma barra ─────────────────────────────────────────────────────────────
 * Numa forja antiga o ferro nunca chega a derreter: os graos se juntam no fundo numa massa
 * esponjosa encharcada de escoria — a *lupa*. Ela sai daqui como `bloom`, e so vira `iron` depois
 * de apanhar (a mao do heroi, ou o martinete). Essa etapa e o coracao da peca: e ela que explica
 * por que existe um martelo, por que existe uma roda d'agua, e por que automatizar da alivio.
 *
 * ── Por que ele NAO consome energia ─────────────────────────────────────────────────────────
 * Um bloomery e tecnologia da Idade do Ferro, movido a fole. Cobrar watts dele inverteria a
 * escada inteira: o jogador precisaria de uma rede para fazer o primeiro ferro, e precisa de
 * ferro para fazer a rede. O forno e, de proposito, a unica maquina que se constroi antes de
 * existir qualquer eletricidade — e e por isso que a receita dele e pedra com pedra.
 *
 * A geometria e a MESMA da bancada (duas bandejas atras, corpo, saida na frente), e isso nao e
 * preguica: o jogador ja aprendeu esse gesto, e uma segunda gramatica de "maquina que come dois e
 * cospe um" seria uma coisa nova para decorar sem nada novo para dizer.
 */

const DIR_VEC: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/** Os dois frames da alvenaria (ver spritefactory/sprites/furnace.mjs). */
const FRAME_COLD = 0;
const FRAME_LIT = 1;

const STONE_TINT = 0xd2d2d2;

// A boca acesa: um quad additive na frente da alvenaria, como o brilho da forja da bancada. Nao e
// uma luz THREE — a contagem de luzes deste renderer nunca muda em tempo de execucao.
const MOUTH_ELEV = 0.34;
const EMBER = 0xe7462a;
const EMBER_HOT = 0xf8e394;

// ── OS DOIS FANTASMAS DE PEDIDO FORAM ARRANCADOS (2026-08-12) ─────────────────────────────────
//
// O forno mostrava, permanentemente, dois itens translucidos flutuando nas bandejas: "minerio
// aqui, carvao ali". Aquilo nasceu quando ele sabia fazer UMA coisa e nao tinha menu — o plano
// nao se pregava porque era o mesmo para sempre. Hoje ele tem catalogo, sabe DUAS receitas
// (carvoaria e esponja) e vai saber mais, e um pedido permanente de uma delas passou a MENTIR
// sobre a maquina: quem chegasse com duas madeiras via o forno pedindo minerio.
//
// O pedido agora e o catalogo, que e onde ele pode crescer. As bandejas continuam desenhadas no
// chao (a marca de onde uma esteira ou um braco entregam) e continuam alimentando o ciclo
// automatico — o que elas nao fazem mais e conversar com o jogador.

/** A altura de onde a carga parte: pousada na bandeja, e na altura do braco quando e a MAO. */
const TRAY_ELEV = 0.14;
const HAND_ELEV = 0.42;

const SLOT_PULSE_MS = 1150;
const SLOT_ALPHA_LO = 0.38;
const SLOT_ALPHA_HI = 0.92;
const DEPTH_ITEM = 0.05;
const ITEM_SIZE = 0.5;

export type FurnaceWorldPort = {
  kindAt(x: number, y: number): HeldItemKind | null;
  take(x: number, y: number): HeldItemKind | null;
  put(kind: HeldItemKind, x: number, y: number, units?: number): void;
  occupied(x: number, y: number): boolean;
  /**
   * A SAIDA DE EMERGENCIA de uma fornada de MAO: um tile livre em volta da maquina (`x`,`y`),
   * quando a boca da frente esta entupida. So o gesto do jogador a usa — a fornada de bandeja
   * continua entregando SEMPRE no mesmo tile, porque e dali que a esteira tira.
   */
  landing(x: number, y: number): readonly [number, number] | null;
  /** A fornada pegou. */
  lit(): void;
  /** O sopro do fole, algumas vezes por fornada. */
  breath(): void;
  /** A esponja saiu e assentou no chao. */
  delivered(): void;
};

type FurnacePhase = 'idle' | 'smelting' | 'deliver';

const BREATHS = 3;
const DELIVER_MS = 420;

/**
 * A FORNADA PEDIDA NO CATALOGO — quanto ela dura.
 *
 * Ela era uma POSE de meio segundo enquanto a esponja ja tinha caido no chao no mesmo frame do
 * aperto: o item aparecia ao lado de uma maquina que so depois acendia, e o gesto inteiro nao
 * tinha meio. Agora e uma fornada de verdade — a mesma maquina de estado da bandeja, com o fole,
 * as faiscas e a entrega pela BOCA da frente.
 *
 * 1,6s e menos da metade do ciclo automatico (4s) de proposito: a fornada de bandeja e o gargalo
 * da linha e tem de doer, mas a do catalogo acontece com o jogador parado olhando, e tempo de
 * espera com o jogador sem nada a fazer e a coisa mais cara que uma animacao pode cobrar. O que
 * 1,6s compra sao os tres sopros do fole — o minimo para a boca subir, rugir e cair.
 */
const HAND_CYCLE_MS = 1600;
/** O esguicho de brasa no instante em que a peca PULA da boca (as duas fornadas ganham). */
const DELIVER_SPARKS = 5;

const ease = (t: number): number => 0.5 - Math.cos(Math.PI * t) / 2;
const arc = (t: number): number => Math.sin(Math.PI * t);

export class FurnaceObject implements WorldProp {
  private readonly body: Billboard3D;
  private readonly slots: [Billboard3D, Billboard3D];
  private glow?: Billboard3D;
  private readonly flying: Billboard3D[] = [];
  private readonly sparks = new Set<Billboard3D>();

  private phase: FurnacePhase = 'idle';
  private elapsed = 0;
  private aliveMs = 0;
  private frame = FRAME_COLD;
  private breathsPlayed = 0;
  /** O keycap "Z" que anuncia que esta maquina responde ao A. */
  private hint?: Phaser.GameObjects.Image;

  /** Quantas fornadas ele fez. Publico: e o que o playtest observa da peca. */
  public smeltCount = 0;
  /**
   * A FORNADA DA MAO (o catalogo): o que esta sendo feito e quantas unidades. `null` = a fornada
   * corrente e a das bandejas, que sempre devolve esponja. E um campo e nao um segundo estado
   * porque as duas fornadas sao a MESMA maquina de estado: o que muda e a duracao, de onde a carga
   * voa e o que sai — nunca o gesto.
   */
  private handProduct: HeldItemKind | null = null;
  private handUnits = 1;
  /** O tile escolhido para a entrega em curso (ver pickDeliverTile). Congelado durante o voo. */
  private deliverTo: readonly [number, number] | null = null;
  /** A fornada de mao pediu fogo e ainda nao teve voz: quem tem o port e o update, nao o gesto. */
  private pendingLit = false;
  /**
   * De onde cada carga voando partiu — tile e ALTURA. A altura importa: da bandeja a carga sobe do
   * chao, da mao do heroi ela sai na altura do braco, e uma esponja saindo dos pes dele leria como
   * item caido em vez de item entregue.
   */
  private chargeFrom: Array<readonly [number, number, number]> = [];

  public constructor(
    private readonly scene: Phaser.Scene,
    public readonly worldX: number,
    public readonly worldY: number,
    public readonly dir: PropDir = 1,
    public readonly playerBuilt = false,
  ) {
    this.body = world3d()
      .addBillboard(ASSET_KEYS.furnace, FRAME_COLD, { groundShadow: true })
      .setPosition(worldX, worldY)
      .setDisplaySize(1, 1)
      .setTint(STONE_TINT);

    const makeSlot = (x: number, y: number): Billboard3D => world3d()
      .addBillboard(ASSET_KEYS.toolbox, 4, {
        flat: true, flatY: 0.024, depthLayer: 'ground', emissive: true,
      })
      .setPosition(x, y)
      .setDisplaySize(0.9, 0.9);
    const [ax, ay] = this.slotTiles[0];
    const [bx, by] = this.slotTiles[1];
    this.slots = [makeSlot(ax, ay), makeSlot(bx, by)];
  }

  public get blocking(): boolean { return true; }

  /** As duas bocas de carga: (A) (B) [forno] (saida) — derivadas de `dir`, como a bancada. */
  public get slotTiles(): readonly [readonly [number, number], readonly [number, number]] {
    const [vx, vy] = DIR_VEC[this.dir];
    return [
      [this.worldX - vx * 2, this.worldY - vy * 2],
      [this.worldX - vx, this.worldY - vy],
    ];
  }

  public get outputTile(): readonly [number, number] {
    const [vx, vy] = DIR_VEC[this.dir];
    return [this.worldX + vx, this.worldY + vy];
  }

  public get isBusy(): boolean { return this.phase !== 'idle'; }
  public get currentPhase(): FurnacePhase { return this.phase; }
  public get currentFrame(): number { return this.frame; }

  /**
   * A EQUACAO DA LINHA AUTOMATICA: um minerio e um carvao, em qualquer ordem. Exigir "o carvao na
   * bandeja de tras" seria uma regra invisivel — o mesmo pecado que a bancada ja recusa.
   *
   * Ela vale so para o que chega pelas BANDEJAS (esteira, braco): a fornada que o jogador pede no
   * catalogo gasta da mochila e nao passa por aqui. E por isso que as bandejas nao anunciam mais
   * nada — elas sao a boca das MAQUINAS, e maquina nao le fantasma.
   */
  private static charge(
    a: HeldItemKind | null,
    b: HeldItemKind | null,
  ): boolean {
    return (a === 'ore' && b === 'charcoal') || (a === 'charcoal' && b === 'ore');
  }

  public update(deltaMs: number, port: FurnaceWorldPort, effectsVisible: boolean): void {
    this.aliveMs += deltaMs;
    this.elapsed += deltaMs;

    const [ax, ay] = this.slotTiles[0];
    const [bx, by] = this.slotTiles[1];
    const [ox, oy] = this.outputTile;
    const inA = port.kindAt(ax, ay);
    const inB = port.kindAt(bx, by);
    this.renderSlots(inA !== null, inB !== null);

    switch (this.phase) {
      case 'idle': {
        this.pose(FRAME_COLD);
        this.fadeGlow(deltaMs);
        if (!FurnaceObject.charge(inA, inB)) break;
        // A saida e olhada ANTES de morder: um forno que engolisse a carga com o tile de saida
        // entupido perderia minerio e carvao em silencio — o pior defeito possivel numa cadeia
        // em que o carvao custa uma arvore queimada.
        if (port.occupied(ox, oy)) break;
        // COMPROMISSO: os dois insumos saem do chao AGORA. Deixa-los la ate o fim abriria uma
        // janela em que um braco leva o carvao embora com a fornada ja correndo.
        const takenA = port.take(ax, ay);
        const takenB = port.take(bx, by);
        if (!takenA || !takenB) {
          if (takenA) port.put(takenA, ax, ay);
          if (takenB) port.put(takenB, bx, by);
          break;
        }
        this.spawnCharge([takenA, takenB], this.slotTiles);
        this.enter('smelting');
        this.breathsPlayed = 0;
        if (effectsVisible) port.lit();
        break;
      }

      case 'smelting': {
        // A BOCA PEGANDO FOGO TEM UMA VOZ SO, venha a fornada da bandeja ou do catalogo: e o mesmo
        // evento na mesma maquina, e dois sons fariam o jogador achar que sao duas coisas.
        if (this.pendingLit) {
          this.pendingLit = false;
          if (effectsVisible) port.lit();
        }
        const t = Math.min(1, this.elapsed / this.cycleMs);
        this.pose(FRAME_LIT);
        this.moveCharge(ease(Math.min(1, t * 2.6)));
        // O calor SOBE e desce: a fornada pega, ruge no meio e cai. Um brilho constante leria
        // como lampada acesa, e nao como coisa queimando.
        this.pulseGlow(0.45 + 0.55 * arc(t), effectsVisible);
        const due = Math.min(BREATHS, Math.floor(t * BREATHS) + 1);
        while (this.breathsPlayed < due) {
          this.breathsPlayed += 1;
          if (effectsVisible) {
            port.breath();
            this.spawnSparks(2);
            // O FOLE SACODE A ALVENARIA. O sopro era so som e faisca; um forno que ruge e nao se
            // mexe le como uma lampada com efeito sonoro. O tranco e o mesmo `bump` da entrega —
            // dois graus, sem escala nenhuma (nada pode vazar do tile).
            this.bump();
          }
        }
        if (t >= 1) {
          this.clearFlying();
          this.enter('deliver');
          this.spawnProduct(this.handProduct ?? 'bloom');
          // A BRASA ESGUICHA DA BOCA quando a peca nasce: e o instante que o jogador esta esperando
          // desde que confirmou no catalogo, e ate aqui ele era o unico da fornada sem nada na tela.
          if (effectsVisible) this.spawnSparks(DELIVER_SPARKS, MOUTH_ELEV);
        }
        break;
      }

      case 'deliver': {
        // A pergunta se refaz aqui: a fornada inteira se passou desde a checagem do idle, e
        // qualquer coisa pode ter ocupado a saida nesse meio tempo.
        this.deliverTo ??= this.pickDeliverTile(port);
        if (!this.deliverTo) {
          // ENTUPIDO: a peca fica visivel na BOCA, quicando, ate haver onde pousar. E uma recusa
          // fisica — o jogador ve o que a maquina esta segurando e por que ela nao larga.
          this.pose(FRAME_LIT);
          this.pulseGlow(0.3, effectsVisible);
          this.holdProduct();
          this.elapsed = 0;
          break;
        }
        const [tx, ty] = this.deliverTo;
        const t = Math.min(1, this.elapsed / DELIVER_MS);
        this.pose(FRAME_LIT);
        this.moveProduct(t, tx, ty);
        this.fadeGlow(deltaMs);
        if (t >= 1) {
          port.put(this.handProduct ?? 'bloom', tx, ty, this.handUnits);
          this.handProduct = null;
          this.handUnits = 1;
          this.deliverTo = null;
          this.smeltCount += 1;
          this.clearFlying();
          if (effectsVisible) {
            port.delivered();
            world3d().shake(70, 0.005);
          }
          this.enter('idle');
        }
        break;
      }
    }
  }

  /**
   * O QUE FALTA, na bandeja em que falta. Chamado todo frame — e essa e a diferenca para a
   * bancada: la o plano e uma ESCOLHA que o jogador prega, aqui ele e a identidade da maquina.
   *
   * Fantasma nunca cobre carga: a bandeja servida mostra a coisa de verdade, e so a vazia respira
   * o desenho do que ela quer. Com as duas servidas nao sobra fantasma nenhum — a maquina ja tem
   * tudo e o proximo frame acende a boca.
   */
  /**
   * O keycap "Z" sobre a alvenaria quando o heroi a encara. E o mesmo da bancada, e por isso ele
   * mora em `placementTexture`: as duas maquinas que RESPONDEM ao A usam o mesmo anuncio, e uma
   * terceira que respondesse teria de usar o mesmo tambem.
   */
  public renderHint(tileSize: number, camera: WorldCamera, show: boolean, timeMs: number): void {
    if (!show) { this.hint?.setVisible(false); return; }
    if (!this.hint) {
      ensurePlacementKeyTexture(this.scene, isTouchDevice());
      this.hint = this.scene.add.image(0, 0, PLACEMENT_KEY_TEXTURE).setOrigin(0.5, 1).setVisible(false);
    }
    const screen = camera.tileToScreen(this.worldX, this.worldY, tileSize);
    const px = Math.max(1, Math.round(tileSize / 24));
    const bob = Math.round(Math.sin(timeMs / 280) * px);
    this.hint.setVisible(true).setScale(px)
      .setPosition(screen.x, screen.y - tileSize - px * 2 + bob);
  }

  /**
   * A FORNADA PEDIDA NO CATALOGO — o Z escolheu, a MAQUINA trabalha.
   *
   * Ela era instantanea: a cena tirava os insumos da mochila, jogava a esponja num tile vizinho e
   * pedia ao forno uma pose de meio segundo. Ou seja, o produto existia ANTES de a boca acender, e
   * o gesto tinha comeco e fim sem meio nenhum. Agora o forno entra no MESMO ciclo da bandeja e o
   * jogador ve a fornada inteira: a carga voa da mao dele para a boca, o fole sopra tres vezes
   * sacudindo a alvenaria, a brasa esguicha e so entao a peca PULA pela frente.
   *
   * Devolve `false` se ele ja esta trabalhando — e ai o catalogo recusa com o tranco de sempre, o
   * que e honesto: a maquina esta ocupada e isso esta na tela, rugindo.
   *
   * `from` e o tile de quem pediu (o heroi): a carga tem de sair de ONDE ela estava, e ela estava
   * na mochila dele. Sem isso, dois itens apareceriam do nada no ar em frente a boca.
   */
  public startHandSmelt(
    product: HeldItemKind,
    units: number,
    inputs: readonly HeldItemKind[],
    from: readonly [number, number],
  ): boolean {
    if (this.phase !== 'idle') return false;
    this.handProduct = product;
    this.handUnits = Math.max(1, units);
    const charge = inputs.slice(0, 2) as HeldItemKind[];
    if (charge.length > 0) {
      // As duas cargas partem do MESMO tile (a mao do heroi) — o desencontro que impede uma de
      // esconder a outra e o atraso que `moveCharge` ja da a segunda, mais meio passo lateral.
      this.spawnCharge(
        charge,
        charge.map((_, i) => [from[0] + (i === 0 ? -0.16 : 0.16), from[1]] as const),
        HAND_ELEV,
      );
    }
    this.enter('smelting');
    this.breathsPlayed = 0;
    this.pendingLit = true;
    this.bump();
    return true;
  }

  /** Quanto dura a fornada corrente: a da mao e mais curta que a da bandeja (ver HAND_CYCLE_MS). */
  private get cycleMs(): number {
    return this.handProduct ? HAND_CYCLE_MS : FURNACE_CYCLE_MS;
  }

  /**
   * ONDE A PECA PRONTA POUSA. A boca da frente, sempre que ela estiver livre — e uma maquina que
   * cospe SEMPRE no mesmo tile e o que permite uma esteira encostar ali e a linha rodar sozinha.
   *
   * A fornada de MAO tem uma segunda chance: com a frente entupida (um item que ja saiu e ninguem
   * apanhou, o proprio heroi parado ali), ela pousa num vizinho livre em vez de esperar. Sem isso,
   * fundir duas vezes seguidas deixaria a segunda peca presa dentro da maquina — que e a queixa
   * "apertei Z e nada aconteceu" outra vez, so que com o item ja pago. A fornada de bandeja NAO
   * ganha essa saida de proposito: espalhar a producao de uma fabrica pelos vizinhos e como se
   * perde uma linha inteira de vista.
   */
  private pickDeliverTile(port: FurnaceWorldPort): readonly [number, number] | null {
    const [ox, oy] = this.outputTile;
    if (!port.occupied(ox, oy)) return [ox, oy];
    if (!this.handProduct) return null;
    return port.landing(this.worldX, this.worldY);
  }

  public bump(): void {
    this.scene.tweens.killTweensOf(this.body);
    this.scene.tweens.add({
      targets: this.body,
      angle: { from: -2, to: 2 },
      duration: 44,
      yoyo: true,
      repeat: 2,
      onComplete: () => this.body.setAngle(0),
    });
  }

  private enter(next: FurnacePhase): void {
    this.phase = next;
    this.elapsed = 0;
  }

  private pose(frame: number): void {
    if (this.frame === frame) return;
    this.frame = frame;
    this.body.setTexture(ASSET_KEYS.furnace, frame);
  }

  private renderSlots(hasA: boolean, hasB: boolean): void {
    const pulse = SLOT_ALPHA_LO + (SLOT_ALPHA_HI - SLOT_ALPHA_LO)
      * (0.5 + 0.5 * Math.sin((this.aliveMs * 2 * Math.PI) / SLOT_PULSE_MS));
    this.slots[0].setTexture(ASSET_KEYS.toolbox, hasA ? 5 : 4).setAlpha(hasA ? 1 : pulse);
    this.slots[1].setTexture(ASSET_KEYS.toolbox, hasB ? 5 : 4).setAlpha(hasB ? 1 : pulse);
  }

  /**
   * A carga voando para a boca. As origens vem de fora (as bandejas, ou a mao do heroi numa
   * fornada de catalogo) e a arte sai de `itemGroundVisual` — a mesma que os fantasmas usam.
   * Duas tabelas de sprite para o mesmo item e como uma delas envelhece errada.
   */
  private spawnCharge(
    kinds: readonly HeldItemKind[],
    origins: readonly (readonly [number, number])[],
    elev = TRAY_ELEV,
  ): void {
    kinds.forEach((kind, i) => {
      const [sx, sy] = origins[i] ?? origins[origins.length - 1];
      this.chargeFrom.push([sx, sy, elev]);
      const visual = itemGroundVisual(kind);
      this.flying.push(world3d()
        .addBillboard(visual.texture, visual.frame, { emissive: true, centered: true })
        .setPosition(sx, sy + DEPTH_ITEM)
        .setElevation(elev)
        .setDisplaySize(ITEM_SIZE, ITEM_SIZE));
    });
  }

  private moveCharge(k: number): void {
    this.flying.forEach((bb, i) => {
      const [sx, sy, se] = this.chargeFrom[i] ?? [this.worldX, this.worldY, TRAY_ELEV];
      const t = Math.max(0, Math.min(1, (k - (i === 0 ? 0 : 0.16)) / (i === 0 ? 1 : 0.84)));
      bb.setPosition(sx + (this.worldX - sx) * t, sy + (this.worldY - sy) * t + DEPTH_ITEM)
        .setElevation(se + (MOUTH_ELEV - se) * t + 0.2 * arc(t))
        .setDisplaySize(ITEM_SIZE * (1 - t * 0.9), ITEM_SIZE * (1 - t * 0.9));
    });
  }

  /** A peca nascendo na boca — esponja na fornada de bandeja, o que o catalogo pediu na da mao. */
  private spawnProduct(kind: HeldItemKind): void {
    const visual = itemGroundVisual(kind);
    this.flying.push(world3d()
      .addBillboard(visual.texture, visual.frame, { emissive: true, centered: true })
      .setPosition(this.worldX, this.worldY + DEPTH_ITEM)
      .setElevation(MOUTH_ELEV)
      .setDisplaySize(0.02, 0.02));
  }

  private holdProduct(): void {
    const bb = this.flying[0];
    if (!bb) return;
    bb.setPosition(this.worldX, this.worldY + DEPTH_ITEM)
      .setElevation(MOUTH_ELEV + Math.sin(this.aliveMs * 0.004) * 0.03)
      .setDisplaySize(ITEM_SIZE, ITEM_SIZE);
  }

  private moveProduct(t: number, ox: number, oy: number): void {
    const bb = this.flying[0];
    if (!bb) return;
    const born = Math.min(1, t / 0.25);
    const fly = Math.max(0, (t - 0.2) / 0.8);
    bb.setPosition(
      this.worldX + (ox - this.worldX) * ease(fly),
      this.worldY + (oy - this.worldY) * ease(fly) + DEPTH_ITEM * (1 - fly),
    )
      .setElevation(MOUTH_ELEV + 0.26 * arc(fly) - (MOUTH_ELEV - 0.1) * fly)
      .setDisplaySize(ITEM_SIZE * born, ITEM_SIZE * born);
  }

  private clearFlying(): void {
    for (const bb of this.flying) bb.destroy();
    this.flying.length = 0;
    this.chargeFrom.length = 0;
  }

  private pulseGlow(strength: number, effectsVisible: boolean): void {
    if (!effectsVisible) { this.glow?.setAlpha(0); return; }
    if (!this.glow) {
      this.glow = world3d()
        .addBillboard(FX_DOT_TEXTURE, 0, {
          centered: true, additive: true, fog: false, depthWrite: false,
        })
        .setTint(EMBER)
        .setPosition(this.worldX, this.worldY + 0.03)
        .setElevation(MOUTH_ELEV);
    }
    const flicker = 0.8 + 0.2 * Math.sin(this.aliveMs * 0.019);
    this.glow
      .setAlpha(Math.min(0.9, strength * flicker))
      .setDisplaySize(0.8 * strength + 0.25, 0.5 * strength + 0.2);
  }

  private fadeGlow(deltaMs: number): void {
    if (!this.glow) return;
    const next = this.glow.alpha - deltaMs / 300;
    if (next <= 0) { this.glow.destroy(); this.glow = undefined; return; }
    this.glow.setAlpha(next);
  }

  /**
   * A brasa subindo. `from` e a altura de onde ela sai: o sopro do fole sobe pela CHAMINE (0,9,
   * acima da alvenaria) e o esguicho da entrega sai pela BOCA (a mesma altura da peca), porque as
   * duas coisas contam eventos diferentes — uma e a maquina respirando, a outra e a peca nascendo.
   */
  private spawnSparks(count: number, from = 0.9): void {
    for (let i = 0; i < count; i += 1) {
      const spark = world3d()
        .addBillboard(FX_DOT_TEXTURE, 0, {
          centered: true, additive: true, emissive: true, fog: false, depthWrite: false,
        })
        .setTint(i % 2 === 0 ? EMBER_HOT : EMBER)
        .setPosition(this.worldX + (Math.random() - 0.5) * 0.25, this.worldY + DEPTH_ITEM)
        .setElevation(from)
        .setDisplaySize(0.05, 0.05);
      this.sparks.add(spark);
      this.scene.tweens.add({
        targets: spark,
        elevation: from + 0.45 + Math.random() * 0.25,
        alpha: 0,
        duration: 620 + i * 90,
        ease: 'Quad.easeOut',
        onComplete: () => { this.sparks.delete(spark); spark.destroy(); },
      });
    }
  }

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.body);
    this.body.destroy();
    for (const slot of this.slots) slot.destroy();
    this.hint?.destroy();
    this.hint = undefined;
    this.clearFlying();
    this.glow?.destroy();
    this.glow = undefined;
    for (const spark of this.sparks) {
      this.scene.tweens.killTweensOf(spark);
      spark.destroy();
    }
    this.sparks.clear();
  }
}

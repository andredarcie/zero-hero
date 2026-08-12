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
import { planGhosts } from './toolboxRecipes';
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

// ── O QUE ELE PRECISA, DESENHADO ──────────────────────────────────────────────────────────────
// A bancada precisou de um catalogo porque ela sabe fazer onze coisas e o jogador tem de ESCOLHER.
// O forno sabe fazer UMA. Nao ha o que escolher — entao o plano dele nao se prega: ele e
// permanente, e a maquina simplesmente mostra o tempo todo o que falta em cada bandeja.
//
// E o mesmo vocabulario da encomenda (fantasma na bandeja em que a coisa vai, contorno vazio =
// ainda nao esta aqui), e de proposito: o jogador aprendeu isso na bancada e reencontra aqui sem
// nada novo para decorar.
const GHOST_ELEV = 0.17;
const GHOST_SIZE = 0.46;
const GHOST_ALPHA_LO = 0.34;
const GHOST_ALPHA_HI = 0.72;
/** As opcoes do quad de fantasma — ver ToolboxObject: `alphaTest` baixo, ou o quad some inteiro. */
const GHOST_OPTS = {
  centered: true, emissive: true, fog: false, depthWrite: false, alphaTest: 0.02,
  emissiveBoost: 1.35,
} as const;
/** A receita, e ela e a peca inteira: materia + REAGENTE. */
const NEEDS: readonly [HeldItemKind, HeldItemKind] = ['ore', 'charcoal'];

const SLOT_PULSE_MS = 1150;
const SLOT_ALPHA_LO = 0.38;
const SLOT_ALPHA_HI = 0.92;
const DEPTH_ITEM = 0.05;
const ITEM_SIZE = 0.5;

export type FurnaceWorldPort = {
  kindAt(x: number, y: number): HeldItemKind | null;
  take(x: number, y: number): HeldItemKind | null;
  put(kind: HeldItemKind, x: number, y: number): void;
  occupied(x: number, y: number): boolean;
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
/** Quanto tempo a boca fica acesa numa fornada FEITA A MAO (pelo catalogo, sem bandeja). */
const HAND_SMELT_MS = 520;

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
  /** Os fantasmas do que falta, um por bandeja. Preguicosos: nascem no primeiro frame visivel. */
  private ghosts: [Billboard3D | null, Billboard3D | null] = [null, null];
  /** O ultimo pedido calculado, por bandeja. Publicado em `needsGhosts`. */
  private asking: [HeldItemKind | null, HeldItemKind | null] = [null, null];
  /** O keycap "Z" que anuncia que esta maquina responde ao A. */
  private hint?: Phaser.GameObjects.Image;

  /** Quantas fornadas ele fez. Publico: e o que o playtest observa da peca. */
  public smeltCount = 0;
  /** O resto da pose de fornada-a-mao. Zero = boca fria. */
  private handSmeltMs = 0;

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
  /** O que os fantasmas estao pedindo agora, por bandeja — o que o playtest observa do pedido. */
  public get needsGhosts(): readonly [HeldItemKind | null, HeldItemKind | null] { return this.asking; }
  public get currentPhase(): FurnacePhase { return this.phase; }
  public get currentFrame(): number { return this.frame; }

  /**
   * A EQUACAO: um minerio e um carvao, em qualquer ordem. Exigir "o carvao na bandeja de tras"
   * seria uma regra invisivel — o mesmo pecado que a bancada ja recusa.
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
    // So com a boca fria: um forno rugindo nao esta pedindo nada, esta trabalhando.
    this.renderNeeds(this.phase === 'idle' ? [inA, inB] : [inA, inB], effectsVisible);

    switch (this.phase) {
      case 'idle': {
        // A FORNADA DA MAO: o A na frente dele gasta minerio e carvao da mochila e joga a esponja
        // no chao, como a bancada faz. O que o jogador precisa VER disso e a boca acesa — sem esta
        // pose o gesto seria um item aparecendo no chao ao lado de uma maquina apagada, que e a
        // mesma queixa que derrubou a entrega direto na mochila ("a mesa martelava para ninguem").
        if (this.handSmeltMs > 0) {
          this.handSmeltMs = Math.max(0, this.handSmeltMs - deltaMs);
          this.pose(FRAME_LIT);
          this.pulseGlow(0.5 + 0.5 * arc(1 - this.handSmeltMs / HAND_SMELT_MS), effectsVisible);
          break;
        }
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
        this.spawnCharge([takenA, takenB]);
        this.enter('smelting');
        this.breathsPlayed = 0;
        if (effectsVisible) port.lit();
        break;
      }

      case 'smelting': {
        const t = Math.min(1, this.elapsed / FURNACE_CYCLE_MS);
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
          }
        }
        if (t >= 1) {
          this.clearFlying();
          this.enter('deliver');
          this.spawnBloom();
        }
        break;
      }

      case 'deliver': {
        // A pergunta se refaz aqui: quatro segundos se passaram desde a checagem do idle, e
        // qualquer coisa pode ter ocupado a saida nesse meio tempo.
        if (port.occupied(ox, oy)) {
          this.pose(FRAME_LIT);
          this.pulseGlow(0.3, effectsVisible);
          this.holdBloom();
          this.elapsed = 0;
          break;
        }
        const t = Math.min(1, this.elapsed / DELIVER_MS);
        this.pose(FRAME_LIT);
        this.moveBloom(t);
        this.fadeGlow(deltaMs);
        if (t >= 1) {
          port.put('bloom', ox, oy);
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
  private renderNeeds(trays: readonly [HeldItemKind | null, HeldItemKind | null], visible: boolean): void {
    // Trabalhando, ela nao pede nada: quem esta com a boca acesa ja recebeu.
    if (this.phase !== 'idle') {
      for (const g of this.ghosts) g?.setVisible(false);
      this.asking = [null, null];
      return;
    }
    const wanted = planGhosts(NEEDS, trays);
    this.asking = wanted;
    const breath = 0.5 + 0.5 * Math.sin((this.aliveMs * 2 * Math.PI) / SLOT_PULSE_MS);
    const alpha = GHOST_ALPHA_LO + (GHOST_ALPHA_HI - GHOST_ALPHA_LO) * breath;

    for (let i = 0; i < 2; i += 1) {
      const kind = wanted[i];
      if (!kind) { this.ghosts[i]?.setVisible(false); continue; }
      const [gx, gy] = this.slotTiles[i];
      const visual = itemGroundVisual(kind);
      const bb = this.ghosts[i] ?? this.growGhost(i, visual);
      bb.setTexture(visual.texture, visual.frame)
        .setPosition(gx, gy + DEPTH_ITEM)
        .setElevation(GHOST_ELEV + breath * 0.05)
        .setDisplaySize(GHOST_SIZE, GHOST_SIZE)
        .setAlpha(visible ? Math.min(0.95, alpha) : 0)
        .setVisible(true);
    }
  }

  private growGhost(index: number, visual: { texture: string; frame: number }): Billboard3D {
    this.ghosts[index] = world3d().addBillboard(visual.texture, visual.frame, GHOST_OPTS);
    return this.ghosts[index]!;
  }

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
   * A FORNADA PELO CATALOGO — a boca acende, o corpo balanca, e quem entrega a esponja e a cena
   * (ela cai no chao ao lado, como tudo que sai de uma maquina de fabricar). O nome e `playCraft`
   * e nao `playSmelt` de proposito: a `GameScene` chama isto na bancada e no forno pela MESMA
   * linha, e um nome por peca faria o codigo de fabricar se bifurcar por causa de vocabulario.
   */
  public playCraft(): void {
    this.handSmeltMs = HAND_SMELT_MS;
    this.smeltCount += 1;
    this.bump();
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

  private spawnCharge(kinds: readonly [HeldItemKind, HeldItemKind]): void {
    kinds.forEach((kind, i) => {
      const [sx, sy] = this.slotTiles[i];
      const visual = kind === 'charcoal'
        ? { texture: 'charcoal-item', frame: 0 }
        : { texture: 'ore-item', frame: 0 };
      this.flying.push(world3d()
        .addBillboard(visual.texture, visual.frame, { emissive: true, centered: true })
        .setPosition(sx, sy + DEPTH_ITEM)
        .setElevation(0.14)
        .setDisplaySize(ITEM_SIZE, ITEM_SIZE));
    });
  }

  private moveCharge(k: number): void {
    this.flying.forEach((bb, i) => {
      const [sx, sy] = this.slotTiles[i];
      const t = Math.max(0, Math.min(1, (k - (i === 0 ? 0 : 0.16)) / (i === 0 ? 1 : 0.84)));
      bb.setPosition(sx + (this.worldX - sx) * t, sy + (this.worldY - sy) * t + DEPTH_ITEM)
        .setElevation(0.14 + (MOUTH_ELEV - 0.14) * t + 0.2 * arc(t))
        .setDisplaySize(ITEM_SIZE * (1 - t * 0.9), ITEM_SIZE * (1 - t * 0.9));
    });
  }

  private spawnBloom(): void {
    this.flying.push(world3d()
      .addBillboard('bloom-item', 0, { emissive: true, centered: true })
      .setPosition(this.worldX, this.worldY + DEPTH_ITEM)
      .setElevation(MOUTH_ELEV)
      .setDisplaySize(0.02, 0.02));
  }

  private holdBloom(): void {
    const bb = this.flying[0];
    if (!bb) return;
    bb.setPosition(this.worldX, this.worldY + DEPTH_ITEM)
      .setElevation(MOUTH_ELEV + Math.sin(this.aliveMs * 0.004) * 0.03)
      .setDisplaySize(ITEM_SIZE, ITEM_SIZE);
  }

  private moveBloom(t: number): void {
    const bb = this.flying[0];
    if (!bb) return;
    const [ox, oy] = this.outputTile;
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

  private spawnSparks(count: number): void {
    for (let i = 0; i < count; i += 1) {
      const spark = world3d()
        .addBillboard(FX_DOT_TEXTURE, 0, {
          centered: true, additive: true, emissive: true, fog: false, depthWrite: false,
        })
        .setTint(i % 2 === 0 ? EMBER_HOT : EMBER)
        .setPosition(this.worldX + (Math.random() - 0.5) * 0.25, this.worldY + DEPTH_ITEM)
        .setElevation(0.9)
        .setDisplaySize(0.05, 0.05);
      this.sparks.add(spark);
      this.scene.tweens.add({
        targets: spark,
        elevation: 1.35 + Math.random() * 0.25,
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
    for (let i = 0; i < this.ghosts.length; i += 1) { this.ghosts[i]?.destroy(); this.ghosts[i] = null; }
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

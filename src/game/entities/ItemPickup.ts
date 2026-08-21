import type Phaser from 'phaser';

import { BOMB_FRAMES, ITEM_FRAMES, KEY_FRAMES } from '@/game/constants';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { FX_DOT_TEXTURE, world3d } from '@/game/render3d/World3D';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

// Every carriable item — tudo que a MOCHILA guarda. A espada NAO esta aqui como coisa que se
// carrega: ela e do heroi (ver GameScene.swordEquipped) e o tipo so a mantem porque mundos
// antigos ainda a citam. Quem tem gesto vai pra bolsa; o resto e contador (MATERIAL_ITEM_KINDS).
export type HeldItemKind =
  // ── A CADEIA DO FERRO, na ordem em que a quimica manda ────────────────────────────────────
  // `ore` -> (forno + carvao) -> `bloom` -> (martelo) -> `iron`. Os tres sao itens separados
  // porque as tres coisas SAO separadas no mundo real: minerio e oxido preso em pedra, a esponja
  // e ferro poroso encharcado de escoria, e so a barra e metal utilizavel. Um jogo que chama os
  // tres de "ferro" perde a unica etapa que explica por que forno e carvao existem.
  | 'ore'
  | 'bloom'
  | 'sword'
  | 'key'
  | 'axe'
  // The STEEL axe. The plain axe only bites dead wood (dryTree, dryShrub); this one fells any
  // tree in the game, including the living pines that make up most of the forest — and those
  // are terrain tiles, not props, so this is the only item that edits the map itself.
  | 'greatAxe'
  | 'bomb'
  | 'pickaxe'
  | 'scythe'
  // A PÁ — a ferramenta que CAVA um buraco de plantio (plantSpot) no chão de TERRA vazio à
  // frente (DIGGABLE_GROUND_FRAMES). Fecha o loop da fazenda pelo lado que faltava: a foice
  // produz a semente, mas o buraco era autorado — só o editor plantava mato novo em lugar
  // novo. Com ela o canteiro vira decisão do jogador: cavar É produzir (um tile que aceita
  // semente), e por isso ela não é senha. Cavar é o botão X (o botão que USA o item selecionado
  // — ver GameScene.pressUse); apanhá-la é pisar nela, como em qualquer item. Terra apenas:
  // pátio de pedra, laje, alvenaria de dungeon e mar recusam a lâmina.
  | 'shovel'
  | 'wood'
  // A chunk of rock, left behind when the pickaxe shatters one. The pickaxe used to just
  // DELETE its obstacle — the only thing it produced was passage, which makes it a password
  // and not a tool. Now it produces MATTER, and that matter is the wood stick's opposite:
  // both cross a river, but a plank deck burns (and carries fire across) while a stone ford
  // never will. So every crossing becomes a question — do I want a floor, or a fuse?
  | 'stone'
  // O BLOCO DE FERRO — o segundo material bruto do jogo, e o primeiro que nao serve pra nada
  // sozinho. A pedra fica de pe num vau e apaga lava; o graveto vira ponte e carrega fogo; o
  // ferro NAO tem uso proprio: ele e materia-prima das receitas manuais da bancada. Sai de uma
  // `ironRock`, que e a mesma pedra da picareta com veio de minerio dentro.
  | 'iron'
  // O PACOTE DE SEMENTES CARNÍVORAS — o punhado que brota a planta-armadilha
  // (CarnivorousPlantObject): plantado num canteiro e regado, vira a barreira que COME todo
  // inimigo que parar ao lado dela. O mesmo ciclo da semente comum (buraco, água, foice,
  // fogo) com a colheita invertida: o mato produz combustível; a carnívora produz DEFESA.
  | 'carnivoreSeeds'
  // A handful of SEEDS ("sementes"), cut from tall grass with the scythe. The grass made
  // renewable and PORTABLE: planted in a dug hole (plantSpot), watered with the bucket, it
  // sprouts REAL tall grass — the first fire conductor the player grows, not one baked into
  // the map. Cutting the grown grass yields seeds again: a farming loop, and what turns the
  // scythe from a password (grass -> nothing) into a producer.
  | 'seeds'
  // An EMPTY bucket, and the same bucket once FILLED at the river. The counter to the whole fire
  // system: dip it in a river to fill it, then pour it on any lit campfire to put it out — one
  // use, then go back for more water. The one deliberate way to UNDO fire (the scythe only ever
  // pre-empts fuel). Empty vs full shows as the art the hero carries; there is no HUD.
  | 'bucket'
  | 'bucketFull'
  // A lump of CHARCOAL — the fire itself finally PRODUCING: every burnt-out dry bush leaves one
  // (o sorteio morreu, ver GameScene.dropCharcoalFromBush). It is torch food: stepping on it while holding the LIT
  // graveto consumes it and refills the flame, which makes a long dark crossing plannable
  // instead of a prayer for lava. Runtime-only, like bucketFull — never authored in a world.
  | 'charcoal'
  // As duas estações manuais podem ser fabricadas, instaladas e recolhidas pelo jogador.
  | 'furnace'
  | 'altar';

// The fire riding a wood item that is NOT in the hero's hand. Only `fuelMs` travels, so a lit
// graveto on the ground keeps burning until it dies or is collected again.
export type ItemFire = { fuelMs: number };

// How each held item looks lying on the ground (textures3d keys). Tools without a dedicated
// map sprite reuse their held-item icon — same 16x16 pixel-art scale.
const GROUND_VISUAL: Record<HeldItemKind, { texture: string; frame: number }> = {
  sword: { texture: 'sword-item', frame: ITEM_FRAMES.swordIdle },
  key: { texture: 'key-item', frame: KEY_FRAMES.pickup },
  axe: { texture: 'axe-icon', frame: 0 },
  greatAxe: { texture: 'great-axe-icon', frame: 0 },
  bomb: { texture: 'bomb-item', frame: BOMB_FRAMES.item },
  pickaxe: { texture: 'pickaxe-icon', frame: 0 },
  scythe: { texture: 'scythe-icon', frame: 0 },
  shovel: { texture: 'shovel-icon', frame: 0 },
  // The "graveto": a single stick (the woodIcon art), NOT the 3-log woodItem pile.
  wood: { texture: 'wood-icon', frame: 0 },
  stone: { texture: 'rock', frame: 0 },
  iron: { texture: 'iron-item', frame: 0 },
  ore: { texture: 'ore-item', frame: 0 },
  bloom: { texture: 'bloom-item', frame: 0 },
  // The seeds sprite comes from the sprite factory (spritefactory/sprites/seeds.mjs).
  seeds: { texture: 'seeds-item', frame: 0 },
  carnivoreSeeds: { texture: 'carnivore-seeds', frame: 0 },
  // The bucket art is generated at boot (bucketTexture.ts) into both pipelines.
  bucket: { texture: 'bucket-icon', frame: 0 },
  bucketFull: { texture: 'bucket-full-icon', frame: 0 },
  // Generated at boot too (charcoalTexture.ts) — the same procedural-pixel-art path.
  charcoal: { texture: 'charcoal-item', frame: 0 },
  furnace: { texture: 'furnace', frame: 0 },
  altar: { texture: 'altar', frame: 0 },
};

/**
 * As ESTACOES MANUAIS que se carregam. Uma lista so, lida pela instalacao (o botao X), pelo editor e
 * pela subtela — porque a lei "uma lista, tres leitores" ja custou uma tarde neste jogo quando
 * `FLYING_ENEMY_KINDS` existia em tres copias que discordavam.
 */
export const MACHINE_ITEM_KINDS: ReadonlySet<HeldItemKind> = new Set<HeldItemKind>(['furnace', 'altar']);

/**
 * A MATERIA-PRIMA — o que NAO ocupa lugar na bolsa.
 *
 * A bolsa e a lista do botao X, e o X faz uma coisa so: usar o que esta selecionado contra o
 * tile a frente. Entao o que entra nela precisa ter um GESTO — bater, cavar, encher, instalar,
 * pousar. Minerio, ferro e carvao nao tem nenhum: eles sao numeros que entram numa
 * receita e saem dela. Enquanto dividiam a fileira com as ferramentas, o polegar do jogador
 * atravessava quatro coisas inertes para chegar na picareta — e cada uma delas, selecionada,
 * fazia o botao X nao responder. Um item que so pode calar um botao nao pertence ao botao.
 *
 * Eles continuam INTEIROS na mochila (`Inventory`): as receitas da bancada e do forno gastam
 * deles. O que muda e onde sao MOSTRADOS —
 * uma fileira de contadores debaixo da bolsa, informativa, sem cursor e sem seleção.
 *
 * A `bloom` ficou de fora desta lista de proposito, e ela e a fronteira que explica a regra: a
 * esponja tem gesto (o X a POUSA para ser martelada, ou a entrega na bigorna). Ela e peca de
 * trabalho, nao numero.
 */
export const MATERIAL_ITEM_KINDS: ReadonlySet<HeldItemKind> = new Set<HeldItemKind>(['ore', 'iron', 'charcoal']);

/**
 * O que pode ser SELECIONADO na bolsa. A espada saiu da mochila (ela e do heroi, e mora no
 * botao Z), entao ela nunca e resposta desta pergunta — nem sequer chega a existir como item.
 */
export const isBagItem = (kind: HeldItemKind): boolean =>
  kind !== 'sword' && !MATERIAL_ITEM_KINDS.has(kind);

/**
 * Como um item se desenha quando esta no chao, compartilhado pelas interfaces que mostram itens.
 */
export const itemGroundVisual = (kind: HeldItemKind): { texture: string; frame: number } =>
  GROUND_VISUAL[kind];

const GROUND_SIZE = 0.7; // tiles
const BOB_TILES = 0.09;

// A chama cavalgando um graveto ACESO fora da mao: os mesmos frames tiny-fire dos arbustos,
// animados em render(). As opcoes do billboard sao IDENTICAS as da chama da tocha
// (GameScene.torchFlameBb) de proposito — mesmo shape de material, mesmo programa ja compilado
// pelo prewarmShaders, entao a primeira chama no chao nao custa um hitch de compilacao.
const FLAME_FRAME_MS = 110;
const FLAME_KEYS = ['tiny-fire-0', 'tiny-fire-1', 'tiny-fire-2'] as const;

// O calor da ESPONJA no chao: laranja de brasa, o mesmo tom da rampa `ember` que o sprite dela ja
// usa nas frestas. Ele PULSA devagar — um brilho parado leria como aura magica, e um que respira
// le como metal esfriando.
const BLOOM_HEAT = 0xe7462a;
const BLOOM_PULSE_MS = 1450;
const FLAME_ELEV = 0.5; // lambe a ponta do graveto em pe (arte de 0.7 tile)

// Fixed purple outline around every ground pickup — the hero's own indigo cloak, brightened
// until it reads at night — so collectibles pop against the world at a glance. Same trick as
// the hero's low-health outline: 8 solid-tinted copies of the item art offset one step around
// it. The offsets live in the (worldX, elevation) plane — the billboard's screen plane — and
// every copy is pushed a hair AWAY from the camera in worldY so the real art draws on top.
// (That last nudge is the same idea the whole renderer now states as DEPTH_LAYER — this is
// just the *inner* order, between the item and its own rim, inside the ground layer.)
const OUTLINE_COLOR = 0x9d7bff;
const OUTLINE_OFFSET_TILES = 0.05; // ≈1 art pixel at 16px-per-0.7-tile
const OUTLINE_BEHIND_TILES = 0.02;
const OUTLINE_DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1],
];

// A single held item sitting on the ground — authored in world.json, or put there by the world
// (a felled tree's stick, the bench's finished piece, the furnace's bloom). It bobs while it
// waits, and PISAR NELE O APANHA: o gesto voltou a ser a pisada quando o botao X virou "usar o
// item selecionado" e o largar deixou de existir (ver GameScene.collectUnderfoot). Sem largar,
// apanhar sem querer nao custa nada — que e o defeito que o flag `armed` existia para remendar.
export class ItemPickup {
  private readonly sprite: Billboard3D;
  private readonly outline: Billboard3D[];
  private collectable = false;
  private collected = false;
  private flame?: Billboard3D;
  /** O calor da esponja vazando no chao (so `bloom` tem). */
  private heatGlow?: Billboard3D;
  private fireState?: ItemFire;
  /**
   * Quantas UNIDADES este item no chão vale ao ser apanhado (o pacote de sementes: 5 recém-
   * colhido, ou o punhado exato que o herói pousou). Todo outro item vale 1. Viaja com o item
   * sem mudar de tamanho quando troca de mãos.
   */
  public readonly units: number;

  public constructor(
    private readonly scene: Phaser.Scene,
    public readonly kind: HeldItemKind,
    public readonly tileX: number,
    public readonly tileY: number,
    dropped = false,
    fire?: ItemFire,
    units = 1,
  ) {
    this.units = Math.max(1, Math.floor(units));
    const visual = GROUND_VISUAL[kind];
    // Full-bright: pickups must read even in the dark (the 2D game punched a
    // small light hole over every collectible for the same reason).
    //
    // GROUND layer, always: an item lies on a tile the hero WALKS ONTO — that is the whole
    // interaction — so the two quads share a spot constantly. Without a declared layer they are
    // coplanar and the item strobes under his feet (see DEPTH_LAYER). This one option is what
    // makes every collectible in the game safe, not each item kind remembering on its own.
    this.sprite = world3d()
      .addBillboard(visual.texture, visual.frame, { emissive: true, depthLayer: 'ground' })
      .setPosition(tileX, tileY)
      .setDisplaySize(GROUND_SIZE, GROUND_SIZE);

    // The purple rim: emissive like the item itself, so it also survives the dark.
    // Alpha/elevation are mirrored from the sprite every render (fade-in + bob).
    this.outline = OUTLINE_DIRS.map(([ox]) => world3d()
      .addBillboard(visual.texture, visual.frame, { emissive: true, depthLayer: 'ground' })
      .setTintFill(OUTLINE_COLOR)
      .setPosition(tileX + ox * OUTLINE_OFFSET_TILES, tileY - OUTLINE_BEHIND_TILES)
      .setDisplaySize(GROUND_SIZE, GROUND_SIZE)
      .setAlpha(0));

    // Fade in via alpha only — render owns the bob each frame, so a scale tween would just be
    // clobbered.
    this.sprite.setAlpha(0);
    scene.tweens.add({
      targets: this.sprite,
      alpha: 1,
      duration: dropped ? 200 : 250,
      onComplete: () => { this.collectable = true; },
    });
    if (dropped) this.collectable = true;

    // So o graveto carrega fogo — o mesmo contrato da mao do heroi (isFlammableHeld). A chama
    // fica um fio a frente do item (tileY - 0.02) pelo mesmo motivo do aro ficar atras: dois
    // billboards no mesmo tile sao coplanares e estrobam onde se sobrepoem (DEPTH_LAYER).
    if (fire && kind === 'wood' && fire.fuelMs > 0) {
      this.fireState = { fuelMs: fire.fuelMs };
      this.flame = world3d()
        .addBillboard(FLAME_KEYS[0], 0, { emissive: true, emissiveBoost: 4 })
        .setPosition(tileX, tileY - 0.02)
        .setDisplaySize(0.3, 0.42);
    }

    // A ESPONJA BRILHA NO CHAO, e ela e o unico item alem do graveto aceso que faz isso.
    //
    // Nao e enfeite: e a unica coisa no jogo cuja IDENTIDADE e estar quente, e no chao ela
    // desaparecia. Todo colecionavel ganha um aro roxo para ler no escuro (ver ITEM_RIM), e sobre
    // um sprite cinza-com-fresta-vermelha esse aro vence — a peca virava um borrao roxo que
    // ninguem reconhece. O jogador procurou as esponjas no mapa e nao as achou; estavam a tres
    // tiles dele.
    //
    // A resposta e a mesma do resto do jogo: um quad ADDITIVE, nunca uma luz THREE (a contagem de
    // luzes deste renderer nao muda em tempo de execucao). Ele fica ATRAS do item (tileY + 0.02,
    // ao contrario da chama do graveto) para o calor vazar por baixo e em volta da massa em vez de
    // pintar por cima dela — o que se ve e um bolo escuro com brasa escapando, que e o que sai de
    // uma forja.
    if (kind === 'bloom') {
      this.heatGlow = world3d()
        .addBillboard(FX_DOT_TEXTURE, 0, {
          centered: true, additive: true, fog: false, depthWrite: false,
        })
        .setTint(BLOOM_HEAT)
        .setPosition(tileX, tileY + 0.02)
        .setElevation(0.24)
        .setDisplaySize(0.62, 0.44)
        .setAlpha(0.55);
    }
  }

  public get isCollectable(): boolean { return this.collectable; }
  public get isCollected(): boolean { return this.collected; }

  /** O fogo montado neste item (so um graveto aceso tem), ou undefined. */
  public get fire(): ItemFire | undefined { return this.fireState; }

  /** O combustivel queima tambem no chao; a chama morre sozinha quando ele acaba. */
  public tickFire(deltaMs: number): void {
    if (!this.fireState || this.collected) return;
    this.fireState.fuelMs -= deltaMs;
    if (this.fireState.fuelMs <= 0) {
      this.fireState = undefined;
      this.flame?.destroy();
    this.heatGlow?.destroy();
      this.heatGlow?.destroy();
      this.flame = undefined;
    }
  }

  /** Mark collected — the fly-to-the-hero collect visual is spawned separately by the scene. */
  public collect(): void {
    this.collected = true;
    this.collectable = false;
    this.sprite.setVisible(false);
    this.flame?.setVisible(false);
    this.heatGlow?.setVisible(false);
    for (const copy of this.outline) copy.setVisible(false);
  }

  public render(_tileSize: number, _camera: WorldCamera): void {
    if (this.collected) return;
    const bob = this.collectable
      ? (Math.sin(this.scene.time.now * 0.0045) + 1) * 0.5 * BOB_TILES
      : 0;
    this.sprite.setElevation(bob);
    // The rim rides the bob and the fade-in with the item. Downward copies clamp at the
    // ground so the bottom edge never sinks under the terrain plane and gets clipped.
    const alpha = this.sprite.alpha;
    for (let i = 0; i < this.outline.length; i++) {
      this.outline[i]
        .setElevation(Math.max(0, bob + OUTLINE_DIRS[i][1] * OUTLINE_OFFSET_TILES))
        .setAlpha(alpha);
    }
    // O calor da esponja cavalga o bob e PULSA: metal esfriando respira, aura magica nao.
    if (this.heatGlow) {
      const pulse = 0.5 + 0.5 * Math.sin((this.scene.time.now * 2 * Math.PI) / BLOOM_PULSE_MS);
      this.heatGlow
        .setElevation(0.24 + bob)
        .setAlpha(alpha * (0.4 + 0.28 * pulse))
        .setDisplaySize(0.56 + 0.12 * pulse, 0.4 + 0.09 * pulse);
    }
    // A chama cavalga o bob e o fade-in junto com o item, ciclando os frames do tiny-fire.
    if (this.flame) {
      const step = Math.floor(this.scene.time.now / FLAME_FRAME_MS);
      this.flame
        .setTexture(FLAME_KEYS[step % FLAME_KEYS.length])
        .setElevation(FLAME_ELEV + bob)
        .setAlpha(alpha);
    }
  }

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
    this.flame?.destroy();
    for (const copy of this.outline) copy.destroy();
  }
}

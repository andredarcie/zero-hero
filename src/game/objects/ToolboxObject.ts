import type Phaser from 'phaser';

import { ASSET_KEYS, TOOLBOX_FRAMES } from '@/game/constants';
import { itemGroundVisual, type HeldItemKind } from '@/game/entities/ItemPickup';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { FX_DOT_TEXTURE, world3d } from '@/game/render3d/World3D';
import { PLACEMENT_KEY_TEXTURE, ensurePlacementKeyTexture } from '@/game/render3d/placementTexture';
import { isTouchDevice } from '@/game/runtime/PauseMenu';
import type { WorldCamera } from '@/game/runtime/WorldCamera';
import type { PropDir } from '@/game/world/worldSchema';
import { toolboxRecipeFor } from './toolboxRecipes';
import type { WorldProp } from './WorldProp';

// A CAIXA DE FERRAMENTAS — a primeira coisa do jogo que faz um item A PARTIR DE OUTROS.
//
//     (item A) (item B) [CAIXA] (resultado)
//
// Duas bandejas atras, a maquina, e o tile de saida na frente. Larga um item em cada bandeja e,
// se os dois formarem uma RECEITA, a caixa os come e cospe um terceiro item adiante. A primeira
// receita e a que explica a peca inteira: graveto + pedra = machado.
//
// ── Por que ela merece existir ────────────────────────────────────────────────────────────────
// A regra do projeto e "itens PRODUZEM, nao so somem": um martelo cujo unico produto e passagem
// e uma senha, nao uma ferramenta. Ate agora tudo que o jogo PRODUZ sai de um prop que o heroi
// bate com a ferramenta certa — a arvore da graveto, a pedra da pedra, o mato da semente. A
// caixa inverte a fonte: aqui o insumo sao os ITENS, e o mundo nao entra na conta. E o unico
// lugar em que a resposta a "nao tenho o machado" pode ser "entao faz um".
//
// E isso muda a economia de um level: um machado deixa de ser um pickup que o autor esconde e
// passa a ser um par de coisas que o jogador tem de JUNTAR num ponto especifico do mapa — o que
// da um destino para gravetos e pedras, que ate aqui eram sempre consumo local.
//
// ── O gesto e ANDAR, como todo o resto ───────────────────────────────────────────────────────
// O jogo nao tem botao de largar item: o heroi so pousa o que carrega TROCANDO por outro item ja
// no chao. Entao as bandejas herdam a regra que ja fazia o braco robotico ser alimentavel —
// pisar numa delas segurando qualquer coisa DEPOSITA a carga ali (GameScene.handleTileEntered).
// A bandeja desenhada no chao, respirando enquanto esta vazia, e o convite: a mesma gramatica da
// bomba-fantasma no bombSpot. Um affordance e uma coisa viva, nao uma fotografia.
//
// Consequencia de graca: quem alimenta a bandeja pode ser um BRACO ROBOTICO. A saida de um braco
// e a bandeja da caixa e a fabrica anda sozinha — nenhuma linha de codigo foi escrita pra isso,
// as duas pecas so falam a mesma lingua (itens no chao).
//
// ── A recusa e FISICA, nunca uma legenda ─────────────────────────────────────────────────────
// O jogo arrancou o balao de item-que-falta: uma trava responde com tremor, nunca com um texto
// dizendo o que buscar. Aqui vale igual — dois itens que nao combinam fazem a tampa dar um pulo
// e bater de volta, com um ruido seco de ferro, de tempos em tempos. O jogador ve a maquina
// TENTAR e desistir; ela nao diz o que falta. Se a unica forma de descobrir a receita fosse uma
// legenda, o problema seria a receita, nao a falta do texto.

// N, L, S, O — worldY cresce pra BAIXO (sul), a mesma tabela do braco robotico.
const DIR_VEC: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];

// A mesma correcao de brilho que a pedra e o braco levam: a rampa `stone` da arte e clara, e sem
// esse desconto o bloom transforma a maquina num borrao branco a noite.
const METAL_TINT = 0xd2d2d2;

/**
 * O livro de receitas mora em `toolboxRecipes.ts` — ele tem TRES leitores agora (a maquina, o
 * catalogo da encomenda e a pagina de planos da subtela), e a ORDEM DAS BANDEJAS continua nao
 * importando: exigir "o graveto na de tras" seria uma regra invisivel, e regra invisivel neste
 * jogo e o mesmo pecado do balao de dica.
 */
export type { ToolboxRecipe, ToolboxFamily, OrderStep } from './toolboxRecipes';
export {
  TOOLBOX_RECIPES, toolboxRecipeFor, toolboxResult, recipeMaking, isCraftable, catalogOrder,
} from './toolboxRecipes';

/**
 * O que a caixa precisa do mundo. Um port pequeno, como o do braco robotico, pelo mesmo motivo:
 * a peca nao tem por que enxergar a cena inteira, e assim o acoplamento fica declarado em oito
 * linhas em vez de escondido numa importacao circular.
 */
export type ToolboxWorldPort = {
  /** O que esta caido neste tile (null se nada). */
  kindAt(x: number, y: number): HeldItemKind | null;
  /** Tira o item do chao (a caixa nao devolve fogo nem carga: o insumo e CONSUMIDO). */
  take(x: number, y: number): HeldItemKind | null;
  /**
   * Poe o produto no chao. `units` so passa de 1 na receita do CABO, que sai em pacote — e o
   * pacote viaja como item unico (a mesma lei de UNIT_PACK_KINDS que a semente e o ferro ja
   * seguem), nunca como quatro itens que nao caberiam num tile so.
   */
  put(kind: HeldItemKind, x: number, y: number, units?: number): void;
  /** Ha algo neste tile? Parede, item, caixote, inimigo — a pergunta larga. */
  occupied(x: number, y: number): boolean;
  /** A tampa abriu. */
  opened(): void;
  /** Uma martelada la dentro (dispara varias vezes durante a forja). */
  hammered(): void;
  /** O produto saltou pra fora e assentou no chao. */
  delivered(): void;
  /** A tampa pulou e bateu de volta: estes dois nao dao em nada (ou a saida esta presa). */
  refused(): void;
};

type ToolboxPhase = 'idle' | 'open' | 'swallow' | 'forge' | 'deliver' | 'close';

// Os tempos. Somados dao ~2.2s, e isso e deliberado: fabricar tem de custar uma espera que se
// VE acontecer, senao a caixa e um teleporte de itens com uma animacao por cima.
const OPEN_MS = 240;
const SWALLOW_MS = 460;
const FORGE_MS = 900;
const DELIVER_MS = 420;
const CLOSE_MS = 260;

const HAMMER_COUNT = 3; // as marteladas dentro da forja, espacadas em FORGE_MS

// A recusa nao e continua: ela BATE de tempos em tempos. Uma caixa tremendo sem parar viraria
// ruido de fundo e o jogador pararia de ver; um baque a cada dois segundos e meio continua sendo
// um evento.
const REFUSE_INTERVAL_MS = 2500;
const REFUSE_MS = 260;
// Quanto tempo a mesa fica na pose de trabalho depois de uma construcao pelo menu.
const CRAFT_POSE_MS = 420;

const SLOT_PULSE_MS = 1150;
const SLOT_ALPHA_LO = 0.38;
const SLOT_ALPHA_HI = 0.92;

const MOUTH_ELEV = 0.62; // a boca da caixa: de onde a carga entra e de onde o produto salta
const ITEM_SIZE = 0.5;

// A ORDEM DE PROFUNDIDADE DENTRO DA MAQUINA — o DEPTH_LAYER do projeto na sua versao INTERNA,
// entre as partes de um mesmo objeto (o braco robotico e o ItemPickup fazem igual).
//
// Um quad deste renderer e um plano em (X, altura) posicionado em z = tileY. Uma caixa virada
// pro leste tem as bandejas e a saida no MESMO tileY do corpo — entao a carga voando e o brilho
// da forja caem exatamente no plano do corpo, o teste de profundidade nao tem vencedor, e o par
// estroba pixel a pixel. Pior: metade das vezes o item simplesmente desaparecia ATRAS da propria
// maquina, no unico instante em que a peca existe pra ser vista.
//
// A camera olha de +z pra -z, entao SOMAR em worldY puxa pra frente da tela. Cada parte ganha o
// seu empurraozinho, na ordem em que precisa ser lida: corpo, brilho, carga.
const DEPTH_GLOW = 0.03;
const DEPTH_ITEM = 0.05;
const FORGE_SHAKE = 0.022; // tiles de tremor lateral em regime — meio pixel, presenca e nao ruido

const GOLD = 0xf1cc36;
const GOLD_HOT = 0xf8e394;



const ease = (t: number): number => 0.5 - Math.cos(Math.PI * t) / 2;
// Salto com peso: sobe rapido, desce acelerando. E o arco de uma coisa CUSPIDA, nao levitada.
const arc = (t: number): number => Math.sin(Math.PI * t);

export class ToolboxObject implements WorldProp {
  private readonly body: Billboard3D;
  /** As duas bandejas de entrada, desenhadas deitadas nos tiles de tras. */
  private readonly slots: [Billboard3D, Billboard3D];
  /** O brilho da forja vazando pela boca aberta — additive, some junto com a fase. */
  private glow?: Billboard3D;
  /** Os dois insumos voando pra dentro, e o produto saltando pra fora. */
  private readonly flying: Billboard3D[] = [];
  private readonly sparks = new Set<Billboard3D>();

  private phase: ToolboxPhase = 'idle';
  private elapsed = 0;
  private aliveMs = 0;
  private frame: number = TOOLBOX_FRAMES.closed;

  /** O que a forja esta produzindo / ja produziu e ainda nao conseguiu entregar. */
  private product: HeldItemKind | null = null;
  /** Quantas unidades o produto vale — so o pacote de cabo passa de 1 (ver TOOLBOX_RECIPES). */
  private productUnits = 1;
  private swallowed: [HeldItemKind, HeldItemKind] | null = null;
  private hammersPlayed = 0;
  private refuseCooldown = 0;
  private refuseMs = 0;
  /** Quanto falta da pose de TRABALHO disparada por uma construcao do menu. */
  private craftMs = 0;

  /** A ambicao esta desenhada agora? O keycap le isto para nao pousar em cima dela. */
  private showsAmbition = false;
  /** O keycap "Z" que anuncia o catalogo. Preguicoso: so nasce quando o heroi encara a bancada. */
  private hint?: Phaser.GameObjects.Image;
  /** A peca esta pronta e a saida esta presa (distinto de "esta voando pra saida agora"). */
  private waiting = false;

  /** Quantas vezes a caixa recusou um par. Publico: e o que o playtest observa da recusa. */
  public refusalCount = 0;

  public constructor(
    private readonly scene: Phaser.Scene,
    public readonly worldX: number,
    public readonly worldY: number,
    public readonly dir: PropDir = 1,
  ) {
    this.body = world3d()
      .addBillboard(ASSET_KEYS.toolbox, TOOLBOX_FRAMES.closed, { groundShadow: true })
      .setPosition(worldX, worldY)
      .setDisplaySize(1, 1)
      .setTint(METAL_TINT);

    // As bandejas sao quads DEITADOS no chao dos tiles de tras — o heroi pisa em cima delas o
    // tempo todo (esse e o mecanismo), entao camada `ground`, e emissivas como o fantasma do
    // bombSpot: um convite que some no escuro nao convida ninguem.
    const makeSlot = (x: number, y: number): Billboard3D => world3d()
      .addBillboard(ASSET_KEYS.toolbox, TOOLBOX_FRAMES.slot, {
        flat: true, flatY: 0.026, depthLayer: 'ground', emissive: true,
      })
      .setPosition(x, y)
      .setDisplaySize(0.9, 0.9);
    const [ax, ay] = this.slotTiles[0];
    const [bx, by] = this.slotTiles[1];
    this.slots = [makeSlot(ax, ay), makeSlot(bx, by)];
  }

  /** O corpo e SOLIDO: o heroi contorna, e e dessa solidez que vem o valor de puzzle. */
  public get blocking(): boolean { return true; }

  /**
   * As duas bandejas: a de tras (A) e a colada na maquina (B) — (A) (B) [caixa] (saida).
   * Sao derivadas de `dir`, nunca autoradas, pelo mesmo motivo do braco: uma rotacao colocada a
   * mao E o comportamento da peca, e dois campos que podem discordar viram um bug em silencio.
   */
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
  public get currentPhase(): ToolboxPhase { return this.phase; }
  public get currentFrame(): number { return this.frame; }
  /** O produto pronto ESPERANDO a saida vagar (null quando nao ha nada preso dentro). */
  public get heldProduct(): HeldItemKind | null { return this.waiting ? this.product : null; }

  public update(deltaMs: number, port: ToolboxWorldPort, effectsVisible: boolean): void {
    this.aliveMs += deltaMs;
    this.elapsed += deltaMs;
    if (this.refuseMs > 0) this.refuseMs = Math.max(0, this.refuseMs - deltaMs);
    if (this.refuseCooldown > 0) this.refuseCooldown = Math.max(0, this.refuseCooldown - deltaMs);
    if (this.craftMs > 0) {
      this.craftMs = Math.max(0, this.craftMs - deltaMs);
      // A pose de trabalho manda enquanto dura, inclusive por cima do ciclo de bandeja: as duas
      // coisas sao a mesma mesa trabalhando, e alternar frame entre elas seria estrobo.
      this.pose(TOOLBOX_FRAMES.forging);
    }

    const [ax, ay] = this.slotTiles[0];
    const [bx, by] = this.slotTiles[1];
    const [ox, oy] = this.outputTile;
    const inA = port.kindAt(ax, ay);
    const inB = port.kindAt(bx, by);

    this.renderSlots(inA !== null, inB !== null);

    switch (this.phase) {
      case 'idle': {
        this.pose(TOOLBOX_FRAMES.closed);
        if (!inA || !inB) break;
        const recipe = toolboxRecipeFor(inA, inB);
        const result = recipe?.output ?? null;
        // Duas razoes pra nao comecar, e uma so resposta fisica: "agora nao". A caixa nunca
        // explica qual das duas e — explicar seria o balao de dica de volta, com outro nome.
        if (!result || port.occupied(ox, oy)) {
          if (this.refuseCooldown <= 0) this.refuse(port, effectsVisible);
          break;
        }
        // COMPROMISSO: os insumos saem do chao agora, no primeiro quadro da fabricacao. Deixa-los
        // la ate a forja abriria uma janela em que o heroi (ou um braco) leva um dos dois embora
        // enquanto a maquina ja esta trabalhando — e a caixa produziria a partir do nada.
        const takenA = port.take(ax, ay);
        const takenB = port.take(bx, by);
        if (!takenA || !takenB) {
          // Nao deveria acontecer (a leitura e a mordida sao o mesmo quadro), e por isso mesmo o
          // caso precisa ser escrito: engolir UM dos dois e sair sem produzir nada seria um item
          // sumindo do mundo em silencio — o pior defeito possivel num jogo de uma mao so.
          if (takenA) port.put(takenA, ax, ay);
          if (takenB) port.put(takenB, bx, by);
          break;
        }
        this.swallowed = [takenA, takenB];
        this.product = result;
        this.productUnits = recipe?.units ?? 1;
        this.enter('open');
        if (effectsVisible) port.opened();
        break;
      }

      case 'open': {
        const t = Math.min(1, this.elapsed / OPEN_MS);
        this.pose(t < 0.45 ? TOOLBOX_FRAMES.ajar : TOOLBOX_FRAMES.open);
        if (t >= 1) {
          this.spawnSwallowed();
          this.enter('swallow');
        }
        break;
      }

      case 'swallow': {
        const t = Math.min(1, this.elapsed / SWALLOW_MS);
        this.pose(TOOLBOX_FRAMES.open);
        this.moveSwallowed(ease(t));
        if (t >= 1) {
          this.clearFlying();
          this.enter('forge');
        }
        break;
      }

      case 'forge': {
        const t = Math.min(1, this.elapsed / FORGE_MS);
        this.pose(TOOLBOX_FRAMES.forging);
        // O tremor cresce ate o meio da forja e cai — a maquina PEGA regime e afrouxa, em vez de
        // vibrar num nivel constante do primeiro ao ultimo quadro.
        const intensity = arc(t);
        this.body.setPosition(
          this.worldX + Math.sin(this.aliveMs * 0.06) * FORGE_SHAKE * intensity,
          this.worldY,
        );
        this.pulseGlow(0.5 + 0.5 * intensity, effectsVisible);
        // As marteladas: espacadas ao longo da forja, cada uma com sua chuva de fagulhas.
        const due = Math.min(HAMMER_COUNT, Math.floor(t * HAMMER_COUNT) + 1);
        while (this.hammersPlayed < due) {
          this.hammersPlayed += 1;
          if (effectsVisible) {
            port.hammered();
            this.spawnSparks(3);
            world3d().shake(70, 0.004);
          }
        }
        if (t >= 1) {
          this.body.setPosition(this.worldX, this.worldY);
          this.enter('deliver');
          this.spawnProduct();
        }
        break;
      }

      case 'deliver': {
        // A saida foi validada la atras, no idle — um ciclo inteiro antes (~1.8s). Qualquer coisa
        // pode te-la ocupado nesse meio tempo (um item largado, um caixote empurrado, a carga de
        // um braco), e cuspir por cima empilharia dois itens num tile: o sumico silencioso que o
        // braco robotico ja aprendeu a evitar. Entao a pergunta e refeita AQUI. Ocupada, o produto
        // FICA VISIVEL dentro da caixa aberta, brilhando — a maquina nao quebrou, ela esta com a
        // peca pronta na mao esperando lugar pra pousar.
        if (port.occupied(ox, oy)) {
          this.waiting = true;
          this.pose(TOOLBOX_FRAMES.forging);
          this.pulseGlow(0.35, effectsVisible);
          this.holdProduct();
          this.elapsed = 0;
          break;
        }
        this.waiting = false;
        this.pose(TOOLBOX_FRAMES.open);
        const t = Math.min(1, this.elapsed / DELIVER_MS);
        this.moveProduct(t);
        this.fadeGlow(deltaMs);
        if (t >= 1) {
          if (this.product) port.put(this.product, ox, oy, this.productUnits);
          // A ENCOMENDA CUMPRIDA se desprega sozinha. Um plano que sobrevivesse a propria entrega
          // continuaria desenhando fantasmas de uma coisa que o jogador acabou de ganhar — e a
          // bancada estaria pedindo material para uma peca que ja esta ali no chao, na frente
          // dela. Um degrau INTERMEDIARIO (a engrenagem a caminho do extrator) nao despega nada:
          // e o plano SUBINDO, que e o ponto do chain-craft.
          this.product = null;
          this.productUnits = 1;
          this.clearFlying();
          if (effectsVisible) {
            port.delivered();
            world3d().shake(90, 0.006);
          }
          this.enter('close');
        }
        break;
      }

      case 'close': {
        const t = Math.min(1, this.elapsed / CLOSE_MS);
        this.pose(t < 0.5 ? TOOLBOX_FRAMES.ajar : TOOLBOX_FRAMES.closed);
        this.fadeGlow(deltaMs);
        if (t >= 1) this.enter('idle');
        break;
      }
    }

    // O pulo da recusa roda POR FORA da maquina de estados: e um sobressalto do corpo, e nao uma
    // fase — a caixa recusando continua parada e disponivel no quadro seguinte.
    if (this.refuseMs > 0 && this.phase === 'idle') {
      const t = 1 - this.refuseMs / REFUSE_MS;
      this.pose(t < 0.45 ? TOOLBOX_FRAMES.ajar : TOOLBOX_FRAMES.closed);
      this.body.setPosition(this.worldX + Math.sin(t * Math.PI * 6) * 0.02 * (1 - t), this.worldY);
    }
  }

  /**
   * O KEYCAP SOBRE A BANCADA — "esta maquina tem o que dizer".
   *
   * Sem ele a encomenda seria um recurso invisivel, que e exatamente o defeito que ela veio
   * consertar: o catalogo so existe para quem descobre que ha um A a ser apertado ali. E o MESMO
   * anuncio que flutua na cabeca de um NPC quando o heroi o encara, e de proposito — a bancada e
   * a unica maquina do jogo que se CONVERSA, entao ela fala a lingua dos NPCs e nao a das outras
   * pecas. Ele nasce preguicoso: uma bancada que ninguem encarou nunca aloca imagem nenhuma.
   */
  public renderHint(
    tileSize: number,
    camera: WorldCamera,
    show: boolean,
    timeMs: number,
  ): void {
    if (!show) { this.hint?.setVisible(false); return; }
    if (!this.hint) {
      ensurePlacementKeyTexture(this.scene, isTouchDevice());
      this.hint = this.scene.add
        .image(0, 0, PLACEMENT_KEY_TEXTURE)
        .setOrigin(0.5, 1)
        .setVisible(false);
    }
    const screen = camera.tileToScreen(this.worldX, this.worldY, tileSize);
    const px = Math.max(1, Math.round(tileSize / 24));
    const bob = Math.round(Math.sin(timeMs / 280) * px);
    // A AMBICAO mora exatamente onde o keycap pousaria, e os dois juntos viram um borrao. Quem
    // sobe e o keycap: ele e o aviso passageiro (so existe enquanto o heroi encara), e a ambicao
    // e o estado — empurrar o estado para fora do lugar dele por causa de um aviso seria mover a
    // informacao permanente para acomodar a temporaria.
    const lift = this.showsAmbition ? tileSize * 0.95 : 0;
    this.hint
      .setVisible(true)
      .setScale(px)
      .setPosition(screen.x, screen.y - tileSize - px * 2 + bob - lift);
  }

  /**
   * O JOGADOR CONSTRUIU pelo menu — a mesa martela por um instante. Ela nao passa pelo ciclo de
   * bandeja (nao ha carga viajando; a materia saiu da mochila e o produto voltou pra ela), entao
   * o que sobra e o gesto: a pose de trabalho e um chacoalho. Sem isso, construir seria um item
   * aparecendo na mochila e mais nada — e um jogo em que a maquina nao se mexe quando trabalha
   * ensina que ela nao trabalha.
   */
  public playCraft(): void {
    this.craftMs = CRAFT_POSE_MS;
    this.bump();
  }

  /** O heroi bateu no corpo: as ferramentas chacoalham la dentro. Fisico, nunca uma legenda. */
  public bump(): void {
    this.scene.tweens.killTweensOf(this.body);
    this.scene.tweens.add({
      targets: this.body,
      angle: { from: -2.5, to: 2.5 },
      duration: 42,
      yoyo: true,
      repeat: 2,
      onComplete: () => this.body.setAngle(0),
    });
  }

  private enter(next: ToolboxPhase): void {
    this.phase = next;
    this.elapsed = 0;
    if (next === 'forge') this.hammersPlayed = 0;
  }

  private pose(frame: number): void {
    if (this.frame === frame) return;
    this.frame = frame;
    this.body.setTexture(ASSET_KEYS.toolbox, frame);
  }

  private refuse(port: ToolboxWorldPort, effectsVisible: boolean): void {
    this.refuseMs = REFUSE_MS;
    this.refuseCooldown = REFUSE_INTERVAL_MS;
    this.refusalCount += 1;
    if (effectsVisible) port.refused();
  }

  /**
   * As bandejas. Vazia RESPIRA (o convite), carregada fica firme e dourada — e ler "falta uma"
   * e so ver qual das duas ainda esta piscando. E por isso que as duas usam a MESMA silhueta em
   * cores diferentes: se a carregada mudasse de forma, o par nao se compararia de relance.
   */
  private renderSlots(hasA: boolean, hasB: boolean): void {
    const pulse = SLOT_ALPHA_LO
      + (SLOT_ALPHA_HI - SLOT_ALPHA_LO) * (0.5 + 0.5 * Math.sin((this.aliveMs * 2 * Math.PI) / SLOT_PULSE_MS));
    const paint = (slot: Billboard3D, filled: boolean): void => {
      slot.setTexture(ASSET_KEYS.toolbox, filled ? TOOLBOX_FRAMES.slotFull : TOOLBOX_FRAMES.slot);
      slot.setAlpha(filled ? 1 : pulse);
    };
    paint(this.slots[0], hasA);
    paint(this.slots[1], hasB);
  }

  /** Os dois insumos nascem em cima das bandejas pra VIAJAR ate a boca da caixa. */
  private spawnSwallowed(): void {
    if (!this.swallowed) return;
    this.swallowed.forEach((kind, i) => {
      const [sx, sy] = this.slotTiles[i];
      const visual = itemGroundVisual(kind);
      this.flying.push(world3d()
        .addBillboard(visual.texture, visual.frame, { emissive: true, centered: true })
        .setPosition(sx, sy + DEPTH_ITEM)
        .setElevation(0.14)
        .setDisplaySize(ITEM_SIZE, ITEM_SIZE));
    });
  }

  private moveSwallowed(k: number): void {
    if (!this.swallowed) return;
    this.flying.forEach((bb, i) => {
      const [sx, sy] = this.slotTiles[i];
      // O item de tras sai um pouco depois: os dois entrando em uniformidade perfeita leem como
      // um objeto so partido ao meio, e nao como duas pecas sendo recolhidas.
      const t = Math.max(0, Math.min(1, (k - (i === 0 ? 0 : 0.18)) / (i === 0 ? 1 : 0.82)));
      bb.setPosition(sx + (this.worldX - sx) * t, sy + (this.worldY - sy) * t + DEPTH_ITEM)
        .setElevation(0.14 + (MOUTH_ELEV - 0.14) * t + 0.24 * arc(t))
        // Some por TAMANHO, nunca so por alpha: engolido e diferente de fantasma (a mesma
        // decisao que a succao do portal toma com o heroi).
        .setDisplaySize(ITEM_SIZE * (1 - t * 0.92), ITEM_SIZE * (1 - t * 0.92))
        .setAngle(t * 220);
    });
  }

  /** O produto acabado, ainda dentro da caixa, pronto pra ser cuspido. */
  private spawnProduct(): void {
    if (!this.product) return;
    const visual = itemGroundVisual(this.product);
    this.flying.push(world3d()
      .addBillboard(visual.texture, visual.frame, { emissive: true, centered: true })
      .setPosition(this.worldX, this.worldY + DEPTH_ITEM)
      .setElevation(MOUTH_ELEV)
      .setDisplaySize(0.02, 0.02));
  }

  /** Saida presa: o produto FICA a vista na boca da caixa, subindo e descendo devagar. */
  private holdProduct(): void {
    const bb = this.flying[0];
    if (!bb) return;
    bb.setPosition(this.worldX, this.worldY + DEPTH_ITEM)
      .setElevation(MOUTH_ELEV + Math.sin(this.aliveMs * 0.004) * 0.03)
      .setDisplaySize(ITEM_SIZE, ITEM_SIZE)
      .setAngle(0);
  }

  private moveProduct(t: number): void {
    const bb = this.flying[0];
    if (!bb) return;
    const [ox, oy] = this.outputTile;
    // Cresce nos primeiros 25% (o item "nascendo" na boca) e so entao voa. Sem esse tempo, o
    // produto aparece com tamanho cheio no mesmo quadro em que comeca a se mover, e a leitura
    // e de um item que ja estava ali.
    const born = Math.min(1, t / 0.25);
    const fly = Math.max(0, (t - 0.2) / 0.8);
    bb.setPosition(
      this.worldX + (ox - this.worldX) * ease(fly),
      this.worldY + (oy - this.worldY) * ease(fly) + DEPTH_ITEM * (1 - fly),
    )
      .setElevation(MOUTH_ELEV + 0.34 * arc(fly) - (MOUTH_ELEV - 0.1) * fly)
      .setDisplaySize(ITEM_SIZE * born, ITEM_SIZE * born)
      .setAngle(fly * 340);
  }

  private clearFlying(): void {
    for (const bb of this.flying) bb.destroy();
    this.flying.length = 0;
    this.swallowed = null;
  }

  /**
   * O brilho da forja: um quad additive na boca. Additive de proposito — o calor SOMA luz ao que
   * ja esta ali, e nao pinta um retangulo dourado por cima do metal. Nao e uma luz THREE: a regra
   * do renderer e que a contagem de luzes nunca muda em tempo de execucao (uma luz nova recompila
   * todos os materiais do mundo), entao brilho de maquina e sempre malha, nunca fonte.
   */
  private pulseGlow(strength: number, effectsVisible: boolean): void {
    if (!effectsVisible) { this.glow?.setAlpha(0); return; }
    if (!this.glow) {
      this.glow = world3d()
        .addBillboard(FX_DOT_TEXTURE, 0, {
          centered: true, additive: true, fog: false, depthWrite: false,
        })
        .setTint(GOLD)
        .setPosition(this.worldX, this.worldY + DEPTH_GLOW)
        .setElevation(MOUTH_ELEV - 0.06);
    }
    const flicker = 0.82 + 0.18 * Math.sin(this.aliveMs * 0.022);
    this.glow
      .setAlpha(Math.min(0.85, strength * flicker))
      .setDisplaySize(0.9 * strength + 0.3, 0.62 * strength + 0.22);
  }

  private fadeGlow(deltaMs: number): void {
    if (!this.glow) return;
    const next = this.glow.alpha - deltaMs / 260;
    if (next <= 0) {
      this.glow.destroy();
      this.glow = undefined;
      return;
    }
    this.glow.setAlpha(next);
  }

  /** Fagulhas saltando da boca a cada martelada. Bilhetes de efeito, nunca partes da maquina. */
  private spawnSparks(count: number): void {
    for (let i = 0; i < count; i += 1) {
      const spark = world3d()
        .addBillboard(FX_DOT_TEXTURE, 0, {
          centered: true, additive: true, emissive: true, fog: false, depthWrite: false,
        })
        .setTint(i % 2 === 0 ? GOLD_HOT : GOLD)
        .setPosition(this.worldX + (Math.random() - 0.5) * 0.3, this.worldY + DEPTH_ITEM)
        .setElevation(MOUTH_ELEV)
        .setDisplaySize(0.05, 0.05);
      this.sparks.add(spark);
      this.scene.tweens.add({
        targets: spark,
        x: spark.x + (Math.random() - 0.5) * 0.55,
        elevation: MOUTH_ELEV + 0.3 + Math.random() * 0.22,
        alpha: 0,
        duration: 260 + i * 60,
        ease: 'Quad.easeOut',
        onComplete: () => this.retireSpark(spark),
      });
    }
  }

  private retireSpark(spark: Billboard3D): void {
    this.sparks.delete(spark);
    spark.destroy();
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

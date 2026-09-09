import type Phaser from 'phaser';

import type { FireLight3D } from '@/game/render3d/World3D';
import { FX_DOT_TEXTURE, FX_PUFF_TEXTURE, world3d } from '@/game/render3d/World3D';
import type { Billboard3D } from '@/game/render3d/Billboard3D';

// A TOCHA DE PAREDE — a unica luz do subterraneo, e o unico fogo de la de onde se leva fogo.
//
// Ela nasce de um TILE, nao de uma prop: o autor pinta `DUNGEON_TILES.wallTorch` na alvenaria
// (no `/editor`, ou por `scripts/enrich-underworld.mjs`) e a GameScene varre o terreno atras dele.
// Isso e de proposito — uma tocha nao e um objeto que o jogador manipula, e um pedaco de parede
// que por acaso queima; e guarda-la na lista de props faria toda busca linear por prop custar
// mais sem nenhum ganho. O frame 48 e um MARCADOR: quem o desenha e esta classe, e o World3D
// troca o tile por muro liso antes de assar o cubo (ver o `wallCubes` de `buildTerrain`).
//
// ── O que ela era, e por que foi refeita ────────────────────────────────────────────────────
// A versao anterior desenhava a chama com `campfire-0..2`, que sao os PNGs `sprite_fire0..2`: eles
// tem AS TORAS pintadas na base. Cada uma das 75 tochas do subterraneo era, ao pe da letra, uma
// fogueirinha de acampamento de 0,42 tile pendurada numa parede — lenha inclusa, sem nada
// segurando, sobre um segundo fogo ja pintado no tile. E 0,42 tile de uma arte de 16px e uma
// reducao de 2,4x, entao ela ainda chegava a tela serrilhada.
//
// ── TRES PECAS, e cada uma existe por um motivo diferente ───────────────────────────────────
//   · o COPO (`torch-sconce`) e ferro e pedra: ele recebe a luz do mundo como qualquer corpo,
//     e e a resposta para "o que segura essa chama?";
//   · a CHAMA (`torch-flame`) e `emissive` — ela e a propria fonte, entao passa direto pelo bloom
//     em vez de ser sombreada;
//   · o HALO e aditivo e RADIAL. Ele era a silhueta da fogueira escalada 3,4x e tingida, ou seja
//     uma segunda chama maior e borrada atras da primeira; um brilho e um brilho, e a forma dele
//     e um ponto (`FX_DOT_TEXTURE`, o mesmo da brasa da fogueira morta).
//
// As tres sao mostradas a UM TILE, texel a texel, sobre a face do cubo: quem define o tamanho da
// chama e a MARGEM dentro do frame de 16px, nunca um `setDisplaySize` menor que a arte. Um quad
// de pixel art escalado por um fator que nao e inteiro perde a grade, e era o defeito de antes —
// e por isso a chama tambem nao "respira" por escala: quem varia a altura dela sao os frames.
//
// ── A CHAMA DESENHADA E A MESMA CHAMA QUE A LUZ ─────────────────────────────────────────────
// Antes o sprite trocava de frame num metronomo de 110ms enquanto a luz executava cinco camadas
// de danca (swell + flicker + shimmer + jitter + estalo de lenha). As duas nao se conheciam: o
// quad lia como decalque em loop e a luz como um efeito solto por cima dele — e desencontrar as
// tochas exigia uma fase falsa derivada da coordenada.
//
// Agora o frame E a leitura da luz (`FireLight3D.level`): os quatro desenhos estao ordenados por
// ALTURA, e a altura da chama na tela e o brilho que ela esta lancando naquele instante. O
// desencontro vem de graca — cada fogo do pool tem a sua propria semente —, e a fase falsa morreu.
//
// ── A luz e EMPRESTADA, nunca criada ────────────────────────────────────────────────────────
// `addFireLight` registra a chama no mesmo pool das fogueiras. Nada neste jogo pode somar ou tirar
// uma luz THREE em runtime — a contagem esta assada na chave de cache de todo shader do mundo, e
// mexer nela congela um frame recompilando. Sao oito lampadas fixas mirando a cada quadro nas
// chamas mais proximas da camera; quem nao ganha vaga fica com o halo, que e malha e pode existir
// a vontade. Por isso 75 tochas nao custam 75 luzes — e por isso o anel de ativacao abaixo e
// legal: acender e apagar uma ENTRADA de lista nao cria nem destroi luz nenhuma.
//
// ── ELA NAO E UMA FOGUEIRA, e isso e decisao de jogo ────────────────────────────────────────
// `isLitAt` (a cova que se cala) e o `nearFire` da flor da lua contam fogueiras e a tocha NA MAO,
// nunca o frame 48. Se contassem, as 75 tochas calariam as 24 covas e fechariam as 9 flores de uma
// vez. Pelo mesmo motivo ela nao tem `tickScorch`: o anel de calor de 2 tiles e o que fica colado
// na lenha de uma fogueira, e um anel desses em volta de 75 tochas tornaria todo corredor da
// masmorra letal para o bestiario sem o jogador ter feito nada.

const SCONCE_TEXTURE = 'torch-sconce';
const FLAME_TEXTURE = 'torch-flame';

/**
 * A face SUL do cubo, e a unica onde uma tocha pode existir.
 *
 * Nao e escolha de gosto, e a geometria: `Billboard3D` nao gira — todo quad deste jogo e vertical
 * e olha para o sul (a camera esta em +z). Um quad na face oeste de um bloco fica DENTRO do
 * intervalo em z do proprio bloco, e a face sul dele, que esta mais perto da camera, o oclui
 * inteiro. Por isso a precondicao da peca e "o tile ao sul nao pode ser macico" (ver
 * `wallTorchFaceIsClear`): quando ele e, nao existe lugar visivel para a chama, e a tocha nao
 * desenha nada — o Salvar do editor avisa antes.
 */
const FACE = 0.5;
// As tres pecas saem do plano da face em degraus. Coplanar com a alvenaria elas so ganhavam o
// teste de profundidade pela ordem de desenho, e entre si empatavam: o quad do copo e o da chama
// tem a MESMA distancia da camera, e um empate no passe transparente e decidido por ruido de
// ponto flutuante. Os degraus sao sub-pixel, entao nada disto aparece de lado.
const SCONCE_Z = FACE + 0.02;
const HALO_Z = FACE + 0.04;
const FLAME_Z = FACE + 0.06;

/**
 * Os quatro frames de `torch-flame` em ordem de ALTURA (a mais baixa primeiro) — e a tabela que
 * traduz brilho em desenho. Ver o cabecalho: o indice vem da danca da luz, nunca de um relogio.
 */
const FLAME_BY_HEIGHT = [1, 3, 0, 2] as const;
/** A janela de `level` que os quatro frames cobrem (abaixo dela o vale, acima o estalo). */
const LEVEL_LOW = 0.72;
const LEVEL_HIGH = 1.32;

/**
 * O tamanho da poca no chao, como fracao do padrao das fogueiras — e o numero que faltava.
 *
 * `fireGlowSize` vale 15 TILES, porque foi escolhido olhando uma fogueira de acampamento. As 75
 * tochas herdavam esse numero inteiro (a unica coisa que se podia pedir a uma fonte pequena era
 * ser mais fraca, nunca menor), entao o chao da masmorra saia lavado de laranja de ponta a ponta e
 * nenhuma tocha lia como MARCO — que e o unico motivo de elas existirem.
 */
const GLOW_SIZE_SCALE = 0.4;
/** …e ela tambem lanca menos luz: uma tocha nao e uma fogueira. */
const LIGHT_SCALE = 0.5;

const HALO_TINT = 0xffb867;
const HALO_ALPHA = 0.3;
const HALO_SIZE = 1.45;
/** Onde mora o meio da chama dentro do frame de 16px (linhas 2..10), em tiles acima do chao. */
const FLAME_MID = 0.6;

/**
 * O ANEL DE ATIVACAO. Fora dele a tocha e so dados: nenhum billboard, nenhuma entrada de fogo.
 *
 * Cada tocha viva custa tres meshes com tres materiais (o `Billboard3D` nao e instanciado) mais o
 * quad da poca do pool — e as 75 do subterraneo somavam ~225 draw calls, alem de 75 entradas que a
 * varredura de sombras percorre por candidato a cada frame. O quadro real da camera e de ~4,5
 * tiles para os lados e ~6,5 para o norte (ver `GameScene.isTileFramed`), entao 10 tiles nao tem
 * como piscar na tela; a histerese de 1,5 tile impede o vaivem de quem para em cima da fronteira.
 *
 * ESCONDER NAO SERVIRIA. Um `setVisible(false)` tira o draw call e mais nada: a entrada continua em
 * `World3D.fires`, e o laco de fogo calcula a danca de TODA entrada por quadro (e cada uma segura
 * um quad da poca) — que e metade do custo que este anel existe para tirar. Sair da lista e o
 * ponto; e sair dela e legal porque o que morre e uma entrada, nunca uma luz.
 *
 * E `Billboard3D.destroy()` DESCARTA o material, entao entrar no anel constroi materiais novos — o
 * que so e seguro porque os quatro PROGRAMAS usados aqui ja estao aquecidos e presos por um
 * billboard vivo do `prewarmShaders` (os de aquecimento duram a partida inteira). Sao eles: o do
 * copo, que e o Lambert padrao — a mesma chave de `{ groundShadow: true }`, ja que o blob de
 * contato e uma malha SEPARADA e nao toca o material do quad —, `{ emissive: true }` para a chama,
 * `{ centered, fog: false, depthWrite: false, additive: true }` para o halo (o `fog` entra na chave
 * do programa, entao o `{ additive: true }` seco nao serviria) e a variante da baforada, que ja
 * estava la para a fumaca do jogo. Sem esse ancoradouro, a ultima tocha a sair do anel poderia
 * zerar a contagem de um programa e a proxima a entrar pagaria a recompilacao — o pior stall que
 * este jogo tem, e que o `perf-profile` reprova com razao.
 */
const ACTIVATE_TILES = 10;
const RELEASE_TILES = 11.5;
/** A fumaca e mais avara que a luz: ela e detalhe de quem esta perto, nao silhueta de longe. */
const SMOKE_TILES = 6;
const SMOKE_EVERY_MS = 820;

/** As pecas que so existem enquanto a tocha esta dentro do anel. */
type LiveParts = {
  sconce: Billboard3D;
  flame: Billboard3D;
  halo: Billboard3D;
  fire: FireLight3D;
};

export class WallTorchObject {
  private parts?: LiveParts;
  private frameIndex = -1;
  private smokeMs = 0;
  /** As baforadas vivas, para o `destroy` nao deixar billboard orfao num `scene.restart()`. */
  private readonly puffs = new Set<Billboard3D>();

  public constructor(
    private readonly scene: Phaser.Scene,
    public readonly worldX: number,
    public readonly worldY: number,
  ) {}

  /**
   * Ela esta SEMPRE acesa, e isso e decisao de jogo, nao um estado que ninguem implementou: a
   * tocha de parede e FONTE e nunca alvo. O balde nao a apaga porque uma masmorra que o jogador
   * consegue apagar para sempre e atmosfera com trava de seguranca e sem recompensa nenhuma do
   * outro lado. Quem pergunta e o `useItemAt` — o graveto acende aqui.
   */
  public get isLit(): boolean { return true; }

  public update(deltaMs: number, heroX: number, heroY: number): void {
    const dist = Math.hypot(this.worldX - heroX, this.worldY - heroY);
    if (this.parts) {
      if (dist > RELEASE_TILES) { this.release(); return; }
    } else if (dist <= ACTIVATE_TILES) {
      this.acquire();
    }
    const p = this.parts;
    if (!p) return;

    // A DANCA da luz, lida de volta: 0,4 no fundo do vale, ~1,5 num estalo de lenha.
    const level = p.fire.level;
    const t = Math.max(0, Math.min(1, (level - LEVEL_LOW) / (LEVEL_HIGH - LEVEL_LOW)));
    const wanted = FLAME_BY_HEIGHT[Math.min(FLAME_BY_HEIGHT.length - 1, Math.floor(t * FLAME_BY_HEIGHT.length))];
    if (wanted !== this.frameIndex) {
      this.frameIndex = wanted;
      // Troca SECA de frame. Sao quatro poses desenhadas de fogo, e um crossfade entre duas delas
      // e uma sopa — exatamente o que arte de 16px nao aguenta.
      p.flame.setTexture(FLAME_TEXTURE, wanted);
    }
    // O halo respira com a mesma leitura — ele e o alcance que a chama ANUNCIA, entao tem de
    // crescer no mesmo instante em que ela cresce.
    // A elevacao dele NAO se mexe: um billboard `centered` ancora no MEIO, entao mudar a altura
    // junto com o tamanho faria o brilho escorregar pela parede a cada estalo.
    const haloSize = HALO_SIZE * (0.9 + 0.2 * t);
    p.halo.setAlpha(HALO_ALPHA * (0.72 + 0.5 * t)).setDisplaySize(haloSize, haloSize);

    if (dist > SMOKE_TILES) return;
    this.smokeMs += deltaMs;
    if (this.smokeMs < SMOKE_EVERY_MS) return;
    this.smokeMs -= SMOKE_EVERY_MS;
    this.puff();
  }

  /** Entra no anel: as tres pecas e a vaga no pool de fogo nascem aqui. */
  private acquire(): void {
    const w3 = world3d();
    // O COPO, iluminado pelo mundo como qualquer corpo — ele e ferro, nao fogo.
    const sconce = w3.addBillboard(SCONCE_TEXTURE, 0)
      .setPosition(this.worldX, this.worldY + SCONCE_Z)
      .setElevation(0)
      .setDisplaySize(1, 1);
    // O HALO, aditivo e radial, entre o copo e a chama: e ele que pinta a pedra em volta de
    // laranja e da a impressao de alcance, sem custar uma luz.
    const halo = w3.addBillboard(FX_DOT_TEXTURE, 0, { additive: true, centered: true, fog: false })
      .setPosition(this.worldX, this.worldY + HALO_Z)
      .setElevation(FLAME_MID)
      .setDisplaySize(HALO_SIZE, HALO_SIZE)
      .setTint(HALO_TINT)
      .setAlpha(HALO_ALPHA);
    // A CHAMA: `emissive`, e a UM TILE exato — a margem dentro do frame e que a faz do tamanho de
    // uma tocha (ver o cabecalho).
    const flame = w3.addBillboard(FLAME_TEXTURE, 0, { emissive: true, emissiveBoost: 4 })
      .setPosition(this.worldX, this.worldY + FLAME_Z)
      .setElevation(0)
      .setDisplaySize(1, 1);
    const fire = w3.addFireLight(this.worldX, this.worldY + FACE, true);
    fire.setIntensityScale(LIGHT_SCALE);
    fire.setSizeScale(GLOW_SIZE_SCALE);

    this.parts = { sconce, flame, halo, fire };
    this.frameIndex = -1;
  }

  /** Sai do anel. Nenhuma luz THREE morre aqui — so uma entrada de lista (ver o cabecalho). */
  private release(): void {
    const p = this.parts;
    if (!p) return;
    this.parts = undefined;
    p.fire.destroy();
    p.sconce.destroy();
    p.flame.destroy();
    p.halo.destroy();
  }

  /**
   * Uma baforada saindo da ponta. Ela sobe alem do topo da parede de proposito — e la em cima,
   * contra o teto preto, que a fumaca de uma masmorra se ve. Sem escrever profundidade e com o
   * corte de alpha rente a zero: sem os dois ela abriria um buraco escuro no halo em vez de
   * esfumacar por cima dele (ver `Billboard3DOptions.depthWrite`).
   */
  private puff(): void {
    const puff = world3d()
      .addBillboard(FX_PUFF_TEXTURE, 0, {
        centered: true, fog: false, depthWrite: false, emissive: true, alphaTest: 0.02,
      })
      .setTint(0x6b6b7a)
      .setPosition(this.worldX + (Math.random() - 0.5) * 0.14, this.worldY + FLAME_Z)
      .setElevation(FLAME_MID + 0.24)
      .setDisplaySize(0.22, 0.22)
      .setAlpha(0.26);
    this.puffs.add(puff);
    this.scene.tweens.add({
      targets: puff,
      elevation: FLAME_MID + 0.95,
      alpha: 0,
      // `scaleX`/`scaleY` do Billboard3D sao a LARGURA E A ALTURA EM TILES, nao um multiplicador:
      // 0,22 → 0,42 e a baforada quase dobrando de tamanho enquanto sobe.
      scaleX: 0.42,
      scaleY: 0.42,
      duration: 1150,
      ease: 'Sine.easeOut',
      onComplete: () => { this.puffs.delete(puff); puff.destroy(); },
    });
  }

  public destroy(): void {
    this.release();
    for (const puff of this.puffs) {
      this.scene.tweens.killTweensOf(puff);
      puff.destroy();
    }
    this.puffs.clear();
  }
}

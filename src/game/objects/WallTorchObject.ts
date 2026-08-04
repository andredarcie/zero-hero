import type Phaser from 'phaser';

import type { FireLight3D } from '@/game/render3d/World3D';
import { world3d } from '@/game/render3d/World3D';
import type { Billboard3D } from '@/game/render3d/Billboard3D';

// A TOCHA DE PAREDE — a primeira fonte de luz que nao e um prop autorado, e a unica coisa acesa
// dentro de uma dungeon.
//
// Ela nasce de um TILE, nao de uma prop: o gerador pinta o frame `DUNGEON_TILES.wallTorch` na
// alvenaria e a GameScene varre o terreno atras dele. Isso e de proposito — uma tocha nao e um
// objeto que o jogador manipula, e um pedaco de parede que por acaso queima; guarda-la na lista
// de props faria toda busca linear por prop ficar mais cara sem nenhum ganho.
//
// ── A luz e EMPRESTADA, nunca criada ────────────────────────────────────────────────────────
// `addFireLight` registra a chama no mesmo pool que as fogueiras usam. A lei do projeto e que
// nada pode somar ou tirar uma luz THREE em runtime — a contagem esta assada na chave de cache de
// todo shader do mundo, e mexer nela congela um frame inteiro recompilando. O pool tem oito
// lampadas fixas que a cada quadro miram nas chamas mais proximas da camera; uma tocha que nao
// ganhar vaga continua com o seu quad de brilho, que e malha e pode existir a vontade.
//
// Por isso uma dungeon com vinte tochas nao custa vinte luzes: custa vinte entradas numa lista.
//
// ── Ela fica na FACE da parede, nao em cima dela ───────────────────────────────────────────
// O tile e um cubo de um tile de lado, e a chama precisa aparecer na frente dele — meio tile ao
// sul e erguida do chao. Sem o deslocamento ela nasce dentro do bloco e some; sem a elevacao ela
// lambe o chao e parece uma fogueira caida, nao uma tocha presa na parede.
const FIRE_TEXTURES = ['campfire-0', 'campfire-1', 'campfire-2'] as const;
const FRAME_MS = 110;
/** Quanto a chama avanca para o sul, em tiles: meio tile poe ela rente a face do cubo. */
const FACE_OFFSET = 0.5;
/** Altura da chama na parede, em tiles. */
const HEIGHT = 0.62;
const SIZE = 0.42;
const GLOW_SCALE = 3.4;
const GLOW_TINT = 0xffb867;
const GLOW_ALPHA = 0.5;

export class WallTorchObject {
  private readonly sprite: Billboard3D;
  private readonly glow: Billboard3D;
  private readonly fireLight: FireLight3D;
  private frameIndex = 0;
  private elapsedMs = 0;

  public constructor(
    private readonly scene: Phaser.Scene,
    public readonly worldX: number,
    public readonly worldY: number,
  ) {
    // O halo, aditivo, atras da chama — o mesmo truque da fogueira: e ele que pinta a parede em
    // volta de laranja e da a impressao de alcance, sem custar uma luz.
    this.glow = world3d()
      .addBillboard(FIRE_TEXTURES[0], 0, { additive: true })
      .setPosition(worldX, worldY + FACE_OFFSET)
      .setElevation(HEIGHT)
      .setDisplaySize(SIZE * GLOW_SCALE, SIZE * GLOW_SCALE)
      .setTint(GLOW_TINT)
      .setAlpha(GLOW_ALPHA);

    // A chama, emissiva: ela e a propria fonte, entao passa direto pelo bloom em vez de ser
    // sombreada como um objeto qualquer.
    this.sprite = world3d()
      .addBillboard(FIRE_TEXTURES[0], 0, { emissive: true, emissiveBoost: 4 })
      .setPosition(worldX, worldY + FACE_OFFSET)
      .setElevation(HEIGHT)
      .setDisplaySize(SIZE, SIZE);

    this.fireLight = world3d().addFireLight(worldX, worldY + FACE_OFFSET, true);
  }

  /**
   * Troca de frame por TEMPO e nao por tween. Sao poucos frames de pixel art e o que se quer e a
   * troca seca — um crossfade transformaria duas poses desenhadas em uma sopa entre elas, que e
   * exatamente o que a arte de 16px nao aguenta.
   *
   * Cada tocha comeca num frame diferente (ver a GameScene): vinte chamas piscando em unissono
   * leem como um efeito ligando, nao como vinte fogos.
   */
  public update(deltaMs: number): void {
    this.elapsedMs += deltaMs;
    if (this.elapsedMs < FRAME_MS) return;
    this.elapsedMs -= FRAME_MS;
    this.frameIndex = (this.frameIndex + 1) % FIRE_TEXTURES.length;
    this.sprite.setTexture(FIRE_TEXTURES[this.frameIndex]);
    this.glow.setTexture(FIRE_TEXTURES[this.frameIndex]);
  }

  /** Desencontra o inicio da animacao, para as tochas nao baterem juntas. */
  public offsetPhase(ms: number): this {
    this.elapsedMs = ms % FRAME_MS;
    this.frameIndex = Math.floor(ms / FRAME_MS) % FIRE_TEXTURES.length;
    this.sprite.setTexture(FIRE_TEXTURES[this.frameIndex]);
    this.glow.setTexture(FIRE_TEXTURES[this.frameIndex]);
    return this;
  }

  public destroy(): void {
    this.scene.tweens.killTweensOf(this.glow);
    this.fireLight.destroy();
    this.sprite.destroy();
    this.glow.destroy();
  }
}

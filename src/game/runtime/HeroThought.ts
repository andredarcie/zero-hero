import Phaser from 'phaser';

import { SCENE_DEPTHS } from '@/game/constants';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

/**
 * O PENSAMENTO DO HERÓI: um balão com o desenho da coisa que falta, sobre a cabeça dele, por um
 * instante. Pedido do autor: toda vez que ele tenta usar uma coisa que não tem, pensa nela. Quem
 * decide o que falta é a cena (`GameScene.neededAt`); esta classe só sabe desenhar e sumir sozinha.
 *
 * É um ÍCONE, nunca uma palavra, e sempre o PRÓPRIO SPRITE do item (pedido do autor): nada de desenho
 * paralelo. Só a placa do balão é arte daqui.
 *
 * ── Ancoragem ──────────────────────────────
 * No corpo DESENHADO (`visualWorld`), nunca no tile lógico: a lógica salta para o destino no
 * primeiro frame do passo, e um overlay preso a ela sairia um tile à frente do herói a cada
 * caminhada. É lei escrita do projeto, e este é o caso exato que ela descreve.
 */

const PLATE_TEXTURE = 'hero-thought-plate';
const PLATE_W = 22;
const PLATE_H = 25;
/** O lado do ícone, em pixels de arte da placa. */
const ICON_SIZE = 14;
const ICON_CENTER_Y = 10;

const ensureThoughtArt = (scene: Phaser.Scene): void => {
  if (!scene.textures.exists(PLATE_TEXTURE)) {
    const canvas = document.createElement('canvas');
    canvas.width = PLATE_W;
    canvas.height = PLATE_H;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const rect = (color: string, x: number, y: number, w: number, h: number): void => {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w, h);
      };
      // A nuvem: canto vazado, contorno escuro e o miolo claro, para qualquer item ler sobre ela.
      rect('#2a2118', 2, 0, PLATE_W - 4, 20);
      rect('#2a2118', 0, 2, PLATE_W, 16);
      rect('#2a2118', 1, 1, PLATE_W - 2, 18);
      rect('#f3ecd8', 2, 1, PLATE_W - 4, 18);
      rect('#f3ecd8', 1, 2, PLATE_W - 2, 16);
      // As duas bolinhas descendo até a cabeça: é o que diz "pensando", e não "falando".
      rect('#2a2118', 8, 20, 5, 3);
      rect('#f3ecd8', 9, 20, 3, 2);
      rect('#2a2118', 11, 23, 2, 2);
    }
    scene.textures.addCanvas(PLATE_TEXTURE, canvas);
  }
};

/** Altura do balão sobre o tile, em frações de tile — o corpo inteiro do herói passa por baixo. */
const RISE = 1.6;
/** A largura do balão em frações de tile: grande o bastante para o desenho ler, e nunca maior. */
const SIZE = 1.15;
/** Quanto ele fica na tela depois do último pedido. Um aviso que sobrevive ao gesto vira interface. */
const LINGER_MS = 1500;
/** O fade final — ele SOME, nunca corta. */
const FADE_MS = 220;
/** A respiração: um pensamento é uma coisa viva (a mesma cadência do balão da caveira). */
const BOB_MS = 900;

export class HeroThought {
  private readonly bubble: Phaser.GameObjects.Container;
  private readonly plate: Phaser.GameObjects.Image;
  private readonly icon: Phaser.GameObjects.Image;
  private leftMs = 0;
  private popTween?: Phaser.Tweens.Tween;
  private current = '';

  public constructor(private readonly scene: Phaser.Scene) {
    ensureThoughtArt(scene);
    this.plate = scene.add.image(0, 0, PLATE_TEXTURE).setOrigin(0.5, 1);
    this.icon = scene.add.image(0, 0, PLATE_TEXTURE);
    this.bubble = scene.add.container(-9999, -9999, [this.plate, this.icon])
      .setDepth(SCENE_DEPTHS.player + 2)
      .setVisible(false);
  }

  /**
   * PENSE NISTO AGORA. Chamar de novo com o mesmo ícone só renova o relógio — é o que faz o
   * jogador poder martelar o botão sem o balão piscar a cada aperto.
   */
  public show(texture: string, frame = 0): void {
    const fresh = !this.bubble.visible || this.current !== texture;
    if (this.current !== texture) {
      this.icon.setTexture(texture, frame);
      this.current = texture;
    }
    this.leftMs = LINGER_MS;
    this.bubble.setAlpha(1).setVisible(true);
    if (!fresh) return;
    // O POP: ele nasce do nada e assenta. `Back.easeOut` passa do tamanho e volta — é o gesto de
    // uma ideia chegando, e é o mesmo do balão da caveira.
    this.popTween?.stop();
    this.bubble.setScale(0);
    this.popTween = this.scene.tweens.add({
      targets: this.bubble, scale: 1, duration: 200, ease: 'Back.easeOut',
    });
  }

  /** O ícone que está na tela agora, ou `null` — a janela do playtest sobre esta peça. */
  public get visibleIcon(): string | null {
    return this.bubble.visible ? this.current : null;
  }

  /** Some AGORA (o gesto funcionou, o herói morreu, a cena mudou de assunto). */
  public clear(): void {
    if (!this.bubble.visible) return;
    this.leftMs = 0;
    this.popTween?.stop();
    this.scene.tweens.killTweensOf(this.bubble);
    this.bubble.setVisible(false);
  }

  /**
   * O RELÓGIO, no update — separado do desenho de propósito: a projeção roda também fora do
   * update (o `reprojectStatic` de um diálogo redesenha a tela sem tempo passar), e um balão que
   * contasse o tempo ali sumiria enquanto o mundo está parado.
   */
  public tick(delta: number): void {
    if (!this.bubble.visible || this.leftMs === 0) return;
    this.leftMs = Math.max(0, this.leftMs - delta);
    if (this.leftMs > 0) return;
    // O fim é um fade — ele SOME, nunca corta. Chamar `show` no meio dele reacende o balão sem
    // esperar (o alpha volta a 1 lá em cima).
    if (!this.scene.tweens) { this.bubble.setVisible(false); return; }
    this.scene.tweens.add({
      targets: this.bubble,
      alpha: 0,
      duration: FADE_MS,
      onComplete: () => { if (this.leftMs === 0) this.bubble.setVisible(false); },
    });
  }

  /** Projeta o balão. `anchor` é a posição VISUAL do herói, em tiles. */
  public render(
    tileSize: number,
    camera: WorldCamera,
    timeMs: number,
    anchor: { readonly x: number; readonly y: number },
  ): void {
    if (!this.bubble.visible) return;
    const screen = camera.tileToScreen(anchor.x, anchor.y, tileSize);
    const bob = Math.round(Math.sin(timeMs / BOB_MS) * Math.max(1, Math.round(tileSize / 26)));
    const px = (tileSize * SIZE) / PLATE_W;
    this.plate.setDisplaySize(PLATE_W * px, PLATE_H * px);
    // O ícone mantém a proporção dele: item que não é quadrado não pode sair espremido.
    const side = ICON_SIZE * px;
    const fit = side / Math.max(this.icon.frame.realWidth, this.icon.frame.realHeight);
    this.icon.setDisplaySize(this.icon.frame.realWidth * fit, this.icon.frame.realHeight * fit)
      .setPosition(0, -(PLATE_H - ICON_CENTER_Y) * px);
    this.bubble.setPosition(screen.x, screen.y - tileSize * RISE + PLATE_H * px * 0.5 + bob);
  }

  public destroy(): void {
    this.popTween?.stop();
    this.scene.tweens?.killTweensOf(this.bubble);
    this.bubble.destroy();
  }
}

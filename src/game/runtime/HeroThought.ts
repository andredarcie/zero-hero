import Phaser from 'phaser';

import { SCENE_DEPTHS } from '@/game/constants';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

/**
 * O PENSAMENTO DO HERÓI — um balão com UM ícone, sobre a cabeça dele, por um instante.
 *
 * ── Por que ele existe sem ferir a lei do "nunca uma legenda" ────────────────────────────────
 * A lei da casa é dura e foi paga caro: uma TRAVA responde com física, nunca com texto — o balão
 * de item-que-falta foi arrancado inteiro por isso, porque ele respondia a QUALQUER fechadura
 * ("vá buscar a picareta") e entregava de graça o enigma que o mundo tinha o dever de ensinar.
 *
 * Este é o caso oposto, e a diferença é medível: ele só aparece quando **o jogador já tem a coisa
 * certa na mão e já fez o gesto**. Não há enigma a entregar — há um passo óbvio a lembrar, e o
 * lembrete é a mesma gramática que a caveira já usa (`thought-plate`): ninguém FALA com o
 * jogador, mas alguém pode pensar alto. Por isso a forma é de pensamento e o conteúdo é um ÍCONE:
 * um balão que dissesse palavras seria a legenda de novo, com outra roupa.
 *
 * Quem decide quando mostrar é a cena — esta classe só sabe desenhar e sumir sozinha.
 *
 * ── Ancoragem ───────────────────────────────────────────────────────────────────────────────
 * No corpo DESENHADO (`visualWorld`), nunca no tile lógico: a lógica salta para o destino no
 * primeiro frame do passo, e um overlay preso a ela sairia um tile à frente do herói a cada
 * caminhada. É lei escrita do projeto, e este é o caso exato que ela descreve.
 */

/** Altura do balão sobre o tile, em frações de tile — o corpo inteiro do herói passa por baixo. */
const RISE = 1.6;
/** O tamanho do balão em frações de tile: grande o bastante para o glifo ler, e nunca maior. */
const SIZE = 1.05;
/** Quanto ele fica na tela depois do último pedido. Um aviso que sobrevive ao gesto vira interface. */
const LINGER_MS = 1500;
/** O fade final — ele SOME, nunca corta. */
const FADE_MS = 220;
/** A respiração: um pensamento é uma coisa viva (a mesma cadência do balão da caveira). */
const BOB_MS = 900;

export class HeroThought {
  private readonly bubble: Phaser.GameObjects.Image;
  private leftMs = 0;
  private popTween?: Phaser.Tweens.Tween;
  private current = '';

  public constructor(private readonly scene: Phaser.Scene, texture: string) {
    this.bubble = scene.add.image(-9999, -9999, texture)
      .setOrigin(0.5, 1)
      .setDepth(SCENE_DEPTHS.player + 2)
      .setVisible(false);
    this.current = texture;
  }

  /**
   * PENSE NISTO AGORA. Chamar de novo com o mesmo ícone só renova o relógio — é o que faz o
   * jogador poder martelar o botão sem o balão piscar a cada aperto.
   */
  public show(texture: string): void {
    const fresh = !this.bubble.visible || this.current !== texture;
    if (this.current !== texture) {
      this.bubble.setTexture(texture);
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
    const size = Math.round(tileSize * SIZE);
    this.bubble.setDisplaySize(size, size)
      .setPosition(screen.x, screen.y - tileSize * RISE + bob);
  }

  public destroy(): void {
    this.popTween?.stop();
    this.scene.tweens?.killTweensOf(this.bubble);
    this.bubble.destroy();
  }
}

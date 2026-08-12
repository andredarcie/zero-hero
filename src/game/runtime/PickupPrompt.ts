import Phaser from 'phaser';

import { FONT_FAMILY } from '@/game/constants';
import { TAKE_KEY_TEXTURE, ensureTakeKeyTexture } from '@/game/render3d/placementTexture';
import { isTouchDevice } from '@/game/runtime/PauseMenu';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

/**
 * O AVISO DE APANHAR — o keycap e o NOME do que está debaixo dos pés, acima da cabeça do herói.
 *
 * ── Por que ele existe, e por que ele não fere a lei do "nunca uma legenda" ──────────────────
 * A lei da casa é que uma TRAVA responde com física e nunca com texto: o balão de "falta um item"
 * foi arrancado inteiro por isso. Esta peça é o contrário de uma trava — é um convite. Ela não
 * explica uma recusa, ela **nomeia o alvo de um gesto que vai funcionar**, que é exatamente o que
 * o keycap "Z" sobre a cabeça de um NPC já faz há muito tempo. A diferença entre as duas coisas é
 * a mesma que separa uma placa de rua de um manual: a placa diz onde você está.
 *
 * E ele nasceu de um problema real de mira. Pegar era "o tile da frente primeiro, o de baixo dos
 * pés depois", e num chão com três itens encostados o jogador não tinha como saber qual dos dois
 * tiles o botão ia escolher — apertava esperando o graveto e vinha a picareta. Agora a regra é uma
 * só (**o que você PISA é o que você pega**) e este aviso é o que a torna visível: se o nome está
 * na tela, aquele é o item que sobe.
 *
 * ── O que ele NÃO faz ───────────────────────────────────────────────────────────────────────
 * Ele não pergunta, não tem botão próprio e não pausa nada. Some no frame em que o herói sai do
 * tile ou apanha a coisa. Um aviso que sobrevivesse ao gesto viraria interface.
 *
 * ── Ancoragem ───────────────────────────────────────────────────────────────────────────────
 * No corpo DESENHADO (`visualWorld`), nunca no tile lógico: a lógica salta para o destino no
 * primeiro frame do passo, e um aviso presos a ela sairia um tile na frente do herói toda vez que
 * ele andasse. Essa é uma lei escrita do projeto, e este é o caso exato que ela descreve.
 */

/**
 * Altura do aviso sobre o tile, em frações de tile. Foi medida numa tela, e não escolhida: a 0.92
 * o texto pousava EM CIMA da cabeça e do próprio item que ele nomeia — um aviso que esconde a
 * coisa anunciada. Daqui ele fica com o corpo inteiro por baixo.
 */
const RISE = 1.5;
/** O texto, em frações de tile. O piso existe para telas pequenas, onde a fração some. */
const TEXT_SCALE = 0.13;
const TEXT_MIN_PX = 9;
/** A respiração: um pixel para cima e para baixo, no mesmo ritmo do keycap de instalação. */
const BOB_MS = 280;

export class PickupPrompt {
  private readonly keycap: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private shown = false;

  public constructor(scene: Phaser.Scene) {
    ensureTakeKeyTexture(scene, isTouchDevice());
    this.keycap = scene.add.image(0, 0, TAKE_KEY_TEXTURE)
      .setOrigin(0.5, 0.5)
      .setVisible(false);
    // O contorno grosso não é enfeite: este texto flutua sobre chão, mato, água e fogo, e sem ele
    // o nome desaparece exatamente sobre as coisas claras. É a mesma receita do banner de item.
    this.label = scene.add.text(0, 0, '', {
      fontFamily: FONT_FAMILY,
      fontSize: '10px',
      color: '#ffe9a8',
      stroke: '#231405',
      strokeThickness: 4,
      align: 'left',
      resolution: Math.max(2, Math.ceil(window.devicePixelRatio || 1)),
    }).setOrigin(0, 0.5).setVisible(false);
  }

  /** O nome do que o botão vai apanhar, ou `null` para sumir. */
  public show(name: string | null): void {
    if (name === null) {
      if (!this.shown) return;
      this.shown = false;
      this.keycap.setVisible(false);
      this.label.setVisible(false);
      return;
    }
    if (this.label.text !== name) this.label.setText(name);
    this.shown = true;
  }

  /**
   * Projeta o aviso. `anchor` é a posição VISUAL do herói em tiles (ver o cabeçalho).
   *
   * O par keycap+nome é centrado como um bloco só: medir a largura do texto a cada frame é barato
   * (o Phaser já a mantém) e é o que impede o conjunto de "andar" para o lado quando o nome muda
   * de "Stick" para "Charged Battery".
   */
  public render(
    tileSize: number, camera: WorldCamera, timeMs: number,
    anchor: { readonly x: number; readonly y: number },
  ): void {
    if (!this.shown) return;
    const screen = camera.tileToScreen(anchor.x, anchor.y, tileSize);
    const bob = Math.round(Math.sin(timeMs / BOB_MS) * Math.max(1, Math.round(tileSize / 40)));
    const y = screen.y - tileSize * RISE + bob;

    // O KEYCAP É DIMENSIONADO PELO TEXTO, e não pelo tile. Escalado pelo tile ele saía três vezes
    // a altura da letra — a tecla gritava e o nome, que é a informação, virava legenda dela.
    // O glifo tem sete linhas de altura, então esta divisão faz a tecla e a letra terem o mesmo
    // corpo.
    const size = Math.max(TEXT_MIN_PX, Math.round(tileSize * TEXT_SCALE));
    this.label.setFontSize(size);
    this.keycap.setScale(Math.max(1, Math.round(size / 7)));
    const gap = Math.max(2, Math.round(size * 0.45));
    const total = this.keycap.displayWidth + gap + this.label.width;
    const left = Math.round(screen.x - total / 2);
    this.keycap.setPosition(left + this.keycap.displayWidth / 2, y).setVisible(true);
    this.label.setPosition(left + this.keycap.displayWidth + gap, y).setVisible(true);
  }

  public destroy(): void {
    this.keycap.destroy();
    this.label.destroy();
  }
}

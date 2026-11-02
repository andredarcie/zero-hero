import Phaser from 'phaser';

import { FONT_FAMILY, SCENE_DEPTHS } from '@/game/constants';
import { t } from '@/game/i18n/i18n';
import { PLACEMENT_KEY_TEXTURE, ensurePlacementKeyTexture } from '@/game/render3d/placementTexture';
import { KEY_BG, KEY_BORDER, KEY_GLYPH } from '@/game/runtime/uiStyle';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

/**
 * O QUE A MÃO PODE FAZER AQUI: o balão sobre a cabeça do herói quando há uma coisa que o Z pega ou
 * troca (pedido do autor). Pegar mostra o item, a palavra e a tecla. Trocar mostra o que está na mão,
 * as setas e o que está no chão. Quem decide é `GameScene.currentHandOffer`; esta classe só desenha.
 *
 * Fica até o herói sair dali: ao contrário do `HeroThought`, ela anuncia um estado, não um gesto.
 */

export type HandOfferIcon = { readonly texture: string; readonly frame: number };

/** `held` presente quer dizer TROCA; ausente, o Z só pega. */
export type HandOfferView = { readonly ground: HandOfferIcon; readonly held?: HandOfferIcon };

const ICON = 16;
const ARROWS_W = 9;
const GAP = 3;
const PAD = 4;
const TAIL = 3;
const KEY_H = 13;
const KEY_W = 11;
const FONT_ART = 8;

/** As setas da troca, em pixels de arte: uma para cada lado. */
const ARROWS = [
  '......#..',
  '.......#.',
  '#########',
  '.......#.',
  '......#..',
  '.........',
  '..#......',
  '.#.......',
  '#########',
  '.#.......',
  '..#......',
];

const color = (hex: string): number => Phaser.Display.Color.HexStringToColor(hex).color;

const sameIcon = (a?: HandOfferIcon, b?: HandOfferIcon): boolean =>
  a?.texture === b?.texture && a?.frame === b?.frame;

export class HandOffer {
  private readonly bubble: Phaser.GameObjects.Container;
  private readonly plate: Phaser.GameObjects.Graphics;
  private readonly heldIcon: Phaser.GameObjects.Image;
  private readonly groundIcon: Phaser.GameObjects.Image;
  private readonly key: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private view: HandOfferView | null = null;
  private laidOutPx = 0;
  private plateH = 0;
  private popTween?: Phaser.Tweens.Tween;

  public constructor(private readonly scene: Phaser.Scene, touch: boolean) {
    ensurePlacementKeyTexture(scene, touch);
    this.plate = scene.add.graphics();
    this.heldIcon = scene.add.image(0, 0, PLACEMENT_KEY_TEXTURE);
    this.groundIcon = scene.add.image(0, 0, PLACEMENT_KEY_TEXTURE);
    this.key = scene.add.image(0, 0, PLACEMENT_KEY_TEXTURE);
    // A letra acompanha a densidade da tela: com a resolução padrão ela sai borrada num celular.
    this.label = scene.add.text(0, 0, '', { fontFamily: FONT_FAMILY, color: KEY_GLYPH })
      .setOrigin(0, 0.5)
      .setResolution(Math.max(1, Math.ceil(window.devicePixelRatio || 1)));
    this.bubble = scene.add.container(-9999, -9999, [this.plate, this.heldIcon, this.groundIcon, this.key, this.label])
      .setDepth(SCENE_DEPTHS.player + 2)
      .setVisible(false);
  }

  /** O que está na tela agora, ou `null` — a janela do playtest sobre esta peça. */
  public get visibleMode(): 'take' | 'swap' | null {
    if (!this.bubble.visible || !this.view) return null;
    return this.view.held ? 'swap' : 'take';
  }

  /** `view` nulo esconde. `anchor` é a posição VISUAL do herói, em tiles. */
  public render(
    view: HandOfferView | null,
    tileSize: number,
    camera: WorldCamera,
    timeMs: number,
    anchor: { readonly x: number; readonly y: number },
  ): void {
    if (!view) {
      this.view = null;
      this.popTween?.stop();
      this.bubble.setVisible(false);
      return;
    }
    const px = Math.max(1, Math.round(tileSize / 32));
    const changed = !this.view || !sameIcon(this.view.ground, view.ground) || !sameIcon(this.view.held, view.held);
    if (changed || px !== this.laidOutPx) this.layout(view, px);
    if (changed) this.pop();
    this.view = view;
    const screen = camera.tileToScreen(anchor.x, anchor.y, tileSize);
    const bob = Math.round(Math.sin(timeMs / 450) * px);
    // O container cresce a partir da ponta do rabicho, que fica logo acima da cabeça.
    this.bubble.setVisible(true).setPosition(screen.x, screen.y - tileSize * 1.25 + bob);
  }

  private pop(): void {
    this.popTween?.stop();
    this.bubble.setScale(0);
    this.popTween = this.scene.tweens.add({ targets: this.bubble, scale: 1, duration: 160, ease: 'Back.easeOut' });
  }

  private placeIcon(icon: Phaser.GameObjects.Image, source: HandOfferIcon, cx: number, cy: number, px: number): void {
    icon.setTexture(source.texture, source.frame);
    const fit = (ICON * px) / Math.max(icon.frame.realWidth, icon.frame.realHeight);
    icon.setDisplaySize(icon.frame.realWidth * fit, icon.frame.realHeight * fit).setPosition(cx, cy).setVisible(true);
  }

  /** Mede a palavra e desenha a placa em volta dela: cada língua tem o tamanho dela. */
  private layout(view: HandOfferView, px: number): void {
    this.laidOutPx = px;
    this.label.setFontSize(FONT_ART * px).setText(t(view.held ? 'controls.swap' : 'controls.take'));
    const labelW = Math.ceil(this.label.width / px);
    const rowW = labelW + GAP + KEY_W;
    const iconsW = view.held ? ICON + GAP + ARROWS_W + GAP + ICON : ICON;
    const inner = Math.max(rowW, iconsW);
    // Par: a ponta do rabicho e o miolo caem no mesmo pixel.
    const w = (inner + PAD * 2 + 1) & ~1;
    this.plateH = PAD + ICON + GAP + KEY_H + PAD;
    const left = -(w / 2) * px;
    const top = -(this.plateH + TAIL) * px;
    this.drawPlate(view, w, left, top, px);

    const iconsCy = top + (PAD + ICON / 2) * px;
    if (view.held) {
      const startX = -(iconsW / 2) * px;
      this.placeIcon(this.heldIcon, view.held, startX + (ICON / 2) * px, iconsCy, px);
      this.placeIcon(this.groundIcon, view.ground, startX + (iconsW - ICON / 2) * px, iconsCy, px);
    } else {
      this.heldIcon.setVisible(false);
      this.placeIcon(this.groundIcon, view.ground, 0, iconsCy, px);
    }

    const rowCy = top + (PAD + ICON + GAP + KEY_H / 2) * px;
    const rowLeft = -(rowW / 2) * px;
    this.label.setPosition(rowLeft, rowCy);
    this.key.setScale(px).setPosition(rowLeft + (labelW + GAP + KEY_W / 2) * px, rowCy);
  }

  private drawPlate(view: HandOfferView, w: number, left: number, top: number, px: number): void {
    const g = this.plate.clear();
    const h = this.plateH;
    const rect = (hex: string, x: number, y: number, rw: number, rh: number): void => {
      g.fillStyle(color(hex), 1);
      g.fillRect(left + x * px, top + y * px, rw * px, rh * px);
    };
    // A tecla do mundo: borda de um pixel e os cantos vazados.
    rect(KEY_BORDER, 1, 0, w - 2, h);
    rect(KEY_BORDER, 0, 1, w, h - 2);
    rect(KEY_BG, 1, 1, w - 2, h - 2);
    // O rabicho que aponta para a cabeça.
    const mid = w / 2;
    rect(KEY_BORDER, mid - 3, h - 1, 6, 1);
    rect(KEY_BG, mid - 2, h - 1, 4, 1);
    rect(KEY_BORDER, mid - 2, h, 4, 1);
    rect(KEY_BG, mid - 1, h, 2, 1);
    rect(KEY_BORDER, mid - 1, h + 1, 2, 1);
    if (!view.held) return;
    const ax = mid - ARROWS_W / 2;
    const ay = PAD + (ICON - ARROWS.length) / 2;
    ARROWS.forEach((row, y) => {
      for (let x = 0; x < row.length; x += 1) if (row[x] === '#') rect(KEY_BORDER, ax + x, ay + y, 1, 1);
    });
  }

  public destroy(): void {
    this.popTween?.stop();
    this.scene.tweens?.killTweensOf(this.bubble);
    this.bubble.destroy();
  }
}

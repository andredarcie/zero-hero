import Phaser from 'phaser';

import { FONT_FAMILY, SCENE_DEPTHS } from '@/game/constants';
import { keycapTexture } from '@/game/render3d/placementTexture';
import { getKeyLetter, getTextScale, isReducedMotion } from '@/game/runtime/accessibility';
import { KEY_BG, KEY_BORDER, KEY_GLYPH } from '@/game/runtime/uiStyle';
import type { WorldCamera } from '@/game/runtime/WorldCamera';

/**
 * O QUE OS BOTÕES FAZEM AQUI: o balão único de toda interação do jogo (pedido do autor), com a palavra
 * e a tecla de cada gesto possível. Pegar e trocar mostram também os desenhos das coisas. Quem decide
 * é `GameScene.currentPrompt`, que segue a mesma ordem dos botões; esta classe só desenha.
 *
 * Fica enquanto a ação existir: ao contrário do `HeroThought`, ela anuncia um estado, não um gesto.
 */

export type PromptIcon = { readonly texture: string; readonly frame: number };

/** `hand` é o Z (A no toque), e `use` é o X (B no toque). */
export type PromptRow = { readonly label: string; readonly key: 'hand' | 'use' };

export type ActionPromptView = {
  readonly rows: readonly PromptRow[];
  /** A coisa no chão: aparece no pegar e no trocar. */
  readonly ground?: PromptIcon;
  /** A coisa na mão: presente só na troca. */
  readonly held?: PromptIcon;
};

const ICON = 16;
const ARROWS_W = 9;
const GAP = 3;
const PAD = 4;
const TAIL = 3;
const KEY_H = 13;
const KEY_W = 11;
const FONT_ART = 7;
const MAX_ROWS = 2;

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

export class ActionPrompt {
  private readonly bubble: Phaser.GameObjects.Container;
  private readonly plate: Phaser.GameObjects.Graphics;
  private readonly heldIcon: Phaser.GameObjects.Image;
  private readonly groundIcon: Phaser.GameObjects.Image;
  private readonly keys: Phaser.GameObjects.Image[] = [];
  private readonly labels: Phaser.GameObjects.Text[] = [];
  private shown: string | null = null;
  private shownRows: readonly string[] = [];
  private laidOutPx = 0;
  private popTween?: Phaser.Tweens.Tween;

  public constructor(private readonly scene: Phaser.Scene, private readonly touch: boolean) {
    const blank = keycapTexture(scene, this.letterOf('hand'));
    this.plate = scene.add.graphics();
    this.heldIcon = scene.add.image(0, 0, blank);
    this.groundIcon = scene.add.image(0, 0, blank);
    for (let i = 0; i < MAX_ROWS; i += 1) {
      this.keys.push(scene.add.image(0, 0, blank));
      // A letra acompanha a densidade da tela: com a resolução padrão ela sai borrada num celular.
      this.labels.push(scene.add.text(0, 0, '', { fontFamily: FONT_FAMILY, color: KEY_GLYPH })
        .setOrigin(0, 0.5)
        .setResolution(Math.max(1, Math.ceil(window.devicePixelRatio || 1))));
    }
    this.bubble = scene.add.container(-9999, -9999, [this.plate, this.heldIcon, this.groundIcon, ...this.keys, ...this.labels])
      .setDepth(SCENE_DEPTHS.player + 2)
      .setVisible(false);
  }

  /** No toque os botões têm nome fixo; no teclado a tecla é a que a pessoa escolheu. */
  private letterOf(key: PromptRow['key']): string {
    if (this.touch) return key === 'hand' ? 'A' : 'B';
    return getKeyLetter(key);
  }

  /** As palavras que estão na tela agora — a janela do playtest sobre esta peça. */
  public get visibleLabels(): readonly string[] {
    return this.bubble.visible ? this.shownRows : [];
  }

  /** `view` nulo esconde. `anchor` é onde o balão aponta, em tiles. */
  public render(
    view: ActionPromptView | null,
    tileSize: number,
    camera: WorldCamera,
    timeMs: number,
    anchor: { readonly x: number; readonly y: number },
  ): void {
    if (!view) {
      this.shown = null;
      this.popTween?.stop();
      this.bubble.setVisible(false);
      return;
    }
    const px = Math.max(1, Math.round((tileSize / 32) * getTextScale()));
    const sign = `${JSON.stringify(view)}|${this.letterOf('hand')}|${this.letterOf('use')}`;
    const changed = sign !== this.shown;
    if (changed || px !== this.laidOutPx) this.layout(view, px);
    if (changed) this.pop();
    this.shown = sign;
    this.shownRows = view.rows.map((row) => row.label);
    const screen = camera.tileToScreen(anchor.x, anchor.y, tileSize);
    const bob = isReducedMotion() ? 0 : Math.round(Math.sin(timeMs / 450) * px);
    // O container cresce a partir da ponta do rabicho, que fica logo acima da coisa.
    this.bubble.setVisible(true).setPosition(screen.x, screen.y - tileSize * 1.25 + bob);
  }

  private pop(): void {
    this.popTween?.stop();
    this.bubble.setScale(0);
    this.popTween = this.scene.tweens.add({ targets: this.bubble, scale: 1, duration: 160, ease: 'Back.easeOut' });
  }

  private placeIcon(icon: Phaser.GameObjects.Image, source: PromptIcon, cx: number, cy: number, px: number): void {
    icon.setTexture(source.texture, source.frame);
    const fit = (ICON * px) / Math.max(icon.frame.realWidth, icon.frame.realHeight);
    icon.setDisplaySize(icon.frame.realWidth * fit, icon.frame.realHeight * fit).setPosition(cx, cy).setVisible(true);
  }

  /** Mede as palavras e desenha a placa em volta delas: cada língua tem o tamanho dela. */
  private layout(view: ActionPromptView, px: number): void {
    this.laidOutPx = px;
    const rows = view.rows.slice(0, MAX_ROWS);
    const widths = this.labels.map((label, i) => {
      const row = rows[i];
      label.setVisible(row !== undefined);
      this.keys[i].setVisible(row !== undefined);
      if (!row) return 0;
      label.setFontSize(FONT_ART * px).setText(row.label);
      return Math.ceil(label.width / px);
    });
    const labelW = Math.max(...widths);
    const rowW = labelW + GAP + KEY_W;
    const hasIcons = view.ground !== undefined;
    const iconsW = view.held ? ICON + GAP + ARROWS_W + GAP + ICON : ICON;
    const inner = Math.max(rowW, hasIcons ? iconsW : 0);
    // Par: a ponta do rabicho e o miolo caem no mesmo pixel.
    const w = (inner + PAD * 2 + 1) & ~1;
    const iconsH = hasIcons ? ICON + GAP : 0;
    const h = PAD + iconsH + rows.length * KEY_H + (rows.length - 1) * GAP + PAD;
    const left = -(w / 2) * px;
    const top = -(h + TAIL) * px;
    this.drawPlate(view, w, h, left, top, px);

    this.heldIcon.setVisible(false);
    this.groundIcon.setVisible(false);
    const iconsCy = top + (PAD + ICON / 2) * px;
    if (view.ground && view.held) {
      const startX = -(iconsW / 2) * px;
      this.placeIcon(this.heldIcon, view.held, startX + (ICON / 2) * px, iconsCy, px);
      this.placeIcon(this.groundIcon, view.ground, startX + (iconsW - ICON / 2) * px, iconsCy, px);
    } else if (view.ground) {
      this.placeIcon(this.groundIcon, view.ground, 0, iconsCy, px);
    }

    // As teclas ficam na mesma coluna, as palavras alinhadas à esquerda.
    const rowLeft = -(rowW / 2) * px;
    rows.forEach((row, i) => {
      const cy = top + (PAD + iconsH + i * (KEY_H + GAP) + KEY_H / 2) * px;
      this.labels[i].setPosition(rowLeft, cy);
      this.keys[i]
        .setTexture(keycapTexture(this.scene, this.letterOf(row.key)))
        .setScale(px)
        .setPosition(rowLeft + (labelW + GAP + KEY_W / 2) * px, cy);
    });
  }

  private drawPlate(view: ActionPromptView, w: number, h: number, left: number, top: number, px: number): void {
    const g = this.plate.clear();
    const rect = (hex: string, x: number, y: number, rw: number, rh: number): void => {
      g.fillStyle(color(hex), 1);
      g.fillRect(left + x * px, top + y * px, rw * px, rh * px);
    };
    // A tecla do mundo: borda de um pixel e os cantos vazados.
    rect(KEY_BORDER, 1, 0, w - 2, h);
    rect(KEY_BORDER, 0, 1, w, h - 2);
    rect(KEY_BG, 1, 1, w - 2, h - 2);
    // O rabicho que aponta para a coisa.
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

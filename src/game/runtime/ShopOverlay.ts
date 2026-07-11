import Phaser from 'phaser';

import { ASSET_KEYS, FONT_FAMILY, HERO_FRAMES, SCENE_DEPTHS, TEXT_RESOLUTION } from '@/game/constants';
import { t } from '@/game/i18n/i18n';

export type UpgradeId = 'maxHealth' | 'swordSpeed' | 'moveSpeed' | 'magnet';

export interface UpgradeState {
  maxHealth: number;
  swordSpeed: number;
  moveSpeed: number;
  magnet: number;
}

interface UpgradeCfg {
  readonly id: UpgradeId;
  readonly label: string;
  readonly iconKey: string;
  readonly iconFrame: number;
  readonly desc: string;
  readonly maxLevel: number;
  readonly costs: readonly number[];
}

const FULL_HEART_FRAME = 4;

export const UPGRADES_CFG: readonly UpgradeCfg[] = [
  { id: 'maxHealth',  label: 'VIDA MAX',   iconKey: ASSET_KEYS.hudHearts,    iconFrame: FULL_HEART_FRAME, desc: '+1 coracao maximo',     maxLevel: 3, costs: [8, 18, 35] },
  { id: 'swordSpeed', label: 'ESPADA +',   iconKey: ASSET_KEYS.swordItemIcon, iconFrame: 0,               desc: 'Ataque mais rapido',    maxLevel: 3, costs: [6, 14, 28] },
  { id: 'moveSpeed',  label: 'PASSO +',    iconKey: ASSET_KEYS.hero,          iconFrame: HERO_FRAMES.idleDown, desc: 'Move mais rapido', maxLevel: 3, costs: [10, 22, 40] },
  { id: 'magnet',     label: 'IMA MOEDAS', iconKey: ASSET_KEYS.coin,          iconFrame: 0,               desc: 'Atrai moedas proximas', maxLevel: 1, costs: [15] },
] as const;

export const getUpgradeCost = (id: UpgradeId, level: number): number | null => {
  const cfg = UPGRADES_CFG.find((u) => u.id === id)!;
  return level >= cfg.maxLevel ? null : cfg.costs[level];
};

const DEPTH = SCENE_DEPTHS.toast + 10;
const MAX_SHOP_ITEMS = 3;
const CARD_H = 88;
const CARD_GAP = 6;
const PAD = 12;
const BTN_H = 36;
const HEADER_H = 48;
const ICON_SIZE = 22;

const dots = (level: number, max: number): string => '●'.repeat(level) + '○'.repeat(max - level);

interface CardObjects {
  bg: Phaser.GameObjects.Rectangle;
  icon: Phaser.GameObjects.Image;
  nameText: Phaser.GameObjects.Text;
  descText: Phaser.GameObjects.Text;
  dotsText: Phaser.GameObjects.Text;
  btnBg: Phaser.GameObjects.Rectangle;
  btnLabel: Phaser.GameObjects.Text;
}

export class ShopOverlay {
  private readonly all: Phaser.GameObjects.GameObject[] = [];
  private readonly coinLabel: Phaser.GameObjects.Text;
  private readonly cards: CardObjects[];
  private readonly selectedCfgs: readonly UpgradeCfg[];

  private currentCoins: number;
  private currentUpgrades: UpgradeState;

  private readonly cardX: number;
  private readonly cardW: number;
  private readonly firstCardY: number;

  public constructor(
    private readonly scene: Phaser.Scene,
    coins: number,
    upgrades: UpgradeState,
    private readonly onBuy: (id: UpgradeId) => void,
    onClose: () => void,
  ) {
    this.currentCoins = coins;
    this.currentUpgrades = { ...upgrades };

    // pick 3 random upgrades each time the shop opens
    const shuffled = [...UPGRADES_CFG].sort(() => Math.random() - 0.5);
    this.selectedCfgs = shuffled.slice(0, MAX_SHOP_ITEMS);

    const { width, height } = scene.scale;
    const cx = width / 2;
    const panelW = Math.min(Math.round(width * 0.94), 360);
    const panelH = HEADER_H + MAX_SHOP_ITEMS * (CARD_H + CARD_GAP) - CARD_GAP + PAD * 2;
    const panelX = cx - panelW / 2;
    const panelY = Math.round((height - panelH) / 2);

    this.cardX = panelX + PAD;
    this.cardW = panelW - PAD * 2;
    this.firstCardY = panelY + HEADER_H;

    const reg = <T extends Phaser.GameObjects.GameObject>(o: T): T => { this.all.push(o); return o; };
    const txt = (x: number, y: number, s: string, size: number, color: string, origin = [0, 0] as [number, number]) =>
      reg(scene.add.text(x, y, s, { fontFamily: FONT_FAMILY, fontSize: `${size}px`, color, resolution: TEXT_RESOLUTION })
        .setOrigin(...origin).setDepth(DEPTH + 2));

    // backdrop
    reg(scene.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0).setDepth(DEPTH).setInteractive());
    // panel
    reg(scene.add.rectangle(cx, panelY + panelH / 2, panelW, panelH, 0x0e0c20).setOrigin(0.5).setDepth(DEPTH + 1).setStrokeStyle(2, 0x5533aa));

    // header
    txt(panelX + PAD, panelY + 14, t('shop.title'), 10, '#ddc8ff');
    this.coinLabel = txt(cx, panelY + 14, `$ ${coins}`, 9, '#ffd700', [0.5, 0]);

    // close button
    const closeBtn = reg(scene.add.rectangle(panelX + panelW - 20, panelY + 14, 32, 32, 0x000000, 0).setOrigin(0.5, 0).setDepth(DEPTH + 2).setInteractive({ useHandCursor: true }));
    const closeLabel = txt(panelX + panelW - 20, panelY + 14, 'X', 10, '#aa88cc', [0.5, 0]);
    closeBtn.on('pointerdown', () => onClose());
    closeLabel.setInteractive({ useHandCursor: true }).on('pointerdown', () => onClose());

    // 3 card slots
    this.cards = Array.from({ length: MAX_SHOP_ITEMS }, (_, i) => this.buildCard(reg, txt, i));

    this.refresh(coins, upgrades);
  }

  public refresh(coins: number, upgrades: UpgradeState): void {
    this.currentCoins = coins;
    this.currentUpgrades = { ...upgrades };
    this.coinLabel.setText(`$ ${coins}`);
    this.renderCards();
  }

  public destroy(): void {
    for (const obj of this.all) obj.destroy();
  }

  private renderCards(): void {
    for (let slot = 0; slot < MAX_SHOP_ITEMS; slot++) {
      const card = this.cards[slot];
      const cfg = this.selectedCfgs[slot];

      if (!cfg) {
        card.bg.setVisible(false);
        card.icon.setVisible(false);
        card.nameText.setVisible(false);
        card.descText.setVisible(false);
        card.dotsText.setVisible(false);
        card.btnBg.setVisible(false).disableInteractive();
        card.btnLabel.setVisible(false).disableInteractive();
        continue;
      }

      const level = this.currentUpgrades[cfg.id];
      const cost = getUpgradeCost(cfg.id, level);
      const maxed = cost === null;
      const affordable = !maxed && this.currentCoins >= cost!;

      card.bg.setVisible(true);
      card.icon.setVisible(true).setTexture(cfg.iconKey, cfg.iconFrame).setDisplaySize(ICON_SIZE, ICON_SIZE);
      card.nameText.setVisible(true).setText(t(`shop.upgrades.${cfg.id}.label`));
      card.descText.setVisible(true).setText(t(`shop.upgrades.${cfg.id}.desc`));
      card.dotsText.setVisible(true).setText(dots(level, cfg.maxLevel)).setColor(level > 0 ? '#cc99ff' : '#443355');

      card.btnBg.setVisible(true).setFillStyle(maxed ? 0x1a1830 : (affordable ? 0x3a1a88 : 0x1a1038));

      const btnText = maxed ? t('shop.max') : `${t('shop.buy')}  $ ${cost}`;
      const btnColor = maxed ? '#443355' : (affordable ? '#ffffff' : '#664466');
      card.btnLabel.setVisible(true).setText(btnText).setColor(btnColor);

      card.btnBg.removeAllListeners('pointerdown');
      card.btnLabel.removeAllListeners('pointerdown');

      if (!maxed && affordable) {
        card.btnBg.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.onBuy(cfg.id));
        card.btnLabel.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.onBuy(cfg.id));
      } else {
        card.btnBg.disableInteractive();
        card.btnLabel.disableInteractive();
      }
    }
  }

  private buildCard(
    reg: <T extends Phaser.GameObjects.GameObject>(o: T) => T,
    txt: (x: number, y: number, s: string, size: number, color: string, origin?: [number, number]) => Phaser.GameObjects.Text,
    slot: number,
  ): CardObjects {
    const y = this.firstCardY + slot * (CARD_H + CARD_GAP);
    const cx = this.cardX + this.cardW / 2;
    const d = DEPTH + 2;
    const iconX = this.cardX + PAD + ICON_SIZE / 2;
    const iconY = y + CARD_H / 2 - BTN_H / 2 - 2;

    const bg = reg(this.scene.add.rectangle(cx, y + CARD_H / 2, this.cardW, CARD_H, 0x1a1640).setDepth(d - 1).setStrokeStyle(1, 0x332266));
    const icon = reg(this.scene.add.image(iconX, iconY, ASSET_KEYS.coin).setOrigin(0.5).setDisplaySize(ICON_SIZE, ICON_SIZE).setDepth(d).setVisible(false));
    const textX = this.cardX + PAD * 2 + ICON_SIZE;
    const nameText = txt(textX, y + 10, '', 8, '#e8d8ff');
    const descText = txt(textX, y + 26, '', 7, '#9988aa');
    const dotsText = txt(textX, y + 42, '', 8, '#cc99ff');

    const btnY = y + CARD_H - BTN_H / 2 - 4;
    const btnBg = reg(this.scene.add.rectangle(cx, btnY, this.cardW - 8, BTN_H, 0x1a1038).setDepth(d).setStrokeStyle(1, 0x5533aa));
    const btnLabel = reg(this.scene.add.text(cx, btnY, '', { fontFamily: FONT_FAMILY, fontSize: '8px', color: '#ffffff', resolution: TEXT_RESOLUTION }).setOrigin(0.5).setDepth(d + 1));

    return { bg, icon, nameText, descText, dotsText, btnBg, btnLabel };
  }
}

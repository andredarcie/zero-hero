import Phaser from 'phaser';

import { FONT_FAMILY, TEXT_RESOLUTION } from '@/game/constants';
import { getSoundManager } from '@/game/audio/SoundManager';
import { t, tWords } from '@/game/i18n/i18n';
import {
  adventureState, hasAdventureSave, requestAdventureRespawn, resetAdventure,
} from '@/game/runtime/adventureState';
import { KEY_BG, KEY_BORDER } from '@/game/runtime/uiStyle';
import { setWorldData } from '@/game/world/WorldData';

// The game's start screen, and now the ONLY screen between the loader and the world: the title,
// the credit, and the door in.
//
//   • Sem save (ou com a jornada ja terminada): um botao, Begin.
//   • Com uma jornada em curso: Continue (de onde parou) e, discreto, New journey.
//
// The former authored Zelda-like overworld is archived under backup/ and has no door here.
//
// Being the first screen, it also owns audio bring-up: the AudioContext stays locked until a user
// gesture, so the menu bed is queued here and blooms on the first key/tap.
// Os botoes sao TECLAS DE PIXEL na paleta do keycap do mundo (ver runtime/uiStyle): a tecla
// apagada e a acesa. Eram retangulos lisos num cinza-azulado que nao existe em nenhum outro lugar.
const BTN_DIM = { bg: 'rgba(36, 29, 15, 0.82)', border: '#6b5b2c' };
const BTN_LIT = { bg: KEY_BG, border: KEY_BORDER };

interface MenuButton {
  bg: Phaser.GameObjects.Rectangle;
  key: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  textures: [string, string];
  activate: () => void;
}

export class TitleScene extends Phaser.Scene {
  public static readonly key = 'title';

  private buttons: MenuButton[] = [];
  private selected = 0;
  private starting = false;

  public constructor() {
    super(TitleScene.key);
  }

  public create(): void {
    const { width, height } = this.scale;
    this.starting = false;
    this.buttons = [];
    this.selected = 0;
    this.cameras.main.setBackgroundColor('#08080d');
    this.cameras.main.fadeIn(500, 0, 0, 0);

    // Decode the SFX + loops and queue the menu ambience. It is silent until the first gesture
    // lifts the autoplay lock (unlockAudio, below) — this screen is where that gesture lands.
    getSoundManager().preload();
    getSoundManager().startMusic('menu', 1600);

    const titleSize = Phaser.Math.Clamp(Math.floor(width / 18), 20, 56);
    const creditSize = Phaser.Math.Clamp(Math.floor(width / 46), 9, 18);

    this.add
      .text(width / 2, Math.round(height * 0.32), tWords('title.words').join(' '), {
        fontFamily: FONT_FAMILY, fontSize: `${titleSize}px`, color: '#e7dcc4', resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(2);

    this.add
      .text(width / 2, Math.round(height * 0.46), `${t('title.by')} ${t('title.author')}`, {
        fontFamily: FONT_FAMILY, fontSize: `${creditSize}px`, color: '#a89c7e', resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(2);

    // Uma jornada que ja viu os creditos nao tem de onde "continuar": o vale inteiro ja foi
    // ajudado, e a porta certa e comecar de novo.
    const resumable = hasAdventureSave() && !adventureState().endingSeen;
    this.buttons = resumable
      ? [
        this.makeButton(0, t('title.continue'), Math.round(height * 0.62), () => this.startAdventure(false)),
        this.makeButton(1, t('title.startOver'), Math.round(height * 0.75), () => this.startAdventure(true)),
      ]
      : [this.makeButton(0, t('title.playAdventure'), Math.round(height * 0.66), () => this.startAdventure(true))];
    this.applySelection();

    // Arm input a beat later so the key/tap that dismissed the loader can't fire the button.
    this.time.delayedCall(300, () => {
      this.input.keyboard?.on('keydown', this.handleKey, this);
      this.input.on(Phaser.Input.Events.POINTER_DOWN, this.unlockAudio, this);
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.teardown, this);
  }

  // O indice vem de quem chama: os botoes nascem DENTRO do literal que vira this.buttons, entao
  // this.buttons.length ainda vale 0 para todos eles (o hover do segundo acendia o primeiro).
  private makeButton(index: number, text: string, y: number, activate: () => void): MenuButton {
    const { width } = this.scale;
    const w = Phaser.Math.Clamp(width * 0.42, 200, 360);
    const h = Phaser.Math.Clamp(this.scale.height * 0.09, 40, 64);
    // O retangulo e so a area de toque; o que se ve e a tecla de pixel por cima dele.
    const bg = this.add
      .rectangle(width / 2, y, w, h, 0x000000, 0)
      .setDepth(1)
      .setInteractive({ useHandCursor: true });
    const px = Math.max(2, Math.round(h / 14));
    const textures: [string, string] = [
      this.keyTexture(`title-key-${index}-dim`, Math.round(w / px), Math.round(h / px), BTN_DIM),
      this.keyTexture(`title-key-${index}-lit`, Math.round(w / px), Math.round(h / px), BTN_LIT),
    ];
    const key = this.add.image(width / 2, y, textures[0]).setScale(px).setDepth(1);
    const label = this.add
      .text(width / 2, y, text, {
        fontFamily: FONT_FAMILY,
        fontSize: `${Phaser.Math.Clamp(Math.floor(width / 40), 11, 22)}px`,
        color: '#cfc9bd',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(2);

    bg.on(Phaser.Input.Events.POINTER_OVER, () => this.setSelected(index));
    bg.on(Phaser.Input.Events.POINTER_DOWN, () => { this.unlockAudio(); this.setSelected(index); activate(); });
    return { bg, key, label, textures, activate };
  }

  /** A tecla de pixel: fundo, borda de 1 pixel e os cantos vazados em escada (o keycap do mundo). */
  private keyTexture(name: string, gw: number, gh: number, c: { bg: string; border: string }): string {
    if (this.textures.exists(name)) this.textures.remove(name);
    const canvas = this.textures.createCanvas(name, gw, gh);
    if (!canvas) return name;
    const ctx = canvas.getContext();
    for (let y = 0; y < gh; y += 1) {
      for (let x = 0; x < gw; x += 1) {
        const dx = Math.min(x, gw - 1 - x);
        const dy = Math.min(y, gh - 1 - y);
        if (dx === 0 && dy === 0) continue;              // o canto vazado
        const edge = dx === 0 || dy === 0;
        ctx.fillStyle = edge ? c.border : c.bg;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    canvas.refresh();
    canvas.setFilter(Phaser.Textures.FilterMode.NEAREST);
    return name;
  }

  // First gesture on this (the first) screen lifts the autoplay lock so the menu bed sounds.
  private unlockAudio(): void {
    getSoundManager().unlock();
  }

  private setSelected(index: number): void {
    if (this.starting || index === this.selected) return;
    this.selected = index;
    this.applySelection();
    getSoundManager().playWaterDrop();
  }

  private applySelection(): void {
    this.buttons.forEach((btn, i) => {
      const sel = i === this.selected;
      btn.key.setTexture(btn.textures[sel ? 1 : 0]);
      btn.label.setColor(sel ? '#fff2c8' : '#b9ae94');
    });
  }

  private readonly handleKey = (event: KeyboardEvent): void => {
    this.unlockAudio();
    if (this.starting) return;
    // Enter/espaco ativam o selecionado; 1 e sempre a porta principal. Setas so existem quando
    // ha um segundo botao (o Start over do save) — e "qualquer tecla" continua nao valendo, ou
    // um ESC de reflexo comecaria a aventura.
    switch (event.key) {
      case 'Enter':
      case ' ':
        this.buttons[this.selected]?.activate();
        break;
      case '1':
        this.buttons[0]?.activate();
        break;
      case '2':
        this.buttons[1]?.activate();
        break;
      case 'ArrowUp':
      case 'ArrowDown':
        if (this.buttons.length > 1) {
          this.setSelected((this.selected + (event.key === 'ArrowDown' ? 1 : this.buttons.length - 1)) % this.buttons.length);
        }
        break;
      default:
        break;
    }
  };

  private fadeThen(go: () => void): void {
    if (this.starting) return;
    this.starting = true;
    getSoundManager().unlock();
    this.cameras.main.fadeOut(400, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, go);
  }

  /**
   * ENTRAR NO VALE. O `world.json` volta do disco antes de toda entrada: o mundo em memoria pode
   * estar mexido (arvores derrubadas, canteiros cavados), e tudo o que merece viver mora no save,
   * que reaplica os proprios diffs no create.
   */
  private startAdventure(fresh: boolean): void {
    this.fadeThen(() => {
      if (fresh) resetAdventure();
      else requestAdventureRespawn();
      void window.fetch(`${import.meta.env.BASE_URL}world.json`, { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : undefined))
        .then((json) => { if (json) setWorldData(json); })
        .catch(() => undefined)
        .finally(() => this.scene.start('game'));
    });
  }

  private teardown(): void {
    this.input.keyboard?.off('keydown', this.handleKey, this);
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.unlockAudio, this);
    // As teclas sao texturas geradas para ESTA tela (o tamanho segue a janela): saem com ela.
    for (const btn of this.buttons) {
      for (const key of btn.textures) if (this.textures.exists(key)) this.textures.remove(key);
    }
  }
}

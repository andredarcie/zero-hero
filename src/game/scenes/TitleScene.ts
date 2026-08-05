import Phaser from 'phaser';

import { FONT_FAMILY, TEXT_RESOLUTION } from '@/game/constants';
import { getSoundManager } from '@/game/audio/SoundManager';
import { setActiveLevel } from '@/game/runtime/activeLevel';
import { clearDungeonTrip } from '@/game/runtime/dungeonTrip';
import { endExplorerMode } from '@/game/explorer/explorerRun';
import { hasAdventureSave, requestAdventureRespawn, resetAdventure } from '@/game/runtime/adventureState';
import { setWorldData } from '@/game/world/WorldData';
import { t, tWords } from '@/game/i18n/i18n';

// The game's start screen, and now the ONLY screen between the loader and the world: the title,
// the credit, and one button.
//
//   • Play adventure → the overworld, immediately. No language pick (the game is English only)
//     and no intro cut-scene — the door is the door.
//
// Os levels e o explorador continuam vivos e nao tem mais porta AQUI: `/?level=N` boota um level,
// `?explorer` boota uma expedicao, e o menu de pausa de um level ainda volta pra LevelSelectScene.
//
// Being the first screen, it also owns audio bring-up: the AudioContext stays locked until a user
// gesture, so the menu bed is queued here and blooms on the first key/tap.
const ACCENT = 0xf5d97a;
const BTN_FILL = 0x14141f;
const BTN_FILL_SEL = 0x22222f;
const BTN_STROKE = 0x3a3a4a;

interface MenuButton {
  bg: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
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
        fontFamily: FONT_FAMILY, fontSize: `${creditSize}px`, color: '#8a8594', resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(2);

    // The one door — que agora sabe LEMBRAR. Com um save de aventura o botao vira Continue
    // (mesmo lugar, mesmo gesto: Enter continua de onde parou) e um segundo botao discreto
    // oferece o recomeco. Sem save, tudo como sempre: uma porta so.
    if (hasAdventureSave()) {
      this.buttons = [
        this.makeButton(t('title.continue'), Math.round(height * 0.62), () => this.continueAdventure()),
        this.makeButton(t('title.startOver'), Math.round(height * 0.76), () => this.startOver()),
      ];
    } else {
      this.buttons = [
        this.makeButton(t('title.playAdventure'), Math.round(height * 0.66), () => this.startAdventure()),
      ];
    }
    this.applySelection();

    // Arm input a beat later so the key/tap that dismissed the loader can't fire the button.
    this.time.delayedCall(300, () => {
      this.input.keyboard?.on('keydown', this.handleKey, this);
      this.input.on(Phaser.Input.Events.POINTER_DOWN, this.unlockAudio, this);
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.teardown, this);
  }

  private makeButton(text: string, y: number, activate: () => void): MenuButton {
    const { width } = this.scale;
    const w = Phaser.Math.Clamp(width * 0.42, 200, 360);
    const h = Phaser.Math.Clamp(this.scale.height * 0.09, 40, 64);
    const bg = this.add
      .rectangle(width / 2, y, w, h, BTN_FILL, 1)
      .setStrokeStyle(2, BTN_STROKE)
      .setDepth(1)
      .setInteractive({ useHandCursor: true });
    const label = this.add
      .text(width / 2, y, text, {
        fontFamily: FONT_FAMILY,
        fontSize: `${Phaser.Math.Clamp(Math.floor(width / 40), 11, 22)}px`,
        color: '#cfc9bd',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(2);

    const index = this.buttons.length;
    bg.on(Phaser.Input.Events.POINTER_OVER, () => this.setSelected(index));
    bg.on(Phaser.Input.Events.POINTER_DOWN, () => { this.unlockAudio(); this.setSelected(index); activate(); });
    return { bg, label, activate };
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
      btn.bg.setFillStyle(sel ? BTN_FILL_SEL : BTN_FILL, 1);
      btn.bg.setStrokeStyle(sel ? 3 : 2, sel ? ACCENT : BTN_STROKE);
      btn.label.setColor(sel ? '#fff2c8' : '#8a8594');
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
   * A aventura, e ela comeca ANDANDO.
   *
   * Havia uma intro aqui — o herói crescendo de um ponto enquanto uma voz mandava acordar — e ela
   * saiu inteira: sete segundos de tela preta entre "quero jogar" e jogar. O que a intro dizia, o
   * mago diz na primeira conversa, e essa o jogador escolhe ter.
   */
  /**
   * A aventura SEMPRE parte do world.json limpo do disco. O WorldData em memoria pode estar
   * carregando qualquer coisa que a sessao deixou para tras — uma dungeon (quit de dentro
   * dela), arvores derrubadas mutadas nas arrays — e tudo que merece sobreviver ja mora no
   * save (adventureState), que o GameScene.create() reaplica por cima do mundo fresco.
   */
  private startAdventure(): void {
    setActiveLevel(null); // a aventura roda o overworld de verdade, nunca um level
    clearDungeonTrip();
    endExplorerMode();
    this.fadeThen(() => {
      void window
        .fetch(`${import.meta.env.BASE_URL}world.json`, { cache: 'no-store' })
        .then((res) => { if (!res.ok) throw new Error('overworld indisponivel'); return res.json(); })
        .then((json: unknown) => { setWorldData(json as Parameters<typeof setWorldData>[0]); })
        .catch(() => { /* sem rede: o mundo em memoria serve */ })
        .finally(() => this.scene.start('game'));
    });
  }

  /** Continuar e a mesma porta, com um pedido a mais: acordar na fogueira em que parou. */
  private continueAdventure(): void {
    requestAdventureRespawn();
    this.startAdventure();
  }

  /** Recomecar de verdade: apaga o save e entra pela mesma porta (mundo limpo, sem retrato). */
  private startOver(): void {
    resetAdventure();
    this.startAdventure();
  }

  private teardown(): void {
    this.input.keyboard?.off('keydown', this.handleKey, this);
    this.input.off(Phaser.Input.Events.POINTER_DOWN, this.unlockAudio, this);
  }
}

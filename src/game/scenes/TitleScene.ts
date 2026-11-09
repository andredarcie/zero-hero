import * as Engine from '@/game/engine';

import { ASSET_KEYS, FONT_FAMILY, TEXT_RESOLUTION } from '@/game/constants';
import { getSoundManager } from '@/game/audio/SoundManager';
import { t, tWords } from '@/game/i18n/i18n';
import {
  hasAdventureSave, requestAdventureRespawn, resetAdventure,
} from '@/game/runtime/adventureState';
import { KEY_BG, KEY_BORDER, KEY_GLYPH } from '@/game/runtime/uiStyle';
import { setWorldData } from '@/game/world/WorldData';
import { createCanvas, platform } from '@/game/platform/platform';

// The game's start screen, and now the ONLY screen between the loader and the world: the title,
// the credit, and the door in.
//
//   • Sem save: um botao, Begin.
//   • Com uma jornada, terminada ou nao: Continue (de onde parou) e, discreto, New journey.
//
// The former authored Zelda-like overworld is archived under backup/ and has no door here.
//
// Being the first screen, it also owns audio bring-up: the AudioContext stays locked until a user
// gesture, so the menu bed is queued here and blooms on the first key/tap.
// Os botoes sao TECLAS DE PIXEL na paleta do keycap do mundo (ver runtime/uiStyle): a tecla
// apagada e a acesa. Eram retangulos lisos num cinza-azulado que nao existe em nenhum outro lugar.
const BTN_DIM = { bg: 'rgba(36, 29, 15, 0.82)', border: '#6b5b2c' };
const BTN_LIT = { bg: KEY_BG, border: KEY_BORDER };
/** A tinta dos sprites (o contorno dos cogumelos e dos itens): é ela que contorna o título. */
const TITLE_INK = '#1b1d33';
/** Onde fica a clareira ao luar na foto da mata, em fração da imagem (scripts/capturar-titulo.mjs). */
const GLADE_IN_ART = { x: 0.5, y: 0.56 };
const PIXEL_TEXTURE = 'title-pixel';
const MIST_TEXTURE = 'title-mist';
const MOON_TEXTURE = 'title-moon';
const BG_OVERSCAN = 1.14;
const FIREFLIES = 26;

interface MenuButton {
  bg: Engine.GameObjects.Rectangle;
  key: Engine.GameObjects.Image;
  label: Engine.GameObjects.Text;
  textures: [string, string];
  activate: () => void;
}

export class TitleScene extends Engine.Scene {
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
    this.cameras.main.fadeIn(900, 0, 0, 0);

    // Decode the SFX + loops and queue the menu ambience. It is silent until the first gesture
    // lifts the autoplay lock (unlockAudio, below) — this screen is where that gesture lands.
    getSoundManager().preload();
    getSoundManager().startMusic('menu', 1600);

    this.buildValley();

    const titleSize = Engine.Math.Clamp(Math.floor(Math.min(width / 13, height / 7)), 24, 84);
    const creditSize = Engine.Math.Clamp(Math.floor(width / 52), 10, 18);
    const titleY = Math.round(height * 0.17);

    // O título é PIXEL (ver uiStyle): a letra do keycap, contornada com a tinta dos sprites, e a sombra
    // dura que o sol do vale dá às coisas.
    const title = this.add
      .text(width / 2, titleY, tWords('title.words').join(' '), {
        fontFamily: FONT_FAMILY, fontSize: `${titleSize}px`, color: KEY_GLYPH, resolution: TEXT_RESOLUTION,
        stroke: TITLE_INK, strokeThickness: Math.max(4, Math.round(titleSize / 7)),
      })
      .setOrigin(0.5)
      .setShadow(0, Math.max(3, Math.round(titleSize / 12)), '#000000', 0, true, true)
      .setDepth(3);
    this.tweens.add({ targets: title, y: titleY - Math.max(2, Math.round(titleSize / 14)), duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    // No celular em pé a frase não cabe no tamanho da altura: encolhe até caber, sem cortar letra.
    const fit = Math.min(1, (width * 0.9) / title.width);
    title.setScale(fit);
    const shownSize = titleSize * fit;

    this.add
      .text(width / 2, Math.round(titleY + shownSize * 0.5 + creditSize * 1.6), `${t('title.by')} ${t('title.author')}`, {
        fontFamily: FONT_FAMILY, fontSize: `${creditSize}px`, color: '#e8d5a8', resolution: TEXT_RESOLUTION,
        stroke: TITLE_INK, strokeThickness: Math.max(3, Math.round(creditSize / 4)),
      })
      .setOrigin(0.5)
      .setDepth(3);

    // Os creditos nao fecham o vale: quem terminou continua sentado na fogueira do fim.
    const resumable = hasAdventureSave();
    this.buttons = resumable
      ? [
        this.makeButton(0, t('title.continue'), Math.round(height * 0.76), () => this.startAdventure(false)),
        this.makeButton(1, t('title.startOver'), Math.round(height * 0.87), () => this.startAdventure(true)),
      ]
      : [this.makeButton(0, t('title.playAdventure'), Math.round(height * 0.82), () => this.startAdventure(true))];
    this.applySelection();

    // Arm input a beat later so the key/tap that dismissed the loader can't fire the button.
    this.time.delayedCall(300, () => {
      this.input.keyboard?.on('keydown', this.handleKey, this);
      this.input.on(Engine.Input.Events.POINTER_DOWN, this.unlockAudio, this);
    });

    this.events.once(Engine.Scenes.Events.SHUTDOWN, this.teardown, this);
  }

  /**
   * A MATA ATRÁS DO TÍTULO (pedido do autor: só a floresta, sem herói, NPC, casa ou item): a foto que o
   * próprio jogo tirou de uma clareira ao luar (scripts/capturar-titulo.mjs), cobrindo a tela e chegando perto
   * bem devagar. Por cima, o que uma foto não tem: o luar respirando sobre a clareira, a névoa rasteira
   * passando, os vaga-lumes vagando e acendendo, e uma folha ou outra caindo — tudo em pixel quadrado, como
   * no mundo. Faixas escuras em cima e embaixo seguram a leitura do título e das teclas.
   */
  private buildValley(): void {
    const { width, height } = this.scale;
    if (!this.textures.exists(ASSET_KEYS.titleBg)) return;
    this.ensureTitleTextures();
    const frame = this.textures.getFrame(ASSET_KEYS.titleBg);
    // Um pouco mais que cobrir: a folga deixa pôr a clareira no meio da tela em qualquer formato.
    const cover = Math.max(width / frame.width, height / frame.height) * BG_OVERSCAN;
    const artW = frame.width * cover;
    const artH = frame.height * cover;
    const ox = Engine.Math.Clamp(-(GLADE_IN_ART.x - 0.5) * artW, -(artW - width) / 2, (artW - width) / 2);
    const oy = Engine.Math.Clamp(-(GLADE_IN_ART.y - 0.5) * artH, -(artH - height) / 2, (artH - height) / 2);
    const valley = this.add.container(width / 2, height / 2).setDepth(-3);
    const bg = this.add.image(ox, oy, ASSET_KEYS.titleBg).setScale(cover);
    // A clareira, no espaço da foto (a mesma conta da escala e do deslocamento).
    const gx = ox + (GLADE_IN_ART.x - 0.5) * artW;
    const gy = oy + (GLADE_IN_ART.y - 0.5) * artH;
    // O luar: um halo frio sobre a clareira que respira devagar, como nuvem passando na frente da lua.
    const moonR = Math.max(120, artH * 0.42);
    const moon = this.add.image(gx, gy, MOON_TEXTURE).setDisplaySize(moonR * 2.4, moonR * 1.6)
      .setBlendMode(Engine.BlendModes.ADD).setAlpha(0.32);
    this.tweens.add({ targets: moon, alpha: 0.18, duration: 5200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    valley.add([bg, moon]);

    const px = Math.max(2, Math.round(cover * 3));
    // A névoa rasteira: duas faixas largas e macias, cada uma no seu passo, atravessando a mata.
    for (const [i, y, alpha, ms] of [[0, 0.62, 0.16, 46000], [1, 0.8, 0.12, 61000]] as const) {
      const mist = this.add.image(0, (y - 0.5) * height, MIST_TEXTURE)
        .setDisplaySize(width * 1.8, height * 0.3).setAlpha(alpha).setTint(0xbcd2e6);
      const from = i === 0 ? -width * 0.35 : width * 0.35;
      mist.x = from;
      this.tweens.add({ targets: mist, x: -from, duration: ms, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      valley.add(mist);
    }

    // Os vaga-lumes: quadradinhos que vagam em curvas lentas e acendem e apagam cada um no seu tempo.
    for (let i = 0; i < FIREFLIES; i += 1) {
      const fx = Engine.Math.Between(-width * 0.55, width * 0.55);
      const fy = Engine.Math.Between(-height * 0.12, height * 0.5);
      const fly = this.add.image(fx, fy, PIXEL_TEXTURE).setDisplaySize(px * 1.5, px * 1.5)
        .setTint(i % 3 === 0 ? 0xfff6a8 : 0xd8f57a).setBlendMode(Engine.BlendModes.ADD).setAlpha(0);
      const halo = this.add.image(fx, fy, MOON_TEXTURE).setDisplaySize(px * 12, px * 12)
        .setTint(0xd8f57a).setBlendMode(Engine.BlendModes.ADD).setAlpha(0);
      valley.add([halo, fly]);
      const wander = (): void => {
        const nx = fly.x + Engine.Math.Between(-90, 90) * cover;
        const ny = Engine.Math.Clamp(fly.y + Engine.Math.Between(-60, 60) * cover, -height * 0.2, height * 0.55);
        this.tweens.add({
          targets: [fly, halo], x: nx, y: ny, duration: Engine.Math.Between(3200, 6400), ease: 'Sine.easeInOut', onComplete: wander,
        });
      };
      wander();
      const blink = (): void => {
        this.tweens.add({
          targets: fly, alpha: { from: 0, to: 1 }, duration: Engine.Math.Between(700, 1300), yoyo: true,
          hold: Engine.Math.Between(300, 1400), delay: Engine.Math.Between(200, 3800), onComplete: blink,
          onUpdate: () => halo.setAlpha(fly.alpha * 0.55),
        });
      };
      blink();
    }

    // As folhas: uma de vez em quando, descendo torta da copa e girando.
    const leaves = this.add.particles(0, -height * 0.62, PIXEL_TEXTURE, {
      x: { min: -width * 0.6, max: width * 0.6 },
      lifespan: { min: 9000, max: 14000 },
      speedY: { min: 14 * cover, max: 26 * cover },
      speedX: { min: -14 * cover, max: 10 * cover },
      accelerationX: { min: -6, max: 6 },
      rotate: { min: 0, max: 360 },
      scale: { start: px / 2, end: px / 2 },
      alpha: { start: 0.9, end: 0.4 },
      tint: [0xd9762f, 0xb5532b, 0xe8a541, 0x8f8a3a],
      frequency: 900,
      quantity: 1,
    });
    valley.add(leaves);

    // Bem devagar, como a câmera que pousa no vale quando o herói senta.
    this.tweens.add({ targets: valley, scale: 1.06, duration: 40000, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 });

    const shade = this.add.graphics().setDepth(-2);
    shade.fillGradientStyle(0x05060a, 0x05060a, 0x05060a, 0x05060a, 0.9, 0.9, 0, 0);
    shade.fillRect(0, 0, width, height * 0.38);
    shade.fillGradientStyle(0x05060a, 0x05060a, 0x05060a, 0x05060a, 0, 0, 0.85, 0.85);
    shade.fillRect(0, height * 0.6, width, height * 0.4 + 1);
  }

  /** O pixel (vaga-lume, folha), o halo macio (luar, brilho do vaga-lume) e a faixa de névoa. */
  private ensureTitleTextures(): void {
    if (!this.textures.exists(PIXEL_TEXTURE)) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff, 1).fillRect(0, 0, 2, 2);
      g.generateTexture(PIXEL_TEXTURE, 2, 2);
      g.destroy();
    }
    const soft = (key: string, w: number, h: number, stops: Array<[number, number]>): void => {
      if (this.textures.exists(key)) return;
      const canvas = createCanvas();
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const r = Math.min(w, h) / 2;
        const grad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, r);
        for (const [at, a] of stops) grad.addColorStop(at, `rgba(255,255,255,${a})`);
        ctx.setTransform(w / (2 * r), 0, 0, h / (2 * r), 0, 0);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 2 * r, 2 * r);
      }
      this.textures.addCanvas(key, canvas)?.setFilter(Engine.Textures.FilterMode.LINEAR);
    };
    soft(MOON_TEXTURE, 128, 128, [[0, 1], [0.4, 0.45], [1, 0]]);
    soft(MIST_TEXTURE, 256, 64, [[0, 0.9], [0.55, 0.4], [1, 0]]);
  }

  // O indice vem de quem chama: os botoes nascem DENTRO do literal que vira this.buttons, entao
  // this.buttons.length ainda vale 0 para todos eles (o hover do segundo acendia o primeiro).
  private makeButton(index: number, text: string, y: number, activate: () => void): MenuButton {
    const { width } = this.scale;
    const w = Engine.Math.Clamp(width * 0.42, 200, 360);
    const h = Engine.Math.Clamp(this.scale.height * 0.09, 40, 64);
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
        fontSize: `${Engine.Math.Clamp(Math.floor(width / 40), 11, 22)}px`,
        color: '#cfc9bd',
        resolution: TEXT_RESOLUTION,
      })
      .setOrigin(0.5)
      .setDepth(2);

    bg.on(Engine.Input.Events.POINTER_OVER, () => this.setSelected(index));
    bg.on(Engine.Input.Events.POINTER_DOWN, () => { this.unlockAudio(); this.setSelected(index); activate(); });
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
    canvas.setFilter(Engine.Textures.FilterMode.NEAREST);
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
    this.cameras.main.once(Engine.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, go);
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
      void platform().fetch(`${import.meta.env.BASE_URL}world.json`, { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : undefined))
        .then((json) => { if (json) setWorldData(json); })
        .catch(() => undefined)
        .finally(() => this.scene.start('game'));
    });
  }

  private teardown(): void {
    this.input.keyboard?.off('keydown', this.handleKey, this);
    this.input.off(Engine.Input.Events.POINTER_DOWN, this.unlockAudio, this);
    // As teclas sao texturas geradas para ESTA tela (o tamanho segue a janela): saem com ela.
    for (const btn of this.buttons) {
      for (const key of btn.textures) if (this.textures.exists(key)) this.textures.remove(key);
    }
  }
}

// O VALE DO TÍTULO: a paisagem em camadas atrás do menu, pintada uma vez em texturas e animada devagar. Só cenário:
// os botões e o que eles fazem são da TitleScene.

import * as Engine from '@/game/engine';
import { ASSET_KEYS } from '@/game/constants';
import { createCanvas } from '@/game/platform/platform';
import type { TitleScene } from './TitleScene';

/** Onde fica a clareira ao luar na foto da mata, em fração da imagem (scripts/capturar-titulo.mjs). */
const GLADE_IN_ART = { x: 0.5, y: 0.56 };
const PIXEL_TEXTURE = 'title-pixel';
const MIST_TEXTURE = 'title-mist';
const MOON_TEXTURE = 'title-moon';
const BG_OVERSCAN = 1.14;
const FIREFLIES = 26;

/** O que TitleValley usa de TitleScene. */
export type TitleValleyHost = Pick<TitleScene,
  'add' | 'make' | 'scale' | 'textures' | 'tweens'
>;

export class TitleValley {
  public constructor(private readonly host: TitleValleyHost) {}

  /**
   * A MATA ATRÁS DO TÍTULO (pedido do autor: só a floresta, sem herói, NPC, casa ou item): a foto que o
   * próprio jogo tirou de uma clareira ao luar (scripts/capturar-titulo.mjs), cobrindo a tela e chegando perto
   * bem devagar. Por cima, o que uma foto não tem: o luar respirando sobre a clareira, a névoa rasteira
   * passando, os vaga-lumes vagando e acendendo, e uma folha ou outra caindo — tudo em pixel quadrado, como
   * no mundo. Faixas escuras em cima e embaixo seguram a leitura do título e das teclas.
   */
  public buildValley(): void {
    const { width, height } = this.host.scale;
    if (!this.host.textures.exists(ASSET_KEYS.titleBg)) return;
    this.ensureTitleTextures();
    const frame = this.host.textures.getFrame(ASSET_KEYS.titleBg);
    // Um pouco mais que cobrir: a folga deixa pôr a clareira no meio da tela em qualquer formato.
    const cover = Math.max(width / frame.width, height / frame.height) * BG_OVERSCAN;
    const artW = frame.width * cover;
    const artH = frame.height * cover;
    const ox = Engine.Math.Clamp(-(GLADE_IN_ART.x - 0.5) * artW, -(artW - width) / 2, (artW - width) / 2);
    const oy = Engine.Math.Clamp(-(GLADE_IN_ART.y - 0.5) * artH, -(artH - height) / 2, (artH - height) / 2);
    const valley = this.host.add.container(width / 2, height / 2).setDepth(-3);
    const bg = this.host.add.image(ox, oy, ASSET_KEYS.titleBg).setScale(cover);
    // A clareira, no espaço da foto (a mesma conta da escala e do deslocamento).
    const gx = ox + (GLADE_IN_ART.x - 0.5) * artW;
    const gy = oy + (GLADE_IN_ART.y - 0.5) * artH;
    // O luar: um halo frio sobre a clareira que respira devagar, como nuvem passando na frente da lua. Mais fraco
    // (2026-11-11): a 0,32 ele lia como um borrão de névoa branca no meio da tela, apagando a clareira que ele acende.
    const moonR = Math.max(120, artH * 0.42);
    const moon = this.host.add.image(gx, gy, MOON_TEXTURE).setDisplaySize(moonR * 2.4, moonR * 1.6)
      .setBlendMode(Engine.BlendModes.ADD).setAlpha(0.2);
    this.host.tweens.add({ targets: moon, alpha: 0.11, duration: 5200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    valley.add([bg, moon]);

    const px = Math.max(2, Math.round(cover * 3));
    // A névoa rasteira: duas faixas largas e macias, cada uma no seu passo, atravessando a mata.
    for (const [i, y, alpha, ms] of [[0, 0.62, 0.16, 46000], [1, 0.8, 0.12, 61000]] as const) {
      const mist = this.host.add.image(0, (y - 0.5) * height, MIST_TEXTURE)
        .setDisplaySize(width * 1.8, height * 0.3).setAlpha(alpha).setTint(0xbcd2e6);
      const from = i === 0 ? -width * 0.35 : width * 0.35;
      mist.x = from;
      this.host.tweens.add({ targets: mist, x: -from, duration: ms, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      valley.add(mist);
    }

    // Os vaga-lumes: quadradinhos que vagam em curvas lentas e acendem e apagam cada um no seu tempo.
    for (let i = 0; i < FIREFLIES; i += 1) {
      const fx = Engine.Math.Between(-width * 0.55, width * 0.55);
      const fy = Engine.Math.Between(-height * 0.12, height * 0.5);
      const fly = this.host.add.image(fx, fy, PIXEL_TEXTURE).setDisplaySize(px * 1.5, px * 1.5)
        .setTint(i % 3 === 0 ? 0xfff6a8 : 0xd8f57a).setBlendMode(Engine.BlendModes.ADD).setAlpha(0);
      const halo = this.host.add.image(fx, fy, MOON_TEXTURE).setDisplaySize(px * 12, px * 12)
        .setTint(0xd8f57a).setBlendMode(Engine.BlendModes.ADD).setAlpha(0);
      valley.add([halo, fly]);
      const wander = (): void => {
        const nx = fly.x + Engine.Math.Between(-90, 90) * cover;
        const ny = Engine.Math.Clamp(fly.y + Engine.Math.Between(-60, 60) * cover, -height * 0.2, height * 0.55);
        this.host.tweens.add({
          targets: [fly, halo], x: nx, y: ny, duration: Engine.Math.Between(3200, 6400), ease: 'Sine.easeInOut', onComplete: wander,
        });
      };
      wander();
      const blink = (): void => {
        this.host.tweens.add({
          targets: fly, alpha: { from: 0, to: 1 }, duration: Engine.Math.Between(700, 1300), yoyo: true,
          hold: Engine.Math.Between(300, 1400), delay: Engine.Math.Between(200, 3800), onComplete: blink,
          onUpdate: () => halo.setAlpha(fly.alpha * 0.55),
        });
      };
      blink();
    }

    // As folhas: uma de vez em quando, descendo torta da copa e girando.
    const leaves = this.host.add.particles(0, -height * 0.62, PIXEL_TEXTURE, {
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
    this.host.tweens.add({ targets: valley, scale: 1.06, duration: 40000, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 });

    const shade = this.host.add.graphics().setDepth(-2);
    shade.fillGradientStyle(0x05060a, 0x05060a, 0x05060a, 0x05060a, 0.9, 0.9, 0, 0);
    shade.fillRect(0, 0, width, height * 0.38);
    shade.fillGradientStyle(0x05060a, 0x05060a, 0x05060a, 0x05060a, 0, 0, 0.85, 0.85);
    shade.fillRect(0, height * 0.6, width, height * 0.4 + 1);
  }

  /** O pixel (vaga-lume, folha), o halo macio (luar, brilho do vaga-lume) e a faixa de névoa. */
  private ensureTitleTextures(): void {
    if (!this.host.textures.exists(PIXEL_TEXTURE)) {
      const g = this.host.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff, 1).fillRect(0, 0, 2, 2);
      g.generateTexture(PIXEL_TEXTURE, 2, 2);
      g.destroy();
    }
    const soft = (key: string, w: number, h: number, stops: Array<[number, number]>): void => {
      if (this.host.textures.exists(key)) return;
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
      this.host.textures.addCanvas(key, canvas)?.setFilter(Engine.Textures.FilterMode.LINEAR);
    };
    soft(MOON_TEXTURE, 128, 128, [[0, 1], [0.4, 0.45], [1, 0]]);
    soft(MIST_TEXTURE, 256, 64, [[0, 0.9], [0.55, 0.4], [1, 0]]);
  }
}

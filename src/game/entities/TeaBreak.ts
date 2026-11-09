import type * as Engine from '@/game/engine';

import { getSoundManager } from '@/game/audio/SoundManager';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { WHITE_SAFE_TINT } from '@/game/render3d/pixelForms';
import { EMPTY_MUG_TEXTURE, MUG_TEXTURE, STEAM_TEXTURE } from '@/game/render3d/skyTextures';
import { world3d } from '@/game/render3d/World3D';

/**
 * O CHÁ DA ESPERA. A Thea sentou ao lado do herói com duas canecas: uma salta para a mão dele, as duas
 * brindam, e cada um bebe no seu tempo, em goles alternados, até acabar. Só presença: sem fala, sem item
 * na mão e sem nada que se possa errar. A noite pode chegar no meio de um gole, e aí `destroy` limpa tudo.
 */

export interface TeaBreakHost {
  scene: Engine.Scene;
  /** O corpo do herói: só a escala é mexida aqui, e quem levanta devolve ela ao normal. */
  heroBody: { scaleX: number; scaleY: number };
  heroTile: { x: number; y: number };
  /** O corpo sentado dela. */
  thea: Billboard3D;
  sparkle: (x: number, y: number) => void;
  hearts: (x: number, y: number) => void;
}

interface Drinker {
  body: { scaleX: number; scaleY: number };
  restX: number;
  restY: number;
  mug: Billboard3D;
  /** Onde a caneca descansa, e para qual lado ela inclina. */
  x: number;
  y: number;
  side: number;
}

const MUG_SIZE = 0.7;
const MUG_REST_ELEVATION = 0.05;
const MUG_MOUTH_ELEVATION = 0.42;
const MUG_SIDE_OFFSET = 0.34;
/** A base da caneca, na boca. Ela gira pelo pé, então a inclinação é que leva a boca dela até o meio do corpo. */
const MUG_MOUTH_OFFSET = 0.25;
const MUG_TILT_DEG = 55;
const MUG_POP_MS = 300;
const MUG_PASS_MS = 460;
/** O quanto cada caneca anda até a outra, no brinde. */
const CLINK_REACH = 0.42;
const CLINK_MS = 240;
const SIPS = 3;
/** O tempo de um gole inteiro: subir, engolir duas vezes e baixar. */
const SIP_RAISE_MS = 260;
const SIP_GULP_MS = 170;
const SIP_LOWER_MS = 240;
/** Quanto depois do gole dele começa o dela. */
const SIP_TURN_MS = 1300;
const STEAM_EVERY_MS = 340;

export class TeaBreak {
  private readonly hero: Drinker;
  private readonly thea: Drinker;
  private readonly timers: Engine.Time.TimerEvent[] = [];
  private steam?: Engine.Time.TimerEvent;
  private alive = true;

  public constructor(private readonly host: TeaBreakHost) {
    const { heroTile, thea } = host;
    const side = Math.sign(thea.x - heroTile.x) || 1;
    const heroX = heroTile.x + side * MUG_SIDE_OFFSET;
    const theaX = thea.x - side * MUG_SIDE_OFFSET;
    this.hero = {
      body: host.heroBody, restX: host.heroBody.scaleX, restY: host.heroBody.scaleY, mug: this.newMug(thea.x, thea.y), x: heroX, y: heroTile.y + 0.04, side,
    };
    this.thea = {
      body: thea, restX: thea.scaleX, restY: thea.scaleY, mug: this.newMug(thea.x, thea.y), x: theaX, y: thea.y + 0.04, side: -side,
    };
    this.thea.mug.setPosition(theaX, this.thea.y).setFlipX(side > 0);
    this.hero.mug.setFlipX(side < 0);
    this.popIn(this.thea.mug);
    this.passMug();
  }

  public destroy(): void {
    if (!this.alive) return;
    this.alive = false;
    this.steam?.remove();
    for (const timer of this.timers) timer.remove();
    const { tweens } = this.host.scene;
    for (const who of [this.hero, this.thea]) {
      tweens.killTweensOf(who.mug);
      tweens.killTweensOf(who.body);
      who.mug.destroy();
    }
    // O herói volta pelo `standUp`, com o tween dele; ela não tem quem a endireite.
    this.thea.body.scaleX = this.thea.restX;
    this.thea.body.scaleY = this.thea.restY;
  }

  private newMug(x: number, y: number): Billboard3D {
    return world3d().objects.addBillboard(MUG_TEXTURE, 0).setTint(WHITE_SAFE_TINT).setDisplaySize(MUG_SIZE, MUG_SIZE).setPosition(x, y).setElevation(MUG_REST_ELEVATION);
  }

  private after(ms: number, run: () => void): void {
    this.timers.push(this.host.scene.time.delayedCall(ms, () => { if (this.alive) run(); }));
  }

  private tween(config: Engine.Types.Tweens.TweenBuilderConfig): void {
    this.host.scene.tweens.add(config);
  }

  private popIn(mug: Billboard3D): void {
    mug.setDisplaySize(MUG_SIZE * 0.2, MUG_SIZE * 0.2);
    this.tween({ targets: mug, displayWidth: MUG_SIZE, displayHeight: MUG_SIZE, duration: MUG_POP_MS, ease: 'Back.easeOut' });
  }

  /** A do herói salta num arco, dando uma volta no ar, e ele quica com o peso dela. */
  private passMug(): void {
    const { mug, x, y } = this.hero;
    const fromX = mug.x;
    const fromY = mug.y;
    const pass = { t: 0 };
    getSoundManager().ui.playItemStash();
    this.tween({
      targets: pass,
      t: 1,
      duration: MUG_PASS_MS,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        mug.setPosition(fromX + (x - fromX) * pass.t, fromY + (y - fromY) * pass.t);
        mug.setElevation(MUG_REST_ELEVATION + Math.sin(pass.t * Math.PI) * 0.5);
        mug.setAngle(pass.t * 360);
      },
      onComplete: () => {
        if (!this.alive) return;
        mug.setAngle(0);
        this.bounce(this.hero);
        this.startSteam();
        this.after(420, () => this.clink());
      },
    });
  }

  private startSteam(): void {
    let turn = 0;
    this.steam = this.host.scene.time.addEvent({
      delay: STEAM_EVERY_MS,
      loop: true,
      callback: () => {
        turn += 1;
        const who = turn % 2 === 0 ? this.hero : this.thea;
        // A caneca na boca não solta vapor para o lado: ele só sai da que está no colo.
        if (who.mug.texKey === MUG_TEXTURE && who.mug.elevation < MUG_REST_ELEVATION + 0.05) this.puff(who.x, who.y, MUG_REST_ELEVATION + 0.42);
      },
    });
  }

  private puff(x: number, y: number, elevation: number): void {
    const size = 0.09 + Math.random() * 0.05;
    const puff = world3d()
      .objects.addBillboard(STEAM_TEXTURE, 0, { fog: false, emissive: true, alphaTest: 0.01 })
      .setDisplaySize(size, size)
      .setPosition(x + (Math.random() - 0.5) * 0.1, y)
      .setElevation(elevation)
      .setAlpha(0.75);
    this.tween({ targets: puff, elevation: elevation + 0.55, x: puff.x + (Math.random() - 0.5) * 0.22, alpha: 0, duration: 1100, ease: 'Sine.easeOut', onComplete: () => puff.destroy() });
  }

  /** O corpo baixa e volta passando do ponto: o mesmo quique para receber a caneca e para o "ahh". */
  private bounce(who: Drinker): void {
    const { scene: { tweens } } = this.host;
    tweens.killTweensOf(who.body);
    this.tween({
      targets: who.body,
      scaleX: who.restX * 1.12,
      scaleY: who.restY * 0.88,
      duration: 110,
      ease: 'Sine.easeOut',
      onComplete: () => {
        if (this.alive) this.tween({ targets: who.body, scaleX: who.restX, scaleY: who.restY, duration: 340, ease: 'Back.easeOut' });
      },
    });
  }

  /** O brinde: as duas vão uma até a outra e voltam, com o tilintar e as faíscas no encontro. */
  private clink(): void {
    const dx = this.thea.x - this.hero.x;
    const dy = this.thea.y - this.hero.y;
    const go = (who: Drinker, sign: number): void => {
      this.tween({
        targets: who.mug,
        x: who.x + dx * CLINK_REACH * sign,
        y: who.y + dy * CLINK_REACH * sign,
        elevation: MUG_MOUTH_ELEVATION,
        angle: who.side * 14,
        duration: CLINK_MS,
        ease: 'Back.easeIn',
        yoyo: true,
        hold: 90,
      });
    };
    go(this.hero, 1);
    go(this.thea, -1);
    this.after(CLINK_MS, () => {
      getSoundManager().story.playMugClink();
      this.host.sparkle((this.hero.x + this.thea.x) / 2, (this.hero.y + this.thea.y) / 2);
    });
    this.after(CLINK_MS * 2 + 90 + 260, () => {
      this.drink(this.hero, SIPS);
      this.after(SIP_TURN_MS, () => this.drink(this.thea, SIPS));
    });
  }

  private drink(who: Drinker, left: number): void {
    const { mug, body, restX, restY } = who;
    const { tweens } = this.host.scene;
    tweens.killTweensOf(body);
    // Sobe até a boca e inclina; o corpo estica, de cabeça para trás.
    this.tween({ targets: mug, x: who.x - who.side * (MUG_SIDE_OFFSET - MUG_MOUTH_OFFSET), elevation: MUG_MOUTH_ELEVATION, angle: -who.side * MUG_TILT_DEG, duration: SIP_RAISE_MS, ease: 'Back.easeOut' });
    this.tween({ targets: body, scaleX: restX * 0.95, scaleY: restY * 1.09, duration: SIP_RAISE_MS, ease: 'Sine.easeOut' });
    // Dois goles: a caneca bate no compasso, e o som vem junto.
    this.after(SIP_RAISE_MS, () => {
      for (let gulp = 0; gulp < 2; gulp += 1) this.after(gulp * SIP_GULP_MS * 2, () => getSoundManager().story.playMugSip());
      this.tween({ targets: mug, elevation: MUG_MOUTH_ELEVATION + 0.05, duration: SIP_GULP_MS, yoyo: true, repeat: 1, ease: 'Sine.easeInOut' });
    });
    this.after(SIP_RAISE_MS + SIP_GULP_MS * 4, () => {
      // Baixa, e o "ahh": o corpo solta o ar, e um fiapo sobe da boca.
      this.tween({ targets: mug, x: who.x, elevation: MUG_REST_ELEVATION, angle: 0, duration: SIP_LOWER_MS, ease: 'Sine.easeInOut' });
      this.bounce(who);
      const headX = who.x - who.side * MUG_SIDE_OFFSET;
      this.puff(headX, who.y, 0.8);
      this.puff(headX, who.y, 0.85);
      if (left > 1) {
        this.after(SIP_TURN_MS * 2 - SIP_RAISE_MS - SIP_GULP_MS * 4, () => this.drink(who, left - 1));
        return;
      }
      // Acabou: a caneca fica vazia, para de fumegar, e sobem os coraçõezinhos.
      mug.setTexture(EMPTY_MUG_TEXTURE, 0);
      this.host.hearts(headX, who.y);
      getSoundManager().ui.playCozyChime();
      if (who === this.thea) this.steam?.remove();
    });
  }
}

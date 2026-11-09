// OS RECURSOS DE CENA: as tarjas, o dolly e o pan da câmera, a vinheta, o tempo que desacelera, o feixe da lua, o chão
// que racha, os vaga-lumes, o esmaecer, os créditos, e os passos de roteiro (andar, virar, esperar).

import * as Engine from '@/game/engine';
import { FX_PUFF_TEXTURE } from '@/game/render3d/World3D';
import { CreditsRoll } from '@/game/runtime/CreditsRoll';
import { GROUND_CRACK_TEXTURE } from '@/game/render3d/cozyTextures';
import { getSoundManager } from '@/game/audio/SoundManager';
import type { GameScene } from '../GameScene';
import { Billboard3D } from '@/game/render3d/Billboard3D';

/** O que Cinema usa de GameScene. */
export type CinemaHost = Pick<GameScene,
  'camera' | 'handleTileEntered' | 'hero' | 'life' | 'movementController' | 'playerWorld' | 'scene'
  | 'streamChunks' | 'time' | 'tweens' | 'view' | 'world3d'
>;

export class Cinema {
  public letterbox?: [HTMLDivElement, HTMLDivElement];
  public vignette?: HTMLDivElement;
  public moonShaft?: Billboard3D;
  public groundCrack?: Billboard3D;
  public dollyBase?: { h: number; b: number };
  public creditsRoll?: CreditsRoll;

  public constructor(private readonly host: CinemaHost) {}

  /** Espera em ms presa ao relogio da CENA — pausar o jogo pausa a sequencia junto. */
  public wait(ms: number): Promise<void> {
    return new Promise<void>((resolve) => { this.host.time.delayedCall(ms, resolve); });
  }

  // Tween the camera's screen-centre to (tx, ty) over `duration`, re-projecting the frozen world
  // each frame. Like animateScreenCenter but with a custom duration + done callback, and it does
  // NOT touch camShifting (the cut-scene owns the freeze via cutsceneActive).
  public cutscenePan(tx: number, ty: number, duration: number, onDone: () => void): void {
    if (!this.host.camera) { onDone(); return; }
    const state = { x: this.host.camera.screenCenterX, y: this.host.camera.screenCenterY };
    this.host.tweens.add({
      targets: state,
      x: tx,
      y: ty,
      duration,
      ease: 'Cubic.easeInOut',
      onUpdate: () => {
        if (!this.host.camera) return;
        this.host.camera.screenCenterX = Math.round(state.x);
        this.host.camera.screenCenterY = Math.round(state.y);
        this.host.view.reprojectStatic();
      },
      onComplete: () => {
        if (this.host.camera) {
          this.host.camera.screenCenterX = Math.round(tx);
          this.host.camera.screenCenterY = Math.round(ty);
          this.host.view.reprojectStatic();
        }
        onDone();
      },
    });
  }

  /** As FAIXAS DE CINEMA: duas barras pretas que entram pelas bordas e dizem "agora e cena". */
  public setLetterbox(on: boolean, ms = 900): void {
    if (!this.letterbox) {
      const make = (edge: 'top' | 'bottom'): HTMLDivElement => {
        const bar = document.createElement('div');
        bar.style.cssText = `position:fixed;left:0;right:0;${edge}:0;height:11vh;background:#000;`
          + `z-index:40;pointer-events:none;transform:translateY(${edge === 'top' ? '-100%' : '100%'});`
          + `transition:transform ${ms}ms cubic-bezier(.22,.8,.3,1);`;
        document.body.appendChild(bar);
        return bar;
      };
      this.letterbox = [make('top'), make('bottom')];
    }
    const [top, bottom] = this.letterbox;
    requestAnimationFrame(() => {
      top.style.transform = on ? 'translateY(0)' : 'translateY(-100%)';
      bottom.style.transform = on ? 'translateY(0)' : 'translateY(100%)';
    });
  }

  /**
   * O DOLLY: a camera anda pela propria linha de visao (camHeight e camBack pelo MESMO fator — a
   * lei do World3D; mexer num so giraria a camera). `factor` < 1 aproxima.
   */
  public dollyTo(factor: number, duration: number, ease = 'Sine.easeInOut'): Promise<void> {
    const w3 = this.host.world3d;
    if (!w3) return Promise.resolve();
    if (!this.dollyBase) this.dollyBase = { h: w3.params.camHeight, b: w3.params.camBack };
    const base = this.dollyBase;
    const from = w3.params.camHeight / base.h;
    return new Promise<void>((resolve) => {
      this.host.tweens.addCounter({
        from, to: factor, duration, ease,
        onUpdate: (tw) => {
          const f = tw.getValue() ?? factor;
          w3.params.camHeight = base.h * f;
          w3.params.camBack = base.b * f;
        },
        onComplete: () => resolve(),
      });
    });
  }

  /** Um tween como promessa — a abertura e uma sequencia, e cada tempo espera o anterior. */
  public tweenTo(config: Engine.Types.Tweens.TweenBuilderConfig): Promise<void> {
    return new Promise<void>((resolve) => {
      this.host.tweens.add({ ...config, onComplete: () => resolve() });
    });
  }

  /** A VINHETA: as bordas da tela escurecem quando o tempo desacelera — o olho vai ao centro. */
  public setVignette(level: number, ms: number): void {
    if (!this.vignette) {
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;inset:0;z-index:39;pointer-events:none;opacity:0;'
        + 'background:radial-gradient(ellipse at 50% 46%, rgba(0,0,0,0) 34%, rgba(0,0,0,0.78) 100%);';
      document.body.appendChild(el);
      this.vignette = el;
    }
    const el = this.vignette;
    el.style.transition = `opacity ${ms}ms ease`;
    requestAnimationFrame(() => { el.style.opacity = String(level); });
  }

  /**
   * A RAMPA DE TEMPO: o `timeScale` dos tweens anda suave ate `to`, em tempo REAL (o relogio da
   * cena nao desacelera junto, entao a rampa e medida por ele). Camera lenta que liga num estalo
   * le como travamento; a que entra em rampa le como intencao.
   */
  public rampTimeScale(to: number, ms: number): Promise<void> {
    const from = this.host.tweens.timeScale;
    const start = this.host.time.now;
    return new Promise<void>((resolve) => {
      const ev = this.host.time.addEvent({
        delay: 16, loop: true, callback: () => {
          const k = Math.min(1, (this.host.time.now - start) / ms);
          this.host.tweens.timeScale = from + (to - from) * (k * k * (3 - 2 * k));
          if (k >= 1) { ev.remove(); resolve(); }
        },
      });
    });
  }

  /** A onda do impacto ESPANTA os vaga-lumes: cada um e empurrado para longe do ponto. */
  public scatterFireflies(wx: number, wy: number): void {
    for (const fly of this.host.life.fireflies) {
      const dx = fly.ox - wx;
      const dy = fly.oy - wy;
      const d = Math.max(0.6, Math.hypot(dx, dy));
      const push = 2.4 / d;
      this.host.tweens.add({ targets: fly, ox: fly.ox + (dx / d) * push, oy: fly.oy + (dy / d) * push, duration: 900, ease: 'Expo.easeOut' });
    }
  }

  /** A LUZ DA LUA sobre a espada: uma coluna palida e macia, sem luz THREE (a lei da casa). */
  public spawnMoonShaft(wx: number, wy: number): void {
    const w3 = this.host.world3d;
    if (!w3) return;
    const shaft = w3
      .objects.addBillboard(FX_PUFF_TEXTURE, 0, { centered: true, additive: true, fog: false, depthWrite: false })
      .setTint(0xb8c8ff)
      .setPosition(wx, wy + 0.18)
      .setElevation(1.05)
      .setDisplaySize(0.62, 2.3)
      .setAlpha(0);
    this.moonShaft = shaft;
    this.host.tweens.add({ targets: shaft, alpha: 0.16, duration: 1800, ease: 'Sine.easeOut' });
    this.host.tweens.add({ targets: shaft, displayWidth: 0.74, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  /** A FENDA no chao onde a espada entrou: deitada, do tamanho do tile, para sempre. */
  public crackGroundAt(wx: number, wy: number, animate: boolean): void {
    const w3 = this.host.world3d;
    if (!w3) return;
    this.groundCrack?.destroy();
    const crack = w3.objects.addBillboard(GROUND_CRACK_TEXTURE, 0, { flat: true, flatY: 0.02, depthWrite: false })
      .setPosition(wx, wy)
      .setDisplaySize(1, 1);
    this.groundCrack = crack;
    if (!animate) return;
    crack.setDisplaySize(0.2, 0.2).setAlpha(0);
    this.host.tweens.add({ targets: crack, displayWidth: 1, displayHeight: 1, alpha: 1, duration: 180, ease: 'Expo.easeOut' });
  }

  /**
   * Um passo ROTEIRIZADO: o heroi anda um tile sem o controle de movimento (que esta parado
   * durante a cutscene). A camera desliza junto, as pernas giram com o chao — o mesmo desenho de
   * um passo de verdade, so que quem aperta a seta e a cena.
   */
  public scriptStep(dx: number, dy: number, stepMs: number, keepFacing = false): Promise<void> {
    const from = { x: this.host.playerWorld.worldX, y: this.host.playerWorld.worldY };
    const to = { x: from.x + dx, y: from.y + dy };
    // `keepFacing`: o passo para TRAS, de olho no que fica — as pernas andam, o corpo nao vira.
    const look = keepFacing ? { ...(this.host.movementController?.facing ?? { dx, dy }) } : { dx, dy };
    this.host.movementController?.faceTo(look.dx, look.dy, true);
    this.host.playerWorld = { worldX: to.x, worldY: to.y };
    this.host.handleTileEntered(to.x, to.y, dx, dy);
    getSoundManager().work.playFootstep();
    return new Promise<void>((resolve) => {
      const k = { t: 0 };
      let last = 0;
      this.host.tweens.add({
        targets: k,
        t: 1,
        duration: stepMs,
        ease: 'Linear',
        onUpdate: () => {
          this.host.hero.walkDist += k.t - last;
          last = k.t;
          this.host.camera?.centerOn(from.x + dx * k.t, from.y + dy * k.t);
          if (this.host.camera) { this.host.hero.x = this.host.camera.screenCenterX; this.host.hero.y = this.host.camera.screenCenterY; }
        },
        onComplete: () => {
          this.host.streamChunks();
          resolve();
        },
      });
    });
  }

  /** Vira o heroi para uma direcao, parado (a cena olha em volta por ele). */
  public scriptFace(dx: number, dy: number): void {
    this.host.movementController?.faceTo(dx, dy, false);
  }

  /** Um fade do mundo 3D entre dois niveis (0 = claro, 1 = preto). */
  public fadeWorld(from: number, to: number, duration: number): Promise<void> {
    return new Promise<void>((resolve) => {
      this.host.tweens.addCounter({
        from, to, duration, ease: 'Sine.easeInOut',
        onUpdate: (tw) => this.host.world3d?.look.setWorldFade(tw.getValue() ?? to),
        onComplete: () => resolve(),
      });
    });
  }

  /** OS CRÉDITOS (runtime/CreditsRoll): no fim, a cena volta ao título. */
  public rollCredits(): void {
    this.creditsRoll?.remove();
    const roll = new CreditsRoll(() => {
      if (this.creditsRoll === roll) this.creditsRoll = undefined;
      if (this.host.scene.get('title')) this.host.scene.start('title');
      else this.host.scene.restart();
    });
    this.creditsRoll = roll;
  }
}

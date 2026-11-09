// PARA ONDE O HERÓI OLHA, e onde ele está DESENHADO: a pose de frente/costas/lado, e a posição fracionária do corpo no
// meio de um passo (que não é o tile lógico). O passo em si é do PlayerMovementController.

import { HERO_FRAMES } from '@/game/constants';
import { setHeroWalking, WALK_CYCLE_FRAMES, WALK_CYCLE_FRAMES_UP } from './HeroView';
import type { PlayerMovementController } from './PlayerMovementController';

/** O que HeroFacing usa de PlayerMovementController. */
export type HeroFacingHost = Pick<PlayerMovementController,
  'hero' | 'lastFacing' | 'stepDir' | 'stepFrom' | 'stepProgress'
>;

export class HeroFacing {
  public constructor(private readonly host: HeroFacingHost) {}

  /**
   * VIRAR por roteiro (uma cutscene): encara a direcao e, com `walking`, liga as pernas — a cena
   * e quem anda, e o desenho do passo tem de ser o mesmo de um passo de verdade.
   */
  public faceTo(dx: number, dy: number, walking = false): void {
    this.setFacing(dx, dy, walking);
  }

  /**
   * Onde o heroi esta NA TELA, em tiles fracionarios — que durante um passo NAO e a posicao
   * logica que o GameScene guarda.
   *
   * A posicao logica pula para o tile de destino no instante em que o passo comeca (ver
   * `stepFrom`), de proposito: e contra ele que a colisao e tudo o que pergunta pelo tile do heroi
   * decidem. Mas o corpo desenhado ainda esta atras, deslizando — o heroi fica preso no
   * centro da tela e e o mundo que escorrega. Entao qualquer overlay 2D que se ancore no tile
   * logico enquanto ele anda nasce ATE UM TILE A FRENTE do proprio heroi: foi assim que o arco
   * da espada apareceu flutuando na frente de quem corria e batia ao mesmo tempo.
   *
   * Parado, os dois sao o mesmo ponto — e por isso o bug so aparecia em movimento.
   */
  public visualWorld(worldX: number, worldY: number): { x: number; y: number } {
    if (!this.host.stepDir || !this.host.stepFrom) return { x: worldX, y: worldY };
    const t = Math.min(1, this.host.stepProgress);
    return {
      x: this.host.stepFrom.x + this.host.stepDir.dx * t,
      y: this.host.stepFrom.y + this.host.stepDir.dy * t,
    };
  }

  public setFacing(dx: number, dy: number, moving: boolean): void {
    this.host.lastFacing = { dx, dy };
    const hero = this.host.hero;

    // Frames 0..3 are the front-facing walk cycle (its last frame doubles as the idle pose), and
    // frame 4 is the hero's back. So down gets its own proper cycle, the sides borrow it flipped,
    // and up — which has a single frame — carries its motion in the bob alone. Walking up or down
    // used to animate NOTHING: a still sprite, dead centre of the screen, world sliding under it.
    if (dy !== 0) {
      hero.flipX = false;
      hero.walkFrames = dy < 0 ? WALK_CYCLE_FRAMES_UP : WALK_CYCLE_FRAMES;
    } else {
      hero.flipX = dx < 0;
      hero.walkFrames = WALK_CYCLE_FRAMES;
    }

    if (moving) {
      setHeroWalking(hero, true);
      return;
    }

    setHeroWalking(hero, false);
    hero.frame = dy < 0 ? HERO_FRAMES.idleUp : HERO_FRAMES.idleDown;
  }
}

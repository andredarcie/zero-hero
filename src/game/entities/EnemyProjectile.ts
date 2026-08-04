import type Phaser from 'phaser';

import { ASSET_KEYS, ZORA_FRAMES } from '@/game/constants';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { FX_PUFF_TEXTURE, world3d } from '@/game/render3d/World3D';

/**
 * O PROJETIL — a primeira coisa neste jogo que fere o heroi sem estar do lado dele.
 *
 * Todo dano de contato do jogo mora na grade: o inimigo esta no tile vizinho, telegrafa e bate.
 * O mago e a torreta pedem a outra pergunta, e ela nao cabe na grade — uma bala que andasse de
 * tile em tile no relogio de passo do bicho seria uma ameaca que o jogador ve chegar de longe e
 * simplesmente sai de perto. Entao o projetil e a UNICA coisa do jogo em coordenada CONTINUA de
 * tile: ele voa em tiles/segundo por cima do tabuleiro, e quem o esquiva esquiva de verdade.
 *
 * As tres leis dele:
 *
 * - **Parede mata bala, luz nao.** O voo consulta o mesmo `isBlocked` de corpo (solido, prop,
 *   NPC) e ignora a luz de fogueira: a luz e parede pra CRIATURA — e uma regra sobre existir no
 *   escuro —, e uma bala nao existe no escuro nem fora dele. Poe a coluna de pedra entre voce e a
 *   torreta e a bala morre nela; sente na fogueira e ela te acha.
 * - **Ninguem acende nada.** A lei da casa: contagem de luz THREE nao muda em runtime, ou o mundo
 *   recompila todo shader. Uma bala brilha por ser `emissive` com boost (HDR + bloom), nunca por
 *   trazer uma luz consigo.
 * - **Quem atirou nao lunga.** O acerto e resolvido pelo GameScene, e ele precisa saber de ONDE
 *   veio o golpe pra empurrar o heroi na direcao do voo. Por isso o impacto devolve o ponto do
 *   projetil, e nao a posicao do bicho: um mago a cinco tiles dando um soco no ar seria comico.
 */

export type EnemyShotKind = 'magic' | 'bullet' | 'spit';

/** Como cada tipo de tiro se parece e se comporta em voo. */
const SHOT_VISUAL: Record<EnemyShotKind, {
  texKey: string;
  /** Frame dentro do sheet (a municao do zora mora no sheet do proprio bicho). */
  frame?: number;
  /** Tamanho em tiles. Nenhum sprite vaza do tile: sao todos bem menores que 1. */
  size: number;
  /** Giro em graus/s — um projetil parado no ar le como adesivo colado na tela. */
  spinDegPerSec: number;
  /** Quanto o HDR estoura acima de 1 (o brilho que passa pelo corte do bloom). */
  boost: number;
  tint?: number;
}> = {
  // A bola do mago: o losango vermelho da arte, girando devagar.
  magic: { texKey: ASSET_KEYS.magicBall, size: 0.44, spinDegPerSec: 260, boost: 1.5 },
  // A bala da torreta: menor, mais rapida no giro — uma faisca de maquina, nao um feitico.
  bullet: { texKey: ASSET_KEYS.turretBullet, size: 0.3, spinDegPerSec: 520, boost: 1.35 },
  // O cuspe do zora: a estrela de respingo que foi desenhada junto com ele (ZORA_FRAMES.spit). Gira
  // devagar porque a forma JA e irregular — as pontas contam o giro sozinhas, e girar rapido uma
  // estrela de quatro pontas so a transforma num borrao redondo, que e o que ela nao pode ser (a
  // bala da torreta ja e a municao redonda deste jogo).
  spit: { texKey: ASSET_KEYS.zora, frame: ZORA_FRAMES.spit, size: 0.42, spinDegPerSec: 180, boost: 1.45 },
};

/** Altura de voo, em tiles: na altura do peito do heroi, nao rolando no chao. */
const SHOT_ELEVATION = 0.5;
/** Raio de acerto no heroi, em tiles. Menor que meio tile: passar raspando e passar. */
const HIT_RADIUS = 0.42;
/**
 * Vida maxima de um tiro. Existe pro caso patologico — um corredor reto de 30 tiles sem parede —,
 * porque o EnemyManager despeja um bicho a 18 tiles e uma bala imortal continuaria viajando por um
 * mundo que ja esqueceu quem a disparou.
 */
const TTL_MS = 4200;

type Shot = {
  kind: EnemyShotKind;
  /** Posicao CONTINUA em tiles (nao a grade — ver o cabecalho). */
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttlMs: number;
  angle: number;
  sprite: Billboard3D;
};

/** O que o gerenciador devolve quando um tiro encontra o heroi: onde ele estava ao acertar. */
export type ShotImpact = { x: number; y: number; kind: EnemyShotKind };

export class EnemyProjectileManager {
  private readonly shots: Shot[] = [];

  public constructor(private readonly scene: Phaser.Scene) {}

  public get count(): number {
    return this.shots.length;
  }

  /**
   * Dispara. `dirX/dirY` nao precisa vir normalizado — quem atira pensa em "na direcao do heroi",
   * e normalizar na hora do tiro e o unico lugar onde isso pode ser feito uma vez so.
   */
  public fire(
    kind: EnemyShotKind,
    fromX: number,
    fromY: number,
    dirX: number,
    dirY: number,
    speedTilesPerSec: number,
  ): void {
    const len = Math.hypot(dirX, dirY);
    if (len < 1e-4) return; // atirar em cima de si mesmo nao e tiro
    const visual = SHOT_VISUAL[kind];
    const sprite = world3d()
      .addBillboard(visual.texKey, visual.frame ?? 0, {
        centered: true,
        emissive: true,
        emissiveBoost: visual.boost,
        fog: false,
        depthWrite: false,
        alphaTest: 0.02,
      })
      .setPosition(fromX, fromY)
      .setElevation(SHOT_ELEVATION)
      .setDisplaySize(visual.size, visual.size);
    if (visual.tint !== undefined) sprite.setTint(visual.tint);

    this.shots.push({
      kind,
      x: fromX,
      y: fromY,
      vx: (dirX / len) * speedTilesPerSec,
      vy: (dirY / len) * speedTilesPerSec,
      ttlMs: TTL_MS,
      angle: 0,
      sprite,
    });
  }

  /**
   * Avanca todo tiro em voo e devolve o PRIMEIRO que encostou no heroi (null se nenhum).
   *
   * O passo e subdividido de proposito: a bala mais rapida do jogo faz ~0,12 tile por frame de
   * 16ms, mas um frame gordo (25ms de terreno reassando no explorador) a faria pular quase um
   * tile inteiro — e atravessar uma parede de um tile, ou o proprio heroi, sem nunca ter estado
   * dentro dele. Andar em fatias de no maximo meio raio de acerto e o que garante que "passou por
   * dentro" e sempre visto.
   */
  public update(
    delta: number,
    playerWorldX: number,
    playerWorldY: number,
    playerInvincible: boolean,
    isBlocked: (wx: number, wy: number) => boolean,
  ): ShotImpact | null {
    let impact: ShotImpact | null = null;

    for (let i = this.shots.length - 1; i >= 0; i--) {
      const shot = this.shots[i];
      shot.ttlMs -= delta;
      if (shot.ttlMs <= 0) {
        this.kill(i, false);
        continue;
      }

      const speed = Math.hypot(shot.vx, shot.vy);
      const dt = delta / 1000;
      const steps = Math.max(1, Math.ceil((speed * dt) / (HIT_RADIUS * 0.5)));
      const stepDt = dt / steps;
      let dead = false;
      let hitPlayer = false;

      for (let s = 0; s < steps && !dead; s++) {
        shot.x += shot.vx * stepDt;
        shot.y += shot.vy * stepDt;

        // A parede e consultada no tile em que o CENTRO do tiro esta: a grade e a autoridade sobre
        // o que e solido, e meio tile de tolerancia dos dois lados e o que faz uma bala passar por
        // uma fresta de um tile em vez de raspar a quina.
        if (isBlocked(Math.round(shot.x), Math.round(shot.y))) {
          dead = true;
          break;
        }

        // O heroi invencivel (a janela de 1,5s depois de um golpe) nao e atravessado em silencio:
        // o tiro morre nele com o mesmo estouro. Sem isso, uma rajada da torreta faria a primeira
        // bala doer e as outras cinco passarem por dentro do corpo dele como se ele fosse ar.
        if (Math.hypot(shot.x - playerWorldX, shot.y - playerWorldY) <= HIT_RADIUS) {
          dead = true;
          hitPlayer = true;
          break;
        }
      }

      shot.angle += SHOT_VISUAL[shot.kind].spinDegPerSec * dt;
      shot.sprite.setPosition(shot.x, shot.y).setAngle(shot.angle);

      if (hitPlayer && !playerInvincible && !impact) {
        impact = { x: shot.x, y: shot.y, kind: shot.kind };
      }
      if (dead) this.kill(i, true);
    }

    return impact;
  }

  /** Onde cada tiro esta agora — leitura de debug/playtest (o cenario `fauna` mede por aqui). */
  public snapshot(): Array<{ kind: EnemyShotKind; x: number; y: number; vx: number; vy: number }> {
    return this.shots.map((shot) => ({
      kind: shot.kind,
      x: Math.round(shot.x * 100) / 100,
      y: Math.round(shot.y * 100) / 100,
      vx: Math.round(shot.vx * 100) / 100,
      vy: Math.round(shot.vy * 100) / 100,
    }));
  }

  /** Limpa o ar (morte do heroi, cut-scene, troca de mundo). */
  public clear(): void {
    for (let i = this.shots.length - 1; i >= 0; i--) this.kill(i, false);
  }

  public destroy(): void {
    this.clear();
  }

  private kill(index: number, burst: boolean): void {
    const shot = this.shots[index];
    this.shots.splice(index, 1);
    if (burst) this.spawnBurst(shot);
    if (this.scene.tweens) this.scene.tweens.killTweensOf(shot.sprite);
    shot.sprite.destroy();
  }

  /** O estouro: um sopro claro no ponto do impacto — a bala nunca some, ela ACABA em algum lugar. */
  private spawnBurst(shot: Shot): void {
    const puff = world3d()
      .addBillboard(FX_PUFF_TEXTURE, 0, {
        centered: true,
        emissive: true,
        emissiveBoost: 1.4,
        fog: false,
        depthWrite: false,
        alphaTest: 0.02,
      })
      .setPosition(shot.x, shot.y)
      .setElevation(SHOT_ELEVATION)
      .setDisplaySize(0.22, 0.22)
      .setAlpha(0.85);
    if (shot.kind === 'magic') puff.setTint(0xff6a6a);
    else if (shot.kind === 'spit') puff.setTint(0xbbf2f4); // o mesmo luar da espuma do rio
    else puff.setTint(0x8fd8ff);
    this.scene.tweens.add({
      targets: puff,
      scaleX: 0.5,
      scaleY: 0.5,
      alpha: 0,
      duration: 200,
      ease: 'Power2.easeOut',
      onComplete: () => puff.destroy(),
    });
  }
}

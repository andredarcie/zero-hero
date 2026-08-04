import type Phaser from 'phaser';

import type { WorldCamera } from '@/game/runtime/WorldCamera';
import { getSoundManager } from '@/game/audio/SoundManager';
import type { EnemyKind } from '@/game/world/ScreenContent';
import { CorpseDecals } from './CorpseDecals';
import type { EnemyBase } from './EnemyBase';
import { EnemyProjectileManager, type EnemyShotKind } from './EnemyProjectile';
import { BatEnemy } from './enemies/BatEnemy';
import { MageEnemy } from './enemies/MageEnemy';
import { SlimeEnemy } from './enemies/SlimeEnemy';
import { SpiderEnemy } from './enemies/SpiderEnemy';
import { TurretEnemy } from './enemies/TurretEnemy';
import { DETECTION_RANGE, UndeadEnemy } from './enemies/UndeadEnemy';
import { ZoraEnemy, type WaterQuery } from './enemies/ZoraEnemy';

// Two things summon bodies, and this manager serves both from ONE flat list instead of
// streaming spawns per chunk: the UndeadSpawnDirector (the ambient siege, a ring around the
// hero in the dark — always skulls) and an authored spawn point (EnemySpawnerManager, a fixed
// tile that makes another body a while after its own falls — any species). Neither owns the
// bodies — this does. E, desde que existem mago e torreta, ele tambem e dono do AR: os projeteis
// (EnemyProjectileManager) nascem de um corpo mas nao pertencem a ele — um tiro sobrevive a morte
// de quem o disparou, e um mago que morresse engolindo a propria bola no ar seria um mago que
// castigou o jogador por reagir rapido.

// A skull that falls this far behind the hero has lost the hunt — remove it silently
// (it is far off-screen; the darkness will summon fresh ones anyway).
const DESPAWN_DISTANCE_TILES = 18;

/**
 * ALEM DAQUI, O CORPO NAO PENSA — ele existe, mas nao roda IA nenhuma.
 *
 * O numero nao e de gosto, e demonstravel: a maior `detectionRange` do bestiario e 14 (a caveira),
 * e nenhuma especie faz nada de proprio sem enxergar o heroi — o `takeStep` de todas cai no
 * `wander` fora do alcance. Entao a 15 tiles a unica coisa que um update produziria e um passo
 * aleatorio, fora da tela, que custa uma consulta de terreno, uma varredura dos outros corpos e
 * DOIS tweens (o deslize e o tombo lateral) para mover um pixel que ninguem ve.
 *
 * 15 tambem fica entre os dois numeros que ja existiam, e isso importa: acima dos 14 em que uma
 * cova autorada acorda (nada congela recem-nascido) e abaixo dos 18 em que o corpo e despejado
 * (nada fica pensando depois de ja estar condenado).
 *
 * O que continua correndo mesmo longe: os i-frames, o teste de despejo e — a excecao que evita um
 * bug — quem esta com um golpe ARMADO. Um corpo congelado no meio do telegrafo guardaria a frente
 * para sempre (`guardsAgainst` le o relogio do windup), e voltaria a existir defendendo um golpe
 * que nunca sai.
 */
const AI_ACTIVE_TILES = 15;

/**
 * O golpe que chegou no heroi neste frame. `ranged` separa as duas procedencias, e o GameScene
 * precisa da diferenca: num golpe de corpo o bicho INVESTE na direcao do heroi (o tombo pra
 * frente), num tiro nao ha ninguem pra investir — o empurrao vem da direcao do VOO, e quem atirou
 * fica onde estava. `fromX/fromY` e a origem do empurrao nos dois casos.
 */
export type EnemyHit = {
  enemy?: EnemyBase;
  ranged: boolean;
  fromX: number;
  fromY: number;
};

/** Onde o corpo pode andar. Voar e a unica diferenca de mundo entre uma especie e outra. */
export type BlockedQuery = {
  /** Solido pra quem anda no chao (terreno, prop, NPC) mais a luz de fogueira. */
  onFoot: (wx: number, wy: number) => boolean;
  /** O mesmo, menos rio/lava/buraco: o que segura quem voa e parede (e o mar). */
  flying: (wx: number, wy: number) => boolean;
  /** Parede pra uma BALA: solido de verdade, sem a luz — luz e regra de criatura, nao de bala. */
  shot: (wx: number, wy: number) => boolean;
};

export class EnemyManager {
  private readonly enemies: EnemyBase[] = [];
  private readonly shots: EnemyProjectileManager;
  /**
   * As ossadas. Ficam AQUI e nao no corpo que as deixa porque elas sobrevivem a ele: a caveira e
   * destruida assim que acaba de se esfarelar, e o osso continua no chao. Quem vive mais que o
   * dono tem de pertencer a quem enterra os dois (ver `destroy`).
   */
  private readonly corpses: CorpseDecals;

  /**
   * `water` e consultado VIVO (o GameScene fecha sobre o proprio estado): o rio deste jogo deixa de
   * ser rio quando alguem constroi ponte, joga pedra ou abre a comporta, e o zora tem de descobrir
   * isso no meio da partida. Uma lista copiada no boot seria uma foto de um mundo que muda.
   */
  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly water: WaterQuery,
  ) {
    this.shots = new EnemyProjectileManager(scene);
    this.corpses = new CorpseDecals(scene);
  }

  /**
   * Devolve o corpo que acabou de nascer. O cerco ignora o retorno (uma caveira dele nao pertence
   * a lugar nenhum), mas um ponto de spawn autorado PRECISA dele: e assim que a cova sabe que o
   * ocupante dela caiu, sem inventar um segundo canal de morte (EnemyBase.die() nao avisa ninguem
   * de fora, e os dois lugares que matam — o golpe e a bomba — nao sabem de covas).
   */
  public spawnUndead(worldX: number, worldY: number): UndeadEnemy {
    // The warning rumble as the ground starts to crack — playUndeadSpawn fires later, from
    // inside UndeadEnemy, when the telegraph ends and the skull actually claws out.
    getSoundManager().playGroundCrack();
    const enemy = new UndeadEnemy(this.scene, worldX, worldY);
    this.enemies.push(enemy);
    return enemy;
  }

  /** Quantas ossadas estao no chao agora (debug/playtest). */
  public get corpseCount(): number {
    return this.corpses.count;
  }

  /**
   * A FABRICA — o unico lugar do jogo que sabe montar cada especie, e por isso o lugar que o
   * compilador cobra quando uma nova entra em EnemyKind.
   *
   * `canSpawnAt` so e usado pelo slime grande, que precisa perguntar "cabe um filhote ali?" no
   * instante em que morre. O resto do jogo ja perguntou antes de chamar.
   */
  public spawn(
    kind: EnemyKind,
    worldX: number,
    worldY: number,
    canSpawnAt?: (wx: number, wy: number) => boolean,
  ): EnemyBase {
    if (kind === 'undead') return this.spawnUndead(worldX, worldY);

    let enemy: EnemyBase;
    switch (kind) {
      case 'bat':
        enemy = new BatEnemy(this.scene, worldX, worldY);
        break;
      case 'spider':
        enemy = new SpiderEnemy(this.scene, worldX, worldY);
        break;
      case 'slime':
        enemy = new SlimeEnemy(this.scene, worldX, worldY, 'slime');
        break;
      case 'bigslime':
        // O cabo do racha: o grande manda nascer nos vizinhos, e o `canSpawnAt` de quem o criou e
        // quem decide se aquele tile aceita corpo. Sem o teste, um filhote nasceria dentro da pedra.
        enemy = new SlimeEnemy(this.scene, worldX, worldY, 'bigslime', (cx, cy) => {
          if (canSpawnAt && !canSpawnAt(cx, cy)) return false;
          if (this.getEnemyAt(cx, cy)) return false;
          this.spawn('slime', cx, cy, canSpawnAt);
          return true;
        });
        break;
      case 'turret':
        enemy = new TurretEnemy(this.scene, worldX, worldY, this.shots);
        break;
      case 'mage':
        enemy = new MageEnemy(this.scene, worldX, worldY, this.shots);
        break;
      case 'zora':
        // O unico corpo que precisa PERGUNTAR pelo mundo enquanto vive (onde ha rio aberto agora):
        // ponte, vau e comporta mudam a resposta no meio da partida. Sem a consulta ele nao existe.
        enemy = new ZoraEnemy(this.scene, worldX, worldY, this.shots, this.water);
        break;
      default: {
        // Especie nova em EnemyKind sem corpo aqui: erro de compilacao, nao um tile silencioso.
        const exhaustive: never = kind;
        throw new Error(`EnemyManager: especie sem corpo — ${String(exhaustive)}`);
      }
    }
    this.enemies.push(enemy);
    return enemy;
  }

  public get aliveCount(): number {
    return this.enemies.reduce((sum, e) => sum + (e.isAlive ? 1 : 0), 0);
  }

  public getEnemyAt(worldX: number, worldY: number): EnemyBase | null {
    return this.enemies.find((e) => e.isAlive && e.worldX === worldX && e.worldY === worldY) ?? null;
  }

  /**
   * O corpo mais PROXIMO de um ponto continuo, dentro de um raio — a pergunta que uma bala faz.
   *
   * Nao da pra reusar o `getEnemyAt`: ele arredonda pra grade, e uma bala que so acertasse quando
   * o centro dela cai exatamente no tile do bicho erraria toda passagem raspante. Devolve o mais
   * proximo (e nao o primeiro da lista) porque com dois corpos colados o tiro tem de morrer no da
   * frente — errar isso e ver a bala atravessar um bicho pra ferir o de tras.
   */
  public getEnemyNear(x: number, y: number, radius: number): EnemyBase | null {
    let best: EnemyBase | null = null;
    let bestDist = radius;
    for (const enemy of this.enemies) {
      if (!enemy.isAlive) continue;
      const d = Math.hypot(enemy.worldX - x, enemy.worldY - y);
      if (d <= bestDist) {
        bestDist = d;
        best = enemy;
      }
    }
    return best;
  }

  public getAliveEnemies(): readonly EnemyBase[] {
    return this.enemies.filter((e) => e.isAlive);
  }

  /** Debug/playtest readout: where every living body is, WHAT it is, and which plate it walks to. */
  public snapshot(): Array<{
    kind: EnemyKind;
    worldX: number;
    worldY: number;
    spawning: boolean;
    plateTarget: { x: number; y: number } | null;
    health: number;
    maxHealth: number;
    invulnerable: boolean;
    windingUp: boolean;
  }> {
    return this.enemies
      .filter((e) => e.isAlive)
      .map((e) => ({
        kind: e.kind,
        worldX: e.worldX,
        worldY: e.worldY,
        spawning: e.isSpawning,
        plateTarget: e.plateTarget ? { x: e.plateTarget.x, y: e.plateTarget.y } : null,
        // A vida deixou de ser detalhe interno no dia em que a espada parou de matar de um golpe:
        // sem ela, um cenario nao consegue distinguir "resvalou" de "acertou e ele aguentou".
        health: e.healthNow,
        maxHealth: e.healthMax,
        invulnerable: e.isHurtInvulnerable,
        windingUp: e.isWindingUp,
      }));
  }

  /** Debug/playtest: os tiros em VOO (posicao continua em tiles — ver EnemyProjectile). */
  public shotSnapshot(): Array<{ kind: EnemyShotKind; x: number; y: number; vx: number; vy: number }> {
    return this.shots.snapshot();
  }

  /**
   * Hand out pressure-plate fixations: ONE body per plate. Without the claim, every skull in
   * range would converge on the same plate and all but the winner would stand next to a taken
   * tile with a balloon over its head forever — which reads as broken, not as hungry.
   *
   * The assignment lives here rather than in the creature because it is the only place that can
   * see the others. Quem ATENDE o laco e decisao da especie (`seeksPlates`, hoje so a caveira);
   * este metodo nao sabe de especie nenhuma. GameScene decides which plates are even offerable.
   */
  private assignPlateLures(plates: ReadonlyArray<{ worldX: number; worldY: number }>): void {
    const claimed = new Set<string>();
    const unclaimed: EnemyBase[] = [];

    // Pass 1 — HONOUR the fixations that already exist. A skull standing on its plate has to
    // keep it (re-assigning would walk it off and strobe the circuit), and a march already under
    // way must not be re-routed just because a fresher skull clawed out closer to the plate.
    for (const enemy of this.enemies) {
      if (!enemy.seeksPlates) {
        enemy.setPlateTarget(undefined);
        continue;
      }
      const target = enemy.plateTarget;
      const key = target ? `${target.x},${target.y}` : '';
      const stillOffered = target !== undefined
        && plates.some((p) => p.worldX === target.x && p.worldY === target.y);
      if (stillOffered && !claimed.has(key)) {
        claimed.add(key);
      } else {
        enemy.setPlateTarget(undefined);
        unclaimed.push(enemy);
      }
    }

    // Pass 2 — pair up what is left, closest pair first, so the nearest skull gets the nearest
    // plate instead of whichever happened to be first in the list.
    if (!unclaimed.length) return;
    const pairs: Array<{ enemy: EnemyBase; x: number; y: number; dist: number }> = [];
    for (const enemy of unclaimed) {
      for (const plate of plates) {
        if (claimed.has(`${plate.worldX},${plate.worldY}`)) continue;
        const dist = Math.abs(plate.worldX - enemy.worldX) + Math.abs(plate.worldY - enemy.worldY);
        if (dist > DETECTION_RANGE) continue; // out of sight is out of mind
        pairs.push({ enemy, x: plate.worldX, y: plate.worldY, dist });
      }
    }
    pairs.sort((a, b) => a.dist - b.dist);
    const fixated = new Set<EnemyBase>();
    for (const pair of pairs) {
      const key = `${pair.x},${pair.y}`;
      if (fixated.has(pair.enemy) || claimed.has(key)) continue;
      fixated.add(pair.enemy);
      claimed.add(key);
      pair.enemy.setPlateTarget({ x: pair.x, y: pair.y });
    }
  }

  /** Returns the blow that landed on the player this tick (null if none) — corpo ou tiro. */
  public update(
    delta: number,
    playerWorldX: number,
    playerWorldY: number,
    playerSafe: boolean,
    playerHasTorch: boolean,
    blocked: BlockedQuery,
    playerInvincible: boolean,
    lurablePlates: ReadonlyArray<{ worldX: number; worldY: number }> = [],
  ): EnemyHit | null {
    let hit: EnemyHit | null = null;

    // Before anybody moves: a skull's target for this tick has to be settled, or half the pack
    // would step using this frame's assignment and half using last frame's.
    this.assignPlateLures(lurablePlates);

    /**
     * Onde o corpo CORRENTE pode pisar. UM closure para o laco inteiro (o corpo da vez mora numa
     * variavel), em vez de um novo por inimigo por frame — e a varredura dos outros corpos num
     * `for` em vez de um `some`, que aloca mais um closure por consulta. Com a matilha inteira em
     * volta do heroi sao dezenas de consultas por frame, todas descartaveis.
     *
     * O que NAO da pra fazer aqui e um indice tile→corpo montado uma vez por tick: os corpos andam
     * DURANTE este laco (o inimigo i da um passo e o i+1 consulta), e um indice velho deixaria
     * dois empilharem no mesmo tile. A varredura linear e a unica resposta que sempre esta certa.
     */
    let current: EnemyBase | null = null;
    let terrainOf: (wx: number, wy: number) => boolean = blocked.onFoot;
    const blockedForEnemy = (wx: number, wy: number): boolean => {
      if (terrainOf(wx, wy)) return true;
      if (wx === playerWorldX && wy === playerWorldY) return true;
      for (const other of this.enemies) {
        if (other !== current && other.isAlive && other.worldX === wx && other.worldY === wy) {
          return true;
        }
      }
      return false;
    };

    for (const enemy of this.enemies) {
      if (!enemy.isAlive) continue;
      // Os i-frames correm AQUI e não no update da espécie: aquele sai mais cedo no atordoamento,
      // e um corpo atordoado que não descontasse a própria invulnerabilidade sairia dela tarde.
      enemy.tickHurtInvuln(delta);

      const farX = Math.abs(enemy.worldX - playerWorldX);
      const farY = Math.abs(enemy.worldY - playerWorldY);
      const far = Math.max(farX, farY);
      if (far > DESPAWN_DISTANCE_TILES) {
        enemy.despawn();
        continue;
      }
      // FORA DE ALCANCE: existe, mas nao pensa (ver AI_ACTIVE_TILES). O golpe armado e a unica
      // coisa que atravessa o corte — congelar um telegrafo deixaria a guarda erguida para sempre.
      if (far > AI_ACTIVE_TILES && !enemy.isWindingUp) continue;

      // O mundo deste corpo: chao ou voo (voar e a unica diferenca de mundo entre uma especie e
      // outra), mais o heroi e os outros corpos, que ninguem atravessa — inclusive quem voa, que
      // passa por cima de rio, nao de gente.
      current = enemy;
      terrainOf = enemy.flies ? blocked.flying : blocked.onFoot;

      if (enemy.update(delta, playerWorldX, playerWorldY, playerSafe, playerHasTorch, blockedForEnemy)) {
        hit ??= { enemy, ranged: false, fromX: enemy.worldX, fromY: enemy.worldY };
      }
    }

    // O ar, depois dos corpos: um tiro disparado NESTE frame nasce no tile de quem atirou e nao
    // deve andar antes do frame seguinte (senao ele comeca a viagem meio tile adiantado, e uma
    // torreta colada no heroi acertaria antes de a bala existir na tela).
    const impact = this.shots.update(delta, playerWorldX, playerWorldY, playerInvincible, blocked.shot);
    if (impact && !hit) {
      hit = { ranged: true, fromX: impact.x, fromY: impact.y };
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const gone = this.enemies[i];
      if (!gone.pendingRemoval) continue;
      // A MARCA fica no instante em que o corpo termina de sumir — e so quando ele foi MORTO.
      // `despawn` (o escuro reclamando de volta quem o heroi deixou pra tras) tambem chega aqui, e
      // uma mancha por bicho que desistiu da cacada encheria o mundo de recibos de nada.
      if (gone.corpseMark) this.corpses.drop(gone.worldX, gone.worldY, gone.kind);
      gone.destroy();
      this.enemies.splice(i, 1);
    }

    return hit;
  }

  /** Fade every enemy out (e.g. to clear the field during a cut-scene) — e limpa o ar com eles. */
  public despawnAll(): void {
    for (const enemy of this.enemies) enemy.despawn();
    this.shots.clear();
  }

  public render(tileSize: number, camera: WorldCamera): void {
    for (const enemy of this.enemies) enemy.render(tileSize, camera);
  }

  public destroy(): void {
    for (const enemy of this.enemies) enemy.destroy();
    this.enemies.length = 0;
    this.shots.destroy();
    this.corpses.destroy();
  }
}

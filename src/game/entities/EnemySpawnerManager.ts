import { ENEMY_RESPAWN_MS } from '@/game/constants';
import type { EnemyBase } from '@/game/entities/EnemyBase';
import { DETECTION_RANGE } from '@/game/entities/enemies/UndeadEnemy';
import type { WorldEnemySpawn } from '@/game/world/worldSchema';

/**
 * O PONTO DE SPAWN AUTORADO — a cova que o autor cava no editor, e o inimigo que VOLTA.
 *
 * Ate aqui o jogo tinha uma fonte de inimigo so: o UndeadSpawnDirector, que invoca caveiras num
 * anel em volta do HEROI enquanto ele demora no escuro. Isso e um cerco — pressao ambiente, sem
 * lugar nenhum —, e por isso ele nao serve pra autorar nada: nao existe "a caveira daquele
 * corredor", e ele fica desligado justamente onde uma sala precisa de guarda (o lab e os levels,
 * `meta.puzzle`, onde caveira aparecendo no meio da solucao e ruido).
 *
 * Este manager e a outra pergunta: um tile FIXO, escolhido a mao, que tem um corpo em cima e faz
 * outro depois que aquele cai. Ele nao substitui o cerco, e nao herda as regras dele:
 *
 * - **Um corpo por cova, nunca uma fila.** Enquanto o ocupante estiver vivo o ponto nao faz nada;
 *   duas caveiras na mesma cova viram um cerco autorado, que e exatamente o que ja existe.
 * - **O relogio conta sempre**, mesmo com o heroi longe (ver ENEMY_RESPAWN_MS). Se contasse so
 *   por perto, voltar a uma sala limpa daria uma sala vazia — e a cova viraria decoracao.
 * - **A cova ACORDA na distancia de visao da caveira** (DETECTION_RANGE, o mesmo numero pelo qual
 *   ela enxerga o heroi e enxerga uma placa). Nao e economia: nascer e um evento de 3,8s de aviso
 *   (a fissura fria do UndeadEnemy) e, se acontecesse a 40 tiles, o aviso seria dado pra ninguem
 *   e o EnemyManager despejaria a caveira aos 18 tiles antes de ela chegar. 14 < 18 de proposito:
 *   nada nasce dentro da faixa em que seria despejado no mesmo instante.
 * - **Nao ha distancia MINIMA.** O autor escolheu o tile; quem chega perto sabe onde pisou, e o
 *   telegrafo de 3s e o que torna justo um nascimento colado no heroi.
 * - **A cova nao desenha nada.** O nascimento JA e a arte do ponto de spawn — o chao rachando em
 *   tres estagios com poeira subindo diz "vem coisa daqui" melhor do que qualquer marca parada, e
 *   uma marca permanente entregaria a emboscada antes de ela existir. (A lei da casa: o mundo
 *   ensina, o HUD nao.)
 *
 * A elegibilidade do tile (solido, luz de fogueira, corpo em cima) mora no GameScene, que e quem
 * sabe disso — e de proposito NAO inclui o flood-fill de alcancabilidade que o cerco usa: aquele
 * teste e centrado no heroi (raio do anel + 3) e reprovaria toda cova autorada mais longe que
 * isso. A colocacao a mao E a intencao; o editor avisa sobre tile bloqueado no Salvar.
 */

/** Onde o heroi esta e como o mundo responde — o mesmo formato de consulta do cerco. */
export type EnemySpawnerQuery = {
  playerWorldX: number;
  playerWorldY: number;
  /** O heroi esta na seguranca de uma fogueira acesa (CAMPFIRE_SAFE_RADIUS)? */
  playerSafe: boolean;
  /**
   * O tile pode receber um corpo agora? (solido, luz de fogueira, ja ocupado)
   *
   * A ESPECIE viaja na pergunta porque ela muda a resposta: um tile de rio recusa qualquer corpo,
   * menos o que voa (ver FLYING_ENEMY_KINDS). Sem o `type` aqui, uma cova de morcego em cima da
   * agua ficaria calada pra sempre — e o editor, que ja perdoa aquele tile no Salvar, estaria
   * prometendo uma coisa que o runtime nao entrega.
   */
  canSpawnAt: (worldX: number, worldY: number, type: WorldEnemySpawn['type']) => boolean;
  /** Faz o inimigo e devolve o corpo, pro ponto poder saber quando ele cair. */
  spawn: (worldX: number, worldY: number, type: WorldEnemySpawn['type']) => EnemyBase | undefined;
};

type Spawner = {
  readonly type: WorldEnemySpawn['type'];
  readonly worldX: number;
  readonly worldY: number;
  /** O corpo que esta cova fez e que ainda esta de pe. */
  occupant?: EnemyBase;
  /** > 0 = a cova esta esperando (o corpo caiu). Nasce em 0: a primeira aparece na chegada. */
  cooldownMs: number;
};

export class EnemySpawnerManager {
  /**
   * O tempo de espera, em campo. E um campo e nao a constante direto porque o playtest precisa
   * encurtar isto (25s de espera real por assercao seria um cenario de minutos) — o jogo nunca
   * mexe nele, e o cenario cobra que o default de boot seja ENEMY_RESPAWN_MS.
   */
  public respawnMs = ENEMY_RESPAWN_MS;

  private readonly spawners: Spawner[];

  public constructor(spawns: readonly WorldEnemySpawn[]) {
    this.spawners = spawns.map((spawn) => ({
      type: spawn.type,
      worldX: spawn.worldX,
      worldY: spawn.worldY,
      cooldownMs: 0,
    }));
  }

  public get count(): number {
    return this.spawners.length;
  }

  public update(delta: number, query: EnemySpawnerQuery): void {
    for (const spawner of this.spawners) {
      if (spawner.occupant) {
        if (spawner.occupant.isAlive) continue;
        // O corpo caiu (golpe, bomba, ou o despejo silencioso quando o heroi chegou na fogueira
        // ou se afastou demais). A cova nao distingue os casos de proposito: em todos ela ficou
        // sem corpo, e o que ela faz a respeito e sempre o mesmo — esperar e fazer outro.
        spawner.occupant = undefined;
        spawner.cooldownMs = this.respawnMs;
      }

      if (spawner.cooldownMs > 0) {
        spawner.cooldownMs = Math.max(0, spawner.cooldownMs - delta);
        continue;
      }

      // Com o heroi na seguranca de uma fogueira, nenhuma cova abre: descansar no fogo e a unica
      // pausa que este jogo oferece, e uma cova a 6 tiles pariria um corpo a cada 25s pra ele
      // vir morrer na borda da luz — o jogador sentado na fogueira ouviria o chao rachando pra
      // sempre, sem nada a fazer a respeito. O relogio continua correndo acima: sair da luz
      // encontra a cova pronta, nao esperando.
      //
      // (Ate 2026-08-12 a justificativa era outra — a matilha se desfazia sozinha perto do fogo,
      // entao a cova so encheria o mundo de po. Esse desmanche morreu; a linha fica, agora pelo
      // que ela protege: o descanso.)
      if (query.playerSafe) continue;

      const far = Math.max(
        Math.abs(spawner.worldX - query.playerWorldX),
        Math.abs(spawner.worldY - query.playerWorldY),
      ) > DETECTION_RANGE;
      if (far) continue;

      // Tile ocupado/aceso/solido: a cova simplesmente espera o proximo frame. Nao ha penalidade
      // — o heroi parado em cima de uma cova nao deve zerar o relogio dela nem armar uma emboscada
      // que dispara no passo seguinte; ela abre quando houver espaco.
      if (!query.canSpawnAt(spawner.worldX, spawner.worldY, spawner.type)) continue;

      spawner.occupant = query.spawn(spawner.worldX, spawner.worldY, spawner.type) ?? undefined;
    }
  }

  /** Debug/playtest: cada cova, se tem corpo de pe e quanto falta do relogio. */
  public snapshot(): Array<{
    worldX: number;
    worldY: number;
    type: WorldEnemySpawn['type'];
    occupied: boolean;
    cooldownMs: number;
  }> {
    return this.spawners.map((spawner) => ({
      worldX: spawner.worldX,
      worldY: spawner.worldY,
      type: spawner.type,
      occupied: spawner.occupant !== undefined && spawner.occupant.isAlive,
      cooldownMs: Math.round(spawner.cooldownMs),
    }));
  }
}

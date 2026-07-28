import { CHUNK_COLUMNS, CHUNK_ROWS } from '@/game/constants';
import type { World3D } from '@/game/render3d/World3D';
import {
  setInfiniteWorld,
  setStreamedProps,
  setWorldWindow,
} from '@/game/world/WorldData';
import type { WorldProp } from '@/game/world/worldSchema';
import {
  CAMP_SPAWN_X,
  CAMP_SPAWN_Y,
  ExplorerWorldSource,
  campKit,
} from './explorerWorld';

/**
 * A JANELA — o que faz um mundo infinito caber num renderer que funde o terreno inteiro em
 * meia duzia de meshes.
 *
 * O World3D existe porque a floresta e ASSADA: 846 pinheiros custam um draw call porque sao um
 * mesh so. Isso e ouro, e e incompativel com "infinito" — um buffer nao cresce para sempre. A
 * saida e nao tentar: o renderer sempre segura uma JANELA de chunks em volta do heroi, e quando
 * ele cruza a fronteira de um chunk a janela se recentraliza e o terreno e reassado.
 *
 * Tres decisoes moram nessa frase:
 *
 * • **Raio 2 (janela 5x5).** A camera enquadra pouco mais de um chunk, entao dois chunks de
 *   folga em cada direcao significam que o horizonte visivel esta sempre dentro do que ja foi
 *   assado, mesmo no instante logo antes de uma recentralizacao — nada nasce a vista.
 * • **Reassar so ao TROCAR de chunk**, nunca por distancia percorrida: uma janela que se
 *   arrasta com o heroi reassaria a cada passo. Assim o custo aparece uma vez a cada 12 tiles.
 * • **Props entram e saem com a janela.** "Tem prop neste tile?" e uma busca LINEAR, e ela roda
 *   dentro do flood-fill que decide onde uma caveira pode nascer. Guardar todo prop que a
 *   expedicao ja viu transformaria essa busca no gargalo do modo por volta do quinto minuto.
 *
 * O que um prop lembra ao sair da janela e o minimo que muda o jogo: se a fogueira estava ACESA
 * (o jogador comprou aquela luz com uma tocha e uma caminhada — perde-la seria roubo) e se ele
 * ja foi CONSUMIDO (a pedra quebrada, a arvore derrubada, o portal usado). Todo o resto o
 * gerador refaz identico, porque e funcao da semente e da coordenada.
 */

/** Raio da janela em chunks (2 → 5x5 chunks = 60x60 tiles baked). */
const WINDOW_RADIUS = 2;

/** O que sobrevive a um prop sair da janela. */
export type PropMemory = {
  /** Sumiu de vez: rocha quebrada, arvore virada em toco, portal ja usado. */
  gone?: boolean;
  /** Fogueira acesa pelo jogador — a unica melhoria permanente do mundo aleatorio. */
  lit?: boolean;
};

export interface ExplorerPropHost {
  /** Constroi os objetos de prop destes defs e os empurra nas listas da cena. */
  spawnStreamedProps(defs: readonly WorldProp[]): void;
  /** Destroi e remove todo prop cujo tile esta fora do conjunto de chunks dado. */
  despawnPropsOutside(chunks: ReadonlySet<string>): Array<{ key: string; memory: PropMemory }>;
}

const chunkKey = (cx: number, cy: number): string => `${cx},${cy}`;
const propKey = (prop: { worldX: number; worldY: number }): string => `${prop.worldX},${prop.worldY}`;

export class ExplorerDirector {
  public readonly source: ExplorerWorldSource;
  private centerCx = NaN;
  private centerCy = NaN;
  private loaded = new Set<string>();
  private readonly memory = new Map<string, PropMemory>();
  /** Quantos reassados a expedicao ja pagou — lido pelo playtest/profiler. */
  public rebuilds = 0;
  /** Custo do ultimo reassado, em ms. */
  public lastRebuildMs = 0;

  public constructor(seed: number) {
    this.source = new ExplorerWorldSource(seed);
  }

  /**
   * Liga o gerador na WorldData e prepara a primeira janela — TEM que rodar antes do World3D
   * existir, porque o construtor dele assa o terreno na hora e le os limites daqui.
   */
  public install(): void {
    setInfiniteWorld({
      name: 'explorador',
      playerStart: { worldX: CAMP_SPAWN_X, worldY: CAMP_SPAWN_Y },
      chunk: (cx, cy) => this.source.chunk(cx, cy),
      content: (cx, cy) => this.source.chunkContent(cx, cy),
      heldItems: () => campKit(),
    });
    this.recenter(
      Math.floor(CAMP_SPAWN_X / CHUNK_COLUMNS),
      Math.floor(CAMP_SPAWN_Y / CHUNK_ROWS),
    );
  }

  /**
   * Um passo do heroi. Devolve true se a janela se moveu (o terreno foi reassado), o que o
   * chamador usa so para instrumentacao — o efeito colateral e o trabalho.
   */
  public update(playerWorldX: number, playerWorldY: number, host: ExplorerPropHost, world3d?: World3D): boolean {
    const cx = Math.floor(playerWorldX / CHUNK_COLUMNS);
    const cy = Math.floor(playerWorldY / CHUNK_ROWS);
    if (cx === this.centerCx && cy === this.centerCy) return false;

    const previous = new Set(this.loaded);
    this.recenter(cx, cy);

    // Fora primeiro, dentro depois: o que sai devolve a sua memoria, e um prop que entra num
    // tile recem-liberado precisa que o antigo ja tenha soltado o lugar.
    for (const entry of host.despawnPropsOutside(this.loaded)) {
      const existing = this.memory.get(entry.key) ?? {};
      this.memory.set(entry.key, { ...existing, ...entry.memory });
    }
    const fresh: WorldProp[] = [];
    for (const key of this.loaded) {
      if (previous.has(key)) continue;
      const [kx, ky] = key.split(',').map(Number);
      fresh.push(...this.propsFor(kx, ky));
    }
    host.spawnStreamedProps(fresh);

    if (world3d) {
      const t0 = performance.now();
      world3d.rebuildTerrain();
      this.lastRebuildMs = performance.now() - t0;
      this.rebuilds += 1;
    }
    return true;
  }

  /** Os props vivos da janela inteira — o que a GameScene le ao nascer. */
  public windowProps(): WorldProp[] {
    const out: WorldProp[] = [];
    for (const key of this.loaded) {
      const [cx, cy] = key.split(',').map(Number);
      out.push(...this.propsFor(cx, cy));
    }
    return out;
  }

  /** Registra o que aconteceu com um prop, para quando ele voltar a janela. */
  public remember(prop: { worldX: number; worldY: number }, memory: PropMemory): void {
    const key = propKey(prop);
    this.memory.set(key, { ...(this.memory.get(key) ?? {}), ...memory });
  }

  private propsFor(cx: number, cy: number): WorldProp[] {
    return this.source.chunkProps(cx, cy)
      .filter((prop) => !this.memory.get(propKey(prop))?.gone)
      .map((prop) => {
        const mem = this.memory.get(propKey(prop));
        return mem?.lit ? { ...prop, lit: true } : prop;
      });
  }

  private recenter(cx: number, cy: number): void {
    this.centerCx = cx;
    this.centerCy = cy;
    this.loaded = new Set<string>();
    for (let dy = -WINDOW_RADIUS; dy <= WINDOW_RADIUS; dy++) {
      for (let dx = -WINDOW_RADIUS; dx <= WINDOW_RADIUS; dx++) {
        this.loaded.add(chunkKey(cx + dx, cy + dy));
      }
    }
    setWorldWindow(cx - WINDOW_RADIUS, cy - WINDOW_RADIUS, cx + WINDOW_RADIUS, cy + WINDOW_RADIUS);
    setStreamedProps(this.windowProps());
  }
}

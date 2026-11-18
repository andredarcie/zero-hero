import { adventureState } from '@/game/runtime/adventureState';
import { fullyGrownSince, regrowLevel } from '@/game/runtime/campRegrowth';
import { inCampZone } from '@/game/runtime/homeGrid';
import type { TallGrassObject } from './TallGrassObject';

/** O que o mato do acampamento pergunta ao mundo: a hora do jogo, se o tile está em uso, e se ele pode fechar. */
export interface CampGrassWorld {
  /** O relógio absoluto do jogo, em dias (runtime/campRegrowth.gameClock). */
  now(): number;
  /** O tile está em USO agora: uma peça nele, ou o herói pisando nele. */
  used(x: number, y: number): boolean;
  /** O mato pode voltar a fechar este tile sem trancar ninguém (o caminho até as peças e a saída continuam). */
  canClose(x: number, y: number): boolean;
}

/**
 * O MATO DO ACAMPAMENTO QUE O JOGADOR CORTOU (pedido do autor, 2026-11-17). O mato do vale volta quando a partida
 * recomeça (é recurso, como a rocha); o da zona do acampamento é ESTRUTURA — cortá-lo é abrir espaço para o lar — e o
 * save guarda os tiles (`home.cleared`) e desde quando cada um está sem uso (`home.clearedAt`).
 *
 * E ELE VOLTA (o autor, no mesmo dia: "se o herói não usar o espaço que cortou, com o tempo o mato cresce outra vez"):
 * a cada `tick`, o tile cortado e sem uso brota e cresce pelos degraus de runtime/campRegrowth, e em pé de novo sai do
 * save. Usar o tile (a peça, o herói pisando, ser passagem) zera o relógio dele; o broto pisado some.
 */
export class CampGrass {
  private readonly zone: TallGrassObject[];

  public constructor(grasses: readonly TallGrassObject[], private readonly world: CampGrassWorld) {
    this.zone = grasses.filter((g) => inCampZone(g.worldX, g.worldY));
    // a foice avisa na hora: o tile entra no save com a hora do corte
    for (const g of this.zone) g.onCut = () => this.markCut(g);
  }

  /** O mato já cortado numa sessão de antes nasce cortado — limpo, ou no degrau em que o relógio dele está. */
  public settleSaved(): void {
    const home = adventureState().home;
    const cleared = new Set(home.cleared);
    const now = this.world.now();
    for (const g of this.zone) {
      const key = `${g.worldX},${g.worldY}`;
      if (!cleared.has(key)) continue;
      home.clearedAt[key] ??= now;
      g.settle();
    }
    this.tick(true);
  }

  /** Anota no save o mato que caiu sem avisar (o save antigo, o fogo); devolve se anotou algum. */
  public notice(): boolean {
    const home = adventureState().home;
    const cleared = new Set(home.cleared);
    let added = false;
    for (const g of this.zone) {
      const key = `${g.worldX},${g.worldY}`;
      if (g.isTall || g.isGrowing || cleared.has(key)) continue;
      home.cleared.push(key);
      home.clearedAt[key] = this.world.now();
      cleared.add(key);
      added = true;
    }
    return added;
  }

  /**
   * O RELÓGIO DO MATO: cada tile cortado vê se está em uso (o relógio dele zera) e, sem uso, em que degrau o mato
   * dele está. Em pé de novo, ele sai do save — se fechar ali não trancar ninguém; senão, ele é passagem, e é uso.
   * `instant` (o boot) põe cada um no degrau sem a animação de crescer. Devolve se o save mudou de um jeito que vale gravar.
   */
  public tick(instant = false): boolean {
    const home = adventureState().home;
    const cleared = new Set(home.cleared);
    const now = this.world.now();
    let changed = false;
    for (const g of this.zone) {
      const key = `${g.worldX},${g.worldY}`;
      if (!cleared.has(key)) continue;
      // o relógio que nunca foi marcado começa agora; o tile em uso começa de novo (sem gravar: o save regular leva)
      if (home.clearedAt[key] === undefined || this.world.used(g.worldX, g.worldY)) home.clearedAt[key] = now;
      let level = regrowLevel(home.clearedAt[key], now);
      if (level >= 1 && !this.world.canClose(g.worldX, g.worldY)) {
        home.clearedAt[key] = now; // é passagem: conta como uso
        level = 0;
      }
      if (level >= 1) {
        g.regrow(instant);
        home.cleared = home.cleared.filter((k) => k !== key);
        delete home.clearedAt[key];
        changed = true;
        continue;
      }
      if (g.growthLevel !== level) {
        g.growTo(level, instant);
        changed = true;
      }
    }
    return changed;
  }

  /** O PAINEL DE TESTES: todo o mato cortado e sem uso volta já (pelo mesmo relógio; o que é usado continua limpo). */
  public regrowNow(): void {
    const home = adventureState().home;
    const since = fullyGrownSince(this.world.now());
    for (const key of home.cleared) home.clearedAt[key] = since;
    this.tick();
  }

  /** Quantos ainda estão em pé (a janela do playtest). */
  public get standing(): number {
    return this.zone.filter((g) => g.isTall).length;
  }

  /** Quantos estão brotando agora (a janela do playtest). */
  public get growing(): number {
    return this.zone.filter((g) => g.isGrowing).length;
  }

  private markCut(g: TallGrassObject): void {
    const home = adventureState().home;
    const key = `${g.worldX},${g.worldY}`;
    if (!home.cleared.includes(key)) home.cleared.push(key);
    home.clearedAt[key] = this.world.now();
  }
}

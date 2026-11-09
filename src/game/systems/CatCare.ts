import type * as Engine from '@/game/engine';

import { getSoundManager } from '@/game/audio/SoundManager';
import { NPC_DIALOGS, type DialogScript, type DialogVoice } from '@/game/dialogs/NpcDialogs';
import { CatCompanion } from '@/game/entities/CatCompanion';
import { t, tLines, type I18nLine } from '@/game/i18n/i18n';
import { CatBarrel } from '@/game/objects/CatBarrel';

/**
 * O GATO: chega com o primeiro favor feito (e quem continua uma partida já o encontra junto), segue o herói, se
 * enrola do lado dele na fogueira, dorme no barril de Diógenes quando cansa, e responde ao carinho com uma das
 * passagens das Vidas de Diógenes Laércio. Não vai ao save: ele é lido dos pedidos, e um booleano a mais só poderia
 * discordar deles. Só as falas que ele já disse vão (as chaves `cat/talk/<n>` do que o herói ouviu).
 */
export interface CatHost {
  scene: Engine.Scene;
  /** Há aventura e mundo 3D (no laboratório, e antes do mundo subir, não há gato). */
  ready: () => boolean;
  /** O tile lógico do herói e para onde ele olha. */
  heroTile: () => { x: number; y: number };
  facing: () => { dx: number; dy: number };
  /** Onde o herói está DESENHADO, em tiles fracionários (no meio de um passo, não é o tile lógico). */
  heroVisualTile: () => { x: number; y: number };
  isSolid: (x: number, y: number) => boolean;
  /** A fogueira em que o herói está sentado; null se ele não está descansando. */
  restFire: () => { x: number; y: number } | null;
  /** O jogo corre: fora de cena, de conversa e de descanso (só então o gato volta para o barril). */
  roaming: () => boolean;
  canAct: () => boolean;
  hearts: (x: number, y: number) => void;
  /** Uma linha sem ninguém falando (o barril vazio). */
  narrate: (lines: I18nLine[]) => void;
  say: (script: DialogScript, voice: DialogVoice | undefined) => void;
  /** A voz do gato no roteiro dele (aguda e redonda): o miado do carinho sai dela. */
  voice: () => DialogVoice | undefined;
  heard: (key: string) => boolean;
  hear: (key: string) => void;
  persist: () => void;
}

/** O corpo do gato, como o sistema o usa (entities/CatCompanion). */
export interface CatBody {
  readonly position: { x: number; y: number };
  readonly atHome: boolean;
  update(deltaMs: number, hero: { x: number; y: number }, beside: { x: number; y: number } | null,
    home: { x: number; y: number } | null, free: boolean): void;
  pet(): void;
  destroy(): void;
}

/** A casa dele, o barril (objects/CatBarrel). */
export interface CatHome {
  at(x: number, y: number): boolean;
  readonly bed: { x: number; y: number };
  destroy(): void;
}

/** De onde saem o gato e o barril: no jogo, os de verdade (no mundo 3D); no teste, dublês. */
export interface CatParts {
  cat: (scene: Engine.Scene, x: number, y: number, arriving: boolean) => CatBody;
  barrel: () => CatHome;
}

const REAL_PARTS: CatParts = {
  cat: (scene, x, y, arriving) => new CatCompanion(scene, x, y, arriving),
  barrel: () => new CatBarrel(),
};

/** O carinho só alcança o gato a até esta distância (em tiles) do herói desenhado. */
const PET_REACH = 1.7;

export class CatCare {
  private cat?: CatBody;
  private barrel?: CatHome;

  public constructor(private readonly host: CatHost, private readonly parts: CatParts = REAL_PARTS) {}

  /** O barril, que existe no vale desde o começo (o gato, não). */
  public build(): void {
    this.barrel = this.parts.barrel();
  }

  /** Onde o gato está (para o depurador), null sem gato. */
  public get position(): { x: number; y: number } | null {
    return this.cat ? { ...this.cat.position } : null;
  }

  /** O barril ocupa este tile (é sólido, e o Z ali é carinho ou olhar). */
  public isBarrelAt(x: number, y: number): boolean {
    return this.barrel?.at(x, y) ?? false;
  }

  /** O que o Z faz no barril: afagar o gato que dorme lá, ou olhar o barril vazio. */
  public barrelVerb(): 'pet' | 'look' {
    return this.cat?.atHome ? 'pet' : 'look';
  }

  /** O gato aparece ATRÁS do herói (do lado que ele não olha), ou em cima dele se ali for parede. */
  public ensure(arriving: boolean): void {
    if (this.cat || !this.host.ready()) return;
    const { dx, dy } = this.host.facing();
    const { x: px, y: py } = this.host.heroTile();
    const behindFree = !this.host.isSolid(px - dx, py - dy);
    this.cat = this.parts.cat(this.host.scene, behindFree ? px - dx : px, behindFree ? py - dy : py, arriving);
  }

  public update(delta: number): void {
    if (!this.cat) return;
    let beside: { x: number; y: number } | null = null;
    const fire = this.host.restFire();
    const hero = this.host.heroVisualTile();
    if (fire) {
      // ENROLADO DO LADO: meio tile para o lado do herói, de frente para a mesma fogueira.
      const tile = this.host.heroTile();
      const fx = Math.sign(fire.x - tile.x);
      const fy = Math.sign(fire.y - tile.y);
      beside = { x: hero.x - fy * 0.55 + fx * 0.1, y: hero.y + fx * 0.55 + fy * 0.1 };
    }
    // Em casa ele dorme no barril; vai para lá só com o jogo correndo.
    this.cat.update(delta, hero, beside, this.barrel?.bed ?? null, this.host.roaming());
  }

  /** O carinho: só com o gato perto. Devolve se havia gato para afagar. */
  public pet(): boolean {
    const cat = this.cat;
    if (!cat) return false;
    const hero = this.host.heroVisualTile();
    if (Math.hypot(cat.position.x - hero.x, cat.position.y - hero.y) > PET_REACH) return false;
    cat.pet();
    this.host.hearts(cat.position.x, cat.position.y);
    // A voz do gato é a mesma do roteiro dele (NpcDialogs): aguda e redonda, um miado de duas notas.
    const voice = this.host.voice();
    getSoundManager().ui.playDialogBlip(voice?.freq ?? 540, voice?.wave ?? 'triangle');
    const time = this.host.scene.time;
    time.delayedCall(120, () => getSoundManager().ui.playDialogBlip((voice?.freq ?? 540) * 0.8, voice?.wave ?? 'triangle'));
    // E RESPONDE COM UMA LIÇÃO (pedido do autor): o gato é Diógenes, o cínico.
    time.delayedCall(450, () => this.talk());
    return true;
  }

  /**
   * O Z NO BARRIL: com o gato dormindo lá dentro, é carinho e lição (o mesmo do gato que segue); vazio, uma linha
   * do narrador. Devolve se o tile era o barril.
   */
  public useBarrelAt(x: number, y: number): boolean {
    if (!this.isBarrelAt(x, y)) return false;
    if (this.cat?.atHome && this.pet()) return true;
    this.host.narrate(tLines('cat.barrel'));
    return true;
  }

  /**
   * A próxima fala do gato (`cat.talk.<n>` em dialogos/<lang>.json), em ordem; depois de todas, qualquer uma. O que
   * o herói já ouviu fica no save.
   */
  public talk(): void {
    if (!this.host.canAct()) return;
    const talks: number[] = [];
    for (let n = 1; tLines(`cat.talk.${n}`).length > 0; n += 1) talks.push(n);
    if (talks.length === 0) return;
    const unsaid = talks.find((n) => !this.host.heard(`cat/talk/${n}`));
    const n = unsaid ?? talks[Math.floor(Math.random() * talks.length)];
    this.host.hear(`cat/talk/${n}`);
    this.host.persist();
    const script = { ...NPC_DIALOGS.blackCat, npcName: t('npc.blackCat.name'), lines: tLines(`cat.talk.${n}`) };
    this.host.say(script, this.host.voice());
  }

  public destroy(): void {
    this.cat?.destroy();
    this.cat = undefined;
    this.barrel?.destroy();
    this.barrel = undefined;
  }
}

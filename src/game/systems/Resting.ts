import type * as Engine from '@/game/engine';

import { getSoundManager } from '@/game/audio/SoundManager';
import { HERO_FRAMES } from '@/game/constants';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { DeathVisit, type DeathVisitHost } from '@/game/entities/DeathVisit';
import { FireBed, type FireBedHost } from '@/game/entities/FireBed';
import { ensureSleepTexture } from '@/game/entities/NpcManager';
import { tLines, type I18nLine } from '@/game/i18n/i18n';
import type { HeroView } from '@/game/runtime/HeroView';

/**
 * O DESCANSO: o herói sentado (numa fogueira acesa, num banco com vista, ao lado do telescópio) ou deitado no colchão
 * do acampamento. O corpo baixa e o relógio corre. Sentado, qualquer seta levanta. Dormindo, ninguém o levanta: a
 * noite passa, nas noites no acampamento a Morte vem sentar ao lado (uma vez por noite, até as três conversas), e
 * ele acorda e levanta sozinho quando clareia.
 *
 * O sistema é dono do ESTADO do descanso (quem senta, onde, se dorme, se a Morte já veio esta noite) e das decisões
 * (quando acordar, quando ela vem, quando a noite chega). O resto é da cena, pelo host: a câmera, os pés, a caneca,
 * quem veio sentar junto.
 */
export interface RestHost {
  scene: Engine.Scene;
  /** O corpo que senta e deita. */
  hero: HeroView;
  heroTile: () => { x: number; y: number };

  // ── o relógio ──
  setTimeScale: (scale: number) => void;
  isSleepTime: () => boolean;
  isNightTime: () => boolean;

  // ── o corpo e a câmera ──
  /** O corpo deixa de ser do jogador: para de respirar, os pés travam, a dica de controles sai. */
  settleBody: () => void;
  /** O pedido de direção guardado cai fora (a seta que levantou não pode virar passo). */
  dropStep: () => void;
  /** Os pés voltam para o jogador. */
  freeFeet: () => void;
  dolly: (factor: number, ms: number) => void;
  vignette: (level: number, ms: number) => void;
  /** Escuta as teclas enquanto ele descansa; devolve como parar de escutar. */
  listenKeys: (onKey: (event: KeyboardEvent) => void) => () => void;
  /** O item das costas some debaixo do cobertor. */
  hideBackItem: () => void;
  dirt: (x: number, y: number, count: number) => void;
  /** A tela do sono: o ponto (em px) de onde saem os "z", e o tamanho do pixel. null sem câmera. */
  snoreSpot: () => { x: number; y: number; px: number } | null;

  // ── o que a cena desfaz ao levantar ──
  /** O item volta às costas (se ele dormia), a câmera larga a vista (se sentou num achado), a caneca sai, o X destrava. */
  onStoodUp: (was: { sleeping: boolean; atFind: boolean }) => void;
  /** Quem veio sentar levanta junto e volta para casa. */
  sendGuestHome: () => void;
  /** A noite chegou ao lado do telescópio: quem está sentado fica (é ela quem fala depois). */
  keepGuestForSky: () => void;

  // ── a Morte ──
  /** Há aventura (no laboratório a Morte não vem, e não há foice). */
  canVisit: () => boolean;
  heard: (key: string) => boolean;
  hear: (key: string) => void;
  persist: () => void;
  /** Uma noite inteira dormida: o que cresce de madrugada cresce. */
  growOvernight: () => void;
  isSolid: (x: number, y: number) => boolean;
  /** Onde está quem veio sentar na fogueira (a Morte não senta em cima dele). */
  guestTile: () => { x: number; y: number } | null;
  smoke: (x: number, y: number) => void;
  /** A fala dela; `onClosed` roda quando a caixa fecha. */
  deathSays: (body: Billboard3D, lines: I18nLine[], onClosed: () => void) => void;
  /** A cena da Morte: o jogo para e os botões saem (true), ou volta (false). */
  cutscene: (on: boolean) => void;
  /** A foice que ela deixou, no lugar onde esteve (se o herói ainda não tem uma). */
  leaveScythe: (at: { x: number; y: number }) => void;
}

/** O colchão (entities/FireBed), como o descanso o usa. */
export interface RestBed {
  layDown(): void;
  tick(timeMs: number, at: { x: number; y: number }, px: number): void;
  quiet(): void;
  rise(): void;
  destroy(): void;
}

/** De onde saem o colchão e a Morte: no jogo, os de verdade (no mundo 3D); no teste, dublês. */
export interface RestParts {
  bed: (host: FireBedHost) => RestBed;
  death: (host: DeathVisitHost) => { run(): Promise<void> };
}

const REAL_PARTS: RestParts = {
  bed: (host) => {
    ensureSleepTexture(host.scene);
    return new FireBed(host);
  },
  death: (host) => new DeathVisit(host),
};

/**
 * Quanto o relógio acelera com o herói sentado numa fogueira: 24x faz o dia (8 min) passar em uns vinte segundos —
 * rápido o bastante para VER o céu andar, devagar o bastante para não piscar.
 */
export const REST_TIME_SCALE = 24;
/** Dormindo o céu anda o dobro de sentado: do meio-dia ao amanhecer leva uns poucos segundos. */
export const SLEEP_TIME_SCALE = 48;
/** A visita da Morte acontece uma vez só: a marca mora com as outras falas já ouvidas, no save. */
export const DEATH_VISIT_KEY = 'death/visit';
/**
 * AS TRÊS NOITES DA MORTE (pedido do autor), uma por noite dormida no acampamento, no caminho de Nietzsche: o
 * diagnóstico (os deuses do guerreiro morreram), a travessia (camelo e leão, e a pergunta do eterno retorno) e a
 * afirmação (a criança, o amor fati, "torna-te quem tu és"). Cada uma é uma chave no save e um texto no locale.
 */
export const DEATH_VISITS: ReadonlyArray<{ key: string; lines: string }> = [
  { key: DEATH_VISIT_KEY, lines: 'death.visit' },
  { key: 'death/visit2', lines: 'death.visit2' },
  { key: 'death/visit3', lines: 'death.visit3' },
];
/** A foice que a Morte deixou: o único jeito de ter uma. */
export const DEATH_SCYTHE_KEY = 'death/scythe';
/** As teclas que levantam (o ESC não: quem o escuta é a pausa, que levanta e para). */
const GET_UP_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'];
/** No acampamento a Morte senta ao lado das pedras, no chão livre da clareira (do outro lado delas é mato alto). */
const CAMP_DEATH_SPOTS: ReadonlyArray<{ x: number; y: number }> = [{ x: 55, y: 49 }, { x: 54, y: 49 }, { x: 55, y: 50 }];

export class Resting {
  private resting = false;
  /** Deitado no colchão: é o mesmo descanso, com o corpo deitado e o relógio mais rápido. */
  private sleeping = false;
  /** Deitado aqui, o herói já passou pela hora de dormir? */
  private sleptAtFire = false;
  /** Dormindo no acampamento (e não numa fogueira de vizinho): é lá que a Morte vem. */
  private sleepingAtCamp = false;
  /** Sentado num achado: a câmera olha a vista até ele levantar. */
  private sittingAtFind = false;
  /** A Morte está falando: nenhuma tecla levanta o herói até ela sumir. */
  private deathVisiting = false;
  /** A Morte já veio nesta noite: uma visita por noite, nunca duas no mesmo sono. */
  private deathCameTonight = false;
  /** Onde a Morte esteve: é ali que a foice aparece quando o herói levanta. */
  private deathTile?: { x: number; y: number };
  /** A fogueira (ou a vista) que ele encara sentado: o gato e a Morte se arrumam em volta dela. */
  private restFireTile?: { x: number; y: number };
  /** Quem espera a noite sentado (o telescópio da Thea): roda quando ela chega. */
  private onNightfall?: () => void;
  private bed?: RestBed;
  private stopKeys?: () => void;

  public constructor(private readonly host: RestHost, private readonly parts: RestParts = REAL_PARTS) {}

  public get isResting(): boolean { return this.resting; }
  public get isSleeping(): boolean { return this.sleeping; }
  /**
   * O JOGADOR PODE LEVANTAR? Sentado, sim, com qualquer seta, o Z, o X ou o ESC. DORMINDO, NÃO (pedido do autor,
   * 2026-11-09): o sono é dele — deita, a noite vem, a Morte vem, clareia, e só então ele levanta sozinho (`tick`).
   */
  public get canGetUp(): boolean { return this.resting && !this.sleeping && !this.deathVisiting; }

  /** O levantar que o JOGADOR pede (as setas, os botões, o ESC). Dormindo, não faz nada: quem acorda é a manhã. */
  public getUp(): void {
    if (this.canGetUp) this.standUp();
  }
  /** Sentado num banco com vista (a varanda de um vizinho, o tronco do acampamento). */
  public get atFind(): boolean { return this.sittingAtFind; }
  /** O que ele encara sentado; undefined de pé. */
  public get fireTile(): { x: number; y: number } | undefined { return this.restFireTile; }

  /** Sentar: o corpo baixa, o tempo corre, e qualquer seta levanta. A fogueira, o banco e o telescópio usam. */
  public sit(wx: number, wy: number, timeScale = REST_TIME_SCALE): void {
    const host = this.host;
    this.resting = true;
    this.sleptAtFire = false;
    host.settleBody();
    host.hero.frame = HERO_FRAMES.idleDown;
    host.scene.tweens.add({ targets: host.hero, scaleY: 0.84, scaleX: 1.05, duration: 380, ease: 'Sine.easeOut' });
    host.dolly(0.82, 1600);
    host.vignette(0.35, 1600);
    getSoundManager().ui.playCozyChime();
    host.setTimeScale(timeScale);
    this.restFireTile = { x: wx, y: wy };
    // Seta ou qualquer tecla levanta — as setas não passam por pressAttack/pressUse.
    this.stopKeys?.();
    this.stopKeys = host.listenKeys((event) => {
      if (event.repeat || !this.resting) return;
      if (GET_UP_KEYS.includes(event.code)) this.getUp();
    });
    host.persist();
  }

  /** Sentar num achado com vista: a cena já levou o herói para cima dele. */
  public sitOnFind(view: { x: number; y: number }): void {
    // O alvo do sentar é para onde ele olha: é dele que o gato tira o lado em que se enrola.
    this.sit(view.x, view.y);
    this.sittingAtFind = true;
  }

  /** Sentado ao lado do telescópio, esperando a noite: quando ela chega, ele levanta sozinho e `onNight` roda. */
  public waitForNight(wx: number, wy: number, onNight: () => void): void {
    this.sit(wx, wy);
    this.onNightfall = onNight;
  }

  /**
   * DEITAR PARA DORMIR, com o fogo (ou as pedras) que o corpo encara: a Morte e o gato se arrumam em volta dele. SÓ SE
   * DORME NO ACAMPAMENTO (pedido do autor): nas fogueiras dos vizinhos o herói só senta. `fixedBed` é o colchão que já
   * está no chão (o do acampamento); `atCamp`, que é ali que a Morte pode vir.
   */
  public lieDown(fireX: number, fireY: number, opts: { fixedBed?: boolean; atCamp?: boolean } = {}): void {
    if (opts.atCamp) this.sleepingAtCamp = true;
    this.sit(fireX, fireY, SLEEP_TIME_SCALE);
    this.sleeping = true;
    this.deathCameTonight = false;
    this.sleptAtFire = false;
    // O sentar baixa o corpo como quem senta; aqui quem manda no corpo é o colchão.
    const hero = this.host.hero;
    this.host.scene.tweens.killTweensOf(hero);
    hero.scaleX = 1;
    hero.scaleY = 1;
    this.host.hideBackItem();
    this.bed = this.parts.bed({
      scene: this.host.scene,
      hero,
      tile: this.host.heroTile(),
      dirt: (x, y, count) => this.host.dirt(x, y, count),
      fixed: opts.fixedBed ?? false,
    });
    this.bed.layDown();
  }

  /** Levantar: o relógio volta ao normal e o corpo se estica. Com a Morte falando, nada levanta. */
  public standUp(): void {
    if (!this.resting || this.deathVisiting) return;
    const host = this.host;
    const was = { sleeping: this.sleeping, atFind: this.sittingAtFind };
    this.resting = false;
    this.sleepingAtCamp = false;
    if (this.sleeping) {
      this.sleeping = false;
      this.bed?.rise();
      this.bed = undefined;
    }
    this.restFireTile = undefined;
    this.onNightfall = undefined;
    this.sittingAtFind = false;
    host.onStoodUp(was);
    this.leaveScythe();
    host.setTimeScale(1);
    this.stopKeys?.();
    this.stopKeys = undefined;
    // O vizinho que veio sentar levanta junto e volta para casa pelo mesmo caminho.
    host.sendGuestHome();
    // A seta que levantou não pode virar passo: os pés só soltam depois de o corpo se esticar.
    host.dropStep();
    host.scene.time.delayedCall(340, () => {
      if (this.resting) return;
      host.freeFeet();
    });
    host.scene.tweens.add({ targets: host.hero, scaleY: 1, scaleX: 1, duration: 320, ease: 'Back.easeOut' });
    host.dolly(1, 1100);
    host.vignette(0, 900);
  }

  /**
   * O quadro do descanso. Dormindo, a hora de dormir passa e o herói acorda quando clareia (ou a Morte vem, na noite
   * do acampamento); sentado ao lado do telescópio, a noite chega e ele levanta sozinho. Devolve true quando o quadro
   * acabou aqui (a cena não desenha mais nada dele).
   */
  public tick(): boolean {
    const host = this.host;
    if (this.sleeping) {
      if (host.isSleepTime()) {
        this.sleptAtFire = true;
      } else if (this.sleptAtFire) {
        // A noite passou: as tintas da Sisi amanheceram prontas (a dica está na fala dela).
        host.growOvernight();
        // A PRIMEIRA VISITA DA MORTE é na barraca (pedido do autor): o mago manda o herói dormir lá, e é ali, na
        // primeira noite de sono desde a guerra, que ela aparece. Nas fogueiras dos vizinhos ela não vem.
        const visit = DEATH_VISITS.find((v) => !host.heard(v.key));
        if (host.canVisit() && visit && this.sleepingAtCamp && !this.deathCameTonight) {
          void this.playDeathVisit(visit);
          return true;
        }
        if (!host.isNightTime()) {
          this.standUp();
          return true;
        }
      }
      this.tickSnore();
    }
    // Sentado ao lado do telescópio, a noite chega e ele levanta sozinho.
    if (this.onNightfall && host.isNightTime()) {
      const nightfall = this.onNightfall;
      // Ela fica: o levantar mandaria para casa quem está sentado ao lado.
      host.keepGuestForSky();
      this.standUp();
      host.scene.time.delayedCall(420, nightfall);
      return true;
    }
    return false;
  }

  /** A cena acabou (troca de cena, volta ao título): ninguém fica sentado, e o colchão some. */
  public reset(): void {
    this.stopKeys?.();
    this.stopKeys = undefined;
    this.resting = false;
    this.deathVisiting = false;
    this.sleeping = false;
    this.sleepingAtCamp = false;
    this.sittingAtFind = false;
    this.bed?.destroy();
    this.bed = undefined;
    this.restFireTile = undefined;
    this.onNightfall = undefined;
  }

  private tickSnore(): void {
    if (!this.bed) return;
    const spot = this.host.snoreSpot();
    if (!spot) return;
    this.bed.tick(this.host.scene.time.now, { x: spot.x, y: spot.y }, spot.px);
  }

  /**
   * A FOICE É O PRESENTE DA MORTE (pedido do autor): ela não existe solta no vale nem na bancada. Ao levantar
   * depois da visita, ela está no lugar onde a Morte esteve, como se tivesse deixado para ajudar. Uma vez só.
   */
  private leaveScythe(): void {
    const host = this.host;
    if (!host.canVisit() || !host.heard(DEATH_VISIT_KEY) || host.heard(DEATH_SCYTHE_KEY)) return;
    host.hear(DEATH_SCYTHE_KEY);
    const at = this.deathTile ?? host.heroTile();
    this.deathTile = undefined;
    host.leaveScythe(at);
    host.persist();
  }

  /** Do outro lado do fogo, olhando para o herói; se ali não couber, de um dos lados. */
  public deathSpot(): { x: number; y: number } {
    const host = this.host;
    const hero = host.heroTile();
    if (this.sleepingAtCamp) {
      const spot = CAMP_DEATH_SPOTS.find((t) => !host.isSolid(t.x, t.y) && !(t.x === hero.x && t.y === hero.y));
      if (spot) return spot;
    }
    const fire = this.restFireTile ?? { x: hero.x, y: hero.y - 1 };
    const dx = Math.sign(fire.x - hero.x);
    const dy = Math.sign(fire.y - hero.y);
    const spots = [
      { x: fire.x + dx, y: fire.y + dy },
      { x: fire.x + dy, y: fire.y + dx },
      { x: fire.x - dy, y: fire.y - dx },
    ];
    const guest = host.guestTile();
    return spots.find((spot) => !host.isSolid(spot.x, spot.y)
      && !(guest && Math.hypot(guest.x - spot.x, guest.y - spot.y) < 0.8)) ?? spots[0];
  }

  private async playDeathVisit(visit: { key: string; lines: string }): Promise<void> {
    const host = this.host;
    this.deathVisiting = true;
    this.deathCameTonight = true;
    host.cutscene(true);
    this.bed?.quiet();
    // A conversa acontece no tempo dela: o céu para enquanto ela fala, ou quem lê devagar veria amanhecer.
    host.setTimeScale(0);
    host.vignette(0.6, 1200);
    // O quadro abre: de perto, a cabeça dela ficaria fora da tela.
    host.dolly(1, 1200);
    const at = this.deathSpot();
    this.deathTile = at;
    await this.parts.death({
      scene: host.scene,
      at,
      smoke: (x, y) => host.smoke(x, y),
      say: (body, onClosed) => host.deathSays(body, tLines(visit.lines), onClosed),
    }).run();
    host.hear(visit.key);
    host.persist();
    host.vignette(0.35, 900);
    host.dolly(0.82, 900);
    if (this.resting) host.setTimeScale(this.sleeping ? SLEEP_TIME_SCALE : REST_TIME_SCALE);
    this.deathVisiting = false;
    host.cutscene(false);
  }
}

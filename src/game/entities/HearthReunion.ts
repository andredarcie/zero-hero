import { getSoundManager } from '@/game/audio/SoundManager';
import { FireVisitor, type VisitPath } from '@/game/entities/FireVisitor';
import { squashBounce, TheaShip, type TheaShipHost } from '@/game/entities/TheaShip';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import type { NpcKind } from '@/game/world/ScreenContent';

/**
 * A FOGUEIRA DO FIM, COM TODO MUNDO. Zero está sozinho assando o marshmallow quando os amigos entram pelo
 * portão, um a um, e sentam em volta do fogo, sem dizer nada. Falta Thea. Passa um tempo, a nave desce
 * ali dentro do jardim, e Thea sai dela e senta também. Os corpos são stand-ins, como os de FireVisitor:
 * o fim leva aos créditos, e ninguém volta para casa.
 */

export interface HearthReunionHost extends TheaShipHost {
  fire: { x: number; y: number };
  heroBody: { scaleX: number; scaleY: number };
  /** Por onde os amigos entram. */
  gate: readonly [number, number];
  /** O caminho até o lugar livre mais desejado desta lista. */
  pathTo: (from: readonly [number, number], seats: ReadonlyArray<readonly [number, number]>) => VisitPath | null;
  isFree: (x: number, y: number) => boolean;
  away: (kind: NpcKind) => void;
  hearts: (x: number, y: number) => void;
  heroFaces: (dx: number, dy: number) => void;
  /** Thea fala com este corpo, e `onClosed` roda com a cena de novo congelada. */
  say: (speaker: Billboard3D, onClosed: () => void) => void;
}

/** Os amigos, na ordem em que chegam. */
const FRIENDS: readonly NpcKind[] = ['wizard', 'painter', 'businessMan', 'radiationSuit'];
const ARRIVE_GAP_MS = 1100;
const SEATED_POLL_MS = 120;
/** Os lugares em volta do fogo, do mais desejado ao último. */
const SEAT_OFFSETS: ReadonlyArray<readonly [number, number]> = [[-1, 1], [1, 1], [-2, 0], [2, 0], [1, -1], [-1, -1], [-2, 1], [2, 1]];
/** O corpo sentado, igual ao do FireVisitor. */
const SEATED_W = 1.04;
const SEATED_H = 0.86;

export class HearthReunion {
  private readonly visitors: FireVisitor[] = [];
  private readonly seats: Array<readonly [number, number]>;
  private ship?: TheaShip;

  public constructor(private readonly host: HearthReunionHost, hero: { x: number; y: number }) {
    const { fire } = host;
    // Zero fica acima do fogo, de frente para a câmera: a roda se abre embaixo dele, sem ninguém bem
    // atrás da chama, e Thea, que chega por último, senta ao lado dele.
    this.seats = SEAT_OFFSETS
      .map(([dx, dy]) => [fire.x + dx, fire.y + dy] as const)
      .filter(([x, y]) => !(x === hero.x && y === hero.y) && host.isFree(x, y));
  }

  public destroy(): void {
    for (const visitor of this.visitors) visitor.destroy();
    this.visitors.length = 0;
    this.ship?.destroy();
    this.ship = undefined;
  }

  private pause(ms: number): Promise<void> {
    return new Promise((resolve) => { this.host.scene.time.delayedCall(ms, resolve); });
  }

  /** Um corpo a caminho do lugar mais desejado que sobrou. O lugar sai da lista. */
  private send(kind: NpcKind, from: readonly [number, number]): FireVisitor {
    const { host } = this;
    host.away(kind);
    const path = host.pathTo(from, this.seats);
    const seat = path?.[path.length - 1] ?? this.seats[0];
    const index = this.seats.findIndex((s) => seat && s[0] === seat[0] && s[1] === seat[1]);
    if (index >= 0) this.seats.splice(index, 1);
    const visitor = new FireVisitor(host.scene, kind, path ?? [from, seat ?? from]);
    this.visitors.push(visitor);
    visitor.arrive();
    return visitor;
  }

  private async seated(visitor: FireVisitor): Promise<void> {
    for (let i = 0; i < 120 && !visitor.isSeated; i += 1) await this.pause(SEATED_POLL_MS);
    await this.pause(400);
  }

  /** Cada um que senta dá um quique, e uma faísca sobe: é o único "oi" da cena. */
  private greet(visitor: FireVisitor): void {
    const { scene, sparkle } = this.host;
    const body = visitor.bodySprite;
    squashBounce(scene, body, SEATED_W, SEATED_H, 0.12);
    sparkle(body.x, body.y);
    getSoundManager().ui.playCozyChime();
  }

  /** Os quatro, um a um, pelo portão. */
  public async friends(): Promise<void> {
    const { host } = this;
    squashBounce(host.scene, host.heroBody, host.heroBody.scaleX, host.heroBody.scaleY, 0.12);
    getSoundManager().ui.playPaperUnfold();
    const arriving: Array<Promise<void>> = [];
    for (const kind of FRIENDS) {
      const visitor = this.send(kind, host.gate);
      arriving.push(this.seated(visitor).then(() => this.greet(visitor)));
      await this.pause(ARRIVE_GAP_MS);
    }
    await Promise.all(arriving);
  }

  /** A nave desce no jardim, Thea sai, e a roda inteira comemora. */
  public async thea(): Promise<void> {
    const { host } = this;
    const { at } = host;
    host.heroFaces(0, -1);
    const ship = new TheaShip(host);
    this.ship = ship;
    await ship.land();
    for (const visitor of this.visitors) squashBounce(host.scene, visitor.bodySprite, SEATED_W, SEATED_H, 0.16);
    squashBounce(host.scene, host.heroBody, host.heroBody.scaleX, host.heroBody.scaleY, 0.16);
    await this.pause(700);
    ship.openDoor();
    await this.pause(500);
    const thea = this.send('astronaut', [Math.round(at.x), Math.round(at.y)]);
    await this.seated(thea);
    this.greet(thea);
    await this.pause(350);
    await new Promise<void>((resolve) => host.say(thea.bodySprite, resolve));
    ship.closeDoor();
    // Agora sim, todo mundo: um pulinho em onda em volta do fogo, e os corações.
    this.visitors.forEach((visitor, i) => {
      host.scene.time.delayedCall(i * 130, () => {
        const body = visitor.bodySprite;
        host.scene.tweens.add({ targets: body, elevation: 0.34, duration: 170, ease: 'Sine.easeOut', yoyo: true });
      });
    });
    host.hearts(thea.bodySprite.x, thea.bodySprite.y);
    host.hearts(host.fire.x, host.fire.y);
    getSoundManager().ui.playSingingBowl();
    await this.pause(1500);
  }
}

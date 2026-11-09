import type * as Engine from '@/game/engine';

import { FUNGUS_KIN_SIZE, fungusKinTextureKey, type MushroomKind } from '@/game/fungi/fungi';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { world3d } from '@/game/render3d/World3D';

/**
 * OS COGUMELINHOS-FILHOS (pedido do autor: uma ajuda sutil para achar os cogumelos, sem mostrar na cara).
 *
 * É a biologia: o fungo vive em fios debaixo da terra (o micélio, como a Shui ensina na primeira conversa), e
 * em volta do cogumelo grande ele solta outros, pequenos, da mesma espécie. Aqui eles são enfeite (não se colhem),
 * ficam mais juntos perto do cogumelo e rareiam com a distância — quem repara num deles aprende a seguir os
 * pequenos até o grande, e quem não repara só vê um chão mais vivo.
 *
 * A arte é a MESMA receita da espécie (fungi.ts), pintada em 7px e mostrada em 7/16 de tile: a mesma densidade de
 * pixel do resto do jogo, sem esticar nem encolher arte.
 *
 * Os filhos morrem com o cogumelo: colhida a espécie (cada uma existe uma vez no vale e não renasce), eles afundam
 * e somem — uma trilha que levasse a lugar nenhum seria uma mentira.
 */

/**
 * Quanto a trilha alcança, em tiles, e a chance de um filho em cada anel (o índice é a distância). A MESMA conta
 * (e o mesmo hash) está em scripts/chao-dos-filhos.mjs, que deixa liso o chão sorteado: mudou aqui, muda lá.
 */
const REACH = 5;
const RING_CHANCE = [0, 0.35, 0.21, 0.12, 0.065, 0.035];
const SIZE = FUNGUS_KIN_SIZE / 16;
/**
 * Um tom abaixo do cogumelo grande: pequenos e no chão, à sombra do mato. Na cor cheia, o creme dos talos acendia
 * no brilho da tela e a trilha virava uma fila de lampadinhas — o contrário de sutil.
 */
const KIN_TINT = 0x9c9c94;

export interface KinMushroom {
  kind: MushroomKind;
  worldX: number;
  worldY: number;
}

/** O tile pode ter um filho (chão livre, no mesmo nível do cogumelo)? Quem sabe é a cena. */
export type KinTileFree = (x: number, y: number, mother: KinMushroom) => boolean;

const hash = (x: number, y: number, seed: number): number => {
  const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

export class MushroomKin {
  private readonly byKind = new Map<MushroomKind, Billboard3D[]>();

  public constructor(private readonly scene: Engine.Scene, mushrooms: readonly KinMushroom[], free: KinTileFree) {
    const w3 = world3d();
    for (const mother of mushrooms) {
      const kids: Billboard3D[] = [];
      for (let dy = -REACH; dy <= REACH; dy += 1) {
        for (let dx = -REACH; dx <= REACH; dx += 1) {
          const ring = Math.round(Math.hypot(dx, dy));
          if (ring < 1 || ring > REACH) continue;
          const x = mother.worldX + dx;
          const y = mother.worldY + dy;
          if (hash(x, y, 1) > RING_CHANCE[ring] || !free(x, y, mother)) continue;
          // Colados no cogumelo, às vezes vêm dois juntos: é assim que um tufo nasce.
          const count = ring === 1 && hash(x, y, 2) < 0.5 ? 2 : 1;
          for (let i = 0; i < count; i += 1) {
            const kid = w3.objects.addBillboard(fungusKinTextureKey(mother.kind), 0, {})
              .setPosition(x + (hash(x, y, 3 + i) - 0.5) * 0.6, y + (hash(x, y, 5 + i) - 0.5) * 0.45)
              .setDisplaySize(SIZE, SIZE)
              .setTint(KIN_TINT)
              .setFlipX(hash(x, y, 7 + i) < 0.5);
            kids.push(kid);
          }
        }
      }
      this.byKind.set(mother.kind, kids);
    }
  }

  /** Quantos filhos a espécie tem agora (a janela do playtest). */
  public count(kind: MushroomKind): number {
    return this.byKind.get(kind)?.length ?? 0;
  }

  /** A espécie foi colhida: os filhos afundam no chão e somem, um depois do outro. */
  public wither(kind: MushroomKind): void {
    const kids = this.byKind.get(kind);
    if (!kids) return;
    this.byKind.delete(kind);
    kids.forEach((kid, i) => {
      this.scene.tweens.add({
        targets: kid,
        alpha: 0,
        elevation: -SIZE,
        delay: 300 + i * 45,
        duration: 600,
        ease: 'Sine.easeIn',
        onComplete: () => kid.destroy(),
      });
    });
  }

  public destroy(): void {
    for (const kids of this.byKind.values()) {
      for (const kid of kids) {
        this.scene.tweens?.killTweensOf(kid);
        kid.destroy();
      }
    }
    this.byKind.clear();
  }
}

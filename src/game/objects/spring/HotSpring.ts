import { getSoundManager } from '@/game/audio/SoundManager';
import type { BeachFrame, BeachSystem } from '@/game/objects/beach/kit';
import type { Billboard3D } from '@/game/render3d/Billboard3D';
import { springUniforms } from '@/game/render3d/springWater';
import { textureImage } from '@/game/render3d/textures3d';
import { world3d } from '@/game/render3d/World3D';
import { SPRING_DEPTH, SPRING_LANTERN, SPRING_MAPLE, SPRING_POOL, SPRING_SURFACE, isSpringPool } from '@/game/world/hotSpring';

import { BASIN, BASIN_H, BASIN_W, BUCKET, ROCKS, WATER_ORDER, WHITE, springTextures } from './springArt';
import { SpringCascade } from './SpringCascade';
import { SpringMaple } from './SpringMaple';
import { SpringNight } from './SpringNight';
import { SpringSteam } from './SpringSteam';

/**
 * A FONTE TERMAL (pedido do autor, 2026-11-19: "um lugar aleatório do mapa para descanso", "depois do lago de lava").
 * Numa gruta no pé da serra, atrás da lava: do corredor das minas entra-se nela por entre as pedras de minério
 * (scripts/praia-do-norte.mjs, SPRING). Paredões de mata alta em volta e NADA DA PRAIA À VISTA (o autor: "zero contato
 * com a praia... separar experiências"); o descanso nela é o do banco do lago, não o da cadeira do mar.
 *
 * O VISUAL FOI REFEITO INTEIRO (o autor: "melhore drasticamente o visual da fonte termal, foco total em qualidade e
 * beleza visual"). Este arquivo é o maestro; cada peça mora no seu:
 *
 *   · A BACIA É FUNDA DE VERDADE (o autor: "faça o lago ter profundidade 3D, ser possível ver o fundo"): quem a cava é
 *     o terreno (world/hotSpring, TerrainFeatures.bakeSpring) — o leito de areia, a borda de pedra avançando, a parede.
 *   · A ÁGUA: uma lâmina translúcida um palmo abaixo da borda, pintada no shader dentro da luz do mundo
 *     (render3d/springWater) — a fundura em degraus, as cáusticas no leito, o leite que deriva, a espuma na margem, no
 *     pé da cascata e em quem está dentro, a chuva, o céu, a luz própria da noite e o dourado da lanterna. É desenhada
 *     DEPOIS dos corpos e sem escrever profundidade: cobre o que está debaixo dela (o leito, as pedras do fundo, as
 *     pernas de quem entra) e não o que está acima.
 *   · AS LAJES molhadas em volta e AS PEDRAS facetadas com musgo, na beira e no fundo (rockArt).
 *   · A CASCATA que sai da bica de pedra do paredão (SpringCascade).
 *   · O VAPOR em fios e a névoa rente à água (SpringSteam).
 *   · O BORDO de outono, com as folhas caindo e boiando (SpringMaple).
 *   · A NOITE: a lanterna de pedra e os vaga-lumes (SpringNight).
 *
 * Roda no quadro da praia (objects/beach/BeachLife, o maestro da faixa do norte), e só acorda com o herói perto.
 */

// (onde a fonte fica e o tamanho da bacia são do mapa: world/hotSpring)
export { SPRING_LANTERN, SPRING_MAPLE, SPRING_POOL, isSpringPool };
const CENTER = { x: (SPRING_POOL.x0 + SPRING_POOL.x1) / 2, y: (SPRING_POOL.y0 + SPRING_POOL.y1) / 2 };
/**
 * Para onde a câmera vai quando ele entra na água (o banco do lago faz o mesmo com o lago: CampLife.sitAtFind). Um
 * pouco ao norte do meio da água, para o corredor das minas sair pelo pé do quadro; e o passeio de lado do olhar
 * (DialogCamera, 1,2 tile no banco) é curto: a gruta é estreita, e o passeio largo tirava a água do meio.
 */
export const SPRING_VIEW = { x: CENTER.x + 0.35, y: CENTER.y - 0.75, drift: 0.35 } as const;
/** As meias medidas da bacia (os tiles dela: a margem de dentro, de contorno orgânico, é do terreno). */
const HALF = { w: (SPRING_POOL.x1 - SPRING_POOL.x0 + 1) / 2, h: (SPRING_POOL.y1 - SPRING_POOL.y0 + 1) / 2 };
/** A lâmina d'água sobre o leito (tiles): é por ela que o shader acha o leito atrás de cada ponto da água. */
const WATER_DEEP = SPRING_DEPTH + SPRING_SURFACE;
/** O paredão do fundo começa na beira do tile de cima; a cascata cai dele, à esquerda do meio. */
const WALL = SPRING_POOL.y0 - 0.5;
const CASCADE_X = 4.2;
/** O chão da gruta, por onde andam os vaga-lumes. */
const GROTTO = { x0: 1.2, y0: -3.4, x1: 9.8, y1: -0.9 };
/** O tom das peças do mundo (nature/kit PROP_TINT): a luz do vale estoura os claros. */
const TINT = 0xb4b0aa;
/** O tom da água: sob a luz dourada do vale o turquesa pede um nada de azul. */
const WATER_TINT = 0xc0c8d2;
/** A que distância (tiles) a fonte acorda. */
const AWAKE = 26;
/**
 * AS PEDRAS (qual desenho de springArt.ROCKS, e o pé dela). As da BEIRA ficam no chão, em volta da bacia; as de `sunk`
 * ficam NO LEITO, debaixo d'água (a água as cobre e tinge: é nelas que a fundura se vê), e uma ou outra fura a
 * superfície. Um quadro em pé deita para trás com a câmera: as do fundo ficam longe do paredão na medida da altura
 * delas (senão o alto entra na pedra). O meio da beira de baixo fica livre: é por ali que se entra.
 */
const STONES: ReadonlyArray<{ rock: number; x: number; y: number; sunk?: boolean }> = [
  { rock: 0, x: 2.42, y: -2.98 }, { rock: 1, x: 6.62, y: -3.06 },
  { rock: 2, x: 2.3, y: -2.2 }, { rock: 3, x: 6.7, y: -1.56 },
  { rock: 4, x: 2.72, y: -1.5 }, { rock: 4, x: 3.05, y: -1.36 }, { rock: 4, x: 6.0, y: -1.36 },
  { rock: 3, x: 3.3, y: -3.0, sunk: true }, { rock: 2, x: 5.5, y: -3.02, sunk: true },
  { rock: 5, x: 5.9, y: -2.55, sunk: true }, { rock: 4, x: 3.1, y: -2.45, sunk: true },
  { rock: 5, x: 4.7, y: -2.72, sunk: true }, { rock: 4, x: 4.05, y: -2.2, sunk: true },
];

/**
 * Quanto vapor sai (0..1): o ar frio o engrossa. Cheio de madrugada (0,2 do mostrador), ralo no meio da tarde (0,7), e a
 * chuva o adensa.
 */
export const steamAt = (phase: number, rain: number): number => {
  const cold = 0.5 + 0.5 * Math.cos((phase - 0.2) * Math.PI * 2);
  return Math.min(1, 0.3 + 0.6 * cold + 0.3 * rain);
};

export class HotSpring implements BeachSystem {
  private water?: Billboard3D;
  private readonly pieces: Billboard3D[] = [];
  private vapour?: SpringSteam;
  private cascade?: SpringCascade;
  private maple?: SpringMaple;
  /** A lanterna e os vaga-lumes (a gruta de noite). */
  public night?: SpringNight;
  private bubbleIn = 0;
  private pourIn = 0;
  private awake = true;
  /** Onde o herói está dentro da água (scenes/game/SeaWatch); null fora dela. */
  public soakAt: { x: number; y: number } | null = null;
  /** Quanto vapor sai agora (0..1; a janela do playtest lê). */
  public steam = 0;

  public isPool(x: number, y: number): boolean {
    return isSpringPool(x, y);
  }

  /**
   * Por onde se entra: de frente, pela beira de baixo (as pedras fecham os lados e o fundo). `from` é onde ele está.
   */
  public entry(x: number, y: number, from: { x: number; y: number }): boolean {
    return isSpringPool(x, y) && y === SPRING_POOL.y1 && from.x === x && from.y === y + 1;
  }

  /** Ele entrou na água: ela chia baixinho (o colar de espuma e os anéis em volta do corpo são da água). */
  public enter(x: number, y: number): void {
    this.soakAt = { x, y };
    getSoundManager().nature.playSpringSlip();
  }

  public leave(): void {
    if (!this.soakAt) return;
    this.soakAt = null;
    getSoundManager().nature.playShallowStep();
  }

  public update(f: BeachFrame): void {
    if (!this.water && !this.build()) return;
    const awake = Math.hypot(f.hero.x - CENTER.x, f.hero.y - CENTER.y) < AWAKE;
    if (awake !== this.awake) this.setVisible(awake);
    if (!awake) return;
    const day = Math.min(1, Math.max(0, world3d().params.daylight));
    this.steam = steamAt(f.phase, f.rain);
    this.night?.update(f.dt, f.phase);
    const night = this.night?.night ?? 0;
    this.vapour?.update(f.dt, this.steam, f.wind, day, night);
    this.cascade?.update(f.dt, this.steam, this.vapour?.tint ?? 0xffffff);
    this.maple?.update(f.dt, f.gust);
    // o que a água precisa saber deste quadro (render3d/springWater)
    springUniforms.uSpringBody.value.set(this.soakAt?.x ?? 0, this.soakAt?.y ?? 0, this.soakAt ? 1 : 0, 0);
    springUniforms.uSpringLamp.value.set(SPRING_LANTERN.x, SPRING_LANTERN.y, night * (this.night?.flicker ?? 1), 0);
    springUniforms.uSpringMood.value.set(day, night, f.rain, WATER_DEEP);
    this.tickSound(f);
  }

  /** A textura nasce quando a praia acorda (o kit só registra depois que o World3D carregou as dele). */
  private build(): boolean {
    springTextures();
    if (!textureImage(WHITE)) return false;
    const objects = world3d().objects;
    const pool = { x: CENTER.x, y: CENTER.y, hw: HALF.w, hh: HALF.h };
    // as lajes molhadas em volta da bacia (no chão), e a lâmina d'água dentro dela (um quad liso: tudo o mais é do
    // shader). A água é desenhada depois dos corpos e não escreve profundidade: ver o comentário do arquivo.
    this.pieces.push(objects.addBillboard(BASIN, 0, { flat: true, flatY: 0.02, depthLayer: 'ground' })
      .setTint(TINT)
      .setDisplaySize(BASIN_W / 16, BASIN_H / 16)
      .setPosition(CENTER.x, CENTER.y));
    this.water = objects.addBillboard(WHITE, 0, {
      flat: true, flatY: SPRING_SURFACE, depthLayer: 'ground', worldFx: 'spring', alphaTest: 0.01, depthWrite: false, renderOrder: WATER_ORDER,
    })
      .setTint(WATER_TINT)
      .setDisplaySize(HALF.w * 2 + 0.04, HALF.h * 2 + 0.04)
      .setPosition(CENTER.x, CENTER.y);
    for (const s of STONES) {
      const rock = ROCKS[s.rock];
      const stone = objects.addBillboard(rock.key, 0, s.sunk ? {} : { groundShadow: { rx: rock.w / 30, rz: rock.w / 76, alpha: 0.3 } })
        .setTint(TINT)
        .setDisplaySize(rock.w / 16, rock.h / 16)
        .setPosition(s.x, s.y);
      if (s.sunk) stone.setElevation(-SPRING_DEPTH);
      this.pieces.push(stone);
    }
    // o balde de madeira com a toalha, ao pé da lanterna
    this.pieces.push(objects.addBillboard(BUCKET, 0, { groundShadow: { rx: 0.3, rz: 0.12, alpha: 0.3 } })
      .setTint(TINT)
      .setDisplaySize(11 / 16, 9 / 16)
      .setPosition(SPRING_LANTERN.x + 0.36, SPRING_LANTERN.y + 0.24));
    this.cascade = new SpringCascade(CASCADE_X, WALL, SPRING_SURFACE);
    this.vapour = new SpringSteam(pool, SPRING_SURFACE, SPRING_LANTERN);
    this.maple = new SpringMaple({ x: SPRING_MAPLE.x + 0.15, y: SPRING_MAPLE.y + 0.12 }, pool, SPRING_SURFACE);
    this.night = new SpringNight(SPRING_LANTERN, GROTTO);
    springUniforms.uSpringRect.value.set(CENTER.x, CENTER.y, HALF.w, HALF.h);
    springUniforms.uSpringFall.value.set(this.cascade.foot.x, this.cascade.foot.y, 1, 0);
    this.awake = true;
    return true;
  }

  /** A bolha de vez em quando e o murmúrio da cascata: mais perto, mais alto; dentro da água, a bolha mais amiúde. */
  private tickSound(f: BeachFrame): void {
    const near = this.soakAt ? 1 : Math.max(0, 1 - Math.hypot(f.hero.x - CENTER.x, f.hero.y - CENTER.y) / 7);
    if (near <= 0) return;
    this.bubbleIn -= f.dt;
    if (this.bubbleIn <= 0) {
      this.bubbleIn = (this.soakAt ? 0.45 : 0.8) + Math.random() * 1.1;
      getSoundManager().nature.playSpringBubble(near * (this.soakAt ? 0.8 : 0.55));
    }
    this.pourIn -= f.dt;
    if (this.pourIn <= 0) {
      this.pourIn = 0.9 + Math.random() * 0.3;
      getSoundManager().nature.playSpringPour(near);
    }
  }

  private setVisible(on: boolean): void {
    this.awake = on;
    this.water?.setVisible(on);
    for (const p of this.pieces) p.setVisible(on);
    this.vapour?.setVisible(on);
    this.cascade?.setVisible(on);
    this.maple?.setVisible(on);
    this.night?.setVisible(on);
  }

  public destroy(): void {
    this.water?.destroy();
    this.water = undefined;
    for (const p of this.pieces) p.destroy();
    this.pieces.length = 0;
    this.vapour?.destroy();
    this.cascade?.destroy();
    this.maple?.destroy();
    this.night?.destroy();
    this.vapour = undefined;
    this.cascade = undefined;
    this.maple = undefined;
    this.night = undefined;
    this.soakAt = null;
  }
}

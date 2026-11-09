import * as Engine from '@/game/engine';

import { BigTrees } from '@/game/objects/BigTrees';
import { WoodFence } from '@/game/objects/WoodFence';
import { LumberYard } from '@/game/objects/LumberYard';
import { OldForge } from '@/game/objects/OldForge';
import { CrashSite } from '@/game/objects/CrashSite';
import { CatBarrel } from '@/game/objects/CatBarrel';
import { HeroCamp } from '@/game/objects/HeroCamp';
import { KoiPond } from '@/game/objects/KoiPond';
import { NpcHomes } from '@/game/objects/NpcHomes';
import { OldRoad } from '@/game/objects/OldRoad';
import { registerFindTextures, ValleyFinds } from '@/game/objects/ValleyFinds';
import { Waterfall } from '@/game/objects/Waterfall';
import { registerHomeTextures } from '@/game/render3d/homeTextures';
import { getTexture3D } from '@/game/render3d/textures3d';
import { setCurrentWorld3D, type World3D } from '@/game/render3d/World3D';

/**
 * AS PEÇAS DO JOGO NO EDITOR (pedido do autor: "revise se o editor tem tudo que temos de novo no mapa e se ele é
 * fiel totalmente"). O world.json guarda tiles, colisões e entidades; mas uma parte do mapa o JOGO monta por código,
 * em lugares fixos: a cachoeira e o riacho do alto, o lago das carpas (vitórias-régias, taboas, carpas), o bosque
 * (carvalhos, bétulas, troncos caídos), o acampamento do herói, o barril do gato, a estrada velha, as casas dos
 * vizinhos e os achados do vale. O editor não via nada disso.
 *
 * Para ser FIEL de verdade, o editor não redesenha essas peças: ele CRIA os mesmos objetos do jogo, com o mesmo
 * código, sobre um mundo 3D de mentira que só ANOTA o que cada um pede (textura, posição, tamanho, altura, espelho,
 * cor, transparência) — e desenha o anotado em 2D com as mesmas texturas. Uma peça que mudar no jogo muda aqui sozinha.
 *
 * Fica de fora o que não é mapa, é TEMPO: os bichos e plantas da natureza (objects/nature), os passarinhos, a chuva —
 * aparecem conforme a hora, o dia e o tempo, não num lugar fixo.
 */

/** Uma peça anotada, em tiles do mundo (o centro do tile é o inteiro, como no jogo). */
export interface FixtureSprite {
  key: string;
  frame: number;
  x: number;
  y: number;
  w: number;
  h: number;
  elevation: number;
  flat: boolean;
  centered: boolean;
  flipX: boolean;
  angle: number;
  alpha: number;
  additive: boolean;
  /** A cor que o jogo pôs no material (a cor do bioma das árvores); null = a textura pura. */
  color: [number, number, number] | null;
}

interface BillboardOpts { flat?: boolean; centered?: boolean; additive?: boolean }

/** O billboard de mentira: aceita tudo que os objetos chamam e só guarda o estado. */
class RecordedBillboard {
  public visible = true;
  public alpha = 1;
  public angle = 0;
  private color: [number, number, number] | null = null;
  private destroyed = false;
  private s: Omit<FixtureSprite, 'alpha' | 'angle' | 'color'>;
  public readonly mesh: { material: { color: { setRGB: (r: number, g: number, b: number) => void } } };

  public constructor(key: string, frame: number, opts: BillboardOpts) {
    this.s = { key, frame, x: 0, y: 0, w: 1, h: 1, elevation: 0, flat: !!opts.flat, centered: !!opts.centered, flipX: false, additive: !!opts.additive };
    this.mesh = { material: { color: { setRGB: (r, g, b) => { this.color = [r, g, b]; } } } };
  }

  public get x(): number { return this.s.x; }
  public get y(): number { return this.s.y; }
  public setPosition(x: number, y: number): this { this.s.x = x; this.s.y = y; return this; }
  public setDisplaySize(w: number, h: number): this { this.s.w = w; this.s.h = h; return this; }
  public setElevation(e: number): this { this.s.elevation = e; return this; }
  public setTexture(key: string, frame = 0): this { this.s.key = key; this.s.frame = frame; return this; }
  public setFlipX(f: boolean): this { this.s.flipX = f; return this; }
  public setAngle(a: number): this { this.angle = a; return this; }
  public setAlpha(a: number): this { this.alpha = a; return this; }
  public setVisible(v: boolean): this { this.visible = v; return this; }
  // O tom de luz das peças (0xb4b0aa...) compensa a luz do mundo 3D; o editor não tem essa luz, então não entra.
  public setTint(): this { return this; }
  public setTintFill(): this { return this; }
  public clearTint(): this { return this; }
  public setDepthLayer(): this { return this; }
  public setBlinkAlpha(): this { return this; }
  public destroy(): void { this.destroyed = true; }

  public snapshot(): FixtureSprite | null {
    if (this.destroyed || !this.visible || this.alpha < 0.04) return null;
    return { ...this.s, alpha: this.alpha, angle: this.angle, color: this.color };
  }
}

/** O mundo 3D de mentira: só o que os objetos de mapa usam dele. */
class RecordingWorld {
  public readonly bodies: RecordedBillboard[] = [];
  /** A cachoeira lê a luz do dia (o arco-íris dela): no editor, dia claro. */
  public readonly params = { daylight: 1 };
  /** Os objetos de mapa pedem o billboard pela faceta `objects`, como no World3D de verdade (ver WorldObjects). */
  public readonly objects = {
    addBillboard: (key: string, frame = 0, opts: BillboardOpts = {}): RecordedBillboard => {
      const bb = new RecordedBillboard(key, frame, opts);
      this.bodies.push(bb);
      return bb;
    },
  };
}

/** Cria as peças do jogo sobre o mundo de mentira e devolve o que elas pediram. */
export const recordFixtures = (scene: Engine.Scene): FixtureSprite[] => {
  registerHomeTextures(scene);
  registerFindTextures(scene);
  const world = new RecordingWorld();
  setCurrentWorld3D(world as unknown as World3D);
  // O herói "longe": nenhuma copa fica translúcida e nenhuma carpa vem à beira.
  const far = (): { x: number; y: number } => ({ x: -100, y: -100 });
  const built: Array<{ destroy(): void }> = [];
  const make = (label: string, create: () => { destroy(): void }): void => {
    try {
      built.push(create());
    } catch (error) {
      console.warn(`[editor] peça do jogo "${label}" não montou no editor`, error);
    }
  };
  make('acampamento', () => new HeroCamp(scene, () => true));
  make('barril do gato', () => new CatBarrel());
  make('cachoeira', () => new Waterfall(scene));
  make('lago das carpas', () => new KoiPond(scene, far));
  make('bosque', () => new BigTrees(scene, far));
  make('cerca de madeira', () => new WoodFence());
  make('quintal do lenhador', () => new LumberYard());
  make('forja velha', () => new OldForge());
  make('cratera da nave', () => new CrashSite(scene));
  make('estrada velha', () => new OldRoad());
  make('casas dos vizinhos', () => new NpcHomes());
  make('achados do vale', () => new ValleyFinds());
  const sprites = world.bodies.map((b) => b.snapshot()).filter((s): s is FixtureSprite => s !== null);
  // Tiram os ouvintes de quadro (a cachoeira e as carpas animam no jogo; aqui é a foto parada).
  for (const b of built) b.destroy();
  setCurrentWorld3D(undefined);
  return sprites;
};

/** A textura da peça no motor 2D: a mesma imagem que o jogo deu ao THREE (canvas desenhado por código). */
export const ensureFixtureTexture = (scene: Engine.Scene, key: string): boolean => {
  if (scene.textures.exists(key)) return true;
  try {
    const image = getTexture3D(key).image as HTMLCanvasElement | HTMLImageElement | undefined;
    if (!image) return false;
    if (image instanceof HTMLCanvasElement) scene.textures.addCanvas(key, image);
    else scene.textures.addImage(key, image);
    return true;
  } catch {
    return false;
  }
};

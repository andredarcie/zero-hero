// O HERÓI visto pelo playtest: onde está, para onde olha, o que o desenho dele mostra, e o teleporte que monta uma
// cena de teste sem atravessar o mapa a pé.

import type { GameScene } from '@/game/scenes/GameScene';

export const heroProbe = (s: GameScene) => ({
  /** O tile do herói no grid. */
  at: (): { x: number; y: number } => ({ x: s.playerWorld.worldX, y: s.playerWorld.worldY }),

  /**
   * Põe o herói parado num tile, virado para (dx, dy) quando pedido, com os chunks em volta carregados. É o jeito de
   * um cenário começar diante do que vai testar.
   */
  teleport: (x: number, y: number, dx?: number, dy?: number): void => {
    s.playerWorld.worldX = x;
    s.playerWorld.worldY = y;
    s.movementController?.interruptMovement(x, y);
    if (dx !== undefined && dy !== undefined) s.movementController?.faceTo(dx, dy);
    s.streamChunks(true);
  },

  /** Só muda o tile lógico do herói (sem parar o passo, sem carregar chunk) — para medir sem mexer no resto. */
  place: (x: number, y: number): void => {
    s.playerWorld.worldX = x;
    s.playerWorld.worldY = y;
  },

  /**
   * O passo de (x, y) para (x+dx, y+dy) é barrado? A MESMA pergunta que o controlador de movimento faz: o sólido e
   * também o relevo (o degrau da serra só se vence pela escada).
   */
  stepBlocked: (x: number, y: number, dx: number, dy: number): boolean =>
    s.movementController?.['isBlockedCell'](x + dx, y + dy, x, y) ?? s.query.isSolidForEntities(x + dx, y + dy),

  /** Vira sem andar. */
  face: (dx: number, dy: number): void => s.movementController?.faceTo(dx, dy),

  /** Onde o desenho do herói está agora (fracionário no meio de um passo). */
  visualTile: (): { x: number; y: number } => s.verbs.heroVisualTile(),

  /** Encosta o desenho no tile lógico (sem o resto do passo animado). */
  snapView: (): void => s.movementController?.syncPlayerToWorld(s.playerWorld.worldX, s.playerWorld.worldY, s.tileSize),

  /** O estado que o billboard do herói desenha (quadro, espelho, escala, respiração, passo). */
  view: () => ({ ...s.hero, walkFrames: [...s.hero.walkFrames] }),

  /** O billboard 3D do herói, como o mundo o mostra. */
  billboard: () => {
    const bb = s.heroBillboard;
    return bb ? { visible: bb.visible, alpha: bb.alpha, texKey: bb.texKey, x: bb.x, y: bb.y, elevation: bb.elevation } : null;
  },

  /** Quanto dura um passo de um tile, em ms. */
  stepMs: (): number => s.movementController?.stepMs ?? 0,

  /** O toque na tela está segurando o herói parado (o "enraizar" do mobile)? */
  touchRooted: (): boolean => s.movementController?.['touch'].isRooted ?? false,

  /** O tamanho de um tile na tela, em px. */
  tileSize: (): number => s.tileSize,
});

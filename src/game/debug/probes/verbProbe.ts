// OS BOTÕES: o que o Z (a mão) e o X (o item) fariam em cada tile — as mesmas perguntas que o balão de ação faz.

import type { GameScene } from '@/game/scenes/GameScene';

type Button = 'z' | 'x';

export const verbProbe = (s: GameScene) => {
  const ask = (button: Button, x: number, y: number): string | null => (button === 'x' ? s.verbs.useVerbAt(x, y) : s.verbs.handVerbAt(x, y));
  return {
    /** O verbo do Z em (x, y) (null = nada). */
    hand: (x: number, y: number): string | null => s.verbs.handVerbAt(x, y),
    /** O verbo do X em (x, y) (null = nada). */
    use: (x: number, y: number): string | null => s.verbs.useVerbAt(x, y),
    at: ask,
    /** Os tiles onde `button` faz `verb` agora, do mais perto ao mais longe de (cx, cy), num raio `r`. */
    tiles: (button: Button, verb: string, cx: number, cy: number, r = 60, n = 60) => {
      const out: Array<{ x: number; y: number; d: number }> = [];
      for (let y = Math.max(0, cy - r); y <= Math.min(n - 1, cy + r); y += 1) {
        for (let x = Math.max(0, cx - r); x <= Math.min(n - 1, cx + r); x += 1) {
          if (ask(button, x, y) === verb) out.push({ x, y, d: Math.abs(x - cx) + Math.abs(y - cy) });
        }
      }
      return out.sort((a, b) => a.d - b.d);
    },
    /** As linhas do balão de ação que o tile (x, y) mostraria. */
    prompt: (x: number, y: number): string[] => s.verbs.currentPrompt({ x, y })?.view.rows.map((r) => r.label) ?? [],
    /** Fecha o balão de ação aberto (para uma foto limpa). */
    hidePrompt: (): void => {
      s.verbs.actionPrompt?.destroy();
      s.verbs.actionPrompt = undefined;
    },
  };
};

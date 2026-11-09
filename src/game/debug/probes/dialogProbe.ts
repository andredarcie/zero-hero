// A CONVERSA E QUEM CONVERSA: os vizinhos (onde estão, o desenho de cada um) e a caixa de diálogo aberta (a fala, a
// linha, as letras que a máquina de escrever já mostrou), mais as chaves de fala que o herói já ouviu.

import type { NpcKind } from '@/game/world/ScreenContent';
import type { GameScene } from '@/game/scenes/GameScene';

export const npcProbe = (s: GameScene) => ({
  /** Os vizinhos dos chunks carregados ({ kind, worldX, worldY }, a mesma forma dos itens do chão). */
  list: () => (s.npcManager?.getActiveWorldPositions() ?? []).map((n) => ({ kind: n.kind, worldX: n.worldX, worldY: n.worldY })),
  find: (kind: NpcKind): { kind: NpcKind; worldX: number; worldY: number } | null => {
    const n = s.npcManager?.getActiveWorldPositions().find((p) => p.kind === kind);
    return n ? { kind: n.kind, worldX: n.worldX, worldY: n.worldY } : null;
  },
  kindAt: (x: number, y: number): string | null => s.npcManager?.getKindAt(x, y) ?? null,
  has: (x: number, y: number): boolean => s.npcManager?.hasNpcAt(x, y) ?? false,
  /** O quadro que o corpo do vizinho em (x, y) desenha agora (o aceno, o descanso...). */
  bodyFrame: (x: number, y: number): string | null => s.npcManager?.bodyAt(x, y)?.texKey ?? null,
  /** A altura na tela do primeiro vizinho de `kind` (a respiração dele mexe nela). */
  bodyHeight: (kind: NpcKind): number | null => {
    const all = [...(s.npcManager?.['byChunk'].values() ?? [])].flat();
    return all.find((n) => n.kind === kind)?.['sprite'].displayHeight ?? null;
  },
  /** O herói já cumprimentou o vizinho de (x, y) (o coração da primeira vez)? */
  greeted: (x: number, y: number): boolean => s.dialog.greetedNpcs.has(`${x},${y}`),
});

export const dialogProbe = (s: GameScene) => ({
  open: (): boolean => s.dialog.dialogOpen,
  /** A caixa aberta: a linha em que está, o texto dela, se ainda está escrevendo e quantas letras já apareceram. */
  box: () => {
    const o = s.dialog.dialogOverlay;
    if (!o) return null;
    const writer = o['writer'];
    const letters = writer['letters'].filter((l): l is HTMLSpanElement => Boolean(l));
    return {
      line: writer['lineIndex'],
      text: writer['currentText'],
      typing: o.isTyping,
      shown: letters.filter((l) => l.classList.contains('zh-on')).length,
      total: letters.length,
    };
  },
  /** Todas as falas do roteiro aberto. */
  lines: (): string[] | null => s.dialog.dialogOverlay?.script.lines.map((l) => l.text) ?? null,
  /** O herói já ouviu esta variante de fala (ex.: 'death/visit', 'cat/talk/1')? */
  heard: (key: string): boolean => s.seenDialogKeys.has(key),
  /** O que o mago diria agora ('tent', 'again', 'guide', 'gate', 'after'). */
  wizardLine: () => s.delivery.wizardLine(),
});

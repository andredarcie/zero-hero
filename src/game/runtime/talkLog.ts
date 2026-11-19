/**
 * O CADERNO DAS CONVERSAS (pedido do autor, 2026-11-18: "uma opção no menu que é possível ler novamente todo o
 * histórico de conversas com os NPCs até o momento"). Cada conversa que o jogador ouviu entra aqui do jeito que
 * apareceu na caixa — o nome, a cor e o retrato de quem falou, o dia, e as falas que ele leu até o fim (a que ele
 * fechou no meio da datilografia não entra) —, e o menu de pausa a mostra de novo (runtime/TalkLogOverlay).
 *
 * Guarda-se o TEXTO, e não a chave do catálogo: a fala é montada de muitos pedaços (a dica do passo, o nome do
 * cogumelo devolvido, a hora do relógio de sol), e só o texto pronto é o que o jogador leu. Por isso a conversa fica
 * na língua em que foi lida.
 *
 * Só conversa COM ALGUÉM: a narração solta (ler a placa, o achado, o caderno) não tem nome e não entra. Uma conversa
 * que não traz nenhuma fala nova de quem fala (o vizinho repetindo a dica, a mesma conversa ouvida de novo) não vira
 * página nova: o caderno é para reler, não para empilhar a mesma estrofe. Ele guarda as últimas TALK_LOG_MAX.
 */

export type TalkSpeaker = 'npc' | 'narrator';

export interface TalkLine {
  speaker: TalkSpeaker;
  text: string;
}

export interface TalkEntry {
  /** O nome de quem falou, como a caixa o mostrou. */
  who: string;
  /** A cor do nome e da moldura do retrato. */
  color: string;
  /** O retrato: a textura e o quadro do personagem (ver DialogOverlay.buildPortraitUrl). */
  asset: string;
  frame?: number;
  /** O dia do jogo (0 = o primeiro). */
  day: number;
  lines: TalkLine[];
}

/** Quantas conversas o caderno guarda (as mais antigas saem primeiro). */
export const TALK_LOG_MAX = 300;

/** A conversa a guardar: o roteiro que a caixa mostrou e as falas que o jogador leu inteiras. */
export const talkEntry = (
  script: { npcName: string; npcColorHex: string; npcAssetKey: string; npcFrame?: number },
  heard: readonly TalkLine[],
  day: number,
): TalkEntry => ({
  who: script.npcName,
  color: script.npcColorHex,
  asset: script.npcAssetKey,
  ...(script.npcFrame === undefined ? {} : { frame: script.npcFrame }),
  day,
  lines: heard.map((l) => ({ speaker: l.speaker, text: l.text })),
});

/**
 * Põe a conversa no fim do caderno. Devolve se entrou: sem nome (narração), sem fala lida, ou sem nenhuma fala que
 * ainda não esteja numa página de quem fala, ela não entra.
 */
export const addTalk = (log: TalkEntry[], entry: TalkEntry): boolean => {
  if (!entry.who.trim() || entry.lines.length === 0) return false;
  const known = new Set(log.filter((e) => e.who === entry.who).flatMap((e) => e.lines.map((l) => l.text)));
  if (entry.lines.every((l) => known.has(l.text))) return false;
  log.push(entry);
  if (log.length > TALK_LOG_MAX) log.splice(0, log.length - TALK_LOG_MAX);
  return true;
};

/** Quem aparece no caderno, na ordem em que apareceu pela primeira vez (o filtro do menu), com a cor de cada um. */
export const talkPeople = (log: readonly TalkEntry[]): Array<{ who: string; color: string }> => {
  const seen = new Map<string, string>();
  for (const e of log) if (!seen.has(e.who)) seen.set(e.who, e.color);
  return [...seen].map(([who, color]) => ({ who, color }));
};

const isLine = (value: unknown): value is TalkLine => {
  const l = value as Partial<TalkLine> | null;
  return Boolean(l) && (l?.speaker === 'npc' || l?.speaker === 'narrator') && typeof l?.text === 'string';
};

/** O caderno do save, conferido: só conversa com nome, cor, retrato, dia e ao menos uma fala; no máximo TALK_LOG_MAX. */
export const cleanTalks = (value: unknown): TalkEntry[] => {
  if (!Array.isArray(value)) return [];
  const out: TalkEntry[] = [];
  for (const raw of value as unknown[]) {
    const e = raw as Partial<TalkEntry> | null;
    if (!e || typeof e.who !== 'string' || !e.who.trim() || typeof e.color !== 'string' || typeof e.asset !== 'string') continue;
    const lines = Array.isArray(e.lines) ? e.lines.filter(isLine).map((l) => ({ speaker: l.speaker, text: l.text })) : [];
    if (lines.length === 0) continue;
    const day = Number.isInteger(e.day) && (e.day as number) >= 0 ? (e.day as number) : 0;
    out.push({
      who: e.who, color: e.color, asset: e.asset, day, lines,
      ...(Number.isInteger(e.frame) ? { frame: e.frame as number } : {}),
    });
  }
  return out.slice(-TALK_LOG_MAX);
};

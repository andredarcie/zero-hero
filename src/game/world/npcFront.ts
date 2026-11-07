/**
 * A FRENTE DO NPC É PROIBIDA PARA ITEM (pedido do autor): o tile exatamente de frente para um NPC nunca guarda item
 * no chão. É ali que o herói para para conversar, e um item embaixo dele misturava os dois gestos do mesmo botão —
 * pegar o que está no chão e falar com quem está na frente.
 *
 * Os NPCs olham para a câmera (o sul, +y), então a frente é o tile logo abaixo deles. Quando alguma coisa
 * precisa cair ali (o herói conversa com a mão cheia e o NPC lhe dá outra coisa), ela vai para o lado DIREITO do
 * NPC, depois para o ESQUERDO, depois para TRÁS — nessa ordem, a do pedido.
 *
 * Regra pura, sem cena: quem decide o que está livre é quem chama (GameScene.dropItem).
 */

export interface NpcTile {
  readonly worldX: number;
  readonly worldY: number;
}

const key = (x: number, y: number): string => `${x},${y}`;

/** O tile de frente para o NPC (onde o herói para para conversar). */
export const npcFrontOf = (npc: NpcTile): { x: number; y: number } => ({ x: npc.worldX, y: npc.worldY + 1 });

/** As frentes de todos estes NPCs, como chaves "x,y". */
export const npcFrontKeys = (npcs: readonly NpcTile[]): Set<string> => {
  const out = new Set<string>();
  for (const npc of npcs) {
    const f = npcFrontOf(npc);
    out.add(key(f.x, f.y));
  }
  return out;
};

/** O NPC de quem este tile é a frente, ou null. */
export const npcFacing = (x: number, y: number, npcs: readonly NpcTile[]): NpcTile | null =>
  npcs.find((npc) => npc.worldX === x && npc.worldY + 1 === y) ?? null;

/** Para onde vai o que ia cair na frente do NPC: direita, esquerda, atrás (nessa ordem). */
export const npcSideTiles = (npc: NpcTile): Array<{ x: number; y: number }> => [
  { x: npc.worldX + 1, y: npc.worldY },
  { x: npc.worldX - 1, y: npc.worldY },
  { x: npc.worldX, y: npc.worldY - 1 },
];

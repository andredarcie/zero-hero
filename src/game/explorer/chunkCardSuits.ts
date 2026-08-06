/**
 * O naipe de um chunk — deduzido do id da carta, e a chave da arte simbólica P&B.
 * `hearth` é o naipe dos cenários de NPC (fogueira + morador + presente): quem o decide não é
 * o id, é o template TER um NPC — ver ChunkPurchaseOverlay.
 */

export type CardSuit = 'tide' | 'thorn' | 'web' | 'peak' | 'grave' | 'bloom' | 'hearth' | 'wild';

export const cardSuit = (id: string): CardSuit => {
  if (/lake|water|moon/u.test(id)) return 'tide';
  if (/forest|tree|wood/u.test(id)) return 'thorn';
  if (/spider|web|hollow/u.test(id)) return 'web';
  if (/peak|pass|granite|mountain|cliff/u.test(id)) return 'peak';
  if (/grave|tomb|bone|crypt/u.test(id)) return 'grave';
  if (/bloom|grove|flower|orchard/u.test(id)) return 'bloom';
  return 'wild';
};

export const suitLabel = (suit: CardSuit): string => {
  switch (suit) {
    case 'tide': return 'TIDE DOMAIN';
    case 'thorn': return 'THORN DOMAIN';
    case 'web': return 'WEB DOMAIN';
    case 'peak': return 'PEAK DOMAIN';
    case 'grave': return 'GRAVE DOMAIN';
    case 'bloom': return 'BLOOM DOMAIN';
    case 'hearth': return 'HEARTH BOND';
    default: return 'WILD DOMAIN';
  }
};

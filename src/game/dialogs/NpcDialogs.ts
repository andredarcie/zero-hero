import { NPC_VISUALS } from '@/game/constants';
import type { NpcKind } from '@/game/world/ScreenContent';

export type DialogLine = {
  speaker: 'npc' | 'narrator';
  text: string;
};

/**
 * O BALCÃO: o NPC compra `item` a `coinsPerUnit` moedas a unidade, por quantidade, dentro do
 * próprio painel de conversa. Autorado no world.json (worldSchema.WorldDialogTrade); quem
 * executa a transação é a GameScene (o port de venda), quem desenha o caixa é o DialogOverlay.
 */
export type DialogTrade = {
  item: string;
  coinsPerUnit: number;
  offer: string;
  empty: string;
  thanks: string;
};

export type DialogScript = {
  npcName: string;
  npcColorHex: string;
  npcAssetKey: string;
  npcFrame?: number;
  lines: DialogLine[];
  trade?: DialogTrade;
};

// Per-NPC "voice": a base frequency + waveform played as a blip on each typed letter, so
// every character sounds distinct (old-RPG talking style).
export type DialogVoice = { freq: number; wave: OscillatorType };

export const DIALOG_VOICES: Record<NpcKind, DialogVoice> = {
  blackCat: { freq: 540, wave: 'triangle' },
  mimic: { freq: 300, wave: 'square' },
  astronaut: { freq: 470, wave: 'square' },
  businessMan: { freq: 250, wave: 'sawtooth' },
  radiationSuit: { freq: 340, wave: 'square' },
  painter: { freq: 620, wave: 'sine' },
  salesman: { freq: 410, wave: 'triangle' },
  poet: { freq: 360, wave: 'sine' },
  wizard: { freq: 220, wave: 'sine' },
  death: { freq: 150, wave: 'square' },
};

const n = (text: string): DialogLine => ({ speaker: 'npc', text });
const r = (text: string): DialogLine => ({ speaker: 'narrator', text });

export const NPC_DIALOGS: Record<NpcKind, DialogScript> = {
  blackCat: {
    npcName: 'CAT',
    npcColorHex: '#cc99ff',
    npcAssetKey: NPC_VISUALS.blackCat.key,
    npcFrame: NPC_VISUALS.blackCat.frame,
    lines: [
      n('You must be the hero who seeks to find the sword?'),
      n('Yes. I am a talking cat'),
      n('And you\'re a naked primate in an armor'),
      n('Well the game is still in the Alpha version, so I think it\'s impossible for you to find the sword'),
    ],
  },

  mimic: {
    npcName: 'MIMICO',
    npcColorHex: '#ff9944',
    npcAssetKey: NPC_VISUALS.mimic.key,
    npcFrame: NPC_VISUALS.mimic.frame,
    lines: [
      n('Ola! Eu sou um NPC completamente normal.'),
      r('Ele sorri de um jeito que nao parece natural.'),
      n('Nao sou um mimico. Isso seria absurdo.'),
      r('Seus olhos nao piscam. Nenhuma vez.'),
      n('Por favor, continue andando.'),
    ],
  },

  astronaut: {
    npcName: 'ASTRONAUT',
    npcColorHex: '#44ccff',
    npcAssetKey: NPC_VISUALS.astronaut.key,
    npcFrame: NPC_VISUALS.astronaut.frame,
    // O PEDIDO DE FERRO. Ele é o único NPC do baralho hoje, então esta fala carrega sozinha o
    // tutorial da cadeia inteira — e cada substantivo em maiúsculo é uma coisa que existe NA
    // CARTA dele: a picareta no chão, os veios, o mato seco, a bancada. Uma fala que mandasse
    // procurar algo que não está ali seria uma missão impossível contada com confiança.
    lines: [
      n('My ship is a shell now. What she still needs is IRON — and this crater keeps it locked inside rock.'),
      n('Take the PICKAXE. The veined boulders never run dry: three good swings, one lump of ORE.'),
      n('That BENCH is mine — every tool in the chain starts there.'),
      n('Ore is not iron yet. Two stones make a FURNACE on that bench, and stone plus ore makes an ALTAR — the slab you hammer on.'),
      n('Burn dead wood into CHARCOAL in the furnace, smelt it with ore for a SPONGE, then lay the sponge on the altar and strike it three times.'),
      n('Finish it by hand on the altar. Bring me a bar and the ship gets one step closer to flying.'),
    ],
  },

  businessMan: {
    npcName: 'BUSINESSMAN',
    npcColorHex: '#ffdd44',
    npcAssetKey: NPC_VISUALS.businessMan.key,
    npcFrame: NPC_VISUALS.businessMan.frame,
    lines: [
      n('Work hard and you\'ll find the sword you\'re looking for'),
    ],
  },

  radiationSuit: {
    npcName: 'WORKMAN',
    npcColorHex: '#66ff44',
    npcAssetKey: NPC_VISUALS.radiationSuit.key,
    npcFrame: NPC_VISUALS.radiationSuit.frame,
    lines: [
      n('I used an ax to cut uranium, but you can cut other things with it'),
    ],
  },

  painter: {
    npcName: 'ARTIST',
    npcColorHex: '#ff88aa',
    npcAssetKey: NPC_VISUALS.painter.key,
    npcFrame: NPC_VISUALS.painter.frame,
    lines: [
      n('You must be the warrior Zero!'),
      n('I was on a journey to find the perfect place to do a painting.'),
      n('But these bushes are getting in the way.'),
    ],
  },

  salesman: {
    npcName: 'VENDEDOR',
    npcColorHex: '#6fe6c7',
    npcAssetKey: NPC_VISUALS.salesman.key,
    lines: [
      n('Chegou em boa hora. Tenho ofertas irrelevantes e insistentes.'),
      r('Ele abre a mochila, mas so ha recibos amassados.'),
      n('Nada em estoque. Mas posso anotar seu interesse.'),
      n('Volte amanha. Ou ontem. Minha agenda e flexivel.'),
    ],
  },

  poet: {
    npcName: 'POET',
    npcColorHex: '#9bb7ff',
    npcAssetKey: NPC_VISUALS.poet.key,
    lines: [
      n('You are not a hero.'),
      n('Sorry for my manners, it\'s just that I\'m sad.'),
      n('I lost my inspiration to write poems.'),
      n('Imagine a poet who doesn\'t write poems, I totally lost my identity.'),
      n('Maybe one day I can get back to writing poems.'),
      n('You know that writing poems doesn\'t make any money.'),
      n('You can make money being a hero?'),
    ],
  },

  wizard: {
    npcName: 'MAGO',
    npcColorHex: '#a97bff',
    npcAssetKey: NPC_VISUALS.wizard.key,
    lines: [
      n('Ah, o escolhido. Senti teus passos ondularem pela trama do destino.'),
      n('Eu poderia conjurar a espada que buscas... mas meu grimório só compila na versão completa.'),
      n('Segue em frente, herói. E cuidado com os magos que preferem lançar feitiços a conversar.'),
    ],
  },

  death: {
    npcName: 'DEATH',
    npcColorHex: '#f3f4f6',
    npcAssetKey: NPC_VISUALS.death.key,
    // O FIM DO PRÓLOGO. Ele espera no meio do adro da última carta (`prologue-end`, 90 moedas —
    // dez barras de ferro), e é o único NPC do jogo que fala do lado de fora da ficção: quem chega
    // até aqui percorreu toda a cadeia manual, e merece ouvir que era esse o fim da estrada.
    lines: [
      n('You bought your way here, field by field. I watched your furnace smoke cross three of them.'),
      n('This is where the road stops. Everything past me is unbuilt — no cards, no coins, no dark to light.'),
      n('So: the prologue is over, and you are the one who finished it. Thank you for testing my small world.'),
      n('Go back and light something. I will wait. Waiting is the one thing I am good at.'),
    ],
  },
};

// NOTE: the wizard's story beats (intro / protect / prophecy) and the campfire "locked" lines used
// to live here as constants; they now live in the locale catalogs (src/game/i18n/locales/*.json)
// under the keys `wizard.*` and `lockedLines`, read at runtime via i18n's tLines().

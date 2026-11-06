import { NPC_VISUALS } from '@/game/constants';
import type { NpcKind } from '@/game/world/ScreenContent';

export type DialogLine = {
  speaker: 'npc' | 'narrator';
  text: string;
};

export type DialogScript = {
  npcName: string;
  npcColorHex: string;
  npcAssetKey: string;
  npcFrame?: number;
  lines: DialogLine[];
  /** Avisa quando cada linha entra: para o mundo trabalhar enquanto alguém conta o que faz. */
  onLine?: (index: number) => void;
  /** Quem fala já não está aflito: a voz de quem resolveu o que o afligia (ver voicePersonas). */
  calm?: boolean;
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

/**
 * A ESCOLA FILOSÓFICA DE CADA UM (pedido do autor). O jogo é sobre o sentido da vida: a guerra acabou e o
 * herói perdeu o dele. Cada vizinho responde à pergunta do seu jeito, e é isso que as falas dele seguem.
 * Texto novo de um NPC tem de caber na escola dele: releia `idea` e `voice` antes de escrever.
 */
export type NpcPhilosophy = {
  /** A escola, pelo nome mais conhecido. */
  school: string;
  /** Quem a pensou: é a quem se volta para conferir uma fala. */
  thinkers: string;
  /** Onde, para essa escola, está o sentido da vida. */
  idea: string;
  /** Como isso aparece no que o personagem diz. */
  voice: string;
};

/** O roteiro base de um NPC, e a escola que as falas dele seguem. */
export type NpcDefinition = DialogScript & {
  /** Ausente só nos NPCs que saíram do mundo (vendedor, poeta, mímico) e não falam mais. */
  philosophy?: NpcPhilosophy;
};

/** O herói não é NPC, mas tem escola também: a dele é a pergunta que o jogo inteiro faz. */
export const HERO_PHILOSOPHY: NpcPhilosophy = {
  school: 'Existencialismo',
  thinkers: 'Jean-Paul Sartre',
  idea: 'A existência vem antes da essência: ninguém nasce com sentido, ele se faz pelo que se faz.',
  voice: 'O herói não fala. Era só guerreiro; sem a guerra, se refaz ajudando cada vizinho.',
};

/** O fim, no jardim: os amigos em volta do fogo. */
export const ENDING_PHILOSOPHY: NpcPhilosophy = {
  school: 'Epicurismo',
  thinkers: 'Epicuro (a escola dele se chamava "O Jardim")',
  idea: 'Felicidade é amizade, prazeres simples e a paz de não precisar de mais nada.',
  voice: 'Narração curta e calma: marshmallow, fogo, "Nenhum lugar para ir. Enfim."',
};

export const NPC_DIALOGS: Record<NpcKind, NpcDefinition> = {
  blackCat: {
    npcName: 'CAT',
    npcColorHex: '#cc99ff',
    npcAssetKey: NPC_VISUALS.blackCat.key,
    npcFrame: NPC_VISUALS.blackCat.frame,
    philosophy: {
      school: 'Cinismo',
      thinkers: 'Diógenes de Sinope ("o cão")',
      idea: 'Viver com o mínimo, segundo a natureza, rindo da fama e das convenções.',
      voice: 'Debochado, preguiçoso ao sol, nada impressionado com heróis. "Saia do meu sol."',
    },
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
    // Vega.
    philosophy: {
      school: 'Aristotelismo',
      thinkers: 'Aristóteles',
      idea: 'Todo ser humano deseja saber; a vida mais feliz é a da contemplação.',
      voice: 'Curiosa e paciente: o céu, a lente, Galileu. O sentido está em olhar e entender.',
    },
    // UMA FALA SÓ, como todo NPC plantado no mapa: o presente que está no chão ao lado dele mais
    // o pedido, na mesma frase. O que ele nomeia em maiúsculo existe NA CARTA dele (a picareta, os
    // veios) — mandar procurar o que não está ali seria uma missão impossível contada com toda a
    // confiança do mundo. O resto da cadeia do ferro se aprende na bancada, não em seis falas.
    lines: [
      n('Take the PICKAXE — the veined boulders never run dry, three swings a lump. Bring me six of that ORE and my ship stops being scrap.'),
    ],
  },

  businessMan: {
    npcName: 'BUSINESSMAN',
    npcColorHex: '#ffdd44',
    npcAssetKey: NPC_VISUALS.businessMan.key,
    npcFrame: NPC_VISUALS.businessMan.frame,
    // Bram.
    philosophy: {
      school: 'Estoicismo',
      thinkers: 'Epicteto, Sêneca, Marco Aurélio',
      idea: 'Separar o que depende de nós do que não depende, e viver de acordo com a natureza.',
      voice: 'Perdeu o que não controlava; agarra o que controla, uma fogueira. Frases secas, de trabalho.',
    },
    lines: [
      n('The AXE is yours, an advance — it fells DEAD wood in two chops. Clear my dry ranks and bring me six STICKS: timber is the only market left.'),
    ],
  },

  radiationSuit: {
    npcName: 'WORKMAN',
    npcColorHex: '#66ff44',
    npcAssetKey: NPC_VISUALS.radiationSuit.key,
    npcFrame: NPC_VISUALS.radiationSuit.frame,
    // Hollis.
    philosophy: {
      school: 'Taoísmo',
      thinkers: 'Lao-Tsé, Zhuangzi',
      idea: 'Seguir o caminho da natureza sem forçar (wu wei), e saber quando já basta.',
      voice: 'Calma, observa o que não se vê. Não força nada: corte, não arranque; quatro já bastam.',
    },
    lines: [
      n('Take this STONE — thrown into lava it cools into a step. Something metal sank past the molten pool: walk one bar of IRON back to me.'),
    ],
  },

  painter: {
    npcName: 'ARTIST',
    npcColorHex: '#ff88aa',
    npcAssetKey: NPC_VISUALS.painter.key,
    npcFrame: NPC_VISUALS.painter.frame,
    // Iris.
    philosophy: {
      school: 'Filosofia de Nietzsche',
      thinkers: 'Friedrich Nietzsche',
      idea: 'O mundo não traz sentido pronto; vence-se o niilismo criando valores, como um artista.',
      voice: 'Começa no cinza e termina na cor que ela mesma fez. Celebra a coragem de quem cria.',
    },
    lines: [
      n('Take the SHOVEL and dig the beds south of me. Green is a colour you GROW, so bring me six SEEDS and paint this field.'),
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
    philosophy: {
      school: 'Budismo',
      thinkers: 'Sidarta Gautama',
      idea: 'O sofrimento vem do apego; tudo passa, e o caminho é soltar e ter compaixão.',
      voice: 'Poucas palavras, sem pressa. Manda soltar a espada e cuidar dos outros.',
    },
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
    philosophy: {
      school: 'Niilismo',
      thinkers: 'Friedrich Nietzsche (o diagnóstico), Arthur Schopenhauer',
      idea: 'Nada tem sentido em si. Ela não responde: faz a pergunta que os outros respondem.',
      voice: 'Calma, sem ameaça. Aponta o vazio e espera. Ainda assim, deixa a foice para ajudar.',
    },
    // Ela não mora no mapa: vem uma vez, na primeira noite dormida no colchão (ver
    // GameScene.playDeathVisit). O que ela diz está no locale, em `death.visit`.
    lines: [
      n('You were a warrior.'),
    ],
  },
};

// NOTE: the wizard's story beats (intro / protect / prophecy) and the campfire "locked" lines used
// to live here as constants; they now live in the locale catalogs (src/game/i18n/locales/*.json)
// under the keys `wizard.*` and `lockedLines`, read at runtime via i18n's tLines().

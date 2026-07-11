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
    lines: [
      n('My ship crashes in this place, I\'m trying to find its parts'),
      n('But I think they landed on a part of the map that isn\'t available in the alpha version.'),
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
    lines: [
      n('Nihilist knight! Do you accept a game of chess for your soul?'),
      n('You died but you haven\'t reached the end of your journey'),
      n('Thanks for playing the Alpha version of the game!'),
      n('Submit your feedback'),
    ],
  },
};

// The wizard's story dialogue, which advances with the player's progress (see
// GameScene.wizardStoryState): the first meeting once they carry the sword and have relit their
// first fire, the "protect the flame" beat on later visits, and the closing prophecy after the
// SECOND fire — which ends the intro and returns to the title screen.
export const WIZARD_STORY: { intro: DialogLine[]; protect: DialogLine[]; prophecy: DialogLine[] } = {
  intro: [
    r('O velho mago ajeita o chapéu. Por um instante, seus olhos encontram os seus.'),
    n('Finalmente... você chegou.'),
    n('Esperei por este momento durante eras.'),
    n('Você veio de terras muito distantes.'),
    n('É Zero... o último herdeiro de uma cruzada esquecida.'),
    n('Mas ainda não é um cavaleiro.'),
    n('Ainda precisa se tornar um.'),
  ],
  protect: [
    r('O vento sopra pelas ruínas.'),
    n('Esta é a última chama do mundo.'),
    n('Além desta chama... existem apenas trevas.'),
    n('Um vazio onde até a esperança deixou de existir.'),
    n('Proteja esta chama.'),
    n('Enquanto ela continuar acesa... o mundo ainda poderá renascer.'),
  ],
  prophecy: [
    r('Os olhos do mago brilham.'),
    n('Então... a profecia era verdadeira.'),
    n('Você trilha o caminho descrito pelos antigos.'),
    n('A chama primordial desperta mais uma vez.'),
    n('O que era apenas uma centelha agora começa a iluminar o mundo.'),
    n('Mas lembre-se...'),
    n('A chama que salvará este mundo é a mesma que arde dentro de você.'),
    n('Não permita que ela se apague.'),
    n('Você jogou a breve introdução de Zero The Hero!'),
    n('Muito obrigado por tudo!'),
  ],
};

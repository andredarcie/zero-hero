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

const n = (text: string): DialogLine => ({ speaker: 'npc', text });
const r = (text: string): DialogLine => ({ speaker: 'narrator', text });

export const NPC_DIALOGS: Record<NpcKind, DialogScript> = {
  blackCat: {
    npcName: 'GATO PRETO',
    npcColorHex: '#cc99ff',
    npcAssetKey: NPC_VISUALS.blackCat.key,
    npcFrame: NPC_VISUALS.blackCat.frame,
    lines: [
      r('O gato te olha fixamente. Seus olhos refletem o vazio.'),
      n('...'),
      r('Ele pisca uma vez. Lentamente.'),
      n('Miau.'),
      r('Voce nao entende. Mas sente que era importante.'),
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
    npcName: 'ASTRONAUTA',
    npcColorHex: '#44ccff',
    npcAssetKey: NPC_VISUALS.astronaut.key,
    npcFrame: NPC_VISUALS.astronaut.frame,
    lines: [
      r('Ele verifica os instrumentos no capacete. Algo esta errado.'),
      n('Houston, temos um problema. Estou em... uma floresta?'),
      n('Os sensores indicam: oxigenio, gravidade, inimigos.'),
      r('Ele olha para os slimes ao longe.'),
      n('Pior do que Marte. Definitivamente pior do que Marte.'),
    ],
  },

  businessMan: {
    npcName: 'EXECUTIVO',
    npcColorHex: '#ffdd44',
    npcAssetKey: NPC_VISUALS.businessMan.key,
    npcFrame: NPC_VISUALS.businessMan.frame,
    lines: [
      n('Excelente! Voce chegou na hora certa.'),
      r('Ele ajeita a gravata. Segura papeis em uma floresta.'),
      n('Seguro contra slimes. Plano basico, 500 moedas por mes.'),
      n('Para voce? 499. Minha esposa vai me matar.'),
      r('Ele nao percebe que esta em uma floresta.'),
    ],
  },

  radiationSuit: {
    npcName: 'DR. AZEVEDO',
    npcColorHex: '#66ff44',
    npcAssetKey: NPC_VISUALS.radiationSuit.key,
    npcFrame: NPC_VISUALS.radiationSuit.frame,
    lines: [
      r('Ele usa um medidor de radiacao que bipa sem parar.'),
      n('PARE! Os niveis estao em 6.8 milisierverts. Critico.'),
      n('As arvores sao antenas. Sempre foram.'),
      r('Suas maos tremem levemente.'),
      n('Monitoro isso ha 3 anos. A verdade vai emergir.'),
    ],
  },

  painter: {
    npcName: 'ARTISTA',
    npcColorHex: '#ff88aa',
    npcAssetKey: NPC_VISUALS.painter.key,
    npcFrame: NPC_VISUALS.painter.frame,
    lines: [
      r('Ela olha para a copa das arvores. A tela esta vazia.'),
      n('Voce ve como a luz atravessa as arvores?'),
      n('E tragicamente perfeita.'),
      r('Ela suspira. Um suspiro artistico.'),
      n('Minha ultima obra vendeu por tres moedas. A critica foi devastadora.'),
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
    npcName: 'POETA',
    npcColorHex: '#9bb7ff',
    npcAssetKey: NPC_VISUALS.poet.key,
    lines: [
      r('Ele encara uma arvore como se ela tivesse dito algo profundo.'),
      n('No musgo repousa o eco do heroi que ainda nao caiu.'),
      n('Toda espada e um verso quando encontra o destino certo.'),
      r('Voce nao tem certeza se foi inspirado ou ameacado.'),
    ],
  },

  death: {
    npcName: 'MORTE',
    npcColorHex: '#f3f4f6',
    npcAssetKey: NPC_VISUALS.death.key,
    lines: [
      r('Uma presenca silenciosa bloqueia o vento por um instante.'),
      n('Ainda nao.'),
      r('A figura inclina a cabeca, como se estivesse conferindo uma lista.'),
      n('Mas continue assim e nos veremos em breve.'),
    ],
  },
};

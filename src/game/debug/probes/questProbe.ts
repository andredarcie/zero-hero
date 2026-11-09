// OS PEDIDOS DOS VIZINHOS (quests/): o evento que move um pedido e o que cada pedido grande guarda — o lenhador e o
// cepo, a pintora e os canteiros, a astrônoma e o telescópio —, com os mini-games deles legíveis quadro a quadro (é
// assim que o `zerar` e o `telescopio` os jogam). O caderno de missões em si é o `gameDebug.quests()`.

import { LensOverlay, SkyOverlay } from '@/game/runtime/SkyOverlays';
import { FireLightOverlay, SplitOverlay } from '@/game/runtime/WoodcraftOverlays';
import type { QuestEvent } from '@/game/runtime/QuestLog';
import type { GameScene } from '@/game/scenes/GameScene';

export const questProbe = (s: GameScene) => {
  const lumber = () => s.questSetup.lumberQuest;
  const sky = () => s.questSetup.astronomerQuest;
  let hearts: number | null = null;
  return {
    /** Manda um evento de missão pelo mesmo caminho do jogo (o pedido anda, fecha, festeja). */
    event: (event: QuestEvent): void => s.delivery.questEvent(event),
    /** Conta, daqui em diante, quantos corações de recompensa o jogo solta (`hearts` lê a conta). */
    countHearts: (): void => {
      if (hearts !== null) return;
      hearts = 0;
      const orig = s.sparkle.spawnHearts.bind(s.sparkle);
      s.sparkle.spawnHearts = (x: number, y: number) => { hearts = (hearts ?? 0) + 1; orig(x, y); };
    },
    hearts: (): number => hearts ?? 0,
    /** As marcas do vale ajudado (o marco da Thea, o cesto da Shui): de quem, se já fechou, o tile e a arte que mostra. */
    marks: () => s.marks.questMarks.map((m) => ({ dialog: m.def.dialog, done: m.done, tile: m.tile, texture: m.bb?.texKey ?? null })),
    /** Grava a aventura agora (como o jogo faz ao trocar de tela). */
    persist: (): void => s.save.persistAdventure(),

    /** O lenhador: a etapa, os galhos na terra, o galho em pé no cepo, e onde ficam o cepo e a cova. */
    lumber: () => {
      const q = lumber();
      return q ? {
        stage: q.save.stage, laid: q.save.laid, standing: q.save.standing, done: q.isDone, overlayOpen: Boolean(q.overlay),
        blockTile: q.blockTile ?? null, pitTile: q.pitTile ?? null,
      } : null;
    },
    /** O mini-game aberto do lenhador: rachar (mira, veio, nó, força) ou acender (a fase). */
    lumberOverlay: () => {
      const o = lumber()?.overlay;
      if (o instanceof SplitOverlay) return { kind: 'split', phase: o['phase'], aim: o['aim'], grainX: o['grainX'], knotX: o['knotX'], force: o['force'] };
      if (o instanceof FireLightOverlay) return { kind: 'fire', phase: o['phase'] };
      return null;
    },

    /** A pintora: a etapa e o quanto cada canteiro já cresceu. */
    painter: () => {
      const q = s.questSetup.painterQuest;
      return q ? { stage: q.save.stage, plots: q.save.plots.map((p) => p.level) } : null;
    },

    /** A astrônoma: a etapa, se foi embora, se fechou, o que o forno pede, e onde ficam a areia e as cinzas. */
    astronomer: () => {
      const q = sky();
      return q ? {
        stage: q.save.stage, departed: q.save.departed, done: q.isDone, furnaceNeed: q.furnaceNeed(),
        sandTile: q['sandTile'] ?? null, ashTile: q['ashTile'] ?? null, overlayOpen: Boolean(q.overlay),
      } : null;
    },
    /** O mini-game aberto da astrônoma: o polimento (fase, o que falta) ou a ocular (a mira, a ficha lida, a caixa). */
    astronomerOverlay: () => {
      const o = sky()?.overlay;
      if (o instanceof LensOverlay) return { kind: 'lens', phase: o.phase, remaining: o.remaining, box: o['canvas'].getBoundingClientRect().toJSON() };
      if (o instanceof SkyOverlay) return { kind: 'sky', aim: { ...o.aim }, reading: o.reading, box: o['canvas'].getBoundingClientRect().toJSON() };
      return null;
    },
  };
};

// O SOM (o jogo roda mudo nos testes, mas o que ele PEDE tocar se lê): a peça do vale, os leitos de ambiente e a
// mistura deles, a trilha pedida, e a vitrola da pausa.

import { getJukebox } from '@/game/audio/Jukebox';
import { getSoundManager } from '@/game/audio/SoundManager';

export const soundProbe = () => {
  const sm = () => getSoundManager();
  return {
    /** A peça do vale tocando agora, os leitos de ambiente ligados, a mistura e a trilha pedida. */
    mix: () => ({
      piece: sm().music.valleyMusic.valleyPiece,
      beds: sm().ambienceBeds.size,
      mix: { ...sm().ambienceMix },
      track: sm().music.requestedTrack,
      nextPieceScheduled: (sm().music.valley?.timer ?? null) !== null,
      musicBus: sm().musicBus?.gain.value ?? null,
    }),
    /** Sorteia `n` peças do vale para a hora atual (o mesmo sorteio do jogo, sem tocar nenhuma). */
    pickPieces: (n: number): string[] => Array.from({ length: n }, () => sm().music.valleyMusic['pickValleyPiece']([])),
    /** Acaba a peça tocando agora, como se ela tivesse chegado ao fim. */
    endPiece: (): void => sm().music.valley?.piece?.source.stop(),

    /** A vitrola da pausa: tocando, em que segundo, qual faixa. */
    jukebox: () => {
      const jb = getJukebox();
      return { playing: jb.playing, time: jb.time, file: jb.track?.file ?? null };
    },
    jukeboxSeek: (seconds: number): void => getJukebox().seek(seconds),
    jukeboxNext: (): void => getJukebox().next(),
  };
};

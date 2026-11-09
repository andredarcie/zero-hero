import { describe, expect, it } from 'vitest';

import { platform } from '@/game/platform/platform';
import type { TestPlatform } from '@/test-support/testPlatform';
import { getSoundManager } from './SoundManager';

// SEM SOM (a plataforma dos testes não tem áudio): o jogo segue mudo. Nenhum efeito quebra, nenhuma música pedida
// quebra, e nada é baixado — sem contexto de áudio, não há o que decodificar.

describe('o jogo mudo', () => {
  it('tocar, pedir música e mexer no volume não quebram, e nada é baixado', async () => {
    const test = platform() as TestPlatform;
    let fetches = 0;
    const realFetch = test.fetch;
    (test as { fetch: TestPlatform['fetch'] }).fetch = (url, init) => { fetches++; return realFetch(url, init); };
    const sm = getSoundManager();
    sm.unlock();
    sm.preload();
    sm.work.playWoodChop();
    sm.work.playStep('grass');
    sm.ui.playDialogBlip(300);
    sm.music.startMusic('title');
    sm.music.startMusic('overworld');
    sm.ambience.startAmbience();
    sm.ambience.setAmbienceMix(1, 0, 0);
    sm.music.fadeMusicOut();
    sm.setMusicVolume(0.4);
    sm.music.stopMusic(200);
    sm.ambience.stopAmbience();
    expect(sm.listeningOutput()).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fetches).toBe(0);
    expect(sm.getMusicVolume()).toBe(0.4);
  });
});

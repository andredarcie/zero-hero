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
    sm.playWoodChop();
    sm.playStep('grass');
    sm.playDialogBlip(300);
    sm.startMusic('title');
    sm.startMusic('overworld');
    sm.startAmbience();
    sm.setAmbienceMix(1, 0, 0);
    sm.fadeMusicOut();
    sm.setMusicVolume(0.4);
    sm.stopMusic(200);
    sm.stopAmbience();
    expect(sm.listeningOutput()).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fetches).toBe(0);
    expect(sm.getMusicVolume()).toBe(0.4);
  });
});

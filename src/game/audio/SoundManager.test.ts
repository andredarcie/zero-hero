import { beforeAll, describe, expect, it } from 'vitest';

import { personaFor, planSpeech } from '@/game/dialogs/voicePersonas';
import { installPlatform } from '@/game/platform/platform';
import { RecordingAudioContext } from '@/test-support/recordingAudio';
import { createTestPlatform, type TestPlatform } from '@/test-support/testPlatform';
import { getSoundManager } from './SoundManager';

// O SOM, pela porta da plataforma: o contexto de áudio aqui só ANOTA (recordingAudio.ts). Cobra-se o que o jogo pede
// ao áudio — o efeito nasce, liga no barramento dos efeitos e começa; a música troca com fade; o volume da pessoa vai
// para o armazenamento — e que sem som nenhum (a plataforma sem áudio) nada disso quebra.

let ctx: RecordingAudioContext;
let test: TestPlatform;

beforeAll(() => {
  test = createTestPlatform({ dom: false });
  ctx = new RecordingAudioContext();
  installPlatform({ ...test, createAudioContext: () => ctx as unknown as AudioContext, createOfflineAudioContext: () => new RecordingAudioContext() as unknown as OfflineAudioContext });
});

const sm = () => getSoundManager();

describe('os efeitos', () => {
  it('o primeiro som cria o contexto e a cadeia mestre (ganho → filtro → compressor → saída)', () => {
    sm().unlock();
    expect(ctx.count('gain')).toBeGreaterThanOrEqual(3);
    expect(ctx.count('biquad')).toBeGreaterThanOrEqual(1);
    expect(ctx.count('compressor')).toBe(1);
  });

  it('cada efeito do jogo nasce, liga e começa', () => {
    const calls: Array<[string, unknown[]]> = [
      ['playCozyChime', []], ['playDialogBlip', [440, 'square']], ['playDialogBlip', [300, 'sawtooth']], ['playRadioClick', [true]],
      ['playFootstep', []], ['playStep', ['grass']], ['playStep', ['stone']], ['playStep', ['wood']], ['playStep', ['dirt']],
      ['playPick', ['wood', 0]], ['playPick', ['metal', 3]], ['playPut', ['stone']], ['playPut', ['glass']],
      ['playSwordHum', []], ['playHearthCatch', []], ['playFindTouch', ['bell']], ['playFindTouch', ['flower']], ['playSwordSlash', []],
      ['playShipCall', []], ['playShipDescend', []], ['playShipLand', []], ['playShipDoor', []], ['playShipLift', []],
      ['playMugClink', []], ['playMugSip', []], ['playDeathArrive', []], ['playDeathLeave', []], ['playItemBonk', []],
      ['playFarWave', []], ['playBagOpen', []], ['playBagToss', []], ['playBagLand', []], ['playBagClasp', []], ['playItemStash', []],
      ['playWaterDrop', []], ['playTitleImpact', []], ['playSingingBowl', []], ['playHeartPickup', []], ['playSwordPickup', []],
      ['playIgnite', []], ['playWoodChop', []], ['playAxeWhoosh', []], ['playAxeBite', []], ['playBridgePlank', []],
      ['playFurnaceIgnite', []], ['playFurnaceBreath', []], ['playToolboxOpen', []], ['playToolboxForge', [0]], ['playToolboxForge', [2]],
      ['playToolboxDeliver', []], ['playToolboxRefuse', []], ['playHammer', [0]], ['playHammer', [3]], ['playBridgeBuilt', []],
      ['playTreeFall', []], ['playFrogPlop', []], ['playFishSplash', []], ['playPuddleSplash', []], ['playSplash', []],
      ['playRockSmash', []], ['playGrassCut', []], ['playMushroomCut', []], ['playSandTrickle', []], ['playPaperUnfold', []],
      ['playFireHit', []], ['playShopOpen', []], ['playShopClose', []], ['playWindGust', []], ['playAnvilStrike', [false]],
      ['playAnvilStrike', [true]], ['playForgeHammerPickup', []], ['playForgeHammerSetDown', []], ['playKeyJingle', []],
      ['playKeyInsert', []], ['playLockTick', []], ['playLockClunk', []], ['playOldGateCreak', []], ['playGateSwing', []],
      ['playGateStrain', []], ['playMoonflowerBloom', []], ['playMoonflowerClose', []],
    ];
    const manager = sm() as unknown as Record<string, (...args: unknown[]) => void>;
    for (const [name, args] of calls) {
      const before = ctx.starts;
      expect(typeof manager[name], name).toBe('function');
      manager[name](...args);
      expect(ctx.starts, `${name} não começou nada`).toBeGreaterThan(before);
    }
  });

  it('a fala de um NPC, sílaba por sílaba, agenda o próprio som', () => {
    const persona = personaFor({ npcAssetKey: 'npcs', npcFrame: 0, calm: false } as never);
    const syllables = planSpeech('Olá, viajante.', persona, 220).flatMap((c) => (c.syllable ? [c.syllable] : []));
    expect(syllables.length).toBeGreaterThan(2);
    const before = ctx.nodes.length;
    for (const syllable of syllables) sm().playDialogSyllable(syllable);
    expect(ctx.nodes.length).toBeGreaterThan(before);
  });
});

describe('volume', () => {
  it('o volume da pessoa muda o barramento e fica guardado', () => {
    sm().setMusicVolume(0.25);
    sm().setSfxVolume(0.5);
    expect(sm().getMusicVolume()).toBe(0.25);
    expect(sm().getSfxVolume()).toBe(0.5);
    const stored = test.local.keys().map((k) => test.local.getItem(k));
    expect(stored).toContain('0.25');
    expect(stored).toContain('0.5');
  });
});

describe('música e ambiente', () => {
  it('pedir uma trilha anota o pedido, baixa, decodifica e troca com fade', async () => {
    sm().preload();
    sm().startMusic('title', 300);
    expect(sm().requestedTrack).toBe('title');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(ctx.decoded).toBeGreaterThan(0);
    sm().fadeMusicOut(200);
    sm().fadeMusicIn(200);
    sm().stopMusic(100);
    expect(sm().requestedTrack).toBeNull();
  });

  it('o vale (a trilha da aventura) escolhe uma peça', async () => {
    sm().startMusic('overworld', 0);
    await new Promise((resolve) => setTimeout(resolve, 20));
    sm().setMusicLayers(0.5, 0.3);
    expect(sm().requestedTrack).toBe('overworld');
    sm().stopMusic(0);
  });

  it('os leitos de ambiente sobem, misturam e param', async () => {
    sm().startAmbience();
    await new Promise((resolve) => setTimeout(resolve, 20));
    sm().setAmbienceMix(0.7, 0.2, 0.5);
    const out = sm().listeningOutput();
    expect(out).not.toBeNull();
    sm().setListening(true);
    sm().setListening(false);
    sm().stopAmbience();
  });
});

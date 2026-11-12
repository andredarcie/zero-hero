import { beforeAll, describe, expect, it } from 'vitest';

import { personaFor, planSpeech } from '@/game/dialogs/voicePersonas';
import { installPlatform } from '@/game/platform/platform';
import { RecordingAudioContext } from '@/test-support/recordingAudio';
import { createTestPlatform, type TestPlatform } from '@/test-support/testPlatform';
import { getSoundManager } from './SoundManager';
import { swellCurve } from './Synth';

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
      // O lazer: o fôlego e o perceber da meditação, a pena e o susto do desenho, a pedra que quica e a que afunda.
      ['playBreathCue', [true]], ['playBreathCue', [false]], ['playNotice', []], ['playPenScratch', []], ['playStartle', []],
      ['playStoneSkip', [1]], ['playStoneSkip', [6]], ['playStonePlunk', []],
    ];
    // Cada efeito mora numa das peças do som (WorkSounds, UiSounds, NatureSounds, StorySounds).
    const m = sm();
    const owners = [m.work, m.ui, m.nature, m.story] as unknown as Array<Record<string, (...args: unknown[]) => void>>;
    for (const [name, args] of calls) {
      const before = ctx.starts;
      const owner = owners.find((o) => typeof o[name] === 'function');
      expect(owner, name).toBeDefined();
      owner![name](...args);
      expect(ctx.starts, `${name} não começou nada`).toBeGreaterThan(before);
    }
  });

  it('a fala de um NPC, sílaba por sílaba, agenda o próprio som', () => {
    const persona = personaFor({ npcAssetKey: 'npcs', npcFrame: 0, calm: false } as never);
    const syllables = planSpeech('Olá, viajante.', persona, 220).flatMap((c) => (c.syllable ? [c.syllable] : []));
    expect(syllables.length).toBeGreaterThan(2);
    const before = ctx.nodes.length;
    for (const syllable of syllables) sm().ui.playDialogSyllable(syllable);
    expect(ctx.nodes.length).toBeGreaterThan(before);
  });

  it('o sopro (o fôlego da meditação) cresce devagar e se desfaz: começa e termina em zero, sem quina', () => {
    const curve = swellCurve(0.03, 0.4);
    expect(curve[0]).toBe(0);
    expect(curve[curve.length - 1]).toBeLessThan(1e-9);
    const top = Math.max(...curve);
    expect(top).toBeCloseTo(0.03, 3);
    // O pico cai perto de 40% da duração, e nenhum passo da curva salta (o golpe de 3 ms do `noise` seria um salto).
    expect(curve.indexOf(top) / (curve.length - 1)).toBeCloseTo(0.4, 1);
    for (let i = 1; i < curve.length; i += 1) expect(Math.abs(curve[i] - curve[i - 1])).toBeLessThan(0.03 * 0.1);
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
    sm().music.startMusic('title', 300);
    expect(sm().music.requestedTrack).toBe('title');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(ctx.decoded).toBeGreaterThan(0);
    sm().music.fadeMusicOut(200);
    sm().music.fadeMusicIn(200);
    sm().music.stopMusic(100);
    expect(sm().music.requestedTrack).toBeNull();
  });

  it('o vale (a trilha da aventura) escolhe uma peça', async () => {
    sm().music.startMusic('overworld', 0);
    await new Promise((resolve) => setTimeout(resolve, 20));
    sm().music.setMusicLayers(0.5, 0.3);
    expect(sm().music.requestedTrack).toBe('overworld');
    sm().music.stopMusic(0);
  });

  it('os leitos de ambiente sobem, misturam e param', async () => {
    sm().ambience.startAmbience();
    await new Promise((resolve) => setTimeout(resolve, 20));
    sm().ambience.setAmbienceMix(0.7, 0.2, 0.5);
    const out = sm().listeningOutput();
    expect(out).not.toBeNull();
    sm().setListening(true);
    sm().setListening(false);
    sm().ambience.stopAmbience();
  });

  it('a meditação funda afasta o vale sem calar: os leitos descem a 45% e voltam, e o mix do lugar respeita isso', async () => {
    sm().ambience.startAmbience();
    await new Promise((resolve) => setTimeout(resolve, 20));
    sm().ambience.setAmbienceMix(0, 0, 0);
    const day = (): number => sm().ambienceBeds.get('day')?.gain.gain.value ?? -1;
    const full = day();
    expect(full).toBeGreaterThan(0);
    sm().ambience.setHush(1);
    expect(day()).toBeCloseTo(full * 0.45, 5);
    // O mix do lugar (chamado a cada quadro pelo mundo) não desfaz o calar.
    sm().ambience.setAmbienceMix(0, 0, 0);
    expect(day()).toBeCloseTo(full * 0.45, 5);
    sm().ambience.setHush(0);
    expect(day()).toBeCloseTo(full, 5);
    sm().ambience.stopAmbience();
  });
});

// Audio: every clip the game loads is served and decodable, the cozy music is a real loop, and
// the three ambience beds (day, night, water) play together and follow the world — night by the
// clock, water by distance. Playback itself can't be "heard" here (the run is muted by design),
// but the audio graph still runs, so the gains it asks for are readable.
const FILES = [
  'music-valley.wav', 'music-lullaby.wav',
  'ambience-day.wav', 'ambience-night.wav', 'ambience-water.wav',
  'item-pickup.wav', 'heart.wav', 'shop-open.wav', 'shop-close.wav', 'ignite.wav',
  'wood-chop.wav', 'rock-smash.wav', 'tree-fall.wav', 'splash.wav', 'grass-cut.wav',
  'singing-bowl.wav', 'title-impact.wav', 'combat/sword-swing.wav', 'combat/fire-hit.wav',
];
// Frequent events shouldn't use long clips (they'd pile up). One-shot moments may be longer.
const MAX_SECONDS = { 'item-pickup.wav': 1.6, 'wood-chop.wav': 1.5, 'rock-smash.wav': 1.8 };

export default {
  name: 'audio',
  description: 'The cozy soundtrack and SFX load + decode; the day/night/water beds follow the world.',
  needsGame: false,
  async run({ driver, assert, log }) {
    const { page } = driver;
    await page.addInitScript(() => {
      localStorage.setItem('zh.cozy.v1', JSON.stringify({ started: true, introSeen: true }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });

    const probe = await page.evaluate(async (files) => {
      const ctx = new AudioContext();
      const out = [];
      for (const f of files) {
        try {
          const res = await fetch(`/assets/audio/${f}`);
          if (!res.ok) { out.push({ f, status: res.status, ok: false, duration: 0 }); continue; }
          const buf = await ctx.decodeAudioData(await res.arrayBuffer());
          out.push({ f, status: res.status, ok: true, duration: buf.duration });
        } catch (e) {
          out.push({ f, status: 0, ok: false, duration: 0, err: String(e) });
        }
      }
      await ctx.close();
      return out;
    }, FILES);
    for (const r of probe) log(`  ${r.ok ? 'OK ' : 'MISS'} ${r.f.padEnd(24)} HTTP ${r.status}  ${r.duration.toFixed(2)}s`);
    const missing = probe.filter((r) => !r.ok).map((r) => r.f);
    assert('All audio files served + decoded', missing.length === 0, missing.join(', ') || `${probe.length} clips`);
    const tooLong = probe.filter((r) => MAX_SECONDS[r.f] && r.duration > MAX_SECONDS[r.f]).map((r) => r.f);
    assert('Frequent SFX are short enough', tooLong.length === 0, tooLong.join(', ') || 'ok');
    const valley = probe.find((r) => r.f === 'music-valley.wav');
    assert('The valley theme is a real loop', Boolean(valley?.ok) && valley.duration > 30, `duration=${valley?.duration.toFixed(1)}s`);

    // The live mix, read from the game's own SoundManager (window.__sound, dev only).
    const mix = async (phase, at) => page.evaluate(async ([p, xy]) => {
      window.gameTime.set(p);
      const s = window.__scene;
      s.playerWorld.worldX = xy[0]; s.playerWorld.worldY = xy[1];
      s.movementController.interruptMovement(xy[0], xy[1]);
      s.ambienceClockMs = 0;
      await new Promise((r) => setTimeout(r, 700));
      const sm = window.__sound;
      return { beds: sm.ambienceBeds.size, mix: { ...sm.ambienceMix }, track: sm.requestedTrack };
    }, [phase, at]);
    await page.waitForFunction(() => window.__sound?.ambienceBeds.size === 3, null, { timeout: 15000 });
    const dayDry = await mix(0.5, [30, 46]); // meio-dia, longe da agua
    const nightWet = await mix(0.0, [41, 51]); // meia-noite, na beira do lago do sul
    log(`  day/dry ${JSON.stringify(dayDry)}  night/wet ${JSON.stringify(nightWet)}`);
    assert('The three ambience beds play together', dayDry.beds === 3, `beds=${dayDry.beds}`);
    assert('The adventure asks for the valley theme', dayDry.track === 'overworld', `track=${dayDry.track}`);
    assert('By day the birds lead and the crickets rest', dayDry.mix.day > 0.95 && dayDry.mix.night < 0.05, JSON.stringify(dayDry.mix));
    assert('By night the crickets lead', nightWet.mix.night > 0.95, JSON.stringify(nightWet.mix));
    assert('Far from water there is no lapping', dayDry.mix.water === 0, JSON.stringify(dayDry.mix));
    assert('Beside the lake the water bed rises', nightWet.mix.water > 0.7, JSON.stringify(nightWet.mix));

    const opened = await driver.openDialog('painter');
    assert('Sound-triggering UI ran without errors', opened, 'opened a dialog');
    await driver.closeDialog();
  },
};

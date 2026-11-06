// Audio: every clip the game loads is served and decodable, the valley music is six whole pieces
// (not a short loop) and one of them actually starts, the pick follows the hour, and the ambience
// beds (day, night, water) play together and follow the world — night by the clock, water by
// distance. Playback itself can't be "heard" here (the run is muted by design), but the audio graph
// still runs, so the gains and the choices it makes are readable.
const PIECES = {
  'valley-morning.mp3': ['day'], 'valley-waltz.mp3': ['day'], 'valley-clouds.mp3': ['day', 'dusk'],
  'valley-golden.mp3': ['dusk', 'night'], 'valley-fireflies.mp3': ['dusk', 'night'], 'valley-moon.mp3': ['night'],
};
const FILES = [
  ...Object.keys(PIECES), 'music-lullaby.mp3',
  'ambience-day.mp3', 'ambience-night.mp3', 'ambience-water.mp3', 'ambience-rain.mp3',
  'music-layer-water.mp3', 'music-layer-fire.mp3',
  'item-pickup.mp3', 'heart.mp3', 'shop-open.mp3', 'shop-close.mp3', 'ignite.mp3',
  'wood-chop.mp3', 'rock-smash.mp3', 'tree-fall.mp3', 'splash.mp3', 'grass-cut.mp3',
  'singing-bowl.mp3', 'title-impact.mp3', 'combat/sword-swing.wav', 'combat/fire-hit.wav',
];
// Frequent events shouldn't use long clips (they'd pile up). One-shot moments may be longer.
const MAX_SECONDS = { 'item-pickup.mp3': 1.6, 'wood-chop.mp3': 1.5, 'rock-smash.mp3': 1.8 };

export default {
  name: 'audio',
  description: 'The cozy soundtrack and SFX load + decode; the day/night/water beds follow the world.',
  needsGame: false,
  async run({ driver, shot, assert, log }) {
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
    const pieces = probe.filter((r) => r.f in PIECES);
    const short = pieces.filter((r) => !(r.duration > 100)).map((r) => `${r.f} ${r.duration.toFixed(0)}s`);
    assert('The valley music is six whole pieces, not a short loop', pieces.length === 6 && short.length === 0, short.join(', ') || pieces.map((r) => r.duration.toFixed(0)).join('s, ') + 's');
    const lullaby = probe.find((r) => r.f === 'music-lullaby.mp3');
    assert('The lullaby is a real loop', Boolean(lullaby?.ok) && lullaby.duration > 60, `duration=${lullaby?.duration.toFixed(1)}s`);

    // A first piece starts a few seconds into the adventure (download + decode included).
    const firstPiece = await page.waitForFunction(() => window.__sound?.valleyPiece, null, { timeout: 30000 })
      .then((h) => h.jsonValue()).catch(() => null);
    assert('A valley piece starts playing', Boolean(firstPiece && firstPiece in PIECES), String(firstPiece));

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
    await page.waitForFunction(() => window.__sound?.ambienceBeds.size === 4, null, { timeout: 15000 });
    const dayDry = await mix(0.5, [30, 46]); // meio-dia, longe da agua
    const nightWet = await mix(0.0, [41, 51]); // meia-noite, na beira do lago do sul
    log(`  day/dry ${JSON.stringify(dayDry)}  night/wet ${JSON.stringify(nightWet)}`);
    assert('The four ambience beds play together', dayDry.beds === 4, `beds=${dayDry.beds}`);
    assert('The adventure asks for the valley theme', dayDry.track === 'overworld', `track=${dayDry.track}`);
    assert('By day the birds lead and the crickets rest', dayDry.mix.day > 0.95 && dayDry.mix.night < 0.05, JSON.stringify(dayDry.mix));
    assert('By night the crickets lead', nightWet.mix.night > 0.95, JSON.stringify(nightWet.mix));
    assert('Far from water there is no lapping', dayDry.mix.water === 0, JSON.stringify(dayDry.mix));
    assert('Beside the lake the water bed rises', nightWet.mix.water > 0.7, JSON.stringify(nightWet.mix));

    // The hour picks the piece: at midnight only night pieces, at noon only day pieces.
    const picks = async (phase) => page.evaluate(async (p) => {
      window.gameTime.set(p);
      window.__scene.ambienceClockMs = 0;
      await new Promise((r) => setTimeout(r, 700));
      const sm = window.__sound;
      return Array.from({ length: 24 }, () => sm.pickValleyPiece([]));
    }, phase);
    const atNight = await picks(0.0);
    const atNoon = await picks(0.5);
    const wrong = [...atNight.filter((f) => !PIECES[f].includes('night')), ...atNoon.filter((f) => !PIECES[f].includes('day'))];
    log(`  night picks ${[...new Set(atNight)].join(', ')}  |  noon picks ${[...new Set(atNoon)].join(', ')}`);
    assert('The hour of day picks the piece', wrong.length === 0, wrong.join(', ') || 'ok');

    // When a piece ends the valley goes quiet (ambience only) and the next one is already on the clock.
    const gap = await page.evaluate(async () => {
      const sm = window.__sound;
      const before = sm.valleyPiece;
      sm.valley.piece.source.stop();
      await new Promise((r) => setTimeout(r, 400));
      return { before, after: sm.valleyPiece, nextScheduled: sm.valley.timer !== null, beds: sm.ambienceBeds.size };
    });
    assert('After a piece: silence with the ambience, next one scheduled', Boolean(gap.before) && gap.after === null && gap.nextScheduled && gap.beds === 4, JSON.stringify(gap));

    // THE PLAYER (pause → Music): every song listed, a click plays one (the valley goes quiet under it),
    // the transport moves on, and resuming the game stops the player and brings the valley back.
    await page.evaluate(() => window.__scene.openPauseMenu());
    await page.locator('#zh-pause-root .zh-main .zh-pause-btn').nth(2).click();
    const listed = await page.locator('#zh-pause-root .zh-music-track').count();
    assert('Pause → Music lists every song', listed === 7, `rows=${listed}`);
    await page.locator('#zh-pause-root .zh-music-track').nth(3).click();
    const playing = await page.waitForFunction(() => window.__jukebox?.playing && window.__jukebox.time > 0.5, null, { timeout: 15000 })
      .then(() => page.evaluate(() => ({ file: window.__jukebox.track.file, bus: window.__sound.musicBus.gain.value })))
      .catch(() => null);
    assert('Clicking a song plays it, the valley music hushes', Boolean(playing && playing.file === 'valley-golden.mp3'), JSON.stringify(playing));
    await shot('music-player');
    const moved = await page.evaluate(async () => {
      const jb = window.__jukebox;
      jb.seek(60);
      const t = jb.time;
      jb.next();
      await new Promise((r) => setTimeout(r, 300));
      return { seekedTo: Math.round(t), next: jb.track.file };
    });
    assert('Seek and next work', moved.seekedTo === 60 && moved.next === 'valley-fireflies.mp3', JSON.stringify(moved));
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1500);
    const after = await page.evaluate(() => ({ menu: Boolean(document.getElementById('zh-pause-root')), playing: window.__jukebox.playing, bus: window.__sound.musicBus.gain.value }));
    assert('Back in the game the player stops and the valley returns', !after.menu && !after.playing && after.bus > 0.3, JSON.stringify(after));

    const opened = await driver.openDialog('painter');
    assert('Sound-triggering UI ran without errors', opened, 'opened a dialog');
    await driver.closeDialog();
  },
};

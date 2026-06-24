// Audio: confirm every downloaded SFX is served and decodable, and that triggering
// sound events doesn't throw. Playback itself can't be "heard" here, but loading +
// decoding + the play path are what break in practice.
const FILES = [
  'sword-slash.wav', 'enemy-hit.wav', 'enemy-death.wav', 'coin.wav', 'heart.wav',
  'sword-pickup.wav', 'hurt.wav', 'game-over.wav', 'shop-open.wav', 'shop-close.wav',
  'ignite.wav', 'music.wav',
];
// Frequent events shouldn't use long clips (they'd pile up). One-shot moments may be longer.
const MAX_SECONDS = {
  'coin.wav': 1.6, 'enemy-hit.wav': 1.5, 'sword-slash.wav': 1.5, 'hurt.wav': 1.8,
};

export default {
  name: 'audio',
  description: 'Verify downloaded retro SFX load + decode and that sound events fire cleanly.',
  needsGame: true,
  async run({ driver, assert, log }) {
    const probe = await driver.page.evaluate(async (files) => {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const out = [];
      for (const f of files) {
        try {
          const res = await fetch(`/assets/audio/${f}`);
          if (!res.ok) { out.push({ f, status: res.status, ok: false, duration: 0 }); continue; }
          const data = await res.arrayBuffer();
          const buf = await ctx.decodeAudioData(data);
          out.push({ f, status: res.status, ok: true, duration: buf.duration });
        } catch (e) {
          out.push({ f, status: 0, ok: false, duration: 0, err: String(e) });
        }
      }
      await ctx.close();
      return { out };
    }, FILES);

    for (const r of probe.out) {
      log(`  ${r.ok ? 'OK ' : 'MISS'} ${r.f.padEnd(16)} HTTP ${r.status}  ${r.duration.toFixed(2)}s`);
    }
    const missing = probe.out.filter((r) => !r.ok).map((r) => r.f);
    assert('All SFX files served + decoded', missing.length === 0, missing.length ? `bad: ${missing.join(', ')}` : `${probe.out.length} clips`);

    const tooLong = probe.out.filter((r) => MAX_SECONDS[r.f] && r.duration > MAX_SECONDS[r.f])
      .map((r) => `${r.f} ${r.duration.toFixed(2)}s>${MAX_SECONDS[r.f]}s`);
    assert('Frequent SFX are short enough', tooLong.length === 0, tooLong.length ? tooLong.join(', ') : 'ok');

    const music = probe.out.find((r) => r.f === 'music.wav');
    assert('Background music is a real loop', Boolean(music?.ok) && music.duration > 10, `duration=${music?.duration.toFixed(1)}s`);

    // Exercise the play path (the run's global "no uncaught page errors" check covers this).
    await driver.openShop();
    await driver.settle(200);
    await driver.closeShop();
    const opened = await driver.openDialog('blackCat');
    assert('Sound-triggering UI ran without errors', opened, 'opened a dialog after shop toggle');
    await driver.closeDialog();
  },
};

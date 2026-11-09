// SISI E O SONO — pedido do autor: uma noite de sono faz as tintas regadas amanhecerem prontas, e a Sisi dá a dica
// ("Ou durma uma noite: elas amanhecem prontas."). O cenário rega os quatro canteiros com as teclas, dorme no
// colchão do acampamento e confere que, ao acordar, a colheita está aberta.
import { makePlayer, sleep } from '../lib/player.mjs';

export default {
  name: 'sisi-dormir',
  description: 'Regadas as tintas da Sisi, uma noite no acampamento as faz amanhecer prontas para colher.',
  needsGame: false,
  async run({ driver, shot, assert }) {
    const { page } = driver;
    const P = makePlayer({ page });
    await page.addInitScript(() => {
      if (sessionStorage.getItem('sisi-dormir')) return;
      sessionStorage.setItem('sisi-dormir', '1');
      localStorage.setItem('zh.cozy.v1', JSON.stringify({ started: true, introSeen: true }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await sleep(1200);
    await P.loadRelief();
    const stage = () => page.evaluate(() => window.__scene.painterQuest.save.stage);
    const held = async () => (await P.state()).heldItem;
    const near = { near: await P.homeOf('painter'), radius: 7 };

    // Os passos da Sisi até a espera, jogados.
    await P.talk('painter', 'a Sisi');
    for (let i = 0; i < 4; i += 1) { await P.doVerb('x', 'dig', 'cavar', near); await sleep(500); await P.drain('cavar'); }
    await P.talk('painter', 'as sementes');
    for (let i = 0; i < 4; i += 1) { await P.doVerb('x', 'sow', 'semear', near); await sleep(450); }
    await P.talk('painter', 'o balde');
    for (let i = 0; i < 12 && (await stage()) === 'water'; i += 1) {
      if ((await held()) === 'bucket') await P.doVerb('x', 'fill', 'encher');
      else await P.doVerb('x', 'water', 'regar', near);
      await sleep(700);
      await P.drain('balde');
    }
    assert('Regadas: as tintas estão crescendo', (await stage()) === 'grow', await stage());

    // A dica: a fala dela na espera manda dormir.
    const hint = await page.evaluate(async () => {
      const url = performance.getEntriesByType('resource').map((e) => e.name).find((u) => u.includes('/i18n/i18n.ts'));
      const { tLines } = await import(url);
      return tLines('npc.painterStep.wait').map((l) => l.text).join(' ');
    });
    assert('Na espera, a Sisi dá a dica de dormir', /durma/i.test(hint), hint);

    // Dormir no colchão do acampamento, de dia mesmo: o relógio corre até a noite e a manhã seguinte.
    const levels0 = await page.evaluate(() => window.__scene.painterQuest.save.plots.map((p) => p.level));
    await P.doVerb('z', 'sleep', 'o colchão', { near: { x: 53, y: 48 }, radius: 3 });
    await P.waitFor((s) => s.resting, 'deitar', 8000);
    await P.waitFor((s) => s.dialogOpen || !s.resting, 'a manhã (ou a Morte)', 300000);
    await P.drain('a Morte', 200);
    for (let i = 0; i < 40 && (await P.state()).resting; i += 1) { await P.press('ArrowDown', 60, 400); await P.drain('levantar'); }
    await P.free();
    await sleep(800);
    const after = await page.evaluate(() => ({ stage: window.__scene.painterQuest.save.stage, levels: window.__scene.painterQuest.save.plots.map((p) => p.level) }));
    assert('Antes de dormir as plantas não estavam prontas', levels0.some((l) => l < 3), JSON.stringify(levels0));
    assert('Depois de uma noite, as quatro amanheceram prontas', after.stage === 'harvest' && after.levels.every((l) => l === 3), JSON.stringify(after));
    await P.walkTo([{ x: 17, y: 19 }], 'de volta à Sisi').catch(() => {});
    await shot('prontas', { note: 'As tintas prontas depois da noite' });
  },
};

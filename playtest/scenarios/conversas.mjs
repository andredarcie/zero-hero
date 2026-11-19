// AS CONVERSAS NO MENU (pedido do autor, 2026-11-18: "uma opção no menu que é possível ler novamente todo o histórico
// de conversas com os NPCs até o momento"; runtime/talkLog + runtime/TalkLogOverlay). Conversa com a Shui até o fim: a
// conversa entra no save; conversar de novo (ela repete a dica) não vira página nova. A pausa ganha "Conversas", que
// abre o caderno com o nome dela e o que ela disse; ele é legível no computador e no celular (em pé e deitado); o
// Esc devolve o menu; e, recarregada a página, o caderno continua lá.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SCREENS = [
  { name: 'computador', width: 1440, height: 900 },
  { name: 'celular-em-pe', width: 390, height: 844 },
  { name: 'celular-deitado', width: 844, height: 390 },
];

export default {
  name: 'conversas',
  description: 'O histórico das conversas: entra no save, abre pela pausa, legível em toda tela, sobrevive à recarga.',
  needsGame: false,
  async run({ driver, shot, assert, log }) {
    const { page } = driver;
    const g = (fn, arg) => page.evaluate(fn, arg);
    const state = () => g(() => window.gameDebug?.getState() ?? null);
    const saved = () => g(() => JSON.parse(localStorage.getItem('zh.cozy.v1') || '{}').talks ?? []);
    const closeAll = async () => {
      for (let i = 0; i < 60; i += 1) {
        const st = await state();
        if (!st.dialogOpen && !st.itemGetOpen && !st.cutsceneActive) return;
        if (st.dialogOpen || st.itemGetOpen) await page.keyboard.press('z');
        await sleep(300);
      }
    };
    const talkToShui = async () => {
      await g(() => { window.gameTime.set(0.45); window.gameDebug.hero.teleport(5, 41, 0, -1); });
      await sleep(500);
      await page.keyboard.press('z');
      await sleep(300);
      await closeAll();
      await sleep(600);
    };
    const openTalks = async () => {
      await page.keyboard.press('Escape');
      await page.waitForSelector('#zh-pause-root .zh-pause-btn', { timeout: 8000 });
      await sleep(300);
      await page.click('#zh-pause-root .zh-pause-btn:has-text("Conversas")');
      await page.waitForSelector('#zh-talk-root', { timeout: 8000 });
      await sleep(400);
    };

    await page.addInitScript(() => {
      if (sessionStorage.getItem('conversas')) return;
      sessionStorage.setItem('conversas', '1');
      localStorage.setItem('zh.cozy.v1', JSON.stringify({ started: true, introSeen: true }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await sleep(1200);

    // ── A CONVERSA ENTRA NO SAVE ──────────────────────────────────────────────────────────────────────────────────
    await talkToShui();
    const first = await saved();
    log(`  depois da 1ª conversa: ${JSON.stringify(first.map((e) => ({ who: e.who, day: e.day, lines: e.lines.length })))}`);
    assert('A conversa com a Shui entra no save: o nome dela e as falas lidas', first.length === 1 && first[0].who.length > 0 && first[0].lines.length >= 2, JSON.stringify(first.map((e) => e.who)));
    await talkToShui();
    const second = await saved();
    assert('Conversar de novo (ela repete a dica) não vira página nova', second.length === first.length, JSON.stringify({ before: first.length, after: second.length }));

    // ── A PAUSA ABRE AS CONVERSAS ─────────────────────────────────────────────────────────────────────────────────
    await openTalks();
    const view = await g(() => {
      const root = document.getElementById('zh-talk-root');
      return {
        talks: root.querySelectorAll('.zh-talk').length,
        who: root.querySelector('.zh-talk-who')?.textContent ?? '',
        portrait: Boolean(root.querySelector('.zh-talk-who img')?.getAttribute('src')),
        text: root.querySelector('.zh-talk-line')?.textContent ?? '',
        day: root.querySelector('.zh-talk-day')?.textContent ?? '',
        pauseHidden: getComputedStyle(document.getElementById('zh-pause-root')).display === 'none',
      };
    });
    log(`  o caderno: ${JSON.stringify(view)}`);
    const firstText = first[0].lines[0].text.replace(/\s+/g, ' ').trim();
    assert('"Conversas" abre o caderno por cima do menu: a Shui, o retrato, o dia e o que ela disse',
      view.talks === 1 && view.who === first[0].who && view.portrait && view.day === 'Dia 1' && view.pauseHidden
        && view.text.replace(/\s+/g, '').includes(firstText.replace(/\s+/g, '').slice(0, 20)),
      JSON.stringify(view));

    for (const s of SCREENS) {
      await page.setViewportSize({ width: s.width, height: s.height });
      await sleep(500);
      const m = await g(() => {
        const root = document.getElementById('zh-talk-root');
        const px = (el) => (el ? parseFloat(getComputedStyle(el).fontSize) : 0);
        const rect = (el) => el.getBoundingClientRect();
        const off = (el) => { const r = rect(el); return r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1; };
        const list = root.querySelector('.zh-talk-list');
        const back = root.querySelector('.zh-talk-back');
        return {
          title: px(root.querySelector('h1')),
          line: px(root.querySelector('.zh-talk-line')),
          day: px(root.querySelector('.zh-talk-day')),
          hint: px(root.querySelector('.zh-talk-hint')),
          back: px(back),
          backH: rect(back).height,
          offscreen: [root.querySelector('.zh-talk-panel'), back].some(off),
          listH: rect(list).height,
          atLatest: Math.abs(list.scrollTop + list.clientHeight - list.scrollHeight) <= 2,
        };
      });
      log(`  ${s.name}: ${JSON.stringify(m)}`);
      assert(`${s.name}: letra legível (fala, dia e dica ≥ 18px; título ≥ 22px) e o Voltar com 44px`,
        m.line >= 18 && m.day >= 18 && m.hint >= 18 && m.back >= 18 && m.title >= 22 && m.backH >= 44, JSON.stringify(m));
      assert(`${s.name}: nada sai da tela, e sobra espaço para ler`, !m.offscreen && m.listH >= 120, JSON.stringify(m));
      await shot(`conversas-${s.name}`, { note: `O caderno das conversas: ${s.name} (${s.width}×${s.height})` });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await sleep(400);

    // ── O ESC DEVOLVE O MENU, E O MENU DEVOLVE O JOGO ─────────────────────────────────────────────────────────────
    await page.keyboard.press('Escape');
    await sleep(400);
    const back = await g(() => ({
      talk: Boolean(document.getElementById('zh-talk-root')),
      pause: getComputedStyle(document.getElementById('zh-pause-root')).display !== 'none',
      selected: document.querySelector('#zh-pause-root .zh-pause-btn.is-selected')?.textContent ?? '',
    }));
    assert('O Esc fecha o caderno e devolve o menu de pausa', !back.talk && back.pause, JSON.stringify(back));
    await page.keyboard.press('Escape');
    await sleep(500);
    assert('E o Esc no menu volta ao jogo', !(await g(() => Boolean(document.getElementById('zh-pause-root')))), '');

    // ── RECARREGADA A PÁGINA, AS CONVERSAS CONTINUAM ──────────────────────────────────────────────────────────────
    await page.reload();
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await sleep(1500);
    await openTalks();
    const reloaded = await g(() => document.querySelectorAll('#zh-talk-root .zh-talk').length);
    assert('Recarregada a página, o caderno continua com a conversa', reloaded === 1, String(reloaded));
    await page.keyboard.press('Escape');
    await sleep(300);
    await page.keyboard.press('Escape');
    await sleep(300);
  },
};

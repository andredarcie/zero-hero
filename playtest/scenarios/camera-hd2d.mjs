// O HD-2D, ANTES E DEPOIS (pedidos do autor, 2026-11-19: "a versão como está hoje e a versão depois com o ângulo
// ajustado", e depois "aplique todos esses efeitos para que o jogo seja um HD 2D mais legítimo possível").
// Os mesmos lugares, nas mesmas horas, dois quadros:
//   · ANTES: o jogo como era ANTES do pacote HD-2D — a câmera de 46,5° com lente de 30° e os efeitos novos desligados;
//   · DEPOIS: o jogo de fábrica, como está agora.
// O "antes" é montado só com knobs ao vivo (`window.hd3d`), nada no código muda: cada efeito novo do pacote tem um knob
// que o desliga, e ele entra em ANTES com o valor que o desliga.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * A câmera de antes (worldParams até 2026-11-19): o olho em (0, 8,636, 7,813) com lente de 30°, e o fog que ela tinha
 * (o de fábrica de agora × 1,692, o recuo que a câmera nova deu). O resto da lista é o que o pacote acrescentou.
 */
const BEFORE = { camHeight: 8.636, camBack: 7.813, fov: 30 };
const FOG_BEFORE = 1 / 0.591;
/** Os knobs dos efeitos novos e o valor que os desliga (o pacote HD-2D de 2026-11-19). */
const NEW_FX_OFF = {
  // A lente: o tilt-shift por fileira de tela, fraco, como era.
  dofDepth: 0, dofBlur: 1.6, dofNear: 0.3, bokeh: 0,
  // A cor que se separa nos cantos: não existia.
  aberration: 0,
};
const SPOTS = [
  { name: 'comeco', x: 30, y: 55, hour: 0.45, note: 'O começo da aventura' },
  { name: 'acampamento', x: 54, y: 50, hour: 0.8, note: 'O acampamento, de noite' },
  { name: 'jardim', x: 30, y: 37, hour: 0.3, note: 'O portão do jardim alto, de manhã' },
  { name: 'mata', x: 26, y: 31, hour: 0.42, note: 'A mata do jardim alto' },
  { name: 'prado', x: 17, y: 20, hour: 0.68, note: 'O prado da Sisi, na hora dourada' },
  { name: 'thea', x: 42, y: 9, hour: 0.45, note: 'A cratera da Thea' },
  { name: 'praia', x: 30, y: -14, hour: 0.5, note: 'A praia do norte' },
  { name: 'lava', x: 14, y: 7, hour: 0.85, note: 'O lago de lava, de noite (o bokeh e os reflexos da lente)' },
];

export default {
  name: 'camera-hd2d',
  description: 'O jogo antes do pacote HD-2D (câmera de 46,5°, sem os efeitos novos) e o de fábrica, nos mesmos lugares.',
  needsGame: false,
  async run({ driver, shot, assert, log }) {
    const { page } = driver;
    const g = (fn, arg) => page.evaluate(fn, arg);
    const only = (process.env.HD2D_SPOTS || '').split(',').filter(Boolean);
    // Para afinar um knob no "depois" sem mexer no código: HD2D_KNOBS='{"flare":1.5}'.
    const tweak = JSON.parse(process.env.HD2D_KNOBS || '{}');
    await page.addInitScript(() => {
      if (sessionStorage.getItem('camera-hd2d')) return;
      sessionStorage.setItem('camera-hd2d', '1');
      localStorage.setItem('zh.cozy.v1', JSON.stringify({
        started: true, introSeen: true, day: 2, clock: 0.45, respawn: { worldX: 30, worldY: 55 }, mistCleared: true,
      }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game' && window.hd3d, null, { timeout: 30000 });
    await sleep(1500);
    const keys = [...Object.keys(BEFORE), 'fogDensity', ...Object.keys(NEW_FX_OFF)];
    const factory = await g((k) => Object.fromEntries(k.map((key) => [key, window.hd3d[key]])), keys);
    log(`  de fábrica: ${JSON.stringify(factory)}`);
    const hide = () => g(() => window.gameDebug.verbs.hidePrompt());

    for (const s of SPOTS) {
      if (only.length && !only.includes(s.name)) continue;
      await g((h) => window.gameTime.set(h), s.hour);
      await g(([x, y]) => window.gameDebug.hero.teleport(x, y, 0, 1), [s.x, s.y]);
      // a placa com o nome do lugar aparece na chegada: espera ela sumir, para as duas fotos saírem iguais
      await sleep(5000);
      for (const key of ['antes', 'depois']) {
        // a hora volta ao ponto (o relógio andou na espera) e o fog lido NESTA hora é o de fábrica dela
        await g((h) => window.gameTime.set(h), s.hour);
        await sleep(200);
        const fog = await g(() => window.hd3d.fogDensity);
        if (key === 'antes') await g((v) => Object.assign(window.hd3d, v), { ...BEFORE, ...NEW_FX_OFF, fogDensity: fog * FOG_BEFORE });
        else if (Object.keys(tweak).length) await g((v) => Object.assign(window.hd3d, v), tweak);
        await hide();
        await sleep(1300);
        await shot(`${s.name}-${key}`, { note: `${s.note} — ${key}` });
        if (key === 'antes') await g((v) => Object.assign(window.hd3d, v), { ...factory, fogDensity: fog });
      }
    }
    const back = await g((k) => Object.fromEntries(k.map((key) => [key, window.hd3d[key]])), Object.keys(BEFORE));
    const same = Object.keys(BEFORE).every((k) => back[k] === factory[k]);
    assert('A câmera volta à de fábrica no fim', same, JSON.stringify(back));
  },
};

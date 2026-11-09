// O FUNDO DA TELA DE TÍTULO é o próprio vale, renderizado pelo jogo — e SÓ A FLORESTA (pedido do autor):
// nada de herói, NPC, casa, item ou fogueira. Este script tira a foto: um trecho de mata longe de toda casa,
// NPC e item, na hora azul, com a câmera afastada e nenhuma interface na frente. A TitleScene põe por cima o
// que uma foto não tem (os vaga-lumes, a névoa, as folhas caindo).
//
// Rode de novo sempre que o visual do mundo mudar. Sobe um Vite numa porta livre, abre o jogo fora da
// tela e mudo, e grava public/assets/ui/title_bg.jpg.
//
//   node scripts/capturar-titulo.mjs                                                   # a foto oficial
//   node scripts/capturar-titulo.mjs --at 28,8 --clock 0.76 --dolly 1.3 --out x.jpg  # provas
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const SHOT = {
  at: arg('at', '28,8').split(',').map(Number),
  clock: Number(arg('clock', '0.76')),
  dolly: Number(arg('dolly', '1.3')),
};
const OUT = path.resolve(arg('out', path.join(root, 'public/assets/ui/title_bg.jpg')));
const PORT = 5186;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore', shell: true });
const { chromium } = await import('playwright');
let browser;
try {
  for (let i = 0; i < 80; i += 1) { try { await fetch(`http://localhost:${PORT}/`); break; } catch { await sleep(500); } }
  browser = await chromium.launch({
    headless: false,
    args: ['--mute-audio', '--window-position=-32000,-32000', '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await context.addInitScript(() => {
    localStorage.setItem('zh.sfxVol', '0');
    localStorage.setItem('zh.musicVol', '0');
    localStorage.setItem('zh.cozy.v1', JSON.stringify({ started: true, introSeen: true }));
  });
  const page = await context.newPage();
  await page.goto(`http://localhost:${PORT}/?play`);
  await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 60000 });
  await sleep(1500);
  await page.evaluate(({ at, clock }) => {
    const s = window.__scene;
    s.playerWorld.worldX = at[0]; s.playerWorld.worldY = at[1];
    s.movementController.interruptMovement(at[0], at[1]);
    s.streamChunks(true);
    window.gameTime.set(clock);
    // SÓ A FLORESTA: o herói e o gato saem de cena — a cada quadro, porque o jogo os redesenha.
    const hide = () => {
      s.heroBillboard?.setVisible(false);
      s.cat?.body?.setVisible(false);
      requestAnimationFrame(hide);
    };
    hide();
  }, SHOT);
  await sleep(2500);
  await page.evaluate(({ dolly, clock }) => {
    const s = window.__scene;
    window.gameTime.set(clock);
    s.verbs.actionPrompt?.destroy();
    s.verbs.actionPrompt = undefined;
    void s.cinema.dollyTo(dolly, 400);
    // Só o mundo: toda interface de DOM some (o canvas fica visível dentro de um pai escondido).
    const st = document.createElement('style');
    st.textContent = '* { visibility: hidden !important; } canvas { visibility: visible !important; }';
    document.head.appendChild(st);
  }, SHOT);
  await sleep(2500);
  await page.screenshot({ path: OUT, type: 'jpeg', quality: 90 });
  console.log(`gravado: ${OUT}`);
} finally {
  await browser?.close();
  spawn('taskkill', ['/F', '/T', '/PID', String(vite.pid)], { stdio: 'ignore', shell: true });
  vite.kill();
}

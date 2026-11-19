// O HERÓI DE HOJE E AS HIPÓTESES, NO JOGO DE VERDADE: em cada lugar, uma foto por folha no mesmo quadro e na mesma hora
// — o herói de hoje (`antiga`), cada folha pedida no lugar da dele, e sem herói (`vazia`, a folha transparente: é o fundo
// que a análise usa para achar a silhueta e medir o contraste). A troca é da IMAGEM da textura do herói (como a tinta da
// capa faz, heroDye.ts): a luz, a sombra e o reflexo são os do jogo. Nada no repositório muda.
//   node docs/heroi-cozy/capturar.mjs hero-v3-roxo.png hero-v3-azul.png ...   (o servidor em http://localhost:5173)
// Cada foto sai como capturas/<lugar>-<nome da folha sem .png>[-real].png.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('C:/repos/zero-hero/package.json');
const { chromium } = require('playwright');
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(AQUI, 'capturas');
fs.mkdirSync(OUT, { recursive: true });
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const arquivos = process.argv.slice(2).length ? process.argv.slice(2) : ['hero-cozy.png', 'hero-cozy-fechado.png'];
const folhas = Object.fromEntries(arquivos.map((a) => [
  path.basename(a, '.png'), `data:image/png;base64,${fs.readFileSync(path.resolve(AQUI, a)).toString('base64')}`,
]));

/** [nome, x, y, hora]: o herói olhando para a câmera (de frente), no lugar. */
const LUGARES = [
  ['mata', 42, 2, 0.4],
  ['prado', 17, 21, 0.45],
  ['praia', 28, -15, 0.42],
  ['cachoeira', 51, 58, 0.4],
  ['lago', 38, 53, 0.7],
  ['fonte-noite', 5, -1, 0.88],
];

const browser = await chromium.launch({ headless: false, args: ['--window-position=-32000,-32000', '--mute-audio'] });
const ctx = await browser.newContext({ viewport: { width: 720, height: 720 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => {
  localStorage.setItem('zh.cozy.v1', JSON.stringify({ started: true, introSeen: true }));
  localStorage.setItem('zh.sfxVol', '0');
  localStorage.setItem('zh.musicVol', '0');
});
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5173/?play', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 120000 });
await dorme(2500);
const achou = await page.evaluate(async (folhas) => {
  const css = document.createElement('style');
  css.textContent = 'body * { visibility: hidden !important; } #world3d { visibility: visible !important; }';
  document.head.appendChild(css);
  window.gameTime.setDay(16);
  window.__base = { h: window.hd3d.camHeight, b: window.hd3d.camBack };
  // A textura do herói: a folha de 80x32 (a dele) que o corpo dele usa — os quadros são cópias da base e dividem a
  // mesma imagem.
  const texturas = new Set();
  window.__scene.world3d.scene.traverse((o) => {
    const img = o.material?.map?.image;
    if (img && img.width === 80 && img.height === 32) texturas.add(o.material.map);
  });
  const carrega = async (src) => { const im = new Image(); im.src = src; await im.decode(); return im; };
  const vazia = document.createElement('canvas');
  vazia.width = 80;
  vazia.height = 32;
  const lista = [...texturas];
  window.__heroi = { lista, antiga: lista[0]?.image, vazia };
  for (const [nome, src] of Object.entries(folhas)) window.__heroi[nome] = await carrega(src);
  window.__veste = (qual) => {
    for (const t of window.__heroi.lista) { t.image = window.__heroi[qual]; t.needsUpdate = true; }
  };
  return lista.length;
}, folhas);
if (!achou) { console.log('a textura do herói não foi achada'); await browser.close(); process.exit(1); }

const variantes = ['antiga', ...Object.keys(folhas), 'vazia'];
for (const [nome, x, y, hora] of LUGARES) {
  await page.evaluate(({ x, y, hora }) => {
    window.__veste('antiga');
    window.gameTime.set(hora);
    window.gameDebug.hero.teleport(x, y, 0, 1);
    window.gameDebug.verbs.hidePrompt();
  }, { x, y, hora });
  await dorme(1800);
  // de perto (para julgar o desenho) e no zoom de sempre (o tamanho que o jogador vê)
  for (const [dolly, sufixo] of [[0.5, ''], [1, '-real']]) {
    await page.evaluate((dolly) => {
      window.hd3d.camHeight = window.__base.h * dolly;
      window.hd3d.camBack = window.__base.b * dolly;
    }, dolly);
    await dorme(1200);
    for (const qual of variantes) {
      await page.evaluate(({ qual, hora }) => { window.__veste(qual); window.gameTime.set(hora); }, { qual, hora });
      await dorme(450);
      await page.screenshot({ path: path.join(OUT, `${nome}-${qual}${sufixo}.png`) });
    }
  }
  console.log('ok', nome);
}
await browser.close();

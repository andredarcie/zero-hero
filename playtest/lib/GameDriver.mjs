// A game-aware wrapper around a Playwright page.
//
// It knows how this specific game boots (Boot -> Preload -> Intro -> Game), how to read
// live state through window.gameDebug, how to drive the hero with the keyboard, and how to
// pop the dialog/shop UI for inspection. Scenarios talk to this, never to Playwright directly.
import { chromium } from 'playwright';

/**
 * Let the frame run as fast as the machine can draw it (PLAYTEST_UNTHROTTLED=1).
 *
 * With vsync on, a desktop GPU simply DOWNCLOCKS to meet the refresh: strip the entire post
 * chain out of the frame and the reported GPU time does not budge, because the hardware just
 * did the smaller job more slowly. Every measurement lands on the refresh interval and every
 * optimisation looks like it changed nothing. Unlocked, the frame costs what it costs.
 */
const UNTHROTTLED_ARGS = [
  '--disable-gpu-vsync',
  '--disable-frame-rate-limit',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
];

/**
 * SILENCIO, SEMPRE. Teste roda com a janela visivel (o WebGL exige), e uma janela visivel toca som
 * na cara de quem estiver na sala — uma suite inteira grita fogueira, espada e caveira por minutos.
 * A lei e do CLAUDE.md ("nunca rodar o jogo com efeito sonoro pra testar") e ela e cumprida AQUI,
 * por construcao, e nao pela lembranca de quem roda: um flag no navegador nao depende de ninguem.
 *
 * O `--mute-audio` cala a aba inteira; as duas chaves de volume (as mesmas do menu de pausa, ver
 * SoundManager) calam o jogo por dentro, entao ele tambem nao gasta trabalho sintetizando o que
 * ninguem vai ouvir. O cenario `audio` continua valendo: ele monta o proprio AudioContext e mede
 * download e decode, que nao passam por nenhum dos dois.
 */
const MUTE_ARGS = ['--mute-audio'];

import { config } from '../config.mjs';
import { log } from './report.mjs';

const ARROW = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class GameDriver {
  constructor(browser, context, page) {
    this.browser = browser;
    this.context = context;
    this.page = page;
    this.consoleErrors = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') this.consoleErrors.push(`console.error: ${msg.text()}`);
    });
    page.on('pageerror', (err) => {
      this.consoleErrors.push(`pageerror: ${err.message}`);
    });
  }

  static async launch() {
    // headless is forced false in config — a real, visible window is required (WebGL).
    const browser = await chromium.launch({
      headless: config.headless,
      slowMo: config.slowMoMs,
      args: [...MUTE_ARGS, ...(config.unthrottled ? UNTHROTTLED_ARGS : [])],
    });
    const context = await browser.newContext({
      viewport: config.viewport,
      deviceScaleFactor: config.deviceScaleFactor,
    });
    // Os volumes entram ANTES de qualquer script da pagina: o SoundManager le as duas chaves no
    // construtor, entao setar depois do boot deixaria os primeiros segundos com som.
    await context.addInitScript(() => {
      try {
        localStorage.setItem('zh.sfxVol', '0');
        localStorage.setItem('zh.musicVol', '0');
      } catch { /* storage indisponivel: o --mute-audio ainda garante o silencio */ }
    });
    const page = await context.newPage();
    return new GameDriver(browser, context, page);
  }

  async open(route = '/') {
    const url = new URL(route, config.baseUrl).href;
    log(`Opening ${url}`);
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    await this.waitForBoot();
  }

  /** Phaser instance is alive (first scene running). */
  async waitForBoot() {
    await this.page.waitForFunction(() => Boolean(window.zeroTheHeroGame), null, {
      timeout: config.bootTimeoutMs,
    });
  }

  /** Live snapshot, or null when not in the GameScene (title/preload). */
  async getState() {
    return this.page.evaluate(() => window.gameDebug?.getState() ?? null);
  }

  /** Key past the title and wait until the GameScene is live and controllable. */
  async startGame() {
    for (let i = 0; i < 8; i += 1) {
      const state = await this.getState();
      if (state?.scene === 'game') break;
      await this.press('Enter', { count: 1, delay: 550, holdMs: 80 });
    }
    // Keying past the title is timing-dependent (its input arms 300ms in) and has never been
    // reliable. `?play` boots straight into the GameScene (dev only) — the sure road in.
    const inGame = await this.getState();
    if (inGame?.scene !== 'game') {
      log('Title did not key through; reloading into ?play.');
      await this.open('/?play');
    }
    await this.page.waitForFunction(
      () => window.gameDebug?.getState()?.scene === 'game',
      null,
      { timeout: config.gameReadyTimeoutMs },
    );
    log('GameScene is live.');
    return this.getState();
  }

  async settle(ms = 250) {
    await this.page.waitForTimeout(ms);
  }

  // ── Input ────────────────────────────────────────────────────────────────
  // IMPORTANT: Playwright's instantaneous press() (down+up same frame) is missed by the
  // game, which polls Phaser's JustDown() inside update(). We must HOLD the key for a few
  // frames so the scene observes the press, then wait for the move tween to settle.
  async press(key, { count = 1, delay = config.stepIntervalMs, holdMs = 70 } = {}) {
    for (let i = 0; i < count; i += 1) {
      await this.page.keyboard.down(key);
      await sleep(holdMs);
      await this.page.keyboard.up(key);
      await sleep(Math.max(0, delay - holdMs));
    }
  }

  /** Walk the hero `steps` tiles in a direction (up/down/left/right). */
  async walk(direction, steps = 1) {
    const key = ARROW[direction];
    if (!key) throw new Error(`Unknown direction: ${direction}`);
    log(`Walking ${direction} x${steps}`);
    await this.press(key, { count: steps });
  }

  // ── OS DOIS BOTOES ───────────────────────────────────────────────────────
  // O jogo deixou de ser so-andar: A golpeia na direcao em que o heroi olha, B usa o item
  // escolhido no tile a frente. Andar contra as coisas nao usa mais item nenhum — o esbarrao
  // ficou com os gestos de corpo (empurrar caixote, abrir portao de bater, conversar) e com o
  // dano de contato.

  /** O botao A: a espada (ou o soco) no tile a frente. */
  async attack(count = 1) {
    await this.press('z', { count, delay: 320 });
  }

  /** O botao B: o item selecionado no tile a frente — usa, ou pousa ali. */
  async useItem(count = 1) {
    await this.press('x', { count, delay: 360 });
  }

  /**
   * PEGAR o item do chao — que e o MESMO botao B, e por isso este helper e so um apelido com
   * nome honesto.
   *
   * Ele existe porque o gesto mudou e o nome antigo do gesto era "andar por cima": nada mais
   * entra na mochila por pisada (ver GameScene.pickUpItemAt). O B pega do tile a frente e, se la
   * nao houver nada, do tile de baixo dos pes — entao um cenario que largou algo e quer de volta
   * so aperta isto, sem sair do lugar.
   */
  async pickUp(count = 1) {
    await this.useItem(count);
  }

  /**
   * O A SEGURADO: a lamina rodopiante. Segura o botao ate a carga completar (SPIN_CHARGE_MS =
   * 450ms no GameScene) e so entao solta — e o `keyup` que dispara o giro. `holdMs` existe pra um
   * cenario poder soltar CEDO de proposito e provar que sem carga nao ha giro.
   */
  async spinAttack(holdMs = 700) {
    await this.page.keyboard.down('z');
    await sleep(holdMs);
    await this.page.keyboard.up('z');
    await sleep(120);
  }

  /**
   * VIRAR sem andar: um toque curto numa seta que o heroi ainda nao encara gasta-se virando o
   * corpo (ver PlayerMovementController). O toque tem de ser CURTO — segurar anda no frame
   * seguinte, que e justamente a outra metade do contrato.
   */
  async face(direction) {
    const key = ARROW[direction];
    if (!key) throw new Error(`Unknown direction: ${direction}`);
    await this.press(key, { count: 1, holdMs: 24, delay: 220 });
  }

  /**
   * ENCARAR e usar: aperta a seta (contra uma trava ela so VIRA o heroi — ver
   * PlayerMovementController) e so entao o B. E o gesto que substituiu o esbarrao com item na
   * mao, e o unico jeito de mirar num tile bloqueado.
   */
  async faceAndUse(direction, count = 1) {
    const key = ARROW[direction];
    if (!key) throw new Error(`Unknown direction: ${direction}`);
    await this.press(key, { count: 1 });
    await this.useItem(count);
  }

  // ── Dialog / shop (deterministic via window.gameDebug) ───────────────────
  async openDialog(kind) {
    const opened = await this.page.evaluate((k) => window.gameDebug?.openDialog(k) ?? false, kind);
    if (opened) {
      await this.page.waitForFunction(() => window.gameDebug?.getState()?.dialogOpen === true, null, {
        timeout: 5000,
      });
    }
    return opened;
  }

  /** Advance the typewriter / move to next line, mirroring real SPACE presses. */
  async advanceDialog(times = 1) {
    await this.press('Space', { count: times, delay: 350 });
  }

  async closeDialog() {
    await this.page.evaluate(() => window.gameDebug?.closeDialog());
    await this.page.waitForFunction(() => window.gameDebug?.getState()?.dialogOpen === false, null, {
      timeout: 5000,
    });
  }

  async listNpcKinds() {
    return this.page.evaluate(() => window.gameDebug?.listNpcKinds() ?? []);
  }

  // ── Screenshots ──────────────────────────────────────────────────────────
  // The Phaser canvas — the 3D world canvas sits under it at the same size/position, so
  // either one frames the board; naming it explicitly keeps the locator unambiguous.
  async canvasBox() {
    const box = await this.page.locator('#app canvas').boundingBox();
    if (!box) throw new Error('Canvas not found on page.');
    return box;
  }

  /**
   * Region clip in CSS pixels for focused legibility shots.
   * 'full' = whole canvas, 'hud' = top bar, 'dialog' = right-side conversation panel.
   */
  async canvasRegion(region) {
    const box = await this.canvasBox();
    if (region === 'hud') {
      return { x: box.x, y: box.y, width: box.width, height: Math.round(box.height * 0.22) };
    }
    if (region === 'dialog') {
      // Disco Elysium-style panel: full height, hugging the right edge (~46% of width).
      const panelWidth = Math.round(box.width * 0.5);
      return {
        x: box.x + box.width - panelWidth,
        y: box.y,
        width: panelWidth,
        height: box.height,
      };
    }
    if (region === 'hero') {
      // A tight square around the hero, who is pinned to the centre of the screen. For reading an
      // ANIMATION — a swing, an impact, the debris off it — where a full 1280×800 frame renders
      // the whole event across about forty pixels and you cannot tell a pickaxe from a puff.
      const width = Math.round(box.width * 0.34);
      const height = Math.round(box.height * 0.46);
      return {
        x: box.x + Math.round((box.width - width) / 2),
        y: box.y + Math.round((box.height - height) / 2),
        width,
        height,
      };
    }
    return box; // 'full'
  }

  /**
   * @param {string} filePath absolute output path (.png)
   * @param {{ selector?: string, clip?: object, fullPage?: boolean }} opts
   */
  async screenshot(filePath, { selector, clip, fullPage = false } = {}) {
    if (selector) {
      await this.page.locator(selector).screenshot({ path: filePath });
    } else {
      await this.page.screenshot({ path: filePath, clip, fullPage });
    }
    return filePath;
  }

  async close() {
    await this.context.close().catch(() => {});
    await this.browser.close().catch(() => {});
  }
}

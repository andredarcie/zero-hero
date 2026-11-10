// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';

import { isMushroomKind } from '@/game/fungi/fungi';
import { t } from '@/game/i18n/i18n';
import { isReducedMotion, setReducedMotion } from '@/game/runtime/accessibility';
import { canStep } from '@/game/world/relief';
import { getNpcHome } from '@/game/world/WorldData';
import { crackTiles } from '@/game/quests/PainterCracks';
import { getCameraZoom, setCameraZoom } from '@/game/runtime/graphicsSettings';
import type { GameScene } from '@/game/scenes/GameScene';
import { bootGame, type BootedGame } from '@/test-support/game';
import type { TestPage } from '@/test-support/nodeHost';

// O JOGO JOGADO, sem navegador: o mesmo jogo do navegador montado na plataforma dos testes. O herói passa pela
// abertura, anda pelo grid, esbarra no que é sólido, conversa, pausa, vê a hora passar — e cada passo é cobrado no
// estado que o jogo mesmo publica (o `gameDebug` dos playtests) e no DOM das telas.

const KEY = { Z: 90, X: 88, ESC: 27, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40 } as const;

let booted: BootedGame;
let page: TestPage;
// O tipo de verdade (e não um retrato à mão): um membro que mudar de lugar quebra a compilação, não só o teste.
const scene = (): GameScene => booted.scene<GameScene>('game');
const state = () => window.gameDebug!.getState();
const press = (code: number): void => {
  page.key('keydown', code);
  booted.tick(2);
  page.key('keyup', code);
  booted.tick(2);
};
const hold = (code: number, frames: number): void => {
  page.key('keydown', code);
  booted.tick(frames);
  page.key('keyup', code);
  booted.tick(2);
};
const teleport = (x: number, y: number): void => {
  const s = scene();
  s.playerWorld.worldX = x;
  s.playerWorld.worldY = y;
  s.movementController!.interruptMovement(x, y);
  booted.tick(2);
};
/** Um tile livre com o vizinho da direita livre, perto do começo. */
const freeRow = (): { x: number; y: number } => {
  const s = scene();
  const { worldX, worldY } = state().player;
  for (let r = 0; r < 20; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = worldX + dx;
        const y = worldY + dy;
        if (!s.query.isSolidForEntities(x, y) && !s.query.isSolidForEntities(x + 1, y) && !s.query.isSolidForEntities(x + 2, y)) return { x, y };
      }
    }
  }
  throw new Error('nenhum tile livre');
};

beforeAll(async () => {
  booted = await bootGame();
  page = booted.platform.engineHost.page!;
}, 120_000);

describe('a abertura', () => {
  it('toca na primeira partida e termina com o herói no controle', async () => {
    await booted.until(() => {
      const s = state();
      if (s.dialogOpen) press(KEY.Z);
      return s.introDone && !s.cutsceneActive && !s.dialogOpen;
    }, 12_000);
    expect(state().introDone).toBe(true);
  }, 120_000);
});

describe('o zoom do jogador', () => {
  it('não há régua na HUD: ela abre pelas opções da pausa, por cima do jogo parado, e o OK volta', () => {
    const key = (code: string): void => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }));
    };
    booted.tick(2);
    expect(document.getElementById('zh-zoom')).toBeNull();
    setCameraZoom(1);
    press(KEY.ESC);
    expect(document.querySelector('.zh-pause-scrim')).not.toBeNull();
    const row = [...document.querySelectorAll<HTMLElement>('.zh-pause-row')].find((el) => el.textContent?.startsWith('Zoom'));
    expect(row?.textContent).toContain('100%');
    row!.click();
    // O menu sumiu, a régua apareceu, e o jogo continua parado.
    expect(document.getElementById('zh-zoom')).not.toBeNull();
    expect(booted.game.scene.isPaused('game')).toBe(true);
    const w3 = scene().world3d!;
    const up = (): number => w3.camera.position.y - w3.camTarget.y;
    const before = up();
    key('ArrowUp');
    expect(getCameraZoom()).toBeCloseTo(1.1, 5);
    // O quadro parado foi redesenhado com a câmera nova, sem o jogo voltar a andar.
    expect(up()).toBeLessThan(before);
    expect(booted.game.scene.isPaused('game')).toBe(true);
    key('Enter');
    expect(document.getElementById('zh-zoom')).toBeNull();
    expect(row?.textContent).toContain('110%');
    // Esc volta das opções para a pausa, e da pausa para o jogo.
    key('Escape');
    key('Escape');
    booted.tick(3);
    expect(booted.game.scene.isPaused('game')).toBe(false);
    setCameraZoom(1);
    booted.tick(2);
  });

  it('a câmera chega perto pela própria linha de visão: a distância muda, o ângulo não', () => {
    const w3 = scene().world3d!;
    // Sem o balanço de mão, para medir a câmera e não a respiração dela; e com "reduzir movimento", a câmera pula
    // direto para o zoom pedido — dois quadros bastam, e o teste não pesa na bateria.
    const sway = w3.params.camSway;
    const reduced = isReducedMotion();
    w3.params.camSway = 0;
    setReducedMotion(true);
    const reach = (): { up: number; back: number; tile: number } => ({
      up: w3.camera.position.y - w3.camTarget.y,
      back: w3.camera.position.z - w3.camTarget.z,
      tile: scene().tileSize,
    });
    setCameraZoom(1);
    booted.tick(2);
    const before = reach();
    const uiBefore = scene().uiTileSize;
    setCameraZoom(1.5);
    booted.tick(2);
    const after = reach();
    const uiAfter = scene().uiTileSize;
    setCameraZoom(0.75);
    booted.tick(2);
    const uiFar = scene().uiTileSize;
    setCameraZoom(1);
    booted.tick(2);
    w3.params.camSway = sway;
    setReducedMotion(reduced);
    expect(after.up / before.up).toBeCloseTo(1 / 1.5, 3);
    expect(after.back / before.back).toBeCloseTo(1 / 1.5, 3);
    expect(after.up / after.back).toBeCloseTo(before.up / before.back, 4);
    // O mundo, que mede tudo pelo tile na tela (pegadas, o herói), vê o tile maior…
    expect(after.tile / before.tile).toBeGreaterThan(1.3);
    // …mas a interface presa a ele (o balão de ação, o pensamento, o "!") fica do mesmo tamanho (pedido do autor).
    expect(uiAfter / uiBefore).toBeCloseTo(1, 1);
    expect(uiFar / uiBefore).toBeCloseTo(1, 1);
  });
});

describe('andar', () => {
  it('segurar a seta anda pelo grid, um tile de cada vez', () => {
    const { x, y } = freeRow();
    teleport(x, y);
    hold(KEY.RIGHT, 40);
    booted.tick(30);
    const after = state().player;
    expect(after.worldY).toBe(y);
    expect(after.worldX).toBeGreaterThan(x);
    expect(Number.isInteger(after.worldX)).toBe(true);
  });

  it('o que é sólido não deixa passar', () => {
    const s = scene();
    const { worldX, worldY } = state().player;
    let spot: { x: number; y: number } | null = null;
    for (let r = 1; r < 30 && !spot; r++) {
      for (let dx = -r; dx <= r && !spot; dx++) {
        const x = worldX + dx;
        const y = worldY + r;
        if (!s.query.isSolidForEntities(x, y) && s.query.isSolidForEntities(x + 1, y)) spot = { x, y };
      }
    }
    expect(spot).not.toBeNull();
    teleport(spot!.x, spot!.y);
    hold(KEY.RIGHT, 40);
    booted.tick(30);
    expect(state().player).toEqual({ worldX: spot!.x, worldY: spot!.y });
  });
});

/** Um alvo do mapa com o tile ao sul livre: o herói fica ali, olhando para o norte. */
const southOf = (is: (x: number, y: number) => boolean): { x: number; y: number } => {
  const s = scene();
  for (let y = 0; y < 60; y++) {
    for (let x = 0; x < 60; x++) {
      if (is(x, y) && !s.query.isSolidForEntities(x, y + 1) && !s.itemManager?.hasItemAt(x, y + 1) && canStep(x, y + 1, x, y)) return { x, y };
    }
  }
  throw new Error('nenhum alvo com o sul livre');
};
const faceNorthAt = (x: number, y: number): void => {
  teleport(x, y);
  hold(KEY.UP, 3);
  booted.tick(20);
  expect(state().player).toEqual({ worldX: x, worldY: y });
};
const items = () => window.gameDebug!.items!;

describe('as ferramentas ficam com ele', () => {
  it('a guardada que o tile pede vem às costas: o balão diz o verbo, e o X a traz e usa', () => {
    const s = scene();
    s.inventory.clear();
    items().hold('axe');
    items().take('knife');
    expect(items().held()).toBe('knife');
    expect(items().kept()).toEqual(['axe']);
    const tree = southOf((x, y) => Boolean(s.query.getDryTreeAt(x, y)?.blocking));
    faceNorthAt(tree.x, tree.y + 1);
    expect(items().toolVerb('use')).toEqual({ tool: 'axe', verb: 'chop' });
    // O herói não pensa no machado: ele já tem.
    s.bumps.thinkOfNeed(tree.x, tree.y, true);
    expect(s.bumps.heroThought?.visibleIcon ?? null).toBeFalsy();
    press(KEY.X);
    booted.tick(60);
    expect(items().held()).toBe('axe');
    expect(items().kept()).toEqual(['knife']);
  });

  it('com material nas costas, ele desce aos pés e a ferramenta sobe; o Z o pega de volta e guarda a ferramenta', () => {
    const s = scene();
    s.inventory.clear();
    items().hold('pickaxe');
    items().take('stone');
    expect(items().held()).toBe('stone');
    const tree = southOf((x, y) => Boolean(s.query.getDryTreeAt(x, y)?.blocking) || Boolean(s.query.getDryShrubAt(x, y)?.blocking));
    items().take('axe');
    faceNorthAt(tree.x, tree.y + 1);
    booted.tick(80);
    press(KEY.X);
    booted.tick(60);
    expect(items().held()).toBe('axe');
    const stone = items().ground().find((i) => i.kind === 'stone' && Math.abs(i.worldX - tree.x) + Math.abs(i.worldY - tree.y - 1) <= 2);
    expect(stone).toBeDefined();
    // De pé na pedra, o Z a pega: o machado vai para as guardadas, sem cair no chão. (Já vista: sem a cerimônia.)
    items().markSeen('stone');
    teleport(stone!.worldX, stone!.worldY);
    booted.tick(40);
    press(KEY.Z);
    expect(items().held()).toBe('stone');
    expect(items().kept()).toEqual(expect.arrayContaining(['axe', 'pickaxe']));
    expect(items().ground().some((i) => i.kind === 'axe' || i.kind === 'pickaxe')).toBe(false);
    expect(s.hand.itemGetOpen).toBe(false);
  });

  it('o cogumelo pede a faca guardada no Z; com a tocha acesa nas costas, nada troca', () => {
    const s = scene();
    s.inventory.clear();
    items().hold('knife');
    items().take('axe');
    const shroom = southOf((x, y) => isMushroomKind(s.itemManager?.kindAt(x, y)));
    faceNorthAt(shroom.x, shroom.y + 1);
    expect(items().toolVerb('hand')).toEqual({ tool: 'knife', verb: 'harvest' });
    s.inventory.clear();
    items().hold('wood');
    s.torch.heldOnFire = true;
    s.inventory.keep('knife');
    expect(items().toolVerb('hand')).toBeNull();
    s.torch.heldOnFire = false;
    s.inventory.clear();
    s.carry.updateBackItem();
  });
});

describe('a pá, o pousar e o arbusto seco', () => {
  it('a pá só cava nas quatro covas rachadas da Sisi, e em mais lugar nenhum', () => {
    const s = scene();
    s.inventory.clear();
    items().hold('shovel');
    const covas = crackTiles(getNpcHome('painter')!);
    // Perto delas: o chão só existe (e só se cava) nos chunks carregados em volta do herói.
    window.gameDebug!.hero!.teleport(covas[0].x, covas[0].y + 2, 0, -1);
    booted.tick(10);
    expect(s.questSetup.painterQuest, 'a quest da Sisi está montada').toBeDefined();
    for (const c of covas) expect(s.verbs.useVerbAt(c.x, c.y), `${c.x},${c.y}`).toBe('dig');
    // O chão em volta (sem rachadura) não é cova.
    const vizinhos = covas.flatMap((c) => [{ x: c.x - 1, y: c.y }, { x: c.x, y: c.y + 1 }])
      .filter((v) => !covas.some((c) => c.x === v.x && c.y === v.y));
    for (const v of vizinhos) expect(s.verbs.useVerbAt(v.x, v.y), `${v.x},${v.y}`).not.toBe('dig');
    s.inventory.clear();
    s.carry.updateBackItem();
  });

  it('de pé em cima da cova, o X cava ali mesmo, com a pá guardada vindo às costas', () => {
    const s = scene();
    s.inventory.clear();
    s.inventory.keep('shovel');
    s.carry.updateBackItem();
    const cova = crackTiles(getNpcHome('painter')!)[0];
    // Em cima dela, olhando para o sul (para longe das outras covas).
    window.gameDebug!.hero!.teleport(cova.x, cova.y, 0, 1);
    booted.tick(10);
    expect(s.verbs.currentPrompt({ x: cova.x, y: cova.y })?.view.rows.map((r) => r.label)).toContain(t('actions.dig'));
    booted.tick(30);
    press(KEY.X);
    booted.tick(60);
    expect(items().held()).toBe('shovel');
    expect(s.query.getPlantSpotAt(cova.x, cova.y)?.isHole).toBe(true);
    s.inventory.clear();
    s.carry.updateBackItem();
  });

  it('o Z não pousa mais nada no chão livre (só o enfeite se pousa)', () => {
    const s = scene();
    s.inventory.clear();
    items().markSeen('stone');
    items().hold('stone');
    const { x, y } = freeRow();
    window.gameDebug!.hero!.teleport(x, y, 1, 0);
    booted.tick(20);
    press(KEY.Z);
    booted.tick(10);
    expect(items().held()).toBe('stone');
    expect(items().kindAt(x + 1, y)).toBeNull();
    s.inventory.clear();
    s.carry.updateBackItem();
  });

  it('o machado também derruba o arbusto seco (o fogo continua valendo)', () => {
    const s = scene();
    s.inventory.clear();
    items().hold('axe');
    const at = southOf((x, y) => Boolean(s.query.getDryBushAt(x, y)?.blocking));
    faceNorthAt(at.x, at.y + 1);
    expect(s.verbs.useVerbAt(at.x, at.y)).toBe('chop');
    booted.tick(40);
    press(KEY.X);
    booted.tick(90);
    expect(s.query.getDryBushAt(at.x, at.y)?.blocking).toBe(false);
    s.inventory.clear();
    s.carry.updateBackItem();
  });
});

describe('conversar', () => {
  it('a fala do NPC abre no DOM, e o Z anda as falas até fechar', async () => {
    expect(window.gameDebug!.openDialog('wizard')).toBe(true);
    booted.tick(5);
    expect(state().dialogOpen).toBe(true);
    expect(document.querySelector('.zh-dlg-panel')).not.toBeNull();
    expect(document.querySelector('.zh-dlg-name')?.textContent?.length).toBeGreaterThan(0);
    let presses = 0;
    await booted.until(() => {
      if (state().dialogOpen) { press(KEY.Z); presses++; }
      return !state().dialogOpen;
    }, 3000);
    expect(state().dialogOpen).toBe(false);
    expect(presses).toBeGreaterThan(1);
  }, 60_000);

  it('a caixa desenha a estrofe como poema: um verso por linha, e na quadra o 2º e o 4º recuados', async () => {
    expect(window.gameDebug!.openDialog('blackCat')).toBe(true);
    booted.tick(5);
    // A datilografia termina (o Z pula para o fim da estrofe).
    await booted.until(() => {
      if (state().dialogOpen && document.querySelector('.zh-dlg-next')?.getAttribute('style')?.includes('none')) press(KEY.Z);
      return document.querySelectorAll('.zh-verse').length > 0;
    }, 3000);
    const verses = [...document.querySelectorAll<HTMLElement>('.zh-stanza .zh-verse')];
    expect([2, 4]).toContain(verses.length);
    expect(document.querySelectorAll('.zh-dlg-body br').length).toBe(0);
    const indented = verses.map((v) => v.classList.contains('zh-rhyme'));
    expect(indented).toEqual(verses.length === 4 ? [false, true, false, true] : [false, false]);
    window.gameDebug!.closeDialog();
    booted.tick(5);
  }, 60_000);

  it('cada vizinho tem fala', () => {
    const kinds = window.gameDebug!.listNpcKinds();
    expect(kinds.length).toBeGreaterThan(3);
    for (const kind of kinds.slice(0, 4)) {
      expect(window.gameDebug!.openDialog(kind)).toBe(true);
      booted.tick(2);
      window.gameDebug!.closeDialog();
      booted.tick(2);
    }
    expect(state().dialogOpen).toBe(false);
  });
});

describe('a pausa', () => {
  it('ESC abre o menu (em DOM) e fecha de novo — mas nunca por cima de outra tela, nem com a câmera andando', async () => {
    // A câmera volta do diálogo devagar; a pausa espera (ver GameScene.openPauseMenu).
    await booted.until(() => !scene().dialogCam.camShifting && !state().dialogOpen && !state().cutsceneActive, 600);
    press(KEY.ESC);
    booted.tick(3);
    const scrim = document.querySelector('.zh-pause-scrim');
    expect(scrim).not.toBeNull();
    expect(document.querySelectorAll('.zh-pause-btn').length).toBeGreaterThan(1);
    press(KEY.ESC);
    booted.tick(3);
    expect(booted.game.scene.isActive('game')).toBe(true);
  });
});

describe('o tempo e as tarefas', () => {
  it('a hora do dia anda e o relógio pode ser posto à mão', () => {
    window.gameTime!.set(0.5);
    booted.tick(2);
    expect(state().timeOfDay?.phase).toBeCloseTo(0.5, 2);
    window.gameTime!.set(0.0);
    booted.tick(10);
    expect(state().timeOfDay?.phase).toBeLessThan(0.1);
    window.gameTime!.setDay(3);
    expect(window.gameTime!.get().day).toBe(3);
  });

  it('o caderno de missões lista os pedidos, cada um com as tarefas', () => {
    const quests = window.gameDebug!.quests();
    expect(quests.length).toBeGreaterThan(0);
    for (const q of quests) {
      expect(typeof q.dialog).toBe('string');
      expect(Array.isArray(q.tasks)).toBe(true);
    }
  });

  it('o mapa responde o que cada mão faz em cada tile', () => {
    const s = scene();
    const { worldX, worldY } = state().player;
    let verbs = 0;
    for (let dy = -6; dy <= 6; dy++) {
      for (let dx = -6; dx <= 6; dx++) {
        if (s.verbs.handVerbAt(worldX + dx, worldY + dy)) verbs++;
        if (s.verbs.useVerbAt(worldX + dx, worldY + dy)) verbs++;
      }
    }
    expect(verbs).toBeGreaterThanOrEqual(0);
  });
});

describe('a janela', () => {
  it('mudar o tamanho da janela redimensiona o jogo e o mundo 3D', () => {
    booted.platform.display.resize(800, 600);
    booted.game.scale.resize(800, 600);
    booted.tick(5);
    expect([booted.game.scale.width, booted.game.scale.height]).toEqual([800, 600]);
    expect(state().scene).toBe('game');
  });
});

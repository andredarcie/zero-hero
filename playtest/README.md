# Playtest harness

A structure for an agent (or a human) to **run the game and actually play it** in a real
browser, then save screenshots and a report for review.

> **Always headed, never headless.** The game renders through WebGL, and headless Chromium
> captures a black canvas (see `progress.md`). Every run opens a real, visible window. Do not
> "optimize" this to headless — you will get black screenshots.

## Quick start

```bash
npm run playtest            # default: smoke, explore, dialog, shop
npm run playtest -- all     # every scenario
npm run playtest -- dialog  # just one (or several: -- dialog shop)
npm run playtest:text       # the text-legibility captures
```

The harness boots its own Vite dev server, drives the game, and writes everything to
`playtest/results/run-<timestamp>/` (gitignored):

```
results/run-2026-06-24T13-05-22/
├── report.md         # human-readable: screenshots + state + pass/fail table
├── report.json       # same data, machine-readable
├── run.log           # full console log
└── screenshots/
    ├── smoke__00_intro.png
    ├── smoke__01_game-boot.png
    └── ...
```

Open `report.md` to see each captured step inline.

## A memória (a rodada longa não derruba a máquina)

O jogo no Chromium mais o Vite ocupam ~2 GB por cenário (medido: 1,7–2,2 GB). Com um navegador só para a rodada inteira, cada recarga do jogo deixava um pouco, e uma suíte longa acabava com a memória — o sistema matava tudo, relatório junto. Agora (`lib/memoryGuard.mjs`, `lib/processes.mjs`):

- **cada cenário roda num navegador novo**, fechado no fim (o próximo começa com a memória de volta, e sem o save do anterior: cada cenário é o mesmo que rodá-lo sozinho);
- **um cenário só começa com memória livre** acima do piso de partida (espera até 30 s; se não voltar, a rodada para limpa, com o resto pendente);
- **abaixo do piso de aborto, o navegador fecha na hora** e o cenário fica marcado como abortado;
- **o relatório é gravado a cada cenário**, com a tabela de memória (livre no início, menor livre, pico navegador+servidor);
- **todo navegador leva `--zh-playtest-owner=<pid>`** e o Vite fica em `results/.processes.json`: a rodada seguinte encerra o que uma rodada morta deixou (só processos cujo dono morreu).

```bash
npm run playtest -- zerar telescopio --budget=8   # não começa cenário novo depois de 8 min
npm run playtest -- --resume                      # continua a última rodada (só o que não terminou)
npm run playtest -- --resume=run-2026-11-09T15-17-39
npm run playtest:clean                            # encerra sobras de rodadas interrompidas
```

Saída: 0 tudo passou, 1 alguma asserção falhou, 3 incompleta (o log diz como continuar). Uma rodada por vez: duas em paralelo dobram a conta.

## How it plays the game

Walking blindly to a procedurally-placed NPC is flaky, so the GameScene exposes a small
deterministic control surface on `window.gameDebug` (defined in
`src/game/debug/debugHooks.ts`, wired up in `GameScene`):

```ts
window.gameDebug = {
  getState(),              // { scene, player, health, inventory, dialogOpen, ... }
  openDialog(kind?),       // pop an NPC dialog (default: long-text "blackCat")
  closeDialog(),
  listNpcKinds(),
}
```

It is only present while the GameScene is active and is cleared on scene shutdown. Real
keyboard input (arrow keys for movement, `Space` to advance dialog) is sent through
Playwright so movement and the typewriter are exercised authentically.

## Structure

```
playtest/
├── config.mjs            # central config (headed flag, viewport, timeouts, paths)
├── run.mjs               # orchestrator + CLI entrypoint
├── lib/
│   ├── devServer.mjs     # start/reuse/stop the Vite dev server
│   ├── GameDriver.mjs    # game-aware wrapper around a Playwright page
│   └── report.mjs        # logging + Markdown/JSON report writer
└── scenarios/
    ├── index.mjs         # registry + default sequence
    ├── smoke.mjs         # boot -> intro -> game
    ├── explore.mjs       # walk the hero around
    ├── dialog.mjs        # open + advance + close an NPC dialog
    ├── shop.mjs          # open + close the upgrade shop
    └── text-legibility.mjs  # focused intro/HUD/dialog text crops
```

### Writing a scenario

A scenario default-exports `{ name, description, needsGame, run }`. The orchestrator
navigates to `/` before each scenario (and calls `startGame()` first when
`needsGame: true`), then invokes `run({ driver, shot, assert, log })`:

```js
export default {
  name: 'my-scenario',
  description: 'What it checks',
  needsGame: true,
  async run({ driver, shot, assert }) {
    await driver.walk('right', 2);
    const state = await driver.getState();
    await shot('after-walk', { state });               // full canvas
    await shot('hud', { region: 'hud' });               // 'hud' | 'dialog' | 'full' crop
    assert('Still alive', state.health > 0, `hp=${state.health}`);
  },
};
```

Register it in `scenarios/index.mjs`.

## Configuration (env vars)

| Variable | Default | Purpose |
| --- | --- | --- |
| `PLAYTEST_BASE_URL` | _(unset)_ | Attach to an existing server instead of booting Vite. |
| `PLAYTEST_PORT` | `5173` | Port for the auto-started dev server. |
| `PLAYTEST_SLOWMO` | `50` | Playwright `slowMo` (ms) — higher = easier to watch. |
| `PLAYTEST_KEEP_OPEN` | `0` | Keep the window open this many ms after the run. |
| `PLAYTEST_MIN_FREE_MB` | 18% da RAM (≥ 2500) | Memória livre para COMEÇAR um cenário. |
| `PLAYTEST_ABORT_FREE_MB` | 10% da RAM (≥ 1500) | Abaixo disto, o cenário em curso é abortado (navegador fechado). |
| `PLAYTEST_BUDGET_MIN` | `0` (sem limite) | O mesmo que `--budget`: minutos até parar de começar cenários. |

Tip for a fast loop: run `npm run dev` in one terminal, then
`set PLAYTEST_BASE_URL=http://localhost:5173 && npm run playtest` in another — the harness
reuses the running server.

## Requirements

- Playwright's Chromium browser (already a dev dependency). If it is missing, install it
  once with `npx playwright install chromium`.

# Zero the Hero

Top-down pixel-art adventure. Phaser 3 drives the game logic, input and UI on a **transparent**
canvas; the world underneath it is **real 3D** (Three.js). Two modes: the adventure (`GameScene`)
and a Vampire-Survivors mode (`SurvivorsScene`).

## Workflow rules

- **All work happens on `main`. Never create a branch.** Commit straight to `main` and push there.
- **Commit messages are always in English**, even though the code comments and the game are in
  Portuguese.
- **Use semantic commits** (`feat:`, `fix:`, `perf:`, `refactor:`, `docs:`, `test:`, `chore:`) and
  write a real description, not a one-liner: say what changed, and *why* — especially the
  non-obvious part a reader would otherwise have to rediscover.

## Commands

```bash
npm run dev              # vite dev server
npm run typecheck        # tsc --noEmit
npm run lint             # eslint (scripts/worldgen has 3 pre-existing parser errors — ignore)
npm run build            # typecheck + vite build
npm run generate:world   # regenerate public/world.json
npm run playtest         # default scenarios
npm run playtest -- all  # every scenario
```

Port 5173 is often taken by another project. For playtests, start Vite on a free port and point the
harness at it:

```bash
npx vite --port 5180 --strictPort
PLAYTEST_BASE_URL=http://localhost:5180 npm run playtest -- perf-burn
```

## Verifying a change

The playtest harness (`playtest/`) is headed Playwright — it drives the real game and asserts on
real state. Add a scenario in `playtest/scenarios/` and register it in `index.mjs`.

- Always enter the game with **`?play`** (dev-only; skips the language pick, title and intro —
  keying past them is flaky).
- Do **not** drive the game through an MCP browser tab: a hidden tab freezes Phaser's rAF, so
  nothing advances and every timing is meaningless.
- Live handles in dev: `window.__scene` (the Phaser scene), `window.__game`, `window.hd3d` (every
  3D render knob, live-tunable), `window.gameDebug`, `window.__prof`.

**When measuring performance, always compare against `main` (`git stash`).** A number on its own
proves nothing — a fix that removes a stall can quietly cost frame time, and you will not see it
without the before.

## Profiler

`src/game/debug/Profiler.ts`. `?prof` boots with it running, **F3** toggles the HUD,
`__prof.report()` / `.csv()` dump the data. Per frame it records the real frame interval, CPU by
section, **real GPU time** (timer query), draw calls, live shader programs, lights, heap and
gameplay counters — and its spike log **names the cause** rather than just showing a number.

GPU time matters: fragment cost is invisible to a CPU clock (`composer.render()` only *submits*
work), so "one more light" or extra overdraw shows up nowhere else.

## The rendering rule that keeps biting

`src/game/render3d/World3D.ts` holds a **fixed, small** number of point lights, and nothing may add
or remove one at runtime. Two costs push the same way:

1. three.js bakes the light **counts** into every compiled shader's cache key. One
   `scene.add(pointLight)` mid-run invalidates *every lit material in the world* and recompiles them
   all — a ~550ms frozen frame. (This was the "travada ao queimar o arbusto" bug.)
2. Every light is evaluated by **every lit fragment**, and the patched shader does a world-space
   snap + flame wobble per light: ~0.35ms of frame time each. So the count must also stay small.

So a fire does **not own** a light — it **borrows** one. All lights are built in the `World3D`
constructor (`FIRE_LIGHT_SLOTS`); each frame the pool is aimed at the lit fires nearest the camera.
A fire that misses out keeps its glow quad, which is a *mesh* — meshes can come and go freely, only
lights cannot. `npm run playtest -- perf-burn` guards this.

## Other things that are easy to get wrong

- **Phaser does not auto-call `shutdown()`** — wire it via `events.once(SHUTDOWN, ...)` or a
  `scene.restart()` (death) leaks listeners across runs.
- **Scene edits do not hot-reload.** Phaser scene changes need a hard reload; the editor's
  `beforeunload` blocks the auto-reload, so you can sit there looking at stale code.
- **No sprite may overflow its tile.** 3D depth comes from the shader, never from scaling art up.
- **NPC dialogue lives in `public/world.json`**, not only in `NPC_DIALOGS` — a new NPC needs both.
- Materials with `onBeforeCompile` **must** set `customProgramCacheKey`, or differently-patched
  materials silently share whichever variant compiled first.

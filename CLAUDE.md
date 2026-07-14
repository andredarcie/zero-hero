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
npm run generate:lab     # regenerate public/lab.json (the puzzle lab's sandbox world)
npm run playtest         # default scenarios
npm run playtest -- all  # every scenario
```

Port 5173 is often taken by another project. For playtests, start Vite on a free port and point the
harness at it:

```bash
npx vite --port 5180 --strictPort
PLAYTEST_BASE_URL=http://localhost:5180 npm run playtest -- perf-burn
```

## The puzzle lab (`/lab`)

`/lab` is where puzzle ideas get built and validated without touching the real world. It is the
same editor as `/editor`, but pointed at its own sandbox file (`public/lab.json`) through
`/api/world?file=lab`. Build the puzzle, press **P** to play the in-memory world, **ESC** to come
back — nothing is saved until you hit Salvar, and Salvar only ever writes `lab.json`.

- `/lab?play` skips the editor and boots the sandbox straight into `GameScene` (how
  `npm run playtest -- lab-puzzles` enters — a scenario can override its entry route).
- `npm run generate:lab` rebuilds `lab.json` from `scripts/gen-lab.mjs`. **Author puzzles there**,
  not by hand-editing the JSON.
- **Keep the lab world tiny.** The first cut was 3×2 chunks and most of the solve run was the hero
  *walking between* puzzles. Walking is not a puzzle. It is now **one 12×12 chunk** — the camera
  frames ~one chunk, so the whole lab sits on a single screen and nothing needs a hike.
- **A puzzle is only a puzzle if the easy road is shut.** The first lava puzzle rested on the torch
  burning out on the way over — measured, that is a ~1s margin, i.e. a race, not an insight. Assert
  the *lock* (bare-handed, the ring must refuse the hero), not just the solution.
- The undead siege (`UndeadSpawnDirector`) is **off** in lab mode: skulls respawning around the hero
  mid-test are noise when the point is validating a puzzle, and they made the solve run flaky. So
  the lab cannot test anything that depends on darkness pressure — use the real world for that.
- The ESC return-to-editor handler is gated on the editor scene actually existing, because
  `/lab?play` has no editor to wake.

## Fire spreads (the one system the player steers)

Every other obstacle in this game is a **lock with exactly one key** — axe→tree, pickaxe→rock,
key→door — and `showNeedItemHint` then *shows you the icon of the key you are missing*. That table
is why puzzles here kept collapsing into "fetch item, use item, repeat": there is only ever one
right answer and the game hands it to you.

Fire is the exception, and the only place a real puzzle can live. `GameScene.scheduleFireSpread` /
`igniteFlammableAt`: a burning tile sets its 4-neighbours alight after `FIRE_SPREAD_MS`.

- **Fuel:** tall grass, dry bushes, and **built bridges** (they are wood — `WaterObject.burn()`
  collapses the deck into the river and the tile blocks again). Stone, water, lava and bare ground
  are firebreaks — which is what finally gives the scythe and the axe a use beyond opening their
  own tile.
- **A DEAD campfire catches from an adjacent flame.** That is the whole point: a fire can be lit
  without the hero ever standing next to it. Lay a path of fuel and let the fire walk there.
- **A LIT campfire never spreads.** It is a sink, not a source — otherwise every hearth would set
  its own meadow alight the moment it was lit, and the overworld would burn down on contact.
- Chains terminate because each object's `ignite()` refuses if it is already burning or spent.
- The light budget survives it: burning bushes *borrow* from the fire-light pool, so a cascade
  cannot move the light count. `perf-burn` guards this.

**Tall grass blocks the hero but conducts fire.** A grass corridor is a wall to you and a highway
to a flame — that asymmetry is where the lab's "O Pavio" puzzle comes from.

**Items should PRODUCE, not just DELETE.** This is the rule that keeps puzzles from collapsing into
fetch-and-use. A tool whose only output is *passage* is a password, not a tool. Compare:
`grass.cut()` and `door.unlock()` produce nothing, while `tree.chop()` yields a graveto — or a
bridge, depending on where you stood — which is why the axe was the only interesting item in the
game. So the pickaxe now drops a **stone** (`GameScene.dropStone`), and one stone **fords** a
bridgeSpot (`WaterObject.placeStone`). Stone is wood's opposite: both span a river, but a plank
deck is *fuel* and a ford never burns (`WaterObject.burn` refuses a ford). Every crossing is now a
question — do you want a **floor**, or a **fuse**? Ask that of any new item: what does it *make*?

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

**Unlock vsync for any perf measurement**: `PLAYTEST_UNTHROTTLED=1 PLAYTEST_SLOWMO=0`. With vsync on
a desktop GPU simply *downclocks* to meet the refresh — strip the whole post chain out of the frame
and the reported GPU time does not budge, because the hardware just did the smaller job more slowly.
Every variant then measures the same and every optimisation looks like it changed nothing.

## Proving a render change is invisible

`npm run playtest -- visual-ref` writes deterministic reference shots; `node playtest/compare-visual.mjs
<dirA> <dirB>` diffs them pixel by pixel. Two runs of the same build differ by **0 pixels**, so
anything the diff reports is real. Use it for every performance change that touches the renderer.

    git stash && npm run playtest -- visual-ref
    mv playtest/results/visual playtest/results/visual-main
    git stash pop && npm run playtest -- visual-ref
    node playtest/compare-visual.mjs playtest/results/visual-main playtest/results/visual

`VISUAL_ISOLATE=shadows` strips the frame back to the ground and the cast shadows with no post chain
— the bloom smears any local change across half the image, so it will tell you a shadow moved when
what moved was a mote of dust.

**The trap that will waste your afternoon:** three.js burns `Math.random()` draws on every object's
UUID. So a change that merely allocates a *different number of objects* at boot shifts the shared
generator — and every flame then gets a different seed and flickers to a different rhythm. A cast
shadow's LENGTH is driven by its flame's brightness, so two byte-identical renderers will "fail" the
pixel diff by 40% of the frame for a reason that has nothing to do with rendering. `visual-ref` pins
the seeds themselves for exactly this reason. If a diff looks structural, check the fire state first.

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
- **`prewarmShaders()` must run with the composer's render target bound.** The world is never drawn
  to the canvas — EffectComposer draws it into an offscreen target — and three bakes the target's
  *colour space* into the program's cache key. A prewarm that leaves the canvas bound compiles a
  complete, correct, useless set of programs the game never asks for, and the game then compiles its
  real set lazily, one 50–300ms freeze at a time. `perf-profile` fails if a single program compiles
  during play; a new billboard option shape must register a stand-in in `prewarmShaders`.
- A cast shadow's `mat.needsUpdate = true` on a texture swap looks like waste and is not: three only
  refreshes a material's uniforms when its version moves, so without it the hero's shadow freezes on
  one frame of his walk cycle while he walks.

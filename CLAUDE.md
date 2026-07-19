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
npm run generate:levels  # regenerate public/levels/level-*.json + index.json (the puzzle levels)
npm run playtest         # default scenarios
npm run playtest -- all  # every scenario
```

Port 5173 is often taken by another project. For playtests, start Vite on a free port and point the
harness at it:

```bash
npx vite --port 5180 --strictPort
PLAYTEST_BASE_URL=http://localhost:5180 npm run playtest -- perf-burn
```

## The puzzle levels (`/levels`) and the lab (`/lab`)

Each puzzle is a **self-contained level** — a 12×12-chunk world in `public/levels/level-N.json`
(WorldData format, `meta.puzzle: true`), listed for the player by `public/levels/index.json`. The
title's **"Jogar levels"** reads that manifest and boots the chosen level (`LevelSelectScene` →
`setWorldData` → `GameScene`). A shareable/dev deep link is `/?level=N` (skips the menu). There is
ONE level today: `level-1` **"A Espada na Pedra"** — every carriable item (all 11) in one screen,
chained so each tool *produces* the next step's input (scythe→seeds→planted grass, axe→TIMBER log-bridge,
stick→torch, stone→basalt→boots, bomb→jail→pickaxe, fire-fuse→key, key→floodgate, bucket→dark→
moonflowers→sword). Its two signature locks: the *Quarteirão em Chamas* — a lava-walled region you
enter over lava with the boots but can only carry cargo OUT of by quenching a wall with a jail
stone (one hand: boots carry only YOU, so a boots-only zone can never export an item otherwise) —
and the sanctum douse tile (10,10), reachable only through the floodgate door, so wading the moat
with boots can't bypass the key. The playtest `espada` asserts every lock bare-handed AND scripts
the full solve.

`/lab` is where a level gets built/validated without touching the real world — the same editor as
`/editor`, pointed at a level file (`public/levels/level-N.json`) via `/api/world?file=level-N`.
`?level=N` picks which (default 1). Build, press **P** to play the in-memory world, **ESC** to come
back; nothing saves until Salvar, and Salvar only writes that one level file.

- `/lab?play` boots the level straight into `GameScene`. Playtests enter levels via `/?play&level=N`
  (the `espada` scenario) — a scenario overrides its entry route.
- `npm run generate:levels` rebuilds the level files + `index.json` from `scripts/gen-levels.mjs`.
  **Author puzzles there** (funny, puzzle-appropriate names in the manifest), not by hand-editing JSON.
- **The game is walk-only — there are NO gameplay buttons at all** (only movement; overlays/menus
  are UI). Everything activates by stepping or bumping. Placements have walk-on affordances: a
  `bombSpot` (breathing purple ghost-bomb) plants the carried bomb on step; with the wrong item
  in hand the step pops the need-item balloon. Author a bombSpot where the blast must happen —
  its 2.2-tile radius must cover everything that blast is for. The upgrade shop (adventure only)
  is the Souls bonfire: bump a LIT campfire with anything that isn't a douse (bucketFull) or a
  torch-light (wood) and it opens — the E key is gone.
- **The farming loop (`plantSpot` + seeds).** The scythe's product is SEEDS (sprites from the
  sprite factory). Step on a dug hole (`plantSpot`) carrying them to sow; the mound rises when
  the hero steps OFF (a dome must never be born blocking under his feet — the dropped-item
  arming rule); bump the mound with `bucketFull` to water; after ~3.5s REAL tall grass sprouts
  (a `TallGrassObject` pushed into `tallGrasses` — blocks, conducts fire, falls to the scythe
  for seeds again). Consume that grass and the hole reopens: renewable, placeable fuel — a burnt
  fuse is never a dead end. Hay/haySpot are gone; seeds replaced them.
- **A level is ALWAYS exactly one 12×12 chunk — the standard, original size. Never bigger.** No
  multi-chunk levels (no 24×12, no 24×24). The camera frames ~one chunk, so the whole level sits on
  a single screen and nothing needs a hike — walking is not a puzzle. `makeLevel` in
  `scripts/gen-levels.mjs` is single-chunk on purpose (no size parameter) so this can't be
  bypassed; if a puzzle doesn't fit in 12×12, cut it down, don't grow the map.
- **Each level is independently solvable.** Its own `playerStart` and its own **home campfire**
  (lit, nearest the spawn — that's how the runtime picks which fire is born lit); every other
  campfire stays dead. Only the tools that level's puzzle needs.
- **A puzzle is only a puzzle if the easy road is shut.** Assert the *lock* (bare-handed, the ring
  must refuse the hero), not just the solution.
- The undead siege (`UndeadSpawnDirector`) is **off** for a puzzle world (`appMode === 'lab'` OR
  `meta.puzzle`, via `isPuzzleWorld()`): skulls mid-solve are noise and made the run flaky. So a
  level cannot test anything that depends on darkness pressure — use the real world for that.
- The ESC return-to-editor handler is gated on the editor scene actually existing, because a level
  played from the title / `/?level=N` has no editor to wake (there ESC opens the pause menu, which
  offers **back to levels / restart / quit to the title** when a level is active).
- **A level run shows two floating square buttons top-right on every device** (`LevelButtons` in
  `PauseMenu.ts`): restart (↻, two-tap arm like the pause menu's destructive entries) and pause.
  A puzzle can be spent into a corner, so restarting must be advertised, not buried in ESC — a
  hint pill ("Travou? ↻ recomeça o level") shows on boot and doubles as the arm-confirm prompt.
  The adventure keeps only the discreet touch-only pause button.

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

## The robotic arm (`inserter`) — the one thing that moves an item without the hero

`src/game/objects/RoboticArmObject.ts`. A Factorio-style inserter: it takes whatever item lies on
the tile **behind** it and puts it on the tile **in front**, by itself, on a ~1.5s cycle (reach →
grip → swing → release → return). Everything else in this game that moves cargo needs the hero's
one hand; this doesn't — and its own body is **solid**, so what it really does is hand an item
across a line the hero has to walk around. That is the whole reason it earns a place: *an item can
reach where the hero cannot.*

- **The arm is RIGID and ROTATES — it never stretches.** Like Factorio, where an inserter's speed
  is literally an *angular* velocity: the hand rides a fixed-radius arc (`ARM_RADIUS` = 1 tile)
  half a turn from origin to destination, passing beside the machine. The first version moved the
  hand in a straight line between the two tiles, which could never look attached — at mid-travel
  the hand sits exactly on the base, i.e. the arm has length **zero**. Rotation is what makes a
  constant-length arm possible, so it is a precondition for the linkage, not a style choice. The
  sweep always passes the side that reads *up* on screen; sweeping under would hide the hand and
  its cargo behind the machine's own body at the very moment of the gesture.
- **Anatomy: base → upper arm → forearm → claw**, two SOLID rectangles with a bending elbow, like
  the real inserter. Each part is ONE stretched quad, not a row of small blocks — a machine part
  is one part. This works because a billboard here is **not** camera-facing by `lookAt`: it is a
  plane in the world's (X, elevation) axes and the camera never yaws, so `rotation.z` rotates
  exactly in the screen plane. `layBar` places a quad at the midpoint of two joints, sizes it to
  the on-screen distance and rotates it to point along them. Depth is folded in through
  `depthToScreen` (derived from `camHeight`/`camBack`) — without it a north-pointing arm would
  compute a length of zero and vanish. The sprite is full-bleed for the same reason: a
  transparent margin would stretch too and the bar would fall short of its joints.
- **The elbow must actually bend, so the arm FOLDS.** Rotating at a constant radius gives a
  constant elbow angle — that is a rigid arm whose parts never move relative to each other. The
  wrist retracts (`FOLD`) as it passes the machine and extends again to reach the tile, which is
  what makes the two parts read as two parts. The elbow comes from 2-link inverse kinematics
  (`poseArm`) solved in the vertical plane through shoulder and wrist; `UPPER_LEN + FORE_LEN`
  must exceed the maximum reach or the solution clamps and the elbow locks straight.
- **The bend plane LEANS SIDEWAYS as the arm points into screen depth** (`ELBOW_SIDE`). A bend in
  the (radial, vertical) plane projects to ZERO when the radial direction is the view-depth axis:
  a north/south arm — half of all placements — collapsed into one vertical line (a lamppost), and
  mid-swing passes north, so the fold's most dramatic moment was exactly the invisible one. The
  fix rotates the perpendicular the elbow displaces along toward the world-lateral axis by
  `|sin(angle)|`; a normalized blend of two unit vectors perpendicular to the shoulder–wrist line
  is still perpendicular, so both link lengths stay exact and the joints-meet playtest holds.
- **Direction is a FRAME, never a rotation.** A billboard has no yaw — `Billboard3D.setAngle`
  spins in the *camera* plane (`mesh.rotation.z`), which would tilt the art instead of turning it.
  So the sheet holds 4 frames (0=N 1=L 2=S 3=O) and `dir` indexes the art directly. Any future
  prop with a facing must do the same.
- **Its own parts z-fight unless they are ordered.** A quad here is a plane at `z = tileY`, so two
  parts of the arm sharing a tileY land in exactly the same plane and strobe where they overlap —
  `DEPTH_LAYER` all over again, but *inside* one object (`ItemPickup` does the same for its 8 rim
  copies). Each part gets a small push toward the camera in the order it must read: body, upper
  arm, forearm, hand, cargo in front. Any future prop assembled from several billboards needs the
  same internal ordering.
- **Idle = arm HIGH breathing, refusing = LEANING and trembling, working = arm dipped.** It only
  descends when there is cargo on the origin, and the rest pose is well off the ground so the
  states read at a glance; a rest pose close to the floor made the dip a half-pixel twitch. The
  parked claw bobs slowly (`IDLE_BOB` — the bombSpot ghost's grammar: an invitation is a living
  thing, not a photograph), and when the input holds an item the arm cannot deliver (output
  blocked/occupied) it eases down to `STRAIN_ELEV` and shivers over the waiting cargo — without
  that posture, a blocked output and a broken machine were the same image. `playArmGrab`
  (synthesised, no sample) fires when the claw closes on cargo — short and quiet on purpose,
  since a row of arms repeats it forever.
- **The hand parks in the air over the ORIGIN tile, with its contact shadow on the ground below.**
  That shadow is the affordance — "put something here and something happens", the same grammar as
  the bombSpot's breathing ghost — and stepping onto that tile carrying anything deposits it
  (`handleTileEntered`). Without that, an arm would be *unfeedable*: see the walk-only note below.
- **`dir` is the first per-placement field that is NOT droppable.** `lit`/`floodgate` are authored
  in gen-levels and an editor save is allowed to lose them; a rotation is placed by hand and *is*
  the behaviour. So `EditorStore` carries `dir` through place/erase/undo — including `sameEntity`,
  which compared only type+position and therefore made "rotate in place" a silent no-op.
  In the editor: **G girar** (not R — R is the rectangle tool). `UI_STATE_KEY` went to v4 with it.
- **The claw is a separate billboard that TRAVELS, and it HANGS fingers-DOWN.** The arm must reach
  the neighbouring tile, but no sprite may overflow its tile — so the base keeps its tile and a
  second one-tile quad moves. What travels is the *position*, never the scale. It also hovers
  (`HAND_HOVER`), which keeps it off the `ground` depth layer where it would strobe against the
  very pickups it is reaching for. The claw art (v4) has its node on TOP and the pincers opening
  downward — a claw that dives onto floor items, not the sky-facing V it used to be — and the quad
  hangs `NODE_UP` below the IK wrist, so the forearm arrives from above and dies at the node:
  no geometry can lay the bar across the pincer's mouth anymore (the defect that killed five
  drawings and that `CLAW_AHEAD` merely dodged). Consequence: `HAND_GRAB` is a WRIST height —
  the wrist stops a claw-length above the item and the fingers do the last stretch.
- **The arm casts ONE shadow: its projected SKELETON.** All three shadow systems (contact blob,
  fire-cast silhouette, baked moon-cast) assume a prop STANDING at its tile — and the arm's limbs
  float between joints, so per-part shadows always shatter: blobs made a dotted line, plan-projected
  strips drew a zenith sun that exists nowhere in the scene, and per-bar `castGroundShadow` sprouted
  streaks where the bars aren't (the cast is elevation-blind). `World3D.groundCastAt(x, z)` exposes
  the standing-sprite stylization (nearest lit flame + moon handoff, via castTransform/handoffCast)
  as a projector — a point at elevation e shadows at `plan + dir · e · unitLen` — and the arm chains
  one `ShadowStrip` per limb between its projected joints (shoulder→elbow→wrist→fingers). Connected
  by construction, it GROWS OUT of the base sprite's own cast silhouette and breathes with the
  flame. The claw keeps its pinned contact blob (the deposit-here mark, the hero's own grammar) but
  opts out of the per-sprite cast with `castGroundShadow: false`.
- **Cargo draws BEHIND the claw, and it HANGS — it is not welded.** `DEPTH_ITEM` sits between
  forearm and hand: the shut claw is a band across the item, the open claw spreads its fingers
  over it. The first version drew cargo in front of everything, and at the only moment the
  machine exists to be seen the item covered the whole claw — a flying item with an arm behind
  it. The carried item is also a pendulum (`CARGO_*`, underdamped spring driven by the wrist's
  tangential velocity): it lags the swing, tilts on its invisible string and settles with a
  wobble on arrival. Only the screen-X component is applied — a depth swing is invisible and
  would corrupt the cargo-behind-claw draw order.
- **It refuses rather than stacks.** If the output tile is blocked or already holds an item, the
  arm idles: the ground keeps one item per tile, and two would be a silent disappearance.
- **Why stepping on the origin has to deposit.** The game is walk-only: with no drop button, the
  hero can otherwise only put an item down by *swapping* with an item already on that tile — so an
  arm's empty origin could never receive cargo, and the machine would be unfeedable. Walking onto
  the origin tile therefore hands over whatever the hero carries. (A tool's PRODUCT still works
  too: `dropStone`, the axe's graveto and the scythe's seeds land on a tile by themselves.)
- `npm run playtest -- braco` guards all of it. It enters `/lab`, places the four rotations through
  the real `EditorStore`, presses P, and asserts the transfer — the authoring path, because that is
  what the piece is for.

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
- **Anything the hero can STAND ON must declare `depthLayer: 'ground'`** (`DEPTH_LAYER` in
  `Billboard3D.ts`). Two upright billboards on one tile are camera-facing quads at the same spot,
  i.e. exactly coplanar: the depth test has no winner, so it flips per pixel per frame and the
  pair strobes (the item blinking out under the hero's boots). It is not a bug in any one prop —
  it is what coplanar geometry does — so patching it prop by prop with a hand-placed nudge only
  moves it around. The layer pushes ground clutter a hair down the view axis, deterministically.
  Already declared: every ItemPickup + its rim, coins, hearts, survivors pickups, the bombSpot
  ghost, a planted bomb, grass mown to stubble (`setDepthLayer('ground')` the instant it stops
  blocking). Flat quads (holes, blooms, water) are exempt — they separate by `flatY`.
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

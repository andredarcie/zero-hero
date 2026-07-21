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
#  NEVER run `npm run generate:levels` — it OVERWRITES the hand-authored levels. See the warning below.
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
`setWorldData` → `GameScene`). A shareable/dev deep link is `/?level=N` (skips the menu).

## ⚠️ THE LEVELS ON DISK ARE HAND-AUTHORED. NEVER RUN `npm run generate:levels`.

`scripts/gen-levels.mjs` writes `public/levels/level-1.json` and `index.json` **unconditionally**
(no merge, no prompt). The levels shipping today were built BY HAND in `/lab` and are not what that
script produces, so running it destroys them. It stays in the repo as scaffolding for a brand-new
level, and only after its output path is pointed somewhere unoccupied.

Today: `level-1` **"O fogo que ajuda atrapalha"** (fire + boiler + wire + robotic arm + swing gate
→ portal; pickaxe, bucket and axe) and `level-2` **"Fogo"** (a work in progress). **Read the JSON,
never this file, for what a level contains** — a hand-authored level changes whenever its author
opens the lab, and any prose here describing its layout starts rotting the same day.

That has a consequence for tests: **a playtest must AUTHOR the fixture it needs** (enter `/lab`,
place props through `EditorStore`, press P) instead of relying on a level already containing one.
`braco`, `caixa-ferramentas`, `portao-de-bater` and `fios` all do this and are immune. The two
that still read level-1's old content — `espada` (it scripts the full solve of "A Espada na Pedra",
a level that no longer exists) and `itens` (it needs a `plantSpot` level-1 no longer has) — are
**stale by design change, not broken by a regression**. Do not "fix" them by editing the level.

`/lab` is where a level gets built/validated without touching the real world — the same editor as
`/editor`, pointed at a level file (`public/levels/level-N.json`) via `/api/world?file=level-N`.
`?level=N` picks which (default 1). Build, press **P** to play the in-memory world, **ESC** to come
back; nothing saves until Salvar, and Salvar only writes that one level file.

- `/lab?play` boots the level straight into `GameScene`. Playtests enter levels via `/?play&level=N`
  (the `espada` scenario) — a scenario overrides its entry route.
- **Puzzles are authored in `/lab`, by hand, and saved with Salvar** — not in `gen-levels.mjs`
  (see the warning above: that script would overwrite them).
- **The game is walk-only — there are NO gameplay buttons at all** (only movement; overlays/menus
  are UI). Everything activates by stepping or bumping. Placements have walk-on affordances: a
  `bombSpot` (breathing purple ghost-bomb) plants the carried bomb on step; with the wrong item
  in hand the step does nothing — the mark's own art is the invitation. Author a bombSpot where
  the blast must happen — its 2.2-tile radius must cover everything that blast is for. The upgrade shop (adventure only)
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
key→door. That table is why puzzles here kept collapsing into "fetch item, use item, repeat":
there is only ever one right answer.

**The game no longer NAMES that answer.** There used to be a need-item balloon: bump a lock
empty-handed and a speech bubble popped over the hero with the icon of the key you were missing.
It is gone — table, art, every call site. A locked thing still answers a bump, but only
physically: the rock shudders, the door rattles, the gate strains against what is behind it. The
hero says "this did not work", never "fetch the pickaxe". Removing it is the same bet the swing
gate makes: the world teaches, the HUD does not. **A new locked prop gets a shake, not a hint** —
if the only way a player could know what to do is a caption, the prop's art is what needs
fixing.

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
game. (Felling a pine *tile* with the steel axe drops a graveto for exactly this reason.)
So the pickaxe now drops a **stone** (`GameScene.dropStone`), and one stone **fords** a
bridgeSpot (`WaterObject.placeStone`). Stone is wood's opposite: both span a river, but a plank
deck is *fuel* and a ford never burns (`WaterObject.burn` refuses a ford). Every crossing is now a
question — do you want a **floor**, or a **fuse**? Ask that of any new item: what does it *make*?

## The two axes, and why the world's edge had to become the sea

There are two axes, and the second one is the only item in the game that edits **terrain**.

- **`axe` — "Machado".** Unchanged. It bites **dead wood only**: the `dryTree` prop (6 stages,
  regrows, TIMBER log-bridge) and the `dryShrub`.
- **`greatAxe` — "Machado de Aço".** Fells **any tree**, and is a strict **superset** of the plain
  axe (both go through `GameScene.holdsAnAxe`). That matters: if the steel axe did not cut dead
  wood, finding it could *soft-lock* a puzzle built around the plain one. A new tool must never
  invalidate the tool the player already has.

**Most trees in this world are not props — they are tiles.** `world.json` holds 846 pine tiles in
the upper layer (frames 4/14/15/16/17) against 69 props *in total*, and `World3D` merges every
standing tile into ONE static mesh. That is the whole reason a forest costs one draw call, and it
is why "cut any tree" could not be solved by adding a `TreeObject`: 846 billboards with contact
blobs and cast shadows would be a serious perf regression. So the steel axe removes the **tile**:

- `CHOPPABLE_UPPER_FRAMES` (constants) says which standing frames are wood. Deliberately not all
  of `SOLID_UPPER_FRAMES` — 22 (spiked head) and 25 (tomb) stand up the same way but are masonry.
- `GameScene.fellTreeTile` clears **both** `chunk.upper` *and* `chunk.collisions` — the worldgen
  paints an explicit collision under every obstacle frame, so clearing only the frame leaves an
  invisible wall. Those chunk arrays are the same ones `WorldData` holds, so the edit persists for
  the run.
- `World3D.removeSolidTile` un-bakes the tile from the merged buffers in place rather than
  rebuilding them: it collapses the quad's four vertices onto a point (a degenerate triangle draws
  nothing) in the solids mesh and in the contact-blob mesh, re-bakes the **ambient occlusion** the
  tree printed on its neighbours (or the new clearing keeps the shadow of a tree that is gone),
  drops it from `castableSolids`, and re-fills the moon cast. Rebuilding a ~6000-quad buffer per
  swing would hitch; this is the `grassQuads` rustle trick applied to three buffers at once.
- **It comes down in STAGES, like the dryTree prop** — whole tree → crown gone → stump → open,
  three swings, and it BLOCKS until the last one. The prop shrinks through its own 6-frame sheet
  (woods.png); a tile cannot, because the merged mesh samples the tileset atlas, so the stages
  have to be frames of that atlas too (`TREE_CHOP_STAGE_FRAMES` = 36, 37, drawn by the sprite
  factory from the shipped pine's own palette). The two stages are **shared by all eight** tree
  frames: at 16×16 a stump keeps no silhouette saying which pine it came from, and eight private
  ladders would be sixteen frames saying one thing. `World3D.setSolidTileFrame` swaps the quad's
  `uv` **and** `aUvBounds` in place (the bounds are not optional — they are the window the
  texel-AA fetch may sample, and leaving them stale lets the filter slide into the next tile's
  art), and re-bakes the moon cast so a stump stops throwing a whole tree's shadow.
- Felling drops a graveto **only ~25% of the time** (`TREE_TILE_STICK_CHANCE`). A tile tree is
  not the dry tree's equal: there are ~850 of them against 8 dryTree props, and if every one paid
  out, the map would become an infinite fuel dispenser and flatten the fire economy that the
  scythe, the planting loop and the dryTree's own regrow timer exist to meter. It still PRODUCES
  (see the rule above) — just not on demand, so wood stays worth walking for.
- Refusing a pine is **silent**, with the plain axe or bare-handed. It was the last place the
  game said out loud that there are two axes; now the player learns it by swinging — the steel
  axe fells what the plain one cannot. Same price every other lock pays.

**The border is the sea, and that is a consequence of the steel axe, not a decoration.** The world
edge used to be a wall of **pine tiles** (`WorldData`'s old `VOID_WALL_FRAME = 4`) — made of the
exact thing the new item exists to destroy, so a player could chop a doorway and walk off the map.
The fix is not to special-case the axe at the edge (a border you must remember to defend will be
forgotten by the next feature) but to build the border out of something **no item answers**:

- Out-of-bounds chunks are ground frame `SEA_TILE_FRAME` with no upper layer and collision
  everywhere. Collision comes from `SOLID_GROUND_FRAMES` (the floor's mirror of
  `SOLID_UPPER_FRAMES`), which is **unconditional** — so the sea blocks even the **lava boots**,
  which wade every other hazard. Nothing in the game removes water: the bridge, the ford and the
  boots all *cross* a river tile, and none of them apply to a ground frame.
- "Mar" is also paintable in the editor's **Chao** group, and blocks there by the same implicit
  rule (the editor draws it in the same amber as an implicitly-solid tree).
- The sea borrows the river's **sunken bed and earthen banks**; those banks are the coastline.
  Without that it reads as blue floor, not water.
- It ships **three interchangeable frames** (33/34/35, the same grid cyclically shifted), picked
  per tile by a hash of the coordinate in `World3D`. The river gets away with one tile because it
  is ~30 of them; the sea covers thousands, and one frame repeated that far stops reading as water
  and starts reading as a **grid**. Only `SEA_TILE_FRAME` is ever stored in world data — the
  variants are art, chosen at build-mesh time, and cost nothing because the frame already travels
  per vertex (`aUvBounds`).
- `VOID_MARGIN_CHUNKS` stays at **1**, measured: a second ring of ocean cost ~9% more triangles
  (53.1k vs 48.8k on main, frame p50 6.9ms vs 6.1ms). One ring lands at 40.2k — *under* main —
  because the void used to carry an upright pine quad per tile plus its blob and its cast shadow,
  and open water carries none. The border got cheaper by becoming flat.

`npm run playtest -- machado` guards all of it: the sea blocks (boots included), the steel axe
cannot open the border, the plain axe cannot fell a pine, the steel axe walks it down the stage
ladder (blocking at every stage until the tile really opens, collision too), the graveto rate
sits near 25%, and the steel axe still cuts dead wood. The stage asserts chop until the tile
CHANGES rather than counting keypresses — the first key after a teleport is swallowed by the
just-interrupted movement controller, so counting presses would measure the input, not the ladder.

**A new terrain tile is a new FRAME in an existing atlas, not a new file.** Ground/upper index
frames of `forest_tile_set.png` (3 columns, row-major) and the whole ground is one mesh sampling
that one texture. `node spritefactory/install-tile.mjs <name> <tileset> <frame>` installs a built
sprite into it, growing the sheet by appending rows — **only** appending, since frame ids are
positional and inserting would silently re-point every tile already authored in `world.json`.

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
- **Cutting the power UNDOES the delivery — that is the anti-dead-end guarantee.** An unpowered
  arm is still dead (it does not scan, dip or pick anything up), but if it *did* carry something
  across while it was live and that item is still sitting on the output tile, losing power sends
  it to fetch that item and put it back on the input tile, once, and only then does it stop —
  parked over the input like always. This exists because the arm is the one piece that can place
  an item where the hero cannot reach, so it is the only piece that can strand a puzzle for good;
  with the undo, every delivery has a way back and the puzzle becomes *when* to switch the power
  on and off instead of "careful, this is irreversible". Consequences: cutting power with the
  cargo still IN the claw also undoes (it goes back to the tile it came from — freezing there
  would trap the item in the hand forever), and a forward gesture already in flight is ABORTED,
  never completed, when the power dies with nothing owed. The undo runs at `REVERSE_RATE` (0.62)
  so grey-and-slow reads as "this is going backwards", not "this is working".
- **The debt is ONE item and it forgives itself.** Not a history: the ground keeps one item per
  tile, so what this arm left stranded is at most whatever is on its output tile right now. If
  that tile empties by another hand, the debt is cleared at the next rest (`owed` in
  `RoboticArmObject`) — the player already has the item, there is nothing to undo, and a machine
  that kept owing would later kidnap an item it never delivered. An arm with no variable and no
  wire is self-powered, never sees power drop, and is therefore the one variant with no undo.
- **Why stepping on the origin has to deposit.** The game is walk-only: with no drop button, the
  hero can otherwise only put an item down by *swapping* with an item already on that tile — so an
  arm's empty origin could never receive cargo, and the machine would be unfeedable. Walking onto
  the origin tile therefore hands over whatever the hero carries. (A tool's PRODUCT still works
  too: `dropStone`, the axe's graveto and the scythe's seeds land on a tile by themselves.)
- `npm run playtest -- braco` guards all of it. It enters `/lab`, places the four rotations through
  the real `EditorStore`, presses P, and asserts the transfer — the authoring path, because that is
  what the piece is for. It also authors a FIFTH arm bound to a variable with no producer (the four
  others are self-powered and can never be switched off) and drives the undo end to end: dead and
  owing nothing it ignores the cargo, live it delivers and takes on the debt, cut it fetches the
  item home, and once square it goes inert again — a fresh item dropped on its output is NOT
  dragged back, which is the assert that keeps the undo from degenerating into a reverse conveyor.

## The toolbox (`toolbox`) — the one thing that makes an item OUT OF other items

`src/game/objects/ToolboxObject.ts`. Four tiles in a line, derived from `dir`:

    (item A) (item B) [CAIXA] (resultado)

Drop an item on each of the two slot tiles behind it; if the pair is a **recipe**, the machine
eats both and spits a third item onto the tile in front.

**The rule is HAFT + HEAD, and it caps itself.** One head material makes one tool:

| receita | de onde vêm os insumos |
|---|---|
| `graveto + pedra = machado` | árvore (axe) + pedra (pickaxe) |
| `graveto + ferro  = foice`  | árvore (axe) + **pedra de ferro** (pickaxe) |

Because the pair is unordered, `graveto + X` can only ever mean ONE tool — so the number of
craftable tools is the number of **materials**, never the number of ideas. Growing the tree means
adding raw matter, not adding lines to `TOOLBOX_RECIPES`.

**Why the iron makes the SCYTHE and not the pickaxe.** Iron comes out of an ore rock, and rock is
what the pickaxe breaks — so a recipe producing the pickaxe would need the pickaxe to reach its
own ingredients. Circular, and therefore worthless in any level that doesn't hand you a bomb to
open the first vein. `picareta → ferro → foice` is a staircase that always goes up, and the scythe
PRODUCES (seeds), which is what the project asks of anything new.

Recipes that are traps, and why: **key** (kills every locked door and the floodgate in one line),
**sword** (level-1's entire moonflower chain exists to award it), **`pedra + pedra = fogo`**
(sounds clever, guts the torch's timed round trip), **`graveto + graveto`** (two sticks already
mean *bridge* in this game's vocabulary).

- **Why it earns a place.** "Items should PRODUCE" has always been satisfied by props: the tree
  gives a graveto, the rock gives a stone, the grass gives seeds — the world is the only factory.
  The toolbox inverts the source: here the *items* are the input and the map contributes nothing.
  It is the only place where the answer to "I don't have the axe" can be **"then make one"**, and
  it gives gravetos and stones a destination beyond local consumption.
- **`TOOLBOX_RECIPES` is order-independent.** Requiring "the stick in the back tray" would be an
  invisible rule, and an invisible rule is the same sin as the deleted need-item balloon:
  information that only exists outside the world.
- **The slots deposit on step, exactly like the arm's origin tile, and for the same reason.** The
  game has no drop button — the hero only puts something down by *swapping* with an item already
  on that tile — and both trays start empty, so a toolbox would otherwise be unfeedable. The tray
  drawn on the ground BREATHES while empty and goes still and gold when loaded (the bombSpot's
  grammar): reading "one still missing" is just seeing which of the two is still pulsing.
- **A robotic arm can feed it, for free.** An arm whose output tile is a toolbox slot runs the
  factory unattended. No code was written for that — the two pieces just speak the same language
  (items lying on the ground), which is the point of keeping everything on tiles.
- **The refusal is PHYSICAL.** A pair that is not a recipe makes the lid jump and slam back with
  a dull iron thud, every ~2.5s — not continuously, or it becomes background noise. The player
  sees the machine TRY and give up; it never says what is missing. Same answer when the output
  tile is occupied: "not now" is the honest word for both, and distinguishing them would be the
  hint balloon back under another name.
- **It refuses rather than stacks, and it revalidates at delivery.** The output check at the start
  of the cycle can go stale over the ~2.3s it takes — so if the tile is taken mid-forge the
  finished item stays VISIBLE inside the open, still-glowing box until the spot frees. You can see
  the axe waiting in there.
- **The inputs are taken at the FIRST frame of the craft**, not at the forge: leaving them on the
  ground would open a window where the hero (or an arm) walks off with one while the machine is
  already working, and the box would produce out of nothing.
- Four beats, ~2.3s, and each one is a pixel-art pose swap, never a scale/fade: lid opens (240ms)
  → both items arc in and shrink to nothing (460ms) → **the forge** (900ms: hot frame, gold glow,
  three hammer blows with sparks, tremble that peaks mid-cycle) → the product arcs out and lands
  (420ms) → lid closes. Sprite Factory owns `toolbox.png`: 4 body poses + 2 tray states, 0 FAIL /
  0 WARN. The arched handle with a see-through gap is what separates its silhouette from the
  wooden crate; the base never changes between frames so opening reads as movement, not as a
  different object appearing.
- **Its parts need internal depth ordering** (`DEPTH_GLOW`/`DEPTH_ITEM`) — the same trap as the
  arm's. An east-facing box has its slots, body and output on the SAME `tileY`, so the flying
  cargo and the forge glow land in the body's own plane and either strobe or vanish behind it.
- The body is SOLID (bumping it rattles the tools inside), and `dir` travels through the editor's
  place/erase/undo like the arm's. It is the second directional prop, so it took the **G** key for
  free — but its frames are lid poses, not directions, so the board draws a **prow nub** on the
  chip instead of a direction frame (`hasDirectionFrames` vs `isDirectionalProp`). The editor
  warns when a slot or the output lands on collision, the world edge or another solid prop.
- `npm run playtest -- caixa-ferramentas` guards all of it: the four rotations derive the right
  three tiles, the body blocks, stepping on a tray deposits, the axe is manufactured and both
  inputs are consumed, a wrong pair is refused without producing anything, a blocked output holds
  the product until the tile frees, and the whole iron chain runs end to end.

### The ore rock (`ironRock`) and the iron block (`iron`)

The second raw material, and the prop that yields it. `ironRock` is **the same `RockObject`** with
`ore: true` — same two pickaxe blows, same recoil, same collapse, same collision, and the bomb
shatters it exactly like any boulder. What changes is the art and the drop.

- **It must not take a third blow.** An ore rock that costs one more swing is the same decision
  taken more slowly; the difference has to live in what comes OUT, never in the timing.
- **One class, not a subclass.** The difference fits in a boolean, while two classes would mean
  two copies of the recoil, the collapse and the collision contract — the reliable way for them to
  disagree a month from now. Same reasoning as `isTileOccupied` being shared by the crate and the
  swing gate.
- **`GameScene.dropRockSpoil` exists because TWO paths shatter rock** — the pickaxe and the blast —
  and they had already drifted once. With the rule written in two places, an ore rock opened by a
  bomb would calmly drop an ordinary stone.
- **The art is the plain rock's grid, pixel for pixel, with ore painted into it.** Both frames are
  literal dumps of `rock.png` / `rock_cracked.png`: the player has to recognise the boulder to
  think of the pickaxe. The ore is drywood BROWN against the lavender stone — a HUE contrast, which
  survives the night (the dark eats luminance, not warm-vs-cool). The cracked frame runs the vein
  along the fissure, so the crack promises the next blow instead of just recording the last one.
  The chips it throws are rust-tinted (`ORE_CHIP_TINTS`), so the blow reads different before the
  item even lands.
- **The iron block is the first item with NO use of its own.** Stone fords a river and quenches
  lava; a stick bridges and carries fire; iron only ever goes into a toolbox tray. That is
  deliberate — the bench needed an input whose only reason to exist was the bench, or every recipe
  would compete with its own ingredients' direct uses. It is also the only item whose ITEM GET
  caption points at another machine, because "I picked up a lump of metal and it does nothing" is
  otherwise the correct reading, and it is wrong.

## The pressure plate (`pressurePlate`) and the undead that WANTS it

A plate is the oldest circuit producer and the simplest: it needs a **body** on it. Three things
count, and always have — the **hero**, a pushed **crate**, and **any enemy**
(`GameScene.updateMechanismCircuits`). The first two are the problem the plate poses: the hero has
one pair of feet and needs them somewhere else, and a crate only goes where there is room to shove
it. The third used to be an accident of the occupancy test. Now it is the piece.

**A skull is drawn to a pressure plate.** If one is inside its sight radius (the SAME
`DETECTION_RANGE` it hunts the hero by — "what a skull can see" has to be one number), a **thought
balloon with a lit plate in it** rises over its head and it marches there, **ignoring the hero
completely**: it does not chase him, does not back away from his torch, does not strike even from
an adjacent tile. It arrives, it **stands there**, and the circuit closes. So a plate near the dark
is a switch the player throws by *leading a monster onto it* — the undead stop being only a threat
and become the third body, the only one that walks to the plate by itself.

- **The one lever the hero has is hitting it.** A blow snaps the fixation and keeps the skull
  plate-blind for `PLATE_BLIND_AFTER_HIT_MS` (`UndeadEnemy.takeDamage`). Without that window the
  manager would hand the plate straight back on the next frame and the counter-play would be
  decorative. There is no other cancel: you cannot talk it out of it, and standing in the way only
  makes it walk around you.
- **The balloon is NOT the need-item hint balloon coming back.** That one talked to the *player*
  ("go fetch the pickaxe") and handed him the answer to a lock; it is still gone, and `pedra` still
  asserts its texture never even loads. This one belongs to the *creature* — the same sentence as
  the attack wind-up's red flash, an intention shown before it is acted on — and without it a skull
  walking past the hero reads as a broken chase. Different sentence, different art (Sprite Factory
  `thought-plate.png`: thought bubbles trailing down, never a speech tail), different asset key.
  **A new creature intent gets a bubble; a new LOCK still gets only a shake.**
- **`EnemyManager.assignPlateLures` hands out ONE skull per plate**, honouring existing fixations
  first (re-assigning would walk a skull off the plate it is holding and strobe the circuit) and
  pairing the rest closest-first. It lives in the manager because it is the only place that can see
  the other skulls; a plate claimed by two would leave one standing beside a taken tile forever,
  which reads as broken rather than as hungry.
- **`GameScene.lurablePlates` decides what is even offerable**, and refuses two: a plate in campfire
  light (the undead never enter it, so that march could never end) and a plate under a crate
  (blocked, and pressed already). A balloon is a promise, and a promise the creature cannot keep is
  worse than no balloon. The hero standing on a plate is NOT a disqualifier — he walks off, and
  dropping the fixation every time he crosses would leave the skull dithering mid-room.
- **The march gives up on PROGRESS, not on a clock** (`PLATE_PATIENCE_MS`): `moveToward` is greedy
  and there is no pathfinder, so a rock between skull and plate is a dead march. As long as it keeps
  closing the gap it may take as long as it likes.
- Nothing that ships today has a plate in it (`world.json` and both levels have zero), so this
  changes no existing world — it is a tool for the next one. It only exists in the **adventure**:
  the undead siege is off in a puzzle world (`isPuzzleWorld()`) and skulls are not authorable, so a
  level cannot use it. A playtest reaches it with `__scene.enemyManager.spawnUndead(x, y)`.
- `npm run playtest -- placa-undead` builds the whole thing: the skull is born BETWEEN the hero and
  the plate (hero 3 tiles west, plate 4 east) so walking east is the only reading of "it ignored
  the hero", then it presses the plate, holds the circuit without flicker, and a single blow drops
  the balloon and sends it back after the hero. `caixa-placa` remains the hero/crate regression.

## The water wheel (`waterWheel`) — a real in-river 3D generator

`src/game/objects/WaterWheelObject.ts`. The wheel is a named boolean circuit producer with a real
Three.js rotor: low-poly rim, connected spokes, volumetric paddles, hub, axle, submerged trestle
and dynamo housing. The whole rotor is one hierarchy and turns continuously through
`rotor.rotation.z`; the runtime sprite sheet is not faking its motion.

- **The wheel occupies the river tile itself.** In the editor it may only replace an existing
  `water`/`bridgeSpot` prop. At runtime that prop creates its own non-buildable `WaterObject`, and
  `World3D.buildTerrain` includes wheel tiles in the sunken river set. Forgetting the latter leaves
  the water quad below an ordinary ground tile, making a logically wet wheel look dry.
- **Standing water is not enough.** `waterFlowAt` requires active, non-drained water under the
  rotor and at least one active orthogonal river neighbour. Draining the wheel's own tile removes
  its source even while an adjacent tile stays full.
- **Power comes from angular speed, not directly from the water predicate.** The rotor accelerates
  against inertia, closes its circuit above a threshold and coasts after flow stops. This keeps the
  dínamo alive briefly during slowdown instead of snapping wheel, light and consumer off together.
- **Circuit producers combine by OR.** Pressure plates and water wheels sharing a variable are
  aggregated once per frame before consumers update. A robotic arm with a `variable` only moves
  while that circuit is live; an old unbound arm remains self-powered for compatibility.
- **Sprite Factory still owns the authored pixel asset.** `spritefactory/sprites/water-wheel.mjs`
  builds 8 rotor phases in off/on banks with the official wood/stone/green palette (0 FAIL,
  0 WARN). Phaser uses it for the editor palette and placement icon; gameplay uses the 3D model.
- Juice is stateful: water spray follows the detected flow, paddles have a repeating splash SFX,
  startup shakes, the dynamo emits a green pulse/sparks and its physical lamp changes colour.
- `npm run playtest -- roda-agua` guards dry-placement rejection, in-river authoring, continuous
  3D angle change, acceleration, power delivery to an arm, draining under the wheel, coast and
  final shutdown. `caixa-placa` and `braco` are the circuit/consumer regressions.

## The boiler (`boiler`) — fire becomes energy

`src/game/objects/BoilerObject.ts`. The third circuit producer, beside the plate and the wheel —
and the one that finally connects FIRE, the game's only steerable system, to the power grid. The
wheel asks "is water flowing here?"; the boiler asks "is there flame touching me?"
(`GameScene.fireHeatAt`, orthogonal neighbours): a LIT campfire (steady state — the bucket is its
off switch), a burning bush/grass (the pulse of a planted fuse), lava (geothermal, permanent —
the melt around a settled crown still burns), or a lit graveto lying on the ground (what the
robotic arm delivers — flame crossing a wall into a firebox). Heat is not spread: nothing
CATCHES fire because of the boiler. And the hero's own lit torch STOKES it directly — bump the
furnace with the burning graveto (the house fire-bump grammar; the torch survives the transfer)
and it burns internally for ~16s (`stoke`): a timed round trip, never a switch, so running a
machine on torch alone means feeding the furnace — fixed sources are how a plant stays on.
While alive (stoked, heated or coasting on steam) the chimney SMOKES — a running plant
announces itself from afar.

**Steam needs BOTH elements.** Fire under an EMPTY tank pressurizes nothing: bump with the
full bucket to fill it (the throw empties the bucket, same as dousing), and boiling CONSUMES
the water (~45s per bucket, draining only while heated — steam is the water leaving). The
sprite carries both asks as its two dark voids: the cold firebox mouth wants fire, the empty
sight glass (blue when wet) wants water. The ART carries both asks — there is no balloon
translating them. Both are round trips: the plant demands the two elements, repeatedly.

- **Power comes from steam PRESSURE, not from the heat test** — the exact mirror of the wheel's
  angular speed. Pressure builds against thermal inertia (~1.4s) and drains slowly (~5.2s), with
  hysteresis (on at 0.45, off at 0.18): one grass tuft burning 2.2s buys several seconds of live
  circuit, so a pulsed fuse can FEED the furnace without the consumer flickering — stoking is
  the gameplay, the farming loop become a power plant.
- The body is a BILLBOARD like every other world prop (the game's style), boot-generated in
  three looks swapped on state edges the way a campfire swaps frames: cold / stoked (the
  firebox mouth ember lights — the readable thermometer) / generating (the dynamo's green
  status lamp — the one "circuit closed" grammar shared with the wheel). Steam puffs pace with
  pressure and a near-subliminal tremble marks full regime; effects/audio only exist near the
  hero (the wheel's rule). No new THREE lights — the fire that heats it brings its own from
  the pool.
- Producers still combine by OR per variable; the editor authors it like the wheel ("Saida de
  energia" + the variables modal), warns about unbound boilers, and its palette icon is
  boot-generated (`boilerTexture.ts`) — the runtime never draws the sprite.
- `npm run playtest -- caldeira` guards: cold boiler = dead grid = frozen arm; lit campfire →
  pressure → circuit → the arm works; extinguish → coast holds, then opens; a lit ground torch
  heats and its burnout cools. `caixa-placa` and `braco` remain the circuit regressions.

## Power wires (`wire`) — current becomes geography

`src/game/objects/WireObject.ts` + `render3d/wireTexture.ts`. Before wires, energy was a named
variable — a bus with no body. The wire makes the grid PHYSICAL: the author lays cable props
tile by tile from a producer to the consumer, and current is a per-frame flood-fill over
orthogonally adjacent wires (`GameScene.updateWireEnergy`), seeded by every producer that is
GENERATING right now (boiler with steam, turning wheel, pressed plate). A one-tile gap is an
open circuit — which is exactly what makes the cable a puzzle piece and not decoration.

- **The shape is never authored.** Seven forms (vertical, horizontal, four elbows, junction),
  resolved from the neighbours — other wires and the grid's machines — at boot in game and live
  on the editor board (`EditorScene.wireShapeAt`): painting the path IS the authoring, the same
  rule that gives the arm its direction frame. Textures are boot-generated pairs per shape:
  the dark cable base, plus a yellow energy core drawn additively on top only while the wire is
  LIVE (a pulsing glow — current is a living thing, the bombSpot's grammar).
- **A wire beside a machine converts it to wired mode.** An arm touching ANY wire is powered
  only by a live wire (OR the wireless variable, if it also has one); with no wire nearby the
  old behavior stands (variable-gated, or legacy self-powered when unbound). Wires don't need
  variables at all — a boiler with no variable still energizes its adjacent cables.
- Wires never block (a floor cable — the hero steps over it) and never burn (rubber is not in
  the fuel graph). Current has no memory: the live set is derived from sources every frame;
  what persists is the producers' physics (pressure, spin), never the wire.
- `npm run playtest -- fios` guards: shapes born from neighbours (h/nw/v/se), a wired unbound
  arm freezing on a dead grid, the path lighting yellow end to end while an isolated cable
  stays dark, cargo moving on cable power alone, walkability, and full shutdown when the
  source dies.

**The battery (`battery`/`batteryFull`) — electricity's portable vessel.** The stick carries
fire, the bucket carries water, the battery carries CURRENT — the item that lets energy cross
where no cable can be laid (a river in the hero's hand, a wall in the arm's claw). Charge the
empty one by STEPPING on a LIVE wire while holding it (a dead wire charges nothing); step on a
DEAD wire holding the full one and it DOCKS onto that tile (the walk-only place gesture — a
live wire never steals a charge it doesn't need). The grounded battery is a SEED for the
flood-fill, draining ONLY while feeding (`BATTERY_FEED_MS`, ~20s of grid uptime) — in the hand
it is stable, away from cables it waits intact. The charge TRAVELS with the item through every
hand-off (ground → hand → ground → the arm's claw, `heldBatteryChargeMs`/`carriedCharge` — the
electric twin of torch fuel), so pick-up-and-redock never refills it. Spent, it dies into the
empty shell in place (nothing evaporates) and the island goes dark. Sprite Factory art
(`battery.png`, empty/charged window in the wire's gold); the empty battery is authorable as a
pickup. `npm run playtest -- bateria` guards the whole arc: dead wire refuses, live wire
charges, the dock gesture empties the hand, an ISLANDED net lights from the grounded battery
and its arm hauls cargo, partial charge survives the pickup cycle, and the spent charge leaves
the shell.

**The electronic gate (`electronicGate`) — power must stay on.** A gate is a physical wired
consumer: at least one adjacent cable must be LIVE to raise it. It has no wireless/variable mode;
an unwired gate is deliberately fail-closed. Losing the last live cable starts closing it in the
same frame, so a pressure plate, generator coast or battery charge can hold a passage only for as
long as that source really lasts. Collision follows the visible clearance: the tile stays solid
through the lower poses and becomes walkable only at the fully raised pose.

The body is one 16x16 `Billboard3D`, not a Three.js model. Sprite Factory owns eight frames in
`electronic_gate.png`: four grille heights in unpowered/powered banks; the lamp changes from dark
to the shared circuit green and the adjacent cable supplies the yellow live line. Animation swaps
whole pixel-art poses (no smooth scaling/fading). The open billboard uses `depthLayer: 'ground'`
because the hero can occupy its tile. `npm run playtest -- portao-eletronico` covers editor
authoring, dead-grid collision, intermediate frames, live opening, automatic closing and re-open.

## The swing gate (`swingGate`) — the lock with no key

`src/game/objects/SwingGateObject.ts`. The locked door's twin, minus the lock: same ironwork
(the art is `locked_door.png` with the keyhole plate replaced by the bars running behind it),
no key, and it opens by itself when the hero bumps it. **Unless something is standing on the
tile behind it** — a swing leaf needs room to swing, so a tuft of tall grass back there jams it.
It shoves, catches and settles back, and stays shut.

This is the one barrier in the game that breaks the rule stated at the top of the fire section:
every other obstacle is a lock with exactly one key. Here there is no item to find — **what opens
it is changing the far side**, and the far side is by definition where the hero cannot go. So it
only has answers when paired with the things that act at a distance: fire, and the robotic arm
that carries a lit graveto across a line the hero can't cross.

- **The refusal must not be the locked door's shake.** That shake is the game's word for "this is
  solid, forget it" — and this gate is not refusing, it is *trying*. So the leaf actually starts
  to swing (the sprite narrows ~12%), hits what's behind it and springs back, twice. The player
  has to see the leaf MOVE to understand the problem is on the other side and not in their hands.
  The two SFX are the same hinge with different endings: `playGateSwing` opens into clear air,
  `playGateStrain` is that same creak cut short by a dull thud.
- **"The other side" is measured from the bump direction, not from an authored rotation.** The
  gate opens away from whoever arrives, so it works from either side and the author never has to
  get a facing right when placing it.
- **`GameScene.isTileOccupied` is shared with the crate push, on purpose.** Both ask the same
  question — "is there anything at all here?", which is wider than "is it solid": an item lying
  on the ground is not solid (the hero walks over it) but it stops both a crate and a leaf. Two
  copies of that list were the reliable way for the two to disagree a month from now.
- `npm run playtest -- portao-de-bater` builds and solves the whole puzzle the piece exists for:
  a wall with the gate at one gap and the arm at another, grass behind the gate, the hero hands
  the arm a lit graveto, the fire walks the grass, and the same bump that only rattled now opens.

## The portal crossing — the one animation told by two scenes

Stepping into a `levelPortal` used to be a 620ms fade to purple. Now it is four beats, and the
thing that makes it structurally different from every other effect in the game is that **a
`scene.restart()` happens in the middle of it**: the suck and the tunnel run in the OLD level's
GameScene, the fall runs in the NEW one, and those are two different objects with a dead world
between them.

1. **A sucção** (`GameScene.playPortalSuck`, 900ms). The hero is already standing ON the portal
   tile when `handleTileEntered` fires, so there is nowhere to drag him: he is pulled *in* where
   he stands — rises, spins, shrinks to nothing. He vanishes by SIZE, never by alpha alone, which
   would read as a ghost instead of as swallowed. The portal's particles reverse (`setSwallow`):
   at rest they rise and it exhales, inverted they fall inward and it INHALES.
2. **O vazio** (620ms). The portal spinning alone in the dark it just made. Without the pause the
   trip starts on top of the hero disappearing and neither beat is seen.
3. **O túnel** (`render3d/PortalTunnel.ts`). Owns its own canvas, renderer and rAF loop at
   `z-index: 3` — it has to, because World3D and the Phaser scene are both destroyed underneath
   it. Low-res backing store stretched with NEAREST, sized so one tunnel pixel matches one pixel
   of the world's ART (`tileScreenSize() / 16`): the trip is the only non-16px frame in the game
   and it must not read as another game's screen. Wall = an open cylinder seen from inside with a
   generated column texture scrolling along its axis; streaks = instanced quads rotated so their
   normal points at the tunnel axis (a quad that does not rotate goes edge-on exactly when it
   passes the side of the screen). It starts BEFORE the restart so the second WebGL context is
   paid for behind a screen that is already covered.
4. **A queda** (`GameScene.playPortalArrival`). The world builds behind the overlay, then the
   overlay leaves — never a frame of half-built world. The fall starts INSIDE the exit flash, not
   after it, or the level would open on a hero hanging motionless in the air. `Quad.easeIn`,
   because falling accelerates; the reflex `easeOut` makes him float down like a feather. The
   level title card waits for his feet to touch.

- **`setPendingPortalArrival` (`runtime/portalTransition.ts`) is the whole bridge across the
  restart** — one boolean, consumed on read so a death/restart never drops the hero out of the sky.
- **The suck eats the world's LIGHT, and only one knob does that.** `params.ambient`/`moon` kill
  the sources, but in a lava level the emissive floor IS the light and the frame does not move
  (measured: 45.6 → 45.2). `World3D.setWorldFade` (the death drain) finishes it in the post.
  **`params.exposure` is inert here**: the world is drawn into an EffectComposer render target and
  three only applies tone mapping when drawing straight to the canvas — the same bound-target trap
  `prewarmShaders` documents. A test that watched the knob passed on an effect that did not exist.
- **The hero's view state must be RESET on create** (`resetHeroView`). Phaser reuses the scene
  instance across `restart()`, and `hero` is a `readonly` field — so the scale-0.001 the suck left
  behind arrived in the next level and the hero was born invisible.
- `npm run playtest -- portal-travessia` guards all four beats where each happens, including the
  tunnel surviving the restart, and measures the darkening on the SCREENSHOT (see the comment on
  `shotLuma` for the two easier measurements that lie).

## Verifying a change

The playtest harness (`playtest/`) is headed Playwright — it drives the real game and asserts on
real state. Add a scenario in `playtest/scenarios/` and register it in `index.mjs`.

- Always enter the game with **`?play`** (dev-only; skips the language pick, title and intro —
  keying past them is flaky).
- Do **not** drive the game through an MCP browser tab: a hidden tab freezes Phaser's rAF, so
  nothing advances and every timing is meaningless.
- Live handles in dev: `window.__scene` (the Phaser scene), `window.__game`, `window.hd3d` (every
  3D render knob, live-tunable), `window.gameDebug`, `window.__prof`.

**Test EXACTLY what you changed, and nothing else.** Write (or extend) the one scenario that
covers the new thing and run that. Do **not** replay the whole game to check a pointed change:
the full puzzle solves (`espada` above all) take minutes each, they are bump-timing sensitive and
so they flake, and a flake in an unrelated scenario tells you nothing about your change while
costing you the afternoon. Axe/tree/border → `machado`. Robotic arm → `braco`. Toolbox and its
recipes → `caixa-ferramentas`. Rock and pickaxe →
`pedra`. Pressure plate + hero/crate → `caixa-placa`; the undead that walks onto one →
`placa-undead`. Portal crossing → `portal-travessia`. Swing gate → `portao-de-bater`. Fire and the light
budget → `perf-burn`. Frame cost → `perf-profile`. Item-state contracts (a bridge refusing a
second burn, the mound waiting for a clear tile, production drops falling to a free neighbour,
the bomb's fuse tween dying with the bomb) → `itens`. Same rule for re-runs: one failure in a
scenario you did not touch is a flake to note, not a suite to run four times.

**`espada` and `itens` are currently RED, and not because of anything you did.** Both assert the
contents of the old generated `level-1` ("A Espada na Pedra"), which the hand-authored level
replaced — see the warning at the top. Treat their failure as expected until they are rewritten to
author their own fixture in `/lab`, and never "repair" them by editing a level file.

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

# Zero the Hero

Zero the Hero is a pixel-art action game built with Phaser 3, TypeScript, Three.js, and Vite. The player earns coins from the undead and spends them to build the open world one chunk at a time.

## Stack

- `Phaser 3`
- `Three.js`
- `TypeScript`
- `Vite`
- `ESLint`

## Project layout

```text
.
|-- backup/
|   `-- zelda-open-world/   # Archived former overworld (not used at runtime)
|-- public/
|   |-- assets/
|   |-- levels/             # Standalone puzzle levels and dungeons
|   `-- world.json          # Active editable library of purchasable chunks
|-- src/
|   |-- game/
|   |   |-- assets/         # Asset manifest
|   |   |-- debug/          # render_game_to_text, advanceTime, and debug API
|   |   |-- editor/         # Chunk library editor, board, palette, and DOM UI
|   |   |-- entities/       # Enemies, coins, pickups, and managers
|   |   |-- explorer/       # Chunk construction, frontier gates, cards, and road spawns
|   |   |-- objects/        # Interactive world objects
|   |   |-- render3d/       # Three.js terrain and billboards
|   |   |-- runtime/        # Movement, inventory, effects, camera, and menus
|   |   |-- scenes/         # Boot, preload, title, game, editor, and level scenes
|   |   `-- world/          # Chunk schema, catalogue access, and streamed terrain
|   |-- styles/
|   `-- main.ts
|-- scripts/
|   `-- gen-chunk-library.mjs
|-- index.html
|-- package.json
`-- vite.config.ts
```

## Gameplay

- Every run starts on the same 12×12 clearing: a lit campfire in the middle, the wizard above-left, and a sword ready to collect.
- Three unfinished roads leave the clearing: west, north, and lower-east. Forest and darkness conceal everything beyond their seams, and the hero cannot cross until a chunk is purchased.
- Undead quietly enter at intervals from every unfinished frontier. There is no wave announcement and only a small number can be alive at once.
- Defeated undead drop coins. When the player can afford at least one chunk, the square road seal becomes active.
- Stand on a seal and press the B action (`X` or `K` on keyboard). Gameplay pauses, the background blurs, and three shuffled chunk cards are dealt face-up.
- Choosing an affordable card spends its cost, builds that authored chunk at the selected frontier, opens the road, and creates new frontier choices around the expanded world.
- The initial catalogue contains **Moonlit Lake** (3), **Whispering Forest** (5), and **Spider Hollow** (7). Spider Hollow's authored enemies are all spiders.

Movement is grid-based with animated steps. Combat, inventory, touch controls, health, coin pickups, and the existing object systems remain available.

## Chunk authoring

Open `/editor`, then choose **Chunks…**. The modal can create a blank 12×12 chunk and edit the current card's unique ID, display name, coin cost, image path, and description. Close the modal and use the normal paint/entity tools to author the selected chunk; **Save** writes the active `public/world.json` library.

Regenerate the three starter examples with:

```bash
npm run generate:chunks
```

## Archived map

The previous 22×8 Zelda-like overworld was copied intact to [`backup/zelda-open-world/world.json`](backup/zelda-open-world/world.json). It is a backup only and is not loaded by the game or `/editor` for now. Do not reconnect or edit it unless the archived design is explicitly restored.

## Scripts

```bash
npm install
npm run dev
npm run generate:chunks
npm run typecheck
npm run lint
npm run build
npm run playtest -- <scenario>
```

## Current state

- Chunk-builder mode is the default game flow; the former authored overworld is archived.
- Chunk cards, coin spending, dynamic terrain rebuilding, frontier-only undead spawns, and authored chunk enemies are wired into the runtime.
- `/editor` is the authoring surface for runtime chunk templates; `/lab` remains the puzzle-level laboratory.
- `window.render_game_to_text()` exposes the live player, enemies, frontier gates, catalogue, and built chunks for deterministic testing.

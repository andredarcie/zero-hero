# Zero the Hero

Zero the Hero is a 2D pixel-art action game built with Phaser 3, TypeScript, and Vite. The player explores an infinite procedurally-generated world, fights enemies, and collects coins.

## Stack

- `Phaser 3`
- `TypeScript`
- `Vite`
- `ESLint`

## Project Layout

```text
.
|-- public/
|   `-- assets/
|-- src/
|   |-- game/
|   |   |-- assets/         # Asset manifest
|   |   |-- debug/          # Debug hooks (window.render_game_to_text, window.advanceTime)
|   |   |-- editor/         # Map editor board, palette, and UI helpers
|   |   |-- entities/       # Coin, enemies (Bat, Slime, BigSlime, Undead, Mage, Spider)
|   |   |-- items/          # Collectible items (Key, Sword)
|   |   |-- maps/           # Level normalization and runtime helpers
|   |   |-- objects/        # Interactive objects (LockedDoor)
|   |   |-- runtime/        # GameBoardRenderer, PlayerMovementController, RuntimeEffects, WorldCamera, MinimapRenderer
|   |   |-- scenes/         # BootScene, PreloadScene, GameScene, EditorScene
|   |   |-- shared/         # Grid math and common utilities
|   |   |-- world/          # Procedural world: Chunk, ChunkManager, WorldGenerator
|   |   |-- config.ts
|   |   |-- constants.ts
|   |   `-- ZeroTheHeroGame.ts
|   |-- styles/
|   `-- main.ts
|-- index.html
|-- package.json
`-- vite.config.ts
```

## Architecture Notes

- `scenes/` only orchestrate flow and lifecycle.
- `runtime/` contains gameplay rendering, movement, effects, camera, and minimap.
- `world/` generates infinite terrain procedurally using chunk-based hashing with a seed.
- `entities/` contains enemy AI, coin pickups, and their managers.
- `items/` and `objects/` contain collectibles and interactive world objects.
- `editor/` retains the tile map editor (accessible at `/editor`).
- `shared/` contains grid math and common utilities.
- `debug/` centralizes `window.render_game_to_text` and `window.advanceTime`.

## Gameplay

- Infinite world generated per-seed from tileset chunks (16×16 cells each).
- Player starts at the world origin inside a guaranteed safe zone (no obstacles or enemies nearby).
- Movement is grid-based with animated steps; swipe input is supported on touch devices.
- **Enemies** spawn per chunk as the player explores. Difficulty scales with distance from origin:
  - Close (≤2 chunks): Bat, Slime
  - Mid (3–5 chunks): Undead, Spider
  - Far (6+ chunks): Mage, BigSlime (splits into two Slimes on death)
- **Bump combat**: walking into an enemy attacks it. Enemies patrol and attack on contact.
- **Health**: 3 hearts. Taking damage grants brief invincibility frames. Reaching 0 triggers a "YOU DIED" screen and restarts with a new seed.
- **Coins** drop from defeated enemies and are collected by walking over them; count shown in the HUD.
- **Minimap** renders in the corner, showing terrain, obstacles, and enemy positions.
- Items (Key, Sword) and objects (LockedDoor) are present but not yet wired into the open-world flow.

## Scripts

```bash
npm install
npm run dev
npm run build
npm run typecheck
npm run lint
```

## Current State

- Open-world mode is the default game flow; the level-based mode is superseded.
- Chunk generation, enemy spawning, coin drops, and the minimap are all functional.
- The tile map editor (`/editor`) is still available for level authoring but not used at runtime.
- `typecheck`, `lint`, and `build` pass locally.

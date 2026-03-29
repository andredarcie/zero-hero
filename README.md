# Zero the Hero

Zero the Hero is a 2D pixel-art Phaser project built with TypeScript and Vite.

## Stack

- `Phaser 3`
- `TypeScript`
- `Vite`
- `ESLint`

## Project Layout

```text
.
|-- levels/
|-- public/
|   `-- assets/
|-- src/
|   |-- game/
|   |   |-- assets/
|   |   |-- debug/
|   |   |-- editor/
|   |   |-- maps/
|   |   |-- runtime/
|   |   |-- scenes/
|   |   |-- shared/
|   |   |-- config.ts
|   |   |-- constants.ts
|   |   |-- levelApi.ts
|   |   |-- levelEditor.ts
|   |   `-- ZeroTheHeroGame.ts
|   |-- styles/
|   `-- main.ts
|-- index.html
|-- package.json
`-- vite.config.ts
```

## Architecture Notes

- `scenes/` only orchestrate flow and lifecycle.
- `runtime/` contains gameplay rendering, movement, and effects.
- `editor/` contains map editor board, palette, and UI helpers.
- `maps/` contains level normalization and runtime helpers.
- `shared/` contains grid math and common utilities.
- `debug/` centralizes `window.render_game_to_text` and `window.advanceTime`.

## Levels

- Runtime loads `levels/level_01.json`.
- The editor route (`/editor`) can list, load, edit, export, and save `.json` files inside `levels/`.
- Vite exposes a local API for:
  - `GET /api/levels`
  - `GET /api/levels/:file`
  - `PUT /api/levels/:file`

## Scripts

```bash
npm install
npm run dev
npm run build
npm run typecheck
npm run lint
```

## Current State

- Boot and preload flow are separated.
- Shared asset loading is centralized in an asset manifest.
- Gameplay uses modular board rendering, movement control, and debug hooks.
- The editor uses dedicated board and palette modules plus level persistence helpers.
- `typecheck`, `lint`, and `build` pass locally.

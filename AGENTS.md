# Project guidance

## Active world model

The primary game is the chunk-builder mode. A run starts on the fixed campfire clearing and the player creates the surrounding world by buying chunk cards with coins dropped by undead.

`public/world.json` is not an overworld map. It is the active, editor-authored **chunk library**: each `WorldChunk` may carry `catalog` metadata (`id`, `name`, `cost`, `cardImage`, `description`) and can be placed repeatedly during a run.

## Archived Zelda-like overworld

The former 22×8 Zelda-like open-world map is preserved at `backup/zelda-open-world/world.json`. It is a backup only and must not be loaded by the game, used as the editor default, or treated as current content. Do not modify or reconnect it unless the user explicitly asks to restore that archived design.

The active `public/world.json` intentionally replaced it. Puzzle levels and dungeons under `public/levels/` remain separate development content.

## Editor

`/editor` edits the active chunk library. Use **Chunks…** to create a blank chunk or set its card name, cost, image, and description; use the normal tile/entity tools to author its contents.

When changing the game loop, keep `window.render_game_to_text` and `window.advanceTime(ms)` accurate and add or update a playtest scenario for the changed interaction.

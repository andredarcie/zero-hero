# Audio

8-bit / old-console style sound effects, **generated** (not recorded) with
`tools/gen-sfx.mjs` — a faithful port of the public-domain **sfxr / jsfxr** synth (Tomas
Pettersson) for the bleepy single-channel SFX, plus a tiny square/triangle chiptune-melody
synth for the little NES-style jingles. Everything here is original output, free to use with
no attribution.

Regenerate / tweak any sound by editing the presets in `tools/gen-sfx.mjs` and running:

```
node tools/gen-sfx.mjs
```

| File | Event in game | Sound |
| --- | --- | --- |
| `sword-slash.wav` | Sword swing | noise swish, sweeping down |
| `enemy-hit.wav` | Hitting an enemy | square zap, down |
| `enemy-death.wav` | Enemy defeated | noisy poof / explosion |
| `coin.wav` | Coin pickup | ascending two-tone blip |
| `heart.wav` | Heart pickup | rising arpeggio jingle |
| `sword-pickup.wav` | Picking up the sword | triumphant item-get fanfare |
| `hurt.wav` | Player takes damage | harsh descending square |
| `game-over.wav` | Player death | sad descending triangle jingle |
| `shop-open.wav` | Shop opens | two-note up blip |
| `shop-close.wav` | Shop closes | two-note down blip |
| `ignite.wav` | Sword catches fire | rising noise whoosh |

Footsteps and fire-hit remain procedurally synthesized in
`src/game/audio/SoundManager.ts` (too frequent/subtle to sample well). That same file plays
each sample and falls back to the synth if a sample hasn't decoded yet.

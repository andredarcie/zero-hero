# Audio

Almost all audio here is **generated** (not recorded) by the two offline synths in `tools/` —
original output, free to use with no attribution. The one exception is the item-get sound
(`item-pickup.wav`), a third-party recording — see **Third-party samples** below. The design brief is "Dark Souls weight,
SNES timbre": layered synthesis (transient + body + sub-thump), an SNES-style echo bus
(short delay with a low-passed feedback loop, like the S-DSP FIR filter), small dark
reverb tails, and a master low-pass emulating the console's gaussian-interpolation
warmth. Music renders at 32 kHz — the S-SMP's native output rate.

Regenerate after tweaking the presets:

```
node tools/gen-sfx.mjs     # sound effects (44.1 kHz mono)
node tools/gen-music.mjs   # music + ambience loops (32 kHz stereo, seamless)
```

## Music (`tools/gen-music.mjs`)

| File | Plays | Piece |
| --- | --- | --- |
| `menu-drips.wav` | title / menu screen (its only sound) | soft, sparse water drops in a dark cistern; high A-minor pitches, long hall, no pulse or melody |
| `music-title.wav` | intro screen | "Ember" — A minor, 52 BPM; harp arpeggios, pp choir, church bell; andalusian Am-G-F-E resting on an unresolved V |
| `music-overworld.wav` | _currently unused_ (exploration is wind-only) | "Ashen Fields" — E aeolian w/ phrygian bII, 64 BPM; E1 pedal drone, funeral timpani, harp fragments, ocarina lament, hollow open-fifth ending |
| `music-danger.wav` | undead active nearby | "The Hollowing" — E phrygian, 150 BPM; galloping ostinato, timpani, offbeat stabs, one tritone bar before the loop seam |
| `ambience-wind.wav` | **always, under the world — the default "soundtrack"** | wind bed, zero tonal content (never clashes with any track) |

## Sound effects (`tools/gen-sfx.mjs`)

| File | Event in game |
| --- | --- |
| `sword-slash.wav` | sword swing — heavy air-cut + faint metal ring + sub thump |
| `enemy-hit.wav` | hitting an enemy — meaty low knock |
| `enemy-death.wav` | enemy defeated — sagging growls, bone rattle |
| `coin.wav` | coin pickup — one small dark chime (E5) |
| `water-drop.wav` | title-screen reveal — one rising "ploop" drop per word (ZERO·THE·HERO·POR) |
| `title-impact.wav` | title finale — cinematic hit when the author's name lands (sub + boom + A2 bell toll) |
| `heart.wav` | heart pickup — low minor third swell |
| `item-pickup.wav` | item get — bright pickup chime (**third-party**, not generated — see below) |
| `hurt.wav` | player damaged — short low grunt |
| `game-over.wav` | player death — E+F minor-2nd cluster swell, pitch gives way, distant knell |
| `shop-open.wav` / `shop-close.wav` | shop — low muted menu tones |
| `ignite.wav` | fire catches — muffled roar with crackles |
| `wood-chop.wav` | axe bite — thock + splinter crack |
| `tree-fall.wav` | trunk topples — creak, whoosh, ground thud |
| `splash.wav` | trunk hits river — wet slap, spray, droplets |
| `rock-smash.wav` | pickaxe on stone — clack + rubble |
| `grass-cut.wav` | scythe swish (dry) |
| `bomb-place.wav` | bomb set down + fuse spit |
| `bomb-explode.wav` | the blast — sub drop, boom, long rumble |
| `undead-spawn.wav` | bones grinding up through soil |
| `fire-hit.wav` | flame licks a foe — whoomp + crackle |
| `bridge-plank.wav` | laying a plank — hollow tok |
| `bridge-built.wav` | bridge done — planks settle, three muted harp notes |
| `footstep-0..3.wav` | footsteps — four rotated soft soil falls, dry |

## Third-party samples

| File | Source |
| --- | --- |
| `item-pickup.wav` | Freesound sound #37089 (freesound.org/s/37089), "item pickup", Freesound community. Converted to mono 44.1 kHz WAV and peak-normalized to −1 dBFS. Verify the specific sound's license on Freesound (community uploads are CC0 / CC-BY). |

Dialog blips stay procedurally synthesized in `src/game/audio/SoundManager.ts` (each NPC
has its own voice frequency). That same file plays every sample with slight random pitch
jitter on the frequent ones, and falls back to a lo-fi procedural synth if a sample
hasn't decoded yet.

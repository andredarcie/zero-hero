# Audio

The music, the ambience and every non-combat effect here are **generated** (not recorded) by the two
offline synths in `tools/` — original output, free to use with no attribution. Two leftover CC0 samples live in `combat/` (see below), and the item-get sound
(`item-pickup.wav`) is third-party too (see **Third-party samples**).
The design brief for the generated set is "Dark Souls weight,
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

The game is a peaceful, cozy one; the dark-fantasy loops it used to play were deleted from this
folder (their renderers still live in the generator).

| File | Plays | Piece |
| --- | --- | --- |
| `music-valley.wav` | the whole adventure | "Little Hearth" — F major, 72 BPM; open harp triplets, warm triangle pad, sine bass, a music-box melody (F major pentatonic) that rests for four bars, a sine flute echo |
| `music-lullaby.wav` | title screen and credits | the lullaby — F major, 56 BPM; slow harp, pad and music box |
| `ambience-day.wav` | under the world by day | soft breeze + scattered birdsong |
| `ambience-night.wav` | under the world by night | breeze + three crickets and a distant frog |
| `ambience-water.wav` | rises within six tiles of water | lapping water + small drops |

The three ambience beds always play together; the game only moves their gains (time of day,
distance to the nearest water).

## Sound effects (`tools/gen-sfx.mjs`)

| File | Event in game |
| --- | --- |
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

## Imported samples in `combat/` — third-party, CC0

Only two of the imported fantasy-RPG samples are still used: `sword-swing.wav` (the whoosh of the
sword going into the ground in the opening) and `fire-hit.wav` (flames catching). Every other
combat sample was deleted with the combat itself.

## Third-party samples

| File | Source |
| --- | --- |
| `item-pickup.wav` | Freesound sound #37089 (freesound.org/s/37089), "item pickup", Freesound community. Converted to mono 44.1 kHz WAV and peak-normalized to −1 dBFS. Verify the specific sound's license on Freesound (community uploads are CC0 / CC-BY). |

Dialog blips stay procedurally synthesized in `src/game/audio/SoundManager.ts` (each NPC
has its own voice frequency). That same file plays every sample with slight random pitch
jitter on the frequent ones, and falls back to a lo-fi procedural synth if a sample
hasn't decoded yet.

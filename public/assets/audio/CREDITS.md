# Audio

The music, the ambience and every non-combat effect here are **generated** (not recorded) by the three
offline synths in `tools/` — original output, free to use with no attribution. Two leftover CC0 samples live in `combat/` (see below), and the item-get sound
(`item-pickup.mp3`) is third-party too (see **Third-party samples**).
The design brief for the generated set is "Dark Souls weight,
SNES timbre": layered synthesis (transient + body + sub-thump), an SNES-style echo bus
(short delay with a low-passed feedback loop, like the S-DSP FIR filter), small dark
reverb tails, and a master low-pass emulating the console's gaussian-interpolation
warmth. Music renders at 32 kHz — the S-SMP's native output rate.

Regenerate after tweaking the presets:

```
node tools/gen-sfx.mjs        # sound effects (44.1 kHz mono); only the footsteps go straight to this folder
node tools/gen-cozy-music.mjs # the music: six valley pieces, the lullaby, the water/fire layers (44.1 kHz stereo)
node tools/gen-music.mjs      # ambience loops (32 kHz stereo, seamless)
node tools/encode-audio.mjs   # the MP3s the game downloads (music, ambience, effects), from the WAVs in tools/audio-masters/
```

`node tools/gen-cozy-music.mjs --check` only reviews the written score: it fails on two notes a
semitone (or a minor ninth) apart sounding together, a note outside F major, or a melody above A5.

## Music (`tools/gen-cozy-music.mjs`)

Written for a peaceful game, after what research on relaxing music actually supports: **low
brightness** is the strongest marker of music people choose to relax and sleep to (Kirk & Timmers,
2024), with slow tempi (56–96 BPM), little rhythmic and dynamic change, acoustic timbres and
consonant harmony. So: felt piano, nylon guitar, wooden flute and clarinet in the middle register, a
soft string bed and a pinch of felt celesta — no music box up high, no drums, no tension.

Listener fatigue comes from short loops, so the adventure plays **whole pieces** (just under two to three and a
half minutes, intro → A A B A A → slowing coda), chosen by the hour, with 35–75 s of silence —
only the ambience — between them. Every piece is diatonic to F major (the colour comes from the
mode), so the water and fire layers fit over any of them, and all are mastered to the same
loudness (-18 LUFS) so no piece arrives louder than the last. Peaks are held close to the body of
the music: every track's attacks are limited to 10 dB above its own level, and the mix to about
10 dB above the level of the three seconds around it — a pluck never "hits" over a quiet passage.

Every song can be heard in the pause menu (Music): a full player with play/pause, previous/next,
seek, repeat, shuffle and volume (`src/game/audio/Jukebox.ts`).

The instruments are physical models, not samples: modal synthesis for the piano (inharmonic
partials, two detuned strings per note with a two-stage decay, felt hammer), Karplus-Strong with a
fractional-delay tuner, pluck position and a wooden body for the guitar, breath-noise wind models
with legato glides, and a convolution reverb with a generated room. Each track is balanced by its
role (melody, accompaniment, bed, bass) measured in loudness, not by synth volume.

| File | Plays | Piece |
| --- | --- | --- |
| `valley-morning.mp3` | day | "Morning Dew" — F ionian, 76 BPM; nylon guitar arpeggios, felt piano melody, then flute |
| `valley-waltz.mp3` | day | "Garden Waltz" — C mixolydian, 3/4 at 96 BPM; piano waltz, clarinet, guitar on the return |
| `valley-clouds.mp3` | day, dusk | "Lazy Clouds" — B♭ lydian, 68 BPM; long flute over strings, piano takes over with a flute second voice |
| `valley-golden.mp3` | dusk, night | "Golden Hour" — D aeolian, 64 BPM; fingerpicked guitar, low clarinet, then piano with clarinet below |
| `valley-fireflies.mp3` | dusk, night | "Fireflies" — F major, 58 BPM; felt piano almost alone, a few celesta fireflies |
| `valley-moon.mp3` | night | "Moon over the Lake" — G dorian, 56 BPM; low flute and slow piano arpeggios over strings |
| `music-lullaby.mp3` | title screen and credits | the lullaby — F major in 6/8; rocking felt piano, celesta, then flute (seamless loop) |
| `music-layer-water.mp3` | rises near water | sparse celesta drops, F pentatonic, no pulse (20 s loop) |
| `music-layer-fire.mp3` | rises near a lit fire | a low string F–C breathing (20 s loop) |
| `ambience-day.mp3` | under the world by day | soft breeze + scattered birdsong |
| `ambience-night.mp3` | under the world by night | breeze + three crickets and a distant frog |
| `ambience-water.mp3` | rises within six tiles of water | lapping water + small drops |

The three ambience beds always play together; the game only moves their gains (time of day,
distance to the nearest water).

## Sound effects (`tools/gen-sfx.mjs`)

| File | Event in game |
| --- | --- |
| `water-drop.mp3` | title-screen reveal — one rising "ploop" drop per word (ZERO·THE·HERO·POR) |
| `title-impact.mp3` | title finale — cinematic hit when the author's name lands (sub + boom + A2 bell toll) |
| `heart.mp3` | heart pickup — low minor third swell |
| `item-pickup.mp3` | item get — bright pickup chime (**third-party**, not generated — see below) |
| `hurt.wav` | player damaged — short low grunt |
| `game-over.wav` | player death — E+F minor-2nd cluster swell, pitch gives way, distant knell |
| `shop-open.mp3` / `shop-close.mp3` | shop — low muted menu tones |
| `ignite.mp3` | fire catches — muffled roar with crackles |
| `wood-chop.mp3` | axe bite — thock + splinter crack |
| `tree-fall.mp3` | trunk topples — creak, whoosh, ground thud |
| `splash.mp3` | trunk hits river — wet slap, spray, droplets |
| `rock-smash.mp3` | pickaxe on stone — clack + rubble |
| `grass-cut.mp3` | scythe swish (dry) |
| `bomb-place.wav` | bomb set down + fuse spit |
| `bomb-explode.wav` | the blast — sub drop, boom, long rumble |
| `undead-spawn.wav` | bones grinding up through soil |
| `fire-hit.wav` | flame licks a foe — whoomp + crackle |
| `bridge-plank.mp3` | laying a plank — hollow tok |
| `bridge-built.mp3` | bridge done — planks settle, three muted harp notes |
| `footstep-0..3.wav` | footsteps — four rotated soft soil falls, dry |

## Imported samples in `combat/` — third-party, CC0

Only two of the imported fantasy-RPG samples are still used: `sword-swing.wav` (the whoosh of the
sword going into the ground in the opening) and `fire-hit.wav` (flames catching). Every other
combat sample was deleted with the combat itself.

## Third-party samples

| File | Source |
| --- | --- |
| `item-pickup.mp3` | Freesound sound #37089 (freesound.org/s/37089), "item pickup", Freesound community. Converted to mono 44.1 kHz WAV and peak-normalized to −1 dBFS. Verify the specific sound's license on Freesound (community uploads are CC0 / CC-BY). |

Dialog blips stay procedurally synthesized in `src/game/audio/SoundManager.ts` (each NPC
has its own voice frequency). That same file plays every sample with slight random pitch
jitter on the frequent ones, and falls back to a lo-fi procedural synth if a sample
hasn't decoded yet.

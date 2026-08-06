# Audio

The music, the ambience and every non-combat effect here are **generated** (not recorded) by the two
offline synths in `tools/` — original output, free to use with no attribution. **Combat is the
exception and is almost entirely third-party**: 23 of the 24 combat events play samples imported
from two CC0 packs, led by a **fantasy RPG** one (see **Combat** below), as does the item-get sound
(`item-pickup.wav`, see **Third-party samples**).
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
| `coin.wav` | _retired_ (the game now plays `combat/coin-pickup.wav`, a real coin from the RPG pack) |
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

## Combat (`combat/`, imported by `tools/import-combat-sfx.mjs`) — third-party, CC0

**23 of the game's 24 combat events play imported samples** (the 24th, the ground cracking open, is
explained at the end of this section). Fourteen of them had no sample at all before: they fell
through to the SoundManager's emergency synthesis — the fallback that exists to cover a sample that
has not decoded yet — and that had quietly become the permanent sound of half of every fight.

### The two packs, and why there are two

**[fantasy] "RPG Sound Pack"** by **artisticdude** — **CC0**, 192 sounds.
<https://opengameart.org/content/rpg-sound-pack> — the primary source, and it carries everything
this game actually does: swords swinging, magic, and a bestiary filed by creature (`NPC/shade` the
wraith, `NPC/slime`, `NPC/beetle`, `NPC/gutteral beast`).

**[retro] "The Essential Retro Video Game Sound Effects Collection [512 sounds]"** by **Juhani
Junkala** — **CC0**. <https://opengameart.org/content/512-sound-effects-8-bit-style> — survives in
**six sounds, all of them impacts**. The fantasy pack has swings and creatures but no *blows*:
nothing in it is a blade meeting a body or a body meeting a wall. The six that remain are
percussive and neutral (`Simple Damage Sounds`, `Impacts`) with nothing spacey about them.

An earlier version used the retro pack for everything, and the verdict was one sentence: *"it has
strange futuristic sounds."* Correct — that pack is arcade/shmup, and combat had ended up with a
**laser** for the mage's spell, a **laser** for the zora's spit, a **low-health alarm** for the
skull's attack telegraph and an **alien death scream** for every creature that died. All of those
now come from the fantasy bestiary, which is where they always belonged.

Both packs are CC0: no attribution required. This table is courtesy and provenance. **Neither pack
is in the repository** — only the 23 files below.

```
node tools/import-combat-sfx.mjs "<RPG Sound Pack folder>" "<512-sounds folder>"
```

**They live in `combat/`, and that is a safety catch, not tidiness.** `gen-sfx.mjs` writes to the
root of this folder and this file tells you to re-run it after tweaking presets — an imported sound
sharing a generated sound's name would be silently overwritten by the next regeneration. The
generated originals (`sword-slash.wav`, `enemy-hit.wav`, `hurt.wav`, `game-over.wav`, …) are still
on disk, untouched: reverting any single sound to the "Souls × SNES" set is deleting `combat/` from
one line in `SAMPLES`.

### What plays what

| File | Event in game | Source |
| --- | --- | --- |
| `sword-swing.wav` | the sword swinging — the most-heard sound in combat | [f] `battle/swing2` |
| `fist-swing.wav` | punching with no sword in the bag | [f] `battle/swing3` |
| `spin-release.wav` | the spinning blade cutting all eight neighbours | [f] `battle/swing` |
| `guard-block.wav` | a blow parried — trimmed to the metallic ring of an unsheathe | [f] `battle/sword-unsheathe2` |
| `spin-ready.wav` | the blade finishes charging | [f] `interface/interface1` |
| `undead-windup.wav` | the attack telegraph — **a wraith's hiss** | [f] `NPC/shade/shade1` |
| `undead-spawn.wav` | the skull clawing out of the ground | [f] `NPC/shade/shade13` |
| `enemy-death.wav` | a creature defeated | [f] `NPC/gutteral beast/mnstr1` |
| `undead-whiff.wav` | a telegraphed strike that met air — the creature grunts | [f] `NPC/gutteral beast/mnstr15` |
| `creature-arrive.wav` | a body that does not come from below, settling in | [f] `NPC/gutteral beast/mnstr12` |
| `spider-pounce.wav` | the spider's spring releasing | [f] `NPC/beetle/bite-small2` |
| `slime-hop.wav` | the slime's wet plop | [f] `NPC/slime/slime3` |
| `spell-windup.wav` | the mage casting | [f] `battle/spell` |
| `enemy-shot.wav` | mage bolt / turret bullet / zora spit leaving | [f] `battle/magic1` |
| `turret-charge.wav` | the turret winding up its fan | [f] `world/door` |
| `zora-surface.wav` | the zora breaking the water | [f] `inventory/bubble` |
| `zora-spit.wav` | the zora's mouth opening | [f] `inventory/bubble2` |
| `coin-pickup.wav` | a coin collected (not combat — lives here for the same gen-sfx safety catch) | [f] `inventory/coin3` |
| `enemy-hit.wav` | a blow landing on a body | [r] `Simple Damage Sounds/sfx_damage_hit3` |
| `blade-glance.wav` | a blow glancing off a body still in i-frames | [r] `Impacts/sfx_sounds_impact3` |
| `body-slam.wav` | a shoved body hitting a wall | [r] `Impacts/sfx_sounds_impact1` |
| `player-hurt.wav` | the hero taking damage | [r] `Negative Sounds/sfx_sounds_damage2` |
| `player-death.wav` | the hero dies (the only *human* in the fight) | [r] `Death Screams/Human/sfx_deathscream_human2` |
| `fire-hit.wav` | the burning stick licking a foe — neither pack has fire | [r] `Explosions/Shortest/sfx_exp_shortest_soft1` |

### Two things the importer does that matter

**It trims.** Fantasy recordings are cinematic — `battle/spell.wav` is 3.25 seconds — while the
game's windows are 100–500 ms. A telegraph must end when the blow lands, so most fantasy sounds are
cut to their opening (which is the charge) with a 22 ms fade, because slicing a waveform mid-cycle
leaves a step, and a step is a *click* that would fire every single time.

**It normalizes by LOUDNESS, not by peak** — and this is what makes two packs sound like one.
Peak normalization only measures the single loudest sample. The fantasy pack is organic recording
(short transient, long tail, lots of space between) and the retro pack is dense and compressed;
aligned by peak they land **20–30 dB apart in perceived volume**, both stamped "−1 dBFS". So the
reference is the RMS of the loudest 150 ms window — the stretch the ear actually judges — and peaks
are folded with `tanh` rather than clipped, which is the same soft-saturation `gen-sfx.mjs` already
ends every generated sound with.

The payoff is that the `vol` column in `SAMPLES` became real mixing: the loudest 150 ms of every
file now sits within 3 dB of every other, so a number in that column means "this should be louder
than that", not "this pack recorded quieter than that one".

### How these were picked, and what that does not guarantee

By name and by measurement, not by ear — whoever assembled the table could not listen to the files.
The rule: a sound is only eligible if its **folder names the gesture** unambiguously, and every pick
is then checked against numbers (duration, peak, RMS, spectral centroid).

Breaking that rule has already cost once, and it is worth keeping written down. `ground-crack.wav`
was taken from `Explosions/Long` because the *measurement* fit — low, long, continuous — straight
past the folder name. The result was a 2.1-second bomb, 4.5× longer than anything else in combat,
firing every 3.2 s of a siege in the opening minute of every game. The player heard it and could not
tell what it was, which is the definition of a wrong sound. **The folder name beats the
measurement.**

`playGroundCrack` therefore stays synthesized — it never had a file, and its three layers were built
to be a low, near-subliminal rumble, because its whole job is to give three seconds of warning
without startling anyone. Neither pack has *earth*.

Two picks are weaker than the rest and worth auditioning first:

- `turret-charge.wav` — the turret is the only *machine* in a fantasy bestiary, and the fantasy pack
  has no machines. A door's creak is the closest thing in it to a mechanism under strain. If it
  reads as a door, that is the first line to change.
- `enemy-death.wav` — one death sound serves skull, slime, bat, spider, mage, turret and zora. It
  was picked for length (short enough not to outlive the 310 ms crumble) rather than for matching
  any one creature.

One measurement caveat before adjusting anything: for a short transient a low whole-file RMS only
means "it is a tick", not "it is quiet". RMS over the loudest window (what the importer targets) is
the honest ruler; RMS over the whole file is not.

The separations that matter most, and that the numbers confirm: the landed hit is **dark** (308 Hz),
the glance off i-frames is **mid** (640 Hz) and the parry is **bright** (the unsheathe ring) — three
outcomes at the same spot on screen, three pitches. And the mage's charge is a *spell* while the
turret's is a *mechanism*, so the player can hear which one is winding up without looking.

## Third-party samples

| File | Source |
| --- | --- |
| `item-pickup.wav` | Freesound sound #37089 (freesound.org/s/37089), "item pickup", Freesound community. Converted to mono 44.1 kHz WAV and peak-normalized to −1 dBFS. Verify the specific sound's license on Freesound (community uploads are CC0 / CC-BY). |

Dialog blips stay procedurally synthesized in `src/game/audio/SoundManager.ts` (each NPC
has its own voice frequency). That same file plays every sample with slight random pitch
jitter on the frequent ones, and falls back to a lo-fi procedural synth if a sample
hasn't decoded yet.

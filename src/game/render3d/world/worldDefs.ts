// O QUE MAIS DE UMA PEÇA DO MUNDO 3D USA: a cor e o tremor da chama, o tamanho do pool de sombras e o alcance delas,
// a profundidade da água, e as texturas dos efeitos. Cada peça (render3d/world/) importa daqui em vez de uma da outra.

import * as THREE from 'three';

// Cap on static-solid cast silhouettes drawn at once (trees near a lit flame). Raised from
// 72 with the camera cull below: an instance is two triangles, and what used to make the
// number scary — 36 separate DRAW CALLS — has been one instanced draw for a while now.
// With CAST_CAMERA_REACH bounding the candidates, the count is bounded by what fits on
// screen (measured: ~40 in the home clearing, ~80 walking a forest wall with a torch).
export const CAST_POOL_MAX = 128;

// Shortest cast worth drawing, in tiles. Below this a silhouette is a smudge under the
// caster's own feet that reads as a MISSING shadow rather than a short one — so the water
// clamp drops the cast instead of leaving a stub (see emitSolidCast).
export const MIN_CAST_LEN = 0.9;

// Real flame light shifts colour temperature as it dances: deep orange when the
// flame is low, paler gold at the peak of a flare (hotter = whiter). The live
// firelight lerps between these by its instantaneous brightness.
export const FIRE_COOL = new THREE.Color(1.0, 0.5, 0.2);

export const FIRE_HOT = new THREE.Color(1.0, 0.87, 0.62);

/**
 * Até onde uma sombra projetada alcança a partir do pé de quem a projeta, em tiles: altura (até
 * ~1,5) × FAR_STRETCH (3,2) × o esticão da chama baixa (1,5) ≈ 7,2. Um projetor mais longe que
 * isto da área visível não tem como pôr sombra na tela, e não é calculado (ver updateCastShadows).
 */
export const CAST_REACH_TILES = 8;

// Golden-amber firelight (~the 2D warm pool's tint). Keeping the green channel high
// stops the overdriven core from clipping into pure red on the brown ground art.
export const FIRE_COLOR = '#ffc873';

// River tiles sit this far BELOW the ground plane — a sunken channel (dirt bed +
// earthen banks) so the water reads as recessed, with depth. The bridge still spans it
// at ground level.
//
// Era 0,42, e a 0,42 todo lago lia como PISCINA: uma parede de terra de quase meio tile, reta, em
// volta de uma água lá embaixo. Raso, ele lê como margem — e o reflexo dos pés, que cai a
// profundidade/tan(48°) da borda, encosta nela em vez de sumir atrás do barranco.
export const WATER_DEPTH_TILES = 0.28;

// O rio é a MESMA água do lago (o material do mar), assada um fio acima do leito dele: o leito
// continua lá embaixo para quando a comporta esvazia o canal.
export const RIVER_SURFACE_LIFT = 0.02;

// The shapes every one-shot world FX is built from — a glowing dot (sparks, embers, motes), a
// hollow ring (impact shockwaves) and a soft puff (smoke). Registered as textures at init; spawn
// them with addBillboard.
//
// Dot and puff are the same picture but NOT the same data: a texture painted on a 2D canvas is
// stored PREMULTIPLIED (rgb = rgb × alpha), so its faint outskirts carry near-black colour. Under
// additive blending that is harmless (black adds nothing) — which is why the dot works. Under the
// normal blending smoke needs, that black is composited IN, and a pale puff comes out as a dark
// smudge on the ground. The puff is therefore built straight from pixel data (no canvas), with
// white rgb all the way out and only the alpha falling off.
export const FX_DOT_TEXTURE = 'fx-dot';

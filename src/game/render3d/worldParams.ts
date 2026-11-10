// OS VALORES DE FÁBRICA DO MUNDO 3D: o enquadramento, a luz, a sombra, o pós. Cada número carrega o porquê de ser
// aquele; o World3D nasce com uma cópia nova (`params`), que o console e os ajustes do jogo mexem ao vivo.

import { getPixelScale } from '@/game/runtime/graphicsSettings';
import { TILESET_FRAME_SIZE } from '@/game/constants';
import { CAST_MAX_ALPHA } from './CastShadow3D';
import type { World3DParams } from './World3D';

export const defaultWorld3DParams = (): World3DParams => ({
    // O enquadramento do jogo: a camera em (0, camHeight, camBack) olhando pro alvo. O par ja foi
    // 72% do original (8.4/7.6 → 6.048/5.472, dois passos de slider: 80%, e 90% desse 80%); depois
    // o autor achou na regua de zoom que o padrao bom era o 90% dela (pedido de 2026-11-09), e os
    // dois foram divididos por 0,9 — a camera subiu pela propria linha de visao e o quadro pegou
    // um pouco mais de mundo. A regua (ZoomSlider) mede a partir DAQUI: 100% e este par. Achar o
    // proximo valor e o mesmo gesto — multiplicar os DOIS por um fator so, e nada mais.
    //
    // ZOOM AQUI E DOLLY, NUNCA fov, e os dois numeros andam SEMPRE pelo mesmo fator: a RAZAO
    // camHeight/camBack (1.1053) e a direcao de visao, e meio jogo tem essa razao assada dentro
    // de si — e o DEPTH_UP com que a arte da flor da lua desenha os frames em pe
    // (spritefactory/sprites/moonflower.mjs). Mexer num dos dois sozinho gira a camera e faz esse
    // material mentir em silencio, sem erro nenhum: a flor fica plantada torta.
    //
    // A PERSPECTIVA MAIS CALMA (2026-11-10): o fov desceu de 38 para 30 e o par subiu pelo fator que mantém o tamanho
    // do tile NA LINHA DO HERÓI (tan 19° / tan 15° = 1,285; 6,72/6,08 → 8,636/7,813). Um dolly zoom: o herói e o chão
    // dele saem iguais, e o que está ao norte encolhe menos — com 38° perto, quem estava três tiles acima saía com o
    // pixel 30% menor, e o quadro misturava tamanhos de pixel (o vizinho parecia de outra resolução que o herói). A
    // razão (a direção de visão) não mudou. O fog e a largura mínima da tela em pé foram divididos pelo mesmo fator.
    camHeight: 8.636,
    camBack: 7.813,
    fov: 30,
    // UM PARA TODOS. O celular desenhava na METADE (`isHandheld() ? 2 : 1`) para economizar
    // preenchimento — e essa metade se somava ao `devicePixelRatio` que a conta do buffer ignorava,
    // dando um quadro a 1/6 da tela: o serrilhado que o autor viu. O reescalonamento invisível foi
    // consertado em `renderSize`, e este continuar em 2 seria manter METADE do defeito só no
    // aparelho onde ele mais aparece.
    //
    // O preço é real e é do telefone: com o teto de DPR em 2, um aparelho de 3× passa a desenhar
    // ~16× os fragmentos de antes. Se algum engasgar, o botão de NITIDEZ do menu de pausa devolve
    // o modo econômico — e `hd3d.pixelScale` faz o mesmo pelo console, ao vivo. O valor de fábrica
    // vem do ajuste do jogador (`getPixelScale`), não de um palpite sobre o aparelho.
    pixelScale: getPixelScale(),
    // A tile floor in perspective cannot land its 16px art on whole screen pixels, and NEAREST
    // answers that by breaking every straight run of texels into a ragged staircase that crawls
    // as the camera moves. This anti-aliases the texel seams analytically — same single texture
    // fetch, no extra pass. See pixelArtLight/TEXEL_AA_GLSL.
    texelAa: 1,
    // A Short Hike-style firelight (user: "pode seguir à risca a forma do Short Hike"):
    // the falloff is SMOOTH (0 = no banding) but painted by the authored colour ramp
    // (fireRamp*) and evaluated on the art's own pixel grid (lightRes) — like ASH, the
    // pixel look comes from RESOLUTION, not from quantised circles. Set ≥ 1 to band it
    // into flat retro tiers instead (the earlier "3 círculos" look; straight quantise —
    // a Bayer dither read as dirty stipple). Live via window.hd3d.lightSteps.
    lightSteps: 0,
    // The light is drawn on a grid of texels-per-tile, so a fire's pool comes out in blocks
    // instead of a silky HD gradient sliding under the art. It MUST match the tileset's own
    // resolution (TILESET_FRAME_SIZE = 16 px per tile): at 8 the light stepped on a grid twice
    // as coarse as the art, which read as a checkerboard laid OVER the pixels rather than as
    // pixel art. Now one light texel == one art pixel. 0 = smooth.
    lightRes: TILESET_FRAME_SIZE,
    // The tiers' edges dent and crawl (~±0.6 tiles) instead of drawing compass circles —
    // "faça mais como a vida real, luz imperfeita" (user feedback). See lightWobbleUniform.
    lightWobble: 1.2,
    // Cap on how far direct light pushes a surface past its art colour. Kept LOW so
    // white sprite pixels never overdrive into an absurd bloom glare (user feedback);
    // the warm fire POOL comes from the additive glow disc below, not from
    // over-brightening the art. Below ~ACES(1.55) stays under the bloom threshold.
    lightCap: 1.55,
    seaFlow: 1,
    reflection: 0.62,
    // A troca de paleta dos biomas e o contorno dos personagens (2026-11-10, ver biomeRamp.ts e spriteOutline.ts).
    biomeRamp: 1,
    outline: 0.62,
    // O jogo nasceu de noite, e todo número abaixo foi escolhido a olho contra o escuro: a noite
    // É o padrão, e o dia é o delta (render3d/skyPreset.ts). O valor real vem do ajuste do jogador
    // no construtor — este 0 é só o que o TypeScript precisa ver.
    daylight: 0,
    // Lifted from 4.0 (user: "faça o jogo ser menos escuro de modo geral") — the unlit
    // forest is now readable everywhere and the night mood comes from the cool tint and
    // the warm-vs-cold contrast, not from crushing the dark to near-black. The fire pool
    // (additive) still clearly owns its clearing.
    ambient: 8.5,
    fireIntensity: 265,
    // Wide, soft warm pool (the 2D game's cozy campfire glow): far reach, gentle falloff.
    fireDist: 32,
    fireDecay: 0.6,
    // The visible warm halo hovering over the fire — what actually makes it read as
    // THE light source (a PointLight alone only lights surfaces, so the fire looked
    // irrelevant; this additive glow is the 2D game's yellow campfire haze).
    fireGlowSize: 15,
    // Warm cozy pool like the 2D — NOT a blown-out white core. Kept modest after the
    // user found a stronger glow too bright vs the (dim, cozy) 2D reference.
    fireGlowStrength: 0.6,
    // Authored from the flame sprite's own palette (#F1CC36 / #C83E3E) and tuned live
    // against the night: the rim must melt into the dark as warm ember, not alarm red.
    fireRampCore: '#ffe6a2',
    fireRampMid: '#f9a04e',
    fireRampRim: '#a34e2e',
    // One light block per 2×2 art pixels — low-res painted light, aligned to the art
    // grid so it never reads as a foreign checkerboard (4×4 was tried: too coarse).
    fireGlowRes: 8,
    // Shadow-casting fire light height: a balance so objects near the fire cast a
    // SHORT but clearly VISIBLE shadow radiating away from it (like the 2D game) —
    // too high (~4.5) hid the shadows under the objects; ground-level threw long ones.
    shadowHeight: 2.2,
    // Cast shadows radiate ~this many tiles from a flame (the pool where the ground
    // is lit enough for a shadow to read), darkest beside it (see CastShadow3D.ts).
    castShadowRadius: 7.5,
    castShadowAlpha: CAST_MAX_ALPHA,
    // Faint and long: moonlight is a fill, not a spotlight. The shadow must GROUND a
    // tree — never compete with a fire's 0.6-dark breathing casts, and never crush the
    // (already dark) unlit forest floor. Length reads longer than the moon's real
    // elevation would throw, because the tilted camera foreshortens anything laid flat
    // (same reason the fire casts run 1.3–3.2×).
    moonShadowAlpha: 0.22,
    moonShadowLength: 2.1,
    // Switch flames only when the challenger is 15% closer — see the param doc (P5).
    castHysteresis: 0.85,
    castElevation: 1,
    castWaterClamp: 1,
    moonHandoff: 1,
    // OFF by default: the mask changes how shadows compose (subtractive light instead of
    // multiplied decals), so it ships behind the knob until its look is signed off
    // against the reference shots (plano.md fase 3's parity gate).
    shadowMask: 0,
    shadowMaskRes: 12,
    // 4 tiles, medido no jogo e não no papel: da borda do mundo até o topo da tela cabem ~5 tiles
    // de fora, então uma rampa de 6 mal começava (a mata saa como floresta normal) e uma de 1
    // cortava a preto na primeira fileira. Em 4 aparecem duas ou três fileiras de mata e a névoa
    // fecha antes da borda da tela — vê-se floresta, e vê-se ela ser engolida.
    voidMist: 16,
    // The hero's neutral self-glow is dim so that near a fire he takes the fire's
    // warm colour, and his white pixels (horns/eyes) don't glare under a bright glow.
    heroLight: 28,
    // A VISTA. 0.30 de força = expoente 0.70 no coração dela: o chão em volta do herói sobe ~50%
    // nos graves e o longe fica exatamente onde estava. Ela PODE ser forte porque é LOCAL — o que
    // se enxerga é a diferença entre o pé dele e o escuro em volta, nunca o número. (A v1 ficou em
    // 0.14 porque a elipse cobria a tela inteira, e força global nenhuma se vê.)
    heroSight: 0.3,
    // O disco: 0.24 contra os 0.6 de uma fogueira. Menos da metade, e frio — é para se ver onde ele
    // pisa, nunca para competir com a poça quente que é a recompensa de acender o mundo.
    heroSightGlow: 0.24,
    // 2,6 tiles: ~um quinto da largura da tela, contra os 15 do halo de uma fogueira — a vista
    // mostra onde ele PISA, a fogueira é que abre a região. Subir isto é o caminho mais curto de
    // volta ao defeito da v1: uma elipse que passa do quadro não é vista, é `lift`.
    heroSightTiles: 2.6,
    heroSightLean: 0.9,
    // 0,02 ÷ 1,285: a câmera recuou (ver camHeight), e o fog conta da câmera — sem isto o mundo todo enevoava mais.
    fogDensity: 0.0156,
    // Raised with the ambient (see above) — a fuller moon for a brighter night.
    moon: 3.6,
    // Near-neutral (just a hint of cool) so tree-green etc. read as the art's own
    // colours instead of being tinted teal by a saturated blue night fill.
    ambientColor: '#b4b7c2',
    moonColor: '#97a0b4',
    // Quase preto: a distância da noite não é azul, é ausência. O fog usa a MESMA cor.
    skyColor: '#070811',
    // Frio e apagado — é a lua na ondulação. (Em linear: os 0.45/0.58/0.82 de sempre.)
    glintColor: '#b3c8ea',
    exposure: 2.05,
    // Gentle bloom: the fire/lava glow softly (like the 2D) instead of glaring.
    bloomStrength: 0.3,
    bloomRadius: 0.65,
    // Threshold sits BETWEEN lit sprites (capped at ~ACES(lightCap) ≈ 0.8) and the
    // HDR emissives (flame/lava boosted past 1 → ~0.88+): the fire glows and blooms
    // while lit white sprite pixels stay just under it and never glare.
    bloomThreshold: 0.85,
    focusY: 0.52,
    focusBand: 0.16,
    // O desfoque cedeu a vez à perspectiva atmosférica (2026-11-10): metade da força, e só no fundo distante — pixel
    // art borrada lê como imagem estragada. O primeiro plano mal amacia.
    dofBlur: 1.6,
    dofNear: 0.3,
    vignette: 0.16, // eased with the brighter night — 0.24 re-darkened the corners
    // A noite: o longe escurece e perde cor devagar (a cor do ar é quase preta). O dia leva o dobro (skyPreset).
    haze: 0.45,
    lift: 1, // a noite é a rampa reta — ver o doc do campo
    grain: 0.02,
    // Occasional twinkles near lit fires + a faint low haze — tuned live to sit
    // just under "noticeable" so they never wash the dark or read as floating orbs.
    camSway: 0.022,
    pixelSnap: 1,
    wind: 1,
    fireflies: 3,
    mist: 2.2,
    // Gentle split-tone: enough for the warm/cold HD-2D feel, but low so it doesn't
    // repaint the sprites' own colours. Saturation lifted slightly so the art reads vivid.
    // A noite com MENOS cor (era 1.18, 2026-11-10): de noite o olho perde a cor antes do valor, e um vale saturado no
    // escuro lia como um dia apagado. O split-tone mais frio (GRADE_WOOD_SHADOW) faz o resto; o fogo continua quente.
    grade: 0.34,
    saturation: 1.02,
    contrast: 1.0,
  });

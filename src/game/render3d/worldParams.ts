// OS VALORES DE FÁBRICA DO MUNDO 3D: o enquadramento, a luz, a sombra, o pós. Cada número carrega o porquê de ser
// aquele; o World3D nasce com uma cópia nova (`params`), que o console e os ajustes do jogo mexem ao vivo.

import { getPixelScale } from '@/game/runtime/graphicsSettings';
import { TILESET_FRAME_SIZE } from '@/game/constants';
import { CAST_MAX_ALPHA } from './CastShadow3D';
import type { World3DParams } from './World3D';

/**
 * O PASSO PARA O NORTE E PARA O SUL (pedido do autor, 2026-11-19: com a câmera HD-2D, "quando ele sobe ou desce parece
 * que ele anda mais lento... só parece, a distância andada é a mesma").
 *
 * Um tile para o norte ocupa na tela sen(inclinação) do que um tile para o lado ocupa: com a câmera de 46,5° eram 72%,
 * e a caminhada lia como uma só; com a de 27° são 45%, e subir ou descer parecia andar em câmera lenta. O passo
 * vertical fica mais curto na mesma proporção, para o chão correr na tela como corria antes: 72% da velocidade do
 * passo de lado (o que o autor achava certo), e não 100% — igualar de todo faria o herói disparar no eixo em que o mundo
 * é mais comprido. Sai da própria câmera: se a inclinação mudar, o passo acompanha. Nunca deixa o passo mais lento.
 */
export const VERTICAL_SCREEN_SHARE = 0.725;
export const verticalStepSpeedup = (camHeight: number, camBack: number): number =>
  Math.max(1, VERTICAL_SCREEN_SHARE / Math.sin(Math.atan2(camHeight - 0.4, camBack)));

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
    // pixel 30% menor, e o quadro misturava tamanhos de pixel (o vizinho parecia de outra resolução que o herói).
    //
    // A CÂMERA HD-2D (2026-11-19, aprovada pelo autor: "ficou muito melhor... deixe assim de forma definitiva"). Ela
    // olhava 46,5° para baixo com lente de 30°; os jogos HD-2D olham ~25–27° com lente fechada (medido nas capturas de
    // Octopath II e Live A Live; os desenvolvedores contam o mesmo: câmera baixa, "olhando para dentro" do cenário, e
    // teleobjetiva — no protótipo de Octopath a lente aberta dava "estranheza de escala"). Agora: 27° e 18°, e outro
    // dolly zoom: a câmera recuou o quanto a lente fechou (distância × tg(fov/2) constante), então o tile NA LINHA DO
    // HERÓI tem o mesmo tamanho de antes e a largura de tela também. O que muda é o resto, e é o efeito: o chão achata
    // (sen 27° contra sen 46,5°), o que está em pé cresce (cos), e o quadro alcança ~11 tiles ao norte em vez de 6.
    // Tudo que contava com a direção antiga foi refeito junto: o fog (÷ o recuo, 0,591), o piso da tela em pé
    // (WorldScreen), a flor da lua (spritefactory/sprites/moonflower.mjs, DEPTH_UP = tg 27°) e as máscaras de cima
    // (AirLight, ShadowLayers), que agora alcançam o alto do quadro.
    camHeight: 9.1192,
    camBack: 17.1126,
    fov: 18,
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
    // A decoração em pé (2026-11-10, ver standingDecor.ts): 1 = em pé, 0 = deitada como antes (o A/B ao vivo).
    stand: 1,
    // O jogo nasceu de noite, e todo número abaixo foi escolhido a olho contra o escuro: a noite
    // É o padrão, e o dia é o delta (render3d/skyPreset.ts). O valor real vem do ajuste do jogador
    // no construtor — este 0 é só o que o TypeScript precisa ver.
    daylight: 0,
    golden: 0, // escrito pelo relógio (WorldLook.applySky)
    // ── A LUZ NO AR, O CÉU E AS SOMBRAS COM COR (2026-11-10: AirLight.ts, atmosphere.ts, CastShadow3D.shadowTint) ──
    // Os valores daqui são os da NOITE, como tudo neste arquivo; o dia e a hora dourada são deltas (skyPreset.ts).
    // 0,86: só o que passava de ~0,9 muda (a chama, o brilho d'água, o branco ao sol); o resto do quadro é idêntico.
    shoulder: 0.86,
    // A sombra da lua é fraca (0,22) e quase preta: um fio de azul, para a noite não sujar o chão de cinza.
    shadowTint: '#0d1230',
    // O luar no ar: frio e discreto. Entre as árvores ele desenha fachos azulados; em campo aberto quase não existe.
    air: 2.2,
    airColor: '#6f8fe0',
    airHeight: 2.4,
    airOpen: 0.06,
    airFire: 1,
    // De noite a nuvem mal faz sombra (a lua é preenchimento) — mas ela continua passando, e o lago a reflete.
    clouds: 0.22,
    // 0,57: perto de um terço do céu com nuvem — o quadro quase sempre tem sol E uma sombra passando, que é o que
    // faz a sombra ler como nuvem. Mais coberto, a tela inteira escurece por minutos e o dia só parece mais sujo.
    cloudCover: 0.57,
    // As duas cores do céu noturno parecem claras escritas assim, e é de propósito: o quadro da noite vai LINEAR para
    // a tela (sem curva), então um anil escrito "escuro" chegaria preto. Na tela isto é anil fundo e nuvem de chumbo.
    waterSky: 0.55,
    waterSkyColor: '#2d426e',
    waterCloudColor: '#586688',
    stars: 1,
    rim: 0.8,
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
    // A curva local e o disco aditivo parecem uma nuvem seguindo o herói. Deixe os controles
    // disponíveis no depurador, com o chão iluminado pelo céu e pelas chamas durante o jogo.
    heroLight: 0,
    heroSight: 0,
    heroSightGlow: 0,
    heroSightTiles: 2.6,
    heroSightLean: 0.9,
    // 0,02 ÷ 1,285: a câmera recuou (ver camHeight), e o fog conta da câmera — sem isto o mundo todo enevoava mais.
    // × 0,591 (2026-11-19): a câmera HD-2D recuou de novo (11,35 → 19,21 tiles do alvo), pelo mesmo motivo.
    fogDensity: 0.00922,
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
    // A LENTE HD-2D (2026-11-19, pedido "o HD-2D mais legítimo possível"): o borrão agora é pela distância (dofDepth),
    // então pode ser forte sem tocar no que o jogador está olhando — tudo a até 2,4 tiles de profundidade do herói fica
    // nítido de cima a baixo, e só o fundo de verdade derrete, até 4,5 px no alto do quadro (era 1,6 px por fileira).
    // O pé da tela (o chão uns 5 tiles ao sul) só amacia, como o primeiro plano dos jogos HD-2D.
    dofBlur: 4.5,
    dofNear: 0.35,
    dofDepth: 1,
    dofBand: 2.4,
    dofRamp: 7,
    bokeh: 1,
    // A aberração cromática dos jogos HD-2D (2026-11-19): fraca de propósito, a cor só se separa perto da borda (~1 px
    // nas laterais da faixa nítida; os cantos de cima e de baixo já são borrão da lente); um golpe soma um pulso. (O reflexo de lente foi feito e tirado no mesmo dia: o sol nunca entra no quadro
    // desta câmera, e nenhuma luz do vale tem força para quicar na lente — nem com o knob no quádruplo ele aparecia.)
    aberration: 1.5,
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
    // De noite o quadro já tem pouca cor (acima); a sombra só perde a dela de dia e na hora dourada (skyPreset.ts).
    shadeSat: 0,
  });

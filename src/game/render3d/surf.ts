// A ARREBENTAÇÃO — o mar da praia do norte (pedido do autor, 2026-11-19: "o mar, com ondas e super realista").
//
// O mar do vale (pixelArtLight, `worldFx: 'seaFlow'`) é água de LAGO: uma arte que escorre, com uma faixa de espuma que
// respira na margem. Serve a um laguinho e a um rio; numa praia de sessenta tiles ele seria um tapete azul com franja.
// Praia é outra física, e é ela que este módulo desenha, inteira no shader (uma malha, um draw):
//
//   1. O TREM DE ONDAS. Lá fora, cristas finas e quebradas avançam para a costa, uma a cada SURF_PERIOD segundos,
//      SURF_LENGTH tiles uma da outra. Cada crista tem a face da frente na sombra e o dorso mais claro.
//   2. A QUEBRA. A poucos tiles da areia a crista vira espuma, e arrasta uma renda de espuma atrás dela.
//   3. O ESPRAIO. A onda quebrada sobe a areia numa lâmina fina, com a frente de espuma, até onde a força dela dá
//      (cada onda chega a um lugar; ao longo da praia a linha é recortada em lóbulos), para, e
//   4. O REFLUXO: a lâmina volta devagar, deixa a areia molhada e brilhante, e um fio de espuma onde chegou mais alto.
//   5. A COR DA FUNDURA: a areia aparece por baixo da água rasa, que vai do verde-água ao azul fundo em degraus
//      serrilhados (degradê liso não é pixel art).
//
// TUDO É FUNÇÃO DE UMA DISTÂNCIA: `c`, a distância com sinal até a linha média da água, em tiles (negativa na areia,
// positiva mar adentro). Ela nasce no assado (`buildCoastField`): a distância exata até a fronteira dos tiles de mar,
// alisada, para a frente de onda ser uma curva e não a escadinha da grade. Vai em cada quad pelos quatro cantos
// (`aCoast4`), e o shader a lê no centro de cada texel de arte — a onda anda em pixel inteiro.
//
// A AREIA É DO MESMO MATERIAL. A faixa molhada não é um frame de chão: é este shader escurecendo a areia perto do mar.
// Por isso toda a areia da praia é desenhada aqui (terrainMaterials.surf), e pisa-se nela como em qualquer chão; só o
// tile de mar bloqueia. O herói anda pela lâmina d'água do espraio.
//
// O RELÓGIO DA ONDA É REPRODUZÍVEL. A fase ao longo da praia e a força de cada onda são somas de senos de argumento
// pequeno, e não ruído de hash: o mesmo número sai no shader (float de 32 bits) e aqui (`swashAt`), então os bichos
// que seguem a linha d'água (os maçaricos) e o som da arrebentação andam com a onda que se vê.

import * as THREE from 'three';

import { STAND_ACTOR_SLOTS } from './decorSway';

/** A distância entre duas cristas, em tiles, e o tempo entre duas ondas, em segundos. */
export const SURF_LENGTH = 2.9;
export const SURF_PERIOD = 5.6;
/** Até onde a onda mais forte sobe a areia, em tiles, e o quanto a água recua além da linha média antes da próxima. */
export const SURF_RUNUP = 1.85;
export const SURF_DRAWDOWN = 0.24;
/** A fração do período em que a lâmina SOBE (o resto é o refluxo, mais lento). */
export const SURF_RISE = 0.36;
/** A largura da faixa de areia sempre úmida, em tiles a partir da linha média. */
export const SURF_WET = 1.55;
/** Até onde o campo mede: mar adentro e areia adentro, em tiles. */
export const COAST_SEA_MAX = 10;
export const COAST_LAND_MAX = 4;

// ── O relógio da onda, igual no shader e aqui ────────────────────────────────────────────────────────────────────
/**
 * A fase ao longo da praia, em tiles: a frente de onda não chega reta, nem ao mesmo tempo em toda a praia. Pouca e
 * LENTA — a primeira versão tinha 2,5 tiles de vaivém a cada dúzia de tiles, e a linha d'água saía uma senoide
 * atravessando a tela (a foto do playtest `praia`): numa praia de verdade a onda chega quase de frente.
 */
export const surfPhase = (x: number): number => 0.55 * Math.sin(0.11 * x + 1.7) + 0.3 * Math.sin(0.29 * x + 4.1) + 0.1 * Math.sin(0.83 * x + 0.6);
/** A força da onda de número `n` (0,44 a 1): numa série, umas vêm maiores. */
export const surfAmp = (n: number): number => 0.72 + 0.28 * Math.sin(2.399963 * n + 1.3);
/** A subida e a descida da lâmina ao longo de um período (`u` de 0, a chegada, a 1, a próxima): 0 → 1 → 0. */
export const surfSwing = (u: number): number => (u < SURF_RISE
  ? Math.sin(0.5 * Math.PI * (u / SURF_RISE))
  : Math.cos(0.5 * Math.PI * ((u - SURF_RISE) / (1 - SURF_RISE))));

/**
 * A lâmina d'água na coluna `x` da praia, no instante `timeS` (o relógio da água do World3D, `elapsed`): onde está a
 * beira dela (`edge`, em `c`: negativo = areia acima), até onde esta onda sobe (`reach`), em que ponto do período se
 * está (`u`) e qual onda é (`n`).
 */
export const swashAt = (x: number, timeS: number): { edge: number; reach: number; u: number; n: number } => {
  const s = surfPhase(x) / SURF_LENGTH + timeS / SURF_PERIOD;
  const n = Math.floor(s);
  const u = s - n;
  const lobe = 0.5 + 0.5 * Math.sin(0.9 * x + 2.1 * n) * Math.sin(0.37 * x + 1.3 * n);
  const reach = SURF_RUNUP * surfAmp(n) * (0.82 + 0.18 * lobe);
  const t = Math.min(1, Math.max(0, (u - 0.62) / 0.38));
  const edge = -reach * surfSwing(u) + SURF_DRAWDOWN * t * t * (3 - 2 * t);
  return { edge, reach, u, n };
};

// ── O campo da costa ─────────────────────────────────────────────────────────────────────────────────────────────
/** A distância com sinal até a linha d'água num CANTO de tile (ix, iz) ↔ o ponto (ix − 0,5, iz − 0,5) do mundo. */
export type CoastField = (ix: number, iz: number) => number;
/** Quantas passadas de média alisam o campo (ver buildCoastField). */
const COAST_SMOOTH_PASSES = 7;

/**
 * Mede a costa na grade dos cantos de tile do retângulo dado (em tiles, inclusive). `isWater(x, z)` diz se o tile é mar
 * aberto. Em cada canto: 0 na fronteira; dentro do mar, a distância até o tile de terra mais perto (até COAST_SEA_MAX);
 * na terra, menos a distância até o mar mais perto (até COAST_LAND_MAX). Depois, as passadas de média alisam a
 * escadinha da grade — a linha d'água vira curva, e quem está longe dela não muda. (Com três passadas cada degrau da
 * enseada ainda deixava um bico na faixa molhada, a tile e meio da água: a foto do playtest `praia`.)
 */
export const buildCoastField = (isWater: (x: number, z: number) => boolean, x0: number, z0: number, x1: number, z1: number): CoastField => {
  const w = x1 - x0 + 2;
  const h = z1 - z0 + 2;
  let d = new Float32Array(w * h);
  const rectDist = (px: number, pz: number, tx: number, tz: number): number => Math.hypot(
    Math.max(Math.abs(px - tx) - 0.5, 0), Math.max(Math.abs(pz - tz) - 0.5, 0),
  );
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const ix = x0 + i;
      const iz = z0 + j;
      const a = isWater(ix - 1, iz - 1);
      const b = isWater(ix, iz - 1);
      const c = isWater(ix - 1, iz);
      const e = isWater(ix, iz);
      if (!(a === b && b === c && c === e)) continue; // na fronteira: zero
      const inside = a;
      const max = inside ? COAST_SEA_MAX : COAST_LAND_MAX;
      const px = ix - 0.5;
      const pz = iz - 0.5;
      let best = max;
      // do anel de perto para o de longe: a maioria dos cantos acha a outra margem nos primeiros
      for (let r = 1; r <= Math.ceil(max) + 1 && r - 1 < best; r++) {
        for (let dz = -r; dz < r; dz++) {
          for (let dx = -r; dx < r; dx++) {
            if (Math.max(Math.abs(dx + 0.5), Math.abs(dz + 0.5)) < r - 1) continue; // só o anel
            const tx = ix + dx;
            const tz = iz + dz;
            if (isWater(tx, tz) === inside) continue;
            const dist = rectDist(px, pz, tx, tz);
            if (dist < best) best = dist;
          }
        }
      }
      d[j * w + i] = inside ? best : -best;
    }
  }
  for (let pass = 0; pass < COAST_SMOOTH_PASSES; pass++) {
    const out = new Float32Array(w * h);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        let sum = 0;
        let weight = 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const jj = Math.min(h - 1, Math.max(0, j + dj));
            const ii = Math.min(w - 1, Math.max(0, i + di));
            const k = (di === 0 ? 2 : 1) * (dj === 0 ? 2 : 1);
            sum += d[jj * w + ii] * k;
            weight += k;
          }
        }
        out[j * w + i] = sum / weight;
      }
    }
    d = out;
  }
  return (ix, iz) => {
    const i = Math.min(w - 1, Math.max(0, ix - x0));
    const j = Math.min(h - 1, Math.max(0, iz - z0));
    return d[j * w + i];
  };
};

/**
 * Põe a costa na malha de tiles (a de `buildFlatTileGeometry`, na mesma ordem): `aCoast4` leva, nos quatro vértices de
 * cada quad, os quatro cantos dele (NO, NE, SE, SO) — o shader interpola no centro do texel.
 */
export const addCoastAttribute = (geo: THREE.BufferGeometry, tiles: ReadonlyArray<{ x: number; z: number }>, field: CoastField): void => {
  const coast = new Float32Array(tiles.length * 16);
  tiles.forEach(({ x, z }, i) => {
    const nw = field(x, z);
    const ne = field(x + 1, z);
    const se = field(x + 1, z + 1);
    const sw = field(x, z + 1);
    for (let k = 0; k < 4; k++) coast.set([nw, ne, se, sw], i * 16 + k * 4);
  });
  geo.setAttribute('aCoast4', new THREE.BufferAttribute(coast, 4));
};

/**
 * O MAR ATÉ O HORIZONTE. A câmera do jogo nunca vê o fim da malha assada; a do mirante (objects/beach/SeaVista) baixa
 * até o horizonte, e o mar tem de ir até lá. São até três retângulos enormes de água funda ([x de, x até, z de, z até]):
 * um ao norte de tudo o que foi assado (`x0..x1`, `z0..z1`, em tiles), e um de cada lado, nas fileiras em que o mar de
 * fora continua (`isVoidSea`). Além do plano distante da câmera o fog já os engoliu.
 */
export const farOceanQuads = (
  x0: number, z0: number, x1: number, z1: number, isVoidSea: (x: number, z: number) => boolean,
): Array<[number, number, number, number]> => {
  const FAR = 170;
  const sideLimit = (x: number): number | null => {
    let last: number | null = null;
    for (let z = z0; z <= z1 && isVoidSea(x, z); z++) last = z;
    return last;
  };
  const quads: Array<[number, number, number, number]> = [[x0 - 0.5 - FAR, x1 + 0.5 + FAR, z0 - 0.5 - FAR, z0 - 0.5]];
  const west = sideLimit(x0 - 1);
  const east = sideLimit(x1 + 1);
  if (west !== null) quads.push([x0 - 0.5 - FAR, x0 - 0.5, z0 - 0.5, west + 0.5]);
  if (east !== null) quads.push([x1 + 0.5, x1 + 0.5 + FAR, z0 - 0.5, east + 0.5]);
  return quads;
};

// ── O shader ─────────────────────────────────────────────────────────────────────────────────────────────────────
const lin =(hex: string, k = 1): string => {
  const c = new THREE.Color(hex); // sRGB → linear
  return `vec3(${(c.r * k).toFixed(4)}, ${(c.g * k).toFixed(4)}, ${(c.b * k).toFixed(4)})`;
};
const f = (n: number): string => n.toFixed(4);

/**
 * A água, do raso ao fundo — a rampa `water` do tileset (spritefactory/lib/palette.mjs): o brilho do rio é o raso
 * daqui, a base do rio é o verde-água, e o fundo do mar do vale é o fundo deste.
 */
const AQUA = lin('#bbf2f4', 0.62);
const TURQ = lin('#27a9af');
const TEAL = lin('#0b8a8f');
// (mar adentro, o azul de aço da rampa `deepblue`: só com a rampa `water` o fundo saía um verde-petróleo acinzentado)
const MID = lin('#3f607e', 1.3);
const BLUE = lin('#3f607e', 1.05);
const DEEP = lin('#334c62', 1.1);
/** A espuma: clara, e ainda abaixo do limiar do halo ao sol do meio-dia (a mesma conta da espuma do lago). */
const FOAM = 'vec3(0.46, 0.57, 0.59)';

/**
 * A linha média da água, no eixo norte-sul do mundo (o assado a mede, TerrainGround.bakeSurf): mar adentro, além de
 * onde o campo da costa alcança, a onda é uma frente reta medida dela.
 */
export const surfRefUniform: THREE.IUniform<number> = { value: 0 };

/** As funções da onda, declaradas antes do `main` do fragmento. Iguais às de cima, letra por letra. */
export const SURF_PARS_GLSL = /* glsl */ `
  varying vec4 vCoast4;
  uniform float uSurfRef;
  uniform vec4 uStandActors[${STAND_ACTOR_SLOTS}];
  float zsHash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float zsPhase(float x) { return 0.55 * sin(0.11 * x + 1.7) + 0.3 * sin(0.29 * x + 4.1) + 0.1 * sin(0.83 * x + 0.6); }
  float zsAmp(float n) { return 0.72 + 0.28 * sin(2.399963 * n + 1.3); }
  float zsSwing(float u) {
    return u < ${f(SURF_RISE)}
      ? sin(1.5707963 * (u / ${f(SURF_RISE)}))
      : cos(1.5707963 * ((u - ${f(SURF_RISE)}) / ${f(1 - SURF_RISE)}));
  }
`;

/**
 * A praia inteira, logo depois de a arte da areia ser lida (`diffuseColor` é a areia seca deste texel). Deixa em
 * `zsWaterMask` quanto deste texel é água à vista (as faíscas só caem nela) e em `zsSkyMask` quanto do céu ela devolve.
 */
export const SURF_GLSL = /* glsl */ `
  {
    vec2 zsCell = floor(vWorldFxPos.xz * 16.0);
    vec2 zsP = (zsCell + 0.5) / 16.0;
    vec2 zsUv = fract(zsP + 0.5);
    float zsC = mix(mix(vCoast4.x, vCoast4.y, zsUv.x), mix(vCoast4.w, vCoast4.z, zsUv.x), zsUv.y);
    float zsRag = zsHash(zsCell);
    float zsRag2 = zsHash(zsCell + 71.0);
    float zsX = zsP.x;
    float zsPhi = zsPhase(zsX);

    // ── a lâmina desta coluna da praia: que onda chegou por último, e onde a beira dela está agora ──
    float zsS0 = zsPhi / ${f(SURF_LENGTH)} + uFlowTime / ${f(SURF_PERIOD)};
    float zsN0 = floor(zsS0);
    float zsU = zsS0 - zsN0;
    float zsLobe = 0.5 + 0.5 * sin(0.9 * zsX + 2.1 * zsN0) * sin(0.37 * zsX + 1.3 * zsN0);
    float zsReach = ${f(SURF_RUNUP)} * zsAmp(zsN0) * (0.82 + 0.18 * zsLobe);
    float zsEdge = -zsReach * zsSwing(zsU) + ${f(SURF_DRAWDOWN)} * smoothstep(0.62, 1.0, zsU) + (zsRag - 0.5) * 0.09;
    float zsCover = step(zsEdge, zsC);
    float zsBehind = zsC - zsEdge;                       // quanto de água há atrás da beira, neste texel
    float zsRun = 1.0 - smoothstep(0.2, ${f(SURF_RISE + 0.12)}, zsU);  // 1 enquanto a lâmina sobe

    // ── a areia: seca, úmida (em dois degraus serrilhados) e o brilho do que a água acabou de largar ──
    vec3 zsSand = diffuseColor.rgb;
    vec3 zsWet = zsSand * vec3(0.56, 0.58, 0.62);
    float zsWetAt = -(${f(SURF_WET)} + 0.22 * sin(0.9 * zsX + 2.0));
    float zsDamp = step(zsWetAt + (zsRag2 - 0.5) * 0.24, zsC);
    float zsSoak = step(zsWetAt * 0.5 + (zsRag2 - 0.5) * 0.3, zsC);
    vec3 zsCol = mix(zsSand, mix(zsSand * vec3(0.80, 0.82, 0.85), zsWet, zsSoak), zsDamp);
    float zsSheen = (1.0 - zsCover) * smoothstep(zsEdge - 0.6, zsEdge, zsC) * step(-zsReach, zsC) * smoothstep(0.25, 0.55, zsU);
    zsCol = mix(zsCol, zsWet * 0.84 + vec3(0.028, 0.044, 0.056), zsSheen * 0.85);
    // o fio de espuma que a onda deixa onde chegou mais alto: quebrado, e some enquanto a água volta
    float zsLine = step(abs(zsC + zsReach - 0.03), 0.034) * step(0.4, zsRag) * step(${f(SURF_RISE)}, zsU)
      * (1.0 - smoothstep(0.6, 0.96, zsU));

    // ── a cor da fundura: a areia por baixo do raso, e o azul em degraus ──
    float zsB = zsC + (zsRag - 0.5) * 0.36 + 0.3 * sin(0.47 * zsX + 0.21 * uFlowTime);
    vec3 zsWater = mix(zsWet, ${AQUA}, 0.36);
    zsWater = mix(zsWater, mix(zsWet, ${TURQ}, 0.6), step(0.45, zsB));
    zsWater = mix(zsWater, mix(zsWet * 0.6, ${TURQ}, 0.86), step(1.25, zsB));
    zsWater = mix(zsWater, ${TEAL}, step(2.35, zsB));
    zsWater = mix(zsWater, ${MID}, step(3.8, zsB));
    zsWater = mix(zsWater, ${BLUE}, step(5.5, zsB));
    zsWater = mix(zsWater, ${DEEP}, step(7.8, zsB));
    // os riscos da água aberta (o desenho do mar do vale, feito aqui): andam em passo de texel, como a arte anda
    vec2 zsD = floor((zsCell + floor(uFlowTime * vec2(2.6, 1.1))) / vec2(3.0, 1.0));
    // (só perto: de longe um risco de três texels é menor que um pixel, e o mar inteiro chuviscaria)
    float zsOpen = smoothstep(0.9, 2.2, zsC) * (1.0 - smoothstep(16.0, 30.0, length(cameraPosition.xz - vWorldFxPos.xz)));
    zsWater = mix(zsWater, zsWater * 1.24 + vec3(0.0, 0.016, 0.02), step(0.93, zsHash(zsD)) * zsOpen * 0.7);
    zsWater *= 1.0 - 0.13 * step(0.95, zsHash(zsD + 37.0)) * zsOpen;
    // a ondulação larga do alto-mar
    float zsSwell = 0.5 + 0.5 * sin(zsP.x * 0.5 + zsP.y * 0.75 + uFlowTime * 0.85);
    zsWater *= 1.0 - 0.1 * step(0.7 + (zsRag - 0.5) * 0.2, zsSwell) * smoothstep(4.0, 6.5, zsC);

    // ── o trem de ondas: a crista, a face da frente na sombra, e a quebra ──
    // Perto da costa a onda segue a curva dela (\`zsC\`); mar adentro o campo acaba (ele mede até ${COAST_SEA_MAX} tiles) e a
    // onda vira o que ela é lá fora: frentes retas vindo do norte (\`uSurfRef\` é a linha média da água). É o que põe
    // fileiras de ondulação até o horizonte na câmera do mirante.
    float zsCw = mix(zsC, uSurfRef - vWorldFxPos.z, smoothstep(6.0, 9.5, zsC));
    float zsDist = length(cameraPosition.xz - vWorldFxPos.xz);
    // (de longe a crista engrossa, senão ela fica mais fina que um pixel e pisca; e some de vez na bruma)
    float zsWide = 1.0 + zsDist * 0.07;
    float zsS = (zsCw + zsPhi) / ${f(SURF_LENGTH)} + uFlowTime / ${f(SURF_PERIOD)};
    float zsN = floor(zsS);
    float zsF = zsS - zsN;                                // 0 na crista; cresce para trás dela (mar adentro)
    float zsA = zsAmp(zsN);
    float zsBreak = smoothstep(3.7, 1.15, zsC) * zsA;     // 0 lá fora, 1 quebrando
    float zsSeg = step(0.0, sin(0.55 * zsX + 5.3 * zsN) + 0.35 * sin(1.7 * zsX + 2.9 * zsN) + 0.25);
    float zsTrain = smoothstep(0.05, 0.55, zsC) * max(zsSeg, zsBreak) * (1.0 - smoothstep(50.0, 85.0, zsDist));
    float zsFace = step(0.87 - 0.05 * zsBreak, zsF) * (0.3 + 0.7 * zsBreak) * zsTrain;
    zsWater = mix(zsWater, zsWater * 0.72, zsFace);
    float zsCrest = step(zsF, min(0.3, (0.04 + 0.03 * zsA) * zsWide)) * zsTrain;
    zsWater = mix(zsWater, zsWater * 1.2 + vec3(0.016, 0.045, 0.048), zsCrest * (1.0 - zsBreak));
    float zsTrail = zsBreak * 0.48;
    float zsFoamCore = step(zsF, zsBreak * 0.12) * zsTrain;
    float zsFoamBack = step(zsF, zsTrail) * step(zsRag, pow(max(1.0 - zsF / max(zsTrail, 0.001), 0.0), 1.3) * 0.9 + 0.04) * zsTrain;

    // ── o espraio: a frente de espuma enquanto sobe, a renda atrás dela, e o fio fino na volta ──
    float zsNear = 1.0 - smoothstep(0.35, 1.1, zsC);
    float zsLead = step(zsBehind, 0.06 + 0.15 * zsRun);
    float zsLace = step(zsBehind, 0.9)
      * step(0.5 + 0.42 * zsBehind / 0.9 + 0.22 * zsU, zsHash(zsCell + zsN0 * 13.0))
      * (1.0 - smoothstep(0.62, 0.92, zsU));
    // ── quem está na água: ela abre nos pés e deixa a esteira (os corpos do mundo: o herói, os vizinhos, o gato) ──
    // A água do espraio CORRE: sobe a praia enquanto a lâmina avança e volta ao mar no refluxo. Em volta de um
    // tornozelo ela faz o que faz em volta de uma estaca: um colar de espuma do lado de onde vem, e duas réguas de
    // espuma abrindo em V do lado para onde vai, que somem a um tile e pouco dali. Em volta do corpo a renda de espuma
    // se abre (a água ali é lisa: foi o corpo que a rasgou), e é isso que deixa o desenho da esteira ler. Só no raso.
    float zsFlow = mix(-1.0, 1.0, zsRun);                  // +1: a água corre para a areia (o sul); -1: de volta ao mar
    float zsWake = 0.0;
    float zsCalm = 0.0;
    for (int zsI = 0; zsI < 4; zsI++) {
      vec4 zsBody = uStandActors[zsI];
      vec2 zsR = zsP - zsBody.xy;
      float zsRd = length(zsR * vec2(1.0, 1.45));          // de cima, o colar é uma elipse (a câmera achata o fundo)
      float zsAlong = zsR.y * zsFlow;                      // > 0: rio abaixo do corpo
      float zsCollar = step(abs(zsRd - 0.36), 0.055) * step(zsAlong, 0.1) * step(0.2, zsRag);
      float zsArm = abs(abs(zsR.x) - (0.26 + zsAlong * 0.3));
      float zsVee = step(0.05, zsAlong) * step(zsAlong, 1.35) * step(zsArm, 0.06)
        * step(zsRag2, 1.0 - zsAlong / 1.5);
      zsWake = max(zsWake, zsBody.w * max(zsCollar, zsVee));
      zsCalm = max(zsCalm, zsBody.w * (1.0 - smoothstep(0.55, 1.15, length(zsR * vec2(1.0, 0.8) - vec2(0.0, 0.3 * zsFlow)))));
    }
    float zsFoam = max(max(zsFoamCore, zsFoamBack * 0.86), max(zsLead, zsLace * 0.82 * (1.0 - 0.85 * zsCalm)) * zsNear);
    zsFoam = max(zsFoam, zsWake * zsNear * smoothstep(0.02, 0.1, zsBehind));
    zsWater = mix(zsWater, ${FOAM}, zsFoam);

    zsCol = mix(zsCol, zsWater, zsCover);
    zsCol = mix(zsCol, ${FOAM} * 0.9, zsLine * (1.0 - zsCover));
    diffuseColor.rgb = zsCol;
    zsWaterMask = zsCover * (1.0 - zsFoam);
    // O céu só no mar aberto, e pela metade: no raso quem manda é a areia do fundo e o desenho da onda, e uma nuvem
    // branca refletida ali lia como banco de areia (a foto do playtest \`praia\`).
    zsSkyMask = zsWaterMask * 0.4 * smoothstep(1.4, 5.0, zsC);
    zsShoreV = 0.0;
  }
`;

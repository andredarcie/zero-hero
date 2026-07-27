// A FLOR DA LUA — nove poses de UMA flor abrindo, e nao dois desenhos que se parecem.
//
// O defeito que este sheet existe pra corrigir: o botao fechado e a flor aberta eram dois desenhos
// independentes (um teardrop VERDE de perfil e uma roseta LILAS vista de cima), sem paleta,
// contagem de petalas nem silhueta em comum. O jogador nao lia dois estados da mesma planta; lia
// duas coisas diferentes trocando de lugar. Aqui existe UMA funcao de desenho — seis petalas
// presas num receptaculo, sobre um caule — e cada frame e essa mesma funcao avaliada num `t` de
// abertura. Fechado e aberto nao "se parecem": sao o mesmo desenho em dois instantes.
//
// ── Os dois bancos, e por que a projecao muda no meio ────────────────────────────────────────
// O jogo desenha o botao fechado num billboard EM PE (ele bloqueia: precisa de volume e sombra) e
// a flor aberta num quad DEITADO (ela e ponte: o heroi pisa em cima). Sao duas geometrias, e a
// diferenca nao e capricho — e a razao de o fechado ler como obstaculo e o aberto como chao.
//
//   frames 0..4  — banco EM PE: a projecao da camera do jogo esta ASSADA na arte (a profundidade
//                  do mundo vira altura na tela por DEPTH_UP), o pe do quad e o chao do tile e o
//                  caule aparece. Cobre t = 0 .. 0.52.
//   frames 5..8  — banco DEITADO: planta baixa pura, vista de cima, SEM projecao — o quad deitado
//                  do runtime ja e foreshortened pela propria geometria. Cobre t = 0.52 .. 1.
//
// O corte fica em t = 0.52 porque e o ultimo instante em que a petala da frente ainda esta no ar:
// abaixo disso a flor TEM altura (e o desenho em pe e o verdadeiro), acima disso ela esta caindo no
// chao (e a planta baixa e a verdadeira). O runtime dissolve um banco no outro em ~150ms em volta
// desse ponto, e a costura nao aparece porque dos dois lados esta a mesma flor no mesmo instante.
//
// ── O que este desenho aprendeu a NAO fazer (as tres tentativas anteriores) ──────────────────
// 1. Contornar tudo de ink. A 16px, um rim de 1px em volta de seis petalas come o sprite: a v1
//    fechada tinha 49 pixels de ink contra 8 de lilas. O ink agora existe so no lado da SOMBRA da
//    silhueta (a regra da casa: luz da esquerda, ultima linha escura ancora no chao) e nos vincos.
// 2. Vinco por diferenca de profundidade de VISAO. Dois pixels vizinhos de uma mesma petala
//    inclinada ja diferem muito nesse eixo, entao a regra marcava vinco em todo lugar. O vinco
//    olha a profundidade do MUNDO (z): dentro de uma petala ela quase nao muda, entre uma petala
//    da frente e uma de tras ela salta.
// 3. Highlight ao longo da petala inteira. Virava um floco de neve branco. O luar e um CLUSTER no
//    terco do meio da petala — "highlight de cilindro a ~20% da borda iluminada", como o barril.

const PAL = {
  K: '#1d2b53', // ink — lado da sombra da silhueta, vincos, e o lado escuro do caule
  P: '#8d6cd1', // lilas escuro — sombra da petala (a flor roxa do TILESET, pixel por pixel)
  Q: '#a884f3', // lilas base — massa da petala (idem tileset)
  W: '#cdcdcd', // bone — o luar na quilha da petala (a cor com que os pickups leem no escuro)
  G: '#f1cc36', // gold — o polen no centro
  Y: '#f8e394', // gold claro — o brilho do polen
  N: '#626439', // olive — sepalas e caule (o verde da grama do tileset)
  V: '#4d4f2c', // olive escuro — lado de sombra das sepalas e do caule
};

const PETALS = 6;
const PX = 16; // pixels por tile: 1px de arte = 1px de mundo

// Como a PROFUNDIDADE do mundo aparece como ALTURA na tela, na camera do jogo (camHeight/camBack
// = 8.4/7.6). E a mesma conversao que o braco robotico faz em runtime (depthToScreen); aqui ela
// tem de estar assada na arte, porque um sheet nao le os parametros da camera.
const DEPTH_UP = 1.105;

const L_PETAL = 0.37; // comprimento da petala em tiles — a roseta aberta enche o tile
const W_PETAL = 0.11; // meia-largura maxima
const L_SEPAL = 0.30;
const W_SEPAL = 0.07;
const E_HEAD = 0.40; // altura do receptaculo no botao fechado (o topo do caule)
const CUP = 0.9; // quanto a petala e calha quando fechada (0 = folha plana)

// Salto de profundidade DO MUNDO que caracteriza "uma petala na frente da outra" (em tiles).
const SEAM_MIN = 0.055;

// FILOTAXIA: a petala n fica por cima da n-1, sempre, na mesma ordem. Nao e um truque de desenho —
// e como uma flor real e montada, e e o que faz seis petalas lerem como seis petalas em vez de um
// hexagono roxo. O passo entra APENAS na ordenacao (nunca na posicao), por dois motivos: na planta
// baixa a altura nao move pixel nenhum (a projecao usa x e z), e no banco em pe ele desempata as
// petalas que estao na mesma profundidade — as de 0° e 180° tem z identico, e sem desempate a
// simetria perfeita fazia a pose do meio ler como uma CARINHA (dois olhos e uma boca).
// Precisa ser maior que SEAM_MIN, senao nao nasce vinco entre duas petalas vizinhas.
const ORDER_STEP = 0.075;

// A luz da casa: de cima e da esquerda, um tico na direcao da camera.
const LIGHT = (() => {
  const v = [-0.52, 0.74, 0.42];
  const n = Math.hypot(...v);
  return v.map((c) => c / n);
})();

const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const norm = (v) => {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
};
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * A linha do meio de uma petala/sepala, integrada por arco a partir de um perfil de pitch de TRES
 * pontos (base, meio, ponta). Tres e o minimo pra existir bojo: com dois, o pitch e monotono, a
 * petala fechada sobe reta e o botao fica com 3px de largura — um palito, nao um botao. Com o meio,
 * a petala sai pra fora no terco do meio e volta pra dentro na ponta: e assim que um botao real
 * fecha, e e de onde vem a silhueta de gota.
 */
const spine = (len, pBase, pMid, pTip) => {
  const STEPS = 28;
  const pts = [[0, 0]];
  let r = 0;
  let h = 0;
  for (let i = 1; i <= STEPS; i += 1) {
    const s = (i - 0.5) / STEPS;
    // Quadratica de Bezier no pitch (base → meio → ponta).
    const k = 1 - s;
    const phi = k * k * pBase + 2 * k * s * pMid + s * s * pTip;
    r += (Math.sin(phi) * len) / STEPS;
    h += (Math.cos(phi) * len) / STEPS;
    pts.push([r, h]);
  }
  return pts;
};

const petalSpine = (t) => spine(
  L_PETAL,
  lerp(0.72, 1.40, t), // base: 41° (bojo do botao) → 80° (quase deitada)
  lerp(0.55, 1.62, t),
  lerp(-0.78, 1.86, t), // ponta virada pra DENTRO (e ela que fecha o topo) → passando da horizontal
);

// As sepalas abrem MAIS que o botao de proposito: elas tem de escapar da silhueta das petalas nos
// dois extremos do ladder, porque o calice verde e a peca que continua igual do fechado ao aberto —
// e a assinatura de "e a mesma planta". Escondidas atras das petalas, elas nao dizem nada.
const sepalSpine = (t) => spine(
  L_SEPAL,
  lerp(1.05, 2.15, t), // flare em volta da base do botao → dobrada pra tras, por baixo das petalas
  lerp(0.95, 2.40, t),
  lerp(0.62, 2.60, t),
);

/** Meia-largura ao longo da petala: estreita na base, mais larga no terco do meio, PONTA fina. */
const halfWidth = (s, w) => w
  * (0.34 + 0.66 * Math.sin(Math.PI * Math.pow(s, 0.8)))
  * Math.min(1, (1.03 - s) / 0.24);

export default {
  name: 'moonflower',
  kind: 'prop',
  layout: 'row',
  palette: PAL,
  // As duas unicas cores fora do censo da paleta, e elas nao sao invencao: sao os dois pixels
  // lilas da flor roxa do forest_tile_set (B e K no dump do tileset). Nao entraram no censo porque
  // aparecem em poucos pixels de um arquivo so — o limiar do extrator, nao um julgamento de cor.
  allowNewColors: ['#a884f3', '#8d6cd1'],
  notes: 'Nove poses de UMA flor: frames 0-4 em pe (projecao da camera assada, com caule), 5-8 '
    + 'deitados em planta baixa. Lilas #a884f3/#8d6cd1 sao literalmente os dois pixels da flor '
    + 'roxa do forest_tile_set; o highlight e o bone #cdcdcd, a mesma cor com que os pickups '
    + 'existem a noite — que e o que uma flor que so abre no escuro precisa. Sem gradiente: '
    + 'lambert em tres degraus, vinco de ink onde uma petala passa na frente da outra, e ink na '
    + 'silhueta so do lado da sombra.',

  draw({ Pix, hexToRgb }) {
    const RGB = Object.fromEntries(Object.entries(PAL).map(([k, hex]) => [k, hexToRgb(hex)]));

    // Ids de elemento: cada petala a sua, sepalas todas com o MESMO id (elas formam um calice so —
    // um id por folhinha abriria uma franja de ink entre cada duas), centro e caule com o seu.
    const ID_SEPALS = 90;
    const ID_CORE = 91;
    const ID_STEM = 92;

    const frame = (t, standing) => {
      const size = 16;
      const n = size * size;
      const id = new Int16Array(n).fill(-1);
      const zbuf = new Float32Array(n).fill(-Infinity); // quem esta na frente (eixo de visao)
      const wz = new Float32Array(n); // profundidade do MUNDO, so pra decidir vinco
      const mat = new Array(n).fill(null);

      const headY = standing ? lerp(E_HEAD, 0.10, t) : 0;
      // O caule ARQUEIA no meio da abertura: a cabeca desce e o talo cede pro lado. E o unico
      // lugar em que a planta mostra que a queda das petalas tem PESO.
      const bow = 0.13 * Math.sin(Math.PI * t);

      // Projecao. Em pe: a profundidade do mundo vira altura na tela (DEPTH_UP) e o pe do frame e
      // o chao. Deitado: planta baixa crua, o quad deitado do runtime faz o resto.
      const project = standing
        ? (p) => [8 + PX * p[0], 15.9 - PX * (p[1] - DEPTH_UP * p[2])]
        : (p) => [8 + PX * p[0], 8 + PX * p[2]];
      // Quem esta na frente. Em pe e o eixo de visao da camera; deitado e simplesmente quem esta
      // por cima (uma petala mais alta cobre a que passa por baixo dela).
      const viewDepth = standing ? (p) => 0.741 * p[1] + 0.671 * p[2] : (p) => p[1];
      // Para o VINCO, a profundidade que conta e a do mundo na direcao da camera (deitado: a
      // altura). Dentro de uma mesma petala ela varia pouco; entre duas petalas empilhadas, salta.
      const seamDepth = standing ? (p) => p[2] : (p) => p[1];

      const plot = (p, elem, matKey, order = 0) => {
        const [fx, fy] = project(p);
        const x = Math.floor(fx);
        const y = Math.floor(fy);
        if (x < 0 || y < 0 || x >= size || y >= size) return;
        const i = y * size + x;
        const d = viewDepth(p) + order;
        if (d <= zbuf[i]) return;
        zbuf[i] = d;
        wz[i] = seamDepth(p) + order;
        id[i] = elem;
        mat[i] = matKey;
      };

      // ── o caule (so no banco em pe: deitada, a flor esta em cima dele) ────────────────────
      // Um talo de UM pixel: a silhueta do lado da sombra ja lhe da o segundo, e um caule de tres
      // pixels debaixo de um botao de cinco parecia um tronco.
      if (standing && headY > 0.14) {
        for (let k = 0; k <= 40; k += 1) {
          const v = k / 40;
          plot([bow * Math.sin(Math.PI * v), headY * v, 0], ID_STEM, 'N');
        }
      }

      // ── as sepalas (o calice verde: a peca que continua verde nos dois extremos) ───────────
      const sSpine = sepalSpine(t);
      for (let p = 0; p < PETALS; p += 1) {
        const ang = (p / PETALS) * Math.PI * 2 + Math.PI / PETALS;
        const rad = [Math.cos(ang), 0, Math.sin(ang)];
        const tan = [-Math.sin(ang), 0, Math.cos(ang)];
        for (let i = 0; i < sSpine.length; i += 1) {
          const s = i / (sSpine.length - 1);
          const [r, h] = sSpine[i];
          const hw = halfWidth(s, W_SEPAL);
          for (let u = -1; u <= 1.0001; u += 0.2) {
            const pt = [
              rad[0] * r + tan[0] * hw * u,
              headY + h,
              rad[2] * r + tan[2] * hw * u,
            ];
            // A sepala do lado da luz clareia; a do lado da sombra cai um degrau. Duas cores da
            // rampa olive, nunca meio-tom: "cada material sombreia com a propria rampa".
            // Ordem: por BAIXO de tudo — a sepala so aparece onde nenhuma petala a cobre.
            plot(pt, ID_SEPALS, rad[0] < 0 ? 'N' : 'V', -1);
          }
        }
      }

      // ── o receptaculo / polen ─────────────────────────────────────────────────────────────
      const rCore = lerp(0.04, 0.085, t);
      for (let a = 0; a < Math.PI * 2; a += 0.09) {
        for (let rr = 0; rr <= 1.0001; rr += 0.12) {
          const r = rCore * rr;
          const pt = [Math.cos(a) * r, headY + 0.02 * (1 - rr * rr), Math.sin(a) * r];
          // Cupula: claro em cima-esquerda, gold no resto. O polen e a unica coisa que cresce
          // monotonicamente com t, e por isso ele e o RELOGIO da abertura.
          const lit = Math.cos(a) < -0.1 && Math.sin(a) < -0.1 && rr > 0.3;
          // Ordem: DEITADA, por cima de todas as petalas — as bases se fecham em volta do
          // receptaculo e cobririam o polen, e um relogio tapado nao conta nada. EM PE, ordem
          // natural: o botao fechado tem de esconder o dourado, senao a flor entrega o fim da
          // animacao no primeiro frame (e o botao ficava com uma barriga amarela).
          plot(pt, ID_CORE, lit ? 'Y' : 'G', standing ? 0 : PETALS * ORDER_STEP + 0.5);
        }
      }

      // ── as petalas ────────────────────────────────────────────────────────────────────────
      const pSpine = petalSpine(t);
      // Fechada a petala e calha funda; aberta ela ACHATA, mas nunca vira folha de papel — sem um
      // resto de calha a flor aberta perde a quilha e as seis petalas ficam com o mesmo valor
      // chapado (uma petala plana tem normal pra cima, e ai o lambert nao distingue uma da outra).
      const cup = CUP * (1 - 0.62 * t);
      // As amostras da petala saem em DUAS passadas, e o motivo e o unico jeito de uma rampa de
      // tres degraus servir nove poses: os cortes sao PERCENTIS da propria pose, nao numeros fixos.
      //
      // Com limiares fixos o lambert nao cooperava nas duas pontas do ladder — a petala fechada e
      // quase vertical (pouca luz de cima: a pose inteira caia no degrau escuro, um botao chapado)
      // e a aberta e quase horizontal (muita: virava um floco branco). Percentil resolve os dois de
      // uma vez, e e exatamente o que a regra `value-range` do linter pede: usar a rampa INTEIRA em
      // todo frame. O que se mantem constante entre as poses e a PROPORCAO de luz e sombra, que e o
      // que faz a flor parecer o mesmo material do primeiro ao ultimo frame.
      const samples = [];
      for (let p = 0; p < PETALS; p += 1) {
        const ang = (p / PETALS) * Math.PI * 2;
        const rad = [Math.cos(ang), 0, Math.sin(ang)];
        const tan = [-Math.sin(ang), 0, Math.cos(ang)];
        for (let i = 0; i < pSpine.length; i += 1) {
          const s = i / (pSpine.length - 1);
          const [r, h] = pSpine[i];
          const hw = halfWidth(s, W_PETAL);
          // Tangente da linha do meio neste ponto → o triedro da superficie.
          const j = Math.min(pSpine.length - 1, i + 1);
          const k0 = Math.max(0, i - 1);
          const dr = pSpine[j][0] - pSpine[k0][0];
          const dh = pSpine[j][1] - pSpine[k0][1];
          const T = norm([rad[0] * dr, dh, rad[2] * dr]);
          // cross(tan, T), nao cross(T, tan): a ordem invertida devolve a normal apontando pra
          // BAIXO, o lambert dava ~0 na flor toda e as poses sairam chapadas no lilas escuro.
          const NRM = norm(cross(tan, T));
          for (let u = -1; u <= 1.0001; u += 0.1) {
            // A calha: as bordas sobem em relacao a quilha (u=0), e a normal gira com elas.
            const lift = cup * hw * (u * u) * 0.9;
            const pt = [
              rad[0] * r + tan[0] * hw * u + NRM[0] * lift,
              headY + h + NRM[1] * lift,
              rad[2] * r + tan[2] * hw * u + NRM[2] * lift,
            ];
            const sn = norm([
              NRM[0] + tan[0] * cup * 1.9 * u,
              NRM[1] + tan[1] * cup * 1.9 * u,
              NRM[2] + tan[2] * cup * 1.9 * u,
            ]);
            // Lambert + a regra da casa: a luz vem da ESQUERDA, entao o lado esquerdo da flor
            // inteira e um degrau mais claro que o direito, independente da normal local.
            const lam = Math.max(0, dot(sn, LIGHT)) + 0.10 * -rad[0];
            // A ponta da petala escurece um degrau: e o que faz a flor ter borda em vez de acabar
            // num halo.
            const v = clamp01(lam - (s > 0.86 ? 0.14 : 0));
            // O luar e um CLUSTER no terco do meio, nunca uma listra de ponta a ponta: a versao
            // sem essa janela virou um floco de neve branco de seis pontas.
            samples.push({ pt, petal: p, v, shoulder: s > 0.32 && s < 0.64 });
          }
        }
      }

      const pct = (arr, q) => {
        if (!arr.length) return Infinity;
        const sorted = arr.slice().sort((a, b) => a - b);
        return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
      };
      const qCut = pct(samples.map((s) => s.v), 0.5);
      const wCut = pct(samples.filter((s) => s.shoulder).map((s) => s.v), 0.82);
      for (const s of samples) {
        plot(
          s.pt,
          s.petal,
          s.shoulder && s.v >= wCut ? 'W' : s.v >= qCut ? 'Q' : 'P',
          s.petal * ORDER_STEP,
        );
      }

      // ── vinco de ink onde uma petala passa NA FRENTE de outra ──────────────────────────────
      // Quem perde o pixel e quem esta atras. Duas petalas vizinhas na mesma altura (a roseta
      // aberta) nao ganham vinco: elas se separam pelo VAO que existe entre as duas.
      const seam = [];
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const i = y * size + x;
          if (id[i] < 0) continue;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
            const k = ny * size + nx;
            if (id[k] < 0 || id[k] === id[i]) continue;
            if (wz[k] - wz[i] > SEAM_MIN) { seam.push(i); break; }
          }
        }
      }
      for (const i of seam) mat[i] = 'K';

      // ── silhueta ──────────────────────────────────────────────────────────────────────────
      // EM PE, ink so no lado da SOMBRA (direita e embaixo): um rim fechado de 1px em volta de seis
      // petalas nao caberia — a v1 do botao tinha 49 pixels de ink contra 8 de lilas —, e a direita
      // e embaixo e onde a casa sempre pos sombra; e tambem o que assenta o objeto no chao.
      //
      // DEITADA, o rim fecha. Aqui ele nao e enfeite: a flor aberta e um quad no CHAO, sem sombra
      // de contato e sem silhueta em pe pra separa-la do terreno, e sem o contorno inteiro a metade
      // de cima-esquerda dissolvia no tile e a roseta ficava torta. O sprite tambem esta no seu
      // frame mais cheio aqui, entao ele tem pixels de sobra pra pagar o contorno.
      const rim = [];
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const i = y * size + x;
          if (mat[i]) continue;
          const shade = (x > 0 && mat[i - 1]) || (y > 0 && mat[i - size]);
          const lit = (x < size - 1 && mat[i + 1]) || (y < size - 1 && mat[i + size]);
          if (shade || (!standing && lit)) rim.push(i);
        }
      }
      for (const i of rim) mat[i] = 'K';

      const pix = new Pix(size, size);
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          const m = mat[y * size + x];
          if (m) pix.set(x, y, RGB[m]);
        }
      }
      return pix;
    };

    // Os dois bancos. O corte em 0.52 e o ultimo instante em que a petala da frente ainda esta no
    // ar — daqui pra cima a flor esta caindo no chao e quem conta a verdade e a planta baixa.
    const HANDOFF = 0.52;
    const standing = [0, 0.13, 0.26, 0.39, HANDOFF].map((t) => frame(t, true));
    const lying = [HANDOFF, 0.68, 0.84, 1].map((t) => frame(t, false));
    return [...standing, ...lying];
  },
};

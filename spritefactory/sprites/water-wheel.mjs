// Roda d'agua + dinamo — uma maquina completa dentro de UM tile 16x16.
//
// A folha tem dois bancos de oito frames:
//   0..7   = rotor sem energia, lampada apagada;
//   8..15  = as mesmas oito orientacoes, lampada verde.
//
// Duplicar o banco parece desperdicio, mas preserva uma qualidade importante: se a agua some,
// a roda desacelera e para EXATAMENTE na orientacao em que estava; apenas a lampada apaga. Um
// frame "off" unico faria o rotor teleportar toda vez que a corrente parasse.
//
// A silhueta mistura tres materiais sem sair da linguagem do jogo: aro/cavalete na rampa wood,
// eixo/carcaça na rampa stone e estrutura/contato em ink navy. O aro recebe cluster shading com
// luz no alto/esquerda; nao ha outline preto, degradê, alpha parcial ou pixel fora da paleta.

const PAL = {
  K: '#1d2b53', // ink — estrutura, rebaixo e contato
  D: '#63452c', // wood escuro — lado de sombra / pas
  M: '#815938', // wood medio — massa do aro e raios
  L: '#b7916a', // wood claro — aresta sob a luz da esquerda
  s: '#5d6165', // stone escura — lateral do dinamo
  S: '#7c7e8b', // stone media — carcaca
  H: '#989aa7', // stone clara — bevel e eixo
  G: '#7dde99', // lampada de energia (mesmo verde ativo da placa)
};

const PHASES = 8;
const CX = 6.5;
const CY = 6.5;

const line = (pix, x0, y0, x1, y1, rgb) => {
  let x = Math.round(x0);
  let y = Math.round(y0);
  const tx = Math.round(x1);
  const ty = Math.round(y1);
  const dx = Math.abs(tx - x);
  const sx = x < tx ? 1 : -1;
  const dy = -Math.abs(ty - y);
  const sy = y < ty ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    pix.set(x, y, rgb);
    if (x === tx && y === ty) break;
    const beforeX = x;
    const beforeY = y;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
    // Um passo diagonal puro toca so pelo canto e vira pixel "orfao" no vocabulario 4-neighbour
    // da fabrica. Preencher o cotovelo transforma a diagonal numa escada continua — exatamente
    // como os L-steps usados nas laminas do mato alto.
    if (x !== beforeX && y !== beforeY) pix.set(x, beforeY, rgb);
  }
};

export default {
  name: 'water-wheel',
  kind: 'prop',
  layout: 'row',
  palette: PAL,
  draw({ Pix, hexToRgb }) {
    const c = Object.fromEntries(Object.entries(PAL).map(([key, hex]) => [key, hexToRgb(hex)]));

    const drawFrame = (phase, powered) => {
      const pix = new Pix(16, 16);

      // Cavalete primeiro, atras do rotor. Pernas abertas dizem peso; a travessa de baixo ancora
      // a maquina no solo em vez de deixa-la flutuar como um icone.
      line(pix, 4, 7, 2, 13, c.D);
      line(pix, 8, 7, 10, 13, c.D);
      line(pix, 5, 8, 4, 13, c.M);
      line(pix, 8, 8, 8, 13, c.M);
      pix.hline(2, 10, 13, c.K);

      // O rotor avanca 1/8 de um quarto de volta por frame. Quatro raios fazem a folha fechar
      // sem tranco no loop (a forma tem periodo de 90 graus), mas cada passo ainda muda pixels.
      const angle = phase * (Math.PI / 16);
      for (let i = 0; i < 4; i += 1) {
        const a = angle + i * Math.PI / 2;
        const ex = CX + Math.cos(a) * 4.35;
        const ey = CY + Math.sin(a) * 4.35;
        const spoke = Math.cos(a) < -0.15 || Math.sin(a) < -0.55 ? c.L
          : (Math.cos(a) > 0.45 || Math.sin(a) > 0.55 ? c.D : c.M);
        line(pix, CX, CY, ex, ey, spoke);
      }

      // Aro de duas camadas. A cor segue a superficie: alto/esquerda claro, frente media,
      // baixo/direita escuro. Sao clusters de forma, nao listras decorativas.
      for (let y = 0; y < 16; y += 1) {
        for (let x = 0; x < 16; x += 1) {
          const dx = x + 0.5 - CX;
          const dy = y + 0.5 - CY;
          const d = Math.hypot(dx, dy);
          if (d < 4.45 || d > 5.75) continue;
          const wood = dx < -1.7 || dy < -3.5 ? c.L : (dx > 2.5 || dy > 3.7 ? c.D : c.M);
          pix.set(x, y, wood);
        }
      }

      // Oito caçambas tangenciais quebram a silhueta circular e dizem "a agua empurra isto".
      // Elas giram junto dos raios; cada uma e um pequeno cluster conectado ao aro, nunca ruido.
      for (let i = 0; i < 8; i += 1) {
        const a = angle + i * Math.PI / 4;
        const bx = Math.round(CX + Math.cos(a) * 5.25 - 0.5);
        const by = Math.round(CY + Math.sin(a) * 5.25 - 0.5);
        const tx = Math.round(-Math.sin(a));
        const ty = Math.round(Math.cos(a));
        const bucket = Math.cos(a) < -0.2 || Math.sin(a) < -0.65 ? c.L : c.D;
        pix.set(bx, by, bucket);
        pix.set(bx + tx, by + ty, bucket);
      }

      // Cubo e eixo metalicos: o disco tampa com intencao o encontro dos raios, como uma junta
      // mecanica real. O pixel claro a esquerda preserva a direcao de luz do mundo.
      pix.ellipse(CX, CY, 1.55, 1.55, c.K);
      pix.set(6, 5, c.H); pix.set(7, 5, c.H);
      pix.set(5, 6, c.H); pix.set(6, 6, c.S); pix.set(7, 6, c.S); pix.set(8, 6, c.s);
      pix.set(5, 7, c.S); pix.set(6, 7, c.S); pix.set(7, 7, c.s); pix.set(8, 7, c.s);
      pix.set(6, 8, c.s); pix.set(7, 8, c.s);

      // Dinamo em primeiro plano, ligado ao eixo no lado direito. A forma retangular, o bevel e
      // a lampada diferenciam a maquina de uma pedra. A base escura compartilha o contato do
      // cavalete, fazendo as duas partes assentarem no mesmo chao.
      pix.hline(10, 13, 8, c.H);
      pix.set(14, 9, c.s);
      pix.fillRect(10, 9, 4, 1, c.H);
      pix.fillRect(10, 10, 4, 3, c.S);
      pix.vline(14, 10, 12, c.s);
      pix.vline(10, 10, 12, c.H);
      pix.set(12, 10, c.K);
      pix.set(13, 10, powered ? c.G : c.s);
      pix.set(12, 11, c.K);
      pix.set(13, 11, powered ? c.G : c.K);
      pix.hline(10, 14, 13, c.K);

      return pix;
    };

    const off = Array.from({ length: PHASES }, (_, phase) => drawFrame(phase, false));
    const on = Array.from({ length: PHASES }, (_, phase) => drawFrame(phase, true));
    return [...off, ...on];
  },
  notes: 'Roda d agua bancaria com oito orientacoes fisicas do rotor, duplicadas em bancos off/on '
    + 'para a lampada mudar sem teleportar a roda. Aro e cavalete usam toda a ramp wood com '
    + 'cluster shading; eixo/dinamo usam stone; indicador compartilha o verde ativo da placa. '
    + 'Quatro raios, oito cacambas tangenciais, cubo metalico e carcaca retangular mantem leitura '
    + 'de maquina em 16x16, alpha binario e no maximo oito cores canonicas por frame.',
};

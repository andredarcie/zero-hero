import * as THREE from 'three';

// ── Pixel-art granite for the 3D stone ford ───────────────────────────────────
//
// The sibling of woodTexture.ts, and for the same reason. The bridge deck is real box
// geometry wearing painted pixel art; the stone ford has to be real box geometry too, or it
// goes back to being a camera-facing card standing in the river — a sticker of a rock, which
// is exactly what the first cut looked like next to the deck's actual carpentry.
//
// The palette is WET river granite, and it is deliberately DARK — pitched to the same value
// range as the wood next to it (whose brightest plank is only #966b48). The first cut used the
// pale greys of rock.png (#b9bec4 crown) and the result was a stone that blew out to a glowing
// white blob at night: near-white pixels cross the post chain's bloom threshold, so a "stone"
// lit itself up like a lantern in the middle of a dark river. Stone in water is dark stone.
//
//   #79818a damp crown · #5c636b body · #454b52 shaded flank · #313740 waterline / crevice
//
// Two patterns, because a ford is not one tile of "stone" — it is a big worn SLAB you step on
// with smaller boulders wedged around it holding it in the current. The slab is lighter and
// smoother on top (that is the face you actually see from up here); the boulders are rounder,
// darker, and take a fleck of moss, so the group reads as river rock and not cut masonry.

export type StoneKind = 'slab' | 'boulder' | 'stair';

const PALETTE: Record<string, [number, number, number]> = {
  H: [0x79, 0x81, 0x8a], // damp crown — the lightest pixel on the whole ford
  M: [0x5c, 0x63, 0x6b], // body
  D: [0x45, 0x4b, 0x52], // shaded flank
  S: [0x31, 0x37, 0x40], // crevice / waterline
  G: [0x4c, 0x58, 0x42], // a fleck of river moss

  // ── A PEDRA DA ESCADA: uma ESCADA DE VALORES, e nao seis tons soltos ──────
  // Estes tons vieram da rocha do mundo (spritefactory/sprites/rock.mjs) copiados TAL E QUAL, e
  // isso foi um erro de leitura: na rocha os tons claros sao meia duzia de pixels no teto de um
  // seixo, aqui eles viravam a FACE INTEIRA de um meio-fio de meio tile. O resultado, medido na
  // tela, era uma peca de porcelana branca (#d8d8dc depois da luz) que atravessava o corte do
  // bloom e virava um borrao aceso na grama — exatamente o defeito que a rampa molhada la de cima
  // foi pitchada para evitar, so que na escada ninguem tinha refeito a conta.
  //
  // A rampa de hoje desce a coroa em 35% e ganha DOIS degraus embaixo (junta e greta), porque o
  // que faltava nao era so claridade a menos: era contraste interno. Sete degraus de ~18 de luma
  // cada, do quartzo a greta, e todos abaixo do corte do bloom.
  //
  // O NUMERO foi medido na tela, e nao escolhido: a luz deste mundo multiplica a arte por ~1,54
  // (Lambert + ambiente + a fogueira mais proxima), e a alvenaria de montanha ao lado da escada
  // — que e a referencia, porque as duas aparecem na mesma tela — pousa em ~#b0b4b8. Uma coroa de
  // #6f7382 sai em #ac b0 bd: a mesma pedra, no mesmo lugar da tela. A coroa anterior (#a9abbe)
  // saia em #d8d8dc, que e branco de porcelana, e o bloom ainda punha um halo em volta.
  q: [0x83, 0x87, 0x95], // quartzo: o glint, a conta-gotas
  h: [0x6f, 0x73, 0x82], // coroa — o plano que a camera mais ve
  m: [0x5c, 0x60, 0x6e], // corpo
  s: [0x4a, 0x4e, 0x5a], // sombra
  d: [0x3a, 0x3e, 0x48], // rebordo
  k: [0x2b, 0x2e, 0x36], // junta entre blocos
  j: [0x1c, 0x1e, 0x24], // greta: o fundo da junta, onde a luz nao entra
};

// Authored TOP-DOWN, like the wood: first row is the far (north) edge of the box's top face.
const PATTERNS: Record<StoneKind, string[]> = {
  // The stepping face: worn smooth and pale in the middle, dark and wet around the rim, with
  // a couple of cracks and a patch of moss where the water licks it.
  slab: [
    'SDDMMMMHHMMMMDDS',
    'DMMHHHHHHHHMHMMD',
    'DMHHHMHHHHHHHMMD',
    'MMHHHHHSHHHHHHMD',
    'DMHHMHHHHHHHHHMD',
    'DMMHHHHHHHHHHMGD',
    'DGMMHHHHHHHMMMGD',
    'SDDMMMMMMMMMDDSS',
  ],
  /**
   * A ALVENARIA DA ESCADA — 16×16, que e EXATAMENTE um tile de arte do mundo.
   *
   * Ela e a unica pedra daqui feita para ser RECORTADA (ver `pixelTiled` em World3D.addBox): cada
   * caixa da escada tira dela um pedaco do tamanho que ocupa, na densidade do mundo. Por isso ela
   * e quadrada e ciclica nos dois eixos — a junta de baixo casa com a de cima, e a da direita com
   * a da esquerda —, senao um meio-fio de um tile de comprimento mostraria a emenda.
   *
   * ── A FOLHA E UM TECLADO DE VALORES, E ESSA E A IDEIA INTEIRA ──────────────
   *
   * A versao anterior tinha blocos bonitos e tons espalhados sem regra, e quem escolhia o recorte
   * de uma peca estava adivinhando o tom que ia sair. Numa peca cujas faces medem UM ou DOIS
   * texels de altura (um meio-fio de 0,1 tile mostra 1,6 texel), o recorte NAO mostra um bloco:
   * ele mostra uma LINHA. Entao a folha foi reautorada por linha, em quatro fiadas de quatro:
   *
   *     linha 4c+0  coroa   (h, com um glint de quartzo)   ← o tom mais claro
   *     linha 4c+1  corpo   (m)
   *     linha 4c+2  sombra  (s)
   *     linha 4c+3  junta   (k, com gretas j)              ← o tom mais escuro
   *
   * Recortar a linha 0 e pedir "claro"; a 2, "escuro"; a 3, "quase preto". A pisada de um degrau
   * tira coroa, o espelho dele tira sombra, e a diferenca entre os dois e o que faz um degrau ser
   * um degrau numa camera que olha de cima. As juntas VERTICAIS andam de fiada em fiada (colunas
   * 3/11, 7/15, 1/9, 5/13) — fiada alternada de verdade, entao duas pecas vizinhas que peguem
   * linhas diferentes tambem pegam juntas em lugares diferentes, e a alvenaria nao repete.
   */
  stair: [
    'hhhkhhqhhhhkhhqh',
    'mmmkmmmmsmmkmmmm',
    'ssskssssssskdsss',
    'kkkkkjkkkkkkjkkk',
    'hhqhhhhkhhqhhhhk',
    'mmmsmmmkmmmmmmmk',
    'sssssssksssdsssk',
    'kjkkkkkkkjkkkkkk',
    'hkhhhqhhhkhhhqhh',
    'mkmmmmmmmkmmmmsm',
    'skssssdsskssssss',
    'kkkkjkkkkkkkjkkk',
    'qhhhhkhhhqhhhkhh',
    'mmmmmkmmmmsmmkmm',
    'ssdsskssssssskss',
    'kkkkkkkjkkkkkkjk',
  ],
  // A rounder rock, mostly in shadow: lit only along its crown, soaked dark at the base.
  boulder: [
    'SDMMHHMMDS',
    'DMHHHHHHMD',
    'DMHHHHHMMD',
    'SDMMHHMMGD',
    'SSDDMMDDSS',
  ],
};

const cache = new Map<StoneKind, THREE.DataTexture>();

/** The pixel-art granite texture for one part of the stone ford (cached). */
export const getStoneTexture = (kind: StoneKind): THREE.DataTexture => {
  const hit = cache.get(kind);
  if (hit) return hit;

  const rows = PATTERNS[kind];
  const h = rows.length;
  const w = rows[0].length;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    // DataTexture row 0 is v=0 (the bottom/near edge); the art is authored top-down.
    const line = rows[h - 1 - y];
    for (let x = 0; x < w; x++) {
      const [r, g, b] = PALETTE[line[x]];
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  cache.set(kind, tex);
  return tex;
};

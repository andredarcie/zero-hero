// O monte de plantio — a semente coberta: um domo baixo de terra fresca sobre o buraco,
// com o brilho dourado da semente espiando na crista (a marca de "aqui esta plantado";
// o codigo escurece o monte quando regado). Ancora de forma: rock.png — lado claro /
// lado escuro com aresta dura, ultima linha escura ancorando no chao. A ramp de terra
// sobe ate #815938 (wood base) na crista para nao ficar chapado (licao do barril v3).

export default {
  name: 'plant-mound',
  kind: 'prop',
  palette: {
    T: '#815938', // crista iluminada — topo da ramp de terra
    L: '#63452c', // terra clara (lado da luz)
    M: '#452939', // terra base (nightsoil claro)
    E: '#3e2533', // sombra (nightsoil escuro)
    G: '#f1cc36', // a semente espiando na crista
  },
  frames: [[
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '.......GG.......',
    '.....TTTLLM.....',
    '....TTLLLLMM....',
    '...TLLLLLMMME...',
    '...LLLLLMMMME...',
    '..LLLLLMMMMMEE..',
    '...MMEEEEEEEE...',
    '................',
    '................',
  ]],
  notes: 'v2 apos o linter (v1 leu chapado: nightsoil dominava). A luz agora envolve ~60% do domo '
    + '— terra recem-amontoada e fofa e clara — com a crista #815938 a ~20% da borda iluminada; '
    + 'a sombra nightsoil fica so na encosta direita e a linha de contato escurece para a direita '
    + '(o lado da luz toca o chao em #452939, o da sombra em #3e2533 — rock.png faz igual). '
    + 'Os 2px gold sao a semente coberta aparecendo — o estado "plantado, me regue" em 1 olhada.',
};

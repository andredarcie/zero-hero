// Importa os sons de COMBATE para public/assets/audio/combat/.
//
//   node tools/import-combat-sfx.mjs "<pasta do RPG Sound Pack>" "<pasta dos 512 sons>"
//
// ── OS DOIS PACOTES, E POR QUE SAO DOIS ────────────────────────────────────
//
// [fantasy] "RPG Sound Pack" de artisticdude — CC0, 192 sons.
//           https://opengameart.org/content/rpg-sound-pack
//           E o pacote PRINCIPAL, e ele manda em tudo que este jogo faz: espada balancando,
//           magia, e um bestiario inteiro em pastas por criatura (`NPC/shade` o espectro,
//           `NPC/slime` a gosma, `NPC/beetle` o inseto, `NPC/gutteral beast` o bicho).
//
// [retro]   "The Essential Retro Video Game Sound Effects Collection [512 sounds]" de Juhani
//           Junkala — CC0. https://opengameart.org/content/512-sound-effects-8-bit-style
//           Sobrou em SEIS sons, e so nos IMPACTOS: o pacote de fantasia tem golpe e criatura,
//           mas nao tem nenhuma pancada — nada de lamina encontrando corpo, corpo encontrando
//           parede. As seis que ficaram sao percussivas e neutras ("Simple Damage Sounds",
//           "Impacts"), sem nada de espacial nelas.
//
// Uma versao anterior deste arquivo usava o pacote retro em TUDO, e o jogador acertou o
// diagnostico numa frase: "tem sons futuristas estranhos". Estava certo — aquele pacote e de
// fliperama/nave, e o combate tinha acabado com LASER no feitico do mago, LASER no cuspe do zora,
// ALARME no telegrafo da caveira e GRITO DE ALIENIGENA na morte. Cada um desses agora vem do
// bestiario de fantasia, que e onde eles sempre deveriam ter vindo.
//
// ── COMO OS SONS FORAM ESCOLHIDOS, E O QUE ISSO NAO GARANTE ────────────────
//
// Por NOME e por MEDIDA, nao por ouvido — quem montou esta tabela nao podia ouvir os arquivos.
// A regra: so entra som cuja PASTA no pacote descreve o gesto sem ambiguidade, e cada escolha e
// conferida contra numeros (duracao, pico, RMS, centroide espectral). Ja custou caro quebra-la
// uma vez: `ground-crack` saiu de "Explosions" porque a MEDIDA batia (grave, longo, continuo), e
// virou uma bomba de 2,1s tocando na abertura de toda partida. O nome da pasta ganha da medida.
//
// O que isso nao garante e timbre. Trocar um som e uma linha do MAP mais um re-run.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * SUBPASTA PROPRIA, e ela e uma trava e nao arrumacao: o `gen-sfx.mjs` escreve na raiz de
 * `audio/` e o CREDITS manda roda-lo depois de mexer nos presets. Um som importado com o nome de
 * um gerado seria apagado em silencio na primeira regeneracao.
 */
const OUT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'audio', 'combat',
);
/** O formato da casa: mono, 44.1 kHz, 16-bit. */
const RATE = 44100;
/**
 * NORMALIZA POR ALTO-FALANCIA, NAO POR PICO — e esta linha e a que faz dois pacotes virarem um.
 *
 * Normalizar pelo pico parece justo e nao e: ele so mede a amostra mais alta do arquivo. O pacote
 * de fantasia sao gravacoes ORGANICAS (transiente curto, cauda longa, muito espaco entre os dois),
 * e o retro e material denso e comprimido. Alinhados pelo pico, os dois ficam com 20 a 30 dB de
 * diferenca de volume PERCEBIDO: a espadada sumia e o baque do acerto estourava, com os dois
 * marcados "-1 dBFS".
 *
 * Entao a referencia e o RMS da JANELA MAIS ALTA de 150ms — o trecho que o ouvido usa pra decidir
 * quao alto algo e —, e nao a media do arquivo inteiro (que puniria qualquer som com cauda ou
 * silencio no fim, que e metade deste conjunto).
 */
const TARGET_RMS_DBFS = -12;
/** Janela em que a alto-falancia e medida. Curta o bastante pra pegar o corpo do som, e nao a cauda. */
const RMS_WINDOW_MS = 150;
/**
 * O TETO, e ele e SATURACAO e nao corte. Subir pelo RMS empurra os transientes acima de 0 dBFS, e
 * cortar ali quadraria a onda (que e distorcao suja). O `tanh` dobra o pico suavemente, que e
 * exatamente o que o `gen-sfx.mjs` ja faz no fim de cada som gerado — mesma casa, mesma tecnica.
 */
const CEILING_DBFS = -1;
const DRIVE = 1.5;
/** Fade na ponta de um corte, pra nunca sair estalo onde o arquivo foi cortado no meio. */
const TRIM_FADE_MS = 22;

// pack: de qual pacote · from: caminho dentro dele · to: o arquivo final · trimMs: corta o inicio
// (o resto e descartado com fade) · why: por que este som.
const MAP = [
  // ── A MAO DO HEROI (battle/) ─────────────────────────────────────────────
  // Tres balancos de espada de verdade, e a ordem entre eles e de PESO: o soco e o mais leve e
  // agudo (nao tem lamina), a espadada e a media e mais escura (tem), e o giro e a mais longa.
  {
    pack: 'fantasy',
    from: 'battle/swing2.wav',
    to: 'sword-swing.wav',
    why: 'A ESPADADA — o som mais ouvido do combate. O mais GRAVE dos tres balancos (146ms, '
      + '397Hz): peso de lamina, contra os 553Hz do soco que nao tem nenhuma.',
  },
  {
    pack: 'fantasy',
    from: 'battle/swing3.wav',
    to: 'fist-swing.wav',
    why: 'O SOCO. O balanco mais curto e mais agudo (138ms, 553Hz) — ar deslocado sem massa de '
      + 'metal na frente. O jogo tocava o som da ESPADA aqui: a arma que o heroi nao tem soava '
      + 'igual a que ele tem.',
  },
  {
    pack: 'fantasy',
    from: 'battle/swing.wav',
    to: 'spin-release.wav',
    why: 'A LAMINA RODOPIANTE. O balanco mais LONGO (229ms) para o gesto mais longo — o giro varre '
      + '540 graus e oito tiles.',
  },
  {
    pack: 'fantasy',
    from: 'battle/sword-unsheathe2.wav',
    to: 'guard-block.wav',
    trimMs: 170,
    why: 'O APARO. O ataque de um desembainhar e metal vibrando agudo (4123Hz) — cortado nos '
      + 'primeiros 170ms sobra exatamente o tim, sem a cauda do gesto. Agudo e curto: o oposto '
      + 'do baque grave de um acerto, que e a recusa que ele precisa nao ser confundido com.',
  },
  {
    pack: 'fantasy',
    from: 'interface/interface1.wav',
    to: 'spin-ready.wav',
    why: 'A LAMINA CARREGADA. O aviso mais curto e limpo do pacote (186ms) — um sino, e nao um '
      + 'zumbido: zumbido ja e a lingua da maquina neste jogo, e este som pertence ao heroi.',
  },
  // ── O BESTIARIO, EM PASTAS POR CRIATURA ──────────────────────────────────
  // E aqui que este pacote ganha do outro por completo: a gosma tem som de gosma, o inseto tem
  // som de inseto, e o morto-vivo tem o `shade` — o espectro, que e literalmente o que ele e.
  {
    pack: 'fantasy',
    from: 'NPC/shade/shade1.wav',
    to: 'undead-windup.wav',
    trimMs: 460,
    why: 'O TELEGRAFO DO GOLPE — o aviso mais importante do combate. Um SIBILO DE ESPECTRO, que e '
      + 'o que a caveira e; antes disto era um alarme de pouca-vida de jogo de nave. Cortado em '
      + '460ms para caber na janela de 500 e acabar junto com o anel que fecha no chao.',
  },
  {
    pack: 'fantasy',
    from: 'NPC/shade/shade13.wav',
    to: 'undead-spawn.wav',
    trimMs: 780,
    why: 'A CAVEIRA SAINDO DO CHAO. O espectro mais grave e mais longo (370Hz), cortado nos 780ms '
      + 'da animacao de sair. Mesma criatura do telegrafo, outra frase.',
  },
  {
    pack: 'fantasy',
    from: 'NPC/gutteral beast/mnstr1.wav',
    to: 'enemy-death.wav',
    why: 'A MORTE do inimigo (438ms) — um estertor de bicho. Antes era um grito de ALIENIGENA, o '
      + 'som mais fora de lugar que este jogo ja teve.',
  },
  {
    pack: 'fantasy',
    from: 'NPC/gutteral beast/mnstr15.wav',
    to: 'undead-whiff.wav',
    trimMs: 260,
    why: 'O GOLPE QUE MORDEU AR. Um grunhido curto do bicho, e nao mais um sopro: quem errou foi '
      + 'ELE, e e ele que reclama. Cortado a 260ms — a frustracao e o comeco do som.',
  },
  {
    pack: 'fantasy',
    from: 'NPC/gutteral beast/mnstr12.wav',
    to: 'creature-arrive.wav',
    trimMs: 300,
    why: 'A CHEGADA de um corpo que nao vem de baixo. Um bufo curto assentando no tile (300ms). A '
      + 'caveira nao usa este — ela nasce do chao e tem o proprio.',
  },
  {
    pack: 'fantasy',
    from: 'NPC/beetle/bite-small2.wav',
    to: 'spider-pounce.wav',
    why: 'O BOTE DA ARANHA, e nao ha o que discutir: o pacote tem uma pasta chamada `beetle`. '
      + '348ms a 2976Hz — estalo seco de quitina, exatamente o registro de um inseto.',
  },
  {
    pack: 'fantasy',
    from: 'NPC/slime/slime3.wav',
    to: 'slime-hop.wav',
    why: 'O SALTO DA GOSMA, da pasta `slime`. 252ms de coisa molhada se movendo — o unico som '
      + 'deste conjunto que nao precisou de nenhuma interpretacao.',
  },
  // ── MAGIA E AGUA ─────────────────────────────────────────────────────────
  {
    pack: 'fantasy',
    from: 'battle/spell.wav',
    to: 'spell-windup.wav',
    trimMs: 400,
    why: 'A CONJURACAO DO MAGO. Um FEITICO carregando, cortado nos 400ms do telegrafo de 420. O '
      + 'arquivo inteiro tem 3,25s: o comeco e a carga, e e so a carga que este gesto quer.',
  },
  {
    pack: 'fantasy',
    from: 'battle/magic1.wav',
    to: 'enemy-shot.wav',
    trimMs: 220,
    why: 'O DISPARO — a bola do mago, a bala da torreta, o cuspe do zora saindo. O ataque de um '
      + 'som de magia (220ms), porque o voo ja e visivel: o som so marca o instante da saida.',
  },
  {
    pack: 'fantasy',
    from: 'world/door.wav',
    to: 'turret-charge.wav',
    trimMs: 350,
    why: 'A CARGA DA TORRETA — e **a escolha mais discutivel desta tabela**. A torreta e a unica '
      + 'MAQUINA de um bestiario de fantasia, e o pacote nao tem maquina: o rangido de uma porta '
      + 'e o mecanismo sob tensao mais proximo que existe nele. 350ms contra a janela de 350, e '
      + 'grave o bastante (1784Hz cortado no ataque) pra nao se confundir com a magia do mago '
      + '(que e a outra carga do jogo). Se soar como porta, e a primeira linha a trocar.',
  },
  {
    pack: 'fantasy',
    from: 'inventory/bubble.wav',
    to: 'zora-surface.wav',
    trimMs: 300,
    why: 'O ZORA ROMPENDO A AGUA. O pacote retro nao tinha AGUA nenhuma e este tem borbulha — o '
      + 'som tem de ser discreto (e o unico aviso de que o rio tem coisa dentro), entao entra '
      + 'cortado a 300ms.',
  },
  {
    pack: 'fantasy',
    from: 'inventory/bubble2.wav',
    to: 'zora-spit.wav',
    trimMs: 380,
    why: 'A BOCA DO ZORA ABRINDO. A borbulha mais GRAVE (271Hz) contra a de emergir, e cortada em '
      + '380ms para caber no telegrafo de 400. Duas aguas, duas alturas: uma anuncia onde ele '
      + 'vai subir, a outra que o cuspe vem.',
  },

  // ── OS IMPACTOS, E POR QUE ELES VEM DO OUTRO PACOTE ──────────────────────
  //
  // O pacote de fantasia tem golpe e tem criatura, mas nao tem PANCADA: nao ha nele lamina
  // encontrando corpo nem corpo encontrando parede. Estes seis sao percussivos e neutros — thuds
  // e impactos secos, sem nada de espacial —, e sao o unico lugar onde o pacote retro sobreviveu.
  //
  // As tres alturas abaixo sao a coisa mais importante deste bloco: o acerto que ENTRA e grave
  // (308Hz), o resvalo nos i-frames e medio (640Hz) e o aparo e agudo (o desembainhar, 4123Hz).
  // Tres respostas no mesmo ponto da tela, tres alturas — e da pra saber qual foi sem olhar.
  {
    pack: 'retro',
    from: 'General Sounds/Simple Damage Sounds/sfx_damage_hit3.wav',
    to: 'enemy-hit.wav',
    why: 'O ACERTO. O mais GRAVE dos dez sons de dano (114ms, 308Hz) — um baque seco, sem timbre '
      + 'de fliperama.',
  },
  {
    pack: 'retro',
    from: 'General Sounds/Impacts/sfx_sounds_impact3.wav',
    to: 'blade-glance.wav',
    why: 'O RESVALO nos i-frames. O impacto mais CURTO do pacote (46ms, 640Hz): a lamina escorrega '
      + 'e nao morde.',
  },
  {
    pack: 'retro',
    from: 'General Sounds/Impacts/sfx_sounds_impact1.wav',
    to: 'body-slam.wav',
    why: 'O ENCONTRAO contra a parede (93ms, 408Hz): massa encontrando massa, sem cauda e sem '
      + 'estilhaco.',
  },
  {
    pack: 'retro',
    from: 'General Sounds/Negative Sounds/sfx_sounds_damage2.wav',
    to: 'player-hurt.wav',
    why: 'O HEROI APANHANDO. O mais alto da pasta de dano — e o unico som do combate que precisa '
      + 'furar tudo o que estiver tocando.',
  },
  {
    pack: 'retro',
    from: 'Death Screams/Human/sfx_deathscream_human2.wav',
    to: 'player-death.wav',
    why: 'A MORTE DO HEROI. O unico "death scream" HUMANO do combate, e ele e humano: 612ms graves '
      + 'nascendo no silencio total que a tela de morte abre.',
  },
  {
    pack: 'retro',
    from: 'Explosions/Shortest/sfx_exp_shortest_soft1.wav',
    to: 'fire-hit.wav',
    why: 'O GRAVETO ACESO ACERTANDO. Nenhum dos dois pacotes tem FOGO; um estouro curto e macio '
      + '(190ms) e expansao sem estilhaco, que e o desenho de uma chama e nao de algo quebrando.',
  },
];

/** Le um WAV PCM (8/16/24/32-bit) ou float32 e devolve mono normalizado -1..1. */
function readWav(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`nao e um WAV: ${file}`);
  }
  let pos = 12;
  let fmt = null;
  let data = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === 'fmt ') {
      fmt = {
        format: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        rate: buf.readUInt32LE(body + 4),
        bits: buf.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      data = buf.subarray(body, body + size);
    }
    pos = body + size + (size % 2);
  }
  if (!fmt || !data) throw new Error(`WAV sem fmt/data: ${file}`);

  const bytes = fmt.bits / 8;
  // Os dois pacotes juntos trazem 16 e 24 bits, mono e estereo, 44.1 e 48 kHz — dai o leitor
  // aceitar tudo em vez de exigir um formato: o que sai daqui e sempre mono float.
  const read = (off) => {
    if (fmt.format === 3 && fmt.bits === 32) return data.readFloatLE(off);
    if (fmt.bits === 8) return (data.readUInt8(off) - 128) / 128;
    if (fmt.bits === 16) return data.readInt16LE(off) / 32768;
    if (fmt.bits === 24) {
      return (data.readUInt8(off) | (data.readUInt8(off + 1) << 8) | (data.readInt8(off + 2) << 16))
        / 8388608;
    }
    if (fmt.bits === 32) return data.readInt32LE(off) / 2147483648;
    throw new Error(`bits nao suportados (${fmt.bits}): ${file}`);
  };

  const frames = Math.floor(data.length / bytes / fmt.channels);
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < fmt.channels; c++) sum += read((i * fmt.channels + c) * bytes);
    mono[i] = sum / fmt.channels;
  }
  return { rate: fmt.rate, mono };
}

/** Reamostra por interpolacao linear. Basta: sao efeitos curtos, e 48k->44.1k e um passo pequeno. */
function resample(mono, from, to) {
  if (from === to) return mono;
  const out = new Float32Array(Math.round((mono.length * to) / from));
  const step = from / to;
  for (let i = 0; i < out.length; i++) {
    const p = i * step;
    const i0 = Math.floor(p);
    const frac = p - i0;
    const a = mono[i0] ?? 0;
    const b = mono[i0 + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

/** O mesmo encoder do gen-sfx: PCM 16-bit mono. */
function toWav(samples, rate) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  }
  return buf;
}

/**
 * O RMS da janela de `RMS_WINDOW_MS` mais alta do sinal — a medida de quao alto o som PARECE.
 * Uma soma corrente: o custo e uma passada, e nao uma por janela.
 */
function loudestRms(mono, rate) {
  const w = Math.min(mono.length, Math.max(1, Math.round((RMS_WINDOW_MS / 1000) * rate)));
  let sum = 0;
  for (let i = 0; i < w; i++) sum += mono[i] * mono[i];
  let best = sum;
  for (let i = w; i < mono.length; i++) {
    sum += mono[i] * mono[i] - mono[i - w] * mono[i - w];
    if (sum > best) best = sum;
  }
  return Math.sqrt(best / w);
}

const roots = { fantasy: process.argv[2], retro: process.argv[3] };
if (!roots.fantasy || !roots.retro) {
  console.error('uso: node tools/import-combat-sfx.mjs "<RPG Sound Pack>" "<512 sons>"');
  process.exit(1);
}
fs.mkdirSync(OUT, { recursive: true });

const targetRms = Math.pow(10, TARGET_RMS_DBFS / 20);
const ceiling = Math.pow(10, CEILING_DBFS / 20);
let done = 0;
for (const entry of MAP) {
  const src = path.join(roots[entry.pack], entry.from);
  if (!fs.existsSync(src)) {
    console.error(`FALTA [${entry.pack}]: ${entry.from}`);
    process.exitCode = 1;
    continue;
  }
  const raw = readWav(src);
  let mono = resample(raw.mono, raw.rate, RATE);

  if (entry.trimMs) {
    const keep = Math.min(mono.length, Math.round((entry.trimMs / 1000) * RATE));
    const fade = Math.min(keep, Math.round((TRIM_FADE_MS / 1000) * RATE));
    const cut = mono.slice(0, keep);
    // O fade e obrigatorio: cortar uma onda no meio do ciclo deixa um degrau, e um degrau e um
    // ESTALO — que sairia toda vez que o som tocasse, e sons de combate tocam o tempo todo.
    for (let i = 0; i < fade; i++) cut[keep - fade + i] *= 1 - i / fade;
    mono = cut;
  }

  // Sobe pela alto-falancia percebida (ver TARGET_RMS_DBFS) e dobra os picos no `tanh` em vez de
  // corta-los. O volume POR SOM continua sendo do jogo, na tabela SAMPLES — mas agora aquela
  // coluna e mixagem de verdade, e nao uma tentativa de compensar o quanto cada pacote gravou alto.
  const rms = loudestRms(mono, RATE);
  const gain = rms > 0 ? targetRms / rms : 1;
  const out = new Float32Array(mono.length);
  const norm = ceiling / Math.tanh(DRIVE);
  let peak = 0;
  for (let i = 0; i < mono.length; i++) {
    out[i] = Math.tanh(mono[i] * gain * DRIVE) * norm;
    peak = Math.max(peak, Math.abs(out[i]));
  }

  fs.writeFileSync(path.join(OUT, entry.to), toWav(out, RATE));
  const ms = Math.round((out.length / RATE) * 1000);
  console.log(
    `${entry.to.padEnd(20)} ${String(ms).padStart(5)}ms  ${entry.pack.padEnd(7)}`
    + ` ${entry.trimMs ? 'corte' : '     '} ${(20 * Math.log10(gain)).toFixed(1).padStart(6)}dB`
    + ` pico ${(20 * Math.log10(peak)).toFixed(1).padStart(5)}  <- ${entry.from}`,
  );
  done += 1;
}
console.log(`\n${done}/${MAP.length} sons importados para ${OUT}`);
console.log(`   ${MAP.filter((e) => e.pack === 'fantasy').length} de fantasia · ${MAP.filter((e) => e.pack === 'retro').length} percussivos do retro`);

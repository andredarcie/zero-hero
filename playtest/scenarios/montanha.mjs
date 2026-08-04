// A MONTANHA EM CUBO E A AGUA QUE ANDA — as duas sao o mesmo assado do terreno.
//
// O que este cenario prova, e por que cada assert existe:
//
//   1. A ARTE GERADA FOI EMBORA. A montanha usava tres frames de penhasco desenhados por gerador
//      (cliff-wall.mjs, deletado) e agora usa a MESMA pintura de pedra que o mundo ja tinha no
//      chao. Isso se afirma comparando os pixels do atlas: frame 39 tem de ser byte a byte o
//      frame 23, e o 40 o 24. O frame 41 (a terceira variante) tem de estar VAZIO — o id de frame
//      e posicional, entao a linha nao pode ser removida, so apagada.
//   2. ELA E CUBO, E NAO UMA CARTA EM PE. Um quad em pe vive todo no z do proprio tile; um cubo
//      tem face em z+0.5 e teto em y=1. Entao o assert nao olha "parece 3D", olha a GEOMETRIA:
//      o tile saiu do indice de quads (`solidQuads`, o que o machado usa) e existe, na malha de
//      rocha, vertice no teto e vertice na face sul. E continua bloqueando — o cubo e cosmetico
//      para a fisica, e essa e a parte que nao pode ter mudado.
//   3. O VOLUME E PINTADO. Com `normalUp` toda face recebe a mesma luz, entao sem cor de vertice
//      um cubo le como adesivo. A malha tem de ter `color`, com o teto no topo da faixa e alguma
//      face bem abaixo dele.
//   4. A AGUA SE MOVE, e isto e medido por A/B e nao por "vi mexer": duas fotos da mesma agua
//      separadas no tempo tem de diferir MUITO mais do que duas fotos do mesmo chao de terra.
//      Sem o controle no chao, qualquer poeira/vagalume passando na frente aprovaria uma agua
//      completamente parada — que e exactamente o estado que este cenario existe para pegar.
//   5. E ela sabe onde e a praia: a malha do mar carrega `aShore` com mar aberto (0) e beira (>0).
//
// Roda na AVENTURA (`?play`): montanha e mar so existem no mundo autorado.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Quantos pixels de duas fotos do mesmo tamanho diferem de verdade (ruido de 1-2 nao conta). */
const shotDiffRatio = async (fileA, fileB) => {
  const { readPng } = await import('../../spritefactory/lib/png.mjs');
  const a = readPng(fileA);
  const b = readPng(fileB);
  if (a.width !== b.width || a.height !== b.height) return 1;
  let moved = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.abs(a.data[i] - b.data[i])
      + Math.abs(a.data[i + 1] - b.data[i + 1])
      + Math.abs(a.data[i + 2] - b.data[i + 2]);
    if (d > 6) moved++;
  }
  return moved / (a.data.length / 4);
};

export default {
  name: 'montanha',
  description: 'A montanha em cubo com a pedra do chao, e a agua do mundo com corrente e praia.',
  needsGame: true,
  async run({ driver, shot, assert, log }) {
    await driver.settle(1500);
    const page = driver.page;
    const evaluate = (fn, arg) => page.evaluate(fn, arg);

    const teleport = (x, y) => evaluate(([px, py]) => {
      const s = window.__scene;
      s.playerWorld.worldX = px;
      s.playerWorld.worldY = py;
      s.movementController.interruptMovement(px, py);
    }, [x, y]);

    // ── 1. A pedra do chao virou a pedra da montanha ──────────────────────────
    log('ARTE: o frame da montanha tem de ser a pintura de pedra que ja estava no chao');
    const frames = await evaluate(() => {
      const img = window.__scene.textures.get('forest-tileset').getSourceImage();
      const cv = document.createElement('canvas');
      cv.width = img.width;
      cv.height = img.height;
      const cx = cv.getContext('2d');
      cx.drawImage(img, 0, 0);
      const cols = img.width / 16;
      const read = (f) => Array.from(
        cx.getImageData((f % cols) * 16, Math.floor(f / cols) * 16, 16, 16).data,
      );
      return { f23: read(23), f24: read(24), f39: read(39), f40: read(40), f41: read(41) };
    });
    const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
    assert('a montanha (39) e a MESMA pintura do Chao de Pedra (23)', same(frames.f39, frames.f23),
      `iguais=${same(frames.f39, frames.f23)}`);
    assert('a montanha com musgo (40) e a MESMA pintura do chao com musgo (24)',
      same(frames.f40, frames.f24));
    assert('e a arte GERADA da terceira variante foi apagada do atlas (41 vazio)',
      frames.f41.every((v, i) => (i % 4 === 3 ? v === 0 : true)),
      `alphas=${frames.f41.filter((v, i) => i % 4 === 3).filter(Boolean).length}`);

    // O tamanho do mundo sai do proprio arquivo, nunca escrito aqui: o mundo e autorado a mao e
    // um numero fixo neste teste apodrece no dia em que alguem redimensiona o mapa no /editor.
    const size = await evaluate(async () => {
      const w = await (await fetch('/world.json')).json();
      return {
        w: w.meta.worldChunksX * w.meta.chunkColumns,
        h: w.meta.worldChunksY * w.meta.chunkRows,
      };
    });
    log(`mundo: ${size.w}x${size.h} tiles`);

    // ── 2. Ela e cubo, e continua bloqueando ─────────────────────────────────
    log('CUBO: a montanha tem teto e face sul, e saiu da malha de quads');
    const cliff = await evaluate(({ w, h }) => {
      const s = window.__scene;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (s.chunkManager.getTile(x, y).upper !== 39) continue;
          // Uma com chao aberto ao sul, para a face da frente aparecer na foto.
          const below = s.chunkManager.getTile(x, y + 1);
          if (below.upper === null && !below.collision) return { x, y };
        }
      }
      return null;
    }, size);
    assert('o mundo tem montanha para olhar', cliff !== null, JSON.stringify(cliff));

    const cube = await evaluate(({ x, y }) => {
      const w3 = window.__scene.world3d;
      const mesh = w3.terrainMeshes.find((m) => m.material?.name === 'terrain-rock');
      if (!mesh) return { mesh: false };
      const pos = mesh.geometry.attributes.position;
      const col = mesh.geometry.attributes.color;
      let top = false;
      let southFace = false;
      let shadeMin = 9;
      let shadeMax = -9;
      let topShade = -9;
      for (let i = 0; i < pos.count; i++) {
        const px = pos.getX(i);
        const py = pos.getY(i);
        const pz = pos.getZ(i);
        const mine = Math.abs(px - x) <= 0.5 + 1e-3 && Math.abs(pz - y) <= 0.5 + 1e-3;
        if (mine && py > 0.99 && pz < y - 0.49) top = true; // quina norte do TETO
        if (mine && pz > y + 0.49 && py < 0.01) southFace = true; // pe da face da FRENTE
        if (col) {
          const s = col.getX(i);
          shadeMin = Math.min(shadeMin, s);
          shadeMax = Math.max(shadeMax, s);
          if (py > 0.99) topShade = Math.max(topShade, s);
        }
      }
      return {
        mesh: true,
        top,
        southFace,
        shadeMin,
        shadeMax,
        topShade,
        inQuadIndex: w3.solidQuads.has(`${x},${y}`),
        verts: pos.count,
      };
    }, cliff);
    assert('existe a malha de rocha (material terrain-rock)', cube.mesh === true, JSON.stringify(cube));
    assert('a montanha tem TETO (vertice em y=1 na borda norte do tile)', cube.top === true,
      JSON.stringify(cube));
    assert('e tem a face da FRENTE (vertice em z+0.5 no chao) — nao e uma carta no centro do tile',
      cube.southFace === true, JSON.stringify(cube));
    assert('e ela saiu do indice de quads em pe (o que o machado indexa)',
      cube.inQuadIndex === false, JSON.stringify(cube));
    assert('o volume esta PINTADO: o teto e o mais claro e alguma face esta bem abaixo dele',
      cube.topShade >= cube.shadeMax - 1e-3 && cube.shadeMin < 0.8, JSON.stringify(cube));

    // A parte que nao pode ter mudado: cubo e desenho, colisao e colisao.
    const solid = await evaluate(
      ([x, y]) => [
        window.__scene.isSolidForEntities(x, y, false),
        window.__scene.isSolidForEntities(x, y, true),
      ],
      [cliff.x, cliff.y],
    );
    assert('a montanha bloqueia, e bloqueia tambem com as botas de lava',
      solid[0] === true && solid[1] === true, JSON.stringify(solid));

    await teleport(cliff.x, cliff.y + 3);
    await driver.settle(700);
    await shot('montanha-cubo', { note: `Montanha em cubo vista de baixo (${cliff.x},${cliff.y})` });

    // ── 3. A agua se move — medida contra um controle de chao parado ──────────
    log('AGUA: duas fotos da mesma agua tem de diferir mais que duas do mesmo chao');
    // Acha o maior quadrado PURO de cada coisa: a foto tem de ser de uma superficie so, senao a
    // razao entre "mudou" e "nao mudou" mede a mistura, nao a agua. O raio desce ate caber.
    const spot = await evaluate(({ w, h }) => {
      const s = window.__scene;
      // O que fica EM PE (SOLID_UPPER_FRAMES, sem a masmorra): o controle nao pode ter parede
      // nenhuma dentro, mas mato e cogumelo deitados podem ficar — eles nao se movem.
      const standing = new Set([3, 4, 14, 15, 16, 17, 18, 21, 22, 25, 39, 40]);
      const scan = (want) => {
        for (const rad of [8, 6, 5, 4]) {
          for (let y = 2; y < h - 2; y++) {
            for (let x = 2; x < w - 2; x++) {
              let ok = true;
              for (let dy = -rad; dy <= rad && ok; dy++) {
                for (let dx = -rad; dx <= rad && ok; dx++) {
                  ok = want(s.chunkManager.getTile(x + dx, y + dy));
                }
              }
              if (ok) return { x, y, rad };
            }
          }
        }
        return null;
      };
      return {
        water: scan((t) => t.ground === 33),
        land: scan((t) => (t.ground === 5 || t.ground === 6) && !t.collision && !standing.has(t.upper)),
      };
    }, size);
    assert('o mundo tem um corpo de agua aberto e um descampado para comparar',
      spot.water !== null && spot.land !== null, JSON.stringify(spot));

    // O recorte sai da PROJECAO do jogo, nao de uma fracao do canvas: e um quadrado de tiles
    // garantidamente dentro do quadrado puro (o quadrante acima-a-esquerda dele), longe do heroi
    // — que fica no centro da tela. Assim o zoom da camera pode mudar sem invalidar a medida.
    const box = await driver.canvasBox();
    // O MESMO raio para os dois recortes: as duas fotos tem de ter o mesmo tamanho, ou a razao
    // entre elas compara areas diferentes (e o shotDiffRatio, corretamente, desiste).
    const cropRad = Math.min(spot.water.rad, spot.land.rad, 6);
    const cropFor = async (at) => {
      const rad = cropRad;
      const r = await evaluate(([x, y, k]) => {
        const w3 = window.__scene.world3d;
        const a = w3.projectTile(x - k, y - k, 0);
        const b = w3.projectTile(x - 1, y - 1, 0);
        return {
          x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
          w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y),
        };
      }, [at.x, at.y, rad - 1]);
      return {
        x: Math.round(box.x + Math.max(0, r.x)),
        y: Math.round(box.y + Math.max(0, r.y)),
        width: Math.max(24, Math.round(r.w)),
        height: Math.max(24, Math.round(r.h)),
      };
    };

    await teleport(spot.water.x, spot.water.y);
    await driver.settle(900);
    const clip = await cropFor(spot.water);
    const w1 = await shot('montanha-agua-t0', { clip, note: 'Mar aberto, instante 0' });
    await sleep(900);
    const w2 = await shot('montanha-agua-t1', { clip, note: 'O mesmo mar 900ms depois' });

    // O mesmo mar com o efeito DESLIGADO (hd3d.seaFlow = 0): e assim que se prova que o que mexe
    // a agua e este shader, e nao outra coisa qualquer da cena. O glint de lua fica de fora do
    // knob (ele e o do rio, compartilhado), entao aqui ainda pisca um pixel — por isso a
    // comparacao e "mudou MAIS", nao "nao mudou nada".
    await evaluate(() => { window.hd3d.seaFlow = 0; });
    await driver.settle(600);
    const s1 = await shot('montanha-agua-parada-t0', { clip, note: 'O mesmo mar com hd3d.seaFlow = 0' });
    await sleep(900);
    const s2 = await shot('montanha-agua-parada-t1', { clip, note: 'seaFlow = 0, 900ms depois' });
    await evaluate(() => { window.hd3d.seaFlow = 1; });

    await teleport(spot.land.x, spot.land.y);
    await driver.settle(900);
    const landClip = await cropFor(spot.land);
    const l1 = await shot('montanha-chao-t0', { clip: landClip, note: 'Chao batido, instante 0 (controle)' });
    await sleep(900);
    const l2 = await shot('montanha-chao-t1', { clip: landClip, note: 'O mesmo chao 900ms depois' });

    const waterMoved = await shotDiffRatio(w1, w2);
    const stillMoved = await shotDiffRatio(s1, s2);
    const landMoved = await shotDiffRatio(l1, l2);
    log(`agua ${(waterMoved * 100).toFixed(1)}% | agua com seaFlow=0 ${(stillMoved * 100).toFixed(1)}%`
      + ` | chao ${(landMoved * 100).toFixed(1)}%`);
    assert('a agua mudou de um instante para o outro (ela ANDA)', waterMoved > 0.05,
      `agua=${(waterMoved * 100).toFixed(1)}%`);
    assert('e mudou muito mais do que o chao parado (nao foi poeira passando)',
      waterMoved > landMoved * 3 + 0.02,
      `agua=${(waterMoved * 100).toFixed(1)}% chao=${(landMoved * 100).toFixed(1)}%`);
    assert('e com hd3d.seaFlow = 0 ela se mexe menos — o movimento vem DESTE shader',
      waterMoved > stillMoved + 0.02,
      `agua=${(waterMoved * 100).toFixed(1)}% parada=${(stillMoved * 100).toFixed(1)}%`);

    // ── 4. A praia existe na propria malha ───────────────────────────────────
    log('PRAIA: a malha do mar carrega o degrau de costa (aShore)');
    const shore = await evaluate(() => {
      const mesh = window.__scene.world3d.terrainMeshes
        .find((m) => m.material?.name === 'terrain-sea');
      if (!mesh) return { mesh: false };
      const a = mesh.geometry.attributes.aShore;
      if (!a) return { mesh: true, attr: false };
      let open = 0;
      let coast = 0;
      let max = 0;
      for (let i = 0; i < a.count; i++) {
        const v = a.getX(i);
        if (v === 0) open++;
        else coast++;
        max = Math.max(max, v);
      }
      return { mesh: true, attr: true, open, coast, max, count: a.count };
    });
    assert('existe a malha do mar (material terrain-sea) com o atributo aShore',
      shore.mesh === true && shore.attr === true, JSON.stringify(shore));
    assert('e ela tem mar aberto (0) E beira (>0) — a praia nao e o oceano todo',
      shore.open > 0 && shore.coast > 0 && shore.max > 0.3, JSON.stringify(shore));

    // Uma foto da costa, que e onde a arrebentacao aparece.
    const coast = await evaluate(({ w, h }) => {
      const s = window.__scene;
      for (let y = 4; y < h - 4; y++) {
        for (let x = 4; x < w - 8; x++) {
          const here = s.chunkManager.getTile(x, y);
          if (here.ground !== 5 && here.ground !== 6) continue;
          if (here.upper !== null || here.collision) continue;
          let water = 0;
          for (let dx = 1; dx <= 4; dx++) {
            if (s.chunkManager.getTile(x + dx, y).ground === 33) water++;
          }
          if (water === 4) return { x, y };
        }
      }
      return null;
    }, size);
    if (coast) {
      await teleport(coast.x, coast.y);
      await driver.settle(900);
      await shot('montanha-praia', { note: `A costa em (${coast.x},${coast.y}) — a onda lambe a beira` });
    } else {
      log('nenhuma costa reta encontrada para fotografar (nao e falha: e so a foto)');
    }
  },
};

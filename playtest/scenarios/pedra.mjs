// A PEDRA E A PICARETA — as duas picaretadas, e a prova de que a PRIMEIRA aparece.
//
// Este cenario existe por causa de um bug que nenhum teste podia pegar: rock.png e rock__1.png
// (o estado rachado) eram o MESMO arquivo, byte a byte. Toda a maquinaria funcionava — a troca
// de textura, o recoil, os cacos 3D de spawnRockDebris — e mesmo assim a primeira picaretada
// era invisivel na tela. O jogador batia duas vezes e so via a segunda.
//
// Um estado que nao muda um pixel nao e um estado. Entao a assercao central aqui nao e "a chave
// da textura mudou" (isso era verdade o tempo todo): e que as duas artes DIFEREM DE VERDADE, e
// que diferem o bastante para ler de longe — silhueta inclusive, ja que a picaretada arranca o
// pico da pedra e e de la que os cacos saem.
//
// O resto guarda o contrato de sempre: rachada ainda BLOQUEIA (sao duas picaretadas, nao uma), a
// segunda abre o tile, e o pe das duas artes e o mesmo — `frameFootPad` mede o vazio embaixo do
// desenho para colar a sombra projetada no objeto, e um pe diferente entre os estados faria a
// sombra PULAR no meio do golpe.

export default {
  name: 'pedra',
  description: 'A pedra da picareta: o estado rachado precisa ser arte DIFERENTE da pedra inteira.',
  needsGame: true,
  async run({ driver, shot, assert, log }) {
    await driver.settle(1500);

    const evaluate = (fn, arg) => driver.page.evaluate(fn, arg);

    // ── 1. As duas artes sao arquivos diferentes ────────────────────────────
    // Lido dos canvases que o jogo REALMENTE carregou, nao do disco: o que interessa e o que
    // chegou na textura, depois do manifest e do loader.
    log('ARTE: comparar pixel a pixel a pedra inteira com a rachada');
    const art = await evaluate(async () => {
      const read = async (url) => {
        const img = new Image();
        img.src = url;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return { w: img.width, h: img.height, px: ctx.getImageData(0, 0, img.width, img.height).data };
      };
      const a = await read('/assets/environment/props/rock.png');
      const b = await read('/assets/environment/props/rock_cracked.png');
      if (a.w !== b.w || a.h !== b.h) return { error: `tamanhos diferentes: ${a.w}x${a.h} vs ${b.w}x${b.h}` };
      let diff = 0;
      let body = 0;      // pixels opacos da pedra inteira — o corpo contra o qual medir a mudanca
      let onlyIntact = 0; // pixels opacos na inteira que sumiram na rachada = silhueta perdida
      let footA = 0; let footB = 0; // linhas vazias embaixo do desenho
      for (let i = 0; i < a.px.length; i += 4) {
        const opaqueA = a.px[i + 3] >= 128;
        const opaqueB = b.px[i + 3] >= 128;
        if (opaqueA) body += 1;
        if (opaqueA !== opaqueB || (opaqueA && (a.px[i] !== b.px[i] || a.px[i + 1] !== b.px[i + 1] || a.px[i + 2] !== b.px[i + 2]))) diff += 1;
        if (opaqueA && !opaqueB) onlyIntact += 1;
      }
      const padOf = (img) => {
        for (let y = img.h - 1; y >= 0; y -= 1) {
          for (let x = 0; x < img.w; x += 1) if (img.px[(y * img.w + x) * 4 + 3] >= 128) return img.h - 1 - y;
        }
        return img.h;
      };
      footA = padOf(a); footB = padOf(b);
      return { diff, body, onlyIntact, footA, footB };
    });
    assert('as duas artes carregam no mesmo tamanho', !art.error, art.error ?? '');
    // O bug antigo cravava diff === 0. A medida e contra o CORPO da pedra (os pixels opacos),
    // nao contra o tile de 256: metade do tile e transparente e diluiria a conta. Um oitavo do
    // corpo e um piso deliberadamente baixo — o estado rachado TEM de continuar sendo a mesma
    // pedra (a casa nao redesenha silhueta entre frames), entao isto guarda contra o clone e
    // contra a mudanca virar imperceptivel, nao exige um desenho novo.
    assert('a pedra rachada NAO e um clone da inteira',
      art.diff >= art.body / 8, `so ${art.diff} de ${art.body} pixels do corpo mudaram`);
    assert('a picaretada arranca massa (a silhueta encolhe)',
      art.onlyIntact >= 8, `${art.onlyIntact} pixels opacos a menos`);
    // O pe identico e o que impede a sombra projetada de pular no golpe.
    assert('as duas artes tem o mesmo pe (footPad da sombra)',
      art.footA === art.footB, `inteira=${art.footA} rachada=${art.footB}`);
    log(`  ${art.diff}/${art.body} pixels do corpo mudaram · ${art.onlyIntact} px arrancados · pe ${art.footA}`);

    // ── 2. As duas picaretadas ──────────────────────────────────────────────
    log('PICARETA: primeira golpada racha e AINDA bloqueia; a segunda abre o tile');
    const rock = await evaluate(() => {
      const r = window.__scene.rocks?.[0];
      return r ? { x: r.worldX, y: r.worldY } : null;
    });
    assert('o mundo tem pelo menos uma pedra', rock !== null, 'nenhuma pedra em __scene.rocks');

    // Fica a OESTE da pedra e bate para leste: a picaretada e um bump, o jogo nao tem botao.
    await evaluate(([px, py]) => {
      const s = window.__scene;
      s.playerWorld.worldX = px; s.playerWorld.worldY = py;
      s.movementController.interruptMovement(px, py);
      s.heldItem = 'pickaxe';
    }, [rock.x - 1, rock.y]);
    await driver.settle(400);
    await shot('pedra-inteira');

    const texOf = () => evaluate(() => {
      const r = window.__scene.rocks?.[0];
      return { texture: r?.sprite?.texKey ?? null, blocking: r?.blocking ?? null };
    });
    const before = await texOf();

    await driver.press('ArrowRight', { count: 1 });
    await driver.settle(700);
    const cracked = await texOf();
    assert('a primeira picaretada troca a arte da pedra',
      cracked.texture !== before.texture, `${before.texture} -> ${cracked.texture}`);
    assert('e a pedra rachada AINDA bloqueia', cracked.blocking === true, JSON.stringify(cracked));
    await shot('pedra-rachada');

    await driver.press('ArrowRight', { count: 1 });
    await driver.settle(700);
    const broken = await texOf();
    assert('a segunda picaretada abre o tile', broken.blocking === false, JSON.stringify(broken));
    await shot('pedra-quebrada');
  },
};

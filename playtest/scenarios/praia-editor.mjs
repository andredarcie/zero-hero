// O EDITOR COM O MAPA MAIOR (a praia do norte, 2026-11-19): o mapa passou a começar ACIMA da linha 0 (duas linhas de
// chunk novas, `meta.originCy` = -2). O editor tem de abrir o mapa inteiro, mostrar a praia no alto, contar as peças
// dela e pintar nas linhas novas — sem cortar nada fora.
export default {
  name: 'praia-editor',
  description: 'O editor abre o mapa com a praia do norte: as linhas novas aparecem, contam e aceitam pintura.',
  route: '/editor',
  async run({ driver, shot, assert, log }) {
    const { page } = driver;
    const g = (fn, arg) => page.evaluate(fn, arg);
    await driver.settle(2500);
    await page.waitForFunction(() => window.editorDebug?.ready(), null, { timeout: 30000 });
    const header = await page.textContent('#zh-editor-root .zh-subtitle').catch(() => null);
    log(`  cabeçalho: ${header ?? '(sem subtítulo)'}`);
    const palms = await g(() => window.editorDebug.count('coconutPalm'));
    const northPalms = await g(() => window.editorDebug.count('coconutPalm', { x0: 0, y0: -24, x1: 59, y1: -1 }));
    assert('O editor conta os coqueiros da praia, todos nas linhas novas', palms >= 40 && northPalms === palms, `${palms} / ${northPalms}`);
    const grass = await g(() => window.editorDebug.count('tallGrass', { x0: 36, y0: -24, x1: 48, y1: 3 }));
    assert('O mato da trilha está no mapa do editor', grass >= 8, String(grass));
    // pintar numa linha negativa: a areia vira concha, e volta
    const painted = await g(() => window.editorDebug.setCell('upper', 30, -14, 148));
    assert('O editor pinta nas linhas novas', painted === true, String(painted));
    const outside = await g(() => window.editorDebug.setCell('upper', 30, -25, 148));
    assert('E não pinta fora do mapa', outside === false, String(outside));
    await driver.settle(600);
    await shot('00-editor-mapa-inteiro', { note: 'O editor com o mapa maior: a praia no alto, o vale embaixo' });
  },
};

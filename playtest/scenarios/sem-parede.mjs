// SEM PAREDE INVISIVEL — todo tile que barra o heroi tem de ter um MOTIVO DESENHADO: arvore ou
// rocha de pe, mar, uma peca que bloqueia (arbusto, rocha, agua, fogueira, portao...), um NPC, a
// espada fincada, a marca de um pedido ou uma peca do vale (o quintal do lenhador, a cratera, a
// cerca...). Colisao pintada em chao vazio e a recusa que o jogador nao consegue ler.
//
// O jogo diz POR QUE cada tile barra (gameDebug.world.solidReason): toda peca e desenhada por
// construcao, e o mapa so barra com a arte de um solido no tile (arvore, montanha, mar — a regra do
// proprio ChunkManager). O que sobra, e e isso que este cenario reprova, e a colisao pintada em chao
// vazio ('terrain:painted') e uma fonte de solido que a sonda nao conhece ('unknown').

export default {
  name: 'sem-parede',
  description: 'Nenhum tile bloqueia o heroi sem algo visivel nele.',
  needsGame: false,
  async run({ driver, assert }) {
    const { page } = driver;
    await page.addInitScript(() => {
      localStorage.setItem('zh.cozy.v1', JSON.stringify({ started: true, introSeen: true }));
    });
    await driver.open('/?play');
    await page.waitForFunction(() => window.gameDebug?.getState()?.scene === 'game', null, { timeout: 30000 });
    await page.waitForTimeout(800);
    const odd = await page.evaluate(() => {
      const g = window.gameDebug;
      const out = [];
      for (let y = 0; y < 60; y += 1) {
        for (let x = 0; x < 60; x += 1) {
          const why = g.world.solidReason(x, y);
          if (why === 'terrain:painted') out.push(`${x},${y} (colisao pintada)`);
          else if (why === 'unknown') out.push(`${x},${y} (fonte desconhecida)`);
        }
      }
      return out;
    });
    assert('Nenhuma parede invisivel no mundo', odd.length === 0, odd.slice(0, 20).join(' '));
  },
};

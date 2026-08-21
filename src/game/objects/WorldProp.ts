// O contrato que as 16 classes de prop redeclaravam informalmente (worldX/worldY/destroy/
// blocking), agora dito UMA vez e cobrado pelo compilador via `implements`. É o que o registro
// de props do GameScene enxerga: os arrays tipados continuam existindo para os sistemas que
// iteram um tipo (fogo -> dryBushes), mas destruicao, colisao e
// busca posicional atravessam todos os props por este contrato — um prop novo entra no jogo
// adicionando UMA entrada ao registro, não seis edições espalhadas pelo GameScene.
export interface WorldProp {
  readonly worldX: number;
  readonly worldY: number;
  /**
   * Sólido AGORA — o estado muda (porta destrancada, rocha quebrada, capim cortado, broto
   * fechado...). Ausente = o prop nunca bloqueia (bombSpot). O caso especial
   * dos hazards fica no registro, não aqui: `blocking` responde só "há um corpo neste tile",
   * enquanto voadores e projéteis decidem separadamente se ignoram esse corpo.
   */
  readonly blocking?: boolean;
  destroy(): void;
}

// O contrato que as 16 classes de prop redeclaravam informalmente (worldX/worldY/destroy/
// blocking), agora dito UMA vez e cobrado pelo compilador via `implements`. É o que o registro
// de props do GameScene enxerga: os arrays tipados continuam existindo para os sistemas que
// iteram um tipo (fogo → dryBushes, circuitos → waterWheels...), mas destruição, colisão e
// busca posicional atravessam todos os props por este contrato — um prop novo entra no jogo
// adicionando UMA entrada ao registro, não seis edições espalhadas pelo GameScene.
export interface WorldProp {
  readonly worldX: number;
  readonly worldY: number;
  /**
   * Sólido AGORA — o estado muda (porta destrancada, rocha quebrada, capim cortado, broto
   * fechado...). Ausente = o prop nunca bloqueia (bombSpot, placa de pressão). O caso especial
   * dos hazards (lava/água, que as botas vadeiam) fica no registro, não aqui: `blocking`
   * responde só "há um corpo neste tile", nunca "quem pode atravessá-lo".
   */
  readonly blocking?: boolean;
  destroy(): void;
}

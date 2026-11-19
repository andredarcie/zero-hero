// A FONTE TERMAL NO MAPA: onde ela fica e o tamanho da bacia. Só números — quem os lê é o terreno (que cava a bacia:
// render3d/world/TerrainSorter, TerrainFeatures), a fonte em si (objects/spring/HotSpring) e os testes. O world.json
// marca os mesmos tiles com colisão (scripts/praia-do-norte.mjs, SPRING), e o `beach.test` cobra que os dois concordem.

/** A água: 4 × 2 tiles, na gruta atrás do corredor das minas. */
export const SPRING_POOL = { x0: 3, y0: -3, x1: 6, y1: -2 } as const;
export const isSpringPool = (x: number, y: number): boolean => (
  x >= SPRING_POOL.x0 && x <= SPRING_POOL.x1 && y >= SPRING_POOL.y0 && y <= SPRING_POOL.y1
);
/**
 * A BACIA É FUNDA DE VERDADE (pedido do autor, 2026-11-19: "faça o lago ter profundidade 3D, ser possível ver o
 * fundo"): o chão dela fica `SPRING_DEPTH` tiles abaixo do chão da gruta, e a água, translúcida, `SPRING_SURFACE` abaixo
 * (a borda de pedra fica um palmo acima dela). Dessa câmera (27°) uma bacia mais funda só mostraria a parede do fundo:
 * com 0,45 vê-se o leito de areia por quase metade da água, e o resto é a parede descendo.
 */
export const SPRING_DEPTH = 0.45;
export const SPRING_SURFACE = -0.1;
/** A lanterna de pedra, ao lado da água, a leste, e o bordo, a oeste (tiles sólidos no world.json). */
export const SPRING_LANTERN = { x: 7, y: -2 } as const;
export const SPRING_MAPLE = { x: 1, y: -2 } as const;

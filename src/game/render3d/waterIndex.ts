// ONDE HÁ ÁGUA, para o espelho (WaterMirror): os tiles de rio e de mar, e os baldes de 8×8 que os contêm. O terreno
// enche e esvazia; o espelho só pergunta — "há água na tela?", "esta árvore tem água logo ao sul?".

import type { CullView } from './sceneCull';

/** Os baldes de água têm 8×8 tiles (x >> 3). */
const BUCKET_SHIFT = 3;
/** A chave de um tile ou de um balde (as coordenadas do balde chegam já divididas). */
const key = (x: number, z: number): number => (x + 1024) * 4096 + (z + 1024);

export class WaterIndex {
  private readonly buckets = new Set<number>();
  private readonly tiles = new Set<number>();

  /** Este tile é água (rio ou mar). */
  public add(x: number, z: number): void {
    this.buckets.add(key(x >> BUCKET_SHIFT, z >> BUCKET_SHIFT));
    this.tiles.add(key(x, z));
  }

  public clear(): void {
    this.buckets.clear();
    this.tiles.clear();
  }

  /** Este tile é água? (os anéis de quem anda na beira: waterRipples) */
  public has(x: number, z: number): boolean {
    return this.tiles.has(key(x, z));
  }

  /**
   * Há água logo ao SUL deste ponto? A câmera olha para o norte, então o reflexo de uma coisa em pé cai na água que
   * fica entre ela e a câmera: até três tiles para o sul, um para cada lado.
   */
  public southOf(x: number, z: number): boolean {
    const tx = Math.round(x);
    const tz = Math.round(z);
    for (let dz = 0; dz <= 3; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (this.tiles.has(key(tx + dx, tz + dz))) return true;
      }
    }
    return false;
  }

  /**
   * Há água na área de chão visível do último quadro? Primeiro por balde (uma consulta por 8×8: quase sempre basta
   * para dizer que não); depois tile a tile — a passada do espelho desenha o cenário inteiro, e só vale com água de
   * fato na tela. A área de `view` vem com 2 tiles de folga de cada lado: um deles sai aqui.
   */
  public inView(v: CullView): boolean {
    if (!Number.isFinite(v.minX) || this.buckets.size === 0) return false;
    const bx1 = Math.floor(v.maxX) >> BUCKET_SHIFT;
    const bz0 = Math.floor(v.minZ) >> BUCKET_SHIFT;
    const bz1 = Math.floor(v.maxZ) >> BUCKET_SHIFT;
    let near = false;
    for (let bx = Math.floor(v.minX) >> BUCKET_SHIFT; bx <= bx1 && !near; bx++) {
      for (let bz = bz0; bz <= bz1; bz++) {
        if (this.buckets.has(key(bx, bz))) { near = true; break; }
      }
    }
    if (!near) return false;
    const x1 = Math.ceil(v.maxX) - 1;
    const z1 = Math.ceil(v.maxZ) - 1;
    for (let z = Math.floor(v.minZ) + 1; z <= z1; z++) {
      for (let x = Math.floor(v.minX) + 1; x <= x1; x++) {
        if (this.tiles.has(key(x, z))) return true;
      }
    }
    return false;
  }
}
